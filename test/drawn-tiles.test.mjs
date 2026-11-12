// #58: the tile cache notices a new basemap build and doesn't keep a 404.
// OpenFreeMap's TileJSON stays at one URL while the tile URLs inside it name
// the build, so the cached TileJSON has to be read again; a frozen build
// keeps the one it was frozen with.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Tiles } from '../qa/drawn/tiles.mjs';

const SOURCE = { url: 'https://tiles.example/planet' };
const tilejson = (build) => ({ tiles: [`https://tiles.example/planet/${build}/{z}/{x}/{y}.pbf`], maxzoom: 14 });

// A server: the TileJSON names `build`, and the tiles listed in `missing`
// answer 404. Every URL asked is kept.
function server(state) {
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    if (url === SOURCE.url) return { ok: true, status: 200, json: async () => tilejson(state.build) };
    if (state.missing?.some((m) => url.endsWith(m))) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  return { get, asked };
}

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'drawn-tiles-'));
const cacheFile = (root) => path.join(root, 'qa', 'cache', 'tiles', 'tilejson.json');
const writeCached = (root, build, fetched) => {
  fs.mkdirSync(path.dirname(cacheFile(root)), { recursive: true });
  fs.writeFileSync(cacheFile(root), JSON.stringify({ url: SOURCE.url, ...(fetched ? { fetched } : {}), json: tilejson(build) }));
};
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

test('a TileJSON cached today is used as it is', async () => {
  const root = tempRoot();
  writeCached(root, 'build-1', daysAgo(0.1));
  const s = server({ build: 'build-2' });
  const t = new Tiles({ root, source: SOURCE, fetch: s.get });
  await t.tile(10, 1, 2);
  assert.deepEqual(s.asked, ['https://tiles.example/planet/build-1/10/1/2.pbf']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a new TileJSON version reads new tiles, into a folder of its own', async () => {
  const root = tempRoot();
  writeCached(root, 'build-1', daysAgo(2));
  const s = server({ build: 'build-2' });
  const t = new Tiles({ root, source: SOURCE, fetch: s.get });
  await t.tile(10, 1, 2);
  assert.deepEqual(s.asked, [SOURCE.url, 'https://tiles.example/planet/build-2/10/1/2.pbf']);
  assert.match(await t.folder(), /build-2$/);
  assert.ok(fs.existsSync(path.join(await t.folder(), '10', '1', '2.pbf')));
  const saved = JSON.parse(fs.readFileSync(cacheFile(root), 'utf8'));
  assert.equal(saved.json.tiles[0], tilejson('build-2').tiles[0]);
  assert.ok(Date.now() - Date.parse(saved.fetched) < 60_000);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a TileJSON with no time on it is read again', async () => {
  const root = tempRoot();
  writeCached(root, 'build-1', null);
  const s = server({ build: 'build-2' });
  await new Tiles({ root, source: SOURCE, fetch: s.get }).load();
  assert.deepEqual(s.asked, [SOURCE.url]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a frozen build keeps the TileJSON it was frozen with', async () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, 'manifest.json'), '{}');
  writeCached(root, 'build-1', null);
  const s = server({ build: 'build-2' });
  const t = new Tiles({ root, source: SOURCE, fetch: s.get });
  await t.tile(10, 1, 2);
  assert.deepEqual(s.asked, ['https://tiles.example/planet/build-1/10/1/2.pbf']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a tile that answers 404 is empty and not written to the cache', async () => {
  const root = tempRoot();
  writeCached(root, 'build-1', daysAgo(0));
  const s = server({ build: 'build-1', missing: ['/10/1/2.pbf'] });
  const t = new Tiles({ root, source: SOURCE, fetch: s.get });
  assert.equal(await t.tile(10, 1, 2), null);
  assert.equal(fs.existsSync(path.join(await t.folder(), '10', '1', '2.pbf')), false);
  // Asked once in a run, and again in the next, so once the server has it,
  // it is read.
  assert.equal(await t.tile(10, 1, 2), null);
  assert.equal(s.asked.filter((u) => u.endsWith('/10/1/2.pbf')).length, 1);
  const next = new Tiles({ root, source: SOURCE, fetch: s.get });
  assert.equal(await next.tile(10, 1, 2), null);
  assert.equal(s.asked.filter((u) => u.endsWith('/10/1/2.pbf')).length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});
