// Label faults on the drawn model (qa/drawn/labels.mjs): placement, a name
// over a line, a name with no room, a name far from its mark. Planted faults
// the size of the ones seen on the map, on synthetic geometry — no browser,
// no data, no build.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelFaults, placeLabels } from '../qa/drawn/labels.mjs';

const line = { layer: 'rail', parts: [[[0, 100], [200, 100]]] };
const frame = (labels, marks = []) => ({ labels, marks, lines: [line], width: 390, height: 664 });
const label = (text, box, id = 1, layer = 'station-labels') => ({
  layer,
  text,
  properties: { id, name: text },
  at: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
  candidates: [{ box }],
});

test('a name over a line is a fault', () => {
  const faults = labelFaults(frame([label('Union Station', [80, 90, 120, 110])]));
  assert.equal(faults.filter((f) => f.kind === 'over-line').length, 1);
});

test('a name over a light street is not a fault', () => {
  const light = { layer: 'street', route: '20', properties: { cls: 'c30' }, parts: [[[0, 100], [200, 100]]] };
  const f = { ...frame([label('Empower Field', [80, 90, 120, 110])]), lines: [light] };
  assert.deepEqual(labelFaults(f), []);
});

test('a name over the rail it serves is not a fault', () => {
  const mine = { ...line, route: 'R' };
  const l = label('Nine Mile', [80, 90, 120, 110]);
  l.properties.lines = 'R';
  const f = { ...frame([l]), lines: [mine] };
  assert.deepEqual(labelFaults(f), []);
});

test('a name over rail it does not serve is a fault', () => {
  const other = { ...line, route: 'R' };
  const l = label('Nine Mile', [80, 90, 120, 110]);
  l.properties.lines = 'A';
  const f = { ...frame([l]), lines: [other] };
  assert.equal(labelFaults(f).filter((x) => x.kind === 'over-line').length, 1);
});

test('a name clear of the line is not a fault', () => {
  const faults = labelFaults(frame([label('Union Station', [80, 40, 120, 60])]));
  assert.deepEqual(faults, []);
});

test('two names in one place: one is placed, one has no room', () => {
  const at = [100, 40, 160, 60];
  const faults = labelFaults(frame([label('A', at, 1), label('B', at, 2)]));
  const hidden = faults.filter((f) => f.kind === 'hidden');
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].text, 'B');
});

test('a second candidate is used when the first one collides', () => {
  const first = { box: [80, 40, 120, 60] };
  const second = { box: [80, 140, 120, 160] };
  const l = label('A', first.box);
  l.candidates = [first, second];
  const { placed } = placeLabels([l], { width: 390, height: 664 });
  const blocker = label('B', [70, 30, 130, 70], 2);
  const r = placeLabels([blocker, l], { width: 390, height: 664 });
  assert.equal(r.placed.length, 2);
  assert.deepEqual(r.placed[1].box, second.box);
  assert.equal(placed.length, 1);
});

test('a name far from its mark is a fault', () => {
  const l = label('Far', [300, 300, 340, 320]);
  const mark = { layer: 'stations', properties: { id: 1 }, at: [100, 100] };
  const faults = labelFaults(frame([l], [mark]));
  assert.equal(faults.filter((f) => f.kind === 'far').length, 1);
  assert.match(faults.find((f) => f.kind === 'far').msg, /px from its mark/);
});

test('a box wholly off the screen is not placed and not a fault', () => {
  const l = label('Off', [-100, -100, -60, -80]);
  const { placed, hidden } = placeLabels([l], { width: 390, height: 664 });
  assert.equal(placed.length, 0);
  assert.equal(hidden.length, 0);
});
