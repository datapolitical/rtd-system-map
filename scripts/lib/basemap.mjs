// The ground's tiles as they are committed: one file of tiles end to end (basemap/ground.bin) and
// its index (basemap/ground.json), which says where they came from and where each tile is.
// scripts/basemap.mjs makes them, by hand; scripts/tiles.mjs unpacks them when the site is built.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { sheetStyle } from '../../public/js/sheets/style.js';

export const DIR = path.resolve(import.meta.dirname, '../../basemap');

/** The ground's tiles, or null when there are none. */
export async function readPack(dir = DIR) {
  let index;
  try { index = JSON.parse(await readFile(path.join(dir, 'ground.json'), 'utf8')); } catch { return null; }
  const bin = await readFile(path.join(dir, 'ground.bin'));
  const keys = Object.keys(index.tiles);
  return {
    ...index,
    count: keys.length,
    // Each tile is kept gzipped, to keep the file small enough for git; the site serves it plain.
    *tiles() { for (const key of keys) { const [at, length] = index.tiles[key]; yield [key, gunzipSync(bin.subarray(at, at + length))]; } },
  };
}

/** Writes `tiles` ([key "z/x/y", bytes]) and what is said of them. */
export async function writePack(about, tiles, dir = DIR) {
  await mkdir(dir, { recursive: true });
  const index = {};
  let at = 0;
  const sorted = [...tiles].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([k, b]) => [k, gzipSync(b, { level: 9 })]);
  for (const [key, bytes] of sorted) { index[key] = [at, bytes.length]; at += bytes.length; }
  await writeFile(path.join(dir, 'ground.bin'), Buffer.concat(sorted.map(([, b]) => b)));
  await writeFile(path.join(dir, 'ground.json'), `${JSON.stringify({ ...about, tiles: index }, null, 0)}\n`);
}

/**
 * What the map reads of the ground, from its style in both themes: each layer of the tiles it draws
 * and the properties it asks of them. The page's own question of the places (main.js, which towns
 * are cut off at the screen's edge) asks for the same ones its place layers do.
 */
export function groundNeeds() {
  const needs = {};
  const fields = (x, into) => {
    if (!Array.isArray(x)) { if (x && typeof x === 'object') Object.values(x).forEach((v) => fields(v, into)); return; }
    if ((x[0] === 'get' || x[0] === 'has') && typeof x[1] === 'string' && x.length === 2) into.add(x[1]);
    x.forEach((v) => fields(v, into));
  };
  for (const theme of ['light', 'dark']) {
    for (const l of sheetStyle(theme, [], [], { routeLines: true }).layers) {
      if (l.source !== 'ground') continue;
      const into = (needs[l['source-layer']] ??= new Set());
      fields([l.filter, l.layout, l.paint], into);
    }
  }
  return Object.fromEntries(Object.entries(needs).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));
}

/**
 * Whether the map draws a feature from a tile of zoom `z` (the deepest, `maxzoom`, is also drawn
 * larger closer in): some ground layer showing at a zoom that tile is drawn at takes it. Anything
 * else the tile can leave out, and the map is drawn the same. The style is made without RTD's
 * district, which names every town rather than only those inside it, so nothing the page names
 * is left out.
 */
export function groundDraws(maxzoom) {
  const draws = [];
  for (const theme of ['light', 'dark']) {
    for (const [i, l] of sheetStyle(theme, [], [], { routeLines: true }).layers.entries()) {
      if (l.source !== 'ground') continue;
      const { filter } = featureFilter(l.filter, `layers[${i}].filter`);
      draws.push({ layer: l['source-layer'], from: l.minzoom ?? 0, to: l.maxzoom ?? 24, filter });
    }
  }
  return (z, layer, feature) => draws.some((d) => d.layer === layer && d.from < (z === maxzoom ? 24 : z + 1) && d.to > z && d.filter({ zoom: z }, feature));
}
