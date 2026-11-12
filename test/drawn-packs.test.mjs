// The pack detectors on the drawn model (qa/drawn/packs.mjs): made-up rail
// lines, one case each that must be reported and one that must not. No
// browser, no data, no build.
//
// The numbers are screen px at zoom 17 near the equator, where the ground
// scale is about 0.6 m to a pixel. A rail line is drawn 9 px wide and each
// slot is 11 px to the side (a width and a 2 px gap), as the page draws it at
// zoom 16 and above.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PACK_LIMITS, packFaults, railChains } from '../qa/drawn/packs.mjs';
import { offsetParts } from '../qa/drawn/strokes.mjs';

const Z = 17;
const O = 2 ** 25; // the middle of the world at zoom 17 (512 tiles)
const P = (x, y) => [O + x, O + y];
const PITCH = 11;

// One piece of a rail line: a polyline drawn `offset` px to the right.
const piece = (route, pts, offset = 0, { width = 9, slot = offset / PITCH } = {}) => ({
  layer: 'rail', route, source: 'routes', mode: 'rail', slot, offset, width, drawnWidth: width, cap: 'round',
  parts: [pts], drawn: offset ? offsetParts([pts], offset, Z) : [pts],
});
// A straight run along x.
const run = (route, x0, x1, offset, opts = {}) => piece(route, [P(x0, opts.dy ?? 0), P(x1, opts.dy ?? 0)], offset, opts);
// A move from one offset to another over x0..x1, in pieces of 1/32 slot.
const ease = (route, x0, x1, from, to, opts) => {
  const n = Math.max(1, Math.round(Math.abs(to - from) / (PITCH / 32)));
  return Array.from({ length: n }, (_, k) => run(route, x0 + ((x1 - x0) * k) / n, x0 + ((x1 - x0) * (k + 1)) / n, from + ((to - from) * (k + 0.5)) / n, opts));
};
const zoom = (lines, marks = []) => ({ z: Z, lines, marks });
const kinds = (z, kind) => packFaults(z).filter((f) => f.kind === kind);
const mark = (x0, x1) => ({ kind: 'icon', image: 'station-3', box: [O + x0, O - 20, O + x1, O + 20], properties: { lines: 'E R T' } });

test('the faults have the shape the other detectors use', () => {
  const uneven = zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH), run('T', 0, 600, -PITCH, { slot: -1, dy: -0.9 })]);
  const f = kinds(uneven, 'uneven-gap')[0];
  assert.ok(f);
  assert.equal(f.layer, 'rail');
  assert.equal(typeof f.route, 'string');
  assert.equal(f.px.length, 2);
  assert.equal(typeof f.msg, 'string');
});

test('a pack on one path has no fault', () => {
  const pack = zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH), run('T', 0, 600, -PITCH, { slot: -1 })]);
  assert.deepEqual(packFaults(pack), []);
});

// ST02 / PL-02
test('uneven-gap: one gap of a pack wider than the slots say is reported', () => {
  // T is 0.9 px (half a metre) further from E than R is.
  const uneven = zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH), run('T', 0, 600, -PITCH, { slot: -1, dy: -0.9 })]);
  const found = kinds(uneven, 'uneven-gap');
  assert.ok(found.length >= 1);
  assert.match(found[0].msg, /0\.9\d px wider/);
  assert.equal(found[0].with === 'E' || found[0].with === 'T', true);
});

test('uneven-gap: a gap a third of a pixel off is not reported', () => {
  const near = zoom([run('E', 0, 600, 0), run('R', 0, 600, PITCH), run('T', 0, 600, -PITCH, { slot: -1, dy: -0.3 })]);
  assert.deepEqual(kinds(near, 'uneven-gap'), []);
});

test('uneven-gap: not while a line of the pair is moving, nor over a stretch too short to see', () => {
  // T is 0.9 px off but its slot steps every 40 px, so no place of it holds still.
  const stepping = [];
  for (let x = 0; x < 600; x += 40) stepping.push(run('T', x, x + 40, -PITCH + (x / 40 % 2) * 0.34, { slot: -1, dy: -0.9 }));
  assert.deepEqual(kinds(zoom([run('E', 0, 600, 0), ...stepping]), 'uneven-gap'), []);
  assert.deepEqual(kinds(zoom([run('E', 0, 30, 0), run('T', 0, 30, -PITCH, { slot: -1, dy: -0.9 })]), 'uneven-gap'), []);
});

// RL10 / PL-11
test('drift: lines that run on slide sideways after another ends, away from its mark', () => {
  // T ends at x=500. E and R, beside it to the north of that, move half a slot
  // over x=300..420, before it, where no mark is.
  const lines = [
    run('E', 0, 300, -PITCH / 2), ...ease('E', 300, 420, -PITCH / 2, 0), run('E', 420, 1100, 0),
    run('R', 0, 300, PITCH / 2), ...ease('R', 300, 420, PITCH / 2, PITCH), run('R', 420, 1100, PITCH),
    run('T', 500, 1100, -PITCH, { slot: -1 }),
  ];
  const found = kinds(zoom(lines), 'drift');
  assert.deepEqual(found.map((f) => f.route).sort(), ['E', 'R']);
  assert.match(found[0].msg, /5\.5 px sideways/);
});

test('drift: the same move under the end\'s mark, or with no line ending near it, is not a drift', () => {
  // The move is one step at the end of T, under its station mark.
  const hidden = zoom([
    run('E', 0, 500, -PITCH / 2), run('E', 500, 1100, 0),
    run('R', 0, 500, PITCH / 2), run('R', 500, 1100, PITCH),
    run('T', 500, 1100, -PITCH, { slot: -1 }),
  ], [mark(480, 520)]);
  assert.deepEqual(kinds(hidden, 'drift'), []);
  // Without the mark the step is a drift of 5.5 px at the end of T.
  assert.deepEqual(kinds({ ...hidden, marks: [] }, 'drift').map((f) => f.route).sort(), ['E', 'R']);
  // A move far from any end (T runs the whole length) is the parting of a
  // line, judged by steep-ease.
  const parting = zoom([
    run('E', 0, 600, -PITCH / 2), ...ease('E', 600, 900, -PITCH / 2, 0), run('E', 900, 2400, 0),
    run('T', 0, 2400, -PITCH, { slot: -1 }),
  ]);
  assert.deepEqual(kinds(parting, 'drift'), []);
});

// RL09 / JN-01
test('steep-ease: a whole slot in ten px along the track is reported, in a hundred it is not', () => {
  const steep = zoom([run('C', 0, 300, PITCH), ...ease('C', 300, 310, PITCH, 0), run('C', 310, 600, 0)]);
  const found = kinds(steep, 'steep-ease');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /per px/);
  const gentle = zoom([run('C', 0, 300, PITCH), ...ease('C', 300, 400, PITCH, 0), run('C', 400, 700, 0)]);
  assert.deepEqual(kinds(gentle, 'steep-ease'), []);
});

test('steep-ease: a step under a station mark is hidden by it', () => {
  const step = (marks) => zoom([run('E', 0, 500, -PITCH / 2), run('E', 500, 1000, 0)], marks);
  assert.equal(kinds(step([]), 'steep-ease').length, 1);
  assert.deepEqual(kinds(step([mark(480, 520)]), 'steep-ease'), []);
});

// ST04 / PL-05
test('swap: two lines on one track that change sides are reported, two that keep sides are not', () => {
  const swapped = zoom([
    run('E', 0, 800, -PITCH / 2), ...ease('E', 800, 900, -PITCH / 2, PITCH / 2), run('E', 900, 1700, PITCH / 2),
    run('R', 0, 800, PITCH / 2), ...ease('R', 800, 900, PITCH / 2, -PITCH / 2), run('R', 900, 1700, -PITCH / 2),
  ]);
  const found = kinds(swapped, 'swap');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /other side/);
  const steady = zoom([run('E', 0, 1700, -PITCH / 2), run('R', 0, 1700, PITCH / 2)]);
  assert.deepEqual(kinds(steady, 'swap'), []);
});

test('swap: lines that cross at a junction and part are not a swap', () => {
  // R leaves E to the other side and is soon far from it (a different track).
  const lines = [run('E', 0, 1700, 0), piece('R', [P(0, 12), P(700, 12), P(1000, -60), P(1700, -60)], 0)];
  assert.deepEqual(kinds(zoom(lines), 'swap'), []);
});

// PL-03
test('sliver: strokes 0.6 px apart are reported, strokes 2 px apart, touching or merged are not', () => {
  const pair = (gap) => zoom([run('E', 0, 200, 0), run('R', 0, 200, 9 + gap, { slot: 1 })]);
  const found = kinds(pair(0.6), 'sliver');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /0\.60 px/);
  for (const gap of [2, 1.2, 0, -3]) assert.deepEqual(kinds(pair(gap), 'sliver'), [], `gap ${gap}`);
});

// LN-04
test('zig-zag: a line that turns back and forth every few px is reported, a gentle S is not', () => {
  const wobble = Array.from({ length: 9 }, (_, i) => P(i * 8, i % 2 ? 6 : 0));
  const found = kinds(zoom([piece('E', [P(-100, 0), ...wobble, P(200, 0)], 0)]), 'zig-zag');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /px across/);
  // The same alternation 2 px deep is not seen.
  const shallow = Array.from({ length: 9 }, (_, i) => P(i * 8, i % 2 ? 2 : 0));
  assert.deepEqual(kinds(zoom([piece('E', [P(-100, 0), ...shallow, P(200, 0)], 0)]), 'zig-zag'), []);
  // An S bend turns two ways, once.
  const s = [P(0, 0), P(200, 0), P(300, 30), P(400, 60), P(600, 60)];
  assert.deepEqual(kinds(zoom([piece('E', s, 0)]), 'zig-zag'), []);
});

// LN-06
test('sharp-bend: one corner of 30 degrees on a straight line is reported, a curve of the same turn is not', () => {
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const corner = [P(0, 0), P(300, 0), P(300 + 300 * c, 300 * s)];
  const found = kinds(zoom([piece('E', corner, 0)]), 'sharp-bend');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /30 degrees/);
  // Six vertices of 5 degrees each, 40 px apart.
  const curve = [P(0, 0)];
  let [x, y, a] = [0, 0, 0];
  for (let i = 0; i < 12; i++) { x += 40 * Math.cos(a); y += 40 * Math.sin(a); curve.push(P(x, y)); if (i >= 2 && i < 8) a += (5 * Math.PI) / 180; }
  assert.deepEqual(kinds(zoom([piece('E', curve, 0)]), 'sharp-bend'), []);
  // Two corners of 30 degrees two line widths apart are a curve, not a corner.
  const b = [300 + 18 * c, 18 * s];
  const short = [P(0, 0), P(300, 0), P(b[0], b[1]), P(b[0] + 300 * Math.cos(Math.PI / 3), b[1] + 300 * Math.sin(Math.PI / 3))];
  assert.deepEqual(kinds(zoom([piece('E', short, 0)]), 'sharp-bend'), []);
});

test('a line is followed through its pieces, whichever way a piece was drawn', () => {
  const lines = [run('E', 0, 100, -5), piece('E', [P(200, 0), P(100, 0)], 5), run('E', 200, 300, 0)];
  const chains = railChains(zoom(lines));
  assert.equal(chains.length, 1);
  assert.equal(chains[0].pieces.length, 3);
  // The middle piece runs the other way, so its offset to the right is to the
  // left of the chain.
  assert.deepEqual(chains[0].pieces.map((q) => q.off), [-5, -5, 0]);
});

test('thresholds are the ones the rules name', () => {
  assert.equal(PACK_LIMITS.sliver, 1.2);
  assert.equal(PACK_LIMITS.bendMax, 10);
  assert.equal(PACK_LIMITS.bendWindow, 2);
  assert.equal(PACK_LIMITS.zigWindow, 10);
  assert.equal(PACK_LIMITS.zigChanges, 3);
});
