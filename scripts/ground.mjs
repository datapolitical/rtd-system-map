// Draws the ground for every drawing (#241) from the OpenStreetMap pack the site keeps
// (basemap/, scripts/basemap.mjs): build/ground/ground-<id>.geojson, one FeatureCollection per
// sheet's drawing, and ground.json (what each holds, and the rule that chose it). scripts/sheets.mjs
// runs this with the sheets; `node scripts/ground.mjs` alone redraws the ground.
//
// It is not served yet: a drawing at 16 is tens of megabytes, over Cloudflare Pages' 25 MiB file
// limit, so the drawings are the input of the tiling step the zoomable map will get (#237), not site
// files. build/ is not published.
//
// No browser and no downloads: the pack is committed, and everything here is arithmetic on it.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPack } from './lib/basemap.mjs';
import { SHEETS } from '../public/js/sheets/style.js';
import { STREET_RULE, SIMPLIFY_PX, MIN_LINE_PX, MIN_AREA_PX, readGround, drawGround, describe } from './lib/ground.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Where the drawings go: inside the checkout, outside public/ (they are not served). */
export const GROUND_DIR = path.join(ROOT, 'build', 'ground');

/**
 * Writes the ground's drawings to `dir`; returns the manifest, or null when there is no pack.
 * Every drawing is made from the pack's deepest tiles, so a street is not missing because a tile
 * generator stopped emitting its class at that zoom; the rule in lib/ground.mjs picks instead.
 */
export async function writeGround(dir = GROUND_DIR) {
  await mkdir(dir, { recursive: true });
  const pack = await readPack();
  if (!pack) {
    console.log('ground: no basemap in basemap/ (run `npm run build:basemap`): no ground drawn');
    return null;
  }
  const started = Date.now();
  const ground = readGround(pack);
  const drawings = [];
  for (const sheet of SHEETS) {
    const drawn = drawGround(ground, sheet.zoom);
    const { counts, classes, features, bytes } = describe(drawn);
    await writeFile(path.join(dir, `ground-${sheet.id}.geojson`), JSON.stringify(drawn));
    drawings.push({ id: sheet.id, zoom: sheet.zoom, counts, classes, features, bytes });
    const hold = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${n} ${k}`).join(', ');
    console.log(`ground ${sheet.id} (zoom ${sheet.zoom}): ${hold}; ${(bytes / 1e6).toFixed(1)} MB (${((Date.now() - started) / 1000).toFixed(0)} s so far)`);
  }
  const manifest = {
    source: pack.source,
    planet: pack.planet,
    made: new Date().toISOString(),
    tileZoom: ground.zoom,
    tiles: ground.tiles,
    rule: { streetClasses: STREET_RULE.map((r) => ({ from: Number.isFinite(r.from) ? r.from : null, classes: r.classes })), simplifyPx: SIMPLIFY_PX, minLinePx: MIN_LINE_PX, minAreaPx: MIN_AREA_PX },
    drawings,
  };
  await writeFile(path.join(dir, 'ground.json'), JSON.stringify(manifest));
  console.log(`ground: ${ground.tiles} tiles at zoom ${ground.zoom} drawn in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  return manifest;
}

/** Whether `dir` holds a ground drawn from this pack (so a green build is not one made elsewhere). */
export async function groundIsCurrent(dir, pack) {
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'ground.json'), 'utf8'));
    return !pack || (manifest.planet === pack.planet && manifest.tileZoom === pack.zooms.at(-1));
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeGround();
}
