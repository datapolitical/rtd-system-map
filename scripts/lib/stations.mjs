import { csvRows, iso, readCsv, serviceDates, ymd } from './gtfs.mjs';

// A station counts as served if trains call there within this many days.
const WINDOW_DAYS = 7;
// How far a GTFS station can be from the station on RTD's map it matches.
const MATCH_METERS = 300;

/**
 * Which stations on RTD's map have trains, worked out from GTFS (DESIGN.md,
 * "Station service"). RTD's station layer lists stations whether or not
 * trains stop there, so this is what notices a station losing its trains, and
 * getting them back, with no change to the code.
 *
 * `stations` are the map's station features. `isRailRoute(route)` and
 * `lineOf(route)` take a routes.txt row; `lineOf` names the line as the map
 * draws it. `today` is midnight UTC on the agency's local date.
 *
 * Returns { stations, unmatched, positioning, ends, headsigns, order }: per map
 * station, in order, { served, lines, returns } (returns is the ISO date trains
 * next call there, when they don't this week); the names of GTFS rail stations
 * that match no map station; the lines that are only trains getting into
 * position; each line's two ends, as indexes into `stations`; the headsign
 * trains to each of those ends most often show (null if none); and each line's
 * stations from its first end to its second, as most of its trips call there.
 */
export function stationService(text, stations, { today, isRailRoute, lineOf }) {
  const routes = new Map(readCsv(text['routes.txt']).map((r) => [r.route_id, r]));
  const trips = new Map();
  const directions = new Map(); // line -> the direction_ids its trips run in
  for (const t of readCsv(text['trips.txt'])) {
    const route = routes.get(t.route_id);
    if (!route || !isRailRoute(route)) continue;
    const line = lineOf(route);
    trips.set(t.trip_id, { service: t.service_id, line, headsign: t.trip_headsign ?? '' });
    (directions.get(line) ?? directions.set(line, new Set()).get(line)).add(t.direction_id ?? '');
  }

  // Every GTFS stop a train calls at: stop -> service -> lines.
  const calls = new Map();
  const rows = csvRows(text['stop_times.txt']);
  const header = rows.next().value;
  const [tripCol, stopCol, seqCol] = ['trip_id', 'stop_id', 'stop_sequence'].map((name) => header.indexOf(name));
  for (const row of rows) {
    const trip = trips.get(row[tripCol]);
    if (!trip) continue;
    // Where each trip starts and ends, for the lines' ends.
    const seq = Number(row[seqCol]);
    if (!trip.first || seq < trip.first.seq) trip.first = { seq, stop: row[stopCol] };
    if (!trip.last || seq > trip.last.seq) trip.last = { seq, stop: row[stopCol] };
    (trip.calls ??= []).push([seq, row[stopCol]]);
    const byService = calls.get(row[stopCol]) ?? calls.set(row[stopCol], new Map()).get(row[stopCol]);
    (byService.get(trip.service) ?? byService.set(trip.service, new Set()).get(trip.service)).add(trip.line);
  }

  // Platforms belong to a station through parent_station.
  const stops = new Map(readCsv(text['stops.txt']).map((s) => [s.stop_id, s]));
  const groups = new Map(); // station stop_id -> { stop, services: service -> lines }
  for (const [stopId, byService] of calls) {
    const stop = stops.get(stopId);
    if (!stop) continue;
    const station = stops.get(stop.parent_station) ?? stop;
    const group = groups.get(station.stop_id) ?? groups.set(station.stop_id, { stop: station, services: new Map() }).get(station.stop_id);
    for (const [service, lines] of byService) {
      const all = group.services.get(service) ?? group.services.set(service, new Set()).get(service);
      for (const line of lines) all.add(line);
    }
  }

  // A "line" whose trains all run one way, stopping only where other lines
  // stop, is trains getting into position for their first runs, not a line
  // riders can use (DESIGN.md, "Trains that aren't a line").
  const linesAt = [...groups.values()].map(({ services }) => new Set([...services.values()].flatMap((l) => [...l])));
  const positioning = new Set(
    [...directions]
      .filter(([line, dirs]) => dirs.size === 1 && !dirs.has('') && linesAt.every((at) => !at.has(line) || at.size > 1))
      .map(([line]) => line),
  );

  // Each GTFS station goes to the nearest map station within range.
  const matched = stations.map(() => []);
  const unmatched = [];
  const mapIndex = new Map(); // GTFS station stop_id -> map station index
  for (const group of groups.values()) {
    const at = [Number(group.stop.stop_lon), Number(group.stop.stop_lat)];
    let best = -1;
    let bestMeters = Infinity;
    stations.forEach((f, i) => {
      const meters = distance(at, f.geometry.coordinates);
      if (meters < bestMeters) [best, bestMeters] = [i, meters];
    });
    if (bestMeters <= MATCH_METERS) {
      matched[best].push(group);
      mapIndex.set(group.stop.stop_id, best);
    } else unmatched.push(group.stop.stop_name);
  }

  // A line's ends are the two stations its trips most often start or end at
  // (short runs to a yard or a midway station are fewer).
  const endCounts = new Map(); // line -> map station index -> trips
  for (const trip of trips.values()) {
    if (positioning.has(trip.line) || !trip.first) continue;
    const counts = endCounts.get(trip.line) ?? endCounts.set(trip.line, new Map()).get(trip.line);
    for (const { stop } of [trip.first, trip.last]) {
      const platform = stops.get(stop);
      const index = mapIndex.get(platform?.parent_station || stop) ?? mapIndex.get(stop);
      if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1);
    }
  }
  const ends = Object.fromEntries(
    [...endCounts].map(([line, counts]) => [line, [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([index]) => index)]),
  );
  // What trains to each end say on the front: the most common headsign of
  // the line's trips that end there.
  const signCounts = new Map(); // `${line} ${index}` -> headsign -> trips
  for (const trip of trips.values()) {
    if (!trip.last || !trip.headsign) continue;
    const platform = stops.get(trip.last.stop);
    const index = mapIndex.get(platform?.parent_station || trip.last.stop) ?? mapIndex.get(trip.last.stop);
    if (!ends[trip.line]?.includes(index)) continue;
    const key = `${trip.line} ${index}`;
    const counts = signCounts.get(key) ?? signCounts.set(key, new Map()).get(key);
    counts.set(trip.headsign, (counts.get(trip.headsign) ?? 0) + 1);
  }
  const headsigns = Object.fromEntries(
    Object.entries(ends).map(([line, indexes]) => [
      line,
      indexes.map((i) => [...(signCounts.get(`${line} ${i}`) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null),
    ]),
  );

  // Each line's stations in order: the commonest calling pattern of trips
  // that run end to end, read from its first end.
  const indexOf = (stop) => mapIndex.get(stops.get(stop)?.parent_station || stop) ?? mapIndex.get(stop);
  const patterns = new Map(); // line -> pattern -> trips
  for (const trip of trips.values()) {
    const [a, b] = ends[trip.line] ?? [];
    if (a === undefined || !trip.calls) continue;
    let calls = trip.calls.sort((x, y) => x[0] - y[0]).map(([, stop]) => indexOf(stop)).filter((i) => i !== undefined);
    calls = calls.filter((i, k) => i !== calls[k - 1]);
    if (calls[0] === b && calls.at(-1) === a) calls.reverse();
    if (calls[0] !== a || calls.at(-1) !== b) continue;
    const counts = patterns.get(trip.line) ?? patterns.set(trip.line, new Map()).get(trip.line);
    const key = calls.join(' ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = Object.fromEntries(
    [...patterns].map(([line, counts]) => [line, [...counts].sort((x, y) => y[1] - x[1])[0][0].split(' ').map(Number)]),
  );

  const dates = serviceDates(text);
  const week = new Set(Array.from({ length: WINDOW_DAYS }, (_, k) => ymd(new Date(today.getTime() + k * 864e5))));
  const from = ymd(today);
  return {
    stations: matched.map((found) => {
      const lines = new Set();
      let next = null;
      for (const { services } of found) {
        for (const [service, all] of services) {
          const serviceLines = [...all].filter((line) => !positioning.has(line));
          if (!serviceLines.length) continue;
          const runs = [...(dates.get(service) ?? [])];
          if (runs.some((d) => week.has(d))) for (const line of serviceLines) lines.add(line);
          for (const d of runs) if (d >= from && (!next || d < next)) next = d;
        }
      }
      const served = lines.size > 0;
      return {
        served,
        lines: [...lines].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
        returns: !served && next ? iso(next) : null,
      };
    }),
    unmatched: unmatched.sort(),
    positioning: [...positioning].sort(),
    ends,
    headsigns,
    order,
  };
}

// Meters between two [lon, lat] points; an equirectangular approximation is
// plenty at station-matching distances.
function distance([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6371e3;
}
