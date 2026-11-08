import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busStreets, rate, TOGETHER } from '../scripts/lib/streets.mjs';
import { classOf } from '../public/js/frequency.js';

// Made-up routes near (0, 0): a kilometer east is 1/111.32 of a degree.
// Each is one stretch, all day, with a weekday headway `wk`; busStreets
// takes its departures as evenly spaced when no cells were measured.
const KM = 1 / 111.32;
const at = ([x, y]) => [x * KM, y * KM];
const route = (name, path, wk = 15, tier = 'frequent') => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: path.map(at) },
  properties: { route: name, mode: 'bus', tier, wk },
});
const km = (f) => {
  const c = f.geometry.coordinates;
  let s = 0;
  for (let i = 1; i < c.length; i++) s += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]) / KM;
  return s;
};
const streets = (routes) => busStreets(routes, new Map(), { precision: 6 });
const withRoutes = (out, list) => out.filter((f) => f.properties.routes === list);

test('rate is the rider\'s: evenly spaced buses give their plain rate, a bunched pair about one', () => {
  const every15 = Array.from({ length: 24 }, (_, i) => 9 * 3600 + i * 900);
  assert.equal(Math.round(rate(every15) * 10) / 10, 4);
  const paired = every15.flatMap((t) => [t, t + 60]); // two routes a minute apart
  assert.ok(rate(paired) < 4.6, `pair reads ${rate(paired)} an hour, not 8`);
  const interleaved = every15.flatMap((t) => [t, t + 450]);
  assert.ok(rate(interleaved) > 7.5, `interleaved reads ${rate(interleaved)}`);
  assert.equal(rate([]), 0);
});

test('two routes on one street are one line with both buses counted', () => {
  // Every 15 and every 20 minutes interleave; two every-15 timetables that
  // leave together count about as one (the rider's rate).
  const out = streets([route('1', [[0, 0], [5, 0]], 15), route('2', [[0, 0], [5, 0]], 20, 'every30')]);
  assert.equal(out.length, 1);
  const p = out[0].properties;
  assert.equal(p.routes, '1 2');
  assert.equal(p.n, 2);
  assert.ok(p.bph > 5 && p.bph <= 7, `combined ${p.bph} an hour (4 and 3 apart)`);
  assert.equal(p.cls, classOf(p.bph));
  assert.ok(km(out[0]) > 4.9 && km(out[0]) < 5.1);
  const together = streets([route('1', [[0, 0], [5, 0]], 15), route('2', [[0, 0], [5, 0]], 15)]);
  assert.ok(together[0].properties.bph < 4.5, `bunched pair reads ${together[0].properties.bph}, about one route`);
});

test('a one-way pair a block apart stays two streets, touching at an end or not', () => {
  // Route 1 east on y=0, route 2 on y=0.12 km (a block north); they meet
  // only at the west end, where both start from the same corner.
  const out = streets([route('1', [[0, 0], [4, 0]], 15), route('2', [[0, 0], [0, 0.12], [4, 0.12]], 15)]);
  const shared = out.filter((f) => f.properties.n > 1);
  const sharedKm = shared.reduce((s, f) => s + km(f), 0);
  assert.ok(sharedKm * 1000 < TOGETHER, `shared for ${(sharedKm * 1000).toFixed(0)} m`);
  assert.ok(withRoutes(out, '1').length && withRoutes(out, '2').length, 'each street drawn on its own');
});

test('a crossing does not join two streets', () => {
  const out = streets([route('1', [[0, 0], [4, 0]], 15), route('2', [[2, -2], [2, 2]], 15)]);
  assert.ok(out.every((f) => f.properties.n === 1), JSON.stringify(out.map((f) => f.properties)));
});

test('a branch starts on the trunk and the trunk is drawn once', () => {
  const out = streets([route('1', [[0, 0], [6, 0]], 15), route('2', [[0, 0], [3, 0], [3, 3]], 15)]);
  const trunk = withRoutes(out, '1 2');
  assert.equal(trunk.length, 1, 'one shared run');
  assert.ok(km(trunk[0]) > 2.8 && km(trunk[0]) < 3.3, `trunk ${km(trunk[0])} km`);
  const branch = withRoutes(out, '2');
  assert.equal(branch.length, 1);
  const end = trunk[0].geometry.coordinates.at(-1);
  const start = branch[0].geometry.coordinates[0];
  const gap = Math.hypot(end[0] - start[0], end[1] - start[1]) / KM;
  assert.ok(gap * 1000 < 45, `branch starts ${(gap * 1000).toFixed(0)} m from the trunk's end`);
  // Each street drawn once: total drawn length is about the network's.
  const total = out.reduce((s, f) => s + km(f), 0);
  assert.ok(total > 8.8 && total < 9.4, `drawn ${total} km of a 9 km network`);
});

test('part-time routes are listed but add no buses', () => {
  const out = streets([route('1', [[0, 0], [5, 0]], 30, 'every30'), route('2', [[0, 0], [5, 0]], 30, 'peak')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].properties.routes, '1 2');
  assert.equal(out[0].properties.n, 1);
  assert.ok(out[0].properties.bph < 2.5, `${out[0].properties.bph} an hour`);
});

test('a short fork that meets the crossing street beside its trunk is drawn as one meeting point', async () => {
  const { wyes } = await import('../scripts/lib/streets.mjs');
  const M = 1 / 111320;
  const f = (routes, pts, cls = 'c15') => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => [x * M, y * M]) }, properties: { mode: 'bus', routes, n: routes.split(' ').length, cls } });
  // A diagonal ramp up to a crossing street (y = 60), and a 60 m fork off
  // it to the same street 40 m away: a small triangle.
  const streets = [
    f('1 10 30', [[-120, -120], [-19, 4], [5, 46]]),
    f('30', [[-19, 4], [-34, 60]]),
    f('1 10 23', [[-34, 60], [600, 60]]),
    f('23 30', [[-300, 60], [-34, 60]]),
  ];
  wyes(streets, { precision: 7 });
  assert.equal(streets.length, 3, 'the fork goes');
  assert.ok(streets[0].properties.routes.split(' ').includes('30'), 'its route is listed on its trunk');
  // A long street on into another isn't a fork, and stays.
  const through = [f('1', [[0, 0], [0, 100]]), f('1 2', [[0, 100], [0, 400]]), f('2', [[-200, 100], [0, 100]])];
  wyes(through, { precision: 7 });
  assert.equal(through.length, 3);
});
