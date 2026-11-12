// shallow crossings between street features with no shared vertex
import fs from 'node:fs';
const root = 'qa/recall/fixtures/3e38acb/public/data/';
const j = JSON.parse(fs.readFileSync(root + 'streets.geojson'));
const lat0 = 39.75, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
const P = (c) => [c[0] * kx, c[1] * ky];
const segs = [];
j.features.forEach((f, i) => { const cs = f.geometry.coordinates.map(P); for (let k = 1; k < cs.length; k++) segs.push({ i, k, a: cs[k - 1], b: cs[k] }); });
const CELL = 100; const grid = new Map();
segs.forEach((s, n) => { const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / CELL), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / CELL), y0 = Math.floor(Math.min(s.a[1], s.b[1]) / CELL), y1 = Math.floor(Math.max(s.a[1], s.b[1]) / CELL); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const key = x + ',' + y; (grid.get(key) ?? grid.set(key, []).get(key)).push(n); } });
const out = [];
const seen = new Set();
for (const [key, list] of grid) for (let u = 0; u < list.length; u++) for (let v = u + 1; v < list.length; v++) {
  const s = segs[list[u]], t = segs[list[v]];
  if (s.i === t.i) continue; { const za = j.features[s.i].properties.zoom ?? '', zb = j.features[t.i].properties.zoom ?? ''; if (za && zb && za !== zb) continue; }
  const pk = list[u] + ':' + list[v]; if (seen.has(pk)) continue; seen.add(pk);
  const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], ex = t.b[0] - t.a[0], ey = t.b[1] - t.a[1];
  const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
  const tt = ((t.a[0] - s.a[0]) * ey - (t.a[1] - s.a[1]) * ex) / den, uu = ((t.a[0] - s.a[0]) * dy - (t.a[1] - s.a[1]) * dx) / den;
  if (tt <= 0.001 || tt >= 0.999 || uu <= 0.001 || uu >= 0.999) continue;
  const ang = Math.acos(Math.abs(dx * ex + dy * ey) / (Math.hypot(dx, dy) * Math.hypot(ex, ey))) * 180 / Math.PI;
  const p = [s.a[0] + dx * tt, s.a[1] + dy * tt];
  out.push({ a: s.i, b: t.i, ang, lat: p[1] / ky, lon: p[0] / kx, ra: j.features[s.i].properties.routes, rb: j.features[t.i].properties.routes, za: j.features[s.i].properties.zoom, zb: j.features[t.i].properties.zoom });
}
out.sort((x, y) => x.ang - y.ang);
console.log(out.length, 'crossings; under 30 deg:', out.filter((o) => o.ang < 30).length);
for (const o of out.filter((o) => o.ang < 30).slice(0, 40)) console.log(o.ang.toFixed(1), o.lat.toFixed(5), o.lon.toFixed(5), o.a, o.ra, o.za ?? '', '|', o.b, o.rb, o.zb ?? '');
