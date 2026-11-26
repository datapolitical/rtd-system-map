import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { SIZES, names } from '../scripts/lib/sheets.mjs';
import { withZoom, zoomStops } from '../scripts/zoom-prototype.mjs';
import { previewStyle } from '../public/js/zoom/style.js';
import { sheetStyle } from '../public/js/sheets/style.js';
import { attachedPoint, pixels, coordinate, sizeAt, pitchAt, frameAt, labelChanges,
  labelsAt, SIDE_HOLD, FADE_OUT_MS, FADE_IN_MS, busDrawingAt, BUS_HOLD, railDrawingAt, railRefAt, attachedFor,
  MIN_ZOOM, MAX_ZOOM, BUS_DRAWINGS } from '../public/js/zoom/model.js';
import { railOrderErrors, letteringOrderErrors } from '../qa/lib/zoom-order.mjs';
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

test('between 14 and 16 the adapter runs sizes from sheet 3 to sheet 4, and switches keep sheet 3 until 16', () => {
  const before = structuredClone(SIZES);
  withZoom(15, (s) => {
    assert.equal(s.zoom, 15);
    assert.equal(SIZES.rail[s.id], (SIZES.rail[3] + SIZES.rail[4]) / 2);
    assert.equal(SIZES.busMerge[s.id], (SIZES.busMerge[3] + SIZES.busMerge[4]) / 2);
    assert.equal(s.id < SIZES.stopSheet, true, 'bus stops come in at 16, with sheet 4');
  });
  withZoom(16, (s) => assert.equal(SIZES.rail[s.id], SIZES.rail[4]));
  assert.throws(() => withZoom(8, () => {}), /not between two sheets/);
  assert.deepEqual(SIZES, before);
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
    assert.deepEqual(letteringOrderErrors(previewStyle(theme, { stations: [], colors: [] }, bundle)), [], theme);
  }
});

test('the rail-order check catches the actual broken preview, pinned before its fix', () => {
  const bad = JSON.parse(readFileSync(new URL('../qa/recall/prototype-layer-order.json', import.meta.url), 'utf8'));
  assert.ok(railOrderErrors(bad).some((e) => e.includes('bus-rim-3')));
});

test('the lettering check catches the preview whose bus numbers printed over Union Station (RTD-006), pinned before its fix', () => {
  const bad = JSON.parse(readFileSync(new URL('../qa/recall/prototype-lettering.json', import.meta.url), 'utf8'));
  const errors = letteringOrderErrors(bad);
  assert.ok(errors.some((e) => e.startsWith('trial-name is left out')), `missed build ${bad.build}`);
  assert.ok(errors.some((e) => e.startsWith('trial-attached-letter is left out')));
  assert.ok(errors.some((e) => e.startsWith('No trial-station-room layer')));
  // Corrected as the page now is, it passes; planted: the name drawn under the bus numbers is
  // placed after them, and is caught too.
  const style = structuredClone(bad);
  for (const l of style.layers) if (l.layout) delete l.layout['text-ignore-placement'];
  style.layers.push({ id: 'trial-station-room', type: 'symbol', source: 'trial-attached', layout: {} });
  assert.deepEqual(letteringOrderErrors(style), []);
  const name = style.layers.findIndex((l) => l.id === 'trial-name');
  style.layers.unshift(...style.layers.splice(name, 1));
  assert.ok(letteringOrderErrors(style).some((e) => / is placed before trial-name$/.test(e)), 'planted order');
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

test('a name that keeps its side glides between drawings instead of stepping, placed on the map like its chips', () => {
  const frames = labelFrames(), state = { sides: new Map(), fades: new Map() };
  for (const [zoom, x] of [[12, 1], [12.0625, 1.25], [12.125, 1.5], [12.25, 2]]) {
    const { a } = shownAt(frames, zoom, state, 0);
    assert.equal(a.length, 1);
    // Its offset (ems of the name size) is turned into its place, so none is left on screen.
    assert.deepEqual(a[0].properties.offset, [0, 0]);
    const at = pixels(a[0].geometry.coordinates, zoom), station = pixels([-105, 39.75], zoom);
    assert.ok(Math.abs(at[0] - station[0] - x * sizeAt(sizes.name, zoom)) < 1e-6, `place at ${zoom}`);
    assert.ok(Math.abs(at[1] - station[1]) < 1e-6, `place at ${zoom}`);
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
  let now = 0;
  const span = Math.round((MAX_ZOOM - MIN_ZOOM) * 100);
  assert.equal(bundle.frames.at(-1).zoom, MAX_ZOOM, 'the trial runs to the closest zoom');
  for (const zoom of [...Array(span + 1).keys()].map((i) => MIN_ZOOM + i / 100).concat([...Array(span + 1).keys()].map((i) => MAX_ZOOM - i / 100))) {
    now += 16;
    const { collection } = labelsAt(bundle.frames, zoom, bundle.sizes, state, now);
    // Every name of the drawing in use, once: a closer drawing can add a name.
    const total = frameAt(bundle.frames, zoom).labels.features.filter((f) => f.properties.kind === 'name').length;
    const keys = collection.features.filter((f) => f.properties.kind === 'name').map((f) => f.properties.key);
    assert.equal(keys.length, total, `names at ${zoom}`);
    assert.equal(new Set(keys).size, total, `duplicate name at ${zoom}`);
  }
});

test('each bus drawing serves from its own zoom up to the next, holding a little when zooming out', () => {
  const state = {};
  const at = (zoom) => busDrawingAt(zoom, state).set;
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
  assert.equal(at(14.99), '3');
  assert.equal(at(15), '15');
  assert.equal(at(16), '4');
  assert.equal(at(16 - BUS_HOLD + 0.01), '4', 'zooming out holds just below 16');
  assert.equal(at(15.5), '15');
  assert.equal(at(14.5), '3');
});

test('the rail drawing hands over at 14, as the bus drawing there does, and holds a little zooming out', () => {
  const state = {};
  const at = (zoom) => railDrawingAt(zoom, state).set;
  assert.equal(at(12), '13'); assert.equal(at(13.99), '13');
  assert.equal(at(14), '15'); assert.equal(at(16), '15');
  assert.equal(at(14 - BUS_HOLD + 0.01), '15'); assert.equal(at(14 - BUS_HOLD - 0.01), '13');
  assert.equal(railRefAt(13.99), 13); assert.equal(railRefAt(14), 15);
  assert.ok(BUS_DRAWINGS.some((d) => d.zoom === 14), 'a bus handover hides the rail one');
});

test('the rail drawing hands over at once: one set of bars and letters at every moment, never both', () => {
  const f = (kind, ref, extra = {}) => ({ type: 'Feature', properties: { kind, ref, ...extra }, geometry: { type: 'Point', coordinates: [0, 0] } });
  const all = { type: 'FeatureCollection', features: [f('station', 13), f('station', 15), f('letter', 13), f('letter', 15), f('letter', 15, { minzoom: 15 })] };
  const state = {};
  railDrawingAt(13.9, state);
  const rail = railDrawingAt(14.05, state);
  const shown = attachedFor(all, rail, 14.05).features;
  const v = (kind, ref) => { const x = shown.find((g) => g.properties.kind === kind && g.properties.ref === ref); return x ? x.properties.fade ?? 1 : 0; };
  // Two rail drawings lie a few pixels apart; crossed over, every line showed doubled.
  assert.equal(rail.busy, false);
  assert.equal(v('station', 13) + v('letter', 13), 0, 'old drawing gone');
  assert.equal(v('station', 15) + v('letter', 15), 2, 'new drawing whole');
  assert.ok(!shown.some((g) => g.properties.minzoom === 15), 'a letter waits for its zoom');
});

test('a bus handover is instant, one drawing at a time, and waits for the next drawing to load', () => {
  const state = {};
  busDrawingAt(12.9, state);
  const one = ({ sets }) => Object.values(sets).filter((o) => o.lines === 1).length === 1 && Object.values(sets).every((o) => o.lines === 0 || o.lines === 1);
  // Streets two drawings apart crossed over showed doubled (real iPhone run 2026-11-25).
  let shown = busDrawingAt(13.05, state, { ready: () => false });
  assert.ok(one(shown));
  assert.equal(shown.set, '2', 'holds the drawing showing while the next loads');
  assert.equal(shown.busy, true, 'asks again next frame');
  shown = busDrawingAt(15.5, state, { ready: (set) => set !== '15' });
  assert.equal(shown.set, '2', 'still holds, rather than show a drawing that has not loaded');
  shown = busDrawingAt(15.5, state, { ready: () => true });
  assert.ok(one(shown));
  assert.equal(shown.set, '15');
  assert.equal(shown.busy, false);
  assert.deepEqual(shown.sets['15'], { lines: 1, labels: 1 });
  assert.equal(busDrawingAt(12, state).set, '2', 'with no check it hands over at once');
});

test('the preview style keeps every bus layer visible: lines fade by opacity over a range covering their handovers, labels hold their own zooms', () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/data/zoom-prototype/trial.json', import.meta.url)));
  const metadata = JSON.parse(readFileSync(new URL('../public/data/sheets.json', import.meta.url)));
  const style = previewStyle('light', metadata, bundle);
  const bus = style.layers.filter((l) => /^(sheet|routes)-[234]$|^trial-bus-\d+(-routes)?$/.test(l.source ?? ''));
  const sets = BUS_DRAWINGS.map((d) => d.set);
  const setOf = (l) => l.source.match(/^trial-bus-(\d+)/)?.[1] ?? l.source.match(/-([234])$/)[1];
  for (const set of sets) assert.ok(bus.some((l) => l.type !== 'symbol' && l.metadata.busKey === `busLines${set}`), `set ${set}`);
  for (const l of bus) {
    // Showing or hiding a layer makes MapLibre parse its whole source again.
    assert.equal(l.layout?.visibility, 'visible', `${l.id} visible`);
    const set = setOf(l), i = BUS_DRAWINGS.findIndex((d) => d.set === set);
    if (l.type === 'symbol') {
      assert.equal(l.metadata?.busKey, undefined, `${l.id} labels are not faded`);
      assert.equal(l.minzoom, i ? BUS_DRAWINGS[i].zoom : 0, `${l.id} from`);
      assert.equal(l.maxzoom, BUS_DRAWINGS[i + 1]?.zoom ?? 24, `${l.id} to`);
      continue;
    }
    assert.equal(l.metadata.busKey, `busLines${set}`);
    const from = BUS_DRAWINGS[i].zoom - (i ? BUS_HOLD : 0), to = BUS_DRAWINGS[i + 1]?.zoom ?? MAX_ZOOM;
    assert.ok(l.minzoom <= from - 0.5 && l.maxzoom > to, `${l.id} range ${l.minzoom}-${l.maxzoom}: loaded ahead of its handover`);
    // Only the opening drawing starts seen; the rest wait at opacity 0, which MapLibre skips drawing.
    for (const [k] of l.metadata.busPlain) assert.equal(l.paint[k] === 0, set !== '2', `${l.id} ${k}`);
  }
  // Each drawing between the sheets has a copy of every layer of the closer sheet, picked routes included.
  for (const [set, sheet] of [['13', '3'], ['15', '4']]) {
    assert.equal(bus.filter((l) => l.source.startsWith(`trial-bus-${set}`)).length, bus.filter((l) => [`sheet-${sheet}`, `routes-${sheet}`].includes(l.source)).length, set);
    assert.ok(style.sources[`trial-bus-${set}-routes`], `${set} picked-route source`);
  }
  // One copy of the rail for each rail drawing, each shown only through its own state.
  for (const set of ['13', '15']) assert.ok(style.layers.some((l) => l.id === `trial-rail-${set}` && JSON.stringify(l.paint['line-opacity']).includes(`rail${set}`)), set);
});

test('a station keeps one order of route chips at every zoom; the check catches the pinned build and a planted swap', async () => {
  const { chipOrders } = await import('../qa/lib/zoom-labels.mjs');
  const pinned = JSON.parse(readFileSync(new URL('../qa/recall/prototype-chip-order.json', import.meta.url), 'utf8'));
  assert.ok(chipOrders(pinned).some((r) => !r.ok && /Union Station/.test(r.name)), `missed build ${pinned.build}`);
  const bundle = JSON.parse(readFileSync(new URL('../public/data/zoom-prototype/trial.json', import.meta.url)));
  const rows = chipOrders(bundle);
  assert.ok(rows.length >= 1, 'some names carry chips');
  assert.deepEqual(rows.filter((r) => !r.ok), []);
  // Planted: two chips of one name trade places in one drawing.
  const planted = structuredClone(bundle);
  const frame = planted.frames[Math.floor(planted.frames.length / 2)];
  const chips = frame.labels.features.filter((f) => f.properties.kind === 'letter' && f.properties.small);
  const key = chips[0].properties.key.slice(0, chips[0].properties.key.lastIndexOf(':'));
  const [a, b] = chips.filter((f) => f.properties.key.startsWith(`${key}:`));
  [a.labelOffset, b.labelOffset] = [b.labelOffset, a.labelOffset];
  assert.ok(chipOrders(planted).some((r) => !r.ok), 'planted swap');
});

test('the controls check fails the first preview, whose panels covered nearly a quarter of the screen', async () => {
  const { coverShare, MAX_COVER } = await import('../qa/lib/zoom-cover.mjs');
  const pinned = JSON.parse(readFileSync(new URL('../qa/recall/prototype-controls.json', import.meta.url), 'utf8'));
  assert.ok(coverShare(pinned.panels, pinned.viewport) > MAX_COVER, `missed build ${pinned.build}`);
  assert.ok(coverShare([[10, 10, 172, 44], [10, 800, 382, 48]], [402, 874]) <= MAX_COVER, 'today\'s pill and row');
});

test('every line letter the build places reaches the page at every zoom, across the rail handover too', () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/data/zoom-prototype/trial.json', import.meta.url)));
  const placed = bundle.report.letters.byZoom;
  // Letters shown by the page's own filter (model.js, attachedFor), for the drawing showing at that zoom.
  const shownAt = (attached, zoom) => {
    const state = {};
    const rail = railDrawingAt(zoom, state, 0, { motion: false });
    return new Set(attachedFor(attached, rail, zoom).features.filter((f) => f.properties.kind === 'letter').map((f) => f.properties.key));
  };
  const missing = (attached) => Object.entries(placed).flatMap(([zoom, n]) => (shownAt(attached, Number(zoom)).size === n ? [] : [`${zoom}: ${shownAt(attached, Number(zoom)).size} of ${n}`]));
  assert.deepEqual(missing(bundle.attached), []);
  // Planted: the closer rail drawing loses one letter that was placed at 12.
  const planted = structuredClone(bundle.attached);
  const i = planted.features.findIndex((f) => f.properties.kind === 'letter' && f.properties.ref === 15 && f.properties.minzoom === 12);
  assert.ok(i >= 0, 'a zoom-12 letter rides the zoom-15 rail drawing');
  planted.features.splice(i, 1);
  assert.ok(missing(planted).some((m) => /^1[456]/.test(m)), 'planted loss caught');
});

test('banded ground layers load a zoom either side of their band and show only inside it', () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/data/zoom-prototype/trial.json', import.meta.url)));
  const metadata = JSON.parse(readFileSync(new URL('../public/data/sheets.json', import.meta.url)));
  const plain = sheetStyle('light', metadata.stations, metadata.colors, new Set([2, 3, 4]), metadata.district, true);
  const style = previewStyle('light', metadata, bundle);
  const byId = new Map(style.layers.map((l) => [l.id, l]));
  // A tile from one zoom out is what shows while a pinch outruns loading; it held none of the next
  // band's roads or buildings, so the streets went blank (real iPhone run 2026-11-25).
  // Names are left: unseen, they would still take room from the names on show.
  const banded = plain.layers.filter((l) => l.source === 'ground' && l.type !== 'symbol' && byId.has(l.id) && ((l.minzoom ?? 0) > 0 || (l.maxzoom ?? 24) < 24));
  assert.ok(banded.some((l) => l.id === 'roads-4') && banded.some((l) => l.id === 'buildings-4'), 'the closest band is covered');
  for (const was of banded) {
    const l = byId.get(was.id);
    const [lo, hi] = [was.minzoom ?? 0, was.maxzoom ?? 24];
    assert.equal(l.minzoom, Math.max(0, lo - 1), `${l.id} loads a zoom early`);
    assert.equal(l.maxzoom, Math.min(24, hi + 1), `${l.id} lasts a zoom late`);
    const key = l.type === 'fill' ? 'fill-opacity' : 'line-opacity';
    const at = (z) => { const e = l.paint[key]; let v = e[2]; for (let i = 3; i < e.length; i += 2) if (z >= e[i]) v = e[i + 1]; return v; };
    if (lo > 0) { assert.equal(at(lo - 0.01), 0, `${l.id} unseen below its band`); assert.equal(at(lo), was.paint?.[key] ?? 1); }
    if (hi < 24) { assert.equal(at(hi - 0.01), was.paint?.[key] ?? 1); assert.equal(at(hi), 0, `${l.id} unseen above its band`); }
  }
});

test('the rail drawings change over with no transition', () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/data/zoom-prototype/trial.json', import.meta.url)));
  const metadata = JSON.parse(readFileSync(new URL('../public/data/sheets.json', import.meta.url)));
  const rails = previewStyle('dark', metadata, bundle).layers.filter((l) => /^trial-rail/.test(l.id) && JSON.stringify(l.paint['line-opacity']).includes('global-state'));
  assert.ok(rails.length >= 4);
  // The style's default 300 ms transition cross-faded the two drawings (real iPhone run 2026-11-26).
  for (const l of rails) assert.deepEqual(l.paint['line-opacity-transition'], { duration: 0, delay: 0 }, l.id);
});
