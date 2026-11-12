import { Tiles, vectorSources } from '../drawn/tiles.mjs';
import { tileAt } from '../drawn/mercator.mjs';
import { openModel } from '../drawn/model.mjs';
import path from 'node:path';
const root = path.resolve('qa/recall/fixtures/3e38acb');
const m = await openModel({ root, theme: 'dark' });
const t = new Tiles({ root, source: vectorSources(m.style)[0] });
const [tx, ty] = tileAt([-105.0005, 39.753], 14);
console.log(tx, ty, await t.maxzoom());
const tile = await t.tile(14, tx, ty);
for (const name of ['place', 'poi', 'aerodrome_label', 'water_name', 'transportation_name']) {
  const l = tile.layers[name];
  console.log(name, l?.length, l?.extent);
  if (!l) continue;
  const seen = {};
  for (let i = 0; i < l.length; i++) { const f = l.feature(i); const k = f.type + '/' + (f.properties.class ?? '') + '/' + (f.properties.network ?? ''); seen[k] = (seen[k] || 0) + 1; if (i < 3) console.log(' ', f.type, JSON.stringify(f.properties).slice(0, 300)); }
  console.log(' ', JSON.stringify(seen));
}
