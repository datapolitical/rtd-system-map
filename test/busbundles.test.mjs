import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busBundles } from '../scripts/lib/busbundles.mjs';

// Made-up routes near (0, 0), in km (a kilometer is 1/111.32 degree either
// way), with a point every 50 m so the bundler has something to work with.
const KM = 1 / 111.32;
const dense = (pts) => {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
};
const line = (route, pts, parts = null) => ({
  type: 'Feature',
  geometry: parts
    ? { type: 'MultiLineString', coordinates: parts.map((p) => dense(p).map(([x, y]) => [x * KM, y * KM])) }
    : { type: 'LineString', coordinates: dense(pts).map(([x, y]) => [x * KM, y * KM]) },
  properties: { route, tier: 'frequent', stretch: 0 },
});
const km = ([lon, lat]) => [lon / KM, lat / KM];
const bundled = (features, route) => features.filter((f) => f.properties.route === route && 'slot' in f.properties);
const points = (pieces) => pieces.flatMap((f) => (f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat()).map(km));
const at = ([lon, lat]) => [lon * KM, lat * KM];

test('a one-way pair a block apart is two streets: each route stays on its own', () => {
  // A and C run north on x = 0; B runs south on x = 0.15 km, the other half
  // of the couplet, and meets them at both ends.
  const { features } = busBundles([
    line('A', [[0, -1], [0, 3]]),
    line('C', [[0, -1], [0, 3]]),
    line('B', [[0, 3], [0.15, 3], [0.15, -1], [0, -1]]),
  ]);
  assert.ok(bundled(features, 'A').length && bundled(features, 'C').length, 'A and C bundle');
  // B is drawn on its own street, not pulled onto A and C's: its vertices
  // are on one street or the other (none between), and the ones on A's
  // are only where the couplet closes.
  const b = points(bundled(features, 'B'));
  assert.ok(b.some(([x]) => Math.abs(x - 0.15) * 1000 < 40), 'B is drawn along its street');
  for (const [x, y] of b) {
    const own = Math.abs(x - 0.15) * 1000 < 40;
    assert.ok(own || Math.abs(x) * 1000 < 40, `B is on a street (${(x * 1000).toFixed(0)} m east)`);
    if (!own) assert.ok(y > 2.9 || y < -0.9, `B is on A's street only where the pair closes (y ${y.toFixed(2)} km)`);
  }
});

test('a line ending in a lap of a block ends where the lap begins', () => {
  // A and B share x = 0 north to y = 2; A then laps a 200 m block and comes
  // back to its own path, and B ends.
  const { features } = busBundles([
    line('A', [[0, -2], [0, 2], [0, 2.2], [0.2, 2.2], [0.2, 2], [0, 2]]),
    line('B', [[0, -2], [0, 2]]),
  ]);
  const a = points(bundled(features, 'A'));
  assert.ok(a.length, 'A is drawn');
  assert.ok(Math.max(...a.map(([, y]) => y)) < 2.1, 'the lap is left out');
  assert.ok(a.every(([x]) => Math.abs(x) * 1000 < 40), 'A never leaves its street');
});

test('a line that ends at a terminal ends at its edge; one passing through keeps going', () => {
  // T is a transit center at (0.1, 2). A ends there, swinging into it; C
  // runs on north past it on the same street.
  const T = [0.1, 2];
  const { features } = busBundles(
    [line('A', [[0, -2], [0, 2], [0.1, 2], [0.1, 2.05]]), line('C', [[0, -2], [0, 4]])],
    { terminals: [at(T)], ends: { A: [at([0.1, 2.05])] } },
  );
  const far = ([x, y]) => Math.hypot(x - T[0], y - T[1]) * 1000;
  const a = points(bundled(features, 'A'));
  assert.ok(a.length, 'A is drawn');
  assert.ok(a.every((p) => far(p) >= 149), `A ends at the terminal's edge (${Math.min(...a.map(far)).toFixed(0)} m)`);
  const c = points(bundled(features, 'C'));
  assert.ok(c.some((p) => far(p) <= 110), 'C goes on through');
  assert.ok(Math.max(...c.map(([, y]) => y)) > 3.9, 'C reaches its end');
});

test('a street drawn block by block, each block twice, is one run', () => {
  // A's path comes as 100 m blocks, each given once per direction; B is
  // one piece. Both should be drawn along the whole 2 km.
  const blocks = [];
  for (let y = 0; y < 2; y += 0.1) {
    blocks.push([[0, y], [0, y + 0.1]]);
    blocks.push([[0, y + 0.1], [0, y]]);
  }
  const { features } = busBundles([line('A', null, blocks), line('B', [[0, 0], [0, 2]])]);
  for (const route of ['A', 'B']) {
    const ys = points(bundled(features, route)).map(([, y]) => y);
    assert.ok(ys.length, `${route} is drawn`);
    assert.ok(Math.min(...ys) < 0.15 && Math.max(...ys) > 1.85, `${route} covers the street (${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)})`);
  }
});

test('the originals come along marked flat, for the zooms below bundling', () => {
  const input = [line('A', [[0, 0], [0, 2]]), line('B', [[0, 0], [0, 2]])];
  const { features } = busBundles(input);
  const flat = features.filter((f) => 'flat' in f.properties);
  assert.equal(flat.length, 2);
  assert.ok(flat.every((f) => !('slot' in f.properties)));
  assert.deepEqual(flat.map((f) => f.geometry), input.map((f) => f.geometry));
});
