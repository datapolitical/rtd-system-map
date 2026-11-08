import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  END_METERS,
  SAME_LINE_METERS,
  SAME_PLACE_METERS,
  clearFrom,
  groupPlatforms,
  meters,
  platformMarks,
  placeGroup,
} from '../scripts/lib/platforms.mjs';
import { TICK_FROM, linePaths } from '../scripts/lib/stationmarks.mjs';

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
