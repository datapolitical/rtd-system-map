// The ground drawn by our build (#241): streets, water parks and waterways, out of the same
// OpenStreetMap data the site already keeps (basemap/, scripts/basemap.mjs), chosen and simplified
// for each drawing rather than by another tile generator's own per-zoom schedule.
//
// Two rules decide a drawing:
//
// 1. Which streets show.  Streets are added by class as the zoom grows and never taken away
//    (STREET_RULE): a class drawn on a wider drawing is drawn on every closer one. So zooming in
//    only adds streets. Nothing here reads a tile that OpenFreeMap cut for a particular zoom: every
//    street comes from the pack's deepest tiles, which hold the whole network, and the rule picks.
// 2. How much a shape is smoothed.  Each drawing simplifies in its own pixels (SIMPLIFY_PX), so a
//    street drawn at 8.75 loses detail a drawing at 16 keeps. Sub-pixel lines and specks are
//    dropped (MIN_LINE_PX, MIN_AREA_PX): a drawing at its scale can't show them.
//
// Water, parks and watercourses are drawn on every drawing, from the deepest tiles, simplified at
// the drawing's scale. The build writes one FeatureCollection per drawing (scripts/ground.mjs).
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { gunzipSync } from 'node:zlib';
import { toPx, toLonLat } from './sheets.mjs';

/** The street classes the pack holds, widest first: the order they are added in as you zoom in. */
export const STREET_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];

/**
 * When each class first shows (its drawing's zoom), and every class before it: the written rule.
 * The first entry is the widest drawing; each later one only adds classes. The thresholds keep
 * main's current sheets' street sets: motorway at 8.75 and 10, trunk and primary at 12, the rest
 * from 14 (public/js/sheets/style.js, `roads`).
 */
export const STREET_RULE = [
  { from: -Infinity, classes: ['motorway'] },
  { from: 11.5, classes: ['motorway', 'trunk', 'primary'] },
  { from: 13.5, classes: STREET_CLASSES },
];

/** The street classes a drawing at `zoom` shows, in `STREET_CLASSES` order. */
export function streetClassesAt(zoom) {
  const rule = STREET_RULE.filter((r) => r.from <= zoom).at(-1);
  return STREET_CLASSES.filter((c) => rule.classes.includes(c));
}

/** How far a shape may move when simplified, in drawing pixels. */
export const SIMPLIFY_PX = 0.35;
/** A line shorter than this on the drawing, and a polygon smaller than this, is not drawn. */
export const MIN_LINE_PX = 0.75;
export const MIN_AREA_PX = 1;

/** Where each drawn layer comes from in the pack's tiles. */
const SOURCE_LAYER = { street: 'transportation', water: 'water', park: 'park', river: 'waterway' };
// A vector tile's geometry type codes: 1 point, 2 linestring, 3 polygon. The ground draws lines
// and polygons only; the type is read to tell a polygon's rings from a line's pieces.
const POLYGON = 3;

/**
 * The ground's shapes from the pack's deepest tiles, in lon/lat: every street of every class,
 * water and park polygons, and watercourses. Streets are gathered by their id, so the copies a
 * tile's buffer repeats are one feature with every piece. `pack` is `readPack()`'s
 * (scripts/lib/basemap.mjs); `zoom` defaults to the pack's deepest.
 */
export function readGround(pack, zoom = pack.zooms.at(-1)) {
  const streets = new Map();
  const polygons = { water: [], park: [] };
  const rivers = [];
  let tiles = 0;
  for (const [key, bytes] of pack.tiles(zoom)) {
    const [z, x, y] = key.split('/').map(Number);
    tiles++;
    const tile = new VectorTile(new PbfReader(bytes[0] === 0x1f ? gunzipSync(bytes) : bytes));
    const at = ([px, py], extent) => [
      ((x + px / extent) / 2 ** z) * 360 - 180,
      (360 / Math.PI) * Math.atan(Math.exp((0.5 - (y + py / extent) / 2 ** z) * 2 * Math.PI)) - 90,
    ];
    const layer = (name) => tile.layers[name];
    const lines = (l, i, extent) => l.feature(i).loadGeometry().map((line) => line.map((p) => at([p.x, p.y], extent)));
    const l = layer(SOURCE_LAYER.street);
    if (l) {
      for (let i = 0; i < l.length; i++) {
        const feature = l.feature(i);
        const cls = feature.properties.class;
        if (!STREET_CLASSES.includes(cls)) continue;
        // A way has an id; without one (rare) the tile's copy is its own feature.
        const id = feature.id ?? `${key}:${i}`;
        if (!streets.has(id)) streets.set(id, { cls, parts: [] });
        streets.get(id).parts.push(...lines(l, i, l.extent).filter((part) => part.length > 1));
      }
    }
    for (const kind of ['water', 'park']) {
      const l2 = layer(SOURCE_LAYER[kind]);
      if (!l2) continue;
      for (let i = 0; i < l2.length; i++) {
        const feature = l2.feature(i);
        if (feature.type !== POLYGON) continue;
        // A vector tile polygon is one exterior ring then its holes, in order.
        const rings = lines(l2, i, l2.extent).filter((ring) => ring.length > 3);
        if (rings.length) polygons[kind].push(rings);
      }
    }
    const l3 = layer(SOURCE_LAYER.river);
    if (l3) {
      for (let i = 0; i < l3.length; i++) rivers.push(...lines(l3, i, l3.extent).filter((part) => part.length > 1));
    }
  }
  return { zoom, tiles, streets, polygons, rivers };
}

/** One drawing's FeatureCollection at `zoom`, from `readGround()`'s shapes. */
export function drawGround({ streets, polygons, rivers }, zoom) {
  const features = [];
  const classes = new Set(streetClassesAt(zoom));
  const simplifyAt = (line) => simplify(line.map((p) => toPx(p, zoom)), SIMPLIFY_PX).map((p) => toLonLat(p, zoom));
  for (const [id, { cls, parts }] of [...streets].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!classes.has(cls)) continue;
    const lines = parts.map(simplifyAt).filter((line) => line.length > 1 && lengthPx(line, zoom) >= MIN_LINE_PX);
    if (!lines.length) continue;
    features.push({
      type: 'Feature',
      properties: { kind: 'street', cls, id },
      geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines },
    });
  }
  for (const kind of ['water', 'park']) {
    for (const rings of polygons[kind]) {
      const drawn = rings.map(simplifyAt).filter((ring) => ring.length > 3);
      // A speck a drawing can't show is not drawn; the hole rings stay even if small.
      if (!drawn.length || areaPx(drawn[0], zoom) < MIN_AREA_PX) continue;
      features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'Polygon', coordinates: drawn } });
    }
  }
  for (const part of rivers) {
    const line = simplifyAt(part);
    if (line.length < 2 || lengthPx(line, zoom) < MIN_LINE_PX) continue;
    features.push({ type: 'Feature', properties: { kind: 'river' }, geometry: { type: 'LineString', coordinates: line } });
  }
  return { type: 'FeatureCollection', features };
}

/** What a drawing holds, by kind, its street classes, and its size as stored (JSON bytes). */
export function describe(drawn) {
  const counts = {};
  const classes = {};
  for (const f of drawn.features) {
    const { kind, cls } = f.properties;
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (cls) classes[cls] = (classes[cls] ?? 0) + 1;
  }
  return { counts, classes, features: drawn.features.length, bytes: Buffer.byteLength(JSON.stringify(drawn)) };
}

/** A line's length on a drawing at `zoom`, in pixels. */
export function lengthPx(line, zoom) {
  let sum = 0;
  let last = toPx(line[0], zoom);
  for (let i = 1; i < line.length; i++) {
    const next = toPx(line[i], zoom);
    sum += Math.hypot(next[0] - last[0], next[1] - last[1]);
    last = next;
  }
  return sum;
}

/** A ring's area on a drawing at `zoom`, in square pixels (shoelace). */
export function areaPx(ring, zoom) {
  const pts = ring.map((p) => toPx(p, zoom));
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Ramer–Douglas–Peucker on points in drawing pixels: drops a point when it lies within
 * `tolerance` pixels of the line its neighbours keep. Both ends always stay.
 */
export function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const [dx, dy] = [bx - ax, by - ay];
    const len = Math.hypot(dx, dy);
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i];
      const d = len === 0 ? Math.hypot(x - ax, y - ay) : Math.abs(dy * x - dx * y + bx * ay - by * ax) / len;
      if (d > best) (best = d), (at = i);
    }
    if (best > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
