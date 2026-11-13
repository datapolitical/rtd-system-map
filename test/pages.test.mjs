import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapPath } from '../qa/lib/where.mjs';

// The site's two pages (DESIGN.md, "Four sheets"): the sheets at the root, the classic map at /classic/.
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const read = (page) => fs.readFileSync(path.join(PUBLIC, page, 'index.html'), 'utf8');
// What a page asks its own site for, as written and as the path it comes to.
const refs = (page) => [...read(page).matchAll(/(?:href|src)="([^"#]+)"|url\(([^)]+)\)/g)].map((m) => m[1] ?? m[2]).filter((ref) => !/^[a-z]+:/.test(ref));
const asked = (page) => refs(page).map((ref) => new URL(ref, `http://site/${page}`).pathname);

test('the front page is the four sheets, and the classic map is at /classic/ with no link from it', () => {
  assert.ok(asked('').includes('/js/sheets/main.js'), 'the front page runs the sheets');
  assert.ok(!asked('').some((p) => p.startsWith('/classic')), 'and does not link to the classic map');
  assert.ok(asked('classic/').includes('/js/main.js') && !asked('classic/').includes('/js/sheets/main.js'), 'the classic page runs the classic map');
  assert.match(read('classic/'), /<title>[^<]*classic[^<]*<\/title>/i, 'and says which it is');
});

test('each page asks only for files the site has', () => {
  for (const page of ['', 'classic/']) {
    // data/ and vendor/ are made by the build and not kept in git.
    for (const p of asked(page).filter((p) => !/^\/(data|vendor)\//.test(p))) {
      assert.ok(fs.existsSync(path.join(PUBLIC, p, p.endsWith('/') ? 'index.html' : '')), `${page || '/'} asks for ${p}`);
    }
    for (const made of ['/vendor/maplibre-gl.css', '/vendor/overpass-latin.woff2']) assert.ok(asked(page).includes(made), `${page || '/'} reaches ${made}`);
  }
});

test('the front page asks at once for what its opening view needs, and only that', async () => {
  const { SHEETS, sheetStyle } = await import('../public/js/sheets/style.js');
  const preloads = [...read('').matchAll(/<link rel="(?:modulepreload|preload)" href="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  // The glyphs: every font a lettering layer at the opening zoom asks for, in the range a name's letters fall in.
  const open = SHEETS[0].zoom;
  const fonts = new Set();
  const collect = (x) => (typeof x === 'string' ? x.startsWith('Overpass ') && fonts.add(x) : Array.isArray(x) && x.forEach(collect));
  for (const l of sheetStyle('light').layers) if (l.type === 'symbol' && (l.minzoom ?? 0) <= open && open < (l.maxzoom ?? 24)) collect(l.layout['text-font']);
  const glyphs = preloads.filter((p) => p.startsWith('/vendor/glyphs/')).map((p) => p.split('/')[3]);
  assert.deepEqual(glyphs.sort(), [...fonts].sort(), 'the fonts the opening sheet letters with');
  assert.deepEqual(preloads.filter((p) => /^\/data\/sheet-/.test(p)), [`/data/sheet-${SHEETS[0].id}.geojson`], 'the opening sheet, not the others');
  // Every module the page's script imports, so none waits for the one that names it.
  const main = fs.readFileSync(path.join(PUBLIC, 'js/sheets/main.js'), 'utf8');
  for (const [, from] of main.matchAll(/^import .* from '([^']+)';$/gm)) {
    assert.ok(preloads.includes(new URL(from, 'http://site/js/sheets/').pathname), `${from} is preloaded`);
  }
});

test('a sheet not yet wanted starts with no drawing, and its layers are there to take one', async () => {
  const { SHEETS, sheetStyle, sheetData } = await import('../public/js/sheets/style.js');
  const style = sheetStyle('dark', [], new Set([SHEETS[0].id]));
  assert.equal(style.sources['sheet-1'].data, sheetData(1));
  for (const s of SHEETS.slice(1)) {
    assert.deepEqual(style.sources[`sheet-${s.id}`].data, { type: 'FeatureCollection', features: [] });
    assert.ok(style.layers.some((l) => l.source === `sheet-${s.id}`));
  }
  assert.equal(sheetStyle('dark').sources['sheet-4'].data, sheetData(4), 'with nothing said, every sheet loads');
});

test('the front page shows a picture of its opening view while the map loads', () => {
  const html = read('');
  const [, view, bounds] = html.match(/<div id="poster" data-view="([^"]*)" data-bounds="([^"]*)">/) ?? [];
  // scripts/poster.mjs writes these: the view the pictures show, and the map's bounds the page shifts them by.
  assert.match(view ?? '', /^\d+(\.\d+)?\/-?\d+\.\d+\/-?\d+\.\d+$/, 'the view the pictures show');
  const [w, s, e, n] = (bounds ?? '').split(',').map(Number);
  assert.ok(w < e && s < n, 'the map bounds');
  const [, lat, lon] = view.split('/').map(Number);
  assert.ok(w < lon && lon < e && s < lat && lat < n, 'the view is inside them');
  // Every picture the page can choose is there, one per theme and screen.
  const pictures = [...html.matchAll(/\/poster\/[\w-]+\.webp/g)].map((m) => m[0]);
  assert.ok(pictures.length >= 4);
  for (const p of pictures) assert.ok(fs.existsSync(path.join(PUBLIC, p)), `${p} is in public/`);
  // The buttons start as they are on the opening sheet, so nothing changes under the picture when the script runs.
  assert.match(html, /<button id="out"[^>]* disabled>/);
  assert.match(html, /<div id="sheets"[^>]*><i class="on"><\/i>(<i><\/i>){3}<\/div>/);
});

test('the front page works at any address the host answers with it', () => {
  // The site has no 404 page, so Cloudflare answers a path it does not have (the old /sheets/) with the front page.
  for (const ref of refs('')) assert.ok(ref.startsWith('/'), `${ref} is asked for from the root`);
});

test('the classic map finds its files from where its scripts are, not from the page', () => {
  const dir = path.join(PUBLIC, 'js');
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, name), 'utf8');
    // A fetch, or an address handed to the map (a layer's data, the glyphs), that starts at the page.
    assert.doesNotMatch(code, /fetch\(\s*['"`](?!https?:|\/)|['"`](?:data|vendor|css|js)\/|document\.baseURI/, `${name} reads a file beside the page`);
  }
});

test('the checks open the map at /classic/ on a site that has it, and at the root on a build from before', async (t) => {
  const sites = {
    'http://new': { '/': 'the sheets', '/classic/': 'the classic map' },
    'http://old': { '/': 'the map', '/classic/': 'the map' },
    'http://bare': { '/': 'the map' },
  };
  t.mock.method(globalThis, 'fetch', async (u) => {
    const { origin, pathname } = new URL(u);
    if (!sites[origin]) throw new Error('unreachable');
    const body = sites[origin][pathname];
    return { ok: body !== undefined, text: async () => body };
  });
  assert.equal(await mapPath('http://new'), '/classic/');
  assert.equal(await mapPath('http://old'), '/', 'a host that answers a missing page with its front page');
  assert.equal(await mapPath('http://bare'), '/', 'a host that answers a missing page with nothing');
  assert.equal(await mapPath('http://down'), '/');
});

test("the checks' in-page helpers ask for the site's files from its root, wherever the map's page is", () => {
  const code = fs.readFileSync(fileURLToPath(new URL('../qa/lib/inpage.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(code, /(?:fetch|import)\(\s*['"`](?!https?:|\/)/);
});
