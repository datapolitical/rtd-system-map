// node run-det.mjs <build> <detector> <zoom,zoom..> [limit]
import { open } from './open.mjs';
import * as B from '../drawn/buslines.mjs';
import { PLACE_SOURCES } from '../drawn/routes.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
const [build, det, zs, limit] = [process.argv[2], process.argv[3], (process.argv[4] ?? '16').split(',').map(Number), +(process.argv[5] ?? 40)];
const { model } = await open(build);
for (const z of zs) {
  const at = model.zoom(z);
  const t = Date.now();
  const found = B[det](at, { places: model.places(z, PLACE_SOURCES) });
  console.log(`z${z}: ${found.length} ${det} in ${Date.now() - t} ms`);
  const by = {}; for (const f of found) by[f.kind] = (by[f.kind] ?? 0) + 1; console.log(JSON.stringify(by));
  for (const f of found.slice(0, limit)) { const [lon, lat] = toLonLat(f.px, z); console.log(' ', f.kind, lat.toFixed(5), lon.toFixed(5), f.msg); }
}
