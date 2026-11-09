// Bus geometry generalized as a transit map draws it (DESIGN.md, "Bus
// routes", "Readable geometry"). RTD's route layer draws each bus as driven:
// cloverleaf circles, both carriageways of a divided road, the lap a bus
// makes round a block to turn back. Drawn as they are, several routes doing
// that at one interchange are a knot a rider can't read. So, before the
// streets are built, each route's line is simplified from its own shape,
// with nothing known about any place:
//
// 0. Pieces. RTD draws a route in short pieces; pieces that meet end to
//    end are joined first, so a lap or a carriageway in pieces is seen whole.
// 1. Carriageways. Where a route's line runs beside itself, parallel and
//    within PAIR_FAR, for at least PAIR_RUN (both directions of a divided
//    road or a highway, each on its own carriageway or ramp), both are
//    drawn on the middle line, fully within PAIR_NEAR and less and less out
//    to PAIR_FAR, so the street is one line where it is one road. A one-way
//    pair a block apart is further than that and stays two streets. This
//    goes first, so a lap's two sides on a divided road meet where it turns.
// 2. Laps. Where a route's line comes back to within LAP_CLOSE of itself
//    after LAP_MIN to LAP_MAX of travel, the lap is a loop, not a street:
//    - one that never reaches CIRCLE from where it began (a ramp circle, a
//      turn round one block) becomes the point it began at, so the bus
//      turns there;
//    - a bigger one (a terminal or layover loop) becomes a short end: the
//      shorter way round to the station or transit center it serves (from
//      RTD's own layers, passed in as `places`), or with none near, to its
//      farthest point;
//    - a thin one (a one-way pair, or out and back on one street) is a
//      street each way, and stays; so does a loop that would leave more
//      than LAP_DROP of its own streets undrawn (a circuit, which its
//      arrows explain), and one that is most of its route (a circulator).
//    A short thin lap off a line that goes on another way is a spur (the
//    ramp to a turn and back), and goes. Laps are taken out again until
//    none is left, since a circle taken out can leave its ramp as a spur.
// 3. Loose ends. A piece that starts a little way past where another piece
//    of its route ends, and runs on through that end, is trimmed to begin
//    there, so the two are one line with no stub.
//
// Only geometry changes: every feature keeps its properties, and the build
// measures frequency (scripts/lib/stretches.mjs) before this runs.

import { Grid, closestOnSegment, dedupe, densify, length, partsOf, projection, simplify } from './geom.mjs';

// Points are compared this far apart.
const STEP = 10;
// A lap: back within this of where it began...
export const LAP_CLOSE = 30;
// At a through movement (no stop near either end of the closure) the two
// directions of a ramp can be wider apart than a city street's: a triangle
// at an interchange closes within this, and is still one line through.
export const THROUGH_CLOSE = 100;
// ...after at least this much travel, and no more than this.
export const LAP_MIN = 60;
export const LAP_MAX = 2000;
// A lap reaching no farther than this from its start is a turn: a point.
export const CIRCLE = 220;
// A lap whose short end would leave more than this of its streets undrawn
// is a circuit, and stays.
export const LAP_DROP = 700;
// ...or more than this, for a loop that turns at a station or transit center.
export const LAP_DROP_SERVES = 1500;
// A loop encloses at least this much area for its length squared (a circle
// 0.08, a square 0.06, a one-way pair a block apart and 600 m long 0.015).
export const LAP_FAT = 0.03;
// A short end runs to the station or transit center within this of its
// loop, the place the loop is there to serve.
export const PLACE_NEAR = 250;
// A spur reaches no farther than this, and is told from the end of a line
// by where the line goes on: over SPUR_BACK before and after it, not back
// the way it came (within 120 degrees of turning round).
export const SPUR_REACH = 100;
// A lap reaching less than this is too small to be an out-and-back.
export const TIP_TINY = 20;
const SPUR_BACK = 60;
const SPUR_COS = Math.cos((120 * Math.PI) / 180);
// A lap at least this share of its route's whole line is the route.
const LAP_ROUTE_SHARE = 0.5;
// Carriageways of one road: fully merged within PAIR_NEAR, partly to
// PAIR_FAR, when parallel within PAIR_ANGLE for at least PAIR_RUN.
export const PAIR_NEAR = 40;
export const PAIR_FAR = 60;
export const PAIR_RUN = 100;
// At a freeway interchange the bus runs through, the two carriageways swing
// wider than a city one-way pair: up to this far apart, and merged fully
// within THROUGH_NEAR, when no stop is near enough to be served. A rider
// waiting on a one-way pair keeps the two streets; a bus that picks nobody
// up between the ramps is one line down the middle.
export const THROUGH_FAR = 140;
export const THROUGH_NEAR = 100;
// No stop within this of a thin lap or a wide carriageway pair means the bus
// is passing through, not serving the street. A stop on the ramp itself is
// within a few metres; a frontage-road stop a block away is not on the bus's
// path, so the lap test uses the tighter THROUGH_STOP.
export const STOP_NEAR = 150;
export const THROUGH_STOP = 60;
// Travel beyond across-and-back that makes this line's own way back a
// carriageway (a circle of any size travels less).
const TIP_SLACK = 20;
// Lines on both sides of each other by more than this have crossed.
const CROSS_CLEAR = 3;
const PAIR_COS = Math.cos((25 * Math.PI) / 180);
// Pieces shorter than this after generalizing are dropped.
const MIN_PIECE = STEP;

/**
 * `features` are bus route features (LineString or MultiLineString, with
 * `route`). Returns the same features, in order, with generalized geometry.
 * `report` (optional array) receives one entry per lap changed:
 * { route, kind: 'turn' | 'end', length, at: [lon, lat] }.
 */
export function generalize(features, { precision = 5, report = null, places = [], halls = [], stops = [] } = {}) {
  const first = features.find((f) => partsOf(f.geometry).some((p) => p.length));
  if (!first) return features;
  const { project, unproject } = projection(partsOf(first.geometry).find((p) => p.length)[0], precision);
  const stopsHere = places.map(project);
  const hallsHere = halls.map((ring) => ring.map(project));
  // Where a bus picks riders up, in one grid: a through lap or a wide pair
  // with no stop near it is the freeway, not a street. Without stops (the
  // unit tests, a caller that has none), nothing is known to be through.
  const stopGrid = stops.length ? new Grid(STOP_NEAR) : null;
  for (const s of stops) {
    const p = project(s);
    stopGrid.add(p, p, s);
  }
  // A station or transit center is where a rider boards too: a loop round
  // one is not a through movement, even if no stop sits on the loop.
  for (const p of stopsHere) if (stopGrid) stopGrid.add(p, p, p);

  const byRoute = new Map();
  features.forEach((f, fi) => {
    const r = f.properties.route;
    (byRoute.get(r) ?? byRoute.set(r, []).get(r)).push(fi);
  });

  const out = features.map((f) => ({ ...f }));
  for (const [route, list] of byRoute) {
    const express = list.some((fi) => /REGIONAL|RAPID/.test(features[fi].properties.category || ''));
    // Every part of the route, projected and densified, then stitched into
    // whole lines across the route's own stretches: a lap round a block can
    // be split between two stretches of one route, and is only seen whole
    // once they are joined. Each point keeps the feature it came from, so a
    // line can be put back where it started.
    const segs = [];
    for (const fi of list) {
      for (const part of partsOf(features[fi].geometry).filter((part) => part.length >= 2)) segs.push({ fi, points: densify(part.map(project), STEP) });
    }
    const owner = new Map();
    for (const s of segs) for (const point of s.points) owner.set(point, s.fi);
    let parts = stitch(segs.map((s) => s.points)).map((points) => ({ fi: owner.get(points[0]) ?? list[0], points }));
    const total = parts.reduce((s, p) => s + length(p.points), 0);
    // 1. Carriageways onto one line, so a lap's two sides on a divided road
    // meet where it turns.
    mergeCarriageways(parts, { stopGrid, express });
    // 2. Laps.
    parts = parts.flatMap((p) =>
      laps(p.points, total, stopsHere, (kind, lap) => report?.push({ route, kind, length: Math.round(length(lap)), at: unproject(lap[0]), line: lap.map(unproject) }), hallsHere, stopGrid, express).map((points) => ({ fi: p.fi, points })),
    );
    // 3. Loose ends.
    trimHooks(parts);
    // 4. A point the line doubles back through for a few metres is how two
    // directions of one ramp are stitched together, not a road: it reads as
    // a spike or a triangle. Where no stop is near, it goes.
    for (const p of parts) p.points = despike(p.points, stopGrid, express);
    // Back to features: a line that runs through two stretches is cut back
    // into the feature each of its points came from.
    for (const fi of list) {
      const lines = [];
      for (const p of parts) {
        if (p.points.length < 2) continue;
        let start = 0;
        let was = owner.get(p.points[0]) ?? fi;
        for (let k = 1; k <= p.points.length; k += 1) {
          const here = k < p.points.length ? owner.get(p.points[k]) ?? was : null;
          if (k < p.points.length && here === was) continue;
          if (was === fi && k - start >= 2 && length(p.points.slice(start, k)) >= MIN_PIECE) {
            const line = dedupe(simplify(p.points.slice(start, k), 1).map(unproject));
            if (line.length >= 2) {
              // The stitched pass can join two stretches in a way that leaves
              // a ramp U in the piece after it is cut back: take through laps
              // out again on the piece itself, and nothing else.
              const c = removeThroughLaps(line.map(project), stopGrid, express).map(unproject);
              const simple = dedupe(c);
              if (simple.length >= 2 && length(simple.map(project)) >= MIN_PIECE) lines.push(simple);
            }
          }
          start = k;
          was = here;
        }
      }
      const was = features[fi].geometry;
      out[fi] = {
        ...features[fi],
        geometry: !lines.length ? was : lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines },
      };
    }
  }
  return out;
}

// RTD draws a route in many short pieces. A piece goes on into the piece
// whose end meets its own (within MEET), while only one not yet taken does,
// so a lap split across pieces (in, round, and out from one corner) is seen
// whole.
const MEET = 2;
export function stitch(lines) {
  const left = lines.map((l) => [...l]);
  const ends = (p) => left.flatMap((l, k) => [[k, 0], [k, 1]]).filter(([k, side]) => left[k] && dist(side ? left[k].at(-1) : left[k][0], p) <= MEET);
  const out = [];
  for (let k = 0; k < left.length; k++) {
    if (!left[k]) continue;
    let line = left[k];
    left[k] = null;
    for (let grew = true; grew; ) {
      grew = false;
      for (const atEnd of [true, false]) {
        const p = atEnd ? line.at(-1) : line[0];
        const found = ends(p);
        if (found.length !== 1) continue;
        const [m, side] = found[0];
        let next = left[m];
        left[m] = null;
        if (atEnd) line = line.concat((side ? [...next].reverse() : next).slice(1));
        else line = (side ? next : [...next].reverse()).slice(0, -1).concat(line);
        grew = true;
      }
    }
    out.push(line);
  }
  return out;
}

// cutLaps until no lap is left: a ramp circle taken out can leave the ramp
// to it and back as a spur, itself a lap.
const PASSES = 4;
// A point the line comes back through within SPIKE_LEG metres, turning more
// than 90 degrees with one leg under SPIKE_SHORT (a reversal of a few metres
// between two long ones), and with no stop near, is a stitching seam: remove
// it, and look again at its neighbours.
export const SPIKE_LEG = 40;
export const SPIKE_SHORT = 15;
export const SPIKE_COS = 0;

export function despike(points, stopGrid = null, express = false) {
  if (!stopGrid) return points;
  const out = points.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      const l1 = dist(a, b);
      const l2 = dist(b, c);
      if (l1 > SPIKE_LEG || l2 > SPIKE_LEG || Math.min(l1, l2) > SPIKE_SHORT) continue;
      const cos = ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (l1 * l2 || 1);
      if (!express || cos >= SPIKE_COS || stopGrid.near(b, THROUGH_STOP).length) continue;
      out.splice(i, 1);
      changed = true;
      break;
    }
  }
  return out;
}

// Out-and-back along the same few metres with no stop near: a ramp U at an
// interchange, not a road. Replace it with the middle of its two ends. Used
// on a finished piece, so it never splits a line or moves a terminal.
export function removeThroughLaps(points, stopGrid = null, express = false) {
  if (!stopGrid || !express || points.length < 3) return points;
  const pts = densify(points, STEP);
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const out = [pts[0]];
  let i = 0;
  while (i < n - 1) {
    let found = -1;
    for (let j = i + 2; j < n; j++) {
      const travel = cum[j] - cum[i];
      if (travel < LAP_MIN) continue;
      if (travel > LAP_MAX) break;
      if (dist(pts[i], pts[j]) > LAP_CLOSE) continue;
      let clear = true;
      for (let k = i; k <= j && clear; k++) if (stopGrid.near(pts[k], THROUGH_STOP).length) clear = false;
      if (clear) {
        found = j;
        break;
      }
    }
    if (found < 0) {
      out.push(pts[i + 1]);
      i++;
      continue;
    }
    out.push([(pts[i][0] + pts[found][0]) / 2, (pts[i][1] + pts[found][1]) / 2]);
    i = found;
  }
  return dedupe(out);
}

function laps(points, routeLength, places, note, halls, stopGrid = null, express = false) {
  const out = [];
  let line = points;
  for (let pass = 0; pass < PASSES; pass++) {
    let changed = false;
    const [kept, ...ends] = cutLaps(line, routeLength, places, (...a) => {
      changed = true;
      note(...a);
    }, halls, stopGrid, express);
    out.push(...ends);
    if (!kept || !changed) return kept ? [kept, ...out] : out;
    line = densify(kept, STEP);
  }
  return [line, ...out];
}

// A line with its laps taken out: returns the pieces it becomes (the line
// itself, and a short end for each terminal lap).
export function cutLaps(points, routeLength = Infinity, places = [], note = () => {}, halls = [], stopGrid = null, express = false) {
  const n = points.length;
  if (n < 3) return [points];
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  const kept = [points[0]];
  const ends = [];
  let i = 0;
  while (i < n - 1) {
    const close = (a, b) => {
      const dd = dist(points[a], points[b]);
      if (dd <= LAP_CLOSE) return true;
      // Wider only where no stop is near and the line is doubled back: a
      // ramp pair at an interchange, not a crossing of two streets (which
      // carries straight on).
      if (dd > THROUGH_CLOSE || !stopGrid) return false;
      if (stopGrid.near(points[a], THROUGH_STOP).length || stopGrid.near(points[b], THROUGH_STOP).length) return false;
      const A = dirAt(points, a);
      const B = dirAt(points, b);
      return A[0] * B[0] + A[1] * B[1] < -0.5;
    };
    // The first lap starting here: where the line first comes back.
    let found = -1;
    for (let j = i + 2; j < n; j++) {
      const travel = cum[j] - cum[i];
      if (travel < LAP_MIN) continue;
      if (travel > LAP_MAX || travel >= routeLength * LAP_ROUTE_SHARE) break;
      if (close(i, j)) {
        found = j;
        break;
      }
    }
    if (found < 0) {
      kept.push(points[i + 1]);
      i++;
      continue;
    }
    // Where it closes best: the nearest the line comes back to where it
    // left, so the turn leaves no hook of the lap behind on either side.
    {
      let [bi, bj] = [i, found];
      for (let k = i; k < found && cum[k] - cum[i] <= 2 * THROUGH_CLOSE; k++) {
        for (let j = found; j < n && cum[j] - cum[found] <= 2 * THROUGH_CLOSE; j++) {
          if (cum[j] - cum[k] >= LAP_MIN && close(k, j) && dist(points[k], points[j]) < dist(points[bi], points[bj])) [bi, bj] = [k, j];
        }
      }
      for (let k = i + 1; k <= bi; k++) kept.push(points[k]);
      [i, found] = [bi, bj];
    }
    const lap = points.slice(i, found + 1);
    // How far it reaches, and where.
    let far = 0;
    for (let k = 1; k < lap.length; k++) if (dist(lap[k], lap[0]) > dist(lap[far], lap[0])) far = k;
    // A thin lap reaching farther than a turn is a street each way (a
    // one-way pair, or out and back along one street), not a loop: it
    // stays, and the streets show it. A short one is a spur off a line that
    // goes on another way (the ramp to a turn and back), and goes; one the
    // line comes back along is the end of the line, and stays.
    const reach = dist(lap[far], lap[0]);
    const thin = Math.abs(area(lap)) < LAP_FAT * (cum[found] - cum[i]) ** 2;
    // A lap that goes round a terminal's hall is the way buses get in and out
    // of it, not a route a rider can ride: the block it makes is the
    // approach, and the map draws only as far as the terminal (DESIGN.md,
    // "Bus routes", "Terminals"). It goes even where one side of it runs a
    // street of its own, because that street is not the route's.
    const aroundHall = halls.some((ring) => insideRing(centroidOf(ring), lap) || ring.some((p) => insideRing(p, lap)));
    // How the line leaves against how it came: null where it can't be told
    // (the lap is at an end of the line).
    const turnCos = () => {
      const k = Math.ceil(SPUR_BACK / STEP);
      if (i - k < 0 || found + k >= n) return null;
      const a = [points[i][0] - points[i - k][0], points[i][1] - points[i - k][1]];
      const b = [points[found + k][0] - points[found][0], points[found + k][1] - points[found][1]];
      return (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b) || 1);
    };
    const spur = () => (turnCos() ?? -1) > SPUR_COS;
    // A lap with no stop and no station or transit center anywhere near it is
    // two directions of a freeway, a ramp or an interchange the bus passes
    // through without picking anyone up: one line through the middle, not a
    // loop or a street each way (DESIGN.md, "Bus routes", "Readable
    // geometry"). A one-way pair a rider can use has stops along it, and a
    // terminal loop has its place, so both stay.
    const through =
      express &&
      !aroundHall &&
      stopGrid &&
      lap.every((p) => stopGrid.near(p, THROUGH_STOP).length === 0) &&
      !places.some((q) => lap.some((p) => dist(p, q) <= STOP_NEAR));
    if (!through && thin && !aroundHall && (reach >= SPUR_REACH || !spur())) {
      kept.push(points[i + 1]);
      i++;
      continue;
    }
    // A small lap the line comes back out of the way it went in is the tip
    // of an out-and-back along one street (both ways of a two-way street,
    // merged above), not a turn at a crossing: taken out, it would shorten
    // the street it ends, again on every pass, and leave driven road
    // undrawn. It stays; the street is drawn once over both ways.
    // (Under TIP_TINY it can't be one: going out LAP_MIN and back along one
    // line reaches further. It is the lens where a road's two carriageways
    // meet, and goes.)
    if (!through && reach < CIRCLE && reach >= TIP_TINY && (turnCos() ?? 1) <= SPUR_COS && !aroundHall) {
      kept.push(points[i + 1]);
      i++;
      continue;
    }
    if (through) note('through', lap);
    else if (reach >= CIRCLE) {
      // A short end: the shorter way round to the place the loop serves,
      // the station or transit center nearest it within PLACE_NEAR, or with
      // none, to its farthest point.
      let best = PLACE_NEAR;
      let serves = false;
      for (const q of places) {
        for (let k = 1; k < lap.length; k++) {
          const d = dist(lap[k], q);
          if (d < best) [best, far, serves] = [d, k, true];
        }
      }
      const lapCum = cum.slice(i, found + 1).map((c) => c - cum[i]);
      const out = lapCum[far] <= lapCum.at(-1) - lapCum[far] ? lap.slice(0, far + 1) : lap.slice(far).reverse();
      // A loop round more than a block or two of streets of its own is a
      // circuit a rider can read (its arrows say which way), and stays,
      // unless it is there to turn at a station or transit center.
      if (!aroundHall && dropped(lap, out) > (serves ? LAP_DROP_SERVES : LAP_DROP)) {
        kept.push(points[i + 1]);
        i++;
        continue;
      }
      // Starting from where the line goes on, so the end hangs off it.
      out[0] = points[i];
      ends.push(out);
      note('end', lap);
    } else note('turn', lap);
    // The line goes on from where the lap closed, through the middle of
    // its two ends.
    const mid = [(points[i][0] + points[found][0]) / 2, (points[i][1] + points[found][1]) / 2];
    kept[kept.length - 1] = mid;
    if (ends.length && ends.at(-1)[0] === points[i]) ends.at(-1)[0] = mid;
    i = found;
  }
  return [kept, ...ends].filter((p) => p.length >= 2 && length(p) >= MIN_PIECE);
}

// A part of a route that begins (or ends) a little way past where another
// part of it ends, then runs on through that end, has a stub: what is left
// of a turn taken out where the route came to it in two pieces. The stub
// goes, and the part starts where the other ends, so the two are one line
// with no loose end (in place).
export const HOOK_NEAR = 10;
export const HOOK_LONG = 80;
export function trimHooks(parts) {
  for (const p of parts) {
    for (const atEnd of [false, true]) {
      const pts = atEnd ? [...p.points].reverse() : p.points;
      if (pts.length < 3) continue;
      let cut = -1;
      let at = null;
      for (const q of parts) {
        if (q === p) continue;
        for (const e of [q.points[0], q.points.at(-1)]) {
          if (dist(e, pts[0]) <= 3) continue;
          for (let k = 1, run = 0; k < pts.length - 1; k++) {
            run += dist(pts[k - 1], pts[k]);
            if (run > HOOK_LONG) break;
            if (dist(pts[k], e) <= HOOK_NEAR) {
              if (k > cut) [cut, at] = [k, e];
              break;
            }
          }
        }
      }
      if (cut < 0) continue;
      const kept = [at, ...pts.slice(cut + 1)];
      p.points = atEnd ? kept.reverse() : kept;
    }
  }
}

// Both carriageways of a road onto its middle line (in place). Where no stop
// is near, the pair may be a freeway's two ramps, which swing wider than a
// city pair: merge them within THROUGH_FAR too (DESIGN.md, "Bus routes",
// "Readable geometry").
export function mergeCarriageways(parts, { stopGrid = null, express = false } = {}) {
  const grid = new Grid(stopGrid ? THROUGH_FAR : PAIR_FAR);
  parts.forEach((p, pi) => {
    p.cum = [0];
    for (let i = 1; i < p.points.length; i++) {
      p.cum.push(p.cum[i - 1] + dist(p.points[i - 1], p.points[i]));
      grid.add(p.points[i - 1], p.points[i], { pi, i });
    }
  });
  const moves = parts.map((p, self) => {
    const pts = p.points;
    // The nearest parallel line of the same route, at each point: another
    // part, or this one far enough along that it isn't the same stretch.
    const found = pts.map((pt, i) => {
      const d = dirAt(pts, i);
      const through = express && stopGrid ? stopGrid.near(pt, STOP_NEAR).length === 0 : false;
      const far = through ? THROUGH_FAR : PAIR_FAR;
      const near = through ? THROUGH_NEAR : PAIR_NEAR;
      let best = null;
      for (const { a, b, item } of grid.near(pt, far)) {
        const v = [b[0] - a[0], b[1] - a[1]];
        const len = Math.hypot(...v) || 1;
        const dot = (d[0] * v[0] + d[1] * v[1]) / len;
        if (Math.abs(dot) < PAIR_COS) continue;
        const q = closestOnSegment(pt, a, b);
        const dd = dist(pt, q);
        // This line further along: its other carriageway where it has come
        // back the other way (the tip of an out-and-back, both ways of a
        // road whose median ends) and travelled more than across and back,
        // so a circle or a bend isn't taken for one.
        if (item.pi === self) {
          const along = Math.abs(parts[item.pi].cum[item.i] - p.cum[i]);
          if (along < far * 3 && !(dot < 0 && along >= 2 * dd + TIP_SLACK)) continue;
        }
        // The same line (a part drawn twice) needs no moving.
        if (dd < 1) continue;
        if (!best || dd < best.d) best = { d: dd, q, far, near, side: Math.sign(d[0] * (q[1] - pt[1]) - d[1] * (q[0] - pt[0])) };
      }
      return best;
    });
    // Beside it for PAIR_RUN or more, on one side of it, or not at all.
    // Two lines that cross at a shallow angle (ramps of an interchange
    // making an X) are beside each other on one side, then the other: each
    // side is judged alone, so they cross as two roads.
    let side = 0;
    for (const f of found) {
      if (!f) side = 0;
      else if (f.d > CROSS_CLEAR) side = f.side;
      if (f) f.run = side;
    }
    for (let k = found.length - 1, next = 0; k >= 0; k--) {
      const f = found[k];
      if (!f) next = 0;
      else if (f.run) next = f.run;
      else f.run = next;
    }
    for (let i = 0; i < found.length; ) {
      if (!found[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < found.length && found[j] && found[j].run === found[i].run) j++;
      if (p.cum[j - 1] - p.cum[i] < PAIR_RUN) for (let k = i; k < j; k++) found[k] = null;
      i = j;
    }
    return found.map((f, i) => {
      if (!f) return pts[i];
      const w = Math.max(0, Math.min(1, (f.far - f.d) / (f.far - f.near)));
      return [pts[i][0] + (w * (f.q[0] - pts[i][0])) / 2, pts[i][1] + (w * (f.q[1] - pts[i][1])) / 2];
    });
  });
  parts.forEach((p, pi) => {
    p.points = moves[pi];
    delete p.cum;
  });
}

// How much of a lap lies further than PAIR_FAR from its short end.
function dropped(lap, end) {
  let off = 0;
  for (let k = 1; k < lap.length; k++) {
    let near = Infinity;
    for (let m = 1; m < end.length && near > PAIR_FAR; m++) near = Math.min(near, segDist(lap[k], end[m - 1], end[m]));
    if (near > PAIR_FAR) off += dist(lap[k - 1], lap[k]);
  }
  return off;
}

// Is the point inside the ring (even-odd, the ring closed from its last point
// back to its first)?
function insideRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function centroidOf(ring) {
  const [x, y] = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
  return [x / ring.length, y / ring.length];
}

// Signed area of a closed ring of points.
function area(ring) {
  let a = 0;
  for (let k = 0; k < ring.length; k++) {
    const [p, q] = [ring[k], ring[(k + 1) % ring.length]];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const segDist = (p, a, b) => dist(p, closestOnSegment(p, a, b));

function dirAt(points, i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const len = dist(a, b) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
