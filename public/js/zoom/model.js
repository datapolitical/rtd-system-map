// Pure geometry shared by the #154 preview, its build and its checks.
export const MIN_ZOOM = 12;
export const MAX_ZOOM = 16;
// The frame every attachment is given in (pixels and pitches at this zoom), whichever rail
// drawing it rides.
export const REFERENCE_ZOOM = 13;
// The rail drawings: each is drawn at `ref` and serves from `zoom` to the next drawing's zoom, so
// it is never enlarged or shrunk by more than one zoom. Drawn once at 13 and seen at 16, rail sat
// a median 23 px off its track; the zoom-15 drawing is 5.8 px off at 16, as 13 is at 14.
export const RAIL_DRAWINGS = [{ zoom: 12, ref: 13, set: '13' }, { zoom: 14, ref: 15, set: '15' }];
export const railRefAt = (zoom) => [...RAIL_DRAWINGS].reverse().find((d) => zoom >= d.zoom - 1e-9)?.ref ?? RAIL_DRAWINGS[0].ref;

export function sizeAt(stops, zoom) {
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z, value] = stops[i], [before, previous] = stops[i - 1];
    if (zoom <= z) return previous + (value - previous) * (zoom - before) / (z - before);
  }
  return stops.at(-1)[1];
}

export const pixels = ([lon, lat], zoom = REFERENCE_ZOOM) => {
  const world = 512 * 2 ** zoom;
  return [(lon + 180) / 360 * world, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * world];
};
export const coordinate = ([x, y], zoom = REFERENCE_ZOOM) => {
  const world = 512 * 2 ** zoom;
  return [x / world * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / world))) * 180 / Math.PI];
};

export function pitchAt(sizes, zoom) {
  return sizeAt(sizes.rail, zoom) + sizeAt(sizes.gap, zoom);
}

// A reference point and its lateral displacement, expressed in reference-zoom pixels.
// The displacement follows the line pitch in screen pixels while its track stays geographic.
export function attachedPoint([x, y, dx, dy], sizes, zoom) {
  const scale = pitchAt(sizes, zoom) / pitchAt(sizes, REFERENCE_ZOOM) / 2 ** (zoom - REFERENCE_ZOOM);
  return coordinate([x + dx * scale, y + dy * scale]);
}

export function attachedCollection(collection, sizes, zoom) {
  return { type: 'FeatureCollection', features: collection.features.map((f) => {
    if (!f.attachment) return f;
    const at = (a) => {
      const p = attachedPoint(a, sizes, zoom);
      if (!f.labelOffset) return p;
      const q = pixels(p, zoom);
      const ratio = sizeAt(sizes.name, zoom) / sizeAt(sizes.name, f.labelZoom);
      return coordinate([q[0] + f.labelOffset[0] * ratio, q[1] + f.labelOffset[1] * ratio], zoom);
    };
    return { type: 'Feature', id: f.id, properties: f.properties,
      geometry: { type: f.geometry.type, coordinates: f.geometry.type === 'Point' ? at(f.attachment) : f.attachment.map(at) } };
  }) };
}

export function frameAt(frames, zoom, step = 0.25) {
  const value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor((zoom + 1e-8) / step) * step));
  return frames.reduce((best, f) => Math.abs(f.zoom - value) < Math.abs(best.zoom - value) ? f : best, frames[0]);
}

export function labelChanges(before, after) {
  const a = new Map(before.map((n) => [n.key, n]));
  const common = after.filter((n) => a.has(n.key));
  const changed = common.filter((n) => n.anchor !== a.get(n.key).anchor);
  return { common: common.length, changed: changed.length,
    disappeared: before.filter((n) => !after.some((o) => o.key === n.key)).map((n) => n.key),
    changes: changed.map((n) => ({ key: n.key, name: n.name, from: a.get(n.key).anchor, to: n.anchor, reason: n.reason })) };
}

// How a station name gets from one quarter-zoom drawing to the next. A name that keeps its
// side and wording glides with the zoom between the two drawings. A name that changes side
// fades out, then fades in at its new place, on a short timer, so the two places never show
// together and stopping mid-pinch never leaves a name half-faded. It changes side only once
// the zoom is SIDE_HOLD of a step past the halfway point, so a shaky pinch cannot make it
// flicker; zooming back, it returns only the same distance past halfway the other way.
export const SIDE_HOLD = 0.2;
export const FADE_OUT_MS = 120;
export const FADE_IN_MS = 140;

const groupOf = (f) => (f.properties.kind === 'name' ? f.properties.key : f.properties.key.slice(0, f.properties.key.lastIndexOf(':')));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPoint = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

function grouped(collection) {
  const groups = new Map();
  for (const f of collection.features) {
    const g = groupOf(f);
    if (!groups.has(g)) groups.set(g, { side: null, features: [] });
    const group = groups.get(g);
    group.features.push(f);
    if (f.properties.kind === 'name') group.side = `${f.properties.anchor}|${f.properties.text}`;
  }
  return groups;
}

function glide(a, b, t) {
  const other = new Map(b.features.map((f) => [f.properties.key, f]));
  return a.features.map((f) => {
    const g = other.get(f.properties.key);
    if (!g || g.geometry.type !== 'Point' || f.geometry.type !== 'Point') return f;
    const properties = f.properties.kind === 'name' && f.properties.offset && g.properties.offset
      ? { ...f.properties, offset: lerpPoint(f.properties.offset, g.properties.offset, t) } : f.properties;
    return { ...f, properties, geometry: { type: 'Point', coordinates: lerpPoint(f.geometry.coordinates, g.geometry.coordinates, t) } };
  });
}

// state = { sides: Map, fades: Map } kept by the page between calls; now in milliseconds.
export function labelsAt(frames, zoom, sizes, state, now, { motion = true, step = 0.25 } = {}) {
  const a = frameAt(frames, zoom, step);
  const i = frames.indexOf(a);
  const b = frames[i + 1] ?? a;
  const t = b === a ? 0 : Math.max(0, Math.min(1, (zoom - a.zoom) / step));
  const cache = new Map();
  const groupsOf = (frame) => {
    if (!cache.has(frame)) cache.set(frame, grouped(attachedCollection(frame.labels, sizes, zoom)));
    return cache.get(frame);
  };
  const ga = groupsOf(a), gb = groupsOf(b);
  const features = [];
  let busy = false;
  for (const [g, here] of ga) {
    const next = gb.get(g);
    const changing = next && next.side !== here.side;
    const want = changing && t >= 0.5 ? next.side : here.side;
    const featuresFor = (side) => {
      if (side === here.side) return next && !changing ? glide(here, next, t) : here.features;
      if (next && side === next.side) return next.features;
      const nearest = [...frames].sort((x, y) => Math.abs(x.zoom - zoom) - Math.abs(y.zoom - zoom))
        .map((f) => groupsOf(f).get(g)).find((x) => x?.side === side);
      return nearest ? nearest.features : here.features;
    };
    let shown = state.sides.get(g) ?? want;
    if (shown !== want) {
      const held = changing && ((shown === here.side && t < 0.5 + SIDE_HOLD) || (shown === next.side && t > 0.5 - SIDE_HOLD));
      if (!held) {
        const running = state.fades.get(g);
        const p = running ? now - running.start : Infinity;
        if (!motion) state.fades.delete(g);
        else if (running && p < FADE_OUT_MS && want === running.from) {
          // Turned back while the old place was still fading out: fade it straight back in.
          state.fades.set(g, { from: null, to: want, start: now - FADE_OUT_MS - (1 - p / FADE_OUT_MS) * FADE_IN_MS });
        } else if (running && p < FADE_OUT_MS) state.fades.set(g, { ...running, to: want });
        else state.fades.set(g, { from: shown, to: want, start: now });
        shown = want;
      }
    }
    state.sides.set(g, shown);
    const fade = state.fades.get(g);
    let list = featuresFor(shown), opacity = 1;
    if (fade) {
      const p = now - fade.start;
      if (p < FADE_OUT_MS && fade.from !== null) { list = featuresFor(fade.from); opacity = 1 - p / FADE_OUT_MS; busy = true; }
      else if (p < FADE_OUT_MS + FADE_IN_MS) { opacity = Math.max(0, (p - FADE_OUT_MS) / FADE_IN_MS); busy = true; }
      else state.fades.delete(g);
    }
    for (const f of list) features.push(opacity === 1 ? f : { ...f, properties: { ...f.properties, fade: opacity } });
  }
  return { collection: { type: 'FeatureCollection', features: features.map((f) => placedName(f, sizes, zoom)) }, busy, frame: a };
}

// A name's offset (in ems of its text size) turned into its place on the map, so the name rides
// the map exactly as its route chips do. Left as a screen offset, a name kept its distance in
// pixels while the chips, placed on the map, spread with the zoom; during a quick pinch, before
// the page's next update, the chips ran up into the name (RTD map, real iPhone run 2026-11-25).
export function placedName(f, sizes, zoom) {
  const offset = f.properties.offset;
  if (f.properties.kind !== 'name' || !offset || f.geometry.type !== 'Point' || (!offset[0] && !offset[1])) return f;
  const size = sizeAt(sizes.name, zoom);
  const [x, y] = pixels(f.geometry.coordinates, zoom);
  return { ...f, properties: { ...f.properties, offset: [0, 0] },
    geometry: { type: 'Point', coordinates: coordinate([x + offset[0] * size, y + offset[1] * size], zoom) } };
}

// The bus drawings: each serves from its own zoom up to the next, so its lettering is only ever
// enlarged, never squeezed below the size it was placed for. Zooming in, the next drawing takes
// over at its zoom; zooming out, the closer drawing holds BUS_HOLD below its zoom before handing
// back. Sets '2', '3' and '4' are the sheets; '13' and '15' are drawn for this trial.
export const BUS_DRAWINGS = [{ zoom: 12, set: '2' }, { zoom: 13, set: '13' }, { zoom: 14, set: '3' }, { zoom: 15, set: '15' }, { zoom: 16, set: '4' }];
export const BUS_HOLD = 0.05;
// The bus drawings whose route lists the build places itself, each a point with the angle of its
// street, for the page to draw as they stand and hide none (#156, the first trial of one decider
// for lettering: scripts/zoom-prototype.mjs, placedLists; style.js). The rest are still set along
// their stretch by MapLibre, which hides one when its own measure finds no room. Every drawing
// from 13 places its lists (Chris, 2026-11-27: "Place the lists at 15 and 16 too"), so a list
// carries through each handover instead of being placed afresh by MapLibre.
export const LISTS_PLACED = [13, 14, 15, 16];

// Which of a list of drawings shows at this zoom. A drawing hands over to the next at once, with
// no fade: two drawings of the same streets or track lie a few pixels apart, so crossing them
// over showed every line doubled and striped, with ghost line letters beside the rail, for a
// quarter of a second at each handover (real iPhone runs 2026-11-25).
// `ready(set)`, when given, says whether a drawing has loaded where it is needed: the one showing
// holds until the next has, so a pinch faster than loading never shows nothing. Waiting counts as
// busy, so the page asks again next frame.
export function drawingAt(drawings, zoom, state, { ready } = {}) {
  const target = [...drawings].reverse().find((d) => zoom >= d.zoom - 1e-9) ?? drawings[0];
  const current = drawings.find((d) => d.set === state.set) ?? target;
  let next = target;
  if (current.zoom > target.zoom && zoom >= current.zoom - BUS_HOLD) next = current;
  const busy = state.set !== undefined && next.set !== state.set && !!ready && !ready(next.set);
  if (!busy) state.set = next.set;
  const sets = Object.fromEntries(drawings.map((d) => [d.set, { lines: d.set === state.set ? 1 : 0, labels: d.set === state.set ? 1 : 0 }]));
  return { sets, busy, set: state.set };
}

export const busDrawingAt = (zoom, state, options) => drawingAt(BUS_DRAWINGS, zoom, state, options);
// The rail drawing hands over at the same zoom as the bus drawing there.
export const railDrawingAt = (zoom, state, options) => drawingAt(RAIL_DRAWINGS, zoom, state, options);

// The rail-attached features (station bars, line letters) of the rail drawings showing now, each
// carrying its drawing's fade: bars cross over with the rail, letters fade out before the new in.
export function attachedFor(collection, rail, zoom) {
  const sets = Object.fromEntries(RAIL_DRAWINGS.map((d) => [d.ref, rail.sets[d.set]]));
  const features = [];
  for (const f of collection.features) {
    if (f.properties.minzoom > zoom + 1e-9) continue;
    const o = sets[f.properties.ref ?? REFERENCE_ZOOM];
    const v = o && (f.properties.kind === 'letter' ? o.labels : o.lines);
    if (!v) continue;
    features.push(v === 1 ? f : { ...f, properties: { ...f.properties, fade: v } });
  }
  return { type: 'FeatureCollection', features };
}

// The slide across the rail handover at 14 (#256). The two rail drawings are the same routes
// drawn at 13 and at 15: 393 pieces each, the same pieces in the same order, with the same slot,
// but sampled at their own zoom, so at the handover a fifth of the rail moved more than 3 px and
// the worst line 18 px at 14. Rather than jump, the page draws, for a short band either side of
// 14, one line for each route whose points glide from the wider drawing's placed line to the
// closer one's. The band's ends are the drawings themselves, so the change at either end is a
// change of nothing. Offsets are baked at 14: the pitch moves 0.05 px across the band, so the
// normal drawings' own line-offset differs from the baked one by under a tenth of a pixel.
// `setData` on the rail every frame during a pinch is the cost; the lines are thinned to
// BLEND_TOLERANCE at 14 (about 4,000 points) so an iPhone run can say whether it holds.
export const RAIL_BLEND_FROM = 13.8;
export const RAIL_BLEND_TO = 14.2;
export const RAIL_BLEND_ZOOM = 14;
export const BLEND_TOLERANCE = 0.08;

// null outside the band; inside it, how far the closer drawing has come (0 at 13.8, 1 at 14.2).
export function railBlendAt(zoom) {
  if (!(zoom >= RAIL_BLEND_FROM && zoom < RAIL_BLEND_TO)) return null;
  return (zoom - RAIL_BLEND_FROM) / (RAIL_BLEND_TO - RAIL_BLEND_FROM);
}

// A rail drawing's pieces for one route: the pieces are contiguous slices of one track, so they
// join back into the whole line, each point keeping its piece's slot.
function joinedRail(pieces) {
  const points = [], slots = [];
  for (const f of pieces) {
    const c = f.geometry.coordinates;
    for (let i = 0; i < c.length; i++) {
      if (points.length && i === 0) {
        const last = points.at(-1);
        if (Math.abs(last[0] - c[i][0]) < 1e-12 && Math.abs(last[1] - c[i][1]) < 1e-12) continue;
      }
      points.push([c[i][0], c[i][1]]);
      slots.push(f.properties.slot);
    }
  }
  return { points, slots };
}

const cumulative = (points) => points.reduce((out, p, i) => {
  out.push(i ? out[i - 1] + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0);
  return out;
}, []);

// The nearest point on a polyline, as a fraction of its length.
function nearestParam(p, points, cum) {
  let best = { d: Infinity, u: 0 };
  const total = cum.at(-1) || 1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den));
    const q = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { d, u: (cum[i - 1] + Math.hypot(q[0] - a[0], q[1] - a[1])) / total };
  }
  return best;
}

const GRID_CELL = 32;
function segmentGrid(points, cell = GRID_CELL) {
  const grid = new Map();
  const key = (x, y) => `${x},${y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++) {
      for (let y = Math.floor(Math.min(a[1], b[1]) / cell); y <= Math.floor(Math.max(a[1], b[1]) / cell); y++) {
        const k = key(x, y);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  }
  return grid;
}

// The nearest point on a polyline, looking only in the cells around it (the two lines are within
// a few pixels), with the whole-line scan as a fallback. The full scan is O(n) per vertex, which
// made preparing the slide take 1.5 s; this is O(1) per vertex for two lines in sight of each other.
function nearestParamGrid(p, points, cum, grid, cell = GRID_CELL) {
  const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
  let best = null;
  const total = cum.at(-1) || 1;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const i of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
      const a = points[i - 1], b = points[i];
      const ex = b[0] - a[0], ey = b[1] - a[1], den = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / den));
      const q = [a[0] + ex * t, a[1] + ey * t];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) best = { d, u: (cum[i - 1] + Math.hypot(q[0] - a[0], q[1] - a[1])) / total };
    }
  }
  return best ?? nearestParam(p, points, cum);
}

function pointAt(points, cum, u) {
  const target = Math.max(0, Math.min(1, u)) * (cum.at(-1) || 0);
  let lo = 0, hi = points.length - 1;
  while (lo < hi - 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= target) lo = m; else hi = m;
  }
  const span = cum[hi] - cum[lo] || 1;
  const t = Math.max(0, Math.min(1, (target - cum[lo]) / span));
  return [points[lo][0] + (points[hi][0] - points[lo][0]) * t, points[lo][1] + (points[hi][1] - points[lo][1]) * t];
}

// Where one drawing's line sits against the other, as pairs of positions along the two lines.
// Every vertex of each line is projected onto the other, so neither drawing loses a corner; the
// two projections are held in order (a rail route does not run backwards along itself), and the
// first and last points are the ends of both lines.
export function railPairs(a, b) {
  let second = b;
  let cumB = cumulative(second);
  if (nearestParam(a[0], second, cumB).u > nearestParam(a.at(-1), second, cumB).u) {
    second = [...second].reverse();
    cumB = cumulative(second);
  }
  const cumA = cumulative(a);
  const gridB = segmentGrid(second), gridA = segmentGrid(a);
  const aToB = a.map((p) => nearestParamGrid(p, second, cumB, gridB).u);
  const bToA = second.map((p) => nearestParamGrid(p, a, cumA, gridA).u);
  for (let i = 1; i < aToB.length; i++) aToB[i] = Math.max(aToB[i], aToB[i - 1]);
  for (let i = 1; i < bToA.length; i++) bToA[i] = Math.max(bToA[i], bToA[i - 1]);
  const entries = [[0, 0], [1, 1]];
  for (let i = 0; i < a.length; i++) entries.push([cumA[i] / (cumA.at(-1) || 1), aToB[i]]);
  for (let j = 0; j < second.length; j++) entries.push([bToA[j], cumB[j] / (cumB.at(-1) || 1)]);
  entries.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = [];
  let lastB = 0;
  for (const [rawA, rawB] of entries) {
    const ua = Math.max(0, Math.min(1, rawA));
    lastB = Math.max(lastB, Math.max(0, Math.min(1, rawB)));
    out.push([ua, lastB]);
  }
  return { pairs: out, reversed: second !== b };
}

// A line that keeps both drawings' points, thinned to a tolerance in screen pixels at 14. The
// deviation is the larger of the two drawings', so neither loses a corner the other keeps.
function thinPairs(pairs, tolerance) {
  if (pairs.length <= 2) return pairs;
  const distance = (p, i, j, pick) => {
    const a = pairs[i][pick], b = pairs[j][pick];
    const dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den));
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  const keep = new Uint8Array(pairs.length);
  keep[0] = keep[pairs.length - 1] = 1;
  const stack = [[0, pairs.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let worst = -1, at = 0;
    for (let k = i + 1; k < j; k++) {
      const d = Math.max(distance(pairs[k][0], i, j, 0), distance(pairs[k][1], i, j, 1));
      if (d > worst) { worst = d; at = k; }
    }
    if (worst > tolerance && at > 0) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return pairs.filter((_, i) => keep[i]);
}

// Both drawings' lines for every route, placed at 14 and paired, ready for `blendRail` to glide
// between. Built once when the page first reaches the band.
export function prepareRailBlend(rails, sizes) {
  const pitch = pitchAt(sizes, RAIL_BLEND_ZOOM);
  const groups = new Map();
  for (const f of rails.features) {
    const route = f.properties.route;
    if (!groups.has(route)) groups.set(route, { color: f.properties.color, refs: new Map() });
    const group = groups.get(route);
    if (!group.refs.has(f.properties.ref)) group.refs.set(f.properties.ref, []);
    group.refs.get(f.properties.ref).push(f);
  }
  const routes = [];
  for (const [route, group] of groups) {
    const from = group.refs.get(RAIL_DRAWINGS[0].ref), to = group.refs.get(RAIL_DRAWINGS[1].ref);
    if (!from?.length || !to?.length) continue;
    const order = (f) => Number(f.properties.key.split(':')[2]);
    const placed = (pieces) => {
      const { points, slots } = joinedRail([...pieces].sort((x, y) => order(x) - order(y)));
      const px = points.map((p) => pixels(p, RAIL_BLEND_ZOOM));
      return { points: px, slots };
    };
    const a = placed(from), b = placed(to);
    const offset = ({ points, slots }) => points.map((p, i) => {
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const dx = after[0] - before[0], dy = after[1] - before[1], d = Math.hypot(dx, dy) || 1;
      return [p[0] - dy / d * slots[i] * pitch, p[1] + dx / d * slots[i] * pitch];
    });
    const aPx = offset(a), bPx = offset(b);
    const { pairs } = railPairs(aPx, bPx);
    const cumA = cumulative(aPx), cumB = cumulative(bPx);
    const kept = thinPairs(pairs.map(([ua, ub]) => [pointAt(aPx, cumA, ua), pointAt(bPx, cumB, ub)]), BLEND_TOLERANCE);
    routes.push({ route, color: group.color,
      a: kept.map(([p]) => coordinate(p, RAIL_BLEND_ZOOM)),
      b: kept.map(([, p]) => coordinate(p, RAIL_BLEND_ZOOM)),
      points: kept.length });
  }
  return { from: RAIL_BLEND_FROM, to: RAIL_BLEND_TO, zoom: RAIL_BLEND_ZOOM, routes,
    points: routes.reduce((n, r) => n + r.points, 0) };
}

// One feature for each route: its line at `t` between the two drawings. Offsets are already in
// the points, so the blend's layers draw it with no line-offset.
export function blendRail(prepared, t) {
  return { type: 'FeatureCollection', features: prepared.routes.map((r) => ({
    type: 'Feature',
    properties: { kind: 'rail', ref: 'blend', route: r.route, color: r.color, slot: 0 },
    geometry: { type: 'LineString', coordinates: r.a.map((p, i) => [p[0] + (r.b[i][0] - p[0]) * t, p[1] + (r.b[i][1] - p[1]) * t]) },
  })) };
}

// What identifies one station bar or line letter in both rail drawings.
export const attachedKey = (f) => f.properties.kind === 'letter'
  ? `letter|${f.properties.key}` : `station|${f.properties.id}|${f.properties.bar}`;

// Station bars and line letters gliding with their rail: the same features drawn at 14 from each
// drawing (attachedCollection) and paired by what they are. Both drawings carry the same 520.
export function blendAttached(a, b, t) {
  const other = new Map(b.features.map((f) => [attachedKey(f), f]));
  const mix = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const features = a.features.map((f) => {
    const g = other.get(attachedKey(f));
    if (!g) return f;
    const geometry = f.geometry.type === 'Point'
      ? { type: 'Point', coordinates: mix(f.geometry.coordinates, g.geometry.coordinates) }
      : { type: f.geometry.type, coordinates: f.geometry.coordinates.map((p, i) => mix(p, g.geometry.coordinates[i] ?? p)) };
    return { ...f, properties: { ...f.properties, ref: 'blend' }, geometry };
  });
  for (const f of b.features) if (!a.features.some((g) => attachedKey(g) === attachedKey(f))) features.push({ ...f, properties: { ...f.properties, ref: 'blend' } });
  return { type: 'FeatureCollection', features };
}
