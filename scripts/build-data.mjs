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
import { BUILDING_R, ringGap, terminalFootprints } from './lib/footprints.mjs';
import { extendLineToPlatforms, stationStructures } from './lib/structures.mjs';
import { heading, stopLines } from './lib/stops.mjs';
import { endAtMarks, nearestOnTrack, sharedTrack, trackAt, trimToEnds } from './lib/sharedtrack.mjs';
import { stationService } from './lib/stations.mjs';
import { stationMarks } from './lib/stationmarks.mjs';
import { groupPlatforms, groupPoints, meters, platformMarks } from './lib/platforms.mjs';
import { busStretches } from './lib/stretches.mjs';
import { busStreets, calm, terminalPlaces, terminals } from './lib/streets.mjs';
import { generalize } from './lib/generalize.mjs';
import { snapPartTime } from './lib/parttime.mjs';
import { closestOnSegment, clipOutRings, insideRing } from './lib/geom.mjs';
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
const SIMPLIFY = 0.00001;
const PRECISION = 5;
// A station is moved onto its lines' track when it's at most this far away.
const SNAP_METERS = 200;
// Line ends this close together are one row of platforms, and the station's
// bar goes across them (Union Station's four commuter lines).
const ROW_METERS = 60;
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
  const structuresPrevious = JSON.parse(await readFile(path.join(OUT, 'structures.geojson'), 'utf8').catch(() => '{"features":[]}')).features;
  const shapesAt = await stationStructures({
    stations: geo.stations,
    platforms: service.stations.map((s) => s.platforms),
    previous: structuresPrevious,
  });
  console.log(
    `  rail station shapes: ${shapesAt.byStation.size} stations (${[...shapesAt.byStation.values()].filter((s) => s.building).length} with a station building, ${[...shapesAt.byStation.values()].filter((s) => s.canopies.length).length} with a canopy)${shapesAt.failed ? `, ${shapesAt.failed} not looked up` : ''}`,
  );

  // The bus halls beside the rail stations, read before the routes are drawn:
  // a lap that runs round one is the way buses get in and out of the station,
  // not a route a rider can ride (DESIGN.md, "Bus routes", "Terminals";
  // scripts/lib/generalize.mjs). Read here, before the streets and terminals
  // are drawn, so the generalizer has the shape it needs; the areas are kept
  // for the terminal block below.
  const placeOf = geo.facilities.map((f) => f.geometry.coordinates);
  const atRailStation = (c) => geo.stations.some((s) => Math.hypot((s.geometry.coordinates[0] - c[0]) * 85000, (s.geometry.coordinates[1] - c[1]) * 110540) < 100);
  const busStationIndexes = geo.facilities.map((f, i) => (['BUS', 'STN'].includes(f.properties.class) ? i : -1)).filter((i) => i >= 0);
  const terminalsBefore = JSON.parse(await readFile(path.join(OUT, 'terminals.geojson'), 'utf8').catch(() => '{"features":[]}')).features;
  const hallsAt = await terminalFootprints({
    facilities: geo.facilities,
    indexes: busStationIndexes,
    stops: geo.stops,
    previous: terminalsBefore,
    busOnly: new Set(busStationIndexes.filter((i) => atRailStation(placeOf[i]))),
    markStops: false,
  });
  const halls = [...hallsAt.terminals.values()].flatMap((s) => s.rings);
  // Bus routes in stretches, each with the frequency of the trips that run
  // along it, so a leg only a few trips take isn't drawn as frequent.
  const buses = geo.routes.filter((f) => f.properties.mode === 'bus');
  const levels = new Map(geo.routes.map((f) => [f.properties.route, { ...f.properties }]));
  const routeCount = geo.routes.length;
  const split = busStretches(buses, gtfs.text, dates, (id) => groupOf.get(id) ?? id, { stopTimes });
  // Rail is drawn whole; its route values are its own.
  const rails = geo.routes.filter((f) => f.properties.mode !== 'bus');
  for (const { properties: p } of rails) Object.assign(p, { route_tier: p.tier, route_wk: p.wk });
  // Drawn as a transit map draws them: loops, ramp circles and second
  // carriageways simplified from each route's own line (DESIGN.md, "Bus
  // routes", "Readable geometry"; scripts/lib/generalize.mjs).
  const laps = [];
  // Two stretches of one route that meet within this many metres are one
  // line. A route's shapes are concatenated, and where two of them meet at a
  // terminal or a shape seam they can be a few metres apart, which draws as a
  // break in the line; bridging them keeps the route whole.
  const PIECE_GAP = 30;

  // A jog is a short segment that turns only a little: two stretches of one
  // street digitised a few metres apart, joined by a sideways step. Dropping
  // the step's middle vertex joins the stretches directly, which is what the
  // eye expects and what the line would look like if it had been drawn once.
  const JOG_METRES = 4;
  function collapseJogs(parts) {
    return parts.map((part) => {
      if (part.length < 4) return part;
      const dir = (a, b) => Math.atan2(b[1] - a[1], (b[0] - a[0]) * Math.cos((b[1] * Math.PI) / 180));
      const keep = part.map(() => true);
      for (let i = 2; i < part.length - 1; i++) {
        if (!keep[i - 1]) continue;
        const d = meters(part[i - 1], part[i]);
        if (!(d > 0 && d <= JOG_METRES)) continue;
        const turn = Math.abs(((dir(part[i], part[i + 1]) - dir(part[i - 2], part[i - 1]) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (turn <= (30 * Math.PI) / 180) keep[i - 1] = false; // the step is straight: drop its first point
      }
      return part.filter((_, i) => keep[i]);
    });
  }
  const bridge = (f) => {
    if (f.properties.mode !== 'bus') return f;
    const parts = partsOf(f.geometry);
    const out = [];
    for (const part of parts) {
      const last = out[out.length - 1];
      if (last && meters(last[last.length - 1], part[0]) <= PIECE_GAP) out[out.length - 1] = last.concat(part);
      else out.push(part.slice());
    }
    const smoothed = collapseJogs(out);
    return {
      ...f,
      geometry: smoothed.length === 1 ? { type: 'LineString', coordinates: smoothed[0] } : { type: 'MultiLineString', coordinates: smoothed },
    };
  };
  geo.routes = [
    ...generalize(split.features, {
      precision: PRECISION,
      report: laps,
      places: [...geo.stations, ...geo.facilities].map((f) => f.geometry.coordinates),
      halls,
      stops: geo.stops.map((f) => f.geometry.coordinates),
    }).map(bridge),
    ...rails,
  ];
  console.log(
    `  bus laps generalized: ${laps.filter((l) => l.kind === 'turn').length} turns, ${laps.filter((l) => l.kind === 'end').length} short ends, ${laps.filter((l) => l.kind === 'through').length} through`,
  );
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
  // mark belongs on it — not at the platforms' middle, nor at the end RTD's
  // single point falls on. Union Station's four commuter lines end together
  // at the train hall's southwest end.
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
      if (ends.length < 2) continue;
      // The largest group of ends within a row's width is the row.
      const rows = [];
      for (const t of ends) {
        const row = rows.find((r) => r.some((q) => meters(q.p, t.p) <= ROW_METERS));
        if (row) row.push(t);
        else rows.push([t]);
      }
      rows.sort((a, b) => b.length - a.length || Math.min(...a.map((t) => t.d)) - Math.min(...b.map((t) => t.d)));
      if (rows[0].length < 2) continue;
      const at = [0, 1].map((c) => rows[0].reduce((s, t) => s + t.p[c], 0) / rows[0].length);
      const f = geo.stations[i];
      const lines = new Set(f.properties.lines.split(' '));
      const on = nearestOnTrack(pieces.filter((p) => lines.has(p.properties.route)), at, SNAP_METERS);
      if (on && meters(on, at) <= ROW_METERS) f.geometry = { type: 'Point', coordinates: on };
    }
  }
  // A line ends at its end station's mark (DESIGN.md, "Stations"; #75): the
  // station's own mark, or the mark of the platform group the line stops
  // at. Where the line ran on along its platform past the mark, it is cut
  // where the mark crosses it, before the ends are signed and the marks
  // drawn from the track. A group has a mark of its own only where the
  // station has more than one and it is not the group the station's own
  // mark stands for (platformMarks); a station with one group is drawn at
  // its own point, which can be tens of metres from its stops (the airport).
  {
    const groups = groupPoints(geo.stations, service.stations.map((s) => s.platforms ?? []), pieces);
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
    geo.routes = [...geo.routes.filter((f) => f.properties.mode !== 'rail'), ...pieces];
  }
  // A bus route that ends at a terminal's hall is drawn only as far as the
  // hall: the last stretch that hugs the station (the way round the block to
  // the ramp down into it) is the approach, not a route a rider can ride
  // (DESIGN.md, "Bus routes", "Terminals"). Where the route leaves the
  // hall's reach it is cut and run straight to the hall's edge. The streets
  // are drawn from the routes below, so the loop's streets go with it; a
  // through street keeps the routes that really run along it.
  // Wider screens open on the routes drawn at full strength from far out,
  // rail and buses every 30 minutes or better, not on the long reach of a few
  // commuter routes.
  const network = bbox(geo.routes.filter((f) => f.properties.mode === 'rail' || ['frequent', 'every30'].includes(f.properties.tier)));
  const { labels, signBoxes, endNames, hubs } = labelPoints(geo.routes, geo.stations, service.ends, service.headsigns, network);
  geo.labels = [...labels, ...letters];
  const endStations = new Set(Object.values(service.ends).flat());
  geo.stations.forEach((f, i) => {
    // `end`: a rail line ends here (Union Station included). From the metro
    // zooms these are the stations named: where the trains go.
    f.properties.end = endStations.has(i);
    // `hub`: more lines end here than get a sign (Union Station). Its name
    // may sit further out, since the lines around it leave no room beside it.
    f.properties.hub = hubs.has(i);
    Object.assign(f.properties, f.properties.served ? trackAt(pieces, f.geometry.coordinates) : { span: 1, bearing: 0 });
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
  const smooth = (f) => {
    const parts = partsOf(f.geometry);
    if (!parts.length) return f;
    const done = collapseJogs(parts);
    return { ...f, geometry: done.length === 1 ? { type: 'LineString', coordinates: done[0] } : { type: 'MultiLineString', coordinates: done } };
  };
  // This first pass is only for finding the terminals (terminalPlaces), which
  // counts the streets' loose ends, so it is not mended (busStreets' `mend`):
  // the terminals stay the ones the round-four check saw until they are
  // found from where RTD's lines end (#78). The streets drawn are the
  // second pass, below, mended.
  geo.streets = busStreets(geo.routes.filter((f) => f.properties.mode === 'bus'), split.loads, { precision: PRECISION, mend: false }).map(smooth);
  let shapesForTerminals;
  // Bus stations drawn as their own buildings: the place where streets end
  // (DESIGN.md, "Bus routes", "Terminals"), then the shape its bus gates
  // stand in from OpenStreetMap (scripts/lib/footprints.mjs) — its bus hall,
  // above or below ground, or its bus platforms — then the streets tidied
  // around that shape rather than around a made-up disk.
  {
    const places = placeOf;
    const found = terminalPlaces(geo.streets, places, { precision: PRECISION });
    // At a rail station only a bus hall or bus platforms may be drawn: the
    // rail station is already the place, and the block beside it is not.
    const busOnly = new Set(found.map((t) => t.qi).filter((i) => atRailStation(places[i])));
    const shapes = (shapesForTerminals = await terminalFootprints({ facilities: geo.facilities, indexes: found.map((t) => t.qi), stops: geo.stops, previous: terminalsBefore, busOnly }));
    geo.terminals = [...shapes.terminals.values()].map((s) => s.feature);
    console.log(`  bus terminals: ${found.length} (${found.map((t) => geo.facilities[t.qi].properties.name).join(', ')})`);
    console.log(`  drawn as their shape: ${geo.terminals.map((f) => `${f.properties.name} (${f.properties.kind}${f.properties.underground ? ', below ground' : ''}, ${f.properties.gates} gates)`).join(', ') || 'none'}`);
    geo.structures = [...shapesAt.features, ...shapes.canopies];

    // No line is drawn through a terminal's hall (DESIGN.md, "Bus routes",
    // "Terminals"): a bus that boards in the concourse goes down a ramp, so
    // the street and route lines end where they meet the hall, and what was
    // drawn across it is gone. Every line ends at the edge its buses go in.
  }
  const streetKm = (cls) => geo.streets.filter((f) => f.properties.cls === cls).reduce((a, f) => a + lengthKm(f.geometry.coordinates), 0);
  const classes = Object.fromEntries(STREET_CLASSES.map((c) => [c.id, { streets: geo.streets.filter((f) => f.properties.cls === c.id).length, km: Math.round(streetKm(c.id) * 10) / 10 }]));
  // Stops name the lines the map draws, families as their map route (FF1 is
  // FF), and which way their buses head.
  const drawnLines = new Set(geo.routes.map((f) => f.properties.route));
  const lineAt = (code) => (drawnLines.has(code) ? code : drawnLines.has(byCode.get(code)) ? byCode.get(code) : null);
  for (const { properties: p } of geo.stops) Object.assign(p, { lines: stopLines(p.routes, lineAt), heading: heading(p.dir) });

  // A bus that boards in a terminal's concourse is drawn only as far as the
  // hall: the way round the block to the ramp is the approach, not a route a
  // rider can ride (see shortenAtHall). The streets and street names are
  // drawn from the routes as cut, so the loop round the block is not drawn.
  {
    const served = new Set();
    for (const s of geo.stops) {
      if (!s.properties.terminal) continue;
      for (const line of String(s.properties.lines ?? '').split(' ')) if (line) served.add(line);
    }
    geo.routes = shortenAtHall(geo.routes, halls, served);
    // A part-time route that leaves the all-day line it shares and comes
    // back draws as a second line; snap the short excursion onto the line
    // (DESIGN.md, "Bus routes"; scripts/lib/parttime.mjs).
    geo.routes = snapPartTime(geo.routes, { precision: PRECISION });
    const busRoutes = geo.routes.filter((f) => f.properties.mode === 'bus');
    geo.busnames = busNames(busRoutes, { precision: PRECISION });
    geo.streets = busStreets(busRoutes, split.loads, { precision: PRECISION }).map(smooth);
    terminals(geo.streets, placeOf, { precision: PRECISION, footprints: new Map([...shapesForTerminals.terminals].map(([i, s]) => [i, s.rings])) });
  }
  // The rings as they are drawn (a hall snapped to the map's precision), so
  // the line that is cut is cut where the fill ends.
  const hallRings = geo.terminals.flatMap((f) =>
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((rings) => rings[0]),
  );
    // No line is drawn through a hall: a line that ends at the concourse
    // point itself is cut back to the edge, where its buses go in.
    const clear = (p) => p.filter((q) => !hallRings.some((r) => insideRing(q, r)));
    const outside = (features) =>
      features.flatMap((f) => {
        const parts = partsOf(f.geometry)
          .flatMap((p) => clipOutRings(p, hallRings).map(clear))
          .filter((p) => p.length >= 2);
        return parts.map((p) => ({ ...f, properties: { ...f.properties }, geometry: { type: 'LineString', coordinates: p } }));
      });
    geo.streets = outside(geo.streets);
    // Near a station, short runs take the width of the street they join and
    // a stub that joins back onto its own street goes (DESIGN.md, "Bus
    // routes"; scripts/lib/streets.mjs).
    geo.streets = calm(geo.streets, [...geo.stations, ...geo.facilities].map((f) => f.geometry.coordinates), { precision: PRECISION });
    geo.routes = geo.routes.flatMap((f) => {
      if (f.properties.mode !== 'bus') return [f];
      const parts = partsOf(f.geometry)
        .flatMap((p) => clipOutRings(p, hallRings).map(clear))
        .filter((p) => p.length >= 2);
      if (!parts.length) return [];
      return [{ ...f, geometry: parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts } }];
    });
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
  counts.terminals = geo.terminals.length;
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

// The middle of a platform group's stops.
const meanPoint = (group) => [group.reduce((s, p) => s + p.at[0], 0) / group.length, group.reduce((s, p) => s + p.at[1], 0) / group.length];

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

// A bus that boards in a terminal's concourse is drawn only as far as the
// hall: where its line comes to the hall, goes away round the block and comes
// back (the way in on one street and out on another, to and from the ramp),
// the stretch between is the approach, and goes (DESIGN.md, "Bus routes",
// "Terminals"). Each side is run on to the hall's edge, so the line ends at
// the concourse; a street the bus really runs along, or one it only passes,
// is untouched. Only routes that stop inside the hall are shortened.
function shortenAtHall(routes, halls, served, { close = 120, longest = 1500 } = {}) {
  if (!halls.length || !served.size) return routes;
  const metres = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
  const middle = (ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const centres = halls.map(middle);
  return routes.map((f) => {
    if (f.properties.mode !== 'bus' || !served.has(f.properties.route)) return f;
    const out = [];
    for (const part of partsOf(f.geometry)) {
      let line = part.slice();
      let at = 0;
      while (at < line.length - 2) {
        let run = 0;
        let cut = null;
        for (let j = at + 2; j < line.length; j += 1) {
          run += metres(line[j - 1], line[j]);
          if (run > longest) break;
          if (metres(line[at], line[j]) > close) continue;
          if (run < 100) continue;
          const loop = line.slice(at, j + 1);
          if (centres.some((c) => insideRing(c, loop))) { cut = j; break; }
        }
        if (!cut) { at += 1; continue; }
        // The stretch from where the line comes to the hall to where it
        // leaves again, round the block and through the hall: the way in,
        // not the route. Both sides end at the hall's edge.
        out.push(line.slice(0, at + 1), line.slice(cut));
        line = [];
        break;
      }
      if (line.length) out.push(line);
    }
    const kept = out.filter((p) => p.length >= 2);
    if (!kept.length) return f;
    return { ...f, geometry: kept.length === 1 ? { type: 'LineString', coordinates: kept[0] } : { type: 'MultiLineString', coordinates: kept } };
  });
}
