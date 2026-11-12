// Station shapes against the lines (issue #42, rules SS01-SS04, PG01 in
// qa/rules/): the faults Chris found by eye on 2026-11-11 that no detector
// described. A rail station draws its real platforms, roofs and building from
// OpenStreetMap (`structures`), and a station with two groups of platforms
// draws a second mark joined to its own by a dotted walk (`platforms`). The
// lines, the platforms, the roofs and the marks are then four things drawn
// from different data, and each rule here is a way they can part:
//
//  - off-platform (SS01): a rail line ends at a station whose platforms are
//    drawn, and its end is not beside any of them (more than `beside` metres
//    from every platform polygon of that station). Also, past the rule's
//    words, a line that runs through a station and passes more than `beside`
//    metres from every one of its platforms.
//  - skew (SS02): the line's last stretch (`stretch` m) is not parallel to the
//    platform it stops at: more than `skew` degrees off the platform's long
//    axis, and less than `crossing` degrees (a line that only crosses a
//    platform is not one that should run along it). A line that runs through
//    a station is judged on the stretch abreast of the platform's middle, at
//    `skewThrough` degrees.
//  - past-roof (SS03): a hall roof (kind `hall`, or a `canopy` at least
//    `hallWidth` m wide and `hallArea` m2, as the build calls a hall) stands
//    over the end of the line, and the line ends within `tip` metres of the
//    roof's far edge, or past it: it should end under the roof.
//  - past-mark (SS04): every line at a station mark ends there, and a platform
//    or a narrow canopy of the station is drawn more than `pastMark` metres
//    beyond the mark, on the side the lines do not come from.
//  - walk-bent (PG01): a station's two marks, the walk between them and the
//    bus hall between them are not one straight line: the bearing from mark to
//    mark is more than `bearing` degrees off the hall's long axis, or a mark
//    is more than `axisOff` metres off that axis, or the walk is not straight.
//  - platform-covered (a proposal, not in DESIGN.md; a lead; zoom 16 and up): a
//    platform is beside the track, so the lines' strokes as drawn should not
//    cover more than `covered` of its width along `coveredLength` of its
//    length.
//
// All of it is measured on what the model draws at one zoom (`model.zoom(z)`),
// in its screen px, and judged in ground metres (a px is `metresPerPx` m):
// the model's `areas` give the polygons that are drawn, but not their kind or
// station, so the build's own `structures`, `platforms` and `terminals`
// collections are passed in `data` (model.data) and read by the area's
// `index`. A platform not drawn at the zoom (the structures layers start at
// z14.2) is not judged at it. Lines are measured on their centrelines
// (`parts`), which is the track; only the stroke rule reads the lines as drawn
// (`drawn`, with their offset and width). Nothing names a station, a line or a
// place: a station is whatever the marks and polygons say, by id.

import { toLonLat } from './mercator.mjs';

export const SHAPE_KINDS = ['off-platform', 'skew', 'past-roof', 'past-mark', 'walk-bent', 'platform-covered'];

// Metres unless it says degrees or a share.
export const LIMITS = {
  // SS01: the end is beside a platform of its station.
  beside: 15,
  // SS02: the stretch of line measured, the angle allowed, the angle past which
  // the line is crossing the platform and not meant to run along it.
  stretch: 100, skew: 2, skewThrough: 2.75, crossing: 30, minRun: 30,
  // A platform has an axis worth measuring against when it is this long, and
  // this many times longer than it is wide.
  platformMin: 20, platformAspect: 3,
  // SS03: a roof is a hall at this width and area (scripts/lib/structures.mjs
  // HALL_ROOF_WIDTH, HALL_ROOF_AREA); the line must end this far short of its
  // far edge; a roof is over the line's end when the line's last `underSpan`
  // metres touch it.
  hallWidth: 10, hallArea: 600, tip: 5, underSpan: 30,
  // SS04: a platform or roof may stand this far past the mark; a mark is an
  // end mark when every rail line within `markNear` of it has its end within
  // `markReach` of it; a platform belongs to a mark within `platformOfMark`
  // of its middle and `across` either side of the track.
  pastMark: 3, markNear: 25, markReach: 40, platformOfMark: 250, across: 25,
  // The station a line ends at: the nearest mark of its line within this.
  stationReach: 150,
  // PG01: the bearing mark to mark against the hall's axis, each mark's
  // distance from the axis, the walk's bend, and how long against wide a hall
  // must be to have an axis (the build's own rule, platforms.mjs walkAxis).
  bearing: 2, axisOff: 3, walkBend: 2, hallAspect: 2,
  // Platform under the line: the share of a platform's width the strokes may
  // cover, over this share of its length.
  covered: 0.5, coveredLength: 0.8, coveredFrom: 16,
};

const metresPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
const DEG = Math.PI / 180;

// --- geometry in px -------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const norm = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = norm(a) || 1; return [a[0] / l, a[1] / l]; };
const dist = (a, b) => norm(sub(a, b));

function segDist(p, a, b) {
  const d = sub(b, a), l2 = dot(d, d);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  const q = [a[0] + d[0] * t, a[1] + d[1] * t];
  return { d: dist(p, q), q, t };
}

function inRing(p, ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Px from p to a ring's edge; 0 inside it.
function ringDist(p, ring) {
  if (inRing(p, ring)) return 0;
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) best = Math.min(best, segDist(p, ring[i - 1], ring[i]).d);
  return best;
}

// Where the ray from p along u (unit) first crosses a ring's edge, as a
// distance, or Infinity.
function rayHit(p, u, ring) {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], e = sub(ring[i], a);
    const den = cross(u, e);
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, p);
    const t = cross(w, e) / den, s = cross(w, u) / den;
    if (t > 1e-9 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return best;
}

// A ring's area, centre and long axis, in px. By default the axis comes from
// the ring's area moments (not its corner points: a hall drawn with extra
// corners at one end keeps its axis). With `box` it is the long side of the
// smallest rectangle that holds the ring: a platform with a bump or a notch
// in it keeps the direction of its body.
function shapeOf(ring, { box = false } = {}) {
  const o = ring[0];
  const pts = ring.map((p) => [p[0] - o[0], p[1] - o[1]]);
  const n = pts.length;
  let a = 0, cx = 0, cy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * f;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * f;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * f;
  }
  if (Math.abs(a) < 1e-9) return null;
  const sign = Math.sign(a);
  const area = Math.abs(a) / 2;
  cx /= 3 * a; cy /= 3 * a;
  sxx = (sxx * sign) / 12 - area * cx * cx;
  syy = (syy * sign) / 12 - area * cy * cy;
  sxy = (sxy * sign) / 24 - area * cx * cy;
  let dir = [Math.cos(0.5 * Math.atan2(2 * sxy, sxx - syy)), Math.sin(0.5 * Math.atan2(2 * sxy, sxx - syy))];
  let centre = [o[0] + cx, o[1] + cy];
  if (box) {
    let best = null;
    for (let i = 1; i < ring.length; i++) {
      const e = sub(ring[i], ring[i - 1]);
      if (norm(e) < 1e-6) continue;
      const u = unit(e), v = [-u[1], u[0]];
      let t0 = Infinity, t1 = -Infinity, n0 = Infinity, n1 = -Infinity;
      for (const p of ring) { const t = dot(p, u), m = dot(p, v); t0 = Math.min(t0, t); t1 = Math.max(t1, t); n0 = Math.min(n0, m); n1 = Math.max(n1, m); }
      const size = (t1 - t0) * (n1 - n0);
      if (!best || size < best.size) best = { size, u, v, t0, t1, n0, n1 };
    }
    if (best) {
      const long = best.t1 - best.t0 >= best.n1 - best.n0;
      dir = long ? best.u : best.v;
      const [l0, l1, w0, w1] = long ? [best.t0, best.t1, best.n0, best.n1] : [best.n0, best.n1, best.t0, best.t1];
      const across = long ? best.v : best.u;
      const mid = [dir[0] * (l0 + l1) / 2 + across[0] * (w0 + w1) / 2, dir[1] * (l0 + l1) / 2 + across[1] * (w0 + w1) / 2];
      centre = mid;
      return { area, centre, dir, lo: -(l1 - l0) / 2, hi: (l1 - l0) / 2, length: l1 - l0, width: area / (l1 - l0), aspect: (l1 - l0) / Math.max(1e-9, w1 - w0) };
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (const p of ring) { const t = dot(sub(p, centre), dir); lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const length = hi - lo;
  return { area, centre, dir, lo, hi, length, width: length ? area / length : 0, aspect: area ? (length * length) / area : 0 };
}

// --- reading the model ----------------------------------------------------

const routesOf = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
const isRail = (l) => l.source === 'routes' && (l.mode ?? l.properties?.mode) === 'rail' && l.route != null;

// A ring list for each feature the model drew: the outer rings only. The
// model's `parts` are every ring of a polygon, holes included.
function outerRings(parts, geometry) {
  if (geometry?.type === 'Polygon') return parts.slice(0, 1);
  if (geometry?.type === 'MultiPolygon') {
    const out = [];
    let i = 0;
    for (const poly of geometry.coordinates) { if (parts[i]) out.push(parts[i]); i += poly.length; }
    return out;
  }
  return parts;
}

/**
 * The structures drawn at this zoom, each ring with its kind, station and
 * shape (metres via `mpp`). `kind` and `station` are the build's, read from
 * the `structures` collection by the area's index; without it the kind is the
 * layer's and there is no station.
 */
function structuresOf(zoom, data) {
  const out = [];
  for (const a of zoom.areas ?? []) {
    if (a.source !== 'structures') continue;
    const f = data?.structures?.features?.[a.index];
    const kind = f?.properties?.kind ?? (/platform/.test(a.layer) ? 'platform' : /canopy/.test(a.layer) ? 'canopy' : 'building');
    const station = f?.properties?.station != null ? String(f.properties.station) : '';
    for (const ring of outerRings(a.parts ?? [], f?.geometry)) {
      if (ring.length < 4) continue;
      const shape = shapeOf(ring, { box: kind === 'platform' });
      if (shape) out.push({ index: a.index, layer: a.layer, kind, station, ring, ...shape });
    }
  }
  return out;
}

// The model's rail lines, one per feature (a casing, an edge and the line
// itself draw the same piece), with the widest stroke and its layer.
function railPieces(zoom) {
  const pieces = new Map();
  for (const l of zoom.lines ?? []) {
    if (!isRail(l)) continue;
    const key = `${l.source}:${l.index}`;
    const w = l.drawnWidth ?? l.width ?? 0;
    const had = pieces.get(key);
    if (!had) pieces.set(key, { key, route: String(l.route), layer: l.layer, line: l, parts: l.parts, drawn: l.drawn ?? l.parts, width: w, cap: l.cap, layers: [l.layer] });
    else {
      had.layers.push(l.layer);
      if (w > had.width) { had.width = w; had.drawn = l.drawn ?? l.parts; had.cap = l.cap; }
      if (l.layer === 'rail') had.layer = 'rail';
    }
  }
  return [...pieces.values()];
}

// Every free end of a rail line: an end of a piece where no other piece of the
// same route starts or ends (pieces of one route meet end to end at the same
// point). Each with the way it points (over the last `overMetres` m) and the
// piece's centreline running to it.
function freeEnds(pieces, mppAt, overMetres) {
  const at = new Map();
  const key = (route, p) => `${route}|${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  for (const piece of pieces) {
    for (const part of piece.parts) {
      if (part.length < 2) continue;
      for (const p of [part[0], part.at(-1)]) at.set(key(piece.route, p), (at.get(key(piece.route, p)) ?? 0) + 1);
    }
  }
  const ends = [];
  for (const piece of pieces) {
    for (const part of piece.parts) {
      if (part.length < 2) continue;
      for (const reverse of [false, true]) {
        const run = reverse ? [...part].reverse() : part;
        const E = run.at(-1);
        if (at.get(key(piece.route, E)) !== 1) continue;
        // The way it points: from the point `overMetres` back along the line.
        const back = pointBack(run, overMetres / mppAt(E));
        if (!back) continue;
        ends.push({ piece, route: piece.route, run, E, out: unit(sub(E, back.p)) });
      }
    }
  }
  return ends;
}

// The point `d` px back from the end of a run (the run's last point), and how
// far back it really is (the run may be shorter).
function pointBack(run, d) {
  let walked = 0;
  for (let i = run.length - 1; i > 0; i--) {
    const a = run[i], b = run[i - 1], l = dist(a, b);
    if (walked + l >= d && l > 0) {
      const t = (d - walked) / l;
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d, i: i - 1 };
    }
    walked += l;
  }
  return run.length > 1 && walked > 0 ? { p: run[0], d: walked, i: 0 } : null;
}

// The run's points within `d` px of its end, end first, one every `step` px
// (a straight run has no vertex under a roof it passes beneath).
function stretchBack(run, d, step) {
  const out = [run.at(-1)];
  let walked = 0, next = step;
  for (let i = run.length - 1; i > 0 && walked < d; i--) {
    const a = run[i], b = run[i - 1], l = dist(a, b);
    while (next <= walked + l && next <= d) {
      const t = (next - walked) / l;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      next += step;
    }
    walked += l;
  }
  return out;
}

// The station marks the lines stop at: station marks and platform-group marks
// that carry lines, once each (the keep-out layers repeat them).
function stationMarks(zoom) {
  const seen = new Set();
  const out = [];
  for (const m of zoom.marks ?? []) {
    const isStation = m.source === 'stations' || (m.source === 'platforms' && m.properties?.kind === 'mark');
    if (!isStation || !m.properties?.lines) continue;
    const key = `${m.source}:${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ m, at: m.at, id: String(m.properties.id), lines: routesOf(m.properties.lines), group: m.source === 'platforms' });
  }
  return out;
}

const isHallRoof = (s, mpp, lim) => s.kind === 'hall' || (s.kind === 'canopy' && s.width * mpp >= lim.hallWidth && s.area * mpp * mpp >= lim.hallArea);

// --- the context every rule reads -----------------------------------------

function contextOf(zoom, data, lim) {
  const z = zoom.z;
  const mppAt = (p) => metresPerPx(toLonLat(p, z)[1], z);
  const structures = structuresOf(zoom, data);
  const pieces = railPieces(zoom);
  const marks = stationMarks(zoom);
  const ends = freeEnds(pieces, mppAt, 6);
  for (const e of ends) {
    e.mpp = mppAt(e.E);
    // The station it ends at: the nearest mark that lists its line.
    let best = null;
    for (const k of marks) {
      if (!k.lines.includes(e.route)) continue;
      const d = dist(k.at, e.E) * e.mpp;
      if (d <= lim.stationReach && (!best || d < best.d)) best = { ...k, d };
    }
    e.mark = best;
    e.station = best?.id ?? null;
  }
  return { zoom, z, mppAt, structures, pieces, marks, ends, data, lim };
}

const fault = (kind, layer, route, px, msg, extra = {}) => ({ kind, layer, route, px: [Math.round(px[0] * 10) / 10, Math.round(px[1] * 10) / 10], msg, ...extra });
const m1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

// The undirected angle between two directions, 0 to 90 degrees.
const axisAngle = (u, v) => Math.acos(Math.min(1, Math.abs(dot(u, v)))) / DEG;

// --- SS01, SS02: a line runs along its platform ---------------------------

// A platform has an axis to measure against.
const hasAxis = (s, mpp, lim) => s.kind === 'platform' && s.length * mpp >= lim.platformMin && s.aspect >= lim.platformAspect;

/**
 * SS01. For each free rail end at a station whose platforms are drawn: the
 * distance (m) to the nearest platform of that station.
 * `{ end, platform, d }`.
 */
export function endFits(ctx) {
  const { structures, ends } = ctx;
  const out = [];
  for (const e of ends) {
    if (!e.station) continue;
    let best = null;
    for (const s of structures) {
      if (s.kind !== 'platform' || s.station !== e.station) continue;
      const d = ringDist(e.E, s.ring) * e.mpp;
      if (!best || d < best.d) best = { platform: s, d };
    }
    if (best) out.push({ end: e, ...best });
  }
  return out;
}

// The runs of a centreline abreast of a platform: the parts of it inside the
// platform's length and within `band` px of its axis, each a polyline in the
// order the line runs. A run is cut where the line leaves either.
function abreastRuns(part, P, band) {
  const across = [-P.dir[1], P.dir[0]];
  const runs = [];
  let cur = null, joined = false;
  for (let i = 1; i < part.length; i++) {
    const a = part[i - 1], b = part[i];
    const ta = dot(sub(a, P.centre), P.dir), tb = dot(sub(b, P.centre), P.dir);
    const na = dot(sub(a, P.centre), across), nb = dot(sub(b, P.centre), across);
    let u0 = 0, u1 = 1;
    // Each constraint c(u) = ca + (cb - ca) u inside [lo, hi].
    for (const [ca, cb, lo, hi] of [[ta, tb, P.lo, P.hi], [na, nb, -band, band]]) {
      const d = cb - ca;
      if (Math.abs(d) < 1e-12) { if (ca < lo || ca > hi) { u0 = 1; u1 = 0; } continue; }
      const x = (lo - ca) / d, y = (hi - ca) / d;
      u0 = Math.max(u0, Math.min(x, y));
      u1 = Math.min(u1, Math.max(x, y));
    }
    if (u0 > u1) { cur = null; joined = false; continue; }
    const at = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    if (cur && joined && u0 <= 1e-9) cur.push(at(u1));
    else { cur = [at(u0), at(u1)]; runs.push(cur); }
    joined = u1 >= 1 - 1e-9;
  }
  return runs;
}

// Windows of `want` px along a run: `last` (reaching back from the run's last
// point), `first`, `middle`, and `all`, at half-window steps from its end.
// Each as its two points.
function windowsOf(run, want) {
  const total = run.reduce((s, p, i) => s + (i ? dist(p, run[i - 1]) : 0), 0);
  const at = (s) => {
    let walked = 0;
    for (let i = 1; i < run.length; i++) {
      const l = dist(run[i], run[i - 1]);
      if (walked + l >= s - 1e-9 && l > 0) { const t = (s - walked) / l; return [run[i - 1][0] + (run[i][0] - run[i - 1][0]) * t, run[i - 1][1] + (run[i][1] - run[i - 1][1]) * t]; }
      walked += l;
    }
    return run.at(-1);
  };
  const w = Math.min(want, total);
  if (!(w > 0)) return { total, all: [] };
  const win = (s0) => [at(s0), at(s0 + w)];
  const all = [];
  for (let s1 = total; ; s1 -= w / 2) {
    const s0 = Math.max(0, s1 - w);
    all.push(win(s0));
    if (s0 <= 0) break;
  }
  return { total, all, last: win(total - w), first: win(0), middle: win((total - w) / 2) };
}

/**
 * SS02. For each platform that has an axis, the lines of its station that run
 * along it: the run of each beside it (within `beside` metres of its axis,
 * over its length) and the largest angle between the platform's axis and any
 * `stretch`-long window of the run, ends included. A run that is short (under
 * `minRun`) or crosses the platform at more than `crossing` degrees is not
 * running along it. One entry per platform, with its worst run:
 * `{ platform, route, routes, angle, at (px), length (m), free (does the run reach a free end) }`.
 */
export function abreastFits(ctx) {
  const { structures, pieces, marks, ends, lim } = ctx;
  const linesOf = new Map();
  for (const k of marks) {
    if (!linesOf.has(k.id)) linesOf.set(k.id, new Set());
    for (const r of k.lines) linesOf.get(k.id).add(r);
  }
  const out = [];
  for (const P of structures) {
    if (P.kind !== 'platform' || !linesOf.has(P.station)) continue;
    const mpp = ctx.mppAt(P.centre);
    if (!hasAxis(P, mpp, lim)) continue;
    const band = (lim.beside + (P.width * mpp) / 2) / mpp;
    const reach = P.length / 2 + band;
    const best = { end: null, middle: null, max: null };
    const routes = new Set();
    const keep = (name, route, [a, b], total) => {
      const angle = axisAngle(unit(sub(b, a)), P.dir);
      // Reported at the middle of the window: that is where the line has drifted
      // half way across the platform.
      if (!best[name] || angle > best[name].angle) best[name] = { route, angle, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], stretch: dist(a, b) * mpp, run: total * mpp };
    };
    for (const piece of pieces) {
      if (!linesOf.get(P.station).has(piece.route)) continue;
      for (const part of piece.parts) {
        if (part.length < 2) continue;
        // Cheap cull: some vertex or segment within reach of the platform.
        let near = false;
        for (let i = 0; i < part.length && !near; i++) near = dist(part[i], P.centre) <= reach || (i > 0 && segDist(P.centre, part[i - 1], part[i]).d <= reach);
        if (!near) continue;
        for (const run of abreastRuns(part, P, band)) {
          const { total, all, last, first, middle } = windowsOf(run, lim.stretch / mpp);
          if (total * mpp < lim.minRun || !all.length) continue;
          routes.add(piece.route);
          // Does the run reach a free end of its line (and which side)?
          const atEnd = (p) => ends.some((e) => e.piece === piece && dist(e.E, p) < 1e-6);
          const endsHere = atEnd(run.at(-1)), startsHere = atEnd(run[0]);
          if (endsHere) keep('end', piece.route, last, total);
          if (startsHere) keep('end', piece.route, first, total);
          if (!endsHere && !startsHere) keep('middle', piece.route, middle, total);
          for (const w of all) keep('max', piece.route, w, total);
        }
      }
    }
    if (best.max) out.push({ platform: P, routes: [...routes], ...best });
  }
  return out;
}

/**
 * The lines of each station against the station's platforms: for each rail
 * route a station's marks list, the distance (m) from its centreline to the
 * nearest platform of the station, and the point of the line nearest it.
 * `{ station, route, d, at }`.
 */
export function lineToPlatform(ctx) {
  const { structures, pieces, marks } = ctx;
  const out = [];
  const stations = new Map();
  for (const k of marks) {
    if (!stations.has(k.id)) stations.set(k.id, { lines: new Set(), ats: [] });
    for (const r of k.lines) stations.get(k.id).lines.add(r);
    stations.get(k.id).ats.push(k.at);
  }
  for (const [station, { lines, ats }] of stations) {
    const plats = structures.filter((s) => s.kind === 'platform' && s.station === station);
    if (!plats.length) continue;
    const mpp = ctx.mppAt(ats[0]);
    const step = 2 / mpp;
    for (const route of lines) {
      // The route's centreline within 400 m of one of the station's marks,
      // sampled every 2 m (a straight run has no vertex beside the platform).
      let best = Infinity, at = null;
      for (const piece of pieces) {
        if (piece.route !== route) continue;
        for (const part of piece.parts) {
          for (let i = 1; i < part.length; i++) {
            const a = part[i - 1], b = part[i];
            if (!ats.some((k) => segDist(k, a, b).d * mpp <= 400)) continue;
            const n = Math.max(1, Math.ceil(dist(a, b) / step));
            for (let j = 0; j <= n; j++) {
              const p = [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n];
              for (const s of plats) {
                const d = ringDist(p, s.ring) * mpp;
                if (d < best) { best = d; at = p; }
              }
            }
          }
        }
      }
      if (Number.isFinite(best)) out.push({ station, route, d: best, at });
    }
  }
  return out;
}

export function alongPlatformFaults(ctx) {
  const { lim } = ctx;
  const faults = [];
  const flagged = new Set();
  for (const f of endFits(ctx)) {
    if (f.d <= lim.beside) continue;
    const e = f.end;
    flagged.add(`${e.station}|${e.route}`);
    faults.push(fault('off-platform', e.piece.layer, e.route, e.E, `${e.route} on ${e.piece.layer} ends ${m1(f.d)} m from the nearest platform of its station (${lim.beside} m allowed): it stops short of it`, { station: e.station, metres: f.d }));
  }
  for (const f of lineToPlatform(ctx)) {
    if (f.d <= lim.beside || flagged.has(`${f.station}|${f.route}`)) continue;
    faults.push(fault('off-platform', 'rail', f.route, f.at, `${f.route} runs ${m1(f.d)} m from the nearest platform of its station (${lim.beside} m allowed): the platform is not beside its line`, { station: f.station, metres: f.d }));
  }
  for (const f of abreastFits(ctx)) {
    // Two judgements: the line's last stretch where it ends at the platform
    // (the rule's own words), and the stretch abreast of the platform's middle
    // for a line that runs through (where a curve in RTD's line against a
    // straight platform shows, so a little more is allowed).
    for (const [w, allow, how] of [[f.end, lim.skew, ' before its end'], [f.middle, lim.skewThrough, ' abreast of its middle']]) {
      if (!w || !(w.angle > allow && w.angle < lim.crossing)) continue;
      const routes = f.routes.includes(w.route) ? w.route : f.routes.join(' ');
      faults.push(fault('skew', 'rail', routes, w.at, `${routes} runs ${m1(w.angle)} degrees off its platform over ${Math.round(w.stretch)} m${how} (${allow} allowed): not parallel to it`, { station: f.platform.station, degrees: w.angle }));
    }
  }
  return faults;
}

// --- SS03: the line ends under the roof ------------------------------------

/**
 * For each free rail end under a hall roof: how far the roof goes on past the
 * end, along the line. `{ end, roof, ahead (m, 0 when the end is past the
 * roof), past (m past the roof's edge, when it is) }`.
 */
export function roofFits(ctx) {
  const { structures, ends, lim } = ctx;
  const out = [];
  for (const e of ends) {
    if (!e.station) continue;
    const span = stretchBack(e.run, lim.underSpan / e.mpp, 1 / e.mpp);
    for (const s of structures) {
      if (s.station !== e.station || !isHallRoof(s, e.mpp, lim)) continue;
      // Is the roof over the line's end: any of its last stretch under it.
      const under = span.some((p) => inRing(p, s.ring));
      if (!under) continue;
      const inside = inRing(e.E, s.ring);
      let ahead = 0, past = 0;
      if (inside) {
        const hit = rayHit(e.E, e.out, s.ring);
        ahead = (Number.isFinite(hit) ? hit : 0) * e.mpp;
      } else {
        // Past the roof: how far back its edge is.
        const back = span.find((p) => inRing(p, s.ring));
        past = back ? dist(back, e.E) * e.mpp : 0;
      }
      out.push({ end: e, roof: s, ahead, past });
    }
  }
  return out;
}

export function roofFaults(ctx) {
  const { lim } = ctx;
  const faults = [];
  for (const f of roofFits(ctx)) {
    if (f.ahead >= lim.tip) continue;
    const e = f.end;
    const where = f.past > 0 ? `${m1(f.past)} m past the edge of the roof` : `${m1(f.ahead)} m from the roof's far edge`;
    faults.push(fault('past-roof', e.piece.layer, e.route, e.E, `${e.route} on ${e.piece.layer} ends ${where} over it (at least ${lim.tip} m short of it allowed): it should end under the roof, not at its tip`, { station: e.station, metres: f.ahead }));
  }
  return faults;
}

// --- SS04: nothing stands past the mark ------------------------------------

/**
 * The marks every rail line near which ends there: `{ mark, ends, out }`,
 * `out` the way the lines point past the mark.
 */
export function endMarks(ctx) {
  const { marks, pieces, ends, lim } = ctx;
  const out = [];
  for (const k of marks) {
    const mpp = ctx.mppAt(k.at);
    const nearPx = lim.markNear / mpp, reachPx = lim.markReach / mpp;
    // The routes drawn near the mark.
    const near = new Set();
    for (const piece of pieces) {
      let close = false;
      for (const part of piece.parts) {
        for (let i = 1; i < part.length && !close; i++) {
          const a = part[i - 1], b = part[i];
          if (Math.min(a[0], b[0]) - nearPx > k.at[0] || Math.max(a[0], b[0]) + nearPx < k.at[0]) continue;
          if (Math.min(a[1], b[1]) - nearPx > k.at[1] || Math.max(a[1], b[1]) + nearPx < k.at[1]) continue;
          if (segDist(k.at, a, b).d <= nearPx) close = true;
        }
        if (close) break;
      }
      if (close) near.add(piece.route);
    }
    if (!near.size) continue;
    // Every one of them has its end at the mark.
    const mine = [];
    let all = true;
    for (const route of near) {
      const e = ends.filter((x) => x.route === route && dist(x.E, k.at) <= reachPx).sort((a, b) => dist(a.E, k.at) - dist(b.E, k.at))[0];
      if (!e) { all = false; break; }
      mine.push(e);
    }
    if (!all) continue;
    const mean = unit(mine.reduce((s, e) => [s[0] + e.out[0], s[1] + e.out[1]], [0, 0]));
    if (mine.some((e) => dot(e.out, mean) < Math.cos(25 * DEG))) continue;
    out.push({ mark: k, ends: mine, out: mean, mpp });
  }
  return out;
}

export function pastMarkFaults(ctx) {
  const { structures, lim } = ctx;
  const faults = [];
  const seen = new Set();
  for (const em of endMarks(ctx)) {
    const k = em.mark, mpp = em.mpp;
    const across = [-em.out[1], em.out[0]];
    for (const s of structures) {
      if (s.station !== k.id) continue;
      const roof = s.kind === 'canopy' && !isHallRoof(s, mpp, lim);
      if (s.kind !== 'platform' && !roof) continue;
      if (dist(s.centre, k.at) * mpp > lim.platformOfMark) continue;
      // Beside this mark's track, not another's across the yard.
      const sides = s.ring.map((p) => dot(sub(p, k.at), across) * mpp);
      if (Math.min(...sides) > lim.across || Math.max(...sides) < -lim.across) continue;
      let far = null, over = -Infinity;
      for (const p of s.ring) {
        const t = dot(sub(p, k.at), em.out) * mpp;
        if (t > over) { over = t; far = p; }
      }
      if (over <= lim.pastMark) continue;
      const key = `${s.index}:${k.m.source}:${k.m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lines = [...new Set(em.ends.map((e) => e.route))].join(' ');
      faults.push(fault('past-mark', s.layer, lines, far, `${s.kind} of station ${k.id} stands ${m1(over)} m past the mark that ${lines} end at (${lim.pastMark} m allowed)`, { station: k.id, metres: over }));
    }
  }
  return faults;
}

// --- PG01: the marks, the walk and the hall in one line --------------------

// The terminal halls drawn at this zoom: the ring, its axis, and the id.
function hallsOf(zoom, data) {
  const out = [];
  for (const a of zoom.areas ?? []) {
    if (a.source !== 'terminals') continue;
    const f = data?.terminals?.features?.[a.index];
    for (const ring of outerRings(a.parts ?? [], f?.geometry)) {
      if (ring.length < 4) continue;
      const shape = shapeOf(ring);
      if (shape) out.push({ index: a.index, layer: a.layer, id: f?.properties?.id != null ? String(f.properties.id) : '', ring, ...shape });
    }
  }
  return out;
}

/**
 * Each walk between a station's two marks that a hall lies across: the angle
 * of the walk to the hall's axis, each mark's distance from the axis, the
 * walk's bend. `{ walk, hall, marks: [a, b], angle, off: [da, db] (m), bend (m) }`.
 */
export function walkFits(ctx) {
  const { zoom, data, lim } = ctx;
  const halls = hallsOf(zoom, data).filter((h) => h.aspect >= lim.hallAspect);
  const out = [];
  for (const l of zoom.lines ?? []) {
    if (l.source !== 'platforms' || l.properties?.kind !== 'join') continue;
    const part = (l.drawn ?? l.parts)?.[0];
    if (!part || part.length < 2) continue;
    const id = String(l.properties.id ?? '');
    // The walk runs from the station's own mark to the group's. The marks are
    // the icons' centres when they are drawn, the walk's ends when not.
    const nearest = (p, pick) => {
      let best = null;
      for (const m of zoom.marks ?? []) {
        if (!pick(m) || String(m.properties?.id) !== id) continue;
        const d = dist(m.at, p);
        if (!best || d < best.d) best = { at: m.at, d };
      }
      return best && best.d < 6 ? best.at : p;
    };
    const a = nearest(part[0], (m) => m.source === 'stations');
    const b = nearest(part.at(-1), (m) => m.source === 'platforms' && m.properties?.kind === 'mark');
    if (dist(a, b) < 1) continue;
    const mpp = ctx.mppAt(a);
    // The hall the walk crosses.
    let hall = null, within = 0;
    for (const h of halls) {
      let inside = 0;
      const n = 40;
      for (let i = 0; i <= n; i++) if (inRing([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n], h.ring)) inside++;
      if (inside > within) { within = inside; hall = h; }
    }
    if (!hall || within < 3) continue;
    const walk = unit(sub(b, a));
    const angle = axisAngle(walk, hall.dir);
    const off = [a, b].map((p) => Math.abs(cross(sub(p, hall.centre), hall.dir)) * mpp);
    // How far the walk's own points stray from the line between the marks.
    const bend = Math.max(0, ...part.map((p) => Math.abs(cross(sub(p, a), walk)) * mpp));
    out.push({ walk: l, hall, marks: [a, b], id, angle, off, bend, mpp });
  }
  return out;
}

export function walkFaults(ctx) {
  const { lim } = ctx;
  const faults = [];
  for (const f of walkFits(ctx)) {
    const why = [];
    if (f.angle > lim.bearing) why.push(`the walk runs ${m1(f.angle)} degrees off the hall's long axis (${lim.bearing} allowed)`);
    const worst = f.off[0] >= f.off[1] ? 0 : 1;
    if (f.off[worst] > lim.axisOff) why.push(`the ${worst ? 'group' : 'station'} mark stands ${m1(f.off[worst])} m off that axis (${lim.axisOff} allowed)`);
    if (f.bend > lim.walkBend) why.push(`the walk bends ${m1(f.bend)} m`);
    if (!why.length) continue;
    faults.push(fault('walk-bent', f.walk.layer, null, f.marks[worst], `station ${f.id}: its two marks, the walk and the hall are not one straight line: ${why.join('; ')}`, { station: f.id, degrees: f.angle }));
  }
  return faults;
}

// --- a platform under the line (a proposal) --------------------------------

/**
 * For each platform drawn: the share of its width the rail strokes cover,
 * sampled along its axis, and the share of its length over which that is more
 * than `covered`. `{ platform, length (m), width (m), coveredShare (0 to 1), mean,
 * offset (m, the line's mean distance from the platform's middle line) }`.
 */
export function strokeCover(ctx) {
  const { structures, pieces, lim } = ctx;
  const out = [];
  const drawn = [];
  for (const piece of pieces) for (const part of piece.drawn) if (part.length > 1) drawn.push({ piece, part, hw: piece.width / 2 });
  for (const s of structures) {
    if (s.kind !== 'platform') continue;
    const mpp = ctx.mppAt(s.centre);
    if (s.length * mpp < lim.platformMin || s.aspect < lim.platformAspect) continue;
    const across = [-s.dir[1], s.dir[0]];
    // Only strokes that come near enough to touch it.
    const reach = s.length / 2 + s.width + 20;
    const near = drawn.filter(({ part, hw }) => part.some((p) => dist(p, s.centre) <= reach + hw) || part.some((p, i) => i && segDist(s.centre, part[i - 1], p).d <= reach + hw));
    const step = Math.max(1, 1.5 / mpp);
    let samples = 0, over = 0, sum = 0, offSum = 0, offN = 0;
    for (let t = s.lo + step; t < s.hi - step; t += step) {
      const q = [s.centre[0] + s.dir[0] * t, s.centre[1] + s.dir[1] * t];
      // The platform's cross-section here: where the line across it meets its edge.
      const cuts = [];
      for (let i = 1; i < s.ring.length; i++) {
        const a = sub(s.ring[i - 1], q), b = sub(s.ring[i], q);
        const ta = dot(a, s.dir), tb = dot(b, s.dir);
        if ((ta > 0) === (tb > 0)) continue;
        const u = ta / (ta - tb);
        cuts.push(dot(a, across) + (dot(b, across) - dot(a, across)) * u);
      }
      cuts.sort((x, y) => x - y);
      if (cuts.length < 2) continue;
      const lo = cuts[0], hi = cuts.at(-1);
      if (hi - lo < 1e-6) continue;
      // The strokes' bands across that section.
      const bands = [];
      for (const { part, hw } of near) {
        for (let i = 1; i < part.length; i++) {
          const a = sub(part[i - 1], q), b = sub(part[i], q);
          const ta = dot(a, s.dir), tb = dot(b, s.dir);
          if ((ta > 0) === (tb > 0)) continue;
          const u = ta / (ta - tb);
          const c = dot(a, across) + (dot(b, across) - dot(a, across)) * u;
          // A stroke crossing the section at an angle is wider along it.
          const seg = unit(sub(part[i], part[i - 1]));
          const cos = Math.max(0.2, Math.abs(dot(seg, s.dir)));
          bands.push([c - hw / cos, c + hw / cos]);
        }
      }
      bands.sort((x, y) => x[0] - y[0]);
      let covered = 0, edge = lo;
      for (const [x0, x1] of bands) {
        const from = Math.max(x0, lo, edge), to = Math.min(x1, hi);
        if (to > from) { covered += to - from; edge = to; }
      }
      const share = covered / (hi - lo);
      // How far the nearest line runs from the middle of the platform here.
      const mid = (lo + hi) / 2;
      if (bands.length) { offSum += Math.min(...bands.map(([x0, x1]) => Math.abs((x0 + x1) / 2 - mid))) * mpp; offN++; }
      samples++;
      sum += share;
      if (share > lim.covered) over++;
    }
    if (samples) out.push({ platform: s, length: s.length * mpp, width: s.width * mpp, coveredShare: over / samples, mean: sum / samples, offset: offN ? offSum / offN : null });
  }
  return out;
}

export function coveredFaults(ctx) {
  const { lim } = ctx;
  return strokeCover(ctx)
    .filter((f) => f.coveredShare >= lim.coveredLength)
    .map((f) => fault('platform-covered', f.platform.layer, null, f.platform.centre, `platform of station ${f.platform.station || '?'} (${Math.round(f.length)} m by ${m1(f.width)} m) is covered by rail strokes over more than ${Math.round(lim.covered * 100)}% of its width along ${Math.round(f.coveredShare * 100)}% of its length (mean ${Math.round(f.mean * 100)}%), its middle line ${m1(f.offset ?? 0)} m from the line`, { station: f.platform.station, share: f.coveredShare, offset: f.offset, lead: true }));
}

// --- all of it ---------------------------------------------------------------

/**
 * Shape faults at one zoom of the drawn model.
 * @param {{z: number, lines: Array, marks: Array, areas: Array}} zoom model.zoom(z)
 * @param {{data?: object, limits?: object, kinds?: string[]}} opts `data`: the build's collections
 *   `structures` and `terminals` (model.data), read by area index for each
 *   polygon's kind and station; `limits` overrides LIMITS; `kinds` picks the
 *   rules to run (default all); `areas` the polygons to judge instead of the zoom's own
 *   (`model.places(z, ['structures', 'terminals']).areas`: the structures layers start at
 *   z14.2, so at z14 nothing is drawn and nothing is judged unless these are given).
 *   Pass `model.zoom(z)`, not a frame(): a frame cuts lines at the screen's edge, and a cut
 *   is not a line's end.
 * @returns {Array<{kind, layer, route, px, msg}>}
 */
export function shapeFaults(zoom, { data = {}, limits = {}, kinds = SHAPE_KINDS, areas = null } = {}) {
  const lim = { ...LIMITS, ...limits };
  const ctx = contextOf(areas ? { ...zoom, areas } : zoom, data, lim);
  const want = new Set(kinds);
  const faults = [];
  if (want.has('off-platform') || want.has('skew')) faults.push(...alongPlatformFaults(ctx).filter((f) => want.has(f.kind)));
  if (want.has('past-roof')) faults.push(...roofFaults(ctx));
  if (want.has('past-mark')) faults.push(...pastMarkFaults(ctx));
  if (want.has('walk-bent')) faults.push(...walkFaults(ctx));
  if (want.has('platform-covered') && zoom.z >= lim.coveredFrom) faults.push(...coveredFaults(ctx));
  return merge(faults, zoom.z);
}

// Two platforms side by side, or two lines on one track, make one fault: the
// same kind, layer and station within 5 m of each other, the routes joined.
function merge(faults, z) {
  const out = [];
  for (const f of faults) {
    const near = (5 / metresPerPx(toLonLat(f.px, z)[1], z));
    const had = out.find((g) => g.kind === f.kind && g.layer === f.layer && (g.station ?? '') === (f.station ?? '') && dist(g.px, f.px) <= near);
    if (!had) { out.push({ ...f }); continue; }
    const routes = new Set([...String(had.route ?? '').split(' '), ...String(f.route ?? '').split(' ')].filter(Boolean));
    had.route = routes.size ? [...routes].join(' ') : null;
    if (f.msg.length > had.msg.length) had.msg = f.msg;
  }
  return out;
}

export { contextOf };
