import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineEnds, matchGtfs, readCsv, riderNames, routeFrequency, tierOf } from '../scripts/lib/gtfs.mjs';

const csv = (rows) => rows.map((r) => r.join(',')).join('\n');
const codes = (found) => found.map((r) => r.route_short_name || r.route_id).sort();

// A tiny feed around (0, 0), a degree of longitude wide. The map draws one
// Baseline line (225) and one airport line (AT). 225 runs hourly; 225D runs
// the same stops half an hour later on a longer path, and 225T runs weekends.
// ATA shares AT's name, so it counts as AT.
const BASE_NAME = 'Boulder / Lafayette via Baseline';
const AT_NAME = 'Arapahoe County / Denver Airport';

function feed() {
  return {
    'calendar.txt': csv([
      ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
      ['WK', 1, 1, 1, 1, 1, 0, 0, '20260101', '20261231'],
      ['SA', 0, 0, 0, 0, 0, 1, 0, '20260101', '20261231'],
    ]),
    'routes.txt': csv([
      ['route_id', 'route_short_name', 'route_long_name', 'route_type'],
      ['225', '225', BASE_NAME, '3'],
      ['225D', '225D', BASE_NAME, '3'],
      ['225T', '225T', BASE_NAME, '3'],
      ['AT', 'AT', AT_NAME, '3'],
      ['ATA', 'ATA', AT_NAME, '3'],
    ]),
    'trips.txt': csv([
      ['route_id', 'service_id', 'trip_id', 'direction_id', 'shape_id', 'trip_headsign'],
      ['225', 'WK', 'b1', '0', 'S1', 'Lafayette'],
      ['225', 'WK', 'b2', '0', 'S1', 'Lafayette'],
      ['225', 'WK', 'b3', '0', 'S1', 'Lafayette'],
      ['225', 'WK', 'b4', '0', 'S1', 'Lafayette'],
      ['225', 'WK', 'b5', '0', 'S1', 'Lafayette'],
      ['225', 'WK', 'b6', '0', 'S1', 'Lafayette'],
      ['225D', 'WK', 'd1', '0', 'S2', 'Willoughby'],
      ['225D', 'WK', 'd2', '0', 'S2', 'Willoughby'],
      ['225D', 'WK', 'd3', '0', 'S2', 'Willoughby'],
      ['225D', 'WK', 'd4', '0', 'S2', 'Willoughby'],
      ['225D', 'WK', 'd5', '0', 'S2', 'Willoughby'],
      ['225D', 'WK', 'd6', '0', 'S2', 'Willoughby'],
      ['225T', 'SA', 't1', '0', 'S2', 'Willoughby'],
      ['AT', 'WK', 'a1', '0', 'S3', 'Airport'],
      ['ATA', 'WK', 'x1', '0', 'S4', 'Airport'],
    ]),
    // b1 is a short turn that ends at the first stop; the rest run to B.
    'stop_times.txt': csv([
      ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type'],
      ['b1', '09:00:00', '09:00:00', 'A', '1', '0'],
      ['b2', '10:00:00', '10:00:00', 'A', '1', '0'],
      ['b2', '10:10:00', '10:10:00', 'B', '2', '1'],
      ['b3', '11:00:00', '11:00:00', 'A', '1', '0'],
      ['b3', '11:10:00', '11:10:00', 'B', '2', '1'],
      ['b4', '12:00:00', '12:00:00', 'A', '1', '0'],
      ['b4', '12:10:00', '12:10:00', 'B', '2', '1'],
      ['b5', '13:00:00', '13:00:00', 'A', '1', '0'],
      ['b5', '13:10:00', '13:10:00', 'B', '2', '1'],
      ['b6', '14:00:00', '14:00:00', 'A', '1', '0'],
      ['b6', '14:10:00', '14:10:00', 'B', '2', '1'],
      ...['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].flatMap((id, k) => {
        const start = 9.5 + k; // 09:30, 10:30, …
        const clock = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
        const h = Math.floor(start);
        return [
          [id, clock(h, 30), clock(h, 30), 'A', '1', '0'],
          [id, clock(h, 40), clock(h, 40), 'B', '2', '0'],
          [id, clock(h, 50), clock(h, 50), 'C', '3', '1'],
        ];
      }),
      ['t1', '10:00:00', '10:00:00', 'A', '1', '0'],
      ['t1', '10:10:00', '10:10:00', 'B', '2', '1'],
      ['a1', '06:00:00', '06:00:00', 'A', '1', '0'],
      ['a1', '07:00:00', '07:00:00', 'N', '2', '1'],
      ['x1', '03:00:00', '03:00:00', 'A', '1', '0'],
      ['x1', '03:30:00', '03:30:00', 'N', '2', '1'],
    ]),
    'stops.txt': csv([
      ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
      ['A', 'Depot', '0', '0'],
      ['B', 'Terminal', '0', '0.01'],
      ['C', 'Willoughby', '0', '0.05'],
      ['N', 'Airport', '0', '0.02'],
    ]),
    // Every shape runs past its last stop: S1 ends 2.2 km past B, S2 at C.
    'shapes.txt': csv([
      ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
      ['S1', '0', '0', '1'],
      ['S1', '0', '0.02', '2'],
      ['S1', '0', '0.03', '3'],
      ['S2', '0', '0', '1'],
      ['S2', '0', '0.05', '2'],
      ['S3', '0', '0', '1'],
      ['S3', '0', '0.02', '2'],
      ['S4', '0', '0', '1'],
      ['S4', '0', '0.02', '2'],
    ]),
  };
}

test("a drawn route's headway counts its variants' trips", () => {
  const text = feed();
  const routes = readCsv(text['routes.txt']);
  const drawn = [
    { route: '225', name: BASE_NAME },
    { route: 'AT', name: AT_NAME },
  ];
  const groupOf = new Map();
  for (const p of drawn) for (const r of matchGtfs(p, routes)) groupOf.set(r.route_id, p.route);
  const frequency = routeFrequency(text, { weekday: { date: '2026-11-02', services: ['WK'] } }, (id) => groupOf.get(id) ?? id);
  const weekday = frequency.get('225').weekday;
  // Six 225 trips and six 225D trips, half an hour apart: every 30 minutes.
  assert.equal(weekday.trips, 12);
  assert.equal(weekday.headway, 30);
  assert.equal(tierOf(weekday), 'every30');
});

test('an exact route number still takes its family, and only its family', () => {
  const routes = readCsv(feed()['routes.txt']);
  assert.deepEqual(codes(matchGtfs({ route: '225', name: BASE_NAME }, routes)), ['225', '225D', '225T']);
  assert.deepEqual(codes(matchGtfs({ route: 'AT', name: AT_NAME }, routes)), ['AT', 'ATA']);
  // A shared prefix isn't enough: the family has exactly the route's name.
  assert.deepEqual(codes(matchGtfs({ route: '22', name: 'Another route' }, routes)), []);
});

test('a route drawn on its own is never another\'s family', () => {
  const routes = readCsv(feed()['routes.txt']);
  const drawn = new Set(['225', '225D']);
  assert.deepEqual(codes(matchGtfs({ route: '225', name: BASE_NAME }, routes, drawn)), ['225', '225T']);
  assert.deepEqual(codes(matchGtfs({ route: '225D', name: BASE_NAME }, routes, drawn)), ['225D']);
});

test("a route goes by its timetable name, not the map's code for it", () => {
  const gtfs = (id, name) => ({ route_id: id, route_short_name: name });
  const names = riderNames(
    new Map([
      // One timetable route under another name: riders know that name.
      ['BOND', [gtfs('BOND', 'Bound')]],
      ['LD', [gtfs('LD1', 'LD1')]],
      // The same name already: nothing changes.
      ['15', [gtfs('15', '15')]],
      // A family keeps the code its members share.
      ['FF', [gtfs('FF1', 'FF1'), gtfs('FF2', 'FF2')]],
      // No timetable route, or a timetable route with no name of its own.
      ['ZZ', []],
      ['A', [gtfs('A', '')]],
      // Routes are listed with spaces between them, so a name can't hold one.
      ['SKY', [gtfs('SKY', 'Sky Ride')]],
      // Two routes can't share a name: the second keeps its code, and a route
      // never takes the name another route already goes by.
      ['X1', [gtfs('X1', 'Loop')]],
      ['X2', [gtfs('X2', 'Loop')]],
      ['Y', [gtfs('Y', '15')]],
    ]),
  );
  assert.deepEqual(Object.fromEntries(names), { BOND: 'Bound', LD: 'LD1', 15: '15', FF: 'FF', ZZ: 'ZZ', A: 'A', SKY: 'SKY', X1: 'Loop', X2: 'X2', Y: 'Y' });
});

test('a route ends where its longest trip ends, not where its shape does', () => {
  const text = feed();
  const ends = lineEnds(text, (id) => (['225', '225D', '225T'].includes(id) ? '225' : null), ['WK']).get('225');
  assert.equal(ends.length, 1);
  // B, the last stop of the longest 225 trip, not the shape's end 2.2 km past
  // it and not 225D's terminal on its own, longer path.
  assert.deepEqual(ends[0].at, [0.01, 0]);
  assert.deepEqual(ends[0].path.at(-1), [0.03, 0]);
});
