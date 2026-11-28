// Recheck the trial with its own renderer model and generated geometry.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sampleZooms } from './zoom/rules.mjs';
import { checkBundleSpacing, terminalGaps } from './zoom/trial-spacing.mjs';

const [rootArg, output = 'qa/.scratch/zoom-spacing/report.json'] = process.argv.slice(2);
if (!rootArg) throw new Error('Usage: npm run check:zoom-spacing -- <built trial checkout> [report.json]');
const root = path.resolve(rootArg);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const model = await import(pathToFileURL(path.join(root, 'public/js/zoom/model.js')));
const { MIN_ZOOM: min, MAX_ZOOM: max, RAIL_DRAWINGS } = model;
const bundle = JSON.parse(await readFile(path.join(root, 'public/data/zoom-prototype/trial.json'), 'utf8'));
const pin = JSON.parse(await readFile(new URL('./recall/prototype-spacing.json', import.meta.url), 'utf8'));
const zooms = sampleZooms(RAIL_DRAWINGS.slice(1).map(({ zoom }) => ({ zoom, kind: 'handover' })), min, max);
const results = zooms.map((zoom) => ({
  zoom,
  pairs: checkBundleSpacing(bundle, pin, zoom, model),
  ends: terminalGaps(bundle, zoom, model),
}));
const failed = results.filter(({ pairs, ends }) => !ends.length || [...pairs, ...ends].some(({ ok }) => !ok));
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ commit, zooms, results, failed }, null, 2) + '\n');
console.log(`Trial ${commit}: zooms ${zooms.join(', ')}. ${failed.length} zooms with faults. Report: ${output}`);
if (failed.length) process.exitCode = 1;
