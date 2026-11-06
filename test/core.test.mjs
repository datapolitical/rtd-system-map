import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coreBounds } from '../scripts/lib/core.mjs';

const route = (coordinates, wk_trips) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { wk_trips } });
// A line as points 0.01 degrees apart, so service is spread along it.
const line = ([x0, y0], [x1, y1]) => {
  const n = Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 0.01);
  return Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
};

test('the core is where the trips are, not where the lines reach', () => {
  const box = coreBounds([
    // A busy cross in town.
    route(line([-0.1, 0], [0.1, 0]), 200),
    route(line([0, -0.1], [0, 0.1]), 200),
    // A commuter run far out to the north-west, six trips a day.
    route(line([-0.1, 0.1], [-1, 1]), 6),
  ]);
  const [[west, south], [east, north]] = box;
  assert.ok(west >= -0.1 && east <= 0.1, `west ${west}, east ${east}`);
  assert.ok(south >= -0.1 && north <= 0.1, `south ${south}, north ${north}`);
  // The middle of the cross is inside it.
  assert.ok(west < 0 && east > 0 && south < 0 && north > 0);
});

test('a bigger share is a bigger box', () => {
  const routes = [route(line([-1, 0], [1, 0]), 50), route(line([0, -1], [0, 1]), 50)];
  const [[w6, s6], [e6, n6]] = coreBounds(routes, 0.6);
  const [[w9, s9], [e9, n9]] = coreBounds(routes, 0.9);
  assert.ok(w9 < w6 && e9 > e6 && s9 < s6 && n9 > n6);
});

test('no weekday service, no core', () => {
  assert.equal(coreBounds([route(line([0, 0], [1, 0]), 0)]), null);
  assert.equal(coreBounds([]), null);
});
