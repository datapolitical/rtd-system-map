// The four sheets' drawing rules (scripts/lib/sheets.mjs), on small made-up networks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, SIZES, toPx, toLonLat, length, resample, chained, railLines, stationMarks, letters, names, busStreets, halls, labelled, nearest, drawSheet, inkOn, shortened, noded, pruned, unlooped, squared, unjogged, evened } from '../scripts/lib/sheets.mjs';

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

test('along one street only blocks well apart carry its label; another street has its own', () => {
  const st = (x0, x1, y = 0) => ({ routes: '1', path: [[x0, y], [x1, y]] });
  const streets = [st(0, 100), st(100, 220), st(220, 300), st(300, 420), st(0, 90, 50)];
  const picked = labelled(streets, 200);
  assert.deepEqual(streets.map((s) => picked.has(s)), [false, true, false, true, true]);
  // A block too short to hold its label gives its turn to one that can.
  assert.deepEqual(streets.map((s) => labelled(streets.slice(0, 2), 200, () => 110).has(s)), [false, true, false, false, false]);
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
  // Two streets meet inside the hall; a third crosses above it and carries on.
  const drawn = busStreets(all([street('1', [at3(0, 0), at3(130, 0)]), street('2', [at3(130, -80), at3(130, 0)]), street('3', [at3(150, -80), at3(150, 80)])]), near, walls);
  const inside = (p) => p[0] - origin3[0] > 101 && p[0] - origin3[0] < 159 && Math.abs(p[1] - origin3[1]) < 9;
  assert.ok(!drawn.filter((s) => s.routes !== '3').some((s) => resample(s.path, 1).some(inside)), 'streets that go indoors stop at the walls');
  assert.equal(drawn.filter((s) => s.routes !== '3' && [s.path[0], s.path.at(-1)].some((p) => nearest(walls[0].ring, p).d < 0.5)).length, 2, 'each on the side it comes from');
  assert.ok(drawn.some((s) => s.routes === '3' && Math.abs(length(s.path) - 160) < 1), 'the street that crosses is whole');
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
    const rings = layers.filter((l) => l.source === 'stops' && l.type === 'circle');
    for (const ring of rings) {
      const n = ring.id.split('-').pop();
      const keep = layers.findIndex((l) => l.id === `keep-off-stop-${n}`);
      const numbers = layers.findIndex((l) => l.id === `bus-number-${n}`);
      assert.ok(keep > numbers && numbers >= 0, `sheet ${n}: the stops' marks are placed first (MapLibre places the last layer first)`);
      const k = layers[keep];
      assert.equal(k.source, 'stops');
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
