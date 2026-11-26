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
// back. At a handover the lines cross over, and the old labels fade out before the new fade in.
// Sets '2', '3' and '4' are the sheets; '13' and '15' are drawn for this trial.
export const BUS_DRAWINGS = [{ zoom: 12, set: '2' }, { zoom: 13, set: '13' }, { zoom: 14, set: '3' }, { zoom: 15, set: '15' }, { zoom: 16, set: '4' }];
export const BUS_HOLD = 0.05;
export const BUS_LINE_MS = FADE_OUT_MS + FADE_IN_MS;

// Which of a list of drawings shows at this zoom, and how far each is faded in. `lines` cross
// over (the new come up over the first half, the old go over the second, so the streets never
// pass through a pale middle); `labels` fade out before the new fade in.
export function drawingAt(drawings, zoom, state, now, { motion = true } = {}) {
  const target = [...drawings].reverse().find((d) => zoom >= d.zoom - 1e-9) ?? drawings[0];
  const current = drawings.find((d) => d.set === state.set) ?? target;
  let next = target;
  if (current.zoom > target.zoom && zoom >= current.zoom - BUS_HOLD) next = current;
  if (state.set === undefined) state.set = next.set;
  else if (next.set !== state.set) {
    state.fade = motion ? { from: state.set, to: next.set, start: now } : null;
    state.set = next.set;
  }
  const out = Object.fromEntries(drawings.map((d) => [d.set, { lines: 0, labels: 0 }]));
  out[state.set] = { lines: 1, labels: 1 };
  let busy = false;
  if (state.fade) {
    const p = now - state.fade.start;
    if (p < BUS_LINE_MS) {
      busy = true;
      const t = p / BUS_LINE_MS;
      out[state.fade.from] = { lines: Math.min(1, 2 - 2 * t), labels: p < FADE_OUT_MS ? 1 - p / FADE_OUT_MS : 0 };
      out[state.fade.to] = { lines: Math.min(1, 2 * t), labels: p < FADE_OUT_MS ? 0 : Math.min(1, (p - FADE_OUT_MS) / FADE_IN_MS) };
    } else state.fade = null;
  }
  return { sets: out, busy, set: state.set };
}

export const busDrawingAt = (zoom, state, now, options) => drawingAt(BUS_DRAWINGS, zoom, state, now, options);
// The rail drawing hands over at the same zoom as the bus drawing there, but at once, with no
// fade: its two drawings lie a few pixels apart, so crossing them over showed every line doubled
// and striped, with ghost line letters beside it, for a quarter of a second at each handover
// (real iPhone run 2026-11-25).
export const railDrawingAt = (zoom, state, now, options) => drawingAt(RAIL_DRAWINGS, zoom, state, now, { ...options, motion: false });

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
