// The reported approach is a pinned QA location, never a rule in the map build.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spacingReport, checkBundleSpacing, terminalGaps } from './lib/zoom-spacing.mjs';

const bundle = JSON.parse(await readFile(process.argv[2] ?? 'public/data/zoom-prototype/trial.json', 'utf8'));
const pin = JSON.parse(await readFile(new URL('recall/prototype-spacing.json', import.meta.url), 'utf8'));
const recall = spacingReport(pin);
if (!recall.some((r) => !r.ok && r.minimumVisibleGap < 0)) throw new Error('Spacing detector missed the pinned overlapping rail.');
const zooms = [...new Set([12, 12.25, 12.5, 12.75, 12.99, 13, 13.01, 13.25, 13.5, 13.75, 14])].sort((a, b) => a - b);
const results = zooms.map((zoom) => ({ zoom, pairs: checkBundleSpacing(bundle, pin, zoom) }));
const failed = results.flatMap((r) => r.pairs.filter((p) => !p.ok).map((p) => ({ zoom: r.zoom, ...p })));
const terminals = zooms.map((zoom) => ({ zoom, ends: terminalGaps(bundle, zoom) }));
const failedTerminals = terminals.flatMap((r) => r.ends.filter((end) => !end.ok).map((end) => ({ zoom: r.zoom, ...end })));
const out = path.resolve(process.argv[3] ?? 'qa/.scratch/zoom-spacing/report.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ tolerancePx: 0.25, pinnedBuild: pin.build, recall, results, failed, terminals, failedTerminals,
  scope: 'Perpendicular centre-line distances on the pinned shared approach, sampled from the same pixel offsets used by the renderer. Visual captures are checked separately.' }, null, 2) + '\n');
console.log(JSON.stringify({ zooms: results.length, pairsChecked: results.length * pin.pairs.length, failed: failed.length,
  terminalEndsChecked: terminals.reduce((n, r) => n + r.ends.length, 0), failedTerminals: failedTerminals.length, zoom14: results.at(-1).pairs }));
if (failed.length || failedTerminals.length) process.exitCode = 1;
