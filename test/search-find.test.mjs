// Search's matching and ordering (public/js/search/find.js; DESIGN.md, "Search"), on a small
// made-up network shaped like RTD's built data. And that search stays apart from the sheets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, find, shortList, describe, result, metres, placeKind, SHOWN } from '../public/js/search/find.js';

const point = (coordinates, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });
const directory = {
  routes: [
    { route: 'A', name: 'Union Station to Denver Airport Station', mode: 'rail', tier: 'frequent', color: '#57C1E9', wk: 15, bbox: [-105, 39.75, -104.67, 39.85], goes: [{ name: 'Union Station' }, { name: 'Denver Airport' }] },
    { route: 'E', name: 'Union Station to RidgeGate Parkway Station', mode: 'rail', tier: 'frequent', color: '#552683', wk: 15, goes: [{ name: 'Union Station' }, { name: 'RidgeGate' }] },
    { route: '15', name: 'East Colfax', mode: 'bus', tier: 'frequent', wk: 15, goes: [{ name: 'Union Station' }, { name: 'Aurora' }] },
    { route: '15L', name: 'East Colfax Limited', mode: 'bus', tier: 'frequent', wk: 10, goes: [{ name: 'Union Station' }, { name: 'Aurora Metro Center Station' }] },
    { route: '153', name: 'Chambers Road', mode: 'bus', tier: 'every30', wk: 30, goes: [] },
    { route: 'Bound', code: 'BOND', name: '30th Street', mode: 'bus', tier: 'frequent', wk: 15, goes: [] },
    { route: '1', name: 'West 1st Avenue', mode: 'bus', tier: 'every30', wk: 30, goes: [] },
    { route: 'AB', name: 'Boulder / Denver Airport', mode: 'bus', tier: 'hourly', wk: 60, goes: [{ name: 'Downtown Boulder Station' }, { name: 'Denver Airport' }] },
    { route: 'RX', name: 'Brighton Express', mode: 'bus', tier: 'peak', wk: null, goes: [] },
  ],
  stations: [
    { id: 89, name: 'Union Station', label: 'Union Station', at: [-105.0007, 39.7536], served: true, lines: 'A E', buses: '15 15L', parking: 0 },
    { id: 7, name: 'Peoria Station', label: 'Peoria', at: [-104.8468, 39.7702], served: true, lines: 'A', buses: '153', parking: 550 },
    { id: 69, name: '16th Street / California Station', label: '16th Street / California', at: [-104.9923, 39.745], served: false, lines: '', buses: '15', parking: 0 },
  ],
};
const facilities = { features: [
  point([-104.8469, 39.7703], { id: 7, name: 'Peoria Station', class: 'LRT', spaces: 550 }), // the station's own
  point([-105.1, 39.6], { id: 23, name: 'Ken Caryl / C-470', class: 'PNR', spaces: 268 }),
  point([-104.95, 39.72], { id: 40, name: 'Cherry Creek', class: 'TS', spaces: 0 }),
] };
const stops = { features: [
  point([-104.98, 39.74], { id: '12345', name: 'Colfax Ave & Pearl St', routes: '15, 15L', lines: '15 15L', heading: 'Eastbound' }),
  point([-104.981, 39.7401], { id: '12346', name: 'Colfax Ave & Pearl St', routes: '15', lines: '15', heading: 'Westbound' }),
  point([-105.1002, 39.6001], { id: '20001', name: 'Ken Caryl PnR Gate A', routes: '1', lines: '1', heading: 'Northbound' }),
  point([-105.0007, 39.7536], { id: '30001', name: 'Union Station Track 1', routes: 'A', lines: 'A', heading: 'Eastbound', platform: 1 }),
] };
const index = buildIndex({ directory, facilities, stops });
const top = (q) => shortList(find(index, q));
const names = (q) => top(q).flatMap(([, list]) => list.map((x) => describe(x).main));

test('an exact route number comes first, before routes that only start with it', () => {
  const [[group, list]] = top('15');
  assert.equal(group, 'routes');
  assert.deepEqual(list.map((x) => x.e.r.route), ['15', '15L', '153']);
});

test('a letter finds the rail line, and "a line" does too', () => {
  assert.equal(top('a')[0][1][0].e.r.route, 'A');
  assert.equal(top('A line')[0][1][0].e.r.route, 'A');
  assert.equal(describe(top('a')[0][1][0]).main, 'A Line');
});

test('trains come before buses on a tie', () => {
  // "union" is in the name of both rail lines and in no bus route's own name.
  const routes = find(index, 'union').routes.map((x) => x.e.r.route);
  assert.deepEqual(routes.slice(0, 2), ['A', 'E']);
});

test('a route is found by name, and by RTD\'s map code for it', () => {
  assert.deepEqual(top('colfax')[0][1].map((x) => x.e.r.route), ['15', '15L']); // the shorter name first
  assert.equal(top('bond')[0][1][0].e.r.route, 'Bound');
});

test('a station\'s whole name leads: the station, then the lines that go there', () => {
  const groups = top('Union Station');
  assert.equal(groups[0][0], 'stations');
  assert.equal(groups[1][0], 'routes');
});

test('a route found only by where it ends goes after the groups that match by name', () => {
  const groups = top('aurora').map(([g]) => g);
  assert.deepEqual(groups, ['routes']);
  const boulder = find(index, 'boulder').routes;
  assert.ok(boulder.find((x) => x.e.r.route === 'AB').score < 3, 'AB is named for Boulder');
});

test('a bus stop is found by name and by its number; a platform is left to its station', () => {
  assert.deepEqual(find(index, 'pearl').stops.map((x) => x.e.id), ['12345', '12346']);
  assert.equal(top('12345')[0][0], 'stops');
  assert.equal(find(index, '12345').stops[0].exact, true);
  assert.deepEqual(find(index, '123').stops.map((x) => x.e.id), ['12345', '12346']);
  assert.equal(find(index, 'track').stops.length, 0);
  // Two digits are a route number, not the start of a stop's.
  assert.equal(find(index, '12').stops.length, 0);
});

test('a Park-n-Ride at a station is the station; the others are found by name', () => {
  assert.deepEqual(index.places.map((x) => x.p.name), ['Ken Caryl / C-470', 'Cherry Creek']);
  assert.deepEqual(names('ken caryl'), ['Ken Caryl / C-470', 'Ken Caryl PnR Gate A']);
  assert.equal(placeKind({ class: 'PNR', spaces: 268 }), 'Park-n-Ride');
  assert.equal(placeKind({ class: 'TS', spaces: 0 }), 'Transit center');
});

test('the list is never longer than eight, and every group that matched keeps a row', () => {
  const many = { ...directory, routes: Array.from({ length: 12 }, (_, i) => ({ route: `9${i}`, name: 'Station Loop', mode: 'bus', tier: 'hourly', wk: 60 })) };
  const big = buildIndex({ directory: { ...many, stations: Array.from({ length: 9 }, (_, i) => ({ id: i, name: `Station ${i}`, label: `Station ${i}`, at: [0, i], served: true, lines: '' })) },
    facilities: { features: Array.from({ length: 5 }, (_, i) => point([50, i], { id: i, name: `Station Lot ${i}`, class: 'PNR', spaces: 10 })) },
    stops: { features: Array.from({ length: 9 }, (_, i) => point([60, i], { id: `5000${i}`, name: 'Station Rd', lines: '90', heading: 'Northbound' })) } });
  const groups = shortList(find(big, 'station'));
  assert.equal(groups.reduce((n, [, list]) => n + list.length, 0), SHOWN);
  assert.deepEqual(groups.map(([g]) => g).sort(), ['places', 'routes', 'stations', 'stops']);
});

test('nothing typed, or nothing found, is an empty list', () => {
  assert.deepEqual(top(''), []);
  assert.deepEqual(top('   '), []);
  assert.deepEqual(top('zzzz'), []);
});

test('accents and case do not matter', () => {
  assert.equal(top('COLFAX')[0][1][0].e.r.route, '15');
  assert.equal(top('Cólfax')[0][1][0].e.r.route, '15');
});

test('what a row says: the kind, the number, how often', () => {
  assert.deepEqual(describe(find(index, '15L').routes[0]), { main: 'East Colfax Limited', sub: 'Every 10 min', label: 'Route 15L, East Colfax Limited, Every 10 min', mark: { kind: 'bus', text: '15L', color: null } });
  assert.equal(describe(find(index, 'rx').routes[0]).sub, 'Rush hours only');
  assert.equal(describe(find(index, 'a').routes[0]).sub, 'Union Station to Denver Airport · Every 15 min');
  assert.equal(describe(find(index, 'peoria').stations[0]).sub, 'Rail station · A');
  assert.equal(describe(find(index, 'california').stations[0]).sub, 'Rail station · No trains this week');
  assert.equal(describe(find(index, 'ken').places[0]).sub, 'Park-n-Ride · 268 parking spaces');
  assert.equal(describe(find(index, 'pearl').stops[0]).label, 'Colfax Ave & Pearl St, Stop 12345, Eastbound');
});

test('what choosing hands to the map: where it is and what its card says', () => {
  const route = result(find(index, 'a').routes[0], index);
  assert.deepEqual([route.kind, route.mode, route.route, route.bbox], ['route', 'rail', 'A', [-105, 39.75, -104.67, 39.85]]);
  const station = result(find(index, 'peoria').stations[0], index);
  assert.deepEqual(station.at, [-104.8468, 39.7702]);
  assert.equal(station.note, 'Rail station · 550 parking spaces');
  assert.deepEqual(station.routes, [{ mode: 'rail', route: 'A', color: '#57C1E9' }, { mode: 'bus', route: '153' }]);
  const stop = result(find(index, '12345').stops[0], index);
  assert.deepEqual([stop.note, stop.at], ['Bus stop 12345 · Eastbound', [-104.98, 39.74]]);
  assert.deepEqual(stop.routes, [{ mode: 'bus', route: '15' }, { mode: 'bus', route: '15L' }]);
  // A Park-n-Ride's routes are those at stops within a five-minute walk.
  const place = result(find(index, 'ken').places[0], index);
  assert.deepEqual(place.routes, [{ mode: 'bus', route: '1' }]);
  assert.equal(place.lead, 'Routes at stops within a five-minute walk');
  assert.equal(result(find(index, 'cherry').places[0], index).lead, '');
});

test('the index works while its files are still loading', () => {
  assert.deepEqual(shortList(find(buildIndex(), 'union')), []);
  const early = buildIndex({ directory });
  assert.equal(shortList(find(early, 'union station'))[0][0], 'stations');
});

test('metres between two points', () => {
  assert.ok(Math.abs(metres([-105, 39.75], [-105, 39.759]) - 1000) < 5);
});

// Chris, 2026-11-27: search is its own module that never reads sheet state, so the zoomable map
// uses it unchanged. Moving the map is the one function it is handed.
test('search reads nothing of the sheets', () => {
  for (const file of ['../public/js/search/box.js', '../public/js/search/find.js']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /sheet|step/i, `${file} names the sheets`);
    assert.doesNotMatch(code, /maplibre|\.getLayer|\.setLayoutProperty|querySelector\(['"]#(?:map|card|steps)/, `${file} reaches for the map`);
    for (const [, from] of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.doesNotMatch(from, /sheets\//, `${file} imports ${from}`);
  }
});
