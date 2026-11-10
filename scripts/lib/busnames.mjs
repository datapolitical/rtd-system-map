// Names for streets that buses share (DESIGN.md, "Bus routes"). Each route's
// number used to repeat along its own line, so a street with several routes
// read 30, 31, 30, 31 and nobody could tell which routes serve a block. This
// builds label runs instead: lines that cover every drawn bus route once,
// where routes running along the same street share one run, named by all of
// them ("0 · 15 · 48").
//
// 1. Each route's line, once: RTD sometimes draws a route's two directions
//    side by side, so the longest piece is kept whole and the others only
//    where they go somewhere it doesn't (a one-way couplet's other street).
// 2. Every point along it, about STEP apart, finds the other routes running
//    alongside: within ALONG meters and within ANGLE degrees of the same
//    bearing, so a route that merely crosses doesn't count.
// 3. Along each route, runs of points with the same routes are smoothed:
//    one shorter than MIN_RUN takes its longer neighbour's routes.
// 4. A shared run is named once, by the route that comes first in number
//    order: its points are kept, the others' dropped. What's left becomes
//    runs of one set of routes, and a run shorter than MIN_RUN joins the run
//    next to it on the same line, or is left out if it has none.

import { Grid, dedupe, densify as densifyBy, direction, length, partsOf, segmentDistance, simplify } from './geom.mjs';

// How far apart points are compared along each line.
const STEP = 20;
const densify = (points) => densifyBy(points, STEP);
// Routes this close, running the same way, share a street.
const ALONG = 35;
const ANGLE_COS = Math.cos((25 * Math.PI) / 180);
// A route's own pieces this close are the same street (both directions drawn).
const OWN = 30;
// Runs shorter than this are smoothed into a neighbour.
export const MIN_RUN = 150;
// A row names at most this many routes, one pill each (about 40% of a
// phone's width). When more share a street, the strongest MAX_PILLS - 1 are
// named and a "+" pill stands for the rest: tap it for the list. Counting
// them ("+13") was tried first: no one can act on the count, and it made
// every block's row different, so rows repeated block after block.
export const MAX_PILLS = 4;
export const MORE = '+';
const SEPARATOR = ' · ';
// Tiers a run's main label names: the routes drawn at strength from far out.
const MAIN = ['frequent', 'every30'];
const TIERS = ['frequent', 'every30', 'hourly', 'infrequent', 'peak', 'limited', 'none', 'unknown'];
const rank = (tier) => (TIERS.includes(tier) ? TIERS.indexOf(tier) : TIERS.length);
const collator = new Intl.Collator('en', { numeric: true });
const byNumber = (a, b) => collator.compare(a, b);

// How a pill is drawn: the two main tiers each have a look of their own, and
// every slower tier shares one (DESIGN.md, "Bus routes"). Rows carry the
// look, not the tier, so a street whose hourly route becomes a rush-hour one
// keeps one row, as its pills would look the same.
const look = (tier) => (MAIN.includes(tier) ? tier : 'slow');

/**
 * The pills for some routes, strongest tier first, then in number order:
 * [{ text, tier }] with `tier` the pill's look, all of them when they are
 * `max` or fewer, otherwise the strongest `max` - 1 and then
 * { text: '+', tier: 'more' }. `routes` are [{ route, tier }].
 */
export function pillRow(routes, max = MAX_PILLS) {
  const pills = [...routes].sort((a, b) => rank(a.tier) - rank(b.tier) || byNumber(a.route, b.route)).map((r) => ({ text: r.route, tier: look(r.tier) }));
  if (pills.length <= max) return pills;
  return [...pills.slice(0, max - 1), { text: MORE, tier: 'more' }];
}

// A row as the data carries it: "0:frequent 15:frequent +:more".
export const pillsText = (pills) => pills.map((p) => `${p.text}:${p.tier}`).join(' ');
// A row as text: "0 · 15 · 15L", with " +" when not every route is named.
export const rowText = (pills) =>
  pills.filter((p) => p.tier !== 'more').map((p) => p.text).join(SEPARATOR) + (pills.some((p) => p.tier === 'more') ? ` ${MORE}` : '');

/**
 * `features` are the bus route features as drawn (stretches with `route` and
 * `tier`). Returns LineString features with `pills` (the row for every route
 * there, see pillsText), `text_main` (the routes that are frequent or every
 * 30 there, as text, or ''), `more` (1 when the row doesn't name every
 * route), `routes` (every route, space-separated), `tier` (the strongest)
 * and `n` (how many routes). Where neighbouring runs on a street would get
 * the same row they are one run, so a row isn't repeated block after block
 * as routes join and leave a downtown street.
 */
export function busNames(features, { precision = 5, simplify: tolerance = 1, max = MAX_PILLS } = {}) {
  const first = features.find((f) => partsOf(f.geometry).some((p) => p.length));
  if (!first) return [];
  const origin = partsOf(first.geometry).find((p) => p.length)[0];
  const kx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110540;
  const project = ([lon, lat]) => [(lon - origin[0]) * kx, (lat - origin[1]) * ky];
  const factor = 10 ** precision;
  const unproject = ([x, y]) => [Math.round((x / kx + origin[0]) * factor) / factor, Math.round((y / ky + origin[1]) * factor) / factor];

  // 1. Each route's line once, as tracks of points with the tier there.
  const pieces = new Map(); // route -> [{ points, tier }]
  for (const f of features) {
    const route = f.properties.route;
    for (const part of partsOf(f.geometry)) {
      if (part.length < 2) continue;
      const points = densify(part.map(project));
      (pieces.get(route) ?? pieces.set(route, []).get(route)).push({ points, tier: f.properties.tier });
    }
  }
  const tracks = []; // { route, points: [[x, y]], tiers: [tier], dirs: [[ux, uy]] }
  for (const [route, list] of pieces) {
    const kept = new Grid(OWN);
    const mine = [];
    list.sort((a, b) => length(b.points) - length(a.points));
    for (const { points, tier } of list) {
      const own = points.map((p) => kept.near(p, OWN).length > 0);
      let start = -1;
      for (let i = 0; i <= points.length; i++) {
        const free = i < points.length && !own[i];
        if (free && start < 0) start = i;
        if (!free && start >= 0) {
          // Keep a point of overlap at each end, so the line stays joined.
          const run = points.slice(Math.max(0, start - 1), Math.min(points.length, i + 1));
          if (run.length >= 2 && length(run) >= STEP) mine.push({ route, points: run, tiers: run.map(() => tier) });
          start = -1;
        }
      }
      for (let i = 1; i < points.length; i++) kept.add(points[i - 1], points[i], { route, tier });
    }
    tracks.push(...chain(mine));
  }
  for (const t of tracks) t.dirs = t.points.map((_, i) => direction(t.points, i));
  // Routes in number order, compared by position (sorting by name is slow).
  const position = new Map([...pieces.keys()].sort(byNumber).map((r, i) => [r, i]));
  const inOrder = (a, b) => position.get(a) - position.get(b);

  // 2. The routes alongside each point.
  const all = new Grid(ALONG);
  for (const t of tracks) for (let i = 1; i < t.points.length; i++) all.add(t.points[i - 1], t.points[i], { route: t.route, tier: t.tiers[i] });
  for (const t of tracks) {
    t.sets = t.points.map((p, i) => {
      const found = new Map([[t.route, t.tiers[i]]]);
      for (const { item, a, b } of all.near(p, ALONG)) {
        if (item.route === t.route) continue;
        const v = [b[0] - a[0], b[1] - a[1]];
        const len = Math.hypot(...v) || 1;
        if (Math.abs(t.dirs[i][0] * v[0] + t.dirs[i][1] * v[1]) / len < ANGLE_COS) continue;
        // Alongside, not off the end of the other route.
        const foot = ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len;
        if (foot < -1 || foot > len + 1) continue;
        const was = found.get(item.route);
        if (!was || rank(item.tier) < rank(was)) found.set(item.route, item.tier);
      }
      return found;
    });
  }

  // 3. Smooth short changes along each track, by the routes there (tiers
  // change only where a route's stretch does).
  const routesKey = (set) => [...set.keys()].sort(inOrder).join(' ');
  for (const t of tracks) {
    for (let pass = 0; pass < 50; pass++) {
      const runs = runsOf(t.points, t.sets.map(routesKey));
      const short = runs.filter((r) => r.length < MIN_RUN && runs.length > 1).sort((a, b) => a.length - b.length)[0];
      if (!short) break;
      const k = runs.indexOf(short);
      const [prev, next] = [runs[k - 1], runs[k + 1]];
      const into = !prev ? next : !next ? prev : prev.length >= next.length ? prev : next;
      const model = t.sets[into.from];
      for (let i = short.from; i < short.to; i++) {
        // Keep each route's own tier where it has one here.
        t.sets[i] = new Map([...model].map(([route, tier]) => [route, t.sets[i].get(route) ?? tier]));
        if (!t.sets[i].has(t.route)) t.sets[i].set(t.route, t.tiers[i]);
      }
    }
  }

  // 4. Each shared run once, from the first route in number order.
  const out = [];
  for (const t of tracks) {
    const owned = t.sets.map((set) => [...set.keys()].every((r) => position.get(r) >= position.get(t.route)));
    const keys = t.sets.map((set) => [...set].sort((a, b) => inOrder(a[0], b[0])).map(([r, tier]) => `${r}:${tier}`).join(' '));
    let runs = runsOf(t.points, keys.map((k, i) => (owned[i] ? k : null)));
    // Short runs join the owned run next to them on this line.
    for (let pass = 0; pass < 50; pass++) {
      const short = runs.filter((r) => r.key != null && r.length < MIN_RUN).sort((a, b) => a.length - b.length)[0];
      if (!short) break;
      const k = runs.indexOf(short);
      const neighbours = [runs[k - 1], runs[k + 1]].filter((r) => r?.key != null);
      const into = neighbours.sort((a, b) => b.length - a.length)[0];
      short.key = into ? into.key : null;
      runs = merge(runs, t.points);
    }
    // Each owned run's row. Neighbouring runs with the same pills become one
    // run naming every route along it: the pills stay the same, since both
    // had the same strongest routes, and the list a tap opens has them all.
    const rows = [];
    for (const run of runs) {
      if (run.key == null) {
        rows.push(null);
        continue;
      }
      const set = new Map(
        run.key.split(' ').map((s) => {
          const at = s.lastIndexOf(':');
          return [s.slice(0, at), s.slice(at + 1)];
        }),
      );
      const { pills } = rowOf(set, max);
      const last = rows.at(-1);
      if (last && last.pills === pills) {
        last.to = run.to;
        for (const [route, tier] of set) if (!last.set.has(route) || rank(tier) < rank(last.set.get(route))) last.set.set(route, tier);
      } else rows.push({ from: run.from, to: run.to, set, pills });
    }
    for (const row of rows) {
      if (!row) continue;
      // A run reaches to the next point, so runs meet end to end.
      const points = t.points.slice(row.from, Math.min(t.points.length, row.to + 1));
      if (points.length < 2) continue;
      const tiers = [...row.set.values()];
      out.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: dedupe(simplify(points, tolerance).map(unproject)) },
        properties: {
          ...rowOf(row.set, max),
          routes: [...row.set.keys()].sort(byNumber).join(' '),
          tier: tiers.reduce((a, b) => (rank(b) < rank(a) ? b : a)),
          n: row.set.size,
        },
      });
    }
  }
  return out.filter((f) => f.geometry.coordinates.length >= 2);
}

// The row for a set of routes (Map route -> tier): `pills` for every route,
// `text_main` for the main tiers, and `more` when the pills don't name them all.
function rowOf(set, max) {
  const routes = [...set].map(([route, tier]) => ({ route, tier }));
  const pills = pillRow(routes, max);
  const main = routes.filter((r) => MAIN.includes(r.tier));
  return {
    pills: pillsText(pills),
    text_main: main.length ? rowText(pillRow(main, max)) : '',
    more: pills.some((p) => p.tier === 'more') ? 1 : 0,
  };
}

// A route's stretches, joined where one ends where the next begins (a route is
// drawn in stretches, one per tier), so the labels along a street don't break
// where the route's tier changes. The tier at a join is the earlier stretch's.
function chain(list) {
  const out = [];
  const used = new Set();
  const meet = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= OWN;
  const reversed = (t) => ({ points: [...t.points].reverse(), tiers: [...t.tiers].reverse() });
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let { points, tiers } = list[i];
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
        } else if (before) {
          points = before.points.concat(points.slice(1));
          tiers = before.tiers.concat(tiers.slice(1));
        } else continue;
        used.add(j);
        grew = true;
      }
    }
    out.push({ route: list[i].route, points, tiers });
  }
  return out;
}

// Runs of equal keys along a track: { key, from, to (exclusive), length }.
function runsOf(points, keys) {
  const runs = [];
  let from = 0;
  for (let i = 1; i <= points.length; i++) {
    if (i < points.length && keys[i] === keys[from]) continue;
    runs.push({ key: keys[from], from, to: i, length: length(points.slice(from, Math.min(points.length, i + 1))) });
    from = i;
  }
  return runs;
}

function merge(runs, points) {
  const out = [];
  for (const r of runs) {
    const last = out.at(-1);
    if (last && last.key === r.key) {
      last.to = r.to;
      last.length = length(points.slice(last.from, Math.min(points.length, last.to + 1)));
    } else out.push({ ...r });
  }
  return out;
}
