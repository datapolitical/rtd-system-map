#!/usr/bin/env node
// Task 1 support: find drawn routes whose GTFS service is split across several
// route_ids, and report any member the build's route matching dropped.
//
// DESIGN.md "Routes are matched between ArcGIS and GTFS in this order" says a
// family is a set of GTFS routes that "share the map route's prefix and have
// exactly the same route name" (rule 2). This prints every drawn route whose
// prefix-and-name family is bigger than what an exact code match returns, and
// what the weekday midday headway is with and without the extra members.
//
//   node qa/scripts/family-check.mjs
//
// Imports nothing from scripts/lib/.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GTFS = path.join(ROOT, 'qa/cache/gtfs');
const DATA = path.join(ROOT, 'public/data');

const csv = (text) => {
  const out = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.shift().split(',');
  for (const line of lines) {
    if (!line) continue;
    const cells = line.split(',');
    const row = {};
    header.forEach((k, i) => (row[k] = cells[i] ?? ''));
    out.push(row);
  }
  return out;
};
const read = (name) => csv(readFileSync(path.join(GTFS, name), 'utf8'));

const meta = JSON.parse(readFileSync(path.join(DATA, 'meta.json'), 'utf8'));
const directory = JSON.parse(readFileSync(path.join(DATA, 'directory.json'), 'utf8'));
const geo = JSON.parse(readFileSync(path.join(DATA, 'routes.geojson'), 'utf8'));

const WEEKDAY = meta.dates.weekday.replaceAll('-', '');
const calendar = read('calendar.txt');
const exceptions = read('calendar_dates.txt');
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const date = new Date(Number(WEEKDAY.slice(0, 4)), Number(WEEKDAY.slice(4, 6)) - 1, Number(WEEKDAY.slice(6, 8)));
const running = new Set(calendar.filter((c) => c[dayNames[date.getDay()]] === '1').map((c) => c.service_id));
for (const e of exceptions) {
  if (e.date !== WEEKDAY) continue;
  if (e.exception_type === '1') running.add(e.service_id);
  if (e.exception_type === '2') running.delete(e.service_id);
}

const routes = read('routes.txt');
const trips = read('trips.txt');
const stopTimes = read('stop_times.txt');

const weekdayTrips = trips.filter((t) => running.has(t.service_id));
const tripsByRoute = new Map();
for (const t of weekdayTrips) (tripsByRoute.get(t.route_id) ?? tripsByRoute.set(t.route_id, []).get(t.route_id)).push(t);

const callsByTrip = new Map();
for (const r of stopTimes) {
  if (!tripsByRoute.has(trips.find((t) => t.trip_id === r.trip_id)?.route_id)) continue;
  let list = callsByTrip.get(r.trip_id);
  if (!list) callsByTrip.set(r.trip_id, (list = []));
  list.push(r);
}
const tripRoute = new Map(trips.map((t) => [t.trip_id, t.route_id]));

const norm = (s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const seconds = (t) => {
  const [h, m, s] = (t || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 3600 + m * 60 + (s || 0) : null;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const tierOf = (min) => (min === null ? 'none' : min <= 15 ? 'frequent' : min <= 30 ? 'every30' : min <= 60 ? 'hourly' : 'infrequent');

/** DESIGN.md: median gap at the route's busiest stop, 9am-3pm, worse direction. */
function headway(routeIds) {
  const trips = routeIds.flatMap((id) => tripsByRoute.get(id) ?? []);
  const byDirection = new Map();
  for (const trip of trips) {
    const dir = trip.direction_id ?? '';
    const byStop = byDirection.get(dir) ?? byDirection.set(dir, new Map()).get(dir);
    for (const call of callsByTrip.get(trip.trip_id) ?? []) {
      if (call.pickup_type === '1') continue;
      const t = seconds(call.departure_time);
      if (t === null || t < 9 * 3600 || t >= 15 * 3600) continue;
      (byStop.get(call.stop_id) ?? byStop.set(call.stop_id, []).get(call.stop_id)).push(t);
    }
  }
  const perDirection = [];
  for (const byStop of byDirection.values()) {
    let best = null;
    for (const [stop, times] of byStop) {
      if (!best || times.length > best.times.length) best = { stop, times: [...times].sort((a, b) => a - b) };
    }
    if (!best) continue;
    const gaps = best.times.slice(1).map((t, i) => t - best.times[i]);
    perDirection.push({ stop: best.stop, departures: best.times.length, headway: gaps.length ? median(gaps) / 60 : null });
  }
  if (!perDirection.length) return { headway: null, departures: 0 };
  const worst = perDirection.reduce((a, b) => ((b.headway ?? Infinity) > (a.headway ?? Infinity) ? b : a));
  return { headway: worst.headway === null ? null : Math.round(worst.headway), departures: worst.departures };
}

const stopName = new Map(read('stops.txt').map((s) => [s.stop_id, s.stop_name]));
const geoByRoute = new Map(geo.features.map((f) => [f.properties.route, f.properties]));

let flagged = 0;
for (const route of directory.routes) {
  if (route.mode !== 'bus') continue;
  const exact = routes.filter((r) => r.route_short_name === route.route || r.route_id === route.route);
  const family = routes.filter(
    (r) => (r.route_short_name || r.route_id).startsWith(route.route) && norm(r.route_long_name) === norm(route.name),
  );
  const extra = family.filter((r) => !exact.some((e) => e.route_id === r.route_id));
  if (!extra.length) continue;
  flagged++;
  const exactIds = exact.map((r) => r.route_id);
  const allIds = family.map((r) => r.route_id);
  // scripts/build-data.mjs:64-69: exact matches win outright, and the family
  // (prefix and the same route name) is only tried when there is no exact match.
  const usedIds = exactIds.length ? exactIds : allIds;
  const before = headway(usedIds);
  const after = headway(allIds);
  const built = geoByRoute.get(route.route) ?? {};
  console.log(`\nroute ${route.route} — ${route.name}`);
  console.log(`  matched by exact code: ${exactIds.map((id) => `${id} (${(tripsByRoute.get(id) ?? []).length} weekday trips)`).join(', ') || 'none'}`);
  console.log(`  also share the prefix and the same name: ${extra.map((r) => `${r.route_id} (${(tripsByRoute.get(r.route_id) ?? []).length} weekday trips)`).join(', ')}`);
  console.log(`  weekday midday headway the build uses: ${before.headway} min from ${before.departures} departures -> tier ${tierOf(before.headway)} (routes.geojson says ${built.wk} min, ${built.tier})`);
  console.log(`  weekday midday headway with every member: ${after.headway} min from ${after.departures} departures -> tier ${tierOf(after.headway)}`);
}
console.log(`\n${flagged} drawn bus routes have a family member the exact match drops.`);
