// Bus lines beside rail (scripts/lib/beside.mjs, public/js/bands.js): on a
// made-up network, a street that really runs beside a rail pack is drawn clear
// of it at each zoom band, and nothing else changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { besideRail, MIN_APART } from '../scripts/lib/beside.mjs';
import { BESIDE_BANDS, BESIDE_FROM, BESIDE_UNTIL, besideRamp, clearPx, metersPerPx } from '../public/js/beside.js';
import { bandOf, shownAt } from '../public/js/bands.js';
import { projection } from '../scripts/lib/geom.mjs';

const ORIGIN = [-105, 39.7];
const { project, unproject } = projection(ORIGIN, 7);
// A point x meters east and y north of the origin, as [lon, lat].
const P = (x, y) => unproject([x, y]);
const rail = (slot) => ({ type: 'Feature', properties: { mode: 'rail', route: `R${slot}`, slot }, geometry: { type: 'LineString', coordinates: [P(-2000, 0), P(2000, 0)] } });
const street = (routes, coords, cls = 'c30') => ({ type: 'Feature', properties: { mode: 'bus', routes, n: 1, cls }, geometry: { type: 'LineString', coordinates: coords } });
const stop = (id, at) => ({ type: 'Feature', properties: { id, routes: 'B', lines: 'B' }, geometry: { type: 'Point', coordinates: at } });
const pack = [rail(-1), rail(0), rail(1)];
const run = (streets, stops = []) => besideRail({ streets, routes: pack, stops, origin: ORIGIN, precision: 7 });
const north = (coords) => coords.map((c) => project(c)[1]);
const kAt = (z) => BESIDE_BANDS.findLastIndex((b) => b <= z);
const copy = (out, routes, k) => out.beside.find((f) => f.properties.of === 'street' && f.properties.routes === routes && f.properties.bz === k);

test('a street beside a pack is drawn clear of it at each band, and never nearer than it is', () => {
  const out = run([street('B', [P(-600, 13), P(600, 13)])]);
  assert.ok(out.beside.length, 'it has copies');
  for (const z of [14.5, 15, 16, 16.5]) {
    const f = copy(out, 'B', kAt(z));
    assert.ok(f, `a copy at z${z}`);
    const ys = north(f.geometry.coordinates).filter((_, i, a) => i > a.length / 4 && i < (3 * a.length) / 4);
    // While the move eases in (besideRamp), the street goes part of the way.
    const zb = BESIDE_BANDS[kAt(z)];
    const want = 13 + besideRamp(kAt(z)) * Math.max(0, clearPx(1, 'c30', zb) * metersPerPx(zb, 39.7) - 13);
    for (const y of ys) assert.ok(Math.abs(y - want) < 0.5, `z${z}: drawn ${y.toFixed(1)} m from the track, want ${want.toFixed(1)}`);
  }
  // Moved away from the track (north), never towards it.
  for (const f of out.beside.filter((x) => x.properties.bz !== undefined)) for (const y of north(f.geometry.coordinates)) assert.ok(y >= 13 - 0.2);
  // The street itself is marked: drawn as it is only further out.
  assert.ok(out.streets.some((f) => f.properties.bs === 1));
});

test('from BESIDE_UNTIL in, and below BESIDE_FROM, nothing is moved', () => {
  const out = run([street('B', [P(-600, 13), P(600, 13)])]);
  const last = bandOf(BESIDE_UNTIL);
  const shown = out.beside.filter((f) => f.properties.of === 'street' && shownAt(f.properties, BESIDE_UNTIL + 1));
  assert.ok(shown.length, 'something is drawn there');
  for (const f of shown) {
    assert.equal(f.properties.bz, undefined, 'no moved copy');
    assert.ok(f.properties.sf <= last);
    for (const y of north(f.geometry.coordinates)) assert.ok(Math.abs(y - 13) < 0.2);
  }
  assert.equal(bandOf(BESIDE_FROM - 0.01), -1);
  for (const f of out.streets) assert.ok(shownAt(f.properties, BESIDE_FROM - 0.01));
  for (const f of out.beside) assert.ok(!shownAt(f.properties, BESIDE_FROM - 0.01));
});

test('closer than MIN_APART, bus and rail share a right of way and are left alone; far away, too', () => {
  const out = run([street('ON', [P(-600, MIN_APART - 1), P(600, MIN_APART - 1)]), street('FAR', [P(-600, 400), P(600, 400)])]);
  assert.equal(out.beside.length, 0);
  assert.equal(out.streets.length, 2);
  assert.ok(out.streets.every((f) => f.properties.bs === undefined));
});

test('streets that meet near rail still meet when moved', () => {
  // B runs along the rail and turns north at x = 0; C carries on from the corner.
  const out = run([street('B', [P(-600, 15), P(0, 15)]), street('C', [P(0, 15), P(0, 600)])]);
  // What is drawn of a street at a zoom: its moved copy and the pieces as they are.
  const drawn = (routes, z) =>
    [...out.beside.filter((f) => f.properties.routes === routes && shownAt(f.properties, z)), ...out.streets.filter((f) => f.properties.routes === routes && shownAt(f.properties, z))]
      .flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates))
      .map((l) => l.map(project));
  for (const z of [14.5, 15, 15.5, 16, 16.5]) {
    const b = drawn('B', z), c = drawn('C', z);
    assert.ok(b.length && c.length, `both drawn at z${z}`);
    // B's end at the corner: its point furthest east.
    const end = b.flat().reduce((m, p) => (p[0] > m[0] ? p : m));
    const gap = Math.min(...c.flat().map((p) => Math.hypot(p[0] - end[0], p[1] - end[1])));
    assert.ok(gap / metersPerPx(z, 39.7) < 1, `z${z}: the corner comes apart by ${(gap / metersPerPx(z, 39.7)).toFixed(1)} px`);
  }
});

test('a street that crosses the rail stays joined to the street beyond', () => {
  const out = run([street('X', [P(0, -500), P(0, 500)])]);
  for (const f of out.beside.filter((x) => x.properties.routes === 'X' && x.properties.bz !== undefined)) {
    const ys = north(f.geometry.coordinates);
    // Each copy runs from one side of the pack to the other, moved only near it.
    assert.ok(ys[0] < 0 && ys.at(-1) > 0);
  }
  const far = out.streets.filter((f) => f.properties.bs === undefined && f.properties.routes === 'X');
  assert.ok(far.length, 'the far parts are left as they are');
});

test('a stop under the pack lands on its moved street', () => {
  const out = run([street('B', [P(-600, 13), P(600, 13)])], [stop('s1', P(0, 10))]);
  assert.equal(out.stops[0].properties.bs, 1);
  for (const z of [15, 16]) {
    const k = kAt(z);
    const s = out.beside.find((f) => f.properties.of === 'stop' && f.properties.bz === k);
    const line = copy(out, 'B', k);
    const ys = north(line.geometry.coordinates);
    const y = project(s.geometry.coordinates)[1];
    assert.ok(Math.abs(y - ys[Math.floor(ys.length / 2)]) / metersPerPx(z, 39.7) < 1.5, `z${z}: the stop is ${(y - ys[Math.floor(ys.length / 2)]).toFixed(1)} m off its street`);
  }
});

test('a line that ends heading into the rail ends short of the pack, on its own path', () => {
  // D comes in from the north-east at 45 degrees and stops 12 m from the track.
  const out = run([street('D', [P(400, 400), P(12, 12)], 'c3')]);
  for (const z of [14.5, 15, 16]) {
    const f = copy(out, 'D', kAt(z));
    if (!f) continue;
    for (const c of f.geometry.coordinates) {
      const [x, y] = project(c);
      assert.ok(Math.abs(x - y) < 0.3, `z${z}: a point ${(x - y).toFixed(1)} m off D's own path`);
    }
    const end = Math.min(...f.geometry.coordinates.map((c) => project(c)[1]));
    const clear = clearPx(1, 'c3', BESIDE_BANDS[kAt(z)]) * metersPerPx(BESIDE_BANDS[kAt(z)], 39.7) * besideRamp(kAt(z));
    assert.ok(end >= Math.min(clear, 12 + clear) - 3, `z${z}: ends ${end.toFixed(1)} m from the track`);
  }
});

test('where another street goes on from it, a line is not cut short', () => {
  const out = run([street('D', [P(400, 400), P(12, 12)], 'c3'), street('E', [P(12, 12), P(400, 12)], 'c3')]);
  const f = copy(out, 'D', kAt(15));
  assert.ok(f, 'D has a moved copy at z15');
  assert.ok(f.geometry.coordinates.some((c) => { const [x, y] = project(c); return Math.abs(x - y) > 0.5; }), 'it is moved, not cut');
});
