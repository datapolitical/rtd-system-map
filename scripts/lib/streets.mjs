// Streets by combined bus frequency (DESIGN.md, "Bus routes"). Each street
// a bus runs on is drawn once, and its width says how often a bus comes
// along that stretch, every route on it counted together: a downtown street
// with twelve routes is one very thick line, a street with one hourly route
// a hairline. (Chris, 2026-11-08: "show the frequency of the section of road
// and just have it scale up, so it's a single line but very thick".)
//
// 1. Each route's line, once (the longest piece whole, the others only where
//    they go somewhere it doesn't), as points STEP apart. Each point takes
//    the route's weekday departures in the window past there, each way along
//    the line, from the cells busStretches measured (`loads`).
// 2. Every point finds the other routes running alongside: within ALONG
//    meters and ANGLE degrees of the same bearing, and alongside for at least
//    TOGETHER meters, so routes that merely cross, or a one-way pair whose
//    streets meet at an end, don't count. Where routes run together the
//    drawn point is moved to the middle of them, so the street is drawn once
//    where they all run, within meters of each.
// 3. A point's buses per hour come from the departures of every all-day
//    route alongside it, merged each way along the street; the busier way
//    counts (a one-way street has one). The rate is the rider's: the wait a
//    rider arriving at random expects, doubled (the sum of the squared gaps
//    over the sum of the gaps; `rate`), so two every-30 routes that leave a
//    minute apart stay "every 30", and only buses that interleave add up to
//    a faster street. Part-time routes (rush hours, a few trips) are listed
//    but add nothing: they keep their own dashed lines.
// 4. A shared run is drawn once, by the route first in number order, and cut
//    where the routes or the class change. Runs are joined end to end where
//    a route joins or leaves, so a branch starts on the trunk's middle line
//    and a trunk ends where its branch begins, with no gap or stub.

import { MIDDAY } from './gtfs.mjs';
import { Grid, closestOnSegment, dedupe, densify as densifyBy, direction, length, partsOf, projection, segmentDistance, simplify } from './geom.mjs';
import { CLASS_RANK, classOf as classOfBph } from '../../public/js/frequency.js';

// How far apart points are compared along each line.
const STEP = 20;
// Routes this close, running the same way, share a street...
const ALONG = 35;
const ANGLE_COS = Math.cos((25 * Math.PI) / 180);
// ...for at least this far. Shorter is a crossing or a touch, not a street.
export const TOGETHER = 50;
// Routes this close count fully toward the middle of their street.
const CLOSE = 15;
// A route's own pieces this close are the same street (both directions drawn).
const OWN = 30;
// A point takes the route's cell within this distance.
const CELL = 60;
// Within one set of routes, a class that holds for less than this is the
// same buses read a little differently (a trip at the window's edge), and
// takes its neighbour's class.
export const CLASS_MIN = 200;
// Buses the other way at most this share of the busier way's: one way.
const ONE_WAY = 0.15;
// One way or two for less than this is the same street read a little
// differently (a cell at a corner), and takes its neighbour's.
const ONE_WAY_MIN = 150;
// A run's loose end joins another run's end this close (a junction).
const JOIN = ALONG + STEP;
// ...if it lies ahead of the end, within this of its bearing (measured over
// JOIN_BACK of its line), or closer than JOIN_ANY.
const JOIN_COS = Math.cos((60 * Math.PI) / 180);
const JOIN_BACK = 20;
const JOIN_ANY = 8;
// Tiers that run through the window and so count toward the street.
const ALL_DAY = new Set(['frequent', 'every30', 'hourly', 'infrequent']);
const HOURS = (MIDDAY[1] - MIDDAY[0]) / 3600;

const collator = new Intl.Collator('en', { numeric: true });
const byNumber = (a, b) => collator.compare(a, b);
const densify = (points) => densifyBy(points, STEP);

/**
 * `features` are the bus route features as drawn (stretches with `route`,
 * `tier` and `wk`); `loads` is busStretches' per-route cells. Returns
 * LineString features, one per stretch of street, with `routes` (every route
 * along it, space-separated, in number order), `n` (how many run all day),
 * `bph` (buses per hour in the busier direction, to a tenth), `hw` (the
 * combined wait in minutes, rounded) and `cls` (its class, frequency.js).
 */
export function busStreets(features, loads = new Map(), { precision = 5, simplify: tolerance = 1, classOf = classOfBph } = {}) {
  const first = features.find((f) => partsOf(f.geometry).some((p) => p.length));
  if (!first) return [];
  const { project, unproject } = projection(partsOf(first.geometry).find((p) => p.length)[0], precision);

  // 1. Each route's line once, with the departures past each point.
  const tracks = buildTracks(features, loads, project);
  const position = new Map([...new Set(tracks.map((t) => t.route))].sort(byNumber).map((r, i) => [r, i]));
  const inOrder = (a, b) => position.get(a) - position.get(b);

  // 2. The routes alongside each point.
  const all = new Grid(ALONG);
  for (const t of tracks) for (let i = 1; i < t.points.length; i++) all.add(t.points[i - 1], t.points[i], { track: t, i });
  for (const t of tracks) {
    t.beside = t.points.map((p, i) => {
      const found = new Map();
      for (const { item, a, b } of all.near(p, ALONG)) {
        const other = item.track;
        if (other === t || found.has(other.route)) continue;
        const v = [b[0] - a[0], b[1] - a[1]];
        const len = Math.hypot(...v) || 1;
        const dot = (t.dirs[i][0] * v[0] + t.dirs[i][1] * v[1]) / len;
        if (Math.abs(dot) < ANGLE_COS) continue;
        // Alongside, not off the end of the other route.
        const foot = ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len;
        if (foot < -1 || foot > len + 1) continue;
        const at = closestOnSegment(p, a, b);
        const k = Math.hypot(at[0] - a[0], at[1] - a[1]) < len / 2 ? item.i - 1 : item.i;
        found.set(other.route, { track: other, k, at, flipped: dot < 0 });
      }
      return found;
    });
    // Alongside for TOGETHER or more, or not at all: a run of points sharing
    // a route that is shorter is dropped.
    for (const r of new Set(t.beside.flatMap((m) => [...m.keys()]))) {
      const has = t.beside.map((m) => m.has(r));
      for (let i = 0; i < has.length; ) {
        if (!has[i]) {
          i++;
          continue;
        }
        let j = i;
        while (j < has.length && has[j]) j++;
        if (length(t.points.slice(i, j)) < TOGETHER) for (let k = i; k < j; k++) t.beside[k].delete(r);
        i = j;
      }
    }
  }

  // Alongside goes both ways: where one route finds another beside it but
  // not the other way round (an end, a sharper bend), the other is told,
  // so the route first in number order, which draws the street, knows it
  // does, and the street has no gap.
  for (const t of tracks) {
    t.beside.forEach((m, i) => {
      for (const f of m.values()) {
        const back = f.track.beside[f.k];
        if (!back.has(t.route)) back.set(t.route, { track: t, k: i, at: t.points[i], flipped: f.flipped });
      }
    });
  }

  // Where routes run together, each point is drawn in the middle of them. A
  // route that has started to leave counts for less and less (from CLOSE
  // away to ALONG), so it doesn't pull the street after it.
  for (const t of tracks) {
    t.mean = t.points.map((p, i) => {
      let [sx, sy, sw] = [p[0], p[1], 1];
      for (const f of t.beside[i].values()) {
        const w = Math.max(0, Math.min(1, (ALONG - dist(p, f.at)) / (ALONG - CLOSE)));
        [sx, sy, sw] = [sx + w * f.at[0], sy + w * f.at[1], sw + w];
      }
      return [sx / sw, sy / sw];
    });
  }

  // 3. Buses per hour at each point: every all-day route alongside, merged
  // each way along this track's line.
  for (const t of tracks) {
    const dirs = [];
    t.bph = t.points.map((p, i) => {
      const w = [...t.load[i].with];
      const a = [...t.load[i].against];
      for (const f of t.beside[i].values()) {
        const l = f.track.load[f.k];
        w.push(...(f.flipped ? l.against : l.with));
        a.push(...(f.flipped ? l.with : l.against));
      }
      // One way: buses run only with the line, or only against it.
      const [rw, ra] = [rate(w), rate(a)];
      dirs[i] = rw > 0 && ra <= ONE_WAY * rw ? 1 : ra > 0 && rw <= ONE_WAY * ra ? -1 : 0;
      return Math.max(rw, ra);
    });
    t.oneway = steady(t, dirs, ONE_WAY_MIN);
    t.routes = t.points.map((p, i) => [t.route, ...t.beside[i].keys()].sort(byNumber));
    t.n = t.points.map((p, i) => (t.allDay[i] ? 1 : 0) + [...t.beside[i].values()].filter((f) => f.track.allDay[f.k]).length);
    t.pt = t.points.map((p, i) => t.routes[i].length - t.n[i]);
    t.cls = smoothClasses(t, t.bph.map(classOf));
  }

  // 4. Each shared run once, from the first route in number order, cut
  // where the routes or the class change. Two runs on one track share the
  // vertex at their cut, taken on the shared side (the first point where a
  // route has joined, the last where one is still there), which is on the
  // middle line of the street: a trunk ends where its branch begins, and a
  // branch starts from the trunk's middle, with no stub of trunk along it.
  const runs = [];
  for (const t of tracks) {
    const owned = t.routes.map((rs) => rs.every((r) => position.get(r) >= position.get(t.route)));
    const key = (i) => (owned[i] ? `${t.routes[i].join(' ')}|${t.cls[i]}|${t.oneway[i]}` : null);
    const n = t.points.length;
    const cuts = [0];
    for (let i = 1; i < n; i++) if (key(i) !== key(i - 1)) cuts.push(i);
    cuts.push(n);
    const vertex = (c) => (c <= 0 ? 0 : c >= n ? n - 1 : t.beside[c].size > t.beside[c - 1].size ? c : c - 1);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const [a, b] = [cuts[k], cuts[k + 1]];
      if (key(a) == null || !t.n[a]) continue;
      const [from, to] = [vertex(a), vertex(b)];
      if (to <= from) continue;
      const idx = Array.from({ length: to - from + 1 }, (_, j) => from + j);
      runs.push({
        track: t,
        from,
        to,
        points: idx.map((j) => t.mean[j]),
        routes: t.routes[a],
        n: t.n[a],
        pt: t.pt[a],
        cls: t.cls[a],
        oneway: t.oneway[a],
        bph: median(Array.from({ length: b - a }, (_, j) => t.bph[a + j])),
        // A loose end: the track goes on, but another route owns the street
        // there. It is joined to the run that has the street.
        openStart: a > 0 && !owned[a - 1],
        openEnd: b < n && !owned[b],
      });
    }
  }
  joinEnds(runs);
  // At a cut, the heavier run goes on one point into the lighter (the width
  // of an intersection), so the heavier line runs through the crossing
  // where routes part, with its corner rounded, and the lighter one begins
  // flush inside it: a butt end on a bend would leave a notch.
  for (const t of tracks) {
    const mine = runs.filter((r) => r.track === t).sort((a, b) => a.from - b.from);
    for (let k = 1; k < mine.length; k++) {
      const [a, b] = [mine[k - 1], mine[k]];
      if (a.to !== b.from) continue;
      const v = a.to;
      if (CLASS_RANK[b.cls] > CLASS_RANK[a.cls]) b.points.unshift(t.mean[v - 1]);
      else if (v + 1 <= b.to) a.points.push(t.mean[v + 1]);
    }
  }

  const out = runs
    .map((run) => {
      // A one-way street is drawn the way its buses go, so its arrows point
      // that way.
      const coords = dedupe(simplify(dedupe(run.points), tolerance).map(unproject));
      if (run.oneway < 0) coords.reverse();
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {
          mode: 'bus',
          routes: run.routes.join(' '),
          n: run.n,
          // Part-time routes alongside (their own strands, dashed).
          ...(run.pt ? { pt: run.pt } : {}),
          bph: Math.round(run.bph * 10) / 10,
          hw: run.bph > 0 ? Math.max(1, Math.round(60 / run.bph)) : null,
          cls: run.cls,
          ...(run.oneway ? { oneway: 1, len: Math.round(length(run.points)) } : {}),
        },
      };
    })
    .filter((f) => f.geometry.coordinates.length >= 2);
  return wyes(out, { precision });
}

// Each route's line once, as tracks of points with the route's departures
// past each point each way along the line, and whether the route runs all
// day there.
function buildTracks(features, loads, project) {
  const pieces = new Map(); // route -> [{ points, tier, wk }]
  for (const f of features) {
    const { route, tier, wk } = f.properties;
    for (const part of partsOf(f.geometry)) {
      if (part.length < 2) continue;
      (pieces.get(route) ?? pieces.set(route, []).get(route)).push({ points: densify(part.map(project)), tier, wk });
    }
  }
  const tracks = [];
  for (const [route, list] of pieces) {
    const kept = new Grid(OWN);
    const mine = [];
    list.sort((a, b) => length(b.points) - length(a.points));
    for (const { points, tier, wk } of list) {
      // Its own street already kept, or this piece's own earlier line (a
      // piece that goes out and comes back along one street).
      const cum = [0];
      for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
      const self = new Grid(OWN);
      let added = 0;
      const own = points.map((p, i) => {
        while (added + 1 < i && cum[i] - cum[added + 1] > 3 * OWN) {
          self.add(points[added], points[added + 1], added);
          added++;
        }
        return kept.near(p, OWN).length > 0 || self.near(p, OWN).length > 0;
      });
      let start = -1;
      for (let i = 0; i <= points.length; i++) {
        const free = i < points.length && !own[i];
        if (free && start < 0) start = i;
        if (!free && start >= 0) {
          const run = points.slice(Math.max(0, start - 1), Math.min(points.length, i + 1));
          // An end that lies on a piece already kept is moved onto its line,
          // so the route's own branch starts from its own street.
          if (start > 0) run[0] = onto(kept, run[0]);
          if (i < points.length) run[run.length - 1] = onto(kept, run[run.length - 1]);
          if (run.length >= 2 && length(run) >= STEP) mine.push({ route, points: run, tiers: run.map(() => tier), wks: run.map(() => wk) });
          start = -1;
        }
      }
      for (let i = 1; i < points.length; i++) kept.add(points[i - 1], points[i], { route, tier });
    }
    // The route's cells, to read each point's departures from.
    const cells = new Grid(CELL);
    for (const c of loads.get(route) ?? []) {
      const at = project(c.at);
      cells.add(at, at, c);
    }
    for (const t of chain(mine)) {
      t.dirs = t.points.map((_, i) => direction(t.points, i));
      t.allDay = t.tiers.map((tier) => ALL_DAY.has(tier));
      t.load = t.points.map((p, i) => {
        if (!t.allDay[i]) return { with: [], against: [] };
        const near = cells.near(p, CELL).map((s) => s.item).sort((a, b) => dist(project(a.at), p) - dist(project(b.at), p));
        const cell = near.find((c) => ALL_DAY.has(c.tier)) ?? near[0];
        if (!cell) {
          // No cell measured here: the stretch's own headway, both ways, as
          // evenly spaced departures.
          const times = t.wks[i] ? Array.from({ length: Math.floor((HOURS * 60) / t.wks[i]) }, (_, k) => MIDDAY[0] + k * t.wks[i] * 60) : [];
          return { with: times, against: times };
        }
        const same = cell.dir[0] * t.dirs[i][0] + cell.dir[1] * t.dirs[i][1] >= 0;
        return same ? { with: cell.with, against: cell.against } : { with: cell.against, against: cell.with };
      });
      tracks.push(t);
    }
  }
  return tracks;
}

// A route's stretches, joined where one ends where the next begins, so a
// street isn't cut where a route's own tier changes but its company doesn't.
function chain(list) {
  const out = [];
  const used = new Set();
  // Ends this close are one line broken where a bit of it was dropped as
  // the route's own street (a few meters of RTD's line left over).
  const meet = (a, b) => dist(a, b) <= OWN + STEP;
  const reversed = (t) => ({ points: [...t.points].reverse(), tiers: [...t.tiers].reverse(), wks: [...t.wks].reverse() });
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let { points, tiers, wks } = list[i];
    for (let grew = true; grew; ) {
      grew = false;
      for (let j = 0; j < list.length; j++) {
        if (used.has(j)) continue;
        const t = list[j];
        const [first, last] = [t.points[0], t.points.at(-1)];
        const after = meet(points.at(-1), first) ? t : meet(points.at(-1), last) ? reversed(t) : null;
        const before = after ? null : meet(points[0], last) ? t : meet(points[0], first) ? reversed(t) : null;
        if (after) {
          points = points.concat(after.points.slice(1));
          tiers = tiers.concat(after.tiers.slice(1));
          wks = wks.concat(after.wks.slice(1));
        } else if (before) {
          points = before.points.concat(points.slice(1));
          tiers = before.tiers.concat(tiers.slice(1));
          wks = before.wks.concat(wks.slice(1));
        } else continue;
        used.add(j);
        grew = true;
      }
    }
    out.push({ route: list[i].route, points, tiers, wks });
  }
  return out;
}

// A run of one class shorter than CLASS_MIN takes the class of its longer
// neighbour, shortest first: a neighbour with the same routes, or one a
// single class away, so a street's width doesn't flicker where routes join
// one after another, as they do into a terminal.
function smoothClasses(t, cls) {
  const out = [...cls];
  const setKey = (i) => t.routes[i].join(' ');
  for (let pass = 0; pass < 100; pass++) {
    const runs = [];
    for (let i = 0; i < out.length; ) {
      let j = i;
      while (j < out.length && out[j] === out[i] && setKey(j) === setKey(i)) j++;
      runs.push({ from: i, to: j, length: length(t.points.slice(i, Math.min(out.length, j + 1))) });
      i = j;
    }
    const candidates = runs
      .map((r, k) => {
        if (r.length >= CLASS_MIN) return null;
        // A neighbour with the same routes, or one a single class away (a
        // route joining or leaving tips the rate over a boundary and back).
        const near = [runs[k - 1], runs[k + 1]].filter(
          (n) => n && (setKey(n.from) === setKey(r.from) || Math.abs(CLASS_RANK[out[n.from]] - CLASS_RANK[out[r.from]]) === 1),
        );
        return near.length ? { r, into: near.sort((a, b) => b.length - a.length)[0] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.r.length - b.r.length);
    if (!candidates.length) return out;
    const { r, into } = candidates[0];
    for (let i = r.from; i < r.to; i++) out[i] = out[into.from];
  }
  return out;
}

// A run of one value shorter than `min` takes its longer neighbour's,
// shortest first, so a street isn't one way for a few meters.
function steady(t, values, min) {
  const out = [...values];
  for (let pass = 0; pass < 100; pass++) {
    const runs = [];
    for (let i = 0; i < out.length; ) {
      let j = i;
      while (j < out.length && out[j] === out[i]) j++;
      runs.push({ from: i, to: j, length: length(t.points.slice(i, Math.min(out.length, j + 1))) });
      i = j;
    }
    if (runs.length < 2) return out;
    const short = runs.map((r, k) => ({ r, k })).filter(({ r }) => r.length < min).sort((a, b) => a.r.length - b.r.length)[0];
    if (!short) return out;
    const near = [runs[short.k - 1], runs[short.k + 1]].filter(Boolean).sort((a, b) => b.length - a.length)[0];
    for (let i = short.r.from; i < short.r.to; i++) out[i] = out[near.from];
  }
  return out;
}

// Loose ends meet. Two loose ends within JOIN of each other (a trunk's end
// and the start of the run that takes its street over, or a branch leaving)
// are both set to the point between them, nearest pair first; a loose end
// with no partner is carried onto the nearest other run's line, if one is
// within JOIN, so a branch starts on the street it leaves.
function joinEnds(runs) {
  const ends = [];
  for (const run of runs) {
    if (run.openStart) ends.push({ run, side: 0 });
    if (run.openEnd) ends.push({ run, side: 1 });
  }
  const at = (e) => (e.side ? e.run.points.at(-1) : e.run.points[0]);
  const set = (e, p) => (e.side ? (e.run.points[e.run.points.length - 1] = p) : (e.run.points[0] = p));
  // An end goes on only ahead of itself: a point off to its side is another
  // road it crosses or passes (the ramps of an interchange), and joining it
  // would draw a tick or close a triangle there.
  const ahead = (e, q) => {
    const pts = e.side ? [...e.run.points].reverse() : e.run.points;
    const p = pts[0];
    if (dist(p, q) <= JOIN_ANY) return true;
    let k = 1;
    while (k < pts.length - 1 && dist(pts[k], p) < JOIN_BACK) k++;
    const v = [p[0] - pts[k][0], p[1] - pts[k][1]];
    const w = [q[0] - p[0], q[1] - p[1]];
    return (v[0] * w[0] + v[1] * w[1]) / ((Math.hypot(...v) * Math.hypot(...w)) || 1) >= JOIN_COS;
  };
  const pairs = [];
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      if (ends[i].run === ends[j].run) continue;
      const d = dist(at(ends[i]), at(ends[j]));
      if (d <= JOIN && ahead(ends[i], at(ends[j])) && ahead(ends[j], at(ends[i]))) pairs.push({ d, a: ends[i], b: ends[j] });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  const done = new Set();
  const groups = []; // ends joined at one point, with the point
  for (const { a, b } of pairs) {
    if (done.has(a) && done.has(b)) continue;
    const ga = groups.find((g) => g.ends.includes(a));
    const gb = groups.find((g) => g.ends.includes(b));
    if (ga && gb) continue;
    const g = ga ?? gb ?? { ends: [] };
    if (!ga && !gb) groups.push(g);
    for (const e of [a, b]) if (!g.ends.includes(e)) g.ends.push(e);
    done.add(a);
    done.add(b);
  }
  for (const g of groups) {
    const sum = g.ends.map(at).reduce((p, q) => [p[0] + q[0], p[1] + q[1]], [0, 0]);
    const p = [sum[0] / g.ends.length, sum[1] / g.ends.length];
    for (const e of g.ends) set(e, p);
  }
  // Loose ends with no partner: onto the nearest other run's line.
  const grid = new Grid(JOIN);
  for (const run of runs) for (let i = 1; i < run.points.length; i++) grid.add(run.points[i - 1], run.points[i], run);
  for (const e of ends) {
    if (done.has(e)) continue;
    const p = at(e);
    // A run that carries one of this run's routes first: the street the
    // route came along, not a branch leaving it there.
    const shares = (run) => run.routes.some((r) => e.run.routes.includes(r));
    let best = null;
    for (const seg of grid.near(p, JOIN)) {
      if (seg.item === e.run) continue;
      const q = closestOnSegment(p, seg.a, seg.b);
      const d = dist(p, q);
      if (!ahead(e, q)) continue;
      const rank = shares(seg.item) ? 0 : 1;
      if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { d, q, rank };
    }
    if (best && best.d > 0.5) (e.side ? e.run.points.push(best.q) : e.run.points.unshift(best.q));
  }
}

// Buses per hour as a rider waits for them: departure `times` (seconds) in
// the window, in any order, give the gaps between them; the expected wait of
// someone arriving at random is half the sum of the squared gaps over the
// sum of the gaps, so that doubled is the headway they feel, and the rate is
// an hour over it. Evenly spaced buses give their plain rate; a pair that
// leaves together counts about as one. Under two departures: the plain rate.
export function rate(times) {
  if (times.length < 2) return times.length / HOURS;
  const s = [...times].sort((a, b) => a - b);
  let [sum, sq] = [0, 0];
  for (let i = 1; i < s.length; i++) {
    const g = s[i] - s[i - 1];
    sum += g;
    sq += g * g;
  }
  if (!sum) return s.length / HOURS;
  return 3600 / (sq / sum);
}

// The nearest point on the lines in `grid` within OWN of `p`, else `p`.
function onto(grid, p) {
  let best = null;
  for (const seg of grid.near(p, OWN)) {
    const q = closestOnSegment(p, seg.a, seg.b);
    const d = dist(p, q);
    if (!best || d < best.d) best = { d, q };
  }
  return best ? best.q : p;
}

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export { CLASS_RANK, segmentDistance };

// Terminals (DESIGN.md, "Bus routes", "Terminals"). Where several streets
// end at one of RTD's facilities (TERMINAL_ENDS dead ends within
// TERMINAL_NEAR of it), the buses are laying over in a bus station, and the
// lanes and loops they drive inside it are not streets a rider can use:
// drawn, they are a tangle of short diagonals and triangles. So the place is
// drawn as one: streets lying wholly within TERMINAL_R of it go, no street
// within TERMINAL_CALM of it carries one-way arrows, and the facility is
// marked `terminal` (the page draws one calm mark there). `streets` is
// changed in place and returned; `places` are [lon, lat] points. Returns
// the indexes of the places that are terminals.
export const TERMINAL_NEAR = 120;
export const TERMINAL_ENDS = 3;
export const TERMINAL_R = 70;
export const TERMINAL_CALM = 130;
export function terminals(streets, places, { precision = 5 } = {}) {
  if (!streets.length || !places.length) return [];
  const { project } = projection(places[0], precision);
  const lines = streets.map((f) => f.geometry.coordinates.map(project));
  const grid = new Grid(TERMINAL_NEAR);
  lines.forEach((l, li) => {
    for (let i = 1; i < l.length; i++) grid.add(l[i - 1], l[i], li);
  });
  // A street's end that touches no other street.
  const deadEnds = [];
  lines.forEach((l, li) => {
    for (const p of [l[0], l.at(-1)]) {
      if (!grid.near(p, 2).some((seg) => seg.item !== li)) deadEnds.push(p);
    }
  });
  const ends = new Grid(TERMINAL_NEAR);
  for (const p of deadEnds) ends.add(p, p, p);
  const found = [];
  places.forEach((q, qi) => {
    const c = project(q);
    if (ends.near(c, TERMINAL_NEAR).length >= TERMINAL_ENDS) found.push({ qi, c });
  });
  if (!found.length) return [];
  const near = (p, r) => found.some(({ c }) => dist(p, c) <= r);
  const keep = [];
  lines.forEach((l, li) => {
    if (l.every((p) => near(p, TERMINAL_R))) return;
    const f = streets[li];
    if (f.properties.oneway && near(alongBy(l, length(l) / 2), TERMINAL_CALM)) {
      delete f.properties.oneway;
      delete f.properties.len;
    }
    keep.push(f);
  });
  streets.splice(0, streets.length, ...keep);
  return found.map((t) => t.qi);
}

// The point `d` along a line.
function alongBy(l, d) {
  for (let i = 1; i < l.length; i++) {
    const s = dist(l[i - 1], l[i]);
    if (d <= s) return [l[i - 1][0] + ((l[i][0] - l[i - 1][0]) * d) / (s || 1), l[i - 1][1] + ((l[i][1] - l[i - 1][1]) * d) / (s || 1)];
    d -= s;
  }
  return l.at(-1);
}

// Wyes (DESIGN.md, "Bus routes", "Readable geometry"). Where a short
// street forks off another and both reach the same crossing street a little
// way apart (two ramps from one road up to a crossing road, one each way),
// the three close a small triangle: a knot at map scale. A fork under
// WYE_LEN, leaving the other street at under 75 degrees, whose far end is
// within WYE_GAP of where the other street, within WYE_LEN of the fork,
// meets that same crossing street, goes: its routes are listed on the
// street it forked from, which carries them to the crossing street. The
// fork becomes one line meeting the crossing street at one point. Only a
// fork whose every route came along the street it leaves (TOUCH is the
// build's own slack where runs meet, half of JOIN). Changes
// `streets` in place.
export const WYE_LEN = 150;
export const WYE_GAP = 100;
const WYE_COS = Math.cos((75 * Math.PI) / 180);
const WYE_STRAIGHT = Math.cos((30 * Math.PI) / 180);
const TOUCH = 25;
export const STUB = 60;
export function wyes(streets, { precision = 5 } = {}) {
  if (streets.length < 3) return streets;
  const { project } = projection(streets[0].geometry.coordinates[0], precision);
  const lines = streets.map((f) => densify(f.geometry.coordinates.map(project)));
  const grid = new Grid(JOIN);
  lines.forEach((l, li) => {
    for (let i = 1; i < l.length; i++) grid.add(l[i - 1], l[i], li);
  });
  const touching = (p, not) => new Set(grid.near(p, TOUCH).map((s) => s.item).filter((li) => !not.includes(li)));
  const gone = new Set();
  lines.forEach((l, a) => {
    if (length(l) >= WYE_LEN) return;
    for (const start of [true, false]) {
      if (gone.has(a)) return;
      const pts = start ? l : [...l].reverse();
      const [J, foot] = [pts[0], pts.at(-1)];
      let k = 1;
      while (k < pts.length - 1 && dist(pts[k], J) < JOIN_BACK) k++;
      const dir = [pts[k][0] - J[0], pts[k][1] - J[1]];
      // The street the fork ends on, which it meets at an angle: one it
      // runs straight on into is the rest of its own road, not a crossing.
      let m = pts.length - 2;
      while (m > 0 && dist(pts[m], foot) < JOIN_BACK) m--;
      const arrive = [foot[0] - pts[m][0], foot[1] - pts[m][1]];
      const crossing = new Set(
        grid
          .near(foot, TOUCH)
          .filter((seg) => seg.item !== a)
          .filter((seg) => {
            const v = [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]];
            return Math.abs(v[0] * arrive[0] + v[1] * arrive[1]) / (Math.hypot(...v) * Math.hypot(...arrive) || 1) < WYE_STRAIGHT;
          })
          .map((seg) => seg.item),
      );
      if (!crossing.size) continue;
      const mine = streets[a].properties.routes.split(' ');
      for (const b of touching(J, [a])) {
        if (gone.has(b) || crossing.has(b)) continue;
        // A fork of that street: every route on it came along it.
        const theirs = new Set(streets[b].properties.routes.split(' '));
        if (!mine.every((r) => theirs.has(r))) continue;
        const B = lines[b];
        let at = 0;
        for (let i = 1; i < B.length; i++) if (dist(B[i], J) < dist(B[at], J)) at = i;
        for (const step of [1, -1]) {
          const ahead = B[Math.max(0, Math.min(B.length - 1, at + step * 2))];
          const v = [ahead[0] - J[0], ahead[1] - J[1]];
          if ((v[0] * dir[0] + v[1] * dir[1]) / (Math.hypot(...v) * Math.hypot(...dir) || 1) < WYE_COS) continue;
          let walked = 0;
          let met = false;
          for (let i = at; i >= 0 && i < B.length && walked <= WYE_LEN && !met; i += step) {
            if (i !== at) walked += dist(B[i], B[i - step]);
            if (dist(B[i], foot) <= WYE_GAP && [...touching(B[i], [a, b])].some((c) => crossing.has(c))) met = true;
          }
          if (!met) continue;
          const [fa, fb] = [streets[a].properties, streets[b].properties];
          fb.routes = [...new Set([...fb.routes.split(' '), ...fa.routes.split(' ')])].sort(byNumber).join(' ');
          gone.add(a);
          break;
        }
        if (gone.has(a)) break;
      }
    }
  });
  // A stub: a street shorter than STUB that touches another at one end and
  // nothing at the other says nothing a reader can use, and reads as a
  // broken line.
  lines.forEach((l, a) => {
    if (gone.has(a) || length(l) >= STUB) return;
    const ends = [l[0], l.at(-1)].map((p) => grid.near(p, 3).some((seg) => seg.item !== a && !gone.has(seg.item)));
    if (ends[0] !== ends[1]) gone.add(a);
  });
  const kept = streets.filter((f, i) => !gone.has(i));
  streets.splice(0, streets.length, ...kept);
  return streets;
}
