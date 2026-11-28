import { sheetStyle, PALETTES, TILING } from '../sheets/style.js';
import { pitchAt, sizeAt, RAIL_DRAWINGS, BUS_DRAWINGS, LISTS_PLACED } from './model.js';

// The bus drawings this trial adds between the sheets, and each one's picked-route lines.
export const busUrl = (zoom, routes = false) => new URL(`../../data/zoom-prototype/bus-${zoom}${routes ? '-routes' : ''}.geojson`, import.meta.url).href;
export const BUS_13_URL = busUrl(13);
const SHEET_ZOOM = { 2: 12, 3: 14, 4: 16 };
// A bus drawing between two sheets is drawn with the closer sheet's layers.
const BETWEEN = Object.fromEntries(BUS_DRAWINGS.filter((d) => !SHEET_ZOOM[d.set]).map((d) => [d.set, String(Object.keys(SHEET_ZOOM).find((n) => SHEET_ZOOM[n] > d.zoom))]));
// A layer's covering range: from a zoom below its drawing's, so it has loaded before it takes
// over, to a zoom past the next drawing's, so it lasts while that one loads.
const RANGES = Object.fromEntries(BUS_DRAWINGS.map((d, i) => [d.set, [d.zoom - 1, BUS_DRAWINGS[i + 1] ? BUS_DRAWINGS[i + 1].zoom + 1 : 24]]));

// The trial's ground still comes from OpenFreeMap's tile server, not the site's own tiles
// (basemap/). Those hold, at each zoom, only what the sheets draw there, and the trial holds each
// road band a zoom either side of its own (below): the site's zoom-12 tile has the primary roads
// and freeways of sheet 2 and none of the smaller streets the next band draws from it while its
// own tile loads, which OpenFreeMap's has. The page moves onto the site's tiles when they are cut
// for what it draws (#158).
const GROUND = { type: 'vector', url: 'https://tiles.openfreemap.org/planet' };

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
  // The sheets' style. The sheets themselves are tiles now, cut when the site is published; the
  // trial's drawings are still whole GeoJSON files, so their layers name no tile layer and read
  // each list as the list itself (no `lists` to look up).
  const original = sheetStyle(theme, metadata.stations, metadata.colors, { district: metadata.district, routeLines: true });
  for (const l of original.layers) if (/^(sheet|routes)-/.test(l.source ?? '')) delete l['source-layer'];
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
  // The ground's roads and buildings change at the sheets' band edges (13 and 15). A map tile only
  // holds the layers showing at its own zoom, and while a pinch outruns loading MapLibre draws the
  // tile from one zoom out, which had none of the next band's: the streets went blank (real iPhone
  // run 2026-11-25). So each banded ground layer is held a zoom either side of its band, unseen
  // there (an opacity of 0 at the camera's zoom is skipped, not drawn). Street and place names are
  // left to their bands: unseen, they would still take room from the names on show.
  for (const l of original.layers) {
    const [lo, hi] = [l.minzoom ?? 0, l.maxzoom ?? 24];
    const key = { line: 'line-opacity', fill: 'fill-opacity' }[l.type];
    const value = l.paint?.[key] ?? 1;
    if (l.source !== 'ground' || (lo <= 0 && hi >= 24) || !key || typeof value !== 'number') continue;
    l.paint = { ...l.paint, [key]: ['step', ['zoom'], ...(lo > 0 ? [0, lo, value] : [value]), ...(hi < 24 ? [hi, 0] : [])] };
    [l.minzoom, l.maxzoom] = [Math.max(0, lo - 1), Math.min(24, hi + 1)];
  }
  // Bus drawings at 12, 14 and 16 (sheets 2, 3 and 4) and at 13 and 15 (drawn for this trial).
  // Each serves from its own zoom up to the next (model.js, busDrawingAt). MapLibre lays line
  // labels out at the whole zoom below the camera, so a closer drawing's labels, cut to fit at
  // its own zoom, cannot serve the zoom below it: they drop out. The page shows one set's lines at
  // a time, changing at once when the next has loaded (model.js, drawingAt).
  const busSet = (l) => l.source?.match(/^(?:sheet|routes)-([234])$/)?.[1] ?? null;
  const trialSource = (set, l) => `trial-bus-${set}${l.source.startsWith('routes-') ? '-routes' : ''}`;
  original.layers = original.layers.flatMap((l) => {
    const copies = Object.entries(BETWEEN).filter(([, sheet]) => busSet(l) === sheet)
      .map(([set]) => ({ ...structuredClone(l), id: l.id.replace(/-\d$/, `-${set}`), source: trialSource(set, l) }));
    return [...copies, l];
  });
  // The route lists of the drawings whose lists the build places itself (model.js, LISTS_PLACED;
  // #156). The build has decided which lists there are and where; the page draws each one and
  // hides none. A list on a straight stretch is a point with its street's angle (`bus-list`), set
  // there whatever else MapLibre has placed; it takes no room itself, because a turned point takes
  // the upright box around it, and unseen marks along its `list-room` line take the room of its
  // lettering instead, so the names MapLibre still places (streets, neighbourhoods) keep off it.
  // A stacked list is drawn the same way and keeps its own room. A list on a bend keeps its stretch
  // and is set about the stretch's middle. MapLibre still refuses one that bends too sharply, so
  // it is allowed more than the build allows (scripts/zoom-prototype.mjs, LIST_FOLLOW) and the
  // build's rule is the one that decides.
  const LIST_BEND = 45, LIST_MARK = '.';
  // MapLibre fits a label to a line at the size it will have at zoom 18, so that it fits at its
  // largest (symbol_layout.ts, textMaxSize). Against a size that grows to zoom 16, a list on a bend
  // had to fit its stretch up to a quarter longer than it is ever drawn, and the mark of a
  // one-figure list did not fit its room at all. A drawing's lists are seen only as far as the
  // next drawing, so their size stops growing there.
  const sizeUntil = (size, top) => {
    if (top === undefined || size?.[0] !== 'interpolate' || size[1]?.[0] !== 'linear' || size[2]?.[0] !== 'zoom') return size;
    const stops = [];
    for (let i = 3; i < size.length; i += 2) stops.push([size[i], size[i + 1]]);
    if (stops.some(([, value]) => typeof value !== 'number') || stops.at(-1)[0] <= top) return size;
    return ['interpolate', ['linear'], ['zoom'], ...stops.filter(([zoom]) => zoom < top).flat(), top, sizeAt(stops, top)];
  };
  const setOf = (l) => l.source?.match(/^trial-bus-(\d+)/)?.[1] ?? busSet(l);
  const placedSets = new Set(BUS_DRAWINGS.filter((d) => LISTS_PLACED.includes(d.zoom)).map((d) => d.set));
  const ofKind = (filter, from, to) => JSON.parse(JSON.stringify(filter).replace(JSON.stringify(kind(from)), JSON.stringify(kind(to))));
  original.layers = original.layers.flatMap((l) => {
    const role = l.id.match(/^(bus|picked)-(number|stack)-\d+$/);
    if (!role || !placedSets.has(setOf(l))) return [l];
    l.layout = { ...l.layout, 'text-allow-overlap': true };
    if (role[2] === 'stack') return [l];
    l.layout['text-size'] = sizeUntil(l.layout['text-size'], BUS_DRAWINGS[BUS_DRAWINGS.findIndex((d) => d.set === setOf(l)) + 1]?.zoom);
    const { 'symbol-placement': _placement, 'symbol-spacing': _spacing, 'text-max-angle': _angle, 'text-padding': padding, ...layout } = l.layout;
    const list = { ...structuredClone(l), id: l.id.replace('-number-', '-list-'), filter: ofKind(l.filter, 'bus-label', 'bus-list'),
      layout: { ...structuredClone(layout), 'text-rotate': ['get', 'angle'], 'text-rotation-alignment': 'map', 'text-max-width': 100, 'text-ignore-placement': true } };
    l.layout = { ...l.layout, 'symbol-placement': 'line-center', 'text-max-angle': LIST_BEND };
    delete l.layout['symbol-spacing'];
    // One line of marks for every list, picked or not, since both are drawn. It goes in with the
    // picked route's lists, above everything MapLibre still places that gives way to a list (the
    // picked route's street names among them), so all of that is placed after the marks. The mark
    // is the narrowest glyph there is, so that even a list of one figure is long enough for one;
    // the room a mark takes is a circle as tall as the type, whatever the glyph.
    const room = role[1] !== 'picked' ? [] : [{ id: l.id.replace('picked-number-', 'list-room-'), type: 'symbol', source: l.source, filter: kind('list-room'),
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 4, 'text-field': LIST_MARK, 'text-font': structuredClone(l.layout['text-font']), 'text-size': structuredClone(l.layout['text-size']),
        'text-offset': structuredClone(l.layout['text-offset']), 'text-allow-overlap': true, 'text-padding': padding ?? 2, 'text-keep-upright': false },
      paint: { 'text-opacity': 0 } }];
    return [l, list, ...room];
  });
  // A neighbourhood's name gives way to a route list (Chris, 2026-11-26: the first list on a
  // stretch stays and the name moves). The names are still MapLibre's to place, so here a name
  // with a list in its way is left out; it moves when the build places names too. So where every
  // drawing a band of place names serves has its lists placed, the names are placed after them.
  for (const place of original.layers.filter((l) => /^place-\d$/.test(l.id))) {
    const serves = BUS_DRAWINGS.filter((d, i) => d.zoom < (place.maxzoom ?? 24) && (BUS_DRAWINGS[i + 1]?.zoom ?? 24) > (place.minzoom ?? 0));
    if (!serves.length || !serves.every((d) => placedSets.has(d.set))) continue;
    original.layers.splice(original.layers.indexOf(place), 1);
    // Just below the first list of the drawings this band of names serves, so the names are placed
    // after those lists and still before those drawings' street names.
    const sets = new Set(serves.map((d) => d.set));
    const first = original.layers.findIndex((l) => /^(bus-number|bus-list|bus-stack)-\d+$/.test(l.id) && sets.has(setOf(l)));
    original.layers.splice(first, 0, place);
  }
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
    // With no transition of its own, a change of global state here took the style's default
    // 300 ms one, so zooming out across 14 the two rail drawings still showed together, a few
    // pixels apart (real iPhone run 2026-11-26).
    return { ...structuredClone(l), id: `${l.id}-${d.set}`, filter: ['==', ['get', 'ref'], d.ref],
      paint: { ...l.paint, 'line-opacity': ['*', l.paint['line-opacity'] ?? 1, ['global-state', key]], 'line-opacity-transition': { duration: 0, delay: 0 } } };
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
  // The trial's bus drawings, each a whole GeoJSON file the phone cuts as it cut the sheets
  // before they were tiles (sheets/style.js, TILING): big tiles with a wide margin, so a label's
  // stretch of street is whole in the tile that places it. Those at 12, 14 and 16 take the place
  // of sheets 2, 3 and 4's own, drawn again so each keeps the lettering of the one a zoom out and
  // sets none the page has no room for (scripts/zoom-prototype.mjs); 13 and 15 sit between them,
  // cut as the closer sheet is.
  const drawing = (sheet, zoom, routes = false) => ({ type: 'geojson', data: busUrl(zoom, routes), ...TILING, maxzoom: SHEET_ZOOM[sheet] - 1 });
  const busSources = Object.fromEntries([
    ...Object.entries(SHEET_ZOOM).flatMap(([n, zoom]) => [[`sheet-${n}`, drawing(n, zoom)], [`routes-${n}`, drawing(n, zoom, true)]]),
    ...Object.entries(BETWEEN).flatMap(([set, sheet]) => [[`trial-bus-${set}`, drawing(sheet, set)], [`trial-bus-${set}-routes`, drawing(sheet, set, true)]]),
  ]);
  return { ...original, state: { ...original.state, ...busState, ...railState },
    sources: { ground: GROUND, ...busSources,
    'trial-rail': { type: 'geojson', data: bundle.rails, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-attached': { type: 'geojson', data: empty, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-labels': { type: 'geojson', data: empty, tolerance: 0, buffer: 256, maxzoom: 14 },
    'trial-font-warm': { type: 'geojson', data: { type: 'FeatureCollection', features: warmAt ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: warmAt } }] : [] } },
  } };
}
