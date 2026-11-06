import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { getBytes } from './http.mjs';

const FILES = [
  'agency.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'feed_info.txt',
  'routes.txt',
  'stops.txt',
  'trips.txt',
  'stop_times.txt',
  'shapes.txt',
];

/**
 * Download and unpack the feed. With `cache`, a path, the feed is read from
 * that file, and downloaded to it first if it isn't there.
 */
export async function loadGtfs(url, cache = null) {
  let bytes = cache && (await readFile(cache).then((b) => new Uint8Array(b), () => null));
  if (!bytes) {
    bytes = await getBytes(url);
    if (cache) await writeFile(cache, bytes);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const zipped = unzipSync(bytes, { filter: (f) => FILES.includes(basename(f.name)) });
  const decoder = new TextDecoder();
  const text = Object.fromEntries(Object.entries(zipped).map(([name, data]) => [basename(name), decoder.decode(data)]));
  for (const file of ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt']) {
    if (!text[file]) throw new Error(`GTFS feed has no ${file}`);
  }
  return { sha256, bytes: bytes.length, text };
}

const basename = (name) => name.split('/').pop();

/** Parse CSV text into arrays of strings, handling quoted fields. */
export function* csvRows(text) {
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const row = [];
    for (;;) {
      let value;
      if (text[i] === '"') {
        value = '';
        let j = i + 1;
        for (;;) {
          const q = text.indexOf('"', j);
          if (q < 0) throw new Error('Unterminated quote in CSV');
          value += text.slice(j, q);
          if (text[q + 1] === '"') {
            value += '"';
            j = q + 2;
          } else {
            i = q + 1;
            break;
          }
        }
      } else {
        let j = i;
        while (j < n && text[j] !== ',' && text[j] !== '\n' && text[j] !== '\r') j++;
        value = text.slice(i, j);
        i = j;
      }
      row.push(value.trim());
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '\r') i++;
      if (text[i] === '\n') i++;
      break;
    }
    if (row.length > 1 || row[0] !== '') yield row;
  }
}

/** Parse CSV text into objects keyed by the header row. */
export function readCsv(text = '') {
  const rows = csvRows(text);
  const header = rows.next().value ?? [];
  const out = [];
  for (const row of rows) out.push(Object.fromEntries(header.map((h, k) => [h, row[k] ?? ''])));
  return out;
}

// --- Service dates -------------------------------------------------------

const WEEKDAY_FIELDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const KINDS = { weekday: [1, 2, 3, 4, 5], saturday: [6], sunday: [0] };

export const ymd = (date) => date.toISOString().slice(0, 10).replaceAll('-', '');
const parseYmd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
export const iso = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/**
 * Pick a typical weekday, Saturday, and Sunday from the feed's own calendar.
 * Looks at the next eight weeks, skips dates with exceptions (holidays and
 * one-off changes), and uses the service pattern most of those days share.
 */
export function representativeDates(text, today) {
  const calendar = readCsv(text['calendar.txt']);
  const exceptions = new Set(readCsv(text['calendar_dates.txt']).map((r) => r.date));
  if (!calendar.length) throw new Error('GTFS feed has no calendar.txt entries');

  const feedStart = calendar.map((c) => c.start_date).sort()[0];
  const feedEnd = calendar.map((c) => c.end_date).sort().at(-1);
  let day = parseYmd(ymd(today) > feedStart ? ymd(today) : feedStart);

  const patterns = Object.fromEntries(Object.keys(KINDS).map((k) => [k, new Map()]));
  for (let i = 0; i < 56 && ymd(day) <= feedEnd; i++, day = new Date(day.getTime() + 864e5)) {
    const date = ymd(day);
    if (exceptions.has(date)) continue;
    const services = calendar
      .filter((c) => c.start_date <= date && date <= c.end_date && c[WEEKDAY_FIELDS[day.getUTCDay()]] === '1')
      .map((c) => c.service_id)
      .sort();
    const kind = Object.keys(KINDS).find((k) => KINDS[k].includes(day.getUTCDay()));
    const key = services.join(' ');
    const seen = patterns[kind].get(key) ?? { date, services, days: 0 };
    seen.days++;
    patterns[kind].set(key, seen);
  }

  return Object.fromEntries(
    Object.entries(patterns).map(([kind, seen]) => {
      const best = [...seen.values()].sort((a, b) => b.days - a.days)[0];
      if (!best) throw new Error(`No typical ${kind} found in the GTFS calendar`);
      return [kind, { date: iso(best.date), services: best.services }];
    }),
  );
}

/**
 * Every date each service runs, from calendar.txt with calendar_dates.txt's
 * additions and removals applied. Returns Map(service_id -> Set of YYYYMMDD).
 */
export function serviceDates(text) {
  const dates = new Map();
  const of = (service) => dates.get(service) ?? dates.set(service, new Set()).get(service);
  for (const c of readCsv(text['calendar.txt'])) {
    const set = of(c.service_id);
    for (let day = parseYmd(c.start_date); ymd(day) <= c.end_date; day = new Date(day.getTime() + 864e5)) {
      if (c[WEEKDAY_FIELDS[day.getUTCDay()]] === '1') set.add(ymd(day));
    }
  }
  for (const e of readCsv(text['calendar_dates.txt'])) {
    if (e.exception_type === '1') of(e.service_id).add(e.date);
    if (e.exception_type === '2') of(e.service_id).delete(e.date);
  }
  return dates;
}

// --- Frequency -----------------------------------------------------------

export const MIDDAY = [9 * 3600, 15 * 3600];
// A route with no midday trips is "rush hours only" if it runs in both rush
// periods: before 9am and between 3 and 8pm.
const MORNING = [0, 9 * 3600];
const EVENING = [15 * 3600, 20 * 3600];
const within = (t, [from, to]) => t >= from && t < to;
// Buses that run in bunched pairs (two hourly patterns a few minutes apart)
// have a short median gap but leave riders waiting most of an hour. Where the
// average gap across the window is more than this many times the median, the
// average is the headway. Chosen from the Nov 2026 feed: bunched pairs ran at
// 4x or more, while ordinary drift (gaps of 29 to 35 on a 30-minute route)
// and service stepping up partway through the window stayed under 1.4x.
const BUNCHED = 1.5;

/** A route's frequency tier for one kind of day, per DESIGN.md. */
export function tierOf(day) {
  if (!day?.trips) return 'none';
  if (day.headway == null) {
    if (day.middayDepartures) return 'infrequent';
    return day.morning && day.evening ? 'peak' : 'limited';
  }
  if (day.headway <= 15) return 'frequent';
  if (day.headway <= 30) return 'every30';
  if (day.headway <= 60) return 'hourly';
  return 'infrequent';
}

const seconds = (t) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * How often each route runs on each kind of day, per DESIGN.md: the median
 * gap between midday departures at the route's busiest stop, in each
 * direction (the average gap where buses run in bunched pairs, see
 * BUNCHED), keeping the less frequent direction.
 *
 * `groupOf(route_id)` names the line each GTFS route belongs to, so a family
 * that RTD draws as one line (FF1 to FF5 as FF) is measured as one route.
 *
 * Returns Map(group -> { weekday, saturday, sunday }), where each day is
 * { trips, middayDepartures, headway (minutes or null), first, last, morning,
 * evening }, or missing when the route doesn't run that day. `morning` and
 * `evening` say whether it runs in each rush period.
 *
 * Reading stop_times.txt is the slow part of a build, so this pass can also
 * keep each trip's stops for other measures: with `stopTimes`, a Map, every
 * trip on a representative day that `keep(trip)` accepts gets
 * trip_id -> { stops: [stop_id], times: [seconds or NaN] } in stop order.
 */
export function routeFrequency(text, dates, groupOf = (id) => id, { stopTimes = null, keep = () => true } = {}) {
  const trips = new Map(readCsv(text['trips.txt']).map((t) => [t.trip_id, t]));
  const kindsByService = new Map();
  for (const [kind, { services }] of Object.entries(dates)) {
    for (const s of services) kindsByService.set(s, [...(kindsByService.get(s) ?? []), kind]);
  }

  // departures[kind] : "route|direction" -> Map(stop -> [seconds])
  const departures = Object.fromEntries(Object.keys(dates).map((k) => [k, new Map()]));
  const tripCounts = Object.fromEntries(Object.keys(dates).map((k) => [k, new Map()]));
  for (const trip of trips.values()) {
    for (const kind of kindsByService.get(trip.service_id) ?? []) {
      const group = groupOf(trip.route_id);
      tripCounts[kind].set(group, (tripCounts[kind].get(group) ?? 0) + 1);
    }
  }

  const kept = new Map(); // trip_id -> [[sequence, stop, seconds]]
  const rows = csvRows(text['stop_times.txt']);
  const header = rows.next().value;
  const col = (name) => header.indexOf(name);
  const [tripCol, depCol, arrCol, stopCol, seqCol, pickupCol] = ['trip_id', 'departure_time', 'arrival_time', 'stop_id', 'stop_sequence', 'pickup_type'].map(col);
  for (const row of rows) {
    const trip = trips.get(row[tripCol]);
    const kinds = trip && kindsByService.get(trip.service_id);
    if (!kinds) continue;
    const t = row[depCol] ? seconds(row[depCol]) : NaN;
    if (stopTimes) {
      let list = kept.get(row[tripCol]);
      if (list === undefined) kept.set(row[tripCol], (list = keep(trip) ? [] : null));
      if (list) list.push([Number(row[seqCol]), row[stopCol], row[depCol] ? t : row[arrCol] ? seconds(row[arrCol]) : NaN]);
    }
    if (row[pickupCol] === '1' || !row[depCol]) continue; // no boarding here
    const key = `${groupOf(trip.route_id)}|${trip.direction_id}`;
    for (const kind of kinds) {
      let byStop = departures[kind].get(key);
      if (!byStop) departures[kind].set(key, (byStop = new Map()));
      let times = byStop.get(row[stopCol]);
      if (!times) byStop.set(row[stopCol], (times = []));
      times.push(t);
    }
  }
  for (const [id, list] of kept) {
    if (!list) continue;
    list.sort((a, b) => a[0] - b[0]);
    stopTimes.set(id, { stops: list.map((r) => r[1]), times: list.map((r) => r[2]) });
  }

  const result = new Map();
  for (const [kind, byDirection] of Object.entries(departures)) {
    const directions = new Map(); // route -> [summary per direction]
    for (const [key, byStop] of byDirection) {
      const route = key.slice(0, key.lastIndexOf('|'));
      const stops = [...byStop.values()].map((all) => ({ all, midday: all.filter((t) => within(t, MIDDAY)).length }));
      const { all: busiest } = stops.sort((a, b) => b.midday - a.midday || b.all.length - a.all.length)[0];
      directions.set(route, [...(directions.get(route) ?? []), directionSummary(busiest)]);
    }
    for (const [route, dirs] of directions) {
      result.set(route, { ...(result.get(route) ?? {}), [kind]: daySummary(dirs, tripCounts[kind].get(route) ?? 0) });
    }
  }
  return result;
}

/**
 * One direction's service at one place: `times` are every departure there
 * that day, in seconds. Returns { middayDepartures, headway (the median gap
 * between midday departures in minutes, or the average gap where buses run
 * bunched, see BUNCHED; null with fewer than two), first, last (seconds),
 * morning, evening }.
 */
export function directionSummary(times) {
  const midday = times.filter((t) => within(t, MIDDAY)).sort((a, b) => a - b);
  const gaps = midday.slice(1).map((t, k) => t - midday[k]);
  const average = gaps.length ? (midday.at(-1) - midday[0]) / gaps.length : null;
  const typical = gaps.length ? median(gaps) : null;
  let [first, last] = [Infinity, -Infinity];
  for (const t of times) [first, last] = [Math.min(first, t), Math.max(last, t)];
  return {
    middayDepartures: midday.length,
    headway: gaps.length ? Math.round((average > BUNCHED * typical ? average : typical) / 60) : null,
    first,
    last,
    morning: times.some((t) => within(t, MORNING)),
    evening: times.some((t) => within(t, EVENING)),
  };
}

/**
 * A day's service from its directions' summaries: the less frequent direction
 * sets the frequency. `trips` is how many trips run that day.
 */
export function daySummary(dirs, trips) {
  const worst = dirs.reduce((a, b) => (worse(b, a) ? b : a));
  return {
    trips,
    middayDepartures: worst.middayDepartures,
    headway: worst.headway,
    first: clock(Math.min(...dirs.map((d) => d.first))),
    last: clock(Math.max(...dirs.map((d) => d.last))),
    morning: dirs.some((d) => d.morning),
    evening: dirs.some((d) => d.evening),
  };
}

const worse = (a, b) =>
  (a.headway ?? Infinity) > (b.headway ?? Infinity) ||
  ((a.headway ?? Infinity) === (b.headway ?? Infinity) && a.middayDepartures < b.middayDepartures);

// GTFS times can pass 24:00 for trips after midnight; keep them as HH:MM.
export const clock = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

// --- Shapes --------------------------------------------------------------

const shapeCache = new WeakMap();

/**
 * Every shape in the feed, shape_id -> [[lon, lat], ...] in sequence order.
 * shapes.txt is large, so it's read once per feed and shared by every measure
 * that needs it.
 */
export function shapePoints(text) {
  if (shapeCache.has(text)) return shapeCache.get(text);
  const points = new Map();
  if (text['shapes.txt']) {
    const rows = csvRows(text['shapes.txt']);
    const header = rows.next().value;
    const [idCol, seqCol, lonCol, latCol] = ['shape_id', 'shape_pt_sequence', 'shape_pt_lon', 'shape_pt_lat'].map((n) => header.indexOf(n));
    for (const row of rows) {
      (points.get(row[idCol]) ?? points.set(row[idCol], []).get(row[idCol])).push([Number(row[seqCol]), Number(row[lonCol]), Number(row[latCol])]);
    }
    for (const [id, list] of points) points.set(id, list.sort((a, b) => a[0] - b[0]).map(([, lon, lat]) => [lon, lat]));
  }
  shapeCache.set(text, points);
  return points;
}

/**
 * Where each line's trains run: for each line and direction, the shape most
 * of its trips on `services` follow (all trips if none run then; ties go to
 * the longer shape). `lineOf` maps a GTFS route_id to its line, or to nothing
 * for routes to skip. Returns line -> [[lon, lat], ...] per direction.
 */
export function lineShapes(text, lineOf, services = []) {
  const result = new Map();
  if (!text['shapes.txt']) return result;
  const running = new Set(services);
  const trips = readCsv(text['trips.txt']).filter((t) => t.shape_id && lineOf(t.route_id));
  const today = trips.filter((t) => running.has(t.service_id));
  const uses = new Map(); // line -> direction -> shape_id -> trips
  for (const t of today.length ? today : trips) {
    const line = lineOf(t.route_id);
    const byDirection = uses.get(line) ?? uses.set(line, new Map()).get(line);
    const counts = byDirection.get(t.direction_id) ?? byDirection.set(t.direction_id, new Map()).get(t.direction_id);
    counts.set(t.shape_id, (counts.get(t.shape_id) ?? 0) + 1);
  }
  const points = shapePoints(text);
  for (const [line, byDirection] of uses) {
    const paths = [];
    for (const counts of byDirection.values()) {
      const [best] = [...counts]
        .filter(([id]) => points.has(id))
        .sort((a, b) => b[1] - a[1] || points.get(b[0]).length - points.get(a[0]).length);
      if (best) paths.push(points.get(best[0]).map((p) => [...p]));
    }
    if (paths.length) result.set(line, paths);
  }
  return result;
}

// --- Matching RTD's map to GTFS ------------------------------------------

const routeName = (s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The GTFS routes behind one route on RTD's map (DESIGN.md, "Routes are
 * matched between ArcGIS and GTFS"): by route number or ID, and, additively,
 * the family RTD draws as one line, such as FF1 to FF5 as FF. A family member
 * shares the map route's prefix and has exactly its route name. A route the
 * map draws on its own, named in `drawn`, is never another's family, and a
 * route that matches by number still takes its family, so a frequency counts
 * every trip riders on that line can take.
 */
export function matchGtfs(mapRoute, gtfsRoutes, drawn = new Set()) {
  const exact = gtfsRoutes.filter((r) => r.route_short_name === mapRoute.route || r.route_id === mapRoute.route);
  const family = gtfsRoutes.filter((r) => {
    const code = r.route_short_name || r.route_id;
    return (
      !exact.includes(r) &&
      !drawn.has(code) &&
      !drawn.has(r.route_id) &&
      code.startsWith(mapRoute.route) &&
      routeName(r.route_long_name) === routeName(mapRoute.name)
    );
  });
  return [...exact, ...family];
}

/**
 * What riders call each route on RTD's map (DESIGN.md, "Routes go by their
 * timetable names"). The map's ROUTE field is RTD's own code, which is not
 * always the name on the bus and the timetable: the map's BOND is the Bound,
 * FREE the FreeRide. A map route that is one timetable route takes that
 * route's name. A family drawn as one line keeps the map's code, the part its
 * members share (FF for FF1 to FF5), and so does a route whose timetable name
 * has a space (routes are listed with spaces between them) or is already
 * another route's name. `matches` is map code -> its GTFS routes, from
 * matchGtfs; returns map code -> name.
 */
export function riderNames(matches) {
  const names = new Map([...matches.keys()].map((code) => [code, code]));
  const taken = new Set(names.keys());
  for (const [code, found] of matches) {
    const name = found.length === 1 ? found[0].route_short_name : '';
    if (!name || name === code || /\s/.test(name) || taken.has(name)) continue;
    names.set(code, name);
    taken.add(name);
  }
  return names;
}

// --- Line ends -----------------------------------------------------------

/**
 * Where each line's trips go: for each line and direction, the headsigns its
 * trips on `services` show (all trips if none run then), most common first,
 * the most used shape in that direction, which is the path the line takes,
 * and the terminal it ends at. The terminal is the last stop of the longest
 * trip on that shape, not the shape's own end: shapes carry tail track and
 * deadheads past the stop where the bus turns around. `lineOf` maps a GTFS
 * route_id to its line, or to nothing for routes to skip. Returns
 * line -> [{ headsigns, at, path }], one per direction.
 */
export function lineEnds(text, lineOf, services = []) {
  const result = new Map();
  const running = new Set(services);
  const trips = readCsv(text['trips.txt']).filter((t) => lineOf(t.route_id));
  const today = trips.filter((t) => running.has(t.service_id));
  const counts = new Map(); // line -> direction -> { headsigns, shapes, trips }
  const shapeOfTrip = new Map(); // trip_id -> shape_id
  for (const t of today.length ? today : trips) {
    const line = lineOf(t.route_id);
    const byDirection = counts.get(line) ?? counts.set(line, new Map()).get(line);
    const c = byDirection.get(t.direction_id) ?? byDirection.set(t.direction_id, { headsigns: new Map(), shapes: new Map(), trips: new Map() }).get(t.direction_id);
    if (t.trip_headsign) c.headsigns.set(t.trip_headsign, (c.headsigns.get(t.trip_headsign) ?? 0) + 1);
    if (!t.shape_id) continue;
    c.shapes.set(t.shape_id, (c.shapes.get(t.shape_id) ?? 0) + 1);
    c.trips.set(t.trip_id, t.shape_id);
    shapeOfTrip.set(t.trip_id, t.shape_id);
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const shapes = shapePoints(text);
  const path = (id) => shapes.get(id)?.map((p) => [...p]) ?? null;
  // The last stop of each trip, by stop_sequence, and the stop itself.
  const stops = new Map();
  for (const row of readCsv(text['stops.txt'])) stops.set(row.stop_id, [Number(row.stop_lon), Number(row.stop_lat)]);
  const lastStop = new Map(); // trip_id -> { shape, stops, sequence, stop, time }
  if (text['stop_times.txt'] && shapeOfTrip.size) {
    const rows = csvRows(text['stop_times.txt']);
    const header = rows.next().value;
    const [tripCol, stopCol, seqCol, arrCol, depCol] = ['trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time'].map((n) => header.indexOf(n));
    for (const row of rows) {
      const shape = shapeOfTrip.get(row[tripCol]);
      if (!shape) continue;
      const seen = lastStop.get(row[tripCol]) ?? lastStop.set(row[tripCol], { stops: 0, sequence: -1 }).get(row[tripCol]);
      seen.stops++;
      const sequence = Number(row[seqCol]);
      if (sequence >= seen.sequence) {
        seen.sequence = sequence;
        seen.stop = row[stopCol];
        seen.time = row[arrCol] || row[depCol] || '';
      }
    }
  }
  const terminal = (tripIds) =>
    stops.size
      ? tripIds
          .map((id) => lastStop.get(id))
          .filter((t) => t?.stop && stops.has(t.stop))
          .sort((a, b) => b.stops - a.stops || b.time.localeCompare(a.time))[0]?.stop ?? null
      : null;
  for (const [line, byDirection] of counts) {
    result.set(
      line,
      [...byDirection]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, c]) => {
          const shape = top(c.shapes);
          const points = path(shape);
          // Only trips on the shape the map draws say where this line ends; a
          // variant running a different path ends somewhere else.
          const onShape = [...c.trips].filter(([, id]) => id === shape).map(([trip]) => trip);
          const at = stops.get(terminal(onShape)) ?? null;
          return { headsigns: [...c.headsigns].sort((a, b) => b[1] - a[1]).map(([h]) => h), at: at ?? points?.at(-1) ?? null, path: points };
        }),
    );
  }
  return result;
}
