// Live: what the build learns from RTD's realtime feeds.
//
// RTD's GTFS-realtime feeds name some routes differently from its GTFS: its
// trains report as 101E, 103W, 107R and so on, where GTFS says E, W, R. The
// two feeds do agree on trip ids, so the table from one naming to the other
// is learned here from the trips both name, never listed by hand. The page
// uses it (public/js/realtime.js, routeOf) to put each vehicle on its line.

import { decodeFeed } from '../../live/src/gtfsrt.mjs';
import { readCsv } from './gtfs.mjs';
import { getBytes } from './http.mjs';

export const RT_FEEDS = 'https://open-data.rtd-denver.com/files/gtfs-rt/rtd/';

/**
 * From realtime entities (vehicles and trip updates), each realtime route id
 * that differs from its map route, by majority of the trips seen. `tripRoute`
 * maps a GTFS trip_id to its GTFS route_id; `routeOf` maps a GTFS route_id to
 * the map route it belongs to (null if not on the map).
 */
export function routeAliases(entities, tripRoute, routeOf) {
  const votes = new Map(); // rt route id -> Map(map route -> count)
  let seen = 0;
  for (const e of entities) {
    const trip = e.vehicle?.trip ?? e.trip_update?.trip;
    if (!trip?.trip || !trip.route) continue;
    const route = routeOf(tripRoute.get(trip.trip));
    if (!route) continue;
    seen++;
    const tally = votes.get(trip.route) ?? votes.set(trip.route, new Map()).get(trip.route);
    tally.set(route, (tally.get(route) ?? 0) + 1);
  }
  const aliases = {};
  const conflicts = [];
  for (const [rt, tally] of votes) {
    const [best, ...rest] = [...tally].sort((a, b) => b[1] - a[1]);
    if (rest.length) conflicts.push(`${rt}: ${[...tally].map(([r, n]) => `${r} ${n}`).join(', ')}`);
    if (best[0] !== rt) aliases[rt] = best[0];
  }
  return { aliases, conflicts, seen };
}

/**
 * The route table for `meta.live`: every GTFS route id that belongs to a map
 * route under another name, plus what the realtime feeds call them right now.
 * The feeds are read with a failure kept local: Live must never break the
 * build (DESIGN.md, Rule 3), so a feed that's down just teaches nothing today.
 */
export async function liveRoutes(text, groupOf, { base = RT_FEEDS, fetchBytes = getBytes } = {}) {
  const routes = {};
  for (const [gtfsId, route] of groupOf) if (gtfsId !== route) routes[gtfsId] = route;
  const tripRoute = new Map(readCsv(text['trips.txt']).map((t) => [t.trip_id, t.route_id]));
  const entities = [];
  const failed = [];
  for (const name of ['VehiclePosition.pb', 'TripUpdate.pb']) {
    try {
      entities.push(...decodeFeed(await fetchBytes(base + name)).entities);
    } catch (err) {
      failed.push(`${name}: ${err.message}`);
    }
  }
  const learned = routeAliases(entities, tripRoute, (id) => groupOf.get(id) ?? null);
  return { routes: { ...routes, ...learned.aliases }, learned: Object.keys(learned.aliases).sort(), conflicts: learned.conflicts, seen: learned.seen, failed };
}
