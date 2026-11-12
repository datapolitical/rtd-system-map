import fs from 'node:fs';
import path from 'node:path';
import { openModel, pageSources } from '../drawn/model.mjs';
export async function load(rootArg, theme = 'dark') {
  const ROOT = path.resolve(rootArg);
  const data = {};
  for (const n of await pageSources(ROOT)) data[n] = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', n + '.geojson')));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/meta.json')));
  const model = await openModel({ root: ROOT, theme, data, meta });
  return { model, data, meta, ROOT };
}
