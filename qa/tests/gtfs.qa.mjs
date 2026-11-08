// Task 2: edge cases in scripts/lib/gtfs.mjs.
//
// Expectations come from DESIGN.md and the functions' own doc comments, never
// from watching what the code currently does. Run with:
//
//   node --test qa/tests/
//
// The feed fixtures below are hand-written text; nothing here reads or writes
// public/data.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  csvRows,
  lineEnds,
  lineShapes,
  readCsv,
  representativeDates,
  routeFrequency,
  serviceDates,
} from '../../scripts/lib/gtfs.mjs';

const csv = (rows) => rows.map((r) => r.join(',')).join('\n') + '\n';

const CALENDAR_HEADER = ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'];
const TRIPS_HEADER = ['route_id', 'service_id', 'trip_id', 'direction_id', 'trip_headsign', 'shape_id'];

// --- CSV -------------------------------------------------------------------

test('readCsv keeps a quoted comma and a doubled quote', () => {
  // csvRows' doc comment: "Parse CSV text into arrays of strings, handling
  // quoted fields."
  const rows = readCsv('stop_id,stop_name,stop_desc\n1,"Colfax & Wheeling, east","say ""hi"" now"\n');
  assert.deepEqual(rows, [{ stop_id: '1', stop_name: 'Colfax & Wheeling, east', stop_desc: 'say "hi" now' }]);
});

test('csvRows skips a blank line, a BOM and a missing final newline', () => {
  const rows = [...csvRows('\uFEFFa,b\r\n1,2\r\n\r\n3,4')];
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
  ]);
});

// --- Service dates ---------------------------------------------------------

test('serviceDates applies a calendar_dates addition and removal', () => {
  // "from calendar.txt with calendar_dates.txt's additions and removals applied".
  const text = {
    'calendar.txt': csv([
      CALENDAR_HEADER,
      ['WK', 1, 1, 1, 1, 1, 0, 0, '20261102', '20261106'],
    ]),
    'calendar_dates.txt': csv([
      ['service_id', 'date', 'exception_type'],
      ['EXTRA', '20261103', '1'],
      ['WK', '20261104', '2'],
    ]),
  };
  const dates = serviceDates(text);
  assert.deepEqual([...dates.get('WK')].sort(), ['20261102', '20261103', '20261105', '20261106']);
  assert.deepEqual([...dates.get('EXTRA')], ['20261103']);
});

test('representativeDates skips exception dates and picks the pattern most days share', () => {
  // "Looks at the next eight weeks, skips dates with exceptions (holidays and
  // one-off changes), and uses the service pattern most of those days share."
  const text = {
    'calendar.txt': csv([
      CALENDAR_HEADER,
      ['WK', 1, 1, 1, 1, 1, 0, 0, '20261102', '20261220'],
      ['SAT', 0, 0, 0, 0, 0, 1, 0, '20261102', '20261220'],
      ['SUN', 0, 0, 0, 0, 0, 0, 1, '20261102', '20261220'],
      // One weekday pattern that only one weekday in the window has.
      ['SCHOOL', 0, 0, 1, 0, 0, 0, 0, '20261102', '20261220'],
    ]),
    'calendar_dates.txt': csv([
      ['service_id', 'date', 'exception_type'],
      ['WK', '20261103', '2'],
    ]),
  };
  const dates = representativeDates(text, new Date('2026-11-01T00:00:00Z'));

  assert.equal(dates.weekday.services.join(' '), 'WK', 'the weekday with the most days wins');
  assert.notEqual(dates.weekday.date, '2026-11-03', 'a date with an exception is not typical');
  assert.equal(new Date(`${dates.weekday.date}T12:00:00Z`).getUTCDay() >= 1, true);
  assert.equal(new Date(`${dates.weekday.date}T12:00:00Z`).getUTCDay() <= 5, true);
  assert.equal(dates.saturday.services.join(' '), 'SAT');
  assert.equal(dates.sunday.services.join(' '), 'SUN');
  assert.equal(new Date(`${dates.saturday.date}T12:00:00Z`).getUTCDay(), 6);
  assert.equal(new Date(`${dates.sunday.date}T12:00:00Z`).getUTCDay(), 0);
});

// --- Frequency -------------------------------------------------------------

const frequencyFeed = () => ({
  'trips.txt': csv([
    TRIPS_HEADER,
    // Direction 0 every 30 minutes; direction 1 hourly.
    ['A', 'WK', 'a0', '0', 'Airport', 'S1'],
    ['A', 'WK', 'a1', '0', 'Airport', 'S1'],
    ['A', 'WK', 'a2', '0', 'Airport', 'S1'],
    ['A', 'WK', 'b0', '1', 'Union', 'S2'],
    ['A', 'WK', 'b1', '1', 'Union', 'S2'],
    ['A', 'WK', 'b2', '1', 'Union', 'S2'],
    // Boarding not allowed at S1 on this one: it must not count as a departure.
    ['A', 'WK', 'a3', '0', 'Airport', 'S1'],
    // A trip after midnight the next day.
    ['A', 'WK', 'b3', '1', 'Union', 'S2'],
  ]),
  'stop_times.txt': csv([
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type'],
    ['a0', '09:00:00', '09:00:00', 'S1', '1', '0'],
    ['a1', '09:30:00', '09:30:00', 'S1', '1', '0'],
    ['a2', '10:00:00', '10:00:00', 'S1', '1', '0'],
    ['a3', '09:15:00', '09:15:00', 'S1', '1', '1'],
    ['b0', '09:00:00', '09:00:00', 'S2', '1', '0'],
    ['b1', '10:00:00', '10:00:00', 'S2', '1', '0'],
    ['b2', '11:00:00', '11:00:00', 'S2', '1', '0'],
    ['b3', '25:10:00', '25:10:00', 'S2', '1', '0'],
  ]),
});

test('routeFrequency keeps the less frequent direction and ignores no-boarding stops', () => {
  // Doc comment: "the median gap between midday departures at the route's
  // busiest stop, in each direction, keeping the less frequent direction";
  // DESIGN.md:408 "A route's tier is set by its less frequent direction."
  const dates = { weekday: { date: '2026-11-02', services: ['WK'] } };
  const day = routeFrequency(frequencyFeed(), dates).get('A').weekday;

  assert.equal(day.headway, 60, 'hourly direction sets the route');
  assert.equal(day.middayDepartures, 3, 'the 09:15 trip does not allow boarding');
  assert.equal(day.trips, 8);
  assert.equal(day.first, '09:00');
  assert.equal(day.last, '25:10', 'GTFS times past 24:00 are kept as 25:10');
});

test('routeFrequency measures a family as one route through groupOf', () => {
  // Doc comment: "`groupOf(route_id)` names the line each GTFS route belongs
  // to, so a family that RTD draws as one line is measured as one route."
  const feed = {
    'trips.txt': csv([
      TRIPS_HEADER,
      ['A1', 'WK', 'x', '0', 'Airport', 'S1'],
      ['A2', 'WK', 'y', '0', 'Airport', 'S1'],
    ]),
    'stop_times.txt': csv([
      ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type'],
      ['x', '09:00:00', '09:00:00', 'S1', '1', '0'],
      ['y', '09:10:00', '09:10:00', 'S1', '1', '0'],
    ]),
  };
  const dates = { weekday: { date: '2026-11-02', services: ['WK'] } };
  const result = routeFrequency(feed, dates, (id) => (id.startsWith('A') ? 'A' : id));
  assert.equal(result.has('A1'), false, 'members are not reported on their own');
  assert.equal(result.get('A').weekday.headway, 10);
  assert.equal(result.get('A').weekday.trips, 2);
});

// --- Shapes ----------------------------------------------------------------

test('lineShapes takes the most used shape per direction, and the longer one on a tie', () => {
  // Doc comment: "for each line and direction, the shape most of its trips on
  // `services` follow (all trips if none run then; ties go to the longer
  // shape) ... Returns line -> [[lon, lat], ...] per direction."
  const feed = {
    'trips.txt': csv([
      TRIPS_HEADER,
      ['A', 'WK', 'a1', '0', 'Airport', 'S1'],
      ['A', 'WK', 'a2', '0', 'Airport', 'S1'],
      ['A', 'WK', 'a3', '0', 'Airport', 'S2'],
      ['B', 'WK', 'b1', '0', 'Airport', 'SHORT'],
      ['B', 'WK', 'b2', '0', 'Airport', 'SHORT'],
      ['B', 'WK', 'b3', '0', 'Airport', 'LONG'],
      ['B', 'WK', 'b4', '0', 'Airport', 'LONG'],
      ['C', 'WK', 'c1', '0', 'Airport', 'S1'],
    ]),
    'shapes.txt': csv([
      ['shape_id', 'shape_pt_sequence', 'shape_pt_lon', 'shape_pt_lat'],
      ['S1', '2', '-104.9', '39.8'],
      ['S1', '1', '-105.0', '39.7'],
      ['S2', '1', '-105.0', '39.6'],
      ['S2', '2', '-104.9', '39.6'],
      ['SHORT', '1', '-105.0', '39.5'],
      ['SHORT', '2', '-104.99', '39.5'],
      ['LONG', '1', '-105.0', '39.4'],
      ['LONG', '2', '-104.99', '39.4'],
      ['LONG', '3', '-104.98', '39.4'],
    ]),
  };
  const lineOf = (id) => (id === 'C' ? null : id);
  const shapes = lineShapes(feed, lineOf, ['WK']);

  assert.deepEqual(shapes.get('A'), [
    [
      [-105.0, 39.7],
      [-104.9, 39.8],
    ],
  ]);
  assert.equal(shapes.get('B')[0].length, 3, 'equal trips: the shape with more points wins');
  assert.equal(shapes.has('C'), false, 'a route lineOf skips is not drawn');
});

test('lineEnds orders headsigns by count and ends where its most used shape ends', () => {
  // Doc comment: "the headsigns its trips on `services` show ... most common
  // first, and the most used shape in that direction, which says where it ends."
  const feed = {
    'trips.txt': csv([
      TRIPS_HEADER,
      ['A', 'WK', 'a1', '0', 'Airport', 'S1'],
      ['A', 'WK', 'a2', '0', 'Airport', 'S1'],
      ['A', 'WK', 'a3', '0', 'Union', 'S2'],
      ['A', 'WK', 'b1', '1', 'Union', 'S3'],
    ]),
    'shapes.txt': csv([
      ['shape_id', 'shape_pt_sequence', 'shape_pt_lon', 'shape_pt_lat'],
      ['S1', '1', '-105.0', '39.7'],
      ['S1', '2', '-104.8', '39.9'],
      ['S2', '1', '-105.0', '39.6'],
      ['S2', '2', '-104.7', '39.6'],
      ['S3', '1', '-104.8', '39.9'],
      ['S3', '2', '-105.0', '39.7'],
    ]),
  };
  const ends = lineEnds(feed, (id) => id, ['WK']).get('A');

  assert.equal(ends.length, 2, 'one end per direction');
  assert.deepEqual(ends[0].headsigns, ['Airport', 'Union']);
  assert.deepEqual(ends[0].at, [-104.8, 39.9], 'the last point of the most used shape');
  assert.deepEqual(ends[1].headsigns, ['Union']);
});
