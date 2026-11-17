// Draws the four sheets from the build's output: public/data/sheet-<n>.geojson.
// `npm run build` runs this last; run it alone to redraw from the data on disk.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS, drawSheet } from './lib/sheets.mjs';

// The picture must match both the built transit drawing and the code that inks it.
export async function drawingFingerprint(sheet) {
  const hash = createHash('sha256');
  for (const name of ['sheets/style.js', 'sheets/main.js', 'sheets/view.js', 'color.js']) {
    hash.update(await readFile(new URL(`../public/js/${name}`, import.meta.url)));
  }
  return hash.update(JSON.stringify(sheet)).digest('hex');
}

export async function writeSheets(dir) {
  const read = async (name) => JSON.parse(await readFile(path.join(dir, `${name}.geojson`), 'utf8'));
  // Bus stations' halls are drawn where the build found them; a build without them draws none.
  const data = { routes: await read('routes'), stations: await read('stations'), streets: await read('streets'), terminals: await read('terminals').catch(() => null), stops: await read('stops').catch(() => null) };
  // Where the page opens (the hub), and the names the sheets give their stations.
  let hub = null;
  let opening;
  const named = new Set();
  // Each rail line's colour from RTD's data: the page sets each theme's ink from these (public/js/sheets/style.js).
  const colors = new Set();
  for (const sheet of SHEETS) {
    const drawn = drawSheet(data, sheet);
    if (sheet.id === 1) { hub = drawn.hub; opening = drawn; }
    for (const f of drawn.features) if (f.properties.shape === 'name') named.add(f.properties.name);
    for (const f of drawn.features) if (f.properties.kind === 'rail') colors.add(f.properties.color);
    await writeFile(path.join(dir, `sheet-${sheet.id}.geojson`), JSON.stringify(drawn));
    const count = (kind) => drawn.features.filter((f) => f.properties.kind === kind).length;
    console.log(`sheet ${sheet.id} (zoom ${sheet.zoom}): ${count('rail')} rail lines, ${drawn.features.filter((f) => f.properties.shape === 'name' && !f.properties.alt && !f.properties.edge).length} station names (${drawn.features.filter((f) => f.properties.shape === 'name' && f.properties.alt && !f.properties.edge).length} placed again for a pick), ${drawn.features.filter((f) => f.properties.kind === 'letter' && !f.properties.edge).length} letters, ${count('bus')} bus streets`);
  }
  await writeFile(path.join(dir, 'sheets.json'), JSON.stringify({ drawing: await drawingFingerprint(opening), hub, stations: [...named], colors: [...colors] }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeSheets(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data'));
}
