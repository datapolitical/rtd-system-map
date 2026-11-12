import { open } from './open.mjs';
import { describeEnd } from '../drawn/buslines.mjs';
import { PLACE_SOURCES } from '../drawn/routes.mjs';
import { toLonLat } from '../drawn/mercator.mjs';
const { model } = await open(process.argv[2] ?? '3e38acb');
const z = +(process.argv[3] ?? 16);
const at = model.zoom(z);
const ends = describeEnd(at, model.places(z, PLACE_SOURCES));
const f = (v, m) => (v === Infinity ? '-' : (v * m).toFixed(0));
for (const d of ends) { const [lon, lat] = toLonLat(d.E, z); console.log(d.s.layer.padEnd(13), d.s.routes.join(' ').padEnd(18), 'w', d.s.w.toFixed(1).padStart(4), 'under', d.under ? 'Y' : '-', 'stopOwn', f(d.stopOwn, d.m).padStart(4), 'stopAny', f(d.stopAny, d.m).padStart(4), 'stn', f(d.station, d.m).padStart(4), 'stnOwn', f(d.stationOwn, d.m).padStart(4), 'hall', f(d.hall, d.m).padStart(5), lat.toFixed(5), lon.toFixed(5)); }
