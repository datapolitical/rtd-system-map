import test from 'node:test';
import assert from 'node:assert/strict';
import { whatChanged } from '../refresh/check.mjs';

const meta = {
  built: '2026-11-06T20:00:00Z',
  sources: {
    experience: { id: 'exp', modified: 1000 },
    webmap: { id: 'map', modified: 2000 },
    layers: {
      routes: { url: 'https://arcgis.example/FeatureServer/4', lastEditDate: 3000 },
      stops: { url: 'https://arcgis.example/FeatureServer/2', lastEditDate: 4000 },
    },
    gtfs: { url: 'https://rtd.example/gtfs.zip', sha256: 'aaaa1111aaaa1111' },
  },
};

// RTD as it is now, by URL.
const rtd = (overrides = {}) => ({
  getJson: async (url) => {
    const now = {
      'https://www.arcgis.com/sharing/rest/content/items/exp?f=json': { modified: 1000 },
      'https://www.arcgis.com/sharing/rest/content/items/map?f=json': { modified: 2000 },
      'https://arcgis.example/FeatureServer/4?f=json': { editingInfo: { lastEditDate: 3000 } },
      'https://arcgis.example/FeatureServer/2?f=json': { editingInfo: { lastEditDate: 4000 } },
      ...overrides,
    }[url];
    if (now instanceof Error) throw now;
    if (!now) throw new Error(`unexpected ${url}`);
    return now;
  },
  sha256: async () => overrides.gtfs ?? 'aaaa1111aaaa1111',
});

test('nothing changed: no rebuild', async () => {
  assert.deepEqual(await whatChanged(meta, rtd()), { changes: [], problems: [] });
});

test('an edited layer, a new GTFS file or a changed item each call for a rebuild', async () => {
  const edited = await whatChanged(meta, rtd({ 'https://arcgis.example/FeatureServer/2?f=json': { editingInfo: { lastEditDate: 4500 } } }));
  assert.equal(edited.changes.length, 1);
  assert.match(edited.changes[0], /^stops layer: edited /);
  const newFeed = await whatChanged(meta, rtd({ gtfs: 'bbbb2222bbbb2222' }));
  assert.deepEqual(newFeed.changes, ['GTFS: new file (bbbb2222bbbb…, was aaaa1111aaaa…)']);
  const republished = await whatChanged(meta, rtd({ 'https://www.arcgis.com/sharing/rest/content/items/exp?f=json': { modified: 1500 } }));
  assert.equal(republished.changes.length, 1);
  assert.match(republished.changes[0], /^experience: modified/);
});

test('a source that cannot be read is reported, not rebuilt on', async () => {
  const out = await whatChanged(meta, rtd({ 'https://arcgis.example/FeatureServer/4?f=json': new Error('HTTP 503') }));
  assert.deepEqual(out.changes, []);
  assert.deepEqual(out.problems, ['routes layer: could not check (HTTP 503)']);
});
