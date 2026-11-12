// Build the map's data from RTD's public sources. See DESIGN.md, "Zero
// maintenance": everything about the network is discovered from RTD's own
// map and GTFS on every run, and a build that fails its checks writes nothing.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverLayers, downloadLayer } from './lib/arcgis.mjs';
import { clock, csvRows, lineEnds, lineShapes, loadGtfs, matchGtfs, MIDDAY, readCsv, representativeDates, riderNames, routeFrequency, tierOf } from './lib/gtfs.mjs';
import { RT_FEEDS, liveRoutes } from './lib/realtime.mjs';
import { coreBounds } from './lib/core.mjs';
import { directory } from './lib/directory.mjs';
import { labelPoints } from './lib/labels.mjs';
import { busNames } from './lib/busnames.mjs';
import { heading, stopLines } from './lib/stops.mjs';
import { FAR_UNTIL } from '../public/js/sizes.js';
import { FAR, endAtMarks, nearestOnTrack, sharedTrack, trackAt, trimToEnds } from './lib/sharedtrack.mjs';
import { stationService } from './lib/stations.mjs';
import { stationMarks } from './lib/stationmarks.mjs';
import { alongWalk, groupPlatforms, groupPoints, meters, platformMarks, walkPoint } from './lib/platforms.mjs';
import { busStretches } from './lib/stretches.mjs';
import { buildStreets } from './lib/streets.mjs';
import { BUILDING_R, terminalFootprints } from './lib/footprints.mjs';
import { extendLineToPlatforms, hallRoofs, platformsToMarks, stationStructures } from './lib/structures.mjs';
import { clipAtHalls, shortenAtHall, stopsOfHalls } from './lib/halls.mjs';
import { STREET_CLASSES } from '../public/js/frequency.js';

// The two fixed inputs: RTD's official system map and its published GTFS feed.
const EXPERIENCE = { portal: 'https://www.arcgis.com', id: '4a812ebf793646be945b7d58dcfbb794' };
const GTFS_URL = 'https://www.rtd-denver.com/files/gtfs/google_transit.zip';

// Where the data is written. RTD_DATA_OUT writes somewhere else instead (to
// try a change without touching the site's data), and RTD_GTFS_ZIP names a
// local copy of the GTFS feed to read, downloading it there first if it's
// missing. With neither set, the build reads RTD and writes public/data.
const OUT = process.env.RTD_DATA_OUT ? path.resolve(process.env.RTD_DATA_OUT) : path.resolve(import.meta.dirname, '../public/data');
const OUT_NAME = path.relative(path.resolve(import.meta.dirname, '..'), OUT).replace(/^\.\..*/, OUT);
const GTFS_CACHE = process.env.RTD_GTFS_ZIP ? path.resolve(process.env.RTD_GTFS_ZIP) : null;

// Each kind of layer we draw, recognized by its geometry and the fields it
// carries rather than by name. If RTD changes a schema enough that a role no
// longer matches exactly one layer, the build stops and the live map stays.
const ROLES = {
  routes: { geometry: 'esriGeometryPolyline', fields: ['ROUTE', 'NAME', 'TYPE', 'SERVICE'] },
  stations: { geometry: 'esriGeometryPoint', fields: ['NAME', 'RAIL_LINE'] },
  facilities: { geometry: 'esriGeometryPoint', fields: ['NAME', 'CLASS', 'AUTOS'] },
  stops: { geometry: 'esriGeometryPoint', fields: ['BSID', 'STOPNAME'] },
  flexride: { geometry: 'esriGeometryPolygon', fields: ['NAME', 'ROUTE'] },
  boundary: { geometry: 'esriGeometryPolygon', fields: ['BND'], without: ['DIRECTORNAME'] },
};

// About a meter, in degrees: plenty for drawing, and it keeps the files the
// map loads first small. Coordinates are rounded to match (5 decimals).
// Our own published site: where the last build's halls are, on a fresh
// checkout, for a station OpenStreetMap doesn't answer for.
const SITE = (process.env.RTD_SITE_URL ?? 'https://rtd-system-map.pages.dev').replace(/\/$/, '');
// A rail letter stands within this of its line (metres); letters sit up
// to about 20 m off the drawn track where lines share it.
const LETTER_ON = 30;
// A station is moved this far at most onto its lines in the far set, which
// packs tracks a few hundred metres apart (sharedtrack.mjs FAR).
const FAR_SNAP_METERS = 600;
// ...and not within this of a mark its line ends at, on the far side of it.
const LETTER_PAST = 150;
// ...and no nearer than this (px, at the zoom it comes in) to the mark of a
// station its line ends at.
const LETTER_CLEAR_PX = 24;
const SIMPLIFY = 0.00001;
// A stop within this of a terminal's hall (metres) and farther than
// HALL_STOP_LINE from every bus line drawn is shown with the hall.
const HALL_STOP_NEAR = 80;
const HALL_STOP_LINE = 30;
const PRECISION = 5;
// A station is moved onto its lines' track when it's at most this far away.
const SNAP_METERS = 200;
// Line ends this close together are one row of platforms, and the station's
// bar goes across them (Union Station's four commuter lines).
const ROW_METERS = 60;
// A hall roof whose middle is within this of the end of the platform (metres)
// is the roof the lines end under.
const ROOF_NEAR = 60;
// ...and it is over the track when its middle is at least this far short of
// the lines' end.
const ROOF_SHORT = 5;
// Phones open on the box holding this share of weekday service, east to west
// and north to south (scripts/lib/core.mjs).
const CORE_SHARE = 0.6;

// GTFS route types that are rail (basic and extended).
const isRail = (type) => ['0', '1', '2'].includes(type) || /^(1\d\d|4\d\d|9\d\d)$/.test(type);

const TRANSFORMS = {
  routes: (p) => ({ route: p.ROUTE, name: p.NAME, category: p.SERVICE }),
  // Which lines serve a station comes from GTFS, not RAIL_LINE (see below).
  stations: (p) => ({ id: p.PID, name: p.NAME, label: stationLabel(p.NAME) }),
  facilities: (p) => ({ id: p.PID, name: p.NAME, class: p.CLASS, spaces: Number(p.AUTOS) || 0, fees: p.FEES ?? null }),
  stops: (p) => ({ id: String(p.BSID), name: p.STOPNAME, routes: p.ROUTES, dir: p.DIR }),
  // A zone's page, if RTD's layer ever carries one (today it has none).
  flexride: (p) => ({ name: p.NAME, route: p.ROUTE, url: Object.entries(p).find(([k, v]) => /^(url|link|web|website)$/i.test(k) && v)?.[1] ?? null }),
  boundary: () => ({}),
};

// The name a map label shows: without the "Station" every station shares, the
// way transit maps label them ("Peoria"), but keeping a name that is itself a
// station ("Union Station Transit Center" becomes "Union Station").
function stationLabel(name) {
  const short = name.replace(/\s+Transit Center$/i, '');
  return short !== name ? short : name.replace(/\s+Station$/i, '');
}

function assignRoles(layers) {
  return Object.fromEntries(
    Object.entries(ROLES).map(([role, want]) => {
      const matches = layers.filter(
        (l) =>
          l.geometryType === want.geometry &&
          want.fields.every((f) => l.fields.includes(f)) &&
          !(want.without ?? []).some((f) => l.fields.includes(f)),
      );
      if (matches.length !== 1) {
        const names = matches.map((l) => l.name).join(', ') || 'none';
        throw new Error(`Expected one ${role} layer in RTD's map, found ${matches.length} (${names})`);
      }
      return [role, matches[0]];
    }),
  );
}

async function main() {
  const started = Date.now();
  const previous = JSON.parse(await readFile(path.join(OUT, 'meta.json'), 'utf8').catch(() => 'null'));

  console.log("Reading RTD's map and downloading GTFS…");
  const [source, gtfs] = await Promise.all([discoverLayers(EXPERIENCE.portal, EXPERIENCE.id), loadGtfs(GTFS_URL, GTFS_CACHE)]);
  console.log(`  web map: ${source.webmap.title} (${source.webmap.id}), ${source.layers.length} layers`);
  const roles = assignRoles(source.layers);

  console.log('Downloading layers…');
  const geo = {};
  await Promise.all(
    Object.entries(roles).map(async ([role, layer]) => {
      const features = await downloadLayer(layer, {
        simplify: layer.geometryType === 'esriGeometryPoint' ? 0 : SIMPLIFY,
        precision: PRECISION,
      });
      geo[role] = features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: TRANSFORMS[role](f.properties) }));
      console.log(`  ${role}: ${features.length} from ${layer.name}${layer.where === '1=1' ? '' : ` where ${layer.where}`}`);
    }),
  );

  // Join RTD's map routes to GTFS. Map routes that share a code with a
  // FlexRide zone are on-demand service with no timetable; the zone layer
  // draws them, so they are left out of the route lines.
  const gtfsRoutes = readCsv(gtfs.text['routes.txt']);
  const flexCodes = new Set(geo.flexride.map((f) => f.properties.route));
  const flexLines = geo.routes.filter((f) => flexCodes.has(f.properties.route)).length;
  geo.routes = geo.routes.filter((f) => !flexCodes.has(f.properties.route));
  const drawn = new Set(geo.routes.map((f) => f.properties.route));
  const matches = new Map(); // RTD's map code -> its GTFS routes
  for (const { properties: p } of geo.routes) if (!matches.has(p.route)) matches.set(p.route, matchGtfs(p, gtfsRoutes, drawn));
  // From here on a route goes by the name riders know it by ("Bound"), and
  // keeps the map's code for it ("BOND") only so a search for the code finds it.
  const nameOf = riderNames(matches);
  const members = new Map(); // route -> its GTFS routes
  const groupOf = new Map(); // GTFS route_id -> route
  for (const { properties: p } of geo.routes) {
    const found = matches.get(p.route);
    if (nameOf.get(p.route) !== p.route) Object.assign(p, { code: p.route, route: nameOf.get(p.route) });
    members.set(p.route, found);
    for (const r of found) groupOf.set(r.route_id, p.route);
  }
  const renamed = [...nameOf].filter(([code, name]) => code !== name);
  const unmatched = [...members].filter(([, found]) => !found.length).map(([route]) => route);
  const notOnMap = gtfsRoutes.filter((r) => !groupOf.has(r.route_id)).map((r) => r.route_short_name || r.route_id);

  // Live: what RTD's realtime feeds call each route, learned from the trips
  // both feeds name (scripts/lib/realtime.mjs). A feed that's down teaches
  // nothing today and never fails the build.
  const live = await liveRoutes(gtfs.text, groupOf);

  console.log('Measuring frequency…');
  const timezone = readCsv(gtfs.text['agency.txt'])[0]?.agency_timezone || 'America/Denver';
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())}T00:00:00Z`);
  const dates = representativeDates(gtfs.text, today);
  // The same pass over stop_times keeps each drawn route's trips' stops, for
  // measuring bus frequency stretch by stretch below.
  const stopTimes = new Map();
  const frequency = routeFrequency(gtfs.text, dates, (id) => groupOf.get(id) ?? id, {
    stopTimes,
    keep: (t) => Boolean(t.shape_id && groupOf.has(t.route_id)),
  });
  for (const [kind, d] of Object.entries(dates)) console.log(`  typical ${kind}: ${d.date} (${d.services.join(', ')})`);

  for (const { properties: p } of geo.routes) {
    const found = members.get(p.route);
    const f = frequency.get(p.route) ?? {};
    const rail = found.length > 0 && found.every((r) => isRail(r.route_type));
    const color = rail && found.map((r) => r.route_color).find(Boolean);
    const textColor = rail && found.map((r) => r.route_text_color).find(Boolean);
    Object.assign(p, {
      gtfs: found.map((r) => r.route_short_name || r.route_id).join(' '),
      mode: rail ? 'rail' : 'bus',
      color: color ? `#${color}` : null,
      text_color: textColor ? `#${textColor}` : null,
      tier: found.length ? tierOf(f.weekday) : 'unknown',
      wk: f.weekday?.headway ?? null,
      sa: f.saturday?.headway ?? null,
      su: f.sunday?.headway ?? null,
      wk_trips: f.weekday?.trips ?? 0,
      sa_trips: f.saturday?.trips ?? 0,
      su_trips: f.sunday?.trips ?? 0,
      wk_first: f.weekday?.first ?? null,
      wk_last: f.weekday?.last ?? null,
    });
  }

  // Rail lines are drawn where their trains run, from GTFS shapes: RTD's
  // map draws some lines twice on slightly different paths, with tail track
  // and connecting spurs, which shared track can't be found on. Lines with no
  // shapes keep the map's geometry.
  const railLines = new Set(geo.routes.filter((f) => f.properties.mode === 'rail').map((f) => f.properties.route));
  const shapes = lineShapes(gtfs.text, (id) => (railLines.has(groupOf.get(id)) ? groupOf.get(id) : null), dates.weekday?.services);
  for (const f of geo.routes) {
    const paths = shapes.get(f.properties.route);
    if (f.properties.mode === 'rail' && paths) f.geometry = { type: 'MultiLineString', coordinates: paths.map(simplifyPath) };
  }
  console.log(`  rail drawn from GTFS shapes: ${[...shapes.keys()].sort().join(', ') || 'none'}`);

  // Stations: which have trains this week, on which lines, and when trains
  // return to the ones that don't.
  const service = stationService(gtfs.text, geo.stations, {
    today,
    isRailRoute: (r) => isRail(r.route_type),
    lineOf: (r) => groupOf.get(r.route_id) ?? (r.route_short_name || r.route_id),
  });
  geo.stations.forEach((f, i) => {
    const s = service.stations[i];
    Object.assign(f.properties, { served: s.served, lines: s.lines.join(' '), returns: s.returns });
  });
  const unserved = geo.stations.filter((f) => !f.properties.served);
  // Trains getting into position aren't a line riders can use, so the map
  // doesn't draw or list them.
  const positioning = new Set(service.positioning);
  geo.routes = geo.routes.filter((f) => !(f.properties.mode === 'rail' && positioning.has(f.properties.route)));

  // The shapes each rail station has in OpenStreetMap: its platforms, the
  // canopy over them and its station building, read from tags and where the
  // station's platform stops are (scripts/lib/structures.mjs; DESIGN.md,
  // "Stations"). Nothing about a station is written down: a station draws
  // what OSM has, and a station whose box OSM would not answer for keeps last
  // build's shapes.
  // This folder's, or on a fresh checkout (the daily build) the published
  // site's, as the halls do below.
  const structuresPrevious =
    (await readFile(path.join(OUT, 'structures.geojson'), 'utf8').then((t) => JSON.parse(t).features).catch(() => null)) ??
    (await fetch(`${SITE}/data/structures.geojson`, { signal: AbortSignal.timeout(20_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.features ?? [])
      .catch(() => []));
  const shapesAt = await stationStructures({
    stations: geo.stations,
    platforms: service.stations.map((s) => s.platforms),
    previous: structuresPrevious,
  });
  console.log(
    `  rail station shapes: ${shapesAt.byStation.size} stations (${[...shapesAt.byStation.values()].filter((s) => s.building).length} with a station building, ${[...shapesAt.byStation.values()].filter((s) => s.canopies.length).length} with a canopy)${shapesAt.failed ? `, ${shapesAt.failed} not looked up` : ''}`,
  );

  // Bus routes in stretches, each with the frequency of the trips that run
  // along it, so a leg only a few trips take isn't drawn as frequent.
  const buses = geo.routes.filter((f) => f.properties.mode === 'bus');
  const levels = new Map(geo.routes.map((f) => [f.properties.route, { ...f.properties }]));
  const routeCount = geo.routes.length;
  const split = busStretches(buses, gtfs.text, dates, (id) => groupOf.get(id) ?? id, { stopTimes });
  // Rail is drawn whole; its route values are its own.
  const rails = geo.routes.filter((f) => f.properties.mode !== 'bus');
  for (const { properties: p } of rails) Object.assign(p, { route_tier: p.tier, route_wk: p.wk });
  geo.routes = [...split.features, ...rails];
  const splitRoutes = split.report.filter((r) => r.stretches > 1);
  console.log(`  bus routes in stretches: ${splitRoutes.length} of ${split.report.length} split, ${split.features.length} stretches`);
  console.log(`    ${splitRoutes.map((r) => `${r.route} ${r.stretches}`).join(', ')}`);
  const poorlyCovered = split.report.filter((r) => r.uncovered > 0.25);
  if (poorlyCovered.length) {
    console.log(`  bus routes mostly not on their GTFS shapes: ${poorlyCovered.map((r) => `${r.route} ${Math.round(r.uncovered * 100)}%`).join(', ')}`);
  }

  // Checks. Any failure stops the build before anything is written.
  const counts = Object.fromEntries(Object.entries(geo).map(([role, fs]) => [role, fs.length]));
  counts.routes = routeCount;
  const rail = geo.routes.filter((f) => f.properties.mode === 'rail');
  counts.rail = rail.length;
  counts.stations_served = geo.stations.length - unserved.length;
  const problems = [];
  for (const [role, n] of Object.entries(counts)) {
    if (!n) problems.push(`No ${role} downloaded`);
    const before = previous?.counts?.[role];
    if (before && n < before * 0.7) problems.push(`${role} dropped from ${before} to ${n}`);
  }
  const matchedShare = 1 - unmatched.length / members.size;
  if (matchedShare < 0.95) problems.push(`Only ${Math.round(matchedShare * 100)}% of map routes match GTFS (unmatched: ${unmatched.join(', ')})`);
  for (const f of rail) if (!f.properties.color) problems.push(`Rail line ${f.properties.route} has no color in GTFS`);
  if (counts.stations_served < geo.stations.length / 2) {
    problems.push(`Only ${counts.stations_served} of ${geo.stations.length} stations matched GTFS rail service`);
  }
  if (problems.length) {
    console.error(`\nBuild checks failed; ${OUT_NAME} was left as it was:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  // How many routes run at each tier somewhere along them.
  const tiers = {};
  for (const tier of new Set(geo.routes.map((f) => f.properties.tier))) {
    tiers[tier] = new Set(geo.routes.filter((f) => f.properties.tier === tier).map((f) => f.properties.route)).size;
  }

  // Rail on shared track side by side, then where the map names each line
  // from far out: signs at the ends of rail lines, tags on frequent buses.
  // Each line stops at its end stations (no tail track), and each station
  // sits on its lines' track: RTD's points can be off it by a platform's width.
  // Where each station's platform stops are, for running lines along their
  // platforms (extendLineToPlatforms).
  const atStop = service.stations.map((s) => (s.platforms ?? []).map((p) => p.at));
  for (const f of rail) {
    const ends = service.ends[f.properties.route];
    if (!ends) continue;
    const trimmed = trimToEnds(partsOf(f.geometry), ends.map((i) => geo.stations[i].geometry.coordinates));
    // Where OSM draws the platforms, each line runs along the one it stops at
    // to the platform's real end, so the lines fill the train hall and the
    // light-rail platforms rather than stopping at one point
    // (scripts/lib/structures.mjs, extendLineToPlatforms).
    f.geometry = { type: 'MultiLineString', coordinates: extendLineToPlatforms(trimmed, ends, atStop, shapesAt.byStation) };
  }
  const { pieces, letters } = sharedTrack(
    rail,
    geo.stations.map((f) => f.geometry.coordinates),
  );
  // The far set, drawn below zoom 11 (sharedtrack.mjs FAR): tracks a few
  // hundred metres apart packed as one, rounded over hundreds of metres, so
  // lines come into Union Station as one calm pack, not a knot of jogs
  // (#115). Its letters stand for the near set's below 11.
  const far = sharedTrack(
    rail,
    geo.stations.map((f) => f.geometry.coordinates),
    FAR,
  );
  geo.routes = [...geo.routes.filter((f) => f.properties.mode !== 'rail'), ...pieces];
  for (const f of geo.stations) {
    if (!f.properties.served) continue;
    const lines = new Set(f.properties.lines.split(' '));
    const at = nearestOnTrack(pieces.filter((p) => lines.has(p.properties.route)), f.geometry.coordinates, SNAP_METERS);
    if (at) f.geometry = { type: 'Point', coordinates: at };
  }
  // A rail station's own mark and name belong beside its station building,
  // at the platform group nearest it: Union Station's are on the train hall,
  // where its building is, not at the light-rail tip RTD's single point falls
  // on. The group comes from the GTFS child stops, the building from OSM; a
  // station with no building keeps RTD's point.
  for (let i = 0; i < geo.stations.length; i++) {
    const f = geo.stations[i];
    const shapes = shapesAt.byStation.get(i);
    if (!f.properties.served || !shapes?.building || !shapes.centre) continue;
    const groups = groupPlatforms(service.stations[i].platforms ?? []).map(meanPoint).sort((a, b) => meters(a, shapes.centre) - meters(b, shapes.centre));
    if (!groups.length) continue;
    const lines = new Set(f.properties.lines.split(' '));
    const home = nearestOnTrack(pieces.filter((p) => lines.has(p.properties.route)), groups[0], SNAP_METERS);
    if (home) f.geometry = { type: 'Point', coordinates: home };
  }
  // A station where several lines end draws its bar across the row they end
  // in. Each line runs to the end of its own platform; at a terminal the
  // platforms stand side by side, so the lines end in one row there, and the
  // mark belongs on it, not at the platforms' middle nor at the end RTD's
  // single point falls on. Union Station's four commuter lines end together
  // at the train hall's southwest end.
  // The lines that end at a station (by its index).
  const endingAt = (i) => new Set(Object.entries(service.ends).filter(([, ends]) => ends.includes(i)).map(([route]) => route));
  {
    const endsAt = new Map();
    for (const f of rail) {
      const ends = service.ends[f.properties.route];
      if (!ends) continue;
      const parts = partsOf(f.geometry);
      for (const i of ends) {
        const ref = shapesAt.byStation.get(i)?.centre ?? geo.stations[i].geometry.coordinates;
        let near = null;
        for (const part of parts) {
          for (const p of [part[0], part.at(-1)]) {
            const d = meters(p, ref);
            if (d <= BUILDING_R && (!near || d < near.d)) near = { p, d };
          }
        }
        if (!near) continue;
        if (!endsAt.has(i)) endsAt.set(i, []);
        endsAt.get(i).push({ p: near.p, d: near.d });
      }
    }
    for (const [i, ends] of endsAt) {
      // A station a line ends at is marked at the line's end, one line or
      // several, whether or not other lines run on through it: the line runs
      // the length of its platform and ends at the mark. A mark left back at
      // the stops had the line cut there, short of the platform drawn beside
      // it, and the rest of the platform showed past the mark like the ghost
      // of the line (Lincoln, where T ends and E and R run on).
      // The largest group of ends within a row's width is the row.
      const rows = [];
      for (const t of ends) {
        const row = rows.find((r) => r.some((q) => meters(q.p, t.p) <= ROW_METERS));
        if (row) row.push(t);
        else rows.push([t]);
      }
      rows.sort((a, b) => b.length - a.length || Math.min(...a.map((t) => t.d)) - Math.min(...b.map((t) => t.d)));
      const at = [0, 1].map((c) => rows[0].reduce((s, t) => s + t.p[c], 0) / rows[0].length);
      const f = geo.stations[i];
      const lines = new Set(f.properties.lines.split(' '));
      const on = nearestOnTrack(pieces.filter((p) => lines.has(p.properties.route)), at, SNAP_METERS);
      if (!on || meters(on, at) > ROW_METERS) continue;
      f.geometry = { type: 'Point', coordinates: on };
      // Under the roof: where a hall's roof stands over the end of the
      // platform (its middle within ROOF_NEAR of the lines' end), the mark is
      // on the track abreast of the roof's middle, and the lines are cut
      // there (endAtMarks). Run to the platform's very end, the airport's A
      // line came out past the tip of its canopy.
      const ending = endingAt(i);
      const mine = pieces.filter((p) => ending.has(p.properties.route));
      // The largest such roof that is over the track: its middle is abreast
      // of a point short of the lines' end, not level with the end or past
      // it (the hotel's roof at the airport, beyond the buffers).
      for (const roof of hallRoofs(shapesAt.byStation.get(i))) {
        if (meters(roof, on) > ROOF_NEAR) continue;
        const under = nearestOnTrack(mine, roof, SNAP_METERS);
        if (!under || meters(under, on) < ROOF_SHORT || meters(under, on) > ROOF_NEAR) continue;
        console.log(`  ${f.properties.name}: its lines end under the roof, ${Math.round(meters(under, on))} m short of the platform's end`);
        f.geometry = { type: 'Point', coordinates: under };
        break;
      }
    }
  }
  // The bus stations' halls (see "Bus stations drawn as their halls" below),
  // found here because a hall between a station's platform groups says where
  // their marks go. The station points are as they were when the halls were
  // found further down: the walk's move comes after.
  const busStations = geo.facilities.flatMap((f, i) => (['BUS', 'STN'].includes(f.properties.class) ? [i] : []));
  const nearRail = (q) => geo.stations.some((s) => Math.hypot((s.geometry.coordinates[0] - q[0]) * 85300, (s.geometry.coordinates[1] - q[1]) * 110540) < 100);
  const hallsBefore =
    (await readFile(path.join(OUT, 'terminals.geojson'), 'utf8').then((t) => JSON.parse(t).features).catch(() => null)) ??
    (await fetch(`${SITE}/data/terminals.geojson`, { signal: AbortSignal.timeout(20_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.features ?? [])
      .catch(() => []));
  const footprints = await terminalFootprints({
    facilities: geo.facilities,
    indexes: busStations,
    stops: geo.stops,
    previous: hallsBefore,
    busOnly: new Set(busStations.filter((i) => nearRail(geo.facilities[i].geometry.coordinates))),
  });
  geo.terminals = [...footprints.terminals.values()].map((t) => t.feature);
  const halls = geo.terminals.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((rings) => rings[0]));
  // The walk between a station's platform groups runs straight along the
  // hall between them (platforms.mjs, walkAxis; DESIGN.md, "Platform
  // groups"): the station's own mark moves onto that line, at its own group,
  // and the other groups' marks are placed on it too (groupPoints,
  // platformMarks). Union Station's two marks stand at the two ends of its
  // bus concourse, and the walk runs down the middle of it.
  const walks = new Map();
  geo.stations.forEach((f, i) => {
    if (!f.properties.served) return;
    const at = walkPoint(f, service.stations[i].platforms ?? [], pieces, endingAt(i), halls);
    if (!at) return;
    console.log(`  ${f.properties.name}: marks in line with the hall between its platforms (its own moved ${Math.round(meters(f.geometry.coordinates, at))} m)`);
    f.geometry = { type: 'Point', coordinates: [at[0], at[1]] };
    walks.set(i, at.axis);
  });
  // A line ends at its end station's mark (DESIGN.md, "Stations"; #75): the
  // station's own mark, or the mark of the platform group the line stops
  // at. Where the line ran on along its platform past the mark, it is cut
  // where the mark crosses it, before the ends are signed and the marks
  // drawn from the track. A group has a mark of its own only where the
  // station has more than one and it is not the group the station's own
  // mark stands for (platformMarks); a station with one group is drawn at
  // its own point, which can be tens of metres from its stops (the airport).
  {
    const groups = groupPoints(geo.stations, service.stations.map((s) => s.platforms ?? []), pieces, endingAt, halls);
    const marks = new Map();
    for (const [route, ends] of Object.entries(service.ends)) {
      const at = [];
      for (const i of ends) {
        if (!geo.stations[i]?.properties.served) continue;
        const here = geo.stations[i].geometry.coordinates;
        at.push(here);
        const mine = groups.filter((g) => g.station === i);
        if (mine.length < 2) continue;
        const own = mine.reduce((best, g) => (meters(here, g.at) < meters(here, best.at) ? g : best));
        for (const g of mine) if (g !== own && g.lines.includes(route)) at.push(g.at);
      }
      if (at.length) marks.set(route, at);
    }
    const kept = endAtMarks(pieces, marks);
    pieces.splice(0, pieces.length, ...kept);
    geo.railfar = endAtMarks(far.pieces, marks);
    // The way back along a line from the mark it ends at ([east, north], a
    // unit vector): from the line's end there to the point 20 m along it.
    const inwardAt = (routes, at) => {
      // The line's end at the mark is the piece end nearest it.
      let best = null;
      for (const piece of pieces) {
        if (!routes.includes(piece.properties.route)) continue;
        for (const part of partsOf(piece.geometry)) {
          for (const path of [part, [...part].reverse()]) {
            const d = meters(path[0], at);
            if (d <= 30 && (!best || d < best.d)) best = { d, path };
          }
        }
      }
      if (!best) return null;
      const { path } = best;
      let k = 1;
      while (k < path.length - 1 && meters(path[0], path[k]) < 20) k += 1;
      const [dx, dy] = [(path[k][0] - path[0][0]) * 111320 * Math.cos((at[1] * Math.PI) / 180), (path[k][1] - path[0][1]) * 110540];
      const l = Math.hypot(dx, dy);
      return l > 1 ? [dx / l, dy / l] : null;
    };
    // A platform is drawn only as far as the mark its lines end at
    // (structures.mjs, platformsToMarks): each mark every one of whose lines
    // ends there, with the way back along those lines.
    {
      const ends = [];
      for (const i of new Set(Object.values(service.ends).flat())) {
        const f = geo.stations[i];
        if (!f?.properties.served) continue;
        const here = f.geometry.coordinates;
        const ending = endingAt(i);
        const mine = groups.filter((g) => g.station === i);
        const own = mine.length ? mine.reduce((best, g) => (meters(here, g.at) < meters(here, best.at) ? g : best)) : null;
        for (const g of mine) {
          if (!g.lines.every((route) => ending.has(route))) continue;
          const at = g === own ? here : g.at;
          const inward = inwardAt(g.lines, at);
          if (inward) ends.push({ station: f.properties.id, at, inward });
        }
      }
      const before = shapesAt.features.length;
      const cut = platformsToMarks(shapesAt.features, ends);
      shapesAt.features.splice(0, before, ...cut);
      const gone = shapesAt.features.filter((x) => !cut.includes(x) && !cut.some((c) => c.properties === x.properties));
      console.log(`  platforms and roofs drawn as far as the mark their lines end at: ${ends.length} marks; wholly past a mark, not drawn: ${before - cut.length}${gone.length ? ` (${gone.map((x) => `${x.properties.name} ${x.properties.kind}`).join(', ')})` : ''}`);
    }
    geo.routes = [...geo.routes.filter((f) => f.properties.mode !== 'rail'), ...pieces];
    // A letter names the line it stands on. The letters were placed on the
    // lines before they were cut: one left past the mark, where its line no
    // longer runs (W and E beyond Union Station's light-rail mark), goes.
    // Past the mark: within LETTER_PAST of a mark its line ends at, on the
    // side the line doesn't come from. (Its distance from the line alone
    // doesn't say: a letter 20 m past a cut end is as near the line as one
    // on a track drawn in a pack.)
    const pastMark = (f) =>
      (marks.get(f.properties.route) ?? []).some((m) => {
        const p = f.geometry.coordinates;
        if (meters(m, p) > LETTER_PAST) return false;
        const inward = inwardAt([f.properties.route], m);
        if (!inward) return false;
        return (p[0] - m[0]) * 111320 * Math.cos((m[1] * Math.PI) / 180) * inward[0] + (p[1] - m[1]) * 110540 * inward[1] < -2;
      });
    const onLine = (f) => !pastMark(f) && nearestOnTrack(pieces.filter((p) => p.properties.route === f.properties.route), f.geometry.coordinates, LETTER_ON) !== null;
    const stranded = letters.filter((f) => !onLine(f));
    if (stranded.length) {
      letters.splice(0, letters.length, ...letters.filter(onLine));
      console.log(`  rail letters left past a line's end, not drawn: ${stranded.length} (${[...new Set(stranded.map((f) => f.properties.route))].join(', ')})`);
    }
    // A letter up against the mark its line ends at crowds it (the W touched
    // Union Station's light-rail mark once the mark stood at the line's end):
    // one within LETTER_CLEAR_PX of such a mark, at the zoom the letter comes
    // in, goes. The marks have moved since the letters were spaced from them.
    const pxMetres = (zoom, lat) => (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
    const crowds = (f) =>
      (marks.get(f.properties.route) ?? []).some((m) => meters(m, f.geometry.coordinates) <= LETTER_CLEAR_PX * pxMetres(f.properties.from, m[1]));
    const crowding = letters.filter(crowds);
    if (crowding.length) {
      letters.splice(0, letters.length, ...letters.filter((f) => !crowds(f)));
      console.log(`  rail letters up against the mark their line ends at, not drawn: ${crowding.length} (${[...new Set(crowding.map((f) => f.properties.route))].join(', ')})`);
    }
  }
  // Wider screens open on the routes drawn at full strength from far out,
  // rail and buses every 30 minutes or better, not on the long reach of a few
  // commuter routes.
  const network = bbox(geo.routes.filter((f) => f.properties.mode === 'rail' || ['frequent', 'every30'].includes(f.properties.tier)));
  const { labels, signBoxes, endNames, hubs } = labelPoints(geo.routes, geo.stations, service.ends, service.headsigns, network);
  // Below 11 the letters stand on the far set's lines: the far set's first
  // set (from the overview to 11), the near set's from 11.
  const farLetters = far.letters.filter((f) => f.properties.to <= FAR_UNTIL && nearestOnTrack(geo.railfar.filter((p) => p.properties.route === f.properties.route), f.geometry.coordinates, LETTER_ON) !== null);
  geo.labels = [...labels, ...letters.filter((f) => f.properties.from >= FAR_UNTIL), ...farLetters];
  const endStations = new Set(Object.values(service.ends).flat());
  geo.stations.forEach((f, i) => {
    // `end`: a rail line ends here (Union Station included). From the metro
    // zooms these are the stations named: where the trains go.
    f.properties.end = endStations.has(i);
    // `hub`: more lines end here than get a sign (Union Station). Its name
    // may sit further out, since the lines around it leave no room beside it.
    f.properties.hub = hubs.has(i);
    Object.assign(f.properties, f.properties.served ? trackAt(pieces, f.geometry.coordinates) : { span: 1, bearing: 0 });
    // A mark on the walk between its station's platform groups lies along it,
    // like the mark at the walk's other end.
    if (walks.has(i)) f.properties.bearing = alongWalk(f.properties.bearing, walks.get(i));
  });

  // What the panels say about each route and station. Stop route codes are
  // the map's routes or GTFS route names that belong to one.
  const byCode = new Map(gtfsRoutes.flatMap((r) => [r.route_id, r.route_short_name].filter(Boolean).map((c) => [c, groupOf.get(r.route_id)])));
  // RTD's stop layer may use the map's code for a route that goes by its
  // timetable name here.
  for (const [code, name] of renamed) byCode.set(code, name);
  const busLines = new Set(geo.routes.filter((f) => f.properties.mode === 'bus').map((f) => f.properties.route));
  const index = directory({
    routes: geo.routes,
    stations: geo.stations,
    stops: geo.stops,
    facilities: geo.facilities,
    service,
    busEnds: lineEnds(gtfs.text, (id) => (busLines.has(groupOf.get(id)) ? groupOf.get(id) : null), dates.weekday?.services),
    lineOf: (code) => (busLines.has(code) ? code : byCode.get(code) ?? null),
    levels,
    urls: new Map([...members].map(([route, found]) => [route, found.map((r) => r.route_url).find(Boolean)]).filter(([, url]) => url)),
  });
  // Stations know their buses too, so a highlighted bus keeps the stations
  // it stops at.
  // And how many routes meet there, trains and buses together: the stations
  // people change at are the ones named first (network.js, 'station-labels').
  const count = (list) => (list ? String(list).split(' ').filter(Boolean).length : 0);
  index.stations.forEach((s, i) => {
    const p = geo.stations[i].properties;
    p.buses = s.buses;
    p.links = count(p.lines) + count(p.buses);
  });
  // How each station is marked from far out (DESIGN.md, "Stations"): the
  // tick's span and direction where the lines it crosses run together, the
  // zoom it's drawn from where a stronger station is too near, and the hub.
  // After `links`, which breaks ties.
  stationMarks(geo.stations, pieces).forEach((m, i) => {
    Object.assign(geo.stations[i].properties, { tick: m.tick, tickBearing: m.tickBearing, tickFrom: m.from, meet: m.meet });
  });
  // Below FAR_UNTIL the ticks stand on the far set's lines: each served
  // station moved onto its lines there, with its tick worked out on them.
  {
    const far = geo.stations.map((f) => {
      const lines = new Set(String(f.properties.lines ?? '').split(' '));
      const own = geo.railfar.filter((p) => lines.has(p.properties.route));
      const at = f.properties.served ? nearestOnTrack(own, f.geometry.coordinates, FAR_SNAP_METERS) : null;
      const properties = { ...f.properties, ...(at ? trackAt(geo.railfar, at) : {}) };
      return { ...f, properties, geometry: at ? { type: 'Point', coordinates: at } : f.geometry };
    });
    stationMarks(far, geo.railfar).forEach((m, i) => Object.assign(far[i].properties, { tick: m.tick, tickBearing: m.tickBearing, tickFrom: m.from, meet: m.meet }));
    geo.stationsfar = far.filter((f) => f.properties.served);
  }
  // Where a station's lines stop in places too far apart for one mark to
  // stand for them (DESIGN.md, "Stations"): a station mark at each platform
  // group, joined to the station's own mark by a thin line. The groups come
  // from the GTFS child stops and the lines that call at them, so a station
  // whose platforms are one place gets nothing extra, and one that gains or
  // loses a platform group does so with no change here.
  geo.platforms = platformMarks(
    geo.stations,
    service.stations.map((s) => s.platforms),
    pieces,
    endingAt,
    halls,
  );
  const apart = [...new Set(geo.platforms.filter((f) => f.properties.kind === 'mark').map((f) => f.properties.id))];
  if (apart.length) {
    const labels = new Map(geo.stations.map((f) => [f.properties.id, f.properties.label]));
    console.log(`  stations marked at more than one platform group: ${apart.map((id) => labels.get(id)).join(', ')}`);
  }

  // Names along the streets buses share, one run per street.
  geo.busnames = busNames(geo.routes.filter((f) => f.properties.mode === 'bus'), { precision: PRECISION });
  // The streets themselves, each drawn once, by the combined frequency of
  // every route along it (DESIGN.md, "Bus routes"; scripts/lib/streets.mjs).
  // RTD's lines joined where they meet into one street graph, each street
  // drawn once (scripts/lib/streets.mjs, #80). The report says how many
  // loose ends the drawing has, and how many of them have another line of
  // their own route within 30 m: a terminal loop, or a gap in RTD's lines.
  // Stops name the lines the map draws, families as their map route (FF1 is
  // FF), and which way their buses head.
  const drawnLines = new Set(geo.routes.map((f) => f.properties.route));
  const lineAt = (code) => (drawnLines.has(code) ? code : drawnLines.has(byCode.get(code)) ? byCode.get(code) : null);
  for (const { properties: p } of geo.stops) Object.assign(p, { lines: stopLines(p.routes, lineAt), heading: heading(p.dir) });
  // A stop only trains call at is a platform of its station, which the
  // station's mark stands for: it isn't drawn as a stop, the small dot the
  // key calls a bus stop (it stood on the rail line beside the mark).
  {
    const railLines = new Set(geo.routes.filter((f) => f.properties.mode === 'rail').map((f) => f.properties.route));
    let platforms = 0;
    for (const { properties: p } of geo.stops) {
      const lines = String(p.lines ?? '').split(' ').filter(Boolean);
      if (!lines.length || !lines.every((l) => railLines.has(l))) continue;
      p.platform = 1;
      platforms += 1;
    }
    console.log(`  stops only trains call at (platforms, not drawn as stops): ${platforms}`);
  }
  // Bus stations drawn as their halls (DESIGN.md, "Bus routes", "Terminals";
  // scripts/lib/footprints.mjs, #82): each of RTD's bus-station facilities
  // (class BUS or STN) as the hall its gates stand in, from OpenStreetMap,
  // above ground or below; at a rail station only a bus hall or bus
  // platforms. A bus that boards in a hall is drawn only as far as its edge:
  // the way round the block to its ramp is the approach, not the route
  // (shortenAtHall), and no line is drawn through a hall (scripts/lib/halls.mjs).
  // Last build's halls stand in for a station OSM doesn't answer for: this
  // folder's, or on a fresh checkout (the daily build) the published site's.
  const served = new Set(geo.stops.filter((f) => f.properties.terminal).flatMap((f) => String(f.properties.lines ?? '').split(' ').filter(Boolean)));
  geo.routes = shortenAtHall(geo.routes, halls, served);
  console.log(`  bus terminals drawn as their halls: ${geo.terminals.map((f) => `${f.properties.name} (${f.properties.kind}${f.properties.underground ? ', below ground' : ''}, ${f.properties.gates} gates)`).join(', ') || 'none'}`);
  // Said loudly and recorded (meta.json, `halls`): a hall drawn from the last
  // build, or lost, is OpenStreetMap not answering, not a change in the place.
  const hallReport = { drawn: geo.terminals.map((f) => f.properties.name), fellBack: footprints.fellBack, lost: footprints.lost };
  if (hallReport.fellBack.length) console.log(`  HALLS FROM THE LAST BUILD (OpenStreetMap didn't answer): ${hallReport.fellBack.join(', ')}`);
  if (hallReport.lost.length) console.log(`  HALLS NOT DRAWN (OpenStreetMap didn't answer, and no last build to draw them from): ${hallReport.lost.join(', ')}`);
  // The rail stations' shapes, and the roofs over the halls, drawn as one
  // layer: platforms, canopies and station buildings (network.js, 'structures').
  geo.structures = [...shapesAt.features, ...footprints.canopies];
  const built = buildStreets(geo.routes.filter((f) => f.properties.mode === 'bus'), split.loads, {
    precision: PRECISION,
    places: [...geo.stations, ...geo.facilities].map((f) => f.geometry.coordinates),
    stops: geo.stops.map((f) => f.geometry.coordinates),
  });
  geo.streets = built.streets;
  // No line through a hall: each ends where it meets one, where its buses go in.
  geo.streets = clipAtHalls(geo.streets, halls, { split: true });
  geo.routes = geo.routes.flatMap((f) => (f.properties.mode === 'bus' ? clipAtHalls([f], halls) : [f]));
  // A stop by a hall that no line reaches any more (it stood on the way round
  // to the ramp, which isn't drawn) goes with the hall's own stops. Measured
  // against the streets, which are the bus lines the page draws.
  const hallStops = stopsOfHalls(geo.stops, halls, geo.streets.map((f) => f.geometry.coordinates), { near: HALL_STOP_NEAR, line: HALL_STOP_LINE });
  if (hallStops) console.log(`  stops by a hall with no line left to stand on, shown with the hall: ${hallStops}`);
  const streetGraph = { nodes: built.report.nodes, edges: built.report.edges, ends: built.report.ends, nearOwn: built.report.nearOwn };
  const streetKm = (cls) => geo.streets.filter((f) => f.properties.cls === cls).reduce((a, f) => a + lengthKm(f.geometry.coordinates), 0);
  const classes = Object.fromEntries(STREET_CLASSES.map((c) => [c.id, { streets: geo.streets.filter((f) => f.properties.cls === c.id).length, km: Math.round(streetKm(c.id) * 10) / 10 }]));
  // FlexRide zones link to their page where GTFS has one.
  const urlOf = new Map(gtfsRoutes.flatMap((r) => [r.route_id, r.route_short_name].filter(Boolean).map((c) => [c, r.route_url || null])));
  for (const { properties: p } of geo.flexride) p.url = p.url || urlOf.get(p.route) || null;
  const railEnds = (route) => {
    const ends = service.ends[route];
    if (!ends) return null;
    const names = ends.map((i) => endNames.get(i) ?? geo.stations[i].properties.label);
    const goes = index.routes.find((r) => r.route === route)?.goes;
    const at = geo.stations[ends[0]].geometry.coordinates;
    const flipped = goes?.length === 2 && goes[1].at?.[0] === at[0] && goes[1].at?.[1] === at[1];
    return flipped ? names.reverse() : names;
  };
  const feedInfo = readCsv(gtfs.text['feed_info.txt'])[0] ?? {};
  const meta = {
    built: new Date().toISOString(),
    sources: {
      experience: source.experience,
      webmap: source.webmap,
      layers: Object.fromEntries(
        Object.entries(roles).map(([role, l]) => [role, { url: l.url, name: l.name, where: l.where, lastEditDate: l.lastEditDate }]),
      ),
      gtfs: {
        url: GTFS_URL,
        sha256: gtfs.sha256,
        bytes: gtfs.bytes,
        version: feedInfo.feed_version ?? null,
        start: feedInfo.feed_start_date ?? null,
        end: feedInfo.feed_end_date ?? null,
      },
    },
    dates: Object.fromEntries(Object.entries(dates).map(([k, d]) => [k, d.date])),
    // The hours frequency is measured over, so the page can say so.
    window: { from: clock(MIDDAY[0]), to: clock(MIDDAY[1]) },
    // What the page needs before any GeoJSON arrives: where to open the map,
    // and the rail lines for the legend.
    bounds: {
      routes: bbox(geo.routes),
      network,
      // Phones open on the middle of the service (trips times distance),
      // zoomed in far enough to read.
      core: coreBounds(geo.routes, CORE_SHARE),
      // The stations and the signs naming the lines' ends.
      stations: bbox([...geo.stations, ...signBoxes]),
    },
    // Each line's ends are named as its end signs name them, in the order
    // its directory entry reads them.
    rail: [...new Map(rail.map((f) => [f.properties.route, f.properties])).values()]
      .sort((a, b) => a.route.localeCompare(b.route, 'en', { numeric: true }))
      .map((p) => ({ ...p, ends: railEnds(p.route) })),
    counts,
    tiers,
    // How much street is drawn in each frequency class (frequency.js).
    classes,
    streetGraph,
    halls: hallReport,
    // The Live relay's feeds, and the realtime route ids that belong to a map
    // route under another name (public/js/realtime.js, routeOf).
    live: { feeds: RT_FEEDS, routes: live.routes },
    stations: {
      unserved: unserved.map((f) => ({ name: f.properties.name, returns: f.properties.returns })),
      gtfsRailStationsNotOnMap: service.unmatched,
    },
    positioningOnly: service.positioning,
    unmatched: { mapRoutesNotInGtfs: unmatched, gtfsRoutesNotOnMap: notOnMap },
    families: Object.fromEntries([...members].filter(([, f]) => f.length > 1).map(([route, f]) => [route, f.map((r) => r.route_short_name || r.route_id)])),
    // Routes shown by their timetable name: RTD's map code -> that name.
    renamed: Object.fromEntries(renamed),
  };

  if (!geo.busnames.length || !geo.streets.length) {
    console.error(`\nBuild checks failed; ${OUT_NAME} was left as it was:\n  - No bus ${geo.busnames.length ? 'streets' : 'name runs'} built`);
    process.exit(1);
  }
  counts.busnames = geo.busnames.length;
  counts.streets = geo.streets.length;
  counts.terminals = geo.terminals.filter((f) => !f.properties.underground).length;
  counts.terminals_under = geo.terminals.filter((f) => f.properties.underground).length;
  counts.structures = geo.structures.length;

  // Write to a fresh folder, then swap it in, so a crash mid-write can't leave
  // half a dataset behind.
  const next = `${OUT}.next`;
  await rm(next, { recursive: true, force: true });
  await mkdir(next, { recursive: true });
  for (const [role, features] of Object.entries(geo)) {
    await writeFile(path.join(next, `${role}.geojson`), JSON.stringify({ type: 'FeatureCollection', features }));
  }
  await writeFile(path.join(next, 'meta.json'), JSON.stringify(meta, null, 2));
  await writeFile(path.join(next, 'directory.json'), JSON.stringify(index));
  await rm(OUT, { recursive: true, force: true });
  await rename(next, OUT);

  console.log(`\nWrote ${OUT_NAME} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`  ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  console.log(`  tiers: ${Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  streets by class: ${Object.entries(classes).map(([k, v]) => `${k} ${v.streets} (${v.km} km)`).join(', ')}`);
  console.log(`  street graph: ${streetGraph.nodes} nodes, ${streetGraph.edges} edges, ${geo.streets.length} streets; ${streetGraph.ends} loose ends, ${streetGraph.nearOwn} within 30 m of their own route's line`);
  console.log(`  ${flexLines} FlexRide outlines in the route layer left to the FlexRide zones`);
  if (unserved.length) {
    const list = unserved.map((f) => `${f.properties.name}${f.properties.returns ? ` (returns ${f.properties.returns})` : ''}`);
    console.log(`  stations with no trains this week: ${list.join(', ')}`);
  }
  if (service.unmatched.length) console.log(`  GTFS rail stations not on RTD's map: ${service.unmatched.join(', ')}`);
  if (positioning.size) console.log(`  not drawn, one-way trains on other lines' track: ${service.positioning.join(', ')}`);
  if (renamed.length) console.log(`  shown by their timetable name: ${renamed.map(([code, name]) => `${code} as ${name}`).join(', ')}`);
  if (unmatched.length) console.log(`  map routes not in GTFS: ${unmatched.join(', ')}`);
  if (notOnMap.length) console.log(`  GTFS routes not on RTD's map: ${notOnMap.join(', ')}`);
  console.log(`  realtime route names learned from ${live.seen} trips: ${live.learned.map((id) => `${id} is ${live.routes[id]}`).join(', ') || 'none'}`);
  for (const line of live.conflicts) console.log(`  realtime route name in doubt, ${line}`);
  for (const line of live.failed) console.log(`  realtime feed not read: ${line}`);
}

// GTFS times are HH:MM:SS and may pass 24:00.
function secondsAfterMidnight(time) {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + (seconds || 0);
}

// [[west, south], [east, north]] around every coordinate in some features.
// Douglas-Peucker to about a meter, so shapes are no heavier than the map's lines.
function simplifyPath(points) {
  const k = Math.cos((points[0][1] * Math.PI) / 180);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let index = 0;
    const [ax, ay] = [points[a][0] * k, points[a][1]];
    const [dx, dy] = [points[b][0] * k - ax, points[b][1] - ay];
    const len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((points[i][0] * k - ax) * dy - (points[i][1] - ay) * dx) / len;
      if (d > worst) [worst, index] = [d, i];
    }
    if (worst > SIMPLIFY) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  const round = (v) => Math.round(v * 10 ** PRECISION) / 10 ** PRECISION;
  return points.filter((_, i) => keep[i]).map(([x, y]) => [round(x), round(y)]);
}

// Length of a lon/lat line in km.
function lengthKm(coords) {
  const k = Math.cos((coords[0][1] * Math.PI) / 180);
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += Math.hypot((coords[i][0] - coords[i - 1][0]) * k * 111.32, (coords[i][1] - coords[i - 1][1]) * 110.54);
  return sum;
}

function bbox(features) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => {
    if (typeof c[0] !== 'number') return c.forEach(visit);
    [w, s, e, n] = [Math.min(w, c[0]), Math.min(s, c[1]), Math.max(e, c[0]), Math.max(n, c[1])];
  };
  for (const f of features) visit(f.geometry.coordinates);
  return [
    [w, s],
    [e, n],
  ];
}

main().catch((err) => {
  console.error(`\nBuild failed; ${OUT_NAME} was left as it was.\n${err.stack ?? err}`);
  process.exit(1);
});

const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);

// The middle of a platform group's stops.
const meanPoint = (group) => [group.reduce((s, p) => s + p.at[0], 0) / group.length, group.reduce((s, p) => s + p.at[1], 0) / group.length];
