import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CIRCLE, LAP_MIN, cutLaps, generalize, mergeCarriageways, stitch } from '../scripts/lib/generalize.mjs';

// Made-up routes near (0, 0), in meters (generalize works in a projection
// in meters; these helpers stand in for it). A meter is 1/111320 of a degree.
const M = 1 / 111320;
const lonlat = (pts) => pts.map(([x, y]) => [x * M, y * M]);
const meters = (pts) => pts.map(([x, y]) => [x / M, y / M]);
const feature = (route, path) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: lonlat(path) }, properties: { route, mode: 'bus', bph: 4 } });
const line = (from, to, step = 10) => {
  const n = Math.max(1, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / step));
  return Array.from({ length: n + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);
};
const path = (...corners) => corners.slice(1).flatMap((c, i) => line(corners[i], c).slice(i ? 1 : 0));
const circle = (cx, cy, r, from = -Math.PI / 2) => Array.from({ length: 37 }, (_, i) => [cx + r * Math.cos(from + (i * 2 * Math.PI) / 36), cy + r * Math.sin(from + (i * 2 * Math.PI) / 36)]);
const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const partsOf = (f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates).map(meters);
const maxY = (parts) => Math.max(...parts.flat().map((p) => p[1]));
const minY = (parts) => Math.min(...parts.flat().map((p) => p[1]));

test('a ramp circle becomes the point where the bus turns', () => {
  // East along a road, once round a 50 m circle above it, and on east.
  const ramp = [...line([-500, 0], [0, 0]), ...circle(0, 50, 50).slice(1), ...line([0, 0], [500, 0]).slice(1)];
  const report = [];
  const [out] = generalize([feature('R', ramp)], { precision: 7, report });
  const parts = partsOf(out);
  assert.equal(report.length, 1);
  assert.equal(report[0].kind, 'turn');
  assert.ok(maxY(parts) < 5, `the circle is gone (reaches ${maxY(parts).toFixed(1)} m)`);
  assert.ok(Math.abs(len(parts.flat()) - 1000) < 20, 'the road either side is all still drawn');
  assert.equal(out.properties.bph, 4, 'frequency is untouched');
});

test('a terminal loop becomes a short end to the place it serves', () => {
  // North 600 m, once round a 300 m block, and back down.
  const loop = path([0, 0], [0, 600], [-150, 600], [-150, 900], [150, 900], [150, 600], [0, 600], [0, 0]);
  // ...with the line running on (the way back), so the loop is mid-line.
  const report = [];
  const [out] = generalize([feature('T', loop)], { precision: 7, report });
  const parts = partsOf(out);
  assert.ok(report.some((r) => r.kind === 'end'), 'reported as a short end');
  // The block's far corners are not both drawn: it is not a lap any more.
  const farLeft = parts.flat().some(([x, y]) => x < -140 && y > 890);
  const farRight = parts.flat().some(([x, y]) => x > 140 && y > 890);
  assert.ok(!(farLeft && farRight), 'not drawn round the block');
  // It still reaches up to the block it serves.
  assert.ok(maxY(parts) > 850, `still reaches the block (${maxY(parts).toFixed(0)} m)`);
});

test('a short end goes to the station the loop serves', () => {
  const loop = path([0, 0], [0, 600], [-150, 600], [-150, 900], [150, 900], [150, 600], [0, 600], [0, 0]);
  const station = lonlat([[160, 620]])[0];
  const [out] = generalize([feature('T', loop)], { precision: 7, places: [station] });
  const ends = partsOf(out).flat();
  const nearest = Math.min(...ends.map(([x, y]) => Math.hypot(x - 160, y - 620)));
  assert.ok(nearest < 30, `ends by the station (${nearest.toFixed(0)} m away)`);
  assert.ok(maxY([ends]) < 700, 'not up round the far side of the block');
});

test('both carriageways of a divided road are drawn as one line', () => {
  // Out along one carriageway, back along the other 30 m away.
  const [a, b] = [line([0, 0], [800, 0]), line([800, 30], [0, 30])];
  const [fa, fb] = generalize([feature('D', a), feature('D', b)], { precision: 7 });
  const ys = [...partsOf(fa), ...partsOf(fb)].flat().map(([, y]) => y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 3, `one line (spread ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)} m)`);
  assert.ok(Math.abs(ys[0] - 15) < 3, 'on the middle line');
});

test('a one-way pair a block apart stays two streets', () => {
  const [a, b] = [line([0, 0], [800, 0]), line([800, 110], [0, 110])];
  const [fa, fb] = generalize([feature('P', a), feature('P', b)], { precision: 7 });
  assert.ok(maxY(partsOf(fa)) < 2 && minY(partsOf(fb)) > 108);
});

test('a thin loop round a one-way pair is kept, not cut short', () => {
  // Up one street and down the next, 100 m apart, 700 m long: a couplet.
  const couplet = path([0, 0], [0, 700], [100, 700], [100, 0], [10, 0]);
  const report = [];
  generalize([feature('C', couplet)], { precision: 7, report });
  assert.equal(report.length, 0);
});

test('cutLaps leaves a plain line alone, and a line back the way it came', () => {
  const plain = line([0, 0], [1000, 0]);
  assert.deepEqual(cutLaps(plain), [plain]);
  // Out 300 m and back: the end of the line, not a spur.
  const outBack = [...line([0, 0], [300, 0]), ...line([300, 0], [0, 4]).slice(1)];
  assert.equal(cutLaps(outBack).length, 1);
  assert.equal(cutLaps(outBack)[0].length, outBack.length);
});

test('a spur off a line that goes on is cut, at any size up to a turn', () => {
  // East, a 40 m spike up and back, then on north-east.
  const spur = [...line([-300, 0], [0, 0]), ...line([0, 0], [0, 40]).slice(1), ...line([0, 40], [3, 0]).slice(1), ...line([3, 0], [200, 200]).slice(1)];
  const [kept] = cutLaps(spur);
  assert.ok(maxY([kept.filter(([x]) => Math.abs(x) < 10)]) < 15, 'spike gone');
  assert.ok(LAP_MIN < 2 * 40 && CIRCLE > 40);
});

test('stitch joins pieces that meet end to end, so a lap in pieces is seen whole', () => {
  const a = line([0, 0], [100, 0]);
  const b = line([100, 0], [100, 100]);
  const c = line([100, 100], [0, 0]);
  assert.equal(stitch([a, b, c]).length, 1);
  assert.equal(stitch([a, line([300, 0], [400, 0])]).length, 2);
});

test('mergeCarriageways leaves a lone line where it is', () => {
  const parts = [{ points: line([0, 0], [500, 0]) }];
  const before = parts[0].points.map((p) => [...p]);
  mergeCarriageways(parts);
  assert.deepEqual(parts[0].points, before);
});
