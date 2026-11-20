// Pure geometry shared by the #154 preview, its build and its checks.
export const MIN_ZOOM = 12;
export const MAX_ZOOM = 14;
export const REFERENCE_ZOOM = 13;

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
