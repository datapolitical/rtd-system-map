// Lines and stops at a bus terminal's hall (DESIGN.md, "Bus routes",
// "Terminals"; #82). A hall is a closed ring of [lon, lat]
// (scripts/lib/footprints.mjs finds them). A bus that boards in a hall is
// drawn only as far as its edge, no line is drawn through one, and a stop
// left beside a hall with no line to stand on is shown with the hall.

import { clipOutRings, insideRing, partsOf } from './geom.mjs';

const metres = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
const lengthOf = (line) => line.slice(1).reduce((sum, b, i) => sum + metres(line[i], b), 0);
// A piece of line left by a cut shorter than this (metres) isn't drawn.
const MIN_PIECE = 0.5;
const toGeometry = (parts) => (parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts });

function toSegment(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return metres(p, [a[0] + t * dx, a[1] + t * dy]);
}
const toLine = (p, line) => line.slice(1).reduce((best, b, i) => Math.min(best, toSegment(p, line[i], b)), Infinity);

/**
 * A bus that boards in a terminal's concourse is drawn only as far as the
 * hall: where its line comes to the hall, goes away round the block and
 * comes back within `close` metres of where it left (the way in on one
 * street and out on another, to and from the ramp), after 100 m to `longest`
 * of travel, round the hall's middle, the stretch between is the approach,
 * not the route, and goes. `clipAtHalls` then ends each side at the hall's
 * edge. Only routes in `served` (those that stop inside a hall) are touched;
 * a street the bus really runs along, or one it only passes, is left.
 */
export function shortenAtHall(routes, halls, served, { close = 120, longest = 1500 } = {}) {
  if (!halls.length || !served.size) return routes;
  const centres = halls.map((ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]);
  return routes.map((f) => {
    if (f.properties.mode !== 'bus' || !served.has(f.properties.route)) return f;
    const out = [];
    for (const part of partsOf(f.geometry)) {
      let line = part.slice();
      let at = 0;
      while (at < line.length - 2) {
        let run = metres(line[at], line[at + 1]);
        let cut = null;
        for (let j = at + 2; j < line.length; j += 1) {
          run += metres(line[j - 1], line[j]);
          if (run > longest) break;
          if (metres(line[at], line[j]) > close || run < 100) continue;
          if (centres.some((c) => insideRing(c, line.slice(at, j + 1)))) {
            cut = j;
            break;
          }
        }
        if (!cut) {
          at += 1;
          continue;
        }
        out.push(line.slice(0, at + 1), line.slice(cut));
        line = [];
        break;
      }
      if (line.length) out.push(line);
    }
    const kept = out.filter((p) => p.length >= 2);
    return kept.length ? { ...f, geometry: toGeometry(kept) } : f;
  });
}

/**
 * Each feature's line with the parts inside any hall taken out: a line ends
 * where it meets a hall, where its buses go in. A feature wholly inside
 * goes. With `split`, each piece left is its own LineString feature (the
 * streets), and a `len` (metres) the feature carried is measured again for
 * the piece, so a remnant a few metres long isn't taken for a long street.
 */
export function clipAtHalls(features, halls, { split = false } = {}) {
  if (!halls.length) return features;
  // (The cut ends lie on the hall's edge, where a point is inside or outside
  // by a hair: they are kept as cut, not tested again. Testing them dropped
  // the end of a line that reached a hall, and with it a two-point piece.)
  return features.flatMap((f) => {
    const before = partsOf(f.geometry);
    const parts = before.flatMap((p) => clipOutRings(p, halls)).filter((p) => p.length >= 2 && lengthOf(p) >= MIN_PIECE);
    if (!parts.length) return [];
    if (!split) return [{ ...f, geometry: toGeometry(parts) }];
    return parts.map((p) => ({
      ...f,
      properties: { ...f.properties, ...(f.properties.len != null && (before.length !== 1 || p.length !== before[0].length || lengthOf(p) < lengthOf(before[0]) - 1) ? { len: Math.round(lengthOf(p)) } : {}) },
      geometry: { type: 'LineString', coordinates: p },
    }));
  });
}

/**
 * A stop within `near` metres of a hall that no drawn line (`lines`, arrays
 * of [lon, lat]) comes within `line` metres of stood on the approach, which
 * isn't drawn: it is the hall's, and is marked `terminal` like the stops
 * inside it, not left as a dot beside nothing. Returns how many were marked.
 */
export function stopsOfHalls(stops, halls, lines, { near = 80, line = 30 } = {}) {
  let taken = 0;
  for (const stop of stops) {
    if (stop.properties?.terminal) continue;
    const p = stop.geometry.coordinates;
    if (!halls.some((ring) => insideRing(p, ring) || toLine(p, [...ring, ring[0]]) <= near)) continue;
    if (lines.some((pts) => toLine(p, pts) <= line)) continue;
    (stop.properties ??= {}).terminal = 1;
    taken += 1;
  }
  return taken;
}
