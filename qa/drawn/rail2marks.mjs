// Station marks, platform groups, walks and station shapes: the rules that
// had no check after the first batch (qa/rules/design-invariants.md sections
// 3 to 5; literature.md section 4), on the drawn model. Distances are screen
// px at the zoom of the model passed in.
//
//  SM02          tick-parting        a tick across several lines where they do
//                                    not stay the same distance apart.
//                dot-for-pack        a dot where the lines of the station run
//                                    together (a lead).
//  SM03, ST-07   marks-collide, marks-crowded   marks of two stations that
//                                    overlap, or nearer than the longer mark
//                                    plus 4 px (ticks only).
//  SM04          hub-ring            the hub's ring missing, turned, the wrong
//                                    size, or another ring.
//  SM05          mark-size, mark-scale   a picture not the size DESIGN.md states,
//                                    or not drawn at the lines' pitch.
//  SM05, SM01    mark-fade           a station with no mark at the zoom its
//                                    mark is due.
//  SM06          unserved-mark       a returning or closed station's ring or
//                                    name before z13, or only one of them.
//  SM10          mark-off-building   a station's mark away from its building.
//  SM11          facility-covers-station
//  PG03, ST-08,
//  LN-01         mark-off-line       a mark not on any line it serves.
//  ST-03         mark-off-centre     a mark not centred across its lines.
//  ST-04         mark-wide, mark-covers-other, mark-clips-end
//  ST-05         mark-class          marks of one kind in different sizes.
//  ST-09         mark-far-from-stop  a station's mark far from where trains stop.
//  PG04          walk-dots, walk-end  the walk's dots the wrong size, spacing, or
//                                    not ending at the marks.
//  ST-02         walk-oblique        the walk not square to the marks.
//  PG05          name-on-walk        a station name over the walk or a group
//                                    mark, or named twice.
//  LN-03, LN-06  bent-through-station    a line that bends across a station mark.
//  SS05          structure-style     the station shapes' layers: outline, zoom,
//                                    order.
//
// A mark is whatever ends.mjs' `stationMarks` returns: an icon of the page's
// station or platform sources that lists lines. DESIGN.md's own numbers are
// the defaults in MARKS2 and SIZES, each with its line; a caller that has the
// page's sizes.js passes them as `opts.sizes`.

import { DRAWN, freeEnds, railPieces, stationMarks } from './ends.mjs';
import { placeLabels } from './labels.mjs';
import { railChains } from './packs.mjs';
import { toWorld } from './mercator.mjs';
import {
  DEG, Grid, angleBetween, at, dist, fault, isRound, lineAngle, metresPerPx, norm, outsideQuad, overlapDepth, ringDist, round1, routesOf,
  segDist, sub, unit, visibleQuad,
} from './rail2geom.mjs';

// What DESIGN.md says (the "Stations" section), as numbers.
export const SIZES = {
  hubFrom: 9.75,        // the hub has a ring from here
  hubFade: 0.15,        // and is fully there this much later
  capsuleFrom: 10.25,   // a tick crossfades into the capsule between these
  capsuleTo: 11,
  unservedFrom: 13,     // hollow ring and gray name, both from here
  tickAcross: 10,       // a tick's size across the track, before scaling (a dot: 8)
  dotSize: 8,
  hubExtra: 12,         // the ring is the lines' extent plus this
  spacing: 11,          // a line and its gap at the widest zoom
  capsuleAcross: 13,    // a capsule's thickness before scaling (the widest line plus 4)
  walkWidth: [[10, 1.4], [13, 2], [16, 2.6]], // the walk's dots at these zooms
  walkPeriod: [2.0, 2.5],  // "a little over two dots apart", in dot widths
  structureFrom: 14.2, buildingFrom: 13,
};

export const MARKS2 = {
  // PG03, ST-08: a mark's drawn picture lies within this many px of a stroke of a line it serves.
  offLine: 1, reach: 40,
  // ST-04: the mark reaches this far (px) beyond the outer lines at most; a
  // line sticks out of its mark by more than `clip`; a line of a route the
  // station does not serve lies under the mark deeper than `cover`.
  overhang: 3, clip: 1, cover: 1,
  // ST-03: the mark's middle and the lines' middle differ by at most this.
  centre: 1,
  // SM02: lines spanned by a tick stay the same distance apart within this.
  tickDrift: 1, dotDrift: 0.5,
  // SM03, ST-07
  collide: 0.5, crowd: 4,
  // SM05
  sizeTol: 0.1, scaleTol: 0.15,
  // SM10: a station's mark is within this many metres of its building.
  buildingM: 80,
  // SM11
  facility: 1,
  // PG04, ST-02
  walkWidthTol: 0.15, walkEnd: 1.5, walkSquare: 5,
  // ST-09: the mark and the nearest rail platform stop of its station, metres.
  stopM: 150,
  // LN-03, LN-06: the line's turn across the mark and a lead-in of one mark
  // thickness each side (degrees); judged only when that stretch is at least
  // `bendMinPx` px and is capped at `bendM` metres of ground.
  bend: 5, bendMinPx: 6, bendM: 75,
  // The gray of a returning or closed station: red, green and blue within this.
  gray: 0.14,
};

// --- the context --------------------------------------------------------------

const parseColor = (s) => {
  if (typeof s !== 'string') return null;
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m) return [1, 2, 3].map((i) => parseInt(m[i] + m[i], 16)).concat(1);
  m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i);
  if (m) {
    const k = m[0].includes('%') ? 2.55 : 1;
    return [Number(m[1]) * k, Number(m[2]) * k, Number(m[3]) * k, m[4] == null ? 1 : Number(m[4])];
  }
  return null;
};

const spanOf = (m) => Number(String(m.image).split('-')[1]) || 1;
const isRing = (m) => /^hub-/.test(m.image);
const isTick = (m) => /^dot-/.test(m.image);
const isCapsule = (m) => /^station-/.test(m.image);
const isGroup = (m) => m.source === 'platforms';

/** What the mark rules share at one zoom. */
export function contextOf(zoom, opts = {}) {
  const sizes = { ...SIZES, ...(opts.sizes ?? {}) };
  const lim = { ...MARKS2, ...(opts.limits ?? {}) };
  const pieces = railPieces(zoom);
  const ends = freeEnds(pieces);
  const all = stationMarks(zoom);
  const marks = all.filter((m) => m.drawn).map((m) => ({ ...m, vq: visibleQuad(m) }));
  const byRoute = new Map();
  const everything = new Grid(64);
  for (const l of pieces) {
    const hw = (l.drawnWidth ?? l.width ?? 0) / 2;
    const r = String(l.route);
    if (!byRoute.has(r)) byRoute.set(r, new Grid(64));
    for (const part of l.drawn) {
      for (let i = 1; i < part.length; i++) {
        const s = { a: part[i - 1], b: part[i], hw, route: r };
        byRoute.get(r).add(s);
        everything.add(s);
      }
    }
  }
  const pitch = (() => {
    const xs = (zoom.lines ?? []).filter((l) => l.layer === 'rail' && l.slot && l.offset).map((l) => Math.abs(l.offset / l.slot));
    return xs.length ? xs.sort((a, b) => a - b)[xs.length >> 1] : 0;
  })();
  return { zoom, z: zoom.z, sizes, lim, pieces, ends, all, marks, byRoute, everything, pitch, mppAt: (y) => metresPerPx(y, zoom.z) };
}

// The distance (px) from a quad to a segment: the least over the segment of a
// point's distance outside the quad, which is convex along it.
function segQuadDist(q, a, b) {
  const f = (t) => outsideQuad(q, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2; else lo = m1;
  }
  return f((lo + hi) / 2);
}

// Where a route's drawn line passes a mark: the point of the line nearest the
// quad's middle among those within the mark's thickness (the line runs
// through the mark, not past it).
function lineAt(c, q, route, window) {
  const grid = c.byRoute.get(route);
  if (!grid) return null;
  let best = null;
  for (const s of grid.near(q.c, window)) {
    const r = segDist(q.c, s.a, s.b);
    if (r.d > window) continue;
    const rel = sub(r.q, q.c);
    const along = rel[0] * q.v[0] + rel[1] * q.v[1];
    if (Math.abs(along) > q.ht + s.hw) continue;
    if (!best || r.d < best.d) best = { d: r.d, rel, hw: s.hw, at: r.q, route, across: rel[0] * q.u[0] + rel[1] * q.u[1], dir: unit(sub(s.b, s.a)) };
  }
  if (best) best.ending = c.ends.some((e) => e.route === route && dist(e.E, best.at) < 1);
  return best;
}

const describe = (m) => `${m.layer} of ${m.name}`;

// One mark per station and place: a tick and a capsule that crossfade are one mark.
function distinct(marks) {
  const out = [];
  for (const m of marks) {
    const same = out.find((o) => o.source === m.source && String(o.properties?.id) === String(m.properties?.id) && isRing(o) === isRing(m) && dist(o.at, m.at) < 1);
    if (!same) { out.push(m); continue; }
    if (m.vq.hl * m.vq.ht > same.vq.hl * same.vq.ht) out[out.indexOf(same)] = m;
  }
  return out;
}

// --- PG03, ST-08, LN-01: a mark is on its line ------------------------------------

export function markOffLine(c) {
  const { offLine, reach } = c.lim;
  const out = [];
  for (const m of distinct(c.marks.filter((x) => !isRing(x)))) {
    const q = m.vq;
    let best = Infinity, via = null;
    for (const route of m.routes) {
      const grid = c.byRoute.get(route);
      if (!grid) continue;
      for (const s of grid.near(q.c, q.hl + q.ht + reach)) {
        const d = segQuadDist(q, s.a, s.b) - s.hw;
        if (d < best) { best = d; via = route; }
      }
    }
    if (best <= offLine) continue;
    const what = Number.isFinite(best) ? `${best.toFixed(1)} px from the nearest stroke of ${via}` : `no line of ${m.routes.join(' ')} drawn near it`;
    out.push(fault('mark-off-line', m.layer, m.routes.join(' '), m.at, `the ${describe(m)} is ${what}: it stands in the air, not on a line it serves (${offLine} px allowed)`, { value: Number.isFinite(best) ? best : reach }));
  }
  return out;
}

// --- ST-03, ST-04: the mark spans its lines --------------------------------------

function crossLines(c, m) {
  const q = m.vq;
  const window = q.hl + 10;
  return m.routes.map((r) => lineAt(c, q, r, window)).filter((x) => x && x.d <= window);
}

export function markSpans(c) {
  const { overhang, clip, cover, centre } = c.lim;
  const out = [];
  for (const m of distinct(c.marks.filter((x) => !isRing(x)))) {
    const q = m.vq;
    const found = crossLines(c, m);
    if (found.length) {
      const lo = Math.min(...found.map((x) => x.across - x.hw)), hi = Math.max(...found.map((x) => x.across + x.hw));
      const left = lo + q.hl, right = q.hl - hi;
      const wide = Math.max(left, right);
      if (wide > overhang) {
        out.push(fault('mark-wide', m.layer, found.map((x) => x.route).join(' '), m.at, `the ${describe(m)} reaches ${wide.toFixed(1)} px past ${left > right ? 'the first' : 'the last'} line it spans (${found.map((x) => x.route).join(' ')}; ${overhang} px allowed): it covers ground with no line of the station on it`, { value: wide }));
      }
      const mid = (lo + hi) / 2;
      if (Math.abs(mid) > centre && found.length > 0) {
        out.push(fault('mark-off-centre', m.layer, found.map((x) => x.route).join(' '), m.at, `the ${describe(m)} is ${Math.abs(mid).toFixed(1)} px off the middle of its lines (${found.map((x) => x.route).join(' ')}; ${centre} px allowed): ${left < right ? 'it is short on one side' : 'it is long on one side'}`, { value: Math.abs(mid) }));
      }
      // A line that ends here and sticks out of the mark's side.
      const clipped = found.filter((x) => x.ending && Math.abs(x.across) + x.hw > q.hl + clip);
      if (clipped.length) {
        const worst = clipped.reduce((a, b) => (Math.abs(b.across) + b.hw > Math.abs(a.across) + a.hw ? b : a));
        out.push(fault('mark-clips-end', m.layer, clipped.map((x) => x.route).join(' '), m.at, `${clipped.map((x) => x.route).join(' ')} end${clipped.length === 1 ? 's' : ''} at the ${describe(m)} but ${(Math.abs(worst.across) + worst.hw - q.hl).toFixed(1)} px of ${worst.route}'s stroke stick${clipped.length === 1 ? 's' : ''} out past the side of the mark (${clip} px allowed)`, { value: Math.abs(worst.across) + worst.hw - q.hl }));
      }
    }
    // A line of a route the station does not serve, under the mark.
    const covered = new Map();
    for (const s of c.everything.near(q.c, q.hl + q.ht + 20)) {
      if (m.routes.includes(s.route)) continue;
      const depth = s.hw - segQuadDist(q, s.a, s.b);
      if (depth > cover && depth > (covered.get(s.route) ?? 0)) covered.set(s.route, depth);
    }
    if (covered.size) {
      out.push(fault('mark-covers-other', m.layer, [...covered.keys()].join(' '), m.at, `the ${describe(m)} (lines ${m.routes.join(' ')}) lies over ${[...covered].map(([r, d]) => `${r} by ${d.toFixed(1)} px`).join(', ')}: a line that does not stop here runs under it`, { value: Math.max(...covered.values()) }));
    }
  }
  return out;
}

// --- SM03, ST-07: marks apart ------------------------------------------------------

export function marksApart(c) {
  const { collide, crowd } = c.lim;
  const list = distinct(c.marks);
  const grid = new Map();
  const cell = (p) => `${Math.floor(p[0] / 96)},${Math.floor(p[1] / 96)}`;
  list.forEach((m, i) => {
    const k = cell(m.at);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const out = [];
  const seen = new Set();
  list.forEach((a, i) => {
    const cx = Math.floor(a.at[0] / 96), cy = Math.floor(a.at[1] / 96);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (j <= i) continue;
        const b = list[j];
        const ida = a.properties?.id, idb = b.properties?.id;
        // The same station's marks are SM09's (ends.mjs).
        if (ida != null && String(ida) === String(idb)) continue;
        const key = `${i}|${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const depth = overlapDepth(a.vq, b.vq);
        const mid = [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2];
        const names = `${describe(a)} and the ${describe(b)}`;
        if (depth > collide) {
          out.push(fault('marks-collide', a.layer, null, mid, `the ${names} overlap by ${depth.toFixed(1)} px`, { value: depth }));
          continue;
        }
        if (c.z < c.sizes.capsuleTo) {
          const longer = Math.max(2 * a.vq.hl, 2 * a.vq.ht, 2 * b.vq.hl, 2 * b.vq.ht);
          const d = dist(a.at, b.at);
          if (d < longer + crowd) out.push(fault('marks-crowded', a.layer, null, mid, `the ${names} are ${d.toFixed(1)} px apart, nearer than the longer mark (${longer.toFixed(1)} px) plus ${crowd}`, { value: longer + crowd - d }));
        }
      }
    }
  });
  return out;
}

// --- SM02: a tick spans lines only where they stay apart alike ----------------------

// The lateral place of each route's line across the track at a point of it.
function lateralAt(c, m, s) {
  const q = m.vq;
  const P = [q.c[0] + q.v[0] * s, q.c[1] + q.v[1] * s];
  const window = q.hl + 10;
  const out = [];
  for (const route of m.routes) {
    const grid = c.byRoute.get(route);
    if (!grid) continue;
    let best = null;
    for (const g of grid.near(P, window)) {
      const r = segDist(P, g.a, g.b);
      if (r.d > window) continue;
      const rel = sub(r.q, P);
      if (Math.abs(rel[0] * q.v[0] + rel[1] * q.v[1]) > 3 + g.hw) continue;
      if (!best || r.d < best.d) best = { d: r.d, route, a: rel[0] * q.u[0] + rel[1] * q.u[1] };
    }
    if (best && Math.abs(best.a - 0) <= q.hl + 12) out.push(best);
  }
  return out.sort((x, y) => x.a - y.a);
}

function partingOf(c, m) {
  const q = m.vq;
  const L = 2 * q.hl;
  const mid = lateralAt(c, m, 0);
  if (mid.length < 2) return null;
  let worst = { drift: 0, s: 0 };
  for (const s of [-L, L]) {
    const there = lateralAt(c, m, s);
    for (let k = 0; k + 1 < mid.length; k++) {
      const a = there.find((x) => x.route === mid[k].route), b = there.find((x) => x.route === mid[k + 1].route);
      if (!a || !b) continue;
      const drift = Math.abs((b.a - a.a) - (mid[k + 1].a - mid[k].a));
      if (drift > worst.drift) worst = { drift, s, pair: [mid[k].route, mid[k + 1].route] };
    }
  }
  return { ...worst, lines: mid.length };
}

export function ticks(c) {
  const { tickDrift, dotDrift } = c.lim;
  const out = [];
  if (c.z >= c.sizes.capsuleTo) return out;
  for (const m of distinct(c.marks.filter((x) => isTick(x) && !isGroup(x)))) {
    const span = spanOf(m);
    const p = partingOf(c, m);
    if (!p) continue;
    if (span > 1 && p.drift > tickDrift) {
      out.push(fault('tick-parting', m.layer, p.pair.join(' '), m.at, `the ${describe(m)} is a tick across ${span} lines, but ${p.pair.join(' and ')} are ${p.drift.toFixed(1)} px closer or further apart ${(Math.abs(p.s) * c.mppAt(m.at[1])).toFixed(0)} m along the track (${tickDrift} px allowed): where lines part the station is a dot`, { value: p.drift }));
    } else if (span === 1 && m.routes.length > 1 && p.lines > 1 && p.drift <= dotDrift && !m.properties?.meet) {
      out.push(fault('dot-for-pack', m.layer, m.routes.join(' '), m.at, `the ${describe(m)} is a dot, but its lines ${m.routes.join(' ')} stay the same distance apart (within ${p.drift.toFixed(1)} px) along its length: a tick across them was due (lead)`, { value: p.drift, lead: true }));
    }
  }
  return out;
}

// --- SM04: the hub's ring --------------------------------------------------------------

const stationsOf = (c) => {
  const seen = new Map();
  for (const m of c.all) {
    if (m.source !== 'stations') continue;
    const id = String(m.properties?.id);
    if (!seen.has(id)) seen.set(id, m);
  }
  return seen;
};

export function hubRings(c) {
  const { hubFrom, hubFade, capsuleTo, capsuleFrom } = c.sizes;
  const out = [];
  const stations = stationsOf(c);
  const rings = c.all.filter((m) => m.source === 'stations' && isRing(m));
  const should = c.z >= hubFrom + hubFade + 0.05 && c.z <= capsuleFrom + (capsuleTo - capsuleFrom) / 3;
  for (const [id, st] of stations) {
    if (!st.properties?.meet || st.properties?.served === false) continue;
    const mine = rings.filter((m) => String(m.properties?.id) === id);
    const drawn = mine.find((m) => m.drawn);
    if (should && !drawn) {
      out.push(fault('hub-ring', mine[0]?.layer ?? st.layer, st.routes.join(' '), st.at, `the hub ${st.name} has no ring at zoom ${c.z}${mine.length ? ` (it is a ghost at ${mine[0].opacity.toFixed(2)})` : ''}: DESIGN.md has it from ${hubFrom} until the capsule takes over`));
      continue;
    }
    if (!drawn) continue;
    if (drawn.rot % 360 !== 0) out.push(fault('hub-ring', drawn.layer, st.routes.join(' '), drawn.at, `the ring of ${st.name} is turned ${drawn.rot} degrees; lines leave the hub every way, so it is not turned`));
    // Its size: the lines' extent plus hubExtra of the widest zoom, scaled with the lines.
    const k = drawn.size, span = spanOf(drawn);
    const want = ((span - 1) * c.sizes.spacing + c.sizes.hubExtra) * k;
    const have = 2 * visibleQuad(drawn).hl;
    if (Math.abs(have - want) > c.lim.sizeTol + 0.02 * want) out.push(fault('hub-ring', drawn.layer, st.routes.join(' '), drawn.at, `the ring of ${st.name} is ${have.toFixed(1)} px across; ${span} lines and ${c.sizes.hubExtra} px make ${want.toFixed(1)}`));
  }
  // Nothing else is a ring that size.
  for (const m of rings) {
    if (!m.properties?.meet && m.drawn) out.push(fault('hub-ring', m.layer, m.routes.join(' '), m.at, `${m.name} is drawn with the hub's ring, but is not where the most lines meet`));
  }
  return out;
}

// --- SM05: sizes, scale and fade ---------------------------------------------------------

export function markSizes(c) {
  const { sizeTol, scaleTol } = c.lim;
  const { spacing, tickAcross, dotSize, hubExtra, capsuleAcross } = c.sizes;
  const out = [];
  const seen = new Set();
  for (const m of c.marks) {
    const img = m.boxSize > 0 ? { w: m.w / m.boxSize, h: m.h / m.boxSize } : null;
    if (!img) continue;
    const n = spanOf(m);
    let want;
    if (isTick(m)) { const d = n > 1 ? tickAcross : dotSize; want = [(n - 1) * spacing + d + 2, d + 2]; }
    else if (isCapsule(m)) want = [(n - 1) * spacing + capsuleAcross + 2, capsuleAcross + 2];
    else if (isRing(m)) want = [(n - 1) * spacing + hubExtra + 2, (n - 1) * spacing + hubExtra + 2];
    else continue;
    if (seen.has(m.image)) continue;
    seen.add(m.image);
    if (Math.abs(img.w - want[0]) > sizeTol || Math.abs(img.h - want[1]) > sizeTol) {
      out.push(fault('mark-size', m.layer, m.routes.join(' '), m.at, `the picture ${m.image} is ${img.w.toFixed(1)} x ${img.h.toFixed(1)} px; DESIGN.md's sizes make it ${want[0]} x ${want[1]} (spacing ${spacing}, ${isTick(m) ? `tick ${tickAcross} / dot ${dotSize}` : isCapsule(m) ? `capsule ${capsuleAcross}` : `ring ${hubExtra}`})`));
    }
  }
  // Drawn at the lines' pitch.
  if (c.pitch) {
    for (const m of distinct(c.marks.filter((x) => !isGroup(x) || true))) {
      if (isRing(m)) continue;
      const want = c.pitch / spacing;
      if (Math.abs(m.size - want) * spacing > scaleTol) {
        out.push(fault('mark-scale', m.layer, m.routes.join(' '), m.at, `the ${describe(m)} is drawn at ${m.size.toFixed(3)} of its size, so its lines are ${(m.size * spacing).toFixed(2)} px apart; the rail lines are ${c.pitch.toFixed(2)} px apart`, { value: Math.abs(m.size * spacing - c.pitch) }));
        break;
      }
    }
  }
  return out;
}

export function markFades(c) {
  const { capsuleFrom, capsuleTo } = c.sizes;
  const out = [];
  const byStation = new Map();
  for (const m of c.all) {
    if (m.source !== 'stations' || isRing(m)) continue;
    const id = String(m.properties?.id);
    if (!byStation.has(id)) byStation.set(id, []);
    byStation.get(id).push(m);
  }
  for (const [id, marks] of byStation) {
    const first = marks[0];
    if (first.properties?.served === false) continue;
    const from = first.properties?.tickFrom ?? 0;
    const dot = marks.filter(isTick).reduce((s, m) => Math.max(s, m.opacity), 0);
    const cap = marks.filter(isCapsule).reduce((s, m) => Math.max(s, m.opacity), 0);
    // Waiting for a stronger station nearby (the build's `tickFrom`, in quarters).
    const waiting = c.z < from + 0.25 && c.z >= 9;
    if (waiting) continue;
    if (c.z >= capsuleTo + 0.25 && cap < 0.95) out.push(fault('mark-fade', first.layer, first.routes.join(' '), first.at, `${first.name} has its capsule at ${cap.toFixed(2)} of full at zoom ${c.z}; DESIGN.md has every served station a capsule from ${capsuleTo}`));
    else if (c.z > capsuleFrom && c.z < capsuleTo && dot + cap < 0.9) out.push(fault('mark-fade', first.layer, first.routes.join(' '), first.at, `${first.name} is a tick at ${dot.toFixed(2)} and a capsule at ${cap.toFixed(2)} at zoom ${c.z}: the crossfade dips instead of adding to one mark`));
    else if (c.z >= 9.5 && c.z <= capsuleFrom && dot < 0.95 && !(first.properties?.meet && c.z >= c.sizes.hubFrom)) out.push(fault('mark-fade', first.layer, first.routes.join(' '), first.at, `${first.name} has its tick at ${dot.toFixed(2)} of full at zoom ${c.z}, though no stronger station is near (waits until ${from})`));
  }
  return out;
}

/** ST-05: marks of one picture are one size; longer pictures for more lines. */
export function markClasses(c) {
  const out = [];
  const bySpan = new Map();
  for (const m of distinct(c.marks.filter((x) => isCapsule(x)))) {
    const k = m.image;
    if (!bySpan.has(k)) bySpan.set(k, []);
    bySpan.get(k).push(m);
  }
  for (const [image, list] of bySpan) {
    const w = list.map((m) => 2 * m.vq.hl), h = list.map((m) => 2 * m.vq.ht);
    const dw = Math.max(...w) - Math.min(...w), dh = Math.max(...h) - Math.min(...h);
    if (dw > 0.5 || dh > 0.5) out.push(fault('mark-class', list[0].layer, null, list[0].at, `${list.length} marks of ${image} are drawn in different sizes at zoom ${c.z}: ${dw.toFixed(1)} px in length, ${dh.toFixed(1)} in thickness (0.5 allowed)`, { value: Math.max(dw, dh) }));
  }
  const spans = [...bySpan].map(([image, l]) => ({ n: spanOf(l[0]), len: 2 * l[0].vq.hl })).sort((a, b) => a.n - b.n);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].n > spans[i - 1].n && spans[i].len <= spans[i - 1].len) out.push(fault('mark-class', 'stations', null, [0, 0], `a mark for ${spans[i].n} lines is no longer than one for ${spans[i - 1].n}`));
  }
  return out;
}

// --- SM06: returning and closed stations --------------------------------------------------

export function unservedMarks(c, { stations } = {}) {
  const { unservedFrom } = c.sizes;
  const { gray } = c.lim;
  const out = [];
  const rings = (c.zoom.marks ?? []).filter((m) => m.layer === 'stations-unserved' && m.kind === 'circle');
  const labels = (c.zoom.labels ?? []).filter((l) => l.layer === 'station-labels-unserved');
  const drawnRing = (m) => (m.opacity ?? 1) >= DRAWN;
  const drawnLabel = (l) => (l.opacity ?? 1) >= DRAWN;
  const isGray = (col) => {
    const v = parseColor(col);
    return !v || (Math.max(v[0], v[1], v[2]) - Math.min(v[0], v[1], v[2])) / 255 <= gray;
  };
  if (c.z < unservedFrom) {
    for (const m of rings.filter((r) => (r.opacity ?? 0) > 0.05)) out.push(fault('unserved-mark', m.layer, null, m.at, `the ring of ${m.properties?.label ?? m.properties?.name ?? 'a closed station'} is drawn (${m.opacity.toFixed(2)}) at zoom ${c.z}; DESIGN.md has it from ${unservedFrom}`));
    for (const l of labels.filter((x) => (x.opacity ?? 0) > 0.05)) out.push(fault('unserved-mark', l.layer, null, l.at, `the name of ${l.text} is drawn (${l.opacity.toFixed(2)}) at zoom ${c.z}; DESIGN.md has it from ${unservedFrom}`));
    return out;
  }
  const list = stations ?? [];
  for (const st of list) {
    const id = String(st.properties.id);
    const ring = rings.find((m) => String(m.properties?.id) === id);
    const label = labels.find((l) => String(l.properties?.id) === id);
    const p = st.px;
    if (!ring || !drawnRing(ring)) out.push(fault('unserved-mark', 'stations-unserved', null, p, `${st.properties.label ?? st.properties.name} (no service) has no ring at zoom ${c.z}; DESIGN.md has a hollow gray ring from ${unservedFrom}`));
    if (!label || !drawnLabel(label)) out.push(fault('unserved-mark', 'station-labels-unserved', null, p, `${st.properties.label ?? st.properties.name} (no service) has no name at zoom ${c.z}; ring and name arrive together`));
    if (ring && !isGray(ring.strokeColor)) out.push(fault('unserved-mark', ring.layer, null, p, `the ring of ${st.properties.label} is ${ring.strokeColor}, not gray`));
    if (label && !isGray(label.color)) out.push(fault('unserved-mark', label.layer, null, p, `the name of ${st.properties.label} is ${label.color}, not gray`));
    if (ring && (ring.color && (parseColor(ring.color)?.[3] ?? 1) >= 0.95)) out.push(fault('unserved-mark', ring.layer, null, p, `the ring of ${st.properties.label} is filled solid (${ring.color}), not hollow`));
  }
  return out;
}

// --- SM10, ST-09: a station's mark is where the station is --------------------------------

export function markOffBuilding(c, { data } = {}) {
  const out = [];
  const feats = data?.structures?.features ?? [];
  if (!feats.length) return out;
  const rings = new Map();
  for (const f of feats) {
    if (!['building', 'hall'].includes(f.properties?.kind)) continue;
    const id = String(f.properties.station ?? '');
    if (!id) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const poly of polys) {
      if (!rings.has(id)) rings.set(id, []);
      rings.get(id).push(poly[0].map((pt) => toWorld(pt, c.z)));
    }
  }
  for (const m of c.marks) {
    if (isGroup(m) || isRing(m) || !isCapsule(m)) continue;
    const list = rings.get(String(m.properties?.id));
    if (!list) continue;
    const mpp = c.mppAt(m.at[1]);
    const d = Math.min(...list.map((r) => ringDist(m.at, r))) * mpp;
    if (d <= c.lim.buildingM) continue;
    out.push(fault('mark-off-building', m.layer, m.routes.join(' '), m.at, `the ${describe(m)} stands ${d.toFixed(0)} m from its station building (${c.lim.buildingM} m allowed): DESIGN.md puts the mark, ring and name at the building`, { metres: d }));
  }
  return out;
}

export function markFarFromStop(c, { data } = {}) {
  const out = [];
  const stops = (data?.stops?.features ?? []).filter((f) => f.properties?.platform === 1);
  if (!stops.length) return out;
  for (const m of distinct(c.marks.filter((x) => !isRing(x)))) {
    const mine = stops.filter((f) => routesOf(f.properties.lines).some((r) => m.routes.includes(r)));
    if (!mine.length) continue;
    const mpp = c.mppAt(m.at[1]);
    let best = Infinity;
    for (const f of mine) best = Math.min(best, dist(m.at, toWorld(f.geometry.coordinates, c.z)) * mpp);
    if (best <= c.lim.stopM) continue;
    out.push(fault('mark-far-from-stop', m.layer, m.routes.join(' '), m.at, `the ${describe(m)} is ${best.toFixed(0)} m from the nearest rail platform stop of its lines (${c.lim.stopM} m allowed)`, { metres: best }));
  }
  return out;
}

// --- SM11: a Park-n-Ride sign covers a station -----------------------------------------------

export function facilitiesOnStations(c) {
  const out = [];
  const boxes = (c.zoom.marks ?? []).filter((m) => m.layer === 'facilities' && m.kind === 'icon' && m.opacity >= DRAWN);
  for (const f of boxes) {
    // The picture's own box, without the collision padding (2 px).
    const b = [f.box[0] + 2, f.box[1] + 2, f.box[2] - 2, f.box[3] - 2];
    for (const m of distinct(c.marks)) {
      const q = m.vq;
      const xs = q.corners.map((p) => p[0]), ys = q.corners.map((p) => p[1]);
      const ox = Math.min(b[2], Math.max(...xs)) - Math.max(b[0], Math.min(...xs)), oy = Math.min(b[3], Math.max(...ys)) - Math.max(b[1], Math.min(...ys));
      if (ox > c.lim.facility && oy > c.lim.facility) {
        out.push(fault('facility-covers-station', f.layer, null, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], `the ${f.image} sign of ${f.properties?.name ?? 'a facility'} overlaps the ${describe(m)} by ${ox.toFixed(1)} x ${oy.toFixed(1)} px`, { value: Math.min(ox, oy) }));
        break;
      }
    }
  }
  return out;
}

// --- PG04, ST-02, PG05: the walk -------------------------------------------------------------

const walkWidthAt = (z, table) => {
  if (z <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (z <= table[i][0]) {
      const [z0, w0] = table[i - 1], [z1, w1] = table[i];
      return w0 + ((w1 - w0) * (z - z0)) / (z1 - z0);
    }
  }
  return table.at(-1)[1];
};

function walksOf(c) {
  return (c.zoom.lines ?? []).filter((l) => l.source === 'platforms' && l.properties?.kind === 'join' && l.opacity > 0).map((l) => ({ line: l, part: (l.drawn ?? l.parts)[0] })).filter((w) => w.part && w.part.length >= 2);
}

export function walks(c) {
  const { walkWidth, walkPeriod } = c.sizes;
  const { walkWidthTol, walkEnd, walkSquare } = c.lim;
  const out = [];
  const ws = walksOf(c);
  const groupsDrawn = c.marks.filter((m) => isGroup(m) && !isRing(m));
  for (const { line, part } of ws) {
    const id = String(line.properties?.id);
    const p0 = part[0], p1 = part.at(-1);
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const want = walkWidthAt(c.z, walkWidth);
    if (Math.abs(line.width - want) > walkWidthTol) out.push(fault('walk-dots', line.layer, null, mid, `the walk of station ${id} is drawn in dots ${line.width.toFixed(2)} px across at zoom ${c.z}; DESIGN.md has ${want.toFixed(2)} (1.4 at 10, 2 at 13, 2.6 at 16)`, { value: Math.abs(line.width - want) }));
    const dash = line.dash;
    if (!Array.isArray(dash) || dash.length < 2) out.push(fault('walk-dots', line.layer, null, mid, `the walk of station ${id} is not a row of dots (no dash pattern): DESIGN.md has dots, not a hairline`));
    else {
      const period = dash[0] + dash[1];
      if (dash[0] > 0.2 || period < walkPeriod[0] || period > walkPeriod[1]) out.push(fault('walk-dots', line.layer, null, mid, `the walk of station ${id} has dots ${period.toFixed(2)} widths apart (dash ${dash.join(', ')}); DESIGN.md has a little over two (${walkPeriod.join(' to ')})`));
    }
    // It ends at the marks: the station's own mark at one end, the group's at the other.
    const own = c.marks.filter((m) => !isGroup(m) && String(m.properties?.id) === id);
    const grp = groupsDrawn.filter((m) => String(m.properties?.id) === id);
    const near = (p, list) => (list.length ? Math.min(...list.map((m) => dist(m.at, p))) : Infinity);
    const endA = Math.min(near(p0, own), near(p0, grp)), endB = Math.min(near(p1, own), near(p1, grp));
    for (const [p, d, which] of [[p0, endA, 'start'], [p1, endB, 'end']]) {
      if (d > walkEnd) out.push(fault('walk-end', line.layer, null, p, `the walk of station ${id} ${which}s ${Number.isFinite(d) ? `${d.toFixed(1)} px from` : 'with no drawn'} a mark of the station (${walkEnd} px allowed): it does not end at the marks`, { value: d }));
    }
    // Drawn only with the group mark it leads to.
    if (!grp.length) out.push(fault('walk-end', line.layer, null, p1, `the walk of station ${id} is drawn at zoom ${c.z} but the group mark it leads to is not`));
    // Square to the marks (ST-02).
    const dir = unit(sub(p1, p0));
    for (const m of [...own, ...grp]) {
      if (isRound(m) || isRing(m)) continue;
      const q = m.vq;
      const off = Math.abs(90 - lineAngle(dir, q.u));
      if (off > walkSquare) out.push(fault('walk-oblique', m.layer, null, m.at, `the walk of station ${id} meets the ${describe(m)} ${off.toFixed(1)} degrees off square (${walkSquare} allowed): the marks and the walk should be one straight line, each mark across it`, { value: off }));
    }
  }
  // A group mark drawn without its walk.
  for (const m of groupsDrawn) {
    const id = String(m.properties?.id);
    if (m.properties?.kind !== 'mark') continue;
    if (!ws.some((w) => String(w.line.properties?.id) === id)) out.push(fault('walk-end', m.layer, null, m.at, `the group mark of station ${id} is drawn at zoom ${c.z} without the walk that joins it to the station's own mark`));
  }
  return out;
}

/** PG05: no name over the walk or a group mark; one name per station. */
export function walkNames(c) {
  const out = [];
  const ws = walksOf(c);
  if (!ws.length) return out;
  const near = (box, reach) => ws.some(({ part }) => part.some((p) => p[0] > box[0] - reach && p[0] < box[2] + reach && p[1] > box[1] - reach && p[1] < box[3] + reach));
  const names = (c.zoom.labels ?? []).filter((l) => /^station-labels/.test(l.layer));
  // Only names near a walk matter, and placement near it depends only on names near it.
  const around = names.filter((l) => l.candidates?.some((cd) => near(cd.box, 160)));
  const { placed } = placeLabels(around, { width: Infinity, height: Infinity });
  const hit = (box, a, b) => {
    for (let t = 0; t <= 1; t += 1 / 24) {
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]) return true;
    }
    return false;
  };
  const count = new Map();
  for (const l of placed) {
    const id = String(l.properties?.id);
    count.set(id, (count.get(id) ?? 0) + 1);
    for (const { line, part } of ws) {
      for (let i = 1; i < part.length; i++) {
        if (hit(l.box, part[i - 1], part[i])) { out.push(fault('name-on-walk', l.layer, null, [(l.box[0] + l.box[2]) / 2, (l.box[1] + l.box[3]) / 2], `the name "${l.text}" is placed over the walk of station ${line.properties?.id}`)); break; }
      }
    }
    for (const m of c.marks) {
      if (!isGroup(m) || isRing(m)) continue;
      if (m.box && l.box[0] < m.box[2] && m.box[0] < l.box[2] && l.box[1] < m.box[3] && m.box[1] < l.box[3]) out.push(fault('name-on-walk', l.layer, null, [(l.box[0] + l.box[2]) / 2, (l.box[1] + l.box[3]) / 2], `the name "${l.text}" is placed over the ${describe(m)}`));
    }
  }
  for (const [id, n] of count) {
    if (n > 1) out.push(fault('name-on-walk', 'station-labels', null, ws[0].part[0], `station ${id} is named ${n} times at zoom ${c.z}`));
  }
  return out;
}

// --- LN-03, LN-06: straight through a station ------------------------------------------------

export function stationBends(c) {
  const { bend, bendMinPx, bendM } = c.lim;
  const out = [];
  const chains = railChains(c.zoom);
  const tables = new Map();
  const table = (ch) => {
    if (!tables.has(ch.id)) {
      const pts = ch.base, arc = [0];
      for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + dist(pts[i], pts[i - 1]));
      tables.set(ch.id, { pts, arc, length: arc.at(-1) });
    }
    return tables.get(ch.id);
  };
  const pointAt = (t, s) => {
    if (s < 0 || s > t.length) return null;
    for (let i = 1; i < t.pts.length; i++) {
      if (t.arc[i] >= s) {
        const l = t.arc[i] - t.arc[i - 1];
        const f = l ? (s - t.arc[i - 1]) / l : 0;
        return [t.pts[i - 1][0] + (t.pts[i][0] - t.pts[i - 1][0]) * f, t.pts[i - 1][1] + (t.pts[i][1] - t.pts[i - 1][1]) * f];
      }
    }
    return t.pts.at(-1);
  };
  for (const m of distinct(c.marks.filter((x) => !isRing(x)))) {
    const q = m.vq;
    const F = 2 * q.ht;
    const lead = Math.min(F, bendM / c.mppAt(m.at[1]));
    if (lead < bendMinPx) continue;
    for (const route of m.routes) {
      const found = lineAt(c, q, route, q.hl + 10);
      if (!found || found.ending) continue;
      // The chain of that route nearest the mark.
      let best = null;
      for (const ch of chains) {
        if (ch.route !== route) continue;
        const t = table(ch);
        for (let i = 1; i < t.pts.length; i++) {
          const r = segDist(found.at, t.pts[i - 1], t.pts[i]);
          if (!best || r.d < best.d) best = { d: r.d, t, s: t.arc[i - 1] + r.t * (t.arc[i] - t.arc[i - 1]) };
        }
      }
      if (!best || best.d > 6) continue;
      const half = F / 2;
      const a0 = pointAt(best.t, best.s - half - lead), a1 = pointAt(best.t, best.s - half), b0 = pointAt(best.t, best.s + half), b1 = pointAt(best.t, best.s + half + lead);
      if (!a0 || !a1 || !b0 || !b1) continue;
      const deg = angleBetween(sub(a1, a0), sub(b1, b0));
      if (deg <= bend) continue;
      out.push(fault('bent-through-station', m.layer, route, m.at, `${route} turns ${deg.toFixed(1)} degrees across the ${describe(m)} (its ${lead.toFixed(0)} px lead-in each side and the mark's ${F.toFixed(0)} px; ${bend} allowed): a line should pass straight through a station`, { value: deg }));
    }
  }
  return out;
}

// --- SS05: the station shapes' layers ----------------------------------------------------------

/**
 * The page's style for the station shapes (`structures`): no outline, the
 * building from z13, platforms and canopies from z14.2, building under
 * platform under canopy.
 * @param {object} style model.style
 * @returns {Array} faults (px given, or [0, 0])
 */
export function structureStyle(style, { sizes = SIZES, px = [0, 0] } = {}) {
  const out = [];
  const layers = (style?.layers ?? []).filter((l) => l.source === 'structures');
  if (!layers.length) return out;
  const index = new Map((style.layers ?? []).map((l, i) => [l.id, i]));
  for (const l of layers) {
    if (l.type === 'line') out.push(fault('structure-style', l.id, null, px, `${l.id} draws an outline on the station shapes; DESIGN.md has the building, platforms and canopy as fills with no outline`));
    if (l.type === 'fill' && l.paint?.['fill-outline-color'] !== undefined) out.push(fault('structure-style', l.id, null, px, `${l.id} has a fill-outline-color; DESIGN.md has no outline`));
  }
  const find = (re) => layers.find((l) => re.test(l.id));
  const building = find(/building/), platform = find(/platform/), canopy = find(/canopy/);
  const want = [[building, sizes.buildingFrom, 'the building'], [platform, sizes.structureFrom, 'platforms'], [canopy, sizes.structureFrom, 'canopies']];
  for (const [l, from, what] of want) {
    if (!l) { out.push(fault('structure-style', 'structures', null, px, `the page has no layer for ${what}`)); continue; }
    if (Math.abs((l.minzoom ?? 0) - from) > 0.01) out.push(fault('structure-style', l.id, null, px, `${what} start at zoom ${l.minzoom ?? 0}; DESIGN.md has ${from}`));
  }
  if (building && platform && canopy) {
    const ib = index.get(building.id), ip = index.get(platform.id), ic = index.get(canopy.id);
    if (!(ib < ip && ip < ic)) out.push(fault('structure-style', canopy.id, null, px, `the layers are not drawn building, then platform, then canopy (${ib}, ${ip}, ${ic}): the canopy is the palest wash over the platforms`));
  }
  return out;
}

// --- all of it -----------------------------------------------------------------------------------

export const MARK_KINDS = [
  'tick-parting', 'dot-for-pack', 'marks-collide', 'marks-crowded', 'hub-ring', 'mark-size', 'mark-scale', 'mark-fade', 'unserved-mark',
  'mark-off-building', 'facility-covers-station', 'mark-off-line', 'mark-off-centre', 'mark-wide', 'mark-covers-other', 'mark-clips-end',
  'mark-class', 'mark-far-from-stop', 'walk-dots', 'walk-end', 'walk-oblique', 'name-on-walk', 'bent-through-station', 'structure-style',
];

/**
 * Every mark, group and walk rule at one zoom.
 * @param {{z:number, lines:Array, marks:Array}} zoom model.zoom(z)
 * @param {{data?:object, style?:object, limits?:object, sizes?:object, kinds?:string[]}} opts
 */
export function markFaults2(zoom, opts = {}) {
  const want = new Set(opts.kinds ?? MARK_KINDS);
  const has = (...k) => k.some((x) => want.has(x));
  const c = contextOf(zoom, opts);
  const out = [];
  if (has('mark-off-line')) out.push(...markOffLine(c));
  if (has('mark-wide', 'mark-off-centre', 'mark-clips-end', 'mark-covers-other')) out.push(...markSpans(c));
  if (has('marks-collide', 'marks-crowded')) out.push(...marksApart(c));
  if (has('tick-parting', 'dot-for-pack')) out.push(...ticks(c));
  if (has('hub-ring')) out.push(...hubRings(c));
  if (has('mark-size', 'mark-scale')) out.push(...markSizes(c));
  if (has('mark-fade')) out.push(...markFades(c));
  if (has('mark-class')) out.push(...markClasses(c));
  if (has('unserved-mark')) {
    const stations = (opts.data?.stations?.features ?? []).filter((f) => f.properties?.served === false).map((f) => ({ ...f, px: toWorld(f.geometry.coordinates, c.z) }));
    out.push(...unservedMarks(c, { stations }));
  }
  if (has('mark-off-building')) out.push(...markOffBuilding(c, { data: opts.data }));
  if (has('mark-far-from-stop')) out.push(...markFarFromStop(c, { data: opts.data }));
  if (has('facility-covers-station')) out.push(...facilitiesOnStations(c));
  if (has('walk-dots', 'walk-end', 'walk-oblique')) out.push(...walks(c));
  if (has('name-on-walk')) out.push(...walkNames(c));
  if (has('bent-through-station')) out.push(...stationBends(c));
  if (has('structure-style') && opts.style) {
    const f = (opts.data?.structures?.features ?? [])[0];
    out.push(...structureStyle(opts.style, { sizes: c.sizes, px: f ? toWorld(f.geometry.coordinates?.[0]?.[0] ?? [0, 0], c.z) : [0, 0] }));
  }
  return out.filter((f) => want.has(f.kind)).map((f) => ({ ...f, px: [round1(f.px[0]), round1(f.px[1])] }));
}

export { DEG, norm };
