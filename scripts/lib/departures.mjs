// Every stop's departures, from RTD's timetable, in small files the page reads when a stop's or
// a station's card opens (DESIGN.md, "Tap anything and it explains itself"; #13). The page works
// out "next" itself (public/js/panel/departures.js), for today's real calendar: the feed's
// services and its exceptions go with the times, so a holiday shows its own timetable.
//
// Nothing about the network is written here: routes, stops, services and the hours are RTD's.

import { csvRows, readCsv } from './gtfs.mjs';
import { chunkOf } from '../../public/js/panel/departures.js';

// A file of about this many characters before compression: small enough to fetch for one stop.
const CHUNK_CHARS = 40_000;
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const minutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/**
 * `text` is the feed's files. `lineOf(route_id)` names the map's route a GTFS route belongs to
 * (FF1 to FF5 are the map's FF), or null for one the map doesn't draw; `stations` is
 * `[{ id, stops: [stop_id] }]`, each rail station's platform stops.
 *
 * Returns `{ index, files }`. `index` is `{ tz, from, to, services, exceptions, patterns, files,
 * stations }` (see public/js/panel/departures.js); `files[k]` is `{ stop_id: { a, d } }` for the
 * stops chunkOf puts in file k: `a` is the stop's wheelchair boarding as RTD gives it, `d` its
 * departures as `[[pattern, [first, gap, gap…]]]` in minutes, and `end: 1` marks a stop where
 * trips call but none can be boarded.
 *
 * A trip's last stop is not a departure, nor is a stop where it only sets down.
 */
export function departureTables(text, { lineOf = (id) => id, stations = [] } = {}) {
  const routes = new Map(readCsv(text['routes.txt']).map((r) => [r.route_id, r]));
  const trips = new Map(readCsv(text['trips.txt']).map((t) => [t.trip_id, t]));
  const patterns = new Map(); // JSON of [route, name, headsign, service] -> index
  const patternOf = (trip) => {
    const r = routes.get(trip.route_id);
    const name = r?.route_short_name || trip.route_id;
    const key = JSON.stringify([lineOf(trip.route_id) ?? name, name, trip.trip_headsign ?? '', trip.service_id]);
    if (!patterns.has(key)) patterns.set(key, patterns.size);
    return patterns.get(key);
  };

  // Each trip's calls in order, so its last can be left out.
  const calls = new Map(); // trip_id -> [[sequence, stop, minutes | null]]
  const rows = csvRows(text['stop_times.txt']);
  const header = rows.next().value;
  const [tripCol, depCol, stopCol, seqCol, pickupCol] = ['trip_id', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type'].map((n) => header.indexOf(n));
  for (const row of rows) {
    if (!trips.has(row[tripCol])) continue;
    let list = calls.get(row[tripCol]);
    if (!list) calls.set(row[tripCol], (list = []));
    list.push([Number(row[seqCol]), row[stopCol], row[depCol] && row[pickupCol] !== '1' ? minutes(row[depCol]) : null]);
  }
  const byStop = new Map(); // stop -> Map(pattern -> [minutes])
  const called = new Set(); // every stop a trip calls at, boarding or not
  for (const [id, list] of calls) {
    list.sort((a, b) => a[0] - b[0]);
    const pattern = patternOf(trips.get(id));
    for (const [, stop] of list) called.add(stop);
    for (const [, stop, at] of list.slice(0, -1)) {
      if (at === null) continue;
      let of = byStop.get(stop);
      if (!of) byStop.set(stop, (of = new Map()));
      let times = of.get(pattern);
      if (!times) of.set(pattern, (times = []));
      times.push(at);
    }
  }

  const boarding = new Map(readCsv(text['stops.txt']).map((s) => [s.stop_id, Number(s.wheelchair_boarding) || 0]));
  const records = new Map();
  let chars = 0;
  for (const [stop, of] of byStop) {
    const d = [...of].sort((a, b) => a[0] - b[0]).map(([pattern, times]) => {
      times.sort((a, b) => a - b);
      return [pattern, times.map((t, i) => (i ? t - times[i - 1] : t))];
    });
    const record = { a: boarding.get(stop) ?? 0, d };
    records.set(stop, record);
    chars += JSON.stringify(record).length + stop.length + 4;
  }
  // A stop where trips only end or set down (an arrivals gate): its card says so, not "no departures".
  let ends = 0;
  for (const stop of called) {
    if (records.has(stop)) continue;
    records.set(stop, { a: boarding.get(stop) ?? 0, d: [], end: 1 });
    ends++;
  }
  const count = Math.max(1, 2 ** Math.ceil(Math.log2(chars / CHUNK_CHARS)));
  const files = Array.from({ length: count }, () => ({}));
  for (const [stop, record] of [...records].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))) files[chunkOf(stop, count)][stop] = record;

  const calendar = readCsv(text['calendar.txt']);
  const index = {
    tz: readCsv(text['agency.txt'])[0]?.agency_timezone || 'America/Denver',
    from: calendar.map((c) => c.start_date).sort()[0] ?? null,
    to: calendar.map((c) => c.end_date).sort().at(-1) ?? null,
    services: Object.fromEntries(calendar.map((c) => [c.service_id, { days: WEEK.map((d) => (c[d] === '1' ? '1' : '0')).join(''), from: c.start_date, to: c.end_date }])),
    exceptions: readCsv(text['calendar_dates.txt']).map((e) => [e.date, e.service_id, Number(e.exception_type)]),
    patterns: [...patterns.keys()].map((key) => JSON.parse(key)),
    files: count,
    // Only the platforms trains leave from: a station's card reads these.
    stations: Object.fromEntries(stations.map((s) => [s.id, s.stops.filter((id) => records.has(id))]).filter(([, stops]) => stops.length)),
  };
  return { index, files, ends, stops: records.size - ends, departures: [...byStop.values()].reduce((n, of) => n + [...of.values()].reduce((k, t) => k + t.length, 0), 0), chars };
}
