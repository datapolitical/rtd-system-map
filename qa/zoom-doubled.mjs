// What changes a bus line's shape from one drawing to the next, counted in a drawing:
//   - line drawn doubled: line with a second line beside it, 8 to 70 m to its side and running
//     within 30 degrees of it. A divided road drawn as its two carriageways, or a pair of ramps,
//     counts on both lines. One-way pairs a block apart do not: they are farther;
//   - small loops: for each piece, the shortest other way between its two ends; when the piece and
//     that way are under 400 m round it is a loop (an eye at a ramp or where a merged road ends, a
//     triangle at a junction, a lap at a terminal). Counted once each, over every bus street.
//   node qa/zoom-doubled.mjs [--all] <drawing.geojson> ...
// The doubled length is of the express streets alone, or of every bus street with --all. TOP=n
// lists the n places (500 m across) with the most.
import { readFileSync } from 'node:fs';

const all = process.argv.includes('--all');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) throw new Error('Usage: node qa/zoom-doubled.mjs [--all] <drawing.geojson> ...');
const STEP = 10, NEAR = 8, FAR = 70, TURN = Math.PI / 6, CELL = 80, ROUND = 400, SNAP = 4;
const lines = (g) => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];

function doubled(streets, kx, ky) {
  const samples = [];
  let total = 0;
  streets.forEach((f, id) => {
    for (const c of lines(f.geometry)) for (let i = 1; i < c.length; i++) {
      const a = [c[i - 1][0] * kx, c[i - 1][1] * ky], b = [c[i][0] * kx, c[i][1] * ky];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      total += len;
      const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let d = 0; d < len; d += STEP) samples.push({ id, x: a[0] + ((b[0] - a[0]) * d) / len, y: a[1] + ((b[1] - a[1]) * d) / len, heading });
    }
  });
  const grid = new Map();
  for (const s of samples) {
    const k = `${Math.floor(s.x / CELL)},${Math.floor(s.y / CELL)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(s);
  }
  const twin = samples.filter((s) => {
    const gx = Math.floor(s.x / CELL), gy = Math.floor(s.y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const o of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
      if (o.id === s.id || Math.hypot(o.x - s.x, o.y - s.y) > FAR) continue;
      let turn = Math.abs(o.heading - s.heading) % Math.PI;
      if (turn > Math.PI / 2) turn = Math.PI - turn;
      if (turn > TURN) continue;
      // To the side, not ahead: the next piece of the same street is not a second line.
      if (Math.abs(-(o.x - s.x) * Math.sin(s.heading) + (o.y - s.y) * Math.cos(s.heading)) >= NEAR) return true;
    }
    return false;
  });
  const places = new Map();
  for (const s of twin) {
    const k = `${Math.round(s.x / 500)},${Math.round(s.y / 500)}`;
    const p = places.get(k) ?? places.set(k, { n: 0, at: [s.x / kx, s.y / ky] }).get(k);
    p.n++;
  }
  return { total, length: twin.length * STEP, places: [...places.values()].sort((a, b) => b.n - a.n) };
}

function loops(streets, kx, ky) {
  const key = ([lon, lat]) => `${Math.round((lon * kx) / SNAP)},${Math.round((lat * ky) / SNAP)}`;
  const edges = [], at = new Map();
  for (const f of streets) for (const c of lines(f.geometry)) {
    let len = 0;
    for (let i = 1; i < c.length; i++) len += Math.hypot((c[i][0] - c[i - 1][0]) * kx, (c[i][1] - c[i - 1][1]) * ky);
    const e = { id: edges.length, a: key(c[0]), b: key(c.at(-1)), len };
    if (e.a === e.b) continue;
    edges.push(e);
    for (const n of [e.a, e.b]) (at.get(n) ?? at.set(n, []).get(n)).push(e);
  }
  const found = new Set();
  for (const e of edges) {
    // The shortest way from one end to the other without this piece, no longer than the round allows.
    const dist = new Map([[e.a, 0]]), via = new Map(), open = [[0, e.a]];
    while (open.length) {
      open.sort((p, q) => p[0] - q[0]);
      const [d, n] = open.shift();
      if (d > dist.get(n)) continue;
      if (n === e.b) break;
      for (const o of at.get(n) ?? []) {
        if (o === e) continue;
        const m = o.a === n ? o.b : o.a, nd = d + o.len;
        if (nd + e.len >= ROUND || nd >= (dist.get(m) ?? Infinity)) continue;
        dist.set(m, nd); via.set(m, [n, o]); open.push([nd, m]);
      }
    }
    if (!dist.has(e.b)) continue;
    const ring = [e.id];
    for (let n = e.b; n !== e.a;) { const [p, o] = via.get(n); ring.push(o.id); n = p; }
    found.add(ring.sort((p, q) => p - q).join(','));
  }
  return found.size;
}

for (const file of files) {
  const fc = JSON.parse(readFileSync(file, 'utf8'));
  const bus = fc.features.filter((f) => f.properties.kind === 'bus');
  const streets = all ? bus : bus.filter((f) => f.properties.express);
  const latitudes = bus.flatMap((f) => lines(f.geometry).flatMap((line) => line.map((p) => p[1])));
  if (!latitudes.length) throw new Error(`No bus street geometry in ${file}`);
  const latitude = latitudes.reduce((sum, latitude) => sum + latitude, 0) / latitudes.length;
  const kx = 111320 * Math.cos((latitude * Math.PI) / 180), ky = 110950;
  const d = doubled(streets, kx, ky);
  console.log(`${file}: ${all ? 'bus' : 'express'} streets ${(d.total / 1000).toFixed(1)} km in ${streets.length} pieces; doubled ${(d.length / 1000).toFixed(1)} km in ${d.places.length} places; loops under ${ROUND} m round, every bus street: ${loops(bus, kx, ky)}`);
  if (process.env.TOP) console.log(`  most: ${d.places.slice(0, +process.env.TOP).map((p) => `${p.at[1].toFixed(4)},${p.at[0].toFixed(4)} ${p.n * STEP} m`).join(' | ')}`);
}
