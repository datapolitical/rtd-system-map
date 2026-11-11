import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStreets, busStreets } from '../scripts/lib/streets.mjs';

// One test per rule of the street graph's builder (scripts/lib/streets.mjs)
// that test/streets.test.mjs does not pin on its own. Each has a case the
// rule changes and a case beside it that it leaves alone, so it fails if the
// rule is taken out or its threshold doubled.

// Made-up routes near (0, 0): a kilometer east is 1/111.32 of a degree.
const KM = 1 / 111.32;
const at = ([x, y]) => [x * KM, y * KM];
const route = (name, path, wk = 15, tier = 'frequent') => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: path.map(at) },
  properties: { route: name, mode: 'bus', tier, wk },
});
const streets = (routes) => busStreets(routes, new Map(), { precision: 6 });
const withRoutes = (out, list) => out.filter((f) => f.properties.routes === list);

// Everything below is in metres from the first route's first point (0, 0),
// which every test starts with. The builder's metres are 111320 per degree of
// longitude and 110540 of latitude (geom.mjs, projection), so `m` makes the
// [x km, y km] pair that `route` and `at` take from x and y in metres, and
// `metres` reads a street back in them.
const NORTH = 110540 / 111320;
const m = (x, y) => [x / 1000, y / 1000 / NORTH];
const spot = (x, y) => at(m(x, y)); // [lon, lat]: a stop, a place or a cell
const metres = (f) => f.geometry.coordinates.map(([x, y]) => [x * 111320, y * 110540]);
const lengthM = (f) => metres(f).reduce((s, p, i, a) => (i ? s + Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) : 0), 0);
const sumM = (list) => list.reduce((s, f) => s + lengthM(f), 0);
const northmost = (list) => Math.max(...list.flatMap((f) => metres(f).map(([, y]) => y)), 0);
const reaches = (list, x, y, within = 2) => list.some((f) => metres(f).some((p) => Math.hypot(p[0] - x, p[1] - y) <= within));
const zoomed = (f) => 'zoom' in f.properties;

const every = (min) => Array.from({ length: 24 }, (_, i) => 9 * 3600 + i * min * 60);
// A measured cell of one route's buses, all of them going `dir`.
const cell = (x, y, dir) => ({ at: spot(x, y), dir, tier: 'frequent', with: every(15), against: [] });

// A divided road: `east` run along y = 0 and `west` along y = 20, each a line
// of its own and drawn the opposite way. (20 m, not closer: a loose end within
// CLOSE_ANY of another line is joined to it, and that would tie the two
// carriageways together at their ends.)
const divided = (east, west, length = 1000) => [...east.map((r) => route(r, [m(0, 0), m(length, 0)])), ...west.map((r) => route(r, [m(length, 20), m(0, 20)]))];

// Fails if SAME_ROUTES is doubled (1.5) or halved (0.5), or its check is taken out.
test('SAME_ROUTES: two carriageways carry the same routes, at least three in four', () => {
  // 4 of the 5 routes on either are shared: one line down the middle out at
  // z16 (`far`), the two carriageways close in (`near`).
  const merged = streets(divided(['1', '2', '3', '4', '5'], ['1', '2', '3', '4']));
  const far = merged.filter((f) => f.properties.zoom === 'far');
  const near = merged.filter((f) => f.properties.zoom === 'near');
  assert.equal(far.length, 1, merged.map((f) => `${f.properties.routes}/${f.properties.zoom}`).join(' | '));
  assert.equal(far[0].properties.routes, '1 2 3 4 5');
  assert.deepEqual(near.map((f) => f.properties.routes).sort(), ['1 2 3 4', '1 2 3 4 5']);
  assert.equal(merged.filter((f) => !zoomed(f)).length, 0, 'every piece of the road is tagged');
  assert.ok(Math.abs(lengthM(far[0]) - 1000) < 5, `${lengthM(far[0])} m`);
  assert.ok(metres(far[0]).every(([, y]) => y > 5 && y < 15), 'down the middle');
  // 2 of 6 shared (one in three), and 3 of 5 (three in five): two streets that
  // happen to run side by side, not a road. Nothing moves, nothing is tagged.
  for (const [east, west, why] of [
    [['1', '2', '3', '4'], ['1', '2', '5', '6'], '2 of 6'],
    [['1', '2', '3', '4', '5'], ['1', '2', '3'], '3 of 5'],
  ]) {
    const out = streets(divided(east, west));
    assert.equal(out.length, 2, `${why}: ${out.map((f) => f.properties.routes).join(' | ')}`);
    assert.ok(out.every((f) => !zoomed(f)), `${why} share too little to be one road`);
    assert.ok(out.every((f) => Math.abs(lengthM(f) - 1000) < 5));
  }
});

// Fails if the check for a route running the same way on both lines is taken out.
test('lanes: two lines one route runs the same way on both are not a divided road', () => {
  const run = (westDir, westLine) => {
    const cells = [250, 500, 750].flatMap((x) => [cell(x, 0, [1, 0]), cell(x, 20, westDir)]);
    return buildStreets([route('1', [m(0, 0), m(1000, 0)]), route('1', westLine)], new Map([['1', cells]]), { precision: 6 }).streets;
  };
  // Eastbound on both: two lanes (of a one-way pair, or of a wide street),
  // each with its own arrows, and nothing merged.
  const lanes = run([1, 0], [m(0, 20), m(1000, 20)]);
  assert.equal(lanes.length, 2, lanes.map((f) => f.properties.routes).join(' | '));
  assert.ok(lanes.every((f) => !zoomed(f)), 'no far or near: nothing merged');
  assert.ok(lanes.every((f) => f.properties.oneway === 1 && f.properties.routes === '1'));
  assert.ok(Math.abs(sumM(lanes) - 2000) < 10, `${sumM(lanes)} m`);
  // The same lines with the second one going the other way (westbound cells,
  // drawn westwards) are the two carriageways of a road, and do merge.
  const road = run([-1, 0], [m(1000, 20), m(0, 20)]);
  assert.equal(road.filter((f) => f.properties.zoom === 'far').length, 1, road.map((f) => f.properties.zoom).join());
  assert.equal(road.filter((f) => f.properties.zoom === 'near').length, 2);
});

// Fails if DETOUR_CLOSE is doubled (200) or halved (50), or its check is taken out.
test('DETOUR_CLOSE: a detour whose ends are 90 m apart is drawn straight, one whose ends are 150 m apart is not', () => {
  // Route 2 along y = 0; route 1 along it, off up a 130 m leg, across, and back
  // down to it. Both are 2.5 times longer than the way straight between the
  // ends and reach less than LOOP_REACH, so only how far apart the ends are
  // decides.
  const detour = (gap) => streets([route('2', [m(0, 0), m(2000, 0)]), route('1', [m(0, 0), m(500, 0), m(500, 130), m(500 + gap, 130), m(500 + gap, 0), m(2000, 0)])]);
  const near = detour(90);
  assert.equal(near.length, 1, near.map((f) => f.properties.routes).join(' | '));
  assert.equal(near[0].properties.routes, '1 2');
  assert.ok(northmost(near) < 1, `the detour is still drawn, to y = ${northmost(near).toFixed(0)} m`);
  assert.ok(Math.abs(lengthM(near[0]) - 2000) < 5);
  const far = detour(150);
  assert.ok(Math.abs(northmost(far) - 130) < 2, `the detour is drawn as it is, to y = ${northmost(far).toFixed(0)} m`);
  const off = withRoutes(far, '1');
  assert.equal(off.length, 1, far.map((f) => f.properties.routes).join(' | '));
  assert.ok(reaches(off, 500, 130) && reaches(off, 650, 130), 'both corners of the detour');
  assert.ok(Math.abs(lengthM(off[0]) - 410) < 5, `${lengthM(off[0])} m`);
});

// Fails if the tag is not written, or a street the same in both graphs is tagged too.
test('zoom tags: a street the same in both graphs has none, a divided road is all tagged', () => {
  // Route 2 is a street of its own, 500 m north of route 1's divided road.
  const out = streets([...divided(['1'], ['1']), route('2', [m(0, 500), m(1000, 500)])]);
  const two = withRoutes(out, '2');
  assert.equal(two.length, 1);
  assert.ok(!zoomed(two[0]), `the same street at every zoom, tagged ${two[0].properties.zoom}`);
  const road = withRoutes(out, '1');
  assert.ok(road.every(zoomed), 'a piece of the road without a tag would be drawn at every zoom');
  assert.deepEqual(road.map((f) => f.properties.zoom).sort(), ['far', 'near', 'near']);
  assert.equal(out.length, 4);
});

// Fails if 'limited' is put before 'peak' in PART_TIME_ORDER.
test('PART_TIME_ORDER: a street with only part-time routes takes the strongest, peak before limited', () => {
  // Whichever route is listed first.
  for (const order of [['limited', 'peak'], ['peak', 'limited']]) {
    const out = streets(order.map((tier, i) => route(String(i + 1), [m(0, 0), m(3000, 0)], 30, tier)));
    assert.equal(out.length, 1);
    const { n, tier, routes, pt } = out[0].properties;
    assert.deepEqual({ routes, n, pt, tier }, { routes: '1 2', n: 0, pt: 2, tier: 'peak' }, order.join());
  }
  // The same street without the rush-hour route is dotted, not dashed.
  const few = streets([route('1', [m(0, 0), m(3000, 0)], 30, 'limited')]);
  assert.equal(few[0].properties.tier, 'limited');
  assert.equal(few[0].properties.n, 0);
});

// A route 4 that leaves route 2's street at (500, 0) up a stem, then round a
// diamond loop 100 m across (each side 70.7 m), back to the stem's end.
const lapOff = (stem) => [
  route('2', [m(0, 0), m(1000, 0)]),
  route('4', [m(0, 0), m(500, 0), m(500, stem), m(450, stem + 50), m(500, stem + 100), m(550, stem + 50), m(500, stem)]),
];
const four = (out) => out.filter((f) => f.properties.routes === '4');

// Fails if STEM_SHORT is doubled (240), or the stem is never dropped.
test('STEM_SHORT: a loop nobody boards goes with a stem under 120 m, and leaves a longer stem', () => {
  // On a 50 m stem the loop and the stem go; the line ends on the road.
  const short = streets(lapOff(50));
  assert.equal(four(short).length, 0, 'no street of route 4 alone: the stem is gone');
  assert.ok(northmost(short) < 1, `still drawn, to y = ${northmost(short).toFixed(0)} m`);
  // On a 200 m stem the loop goes and the stem stays, ending where the loop was.
  const long = streets(lapOff(200));
  assert.equal(four(long).length, 1, long.map((f) => f.properties.routes).join(' | '));
  assert.ok(Math.abs(northmost(long) - 200) < 2, `the stem ends at y = ${northmost(long).toFixed(0)} m`);
  assert.ok(Math.abs(lengthM(four(long)[0]) - 200) < 3, `${lengthM(four(long)[0])} m: the stem alone`);
});

// Fails if MOUTH is doubled (120) or halved (30), or its check is taken out.
test('MOUTH: a stop near where a loop leaves its stem does not board it, one on its far side does', () => {
  // The diamond's mouth is (500, 50). A stop 40 m round it, on the loop's
  // first side: the stop is by the street, not on the loop. The loop goes,
  // and its stem.
  const mouth = buildStreets(lapOff(50), new Map(), { precision: 6, stops: [spot(500 - 40 / Math.SQRT2, 50 + 40 / Math.SQRT2)] }).streets;
  assert.equal(four(mouth).length, 0, 'a loop with a stop at its mouth only goes');
  assert.ok(northmost(mouth) < 1);
  // A stop at the far tip, 100 m from the mouth: riders board on the loop, and
  // the line ends at that stop, the shorter way round.
  const tip = buildStreets(lapOff(50), new Map(), { precision: 6, stops: [spot(500, 150)] }).streets;
  assert.equal(four(tip).length, 1, tip.map((f) => f.properties.routes).join(' | '));
  assert.ok(reaches(four(tip), 500, 150), 'the line reaches the stop');
  const len = lengthM(four(tip)[0]);
  assert.ok(len > 150 && len < 230, `the stem and two sides, ${len.toFixed(0)} m, not the whole loop`);
});

// Fails if PLACE_ON is doubled (120), or its check is taken out.
test('PLACE_ON: a place riders cannot reach from the loop does not make it a short end; one beside it does', () => {
  // A place 100 m from the loop's east corner (550, 100), and no stop: a
  // ramp's circle by a station. It goes.
  const far = buildStreets(lapOff(50), new Map(), { precision: 6, places: [spot(650, 100)] }).streets;
  assert.equal(four(far).length, 0, 'a place 100 m off serves nothing');
  assert.ok(northmost(far) < 1);
  // 20 m from the corner: the loop serves it, and the line ends at the corner.
  const beside = buildStreets(lapOff(50), new Map(), { precision: 6, places: [spot(570, 100)] }).streets;
  assert.equal(four(beside).length, 1, beside.map((f) => f.properties.routes).join(' | '));
  assert.ok(reaches(four(beside), 550, 100), 'the line reaches the corner by the place');
  assert.ok(Math.abs(northmost(four(beside)) - 100) < 2, 'and goes no further round');
  assert.ok(lengthM(four(beside)[0]) < 150, `a short end, ${lengthM(four(beside)[0]).toFixed(0)} m`);
});

// Fails if PLACE_NEAR is doubled (500) or halved (125), or its check is taken out.
test('PLACE_NEAR: a place counts for a loop with a stop only within 250 m of it', () => {
  // The same loop with a stop at its far tip (500, 150), where the line would
  // end on its own. A place 150 m off the east corner is near enough to take
  // the line there instead...
  const stops = [spot(500, 150)];
  const alone = buildStreets(lapOff(50), new Map(), { precision: 6, stops }).streets;
  assert.ok(Math.abs(northmost(four(alone)) - 150) < 2, 'with a stop alone the line ends at the stop');
  const near = buildStreets(lapOff(50), new Map(), { precision: 6, stops, places: [spot(700, 100)] }).streets;
  assert.ok(reaches(four(near), 550, 100), 'the line ends at the corner by the place');
  assert.ok(Math.abs(northmost(four(near)) - 100) < 2, 'not at the stop');
  // ...and one 300 m off is not: the line ends at the stop.
  const away = buildStreets(lapOff(50), new Map(), { precision: 6, stops, places: [spot(850, 100)] }).streets;
  assert.ok(Math.abs(northmost(four(away)) - 150) < 2, `ends at y = ${northmost(four(away)).toFixed(0)} m, at the stop`);
});

// Fails if CLOSE_ANY goes to 0 or is doubled (30), CLOSE_METERS is doubled (60), or
// the check on CLOSE_METERS or the CLOSE_COS check in closeGaps is taken out.
test('CLOSE_ANY and CLOSE_METERS: a loose end joins its own route within 15 m any way, within 30 m only ahead', () => {
  // Route 1's street along y = 0 (two loose ends), and another line of route 1
  // (two more) with one end near it. `ends` counts the loose ends left: 4, or
  // fewer for each end that was joined.
  const run = (...tail) => {
    const { streets: out, report } = buildStreets([route('1', [m(0, 0), m(1000, 0)]), route('1', tail)], new Map(), { precision: 6 });
    return { out, ends: report.ends };
  };
  // Along 80 m beside the street, 10 m off, then ending: joined, whichever way
  // it faces. Its end and the street's cut there make three streets.
  const beside10 = run(m(420, -400), m(420, -10), m(500, -10));
  assert.equal(beside10.ends, 3, 'joined');
  assert.equal(beside10.out.length, 3);
  // The same 25 m off, beside it and not ahead: left loose.
  const beside25 = run(m(420, -400), m(420, -25), m(500, -25));
  assert.equal(beside25.ends, 4, 'not joined');
  assert.equal(beside25.out.length, 2);
  // 25 m short of its middle, coming straight at it: joined.
  const ahead25 = run(m(500, -300), m(500, -25));
  assert.equal(ahead25.ends, 3, 'joined');
  assert.equal(ahead25.out.length, 3);
  // ...but a line that stops 35 m short of the street's end, in line with it,
  // is further than any gap closes.
  const gap35 = run(m(1500, 0), m(1035, 0));
  assert.equal(gap35.ends, 4, 'not joined');
  assert.equal(gap35.out.length, 2);
  // (25 m short, the same way, is a gap in RTD's lines: one street.)
  const gap25 = run(m(1500, 0), m(1025, 0));
  assert.equal(gap25.ends, 2, 'joined');
  assert.equal(gap25.out.length, 1);
});
