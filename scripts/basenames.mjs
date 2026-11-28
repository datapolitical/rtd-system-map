// The base map's place names, placed by our build (#235; plan #129, step 4).
//
// Reads the ground we hold (`basemap/`, #213) and the drawings the build made
// beside it, and writes the names each drawing may show as public/data/basenames.json.
// It draws nothing and changes no drawing: this is stage 1 of #235, the names
// the page's place layers letter today, ready for the lettering plan (#234)
// and the trial's drawings at 13 and 14.
//
//   npm run build:basenames
//
// from a build in public/data. No network; the ground is committed.
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readPack } from './lib/basemap.mjs';
import { checkPlan, placeBaseNames, placeId, placeSize, planOf, readPlaces, roomOfSheet } from './lib/basenames.mjs';
import { SHEETS } from './lib/sheets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const started = Date.now();

const pack = await readPack();
if (!pack) {
  console.error('basenames: no ground in basemap/ (run `npm run build:basemap`)');
  process.exit(1);
}
const at = Date.now();
const { names, counts, deepZoom } = readPlaces(pack);
const readMs = Date.now() - at;
if (!names.length) {
  console.error('basenames: the ground holds no place names the page letters; is the place layer still in basemap/?');
  process.exit(1);
}

// Every drawing at or past the shallowest zoom the ground carries these names
// at. Each name must fit every one of them at one ground position, so it never
// goes while zooming in; the closest drawing is where that costs the most.
const firstZoom = Math.min(...Object.keys(counts).map(Number));
const sheets = SHEETS.filter((s) => s.zoom >= firstZoom && existsSync(path.join(DATA, `sheet-${s.id}.geojson`)));
if (!sheets.length) {
  console.error(`basenames: no drawing at zoom ${firstZoom} or closer in public/data (run \`npm run build:sheets\`)`);
  process.exit(1);
}

const frames = [];
for (const sheet of sheets) {
  const drawn = JSON.parse(readFileSync(path.join(DATA, `sheet-${sheet.id}.geojson`), 'utf8'));
  frames.push({ zoom: sheet.zoom, size: placeSize(sheet), room: roomOfSheet(drawn, sheet) });
}

const withIds = names.map((r) => ({ ...r, id: placeId(r) }));
const placed = placeBaseNames(withIds, frames);

const plan = planOf({
  ...placed,
  frames,
  source: {
    ground: pack.source,
    planet: pack.planet,
    groundZooms: pack.zooms,
    deepest: deepZoom,
    classes: [...new Set(withIds.map((r) => r.cls))].sort(),
    drawings: sheets.map((s) => s.zoom),
  },
});

const problems = checkPlan(plan);
if (problems.length) {
  for (const p of problems.slice(0, 20)) console.error(`basenames: ${p}`);
  console.error(`basenames: ${problems.length} problem(s) in the plan; not written`);
  process.exit(1);
}

const file = path.join(DATA, 'basenames.json');
const body = `${JSON.stringify(plan)}\n`;
await writeFile(file, body);
const { size } = await stat(file);

const byClass = (list) => list.reduce((m, n) => ((m[n.cls] = (m[n.cls] ?? 0) + 1), m), {});
const countsOf = (list) => Object.entries(byClass(list)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${v} ${k}`).join(', ');
const inventory = Object.entries(counts).sort(([a], [b]) => a - b).map(([z, c]) => `${z}: ${c.names} (${Object.entries(c.classes).sort().map(([k, v]) => `${v} ${k}`).join(', ')})`).join('; ');
console.log(`basenames: ground holds ${inventory}`);
console.log(`basenames: ${placed.names.length} names placed (${countsOf(placed.names)}), ${placed.names.filter((n) => n.moved).length} moved, ${placed.dropped.length} with no room`);
console.log(`basenames: drawings ${frames.map((f) => f.zoom).join(', ')}; read ${readMs} ms, placed in ${Date.now() - at - readMs} ms`);
console.log(`basenames: ${(size / 1024).toFixed(1)} KB (${(gzipSync(body).length / 1024).toFixed(1)} KB gzipped), total ${Date.now() - started} ms`);
console.log(`Wrote ${path.relative(ROOT, file)}`);
