import { openModel } from '../drawn/model.mjs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const m = await openModel({ root, theme: 'dark' });
for (const [i, l] of m.style.layers.entries()) {
  if (l.type !== 'symbol') continue;
  console.log(i, l.id, l.source, l['source-layer'] ?? '', 'z', l.minzoom ?? '-', l.maxzoom ?? '-', 'place', l.layout?.['symbol-placement'] ?? 'point', 'text', JSON.stringify(l.layout?.['text-field'])?.slice(0, 60), 'icon', l.layout?.['icon-image'] !== undefined, 'filter', JSON.stringify(l.filter)?.slice(0,100));
}
