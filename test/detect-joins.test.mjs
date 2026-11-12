// The data check on rail pieces (qa/lib/detect.mjs, routeJoins): a line's
// pieces join end to end in slots no more than an easing step apart, except
// where another line of the pack ends, under that line's end mark.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeJoins } from '../qa/lib/detect.mjs';

const piece = (route, slot, coordinates) => ({ type: 'Feature', properties: { mode: 'rail', route, slot }, geometry: { type: 'LineString', coordinates } });
const collection = (features) => ({ type: 'FeatureCollection', features });

test('a sideways step where two pieces of a line join is a fault', () => {
  const faults = routeJoins(collection([piece('X', 0.5, [[-105, 39.7], [-105, 39.71]]), piece('X', 0, [[-105, 39.71], [-105, 39.72]])]));
  assert.deepEqual(faults.map((f) => f.kind), ['slot-jump']);
});

test('a step abreast of the end of another line is not: the pack changes width under that end mark', () => {
  const x = [piece('X', 0.5, [[-105, 39.7], [-105, 39.71]]), piece('X', 0, [[-105, 39.71], [-105, 39.72]])];
  // Y ends where X steps.
  assert.deepEqual(routeJoins(collection([...x, piece('Y', -0.5, [[-105, 39.7], [-105, 39.71]])])), []);
  // Y runs on past it in two pieces: nothing ends there, and the step is a fault.
  const through = [piece('Y', -0.5, [[-105, 39.7], [-105, 39.71]]), piece('Y', -0.5, [[-105, 39.71], [-105, 39.72]])];
  assert.deepEqual(routeJoins(collection([...x, ...through])).map((f) => f.kind), ['slot-jump']);
});
