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

test('the front page is the four sheets, and the classic map is one link from it', () => {
  assert.ok(asked('').includes('/js/sheets/main.js'), 'the front page runs the sheets');
  assert.ok(asked('').includes('/classic/'), 'and links to the classic map');
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

test('the front page works at any address the host answers with it', () => {
  // The site has no 404 page, so Cloudflare answers a path it does not have (the old /sheets/) with the front page.
  for (const ref of refs('')) assert.ok(ref.startsWith('/'), `${ref} is asked for from the root`);
});

test('the classic map finds its files from where its scripts are, not from the page', () => {
  const dir = path.join(PUBLIC, 'js');
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(code, /fetch\(\s*['"`](?!https?:|\/)|document\.baseURI/, `${name} reads a file beside the page`);
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
