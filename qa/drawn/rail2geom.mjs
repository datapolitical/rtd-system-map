// Shared geometry for the second batch of rail detectors (rail2.mjs,
// rail2lines.mjs, rail2marks.mjs). Everything is in screen px at the zoom of
// the model passed in, y down. Nothing here names a route, a layer or a place.
//
// ends.mjs and packs.mjs keep their helpers private; the few that are needed
// again are written here, the same way (a mark's picture as a turned
// rectangle, a point's distance outside it, how deep two such rectangles
// overlap, a grid of segments).

import { quadOf } from './ends.mjs';
import { toLonLat } from './mercator.mjs';

export const DEG = 180 / Math.PI;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const norm = (a) => Math.hypot(a[0], a[1]);
export const unit = (a) => { const l = norm(a) || 1; return [a[0] / l, a[1] / l]; };
export const dist = (a, b) => norm(sub(a, b));
export const round1 = (v) => Math.round(v * 10) / 10;
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
export const routesOf = (v) => String(v ?? '').split(/\s+/).filter(Boolean);
export const isCasing = (layer) => /-(casing|edge|outline)$/.test(layer);

// The angle between two directions, 0 to 180 degrees.
export const angleBetween = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(unit(u), unit(v))))) * DEG;
// The angle between two lines, 0 to 90 degrees (a half turn is no turn).
export const lineAngle = (u, v) => Math.acos(Math.min(1, Math.abs(dot(unit(u), unit(v))))) * DEG;

// Ground metres per screen px at world y.
export const metresPerPx = (y, z) => (40075016.686 * Math.cos((toLonLat([0, y], z)[1] * Math.PI) / 180)) / (512 * 2 ** z);

// The distance from p to segment a-b, the nearest point and its parameter.
export function segDist(p, a, b) {
  const d = sub(b, a), l2 = dot(d, d);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  const q = [a[0] + d[0] * t, a[1] + d[1] * t];
  return { d: dist(p, q), q, t };
}

// The shortest distance between two segments (0 when they cross).
export function segSegDist(a, b, c, d) {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(segDist(a, c, d).d, segDist(b, c, d).d, segDist(c, a, b).d, segDist(d, a, b).d);
}

// Do segments a-b and c-d cross at a point strictly inside both?
export function segmentsCross(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return false;
  const w = sub(c, a);
  const t = cross(w, s) / den, u = cross(w, r) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

// Where segments a-b and c-d cross, or null.
export function crossAt(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(c, a);
  const t = cross(w, s) / den, u = cross(w, r) / den;
  if (!(t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9)) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

// A grid of segments, to ask what is near a point. A segment carries whatever
// else the caller wants with it (`hw`, the half width it is drawn at, widens
// its cells).
export class Grid {
  constructor(cell = 64) { this.cell = cell; this.g = new Map(); }
  add(s, pad = s.hw ?? 0) {
    const c = this.cell;
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - pad) / c), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + pad) / c);
    const y0 = Math.floor((Math.min(s.a[1], s.b[1]) - pad) / c), y1 = Math.floor((Math.max(s.a[1], s.b[1]) + pad) / c);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 2500) return;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      let cell2 = this.g.get(k);
      if (!cell2) this.g.set(k, (cell2 = []));
      cell2.push(s);
    }
  }
  near(p, reach = 0) {
    const c = this.cell;
    const out = new Set();
    for (let x = Math.floor((p[0] - reach) / c); x <= Math.floor((p[0] + reach) / c); x++) {
      for (let y = Math.floor((p[1] - reach) / c); y <= Math.floor((p[1] + reach) / c); y++) for (const s of this.g.get(`${x},${y}`) ?? []) out.add(s);
    }
    return [...out];
  }
  cells() { return this.g.values(); }
}

// --- marks as drawn ---------------------------------------------------------

// A mark's picture is its drawing plus a 1 px margin all round (symbols.js
// adds 2 to the width and height), scaled with the mark. What a rider sees is
// the picture less that margin.
export function visibleQuad(m) {
  const q = m.quad ?? quadOf(m);
  const k = m.size > 0 ? m.size : 1;
  return shrinkQuad(q, k);
}

export function shrinkQuad(q, d) {
  const hl = Math.max(0, q.hl - d), ht = Math.max(0, q.ht - d);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [q.c[0] + sx * hl * q.u[0] + sy * ht * q.v[0], q.c[1] + sx * hl * q.u[1] + sy * ht * q.v[1]]);
  return { ...q, hl, ht, corners };
}

// A point's px outside a quad (0 inside it).
export function outsideQuad(q, p) {
  const d = sub(p, q.c);
  const a = Math.abs(dot(d, q.u)) - q.hl, b = Math.abs(dot(d, q.v)) - q.ht;
  return Math.hypot(Math.max(a, 0), Math.max(b, 0));
}

// How deep two quads overlap (0 when they do not): the least overlap of their
// shadows on the four axes.
export function overlapDepth(p, q) {
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

// A mark with no direction: as long as it is wide.
export const isRound = (m) => Math.abs(m.w - m.h) <= 0.02 * Math.max(m.w, m.h);

// A finding in the shape the other detectors use.
export const fault = (kind, layer, route, px, msg, extra = {}) => ({ kind, layer, route, px: [round1(px[0]), round1(px[1])], msg, ...extra });
export const at = (px) => `${px[0].toFixed(0)},${px[1].toFixed(0)}`;

// Point in a ring (even-odd).
export function inRing(p, ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Px from p to a ring (0 inside it).
export function ringDist(p, ring) {
  if (inRing(p, ring)) return 0;
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) best = Math.min(best, segDist(p, ring[i - 1], ring[i]).d);
  return best;
}

// One finding for each pair seen from both of its lines at one place: keep
// the strongest (by `score`) of those within `reachPx` of each other with the
// same `pair`.
export function oncePerPair(list, reachPx) {
  const kept = [];
  for (const f of [...list].sort((a, b) => Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0))) {
    if (kept.some((k) => k.pair === f.pair && Math.hypot(k.px[0] - f.px[0], k.px[1] - f.px[1]) < reachPx)) continue;
    kept.push(f);
  }
  return kept;
}

// One finding for a place however many ways it was reached: findings of one
// kind within `reachPx` of each other are one, the strongest kept.
export function onePerPlace(list, reachPx) {
  const kept = [];
  for (const f of [...list].sort((a, b) => Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0))) {
    if (kept.some((k) => k.kind === f.kind && Math.hypot(k.px[0] - f.px[0], k.px[1] - f.px[1]) < reachPx)) continue;
    kept.push(f);
  }
  return kept;
}

// Runs of consecutive samples along a chain where `test` holds for a key (a
// partner route, say). `test(sample)` returns a Map or array of
// [key, value]; a value carries `score`. A run is closed when its key is
// missing from a sample, or the samples are further apart than 1.5 strides.
export function runsOf(swept, test, { minRun, stride }) {
  const found = [];
  for (const { ch, samples } of swept) {
    const open = new Map();
    const close = (k) => {
      const r = open.get(k);
      open.delete(k);
      if (r && r.to - r.from >= minRun) found.push(r);
    };
    for (const s of samples) {
      const hits = new Map();
      for (const [key, value] of test(s)) hits.set(key, value);
      for (const k of [...open.keys()]) if (!hits.has(k) || s.c - open.get(k).to > stride * 1.5) close(k);
      for (const [key, value] of hits) {
        const r = open.get(key);
        if (!r) open.set(key, { ch, route: ch.route, key, from: s.c, to: s.c, worst: value, sample: s });
        else {
          r.to = s.c;
          if (Math.abs(value.score) > Math.abs(r.worst.score)) { r.worst = value; r.sample = s; }
        }
      }
    }
    for (const k of [...open.keys()]) close(k);
  }
  return found;
}
