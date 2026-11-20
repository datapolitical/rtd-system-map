import { pixels, pitchAt, sizeAt, attachedCollection } from '../../public/js/zoom/model.js';
import { nearest, offset, resample } from '../../scripts/lib/sheets.mjs';

export function renderedRailPaths(bundle, zoom) {
  const paths = {};
  for (const f of bundle.rails.features) {
    const route = f.properties.route;
    (paths[route] ??= []).push(offset(f.geometry.coordinates.map((c) => pixels(c, zoom)), f.properties.slot * pitchAt(bundle.sizes, zoom)));
  }
  return paths;
}

export function spacingReport({ paths, pairs, bounds, pitch, width, origin = [0, 0] }, tolerance = 0.25) {
  return pairs.map(([a, b]) => {
    const samples = [];
    for (const path of paths[a] ?? []) for (const p of resample(path, 2)) {
      if (p[0] < bounds[0] || p[0] > bounds[2] || p[1] < bounds[1] || p[1] > bounds[3]) continue;
      const d = Math.min(...(paths[b] ?? []).map((q) => nearest(q, p).d));
      samples.push({ distance: d, fromStation: Math.hypot(p[0] - origin[0], p[1] - origin[1]) });
    }
    samples.sort((a, b) => a.fromStation - b.fromStation);
    const values = samples.map((p) => p.distance);
    const min = Math.min(...values), max = Math.max(...values);
    const mean = (s) => s.reduce((total, v) => total + v.distance, 0) / s.length;
    const quarter = Math.max(1, Math.ceil(samples.length / 4));
    return { pair: [a, b], samples: samples.length, target: pitch, min, max, minimumVisibleGap: min - width,
      nearStation: mean(samples.slice(0, quarter)), fartherOut: mean(samples.slice(-quarter)),
      ok: samples.length >= 3 && Math.max(Math.abs(min - pitch), Math.abs(max - pitch)) <= tolerance };
  });
}

export function checkBundleSpacing(bundle, pin, zoom) {
  const factor = 2 ** (zoom - pin.zoom);
  const origin = pixels(pin.origin, zoom);
  return spacingReport({ paths: renderedRailPaths(bundle, zoom), pairs: pin.pairs, origin,
    bounds: pin.bounds.map((v, i) => v * factor + origin[i % 2]),
    pitch: pitchAt(bundle.sizes, zoom), width: sizeAt(bundle.sizes.rail, zoom) });
}

export function terminalGaps(bundle, zoom) {
  const groups = new Map();
  for (const feature of bundle.rails.features) {
    const key = feature.properties.key.split(':').slice(0, -1).join(':');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(feature);
  }
  const bars = attachedCollection(bundle.attached, bundle.sizes, zoom).features.filter((f) => f.properties.kind === 'station')
    .map((f) => ({ name: f.properties.name, routes: String(f.properties.lines).split(' '), path: f.geometry.coordinates.map((c) => pixels(c, zoom)) }));
  const results = [];
  for (const [key, parts] of groups) {
    parts.sort((a, b) => Number(a.properties.key.split(':').at(-1)) - Number(b.properties.key.split(':').at(-1)));
    for (const [f, end] of [[parts[0], 0], [parts.at(-1), 1]]) {
      const path = offset(f.geometry.coordinates.map((c) => pixels(c, zoom)), f.properties.slot * pitchAt(bundle.sizes, zoom));
      const point = end ? path.at(-1) : path[0];
      const candidates = bars.filter((bar) => bar.routes.includes(f.properties.route))
        .map((bar) => ({ name: bar.name, distance: nearest(bar.path, point).d })).sort((a, b) => a.distance - b.distance);
      results.push({ key, end, station: candidates[0]?.name, distance: candidates[0]?.distance ?? Infinity, ok: (candidates[0]?.distance ?? Infinity) <= 1 });
    }
  }
  return results;
}
