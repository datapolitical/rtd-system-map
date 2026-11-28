// The wide zooms (#236): the reference drawings for 8.75 to 12 and the
// measurements the issue names, on made-up networks and on the built data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WIDE_MIN, WIDE_MAX, WIDE_HANDOVER, referenceAt, withZoom, pitchAt, slotPieces,
  buildReference, sharedPairs, renderedPaths, terminalGaps, referenceDrift,
  frameFit, referenceSummary, segmentGrid, nearestInGrid,
} from '../scripts/lib/widezoom.mjs';
import { nearest } from '../scripts/lib/sheets.mjs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const HAS_DATA = fs.existsSync(new URL('../public/data/routes.geojson', import.meta.url))
  && fs.existsSync(new URL('../public/data/stations.geojson', import.meta.url))
  && fs.existsSync(new URL('../public/data/sheets.json', import.meta.url));
const NO_DATA = 'public/data is not built (npm run build:data)';
let data;
const built = () => (data ??= { routes: read('routes.geojson'), stations: read('stations.geojson') });

// A made-up network: A and B share one straight track, slots -0.5 and 0.5.
const line = (route, slot, coordinates) => ({ type: 'Feature', properties: { mode: 'rail', route, color: '#57C1E9', slot }, geometry: { type: 'LineString', coordinates } });
const along = (lon, from, to, steps = 40) => Array.from({ length: steps + 1 }, (_, i) => [lon, from + ((to - from) * i) / steps]);
const synthetic = () => ({
  routes: { type: 'FeatureCollection', features: [line('A', -0.5, along(-105, 39.65, 39.8)), line('B', 0.5, along(-105, 39.65, 39.8))] },
  stations: { type: 'FeatureCollection', features: [] },
});

test('the wide band and its reference drawings', () => {
  assert.equal(WIDE_MIN, 8.75);
  assert.equal(WIDE_MAX, 12);
  assert.equal(WIDE_HANDOVER, 10);
  // From the whole district to the handover uses the drawing at 9, then at 11.
  for (const zoom of [8.75, 9, 9.5, 9.99]) assert.equal(referenceAt(zoom), 9, `zoom ${zoom}`);
  for (const zoom of [10, 10.5, 11, 12]) assert.equal(referenceAt(zoom), 11, `zoom ${zoom}`);
});

test('sizes interpolate between sheets and are put back afterwards', () => {
  // pitch is a line's width plus the gap, interpolated between sheets 0 and 1,
  // 1 and 2 (sheets.mjs SIZES: rail 3, 3.6, 4.4; gap 1.2, 1.4, 1.6).
  assert.ok(Math.abs(pitchAt(8.75) - 4.2) < 1e-9);
  assert.ok(Math.abs(pitchAt(10) - 5) < 1e-9);
  assert.ok(Math.abs(pitchAt(12) - 6) < 1e-9);
  assert.ok(Math.abs(pitchAt(11) - 5.5) < 1e-9);
  // Nothing leaks once a read is done: sheet 4's own pitch is 10.5.
  assert.ok(Math.abs(pitchAt(16) - 10.5) < 1e-9);
  // withZoom reads a sheet's own id at its zoom, and half a step between two.
  assert.ok(Math.abs(withZoom(10, (id) => id) - 1) < 1e-9);
  assert.ok(Math.abs(withZoom(13, (id) => id) - 2.5) < 1e-9);
});

test('a track is split where its slot changes, nowhere else', () => {
  const center = [[0, 0], [10, 0], [20, 0], [30, 0]];
  const pieces = slotPieces({ center, slots: [0.5, 0.5, 1, 1] });
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces.map((p) => p.slot), [0.5, 1]);
  assert.deepEqual(pieces[0].points, [[0, 0], [10, 0], [20, 0]]);
  assert.deepEqual(pieces[1].points, [[20, 0], [30, 0]]);
});

test('a reference drawing keeps its centreline, slots and line ends', () => {
  const ref = buildReference(synthetic(), 9);
  assert.equal(ref.ref, 9);
  assert.equal(ref.tracks.length, 2);
  assert.ok(ref.features.length >= 2);
  for (const f of ref.features) {
    assert.equal(f.properties.ref, 9);
    assert.equal(f.geometry.type, 'LineString');
    assert.ok(Number.isFinite(f.properties.slot));
  }
  assert.equal(ref.lineEnds.length, 4); // two lines, two ends each
});

test('two lines on one track are found as a shared pair', () => {
  const ref = buildReference(synthetic(), 9);
  const pairs = sharedPairs(ref);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].a, pairs[0].b].sort(), ['A', 'B']);
  assert.ok(pairs[0].to - pairs[0].from >= 20);
});

test('at its reference zoom, the two lines sit one pitch apart', () => {
  const ref = buildReference(synthetic(), 9);
  const paths = renderedPaths(ref, 9);
  const [a] = paths.get('A');
  const [b] = paths.get('B');
  const mid = a.path[Math.floor(a.path.length / 2)];
  assert.ok(Math.abs(nearest(b.path, mid).d - ref.pitch) < 0.01);
});

test('a reference drawing is exactly a fresh one at its own zoom, and is close either side', () => {
  const network = synthetic();
  const ref = buildReference(network, 9);
  assert.ok(referenceDrift(network, ref, 9).worst < 0.01);
  assert.ok(referenceDrift(network, ref, 8.75).worst < 1);
  assert.ok(referenceDrift(network, ref, 9.5).worst < 1);
});

test('the whole-district fit uses the space DESIGN.md sets, not MapLibre\u2019s default', { skip: !HAS_DATA && NO_DATA }, () => {
  const frame = read('sheets.json').frame;
  const iphone = { width: 402, height: 874 };
  // #211: the page frames the whole district 44 px clear at the sides (#152,
  // Boulder's name), qa/wholecheck.mjs expects 32. The two are ~0.1 zoom apart,
  // and these are the numbers the v1.1 check reported.
  const page = frameFit(frame, { ...iphone, side: 44, pad: 32 });
  const check = frameFit(frame, { ...iphone, side: 32, pad: 32 });
  assert.ok(Math.abs(page - 8.833) < 0.001, `page fit ${page}`);
  assert.ok(Math.abs(check - 8.940) < 0.001, `check fit ${check}`);
  assert.ok(check - page > 0.1 && check - page < 0.11);
});

test('the built data gives a wide reference drawing at 9 and 11', { skip: !HAS_DATA && NO_DATA }, () => {
  const refs = [9, 11].map((ref) => buildReference(built(), ref));
  for (const ref of refs) {
    assert.equal(ref.tracks.length, 9);
    assert.ok(ref.features.length > 300);
    assert.ok(ref.bars.length > 40);
    assert.ok(ref.lineEnds.length >= 18);
  }
  // More detail at the closer reference.
  assert.ok(refs[1].features.length > refs[0].features.length);
  assert.ok(refs[1].tracks.reduce((n, t) => n + t.center.length, 0) > refs[0].tracks.reduce((n, t) => n + t.center.length, 0));
});

test('the built data thins to about a quarter of its points', { skip: !HAS_DATA && NO_DATA }, async () => {
  const summary = await referenceSummary(buildReference(built(), 9));
  assert.ok(summary.pointsThinned < summary.points / 3);
  assert.ok(summary.gzipBytesThinned < summary.gzipBytes / 3);
});

test('the built data shares track and ends on its station bars', { skip: !HAS_DATA && NO_DATA }, () => {
  for (const ref of [9, 11]) {
    const drawing = buildReference(built(), ref);
    const pairs = sharedPairs(drawing);
    assert.ok(pairs.length >= 8, `ref ${ref}: ${pairs.length} shared pairs`);
    // At the reference zoom the drawn spacing is one pitch for an adjacent pair.
    const paths = renderedPaths(drawing, ref);
    const distances = [];
    for (const pair of pairs) {
      const pa = paths.get(pair.a).find((p) => p.run === pair.runA)?.path;
      const pb = paths.get(pair.b).find((p) => p.run === pair.runB)?.path;
      if (!pa || !pb) continue;
      distances.push(nearest(pb, pa[Math.floor((pair.from + pair.to) / 2)]).d);
    }
    distances.sort((a, b) => a - b);
    const median = distances[Math.floor(distances.length / 2)];
    assert.ok(Math.abs(median - pitchAt(ref)) < 0.3, `ref ${ref}: median ${median}, pitch ${pitchAt(ref)}`);
    // Most line ends land on a bar; a few carry a platform extension or a group.
    const gaps = terminalGaps(drawing).map((g) => g.distance).sort((a, b) => a - b);
    assert.ok(gaps[Math.floor(gaps.length / 2)] < 1, `ref ${ref}: median gap ${gaps[Math.floor(gaps.length / 2)]}`);
  }
});

test('a wide drawing stays under a pixel from a fresh one at the whole district', { skip: !HAS_DATA && NO_DATA }, () => {
  const drawing = buildReference(built(), 9);
  const drift = referenceDrift(built(), drawing, WIDE_MIN);
  assert.ok(drift.worst < 2, `worst drift ${drift.worst}`);
  assert.ok(drift.mean < 0.5, `mean drift ${drift.mean}`);
});

test('the nearest distance is found however far the only segment is', () => {
  // One short segment 30 cells (720 px) away: past the old eight-ring reach.
  const far = segmentGrid([[[720, 0], [730, 0]]]);
  assert.equal(nearestInGrid(far, [0, 0]), 720);
  // A long segment spanning the cells between: the point sits 100 px off its middle.
  const long = segmentGrid([[[-500, 100], [900, 100]]]);
  assert.equal(nearestInGrid(long, [200, 0]), 100);
  // Nothing in the grid is no distance at all, not a wrong one.
  assert.equal(nearestInGrid(segmentGrid([]), [0, 0]), Infinity);
  // A near segment still wins over a far one.
  const two = segmentGrid([[[720, 0], [730, 0]], [[0, 5], [10, 5]]]);
  assert.equal(nearestInGrid(two, [0, 0]), 5);
});

test('a line end off its station bar is caught, and one on the bar is not', () => {
  const bar = { name: 'Planted', routes: ['A'], ends: [[0, -10], [0, 10]] };
  const on = terminalGaps({ lineEnds: [{ route: 'A', point: [0, 3] }], bars: [bar] });
  assert.equal(on[0].ok, true);
  assert.ok(on[0].distance < 1e-9);
  const off = terminalGaps({ lineEnds: [{ route: 'A', point: [5, 3] }], bars: [bar] });
  assert.equal(off[0].ok, false, 'five px off the bar is a fault');
  assert.ok(Math.abs(off[0].distance - 5) < 1e-9, 'and its size is measured');
  // A bar the line does not serve is not its bar.
  assert.deepEqual(terminalGaps({ lineEnds: [{ route: 'B', point: [0, 0] }], bars: [bar] }), []);
});
