import { nearest, offset } from '../../scripts/lib/sheets.mjs';
import { measureGap } from './rules.mjs';

// The rail drawing the page shows at this zoom, with its own station bars (model.js, RAIL_DRAWINGS).
// A bundle from before there were two drawings has no `ref` and is taken whole.
export function shownAt(bundle, zoom, model) {
  const { railRefAt, REFERENCE_ZOOM } = model;
  const ref = railRefAt(zoom);
  const hasRefs = bundle.rails.features.some((f) => f.properties.ref);
  const mine = (f) => !hasRefs || (f.properties.ref ?? REFERENCE_ZOOM) === ref;
  return { ...bundle, rails: { ...bundle.rails, features: bundle.rails.features.filter(mine) },
    attached: bundle.attached && { ...bundle.attached, features: bundle.attached.features.filter(mine) } };
}

export function renderedRailPaths(bundle, zoom, { pixels, pitchAt }) {
  const paths = {};
  for (const f of bundle.rails.features) {
    const route = f.properties.route;
    (paths[route] ??= []).push(offset(f.geometry.coordinates.map((c) => pixels(c, zoom)), f.properties.slot * pitchAt(bundle.sizes, zoom)));
  }
  return paths;
}

export function checkBundleSpacing(bundle, pin, zoom, model) {
  const { pixels, pitchAt, sizeAt } = model;
  const factor = 2 ** (zoom - pin.zoom);
  const origin = pixels(pin.origin, zoom);
  const bounds = pin.bounds.map((v, i) => v * factor + origin[i % 2]);
  const paths = renderedRailPaths(shownAt(bundle, zoom, model), zoom, model);
  const pitch = pitchAt(bundle.sizes, zoom), width = sizeAt(bundle.sizes.rail, zoom);
  return pin.pairs.map((pair) => {
    const [a, b] = pair.map((id) => paths[id] ?? []);
    const { min, max, gap, at, samples } = measureGap(a, b, width, bounds);
    return { pair, min, max, gap, at, samples, pitch, ok: samples >= 3 && min >= pitch - 0.25 && max <= pitch + 0.25 };
  });
}

export function terminalGaps(all, zoom, model) {
  const { pixels, pitchAt, attachedCollection } = model;
  const bundle = shownAt(all, zoom, model);
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
