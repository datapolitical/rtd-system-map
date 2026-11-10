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
  const jog = [[P(0, 0), P(60, 0), P(60, 4), P(120, 4)]];
  const at = zoom([entry('bus', '15', jog), entry('bus-casing', '15', jog)]);
  assert.equal(lineFaults(at).filter((f) => f.kind === 'step').length, 1);
});

// Lines as drawn (#55): ends and widths.
const drawnEntry = (layer, route, parts, { cap = 'butt', width = 6 } = {}) => ({ layer, route, source: 'routes', parts, drawn: parts, cap, width, drawnWidth: width });




test('a short piece inside another route line\'s width is covered, not a stray', () => {
  const wide = drawnEntry('bus', '15', [[P(0, 0), P(200, 0)]], { width: 12 });
  // A 2 px piece 4 px off the wide line's centre: within its 6 px half width.
  const piece = drawnEntry('bus', '16', [[P(100, 4), P(102, 4)]], { width: 2 });
  assert.deepEqual(lineFaults(zoom([wide, piece])).filter((f) => f.kind === 'short'), []);
  // The same piece 20 px away stands alone.
  const far = drawnEntry('bus', '16', [[P(100, 20), P(102, 20)]], { width: 2 });
  assert.equal(lineFaults(zoom([wide, far])).filter((f) => f.kind === 'short').length, 1);
});
