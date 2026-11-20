import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { SIZES, names } from '../scripts/lib/sheets.mjs';
import { withZoom, zoomStops } from '../scripts/zoom-prototype.mjs';
import { previewStyle } from '../public/js/zoom/style.js';
import { attachedPoint, pixels, coordinate, sizeAt, pitchAt, frameAt, labelChanges } from '../public/js/zoom/model.js';
import { railOrderErrors } from '../qa/lib/zoom-order.mjs';

const sizes = Object.fromEntries(['rail', 'gap', 'name', 'nameLetter', 'letterDisc'].map((key) => [key, zoomStops(SIZES[key])]));
test('zoom adapter preserves every original size and restores tables after a failure', () => {
  const before = structuredClone(SIZES);
  withZoom(13.25, (s) => assert.equal(SIZES.rail[s.id], 5.15));
  assert.deepEqual(SIZES, before);
  assert.throws(() => withZoom(12.25, () => { throw new Error('interrupted draw'); }));
  assert.deepEqual(SIZES, before);
  for (const [zoom, value] of sizes.rail) assert.equal(sizeAt(sizes.rail, zoom), value);
});

test('two slot attachments keep their screen spacing at fractional zooms in both directions', () => {
  const [x, y] = pixels([-105, 39.75]);
  const reference = pitchAt(sizes, 13);
  for (const zoom of [12, 12.01, 12.49, 12.99, 13, 13.01, 13.51, 13.99, 14].flatMap((z) => [z, 26 - z])) {
    const a = pixels(attachedPoint([x, y, -reference / 2, 0], sizes, zoom), zoom);
    const b = pixels(attachedPoint([x, y, reference / 2, 0], sizes, zoom), zoom);
    assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - pitchAt(sizes, zoom)) < 1e-7);
  }
  const p = [-104.9, 39.7];
  const q = coordinate(pixels(p));
  assert.ok(q.every((v, i) => Math.abs(v - p[i]) < 1e-10));
});

const mark = { id: 1, name: 'Example', lines: 'A', count: 1, hub: false, end: false,
  ends: [[100, 100], [100, 100]], more: [], bars: [{ ends: [[100, 100], [100, 100]], ending: [] }] };
test('a viable preceding label side wins over the normal placement preference', () => {
  const history = new Map([['1:0', { historyKey: '1:0', anchor: 'right', text: 'Example', reach: 1, inkCost: 0 }]]);
  const [ordinary] = names([mark], [], [], { id: 2, zoom: 12 }, [], null, { alternates: false });
  const [stable] = names([mark], [], [], { id: 2, zoom: 12 }, [], history, { alternates: false });
  assert.equal(ordinary.anchor, 'left');
  assert.equal(stable.anchor, 'right');
  assert.equal(stable.placement.retained, true);
});

test('obstructed preceding names can move and report a concrete reason', () => {
  const history = new Map([['1:0', { anchor: 'right', text: 'Example', reach: 1, inkCost: 0 }]]);
  const street = { cls: 'c10', routes: '1', path: [[-100, 100], [90, 100]] };
  const [stable] = names([mark], [], [], { id: 2, zoom: 12 }, [street], history, { alternates: false });
  assert.notEqual(stable.anchor, 'right');
  assert.match(stable.placement.reason, /obstruction/);
});

test('frames advance at boundaries without rounding a fractional camera zoom', () => {
  const frames = [12, 12.25, 12.5, 12.75, 13, 13.25, 13.5, 13.75, 14].map((zoom) => ({ zoom }));
  assert.equal(frameAt(frames, 12.99).zoom, 12.75);
  assert.equal(frameAt(frames, 13).zoom, 13);
  assert.equal(frameAt(frames, 12.99, 0.5).zoom, 12.5);
  assert.equal(frameAt(frames, 14).zoom, 14);
  const n = { key: '1:0', name: 'Example', anchor: 'left' };
  assert.equal(labelChanges([n], [{ ...n, anchor: 'right', reason: 'obstruction' }]).changed, 1);
  assert.deepEqual(labelChanges([n], []).disappeared, ['1:0']);
});

test('both comparison styles validate in both themes, including all fractional-zoom expressions', () => {
  const bundle = { sizes, rails: { type: 'FeatureCollection', features: [] } };
  for (const theme of ['light', 'dark']) for (const mode of ['offset', 'drawn']) {
    assert.deepEqual(validateStyleMin(previewStyle(theme, { stations: [], colors: [] }, bundle, mode)).map((e) => e.message), [], `${theme}/${mode}`);
    assert.deepEqual(railOrderErrors(previewStyle(theme, { stations: [], colors: [] }, bundle, mode)), []);
  }
});

test('the rail-order check catches the actual broken preview, pinned before its fix', () => {
  const bad = JSON.parse(readFileSync(new URL('../qa/recall/prototype-layer-order.json', import.meta.url), 'utf8'));
  assert.ok(railOrderErrors(bad).some((e) => e.includes('bus-rim-3')));
});
