// Streets by combined bus frequency, on one street graph (DESIGN.md, "Bus
// routes"; #80). Each street a bus runs on is drawn once, and its width says
// how often a bus comes along it, every route on it counted together.
// (Chris, 2026-11-08: "show the frequency of the section of road and just
// have it scale up, so it's a single line but very thick".)
//
// RTD draws its bus routes on one street network: routes that share a
// street share its line. (On 2026-11-10, where another route ran within
// 50 m of a route, it was within 1 m for 86% of the length; the rest is
// mostly the two carriageways of a divided road, 12 to 24 m apart, each
// carrying every route on that road.) So the streets are not guessed from
// which routes run near each other: RTD's lines are joined where they meet,
// and the streets are the edges of the graph that makes.
//
// 1. The graph. Every vertex within NODE_METERS of another is one node, and
//    a node lying on another line's segment splits it there, so two lines
//    drawn along one street with their vertices in different places become
//    the same edges. Each edge carries the route stretches (route, tier,
//    headway) drawn along it.
// 2. Runs. A drawn street is a run of edges with one set of stretches,
//    through every node where that set goes straight on (a crossing street
//    doesn't cut it) and cut where a route joins or leaves. Runs meet at
//    shared nodes, so the drawing breaks only where RTD's lines do.
// 3. Buses per hour, once per run. Each route's measured cells
//    (stretches.mjs: weekday departures in the window, each way along the
//    route's line) lie on its own line, which is the run: the cell nearest
//    the run's middle gives the route's departures each way. The run's rate
//    is the rider's (`rate`), from the departures of every all-day route on
//    it, merged each way, the busier way counting. Part-time routes are
//    listed and add nothing: they keep their own dashed lines.
// 4. One way. A run whose buses run only one way (the other way at most
//    ONE_WAY of the busier) is drawn the way they go, so its arrows point
//    that way. The two carriageways of a divided road are each one way, but
//    the road is not: a one-way run with a twin, a one-way run of one of
//    its routes the other way within TWIN_METERS alongside it, carries no
//    arrows (until stage 2 draws the road as one line, #81).

import { MIDDAY } from './gtfs.mjs';
import { dedupe, length, partsOf, projection, simplify } from './geom.mjs';
import { classOf as classOfBph } from '../../public/js/frequency.js';

// Vertices this close are one node of the street graph.
export const NODE_METERS = 1.5;
// A route's cell belongs to a run when it lies within this of the run's
// line (cells are measured on the route's own line, which is the run).
const CELL_METERS = 3;
// ...or, for a run shorter than the cells' spacing, the nearest within this.
const CELL_NEAR = 40;
// Buses the other way at most this share of the busier way's: one way.
const ONE_WAY = 0.15;
// A one-way run with a run of one of its routes the other way, parallel
// within TWIN_COS and this close, is a carriageway of a two-way road.
const TWIN_METERS = 60;
const TWIN_COS = Math.cos((20 * Math.PI) / 180);
// A loose end whose own route has another line within this is reported as
// a possible break (report.ends).
const BREAK_METERS = 30;
// ...and joined to it, if that line is ahead of it (closeGaps).
const CLOSE_METERS = 30;
const CLOSE_COS = Math.cos((60 * Math.PI) / 180);
const CLOSE_ANY = 15;
// Tiers that run through the window and so count toward the street.
const ALL_DAY = new Set(['frequent', 'every30', 'hourly', 'infrequent']);
const HOURS = (MIDDAY[1] - MIDDAY[0]) / 3600;

const collator = new Intl.Collator('en', { numeric: true });
const byNumber = (a, b) => collator.compare(a, b);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function closest(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { t, q, d: dist(p, q) };
}

// Items in square cells, for finding what is near a point.
class Cells {
  constructor(size) {
    this.size = size;
    this.map = new Map();
  }
  key(x, y) {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
  }
  add(item, ...points) {
    const keys = new Set(points.map(([x, y]) => this.key(x, y)));
    for (const k of keys) (this.map.get(k) ?? this.map.set(k, []).get(k)).push(item);
  }
  // A segment, in every cell it passes through.
  addSegment(item, a, b) {
    const steps = Math.max(1, Math.ceil(dist(a, b) / (this.size / 2)));
    this.add(item, ...Array.from({ length: steps + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]));
  }
  // Every item in this cell and the eight around it: everything within
  // `size` of p, and some further.
  near([x, y]) {
    const [cx, cy] = [Math.floor(x / this.size), Math.floor(y / this.size)];
    const out = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const item of this.map.get(`${cx + dx},${cy + dy}`) ?? []) out.add(item);
    return out;
  }
}

/**
 * The street graph of `features` (bus route stretches: LineString or
 * MultiLineString, with `route`, `tier`, `wk`), in metres from `project`.
 * Returns { nodes: [[x, y]], edges: [{ a, b, stretches: Set }], stretches:
 * [{ route, tier, wk }], parts: [{ stretch, ids }] }, edges with a < b.
 */
export function streetGraph(features, project, { tolerance = NODE_METERS, close = CLOSE_METERS } = {}) {
  const nodes = [];
  const nodeCells = new Cells(tolerance * 2);
  const nodeAt = (p) => {
    for (const id of nodeCells.near(p)) if (dist(nodes[id], p) <= tolerance) return id;
    nodes.push(p);
    nodeCells.add(nodes.length - 1, p);
    return nodes.length - 1;
  };
  // A stretch is a route at one tier and headway: runs are cut where one
  // joins or leaves, so a route that runs less often past a short turn is
  // drawn at its own rate there.
  const stretches = [];
  const stretchOf = new Map();
  const parts = [];
  for (const f of features) {
    const { route, tier, wk } = f.properties;
    const key = `${route}\u0000${tier}\u0000${wk ?? ''}`;
    if (!stretchOf.has(key)) {
      stretchOf.set(key, stretches.length);
      stretches.push({ route: String(route), tier, wk: wk ?? null });
    }
    for (const part of partsOf(f.geometry)) {
      const ids = [];
      for (const q of part) {
        const id = nodeAt(project(q));
        if (ids.at(-1) !== id) ids.push(id);
      }
      if (ids.length >= 2) parts.push({ stretch: stretchOf.get(key), ids });
    }
  }
  // A node lying on a segment splits it, so the same street drawn with its
  // vertices in different places is the same edges.
  const SPLIT = 50;
  const byCell = new Cells(SPLIT);
  nodes.forEach((p, id) => byCell.add(id, p));
  const onSegment = (a, b) => {
    const [A, B] = [nodes[a], nodes[b]];
    const found = [];
    const len = dist(A, B);
    const steps = Math.max(1, Math.ceil(len / SPLIT));
    const seen = new Set();
    for (let k = 0; k <= steps; k++) {
      const p = [A[0] + ((B[0] - A[0]) * k) / steps, A[1] + ((B[1] - A[1]) * k) / steps];
      for (const id of byCell.near(p)) {
        if (seen.has(id) || id === a || id === b) continue;
        seen.add(id);
        const c = closest(nodes[id], A, B);
        if (c.t > 0 && c.t < 1 && c.d <= tolerance) found.push({ id, t: c.t });
      }
    }
    return found.sort((x, y) => x.t - y.t).map((x) => x.id);
  };
  const edgeOf = new Map();
  const edges = [];
  for (const part of parts) {
    const ids = [part.ids[0]];
    for (let i = 1; i < part.ids.length; i++) {
      for (const m of onSegment(part.ids[i - 1], part.ids[i])) if (ids.at(-1) !== m) ids.push(m);
      if (ids.at(-1) !== part.ids[i]) ids.push(part.ids[i]);
    }
    part.ids = ids;
    for (let i = 1; i < ids.length; i++) {
      const [a, b] = ids[i - 1] < ids[i] ? [ids[i - 1], ids[i]] : [ids[i], ids[i - 1]];
      const k = `${a}-${b}`;
      if (!edgeOf.has(k)) {
        edgeOf.set(k, edges.length);
        edges.push({ a, b, stretches: new Set() });
      }
      edges[edgeOf.get(k)].stretches.add(part.stretch);
    }
  }
  if (close > 0) closeGaps({ nodes, edges, stretches, edgeOf }, { close, tolerance });
  return { nodes, edges, stretches, parts };
}

// A loose end whose own route has another line within `close` ahead of it
// (within CLOSE_COS of the way its line came in, or within CLOSE_ANY in any
// direction) stops short of where its buses go: a gap in RTD's lines, or a
// terminal loop drawn open. A short edge carrying the loose end's routes
// joins it to that line, split at the nearest point. Changes the graph.
function closeGaps(graph, { close, tolerance }) {
  const { nodes, edges, stretches, edgeOf } = graph;
  const degree = new Map();
  const at = new Map();
  edges.forEach((e, i) => {
    for (const n of [e.a, e.b]) {
      degree.set(n, (degree.get(n) ?? 0) + 1);
      (at.get(n) ?? at.set(n, []).get(n)).push(i);
    }
  });
  const segs = new Cells(close);
  edges.forEach((e, i) => segs.addSegment(i, nodes[e.a], nodes[e.b]));
  const routesOf = (e) => new Set([...e.stretches].map((x) => stretches[x].route));
  const addEdge = (a, b, set) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const k = `${x}-${y}`;
    if (!edgeOf.has(k)) {
      edgeOf.set(k, edges.length);
      edges.push({ a: x, b: y, stretches: new Set() });
      segs.addSegment(edges.length - 1, nodes[x], nodes[y]);
    }
    for (const v of set) edges[edgeOf.get(k)].stretches.add(v);
  };
  const loose = [...degree].filter(([, d]) => d === 1).map(([n]) => n);
  for (const n of loose) {
    const mine = edges[at.get(n)[0]];
    const from = nodes[mine.a === n ? mine.b : mine.a];
    const p = nodes[n];
    const way = [p[0] - from[0], p[1] - from[1]];
    const own = routesOf(mine);
    let best = null;
    for (const i of segs.near(p)) {
      const e = edges[i];
      if (e === mine || e.a === n || e.b === n) continue;
      if (![...routesOf(e)].some((r) => own.has(r))) continue;
      const c = closest(p, nodes[e.a], nodes[e.b]);
      if (c.d > close) continue;
      const v = [c.q[0] - p[0], c.q[1] - p[1]];
      const cos = (way[0] * v[0] + way[1] * v[1]) / ((Math.hypot(...way) * Math.hypot(...v)) || 1);
      if (c.d > CLOSE_ANY && cos < CLOSE_COS) continue;
      if (!best || c.d < best.c.d) best = { i, c };
    }
    if (!best) continue;
    const e = edges[best.i];
    // Onto the line: an end of the edge if the point is that close, else a
    // new node splitting it.
    let target;
    if (dist(best.c.q, nodes[e.a]) <= tolerance) target = e.a;
    else if (dist(best.c.q, nodes[e.b]) <= tolerance) target = e.b;
    else {
      target = nodes.length;
      nodes.push(best.c.q);
      const set = new Set(e.stretches);
      edgeOf.delete(`${e.a}-${e.b}`);
      const [a, b] = [e.a, e.b];
      e.stretches = new Set(); // emptied: the two halves replace it
      addEdge(a, target, set);
      addEdge(target, b, set);
    }
    addEdge(n, target, mine.stretches);
  }
  // Drop the emptied edges, and index the rest again.
  const kept = edges.filter((e) => e.stretches.size);
  edges.splice(0, edges.length, ...kept);
  edgeOf.clear();
  edges.forEach((e, i) => edgeOf.set(`${e.a}-${e.b}`, i));
}

/**
 * The runs of a street graph: maximal paths of edges with one set of
 * stretches, through every node where exactly two of its edges have that
 * set. Each run is { nodes: [ids], stretches: Set }.
 */
export function runsOf(graph) {
  const { edges } = graph;
  const keyOf = edges.map((e) => [...e.stretches].sort((x, y) => x - y).join(','));
  const at = new Map(); // node -> edge indexes
  edges.forEach((e, i) => {
    for (const n of [e.a, e.b]) (at.get(n) ?? at.set(n, []).get(n)).push(i);
  });
  const done = new Set();
  const runs = [];
  // From node n along edge i, keep going while the set goes straight on.
  const walk = (n, i, key) => {
    const out = [];
    let [node, edge] = [n, i];
    for (;;) {
      const same = (at.get(node) ?? []).filter((j) => keyOf[j] === key);
      if (same.length !== 2) break;
      const next = same.find((j) => j !== edge);
      if (done.has(next)) break;
      done.add(next);
      const e = edges[next];
      node = e.a === node ? e.b : e.a;
      out.push(node);
      edge = next;
    }
    return out;
  };
  edges.forEach((e, i) => {
    if (done.has(i)) return;
    done.add(i);
    const ahead = walk(e.b, i, keyOf[i]);
    const back = walk(e.a, i, keyOf[i]);
    runs.push({ nodes: [...back.reverse(), e.a, e.b, ...ahead], stretches: e.stretches });
  });
  return runs;
}

// Evenly spaced departures for a stretch with no measured cell nearby: its
// own weekday headway, both ways.
const evenly = (wk) => (wk ? Array.from({ length: Math.floor((HOURS * 60) / wk) }, (_, k) => MIDDAY[0] + k * wk * 60) : []);

/**
 * The streets: LineString features, one per run, with `routes` (every route
 * along it, space-separated, in number order), `n` (how many run all day),
 * `pt` (how many part-time), `bph` (buses per hour in the busier direction,
 * to a tenth), `hw` (the rider's wait in minutes, rounded), `cls` (its class,
 * frequency.js), and for a one-way street `oneway` and `len` (metres), drawn
 * the way its buses go. `loads` is busStretches' cells per route. Returns
 * { streets, report }: report counts the graph and its loose ends.
 */
export function buildStreets(features, loads = new Map(), { precision = 5, simplify: tolerance = 1, classOf = classOfBph, nodeMeters = NODE_METERS } = {}) {
  const first = features.find((f) => partsOf(f.geometry).some((p) => p.length));
  if (!first) return { streets: [], report: {} };
  const { project, unproject } = projection(partsOf(first.geometry).find((p) => p.length)[0], precision);
  const graph = streetGraph(features, project, { tolerance: nodeMeters });
  const { nodes, stretches } = graph;
  const runs = runsOf(graph);

  // Each route's cells, in metres, to read a run's departures from.
  const cellsOf = new Map();
  for (const [route, list] of loads) {
    const grid = new Cells(CELL_NEAR);
    for (const c of list) {
      const at = project(c.at);
      grid.add({ at, dir: c.dir, with: c.with ?? [], against: c.against ?? [] }, at);
    }
    cellsOf.set(String(route), grid);
  }

  const lines = runs.map((run) => {
    const pts = run.nodes.map((n) => nodes[n]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const total = cum.at(-1);
    // The run's middle, and its direction there.
    let k = 1;
    while (k < pts.length - 1 && cum[k] < total / 2) k++;
    const seg = [pts[k - 1], pts[k]];
    const t = cum[k] > cum[k - 1] ? (total / 2 - cum[k - 1]) / (cum[k] - cum[k - 1]) : 0;
    const mid = [seg[0][0] + t * (seg[1][0] - seg[0][0]), seg[0][1] + t * (seg[1][1] - seg[0][1])];
    const routes = new Map(); // route -> { allDay, wk }
    for (const s of run.stretches) {
      const { route, tier, wk } = stretches[s];
      const r = routes.get(route) ?? { allDay: false, wk: null };
      if (ALL_DAY.has(tier)) {
        r.allDay = true;
        r.wk = r.wk == null ? wk : Math.min(r.wk, wk ?? r.wk);
      }
      routes.set(route, r);
    }
    // Departures each way along the run, from each all-day route's cell
    // nearest its middle on its own line.
    const fwd = [];
    const back = [];
    for (const [route, r] of routes) {
      if (!r.allDay) continue;
      let best = null;
      for (const c of cellsOf.get(route)?.near(mid) ?? []) {
        let on = Infinity;
        let along = null;
        for (let i = 1; i < pts.length; i++) {
          const q = closest(c.at, pts[i - 1], pts[i]);
          if (q.d < on) [on, along] = [q.d, [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]];
        }
        const d = dist(c.at, mid);
        const onLine = on <= CELL_METERS;
        if (!onLine && d > CELL_NEAR) continue;
        // A cell on the run's own line first, then the nearest to its middle.
        if (!best || (onLine && !best.onLine) || (onLine === best.onLine && d < best.d)) best = { c, onLine, d, along };
      }
      if (!best) {
        fwd.push(...evenly(r.wk));
        back.push(...evenly(r.wk));
        continue;
      }
      const same = best.c.dir[0] * best.along[0] + best.c.dir[1] * best.along[1] >= 0;
      fwd.push(...(same ? best.c.with : best.c.against));
      back.push(...(same ? best.c.against : best.c.with));
    }
    const [rf, rb] = [rate(fwd), rate(back)];
    const oneway = rf > 0 && rb <= ONE_WAY * rf ? 1 : rb > 0 && rf <= ONE_WAY * rb ? -1 : 0;
    const bph = Math.max(rf, rb);
    const names = [...routes.keys()].sort(byNumber);
    const n = [...routes.values()].filter((r) => r.allDay).length;
    return { pts, names, routes, n, pt: names.length - n, bph, oneway, total };
  });

  // Twins: the other carriageway of a two-way road.
  const twinCells = new Cells(TWIN_METERS);
  lines.forEach((l, i) => {
    if (!l.oneway || !l.n) return;
    let along = 0;
    for (let j = 1; j < l.pts.length; j++) {
      twinCells.addSegment({ line: i, a: l.pts[j - 1], b: l.pts[j], along }, l.pts[j - 1], l.pts[j]);
      along += dist(l.pts[j - 1], l.pts[j]);
    }
  });
  const travel = (l, a, b) => (l.oneway > 0 ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]]);
  const twinned = lines.map((l, i) => {
    if (!l.oneway || !l.n) return false;
    let hits = 0;
    const samples = [0.25, 0.5, 0.75];
    for (const f of samples) {
      let k = 1;
      let walked = 0;
      while (k < l.pts.length - 1 && walked + dist(l.pts[k - 1], l.pts[k]) < l.total * f) walked += dist(l.pts[k - 1], l.pts[k++]);
      const [a, b] = [l.pts[k - 1], l.pts[k]];
      const s = dist(a, b) ? (l.total * f - walked) / dist(a, b) : 0;
      const p = [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])];
      const mine = travel(l, a, b);
      const ml = Math.hypot(...mine) || 1;
      const found = [...twinCells.near(p)].some((seg) => {
        // The run's own other side counts (a loop up one carriageway and
        // back down the other), but not its own line next to the sample.
        if (seg.line === i && Math.abs(seg.along - l.total * f) < 3 * TWIN_METERS) return false;
        const o = lines[seg.line];
        if (![...o.routes.keys()].some((r) => l.routes.get(r)?.allDay && o.routes.get(r)?.allDay)) return false;
        if (closest(p, seg.a, seg.b).d > TWIN_METERS) return false;
        const theirs = travel(o, seg.a, seg.b);
        const cos = (mine[0] * theirs[0] + mine[1] * theirs[1]) / (ml * (Math.hypot(...theirs) || 1));
        return cos <= -TWIN_COS;
      });
      if (found) hits++;
    }
    return hits >= 2;
  });

  const streets = [];
  lines.forEach((l, i) => {
    // A street with only part-time routes isn't a street: they keep their
    // own dashed lines.
    if (!l.n) return;
    const pts = l.oneway < 0 ? [...l.pts].reverse() : l.pts;
    const coords = dedupe(simplify(pts, tolerance).map(unproject));
    if (coords.length < 2) return;
    const oneway = l.oneway && !twinned[i];
    streets.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        mode: 'bus',
        routes: l.names.join(' '),
        n: l.n,
        ...(l.pt ? { pt: l.pt } : {}),
        bph: Math.round(l.bph * 10) / 10,
        hw: l.bph > 0 ? Math.max(1, Math.round(60 / l.bph)) : null,
        cls: classOf(l.bph),
        ...(oneway ? { oneway: 1, len: Math.round(length(pts)) } : {}),
      },
    });
  });
  return { streets, report: graphReport(graph) };
}

/** The streets alone (buildStreets without its report). */
export const busStreets = (...args) => buildStreets(...args).streets;

/**
 * What a drawing of the graph would show at its loose ends: nodes on one
 * edge only. `ends` is how many; `nearOwn`, how many of those have another
 * line of one of their own routes within BREAK_METERS (a terminal loop, or
 * a gap in RTD's own lines), each with where it is, for the build's report.
 */
export function graphReport(graph) {
  const { nodes, edges, stretches } = graph;
  const degree = new Map();
  for (const e of edges) for (const n of [e.a, e.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
  const loose = [...degree].filter(([, d]) => d === 1).map(([n]) => n);
  const segs = new Cells(BREAK_METERS);
  edges.forEach((e, i) => segs.addSegment(i, nodes[e.a], nodes[e.b]));
  const routesOf = (e) => new Set([...e.stretches].map((s) => stretches[s].route));
  const nearOwn = [];
  for (const n of loose) {
    const mine = edges.find((e) => e.a === n || e.b === n);
    const own = routesOf(mine);
    for (const i of segs.near(nodes[n])) {
      const e = edges[i];
      if (e === mine || e.a === n || e.b === n) continue;
      if (![...routesOf(e)].some((r) => own.has(r))) continue;
      const d = closest(nodes[n], nodes[e.a], nodes[e.b]).d;
      if (d <= BREAK_METERS) {
        nearOwn.push({ node: n, d: Math.round(d * 10) / 10, routes: [...own].sort(byNumber).join(' ') });
        break;
      }
    }
  }
  return { nodes: nodes.length, edges: edges.length, ends: loose.length, nearOwn: nearOwn.length, nearOwnAt: nearOwn };
}

// A shared street's frequency as a rider waits for it: departure `times`
// (seconds) in the window, in any order, give the gaps between them, and the
// street is as frequent as the gap that nine in ten gaps are at or under.
// Evenly spaced buses give their plain headway; two every-30 routes that
// leave a minute apart stay every 30, because nine in ten waits are that
// long gap, and only buses that interleave add up to a faster street. Gaps
// are counted without their length, so one bunch of four buses is one bunch,
// not four buses' worth of speed. Under two departures: the plain rate.
export function rate(times) {
  if (times.length < 2) return times.length / HOURS;
  const s = [...times].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1]) gaps.push(s[i] - s[i - 1]);
  if (!gaps.length) return 3600;
  gaps.sort((a, b) => a - b);
  const wait = gaps[Math.ceil(0.9 * gaps.length) - 1];
  return 3600 / wait;
}
