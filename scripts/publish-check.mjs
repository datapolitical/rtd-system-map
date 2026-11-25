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

// The loading pictures were taken of this drawing; otherwise the page hides them.
const html = await readFile(path.join(ROOT, 'public', 'index.html'), 'utf8');
const poster = html.match(/<div id="poster"[^>]*\sdata-drawing="([^"]*)"/)?.[1];
if (sheets && poster !== sheets.drawing) {
  problems.push('the loading pictures were taken of another drawing: run `node scripts/poster-build.mjs` and commit public/index.html and public/poster');
}

if (problems.length) {
  console.error('Not publishing; the live site stays as it is:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Publishing the data built ${meta.built} (GTFS ${meta.sources?.gtfs?.version ?? meta.sources?.gtfs?.sha256?.slice(0, 12) ?? 'unknown'})`);
