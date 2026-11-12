// Rail lines and shared track, the rules that had no check after the first
// batch (qa/rules/design-invariants.md sections 1 and 2; literature.md
// sections 1 to 5), on the drawn model. Every distance is a screen px at the
// zoom of the model passed in, except where a rule is about the ground.
//
//  RL01, LN-10   stop-off-line     a rail platform stop (RTD's own survey point
//                                  for where trains stop) further from every
//                                  drawn line of its routes than `stopOff` m.
//  RL05          spike             a path that doubles back at one vertex.
//  RL06          end-hook          a free rail end whose last stretch bends
//                                  away from the line it ends.
//  RL08          join-step         two pieces of a line that meet with their
//                                  slots more than 1/16 of a pitch apart,
//                                  outside a mark and away from another line's
//                                  end.
//  ST01, PL-01,
//  PL-15         overlap           two lines on one stretch drawn on top of
//                                  each other, on one track or on two.
//  PL-02, PL-04  gaps-unequal      the two gaps beside a line of a pack differ
//                                  by more than half a px (edge to edge).
//  PL-12         bundle-off-centre a pack not centred on its track.
//  PL-17         bead              a pack's make-up changes twice in less than
//                                  the pack's own width.
//  PL-09, PL-18  separated         two lines side by side, then a third comes
//                                  between them.
//  LE-02         end-inside        a line ends between two lines that run on.
//  PL-06, PL-07,
//  PL-08         crossing, crossing-in-mark, hidden-separation
//  LN-08         width-classes     two rail widths nearer than 1.6 px.
//  JN-02         narrow-branch     two lines part at a tiny angle.
//  JN-04         near-touch        strokes of unrelated lines 0 to 1.2 px apart
//                                  at a point, not side by side.
//  PL-14         corner-pinch      the inner line of a pack folds on itself at
//                                  a bend.
//
// A rail line is whatever the model marks `mode: 'rail'` (packs.mjs'
// `railChains`); a station mark is any icon that lists lines (ends.mjs). The
// numbers are in RAIL2 with the reason beside each; how each was set is in
// the commit that added it.

import { internals, PACK_LIMITS, railChains } from './packs.mjs';
import { freeEnds, railPieces, stationMarks } from './ends.mjs';
import { toWorld } from './mercator.mjs';
import {
  DEG, Grid, angleBetween, at, crossAt, dist, fault, isCasing, lineAngle, median, metresPerPx, norm, onePerPlace, oncePerPair, outsideQuad,
  round1, routesOf, runsOf, segDist, segSegDist, sub, unit, visibleQuad,
} from './rail2geom.mjs';

export const RAIL2 = {
  // RL01: a platform stop is this far (metres) from every drawn line of its
  // routes at most. RTD's stops stand on the platform, a few metres from the
  // track; the live build's median is 5 m and its tail is 10 to 20 m before
  // two stations at 50 to 80 m.
  stopOff: 30,
  // RL05: a vertex that turns the path back more than this (degrees), between
  // two segments each this long (px) and at least half a line width.
  spikeTurn: 120, spikeArm: 2,
  // RL06: a free end whose last `hookLen` px (or `hookWidths` line widths) turn
  // more than `hookTurn` degrees away from the stretch before.
  // The stretch is also capped at `hookM` metres of ground and not judged under
  // `hookMinPx` px: at zoom 10 twenty px is 1.5 km of track, and a curve in the
  // track there is geography, not a hook.
  hookTurn: 25, hookLen: 20, hookWidths: 4, hookMinPart: 12, hookM: 100, hookMinPx: 8,
  // RL08: slots of joined pieces differ by at most this share of a pitch;
  // nearM: a step beside the end of another line (drift's job) is left alone.
  stepShare: 1 / 16, stepNearM: 150,
  // ST01: strokes overlap when their edges overlap by more than this (px) over
  // `overlapWidths` line widths of track.
  overlap: 0.5, overlapWidths: 2,
  // PL-02: the two gaps beside a line differ by more than max(gapDiff px,
  // gapShare of the median gap), over `gapRunWidths` line widths.
  gapDiff: 0.5, gapShare: 0.15, gapRunWidths: 3, gapPlace: 0.3,
  // PL-12: a pack's mean offset from its track.
  centre: 0.5, bundleM: 8,
  // PL-17, PL-09, LE-02: a make-up must hold for `persist` samples to count.
  persist: 3, keepSlots: 2,
  // PL-06 to PL-08: a crossing at less than `shallow` degrees is two lines
  // running together that change sides; `scatterPx`: crossings of one pair
  // nearer than this are one scattered crossing.
  shallow: 30, scatterPx: 600,
  // LN-08: rail widths drawn at least this far apart (px) or the same.
  classGap: 1.6,
  // ST03: the gap between neighbouring slots at every zoom (RAIL_GAP, sizes.js).
  railGap: 2, railGapTol: 0.25,
  // JN-02: the smallest angle (degrees) between two lines that part.
  branch: 15, branchM: 100, branchMin: 40,
  // JN-04: strokes pass nearer than this (px) without crossing, at more than
  // `touchAngle` degrees (side by side is `sliver`'s).
  touch: 1.2, touchMin: 0.25, touchAngle: 20,
  // PL-14: the inner line of a pack turns back by more than this (degrees) at
  // a bend whose base does not.
  pinchTurn: 100,
};

// --- the context every rule reads ---------------------------------------------

/**
 * What the rules share at one zoom: packs.mjs' chains and, when asked for,
 * its sweep (every rail line sampled every few px with the lines beside it).
 */
export function contextOf(zoom, opts = {}) {
  const limits = { ...PACK_LIMITS, ...(opts.packs ?? {}) };
  const lim = { ...RAIL2, ...(opts.limits ?? {}) };
  const ctx = internals.prepare(zoom, limits);
  let swept = null;
  const pieces = railPieces(zoom);
  const ends = freeEnds(pieces);
  const marks = stationMarks(zoom).filter((m) => m.drawn);
  const c = {
    zoom, z: zoom.z, ctx, limits, lim, pieces, ends, marks,
    pitch: ctx.pitch, mpp: ctx.mpp,
    packPx: limits.packM / ctx.mpp,
    steadyPx: limits.steadyM / ctx.mpp,
    stroke: ctx.stroke,
    sweep() { return (swept ??= ctx.chains.length ? internals.sweep(ctx) : []); },
  };
  c.vquads = marks.map((m) => ({ m, q: visibleQuad(m) }));
  c.underMark = (p, pad = 1) => c.vquads.some(({ q }) => outsideQuad(q, p) <= pad);
  return c;
}

const inPack = (c, n) => Math.abs(n.apart) <= c.packPx;

// --- RL01: platform stops ------------------------------------------------------

/**
 * Rail platform stops further than `stopOff` m from every drawn line of the
 * routes that call there. `stops` is the build's stops collection (model.data.stops).
 */
export function stopsOffLine(c, { stops } = {}) {
  const out = [];
  if (!stops?.features?.length) return out;
  const grids = new Map();
  for (const ch of c.ctx.chains) {
    if (!grids.has(ch.route)) grids.set(ch.route, new Grid(128));
    for (const q of ch.pieces) for (let i = 1; i < q.base.length; i++) grids.get(ch.route).add({ a: q.base[i - 1], b: q.base[i] }, 0);
  }
  for (const f of stops.features) {
    if (f.properties?.platform !== 1) continue;
    const routes = routesOf(f.properties.lines ?? f.properties.routes).filter((r) => grids.has(r));
    if (!routes.length) continue;
    const p = toWorld(f.geometry.coordinates, c.z);
    const mpp = metresPerPx(p[1], c.z);
    const reach = (c.lim.stopOff * 3) / mpp;
    let best = Infinity, via = null;
    for (const r of routes) {
      for (const s of grids.get(r).near(p, reach)) {
        const d = segDist(p, s.a, s.b).d;
        if (d < best) { best = d; via = r; }
      }
      if (best === Infinity) best = reach * 2; // none near enough to be found
    }
    const metres = best * mpp;
    if (metres <= c.lim.stopOff) continue;
    out.push(fault('stop-off-line', 'rail', routes.join(' '), p, `${f.properties.name ?? 'a platform stop'} is ${metres.toFixed(0)} m from the nearest drawn line of ${routes.join(' ')}${via ? ` (${via})` : ''} (${c.lim.stopOff} m allowed): the line is not on the track the stop is beside`, { metres, stop: f.properties.id }));
  }
  return out;
}

// --- RL05: spikes --------------------------------------------------------------

export function spikes(c) {
  const { spikeTurn, spikeArm } = c.lim;
  const out = [];
  for (const ch of c.ctx.chains) {
    const pts = ch.base;
    const width = median(ch.pieces.map((q) => q.width)) || 1;
    const arm = Math.max(spikeArm, width / 2);
    for (let i = 1; i < pts.length - 1; i++) {
      const u = sub(pts[i], pts[i - 1]), v = sub(pts[i + 1], pts[i]);
      if (norm(u) < arm || norm(v) < arm) continue;
      const turn = angleBetween(u, v);
      if (turn < spikeTurn) continue;
      out.push(fault('spike', 'rail', ch.route, pts[i], `spike on rail ${ch.route} at ${at(pts[i])}: the path turns back ${turn.toFixed(0)} degrees at one vertex, arms of ${norm(u).toFixed(0)} and ${norm(v).toFixed(0)} px`, { value: turn }));
    }
  }
  return out;
}

// --- RL06: hooks at a rail end -------------------------------------------------

// The run of points from a free end back along its part.
function backRun(c, e) {
  for (const l of c.pieces) {
    for (const part of l.drawn) {
      if (part.length < 2) continue;
      if (part.at(-1) === e.E) return [...part].reverse();
      if (part[0] === e.E) return part;
    }
  }
  return null;
}

function pointAlong(run, s) {
  let walked = 0;
  for (let i = 1; i < run.length; i++) {
    const l = dist(run[i], run[i - 1]);
    if (walked + l >= s && l > 0) {
      const t = (s - walked) / l;
      return [run[i - 1][0] + (run[i][0] - run[i - 1][0]) * t, run[i - 1][1] + (run[i][1] - run[i - 1][1]) * t];
    }
    walked += l;
  }
  return run.at(-1);
}
const lengthOf = (run) => run.reduce((s, p, i) => s + (i ? dist(p, run[i - 1]) : 0), 0);

export function endHooks(c) {
  const { hookTurn, hookLen, hookWidths, hookMinPart, hookM, hookMinPx } = c.lim;
  const out = [];
  for (const e of c.ends) {
    const run = backRun(c, e);
    if (!run) continue;
    const total = lengthOf(run);
    if (total < hookMinPart) continue;
    const D = Math.min(total, Math.max(hookLen, hookWidths * e.width), hookM / c.mpp);
    if (D < hookMinPx) continue;
    const w = Math.min(6, D / 3);
    const near = unit(sub(pointAlong(run, 0), pointAlong(run, w)));
    const far = unit(sub(pointAlong(run, D - w), pointAlong(run, D)));
    const turn = angleBetween(near, far);
    if (turn <= hookTurn) continue;
    out.push(fault('end-hook', e.layer, e.route, e.E, `${e.route} on ${e.layer} ends bent: its last ${D.toFixed(0)} px turn ${turn.toFixed(0)} degrees away from the line before (${hookTurn} allowed)`, { value: turn }));
  }
  return out;
}

// --- RL08: steps where pieces join ---------------------------------------------

export function joinSteps(c) {
  const { stepShare, stepNearM } = c.lim;
  const out = [];
  const near = (p, route) => c.ends.some((e) => e.route !== route && dist(e.E, p) * c.mpp <= stepNearM);
  for (const ch of c.ctx.chains) {
    for (let k = 0; k + 1 < ch.pieces.length; k++) {
      const a = ch.pieces[k], b = ch.pieces[k + 1];
      const d = Math.abs(b.off - a.off);
      if (d <= stepShare * c.pitch + 1e-6) continue;
      const p = b.base[0];
      if (c.underMark(p) || near(p, ch.route)) continue;
      out.push(fault('join-step', 'rail', ch.route, p, `join-step on rail ${ch.route} at ${at(p)}: two pieces meet with their offsets ${d.toFixed(2)} px apart (a pitch is ${c.pitch.toFixed(1)} px; ${(stepShare * c.pitch).toFixed(2)} allowed), away from any station mark and any other line's end`, { value: d }));
    }
  }
  return out;
}

// --- ST01, PL-01, PL-15: lines on top of each other ----------------------------

export function overlaps(c) {
  const { overlap, overlapWidths } = c.lim;
  const test = (s) => s.nbrs.flatMap((n) => {
    const gap = Math.abs(n.lat) - (s.width + n.width) / 2;
    return gap < -overlap ? [[n.route, { score: -gap, gap, n }]] : [];
  });
  const found = runsOf(c.sweep(), test, { minRun: Math.max(6, overlapWidths * c.stroke), stride: c.limits.stride }).map((r) => {
    const { n, gap } = r.worst;
    const sep = n.apart * c.mpp;
    const track = Math.abs(n.apart) <= c.packPx ? 'on one track' : `on two tracks ${Math.abs(sep).toFixed(0)} m apart`;
    return {
      ...fault('overlap', 'rail', r.route, r.sample.p, `overlap on rail ${r.route}/${r.key} at ${at(r.sample.p)}: the strokes overlap by ${(-gap).toFixed(1)} px, ${track}, over ${(r.to - r.from).toFixed(0)} px`, { with: r.key, value: -gap }),
      pair: [r.route, r.key].sort().join('|'),
      score: -gap,
    };
  });
  return oncePerPair(found, 24).map(({ pair, score, ...f }) => f);
}

// --- PL-02, PL-04: the gaps beside a line ---------------------------------------

export function gapsUnequal(c) {
  const { gapDiff, gapShare, gapRunWidths, gapPlace } = c.lim;
  const { steadyPx } = c;
  const test = (s) => {
    if (s.steady < steadyPx) return [];
    let left = null, right = null;
    for (const n of s.nbrs) {
      if (!inPack(c, n) || n.steady < steadyPx) continue;
      if (n.lat < 0) left = n;
      else if (!right) right = n;
    }
    // adjacent means the nearest on each side, in pack
    const nearest = (side) => s.nbrs.filter((n) => (side < 0 ? n.lat < 0 : n.lat > 0)).sort((a, b) => Math.abs(a.lat) - Math.abs(b.lat))[0];
    if (!left || !right || nearest(-1) !== left || nearest(1) !== right) return [];
    const gl = Math.abs(left.lat) - (s.width + left.width) / 2, gr = Math.abs(right.lat) - (s.width + right.width) / 2;
    const diff = Math.abs(gl - gr);
    const tol = Math.max(gapDiff, gapShare * median([gl, gr]));
    if (diff <= tol) return [];
    // What the slots and widths say the two gaps are, and what is left over: the
    // part of the difference that is the lines' placement, not their weights.
    const el = Math.abs(left.off - s.off) - (s.width + left.width) / 2, er = Math.abs(right.off - s.off) - (s.width + right.width) / 2;
    const place = Math.abs((gl - gr) - (el - er));
    if (place < gapPlace) return [];
    return [[`${left.route}|${right.route}`, { score: diff, gl, gr, left, right, place, byWidth: Math.abs(el - er) }]];
  };
  const found = runsOf(c.sweep(), test, { minRun: Math.max(8, gapRunWidths * c.stroke), stride: c.limits.stride }).map((r) => {
    const { gl, gr, left, right, place, byWidth } = r.worst;
    return {
      ...fault('gaps-unequal', 'rail', r.route, r.sample.p, `gaps-unequal on rail ${r.route} at ${at(r.sample.p)}: ${r.route} has ${gl.toFixed(1)} px of land between its edge and ${left.route} on one side and ${gr.toFixed(1)} px to ${right.route} on the other, over ${(r.to - r.from).toFixed(0)} px (${place.toFixed(1)} px of the difference is placement, ${byWidth.toFixed(1)} px the lines' widths)`, { value: Math.abs(gl - gr), place }),
      pair: [r.route, left.route, right.route].sort().join('|'),
      score: Math.abs(gl - gr),
    };
  });
  return oncePerPair(found, 24).map(({ pair, score, ...f }) => f);
}

// --- PL-12: the pack sits on its track -----------------------------------------

export function bundleOffCentre(c) {
  const { centre, bundleM } = c.lim;
  const { steadyPx } = c;
  const bundlePx = bundleM / c.mpp;
  const test = (s) => {
    if (s.steady < steadyPx) return [];
    const mates = s.nbrs.filter((n) => Math.abs(n.apart) <= bundlePx && n.steady >= steadyPx);
    if (!mates.length) return [];
    const offs = [s.off, ...mates.map((n) => n.off)];
    // A line still easing is neither at a slot nor a member yet.
    if (offs.some((o) => Math.abs(o / (c.pitch / 2) - Math.round(o / (c.pitch / 2))) > 0.08)) return [];
    const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
    if (Math.abs(mean) <= centre) return [];
    const routes = [s.route, ...mates.map((n) => n.route)];
    return [[routes.join(' '), { score: Math.abs(mean), mean, routes, n: offs.length }]];
  };
  const swept = c.sweep().map(({ ch, samples }) => ({ ch, samples: samples.map((s) => ({ ...s, route: ch.route })) }));
  const found = runsOf(swept, test, { minRun: Math.max(8, 3 * c.stroke), stride: c.limits.stride }).map((r) => {
    const { mean, n } = r.worst;
    const names = r.worst.routes.filter(Boolean);
    return {
      ...fault('bundle-off-centre', 'rail', names.join(' '), r.sample.p, `bundle-off-centre at ${at(r.sample.p)}: the ${n} lines ${names.join(' ')} are drawn ${Math.abs(mean).toFixed(1)} px ${mean > 0 ? 'right' : 'left'} of the track they share, over ${(r.to - r.from).toFixed(0)} px`, { value: Math.abs(mean) }),
      pair: [...names].sort().join('|'),
      score: Math.abs(mean),
    };
  });
  return oncePerPair(found, 24).map(({ pair, score, ...f }) => f);
}

// --- make-up of a pack along a line: beads, separations, interior ends ------------

// The samples of each chain cut into stretches of one make-up: the lines in
// pack beside it (`set`, sorted) and which of them are next to it (`adj`).
// Stretches shorter than `persist` samples are folded into the one before, so
// a neighbour that flickers where its own pieces join is no change.
function stretchesOf(c) {
  const { persist } = c.lim;
  const out = [];
  for (const { ch, samples } of c.sweep()) {
    const raw = samples.map((s) => {
      const mates = s.nbrs.filter((n) => inPack(c, n));
      let left = null, right = null;
      for (const n of mates) {
        if (n.lat < 0) left = n;
        else if (!right) right = n;
      }
      return { s, set: mates.map((n) => n.route).sort().join(' '), adj: [left?.route, right?.route].filter(Boolean).sort().join(' '), mates };
    });
    const runs = [];
    for (const r of raw) {
      const last = runs.at(-1);
      if (last && last.set === r.set && last.adj === r.adj) { last.to = r; last.n++; } else runs.push({ set: r.set, adj: r.adj, from: r, to: r, n: 1 });
    }
    // Fold short runs into their neighbours.
    const kept = [];
    for (const r of runs) {
      if (r.n < persist && kept.length) { kept.at(-1).to = r.to; kept.at(-1).n += r.n; continue; }
      const last = kept.at(-1);
      if (last && last.set === r.set && last.adj === r.adj) { last.to = r.to; last.n += r.n; } else kept.push({ ...r });
    }
    out.push({ ch, kept });
  }
  return out;
}

/** PL-17: a pack's make-up changes twice in less than the pack is wide. */
export function beads(c, stretches = stretchesOf(c)) {
  const out = [];
  for (const { ch, kept } of stretches) {
    for (let i = 1; i + 1 < kept.length; i++) {
      const a = kept[i - 1], b = kept[i], d = kept[i + 1];
      if (a.set === d.set) { /* out and back */ }
      const length = b.to.s.c - b.from.s.c + c.limits.stride;
      const size = Math.max(a.set ? a.set.split(' ').length : 0, b.set ? b.set.split(' ').length : 0, d.set ? d.set.split(' ').length : 0) + 1;
      const width = size * c.pitch;
      if (length >= width) continue;
      // Only a change that is a line joining or leaving the pack, not the same lines in another order.
      if (a.set === b.set && b.set === d.set) continue;
      const p = b.from.s.p;
      out.push({
        ...fault('bead', 'rail', ch.route, p, `bead on rail ${ch.route} at ${at(p)}: the pack beside ${ch.route} is (${a.set || 'alone'}), then (${b.set || 'alone'}) for ${length.toFixed(0)} px, then (${d.set || 'alone'}); a pack of ${size} lines is ${width.toFixed(0)} px wide`, { value: width / length }),
        score: width / length,
      });
    }
  }
  return onePerPlace(out, 30).map(({ score, ...f }) => f);
}

/** PL-09, PL-18, PL-07: two lines side by side, then another between them. */
export function separations(c, stretches = stretchesOf(c)) {
  const out = [];
  for (const { ch, kept } of stretches) {
    for (let i = 1; i < kept.length; i++) {
      const a = kept[i - 1], b = kept[i];
      const was = a.adj ? a.adj.split(' ') : [];
      const set = b.set ? b.set.split(' ') : [];
      const now = b.adj ? b.adj.split(' ') : [];
      for (const y of was) {
        if (!set.includes(y) || now.includes(y)) continue;
        // The line between them: a mate of the stretch lying between X and Y.
        const sy = b.from.mates.find((n) => n.route === y);
        if (!sy) continue;
        const between = b.from.mates.filter((n) => n !== sy && Math.sign(n.lat) === Math.sign(sy.lat) && Math.abs(n.lat) < Math.abs(sy.lat)).map((n) => n.route);
        if (!between.length) continue;
        const p = b.from.s.p;
        const hidden = c.underMark(p, 2);
        out.push({
          ...fault(hidden ? 'hidden-separation' : 'separated', 'rail', ch.route, p, `${hidden ? 'hidden-separation' : 'separated'} on rail ${ch.route}/${y} at ${at(p)}: side by side, then ${between.join(' ')} comes between them${hidden ? ', under a station mark' : ''}`, { with: y, between }),
          pair: [ch.route, y].sort().join('|'),
          score: 1,
        });
      }
    }
  }
  return oncePerPair(out, 40).map(({ pair, score, ...f }) => f);
}

/** LE-02: a line ends between two lines that run on. */
export function interiorEnds(c) {
  const out = [];
  const grids = new Map();
  for (const ch of c.ctx.chains) {
    if (!grids.has(ch.route)) grids.set(ch.route, new Grid(64));
    for (const q of ch.pieces) for (let i = 1; i < q.drawn.length; i++) grids.get(ch.route).add({ a: q.drawn[i - 1], b: q.drawn[i] }, 0);
  }
  const ahead = Math.max(2 * c.pitch, 8);
  const swept = c.sweep();
  const byRoute = new Map();
  for (const { ch, samples } of swept) {
    if (!byRoute.has(ch.route)) byRoute.set(ch.route, []);
    byRoute.get(ch.route).push(...samples);
  }
  for (const e of c.ends) {
    const list = byRoute.get(e.route) ?? [];
    let best = null;
    for (const s of list) {
      const d = dist(s.p, e.E);
      if (d <= c.limits.stride * 2 && (!best || d < best.d)) best = { s, d };
    }
    if (!best) continue;
    const mates = best.s.nbrs.filter((n) => inPack(c, n));
    // Which of them run on past this end: a line of theirs lies ahead of the end.
    const runsOn = (n) => {
      const probe = [n.at[0] + e.out[0] * ahead, n.at[1] + e.out[1] * ahead];
      return (grids.get(n.route)?.near(probe, c.pitch) ?? []).some((s) => segDist(probe, s.a, s.b).d <= c.pitch * 0.6);
    };
    const going = mates.filter(runsOn);
    const left = going.filter((n) => n.lat < 0), right = going.filter((n) => n.lat > 0);
    if (!left.length || !right.length) continue;
    out.push(fault('end-inside', e.layer, e.route, e.E, `${e.route} on ${e.layer} ends between ${left.map((n) => n.route).join(' ')} on one side and ${right.map((n) => n.route).join(' ')} on the other, which run on past it: a line that ends should take the outside place`, { left: left.map((n) => n.route), right: right.map((n) => n.route) }));
  }
  return out;
}

// --- crossings -------------------------------------------------------------------

// Every place two rail lines of different routes cross, as drawn.
export function crossingsOf(c) {
  const grid = new Grid(64);
  for (const ch of c.ctx.chains) {
    ch.pieces.forEach((q, qi) => {
      for (let i = 1; i < q.drawn.length; i++) grid.add({ a: q.drawn[i - 1], b: q.drawn[i], route: ch.route, id: `${ch.id}:${qi}:${i}` }, 0);
    });
  }
  const seen = new Set();
  const out = [];
  for (const cell of grid.cells()) {
    for (let i = 0; i < cell.length; i++) {
      for (let j = i + 1; j < cell.length; j++) {
        const s = cell[i], t = cell[j];
        if (s.route === t.route) continue;
        const key = s.id < t.id ? `${s.id}|${t.id}` : `${t.id}|${s.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const p = crossAt(s.a, s.b, t.a, t.b);
        if (!p) continue;
        out.push({ p, routes: [s.route, t.route], angle: lineAngle(sub(s.b, s.a), sub(t.b, t.a)) });
      }
    }
  }
  return out;
}

/** PL-06, PL-07, PL-08: crossings. */
export function crossings(c, list = crossingsOf(c)) {
  const { shallow, scatterPx } = c.lim;
  const out = [];
  // Lines that run together and change sides (a shallow crossing) are the ones
  // a rider sees as a swap; a rail crossing another at a large angle is a
  // junction of tracks.
  const sh = list.filter((x) => x.angle < shallow);
  for (const x of list) {
    if (c.underMark(x.p, 1)) {
      out.push(fault('crossing-in-mark', 'rail', x.routes.join(' '), x.p, `crossing-in-mark at ${at(x.p)}: ${x.routes.join(' and ')} cross at ${x.angle.toFixed(0)} degrees under a station mark, where a rider cannot follow them`, { angle: x.angle }));
    }
  }
  for (const x of sh) {
    if (c.underMark(x.p, 1)) continue;
    const mates = sh.filter((y) => y !== x && y.routes.join('|') === x.routes.join('|') && dist(y.p, x.p) <= scatterPx);
    const scattered = mates.length ? ` (${mates.length + 1} crossings of the pair within ${scatterPx} px: scattered, not one block)` : '';
    out.push(fault('crossing', 'rail', x.routes.join(' '), x.p, `crossing at ${at(x.p)}: ${x.routes.join(' and ')} cross at ${x.angle.toFixed(0)} degrees outside any station mark${scattered}`, { angle: x.angle, scattered: mates.length > 0 }));
  }
  return onePerPlace(out.map((f) => ({ ...f, score: 1 })), 12).map(({ score, ...f }) => f);
}

// --- ST03: the gap between slots is the same width at every zoom ----------------------

/**
 * The gap between two neighbouring slots (a slot's pitch less the widest rail
 * width drawn) against DESIGN.md's `railGap` px. It is the same few px at every
 * zoom by design (`RAIL_GAP`, sizes.js), so a line at one zoom with another is
 * a fault in the offsets or widths the page computes.
 */
export function slotGap(c) {
  const { railGap, railGapTol } = c.lim;
  const widths = [];
  let at0 = null;
  for (const ch of c.ctx.chains) for (const q of ch.pieces) { widths.push(q.width); at0 ??= q.base[0]; }
  if (!widths.length || !c.pitch) return [];
  const gap = c.pitch - Math.max(...widths);
  if (Math.abs(gap - railGap) <= railGapTol) return [];
  return [fault('gap-by-zoom', 'rail', null, at0, `at zoom ${c.z} a slot is ${c.pitch.toFixed(2)} px and the widest rail ${Math.max(...widths).toFixed(2)} px, so lines side by side have ${gap.toFixed(2)} px between them; the gap is ${railGap} px at every other zoom`, { value: gap })];
}

// --- LN-08: widths ----------------------------------------------------------------

/** Rail widths drawn at this zoom that are different but less than `classGap` px apart. */
export function widthClasses(c) {
  const widths = new Map();
  for (const ch of c.ctx.chains) {
    for (const q of ch.pieces) {
      const w = Math.round(q.width * 100) / 100;
      if (!widths.has(w)) widths.set(w, { w, route: ch.route, p: q.base[0], n: 0 });
      widths.get(w).n++;
    }
  }
  const list = [...widths.values()].sort((a, b) => a.w - b.w);
  const out = [];
  for (let i = 1; i < list.length; i++) {
    const gap = list[i].w - list[i - 1].w;
    if (gap >= c.lim.classGap) continue;
    const thin = list[i - 1], wide = list[i];
    out.push(fault('width-classes', 'rail', `${thin.route} ${wide.route}`, thin.p, `width-classes: rail is drawn ${thin.w} px (${thin.n} pieces, ${thin.route}) and ${wide.w} px (${wide.n} pieces, ${wide.route}), ${gap.toFixed(2)} px apart; two weights meant to differ need ${c.lim.classGap} px`, { value: gap }));
  }
  return out;
}

// --- JN-02: the angle two lines part at ------------------------------------------

// A chain's base as an arc-length table, and the points on it.
function baseTable(ch) {
  if (ch._table) return ch._table;
  const pts = ch.base, arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + dist(pts[i], pts[i - 1]));
  return (ch._table = { pts, arc, length: arc.at(-1) });
}
// The nearest point of a chain's base to p: its arc length and the direction there.
function locate(ch, p) {
  const { pts, arc } = baseTable(ch);
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const r = segDist(p, pts[i - 1], pts[i]);
    if (!best || r.d < best.d) best = { d: r.d, s: arc[i - 1] + r.t * (arc[i] - arc[i - 1]), i, q: r.q };
  }
  if (!best) return null;
  const dir = unit(sub(pts[best.i], pts[best.i - 1]));
  return { ...best, dir };
}
// The point `s` along a chain's base (null outside it).
function pointOn(ch, s) {
  const { pts, arc, length } = baseTable(ch);
  if (s < 0 || s > length) return null;
  for (let i = 1; i < pts.length; i++) {
    if (arc[i] >= s) {
      const l = arc[i] - arc[i - 1];
      const t = l ? (s - arc[i - 1]) / l : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
  }
  return pts.at(-1);
}

/**
 * Two lines side by side that part: the angle between their bases over the
 * next `branchM` metres of ground, at the end of each stretch they share (and at
 * its start, walking the other way). Reported under `branch` degrees. The
 * angle is the ground's, not the zoom's, so the same junction is judged the
 * same at every zoom.
 */
export function narrowBranches(c) {
  const { branch, branchM, branchMin } = c.lim;
  const out = [];
  const { packPx } = c;
  const L = branchM / c.mpp;
  const stretch = Math.max(8, 3 * c.stroke);
  for (const { ch, samples } of c.sweep()) {
    const open = new Map();
    const judge = (route, run, forward) => {
      const i = forward ? run.last : run.first;
      if (forward ? i >= samples.length - 1 : i <= 0) return;
      if (run.stretch < stretch) return;
      const s = samples[i], n = run.n;
      const mine = locate(ch, s.p);
      const other = locate(n.ch, n.at);
      if (!mine || !other) return;
      const sgn = forward ? 1 : -1;
      const xEnd = pointOn(ch, mine.s + sgn * L);
      if (!xEnd) return;
      const ysgn = dist(unit(sub(xEnd, mine.q)), other.dir) > 1.2 ? -1 : 1;
      const yEnd = pointOn(n.ch, other.s + ysgn * L);
      if (!yEnd) return;
      // They must really have parted by then.
      if (dist(xEnd, yEnd) * c.mpp < 2 * c.limits.packM) return;
      const deg = angleBetween(sub(xEnd, mine.q), sub(yEnd, other.q));
      if (deg >= branch) return;
      out.push({ ...fault('narrow-branch', 'rail', ch.route, s.p, `narrow-branch at ${at(s.p)}: ${ch.route} and ${route} part at ${deg.toFixed(1)} degrees, ${(dist(xEnd, yEnd) * c.mpp).toFixed(0)} m apart after ${branchM} m (${branch} wanted)`, { with: route, value: deg }), pair: [ch.route, route].sort().join('|'), score: branch - deg });
    };
    samples.forEach((s, i) => {
      const here = new Map(s.nbrs.filter((n) => Math.abs(n.apart) <= packPx).map((n) => [n.route, n]));
      for (const [route, n] of here) {
        const run = open.get(route);
        if (!run) {
          open.set(route, { first: i, last: i, n, start: s.c, stretch: 0 });
          continue;
        }
        run.last = i; run.n = n; run.stretch = s.c - run.start;
      }
      for (const [route, run] of [...open]) {
        if (here.has(route)) continue;
        open.delete(route);
        judge(route, run, true);
        judge(route, run, false);
      }
    });
  }
  return oncePerPair(out, 40).map(({ pair, score, ...f }) => f);
}

// --- JN-04: unrelated lines near each other ---------------------------------------

export function nearTouches(c) {
  const { touch, touchMin, touchAngle } = c.lim;
  const grid = new Grid(64);
  for (const ch of c.ctx.chains) {
    ch.pieces.forEach((q, qi) => {
      for (let i = 1; i < q.drawn.length; i++) grid.add({ a: q.drawn[i - 1], b: q.drawn[i], route: ch.route, hw: q.width / 2, id: `${ch.id}:${qi}:${i}` }, q.width / 2 + touch);
    });
  }
  const seen = new Set();
  const out = [];
  for (const cell of grid.cells()) {
    for (let i = 0; i < cell.length; i++) {
      for (let j = i + 1; j < cell.length; j++) {
        const s = cell[i], t = cell[j];
        if (s.route === t.route) continue;
        const key = s.id < t.id ? `${s.id}|${t.id}` : `${t.id}|${s.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const d = segSegDist(s.a, s.b, t.a, t.b);
        const gap = d - s.hw - t.hw;
        if (gap < touchMin || gap >= touch) continue;
        const ang = lineAngle(sub(s.b, s.a), sub(t.b, t.a));
        if (ang < touchAngle) continue;
        const mid = [(s.a[0] + s.b[0] + t.a[0] + t.b[0]) / 4, (s.a[1] + s.b[1] + t.a[1] + t.b[1]) / 4];
        out.push({ ...fault('near-touch', 'rail', `${s.route} ${t.route}`, mid, `near-touch at ${at(mid)}: ${s.route} and ${t.route} pass ${gap.toFixed(2)} px apart (edge to edge) at ${ang.toFixed(0)} degrees, not side by side and not touching`, { value: gap }), pair: [s.route, t.route].sort().join('|'), score: touch - gap });
      }
    }
  }
  return oncePerPair(out, 20).map(({ pair, score, ...f }) => f);
}

// --- PL-14: the inner line of a bend ------------------------------------------------

export function cornerPinches(c) {
  const { pinchTurn } = c.lim;
  const out = [];
  for (const ch of c.ctx.chains) {
    const baseTurns = [];
    const pts = ch.base;
    for (let i = 1; i < pts.length - 1; i++) baseTurns.push({ p: pts[i], turn: angleBetween(sub(pts[i], pts[i - 1]), sub(pts[i + 1], pts[i])) });
    const maxBase = (p, r) => Math.max(0, ...baseTurns.filter((t) => dist(t.p, p) <= r).map((t) => t.turn));
    ch.pieces.forEach((q) => {
      const d = q.drawn;
      for (let i = 1; i < d.length - 1; i++) {
        const u = sub(d[i], d[i - 1]), v = sub(d[i + 1], d[i]);
        if (norm(u) < 0.5 || norm(v) < 0.5) continue;
        const turn = angleBetween(u, v);
        if (turn < pinchTurn) continue;
        const reach = Math.abs(q.off) + q.width + 2;
        if (maxBase(d[i], reach) >= turn - 20) continue;
        out.push({ ...fault('corner-pinch', 'rail', ch.route, d[i], `corner-pinch on rail ${ch.route} at ${at(d[i])}: drawn ${Math.abs(q.off).toFixed(1)} px to the side of its track, the line turns back ${turn.toFixed(0)} degrees where the track itself turns ${maxBase(d[i], reach).toFixed(0)}: the inner line folds on itself`, { value: turn }), score: turn });
      }
    });
  }
  return onePerPlace(out, 12).map(({ score, ...f }) => f);
}

// --- all of it ------------------------------------------------------------------------

export const LINE_KINDS = [
  'stop-off-line', 'spike', 'end-hook', 'join-step', 'overlap', 'gaps-unequal', 'bundle-off-centre', 'bead', 'separated', 'hidden-separation',
  'end-inside', 'crossing', 'crossing-in-mark', 'gap-by-zoom', 'width-classes', 'narrow-branch', 'near-touch', 'corner-pinch',
];

/**
 * Every rule of this file at one zoom.
 * @param {{z:number, lines:Array, marks?:Array}} zoom model.zoom(z)
 * @param {{data?:object, limits?:object, packs?:object, kinds?:string[]}} opts `data`: model.data (the stops)
 */
export function lineFaults2(zoom, opts = {}) {
  const want = new Set(opts.kinds ?? LINE_KINDS);
  const has = (...k) => k.some((x) => want.has(x));
  const c = contextOf(zoom, opts);
  const out = [];
  if (!c.ctx.chains.length) return out;
  if (has('stop-off-line')) out.push(...stopsOffLine(c, { stops: opts.data?.stops }));
  if (has('spike')) out.push(...spikes(c));
  if (has('end-hook')) out.push(...endHooks(c));
  if (has('join-step')) out.push(...joinSteps(c));
  if (has('overlap')) out.push(...overlaps(c));
  if (has('gaps-unequal')) out.push(...gapsUnequal(c));
  if (has('bundle-off-centre')) out.push(...bundleOffCentre(c));
  if (has('bead', 'separated', 'hidden-separation')) {
    const st = stretchesOf(c);
    if (has('bead')) out.push(...beads(c, st));
    if (has('separated', 'hidden-separation')) out.push(...separations(c, st));
  }
  if (has('end-inside')) out.push(...interiorEnds(c));
  if (has('crossing', 'crossing-in-mark')) out.push(...crossings(c));
  if (has('gap-by-zoom')) out.push(...slotGap(c));
  if (has('width-classes')) out.push(...widthClasses(c));
  if (has('narrow-branch')) out.push(...narrowBranches(c));
  if (has('near-touch')) out.push(...nearTouches(c));
  if (has('corner-pinch')) out.push(...cornerPinches(c));
  return out.filter((f) => want.has(f.kind)).map((f) => ({ ...f, px: [round1(f.px[0]), round1(f.px[1])] }));
}

export { railChains, isCasing };
