import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  END_METERS,
  SAME_LINE_METERS,
  SAME_PLACE_METERS,
  clearFrom,
  alongWalk,
  groupPlatforms,
  longAxis,
  meters,
  platformMarks,
  placeGroup,
  splitByTrack,
  walkPoint,
} from '../scripts/lib/platforms.mjs';
import { TICK_FROM, TICK_TO, linePaths } from '../scripts/lib/stationmarks.mjs';

// A made-up network: two single-track lines run north to south, 44 m apart,
// each ending at its own platform group.
const LON = -105;
const LINE_A = LON;
const LINE_B = LON + 0.0005;
const A_END = 39.699;
const B_END = 39.703;
const piece = (route, slot, coords) => ({ type: 'Feature', properties: { route, slot }, geometry: { type: 'LineString', coordinates: coords } });
const south = (lon, from, to, steps = 20) => Array.from({ length: steps + 1 }, (_, i) => [lon, from + ((to - from) * i) / steps]);
const pieces = [piece('A', 0, south(LINE_A, 39.73, A_END)), piece('B', 0, south(LINE_B, 39.73, B_END))];
const stop = (lon, lat, lines) => ({ at: [lon, lat], lines });
const station = (at, properties = {}) => ({
  type: 'Feature',
  properties: { id: 1, label: 'Test', served: true, lines: 'A B', span: 1, bearing: 0, meet: false, ...properties },
  geometry: { type: 'Point', coordinates: at },
});

test('child stops within a platform, or on a common line, are one platform group', () => {
  // Two sides of one platform, serving different lines: one place.
  const sides = groupPlatforms([stop(0, 0, ['A']), stop(0, 0.0003, ['B'])]);
  assert.equal(sides.length, 1);
  assert.ok(meters(sides[0][0].at, sides[0][1].at) < SAME_PLACE_METERS);
  // Opposite side platforms 200 m apart on one line: one station, one mark.
  const staggered = groupPlatforms([stop(0, 0, ['A']), stop(0, 0.0018, ['A'])]);
  assert.equal(staggered.length, 1);
  assert.ok(meters(staggered[0][0].at, staggered[0][1].at) < SAME_LINE_METERS);
  // The same distance with no line in common is two platforms, not one.
  const apart = groupPlatforms([stop(0, 0, ['A']), stop(0, 0.0018, ['B'])]);
  assert.equal(apart.length, 2);
  // Far enough apart, a common line doesn't make one place either.
  const far = groupPlatforms([stop(0, 0, ['A']), stop(0, 0.004, ['A'])]);
  assert.equal(far.length, 2);
});

test('groups are found through another stop between them', () => {
  // 0, 80 and 160 m: no pair is near, but each is near the next.
  const chain = groupPlatforms([stop(0, 0, ['A']), stop(0, 0.0007, ['B']), stop(0, 0.0014, ['C'])]);
  assert.equal(chain.length, 1);
  assert.equal(chain[0].length, 3);
});

test('a platform at the end of its lines is marked at their end', () => {
  const group = groupPlatforms([stop(LINE_B, B_END, ['B'])])[0];
  const mark = placeGroup(group, pieces, linePaths(pieces));
  assert.deepEqual(mark.lines, ['B']);
  assert.equal(mark.span, 1);
  assert.ok(meters(mark.at, [LINE_B, B_END]) < 1, 'the mark is on the end of the line');
  // Its own two ends, not the other line's, which ends further north.
  assert.ok(END_METERS >= meters(mark.at, [LINE_B, B_END]));
});

test('a platform the lines run through is marked on the track at the platform', () => {
  // A's track carries on past this stop: the mark goes on the track beside it.
  const through = piece('A', 0, south(LINE_A, 39.73, 39.69));
  const group = groupPlatforms([stop(LINE_A + 0.0002, 39.71, ['A'])])[0];
  const mark = placeGroup(group, [through], linePaths([through]));
  assert.ok(meters(mark.at, [LINE_A + 0.0002, 39.71]) < 25, 'within the platform, on the track');
  assert.ok(Math.abs(mark.at[0] - LINE_A) < 1e-6, 'on the line, not off it');
});

test('a mark waits for the zoom where it clears the station mark, or never comes', () => {
  const near = { at: [LON, A_END + 0.00013], lines: ['B'], span: 1 };
  const far = { at: [LON, A_END + 0.0025], lines: ['B'], span: 1 };
  assert.equal(clearFrom([LON, A_END], { span: 1 }, near), null, '15 m apart never clears');
  const from = clearFrom([LON, A_END], { span: 1 }, far);
  assert.ok(from > TICK_FROM && from <= 16, `clear from ${from}`);
  // The hub's ring is wider than a tick, so its platform mark waits longer.
  const ring = clearFrom([LON, A_END], { span: 3, meet: true }, far);
  assert.ok(ring > from);
});

test('a station whose lines end at two platform groups far apart gets a mark at each', () => {
  // The station's own point is on A's platform; B's platform is 440 m south.
  const platforms = [[stop(LINE_A, A_END, ['A']), stop(LINE_A + 0.0002, A_END + 0.0001, ['B']), stop(LINE_B, B_END, ['B'])]];
  const features = platformMarks([station([LINE_A, A_END])], platforms, pieces);
  assert.deepEqual(features.map((f) => f.properties.kind), ['mark', 'join']);
  const [mark, join] = features;
  assert.deepEqual(mark.properties.lines.split(' '), ['B']);
  assert.equal(mark.properties.span, 1);
  assert.ok(meters(mark.geometry.coordinates, [LINE_B, B_END]) < 2, 'marked at the end of B');
  assert.ok(mark.properties.tickFrom > TICK_FROM && mark.properties.tickFrom <= 16);
  assert.equal(join.properties.tickFrom, mark.properties.tickFrom, 'the line arrives with its mark');
  assert.deepEqual(join.geometry.coordinates[0], [LINE_A, A_END], 'from the station itself');
});

test('a station whose platforms are one place gets nothing extra, and unserved stations too', () => {
  const one = [[stop(LINE_A, A_END, ['A']), stop(LINE_A, A_END + 0.0002, ['A'])]];
  assert.deepEqual(platformMarks([station([LINE_A, A_END])], one, pieces), []);
  const two = [
    [stop(LINE_A, A_END, ['A'])],
    [stop(LINE_B, B_END, ['B'])],
  ];
  assert.deepEqual(platformMarks([station([LINE_A, A_END], { served: false })], two, pieces), []);
  assert.deepEqual(platformMarks([station([LINE_A, A_END])], [[]], pieces), [], 'no GTFS platforms, nothing drawn');
});

test('a station sitting off every platform marks each group', () => {
  // The station's point is 150 m west of A's platform and 330 m from B's:
  // neither group is the station's own, so both are marked and joined.
  const platforms = [[stop(LINE_A, A_END - 0.001, ['A']), stop(LINE_B, B_END + 0.001, ['B'])]];
  const features = platformMarks([station([LINE_A - 0.0018, A_END + 0.0004])], platforms, pieces);
  const marks = features.filter((f) => f.properties.kind === 'mark');
  const joins = features.filter((f) => f.properties.kind === 'join');
  assert.equal(marks.length, 2);
  assert.equal(joins.length, 2);
  assert.deepEqual(joins.map((f) => f.geometry.coordinates[0]), [[LINE_A - 0.0018, A_END + 0.0004], [LINE_A - 0.0018, A_END + 0.0004]]);
});

test('lines on tracks too far apart for one mark are two groups, lines on one track are one', () => {
  // A and B stop 44 m apart, each on its own track: one place by distance.
  const stops = [stop(LINE_A, 39.71, ['A']), stop(LINE_B, 39.71, ['B'])];
  const [group] = groupPlatforms(stops);
  assert.equal(group.length, 2, 'one group by distance');
  const split = splitByTrack(group, pieces);
  assert.deepEqual(split.map((g) => g.flatMap((p) => p.lines)), [['A'], ['B']]);
  // The same stops with both lines drawn on one track stay one group.
  const shared = [piece('A', -0.5, south(LINE_A, 39.73, A_END)), piece('B', 0.5, south(LINE_A, 39.73, A_END))];
  assert.equal(splitByTrack(group, shared).length, 1);
  // A line with no drawn track nearby splits nothing.
  assert.equal(splitByTrack(group, [pieces[0]]).length, 1);
});

test('a line that passes a station on its own track is marked abreast of the station', () => {
  // B ends at the station; A runs past 44 m west, its stop 22 m further north.
  const here = [LINE_B, B_END];
  const platforms = [[stop(LINE_B, B_END, ['B']), stop(LINE_A, B_END + 0.0002, ['A'])]];
  const features = platformMarks([station(here)], platforms, pieces, () => new Set(['B']));
  assert.deepEqual(features.map((f) => f.properties.kind), ['mark', 'join']);
  const [mark, join] = features;
  assert.equal(mark.properties.lines, 'A');
  assert.ok(meters(mark.geometry.coordinates, [LINE_A, B_END]) < 3, `abreast of the station, not at A's stop: ${mark.geometry.coordinates}`);
  // A line that runs on through waits until its mark is clear of the
  // station's, from a whole zoom (the map shows a mark from a whole zoom).
  assert.ok(Number.isInteger(mark.properties.tickFrom) && mark.properties.tickFrom > TICK_TO, `from ${mark.properties.tickFrom}`);
  assert.deepEqual(join.geometry.coordinates, [here, mark.geometry.coordinates]);
});

test('a ring has a long axis only when it is long', () => {
  // 200 m by 30 m, lying east to west.
  const k = 111320 * Math.cos((39.7 * Math.PI) / 180);
  const hall = [[LON, 39.7], [LON + 200 / k, 39.7], [LON + 200 / k, 39.7 + 30 / 110540], [LON, 39.7 + 30 / 110540], [LON, 39.7]];
  const [from, to] = longAxis(hall).sort((a, b) => a[0] - b[0]);
  assert.ok(meters(from, [LON, 39.7 + 15 / 110540]) < 1 && meters(to, [LON + 200 / k, 39.7 + 15 / 110540]) < 1, 'through the middle, end to end');
  assert.ok(Math.abs(meters(...longAxis(hall, { reach: 50 })) - 300) < 1, 'carried past each end');
  const square = [[LON, 39.7], [LON + 40 / k, 39.7], [LON + 40 / k, 39.7 + 40 / 110540], [LON, 39.7 + 40 / 110540], [LON, 39.7]];
  assert.equal(longAxis(square), null);
});

test('the marks of two platform groups stand in line with the hall between them', () => {
  // A ends from the north, B from the south, 257 m apart; a hall 27 m wide
  // lies between their platforms, east to west. Each line runs 110 m on past
  // the hall's axis to its own end.
  const FAR = LON + 0.003;
  const AXIS = 39.7005;
  const two = [piece('A', 0, south(LINE_A, 39.73, 39.6995, 305)), piece('B', 0, south(FAR, 39.67, 39.7015, 315))];
  const platforms = [stop(LINE_A, AXIS - 0.0001, ['A']), stop(FAR, AXIS + 0.0001, ['B'])];
  const hall = [[LON + 0.0003, AXIS - 0.00012], [FAR - 0.0003, AXIS - 0.00012], [FAR - 0.0003, AXIS + 0.00012], [LON + 0.0003, AXIS + 0.00012], [LON + 0.0003, AXIS - 0.00012]];
  const ending = () => new Set(['A', 'B']);
  const f = station([LINE_A, 39.6995]);
  // With no hall each mark is at its line's end, and the walk between them slants.
  assert.equal(walkPoint(f, platforms, two, ending(), []), null);
  const slanted = platformMarks([f], [platforms], two, ending).find((m) => m.properties.kind === 'mark');
  assert.ok(meters(slanted.geometry.coordinates, [FAR, 39.7015]) < 3, `B's mark at its end: ${slanted.geometry.coordinates}`);
  // With the hall both are on its axis: the station's own mark moves there...
  const own = walkPoint(f, platforms, two, ending(), [hall]);
  assert.ok(meters(own, [LINE_A, AXIS]) < 2, `the station's own mark on the axis: ${own}`);
  // ...and B's is across from it, the walk between them along the hall.
  const moved = { ...f, geometry: { type: 'Point', coordinates: own } };
  const [mark, join] = platformMarks([moved], [platforms], two, ending, [hall]);
  assert.ok(meters(mark.geometry.coordinates, [FAR, AXIS]) < 2, `B's mark on the axis: ${mark.geometry.coordinates}`);
  // The walk runs east to west, so both marks lie along it: drawn across
  // lines that run north to south, as they were (bearing 0 or 180).
  assert.equal(Math.abs(mark.properties.bearing) % 180, 0);
  // Once the lines are cut at their marks they end on the walk's line: the
  // marks are placed the same, and still lie along the walk.
  // (B comes in 14 degrees off square to the walk here, so its mark has to
  // be turned to lie along it.)
  const aslant = Array.from({ length: 316 }, (_, i) => [FAR + 0.0098 * (1 - i / 315), 39.67 + ((AXIS - 0.000004 - 39.67) * i) / 315]);
  const cut = [piece('A', 0, south(LINE_A, 39.73, AXIS + 0.000004, 305)), piece('B', 0, aslant)];
  const [after] = platformMarks([moved], [platforms], cut, ending, [hall]);
  assert.ok(meters(after.geometry.coordinates, [FAR, AXIS]) < 2, `B's mark after the cut: ${after.geometry.coordinates}`);
  assert.equal(Math.abs(after.properties.bearing) % 180, 0, `B's mark lies along the walk: bearing ${after.properties.bearing}`);
  // B ends at its mark, so the mark doesn't wait to be clear of the
  // station's: with it held back the line ended at nothing.
  assert.equal(mark.properties.tickFrom, TICK_TO);
  assert.equal(join.properties.tickFrom, TICK_TO);
  assert.ok(Math.abs(join.geometry.coordinates[0][1] - join.geometry.coordinates[1][1]) < 2e-5, 'the walk runs straight along the hall');
  // A hall that crosses only one group's track moves nothing.
  const short = [[LON + 0.0003, AXIS - 0.00012], [LON + 0.0015, AXIS - 0.00012], [LON + 0.0015, AXIS + 0.00012], [LON + 0.0003, AXIS + 0.00012], [LON + 0.0003, AXIS - 0.00012]];
  assert.equal(walkPoint(f, platforms, two, ending(), [short]), null);
});

test('a mark on a walk lies along it when its lines come in nearly square to it', () => {
  // A walk running east to west: marks across lines that run north to south.
  const walk = [[LON, 39.7], [LON + 0.003, 39.7]];
  assert.equal(alongWalk(14, walk), 0, 'lines 14 degrees off square: the mark is turned to lie along the walk');
  assert.equal(alongWalk(-166, walk), -180, 'the same mark, its lines drawn the other way');
  assert.equal(alongWalk(40, walk), 40, 'too far off square to turn: it would not cover its lines');
});
