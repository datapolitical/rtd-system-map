#!/usr/bin/env node
// Task 1: cross-check the build's output against RTD's GTFS.
//
// Reads qa/cache/gtfs/*.txt and public/data/* and prints every disagreement.
// Imports nothing from scripts/lib/ on purpose (qa/BRIEF.md, rule 5): every
// number here is worked out from GTFS again, so a bug in the build is not
// repeated here.
//
//   node qa/scripts/crosscheck.mjs
//
// Exit code is always 0: this is a report, not a test.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GTFS = path.join(ROOT, 'qa/cache/gtfs');
const DATA = path.join(ROOT, 'public/data');

const RAIL_TYPES = new Set(['0', '1', '2']);
const isRailType = (t) => RAIL_TYPES.has(String(t)) || /^(1\d\d|4\d\d|9\d\d)$/.test(String(t));

// --- CSV -------------------------------------------------------------------
// RFC 4180: quoted fields may contain commas, doubled quotes and newlines.
// The build's own parser trims every value; this one does not, so a difference
// between the two shows up here rather than being hidden.

function* csvRows(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  while (i < n) {
    const row = [];
    for (;;) {
      let value = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw new Error('unterminated quoted field');
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              value += '"';
              i += 2;
              continue;
            }
            i++;
            break;
          }
          value += text[i++];
        }
      } else {
        const start = i;
        while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
        value = text.slice(start, i);
      }
      row.push(value);
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '\r') i++;
      if (text[i] === '\n') i++;
      break;
    }
    if (row.length === 1 && row[0] === '') continue; // blank line
    yield row;
  }
}

const tables = new Map();
function table(name) {
  if (tables.has(name)) return tables.get(name);
  const text = readFileSync(path.join(GTFS, name), 'utf8');
  const it = csvRows(text);
  const header = it.next().value ?? [];
  const out = { header, rows: [] };
  for (const row of it) {
    const o = {};
    for (let k = 0; k < header.length; k++) o[header[k]] = row[k] ?? '';
    out.rows.push(o);
  }
  tables.set(name, out);
  return out;
}
const rowsOf = (name) => table(name).rows;

// --- geometry --------------------------------------------------------------

const EARTH = 6371008.8;
function meters([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * EARTH;
}

// --- dates -----------------------------------------------------------------

const isoOf = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const ymdOf = (iso) => iso.replaceAll('-', '');
const dayNumber = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5;
const addDays = (s, k) => {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) + k * 864e5);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
};
const WEEKDAY_COL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** service_id -> Set of YYYYMMDD, calendar.txt with calendar_dates.txt applied. */
function serviceDates() {
  const out = new Map();
  const get = (id) => (out.has(id) ? out.get(id) : (out.set(id, new Set()), out.get(id)));
  for (const c of rowsOf('calendar.txt')) {
    const start = dayNumber(c.start_date);
    const end = dayNumber(c.end_date);
    for (let d = start; d <= end; d++) {
      const date = new Date(d * 864e5);
      if (c[WEEKDAY_COL[date.getUTCDay()]] === '1') get(c.service_id).add(date.toISOString().slice(0, 10).replaceAll('-', ''));
    }
  }
  for (const e of rowsOf('calendar_dates.txt')) {
    if (e.exception_type === '1') get(e.service_id).add(e.date);
    else if (e.exception_type === '2') get(e.service_id).delete(e.date);
  }
  return out;
}

// --- static GTFS indexes ---------------------------------------------------

const meta = JSON.parse(readFileSync(path.join(DATA, 'meta.json'), 'utf8'));
const routesGeo = JSON.parse(readFileSync(path.join(DATA, 'routes.geojson'), 'utf8'));
const stationsGeo = JSON.parse(readFileSync(path.join(DATA, 'stations.geojson'), 'utf8'));
const directory = JSON.parse(readFileSync(path.join(DATA, 'directory.json'), 'utf8'));

const WEEKDAY = ymdOf(meta.dates.weekday);
const dates = serviceDates();
const weekdayServices = new Set(
  [...dates].filter(([, set]) => set.has(WEEKDAY)).map(([id]) => id),
);

const gtfsRoutes = rowsOf('routes.txt');
const gtfsRouteById = new Map(gtfsRoutes.map((r) => [r.route_id, r]));
const gtfsStops = rowsOf('stops.txt');
const gtfsStopById = new Map(gtfsStops.map((s) => [s.stop_id, s]));

const drawnCodes = new Set(directory.routes.map((r) => r.route));
const familyOf = meta.families ?? {};
const norm = (s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const gtfsToMap = new Map(); // GTFS route_id -> map route code
// DESIGN.md "Routes are matched between ArcGIS and GTFS in this order":
// 1. by route number or ID, 2. as a family (shared prefix and the same name).
for (const r of gtfsRoutes) {
  const codes = [r.route_short_name, r.route_id].filter(Boolean);
  let target = codes.find((c) => drawnCodes.has(c));
  if (!target) {
    const family = Object.entries(familyOf).find(([, list]) => list.some((c) => codes.includes(c)));
    if (family) target = family[0];
  }
  if (!target) {
    // Rule 2 beyond the recorded families: a shared prefix and the same route name.
    const byPrefix = directory.routes.find(
      (p) => (r.route_short_name || r.route_id).startsWith(p.route) && norm(r.route_long_name) === norm(p.name),
    );
    if (byPrefix) target = byPrefix.route;
  }
  if (target) gtfsToMap.set(r.route_id, target);
}

// trips on the weekday, and every call of every such trip
const tripById = new Map(rowsOf('trips.txt').map((t) => [t.trip_id, t]));
const callsByTrip = new Map(); // trip_id -> [{seq, stop, dep}]
for (const r of rowsOf('stop_times.txt')) {
  const trip = tripById.get(r.trip_id);
  if (!trip || !weekdayServices.has(trip.service_id)) continue;
  let list = callsByTrip.get(r.trip_id);
  if (!list) callsByTrip.set(r.trip_id, (list = []));
  list.push({ seq: Number(r.stop_sequence), stop: r.stop_id, dep: r.departure_time, pickup: r.pickup_type });
}
for (const list of callsByTrip.values()) list.sort((a, b) => a.seq - b.seq);

const weekdayTripsByRoute = new Map(); // GTFS route_id -> trips
for (const [tripId] of callsByTrip) {
  const t = tripById.get(tripId);
  const list = weekdayTripsByRoute.get(t.route_id) ?? weekdayTripsByRoute.set(t.route_id, []).get(t.route_id);
  list.push(t);
}

const seconds = (t) => {
  const [h, m, s] = (t || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 3600 + m * 60 + (s || 0) : null;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const clock = (sec) =>
  `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;

// Map stations: nearest first, so a GTFS station can be matched by distance.
const mapStations = directory.stations.map((s) => ({ ...s, coords: s.at }));
function nearestStation(coords, maxMeters) {
  let best = null;
  for (const s of mapStations) {
    const d = meters(coords, s.coords);
    if (!best || d < best.meters) best = { station: s, meters: d };
  }
  return best && best.meters <= maxMeters ? best : null;
}

// GTFS station groups: platforms by parent_station, with the services that call.
function stationGroups() {
  const groups = new Map(); // parent/self stop_id -> { stop, services: Set, routes: Set }
  for (const [tripId, calls] of callsByTrip) {
    const trip = tripById.get(tripId);
    for (const call of calls) {
      const stop = gtfsStopById.get(call.stop);
      if (!stop) continue;
      const id = stop.parent_station || stop.stop_id;
      let g = groups.get(id);
      if (!g) {
        g = { stop: gtfsStopById.get(id) ?? stop, services: new Set(), routes: new Set() };
        groups.set(id, g);
      }
      g.services.add(trip.service_id);
      g.routes.add(trip.route_id);
    }
  }
  return groups;
}
const groups = stationGroups();
const groupCoords = (g) => [Number(g.stop.stop_lon), Number(g.stop.stop_lat)];

const findings = [];
const note = (area, text) => findings.push({ area, text });

// Every stop a weekday trip calls at, with the routes that call there.
const stopRoutes = new Map(); // GTFS stop_id -> Set of GTFS route_id
for (const [tripId, calls] of callsByTrip) {
  const routeId = tripById.get(tripId).route_id;
  for (const call of calls) {
    let set = stopRoutes.get(call.stop);
    if (!set) stopRoutes.set(call.stop, (set = new Set()));
    set.add(routeId);
  }
}

if (process.env.DEBUG_ROUTE) {
  const code = process.env.DEBUG_ROUTE;
  const routeIds = gtfsRoutes.filter((r) => r.route_id === code || r.route_short_name === code).map((r) => r.route_id);
  console.log(`-- debug route ${code}: GTFS ids ${routeIds.join(',') || 'none'} -> map route ${routeIds.map((id) => gtfsToMap.get(id) ?? 'none').join(',')}`);
  for (const id of routeIds) {
    const trips = weekdayTripsByRoute.get(id) ?? [];
    console.log(`   ${id}: ${trips.length} weekday trips, route_type=${gtfsRouteById.get(id)?.route_type}`);
    const stopsCalled = new Set(trips.flatMap((t) => (callsByTrip.get(t.trip_id) ?? []).map((c) => c.stop)));
    console.log(`   stops called: ${stopsCalled.size}, e.g. ${[...stopsCalled].slice(0, 3).join(' ')}`);
  }
  console.log(`   stopRoutes has 34344: ${[...(stopRoutes.get('34344') ?? [])].join(' ')}`);
}

// --- 1. rail station order -------------------------------------------------

function railOrder() {
  const railRoutes = new Map(); // map route -> GTFS route_ids
  for (const r of gtfsRoutes) {
    if (!isRailType(r.route_type)) continue;
    const mapRoute = gtfsToMap.get(r.route_id);
    if (!mapRoute) continue;
    (railRoutes.get(mapRoute) ?? railRoutes.set(mapRoute, []).get(mapRoute)).push(r.route_id);
  }
  const out = new Map(); // map route -> { order: [station id], patterns }
  for (const [mapRoute, members] of railRoutes) {
    const trips = members.flatMap((id) => weekdayTripsByRoute.get(id) ?? []);
    const counts = new Map();
    for (const trip of trips) {
      const calls = (callsByTrip.get(trip.trip_id) ?? [])
        .map((c) => {
          const stop = gtfsStopById.get(c.stop);
          const group = stop?.parent_station || c.stop;
          const at = groupCoords(groups.get(group) ?? { stop });
          const near = nearestStation(at, 300);
          return near ? near.station.id : null;
        })
        .filter((id) => id !== null);
      const dedup = calls.filter((id, k) => id !== calls[k - 1]);
      if (dedup.length < 2) continue;
      const key = dedup.join(' ');
      const seen = counts.get(key) ?? { trips: 0 };
      seen.trips++;
      counts.set(key, seen);
    }
    if (!counts.size) continue;
    const [best] = [...counts].sort((a, b) => b[1].trips - a[1].trips);
    out.set(mapRoute, { order: best[0].split(' ').map(Number), trips: best[1].trips, patterns: counts.size });
  }
  return out;
}

const infos = [];
const info = (text) => infos.push(text);

const order = railOrder();
let reversed = 0;
for (const route of directory.routes.filter((r) => r.mode === 'rail')) {
  const mine = order.get(route.route);
  const theirs = route.stations ?? [];
  if (!mine) {
    note('data', `rail order: no weekday trips found in GTFS for line ${route.route}`);
    continue;
  }
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (same(mine.order, theirs)) continue;
  if (same([...mine.order].reverse(), theirs)) {
    // A line has two directions; which end comes first is not specified, and
    // the build reads from the hub outward (scripts/lib/directory.mjs). The
    // stations and their sequence agree, so this is a pass.
    reversed++;
    info(`rail order: line ${route.route} reads in the opposite direction to the GTFS pattern (${theirs.length} stations, same sequence) — allowed.`);
    continue;
  }
  const missing = mine.order.filter((id) => !theirs.includes(id));
  const extra = theirs.filter((id) => !mine.order.includes(id));
  const label = (id) => directory.stations.find((s) => s.id === id)?.label ?? `#${id}`;
  note(
    'data',
    `rail order: line ${route.route} differs from GTFS.` +
      `\n      directory (${theirs.length}): ${theirs.map((i) => `${i}:${label(i)}`).join(' ')}` +
      `\n      GTFS      (${mine.order.length}): ${mine.order.map((i) => `${i}:${label(i)}`).join(' ')}` +
      (missing.length ? `\n      in GTFS, not in directory: ${missing.map(label).join(', ')}` : '') +
      (extra.length ? `\n      in directory, not in GTFS: ${extra.map(label).join(', ')}` : ''),
  );
}

// --- 2. buses at each station ---------------------------------------------

function busesAtStations() {
  const out = new Map(); // map station id -> Set of map bus route codes
  for (const s of mapStations) out.set(s.id, new Set());
  const debug = new Map(); // station id -> [stop descriptions]
  // "within 250 m of each station" (qa/BRIEF.md task 1), stop by stop.
  for (const [stopId, routeIds] of stopRoutes) {
    const stop = gtfsStopById.get(stopId);
    if (!stop || !stop.stop_lat) continue;
    const coords = [Number(stop.stop_lon), Number(stop.stop_lat)];
    for (const s of mapStations) {
      const d = meters(coords, s.coords);
      if (d > 250) continue;
      const added = [];
      for (const routeId of routeIds) {
        if (isRailType(gtfsRouteById.get(routeId)?.route_type)) continue;
        const mapRoute = gtfsToMap.get(routeId);
        if (!mapRoute) continue;
        if (!directory.routes.some((r) => r.route === mapRoute && r.mode === 'bus')) continue;
        out.get(s.id).add(mapRoute);
        added.push(mapRoute);
      }
      if (process.env.DEBUG_STATION && s.id === Number(process.env.DEBUG_STATION)) {
        const list = debug.get(s.id) ?? debug.set(s.id, []).get(s.id);
        list.push(`${stopId} ${stop.stop_name} (${d.toFixed(0)}m): ${added.join(' ')}`);
      }
    }
  }
  if (process.env.DEBUG_STATION) {
    const id = Number(process.env.DEBUG_STATION);
    console.log(`-- stops within 250 m of station ${id} --`);
    for (const line of debug.get(id) ?? []) console.log('   ', line);
  }
  return out;
}

const buses = busesAtStations();
let busMismatches = 0;
for (const s of directory.stations) {
  const mine = [...(buses.get(s.id) ?? [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const theirs = String(s.buses ?? '').split(' ').filter(Boolean);
  const missing = mine.filter((r) => !theirs.includes(r));
  const extra = theirs.filter((r) => !mine.includes(r));
  if (!missing.length && !extra.length) continue;
  busMismatches++;
  note(
    'data',
    `buses at station ${s.id} ${s.label}:` +
      (missing.length ? `\n      in GTFS, not in directory: ${missing.join(' ')}` : '') +
      (extra.length ? `\n      in directory, not in GTFS: ${extra.join(' ')}` : ''),
  );
}
console.log(`stations with a bus-list disagreement: ${busMismatches} of ${directory.stations.length}`);

// --- 3. route ends ---------------------------------------------------------

function routeEnds() {
  const byMapRoute = new Map(); // map route -> GTFS route_ids
  for (const r of gtfsRoutes) {
    const mapRoute = gtfsToMap.get(r.route_id);
    if (!mapRoute) continue;
    (byMapRoute.get(mapRoute) ?? byMapRoute.set(mapRoute, []).get(mapRoute)).push(r.route_id);
  }
  const out = new Map();
  for (const [mapRoute, members] of byMapRoute) {
    const trips = members.flatMap((id) => weekdayTripsByRoute.get(id) ?? []);
    const byDirection = new Map();
    for (const trip of trips) {
      const calls = callsByTrip.get(trip.trip_id) ?? [];
      if (!calls.length) continue;
      const key = calls.map((c) => c.stop).join('>');
      const dir = trip.direction_id ?? '';
      const counts = byDirection.get(dir) ?? byDirection.set(dir, new Map()).get(dir);
      const seen = counts.get(key) ?? { trips: 0, last: calls.at(-1).stop, first: calls[0].stop };
      seen.trips++;
      counts.set(key, seen);
    }
    const ends = [];
    for (const [dir, counts] of byDirection) {
      const [best] = [...counts].sort((a, b) => b[1].trips - a[1].trips);
      const stop = gtfsStopById.get(best[1].last);
      if (!stop) continue;
      ends.push({ dir, at: [Number(stop.stop_lon), Number(stop.stop_lat)], name: stop.stop_name, trips: best[1].trips });
    }
    out.set(mapRoute, ends);
  }
  return out;
}

const ends = routeEnds();
let endMismatches = 0;
for (const route of directory.routes) {
  const mine = ends.get(route.route);
  const goes = route.goes ?? [];
  if (!mine || !mine.length) continue;
  const unmatched = mine.filter((e) => !goes.some((g) => g.at && meters(g.at, e.at) <= 500));
  const extra = goes.filter((g) => g.at && !mine.some((e) => meters(g.at, e.at) <= 500));
  if (!unmatched.length && !extra.length) continue;
  endMismatches++;
  note(
    'data',
    `route ends: ${route.route} (${route.mode}) — directory has ${goes.length} end(s), GTFS has ${mine.length}:` +
      (unmatched.length
        ? `\n      GTFS end not within 500 m of any directory end: ${unmatched.map((e) => `${e.name} [${e.at.map((v) => v.toFixed(5)).join(',')}] dir ${e.dir}`).join('; ')}`
        : '') +
      (extra.length
        ? `\n      directory end not within 500 m of any GTFS end: ${extra.map((g) => `${g.name} [${g.at.map((v) => v.toFixed(5)).join(',')}]`).join('; ')}`
        : '') +
      `\n      directory: ${goes.map((g) => g.name).join(' | ')}`,
  );
}
console.log(`routes with an end disagreement: ${endMismatches} of ${directory.routes.length}`);

// --- 4. station service ----------------------------------------------------

function stationServed() {
  const out = new Map(); // station id -> { served, services }
  for (const s of mapStations) out.set(s.id, { served: false, services: [] });
  const from = WEEKDAY;
  const window = new Set(Array.from({ length: 7 }, (_, k) => addDays(from, k)));
  for (const g of groups.values()) {
    if (![...g.routes].some((r) => isRailType(gtfsRouteById.get(r)?.route_type))) continue;
    const near = nearestStation(groupCoords(g), 300);
    if (!near) continue;
    const entry = out.get(near.station.id);
    const inWeek = [...g.services].filter((s) => [...(dates.get(s) ?? [])].some((d) => window.has(d)));
    if (inWeek.length) {
      entry.served = true;
      entry.services.push(...inWeek);
    }
  }
  return out;
}

const served = stationServed();
let serviceMismatches = 0;
for (const s of directory.stations) {
  const mine = served.get(s.id) ?? { served: false };
  if (!!s.served === !!mine.served) continue;
  serviceMismatches++;
  note(
    'data',
    `station service: ${s.id} ${s.label} — directory says served=${s.served}, GTFS says served=${mine.served}` +
      ` (rail services in the next 7 days: ${mine.services.join(', ') || 'none'})`,
  );
}
console.log(`stations with a served/unserved disagreement: ${serviceMismatches} of ${directory.stations.length}`);

// --- 5. frequency ----------------------------------------------------------

const MIDDAY = [9 * 3600, 15 * 3600];

function headways() {
  const byMapRoute = new Map();
  for (const r of gtfsRoutes) {
    const mapRoute = gtfsToMap.get(r.route_id);
    if (!mapRoute) continue;
    (byMapRoute.get(mapRoute) ?? byMapRoute.set(mapRoute, []).get(mapRoute)).push(r.route_id);
  }
  const out = new Map();
  for (const [mapRoute, members] of byMapRoute) {
    const trips = members.flatMap((id) => weekdayTripsByRoute.get(id) ?? []);
    const byDirection = new Map(); // dir -> stop -> [seconds]
    for (const trip of trips) {
      const dir = trip.direction_id ?? '';
      const byStop = byDirection.get(dir) ?? byDirection.set(dir, new Map()).get(dir);
      for (const c of callsByTrip.get(trip.trip_id) ?? []) {
        if (c.pickup === '1') continue; // no boarding here
        const t = seconds(c.dep);
        if (t === null) continue;
        (byStop.get(c.stop) ?? byStop.set(c.stop, []).get(c.stop)).push(t);
      }
    }
    const perDirection = [];
    for (const byStop of byDirection.values()) {
      let busiest = null;
      for (const [stop, all] of byStop) {
        const midday = all.filter((t) => t >= MIDDAY[0] && t < MIDDAY[1]).sort((a, b) => a - b);
        if (!busiest || midday.length > busiest.midday.length || (midday.length === busiest.midday.length && all.length > busiest.all.length)) {
          busiest = { stop, all, midday };
        }
      }
      if (!busiest) continue;
      const gaps = busiest.midday.slice(1).map((t, k) => t - busiest.midday[k]);
      perDirection.push({
        stop: busiest.stop,
        midday: busiest.midday.length,
        headway: gaps.length ? median(gaps) / 60 : null,
      });
    }
    if (!perDirection.length) continue;
    const worst = perDirection.reduce((a, b) => {
      const ha = a.headway ?? Infinity;
      const hb = b.headway ?? Infinity;
      return hb > ha || (hb === ha && b.midday < a.midday) ? b : a;
    });
    out.set(mapRoute, { ...worst, directions: perDirection.length });
  }
  return out;
}

const mine = headways();
const geoByRoute = new Map(routesGeo.features.map((f) => [f.properties.route, f.properties]));
const differ = [];
for (const [route, h] of mine) {
  const drawn = geoByRoute.get(route);
  if (!drawn) continue;
  const built = drawn.wk;
  const value = h.headway === null ? null : Math.round(h.headway);
  if (built === null || built === undefined) {
    if (value !== null) differ.push({ route, built, value, stop: h.stop, midday: h.midday });
    continue;
  }
  if (value === null) {
    differ.push({ route, built, value: 'none', stop: h.stop, midday: h.midday });
    continue;
  }
  if (Math.abs(built - value) > 2) differ.push({ route, built, value, stop: h.stop, midday: h.midday });
}
console.log(`routes recomputed for weekday midday headway: ${mine.size}; disagreements over 2 min: ${differ.length}`);
for (const d of differ.sort((a, b) => a.route.localeCompare(b.route, 'en', { numeric: true }))) {
  const name = gtfsStopById.get(d.stop)?.stop_name ?? d.stop;
  note(
    'data',
    `frequency: route ${d.route} weekday midday headway is ${d.built} min in routes.geojson, ${d.value} min recomputed` +
      ` (busiest stop ${name}, ${d.midday} midday departures)`,
  );
}

// Buses drawn with no timetable at all: DESIGN.md says a route whose trips do
// not exist cannot claim a tier.
for (const f of routesGeo.features) {
  if (f.properties.mode !== 'bus') continue;
  if (f.properties.wk_trips === 0) {
    note('data', `frequency: bus route ${f.properties.route} has 0 weekday trips in routes.geojson but is drawn as "${f.properties.tier}"`);
  }
}

// --- 6. sanity -------------------------------------------------------------

{
  const drawn = new Set(directory.routes.map((r) => r.route));
  for (const f of routesGeo.features) {
    if (!drawn.has(f.properties.route)) note('data', `sanity: route ${f.properties.route} is in routes.geojson but not in directory.json`);
  }
  const inGeo = new Set(routesGeo.features.map((f) => f.properties.route));
  for (const r of directory.routes) if (!inGeo.has(r.route)) note('data', `sanity: route ${r.route} is in directory.json but not in routes.geojson`);

  const railLines = new Set(routesGeo.features.filter((f) => f.properties.mode === 'rail').map((f) => f.properties.route));
  for (const s of directory.stations) {
    for (const line of String(s.lines ?? '').split(' ').filter(Boolean)) {
      if (!railLines.has(line)) note('data', `sanity: station ${s.id} ${s.label} lists line "${line}", which is not a drawn rail line`);
    }
  }
  const railMeta = new Map(meta.rail.map((r) => [r.route, r]));
  for (const line of railLines) {
    const p = geoByRoute.get(line);
    if (!p?.color) note('data', `sanity: rail line ${line} has no color`);
    if (!railMeta.has(line)) note('data', `sanity: rail line ${line} is drawn but missing from meta.rail`);
  }

  const ids = directory.stations.map((s) => s.id);
  const dupes = ids.filter((id, k) => ids.indexOf(id) !== k);
  if (dupes.length) note('data', `sanity: duplicate station ids: ${[...new Set(dupes)].join(', ')}`);

  const [[w, s], [e, n]] = meta.bounds.routes;
  const outside = [];
  const visit = (c, route) => {
    if (typeof c[0] !== 'number') return c.forEach((x) => visit(x, route));
    if (c[0] < w || c[0] > e || c[1] < s || c[1] > n) outside.push(`${route}:${c[0].toFixed(5)},${c[1].toFixed(5)}`);
  };
  for (const f of routesGeo.features) visit(f.geometry.coordinates, f.properties.route);
  for (const f of stationsGeo.features) visit(f.geometry.coordinates, `station ${f.properties.id}`);
  if (outside.length) note('data', `sanity: ${outside.length} coordinates outside meta.bounds.routes, e.g. ${outside.slice(0, 5).join(' ')}`);

  const stationIds = new Set(directory.stations.map((s) => s.id));
  for (const f of stationsGeo.features) {
    if (!stationIds.has(f.properties.id)) note('data', `sanity: station ${f.properties.id} is in stations.geojson but not in directory.json`);
  }

  for (const [route, list] of Object.entries(familyOf)) {
    const drawnRoute = directory.routes.find((r) => r.route === route);
    if (!drawnRoute) note('data', `sanity: family ${route} -> ${list.join(' ')} has no drawn route`);
    for (const code of list) {
      if (!gtfsRouteById.has(code) && !gtfsRoutes.some((r) => r.route_short_name === code)) {
        note('data', `sanity: family ${route} lists ${code}, which is not a GTFS route`);
      }
    }
  }
}

// --- report ----------------------------------------------------------------

console.log('');
if (infos.length) {
  console.log('== informational (not findings) ==');
  for (const text of infos) console.log(`  - ${text}`);
  console.log('');
}
if (!findings.length) {
  console.log('No disagreements found.');
} else {
  const byArea = new Map();
  for (const f of findings) (byArea.get(f.area) ?? byArea.set(f.area, []).get(f.area)).push(f);
  for (const [area, list] of byArea) {
    console.log(`== ${area}: ${list.length} ==`);
    for (const f of list) console.log(`  - ${f.text}`);
  }
  console.log(`\nTotal: ${findings.length}`);
}
