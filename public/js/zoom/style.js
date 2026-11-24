import { sheetStyle, PALETTES } from '../sheets/style.js';
import { pitchAt, sizeAt } from './model.js';

const zoomValue = (a, b) => ['interpolate', ['linear'], ['zoom'], 12, a, 14, b];
const kind = (value) => ['==', ['get', 'kind'], value];
const round = { 'line-cap': 'round', 'line-join': 'round' };
const empty = { type: 'FeatureCollection', features: [] };

export function previewStyle(theme, metadata, bundle) {
  const original = sheetStyle(theme, metadata.stations, metadata.colors, new Set([2, 3]), metadata.district);
  const c = PALETTES[theme];
  const size = (key, transform = (v) => v) => ['interpolate', ['linear'], ['zoom'], ...bundle.sizes[key].flatMap(([z, v]) => [z, transform(v)])];
  const curve = (value) => ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z]) => [z, value(z)])];
  const at = (key, z) => sizeAt(bundle.sizes[key], z);
  const byId = new Map(original.layers.map((l) => [l.id, structuredClone(l)]));
  const removed = /^(rail(?:-|$)|station(?:-|$)|name-|letter(?:-|$)|pointer-|keep-off-\d)/;
  original.layers = original.layers.filter((l) => !removed.test(l.id) && (!/-\d$/.test(l.id) || /-[23]$/.test(l.id)));
  // Smooth the sizes of the two bus-detail drawings without interpolating their geometry.
  for (const layer of original.layers) {
    const base = layer.id.replace(/-[23]$/, '');
    const a = byId.get(`${base}-2`), b = byId.get(`${base}-3`);
    if (!a || !b) continue;
    for (const [section, keys] of [['paint', ['line-width']], ['layout', ['text-size']]]) {
      for (const key of keys) if (a[section]?.[key] !== undefined && b[section]?.[key] !== undefined) {
        layer[section][key] = zoomValue(a[section][key], b[section][key]);
      }
    }
  }
  const rail = byId.get('rail-2');
  const width = size('rail');
  const gap = size('gap');
  // Each line is moved sideways from its track's one centre line by its slot times the pitch at this zoom.
  const offset = ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z]) => [z, ['*', ['get', 'slot'], pitchAt(bundle.sizes, z)]])];
  const rails = [
    { id: 'trial-rail-rim', type: 'line', source: 'trial-rail', layout: round,
      paint: { 'line-color': c.ground, 'line-width': curve((z) => at('rail', z) + 2 * at('gap', z)), 'line-offset': offset } },
    { id: 'trial-rail', type: 'line', source: 'trial-rail', layout: round,
      paint: { ...rail.paint, 'line-width': width, 'line-offset': offset } },
  ];
  const stationEdge = byId.get('station-edge-2'), station = byId.get('station-2');
  const mark = (z) => {
    const w = at('rail', z);
    const thin = ['case', ['get', 'single'], w + 1.4, ['get', 'hub'], w * 0.72 + 2.2, w * 0.72];
    return ['case', ['get', 'fat'], ['+', ['*', 1.6, thin], 1], thin];
  };
  const attached = [
    { id: 'trial-station-edge', type: 'line', source: 'trial-attached', filter: kind('station'), layout: round,
      paint: { ...stationEdge.paint, 'line-width': curve((z) => ['+', mark(z), 2.6]) } },
    { id: 'trial-station', type: 'line', source: 'trial-attached', filter: kind('station'), layout: round,
      paint: { ...station.paint, 'line-width': curve(mark) } },
    { id: 'trial-station-divider', type: 'line', source: 'trial-attached', filter: ['all', kind('station'), ['==', ['get', 'fat'], true]],
      paint: { 'line-color': c.markEdge, 'line-width': 1.2 } },
  ];
  // Keep the drawing's original pale-line casing, which is essential for the light theme.
  const casing = byId.get('rail-casing-2');
  if (casing) rails.splice(1, 0, { ...casing, id: 'trial-rail-casing', source: 'trial-rail', minzoom: 0, maxzoom: 24,
    layout: round, paint: { ...casing.paint, 'line-width': size('rail', (w) => w + 1.2), 'line-offset': offset } });
  const labels = [{
    id: 'trial-name', type: 'symbol', source: 'trial-labels', filter: kind('name'),
    layout: { 'text-field': ['get', 'text'], 'text-font': ['Overpass SemiBold'], 'text-size': size('name'),
      'text-max-width': 40, 'text-line-height': 1.12, 'text-anchor': ['get', 'anchor'], 'text-offset': ['get', 'offset'],
      'text-justify': ['get', 'justify'], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': c.name, 'text-halo-color': c.ground, 'text-halo-width': 2 },
  }];
  for (const source of ['trial-attached', 'trial-labels']) {
    labels.push({ id: `${source}-disc`, type: 'circle', source, filter: kind('letter'),
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z], i) => [z, ['case', ['to-boolean', ['get', 'small']], bundle.sizes.nameLetter[i][1], bundle.sizes.letterDisc[i][1] - 1.5]])],
        'circle-color': rail.paint['line-color'], 'circle-stroke-color': c.ground, 'circle-stroke-width': 1.5 } });
    labels.push({ id: `${source}-letter`, type: 'symbol', source, filter: kind('letter'),
      layout: { 'text-field': ['get', 'route'], 'text-font': ['Overpass ExtraBold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z], i) => [z, ['case', ['to-boolean', ['get', 'small']], bundle.sizes.nameLetter[i][1] * 1.42, (bundle.sizes.letterDisc[i][1] - 1.5) * 1.42]])],
        'text-offset': [0, 0.06], 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': ['get', 'ink'] } });
  }
  // Both detail drawings' base strokes precede rail. A selected bus is drawn
  // over rail at either detail level, then stations and their lettering follow.
  const pickedLayers = original.layers.filter((l) => /^pick-bus/.test(l.id));
  original.layers = original.layers.filter((l) => !/^pick-bus/.test(l.id));
  original.layers.push(...rails, ...pickedLayers, ...attached, ...labels);
  return { ...original, sources: { ...original.sources,
    'trial-rail': { type: 'geojson', data: bundle.rails, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-attached': { type: 'geojson', data: empty, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-labels': { type: 'geojson', data: empty, tolerance: 0, buffer: 256, maxzoom: 14 },
  } };
}
