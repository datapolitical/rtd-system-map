// Bus routes that share a street are drawn side by side, as a bundle, the
// way rail on shared track is (DESIGN.md, "Shared track" and "Bus routes";
// a prototype, 2026-11-07). Each route is its own line, so a reader can
// follow one through downtown; drawn on top of each other, a street with
// eight routes read as one line at the strongest route's weight.
//
// This is the rail bundler (sharedtrack.mjs) run on buses with rules of
// their own:
//
// 1. Each route once. A route is several features, one per stretch of
//    frequency (stretches.mjs); here they are one line again, so it is
//    bundled as a whole and keeps its place across a change of tier.
// 2. Routes within SHARED meters of each other, running within ALIGN degrees
//    of the same way, share a street (busnames.mjs's rule): a route that
//    crosses the street doesn't, so a downtown grid isn't one bundle. Runs
//    shorter than MIN_RUN are smoothed away. A route's own two directions on
//    a one-way pair stay two streets, each its own bundle.
// 3. Order. As for rail, each pair of routes is ordered once for every
//    bundle it runs through in a row, by which side each route leaves
//    toward (LOOK meters past each end): a route that turns left sits on
//    the left. A route then keeps its side of its companions while they go
//    on together, and a route that joins takes the side it comes from.
//    Where three or more routes' pairwise sides can't all be kept (they
//    disagree around a loop), the order is the closest the ranks allow, and
//    the routes cross; `crossings` counts them.
// 4. Slots, and easing between them, as rail: the bundle sits on the
//    middle of its routes' paths, each route `slot` widths from it; where a
//    route leaves, the smaller bundle eases from the slots it had to its
//    own over EASE meters (or by APART meters away from the routes that
//    left), so no line steps sideways at a corner.
// 5. Each piece takes back the frequency of the stretch it lies on, so it
//    keeps its route's tier look; a piece that crosses a change of tier is
//    cut there.
//
// The page turns `slot` into a `line-offset` of one frequent bus width plus
// a gap per slot, from the zoom where the widest bundle fits (network.js).

import { sharedTrack } from './sharedtrack.mjs';

export const SHARED = 35;
export const ALIGN = 25;
export const MIN_RUN = 70;
export const LOOK = 600;
export const EASE = 150;
export const APART = 80;
// A route sliding to a new slot moves in steps of this part of a slot.
export const EASE_STEP = 1 / 4;
const RULES = {
  sharedMeters: SHARED,
  alignCos: Math.cos((ALIGN * Math.PI) / 180),
  minRunMeters: MIN_RUN,
  lookMeters: LOOK,
  easeMeters: EASE,
  apartMeters: APART,
  // Buses don't end at platforms side by side; nothing to level.
  flushMeters: 0,
  blendMeters: 120,
  roundMeters: 30,
  easeStep: EASE_STEP,
  easeEqual: true,
  letters: false,
};
// How far from a stretch a piece's point can be and still take its tier
// (pieces are moved onto their bundle's middle, a few meters).
const TIER_REACH = 60;
const TIER_STEP = 10;

/**
 * `features` are bus stretch features (route, tier, stretch, ...). Returns
 * { features, places, crossings }: the routes as pieces with `slot`, each
 * with its stretch's properties; the bundles found (routes left to right,
 * meters, middle); and where two routes swap sides between bundles.
 */
export function busBundles(features) {
  const byRoute = new Map();
  for (const f of features) (byRoute.get(f.properties.route) ?? byRoute.set(f.properties.route, []).get(f.properties.route)).push(f);
  const whole = [...byRoute].map(([route, list]) => ({
    type: 'Feature',
    properties: { route },
    geometry: { type: 'MultiLineString', coordinates: list.flatMap((f) => partsOf(f.geometry)).filter((p) => p.length >= 2) },
  }));
  const { pieces, places, crossings } = sharedTrack(whole, [], RULES);
  const out = [];
  for (const piece of pieces) {
    const stretches = byRoute.get(piece.properties.route);
    out.push(...byStretch(piece, stretches));
  }
  return { features: out, places, crossings };
}

// A piece cut where the stretch it lies on changes, each part with that
// stretch's properties and the piece's slot.
function byStretch(piece, stretches) {
  const coords = piece.geometry.coordinates;
  const origin = coords[0];
  const kx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110540;
  const project = ([lon, lat]) => [(lon - origin[0]) * kx, (lat - origin[1]) * ky];
  const unproject = ([x, y]) => [round(x / kx + origin[0]), round(y / ky + origin[1])];
  const segments = stretches.flatMap((f, n) =>
    partsOf(f.geometry).flatMap((part) => {
      const pts = part.map(project);
      return pts.slice(1).map((b, i) => ({ a: pts[i], b, n }));
    }),
  );
  // Only segments near the piece matter.
  const pts = densify(coords.map(project), TIER_STEP);
  const [w, s, e, nn] = pts.reduce(([w, s, e, n], [x, y]) => [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const near = segments.filter(({ a, b }) => Math.max(a[0], b[0]) >= w - TIER_REACH && Math.min(a[0], b[0]) <= e + TIER_REACH && Math.max(a[1], b[1]) >= s - TIER_REACH && Math.min(a[1], b[1]) <= nn + TIER_REACH);
  const which = pts.map((p) => {
    let best = null;
    for (const seg of near) {
      const d = segmentDistance(p, seg.a, seg.b);
      if (!best || d < best.d) best = { d, n: seg.n };
    }
    return best ? best.n : 0;
  });
  // Single points that disagree with both neighbours are noise.
  for (let i = 1; i < which.length - 1; i++) if (which[i - 1] === which[i + 1]) which[i] = which[i - 1];
  const parts = [];
  for (let i = 0; i < pts.length; i++) {
    const last = parts.at(-1);
    if (last && last.n === which[i]) last.points.push(pts[i]);
    else parts.push({ n: which[i], points: last ? [last.points.at(-1), pts[i]] : [pts[i]] });
  }
  return parts
    .filter((p) => p.points.length >= 2)
    .map(({ n, points }) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: simplify(points).map(unproject) },
      properties: { ...stretches[n].properties, slot: piece.properties.slot },
    }));
}

function densify(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// Drop points where the line runs straight on (within half a meter).
function simplify(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [out.at(-1), points[i], points[i + 1]];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area / (Math.hypot(c[0] - a[0], c[1] - a[1]) || 1) > 0.5) out.push(b);
  }
  out.push(points.at(-1));
  return out;
}

function segmentDistance(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);
const round = (v) => Math.round(v * 1e5) / 1e5;
