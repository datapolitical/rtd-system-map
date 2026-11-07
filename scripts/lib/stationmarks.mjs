// How rail stations are marked from far out (DESIGN.md, "Stations"): which
// mark each station gets below zoom 11, worked out from the drawn track.
//
// The map draws a station from zoom 9 to 11 as a tick across the lines it
// serves, scaled with the lines. Ticks were drawn for every station, turned to
// the track where it stood, so on a curving corridor five stations a mile
// apart stacked as rotated pills, and a tick at a split sat crooked across
// lines already parting. Here the build decides, for each station, from what
// zoom its tick is drawn (stations nearer than a tick's length to a stronger
// one wait until they're clear), whether the tick can be turned across the
// lines or must be a dot, and which station is the hub.

// The map's rail and station sizes and the zooms its station marks change
// at, from the page's own module (public/js/sizes.js), so the two can't
// disagree: RAIL_WIDTH and RAIL_GAP, the ZOOMS they're given at, the tick's
// size across the track (TICK, drawn as "dot-" in symbols.js) and the hub
// ring's extra width (HUB_EXTRA, "hub-"). Spacing is a line's width and gap
// at the widest zoom, as the images are drawn there.
import { CAPSULE_TO, FAR_STEP, HUB_EXTRA, HUB_FROM, OVERVIEW_UNTIL, RAIL_GAP, RAIL_WIDTH, STATION_SPACING, TICK, ZOOMS } from '../../public/js/sizes.js';
export const SPACING = STATION_SPACING;
// Ticks are drawn from TICK_FROM (the end of the overview), the hub's ring
// from HUB_FROM, both until TICK_TO, where every station has its full mark
// (the page's CAPSULE_TO).
export const TICK_FROM = OVERVIEW_UNTIL;
export { HUB_FROM };
export const TICK_TO = CAPSULE_TO;
// Two marks on one track count as clear of each other when they are the
// longer one's length apart plus this (px): two dots 4 px wide and 5 px apart
// read as one blot.
export const CLEAR_PX = 4;
// Collapse is decided in quarter zooms: the map fades a tick in over one.
export const STEP = FAR_STEP;
// Lines a tick spans are parallel if, over the tick's length either way along
// the track, their drawn distance apart changes by less than this (px).
const PARALLEL_PX = 1;
// Samples along the track for that check (m).
const SAMPLE_METERS = 20;

const EARTH = 40075016.686;

/** Meters per screen pixel at `zoom` and latitude `lat` (512 px tiles). */
export function metersPerPixel(zoom, lat) {
  return (EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * The scale the map draws station images at (network.js `stationSize`): a line's
 * width and gap at `zoom` over SPACING, interpolated as MapLibre does
 * (exponential, base 1.4) between ZOOMS.
 */
export function stationScale(zoom) {
  const values = RAIL_WIDTH.map((w) => (w + RAIL_GAP) / SPACING);
  if (zoom <= ZOOMS[0]) return values[0];
  for (let i = 1; i < ZOOMS.length; i++) {
    if (zoom > ZOOMS[i]) continue;
    const [a, b] = [ZOOMS[i - 1], ZOOMS[i]];
    const t = (1.4 ** (zoom - a) - 1) / (1.4 ** (b - a) - 1);
    return values[i - 1] + t * (values[i] - values[i - 1]);
  }
  return values.at(-1);
}

/** A tick's length across the track in px at `zoom`, spanning `span` lines. */
export function tickLength(span, zoom) {
  return ((span - 1) * SPACING + (span > 1 ? TICK.across : TICK.single)) * stationScale(zoom);
}

/** The hub ring's diameter in px at `zoom`, around `span` lines. */
export function hubDiameter(span, zoom) {
  return ((Math.max(span, 1) - 1) * SPACING + HUB_EXTRA) * stationScale(zoom);
}

/**
 * The place where the most lines meet: the index of the served station with
 * the most lines, ties to the one with the most routes (`links`), or -1.
 */
export function meetingPlace(stations) {
  let best = -1;
  const lines = (f) => String(f.properties.lines ?? '').split(' ').filter(Boolean).length;
  stations.forEach((f, i) => {
    if (!f.properties.served) return;
    const b = stations[best];
    if (!b || lines(f) > lines(b) || (lines(f) === lines(b) && (f.properties.links ?? 0) > (b.properties.links ?? 0))) best = i;
  });
  return best;
}

/**
 * Each line's drawn path from its pieces (`sharedTrack`'s output: LineStrings
 * with `route` and `slot`), joined end to end: route -> [{ path, slots }],
 * `path` in [lon, lat], `slots` the slot of each segment.
 */
export function linePaths(pieces) {
  const byRoute = new Map();
  for (const piece of pieces) {
    const { route, slot } = piece.properties;
    if (piece.geometry.type !== 'LineString') continue;
    (byRoute.get(route) ?? byRoute.set(route, []).get(route)).push({ coords: piece.geometry.coordinates, slot: slot ?? 0 });
  }
  const key = (c) => `${c[0]},${c[1]}`;
  const out = new Map();
  for (const [route, parts] of byRoute) {
    // Pieces meet end to end, but each is pointed the way its shared track
    // is, so a line's pieces can run either way. A slot is to the right of
    // the way a piece runs: turned round, it changes sign.
    const at = new Map(); // endpoint -> piece indexes
    parts.forEach((p, i) => {
      for (const c of [p.coords[0], p.coords.at(-1)]) (at.get(key(c)) ?? at.set(key(c), []).get(key(c))).push(i);
    });
    const left = new Set(parts.map((_, i) => i));
    const loose = (i) => [parts[i].coords[0], parts[i].coords.at(-1)].find((c) => at.get(key(c)).length === 1);
    const paths = [];
    while (left.size) {
      // Start at a loose end, so each path is whole.
      const first = [...left].find((i) => loose(i)) ?? [...left][0];
      const start = loose(first);
      const forward = !start || key(start) === key(parts[first].coords[0]);
      const path = forward ? [...parts[first].coords] : [...parts[first].coords].reverse();
      const slots = path.slice(1).map(() => (forward ? 1 : -1) * parts[first].slot);
      left.delete(first);
      for (;;) {
        const next = (at.get(key(path.at(-1))) ?? []).find((j) => left.has(j));
        if (next === undefined) break;
        left.delete(next);
        const ahead = key(parts[next].coords[0]) === key(path.at(-1));
        const coords = ahead ? parts[next].coords : [...parts[next].coords].reverse();
        path.push(...coords.slice(1));
        slots.push(...coords.slice(1).map(() => (ahead ? 1 : -1) * parts[next].slot));
      }
      paths.push({ path, slots });
    }
    out.set(route, paths);
  }
  return out;
}

// A local flat frame in meters around `origin` ([lon, lat]).
function frame(origin) {
  const kx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110540;
  return {
    to: ([lon, lat]) => [(lon - origin[0]) * kx, (lat - origin[1]) * ky],
    from: ([x, y]) => [x / kx + origin[0], y / ky + origin[1]],
  };
}

// Where `point` (local m) is closest on `pts`: meters along, and distance.
function locate(pts, point) {
  let best = null;
  let along = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(dx, dy);
    const t = l ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (l * l))) : 0;
    const d = Math.hypot(a[0] + t * dx - point[0], a[1] + t * dy - point[1]);
    if (!best || d < best.d) best = { d, along: along + t * l };
    along += l;
  }
  return best;
}

// The point, slot and unit direction `meters` along `pts`, or null past an end.
function at(pts, slots, meters) {
  if (meters < 0) return null;
  let left = meters;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l && left <= l) {
      const t = left / l;
      return { p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], slot: slots[i - 1], dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
    }
    left -= l;
  }
  return null;
}

// Where line `route` is nearest a station (local m), within `reach` m: its
// path in the local frame, and how far along.
function onLine(paths, route, to, reach) {
  let best = null;
  for (const { path, slots } of paths.get(route) ?? []) {
    const pts = path.map(to);
    const found = locate(pts, [0, 0]);
    if (found && found.d <= reach && (!best || found.d < best.d)) best = { ...found, pts, slots };
  }
  return best;
}

// A line as drawn at a zoom, `meters` along: its point in px in the local
// frame, moved to the side by its slot (to the right of its direction).
function drawn(line, meters, mpp, spacing) {
  const here = at(line.pts, line.slots, line.along + meters);
  if (!here) return null;
  const right = [here.dir[1], -here.dir[0]];
  return [here.p[0] / mpp + right[0] * here.slot * spacing, here.p[1] / mpp + right[1] * here.slot * spacing];
}

/**
 * Whether the lines `routes` run parallel, as drawn at `zoom`, for `meters`
 * either way along the track from a station at `point` ([lon, lat]): their
 * distances apart on screen change by less than PARALLEL_PX. A line that ends
 * within the distance counts only where it's drawn. Also returns the
 * track's bearing (degrees clockwise from north) from end to end of that
 * stretch, for the tick to be square to it.
 */
export function parallelAt(paths, routes, point, { zoom, meters, reach = 30 }) {
  const { to } = frame(point);
  const mpp = metersPerPixel(zoom, point[1]);
  const spacing = SPACING * stationScale(zoom);
  const lines = routes.map((r) => onLine(paths, r, to, reach)).filter(Boolean);
  if (!lines.length) return { parallel: true, bearing: null };
  // Sample every line the way the first runs. (Slots are to the right of the
  // way each line's own path runs, so `drawn` needs no turning round.)
  const [ref] = lines;
  const ahead = at(ref.pts, ref.slots, ref.along + 1) ?? at(ref.pts, ref.slots, ref.along - 1);
  for (const line of lines) {
    const here = at(line.pts, line.slots, line.along + 1) ?? at(line.pts, line.slots, line.along - 1);
    line.sign = ahead && here && ahead.dir[0] * here.dir[0] + ahead.dir[1] * here.dir[1] < 0 ? -1 : 1;
  }
  const sample = (line, t) => drawn(line, line.sign * t, mpp, spacing);
  let parallel = true;
  for (let k = 1; k < lines.length && parallel; k++) {
    const sep0 = dist(sample(ref, 0), sample(lines[k], 0));
    for (let t = -meters; t <= meters && parallel; t += SAMPLE_METERS) {
      const a = sample(ref, t);
      const b = sample(lines[k], t);
      if (!a || !b) continue;
      if (Math.abs(dist(a, b) - sep0) > PARALLEL_PX) parallel = false;
    }
  }
  // The bearing across the stretch, from the first line's path.
  const back = at(ref.pts, ref.slots, Math.max(0, ref.along - meters));
  const fore = at(ref.pts, ref.slots, ref.along + meters) ?? { p: ref.pts.at(-1) };
  const [dx, dy] = back ? [fore.p[0] - back.p[0], fore.p[1] - back.p[1]] : [0, 0];
  // A tick looks the same turned half round: kept within a quarter turn of
  // north, as `trackAt` gives it.
  let bearing = dx || dy ? Math.round((Math.atan2(dx, dy) * 180) / Math.PI) : null;
  if (bearing !== null && bearing > 90) bearing -= 180;
  if (bearing !== null && bearing <= -90) bearing += 180;
  return { parallel, bearing };
}

function dist(a, b) {
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
}

/**
 * What each station's mark is from far out. `stations` are the map's
 * station features with `served`, `lines`, `end`, `links`, `span` and
 * `bearing` (from `trackAt`); `pieces` the drawn rail.
 *
 * Returns, per station, { tick, tickBearing, from, meet }:
 * - `tick`: how many lines the tick spans, or 1 (a dot) where the lines it
 *   would span part within its own length either way, at any zoom it's drawn.
 * - `tickBearing`: the track's direction over that length, so the tick is
 *   square to the stretch, not to one bend of it.
 * - `from`: the zoom (in quarters, TICK_FROM to TICK_TO) from which the tick
 *   is drawn. A station nearer a stronger one along the track than either's
 *   mark is long waits until it's clear; stronger is more lines, then the hub,
 *   then more routes. A station only waits for one that serves every line it
 *   does, and the end of a line never waits, so every line keeps a mark
 *   wherever it stops alone and at its ends.
 * - `meet`: the place where the most lines meet (see `meetingPlace`).
 */
export function stationMarks(stations, pieces) {
  const paths = linePaths(pieces);
  const hub = meetingPlace(stations);
  const linesOf = (f) => String(f.properties.lines ?? '').split(' ').filter(Boolean);
  const zooms = [];
  for (let z = TICK_FROM; z <= TICK_TO + 1e-9; z += STEP) zooms.push(Math.round(z * 100) / 100);

  const marks = stations.map((f, i) => {
    const p = f.properties;
    if (!p.served) return { tick: 1, tickBearing: 0, from: TICK_FROM, meet: false };
    const lines = linesOf(f);
    const span = p.span ?? 1;
    let tick = span;
    let tickBearing = p.bearing ?? 0;
    if (span > 1) {
      // Checked at each whole zoom the tick is drawn at: a split close by
      // shows at the near zoom, one further off at the far one.
      const checks = [TICK_FROM, (TICK_FROM + TICK_TO) / 2, TICK_TO].map((zoom) => {
        const meters = (tickLength(span, zoom) / 2) * metersPerPixel(zoom, f.geometry.coordinates[1]);
        return parallelAt(paths, lines, f.geometry.coordinates, { zoom, meters });
      });
      if (checks.some((c) => !c.parallel)) tick = 1;
      else if (checks[1].bearing !== null) tickBearing = checks[1].bearing;
    }
    return { tick, tickBearing, from: TICK_FROM, meet: i === hub };
  });

  // Strongest first: most lines, the hub, then most routes.
  const order = stations
    .map((f, i) => i)
    .filter((i) => stations[i].properties.served)
    .sort((a, b) => {
      const [fa, fb] = [stations[a], stations[b]];
      return (
        linesOf(fb).length - linesOf(fa).length ||
        Number(marks[b].meet) - Number(marks[a].meet) ||
        (fb.properties.links ?? 0) - (fa.properties.links ?? 0) ||
        a - b
      );
    });
  const size = (i, zoom) => (marks[i].meet && zoom >= HUB_FROM ? hubDiameter(stations[i].properties.span ?? 1, zoom) : tickLength(marks[i].tick, zoom));
  const placed = [];
  for (const i of order) {
    const f = stations[i];
    const lines = linesOf(f);
    let from = TICK_FROM;
    if (!f.properties.end && !marks[i].meet) {
      for (const j of placed) {
        const theirs = new Set(linesOf(stations[j]));
        if (!lines.every((l) => theirs.has(l))) continue;
        const meters = apart(paths, lines, f.geometry.coordinates, stations[j].geometry.coordinates);
        const lat = f.geometry.coordinates[1];
        // Too close while the longer mark, and CLEAR_PX, is longer than the
        // distance apart, which grows as the map zooms in. Wait until then,
        // if the other is drawn before it.
        const clear = zooms.find((z) => meters / metersPerPixel(z, lat) >= Math.max(size(i, z), size(j, z)) + CLEAR_PX) ?? TICK_TO;
        if (marks[j].from < clear) from = Math.max(from, clear);
      }
    }
    marks[i].from = from;
    placed.push(i);
  }
  return marks;
}

/**
 * How far apart two stations are along the track (m): along a line both are
 * on where there is one, otherwise in a straight line.
 */
export function apart(paths, lines, a, b) {
  const { to } = frame(a);
  const straight = Math.hypot(...to(b));
  for (const route of lines) {
    for (const { path } of paths.get(route) ?? []) {
      const pts = path.map(to);
      const [pa, pb] = [locate(pts, [0, 0]), locate(pts, to(b))];
      if (pa && pb && pa.d < 30 && pb.d < 30) return Math.max(straight, Math.abs(pa.along - pb.along));
    }
  }
  return straight;
}
