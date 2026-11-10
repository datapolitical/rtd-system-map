// The whole district at every zoom, as the drawn model sees it, with the
// time and memory it takes: `node qa/drawn/describe.mjs [dark|light]`.
// This is the model's own measure of the "Done when" line in issue #42: a
// district pass over zooms 9 to 17 by halves, no browser, tiles cached.
//
// It prints one line per zoom (counts of lines, marks, labels and areas) and
// the total, so a run can be compared with the last.
import { openModel, ZOOMS } from './model.mjs';

const theme = process.argv[2] === 'light' ? 'light' : 'dark';
const started = Date.now();
const model = await openModel({ theme });
const opened = Date.now() - started;
let zooms = 0;
let totals = { lines: 0, marks: 0, labels: 0, areas: 0 };
for (const z of ZOOMS) {
  const t = Date.now();
  const at = model.zoom(z);
  const counts = { lines: at.lines.length, marks: at.marks.length, labels: at.labels.length, areas: at.areas.length };
  zooms++;
  for (const k of Object.keys(totals)) totals[k] += counts[k];
  console.log(`${z.toFixed(1).padStart(4)}  lines ${counts.lines}  marks ${counts.marks}  labels ${counts.labels}  areas ${counts.areas}  ${Date.now() - t}ms`);
}
const elapsed = Date.now() - started;
console.log(`${theme}: ${zooms} zooms in ${(elapsed / 1000).toFixed(1)}s (open ${opened}ms); lines ${totals.lines}, marks ${totals.marks}, labels ${totals.labels}, areas ${totals.areas}; rss ${Math.round(process.memoryUsage().rss / 1e6)}MB`);
