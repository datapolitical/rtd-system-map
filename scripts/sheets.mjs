// Draws the four sheets from the build's output: public/data/sheet-<n>.geojson.
// `npm run build:data` runs this last; `npm run build:sheets` runs it alone to
// redraw from the data on disk, then retakes the loading pictures.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS, drawSheet, districtShape, sheetExtent } from './lib/sheets.mjs';
import { sheetsCode } from './lib/fingerprint.mjs';

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
  // What the whole-district sheet draws, end to end: stepping out to it frames this (#152).
  let frame = null;
  // RTD's stop groups (15th & 17th downtown): the page shows each one's key on the screen while
  // one of its lettered stops is in view on a sheet that draws them (public/js/sheets/main.js).
  const groups = [];
  for (const sheet of SHEETS) {
    const drawn = drawSheet(data, sheet);
    drawn.features = drawn.features.filter((f) => {
      if (f.properties.kind !== 'group-key') return true;
      const { group, title, rows } = f.properties;
      groups[group] ??= { title, rows, at: {} };
      groups[group].at[sheet.id] = f.geometry.coordinates;
      return false;
    });
    if (sheet.whole) frame = sheetExtent(drawn, sheet);
    // Each route's whole line is drawn only for a picked route, so it is a file of its own that the
    // page asks for at the first pick (#193): about 40% of each sheet's bytes otherwise.
    const routeLines = drawn.features.filter((f) => f.properties.kind === 'route-line');
    drawn.features = drawn.features.filter((f) => f.properties.kind !== 'route-line');
    await writeFile(path.join(dir, `sheet-${sheet.id}-routes.geojson`), JSON.stringify({ type: 'FeatureCollection', features: routeLines }));
    if (sheet.opens) { hub = drawn.hub; opening = drawn; }
    for (const f of drawn.features) if (f.properties.shape === 'name') named.add(f.properties.name);
    for (const f of drawn.features) if (f.properties.kind === 'rail') colors.add(f.properties.color);
    await writeFile(path.join(dir, `sheet-${sheet.id}.geojson`), JSON.stringify(drawn));
    const count = (kind) => drawn.features.filter((f) => f.properties.kind === kind).length;
    console.log(`sheet ${sheet.id} (zoom ${sheet.zoom}): ${count('rail')} rail lines, ${drawn.features.filter((f) => f.properties.shape === 'name' && !f.properties.alt && !f.properties.edge).length} station names (${drawn.features.filter((f) => f.properties.shape === 'name' && f.properties.alt && !f.properties.edge).length} placed again for a pick), ${drawn.features.filter((f) => f.properties.kind === 'letter' && !f.properties.edge).length} letters, ${count('bus')} bus streets`);
  }
  // RTD's district, for the towns the whole-district sheet names (#152). A build without it names every town.
  const district = districtShape(await read('boundary').catch(() => null));
  await writeFile(path.join(dir, 'sheets.json'), JSON.stringify({ drawing: await drawingFingerprint(opening), code: await sheetsCode(), hub, stations: [...named], colors: [...colors], district, frame, groups: groups.filter(Boolean) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeSheets(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data'));
}
