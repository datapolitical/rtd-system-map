// RTD's network on our own quiet basemap: trains in color, buses in ink, drawn
// by how often each route runs (DESIGN.md, "Map design"). Everything shown
// comes from public/data, built from RTD's own map and GTFS by
// scripts/build-data.mjs.

import * as maplibregl from '../vendor/maplibre-gl.mjs';
import { BASEMAP_SOURCES, FONT, GLYPHS, PALETTE, TERRAIN, basemapBelow, basemapLabels } from './basemap.js';
import { shade, textOn } from './color.js';

// Start the map's worker downloading while the network summary loads.
maplibregl.prewarm();

const INK = '#17222e';
const LAND = PALETTE.land;

// Bus frequency tiers, strongest first (DESIGN.md, "Bus routes"). One ink,
// lighter and thinner by tier. Widths are at zoom 9, 11, 13 and 16; each tier
// fades in from `from`, so the region view shows the frequent network first.
const TIERS = [
  { id: 'frequent', label: 'Every 15 min or better', color: '#1d3044', width: [1.2, 1.9, 3, 5.2], from: 0 },
  { id: 'every30', label: 'Every 16 to 30 min', color: '#58697b', width: [0.6, 0.95, 1.6, 3], from: 9 },
  { id: 'hourly', label: 'Every 31 to 60 min', color: '#697683', width: [0.5, 0.7, 1.1, 2.2], from: 10.5 },
  { id: 'infrequent', label: 'Less than hourly', color: '#818c97', width: [0.5, 0.6, 1, 2], from: 10.5 },
  { id: 'peak', label: 'Rush hours only', color: '#818c97', width: [0.5, 0.6, 1, 2], from: 11, dashed: true },
  { id: 'limited', label: 'A few trips a day', color: '#818c97', width: [0.6, 0.8, 1.3, 2.4], from: 11, dotted: true },
];
const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t.id, TIERS.length - i]));
// Rail is heavier than any bus at every zoom. On shared track, lines run side
// by side with a white gap between them (DESIGN.md, "Shared track"). Width
// steps at the bus headway boundaries: 15 minutes or better is full width,
// 16-30 and 31-60 are a step thinner, over 60 thinner still (DESIGN.md,
// "Rail frequency"). Widths are at zoom 9, 11, 13 and 16.
const RAIL_WIDTH = [3, 4, 5.6, 9];
const RAIL_BANDS = [
  { max: 15, width: RAIL_WIDTH },
  { max: 30, width: [2.2, 3, 4.3, 6.8] },
  { max: 60, width: [1.6, 2.3, 3.5, 6] },
  { max: Infinity, width: [1.4, 2, 3.1, 5.4] },
];
const RAIL_GAP = 2;
// Routes that don't run all day, drawn broken and beneath the rest.
const PART_TIME = ['peak', 'limited', 'none', 'unknown'];

// Bus stops are the largest file, so they load only near the zoom that shows them.
const STOPS_ZOOM = 15;
const STOPS_PRELOAD_ZOOM = 14;

const ZOOMS = [9, 11, 13, 16];
const byZoom = (values) => ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => [z, values[i]])];
const tierMatch = (pick) => ['match', ['get', 'tier'], ...TIERS.flatMap((t) => [t.id, pick(t)]), pick(TIERS.at(-1))];
const tierWidth = (extra = 0) =>
  ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => [z, tierMatch((t) => t.width[i] + extra)])];
const fadeIn = ['interpolate', ['linear'], ['zoom'], ...[8, 9, 10, 11, 12, 13].flatMap((z) => [z, tierMatch((t) => Math.min(1, Math.max(0, (z - t.from) / 1.5 + 0.25)))])];
// Width from the line's weekday headway, at the bus tier boundaries: <=15
// minutes full width, 16-30 and 31-60 a step down, over 60 thinner still. A
// line with no weekday headway (weekend-only, or not running) is thinnest.
const railWidth = (extra = 0) =>
  ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => [
    z,
    ['step', ['coalesce', ['get', 'wk'], 1000], RAIL_BANDS[0].width[i] + extra, ...RAIL_BANDS.slice(1).flatMap((band, k) => [RAIL_BANDS[k].max + 1, band.width[i] + extra])],
  ])];
// Each piece of rail is `slot` line widths to the side of its track's center.
const railOffset = byZoom(RAIL_WIDTH.map((w) => ['*', ['get', 'slot'], w + RAIL_GAP]));
// Stations are drawn at the widest zoom's line spacing and scaled down with
// the lines, so a station's mark always spans the lines beside each other.
const STATION_SPACING = RAIL_WIDTH.at(-1) + RAIL_GAP;
const stationSize = byZoom(RAIL_WIDTH.map((w) => (w + RAIL_GAP) / STATION_SPACING));

const status = document.getElementById('status');
const showStatus = (text) => {
  status.textContent = text;
  status.hidden = !text;
};

async function main() {
  let meta;
  try {
    const res = await fetch('data/meta.json');
    if (!res.ok) throw new Error(`meta.json: ${res.status}`);
    meta = await res.json();
  } catch (err) {
    showStatus('The map data is missing. Run "npm run build", then reload.');
    throw err;
  }

  const lines = railStyle(meta.rail);
  const legend = buildLegend(meta, lines);

  // Phones open on the rail network, where the district is densest; wider
  // screens have room for all of it, beside the open legend.
  const narrow = matchMedia('(max-width: 767px)').matches;
  const legendWidth = legend.open ? legend.getBoundingClientRect().right : 0;
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      glyphs: GLYPHS,
      sources: { ...BASEMAP_SOURCES, ...dataSources() },
      layers: citiesFirst([...basemapBelow(), ...transitLines(lines), ...basemapLabels(), ...transitMarks(lines)]),
    },
    bounds: narrow ? meta.bounds.stations : (meta.bounds.network ?? meta.bounds.routes),
    fitBoundsOptions: {
      padding: narrow ? { top: 64, right: 16, bottom: 24, left: 16 } : { top: 24, right: 24, bottom: 24, left: legendWidth + 24 },
    },
    hash: true,
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  // Zoom buttons only where there's no pinch.
  if (!matchMedia('(pointer: coarse)').matches) {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  }
  map.addControl(
    new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }),
    'bottom-right',
  );
  // Credits stay one tap away rather than covering the map on phones.
  map.once('load', () => {
    const credits = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
    credits?.classList.remove('maplibregl-compact-show');
    credits?.removeAttribute('open');
  });

  // Symbols are drawn the first time the map needs them, in our own font.
  map.setMissingStyleImageResolver(async (id) => {
    await Promise.all(['700 12px Overpass', '800 12px Overpass'].map((f) => document.fonts.load(f))).catch(() => {});
    addSymbol(map, id, lines);
  });

  // A listener here silences MapLibre's own logging, so log what we don't handle.
  map.on('error', (e) => {
    if (e.sourceId && DATA_SOURCES.includes(e.sourceId)) {
      showStatus("Part of the map data didn't load. Reload the page to try again.");
    }
    console.error(e.error ?? e);
  });
  map.on('sourcedata', function done(e) {
    if (e.sourceId !== 'routes' || !map.isSourceLoaded('routes')) return;
    map.off('sourcedata', done);
    showStatus('');
    // Relief last, so its tiles never hold up the network.
    map.addSource('terrain', TERRAIN.source);
    for (const layer of TERRAIN.layers) map.addLayer(layer, TERRAIN.before);
  });

  loadStopsWhenNeeded(map);
  wireInteractions(map, meta, lines);
}

// City names claim their space before route tags and the hub's sign, so the
// region view always says where it is; line-end signs still come first.
function citiesFirst(layers) {
  const [city] = layers.splice(layers.findIndex((l) => l.id === 'city-label'), 1);
  layers.splice(layers.findIndex((l) => l.id === 'line-signs'), 0, city);
  return layers;
}

const DATA_SOURCES = ['boundary', 'flexride', 'routes', 'stations', 'facilities', 'labels', 'stops'];
const EMPTY = { type: 'FeatureCollection', features: [] };

// By URL, so each file downloads and parses in the map's worker.
function dataSources() {
  return Object.fromEntries(
    DATA_SOURCES.map((name) => [name, { type: 'geojson', data: name === 'stops' ? EMPTY : `data/${name}.geojson` }]),
  );
}

// Each rail line keeps RTD's own color; a thin outline in a darker shade of
// the same hue keeps light colors (A, C, G, R) visible on the light map
// (DESIGN.md, "Rail line colors"). Bullet letters are white or ink, whichever
// reads better.
function railStyle(rail) {
  const byRoute = new Map(
    rail.map((r) => [
      r.route,
      { ...r, edge: shade(r.color, 0.72, LAND, 3), letter: textOn(r.color, INK) },
    ]),
  );
  const match = (key, fallback) =>
    byRoute.size ? ['match', ['get', 'route'], ...[...byRoute].flatMap(([route, s]) => [route, s[key]]), fallback] : fallback;
  return { byRoute, color: match('color', ['coalesce', ['get', 'color'], INK]), edge: match('edge', INK), letter: match('letter', '#ffffff') };
}

const bus = ['==', ['get', 'mode'], 'bus'];
const rail = ['==', ['get', 'mode'], 'rail'];
const partTime = ['in', ['get', 'tier'], ['literal', PART_TIME]];
const served = ['==', ['get', 'served'], true];

// Lines and areas, beneath the basemap's place names.
function transitLines(lines) {
  return [
    // RTD's boundary layer is a mask over everything outside the district: a
    // gray wash, with a soft edge rather than a hard one.
    { id: 'district-wash', type: 'fill', source: 'boundary', paint: { 'fill-color': PALETTE.wash, 'fill-opacity': 0.72 } },
    {
      id: 'district-edge',
      type: 'line',
      source: 'boundary',
      paint: {
        'line-color': PALETTE.wash,
        'line-opacity': 0.6,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 60],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 60],
      },
    },
    // FlexRide: a light hatch with a dashed edge, never a green that reads as park.
    {
      id: 'flexride-fill',
      type: 'fill',
      source: 'flexride',
      // Barely there from far out, where zones would read as restricted areas.
      paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 11, 0.45, 12.5, 0.85] },
    },
    {
      id: 'flexride-line',
      type: 'line',
      source: 'flexride',
      paint: {
        'line-color': '#7e8b98',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.25, 11, 0.9],
        'line-dasharray': [3, 2],
      },
    },

    {
      id: 'bus-part-time',
      type: 'line',
      source: 'routes',
      filter: ['all', bus, partTime, ['!=', ['get', 'tier'], 'limited']],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': tierMatch((t) => t.color), 'line-width': tierWidth(), 'line-opacity': fadeIn, 'line-dasharray': [3, 2] },
    },
    {
      id: 'bus-limited',
      type: 'line',
      source: 'routes',
      filter: ['all', bus, ['==', ['get', 'tier'], 'limited']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': tierMatch((t) => t.color), 'line-width': tierWidth(), 'line-opacity': fadeIn, 'line-dasharray': [0.1, 2.2] },
    },
    {
      id: 'bus',
      type: 'line',
      source: 'routes',
      filter: ['all', bus, ['!', partTime]],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': tierMatch((t) => TIER_RANK[t.id]),
      },
      paint: { 'line-color': tierMatch((t) => t.color), 'line-width': tierWidth(), 'line-opacity': fadeIn },
    },

    // Rail floats over the buses on a white casing. Part-time rail goes
    // beneath full-service rail, so on shared track the line that runs wins.
    {
      id: 'rail-casing',
      type: 'line',
      source: 'routes',
      filter: rail,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': railWidth(RAIL_GAP + 1), 'line-offset': railOffset },
    },
    {
      id: 'rail-part-time',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, partTime],
      paint: { 'line-color': lines.color, 'line-width': railWidth(-0.5), 'line-dasharray': [1.5, 1.2], 'line-offset': railOffset },
    },
    {
      id: 'rail-edge',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, ['!', partTime]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lines.edge, 'line-width': railWidth(1), 'line-offset': railOffset },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, ['!', partTime]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lines.color, 'line-width': railWidth(), 'line-offset': railOffset },
    },
  ];
}

// Stations, stops, symbols and our labels, above everything else.
function transitMarks(lines) {
  const halo = { 'text-halo-color': LAND, 'text-halo-width': 1.8, 'text-halo-blur': 0.4 };
  const knockout = { 'text-halo-color': LAND, 'text-halo-width': 2.4, 'text-halo-blur': 0 };
  return [
    {
      id: 'stops',
      type: 'circle',
      source: 'stops',
      minzoom: STOPS_ZOOM,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.4, 18, 5],
        'circle-color': '#ffffff',
        'circle-stroke-color': '#6f7c89',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 15, 1, 18, 1.6],
      },
    },
    // Stations with no trains this week: a hollow gray ring, from closer in.
    {
      id: 'stations-unserved',
      type: 'circle',
      source: 'stations',
      minzoom: 12.5,
      filter: ['!', served],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 3.2, 16, 6.5],
        'circle-color': 'rgba(255, 255, 255, 0.7)',
        'circle-stroke-color': '#9aa5b0',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12.5, 1.2, 16, 2],
      },
    },
    // A white capsule across the track, as wide as the lines through it.
    {
      id: 'stations',
      type: 'symbol',
      source: 'stations',
      filter: served,
      layout: {
        'icon-image': ['concat', 'station-', ['get', 'span']],
        'icon-size': stationSize,
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      id: 'facilities',
      type: 'symbol',
      source: 'facilities',
      minzoom: 12.5,
      filter: ['any', ['>', ['coalesce', ['get', 'spaces'], 0], 0], ['==', ['get', 'class'], 'TS']],
      layout: {
        'icon-image': ['case', ['>', ['coalesce', ['get', 'spaces'], 0], 0], 'parking', 'transit-center'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.75, 16, 1],
        // Up and to the left of the spot, so a sign never covers a station.
        'icon-anchor': 'bottom-right',
        'icon-offset': [-3, -3],
        'icon-allow-overlap': true,
        'icon-padding': 0,
      },
    },
    // Rail letters ride along their lines.
    {
      id: 'rail-bullets',
      type: 'symbol',
      source: 'routes',
      minzoom: 10.5,
      filter: ['all', rail, ['!', partTime]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 360,
        'icon-image': ['concat', 'bullet-', ['get', 'route']],
        'icon-rotation-alignment': 'viewport',
        'text-rotation-alignment': 'viewport',
        'text-field': ['get', 'route'],
        'text-font': FONT.heavy,
        'text-size': 11,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10.5, 0.85, 14, 1],
        'symbol-sort-key': 0,
      },
      paint: { 'text-color': lines.letter },
    },
    // Bus route numbers sit in their lines, knocked out of the line like a
    // gap in it, until close in: a box on every line would read as a highway
    // shield and cover the streets. From far out, one number per frequent
    // route, where it runs alone, so it can only mean one line
    // (scripts/lib/labels.mjs).
    {
      id: 'bus-tags-region',
      type: 'symbol',
      source: 'labels',
      maxzoom: 11.5,
      filter: ['==', ['get', 'kind'], 'bus'],
      layout: {
        'text-field': ['get', 'route'],
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9.5, 11, 10.5],
        'text-padding': 1,
      },
      paint: { 'text-color': tierMatch((t) => tagInk(t)), ...knockout },
    },
    // Closer in, numbers ride along the buses: every route that comes at least
    // every 30 minutes, then all of them.
    {
      id: 'bus-numbers',
      type: 'symbol',
      source: 'routes',
      minzoom: 11.5,
      maxzoom: BUS_TAGS_FROM,
      filter: ['all', bus, ['any', ['>=', ['zoom'], 13], ['in', ['get', 'tier'], ['literal', ['frequent', 'every30']]]]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 280,
        'text-rotation-alignment': 'viewport',
        'text-field': ['get', 'route'],
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 10.5, 14, 11.5],
        'symbol-sort-key': tierMatch((t) => 10 - TIER_RANK[t.id]),
      },
      paint: { 'text-color': tierMatch((t) => tagInk(t)), ...knockout },
    },
    // Close in, where lines are wide and streets are named, numbers get
    // tags outlined in their line's ink.
    {
      id: 'bus-tags',
      type: 'symbol',
      source: 'routes',
      minzoom: BUS_TAGS_FROM,
      filter: bus,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 280,
        'icon-image': tierMatch((t) => `tag-${t.id}`),
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [1.5, 3.5, 0.5, 3.5],
        'icon-rotation-alignment': 'viewport',
        'text-rotation-alignment': 'viewport',
        'text-field': ['get', 'route'],
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10.5, 16, 11],
        'symbol-sort-key': tierMatch((t) => 10 - TIER_RANK[t.id]),
      },
      paint: { 'text-color': tierMatch((t) => tagInk(t)) },
    },
    {
      id: 'station-labels-unserved',
      type: 'symbol',
      source: 'stations',
      minzoom: 14,
      filter: ['!', served],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT.regular,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11, 16, 13],
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.8,
        'text-max-width': 8,
        'text-optional': true,
      },
      paint: { 'text-color': '#66717e', ...halo },
    },
    {
      id: 'station-labels',
      type: 'symbol',
      source: 'stations',
      minzoom: 10.5,
      // Line ends are named by their signs until the signs give way.
      filter: ['all', served, ['any', ['>=', ['zoom'], SIGNS_UNTIL], ['!', ['get', 'end']]]],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 10.5, 13, 12, 16, 14.5],
        'text-variable-anchor': ['left', 'right', 'top', 'bottom', 'top-left', 'bottom-right'],
        'text-radial-offset': ['interpolate', ['linear'], ['zoom'], 10.5, 0.6, 16, 1],
        'text-justify': 'auto',
        'text-max-width': 8,
        // Interchanges claim their label space first.
        'symbol-sort-key': ['-', 0, ['length', ['get', 'lines']]],
      },
      paint: { 'text-color': INK, ...halo },
    },
    // Signs at the ends of rail lines, with each line's bullet and where it
    // goes, so the opening view says what every line is. The hub, where most
    // lines end, gives way to the city it's in; the other signs come first.
    sign('hub-signs', 'hub'),
    sign('line-signs', 'end'),
  ];
}

function sign(id, kind) {
  return {
    id,
    type: 'symbol',
    source: 'labels',
    maxzoom: SIGNS_UNTIL,
    filter: ['==', ['get', 'kind'], kind],
    layout: {
      'icon-image': ['concat', 'sign|', ['get', 'kind'], '|', ['get', 'lines'], '|', ['get', 'name']],
      'icon-anchor': ['get', 'anchor'],
      // Off the station, toward the side the build found clear.
      'icon-offset': ['match', ['get', 'anchor'], ...Object.entries(AWAY).flatMap(([a, [x, y]]) => [a, ['literal', [x * 3, y * 3]]]), ['literal', [0, 0]]],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.85, 10, 1],
      'icon-padding': 0,
    },
  };
}

// A tag's number, in its route's ink, darkened for the lightest routes.
const tagInk = (t) => (TIER_RANK[t.id] >= TIER_RANK.every30 ? t.color : '#4c5a69');

// Line-end signs show until about the zoom where every station is named.
const SIGNS_UNTIL = 13;
// Bus numbers get tags from this zoom; further out they're knocked out of
// their lines.
const BUS_TAGS_FROM = 14;
// Which way a symbol sits from its point, on screen, for each icon anchor.
const AWAY = {
  left: [1, 0],
  right: [-1, 0],
  top: [0, 1],
  bottom: [0, -1],
  'top-left': [1, 1],
  'top-right': [-1, 1],
  'bottom-left': [1, -1],
  'bottom-right': [-1, -1],
};

// --- Symbols, drawn on demand ----------------------------------------------

// Never below 2, so symbols stay sharp when a screen is zoomed.
const RATIO = Math.max(2, Math.ceil(devicePixelRatio || 1));

function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width * RATIO;
  c.height = height * RATIO;
  const ctx = c.getContext('2d');
  ctx.scale(RATIO, RATIO);
  return ctx;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function addSymbol(map, id, lines) {
  if (map.hasImage(id)) return;
  const add = (ctx, options = {}) =>
    map.addImage(id, ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height), { pixelRatio: RATIO, ...options });

  // Bus route tags: white, outlined in the route's ink, stretched to fit
  // the number (9-slice). Quieter than the trains' solid bullets.
  if (id.startsWith('tag-')) {
    const tier = TIERS.find((t) => `tag-${t.id}` === id) ?? TIERS.at(-1);
    const ctx = canvas(16, 16);
    roundRect(ctx, 0.75, 0.75, 14.5, 14.5, 3.5);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = tier.id === 'frequent' ? 1.3 : 1;
    ctx.stroke();
    const r = 5 * RATIO;
    const s = 16 * RATIO;
    return add(ctx, { stretchX: [[r, s - r]], stretchY: [[r, s - r]], content: [r, r, s - r, s - r] });
  }

  // Line-end signs: "sign|end|E R|RidgeGate Parkway". A white sign with the
  // lines' bullets and the end's name; the hub where many lines end is an
  // ink sign with its name alone.
  if (id.startsWith('sign|')) {
    const [, kind, routes, ...rest] = id.split('|');
    const name = rest.join('|');
    const hub = kind === 'hub';
    const margin = 4;
    const h = 22;
    const bullet = 16;
    const font = `${hub ? 800 : 700} 12px Overpass, system-ui, sans-serif`;
    const measure = canvas(1, 1);
    measure.font = font;
    const text = measure.measureText(name);
    const bullets = hub ? [] : routes.split(' ').filter(Boolean);
    const pad = bullets.length ? 3 : 8;
    const w = pad + bullets.length * (bullet + 2) + (bullets.length ? 4 : 0) + Math.ceil(text.width) + 8;
    const ctx = canvas(w + margin * 2, h + margin * 2);
    ctx.translate(margin, margin);
    ctx.shadowColor = 'rgba(23, 34, 46, 0.22)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    roundRect(ctx, 0, 0, w, h, h / 2);
    ctx.fillStyle = hub ? INK : '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    let x = pad;
    for (const route of bullets) {
      const line = lines.byRoute.get(route);
      ctx.beginPath();
      ctx.arc(x + bullet / 2, h / 2, bullet / 2, 0, Math.PI * 2);
      ctx.fillStyle = line?.color ?? INK;
      ctx.fill();
      ctx.font = '800 10.5px Overpass, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = line?.letter ?? '#ffffff';
      const cap = ctx.measureText(route).actualBoundingBoxAscent;
      ctx.fillText(route, x + bullet / 2, h / 2 + cap / 2);
      x += bullet + 2;
    }
    if (bullets.length) x += 4;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.fillStyle = hub ? '#ffffff' : INK;
    ctx.fillText(name, x, h / 2 + text.actualBoundingBoxAscent / 2 - 0.5);
    return add(ctx);
  }

  // Stations: "station-3" spans three lines side by side.
  if (id.startsWith('station-')) {
    const span = Number(id.slice('station-'.length)) || 1;
    const stroke = 2;
    const d = RAIL_WIDTH.at(-1) + 4;
    const length = (span - 1) * STATION_SPACING + d;
    const ctx = canvas(length + 2, d + 2);
    roundRect(ctx, 1 + stroke / 2, 1 + stroke / 2, length - stroke, d - stroke, (d - stroke) / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = INK;
    ctx.stroke();
    return add(ctx);
  }

  // Rail bullets: a circle in the line's color, outlined like the line.
  if (id.startsWith('bullet-')) {
    const line = lines.byRoute.get(id.slice('bullet-'.length));
    const ctx = canvas(20, 20);
    ctx.beginPath();
    ctx.arc(10, 10, 9, 0, Math.PI * 2);
    ctx.fillStyle = line?.color ?? INK;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    return add(ctx);
  }

  // Highway shields, in quiet gray: the interstate shield and the US badge,
  // sized for the number's length ("shield-us-interstate-2").
  const shield = id.match(/^shield-(us-interstate|us-highway)-(\d)$/);
  if (shield) {
    const digits = Number(shield[2]);
    const interstate = shield[1] === 'us-interstate';
    const w = interstate ? 12 + digits * 5 : 10 + digits * 5.5;
    const h = interstate ? 19 : 16;
    const ctx = canvas(w, h);
    ctx.beginPath();
    if (interstate) {
      ctx.moveTo(1, 2.5);
      ctx.quadraticCurveTo(w / 2, 0, w - 1, 2.5);
      ctx.bezierCurveTo(w + 0.5, 9, w - 3, 15, w / 2, h - 0.8);
      ctx.bezierCurveTo(3, 15, -0.5, 9, 1, 2.5);
    } else {
      ctx.roundRect(0.75, 0.75, w - 1.5, h - 1.5, 4);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#a9b3bd';
    ctx.stroke();
    return add(ctx);
  }

  if (id === 'hatch') {
    const ctx = canvas(6, 6);
    ctx.strokeStyle = 'rgba(94, 110, 126, 0.38)';
    ctx.lineWidth = 0.9;
    for (const offset of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.moveTo(offset, 6);
      ctx.lineTo(offset + 6, 0);
      ctx.stroke();
    }
    return add(ctx);
  }

  // Park-n-Ride: a small slate "P" sign.
  if (id === 'parking') {
    const ctx = canvas(17, 17);
    roundRect(ctx, 0.5, 0.5, 16, 16, 3.5);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    roundRect(ctx, 1.5, 1.5, 14, 14, 2.75);
    ctx.fillStyle = '#35597d';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 11.5px Overpass, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 8.5, 9.4);
    return add(ctx);
  }

  // Transit center: a rounded square with a bus, never a "T" (that's the T Line).
  if (id === 'transit-center') {
    const ctx = canvas(17, 17);
    roundRect(ctx, 0.5, 0.5, 16, 16, 3.5);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    roundRect(ctx, 1.5, 1.5, 14, 14, 2.75);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 4.5, 3.8, 8, 8.4, 1.6);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillRect(5.6, 5, 5.8, 3.2);
    ctx.beginPath();
    ctx.arc(6.4, 10.4, 0.8, 0, Math.PI * 2);
    ctx.arc(10.6, 10.4, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5.3, 12, 1.6, 1.3);
    ctx.fillRect(10.1, 12, 1.6, 1.3);
    return add(ctx);
  }
}

function loadStopsWhenNeeded(map) {
  const load = () => {
    if (map.getZoom() < STOPS_PRELOAD_ZOOM) return;
    map.off('zoomend', load);
    map.getSource('stops').setData('data/stops.geojson');
  };
  map.on('zoomend', load);
  map.once('load', load);
}

// --- Interaction ---------------------------------------------------------

const ROUTE_LAYERS = ['bus', 'bus-part-time', 'bus-limited', 'rail', 'rail-part-time'];
const PLACE_LAYERS = ['stations', 'stations-unserved', 'facilities', 'stops'];

function wireInteractions(map, meta, lines) {
  const narrow = matchMedia('(max-width: 767px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const legend = document.getElementById('legend');
  let popup;
  const near = (point, pad, layers) =>
    map.queryRenderedFeatures(
      [
        [point.x - pad, point.y - pad],
        [point.x + pad, point.y + pad],
      ],
      { layers },
    );

  map.on('click', (e) => {
    const pad = matchMedia('(pointer: coarse)').matches ? 16 : 8;
    const place = near(e.point, pad, PLACE_LAYERS)[0];
    const routes = uniqueRoutes(near(e.point, place ? 24 : pad, ROUTE_LAYERS));
    popup?.remove();
    if (narrow.matches) legend.open = false;
    if (!place && !routes.length) return;

    const at = place ? place.geometry.coordinates : e.lngLat;
    popup = new maplibregl.Popup({
      maxWidth: 'min(320px, calc(100vw - 24px))',
      focusAfterOpen: false,
      // Phones: open below the tapped spot, after moving it toward the top.
      anchor: narrow.matches ? 'top' : undefined,
    });
    popup.setLngLat(at).setHTML(popupHtml(place, routes, lines)).addTo(map);
    if (narrow.matches) {
      map.easeTo({
        center: at,
        offset: [0, -map.getContainer().clientHeight * 0.3],
        duration: reducedMotion.matches ? 0 : 300,
      });
    }
  });

  for (const id of [...ROUTE_LAYERS, ...PLACE_LAYERS]) {
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
  }
}

function uniqueRoutes(features) {
  const seen = new Map();
  for (const f of features) seen.set(f.properties.route, f.properties);
  return [...seen.values()].sort(
    (a, b) =>
      (b.mode === 'rail') - (a.mode === 'rail') ||
      (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0) ||
      a.route.localeCompare(b.route, 'en', { numeric: true }),
  );
}

function popupHtml(place, nearby, lines) {
  let head = `<h3>Routes here</h3>`;
  let routes = nearby;
  if (place) {
    const p = place.properties;
    const isStation = place.layer.id.startsWith('stations');
    let meta = '';
    if (isStation) {
      // A station leads with its own trains, from GTFS, then nearby buses.
      const own = String(p.lines ?? '').split(' ').filter(Boolean);
      routes = [...own.map((l) => lines.byRoute.get(l)).filter(Boolean), ...nearby.filter((r) => r.mode !== 'rail')];
      meta = p.served ? 'Rail station' : p.returns ? `Trains return ${date(p.returns)}` : 'No train service right now';
    } else {
      const parking = p.spaces > 0 ? `${p.spaces.toLocaleString()} parking spaces` : '';
      const stop = place.layer.id === 'stops' ? `Stop ${p.id}${p.routes ? `, routes ${p.routes}` : ''}` : '';
      meta = [parking, stop].filter(Boolean).join('. ');
    }
    head = `<h3>${esc(p.name)}</h3>${meta ? `<p class="meta${isStation && !p.served ? ' unserved' : ''}">${esc(meta)}</p>` : ''}`;
  }
  const items = routes
    .map(
      (r) =>
        `<li>${bullet(r, lines)}<span class="name">${esc(r.name)}</span><span class="freq">${esc(frequencyText(r))}</span></li>`,
    )
    .join('');
  return `<div class="popup">${head}${items ? `<ul>${items}</ul>` : ''}</div>`;
}

// Weekday frequency is a midday figure (DESIGN.md), so say so, and give the
// first and last trip so it isn't read as all-day service.
function frequencyText(r) {
  const span = r.wk_first ? `, ${time(r.wk_first)} to ${time(r.wk_last)}` : '';
  if (r.tier === 'peak') return `Rush hours only on weekdays${span}.`;
  if (r.tier === 'limited') return `A few trips on weekdays${span}.`;
  if (r.tier === 'none' || r.tier === 'unknown') return 'No regular weekday service.';
  const weekday = r.wk ? `Every ${r.wk} min midday on weekdays${span}` : `A few midday trips on weekdays${span}`;
  const day = (h, trips) => (!trips ? 'no service' : h ? `every ${h} min` : 'a few trips');
  return `${weekday}. Saturday ${day(r.sa, r.sa_trips)}, Sunday ${day(r.su, r.su_trips)}.`;
}

function bullet(r, lines) {
  if (r.mode === 'rail') {
    const line = lines.byRoute.get(r.route);
    const color = line?.color ?? r.color;
    return `<span class="bullet rail" style="background:${color};color:${line?.letter ?? '#fff'}">${esc(r.route)}</span>`;
  }
  const tier = TIERS.find((t) => t.id === r.tier) ?? TIERS.at(-1);
  return `<span class="bullet bus" style="color:${tagInk(tier)};--edge:${tier.color}">${esc(r.route)}</span>`;
}

// --- Legend --------------------------------------------------------------

function buildLegend(meta, lines) {
  const legend = document.getElementById('legend');
  legend.open = matchMedia('(min-width: 768px)').matches;

  // Only the tiers on the map today.
  const present = meta.tiers ?? {};
  document.getElementById('legend-tiers').innerHTML = TIERS.filter((t) => present[t.id])
    .map((t) => {
      const height = Math.max(1.5, t.width[2]);
      const style = t.dashed ? ' dashed' : t.dotted ? ' dotted' : '';
      return `<li><span class="swatch${style}" style="height:${height}px;background:${t.color};color:${t.color}"></span><span>${t.label}</span></li>`;
    })
    .join('');

  // Each line with where it goes ("Union Station to Denver Airport").
  document.getElementById('legend-rail').innerHTML = meta.rail
    .map((r) => `<li title="${esc(frequencyText(r))}">${bullet(r, lines)}<span>${esc(ends(r.name))}</span></li>`)
    .join('');

  // The gray station appears only while some station has no trains.
  const unserved = meta.stations?.unserved ?? [];
  document.getElementById('legend-symbols').innerHTML = [
    `<li><span class="station-dot"></span><span>Rail station</span></li>`,
    unserved.length ? `<li><span class="station-dot unserved"></span><span>No trains right now</span></li>` : '',
  ].join('');

  const built = new Date(meta.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('legend-note').textContent =
    `Not affiliated with RTD. Data from RTD's public map and GTFS feeds, updated ${built}.`;
  return legend;
}

// "Union Station to Denver Airport Station" -> "Union Station – Denver Airport"
function ends(name) {
  return String(name)
    .split(/\s+to\s+/i)
    .map((end) => (/^\S+\s+Station$/i.test(end) && /union/i.test(end) ? end : end.replace(/\s+Station$/i, '')))
    .join(' – ');
}

// --- Helpers -------------------------------------------------------------

// GTFS times like 25:19 are after midnight.
function time(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h % 24;
  return `${hour % 12 || 12}:${String(m).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

// "2026-11-23" -> "Nov 23"
const date = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

main();
