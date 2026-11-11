// Lines and stops at a bus terminal's hall (scripts/lib/halls.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipAtHalls, shortenAtHall, stopsOfHalls } from '../scripts/lib/halls.mjs';
import { insideRing } from '../scripts/lib/geom.mjs';

// Made-up places near (0, 0), in metres east and north.
const M = 1 / 111320;
const at = ([x, y]) => [x * M, y * M];
const hall = [[-30, -20], [30, -20], [30, 20], [-30, 20]].map(at);
const bus = (route, pts, props = {}) => ({ type: 'Feature', properties: { mode: 'bus', route, ...props }, geometry: { type: 'LineString', coordinates: pts.map(at) } });
const stop = (x, y) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: at([x, y]) } });
const points = (f) => (f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat());
const metres = (f) => points(f).map(([x, y]) => [x / M, y / M]);

test('the way round the block to a hall is taken out; a through route and a route that boards elsewhere are left', () => {
  // In from the west, round the block the hall stands in, and away south-west.
  const lap = bus('1', [[-400, -60], [-60, -60], [60, -60], [60, 60], [-60, 60], [-60, -50], [-400, -300]]);
  const through = bus('2', [[-400, -60], [400, -60]]);
  const [a, b] = shortenAtHall([lap, through], [hall], new Set(['1']));
  assert.ok(Math.max(...metres(a).map(([x]) => x)) < 0, 'the lap east round the hall is gone');
  assert.deepEqual(b, through);
  assert.deepEqual(shortenAtHall([lap], [hall], new Set(['9']))[0], lap);
  assert.deepEqual(shortenAtHall([lap], [], new Set(['1']))[0], lap);
});

test('no line is drawn through a hall: it ends at the edge each side', () => {
  const [f] = clipAtHalls([bus('1', [[-100, 0], [100, 0]])], [hall]);
  assert.equal(f.geometry.type, 'MultiLineString');
  assert.equal(f.geometry.coordinates.length, 2);
  for (const [x] of metres(f)) assert.ok(Math.abs(x) >= 29.9, `a point ${x.toFixed(1)} m from the middle is inside the hall`);
  // A line wholly inside goes; one that never meets the hall is untouched.
  assert.deepEqual(clipAtHalls([bus('1', [[-10, 0], [10, 0]])], [hall]), []);
  const clear = bus('1', [[-100, 50], [100, 50]]);
  assert.deepEqual(clipAtHalls([clear], [hall]), [clear]);
});

test("a street cut at a hall is measured again: a remnant isn't a long street", () => {
  // 200 m of street, of which 130 m lies west of the hall and 70 m east.
  const pieces = clipAtHalls([bus(undefined, [[-160, 0], [100, 0]], { routes: '1', len: 260 })], [hall], { split: true });
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces.map((f) => f.properties.len).sort((x, y) => x - y), [70, 130]);
  assert.ok(pieces.every((f) => f.geometry.type === 'LineString'));
  // A street that isn't cut keeps the length it came with.
  const [whole] = clipAtHalls([bus(undefined, [[-160, 50], [100, 50]], { routes: '1', len: 999 })], [hall], { split: true });
  assert.equal(whole.properties.len, 999);
});

test('a stop by a hall with no line near goes with the hall; one on a line, or far off, stays', () => {
  const alone = stop(0, 40); // 20 m north of the hall
  const onLine = stop(50, 0); // 20 m east of it, 10 m from a line
  const far = stop(0, 300);
  const taken = stopsOfHalls([alone, onLine, far], [hall], [[[60, -100], [60, 100]].map(at)]);
  assert.equal(taken, 1);
  assert.equal(alone.properties.terminal, 1);
  assert.equal(onLine.properties.terminal, undefined);
  assert.equal(far.properties.terminal, undefined);
  assert.ok(!insideRing(alone.geometry.coordinates, hall));
});
