import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeLine } from '../scripts/lib/routeline.mjs';
import { length } from '../scripts/lib/sheets.mjs';

const turn = (a, b, c) => {
  const u = [b[0] - a[0], b[1] - a[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI;
};

test('a route line is one path through its streets: joined, bridged, stubs and a close second street dropped', () => {
  const pieces = [
    [[0, 0], [50, 0]],
    [[50, 0], [100, 0]],
    [[106, 0], [160, 0]], // a 6 px gap
    [[30, 0], [30, 3]], // a 3 px stub
    [[60, 2], [90, 2]], // the other street of a one-way pair, 2 px off
  ];
  const { paths, bridged, gaps } = routeLine(pieces, { snap: 2, stub: 6, apart: 4, bridge: 10, sigma: 3 });
  assert.equal(paths.length, 1, 'one path');
  assert.equal(gaps, 0);
  assert.equal(bridged, 1);
  assert.ok(Math.abs(length(paths[0]) - 160) < 1, 'end to end');
  assert.deepEqual([paths[0][0], paths[0].at(-1)].map((q) => q.map(Math.round)).sort((a, b) => a[0] - b[0]), [[0, 0], [160, 0]], 'its ends stay put');
});

test('a stair step between near streets is drawn as a bend, and a loop far off is kept', () => {
  const step = [[[0, 0], [40, 0], [40, 6], [80, 6]]];
  const { paths } = routeLine(step, { sigma: 3 });
  const p = paths[0];
  let sharpest = 0;
  for (let i = 1; i < p.length - 1; i++) sharpest = Math.max(sharpest, turn(p[i - 1], p[i], p[i + 1]));
  assert.ok(sharpest < 60, `no turn sharper than 60° (was ${sharpest.toFixed(0)}°)`);
  const loop = [[[0, 0], [100, 0]], [[40, 0], [40, 20], [60, 20], [60, 0]]];
  assert.equal(routeLine(loop, { apart: 4 }).paths.length, 2, 'a branch standing off the main path stays');
});
