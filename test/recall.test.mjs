// The recall score's own parts (qa/recall/README.md): how a finding is
// matched to a fault, and that each planted fault really changes the
// geometry it says it does. Plain Node: no fixture, no browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catches, metresPerPx } from '../qa/recall/recall.mjs';
import { KINDS, lengthM, metres, plant } from '../qa/recall/plant.mjs';

const LAT = 39.74;
const at = (dx, dy) => [-105 + dx / (111_320 * Math.cos((LAT * Math.PI) / 180)), LAT + dy / 110_540];
const finding = (kind, p, check = 'lines') => ({ check, kind, lon: p[0], lat: p[1], zoom: 17, where: 'district', msg: '' });

test('a finding of a listed kind within the radius catches the fault', () => {
  const target = { points: [at(0, 0)], radius_px: 30, caught_by: ['gap'] };
  // 30 px at z17 here is about 14 m.
  assert.ok(30 * metresPerPx(LAT, 17) > 13 && 30 * metresPerPx(LAT, 17) < 15);
  assert.equal(catches(target, [finding('gap', at(10, 0))], { refZoom: 17 }).length, 1);
  assert.equal(catches(target, [finding('gap', at(20, 0))], { refZoom: 17 }).length, 0, 'too far');
  assert.equal(catches(target, [finding('step', at(1, 0))], { refZoom: 17 }).length, 0, 'wrong kind');
});

test('the radius is px at the target zoom: the same 20 m is in at z16 and out at z17', () => {
  const target = { points: [at(0, 0)], radius_px: 30, caught_by: ['gap'] };
  assert.equal(catches(target, [finding('gap', at(20, 0))], { refZoom: 16 }).length, 1);
  assert.equal(catches(target, [finding('gap', at(20, 0))], { refZoom: 17 }).length, 0);
});

test('a finding the build already had does not count for a planted fault', () => {
  const target = { points: [at(0, 0)], radius_px: 30, caught_by: ['step'] };
  const before = [finding('step', at(3, 0))];
  assert.equal(catches(target, [finding('step', at(2, 0))], { refZoom: 17, clean: before }).length, 0);
  assert.equal(catches(target, [finding('step', at(2, 0))], { refZoom: 17, clean: [finding('gap', at(3, 0))] }).length, 1);
});

// A small made-up network: eight east-west bus streets 2 km apart, a rail
// line that ends, a part-time bus route, stops, stations and a terminal.
function network() {
  const line = (y, x0 = 0, x1 = 3000) => Array.from({ length: (x1 - x0) / 100 + 1 }, (_, i) => at(x0 + i * 100, y));
  const fc = (features) => ({ type: 'FeatureCollection', features });
  const streets = Array.from({ length: 8 }, (_, i) => ({ type: 'Feature', properties: { mode: 'bus', routes: `R${i}`, n: 1, cls: 'c15' }, geometry: { type: 'LineString', coordinates: line(i * 2000) } }));
  const routes = [
    ...Array.from({ length: 4 }, (_, i) => ({ type: 'Feature', properties: { mode: 'rail', route: `L${i}` }, geometry: { type: 'LineString', coordinates: line(i * 2000 + 1000, 10_000, 13_000) } })),
    ...Array.from({ length: 4 }, (_, i) => ({ type: 'Feature', properties: { mode: 'bus', route: `P${i}`, tier: 'peak' }, geometry: { type: 'LineString', coordinates: line(i * 2000 + 500, 20_000, 23_000) } })),
  ];
  const stops = streets.map((s, i) => ({ type: 'Feature', properties: { id: `s${i}`, name: `Main St & ${i}th`, lines: s.properties.routes }, geometry: { type: 'Point', coordinates: at(1500, i * 2000 + 15) } }));
  const stations = Array.from({ length: 4 }, (_, i) => ({ type: 'Feature', properties: { id: i, served: true, label: `Station ${i}` }, geometry: { type: 'Point', coordinates: at(30_000, i * 2000) } }));
  const ring = [at(40_000, 0), at(40_100, 0), at(40_100, 60), at(40_050, 90), at(40_000, 60), at(40_000, 0)];
  const terminals = [{ type: 'Feature', properties: { name: 'Terminal' }, geometry: { type: 'Polygon', coordinates: [ring] } }];
  return { streets: fc(streets), routes: fc(routes), stops: fc(stops), stations: fc(stations), terminals: fc(terminals) };
}

test('every planted fault has a radius, kinds that catch it and points', async () => {
  const { planted } = await plant(network(), { partTime: ['peak'], per: 1, seed: 3 });
  assert.ok(planted.length >= 8, `planted ${planted.length}`);
  for (const p of planted) {
    assert.ok(Number.isFinite(p.radius_px) && p.radius_px > 0, `${p.id} radius`);
    assert.ok(p.caught_by.length, `${p.id} caught_by`);
    assert.ok(p.points.length && p.points.every((q) => q.every(Number.isFinite)), `${p.id} points`);
  }
});

test('planting is the same for the same seed and leaves the input alone', async () => {
  const data = network();
  const copy = structuredClone(data);
  const a = await plant(data, { partTime: ['peak'], per: 1, seed: 5 });
  const b = await plant(data, { partTime: ['peak'], per: 1, seed: 5 });
  assert.deepEqual(a.planted, b.planted);
  assert.deepEqual(data, copy);
});

test('a planted gap leaves 20 m with no line, and a stray stop is 60 m from its lines', async () => {
  const data = network();
  const { data: out, planted } = await plant(data, { partTime: ['peak'], per: 1, seed: 7, kinds: ['gap', 'stray-stop'] });
  const gap = planted.find((p) => p.kind === 'gap');
  assert.ok(gap, 'a gap was planted');
  const ends = out.streets.features.flatMap((f) => [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)]);
  const nearest = ends.map((e) => metres(e, gap.points[0])).sort((x, y) => x - y);
  assert.ok(Math.abs(nearest[0] - 10) < 0.5 && Math.abs(nearest[1] - 10) < 0.5, `ends ${nearest.slice(0, 2)}`);
  assert.equal(out.streets.features.length, data.streets.features.length + 1);
  assert.ok(Math.abs(out.streets.features.reduce((n, f) => n + lengthM(f.geometry.coordinates), 0) - data.streets.features.reduce((n, f) => n + lengthM(f.geometry.coordinates), 0) + 20) < 0.5);
  const stop = planted.find((p) => p.kind === 'stray-stop');
  assert.ok(stop, 'a stray stop was planted');
  const moved = out.stops.features.find((s) => metres(s.geometry.coordinates, stop.points[0]) < 0.01);
  assert.ok(moved, 'the moved stop is in the data where the plant says');
  const original = data.stops.features.find((s) => s.properties.id === moved.properties.id);
  assert.ok(Math.abs(metres(original.geometry.coordinates, moved.geometry.coordinates) - 60) < 0.5, 'moved 60 m');
  const mine = moved.properties.lines.split(' ');
  const theirs = out.streets.features.filter((f) => f.properties.routes.split(' ').some((r) => mine.includes(r)));
  assert.ok(theirs.length, 'its route is drawn');
  // Every 1 m along each of its lines is more than 55 m away.
  for (const f of theirs) {
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      for (let t = 0; t <= 1; t += 0.01) {
        const q = [c[i - 1][0] + (c[i][0] - c[i - 1][0]) * t, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t];
        assert.ok(metres(q, moved.geometry.coordinates) > 55);
      }
    }
  }
});

test('the kinds the score lists all say what they plant', () => {
  for (const [k, v] of Object.entries(KINDS)) {
    assert.ok(v.about && v.caught_by.length && v.radius > 0 && v.from >= 9, k);
  }
});
