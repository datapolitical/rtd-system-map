// Geometry helpers: what a line does when it meets a ring it may not cross.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipOutRings, insideRing } from '../scripts/lib/geom.mjs';

const RING = [
  [0.001, 0.001],
  [0.003, 0.001],
  [0.003, 0.003],
  [0.001, 0.003],
];

test('a ring is closed from its last point back to its first', () => {
  assert.equal(insideRing([0.002, 0.002], RING), true);
  assert.equal(insideRing([0.004, 0.002], RING), false);
});

test('a line outside the ring is left as it is', () => {
  const line = [[0, 0], [0, 0.0005]];
  assert.deepEqual(clipOutRings(line, [RING]), [line]);
});

test('a line that ends inside the ring is cut where it enters', () => {
  const line = [[0, 0], [0.002, 0.002]];
  const parts = clipOutRings(line, [RING]);
  assert.equal(parts.length, 1);
  assert.ok(Math.abs(parts[0].at(-1)[0] - 0.001) < 1e-6 && Math.abs(parts[0].at(-1)[1] - 0.001) < 1e-6, `enters at the corner, got ${parts[0].at(-1)}`);
});

test('a line across the ring becomes two pieces, one each side', () => {
  const line = [[0, 0.002], [0.004, 0.002]];
  const parts = clipOutRings(line, [RING]);
  assert.equal(parts.length, 2);
  assert.ok(parts[0].at(-1)[0] < 0.0011, 'ends at the west edge');
  assert.ok(parts[1][0][0] > 0.0029, 'starts at the east edge');
});
