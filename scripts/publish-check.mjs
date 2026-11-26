// What Cloudflare runs on every push (`npm run build`): it builds nothing, it
// checks that the committed site is whole and current, and fails the deploy
// if not, so the live site stays as it was (DESIGN.md, "Zero maintenance",
// Rule 2). The data is built on our own machine with `npm run build:data` and
// committed; this only makes sure what is about to go live is what that build
// made with the code going live beside it.
//
//   node scripts/publish-check.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEETS } from './lib/sheets.mjs';
import { dataCode, sheetsCode } from './lib/fingerprint.mjs';
import { drawingFingerprint } from './sheets.mjs';
import { groundNeeds, readPack } from './lib/basemap.mjs';
import { readdir } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const problems = [];

const json = async (name) => {
  try {
    return JSON.parse(await readFile(path.join(DATA, name), 'utf8'));
  } catch (err) {
    problems.push(`public/data/${name} is missing or unreadable (${err.code ?? err.message}): run \`npm run build:data\` and commit public/data`);
    return null;
  }
};

const meta = await json('meta.json');
const sheets = await json('sheets.json');
// What the page loads: these, and one file per sheet.
await json('directory.json');
const drawn = {};
for (const sheet of SHEETS) drawn[sheet.id] = await json(`sheet-${sheet.id}.geojson`);

if (meta && meta.code !== (await dataCode())) {
  problems.push('the data build\'s code (scripts/build-data.mjs and what it imports) changed since public/data was built: run `npm run build:data` and commit public/data');
}
if (sheets && sheets.code !== (await sheetsCode())) {
  problems.push('the sheets\' code (scripts/sheets.mjs and what it imports) changed since they were drawn: run `npm run build:sheets` and commit public/data and public/poster');
}
const opens = SHEETS.find((s) => s.opens);
if (sheets && drawn[opens.id] && sheets.drawing !== (await drawingFingerprint(drawn[opens.id]))) {
  problems.push('the page\'s drawing code (public/js/sheets/, color.js) changed since the sheets were drawn: run `npm run build:sheets` and commit public/data and public/poster');
}

// The drawing programs the page builds ahead (public/js/warm.js) were recorded from this drawing
// and this MapLibre; otherwise the phone builds programs the map never asks for.
const programs = await json('programs.json');
const maplibre = JSON.parse(await readFile(path.join(ROOT, 'node_modules', 'maplibre-gl', 'package.json'), 'utf8')).version;
if (sheets && programs && (programs.drawing !== sheets.drawing || programs.maplibre !== maplibre)) {
  problems.push('public/data/programs.json was recorded from another drawing or MapLibre: run `node scripts/poster-build.mjs` and commit public/data/programs.json');
}
// The loading pictures were taken of this drawing; otherwise the page hides them.
const html = await readFile(path.join(ROOT, 'public', 'index.html'), 'utf8');
const poster = html.match(/<div id="poster"[^>]*\sdata-drawing="([^"]*)"/)?.[1];
if (sheets && poster !== sheets.drawing) {
  problems.push('the loading pictures were taken of another drawing: run `node scripts/poster-build.mjs` and commit public/index.html and public/poster');
}

// The ground is the site's own (scripts/basemap.mjs): there, with every property the style reads,
// and the one the pictures show.
const pack = await readPack();
if (!pack) problems.push('basemap/ has no ground tiles: run `npm run build:basemap` and commit basemap/');
else {
  for (const [layer, fields] of Object.entries(groundNeeds())) {
    const missing = fields.filter((f) => !pack.layers?.[layer]?.includes(f));
    if (!pack.layers?.[layer] || missing.length) problems.push(`the style reads the ground's ${layer}${missing.length ? ` (${missing.join(', ')})` : ''}, which basemap/ left out: run \`npm run build:basemap\` and commit basemap/`);
  }
  const shows = html.match(/<div id="poster"[^>]*\sdata-ground="([^"]*)"/)?.[1];
  if (shows !== pack.planet) problems.push(`the loading pictures show another ground (${shows || 'none'}, basemap/ is ${pack.planet}): run \`node scripts/poster-build.mjs\` and commit public/index.html and public/poster`);
}
// What Cloudflare Pages takes: 20,000 files a site on its free plan (developers.cloudflare.com/pages/platform/limits).
const count = async (dir) => (await readdir(dir, { withFileTypes: true, recursive: true })).filter((d) => d.isFile()).length;
const files = await count(path.join(ROOT, 'public'));
if (files > 20000) problems.push(`public/ has ${files} files, more than the 20,000 Cloudflare Pages takes`);
else if (!problems.length) console.log(`${files} files to publish`);

if (problems.length) {
  console.error('Not publishing; the live site stays as it is:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Publishing the data built ${meta.built} (GTFS ${meta.sources?.gtfs?.version ?? meta.sources?.gtfs?.sha256?.slice(0, 12) ?? 'unknown'})`);
