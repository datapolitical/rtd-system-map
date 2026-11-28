// The wide zooms (#236): the reference rail drawings that serve the band from
// the whole district (8.75) to 12, and the checks the issue names.
//
// The 12 to 16 trial (branch zoom-154-merge, PR #224) draws rail once for
// every two zooms and lets the page set the space between lines: a drawing
// made at 13 serves 12 to 14, one at 15 serves 14 to 16. It found that a
// drawing's curves and corners hold for about two zooms, and that the space
// between lines is exact at every zoom because the page offsets each line by
// its slot times the pitch for the zoom (`pitchAt`). This module applies the
// same rule below 12 and reports the numbers the issue asks for.
//
// It is build-side only. The band needs two reference drawings, at 9 (8.75
// to 10) and at 11 (10 to 12), because the page hands over at a sheet's zoom
// (10 here). The zoom-11 drawing is #157's; this module builds it too so the
// whole band can be checked on main's data today. Nothing here is wired to
// the page: that is #158. See the PR for what is blocked.
//
// Nothing about RTD's network is written down: the drawings and their pairs
// come from `railTracks` on the built data.
import { SIZES, SHEETS, railTracks, railLines, stationMarks, toLonLat, offset } from './sheets.mjs';
import { projection, simplify } from './geom.mjs';

/** The whole district, and the closest zoom this band reaches (sheets 0, 1 and 2). */
export const WIDE_MIN = 8.75;
export const WIDE_MAX = 12;
/** The zoom where the wide band hands over from the drawing at 9 to the one at 11. */
export const WIDE_HANDOVER = 10;
/** The reference zoom of each drawing, each serving from its sheet's zoom to the next. */
export const WIDE_REFS = [
  { zoom: WIDE_MIN, ref: 9 },
  { zoom: WIDE_HANDOVER, ref: 11 },
];

/** The reference zoom shown at `zoom` (the trial's `railRefAt`). */
export function referenceAt(zoom) {
  return [...WIDE_REFS].reverse().find((d) => zoom >= d.zoom - 1e-9)?.ref ?? WIDE_REFS[0].ref;
}

/**
 * Run `fn(id, zoom)` with SIZES interpolated as the page does between the two
 * sheets either side of `zoom`, then put every table back. The production
 * build keeps a size per sheet id; this adapter is for reading a drawing at a
 * zoom between sheets, and #155 replaces it with ordinary zoom-dependent sizes.
 * (Ported from the trial's `withZoom`.)
 */
export function withZoom(zoom, run) {
  // The whole district is the first sheet's own drawing: at or below its zoom
  // there is no earlier table to read between.
  if (zoom <= SHEETS[0].zoom + 1e-9) return run(SHEETS[0].id, zoom);
  const hi = SHEETS.findIndex((s) => s.zoom >= zoom - 1e-9);
  if (hi < 1) throw new Error(`withZoom: ${zoom} is not between two sheets`);
  const lo = SHEETS[hi - 1], up = SHEETS[hi];
  const t = (zoom - lo.zoom) / (up.zoom - lo.zoom);
  const id = lo.id + t * (up.id - lo.id);
  const saved = [];
  for (const table of Object.values(SIZES)) {
    if (!table || typeof table !== 'object' || !Object.hasOwn(table, lo.id) || !Object.hasOwn(table, up.id)) continue;
    saved.push([table, Object.hasOwn(table, id), table[id]]);
    const a = table[lo.id], b = table[up.id];
    table[id] = typeof a === 'number' && typeof b === 'number' ? a + (b - a) * t : t < 1 - 1e-9 ? a : b;
  }
  try {
    return run(id, zoom);
  } finally {
    for (const [table, existed, value] of saved) {
      if (existed) table[id] = value;
      else delete table[id];
    }
  }
}

/** The space between two lines that share track, in px at `zoom` (model.js, `pitchAt`). */
export function pitchAt(zoom) {
  return withZoom(zoom, (id) => SIZES.rail[id] + SIZES.gap[id]);
}

/** Two passes of a moving average over `values`, `reach` samples each way (sheets.mjs, `slotted`). */
function easedSlots(values, reach) {
  let slots = values.map((v) => v);
  for (let pass = 0; pass < 2; pass++) {
    const was = slots;
    slots = was.map((_, i) => {
      const k = Math.min(reach, i, was.length - 1 - i);
      let sum = 0;
      for (let j = i - k; j <= i + k; j++) sum += was[j];
      return sum / (2 * k + 1);
    });
  }
  return slots;
}

/** The path's unit right normal at each point, from the points either side (sheets.mjs, `offset`). */
function normalsOf(path) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const d = dist(a, b) || 1;
    return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
  });
}

/**
 * Split a track into pieces of constant slot. The page moves each line sideways
 * by its slot, so a piece is the unit it can offset without bending: the slot is
 * rounded to a thirty-second and a new piece starts where it changes.
 */
export function slotPieces({ center, slots }) {
  const rounded = slots.map((s) => Math.round(s * 32) / 32);
  const pieces = [];
  let start = 0;
  for (let i = 1; i < center.length; i++) {
    if (i < center.length - 1 && rounded[i] === rounded[start]) continue;
    pieces.push({ slot: rounded[start], from: start, points: center.slice(start, i + 1) });
    start = i;
  }
  return pieces;
}

/**
 * One reference rail drawing at `refZoom`, from the built data, in pixel
 * coordinates at that zoom. Each track keeps its shared centreline and each
 * point's slot; the page scales the centreline and offsets by slot * pitch for
 * the zoom it shows.
 *
 * Returns `{ ref, pitch, rail, gap, tracks, features, bars }`:
 * - `tracks`: `{ route, color, run, center, slots, normals }` in ref pixels.
 * - `features`: GeoJSON LineStrings (lon/lat at `ref`) split at slot changes,
 *   the shape the page loads, each with `route`, `slot`, `ref` and `key`.
 * - `bars`: each station's bar at `ref` (pixel ends) and the routes it serves.
 */
export function buildReference(data, refZoom) {
  return withZoom(refZoom, (id, zoom) => {
    const { joined, tracks, pitch } = railTracks(data.routes, { id, zoom });
    const out = { ref: refZoom, pitch, rail: SIZES.rail[id], gap: SIZES.gap[id], tracks: [], features: [], bars: [], lineEnds: [] };
    joined.forEach((line, k) => {
      tracks[k].forEach((t, run) => {
        if (t.track.length < 2) return;
        const center = t.track.map((p) => [p[0], p[1]]);
        const slots = easedSlots(t.pts.map((p) => p[2]), SIZES.ease);
        out.tracks.push({ route: line.route, color: line.color, run, center, slots, normals: normalsOf(center) });
        for (const piece of slotPieces({ center, slots })) {
          out.features.push({
            type: 'Feature',
            properties: { route: line.route, color: line.color, slot: piece.slot, ref: refZoom, key: `${line.route}:${run}:${piece.from}` },
            geometry: { type: 'LineString', coordinates: piece.points.map((p) => toLonLat(p, refZoom)) },
          });
        }
      });
    });
    // Station bars, for the terminal check. The marks are the ones the build draws.
    const lines = railLines(data.routes, { id, zoom });
    for (const line of lines) {
      for (const path of line.paths) {
        if (path.length < 2) continue;
        out.lineEnds.push({ route: line.route, point: path[0] });
        out.lineEnds.push({ route: line.route, point: path.at(-1) });
      }
    }
    for (const m of stationMarks(data.stations, lines, { id, zoom })) {
      for (const bar of [m.ends, ...(m.more ?? [])]) {
        out.bars.push({ name: m.name, routes: String(m.lines ?? '').split(' ').filter(Boolean), ends: bar.map((p) => [p[0], p[1]]), hub: !!m.hub });
      }
    }
    return out;
  });
}

/** Each track's path at `zoom`, the way the page draws it: its centreline scaled, each piece moved by its slot. */
export function renderedPaths(reference, zoom) {
  const factor = 2 ** (zoom - reference.ref);
  const pitch = pitchAt(zoom);
  const paths = new Map();
  for (const track of reference.tracks) {
    const pieces = slotPieces(track).map((piece) => ({ ...piece, points: piece.points.map(([x, y]) => [x * factor, y * factor]) }));
    const path = [];
    for (const piece of pieces) path.push(...offset(piece.points, piece.slot * pitch).slice(path.length ? 1 : 0));
    if (!paths.has(track.route)) paths.set(track.route, []);
    paths.get(track.route).push({ run: track.run, path });
  }
  return paths;
}

/** Perpendicular distance from `p` to the segment `a`-`b`. */
function segmentDistance(p, [a, b]) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den)) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/** A grid of a path's segments, so a nearest distance is read from nearby cells only. */
export function segmentGrid(paths, cell = 24) {
  const map = new Map();
  const span = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const key = (x, y) => `${x},${y}`;
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      const seg = { a, b };
      const [x0, x1] = [Math.floor(Math.min(a[0], b[0]) / cell), Math.floor(Math.max(a[0], b[0]) / cell)];
      const [y0, y1] = [Math.floor(Math.min(a[1], b[1]) / cell), Math.floor(Math.max(a[1], b[1]) / cell)];
      span.x0 = Math.min(span.x0, x0); span.x1 = Math.max(span.x1, x1);
      span.y0 = Math.min(span.y0, y0); span.y1 = Math.max(span.y1, y1);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = key(x, y);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(seg);
      }
    }
  }
  return { map, cell, key, span };
}

/** The nearest distance from `p` to any segment in a `segmentGrid`. */
export function nearestInGrid(grid, p) {
  const cx = Math.floor(p[0] / grid.cell), cy = Math.floor(p[1] / grid.cell);
  let best = Infinity;
  const { x0, x1, y0, y1 } = grid.span;
  // Out as far as the farthest occupied cell, so a lone far segment is found too.
  const last = Math.max(0, cx - x0, x1 - cx, cy - y0, y1 - cy);
  for (let ring = 0; ring <= last; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      for (const seg of grid.map.get(grid.key(cx + dx, cy + dy)) ?? []) best = Math.min(best, segmentDistance(p, [seg.a, seg.b]));
    }
    // A cell one ring out is at least (ring - 1) cells away; stop once nothing can be closer.
    if (best <= Math.max(0, ring - 1) * grid.cell) break;
  }
  return best;
}

/** Mean and extreme of an array of numbers. */
function stats(values) {
  const mean = values.reduce((n, v) => n + v, 0) / values.length;
  return { mean, min: Math.min(...values), max: Math.max(...values) };
}

/**
 * The route pairs that share track in `reference`. Nothing is listed: a pair
 * shares where one's centreline lies within a pixel of the other's for at
 * least 20 px. Returns `[{ a, b, runA, runB }]`.
 */
export function sharedPairs(reference) {
  const pairs = [];
  for (let i = 0; i < reference.tracks.length; i++) {
    for (let j = i + 1; j < reference.tracks.length; j++) {
      const [a, b] = [reference.tracks[i], reference.tracks[j]];
      if (a.route === b.route) continue;
      const grid = segmentGrid([b.center]);
      let run = 0, longest = 0, end = 0;
      for (let i = 0; i < a.center.length; i++) {
        if (nearestInGrid(grid, a.center[i]) <= 1.5) {
          run += 1;
          if (run > longest) [longest, end] = [run, i + 1];
        } else run = 0;
      }
      if (longest >= 20) pairs.push({ a: a.route, b: b.route, runA: a.run, runB: b.run, from: end - longest, to: end });
    }
  }
  return pairs;
}

/**
 * The gap between each line's drawn end and the station bar it ends at, in px
 * at the reference zoom. The bar is drawn across the lines, so the line's end
 * should lie on the bar segment. `ok` within 1 px. Across the band the bar and
 * the line move together (the page scales the centreline and offsets both by
 * the same slot and pitch), so this gap does not grow with zoom.
 */
export function terminalGaps(reference, tolerance = 1) {
  const results = [];
  for (const { route, point } of reference.lineEnds) {
    const bars = reference.bars.filter((b) => b.routes.includes(route));
    if (!bars.length) continue;
    let best = null;
    for (const bar of bars) {
      const d = segmentDistance(point, bar.ends);
      if (!best || d < best.d) best = { d, station: bar.name };
    }
    results.push({ route, station: best.station, distance: best.d, ok: best.d <= tolerance });
  }
  return results;
}

/**
 * How far a reference drawing's centreline drifts from a drawing made fresh at
 * `zoom`, in px at `zoom`. The reference's points are scaled to the zoom and
 * each is compared with the fresh centreline of its own route. This is the
 * trial's "a drawing holds for about two zooms": the spacing itself is exact
 * (the page sets it), but the curves and corners are the reference's.
 */
export function referenceDrift(data, reference, zoom) {
  const factor = 2 ** (zoom - reference.ref);
  const fresh = withZoom(zoom, (id, z) => railTracks(data.routes, { id, zoom: z }));
  const byRoute = new Map();
  fresh.joined.forEach((line, k) => {
    for (const t of fresh.tracks[k]) {
      if (t.track.length < 2) continue;
      if (!byRoute.has(line.route)) byRoute.set(line.route, []);
      // Into the reference's frame, so the comparison is one scale.
      byRoute.get(line.route).push(t.track.map((p) => [p[0] / factor, p[1] / factor]));
    }
  });
  const routes = [];
  for (const track of reference.tracks) {
    const targets = byRoute.get(track.route) ?? [];
    if (!targets.length) continue;
    const grid = segmentGrid(targets);
    const distances = [];
    for (let i = 0; i < track.center.length; i += 5) distances.push(nearestInGrid(grid, track.center[i]));
    if (!distances.length) continue;
    const { mean, max } = stats(distances);
    routes.push({ route: track.route, mean: mean * factor, max: max * factor, samples: distances.length });
  }
  return { zoom, ref: reference.ref, routes, worst: Math.max(0, ...routes.map((r) => r.max)), mean: Math.max(0, ...routes.map((r) => r.mean)) };
}

/**
 * The zoom at which the whole district's frame just fits a screen, before the
 * page's clamps (main.js, `fitWhole`). `side` is the clear space at each side
 * (44 px: a town's name centred on its point, Boulder); `foot` is the sheet
 * buttons' height; `pad` is the space above and below (32 px).
 */
export function frameFit(frame, { width, height, side = 44, foot = 0, pad = 32 }) {
  const [w, s, e, n] = frame;
  const y = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
  const across = width - 2 * side;
  const down = height - foot - pad;
  return Math.min(
    Math.log2(across / (512 * ((e - w) / 360))),
    Math.log2(down / (512 * (y(s) - y(n)))),
  );
}

/** A reference's features thinned to `px` at the closest zoom it serves (trial, `thinned`). */
export function thinned(feature, px = 0.1) {
  if (feature.geometry.type !== 'LineString') return feature;
  const coords = feature.geometry.coordinates;
  const { project } = projection(coords[0], 6);
  const tolerance = (px * (40075016.686 * Math.cos((coords[0][1] * Math.PI) / 180))) / (512 * 2 ** (feature.properties.ref + 1));
  return { ...feature, geometry: { ...feature.geometry, coordinates: simplify(coords.map((c, i) => [...project(c), i]), tolerance).map((p) => coords[p[2]]) } };
}

/** Counts and the gzipped size of a reference's rail features, before and after thinning. */
export async function referenceSummary(reference) {
  const { gzipSync } = await import('node:zlib');
  const geojson = { type: 'FeatureCollection', features: reference.features };
  const thin = { type: 'FeatureCollection', features: reference.features.map((f) => thinned(f)) };
  const points = (fc) => fc.features.reduce((n, f) => n + f.geometry.coordinates.length, 0);
  return {
    ref: reference.ref,
    features: reference.features.length,
    points: points(geojson),
    pointsThinned: points(thin),
    gzipBytes: gzipSync(JSON.stringify(geojson)).length,
    gzipBytesThinned: gzipSync(JSON.stringify(thin)).length,
    tracks: reference.tracks.length,
    bars: reference.bars.length,
  };
}
