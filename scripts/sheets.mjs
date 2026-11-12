// Draws the four sheets from the build's output: public/data/sheet-<n>.geojson.
// `npm run build` runs this last; run it alone to redraw from the data on disk.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS, drawSheet } from './lib/sheets.mjs';

export async function writeSheets(dir) {
  const read = async (name) => JSON.parse(await readFile(path.join(dir, `${name}.geojson`), 'utf8'));
  // Bus stations' halls are drawn where the build found them; a build without them draws none.
  const data = { routes: await read('routes'), stations: await read('stations'), streets: await read('streets'), terminals: await read('terminals').catch(() => null) };
  for (const sheet of SHEETS) {
    const drawn = drawSheet(data, sheet);
    // Where the page opens: on the hub.
    if (sheet.id === 1) await writeFile(path.join(dir, 'sheets.json'), JSON.stringify({ hub: drawn.hub }));
    await writeFile(path.join(dir, `sheet-${sheet.id}.geojson`), JSON.stringify(drawn));
    const count = (kind) => drawn.features.filter((f) => f.properties.kind === kind).length;
    console.log(`sheet ${sheet.id} (zoom ${sheet.zoom}): ${count('rail')} rail lines, ${drawn.features.filter((f) => f.properties.shape === 'name').length} station names, ${count('letter')} letters, ${count('bus')} bus streets`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeSheets(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data'));
}
