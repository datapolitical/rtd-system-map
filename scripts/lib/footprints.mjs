// Bus terminals, drawn as the building they are (DESIGN.md, "Bus routes",
// "Terminals"). A terminal is where several routes end and lay over: the
// lanes and loops inside it are not streets a rider can use, and a made-up
// shape for the place says nothing. So the build asks OpenStreetMap for the
// buildings around each terminal and keeps the one its bus gates stand in —
// the station building where there is one, else the building that holds the
// most of its stops. Nothing about a particular terminal is written down here:
// any terminal RTD's data grows will be drawn the same way, and a terminal
// with no building (a park-n-ride's lot) is drawn as nothing at all, because
// there is nothing there to draw.
//
// The footprint is used twice: the page fills and outlines it as the terminal
// mark, and `streets.mjs` takes the lanes inside it out of the street net, so
// the streets around a terminal are drawn as they are and only what the
// building covers is tidied away.

import { projection, simplify } from './geom.mjs';

export const OSM_MAP = 'https://api.openstreetmap.org/api/0.6/map';
// The box asked for around a terminal, in degrees: about 280 m each way.
export const OSM_RADIUS = 0.0025;
// Buildings this far from the terminal can be it, and stops this far from it
// are its gates (a bus station's stops are inside its building; a street
// stop across the road is not a gate).
export const BUILDING_R = 220;
export const GATE_R = 160;
// A building smaller than this is a shelter or a kiosk, not a terminal.
export const MIN_AREA = 80;
// A bus platform can be a narrow strip, but below this it is a kerb.
export const PLATFORM_MIN_AREA = 30;
// Shapes are simplified to a metre, the same as the map's lines.
const SHAPE_TOLERANCE = 1;

const metres = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

/** Is `p` inside the ring (even-odd, the usual crossing count)? */
export function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Square metres of a lon/lat ring, by the shoelace formula on metres.
export function area(ring) {
  const kx = 111320 * Math.cos((ring[0][1] * Math.PI) / 180);
  const ky = 110540;
  const pts = ring.map((p) => [(p[0] - ring[0][0]) * kx, (p[1] - ring[0][1]) * ky]);
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) sum += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(sum / 2);
}

/**
 * The closed ways that describe a place in an OSM XML document from the map
 * call, as `{ id, tags, ring }` with `ring` the way's corners in lon/lat
 * (not repeated at the end): buildings, a bus station's hall, and the bus
 * platforms at its gates. Open ways, routes and relations are left out.
 */
export function parseOsm(xml) {
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\b[^>]*\bid="([^"]+)"[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"/g)) nodes.set(m[1], [Number(m[3]), Number(m[2])]);
  const ways = [];
  for (const m of xml.matchAll(/<way\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const tags = {};
    for (const t of m[2].matchAll(/<tag\b[^>]*\bk="([^"]*)"[^>]*\bv="([^"]*)"/g)) tags[t[1]] = t[2];
    const busPlatform = tags.public_transport === 'platform' && tags.bus === 'yes';
    if (!tags.building && tags.amenity !== 'bus_station' && !busPlatform) continue;
    const refs = [...m[2].matchAll(/<nd\b[^>]*\bref="([^"]+)"/g)].map((r) => r[1]);
    if (refs.length < 4 || refs[0] !== refs.at(-1)) continue;
    const ring = refs.slice(0, -1).map((ref) => nodes.get(ref)).filter(Boolean);
    if (ring.length >= 3) ways.push({ id: m[1], tags, ring });
  }
  return ways;
}

// A building that is the station itself, not just a building the station is in.
const isStation = (tags) => tags.amenity === 'bus_station' || tags.public_transport === 'station' || tags.railway === 'station' || tags.building === 'transportation';
// A parking structure is never the terminal: buses board beside it, not in it.
const isParking = (tags) => tags.building === 'parking' || tags.amenity === 'parking' || tags.parking !== undefined;
// A bus station's hall, above or below ground, and its bus platforms: both
// are the place a bus boards, whatever else stands there.
const isBusHall = (tags) => tags.amenity === 'bus_station';
const isBusPlatform = (tags) => tags.public_transport === 'platform' && tags.bus === 'yes';
// Below ground when OSM says so: a layer under the street, or the hall itself
// marked as underground.
const isUnderground = (tags) => Number(tags.layer) < 0 || tags.location === 'underground';
// A bus platform this close to a gate is the gate's platform (the stops often
// sit in the lane between two platforms).
export const PLATFORM_GATE_R = 30;

/**
 * The shape a terminal is, from the areas around it: its bus hall if OSM has
 * one, else the bus platforms its gates stand on, else the station building
 * the gates stand in, else the building holding the most gates — and never a
 * parking structure. Returns `{ ways, rings, kind, underground }` or null when
 * nothing quality stands there (a park-n-ride lot has no shape to draw).
 */
export function terminalShapeOf(areas, point, gates) {
  const usable = areas.filter((a) => area(a.ring) >= PLATFORM_MIN_AREA);
  const holds = (a, g) => inRing(g, a.ring);
  const count = (a) => gates.filter((g) => holds(a, g)).length;
  const near = (a, r) => gates.some((g) => holds(a, g) || ringGap(g, a.ring) <= r);
  const pick = (list) => list.sort((x, y) => count(y) - count(x) || Number(holds(y, point)) - Number(holds(x, point)) || area(x.ring) - area(y.ring))[0] ?? null;
  const big = (a) => area(a.ring) >= MIN_AREA;

  const hall = pick(usable.filter((a) => isBusHall(a.tags) && big(a) && (count(a) || holds(a, point))));
  if (hall) return { ways: [hall], rings: [hall.ring], kind: 'bus_station', underground: isUnderground(hall.tags) };
  const platforms = usable.filter((a) => isBusPlatform(a.tags) && near(a, PLATFORM_GATE_R));
  if (platforms.length) return { ways: platforms, rings: platforms.map((a) => a.ring), kind: 'platform', underground: platforms.some((a) => isUnderground(a.tags)) };
  const station = pick(usable.filter((a) => isStation(a.tags) && big(a) && !isParking(a.tags) && (count(a) || holds(a, point))));
  if (station) return { ways: [station], rings: [station.ring], kind: 'station', underground: isUnderground(station.tags) };
  const building = pick(usable.filter((a) => a.tags.building && big(a) && !isParking(a.tags) && (count(a) || holds(a, point))));
  if (building) return { ways: [building], rings: [building.ring], kind: 'building', underground: isUnderground(building.tags) };
  return null;
}

// How far `p` is from a ring's edge.
export function ringGap(p, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
    const ky = 110540;
    const [ax, ay] = [(ring[j][0] - p[0]) * kx, (ring[j][1] - p[1]) * ky];
    const [bx, by] = [(ring[i][0] - p[0]) * kx, (ring[i][1] - p[1]) * ky];
    const [dx, dy] = [bx - ax, by - ay];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/**
 * The building a terminal is, from the buildings around it: the station
 * building if one of them is the station, else the one holding the most of
 * the terminal's `gates` (stop points), and never a building the gates are not
 * in or around. Null when nothing qualifies — a park-n-ride's lot has no
 * building, and drawing the shop beside it would be a lie. Kept as the shape's
 * headline building; `terminalShapeOf` is what the build uses.
 */
export function footprintOf(buildings, point, gates) {
  return terminalShapeOf(buildings, point, gates)?.ways[0] ?? null;
}

/** The areas in an OSM map box around `point`, or an error the caller can decide about. */
export async function buildingsAround(point, { radius = OSM_RADIUS, fetchText = defaultFetch } = {}) {
  const [lon, lat] = point;
  const box = [lon - radius, lat - radius, lon + radius, lat + radius].map((v) => v.toFixed(5)).join(',');
  return parseOsm(await fetchText(`${OSM_MAP}?bbox=${box}`));
}

async function defaultFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'rtd-system-map/1.0 (+https://github.com/datapolitical/rtd-system-map)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

// A footprint as the page draws it: a closed ring, simplified to a metre, rounded.
function shapeOf(way, point) {
  const { project, unproject } = projection(point, 5);
  const ring = simplify(way.ring.map(project), SHAPE_TOLERANCE).map(unproject);
  return [...ring, ring[0]];
}

// Every ring a terminal feature's geometry holds, for the street net.
function ringsOfFeature(feature) {
  const g = feature.geometry;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polygons.map((p) => p[0]);
}

// A roof over a place: what riders see from the street above a bus hall.
export const ROOF_R = 2;
const isRoof = (tags) => tags.building === 'roof' || tags['man_made'] === 'canopy';

/**
 * Find the shape of each terminal. `facilities` are the facility features
 * and `indexes` the ones the street net found to be terminals; `stops` are the
 * stop features, read for the gates. `busOnly` are the indexes at a rail
 * station, where only a bus hall or bus platforms may be drawn: the rail
 * station is already the place, and the office block beside it is not.
 * `previous` is last build's terminals file, kept for a terminal whose box
 * OpenStreetMap would not answer for, so a bad day at OSM costs nothing.
 * Returns `{ terminals, canopies }`: a Map from facility index to `{ rings,
 * feature }`, and the roofs over those shapes, to draw as canopies.
 */
export async function terminalFootprints({ facilities, indexes, stops, previous = [], busOnly = new Set(), fetchText, log = console.log }) {
  const before = new Map(previous.map((f) => [String(f.properties.id), f]));
  const terminals = new Map();
  const canopies = [];
  for (const i of indexes) {
    const facility = facilities[i];
    const point = facility.geometry.coordinates;
    const gates = stops.map((f) => f.geometry.coordinates).filter((c) => metres(c, point) <= GATE_R);
    const id = String(facility.properties.id);
    let areas = null;
    try {
      areas = await buildingsAround(point, { radius: radiusFor(point, gates), fetchText });
    } catch (err) {
      log(`  ${facility.properties.name}: no building looked up (${err.message})`);
    }
    if (!areas) {
      if (before.has(id)) terminals.set(i, { rings: ringsOfFeature(before.get(id)), feature: before.get(id) });
      continue;
    }
    const shape = terminalShapeOf(areas, point, gates);
    if (!shape) continue;
    if (busOnly.has(i) && !['bus_station', 'platform'].includes(shape.kind)) continue;
    const rings = shape.rings.map((r) => shapeOf({ ring: r }, point));
    terminals.set(i, {
      rings: shape.rings,
      feature: {
        type: 'Feature',
        geometry: rings.length === 1 ? { type: 'Polygon', coordinates: rings } : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) },
        properties: {
          id,
          name: facility.properties.name,
          class: facility.properties.class,
          gates: gates.filter((g) => shape.rings.some((r) => inRing(g, r))).length,
          kind: shape.kind,
          underground: shape.underground ? 1 : 0,
        },
      },
    });
    // The roof over it, if OSM draws one: the curved canopy above Civic
    // Center's hall, the canopy over Nine Mile's bays.
    for (const a of areas) {
      if (!isRoof(a.tags) || area(a.ring) < MIN_AREA) continue;
      if (!shape.rings.some((r) => inRing(a.ring[0], r) || ringGap(a.ring[0], r) <= ROOF_R || inRing(r[0], a.ring))) continue;
      const ring = shapeOf(a, point);
      canopies.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { kind: 'canopy', name: facility.properties.name, terminal: id, station: '' },
      });
    }
  }
  return { terminals, canopies };
}

// The box to ask OSM for: the place, its gates and a margin for the buildings
// and hall they stand in.
function radiusFor(point, gates) {
  const lons = [point[0], ...gates.map((g) => g[0])];
  const lats = [point[1], ...gates.map((g) => g[1])];
  const span = Math.max((Math.max(...lons) - Math.min(...lons)) / 0.85, (Math.max(...lats) - Math.min(...lats)) / 1.1);
  return Math.max(OSM_RADIUS, span + 0.0012);
}
