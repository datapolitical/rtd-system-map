// Live predictions on a stop's or a station's card (#13): what counts as fresh, how a
// prediction takes its scheduled departure's place, and the connection that asks for them
// (public/js/panel/live.js, departures.js; the relay's side is in test/live.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { departureTables } from '../scripts/lib/departures.mjs';
import { upcoming, chunkOf, departuresHtml, departuresSaid, timeText, departureSource } from '../public/js/panel/departures.js';
import { received, fresh, liveFor, watcher, QUIET_MS } from '../public/js/panel/live.js';
import { PREDICTIONS_STALE_S, stopsMessage, predictionsByStop } from '../public/js/realtime.js';

const csv = (rows) => rows.map((r) => r.join(',')).join('\n');
// Route 9 leaves A St at 8:00, 8:30 and 9:00 (trips 1001, 1002, 1003), and the 9L at 8:15 (1004).
const text = {
  'agency.txt': csv([['agency_id', 'agency_name', 'agency_timezone'], ['X', 'Test', 'America/Denver']]),
  'routes.txt': csv([['route_id', 'route_short_name'], ['9', '9'], ['9L', '9L']]),
  'calendar.txt': csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['WK', 1, 1, 1, 1, 1, 0, 0, '20260101', '20261231']]),
  'calendar_dates.txt': csv([['service_id', 'date', 'exception_type']]),
  'trips.txt': csv([['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id'], ['9', 'WK', '1001', 'Downtown', 0], ['9', 'WK', '1002', 'Downtown', 0], ['9', 'WK', '1003', 'Downtown', 0], ['9L', 'WK', '1004', 'Downtown', 0]]),
  'stops.txt': csv([['stop_id', 'stop_name', 'wheelchair_boarding'], ['100', 'A St', 1], ['300', 'End', 0]]),
  'stop_times.txt': csv([
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type'],
    ['1001', '08:00:00', '08:00:00', '100', 1, 0], ['1001', '08:20:00', '08:20:00', '300', 2, 0],
    ['1002', '08:30:00', '08:30:00', '100', 1, 0], ['1002', '08:50:00', '08:50:00', '300', 2, 0],
    ['1003', '09:00:00', '09:00:00', '100', 1, 0], ['1003', '09:20:00', '09:20:00', '300', 2, 0],
    ['1004', '08:15:00', '08:15:00', '100', 1, 0], ['1004', '08:35:00', '08:35:00', '300', 2, 0],
  ]),
};
const built = departureTables(text, {});
const { index } = built;
const k = chunkOf('100', built.files.length);
const record = built.files[k]['100'];
const trips = built.tripFiles[k]['100'];
// Monday 2026-11-30, 7:55am in Denver, as the page's clock and as seconds.
const now = { date: '20261130', minutes: 7 * 60 + 55 };
const NOW_MS = Date.parse('2026-11-30T14:55:00Z');
const at = (h, m) => NOW_MS / 1000 + ((h * 60 + m) - now.minutes) * 60; // that time today, in seconds
const state = (stops, more = {}) => ({ at: NOW_MS, feed: NOW_MS / 1000 - 10, problem: false, stops: { 100: stops }, ...more });
const live = (stops) => liveFor(state(stops), ['100'], [trips], index, NOW_MS);
const flat = (u) => u.rows.map((r) => `${r.name} ${r.times.map((t) => `${timeText(t)}${t.live ? '*' : ''}`).join(',')}`);

test('the build keeps each departure\'s trip beside its time', () => {
  assert.equal(index.tripBase, 1001);
  assert.deepEqual(record.d.map(([p, gaps]) => [index.patterns[p][1], gaps]), [['9', [480, 30, 30]], ['9L', [495]]]);
  assert.deepEqual(trips.map(([p, ids]) => [index.patterns[p][1], ids]), [['9', [0, 1, 2]], ['9L', [3]]]);
  assert.equal(built.tripFiles.length, built.files.length);
  // Ids that are not numbers are kept whole.
  const named = departureTables({ ...text, 'trips.txt': text['trips.txt'].replace('1004', 'T-4'), 'stop_times.txt': text['stop_times.txt'].replaceAll('1004', 'T-4') }, {});
  assert.equal(named.index.tripBase, null);
  assert.ok(named.tripFiles.flatMap((f) => Object.values(f)).flat(3).includes('T-4'));
});

test('with no predictions the card is the timetable, and nothing is live', () => {
  const u = upcoming([record], index, now);
  assert.deepEqual(flat(u), ['9 8:00am,8:30am', '9L 8:15am']);
  assert.equal(u.live, false);
});

test('a prediction takes its own departure\'s place, as minutes; the rest stay scheduled', () => {
  // The 8:00 is running 4 minutes late; RTD says nothing about the 8:30 or the 9L.
  const u = upcoming([record], index, now, { live: live({ times: [['1001', at(8, 4), '9']] }) });
  assert.deepEqual(flat(u), ['9 9 min*,8:30am', '9L 8:15am']);
  assert.equal(u.live, true);
  assert.equal(u.rows[0].times[0].clock, '8:04am');
});

test('minutes to a prediction are counted from the second, not from the start of the minute', () => {
  // 7:55:45. RTD says 8:04:00, which is 8 min 15 s away: "8 min", not the "9 min" of counting from 7:55:00.
  const n = { ...now, seconds: 45 };
  const withState = { ...live({ times: [['1001', at(8, 4), '9']] }), nowS: NOW_MS / 1000 + 45 };
  const u = upcoming([record], index, n, { live: withState });
  assert.equal(u.rows[0].times[0].in, 8);
  assert.equal(u.rows[0].times[0].live, true);
});

test('a late bus stays on the card after its scheduled time; an early one that has left drops off', () => {
  const later = { date: now.date, minutes: 8 * 60 + 2 };
  const shift = (stops) => ({ ...live(stops), nowS: NOW_MS / 1000 + 7 * 60 });
  // 8:02: the 8:00 is predicted for 8:06, so it is still to come, though the timetable says it has gone.
  assert.deepEqual(flat(upcoming([record], index, later, { live: shift({ times: [['1001', at(8, 6), '9']] }) })), ['9 4 min*,8:30am', '9L 8:15am']);
  assert.deepEqual(flat(upcoming([record], index, later)), ['9L 8:15am', '9 8:30am,9:00am']);
  // 8:02: the 8:15 9L left early, at 8:01. It is gone, not shown at its scheduled time.
  assert.deepEqual(flat(upcoming([record], index, later, { live: shift({ times: [['1004', at(8, 1), '9L']] }) })), ['9 8:30am,9:00am']);
  // Due this very minute: "Now".
  assert.deepEqual(flat(upcoming([record], index, later, { live: shift({ times: [['1001', at(8, 2), '9']] }) }))[0], '9 Now*,8:30am');
});

test('a call RTD says is skipped is left out, not shown at its scheduled time', () => {
  const u = upcoming([record], index, now, { live: live({ times: [], skipped: ['1001'] }) });
  assert.deepEqual(flat(u), ['9L 8:15am', '9 8:30am,9:00am']);
  assert.equal(u.live, false);
});

test('a prediction belongs to the trip\'s run near now, not the same trip on another day', () => {
  // A stray time for trip 1001 three hours off is not this morning's 8:00.
  assert.deepEqual(flat(upcoming([record], index, now, { live: live({ times: [['1001', at(11, 0), '9']] }) })), ['9 8:00am,8:30am', '9L 8:15am']);
  // A trip the timetable does not have at this stop adds nothing.
  assert.deepEqual(flat(upcoming([record], index, now, { live: live({ times: [['7777', at(8, 1), '9']] }) })), ['9 8:00am,8:30am', '9L 8:15am']);
});

test('fresh means the relay answered lately, the feed was read, and the feed is not old', () => {
  assert.equal(fresh(state({}), NOW_MS), true);
  assert.equal(fresh(null, NOW_MS), false);
  assert.equal(fresh(state({}, { problem: true }), NOW_MS), false, 'RTD\'s feed could not be read');
  assert.equal(fresh(state({}), NOW_MS + QUIET_MS + 1), false, 'the relay has gone quiet');
  assert.equal(fresh(state({}, { feed: NOW_MS / 1000 - PREDICTIONS_STALE_S - 1 }), NOW_MS), false, 'the feed itself is old');
  assert.equal(fresh(state({}, { feed: NOW_MS / 1000 - PREDICTIONS_STALE_S + 5 }), NOW_MS), true);
});

test('only the relay\'s predictions for this page are taken; anything else is ignored', () => {
  const sent = JSON.stringify(stopsMessage(predictionsByStop({ header: { timestamp: 500 }, entities: [{ id: 'a', trip_update: { trip: { trip: '1001', route: '9' }, stops: [{ stop: '100', departure: { time: 600 } }] } }] }), ['100'], 9000));
  assert.deepEqual(received(sent, 9100), { at: 9100, feed: 500, problem: false, stops: { 100: { times: [['1001', 600, '9']] } } });
  assert.deepEqual(received('{"v":1,"kind":"stops","at":1,"problem":true}', 5), { at: 5, feed: 0, problem: true, stops: {} });
  assert.equal(received('{"v":1,"kind":"snapshot","vehicles":{}}', 5), null, 'an older relay\'s vehicles are not predictions');
  assert.equal(received('{"v":2,"kind":"stops"}', 5), null, 'a version this page does not know');
  assert.equal(received('nonsense', 5), null);
});

test('the HTML marks a live time and says it; a scheduled time is a clock time', () => {
  const u = upcoming([record], index, now, { live: live({ times: [['1001', at(8, 4), '9']] }) });
  const html = departuresHtml(u);
  assert.match(html, /<time class="live">9 min<span class="sr">, live<\/span><\/time><i aria-hidden="true">,<\/i> <time>8:30am<\/time>/);
  assert.match(html, /<time>8:15am<\/time>/);
  assert.equal(departuresSaid(u), 'Departures, live where said: Route 9 to Downtown, in 9 minutes, live and 8:30am. Route 9L to Downtown, 8:15am');
  assert.equal(departuresSaid(upcoming([record], index, now)), 'Scheduled departures: Route 9 to Downtown, 8:00am and 8:30am. Route 9L to Downtown, 8:15am');
  assert.equal(timeText({ live: true, in: 75, clock: '9:10am' }), '9:10am', 'an hour or more away reads as a clock time, still marked live');
});

test('the trips files are read only when asked for, beside the departures', async () => {
  const asked = [];
  const get = async (url) => { const f = String(url).split('/').pop(); asked.push(f); return f === 'index.json' ? index : f.startsWith('trips-') ? built.tripFiles[Number(f.slice(6, -5))] : built.files[Number(f.replace('.json', ''))]; };
  const source = departureSource('https://x.test/data/departures/', get);
  const got = await source.stops({ stops: ['100', 'unknown'] });
  assert.deepEqual(got.ids, ['100'], 'ids are in step with the records');
  assert.ok(!asked.some((f) => f.startsWith('trips-')));
  assert.deepEqual(await source.trips(got.ids), [trips]);
  assert.deepEqual(asked.filter((f) => f.startsWith('trips-')), [`trips-${k}.json`]);
});

// A stand-in for the browser's WebSocket.
function sockets() {
  const made = [];
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; made.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.readyState = 3; this.onclose?.(); }
    open() { this.readyState = 1; this.onopen?.(); }
    say(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
  }
  return { Socket, made };
}

test('the connection says which stops it wants, takes the answers, and lets go when the card closes', () => {
  const { Socket, made } = sockets();
  let changes = 0;
  const w = watcher('wss://x.test/live/stream?for=card', { Socket, changed: () => changes++, clock: () => 777 });
  assert.equal(made.length, 0, 'nothing is opened until a card asks');
  w.watch(['100']);
  assert.equal(made[0].url, 'wss://x.test/live/stream?for=card');
  assert.deepEqual(made[0].sent, [], 'not before the connection is open');
  made[0].open();
  assert.deepEqual(made[0].sent, [{ watch: ['100'] }]);
  made[0].say({ v: 1, kind: 'snapshot', vehicles: {} });
  assert.equal(w.state(), null);
  made[0].say({ v: 1, kind: 'stops', at: 1, feed: 500, stops: { 100: { times: [['1001', 600, '9']] } } });
  assert.deepEqual([w.state().at, w.state().feed, changes], [777, 500, 1]);
  // The same stops again: nothing more is sent. Other stops: asked for, and the old answer is dropped.
  w.watch(['100']);
  assert.equal(made[0].sent.length, 1);
  w.watch(['200', '201']);
  assert.deepEqual(made[0].sent.at(-1), { watch: ['200', '201'] });
  assert.equal(w.state(), null, 'one stop\'s predictions are never shown on another\'s card');
  // The card closes: the relay is told, and the connection goes.
  w.watch([]);
  assert.deepEqual(made[0].sent.at(-1), { watch: [] });
  assert.equal(made[0].readyState, 3);
});

test('a dropped connection is picked up again the next time the card asks', () => {
  const { Socket, made } = sockets();
  const w = watcher('wss://x.test/', { Socket });
  w.watch(['100']);
  made[0].open();
  made[0].close();
  w.watch(['100']);
  assert.equal(made.length, 2);
  made[1].open();
  assert.deepEqual(made[1].sent, [{ watch: ['100'] }]);
  // A late answer on the dropped connection is not taken.
  made[0].say({ v: 1, kind: 'stops', at: 1, feed: 1, stops: {} });
  assert.equal(w.state(), null);
});

test('with no WebSocket at all, watching does nothing and nothing is live', () => {
  const w = watcher('wss://x.test/', { Socket: undefined });
  w.watch(['100']);
  assert.equal(w.state(), null);
});

// Chris, 2026-11-27: each panel is its own module that never reads sheet state, so the zoomable
// map uses it unchanged.
test('the live module reads nothing of the sheets', () => {
  const code = readFileSync(new URL('../public/js/panel/live.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /sheet|step/i);
  assert.doesNotMatch(code, /maplibre|document\.|window\.|\.getLayer/);
  for (const [, from] of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.equal(from, '../realtime.js');
});
