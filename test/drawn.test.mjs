// The drawn model's plain-Node parts (qa/drawn/README.md): the mercator
// arithmetic the whole model stands on, the label measurement, and the
// comparison the drift test uses. No browser, no network, no build: what the
// drift test cannot check on a laptop (a page that draws the wrong thing)
// is checked here against a planted fault of the same size.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipLine, toLonLat, toWorld, worldSize } from '../qa/drawn/mercator.mjs';
import { boxDistance, compareBoxes, compareLines, comparePoints } from '../qa/drawn/compare.mjs';
import { layout } from '../qa/drawn/glyphs.mjs';
import { ROOT } from '../qa/drawn/model.mjs';

test('world pixels: 512 at zoom 0, doubling every zoom', () => {
  assert.equal(worldSize(0), 512);
  assert.equal(worldSize(1), 1024);
  assert.equal(worldSize(17), 512 * 2 ** 17);
});

test('mercator: a point survives a round trip at every zoom', () => {
  for (const z of [9, 12.5, 17]) {
    for (const lonlat of [[-105.0005, 39.753], [-104.8, 39.5], [-105.3, 40.1]]) {
      const [lon, lat] = toLonLat(toWorld(lonlat, z), z);
      assert.ok(Math.abs(lon - lonlat[0]) < 1e-9, `lon at ${z}: ${lon}`);
      assert.ok(Math.abs(lat - lonlat[1]) < 1e-9, `lat at ${z}: ${lat}`);
    }
  }
});

test('the world is one tile wide at zoom 0 and two at zoom 1', () => {
  const [x0] = toWorld([-180, 0], 0);
  const [x1] = toWorld([0, 0], 1);
  assert.equal(x0, 0);
  assert.ok(Math.abs(x1 - 512) < 1e-9);
});

test('clipping a line to a box keeps what is inside and cuts the rest', () => {
  const runs = clipLine([[0, 0], [10, 0], [20, 0]], [5, -1, 15, 1]);
  assert.ok(runs.length >= 1);
  assert.deepEqual(runs.flat()[0], [5, 0]);
  assert.deepEqual(runs.flat().at(-1), [15, 0]);
  for (const run of runs) for (const [x, y] of run) assert.ok(x >= 5 && x <= 15 && y >= -1 && y <= 1, `${x},${y} outside the box`);
  assert.deepEqual(clipLine([[0, 0], [1, 0]], [5, 5, 15, 15]), []);
});

test('label text: one line fits, a long name wraps to the same width each line', () => {
  const one = layout(ROOT, 'Union Station', { fontstack: 'Overpass Regular', size: 12, lineHeight: 1.2, maxWidth: 10 });
  assert.equal(one.lines.length, 1);
  assert.ok(one.width > 40 && one.width < 120, `width ${one.width}`);
  assert.ok(Math.abs(one.height - 12 * 1.2) < 1e-9, `height ${one.height}`);
  const many = layout(ROOT, 'Arapahoe at Village Center Station', { fontstack: 'Overpass Regular', size: 12, lineHeight: 1.2, maxWidth: 10 });
  assert.ok(many.lines.length > 1, `lines ${many.lines.length}`);
  assert.ok(many.width <= one.width * 3, `width ${many.width}`);
  assert.ok(Math.abs(many.height - many.lines.length * 12 * 1.2) < 1e-9, `height ${many.height}`);
  // Twice the size, twice the width: the glyph advances scale with the text.
  const big = layout(ROOT, 'Union Station', { fontstack: 'Overpass Regular', size: 24, lineHeight: 1.2, maxWidth: 10 });
  assert.ok(Math.abs(big.width - one.width * 2) < 1e-6, `big ${big.width} vs ${one.width * 2}`);
});

const line = { layer: 'rail', route: 'A', parts: [[[10, 10], [50, 10], [50, 60]]] };

test('the drift comparison passes lines that agree and names the ones that do not', () => {
  const same = compareLines([{ ...line }], [line], { tolerance: 1, width: 390, height: 664 });
  assert.equal(same.failures.length, 0);
  assert.ok(same.worst < 1e-9, `worst ${same.worst}`);
  // The seeded fault: the model three px off, the size the drift test must catch.
  const off = compareLines([{ ...line }], [{ ...line, parts: [line.parts[0].map(([x, y]) => [x, y + 3])] }], { tolerance: 1, width: 390, height: 664 });
  assert.ok(off.failures.length > 0);
  assert.equal(off.failures[0].layer, 'rail');
  assert.equal(off.failures[0].route, 'A');
  assert.ok(Math.abs(off.failures[0].distance - 3) < 1e-9);
  // A vertex off the screen is not compared: tiles clip lines their own way.
  const outside = compareLines([{ ...line, parts: [[[-50, -50], [-40, -50]]] }], [{ ...line, parts: [[[0, 0], [1, 1]]] }], { tolerance: 1, width: 390, height: 664 });
  assert.equal(outside.pairs, 0);
  assert.equal(outside.failures.length, 0);
});

test('a page line the model does not load is missing, not silently passed', () => {
  // The model has nothing for `street`, the layer the buses are drawn in;
  // comparing nothing must not read as agreeing.
  const page = [{ layer: 'street', route: null, parts: [[[10, 10], [50, 10]]] }];
  const r = compareLines(page, [line], { tolerance: 1, width: 390, height: 664 });
  assert.equal(r.pairs, 0);
  assert.equal(r.failures.length, 0);
  assert.equal(r.missing, 2);
  assert.deepEqual(r.missingLayers, [['street', 2]]);
});

test('the drift comparison passes boxes that agree and flags a two px shift', () => {
  const box = [100, 100, 160, 120];
  const ok = compareBoxes([{ layer: 'station-labels', props: { id: 1 }, box }], () => [box], { tolerance: 2 });
  assert.equal(ok.failures.length, 0);
  assert.equal(boxDistance(box, box), 0);
  const shifted = compareBoxes([{ layer: 'station-labels', props: { id: 1 }, box }], () => [[103, 100, 163, 120]], { tolerance: 2 });
  assert.equal(shifted.failures.length, 1);
  assert.equal(shifted.failures[0].id, 1);
  // Any one of a feature's boxes may be the one the page placed: a bullet's
  // letter and its icon are separate boxes.
  const many = compareBoxes([{ layer: 'rail-bullets', props: { route: 'A' }, box }], () => [[0, 0, 10, 10], [102, 100, 162, 120]]);
  assert.equal(many.failures.length, 0);
});

test('mark comparison: a station two px from where the page drew it fails', () => {
  const drawn = [{ layer: 'stations', id: 7, x: 100, y: 100 }];
  const same = comparePoints(drawn, () => [[100, 100]], { tolerance: 1 });
  assert.equal(same.failures.length, 0);
  const off = comparePoints(drawn, () => [[102, 100]], { tolerance: 1 });
  assert.equal(off.failures.length, 1);
  assert.equal(off.failures[0].id, 7);
  assert.equal(off.failures[0].distance, 2);
});
