// Sizes as zoom rules (#155): a drawing between two of today's sheets takes each size
// straight from one sheet's value to the next, and every "which sheet" switch is now the
// zoom at which the thing comes in. The five anchored drawings keep their sizes exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SHEETS, SIZES, sheetAt, mergeMetresAt, mergeDistance, busStreets, drawSheet, length } from '../scripts/lib/sheets.mjs';

const DATA = new URL('../public/data/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(`${name}.geojson`, DATA), 'utf8'));
const HAVE_DATA = existsSync(new URL('streets.geojson', DATA)) && existsSync(new URL('routes.geojson', DATA));
const NO_DATA = HAVE_DATA ? false : 'public/data is not built; run npm run build:data';

test('each of today\'s five sheets is still got back exactly, and only zoom 16 uses the near streets', () => {
  for (const sheet of SHEETS) {
    const at = sheetAt(sheet.zoom);
    assert.deepEqual(at, sheet, `zoom ${sheet.zoom} is sheet ${sheet.id}`);
    for (const name of ['rail', 'gap', 'name', 'letterDisc', 'busMerge', 'busLabelSize']) {
      assert.equal(SIZES[name][at.id], SIZES[name][sheet.id], `${name} at zoom ${sheet.zoom}`);
    }
    assert.equal(mergeDistance(at, 39.75), SIZES.busMerge[sheet.id], `merge at zoom ${sheet.zoom}`);
  }
  // A divided road is one line out to zoom 16 and its two carriageways from 16 in (#81, #240).
  assert.equal(sheetAt(14).streets, 'far');
  assert.equal(sheetAt(15.9).streets, 'far');
  assert.equal(sheetAt(16).streets, 'near');
});

test('a drawing between two sheets runs each size straight between their values', () => {
  const between = (zoom, name) => SIZES[name][sheetAt(zoom).id];
  // 11 is halfway from 10 to 12, 13 halfway from 12 to 14, 15 halfway from 14 to 16.
  assert.equal(sheetAt(11).id, 1.5);
  assert.equal(sheetAt(13).id, 2.5);
  assert.equal(sheetAt(15).id, 3.5);
  assert.ok(Math.abs(between(11, 'rail') - (SIZES.rail[1] + SIZES.rail[2]) / 2) < 1e-9);
  assert.ok(Math.abs(between(13, 'rail') - (SIZES.rail[2] + SIZES.rail[3]) / 2) < 1e-9);
  assert.ok(Math.abs(between(15, 'name') - (SIZES.name[3] + SIZES.name[4]) / 2) < 1e-9);
  assert.ok(Math.abs(between(13, 'busLabelSize') - (SIZES.busLabelSize[2] + SIZES.busLabelSize[3]) / 2) < 1e-9);
  // The switches are zooms now: every station is named from 11, the whole district's naming holds out to 9.375.
  assert.ok(sheetAt(11).zoom >= SIZES.nameAllFrom && sheetAt(10.9).zoom < SIZES.nameAllFrom);
  assert.ok(sheetAt(9).zoom < SIZES.nameFarUntil && sheetAt(10).zoom > SIZES.nameFarUntil);
});

test('streets only split as the map zooms in: the merge distance on the ground never grows', () => {
  let was = Infinity;
  for (let zoom = SHEETS[0].zoom; zoom <= SHEETS.at(-1).zoom + 1e-9; zoom += 0.05) {
    const now = mergeMetresAt(zoom);
    assert.ok(now <= was + 1e-9, `at zoom ${zoom.toFixed(2)} the merge distance grew: ${was} to ${now}`);
    was = now;
  }
  // The fault this fixes: two streets 27 m apart were apart at 14 (25.7 m), joined at 15 (28.7 m
  // under the old straight-in-pixels rule) and apart again at 16 (22 m).
  assert.ok(27 > mergeMetresAt(14) && 27 > mergeMetresAt(15) && 27 > mergeMetresAt(16));
  assert.ok(mergeMetresAt(15) <= mergeMetresAt(14));
});

test('real streets only gain lines from 14 to 15, never lose a street to a merge', { skip: NO_DATA }, () => {
  const streets = read('streets');
  const at = (zoom) => {
    const sheet = sheetAt(zoom);
    return busStreets(streets, sheet);
  };
  const [fourteen, fifteen] = [at(14), at(15)];
  assert.ok(fourteen.length > 1000 && fifteen.length > fourteen.length,
    `bus streets at 14: ${fourteen.length}, at 15: ${fifteen.length}`);
  // The drawn length grows too: a closer drawing cannot fold two streets into one it had apart.
  const km = (list) => list.reduce((sum, s) => sum + length(s.path), 0) / 1000;
  assert.ok(km(fifteen) > km(fourteen), `bus street km at 14: ${km(fourteen).toFixed(1)}, at 15: ${km(fifteen).toFixed(1)}`);
});

test('the build draws at 11, 13 and 15 with no sheet number', { skip: NO_DATA }, () => {
  const data = {
    routes: read('routes'), stations: read('stations'), streets: read('streets'),
    terminals: read('terminals'), stops: read('stops'),
  };
  const bus = (d) => d.features.filter((f) => f.properties.kind === 'bus').length;
  const rail = (d) => d.features.filter((f) => f.properties.kind === 'rail').length;
  const drawn = [11, 13, 15].map((zoom) => ({ zoom, features: drawSheet(data, zoom) }));
  for (const { zoom, features } of drawn) {
    assert.ok(features.features.length > 1000 && rail(features) === 9, `zoom ${zoom}: ${features.features.length} features, ${rail(features)} rail`);
  }
  // A closer drawing has more of the streets, never fewer: they only split.
  assert.ok(bus(drawn[0].features) < bus(drawn[1].features) && bus(drawn[1].features) < bus(drawn[2].features),
    `bus streets: ${drawn.map((d) => bus(d.features)).join(', ')}`);
  // A drawing between sheets has the sizes it should: rail wider than at 12, narrower than at 14.
  const width = (zoom) => SIZES.rail[sheetAt(zoom).id];
  assert.ok(width(12) < width(13) && width(13) < width(14));
});

test('the merge distance runs straight between the sheets: the halfway zoom is the halfway distance', () => {
  for (let i = 1; i < SHEETS.length; i++) {
    const [a, b] = [SHEETS[i - 1], SHEETS[i]];
    const mid = mergeMetresAt((a.zoom + b.zoom) / 2);
    const want = (mergeMetresAt(a.zoom) + mergeMetresAt(b.zoom)) / 2;
    assert.ok(Math.abs(mid - want) < 1e-6, `${a.zoom} to ${b.zoom}: ${mid} is not halfway to ${want}`);
    assert.ok(mid < mergeMetresAt(a.zoom) && mid > mergeMetresAt(b.zoom), 'and strictly between the two');
  }
});
