import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busNames, pillRow, pillsText, rowText } from '../scripts/lib/busnames.mjs';
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
  assert.deepEqual(shared[0].properties, { pills: '15:frequent 9:slow', text_main: '15', more: 0, routes: '9 15', tier: 'frequent', n: 2 });
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
  assert.equal(runs.find((r) => r.properties.routes === '9').properties.text_main, '');
});

test('a short wobble in who is alongside does not cut a run', () => {
  // 20 runs 100 m alongside 15 in the middle of nowhere: too short a run.
  const runs = busNames([line('15', 'frequent', [0, 0], [4, 0]), line('20', 'hourly', [2, 0.02], [2.1, 0.02])]);
  assert.equal(runs.filter((r) => r.properties.routes === '15').length, 1);
  assert.ok(Math.abs(length(runs.find((r) => r.properties.routes === '15')) - 4) < 0.1);
});

test('a row is one pill per route, strongest first; four at most, then a plus for the rest', () => {
  const r = (route, tier) => ({ route, tier });
  assert.equal(pillsText(pillRow([r('9', 'hourly'), r('15', 'frequent'), r('0', 'frequent')])), '0:frequent 15:frequent 9:slow');
  // Every slow tier is one look; a rush-hour route sorts after an hourly one.
  assert.equal(pillsText(pillRow([r('1', 'peak'), r('2', 'hourly'), r('3', 'limited'), r('4', 'infrequent')])), '2:slow 4:slow 1:slow 3:slow');
  // Six: the strongest three and a plus. Never a count.
  const six = pillRow([r('52', 'hourly'), r('0', 'frequent'), r('10', 'every30'), r('6', 'hourly'), r('83', 'frequent'), r('FF', 'frequent')]);
  assert.equal(pillsText(six), '0:frequent 83:frequent FF:frequent +:more');
  assert.equal(rowText(six), '0 · 83 · FF +');
  assert.equal(rowText(pillRow([r('15', 'frequent'), r('15L', 'frequent')])), '15 · 15L');
});

test('five routes on a street: three pills and a plus, with every route in the list', () => {
  const runs = busNames([
    ...['1', '2', '3', '4', '5'].map((n, i) => line(n, i < 2 ? 'frequent' : 'hourly', [0, i * 0.005], [3, i * 0.005])),
  ]);
  const five = runs.find((f) => f.properties.n === 5).properties;
  assert.deepEqual(five, { pills: '1:frequent 2:frequent 3:slow +:more', text_main: '1 · 2', more: 1, routes: '1 2 3 4 5', tier: 'frequent', n: 5 });
});

test('a route changing from hourly to rush-hour beside another does not cut the row', () => {
  // 76 runs 0 to 8 km; 9 runs beside it the whole way, hourly to 4 km and
  // rush hours only after. Both pills look the same, so it is one row.
  const runs = busNames([line('76', 'every30', [0, 0], [8, 0]), line('9', 'hourly', [0, 0.01], [4, 0.01]), line('9', 'peak', [4, 0.01], [8, 0.01])]);
  const shared = runs.filter((r) => r.properties.n > 1);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].properties.pills, '76:every30 9:slow');
  assert.ok(Math.abs(length(shared[0]) - 8) < 0.1, `shared run is ${length(shared[0])} km`);
});

test('neighbouring runs that would get the same row are one run', () => {
  // 15 runs 0 to 8 km; 1 to 4 join it from 2 to 6 km, and 5 from 3 to 6 km.
  // From 2 to 3 km the row is "15 1 2 +" and from 3 to 6 km it is the same,
  // so the street gets one row from 2 to 6 km, naming all six routes.
  const runs = busNames([
    line('15', 'frequent', [0, 0], [8, 0]),
    ...['1', '2', '3', '4'].map((n, i) => line(n, 'hourly', [2, (i + 1) * 0.005], [6, (i + 1) * 0.005])),
    line('5', 'hourly', [3, 0.025], [6, 0.025]),
  ]);
  const shared = runs.filter((r) => r.properties.n > 1);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].properties.pills, '15:frequent 1:slow 2:slow +:more');
  assert.equal(shared[0].properties.routes, '1 2 3 4 5 15');
  assert.equal(shared[0].properties.more, 1);
  assert.ok(Math.abs(length(shared[0]) - 4) < 0.1, `shared run is ${length(shared[0])} km`);
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
