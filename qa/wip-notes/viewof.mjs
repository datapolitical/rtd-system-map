import { buildStyle } from '../drawn/model.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { styleView } from '../drawn/stylekit.mjs';
export async function viewOf(rootArg, theme) {
  const root = path.resolve(rootArg);
  const style = await buildStyle(root, theme);
  const names = style.metadata['rtd:data-sources'];
  const data = Object.fromEntries(names.map((n) => [n, JSON.parse(fs.readFileSync(path.join(root, 'public/data', n + '.geojson'), 'utf8'))]));
  return styleView({ style, data });
}
