// The four sheets' drawing rules (scripts/lib/sheets.mjs), on small made-up networks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, SIZES, toPx, toLonLat, length, resample, chained, railLines, stationMarks, letters, names, busStreets, halls, labelled, nearest, drawSheet, inkOn, shortened } from '../scripts/lib/sheets.mjs';

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
  const main = drawn.find((s) => length(s.path) > 250).path;
  const loop = drawn.find((s) => s.routes === '1' && s.path.some((p) => p[1] - origin3[1] < -50));
  for (const end of [loop.path[0], loop.path.at(-1)]) assert.ok(nearest(main, end).d < 1, 'the loop reaches the street');
  const stub = drawn.find((s) => s.routes === '2');
  assert.ok(Math.min(...[stub.path[0], stub.path.at(-1)].map((p) => nearest(main, p).d)) > 10, 'the other route is not joined on');
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
