import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { SIZES, names } from '../scripts/lib/sheets.mjs';
import { withZoom, zoomStops } from '../scripts/zoom-prototype.mjs';
import { previewStyle } from '../public/js/zoom/style.js';
import { attachedPoint, pixels, coordinate, sizeAt, pitchAt, frameAt, labelChanges } from '../public/js/zoom/model.js';
import { railOrderErrors } from '../qa/lib/zoom-order.mjs';
import { canonicalTracks, fitTerminalSpines } from '../scripts/lib/zoom-rail.mjs';
import { spacingReport, terminalGaps } from '../qa/lib/zoom-spacing.mjs';

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

test('shared tracks use one rounded curve, including a line travelling in reverse', () => {
  const x = pixels([-105, 39.75]);
  const at = (i, y = 0) => [x[0] + i, x[1] + y];
  const original = Array.from({ length: 81 }, (_, i) => [...at(i), -0.5]);
  const reverse = [...original].reverse().map(([a, b]) => [a, b, -0.5]);
  const raw = { pitch: 6.8, joined: [{ route: '1', color: '#123456' }, { route: '2', color: '#654321' }],
    tracks: [[{ pts: original, track: original.map((p, i) => at(i, Math.sin(i / 80 * Math.PI) * 4)) }],
      [{ pts: reverse, track: reverse.map((p, i) => at(80 - i, -Math.sin(i / 80 * Math.PI) * 3)) }]] };
  const [a, b] = canonicalTracks(raw, { zoom: 13 });
  for (let i = 0; i < a.center.length; i++) assert.ok(Math.hypot(a.center[i][0] - b.center[80 - i][0], a.center[i][1] - b.center[80 - i][1]) < 1e-7);
  assert.ok(raw.tracks[1][0].track[40][1] < x[1], 'input geometry is not mutated');
});

test('spacing detector catches the actual tapered pack and overlapping strokes', () => {
  const pin = JSON.parse(readFileSync(new URL('../qa/recall/prototype-spacing.json', import.meta.url), 'utf8'));
  const results = spacingReport(pin);
  assert.ok(results.some((r) => r.pair.join('') === 'BN' && !r.ok && r.minimumVisibleGap < 0));
});

test('spacing detector accepts parallel strokes and rejects taper independently of zoom', () => {
  const sample = { pairs: [['1', '2']], bounds: [0, 0, 100, 100], pitch: 7, width: 5,
    paths: { '1': [[[10, 10], [10, 90]]], '2': [[[17, 10], [17, 90]]] } };
  assert.equal(spacingReport(sample)[0].ok, true);
  sample.paths['2'] = [[[17, 10], [13, 90]]];
  assert.equal(spacingReport(sample)[0].ok, false);
});

test('shared terminal curves end at their bar and preserve spacing for opposite path directions', () => {
  const center = Array.from({ length: 101 }, (_, x) => [x, 0]);
  const tracks = [{ route: '1', run: 0, center: structuredClone(center), slots: center.map(() => -0.5) },
    { route: '2', run: 0, center: [...center].reverse().map((p) => [...p]), slots: center.map(() => -0.5) }];
  const lines = [{ route: '1', paths: [[[10, -3.4], [40, -3.4], [100, -3.4]]] },
    { route: '2', paths: [[[100, 3.4], [40, 3.4], [10, 3.4]]] }];
  const marks = [{ bars: [{ ends: [[10, -3.4], [10, 3.4]], ending: [{ route: '1' }, { route: '2' }] }] }];
  fitTerminalSpines(tracks, lines, marks, 6.8);
  assert.deepEqual(tracks[0].center[0], [10, 0]);
  assert.deepEqual(tracks[1].center.at(-1), [10, 0]);
  assert.deepEqual(tracks[0].center.at(-1), [100, 0]);
  assert.equal(tracks[0].center.length, tracks[1].center.length);
  for (let i = 0; i < tracks[0].center.length; i++) assert.deepEqual(tracks[0].center[i], tracks[1].center.at(-1 - i));
  assert.ok(tracks.every((t) => t.slots.every((slot) => slot === -0.5)));
});

test('terminal check rejects a rail that protrudes beyond its station bar', () => {
  const [x, y] = pixels([-105, 39.75]);
  const at = (dx, dy) => coordinate([x + dx, y + dy]);
  const rail = { type: 'Feature', properties: { route: '1', key: '1:0:0', slot: 0 }, geometry: { type: 'LineString', coordinates: [at(0, 0), at(50, 0)] } };
  const bar = (dx) => ({ type: 'Feature', properties: { kind: 'station', lines: '1', name: 'Example' }, geometry: { type: 'LineString', coordinates: [at(dx, -4), at(dx, 4)] } });
  const bundle = { sizes, rails: { features: [rail] }, attached: { features: [bar(0), bar(50)] } };
  assert.ok(terminalGaps(bundle, 13).every((r) => r.ok));
  rail.geometry.coordinates[0] = at(-10, 0);
  assert.ok(terminalGaps(bundle, 13).some((r) => !r.ok));
});
