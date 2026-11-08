// Prototype: bundles the bus routes in an already built routes.geojson
// (scripts/lib/busbundles.mjs), without a full build. Reads the file given
// (default public/data/routes.geojson, which must not be bundled already),
// writes public/data/routes.geojson (or --out), and prints what it found and
// measured:
//
//   node scripts/bundle-prototype.mjs [routes.geojson] [--out file] [--all-tiers]
//
// --all-tiers bundles every tier, for comparison with the rule that bundles
// only routes every 30 minutes or better. The measurements are about
// downtown, taken as the station where the most lines meet
// (stations.geojson, read here): the bundles within DOWNTOWN_KM of it, the
// widest of them in members and in pixels at the zooms asked about, the
// crossings there, and the zoom the slots should open at: the first (in
// quarter zooms) where the widest downtown bundle, middle of its first line
// to middle of its last, is no wider than a downtown block. The block is
// measured on the data too: the median distance between cross streets
// along the bus routes downtown.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { busBundles, BUNDLED_TIERS } from './lib/busbundles.mjs';
import { BUS_PITCH, frequentWidth } from '../public/js/sizes.js';
import { TIERS } from './lib/stretches.mjs';

const DOWNTOWN_KM = 1.5;
const REPORT_ZOOMS = [12, 12.5, 13, 13.5, 14, 14.5];

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, bare = false) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const [, value] = args.splice(i, bare ? 1 : 2);
  return bare ? true : value;
};
const allTiers = flag('--all-tiers', true);
const OUT = flag('--out') ?? path.join(ROOT, 'public', 'data', 'routes.geojson');
const from = args[0] ?? path.join(ROOT, 'public', 'data', 'routes.geojson');
const geo = JSON.parse(fs.readFileSync(from, 'utf8'));
const buses = geo.features.filter((f) => f.properties.mode === 'bus');
if (buses.some((f) => 'slot' in f.properties || 'flat' in f.properties)) throw new Error(`${from} is bundled already; give the unbundled file`);

const started = performance.now();
const tiers = allTiers ? TIERS : BUNDLED_TIERS;
// Transit centers and Park-n-Rides: where routes end, the bundler ends them
// at the terminal's edge.
const terminals = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'facilities.geojson'), 'utf8')).features.map((f) => f.geometry.coordinates);
const directory = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'directory.json'), 'utf8'));
const ends = Object.fromEntries(directory.routes.filter((r) => r.mode === 'bus').map((r) => [r.route, (r.goes ?? []).map((g) => g.at).filter(Boolean)]));
const { features, places, crossings } = busBundles(buses, { tiers, terminals, ends });
const ms = Math.round(performance.now() - started);
const out = { ...geo, features: [...features, ...geo.features.filter((f) => f.properties.mode !== 'bus')] };
const text = JSON.stringify(out);
fs.writeFileSync(OUT, text);

// Downtown: the station where the most lines meet.
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'stations.geojson'), 'utf8')).features;
const hub = stations.reduce((a, b) => ((b.properties.lines ?? '').split(' ').length > (a.properties.lines ?? '').split(' ').length ? b : a));
const [hx, hy] = hub.geometry.coordinates;
const kx = 111320 * Math.cos((hy * Math.PI) / 180);
const ky = 110540;
const meters = ([x, y]) => [(x - hx) * kx, (y - hy) * ky];
const km = (p) => Math.hypot(...meters(p)) / 1000;
const metersPerPixel = (zoom) => (40075017 * Math.cos((hy * Math.PI) / 180)) / (512 * 2 ** zoom);

// A downtown block: the median distance between the cross streets along
// the bus routes within DOWNTOWN_KM of the hub. A cross street is where
// another route's path crosses this one's at CROSS_DEGREES or more; the
// routes crossing at one corner (within CORNER_M) count once. Every tier
// counts, since the question is how the streets lie, not who runs on them.
// (RTD's drawn paths come in short parts, so corners of a route's own path
// are too few to measure by.)
const CROSS_DEGREES = 45;
const CORNER_M = 25;
const sin = Math.sin((CROSS_DEGREES * Math.PI) / 180);
const segments = [];
for (const f of buses) {
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    const pts = part.map(meters);
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(...pts[i]) / 1000 > DOWNTOWN_KM + 0.5) continue;
      segments.push({ route: f.properties.route, a: pts[i - 1], b: pts[i] });
    }
  }
}
const cross = (p, q, a, b) => {
  const [r, s] = [[q[0] - p[0], q[1] - p[1]], [b[0] - a[0], b[1] - a[1]]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (!den) return null;
  const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / den;
  const u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  if (Math.abs(den) / ((Math.hypot(...r) * Math.hypot(...s)) || 1) < sin) return null;
  return t;
};
const blocks = [];
for (const f of buses) {
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    const pts = part.map(meters);
    const arc = [0];
    for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const hits = [];
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(...pts[i]) / 1000 > DOWNTOWN_KM) continue;
      for (const seg of segments) {
        if (seg.route === f.properties.route) continue;
        const t = cross(pts[i - 1], pts[i], seg.a, seg.b);
        if (t !== null) hits.push(arc[i - 1] + t * (arc[i] - arc[i - 1]));
      }
    }
    hits.sort((x, y) => x - y);
    let last = null;
    for (const h of hits) {
      if (last !== null && h - last < CORNER_M) continue;
      if (last !== null) blocks.push(h - last);
      last = h;
    }
  }
}
blocks.sort((a, b) => a - b);
const block = blocks[Math.floor(blocks.length / 2)] ?? 0;

const sizes = {};
for (const p of places) sizes[p.routes.length] = (sizes[p.routes.length] ?? 0) + 1;
const downtown = places.filter((p) => km(p.at) <= DOWNTOWN_KM);
const widest = (list) => list.reduce((a, b) => (b.routes.length > a.routes.length ? b : a), { routes: [] });
const widestDowntown = widest(downtown);
// A bundle's width on screen: from the middle of its first line to the
// middle of its last, a pitch apart each. It fits in a block when that is
// no more than the block: the outer lines' outer halves hang into the
// streets either side, which the block's own line would cover anyway.
const widthPx = (members, zoom) => (members - 1) * frequentWidth(zoom) * BUS_PITCH;
const widths = Object.fromEntries(REPORT_ZOOMS.map((z) => [z, { bundle_px: +widthPx(widestDowntown.routes.length, z).toFixed(1), block_px: +(block / metersPerPixel(z)).toFixed(1) }]));
let opensAt = null;
for (let z = 11; z <= 17; z += 0.25) {
  if (widthPx(widestDowntown.routes.length, z) <= block / metersPerPixel(z)) {
    opensAt = z;
    break;
  }
}
const inBus = buses.length;
console.log(JSON.stringify({
  tiers_bundled: tiers,
  ms,
  bus_in: inBus,
  bus_out: features.length,
  bus_out_bundled: features.filter((f) => 'slot' in f.properties).length,
  bus_out_flat: features.filter((f) => 'flat' in f.properties).length,
  bytes_in: fs.statSync(from).size,
  bytes_out: text.length,
  bundles: places.length,
  members: sizes,
  routes_bundled: new Set(features.filter((f) => 'slot' in f.properties).map((f) => f.properties.route)).size,
  widest: { routes: widest(places).routes, meters: widest(places).meters, at: widest(places).at },
  widest_downtown: widestDowntown,
  block_m: Math.round(block),
  block_quartiles_m: [0.25, 0.75].map((q) => Math.round(blocks[Math.floor(q * blocks.length)] ?? 0)),
  block_sample: blocks.length,
  widths_at_zoom: widths,
  slots_open_from: opensAt,
  crossings: crossings.length,
  crossings_downtown: crossings.filter((c) => km(c.at) <= DOWNTOWN_KM).length,
  crossing_list_downtown: crossings.filter((c) => km(c.at) <= DOWNTOWN_KM).slice(0, 40),
  hub: { name: hub.properties.name, at: hub.geometry.coordinates },
  longest_outside: places.filter((p) => km(p.at) > 5).sort((a, b) => b.meters - a.meters).slice(0, 5),
}, null, 1));
