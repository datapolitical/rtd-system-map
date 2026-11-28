// What the build's lettering plan says (#234): its size, its counts, and the two checks
// that read it. The page will draw this plan and decide nothing (#158). Structural
// faults, overlapping labels and unexplained zoom changes all fail. `npm run check:plan`.
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
console.log('Neighbouring drawings: before -> after; carried (of which retained despite no fresh placement), moved, handovers, gave way, added');
for (const t of report.transitions) console.log(`  ${t.from} -> ${t.to}: ${t.before} -> ${t.after}; ${t.carried} (${t.retained} retained), ${t.moved} moved, ${t.handovers} handovers, ${t.gaveWay} gave way, ${t.added} added`);
list('Overlapping label pairs (must be none)', report.overlap.byPair);
list('Zoom changes without a recorded reason (must be none)', report.carry.byKind);
const faults = planFaults(plan);
if (faults.length) {
  console.error(`The plan is broken: ${faults.length} structural faults`);
  for (const f of faults.slice(0, 20)) console.error(`  ${JSON.stringify(f)}`);
  process.exit(1);
}
if (report.overlap.count || report.carry.count) {
  console.error(`The carried plan is inconsistent: ${report.overlap.count} overlaps and ${report.carry.count} unrecorded changes`);
  process.exit(1);
}
console.log('The plan is whole and consistent: unique ids, ink on every stop, no overlaps, and every zoom change explained.');
