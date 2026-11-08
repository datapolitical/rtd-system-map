// Bus routes that share a street are drawn side by side, as a bundle, the
// way rail on shared track is (DESIGN.md, "Shared track" and "Bus routes";
// a prototype, 2026-11-07). Each route is its own line, so a reader can
// follow one through downtown; drawn on top of each other, a street with
// eight routes read as one line at the strongest route's weight.
//
// This is the rail bundler (sharedtrack.mjs) run on buses with rules of
// their own:
//
// 1. Only routes that run every 30 minutes or better are bundled, and only
//    along the stretches where they do (stretches.mjs gives each stretch
//    its tier). Hourly, less than hourly, rush-hour and few-trip stretches
//    keep today's drawing: one line each on the street's centerline, at
//    their own thin look, beneath the bundle. The map is frequency first,
//    and the slow routes would double the width of every downtown bundle.
//    `tiers` says which tiers are bundled; the runner can bundle every tier
//    for comparison.
// 2. Each route once per street. A route's stretches are one line again
//    here, so it is bundled as a whole and keeps its place across a change
//    of tier. GTFS draws a route's two directions as two shapes a few
//    meters apart on a two-way street, and the second is folded into the
//    first (ownTrack): the other direction is kept only where it goes
//    somewhere the first doesn't, by at least OFF meters for at least
//    MIN_RUN. A one-way couplet is two streets, each its own bundle, which
//    is right; a bus pulling wide through a stop bay is not.
// 3. Routes within SHARED meters of each other, running within ALIGN degrees
//    of the same way, share a street (busnames.mjs's rule): a route that
//    crosses the street doesn't, so a downtown grid isn't one bundle.
//    Runs shorter than MIN_RUN, less than a block, are smoothed away.
// 4. Order. As for rail, each pair of routes is ordered once for every
//    bundle it runs through in a row, by which side each route leaves
//    toward (LOOK meters past each end): a route that turns left sits on
//    the left. A route then keeps its side of its companions while they go
//    on together, and a route that joins takes the side it comes from.
//    Where three or more routes' pairwise sides can't all be kept (they
//    disagree around a loop), the order is the closest the ranks allow, and
//    the routes cross; `crossings` counts them.
// 5. One path per bundle. Every route in a bundle is redrawn on the longest
//    member's path (sharedtrack's onCorridor), so the bundle is one
//    polyline and its offsets turn a corner together, instead of each
//    route's own shape wobbling a slot to the side. Where a route joins or
//    leaves, it swings onto the bundle's path over BLEND meters. The cut
//    between a route's pieces is moved CUT_SLIDE meters past the corner
//    where it parts from the others, so the corner is turned inside the
//    bundle at the route's slot (two pieces that meet at a corner, each
//    square to its own street, don't meet), and every corner of a bundle
//    is rounded to an arc wide enough for its innermost line (FILLET_PER_SLOT
//    per slot of half its width plus one): a line offset further than the
//    corner's radius would turn back on itself.
// 6. Slots, and easing between them, as rail: each route sits `slot` widths
//    from the bundle's path; where a route leaves, or goes from one bundle
//    into another, it eases from the slot it had to its new one over EASE
//    meters, EASE_PER_SLOT more for each slot it moves (within the run: by
//    its middle if it eases at both ends), in steps of EASE_STEP of a slot,
//    so no line steps sideways at a corner. The ease starts past the last
//    bend near the join (EASE_AFTER_BEND): the route holds its old slot
//    round the corner and slides over on the straight, since the short
//    pieces of a slide don't meet each other round a bend. Each step is a
//    piece of its own, since a piece has one offset. A route RTD draws in
//    several parts is one line across them, so it keeps its side through a
//    junction where three parts meet (the 38 and 43 swapped edges of the
//    widest downtown bundle there). A bundle is centered on its street where
//    it is widest; from there, each place along the street keeps the slots
//    of the routes running on into it from the place before, moving its
//    lines over together by up to DRIFT slots, so that a route holds its
//    course when another joins or leaves at the edge. Centering every place
//    slid all twelve lines of the widest bundle half a slot at every corner
//    where one route turned off, in short eased pieces, and the bundle
//    read as a weave.
// 7. Each piece takes back the frequency of the stretch it lies on, so it
//    keeps its route's tier look; a piece that crosses a change of tier is
//    cut there.
//
// The page turns `slot` into a `line-offset` of one frequent bus width times
// BUS_PITCH per slot (shared.js), from the zoom where the widest bundle fits
// in a block; further out the slots close and the bundle is one line again,
// the strongest route on top.

import { sharedTrack } from './sharedtrack.mjs';

export const SHARED = 35;
export const ALIGN = 25;
export const MIN_RUN = 100;
// A direction kept apart from the other where it is this far off: a
// freeway's two carriageways are 40 to 70 m apart and main draws both; a bus
// pulling wide through a stop bay is a few meters off.
export const OFF = 40;
export const LOOK = 600;
export const EASE = 150;
// Rail finishes an ease once the lines it left are APART meters away; buses
// part at street corners, where that is a few meters along, so the ease is
// by distance along alone.
export const APART = Infinity;
export const BLEND = 60;
// A cut between runs is moved this far past where the routes part, so a
// corner there is turned inside the bundle's piece; a bundle's corners are
// arcs of this many meters per slot of its half width plus one (the slot at
// the zoom the slots open, on the ground: a frequent bus's width times
// BUS_PITCH at BUS_BUNDLE_FROM, in meters at downtown's latitude).
export const CUT_SLIDE = 30;
export const FILLET_PER_SLOT = 12;
// An ease is this much longer per slot moved (a five-slot move over EASE
// alone crossed a street's width in a block).
export const EASE_PER_SLOT = 60;
// An ease starts past the last bend of more than this (between one 20 m
// step and the next) near the join: a route holds its old slot round the
// corner and slides over on the straight.
export const EASE_AFTER_BEND = 8;
// A route sliding to a new slot moves in steps of this part of a slot: at
// 14.5 about half a pixel, so the slide reads as a drift, not stairs.
export const EASE_STEP = 1 / 8;
// No piece of an ease is shorter than this (half a frequent line's width at
// 14.5): a move too steep for eighth-slot steps that long takes bigger
// steps instead. A route alone between two bundles moves from the one's
// slot to the other's over its whole length in one move.
export const PIECE = 5;
// A bundle keeps its lines' slots from the place before, moving over as a
// whole by up to this many slots (half a lane at the zoom the slots open),
// so a line that runs on holds its course when another joins or leaves.
export const DRIFT = 1.5;
// Runs of the same routes are one bundle only where they run side by side
// this far (or half the shorter run): a one-way pair (Broadway and Lincoln)
// touches at both ends and is two streets.
export const ALONGSIDE = 50;
// A loop at a route's end no longer than this (round a downtown block is
// about 500 m; through the Union Station concourse and back about 600) is
// left out, and the route ends where the loop begins, as the poster ends
// its lines at the station (DESIGN.md, "Bus routes", terminals).
export const LOOP = 800;
// A route that ends within this far of a transit center or Park-n-Ride
// (facilities.geojson, passed as `terminals`) ends at that circle's edge,
// and its lap of the terminal inside is left out: the terminal is a place
// the map marks, not a knot of every route's path through it (the poster
// ends its lines at the station box). Civic Center's block is 110 by 180 m
// about its point.
export const TERMINAL = 150;
export const BUNDLED_TIERS = ['frequent', 'every30'];
const RULES = {
  sharedMeters: SHARED,
  alignCos: Math.cos((ALIGN * Math.PI) / 180),
  minRunMeters: MIN_RUN,
  offMeters: OFF,
  lookMeters: LOOK,
  easeMeters: EASE,
  apartMeters: APART,
  // Buses don't end at platforms side by side; nothing to level.
  flushMeters: 0,
  blendMeters: BLEND,
  corridor: true,
  cutSlideMeters: CUT_SLIDE,
  filletMetersPerSlot: FILLET_PER_SLOT,
  easeMetersPerSlot: EASE_PER_SLOT,
  easeAfterBendDegrees: EASE_AFTER_BEND,
  joinParts: true,
  driftSlots: DRIFT,
  pieceMeters: PIECE,
  easeStep: EASE_STEP,
  easeEqual: true,
  letters: false,
  alongsideMeters: ALONGSIDE,
  loopMeters: LOOP,
  terminalMeters: TERMINAL,
};
// How far from a stretch a piece's point can be and still take its tier
// (pieces are moved onto their bundle's path, a few meters).
const TIER_REACH = 60;
const TIER_STEP = 25;

/**
 * `features` are bus stretch features (route, tier, stretch, ...). Returns
 * { features, places, crossings }: the routes' bundled stretches as pieces
 * with `slot`, each with its stretch's properties; the same stretches as
 * they came, marked `flat` (the map draws those below the bundling zoom);
 * and the stretches in other tiers as they came; the bundles found (routes
 * left to right, meters, middle); and where two routes swap sides between
 * bundles. `tiers` are the tiers that bundle; `terminals` are [lon, lat]
 * points of transit centers and Park-n-Rides, and `ends` each route's end
 * points (route -> [[lon, lat], ...], from the directory): a route that
 * ends at a terminal ends at its edge (sharedtrack's atTerminals).
 */
export function busBundles(features, { tiers = BUNDLED_TIERS, terminals = [], ends = {} } = {}) {
  const bundled = features.filter((f) => tiers.includes(f.properties.tier));
  const rest = features.filter((f) => !tiers.includes(f.properties.tier));
  const byRoute = new Map();
  for (const f of bundled) (byRoute.get(f.properties.route) ?? byRoute.set(f.properties.route, []).get(f.properties.route)).push(f);
  const whole = [...byRoute].map(([route, list]) => ({
    type: 'Feature',
    properties: { route, ends: ends[route] ?? [] },
    geometry: { type: 'MultiLineString', coordinates: list.flatMap((f) => partsOf(f.geometry)).filter((p) => p.length >= 2) },
  }));
  const { pieces, places, crossings } = sharedTrack(whole, terminals, RULES);
  const out = [];
  for (const piece of pieces) {
    const stretches = byRoute.get(piece.properties.route);
    out.push(...byStretch(piece, stretches));
  }
  // The stretches as they came, marked `flat`, for the map below the zoom
  // the bundles open at: there it draws each street once, as main does, and
  // a route's drawing is RTD's own path, not the bundle's.
  const flat = bundled.map((f) => ({ ...f, properties: { ...f.properties, flat: 1 } }));
  return { features: [...out, ...flat, ...rest], places, crossings };
}

// A piece cut where the stretch it lies on changes, each part with that
// stretch's properties and the piece's slot.
function byStretch(piece, stretches) {
  if (stretches.length === 1) return [{ ...piece, properties: { ...stretches[0].properties, slot: piece.properties.slot } }];
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
