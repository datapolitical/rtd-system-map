// Platform groups (DESIGN.md, "Stations"): where a station's lines stop in
// places too far apart for one mark to stand for them, the map draws a station
// mark at each place, joined to the station's own mark by the walk between
// them (a row of dots), so no line ends on the map with nothing drawn at it.
//
// The places come from GTFS: the station's child stops (the platforms under
// its `parent_station`, from scripts/lib/stations.mjs), clustered by distance,
// each cluster with the lines that call at its stops. Nothing here knows a
// station, a platform or a line: Union Station's two groups are found the same
// way as any other station's.
//
// A group's mark goes on its lines' drawn track (`pieces`, sharedTrack's
// output): in line with a hall that lies between the station's groups, where
// there is one (walkAxis); else at the end of that track where the lines end
// at the station, since a mark partway along would leave the lines running
// past it to nothing; else abreast of the station's own mark, or on the track
// at the platform where they run through. Whether a mark is drawn
// at all is decided by the map itself: it waits for the zoom where it is clear
// of the station's own mark, and a group whose mark never clears it (a pair of
// platforms a few metres apart) is left to that mark, exactly as a station too
// near a stronger one is left to it (stationmarks.mjs).

import { RAIL_WIDTH, STATION_SPACING, ZOOMS } from '../../public/js/sizes.js';
import { nearestOnTrack, trackAt } from './sharedtrack.mjs';
import {
  CLEAR_PX,
  HUB_FROM,
  STEP,
  TICK_FROM,
  TICK_TO,
  hubDiameter,
  linePaths,
  metersPerPixel,
  parallelAt,
  stationScale,
  tickLength,
} from './stationmarks.mjs';

// Child stops this close are one platform group whatever lines call at them:
// the two sides of a platform, or two platforms a few metres apart.
export const SAME_PLACE_METERS = 100;
// Child stops this close that a common line calls at are one platform group
// too: GTFS puts the two side platforms of one station at opposite ends of it,
// up to about 200 m apart, and one mark spans both (the station's own mark
// already stands for them). Two platforms farther apart than this, or with no
// line in common, are separate groups.
export const SAME_LINE_METERS = 250;
// A group is moved onto its lines' track when it's at most this far from it,
// the same reach the build uses to put a station on its track (build-data.mjs).
const SNAP_METERS = 200;
// A group this close to the end of its lines is marked at the end.
export const END_METERS = 150;
// Lines of one group whose drawn tracks are farther apart than this where
// they stop are two groups: one mark can't stand across both tracks, and the
// line left out ran past the station with no mark on it (Peoria, where A
// passes 30 m north of the platform R ends at). Lines that share track are
// drawn on one path, so they are never split.
export const TRACK_APART_METERS = 20;
// A group's mark stands on its track abreast of the station's own mark when
// that is within this of one of the group's stops (the platform is there), so
// two marks of one station stand side by side, not staggered along the lines.
export const ABREAST_METERS = 40;
// The mark grows with the map to ZOOMS' last stop; from there it is clear of
// the station's or it never is.
const LAST_ZOOM = ZOOMS.at(-1);
// Coordinates are written to 5 decimals, like the rest of the data (about a
// metre).
const PRECISION = 5;
const round = (v) => Math.round(v * 10 ** PRECISION) / 10 ** PRECISION;

const EARTH = 40075016.686;
/** Metres between two [lon, lat] points, flat enough at these distances. */
export function meters(a, b) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad;
  return Math.hypot(x, y) * 6371e3;
}

const mean = (points) => [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];

/**
 * Child stops grouped into platform groups: stops that can share one mark,
 * directly or through others in the group. Two stops can when they are close
 * (SAME_PLACE_METERS), or when a line calls at both and they are within
 * SAME_LINE_METERS. The input order decides each group's order, so the build
 * is repeatable.
 */
export function groupPlatforms(platforms, { samePlace = SAME_PLACE_METERS, sameLine = SAME_LINE_METERS } = {}) {
  const together = (a, b) => {
    const d = meters(a.at, b.at);
    return d <= samePlace || (d <= sameLine && a.lines.some((line) => b.lines.includes(line)));
  };
  const groups = [];
  const taken = new Set();
  for (let i = 0; i < platforms.length; i++) {
    if (taken.has(i)) continue;
    const group = [i];
    taken.add(i);
    for (let k = 0; k < group.length; k++) {
      for (let j = 0; j < platforms.length; j++) {
        if (taken.has(j) || !together(platforms[group[k]], platforms[j])) continue;
        taken.add(j);
        group.push(j);
      }
    }
    groups.push(group.map((j) => platforms[j]));
  }
  return groups;
}

/**
 * A platform group split by track: the lines whose drawn tracks pass within
 * TRACK_APART_METERS of each other at the group's stops stay one group, and
 * lines on tracks farther apart become groups of their own, each with the
 * stops its lines call at. A group with a line that is on no drawn track
 * nearby is left whole.
 */
export function splitByTrack(group, pieces, { apart = TRACK_APART_METERS } = {}) {
  const lines = [...new Set(group.flatMap((p) => p.lines))];
  if (lines.length < 2) return [group];
  const stops = mean(group.map((p) => p.at));
  const on = new Map(lines.map((route) => [route, nearestOnTrack(pieces.filter((p) => p.properties.route === route), stops, SNAP_METERS)]));
  if ([...on.values()].some((at) => !at)) return [group];
  const tracks = [];
  for (const route of lines) {
    const track = tracks.find((t) => t.some((other) => meters(on.get(other), on.get(route)) <= apart));
    if (track) track.push(route);
    else tracks.push([route]);
  }
  if (tracks.length < 2) return [group];
  return tracks
    .map((track) => group.map((p) => ({ ...p, lines: p.lines.filter((line) => track.includes(line)) })).filter((p) => p.lines.length))
    .filter((g) => g.length);
}

// The walk between a station's platform groups runs along a hall that lies
// between them (Union Station's bus concourse, from the light-rail platforms
// to the train hall): the groups' marks stand where the hall's long axis
// crosses their tracks, so the marks, the walk and the hall are one straight
// line, as they would be drawn by hand. A walk from mark to mark at the
// lines' ends ran at an angle across the hall. The axis is carried this far
// past each end of the hall to reach a track that stops short of it, and a
// hall counts as long when it is this many times longer than it is wide.
export const WALK_REACH_METERS = 80;
const LONG_HALL = 2;
// A track that ends within this of the walk's line crosses it.
const TOUCH_METERS = 2;
// A mark on the walk's line lies along it, not exactly across its own lines,
// when the two are within this many degrees: the marks at the two ends of the
// walk are then parallel, in one line with it, as they would be drawn by
// hand. (Union Station's light rail comes in 14 degrees off square to the
// concourse, and its mark was tilted that much against the other.) A mark
// turned this far still covers the ends of the lines it spans.
export const WALK_TURN_DEGREES = 25;

/**
 * A mark's bearing (the way its lines run, which it is drawn across) turned
 * so the mark lies along the walk's line `axis`, if that is within
 * WALK_TURN_DEGREES of where it lay; else as it was.
 */
export function alongWalk(bearing, axis) {
  const k = kx(axis[0][1]);
  const walk = (Math.atan2((axis[1][0] - axis[0][0]) * k, (axis[1][1] - axis[0][1]) * KY) * 180) / Math.PI;
  // The mark lies along `bearing + 90`: square to the walk, give or take a
  // half turn, which is the same mark.
  const want = walk - 90 + 180 * Math.round((bearing - (walk - 90)) / 180);
  return Math.abs(want - bearing) <= WALK_TURN_DEGREES ? Math.round(want) : bearing;
}

const KY = 110540;
const kx = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

/**
 * A ring's long axis as [from, to] ([lon, lat] each), through its middle and
 * `reach` metres past each end, or null if the ring is not at least `long`
 * times longer than it is wide. The direction is the one its edges mostly
 * run in (the principal axis of its edges, weighted by length).
 */
export function longAxis(ring, { reach = 0, long = LONG_HALL } = {}) {
  if (!ring || ring.length < 3) return null;
  const k = kx(ring[0][1]);
  const pts = ring.map((p) => [(p[0] - ring[0][0]) * k, (p[1] - ring[0][1]) * KY]);
  let [sx, sy, sl] = [0, 0, 0];
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = [pts[i], pts[(i + 1) % pts.length]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!l) continue;
    edges.push({ a, b, l });
    sx += ((a[0] + b[0]) / 2) * l;
    sy += ((a[1] + b[1]) / 2) * l;
    sl += l;
  }
  if (!sl) return null;
  const c = [sx / sl, sy / sl];
  // Second moments of the edges about the middle (end points and middle of
  // each edge, by Simpson's rule, exact for a straight edge).
  let [xx, xy, yy] = [0, 0, 0];
  for (const { a, b, l } of edges) {
    for (const [q, w] of [[a, 1 / 6], [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 4 / 6], [b, 1 / 6]]) {
      const [dx, dy] = [q[0] - c[0], q[1] - c[1]];
      xx += w * l * dx * dx;
      xy += w * l * dx * dy;
      yy += w * l * dy * dy;
    }
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const dir = [Math.cos(angle), Math.sin(angle)];
  const along = pts.map((q) => (q[0] - c[0]) * dir[0] + (q[1] - c[1]) * dir[1]);
  const across = pts.map((q) => -(q[0] - c[0]) * dir[1] + (q[1] - c[1]) * dir[0]);
  const [lo, hi] = [Math.min(...along), Math.max(...along)];
  const width = Math.max(...across) - Math.min(...across);
  if (hi - lo < long * width) return null;
  const at = (t) => [ring[0][0] + (c[0] + dir[0] * t) / k, ring[0][1] + (c[1] + dir[1] * t) / KY];
  return [at(lo - reach), at(hi + reach)];
}

/**
 * Where the straight line `axis` ([from, to]) crosses the drawn track of
 * `mine` (pieces): the crossing nearest `near`, as the middle of the lines
 * that cross there side by side, or null if it crosses none.
 */
export function crossingOnTrack(mine, axis, near) {
  const [p, q] = axis;
  const k = kx(p[1]);
  const [rx, ry] = [(q[0] - p[0]) * k, (q[1] - p[1]) * KY];
  const hits = [];
  for (const piece of mine) {
    const parts = piece.geometry.type === 'LineString' ? [piece.geometry.coordinates] : piece.geometry.coordinates;
    for (const part of parts) {
      for (let i = 1; i < part.length; i++) {
        const [a, b] = [part[i - 1], part[i]];
        const [ax, ay] = [(a[0] - p[0]) * k, (a[1] - p[1]) * KY];
        const [sx, sy] = [(b[0] - a[0]) * k, (b[1] - a[1]) * KY];
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = (ax * sy - ay * sx) / den;
        const u = (ax * ry - ay * rx) / den;
        // A line that ends on the axis crosses it: once the lines are cut at
        // their marks they end there, a rounding short of it or past it.
        const slack = TOUCH_METERS / Math.max(1e-9, Math.hypot(sx, sy));
        if (t < 0 || t > 1 || u < -slack || u > 1 + slack) continue;
        hits.push([p[0] + (rx * t) / k, p[1] + (ry * t) / KY]);
      }
    }
  }
  if (!hits.length) return null;
  const first = hits.reduce((best, h) => (meters(h, near) < meters(best, near) ? h : best));
  return mean(hits.filter((h) => meters(h, first) <= TRACK_APART_METERS)).map(round);
}

/**
 * The line the walk between a station's `groups` runs along: the long axis
 * of the first of `halls` (rings) that crosses the track of two or more of
 * the groups beside their stops, or null. `pieces` are the drawn rail lines.
 */
export function walkAxis(groups, pieces, halls = []) {
  if (groups.length < 2) return null;
  for (const ring of halls) {
    const axis = longAxis(ring, { reach: WALK_REACH_METERS });
    if (!axis) continue;
    const reached = groups.filter((group) => crossingBeside(group, pieces, axis)).length;
    if (reached >= 2) return axis;
  }
  return null;
}

// Where `axis` crosses a group's track within ABREAST_METERS of one of its
// stops, where its platform is; null if it doesn't.
function crossingBeside(group, pieces, axis) {
  const routes = new Set(group.flatMap((p) => p.lines));
  const cross = crossingOnTrack(pieces.filter((p) => routes.has(p.properties.route)), axis, mean(group.map((p) => p.at)));
  return cross && group.some((p) => meters(p.at, cross) <= ABREAST_METERS) ? cross : null;
}

/** A station's platform groups: by place (groupPlatforms), then by track. */
export const groupsOf = (stops, pieces) => groupPlatforms(stops).flatMap((group) => splitByTrack(group, pieces));

/**
 * A group's mark: where it goes on the drawn track, which lines it carries,
 * and the tick it gets from far out (`tick` lines across, turned `tickBearing`,
 * as stationMarks gives a station). `paths` is linePaths(pieces).
 */
export function placeGroup(group, pieces, paths, ending = null, beside = null, along = null) {
  const lines = [...new Set(group.flatMap((p) => p.lines))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const routes = new Set(lines);
  const mine = pieces.filter((p) => routes.has(p.properties.route));
  const stops = mean(group.map((p) => p.at));
  const onTrack = nearestOnTrack(mine, stops, SNAP_METERS);
  // The mark sits on the track beside the platform's stops, where riders
  // board. Only when the stops are not on the drawn track at all does it go
  // to the lines' ends, so it never stands in the air.
  const endsOf = () =>
    lines.map((route) => {
      let best = null;
      for (const { path } of paths.get(route) ?? []) {
        for (const end of [path[0], path.at(-1)]) {
          const d = meters(end, stops);
          if (d <= END_METERS && (!best || d < best.d)) best = { end, d };
        }
      }
      return best?.end ?? null;
    });
  let at = onTrack;
  // Abreast of the station's own mark (`beside`), where the platform reaches.
  if (beside) {
    const abreast = nearestOnTrack(mine, beside, SNAP_METERS);
    if (abreast && group.some((p) => meters(p.at, abreast) <= ABREAST_METERS)) at = abreast;
  }
  // Where every line of the group ends here (`ending`: the lines that end at
  // this station), the group is the end of those lines: its mark is at their
  // end, so each runs the length of its platform and ends at the mark.
  if (ending && lines.every((route) => ending.has(route))) {
    const ends = endsOf();
    if (ends.every(Boolean)) at = nearestOnTrack(mine, mean(ends), SNAP_METERS) ?? mean(ends);
  }
  if (!at) {
    const ends = endsOf();
    at = ends.every(Boolean) ? mean(ends) : stops;
  }
  // On the walk's line (`along`, walkAxis), before all of these: the marks
  // of the station's groups stand in one line with the hall between them.
  const onWalk = along ? crossingBeside(group, pieces, along) : null;
  if (onWalk) at = onWalk;
  const track = trackAt(mine, at);
  const { span } = track;
  const bearing = onWalk ? alongWalk(track.bearing, along) : track.bearing;
  // Across the lines it spans, unless they part within the tick's length
  // (stationmarks.mjs, "the tick spans its lines where they run together").
  let tick = span;
  let tickBearing = bearing;
  if (span > 1) {
    const checks = [TICK_FROM, (TICK_FROM + TICK_TO) / 2, TICK_TO].map((zoom) => {
      const reach = (tickLength(span, zoom) / 2) * metersPerPixel(zoom, at[1]);
      return parallelAt(paths, lines, at, { zoom, meters: reach });
    });
    if (checks.some((c) => !c.parallel)) tick = 1;
    else if (checks[1].bearing !== null) tickBearing = onWalk ? alongWalk(checks[1].bearing, along) : checks[1].bearing;
  }
  return { at, lines, span, bearing, tick, tickBearing };
}

/**
 * A station mark's length in px at `zoom`: its tick, or the capsule it grows
 * into, as stationmarks measures it for a station's own mark.
 */
function markLength(span, tick, zoom) {
  if (zoom < TICK_TO) return tickLength(Math.max(tick, 1), zoom);
  return ((Math.max(span, 1) - 1) * STATION_SPACING + RAIL_WIDTH.at(-1) + 4) * stationScale(zoom);
}

/**
 * The first zoom, in the quarters the map fades marks in over, where a group's
 * mark is clear of the station's own mark (the longer mark's length, plus
 * CLEAR_PX), or null if it never is. The hub's ring stands in for the
 * station's mark while it has one.
 */
export function clearFrom(stationPoint, station, group) {
  const apart = meters(stationPoint, group.at);
  for (let z = TICK_FROM; z <= LAST_ZOOM + 1e-9; z += STEP) {
    const zoom = Math.round(z * 100) / 100;
    const ring = station.meet && zoom >= HUB_FROM && zoom < TICK_TO;
    const own = ring ? hubDiameter(station.span ?? 1, zoom) : markLength(station.span ?? 1, station.tick ?? 1, zoom);
    const theirs = markLength(group.span, group.tick, zoom);
    if (apart / metersPerPixel(zoom, stationPoint[1]) >= Math.max(own, theirs) + CLEAR_PX) return zoom;
  }
  return null;
}

/**
 * A served station's platform groups, placed: `{ axis, groups }`, `groups`
 * as placeGroup gives them and `axis` the walk's line if there is one.
 */
export function stationGroups(f, platformStops, pieces, paths, ending = null, halls = []) {
  const lines = new Set(String(f.properties.lines ?? '').split(' ').filter(Boolean));
  const stops = (platformStops ?? [])
    .map((s) => ({ at: s.at, lines: s.lines.filter((line) => lines.has(line)) }))
    .filter((s) => s.lines.length);
  const groups = groupsOf(stops, pieces);
  const axis = walkAxis(groups, pieces, halls);
  return { axis, groups: groups.map((group) => placeGroup(group, pieces, paths, ending, f.geometry.coordinates, axis)) };
}

/**
 * Where a station's own mark goes when the walk between its platform groups
 * runs along a hall (walkAxis): on the walk's line, at the group its point
 * is nearest, as [lon, lat] with the walk's line as `axis`. Null for a
 * station with no such walk.
 */
export function walkPoint(f, platformStops, pieces, ending = null, halls = []) {
  const { axis, groups } = stationGroups(f, platformStops, pieces, linePaths(pieces), ending, halls);
  if (!axis || groups.length < 2) return null;
  const here = f.geometry.coordinates;
  const at = groups.reduce((best, g) => (meters(here, g.at) < meters(here, best.at) ? g : best)).at;
  // The point, with the walk's line on it for the station's own mark to lie
  // along (alongWalk).
  return Object.assign([...at], { axis });
}

/**
 * Where every platform group of each served station stands on the track
 * (placeGroup), whether or not it gets a mark of its own: `{ station, at,
 * lines }`, `station` the index in `stations`. For ending each line at its
 * end station's mark (sharedtrack.mjs, endAtMarks).
 */
export function groupPoints(stations, platforms, pieces, endingAt = () => null, halls = []) {
  const paths = linePaths(pieces);
  return stations.flatMap((f, i) => {
    if (!f.properties.served) return [];
    const { axis, groups } = stationGroups(f, platforms[i], pieces, paths, endingAt(i), halls);
    return groups.map(({ at, lines: on }) => ({ station: i, at, lines: on, walk: Boolean(axis) }));
  });
}

/**
 * The platform marks a station gets, as GeoJSON features for platforms.geojson:
 * a `mark` point at each group (the station's own mark stands for the group
 * nearest it, when it sits on it) and a `join` line from the station to each.
 *
 * `stations` are the map's stations (served, with `lines`, `span`, `meet`),
 * `platforms` is stationService's per-station list of child stops, and
 * `pieces` are the drawn rail lines.
 */
export function platformMarks(stations, platforms, pieces, endingAt = () => null, halls = []) {
  const paths = linePaths(pieces);
  const features = [];
  stations.forEach((f, i) => {
    const p = f.properties;
    if (!p.served) return;
    const here = f.geometry.coordinates;
    const { groups } = stationGroups(f, platforms[i], pieces, paths, endingAt(i), halls);
    if (groups.length < 2) return;
    // The station's own mark is drawn at the station: it stands for the group
    // it sits on, and every other group gets a mark of its own.
    const own = groups.reduce((best, g, k) => (meters(here, g.at) < meters(here, groups[best].at) ? k : best), 0);
    const ending = endingAt(i);
    groups.forEach((group, k) => {
      if (k === own && meters(here, group.at) <= SAME_PLACE_METERS) return;
      const clear = clearFrom(here, p, group);
      if (clear === null) return;
      // The map shows a mark from a whole zoom (network.js, 'platform'), so
      // the zoom is a whole one: the first at which the mark is clear. A
      // group its lines end at doesn't wait to be clear. Its lines end at
      // its mark, and with the mark held back they ended at nothing (the
      // light rail at Union Station at zoom 13, where its mark was not yet
      // clear of the station's): it is marked from the zoom stations are
      // capsules, and overlaps the station's own mark until it is clear.
      const ends = Boolean(ending) && group.lines.every((route) => ending.has(route));
      const from = ends ? Math.min(Math.ceil(clear), TICK_TO) : Math.ceil(clear);
      const at = group.at.map(round);
      features.push({
        type: 'Feature',
        properties: {
          kind: 'mark',
          id: p.id,
          lines: group.lines.join(' '),
          span: group.span,
          bearing: group.bearing,
          tick: group.tick,
          tickBearing: group.tickBearing,
          tickFrom: from,
          meet: false,
        },
        geometry: { type: 'Point', coordinates: at },
      });
      features.push({
        type: 'Feature',
        properties: { kind: 'join', id: p.id, tickFrom: from },
        geometry: { type: 'LineString', coordinates: [here.map(round), at] },
      });
    });
  });
  return features;
}
