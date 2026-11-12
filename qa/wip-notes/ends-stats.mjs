import { open } from './open.mjs';
import { describeEnd, metresPerPx } from '../drawn/buslines.mjs';
import { PLACE_SOURCES } from '../drawn/routes.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
const build = process.argv[2] ?? '3e38acb';
const { model } = await open(build);
for (const z of [14, 15, 16, 17]) {
  const at = model.zoom(z);
  const places = model.places(z, PLACE_SOURCES);
  const ends = describeEnd(at, places);
  const cnt = { total: ends.length, under: 0, stopOwn20m: 0, stopAny20m: 0, station30m: 0, hall: 0, none: 0 };
  const none = [];
  for (const d of ends) {
    if (d.under) { cnt.under++; continue; }
    if (d.stopOwn * d.m <= 20) { cnt.stopOwn20m++; continue; }
    if (d.stopAny * d.m <= 20) { cnt.stopAny20m++; continue; }
    if (d.station * d.m <= 40) { cnt.station30m++; continue; }
    if (d.hall <= 3) { cnt.hall++; continue; }
    cnt.none++; none.push(d);
  }
  console.log(z, JSON.stringify(cnt));
  if (z === 16) for (const d of none.slice(0, 60)) { const [lon, lat] = toLonLat(d.E, z); console.log('  ', d.s.layer, d.s.routes.join(' '), 'w', d.s.w.toFixed(1), 'stopOwn', (d.stopOwn * d.m).toFixed(0), 'stopAny', (d.stopAny * d.m).toFixed(0), 'station', (d.station * d.m).toFixed(0), 'hall', (d.hall * d.m).toFixed(0), lat.toFixed(5), lon.toFixed(5)); }
}
