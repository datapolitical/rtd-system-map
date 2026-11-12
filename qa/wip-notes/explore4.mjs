import { buildStyle } from '../drawn/model.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { styleView } from '../drawn/stylekit.mjs';
import { contrast, oklch, parse, hex, deltaE, grey, luminance } from '../drawn/colours.mjs';
const root = path.resolve(process.argv[2]), theme = process.argv[3];
const style = await buildStyle(root, theme);
const names = style.metadata['rtd:data-sources'];
const data = Object.fromEntries(names.map((n) => [n, JSON.parse(fs.readFileSync(path.join(root, 'public/data', n + '.geojson'), 'utf8'))]));
const v = styleView({ style, data });
const land = v.colour(v.layerById('land'), 'background-color', 12, {});
// text layers
for (const l of v.layers) {
  if (l.type !== 'symbol' || l.layout?.['text-field'] === undefined || !v.draws(l)) continue;
  const rs = v.reps(l);
  const tc = new Set(), hc = new Set();
  for (const r of rs.slice(0, 80)) {
    const c = v.colour(l, 'text-color', 14, r.props); if (c) tc.add(hex(c));
    const h = v.colour(l, 'text-halo-color', 14, r.props); if (h) hc.add(hex(h));
  }
  const grounds = { land: hex(land) };
  console.log(l.id.padEnd(26), 'text', [...tc].join(','), 'halo', [...hc].join(','), 'hw', l.paint?.['text-halo-width'] ?? '-', [...tc].map((t) => [...hc, hex(land)].map((g) => contrast(parse(t), parse(g)).toFixed(2)).join('/')).join(' '), 'reps', rs.length);
}
for (const l of v.layers) if (l.source === 'openmaptiles' && (l.type === 'fill' || l.type === 'line')) {
  const c = v.colour(l, l.type === 'fill' ? 'fill-color' : 'line-color', 16, { class: 'minor', $type: 2 });
  console.log(l.id.padEnd(22), l.type, c ? hex(c) : null, c ? contrast(c, land).toFixed(2) : '');
}
