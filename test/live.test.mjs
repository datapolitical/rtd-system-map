import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALERTS_EVERY_MS, STALE_S, VEHICLE_COLUMNS, alertsFrom, emptyState, message, refresh, routeOf, tick, vehicle, vehiclesFrom } from '../public/js/realtime.js';
import { ageText, band, pillText, zoomNote } from '../public/js/age.js';
import { routeAliases } from '../scripts/lib/realtime.mjs';

const T = 1794063578; // a feed time, seconds
const feed = (entities, timestamp = T) => ({ header: { version: '2.0', timestamp }, entities });
const onTrip = (id, route, lat, lon, extra = {}) => ({
  id,
  vehicle: { trip: { trip: `trip-${id}`, route, direction: 0 }, position: { lat, lon, bearing: 90 }, timestamp: T - 5, vehicle: { id, label: id }, ...extra },
});

test('vehicles on a trip with a position are kept, in the column order, rounded', () => {
  const { at, list } = vehiclesFrom(feed([onTrip('1515', '103W', 39.8480339, -104.6729965, { occupancy: 1, stop: '34652', status: 1 })]));
  assert.equal(at, T);
  assert.equal(list.length, 1);
  const v = vehicle(list[0]);
  assert.deepEqual(Object.keys(v), VEHICLE_COLUMNS);
  assert.deepEqual(v, { id: '1515', route: '103W', trip: 'trip-1515', direction: 0, lon: -104.673, lat: 39.84803, bearing: 90, at: T - 5, occupancy: 1, stop: '34652', status: 1 });
});

test('a vehicle between runs, or with no fix, is not a vehicle to draw', () => {
  const { list } = vehiclesFrom(
    feed([
      { id: 'idle', vehicle: { position: { lat: 39.7, lon: -104.9 }, timestamp: T, vehicle: { id: 'idle' } } },
      { id: 'nofix', vehicle: { trip: { trip: 't', route: '15' }, position: { lat: 0, lon: 0 }, timestamp: T } },
      { id: 'noposition', vehicle: { trip: { trip: 't', route: '15' }, timestamp: T } },
      onTrip('ok', '15', 39.74, -104.98),
    ]),
  );
  assert.deepEqual(
    list.map((row) => row[0]),
    ['ok'],
  );
});

test('only alerts in effect now are kept, with what they apply to', () => {
  const now = T;
  const alert = (id, periods, entities, effect = 1) => ({ id, alert: { periods, entities, cause: 10, effect, header: `Alert ${id}`, description: '', url: '' } });
  const { list } = alertsFrom(
    feed([
      alert('past', [{ start: now - 1000, end: now - 10 }], [{ route: '15' }]),
      alert('future', [{ start: now + 60 }], [{ route: '15' }]),
      alert('open-ended', [{ start: now - 60 }], [{ route: '15', stop: '12875' }, { route: '15L', stop: '12875' }]),
      alert('always', [], [{ trip: 'trip-1' }], 4),
      alert('later-period', [{ start: now - 500, end: now - 400 }, { start: now - 10, end: now + 10 }], [{ route: 'A' }]),
    ]),
    now,
  );
  assert.deepEqual(
    list.map((a) => a.id),
    ['open-ended', 'always', 'later-period'],
  );
  const open = list[0];
  assert.deepEqual(open.routes, ['15', '15L']);
  assert.deepEqual(open.stops, ['12875']);
  assert.equal(open.from, now - 60);
  assert.equal(open.to, null);
  assert.equal(list[1].effect, 4);
  assert.deepEqual(list[1].trips, ['trip-1']);
  assert.equal(list[2].to, now + 10);
});

// A fake RTD: feeds by name, each a function of the call count.
const rtd = (feeds) => {
  const calls = { 'VehiclePosition.pb': 0, 'Alerts.pb': 0 };
  const fetchBytes = async (name) => {
    calls[name]++;
    const f = feeds[name];
    if (!f) throw new Error(`${name}: HTTP 503`);
    return f(calls[name]);
  };
  return { fetchBytes, calls, decode: (x) => x };
};

test('a poll stores both feeds and moves the sequence; an unchanged poll does not', async () => {
  const now = T * 1000;
  const r = rtd({ 'VehiclePosition.pb': () => feed([onTrip('1', '15', 39.74, -104.98)]), 'Alerts.pb': () => feed([]) });
  const first = await refresh(emptyState(), { ...r, now });
  assert.equal(first.seq, 1);
  assert.equal(first.vehicles.list.length, 1);
  assert.deepEqual(first.alerts, { at: T, list: [] });
  assert.equal(first.problem, null);
  const second = await refresh(first, { ...r, now: now + 15_000 });
  assert.equal(second.seq, 1, 'the same feed time is not a change');
  assert.equal(second.at, now + 15_000, 'but the relay says it looked');
  assert.equal(r.calls['Alerts.pb'], 1, 'alerts are not asked for again within a minute');
  const third = await refresh(second, { ...r, now: now + ALERTS_EVERY_MS });
  assert.equal(r.calls['Alerts.pb'], 2);
  assert.equal(third.seq, 1, 'alerts with the same feed time are no change either');
});

test('a feed that fails keeps its last good data and is named in the problem', async () => {
  const now = T * 1000;
  const good = rtd({ 'VehiclePosition.pb': () => feed([onTrip('1', '15', 39.74, -104.98)]), 'Alerts.pb': () => feed([]) });
  const state = await refresh(emptyState(), { ...good, now });
  const broken = rtd({ 'Alerts.pb': () => feed([], T + 30) });
  const next = await refresh(state, { ...broken, now: now + ALERTS_EVERY_MS });
  assert.equal(next.vehicles.list.length, 1, 'the last positions stay');
  assert.deepEqual(next.problem, { feeds: ['vehicles'], since: now + ALERTS_EVERY_MS });
  assert.equal(next.seq, 2, 'viewers hear about the problem');
  assert.equal(next.alerts.at, T + 30, 'the feed that works still updates');
  const again = await refresh(next, { ...broken, now: now + ALERTS_EVERY_MS + 15_000 });
  assert.equal(again.problem.since, now + ALERTS_EVERY_MS, 'the trouble keeps its start time');
  assert.equal(again.seq, 2, 'the same problem is not news');
  const fixed = await refresh(again, { ...good, now: now + 2 * ALERTS_EVERY_MS });
  assert.equal(fixed.problem, null);
  assert.equal(fixed.seq, 3);
});

test('messages carry the schema version and the whole state; a tick carries none of it', () => {
  const state = { ...emptyState(), seq: 4, at: 1, vehicles: { at: T, list: [] }, alerts: { at: T, list: [] } };
  const m = message(state, 'update');
  assert.equal(m.v, 1);
  assert.equal(m.kind, 'update');
  assert.equal(m.seq, 4);
  assert.deepEqual(m.vehicles, { at: T, list: [] });
  assert.deepEqual(Object.keys(tick(state)), ['v', 'kind', 'seq', 'at']);
  assert.ok(STALE_S >= 60, 'a vehicle report stays current for at least a minute');
});

test('the realtime route names are learned from the trips both feeds name', () => {
  const tripRoute = new Map([
    ['t1', 'W'],
    ['t2', 'W'],
    ['t3', 'W'],
    ['t4', 'E'],
    ['t5', '15'],
    ['t6', 'ATA'],
  ]);
  const groupOf = new Map([
    ['W', 'W'],
    ['E', 'E'],
    ['15', '15'],
    ['ATA', 'AT'],
    ['AT', 'AT'],
  ]);
  const entities = [
    { vehicle: { trip: { trip: 't1', route: '103W' } } },
    { trip_update: { trip: { trip: 't2', route: '103W' } } },
    { vehicle: { trip: { trip: 't3', route: '103E' } } }, // one wrong report loses the vote
    { vehicle: { trip: { trip: 't4', route: '101E' } } },
    { vehicle: { trip: { trip: 't5', route: '15' } } }, // buses already agree
    { vehicle: { trip: { trip: 't6', route: 'ATA' } } }, // GTFS name that belongs to a map route
    { vehicle: { trip: { trip: 'unknown', route: '999X' } } }, // a trip GTFS doesn't have teaches nothing
    { vehicle: { trip: { route: '103W' } } },
  ];
  const { aliases, conflicts, seen } = routeAliases(entities, tripRoute, (id) => groupOf.get(id) ?? null);
  assert.deepEqual(aliases, { '103W': 'W', '101E': 'E', '103E': 'W', ATA: 'AT' });
  assert.equal(seen, 6);
  assert.deepEqual(conflicts, []);
});

test('a conflict in the learned table is reported and settled by majority', () => {
  const tripRoute = new Map([
    ['a', 'W'],
    ['b', 'W'],
    ['c', 'E'],
  ]);
  const { aliases, conflicts } = routeAliases(
    [{ vehicle: { trip: { trip: 'a', route: '103W' } } }, { vehicle: { trip: { trip: 'b', route: '103W' } } }, { vehicle: { trip: { trip: 'c', route: '103W' } } }],
    tripRoute,
    (id) => id,
  );
  assert.deepEqual(aliases, { '103W': 'W' });
  assert.equal(conflicts.length, 1);
});

test('the page puts a vehicle on its line by the learned table, then by the pattern, else nowhere', () => {
  const known = (r) => ['W', 'E', 'A', '15', '104L', 'AT'].includes(r);
  const aliases = { '103W': 'W', ATA: 'AT' };
  assert.equal(routeOf('103W', aliases, known), 'W');
  assert.equal(routeOf('ATA', aliases, known), 'AT');
  assert.equal(routeOf('15', aliases, known), '15');
  assert.equal(routeOf('104L', aliases, known), '104L', 'a bus with a number and a letter is itself');
  assert.equal(routeOf('101E', aliases, known), 'E', 'a train the build never saw still finds its line');
  assert.equal(routeOf('BOND', aliases, known), null, 'a route not on the map is not drawn');
  assert.equal(routeOf('', aliases, known), null);
});

test('the pill says how old the positions are, never the time of day', () => {
  assert.equal(ageText(0), 'just now');
  assert.equal(ageText(-5), 'just now');
  assert.equal(ageText(29), 'just now');
  assert.equal(ageText(30), '1 min ago');
  assert.equal(ageText(90), '2 min ago');
  assert.equal(ageText(125), '2 min ago');
  assert.equal(ageText(600), '10 min ago');
  assert.equal(ageText(3 * 3600), '3 hr ago');
  assert.equal(ageText(3 * 86400), 'over a day ago');
  assert.equal(pillText(null), 'Live');
  assert.equal(pillText(NaN), 'Live');
  assert.equal(pillText(10), 'Live, just now');
  assert.equal(pillText(200), 'Live, 3 min ago');
  for (const s of [0, 20, 45, 150, 4000, 90000]) assert.doesNotMatch(pillText(s), /\d:\d|[ap]m\b/i);
});

test('the zoom note names what is missing, and is silent when everything shows', () => {
  assert.equal(band(9, 9.75, 13), 0);
  assert.equal(band(9.75, 9.75, 13), 1);
  assert.equal(band(12.99, 9.75, 13), 1);
  assert.equal(band(13, 9.75, 13), 2);
  assert.equal(zoomNote(9, 9.75, 13), 'Zoom in to see the trains.');
  assert.equal(zoomNote(11, 9.75, 13), 'Trains are on the map. Zoom in for buses.');
  assert.equal(zoomNote(14, 9.75, 13), null);
});
