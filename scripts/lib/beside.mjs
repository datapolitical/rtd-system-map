// Bus lines beside rail (DESIGN.md, "Bus routes", "Beside rail"; #97).
//
// Rail is drawn at a fixed width on screen, so a pack of lines covers more
// ground the further out the map is: three lines sharing track are about 40 m
// wide on the ground at zoom 15 and 24 m at 16. A street that really runs
// beside the track (a station's bus bays, a road along the line) is then
// drawn under the pack and its stops sit on the rail (Chris, at Alameda: "the
// buses aren't literally on top of the rail so that makes no sense").
//
// From BESIDE_FROM in (beside.js), every bus line near rail is drawn again
// for each zoom band, each point moved straight away from the nearest track
// by just enough to clear the pack's edge at that zoom, and not at all where
// it is already clear, so a line is never drawn nearer the rail than it is.
// The move is one field over the ground, the same for every line at a point,
// so streets that meet still meet, a line that bends away from the rail bends
// away, and a stop moves with the street it stands on. It is smoothed along
// each line over a few pixels so a line comes off the pack in a curve, not a
// kink. Closer than MIN_APART to a track, bus and rail are on one right of way
// and are left as they are (#97 leaves that case to Chris).
//
// Output: the streets and stops, with each street stretch and stop near rail
// marked `bs` (drawn as it is only further out than BESIDE_FROM), and the bus
// routes, with each stretch near rail marked `sf`, the band from which it is
// drawn as it is again. `beside` holds what is drawn near rail from
// BESIDE_FROM in: for each band, the moved copy (`bz`), and the pieces that
// have stopped moving by then (`sf`: drawn from that band on). `of` says
// whether a feature there is a street or a stop.

import { BESIDE_BANDS, BESIDE_FROM, besideRamp, clearPx, metersPerPx, reachMeters } from '../../public/js/beside.js';
import { Grid, closestOnSegment, densify, partsOf, projection, simplify } from './geom.mjs';

// Closer than this to the track, bus and rail share one right of way.
export const MIN_APART = 4;
// Points along each line this far apart (meters).
export const STEP = 2;
// Rail pieces whose track passes this close to the nearest one are its pack.
const SAME_TRACK = 1.5;
// The move is smoothed along a line over this many px either way.
const SMOOTH_PX = 5;
// A move smaller than this (meters) is no move.
const NO_MOVE = 0.05;
// Affected stretches of one line closer than this (meters) are one stretch.
const MERGE_GAP = 30;
// A line that ends near rail is heading into it if its last INTO_LOOK meters
// run more than INTO_ANGLE degrees off the rail's direction; it then ends
// short of the pack rather than turning along it.
const INTO_ANGLE = 30;
const INTO_LOOK = 20;
// Unmoved points kept either side of a moved stretch, so copies overlap.
const MARGIN = 3;
// A piece of line that stops moving starts being drawn as it is only at
// every this-many-th band.
const SF_STEP = 4;
// Copies are simplified to this fraction of a pixel at their band's zoom.
const SIMPLIFY_PX = 0.2;
const cos20 = Math.cos((20 * Math.PI) / 180);

// The rail pieces, projected, in a grid: each segment with its line's slot.
const RAIL_CELL = 100;
export function railIndex(routes, project) {
  const grid = new Grid(RAIL_CELL);
  for (const f of routes) {
    if (f.properties.mode !== 'rail') continue;
    const slot = f.properties.slot ?? 0;
    for (const part of partsOf(f.geometry)) {
      // No longer than a cell, so the grid sees every segment near a point.
      const pts = densify(part.map(project), RAIL_CELL);
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len) grid.add(a, b, { slot, t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] });
      }
    }
  }
  return grid;
}

// The nearest track to p within `reach` meters: { d, n (unit vector from the
// track to p), edge (the pack's outermost slot toward p) }, or null.
export function railNear(grid, p, reach) {
  const near = grid.near(p, reach);
  let best = null;
  for (const seg of near) {
    const q = closestOnSegment(p, seg.a, seg.b);
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = { seg, q, d };
  }
  if (!best || best.d < MIN_APART) return null;
  const n = [(p[0] - best.q[0]) / best.d, (p[1] - best.q[1]) / best.d];
  const t = best.seg.item.t;
  let edge = -Infinity;
  for (const seg of near) {
    const q = closestOnSegment(best.q, seg.a, seg.b);
    if (Math.hypot(q[0] - best.q[0], q[1] - best.q[1]) > SAME_TRACK) continue;
    const tm = seg.item.t;
    if (Math.abs(tm[0] * t[0] + tm[1] * t[1]) < cos20) continue;
    // A slot is to the right of its piece's direction (line-offset), and
    // right of (tx, ty) is (ty, -tx).
    edge = Math.max(edge, seg.item.slot * (tm[1] * n[0] - tm[0] * n[1]));
  }
  return { d: best.d, n, edge: Math.max(edge, 0) };
}

// The move at each point for band k: a vector in meters, smoothed along the line.
function movesFor(points, near, cls, lat, k) {
  const z = BESIDE_BANDS[k];
  const mpp = metersPerPx(z, lat);
  const ramp = besideRamp(k);
  const raw = near.map((r) => {
    if (!r) return [0, 0];
    const by = ramp * Math.max(0, clearPx(r.edge, cls(r.i), z) * mpp - r.d);
    return [r.n[0] * by, r.n[1] * by];
  });
  // Two box passes, about a Gaussian over SMOOTH_PX either way. The window
  // narrows to nothing at the line's ends, so an end keeps its own move and
  // two streets that meet there are moved alike.
  const w = Math.max(1, Math.round((SMOOTH_PX * mpp) / STEP / 2));
  let out = raw;
  for (let pass = 0; pass < 2; pass++) {
    const src = out;
    out = src.map((_, i) => {
      const r = Math.min(w, i, src.length - 1 - i);
      let sx = 0, sy = 0, c = 0;
      for (let j = i - r; j <= i + r; j++) {
        sx += src[j][0];
        sy += src[j][1];
        c++;
      }
      return [sx / c, sy / c];
    });
  }
  return out;
}

// The copies of one line (projected points): null if nothing near rail moves,
// else { spans: [[from, to]], bands: [{ k, from, to, points }], statics: [{ sf, from, to }] }
// with indexes into `dense`.
export function copiesOfLine(points, grid, clsAt, lat, { deadStart = false, deadEnd = false } = {}) {
  const dense = densify(points, STEP);
  const reach = reachMeters(3, 'c3', lat);
  const near = dense.map((p, i) => {
    const r = railNear(grid, p, reach);
    return r && { ...r, i };
  });
  if (!near.some(Boolean)) return null;
  // Each point's street class, looked up once (a route asks the street under it).
  const classes = dense.map((p, i) => (near[i] ? clsAt(p, i) : null));
  const cls = (i) => classes[i];
  const moves = BESIDE_BANDS.map((_, k) => movesFor(dense, near, cls, lat, k));
  // The last band each point moves in (-1: never).
  const last = dense.map((_, i) => {
    for (let k = moves.length - 1; k >= 0; k--) if (Math.hypot(...moves[k][i]) > NO_MOVE) return k;
    return -1;
  });
  // Stretches of moved points, joined across short gaps, with a margin.
  const spans = [];
  for (let i = 0; i < dense.length; i++) {
    if (last[i] < 0) continue;
    const prev = spans.at(-1);
    if (prev && (i - prev[1]) * STEP <= MERGE_GAP) prev[1] = i;
    else spans.push([i, i]);
  }
  if (!spans.length) return null;
  const out = { dense, spans: [], bands: [], statics: [] };
  for (const [span, [s0, s1]] of spans.entries()) {
    const from = Math.max(0, s0 - MARGIN);
    const to = Math.min(dense.length - 1, s1 + MARGIN);
    out.spans.push([from, to]);
    const kMax = Math.max(...last.slice(from, to + 1));
    // a[k], b[k]: the first and last point that still moves in band k, less
    // and more one (so a copy overlaps what is drawn beside it).
    const a = [], b = [];
    for (let k = 0; k <= kMax; k++) {
      let lo = -1, hi = -1;
      for (let i = from; i <= to; i++) if (last[i] >= k) { if (lo < 0) lo = i; hi = i; }
      a.push(Math.max(from, lo - 1));
      b.push(Math.min(to, hi + 1));
    }
    // What has stopped moving is drawn as it is from then on, starting at
    // every SF_STEP-th band only (so a line near rail is cut into few
    // pieces). A band's copy runs from where the pieces drawn at its zoom
    // stop: from a[level] to b[level], the latest level at or before it; its
    // points past a[k] and b[k] are moved by nothing.
    const levels = [];
    for (let k = 0; k <= kMax; k += SF_STEP) levels.push(k);
    const levelOf = (k) => levels.findLast((l) => l <= k);
    // A line that ends near rail, heading into it, ends short of the pack
    // instead: moved straight away from the track, its last stretch would
    // turn and run along the pack (Union Station's FreeRide folded into a V).
    const into = (i, j) => {
      const r = near[i];
      if (!r) return false;
      const v = [dense[i][0] - dense[j][0], dense[i][1] - dense[j][1]];
      const len = Math.hypot(...v) || 1;
      return Math.abs((v[0] * r.n[0] + v[1] * r.n[1]) / len) > Math.sin((INTO_ANGLE * Math.PI) / 180);
    };
    const look = Math.max(1, Math.round(INTO_LOOK / STEP));
    const cutEnd = deadEnd && to === dense.length - 1 && into(to, Math.max(0, to - look));
    const cutStart = deadStart && from === 0 && into(0, Math.min(dense.length - 1, look));
    for (let k = 0; k <= kMax; k++) {
      const l = levelOf(k);
      let [lo, hi] = [a[l], b[l]];
      const moved = (i) => Math.hypot(...moves[k][i]) > NO_MOVE;
      if (cutEnd) while (hi > lo && moved(hi)) hi--;
      if (cutStart) while (lo < hi && moved(lo)) lo++;
      if (hi <= lo) continue;
      out.bands.push({ k, from: lo, to: hi, points: dense.slice(lo, hi + 1).map((p, j) => [p[0] + moves[k][lo + j][0], p[1] + moves[k][lo + j][1]]) });
    }
    levels.forEach((l, j) => {
      const [lo, hi] = j ? [a[levels[j - 1]], b[levels[j - 1]]] : [from, to];
      if (a[l] > lo) out.statics.push({ sf: l, from: lo, to: a[l], span });
      if (hi > b[l]) out.statics.push({ sf: l, from: b[l], to: hi, span });
    });
    const core = levels.at(-1);
    out.statics.push({ sf: kMax + 1, from: a[core], to: b[core], span });
  }
  return out;
}

const line = (coords) => ({ type: 'LineString', coordinates: coords });

// What a copy keeps of its feature: only what the layers that draw it read
// (network.js), so the copies stay small.
const KEEP = {
  street: ['mode', 'cls', 'n', 'pt', 'routes', 'tier', 'zoom', 'len'],
  stop: ['id', 'name', 'routes', 'lines', 'gate', 'terminal'],
};
const pick = (props, of) => Object.fromEntries(KEEP[of].filter((k) => props[k] !== undefined).map((k) => [k, props[k]]));

// Split a line feature into the pieces that never move and, near rail, one
// piece for each stretch that moves: for a street, marked `bs` (drawn as it is
// only further out than BESIDE_FROM; from there in, `beside` draws it), with
// the moved copies (`bz`) and the pieces that have stopped moving (`sf`) as
// `copies`; for a route, marked `sf` (its highlight is hidden while the
// stretch is moved; the street there, at full strength for the open route,
// stands for it). Returns { pieces, copies }.
function splitFeature(f, grid, clsAt, project, unproject, unproject6, of, isDead = () => false) {
  const pieces = [];
  const copies = [];
  const lat = partsOf(f.geometry)[0][0][1];
  const keepAll = [];
  for (const part of partsOf(f.geometry)) {
    const c = copiesOfLine(part.map(project), grid, clsAt, lat, { deadStart: isDead(part[0]), deadEnd: isDead(part.at(-1)) });
    if (!c) {
      keepAll.push(part);
      continue;
    }
    // Pieces of the line as it is, back to its own points: the build stores
    // lines to about a meter, so a tenth of that is no change.
    const tidy = (from, to, back = unproject) => simplify(c.dense.slice(from, to + 1), 0.1).map(back);
    let at = 0;
    for (const [from, to] of c.spans) {
      if (from > at) keepAll.push(tidy(at, from));
      at = to;
    }
    if (at < c.dense.length - 1) keepAll.push(tidy(at, c.dense.length - 1));
    c.spans.forEach(([from, to], span) => {
      const flag = of ? { bs: 1 } : { sf: Math.max(...c.statics.filter((st) => st.span === span).map((st) => st.sf)) };
      pieces.push({ type: 'Feature', properties: { ...f.properties, ...flag }, geometry: line(tidy(from, to)) });
    });
    if (!of) continue;
    const props = pick(f.properties, of);
    const bySf = new Map();
    for (const st of c.statics) (bySf.get(st.sf) ?? bySf.set(st.sf, []).get(st.sf)).push(tidy(st.from, st.to, unproject6));
    for (const [sf, lines] of bySf) copies.push({ type: 'Feature', properties: { ...props, of, sf }, geometry: lines.length === 1 ? line(lines[0]) : { type: 'MultiLineString', coordinates: lines } });
    for (const band of c.bands) {
      const tol = SIMPLIFY_PX * metersPerPx(BESIDE_BANDS[band.k], lat);
      copies.push({ type: 'Feature', properties: { ...props, of, bz: band.k }, geometry: line(simplify(band.points, tol).map(unproject6)) });
    }
  }
  if (keepAll.length) {
    const geometry = keepAll.length === 1 && f.geometry.type === 'LineString' ? line(keepAll[0]) : { type: 'MultiLineString', coordinates: keepAll };
    pieces.unshift({ ...f, geometry });
  }
  return { pieces, copies };
}

// The whole step: streets, bus routes and stops near rail, and the copies.
// A bus route (the open route's highlight, highlight.js) is cut the same way
// but gets no copies: while its stretch beside rail is moved, the street
// there, drawn at full strength for the open route, stands for it.
export function besideRail({ streets, routes, stops, origin, precision = 5 }) {
  // Pieces of the lines as they are keep the build's precision; moved
  // copies get a decimal more (a meter is two pixels at zoom 17).
  const { project, unproject } = projection(origin, precision);
  const { unproject: unproject6 } = projection(origin, precision + 1);
  const grid = railIndex(routes, project);
  const streetGrid = new Grid(50);
  for (const f of streets) {
    if (f.properties.mode !== 'bus') continue;
    for (const part of partsOf(f.geometry)) {
      const pts = densify(part.map(project), 50);
      for (let i = 1; i < pts.length; i++) streetGrid.add(pts[i - 1], pts[i], f.properties.cls ?? 'c60');
    }
  }
  // The class of the street at a point (for a route, and for a stop: a stop
  // moves as the street it stands by, so it lands on it).
  const streetClass = (p, within = 3) => {
    let best = null;
    for (const seg of streetGrid.near(p, within)) {
      const q = closestOnSegment(p, seg.a, seg.b);
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) best = { d, cls: seg.item };
    }
    return best?.cls;
  };
  // Where a bus line ends with no other line there: a dead end, which may end
  // short of the rail rather than turn along it. Every point of every line
  // counts, so a street meeting another mid-way is not a dead end.
  const touches = new Map();
  const keyOf = ([lon, lat]) => `${Math.round(lon * 1e5)},${Math.round(lat * 1e5)}`;
  streets.forEach((f, i) => {
    if (f.properties.mode !== 'bus' || !f.geometry) return;
    for (const part of partsOf(f.geometry)) for (const c of part) (touches.get(keyOf(c)) ?? touches.set(keyOf(c), new Set()).get(keyOf(c))).add(i);
  });
  const deadIn = (i) => (c) => {
    const at = touches.get(keyOf(c));
    return !at || [...at].every((j) => j === i);
  };
  const report = { streets: 0, routes: 0, stops: 0, copies: 0, km: 0 };
  const beside = [];
  const outStreets = [];
  for (const [i, f] of streets.entries()) {
    if (f.properties.mode !== 'bus' || !f.geometry) {
      outStreets.push(f);
      continue;
    }
    const cls = f.properties.cls ?? 'c60';
    const { pieces, copies } = splitFeature(f, grid, () => cls, project, unproject, unproject6, 'street', deadIn(i));
    outStreets.push(...pieces);
    if (copies.length) report.streets++;
    beside.push(...copies);
  }
  const outRoutes = [];
  for (const f of routes) {
    if (f.properties.mode !== 'bus' || !f.geometry) {
      outRoutes.push(f);
      continue;
    }
    const { pieces } = splitFeature(f, grid, (p) => streetClass(p) ?? 'c30', project, unproject, unproject6, null);
    outRoutes.push(...pieces);
    if (pieces.some((x) => x.properties.sf !== undefined)) report.routes++;
  }
  const outStops = stops.map((f) => {
    if (f.properties.platform || f.geometry?.type !== 'Point') return f;
    const p = project(f.geometry.coordinates);
    const lat = f.geometry.coordinates[1];
    const r = railNear(grid, p, reachMeters(3, 'c3', lat));
    if (!r) return f;
    const cls = streetClass(p, 25) ?? 'c30';
    let kLast = -1;
    const at = [];
    for (let k = 0; k < BESIDE_BANDS.length; k++) {
      const z = BESIDE_BANDS[k];
      const by = besideRamp(k) * Math.max(0, clearPx(r.edge, cls, z) * metersPerPx(z, lat) - r.d);
      if (by > NO_MOVE) kLast = k;
      at.push([p[0] + r.n[0] * by, p[1] + r.n[1] * by]);
    }
    if (kLast < 0) return f;
    report.stops++;
    for (let k = 0; k <= kLast; k++) beside.push({ type: 'Feature', properties: { ...pick(f.properties, 'stop'), of: 'stop', bz: k }, geometry: { type: 'Point', coordinates: unproject6(at[k]) } });
    beside.push({ type: 'Feature', properties: { ...pick(f.properties, 'stop'), of: 'stop', sf: kLast + 1 }, geometry: f.geometry });
    return { ...f, properties: { ...f.properties, bs: 1 } };
  });
  report.copies = beside.length;
  report.km = Math.round(beside.filter((f) => f.properties.of === 'street' && f.properties.bz !== undefined).reduce((a, f) => {
    const pts = f.geometry.coordinates.map(project);
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return a + s;
  }, 0) / 100) / 10;
  return { streets: outStreets, routes: outRoutes, stops: outStops, beside, report };
}

export { BESIDE_FROM };
