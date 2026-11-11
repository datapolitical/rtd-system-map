// Platform groups (DESIGN.md, "Stations"): where a station's lines stop in
// places too far apart for one mark to stand for them, the map draws a station
// mark at each place, joined to the station's own mark by a thin line, so no
// line ends on the map with nothing drawn at it.
//
// The places come from GTFS: the station's child stops (the platforms under
// its `parent_station`, from scripts/lib/stations.mjs), clustered by distance,
// each cluster with the lines that call at its stops. Nothing here knows a
// station, a platform or a line: Union Station's two groups are found the same
// way as any other station's.
//
// A group's mark goes on its lines' drawn track (`pieces`, sharedTrack's
// output): at the end of that track where the lines end at the station, since
// a mark partway along would leave the lines running past it to nothing, and
// on the track at the platform where they run through. Whether a mark is drawn
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
 * A group's mark: where it goes on the drawn track, which lines it carries,
 * and the tick it gets from far out (`tick` lines across, turned `tickBearing`,
 * as stationMarks gives a station). `paths` is linePaths(pieces).
 */
export function placeGroup(group, pieces, paths) {
  const lines = [...new Set(group.flatMap((p) => p.lines))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const routes = new Set(lines);
  const mine = pieces.filter((p) => routes.has(p.properties.route));
  const stops = mean(group.map((p) => p.at));
  const onTrack = nearestOnTrack(mine, stops, SNAP_METERS);
  // The mark sits on the track beside the platform's stops, where riders
  // board. Only when the stops are not on the drawn track at all does it go
  // to the lines' ends, so it never stands in the air.
  let at = onTrack;
  if (!at) {
    const ends = lines.map((route) => {
      let best = null;
      for (const { path } of paths.get(route) ?? []) {
        for (const end of [path[0], path.at(-1)]) {
          const d = meters(end, stops);
          if (d <= END_METERS && (!best || d < best.d)) best = { end, d };
        }
      }
      return best?.end ?? null;
    });
    at = ends.every(Boolean) ? mean(ends) : stops;
  }
  const { span, bearing } = trackAt(mine, at);
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
    else if (checks[1].bearing !== null) tickBearing = checks[1].bearing;
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
 * The platform marks a station gets, as GeoJSON features for platforms.geojson:
 * a `mark` point at each group (the station's own mark stands for the group
 * nearest it, when it sits on it) and a `join` line from the station to each.
 *
 * `stations` are the map's stations (served, with `lines`, `span`, `meet`),
 * `platforms` is stationService's per-station list of child stops, and
 * `pieces` are the drawn rail lines.
 */
export function platformMarks(stations, platforms, pieces) {
  const paths = linePaths(pieces);
  const features = [];
  stations.forEach((f, i) => {
    const p = f.properties;
    if (!p.served) return;
    const here = f.geometry.coordinates;
    const lines = new Set(String(p.lines ?? '').split(' ').filter(Boolean));
    const stops = (platforms[i] ?? [])
      .map((s) => ({ at: s.at, lines: s.lines.filter((line) => lines.has(line)) }))
      .filter((s) => s.lines.length);
    const groups = groupPlatforms(stops).map((group) => placeGroup(group, pieces, paths));
    if (groups.length < 2) return;
    // The station's own mark is drawn at the station: it stands for the group
    // it sits on, and every other group gets a mark of its own.
    const own = groups.reduce((best, g, k) => (meters(here, g.at) < meters(here, groups[best].at) ? k : best), 0);
    groups.forEach((group, k) => {
      if (k === own && meters(here, group.at) <= SAME_PLACE_METERS) return;
      const from = clearFrom(here, p, group);
      if (from === null) return;
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
