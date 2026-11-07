import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLEAR_PX,
  HUB_FROM,
  STEP,
  TICK_FROM,
  TICK_TO,
  apart,
  hubDiameter,
  linePaths,
  meetingPlace,
  metersPerPixel,
  parallelAt,
  stationMarks,
  stationScale,
  tickLength,
} from '../scripts/lib/stationmarks.mjs';

// A made-up network: lines A and B share a straight track north along one
// meridian, side by side (slots -0.5 and 0.5), to a split at SPLIT, where A
// carries on north alone and B turns north-east.
const LON = -105;
const SPLIT = 39.75;
const piece = (route, slot, coords) => ({ type: 'Feature', properties: { route, slot }, geometry: { type: 'LineString', coordinates: coords } });
const north = (from, to, lon = LON, steps = 20) => Array.from({ length: steps + 1 }, (_, i) => [lon, from + ((to - from) * i) / steps]);
const pieces = [
  piece('A', -0.5, north(39.65, SPLIT)),
  piece('A', 0, north(SPLIT, 39.8)),
  piece('B', 0.5, north(39.65, SPLIT)),
  piece('B', 0, Array.from({ length: 21 }, (_, i) => [LON + 0.03 * (i / 20), SPLIT + 0.03 * (i / 20)])),
];
const station = (lat, properties = {}) => ({
  type: 'Feature',
  properties: { served: true, lines: 'A B', span: 2, bearing: 0, end: false, links: 2, ...properties },
  geometry: { type: 'Point', coordinates: [LON, lat] },
});

test('a line drawn in pieces pointed either way is joined, its slots turned with it', () => {
  // The same track as A's, its second piece pointed back toward the first.
  const [first, second] = pieces;
  const turned = piece('A', -second.properties.slot - 0.25, [...second.geometry.coordinates].reverse());
  const paths = linePaths([first, turned]);
  assert.equal(paths.get('A').length, 1);
  const { path, slots } = paths.get('A')[0];
  assert.equal(path.length, 41);
  assert.deepEqual(path[0], [LON, 39.65]);
  assert.deepEqual(path.at(-1), [LON, 39.8]);
  assert.equal(slots[0], -0.5);
  assert.equal(slots.at(-1), 0.25);
});

test('the map scale and mark sizes follow the rail widths', () => {
  assert.equal(stationScale(9), 5 / 11);
  assert.equal(stationScale(11), 6 / 11);
  assert.equal(stationScale(16), 1);
  assert.ok(stationScale(10) > 5 / 11 && stationScale(10) < 6 / 11);
  assert.equal(tickLength(1, 16), 8);
  assert.equal(tickLength(3, 16), 32);
  assert.equal(hubDiameter(3, 16), 34);
  assert.ok(Math.abs(metersPerPixel(10, 0) - 76.437) < 0.01);
});

test('lines side by side are parallel; lines at a split are not', () => {
  const paths = linePaths(pieces);
  const far = parallelAt(paths, ['A', 'B'], [LON, 39.7], { zoom: 10, meters: 500 });
  assert.equal(far.parallel, true);
  assert.equal(far.bearing, 0);
  const atSplit = parallelAt(paths, ['A', 'B'], [LON, SPLIT - 0.001], { zoom: 10, meters: 500 });
  assert.equal(atSplit.parallel, false);
});

test('a tick spans its lines where they run together, and is a dot at a split', () => {
  const stations = [station(39.68), station(SPLIT - 0.001)];
  const [together, split] = stationMarks(stations, pieces);
  assert.equal(together.tick, 2);
  assert.equal(together.tickBearing, 0);
  assert.equal(split.tick, 1);
});

test('stations closer than a tick collapse to the strongest until they are clear', () => {
  // Three stations about 670 m apart: at zoom 9 a pixel is 90 m here.
  const stations = [station(39.664), station(39.67, { links: 9 }), station(39.676)];
  const marks = stationMarks(stations, pieces);
  assert.equal(marks[1].from, TICK_FROM, 'the strongest is drawn from the start');
  const paths = linePaths(pieces);
  for (const i of [0, 2]) {
    assert.ok(marks[i].from > TICK_FROM && marks[i].from < TICK_TO);
    // From then it is the larger mark's length from the strongest (the
    // hub here, its ring), and a quarter zoom before it was not.
    const meters = apart(paths, ['A', 'B'], stations[i].geometry.coordinates, stations[1].geometry.coordinates);
    const px = (z) => meters / metersPerPixel(z, 39.67);
    const longest = (z) => Math.max(tickLength(2, z), z >= HUB_FROM ? hubDiameter(2, z) : tickLength(2, z)) + CLEAR_PX;
    assert.ok(px(marks[i].from) >= longest(marks[i].from));
    assert.ok(px(marks[i].from - STEP) < longest(marks[i].from - STEP));
  }
  // Closer still, they wait for the capsules at TICK_TO.
  const tight = stationMarks([station(39.67), station(39.673, { links: 9 })], pieces);
  assert.deepEqual(tight.map((m) => m.from), [TICK_TO, TICK_FROM]);
  // Far apart, nothing waits.
  const spread = stationMarks([station(39.66), station(39.7, { links: 9 })], pieces);
  assert.deepEqual(spread.map((m) => m.from), [TICK_FROM, TICK_FROM]);
});

test('no line loses its mark: line ends and stations with a line of their own never wait', () => {
  const stations = [
    station(39.67, { links: 9 }),
    station(39.671, { end: true }),
    station(39.672, { lines: 'A B C', links: 1 }),
    station(39.673, { lines: 'A' }),
  ];
  const marks = stationMarks(stations, pieces);
  assert.equal(marks[1].from, TICK_FROM, 'a line ends here');
  // Most lines is strongest, so the A B C station is drawn and the A B one
  // beside it waits, but nothing outranks the C.
  assert.equal(marks[2].from, TICK_FROM);
  assert.ok(marks[0].from > TICK_FROM);
  assert.ok(marks[3].from > TICK_FROM, 'A also stops at the stronger station');
});

test('the hub is the place where the most lines meet, and never waits', () => {
  const stations = [
    station(39.67, { lines: 'A', links: 30 }),
    station(39.68, { lines: 'A B', links: 3 }),
    station(39.681, { lines: 'A B', links: 4 }),
    station(39.69, { lines: 'A B C', served: false }),
  ];
  assert.equal(meetingPlace(stations), 2);
  const marks = stationMarks(stations, pieces);
  assert.deepEqual(marks.map((m) => m.meet), [false, false, true, false]);
  assert.equal(marks[2].from, TICK_FROM);
  assert.equal(meetingPlace([]), -1);
});
