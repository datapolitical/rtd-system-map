import { viewOf } from './viewof.mjs';
import { weightFaults, classRows } from '../drawn/weights.mjs';
const [root, theme, tab] = process.argv.slice(2);
const v = await viewOf(root, theme);
if (tab) {
  for (const z of [10, 13, 16]) { console.log('z', z); for (const r of classRows(v, z)) console.log(' ', r.key.padEnd(24), 'w', r.width.toFixed(2), 'o', r.opacity.toFixed(2), 'ratio', r.ratio.toFixed(2), 'weight', r.weight.toFixed(1), r.worst ?? ''); }
}
const t = Date.now();
const f = weightFaults(v);
console.log(theme, f.length, 'findings', Date.now() - t, 'ms');
for (const x of f) console.log(x.kind, x.rule, x.layer, x.route ?? '', '|', x.msg);
