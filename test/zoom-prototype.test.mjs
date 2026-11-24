import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { SIZES, names } from '../scripts/lib/sheets.mjs';
import { withZoom, zoomStops } from '../scripts/zoom-prototype.mjs';
import { previewStyle } from '../public/js/zoom/style.js';
import { attachedPoint, pixels, coordinate, sizeAt, pitchAt, frameAt, labelChanges,
  labelsAt, SIDE_HOLD, FADE_OUT_MS, FADE_IN_MS, busDrawingAt, BUS_HOLD, BUS_LINE_MS } from '../public/js/zoom/model.js';
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

test('the preview style validates in both themes, including all fractional-zoom expressions', () => {
  const bundle = { sizes, rails: { type: 'FeatureCollection', features: [] } };
  for (const theme of ['light', 'dark']) {
    assert.deepEqual(validateStyleMin(previewStyle(theme, { stations: [], colors: [] }, bundle)).map((e) => e.message), [], theme);
    assert.deepEqual(railOrderErrors(previewStyle(theme, { stations: [], colors: [] }, bundle)), []);
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

// Two names: 'a' keeps its side and steps its distance between drawings; 'b' changes side.
const labelFrames = () => [12, 12.25].map((zoom, i) => ({ zoom, labels: { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { kind: 'name', key: 'a', text: 'Alpha', anchor: 'left', offset: [i ? 2 : 1, 0] },
    geometry: { type: 'Point', coordinates: [-105, 39.75] } },
  { type: 'Feature', properties: { kind: 'name', key: 'b', text: 'Beta', anchor: i ? 'top' : 'bottom', offset: [0, i ? -1 : 1] },
    geometry: { type: 'Point', coordinates: [-104.99, 39.75] } },
  { type: 'Feature', properties: { kind: 'letter', small: true, key: 'b:A', route: 'A' },
    geometry: { type: 'Point', coordinates: [-104.99, 39.75 + (i ? 0.001 : -0.001)] } },
] } }));
const shownAt = (frames, zoom, state, now, options) => {
  const { collection, busy } = labelsAt(frames, zoom, sizes, state, now, options);
  const by = (key) => collection.features.filter((f) => f.properties.key === key);
  return { busy, a: by('a'), b: by('b'), chip: by('b:A') };
};

test('a name that keeps its side glides between drawings instead of stepping', () => {
  const frames = labelFrames(), state = { sides: new Map(), fades: new Map() };
  for (const [zoom, x] of [[12, 1], [12.0625, 1.25], [12.125, 1.5], [12.25, 2]]) {
    const { a } = shownAt(frames, zoom, state, 0);
    assert.equal(a.length, 1);
    assert.ok(Math.abs(a[0].properties.offset[0] - x) < 1e-9, `offset at ${zoom}`);
    assert.equal(a[0].properties.fade, undefined);
  }
});

test('a side change waits past halfway, fades out then in, and never shows both places', () => {
  const frames = labelFrames(), state = { sides: new Map(), fades: new Map() };
  const hold = 12 + 0.25 * (0.5 + SIDE_HOLD);
  assert.equal(shownAt(frames, 12.1, state, 0).b[0].properties.anchor, 'bottom');
  // Halfway is not enough: the old side holds until SIDE_HOLD past it.
  assert.equal(shownAt(frames, hold - 0.005, state, 0).b[0].properties.anchor, 'bottom');
  const start = 1000;
  let seen = shownAt(frames, hold + 0.005, state, start);
  assert.ok(seen.busy);
  assert.equal(seen.b.length, 1);
  assert.equal(seen.b[0].properties.anchor, 'bottom');
  assert.equal(seen.b[0].properties.fade ?? 1, 1);
  seen = shownAt(frames, hold + 0.005, state, start + FADE_OUT_MS / 2);
  assert.equal(seen.b[0].properties.anchor, 'bottom');
  assert.ok(Math.abs(seen.b[0].properties.fade - 0.5) < 1e-9);
  assert.equal(seen.chip[0].properties.fade, seen.b[0].properties.fade, 'chips fade with their name');
  seen = shownAt(frames, hold + 0.005, state, start + FADE_OUT_MS + FADE_IN_MS / 2);
  assert.equal(seen.b.length, 1);
  assert.equal(seen.b[0].properties.anchor, 'top');
  assert.ok(Math.abs(seen.b[0].properties.fade - 0.5) < 1e-9);
  seen = shownAt(frames, hold + 0.005, state, start + FADE_OUT_MS + FADE_IN_MS + 1);
  assert.equal(seen.busy, false);
  assert.equal(seen.b[0].properties.anchor, 'top');
  assert.equal(seen.b[0].properties.fade, undefined);
  // Zooming back, it stays on its new side until the same distance past halfway.
  const back = 12 + 0.25 * (0.5 - SIDE_HOLD);
  assert.equal(shownAt(frames, back + 0.005, state, 5000).b[0].properties.anchor, 'top');
  const returning = shownAt(frames, back - 0.005, state, 6000);
  assert.ok(returning.busy);
  assert.equal(returning.b[0].properties.anchor, 'top', 'it fades out where it was first');
});

test('a shaky pinch across halfway does not make a name blink', () => {
  const frames = labelFrames(), state = { sides: new Map(), fades: new Map() };
  for (const [i, t] of [0.3, 0.55, 0.45, 0.6, 0.4, 0.65, 0.35].entries()) {
    const seen = shownAt(frames, 12 + 0.25 * t, state, i * 1000);
    assert.equal(seen.busy, false);
    assert.equal(seen.b[0].properties.anchor, 'bottom');
  }
});

test('turning back while a name fades out brings it straight back, with no flash of the new place', () => {
  const frames = labelFrames(), state = { sides: new Map(), fades: new Map() };
  shownAt(frames, 12, state, 0);
  shownAt(frames, 12.24, state, 1000);
  const half = shownAt(frames, 12.24, state, 1000 + FADE_OUT_MS / 2).b[0].properties.fade;
  const back = shownAt(frames, 12.01, state, 1000 + FADE_OUT_MS / 2);
  assert.equal(back.b[0].properties.anchor, 'bottom');
  assert.ok(Math.abs(back.b[0].properties.fade - half) < 1e-9);
  const later = shownAt(frames, 12.01, state, 1000 + FADE_OUT_MS / 2 + FADE_IN_MS);
  assert.equal(later.b[0].properties.anchor, 'bottom');
  assert.equal(later.busy, false);
});

test('with reduced motion a side change is immediate', () => {
  const frames = labelFrames(), state = { sides: new Map(), fades: new Map() };
  shownAt(frames, 12, state, 0, { motion: false });
  const seen = shownAt(frames, 12.24, state, 1, { motion: false });
  assert.equal(seen.busy, false);
  assert.equal(seen.b[0].properties.anchor, 'top');
  assert.equal(seen.b[0].properties.fade, undefined);
});

test('the trial build shows every name exactly once at every zoom through a sweep', () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/data/zoom-prototype/trial.json', import.meta.url)));
  const state = { sides: new Map(), fades: new Map() };
  const total = bundle.frames[0].labels.features.filter((f) => f.properties.kind === 'name').length;
  let now = 0;
  for (const zoom of [...Array(201).keys()].map((i) => 12 + i / 100).concat([...Array(201).keys()].map((i) => 14 - i / 100))) {
    now += 16;
    const { collection } = labelsAt(bundle.frames, zoom, bundle.sizes, state, now);
    const keys = collection.features.filter((f) => f.properties.kind === 'name').map((f) => f.properties.key);
    assert.equal(keys.length, total, `names at ${zoom}`);
    assert.equal(new Set(keys).size, total, `duplicate name at ${zoom}`);
  }
});

test('each bus drawing serves from its own zoom up to the next, holding a little when zooming out', () => {
  const state = {};
  const at = (zoom, now = 0) => busDrawingAt(zoom, state, now, { motion: false }).set;
  assert.equal(at(12), '2');
  assert.equal(at(12.99), '2');
  assert.equal(at(13), '13', 'the closer drawing takes over at its own zoom, never squeezed below it');
  assert.equal(at(13.99), '13');
  assert.equal(at(14), '3');
  assert.equal(at(14 - BUS_HOLD + 0.01), '3', 'zooming out holds just below 14');
  assert.equal(at(14 - BUS_HOLD - 0.01), '13');
  assert.equal(at(13 - BUS_HOLD + 0.01), '13');
  assert.equal(at(12.5), '2');
  assert.equal(at(13.5), '13');
});

test('at a bus handover the lines never go pale and the two label sets never show together', () => {
  const state = {};
  busDrawingAt(12.9, state, 0);
  for (let p = 0; p <= BUS_LINE_MS + 20; p += 10) {
    const { sets, busy } = busDrawingAt(13.05, state, 1000 + p);
    const lines = Math.max(sets['2'].lines, sets['13'].lines);
    assert.ok(lines >= 1 - 1e-9, `strongest lines at ${p} ms`);
    assert.ok(!(sets['2'].labels > 0 && sets['13'].labels > 0), `both label sets at ${p} ms`);
    if (p < FADE_OUT_MS) { assert.ok(sets['2'].labels > 0, `old labels still fading out at ${p} ms`); assert.equal(sets['13'].labels, 0); }
    else assert.equal(sets['2'].labels, 0, `old labels gone at ${p} ms`);
    assert.equal(sets['3'].lines + sets['3'].labels, 0);
    if (p > BUS_LINE_MS) { assert.equal(busy, false); assert.deepEqual(sets['13'], { lines: 1, labels: 1 }); assert.deepEqual(sets['2'], { lines: 0, labels: 0 }); }
  }
});

test('the preview style gives every bus layer a set, a zoom range covering its handovers, and a fade', () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/data/zoom-prototype/trial.json', import.meta.url)));
  const metadata = JSON.parse(readFileSync(new URL('../public/data/sheets.json', import.meta.url)));
  const style = previewStyle('light', metadata, bundle);
  const bus = style.layers.filter((l) => ['sheet-2', 'sheet-3', 'trial-bus-13'].includes(l.source));
  for (const set of ['2', '13', '3']) assert.ok(bus.some((l) => l.metadata.busKey.endsWith(set)), `set ${set}`);
  for (const l of bus) {
    assert.match(l.metadata.busKey, /^bus(Lines|Labels)(2|13|3)$/);
    assert.equal(l.metadata.busKey.startsWith('busLabels'), l.type === 'symbol');
    const set = l.metadata.busKey.replace(/^bus(Lines|Labels)/, '');
    const from = { 2: 12, 13: 13 - BUS_HOLD, 3: 14 - BUS_HOLD }[set], to = { 2: 13 + 0.5, 13: 14, 3: 14 }[set];
    assert.ok(l.minzoom <= from && l.maxzoom > to, `${l.id} range ${l.minzoom}-${l.maxzoom}`);
  }
  assert.equal(bus.filter((l) => l.source === 'trial-bus-13').length, bus.filter((l) => l.source === 'sheet-3').length);
});
