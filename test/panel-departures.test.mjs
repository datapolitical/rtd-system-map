// Next departures (#13): the build's per-stop tables (scripts/lib/departures.mjs) and the
// panel's reading of them (public/js/panel/departures.js), on a small made-up timetable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { departureTables } from '../scripts/lib/departures.mjs';
import { upcoming, servicesOn, clockIn, addDays, clock, chunkOf, accessible, departuresHtml, departuresSaid, departureSource } from '../public/js/panel/departures.js';

const csv = (rows) => rows.map((r) => r.join(',')).join('\n');
// Two bus routes and a rail line. Route 9 has a variant, 9L, that the map draws as route 9.
// Trip T5 leaves at 23:50 and reaches its last stop after midnight; T6 leaves the first stop at 24:10.
const text = {
  'agency.txt': csv([['agency_id', 'agency_name', 'agency_timezone'], ['X', 'Test', 'America/Denver']]),
  'routes.txt': csv([['route_id', 'route_short_name'], ['9', '9'], ['9L', '9L'], ['R', 'R']]),
  'calendar.txt': csv([
    ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    ['WK', 1, 1, 1, 1, 1, 0, 0, '20260101', '20261231'],
    ['SU', 0, 0, 0, 0, 0, 0, 1, '20260101', '20261231'],
  ]),
  // Thursday 2026-11-26 runs the Sunday timetable.
  'calendar_dates.txt': csv([['service_id', 'date', 'exception_type'], ['WK', '20261126', 2], ['SU', '20261126', 1]]),
  'trips.txt': csv([
    ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id'],
    ['9', 'WK', 'T1', 'Downtown', 0], ['9', 'WK', 'T2', 'Downtown', 0], ['9L', 'WK', 'T3', 'Downtown', 0],
    ['9', 'SU', 'T4', 'Downtown', 0], ['9', 'WK', 'T5', 'Downtown', 0], ['9', 'WK', 'T6', 'Downtown', 0],
    ['R', 'WK', 'T7', 'Airport', 0], ['R', 'WK', 'T8', 'City', 1], ['9', 'WK', 'T9', 'Uptown', 1],
  ]),
  'stops.txt': csv([['stop_id', 'stop_name', 'wheelchair_boarding'], ['100', 'A St', 1], ['200', 'B St', 2], ['300', 'End', 0], ['P1', 'Platform 1', 1], ['P2', 'Platform 2', 1], ['P9', 'Far', 1]]),
  'stop_times.txt': csv([
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type'],
    ['T1', '08:00:00', '08:00:00', '100', 1, 0], ['T1', '08:10:00', '08:10:30', '200', 2, 0], ['T1', '08:20:00', '08:20:00', '300', 3, 0],
    ['T2', '08:30:00', '08:30:00', '100', 1, 0], ['T2', '08:40:00', '08:40:00', '200', 2, 1], ['T2', '08:50:00', '08:50:00', '300', 3, 0],
    ['T3', '08:15:00', '08:15:00', '100', 1, 0], ['T3', '08:35:00', '08:35:00', '300', 2, 0],
    ['T4', '09:00:00', '09:00:00', '100', 1, 0], ['T4', '09:20:00', '09:20:00', '300', 2, 0],
    ['T5', '23:50:00', '23:50:00', '100', 1, 0], ['T5', '24:05:00', '24:05:00', '200', 2, 0], ['T5', '24:20:00', '24:20:00', '300', 3, 0],
    ['T6', '24:10:00', '24:10:00', '100', 1, 0], ['T6', '24:30:00', '24:30:00', '300', 2, 0],
    ['T7', '08:05:00', '08:05:00', 'P1', 1, 0], ['T7', '08:25:00', '08:25:00', 'P9', 2, 0],
    ['T8', '08:07:00', '08:07:00', 'P2', 1, 0], ['T8', '08:27:00', '08:27:00', 'P9', 2, 0],
    ['T9', '08:02:00', '08:02:00', '200', 1, 0], ['T9', '08:12:00', '08:12:00', '100', 2, 0], ['T9', '08:22:00', '08:22:00', 'P9', 3, 0],
  ]),
};
const built = departureTables(text, { lineOf: (id) => (id === '9L' ? '9' : id), stations: [{ id: 7, stops: ['P1', 'P2', 'nope'] }] });
const { index } = built;
const record = (id) => built.files[chunkOf(id, built.files.length)][id];
const at = (date, h, m = 0) => ({ date, minutes: h * 60 + m });
const flat = (u) => u.rows.map((r) => `${r.name} ${r.headsign} ${r.times.map((t) => t.clock).join(',')}`);

test('the build files every departure by stop, without a trip\'s last stop or a set-down-only call', () => {
  assert.equal(built.departures, 12);
  assert.equal(built.stops, 4, 'A St, B St and the two platforms');
  // B St: T1 at 8:10, T5 at 24:05, T9 at 8:02. T2 only sets down there.
  assert.deepEqual(record('200').d.map(([p, gaps]) => [index.patterns[p].join(' '), gaps]), [['9 9 Downtown WK', [490, 955]], ['9 9 Uptown WK', [482]]]);
  assert.equal(record('200').a, 2);
  // Seconds are dropped, not rounded up: 08:10:30 is 8:10.
  assert.equal(record('200').d[0][1][0], 8 * 60 + 10);
});

test('a stop where trips only end is marked, and says so', () => {
  assert.deepEqual(record('300'), { a: 0, d: [], end: 1 });
  assert.equal(built.ends, 2, 'End and Far');
  const u = upcoming([record('300')], index, at('20261130', 8));
  assert.equal(u.ends, true);
  assert.match(departuresHtml(u), /Trips end here/);
  assert.equal(departuresSaid(u), 'Trips end here. Nothing boards at this stop');
});

test('a route the map draws as one keeps the name on the bus', () => {
  assert.deepEqual(index.patterns.find((p) => p[1] === '9L'), ['9', '9L', 'Downtown', 'WK']);
});

test('the index carries the calendar, its exceptions, the time zone and each station\'s platforms', () => {
  assert.equal(index.tz, 'America/Denver');
  assert.deepEqual(index.services, { WK: { days: '1111100', from: '20260101', to: '20261231' }, SU: { days: '0000001', from: '20260101', to: '20261231' } });
  assert.deepEqual(index.exceptions, [['20261126', 'WK', 2], ['20261126', 'SU', 1]]);
  assert.deepEqual(index.stations, { 7: ['P1', 'P2'] });
  assert.equal(index.files, built.files.length);
});

test('which services run: the weekday, and a holiday on its own timetable', () => {
  assert.deepEqual([...servicesOn(index, '20261130')], ['WK']); // a Monday
  assert.deepEqual([...servicesOn(index, '20261129')], ['SU']); // a Sunday
  assert.deepEqual([...servicesOn(index, '20261128')], []); // a Saturday: nothing runs
  assert.deepEqual([...servicesOn(index, '20261126')], ['SU']); // the holiday
  assert.equal(servicesOn(index, '20270105'), null, 'outside the feed');
});

test('next departures: by route and destination, soonest first, two each', () => {
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261130', 7, 55))), ['9 Downtown 8:00am,8:30am', '9 Uptown 8:12am', '9L Downtown 8:15am']);
  // A departure this minute is still to come; one a minute ago is gone.
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261130', 8, 0)))[0], '9 Downtown 8:00am,8:30am');
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261130', 8, 1)))[0], '9 Uptown 8:12am');
  assert.equal(upcoming([record('100')], index, at('20261130', 7, 55)).rows[0].times[0].in, 5);
});

test('the holiday shows its own timetable; a day with no service shows none', () => {
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261126', 8))), ['9 Downtown 9:00am']);
  const none = upcoming([record('100')], index, at('20261128', 8));
  assert.deepEqual([none.rows, none.known], [[], true]);
  assert.match(departuresHtml(none), /No departures in the next 3 hours/);
});

test('a service day runs past midnight: last night\'s late trips are still to come', () => {
  // 11:45pm Monday: the 11:50pm, then the 12:10am that belongs to Monday's service.
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261130', 23, 45))), ['9 Downtown 11:50pm,12:10am']);
  // 12:02am Tuesday: Monday's 12:10am, though it is Tuesday.
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261201', 0, 2))), ['9 Downtown 12:10am']);
  // 12:02am Saturday: Friday's service still running. 12:02am Sunday: Saturday ran nothing.
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261128', 0, 2))), ['9 Downtown 12:10am']);
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261129', 0, 2))), []);
});

test('nothing beyond the hours ahead; a date outside the timetable is said, not guessed', () => {
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261130', 4))), []);
  assert.deepEqual(flat(upcoming([record('100')], index, at('20261130', 4), { within: 300 })), ['9 Downtown 8:00am,8:30am', '9 Uptown 8:12am', '9L Downtown 8:15am']);
  const out = upcoming([record('100')], index, at('20270301', 8));
  assert.equal(out.known, false);
  assert.match(departuresHtml(out), /doesn’t cover today/);
});

test('a station reads all its platforms, trains first', () => {
  const u = upcoming([record('P1'), record('P2'), record('100')], index, at('20261130', 7, 55), { first: (route) => route === 'R' });
  assert.deepEqual(flat(u), ['R Airport 8:05am', 'R City 8:07am', '9 Downtown 8:00am,8:30am', '9 Uptown 8:12am', '9L Downtown 8:15am']);
});

test('times and dates', () => {
  assert.equal(clock(8 * 60), '8:00am');
  assert.equal(clock(12 * 60 + 5), '12:05pm');
  assert.equal(clock(24 * 60 + 15), '12:15am');
  assert.equal(clock(21 * 60 + 41), '9:41pm');
  assert.equal(addDays('20261201', -1), '20261130');
  assert.equal(addDays('20261231', 1), '20270101');
  // Denver's clock, whatever the device's: 2026-11-28 02:30 UTC is 7:30pm on the 27th there.
  assert.deepEqual(clockIn(new Date('2026-11-28T02:30:00Z'), 'America/Denver'), { date: '20261127', minutes: 19 * 60 + 30 });
  assert.deepEqual(clockIn(new Date('2026-07-01T06:05:00Z'), 'America/Denver'), { date: '20260701', minutes: 5 }); // daylight time
  assert.equal(accessible({ a: 1 }), 'Wheelchair accessible');
  assert.equal(accessible({ a: 2 }), 'Not wheelchair accessible');
  assert.equal(accessible({ a: 0 }), '');
});

test('the HTML and what a screen reader hears', () => {
  const u = upcoming([record('100')], index, at('20261130', 7, 55));
  const html = departuresHtml(u, { chip: (row) => `<b>${row.name}</b>` });
  assert.match(html, /^<ul class="next"><li><b>9<\/b><span class="to"><span class="sr">to <\/span>Downtown<\/span><span class="at"><time>8:00am<\/time><i aria-hidden="true">,<\/i> <time>8:30am<\/time><\/span><\/li>/);
  assert.equal(departuresSaid(u), 'Scheduled departures: Route 9 to Downtown, 8:00am and 8:30am. Route 9 to Uptown, 8:12am. Route 9L to Downtown, 8:15am');
  assert.equal(departuresSaid(u, { most: 2 }), 'Scheduled departures: Route 9 to Downtown, 8:00am and 8:30am. Route 9 to Uptown, 8:12am. And 1 more');
  assert.match(departuresHtml(u, { most: 2 }), /<p class="more">and 1 more route in the next 3 hours<\/p>$/);
  const evil = { rows: [{ route: 'x', name: '<i>', headsign: '<script>', times: [{ clock: '1:00am' }] }], known: true };
  assert.doesNotMatch(departuresHtml(evil), /<script>|<i>/);
});

test('the files are read once, when asked for, and a failed read is tried again', async () => {
  const asked = [];
  let fail = true;
  const get = async (url) => {
    asked.push(String(url).split('/').pop());
    if (String(url).endsWith('index.json')) { if (fail) { fail = false; throw new Error('offline'); } return index; }
    return built.files[Number(String(url).split('/').pop().replace('.json', ''))];
  };
  const source = departureSource('https://x.test/data/departures/', get);
  await assert.rejects(source.stops({ stops: ['100'] }));
  const one = await source.stops({ stops: ['100'] });
  assert.deepEqual(one.records, [record('100')]);
  const station = await source.stops({ station: 7 });
  assert.deepEqual(station.records, [record('P1'), record('P2')]);
  await source.stops({ stops: ['100', '100', 'unknown'] });
  assert.equal(asked.filter((f) => f === 'index.json').length, 2, 'the index once after the failure');
  assert.equal(new Set(asked).size, asked.length - 1, 'no file twice, but the failed index');
});

// Chris, 2026-11-27: the panel is its own module that never reads sheet state, so the zoomable
// map uses it unchanged.
test('the departures panel reads nothing of the sheets', () => {
  const code = readFileSync(new URL('../public/js/panel/departures.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /sheet|step/i);
  assert.doesNotMatch(code, /maplibre|document\.|window\.|\.getLayer/);
  assert.doesNotMatch(code, /\bimport\b/, 'it imports nothing');
});
