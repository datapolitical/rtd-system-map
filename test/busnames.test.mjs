import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busNames, routeLabel } from '../scripts/lib/busnames.mjs';
import { heading, stopLines } from '../scripts/lib/stops.mjs';

// Made-up routes near (0, 0), in km (a kilometer east is 1/111.32 degree).
const KM = 1 / 111.32;
const line = (route, tier, ...pts) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => [x * KM, y * KM]) },
  properties: { route, tier },
});
const length = (f) => {
  const c = f.geometry.coordinates;
  let sum = 0;
  for (let i = 1; i < c.length; i++) sum += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]) / KM;
  return sum;
};

test('routes sharing a street share one run; a crossing route keeps its own', () => {
  const runs = busNames([
    // 15 and 9 share 2 to 6 km along y = 0, 9 drawn 20 m off (its own side
    // of the street); 15 goes on to 8 km.
    line('15', 'frequent', [0, 0], [8, 0]),
    line('9', 'hourly', [2, 0.02], [6, 0.02], [6, 3]),
    // 40 crosses at 4 km.
    line('40', 'every30', [4, -3], [4, 3]),
  ]);
  const shared = runs.filter((r) => r.properties.n === 2);
  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].properties, { label: '15 · 9', label_main: '15', routes: '9 15', tier: 'frequent', n: 2, chars: 6, chars_main: 2 });
  assert.ok(Math.abs(length(shared[0]) - 4) < 0.1, `shared run is ${length(shared[0])} km`);
  // 15 alone at both ends, 9 alone heading north, 40 alone and never with
  // anyone where it crosses.
  const alone = (route) => runs.filter((r) => r.properties.routes === route).reduce((s, r) => s + length(r), 0);
  assert.ok(Math.abs(alone('15') - 4) < 0.1, `15 alone ${alone('15')} km`);
  assert.ok(Math.abs(alone('9') - 3) < 0.1, `9 alone ${alone('9')} km`);
  assert.ok(Math.abs(alone('40') - 6) < 0.1, `40 alone ${alone('40')} km`);
  assert.equal(runs.filter((r) => r.properties.routes.includes('40') && r.properties.n > 1).length, 0);
  // Every route is covered once: 8 + 3 + 6 km of street.
  assert.ok(Math.abs(runs.reduce((s, r) => s + length(r), 0) - 17) < 0.2);
  // An hourly route alone has no main label.
  assert.equal(runs.find((r) => r.properties.routes === '9').properties.label_main, '');
});

test('a short wobble in who is alongside does not cut a run', () => {
  // 20 runs 100 m alongside 15 in the middle of nowhere: too short a run.
  const runs = busNames([line('15', 'frequent', [0, 0], [4, 0]), line('20', 'hourly', [2, 0.02], [2.1, 0.02])]);
  assert.equal(runs.filter((r) => r.properties.routes === '15').length, 1);
  assert.ok(Math.abs(length(runs.find((r) => r.properties.routes === '15')) - 4) < 0.1);
});

test('labels name the strongest routes first, three when many share a street, then a count', () => {
  const r = (route, tier) => ({ route, tier });
  assert.equal(routeLabel([r('9', 'hourly'), r('15', 'frequent'), r('0', 'frequent')]), '0 · 15 · 9');
  assert.equal(
    routeLabel([r('52', 'hourly'), r('0', 'frequent'), r('10', 'every30'), r('6', 'hourly'), r('83', 'frequent'), r('FF', 'frequent')]),
    '0 · 83 · FF +3',
  );
  // Four short ones fit and are all named.
  assert.equal(routeLabel([r('1', 'hourly'), r('2', 'hourly'), r('3', 'hourly'), r('4', 'hourly')]), '1 · 2 · 3 · 4');
  // Five: three named, two counted. Long names shrink to two.
  assert.equal(routeLabel([1, 2, 3, 4, 5].map((n) => r(String(n), 'hourly'))), '1 · 2 · 3 +2');
  assert.equal(routeLabel(['104L', '169L', '145X', 'AB', 'AL'].map((n) => r(n, 'hourly'))), '104L · 145X +3');
});

test('a label never ends in +1: the one route left over is named', () => {
  const r = (route, tier) => ({ route, tier });
  const tiers = ['frequent', 'every30', 'hourly'];
  for (const names of [['1', '2', '3', '4'], ['104L', '169L', '145X', 'AB'], ['104L', '169L', '145X', 'AB', 'AL', 'BOLT']]) {
    for (let n = 1; n <= names.length; n++) {
      const label = routeLabel(names.slice(0, n).map((x, i) => r(x, tiers[i % 3])));
      assert.ok(!/\+1$/.test(label), label);
      // Every route is named or counted.
      const named = label.replace(/ \+\d+$/, '').split(' · ').length;
      const counted = Number(label.match(/ \+(\d+)$/)?.[1] ?? 0);
      assert.equal(named + counted, n, label);
    }
  }
  // Four long ones would be too wide, and three and "+1" is not allowed: two and "+2".
  assert.equal(routeLabel(['104L', '169L', '145X', 'AB'].map((x) => r(x, 'hourly'))), '104L · 145X +2');
});

test('bus names carry the length of each label, and none ends in +1', () => {
  const runs = busNames([
    ...['1', '2', '3', '4', '5'].map((n, i) => line(n, i < 2 ? 'frequent' : 'hourly', [0, i * 0.005], [3, i * 0.005])),
  ]);
  assert.ok(runs.length > 0);
  for (const f of runs) {
    const p = f.properties;
    assert.equal(p.chars, p.label.length);
    assert.equal(p.chars_main, p.label_main.length);
    assert.ok(!/\+1$/.test(p.label) && !/\+1$/.test(p.label_main), p.label);
  }
  assert.equal(runs.find((f) => f.properties.n === 5).properties.label, '1 · 2 · 3 +2');
});

test('a stop names the drawn lines, families as their map route', () => {
  const family = new Map([['FF1', 'FF'], ['FF5', 'FF'], ['101T', 'T']]);
  const drawn = new Set(['FF', 'T', '15', '15L', 'E']);
  const lineOf = (code) => (drawn.has(code) ? code : drawn.has(family.get(code)) ? family.get(code) : null);
  assert.equal(stopLines('FF1, FF5, 15L, 15', lineOf), '15 15L FF');
  assert.equal(stopLines('101T, E, D', lineOf), 'E T');
  assert.equal(stopLines('PLFX', lineOf), '');
  assert.equal(stopLines(null, lineOf), '');
});

test('stop directions read as words', () => {
  assert.equal(heading('N'), 'Northbound');
  assert.equal(heading('W'), 'Westbound');
  assert.equal(heading('SE'), 'Southeast-bound');
  assert.equal(heading('nw'), 'Northwest-bound');
  assert.equal(heading(''), null);
  assert.equal(heading(null), null);
  assert.equal(heading('X'), null);
});
