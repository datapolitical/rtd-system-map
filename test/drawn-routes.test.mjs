// Routes followed across their pieces (qa/drawn/routes.mjs): planted breaks,
// hooks and rail ends of the size seen on the map, and the look-alikes that
// are not faults (a route that turns off a street whose line carries on, a
// line under another, a terminus, two directions side by side). No browser,
// no data. Screen px at zoom 17 near the equator: 30 m is about 50 px.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeFaults } from '../qa/drawn/routes.mjs';

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
const at = (lines, marks = []) => ({ z: 17, lines, marks });
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
