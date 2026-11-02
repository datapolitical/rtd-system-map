// Where several bus routes share a street and its stops, riders can take
// whichever comes first, so the map draws the shared stretch once with their
// combined frequency (DESIGN.md, "Bus routes"). Two routes every 30 minutes,
// evenly spaced, are a frequent corridor; two that leave a minute apart are
// not, because no rider plans on "every 15" that arrives as a pair.
//
// So a corridor is two or more routes that share stops *and* interleave: at
// every shared stop the longest wait between consecutive departures must be no
// more than half again the combined headway (the median gap). A rider notices
// the long wait, not the two buses that arrive together, so bunching shows up
// as the gap on the far side of it, not as a gap of zero.
//
// The stretches come from the stop sequences. Along each route's pattern, a
// run of consecutive stops served by the same set of routes is a corridor:
// where the set changes the corridor ends, and a run shorter than two stops is
// folded into a neighbor with members in common (a route crossing the street
// at one stop is not a break in the corridor, and never becomes a member).
// Only stops every member serves are counted, so a limited-stop route joins a
// corridor at the stops it calls at, and its frequency counts only there.
//
// Nothing here reads files, the network, or the clock; the same data always
// gives the same corridors.
//
// Inputs:
//   routes            Route ids (strings) or objects with `route` and
//                     `shortName`, the number the map draws (defaults to the
//                     id), in the order they should be reported. Only these
//                     are combined: pass the bus routes the map draws.
//   tripsByRoute      Map or object, route -> trip ids, or `{ trip, direction }`
//                     where the two directions must be measured separately
//                     (a rider only takes the one they're going). Trips with no
//                     direction are direction 0.
//   stopTimesByRoute  Map or object, route -> stop times: `{ trip, stop, time,
//                     seq, pickup }`. `time` is a departure in seconds after
//                     midnight, or "HH:MM:SS". `seq` orders a trip's stops
//                     (GTFS stop_sequence); without it, rows are taken in the
//                     order given. `pickup` "1" marks a stop with no boarding,
//                     which still counts as served but not as a departure.
//                     Pass only the departures for the span to measure —
//                     midday, to match route headways — because a gap at the
//                     edge of service is a gap like any other.
//   stops             Optional stop ids (or objects with `id`) to limit
//                     corridors to, e.g. the bus stops the map draws. Stops
//                     left out are ignored, so a corridor may run past them.
//
// Returns `[{ id, members, stopIds, headwayMinutes, tier }]`, one per corridor,
// ready to become a GeoJSON feature: `id` stable across builds; `members` the
// routes that make it, ordered by route number as drawn, each
// `{ route, shortName, headwayMinutes }`, so the renderer can put their numbers
// side by side and show as many as it has room for; `stopIds` ordered along the
// corridor (build its LineString from their coordinates); `headwayMinutes` the
// combined headway at its least frequent shared stop and direction, in whole
// minutes like route headways; and `tier` the bus tier that headway falls in
// (frequent, every30, hourly, infrequent). No zoom or drawing decisions live
// here.

// A corridor is a stretch, not a single shared stop.
const MIN_STOPS = 2;
// A frequency claim needs a few departures behind it.
const MIN_DEPARTURES = 4;
// The longest wait may be at most this much over the combined headway.
const SLACK = 0.5;

export function buildCorridors({ routes = [], tripsByRoute = {}, stopTimesByRoute = {}, stops } = {}) {
  const routeIds = [];
  const shortNames = new Map();
  const listed = new Set();
  for (const route of routes ?? []) {
    const id = idOf(route);
    if (id == null || listed.has(id)) continue;
    listed.add(id);
    routeIds.push(id);
    shortNames.set(id, shortNameOf(route) ?? id);
  }

  const allowed = stops?.length ? new Set(stops.map(idOf).filter((stop) => stop != null)) : null;

  const byRoute = new Map();
  for (const id of routeIds) {
    byRoute.set(id, routeData(id, listOf(tripsByRoute, id), listOf(stopTimesByRoute, id), allowed));
  }

  // Which routes serve each stop, in `routes` order.
  const serving = new Map();
  for (const id of routeIds) {
    for (const stop of byRoute.get(id).stops) {
      const here = serving.get(stop);
      if (here) here.push(id);
      else serving.set(stop, [id]);
    }
  }

  const found = [];
  for (const id of routeIds) {
    for (const pattern of byRoute.get(id).patterns) {
      const sets = pattern.map((stop) => serving.get(stop) ?? []);
      for (const run of mergeShort(runsOf(pattern, sets))) {
        if (run.members.length < 2 || run.stops.length < MIN_STOPS) continue;
        // The same street in the opposite direction is the same corridor:
        // a line has no direction, so keep one canonical stop order.
        const stopIds = run.stops[0] <= run.stops.at(-1) ? run.stops : [...run.stops].reverse();
        found.push({ members: run.members, stopIds, order: found.length });
      }
    }
  }

  // A pattern with an extra stop repeats a corridor another pattern found in
  // full; the same members over fewer stops adds nothing.
  const unique = [];
  const seen = new Set();
  for (const corridor of found) {
    const key = `${corridor.members.join('\u0000')}\u0001${corridor.stopIds.join('\u0000')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(corridor);
  }
  const longestFirst = [...unique].sort((a, b) => b.stopIds.length - a.stopIds.length || a.order - b.order);
  const kept = [];
  const coveredBy = new Map();
  for (const corridor of longestFirst) {
    const key = corridor.members.join('\u0000');
    const longer = coveredBy.get(key) ?? [];
    if (!longer.some((stops) => corridor.stopIds.every((stop) => stops.has(stop)))) {
      kept.push(corridor);
      longer.push(new Set(corridor.stopIds));
      coveredBy.set(key, longer);
    }
  }
  kept.sort((a, b) => a.order - b.order);

  const corridors = [];
  for (const { members, stopIds } of kept) {
    const measured = measure(members, stopIds, byRoute);
    if (!measured) continue;
    const headwayMinutes = minutesOf(measured.headway);
    const ordered = members
      .map((route) => {
        const own = measured.own.get(route) ?? [];
        return {
          route,
          shortName: shortNames.get(route) ?? route,
          headwayMinutes: own.length ? minutesOf(Math.max(...own)) : null,
        };
      })
      .sort((a, b) => compareRoutes(a.shortName, b.shortName));
    corridors.push({
      id: corridorId(members, stopIds),
      members: ordered,
      stopIds,
      headwayMinutes,
      tier: tierOf(headwayMinutes),
    });
  }
  return corridors;
}

// One route's stops, patterns, and departures.
function routeData(id, tripRows, timeRows, allowed) {
  const direction = new Map();
  for (const trip of tripRows ?? []) {
    if (trip == null) continue;
    if (typeof trip === 'object') {
      const key = trip.trip ?? trip.trip_id ?? trip.tripId ?? trip.id;
      if (key != null) direction.set(String(key), String(trip.direction ?? trip.direction_id ?? 0));
    } else {
      direction.set(String(trip), '0');
    }
  }

  const byTrip = new Map();
  for (const raw of timeRows ?? []) {
    const row = stopTimeOf(raw);
    if (!row || !Number.isFinite(row.time)) continue;
    if (allowed && !allowed.has(row.stop)) continue;
    let rows = byTrip.get(row.trip);
    if (!rows) byTrip.set(row.trip, (rows = []));
    rows.push(row);
  }

  const departures = new Map();
  const stops = new Set();
  const patterns = [];
  const seen = new Set();
  // Trips named by tripsByRoute come first, so a contract's order wins.
  const order = [...direction.keys(), ...[...byTrip.keys()].filter((trip) => !direction.has(trip))];
  for (const trip of order) {
    const rows = byTrip.get(trip);
    if (!rows?.length) continue;
    const sorted = rows.every((row) => row.seq != null) ? [...rows].sort((a, b) => a.seq - b.seq) : rows;

    const pattern = [];
    for (const row of sorted) {
      if (pattern.at(-1) !== row.stop) pattern.push(row.stop);
      stops.add(row.stop);
      if (!row.boards) continue;
      let at = departures.get(row.stop);
      if (!at) departures.set(row.stop, (at = []));
      at.push({ time: row.time, direction: direction.get(trip) ?? '0' });
    }
    if (pattern.length < MIN_STOPS) continue;
    const key = pattern.join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push(pattern);
  }

  return { stops, patterns, departures };
}

// Maximal runs of consecutive stops served by the same set of routes.
function runsOf(stops, sets) {
  const runs = [];
  for (let i = 0; i < stops.length; i++) {
    const last = runs.at(-1);
    if (last && sameMembers(last.members, sets[i])) last.stops.push(stops[i]);
    else runs.push({ members: [...sets[i]], stops: [stops[i]] });
  }
  return runs;
}

// Fold runs too short to be a corridor into a neighbor they have members in
// common with: a route that touches one stop of a shared street splits it in
// the sequence, but not on the ground.
function mergeShort(runs) {
  const out = runs.map((run) => ({ members: [...run.members], stops: [...run.stops] }));
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      if (out[i].stops.length >= MIN_STOPS) continue;
      if (!mergeInto(out, i)) continue;
      coalesce(out);
      changed = true;
      break;
    }
  }
  coalesce(out);
  return out;
}

// Joining a run back up leaves its neighbors with the same members.
function coalesce(runs) {
  for (let i = runs.length - 1; i > 0; i--) {
    if (!sameMembers(runs[i].members, runs[i - 1].members)) continue;
    runs[i - 1].stops.push(...runs[i].stops);
    runs.splice(i, 1);
  }
}

function mergeInto(runs, i) {
  const short = runs[i];
  let best = null;
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j >= runs.length) continue;
    const common = commonMembers(short.members, runs[j].members);
    if (common.length < 2) continue;
    const score = [common.length, runs[j].stops.length];
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) {
      best = { j, common, score };
    }
  }
  if (!best) return false;
  const into = runs[best.j];
  if (best.j < i) into.stops.push(...short.stops);
  else into.stops.unshift(...short.stops);
  into.members = best.common;
  runs.splice(i, 1);
  return true;
}

// Measures a corridor at every shared stop and direction: the combined
// headway in seconds and each member's own. Returns null if the routes don't
// interleave. The least frequent stop and direction sets the corridor's figure.
function measure(members, stopIds, byRoute) {
  const combined = [];
  const own = new Map(members.map((route) => [route, []]));
  for (const stop of stopIds) {
    const byDirection = new Map();
    for (const route of members) {
      for (const departure of byRoute.get(route).departures.get(stop) ?? []) {
        let byRouteAtStop = byDirection.get(departure.direction);
        if (!byRouteAtStop) byDirection.set(departure.direction, (byRouteAtStop = new Map()));
        let times = byRouteAtStop.get(route);
        if (!times) byRouteAtStop.set(route, (times = []));
        times.push(departure.time);
      }
    }
    for (const byRouteAtStop of byDirection.values()) {
      for (const [route, times] of byRouteAtStop) {
        if (times.length < 2) continue;
        const headway = median(gapsOf(times.sort((a, b) => a - b)));
        if (headway > 0) own.get(route).push(headway);
      }
      if (byRouteAtStop.size < 2) continue;
      const times = [...byRouteAtStop.values()].flat().sort((a, b) => a - b);
      if (times.length < MIN_DEPARTURES) continue;
      const gaps = gapsOf(times);
      const headway = median(gaps);
      if (!(headway > 0)) return null;
      if (Math.max(...gaps) > headway * (1 + SLACK)) return null;
      combined.push(headway);
    }
  }
  if (!combined.length) return null;
  return { headway: Math.max(...combined), own };
}

const gapsOf = (times) => times.slice(1).map((time, i) => time - times[i]);

// A stable feature id: same routes between the same stops, same id, build
// after build. Member order is presentation, so it doesn't enter the id; the
// hash keeps two stretches that share their ends apart.
const corridorId = (members, stopIds) => {
  const routes = [...members].sort();
  return `corridor:${routes.join('+')}:${stopIds[0]}-${stopIds.at(-1)}:${hash(`${routes.join('+')}|${stopIds.join('>')}`)}`;
};

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Headways are whole minutes, as route headways are: "every 15" is what a
// rider reads, and the tier boundaries are whole minutes too.
const minutesOf = (seconds) => Math.round(seconds / 60);

// Route numbers ascending, numbers before names, then digit runs compared as
// numbers so 7 comes before 15 and FF1 before FF10.
function compareRoutes(a, b) {
  const numberA = /^\d+$/.test(a) ? Number(a) : null;
  const numberB = /^\d+$/.test(b) ? Number(b) : null;
  if (numberA != null && numberB != null) return numberA - numberB;
  if (numberA != null) return -1;
  if (numberB != null) return 1;
  const chunksA = a.match(/\d+|\D+/g) ?? [];
  const chunksB = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(chunksA.length, chunksB.length); i++) {
    if (/^\d+$/.test(chunksA[i]) && /^\d+$/.test(chunksB[i])) {
      const difference = Number(chunksA[i]) - Number(chunksB[i]);
      if (difference) return difference;
    } else if (chunksA[i] !== chunksB[i]) {
      return chunksA[i] < chunksB[i] ? -1 : 1;
    }
  }
  return chunksA.length - chunksB.length;
}

function stopTimeOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const trip = raw.trip ?? raw.trip_id ?? raw.tripId;
  const stop = raw.stop ?? raw.stop_id ?? raw.stopId;
  const time = raw.time ?? raw.departure ?? raw.departure_time ?? raw.departureTime;
  if (trip == null || stop == null || time == null) return null;
  const seq = raw.seq ?? raw.stop_sequence ?? raw.stopSequence;
  const pickup = raw.pickup_type ?? raw.pickupType ?? raw.pickup;
  return {
    trip: String(trip),
    stop: String(stop),
    time: secondsOf(time),
    seq: seq == null ? null : Number(seq),
    boards: pickup == null || String(pickup) !== '1',
  };
}

function secondsOf(time) {
  if (typeof time === 'number') return time;
  const text = String(time).trim();
  if (!text) return NaN;
  const [hours, minutes, seconds] = text.split(':').map(Number);
  return hours * 3600 + minutes * 60 + (seconds || 0);
}

// The bus tiers, from `tierOf` in gtfs.mjs.
const tierOf = (minutes) => {
  if (minutes <= 15) return 'frequent';
  if (minutes <= 30) return 'every30';
  if (minutes <= 60) return 'hourly';
  return 'infrequent';
};

const idOf = (value) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const id = value?.route ?? value?.id ?? value?.stop ?? value?.stopId;
  return id == null ? null : String(id);
};

const shortNameOf = (value) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const name = value?.shortName ?? value?.name ?? value?.route_short_name;
  return name == null ? null : String(name);
};

const listOf = (container, key) => (container instanceof Map ? container.get(key) : container?.[key]) ?? [];

const sameMembers = (a, b) => a.length === b.length && a.every((member, i) => member === b[i]);

const commonMembers = (a, b) => a.filter((member) => b.includes(member));

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[middle - 1] + sorted[middle]) / 2;
};
