import { load } from './lib.mjs';
import { toLonLat, toWorld } from '../drawn/mercator.mjs';
import { contextOf } from '../drawn/rail2lines.mjs';
const [root, z, lat, lon, r] = process.argv.slice(2);
const { model } = await load(root);
const zm = model.zoom(Number(z));
const c = contextOf(zm);
const P = toWorld([Number(lon), Number(lat)], Number(z));
const R = Number(r ?? 20);
for (const { ch, samples } of c.sweep()) {
  const near = samples.filter((s) => Math.hypot(s.p[0] - P[0], s.p[1] - P[1]) < R);
  if (!near.length) continue;
  const s = near[Math.floor(near.length / 2)];
  console.log('chain', ch.route, 'off', s.off, 'width', s.width, 'steady', s.steady.toFixed(0), 'n', near.length);
  for (const n of s.nbrs) console.log('   nbr', n.route, 'lat', n.lat.toFixed(2), 'off', n.off, 'apart', n.apart.toFixed(2), 'steady', n.steady.toFixed(0), 'w', n.width);
}
