import { buildStyle } from '../drawn/model.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { styleView } from '../drawn/stylekit.mjs';
import { contrast, oklch, parse, hex, deltaE, grey } from '../drawn/colours.mjs';
const root = path.resolve(process.argv[2]), theme = process.argv[3];
const style = await buildStyle(root, theme);
const names = style.metadata['rtd:data-sources'];
const data = Object.fromEntries(names.map((n) => [n, JSON.parse(fs.readFileSync(path.join(root, 'public/data', n + '.geojson'), 'utf8'))]));
const t0 = Date.now();
const v = styleView({ style, data });
const land = v.colour(v.layerById('land'), 'background-color', 12, {});
console.log('land', hex(land));
for (const l of v.layers) {
  const rs = v.reps(l);
  if (l.type === 'line' && l.source === 'routes' || ['street', 'bus-part-time', 'bus-limited'].includes(l.id)) {
    for (const r of rs.slice(0, 40)) {
      const c = v.colour(l, 'line-color', 16, r.props);
      if (!c) continue;
      const o = oklch(c);
      console.log(l.id.padEnd(14), String(r.props.route ?? r.props.cls ?? r.props.tier), String(r.props.tier ?? ''), r.props.wk ?? '', hex(c), 'contrast', contrast(c, land).toFixed(2), 'L', o.L.toFixed(2), 'C', o.C.toFixed(3), 'h', o.h.toFixed(0), 'n', r.n);
    }
  }
}
console.log('ms', Date.now() - t0);
