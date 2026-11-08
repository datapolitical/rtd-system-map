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

test('a loop round a terminal hall is the way in, so it is cut even when the street is its own', () => {
  // A circuit round a block, kept: a rider can read it.
  const block = [[0, 0], [0, 600], [-300, 600], [-300, 900], [300, 900], [300, 600], [0, 600], [0, 0]];
  assert.equal(cutLaps(block).length, 1);
  // The station hall fills the block: the bus goes round it to get in, and
  // only the way in is drawn.
  const hall = [[-320, 580], [320, 580], [320, 920], [-320, 920]];
  const note = [];
  const parts = cutLaps(block, Infinity, [], (...a) => note.push(a[0]), [hall]);
  assert.deepEqual(note, ['end']);
  assert.equal(parts.length, 2);
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

// How far a line's points are from the drawn parts, at worst over any run of
// `run` meters: the length of the longest stretch left undrawn.
const undrawn = (raw, parts, near = 15) => {
  const segDist = (p, a, b) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  let [worst, run] = [0, 0];
  for (let i = 0; i < raw.length; i++) {
    const far = parts.every((q) => q.slice(1).every((b, k) => segDist(raw[i], q[k], b) > near));
    run = far && i ? run + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]) : 0;
    worst = Math.max(worst, run);
  }
  return worst;
};
const allParts = (out) => out.flatMap(partsOf);
// One route drawn in pieces, as RTD's layer has it: one feature, many parts.
const pieced = (route, pieces) => ({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: pieces.map(lonlat) }, properties: { route, mode: 'bus', bph: 4 } });

test('route 16 on Colfax by Knox: both ways of a two-way street, then a turn, lose no road', () => {
  // RTD's 16 at Colfax and Knox, in meters (2026-11 shapes): east along
  // Colfax to Knox, round the corner and back west along Colfax's other side
  // to where the pieces meet, and from Knox south. Round two cut 135 m of
  // Colfax here, eating the out-and-back's tip a lap at a time.
  const pieces = [
    path([-400, 2], [-79, 2], [39, 6]),
    path([39, 6], [47, 1], [223, -1]),
    path([223, -1], [226, -94], [228, -119], [230, -400]),
    path([223, -1], [223, 11], [46, 9], [39, 6]),
  ];
  const out = generalize([pieced('16', pieces)], { precision: 7 });
  const drawn = allParts(out);
  for (const raw of pieces) assert.ok(undrawn(path(...raw), drawn) <= 20, `no stretch of the 16 left undrawn (${undrawn(path(...raw), drawn).toFixed(0)} m)`);
});

test('route 17 on Colorado Mills Parkway: where the carriageways meet, no road lost and no lens', () => {
  // RTD's 17 where a divided road's median ends, in meters (2026-11
  // shapes): two carriageways from the west meet at (16, -3) and run on
  // east as one. Round two cut 170 m here.
  const pieces = [
    path([16, -3], [300, 45], [600, 95]),
    path([16, -3], [3, 1], [-146, -22], [-224, -39], [-282, -59]),
    path([-285, -83], [-256, -69], [-213, -54], [-144, -39], [6, -12], [16, -3]),
  ];
  const out = generalize([pieced('17', pieces)], { precision: 7 });
  const drawn = allParts(out);
  for (const raw of pieces) assert.ok(undrawn(raw, drawn, 20) <= 20, `no stretch of the 17 left undrawn (${undrawn(raw, drawn, 20).toFixed(0)} m)`);
  // One line where it is one road: across it, near the tip, the drawn
  // carriageways lie on one another (no lens).
  for (const x of [-100, -40, 0]) {
    const ys = drawn.flatMap((q) => q.slice(1).flatMap((b, k) => ((q[k][0] - x) * (b[0] - x) <= 0 && q[k][0] !== b[0] ? [q[k][1] + ((x - q[k][0]) * (b[1] - q[k][1])) / (b[0] - q[k][0])] : [])));
    assert.ok(ys.length && Math.max(...ys) - Math.min(...ys) < 6, `one line at x = ${x} (${ys.map((y) => y.toFixed(1))})`);
  }
});

test('ramps that cross at a shallow angle stay two roads', () => {
  // One route's two ramps making an X at 20 degrees: within 60 m of each
  // other for 300 m, but on one side, then the other.
  const a = line([-500, -90], [500, 90]);
  const b = line([-500, 90], [500, -90]);
  const out = generalize([feature('X', a), feature('X', b)], { precision: 7 });
  const [pa, pb] = out.map(partsOf);
  // Each keeps its own line: far ends unmoved, and they still cross.
  assert.ok(Math.abs(pa[0][0][1] + 90) < 2 && Math.abs(pb[0][0][1] - 90) < 2);
  assert.ok(Math.abs(maxY(pa) - 90) < 2 && Math.abs(minY(pb) + 90) < 2);
});
