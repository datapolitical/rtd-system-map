// A part-time route is drawn as its own dashed line (DESIGN.md, "Bus
// routes"). Where it shares an all-day line it sits on top of it; where it
// leaves that line for a short way and comes back (a terminal hook, the far
// side of a one-way pair, a ramp), the dash reads as a second line beside
// the map. So: a part-time part that has been on one all-day line, leaves it
// for less than SNAP_MAX and comes back to the same line, is drawn along
// that line between the two points instead. The dash still says the route
// is part-time; it no longer wanders off.
//
// Only bus routes are touched, and nothing about RTD's network is named
// here: the all-day line is whichever built route the part-time one has been
// following.

import { Grid, closestOnSegment, densify, dedupe, length, partsOf, projection, segmentDistance, simplify } from './geom.mjs';

// A part-time point this close to an all-day line is on it.
export const SNAP = 12;
// A departure shorter than this (along the part-time route) is a hook or a
// pair, not a different line a rider would read.
export const SNAP_MAX = 300;
// Points are compared this far apart along the route.
const STEP = 10;
const ALL_DAY = new Set(['frequent', 'every30', 'hourly', 'infrequent']);

const isAllDay = (f) => f.properties.mode === 'bus' && ALL_DAY.has(f.properties.tier);
const isPartTime = (f) => f.properties.mode === 'bus' && !ALL_DAY.has(f.properties.tier);

// The point of a line closest to p: { q, k, s }, where k is the segment and
// s the distance along the line to q.
function placeOnLine(pts, p) {
  let best = null;
  let along = 0;
  for (let k = 1; k < pts.length; k++) {
    const q = closestOnSegment(p, pts[k - 1], pts[k]);
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const s = along + Math.hypot(q[0] - pts[k - 1][0], q[1] - pts[k - 1][1]);
    if (!best || d < best.d) best = { q, k, s, d };
    along += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  }
  return best;
}

function distanceToLine(pts, p) {
  let best = Infinity;
  for (let k = 1; k < pts.length; k++) best = Math.min(best, segmentDistance(p, pts[k - 1], pts[k]));
  return best;
}

// The part of a line between p0 and p1, following its vertices.
function between(pts, p0, p1) {
  const [a, b] = [placeOnLine(pts, p0), placeOnLine(pts, p1)];
  if (!a || !b) return null;
  if (Math.abs(a.s - b.s) < 1) return [a.q, b.q];
  let out;
  if (a.s <= b.s) {
    out = [a.q];
    for (let k = a.k; k < b.k; k++) out.push(pts[k]);
    out.push(b.q);
  } else {
    out = [a.q];
    for (let k = a.k - 1; k >= b.k; k--) out.push(pts[k]);
    out.push(b.q);
  }
  return dedupe(out);
}

/**
 * `features` are the bus route features as drawn. Returns the same features,
 * with part-time geometry that leaves an all-day line for less than `max`
 * moved onto that line. Only geometry changes; every property stays.
 */
export function snapPartTime(features, { precision = 5, snap = SNAP, max = SNAP_MAX } = {}) {
  const first = features.find((f) => partsOf(f.geometry).some((p) => p.length >= 2));
  if (!first) return features;
  const { project, unproject } = projection(partsOf(first.geometry).find((p) => p.length >= 2)[0], precision);
  const targets = [];
  features.forEach((f) => {
    if (!isAllDay(f)) return;
    for (const part of partsOf(f.geometry)) {
      if (part.length >= 2) targets.push(part.map(project));
    }
  });
  if (!targets.length) return features;
  const grid = new Grid(max);
  targets.forEach((pts, ti) => {
    for (let k = 1; k < pts.length; k++) grid.add(pts[k - 1], pts[k], ti);
  });
  const nearest = (p) => {
    let best = null;
    for (const seg of grid.near(p, snap)) {
      const d = segmentDistance(p, seg.a, seg.b);
      if (!best || d < best.d) best = { d, ti: seg.item };
    }
    return best;
  };
  const out = features.map((f) => ({ ...f }));
  features.forEach((f, fi) => {
    if (!isPartTime(f)) return;
    let changed = false;
    const parts = partsOf(f.geometry).map((part) => {
      if (part.length < 2) return part;
      const pts = densify(part.map(project), STEP);
      // A part that begins and ends on one all-day line but weaves off it in
      // between (a concourse loop, a block circled to a ramp) is drawn along
      // that line: the dash shares the solid line, not a zigzag beside it.
      const first = nearest(pts[0]);
      const last = nearest(pts.at(-1));
      if (first && last && first.d <= snap && last.d <= snap && first.ti === last.ti) {
        const line = targets[first.ti];
        const away = Math.max(...pts.map((p) => distanceToLine(line, p)));
        if (away > 20 && length(pts) <= max * 2) {
          const path = between(line, pts[0], pts.at(-1));
          if (path && length(path) <= max * 2) {
            changed = true;
            return simplify(path, 1).map(unproject);
          }
        }
      }
      // The all-day line this part has been following, and where it left it.
      let home = -1;
      let off = -1;
      const cuts = [];
      const probe = pts.map((p) => nearest(p));
      for (let i = 0; i < pts.length; i++) {
        if (home < 0) {
          if (probe[i]) home = probe[i].ti;
          continue;
        }
        const d = distanceToLine(targets[home], pts[i]);
        if (d <= snap) {
          if (off >= 0) {
            const away = length(pts.slice(off - 1, i + 1));
            if (away > STEP * 2 && away <= max) {
              const path = between(targets[home], pts[off - 1], pts[i]);
              if (path) cuts.push({ from: off - 1, to: i, path });
            }
            off = -1;
          }
        } else if (off < 0) {
          off = i;
        } else if (length(pts.slice(off - 1, i + 1)) > max) {
          // A real departure, not a hook: find the line it is on now.
          home = probe[i]?.ti ?? -1;
          off = -1;
        }
      }
      if (!cuts.length) return part;
      // Put the cuts in, from the end so the earlier indices still hold.
      const line = pts.slice();
      for (const c of cuts.reverse()) line.splice(c.from, c.to - c.from + 1, ...c.path);
      const simpler = simplify(line, 1).map(unproject);
      if (simpler.length < 2) return part;
      changed = true;
      return simpler;
    });
    if (changed) out[fi] = { ...f, geometry: parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts } };
  });
  return out;
}
