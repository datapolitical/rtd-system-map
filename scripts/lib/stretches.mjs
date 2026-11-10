// Bus frequency by stretch (DESIGN.md, "Bus routes"). A route's tier is one
// number for the whole route, measured where it runs most; but a route can
// have branches, short turns and legs only a few trips run (RTD draws FF1 to
// FF5 as one Flatiron Flyer, and only FF5 goes on to Anschutz), so a line
// drawn at one weight end to end can promise service that isn't there.
//
// So each bus route's drawn geometry is cut into stretches, and each stretch
// gets the frequency of the trips that actually run along it, by the same
// definition as the route's (the median gap between weekday 9am-3pm
// departures, or the average where buses run bunched, per direction,
// keeping the less frequent one; directionSummary in gtfs.mjs), measured
// there:
//
// 1. The drawn line is cut into cells about STEP long. A trip runs along a
//    cell when its GTFS shape passes within COVER of the cell's middle,
//    running the same way as the line (a street the route crosses doesn't
//    count), between the trip's first and last stops. Where the trip is
//    then comes from its stop times, interpolated along its shape, so an
//    express stretch with no stops for miles carries the trips that run
//    through it, and a stop that some trips skip changes nothing.
// 2. Each cell's tier comes from the departures past its middle, per
//    direction, from whichever directions run there (a one-way couplet
//    street has one). A cell no trip runs along takes its neighbours' tier.
// 3. Short changes are noise: a run of cells in one tier shorter than
//    MIN_RUN (MIN_END at a dead end, where a real terminal leg can be short)
//    takes the tier of its neighbour closest in tier, shortest runs first,
//    across the joins between the drawn line's parts. Most routes end up
//    one stretch.
// 4. The line is cut where the tier changes, pieces in one tier that touch or
//    run side by side (RTD sometimes draws both directions) are one stretch,
//    and each stretch is measured at its most typical cell. Every bit of the
//    drawn line is in exactly one stretch.

import { clock, daySummary, directionSummary, MIDDAY, readCsv, shapePoints, tierOf } from './gtfs.mjs';

// Cell length along the drawn line.
const STEP = 50;
// A shape this close to the drawn line, running the same way, is on it.
const COVER = 50;
const COVER_COS = Math.cos((40 * Math.PI) / 180);
// Shapes are simplified to this many meters before they're compared.
const SHAPE_SIMPLIFY = 3;
// The rest of a direction's trips at a place can run this far off the line.
const WIDE = 150;
// A stop this close to its trip's shape is placed on it.
// How far off a segment's end a cell can be and still be round its bend.
const BEND = 10;
const STOP_SNAP = 120;
// A trip serves a cell whose middle is this far past its first or last stop.
const END_SLACK = 30;
// Parts of the drawn line whose ends are this close are joined.
const JOIN = 30;
// Runs shorter than this are smoothed away; at a dead end, MIN_END.
export const MIN_RUN = 600;
export const MIN_END = 300;
// Pieces in one tier this close are one stretch (both directions drawn).
const PAIR = 40;

// The end of the evening rush, as in gtfs.mjs: 8pm.
const EVENING_END = 20 * 3600;

// Strongest first.
export const TIERS = ['frequent', 'every30', 'hourly', 'infrequent', 'peak', 'limited', 'none', 'unknown'];
// Tiers of routes with no midday service.
const PART_TIME = ['peak', 'limited'];
const rank = (tier) => (TIERS.includes(tier) ? TIERS.indexOf(tier) : TIERS.length);

/**
 * `features` are bus route features, one per map route, carrying the
 * route-level frequency properties. `text` is the GTFS feed, `dates` the
 * representative days, `groupOf(route_id)` the map route a GTFS route belongs
 * to. `stopTimes` (optional) is trip_id -> { stops, times } for the
 * representative days, as routeFrequency collects it; without it stop_times
 * is read here. Returns { features, report }: the routes as stretch features
 * (DESIGN.md's data contract: route-level `route_tier` and `route_wk`,
 * `stretch` index, and the frequency properties for the stretch), and per
 * route, how many stretches it has and how much of it no trip covered.
 */
export function busStretches(features, text, dates, groupOf = (id) => id, { stopTimes = null } = {}) {
  const drawn = new Set(features.map((f) => f.properties.route));
  const kindsByService = new Map();
  for (const [kind, { services }] of Object.entries(dates)) {
    for (const s of services) kindsByService.set(s, [...(kindsByService.get(s) ?? []), kind]);
  }
  const trips = readCsv(text['trips.txt']).filter((t) => drawn.has(groupOf(t.route_id)) && kindsByService.has(t.service_id) && t.shape_id);
  stopTimes ??= readStopTimes(text, new Set(trips.map((t) => t.trip_id)));
  const shapes = shapePoints(text);
  const stops = new Map(readCsv(text['stops.txt']).map((s) => [s.stop_id, [Number(s.stop_lon), Number(s.stop_lat)]]));

  const origin = firstPoint(features) ?? [0, 0];
  const kx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110540;
  const project = ([lon, lat]) => [(lon - origin[0]) * kx, (lat - origin[1]) * ky];
  const unproject = ([x, y]) => [round(x / kx + origin[0]), round(y / ky + origin[1])];

  // Trip patterns: trips on one shape with the same stops share their stops'
  // places along it.
  const patternsByRoute = new Map();
  const patterns = new Map();
  for (const t of trips) {
    const st = stopTimes.get(t.trip_id);
    if (!st || st.stops.length < 2 || !shapes.has(t.shape_id)) continue;
    const key = `${t.shape_id}|${t.direction_id}|${st.stops.join(',')}`;
    let pattern = patterns.get(key);
    if (!pattern) {
      const route = groupOf(t.route_id);
      pattern = { route, shape: t.shape_id, dir: t.direction_id ?? '', stops: st.stops, trips: [] };
      patterns.set(key, pattern);
      (patternsByRoute.get(route) ?? patternsByRoute.set(route, []).get(route)).push(pattern);
    }
    pattern.trips.push({ id: t.trip_id, dir: t.direction_id ?? '', kinds: kindsByService.get(t.service_id), times: st.times });
  }

  for (const pattern of patterns.values()) {
    pattern.byKind = Object.fromEntries(Object.keys(dates).map((kind) => [kind, pattern.trips.filter((t) => t.kinds.includes(kind))]));
  }

  const out = [];
  const report = [];
  const loads = new Map();
  for (const f of features) {
    const p = f.properties;
    const routePatterns = patternsByRoute.get(p.route) ?? [];
    const parts = partsOf(f.geometry).filter((part) => part.length >= 2);
    const whole = () => {
      out.push({ ...f, properties: { ...p, route_tier: p.tier, route_wk: p.wk, stretch: 0 } });
      report.push({ route: p.route, stretches: 1, uncovered: 1 });
    };
    if (!routePatterns.length || !parts.length) {
      whole();
      continue;
    }
    const result = splitRoute(p, parts, routePatterns, { shapes, stops, project, kinds: Object.keys(dates) });
    if (!result) {
      whole();
      continue;
    }
    result.stretches.forEach((s, k) => {
      out.push({
        type: 'Feature',
        geometry: s.lines.length === 1 ? { type: 'LineString', coordinates: s.lines[0] } : { type: 'MultiLineString', coordinates: s.lines },
        properties: { ...p, ...s.values, route_tier: p.tier, route_wk: p.wk, stretch: k },
      });
    });
    report.push({ route: p.route, stretches: result.stretches.length, uncovered: result.uncovered });
    loads.set(p.route, [...(loads.get(p.route) ?? []), ...result.loads.map((l) => ({ ...l, at: unproject(l.at) }))]);
  }
  return { features: out, report, loads };
}

function splitRoute(p, parts, routePatterns, { shapes, stops, project, kinds }) {
  // The trips' shapes, projected, in a grid of their segments.
  const shapeData = new Map();
  const grid = new Map();
  for (const pattern of routePatterns) {
    if (shapeData.has(pattern.shape)) continue;
    const pts = simplify(shapes.get(pattern.shape).map(project), SHAPE_SIMPLIFY);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    shapeData.set(pattern.shape, { pts, cum, patterns: [] });
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const len = cum[i] - cum[i - 1];
      if (len < 0.01) continue;
      const seg = { id: pattern.shape, ax: a[0], ay: a[1], ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len, len, at: cum[i - 1], first: i === 1, last: i === pts.length - 1 };
      for (const k of segmentCells(a, b, WIDE)) (grid.get(k) ?? grid.set(k, []).get(k)).push(seg);
    }
  }
  for (const pattern of routePatterns) {
    const shape = shapeData.get(pattern.shape);
    shape.patterns.push(pattern);
    pattern.pos ??= placeStops(shape, pattern.stops.map((id) => (stops.has(id) ? project(stops.get(id)) : null)));
    for (const trip of pattern.trips) trip.times = fillTimes(trip.times, pattern.pos);
  }

  // Cells along each part of the drawn line.
  const cells = [];
  const partCells = parts.map((part, pi) => {
    const pts = part.map(project);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const length = cum.at(-1);
    const n = Math.max(1, Math.ceil(length / STEP));
    const list = [];
    for (let k = 0; k < n; k++) {
      const [from, to] = [(length * k) / n, (length * (k + 1)) / n];
      const mid = at(pts, cum, (from + to) / 2);
      const c = {
        id: cells.length,
        part: pi,
        k,
        from,
        to,
        length: to - from,
        mid: mid.point,
        dir: mid.dir,
        start: at(pts, cum, from).point,
        end: at(pts, cum, to).point,
        adj: [],
      };
      cells.push(c);
      list.push(c);
    }
    for (let k = 1; k < list.length; k++) link(list[k - 1], list[k]);
    return { part, pts, cum, cells: list };
  });

  // Where each cell is on each shape that runs along it. A direction whose
  // trips run along the cell also takes that direction's trips passing
  // within WIDE: the other carriageway of a freeway, or a ramp into a
  // station that the cell's own trips skip. A direction that only passes
  // within WIDE (the other street of a one-way couplet) isn't there.
  //
  // A shape can pass a cell more than once: a loop, or a tail past the last
  // stop where the bus runs back out of service along the street it came in
  // on. Each pattern takes the closest pass that is between its own stops, so
  // an out-of-service pass a meter closer doesn't hide the one in service.
  for (const c of cells) {
    const passes = new Map(); // shape -> [{ d, s }]
    const [cx, cy] = [Math.floor(c.mid[0] / WIDE), Math.floor(c.mid[1] / WIDE)];
    const [mx, my] = c.mid;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const seg of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (Math.abs(c.dir[0] * seg.ux + c.dir[1] * seg.uy) < COVER_COS) continue;
          const raw = (mx - seg.ax) * seg.ux + (my - seg.ay) * seg.uy;
          const t = Math.max(0, Math.min(seg.len, raw));
          const d = Math.hypot(mx - seg.ax - t * seg.ux, my - seg.ay - t * seg.uy);
          // Past a segment's end, only at the shape's own ends or round a
          // bend, not past where it turns away: a branch going straight on
          // isn't on the one that turns.
          if (((raw < 0 && !seg.first) || (raw > seg.len && !seg.last)) && d > BEND) continue;
          // Which way the shape runs here against the drawn line: with it (1) or
          // against it (-1), so a street's two directions can be told apart.
          const sense = c.dir[0] * seg.ux + c.dir[1] * seg.uy >= 0 ? 1 : -1;
          if (d <= WIDE) (passes.get(seg.id) ?? passes.set(seg.id, []).get(seg.id)).push({ d, s: seg.at + t, sense });
        }
      }
    }
    c.on = []; // [pattern, place along its shape, sense]
    const serves = (pattern, s) => s >= pattern.pos[0] - END_SLACK && s <= pattern.pos.at(-1) + END_SLACK;
    const near = []; // [pattern, its closest pass in service]
    for (const [id, list] of passes) {
      for (const pattern of shapeData.get(id).patterns) {
        const pass = list.filter(({ s }) => serves(pattern, s)).reduce((a, b) => (a && a.d <= b.d ? a : b), null);
        if (pass) near.push([pattern, pass]);
      }
    }
    const here = new Set(near.filter(([, pass]) => pass.d <= COVER).map(([pattern]) => pattern.dir));
    for (const [pattern, pass] of near) if (pass.d <= COVER || here.has(pattern.dir)) c.on.push([pattern, pass.s, pass.sense]);
  }
  const covered = cells.filter((c) => c.on.length);
  if (!covered.length) return null;
  const uncovered = 1 - covered.reduce((a, c) => a + c.length, 0) / cells.reduce((a, c) => a + c.length, 0);

  // Each covered cell's weekday tier.
  const routeDirs = new Set(routePatterns.map((pt) => pt.dir));
  const rush = { morning: false, evening: false };
  for (const pt of routePatterns) {
    for (const trip of pt.byKind.weekday ?? []) {
      for (const t of trip.times) {
        if (t < MIDDAY[0]) rush.morning = true;
        else if (t >= MIDDAY[1] && t < EVENING_END) rush.evening = true;
      }
    }
  }
  for (const c of covered) {
    const day = cellDay(c, 'weekday', { tier: p.tier, dirs: routeDirs, rush });
    c.raw = day.tier;
    c.edge = day.edge;
  }

  // Parts join where their ends meet another part.
  const endGrid = new Map();
  const ekey = (pt) => `${Math.floor(pt[0] / JOIN)},${Math.floor(pt[1] / JOIN)}`;
  for (const c of cells) for (const pt of [c.start, c.end]) (endGrid.get(ekey(pt)) ?? endGrid.set(ekey(pt), []).get(ekey(pt))).push(c);
  const nearCells = (pt) => {
    const [cx, cy] = [Math.floor(pt[0] / JOIN), Math.floor(pt[1] / JOIN)];
    const found = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const c of endGrid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (dist(c.start, pt) <= JOIN || dist(c.end, pt) <= JOIN) found.add(c);
        }
      }
    }
    return found;
  };
  for (const { cells: list } of partCells) {
    const [first, last] = [list[0], list.at(-1)];
    for (const [cell, pt, flag] of [
      [first, first.start, 'freeStart'],
      [last, last.end, 'freeEnd'],
    ]) {
      let joined = false;
      for (const other of nearCells(pt)) {
        if (other.part === cell.part) continue;
        link(cell, other);
        joined = true;
      }
      cell[flag] = !joined;
    }
  }

  // Cells no trip covers take the tier of the nearest covered cell along the
  // line, or failing that, anywhere on the route; failing that, the route's.
  const tier = new Array(cells.length).fill(null);
  const queue = [];
  for (const c of covered) {
    tier[c.id] = c.raw;
    queue.push(c);
  }
  for (let q = 0; q < queue.length; q++) {
    for (const n of queue[q].adj) {
      if (tier[n.id] == null) {
        tier[n.id] = tier[queue[q].id];
        queue.push(n);
      }
    }
  }
  for (const c of cells) {
    if (tier[c.id] != null) continue;
    const nearest = covered.reduce((a, b) => (dist(b.mid, c.mid) < dist(a.mid, c.mid) ? b : a));
    tier[c.id] = nearest?.raw ?? p.tier;
  }
  for (const c of cells) c.raw ??= tier[c.id];

  smooth(cells, tier);

  // Pieces: runs of one tier along a part, cut from the drawn line.
  const pieces = [];
  for (const { part, cum, cells: list } of partCells) {
    let start = 0;
    for (let k = 1; k <= list.length; k++) {
      if (k < list.length && tier[list[k].id] === tier[list[start].id]) continue;
      pieces.push({ tier: tier[list[start].id], cells: list.slice(start, k), line: cut(part, cum, list[start].from, list[k - 1].to) });
      start = k;
    }
  }
  // Pieces in one tier that touch or run side by side are one stretch.
  const pieceOf = new Map();
  pieces.forEach((piece, i) => piece.cells.forEach((c) => pieceOf.set(c.id, i)));
  const parent = pieces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const unite = (a, b) => void (parent[find(a)] = find(b));
  const midGrid = new Map();
  const mkey = (pt) => `${Math.floor(pt[0] / PAIR)},${Math.floor(pt[1] / PAIR)}`;
  for (const c of cells) (midGrid.get(mkey(c.mid)) ?? midGrid.set(mkey(c.mid), []).get(mkey(c.mid))).push(c);
  for (const c of cells) {
    const i = pieceOf.get(c.id);
    for (const n of c.adj) if (pieces[pieceOf.get(n.id)].tier === pieces[i].tier) unite(i, pieceOf.get(n.id));
    const [cx, cy] = [Math.floor(c.mid[0] / PAIR), Math.floor(c.mid[1] / PAIR)];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const n of midGrid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const j = pieceOf.get(n.id);
          if (j !== i && pieces[j].tier === pieces[i].tier && dist(n.mid, c.mid) <= PAIR) unite(i, j);
        }
      }
    }
  }
  const groups = new Map();
  pieces.forEach((piece, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))).push(piece));

  const stretches = [...groups.values()].map((group) => {
    const groupCells = group.flatMap((g) => g.cells);
    const length = groupCells.reduce((a, c) => a + c.length, 0);
    // Measured at the middle of its longest run of cells whose own tier is
    // the stretch's, so its numbers agree with its tier.
    const t = group[0].tier;
    let bestRun = null;
    for (const g of group) {
      let start = -1;
      for (let k = 0; k <= g.cells.length; k++) {
        const ok = k < g.cells.length && g.cells[k].raw === t && g.cells[k].on.length;
        if (ok && start < 0) start = k;
        if (!ok && start >= 0) {
          const run = g.cells.slice(start, k);
          const len = run.reduce((a, c) => a + c.length, 0);
          if (!bestRun || len > bestRun.len) bestRun = { len, cell: run[Math.floor(run.length / 2)] };
          start = -1;
        }
      }
    }
    const ref = bestRun?.cell ?? groupCells.filter((c) => c.on.length).sort((a, b) => rank(a.raw) - rank(b.raw))[0] ?? null;
    // All its numbers come from that one place, so they agree with each
    // other: a junction where the route's other trips pass doesn't count.
    const day = Object.fromEntries(kinds.map((kind) => [kind, ref ? measure(ref, kind) : null]));
    const values = {
      tier: t,
      wk: day.weekday?.headway ?? null,
      sa: day.saturday?.headway ?? null,
      su: day.sunday?.headway ?? null,
      wk_trips: day.weekday?.trips ?? 0,
      sa_trips: day.saturday?.trips ?? 0,
      su_trips: day.sunday?.trips ?? 0,
      wk_first: day.weekday?.trips ? clock(day.weekday.firstSeconds) : null,
      wk_last: day.weekday?.trips ? clock(day.weekday.lastSeconds) : null,
    };
    return { length, values, lines: group.map((g) => g.line).filter((l) => l.length >= 2) };
  });
  stretches.sort((a, b) => b.length - a.length);
  // Each cell as the street map needs it (scripts/lib/streets.mjs): where it
  // is, which way the drawn line runs there, the tier it ended in, and the
  // weekday departures in the window each way along the line.
  const loads = cells.map((c) => {
    const day = c.on.length ? measure(c, 'weekday') : { with: [], against: [] };
    return { at: c.mid, dir: c.dir, tier: tier[c.id], with: day.with, against: day.against };
  });
  return { stretches, uncovered, loads };
}

// A cell's tier on one kind of day, from `measure`, with two allowances so
// a stretch is split only where its service differs from the route's, not
// where the same buses' timing reads a little differently:
// - A headway a minute over a tier's edge (scheduled every 30 minutes,
//   gaps of 30 and 31 at some stops) takes the route's tier when that is
//   the tier under the edge. Otherwise the better tier a minute or two
//   under is kept in `edge`, and `smooth` lets a stretch of such cells join
//   a neighbour of that tier (gaps of 60 at one end of a route and 61 or 62
//   at the other are the same hourly bus).
// - Where only one of the route's directions runs (a one-way street, or a
//   ramp only inbound buses use) on a route with no midday service, "rush
//   hours only" is judged from the route's trips in both directions, as
//   the route's is: an inbound street with morning buses is the morning
//   half of a rush-hour route, not "a few trips". On a route that runs all
//   day, a part-time leg (a few owl trips) is judged by its own trips.
function cellDay(cell, kind, route) {
  const day = measure(cell, kind);
  const dirs = new Set(cell.on.filter(([pt]) => pt.byKind[kind]?.length).map(([pt]) => pt.dir));
  if (day.trips && !day.middayDepartures && PART_TIME.includes(route.tier) && dirs.size === 1 && route.dirs.size > 1) {
    day.morning ||= route.rush.morning;
    day.evening ||= route.rush.evening;
  }
  let tier = tierOf(day);
  // Timetables run at or under a tier's edge, so rounding only ever reads
  // a minute or two over it: 31 can be 30, but 15 is never really 16.
  const better = (minutes) => (day.headway == null ? null : tierOf({ ...day, headway: day.headway - minutes }));
  if (better(1) === route.tier) tier = route.tier;
  const edge = [better(1), better(2)].filter((t) => t && t !== tier);
  return { ...day, tier, edge };
}

// The trips that pass a cell's middle on one kind of day, per direction.
function measure(cell, kind) {
  const byDir = new Map();
  const bySense = { with: [], against: [] };
  let trips = 0;
  for (const [pattern, s, sense] of cell.on) {
    const { pos } = pattern;
    // The stop at or before s.
    let lo = 0;
    let hi = pos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pos[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const k = Math.min(lo, pos.length - 2);
    const span = pos[k + 1] - pos[k];
    const frac = s <= pos[0] ? 0 : s >= pos.at(-1) ? 1 : span > 0 ? (s - pos[k]) / span : 0;
    const [k0, k1] = s <= pos[0] ? [0, 0] : s >= pos.at(-1) ? [pos.length - 1, pos.length - 1] : [k, k + 1];
    for (const trip of pattern.byKind[kind] ?? []) {
      const t = trip.times[k0] + frac * (trip.times[k1] - trip.times[k0] || 0);
      if (!Number.isFinite(t)) continue;
      trips++;
      (byDir.get(trip.dir) ?? byDir.set(trip.dir, []).get(trip.dir)).push(t);
      if (t >= MIDDAY[0] && t < MIDDAY[1]) bySense[sense < 0 ? 'against' : 'with'].push(Math.round(t));
    }
  }
  if (!trips) return { trips: 0, firstSeconds: null, lastSeconds: null, with: [], against: [] };
  const dirs = [...byDir.values()].map(directionSummary);
  return {
    ...daySummary(dirs, trips),
    // Departure times (seconds) in the window past this cell, each way along
    // the drawn line, for the street map to add up across routes.
    with: bySense.with.sort((a, b) => a - b),
    against: bySense.against.sort((a, b) => a - b),
    firstSeconds: Math.min(...dirs.map((d) => d.first)),
    lastSeconds: Math.max(...dirs.map((d) => d.last)),
  };
}

// Short runs take a neighbour's tier, shortest first, until none is left.
// A run is the cells of one tier that connect, across parts.
function smooth(cells, tier) {
  for (let pass = 0; pass < 1000; pass++) {
    const comp = new Int32Array(cells.length).fill(-1);
    const comps = [];
    for (const c of cells) {
      if (comp[c.id] >= 0) continue;
      const run = { id: comps.length, tier: tier[c.id], cells: [], length: 0, deadEnd: false, neighbours: new Set() };
      comps.push(run);
      comp[c.id] = run.id;
      const stack = [c];
      while (stack.length) {
        const x = stack.pop();
        run.cells.push(x);
        run.length += x.length;
        if (x.freeStart || x.freeEnd) run.deadEnd = true;
        for (const n of x.adj) {
          if (comp[n.id] < 0 && tier[n.id] === run.tier) {
            comp[n.id] = run.id;
            stack.push(n);
          }
        }
      }
    }
    for (const run of comps) for (const x of run.cells) for (const n of x.adj) if (comp[n.id] !== run.id) run.neighbours.add(comp[n.id]);
    // A run that's only a minute's rounding off a neighbour's tier joins it.
    const rounding = comps
      .map((run) => {
        const measured = run.cells.filter((x) => x.edge);
        if (!measured.length || measured.some((x) => x.raw !== run.tier)) return null;
        const into = [...run.neighbours]
          .map((n) => comps[n])
          .filter((n) => measured.every((x) => x.edge.includes(n.tier)))
          .sort((a, b) => b.length - a.length)[0];
        return into && { run, into };
      })
      .filter(Boolean)
      .sort((a, b) => a.run.length - b.run.length);
    if (rounding.length) {
      const touched = new Set();
      for (const { run, into } of rounding) {
        if (touched.has(run.id) || touched.has(into.id)) continue;
        for (const x of run.cells) tier[x.id] = into.tier;
        touched.add(run.id);
        touched.add(into.id);
      }
      continue;
    }
    const short = comps
      .filter((r) => r.neighbours.size && r.length < (r.deadEnd ? MIN_END : MIN_RUN))
      .sort((a, b) => a.length - b.length);
    if (!short.length) return;
    const touched = new Set();
    for (const run of short) {
      if (touched.has(run.id) || [...run.neighbours].some((n) => touched.has(n))) continue;
      const into = [...run.neighbours]
        .map((n) => comps[n])
        .sort((a, b) => Math.abs(rank(a.tier) - rank(run.tier)) - Math.abs(rank(b.tier) - rank(run.tier)) || b.length - a.length)[0];
      for (const x of run.cells) tier[x.id] = into.tier;
      touched.add(run.id);
      touched.add(into.id);
    }
  }
}

// Each stop's place along its trip's shape, in meters, in stop order: the
// first close pass of the shape at or after the stop before it, so a shape
// that passes a stop twice (a loop) places it on the right pass.
function placeStops(shape, points) {
  const { pts, cum } = shape;
  shape.grid ??= (() => {
    const g = new Map();
    for (let i = 1; i < pts.length; i++) for (const k of segmentCells(pts[i - 1], pts[i], STOP_SNAP)) (g.get(k) ?? g.set(k, []).get(k)).push(i - 1);
    return g;
  })();
  const pos = [];
  let prev = 0;
  for (const p of points) {
    if (!p) {
      pos.push(prev);
      continue;
    }
    const [cx, cy] = [Math.floor(p[0] / STOP_SNAP), Math.floor(p[1] / STOP_SNAP)];
    const found = [];
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of shape.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const [a, b] = [pts[i], pts[i + 1]];
          const v = [b[0] - a[0], b[1] - a[1]];
          const len2 = v[0] * v[0] + v[1] * v[1];
          const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len2)) : 0;
          const d = Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1]);
          const s = cum[i] + t * Math.sqrt(len2);
          if (d <= STOP_SNAP && s >= prev - 1) found.push({ d, s });
        }
      }
    }
    if (found.length) {
      const least = Math.min(...found.map((f) => f.d));
      prev = found.filter((f) => f.d <= least + 20).sort((a, b) => a.s - b.s)[0].s;
    }
    pos.push(prev);
  }
  return pos;
}

// Stop times can be blank between timepoints; fill them in along the shape.
function fillTimes(times, pos) {
  if (times.every(Number.isFinite)) return times;
  const out = [...times];
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) continue;
    let [a, b] = [i - 1, i + 1];
    while (a >= 0 && !Number.isFinite(out[a])) a--;
    while (b < out.length && !Number.isFinite(times[b])) b++;
    if (a < 0 || b >= out.length) continue;
    const span = pos[b] - pos[a];
    out[i] = out[a] + (span > 0 ? (pos[i] - pos[a]) / span : 0) * (times[b] - out[a]);
  }
  return out;
}

function readStopTimes(text, wanted) {
  const lists = new Map();
  const rows = readCsv(text['stop_times.txt']);
  for (const r of rows) {
    if (!wanted.has(r.trip_id)) continue;
    const time = r.departure_time || r.arrival_time;
    (lists.get(r.trip_id) ?? lists.set(r.trip_id, []).get(r.trip_id)).push([Number(r.stop_sequence), r.stop_id, time ? seconds(time) : NaN]);
  }
  const out = new Map();
  for (const [id, list] of lists) {
    list.sort((a, b) => a[0] - b[0]);
    out.set(id, { stops: list.map((x) => x[1]), times: list.map((x) => x[2]) });
  }
  return out;
}

const seconds = (t) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

const link = (a, b) => {
  if (a === b || a.adj.includes(b)) return;
  a.adj.push(b);
  b.adj.push(a);
};

// The grid cells a segment passes through, at `size`.
function segmentCells(a, b, size) {
  const keys = new Set();
  const n = Math.max(1, Math.ceil(dist(a, b) / (size / 2)));
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n;
    const y = a[1] + ((b[1] - a[1]) * k) / n;
    keys.add(`${Math.floor(x / size)},${Math.floor(y / size)}`);
  }
  return keys;
}

// The point `d` meters along a projected path, and the path's direction there.
function at(pts, cum, d) {
  let i = 1;
  while (i < pts.length - 1 && cum[i] < d) i++;
  const [a, b] = [pts[i - 1], pts[i]];
  const len = cum[i] - cum[i - 1];
  const t = len > 0 ? Math.max(0, Math.min(1, (d - cum[i - 1]) / len)) : 0;
  const dir = len > 0 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
  return { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dir };
}

// The drawn line (lon/lat) from `from` to `to` meters along it.
function cut(part, cum, from, to) {
  const point = (d) => {
    let i = 1;
    while (i < part.length - 1 && cum[i] < d) i++;
    const len = cum[i] - cum[i - 1];
    const t = len > 0 ? Math.max(0, Math.min(1, (d - cum[i - 1]) / len)) : 0;
    return [round(part[i - 1][0] + t * (part[i][0] - part[i - 1][0])), round(part[i - 1][1] + t * (part[i][1] - part[i - 1][1]))];
  };
  const eps = 1e-6;
  const line = [from <= eps ? part[0] : point(from)];
  for (let i = 1; i < part.length - 1; i++) if (cum[i] > from + eps && cum[i] < to - eps) line.push(part[i]);
  line.push(to >= cum.at(-1) - eps ? part.at(-1) : point(to));
  // Drop repeats that rounding made.
  return line.filter((pt, i) => i === 0 || pt[0] !== line[i - 1][0] || pt[1] !== line[i - 1][1]);
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
    const [ax, ay] = points[a];
    const [dx, dy] = [points[b][0] - ax, points[b][1] - ay];
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const t = len2 ? Math.max(0, Math.min(1, ((points[i][0] - ax) * dx + (points[i][1] - ay) * dy) / len2)) : 0;
      const d = Math.hypot(points[i][0] - ax - t * dx, points[i][1] - ay - t * dy);
      if (d > worst) [worst, index] = [d, i];
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (v) => Math.round(v * 1e5) / 1e5;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);
const firstPoint = (features) => {
  for (const f of features) for (const part of partsOf(f.geometry)) if (part.length) return part[0];
  return null;
};
