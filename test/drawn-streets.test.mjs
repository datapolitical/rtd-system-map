// Street alignment (qa/drawn/streets.mjs): a route on a street is clean, a
// route that leaves the street grid for several vertices is a fault, and a
// train in its own corridor is not judged.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streetFaults } from '../qa/drawn/streets.mjs';

const street = { parts: [[[0, 100], [390, 100]]] };
const frame = (line) => ({ lines: [line], basemap: { streets: [street] } });

test('a route on a street is not a fault', () => {
  const line = { layer: 'street-strand-1', route: '15', parts: [[[10, 102], [200, 102], [380, 102]]] };
  assert.deepEqual(streetFaults(frame(line)), []);
});

test('a route that leaves the street grid is a fault', () => {
  const line = { layer: 'street-strand-1', route: '15', parts: [[[10, 102], [100, 200], [200, 200], [300, 200]]] };
  const faults = streetFaults(frame(line));
  assert.equal(faults.length, 1);
  assert.equal(faults[0].kind, 'off-street');
  assert.equal(faults[0].route, '15');
});

test('one stray vertex is not a fault', () => {
  const line = { layer: 'street-strand-1', route: '15', parts: [[[10, 102], [200, 102], [380, 102], [380, 400]]] };
  assert.deepEqual(streetFaults(frame(line)), []);
});

test('a train in its own corridor is not judged', () => {
  const line = { layer: 'rail', route: 'A', parts: [[[10, 300], [100, 300], [200, 300]]] };
  assert.deepEqual(streetFaults(frame(line)), []);
});
