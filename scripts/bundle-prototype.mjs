// Prototype: bundles the bus routes in an already built routes.geojson
// (scripts/lib/busbundles.mjs), without a full build. Reads the file given
// (default public/data/routes.geojson, which must not be bundled already),
// writes public/data/routes.geojson, and prints what it found.
//
//   node scripts/bundle-prototype.mjs [routes.geojson]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { busBundles } from './lib/busbundles.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'routes.geojson');
const from = process.argv[2] ?? OUT;
const geo = JSON.parse(fs.readFileSync(from, 'utf8'));
const buses = geo.features.filter((f) => f.properties.mode === 'bus');
if (buses.some((f) => 'slot' in f.properties)) throw new Error(`${from} is bundled already; give the unbundled file`);

const started = performance.now();
const { features, places, crossings } = busBundles(buses);
const ms = Math.round(performance.now() - started);
const out = { ...geo, features: [...features, ...geo.features.filter((f) => f.properties.mode !== 'bus')] };
const text = JSON.stringify(out);
fs.writeFileSync(OUT, text);

// Downtown: the station where the most lines meet.
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'stations.geojson'), 'utf8')).features;
const hub = stations.reduce((a, b) => ((b.properties.lines ?? '').split(' ').length > (a.properties.lines ?? '').split(' ').length ? b : a));
const [hx, hy] = hub.geometry.coordinates;
const km = ([x, y]) => Math.hypot((x - hx) * 111.32 * Math.cos((hy * Math.PI) / 180), (y - hy) * 110.54);
const sizes = {};
for (const p of places) sizes[p.routes.length] = (sizes[p.routes.length] ?? 0) + 1;
const downtown = places.filter((p) => km(p.at) <= 2.5);
const widest = (list) => list.reduce((a, b) => (b.routes.length > a.routes.length ? b : a), { routes: [] });
console.log(JSON.stringify({
  ms,
  bus_in: buses.length,
  bus_out: features.length,
  bytes_in: fs.statSync(from).size,
  bytes_out: text.length,
  bundles: places.length,
  sizes,
  widest: widest(places),
  widest_downtown: widest(downtown),
  crossings: crossings.length,
  crossings_downtown: crossings.filter((c) => km(c.at) <= 2.5).length,
  crossing_list_downtown: crossings.filter((c) => km(c.at) <= 2.5).slice(0, 40),
  hub: { name: hub.properties.name, at: hub.geometry.coordinates },
  longest_outside: places.filter((p) => km(p.at) > 5).sort((a, b) => b.meters - a.meters).slice(0, 5),
}, null, 1));
