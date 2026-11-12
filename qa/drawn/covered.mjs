// Things hidden under, or sitting on, other things (rules BS12 / KD-02, TH03,
// SP01, KD-03; qa/rules/): a bus street drawn under the rail that runs along
// it, a bus stop dot on a rail line it does not serve, a bus line drawn
// through a bus hall, a stop only trains call at drawn as a bus stop, and a
// rail line drawn under a bus line.
//
// They read the drawn model (qa/drawn/model.mjs) at one zoom, in screen px,
// the lines as drawn (strokes.mjs): each line's centreline moved by its
// offset, with the width it is drawn at. Nothing here names a route, layer or
// place. A rail line is a line whose `mode` is rail, a bus line one whose
// `mode` is bus and that carries routes; a stop's `lines` and a line's routes
// are the build's. What is drawn over what is the style's own order: the
// model's `lines` come out in the order the style draws them, so a line is
// covered by another only if the other comes later in the list.
//
// Kinds (each finding is { kind, layer, route, px, msg, ... } like the other
// detectors', with px in world px at the zoom):
//  - under-rail (BS12 / KD-02): a bus street under the rail that runs along
//    it. At each sample along a street (every `stepM` metres of ground) the
//    street is "along" a rail line when their strokes touch or overlap
//    (centrelines no farther apart than half the two widths) and the two run
//    within `alongDeg` degrees of each other; a street that only crosses a
//    rail line is never along it. The sample is "hidden" when at least
//    `hideShare` of the street's stroke across its width is under a rail stroke
//    drawn after it. A stretch is a run of hidden samples (a break shorter
//    than `bridgeM` is bridged, and street features that meet end to end are
//    one run) at least `minLen` metres long; its share is the part of the
//    street's stroke it covers over the stretch (area), reported when it is at
//    least `minShare` (a third of a line under the casing is touching, not
//    hidden), and `apartM` is how far the street's centreline is from the
//    nearest drawn rail line.
//  - stop-on-rail: a bus stop's dot with at least `dotShare` of its disc on
//    a rail stroke whose route does not call there (not in the stop's
//    `lines`).
//  - bus-in-hall (TH03): the centreline of a bus street inside a `terminals`
//    area for more than `hallEdge` px (lines end at the hall's edge).
//  - rail-only-stop (SP01): a drawn `stops` dot whose `lines` are all rail
//    routes.
//  - rail-under-bus (KD-03, a proposal): the same measure as under-rail with
//    the roles swapped: a rail line covered by bus strokes drawn after it.
//
// From which zoom each applies is APPLIES_FROM (the reasons are with it).
// `coveredFaults(zoom, { applyFrom: {} })` ignores them, to see the numbers at
// every zoom.

import { toLonLat } from './mercator.mjs';

// The zoom each kind is judged from. Further out the strokes are fatter than
// the ground between neighbouring streets and the track (a pack of three is
// 53 m wide at z15, 30 m at z16), so overlaps there are the scale, not a
// mistake. Streets and stops are judged from z15, where stops start to be drawn
// and a pack is still no wider than a block; every stretch that is hidden at
// z15 but not at z16 (about half of them) is a divided road the build merges
// into one line down its median, where the rail runs (street `zoom: 'far'`):
// real to the rider at z15, and listed with its zooms so a reader can set the
// floor to 16. Halls are drawn from z13. Rail under a bus line is judged from
// z13 (no scale excuse: rail is the heavier class).
export const APPLIES_FROM = {
  'under-rail': 15,
  'stop-on-rail': 15,
  'bus-in-hall': 13,
  'rail-only-stop': 15,
  'rail-under-bus': 13,
};

export const DEFAULTS = {
  alongDeg: 30,
  minLen: 40, // metres of ground
  hideShare: 0.25, // a sample is hidden when this much of the street's stroke across is covered
  minShare: 0.5, // a stretch is a finding when this much of the street's stroke along it is covered
  touch: 0.5, // px of slack for "touching"
  stepM: 2.5, // ground metres between samples along a line
  bridgeM: 8, // a break in contact shorter than this does not end a stretch
  dotShare: 0.5,
  hallEdge: 2, // px of a line inside a hall's edge that is not a fault
};

const CELL = 64;
const metresPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
const routesOf = (l) => (l.route != null ? [String(l.route)] : String(l.properties?.routes ?? '').split(/\s+/).filter(Boolean));
const isRail = (l) => l.mode === 'rail' || l.properties?.mode === 'rail';
const isBus = (l) => (l.mode === 'bus' || l.properties?.mode === 'bus') && routesOf(l).length > 0;

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// --- strokes ---------------------------------------------------------------

// One stroke per feature that a layer draws: the widest (or narrowest) of the
// layers that draw it, since a casing, an edge and the line itself are one
// piece of rail and the strands inside a street are part of the street.
// `index` is where it comes in the draw order.
function strokesOf(lines, pick, widest = true) {
  const best = new Map();
  lines.forEach((l, index) => {
    if (!pick(l)) return;
    if (!(l.opacity >= 0.3) || !((l.drawnWidth ?? l.width) > 0)) return;
    const key = `${l.source}:${l.index}`;
    const have = best.get(key);
    const w = l.drawnWidth ?? l.width;
    if (!have || (widest ? w > have.w : w < have.w)) best.set(key, { l, w, index });
  });
  return [...best.values()].map(({ l, w, index }) => ({
    entry: l,
    index,
    hw: w / 2,
    parts: l.drawn ?? l.parts,
    centre: l.parts,
    routes: routesOf(l),
  }));
}

class Grid {
  constructor() { this.cells = new Map(); this.stamp = 0; }
  key(x, y) { return x * 2097152 + y; }
  add(seg, pad = 0) {
    const x0 = Math.floor((Math.min(seg.a[0], seg.b[0]) - pad) / CELL), x1 = Math.floor((Math.max(seg.a[0], seg.b[0]) + pad) / CELL);
    const y0 = Math.floor((Math.min(seg.a[1], seg.b[1]) - pad) / CELL), y1 = Math.floor((Math.max(seg.a[1], seg.b[1]) + pad) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) return;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = this.key(x, y);
      const cell = this.cells.get(k);
      if (cell) cell.push(seg); else this.cells.set(k, [seg]);
    }
  }
  // Segments registered in the cells within `r` px of p (a superset).
  near(p, r = 0) {
    const out = [];
    const s = ++this.stamp;
    const x0 = Math.floor((p[0] - r) / CELL), x1 = Math.floor((p[0] + r) / CELL);
    const y0 = Math.floor((p[1] - r) / CELL), y1 = Math.floor((p[1] + r) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const cell = this.cells.get(this.key(x, y));
      if (!cell) continue;
      for (const seg of cell) if (seg.stamp !== s) { seg.stamp = s; out.push(seg); }
    }
    return out;
  }
}

function gridOfStrokes(strokes) {
  const grid = new Grid();
  let maxHw = 0;
  strokes.forEach((stroke, k) => {
    maxHw = Math.max(maxHw, stroke.hw);
    for (const part of stroke.parts) {
      for (let i = 1; i < part.length; i++) {
        const a = part[i - 1], b = part[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (!len) continue;
        grid.add({ a, b, ux: dx / len, uy: dy / len, hw: stroke.hw, stroke, k, stamp: 0 }, stroke.hw);
      }
    }
  });
  return { grid, maxHw };
}

// --- stretches of one kind of stroke hidden under another ------------------

/**
 * Stretches of `subject` strokes that run along `cover` strokes drawn after
 * them, with the share of the subject's stroke the cover hides.
 * @returns {Array} { subject, share, hiddenM, lengthM, cover: Set of routes,
 *   mid: world px, vertex: world px, points: world px[] }
 */
function hiddenStretches(subject, cover, z, o) {
  const { grid, maxHw } = gridOfStrokes(cover);
  const cosAlong = Math.cos((o.alongDeg * Math.PI) / 180);
  const runs = [];
  for (const stroke of subject) {
    for (let pi = 0; pi < stroke.parts.length; pi++) {
      const part = stroke.parts[pi];
      if (part.length < 2) continue;
      const mpp = metresPerPx(toLonLat(part[0], z)[1], z);
      const step = Math.max(o.stepM / mpp, 1);
      const hs = stroke.hw;
      const K = Math.max(3, Math.min(21, Math.ceil((2 * hs) / 0.6)));
      const reach = hs + maxHw + o.touch;
      // Samples along the part.
      const samples = [];
      for (let i = 1; i < part.length; i++) {
        const a = part[i - 1], b = part[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (!len) continue;
        const ux = dx / len, uy = dy / len;
        const n = Math.max(1, Math.round(len / step));
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n;
          samples.push({ p: [a[0] + dx * t, a[1] + dy * t], ux, uy, w: len / n, vertex: i - 1 });
        }
      }
      let any = false;
      for (const s of samples) {
        const cands = grid.near(s.p, reach);
        s.contact = false;
        s.hidden = false;
        s.f = 0;
        s.cover = null;
        if (!cands.length) continue;
        // Along: a cover stroke touching this one, running the same way.
        s.d = Infinity;
        for (const c of cands) {
          if (Math.abs(s.ux * c.ux + s.uy * c.uy) < cosAlong) continue;
          const d = segDist(s.p, c.a, c.b);
          if (d <= c.hw + hs + o.touch) { s.contact = true; if (d < s.d) s.d = d; }
        }
        if (!s.contact) continue;
        // Covered: the share of the cross-section under a later stroke.
        let covered = 0;
        const hit = new Set();
        for (let k = 0; k < K; k++) {
          const u = -hs + ((k + 0.5) * 2 * hs) / K;
          const q = [s.p[0] - s.uy * u, s.p[1] + s.ux * u];
          for (const c of cands) {
            if (c.stroke.index <= stroke.index) continue;
            if (segDist(q, c.a, c.b) <= c.hw) { covered++; for (const r of c.stroke.routes) hit.add(r); break; }
          }
        }
        s.f = covered / K;
        s.cover = hit;
        s.hidden = s.f >= o.hideShare;
        any = any || s.hidden;
      }
      if (!any) continue;
      // Runs of hidden samples, a short break bridged.
      const bridge = Math.max(o.bridgeM / mpp, step * 1.5);
      let cur = null;
      let gap = 0;
      const close = () => { if (cur) { runs.push(cur); cur = null; } gap = 0; };
      samples.forEach((s, idx) => {
        if (s.hidden) {
          if (!cur) cur = { stroke, part, pi, samples: [], first: idx, last: idx };
          cur.samples.push(s);
          cur.last = idx;
          gap = 0;
        } else if (cur) {
          gap += s.w;
          if (gap > bridge) close();
        }
      });
      close();
      for (const r of runs) {
        if (r.stroke !== stroke || r.part !== part || r.total !== undefined) continue;
        r.total = samples.length;
        r.mpp = mpp;
        r.startsAtStart = r.first <= 1;
        r.endsAtEnd = r.last >= samples.length - 2;
      }
    }
  }

  // Chain the runs of street features that meet end to end (a street is cut
  // at every junction of the street graph, so one stretch along the rail is
  // several features), then measure each chain.
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ends = new Map();
  const keyOf = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  runs.forEach((r, i) => {
    const part = r.part;
    if (r.startsAtStart) { const k = keyOf(part[0]); (ends.get(k) ?? ends.set(k, []).get(k)).push(i); }
    if (r.endsAtEnd) { const k = keyOf(part[part.length - 1]); (ends.get(k) ?? ends.set(k, []).get(k)).push(i); }
  });
  for (const list of ends.values()) for (let i = 1; i < list.length; i++) parent[find(list[i])] = find(list[0]);
  const chains = new Map();
  runs.forEach((r, i) => { const k = find(i); (chains.get(k) ?? chains.set(k, []).get(k)).push(r); });

  const out = [];
  for (const members of chains.values()) {
    let len = 0, covered = 0, hidden = 0;
    const apart = [];
    const tags = new Set();
    const coverRoutes = new Set();
    const routes = new Set();
    const points = [];
    let biggest = members[0];
    let biggestLen = -1;
    for (const r of members) {
      let rl = 0;
      for (const s of r.samples) {
        const m = s.w * r.mpp;
        len += m; rl += m;
        covered += s.f * m;
        if (s.f >= 0.9) hidden += m;
        apart.push(s.d * r.mpp);
        for (const c of s.cover ?? []) coverRoutes.add(c);
        points.push([s.p[0], s.p[1], m]);
      }
      if (rl > biggestLen) { biggestLen = rl; biggest = r; }
      for (const x of r.stroke.routes) routes.add(x);
      tags.add(r.stroke.entry.properties?.zoom ?? '');
    }
    if (len < o.minLen) continue;
    const share = covered / len;
    // The place: the data's own vertex nearest the middle of the longest run,
    // the same ground at every zoom.
    const mid = biggest.samples[Math.floor(biggest.samples.length / 2)];
    let vertex = mid.p, best = Infinity;
    for (const part of biggest.stroke.centre) for (const v of part) {
      const d = Math.hypot(v[0] - mid.p[0], v[1] - mid.p[1]);
      if (d < best) { best = d; vertex = v; }
    }
    apart.sort((a, b) => a - b);
    out.push({ stroke: biggest.stroke, routes: [...routes], share, hiddenM: hidden, lengthM: len, coveredM: covered, apartM: apart[Math.floor(apart.length / 2)], tags: [...tags], cover: [...coverRoutes], mid: mid.p, vertex, points });
  }
  return out;
}

const percent = (x) => `${Math.round(x * 100)}%`;
const metres = (m) => `${Math.round(m)} m`;
const at = (z, px) => { const [lon, lat] = toLonLat(px, z); return `${lat.toFixed(5)},${lon.toFixed(5)}`; };

/**
 * Bus streets hidden under the rail that runs along them (BS12 / KD-02).
 */
export function underRail(zoom, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const bus = strokesOf(zoom.lines, isBus);
  const rail = strokesOf(zoom.lines, isRail);
  if (!bus.length || !rail.length) return [];
  return hiddenStretches(bus, rail, zoom.z, o)
    .filter((s) => s.share >= o.minShare)
    .map((s) => ({
      kind: 'under-rail',
      layer: s.stroke.entry.layer,
      route: s.routes.join(' '),
      px: s.vertex,
      share: s.share,
      lengthM: s.lengthM,
      hiddenM: s.hiddenM,
      apartM: s.apartM,
      tags: s.tags,
      rail: s.cover,
      points: s.points,
      msg: `bus ${s.routes.join(' ')} is ${percent(s.share)} hidden under rail ${s.cover.join(' ')} along ${metres(s.lengthM)} (${metres(s.hiddenM)} wholly; centrelines ${s.apartM.toFixed(0)} m apart) at ${at(zoom.z, s.mid)}`,
    }));
}

/**
 * Rail lines hidden under a bus line drawn after them (KD-03, a proposal).
 */
export function railUnderBus(zoom, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rail = strokesOf(zoom.lines, isRail, false);
  const bus = strokesOf(zoom.lines, isBus);
  if (!bus.length || !rail.length) return [];
  return hiddenStretches(rail, bus, zoom.z, o)
    .filter((s) => s.share >= o.minShare)
    .map((s) => ({
      kind: 'rail-under-bus',
      layer: s.stroke.entry.layer,
      route: s.routes.join(' '),
      px: s.vertex,
      share: s.share,
      lengthM: s.lengthM,
      hiddenM: s.hiddenM,
      apartM: s.apartM,
      rail: s.routes,
      bus: s.cover,
      points: s.points,
      msg: `rail ${s.routes.join(' ')} is ${percent(s.share)} hidden under bus ${s.cover.join(' ')} along ${metres(s.lengthM)} at ${at(zoom.z, s.mid)}`,
    }));
}

// --- bus stops ----------------------------------------------------------------

const stopDots = (zoom) => (zoom.marks ?? []).filter((m) => m.kind === 'circle' && m.source === 'stops');
const tokens = (v) => String(v ?? '').split(/\s+/).filter(Boolean);

/**
 * Bus stop dots that sit on a rail line they do not serve.
 */
export function stopsOnRail(zoom, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const dots = stopDots(zoom);
  const rail = strokesOf(zoom.lines, isRail);
  if (!dots.length || !rail.length) return [];
  const { grid, maxHw } = gridOfStrokes(rail);
  const faults = [];
  for (const m of dots) {
    const R = (m.radius ?? 0) + (m.stroke ?? 0);
    if (!(R > 0)) continue;
    const served = new Set(tokens(m.properties?.lines));
    const cands = grid.near(m.at, R + maxHw).filter((c) => c.stroke.routes.some((r) => !served.has(r)));
    if (!cands.length) continue;
    // The disc, sampled on a grid, against the strokes of routes that do not call.
    const n = Math.max(2, Math.ceil(R / 0.6));
    let inside = 0, on = 0;
    const under = new Set();
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const q = [m.at[0] + (i / n) * R, m.at[1] + (j / n) * R];
      if (Math.hypot(q[0] - m.at[0], q[1] - m.at[1]) > R) continue;
      inside++;
      for (const c of cands) {
        if (segDist(q, c.a, c.b) <= c.hw) { on++; for (const r of c.stroke.routes) if (!served.has(r)) under.add(r); break; }
      }
    }
    const share = inside ? on / inside : 0;
    if (share < o.dotShare) continue;
    faults.push({
      kind: 'stop-on-rail',
      layer: m.layer,
      route: tokens(m.properties?.lines).join(' ') || null,
      id: m.properties?.id,
      px: m.at,
      share,
      rail: [...under],
      msg: `stop "${m.properties?.name}" (${tokens(m.properties?.lines).join(' ') || 'no drawn line'}) is ${percent(share)} on rail ${[...under].join(' ')} at ${at(zoom.z, m.at)}`,
    });
  }
  return faults;
}

/**
 * A drawn bus stop dot whose lines are all rail routes (SP01).
 */
export function railOnlyStops(zoom) {
  const railRoutes = new Set();
  for (const l of zoom.lines) if (isRail(l)) for (const r of routesOf(l)) railRoutes.add(r);
  if (!railRoutes.size) return [];
  const faults = [];
  for (const m of stopDots(zoom)) {
    const lines = tokens(m.properties?.lines);
    if (!lines.length || !lines.every((r) => railRoutes.has(r))) continue;
    faults.push({
      kind: 'rail-only-stop',
      layer: m.layer,
      route: lines.join(' '),
      id: m.properties?.id,
      px: m.at,
      msg: `stop "${m.properties?.name}" is drawn as a bus stop but only ${lines.join(' ')} (rail) call there, at ${at(zoom.z, m.at)}`,
    });
  }
  return faults;
}

// --- bus halls ---------------------------------------------------------------

// The parts of segment a-b inside a polygon (its rings, even-odd), as
// [t0, t1] ranges of the segment.
function insideRanges(a, b, rings) {
  const ts = [0, 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const c = ring[i - 1], d = ring[i];
      const ex = d[0] - c[0], ey = d[1] - c[1];
      const den = dx * ey - dy * ex;
      if (!den) continue;
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
      const s = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
      if (t > 0 && t < 1 && s >= 0 && s <= 1) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const inRings = (p) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1], d = ring[i];
        if ((c[1] > p[1]) !== (d[1] > p[1]) && p[0] < ((d[0] - c[0]) * (p[1] - c[1])) / (d[1] - c[1]) + c[0]) inside = !inside;
      }
    }
    return inside;
  };
  const out = [];
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] < 1e-9) continue;
    const m = (ts[i] + ts[i - 1]) / 2;
    if (inRings([a[0] + dx * m, a[1] + dy * m])) out.push([ts[i - 1], ts[i]]);
  }
  return out;
}

/**
 * Bus street centrelines that run inside a bus hall (TH03).
 * @param {{places?: {areas: Array}}} opts `places`: model.places(z, ['terminals']), the halls whether
 *   or not their layers are drawn at this zoom (default: the zoom's own areas)
 */
export function busInHall(zoom, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const halls = (opts.places?.areas ?? zoom.areas ?? []).filter((a) => a.source === 'terminals' && a.parts?.length);
  if (!halls.length) return [];
  const bus = strokesOf(zoom.lines, isBus);
  const faults = [];
  for (const hall of halls) {
    const xs = hall.parts.flat().map((p) => p[0]), ys = hall.parts.flat().map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    for (const stroke of bus) {
      let inside = 0, first = null;
      for (const part of stroke.centre) {
        for (let i = 1; i < part.length; i++) {
          const a = part[i - 1], b = part[i];
          if (Math.max(a[0], b[0]) < box[0] || Math.min(a[0], b[0]) > box[2] || Math.max(a[1], b[1]) < box[1] || Math.min(a[1], b[1]) > box[3]) continue;
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (const [t0, t1] of insideRanges(a, b, hall.parts)) {
            inside += (t1 - t0) * len;
            first ??= [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
          }
        }
      }
      if (inside <= o.hallEdge) continue;
      const lat = toLonLat(first, zoom.z)[1];
      const m = inside * metresPerPx(lat, zoom.z);
      faults.push({
        kind: 'bus-in-hall',
        layer: stroke.entry.layer,
        route: stroke.routes.join(' '),
        px: first,
        insidePx: inside,
        lengthM: m,
        hall: hall.name ?? null,
        msg: `bus ${stroke.routes.join(' ')} runs ${inside.toFixed(1)} px (${metres(m)}) inside ${hall.name ?? 'a hall'} at ${at(zoom.z, first)}`,
      });
    }
  }
  return faults;
}

/**
 * All the kinds here, at one zoom of the drawn model, each from the zoom it applies from.
 * @param {{z: number, lines: Array, marks?: Array, areas?: Array}} zoom the model's zoom(z) output
 * @param {{places?: {areas: Array}, applyFrom?: object}} opts `places`: model.places(z, ['terminals']);
 *   `applyFrom`: the zoom to judge each kind from (default APPLIES_FROM; `{}` judges every kind at every zoom)
 */
export function coveredFaults(zoom, opts = {}) {
  const from = opts.applyFrom ?? APPLIES_FROM;
  const on = (kind) => zoom.z >= (from[kind] ?? -Infinity);
  return [
    ...(on('under-rail') ? underRail(zoom, opts) : []),
    ...(on('stop-on-rail') ? stopsOnRail(zoom, opts) : []),
    ...(on('bus-in-hall') ? busInHall(zoom, opts) : []),
    ...(on('rail-only-stop') ? railOnlyStops(zoom) : []),
    ...(on('rail-under-bus') ? railUnderBus(zoom, opts) : []),
  ];
}

// --- the same fault at several zooms, as one -----------------------------------

const CELL_LAT = 0.0008; // about 90 m
const CELL_LON = 0.001; // about 85 m
const metresBetween = (a, b) => {
  const k = 111320;
  return Math.hypot((a[0] - b[0]) * k * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * k);
};
const cellOf = ([lon, lat]) => [Math.floor(lat / CELL_LAT), Math.floor(lon / CELL_LON)];

/**
 * One row per stretch or stop: the same fault found at several zooms is one
 * finding, with the zooms it was seen at.
 *
 * A stretch is not the same length at every zoom (the strokes are fat further
 * out, so more of a street is under the rail), so a stretch seen at z15 over
 * 6 km and at z16 over 400 m of it is two rows: the 400 m with zooms 15 and
 * 16, the rest with zoom 15 alone. A finding's points are put in ground cells
 * of about 90 m; the pieces in a cell that share a route are one piece
 * whatever the zoom; neighbouring pieces with the same routes and the same
 * zooms are one row. Stops (and anything else without points) are one row
 * per id.
 * @param {Array<{zoom: number}>} findings coveredFaults() output, each with its `zoom`
 * @returns {Array<{kind, route, routes, lat, lon, zooms, lengthM, lengths, shares, rail, msg}>}
 *   `lengthM`: metres at the highest zoom of the row; `lengths`/`shares`: per zoom
 */
export function mergeCovered(findings) {
  const pieces = [];
  const byCell = new Map();
  const loners = new Map();
  for (const f of findings) {
    const mine = (f.route ?? '').split(/\s+/).filter(Boolean);
    if (!f.points?.length) {
      const key = `${f.kind}|${f.id ?? ''}|${f.hall ?? ''}|${mine.join(' ')}|${f.id == null ? toLonLat(f.px, f.zoom).map((x) => x.toFixed(4)).join(',') : ''}`;
      let row = loners.get(key);
      if (!row) {
        const [lon, lat] = toLonLat(f.px, f.zoom);
        row = { kind: f.kind, id: f.id, routes: mine, lat, lon, zooms: [], lengths: {}, shares: {}, aparts: {}, rail: new Set(), top: -Infinity, layer: f.layer };
        loners.set(key, row);
      }
      row.zooms.push(f.zoom);
      row.shares[f.zoom] = f.share ?? null;
      row.lengths[f.zoom] = f.lengthM ?? f.insidePx ?? 0;
      if (f.zoom >= row.top) { row.top = f.zoom; row.lengthM = f.lengthM ?? 0; row.msg = f.msg; }
      for (const r of f.rail ?? []) row.rail.add(r);
      continue;
    }
    // Metres of this finding in each cell it touches.
    const here = new Map();
    for (const p of f.points) {
      const ll = toLonLat(p, f.zoom);
      const [cy, cx] = cellOf(ll);
      const key = `${cy}:${cx}`;
      const have = here.get(key) ?? { cy, cx, m: 0, sx: 0, sy: 0, n: 0 };
      have.m += p[2] ?? 0; have.sx += ll[0]; have.sy += ll[1]; have.n++;
      here.set(key, have);
    }
    for (const [key, c] of here) {
      const list = byCell.get(`${f.kind}|${key}`) ?? [];
      let piece = list.find((q) => q.routes.some((x) => mine.includes(x)) || (!mine.length && !q.routes.length));
      if (!piece) {
        piece = { kind: f.kind, cy: c.cy, cx: c.cx, routes: [], zooms: new Map(), rail: new Set(), tags: new Set(), x: 0, y: 0, n: 0, layer: f.layer };
        list.push(piece); byCell.set(`${f.kind}|${key}`, list); pieces.push(piece);
      }
      for (const x of mine) if (!piece.routes.includes(x)) piece.routes.push(x);
      const z = piece.zooms.get(f.zoom) ?? { m: 0, share: 0, apart: null, msg: f.msg };
      z.m += c.m; z.share = f.share ?? 0; z.apart = f.apartM ?? z.apart; z.msg = f.msg;
      piece.zooms.set(f.zoom, z);
      for (const r of f.rail ?? []) piece.rail.add(r);
      for (const t of f.tags ?? []) piece.tags.add(t);
      piece.x += c.sx; piece.y += c.sy; piece.n += c.n;
    }
  }
  // Neighbouring pieces with the same routes and zooms are one row.
  const zoomKey = (q) => [...q.zooms.keys()].sort((a, b) => a - b).join(',');
  const parent = pieces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const at = new Map();
  pieces.forEach((q, i) => { const k = `${q.kind}|${q.cy}:${q.cx}`; (at.get(k) ?? at.set(k, []).get(k)).push(i); });
  pieces.forEach((q, i) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of at.get(`${q.kind}|${q.cy + dy}:${q.cx + dx}`) ?? []) {
        const o = pieces[j];
        if (j <= i || zoomKey(o) !== zoomKey(q) || !o.routes.some((x) => q.routes.includes(x))) continue;
        parent[find(j)] = find(i);
      }
    }
  });
  const groups = new Map();
  pieces.forEach((q, i) => { const k = find(i); (groups.get(k) ?? groups.set(k, []).get(k)).push(q); });
  const rows = [];
  for (const members of groups.values()) {
    const zs = [...members[0].zooms.keys()].sort((a, b) => a - b);
    const routes = [...new Set(members.flatMap((q) => q.routes))];
    const lengths = {}, shares = {}, aparts = {};
    for (const z of zs) {
      lengths[z] = members.reduce((t, q) => t + q.zooms.get(z).m, 0);
      shares[z] = members.reduce((t, q) => t + q.zooms.get(z).share * q.zooms.get(z).m, 0) / (lengths[z] || 1);
      aparts[z] = members[0].zooms.get(z).apart;
    }
    // The place: the piece nearest the row's middle.
    const mx = members.reduce((t, q) => t + q.x, 0) / members.reduce((t, q) => t + q.n, 0);
    const my = members.reduce((t, q) => t + q.y, 0) / members.reduce((t, q) => t + q.n, 0);
    const mid = members.reduce((best, q) => {
      const d = metresBetween([q.x / q.n, q.y / q.n], [mx, my]);
      return d < best.d ? { d, q } : best;
    }, { d: Infinity, q: members[0] }).q;
    const top = zs.at(-1);
    rows.push({
      kind: members[0].kind, routes, route: routes.join(' '), lat: mid.y / mid.n, lon: mid.x / mid.n,
      zooms: zs, top, lengths, shares, aparts, lengthM: lengths[top], apartM: aparts[top], pieces: members.length,
      rail: [...new Set(members.flatMap((q) => [...q.rail]))], tags: [...new Set(members.flatMap((q) => [...q.tags]))], layer: members[0].layer,
      msg: mid.zooms.get(top).msg,
    });
  }
  for (const r of loners.values()) {
    r.zooms.sort((a, b) => a - b);
    r.rail = [...r.rail];
    r.route = r.routes.join(' ');
    rows.push(r);
  }
  return rows.sort((a, b) => a.kind.localeCompare(b.kind) || b.lengthM - a.lengthM);
}
