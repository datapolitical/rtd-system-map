import fs from 'node:fs';
import path from 'node:path';
import { openModel, pageSources } from '../drawn/model.mjs';
const ROOT = path.resolve(process.argv[2]);
const data = {};
for (const n of await pageSources(ROOT)) data[n] = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', n + '.geojson')));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/meta.json')));
const model = await openModel({ root: ROOT, theme: 'dark', data, meta });
for (const z of [10, 10.5, 13, 17]) {
  const m = model.zoom(z);
  const layers = new Map();
  for (const l of m.lines) { const k = l.layer; layers.set(k, (layers.get(k) ?? 0) + 1); }
  console.log('z', z, 'lines', [...layers].map(([k, v]) => k + ':' + v).join(' '));
  const mk = new Map();
  for (const l of m.marks) { const k = l.layer + '|' + (l.image ?? l.kind); const o = mk.get(k) ?? { n: 0, op: 0 }; o.n++; if (l.opacity >= .5) o.op++; mk.set(k, o); }
  console.log('  marks', [...mk].filter(([k]) => /station|platform|facil/.test(k)).map(([k, v]) => k + ' ' + v.n + '/' + v.op).join('; '));
  const rail = m.lines.filter((l) => l.layer === 'rail');
  const w = new Map();
  for (const l of rail) w.set(l.width.toFixed(2), (w.get(l.width.toFixed(2)) ?? 0) + 1);
  console.log('  rail widths', [...w]);
}
const m = model.zoom(13);
const st = m.marks.filter((x) => x.layer === 'stations').slice(0, 3);
console.log(JSON.stringify(st.map((x) => ({ ...x, properties: x.properties })), null, 0).slice(0, 1500));
const rl = m.lines.filter((l) => l.layer === 'rail').slice(0, 2);
console.log(JSON.stringify(rl.map((x) => ({ route: x.route, slot: x.slot, offset: x.offset, width: x.width, nparts: x.parts.length, props: x.properties })), null, 0).slice(0, 1500));
