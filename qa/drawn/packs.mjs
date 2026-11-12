// Packs of rail lines, in the drawn model (rules ST02, RL10, RL09, ST04 in
// qa/rules/design-invariants.md; PL-02, PL-03, PL-05, PL-11, PL-13, JN-01,
// LN-04, LN-05, LN-06 in qa/rules/literature.md).
//
// Rail lines that share track are drawn as a pack: each line is `slot` spaces
// to the side of the track, a space being the line's width plus a gap
// (DESIGN.md, "Shared track"). The build cuts a line into pieces wherever its
// slot moves, so a line is a chain of pieces, each drawn with a constant
// offset. These checks read that, and only that: the model's rail strokes
// (`mode: 'rail'`, the line layer itself, not its casing or edge), as drawn,
// with each piece's offset and width, and the station marks drawn at the zoom.
//
//  - uneven-gap (ST02, PL-02): two neighbouring lines of a pack whose drawn
//    centrelines are not as far apart as their offsets say, by more than
//    `gapTol` px, where both hold their place. The lines of a pack are written
//    onto one path, so the gap between neighbours is the slots' and no other;
//    half a metre off is half a pixel at zoom 16 (T beside E and R at Lincoln).
//  - drift (RL10, PL-11): a line moves sideways on a stretch of track, outside
//    any station mark, next to the end of a line that ran beside it. Where a
//    line of a pack ends, the lines that run on take their final places under
//    its station's mark; a move made beside the end but out from under the
//    mark is a slide (E and R south of Lincoln, C and E north of Alameda,
//    after T ended). A move where a line parts from the pack is no end: it is
//    eased over the junction and judged by steep-ease.
//  - steep-ease (RL09, JN-01, PL-13): where a line does move, it does so
//    gently: the sideways change per px along the track, over two line widths
//    or over `jump` px, stays under `slope`, at every zoom. A step under a
//    station mark is hidden by it.
//  - swap (ST04, PL-05): two lines on one track, side by side for `sideM`
//    metres either side of a place where they change sides.
//  - sliver (PL-03): two strokes side by side with an edge-to-edge gap from
//    `sliverMin` to `sliver` px: not touching, not a gap.
//  - zig-zag (LN-04): a line whose bend changes direction `zigChanges` times
//    in ten line widths (never more than `zigCapM` metres), wide enough across
//    to be seen. sharp-bend (LN-06): a line that turns more than `bendMax`
//    degrees at one corner, with straight stretches either side.
//
// Thresholds are screen px at the zoom, as a rider sees them, except where a
// rule is about the ground: whether two lines are one pack (`packM`), a
// stretch of shared track (`linkM`, `sideM`), the lines beside a line
// (`nearM`) and how far the build rounds a corner (`zigCapM`). Nothing here
// names a route, a layer, a colour or a place: a rail line is whatever the
// model marks `mode: 'rail'`, a station mark is whatever icon carries a
// `lines` property, and a pack's spacing is read from the entries themselves
// (offset over slot). How each number was set is in the commit that added it.

import { toLonLat } from './mercator.mjs';

export const PACK_LIMITS = {
  // uneven-gap. gapTol: the drawn gap against what the slots say, px (the
  // owner saw half a pixel at zoom 16; the live build's worst spots are 0.4
  // px at zoom 17). packM: lines further apart on the ground than this are
  // two tracks, not one pack. steadyM: both lines hold their slot this far
  // either side, so a junction mouth is not read as a bad gap. minRun, minRunM:
  // the gap is wrong over at least this much track (px and metres, the larger).
  gapTol: 0.5,
  packM: 3,
  steadyM: 30,
  minRun: 16,
  minRunM: 40,
  // drift, steep-ease. linkM: steps of a line's offset closer than this belong
  // to one move. driftMin: the least move, px. nearM: a line's end counts when
  // it is this close to the line on the ground. slope: the most px across per
  // px along. windowMin: the window is two line widths, at least this many px.
  // jump: and a window this short, where a step is a notch and not a ramp.
  linkM: 150,
  driftMin: 0.5,
  nearM: 30,
  slope: 0.6,
  windowMin: 6,
  jump: 2,
  // swap. sideM: side by side on one track this far either side (the build
  // smooths shared runs shorter than 200 m away). swapEps: px.
  sideM: 60,
  swapEps: 0.5,
  // sliver. sliver: Ledermann's least gap that reads as a gap, px. sliverMin:
  // less than this is touching. sliverWidths: over at least this many line
  // widths of track.
  sliver: 1.2,
  sliverMin: 0.25,
  sliverWidths: 2,
  // zig-zag: zigChanges direction changes, each between turns of at least
  // zigTurn degrees, within zigWindow line widths but never more than zigCapM
  // metres (the build rounds a corner over about that far, so bends closer
  // than it are not track), zigAmplitude line widths across (peak to peak).
  // sharp-bend: more than bendMax degrees within bendWindow line widths, but
  // at one corner (bendJoin px: at a low zoom two line widths hold a whole
  // curve), straight for bendArm line widths either side, and bendContrast
  // times the turn at the next vertices.
  zigWindow: 10,
  zigChanges: 3,
  zigTurn: 3,
  zigAmplitude: 0.5,
  zigCapM: 120,
  bendWindow: 2,
  bendMax: 10,
  bendJoin: 2,
  bendArm: 3,
  bendContrast: 3,
  // How lines are sampled (px apart), what counts as parallel (degrees) and
  // how far to look for a neighbour (slots).
  stride: 3,
  parallel: 15,
  reachSlots: 3.25,
};

const isCasing = (layer) => /-(casing|edge|outline)$/.test(layer);
const COS = (deg) => Math.cos((deg * Math.PI) / 180);

// Ground metres per screen px at world y.
const metresPerPx = (y, z) => (40075016.686 * Math.cos((toLonLat([0, y], z)[1] * Math.PI) / 180)) / (512 * 2 ** z);

const dedupe = (pts) => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
const arcs = (pts) => {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

// A segment grid.
class Grid {
  constructor(cell = 64) { this.cell = cell; this.g = new Map(); }
  add(s) {
    const c = this.cell;
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / c), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / c);
    const y0 = Math.floor(Math.min(s.a[1], s.b[1]) / c), y1 = Math.floor(Math.max(s.a[1], s.b[1]) / c);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      let cell2 = this.g.get(k);
      if (!cell2) this.g.set(k, (cell2 = []));
      cell2.push(s);
    }
  }
  near(p, r) {
    const c = this.cell;
    const out = new Set();
    for (let x = Math.floor((p[0] - r) / c); x <= Math.floor((p[0] + r) / c); x++) {
      for (let y = Math.floor((p[1] - r) / c); y <= Math.floor((p[1] + r) / c); y++) for (const s of this.g.get(`${x},${y}`) ?? []) out.add(s);
    }
    return out;
  }
}

/**
 * The rail strokes of a zoom, joined into chains: each route's pieces end to
 * end, every piece turned to run the way its chain does, with its offset
 * (positive to the right of the chain) and where the offset steps.
 */
export function railChains(zoom) {
  const pieces = [];
  for (const e of zoom.lines) {
    if (e.mode !== 'rail' || isCasing(e.layer) || e.route == null) continue;
    const drawn = e.drawn ?? e.parts;
    e.parts.forEach((part, k) => {
      const base = dedupe(part);
      if (base.length < 2) return;
      pieces.push({ entry: e, route: String(e.route), layer: e.layer, base, drawn: dedupe(drawn[k] ?? part), offset: e.offset ?? 0, width: e.width ?? e.drawnWidth ?? 0 });
    });
  }
  const byRoute = new Map();
  for (const p of pieces) {
    if (!byRoute.has(p.route)) byRoute.set(p.route, []);
    byRoute.get(p.route).push(p);
  }
  const chains = [];
  for (const [route, list] of byRoute) {
    const ends = new Map();
    list.forEach((p, i) => {
      for (const end of [0, 1]) {
        const k = key(end ? p.base[p.base.length - 1] : p.base[0]);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push({ i, end });
      }
    });
    // A node where exactly two pieces meet joins them.
    const link = list.map(() => [null, null]);
    for (const at of ends.values()) {
      if (at.length === 2 && at[0].i !== at[1].i) {
        link[at[0].i][at[0].end] = at[1];
        link[at[1].i][at[1].end] = at[0];
      }
    }
    const used = new Set();
    const walk = (start, rev) => {
      const order = [];
      let cur = { i: start, rev };
      while (cur && !used.has(cur.i)) {
        used.add(cur.i);
        order.push(cur);
        const next = link[cur.i][cur.rev ? 0 : 1];
        cur = next ? { i: next.i, rev: next.end === 1 } : null;
      }
      return order;
    };
    const starts = list.map((_, i) => i).filter((i) => !link[i][0] || !link[i][1]);
    const chainsOfRoute = [];
    for (const i of starts) if (!used.has(i)) chainsOfRoute.push(walk(i, !!link[i][0] && !link[i][1] ? true : false));
    for (let i = 0; i < list.length; i++) if (!used.has(i)) chainsOfRoute.push(walk(i, false));
    for (const order of chainsOfRoute) {
      const ch = { id: chains.length, route, pieces: [], steps: [] };
      let s = 0, c = 0;
      for (const { i, rev } of order) {
        const p = list[i];
        const base = rev ? [...p.base].reverse() : p.base;
        const drawn = rev ? [...p.drawn].reverse() : p.drawn;
        const baseArc = arcs(base), drawnArc = arcs(drawn);
        ch.pieces.push({ piece: p, off: rev ? -p.offset : p.offset, width: p.width, base, drawn, baseLen: baseArc.at(-1), drawnLen: drawnArc.at(-1), s0: s, c0: c });
        s += baseArc.at(-1);
        c += drawnArc.at(-1);
      }
      for (let k = 0; k + 1 < ch.pieces.length; k++) {
        const a = ch.pieces[k], b = ch.pieces[k + 1];
        const d = b.off - a.off;
        a.stepEnd = Math.abs(d) > 1e-9;
        b.stepStart = a.stepEnd;
        if (a.stepEnd) ch.steps.push({ s: b.s0, at: b.base[0], d, width: (a.width + b.width) / 2, route });
      }
      ch.base = dedupe(ch.pieces.flatMap((q) => q.base));
      ch.length = s;
      chains.push(ch);
    }
  }
  return chains;
}

// The station marks drawn at this zoom: icons that name the lines they serve.
export const stationMarks = (zoom) => (zoom.marks ?? []).filter((m) => m.kind === 'icon' && m.image !== 'clear' && m.properties?.lines && m.box);
const underMark = (marks, p, pad = 1) => marks.some((m) => p[0] >= m.box[0] - pad && p[0] <= m.box[2] + pad && p[1] >= m.box[1] - pad && p[1] <= m.box[3] + pad);

// What every check shares at one zoom.
function prepare(zoom, limits) {
  const z = zoom.z;
  const chains = railChains(zoom);
  const strokes = zoom.lines.filter((e) => e.mode === 'rail' && !isCasing(e.layer) && e.route != null);
  const slotted = strokes.filter((e) => e.slot && e.offset).map((e) => Math.abs(e.offset / e.slot));
  const pitch = median(slotted) || Math.max(0, ...strokes.map((e) => e.width ?? 0)) + 2;
  const mid = chains.length ? chains[0].base[0][1] : 0;
  const mpp = metresPerPx(mid, z);
  const stroke = median(strokes.map((e) => e.width ?? 0)) || 1;
  return { z, chains, pitch, stroke, mpp, marks: stationMarks(zoom), limits, reach: limits.reachSlots * pitch, mppAt: (y) => metresPerPx(y, z) };
}

// The drawn segments of every chain, oriented the way their chain runs.
function drawnGrid(ctx) {
  const grid = new Grid();
  for (const ch of ctx.chains) {
    ch.pieces.forEach((q, qi) => {
      const arc = arcs(q.drawn);
      for (let i = 1; i < q.drawn.length; i++) {
        const a = q.drawn[i - 1], b = q.drawn[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (!len) continue;
        grid.add({ a, b, len, len2: len * len, tx: dx / len, ty: dy / len, ch, route: ch.route, q, qi, off: q.off, w: q.width, arc0: arc[i - 1] });
      }
    });
  }
  return grid;
}

// The other routes beside a point of a chain, one each: its foot on the other
// line (strictly between the line's points, so a line that ends or begins
// beside it is not beside it), signed distance to the right of the chain, and
// what the other line's offset and base make of it.
function besides(ctx, grid, ch, qA, p, t, own) {
  const out = new Map();
  const cosPar = COS(ctx.limits.parallel);
  for (const s of grid.near(p, ctx.reach)) {
    if (s.route === ch.route) continue;
    const tt = ((p[0] - s.a[0]) * (s.b[0] - s.a[0]) + (p[1] - s.a[1]) * (s.b[1] - s.a[1])) / s.len2;
    if (tt < 0 || tt > 1) continue;
    const cos = t[0] * s.tx + t[1] * s.ty;
    if (Math.abs(cos) < cosPar) continue;
    const vx = s.a[0] + tt * (s.b[0] - s.a[0]) - p[0], vy = s.a[1] + tt * (s.b[1] - s.a[1]) - p[1];
    const lat = -vx * t[1] + vy * t[0];
    if (Math.abs(lat) > ctx.reach) continue;
    const had = out.get(s.route);
    if (had && Math.abs(had.lat) <= Math.abs(lat)) continue;
    const sign = cos > 0 ? 1 : -1;
    const u = s.arc0 + tt * s.len;
    out.set(s.route, {
      route: s.route, lat, sign, off: sign * s.off, width: s.w, ch: s.ch, at: [p[0] + vx, p[1] + vy],
      steady: Math.min(s.q.stepStart ? u : Infinity, s.q.stepEnd ? s.q.drawnLen - u : Infinity),
      // The base of the two lines apart, px: the lateral gap less what the offsets make.
      apart: lat - (sign * s.off - own),
    });
  }
  return [...out.values()].sort((a, b) => a.lat - b.lat);
}

// Samples along every chain, with the lines beside each.
function sweep(ctx) {
  const grid = drawnGrid(ctx);
  const { stride } = ctx.limits;
  const out = [];
  for (const ch of ctx.chains) {
    const samples = [];
    ch.pieces.forEach((q, qi) => {
      const arc = arcs(q.drawn);
      let next = stride / 2;
      for (let i = 1; i < q.drawn.length; i++) {
        const a = q.drawn[i - 1], b = q.drawn[i];
        const len = arc[i] - arc[i - 1];
        if (!len) continue;
        const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        while (next <= arc[i]) {
          const f = (next - arc[i - 1]) / len;
          const p = [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
          const u = next;
          samples.push({
            c: q.c0 + u, p, t, off: q.off, width: q.width, qi,
            steady: Math.min(q.stepStart ? u : Infinity, q.stepEnd ? q.drawnLen - u : Infinity),
            nbrs: besides(ctx, grid, ch, q, p, t, q.off),
          });
          next += stride;
        }
      }
    });
    out.push({ ch, samples });
  }
  return out;
}

const fault = (kind, route, px, msg, extra = {}) => ({ kind, layer: 'rail', route, px: [Math.round(px[0] * 10) / 10, Math.round(px[1] * 10) / 10], msg, ...extra });
const at = (px) => `${px[0].toFixed(0)},${px[1].toFixed(0)}`;

// The nearest line on each side of a sample.
function adjacent(sample) {
  let left = null, right = null;
  for (const n of sample.nbrs) {
    if (n.lat < 0) left = n;
    else if (!right) right = n;
  }
  return [left, right];
}

// Runs of consecutive samples where `test` holds for a partner, per chain:
// { route, from, to, worst, sample }.
function runs(swept, test, { minRun, stride }) {
  const found = [];
  for (const { ch, samples } of swept) {
    const open = new Map();
    const close = (k) => {
      const r = open.get(k);
      open.delete(k);
      if (r && r.to - r.from >= minRun) found.push(r);
    };
    samples.forEach((s) => {
      const hits = new Map();
      for (const [partner, value] of test(s)) hits.set(partner, value);
      for (const k of [...open.keys()]) if (!hits.has(k) || s.c - open.get(k).to > stride * 1.5) close(k);
      for (const [partner, value] of hits) {
        const r = open.get(partner);
        if (!r) open.set(partner, { ch, route: ch.route, partner, from: s.c, to: s.c, worst: value, sample: s });
        else {
          r.to = s.c;
          if (Math.abs(value.score) > Math.abs(r.worst.score)) { r.worst = value; r.sample = s; }
        }
      }
    });
    for (const k of [...open.keys()]) close(k);
  }
  return found;
}

// One finding for a pair seen from both of its lines at the same place.
function oncePerPair(list, reachPx) {
  const kept = [];
  for (const f of list.sort((a, b) => Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0))) {
    if (kept.some((k) => k.pair === f.pair && Math.hypot(k.px[0] - f.px[0], k.px[1] - f.px[1]) < reachPx)) continue;
    kept.push(f);
  }
  return kept;
}

/**
 * uneven-gap (ST02, PL-02): neighbouring lines of a pack whose drawn
 * centrelines are not as far apart as their offsets say.
 */
export function unevenGaps(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...opts };
  const ctx = prepare(zoom, limits);
  return unevenGapsOf(ctx, sweep(ctx));
}
function unevenGapsOf(ctx, swept) {
  const { gapTol, packM, steadyM, minRun } = ctx.limits;
  const packPx = packM / ctx.mpp, steadyPx = steadyM / ctx.mpp;
  const longEnough = Math.max(minRun, ctx.limits.minRunM / ctx.mpp);
  const test = (s) => {
    const hits = [];
    if (s.steady < steadyPx) return hits;
    const [left, right] = adjacent(s);
    for (const n of [left, right]) {
      if (!n || n.steady < steadyPx || Math.abs(n.apart) > packPx) continue;
      if (Math.abs(n.apart) > gapTol) hits.push([n.route, { score: n.apart, n, other: (n === left ? right : left) }]);
    }
    return hits;
  };
  const found = runs(swept, test, { minRun: longEnough, stride: ctx.limits.stride }).map((r) => {
    const { n, other } = r.worst;
    const a = r.route, b = r.partner;
    const gap = Math.abs(n.lat), want = Math.abs(n.lat - n.apart);
    const note = other && Math.abs(other.apart) <= gapTol ? `, the gap on its other side (${other.route}) is right` : '';
    return {
      ...fault('uneven-gap', a, r.sample.p, `uneven-gap on rail ${a}/${b} at ${at(r.sample.p)}: centrelines ${gap.toFixed(2)} px apart, the slots say ${want.toFixed(2)} (${Math.abs(n.apart).toFixed(2)} px ${gap > want ? 'wider' : 'narrower'}, ${((Math.abs(n.apart) * ctx.mpp)).toFixed(2)} m) over ${(r.to - r.from).toFixed(0)} px${note}`, { with: b, value: Math.abs(n.apart) }),
      pair: [a, b].sort().join('|'),
      score: Math.abs(n.apart),
    };
  });
  return oncePerPair(found, 24).map(({ pair, score, ...f }) => f);
}

/**
 * Zones: the steps of a chain's offset that belong to one move, those less
 * than `linkM` metres apart, leaving out steps hidden under a station mark.
 */
function zonesOf(ctx) {
  const { linkM } = ctx.limits;
  const zones = [];
  for (const ch of ctx.chains) {
    const shown = ch.steps.filter((st) => !underMark(ctx.marks, st.at));
    let cur = null;
    for (const st of shown) {
      const gap = cur ? (st.s - cur.steps.at(-1).s) * ctx.mppAt(st.at[1]) : Infinity;
      if (!cur || gap > linkM) zones.push((cur = { ch, steps: [] }));
      cur.steps.push(st);
    }
  }
  for (const zn of zones) {
    zn.from = zn.steps[0].s;
    zn.to = zn.steps.at(-1).s;
    zn.delta = zn.steps.reduce((sum, st) => sum + st.d, 0);
  }
  return zones;
}

// The most a zone's offset changes per px along the track: over `window` px,
// and over `jump` px, where a step the size of a pixel is a notch, not a ramp.
function steepest(zn, windows) {
  let best = { slope: 0, delta: 0, step: zn.steps[0], along: windows[0] };
  for (const window of windows) {
    for (let i = 0; i < zn.steps.length; i++) {
      let sum = 0;
      for (let j = i; j < zn.steps.length && zn.steps[j].s - zn.steps[i].s <= window; j++) {
        sum += zn.steps[j].d;
        const slope = Math.abs(sum) / window;
        if (slope > best.slope) best = { slope, delta: sum, step: zn.steps[i], along: window };
      }
    }
  }
  return best;
}

/**
 * steep-ease (RL09, JN-01, PL-13): a line changes place faster than `slope`
 * px across per px along, outside a station mark.
 */
export function steepEases(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...opts };
  const ctx = prepare(zoom, limits);
  return steepEasesOf(ctx, zonesOf(ctx));
}
function steepEasesOf(ctx, zones) {
  const { slope, windowMin, jump } = ctx.limits;
  const found = [];
  for (const zn of zones) {
    const width = median(zn.steps.map((st) => st.width));
    const best = steepest(zn, [jump, Math.max(windowMin, 2 * width)]);
    if (best.slope <= slope) continue;
    const route = zn.ch.route;
    const lengthPx = Math.max(best.along, zn.to - zn.from);
    found.push(fault('steep-ease', route, best.step.at,
      `steep-ease on rail ${route} at ${at(best.step.at)}: moves ${Math.abs(best.delta).toFixed(1)} px sideways in ${best.along.toFixed(0)} px along the track (${best.slope.toFixed(2)} per px, limit ${slope}); the whole move ${Math.abs(zn.delta).toFixed(1)} px in ${lengthPx.toFixed(0)} px`,
      { value: best.slope, delta: Math.abs(best.delta), along: best.along }));
  }
  return found;
}

// The free ends of the chains: where a line begins or ends, the point and the
// way the line runs there.
function freeEnds(ctx) {
  const out = [];
  for (const ch of ctx.chains) {
    const n = ch.base.length;
    for (const [p, q] of [[ch.base[0], ch.base[1]], [ch.base[n - 1], ch.base[n - 2]]]) {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      out.push({ ch, route: ch.route, p, t: [(q[0] - p[0]) / len, (q[1] - p[1]) / len] });
    }
  }
  return out;
}

// The distance from a point to a chain's base, and the heading there.
function toBase(ch, p) {
  let best = { d: Infinity, t: [1, 0] };
  for (let i = 1; i < ch.base.length; i++) {
    const a = ch.base[i - 1], b = ch.base[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    if (!l2) continue;
    const f = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const d = Math.hypot(a[0] + f * dx - p[0], a[1] + f * dy - p[1]);
    if (d < best.d) { const l = Math.sqrt(l2); best = { d, t: [dx / l, dy / l] }; }
  }
  return best;
}

/**
 * drift (RL10, PL-11): a line moves sideways by at least `driftMin` px along a
 * stretch of track, outside a station mark, next to the end of a line that
 * runs beside it. A line that ends beside others is where the lines that run
 * on take their final places, under that station's mark; a move made next to
 * the end but out from under the mark is the slide that Lincoln and Alameda
 * showed. A line that parts from the others is no end: its move is eased over
 * the junction and is judged by steep-ease.
 */
export function drifts(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...opts };
  const ctx = prepare(zoom, limits);
  return driftsOf(ctx, zonesOf(ctx));
}
function driftsOf(ctx, zones) {
  const { driftMin, nearM, linkM } = ctx.limits;
  const ends = freeEnds(ctx);
  const cosPar = COS(30);
  const found = [];
  for (const zn of zones) {
    if (Math.abs(zn.delta) < driftMin) continue;
    const { ch } = zn;
    const mpp = ctx.mppAt(zn.steps[0].at[1]);
    let hit = null;
    for (const e of ends) {
      if (e.route === ch.route) continue;
      const near = toBase(ch, e.p);
      if (near.d * mpp > nearM || Math.abs(near.t[0] * e.t[0] + near.t[1] * e.t[1]) < cosPar) continue;
      const apart = Math.min(...zn.steps.map((st) => Math.hypot(st.at[0] - e.p[0], st.at[1] - e.p[1]))) * mpp;
      if (apart <= linkM && (!hit || apart < hit.apart)) hit = { e, apart };
    }
    if (!hit) continue;
    const where = zn.steps[Math.floor(zn.steps.length / 2)].at;
    const metres = Math.max(0, zn.to - zn.from) * mpp;
    found.push(fault('drift', ch.route, where,
      `drift on rail ${ch.route} at ${at(where)}: moves ${Math.abs(zn.delta).toFixed(1)} px sideways over ${metres.toFixed(0)} m, outside a station mark, ${hit.apart.toFixed(0)} m from where ${hit.e.route} ends beside it`,
      { value: Math.abs(zn.delta), along: zn.to - zn.from, with: hit.e.route }));
  }
  return found;
}

/**
 * swap (ST04, PL-05): two lines on one track, side by side for `sideM` metres
 * on both sides of a place where they change sides.
 */
export function swaps(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...opts };
  const ctx = prepare(zoom, limits);
  return swapsOf(ctx, sweep(ctx));
}
function swapsOf(ctx, swept) {
  const { packM, swapEps, sideM, stride } = ctx.limits;
  const packPx = packM / ctx.mpp;
  const side = Math.max(stride * 4, sideM / ctx.mpp);
  const found = [];
  for (const { ch, samples } of swept) {
    const state = new Map();
    for (const s of samples) {
      for (const n of s.nbrs) {
        if (Math.abs(n.apart) > packPx || Math.abs(n.lat) < swapEps) continue;
        const sign = n.lat > 0 ? 1 : -1;
        const st = state.get(n.route);
        if (!st || s.c - st.last > stride * 4) { state.set(n.route, { sign, from: s.c, last: s.c, before: 0, cross: null }); continue; }
        if (sign === st.sign) {
          st.last = s.c;
          if (st.cross && s.c - st.from >= side && st.before >= side) {
            found.push({ ...fault('swap', ch.route, st.cross.p, `swap on rail ${ch.route}/${n.route} at ${at(st.cross.p)}: side by side on one track, then ${ch.route} is on the other side of ${n.route} (${(st.before * ctx.mpp).toFixed(0)} m before, at least ${(side * ctx.mpp).toFixed(0)} m after)`, { with: n.route, value: 1 }), pair: [ch.route, n.route].sort().join('|'), score: 1 });
            st.cross = null;
          }
        } else {
          st.before = st.last - st.from;
          st.cross = { p: s.p };
          st.sign = sign;
          st.from = s.c;
          st.last = s.c;
        }
      }
    }
  }
  return oncePerPair(found, 40).map(({ pair, score, ...f }) => f);
}

/**
 * sliver (PL-03): two rail strokes side by side with an edge-to-edge gap
 * between 0 and `sliver` px: touching or merged is fine, a gap that can be
 * seen is fine, a sliver is neither.
 */
export function slivers(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...opts };
  const ctx = prepare(zoom, limits);
  return slivers_(ctx, sweep(ctx));
}
function slivers_(ctx, swept) {
  const { sliver, sliverMin, sliverWidths, stride } = ctx.limits;
  const sliverRun = sliverWidths * ctx.stroke;
  const test = (s) => {
    const hits = [];
    const [left, right] = adjacent(s);
    for (const n of [left, right]) {
      if (!n) continue;
      const gap = Math.abs(n.lat) - (s.width + n.width) / 2;
      if (gap >= sliverMin && gap < sliver) hits.push([n.route, { score: sliver - gap, gap, n }]);
    }
    return hits;
  };
  const found = runs(swept, test, { minRun: sliverRun, stride }).map((r) => ({
    ...fault('sliver', r.route, r.sample.p, `sliver on rail ${r.route}/${r.partner} at ${at(r.sample.p)}: ${r.worst.gap.toFixed(2)} px between the strokes' edges (neither touching nor ${sliver} px or more) over ${(r.to - r.from).toFixed(0)} px`, { with: r.partner, value: r.worst.gap }),
    pair: [r.route, r.partner].sort().join('|'),
    score: r.worst.score,
  }));
  return oncePerPair(found, 24).map(({ pair, score, ...f }) => f);
}

// Turns of a chain's base at its vertices: { s, deg } (positive clockwise on
// screen), the vertices where it does not run straight on.
function turnsOf(ch) {
  const pts = ch.base, arc = arcs(pts), out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1];
    const bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
    const deg = (Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180) / Math.PI;
    if (Math.abs(deg) > 1e-6) out.push({ s: arc[i], deg, p: pts[i] });
  }
  return out;
}

/**
 * zig-zag (LN-04) and sharp-bend (LN-05, LN-06) on the base of each rail line.
 */
export function bends(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...opts };
  return bendsOf(prepare(zoom, limits));
}
function bendsOf(ctx) {
  const { zigWindow, zigChanges, zigTurn, zigAmplitude, zigCapM, bendWindow, bendMax, bendJoin, bendArm, bendContrast } = ctx.limits;
  const found = [];
  for (const ch of ctx.chains) {
    const width = median(ch.pieces.map((q) => q.width)) || 1;
    const turns = turnsOf(ch);
    // Direction changes: between turns of at least zigTurn degrees. A zig-zag
    // is zigChanges of them within zigWindow line widths, wide enough across
    // to be seen (zigAmplitude line widths off the straight line through it).
    const big = turns.filter((t) => Math.abs(t.deg) >= zigTurn);
    const changes = [];
    for (let i = 1; i < big.length; i++) if (Math.sign(big[i].deg) !== Math.sign(big[i - 1].deg)) changes.push(i);
    // Ten line widths, but never more than zigCapM metres: the build rounds a
    // corner over about that far, so bends closer than it are not track.
    const span = Math.min(zigWindow * width, zigCapM / ctx.mpp);
    for (let i = 0; i + zigChanges - 1 < changes.length; i++) {
      const first = big[changes[i] - 1], last = big[changes[i + zigChanges - 1]];
      if (last.s - first.s > span) continue;
      const chord = [last.p[0] - first.p[0], last.p[1] - first.p[1]];
      const chordLen = Math.hypot(chord[0], chord[1]) || 1;
      let hi = 0, lo = 0;
      for (const t of turns) {
        if (t.s < first.s || t.s > last.s) continue;
        const side = ((t.p[0] - first.p[0]) * chord[1] - (t.p[1] - first.p[1]) * chord[0]) / chordLen;
        hi = Math.max(hi, side);
        lo = Math.min(lo, side);
      }
      const amp = hi - lo;
      if (amp < zigAmplitude * width) continue;
      found.push(fault('zig-zag', ch.route, first.p, `zig-zag on rail ${ch.route} at ${at(first.p)}: the bend changes direction ${zigChanges} times in ${(last.s - first.s).toFixed(0)} px (the window is ${span.toFixed(0)} px), ${amp.toFixed(1)} px across`, { value: zigChanges, amplitude: amp }));
      // Skip the changes this one covers.
      while (i + 1 < changes.length && big[changes[i + 1]].s - first.s <= span) i++;
    }
    // A bend of more than bendMax degrees within bendWindow line widths, with
    // the line going straight on either side: the turns next to it (the
    // vertices on each side, which are at least bendArm line widths away) are
    // less than a bendContrast-th of it. A curve of many vertices, each
    // turning about as much as the next, is not a kink.
    // The window is two line widths, but never wider than bendJoin px: at a
    // low zoom two line widths hold a whole curve of the data's vertices, which
    // is a curve, not a bend.
    const w = Math.min(bendWindow * width, bendJoin), arm = bendArm * width;
    const seenAt = [];
    for (let k = 0; k < turns.length; k++) {
      if (Math.abs(turns[k].deg) < 1) continue;
      let lo = k, hi = k;
      while (lo > 0 && turns[k].s - turns[lo - 1].s <= w / 2) lo--;
      while (hi + 1 < turns.length && turns[hi + 1].s - turns[k].s <= w / 2) hi++;
      let total = 0;
      for (let i = lo; i <= hi; i++) total += turns[i].deg;
      total = Math.abs(total);
      if (total <= bendMax) continue;
      const before = turns[lo - 1], after = turns[hi + 1];
      if (turns[lo].s - (before?.s ?? 0) < arm || (after?.s ?? ch.length) - turns[hi].s < arm) continue;
      const beside = Math.max(Math.abs(before?.deg ?? 0), Math.abs(after?.deg ?? 0));
      if (total < bendContrast * beside) continue;
      if (seenAt.some((x) => Math.abs(x - turns[k].s) < w)) continue;
      seenAt.push(turns[k].s);
      found.push(fault('sharp-bend', ch.route, turns[k].p, `sharp-bend on rail ${ch.route} at ${at(turns[k].p)}: turns ${total.toFixed(0)} degrees within ${w.toFixed(0)} px (${bendWindow} line widths; one corner at most ${bendJoin} px across), the turns either side are ${Math.abs(before?.deg ?? 0).toFixed(0)} and ${Math.abs(after?.deg ?? 0).toFixed(0)} degrees`, { value: total }));
    }
  }
  return found;
}

/**
 * Every pack fault in a zoom's drawn rail lines.
 * @param {{z:number, lines:Array, marks?:Array}} zoom the model's zoom(z) output
 * @param {object} opts PACK_LIMITS overrides
 * @returns {Array<{kind:string, layer:string, route:string, px:number[], msg:string}>}
 */
export function packFaults(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...opts };
  const ctx = prepare(zoom, limits);
  if (!ctx.chains.length) return [];
  const swept = sweep(ctx);
  const zones = zonesOf(ctx);
  return [
    ...unevenGapsOf(ctx, swept),
    ...driftsOf(ctx, zones),
    ...steepEasesOf(ctx, zones),
    ...swapsOf(ctx, swept),
    ...slivers_(ctx, swept),
    ...bendsOf(ctx),
  ].sort((a, b) => a.kind.localeCompare(b.kind) || String(a.route).localeCompare(String(b.route)));
}

// For the scratch tools and the tests that look inside a sweep.
export const internals = { prepare, sweep, adjacent, zonesOf, besides };
