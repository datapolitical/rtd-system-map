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

// How far apart points are compared along each line.
const STEP = 20;
// Routes this close, running the same way, share a street.
const ALONG = 35;
const ANGLE_COS = Math.cos((25 * Math.PI) / 180);
// A route's own pieces this close are the same street (both directions drawn).
const OWN = 30;
// Runs shorter than this are smoothed into a neighbour.
export const MIN_RUN = 150;
// A tag names at most this many routes, and its text is meant to stay within
// MAX_CHARS characters (about 40% of a phone's width): when four routes or
// more share a street and naming them all is longer than that, the strongest
// two or three are named and the rest counted ("+2"). Never "+1": that is as
// wide as the one number it hides, so that route is named instead.
export const MAX_NAMES = 4;
export const NAMED = 3;
export const MAX_CHARS = 16;
const SEPARATOR = ' · ';
// Tiers a run's main label names: the routes drawn at strength from far out.
const MAIN = ['frequent', 'every30'];
const TIERS = ['frequent', 'every30', 'hourly', 'infrequent', 'peak', 'limited', 'none', 'unknown'];
const rank = (tier) => (TIERS.includes(tier) ? TIERS.indexOf(tier) : TIERS.length);
const collator = new Intl.Collator('en', { numeric: true });
const byNumber = (a, b) => collator.compare(a, b);

/**
 * A label for some routes, strongest tier first, then in number order.
 * Up to three routes are always all named. Four are named too if that fits
 * `maxChars`. Otherwise (or with more) the strongest NAMED that fit, at least
 * two, then "+N" for the rest, so N is at least 2 and never 1. `routes` are
 * [{ route, tier }].
 */
export function routeLabel(routes, maxChars = MAX_CHARS) {
  const names = [...routes].sort((a, b) => rank(a.tier) - rank(b.tier) || byNumber(a.route, b.route)).map((r) => r.route);
  const n = names.length;
  const text = (k) => names.slice(0, k).join(SEPARATOR) + (k < n ? ` +${n - k}` : '');
  if (n <= NAMED || (n <= MAX_NAMES && text(n).length <= maxChars)) return text(n);
  let k = Math.min(NAMED, n - 2);
  while (k > 2 && text(k).length > maxChars) k--;
  return text(k);
}

/**
 * `features` are the bus route features as drawn (stretches with `route` and
 * `tier`). Returns LineString features with `label`, `label_main` (only the
 * routes that are frequent or every 30 there, or ''), `routes` (every route,
 * space-separated), `tier` (the strongest), `n` (how many routes), and
 * `chars` / `chars_main` (the length of `label` / `label_main`).
 */
export function busNames(features, { precision = 5, simplify: tolerance = 1, maxChars = MAX_CHARS } = {}) {
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
          if (run.length >= 2 && length(run) >= STEP) tracks.push({ route, points: run, tiers: run.map(() => tier) });
          start = -1;
        }
      }
      for (let i = 1; i < points.length; i++) kept.add(points[i - 1], points[i], { route, tier });
    }
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
    for (const run of runs) {
      if (run.key == null) continue;
      // A run reaches to the next point, so runs meet end to end.
      const points = t.points.slice(run.from, Math.min(t.points.length, run.to + 1));
      if (points.length < 2) continue;
      const set = run.key.split(' ').map((s) => {
        const at = s.lastIndexOf(':');
        return { route: s.slice(0, at), tier: s.slice(at + 1) };
      });
      const main = set.filter((r) => MAIN.includes(r.tier));
      const strongest = set.reduce((a, b) => (rank(b.tier) < rank(a.tier) ? b : a)).tier;
      const [label, labelMain] = [routeLabel(set, maxChars), main.length ? routeLabel(main, maxChars) : ''];
      out.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: dedupe(simplify(points, tolerance).map(unproject)) },
        properties: {
          label,
          label_main: labelMain,
          routes: set.map((r) => r.route).sort(byNumber).join(' '),
          tier: strongest,
          n: set.length,
          // Characters in each label, for spacing long tags further apart.
          chars: label.length,
          chars_main: labelMain.length,
        },
      });
    }
  }
  return out.filter((f) => f.geometry.coordinates.length >= 2);
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

// Segments in a grid, to find those near a point quickly.
class Grid {
  constructor(size) {
    this.size = size;
    this.cells = new Map();
    this.stamp = 0;
  }
  add(a, b, item) {
    const seg = { a, b, item };
    const keys = new Set([this.key(a), this.key(b), this.key([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])]);
    for (const k of keys) (this.cells.get(k) ?? this.cells.set(k, []).get(k)).push(seg);
  }
  key([x, y]) {
    return cellKey(Math.floor(x / this.size), Math.floor(y / this.size));
  }
  near(p, within) {
    const [cx, cy] = [Math.floor(p[0] / this.size), Math.floor(p[1] / this.size)];
    const found = [];
    const stamp = ++this.stamp;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const seg of this.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (seg.seen === stamp) continue;
          seg.seen = stamp;
          if (segmentDistance(p, seg.a, seg.b) <= within) found.push(seg);
        }
      }
    }
    return found;
  }
}

// A grid cell's key as one number (cells are tens of meters, so the network
// spans far fewer than 2^20 of them each way).
const cellKey = (cx, cy) => (cx + 2 ** 20) * 2 ** 21 + (cy + 2 ** 20);

// Points about STEP apart along a path (segments are at most STEP long, so
// the grid's cells, STEP-sized or larger, see every segment near them).
function densify(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

function direction(points, i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

function segmentDistance(p, a, b) {
  const v = [b[0] - a[0], b[1] - a[1]];
  const len2 = v[0] * v[0] + v[1] * v[1];
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1]);
}

function length(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return sum;
}

// Douglas-Peucker on projected points, to `tolerance` meters.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let [worst, index] = [-1, 0];
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > worst) [worst, index] = [d, i];
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const dedupe = (coords) => coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1]);
const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);
