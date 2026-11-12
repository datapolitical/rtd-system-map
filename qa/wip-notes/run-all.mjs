// node qa/.scratch/run-all.mjs <build> <out.json> [zooms] [detectors]
import fs from 'node:fs';
import { open } from './open.mjs';
import * as B from '../drawn/buslines.mjs';
import { styleFaults } from '../drawn/buslines-style.mjs';
import { PLACE_SOURCES } from '../drawn/routes.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
const [build, out, zs, only] = [process.argv[2], process.argv[3], (process.argv[4] ?? '13,13.5,14,14.5,15,15.5,16,16.5,17').split(',').map(Number), process.argv[5]?.split(',')];
const { model } = await open(build);
const rows = [];
const time = {};
const dets = { lineEnds: B.lineEnds, widthSteps: B.widthSteps, wedges: B.wedges, braids: B.braids, stopsOffLine: B.stopsOffLine, besideFaults: B.besideFaults, strandFaults: B.strandFaults, arrowFaults: B.arrowFaults, turnFaults: B.turnFaults, hallFaults: B.hallFaults };
for (const z of zs) {
  const at = model.zoom(z);
  const places = model.places(z, PLACE_SOURCES);
  for (const [name, fn] of Object.entries(dets)) {
    if (only && !only.includes(name)) continue;
    const t = Date.now();
    let found = [];
    try { found = fn(at, { places, data: model.data, applyFrom: {} }); } catch (e) { console.error(name, z, e.stack); }
    time[name] = (time[name] ?? 0) + Date.now() - t;
    for (const f of found) {
      const [lon, lat] = toLonLat(f.px, z);
      rows.push({ det: name, kind: f.kind, zoom: z, lat, lon, route: f.route, msg: f.msg, extra: { width: f.width, cls: f.cls, nearestM: f.nearestM, gapM: f.gapM, gapPx: f.gapPx, runPx: f.runPx, lengthM: f.lengthM, sameRoutes: f.sameRoutes, stand: f.stand, minGap: f.minGap, maxGap: f.maxGap, angle: f.angle, id: f.id, hopPx: f.hopPx, stepPx: f.stepPx, hallM: f.hallM, ratio: f.ratio, outsideM: f.outsideM } });
    }
  }
  console.log('z', z, rows.length, 'rows so far');
}
if (!only || only.includes('styleFaults')) {
  const sz = [...new Set([10, 10.5, 11, 11.5, 12, 12.5, ...zs])].sort((a, b) => a - b);
  for (const z of sz) {
    const t = Date.now();
    for (const f of styleFaults(model, z, { orderAt: 10 })) { const [lon, lat] = toLonLat(f.px, z); rows.push({ det: 'styleFaults', kind: f.kind, zoom: z, lat, lon, route: f.route, msg: f.msg }); }
    time.styleFaults = (time.styleFaults ?? 0) + Date.now() - t;
  }
}
console.log(JSON.stringify(time));
const by = {};
for (const r of rows) { by[r.kind] ??= new Set(); by[r.kind].add(r.zoom); }
for (const [k, v] of Object.entries(by)) console.log(k.padEnd(18), rows.filter((r) => r.kind === k).length, 'rows, zooms', [...v].sort((a, b) => a - b).join(','));
fs.writeFileSync(out, JSON.stringify(rows));
