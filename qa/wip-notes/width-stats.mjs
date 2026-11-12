import { open } from './open.mjs';
import { streetsOf, graphOf, metresPerPx, tokens } from '../drawn/buslines.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
const { model } = await open(process.argv[2] ?? '3e38acb');
const z = +(process.argv[3] ?? 16);
const at = model.zoom(z);
const streets = streetsOf(at);
const { nodes } = graphOf(streets);
const stops = at.marks.filter((m) => m.source === 'stops' && m.kind === 'circle');
let deg2 = 0, diffCls = 0, sameRoutes = 0, sameRoutesDiffCls = 0;
const rows = [];
for (const n of nodes.values()) {
  if (n.through.length || n.ends.length !== 2) continue;
  const [a, b] = n.ends;
  if (a.s === b.s) continue;
  deg2++;
  const ra = [...a.s.routes].sort().join(' '), rb = [...b.s.routes].sort().join(' ');
  const same = ra === rb;
  const dw = Math.abs(a.s.w - b.s.w);
  const dc = a.s.cls !== b.s.cls;
  if (same) sameRoutes++;
  if (dc) diffCls++;
  if (same && dc) sameRoutesDiffCls++;
  if (dc || dw > 0.3) {
    const mpp = metresPerPx(toLonLat(n.p, z)[1], z);
    let sd = Infinity;
    const union = new Set([...a.s.routes, ...b.s.routes]);
    for (const k of stops) { const d = Math.hypot(k.at[0] - n.p[0], k.at[1] - n.p[1]) * mpp; if (d < sd && tokens(k.properties.lines).some((r) => union.has(r))) sd = d; }
    const [lon, lat] = toLonLat(n.p, z);
    rows.push({ same, ra, rb, ca: a.s.cls, cb: b.s.cls, wa: a.s.w, wb: b.s.w, la: a.s.len, lb: b.s.len, sd, lat, lon, ta: a.s.tag, tb: b.s.tag });
  }
}
console.log({ deg2, diffCls, sameRoutes, sameRoutesDiffCls, widthDiffRows: rows.length });
rows.sort((x, y) => (y.same - x.same) || x.sd - y.sd);
for (const r of rows) console.log(r.same ? 'SAME' : 'diff', `${r.ca}->${r.cb}`, `${r.wa.toFixed(1)}->${r.wb.toFixed(1)}`, `len ${r.la}/${r.lb}`, 'stop', r.sd === Infinity ? '-' : r.sd.toFixed(0) + 'm', r.lat.toFixed(5), r.lon.toFixed(5), '[' + r.ra + '] -> [' + r.rb + ']', r.ta, r.tb);
