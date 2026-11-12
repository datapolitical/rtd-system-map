import { openModel } from '../drawn/model.mjs';
import { placeSymbols } from '../drawn/place.mjs';
import { nameFaults } from '../drawn/names.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? 'qa/recall/fixtures/3e38acb');
const zooms = (process.argv[3] ?? '10,12,14,17').split(',').map(Number);
const withNames = process.argv[4] !== 'nonames';
const out = process.argv[5];
const m = await openModel({ root, theme: 'dark' });
const all = [];
for (const z of zooms) {
  const t0 = Date.now();
  const zm = m.zoom(z);
  const bands = m.linePlaced(z);
  const names = withNames ? await m.names(z) : [];
  const t1 = Date.now();
  const r = placeSymbols({ z, labels: [...zm.labels, ...names], marks: zm.marks, bands }, { layers: m.style.layers });
  const t2 = Date.now();
  const faults = nameFaults(r, zm);
  const t3 = Date.now();
  const by = {};
  for (const f of faults) by[f.kind] = (by[f.kind] || 0) + 1;
  console.log(`z${z}: load ${t1 - t0} ms, place ${t2 - t1} ms, check ${t3 - t2} ms; placed ${r.placed.length}, hidden ${r.hidden.length}`, JSON.stringify(by));
  for (const f of faults) { const [lon, lat] = toLonLat(f.px, z); all.push({ ...f, zoom: z, lat, lon }); }
}
if (out) fs.writeFileSync(out, JSON.stringify(all, null, 1));
