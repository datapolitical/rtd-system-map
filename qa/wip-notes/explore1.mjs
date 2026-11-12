import { openModel } from '../drawn/model.mjs';
const root = process.argv[2], theme = process.argv[3] ?? 'dark';
const t0 = Date.now();
const model = await openModel({ root, theme });
console.log('open', Date.now() - t0, 'ms');
for (const l of model.style.layers) console.log(l.id.padEnd(28), l.type.padEnd(10), String(l.source ?? '').padEnd(14), l.minzoom ?? '', l.maxzoom ?? '');
const t1 = Date.now();
const at = model.zoom(16);
console.log('zoom16', Date.now() - t1, 'ms', at.lines.length, at.marks.length, at.labels.length, at.areas.length, 'rss', Math.round(process.memoryUsage().rss / 1e6));
