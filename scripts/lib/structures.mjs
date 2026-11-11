// The shapes a rail station really has (DESIGN.md, "Stations", "Terminals"):
// its platforms, the canopy over them, and the station building, read from
// OpenStreetMap at build time from the tags that say what each shape is. None
// of it is written down here: a station draws whatever OSM has where its
// trains call, and a station with no shapes drawn in OSM gets none.
//
// What counts is decided by position, not by name. A platform is a
// `railway=platform` area holding or touching one of the station's GTFS
// platform stops (the child stops `stations.mjs` groups); a canopy is a
// `building=roof`, `amenity=shelter` or `man_made=canopy` area over one of
// those platforms; the station building is a `building=train_station` area
// holding or touching one. Apartment blocks and offices called "... Union
// Station" match none of these and are never drawn.
//
// The same shapes tell the build where a line's platform ends, so a line can
// run along the platform it stops at to the platform's real end
// (`platformEndFor`), rather than stopping at RTD's single station point.

import { projection, simplify } from './geom.mjs';
import { area, inRing } from './footprints.mjs';

export const OSM_MAP = 'https://api.openstreetmap.org/api/0.6/map';
// Metres of OSM asked for around a station's platform stops, past their own
// spread: enough for the platforms, their canopies and the station building.
export const STATION_PAD = 70;
// A platform this close to a platform stop is the stop's platform; a stop a
// platform's width off its own platform still finds it.
export const PLATFORM_REACH = 35;
// A station building this close to a platform holds or touches the station.
export const BUILDING_REACH = 45;
// Below these, a shape is a shelter, a kiosk or a bit of trim, not a
// platform or a canopy a rider would see.
export const PLATFORM_MIN = 20;
export const CANOPY_MIN = 120;
// A canopy this close to a platform covers it.
export const CANOPY_REACH = 4;
// Shapes are simplified to a metre, the same as the map's lines.
const SHAPE_TOLERANCE = 1;

const metres = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

function attrs(text) {
  return Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

function tagsOf(body) {
  const tags = {};
  for (const m of body.matchAll(/<tag\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    if (a.k && a.v !== undefined) tags[a.k] = a.v;
  }
  return tags;
}

/** Join way segments (arrays of node ids) end to end into closed rings. */
function ringsOf(segments) {
  const pool = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    let grew = true;
    while (ring[0] !== ring.at(-1) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (s[0] === ring.at(-1)) ring = ring.concat(s.slice(1));
        else if (s.at(-1) === ring.at(-1)) ring = ring.concat([...s].reverse().slice(1));
        else if (s.at(-1) === ring[0]) ring = s.slice(0, -1).concat(ring);
        else if (s[0] === ring[0]) ring = [...s].reverse().slice(0, -1).concat(ring);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring[0] === ring.at(-1) && ring.length >= 4) rings.push(ring.slice(0, -1));
  }
  return rings;
}

/**
 * The closed areas in an OSM XML map call: `{ id, tags, polygons }`, each
 * polygon `{ outer, holes }` as lon/lat rings (not repeated at the end).
 * Ways and multipolygon relations are both read; open ways and routes are
 * left out. This is the raw material `stationStructures` chooses from.
 */
export function parseOsmAreas(xml) {
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\b([^>]*)>/g)) {
    const a = attrs(m[1]);
    if (a.id && a.lon !== undefined && a.lat !== undefined) nodes.set(a.id, [Number(a.lon), Number(a.lat)]);
  }
  const ways = new Map();
  for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const a = attrs(m[1]);
    ways.set(a.id, {
      tags: tagsOf(m[2]),
      refs: [...m[2].matchAll(/<nd\b([^>]*)\/?>/g)].map((nd) => attrs(nd[1]).ref).filter(Boolean),
    });
  }
  const closed = (refs) => (refs.length >= 4 && refs[0] === refs.at(-1) ? refs.slice(0, -1).map((r) => nodes.get(r)).filter(Boolean) : null);

  const areas = [];
  const inRelation = new Set();
  for (const m of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) {
    const a = attrs(m[1]);
    const tags = tagsOf(m[2]);
    if (tags.type !== 'multipolygon' && tags.type !== 'building' && tags.building !== 'roof') continue;
    const members = [...m[2].matchAll(/<member\b([^>]*)\/?>/g)].map((mm) => attrs(mm[1])).filter((mm) => mm.type === 'way' && mm.ref);
    const outer = [];
    const inner = [];
    for (const member of members) {
      const way = ways.get(member.ref);
      if (!way) continue;
      inRelation.add(member.ref);
      (member.role === 'inner' ? inner : outer).push(way.refs);
    }
    const outers = ringsOf(outer);
    const inners = ringsOf(inner).map((r) => r.map((ref) => nodes.get(ref)).filter(Boolean));
    if (!outers.length) continue;
    const polygons = outers
      .map((refs) => ({ outer: refs.map((r) => nodes.get(r)).filter(Boolean), holes: [] }))
      .filter((p) => p.outer.length >= 3);
    for (const hole of inners) {
      const holder = polygons.find((p) => inRing(hole[0], p.outer));
      if (holder) holder.holes.push(hole);
    }
    if (polygons.length) areas.push({ id: `r${a.id}`, tags, polygons });
  }

  for (const [id, way] of ways) {
    if (inRelation.has(id)) continue;
    const ring = closed(way.refs);
    if (!ring || ring.length < 3) continue;
    areas.push({ id, tags: way.tags, polygons: [{ outer: ring, holes: [] }] });
  }
  return areas;
}

/** A ring's perimeter distance from `p`, in metres. */
export function ringDistance(p, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
    const ky = 110540;
    const [x1, y1] = [(ax - p[0]) * kx, (ay - p[1]) * ky];
    const [x2, y2] = [(bx - p[0]) * kx, (by - p[1]) * ky];
    const [dx, dy] = [x2 - x1, y2 - y1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return best;
}

const segmentCross = (a, b, c, d) => {
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};

/** Do two polygons touch or overlap? */
export function ringsMeet(a, b) {
  if (a.some((p) => inRing(p, b)) || b.some((p) => inRing(p, a))) return true;
  for (let i = 0, k = a.length - 1; i < a.length; k = i++) {
    for (let j = 0, l = b.length - 1; j < b.length; l = j++) if (segmentCross(a[k], a[i], b[l], b[j])) return true;
  }
  return false;
}

/** The area of a polygon with its holes taken out, in square metres. */
function polygonArea(polygon) {
  return area(polygon.outer) - polygon.holes.reduce((sum, h) => sum + area(h), 0);
}

/** How far a ring's nearest corner is from another ring's edge, in metres. */
export function ringGap(a, b) {
  let best = Infinity;
  for (const p of a) best = Math.min(best, ringDistance(p, b));
  return best;
}

const allRings = (areas) => areas.flatMap((a) => a.polygons.map((p) => p.outer));

// The principal (longest) axis of a ring, from its corners: the platform's
// centreline, as its two end points, in lon/lat.
export function principalAxis(ring) {
  const n = ring.length;
  const kx = 111320 * Math.cos((ring[0][1] * Math.PI) / 180);
  const ky = 110540;
  const c = ring.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of ring) {
    const x = (p[0] - c[0]) * kx;
    const y = (p[1] - c[1]) * ky;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = [Math.cos(angle), Math.sin(angle)];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of ring) {
    const t = (p[0] - c[0]) * kx * dir[0] + (p[1] - c[1]) * ky * dir[1];
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  const at = (t) => [c[0] + (t * dir[0]) / kx, c[1] + (t * dir[1]) / ky];
  return [at(lo), at(hi)];
}

/**
 * Where a line that ends at `point` should run to on its platform: the far
 * end of the platform's long axis, measured from `from` (the last point the
 * line came through), when `point` is on or beside a platform. A train runs
 * the whole platform it stops at and stops at its head end, so how the line
 * approaches decides which end that is; several lines ending at one station
 * from the same side then end together in one row. Null when no platform is
 * near enough, so a line with no platform in OSM is left where RTD's data
 * puts its end.
 */
export function platformEndFor(point, platforms, { reach = 90, longest = 450, from = point } = {}) {
  let best = null;
  for (const ring of platforms) {
    const d = ringDistance(point, ring);
    if (d <= reach && (!best || d < best.d)) best = { ring, d };
  }
  if (!best) return null;
  const axis = principalAxis(best.ring);
  const far = metres(from, axis[0]) > metres(from, axis[1]) ? axis[0] : axis[1];
  // The line runs straight on, beside its platform, until it is level with
  // the platform's end: the point on the line's own bearing abreast of that
  // end. Run to the end of the platform's middle line, a few metres to the
  // side of the track, it bent there (Union Station's four commuter lines
  // kinked 40 px before their mark).
  const kx = 111320 * Math.cos((point[1] * Math.PI) / 180);
  const ky = 110540;
  const way = [(point[0] - from[0]) * kx, (point[1] - from[1]) * ky];
  const wl = Math.hypot(...way);
  let tip = far;
  if (wl > 1) {
    const along = ((far[0] - point[0]) * kx * way[0] + (far[1] - point[1]) * ky * way[1]) / wl;
    tip = [point[0] + ((way[0] / wl) * along) / kx, point[1] + ((way[1] / wl) * along) / ky];
  }
  const run = metres(point, tip);
  return run >= 8 && run <= longest ? tip : null;
}

const isRailPlatform = (tags) => tags.railway === 'platform' && tags.public_transport !== 'no';
const isCanopy = (tags) => tags.building === 'roof' || tags.amenity === 'shelter' || tags['man_made'] === 'canopy';
const isStationBuilding = (tags) => tags.building === 'train_station';

/**
 * Run each drawn line along the platform it stops at, to the platform's real
 * end (DESIGN.md, "Stations"): `paths` are one line's drawn parts, `ends` the
 * station indexes at its two ends, `stops` the station's platform stops (an
 * array per station index of [lon, lat]), and `byStation` the shapes
 * `stationStructures` found. A part whose end is not near one of the
 * station's stops is left as it is, so a line with nothing drawn in OSM does
 * not move.
 */
// A platform is drawn only as far as the mark its lines end at reaches.
const PAST_MARK = 2;
// A platform belongs to the mark within this of its middle.
const PLATFORM_OF_MARK = 250;

// A ring cut by the line through `at` squared to `inward` (a unit vector,
// [east, north]): the part on the inward side, `past` metres beyond the line
// too. Sutherland-Hodgman, for one straight edge. Null if nothing is left.
function keepInward(ring, at, inward, past) {
  const kx = 111320 * Math.cos((at[1] * Math.PI) / 180);
  const ky = 110540;
  const side = (p) => (p[0] - at[0]) * kx * inward[0] + (p[1] - at[1]) * ky * inward[1] + past;
  const open = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  const out = [];
  for (let i = 0; i < open.length; i++) {
    const [a, b] = [open[i], open[(i + 1) % open.length]];
    const [da, db] = [side(a), side(b)];
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out.length >= 3 ? [...out, out[0]] : null;
}

/**
 * The structures with each platform, and the roof over it, drawn only as far
 * as the mark its lines end at: where every line at a mark ends there
 * (`ends`: `{ station, at, inward }`, `station` the id the structures carry,
 * `at` the mark and `inward` the unit vector [east, north] back along the
 * lines), the part of the station's platforms and canopies past the mark is
 * not drawn. A line cut at a mark short of its platform's end (a mark in
 * line with the walk to another platform) left the rest of the platform and
 * its roof standing past the mark, the ghost of the line. One wholly past
 * its mark goes; the station building is left as it is.
 */
export function platformsToMarks(features, ends, { past = PAST_MARK } = {}) {
  return features.flatMap((f) => {
    if (!['platform', 'canopy'].includes(f.properties.kind)) return [f];
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const middle = polygonCentre(polygons[0][0]);
    const mine = ends.filter((e) => String(e.station) === String(f.properties.station) && metres(e.at, middle) <= PLATFORM_OF_MARK);
    if (!mine.length) return [f];
    const end = mine.reduce((best, e) => (metres(e.at, middle) < metres(best.at, middle) ? e : best));
    const kept = polygons.flatMap((rings) => {
      const outer = keepInward(rings[0], end.at, end.inward, past);
      return outer ? [[outer]] : [];
    });
    if (!kept.length) return [];
    return [{ ...f, geometry: kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept } }];
  });
}

const BEARING_BACK = 60;
// The point `back` metres along a path from its first point (or its last).
function backAlong(path, back) {
  let walked = 0;
  for (let k = 1; k < path.length; k++) {
    walked += metres(path[k - 1], path[k]);
    if (walked >= back) return path[k];
  }
  return path.length > 1 ? path.at(-1) : null;
}

export function extendLineToPlatforms(paths, ends, stops, byStation, { reach = 350 } = {}) {
  return paths.map((path) => {
    const out = [...path];
    const used = new Set();
    for (const index of ends) {
      const plates = byStation.get(index)?.platforms.flatMap((p) => p.polygons.map((q) => q.outer)) ?? [];
      const points = stops[index] ?? [];
      if (!plates.length || !points.length) continue;
      const gap = (p) => Math.min(...points.map((s) => metres(p, s)));
      const [head, tail] = [out[0], out.at(-1)];
      const start = !used.has('start') && (used.has('end') || gap(head) <= gap(tail));
      const end = start ? head : tail;
      if (gap(end) > reach) continue;
      // The way the line comes in, over its last BEARING_BACK metres (its
      // last vertex pair alone can be a metre of noise).
      const inward = backAlong(start ? out : [...out].reverse(), BEARING_BACK);
      const tip = platformEndFor(end, plates, { from: inward ?? end });
      if (!tip || metres(tip, end) < 8) continue;
      if (start) out.unshift(tip);
      else out.push(tip);
      used.add(start ? 'start' : 'end');
    }
    return out;
  });
}

/**
 * The shapes of one station, from the OSM areas around it and its platform
 * stops: its platforms, the canopies over them, and its station building.
 * `points` are the stop positions ([lon, lat]); `origin` is where geometry is
 * projected from and rounded about.
 */
export function shapesFor(points, areas, origin) {
  const big = (a, min) => a.polygons.some((p) => polygonArea(p) >= min);
  const near = (a, reach) => allRings([a]).some((ring) => points.some((p) => inRing(p, ring) || ringDistance(p, ring) <= reach));

  const platforms = areas.filter((a) => isRailPlatform(a.tags) && big(a, PLATFORM_MIN)).filter((a) => near(a, PLATFORM_REACH));
  const platformRings = allRings(platforms);
  const canopies = areas.filter(
    (a) =>
      isCanopy(a.tags) &&
      big(a, CANOPY_MIN) &&
      allRings([a]).some((ring) => platformRings.some((platform) => ringsMeet(ring, platform) || ringGap(ring, platform) <= CANOPY_REACH)),
  );
  const buildings = areas
    .filter((a) => isStationBuilding(a.tags) && big(a, CANOPY_MIN) && allRings([a]).some((ring) => platformRings.some((platform) => ringsMeet(ring, platform) || ringGap(ring, platform) <= BUILDING_REACH)))
    .sort((a, b) => b.polygons.reduce((s, p) => s + polygonArea(p), 0) - a.polygons.reduce((s, p) => s + polygonArea(p), 0));
  const building = buildings[0] ?? null;
  const centre = building ? polygonCentre(building.polygons[0].outer) : null;
  return { platforms, canopies, building, centre, project: projection(origin, 5) };
}

/** The middle of a ring's extent, in lon/lat. */
export function polygonCentre(ring) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  return [(w + e) / 2, (s + n) / 2];
}

function shapeOf(polygon, project) {
  const closed = (r) => [...r, r[0]];
  const ring = (r) => simplify(r.map((p) => project.project(p)), SHAPE_TOLERANCE).map((p) => project.unproject(p));
  return [closed(ring(polygon.outer)), ...polygon.holes.map((h) => closed(ring(h)))];
}

function featureOf(area, kind, station, project) {
  const polygons = area.polygons.map((p) => shapeOf(p, project));
  return {
    type: 'Feature',
    geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons },
    properties: { kind, station: String(station.properties.id), name: station.properties.label },
  };
}

async function defaultFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'rtd-system-map/1.0 (+https://github.com/datapolitical/rtd-system-map)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/** The box of OSM asked for around a station's platform stops, padded. */
export function boxAround(points, pad = STATION_PAD) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  const lat = (s + n) / 2;
  const dLat = pad / 110540;
  const dLon = pad / (111320 * Math.cos((lat * Math.PI) / 180));
  return [w - dLon, s - dLat, e + dLon, n + dLat];
}

/**
 * Every served station's real shapes. `stations` are the map's station
 * features, `platforms` the GTFS child stops per station (stationService's
 * `platforms`), and `previous` last build's structures, kept for a station
 * whose box OpenStreetMap would not answer for. Returns `{ byStation, features }`:
 * a Map from station index to the shapes, and the flat list of features the
 * page draws.
 */
export async function stationStructures({ stations, platforms, previous = [], fetchText = defaultFetch, log = console.log }) {
  const before = new Map();
  for (const f of previous) {
    const id = f.properties?.station;
    if (id === undefined) continue;
    (before.get(id) ?? before.set(id, []).get(id)).push(f);
  }
  const byStation = new Map();
  const features = [];
  let failed = 0;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    const stops = platforms[i] ?? [];
    if (!station.properties.served || !stops.length) continue;
    const points = stops.map((s) => s.at);
    const [w, s, e, n] = boxAround(points);
    const box = [w, s, e, n].map((v) => v.toFixed(5)).join(',');
    let areas = null;
    try {
      areas = parseOsmAreas(await fetchText(`${OSM_MAP}?bbox=${box}`));
    } catch (err) {
      failed += 1;
      log(`  ${station.properties.label}: shapes not looked up (${err.message})`);
    }
    if (!areas) {
      const kept = before.get(String(station.properties.id));
      if (kept) features.push(...kept);
      continue;
    }
    const shapes = shapesFor(points, areas, station.geometry.coordinates);
    byStation.set(i, shapes);
    for (const area of shapes.platforms) features.push(featureOf(area, 'platform', station, shapes.project));
    for (const area of shapes.canopies) features.push(featureOf(area, 'canopy', station, shapes.project));
    if (shapes.building) features.push(featureOf(shapes.building, 'building', station, shapes.project));
  }
  return { byStation, features, failed };
}
