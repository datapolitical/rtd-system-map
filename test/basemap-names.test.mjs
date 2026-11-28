// #242: areas and rivers lettered the way printed maps do. The names the build
// will place come from OpenStreetMap through OpenMapTiles, in the same planet
// file the ground pack is cut from. This pins what the pack must keep beyond
// what the style draws, so the next `npm run build:basemap` carries them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groundBuildDraws, groundBuildNeeds, groundDraws, groundNeeds, mergeNeeds, readPack } from '../scripts/lib/basemap.mjs';

test('groundBuildNeeds keeps river and lake names for the build', () => {
  // The style draws rivers as lines (waterway) and lakes as fills (water), and
  // reads no names; the build's lettering reads the names off the same ground.
  assert.deepEqual(groundBuildNeeds(), {
    waterway: ['name'],
    water_name: ['name', 'class', 'intermittent'],
  });
});

test('mergeNeeds unions the style and build needs without dropping fields', () => {
  const merged = mergeNeeds(groundNeeds(), groundBuildNeeds());
  // waterway is named by both: the style keeps class, the build adds name.
  assert.deepEqual([...merged.waterway].sort(), ['class', 'name']);
  // water_name is a build-only layer.
  assert.deepEqual([...merged.water_name].sort(), ['class', 'intermittent', 'name']);
  // Style-only layers stay as the style declared them.
  assert.deepEqual([...merged.place].sort(), ['class', 'name', 'rank']);
  assert.deepEqual([...merged.transportation].sort(), ['brunnel', 'class']);
});

test('groundBuildDraws keeps only named water bodies', () => {
  const keep = groundBuildDraws();
  const lake = { properties: { name: "Sloan's Lake", class: 'lake', intermittent: 0 } };
  const blank = { properties: { name: '' } };
  const unnamed = { properties: { class: 'lake' } };
  assert.equal(keep(14, 'water_name', lake), true);
  assert.equal(keep(14, 'water_name', blank), false);
  assert.equal(keep(14, 'water_name', unnamed), false);
  // Waterways and the rest are kept by the style's own rules (groundDraws),
  // not by the build's: a river line stays, and its name is a field, not a
  // reason to keep it.
  assert.equal(keep(14, 'waterway', { properties: { name: 'Cherry Creek' } }), false);
  assert.equal(keep(14, 'place', { properties: { name: 'Denver' } }), false);
  assert.equal(keep(14, 'park', { properties: { name: 'City Park' } }), false);
});

test('the style still draws every river line the build names', () => {
  // A river is kept by the style's river layer (class=river); the build's
  // waterway.name field rides the features that layer keeps.
  const draws = groundDraws(14);
  const river = { properties: { class: 'river', name: 'South Platte River' } };
  const stream = { properties: { class: 'stream', name: 'Lee Gulch' } };
  assert.equal(draws(14, 'waterway', river), true);
  assert.equal(draws(14, 'waterway', stream), false);
});

test('the committed ground pack holds every field the style reads', async () => {
  // Real data: the pack on disk is what the site serves, and it must satisfy
  // the style's needs (scripts/publish-check.mjs checks the same). The build's
  // own needs are added by groundBuildNeeds and land in the pack on the next
  // build:basemap.
  const pack = await readPack();
  assert.ok(pack, 'basemap/ has a ground pack');
  assert.ok(pack.count > 0, 'the pack has tiles');
  for (const [layer, fields] of Object.entries(groundNeeds())) {
    assert.ok(pack.layers[layer], `the pack holds the ${layer} layer`);
    for (const field of fields) {
      assert.ok(pack.layers[layer].includes(field), `the pack holds ${layer}.${field}`);
    }
  }
});
