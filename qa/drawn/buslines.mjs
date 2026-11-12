// Bus streets, terminals and stops, drawn (rules BS, DR, TH, SP in
// qa/rules/design-invariants.md; LN and KD in qa/rules/literature.md).
//
// The bus lines of this map are streets: one line per street carrying every
// route on it, its width the class (how often a bus comes), strands inside
// the wide ones, a part-time route as a hairline beside, one-way arrows,
// divided roads as one line to zoom 16 and two beyond, terminals as halls.
// These detectors read the drawn model (qa/drawn/model.mjs) at one zoom, in
// screen px, and report what a person looking at that zoom would call wrong.
// Nothing here names a route, station or place: a street is a line of the
// page's `streets` source, a stop is a mark of its `stops` source, a hall a
// fill of its `terminals` source, and what they carry is the build's.
//
// This file is the shared part (the street graph at a zoom) and the detectors
// that read it; `qa/drawn/buslines-style.mjs` holds the rules that are about
// the style (widths by class, zooms, draw order) rather than about a place.
//
// Kinds (each finding is { kind, layer, route, px, msg, ... } like the other
// detectors', px in world px at the zoom). The zoom each applies from is
// APPLIES_FROM, with the reason beside it.

import { toLonLat, toWorld } from './mercator.mjs';
import { capReach } from './strokes.mjs';

export const CELL = 64;
// The layers that draw a street's strands, its core and a part-time hairline
// beside it are seams inside or beside a street, not streets.
export const SEAM_LAYER = /^street-(strand|core|part-time-beside)/;
export const metresPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
export const tokens = (v) => String(v ?? '').split(/\s+/).filter(Boolean);
const routesOf = (l) => (l.route != null ? [String(l.route)] : tokens(l.properties?.routes));
const isBus = (l) => (l.mode === 'bus' || l.properties?.mode === 'bus') && routesOf(l).length > 0;
const isRail = (l) => l.mode === 'rail' || l.properties?.mode === 'rail';
const unit = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const angleBetween = (u, v) => (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
// The angle between two lines (not two directions): 0 to 90 degrees.
const lineAngle = (u, v) => (Math.acos(Math.min(1, Math.abs(dot(u, v)))) * 180) / Math.PI;
const lengthOf = (part) => part.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - part[i - 1][0], p[1] - part[i - 1][1]) : 0), 0);
const at = (z, px) => { const [lon, lat] = toLonLat(px, z); return `${lat.toFixed(5)},${lon.toFixed(5)}`; };
const px1 = (v) => (Math.round(v * 10) / 10);

export function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q, t };
}

// Px from p to a polygon's rings: 0 inside it (even-odd).
export function ringDist(p, rings) {
  let inside = false, best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      best = Math.min(best, segDist(p, a, b).d);
    }
  }
  return inside ? 0 : best;
}
export const insideRings = (p, rings) => {
  let inside = false;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
};

// A grid of items with a box, for "what is near this point".
export class Grid {
  constructor(cell = CELL) { this.cell = cell; this.g = new Map(); this.stamp = 0; }
  add(item, x0, y0, x1, y1) {
    const c = this.cell;
    const ax = Math.floor(x0 / c), bx = Math.floor(x1 / c), ay = Math.floor(y0 / c), by = Math.floor(y1 / c);
    if ((bx - ax + 1) * (by - ay + 1) > 4000) return;
    for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) {
      const k = x * 2097152 + y;
      const cell = this.g.get(k);
      if (cell) cell.push(item); else this.g.set(k, [item]);
    }
  }
  near(p, r = 0) {
    const out = [];
    const s = ++this.stamp;
    const c = this.cell;
    for (let x = Math.floor((p[0] - r) / c); x <= Math.floor((p[0] + r) / c); x++) {
      for (let y = Math.floor((p[1] - r) / c); y <= Math.floor((p[1] + r) / c); y++) {
        const cell = this.g.get(x * 2097152 + y);
        if (!cell) continue;
        for (const item of cell) if (item.stamp !== s) { item.stamp = s; out.push(item); }
      }
    }
    return out;
  }
}

// --- the street graph at one zoom -----------------------------------------------

/**
 * The streets the page draws at this zoom: one per feature of a street layer
 * (the widest of the layers that draw it), with the build's own numbers.
 * @returns {Array<{key, index, layer, props, routes, n, pt, cls, len, oneway, tag, part, w, hw, cap, dashed, entry}>}
 */
export function streetsOf(zoom, { minOpacity = 0.3 } = {}) {
  const best = new Map();
  for (const l of zoom.lines) {
    if (l.source !== 'streets' || SEAM_LAYER.test(l.layer) || !isBus(l)) continue;
    if (!(l.opacity >= minOpacity)) continue;
    const w = l.drawnWidth ?? l.width;
    if (!(w > 0)) continue;
    const key = `${l.source}:${l.index}`;
    const have = best.get(key);
    if (!have || w > have.w) best.set(key, { l, w });
  }
  const out = [];
  for (const [key, { l, w }] of best) {
    const p = l.properties ?? {};
    // A feature may hold more than one part; each is its own street piece.
    (l.parts ?? []).forEach((part, pi) => {
      if (part.length < 2) return;
      out.push({
        key: pi ? `${key}#${pi}` : key, feature: key, index: l.index, layer: l.layer, props: p, routes: routesOf(l),
        n: p.n ?? 0, pt: p.pt ?? 0, cls: p.cls ?? null, len: p.len ?? null, oneway: p.oneway === 1, tag: p.zoom ?? '',
        part, drawn: (l.drawn ?? l.parts)[pi] ?? part, w, hw: w / 2, cap: l.cap, dashed: Array.isArray(l.dash) && l.dash.length > 0,
        opacity: l.opacity, entry: l,
      });
    });
  }
  return out;
}

const keyOf = (p) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;

/**
 * Where streets meet: nodes are the ends and vertices streets share, to
 * 0.05 px (the build snaps vertices within 1.5 m, so streets that meet share
 * the exact vertex).
 * @returns {{nodes: Map, ends: Array, free: Array}} `free`: ends no other street meets
 */
export function graphOf(streets) {
  const nodes = new Map();
  const node = (p) => {
    const k = keyOf(p);
    let n = nodes.get(k);
    if (!n) { n = { key: k, p, ends: [], through: [] }; nodes.set(k, n); }
    return n;
  };
  const ends = [];
  for (const s of streets) {
    const last = s.part.length - 1;
    s.part.forEach((p, i) => {
      if (i === 0 || i === last) {
        const e = { s, side: i === 0 ? 0 : 1, node: node(p), p };
        e.node.ends.push(e);
        ends.push(e);
        s.ends = s.ends ?? [];
        s.ends[e.side] = e;
      } else if (nodes.has(keyOf(p))) {
        nodes.get(keyOf(p)).through.push({ s, i });
      }
    });
  }
  // A vertex that is interior to one street and an end of another counts too:
  // look the interiors up after every end is placed.
  for (const s of streets) {
    for (let i = 1; i < s.part.length - 1; i++) {
      const n = nodes.get(keyOf(s.part[i]));
      if (n && !n.through.some((t) => t.s === s && t.i === i)) n.through.push({ s, i });
    }
  }
  const free = ends.filter((e) => e.node.ends.length === 1 && e.node.through.length === 0);
  return { nodes, ends, free };
}

// The end's outward direction, over the last `over` px so a vertex split does not swing it.
export function outward(part, side, over = 3) {
  const i0 = side === 0 ? 0 : part.length - 1, step = side === 0 ? 1 : -1;
  const E = part[i0];
  let j = i0 + step, back = part[j];
  while (j + step >= 0 && j + step < part.length && Math.hypot(back[0] - E[0], back[1] - E[1]) < over) { j += step; back = part[j]; }
  return unit([E[0] - back[0], E[1] - back[1]]);
}

// Every bus stroke, for "is this point on another line".
function strokeGrid(streets) {
  const grid = new Grid();
  for (const s of streets) {
    for (let i = 1; i < s.part.length; i++) {
      const a = s.part[i - 1], b = s.part[i];
      grid.add({ s, a, b, i, stamp: 0 }, Math.min(a[0], b[0]) - s.hw, Math.min(a[1], b[1]) - s.hw, Math.max(a[0], b[0]) + s.hw, Math.max(a[1], b[1]) + s.hw);
    }
  }
  return grid;
}

// The places a line end can be at: stop dots, station and facility marks, and
// halls, as the zoom or `places` gives them.
export function placesOf(zoom, places) {
  const marks = places?.marks ?? zoom.marks ?? [];
  const areas = places?.areas ?? zoom.areas ?? [];
  const stops = marks.filter((m) => m.source === 'stops' && m.kind === 'circle');
  const stations = marks.filter((m) => m.source === 'stations' || m.source === 'facilities');
  const halls = areas.filter((a) => a.source === 'terminals' && a.parts?.length);
  return { stops, stations, halls };
}

export function describeEnd(zoom, places = null) {
  const streets = streetsOf(zoom);
  const graph = graphOf(streets);
  const grid = strokeGrid(streets);
  const where = placesOf(zoom, places);
  const out = [];
  for (const e of graph.free) {
    const s = e.s;
    const E = e.p;
    const lat = toLonLat(E, zoom.z)[1];
    const m = metresPerPx(lat, zoom.z);
    const dirOut = outward(s.part, e.side);
    // another bus stroke under the end
    let under = null;
    for (const c of grid.near(E, 40)) {
      if (c.s === s) continue;
      const d = segDist(E, c.a, c.b).d;
      if (d <= c.s.hw + 0.5 && (!under || d < under.d)) under = { d, s: c.s };
    }
    const mine = new Set(s.routes);
    let stopOwn = Infinity, stopAny = Infinity, station = Infinity, stationOwn = Infinity;
    for (const k of where.stops) {
      const d = Math.hypot(k.at[0] - E[0], k.at[1] - E[1]);
      const r = tokens(k.properties?.lines);
      if (d < stopAny) stopAny = d;
      if (d < stopOwn && r.some((x) => mine.has(x))) stopOwn = d;
    }
    for (const k of where.stations) {
      const d = Math.hypot(k.at[0] - E[0], k.at[1] - E[1]);
      if (d < station) station = d;
      const r = [...tokens(k.properties?.lines), ...tokens(k.properties?.buses)];
      if (d < stationOwn && r.some((x) => mine.has(x))) stationOwn = d;
    }
    const hall = where.halls.reduce((d, a) => Math.min(d, ringDist(E, a.parts)), Infinity);
    out.push({ e, s, E, m, dirOut, under, stopOwn, stopAny, station, stationOwn, hall });
  }
  return out;
}

// --- narrow land between two streets: slivers and wedges (KD-08, DR01) --------------

// Samples along a street's centreline about `step` px apart: point, direction, distance walked.
function sampleStreet(s, step = 1) {
  const out = [];
  let walked = 0;
  for (let i = 1; i < s.part.length; i++) {
    const a = s.part[i - 1], b = s.part[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const n = Math.max(1, Math.round(len / step));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u, s: walked + len * t });
    }
    walked += len;
  }
  return out;
}

/**
 * Land between two street strokes that is too narrow to read (KD-08, DR01).
 *  - sliver: two strokes run side by side with under `sliverGap` px of land
 *    between them (edge to edge) for `minRun` px: neither touching nor a gap
 *    anyone can see.
 *  - wedge: one street splits in two, or two meet, at a small angle and the
 *    land between them is a pointed tooth: a run of at least `minRun` px with
 *    under `wedgeGap` px of land between the strokes that begins at a point
 *    (under `apex` px) and opens to at least `open` px.
 * Both only between strokes at least `minWidth` px wide (a hairline's tooth is
 * not seen) and within `maxAngle` degrees of parallel.
 */
export function wedges(zoom, opts = {}) {
  const o = { sliverGap: 1.5, wedgeGap: 6, apex: 1, open: 3, taper: 80, minGap: 0.05, minWidth: 4, wedgeWidth: 7, maxAngle: 50, wedgeAngle: 35, minRun: 8, minSliver: 10, ...opts };
  const streets = streetsOf(zoom).filter((s) => s.w >= o.minWidth);
  const grid = new Grid();
  for (const s of streets) {
    for (let i = 1; i < s.part.length; i++) {
      const a = s.part[i - 1], b = s.part[i];
      grid.add({ s, a, b, stamp: 0 }, Math.min(a[0], b[0]) - s.hw, Math.min(a[1], b[1]) - s.hw, Math.max(a[0], b[0]) + s.hw, Math.max(a[1], b[1]) + s.hw);
    }
  }
  const faults = [];
  const emit = (A, B, run) => {
    const { gaps, ss, pts } = run;
    const make = (kind, from, to, apexAt) => {
      const len = ss[to] - ss[from];
      const seg = gaps.slice(from, to + 1);
      const px = apexAt != null ? pts[apexAt] : pts[Math.floor((from + to) / 2)];
      const lat = toLonLat(px, zoom.z)[1];
      const m = metresPerPx(lat, zoom.z);
      const min = Math.min(...seg), max = Math.max(...seg);
      faults.push({
        kind, layer: A.layer, route: [...new Set([...A.routes, ...B.routes])].join(' '), px, runPx: len, runM: len * m,
        minGap: min, maxGap: max, widths: [A.w, B.w], a: A.key, b: B.key, classes: [A.cls, B.cls], angle: run.angle,
        msg: `${kind === 'bus-wedge' ? 'a wedge' : 'a sliver'}: streets ${A.routes.join(' ')} (${A.cls}, ${A.w.toFixed(1)} px) and ${B.routes.join(' ')} (${B.cls}, ${B.w.toFixed(1)} px) leave ${min.toFixed(1)} to ${max.toFixed(1)} px of land between them for ${len.toFixed(0)} px (${Math.round(len * m)} m) at ${at(zoom.z, px)}`,
      });
    };
    // Slivers: stretches where the land is under sliverGap wide.
    let from = null;
    const slivers = [];
    for (let k = 0; k <= gaps.length; k++) {
      const thin = k < gaps.length && gaps[k] < o.sliverGap && (from === null || ss[k] - ss[k - 1] <= 2.5);
      if (thin && from === null) from = k;
      else if (!thin && from !== null) { if (ss[k - 1] - ss[from] >= o.minSliver) slivers.push([from, k - 1]); from = thin ? k : null; }
    }
    for (const [a, b] of slivers) make('bus-sliver', a, b, null);
    // Wedges: a point (a gap under `apex`) that opens, steadily, to `open` px
    // or more within `taper` px, in a tooth at least minRun px long. Slivers
    // are not reported twice as wedges.
    for (const dir of [1, -1]) {
      for (let k = 0; k < gaps.length; k++) {
        if (gaps[k] >= o.apex || (k - dir >= 0 && k - dir < gaps.length && gaps[k - dir] < o.apex)) continue;
        // k is the first sample of an apex (nothing under `apex` before it in this direction)
        let e = k, top = gaps[k];
        while (e + dir >= 0 && e + dir < gaps.length && gaps[e + dir] >= top - 0.5 && Math.abs(ss[e + dir] - ss[e]) <= 2.5) { e += dir; top = Math.max(top, gaps[e]); }
        const len = Math.abs(ss[e] - ss[k]);
        if (top < o.open || len < o.minRun || len > o.taper || Math.min(A.w, B.w) < o.wedgeWidth) continue;
        if (Math.max(...run.angs.slice(Math.min(k, e), Math.max(k, e) + 1)) > o.wedgeAngle) continue;
        if (slivers.some(([a, b]) => Math.min(k, e) >= a && Math.max(k, e) <= b)) continue;
        make('bus-wedge', Math.min(k, e), Math.max(k, e), k);
      }
    }
  };
  for (const A of streets) {
    const runs = new Map();
    for (const sm of sampleStreet(A, 1)) {
      const best = new Map();
      for (const c of grid.near(sm.p, A.hw + o.wedgeGap + 40)) {
        const B = c.s;
        if (B === A || B.feature === A.feature || B.key < A.key) continue;
        const { d } = segDist(sm.p, c.a, c.b);
        const gap = d - A.hw - B.hw;
        if (gap < o.minGap || gap >= o.wedgeGap) continue;
        const ang = lineAngle(sm.u, unit([c.b[0] - c.a[0], c.b[1] - c.a[1]]));
        if (ang > o.maxAngle) continue;
        const have = best.get(B);
        if (!have || gap < have.gap) best.set(B, { gap, p: sm.p, ang });
      }
      for (const [B, hit] of best) {
        const r = runs.get(B);
        if (r && sm.s - r.last <= 2.5) { r.last = sm.s; r.gaps.push(hit.gap); r.pts.push(hit.p); r.ss.push(sm.s); r.angs.push(hit.ang); r.angle = Math.max(r.angle, hit.ang); }
        else {
          if (r) emit(A, B, r);
          runs.set(B, { first: sm.s, last: sm.s, gaps: [hit.gap], pts: [hit.p], ss: [sm.s], angs: [hit.ang], angle: hit.ang });
        }
      }
    }
    for (const [B, r] of runs) emit(A, B, r);
  }
  return faults;
}

// --- line ends: blobs, bulges, lines that stop short or in the air ---------------

// Points on the outward half of a round cap's rim (angles within 90 degrees
// of the way out), n of them.
function capRim(E, out, hw, n = 13) {
  const base = Math.atan2(out[1], out[0]);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = base - Math.PI / 2 + (Math.PI * i) / (n - 1);
    pts.push([E[0] + Math.cos(a) * hw, E[1] + Math.sin(a) * hw]);
  }
  return pts;
}

// Px a point lies outside the strokes of `others` (0 inside one).
function outsideOf(pt, others) {
  let best = Infinity;
  for (const o of others) {
    for (let i = Math.max(1, o.lo); i <= Math.min(o.s.part.length - 1, o.hi); i++) {
      const d = segDist(pt, o.s.part[i - 1], o.s.part[i]).d - o.s.hw;
      if (d < best) best = d;
    }
  }
  return Math.max(0, best);
}

export const END_DEFAULTS = {
  blobMin: 8, // px: a free end this wide is a blob when it is not whole on a hall
  bulge: 1.5, // px a joined end's cap may stand out of the lines it joins
  bulgeMin: 6, // px: only ends this wide (a thin cap's bulge is not seen)
  reach: 8, // px between a line end and the place it serves
  ahead: 90, // degrees: a place within this of the way the line points is one it stops short of
  seek: 150, // metres: where a place a line stops short of can be
  air: 25, // metres: no place of the line's own this near is in the air
  hallReach: 3,
};

/**
 * Bus line ends (BS03, BS04, TH03; LN-01 and the line-end rules of
 * literature.md section 5), on the street graph at one zoom:
 *  - end-blob: a free end of a wide street (`blobMin` px or more) that is not
 *    whole on a hall: a fat round cap standing in the open.
 *  - end-bulge: where a street ends at a junction its wide round cap stands
 *    out of the lines it joins by more than `bulge` px (a thick street ending
 *    on a thinner one).
 *  - end-short: a free end that stops short of a stop, station or hall of its
 *    own routes that it is heading for (the place lies ahead of it within
 *    `seek` m) with more than `reach` px of land between them.
 *  - end-in-air: a free end with no place of its routes within `air` m in any
 *    direction.
 * @param {{places?: {marks: Array, areas: Array}}} opts `places`: model.places(z, PLACE_SOURCES)
 */
export function lineEnds(zoom, opts = {}) {
  const o = { ...END_DEFAULTS, ...opts };
  const streets = streetsOf(zoom);
  const graph = graphOf(streets);
  const grid = strokeGrid(streets);
  const where = placesOf(zoom, opts.places);
  const faults = [];
  const z = zoom.z;
  const walk = (s, i0, step) => (step ? 0 : 0);
  for (const node of graph.nodes.values()) {
    for (const e of node.ends) {
      const s = e.s;
      if (s.cap !== 'round' || s.dashed) continue;
      const E = e.p;
      const out = outward(s.part, e.side);
      const lat = toLonLat(E, z)[1];
      const mpp = metresPerPx(lat, z);
      const others = [];
      for (const x of node.ends) if (x !== e) others.push({ s: x.s, lo: x.side === 0 ? 1 : x.s.part.length - 3, hi: x.side === 0 ? 3 : x.s.part.length - 1 });
      for (const t of node.through) others.push({ s: t.s, lo: t.i - 1, hi: t.i + 2 });
      const free = !others.length;
      if (!free) {
        // A bulge: the cap's outer rim beyond the strokes that meet here.
        if (s.w < o.bulgeMin) continue;
        const stand = Math.max(...capRim(E, out, s.hw).map((q) => outsideOf(q, others)));
        if (stand > o.bulge) {
          faults.push({
            kind: 'end-bulge', layer: s.layer, route: s.routes.join(' '), px: E, stand, width: s.w, cls: s.cls,
            msg: `${s.routes.join(' ')} (${s.cls}, ${s.w.toFixed(1)} px) ends at a junction with its round cap ${stand.toFixed(1)} px out of the lines it joins at ${at(z, E)}`,
          });
        }
        continue;
      }
      // Free end. Covered by another stroke it is not free.
      let covered = false;
      for (const c of grid.near(E, 40)) if (c.s !== s && segDist(E, c.a, c.b).d <= c.s.hw + 0.5 && c.s.hw >= 0.6 * s.hw) { covered = true; break; }
      if (covered) continue;
      const halls = where.halls.map((a) => a.parts);
      // How far the cap stands out of the hall it ends on.
      const rim = capRim(E, out, s.hw);
      const outOfHall = halls.length ? Math.max(...rim.map((q) => Math.min(...halls.map((h) => ringDist(q, h))))) : Infinity;
      const hallEnd = halls.length ? Math.min(...halls.map((h) => ringDist(E, h))) : Infinity;
      if (s.w >= o.blobMin && outOfHall > 1) {
        faults.push({
          kind: 'end-blob', layer: s.layer, route: s.routes.join(' '), px: E, width: s.w, cls: s.cls, outOfHall: Number.isFinite(outOfHall) ? outOfHall : null, hallPx: Number.isFinite(hallEnd) ? hallEnd : null,
          msg: `${s.routes.join(' ')} (${s.cls}, ${s.w.toFixed(1)} px) ends in a ${s.w.toFixed(0)} px round blob${hallEnd <= o.hallReach ? ' at the edge of a hall, its cap ' + outOfHall.toFixed(1) + ' px outside it' : ' with no hall, stop or line under it'} at ${at(z, E)}`,
        });
      }
      if (hallEnd <= 0 && outOfHall <= 1) continue; // whole on its hall
      // The places of this street's own routes.
      const mine = new Set(s.routes);
      const near = [];
      const reachPx = o.seek / mpp;
      for (const k of where.stops) {
        if (!tokens(k.properties?.lines).some((r) => mine.has(r))) continue;
        near.push({ what: 'stop', name: k.properties?.name, at: k.at, r: (k.radius ?? 3) + (k.stroke ?? 1) });
      }
      for (const k of where.stations) {
        const r = [...tokens(k.properties?.lines), ...tokens(k.properties?.buses)];
        if (!r.some((x) => mine.has(x))) continue;
        near.push({ what: 'station', name: k.properties?.name, at: k.at, r: 5 });
      }
      let best = null;
      for (const p of near) {
        const d = Math.hypot(p.at[0] - E[0], p.at[1] - E[1]);
        if (d > reachPx) continue;
        const gap = d - s.hw - p.r;
        const v = unit([p.at[0] - E[0], p.at[1] - E[1]]);
        const ang = angleBetween(out, v);
        p.d = d; p.gap = gap; p.ang = ang;
        if (!best || d < best.d) best = p;
      }
      // At a place: its gap is within reach, or a hall edge is.
      const nearest = near.reduce((m, p) => Math.min(m, Math.hypot(p.at[0] - E[0], p.at[1] - E[1])), Infinity);
      if (hallEnd <= o.hallReach) continue;
      const placeAtEnd = near.some((p) => Math.hypot(p.at[0] - E[0], p.at[1] - E[1]) - s.hw - p.r <= o.reach);
      if (placeAtEnd) continue;
      const ahead = near.filter((p) => {
        const d = Math.hypot(p.at[0] - E[0], p.at[1] - E[1]);
        return d <= reachPx && angleBetween(out, unit([p.at[0] - E[0], p.at[1] - E[1]])) <= o.ahead;
      }).sort((a, b) => Math.hypot(a.at[0] - E[0], a.at[1] - E[1]) - Math.hypot(b.at[0] - E[0], b.at[1] - E[1]))[0];
      if (ahead) {
        const d = Math.hypot(ahead.at[0] - E[0], ahead.at[1] - E[1]);
        faults.push({
          kind: 'end-short', layer: s.layer, route: s.routes.join(' '), px: E, width: s.w, cls: s.cls, gapPx: d - s.hw - ahead.r, gapM: d * mpp, place: ahead.name ?? ahead.what,
          msg: `${s.routes.join(' ')} (${s.cls}, ${s.w.toFixed(1)} px) ends ${(d - s.hw - ahead.r).toFixed(0)} px (${Math.round(d * mpp)} m) short of ${ahead.what} "${ahead.name ?? ''}" it is heading for at ${at(z, E)}`,
        });
        continue;
      }
      if (nearest * mpp > o.air) {
        faults.push({
          kind: 'end-in-air', layer: s.layer, route: s.routes.join(' '), px: E, width: s.w, cls: s.cls, nearestM: Number.isFinite(nearest) ? nearest * mpp : null,
          msg: `${s.routes.join(' ')} (${s.cls}, ${s.w.toFixed(1)} px) ends in the air: ${Number.isFinite(nearest) ? Math.round(nearest * mpp) + ' m from the nearest stop or station of its routes' : 'no stop or station of its routes near'} at ${at(z, E)}`,
        });
      }
    }
  }
  return faults;
}

// --- chains of streets between junctions ------------------------------------------

const sameRoutes = (a, b) => a.routes.length === b.routes.length && [...a.routes].sort().join(' ') === [...b.routes].sort().join(' ');

/**
 * Streets joined end to end where exactly two meet and nothing else touches
 * (no junction): the line a rider sees as one street. Each chain is
 * { streets, nodes } in order along it, `closed` when it comes back to its
 * start; `joints[i]` is the node between streets[i] and streets[i + 1].
 */
export function chainsOf(streets, graph = graphOf(streets)) {
  const link = (e) => {
    const n = e.node;
    if (n.through.length || n.ends.length !== 2) return null;
    const o = n.ends[0] === e ? n.ends[1] : n.ends[0];
    return o.s === e.s ? null : o;
  };
  const seen = new Set();
  const chains = [];
  const build = (head, enter) => {
    const list = [head], joints = [];
    let cur = head, exit = 1 - enter;
    seen.add(head.key);
    for (;;) {
      const o = link(cur.ends[exit]);
      if (!o || seen.has(o.s.key)) return { streets: list, joints, closed: !!o, startNode: head.ends[enter].node, endNode: cur.ends[exit].node };
      seen.add(o.s.key);
      joints.push(cur.ends[exit].node);
      list.push(o.s);
      cur = o.s;
      exit = 1 - o.side;
    }
  };
  for (const s of streets) {
    if (!s.ends || seen.has(s.key)) continue;
    for (const side of [0, 1]) if (s.ends[side] && !link(s.ends[side])) { chains.push(build(s, side)); break; }
  }
  for (const s of streets) if (s.ends && !seen.has(s.key)) chains.push(build(s, 0));
  return chains;
}

/** Ground length of a street in metres. */
const streetM = (s, z) => lengthOf(s.part) * metresPerPx(toLonLat(s.part[0], z)[1], z);

/**
 * A street's width (class) changes only at a junction or where routes join or
 * leave at a stop, never mid-block (DESIGN.md "Bus routes": a street is a run
 * of edges with one set of routes; a class that holds under 200 m takes its
 * neighbour's). Judged where exactly two streets meet end to end:
 *  - class-blip: a stretch under `blipM` metres of one class between two
 *    stretches of another class (a short thick stretch in a thin line, or a
 *    short thin one in a thick line).
 *  - width-step: two streets with the same routes of different width, or with
 *    different routes and no stop of those routes within `stopM` metres.
 * Only where the widths differ by at least `minStep` px at this zoom.
 */
export function widthSteps(zoom, opts = {}) {
  const o = { minStep: 0.5, blipM: 200, stopM: 60, ...opts };
  const z = zoom.z;
  const streets = streetsOf(zoom);
  const graph = graphOf(streets);
  const where = placesOf(zoom, opts.places);
  const faults = [];
  const stopNear = (p, routes) => {
    const m = metresPerPx(toLonLat(p, z)[1], z);
    return where.stops.some((k) => Math.hypot(k.at[0] - p[0], k.at[1] - p[1]) * m <= o.stopM && tokens(k.properties?.lines).some((r) => routes.has(r)));
  };
  const differ = (a, b) => Math.abs(a.w - b.w) >= o.minStep;
  for (const ch of chainsOf(streets, graph)) {
    const ss = ch.streets;
    // Runs of one width along the chain.
    const runs = [];
    ss.forEach((s, i) => {
      const last = runs.at(-1);
      if (last && !differ(last.streets.at(-1), s)) { last.streets.push(s); last.to = i; } else runs.push({ streets: [s], from: i, to: i });
    });
    const used = new Set();
    runs.forEach((r, k) => {
      if (k === 0 || k === runs.length - 1) return;
      const prev = runs[k - 1], next = runs[k + 1];
      if (differ(prev.streets.at(-1), next.streets[0])) return;
      if (!(prev.streets.at(-1).w < r.streets[0].w === next.streets[0].w < r.streets[0].w)) return;
      const m = r.streets.reduce((t, s) => t + streetM(s, z), 0);
      if (m >= o.blipM) return;
      const routes = new Set(r.streets.flatMap((s) => s.routes));
      const nodeA = ch.joints[r.from - 1], nodeB = ch.joints[r.to];
      // A route leaving or joining at a stop inside the stretch explains it.
      if (!r.streets.every((s) => sameRoutes(s, prev.streets.at(-1))) && (stopNear(nodeA.p, routes) || stopNear(nodeB.p, routes))) return;
      used.add(r.from - 1); used.add(r.to);
      const mid = r.streets[Math.floor(r.streets.length / 2)].part[0];
      const thick = r.streets[0].w > prev.streets.at(-1).w;
      faults.push({
        kind: 'class-blip', layer: r.streets[0].layer, route: [...routes].join(' '), px: nodeA.p, lengthM: m, widths: [prev.streets.at(-1).w, r.streets[0].w, next.streets[0].w], classes: [prev.streets.at(-1).cls, r.streets[0].cls, next.streets[0].cls],
        msg: `a short ${thick ? 'thick' : 'thin'} stretch: ${Math.round(m)} m of ${r.streets[0].cls} (${r.streets[0].w.toFixed(1)} px) between ${prev.streets.at(-1).cls} (${prev.streets.at(-1).w.toFixed(1)} px) and ${next.streets[0].cls} (${next.streets[0].w.toFixed(1)} px) on ${[...routes].join(' ')}, with no junction, at ${at(z, nodeA.p)}`,
      });
      void mid;
    });
    ch.joints.forEach((node, i) => {
      if (used.has(i)) return;
      const a = ss[i], b = ss[i + 1];
      if (!differ(a, b)) return;
      const same = sameRoutes(a, b);
      const routes = new Set([...a.routes, ...b.routes]);
      if (!same && stopNear(node.p, routes)) return;
      faults.push({
        kind: 'width-step', layer: b.layer, route: [...routes].join(' '), px: node.p, widths: [a.w, b.w], classes: [a.cls, b.cls], sameRoutes: same,
        msg: `${[...routes].join(' ')} changes width from ${a.cls} (${a.w.toFixed(1)} px) to ${b.cls} (${b.w.toFixed(1)} px) mid-block, ${same ? 'with the same routes on both sides' : 'with no junction and no stop of its routes within ' + o.stopM + ' m'}, at ${at(z, node.p)}`,
      });
    });
  }
  return faults;
}

// --- stops with no line of their routes near them (SP, TH04) ---------------------

/**
 * Every drawn stop dot is on a drawn line of a route it serves: within
 * `maxM` metres of the centreline of a bus street (or rail line) carrying one
 * of the routes in its `lines`. A stop inside a hall is a gate of the hall
 * (TH04) and is not judged against the streets. Judged over the whole drawn
 * map, not a phone screen.
 */
export function stopsOffLine(zoom, opts = {}) {
  const o = { maxM: 30, ...opts };
  const z = zoom.z;
  const dots = (zoom.marks ?? []).filter((m) => m.kind === 'circle' && m.source === 'stops');
  if (!dots.length) return [];
  const byRoute = new Map();
  const add = (r, a, b) => {
    let g = byRoute.get(r);
    if (!g) byRoute.set(r, (g = new Grid(256)));
    g.add({ a, b, stamp: 0 }, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
  };
  for (const s of streetsOf(zoom)) for (const r of s.routes) for (let i = 1; i < s.part.length; i++) add(r, s.part[i - 1], s.part[i]);
  const seen = new Set();
  for (const l of zoom.lines) {
    if (!isRail(l) || !(l.opacity >= 0.3)) continue;
    const k = `${l.source}:${l.index}`;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const part of l.parts) for (let i = 1; i < part.length; i++) for (const r of routesOf(l)) add(r, part[i - 1], part[i]);
  }
  const halls = placesOf(zoom, opts.places).halls.map((a) => a.parts);
  const faults = [];
  for (const m of dots) {
    const lines = tokens(m.properties?.lines);
    if (!lines.length) continue;
    if (halls.some((h) => insideRings(m.at, h))) continue;
    const mpp = metresPerPx(toLonLat(m.at, z)[1], z);
    const reach = (o.maxM * 3) / mpp;
    let best = Infinity, drawn = false;
    for (const r of lines) {
      const g = byRoute.get(r);
      if (!g) continue;
      drawn = true;
      for (const c of g.near(m.at, reach)) { const d = segDist(m.at, c.a, c.b).d; if (d < best) best = d; }
    }
    const farM = best * mpp;
    if (drawn && farM <= o.maxM) continue;
    const nearHall = halls.length ? Math.min(...halls.map((h) => ringDist(m.at, h))) * mpp : Infinity;
    faults.push({
      kind: nearHall <= 80 ? 'hall-stray-stop' : 'stop-off-line', layer: m.layer, route: lines.join(' '), id: m.properties?.id, px: m.at, nearestM: Number.isFinite(farM) ? farM : null, hallM: Number.isFinite(nearHall) ? nearHall : null,
      msg: `stop "${m.properties?.name}" (${lines.join(' ')}) is ${Number.isFinite(farM) && drawn && farM < 3 * o.maxM ? Math.round(farM) + ' m' : drawn && Number.isFinite(farM) ? 'over ' + 3 * o.maxM + ' m' : 'on no drawn line: none of its routes is drawn here;'} from any drawn line of its routes${nearHall <= 80 ? ', ' + Math.round(nearHall) + ' m from a hall' : ''} at ${at(z, m.at)}`,
    });
  }
  return faults;
}

// --- streets that cross or lie on each other (BS01) --------------------------------

const crossAt = (a, b, c, d) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - c[0], ey = d[1] - c[1];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
  const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
  return { t, u, p: [a[0] + dx * t, a[1] + dy * t] };
};

/**
 * Each street is one line, drawn once (BS01), and lines that cross do so at a
 * junction (LN-09):
 *  - braid: two streets cross within `braidDeg` degrees of each other with no
 *    node at the crossing: two lines braid, and where they lie over each other
 *    they step sideways.
 *  - street-overlap: two streets run alongside each other, their strokes
 *    overlapping and their centrelines not the same, for `minRun` px or more:
 *    a street drawn twice a little apart (a jog where the two part).
 * Both between strokes at least `minWidth` px wide, and only between streets
 * drawn together at this zoom (`far` and `near` tags never are).
 */
export function braids(zoom, opts = {}) {
  const o = { braidDeg: 30, minWidth: 3, minRun: 10, minApart: 0.5, overlapAngle: 20, ...opts };
  const z = zoom.z;
  const streets = streetsOf(zoom).filter((s) => s.w >= o.minWidth);
  const grid = new Grid();
  for (const s of streets) {
    for (let i = 1; i < s.part.length; i++) {
      const a = s.part[i - 1], b = s.part[i];
      grid.add({ s, a, b, i, stamp: 0 }, Math.min(a[0], b[0]) - s.hw, Math.min(a[1], b[1]) - s.hw, Math.max(a[0], b[0]) + s.hw, Math.max(a[1], b[1]) + s.hw);
    }
  }
  const faults = [];
  const seen = new Set();
  const segs = [];
  for (const s of streets) for (let i = 1; i < s.part.length; i++) segs.push({ s, i, a: s.part[i - 1], b: s.part[i] });
  for (const A of segs) {
    for (const B of grid.near([(A.a[0] + A.b[0]) / 2, (A.a[1] + A.b[1]) / 2], Math.hypot(A.b[0] - A.a[0], A.b[1] - A.a[1]) / 2 + 4)) {
      if (B.s === A.s || B.s.feature === A.s.feature || B.s.key < A.s.key) continue;
      const x = crossAt(A.a, A.b, B.a, B.b);
      if (!x || x.t <= 0.001 || x.t >= 0.999 || x.u <= 0.001 || x.u >= 0.999) continue;
      const ang = lineAngle(unit([A.b[0] - A.a[0], A.b[1] - A.a[1]]), unit([B.b[0] - B.a[0], B.b[1] - B.a[1]]));
      if (ang > o.braidDeg) continue;
      const key = `${A.s.key}|${B.s.key}|${Math.round(x.p[0] / 6)}|${Math.round(x.p[1] / 6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      faults.push({
        kind: 'braid', layer: A.s.layer, route: [...new Set([...A.s.routes, ...B.s.routes])].join(' '), px: x.p, angle: ang, widths: [A.s.w, B.s.w], a: A.s.key, b: B.s.key,
        msg: `streets ${A.s.routes.join(' ')} and ${B.s.routes.join(' ')} cross at ${ang.toFixed(1)} degrees with no junction there (${A.s.w.toFixed(1)} and ${B.s.w.toFixed(1)} px wide) at ${at(z, x.p)}`,
      });
    }
  }
  // Streets lying over each other: A's samples against B's centreline.
  for (const A of streets) {
    const runs = new Map();
    const flush = (B, r) => {
      if (r.last - r.first < o.minRun || r.min < o.minApart) return;
      const px = r.pts[Math.floor(r.pts.length / 2)];
      const m = metresPerPx(toLonLat(px, z)[1], z);
      faults.push({
        kind: 'street-overlap', layer: A.layer, route: [...new Set([...A.routes, ...B.routes])].join(' '), px, runPx: r.last - r.first, runM: (r.last - r.first) * m, apart: [r.min, r.max], widths: [A.w, B.w], a: A.key, b: B.key,
        msg: `streets ${A.routes.join(' ')} and ${B.routes.join(' ')} lie over each other for ${Math.round((r.last - r.first) * m)} m, their centrelines ${r.min.toFixed(1)} to ${r.max.toFixed(1)} px apart (${A.w.toFixed(1)} and ${B.w.toFixed(1)} px wide) at ${at(z, px)}`,
      });
    };
    for (const sm of sampleStreet(A, 1)) {
      const best = new Map();
      for (const c of grid.near(sm.p, A.hw + 40)) {
        const B = c.s;
        if (B === A || B.feature === A.feature || B.key < A.key) continue;
        const d = segDist(sm.p, c.a, c.b).d;
        if (d >= Math.min(A.w, B.w) * 0.75 + 0.5) continue; // not overlapping by much
        if (lineAngle(sm.u, unit([c.b[0] - c.a[0], c.b[1] - c.a[1]])) > o.overlapAngle) continue;
        const have = best.get(B);
        if (d < (have ?? Infinity)) best.set(B, d);
      }
      for (const [B, d] of best) {
        const r = runs.get(B);
        if (r && sm.s - r.last <= 2.5) { r.last = sm.s; r.min = Math.min(r.min, d); r.max = Math.max(r.max, d); r.pts.push(sm.p); }
        else { if (r) flush(B, r); runs.set(B, { first: sm.s, last: sm.s, min: d, max: d, pts: [sm.p] }); }
      }
    }
    for (const [B, r] of runs) flush(B, r);
  }
  return faults;
}

// --- strands, the part-time hairline beside a street, the core (BS05, BS06, BS07) -----

const seamLayers = (zoom, re) => zoom.lines.filter((l) => re.test(l.layer) && l.source === 'streets' && l.opacity >= 0.3 && (l.drawnWidth ?? l.width) > 0);
const byFeature = (lines) => {
  const m = new Map();
  for (const l of lines) { const k = `${l.source}:${l.index}`; (m.get(k) ?? m.set(k, []).get(k)).push(l); }
  return m;
};

/**
 * The part-time route's hairline beside a street (BS06): a dashed line with
 * `gap` px of land between it and the street's edge, on its own street and
 * nothing else, and not hopping across the street from one piece to the next.
 *  - beside-gap: the land between the hairline and its street's edge is not
 *    `gap` px (within `tol`).
 *  - beside-covered: the hairline lies under another street's stroke or rail
 *    for `minRun` px or more (it is not seen beside its street at all).
 *  - beside-hop: at a street's end where its neighbour has a hairline too, the
 *    two hairlines are more than `hop` px apart, or are on opposite sides.
 */
export function besideFaults(zoom, opts = {}) {
  const o = { gap: 2.2, tol: 0.7, minRun: 6, hop: 1.5, ...opts };
  const z = zoom.z;
  const streets = streetsOf(zoom);
  const own = new Map(streets.map((s) => [s.feature, s]));
  const graph = graphOf(streets);
  const hair = byFeature(seamLayers(zoom, /^street-part-time-beside/));
  if (!hair.size) return [];
  const grid = strokeGrid(streets);
  const rail = [];
  const seenRail = new Set();
  for (const l of zoom.lines) {
    if (!isRail(l) || !(l.opacity >= 0.3)) continue;
    const k = `${l.source}:${l.index}`;
    if (seenRail.has(k)) continue;
    seenRail.add(k);
    rail.push({ l, hw: (l.drawnWidth ?? l.width) / 2, parts: l.drawn ?? l.parts });
  }
  const faults = [];
  for (const [key, list] of hair) {
    const s = own.get(key);
    if (!s) continue;
    const L = list[0];
    const hw = (L.drawnWidth ?? L.width) / 2;
    for (const part of L.drawn) {
      if (part.length < 2) continue;
      let gapSum = 0, gapN = 0, worst = o.gap, worstP = part[0];
      let coverRun = 0, coverFrom = null, coverP = null;
      const flushCover = (end) => { if (coverRun >= o.minRun) faults.push({ kind: 'beside-covered', layer: L.layer, route: s.routes.join(' '), px: coverP, runPx: coverRun, msg: `the part-time hairline beside ${s.routes.join(' ')} lies under another line for ${coverRun.toFixed(0)} px at ${at(z, coverP)}` }); coverRun = 0; coverFrom = null; };
      for (const sm of sampleStreet({ part }, 2)) {
        let d = Infinity;
        for (let i = 1; i < s.part.length; i++) d = Math.min(d, segDist(sm.p, s.part[i - 1], s.part[i]).d);
        const gap = d - s.hw - hw;
        gapSum += gap; gapN++;
        if (Math.abs(gap - o.gap) > Math.abs(worst - o.gap)) { worst = gap; worstP = sm.p; }
        let under = false;
        for (const c of grid.near(sm.p, 40)) if (c.s.feature !== key && segDist(sm.p, c.a, c.b).d <= c.s.hw + hw * 0.5) { under = true; break; }
        if (!under) for (const r of rail) if (r.parts.some((rp) => rp.some((p, i) => i && segDist(sm.p, rp[i - 1], p).d <= r.hw))) { under = true; break; }
        if (under) { coverRun += 2; coverFrom ??= sm.p; coverP ??= sm.p; } else flushCover();
      }
      flushCover();
      if (gapN && Math.abs(worst - o.gap) > o.tol) {
        faults.push({ kind: 'beside-gap', layer: L.layer, route: s.routes.join(' '), px: worstP, gap: worst, msg: `the part-time hairline beside ${s.routes.join(' ')} is ${worst.toFixed(1)} px from its street's edge, not ${o.gap} px, at ${at(z, worstP)}` });
      }
    }
  }
  // Hops at a joint.
  for (const node of graph.nodes.values()) {
    if (node.through.length || node.ends.length !== 2) continue;
    const [a, b] = node.ends;
    if (a.s === b.s || Math.abs(a.s.w - b.s.w) >= 0.5) continue;
    const la = hair.get(a.s.feature)?.[0], lb = hair.get(b.s.feature)?.[0];
    if (!la || !lb) continue;
    const pa = la.drawn[0], pb = lb.drawn[0];
    if (!pa?.length || !pb?.length) continue;
    const ea = a.side === 0 ? pa[0] : pa.at(-1), eb = b.side === 0 ? pb[0] : pb.at(-1);
    const d = Math.hypot(ea[0] - eb[0], ea[1] - eb[1]);
    if (d <= o.hop) continue;
    faults.push({
      kind: 'beside-hop', layer: la.layer, route: [...new Set([...a.s.routes, ...b.s.routes])].join(' '), px: node.p, hopPx: d,
      msg: `the part-time hairline beside ${[...new Set([...a.s.routes, ...b.s.routes])].join(' ')} hops ${d.toFixed(1)} px sideways where one piece of the street meets the next at ${at(z, node.p)}`,
    });
  }
  return faults;
}

/**
 * Strands (BS05) and the core (BS07). A shared street of up to six routes has
 * a seam between each pair (routes - 1 of them), none of them hopping sideways
 * where its street goes straight on; a street of more than six has a core
 * line a third of its width and no seams.
 *  - strand-count: a street's seams are not one fewer than its routes, with no
 *    room-limited reason (every seam is drawn or none is).
 *  - strand-step: where two streets of the same width and routes meet end to
 *    end, a seam ends more than `step` px from where the next one begins.
 *  - core-wrong: a street of more than `max` routes with no core line, a core
 *    on one of `max` or fewer, or a core not a third (within `coreTol` px) of
 *    the street's width.
 */
export function strandFaults(zoom, opts = {}) {
  const o = { max: 6, step: 0.75, coreShare: 0.34, coreTol: 0.4, strandsFrom: 13.5, coreFrom: 14.5, ...opts };
  const z = zoom.z;
  const streets = streetsOf(zoom);
  const graph = graphOf(streets);
  const seams = byFeature(seamLayers(zoom, /^street-strand-(pt-)?\d+$/));
  const cores = byFeature(seamLayers(zoom, /^street-core/));
  const faults = [];
  for (const s of streets) {
    const m = s.n + s.pt;
    const mine = seams.get(s.feature) ?? [];
    const core = cores.get(s.feature)?.[0];
    if (z >= o.strandsFrom && m > 1 && m <= o.max && mine.length && mine.length !== m - 1) {
      faults.push({ kind: 'strand-count', layer: s.layer, route: s.routes.join(' '), px: s.part[Math.floor(s.part.length / 2)], msg: `${s.routes.join(' ')} has ${m} routes but ${mine.length} seams inside its ${s.w.toFixed(1)} px line at ${at(z, s.part[0])}` });
    }
    if (z >= o.coreFrom && m > o.max && !core && s.w >= 3) {
      faults.push({ kind: 'core-wrong', layer: s.layer, route: s.routes.join(' '), px: s.part[Math.floor(s.part.length / 2)], msg: `${s.routes.join(' ')} has ${m} routes (more than ${o.max}) and no core line in its ${s.w.toFixed(1)} px street at ${at(z, s.part[0])}` });
    }
    if (core && m <= o.max) {
      faults.push({ kind: 'core-wrong', layer: core.layer, route: s.routes.join(' '), px: s.part[Math.floor(s.part.length / 2)], msg: `${s.routes.join(' ')} has ${m} routes (${o.max} or fewer) but a core line, which is for streets of more than ${o.max}, at ${at(z, s.part[0])}` });
    }
    if (core && m > o.max) {
      const w = core.drawnWidth ?? core.width;
      if (Math.abs(w - o.coreShare * s.w) > o.coreTol) faults.push({ kind: 'core-wrong', layer: core.layer, route: s.routes.join(' '), px: s.part[Math.floor(s.part.length / 2)], msg: `the core of ${s.routes.join(' ')} is ${w.toFixed(1)} px, not a third of its ${s.w.toFixed(1)} px street, at ${at(z, s.part[0])}` });
    }
  }
  // Seams across a joint.
  for (const node of graph.nodes.values()) {
    if (node.through.length || node.ends.length !== 2) continue;
    const [a, b] = node.ends;
    if (a.s === b.s || Math.abs(a.s.w - b.s.w) >= 0.5 || !sameRoutes(a.s, b.s)) continue;
    const sa = seams.get(a.s.feature), sb = seams.get(b.s.feature);
    if (!sa || !sb) continue;
    const endsOf = (list, e) => list.flatMap((l) => l.drawn.filter((p) => p.length > 1).map((p) => (e.side === 0 ? p[0] : p.at(-1))));
    const pa = endsOf(sa, a), pb = endsOf(sb, b);
    const worst = (xs, ys) => Math.max(0, ...xs.map((p) => Math.min(...ys.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
    const d = Math.max(worst(pa, pb), worst(pb, pa));
    if (d > o.step) {
      faults.push({ kind: 'strand-step', layer: sa[0].layer, route: a.s.routes.join(' '), px: node.p, stepPx: d, msg: `a seam inside ${a.s.routes.join(' ')} steps ${d.toFixed(1)} px sideways where one piece of the street meets the next at ${at(z, node.p)}` });
    }
  }
  return faults;
}

// --- one-way arrows (BS08) ----------------------------------------------------------

/**
 * Where the page's chevrons are on a street, as MapLibre places a symbol along
 * a line: the first `first` px from the start, then every `spacing` px. The
 * spacing is in the pixels of the tile zoom, so it grows by 2^(fraction of the
 * zoom) between whole zooms. Returns the distance walked to each arrow, in px.
 */
export function arrowsOn(lengthPx, z, { spacing = 300, first = 32 } = {}) {
  const k = 2 ** (z - Math.floor(z));
  const out = [];
  for (let d = first * k; d <= lengthPx; d += spacing * k) out.push(d);
  return out;
}

/**
 * One-way arrows (BS08): a chevron every ~300 px along a one-way street of 250
 * m or more, none on a street that has a twin.
 *  - arrow-twin: two one-way streets within `twinM` metres of each other,
 *    running opposite ways side by side for `twinShare` of the shorter (a
 *    two-way road drawn as its carriageways): the build gives such a pair no
 *    arrows, and each has them.
 *  - arrow-bunched: at the joint of two one-way streets going on in the same
 *    direction, the last arrow of the first and the first of the second are
 *    under `bunch` of the arrow spacing apart.
 * From z14 (ARROWS_FROM in network.js), judged on the streets that have arrows
 * (`oneway` and a length of `minLen` metres or more).
 */
export function arrowFaults(zoom, opts = {}) {
  const o = { twinM: 60, twinShare: 0.5, bunch: 0.4, minLen: 250, spacing: 300, first: 32, ...opts };
  const z = zoom.z;
  const all = streetsOf(zoom);
  const ones = all.filter((s) => s.oneway && (s.len ?? 0) >= o.minLen);
  if (!ones.length) return [];
  const grid = new Grid();
  for (const s of ones) for (let i = 1; i < s.part.length; i++) {
    const a = s.part[i - 1], b = s.part[i];
    grid.add({ s, a, b, stamp: 0 }, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
  }
  const faults = [];
  const seen = new Set();
  for (const A of ones) {
    const mpp = metresPerPx(toLonLat(A.part[0], z)[1], z);
    const reach = o.twinM / mpp;
    const samples = sampleStreet(A, 4);
    const twins = new Map();
    for (const sm of samples) {
      let best = null;
      for (const c of grid.near(sm.p, reach)) {
        const B = c.s;
        if (B === A || B.feature === A.feature || B.key < A.key) continue;
        const { d } = segDist(sm.p, c.a, c.b);
        if (d > reach) continue;
        const u = unit([c.b[0] - c.a[0], c.b[1] - c.a[1]]);
        if (dot(sm.u, u) > -0.9) continue; // opposite directions, near parallel
        if (!best || d < best.d) best = { d, B };
      }
      if (best) { const t = twins.get(best.B) ?? { n: 0, p: sm.p }; t.n++; twins.set(best.B, t); }
    }
    for (const [B, t] of twins) {
      const shorter = Math.min(lengthOf(A.part), lengthOf(B.part)) / 4;
      if (t.n / Math.max(1, shorter) < o.twinShare) continue;
      const key = `${A.key}|${B.key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      faults.push({
        kind: 'arrow-twin', layer: A.layer, route: [...new Set([...A.routes, ...B.routes])].join(' '), px: t.p,
        msg: `one-way ${A.routes.join(' ')} has arrows and so has its twin ${B.routes.join(' ')} within ${o.twinM} m going the other way: a two-way road drawn as two one-way streets, at ${at(z, t.p)}`,
      });
    }
  }
  // Arrows bunched at a joint.
  if (z >= 14) {
    const graph = graphOf(ones);
    const k = 2 ** (z - Math.floor(z));
    for (const node of graph.nodes.values()) {
      if (node.through.length || node.ends.length !== 2) continue;
      const [e1, e2] = node.ends;
      // one arrives (its end side 1) and the other leaves (its side 0)
      const arriving = e1.side === 1 && e2.side === 0 ? e1 : e2.side === 1 && e1.side === 0 ? e2 : null;
      if (!arriving) continue;
      const leaving = arriving === e1 ? e2 : e1;
      const lenA = lengthOf(arriving.s.part);
      const arrowsA = arrowsOn(lenA, z, o);
      const lastA = arrowsA.length ? lenA - arrowsA.at(-1) : null;
      const firstB = o.first * k;
      if (lastA === null) continue;
      const gap = lastA + firstB;
      if (gap < o.bunch * o.spacing * k) {
        faults.push({
          kind: 'arrow-bunched', layer: arriving.s.layer, route: [...new Set([...arriving.s.routes, ...leaving.s.routes])].join(' '), px: node.p, gapPx: gap, spacing: o.spacing * k,
          msg: `two arrows ${gap.toFixed(0)} px apart (about ${Math.round(o.spacing * k)} wanted) where one-way ${arriving.s.routes.join(' ')} meets ${leaving.s.routes.join(' ')} at ${at(z, node.p)}`,
        });
      }
    }
  }
  return faults;
}

// --- ramps and loops (DR02, DR03) --------------------------------------------------

const junction = (n) => n.ends.length + 2 * n.through.length >= 3;
const metresOf = (a, b, z) => Math.hypot(a[0] - b[0], a[1] - b[1]) * metresPerPx(toLonLat(a, z)[1], z);

/**
 * Turns the build is meant to have tidied (DESIGN.md "Readable geometry"):
 *  - ramp-curl (DR02): a stretch between two junctions, 2.5 times longer than
 *    the straight line between them, its ends within `rampEnds` m and no wider
 *    than `rampWide` m, is drawn straight; one a rider boards on (a stop of its
 *    routes within `boardM` m of it and over `boardEnd` m from its ends) stays.
 *  - loop (DR03): a stretch that leaves a junction and comes back to it, no
 *    farther from it than `loopM` m, is a turn there and is a short end or
 *    gone; not under `loopMin` m (a street corner), nor a loop that is all of
 *    its line (a circulator).
 * From z15: the strokes are narrower than the ramp.
 */
export function turnFaults(zoom, opts = {}) {
  const o = { ratio: 2.5, rampEnds: 100, rampWide: 220, boardM: 30, boardEnd: 60, loopM: 220, loopMin: 60, ...opts };
  const z = zoom.z;
  const streets = streetsOf(zoom);
  const graph = graphOf(streets);
  const where = placesOf(zoom, opts.places);
  const faults = [];
  const boards = (chain, routes, ends) => {
    return where.stops.some((k) => {
      if (!tokens(k.properties?.lines).some((r) => routes.has(r))) return false;
      let near = Infinity;
      for (const st of chain) for (let i = 1; i < st.part.length; i++) near = Math.min(near, segDist(k.at, st.part[i - 1], st.part[i]).d);
      const m = metresPerPx(toLonLat(k.at, z)[1], z);
      if (near * m > o.boardM) return false;
      return ends.every((e) => Math.hypot(k.at[0] - e[0], k.at[1] - e[1]) * m > o.boardEnd);
    });
  };
  for (const ch of chainsOf(streets, graph)) {
    const lenM = ch.streets.reduce((t, s) => t + streetM(s, z), 0);
    const routes = new Set(ch.streets.flatMap((s) => s.routes));
    const a = ch.startNode, b = ch.endNode;
    if (a === b && !ch.closed) {
      // A loop: back to the node it left.
      if (!junction(a)) continue;
      if (lenM < o.loopMin || lenM > o.loopM * 2 * Math.PI) continue;
      let far = 0;
      for (const st of ch.streets) for (const p of st.part) far = Math.max(far, metresOf(p, a.p, z));
      if (far > o.loopM) continue;
      faults.push({
        kind: 'loop', layer: ch.streets[0].layer, route: [...routes].join(' '), px: ch.streets[0].part[Math.floor(ch.streets[0].part.length / 2)], lengthM: lenM, reachM: far,
        msg: `${[...routes].join(' ')} leaves a junction and comes back to it: a ${Math.round(lenM)} m loop reaching ${Math.round(far)} m, drawn in full, at ${at(z, a.p)}`,
      });
      continue;
    }
    if (ch.closed || a === b || !junction(a) || !junction(b)) continue;
    const chord = metresOf(a.p, b.p, z);
    if (chord > o.rampEnds || chord < 1 || lenM / chord < o.ratio) continue;
    // widest the chain strays from the chord
    const ux = unit([b.p[0] - a.p[0], b.p[1] - a.p[1]]);
    let wide = 0;
    for (const st of ch.streets) for (const p of st.part) wide = Math.max(wide, Math.abs((p[0] - a.p[0]) * ux[1] - (p[1] - a.p[1]) * ux[0]));
    const wideM = wide * metresPerPx(toLonLat(a.p, z)[1], z);
    if (wideM > o.rampWide) continue;
    if (boards(ch.streets, routes, [a.p, b.p])) continue;
    const mid = ch.streets[Math.floor(ch.streets.length / 2)].part[0];
    faults.push({
      kind: 'ramp-curl', layer: ch.streets[0].layer, route: [...routes].join(' '), px: mid, lengthM: lenM, chordM: chord, ratio: lenM / chord,
      msg: `${[...routes].join(' ')} runs ${Math.round(lenM)} m between two junctions ${Math.round(chord)} m apart (${(lenM / chord).toFixed(1)} times as long), a ramp drawn as it is driven, at ${at(z, mid)}`,
    });
  }
  return faults;
}

// --- halls (TH01, TH04) ------------------------------------------------------------

/**
 * Terminal halls (TH01): each bus-station facility (class `BUS` or `STN`) is
 * drawn as the hall its gates stand in.
 *  - hall-gate-outside: a gate stop of a hall's station stands outside the
 *    hall: `gates` of the terminal says how many there are.
 *  - hall-missing: a bus-station facility with gates and no hall drawn.
 * Needs the build's files: `opts.data` = model.data (terminals, facilities,
 * stops). A stop's gate is the build's own: `gate` set, or "Gate" in its name.
 */
export function hallFaults(zoom, opts = {}) {
  const data = opts.data;
  if (!data?.terminals || !data?.facilities || !data?.stops) return [];
  const o = { stationM: 150, ...opts };
  const z = zoom.z;
  const toPx = (c) => toWorld(c, z);
  const gates = data.stops.features.filter((f) => f.properties?.gate === 1 || /\bGate\b/i.test(f.properties?.name ?? ''));
  const faults = [];
  const halls = new Map();
  for (const t of data.terminals.features) {
    const rings = t.geometry.type === 'Polygon' ? t.geometry.coordinates : t.geometry.coordinates.flat();
    halls.set(String(t.properties?.id), { t, rings: rings.map((r) => r.map(toPx)) });
  }
  for (const f of data.facilities.features) {
    if (!['BUS', 'STN'].includes(f.properties?.class)) continue;
    const at0 = toPx(f.geometry.coordinates);
    const mpp = metresPerPx(f.geometry.coordinates[1], z);
    const mine = gates.filter((g) => Math.hypot(...toPx(g.geometry.coordinates).map((v, i) => v - at0[i])) * mpp <= o.stationM);
    const hall = halls.get(String(f.properties.id));
    if (!hall) {
      if (mine.length >= 2) faults.push({ kind: 'hall-missing', layer: 'terminals', route: null, px: at0, gates: mine.length, msg: `${f.properties.name} (${f.properties.class}) has ${mine.length} gates within ${o.stationM} m and no hall drawn, at ${at(z, at0)}` });
      continue;
    }
    for (const g of mine) {
      const p = toPx(g.geometry.coordinates);
      const d = ringDist(p, hall.rings) * mpp;
      if (insideRings(p, hall.rings) || d < 3) continue;
      faults.push({
        kind: 'hall-gate-outside', layer: 'terminals', route: tokens(g.properties?.lines).join(' ') || null, id: g.properties?.id, px: p, outsideM: d,
        msg: `${g.properties?.name} is ${Math.round(d)} m outside the hall of ${f.properties.name}, which lists ${hall.t.properties?.gates ?? '?'} gates, at ${at(z, p)}`,
      });
    }
  }
  return faults;
}

// --- all of them ------------------------------------------------------------------

/**
 * The zoom each kind is judged from, and why.
 *  - 11 to 13: a street class is drawn at a width a rider can tell from the next
 *    (c60 is 1 px at z13); width steps are judged from z13, wedges, bulges and
 *    blobs from z14 where the strokes are wide enough to have a shape (c3 is 9
 *    px at z14).
 *  - 14: the part-time hairline and the arrows come in (ARROWS_FROM); 13.5 the
 *    strands; 14.5 the core.
 *  - 15: stops are drawn (STOPS_ZOOM); a line end is judged against a stop, a
 *    ramp or a loop against a stroke that does not cover it, from there.
 *  - 13: halls are drawn (TERMINAL_FROM).
 */
export const APPLIES_FROM = {
  'end-blob': 14,
  'end-bulge': 14,
  'end-short': 15,
  'end-in-air': 15,
  'width-step': 13,
  'class-blip': 13,
  'bus-wedge': 14,
  'bus-sliver': 14,
  braid: 13,
  'street-overlap': 13,
  'stop-off-line': 15,
  'hall-stray-stop': 15,
  'beside-gap': 14,
  'beside-covered': 14,
  'beside-hop': 14,
  'strand-count': 13.5,
  'strand-step': 13.5,
  'core-wrong': 14.5,
  'arrow-twin': 14,
  'arrow-bunched': 14,
  'ramp-curl': 15,
  loop: 15,
  'hall-gate-outside': 13,
  'hall-missing': 13,
};

// A place's own vertex nearest a point, so the same fault has the same place at every zoom.
function snap(streets, p) {
  let best = p, d = Infinity;
  for (const s of streets) for (const v of s.part) { const k = Math.hypot(v[0] - p[0], v[1] - p[1]); if (k < d) { d = k; best = v; } }
  return best;
}

/**
 * Every detector here at one zoom of the drawn model, each from the zoom it
 * applies from (APPLIES_FROM; `applyFrom: {}` judges every kind at every zoom).
 * Places are the vertex of a street nearest the fault, the same ground at every
 * zoom, so the same fault found at several zooms merges into one finding.
 * @param {{z: number, lines: Array, marks?: Array, areas?: Array}} zoom the model's zoom(z) output
 * @param {{places?: object, data?: object, applyFrom?: object}} opts `places`: model.places(z, PLACE_SOURCES);
 *   `data`: model.data (terminals, facilities, stops) for the hall rules; `applyFrom`: see above
 */
export function busFaults(zoom, opts = {}) {
  const from = opts.applyFrom ?? APPLIES_FROM;
  const z = zoom.z;
  const streets = streetsOf(zoom);
  const all = [
    ...lineEnds(zoom, opts), ...widthSteps(zoom, opts), ...wedges(zoom, opts), ...braids(zoom, opts), ...stopsOffLine(zoom, opts),
    ...besideFaults(zoom, opts), ...strandFaults(zoom, opts), ...arrowFaults(zoom, opts), ...turnFaults(zoom, opts), ...hallFaults(zoom, opts),
  ];
  const near = new Set(['bus-wedge', 'bus-sliver', 'braid', 'street-overlap', 'beside-gap', 'beside-covered']);
  return all.filter((f) => z >= (from[f.kind] ?? -Infinity)).map((f) => (near.has(f.kind) ? { ...f, px: snap(streets, f.px) } : f));
}

export { lengthOf, lineAngle, angleBetween, unit, dot, px1, at, routesOf, isBus, isRail, capReach };
