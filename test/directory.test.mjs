import test from 'node:test';
import assert from 'node:assert/strict';
import { directory } from '../scripts/lib/directory.mjs';

// A small network: one rail station, two bus routes whose signs start with
// the same word, far from any station.
const station = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-105, 40] },
  properties: { id: 1, name: '40th / Colorado Station', label: '40th / Colorado', served: true, lines: 'A', returns: null },
};
const bus = (route, name) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-104.9, 39.7], [-104.8, 39.7]] },
  properties: { route, name, mode: 'bus', tier: 'frequent', wk: 10 },
});
const ends = (...signs) => signs.map((h, k) => ({ headsigns: [h], at: [-104.9 + k * 0.1, 39.7], path: null }));

function build(routes, busEnds) {
  return directory({
    routes,
    stations: [station],
    stops: [],
    facilities: [],
    service: { ends: {}, headsigns: {}, order: {} },
    busEnds,
    lineOf: (code) => code,
    urls: new Map(),
  });
}

test("a sign that starts with the service's name names the place after it", () => {
  const index = build(
    [bus('FreeRide', '16th Street FreeRide'), bus('37', 'Smith Road Industrial')],
    new Map([
      // RTD's old name for the FreeRide, on every sign: not a place.
      ['FreeRide', ends('Free MallRide Civic Center', 'Free MallRide Union Station')],
      // Shared words that are part of a place's name stay.
      ['37', ends('40th & Airport Stn', '40th & Colorado Stn')],
    ]),
  );
  const goes = (route) => index.routes.find((r) => r.route === route).goes.map((g) => g.name);
  assert.deepEqual(goes('FreeRide'), ['Civic Center', 'Union Station']);
  assert.deepEqual(goes('37'), ['40th & Airport Station', '40th & Colorado Station']);
});

test("a route's one sign is never cut down", () => {
  const index = build([bus('X', 'Loop')], new Map([['X', ends('Shuttle Downtown')]]));
  assert.deepEqual(index.routes[0].goes.map((g) => g.name), ['Shuttle Downtown']);
});
