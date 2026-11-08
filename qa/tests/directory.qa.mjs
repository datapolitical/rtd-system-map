// Task 2: edge cases in scripts/lib/directory.mjs and scripts/lib/labels.mjs.
//
// Expectations come from the functions' doc comments and DESIGN.md
// ("Highlight, don't list", "Stations lead with trains"), never from watching
// what the code currently does.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directory } from '../../scripts/lib/directory.mjs';
import { destination } from '../../scripts/lib/labels.mjs';

// 1 degree of latitude is about 111.2 km; these offsets are metres.
const northOf = (at, meters) => [at[0], at[1] + meters / 111195];

const station = (id, name, lon, lat, lines) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { id, name, label: name.replace(/ Station$/, ''), served: true, lines, returns: null },
});
const routeFeature = (route, mode) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-105, 39.7], [-104.99, 39.7]] },
  properties: { route, mode, name: route },
});
const stop = (lon, lat, routes) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name: 'stop', routes },
});
const facility = (lon, lat, spaces) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name: 'parking', spaces },
});

test('directory lists a bus stop within 250 m of a station, and parking within 400 m', () => {
  // directory.mjs: "A bus stop belongs to a station within this distance: bus
  // bays can be a block from the platforms" (STOP_METERS = 250) and "A
  // Park-n-Ride serves the station within this distance" (PARKING_METERS = 400).
  const at = [-105, 39.7];
  const result = directory({
    routes: [routeFeature('15', 'bus'), routeFeature('20', 'bus'), routeFeature('A', 'rail')],
    stations: [station(1, 'Union Station', ...at, 'A 15'), station(2, 'Airport Station', -104.9, 39.7, 'A')],
    stops: [stop(...northOf(at, 150), '15'), stop(...northOf(at, 400), '20')],
    facilities: [facility(...northOf(at, 350), 50), facility(...northOf(at, 50), 0), facility(...northOf(at, 450), 99)],
    service: { ends: { A: [0, 1] }, headsigns: { A: ['Union Station', 'Airport Station'] }, order: { A: [0, 1] } },
    busEnds: new Map(),
    lineOf: (code) => code,
    urls: new Map(),
  });

  const union = result.stations.find((s) => s.id === 1);
  assert.equal(union.buses, '15', 'a stop 400 m away is not a station bus stop');
  assert.equal(union.parking, 50, 'only a facility with spaces, within 400 m');
  assert.deepEqual(union.lines, 'A 15');
});

test('directory reads a bus end from the headsign, dropping the via clause', () => {
  // directory.mjs `place`: "\"Billings via E Colfax Ave\" -> \"Billings\"".
  const at = [-105, 39.7];
  const result = directory({
    routes: [routeFeature('15', 'bus')],
    stations: [station(1, 'Union Station', ...at, '15')],
    stops: [],
    facilities: [],
    service: { ends: {}, headsigns: {}, order: {} },
    busEnds: new Map([
      [
        '15',
        [
          { headsigns: ['Billings via E Colfax Ave'], at: null, path: null },
          { headsigns: ['Union Station'], at: null, path: null },
        ],
      ],
    ]),
    lineOf: (code) => code,
    urls: new Map(),
  });
  assert.deepEqual(
    result.routes[0].goes.map((g) => g.name),
    ['Billings', 'Union Station'],
  );
});

test('directory reads a route outward from the hub, the station the most lines serve', () => {
  // "A route's two ends read from the end nearer the network's hub, the station
  // the most lines serve, so most routes read outward from downtown."
  const hubAt = [-105, 39.74];
  const farAt = [-104.7, 39.5];
  const result = directory({
    routes: [routeFeature('15', 'bus')],
    stations: [station(1, 'Union Station', ...hubAt, 'A 15 20'), station(2, 'Elsewhere Station', -104.8, 39.6, '15')],
    stops: [],
    facilities: [],
    service: { ends: {}, headsigns: {}, order: {} },
    // goes[1] is the end nearer the hub, so the pair is reversed.
    busEnds: new Map([['15', [{ headsigns: ['Far'], at: farAt, path: null }, { headsigns: ['New Union Station'], at: hubAt, path: null }]]]),
    lineOf: (code) => code,
    urls: new Map(),
  });
  assert.deepEqual(
    result.routes[0].goes.map((g) => g.name),
    ['Union Station', 'Far'],
    'the end at the station takes the station name, and it reads first',
  );
});

test('directory drops a loop end that repeats the other end', () => {
  // "A loop shows one end."
  const at = [-105, 39.7];
  const result = directory({
    routes: [routeFeature('15', 'bus')],
    stations: [station(1, 'Union Station', ...at, '15')],
    stops: [],
    facilities: [],
    service: { ends: {}, headsigns: {}, order: {} },
    busEnds: new Map([['15', [{ headsigns: ['Union Station'], at: null, path: null }, { headsigns: ['15 Union Station'], at: null, path: null }]]]),
    lineOf: (code) => code,
    urls: new Map(),
  });
  assert.equal(result.routes[0].goes.length, 1, 'the same place twice is one end');
});

test('destination drops the line and "to", and keeps the station label when the sign repeats it', () => {
  // labels.mjs: "A headsign without the line it's on ("E-Line RidgeGate",
  // "Train to Alameda Station"): the sign's bullets already say that. One that
  // names the station in full is just the station's label."
  assert.equal(destination('E-Line RidgeGate', 'E', 'RidgeGate'), 'RidgeGate');
  assert.equal(destination('Train to Alameda Station', 'E', 'Alameda'), 'Alameda');
  assert.equal(destination('A Line to Denver Airport', 'A', 'Denver Airport'), 'Denver Airport');
  assert.equal(destination('15 to Billings', '15', 'Billings'), 'Billings');
});

test('destination escapes a line code that is regex syntax', () => {
  // The line is interpolated into a RegExp, so it must be escaped.
  assert.equal(destination('A+Line to X', 'A+', 'Y'), 'X');
});

test('destination writes a dash between two places as an en dash', () => {
  assert.equal(destination('Union Station - Airport', 'E', 'Peoria'), 'Union Station – Airport');
});
