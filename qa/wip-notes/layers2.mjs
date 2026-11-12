import { openModel } from '../drawn/model.mjs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const m = await openModel({ root, theme: 'dark' });
for (const [i, l] of m.style.layers.entries()) {
  if (l.type === 'symbol') continue;
  console.log(i, l.type, l.id, l.source, l['source-layer'] ?? '', 'z', l.minzoom ?? '-', l.maxzoom ?? '-', 'filter', JSON.stringify(l.filter)?.slice(0,90));
}
const z = m.zoom(14);
const by = {};
for (const l of z.lines) { by[l.layer] = (by[l.layer]||0)+1 }
console.log(by);
const bm = {};
for (const l of z.labels) { bm[l.layer] = (bm[l.layer]||0)+1 }
console.log(bm);
const mk = {};
for (const l of z.marks) { mk[l.layer+'/'+l.image] = (mk[l.layer+'/'+l.image]||0)+1 }
console.log(mk);
