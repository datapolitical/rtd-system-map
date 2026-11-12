import { openModel } from '../drawn/model.mjs';
import path from 'node:path';
import { TILE } from '../drawn/mercator.mjs';
const root = path.resolve(process.argv[2] ?? 'qa/recall/fixtures/3e38acb');
const m = await openModel({ root, theme: 'dark' });
for (const tz of [10, 12, 14]) {
  const z = tz;
  const lines = m.zoom(z).lines;
  const set = new Set();
  for (const l of lines) for (const part of l.parts) for (const p of part) set.add(`${Math.floor(p[0] / TILE)},${Math.floor(p[1] / TILE)}`);
  const withN = new Set();
  for (const k of set) { const [x, y] = k.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) withN.add(`${x + dx},${y + dy}`); }
  console.log('tz', tz, 'tiles with network', set.size, 'with ring', withN.size);
}
