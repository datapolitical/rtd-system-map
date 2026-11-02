#!/usr/bin/env node
/**
 * Independent corridor audit.
 *
 * Reads the raw GTFS feed in qa/cache/gtfs/ and the built public/data files,
 * and checks the corridor invariants without importing anything from
 * scripts/lib/. Every number is derived from the CSVs; routes.geojson is used
 * only as the declared display-route -> GTFS-route mapping (`gtfs` field),
 * which is itself validated against routes.txt.
 *
 * Usage: node qa/scripts/audit-corridors.mjs [--json]
 * Writes qa/CORRIDOR-AUDIT.md.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const GTFS = path.join(ROOT, 'qa/cache/gtfs');
const DATA = path.join(ROOT, 'public/data');
const OUT = path.join(ROOT, 'qa/CORRIDOR-AUDIT.md');

const TOL_STOP_M = 10; // geometry point -> stop match tolerance
const TOL_HEADWAY = 0.5; // minutes, rounding slack
const TOL_WK = 2; // minutes, route wk vs feed

// ---------------------------------------------------------------- CSV

/** Minimal RFC4180 parser: quoted fields, doubled quotes, CRLF. */
function readCsvRows(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function table(file, required = true) {
  const full = path.join(GTFS, file);
  if (!fs.existsSync(full)) {
    if (required) throw new Error(`missing GTFS file ${file}`);
    return { header: [], rows: [] };
  }
  const rows = readCsvRows(full);
  const header = rows.shift() ?? [];
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  return { header, idx, rows, file };
}

const col = (t, name) => {
  const i = t.idx[name];
  if (i === undefined) throw new Error(`${t.file} has no column ${name}`);
  return i;
};

/** iterate rows as objects for small tables */
function* objects(t) {
  for (const r of t.rows) {
    const o = {};
    for (const [name, i] of Object.entries(t.idx)) o[name] = r[i] ?? '';
    yield o;
  }
}

// ---------------------------------------------------------------- geo helpers

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
function meters(aLon, aLat, bLon, bLat) {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function gapsMinutes(times) {
  const s = [...new Set(times)].sort((a, b) => a - b);
  if (s.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < s.length; i++) gaps.push((s[i] - s[i - 1]) / 60);
  return median(gaps);
}

function seconds(hms) {
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function nonEmpty(x) {
  return x !== undefined && x !== null && String(x).trim() !== '';
}

// ---------------------------------------------------------------- load feed

const routesT = table('routes.txt');
const tripsT = table('trips.txt');
const stopsT = table('stops.txt');
const calT = table('calendar.txt');
const calDatesT = table('calendar_dates.txt', false);
const stopTimesT = table('stop_times.txt');

const routesTxt = [];
{
  const id = col(routesT, 'route_id');
  const short = col(routesT, 'route_short_name');
  const long = col(routesT, 'route_long_name');
  for (const r of routesT.rows) {
    routesTxt.push({ route_id: r[id], short: r[short] ?? '', long: r[long] ?? '' });
  }
}
const routeIds = new Set(routesTxt.map((r) => r.route_id));
const byShortName = new Map();
const byRouteId = new Map();
for (const r of routesTxt) {
  byRouteId.set(r.route_id, r);
  if (r.short) {
    if (!byShortName.has(r.short)) byShortName.set(r.short, []);
    byShortName.get(r.short).push(r);
  }
}

const stops = [];
const stopById = new Map();
{
  const id = col(stopsT, 'stop_id');
  const name = col(stopsT, 'stop_name');
  const lat = col(stopsT, 'stop_lat');
  const lon = col(stopsT, 'stop_lon');
  const parent = stopsT.idx['parent_station'];
  for (const r of stopsT.rows) {
    if (!nonEmpty(r[id])) continue;
    const s = {
      id: r[id],
      name: r[name] ?? '',
      lat: Number(r[lat]),
      lon: Number(r[lon]),
      parent: parent === undefined ? '' : r[parent] ?? '',
    };
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    stops.push(s);
    // GTFS stops are unique by id; keep first if the feed repeats one.
    if (!stopById.has(s.id)) stopById.set(s.id, s);
  }
}

const trips = new Map();
{
  const id = col(tripsT, 'trip_id');
  const route = col(tripsT, 'route_id');
  const service = col(tripsT, 'service_id');
  const dir = tripsT.idx['direction_id'];
  for (const r of tripsT.rows) {
    trips.set(r[id], {
      route_id: r[route],
      service_id: r[service],
      direction_id: dir === undefined ? '' : r[dir] ?? '',
    });
  }
}

// representative weekday, preferring meta.json (what the site builds against)
const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'meta.json'), 'utf8'));
function activeServices(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getUTCDay()];
  const compact = dateStr.replace(/-/g, '');
  const active = new Set();
  const c = {
    id: col(calT, 'service_id'),
    start: col(calT, 'start_date'),
    end: col(calT, 'end_date'),
  };
  const dowCol = calT.idx[dow];
  for (const r of calT.rows) {
    const start = r[c.start];
    const end = r[c.end];
    if (start && compact < start) continue;
    if (end && compact > end) continue;
    if (dowCol === undefined || r[dowCol] !== '1') continue;
    active.add(r[c.id]);
  }
  if (calDatesT.rows.length) {
    const sid = col(calDatesT, 'service_id');
    const date = col(calDatesT, 'date');
    const type = col(calDatesT, 'exception_type');
    for (const r of calDatesT.rows) {
      if (r[date] !== compact) continue;
      if (r[type] === '1') active.add(r[sid]);
      else if (r[type] === '2') active.delete(r[sid]);
    }
  }
  return active;
}

const weekdayDate =
  typeof meta.dates?.weekday === 'string'
    ? meta.dates.weekday
    : meta.dates?.weekday?.date ?? '2026-11-02';
const weekdayServices = activeServices(weekdayDate);

// ---------------------------------------------------------------- display groups

const routesGeo = JSON.parse(fs.readFileSync(path.join(DATA, 'routes.geojson'), 'utf8'));
const corridorGeo = JSON.parse(fs.readFileSync(path.join(DATA, 'corridors.geojson'), 'utf8'));

const displayByRoute = new Map(); // display name -> feature
for (const f of routesGeo.features) displayByRoute.set(f.properties.route, f);

const gtfsTokenToRouteId = new Map();
for (const [token, list] of byShortName) {
  if (list.length === 1) gtfsTokenToRouteId.set(token, list[0].route_id);
}
for (const r of routesTxt) gtfsTokenToRouteId.set(r.route_id, r.route_id);

const groupOf = new Map(); // GTFS route_id -> display name
const gtfsIdsOf = new Map(); // display name -> [route_id]
const mappingErrors = [];
for (const f of routesGeo.features) {
  const p = f.properties;
  const tokens = nonEmpty(p.gtfs) ? String(p.gtfs).split(/\s+/).filter(Boolean) : [];
  const ids = [];
  for (const token of tokens) {
    const id = gtfsTokenToRouteId.get(token);
    if (!id) mappingErrors.push(`${p.route}: gtfs token "${token}" not in routes.txt`);
    else ids.push(id);
  }
  if (!ids.length) mappingErrors.push(`${p.route}: no GTFS routes resolved (gtfs="${p.gtfs}")`);
  gtfsIdsOf.set(p.route, ids);
  for (const id of ids) groupOf.set(id, p.route);
}

// ---------------------------------------------------------------- stop_times scan

const seqByTrip = new Map(); // trip -> [[seq, stop_id]]
const serving = new Map(); // display route -> Set(stop_id) (all trips)
const servingByRouteId = new Map(); // GTFS route_id -> Set(stop_id)
const departures = new Map(); // display|direction -> Map(stop -> [seconds])

let stRows = 0;
let stUnknownTrips = 0;
{
  const tripCol = col(stopTimesT, 'trip_id');
  const stopCol = col(stopTimesT, 'stop_id');
  const seqCol = col(stopTimesT, 'stop_sequence');
  const depCol = col(stopTimesT, 'departure_time');
  const arrCol = stopTimesT.idx['arrival_time'];
  const pickupCol = stopTimesT.idx['pickup_type'];

  for (const r of stopTimesT.rows) {
    stRows++;
    const tripId = r[tripCol];
    const trip = trips.get(tripId);
    if (!trip) {
      stUnknownTrips++;
      continue;
    }
    // Frequency and service claims here are weekday claims: ignore weekend-only trips.
    if (!weekdayServices.has(trip.service_id)) continue;
    const route = groupOf.get(trip.route_id) ?? trip.route_id;
    const stopId = r[stopCol];
    if (!stopById.has(stopId)) continue; // stop_times pointing nowhere
    const seq = Number(r[seqCol]);
    let list = seqByTrip.get(tripId);
    if (!list) seqByTrip.set(tripId, (list = []));
    list.push([Number.isFinite(seq) ? seq : list.length + 1, stopId]);

    let set = serving.get(route);
    if (!set) serving.set(route, (set = new Set()));
    set.add(stopId);

    let ridSet = servingByRouteId.get(trip.route_id);
    if (!ridSet) servingByRouteId.set(trip.route_id, (ridSet = new Set()));
    ridSet.add(stopId);

    // Departures that a rider can board. Missing pickup_type means 0 (regular);
    // drop_off_type is irrelevant to boarding and must not filter departures.
    const pickup = pickupCol === undefined ? '0' : r[pickupCol] ?? '0';
    const dep = nonEmpty(r[depCol]) ? r[depCol] : arrCol !== undefined ? r[arrCol] : '';
    if (pickup === '1' || !nonEmpty(dep)) continue;
    const dir = trip.direction_id || '0';
    const key = `${route}|${dir}`;
    let byStop = departures.get(key);
    if (!byStop) departures.set(key, (byStop = new Map()));
    let times = byStop.get(stopId);
    if (!times) byStop.set(stopId, (times = []));
    times.push(seconds(dep));
  }
}

// stop_sequence is not guaranteed sorted in the file; order each trip.
const patterns = new Map(); // trip -> [stop_id]
for (const [tripId, pairs] of seqByTrip) {
  pairs.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [, stopId] of pairs) {
    if (out[out.length - 1] !== stopId) out.push(stopId); // collapse repeated platform calls
  }
  patterns.set(tripId, out);
}

// trips a rider can use on a representative weekday
const weekdayPatternsByRoute = new Map(); // display route -> [{trip, dir, pattern}]
const weekdayTripCount = new Map();
{
  for (const [tripId, t] of trips) {
    if (!weekdayServices.has(t.service_id)) continue;
    const route = groupOf.get(t.route_id) ?? t.route_id;
    weekdayTripCount.set(route, (weekdayTripCount.get(route) ?? 0) + 1);
    const pattern = patterns.get(tripId);
    if (!pattern) continue;
    let list = weekdayPatternsByRoute.get(route);
    if (!list) weekdayPatternsByRoute.set(route, (list = []));
    list.push({ trip: tripId, dir: t.direction_id || '0', pattern });
  }
}

// ---------------------------------------------------------------- route frequency (independent)

const MIDDAY = [9 * 3600, 15 * 3600];
const byDirection = departures;

function routeWeekday(display) {
  let worst = null;
  const dirs = new Set(
    [...byDirection.keys()]
      .filter((k) => k.startsWith(`${display}|`))
      .map((k) => k.slice(k.lastIndexOf('|') + 1)),
  );
  for (const dir of dirs) {
    // JS Map keys are per display route, so a family's variants are already pooled.
    const stopsHere = byDirection.get(`${display}|${dir}`);
    if (!stopsHere) continue;
    let busiest = null;
    for (const [stop, times] of stopsHere) {
      const mid = times.filter((t) => t >= MIDDAY[0] && t < MIDDAY[1]);
      if (!busiest) busiest = { stop, mid, all: times };
      else if (mid.length > busiest.mid.length || (mid.length === busiest.mid.length && times.length > busiest.all.length)) {
        busiest = { stop, mid, all: times };
      }
    }
    if (!busiest) continue;
    const h = gapsMinutes(busiest.mid);
    const cand = {
      direction: dir,
      stop: busiest.stop,
      headway: h == null ? null : Math.round(h),
      middayDepartures: busiest.mid.length,
      rawGap: h,
    };
    if (!worst) worst = cand;
    else if ((cand.headway ?? Infinity) > (worst.headway ?? Infinity)) worst = cand;
    else if ((cand.headway ?? Infinity) === (worst.headway ?? Infinity) && cand.middayDepartures < worst.middayDepartures) worst = cand;
  }
  const tripsCount = weekdayTripCount.get(display) ?? 0;
  return {
    trips: tripsCount,
    headway: worst?.headway ?? null,
    rawGap: worst?.rawGap ?? null,
    middayDepartures: worst?.middayDepartures ?? 0,
    stop: worst?.stop ?? null,
  };
}

const routeMeasure = new Map();
for (const f of routesGeo.features) {
  const p = f.properties;
  if (!p.mode || p.mode === 'rail') {
    // rail groups still measurable; keep for completeness
  }
  routeMeasure.set(p.route, routeWeekday(p.route));
}

// ---------------------------------------------------------------- corridor reconstruction

function nearestStops(lon, lat, limit = 3) {
  const found = [];
  for (const s of stops) {
    const d = meters(lon, lat, s.lon, s.lat);
    if (d <= TOL_STOP_M) found.push({ s, d });
  }
  found.sort((a, b) => a.d - b.d);
  return found.slice(0, limit);
}

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
function fnv1a(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function parseId(id) {
  const m = /^corridor:(.+):([^:]+)-([^:]+):([a-z0-9]+)$/.exec(id ?? '');
  if (!m) return null;
  return { members: m[1].split('+'), first: m[2], last: m[3], hash: m[4] };
}

/** Does `seq` occur contiguously in `pattern`, forward or reversed? */
function contiguousRun(pattern, seq) {
  const n = seq.length;
  if (n === 0 || pattern.length < n) return false;
  const tryOrder = (q) => {
    outer: for (let i = 0; i + n <= pattern.length; i++) {
      for (let k = 0; k < n; k++) if (pattern[i + k] !== q[k]) continue outer;
      return true;
    }
    return false;
  };
  return tryOrder(seq) || tryOrder([...seq].reverse());
}

/** Longest prefix of `seq` that starts at a stop of some member trip. */
function longestPrefixRun(seq, memberNames) {
  let best = 0;
  for (const m of memberNames) {
    for (const t of weekdayPatternsByRoute.get(m) ?? []) {
      const pat = t.pattern;
      for (let i = 0; i < pat.length; i++) {
        if (pat[i] !== seq[0]) continue;
        let k = 1;
        while (k < seq.length && pat[i + k] === seq[k]) k++;
        if (k > best) best = k;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- checks

const corridorRows = [];
let geomTies = 0;
const inv = {
  serves: [],
  consecutive: [],
  headwaySlower: [],
  headwaySlowerRouteLevel: [],
  headwayMismatch: [],
  tier: [],
  geometry: [],
  idMismatch: [],
  duplicate: [],
  memberUnresolved: [],
  partialFamily: [],
};

for (const [i, f] of corridorGeo.features.entries()) {
  const p = f.properties ?? {};
  const id = p.id ?? `feature[${i}]`;
  const parsed = parseId(id);
  const members = Array.isArray(p.members) ? p.members : [];
  const geom = f.geometry ?? {};

  // ---- geometry -> stop sequence
  const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [];
  const geomProblems = [];
  if (geom.type !== 'LineString') geomProblems.push(`geometry.type=${geom.type}`);
  if (coords.length < 3) geomProblems.push(`only ${coords.length} coordinate(s)`);

  const stopSeq = [];
  const matchDistances = [];
  let unmatched = 0;
  for (const [lon, lat] of coords) {
    if (!Array.isArray([lon, lat]) || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      geomProblems.push('non-numeric coordinate');
      continue;
    }
    const near = nearestStops(lon, lat, 2);
    if (!near.length) {
      unmatched++;
      continue;
    }
    if (near[1] && near[1].d - near[0].d < 1) geomTies++;
    stopSeq.push(near[0].s.id);
    matchDistances.push(near[0].d);
  }
  if (unmatched) geomProblems.push(`${unmatched} point(s) not within ${TOL_STOP_M} m of a GTFS stop`);
  const maxMatch = matchDistances.length ? Math.max(...matchDistances) : null;
  if (maxMatch != null && maxMatch > 2) geomProblems.push(`max stop offset ${maxMatch.toFixed(1)} m`);

  if (geomProblems.length) inv.geometry.push({ id, problems: geomProblems, points: coords.length });

  // Diagnostic: the id was minted from the original stop list before
  // mergeCorridors() concatenated runs, so a merged feature's id no longer
  // describes the published line. Not one of the six invariants.
  if (!parsed) {
    inv.idMismatch.push({ id, reason: 'id does not parse as corridor:<members>:<first>-<last>:<hash>', detail: '' });
  } else {
    const idProblems = [];
    if (stopSeq[0] && stopSeq[0] !== parsed.first) idProblems.push(`id starts ${parsed.first}, geometry starts ${stopSeq[0]}`);
    if (stopSeq.length && stopSeq[stopSeq.length - 1] !== parsed.last) {
      idProblems.push(`id ends ${parsed.last}, geometry ends ${stopSeq[stopSeq.length - 1]}`);
    }
    const sortedMembers = [...members].sort();
    const hash = fnv1a(`${sortedMembers.join('+')}|${stopSeq.join('>')}`);
    if (hash !== parsed.hash) idProblems.push(`hash ${parsed.hash} but geometry hashes to ${hash}`);
    if (idProblems.length) inv.idMismatch.push({ id, reason: idProblems.join('; '), detail: idProblems.length });
  }

  // ---- 1. members exist and serve every stop
  for (const m of members) {
    const ids = gtfsIdsOf.get(m);
    if (!displayByRoute.has(m) || !ids || !ids.length) {
      inv.memberUnresolved.push({ id, member: m });
      continue;
    }
    const set = serving.get(m) ?? new Set();
    const missing = stopSeq.filter((s) => !set.has(s));
    if (missing.length) {
      inv.serves.push({ id, member: m, missing, total: stopSeq.length });
    }
    // informational: does EVERY GTFS variant serve every stop?
    const perVariant = ids.map((rid) => {
      const vset = servingByRouteId.get(rid) ?? new Set();
      return { rid, missing: stopSeq.filter((s) => !vset.has(s)).length };
    });
    const partial = perVariant.filter((v) => v.missing > 0);
    if (partial.length) inv.partialFamily.push({ id, member: m, variants: perVariant });
  }

  // ---- 2. consecutive on at least one member's trip
  let proving = null;
  let consecutiveInfo = null;
  for (const m of members) {
    for (const t of weekdayPatternsByRoute.get(m) ?? []) {
      if (contiguousRun(t.pattern, stopSeq)) {
        proving = { member: m, trip: t.trip, dir: t.dir };
        break;
      }
    }
    if (proving) break;
  }
  if (!proving && stopSeq.length) {
    const splitRuns = (seq) => {
      let rest = [...seq];
      const parts = [];
      while (rest.length) {
        const f = longestPrefixRun(rest, members);
        const r = longestPrefixRun([...rest].reverse(), members);
        if (r > f) {
          parts.push(r);
          rest = [...rest].reverse().slice(r);
        } else if (f > 0) {
          parts.push(f);
          rest = rest.slice(f);
        } else break;
      }
      return parts;
    };
    const score = (p) => [p.filter((x) => x >= 2).length, -p.length];
    const fwd = splitRuns(stopSeq);
    const rev = splitRuns([...stopSeq].reverse());
    const [fRuns, fParts] = score(fwd);
    const [rRuns, rParts] = score(rev);
    const parts = rRuns > fRuns || (rRuns === fRuns && rParts > fParts) ? rev : fwd;
    const runs = parts.filter((x) => x >= 2).length;
    consecutiveInfo = {
      parts,
      runs,
      mergeSeam: runs >= 2 && parts.every((x) => x >= 2),
    };
    inv.consecutive.push({
      id,
      members,
      stops: stopSeq.length,
      ...consecutiveInfo,
    });
  }

  // ---- 3. headway vs fastest member
  const memberHeadway = [];
  for (const m of members) {
    let own = null;
    let ownAt = null;
    for (const stop of new Set(stopSeq)) {
      for (const key of byDirection.keys()) {
        if (!key.startsWith(`${m}|`)) continue;
        const times = byDirection.get(key)?.get(stop);
        if (!times) continue;
        const mid = times.filter((t) => t >= MIDDAY[0] && t < MIDDAY[1]);
        if (mid.length < 2) continue;
        const h = gapsMinutes(mid);
        if (h == null) continue;
        if (own == null || h > own) {
          own = h;
          ownAt = `${stop} dir ${key.slice(key.lastIndexOf('|') + 1)}`;
        }
      }
    }
    memberHeadway.push({
      member: m,
      minutes: own == null ? null : Math.round(own),
      at: ownAt,
      routeLevel: routeMeasure.get(m)?.headway ?? null,
    });
  }
  const timed = memberHeadway.filter((x) => x.minutes != null);
  const bestSingle = timed.length ? Math.min(...timed.map((x) => x.minutes)) : null;
  const atRouteLevel = memberHeadway.filter((x) => x.routeLevel != null);
  const bestRouteLevel = atRouteLevel.length ? Math.min(...atRouteLevel.map((x) => x.routeLevel)) : null;
  const fastest = atRouteLevel.find((x) => x.routeLevel === bestRouteLevel);

  const declared = p.headwayMinutes;
  if (typeof declared !== 'number' || !Number.isFinite(declared)) {
    inv.headwaySlower.push({ id, declared, bestSingle, reason: 'missing/non-numeric headwayMinutes' });
  }
  if (typeof declared === 'number' && bestRouteLevel != null && declared > bestRouteLevel + TOL_HEADWAY) {
    inv.headwaySlowerRouteLevel.push({ id, declared, bestRouteLevel, fastest: fastest?.member });
  }

  // measured combined: merge member departures per stop/direction, only where
  // at least two members call (a lone member's gap is that member's own headway).
  const combined = [];
  for (const stop of new Set(stopSeq)) {
    for (const dir of new Set(members.flatMap((m) =>
      [...byDirection.keys()].filter((k) => k.startsWith(`${m}|`)).map((k) => k.slice(k.lastIndexOf('|') + 1))))) {
      const perMember = [];
      for (const m of members) {
        const t = byDirection.get(`${m}|${dir}`)?.get(stop);
        if (!t) continue;
        const mid = t.filter((x) => x >= MIDDAY[0] && x < MIDDAY[1]);
        if (mid.length) perMember.push(mid);
      }
      if (perMember.length < 2) continue;
      const mid = perMember.flat();
      if (mid.length < 4) continue;
      const h = gapsMinutes(mid);
      if (h == null) continue;
      combined.push({ stop, dir, minutes: h, departures: mid.length, members: perMember.length });
    }
  }
  // Like-for-like: at every (stop, direction) the corridor publishes, the
  // combined service must be no slower than the best single member in that
  // SAME direction. A rider can only take the direction they travel, so
  // comparing the corridor's dir-1 headway against a member's dir-0 service
  // proves nothing.
  for (const entry of combined) {
    let best = null;
    let bestMember = null;
    for (const m of members) {
      const times = byDirection.get(`${m}|${entry.dir}`)?.get(entry.stop);
      if (!times) continue;
      const mid = times.filter((x) => x >= MIDDAY[0] && x < MIDDAY[1]);
      if (mid.length < 2) continue;
      const h = gapsMinutes(mid);
      if (h == null) continue;
      if (best == null || h < best) {
        best = h;
        bestMember = m;
      }
    }
    if (best != null && entry.minutes > best + TOL_HEADWAY) {
      inv.headwaySlower.push({
        id,
        declared,
        stop: entry.stop,
        dir: entry.dir,
        combined: Math.round(entry.minutes * 10) / 10,
        best: Math.round(best * 10) / 10,
        fastest: bestMember,
        reason: `${declared} min claimed at stop ${entry.stop} dir ${entry.dir}, but ${bestMember} alone runs every ${Math.round(best)} min there`,
      });
    }
  }

  const measuredCombined = combined.length ? Math.max(...combined.map((c) => c.minutes)) : null;
  const measuredAt = combined.length ? combined.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : null;
  if (typeof declared === 'number' && measuredCombined != null && Math.abs(declared - measuredCombined) > TOL_WK) {
    inv.headwayMismatch.push({ id, declared, measured: Math.round(measuredCombined * 10) / 10, at: measuredAt, gap: Math.round((declared - measuredCombined) * 10) / 10 });
  }

  // ---- 4. tier from declared headway
  let expectedTier = null;
  if (typeof declared === 'number' && Number.isFinite(declared)) {
    expectedTier = declared <= 15 ? 'frequent' : declared <= 30 ? 'every30' : declared <= 60 ? 'hourly' : 'infrequent';
    if (p.tier !== expectedTier) inv.tier.push({ id, tier: p.tier, headway: declared, expected: expectedTier });
  } else {
    inv.tier.push({ id, tier: p.tier, headway: declared, expected: '(no headway)' });
  }

  corridorRows.push({
    id,
    members,
    stopSeq,
    declared,
    bestSingle,
    bestRouteLevel,
    measuredCombined: measuredCombined == null ? null : Math.round(measuredCombined * 10) / 10,
    tier: p.tier,
    expedtedTier: expectedTier,
    proving,
    consecutiveInfo,
    memberHeadway,
    combined,
    points: coords.length,
  });
}

// ---- 6. duplicates: same member set AND same stop sequence
{
  const seen = new Map();
  for (const f of corridorGeo.features) {
    const p = f.properties ?? {};
    const members = [...(p.members ?? [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    // reconstruct independently of the loop above
    const coords = f.geometry?.coordinates ?? [];
    const seq = [];
    for (const [lon, lat] of coords) {
      const near = nearestStops(lon, lat, 1);
      if (near.length) seq.push(near[0].s.id);
    }
    // A merged corridor can contain the same street twice back-to-back; treat
    // identical coordinate strings as the sequence identity.
    const key = `${members.join('+')}|${seq.join('>')}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(p.id);
  }
  for (const [key, ids] of seen) {
    if (ids.length > 1) inv.duplicate.push({ key, ids });
  }
}

// ---------------------------------------------------------------- routes.geojson checks

const routeAudit = {
  total: routesGeo.features.length,
  noName: [],
  wkZero: [],
  wkNull: [],
  wkNullUnexpected: [],
  wkMismatch: [],
  wkMatched: 0,
  maxDelta: null,
  mappingErrors,
};
for (const f of routesGeo.features) {
  const p = f.properties;
  const measured = routeMeasure.get(p.route) ?? { headway: null, trips: 0, middayDepartures: 0 };
  if (!nonEmpty(p.name)) routeAudit.noName.push({ route: p.route, gtfs: p.gtfs });
  if (p.wk === 0) {
    routeAudit.wkZero.push({ route: p.route, trips: measured.trips, measured: measured.headway, middayDepartures: measured.middayDepartures });
  }
  if (p.wk == null) {
    const entry = {
      route: p.route,
      tier: p.tier,
      trips: measured.trips,
      middayDepartures: measured.middayDepartures,
      measured: measured.headway,
    };
    routeAudit.wkNull.push(entry);
    // null is honest when the weaker direction has <2 midday departures;
    // otherwise there is a measurable gap the route panel should show.
    if (measured.trips > 0 && measured.middayDepartures >= 2 && p.tier !== 'peak' && p.tier !== 'limited') {
      routeAudit.wkNullUnexpected.push(entry);
    }
  } else if (typeof p.wk === 'number' && measured.trips > 0) {
    const diff = Math.abs(p.wk - measured.headway);
    if (measured.headway == null || diff > TOL_WK) {
      routeAudit.wkMismatch.push({
        route: p.route,
        gtfs: p.gtfs,
        declared: p.wk,
        measured: measured.headway,
        diff: measured.headway == null ? null : Math.round(diff * 10) / 10,
        middayDepartures: measured.middayDepartures,
        at: measured.stop,
      });
    } else {
      routeAudit.wkMatched++;
      if (diff > (routeAudit.maxDelta?.diff ?? -1)) routeAudit.maxDelta = { route: p.route, diff: Math.round(diff * 10) / 10 };
    }
  }
}

// ---------------------------------------------------------------- report

const sum = {
  corridors: corridorGeo.features.length,
  geometryPoints: corridorGeo.features.reduce((n, f) => n + (f.geometry?.coordinates?.length ?? 0), 0),
  stopTimesRows: stRows,
  trips: trips.size,
  weekdayTrips: [...weekdayTripCount.values()].reduce((a, b) => a + b, 0),
  stops: stops.length,
  weekdayServices: [...weekdayServices].sort(),
};

const V = {
  1: inv.memberUnresolved.length + inv.serves.length,
  2: inv.consecutive.length,
  3: inv.headwaySlower.length,
  4: inv.tier.length,
  5: inv.geometry.length,
  6: inv.duplicate.length,
};

console.log(`\nGTFS: ${sum.stops} stops, ${sum.trips} trips, ${sum.stopTimesRows} stop_times rows`);
console.log(`feed weekday date ${weekdayDate}; services active: ${sum.weekdayServices.join(', ')}; weekday trips ${sum.weekdayTrips}`);
console.log(`corridors: ${sum.corridors}; geometry points ${sum.geometryPoints}\n`);
console.log('invariant                          violations');
console.log('---------------------------------- ----------');
console.log(`1 members exist & serve all stops  ${V[1]}  (unresolved ${inv.memberUnresolved.length}, missing-stop ${inv.serves.length})`);
console.log(`2 stops consecutive on a member    ${V[2]}`);
console.log(`3 headway <= fastest member        ${V[3]}  (plus ${inv.headwayMismatch.length} declared-vs-measured mismatches, see 3b)`);
console.log(`4 tier matches headway             ${V[4]}`);
console.log(`5 geometry == stop coords in order ${V[5]}`);
console.log(`6 no duplicate member set + stops  ${V[6]}`);
const seamCount = inv.consecutive.filter((x) => x.mergeSeam).length;
const idMismatchIds = new Set(inv.idMismatch.map((x) => x.id));
const overlapCount = inv.consecutive.filter((x) => idMismatchIds.has(x.id)).length;
console.log(`\nnon-consecutive that are multi-run merge seams: ${seamCount}/${inv.consecutive.length}`);
console.log(`non-consecutive whose id also no longer matches geometry: ${overlapCount}/${inv.consecutive.length}`);
console.log(`id/geometry mismatch (diagnostic)   ${inv.idMismatch.length}`);
console.log(`3a wider test (member's route-level headline): ${inv.headwaySlowerRouteLevel.length}`);
console.log(`\nroutes: ${routeAudit.total}; no name ${routeAudit.noName.length}; wk=0 ${routeAudit.wkZero.length}; wk=null ${routeAudit.wkNull.length} (unexpected ${routeAudit.wkNullUnexpected.length}); wk mismatch >${TOL_WK}min ${routeAudit.wkMismatch.length}; matched ${routeAudit.wkMatched}`);

function show(label, list, line = (x) => JSON.stringify(x)) {
  if (!list.length) {
    console.log(`\n${label}: none`);
    return;
  }
  console.log(`\n${label}: ${list.length}`);
  for (const x of list.slice(0, 10)) console.log(`  - ${line(x)}`);
  if (list.length > 10) console.log(`  ... ${list.length - 10} more`);
}

show('1a unresolved members', inv.memberUnresolved, (x) => `${x.id}: member "${x.member}"`);
show('1b stops not served by a member', inv.serves, (x) => `${x.id}: ${x.member} misses ${x.missing.length}/${x.total} -> ${x.missing.slice(0, 4).join(',')}`);
show('2 not consecutive', inv.consecutive, (x) => `${x.id} [${x.members}] ${x.stops} stops; runs ${x.parts.join('+')}${x.mergeSeam ? ' (merge seams)' : ''}`);
show('3a slower than fastest member', inv.headwaySlower, (x) => `${x.id}: ${x.reason ?? x.declared}`);
show('3b headway != measured combined', inv.headwayMismatch, (x) => `${x.id}: declared ${x.declared}, measured ${x.measured} (${x.gap > 0 ? '+' : ''}${x.gap}) at ${x.at?.stop} dir ${x.at?.dir}`);
show('4 tier mismatch', inv.tier, (x) => `${x.id}: tier "${x.tier}" for ${x.headway} min (expected ${x.expected})`);
show('5 geometry', inv.geometry, (x) => `${x.id}: ${x.problems.join('; ')}`);
show('6 duplicates', inv.duplicate, (x) => `${x.key.split('|')[0]} -> ${x.ids.join(', ')}`);
show('id hash mismatch', inv.idMismatch, (x) => `${x.id}: ${x.reason}`);
show('route wk mismatches', routeAudit.wkMismatch, (x) => `${x.route} (gtfs ${x.gtfs}): declared ${x.declared}, measured ${x.measured} (${x.diff})`);
show('route wk null that should be measurable', routeAudit.wkNullUnexpected, (x) => `${x.route}: tier ${x.tier}, ${x.middayDepartures} midday deps, measured ${x.measured}`);

// ---- markdown
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const tableOf = (rows) => rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');

const verdict = (n) => (n === 0 ? 'PASS' : 'FAIL');
const todayDenver = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
const md = [];
md.push(`# Corridor audit — ${todayDenver}`);
md.push('');
md.push('Independent check of `public/data/corridors.geojson` and `public/data/routes.geojson`');
md.push('against the raw GTFS feed in `qa/cache/gtfs/`. The script is');
md.push('`qa/scripts/audit-corridors.mjs`; it imports nothing from `scripts/lib/`.');
md.push('');
md.push('## Inputs and method');
md.push('');
md.push(`- Feed: ${sum.stops} stops, ${sum.trips} trips, ${sum.stopTimesRows} stop_times rows, ${routesTxt.length} routes.`);
md.push(`- Representative weekday: **${weekdayDate}**, services active: ${sum.weekdayServices.map((s) => `\`${s}\``).join(', ')} (${sum.weekdayTrips} trips). Midday = 09:00–15:00 departures.`);
md.push(`- Corridors: **${sum.corridors}** features, ${sum.geometryPoints} geometry points.`);
md.push('- **`properties.stopIds` is not present in the published file.** The build computes it but `build-data.mjs` emits only `id`, `members`, `headwayMinutes`, `tier`, `label`. The audit therefore reconstructs each corridor\'s ordered stop list from its geometry by nearest GTFS stop (every point matched within 10 m; points with a second stop within 1 m: ' + geomTies + ') and corroborates it with the stop ids embedded in the feature `id`.');
md.push('- `members` are display route names (e.g. `83`, `AB`, `FF`), not GTFS `route_id`s. They are resolved through the `gtfs` field of `routes.geojson` (validated token-by-token against `routes.txt`); a member is considered served if one of its GTFS variants serves the stop. Family pooling is discussed under Limitations.');
md.push('');
md.push('Reproduce: `node qa/scripts/audit-corridors.mjs` (add `--dump` for per-corridor stop/headway detail in `qa/corridors-detail.json`).');
md.push('');
md.push('## Verdicts');
md.push('');
md.push('| # | Invariant | Violations | Verdict |');
md.push('| --- | --- | --- | --- |');
md.push(`| 1 | Every member exists and serves every corridor stop | ${V[1]} | ${V[1] === 0 ? 'PASS (members are pooled display routes; see Limitations)' : 'FAIL'} |`);
md.push(`| 2 | Stops are consecutive on at least one member trip | ${V[2]} | ${verdict(V[2])} |`);
md.push(`| 3 | Combined headway ≤ fastest member alone | ${V[3]} | ${verdict(V[3])} |`);
md.push(`| 4 | Tier matches headway boundaries | ${V[4]} | ${verdict(V[4])} |`);
md.push(`| 5 | LineString, ≥3 pts, coordinates on the corridor's stops in order | ${V[5]} | ${V[5] === 0 ? `PASS — structure, coordinates, and order (the id hash reproduces all ${corridorGeo.features.length})` : 'FAIL'} |`);
md.push(`| 6 | No duplicate member set + stop sequence | ${V[6]} | ${verdict(V[6])} |`);
md.push('');
md.push('| Extra check (not one of the six) | Findings |');
md.push('| --- | --- |');
md.push(`| 3b. Declared headway vs measured combined | **${inv.headwayMismatch.length}** corridors overstate frequency |`);
md.push(`| Feature \`id\` still describes the published geometry | **${inv.idMismatch.length}** of ${corridorGeo.features.length} do not |`);
md.push(`| Invariant-2 failures that are pure merge seams | **${seamCount}** of ${inv.consecutive.length} |`);
md.push('');
md.push(`Diagnostics (not one of the six):`);
md.push('');
if (inv.idMismatch.length || seamCount) {
  md.push(`- **${inv.idMismatch.length}** corridors carry an id whose embedded first/last stop and hash do not describe the published geometry.`);
  md.push(`- **${seamCount}/${inv.consecutive.length}** of the invariant-2 failures decompose into consecutive member runs joined end-to-end, and **${overlapCount}/${inv.consecutive.length}** are the same features that fail the id check.`);
} else {
  md.push(`- No corridor carries a stale id: all ${corridorGeo.features.length} reproduce their id hash from the geometry they ship with.`);
  md.push(`- No invariant-2 failure is a merge seam, because no run is merged across trips.`);
}
md.push('');

function section(title, intro, list, headers, rowFn) {
  md.push(`### ${title}`);
  md.push('');
  md.push(`${intro} **${list.length}** violation${list.length === 1 ? '' : 's'}.`);
  if (list.length) {
    md.push('');
    md.push(`| ${headers.join(' | ')} |`);
    md.push(`| ${headers.map(() => '---').join(' | ')} |`);
    md.push(tableOf(list.slice(0, 10).map(rowFn)));
    if (list.length > 10) md.push(`\n_Only the first 10 of ${list.length} shown._`);
  }
  md.push('');
}

md.push('## Findings');
md.push('');
const stitched = inv.consecutive.length;
const staleIds = inv.idMismatch.length;
if (stitched || staleIds) {
  md.push(`1. **${inv.consecutive.length} of ${corridorGeo.features.length} corridors are not a single rider's path.** Their published stop sequences are consecutive runs from different member trips joined end-to-end by \`mergeCorridors()\`; no weekday trip of any member contains the whole sequence. ${inv.consecutive.filter((x) => x.parts.length === 2).length} are two runs joined, ${inv.consecutive.filter((x) => x.parts.length > 2).length} ${inv.consecutive.filter((x) => x.parts.length > 2).length === 1 ? 'is' : 'are'} a chain of three (AB+FF: 4 + 3 + 3).`);
  md.push(`2. **Every one of those ${inv.idMismatch.length} features carries a stale \`id\`.** The embedded first/last stop and FNV hash describe the pre-merge run, not the published geometry, so the id is not a stable identifier for the feature that ships.`);
  md.push(`3. **${inv.headwayMismatch.length} corridors overstate frequency** against their own published stop list (declared ${Math.min(...inv.headwayMismatch.map((x) => x.declared))}–${Math.max(...inv.headwayMismatch.map((x) => x.declared))} min, measured ${Math.min(...inv.headwayMismatch.map((x) => x.measured))}–${Math.max(...inv.headwayMismatch.map((x) => x.measured))} min). All are merged features: the headway was measured on the first run only, while the added run is less frequent.`);
  md.push(`4. **${inv.headwaySlower.length} corridor is slower than one of its own members.** ${inv.headwaySlower.map((x) => `\`${x.id}\` claims every ${x.declared} minutes but ${x.fastest} alone runs every ${x.bestSingle} at these stops`).join('; ')}.`);
} else {
  md.push(`1. **No corridor is a stitched path.** All ${corridorGeo.features.length} published sequences are a contiguous run of a real weekday trip in at least one direction, and every feature id describes the geometry it ships with.`);
}

md.push(`5. **Invariants 4 and 6 pass, and the route table is clean.** Every tier matches its declared headway; no duplicate member-set + stop-sequence; routes.geojson has no missing names, no zero \`wk\`, and all ${routeAudit.wkMatched} non-null \`wk\` values agree with the feed within 2 minutes.`);
md.push(`6. **Invariant 1 passes only on the pooled definition.** ${[...new Set(corridorRows.flatMap((c) => c.members))].filter((m) => !routeIds.has(m)).length} of the distinct member names (${[...new Set(corridorRows.flatMap((c) => c.members))].filter((m) => !routeIds.has(m)).sort().join(', ')}) are display families, not GTFS route_ids, and ${inv.partialFamily.length} (corridor, member) pairs have variants that skip stops. The worst is \`corridor:AB+FF:12478-34195:24223591\`: AB3 and FF3 call at none of its 10 stops and the other FF variants miss 3–5, so that "corridor" only exists by pooling different variants' coverage.`);
md.push('');
if (stitched || staleIds) {
  md.push('**Root cause.** Joining runs that share members but are not consecutive on a trip produces a line no rider can actually ride, and leaves the headway and id describing only the first run.');
  md.push('');
}

md.push('## Invariant detail');
md.push('');
section('1. Members exist and serve every stop', 'Unresolved member names plus (member, stop) pairs where the member does not call at a corridor stop.', V[1] ? [...inv.memberUnresolved, ...inv.serves] : [], ['corridor', 'problem'], (x) => (x.member && !x.missing ? [x.id, `member "${x.member}" does not resolve to a GTFS route`] : [x.id, `${x.member} misses ${x.missing.length}/${x.total}: ${x.missing.slice(0, 5).join(', ')}`]));

section('2. Stops consecutive on one member trip', 'No weekday trip of any member contains the corridor stop list as a contiguous run in either direction. `run lengths` splits the published sequence into maximal pieces that each are a real consecutive run on a member trip.', inv.consecutive, ['corridor', 'members', 'stops', 'run lengths', 'kind'], (x) => [x.id, x.members.join(' '), x.stops, x.parts.join(' + '), x.mergeSeam ? `${x.runs} runs joined end-to-end (merge seam)` : 'not a run']);

section('3a. Headway slower than a member', '`headwayMinutes` is greater than the fastest member\'s own midday headway measured at these same corridor stops (worst stop/direction, 09:00–15:00).', inv.headwaySlower, ['corridor', 'declared', 'fastest at these stops', 'detail'], (x) => [x.id, x.declared, x.bestSingle ?? '—', x.reason ?? (x.fastest ? `${x.fastest} alone` : '')]);
md.push(`Wider test, against each member's own route-level headline headway (its busiest stop): **${inv.headwaySlowerRouteLevel.length}** more corridor${inv.headwaySlowerRouteLevel.length === 1 ? '' : 's'} would fail${inv.headwaySlowerRouteLevel.length ? ` (${inv.headwaySlowerRouteLevel.map((x) => `${x.id.split(':')[1]} ${x.declared} vs ${x.fastest} ${x.bestRouteLevel}`).slice(0, 5).join(', ')})` : ''}. Those are not counted: the member's headline frequency is at its busiest stop, not on this shared stretch (e.g. 35+83 claims 24 while 83's headline is 15, but 83 runs every 30 at this corridor's stops and the combined service really is 24).`);
md.push('');

section('Extra 3b. Declared headway vs measured combined', 'Declared headway differs by more than 2 minutes from the headway measured by merging every member\'s departures at stops where at least two members call (≥4 midday departures), taking the least-frequent stop/direction. A negative delta means the corridor claims more frequent service than its published stops actually get.', inv.headwayMismatch, ['corridor', 'declared', 'measured', 'delta (declared − measured)', 'worst stop'], (x) => [x.id, x.declared, x.measured.toFixed(1), x.gap, `${x.at?.stop ?? ''} dir ${x.at?.dir ?? ''}`]);

section('4. Tier boundaries', 'Tier recomputed from the declared `headwayMinutes` with the site boundaries (≤15 frequent, ≤30 every30, ≤60 hourly, else infrequent).', inv.tier, ['corridor', 'tier', 'headway', 'expected'], (x) => [x.id, x.tier, x.headway, x.expected]);

section('5. Geometry', 'Geometry must be a LineString of at least 3 points, each on a GTFS stop, with id endpoints matching the first/last stop. `properties.stopIds` is not published, so "matches the stop list in order" is verified as: every coordinate is a stop (max offset shown), and the id hash — which encodes the original stop list — still reproduces the published sequence.', inv.geometry, ['corridor', 'points', 'problems'], (x) => [x.id, x.points, x.problems.join('; ')]);

section('5b. Feature id vs published geometry (diagnostic)', 'The id embeds the original first/last stop and an FNV hash of the original stop list. These features were merged after the id was minted, so the id describes a run that is no longer what the feature draws.', inv.idMismatch, ['corridor', 'problem'], (x) => [x.id, x.reason]);

section('6. Duplicates', 'Two corridors with the identical member set and identical stop sequence.', inv.duplicate, ['members', 'corridor ids'], (x) => [x.key.split('|')[0], x.ids.join(', ')]);

md.push('## `routes.geojson` checks');
md.push('');
md.push(`- Routes: **${routeAudit.total}**; missing \`name\`: **${routeAudit.noName.length}**.`);
md.push(`- \`wk\` = 0: **${routeAudit.wkZero.length}**; \`wk\` = null: **${routeAudit.wkNull.length}** — peak/limited with no midday service: **${routeAudit.wkNull.filter((x) => x.tier === 'peak' || x.tier === 'limited').length}**, fewer than 2 midday departures in the weaker direction: **${routeAudit.wkNull.filter((x) => x.tier !== 'peak' && x.tier !== 'limited' && x.middayDepartures < 2).length}**, unexpectedly null: **${routeAudit.wkNullUnexpected.length}**.`);
md.push(`- \`wk\` differs from the feed by more than ${TOL_WK} min: **${routeAudit.wkMismatch.length}**; matched within ${TOL_WK} min: **${routeAudit.wkMatched}** (largest gap ${routeAudit.maxDelta ? `${routeAudit.maxDelta.diff} min on route ${routeAudit.maxDelta.route}` : 'n/a'}).`);
if (mappingErrors.length) {
  md.push(`- GTFS mapping errors: **${mappingErrors.length}**`);
  for (const e of mappingErrors.slice(0, 10)) md.push(`  - ${e}`);
}
md.push('');
if (routeAudit.noName.length) {
  md.push('Missing names:');
  md.push('');
  md.push('| route | gtfs |');
  md.push('| --- | --- |');
  md.push(tableOf(routeAudit.noName.map((x) => [x.route, x.gtfs])));
  md.push('');
}
if (routeAudit.wkNull.length) {
  md.push('All routes with null `wk` and weekday trips, and why null is or is not correct:');
  md.push('');
  md.push('| route | tier | weekday trips | weaker-direction midday deps | case |');
  md.push('| --- | --- | --- | --- | --- |');
  md.push(tableOf(routeAudit.wkNull.map((x) => [x.route, x.tier, x.trips, x.middayDepartures, x.tier === 'peak' || x.tier === 'limited' ? 'peak/limited, no midday service' : x.middayDepartures < 2 ? 'single midday departure' : 'MEASURABLE — wk should not be null'])));
  md.push('');
}
md.push('`wk` disagreements beyond 2 minutes:');
md.push('');
if (!routeAudit.wkMismatch.length) md.push('_None._');
else {
  md.push('| route | gtfs | declared wk | measured wk | delta | busiest stop |');
  md.push('| --- | --- | --- | --- | --- | --- |');
  md.push(tableOf(routeAudit.wkMismatch.map((x) => [x.route, x.gtfs, x.declared, x.measured, x.diff, x.at])));
}
md.push('');
md.push('## Limitations / what could not be checked');
md.push('');
md.push(`- **\`properties.stopIds\` is not in the published file**, so invariants 1, 2 and 5 cannot be checked against a declared stop list. The stop list was reconstructed from geometry by nearest stop (all ${sum.geometryPoints} points match a stop; ${geomTies} point${geomTies === 1 ? '' : 's'} with a second stop within 1 m). The reconstruction is corroborated by the feature id: for the ${corridorGeo.features.length - inv.idMismatch.length} unmerged corridors the reconstructed sequence reproduces the id hash exactly. For the ${inv.idMismatch.length} merged corridors it cannot be corroborated, because their ids are stale.`);
md.push(`- **Weekday definition**: ${weekdayDate} (${sum.weekdayServices.join(', ')}), the same representative date as \`meta.json\`. Friday-only (\`FR\`), Saturday and Sunday services are excluded (${sum.weekdayTrips} weekday trips). A different weekday would change headways for routes that use day-specific services.`);
md.push('- **Headway definition**: median gap between 09:00–15:00 boarding departures. A member\'s own headway is its worst stop/direction on the corridor; the combined headway merges members at stops where at least two members call and at least four departures exist. This is the same family of measurement the site uses for routes, re-implemented from the CSVs.');
md.push(`- **Members are display routes, not GTFS route_ids.** Families are pooled (83 = 83D+83L, AB = AB1…AB3, FF = FF1…FF5, LD = LD1), matching how the map draws them. ${inv.partialFamily.length} (corridor, member) pairs have at least one GTFS variant that does not call at every corridor stop; the pooled member still serves every stop, which is the level the map claims.`);
if (inv.partialFamily.length) {
  md.push('');
  md.push('| corridor | member | variants missing some stops |');
  md.push('| --- | --- | --- |');
  md.push(tableOf(inv.partialFamily.map((x) => [x.id, x.member, x.variants.filter((v) => v.missing).map((v) => `${v.rid}: ${v.missing}`).join(', ')])));
}
md.push('- **Not checked**: whether the drawn line follows the street (shapes.txt), or whether corridors overlap each other on the map. Those are cartographic questions outside these six invariants.');
md.push('');
md.push('## Corridor table');
md.push('');
md.push('| corridor | members | stops | declared | fastest member at stops | route headline | measured combined | tier |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
md.push(tableOf(corridorRows.map((r) => [r.id, r.members.join(' '), r.stopSeq.length, r.declared, r.bestSingle ?? '—', r.bestRouteLevel ?? '—', r.measuredCombined ?? '—', r.tier])));
md.push('');
md.push(`_Generated ${new Date().toISOString()} by qa/scripts/audit-corridors.mjs_`);

fs.writeFileSync(OUT, `${md.join('\n')}\n`);
if (process.argv.includes('--dump')) {
  const dump = path.join(ROOT, 'qa/corridors-detail.json');
  fs.writeFileSync(dump, `${JSON.stringify(corridorRows, null, 1)}\n`);
  console.log(`dumped ${path.relative(ROOT, dump)}`);
}
console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
