// Where rail lines end and the marks they end at (qa/rules/README.md, rows 1,
// 2, 9, 11 and 12): the rules the owner found broken by eye on 2026-11-11 that
// no detector described.
//
//  - end-unmarked (SM08): a free end of a rail line that lies in the drawn box
//    of no visible mark that serves its route (a station's mark, a platform
//    group's mark, the hub's ring), at this zoom. Measured in screen px
//    against the box the mark is drawn in, not in metres from the station: at
//    zoom 10 to 11.5 the outer lines of a pack are drawn hundreds of metres
//    from the station's point, and a mark 100 m away is not under the end.
//  - marks-not-parallel (PG02): two marks drawn for one station, both with a
//    direction (a round mark has none), whose turns differ by more than
//    `parallel` degrees (a half turn is no turn).
//  - mark-askew, mark-short (SM01): a mark with a direction that is not square
//    to the track it sits on (within `square` degrees; up to `walkSquare` when
//    the station has a second mark and the two are parallel: the walk turns
//    the pair together), or too short to cover a line of its station that
//    runs through it.
//  - ends-uneven (RL04): rail lines that end at one mark and head the same way
//    whose ends are more than `flush` px apart along the track.
//  - marks-overlap (SM09): the group mark of a station and the station's own
//    mark, both drawn, overlap. When one lies wholly inside the other and the
//    lines end there, it is a lead (kind marks-nested): the map draws them
//    that way on purpose where a group is too near to stand apart.
//
// What is "drawn": a mark or a line with an opacity of `DRAWN` (0.5) or more
// at this zoom, as the drawn model works it out the way MapLibre does
// (expressions.mjs): a mark fading in or out over a zoom is a ghost for half
// of it and does not count as under a line end.
//
// All distances are screen px at the zoom of the model passed in. Nothing here
// names a route, a station or a layer: a route is whatever the build's rail
// features carry, a mark serves the routes in its feature's `lines`, and the
// station a mark belongs to is its feature's `id`. The two sources that hold
// station marks are the page's own (MARK_SOURCES).

import { segmentDistance } from './mercator.mjs';

export const DRAWN = 0.5;
export const MARK_SOURCES = ['stations', 'platforms'];

const CELL = 64;
const DEG = 180 / Math.PI;
const routesOf = (v) => String(v ?? '').split(/\s+/).filter(Boolean);
const round1 = (v) => Math.round(v * 10) / 10;
const unit = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const angleOf = ([x, y]) => Math.atan2(y, x) * DEG;

// The difference between two directions in degrees, 0 to 90: a half turn is
// no turn (a capsule turned 180 degrees is the same capsule).
export const turnDiff = (a, b) => {
  const d = (((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

// The difference between two headings in degrees, 0 to 180.
const headingDiff = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * DEG;

// --- marks as drawn -----------------------------------------------------------

// A mark's picture as drawn at this zoom: a rectangle, turned about its anchor.
// The model's `w` and `h` are at the layout size for the collision box (the
// next whole zoom); the picture is drawn at `size`. `u` runs along the mark's
// long side (its turn is clockwise degrees on the screen, 0 = to the right),
// `v` across it.
export function quadOf(m) {
  const k = m.boxSize > 0 && m.size > 0 ? m.size / m.boxSize : 1;
  const w = m.w * k, h = m.h * k;
  const anchor = m.anchor ?? 'center';
  const ax = anchor.includes('left') ? 0 : anchor.includes('right') ? -w : -w / 2;
  const ay = anchor.includes('top') ? 0 : anchor.includes('bottom') ? -h : -h / 2;
  const r = ((m.rot ?? 0) * Math.PI) / 180;
  const u = [Math.cos(r), Math.sin(r)], v = [-Math.sin(r), Math.cos(r)];
  const off = m.offset ?? [0, 0];
  // The centre of the picture: the anchor plus the offset, then half the
  // picture on from its corner.
  const lx = ax + w / 2, ly = ay + h / 2;
  const c = [m.at[0] + off[0] + lx * u[0] + ly * v[0], m.at[1] + off[1] + lx * u[1] + ly * v[1]];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [c[0] + (sx * w * u[0]) / 2 + (sy * h * v[0]) / 2, c[1] + (sx * w * u[1]) / 2 + (sy * h * v[1]) / 2]);
  return { c, u, v, hl: w / 2, ht: h / 2, corners };
}

// A point's px outside a quad (0 inside it).
function outside(q, p) {
  const d = [p[0] - q.c[0], p[1] - q.c[1]];
  const a = Math.abs(dot(d, q.u)) - q.hl, b = Math.abs(dot(d, q.v)) - q.ht;
  return Math.hypot(Math.max(a, 0), Math.max(b, 0));
}

// How deep two quads overlap (0 when they do not), the separating-axis way:
// the least overlap of their shadows on the four axes.
function overlapDepth(p, q) {
  let depth = Infinity;
  for (const axis of [p.u, p.v, q.u, q.v]) {
    const span = (quad) => {
      const s = quad.corners.map((c) => dot(c, axis));
      return [Math.min(...s), Math.max(...s)];
    };
    const [a0, a1] = span(p), [b0, b1] = span(q);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return 0;
    depth = Math.min(depth, o);
  }
  return depth;
}

// The area two quads share (Sutherland-Hodgman: one convex polygon cut by the
// other's sides; both are wound the same way).
function overlapArea(p, q) {
  const area = (poly) => Math.abs(poly.reduce((s, c, i) => { const d = poly[(i + 1) % poly.length]; return s + c[0] * d[1] - d[0] * c[1]; }, 0)) / 2;
  const sign = Math.sign(q.corners.reduce((s, c, i) => { const d = q.corners[(i + 1) % 4]; return s + c[0] * d[1] - d[0] * c[1]; }, 0)) || 1;
  let poly = p.corners;
  for (let i = 0; i < 4 && poly.length; i++) {
    const a = q.corners[i], b = q.corners[(i + 1) % 4];
    const side = (c) => sign * ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const next = [];
    poly.forEach((c, k) => {
      const d = poly[(k + 1) % poly.length];
      const sc = side(c), sd = side(d);
      if (sc >= 0) next.push(c);
      if ((sc >= 0) !== (sd >= 0)) { const t = sc / (sc - sd); next.push([c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t]); }
    });
    poly = next;
  }
  return poly.length ? area(poly) : 0;
}

const within = (inner, outer, slack = 0.5) => inner.corners.every((c) => outside(outer, c) <= slack);

// A mark with no direction: a picture as long as it is wide (a dot, a ring).
const isRound = (m) => Math.abs(m.w - m.h) <= 0.02 * Math.max(m.w, m.h);

// The marks that stand for stations: pictures (not the invisible ones that
// keep names off), from the station and platform sources, that name the lines
// they serve. With the quad they are drawn in.
export function stationMarks(zoom, { minOpacity = DRAWN } = {}) {
  // A station's name is on its own mark; its platform groups' marks name it by id.
  const names = new Map();
  for (const m of zoom.marks ?? []) {
    const name = m.properties?.label ?? m.properties?.name;
    if (name && m.properties?.id != null && !names.has(m.properties.id)) names.set(m.properties.id, name);
  }
  const out = [];
  for (const m of zoom.marks ?? []) {
    if (m.kind !== 'icon' || m.image === 'clear' || !MARK_SOURCES.includes(m.source)) continue;
    const routes = routesOf(m.properties?.lines);
    if (!routes.length) continue;
    const name = names.get(m.properties?.id) ?? `station ${m.properties?.id}`;
    out.push({ ...m, routes, quad: quadOf(m), drawn: m.opacity >= minOpacity, name: m.source === 'platforms' ? `${name} (platform group)` : name });
  }
  return out;
}

const describe = (m) => `${m.layer} of ${m.name}`;

// --- rail lines as drawn ------------------------------------------------------

// A grid of segments, to ask what is near a point.
class Grid {
  constructor() { this.g = new Map(); }
  add(s) {
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - s.hw) / CELL), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + s.hw) / CELL);
    const y0 = Math.floor((Math.min(s.a[1], s.b[1]) - s.hw) / CELL), y1 = Math.floor((Math.max(s.a[1], s.b[1]) + s.hw) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 2_500) return;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      if (!this.g.has(k)) this.g.set(k, []);
      this.g.get(k).push(s);
    }
  }
  near(p, reach = 0) {
    const out = new Set();
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    for (let dx = -1 - r; dx <= 1 + r; dx++) for (let dy = -1 - r; dy <= 1 + r; dy++) for (const s of this.g.get(`${cx + dx},${cy + dy}`) ?? []) out.add(s);
    return [...out];
  }
}

// The rail lines drawn at this zoom, one entry per feature: a feature drawn by
// several layers (casing, edge, line) is its thinnest, which is the line
// itself.
export function railPieces(zoom) {
  const byFeature = new Map();
  for (const l of zoom.lines ?? []) {
    if ((l.mode ?? l.properties?.mode) !== 'rail' || l.route == null || !(l.opacity >= DRAWN)) continue;
    const k = `${l.source}:${l.index}`;
    const had = byFeature.get(k);
    if (!had || (l.drawnWidth ?? l.width ?? 0) < (had.drawnWidth ?? had.width ?? 0)) byFeature.set(k, l);
  }
  return [...byFeature.values()];
}

// The two ends of a drawn part, each with its outward direction (taken over
// the last `over` px so a vertex split does not swing it).
function endsOf(part, over = 3) {
  const out = [];
  for (const [i0, step] of [[part.length - 1, -1], [0, 1]]) {
    const E = part[i0];
    let j = i0 + step, back = part[j];
    while (j + step >= 0 && j + step < part.length && Math.hypot(back[0] - E[0], back[1] - E[1]) < over) { j += step; back = part[j]; }
    out.push({ E, out: unit([E[0] - back[0], E[1] - back[1]]) });
  }
  return out;
}

// The free ends of the rail lines: an end of a drawn part that no other part of
// its route touches (the route stops there). Strokes touch when the end's cap
// reaches the other stroke: where a line changes slot at a station its two
// pieces are a jog apart, and the line is not cut for that.
export function freeEnds(pieces, { tolerance = 0.25 } = {}) {
  const byRoute = new Map();
  pieces.forEach((l, li) => l.drawn.forEach((part, pi) => {
    const hw = (l.drawnWidth ?? l.width ?? 0) / 2;
    const r = String(l.route);
    if (!byRoute.has(r)) byRoute.set(r, new Grid());
    for (let i = 1; i < part.length; i++) byRoute.get(r).add({ key: `${li}:${pi}`, a: part[i - 1], b: part[i], hw });
  }));
  const out = [];
  pieces.forEach((l, li) => l.drawn.forEach((part, pi) => {
    if (part.length < 2) return;
    const route = String(l.route);
    const hw = (l.drawnWidth ?? l.width ?? 0) / 2;
    for (const end of endsOf(part)) {
      const covered = byRoute.get(route).near(end.E, 2 * hw).some((s) => s.key !== `${li}:${pi}` && segmentDistance(end.E, s.a, s.b).d <= s.hw + hw + tolerance);
      if (!covered) out.push({ route, E: end.E, out: end.out, layer: l.layer, hw, width: l.drawnWidth ?? l.width ?? 0 });
    }
  }));
  return out;
}

// --- SM08 -----------------------------------------------------------------------

/**
 * Free rail ends with no visible mark of their route under them.
 * @param {{z: number, lines: Array, marks: Array}} zoom the model's zoom(z)
 * @param {{reach?: number}} opts `reach`: px an end may lie outside a mark's drawn box and still be at it
 */
export function unmarkedEnds(zoom, { reach = 0.5, pieces = railPieces(zoom), ends = freeEnds(pieces), marks = stationMarks(zoom) } = {}) {
  const faults = [];
  for (const e of ends) {
    const mine = marks.filter((m) => m.routes.includes(e.route));
    if (mine.some((m) => m.drawn && outside(m.quad, e.E) <= reach)) continue;
    // Why: a mark of the route is under it but faint, or the nearest is out of reach.
    const faint = mine.filter((m) => !m.drawn && outside(m.quad, e.E) <= reach);
    let msg;
    if (faint.length) {
      const m = faint.reduce((a, b) => (b.opacity > a.opacity ? b : a));
      msg = `${e.route} on ${e.layer} ends under the ${describe(m)}, which is a ghost at this zoom (opacity ${m.opacity.toFixed(2)})`;
    } else {
      let best = null;
      for (const m of mine) {
        const d = outside(m.quad, e.E);
        if (!best || d < best.d) best = { d, m };
      }
      msg = best
        ? `${e.route} on ${e.layer} ends ${best.d.toFixed(1)} px outside the nearest mark of its route (${describe(best.m)}${best.m.drawn ? '' : `, a ghost at ${best.m.opacity.toFixed(2)}`})`
        : `${e.route} on ${e.layer} ends with no mark of its route drawn at this zoom`;
    }
    faults.push({ kind: 'end-unmarked', layer: e.layer, route: e.route, px: [round1(e.E[0]), round1(e.E[1])], msg });
  }
  return faults;
}

// --- PG02 and SM01 --------------------------------------------------------------

// The marks of each station, by the id its feature carries.
function byStation(marks) {
  const out = new Map();
  for (const m of marks) {
    const id = m.properties?.id;
    if (id == null) continue;
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(m);
  }
  return out;
}

// Two marks of one station are two pictures of it, however many layers draw
// each (a tick fading into the capsule is one mark).
const samePlace = (a, b) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) < 1;

/**
 * Marks of one station that are not parallel.
 * @param {{parallel?: number}} opts degrees
 */
export function notParallel(zoom, { parallel = 1, marks = stationMarks(zoom) } = {}) {
  const faults = [];
  for (const [id, list] of byStation(marks.filter((m) => m.drawn && !isRound(m)))) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (samePlace(a, b)) continue;
        const d = turnDiff(a.rot, b.rot);
        if (d <= parallel) continue;
        const [first, second] = a.source === 'platforms' ? [b, a] : [a, b];
        faults.push({
          kind: 'marks-not-parallel',
          layer: second.layer,
          route: null,
          px: [round1(second.at[0]), round1(second.at[1])],
          msg: `the ${describe(first)} is turned ${first.rot}, the ${describe(second)} ${second.rot}: ${d.toFixed(0)} degrees apart (station ${id})`,
        });
      }
    }
  }
  return faults;
}

// Where a route's drawn line passes a mark: the point of the line nearest the
// mark's centre among those within the mark's thickness (the line runs
// through the mark, not past it), with the line's direction there, or null.
function lineAt(q, route, grid, window, ends) {
  let best = null;
  for (const s of grid.get(route)?.near(q.c, window) ?? []) {
    const { d, at } = segmentDistance(q.c, s.a, s.b);
    if (d > window) continue;
    const rel = [at[0] - q.c[0], at[1] - q.c[1]];
    if (Math.abs(dot(rel, q.v)) > q.ht + s.hw) continue;
    if (!best || d < best.d) best = { d, rel, hw: s.hw, dir: unit([s.b[0] - s.a[0], s.b[1] - s.a[1]]), at };
  }
  if (best) best.ending = ends.some((e) => e.route === route && Math.hypot(e.E[0] - best.at[0], e.E[1] - best.at[1]) < 1);
  return best;
}

/**
 * Marks that are not square to their track, or too short for the lines through them.
 * @param {{from?: number, square?: number, walkSquare?: number, parallel?: number, slack?: number, window?: number}} opts
 *   `from`: the zoom a station is a capsule laid across the track (SM01; below
 *   it a station is a tick or a dot, turned to the stretch it stands on, not
 *   to the track under it); degrees for the turn; px the lines of a mark may
 *   reach past its ends, and px beyond a mark's end a line still counts as
 *   passing it
 */
export function squareMarks(zoom, { from = 11, square = 2, walkSquare = 25, parallel = 1, slack = 1, window = 10, pieces = railPieces(zoom), ends = freeEnds(pieces), marks = stationMarks(zoom) } = {}) {
  const faults = [];
  if (zoom.z < from) return faults;
  const grid = new Map();
  for (const l of pieces) {
    const hw = (l.drawnWidth ?? l.width ?? 0) / 2;
    const r = String(l.route);
    if (!grid.has(r)) grid.set(r, new Grid());
    for (const part of l.drawn) for (let i = 1; i < part.length; i++) grid.get(r).add({ a: part[i - 1], b: part[i], hw });
  }
  const stations = byStation(marks.filter((m) => m.drawn));
  for (const m of marks) {
    if (!m.drawn) continue;
    const q = m.quad;
    const reach = q.hl + window;
    const found = m.routes.map((route) => ({ route, at: lineAt(q, route, grid, reach, ends) })).filter((x) => x.at && x.at.d <= reach);
    if (!found.length) continue;

    // Square to the track: to the line of its routes that it is nearest square to.
    if (!isRound(m)) {
      const across = angleOf(q.u);
      const off = Math.min(...found.map((x) => turnDiff(angleOf(x.at.dir), across + 90)));
      const others = (stations.get(m.properties?.id) ?? []).filter((o) => o !== m && !samePlace(o, m) && !isRound(o));
      const walked = others.some((o) => turnDiff(o.rot, m.rot) <= parallel);
      const allowed = walked ? walkSquare : square;
      if (off > allowed) {
        faults.push({
          kind: 'mark-askew',
          layer: m.layer,
          route: null,
          px: [round1(m.at[0]), round1(m.at[1])],
          msg: `the ${describe(m)} is ${off.toFixed(1)} degrees off square to its track (turned ${m.rot}; allowed ${allowed}${walked ? ', its station has a parallel second mark' : ''})`,
        });
      }
    }

    // Long enough: every line of the station that runs through it lies within
    // its ends, with the line's own width. A line that ends here is
    // end-unmarked's, not this; a line the station's other drawn mark stands
    // for (it ends in that one's box) runs past this one on its way there.
    const elsewhere = new Set();
    for (const o of stations.get(m.properties?.id) ?? []) {
      if (o === m || samePlace(o, m)) continue;
      for (const e of ends) if (o.routes.includes(e.route) && outside(o.quad, e.E) <= 0.5) elsewhere.add(e.route);
    }
    const short = found.filter((x) => !x.at.ending && !elsewhere.has(x.route)).map((x) => ({ ...x, a: Math.abs(dot(x.at.rel, q.u)) + x.at.hw })).filter((x) => x.a > q.hl + slack);
    if (short.length) {
      const worst = short.reduce((a, b) => (b.a > a.a ? b : a));
      faults.push({
        kind: 'mark-short',
        layer: m.layer,
        route: short.map((x) => x.route).join(' '),
        px: [round1(m.at[0]), round1(m.at[1])],
        msg: `the ${describe(m)} is ${(2 * q.hl).toFixed(1)} px long but ${short.map((x) => x.route).join(' ')} run${short.length === 1 ? 's' : ''} through it out to ${worst.a.toFixed(1)} px from its middle (${(q.hl).toFixed(1)} px is its end)`,
      });
    }
  }
  return faults;
}

// --- RL04 -----------------------------------------------------------------------

/**
 * Rail lines that end at one mark and head the same way, whose ends are not flush.
 * @param {{flush?: number, heading?: number}} opts px along the track; degrees
 */
export function unevenEnds(zoom, { flush = 1, heading = 20, reach = 0.5, ends = freeEnds(railPieces(zoom)), marks = stationMarks(zoom) } = {}) {
  const faults = [];
  const drawn = marks.filter((m) => m.drawn);
  // Ends that lie in a common mark belong together.
  const parent = ends.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const holder = new Map();
  ends.forEach((e, i) => {
    drawn.forEach((m, mi) => {
      if (!m.routes.includes(e.route) || outside(m.quad, e.E) > reach) return;
      if (holder.has(mi)) parent[find(i)] = find(holder.get(mi));
      else holder.set(mi, i);
    });
  });
  const groups = new Map();
  ends.forEach((e, i) => {
    // An end in no mark is end-unmarked's.
    if (!drawn.some((m) => m.routes.includes(e.route) && outside(m.quad, e.E) <= reach)) return;
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(e);
  });
  for (const group of groups.values()) {
    // Within a mark, the ends that head the same way.
    const rest = [...group];
    while (rest.length) {
      const seed = rest.shift();
      const heads = [seed];
      for (let k = 0; k < rest.length;) {
        if (heads.some((h) => headingDiff(h.out, rest[k].out) <= heading)) heads.push(...rest.splice(k, 1));
        else k++;
      }
      if (heads.length < 2) continue;
      const u = unit(heads.reduce((s, h) => [s[0] + h.out[0], s[1] + h.out[1]], [0, 0]));
      const along = heads.map((h) => dot(h.E, u));
      const spread = Math.max(...along) - Math.min(...along);
      if (spread <= flush) continue;
      const out = heads[along.indexOf(Math.max(...along))], back = heads[along.indexOf(Math.min(...along))];
      const mid = [heads.reduce((s, h) => s + h.E[0], 0) / heads.length, heads.reduce((s, h) => s + h.E[1], 0) / heads.length];
      faults.push({
        kind: 'ends-uneven',
        layer: out.layer,
        route: [...new Set(heads.map((h) => h.route))].join(' '),
        px: [round1(mid[0]), round1(mid[1])],
        msg: `${heads.length} rail ends at one mark are ${spread.toFixed(1)} px apart along the track: ${out.route} runs furthest, ${back.route} stops shortest`,
      });
    }
  }
  return faults;
}

// --- SM09 -----------------------------------------------------------------------

/**
 * A platform group's mark that overlaps its station's own mark. A mark wholly
 * inside the other, with the lines ending there, is a lead.
 * @param {{depth?: number}} opts px of overlap that count
 */
export function overlappingMarks(zoom, { depth = 0.5, reach = 0.5, ends = freeEnds(railPieces(zoom)), marks = stationMarks(zoom) } = {}) {
  const faults = [];
  for (const [id, list] of byStation(marks.filter((m) => m.drawn))) {
    const groups = list.filter((m) => m.source === 'platforms');
    const own = list.filter((m) => m.source !== 'platforms');
    for (const g of groups) {
      for (const o of own) {
        const d = overlapDepth(g.quad, o.quad);
        if (d <= depth) continue;
        const nested = within(g.quad, o.quad) || within(o.quad, g.quad);
        // The lines that end at the group: free ends of its routes under it.
        const ending = ends.filter((e) => g.routes.includes(e.route) && outside(g.quad, e.E) <= reach);
        const px = [round1(g.at[0]), round1(g.at[1])];
        const shared = overlapArea(g.quad, o.quad);
        const smaller = Math.min(4 * g.quad.hl * g.quad.ht, 4 * o.quad.hl * o.quad.ht);
        const what = `the ${describe(g)} (${(2 * g.quad.hl).toFixed(1)} x ${(2 * g.quad.ht).toFixed(1)} px) and the ${describe(o)} (${(2 * o.quad.hl).toFixed(1)} x ${(2 * o.quad.ht).toFixed(1)} px) overlap: ${Math.round((100 * shared) / smaller)}% of the smaller is covered`;
        if (nested && ending.length) {
          faults.push({ kind: 'marks-nested', layer: g.layer, route: null, px, msg: `${what}; one lies wholly inside the other and ${[...new Set(ending.map((e) => e.route))].join(' ')} end${ending.length === 1 ? 's' : ''} at the group (lead: drawn so on purpose where a group is too near to stand apart; station ${id})` });
        } else {
          // Say which of the group's lines end in the part of the group that the own mark covers.
          const under = [...new Set(ending.filter((e) => outside(o.quad, e.E) <= reach).map((e) => e.route))];
          faults.push({ kind: 'marks-overlap', layer: g.layer, route: null, px, msg: `${what}${under.length ? `; ${under.join(' ')} end${under.length === 1 ? 's' : ''} inside both` : ''} (station ${id})` });
        }
      }
    }
  }
  return faults;
}

// --- all of them ----------------------------------------------------------------

/**
 * Every rule of this file at one zoom of the drawn model.
 * @param {{z: number, lines: Array, marks: Array}} zoom the model's zoom(z) output
 * @param {object} opts thresholds of the rules above, by name
 * @returns {Array<{kind, layer, route, px, msg}>}
 */
export function endFaults(zoom, opts = {}) {
  const pieces = railPieces(zoom);
  const ends = freeEnds(pieces);
  const marks = stationMarks(zoom);
  const shared = { pieces, ends, marks };
  return [
    ...unmarkedEnds(zoom, { ...shared, reach: opts.reach }),
    ...notParallel(zoom, { ...shared, parallel: opts.parallel }),
    ...squareMarks(zoom, { ...shared, from: opts.from, square: opts.square, walkSquare: opts.walkSquare, parallel: opts.parallel, slack: opts.slack, window: opts.window }),
    ...unevenEnds(zoom, { ...shared, flush: opts.flush, heading: opts.heading, reach: opts.reach }),
    ...overlappingMarks(zoom, { ...shared, depth: opts.depth, reach: opts.reach }),
  ];
}
