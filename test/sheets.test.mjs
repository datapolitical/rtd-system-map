// The four sheets' drawing rules (scripts/lib/sheets.mjs), on small made-up networks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, SIZES, toPx, toLonLat, length, resample, chained, railLines, stationMarks, letters, names, strayed, busStreets, halls,  nearest, drawSheet, inkOn, shortened, noded, pruned, unlooped, squared, unjogged, evened, straightened, labelSide, filleted, arced, labelRuns, stopRings, inOrder } from '../scripts/lib/sheets.mjs';

const line = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const point = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const all = (features) => ({ type: 'FeatureCollection', features });
const sheet = SHEETS[1];
// A place on the sheet, `x` and `y` pixels from a corner of it.
const origin = toPx([-105, 39.75], sheet.zoom);
const at = (x, y) => toLonLat([origin[0] + x, origin[1] + y], sheet.zoom);

test('pixels and lon/lat turn into each other', () => {
  const p = toLonLat(toPx([-104.99, 39.74], 14), 14);
  assert.ok(Math.abs(p[0] + 104.99) < 1e-9 && Math.abs(p[1] - 39.74) < 1e-9);
});

test('pieces in any order and direction join into one path', () => {
  const runs = chained([[[20, 0], [30, 0]], [[10, 0], [0, 0]], [[10, 0], [20, 0]]]);
  assert.equal(runs.length, 1);
  assert.equal(length(runs[0]), 30);
});

test('a rail line is one whole path however its pieces come, and two lines on one track sit side by side', () => {
  const rail = (route, slot, coords) => line({ mode: 'rail', route, color: '#57C1E9', slot }, coords);
  const routes = all([
    rail('A', 0.5, [at(100, 0), at(200, 0)]),
    rail('A', 0.5, [at(100, 0), at(0, 0)].reverse()),
    rail('B', -0.5, [at(0, 0), at(200, 0)]),
    // A short break in the data is bridged.
    rail('A', 0.5, [at(205, 0), at(300, 0)]),
  ]);
  const [a, b] = railLines(routes, sheet);
  assert.equal(a.paths.length, 1);
  assert.ok(Math.abs(length(a.paths[0]) - 300) < 2);
  const pitch = SIZES.rail[sheet.id] + SIZES.gap[sheet.id];
  const apart = a.paths[0][0][1] - b.paths[0][0][1];
  assert.ok(Math.abs(Math.abs(apart) - pitch) < 0.2, `lines are ${apart} apart, want ${pitch}`);
});

test('a piece run the other way keeps its side of the track', () => {
  const rail = (slot, coords) => line({ mode: 'rail', route: 'A', color: '#57C1E9', slot }, coords);
  // Second piece runs right to left with the opposite slot: the same side on the ground.
  const [a] = railLines(all([rail(1, [at(0, 0), at(100, 0)]), rail(-1, [at(200, 0), at(100, 0)])]), sheet);
  const ys = resample(a.paths[0], 5).map((p) => p[1] - origin[1]);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.5, 'the line does not swap sides');
});

test('a station is one bar across the lines that stop there, and a far line listed by mistake is left out', () => {
  const rail = (route, slot, y) => line({ mode: 'rail', route, color: '#57C1E9', slot }, [at(0, y), at(300, y)]);
  const lines = railLines(all([rail('A', 0.5, 0), rail('B', -0.5, 0), rail('C', 0, 200)]), sheet);
  const marks = stationMarks(all([point({ id: 1, name: 'Mill', served: true, lines: 'A B C' }, at(150, 0))]), lines, sheet);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].count, 2);
  assert.ok(Math.abs(marks[0].span - (SIZES.rail[sheet.id] + SIZES.gap[sheet.id])) < 0.5);
  assert.equal(marks[0].more.length, 0);
});

test('a name sits clear of the lines and of other names', () => {
  const rail = line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [at(0, 0), at(300, 0)]);
  const lines = railLines(all([rail]), sheet);
  const marks = stationMarks(all([
    point({ id: 1, name: 'Mill', served: true, lines: 'A', end: true }, at(100, 0)),
    point({ id: 2, name: 'Orchard', served: true, lines: 'A', end: true }, at(130, 0)),
  ]), lines, sheet);
  const set = names(marks, lines, [], sheet);
  assert.equal(set.length, 2);
  for (const n of set) assert.ok(n.box[3] < origin[1] - 2 || n.box[1] > origin[1] + 2, `${n.text} is off the line`);
  const [a, b] = set.map((n) => n.box);
  assert.ok(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1], 'the two names do not touch');
});

test('every bus street is drawn; one with no sheet mark is on every sheet; a blip takes the class of the stretches beside it', () => {
  const street = (cls, zoom, coords) => line({ mode: 'bus', cls, routes: '1', n: 1, hw: 15, zoom }, coords);
  const streets = all([
    street('c15', 'far', [at(0, 0), at(100, 0)]),
    street('c60', 'far', [at(100, 0), at(106, 0)]),
    street('c15', 'far', [at(106, 0), at(200, 0)]),
    street('c30', undefined, [at(0, 50), at(200, 50)]),
    street('c30', 'near', [at(0, 90), at(200, 90)]),
  ]);
  const drawn = busStreets(streets, sheet);
  assert.equal(drawn.length, 4);
  assert.deepEqual(drawn.map((s) => s.cls), ['c15', 'c15', 'c15', 'c30']);
});

test('a sheet is rail, bus, stations and letters, and lettering reads on its colour', () => {
  const routes = all([line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [at(0, 0), at(400, 0)])]);
  const stations = all([point({ id: 1, name: 'Mill', served: true, lines: 'A', end: true }, at(0, 0))]);
  const streets = all([line({ mode: 'bus', cls: 'c15', routes: '1 2', n: 2, hw: 15, zoom: 'far' }, [at(0, 80), at(200, 80)])]);
  const kinds = drawSheet({ routes, stations, streets }, sheet).features.map((f) => f.properties.shape ?? f.properties.kind);
  for (const kind of ['bus', 'rail', 'bar', 'name', 'letter']) assert.ok(kinds.includes(kind), `no ${kind}`);
  assert.equal(inkOn('#C4D600'), '#10151d');
  assert.equal(inkOn('#552683'), '#ffffff');
});

test('a second track beside a line is not drawn, and a line that never runs alone still gets its letter', () => {
  const rail = (route, slot, coords) => line({ mode: 'rail', route, color: '#57C1E9', slot }, coords);
  const routes = all([
    rail('A', 0.5, [at(0, 0), at(400, 0)]),
    // A second track of A, a few pixels to one side and ending short: no part of the drawing.
    rail('A', 0.5, [at(360, 3), at(385, 3)]),
    rail('B', -0.5, [at(0, 0), at(400, 0)]),
  ]);
  const lines = railLines(routes, sheet);
  assert.equal(lines[0].paths.length, 1);
  assert.ok(Math.abs(length(lines[0].paths[0]) - 400) < 2, 'the line does not fold back along its second track');
  const set = letters(lines, [], sheet);
  assert.deepEqual([...new Set(set.map((l) => l.route))].sort(), ['A', 'B']);
});

test('a station bar is square across its line, and a line that ends at a station ends on its bar', () => {
  const rail = line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [at(0, 0), at(300, 120)]);
  const lines = railLines(all([rail]), sheet);
  const marks = stationMarks(all([
    point({ id: 1, name: 'Mill', served: true, lines: 'A' }, at(150, 60)),
    point({ id: 2, name: 'Orchard', served: true, lines: 'A', end: true }, at(300, 120)),
  ]), lines, sheet);
  const along = [300, 120].map((v) => v / Math.hypot(300, 120));
  for (const mark of marks) {
    const [a, b] = mark.ends;
    const across = [(b[0] - a[0]) / (mark.span || 1), (b[1] - a[1]) / (mark.span || 1)];
    assert.ok(Math.abs(across[0] * along[0] + across[1] * along[1]) < 0.1, `${mark.name} bar is square to the line`);
  }
  const last = marks.find((mark) => mark.name === 'Orchard');
  const mid = [(last.ends[0][0] + last.ends[1][0]) / 2, (last.ends[0][1] + last.ends[1][1]) / 2];
  const tip = lines[0].paths[0].at(-1);
  const head = lines[0].paths[0][0];
  const off = Math.min(Math.hypot(tip[0] - mid[0], tip[1] - mid[1]), Math.hypot(head[0] - mid[0], head[1] - mid[1]));
  assert.ok(off < 1.5, `the line ends ${off.toFixed(1)} px from its bar`);
});

test('the two halves of a divided road are one line down the middle with the routes of both', () => {
  const street = (routes, y) => line({ mode: 'bus', cls: 'c15', routes, n: 1, hw: 15, zoom: 'far' }, [at(0, y), at(300, y)]);
  const drawn = busStreets(all([street('1', 0), street('2', 4)]), sheet);
  assert.equal(drawn.length, 1);
  assert.deepEqual(drawn[0].routes.split(' ').sort(), ['1', '2']);
  const ys = drawn[0].path.map((p) => p[1] - origin[1]);
  assert.ok(Math.min(...ys) > 0.5 && Math.max(...ys) < 3.5, `drawn between the two, at ${ys[0].toFixed(1)}`);
});

test('a short break between two ends that share a route is bridged, and a short stretch takes the weight of the street it runs into', () => {
  const street = (cls, routes, coords) => line({ mode: 'bus', cls, routes, n: 1, hw: 15, zoom: 'far' }, coords);
  const drawn = busStreets(all([
    street('c15', '1', [at(0, 0), at(200, 0)]),
    street('c15', '1', [at(208, 0), at(400, 0)]),
    street('c60', '1 2', [at(400, 0), at(430, 0)]),
  ]), sheet);
  const xs = drawn.flatMap((s) => [s.path[0][0], s.path.at(-1)[0]]).map((x) => Math.round(x - origin[0])).sort((a, b) => a - b);
  assert.ok(xs.includes(208) && !xs.includes(200), 'the first street reaches the second');
  assert.deepEqual([...new Set(drawn.map((s) => s.cls))], ['c15']);
});

test('a name is shortened only where the full name sits badly, and the short form stays plain', () => {
  assert.equal(shortened('Mill Station'), 'Mill Stn');
  assert.equal(shortened('Orchard'), 'Orchard');
  const rail = line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [at(0, 0), at(300, 0)]);
  const lines = railLines(all([rail]), sheet);
  const marks = stationMarks(all([point({ id: 1, name: 'Mill Station', served: true, lines: 'A', end: true }, at(150, 0))]), lines, sheet);
  assert.equal(names(marks, lines, [], sheet)[0].text, 'Mill Station', 'open ground: written out');
});

test('a turnaround too small to read as a ring is drawn as the point its streets meet at', () => {
  const street = (coords) => line({ mode: 'bus', cls: 'c15', routes: '1', n: 1, hw: 15, zoom: 'far' }, coords);
  const drawn = busStreets(all([
    street([at(0, 0), at(200, 0)]),
    street([at(200, 0), at(208, -5)]),
    street([at(208, -5), at(208, 5)]),
    street([at(208, 5), at(200, 0)]),
  ]), sheet);
  assert.equal(drawn.length, 1, 'only the street that led to the ring is left');
  assert.ok(length(drawn[0].path) > 195, 'and it is still whole');
});

// The same, on the third sheet, where a short walk is many pixels.
const near = SHEETS[2];
const origin3 = toPx([-105, 39.75], near.zoom);
const at3 = (x, y) => toLonLat([origin3[0] + x, origin3[1] + y], near.zoom);
const hall = (id, corners) => ({ type: 'Feature', properties: { id, name: `Hall ${id}` }, geometry: { type: 'Polygon', coordinates: [[...corners, corners[0]]] } });

test("a bus station's hall is drawn where it is wide enough to see, and a street that stops at its wall ends on it", () => {
  const terminals = all([
    hall(1, [at3(100, -10), at3(160, -10), at3(160, 10), at3(100, 10)]),
    hall(2, [at3(300, -1), at3(360, -1), at3(360, 1), at3(300, 1)]),
  ]);
  const walls = halls(terminals, near);
  assert.deepEqual(walls.map((w) => w.id), [1], 'the sliver of a hall is left for a closer sheet');
  // The street's data stops four pixels short of the wall and hooks aside in its last yards.
  const street = line({ mode: 'bus', cls: 'c15', routes: '1', n: 1, hw: 15, zoom: 'near' }, [at3(0, 0), at3(90, 0), at3(96, 4)]);
  const [drawn] = busStreets(all([street]), near, walls);
  const tip = drawn.path.at(-1);
  assert.ok(nearest(walls[0].ring, tip).d < 0.5, 'the street ends on the wall');
  assert.ok(Math.abs(tip[1] - drawn.path.at(-2)[1]) < 0.5 && Math.abs(tip[1] - origin3[1]) < 3, 'and arrives square to it, without its hook');
  const sheet3 = drawSheet({ routes: all([]), stations: all([]), streets: all([street]), terminals }, near);
  assert.equal(sheet3.features.filter((f) => f.properties.kind === 'hall').length, 1);
});

test('a turnaround whose data stops short of the street it leaves from is drawn closed', () => {
  const street = (routes, coords) => line({ mode: 'bus', cls: 'c15', routes, n: 1, hw: 15, zoom: 'near' }, coords);
  const drawn = busStreets(all([
    street('1', [at3(0, 0), at3(300, 0)]),
    // A loop of the same route off to one side, each end a short walk from the street.
    street('1', [at3(100, -15), at3(100, -60), at3(160, -60), at3(160, -15)]),
    // Another route's stub as near to the street is left alone.
    street('2', [at3(240, -15), at3(240, -80)]),
  ]), near);
  // The street is cut at each corner the loop makes with it: its pieces lie along y = 0.
  const main = drawn.filter((s) => s.path.every((p) => Math.abs(p[1] - origin3[1]) < 1));
  const reach = (p) => Math.min(...main.map((s) => nearest(s.path, p).d));
  const loop = drawn.find((s) => s.routes === '1' && s.path.some((p) => p[1] - origin3[1] < -50));
  for (const end of [loop.path[0], loop.path.at(-1)]) assert.ok(reach(end) < 1, 'the loop reaches the street');
  assert.ok(main.some((s) => Math.abs(s.path[0][0] - origin3[0] - 100) < 1 || Math.abs(s.path.at(-1)[0] - origin3[0] - 100) < 1), 'and the street has a corner where it does');
  const stub = drawn.find((s) => s.routes === '2');
  assert.ok(Math.min(...[stub.path[0], stub.path.at(-1)].map(reach)) > 10, 'the other route is not joined on');
});

test('two ways round a strip too thin to see into are drawn as one street with the routes of both', () => {
  const street = (cls, routes, coords) => line({ mode: 'bus', cls, routes, n: 1, hw: 15, zoom: 'far' }, coords);
  const drawn = busStreets(all([
    street('c15', '1', [at(0, 0), at(100, 0)]),
    street('c15', '1', [at(100, 0), at(130, 0)]),
    street('c15', '1', [at(130, 0), at(230, 0)]),
    // Route 2 leaves the street and comes back to it a block later, nine pixels to one side at most.
    street('c60', '2', [at(100, 0), at(115, -9)]),
    street('c60', '2', [at(115, -9), at(130, 0)]),
  ]), sheet);
  assert.ok(drawn.every((s) => s.path.every((p) => Math.abs(p[1] - origin[1]) < 1)), 'no notch is left beside the street');
  const middle = drawn.find((s) => length(s.path) < 40);
  assert.deepEqual(middle.routes.split(' ').sort(), ['1', '2']);
});

test('a street is labelled with its whole list, only where the list fits, and labels of one street stand well apart', () => {
  const st = (x0, x1, routes = '1', y = 0) => ({ routes, cls: 'c15', n: 1, path: [[x0, y], [x1, y]] });
  const ends = (runs) => runs.map((r) => [Math.round(Math.min(r.path[0][0], r.path.at(-1)[0])), Math.round(Math.max(r.path[0][0], r.path.at(-1)[0]))]);
  // Four blocks with one list are one run 420 long: two labels 200 apart, each inside one block. Another street has its own.
  const streets = [st(0, 100), st(100, 220), st(220, 300), st(300, 420), st(0, 90, '1', 50)];
  const runs = labelRuns(streets, 200, () => 60);
  assert.equal(runs.length, 3);
  const [a, b] = ends(runs.filter((r) => r.path[0][1] === 0)).sort((x, y) => x[0] - y[0]);
  const blocks = [[0, 100], [100, 220], [220, 300], [300, 420]];
  for (const w of [a, b]) assert.ok(blocks.some(([lo, hi]) => w[0] >= lo && w[1] <= hi), 'each within a block, clear of the cross streets');
  assert.ok(b[0] - a[0] >= 200, 'and well apart');
  // A list no block can hold runs on across the corners of its run; it is never cut short.
  const long = labelRuns(streets.slice(0, 4), 500, () => 300);
  assert.equal(long.length, 1);
  assert.ok(ends(long)[0][1] - ends(long)[0][0] >= 300);
  assert.equal(long[0].routes, '1');
  // Where the list changes the run ends: a list longer than its run is not labelled at all.
  const mixed = [st(0, 100, '1 2'), st(100, 220, '2 1'), st(220, 300, '1 2 3'), st(300, 420, '1')];
  assert.deepEqual(labelRuns(mixed, 100, () => 150).map((r) => r.routes), ['1 2']);
  // A stretch with no room beside it gives its turn to another.
  assert.equal(labelRuns(streets.slice(0, 4), 200, () => 60, (path) => path[0][0] > 250).length, 1);
  assert.deepEqual(inOrder(['FreeRide', '15L', '120X', '9', '15', 'FF']), ['9', '15', '15L', '120X', 'FF', 'FreeRide']);
});

const st = (path, more = {}) => ({ cls: 'c15', routes: '1', n: 1, hw: 15, path, ...more });
const tips = (list) => list.flatMap((s) => [s.path[0], s.path.at(-1)]);
const meets = (list, p) => tips(list).filter((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.1).length;

test('streets have a corner wherever they meet: at a side street, at a crossing, and where an end stops a hair short', () => {
  const drawn = noded([
    st([[0, 0], [300, 0]]),
    // A side street that ends on the middle of the first.
    st([[100, 0], [100, -80]]),
    // One that crosses it.
    st([[200, -60], [200, 60]]),
    // One whose end stops two pixels short of it, and one too far off to be meant for it.
    st([[260, 2], [260, 70]]),
    st([[40, 20], [40, 90]]),
  ], 3, 7);
  assert.equal(meets(drawn, [100, 0]), 3, 'the street is cut where the side street ends on it');
  assert.equal(meets(drawn, [200, 0]), 4, 'both streets are cut where they cross');
  assert.equal(meets(drawn, [260, 0]), 3, 'the near end is led onto the street');
  assert.equal(meets(drawn, [40, 20]), 1, 'the far end is left where it is');
  assert.ok(Math.abs(drawn.reduce((n, s) => n + length(s.path), 0) - (300 + 80 + 120 + 70 + 70)) < 3, 'nothing is added or lost');
});

test('a short end that leads nowhere is not drawn, however many pieces it is in; a long one and one at a hall are', () => {
  const wall = { ring: [[300, 20], [320, 20], [320, 40], [300, 40], [300, 20]] };
  const drawn = pruned([
    st([[0, 0], [100, 0]]), st([[100, 0], [200, 0]]), st([[200, 0], [300, 0]]), st([[0, 0], [0, 100]]), st([[300, 0], [300, -100]]),
    // A stub in two pieces off the first corner, twelve pixels in all.
    st([[100, 0], [100, 6]]), st([[100, 6], [104, 12]], { routes: 'stub' }),
    // A route's real end, and a few steps to a hall's wall.
    st([[200, 0], [200, 60]], { routes: 'end' }),
    st([[300, 0], [300, 20]], { routes: 'hall' }),
  ], 25, [wall]);
  assert.ok(!drawn.some((s) => s.path.some((p) => p[0] > 99 && p[0] < 105 && p[1] > 1)), 'the stub is gone, both pieces');
  assert.ok(drawn.some((s) => s.routes === 'end'), 'a long end stays');
  assert.ok(drawn.some((s) => s.routes === 'hall'), 'so does a short one that reaches a hall');
});

test('a turnaround drawn as a loop too slim to see into is one street out to its end; a round one stays a loop', () => {
  const slim = st([[0, 0], [40, 2], [80, 2], [84, 0], [80, -2], [40, -2], [0, 0]]);
  const round = st([[0, 100], [30, 80], [60, 100], [30, 120], [0, 100]]);
  const [stick, loop] = unlooped([slim, round], 6, 10);
  assert.ok(stick.path.every((p) => Math.abs(p[1]) < 0.5), 'the slim loop is drawn down its middle');
  assert.ok(Math.abs(length(stick.path) - 84) < 3 && Math.hypot(stick.path[0][0] - stick.path.at(-1)[0], stick.path[0][1] - stick.path.at(-1)[1]) > 80, 'as one street, not out and back');
  assert.equal(loop, round);
});

test('two near streets tied by short links are drawn as one, and a small square block between through streets is kept', () => {
  const street = (cls, routes, coords) => line({ mode: 'bus', cls, routes, n: 1, hw: 15, zoom: 'far' }, coords);
  // A ladder on the widest sheet: two streets five pixels apart, a link between them every sixty.
  const wide = SHEETS[0];
  const o = toPx([-105, 39.75], wide.zoom);
  const to = (x, y) => toLonLat([o[0] + x, o[1] + y], wide.zoom);
  const ladder = busStreets(all([
    street('c15', '1', [to(0, 0), to(300, 0)]),
    street('c30', '2', [to(30, 5), to(270, 5)]),
    ...[60, 120, 180, 240].map((x) => street('c30', '2', [to(x, 0), to(x, 5)])),
  ]), wide);
  assert.ok(ladder.filter((s) => s.path.some((p) => p[0] - o[0] > 62 && p[0] - o[0] < 238)).every((s) => s.path.every((p) => Math.abs(p[1] - o[1]) < 1)), 'between the links one line is drawn, the busier street');
  assert.ok(ladder.some((s) => s.routes.split(' ').includes('2') && s.routes.split(' ').includes('1')), 'and it carries the routes of both');
  // A block of streets that all carry on past it, twelve pixels square.
  const block = busStreets(all([
    street('c15', '1', [at(0, 0), at(200, 0)]), street('c15', '2', [at(0, 12), at(200, 12)]),
    street('c15', '3', [at(94, -100), at(94, 100)]), street('c15', '4', [at(106, -100), at(106, 100)]),
  ]), sheet);
  for (const [x, y] of [[94, 0], [106, 0], [94, 12], [106, 12]]) assert.equal(meets(block, [origin[0] + x, origin[1] + y]), 4, 'each corner of the block is still a crossing');
});

test("a hall is drawn as a squared room over the same ground, and no street is drawn inside it", () => {
  // A surveyed outline with a notch and a slanted corner.
  const ring = [[0, 0], [60, 0], [60, 12], [52, 12], [52, 20], [8, 24], [0, 20], [0, 0]];
  const room = squared(ring);
  const area = (r) => Math.abs(r.slice(1).reduce((n, p, i) => n + r[i][0] * p[1] - p[0] * r[i][1], 0)) / 2;
  assert.equal(room.length, 5);
  for (let i = 1; i < 4; i++) {
    const [a, b, c] = [room[i - 1], room[i], room[i + 1]];
    assert.ok(Math.abs((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) < 1e-6, 'every corner is square');
  }
  assert.ok(Math.abs(area(room) - area(ring)) < 1, 'it covers as much ground');
  const square = [[0, 0], [40, 0], [40, 20], [0, 20], [0, 0]];
  assert.ok(squared(square).every((p) => square.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)), 'a room already square is drawn as it is');
  const terminals = all([hall(1, [at3(100, -10), at3(160, -10), at3(160, 10), at3(100, 10)])]);
  const walls = halls(terminals, near);
  const street = (routes, coords) => line({ mode: 'bus', cls: 'c15', routes, n: 1, hw: 15, zoom: 'near' }, coords);
  // Two streets meet inside the hall; a third runs on through it.
  const drawn = busStreets(all([street('1', [at3(0, 0), at3(130, 0)]), street('2', [at3(130, -80), at3(130, 0)]), street('3', [at3(150, -80), at3(150, 80)])]), near, walls);
  const inside = (p) => p[0] - origin3[0] > 101 && p[0] - origin3[0] < 159 && Math.abs(p[1] - origin3[1]) < 9;
  assert.ok(!drawn.filter((s) => s.routes !== '3').some((s) => resample(s.path, 1).some(inside)), 'streets that go indoors stop at the walls');
  assert.equal(drawn.filter((s) => s.routes !== '3' && [s.path[0], s.path.at(-1)].some((p) => nearest(walls[0].ring, p).d < 0.5)).length, 2, 'each on the side it comes from');
  const through = drawn.filter((s) => s.routes === '3');
  assert.equal(through.length, 2, 'the street that runs through is cut at both walls');
  assert.ok(!through.some((s) => resample(s.path, 1).some(inside)), 'and nothing of it is drawn in the room');
  assert.ok(through.every((s) => [s.path[0], s.path.at(-1)].some((p) => nearest(walls[0].ring, p).d < 0.5)), 'each half ends on its wall');
  // One that only clips a corner of the room is left whole.
  const clip = busStreets(all([street('4', [at3(175, 7), at3(140, -28)])]), near, walls);
  assert.equal(clip.length, 1);
  assert.ok(Math.abs(length(clip[0].path) - 35 * Math.SQRT2) < 1, 'a street over a corner is whole');
});

test('a knot gathered to a point beside a street going through does not bend that street', () => {
  const street = (cls, routes, coords) => line({ mode: 'bus', cls, routes, n: 1, hw: 15, zoom: 'near' }, coords);
  const drawn = busStreets(all([
    street('c5', '1', [at3(0, -100), at3(0, 0)]), street('c5', '1', [at3(0, 0), at3(0, 100)]),
    // A turnaround a few pixels round hangs off the street, and a quiet street runs into it.
    street('c60', '2', [at3(0, 0), at3(9, -5)]), street('c60', '2', [at3(9, -5), at3(9, 5)]), street('c60', '2', [at3(9, 5), at3(0, 0)]),
    street('c60', '2', [at3(9, -5), at3(80, -5)]),
  ]), near);
  const main = drawn.filter((s) => s.cls === 'c5');
  assert.ok(main.every((s) => s.path.every((p) => Math.abs(p[0] - origin3[0]) < 0.5)), 'the street is as straight as before');
  const quiet = drawn.filter((s) => s.cls === 'c60');
  assert.equal(quiet.length, 1, 'the turnaround is a point');
  assert.ok(Math.min(...[quiet[0].path[0], quiet[0].path.at(-1)].map((p) => Math.hypot(p[0] - origin3[0], p[1] - origin3[1]))) < 1, 'on the street, where the quiet street now ends');
});

test('route numbers are set beside their street, clear of its ink, on every sheet that has them', async () => {
  const { sheetStyle, BUS_WIDTH, NUMBER_SIZE, numberOffset } = await import('../public/js/sheets/style.js');
  for (const theme of ['light', 'dark']) {
    const layers = sheetStyle(theme).layers.filter((l) => l.id.includes('bus-number'));
    assert.equal(layers.length, 3, 'sheets 2 to 4 number their streets');
    for (const l of layers) assert.ok(l.layout['text-offset'], 'each sets its numbers off the line');
  }
  for (const n of [2, 3, 4]) for (const [cls, width] of Object.entries(BUS_WIDTH[n])) {
    // Half the figures' height is about a third of the type size; the rest must clear the line.
    const clear = -numberOffset(n, width) * NUMBER_SIZE[n] - 0.36 * NUMBER_SIZE[n];
    assert.ok(clear >= width / 2 + 1, `sheet ${n} ${cls}: the figures clear the street by a pixel`);
  }
});

test('in the dark a hall stands off the ground and the buildings round it', async () => {
  const { PALETTES } = await import('../public/js/sheets/style.js');
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const theme of ['light', 'dark']) {
    const c = PALETTES[theme];
    assert.ok(ratio(c.hall, c.building) >= 1.15 && ratio(c.hall, c.ground) >= 1.15, `${theme}: the hall reads as a room`);
    assert.ok(ratio(c.hallEdge, c.hall) >= 1.8, `${theme}: its wall reads`);
  }
});

test('a street that stops short of a slanted wall carries straight on to it, not round to its nearest point', () => {
  // A hall set on the diagonal; the street runs east and stops a few pixels short of its slanted wall.
  const walls = halls(all([hall(1, [at3(100, 0), at3(130, -30), at3(160, 0), at3(130, 30)])]), near);
  const street = line({ mode: 'bus', cls: 'c5', routes: '1', n: 1, hw: 5, zoom: 'near' }, [at3(0, -8), at3(101, -8)]);
  const [drawn] = busStreets(all([street]), near, walls);
  const tip = drawn.path.at(-1);
  assert.ok(nearest(walls[0].ring, tip).d < 0.5, 'it ends on the wall');
  assert.ok(drawn.path.every((p) => Math.abs(p[1] - origin3[1] + 8) < 0.5), 'without turning to meet it');
});

test('a street that meets a cross street at two corners a little apart goes straight across at one', () => {
  // Colfax-like: the west half comes into the cross street at y 0, the east half at y 4, with a
  // hook into each corner; the cross street's link between them is busier-than-nothing but quiet.
  const west = st([[-200, 0], [-20, 0], [-6, -3], [0, 0]], { cls: 'c10', routes: '15 16' });
  const east = st([[0, 4], [6, 7], [20, 4], [200, 4]], { cls: 'c10', routes: '15' });
  const link = st([[0, 0], [0, 4]], { cls: 'c30', routes: '0' });
  const north = st([[0, -150], [0, 0]], { cls: 'c30', routes: '0' });
  const south = st([[0, 4], [0, 150]], { cls: 'c30', routes: '0' });
  const out = unjogged([west, east, link, north, south], 18);
  assert.ok(!out.some((s) => s.routes === '0' && length(s.path) < 10), 'the link between the two corners is not drawn');
  const [w, e] = [out.find((s) => s.routes === '15 16'), out.find((s) => s.routes === '15')];
  assert.deepEqual(w.path.at(-1), e.path[0], 'both halves meet at one corner');
  const corner = w.path.at(-1);
  for (const p of [...w.path.slice(0, -1), ...e.path.slice(1)]) {
    assert.ok(Math.hypot(p[0] - corner[0], p[1] - corner[1]) > 30, 'and each runs straight into it, no hook left');
  }
  const crossing = out.filter((s) => s.routes === '0');
  assert.equal(crossing.length, 2, 'the cross street stays, in its two pieces');
  const quiet = unjogged([st([[-200, 0], [0, 0]], { cls: 'c60', routes: '9' }), st([[0, 4], [200, 4]], { cls: 'c60', routes: '9' }), st([[0, 0], [0, 4]], { cls: 'c10', routes: '0' }), north, south], 18);
  assert.equal(quiet.length, 5, 'but not where the link is busier than the halves');
  // A ladder: two streets side by side, each carrying on past the rung that ties them.
  const ladder = unjogged([
    st([[-200, 0], [0, 0]], { cls: 'c10', routes: '8' }), st([[0, 0], [200, 0]], { cls: 'c10', routes: '8' }),
    st([[-200, 6], [0, 6]], { cls: 'c10', routes: '8' }), st([[0, 6], [200, 6]], { cls: 'c10', routes: '8' }),
    st([[0, 0], [0, 6]], { cls: 'c30', routes: '0' }),
  ], 18);
  assert.equal(ladder.length, 5, 'nor where the two are streets of a ladder that carry on past the rung');
  assert.ok(ladder.every((s) => s.path.every((p) => p[1] === 0 || p[1] === 6 || s.routes === '0')), 'which stay where they are');
});

test('along a street nothing else meets, a short stretch a class apart takes its neighbour\'s weight; a long one stays', () => {
  const hub = [[[0, 0], [0, -80]], [[0, 0], [80, 0]]].map((p) => st(p, { cls: 'c10', routes: '5' }));
  const out = evened([
    st([[-120, 0], [-14, 0]], { cls: 'c30', routes: '1 6 10' }),
    st([[-14, 0], [-9, 0]], { cls: 'c15', routes: '1 6 10' }),
    st([[-9, 0], [0, 0]], { cls: 'c15', routes: '1 6 9 10' }),
    ...hub,
  ], 32);
  assert.ok(out.filter((s) => s.path[0][0] < 0).every((s) => s.cls === 'c30'), 'the tick into the corner is the pale street\'s weight');
  const real = evened([
    st([[0, 100], [100, 100]], { cls: 'c10', routes: '2 3' }),
    st([[100, 100], [200, 100]], { cls: 'c30', routes: '2' }),
  ], 32);
  assert.deepEqual(real.map((s) => s.cls), ['c10', 'c30'], 'a change of service over a long stretch is kept');
});

test('a slim loop whose way back wanders longer than its way out, with a small bulge, is still one street out to a round end', () => {
  // Out along y = 0; back along y = 3 with a bulge to y = 9 for six pixels and a few extra
  // yards of wander; a round turnaround at the far end.
  const out = [[0, 0], [200, 0]];
  const turn = [[215, -12], [230, 0], [215, 14]];
  const back = [[200, 3], [144, 3], [140, 9], [136, 9], [132, 3], [80, 3], [70, 6], [60, 3], [0, 0]];
  const [stick, eye] = unlooped([st([...out, ...turn, ...back])], 6, 10);
  assert.ok(eye, 'the round end stays a loop');
  assert.ok(stick.path.every((p) => p[1] > -1 && p[1] < 5), 'the way out and back are one street down the middle, bulge and all');
  assert.ok(length(stick.path) > 180, 'out to where the loop opens');
});

test('a route number never sits on a stop: each stop holds its ground, placed before the numbers', async () => {
  const { sheetStyle, STOP_RING, STOP_ROOM } = await import('../public/js/sheets/style.js');
  for (const theme of ['light', 'dark']) {
    const layers = sheetStyle(theme).layers;
    const isStop = (l) => JSON.stringify(l.filter) === JSON.stringify(['==', ['get', 'kind'], 'stop']);
    const rings = layers.filter((l) => isStop(l) && l.type === 'circle');
    assert.ok(rings.length, 'the closest sheet rings its stops');
    for (const ring of rings) {
      const n = ring.id.split('-').pop();
      const keep = layers.findIndex((l) => l.id === `keep-off-stop-${n}`);
      const numbers = layers.findIndex((l) => l.id === `bus-number-${n}`);
      assert.ok(keep > numbers && numbers >= 0, `sheet ${n}: the stops' marks are placed first (MapLibre places the last layer first)`);
      const k = layers[keep];
      assert.ok(isStop(k) && k.source === ring.source);
      assert.ok(k.layout['text-allow-overlap'] && !k.layout['text-ignore-placement'], 'the mark is always there and keeps others off');
      assert.ok(k.layout['text-size'] >= 2 * (STOP_RING.radius + STOP_RING.stroke / 2), 'the mark covers the whole ring');
      assert.equal(ring.paint['circle-radius'], STOP_RING.radius);
    }
    assert.ok(rings.length && STOP_ROOM > 0);
  }
});

test('the quietest bus street reads clearly in both themes and each busier class stands above the one below', async () => {
  const { PALETTES } = await import('../public/js/sheets/style.js');
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  // A hairline of light on dark ground reads fainter than the same contrast in ink on paper.
  const least = { light: 1.8, dark: 2.6 };
  for (const theme of ['light', 'dark']) {
    const c = PALETTES[theme];
    const steps = ['c60', 'c30', 'c15', 'c10', 'c5'].map((k) => ratio(c.bus[k], c.ground));
    assert.ok(steps[0] >= least[theme], `${theme}: the quietest street reads (${steps[0].toFixed(2)})`);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1] * 1.25, `${theme}: class ${i} stands above class ${i - 1}`);
  }
});

test('a street that drifts a pixel or two through its corners is drawn straight, its cross streets with it; a real bend stays', () => {
  const colfax = { cls: 'c5', routes: '15' };
  const cross = { cls: 'c10', routes: '0' };
  const out = straightened([
    st([[-100, 2], [0, 2]], colfax),
    st([[0, 2], [15, 2], [30, 4]], colfax),
    st([[30, 4], [60, 5], [90, 4]], colfax),
    st([[90, 4], [200, 3]], colfax),
    st([[0, -80], [0, 2]], cross), st([[0, 2], [0, 80]], cross),
    st([[30, -80], [30, 4]], cross),
  ], SIZES.busStraight);
  const ys = out.slice(0, 4).flatMap((s) => s.path.map((p) => p[1]));
  const line = (x) => 2 + (x + 100) / 300;
  for (const s of out.slice(0, 4)) for (const p of s.path) assert.ok(Math.abs(p[1] - line(p[0])) < 0.01, `the street is one straight line (${ys.map((y) => y.toFixed(1))})`);
  assert.deepEqual(out[6].path.at(-1), out[1].path.at(-1), 'the cross street still ends on its corner');
  const bend = straightened([st([[0, 0], [50, 0]], colfax), st([[50, 0], [100, 8]], colfax), st([[100, 8], [150, 8]], colfax)], SIZES.busStraight);
  assert.deepEqual(bend[1].path, [[50, 0], [100, 8]], 'a real bend is kept');
});

test('a street that stops a short walk from a rail station, heading for it, is led on to the station', () => {
  const street = (routes, coords) => line({ mode: 'bus', cls: 'c15', routes, n: 1, hw: 15, zoom: 'near' }, coords);
  const px = (x, y) => [origin3[0] + x, origin3[1] + y];
  // A mark 12 px past the end of a street that runs at it, and another well behind a second street's end.
  const marks = [{ ends: [px(-4, -12), px(4, -12)], more: [] }, { ends: [px(296, 40), px(304, 40)], more: [] }];
  const drawn = busStreets(all([street('1', [at3(0, 200), at3(0, 0)]), street('2', [at3(300, 200), at3(300, 0)])]), near, [], marks);
  const one = drawn.find((s) => s.routes === '1');
  const two = drawn.find((s) => s.routes === '2');
  const end = (s) => [s.path[0], s.path.at(-1)].sort((a, b) => a[1] - b[1])[0];
  assert.ok(Math.hypot(end(one)[0] - origin3[0], end(one)[1] - origin3[1] + 12) < 0.5, 'the street ends on the mark');
  assert.ok(Math.abs(end(two)[1] - origin3[1]) < 0.5, 'a station behind the end is not reached back to');
  // The same street ending on a bus station's hall stays there: that is where its buses go.
  const hall = { id: 'h', ring: [px(-20, 0), px(20, 0), px(20, 6), px(-20, 6), px(-20, 0)] };
  const kept = busStreets(all([street('1', [at3(0, 200), at3(0, 0)])]), near, [hall], marks)[0];
  assert.ok(Math.min(...[kept.path[0], kept.path.at(-1)].map((p) => p[1] - origin3[1])) > -1, 'not led past the hall to the rail station');
});

test('route numbers go on the side of their street with room: not on a street that runs close beside it', async () => {
  // A street running up the screen has its upright figures read bottom to top: the side above them is its left.
  const right = st([[107, 300], [107, 0]]);
  const left = st([[100, 300], [100, 0]]);
  const far = st([[300, 300], [300, 0]]);
  assert.equal(labelSide(far, [far, left, right], 8.5), 1, 'with room above its figures, they go there');
  assert.equal(labelSide(right, [far, left, right], 8.5), -1, 'with a street close above, they go below');
  const squeezed = st([[114, 300], [114, 0]]);
  assert.equal(labelSide(right, [left, right, squeezed], 8.5), 0, 'with streets close both sides, the block is not labelled');
  // A street drawn straight down is read top to bottom (the page turns figures over only when a line runs leftward):
  // the side above its figures is its right, clear of the street on its left.
  assert.equal(labelSide(st([[107, 0], [107, 300]]), [left], 8.5), 1);
  const { sheetStyle } = await import('../public/js/sheets/style.js');
  const numbers = sheetStyle('dark').layers.find((l) => l.id === 'bus-number-2');
  const [, test, below, above] = numbers.layout['text-offset'];
  assert.deepEqual(test, ['==', ['get', 'side'], -1]);
  assert.equal(JSON.stringify(below).replace(/-/g, ''), JSON.stringify(above).replace(/-/g, ''), 'the same distance off the street either side');
});

test('a block too short for its numbers and some air before its cross streets is not labelled', () => {
  const street = (routes, coords) => line({ mode: 'bus', cls: 'c15', routes, n: 1, hw: 15, zoom: 'near' }, coords);
  const data = { routes: all([]), stations: all([]), terminals: null, streets: all([
    street('1', [at3(0, 0), at3(0, 400)]), street('2', [at3(9, 0), at3(9, 400)]), street('3', [at3(0, 200), at3(9, 200)]),
  ]) };
  const drawn = drawSheet(data, near).features;
  assert.ok(drawn.some((f) => f.properties.kind === 'bus' && f.properties.routes === '3'), 'the rung is drawn');
  const labels = drawn.filter((f) => f.properties.kind === 'bus-label').map((f) => f.properties.label);
  assert.ok(labels.includes('1') && labels.includes('2'), 'the long streets are labelled');
  assert.ok(!labels.includes('3'), 'but its number would overrun the streets at its ends');
});

test("a stop the build counted as a bus station's, or one only trains call at, is not ringed: the hall and the bar stand for it", async () => {
  const { busStops } = await import('../scripts/lib/sheets.mjs');
  const pt = (id, props) => ({ type: 'Feature', properties: { id, ...props }, geometry: { type: 'Point', coordinates: [0, 0] } });
  const stops = { features: [pt('street', { lines: '15 19' }), pt('gate', { lines: '15', terminal: 1 }), pt('track', { lines: 'A B' }), pt('both', { lines: 'A 15' })] };
  const routes = { features: [{ properties: { mode: 'rail', route: 'A' } }, { properties: { mode: 'rail', route: 'B' } }, { properties: { mode: 'bus', route: '15' } }] };
  assert.deepEqual(busStops(stops, routes).map((f) => f.properties.id), ['street', 'both']);
  assert.deepEqual(busStops(null, routes), []);
});

test("a line's tail track past its last station is no part of it: the line ends at that station's bar", () => {
  // On the closest sheet a walk is hundreds of pixels; the track runs 120 px past the last station.
  const s4 = SHEETS[3];
  const o4 = toPx([-105, 39.75], s4.zoom);
  const at4 = (x, y) => toLonLat([o4[0] + x, o4[1] + y], s4.zoom);
  const rail = line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [at4(-900, 0), at4(520, 0)]);
  const lines = railLines(all([rail]), s4);
  const marks = stationMarks(all([
    point({ id: 1, name: 'Mill', served: true, lines: 'A' }, at4(100, 0)),
    point({ id: 2, name: 'Yard', served: true, lines: 'A', end: true }, at4(400, 0)),
  ]), lines, s4);
  const path = lines[0].paths[0];
  const end = path[0][0] > path.at(-1)[0] ? path[0] : path.at(-1);
  assert.ok(Math.abs(end[0] - (o4[0] + 400)) < 1, `the line stops at the last station, not ${(end[0] - o4[0]).toFixed(0)}`);
  assert.equal(marks.length, 2);
  const begin = path[0][0] > path.at(-1)[0] ? path.at(-1) : path[0];
  assert.ok(begin[0] - o4[0] < -899, 'track running on farther than a walk is the line going on: it is kept');
});

test('lines that end at one bar coming in from either side meet back to back at one fat bar with a divider down it', async () => {
  // A from the west and B from the east both end at Mill.
  const lines = railLines(all([
    line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [at(0, 0), at(150, 0)]),
    line({ mode: 'rail', route: 'B', color: '#4E9D2D', slot: 0 }, [at(300, 0), at(150, 0)]),
  ]), sheet);
  const marks = stationMarks(all([point({ id: 1, name: 'Mill', served: true, lines: 'A B', end: true }, at(150, 0))]), lines, sheet);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].more.length, 0, 'one bar');
  assert.ok(marks[0].fat, 'drawn fat');
  assert.ok(marks[0].span < 0.5, 'no longer than the widest set: here one line each, so a round mark');
  // Lines ending from one side only keep a plain bar.
  const one = railLines(all([line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [at(0, 0), at(150, 0)])]), sheet);
  assert.ok(!stationMarks(all([point({ id: 1, name: 'Mill', served: true, lines: 'A', end: true }, at(150, 0))]), one, sheet)[0].fat);
  const { sheetStyle } = await import('../public/js/sheets/style.js');
  for (const theme of ['light', 'dark']) {
    const ids = sheetStyle(theme).layers.map((l) => l.id);
    for (const n of [1, 2, 3, 4]) assert.ok(ids.indexOf(`station-divider-${n}`) > ids.indexOf(`station-${n}`), `sheet ${n}: the divider lies on the bar`);
  }
});

test('a street that turns at a corner turns as a pen would: the bend is rounded, a street carrying straight on is not', () => {
  // A street turning north-east, a side street meeting its corner from the south, and a crossing that runs straight on.
  const out = filleted([
    st([[0, 0], [100, 0]]), st([[100, 0], [140, -20]]), st([[100, 0], [100, 100]]),
    st([[0, 200], [100, 200]]), st([[100, 200], [200, 200]]),
  ], 9);
  const [a, b, side, c, d] = out;
  assert.ok(Math.hypot(a.path.at(-1)[0] - 100, a.path.at(-1)[1]) > 1 && b.path.length > 2, 'the turn no longer meets at the sharp corner');
  assert.deepEqual(a.path.at(-1), b.path[0], 'its two pieces still meet');
  assert.deepEqual(side.path[0], a.path.at(-1), 'the side street ends on the curve');
  assert.ok(nearest([...a.path, ...b.path], [100, 0]).d > 1, 'the curve cuts inside the corner');
  assert.deepEqual([c.path.at(-1), d.path[0]], [[100, 200], [100, 200]], 'straight on: left as it is');
  assert.equal(c.path.length, 2);
});

test("a turnaround's bow is drawn in one sweep: no bulge or pinch from the route data", () => {
  // A straight way back between two corners, and a bow out that bulges and pinches.
  const bow = [[0, 0], [-10, -20], [5, -45], [-5, -60], [20, -80], [60, -85], [100, 0]];
  const [out, back] = arced([st(bow), st([[0, 0], [100, 0]])]);
  assert.deepEqual(back.path, [[0, 0], [100, 0]], 'the straight way stays');
  assert.deepEqual([out.path[0], out.path.at(-1)], [[0, 0], [100, 0]], 'the bow keeps its corners');
  const turns = out.path.slice(2).map((p, i) => {
    const [a, b] = [out.path[i], out.path[i + 1]];
    const [u, v] = [[b[0] - a[0], b[1] - a[1]], [p[0] - b[0], p[1] - b[1]]];
    return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
  });
  assert.ok(turns.every((t) => t >= -0.01) || turns.every((t) => t <= 0.01), 'it bends one way only');
  assert.ok(Math.abs(Math.min(...out.path.map((p) => p[1])) + 85) < 12, 'and reaches out about as far as it did');
});

test("where lines end together at a bar its name carries their letters, and a station's far bar is named too", () => {
  // A and B end side by side at Mill; C passes through Ford alone.
  const two = (y, route, color) => line({ mode: 'rail', route, color, slot: 0 }, [at(0, y), at(300, y)]);
  const lines = railLines(all([two(0, 'A', '#57C1E9'), two(0, 'B', '#4E9D2D')]), sheet);
  const marks = stationMarks(all([point({ id: 1, name: 'Mill', served: true, lines: 'A B', end: true }, at(300, 0)), point({ id: 2, name: 'Ford', served: true, lines: 'A B' }, at(150, 0))]), lines, sheet);
  const set = names(marks, lines, [], sheet);
  const mill = set.find((n) => n.mark.name === 'Mill');
  assert.deepEqual(mill.letters.map((l) => l.route).sort(), ['A', 'B']);
  assert.equal(set.find((n) => n.mark.name === 'Ford').letters.length, 0, 'lines running through need no letters at the name');
  // The letters sit in a row under the name, inside the room the name took.
  for (const l of mill.letters) assert.ok(l.at[0] >= mill.box[0] && l.at[0] <= mill.box[2] && l.at[1] <= mill.box[3] && l.at[1] > mill.box[1]);
  assert.ok(Math.abs(mill.letters[0].at[1] - mill.letters[1].at[1]) < 1e-6, 'one row');
  // A second bar far from the first is named as well, with the lines that end at it; a near one puts its letters on the first name.
  const ink = (route) => ({ route, color: '#57C1E9' });
  const far = { ...marks[0], bars: [{ ends: marks[0].ends, ending: [ink('A'), ink('B')] }, { ends: marks[0].ends.map((p) => [p[0] - 2 * SIZES.nameAgain, p[1]]), ending: [ink('E'), ink('W')] }] };
  const twice = names([far], lines, [], sheet).filter((n) => n.mark.name === 'Mill');
  assert.equal(twice.length, 2);
  assert.deepEqual(twice.map((n) => n.letters.map((l) => l.route).join('')), ['AB', 'EW']);
  const close = { ...far, bars: [far.bars[0], { ...far.bars[1], ends: marks[0].ends.map((p) => [p[0] - 20, p[1]]) }] };
  const once = names([close], lines, [], sheet);
  assert.equal(once.length, 1);
  assert.equal(once[0].letters.map((l) => l.route).join(''), 'ABEW');
});

test('a long hall says what it is down its length; a place that shares a station\'s name is not lettered twice; a label is never a list cut short', async () => {
  const data = { routes: all([]), stations: all([]), streets: all([]), stops: null };
  const room = (w, more) => ({ type: 'Feature', properties: { id: 1, name: 'Hall', ...more }, geometry: { type: 'Polygon', coordinates: [[at3(0, 0), at3(w, 0), at3(w, 20), at3(0, 20), at3(0, 0)]] } });
  const label = (w, more) => drawSheet({ ...data, terminals: all([room(w, more)]) }, near).features.find((f) => f.properties.kind === 'hall-name');
  assert.equal(label(400, { underground: 1 }).properties.text, 'Bus concourse');
  assert.equal(label(400).properties.text, 'Bus station');
  assert.equal(label(60), undefined, 'too short for the words');
  const [a, b] = label(400).geometry.coordinates;
  assert.ok(a[0] < b[0] && Math.abs(a[1] - b[1]) < 1e-9, 'along its length, reading left to right');
  const { sheetStyle } = await import('../public/js/sheets/style.js');
  const style = sheetStyle('dark', ['Union Station']);
  assert.ok(JSON.stringify(style.layers.find((l) => l.id === 'place-4').filter).includes('UNION STATION'));
  const ids = style.layers.map((l) => l.id);
  assert.ok(ids.indexOf('hall-name-4') > ids.indexOf('street-name-4'), 'placed before street names, which give way');
});

test('lines that end over a hall end at its wall; a corner beside a wall sits on it; a street carrying all of a neighbour\'s routes is no lighter', async () => {
  const { onWalls, gathered } = await import('../scripts/lib/sheets.mjs');
  // A hall 200 wide and 40 deep; A and B come down from the north and stop in the middle of it.
  const room = { type: 'Feature', properties: { id: 1, name: 'Hall' }, geometry: { type: 'Polygon', coordinates: [[at3(0, 0), at3(200, 0), at3(200, 40), at3(0, 40), at3(0, 0)]] } };
  const walls = halls(all([room]), near);
  const down = (route, color) => line({ mode: 'rail', route, color, slot: 0 }, [at3(100, -400), at3(100, 20)]);
  const stations = all([point({ id: 1, name: 'Mill', served: true, lines: 'A B', end: true }, at3(100, 20))]);
  const y = (walled) => {
    const lines = railLines(all([down('A', '#57C1E9'), down('B', '#4E9D2D')]), near);
    const [m] = stationMarks(stations, lines, near, walled);
    return [m.ends[0][1] - origin3[1], Math.max(...lines.flatMap((l) => l.paths.flat().map((p) => p[1]))) - origin3[1]];
  };
  assert.ok(y([])[0] > 10, 'with no hall the bar is where the track stops');
  const [bar, tip] = y(walls);
  assert.ok(Math.abs(bar) < 1 && tip < 1, 'with one, the bar is on the north wall and no line runs past it');
  // A corner 6 px off the wall moves onto it, with no hook left behind; a far one stays.
  const ring = [[0, 0], [200, 0], [200, 40], [0, 40], [0, 0]];
  const [a, b] = onWalls([st([[50, 46], [51, 50], [50, 120]]), st([[50, 46], [120, 100]]), st([[300, 300], [320, 300]])], [{ ring }], SIZES.hallReach);
  assert.deepEqual(a.path, [[50, 40], [50, 120]]);
  assert.deepEqual(b.path[0], [50, 40]);
  // Two streets gather into one that the data drew lighter: it takes the heavier's weight. One that drops a route keeps its own.
  const g = gathered([st([[0, 0], [100, 0]], { routes: '1 2', cls: 'c10', hw: 10 }), st([[100, 0], [200, 0]], { routes: '1 2 3', cls: 'c30', hw: 30 }), st([[200, 0], [300, 0]], { routes: '3', cls: 'c60', hw: 60 })]);
  assert.deepEqual(g.map((s) => s.cls), ['c10', 'c10', 'c60']);
});

test('a stop whose ring would sit half under a rail line is not ringed', () => {
  const s = SHEETS[3];
  const o = toPx([-105, 39.75], s.zoom);
  const ll = (x, y) => toLonLat([o[0] + x, o[1] + y], s.zoom);
  const data = { routes: all([line({ mode: 'rail', route: 'A', color: '#57C1E9', slot: 0 }, [ll(0, 0), ll(400, 0)])]), stations: all([]), streets: all([]), terminals: null,
    stops: all([point({ id: 'under', routes: '15' }, ll(200, 3)), point({ id: 'clear', routes: '15' }, ll(200, 30))]) };
  assert.deepEqual(drawSheet(data, s).features.filter((f) => f.properties.kind === 'stop').map((f) => f.properties.id), ['clear']);
});

test('a street with many routes is labelled with all of them, or not at all: never a count of the rest', () => {
  const street = (routes, coords) => line({ mode: 'bus', cls: 'c15', routes, n: routes.split(' ').length, hw: 15, zoom: 'near' }, coords);
  const many = '0 3L 9 10 52 83 120X FF';
  const draw = (len) => drawSheet({ routes: all([]), stations: all([]), terminals: null, streets: all([street(many, [at3(0, 0), at3(len, 0)])]) }, near).features;
  const labels = draw(600).filter((f) => f.properties.kind === 'bus-label').map((f) => f.properties.label);
  assert.ok(labels.length && labels.every((l) => l === '0, 3L, 9, 10, 52, 83, 120X, FF'));
  assert.equal(draw(60).filter((f) => f.properties.kind === 'bus-label').length, 0, 'too short for the list: no label');
  assert.equal(draw(60).find((f) => f.properties.kind === 'bus').properties.routes, '0, 3L, 9, 10, 52, 83, 120X, FF', 'a tap still gives it');
});

test("a stop's ring sits on the street its buses are drawn on, and the two sides of a street are one ring", () => {
  const s4 = SHEETS[3];
  const o = toPx([-105, 39.75], s4.zoom);
  const ll = (x, y) => toLonLat([o[0] + x, o[1] + y], s4.zoom);
  const stop = (id, routes, x, y, heading) => point({ id, name: `Stop ${id}`, lines: routes, heading }, ll(x, y));
  const streets = [{ routes: '15 19', cls: 'c15', path: [[o[0], o[1]], [o[0] + 400, o[1]]] }, { routes: '7', cls: 'c30', path: [[o[0], o[1] + 12], [o[0] + 400, o[1] + 12]] }];
  const rings = stopRings([stop('a', '15', 100, -9, 'Eastbound'), stop('b', '19', 102, 8, 'Westbound'), stop('c', '15', 300, 9, 'Eastbound'), stop('d', '99', 200, 5)], streets, s4);
  const rel = (r) => [Math.round(r.at[0] - o[0]), Math.round(r.at[1] - o[1])];
  assert.deepEqual(rings.map((r) => r.id), ['a', 'c', 'd']);
  assert.deepEqual(rel(rings[0]), [100, 0], 'on its own street, not the nearer one of another route');
  assert.deepEqual(rings[0].routes, ['15', '19']);
  assert.equal(rings[0].heading, '', 'two ways, so no one heading');
  assert.deepEqual(rel(rings[1]), [300, 0]);
  assert.deepEqual(rel(rings[2]), [200, 5], 'a stop with no street of its own drawn near stays where it is');
});

test("a turnaround's bow is drawn tighter where it would run against rail, and a line's lead-in starts from its station, not its tail track's end", () => {
  // A bow from (0,0) round to (0,100) that reaches 120 out; rail runs down x = 125.
  const loop = [st([[0, 0], [60, -10], [120, 50], [60, 110], [0, 100]]), st([[0, 0], [0, 100]])];
  const reach = (list) => Math.max(...list[0].path.map((p) => p[0]));
  const free = reach(arced(loop));
  const held = reach(arced(loop, (p) => Math.abs(125 - p[0]), 30));
  assert.ok(free > 100 && held <= 96 && held > 50, `drawn in from ${free} to ${held}`);
  // The track runs 60 px past the last station. The line bends over a long lead-in, not in the last few pixels.
  const s4 = SHEETS[3];
  const o = toPx([-105, 39.75], s4.zoom);
  const ll = (x, y) => toLonLat([o[0] + x, o[1] + y], s4.zoom);
  const track = (route, color) => line({ mode: 'rail', route, color, slot: 0 }, [ll(-900, 0), ll(520, 0), ll(580, 0)]);
  const lines = railLines(all([track('A', '#57C1E9'), track('B', '#4E9D2D')]), s4);
  stationMarks(all([point({ id: 1, name: 'First', served: true, lines: 'A B' }, ll(-880, 0)), point({ id: 2, name: 'Last', served: true, lines: 'A B', end: true }, ll(520, 0))]), lines, s4);
  for (const l of lines) {
    const end = l.paths[0].at(-1);
    assert.ok(Math.abs(end[0] - o[0] - 520) < 2, 'ends at the bar');
    // The curve into the bar is as long as at any line's end (fourteen pitches), not squeezed into what the tail left of it.
    const pitch = SIZES.rail[4] + SIZES.gap[4];
    assert.ok(end[0] - l.paths[0].at(-17)[0] > 13 * pitch, 'a long, gentle lead-in');
  }
});

test('a heavy street does not run on past the corner its routes turn at', () => {
  const street = (cls, routes, hw, coords) => line({ mode: 'bus', cls, routes, n: 1, hw, zoom: 'far' }, coords);
  // The trunk comes in from the west and turns south; an hourly street carries straight on for 20 px.
  const drawn = busStreets(all([
    street('c5', '1 2 3', 5, [at(0, 0), at(200, 0)]),
    street('c5', '1 2 3', 5, [at(200, 0), at(200, 150)]),
    street('c60', '8', 60, [at(200, 0), at(220, 0)]),
    street('c60', '8 9', 60, [at(220, 0), at(220, -150)]),
  ]), sheet);
  assert.equal(drawn.find((s) => s.routes === '8').cls, 'c60', 'the short hourly street keeps its own weight');
  assert.ok(drawn.filter((s) => s.routes === '1 2 3').every((s) => s.cls === 'c5'));
});

test('a short stretch is made heavier only by a stretch of the same routes', () => {
  const corner = (x) => [[[x, 0], [x, -80]], [[x, 0], [x, 80]]].map((p) => st(p, { cls: 'c10', routes: '5' }));
  // Other routes: the 12 px hourly stretch after the heavy one is not drawn as heavy.
  const stub = evened([st([[0, 0], [100, 0]], { cls: 'c5', routes: '1 2 3' }), st([[100, 0], [112, 0]], { cls: 'c60', routes: '8' }), ...corner(112)], 32);
  assert.equal(stub.find((s) => s.routes === '8').cls, 'c60');
  // The same routes: a short stretch weighed a class apart is the measure's noise, either way.
  const same = evened([st([[0, 100], [100, 100]], { cls: 'c15', routes: '8' }), st([[100, 100], [112, 100]], { cls: 'c60', routes: '8' }), ...corner(112).map((s) => ({ ...s, path: s.path.map(([x, y]) => [x, y + 100]) }))], 32);
  assert.ok(same.filter((s) => s.routes === '8').every((s) => s.cls === 'c15'));
});

test('a weight gathered at a corner is not handed on down a route, and not taken from buses with another street to take', async () => {
  const { gathered } = await import('../scripts/lib/sheets.mjs');
  // One short heavy piece of a route does not make the rest of that route heavy.
  const route = gathered([st([[0, 0], [20, 0]], { routes: '28', cls: 'c15' }), st([[20, 0], [200, 0]], { routes: '28', cls: 'c60' }), st([[200, 0], [400, 0]], { routes: '28', cls: 'c60' })]);
  assert.deepEqual(route.map((s) => s.cls), ['c15', 'c60', 'c60']);
  // Each street is judged by the weight it came in with: the third takes the second's own, not the first's.
  const chain = gathered([st([[0, 50], [100, 50]], { routes: '1', cls: 'c5' }), st([[100, 50], [200, 50]], { routes: '1 2', cls: 'c30' }), st([[200, 50], [300, 50]], { routes: '1 2 3', cls: 'c60' })]);
  assert.deepEqual(chain.map((s) => s.cls), ['c5', 'c5', 'c30']);
  // Routes 1 and 2 meet a street with both and one more, but route 2 can also turn off: the wider street keeps its weight.
  const split = gathered([st([[0, 100], [100, 100]], { routes: '1 2', cls: 'c10' }), st([[100, 100], [200, 100]], { routes: '1 2 3', cls: 'c30' }), st([[100, 100], [100, 200]], { routes: '2 9', cls: 'c60' })]);
  assert.equal(split.find((s) => s.routes === '1 2 3').cls, 'c30');
});

test('a scroll or a pinch goes to the next sheet the way it was heading, and never back the way it came', async () => {
  const { settle } = await import('../public/js/sheets/settle.js');
  const zooms = SHEETS.map((s) => s.zoom);
  const [a, b, c, d] = zooms;
  assert.equal(settle(zooms, 0, a, a + 0.15), 1, 'one notch of a wheel is enough');
  assert.equal(settle(zooms, 1, b, b - 0.15), 0, 'and one notch back');
  assert.equal(settle(zooms, 0, a, a + 0.05), 0, 'a slip changes nothing');
  assert.equal(settle(zooms, 0, a, a + 0.2, { least: 0.25 }), 0, 'a pinch has to be firmer');
  assert.equal(settle(zooms, 1, a + 0.9, a + 1.1), 1, 'caught on its way to a sheet, a scroll the same way carries on to it');
  assert.equal(settle(zooms, 1, a + 0.9, a + 0.7), 0, 'and a scroll the other way turns back');
  assert.equal(settle(zooms, 2, c - 0.05, c - 0.2), 1, 'a map all but arrived has arrived');
  assert.equal(settle(zooms, 0, a, b + 0.3), 1, 'a little past a sheet rests on it');
  assert.equal(settle(zooms, 0, a, b + 0.8), 2, 'well past, it goes on to the next');
  assert.equal(settle(zooms, 0, a, a - 0.4), 0);
  assert.equal(settle(zooms, 3, d, d + 0.4), 3);
});

test('a list too long for one row is stacked in two beside a straight street, turned the way the street runs', async () => {
  const { stacked } = await import('../scripts/lib/sheets.mjs');
  const { sheetStyle } = await import('../public/js/sheets/style.js');
  assert.deepEqual(stacked('1 2 3 4 15L 83'), ['1, 2, 3,', '4, 15L, 83']);
  assert.deepEqual(stacked('7'), ['7']);
  const one = { routes: '1 2 3 4 5 6', cls: 'c15', n: 6, path: [[0, 0], [70, 0]] };
  const width = (s, rows = 1) => (rows > 1 ? 60 : 110);
  const [run] = labelRuns([one], 200, width);
  assert.equal(run.rows, 2, 'one row needs 110 and the street is 70 long: two rows');
  assert.equal(labelRuns([{ ...one, path: [[0, 0], [50, 0]] }], 200, width).length, 0, 'too short for two rows as well: no label');
  assert.equal(labelRuns([{ ...one, path: [[0, 0], [150, 0]] }], 200, width)[0].rows, 1, 'one row where it fits');
  // On a bend the rows would leave the street: no stacked label there.
  assert.equal(labelRuns([{ ...one, path: [[0, 0], [35, 12], [70, 0]] }], 200, width).length, 0);
  for (const theme of ['light', 'dark']) {
    const layer = sheetStyle(theme).layers.find((l) => l.id === 'bus-stack-2');
    assert.equal(layer.layout['symbol-placement'] ?? 'point', 'point');
    assert.deepEqual(layer.layout['text-rotate'], ['get', 'angle']);
    assert.equal(layer.layout['text-rotation-alignment'], 'map');
  }
});

test('a line does not end at a station while another of its stations lies beyond, however near the end of the track', () => {
  // The widest sheet: the last two stations are 12 px apart, nearer than three pitches.
  const s1 = SHEETS[0];
  const o1 = toPx([-105, 39.75], s1.zoom);
  const at1 = (x, y) => toLonLat([o1[0] + x, o1[1] + y], s1.zoom);
  const two = (route, color) => line({ mode: 'rail', route, color, slot: 0 }, [at1(-300, 0), at1(40, 0)]);
  const lines = railLines(all([two('E', '#552683'), two('R', '#C4D600')]), s1);
  const marks = stationMarks(all([
    point({ id: 1, name: 'City', served: true, lines: 'E R' }, at1(28, 0)),
    point({ id: 2, name: 'Gate', served: true, lines: 'E R', end: true }, at1(40, 0)),
  ]), lines, s1);
  const ending = (name) => marks.find((m) => m.name === name).bars.flatMap((b) => b.ending ?? []).map((e) => e.route).sort();
  assert.deepEqual(ending('City'), [], 'nothing ends at the station before the last');
  assert.deepEqual(ending('Gate'), ['E', 'R']);
});

test('the curve into a last station never reaches back past the station before: that bar stays on its line', () => {
  // The widest sheet. The track doglegs through City 30 px before it ends at Gate.
  const s1 = SHEETS[0];
  const o1 = toPx([-105, 39.75], s1.zoom);
  const at1 = (x, y) => toLonLat([o1[0] + x, o1[1] + y], s1.zoom);
  const rail = line({ mode: 'rail', route: 'E', color: '#552683', slot: 0 }, [at1(-300, 0), at1(0, 0), at1(10, 30), at1(40, 30)]);
  const lines = railLines(all([rail]), s1);
  const marks = stationMarks(all([
    point({ id: 1, name: 'City', served: true, lines: 'E' }, at1(10, 30)),
    point({ id: 2, name: 'Gate', served: true, lines: 'E', end: true }, at1(40, 30)),
  ]), lines, s1);
  const city = marks.find((m) => m.name === 'City');
  const mid = [(city.ends[0][0] + city.ends[1][0]) / 2, (city.ends[0][1] + city.ends[1][1]) / 2];
  assert.ok(nearest(lines[0].paths[0], mid).d < 1, `the line runs under the bar, not ${nearest(lines[0].paths[0], mid).d.toFixed(1)} px from it`);
});

test('a last station whose neighbour is closer than its name is tall is named beyond the end of the line', () => {
  const s1 = SHEETS[0];
  const o1 = toPx([-105, 39.75], s1.zoom);
  const at1 = (x, y) => toLonLat([o1[0] + x, o1[1] + y], s1.zoom);
  const named = (cityAt) => {
    const lines = railLines(all([line({ mode: 'rail', route: 'E', color: '#552683', slot: 0 }, [at1(0, -300), at1(0, 40)])]), s1);
    const marks = stationMarks(all([
      point({ id: 1, name: 'City', served: true, lines: 'E' }, at1(0, cityAt)),
      point({ id: 2, name: 'Gate/Park', served: true, lines: 'E', end: true }, at1(0, 40)),
    ]), lines, s1);
    return names(marks, lines, [], s1).find((n) => n.mark.name === 'Gate/Park');
  };
  // City 12 px before the end: a two-row name beside the bar would stand beside City too.
  assert.equal(named(28).anchor, 'top', 'the name hangs below the end of a line heading down the sheet');
  // With the station before far off, the name stands beside its bar as everywhere else.
  assert.equal(named(-150).anchor, 'left');
});

test('a bend smaller than a line is wide is drawn straight; a real turn keeps its place; the pack moves as one', () => {
  const s1 = SHEETS[0];
  const pitch = SIZES.rail[s1.id] + SIZES.gap[s1.id];
  const o1 = toPx([-105, 39.75], s1.zoom);
  const at1 = (x, y) => toLonLat([o1[0] + x, o1[1] + y], s1.zoom);
  const drawn = (track, slot = 0) => railLines(all([line({ mode: 'rail', route: 'E', color: '#552683', slot }, track.map(([x, y]) => at1(x, y)))]), s1)[0]
    .paths[0].map((p) => [p[0] - o1[0], p[1] - o1[1]]);
  const without = (track) => {
    const keep = SIZES.bend;
    SIZES.bend = 1e-9;
    try { return drawn(track); } finally { SIZES.bend = keep; }
  };
  // The track swings 6 px each way within 36 px of a long straight run.
  const wiggle = [[0, -300], [0, -30], [-6, -12], [6, 6], [0, 24], [0, 300]];
  const swing = (path) => Math.max(...path.map((p) => Math.abs(p[0])));
  assert.ok(swing(without(wiggle)) > 1.5, 'the wiggle shows when only rounded over three line widths');
  assert.ok(swing(drawn(wiggle)) < 0.75, `the line runs straight, not ${swing(drawn(wiggle)).toFixed(2)} px side to side`);
  const [first, second] = [drawn(wiggle), drawn(wiggle, 1)];
  for (const p of second) assert.ok(Math.abs(nearest(first, p).d - pitch) < 0.25, 'a line beside it stays one place over all the way');
  // A dogleg 30 px across is a real turn: the line still makes it where the track does.
  const dogleg = [[0, -300], [0, -15], [30, 15], [30, 300]];
  const [turn, was] = [drawn(dogleg), without(dogleg)];
  assert.ok(nearest(turn, [15, 0]).d < 1, 'it crosses half way where the track does');
  for (const p of turn) assert.ok(nearest(was, p).d <= SIZES.bend * pitch + 0.5, 'and is nowhere moved further than a bend may be');
  // A track that swings one way and ends the other arrives at its end the way it was heading.
  const hook = drawn([[0, -300], [0, -30], [-6, -12], [4, 0]]);
  assert.deepEqual(hook.at(-1).map((v) => Math.round(v)), [4, 0], 'the end stays where the track ends');
  assert.ok(Math.min(...hook.map((p) => p[0])) > -0.5, 'with no swing the other way first');
});

test('a name that cannot sit right beside its bar stands off only as far as it must', () => {
  const s1 = SHEETS[0];
  const o1 = toPx([-105, 39.75], s1.zoom);
  const at1 = (x, y) => toLonLat([o1[0] + x, o1[1] + y], s1.zoom);
  const lines = railLines(all([line({ mode: 'rail', route: 'E', color: '#552683', slot: 0 }, [at1(0, -300), at1(0, 300)])]), s1);
  const marks = stationMarks(all([point({ id: 1, name: 'City', served: true, lines: 'E' }, at1(0, 0))]), lines, s1);
  // A quiet street runs 7 px to each side of the line, where a name right beside the bar would sit.
  const streets = [-7, 7].map((x) => st([[o1[0] + x, o1[1] - 100], [o1[0] + x, o1[1] + 100]], { cls: 'c30', hw: 30 }));
  const off = (n) => Math.min(...marks[0].ends.map((p) => Math.hypot(Math.max(n.box[0] - p[0], 0, p[0] - n.box[2]), Math.max(n.box[1] - p[1], 0, p[1] - n.box[3]))));
  const [clear, beside] = [names(marks, lines, [], s1)[0], names(marks, lines, [], s1, streets)[0]];
  assert.ok(off(beside) > off(clear), 'the name moves off the street');
  assert.ok(off(beside) < 11, `but no further than it must: ${off(beside).toFixed(1)} px`);
});

test('where a line at the side of a pack ends, the lines beside it carry straight on; where one in the middle ends, the others close up', () => {
  const s1 = SHEETS[0];
  const pitch = SIZES.rail[s1.id] + SIZES.gap[s1.id];
  const o1 = toPx([-105, 39.75], s1.zoom);
  const at1 = (x, y) => toLonLat([o1[0] + x, o1[1] + y], s1.zoom);
  // Three lines run down the sheet on one track. T ends 5 px past where the data moves the others over.
  const piece = (route, slot, from, to) => line({ mode: 'rail', route, color: '#552683', slot }, [at1(0, from), at1(0, to)]);
  const drawn = (pieces) => new Map(railLines(all(pieces), s1).map((l) => [l.route, l.paths[0].map((p) => p[0] - o1[0])]));
  // T at the side: the data centres E and R on the track from there on.
  const side = drawn([piece('T', -1, -300, 5), piece('E', 0, -300, 0), piece('E', -0.5, 0, 300), piece('R', 1, -300, 0), piece('R', 0.5, 0, 300)]);
  const spread = (xs) => Math.max(...xs) - Math.min(...xs);
  assert.ok(spread(side.get('E')) < 0.3, `E runs straight past the end of T, not ${spread(side.get('E')).toFixed(1)} px over`);
  assert.ok(spread(side.get('R')) < 0.3, 'and so does R');
  assert.ok(Math.abs(Math.abs(side.get('E')[0] - side.get('R')[0]) - pitch) < 0.3, 'one place apart');
  // T in the middle: C and E each move half a place in, and meet.
  const middle = drawn([piece('T', 0, -300, 5), piece('C', -1, -300, 0), piece('C', -0.5, 0, 300), piece('E', 1, -300, 0), piece('E', 0.5, 0, 300)]);
  for (const route of ['C', 'E']) assert.ok(Math.abs(spread(middle.get(route)) - pitch / 2) < 0.3, `${route} closes up half a place`);
});

test("a name level with another station's bar, and not with its own, reads as the other's", () => {
  const bar = (x, y) => [[x - 2.5, y], [x, y], [x + 2.5, y]];
  const [mine, before] = [bar(0, 0), bar(-11, -25)];
  // Up and to the right of its own bar, level with the bar of the station before: it is
  // nearer its own (15 px against 20), and still reads as the other's.
  assert.ok(strayed([12, -34, 98, -12], mine, [before]));
  // Beside its own bar it is its own, however near the other.
  assert.ok(!strayed([9, -11, 95, 11], mine, [before]));
  // Up on the diagonal with no bar level with it, it is still its own.
  assert.ok(!strayed([12, -34, 98, -12], mine, [bar(-30, -70)]));
  // Level with a bar far across the sheet is no confusion.
  assert.ok(!strayed([12, -34, 98, -12], mine, [bar(-80, -25)]));
  // And nearer another bar than its own it is the other's.
  assert.ok(strayed([12, -34, 98, -12], mine, [bar(14, -40)]));
});
