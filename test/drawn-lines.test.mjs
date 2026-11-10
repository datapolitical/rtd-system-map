// The line-fault checks on the drawn model (qa/drawn/lines.mjs): planted
// faults of the same size as the ones seen on the map (a piece short of its
// corner, a stub, a sideways jog) and the same geometry with the fault
// removed. No browser, no data, no build.
//
// The numbers are screen px at zoom 17 near the equator, where the ground
// scale is about 0.6 m to a pixel, so 30 m is about 50 px.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineFaults } from '../qa/drawn/lines.mjs';

const O = 2 ** 25; // the middle of the world at zoom 17 (512 tiles)
const P = (x, y) => [O + x, O + y];
const entry = (layer, route, parts) => ({ layer, route, source: 'routes', parts });
const zoom = (lines) => ({ z: 17, lines });

test('a clean line has no fault', () => {
  const at = zoom([entry('bus', '15', [[P(0, 0), P(40, 0), P(80, 0)]])]);
  assert.deepEqual(lineFaults(at).map((f) => f.kind), []);
});

test('two ends five px apart are a gap', () => {
  const at = zoom([entry('bus', '15', [[P(0, 0), P(40, 0)], [P(45, 0), P(80, 0)]])]);
  const faults = lineFaults(at).filter((f) => f.kind === 'gap');
  assert.equal(faults.length, 1);
  assert.match(faults[0].msg, /5\.0 px apart/);
});

test('two ends sixty px apart are a terminus, not a gap', () => {
  const at = zoom([entry('bus', '15', [[P(0, 0), P(40, 0)], [P(100, 0), P(140, 0)]])]);
  assert.deepEqual(lineFaults(at).map((f) => f.kind), []);
});

test('two pieces joined exactly are not a gap', () => {
  const at = zoom([entry('bus', '15', [[P(0, 0), P(40, 0)], [P(40, 0), P(80, 0)]])]);
  assert.deepEqual(lineFaults(at).map((f) => f.kind), []);
});

test('a piece two px long is a short', () => {
  const at = zoom([entry('bus', '15', [[P(0, 0), P(2, 0)]])]);
  const faults = lineFaults(at).filter((f) => f.kind === 'short');
  assert.equal(faults.length, 1);
  assert.match(faults[0].msg, /2\.0 px long/);
});

test('a sideways jog between two parallel runs is a step', () => {
  const at = zoom([entry('bus', '15', [[P(0, 0), P(60, 0), P(60, 4), P(120, 4)]])]);
  const faults = lineFaults(at).filter((f) => f.kind === 'step');
  assert.equal(faults.length, 1);
  assert.match(faults[0].msg, /sideways 4\.0 px/);
});

test('a square corner is not a step', () => {
  const at = zoom([entry('bus', '15', [[P(0, 0), P(60, 0), P(60, 60)]])]);
  assert.deepEqual(lineFaults(at).map((f) => f.kind), []);
});

test('the casing does not report the line fault a second time', () => {
  const at = zoom([
    entry('bus', '15', [[P(0, 0), P(40, 0)], [P(44, 0), P(80, 0)]]),
    entry('bus-casing', '15', [[P(0, 0), P(40, 0)], [P(44, 0), P(80, 0)]]),
  ]);
  assert.equal(lineFaults(at).filter((f) => f.kind === 'gap').length, 1);
});
