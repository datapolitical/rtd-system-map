// The sheets page makes other sheets' tiles ahead of a step by reaching into parts of MapLibre it
// does not promise to keep (public/js/sheets/main.js, "The other sheets' tiles"). If an update
// renames them the page still works, with a flash on each step, so this test says so at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../node_modules/maplibre-gl/dist/maplibre-gl.mjs', import.meta.url), 'utf8');
const used = ['tileManagers', '_outOfViewCache', 'getIds', 'getTileByID', 'getSource', 'loadTile', 'unloadTile', 'overscaleFactor', 'hasData', 'getExpiryTimeout', 'getRenderableIds'];

test('MapLibre still has the internals the step warm-up uses', () => {
  const missing = used.filter((name) => !bundle.includes(name));
  assert.deepEqual(missing, [], `MapLibre no longer has ${missing.join(', ')}: check main.js warm(), stepReady() and canWarm() against it`);
});
