// Routes followed across their pieces (qa/drawn/routes.mjs): planted breaks,
// hooks, ticks and rail ends of the size seen on the map, and the look-alikes
// that are not faults (a route that turns off a street whose line carries on,
// a line under another, a terminus, two directions side by side, a bus line
// that ends at a terminal's hall, a short end at the place it serves). No
// browser, no data. Screen px at zoom 17 near the equator: 30 m is about 50
// px, 60 m about 100 px, 20 m about 33 px.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openModel } from '../qa/drawn/model.mjs';
import { PLACE_SOURCES, routeFaults } from '../qa/drawn/routes.mjs';

const O = 2 ** 25; // the middle of the world at zoom 17
const P = (x, y) => [O + x, O + y];
let next = 0;
// A street drawn for the routes on it: one feature per street.
const street = (routes, parts, { width = 6, cap = 'butt', layer = 'street', index = next++ } = {}) => ({
  layer, source: 'streets', index, properties: { routes }, parts, drawn: parts, width, drawnWidth: width, cap,
});
const railLine = (route, parts, { width = 6, cap = 'butt', index = next++ } = {}) => ({
  layer: 'rail', source: 'routes', index, route, mode: 'rail', properties: { route, mode: 'rail' }, parts, drawn: parts, width, drawnWidth: width, cap,
});
const at = (lines, marks = [], areas = []) => ({ z: 17, lines, marks, areas });
const kinds = (faults) => faults.map((f) => f.kind).sort();

test('a route cut across a street: two ends face each other over empty land', () => {
  const f = routeFaults(at([street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(112, 0), P(220, 0)]])]));
  assert.deepEqual(kinds(f), ['gap', 'gap']);
  assert.match(f[0].msg, /15 on street stops 12\.0 px short/);
});

test('a line that stops short of the street its route turns onto', () => {
  // Route 20 runs south and should turn onto the east-west street; it stops 20 px short.
  const f = routeFaults(at([street('20', [[P(100, -200), P(100, -20)]]), street('20 9', [[P(0, 0), P(300, 0)]], { width: 8 })]));
  assert.deepEqual(kinds(f), ['gap']);
});

test('a route that turns off a street whose line carries on is not a break', () => {
  // Route 76 ends where the street's line carries on for route 9: the end is
  // under that line, and 76 picks up on the cross street.
  const lines = [street('76 9', [[P(0, 0), P(100, 0)]]), street('9', [[P(100, 0), P(220, 0)]]), street('76', [[P(100, 4), P(100, 200)]])];
  assert.deepEqual(routeFaults(at(lines)), []);
});

test('another line drawn over the land hides the break', () => {
  const lines = [street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(112, 0), P(220, 0)]]), street('40', [[P(106, -100), P(106, 100)]], { width: 10 })];
  assert.deepEqual(routeFaults(at(lines)).filter((f) => f.kind === 'gap'), []);
});

test('the street\'s own strands do not hide its end', () => {
  // A strand layer draws the same street feature: it is the same piece.
  const a = street('15 16', [[P(0, 0), P(100, 0)]], { index: 900 });
  const strand = { ...a, layer: 'street-strand-1', drawnWidth: 1, width: 1 };
  const f = routeFaults(at([a, strand, street('15 16', [[P(112, 0), P(220, 0)]])]));
  assert.ok(f.some((x) => x.kind === 'gap'));
});

test('a terminus is not a gap, and nor are two directions ending side by side', () => {
  assert.deepEqual(routeFaults(at([street('15', [[P(0, 0), P(100, 0)]])])), []);
  // Both directions end together, 10 px apart, pointing the same way.
  const f = routeFaults(at([street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(0, 10), P(100, 10)]])]));
  assert.deepEqual(f.filter((x) => x.kind === 'gap'), []);
});

test('ends 60 px apart are a terminus and a start, not a gap; ends joined exactly are not a gap', () => {
  assert.deepEqual(routeFaults(at([street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(160, 0), P(260, 0)]])])), []);
  assert.deepEqual(routeFaults(at([street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(100, 0), P(200, 0)]])])), []);
});

test('caps count: round ends 5 px apart meet; butt ends 5 px apart leave 5 px of land', () => {
  const round = routeFaults(at([street('15', [[P(0, 0), P(100, 0)]], { cap: 'round' }), street('15', [[P(105, 0), P(200, 0)]], { cap: 'round' })]));
  assert.deepEqual(round, []);
  const butt = routeFaults(at([street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(105, 0), P(200, 0)]])]));
  assert.ok(butt.some((x) => x.kind === 'gap' && /5\.0 px short/.test(x.msg)), JSON.stringify(butt));
});

test('two parts of one feature are followed too', () => {
  const one = { ...street('15', [[P(0, 0), P(100, 0)], [P(110, 0), P(200, 0)]]) };
  assert.ok(routeFaults(at([one])).some((x) => x.kind === 'gap'));
});

test('a hook: the end turns back on itself', () => {
  // East 100 px, then back west-south-west for 12 px.
  const f = routeFaults(at([street('21', [[P(0, 0), P(100, 0), P(90, 6)]])]));
  assert.deepEqual(kinds(f), ['hook']);
  // A plain right-angle turn at the end is not a hook.
  assert.deepEqual(routeFaults(at([street('21', [[P(0, 0), P(100, 0), P(100, 12)]])])), []);
});

const stationMark = (lines, at, half = 8) => ({ kind: 'icon', layer: 'stations', source: 'stations', properties: { lines }, at, box: [at[0] - half, at[1] - half, at[0] + half, at[1] + half] });

test('a rail line that ends at its station\'s mark is fine; one carried past it overshoots', () => {
  // A station of line A at each end of it.
  const st = stationMark('A B', P(100, 0)), start = stationMark('A', P(-300, 0));
  assert.deepEqual(routeFaults(at([railLine('A', [[P(-300, 0), P(104, 0)]])], [start, st])), []);
  const f = routeFaults(at([railLine('A', [[P(-300, 0), P(140, 0)]])], [start, st]));
  assert.deepEqual(kinds(f), ['overshoot']);
  assert.match(f[0].msg, /32\.0 px past its station's mark/);
});

test('a rail line that ends with no station of its line near it dangles', () => {
  // A station of another line is near; none of line A's.
  const f = routeFaults(at([railLine('A', [[P(-300, 0), P(100, 0)]])], [stationMark('A', P(-300, 0)), stationMark('B', P(100, 0))]));
  assert.deepEqual(kinds(f), ['dangling']);
});

test('a rail line carried past its station overshoots even where another line runs on beside it', () => {
  const st = stationMark('A B', P(100, 0)), start = stationMark('A B', P(-300, 0));
  // Line B runs on along the same track; line A is carried 36 px past its station over it.
  const f = routeFaults(at([railLine('B', [[P(-300, 0), P(300, 0)]]), railLine('A', [[P(-300, 0), P(140, 0)]])], [start, st, stationMark('B', P(300, 0))]));
  assert.ok(f.some((x) => x.kind === 'overshoot' && /^A /.test(x.msg)), JSON.stringify(f));
});

// Terminal halls, and the places and stops a line end can have beside it.
const hall = (x0, y0, x1, y1) => ({ layer: 'bus-terminal', source: 'terminals', index: 0, name: 'Hall', parts: [[P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0)]] });
const markOf = (source, layer, where, half) => ({ kind: 'icon', layer, source, properties: {}, at: where, box: [where[0] - half, where[1] - half, where[0] + half, where[1] + half] });
const facilityMark = (where) => markOf('facilities', 'facilities', where, 8);
const stopMark = (where) => ({ ...markOf('stops', 'stops', where, 3), kind: 'circle', properties: { lines: '21' } });

test('a bus line that ends at a hall\'s edge is not a gap; the same ends with no hall still are', () => {
  // Route 15 has a piece to x=100 and one from x=140 (40 px apart, 24 m).
  const lines = [street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(140, 0), P(240, 0)]])];
  assert.deepEqual(kinds(routeFaults(at(lines))), ['gap', 'gap']);
  // A hall 2 px from the first end, with the second piece starting inside it.
  assert.deepEqual(routeFaults(at(lines, [], [hall(102, -30, 150, 30)])), []);
  // The end on the hall's edge, and inside it, are the same.
  assert.deepEqual(routeFaults(at(lines, [], [hall(100, -30, 150, 30)])), []);
  // 5 px from the hall is past what the rule allows: that end is still a gap.
  const f = routeFaults(at(lines, [], [hall(105, -30, 150, 30)]));
  assert.deepEqual(kinds(f), ['gap']);
  assert.match(f[0].msg, /15 on street stops/);
});

test('a hall the layer does not draw at this zoom still counts, through places', () => {
  const lines = [street('15', [[P(0, 0), P(100, 0)]]), street('15', [[P(140, 0), P(240, 0)]])];
  // Not in the zoom's own areas (z12 draws no halls); the model gives it as a place.
  assert.deepEqual(kinds(routeFaults(at(lines))), ['gap', 'gap']);
  assert.deepEqual(routeFaults(at(lines), { places: { marks: [], areas: [hall(102, -30, 150, 30)] } }), []);
});

test('a short end at a park-and-ride or station is not a hook; the same bend beside only a stop is', () => {
  const bend = street('21', [[P(0, 0), P(100, 0), P(90, 6)]]);
  assert.deepEqual(kinds(routeFaults(at([bend]))), ['hook']);
  // A facility mark 28 px (about 17 m) from the end: the route ends there.
  assert.deepEqual(routeFaults(at([bend], [facilityMark(P(110, 20))])), []);
  // A station mark the same way; a platform mark too.
  assert.deepEqual(routeFaults(at([bend], [stationMark('A', P(110, 20))])), []);
  assert.deepEqual(routeFaults(at([bend], [markOf('platforms', 'platforms', P(110, 20), 8)])), []);
  // A bus stop is not such a place.
  assert.deepEqual(kinds(routeFaults(at([bend], [stopMark(P(110, 20))]))), ['hook']);
  // A facility 85 px (51 m) away still is the place it serves; 160 px (96 m) away is too far.
  assert.deepEqual(routeFaults(at([bend], [facilityMark(P(175, 0))])), []);
  assert.deepEqual(kinds(routeFaults(at([bend], [facilityMark(P(250, 0))]))), ['hook']);
  // The hall of a terminal is a place too.
  assert.deepEqual(routeFaults(at([bend], [], [hall(100, 10, 140, 50)])), []);
});

test('a facility that is not in the zoom\'s marks still counts, through places', () => {
  const bend = street('21', [[P(0, 0), P(100, 0), P(90, 6)]]);
  assert.deepEqual(routeFaults(at([bend]), { places: { marks: [facilityMark(P(110, 20))], areas: [] } }), []);
  assert.deepEqual(kinds(routeFaults(at([bend], [facilityMark(P(110, 20))]), { places: { marks: [stopMark(P(110, 20))], areas: [] } })), ['hook']);
});

test('a 10 px stub off a junction is a tick; the same stub ending at a facility or a stop is not', () => {
  // Route 21 runs east-west; route 9 leaves it square and ends 10 px north.
  const main = street('21', [[P(-200, 0), P(200, 0)]]);
  const stub = street('9', [[P(0, 0), P(0, -10)]]);
  const f = routeFaults(at([main, stub]));
  assert.deepEqual(kinds(f), ['tick']);
  assert.match(f[0].msg, /^9 on street ends in a tick: it stands out 7\.0 px/);
  // The same stub ends at a Park-n-Ride, a station or a hall.
  assert.deepEqual(routeFaults(at([main, stub], [facilityMark(P(0, -20))])), []);
  assert.deepEqual(routeFaults(at([main, stub], [stationMark('9', P(0, -20))])), []);
  assert.deepEqual(routeFaults(at([main, stub], [], [hall(-10, -40, 10, -20)])), []);
  // ... or a stop within 20 m (33 px); a stop 40 px (24 m) or 80 px away is no help.
  assert.deepEqual(routeFaults(at([main, stub], [stopMark(P(0, -20))])), []);
  assert.deepEqual(routeFaults(at([main, stub], [stopMark(P(0, -38))])), []);
  assert.deepEqual(kinds(routeFaults(at([main, stub], [stopMark(P(0, -50))]))), ['tick']);
  assert.deepEqual(kinds(routeFaults(at([main, stub], [stopMark(P(0, -90))]))), ['tick']);
  // A Park-n-Ride 85 px (51 m) from the end is the place it serves; one 160 px (96 m) away is not.
  assert.deepEqual(routeFaults(at([main, stub], [facilityMark(P(0, -95))])), []);
  assert.deepEqual(kinds(routeFaults(at([main, stub], [facilityMark(P(0, -170))]))), ['tick']);
});

test('a stub is a tick only while it is short, square on, and free', () => {
  const main = street('21', [[P(-200, 0), P(200, 0)]]);
  // 30 px out is a short street, not a tick.
  assert.deepEqual(routeFaults(at([main, street('9', [[P(0, 0), P(0, -30)]])])), []);
  // 17 px out (14 px beyond the street's edge) is.
  assert.deepEqual(kinds(routeFaults(at([main, street('9', [[P(0, 0), P(0, -17)]])]))), ['tick']);
  // 4 px out is 1 px beyond the street's edge: nobody can see that. 5.5 px out (2.5 px beyond) can be seen.
  assert.deepEqual(routeFaults(at([main, street('9', [[P(0, 0), P(0, -4)]])])), []);
  assert.deepEqual(kinds(routeFaults(at([main, street('9', [[P(0, 0), P(0, -5.5)]])]))), ['tick']);
  // A stub leaving at a slant of 45 degrees is.
  assert.deepEqual(kinds(routeFaults(at([main, street('9', [[P(0, 0), P(8, -8)]])]))), ['tick']);
  // A line that ends 6 px past the end of another, alongside it, is not a stub off a junction.
  assert.deepEqual(routeFaults(at([street('21', [[P(-200, 0), P(100, 0)]]), street('21', [[P(-200, 4), P(106, 4)]], { width: 6 })])), []);
  // Another line drawn over the stub's end hides it.
  assert.deepEqual(routeFaults(at([main, street('9', [[P(0, 0), P(0, -10)]]), street('40', [[P(-50, -10), P(50, -10)]], { width: 8 })])).filter((x) => x.kind === 'tick'), []);
  // A hook is a hook, not also a tick.
  assert.deepEqual(kinds(routeFaults(at([main, street('9', [[P(0, 0), P(0, -10), P(2, -4)]])]))).filter((k) => k === 'tick'), []);
});

test('the model gives the marks and halls of a source whatever the zoom, which the drawn marks do not', async () => {
  const empty = { type: 'FeatureCollection', features: [] };
  const sources = JSON.parse(JSON.stringify({ flexride: empty, routes: empty, streets: empty, stations: empty, facilities: empty, terminals: empty, labels: empty, stops: empty }));
  sources.facilities.features.push({ type: 'Feature', properties: { id: 1, name: 'Hall Park-n-Ride', class: 'PNR', spaces: 100 }, geometry: { type: 'Point', coordinates: [-105.0, 39.7] } });
  sources.terminals.features.push({ type: 'Feature', properties: { id: '1', name: 'Hall', class: 'BUS', gates: 2, kind: 'bus_station', underground: 0 }, geometry: { type: 'Polygon', coordinates: [[[-105.0, 39.7], [-104.999, 39.7], [-104.999, 39.701], [-105.0, 39.701], [-105.0, 39.7]]] } });
  const model = await openModel({ theme: 'dark', data: sources, meta: { rail: [] }, tileCache: false });
  assert.deepEqual(model.zoom(12).marks.filter((m) => m.source === 'facilities'), [], 'park-and-ride marks are not drawn at z12');
  assert.deepEqual(model.zoom(12).areas.filter((a) => a.source === 'terminals'), [], 'halls are not drawn at z12');
  const there = model.places(12, PLACE_SOURCES);
  assert.equal(there.marks.filter((m) => m.source === 'facilities').length, 1);
  assert.equal(there.areas.filter((a) => a.source === 'terminals').length, 1);
  // A route that bends back at the facility's place is not in a hook at z12,
  // though nothing is drawn there yet.
  const [x, y] = model.places(12, ['facilities']).marks[0].at;
  const bend = street('21', [[[x - 300, y - 1.5], [x + 1, y - 1.5], [x - 0.5, y + 1.5]]]);
  const z12 = { z: 12, lines: [bend], marks: model.zoom(12).marks, areas: model.zoom(12).areas };
  assert.deepEqual(kinds(routeFaults(z12)), ['hook']);
  assert.deepEqual(routeFaults(z12, { places: there }), []);
});
