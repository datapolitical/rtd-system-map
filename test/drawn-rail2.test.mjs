// The second batch of rail-line detectors (qa/drawn/rail2lines.mjs): for each
// rule one case that must be reported and one that must not, on made-up
// geometry in screen px at zoom 17 near the equator (about 0.6 m to a px). No
// browser, no data, no build. A rail line is drawn 9 px wide and each slot is
// 11 px to the side (a width and a 2 px gap), as the page draws it at zoom 16
// and above.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineFaults2 } from '../qa/drawn/rail2lines.mjs';
import { offsetParts } from '../qa/drawn/strokes.mjs';
import { toLonLat } from '../qa/drawn/mercator.mjs';

const Z = 17;
const O = 2 ** 25;
const P = (x, y) => [O + x, O + y];
const PITCH = 11;
let next = 0;

// One piece of a rail line: a polyline drawn `offset` px to its right.
const piece = (route, pts, offset = 0, { width = 9, slot = offset / PITCH } = {}) => ({
  layer: 'rail', route, source: 'routes', index: next++, mode: 'rail', slot, offset, width, drawnWidth: width, cap: 'round', opacity: 1,
  properties: { route, mode: 'rail' }, parts: [pts], drawn: offset ? offsetParts([pts], offset, Z) : [pts],
});
const run = (route, x0, x1, offset, opts = {}) => piece(route, [P(x0, opts.dy ?? 0), P(x1, opts.dy ?? 0)], offset, opts);
const mark = (x0, x1, y = 0) => ({
  kind: 'icon', layer: 'stations', source: 'stations', index: next++, image: 'station-3', properties: { id: 1, lines: 'E R T C' }, at: P((x0 + x1) / 2, y),
  size: 1, boxSize: 1, w: x1 - x0 + 2, h: 22, rot: 90, anchor: 'center', offset: [0, 0], opacity: 1, box: [O + x0, O + y - 12, O + x1, O + y + 12],
});
const zoom = (lines, marks = []) => ({ z: Z, lines, marks, areas: [] });
const of = (z, kind, data) => lineFaults2(z, { kinds: [kind], data });
const lonlat = (x, y) => toLonLat(P(x, y), Z);

test('every finding has the shape the other detectors use', () => {
  const f = of(zoom([run('E', 0, 600, 0), run('R', 0, 600, 0)]), 'overlap')[0];
  assert.ok(f);
  assert.equal(f.layer, 'rail');
  assert.equal(typeof f.route, 'string');
  assert.equal(f.px.length, 2);
  assert.equal(typeof f.msg, 'string');
});

// RL01, LN-10
test('stop-off-line: a platform stop 50 m from the drawn line is reported, one 5 m away is not', () => {
  const stop = (x, y) => ({ type: 'Feature', properties: { platform: 1, lines: 'E', name: 'Test Station' }, geometry: { type: 'Point', coordinates: lonlat(x, y) } });
  const z = zoom([run('E', 0, 600, 0)]);
  const far = of(z, 'stop-off-line', { stops: { features: [stop(300, 84)] } });
  assert.equal(far.length, 1);
  assert.match(far[0].msg, /5\d m from the nearest drawn line of E/);
  assert.deepEqual(of(z, 'stop-off-line', { stops: { features: [stop(300, 8)] } }), []);
  // A bus stop is not a rail platform stop.
  assert.deepEqual(of(z, 'stop-off-line', { stops: { features: [{ ...stop(300, 84), properties: { lines: 'E' } }] } }), []);
});

// RL05
test('spike: a path that turns back on itself is reported, an ordinary bend is not', () => {
  const spiked = zoom([piece('E', [P(0, 0), P(100, 0), P(20, 5)])]);
  const found = of(spiked, 'spike');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /turns back 1[67]\d degrees/);
  assert.deepEqual(of(zoom([piece('E', [P(0, 0), P(100, 0), P(180, 30)])]), 'spike'), []);
});

// RL06
test('end-hook: a free end whose last stretch bends away is reported, a straight end is not', () => {
  const hooked = zoom([piece('E', [P(0, 0), P(150, 0), P(165, 0), P(175, 10), P(180, 22)])]);
  const found = of(hooked, 'end-hook');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /ends bent/);
  assert.deepEqual(of(zoom([piece('E', [P(0, 0), P(150, 0), P(300, 0)])]), 'end-hook'), []);
  // A gentle curve into the end is a curve.
  assert.deepEqual(of(zoom([piece('E', [P(0, 0), P(150, 0), P(170, 3), P(190, 8)])]), 'end-hook'), []);
});

// RL08
test('join-step: pieces meeting with their slots 3 px apart are reported; 0.3 px, or under a mark, are not', () => {
  const join = (d, marks = []) => zoom([piece('E', [P(0, 0), P(300, 0)], 0, { slot: 0.0001 }), piece('E', [P(300, 0), P(600, 0)], d, { slot: d / PITCH || 0.0001 }), run('R', 0, 600, PITCH)], marks);
  const found = of(join(3), 'join-step');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /3\.00 px apart/);
  assert.deepEqual(of(join(0.3), 'join-step'), []);
  assert.deepEqual(of(join(3, [mark(280, 320)]), 'join-step'), []);
});

// ST01, PL-01, PL-15
test('overlap: two lines on the same path are reported, two a slot apart are not', () => {
  const found = of(zoom([run('E', 0, 600, 0), run('R', 0, 600, 0)]), 'overlap');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /overlap by 9\.0 px/);
  assert.deepEqual(of(zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH)]), 'overlap'), []);
});

test('overlap: lines on two tracks that run so close they cover each other are reported with the distance', () => {
  // 6 px apart (3.6 m): two tracks, not one pack, and 9 px lines.
  const found = of(zoom([run('E', 0, 600, 0), run('R', 0, 600, 0, { dy: 6 })]), 'overlap');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /two tracks/);
});

// PL-02
test('gaps-unequal: a line with 2.9 px of land on one side and 2 on the other is reported, 2.2 and 2 is not', () => {
  const pack = (dy) => zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH), run('T', 0, 600, -PITCH, { slot: -1, dy })]);
  const found = of(pack(-0.9), 'gaps-unequal');
  assert.ok(found.length >= 1);
  assert.match(found[0].msg, /placement/);
  assert.deepEqual(of(pack(-0.2), 'gaps-unequal'), []);
  // Unequal only because one line is thinner: the lines are placed right.
  const thin = zoom([run('E', 0, 600, 0, { width: 6 }), run('R', 0, 600, PITCH), run('T', 0, 600, -PITCH, { slot: -1 })]);
  assert.deepEqual(of(thin, 'gaps-unequal'), []);
});

// PL-12
test('bundle-off-centre: a pair at slots 0 and 1 is half a pitch off its track, a pair at -0.5 and 0.5 is not', () => {
  const found = of(zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH)]), 'bundle-off-centre');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /5\.5 px/);
  assert.deepEqual(of(zoom([run('E', 0, 600, -PITCH / 2), run('R', 0, 600, PITCH / 2)]), 'bundle-off-centre'), []);
});

// PL-17
test('bead: a pack that changes and changes back within its own width is reported, a longer change is not', () => {
  const beaded = (gap) => zoom([run('E', 0, 700, 0), run('R', 0, 300, PITCH), run('R', 300 + gap, 700, PITCH)]);
  const found = of(beaded(15), 'bead');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /bead on rail/);
  assert.deepEqual(of(beaded(120), 'bead'), []);
});

// PL-09, PL-18, PL-07
test('separated: a line that joins between two that ran side by side is reported; one that joins outside is not', () => {
  const lines = (offset, marks = []) => zoom([run('E', 0, 800, 0), run('R', 0, 800, 2 * PITCH), run('T', 400, 800, offset)], marks);
  const found = of(lines(PITCH), 'separated');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /T comes between/);
  assert.deepEqual(of(lines(-PITCH), 'separated'), []);
  // Under a station mark the same change is a hidden separation (PL-07).
  const hidden = of(lines(PITCH, [mark(380, 420)]), 'hidden-separation');
  assert.equal(hidden.length, 1);
  assert.deepEqual(of(lines(PITCH, [mark(380, 420)]), 'separated'), []);
});

// LE-02
test('end-inside: a line that ends between two that run on is reported; one that ends on the outside is not', () => {
  const lines = (offset) => zoom([run('E', 0, 800, -PITCH), run('R', 0, 800, PITCH), run('T', 0, 400, offset)]);
  const found = of(lines(0), 'end-inside');
  assert.equal(found.length, 1);
  assert.equal(found[0].route, 'T');
  assert.match(found[0].msg, /between E on one side and R on the other/);
  assert.deepEqual(of(zoom([run('E', 0, 800, 0), run('R', 0, 800, PITCH), run('T', 0, 400, -PITCH)]), 'end-inside'), []);
  // All three ending together: nothing runs on.
  assert.deepEqual(of(zoom([run('E', 0, 400, -PITCH), run('R', 0, 400, PITCH), run('T', 0, 400, 0)]), 'end-inside'), []);
});

// PL-06, PL-07, PL-08
test('crossing: two lines that run together and change sides are reported; parallel lines are not', () => {
  const x = zoom([piece('E', [P(0, 0), P(600, 0)]), piece('R', [P(0, 10), P(600, -10)])]);
  const found = of(x, 'crossing');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /cross at 2 degrees/);
  assert.deepEqual(of(zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH)]), 'crossing'), []);
  // Under a station mark it is a crossing the rider cannot follow.
  const under = lineFaults2(zoom([piece('E', [P(0, 0), P(600, 0)]), piece('R', [P(0, 10), P(600, -10)])], [mark(280, 320)]), { kinds: ['crossing', 'crossing-in-mark'] });
  assert.deepEqual(under.map((f) => f.kind), ['crossing-in-mark']);
  // Two tracks crossing at a large angle are a junction, not a swap.
  assert.deepEqual(of(zoom([piece('E', [P(0, 0), P(600, 0)]), piece('R', [P(300, -100), P(300, 100)])]), 'crossing'), []);
});

// ST03
test('gap-by-zoom: slots 12 px apart for 9 px lines are reported, 11 are not', () => {
  const pack = (pitch) => zoom([run('E', 0, 600, 0), run('R', 0, 600, pitch, { slot: 1 })]);
  const found = of(pack(12), 'gap-by-zoom');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /3\.00 px between them/);
  assert.deepEqual(of(pack(11), 'gap-by-zoom'), []);
});

// LN-08
test('width-classes: rail drawn 6 and 6.8 px is reported, 6 and 9 is not', () => {
  const found = of(zoom([run('B', 0, 600, 0, { width: 6 }), run('N', 0, 600, 40, { width: 6.8 })]), 'width-classes');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /0\.80 px apart/);
  assert.deepEqual(of(zoom([run('B', 0, 600, 0, { width: 6 }), run('A', 0, 600, 40, { width: 9 })]), 'width-classes'), []);
});

// JN-02
test('narrow-branch: two lines that part at 8 degrees are reported, at 30 they are not', () => {
  // R on the same path as E would overlap; give it a slot so the pack is drawn apart.
  const lines = (deg) => {
    const t = Math.tan((deg * Math.PI) / 180);
    return zoom([
      piece('E', [P(0, 0), P(1000, 0)], 0, { slot: 0.0001 }),
      piece('R', [P(0, 0), P(300, 0), P(1000, 700 * t)], PITCH, { slot: 1 }),
    ]);
  };
  const found = of(lines(8), 'narrow-branch');
  assert.ok(found.length >= 1);
  assert.match(found[0].msg, /part at [78]\.\d degrees/);
  assert.deepEqual(of(lines(30), 'narrow-branch'), []);
});

// JN-04
test('near-touch: strokes that pass 0.5 px apart at 45 degrees are reported, 5 px apart or touching are not', () => {
  const pass = (gapY) => zoom([piece('E', [P(0, 0), P(600, 0)]), piece('R', [P(260, -49.5 - gapY), P(300, -9.5 - gapY)])]);
  const found = of(pass(0), 'near-touch');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /0\.50 px apart/);
  assert.deepEqual(of(pass(4.5), 'near-touch'), []);
  assert.deepEqual(of(pass(-9.4), 'near-touch'), []);
});

// PL-14
test('corner-pinch: an inner line folded by a bend tighter than its offset is reported, an open bend is not', () => {
  // A tight right-angle turn made of short segments, with the line 22 px to the inside.
  const tight = zoom([piece('E', [P(0, 0), P(100, 0), P(104, 3), P(106, 8), P(106, 200)], 22, { slot: 2 })]);
  const found = of(tight, 'corner-pinch');
  assert.ok(found.length >= 1, 'a fold in the inner line is reported');
  assert.match(found[0].msg, /folds on itself/);
  const open = zoom([piece('E', [P(0, 0), P(100, 0), P(180, 20), P(250, 60), P(300, 120), P(320, 200), P(320, 400)], 22, { slot: 2 })]);
  assert.deepEqual(of(open, 'corner-pinch'), []);
});
