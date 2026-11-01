import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stationService } from '../scripts/lib/stations.mjs';

const csv = (rows) => rows.map((r) => r.join(',')).join('\n');
const point = (name, lon, lat) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name } });

// A tiny network around (0, 0). Stations are about 1.1 km apart.
const stations = [
  point('Open', 0, 0),
  point('Closed', 0.01, 0),
  point('Returning', 0.02, 0),
  point('Bus only', 0.03, 0),
];

function feed({ extraTrips = [], extraStopTimes = [], calendarDates = [] } = {}) {
  return {
    'calendar.txt': csv([
      ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
      ['NOW', 1, 1, 1, 1, 1, 1, 1, '20261101', '20261231'],
      ['LATER', 1, 1, 1, 1, 1, 1, 1, '20261123', '20261231'],
    ]),
    'calendar_dates.txt': csv([['service_id', 'date', 'exception_type'], ...calendarDates]),
    'routes.txt': csv([
      ['route_id', 'route_short_name', 'route_type'],
      ['101X', 'X', '0'],
      ['Y', 'Y', '2'],
      ['Z', 'Z', '0'],
      ['15', '15', '3'],
    ]),
    'trips.txt': csv([
      ['route_id', 'service_id', 'trip_id', 'direction_id'],
      ['101X', 'NOW', 'x1', '0'],
      ['Y', 'NOW', 'y1', '0'],
      ['Y', 'NOW', 'y2', '1'],
      ['101X', 'LATER', 'x2', '1'],
      ['15', 'NOW', 'b1', '0'],
      ...extraTrips,
    ]),
    // Platforms sit about 20 m from their station, under a parent station.
    'stops.txt': csv([
      ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'],
      ['S1', 'Open Station', '0', '0', '1', ''],
      ['p1a', 'Open Station', '0.0002', '0', '0', 'S1'],
      ['p1b', 'Open Station', '-0.0002', '0', '0', 'S1'],
      ['S2', 'Closed Station', '0', '0.01', '1', ''],
      ['p2', 'Closed Station', '0.0002', '0.01', '0', 'S2'],
      ['S3', 'Returning Station', '0', '0.02', '1', ''],
      ['p3', 'Returning Station', '0.0002', '0.02', '0', 'S3'],
      ['b4', 'Bus stop', '0', '0.03', '0', ''],
      ['far', 'Far Away Station', '0.5', '0.5', '0', ''],
    ]),
    'stop_times.txt': csv([
      ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
      ['x1', '08:00:00', '08:00:00', 'p1a', '1'],
      ['y1', '08:05:00', '08:05:00', 'p1b', '1'],
      ['y2', '08:35:00', '08:35:00', 'p1b', '1'],
      ['x2', '09:00:00', '09:00:00', 'p3', '1'],
      ['b1', '10:00:00', '10:00:00', 'b4', '1'],
      ...extraStopTimes,
    ]),
  };
}

const options = {
  today: new Date('2026-11-01T00:00:00Z'),
  isRailRoute: (r) => r.route_type !== '3',
  lineOf: (r) => r.route_short_name,
};
const byName = (result) => Object.fromEntries(stations.map((s, i) => [s.properties.name, result.stations[i]]));

test('a station with trains this week is served, with its lines', () => {
  const { Open } = byName(stationService(feed(), stations, options));
  assert.deepEqual(Open, { served: true, lines: ['X', 'Y'], returns: null });
});

test('a station with no trains in the feed is not served and has no return date', () => {
  const { Closed, 'Bus only': busOnly } = byName(stationService(feed(), stations, options));
  assert.deepEqual(Closed, { served: false, lines: [], returns: null });
  assert.deepEqual(busOnly, { served: false, lines: [], returns: null });
});

test('a station whose trains start later says when they return', () => {
  const { Returning } = byName(stationService(feed(), stations, options));
  assert.deepEqual(Returning, { served: false, lines: [], returns: '2026-11-23' });
});

test('a station becomes served as soon as the feed has trains there', () => {
  const restored = feed({ extraStopTimes: [['x1', '08:10:00', '08:10:00', 'p2', '2']] });
  const { Closed } = byName(stationService(restored, stations, options));
  assert.deepEqual(Closed, { served: true, lines: ['X'], returns: null });
});

test('service removed by calendar_dates for the whole week does not count', () => {
  const week = ['20261101', '20261102', '20261103', '20261104', '20261105', '20261106', '20261107'];
  const closedThisWeek = feed({ calendarDates: week.map((d) => ['NOW', d, '2']) });
  const { Open } = byName(stationService(closedThisWeek, stations, options));
  assert.deepEqual(Open, { served: false, lines: [], returns: '2026-11-08' });
});

test('GTFS rail stations far from any map station are reported', () => {
  const far = feed({ extraStopTimes: [['x1', '08:20:00', '08:20:00', 'far', '3']] });
  assert.deepEqual(stationService(far, stations, options).unmatched, ['Far Away Station']);
});

test('one-way trains that stop only where other lines stop are not a line', () => {
  // Like RTD's early-morning D trains, which run one way on the C Line's track.
  const positioning = feed({
    extraTrips: [['Z', 'NOW', 'z1', '1'], ['Z', 'NOW', 'z2', '1']],
    extraStopTimes: [['z1', '04:10:00', '04:10:00', 'p1a', '1'], ['z2', '04:40:00', '04:40:00', 'p1a', '1']],
  });
  const result = stationService(positioning, stations, options);
  assert.deepEqual(result.positioning, ['Z']);
  assert.deepEqual(byName(result).Open.lines, ['X', 'Y']);
});

test('one-way trains are still a line where no other line stops', () => {
  const only = feed({ extraTrips: [['Z', 'NOW', 'z1', '1']], extraStopTimes: [['z1', '04:10:00', '04:10:00', 'p2', '1']] });
  const result = stationService(only, stations, options);
  assert.deepEqual(result.positioning, []);
  assert.deepEqual(byName(result).Closed.lines, ['Z']);
});
