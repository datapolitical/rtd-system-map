// Plant faults in a frozen build's data, so the checks can be scored on
// faults nobody has had to find (qa/recall/README.md).
//
// Each kind below breaks the build's own geometry the way a real fault does,
// at places chosen from the data with a seeded random walk, at least
// SPACING metres apart and away from the known finds. It returns the mutated
// data and a list of what was planted: where, which finding kinds count as
// catching it, and from which zoom it is big enough to see.
//
// Nothing here names a route, station or place: candidates are picked by
// what a feature is (a bus street, a rail line end, a part-time route), from
// the build's own properties.
import { buildStyle } from '../drawn/model.mjs';

export const SPACING = 1200; // metres between plants
export const AVOID = 400; // metres from a known find
const M_LAT = 110_540; // metres per degree of latitude (Denver's)
const mLon = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);

// Seeded random numbers (mulberry32), so a run plants the same faults.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Local metres around a latitude, and back.
const toM = ([lon, lat], lat0) => [lon * mLon(lat0), lat * M_LAT];
const fromM = ([x, y], lat0) => [x / mLon(lat0), y / M_LAT];
export const metres = (a, b) => {
  const lat0 = (a[1] + b[1]) / 2;
  return Math.hypot((a[0] - b[0]) * mLon(lat0), (a[1] - b[1]) * M_LAT);
};
export const lengthM = (coords) => coords.slice(1).reduce((n, c, i) => n + metres(coords[i], c), 0);

// The point `d` metres along a polyline, with the segment it falls on and the
// unit direction there (in local metres: east, north).
export function along(coords, d) {
  let run = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = metres(coords[i - 1], coords[i]);
    if (run + seg >= d || i === coords.length - 1) {
      const t = seg ? Math.min(1, Math.max(0, (d - run) / seg)) : 0;
      const lat0 = coords[i][1];
      const a = toM(coords[i - 1], lat0), b = toM(coords[i], lat0);
      const p = fromM([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], lat0);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { point: p, index: i, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
    }
    run += seg;
  }
  return null;
}
const move = (p, [dx, dy]) => [p[0] + dx / mLon(p[1]), p[1] + dy / M_LAT];
const left = ([x, y]) => [-y, x];
const scale = ([x, y], k) => [x * k, y * k];

// The part of a polyline from d0 to d1 metres along it.
export function slice(coords, d0, d1) {
  const a = along(coords, d0), b = along(coords, d1);
  if (!a || !b) return [];
  return [a.point, ...coords.slice(a.index, b.index), b.point];
}

const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const routesOf = (p) => String(p?.routes ?? p?.route ?? '').split(/[\s,]+/).filter(Boolean);

// Every kind of fault this can plant. `caught_by` is the finding kinds that
// count; `from` the zoom it is a few px at; `radius` the px (at z17) a finding
// may be from a planted point.
export const KINDS = {
  // First: there are only a few terminals, and later plants would crowd them out.
  'terminal-shape': { caught_by: ['terminal-shape', 'self-crossing'], from: 15, radius: 80, about: 'a terminal outline made to cross itself' },
  gap: { caught_by: ['gap', 'dangling'], from: 14, radius: 30, about: 'a 20 m piece cut out of a bus street' },
  'rail-gap': { caught_by: ['gap', 'dangling'], from: 14, radius: 30, about: 'a 20 m piece cut out of a rail line' },
  step: { caught_by: ['step', 'strand-step'], from: 15, radius: 30, about: 'an 80 m stretch of a bus street moved 5 m sideways' },
  'stray-piece': { caught_by: ['short', 'stray-piece', 'dangling'], from: 15, radius: 30, about: 'a 6 m piece of a bus street, 25 m away from any line' },
  overshoot: { caught_by: ['overshoot', 'dangling'], from: 14, radius: 40, about: 'a rail line end carried 40 m past where it ended' },
  hook: { caught_by: ['hook', 'kink', 'short'], from: 15, radius: 30, about: 'a 12 m turn back at the end of a bus route' },
  'off-street': { caught_by: ['off-street', 'kink'], from: 15, radius: 40, about: 'the middle of a bus street pulled 25 m off the street' },
  slot: { caught_by: ['slot', 'off-street'], from: 14, radius: 40, about: 'a 100 m stretch of a part-time route moved 30 m off its line' },
  'stray-stop': { caught_by: ['stray-stop', 'stop-off-line'], from: 15, radius: 30, about: 'a stop moved 60 m away from every line of its routes' },
  'extra-mark': { caught_by: ['duplicate', 'extra-mark'], from: 12, radius: 30, about: 'a station drawn a second time, 15 m away' },
  // Not planted yet: a label fault. Moving a station beside another does not
  // make a fault by itself (MapLibre tries 24 anchors and usually places both
  // names), so a label plant has to use the placement replay to know its name
  // really lands on a line or is hidden. It comes with the label work (#47).
};

/**
 * @param {object} data the build's FeatureCollections by source (not changed)
 * @param {{root: string, seed?: number, per?: number, avoid?: number[][]}} opts
 *   root: the fixture (its page code gives PART_TIME, unless `partTime` is given); avoid: [lon, lat] to keep clear of
 * @returns {Promise<{data: object, planted: Array}>}
 */
export async function plant(data, { root, seed = 1, per = 3, avoid = [], kinds = Object.keys(KINDS), partTime = null } = {}) {
  // The tiers the page draws as part-time, from its own code (style.mjs
  // loads it with the browser stubbed).
  const PART_TIME = partTime ?? (await buildStyle(root, 'dark')).metadata?.['rtd:part-time'];
  if (!Array.isArray(PART_TIME)) throw new Error('plant: the page does not export PART_TIME (shared.js)');
  const random = rng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const out = structuredClone(data);
  const used = [];
  const clear = (p) => used.every((u) => metres(u, p) >= SPACING) && avoid.every((u) => metres(u, p) >= AVOID);
  const planted = [];
  const add = (kind, points, detail) => {
    used.push(...points);
    const { caught_by, from, radius, about } = KINDS[kind];
    planted.push({ id: `${kind}-${planted.filter((p) => p.kind === kind).length + 1}`, kind, caught_by, from, radius_px: radius, about, points, detail });
  };

  // Candidates, from what features are.
  const busStreets = () => out.streets.features.filter((f) => f.properties?.mode === 'bus' && f.geometry.type === 'LineString'
    && routesOf(f.properties).length && lengthM(f.geometry.coordinates) >= 200);
  const railParts = () => out.routes.features.filter((f) => f.properties?.mode === 'rail')
    .flatMap((f) => lines(f.geometry).map((c, part) => ({ f, part, c }))).filter((x) => lengthM(x.c) >= 200);
  const busRoutes = () => out.routes.features.filter((f) => f.properties?.mode === 'bus')
    .flatMap((f) => lines(f.geometry).map((c, part) => ({ f, part, c }))).filter((x) => lengthM(x.c) >= 150);
  const setPart = (f, part, coords) => {
    if (f.geometry.type === 'LineString') f.geometry.coordinates = coords;
    else f.geometry.coordinates[part] = coords;
  };
  const tries = 400;

  // Is any segment of these coordinates within `m` metres of p?
  const near = (p, coordsList, m) => coordsList.some((c) => c.some((q, i) => i > 0 && segM(p, c[i - 1], q) < m));
  function segM(p, a, b) {
    const lat0 = p[1];
    const P = toM(p, lat0), A = toM(a, lat0), B = toM(b, lat0);
    const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / l2)) : 0;
    return Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy);
  }
  const allLines = () => [...out.streets.features, ...out.routes.features].flatMap((f) => lines(f.geometry));

  for (const kind of kinds) {
    let n = 0;
    for (let t = 0; t < tries && n < (kind === 'terminal-shape' ? 1 : per); t++) {
      if (kind === 'gap' || kind === 'step' || kind === 'off-street' || kind === 'stray-piece') {
        const f = pick(busStreets());
        const c = f.geometry.coordinates, L = lengthM(c);
        const mid = along(c, L / 2);
        if (!clear(mid.point)) continue;
        if (kind === 'gap') {
          const a = slice(c, 0, L / 2 - 10), b = slice(c, L / 2 + 10, L);
          f.geometry.coordinates = a;
          out.streets.features.push({ ...f, properties: { ...f.properties }, geometry: { type: 'LineString', coordinates: b } });
          add(kind, [mid.point], `cut 20 m out of a street carrying ${f.properties.routes}`);
        } else if (kind === 'step') {
          const s0 = L / 2 - 40, s1 = L / 2 + 40;
          const head = slice(c, 0, s0), body = slice(c, s0, s1), tail = slice(c, s1, L);
          const side = scale(left(mid.dir), 5);
          f.geometry.coordinates = [...head, ...body.map((p) => move(p, side)), ...tail];
          add(kind, [head.at(-1), tail[0]], `moved 80 m of a street carrying ${f.properties.routes} 5 m sideways`);
        } else if (kind === 'off-street') {
          const head = slice(c, 0, L / 2), tail = slice(c, L / 2, L);
          const pulled = move(mid.point, scale(left(mid.dir), 25));
          if (near(pulled, allLines(), 15)) continue;
          f.geometry.coordinates = [...head.slice(0, -1), pulled, ...tail.slice(1)];
          add(kind, [pulled], `pulled the middle of a street carrying ${f.properties.routes} 25 m off it`);
        } else {
          const at = move(mid.point, scale(left(mid.dir), 25));
          if (near(at, allLines(), 20)) continue;
          const piece = [move(at, scale(mid.dir, -3)), move(at, scale(mid.dir, 3))];
          out.streets.features.push({ type: 'Feature', properties: { ...f.properties }, geometry: { type: 'LineString', coordinates: piece } });
          add(kind, [at], `a 6 m piece of a street carrying ${f.properties.routes}, 25 m from any line`);
        }
        n++;
      } else if (kind === 'rail-gap' || kind === 'overshoot') {
        const { f, part, c } = pick(railParts());
        const L = lengthM(c);
        if (kind === 'rail-gap') {
          const mid = along(c, L / 2);
          if (!clear(mid.point)) continue;
          const a = slice(c, 0, L / 2 - 10), b = slice(c, L / 2 + 10, L);
          setPart(f, part, a);
          out.routes.features.push({ ...f, properties: { ...f.properties }, geometry: { type: 'LineString', coordinates: b } });
          add(kind, [mid.point], `cut 20 m out of rail line ${f.properties.route}`);
        } else {
          // A line end: no other rail piece within 30 m of it.
          const end = c.at(-1);
          if (!clear(end)) continue;
          const others = railParts().filter((x) => x.c !== c).map((x) => x.c);
          if (near(end, others, 30)) continue;
          const last = along(c, L - 0.5);
          const tip = move(end, scale(last.dir, 40));
          setPart(f, part, [...c, tip]);
          add(kind, [tip, end], `carried rail line ${f.properties.route} 40 m past its end`);
        }
        n++;
      } else if (kind === 'hook') {
        const { f, part, c } = pick(busRoutes());
        const end = c.at(-1);
        if (!clear(end)) continue;
        const last = along(c, lengthM(c) - 0.5);
        // Turn back 150 degrees: mostly behind, a little to the left.
        const back = [-last.dir[0] * Math.cos(Math.PI / 6) - last.dir[1] * 0.5, -last.dir[1] * Math.cos(Math.PI / 6) + last.dir[0] * 0.5];
        const tip = move(end, scale(back, 12));
        setPart(f, part, [...c, tip]);
        add(kind, [end, tip], `bent the end of bus route ${f.properties.route} back on itself for 12 m`);
        n++;
      } else if (kind === 'slot') {
        const parts = out.routes.features.filter((f) => f.properties?.mode === 'bus' && PART_TIME.includes(f.properties?.tier))
          .flatMap((f) => lines(f.geometry).map((c, part) => ({ f, part, c }))).filter((x) => lengthM(x.c) >= 300);
        if (!parts.length) break;
        const { f, part, c } = pick(parts);
        const L = lengthM(c), mid = along(c, L / 2);
        if (!clear(mid.point)) continue;
        const s0 = L / 2 - 50, s1 = L / 2 + 50;
        const side = scale(left(mid.dir), 30);
        const moved = [...slice(c, 0, s0), ...slice(c, s0, s1).map((p) => move(p, side)), ...slice(c, s1, L)];
        setPart(f, part, moved);
        add(kind, [move(mid.point, side)], `moved 100 m of part-time route ${f.properties.route} 30 m off its line`);
        n++;
      } else if (kind === 'stray-stop') {
        // Street stops only: a station's gates, tracks and bays sit inside the
        // station, off the lines, by design.
        const stop = pick(out.stops.features.filter((f) => f.geometry.type === 'Point' && routesOf({ routes: f.properties?.lines }).length
          && !f.properties?.gate && !f.properties?.terminal && !/\b(Gate|Track|Platform|Bay)\b/i.test(f.properties?.name ?? '')));
        const p = stop.geometry.coordinates;
        if (!clear(p)) continue;
        const mine = new Set(routesOf({ routes: stop.properties.lines }));
        const theirs = [...out.streets.features, ...out.routes.features].filter((f) => routesOf(f.properties).some((r) => mine.has(r))).flatMap((f) => lines(f.geometry));
        const angle = random() * 2 * Math.PI;
        const moved = move(p, [60 * Math.cos(angle), 60 * Math.sin(angle)]);
        if (near(moved, theirs, 55)) continue;
        stop.geometry.coordinates = moved;
        add(kind, [moved], `moved stop "${stop.properties.name}" 60 m from every line of ${stop.properties.lines}`);
        n++;
      } else if (kind === 'extra-mark') {
        const st = pick(out.stations.features.filter((f) => f.properties?.served));
        const p = st.geometry.coordinates;
        if (!clear(p)) continue;
        const angle = random() * 2 * Math.PI;
        const at = move(p, [15 * Math.cos(angle), 15 * Math.sin(angle)]);
        out.stations.features.push({ ...st, properties: { ...st.properties }, geometry: { type: 'Point', coordinates: at } });
        add(kind, [at], `drew station ${st.properties.id} a second time, 15 m away`);
        n++;
      } else if (kind === 'terminal-shape') {
        for (const term of out.terminals.features) {
          const ring = term.geometry.type === 'Polygon' ? term.geometry.coordinates[0] : term.geometry.coordinates[0][0];
          const centre = [ring.reduce((s, q) => s + q[0], 0) / ring.length, ring.reduce((s, q) => s + q[1], 0) / ring.length];
          if (ring.length < 5 || !clear(centre)) continue;
          // Swap two neighbouring corners: the outline crosses itself.
          [ring[1], ring[2]] = [ring[2], ring[1]];
          add(kind, [centre], `made the outline of terminal "${term.properties.name}" cross itself`);
          n++;
          break;
        }
        break;
      }
    }
  }
  return { data: out, planted };
}
