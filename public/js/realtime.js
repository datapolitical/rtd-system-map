// The Live protocol: what the relay (live/src/worker.mjs, a Durable Object)
// sends the page, and the pure functions both sides share. No DOM and no
// Worker APIs here, so the same file runs in the Worker, in the browser and in
// Node's tests.

// Bumped when a message's shape changes. A page that gets a version it
// doesn't know says Live isn't loading rather than drawing nonsense.
export const SCHEMA = 1;

// How often the relay asks RTD while anyone is watching. RTD regenerates its
// feeds about every 30 seconds, so this catches a change within about 8
// seconds on average without asking twice for the same data very often.
export const POLL_MS = 15_000;
// Alerts change a few times a day; they're asked for once a minute.
export const ALERTS_EVERY_MS = 60_000;
// A vehicle whose own report is older than this is not drawn as current.
export const STALE_S = 120;

// One vehicle is an array in this order (compact: a few hundred of them go
// out every poll). Times are seconds since 1970, as in RTD's feed.
export const VEHICLE_COLUMNS = ['id', 'route', 'trip', 'direction', 'lon', 'lat', 'bearing', 'at', 'occupancy', 'stop', 'status'];

export const emptyState = () => ({ seq: 0, at: 0, vehicles: null, alerts: null, alertsAt: 0, problem: null });

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * The vehicles worth drawing, from a decoded VehiclePosition feed: those on a
 * trip with a route and a real position. A bus between runs reports no trip,
 * and a vehicle reporting (0, 0) has no fix.
 */
export function vehiclesFrom(feed) {
  const at = feed.header?.timestamp ?? 0;
  const list = [];
  for (const e of feed.entities) {
    const v = e.vehicle;
    const p = v?.position;
    if (!p || !v.trip?.route || !(Math.abs(p.lat) > 0.001 && Math.abs(p.lon) > 0.001)) continue;
    list.push([
      v.vehicle?.id || e.id || '',
      v.trip.route,
      v.trip.trip ?? '',
      v.trip.direction ?? null,
      round(p.lon, 5),
      round(p.lat, 5),
      p.bearing == null ? null : Math.round(p.bearing),
      v.timestamp ?? at,
      v.occupancy ?? null,
      v.stop ?? '',
      v.status ?? null,
    ]);
  }
  return { at, list };
}

/** A vehicle row back into an object, for the page. */
export const vehicle = (row) => Object.fromEntries(VEHICLE_COLUMNS.map((k, i) => [k, row[i]]));

/**
 * The alerts in effect at `nowS` (seconds), from a decoded Alerts feed, with
 * what each applies to. An alert with no active period is always in effect.
 */
export function alertsFrom(feed, nowS) {
  const at = feed.header?.timestamp ?? 0;
  const list = [];
  for (const e of feed.entities) {
    const a = e.alert;
    if (!a) continue;
    const periods = a.periods ?? [];
    const active = !periods.length || periods.some((p) => (p.start ?? 0) <= nowS && (p.end ?? Infinity) >= nowS);
    if (!active) continue;
    const uniq = (xs) => [...new Set(xs.filter(Boolean))];
    list.push({
      id: e.id ?? '',
      routes: uniq(a.entities.map((s) => s.route)),
      stops: uniq(a.entities.map((s) => s.stop)),
      trips: uniq(a.entities.map((s) => s.trip)),
      cause: a.cause ?? null,
      effect: a.effect ?? null,
      header: a.header ?? '',
      description: a.description ?? '',
      url: a.url ?? '',
      from: periods.length ? Math.min(...periods.map((p) => p.start ?? 0)) : null,
      to: periods.length && periods.every((p) => p.end != null) ? Math.max(...periods.map((p) => p.end)) : null,
    });
  }
  return { at, list };
}

/**
 * One poll of RTD: the next state from the current one. `fetchBytes(name)`
 * returns a feed's bytes; `decode` turns them into `{ header, entities }`.
 * Alerts are fetched only when theirs are due. A feed that fails leaves its
 * last good data in place and is named in `problem`, with when the trouble
 * started. `seq` moves only when something a viewer sees has changed, so the
 * relay knows whether to send the state or just a tick.
 */
export async function refresh(state, { fetchBytes, decode, now = Date.now() }) {
  const next = { ...state, at: now };
  const wantAlerts = now - (state.alertsAt ?? 0) >= ALERTS_EVERY_MS;
  const [veh, al] = await Promise.allSettled([
    fetchBytes('VehiclePosition.pb').then((b) => vehiclesFrom(decode(b))),
    wantAlerts ? fetchBytes('Alerts.pb').then((b) => alertsFrom(decode(b), Math.floor(now / 1000))) : null,
  ]);
  const failed = [];
  if (veh.status === 'fulfilled') next.vehicles = veh.value;
  else failed.push('vehicles');
  if (al.status === 'fulfilled') {
    if (al.value) {
      next.alerts = al.value;
      next.alertsAt = now;
    }
  } else failed.push('alerts');
  next.problem = failed.length ? { feeds: failed, since: state.problem?.since ?? now } : null;
  const changed =
    next.vehicles?.at !== state.vehicles?.at ||
    next.alerts?.at !== state.alerts?.at ||
    JSON.stringify(next.problem?.feeds ?? null) !== JSON.stringify(state.problem?.feeds ?? null);
  if (changed) next.seq = (state.seq ?? 0) + 1;
  return next;
}

/** The message a viewer gets: the whole state, as a snapshot or an update. */
export const message = (state, kind) => ({
  v: SCHEMA,
  kind,
  seq: state.seq,
  at: state.at,
  vehicles: state.vehicles,
  alerts: state.alerts,
  problem: state.problem,
});

/** Nothing changed since the last message; the relay is alive. */
export const tick = (state) => ({ v: SCHEMA, kind: 'tick', seq: state.seq, at: state.at });

/**
 * Which map route a realtime route id belongs to. RTD's realtime feeds name
 * some routes differently from its GTFS (its trains as 101E or 103W, not E
 * or W); `aliases` is the table the build learned from the trips both feeds
 * name (scripts/lib/realtime.mjs). `known(id)` says whether a route is on
 * the map. An id the build never saw is tried with its leading number
 * removed, the pattern the learned table shows, and only accepted if that
 * names a route on the map. Returns null for a route the map doesn't draw.
 */
export function routeOf(id, aliases, known) {
  if (!id) return null;
  if (aliases[id] && known(aliases[id])) return aliases[id];
  if (known(id)) return id;
  const bare = id.replace(/^\d+(?=\D)/, '');
  return bare !== id && known(bare) ? bare : null;
}
