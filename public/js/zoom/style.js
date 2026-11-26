import { sheetStyle, PALETTES } from '../sheets/style.js';
import { pitchAt, sizeAt, RAIL_DRAWINGS, BUS_DRAWINGS } from './model.js';

// The bus drawings this trial adds between the sheets, and each one's picked-route lines.
export const busUrl = (zoom, routes = false) => new URL(`../../data/zoom-prototype/bus-${zoom}${routes ? '-routes' : ''}.geojson`, import.meta.url).href;
export const BUS_13_URL = busUrl(13);
const SHEET_ZOOM = { 2: 12, 3: 14, 4: 16 };
// A bus drawing between two sheets is drawn with the closer sheet's layers.
const BETWEEN = Object.fromEntries(BUS_DRAWINGS.filter((d) => !SHEET_ZOOM[d.set]).map((d) => [d.set, String(Object.keys(SHEET_ZOOM).find((n) => SHEET_ZOOM[n] > d.zoom))]));
// A layer's covering range: from a little below its drawing's zoom (zooming out holds it) to
// past the next drawing's, so it lasts through a handover's fade.
const RANGES = Object.fromEntries(BUS_DRAWINGS.map((d, i) => [d.set, [d.zoom - 1, BUS_DRAWINGS[i + 1] ? BUS_DRAWINGS[i + 1].zoom + 1 : 24]]));

const zoomValue = (values) => ['interpolate', ['linear'], ['zoom'], ...values.flatMap(([z, v]) => [z, v])];
const kind = (value) => ['==', ['get', 'kind'], value];
const round = { 'line-cap': 'round', 'line-join': 'round' };
const empty = { type: 'FeatureCollection', features: [] };

// Every font the style names, read from its layers' text-font (a font is a string with a space,
// as 'Overpass SemiBold'; expression operators have none).
function fontsOf(layers) {
  const fonts = new Set();
  const walk = (v) => {
    if (!Array.isArray(v)) return;
    if (v.length && v.every((x) => typeof x === 'string' && x.includes(' '))) v.forEach((x) => fonts.add(x));
    else v.forEach(walk);
  };
  for (const l of layers) walk(l.layout?.['text-font']);
  return [...fonts];
}

// `warmAt` is the opening centre: an unseen label there in each font, and in both character
// ranges the names use, makes MapLibre fetch every font before the map is shown, rather than
// partway through the first pinch (real iPhone run 2026-11-25).
export function previewStyle(theme, metadata, bundle, warmAt = metadata.hub) {
  const original = sheetStyle(theme, metadata.stations, metadata.colors, new Set([2, 3, 4]), metadata.district, true);
  const c = PALETTES[theme];
  const size = (key, transform = (v) => v) => ['interpolate', ['linear'], ['zoom'], ...bundle.sizes[key].flatMap(([z, v]) => [z, transform(v)])];
  const curve = (value) => ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z]) => [z, value(z)])];
  const at = (key, z) => sizeAt(bundle.sizes[key], z);
  const byId = new Map(original.layers.map((l) => [l.id, structuredClone(l)]));
  const removed = /^(rail(?:-|$)|station(?:-|$)|name-|letter(?:-|$)|pointer-|keep-off-\d)/;
  original.layers = original.layers.filter((l) => !removed.test(l.id) && (!/-\d$/.test(l.id) || /-[234]$/.test(l.id)));
  // Smooth the sizes of the bus-detail drawings through the sheets' sizes, without interpolating
  // their geometry.
  for (const layer of original.layers) {
    const base = layer.id.replace(/-[234]$/, '');
    const versions = Object.keys(SHEET_ZOOM).map((n) => [SHEET_ZOOM[n], byId.get(`${base}-${n}`)]).filter(([, l]) => l);
    if (versions.length < 2) continue;
    for (const [section, keys] of [['paint', ['line-width']], ['layout', ['text-size']]]) {
      for (const key of keys) {
        const values = versions.filter(([, l]) => l[section]?.[key] !== undefined).map(([z, l]) => [z, l[section][key]]);
        if (values.length >= 2 && layer[section]?.[key] !== undefined) layer[section][key] = zoomValue(values);
      }
    }
  }
  // Bus drawings at 12, 14 and 16 (sheets 2, 3 and 4) and at 13 and 15 (drawn for this trial).
  // Each serves from its own zoom up to the next (model.js, busDrawingAt). MapLibre lays line
  // labels out at the whole zoom below the camera, so a closer drawing's labels, cut to fit at
  // its own zoom, cannot serve the zoom below it: they drop out. The page shows one set at a time
  // and fades between them through global state, so the zoom ranges here only need to cover a
  // handover.
  const busSet = (l) => l.source?.match(/^(?:sheet|routes)-([234])$/)?.[1] ?? null;
  const trialSource = (set, l) => `trial-bus-${set}${l.source.startsWith('routes-') ? '-routes' : ''}`;
  original.layers = original.layers.flatMap((l) => {
    const copies = Object.entries(BETWEEN).filter(([, sheet]) => busSet(l) === sheet)
      .map(([set]) => ({ ...structuredClone(l), id: l.id.replace(/-\d$/, `-${set}`), source: trialSource(set, l) }));
    return [...copies, l];
  });
  const busState = {};
  for (const l of original.layers) {
    const set = l.source?.match(/^trial-bus-(\d+)/)?.[1] ?? busSet(l);
    if (!set) continue;
    // Every bus layer stays visible: showing or hiding a layer makes MapLibre parse its whole
    // source again, so at each whole zoom the new streets arrived late and the old faded out
    // first, leaving the grid dim (real iPhone run 2026-11-25). Lines are faded by opacity
    // alone, and their range starts a zoom early so their tiles are ready before the handover.
    // Labels can't wait unseen (they would still take room from the labels on show), so each
    // drawing's labels hold exactly its own zooms and change over at the whole zoom.
    l.layout = { ...l.layout, visibility: 'visible' };
    if (l.type === 'symbol') {
      const i = BUS_DRAWINGS.findIndex((d) => d.set === set);
      [l.minzoom, l.maxzoom] = [i === 0 ? 0 : BUS_DRAWINGS[i].zoom, BUS_DRAWINGS[i + 1]?.zoom ?? 24];
      continue;
    }
    [l.minzoom, l.maxzoom] = RANGES[set];
    const key = `busLines${set}`;
    busState[key] = { default: set === '2' ? 1 : 0 };
    // A plain opacity is set directly by the page, with no transition of its own. An opacity
    // that already varies by feature is multiplied by global state instead.
    const plain = [];
    const keys = { line: ['line-opacity'], circle: ['circle-opacity', 'circle-stroke-opacity'], fill: ['fill-opacity'], symbol: ['text-opacity', 'icon-opacity'] }[l.type] ?? [];
    for (const k of keys) {
      const value = l.paint?.[k];
      if (value === 0) continue;
      if (k === 'icon-opacity' && !l.layout['icon-image']) continue;
      if (k === 'text-opacity' && !l.layout['text-field']) continue;
      if (value === undefined || typeof value === 'number') {
        plain.push([k, value ?? 1]);
        // Opacity 0 is a constant MapLibre skips drawing, so a drawing waiting unseen costs nothing.
        l.paint = { ...l.paint, [k]: set === '2' ? value ?? 1 : 0, [`${k}-transition`]: { duration: 0, delay: 0 } };
      } else l.paint = { ...l.paint, [k]: ['*', value, ['global-state', key]] };
    }
    l.metadata = { ...l.metadata, busKey: key, busPlain: plain };
  }
  const rail = byId.get('rail-2');
  const width = size('rail');
  const gap = size('gap');
  // Each line is moved sideways from its track's one centre line by its slot times the pitch at this zoom.
  const offset = ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z]) => [z, ['*', ['get', 'slot'], pitchAt(bundle.sizes, z)]])];
  let rails = [
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
  // One copy of the rail for each rail drawing, faded through global state as the page hands
  // over between them (model.js, railDrawingAt).
  const railState = {};
  rails = RAIL_DRAWINGS.flatMap((d) => rails.map((l) => {
    const key = `rail${d.set}`;
    railState[key] = { default: d === RAIL_DRAWINGS[0] ? 1 : 0 };
    return { ...structuredClone(l), id: `${l.id}-${d.set}`, filter: ['==', ['get', 'ref'], d.ref],
      paint: { ...l.paint, 'line-opacity': ['*', l.paint['line-opacity'] ?? 1, ['global-state', key]] } };
  }));
  // Station bars cross over with their rail drawing (model.js, attachedFor).
  for (const l of attached) for (const k of ['line-opacity']) l.paint = { ...l.paint, [k]: ['*', l.paint[k] ?? 1, ['coalesce', ['get', 'fade'], 1]] };
  // A name and its chips fade together while the name changes side (model.js, labelsAt).
  // A name, its route chips and the line letters always show and keep their room, as a name and
  // the line letters do on the sheets (public/js/sheets/style.js, 'name' and 'letter'): placed
  // above the bus drawings, they are placed first, so the route numbers keep off them (RTD-006).
  // The sheets also keep the numbers off a name's chips and the platform bars, when they draw
  // them; here the trial places its own names, so the page keeps them off. A bar is a line, which
  // takes no room, so unseen marks along it take its room, as keep-off-bus does for bus lines.
  const fade = ['coalesce', ['get', 'fade'], 1];
  const labels = [{
    id: 'trial-station-room', type: 'symbol', source: 'trial-attached', filter: kind('station'),
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 4, 'text-field': 'o', 'text-font': ['Overpass SemiBold'], 'text-size': 7,
      'text-allow-overlap': true, 'text-padding': 1, 'text-rotation-alignment': 'viewport', 'text-keep-upright': false },
    paint: { 'text-opacity': 0 },
  }, {
    id: 'trial-name', type: 'symbol', source: 'trial-labels', filter: kind('name'),
    layout: { 'text-field': ['get', 'text'], 'text-font': ['Overpass SemiBold'], 'text-size': size('name'),
      'text-max-width': 40, 'text-line-height': 1.12, 'text-anchor': ['get', 'anchor'], 'text-offset': ['get', 'offset'],
      'text-justify': ['get', 'justify'], 'text-allow-overlap': true, 'text-padding': 3 },
    paint: { 'text-color': c.name, 'text-halo-color': c.ground, 'text-halo-width': 2, 'text-opacity': fade },
  }];
  for (const source of ['trial-attached', 'trial-labels']) {
    labels.push({ id: `${source}-disc`, type: 'circle', source, filter: kind('letter'),
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z], i) => [z, ['case', ['to-boolean', ['get', 'small']], bundle.sizes.nameLetter[i][1], bundle.sizes.letterDisc[i][1] - 1.5]])],
        'circle-color': rail.paint['line-color'], 'circle-stroke-color': c.ground, 'circle-stroke-width': 1.5,
        'circle-opacity': fade, 'circle-stroke-opacity': fade } });
    labels.push({ id: `${source}-letter`, type: 'symbol', source, filter: kind('letter'),
      layout: { 'text-field': ['get', 'route'], 'text-font': ['Overpass ExtraBold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], ...bundle.sizes.rail.flatMap(([z], i) => [z, ['case', ['to-boolean', ['get', 'small']], bundle.sizes.nameLetter[i][1] * 1.42, (bundle.sizes.letterDisc[i][1] - 1.5) * 1.42]])],
        'text-offset': [0, 0.06], 'text-allow-overlap': true },
      paint: { 'text-color': ['get', 'ink'], 'text-opacity': fade } });
  }
  // Both detail drawings' base strokes precede rail. A selected bus is drawn
  // over rail at either detail level, then stations and their lettering follow.
  const pickedLayers = original.layers.filter((l) => /^pick-bus/.test(l.id));
  original.layers = original.layers.filter((l) => !/^pick-bus/.test(l.id));
  original.layers.push(...rails, ...pickedLayers, ...attached, ...labels);
  const warm = fontsOf(original.layers).map((font, i) => ({ id: `trial-font-warm-${i}`, type: 'symbol', source: 'trial-font-warm',
    layout: { 'text-field': 'a\u2013', 'text-font': [font], 'text-size': 10, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-opacity': 0 } }));
  original.layers.push(...warm);
  const busSources = Object.fromEntries(Object.entries(BETWEEN).flatMap(([set, sheet]) => [
    [`trial-bus-${set}`, { ...original.sources[`sheet-${sheet}`], data: busUrl(set) }],
    [`trial-bus-${set}-routes`, { ...original.sources[`routes-${sheet}`], data: busUrl(set, true) }]]));
  return { ...original, state: { ...original.state, ...busState, ...railState },
    sources: { ...original.sources, ...busSources,
    'trial-rail': { type: 'geojson', data: bundle.rails, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-attached': { type: 'geojson', data: empty, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-labels': { type: 'geojson', data: empty, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-font-warm': { type: 'geojson', data: { type: 'FeatureCollection', features: warmAt ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: warmAt } }] : [] } },
  } };
}
