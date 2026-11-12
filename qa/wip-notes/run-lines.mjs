import { load } from './lib.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
import { lineFaults2 } from '../drawn/rail2lines.mjs';
const [root, zs, kindsArg, topArg] = process.argv.slice(2);
const zooms = zs.split(',').map(Number);
const kinds = kindsArg && kindsArg !== 'all' ? kindsArg.split(',') : undefined;
const top = Number(topArg ?? 8);
const { model, data } = await load(root);
for (const z of zooms) {
  const t0 = Date.now();
  const zm = model.zoom(z);
  const faults = lineFaults2(zm, { data, kinds });
  const by = new Map();
  for (const f of faults) { if (!by.has(f.kind)) by.set(f.kind, []); by.get(f.kind).push(f); }
  console.log(`z${z}: ${faults.length} faults, ${Date.now() - t0} ms; ` + [...by].map(([k, v]) => `${k}=${v.length}`).join(' '));
  for (const [k, v] of by) {
    for (const f of v.slice(0, top)) { const [lon, lat] = toLonLat(f.px, z); console.log(`   ${k} ${lat.toFixed(5)},${lon.toFixed(5)} ${f.route ?? ''} | ${f.msg.slice(0, 230)}`); }
  }
}
