// What the build's lettering plan says (#234): its size, its counts, and the two checks
// that read it. The page will draw this plan and decide nothing; until then the checks
// report what the sheets' own placement leaves for MapLibre to resolve, and only a
// structural fault fails. `npm run check:plan`.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { planFaults, planReport } from './lib/lettering-plan.mjs';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
let plan;
try {
  plan = JSON.parse(await readFile(path.join(DATA, 'lettering-plan.json'), 'utf8'));
} catch (err) {
  console.error(`public/data/lettering-plan.json is missing or unreadable (${err.code ?? err.message}): run \`npm run build:sheets\``);
  process.exit(1);
}
const raw = JSON.stringify(plan);
const report = planReport(plan);
const list = (title, rows) => {
  console.log(title);
  for (const [what, n] of rows) console.log(`  ${n.toString().padStart(6)}  ${what}`);
};
console.log(`lettering plan: ${report.labels} labels, ${report.stops} placements on ${plan.drawings.length} drawings`);
list('By kind', Object.entries(report.byKind));
console.log(`  ${(Buffer.byteLength(raw) / 1e3).toFixed(0)} KB raw, ${(gzipSync(raw).length / 1e3).toFixed(0)} KB gzipped; ${report.conditional} placements shown only while a route is picked`);
list('Overlapping label pairs (the plan must place them apart)', report.overlap.byPair);
list('Zoom changes without a recorded reason (the plan must record why)', report.carry.byKind);
const faults = planFaults(plan);
if (faults.length) {
  console.error(`The plan is broken: ${faults.length} structural faults`);
  for (const f of faults.slice(0, 20)) console.error(`  ${JSON.stringify(f)}`);
  process.exit(1);
}
console.log('The plan is whole: unique ids, ink on every stop, stops in zoom order, parents present.');
