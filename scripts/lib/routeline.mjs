// A picked route's line on a sheet, drawn as one clean path (DESIGN.md, "Five sheets", the picked
// route): built from the sheet's own street pieces that carry the route, so it lies on the streets
// the sheet draws, then tidied for reading on its own:
//
// - pieces whose ends meet (within `snap` px, or an end on another piece's middle) are joined;
// - gaps up to `bridge` px between the joined parts are closed;
// - the main path is the longest way through them, end to end;
// - another piece is kept beside it only where it stands more than `apart` px off the main path
//   (a second street of a one-way pair a sheet can't tell apart is dropped; an end loop is kept);
// - dead-end stubs shorter than `stub` px are dropped;
// - every path is smoothed over `sigma` px, so a jog between streets that close is a bend,
//   not a stair step. Its ends stay where they are.
//
// Pure: paths in, paths out (sheet pixels). `parts` reports what it did, for the checks.
import { length, resample, simplify, nearest, chained } from './sheets.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The path cut at the distances `cuts` along it. */
function cutAt(path, cuts) {
  const at = [...new Set(cuts.map((c) => Math.round(c * 1000) / 1000))].sort((a, b) => a - b);
  if (!at.length) return [path];
  const out = [];
  let cur = [path[0]];
  let run = 0;
  let k = 0;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const seg = dist(a, b);
    while (k < at.length && at[k] <= run + seg) {
      const t = seg ? (at[k] - run) / seg : 0;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      cur.push(p);
      out.push(cur);
      cur = [p];
      k++;
    }
    cur.push(b);
    run += seg;
  }
  out.push(cur);
  return out.filter((p) => length(p) > 1e-6);
}

/** A path smoothed with a Gaussian of `sigma` px, its ends held. */
export function smoothed(path, sigma) {
  if (sigma <= 0 || path.length < 3) return path;
  const pts = resample(path, 1);
  if (pts.length < 3) return path;
  const reach = Math.ceil(3 * sigma);
  const w = Array.from({ length: reach + 1 }, (_, i) => Math.exp(-(i * i) / (2 * sigma * sigma)));
  const out = pts.map((p, i) => {
    // The window shrinks toward the ends, evenly on both sides, so an end does not move.
    const r = Math.min(reach, i, pts.length - 1 - i);
    let [x, y, s] = [0, 0, 0];
    for (let j = -r; j <= r; j++) {
      const q = pts[i + j];
      const k = w[Math.abs(j)];
      x += q[0] * k; y += q[1] * k; s += k;
    }
    return [x / s, y / s];
  });
  return simplify(out, 0.15);
}

export function routeLine(pieces, { snap = 2, stub = 6, apart = 4, bridge = 10, sigma = 3, guide = [], far = 0 } = {}) {
  const raw = pieces.filter((p) => p.length > 1 && length(p) > 1e-6).map((p) => p.map((q) => [...q]));
  const report = { pieces: raw.length, bridged: 0, gaps: 0, dropped: 0, stubs: 0 };
  if (!raw.length) return { paths: [], ...report };
  // Pieces meet at their ends, or where an end lies on another piece's middle (split there).
  const tips = raw.flatMap((p) => [p[0], p.at(-1)]);
  const split = raw.flatMap((p) => {
    const L = length(p);
    const cuts = [];
    const [x0, y0, x1, y1] = [Math.min(...p.map((q) => q[0])) - snap, Math.min(...p.map((q) => q[1])) - snap, Math.max(...p.map((q) => q[0])) + snap, Math.max(...p.map((q) => q[1])) + snap];
    for (const t of tips) {
      if (t[0] < x0 || t[0] > x1 || t[1] < y0 || t[1] > y1) continue;
      const h = nearest(p, t);
      if (h.d <= snap && h.along > snap && h.along < L - snap) cuts.push(h.along);
    }
    return cutAt(p, cuts);
  });
  // Corners: ends within `snap` are one.
  const nodes = [];
  const nodeGrid = new Grid(snap);
  const node = (p) => {
    let i = nodeGrid.near(p, snap).find((k) => dist(nodes[k], p) <= snap) ?? -1;
    if (i < 0) { nodes.push([...p]); i = nodes.length - 1; nodeGrid.add(nodes[i], i); }
    return i;
  };
  let edges = [];
  for (const p of split) {
    const [a, b] = [node(p[0]), node(p.at(-1))];
    const path = [nodes[a], ...p.slice(1, -1), nodes[b]];
    const len = length(path);
    if (a === b && len < 4 * snap) continue;
    edges.push({ a, b, path, len });
  }
  const adjacency = () => {
    const adj = nodes.map(() => []);
    edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
    return adj;
  };
  // Parts of the graph apart from each other: the nearest ends of two parts within `bridge` px are joined.
  const parts = () => {
    const adj = adjacency();
    const part = nodes.map(() => -1);
    let n = 0;
    nodes.forEach((_, s) => {
      if (part[s] >= 0 || !adj[s].length) return;
      const stack = [s];
      part[s] = n;
      while (stack.length) {
        const v = stack.pop();
        for (const ei of adj[v]) { const e = edges[ei]; const u = e.a === v ? e.b : e.a; if (part[u] < 0) { part[u] = n; stack.push(u); } }
      }
      n++;
    });
    return { part, n };
  };
  {
    const { part } = parts();
    const up = new Map();
    const root = (x) => { while (up.has(x) && up.get(x) !== x) x = up.get(x); return x; };
    const grid = new Grid(bridge);
    nodes.forEach((p, i) => { if (part[i] >= 0) grid.add(p, i); });
    const pairs = [];
    nodes.forEach((p, i) => { if (part[i] >= 0) for (const j of grid.near(p, bridge)) if (j > i && part[j] !== part[i]) { const d = dist(p, nodes[j]); if (d <= bridge) pairs.push([d, i, j]); } });
    // Farther gaps, where the sheet draws no street the route takes, are closed along the
    // route's own line in RTD's data (`guide`), between the loose ends nearest it.
    if (far > bridge && guide.length) {
      const deg = nodes.map(() => 0);
      for (const e of edges) { deg[e.a]++; deg[e.b]++; }
      const loose = nodes.map((_, i) => i).filter((i) => deg[i] === 1);
      const fgrid = new Grid(far / 4);
      nodes.forEach((p, j) => { if (part[j] >= 0) fgrid.add(p, j); });
      const isLoose = new Set(loose);
      for (const i of loose) for (const j of fgrid.near(nodes[i], far)) {
        if ((isLoose.has(j) && j <= i) || part[j] === part[i]) continue;
        const d = dist(nodes[i], nodes[j]);
        if (d > bridge && d <= far) pairs.push([d, i, j, true]);
      }
    }
    pairs.sort((x, y) => x[0] - y[0]);
    for (const [d, i, j, along] of pairs) {
      const [ri, rj] = [root(part[i]), root(part[j])];
      if (ri === rj) continue;
      const path = along ? guided(guide, nodes[i], nodes[j], bridge) : [nodes[i], nodes[j]];
      if (!path) continue;
      up.set(ri, rj);
      edges.push({ a: i, b: j, path, len: length(path) });
      report.bridged++;
    }
    // Try fragmented guides only after the original joins: already connected
    // drawings keep the same choices, while a remaining gap can cross features.
    if (parts().n > 1) for (const [, i, j, along] of pairs) {
      if (!along) continue;
      const [ri, rj] = [root(part[i]), root(part[j])];
      if (ri === rj) continue;
      const path = throughGuides(guide, nodes[i], nodes[j], bridge);
      if (!path) continue;
      up.set(ri, rj);
      edges.push({ a: i, b: j, path, len: length(path) });
      report.bridged++;
    }
    report.gaps = parts().n - 1;
  }
  // The main path: the longest of the shortest ways between two corners (two sweeps).
  const adj = adjacency();
  const sweep = (from) => {
    const d = nodes.map(() => Infinity);
    const via = nodes.map(() => -1);
    d[from] = 0;
    const open = new Set([from]);
    while (open.size) {
      let v = -1;
      for (const x of open) if (v < 0 || d[x] < d[v]) v = x;
      open.delete(v);
      for (const ei of adj[v]) {
        const e = edges[ei];
        const u = e.a === v ? e.b : e.a;
        if (d[v] + e.len < d[u]) { d[u] = d[v] + e.len; via[u] = ei; open.add(u); }
      }
    }
    let far = from;
    d.forEach((x, i) => { if (x < Infinity && x > d[far]) far = i; });
    return { d, via, far };
  };
  // Start in the largest part.
  const { part } = parts();
  const size = new Map();
  edges.forEach((e) => size.set(part[e.a], (size.get(part[e.a]) ?? 0) + e.len));
  const big = [...size].sort((x, y) => y[1] - x[1])[0][0];
  const start = nodes.findIndex((_, i) => part[i] === big && adj[i].length);
  const one = sweep(sweep(start).far);
  const onMain = new Set();
  let main = [nodes[one.far]];
  for (let v = one.far; one.via[v] >= 0; ) {
    const e = edges[one.via[v]];
    onMain.add(one.via[v]);
    const forward = e.b === v;
    const p = forward ? [...e.path].reverse() : e.path;
    main = main.concat(p.slice(1));
    v = forward ? e.a : e.b;
  }
  main.reverse();
  // Beside the main path, a piece is kept only where it stands off it.
  const mainGrid = new Grid(apart);
  for (const p of resample(main, 1)) mainGrid.add(p, p);
  const off = (path) => resample(path, 1).some((p) => !mainGrid.near(p, apart).some((q) => dist(p, q) <= apart)) ? Infinity : 0;
  let rest = edges.filter((e, i) => !onMain.has(i));
  const before = rest.length;
  rest = rest.filter((e) => off(e.path) > apart);
  report.dropped = before - rest.length;
  // Dead ends shorter than a stub go, again and again (a stub on a stub).
  const mainEdges = [...onMain].map((i) => edges[i]);
  for (let again = true; again; ) {
    again = false;
    const deg = nodes.map(() => 0);
    for (const e of [...mainEdges, ...rest]) { deg[e.a]++; deg[e.b]++; }
    const keep = rest.filter((e) => !((deg[e.a] === 1 || deg[e.b] === 1) && e.len < stub));
    if (keep.length < rest.length) { report.stubs += rest.length - keep.length; rest = keep; again = true; }
  }
  // Smooth between graph junctions, holding their shared positions. Smoothing a
  // whole chain can move an internal junction away from the branch meeting it.
  const degree = nodes.map(() => 0);
  for (const e of [...mainEdges, ...rest]) { degree[e.a]++; degree[e.b]++; }
  const junctions = new Set(nodes.filter((_, i) => degree[i] > 2));
  const sections = (p, held) => {
    const cuts = [0, ...p.map((q, i) => i > 0 && i < p.length - 1 && held.has(q) ? i : -1).filter((i) => i >= 0), p.length - 1];
    return cuts.slice(1).map((end, i) => smoothed(p.slice(cuts[i], end + 1), sigma));
  };
  const smoothMain = smoothed(main, sigma);
  // Removing an indistinguishable parallel street can leave a branch's join up
  // to `apart` pixels off the main path. Give every use of that corner one anchor.
  const anchors = new Map();
  const anchor = (i) => {
    if (!anchors.has(i)) {
      const h = nearest(smoothMain, nodes[i]);
      anchors.set(i, junctions.has(nodes[i]) && h.d <= apart + sigma + snap ? h.at : nodes[i]);
    }
    return anchors.get(i);
  };
  const held = new Set(nodes.flatMap((p, i) => junctions.has(p) ? [anchor(i)] : []));
  const others = chained(rest.map((e) => [anchor(e.a), ...e.path.slice(1, -1), anchor(e.b)]), snap)
    .flatMap((p) => sections(p, held));
  // Each branch's ends set back on the line it leaves, which the smoothing moved.
  const all = [smoothMain, ...others];
  for (const [i, p] of all.entries()) {
    if (!i) continue;
    for (const k of [0, p.length - 1]) {
      let best = null;
      for (const [j, q] of all.entries()) {
        if (j === i) continue;
        const h = nearest(q, p[k]);
        if (!best || h.d < best.d) best = h;
      }
      if (best && best.d > 0 && best.d <= sigma + 2 * snap) p[k] = best.at;
    }
  }
  // Last, parts that still stand apart (a branch whose link the steps above lost) are tied to
  // the part holding the main path: from the nearer end, along RTD's line where it runs there,
  // else straight where the gap is within a bridge.
  for (let again = true; again; ) {
    again = false;
    const group = all.map((_, i) => i);
    const root = (i) => (group[i] === i ? i : (group[i] = root(group[i])));
    all.forEach((p, i) => all.forEach((q, j) => { if (i < j && [p[0], p.at(-1)].some((e) => nearest(q, e).d <= snap) || i < j && [q[0], q.at(-1)].some((e) => nearest(p, e).d <= snap)) group[root(i)] = root(j); }));
    const candidates = [];
    for (const [i, p] of all.entries()) {
      if (root(i) === root(0)) continue;
      for (const e of [p[0], p.at(-1)]) for (const [j, q] of all.entries()) {
        if (root(j) !== root(0)) continue;
        const h = nearest(q, e);
        if (h.d <= far) candidates.push({ d: h.d, from: e, to: h.at });
      }
    }
    // The nearest pair can have no guide between it while another pair has a valid one.
    let link = null;
    for (const c of candidates.sort((a, b) => a.d - b.d)) {
      link = guided(guide, c.from, c.to, bridge) ?? throughGuides(guide, c.from, c.to, bridge) ?? (c.d <= 2 * bridge ? [c.from, c.to] : null);
      if (link) break;
    }
    if (!link) break;
    all.push(smoothed(link, sigma));
    report.bridged++;
    again = true;
  }
  // A branch left shorter than a stub, both its ends on the line, adds nothing a reader can see.
  const touches = (p, e) => all.some((q) => q !== p && nearest(q, e).d <= snap);
  const kept = all.filter((p, i) => !i || length(p) >= stub || (touches(p, p[0]) && touches(p, p.at(-1))));
  report.stubs += all.length - kept.length;
  return { paths: kept, ...report };
}

/** The stretch of a guide line from near `a` to near `b`, its ends set on them; null if neither line passes both within `reach`, or the way round is far longer than the gap. */
function guided(guide, a, b, reach) {
  for (const g of guide) {
    const [ha, hb] = [nearest(g, a), nearest(g, b)];
    if (ha.d > reach || hb.d > reach) continue;
    const [lo, hi] = ha.along <= hb.along ? [ha.along, hb.along] : [hb.along, ha.along];
    if (hi - lo > 3 * dist(a, b) + 20) continue;
    const mid = [];
    let run = 0;
    for (let i = 1; i < g.length; i++) { run += dist(g[i - 1], g[i]); if (run > lo && run < hi) mid.push(g[i]); }
    const path = ha.along <= hb.along ? [a, ...mid, b] : [a, ...mid.reverse(), b];
    return path;
  }
  return null;
}

// RTD can split a route's guide into many features. A connection may cross
// several of them even though no single feature passes both loose ends.
const guideGraphs = new WeakMap();
function throughGuides(guide, a, b, reach) {
  if (!guide.length) return null;
  let graph = guideGraphs.get(guide);
  if (!graph) {
    const snap = 0.5, points = [], edges = [], adj = [], grid = new Grid(snap);
    const node = (p) => {
      const found = grid.near(p, snap).find((i) => dist(points[i], p) <= snap);
      if (found !== undefined) return found;
      const i = points.length; points.push(p); adj.push([]); grid.add(p, i); return i;
    };
    const tips = guide.filter((p) => p.length > 1).flatMap((p) => [p[0], p.at(-1)]);
    for (const g of guide.filter((p) => p.length > 1)) {
      const L = length(g);
      const cuts = tips.map((p) => nearest(g, p)).filter((h) => h.d <= snap && h.along > snap && h.along < L - snap).map((h) => h.along);
      for (const part of cutAt(g, cuts)) for (let i = 1; i < part.length; i++) {
        const u = node(part[i - 1]), v = node(part[i]);
        if (u === v) continue;
        const e = { u, v, len: dist(points[u], points[v]) };
        edges.push(e); adj[u].push(e); adj[v].push(e);
      }
    }
    graph = { points, edges, adj }; guideGraphs.set(guide, graph);
  }
  const { points, edges, adj } = graph;
  const limit = 3 * dist(a, b) + 20;
  const costs = points.map(() => Infinity), via = points.map(() => null), ends = new Map(), open = new Set();
  for (const e of edges) {
    const segment = [points[e.u], points[e.v]], ha = nearest(segment, a), hb = nearest(segment, b);
    for (const [i, along] of [[e.u, 0], [e.v, e.len]]) {
      if (ha.d <= reach) {
        const cost = ha.d + Math.abs(ha.along - along);
        if (cost < costs[i]) { costs[i] = cost; via[i] = { path: [a, ha.at, points[i]] }; open.add(i); }
      }
      if (hb.d <= reach) {
        const cost = hb.d + Math.abs(hb.along - along);
        if (!ends.has(i) || cost < ends.get(i).cost) ends.set(i, { cost, path: [points[i], hb.at, b] });
      }
    }
  }
  let best = null;
  while (open.size) {
    let i;
    for (const j of open) if (i === undefined || costs[j] < costs[i]) i = j;
    open.delete(i);
    if (costs[i] > (best?.cost ?? limit)) break;
    const end = ends.get(i);
    if (end && costs[i] + end.cost <= limit && (!best || costs[i] + end.cost < best.cost)) best = { i, cost: costs[i] + end.cost, path: end.path };
    for (const e of adj[i]) {
      const j = e.u === i ? e.v : e.u, cost = costs[i] + e.len;
      if (cost < costs[j] && cost <= limit) { costs[j] = cost; via[j] = { from: i, path: [points[i], points[j]] }; open.add(j); }
    }
  }
  if (!best) return null;
  let path = best.path;
  for (let i = best.i; via[i]; i = via[i].from) {
    path = [...via[i].path.slice(0, -1), ...path];
    if (via[i].from === undefined) break;
  }
  return path;
}

/** Points in square cells, for what lies near a point. */
class Grid {
  constructor(cell) { this.cell = Math.max(cell, 1); this.cells = new Map(); }
  key(x, y) { return `${x},${y}`; }
  add(p, v) { const k = this.key(Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell)); (this.cells.get(k) ?? this.cells.set(k, []).get(k)).push(v); }
  near(p, r) {
    const out = [];
    const [cx, cy] = [Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell)];
    const n = Math.ceil(r / this.cell);
    for (let x = cx - n; x <= cx + n; x++) for (let y = cy - n; y <= cy + n; y++) { const c = this.cells.get(this.key(x, y)); if (c) out.push(...c); }
    return out;
  }
}
