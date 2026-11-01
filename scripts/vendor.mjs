// Copy the browser libraries the site uses out of node_modules into
// public/vendor, so the site serves them itself instead of from a CDN
// (DESIGN.md, "Quality floor"), and draw the map's glyphs from the same font.
// Their versions are pinned in package.json.

import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildGlyphs } from './glyphs.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/vendor');

const FILES = {
  // MapLibre is ES modules; the main file loads the worker from beside itself.
  'maplibre-gl.mjs': 'maplibre-gl/dist/maplibre-gl.mjs',
  'maplibre-gl-shared.mjs': 'maplibre-gl/dist/maplibre-gl-shared.mjs',
  'maplibre-gl-worker.mjs': 'maplibre-gl/dist/maplibre-gl-worker.mjs',
  'maplibre-gl.css': 'maplibre-gl/dist/maplibre-gl.css',
  'overpass-latin.woff2': '@fontsource-variable/overpass/files/overpass-latin-wght-normal.woff2',
  'overpass-latin-ext.woff2': '@fontsource-variable/overpass/files/overpass-latin-ext-wght-normal.woff2',
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const [name, from] of Object.entries(FILES)) {
  await copyFile(path.join(ROOT, 'node_modules', from), path.join(OUT, name));
}
const glyphs = await buildGlyphs(path.join(OUT, 'glyphs'));
console.log(`Copied ${Object.keys(FILES).length} files and drew ${glyphs} glyph files in public/vendor`);
