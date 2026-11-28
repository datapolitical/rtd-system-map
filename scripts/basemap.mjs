// The ground's tiles, served by the site itself (DESIGN.md, "Basemap"): the district's tiles out
// of OpenFreeMap's weekly build of the planet, the build its public tile server serves now, each
// cut down to the layers and properties the map draws (lib/basemap.mjs, groundNeeds) and the names
// the build places itself (groundBuildNeeds, #242). Run by hand when the ground should be newer,
// like the RTD data, and commit basemap/ (docs/upkeep.md).
//
// OpenFreeMap offers the planet as one PMTiles file for anyone to download; this reads only the
// district's tiles from it, by range requests, rather than asking its tile server for each.
//
//   npm run build:basemap
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PMTiles, FetchSource } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { fromVectorTileJs } from '@maplibre/vt-pbf';
import { gunzipSync } from 'node:zlib';
import { LOWEST, SHEETS, edge } from '../public/js/sheets/style.js';
import { groundBuildDraws, groundBuildNeeds, groundDraws, groundNeeds, mergeNeeds, writePack } from './lib/basemap.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
// The tile index the map used to read: it names the planet build its tiles are from.
const INDEX = 'https://tiles.openfreemap.org/planet';
const PLANET = (version) => `https://btrfs.openfreemap.com/areas/planet/${version}/tiles.pmtiles`;
// The ground's deepest tiles; closer, the map draws them larger (as OpenFreeMap's own).
const MAXZOOM = 14;
// How far past the routes the reader can pan (main.js, `bounded`), and, on the whole district's
// sheet, half the widest screen past that (main.js, roomy): 3840 px, a 4K screen.
const MARGIN = 0.3;
const WIDEST = 3840;
const AT_ONCE = 16;

const x = (lon) => (lon + 180) / 360;
const y = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);

const version = (await (await fetch(INDEX)).json()).tiles[0].match(/\/planet\/([^/]+)\//)[1];
const planet = new PMTiles(new FetchSource(PLANET(version)));
const meta = JSON.parse(await readFile(path.join(ROOT, 'public/data/meta.json'), 'utf8'));
const [[w0, s0], [e0, n0]] = meta.bounds.routes;
const needs = mergeNeeds(groundNeeds(), groundBuildNeeds());
const draws = groundDraws(MAXZOOM);
const buildDraws = groundBuildDraws();
const wholeUntil = Math.floor(edge(0)); // the whole district's sheet shows these zooms' tiles

const jobs = [];
for (let z = Math.floor(LOWEST); z <= MAXZOOM; z++) {
  const roomy = z <= wholeUntil ? WIDEST / 2 / (512 * 2 ** SHEETS[0].zoom) : 0;
  const [left, right] = [x(w0 - MARGIN) - roomy, x(e0 + MARGIN) + roomy];
  const [top, bottom] = [y(n0 + MARGIN) - roomy, y(s0 - MARGIN) + roomy];
  for (let tx = Math.floor(left * 2 ** z); tx <= Math.floor(right * 2 ** z); tx++) {
    for (let ty = Math.floor(top * 2 ** z); ty <= Math.floor(bottom * 2 ** z); ty++) jobs.push([z, tx, ty]);
  }
}

/** A tile with only what the map draws of it, at its zoom. */
function trim(z, bytes) {
  const tile = new VectorTile(new PbfReader(bytes[0] === 0x1f ? gunzipSync(bytes) : bytes));
  const layers = {};
  for (const [name, keep] of Object.entries(needs)) {
    const layer = tile.layers[name];
    if (!layer?.length) continue;
    const features = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (!draws(z, name, f) && !buildDraws(z, name, f)) continue;
      const properties = Object.fromEntries(keep.filter((k) => f.properties[k] !== undefined).map((k) => [k, f.properties[k]]));
      features.push({ type: f.type, id: f.id, properties, loadGeometry: () => f.loadGeometry() });
    }
    if (!features.length) continue;
    layers[name] = { name, version: 2, extent: layer.extent, length: features.length, feature: (i) => features[i] };
  }
  return Object.keys(layers).length ? Buffer.from(fromVectorTileJs({ layers })) : null;
}

const tiles = [];
let done = 0;
for (let i = 0; i < jobs.length; i += AT_ONCE) {
  await Promise.all(jobs.slice(i, i + AT_ONCE).map(async ([z, tx, ty]) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const got = await planet.getZxy(z, tx, ty);
        const bytes = got?.data && trim(z, Buffer.from(got.data));
        if (bytes) tiles.push([`${z}/${tx}/${ty}`, bytes]);
        return;
      } catch (err) {
        if (attempt >= 4) throw err;
        await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt));
      }
    }
  }));
  done = Math.min(jobs.length, i + AT_ONCE);
  if (done % 800 < AT_ONCE) console.log(`basemap: ${done} of ${jobs.length} tiles read`);
}
await writePack({
  source: 'OpenFreeMap (openfreemap.org), OpenMapTiles schema, data from OpenStreetMap',
  planet: version,
  made: new Date().toISOString(),
  zooms: [Math.floor(LOWEST), MAXZOOM],
  layers: needs,
}, tiles);
const { size } = await stat(path.join(ROOT, 'basemap/ground.bin'));
console.log(`Wrote ${tiles.length} ground tiles from planet ${version} (${(size / 2 ** 20).toFixed(1)} MB gzipped) to basemap/`);
