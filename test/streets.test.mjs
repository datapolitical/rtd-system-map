import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStreets, busStreets, rate } from '../scripts/lib/streets.mjs';

// Routes that meet only at a corner share no street: under this many metres.
const TOGETHER = 50;
import { classOf } from '../public/js/frequency.js';

// Made-up routes near (0, 0): a kilometer east is 1/111.32 of a degree.
// Each is one stretch, all day, with a weekday headway `wk`; busStreets
// takes its departures as evenly spaced when no cells were measured.
const KM = 1 / 111.32;
const at = ([x, y]) => [x * KM, y * KM];
const route = (name, path, wk = 15, tier = 'frequent') => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: path.map(at) },
  properties: { route: name, mode: 'bus', tier, wk },
});
const km = (f) => {
  const c = f.geometry.coordinates;
  let s = 0;
  for (let i = 1; i < c.length; i++) s += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]) / KM;
  return s;
};
const streets = (routes) => busStreets(routes, new Map(), { precision: 6 });
const withRoutes = (out, list) => out.filter((f) => f.properties.routes === list);

test('rate is the rider\'s: evenly spaced buses give their plain rate, a bunched pair about one', () => {
  const every15 = Array.from({ length: 24 }, (_, i) => 9 * 3600 + i * 900);
  assert.equal(Math.round(rate(every15) * 10) / 10, 4);
  const paired = every15.flatMap((t) => [t, t + 60]); // two routes a minute apart
  assert.ok(rate(paired) < 4.6, `pair reads ${rate(paired)} an hour, not 8`);
  const interleaved = every15.flatMap((t) => [t, t + 450]);
  assert.ok(rate(interleaved) > 7.5, `interleaved reads ${rate(interleaved)}`);
  assert.equal(rate([]), 0);
});

test('two routes on one street are one line with both buses counted', () => {
  // Every 15 and every 20 minutes, both leaving on the hour: the street has a
  // hole of 15 minutes in it, so it reads as every 15 (the rider's wait), and
  // the class says so.
  const out = streets([route('1', [[0, 0], [5, 0]], 15), route('2', [[0, 0], [5, 0]], 20, 'every30')]);
  assert.equal(out.length, 1);
  const p = out[0].properties;
  assert.equal(p.routes, '1 2');
  assert.equal(p.n, 2);
  assert.ok(p.bph > 3.5 && p.bph <= 4.5, `combined ${p.bph} an hour (4 and 3 apart, bunched on the hour)`);
  assert.equal(p.cls, classOf(p.bph));
  assert.ok(km(out[0]) > 4.9 && km(out[0]) < 5.1);
  const together = streets([route('1', [[0, 0], [5, 0]], 15), route('2', [[0, 0], [5, 0]], 15)]);
  assert.ok(together[0].properties.bph < 4.5, `bunched pair reads ${together[0].properties.bph}, about one route`);
  // Two every-30 routes that leave a minute apart stay every 30: the wait is
  // the long gap, so the street does not read as every 15.
  const bunched30 = streets([route('1', [[0, 0], [5, 0]], 30), route('2', [[0, 0], [5, 0]], 30, 'every30')]);
  assert.ok(bunched30[0].properties.bph <= 2.2, `two every-30s leaving together read ${bunched30[0].properties.bph} an hour`);
});

test('a one-way pair a block apart stays two streets, touching at an end or not', () => {
  // Route 1 east on y=0, route 2 on y=0.12 km (a block north); they meet
  // only at the west end, where both start from the same corner.
  const out = streets([route('1', [[0, 0], [4, 0]], 15), route('2', [[0, 0], [0, 0.12], [4, 0.12]], 15)]);
  const shared = out.filter((f) => f.properties.n > 1);
  const sharedKm = shared.reduce((s, f) => s + km(f), 0);
  assert.ok(sharedKm * 1000 < TOGETHER, `shared for ${(sharedKm * 1000).toFixed(0)} m`);
  assert.ok(withRoutes(out, '1').length && withRoutes(out, '2').length, 'each street drawn on its own');
});

test('a crossing does not join two streets', () => {
  const out = streets([route('1', [[0, 0], [4, 0]], 15), route('2', [[2, -2], [2, 2]], 15)]);
  assert.ok(out.every((f) => f.properties.n === 1), JSON.stringify(out.map((f) => f.properties)));
});

test('a branch starts on the trunk and the trunk is drawn once', () => {
  const out = streets([route('1', [[0, 0], [6, 0]], 15), route('2', [[0, 0], [3, 0], [3, 3]], 15)]);
  const trunk = withRoutes(out, '1 2');
  assert.equal(trunk.length, 1, 'one shared run');
  assert.ok(km(trunk[0]) > 2.8 && km(trunk[0]) < 3.3, `trunk ${km(trunk[0])} km`);
  const branch = withRoutes(out, '2');
  assert.equal(branch.length, 1);
  const end = trunk[0].geometry.coordinates.at(-1);
  const start = branch[0].geometry.coordinates[0];
  const gap = Math.hypot(end[0] - start[0], end[1] - start[1]) / KM;
  assert.ok(gap * 1000 < 45, `branch starts ${(gap * 1000).toFixed(0)} m from the trunk's end`);
  // Each street drawn once: total drawn length is about the network's.
  const total = out.reduce((s, f) => s + km(f), 0);
  assert.ok(total > 8.8 && total < 9.4, `drawn ${total} km of a 9 km network`);
});

test('part-time routes are listed but add no buses', () => {
  const out = streets([route('1', [[0, 0], [5, 0]], 30, 'every30'), route('2', [[0, 0], [5, 0]], 30, 'peak')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].properties.routes, '1 2');
  assert.equal(out[0].properties.n, 1);
  assert.ok(out[0].properties.bph < 2.5, `${out[0].properties.bph} an hour`);
});

// The street graph (#80): RTD's lines are joined where they meet.
const at6 = (f) => f.geometry.coordinates.map(([x, y]) => [Math.round((x / KM) * 1000), Math.round((y / KM) * 1000)]);

test('one street drawn twice with its vertices in different places is one line', () => {
  // Route 2 has vertices every 700 m along route 1's street, a metre off it.
  const out = streets([route('1', [[0, 0], [5, 0]], 15), route('2', [[0, 0], [0.7, 0.001], [1.4, 0], [2.1, -0.001], [5, 0]], 15)]);
  assert.equal(out.length, 1, out.map((f) => f.properties.routes).join(' | '));
  assert.equal(out[0].properties.routes, '1 2');
});

test('a route leaving a shared street starts exactly where the shared run ends', () => {
  const out = streets([route('1', [[0, 0], [6, 0]], 15), route('2', [[0, 0], [3, 0], [3, 3]], 15)]);
  const ends = out.flatMap((f) => [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)].map((p) => p.join()));
  // The junction at (3, 0) is the end of three runs, at one point.
  const junction = out.find((f) => f.properties.routes === '2').geometry.coordinates;
  const j = [junction[0], junction.at(-1)].find((p) => Math.abs(p[1]) < 1e-6);
  assert.ok(j, 'the branch starts on the trunk');
  assert.equal(ends.filter((p) => p === j.join()).length, 3);
});

test('a crossing street does not cut a run', () => {
  // Both routes have a vertex where they cross; route 1 is still one line.
  const out = streets([route('1', [[0, 0], [2, 0], [4, 0]], 15), route('2', [[2, -2], [2, 0], [2, 2]], 15)]);
  assert.equal(out.filter((f) => f.properties.routes === '1').length, 1);
  assert.equal(out.filter((f) => f.properties.routes === '2').length, 1);
});

test("a one-way street has arrows; a divided road is one two-way line", () => {
  // Route 1 east on one carriageway (y = 0) and west on the other (15 m
  // north); route 2 one way on a street of its own, 500 m north.
  const every = (min) => Array.from({ length: 24 }, (_, i) => 9 * 3600 + i * min * 60);
  const cell = (x, y, dir) => ({ at: at([x, y]), dir, tier: 'frequent', with: every(15), against: [] });
  const cells1 = [...[0.5, 1, 1.5].map((x) => cell(x, 0, [1, 0])), ...[0.5, 1, 1.5].map((x) => cell(x, 0.015, [-1, 0]))];
  const cells2 = [0.5, 1, 1.5].map((x) => cell(x, 0.5, [1, 0]));
  const { streets: out } = buildStreets(
    [route('1', [[0, 0], [2, 0]], 15), route('1', [[2, 0.015], [0, 0.015]], 15), route('2', [[0, 0.5], [2, 0.5]], 15)],
    new Map([['1', cells1], ['2', cells2]]),
    { precision: 6 },
  );
  // The divided road is one two-way line down its middle out to z16, and
  // its two carriageways from there in (#81), with no arrows either way.
  const far = out.filter((f) => f.properties.routes === '1' && f.properties.zoom === 'far');
  const near = out.filter((f) => f.properties.routes === '1' && f.properties.zoom === 'near');
  assert.equal(far.length, 1, `one line out there, not ${far.length}`);
  assert.ok(out.filter((f) => f.properties.routes === '1').every((f) => !f.properties.oneway), 'no arrows on a two-way road');
  assert.ok(Math.abs(km(far[0]) - 2) < 0.05, `${km(far[0])} km`);
  const ys = far[0].geometry.coordinates.map(([, y]) => (y / KM) * 1000);
  assert.ok(ys.every((y) => y > 5 && y < 10), `down the middle: ${ys.map((y) => y.toFixed(1))} m`);
  const nearKm = near.reduce((sum, f) => sum + km(f), 0);
  assert.ok(nearKm > 3.9, `both carriageways close in, ${nearKm} km`);
  const two = out.find((f) => f.properties.routes === '2');
  assert.equal(two.properties.oneway, 1);
  // Drawn the way its buses go (east).
  const c = two.geometry.coordinates;
  assert.ok(c.at(-1)[0] > c[0][0]);
});

test("a line that stops short of its own route's line ahead is joined to it", () => {
  // Route 1 stops 10 m short of its own line further on (a gap in RTD's
  // lines): drawn as one street, with only its two real ends loose.
  const { streets: out, report } = buildStreets([route('1', [[0, 0], [1, 0]], 15), route('1', [[1.01, 0], [2, 0]], 15)], new Map(), { precision: 6 });
  assert.equal(out.length, 1, out.map((f) => JSON.stringify(f.geometry.coordinates)).join(' | '));
  assert.ok(km(out[0]) > 1.99, `${km(out[0])} km`);
  assert.equal(report.ends, 2);
  assert.equal(report.nearOwn, 0);
  // A line of its own beside the end, not ahead of it (the other
  // carriageway, 20 m off), is left: no end is joined across.
  const { report: beside } = buildStreets([route('1', [[0, 0], [1, 0]], 15), route('1', [[0.5, 0.02], [1.5, 0.02]], 15)], new Map(), { precision: 6 });
  assert.equal(beside.ends, 4);
});

test('a street keeps the node where another line meets it, however straight', () => {
  // Route 2 (rush hours only) leaves route 1 at a vertex half a metre off
  // route 1's straight line: simplifying route 1's street must not move it.
  const out = streets([route('1', [[0, 0], [1, 0.0005], [2, 0]], 15), route('2', [[1, 0.0005], [1, 1]], 30, 'peak')]);
  const one = out.filter((f) => f.properties.routes.split(' ').includes('1'));
  const junction = at([1, 0.0005]);
  const nearest = Math.min(...one.flatMap((f) => f.geometry.coordinates.map((p) => Math.hypot(p[0] - junction[0], p[1] - junction[1]) / KM)));
  assert.ok(nearest * 1000 < 0.1, `the junction is ${(nearest * 1000).toFixed(2)} m from the street`);
});

test('a ramp circle is drawn as the turn from one road to the other', () => {
  // Road A along y = 0 (route 2), road B along x = 1 km (route 3); route 1
  // comes along A and takes a loop ramp round onto B, northwards.
  const out = streets([
    route('2', [[0, 0], [2, 0]]),
    route('3', [[1, -1], [1, 1]]),
    // The loop crosses both roads on bridges: no vertex on either.
    route('1', [[0, 0], [0.95, 0], [0.98, -0.04], [1.04, -0.04], [1.06, 0.02], [1.03, 0.06], [1, 0.08], [1, 1]]),
  ]);
  const one = out.filter((f) => f.properties.routes.split(' ').includes('1'));
  const xs = one.flatMap((f) => f.geometry.coordinates.map(([x]) => x / KM));
  assert.ok(Math.max(...xs) < 1.001, `route 1 reaches x = ${Math.max(...xs).toFixed(3)} km: the circle is still drawn`);
});

test('a small loop off a line is a turn at the junction; a circulator stays', () => {
  // Route 4 along y = 0, then once round a 100 m block and back.
  const out = streets([route('2', [[0, 0], [1, 0]]), route('4', [[0, 0], [0.5, 0], [0.5, 0.1], [0.6, 0.1], [0.6, 0], [0.5, 0]])]);
  const ys = out.filter((f) => f.properties.routes.split(' ').includes('4')).flatMap((f) => f.geometry.coordinates.map(([, y]) => y / KM));
  assert.ok(Math.max(...ys) < 0.001, 'the lap round the block is gone');
  // A route that is only a loop round a block keeps it.
  const ring = streets([route('5', [[0, 0], [0, 0.1], [0.1, 0.1], [0.1, 0], [0, 0]])]);
  assert.ok(ring.length && ring.reduce((sum, f) => sum + km(f), 0) > 0.39);
});

test('a terminal loop with a place near becomes a short end to it', () => {
  // Route 4 laps a 100 m block whose far corner is a Park-n-Ride: the line
  // ends there, the shorter way round, not round the whole block.
  const { streets: out } = buildStreets(
    [route('2', [[0, 0], [1, 0]]), route('4', [[0, 0], [0.5, 0], [0.5, 0.1], [0.6, 0.1], [0.6, 0], [0.5, 0]])],
    new Map(),
    { precision: 6, places: [at([0.61, 0.11])] },
  );
  const four = out.filter((f) => f.properties.routes === '4');
  const pts = four.flatMap((f) => f.geometry.coordinates.map(([x, y]) => [x / KM, y / KM]));
  assert.ok(pts.some(([x, y]) => Math.hypot(x - 0.6, y - 0.1) < 0.002), 'the line reaches the corner by the place');
  const loopKm = four.reduce((sum, f) => sum + km(f), 0);
  assert.ok(loopKm < 0.25, `a short end, ${loopKm.toFixed(3)} km, not the 0.4 km lap`);
});

test('a loop no rider boards on is a turn, even by a station; one with a stop ends at the stop', () => {
  // Route 4 leaves route 2's street up a 50 m stem to a loop (a diamond 100 m
  // across) and comes back to the stem.
  const lap = [route('2', [[0, 0], [1, 0]]), route('4', [[0, 0], [0.5, 0], [0.5, 0.05], [0.45, 0.1], [0.5, 0.15], [0.55, 0.1], [0.5, 0.05]])];
  const yMax = (out) => Math.max(...out.filter((f) => f.properties.routes === '4').flatMap((f) => f.geometry.coordinates.map(([, y]) => y / KM)), 0);
  // A station 200 m off, no stop on the loop: a ramp's circle. It goes, and
  // its short stem with it.
  const ramp = buildStreets(lap, new Map(), { precision: 6, places: [at([0.5, 0.35])] }).streets;
  assert.ok(yMax(ramp) < 0.001, `the loop is still drawn, to y = ${yMax(ramp).toFixed(3)} km`);
  // The same loop with a bus stop at its far side and no place: it ends there.
  const stop = buildStreets(lap, new Map(), { precision: 6, stops: [at([0.5, 0.151])] }).streets;
  assert.ok(yMax(stop) > 0.149, 'the line reaches the stop');
  const four = stop.filter((f) => f.properties.routes === '4').reduce((sum, f) => sum + km(f), 0);
  assert.ok(four < 0.25, `a short end, ${four.toFixed(3)} km, not the whole loop`);
});
