// The tiles the page reads, in public/tiles/ (git ignores it): each sheet and its route lines
// cut into vector tiles, and the ground's tiles unpacked from basemap/ (scripts/basemap.mjs).
// Every build runs this: it makes them from the built data and the committed basemap, the same every
// time, so the phone only reads tiles instead of cutting a sheet's whole drawing itself
// (DESIGN.md, "Quality floor").
//
// A sheet is cut exactly as MapLibre cut its GeoJSON on the phone: the same library
// (geojson-vt, the version MapLibre pins) with the options MapLibre gave it, so the tiles, and
// the drawing made from them, are the same.
//
//   node scripts/tiles.mjs
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { SHEETS, TILING, TILE_LAYER, tileZooms, listKey } from '../public/js/sheets/style.js';
import { readPack } from './lib/basemap.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'public/data');
const OUT = path.join(ROOT, 'public/tiles');
// MapLibre cuts GeoJSON into tiles 8192 units across (its EXTENT), and its options are in px of a
// 512 px tile (geojson_source.ts, _pixelsToTileUnits). Cut coarser, at a vector tile's usual 4096,
// every line and label moved by up to half a unit and the drawing was not the same.
const EXTENT = 8192;
const units = (px) => (px * EXTENT) / 512;

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const each = (c, f) => (typeof c[0] === 'number' ? f(c) : c.forEach((d) => each(d, f)));

/** Cuts one GeoJSON file into `name`'s tiles; returns how many it wrote. */
export async function cut(file, name, { minzoom, maxzoom }, out = OUT) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const f of data.features) {
    // A list (a label's offset) goes in as its text; the style looks it up (style.js, listKey).
    for (const [k, v] of Object.entries(f.properties ?? {})) if (Array.isArray(v)) f.properties[k] = listKey(v);
    each(f.geometry.coordinates, ([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); });
  }
  // As MapLibre's GeoJSON source makes its index (geojson_source.ts, geojson_worker_source.ts).
  const index = new GeoJSONVT(data, {
    buffer: units(TILING.buffer), tolerance: units(TILING.tolerance), extent: EXTENT, maxZoom: maxzoom,
    lineMetrics: false, generateId: false, cluster: false, updateable: true, coordinates: 'lngLat', wrap: true,
  });
  let written = 0;
  for (let z = minzoom; z <= maxzoom; z++) {
    // A tile's margin reaches past the drawing, so the tiles one beyond its edges may hold some.
    for (let x = lon2x(w, z) - 1; x <= lon2x(e, z) + 1; x++) {
      for (let y = lat2y(n, z) - 1; y <= lat2y(s, z) + 1; y++) {
        const tile = index.getTile(z, x, y);
        if (!tile?.features.length) continue;
        await mkdir(path.join(out, name, `${z}`, `${x}`), { recursive: true });
        await writeFile(path.join(out, name, `${z}`, `${x}`, `${y}.pbf`), fromGeojsonVt({ [TILE_LAYER]: tile }, { version: 2, extent: EXTENT }));
        written++;
      }
    }
  }
  return written;
}

/** Writes the ground's tiles out of the committed pack; returns how many. */
export async function unpackGround(out = OUT) {
  const pack = await readPack();
  if (!pack) return 0;
  for (const [key, bytes] of pack.tiles()) {
    const [z, x, y] = key.split('/');
    await mkdir(path.join(out, 'ground', z, x), { recursive: true });
    await writeFile(path.join(out, 'ground', z, x, `${y}.pbf`), bytes);
  }
  return pack.count;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  // npm install runs this (postinstall), and a fresh checkout has no built data: public/data is
  // made on our machine by npm run build:data and is not in git. Nothing to cut yet.
  if (!(await readFile(path.join(DATA, 'meta.json')).then(() => true, () => false))) {
    console.log('tiles: public/data is not built here (run `npm run build:data`); nothing cut');
    process.exit(0);
  }
  await rm(OUT, { recursive: true, force: true });
  let sheets = 0;
  for (const [i, s] of SHEETS.entries()) {
    sheets += await cut(path.join(DATA, `sheet-${s.id}.geojson`), `sheet-${s.id}`, tileZooms(i));
    sheets += await cut(path.join(DATA, `sheet-${s.id}-routes.geojson`), `routes-${s.id}`, tileZooms(i));
  }
  const ground = await unpackGround();
  if (!ground) console.log('tiles: no basemap in basemap/ (run `npm run build:basemap`): the map draws no ground');
  console.log(`Cut ${sheets} sheet tiles and unpacked ${ground} ground tiles into public/tiles`);
}
