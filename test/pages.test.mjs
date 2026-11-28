import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapPath } from '../qa/lib/where.mjs';

// Only the sheet map is deployed. Classic is preserved on classic-archive.
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const read = (page) => fs.readFileSync(path.join(PUBLIC, page, 'index.html'), 'utf8');
// What a page asks its own site for, as written and as the path it comes to.
const refs = (page) => [...read(page).matchAll(/(?:href|src)="([^"#]+)"|url\(([^)]+)\)/g)].map((m) => m[1] ?? m[2]).filter((ref) => !/^[a-z]+:/.test(ref));
const asked = (page) => refs(page).map((ref) => new URL(ref, `http://site/${page}`).pathname);
// public/poster/ is made by npm run build:sheets on our machine and not kept in git (docs/upkeep.md).
// Without it these checks skip, loudly, instead of failing.
const NO_POSTER = fs.existsSync(path.join(PUBLIC, 'poster')) ? false : 'public/poster/ is not built here: run npm run build:sheets';

test('the sheet map is the only deployed application; old Classic links redirect to it', () => {
  assert.ok(asked('').includes('/js/sheets/main.js'), 'the front page runs the sheets');
  assert.ok(!asked('').some((p) => p.startsWith('/classic')), 'and does not link to the classic map');
  assert.ok(!fs.existsSync(path.join(PUBLIC, 'classic')), 'Classic is not deployed');
  for (const name of ['main.js', 'network.js', 'select.js', 'legend.js', 'search.js']) {
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'js', name)), `${name} is not deployed`);
  }
  const redirects = fs.readFileSync(path.join(PUBLIC, '_redirects'), 'utf8');
  for (const from of ['/classic', '/classic/*']) assert.ok(redirects.split('\n').includes(`${from} / 302`));
});

test('each page asks only for files the site has', () => {
  for (const page of ['']) {
    // data/ and vendor/ are made by the build and not kept in git; so is poster/.
    for (const p of asked(page).filter((p) => !/^\/(data|vendor)\//.test(p) && !(NO_POSTER && p.startsWith('/poster/')))) {
      assert.ok(fs.existsSync(path.join(PUBLIC, p, p.endsWith('/') ? 'index.html' : '')), `${page || '/'} asks for ${p}`);
    }
    for (const made of ['/vendor/maplibre-gl.css', '/vendor/overpass-latin.woff2']) assert.ok(asked(page).includes(made), `${page || '/'} reaches ${made}`);
  }
});

test('the front page asks at once for what its opening view needs, and only that', async () => {
  const { SHEETS, OPENING, sheetStyle } = await import('../public/js/sheets/style.js');
  const preloads = [...read('').matchAll(/<link rel="(?:modulepreload|preload)" href="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  // The glyphs: every font a lettering layer at the opening zoom asks for, in the range a name's letters fall in.
  const open = SHEETS[OPENING].zoom;
  const fonts = new Set();
  const collect = (x) => (typeof x === 'string' ? x.startsWith('Overpass ') && fonts.add(x) : Array.isArray(x) && x.forEach(collect));
  for (const l of sheetStyle('light').layers) if (l.type === 'symbol' && (l.minzoom ?? 0) <= open && open < (l.maxzoom ?? 24)) collect(l.layout['text-font']);
  // Fetched by the head's own script and handed to the map (index.html, early; main.js, "early").
  const [, list] = read('').match(/window\.early = Object\.fromEntries\(\[([^\]]*)\]/) ?? [];
  const glyphs = [...(list ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(glyphs.sort(), [...fonts].sort(), 'the fonts the opening sheet letters with');
  assert.ok(!preloads.some((p) => p.startsWith('/vendor/glyphs/')), 'the glyphs are fetched once, not preloaded as well');
  // The tiles: the page fetches those of the opening view, of the opening sheet and the ground, at the
  // zooms the map drew it from (data-early, scripts/poster.mjs), and no sheet's whole drawing.
  assert.ok(!preloads.some((p) => /^\/data\/sheet-/.test(p)), 'no sheet is fetched whole');
  const early = JSON.parse((read('').match(/<div id="poster"[^>]*\sdata-early="([^"]*)"/)?.[1] ?? '{}').replaceAll('&quot;', '"'));
  const { tileZooms } = await import('../public/js/sheets/style.js');
  assert.deepEqual(Object.keys(early).sort(), ['ground', `sheet-${SHEETS[OPENING].id}`], 'the opening sheet and the ground');
  assert.equal(early[`sheet-${SHEETS[OPENING].id}`], tileZooms(OPENING).maxzoom, 'the opening sheet\'s tiles');
  // Every module the page's script imports, so none waits for the one that names it.
  const main = fs.readFileSync(path.join(PUBLIC, 'js/sheets/main.js'), 'utf8');
  for (const [, from] of main.matchAll(/^import .* from '([^']+)';$/gm)) {
    assert.ok(preloads.includes(new URL(from, 'http://site/js/sheets/').pathname), `${from} is preloaded`);
  }
});

test('the sheets\' style is a valid MapLibre style in both themes, every sheet\'s sizes filled in (#152)', async () => {
  const { sheetStyle } = await import('../public/js/sheets/style.js');
  const { validateStyleMin } = await import('@maplibre/maplibre-gl-style-spec');
  for (const theme of ['light', 'dark']) {
    const errors = validateStyleMin(sheetStyle(theme, ['Union Station'], ['#57C1E9', '#C4D600']));
    assert.deepEqual(errors.map((e) => e.message), [], theme);
  }
});

test('every sheet and its route lines are tiles cut when the site is published; the route lines show only for a pick', async () => {
  const { SHEETS, sheetStyle, tilesUrl, tileZooms, TILE_LAYER } = await import('../public/js/sheets/style.js');
  for (const routeLines of [false, true]) {
    const style = sheetStyle('dark', [], [], { routeLines });
    for (const [i, s] of SHEETS.entries()) {
      for (const set of ['sheet', 'routes']) {
        assert.deepEqual(style.sources[`${set}-${s.id}`], { type: 'vector', tiles: [tilesUrl(`${set}-${s.id}`)], ...tileZooms(i) });
        const layers = style.layers.filter((l) => l.source === `${set}-${s.id}`);
        assert.ok(layers.length && layers.every((l) => l['source-layer'] === TILE_LAYER), `${set}-${s.id}'s layers read its tiles`);
        if (set === 'routes') assert.ok(layers.every((l) => l.layout.visibility === (routeLines ? 'visible' : 'none')), `routes-${s.id} only for a pick`);
      }
    }
  }
});

test('a list a feature carries is looked up from the build\'s table, as the tiles name it', async () => {
  const { sheetStyle, listKey } = await import('../public/js/sheets/style.js');
  const lists = { offset: [[0, -1.2], [0.5, 0]] };
  const style = sheetStyle('light', [], [], { lists });
  const offsets = style.layers.filter((l) => /^(sheet|routes)-/.test(l.source) && JSON.stringify(l.layout ?? {}).includes('"offset"')).map((l) => l.layout['text-offset']);
  assert.ok(offsets.length, 'some layer sets its text off by a list');
  for (const o of offsets) assert.deepEqual(o, ['match', ['get', 'offset'], listKey([0, -1.2]), ['literal', [0, -1.2]], listKey([0.5, 0]), ['literal', [0.5, 0]], ['literal', [0, 0]]]);
});

test('the front page shows the rail lines drawing in, drawn in the page itself, while the map loads', async () => {
  const html = read('');
  const [, view, bounds] = html.match(/<div id="poster" data-view="([^"]*)" data-bounds="([^"]*)" data-drawing="[^"]*"[^>]*>/) ?? [];
  // scripts/poster.mjs writes these: the opening view (the sketch and the early tiles) and the map's bounds.
  assert.match(view ?? '', /^\d+(\.\d+)?\/-?\d+\.\d+\/-?\d+\.\d+$/, 'the opening view');
  const [w, s, e, n] = (bounds ?? '').split(',').map(Number);
  assert.ok(w < e && s < n, 'the map bounds');
  const [, lat, lon] = view.split('/').map(Number);
  assert.ok(w < lon && lon < e && s < lat && lat < n, 'the view is inside them');
  // Nothing to download before the map can start (#222): the sketch is part of the page.
  const poster = html.slice(html.indexOf('<div id="poster"'), html.indexOf('<p id="loading"'));
  const svg = poster.match(/<svg id="sketch"[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  assert.ok(svg, 'the sketch, hidden from screen readers');
  // A group per rail line with its colour in both themes: the line faint, and its runs carrying the pulses.
  const groups = [...svg.matchAll(/<g style="--l:(#[0-9a-f]{6});--d:(#[0-9a-f]{6})"><path class="base" d="M[-\d. M]+"\/>((?:<path style="--t:\d+" d="M[-\d. ]+"\/>)+)<\/g>/gi)];
  assert.ok(groups.length >= 1 && groups.length === (svg.match(/<g /g) ?? []).length, 'every rail line, with its colour in both themes and its runs');
  assert.doesNotMatch(poster, /\b(?:src|href)=/, 'no file of its own');
  assert.doesNotMatch(html, /\/poster\//, 'the page asks for no loading picture');
  assert.match(html, /<p id="loading" role="status"><span>Loading…<\/span><\/p>/);
  // Still, with reduced motion: the lines whole, not moving (the rule matches the growing runs exactly).
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{[^\n]*#sketch path:not\(\.base\) \{ animation: none; \}[^\n]*#sketch path:not\(\.base\) \{ stroke-dasharray: none; \}/);
  // It is of the built rail lines and opening view, when they are here (scripts/sketch.mjs; the publish check too).
  if (fs.existsSync(path.join(PUBLIC, 'data', 'routes.geojson'))) {
    const { sketch } = await import('../scripts/sketch.mjs');
    assert.equal(html.match(/<svg id="sketch"[\s\S]*?<\/svg>/)[0], await sketch(), 'run node scripts/sketch.mjs');
  }
  // The buttons start as they are on the opening sheet, so nothing changes under the picture when the script runs.
  // The page opens on sheet 1, one step in from the whole district (#152): a wider sheet is there.
  const { SHEETS, OPENING } = await import('../public/js/sheets/style.js');
  assert.ok(OPENING > 0, 'the page opens one step in from the widest sheet');
  assert.doesNotMatch(html, /<button id="out"[^>]* disabled>/);
  const dots = html.match(/<div id="sheets"[^>]*>((?:<i(?: class="on")?><\/i>)+)<\/div>/)?.[1] ?? '';
  assert.deepEqual([...dots.matchAll(/<i( class="on")?>/g)].map((m) => Boolean(m[1])), SHEETS.map((_, i) => i === OPENING), 'one dot per sheet, the opening one lit');
  assert.match(html, new RegExp(`<div id="sheets"[^>]*aria-label="Sheet ${OPENING + 1} of ${SHEETS.length}"`));
});

test('the front page works at any address the host answers with it', () => {
  // The site has no 404 page, so Cloudflare answers a path it does not have (the old /sheets/) with the front page.
  for (const ref of refs('')) assert.ok(ref.startsWith('/'), `${ref} is asked for from the root`);
});

test('shared browser modules find their files from their scripts', () => {
  const dir = path.join(PUBLIC, 'js');
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, name), 'utf8');
    // A fetch, or an address handed to the map (a layer's data, the glyphs), that starts at the page.
    assert.doesNotMatch(code, /fetch\(\s*['"`](?!https?:|\/)|['"`](?:data|vendor|css|js)\/|document\.baseURI/, `${name} reads a file beside the page`);
  }
});

test('Classic-only checks accept archived maps and reject the current sheet map', async (t) => {
  const classic = '<script type="module" src="../js/main.js"></script>';
  const sheets = '<script type="module" src="/js/sheets/main.js"></script>';
  const sites = {
    'http://archive': { '/': sheets, '/classic/': classic },
    'http://old': { '/': classic, '/classic/': classic },
    'http://current': { '/': sheets, '/classic/': sheets },
  };
  t.mock.method(globalThis, 'fetch', async (u) => {
    const { origin, pathname } = new URL(u);
    if (!sites[origin]) throw new Error('unreachable');
    const body = sites[origin][pathname];
    return { ok: body !== undefined, text: async () => body };
  });
  assert.equal(await mapPath('http://archive'), '/classic/');
  assert.equal(await mapPath('http://old'), '/', 'a host that answers a missing page with its front page');
  await assert.rejects(mapPath('http://current'), /Classic map/);
  await assert.rejects(mapPath('http://down'), /Classic map/);
});

test("the checks' in-page helpers ask for the site's files from its root, wherever the map's page is", () => {
  const code = fs.readFileSync(fileURLToPath(new URL('../qa/lib/inpage.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(code, /(?:fetch|import)\(\s*['"`](?!https?:|\/)/);
});

test('every script the pages run parses as a module (#152: a name declared twice stopped the page)', async () => {
  const { execFileSync } = await import('node:child_process');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []));
  for (const file of walk(path.join(PUBLIC, 'js'))) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }), path.relative(PUBLIC, file));
  }
});
