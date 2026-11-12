// The four sheets' drawing rules (scripts/lib/sheets.mjs), on small made-up networks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, SIZES, toPx, toLonLat, length, resample, chained, railLines, stationMarks, letters, names, busStreets, drawSheet, inkOn, shortened } from '../scripts/lib/sheets.mjs';

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
