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
// A divided road's carriageways (#81): a line of an all-day route with another
// line of one of its routes beside it, this far apart at least (closer is the
// same street drawn twice, which NODE_METERS joins), parallel within
// CARRIAGEWAY_COS and square across (within ACROSS_COS of square), along
// CARRIAGEWAY_MIN of its length, and so for CARRIAGEWAY_RUN or more, is drawn
// once down the middle; the lines are joined again within MERGE_NODE_METERS.
const MIN_APART = 4;
const CARRIAGEWAY_COS = Math.cos((20 * Math.PI) / 180);
const ACROSS_COS = Math.cos((60 * Math.PI) / 180);
const CARRIAGEWAY_MIN = 0.6;
const CARRIAGEWAY_RUN = 100;
const MERGE_NODE_METERS = 4;
const MERGE_PASSES = 3;
const SAME_ROUTES = 0.75;
// A merged street is simplified this much (metres) between its junctions.
const MERGED_SIMPLIFY = 8;
// ...and joined to it, if that line is ahead of it (closeGaps).
const CLOSE_METERS = 30;
const CLOSE_COS = Math.cos((60 * Math.PI) / 180);
const CLOSE_ANY = 15;
// A part-time street takes the strongest part-time tier on it: rush hours
// (dashed) before a few trips (dotted).
const PART_TIME_ORDER = ['peak', 'limited', 'none', 'unknown'];
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
export function streetGraph(features, project, { tolerance = NODE_METERS, close = CLOSE_METERS, merge = true, loops = true, cells = new Map(), places = [], stops = [] } = {}) {
  // A stretch is a route at one tier and headway: runs are cut where one
  // joins or leaves, so a route that runs less often past a short turn is
  // drawn at its own rate there.
  const stretches = [];
  const stretchOf = new Map();
  const lines = [];
  for (const f of features) {
    const { route, tier, wk } = f.properties;
    const key = `${route}\u0000${tier}\u0000${wk ?? ''}`;
    if (!stretchOf.has(key)) {
      stretchOf.set(key, stretches.length);
      stretches.push({ route: String(route), tier, wk: wk ?? null });
    }
    for (const part of partsOf(f.geometry)) if (part.length >= 2) lines.push({ stretch: stretchOf.get(key), coords: part.map(project) });
  }
  // Gaps are closed before loops are simplified: a terminal loop RTD draws
  // open is a loop once its end is joined back to where it began (FreeRide at
  // Civic Center), and a turn there.
  const tidy = (g) => {
    if (close > 0) closeGaps(g, { close, tolerance });
    if (loops) simplifyLoops(g, places, stops);
    // ...and once more for the ends a loop left: a ramp whose circle went
    // stops short of the road it led onto. Only onto a line ahead of it, so
    // a short end to a Park-n-Ride isn't tied back into a loop.
    if (loops && close > 0) closeGaps(g, { close, tolerance, any: 0 });
  };
  const plain = nodeParts(lines, stretches, tolerance);
  tidy(plain);
  // A divided road's two carriageways, drawn once down the middle (#81):
  // each node of a carriageway moves halfway to the other, and the lines are
  // joined again, so the two become one line and the cross streets, whose
  // nodes moved with them, still meet it. The graph returned is that one;
  // `plain` is the graph before, with its carriageways, and `moved` its
  // nodes that moved. A street with a moved node is drawn from the merged
  // graph out to MERGED_UNTIL and from the plain one in from there.
  let graph = plain;
  let merged = 0;
  if (merge) {
    // Again on the merged graph, up to MERGE_PASSES times: a highway drawn
    // as three lines (two carriageways and an express lane) is one pair
    // merged, then the next.
    for (let pass = 0; pass < MERGE_PASSES; pass++) {
      const moved = carriagewayCentres(graph, cells);
      if (!moved.size) break;
      merged += moved.size;
      const from = graph;
      const again = from.parts.map((part) => ({ stretch: part.stretch, coords: part.ids.map((id) => moved.get(id) ?? from.nodes[id]), moved: part.ids.map((id) => moved.has(id)) }));
      graph = nodeParts(again, stretches, tolerance, MERGE_NODE_METERS);
    }
    if (graph !== plain) tidy(graph);
  }
  graph.plain = plain;
  graph.merged = merged;
  return graph;
}

// Ramp circles and small loops, drawn as the turn the bus makes (#82;
// DESIGN.md, "Readable geometry"). RTD draws each bus as driven: round a
// cloverleaf's circle, or a lap round a block to turn back, and several
// routes doing that at one interchange are a knot. On the street graph, once
// for every route on the street, so the streets still meet:
// - a detour: a stretch of one set of routes between two junctions that is
//   DETOUR times longer than the straight line between them, no more than
//   DETOUR_CLOSE apart, and no wider than LOOP_REACH, is the turn from one
//   road to the other, drawn straight;
// - a small loop: a stretch that leaves a junction and comes back to it, no
//   farther from it than LOOP_REACH, is a turn at that junction, and goes.
// A stretch shorter than LOOP_MIN is a street corner, and stays; so does a
// loop that is all there is of its line (a circulator). A loop riders board
// on (a bus stop on it, `stops`) with a station or a Park-n-Ride (`places`,
// both [x, y] in metres) within PLACE_NEAR is the terminal loop that serves
// it: it becomes a short end, the shorter way round to the loop's point
// nearest the place, so the line ends there; with no place near, to its stop
// farthest out. A loop with no stop goes (a ramp's circle), and the stem it
// hung from with it when that is shorter than STEM_SHORT, so the line ends
// on the road, not in a tick off it. Changes the graph.
const DETOUR = 2.5;
// ...whose ends are no farther apart than this: the turn is drawn straight
// from one to the other, so a longer straight would cut across the land
// (a cloverleaf's whole interior); as the batch's laps (generalize.mjs,
// THROUGH_CLOSE).
const DETOUR_CLOSE = 100;
const LOOP_REACH = 220;
const LOOP_MIN = 60;
const PLACE_NEAR = 250;
// A loop serves a place only if riders board on it: a bus stop within
// STOP_ON of the loop, or the place itself within PLACE_ON of it. A ramp's
// circle by a station serves nothing. A loop with stops and no place near
// ends at its stop farthest from where it began.
const STOP_ON = 30;
const PLACE_ON = 60;
const MOUTH = 60;
// A short end that turns back on itself in its last BARB metres (round the
// loop's tip towards the place) stops at the tip: a barb reads as a hook.
const BARB = 40;
const BARB_COS = Math.cos((100 * Math.PI) / 180);
const STEM_SHORT = 120;
function simplifyLoops(graph, places = [], stops = []) {
  const stopCells = new Cells(STOP_ON * 2);
  for (const q of stops) stopCells.add(q, q);
  const { nodes, edges, edgeOf } = graph;
  const at = new Map();
  edges.forEach((e, i) => {
    for (const n of [e.a, e.b]) (at.get(n) ?? at.set(n, []).get(n)).push(i);
  });
  const keyOf = edges.map((e) => [...e.stretches].sort((x, y) => x - y).join(','));
  const done = new Set();
  const add = (a, b, set) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const k = `${x}-${y}`;
    if (!edgeOf.has(k)) {
      edgeOf.set(k, edges.length);
      edges.push({ a: x, b: y, stretches: new Set() });
    }
    for (const v of set) edges[edgeOf.get(k)].stretches.add(v);
  };
  // From node n along edge i, through nodes of degree 2 where the same set
  // goes on: the stretch's nodes and edges.
  const walk = (n, i) => {
    const ns = [];
    const es = [];
    let [node, edge] = [n, i];
    for (;;) {
      const here = at.get(node);
      if (here.length !== 2) break;
      const next = here.find((j) => j !== edge);
      if (next === undefined || done.has(next) || keyOf[next] !== keyOf[i]) break;
      done.add(next);
      es.push(next);
      const e = edges[next];
      node = e.a === node ? e.b : e.a;
      ns.push(node);
      edge = next;
      if (node === n) break;
    }
    return { ns, es };
  };
  // The interior node of a stretch nearest a place within PLACE_NEAR that the
  // stretch reaches out towards (nearer the stretch than the straight line
  // between its ends, for a detour), or 0.
  const served = (chain, detour) => {
    const [U, V] = [nodes[chain[0]], nodes[chain.at(-1)]];
    // The stops on the stretch, each at its interior node nearest it.
    const boarded = [];
    for (let k = 1; k < chain.length - 1; k++) {
      for (const q of stopCells.near(nodes[chain[k]])) {
        const on = Math.min(closest(q, nodes[chain[k - 1]], nodes[chain[k]]).d, closest(q, nodes[chain[k]], nodes[chain[k + 1]]).d);
        // (Not a stop at the stretch's mouth: that one is on the street.)
        if (on <= STOP_ON && Math.min(dist(q, U), dist(q, V)) > MOUTH) boarded.push({ k, away: Math.min(dist(nodes[chain[k]], U), dist(nodes[chain[k]], V)) });
      }
    }
    let best = null;
    for (let k = 1; k < chain.length - 1; k++) {
      for (const q of places) {
        const d = dist(nodes[chain[k]], q);
        if (d > PLACE_NEAR || (best && d >= best.d)) continue;
        if (detour && closest(q, U, V).d <= d) continue;
        if (!boarded.length && d > PLACE_ON) continue;
        best = { k, d };
      }
    }
    if (best) return best.k;
    if (!boarded.length) return 0;
    // No place near, but riders board on it. A detour off the street and
    // back to it stays as it is drawn (-1): the bus leaves the street to
    // stop there. A loop ends at its stop farthest out.
    return detour ? -1 : boarded.reduce((a, b) => (b.away > a.away ? b : a)).k;
  };
  // Keep the shorter way from an end of the stretch to node k; drop the rest.
  const shortEnd = (chain, chainEdges, k, len) => {
    let there = 0;
    for (let m = 1; m <= k; m++) there += dist(nodes[chain[m - 1]], nodes[chain[m]]);
    // The way kept, from the junction out, as places in the chain.
    let path = there <= len - there ? Array.from({ length: k + 1 }, (_, m) => m) : Array.from({ length: chain.length - k }, (_, m) => chain.length - 1 - m);
    // The way the line comes in to where the stretch begins, if one street
    // leads there: a short end that doubles straight back off it is a barb
    // too, and the line ends where the stretch began.
    const start = chain[path[0]];
    const live = (n) => (at.get(n) ?? []).filter((j) => edges[j].stretches.size && !chainEdges.includes(j));
    // ...as it runs over the last BARB metres before the stretch (a corner
    // piece a few metres long at the junction says nothing).
    let before = null;
    if (live(start).length === 1) {
      let [node, edge, walked] = [start, live(start)[0], 0];
      for (;;) {
        const f = edges[edge];
        const next = f.a === node ? f.b : f.a;
        walked += dist(nodes[node], nodes[next]);
        before = nodes[next];
        const on = live(next).filter((j) => j !== edge);
        if (walked >= BARB || on.length !== 1) break;
        [node, edge] = [next, on[0]];
      }
    }
    const pts = [...(before ? [before] : []), ...path.map((m) => nodes[chain[m]])];
    const lead = before ? 1 : 0;
    for (let i = 1; i < pts.length - 1; i++) {
      let tail = 0;
      for (let j = i + 1; j < pts.length; j++) tail += dist(pts[j - 1], pts[j]);
      if (tail >= BARB) continue;
      const a = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
      const b = [pts.at(-1)[0] - pts[i][0], pts.at(-1)[1] - pts[i][1]];
      if ((a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1) < BARB_COS) {
        path = path.slice(0, i + 1 - lead);
        break;
      }
    }
    // chainEdges[m] joins chain[m] and chain[m + 1].
    const kept = new Set();
    for (let i = 1; i < path.length; i++) kept.add(chainEdges[Math.min(path[i - 1], path[i])]);
    for (const j of chainEdges) {
      if (kept.has(j)) continue;
      edgeOf.delete(`${edges[j].a}-${edges[j].b}`);
      edges[j].stretches = new Set();
    }
  };
  const count = edges.length;
  for (let i = 0; i < count; i++) {
    if (done.has(i) || !edges[i].stretches.size) continue;
    done.add(i);
    const e = edges[i];
    const ahead = walk(e.b, i);
    const back = walk(e.a, i);
    const chain = [...back.ns.reverse(), e.a, e.b, ...ahead.ns];
    const chainEdges = [...[...back.es].reverse(), i, ...ahead.es];
    const [u, v] = [chain[0], chain.at(-1)];
    let len = 0;
    for (let k = 1; k < chain.length; k++) len += dist(nodes[chain[k - 1]], nodes[chain[k]]);
    if (len < LOOP_MIN) continue;
    const reach = Math.max(...chain.map((n) => dist(nodes[n], nodes[u])));
    if (reach > LOOP_REACH) continue;
    const set = new Set(e.stretches);
    const drop = (list) => {
      for (const j of list) {
        edgeOf.delete(`${edges[j].a}-${edges[j].b}`);
        edges[j].stretches = new Set();
      }
    };
    if (u === v) {
      // A loop back to where it left: a turn there, if it hangs off a line.
      if (at.get(u).length < 3) continue;
      // The place it serves, if one is near: a short end to it.
      const k = served(chain, false);
      if (k) {
        shortEnd(chain, chainEdges, k, len);
        continue;
      }
      drop(chainEdges);
      // The stem it hung from, if short: back to the junction it left.
      const stem = [];
      let [node, prev] = [u, null];
      for (;;) {
        const live = (at.get(node) ?? []).filter((j) => edges[j].stretches.size && j !== prev);
        if (live.length !== 1 || (prev !== null && (at.get(node) ?? []).filter((j) => edges[j].stretches.size).length !== 2)) break;
        const j = live[0];
        stem.push(j);
        const f = edges[j];
        node = f.a === node ? f.b : f.a;
        prev = j;
        if ((at.get(node) ?? []).filter((x) => edges[x].stretches.size).length !== 2) break;
      }
      const stemLen = stem.reduce((sum, j) => sum + dist(nodes[edges[j].a], nodes[edges[j].b]), 0);
      if (stem.length && stemLen < STEM_SHORT && (at.get(node) ?? []).filter((x) => edges[x].stretches.size).length > 2) drop(stem);
      continue;
    } else if (len < DETOUR * dist(nodes[u], nodes[v]) || dist(nodes[u], nodes[v]) > DETOUR_CLOSE) continue;
    // A detour out to a place and back (a terminal loop whose way back runs
    // along the street it left) is a short end to the place, too.
    const k = served(chain, true);
    if (k < 0) continue;
    if (k) shortEnd(chain, chainEdges, k, len);
    else drop(chainEdges);
    add(u, v, set);
  }
  const kept = edges.filter((e) => e.stretches.size);
  edges.splice(0, edges.length, ...kept);
  edgeOf.clear();
  edges.forEach((e, i) => edgeOf.set(`${e.a}-${e.b}`, i));
}

// Lines ({ stretch, coords, moved? } in metres) joined where they meet:
// vertices within `tolerance` are one node, and a node lying on a segment
// splits it. A vertex that `moved` (to a divided road's middle line) joins
// a node within `movedTolerance`; the rest are placed first and keep their
// places, so a street the merge didn't touch is the same in both graphs.
function nodeParts(lines, stretches, tolerance, movedTolerance = tolerance) {
  const nodes = [];
  const nodeCells = new Cells(Math.max(tolerance, movedTolerance) * 2);
  const nodeAt = (p, m) => {
    const reach = m ? movedTolerance : tolerance;
    let best = null;
    for (const id of nodeCells.near(p)) {
      const d = dist(nodes[id], p);
      if (d <= reach && (!best || d < best.d)) best = { id, d };
    }
    if (best) return best.id;
    nodes.push(p);
    nodeCells.add(nodes.length - 1, p);
    return nodes.length - 1;
  };
  for (const line of lines) line.coords.forEach((q, k) => !line.moved?.[k] && nodeAt(q, false));
  const parts = [];
  const movedNodes = new Set();
  for (const line of lines) {
    const ids = [];
    line.coords.forEach((q, k) => {
      const id = nodeAt(q, line.moved?.[k]);
      if (line.moved?.[k]) movedNodes.add(id);
      if (ids.at(-1) !== id) ids.push(id);
    });
    if (ids.length >= 2) parts.push({ stretch: line.stretch, ids });
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
  return { nodes, edges, stretches, parts, edgeOf, movedNodes };
}

/**
 * Where each node of a divided road's carriageways moves: halfway to the
 * other carriageway. A carriageway is a line with another line of one of its
 * all-day routes beside it, parallel within CARRIAGEWAY_COS, MIN_APART to
 * TWIN_METERS off, square across (not ahead), for at least CARRIAGEWAY_MIN
 * of each edge's length and CARRIAGEWAY_RUN in all. Returns Map(node ->
 * [x, y]).
 */
function carriagewayCentres(graph, cells) {
  const { nodes, edges, stretches } = graph;
  const allDay = (e) => new Set([...e.stretches].filter((x) => ALL_DAY.has(stretches[x].tier)).map((x) => stretches[x].route));
  const routesOf = edges.map(allDay);
  // Which way route r's buses go along edge i: 1 from a to b, -1 back, 0
  // both ways or not known (from its measured cell on the edge).
  const travelCache = new Map();
  const travel = (i, r) => {
    const key = `${i}\u0000${r}`;
    if (travelCache.has(key)) return travelCache.get(key);
    const e = edges[i];
    const [A, B] = [nodes[e.a], nodes[e.b]];
    const u = [B[0] - A[0], B[1] - A[1]];
    const ul = Math.hypot(...u) || 1;
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    let best = null;
    for (const c of cells.get(r)?.near(M) ?? []) {
      const q = closest(c.at, A, B);
      if (q.d > CELL_METERS) continue;
      const cos = (c.dir[0] * u[0] + c.dir[1] * u[1]) / ((Math.hypot(...c.dir) || 1) * ul);
      if (Math.abs(cos) < CARRIAGEWAY_COS) continue;
      const d = dist(c.at, M);
      if (!best || d < best.d) best = { c, d, sense: cos >= 0 ? 1 : -1 };
    }
    let t = 0;
    if (best) {
      const [w, a] = [best.c.with.length, best.c.against.length];
      if (w > 0 && a <= ONE_WAY * w) t = best.sense;
      else if (a > 0 && w <= ONE_WAY * a) t = -best.sense;
    }
    travelCache.set(key, t);
    return t;
  };
  const segs = new Cells(TWIN_METERS);
  edges.forEach((e, i) => segs.addSegment(i, nodes[e.a], nodes[e.b]));
  // The other carriageway at point p on edge i: the nearest point, on a
  // parallel edge of one of i's all-day routes, square across from p.
  const partner = (p, i) => {
    const e = edges[i];
    const [A, B] = [nodes[e.a], nodes[e.b]];
    const u = [B[0] - A[0], B[1] - A[1]];
    const ul = Math.hypot(...u) || 1;
    let best = null;
    for (const j of segs.near(p)) {
      if (j === i) continue;
      const o = edges[j];
      if (o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
      if (![...routesOf[j]].some((r) => routesOf[i].has(r))) continue;
      const [C, D] = [nodes[o.a], nodes[o.b]];
      const v = [D[0] - C[0], D[1] - C[1]];
      const vl = Math.hypot(...v) || 1;
      const cos = (u[0] * v[0] + u[1] * v[1]) / (ul * vl);
      if (Math.abs(cos) < CARRIAGEWAY_COS) continue;
      // Two carriageways of one road carry mostly the same all-day routes (a
      // route may take another street one way, as the 31 does by Colfax): at
      // least SAME_ROUTES of the routes on either. A ramp or a bus lane by a
      // terminal carries a few of them. And they don't run the same way: two
      // lines a route's buses take the same way are lanes. (A carriageway's
      // cells count the other's trips too, so most read two way, and the
      // direction can only rule a pair out.)
      const shared = [...routesOf[j]].filter((r) => routesOf[i].has(r)).length;
      if (shared < SAME_ROUTES * new Set([...routesOf[i], ...routesOf[j]]).size) continue;
      if ([...routesOf[i]].some((r) => travel(i, r) && travel(j, r) && cos * travel(i, r) * travel(j, r) > 0)) continue;
      const c = closest(p, C, D);
      if (c.d < MIN_APART || c.d > TWIN_METERS) continue;
      const w = [c.q[0] - p[0], c.q[1] - p[1]];
      if (Math.abs((u[0] * w[0] + u[1] * w[1]) / (ul * (Math.hypot(...w) || 1))) > ACROSS_COS) continue;
      if (!best || c.d < best.d) best = { d: c.d, q: c.q, j };
    }
    return best;
  };
  // Edges that run beside another carriageway for most of their length.
  const paired = edges.map((e, i) => {
    if (!routesOf[i].size) return false;
    const [A, B] = [nodes[e.a], nodes[e.b]];
    const len = dist(A, B);
    const n = Math.max(1, Math.round(len / 10));
    let hits = 0;
    for (let k = 0; k <= n; k++) if (partner([A[0] + ((B[0] - A[0]) * k) / n, A[1] + ((B[1] - A[1]) * k) / n], i)) hits++;
    return hits / (n + 1) >= CARRIAGEWAY_MIN;
  });
  // ...in stretches of CARRIAGEWAY_RUN or more, counting paired edges joined
  // end to end.
  const at = new Map();
  edges.forEach((e, i) => {
    if (!paired[i]) return;
    for (const n of [e.a, e.b]) (at.get(n) ?? at.set(n, []).get(n)).push(i);
  });
  const keep = new Set();
  const seen = new Set();
  edges.forEach((e, i) => {
    if (!paired[i] || seen.has(i)) return;
    const group = [];
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const k = stack.pop();
      group.push(k);
      for (const n of [edges[k].a, edges[k].b]) for (const m of at.get(n) ?? []) if (!seen.has(m)) seen.add(m), stack.push(m);
    }
    const total = group.reduce((sum, k) => sum + dist(nodes[edges[k].a], nodes[edges[k].b]), 0);
    if (total >= CARRIAGEWAY_RUN) for (const k of group) keep.add(k);
  });
  // Each node of a kept edge moves halfway to its partner.
  const moved = new Map();
  for (const i of keep) {
    for (const n of [edges[i].a, edges[i].b]) {
      if (moved.has(n)) continue;
      const found = partner(nodes[n], i);
      if (found && keep.has(found.j)) moved.set(n, [(nodes[n][0] + found.q[0]) / 2, (nodes[n][1] + found.q[1]) / 2]);
    }
  }
  return moved;
}

// A loose end whose own route has another line within `close` ahead of it
// (within CLOSE_COS of the way its line came in, or within CLOSE_ANY in any
// direction) stops short of where its buses go: a gap in RTD's lines, or a
// terminal loop drawn open. A short edge carrying the loose end's routes
// joins it to that line, split at the nearest point. Changes the graph.
function closeGaps(graph, { close, tolerance, any = CLOSE_ANY }) {
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
      if (c.d > any && cos < CLOSE_COS) continue;
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
 * frequency.js), `len` (metres), and for a one-way street `oneway`, drawn
 * the way its buses go. `loads` is busStretches' cells per route. Returns
 * { streets, report }: report counts the graph and its loose ends.
 */
export function buildStreets(features, loads = new Map(), { precision = 5, simplify: tolerance = 1, classOf = classOfBph, nodeMeters = NODE_METERS, places = [], stops = [] } = {}) {
  const first = features.find((f) => partsOf(f.geometry).some((p) => p.length));
  if (!first) return { streets: [], report: {} };
  const { project, unproject } = projection(partsOf(first.geometry).find((p) => p.length)[0], precision);
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

  const graph = streetGraph(features, project, { tolerance: nodeMeters, cells: cellsOf, places: places.map(project), stops: stops.map(project) });
  // The streets of a graph, each with `moved`: whether it has a node that
  // moved to a divided road's middle line.
  const draw = (graph, isMoved) => {
    const { nodes, stretches } = graph;
    const runs = runsOf(graph);
    // Nodes where more than two edges meet: a junction, where another line
    // (a branch, a part-time route, a crossing street) meets this one.
    const degree = new Map();
    for (const e of graph.edges) for (const n of [e.a, e.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
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
        const r = routes.get(route) ?? { allDay: false, wk: null, tiers: new Set() };
        r.tiers.add(tier);
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
        // The route's cell nearest the run's middle, one for each way its line
        // runs there: a street drawn once has one, but a divided road drawn
        // down its middle (#81) has a cell on each carriageway, each line
        // drawn one way, and both ways count.
        const best = [null, null];
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
          const k = c.dir[0] * along[0] + c.dir[1] * along[1] >= 0 ? 0 : 1;
          // A cell on the run's own line first, then the nearest to its middle.
          const b = best[k];
          if (!b || (onLine && !b.onLine) || (onLine === b.onLine && d < b.d)) best[k] = { c, onLine, d, same: k === 0 };
        }
        if (!best[0] && !best[1]) {
          fwd.push(...evenly(r.wk));
          back.push(...evenly(r.wk));
          continue;
        }
        // Each way once: from the nearer cell when both read it.
        const cells = best.filter(Boolean).sort((x, y) => x.d - y.d);
        const take = (x) => ({ f: x.same ? x.c.with : x.c.against, b: x.same ? x.c.against : x.c.with });
        const [first, second] = cells.map(take);
        fwd.push(...(first.f.length || !second ? first.f : second.f));
        back.push(...(first.b.length || !second ? first.b : second.b));
      }
      const [rf, rb] = [rate(fwd), rate(back)];
      const oneway = rf > 0 && rb <= ONE_WAY * rf ? 1 : rb > 0 && rf <= ONE_WAY * rb ? -1 : 0;
      const bph = Math.max(rf, rb);
      const names = [...routes.keys()].sort(byNumber);
      const n = [...routes.values()].filter((r) => r.allDay).length;
      const keep = run.nodes.map((n, i) => i === 0 || i === run.nodes.length - 1 || degree.get(n) > 2);
    // A street that runs down a divided road's middle: its points came from
    // both carriageways and jitter, so it is drawn smoother (out to z16 only).
    const merged = run.nodes.some((n) => graph.movedNodes?.has(n));
      return { pts, keep, names, routes, n, pt: names.length - n, bph, oneway, total, nodes: run.nodes, merged };
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
      // A street with only part-time routes has no width of its own: it is
      // drawn as their dashed (rush hours) or dotted (a few trips) line, from
      // the street graph like every other, so it meets the streets it joins
      // and moves with a divided road (`n: 0`, `tier`).
      const partTime = !l.n ? (PART_TIME_ORDER.find((t) => [...l.routes.values()].some((r) => r.tiers.has(t))) ?? 'unknown') : null;
      const pts = l.oneway < 0 ? [...l.pts].reverse() : l.pts;
      const keep = l.oneway < 0 ? [...l.keep].reverse() : l.keep;
      // Simplified between junctions only: a node where another line meets
      // this one stays exactly where it is, so that line still meets it.
      const kept = [];
      let from = 0;
      for (let i = 1; i < pts.length; i++) {
        if (!keep[i]) continue;
        const piece = simplify(pts.slice(from, i + 1), l.merged ? MERGED_SIMPLIFY : tolerance);
        kept.push(...(kept.length ? piece.slice(1) : piece));
        from = i;
      }
      const coords = dedupe(kept.map(unproject));
      if (coords.length < 2) return;
      const oneway = l.oneway && !twinned[i];
      streets.push({
        moved: l.nodes.some(isMoved),
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
          len: Math.round(length(pts)),
          ...(oneway ? { oneway: 1 } : {}),
          ...(partTime ? { tier: partTime } : {}),
        },
      });
    });
    return streets;
  };
  // A divided road is one line out to MERGED_UNTIL and its two carriageways
  // from there in (#81). A street drawn the same in both graphs is drawn at
  // every zoom, once; every other street of the merged graph is drawn out
  // there (`zoom: 'far'`) and of the plain graph in here (`zoom: 'near'`),
  // so each side of the zoom has its whole graph and nothing else: a street
  // that ends where the merged road's junction is (not where the
  // carriageway's was) is a different street.
  const tag = (f, zoom) => ({ ...f, properties: { ...f.properties, zoom } });
  const strip = ({ moved, ...f }) => f;
  const same = (f) => {
    const a = JSON.stringify(f.geometry.coordinates);
    const b = JSON.stringify([...f.geometry.coordinates].reverse());
    return a < b ? a : b;
  };
  const far = draw(graph, () => false).map(strip);
  let streets = far;
  if (graph !== graph.plain) {
    const near = draw(graph.plain, () => false).map(strip);
    const inNear = new Set(near.map(same));
    const inFar = new Set(far.map(same));
    streets = [...far.map((f) => (inNear.has(same(f)) ? f : tag(f, 'far'))), ...near.filter((f) => !inFar.has(same(f))).map((f) => tag(f, 'near'))];
  }
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
