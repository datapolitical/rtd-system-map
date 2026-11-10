// Freeze a deployed build of the map as a fixture the drawn model can open
// (qa/recall/README.md).
//
//   node qa/recall/snapshot.mjs --url https://<id>.rtd-system-map.pages.dev --commit <sha> --out <dir>
//
// A build cannot be repeated: scripts/build-data.mjs reads RTD's ArcGIS layers
// and OpenStreetMap live, and only the GTFS can be pinned. So a fixture is the
// deployed output itself, taken from the commit's Cloudflare Pages preview:
//
//   <dir>/public/js/            the page's code (the model builds its style from it)
//   <dir>/public/data/          meta.json and every build file the page draws
//   <dir>/public/vendor/glyphs/ the glyph ranges the labels need (text metrics)
//   <dir>/qa/cache/tiles/       the basemap's TileJSON as it was, so the tiles
//                               read later are that version's
//   <dir>/manifest.json         what was taken, from where, with hashes
//
// The page's JS is checked against git at the commit; a difference is
// reported, not hidden. The model is then opened with `root: <dir>`.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStyle } from '../drawn/model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : null;
};
const url = arg('url')?.replace(/\/$/, '');
const commitArg = arg('commit');
const out = arg('out') && path.resolve(arg('out'));
if (!url || !commitArg || !out) {
  console.error('usage: node qa/recall/snapshot.mjs --url <preview url> --commit <sha> --out <dir>');
  process.exit(2);
}
const commit = execFileSync('git', ['rev-parse', commitArg], { cwd: REPO, encoding: 'utf8' }).trim();
const UA = { 'user-agent': 'rtd-system-map qa/recall snapshot (github.com/datapolitical/rtd-system-map)' };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const write = (rel, buf) => {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
};

async function get(p) {
  const res = await fetch(`${url}/${p}`, { headers: UA });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
// The preview answers any missing path with the site's index.html, so a JSON
// file is only real if it parses.
async function getJSON(p) {
  const buf = await get(p);
  if (!buf) return null;
  try {
    return { buf, json: JSON.parse(buf.toString('utf8')) };
  } catch {
    return null;
  }
}

if (fs.existsSync(out)) fs.rmSync(out, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const manifest = { commit, url, captured: new Date().toISOString(), js: {}, data: {}, glyphs: {}, basemap: null, notes: [] };

// 1. The page's code, from the site, checked against git.
const jsFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, 'public/js'], { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter(Boolean);
for (const file of jsFiles) {
  const rel = file.replace(/^public\//, '');
  const fromGit = execFileSync('git', ['show', `${commit}:${file}`], { cwd: REPO, maxBuffer: 64 << 20 });
  const fromSite = await get(rel);
  const same = fromSite && sha256(fromSite) === sha256(fromGit);
  if (!same) manifest.notes.push(`${file}: ${fromSite ? 'the site serves a different file than git has at the commit; kept the site\'s' : 'not served by the site; kept git\'s'}`);
  write(file, fromSite ?? fromGit);
  manifest.js[file] = sha256(fromSite ?? fromGit);
}

// 2. meta.json, then every build file the page's own code says it draws.
const meta = await getJSON('data/meta.json');
if (!meta) throw new Error(`${url}/data/meta.json is not served`);
write('public/data/meta.json', meta.buf);
manifest.data['meta.json'] = { bytes: meta.buf.length, sha256: sha256(meta.buf) };
const style = await buildStyle(out, 'dark', path.join(out, 'public', 'data', 'meta.json'));
const sources = style.metadata?.['rtd:data-sources'];
if (!Array.isArray(sources)) throw new Error('the page at this commit does not export DATA_SOURCES (network.js)');
const data = {};
for (const name of sources) {
  const got = await getJSON(`data/${name}.geojson`);
  if (!got || got.json.type !== 'FeatureCollection') throw new Error(`${url}/data/${name}.geojson is not served as GeoJSON`);
  write(`public/data/${name}.geojson`, got.buf);
  data[name] = got.json;
  manifest.data[`${name}.geojson`] = { features: got.json.features.length, bytes: got.buf.length, sha256: sha256(got.buf) };
}

// 3. Glyphs: the first font of every text-font our own layers use (the model
// measures with it, as MapLibre does for a single-font stack), every range
// holding a character in the data's text, and the Latin ranges.
const fonts = new Set();
const collect = (v) => {
  if (typeof v === 'string' && /^[A-Z][\w ]+$/.test(v)) fonts.add(v);
  else if (Array.isArray(v)) {
    if (v.length && v.every((x) => typeof x === 'string') && /^[A-Z]/.test(v[0] ?? '')) fonts.add(v[0]);
    else v.forEach(collect);
  }
};
for (const layer of style.layers) {
  if (style.sources[layer.source]?.type !== 'geojson') continue;
  if (layer.layout?.['text-font']) collect(layer.layout['text-font']);
}
const starts = new Set([0, 256, 8192]);
for (const fc of Object.values(data)) {
  for (const f of fc.features) {
    for (const v of Object.values(f.properties ?? {})) {
      if (typeof v !== 'string') continue;
      for (const ch of v) starts.add(Math.floor(ch.codePointAt(0) / 256) * 256);
    }
  }
}
for (const font of fonts) {
  manifest.glyphs[font] = [];
  for (const start of [...starts].sort((a, b) => a - b)) {
    const rel = `vendor/glyphs/${encodeURIComponent(font)}/${start}-${start + 255}.pbf`;
    const buf = await get(rel);
    // A range the site does not have answers with index.html: a protobuf
    // never starts with "<!".
    if (!buf || buf.subarray(0, 2).toString() === '<!') continue;
    write(path.join('public', 'vendor', 'glyphs', font, `${start}-${start + 255}.pbf`), buf);
    manifest.glyphs[font].push(start);
  }
  if (!manifest.glyphs[font].includes(0)) manifest.notes.push(`glyphs: ${font} has no 0-255 range on the site`);
}

// 4. The basemap version in use now, written where qa/drawn/tiles.mjs reads
// its cached TileJSON, so tiles read for this fixture are that version's.
const vector = Object.values(style.sources).find((s) => s.type === 'vector');
if (vector?.url) {
  const res = await fetch(vector.url, { headers: UA });
  if (!res.ok) throw new Error(`TileJSON ${vector.url}: HTTP ${res.status}`);
  const json = await res.json();
  write('qa/cache/tiles/tilejson.json', JSON.stringify({ url: vector.url, json }));
  manifest.basemap = { tilejson: vector.url, tiles: json.tiles, maxzoom: json.maxzoom };
  manifest.notes.push('basemap: the TileJSON is today\'s; the build was looked at with whatever version was current then');
}

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
const bytes = (dir) => fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter((d) => d.isFile()).reduce((n, d) => n + fs.statSync(path.join(d.parentPath ?? d.path, d.name)).size, 0);
console.log(`${out}: commit ${commit.slice(0, 7)}, ${jsFiles.length} js, ${Object.keys(data).length} data files, ${[...fonts].length} fonts, ${(bytes(out) / 1e6).toFixed(1)} MB`);
for (const n of manifest.notes) console.log(`  note: ${n}`);
