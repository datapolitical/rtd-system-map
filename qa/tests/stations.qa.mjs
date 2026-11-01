// Task 2: edge cases in scripts/lib/stations.mjs and tierOf from gtfs.mjs.
//
// Expectations come from DESIGN.md and the functions' doc comments, never from
// watching what the code currently does.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stationService } from '../../scripts/lib/stations.mjs';
import { tierOf } from '../../scripts/lib/gtfs.mjs';

// --- Tiers -----------------------------------------------------------------

test('tierOf puts each DESIGN.md boundary on the right side', () => {
  // DESIGN.md:423-428 — Frequent "every 15 min or better", Every 30 "16–30
  // min", Hourly "31–60 min", Infrequent "more than 60 min, or a single trip".
  const day = (headway) => ({ trips: 6, middayDepartures: 6, headway });
  assert.equal(tierOf(day(15)), 'frequent');
  assert.equal(tierOf(day(16)), 'every30');
  assert.equal(tierOf(day(30)), 'every30');
  assert.equal(tierOf(day(31)), 'hourly');
  assert.equal(tierOf(day(60)), 'hourly');
  assert.equal(tierOf(day(61)), 'infrequent');
});

test('tierOf calls a route with one midday trip infrequent, and none at all none', () => {
  // "or a single trip" / "no trips that day".
  assert.equal(tierOf({ trips: 4, middayDepartures: 1, headway: null }), 'infrequent');
  assert.equal(tierOf({ trips: 0, middayDepartures: 0, headway: null }), 'none');
});

// --- Station service -------------------------------------------------------

const csv = (rows) => rows.map((r) => r.join(',')).join('\n') + '\n';
const point = (name, lon, lat) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name } });

const stations = [point('Served', 0, 0), point('Later', 0.01, 0), point('Shared', 0.02, 0)];

function feed({ trips = [], stopTimes = [] } = {}) {
  return {
    'calendar.txt': csv([
      ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
      ['NOW', 1, 1, 1, 1, 1, 1, 1, '20261102', '20261231'],
      // Ten days out: inside no seven-day window that starts on 2026-11-02.
      ['LATER', 1, 1, 1, 1, 1, 1, 1, '20261112', '20261231'],
    ]),
    'calendar_dates.txt': csv([['service_id', 'date', 'exception_type']]),
    'routes.txt': csv([
      ['route_id', 'route_short_name', 'route_type'],
      ['A', 'A', '0'],
      ['P', 'P', '0'],
    ]),
    'stops.txt': csv([
      ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'parent_station'],
      ['st1', 'Served', '0', '0', ''],
      ['p1', 'Served', '0', '0', 'st1'],
      ['st2', 'Later', '0', '0.01', ''],
      ['p2', 'Later', '0', '0.01', 'st2'],
      ['st3', 'Shared', '0', '0.02', ''],
      ['p3', 'Shared', '0', '0.02', 'st3'],
    ]),
    'trips.txt': csv([
      ['route_id', 'service_id', 'trip_id', 'direction_id', 'trip_headsign'],
      ['A', 'NOW', 'a1', '0', 'Later'],
      ['A', 'NOW', 'a2', '1', 'Served'],
      ['A', 'LATER', 'a3', '0', 'Later'],
      ['A', 'LATER', 'a4', '1', 'Served'],
      // A line with trains in one direction only that stops only where A stops.
      ['P', 'NOW', 'p1', '0', 'Later'],
      ...trips,
    ]),
    'stop_times.txt': csv([
      ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
      ['a1', '09:00:00', '09:00:00', 'p1', '1'],
      ['a1', '10:00:00', '10:00:00', 'p3', '2'],
      ['a2', '11:00:00', '11:00:00', 'p3', '1'],
      ['a2', '12:00:00', '12:00:00', 'p1', '2'],
      ['a3', '09:00:00', '09:00:00', 'p2', '1'],
      ['a3', '10:00:00', '10:00:00', 'p3', '2'],
      ['a4', '11:00:00', '11:00:00', 'p3', '1'],
      ['a4', '12:00:00', '12:00:00', 'p2', '2'],
      ['p1', '09:30:00', '09:30:00', 'p3', '1'],
      ...stopTimes,
    ]),
  };
}

const options = {
  today: new Date('2026-11-02T00:00:00Z'),
  isRailRoute: (route) => route.route_type === '0',
  lineOf: (route) => route.route_short_name,
};

test('stationService marks a station with trains this week served, with no return date', () => {
  // Doc comment: stations that are "not served this week" get 'the next call
  // there, when they don't this week'.
  const service = stationService(feed(), stations, options);
  assert.equal(service.stations[0].served, true);
  assert.deepEqual(service.stations[0].lines, ['A']);
  assert.equal(service.stations[0].returns, null);
});

test('stationService gives an unserved station the first date its trains return', () => {
  const service = stationService(feed(), stations, options);
  assert.equal(service.stations[1].served, false);
  assert.equal(service.stations[1].returns, '2026-11-12');
  assert.deepEqual(service.stations[1].lines, []);
});

test('stationService does not count one-way trains that stop only where another line stops', () => {
  // "A line whose trains all run one way, stopping only where other lines stop,
  // is trains getting into position for their first runs, not a line riders can
  // use."
  const service = stationService(feed(), stations, options);
  assert.deepEqual(service.positioning, ['P']);
  assert.deepEqual(service.stations[2].lines, ['A'], 'P is not shown at the station');
});

test('stationService keeps a one-way line that serves a station no other line does', () => {
  // "A line that runs both ways, or serves a station no other line does, is
  // drawn as usual."
  const text = feed();
  text['stops.txt'] = csv([
    ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'parent_station'],
    ['st1', 'Served', '0', '0', ''],
    ['p1', 'Served', '0', '0', 'st1'],
    ['st2', 'Later', '0', '0.01', ''],
    ['p2', 'Later', '0', '0.01', 'st2'],
    ['st3', 'Shared', '0', '0.02', ''],
    ['p3', 'Shared', '0', '0.02', 'st3'],
    ['st4', 'Alone', '0', '0.03', ''],
    ['p4', 'Alone', '0', '0.03', 'st4'],
  ]);
  // P's only stop is a station of its own.
  text['stop_times.txt'] = text['stop_times.txt'].replace('p1,09:30:00,09:30:00,p3,1', 'p1,09:30:00,09:30:00,p4,1');
  const withAlone = [...stations, point('Alone', 0.03, 0)];
  const service = stationService(text, withAlone, options);
  assert.deepEqual(service.positioning, [], 'P has a station to itself');
  assert.deepEqual(service.stations[3].lines, ['P'], 'and it is shown there');
});
