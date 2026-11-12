// Where rail lines end and the marks they end at (qa/drawn/ends.mjs): for each
// rule one case that must be reported and one that must not, on made-up
// geometry in screen px at zoom 17. No browser, no data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAWN, brokenLines, endFaults, freeEnds, hiddenEnds, notParallel, overlappingMarks, railPieces, squareMarks, stationMarks, unevenEnds, unmarkedEnds } from '../qa/drawn/ends.mjs';

const O = 2 ** 25; // the middle of the world at zoom 17
const P = (x, y) => [O + x, O + y];
let next = 0;

// A rail line as the model gives it: its drawn parts and the width it is drawn at.
const rail = (route, parts, { width = 6, layer = 'rail', index = next++, opacity = 1 } = {}) => ({
  layer, source: 'routes', index, route, mode: 'rail', properties: { route, mode: 'rail' }, parts, drawn: parts, width, drawnWidth: width, cap: 'round', opacity,
});
// A station mark as the model gives it: a picture `w` by `h` px at size 1, turned `rot`.
const mark = ({ id = 1, lines = 'C E W', at, w = 40, h = 12, rot = 0, opacity = 1, layer = 'stations', source = 'stations', image = 'station-3', label = 'Test Station' }) => ({
  kind: 'icon', layer, source, index: next++, properties: { id, lines, ...(source === 'stations' ? { label } : {}) }, image, at: P(...at), size: 1, boxSize: 1, w, h, rot, anchor: 'center', offset: [0, 0], opacity, box: [0, 0, 0, 0],
});
const at = (lines, marks = [], z = 17) => ({ z, lines, marks, areas: [] });
const kinds = (faults) => faults.map((f) => f.kind).sort();

// Three lines north to south, 12 px apart, ending at y = 0 at their southern end
// and at y = -400 at their other; a mark under each end.
const pack = (routes = ['C', 'E', 'W'], ends = {}) => routes.map((r, i) => rail(r, [[P((i - 1) * 12, -400 + (ends[r]?.north ?? 0)), P((i - 1) * 12, ends[r]?.south ?? 0)]]));

test('freeEnds: the two ends of a line are free; a jog to the next piece of the route is not a cut', () => {
  const one = railPieces(at([rail('C', [[P(0, -100), P(0, 0)]])]));
  assert.equal(freeEnds(one).length, 2);
  // C changes slot at a station: the next piece starts 2.7 px to the side, its stroke touching the first's.
  const jog = railPieces(at([rail('C', [[P(0, -100), P(0, 0)]], { width: 3.4 }), rail('C', [[P(2.7, 0), P(2.7, 100)]], { width: 3.4 })]));
  assert.deepEqual(freeEnds(jog).map((e) => Math.round(e.E[1] - O)).sort((a, b) => a - b), [-100, 100]);
  // 8 px to the side is two lines (its two directions), each ending where it ends.
  const apart = railPieces(at([rail('C', [[P(0, -100), P(0, 0)]], { width: 3.4 }), rail('C', [[P(8, 0), P(8, 100)]], { width: 3.4 })]));
  assert.equal(freeEnds(apart).length, 4);
});

test('SM08 reported: no mark under the end, a ghost under it, a mark of another route under it', () => {
  const lines = pack();
  const top = mark({ at: [0, -400] });
  // A mark 60 px off the ends, which a 150 m rule at this zoom would still call near.
  const faults = unmarkedEnds(at(lines, [top, mark({ id: 2, at: [0, 60] })]));
  assert.deepEqual(kinds(faults), ['end-unmarked', 'end-unmarked', 'end-unmarked']);
  assert.deepEqual(faults.map((f) => f.route).sort(), ['C', 'E', 'W']);
  assert.match(faults[0].msg, /px outside the nearest mark of its route/);

  // The right mark, drawn at 0.3: a ghost is not a mark.
  const ghost = unmarkedEnds(at(lines, [top, mark({ at: [0, 0], opacity: 0.3 })]));
  assert.deepEqual(kinds(ghost), ['end-unmarked', 'end-unmarked', 'end-unmarked']);
  assert.match(ghost[0].msg, /ghost/);

  // A mark under the ends that serves other routes only.
  const other = unmarkedEnds(at(lines, [top, mark({ lines: 'A B', at: [0, 0] })]));
  assert.equal(other.length, 3);
});

test('SM08 not reported: a mark of the route under every end, at half its opacity or more', () => {
  const lines = pack();
  const marks = [mark({ at: [0, -400] }), mark({ at: [0, 0] })];
  assert.deepEqual(unmarkedEnds(at(lines, marks)), []);
  // Opacity DRAWN (0.5) counts as drawn; just under does not.
  assert.deepEqual(unmarkedEnds(at(lines, [marks[0], mark({ at: [0, 0], opacity: DRAWN })])), []);
  assert.equal(unmarkedEnds(at(lines, [marks[0], mark({ at: [0, 0], opacity: DRAWN - 0.01 })])).length, 3);
});

test('SM08 is measured against the drawn box in px, end by end', () => {
  // A 40 x 12 mark turned across the lines; the E end is 25 px along its length, 7 px past its end (20).
  const lines = [rail('C', [[P(0, -400), P(0, 0)]]), rail('E', [[P(25, -400), P(25, 0)]])];
  const top = [mark({ lines: 'C', at: [0, -400] }), mark({ lines: 'E', at: [25, -400] })];
  const faults = unmarkedEnds(at(lines, [...top, mark({ lines: 'C E', at: [0, 0] })]));
  assert.deepEqual(faults.map((f) => f.route), ['E']);
  assert.match(faults[0].msg, /5\.0 px outside/);
  // 0.3 px past the end is still at it; 0.8 px is not.
  const close = (x) => at([rail('C', [[P(x, -400), P(x, 0)]])], [mark({ lines: 'C', at: [0, -400], w: 50 }), mark({ lines: 'C', at: [0, 0] })]);
  assert.deepEqual(unmarkedEnds(close(20.3)), []);
  assert.equal(unmarkedEnds(close(20.8)).length, 1);
  // A box turned 90 degrees: the same end is now 25 px along a mark whose length runs down the screen.
  const turned = unmarkedEnds(at([rail('C', [[P(0, -400), P(0, 25)]])], [mark({ lines: 'C', at: [0, -400] }), mark({ lines: 'C', at: [0, 0], rot: 90 })]));
  assert.equal(turned.length, 1);
});

test('PG02 reported: the marks of a station are turned 14 degrees apart; not reported: parallel, half a turn, round, ghost', () => {
  const own = mark({ id: 89, lines: 'A B C E G N W', at: [0, 0], rot: 45, w: 52 });
  const group = (rot, extra = {}) => mark({ id: 89, lines: 'C E W', at: [-200, 150], rot, layer: 'platform', source: 'platforms', ...extra });
  const bad = notParallel(at([], [own, group(31)]));
  assert.deepEqual(kinds(bad), ['marks-not-parallel']);
  assert.match(bad[0].msg, /14 degrees apart/);
  assert.match(bad[0].msg, /Test Station \(platform group\)/);

  assert.deepEqual(notParallel(at([], [own, group(45)])), []);
  assert.deepEqual(notParallel(at([], [own, group(45.9)])), []);
  assert.equal(notParallel(at([], [own, group(47)])).length, 1);
  // A half turn is the same capsule.
  assert.deepEqual(notParallel(at([], [own, group(225)])), []);
  assert.deepEqual(notParallel(at([], [own, group(-135)])), []);
  // A round mark has no turn; a ghost is not drawn; another station's mark is another station's.
  assert.deepEqual(notParallel(at([], [own, group(10, { w: 12, h: 12 })])), []);
  assert.deepEqual(notParallel(at([], [own, group(10, { opacity: 0.2 })])), []);
  assert.deepEqual(notParallel(at([], [own, group(10, { id: 90 })])), []);
});

test('SM01 askew: a mark turned 10 degrees off square to its track; not reported when square, half a turn, or walked', () => {
  // The track runs north to south, so the capsule's long side is level (turn 0).
  const track = [rail('C', [[P(0, -300), P(0, 300)]])];
  const m = (rot, extra = {}) => mark({ lines: 'C', at: [0, 0], rot, ...extra });
  const bad = squareMarks(at(track, [m(10)]));
  assert.deepEqual(kinds(bad), ['mark-askew']);
  assert.match(bad[0].msg, /10\.0 degrees off square/);
  assert.deepEqual(squareMarks(at(track, [m(0)])), []);
  assert.deepEqual(squareMarks(at(track, [m(1.5)])), []);
  assert.equal(squareMarks(at(track, [m(2.5)])).length, 1);
  assert.deepEqual(squareMarks(at(track, [m(180)])), []);
  // Turned 20 degrees with a second mark of the station turned the same: the walk turned the pair.
  const walked = [m(20), mark({ lines: 'C', at: [-300, 200], rot: 20, layer: 'platform', source: 'platforms' })];
  assert.deepEqual(squareMarks(at(track, walked)), []);
  // The same mark with a second mark that is not parallel to it is not excused.
  const notWalked = [m(20), mark({ lines: 'C', at: [-300, 200], rot: 50, layer: 'platform', source: 'platforms' })];
  assert.equal(squareMarks(at(track, notWalked)).filter((f) => f.kind === 'mark-askew').length, 1);
  // 30 degrees is too much even for a walked pair (both marks sit on a track that runs north to south).
  const tooFar = [m(30), mark({ lines: 'C', at: [0, 0], rot: 30, layer: 'platform', source: 'platforms' })];
  assert.equal(squareMarks(at(track, tooFar)).filter((f) => f.kind === 'mark-askew').length, 2);
  // A round mark has no turn; below zoom 11 a station is a tick turned to its stretch, not judged.
  assert.deepEqual(squareMarks(at(track, [m(40, { w: 12, h: 12 })])), []);
  assert.deepEqual(squareMarks(at(track, [m(40)], 10.5)), []);
});

test('SM01 short: a mark 20 px long over three lines 12 px apart; not reported at 40 px', () => {
  const lines = pack(['C', 'E', 'W']).map((l) => rail(l.route, [[l.parts[0][0], P(l.parts[0][1][0] - O, 400)]]));
  const bad = squareMarks(at(lines, [mark({ at: [0, 0], w: 20 })]));
  assert.deepEqual(kinds(bad), ['mark-short']);
  assert.equal(bad[0].route, 'C W');
  assert.match(bad[0].msg, /20\.0 px long but C W run through it out to 15\.0 px/);
  assert.deepEqual(squareMarks(at(lines, [mark({ at: [0, 0], w: 40 })])), []);
  // The line's own width counts: 12 px apart, 6 px wide, the outer edges are 15 px from the middle, and
  // an edge may reach 1 px past a mark's end (every station on the live map has its lines 2 to 3 px inside).
  assert.equal(squareMarks(at(lines, [mark({ at: [0, 0], w: 24 })])).length, 1);
  assert.deepEqual(squareMarks(at(lines, [mark({ at: [0, 0], w: 28 })])), []);
});

test('SM01 short: a line the station\'s other mark stands for is not this mark\'s to cover', () => {
  // The hub's capsule serves A and C; C runs past it and ends in the group's mark 200 px on.
  const lines = [rail('A', [[P(0, -300), P(0, 0)]]), rail('C', [[P(18, -300), P(18, 300)]])];
  const hub = mark({ id: 89, lines: 'A C', at: [0, 0], w: 20 });
  const solo = squareMarks(at(lines, [hub]));
  assert.deepEqual(kinds(solo), ['mark-short']);
  const group = mark({ id: 89, lines: 'C', at: [18, 300], layer: 'platform', source: 'platforms', w: 20 });
  assert.deepEqual(squareMarks(at(lines, [hub, group])), []);
});

test('RL04 reported: lines that end at one mark 4 px apart along the track; not reported flush', () => {
  const m = mark({ at: [0, 0], w: 50 });
  const top = mark({ at: [0, -400], w: 50 });
  const uneven = unevenEnds(at(pack(['C', 'E', 'W'], { E: { south: -4 } }), [m, top]));
  assert.deepEqual(kinds(uneven), ['ends-uneven']);
  assert.match(uneven[0].msg, /3 rail ends at one mark are 4\.0 px apart along the track: [CW] runs furthest, E stops shortest/);
  assert.deepEqual(unevenEnds(at(pack(), [m, top])), []);
  // Within a px is flush.
  assert.deepEqual(unevenEnds(at(pack(['C', 'E', 'W'], { E: { south: -0.8 } }), [m, top])), []);
  assert.equal(unevenEnds(at(pack(['C', 'E', 'W'], { E: { south: -1.2 } }), [m, top])).length, 1);
});

test('RL04 not reported: ends in one mark from opposite sides, or at two marks', () => {
  // C comes from the north and ends at y = 0; E comes from the south and ends at y = 6: opposite headings.
  const lines = [rail('C', [[P(-12, -400), P(-12, 0)]]), rail('E', [[P(12, 400), P(12, 6)]])];
  const marks = [mark({ lines: 'C E', at: [0, 3], w: 50 }), mark({ lines: 'C', at: [0, -400], w: 50 }), mark({ lines: 'E', at: [0, 400], w: 50 })];
  assert.deepEqual(unevenEnds(at(lines, marks)), []);
  // Two stations 30 px apart along the track: each line ends at its own.
  const two = [rail('C', [[P(-12, -400), P(-12, 0)]]), rail('E', [[P(12, -400), P(12, 30)]])];
  const stations = [mark({ id: 1, lines: 'C', at: [-12, 0], w: 20 }), mark({ id: 2, lines: 'E', at: [12, 30], w: 20 }), mark({ id: 3, lines: 'C E', at: [0, -400], w: 50 })];
  assert.deepEqual(unevenEnds(at(two, stations)), []);
});

test('SM09 reported: a group mark overlapping its station\'s own mark by 14 px; not reported apart, or for another station', () => {
  const own = mark({ id: 89, lines: 'A B C E G N W', at: [0, 0], w: 50, rot: 45 });
  const group = (x, y, extra = {}) => mark({ id: 89, lines: 'C E W', at: [x, y], w: 40, rot: 45, layer: 'platform', source: 'platforms', ...extra });
  // Both are 40 and 50 px long and turned 45 degrees: shifted `d` px along their long side they overlap
  // by 45 - d px (the half lengths, 20 and 25), and touch at 45.
  const shifted = (d) => group(d * Math.SQRT1_2, d * Math.SQRT1_2);
  const over = overlappingMarks(at([], [own, shifted(31)]));
  assert.deepEqual(kinds(over), ['marks-overlap']);
  assert.match(over[0].msg, /overlap: 35% of the smaller is covered/);
  assert.deepEqual(overlappingMarks(at([], [own, shifted(46)])), []);
  assert.deepEqual(overlappingMarks(at([], [own, { ...shifted(31), properties: { id: 90, lines: 'C' } }])), []);
  // Not drawn: not overlapping.
  assert.deepEqual(overlappingMarks(at([], [own, { ...shifted(31), opacity: 0.2 }])), []);
});

test('SM09 lead: one mark wholly inside the other, the lines ending there', () => {
  const own = mark({ id: 89, lines: 'C E W', at: [0, 0], w: 50 });
  const group = mark({ id: 89, lines: 'C E W', at: [0, 0], w: 40, layer: 'platform', source: 'platforms' });
  const lines = pack(['C', 'E', 'W']);
  const lead = overlappingMarks(at(lines, [own, group]));
  assert.deepEqual(kinds(lead), ['marks-nested']);
  assert.match(lead[0].msg, /overlap: 100% of the smaller is covered/);
  assert.match(lead[0].msg, /lead/);
  assert.match(lead[0].msg, /C E W end at the group/);
  // The same nesting with no line ending at the group is a plain overlap.
  const bare = overlappingMarks(at([rail('C', [[P(0, -400), P(0, 400)]])], [own, group]));
  assert.deepEqual(kinds(bare), ['marks-overlap']);
});

test('endFaults runs every rule: a station whose group mark is a ghost and turned wrong', () => {
  // Union Station as e2bae25 drew it at zoom 13: the group's mark (C, E, W) a ghost, the lines end under it.
  const own = mark({ id: 89, lines: 'A B C E G N W', at: [60, 60], rot: 45, w: 52 });
  const group = mark({ id: 89, lines: 'C E W', at: [0, 0], rot: 31, w: 40, layer: 'platform', source: 'platforms', opacity: 0 });
  const found = endFaults(at(pack(), [own, group, mark({ id: 5, at: [0, -400] })], 13));
  assert.deepEqual([...new Set(kinds(found))], ['end-unmarked']);
  assert.equal(found.length, 3);
  // Drawn, it is the PG02 fault instead (and the toy marks are not square to the toy track either).
  const drawn = endFaults(at(pack(), [own, { ...group, opacity: 1 }, mark({ id: 5, at: [0, -400] })], 13));
  assert.ok(kinds(drawn).includes('marks-not-parallel'));
  assert.ok(!kinds(drawn).includes('end-unmarked'));
});

test('stationMarks leaves out the invisible marks that keep names off, and marks that serve no line', () => {
  const clear = { ...mark({ at: [0, 0] }), image: 'clear' };
  const unserved = { ...mark({ at: [0, 0] }), properties: { id: 1 } };
  const stop = { ...mark({ at: [0, 0] }), source: 'stops' };
  assert.deepEqual(stationMarks(at([], [clear, unserved, stop])), []);
  assert.equal(stationMarks(at([], [mark({ at: [0, 0] })])).length, 1);
});

// #115: the build eases a line between slots in slivers a fraction of a pixel
// long, and the page's tiles drop some of them below zoom 10.
test('freeEnds: a chain of slivers that stops short is a free end; one that carries on is not', () => {
  const sliver = (y0) => rail('C', [[P(0, y0), P(0, y0 + 0.4)]], { width: 3.4 });
  const whole = [rail('C', [[P(0, -100), P(0, 0)]], { width: 3.4 }), ...[0, 0.4, 0.8, 1.2].map(sliver), rail('C', [[P(0, 1.6), P(0, 100)]], { width: 3.4 })];
  assert.deepEqual(freeEnds(railPieces(at(whole))).map((e) => Math.round(e.E[1] - O)).sort((a, b) => a - b), [-100, 100]);
  // The slivers after the first are gone, and the line picks up 10 px on.
  const cut = [rail('C', [[P(0, -100), P(0, 0)]], { width: 3.4 }), sliver(0), rail('C', [[P(0, 10.4), P(0, 100)]], { width: 3.4 })];
  assert.deepEqual(freeEnds(railPieces(at(cut))).map((e) => Math.round(e.E[1] - O)).sort((a, b) => a - b), [-100, 0, 10, 100]);
});

test('brokenLines: a line that stops and starts again a few widths on; not two lines that each end', () => {
  const cut = [rail('C', [[P(0, -100), P(0, 0)]], { width: 3.4 }), rail('C', [[P(0, 10), P(0, 100)]], { width: 3.4 })];
  const faults = brokenLines(at(cut));
  assert.deepEqual(kinds(faults), ['break']);
  assert.match(faults[0].msg, /cut in two/);
  assert.deepEqual(kinds(endFaults(at(cut, [mark({ lines: 'C', at: [0, -100] }), mark({ lines: 'C', at: [0, 100] })]))).filter((k) => k !== 'marks-overlap'), ['break']);
  // Far apart, or another route: no break.
  assert.deepEqual(brokenLines(at([rail('C', [[P(0, -100), P(0, 0)]], { width: 3.4 }), rail('C', [[P(0, 200), P(0, 300)]], { width: 3.4 })])), []);
  assert.deepEqual(brokenLines(at([rail('C', [[P(0, -100), P(0, 0)]], { width: 3.4 }), rail('E', [[P(0, 10), P(0, 100)]], { width: 3.4 })])), []);
});

test('hiddenEnds: lines ending under a filled disc are hidden; under an open ring or a capsule across them, not', () => {
  // Pictures 40 px across: a filled disc, a ring 2 px wide, a capsule 40 by 12.
  const alpha = (id, [x, y]) => {
    const r = Math.hypot(x - 20, y - 20);
    if (id === 'disc') return r <= 19 ? 1 : 0;
    if (id === 'ring') return Math.abs(r - 18) <= 1 ? 1 : 0;
    return x >= 0 && x <= 40 && y >= 14 && y <= 26 ? 1 : 0;
  };
  const lines = pack();
  const hub = (image) => mark({ at: [0, 0], w: 40, h: 40, image, layer: 'stations-hub' });
  const top = mark({ at: [0, -400] });
  const disc = hiddenEnds(at(lines, [top, hub('disc')]), { alpha });
  assert.deepEqual(kinds(disc), ['end-hidden', 'end-hidden', 'end-hidden']);
  assert.match(disc[0].msg, /hidden under the stations-hub/);
  assert.deepEqual(hiddenEnds(at(lines, [top, hub('ring')]), { alpha }), []);
  assert.deepEqual(hiddenEnds(at(lines, [top, mark({ at: [0, 0], image: 'station-3' })]), { alpha }), []);
});
