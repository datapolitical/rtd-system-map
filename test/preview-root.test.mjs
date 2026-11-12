import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/index.js';

// As Cloudflare Pages serves a site with no 404 page: a path with no page of its own answers
// with the main map, and is "ok".
const pages = new Map([['/sheets/', 'the sheets']]);
const env = { ASSETS: { fetch: async (u) => ({ ok: true, text: async () => pages.get(new URL(u).pathname) ?? 'the main map' }) } };
const go = (href) => onRequest({ request: new Request(href), env, next: async () => 'main map' });

test("a branch preview named after a page opens on that page; everything else serves the main map", async () => {
  const r = await go('https://sheets.rtd-system-map.pages.dev/?x=1');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://sheets.rtd-system-map.pages.dev/sheets/?x=1');
  assert.equal(await go('https://rtd-system-map.pages.dev/'), 'main map', 'the live site');
  assert.equal(await go('https://hub-far-zoom.rtd-system-map.pages.dev/'), 'main map', 'a preview with no page of its name');
  assert.equal(await go('https://9affe987.rtd-system-map.pages.dev/'), 'main map', "one build's own address");
  assert.equal(await go('https://sheets.rtd-system-map.pages.dev/sheets/'), 'main map', 'only the root moves');
  assert.equal(await go('http://localhost:8788/'), 'main map');
});
