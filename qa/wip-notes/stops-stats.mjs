import { open } from './open.mjs';
import { streetsOf, metresPerPx, tokens, segDist, Grid } from '../drawn/buslines.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
const { model } = await open(process.argv[2] ?? '3e38acb');
const z = +(process.argv[3] ?? 16);
const at = model.zoom(z);
const streets = streetsOf(at);
const byRoute = new Map();
for (const s of streets) for (const r of s.routes) { if (!byRoute.has(r)) byRoute.set(r, new Grid()); const g = byRoute.get(r); for (let i = 1; i < s.part.length; i++) { const a = s.part[i-1], b = s.part[i]; g.add({ s, a, b, stamp: 0 }, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); } }
// rail lines
const railRoutes = new Set();
for (const l of at.lines) if (l.mode === 'rail') { const r = String(l.route); railRoutes.add(r); if (!byRoute.has(r)) byRoute.set(r, new Grid()); const g = byRoute.get(r); for (const part of l.parts) for (let i = 1; i < part.length; i++) { const a = part[i-1], b = part[i]; g.add({ a, b, stamp: 0 }, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); } }
const stops = at.marks.filter((m) => m.source === 'stops' && m.kind === 'circle');
console.log('stops', stops.length);
const rows = [];
for (const m of stops) {
  const lines = tokens(m.properties.lines);
  if (!lines.length) { rows.push({ m, d: null, why: 'no lines' }); continue; }
  const mpp = metresPerPx(toLonLat(m.at, z)[1], z);
  let best = Infinity, any = false;
  for (const r of lines) { const g = byRoute.get(r); if (!g) continue; any = true; for (const c of g.near(m.at, 400)) { const d = segDist(m.at, c.a, c.b).d; if (d < best) best = d; } }
  rows.push({ m, d: any ? best * mpp : null, why: any ? '' : 'route not drawn', lat: toLonLat(m.at, z)[1], lon: toLonLat(m.at, z)[0] });
}
const ds = rows.filter((r) => r.d != null).map((r) => r.d).sort((a, b) => a - b);
const q = (p) => ds[Math.floor(p * (ds.length - 1))].toFixed(1);
console.log('with line', ds.length, 'median', q(0.5), 'p90', q(0.9), 'p95', q(0.95), 'p99', q(0.99), 'max', ds.at(-1).toFixed(0));
console.log('no lines', rows.filter((r) => r.why === 'no lines').length, 'route not drawn', rows.filter((r) => r.why === 'route not drawn').length);
for (const t of [15, 20, 25, 30, 40, 60, 100]) console.log('> ', t, 'm:', ds.filter((d) => d > t).length);
const far = rows.filter((r) => r.d > 25).sort((a, b) => b.d - a.d);
for (const r of far.slice(0, 50)) console.log(r.d.toFixed(0).padStart(5), r.m.properties.name, '|', r.m.properties.lines, r.lat.toFixed(5), r.lon.toFixed(5));
const nr = rows.filter((r) => r.why === 'route not drawn');
for (const r of nr.slice(0, 15)) console.log('notdrawn', r.m.properties.name, '|', r.m.properties.lines, r.m.properties.id);
