// Things hidden under or sitting on other things (qa/drawn/covered.mjs): a bus
// street under the rail along it, a stop dot on a rail line it does not serve,
// a bus line through a hall, a rail-only stop drawn as a bus stop, and a rail
// line under a bus line, on made-up geometry at zoom 16 in Denver (0.92 m per
// px there) -- no browser, no data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toWorld } from '../qa/drawn/mercator.mjs';
import { APPLIES_FROM, busInHall, coveredFaults, mergeCovered, railOnlyStops, railUnderBus, stopsOnRail, underRail } from '../qa/drawn/covered.mjs';

const Z = 16;
const [X, Y] = toWorld([-104.99, 39.74], Z);
const pt = (x, y) => [X + x, Y + y];

let n = 0;
// A bus street the way the model gives one: mode bus, routes on the feature.
const bus = (routes, part, width = 8) => ({ layer: 'street', source: 'streets', index: n++, mode: 'bus', properties: { routes, mode: 'bus' }, parts: [part], drawn: [part], drawnWidth: width, width, opacity: 1, offset: 0, cap: 'round' });
// A rail line: its casing is the widest stroke, as the style draws it.
const rail = (route, part, width = 12) => ({ layer: 'rail-casing', source: 'routes', index: n++, route, mode: 'rail', properties: { route, mode: 'rail' }, parts: [part], drawn: [part], drawnWidth: width, width, opacity: 1, offset: 0, cap: 'round' });
const stop = (id, at, lines, name = `Stop ${id}`) => ({ kind: 'circle', layer: 'stops', source: 'stops', index: id, at, radius: 3.3, stroke: 1.2, properties: { id, name, lines } });
const zoom = (lines, marks = [], areas = []) => ({ z: Z, lines, marks, areas });

const along = (y, from = 0, to = 200) => [pt(from, y), pt(to, y)];

test('a bus street drawn under the rail along it is reported, with the share and the length', () => {
  const found = underRail(zoom([bus('15', along(0)), rail('A', along(2))]));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'under-rail');
  assert.equal(found[0].route, '15');
  assert.deepEqual(found[0].rail, ['A']);
  assert.ok(found[0].share > 0.95, `share ${found[0].share}`);
  assert.ok(found[0].lengthM > 150 && found[0].lengthM < 200, `length ${found[0].lengthM}`);
});

test('the rail is drawn over the bus only if it comes later in the style', () => {
  // The same strokes with the bus drawn last: the bus is not under anything.
  assert.deepEqual(underRail(zoom([rail('A', along(2)), bus('15', along(0))])), []);
});

test('a bus street that only crosses the rail is not reported', () => {
  const crossing = bus('15', [pt(100, -150), pt(100, 150)]);
  assert.deepEqual(underRail(zoom([crossing, rail('A', along(0))])), []);
});

test('a bus street that meets the rail at 45 degrees is not along it', () => {
  const diagonal = bus('15', [pt(0, -200), pt(200, 0)], 12);
  assert.deepEqual(underRail(zoom([diagonal, rail('A', along(0, -100, 300))])), []);
});

test('a bus street drawn beside the rail, clear of its casing, is not reported', () => {
  assert.deepEqual(underRail(zoom([bus('15', along(30)), rail('A', along(0))])), []);
});

test('a bus street that only touches the rail casing is not hidden', () => {
  // Edge to edge: 6 + 4 px between centrelines, the strokes just meet.
  assert.deepEqual(underRail(zoom([bus('15', along(10)), rail('A', along(0))])), []);
});

test('a bus street more than half under the rail is reported at its share', () => {
  // Bus 12 px wide, rail casing 12 px wide, centrelines 4 px apart: 8 of 12 px covered.
  const found = underRail(zoom([bus('15', along(0), 12), rail('A', along(4), 12)]));
  assert.equal(found.length, 1);
  assert.ok(found[0].share > 0.55 && found[0].share < 0.8, `share ${found[0].share}`);
});

test('a bus street a third under the casing only touches it and is not reported', () => {
  // Centrelines 8 px apart: 4 of 12 px covered.
  assert.deepEqual(underRail(zoom([bus('15', along(0), 12), rail('A', along(8), 12)])), []);
  assert.equal(underRail(zoom([bus('15', along(0), 12), rail('A', along(8), 12)]), { minShare: 0.25 }).length, 1);
});

test('a stretch shorter than 40 m is not reported', () => {
  // 30 px is 28 m.
  assert.deepEqual(underRail(zoom([bus('15', along(0)), rail('A', along(0, 80, 110))])), []);
  assert.equal(underRail(zoom([bus('15', along(0)), rail('A', along(0, 80, 160))])).length, 1);
});

test('a stretch cut into street features at junctions is one stretch', () => {
  // Three pieces of 25 m each: none is 40 m alone, together they are 75 m.
  const pieces = [0, 27, 54].map((x) => bus('15', along(0, x, x + 27)));
  const found = underRail(zoom([...pieces, rail('A', along(0, -20, 100))]));
  assert.equal(found.length, 1);
  assert.ok(found[0].lengthM > 60, `length ${found[0].lengthM}`);
});

// The same ground (a bus street 2 m from the rail, 250 m long) at any zoom.
const ground = (z, dLat) => [toWorld([-104.99, 39.74 + dLat], z), toWorld([-104.9871, 39.74 + dLat], z)];
const sceneAt = (z) => ({ z, lines: [bus('15', ground(z, 0)), rail('A', ground(z, 0.00002))], marks: [], areas: [] });

test('the bus is judged from the zoom the rule applies from', () => {
  const kinds = (z, opts) => coveredFaults(sceneAt(z), opts).filter((f) => f.kind === 'under-rail').length;
  assert.equal(kinds(APPLIES_FROM['under-rail']), 1);
  assert.equal(kinds(APPLIES_FROM['under-rail'] - 1), 0);
  assert.equal(kinds(APPLIES_FROM['under-rail'] - 1, { applyFrom: {} }), 1);
});

test('a stop dot on a rail line it does not serve is reported', () => {
  const found = stopsOnRail(zoom([rail('A', along(0))], [stop(1, pt(100, 1), '15')]));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'stop-on-rail');
  assert.deepEqual(found[0].rail, ['A']);
});

test('a stop dot beside the rail, or on a rail line it serves, is not reported', () => {
  assert.deepEqual(stopsOnRail(zoom([rail('A', along(0))], [stop(1, pt(100, 25), '15')])), []);
  assert.deepEqual(stopsOnRail(zoom([rail('A', along(0))], [stop(1, pt(100, 1), '15 A')])), []);
});

test('a stop dot only half on the rail is not reported when under half of it is', () => {
  // Rail casing 12 px wide: its edge is 6 px from the line; the dot is 4.5 px in radius.
  assert.deepEqual(stopsOnRail(zoom([rail('A', along(0))], [stop(1, pt(100, 9), '15')])), []);
  assert.equal(stopsOnRail(zoom([rail('A', along(0))], [stop(1, pt(100, 3), '15')])).length, 1);
});

const hall = { layer: 'bus-terminal', source: 'terminals', name: 'Test Hall', parts: [[pt(100, -50), pt(200, -50), pt(200, 50), pt(100, 50), pt(100, -50)]] };

test('a bus line drawn through a hall is reported', () => {
  const found = busInHall(zoom([bus('15', along(0, 0, 300))], [], [hall]));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'bus-in-hall');
  assert.ok(Math.abs(found[0].insidePx - 100) < 0.01, `inside ${found[0].insidePx}`);
  assert.equal(found[0].hall, 'Test Hall');
});

test('a bus line that ends at the hall edge is not reported, nor one a pixel inside', () => {
  assert.deepEqual(busInHall(zoom([bus('15', along(0, 0, 100))], [], [hall])), []);
  assert.deepEqual(busInHall(zoom([bus('15', along(0, 0, 101))], [], [hall])), []);
  assert.equal(busInHall(zoom([bus('15', along(0, 0, 110))], [], [hall])).length, 1);
});

test('a bus line that passes outside the hall is not reported', () => {
  assert.deepEqual(busInHall(zoom([bus('15', along(80, 0, 300))], [], [hall])), []);
});

test('halls are read from the places given, drawn at this zoom or not', () => {
  const lines = [bus('15', along(0, 0, 300))];
  assert.deepEqual(busInHall(zoom(lines)), []);
  assert.equal(busInHall(zoom(lines), { places: { areas: [hall] } }).length, 1);
});

test('a stop that only trains call at, drawn as a bus stop, is reported', () => {
  const lines = [rail('A', along(0)), bus('15', along(60))];
  const found = railOnlyStops(zoom(lines, [stop(1, pt(100, 40), 'A')]));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'rail-only-stop');
  assert.equal(found[0].route, 'A');
});

test('a bus stop, a shared stop and an unlisted stop are not rail-only', () => {
  const lines = [rail('A', along(0)), bus('15', along(60))];
  assert.deepEqual(railOnlyStops(zoom(lines, [stop(1, pt(100, 60), '15'), stop(2, pt(120, 60), 'A 15'), stop(3, pt(140, 60), '')])), []);
});

test('a stop drawn by another layer than the stops layer is not a bus stop', () => {
  const lines = [rail('A', along(0))];
  assert.deepEqual(railOnlyStops(zoom(lines, [{ kind: 'icon', layer: 'stations', source: 'stations', at: pt(100, 0), properties: { lines: 'A' } }])), []);
});

test('a rail line drawn under a bus line is reported', () => {
  const found = railUnderBus(zoom([rail('A', along(0), 6), bus('15', along(0), 10)]));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'rail-under-bus');
  assert.equal(found[0].route, 'A');
  assert.deepEqual(found[0].bus, ['15']);
});

test('a rail line drawn over the bus, as the style draws it, is not hidden', () => {
  assert.deepEqual(railUnderBus(zoom([bus('15', along(0), 10), rail('A', along(0), 6)])), []);
  assert.deepEqual(railUnderBus(zoom([bus('15', along(0)), rail('A', along(2))])), []);
});

test('the same stretch seen at several zooms is one finding listing them', () => {
  const found = [15, 15.5, 16].flatMap((z) => underRail(sceneAt(z)).map((f) => ({ ...f, zoom: z })));
  assert.equal(found.length, 3);
  const merged = mergeCovered(found);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].zooms, [15, 15.5, 16]);
  assert.equal(merged[0].route, '15');
  assert.deepEqual(merged[0].rail, ['A']);
  assert.ok(Math.abs(merged[0].lat - 39.74) < 0.001 && Math.abs(merged[0].lon + 104.9886) < 0.002);
});

test('two stretches far apart stay two findings, and two kinds stay two', () => {
  const lines = [bus('15', along(0)), rail('A', along(2)), bus('15', along(500)), rail('A', along(502))];
  const faults = underRail(zoom(lines)).map((f) => ({ ...f, zoom: Z }));
  assert.equal(mergeCovered(faults).length, 2);
  const stops = stopsOnRail(zoom(lines, [stop(1, pt(100, 2), '15')])).map((f) => ({ ...f, zoom: Z }));
  assert.equal(mergeCovered([...faults, ...stops]).length, 3);
});
