// Mark faults (qa/drawn/marks.mjs): planted duplicates, a stray stop and a
// translucent fill, on synthetic frames — no browser, no data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markFaults } from '../qa/drawn/marks.mjs';

const stop = (id, at, lines, name = `Stop ${id}`) => ({ layer: 'stops', at, properties: { id, name, lines } });
const station = (id, at, layer = 'stations') => ({ layer, at, properties: { id } });

test('one station mark is not a fault', () => {
  const frame = { marks: [station(1, [100, 100])], lines: [], areas: [] };
  assert.deepEqual(markFaults(frame), []);
});

test('two station marks for one station are a fault', () => {
  const frame = { marks: [station(1, [100, 100]), station(1, [101, 100])], lines: [], areas: [] };
  const faults = markFaults(frame);
  assert.equal(faults.filter((f) => f.kind === 'duplicate').length, 1);
});

test('a stop far from every line of its route is a fault', () => {
  const line = { layer: 'street', route: '15', parts: [[[0, 300], [390, 300]]] };
  const frame = { marks: [stop(7, [100, 100], '15')], lines: [line], areas: [] };
  const faults = markFaults(frame);
  assert.equal(faults.filter((f) => f.kind === 'stray-stop').length, 1);
  assert.match(faults[0].msg, /px from every line it rides/);
});

test('a stop at the curb of its line is not a fault', () => {
  const line = { layer: 'street', route: '15', parts: [[[0, 300], [390, 300]]] };
  const frame = { marks: [stop(7, [100, 290], '15')], lines: [line], areas: [] };
  assert.deepEqual(markFaults(frame), []);
});

test('a stop whose route is not drawn is not judged', () => {
  const frame = { marks: [stop(7, [100, 100], '99')], lines: [], areas: [] };
  assert.deepEqual(markFaults(frame), []);
});

test('a translucent fill over a mark is a lead', () => {
  const area = { layer: 'bus-terminal-under', opacity: 0.5, parts: [[[50, 50], [150, 50], [150, 150], [50, 150]]] };
  const frame = { marks: [station(1, [100, 100])], lines: [], areas: [area] };
  const faults = markFaults(frame);
  assert.equal(faults.filter((f) => f.kind === 'translucent').length, 1);
});
