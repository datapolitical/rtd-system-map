import { load } from './lib.mjs';
import { toWorld, toLonLat, segmentDistance } from '../drawn/mercator.mjs';
const { model, data } = await load(process.argv[2]);
const z = 17;
const m = model.zoom(z);
const rail = m.lines.filter((l) => l.layer === 'rail');
const mpp = (lat) => (40075016.686 * Math.cos(lat * Math.PI / 180)) / (512 * 2 ** z);
const out = [];
for (const f of data.stops.features) {
  if (f.properties.platform !== 1) continue;
  const p = toWorld(f.geometry.coordinates, z);
  const routes = String(f.properties.lines ?? '').split(/\s+/).filter(Boolean);
  let best = Infinity, any = Infinity;
  for (const l of rail) for (const part of l.parts) for (let i = 1; i < part.length; i++) {
    const d = segmentDistance(p, part[i - 1], part[i]).d;
    if (routes.includes(String(l.route))) best = Math.min(best, d);
    any = Math.min(any, d);
  }
  const k = mpp(f.geometry.coordinates[1]);
  out.push({ name: f.properties.name, routes: routes.join(' '), own: best * k, any: any * k, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
}
out.sort((a, b) => b.own - a.own);
for (const o of out.slice(0, 25)) console.log(o.own.toFixed(1), o.any.toFixed(1), o.routes, '|', o.name, o.lat.toFixed(5), o.lon.toFixed(5));
console.log('n', out.length, 'median', out.map(o=>o.own).sort((a,b)=>a-b)[out.length>>1].toFixed(1));
