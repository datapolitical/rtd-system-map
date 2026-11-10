// Lines as drawn (qa/drawn/strokes.mjs) and the drift test's measurement of
// them (qa/drawn/compare.mjs): MapLibre's offset rule on plain shapes, and a
// fake page whose hit-test draws a line a known amount off, which the
// comparison must catch. No browser, no data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capReach, drawnWidth, offsetPart } from '../qa/drawn/strokes.mjs';
import { compareLines, compareLinesBack, compareProbes, lineSamples, modelHitMap, probeLines, signature } from '../qa/drawn/compare.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const close = (p, q, eps = 1e-9) => near(p[0], q[0], eps) && near(p[1], q[1], eps);

test('a positive offset moves a line to its right (y down: an eastward line moves south)', () => {
  assert.deepEqual(offsetPart([[0, 0], [100, 0]], 4), [[0, 4], [100, 4]]);
  assert.deepEqual(offsetPart([[0, 0], [100, 0]], -4), [[0, -4], [100, -4]]);
  // Westward, right is north.
  assert.deepEqual(offsetPart([[100, 0], [0, 0]], 4), [[100, -4], [0, -4]]);
});

test('a right-angle corner is offset along its bisector, scaled by the miter length', () => {
  // East then south: a right turn; the offset (to the right) is inside the turn.
  // A right angle is sharper than 75 degrees, so MapLibre also adds a vertex
  // 15 px before and after the corner, each on its own segment's normal.
  const out = offsetPart([[0, 0], [100, 0], [100, 100]], 4);
  assert.equal(out.length, 5);
  assert.ok(close(out[1], [85, 4]), `before ${out[1]}`);
  assert.ok(close(out[2], [96, 4]), `corner ${out[2]}`);
  assert.ok(close(out[3], [96, 15]), `after ${out[3]}`);
});

test('a gentle corner is one offset vertex, with no extra vertices', () => {
  // A 30 degree turn: miter length 1/cos(15deg).
  const c = [100 + 100 * Math.cos(Math.PI / 6), 100 * Math.sin(Math.PI / 6)];
  const out = offsetPart([[0, 0], [100, 0], c], 4);
  assert.equal(out.length, 3);
  const miter = 1 / Math.cos(Math.PI / 12);
  assert.ok(Math.abs(Math.hypot(out[1][0] - 100, out[1][1]) - 4 * miter) < 1e-9);
});

test('the miter is capped at 2, so a 60 degree corner is not pushed out to its full miter', () => {
  // Turn by 120 degrees (an inside angle of 60): miter length is 2 exactly.
  const a = [0, 0], b = [100, 0], c = [100 - 50, 50 * Math.sqrt(3)];
  const out = offsetPart([a, b, c], 10);
  const moved = Math.hypot(out.find((p, i) => i > 0 && i < out.length - 1 && Math.abs(p[0] - 100) < 30)[0] - 100, 0);
  assert.ok(moved < 30, 'stays near the corner');
});

test('a hairpin eases to the segments\' own normals: two points, not one far down the bisector', () => {
  // Out east 100 px and back almost the same way: miter length far above 8.
  const out = offsetPart([[0, 0], [100, 0], [0, 4]], 3);
  const atCorner = out.filter((p) => Math.abs(p[0] - 100) < 1);
  assert.equal(atCorner.length, 2);
  for (const p of atCorner) assert.ok(Math.abs(p[1]) < 10, `${p}`);
});

test('a corner sharper than 75 degrees gets a vertex 15 px before and after it on the segment normals', () => {
  const out = offsetPart([[0, 0], [100, 0], [100 - 100 * Math.cos(Math.PI / 4), 100 * Math.sin(Math.PI / 4)]], 2, 16);
  // The vertex 15 px before the corner, moved by the first segment's normal.
  assert.ok(out.some((p) => close(p, [85, 2], 1e-6)), JSON.stringify(out));
});

test('drawn width: a gap draws a line each side of it; caps reach past the end only when round or square', () => {
  assert.equal(drawnWidth(3), 3);
  assert.equal(drawnWidth(3, 4), 10);
  assert.equal(capReach('butt', 6), 0);
  assert.equal(capReach('round', 6), 3);
  assert.equal(capReach('square', 6), 3);
});

// A fake page: one line along y = 100 drawn `shift` px further down than the
// model has it and `extra` px wider, hit-tested exactly as MapLibre does (a
// point is on the line when it is within half its width of its centre).
function fakePage({ properties, layer = 'rail', y = 100, half = 3, shift = 0, extra = 0 }) {
  return {
    queryRenderedFeatures([px, py], { layers }) {
      if (!layers.includes(layer)) return [];
      return Math.abs(py - (y + shift)) <= half + extra / 2 && px >= 0 && px <= 400 ? [{ properties }] : [];
    },
  };
}
const model = (properties, half = 3) => [{ layer: 'rail', properties, route: 'A', drawnWidth: 2 * half, opacity: 1, parts: [[[0, 100], [400, 100]]], drawn: [[[0, 100], [400, 100]]] }];

test('the page and the model agree: centre and width within a few hundredths of a px', () => {
  const properties = { route: 'A', slot: 1 };
  const lines = model(properties);
  const samples = lineSamples(lines, { width: 400, height: 300 });
  assert.equal(samples.length, 1);
  globalThis.window = { __map: fakePage({ properties }) };
  const r = compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(lines)));
  assert.equal(r.failures.length, 0);
  assert.ok(Math.abs(r.worstShift) < 0.05 && Math.abs(r.worstWidth) < 0.05, JSON.stringify(r));
});

test('a model offset 2 px off fails', () => {
  const properties = { route: 'A', slot: 1 };
  const lines = model(properties);
  const samples = lineSamples(lines, { width: 400, height: 300 });
  globalThis.window = { __map: fakePage({ properties, shift: 2 }) };
  const r = compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(lines)));
  assert.equal(r.failures.length, 1);
  assert.ok(Math.abs(r.worstShift - 2) < 0.05, `shift ${r.worstShift}`);
});

test('a model width 1 px off fails', () => {
  const properties = { route: 'A', slot: 1 };
  const lines = model(properties);
  const samples = lineSamples(lines, { width: 400, height: 300 });
  globalThis.window = { __map: fakePage({ properties, extra: 1 }) };
  const r = compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(lines)));
  assert.equal(r.failures.length, 1);
  assert.ok(Math.abs(r.worstWidth - 1) < 0.05, `width ${r.worstWidth}`);
});

test('a line the page has somewhere else, or not at all, fails', () => {
  const properties = { route: 'A', slot: 1 };
  const lines = model(properties);
  const samples = lineSamples(lines, { width: 400, height: 300 });
  globalThis.window = { __map: fakePage({ properties, shift: 12 }) };
  assert.equal(compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(lines))).failures[0].problem, 'the page draws no such line where the model has it');
  globalThis.window = { __map: fakePage({ properties: { route: 'B', slot: 1 } }) };
  assert.equal(compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(lines))).failures.length, 1);
});

test('a layer the model leaves out fails the page-to-model comparison', () => {
  const page = [{ layer: 'street', route: null, parts: [[[10, 10], [50, 10]]] }];
  const r = compareLines(page, [{ layer: 'rail', route: 'A', parts: [[[0, 0], [1, 1]]] }], { width: 390, height: 664 });
  assert.equal(r.missing, 2);
});

test('a feature the page does not draw fails the model-to-page comparison', () => {
  const properties = { route: 'A', slot: 1 };
  const lines = model(properties);
  assert.equal(compareLinesBack(lines, [{ layer: 'rail', sig: signature(properties) }]).missing, 0);
  const r = compareLinesBack(lines, [{ layer: 'rail', sig: signature({ route: 'A', slot: 2 }) }]);
  assert.equal(r.missing, 1);
  assert.equal(r.failures[0].problem, 'the model draws a line the page does not');
});

test('the signature is the same in the page and in Node, and ignores what the page cannot carry', () => {
  const properties = { route: 'A', slot: 1, tier: 'frequent', $type: 2, nested: { a: 1 }, len: 12.3456789012 };
  // The page-side copy inside probeLines must agree with signature(): a
  // fake page that returns these properties is a hit only if they do.
  const samples = [{ layer: 'rail', sig: signature(properties), x: 200, y: 100, nx: 0, ny: 1, half: 3 }];
  globalThis.window = { __map: fakePage({ properties: { ...properties, $type: undefined } }) };
  assert.equal(probeLines({ samples })[0].centre, true);
  assert.equal(signature({ b: 1, a: 'x' }), signature({ a: 'x', b: 1 }));
});

// Two lines of one feature side by side: both directions of a route, drawn
// as separate features with the same properties. The page's hit-test can't
// tell them apart, so the model is measured the same way and they agree.
test('a twin line touching the first is measured as one on both sides, and agrees', () => {
  const properties = { route: 'A', slot: 1 };
  const twin = { layer: 'rail', properties, route: 'A', drawnWidth: 6, opacity: 1, parts: [[[0, 106], [400, 106]]], drawn: [[[0, 106], [400, 106]]] };
  const lines = [...model(properties), twin];
  const samples = lineSamples(model(properties), { width: 400, height: 300 });
  // The page draws both, touching: one band from y 97 to 109.
  globalThis.window = { __map: { queryRenderedFeatures: ([, py], { layers }) => (layers.includes('rail') && py >= 97 && py <= 109 ? [{ properties }] : []) } };
  const r = compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(lines)));
  assert.equal(r.failures.length, 0, JSON.stringify(r.failures));
  // Without the twin in the model, the page's band is 6 px wider than it.
  const alone = compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(model(properties))));
  assert.equal(alone.failures.length, 1);
});

test('a thin line the page draws a fraction of a px off is found, not reported missing', () => {
  const properties = { route: 'A', slot: 1 };
  const lines = model(properties, 0.3);
  const samples = lineSamples(lines, { width: 400, height: 300 });
  // A 0.6 px line drawn 0.5 px below the model's: the model's centre misses it.
  globalThis.window = { __map: fakePage({ properties, half: 0.3, shift: 0.5 }) };
  const r = compareProbes(samples, probeLines({ samples }), probeLines({ samples }, modelHitMap(lines)));
  assert.equal(r.failures.length, 0, JSON.stringify(r.failures));
  assert.ok(Math.abs(r.worstShift - 0.5) < 0.05, `shift ${r.worstShift}`);
});

test('a sample is taken only where its line stands alone: no part of the same feature within reach', () => {
  const properties = { route: 'A', slot: 1 };
  // One feature, two parts 2 px apart (a route's two directions).
  const pair = [{ layer: 'rail', properties, route: 'A', drawnWidth: 1, opacity: 1, parts: [[[0, 100], [400, 100]], [[400, 102], [0, 102]]], drawn: [[[0, 100], [400, 100]], [[400, 102], [0, 102]]] }];
  assert.equal(lineSamples(pair, { width: 400, height: 300 }).length, 0);
  // The same two parts 40 px apart: both sampled.
  const apart = [{ ...pair[0], parts: [[[0, 100], [400, 100]], [[400, 140], [0, 140]]], drawn: [[[0, 100], [400, 100]], [[400, 140], [0, 140]]] }];
  assert.equal(lineSamples(apart, { width: 400, height: 300 }).length, 2);
  // A different feature 2 px away doesn't stop it: the hit-test tells them apart.
  const other = [...model(properties), { ...model({ route: 'B', slot: 1 })[0], route: 'B', parts: [[[0, 102], [400, 102]]], drawn: [[[0, 102], [400, 102]]] }];
  assert.equal(lineSamples(other, { width: 400, height: 300 }).filter((s) => s.route === 'A').length, 1);
});

test('a sample on an offset line sits at the segment\'s own offset, clear of its corners', () => {
  // A right turn with a 4 px offset: the sample is mid-segment on the first
  // leg, 4 px to the right (south) of the centreline.
  const line = { layer: 'rail', properties: { route: 'A' }, route: 'A', drawnWidth: 2, offset: 4, opacity: 1, parts: [[[20, 50], [220, 50], [220, 250]]] };
  line.drawn = [offsetPart(line.parts[0], 4)];
  const s = lineSamples([line], { width: 400, height: 400 });
  assert.ok(s.some((q) => Math.abs(q.x - 120) < 1e-9 && Math.abs(q.y - 54) < 1e-9), JSON.stringify(s));
  // A leg too short to be clear of its corners is not sampled.
  const short = { ...line, parts: [[[20, 50], [60, 50], [60, 250]]] };
  short.drawn = [offsetPart(short.parts[0], 4)];
  assert.ok(lineSamples([short], { width: 400, height: 400 }).every((q) => q.x > 55));
});

test('a page line wholly off the screen is not missing: its drawn width can reach onto the screen', () => {
  // A rail line 15 px above the screen, offset towards it: the page's
  // viewport query returns it, but no vertex of it is on the screen.
  const page = [{ layer: 'rail', route: 'E', parts: [[[0, -15], [390, -15]]] }];
  const r = compareLines(page, [], { width: 390, height: 664 });
  assert.equal(r.missing, 0);
  // One vertex on the screen and no model line: missing.
  const onScreen = compareLines([{ layer: 'rail', route: 'E', parts: [[[0, -15], [390, 10]]] }], [], { width: 390, height: 664 });
  assert.equal(onScreen.missing, 1);
});
