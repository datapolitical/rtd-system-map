// Routes followed across their pieces (issue #43): where a route's drawn line
// breaks, ends in a hook, or runs past the station it ends at.
//
// The build draws a route as many pieces: stretches of track, the streets a
// bus runs on (one feature per street, carrying every route on it), parts of a
// MultiLineString. The old gap check compared only the pieces inside one
// feature, so a bus line, which is many street features, was never checked
// where one street meets the next. Here each route is followed across every
// piece that carries it, on the lines as drawn (strokes.mjs).
//
//  - gap: a line end that dangles (no other route line is drawn over it),
//    whose route carries on within `maxGap` metres in the direction the end
//    points, with empty land between: a rider sees the line stop and start
//    again (15th Street short of Lawrence; a planted cut). An end that sits on
//    another line, or whose route turns off along a street whose line carries
//    on, is not a break a rider can see.
//    A bus line deliberately ends at the edge of a terminal's hall (the
//    `terminals` fills): an end on or within `hallReach` px of one is where its
//    buses go into the hall, not a break.
//  - hook: a dangling end whose last few px turn back on themselves (Union
//    Station's bus line). A route that ends at the place it serves (within
//    `placeReach` m of a station, platform or park-and-ride mark, or of a
//    hall) is drawn as a short end turning off the road to it: that is the
//    end, not a hook. A bus stop is not such a place.
//  - tick: a dangling end with nothing at it (no such place within
//    `placeReach` m, no stop within `stopReach` m, no line over it) that
//    stands out at least `tickMin` and less than `tickLen` px from a line it
//    leaves at a real angle: a stub a rider sees as a stray tick on the street
//    (under `tickMin` px it cannot be seen).
//  - overshoot: a rail line's free end that runs past the mark of the
//    station it ends at; dangling: a rail line's free end with no station of
//    its line near it.
//
// Thresholds are screen px at the zoom, as a rider sees them, except the gap
// reach and the distances to a place or a stop, which are ground metres so the
// same data is judged alike at every zoom. Nothing names a route, layer or
// place: a route is whatever the build says a feature carries (`route`, or a
// street's `routes`), and a station is any mark whose feature lists the line
// among its `lines`. The places a line end can be at are read by source
// (PLACE_SOURCES) from the marks and fills of the page's own layers, at any
// zoom: pass `places` (model.places(z, PLACE_SOURCES)) so the answer does not
// depend on whether those layers are already drawn at the zoom looked at.

import { toLonLat } from './mercator.mjs';
import { capReach } from './strokes.mjs';

const CELL = 64;
const routesOf = (l) => (l.route != null ? [String(l.route)] : String(l.properties?.routes ?? '').split(/\s+/).filter(Boolean));
const metresPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q, t };
}

// A grid of segments, each with the half width it is drawn at.
class Segments {
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
  // Segments within `reach` px of p (by cell; the caller measures).
  near(p, reach = 0) {
    const out = new Set();
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    for (let dx = -1 - r; dx <= 1 + r; dx++) for (let dy = -1 - r; dy <= 1 + r; dy++) for (const s of this.g.get(`${cx + dx},${cy + dy}`) ?? []) out.add(s);
    return [...out];
  }
  // Is p inside any segment's stroke, other than those of the features in
  // `except` (every layer that draws a feature counts as that feature), and
  // drawn at least `minHw` wide? A thin dashed line across a break in a wide
  // one doesn't hide the break.
  covers(p, except = new Set(), minHw = 0) {
    return this.near(p).some((s) => !except.has(featureKey(s.line)) && s.hw >= minHw && segDist(p, s.a, s.b).d <= s.hw);
  }
}

const featureKey = (l) => `${l.source}:${l.index}`;
const unit = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const angle = (u, v) => (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180) / Math.PI;

// The sources whose marks and fills are the places a line can end at: stations
// (a platform's mark is a station's), park-and-rides, terminal halls, and the
// street stops a line end is not "at" a place for but still has something at.
export const PLACE_SOURCES = ['stations', 'stationsfar', 'facilities', 'terminals', 'stops'];

// Points on the same grid as the segments.
class Points {
  constructor() { this.g = new Map(); }
  add(p) {
    const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
    if (!this.g.has(k)) this.g.set(k, []);
    this.g.get(k).push(p);
  }
  // Is any point within r px of p?
  within(p, r) {
    for (let x = Math.floor((p[0] - r) / CELL); x <= Math.floor((p[0] + r) / CELL); x++) {
      for (let y = Math.floor((p[1] - r) / CELL); y <= Math.floor((p[1] + r) / CELL); y++) {
        if ((this.g.get(`${x},${y}`) ?? []).some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= r)) return true;
      }
    }
    return false;
  }
}

// Px from p to a polygon's ring: 0 inside it.
function ringDist(p, ring) {
  let inside = false, best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    best = Math.min(best, segDist(p, a, b).d);
  }
  return inside ? 0 : best;
}

// The two ends of a drawn part, each with its outward direction (taken over
// the last `over` px so a vertex split doesn't swing it).
function endsOf(part, over = 3) {
  const out = [];
  for (const [i0, step] of [[part.length - 1, -1], [0, 1]]) {
    const E = part[i0];
    let j = i0 + step, back = part[j];
    while (j + step >= 0 && j + step < part.length && Math.hypot(back[0] - E[0], back[1] - E[1]) < over) { j += step; back = part[j]; }
    out.push({ E, out: unit([E[0] - back[0], E[1] - back[1]]), i0, step });
  }
  return out;
}

// How far a line stands out from the line it leaves: walking back from its end
// along the part, the distance to the first point under another feature's
// stroke (drawn at least `minHw` wide) that the line meets at a real angle
// (not alongside it: sin of the angle at least `minSin`), if that is within
// `limit` px; otherwise null.
function standsOut(part, end, drawn, key, minHw, limit, minSin) {
  let walked = 0, a = part[end.i0];
  for (let k = end.i0 + end.step; k >= 0 && k < part.length; k += end.step) {
    const b = part[k];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = unit([b[0] - a[0], b[1] - a[1]]);
    const n = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 1; i <= n; i++) {
      const s = walked + (len * i) / n;
      if (s >= limit) return null;
      const q = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n];
      const hit = drawn.near(q).some((o) => {
        if (featureKey(o.line) === key || o.hw < minHw || segDist(q, o.a, o.b).d > o.hw) return false;
        const v = unit([o.b[0] - o.a[0], o.b[1] - o.a[1]]);
        return Math.abs(d[0] * v[1] - d[1] * v[0]) >= minSin;
      });
      if (hit) return s;
    }
    walked += len;
    a = b;
  }
  return null;
}

/**
 * Route faults at one zoom of the drawn model.
 * @param {{z: number, lines: Array, marks?: Array, areas?: Array}} zoom the model's zoom(z) output
 * @param {{places?: {marks: Array, areas: Array}}} opts `places`: model.places(z, PLACE_SOURCES),
 *   the marks and fills a line end can be at whether or not their layers are drawn at this zoom
 *   (default: the zoom's own marks and areas)
 * @returns {Array<{kind, layer, route, px, msg}>}
 */
export function routeFaults(zoom, {
  maxGap = 30, minLand = 3, pointing = 45, hookTurn = 110, stationReach = 150,
  hallReach = 3, placeReach = 60, stopReach = 20, tickMin = 2, tickLen = 15, tickAngle = 30, places = null,
} = {}) {
  const z = zoom.z;
  const faults = [];
  // The places a line end can be at, and the stops it can have beside it.
  const there = places ?? { marks: zoom.marks ?? [], areas: zoom.areas ?? [] };
  const placeMarks = new Points(), stopMarks = new Points();
  for (const m of there.marks) {
    if (m.source === 'stations' || m.source === 'stationsfar' || m.source === 'facilities' || /platform/i.test(m.layer ?? '')) placeMarks.add(m.at);
    else if (m.source === 'stops') stopMarks.add(m.at);
  }
  const halls = there.areas.filter((a) => a.source === 'terminals').flatMap((a) => a.parts);
  const hallDist = (p) => halls.reduce((d, ring) => Math.min(d, ringDist(p, ring)), Infinity);
  // Every route line as drawn, any layer: what a rider sees covering a place.
  const drawn = new Segments();
  // One entry per feature, from the first layer that draws it (style order):
  // a casing, an edge and the line itself draw the same piece.
  const pieces = new Map();
  for (const l of zoom.lines) {
    const routes = routesOf(l);
    if (!routes.length) continue;
    const hw = (l.drawnWidth ?? l.width ?? 0) / 2;
    for (const part of l.drawn ?? l.parts) for (let i = 1; i < part.length; i++) drawn.add({ line: l, a: part[i - 1], b: part[i], hw });
    // FlexRide zones are drawn as outlines of an area, not a route to follow.
    if (l.source === 'flexride') continue;
    const k = `${l.source}:${l.index}`;
    if (!pieces.has(k)) pieces.set(k, l);
  }
  // Each route's pieces, by route.
  const byRoute = new Map();
  for (const l of pieces.values()) {
    const hw = (l.drawnWidth ?? l.width ?? 0) / 2;
    (l.drawn ?? l.parts).forEach((part, pi) => {
      for (let i = 1; i < part.length; i++) {
        for (const r of routesOf(l)) {
          if (!byRoute.has(r)) byRoute.set(r, new Segments());
          byRoute.get(r).add({ line: l, pi, a: part[i - 1], b: part[i], hw, first: i === 1, last: i === part.length - 1 });
        }
      }
    });
  }
  // Station marks by the lines they serve.
  const stationMarks = (zoom.marks ?? []).filter((m) => m.properties?.lines);

  const seen = new Set();
  const add = (kind, l, routes, px, msg) => {
    const key = `${kind}:${Math.round(px[0])}:${Math.round(px[1])}`;
    if (seen.has(key)) return;
    seen.add(key);
    faults.push({ kind, layer: l.layer, route: routes.join(' '), px: [Math.round(px[0] * 10) / 10, Math.round(px[1] * 10) / 10], msg });
  };

  for (const l of pieces.values()) {
    const w = l.drawnWidth ?? l.width ?? 0;
    const reachCap = capReach(l.cap, w);
    (l.drawn ?? l.parts).forEach((part, pi) => {
      if (part.length < 2) return;
      for (const end of endsOf(part)) {
        const { E } = end;
        // Which of this piece's routes stop here: no other piece of the route
        // has its stroke over this end.
        const stopping = routesOf(l).filter((r) => !byRoute.get(r).near(E).some((s) => !(s.line === l && s.pi === pi) && segDist(E, s.a, s.b).d <= s.hw + 0.5));
        if (!stopping.length) continue;
        // A line under it hides the end, if it is drawn about as wide.
        const hideHw = 0.6 * (w / 2);
        const dangles = !drawn.covers(E, new Set([featureKey(l)]), hideHw);
        const mpp = metresPerPx(toLonLat(E, z)[1], z);
        const gapPx = maxGap / mpp;
        // Buses go into a hall at its edge: an end there is not a break.
        const atHall = dangles && hallDist(E) <= hallReach;

        // Gap: a stopping route carries on ahead, across empty land. Only at
        // an end that dangles: an end on another line is no break to a rider.
        const broken = [];
        let land = Infinity;
        for (const r of dangles && !atHall ? stopping : []) {
          let best = null;
          for (const s of byRoute.get(r).near(E, gapPx)) {
            if (s.line === l && s.pi === pi) continue;
            const { d, q, t } = segDist(E, s.a, s.b);
            if (d > gapPx) continue;
            const v = unit([q[0] - E[0], q[1] - E[1]]);
            if (angle(end.out, v) > pointing) continue;
            // How far the other piece's stroke reaches towards this end: half
            // its width from its side, only its cap past its own end.
            const atEnd = (t === 0 && s.first) || (t === 1 && s.last);
            const reachOther = atEnd ? capReach(s.line.cap, 2 * s.hw) : s.hw;
            if (!best || d < best.d) best = { d, q, s, reachOther };
          }
          if (!best) continue;
          const clear = best.d - best.reachOther - reachCap;
          if (clear < minLand) continue;
          // The middle of the empty land itself: past this end's cap, short of
          // the other piece's edge. Neither of the two can cover it; any other
          // line drawn there hides the break.
          const v = unit([best.q[0] - E[0], best.q[1] - E[1]]);
          const mid = [E[0] + v[0] * (reachCap + clear / 2), E[1] + v[1] * (reachCap + clear / 2)];
          if (drawn.covers(mid, new Set([featureKey(l), featureKey(best.s.line)]), hideHw)) continue;
          broken.push(r);
          land = Math.min(land, clear);
        }
        if (broken.length) {
          add('gap', l, broken, E, `${broken.join(' ')} on ${l.layer} stops ${land.toFixed(1)} px short of where it carries on`);
          continue;
        }

        // Hook: the last few px turn back on themselves.
        // Walk back into the piece from its end; `toward` is each segment's
        // direction of travel towards the end. An end at the place it serves
        // (a short end turning off the road to it) is no hook.
        const placeNear = () => hallDist(E) <= placeReach / mpp || placeMarks.within(E, placeReach / mpp);
        const span = Math.max(20, 4 * w);
        let walked = 0, hooked = false;
        for (let k = 0; dangles && walked < span; k++) {
          const ia = end.i0 + k * end.step, ib = ia + end.step;
          if (ib < 0 || ib >= part.length) break;
          const a = part[ia], b = part[ib];
          walked += Math.hypot(b[0] - a[0], b[1] - a[1]);
          const toward = unit([a[0] - b[0], a[1] - b[1]]);
          if (walked > 2 && angle(end.out, toward) > hookTurn) {
            if (!placeNear()) {
              add('hook', l, stopping, E, `${stopping.join(' ')} on ${l.layer} ends in a hook: it turns back ${angle(end.out, toward).toFixed(0)} degrees in its last ${walked.toFixed(0)} px`);
              hooked = true;
            }
            break;
          }
        }

        // Tick: a free end with nothing at it, standing out a few px from the
        // line it leaves.
        if (dangles && !hooked) {
          const out = standsOut(part, end, drawn, featureKey(l), hideHw, tickLen, Math.sin((tickAngle * Math.PI) / 180));
          if (out !== null && out >= tickMin && !placeNear() && !stopMarks.within(E, stopReach / mpp)) {
            add('tick', l, stopping, E, `${stopping.join(' ')} on ${l.layer} ends in a tick: it stands out ${out.toFixed(1)} px from the line it leaves, with no stop or place at its end`);
          }
        }

        // Rail: the line's end and the station it ends at, whether or not
        // another line runs there: a line carried past its station shows in
        // its own colour beside the others.
        if (l.mode !== 'rail' && l.properties?.mode !== 'rail') continue;
        for (const r of stopping) {
          const serving = stationMarks.filter((m) => String(m.properties.lines).split(/\s+/).includes(r));
          const reach = stationReach / metresPerPx(toLonLat(E, z)[1], z);
          let nearest = null;
          for (const m of serving) {
            const d = Math.hypot(m.at[0] - E[0], m.at[1] - E[1]);
            if (!nearest || d < nearest.d) nearest = { d, m };
          }
          if (!nearest || nearest.d > reach) {
            add('dangling', l, [r], E, `${r} on ${l.layer} ends with no station of its line within ${stationReach} m`);
            continue;
          }
          const b = nearest.m.box;
          const outside = Math.max(b[0] - E[0], E[0] - b[2], b[1] - E[1], E[1] - b[3], 0);
          // Past the station: the mark lies behind the end, and the end is clear of it.
          const behind = (nearest.m.at[0] - E[0]) * end.out[0] + (nearest.m.at[1] - E[1]) * end.out[1] < 0;
          if (behind && outside > 3) add('overshoot', l, [r], E, `${r} on ${l.layer} runs ${outside.toFixed(1)} px past its station's mark`);
        }
      }
    });
  }
  return faults;
}
