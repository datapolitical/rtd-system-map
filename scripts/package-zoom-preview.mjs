// Make a self-contained static preview without changing the production entry point.
import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? 'qa/.scratch/zoom-prototype/site');
if (out === root || out === path.join(root, 'public')) throw new Error('Choose a separate preview directory.');
await mkdir(out, { recursive: true });
const files = ['public/zoom/index.html', 'public/css/zoom.css',
  'public/js/zoom/main.js', 'public/js/zoom/style.js', 'public/js/zoom/model.js', 'public/js/zoom/images.js',
  'public/js/sheets/style.js', 'public/js/sheets/address.js', 'public/js/color.js',
  'public/data/sheets.json', ...[2, 3, 4].flatMap((n) => [`public/data/sheet-${n}.geojson`, `public/data/sheet-${n}-routes.geojson`]),
  'public/data/zoom-prototype/trial.json', 'public/data/zoom-prototype/report.json',
  ...[13, 15].flatMap((z) => [`public/data/zoom-prototype/bus-${z}.geojson`, `public/data/zoom-prototype/bus-${z}-routes.geojson`])];
const copies = [['public/vendor', 'vendor']];
const hashes = {};
for (const file of files) {
  const target = path.join(out, file.replace(/^public\//, ''));
  const bytes = await readFile(path.join(root, file));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
}
for (const [from, to] of copies) {
  if (!(await stat(path.join(root, from))).isDirectory()) throw new Error(`Missing ${from}`);
  await cp(path.join(root, from), path.join(out, to), { recursive: true });
}
for (const file of ['LICENSE', 'NOTICE']) await cp(path.join(root, file), path.join(out, file));
await writeFile(path.join(out, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>RTD system map</title><meta http-equiv="refresh" content="0;url=https://rtd-system-map.pages.dev/"><a href="https://rtd-system-map.pages.dev/">Open the current RTD system map</a></html>\n');
await writeFile(path.join(out, 'preview-manifest.json'), JSON.stringify({ kind: 'isolated zoom-12-to-16 trial', created: new Date().toISOString(), hashes }, null, 2) + '\n');
console.log(`Prepared ${out}/zoom/`);
