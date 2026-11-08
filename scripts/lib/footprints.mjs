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
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] - ring[i][0]) * kx * (ring[j][1] + ring[i][1]) * ky;
  return Math.abs(sum / 2);
}

/**
 * The closed ways with a `building` tag in an OSM XML document from the map
 * call, as `{ id, tags, ring }` with `ring` the way's corners in lon/lat
 * (not repeated at the end). Relations and open ways are left out.
 */
export function parseOsm(xml) {
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\b[^>]*\bid="([^"]+)"[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"/g)) nodes.set(m[1], [Number(m[3]), Number(m[2])]);
  const ways = [];
  for (const m of xml.matchAll(/<way\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const tags = {};
    for (const t of m[2].matchAll(/<tag\b[^>]*\bk="([^"]*)"[^>]*\bv="([^"]*)"/g)) tags[t[1]] = t[2];
    if (!tags.building) continue;
    const refs = [...m[2].matchAll(/<nd\b[^>]*\bref="([^"]+)"/g)].map((r) => r[1]);
    if (refs.length < 4 || refs[0] !== refs.at(-1)) continue;
    const ring = refs.slice(0, -1).map((ref) => nodes.get(ref)).filter(Boolean);
    if (ring.length >= 3) ways.push({ id: m[1], tags, ring });
  }
  return ways;
}

// A building that is the station itself, not just a building the station is in.
const isStation = (tags) => tags.amenity === 'bus_station' || tags.public_transport === 'station' || tags.railway === 'station' || tags.building === 'transportation';

/**
 * The building a terminal is, from the buildings around it: the station
 * building if one of them is the station, else the one holding the most of
 * the terminal's `gates` (stop points), and never a building the gates are not
 * in or around. Null when nothing qualifies — a park-n-ride's lot has no
 * building, and drawing the shop beside it would be a lie.
 */
export function footprintOf(buildings, point, gates) {
  const candidates = [];
  for (const b of buildings) {
    const size = area(b.ring);
    if (size < MIN_AREA) continue;
    const holds = inRing(point, b.ring);
    const inside = gates.filter((g) => inRing(g, b.ring)).length;
    if (!holds && !inside) continue;
    candidates.push({ b, size, holds, inside, station: isStation(b.tags) });
  }
  if (!candidates.length) return null;
  candidates.sort(
    (x, y) =>
      Number(y.station) - Number(x.station) ||
      y.inside - x.inside ||
      Number(y.holds) - Number(x.holds) ||
      // Two buildings that both hold the gates: the tighter fit is the one
      // the gates stand in, not the block it sits on.
      x.size - y.size,
  );
  return candidates[0].b;
}

/** The buildings in an OSM map box around `point`, or an error the caller can decide about. */
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

// A footprint as the page draws it: closed ring, simplified to a metre, rounded.
function shapeOf(way, point) {
  const { project, unproject } = projection(point, 5);
  const ring = simplify(way.ring.map(project), SHAPE_TOLERANCE).map(unproject);
  return [...ring, ring[0]];
}

/**
 * Find the footprint of each terminal. `facilities` are the facility features
 * and `indexes` the ones the street net found to be terminals; `stops` are the
 * stop features, read for the gates. `previous` is last build's terminals file,
 * kept for a terminal whose box OpenStreetMap would not answer for, so a bad
 * day at OSM costs nothing. Returns a Map from facility index to `{ ring,
 * feature }`: the building's corners in lon/lat, and the GeoJSON feature the
 * page draws.
 */
export async function terminalFootprints({ facilities, indexes, stops, previous = [], fetchText, log = console.log }) {
  const before = new Map(previous.map((f) => [String(f.properties.id), f]));
  const found = new Map();
  for (const i of indexes) {
    const facility = facilities[i];
    const point = facility.geometry.coordinates;
    const gates = stops.map((f) => f.geometry.coordinates).filter((c) => metres(c, point) <= GATE_R);
    let way = null;
    let failed = false;
    try {
      way = footprintOf(await buildingsAround(point, { fetchText }), point, gates);
    } catch (err) {
      failed = true;
      log(`  ${facility.properties.name}: no building looked up (${err.message})`);
    }
    const id = String(facility.properties.id);
    if (failed && before.has(id)) {
      const feature = before.get(id);
      found.set(i, { ring: feature.geometry.coordinates[0], feature });
      continue;
    }
    if (!way) continue;
    found.set(i, {
      ring: way.ring,
      feature: {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [shapeOf(way, point)] },
        properties: { id, name: facility.properties.name, class: facility.properties.class, gates: gates.filter((g) => inRing(g, way.ring)).length },
      },
    });
  }
  return found;
}
