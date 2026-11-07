// RTD's network on our own quiet basemap: trains in color, buses in ink, drawn
// by how often each route runs (DESIGN.md, "Map design"). Everything shown
// comes from public/data, built from RTD's own map and GTFS by
// scripts/build-data.mjs.

import * as maplibregl from '../vendor/maplibre-gl.mjs';
import { BASEMAP_SOURCES, FONT, GLYPHS, TERRAIN, basemapBelow, basemapLabels, lineKeepOut } from './basemap.js';
import { lightenTo, shade, textOn } from './color.js';
import { DARK_RAIL_MIN, P, PALETTES, followScheme } from './palette.js';
import { DETAIL_FROM, OVERVIEW_UNTIL, PART_TIME, PHONE_QUERY, TIERS, TIER_RANK, ZOOMS, byZoom, tierMatch, tierWidth, bullet, esc, ends, middayLabel, setWindow } from './shared.js';
import { STATE, fade, isRoute, inList, onRoute, selectionLines, selectionMarks } from './highlight.js';
import { initSelection, closePanel, loadDirectory } from './select.js';
import { initSearch } from './search.js';
import { keepTabbable } from './tabbable.js';

// Start the map's worker downloading while the network summary loads.
maplibregl.prewarm();

// Phones, and any short screen (a phone on its side): framing, key closed.
const PHONE = matchMedia(PHONE_QUERY).matches;
// What the map shows when nothing else is chosen: the build's midday window
// (meta.window), said wherever the key button is and in every panel.

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

// Half a place name, in px: what the whole-network view keeps free at a
// phone's sides.
const EDGE_ROOM = 26;

// Bus stops are the largest file, so they load only near the zoom that shows them.
const STOPS_ZOOM = 15;
const STOPS_PRELOAD_ZOOM = 14;

// A bus line fades in by tier as you zoom, and to 20% when another route is open.
const fadeIn = ['interpolate', ['linear'], ['zoom'], ...[8, 9, 10, 11, 12, 13].flatMap((z) => [z, ['*', tierMatch((t) => Math.min(1, Math.max(0, (z - t.from) / 1.5 + 0.25))), fade(isRoute())]])];
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
// A rail letter: its text size in px, and its circle's scale by zoom.
const LETTER_SIZE = 11;
const LETTER_SCALE = [{ zoom: 10.5, size: 0.85 }, { zoom: 14, size: 1 }];
// Moves a rail letter from the middle of its track onto its own line. The
// build gives each letter `sx` and `sy`: how many line spacings right and
// down the screen its line is drawn (the map doesn't turn). An offset can't
// be made from two numbers, so it is interpolated between the corners of a
// square LETTER_REACH spacings each way. A symbol is laid out once per whole
// zoom and kept until the next, so the stops are half a zoom early: the
// letter is right in the middle of that range and within a pixel or two at
// its ends. `unit(zoom)`: how many px one unit of the offset is.
const LETTER_REACH = 4;
const letterOffset = (unit) =>
  ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => {
    const reach = (LETTER_REACH * (RAIL_WIDTH[i] + RAIL_GAP)) / unit(z);
    const down = (x) => ['interpolate', ['linear'], ['coalesce', ['get', 'sy'], 0], -LETTER_REACH, ['literal', [x, -reach]], LETTER_REACH, ['literal', [x, reach]]];
    return [z - 0.5, ['interpolate', ['linear'], ['coalesce', ['get', 'sx'], 0], -LETTER_REACH, down(-reach), LETTER_REACH, down(reach)]];
  })];

const status = document.getElementById('status');
const showStatus = (text) => {
  status.textContent = text;
  status.hidden = !text;
};

// A message that clears itself after a few seconds, or when the rider next
// moves the map.
let statusTimer;
function flashStatus(map, text, ms = 7000) {
  showStatus(text);
  clearTimeout(statusTimer);
  const clear = () => {
    clearTimeout(statusTimer);
    map.off('movestart', onMove);
    if (status.textContent === text) showStatus('');
  };
  const onMove = (e) => e.originalEvent && clear();
  map.on('movestart', onMove);
  statusTimer = setTimeout(clear, ms);
}

// A button in the map's own control stack that zooms out to all of the
// network. It says what it does: phones open zoomed in, so this is the way
// to the rest.
class WholeNetwork {
  constructor(onClick) {
    this.onClick = onClick;
  }
  onAdd() {
    this.el = document.createElement('div');
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ctrl-network';
    button.title = 'Zoom out to the whole network';
    button.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 8 3.5 3.5M3.5 7.5v-4h4M12 8l4.5-4.5M12.5 3.5h4v4M12 12l4.5 4.5M16.5 12.5v4h-4M8 12l-4.5 4.5M7.5 16.5h-4v-4" /></svg><span>Whole network</span>';
    button.addEventListener('click', this.onClick);
    this.el.append(button);
    return this.el;
  }
  onRemove() {
    this.el.remove();
  }
}

async function main() {
  keepTabbable();
  let meta;
  try {
    const res = await fetch('data/meta.json');
    if (!res.ok) throw new Error(`meta.json: ${res.status}`);
    meta = await res.json();
    setWindow(meta.window);
  } catch (err) {
    showStatus('The map data is missing. Run "npm run build", then reload.');
    throw err;
  }

  const lines = railStyle(meta.rail);
  const legend = buildLegend(meta, lines);

  // A link that carries a bearing or pitch opens north-up and flat: a transit
  // map that can be twisted has no way back (there's no compass).
  const flat = location.hash.match(/^(#-?[\d.]+\/-?[\d.]+\/-?[\d.]+)\/-?[\d.]+/);
  if (flat) history.replaceState(null, '', `${location.pathname}${location.search}${flat[1]}`);

  // What the search box, the key and the buttons leave free.
  const free = () => {
    if (!PHONE) {
      const legendWidth = legend.open ? legend.getBoundingClientRect().right : 0;
      return { top: 24, right: 24, bottom: 24, left: legendWidth + 24 };
    }
    // A phone on its side: beside the search box and key, not under them.
    if (innerWidth >= 768) {
      const finder = document.getElementById('finder')?.getBoundingClientRect().right ?? 48;
      return { top: 24, right: 64, bottom: 24, left: Math.round(finder) + 16 };
    }
    return { top: 116, right: 10, bottom: 136, left: 10 }; // search and key above, the buttons below
  };
  // All of the network drawn at full strength (rail and buses every 30
  // minutes or better), not the long reach of a few commuter routes.
  // On a phone the network's sides would be the screen's edges, so it gets
  // room there for the names of the places at its ends.
  const whole = () => {
    const padding = free();
    if (PHONE && innerWidth < 768) Object.assign(padding, { left: padding.left + EDGE_ROOM, right: padding.right + EDGE_ROOM });
    return { bounds: meta.bounds.network ?? meta.bounds.routes, padding };
  };
  // Wider screens have room for all of it at a scale that reads, beside the
  // open legend. A phone doesn't, so it opens on the middle of the service
  // (meta.bounds.core, scripts/lib/core.mjs), close enough to tell stations
  // apart and read their names; "Whole network" is one tap away.
  const opening = () => (PHONE && meta.bounds.core ? { bounds: meta.bounds.core, padding: free() } : whole());
  // A link to a place opens there, and nothing moves it.
  const linked = location.hash.length > 1;
  const start = opening();
  // The district, with room around it for the foothills and the plains, but
  // not so much that someone can wander off into nothing.
  const [[west, south], [east, north]] = meta.bounds.routes;
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      glyphs: GLYPHS,
      state: STATE,
      sources: { ...BASEMAP_SOURCES, ...dataSources() },
      layers: lettersFirst([...basemapBelow(), ...transitLines(lines), ...basemapLabels(), ...transitMarks(lines)]),
    },
    bounds: start.bounds,
    fitBoundsOptions: { padding: start.padding },
    maxBounds: [
      [west - 0.7, south - 0.4],
      [east + 0.6, north + 0.5],
    ],
    // North stays up and the map stays flat, for touch, mouse and keyboard.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    hash: true,
    attributionControl: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // A hash edited by hand can still ask for a bearing.
  map.on('move', () => {
    if (map.getBearing() !== 0) map.setBearing(0);
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  // Locate me, then the whole network above it, then zoom buttons (only where
  // there's no pinch). Controls stack upward, so the thumb's button goes first.
  const locate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false });
  map.addControl(locate, 'bottom-right');
  const network = new WholeNetwork(() => {
    showStatus('');
    // Closing a panel brings the key back, so the view is worked out
    // after that.
    closePanel({ focus: false });
    const view = whole();
    map.fitBounds(view.bounds, { padding: view.padding });
  });
  map.addControl(network, 'bottom-right');
  // The button is there only while it would do something: with all of the
  // network on screen it's a large label over the map for no reason.
  const offerNetwork = () => {
    const [[w, s], [e, n]] = whole().bounds;
    const view = map.getBounds();
    const all = view.getWest() <= w && view.getSouth() <= s && view.getEast() >= e && view.getNorth() >= n;
    if (all && network.el.contains(document.activeElement)) map.getCanvas().focus();
    network.el.hidden = all;
  };
  map.on('moveend', offerNetwork);
  offerNetwork();
  if (!matchMedia('(pointer: coarse)').matches) {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  }

  // Someone outside the district would be flown to blank map, so the view
  // stays where it was and the map says why.
  let before;
  map.getContainer().addEventListener(
    'click',
    (e) => {
      if (e.target.closest('.maplibregl-ctrl-geolocate')) before = { center: map.getCenter(), zoom: map.getZoom() };
    },
    true,
  );
  const outside = () => {
    if (before) {
      map.stop();
      map.jumpTo(before);
    }
    flashStatus(map, "You're outside RTD's area, so the map stayed here.");
  };
  const margin = 0.05;
  const inArea = (x, y) => x >= west - margin && x <= east + margin && y >= south - margin && y <= north + margin;
  locate.on('geolocate', (e) => {
    if (!inArea(e.coords.longitude, e.coords.latitude)) outside();
  });
  locate.on('outofmaxbounds', outside);
  // Someone who has already allowed their location opens on the map around
  // them. A link to a place wins.
  if (!linked) openNearby(map, locate, inArea);
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
    // The directory (every route's ends, hours and stations) is only needed
    // once something is tapped, so it waits for the first draw.
    loadDirectory();
    // Relief last, so its tiles never hold up the network.
    map.addSource('terrain', TERRAIN.source);
    for (const layer of TERRAIN.layers) map.addLayer(layer, TERRAIN.before);
  });

  loadWhenNeeded(map);
  // The theme follows the system setting, and keeps following it while the page
  // is open: the layers and drawn symbols are re-colored in place, so the map
  // keeps its position, zoom, open route and loaded tiles.
  let ready = false;
  map.once('load', () => (ready = true));
  followScheme(() => (ready ? applyTheme(map, lines, legend) : map.once('load', () => applyTheme(map, lines, legend))));
  initSelection(map, { lines, legend, opening });
  initSearch({ lines });
  map.getCanvas().setAttribute('aria-label', 'Map of RTD bus and rail routes. Arrow keys move the map; plus and minus zoom. To open a route or place, use Search or Lines.');
}

// Opening on someone's location: close enough to read every route number
// around them, far enough out to see a 20-minute walk each way.
const NEARBY_ZOOM = 13.5;

// The page never asks for a location on load: this runs only when the browser
// says it's already allowed. Anyone who has started using the map before the
// position arrives keeps the view they have, and someone outside RTD's area
// stays on the opening view with nothing said.
async function openNearby(map, locate, inArea) {
  if (!navigator.geolocation || !navigator.permissions?.query) return;
  const allowed = await navigator.permissions.query({ name: 'geolocation' }).then(
    (permission) => permission.state === 'granted',
    () => false,
  );
  if (!allowed) return;
  let used = false;
  for (const type of ['pointerdown', 'keydown', 'wheel']) {
    addEventListener(type, () => (used = true), { capture: true, once: true, passive: true });
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const at = [coords.longitude, coords.latitude];
      if (used || !inArea(...at)) return;
      map.jumpTo({ center: at, zoom: NEARBY_ZOOM });
      // The same dot the locate button draws, until that button draws its own.
      const dot = document.createElement('div');
      dot.className = 'maplibregl-user-location-dot';
      const here = new maplibregl.Marker({ element: dot }).setLngLat(at).addTo(map);
      locate.once('geolocate', () => here.remove());
    },
    () => {},
    { maximumAge: 300000, timeout: 8000 },
  );
}

// Every layer's paint properties, from a fresh set of definitions in the new
// theme's colors (layout, filters and sources are the same in both themes), then
// every drawn symbol (tags, signs, stations, shields, icons) redrawn at the
// same size, then the key.
function applyTheme(map, lines, legend) {
  const layers = [...basemapBelow(), ...transitLines(lines), ...basemapLabels(), ...transitMarks(lines), ...(map.getSource('terrain') ? TERRAIN.layers : [])];
  for (const { id, paint } of layers) {
    if (!map.getLayer(id)) continue;
    for (const [name, value] of Object.entries(paint ?? {})) map.setPaintProperty(id, name, value);
  }
  for (const id of map.listImages()) {
    addSymbol({ hasImage: () => false, addImage: (_, data) => map.updateImage(id, data) }, id, lines);
  }
  legend.redraw();
}

// A line's letter claims its space before a bus number does: a line with no
// letter can't be named, and a number has the rest of its route to sit on.
function lettersFirst(layers) {
  const [letters] = layers.splice(layers.findIndex((l) => l.id === 'rail-bullets'), 1);
  layers.splice(layers.findIndex((l) => l.id === 'line-signs'), 0, letters);
  return layers;
}

const DATA_SOURCES = ['boundary', 'flexride', 'routes', 'stations', 'facilities', 'labels', 'stops'];
// Loaded when the map gets close enough to need them (see loadWhenNeeded).
const LAZY = ['stops'];
const EMPTY = { type: 'FeatureCollection', features: [] };

// By URL, so each file downloads and parses in the map's worker.
function dataSources() {
  return {
    ...Object.fromEntries(
      DATA_SOURCES.map((name) => [name, { type: 'geojson', data: LAZY.includes(name) ? EMPTY : `data/${name}.geojson` }]),
    ),
    // The route that is open: its two ends, named on the map.
    selection: { type: 'geojson', data: EMPTY },
  };
}

// Each rail line keeps RTD's own color; a thin outline in a darker shade of
// the same hue keeps light colors (A, C, G, R) visible on the light map
// (DESIGN.md, "Rail line colors"). Bullet letters are white or ink, whichever
// reads better.
//
// On the dark map the rule runs the other way: a color that is too dark to see
// against the dark land (E, N, T, sometimes D) is lifted, in OKLab, with its
// hue kept, only as far as DARK_RAIL_MIN; colors already bright enough are
// untouched. The outline is then a darker shade of the lifted color. Both
// themes' values are worked out here from the data and nothing else; the one
// in use is `lines.color`, `.edge` and `.letter` (map expressions), and
// `lines.of(route)`. `byRoute` entries carry both, as `.light` and `.dark`.
function railStyle(rail) {
  const byRoute = new Map(
    rail.map((r) => {
      const lifted = lightenTo(r.color, PALETTES.dark.land, DARK_RAIL_MIN);
      return [
        r.route,
        {
          ...r,
          light: { color: r.color, edge: shade(r.color, 0.72, PALETTES.light.land, 3), letter: textOn(r.color, PALETTES.light.onColor) },
          dark: { color: lifted, edge: shade(lifted, 0.6, PALETTES.dark.land, 1), letter: textOn(lifted, PALETTES.dark.onColor) },
        },
      ];
    }),
  );
  const match = (key, fallback) =>
    byRoute.size ? ['match', ['get', 'route'], ...[...byRoute].flatMap(([route, s]) => [route, s[P.scheme][key]]), fallback] : fallback;
  return {
    byRoute,
    of: (route) => byRoute.get(route)?.[P.scheme],
    get color() {
      return match('color', ['coalesce', ['get', 'color'], P.ink]);
    },
    get edge() {
      return match('edge', P.ink);
    },
    get letter() {
      return match('letter', P.white);
    },
  };
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
    { id: 'district-wash', type: 'fill', source: 'boundary', paint: { 'fill-color': P.wash, 'fill-opacity': 0.72 } },
    {
      id: 'district-edge',
      type: 'line',
      source: 'boundary',
      paint: {
        'line-color': P.wash,
        'line-opacity': 0.6,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 60],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 60],
      },
    },
    // FlexRide: a light hatch with a dashed edge, never a green that reads as park.
    // Not until close in: further out, zone outlines are boxes around
    // nothing, and read as city limits.
    {
      id: 'flexride-fill',
      type: 'fill',
      source: 'flexride',
      minzoom: DETAIL_FROM,
      paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], DETAIL_FROM, 0, 11.75, 0.6, 12.5, 0.85] },
    },
    {
      id: 'flexride-line',
      type: 'line',
      source: 'flexride',
      minzoom: DETAIL_FROM,
      paint: {
        'line-color': P.flex.edge,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], DETAIL_FROM, 0, 11.75, 0.9],
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

    // The open bus route, drawn over its faded neighbours.
    ...selectionLines(),

    // Rail floats over the buses on a white casing. Part-time rail goes
    // beneath full-service rail, so on shared track the line that runs wins.
    {
      id: 'rail-casing',
      type: 'line',
      source: 'routes',
      filter: rail,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': P.casing, 'line-width': railWidth(RAIL_GAP + 1), 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
    {
      id: 'rail-part-time',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, partTime],
      paint: { 'line-color': lines.color, 'line-width': railWidth(-0.5), 'line-dasharray': [1.5, 1.2], 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
    {
      id: 'rail-edge',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, ['!', partTime]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lines.edge, 'line-width': railWidth(1), 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'routes',
      filter: ['all', rail, ['!', partTime]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': lines.color, 'line-width': railWidth(), 'line-offset': railOffset, 'line-opacity': fade(isRoute()) },
    },
  ];
}

// Stations, stops, symbols and our labels, above everything else.
function transitMarks(lines) {
  const halo = { 'text-halo-color': P.land, 'text-halo-width': 1.8, 'text-halo-blur': 0.4 };
  return [
    {
      id: 'stops',
      type: 'circle',
      source: 'stops',
      minzoom: STOPS_ZOOM,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.4, 18, 5],
        'circle-color': P.stop.fill,
        'circle-stroke-color': P.stop.edge,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 15, 1, 18, 1.6],
        'circle-opacity': fade(inList('lines')),
        'circle-stroke-opacity': fade(inList('lines')),
      },
    },
    // Stations with no trains this week: a hollow gray ring, from closer in.
    {
      id: 'stations-unserved',
      type: 'circle',
      source: 'stations',
      // Rings and names arrive together (names are where there's room).
      minzoom: UNSERVED_ZOOM,
      filter: ['!', served],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], UNSERVED_ZOOM, 3.2, 16, 6.5],
        'circle-color': P.unserved.fill,
        'circle-stroke-color': P.unserved.edge,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], UNSERVED_ZOOM, 1.2, 16, 2],
        'circle-opacity': fade(onRoute),
        'circle-stroke-opacity': fade(onRoute),
      },
    },
    // In the overview stations aren't marked: a corridor of them is a ladder
    // over its line. From there a station is a small tick across the track,
    // which grows into the capsule by zoom 11.
    {
      id: 'stations-dot',
      type: 'symbol',
      source: 'stations',
      minzoom: OVERVIEW_UNTIL,
      maxzoom: CAPSULE_TO,
      filter: served,
      layout: {
        'icon-image': ['concat', 'dot-', ['get', 'span']],
        'icon-size': stationSize,
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], OVERVIEW_UNTIL, 0, OVERVIEW_UNTIL + 0.4, fade(onRoute), CAPSULE_FROM, fade(onRoute), CAPSULE_TO, 0] },
    },
    // A white capsule across the track, as wide as the lines through it.
    {
      id: 'stations',
      type: 'symbol',
      source: 'stations',
      minzoom: CAPSULE_FROM,
      filter: served,
      layout: {
        'icon-image': ['concat', 'station-', ['get', 'span']],
        'icon-size': stationSize,
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], CAPSULE_FROM, 0, CAPSULE_TO, fade(onRoute)] },
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
      paint: { 'icon-opacity': fade(['==', 1, 0]) },
    },
    // Station names sit beside their station, clear of every line: beside
    // the mark first, then a little further out, on whichever side is free.
    // They're placed after the lines' own letters and numbers and after the
    // lines themselves (the keep-out layers just above), so a name never
    // covers rail or a frequent bus line; a station with no side clear of
    // those goes unnamed until there is one. The lighter bus lines are placed
    // after these names (basemap.js), so a name can cross one of them.
    {
      id: 'station-labels-unserved',
      type: 'symbol',
      source: 'stations',
      minzoom: UNSERVED_ZOOM,
      filter: ['!', served],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT.regular,
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11, 16, 13],
        'text-variable-anchor-offset': BESIDE,
        'text-max-width': 8,
      },
      paint: { 'text-color': P.unserved.label, 'text-opacity': fade(onRoute), ...halo },
    },
    {
      id: 'station-labels',
      type: 'symbol',
      source: 'stations',
      minzoom: NAMES_FROM,
      // Before every station has room for its name (EVERY_NAME_FROM), the
      // ones named are where routes meet, not whichever have empty map
      // beside them: that named the quiet ends of lines and left the middle
      // bare. The station at a line's end follows the same rule as any other.
      filter: [
        'all',
        served,
        ['any', ['>=', ['zoom'], EVERY_NAME_FROM], ['>=', ['coalesce', ['get', 'links'], 0], HUB_LINKS]],
      ],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT.bold,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 10.5, 13, 12, 16, 14.5],
        'text-variable-anchor-offset': BESIDE,
        'text-justify': 'auto',
        'text-max-width': 8,
        // The stations where most routes meet claim their space first.
        'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'links'], 0]],
      },
      paint: { 'text-color': P.ink, 'text-opacity': fade(onRoute), ...halo },
    },
    // Rail and the frequent buses take up their own room here (basemap.js),
    // so everything placed after them, which is every name on the map, stays
    // off them. Above these: only what names a line and so sits on it.
    ...lineKeepOut(),
    // Rail letters ride along their lines, placed before the bus numbers
    // below. The build says where (scripts/lib/sharedtrack.mjs): lines that
    // share track take turns, so each is named, and a letter sits between
    // stations. One set of places per whole zoom; a filter sees the zoom as
    // a whole number. Each is moved sideways onto its own line (letterOffset).
    {
      id: 'rail-bullets',
      type: 'symbol',
      source: 'labels',
      minzoom: NAMES_FROM,
      filter: ['all', ['==', ['get', 'kind'], 'letter'], ['!', partTime], ['<=', ['get', 'from'], ['zoom']], ['<', ['zoom'], ['get', 'to']]],
      layout: {
        'icon-image': ['concat', 'bullet-', ['get', 'route']],
        'text-field': ['get', 'route'],
        'text-font': FONT.heavy,
        'text-size': LETTER_SIZE,
        'icon-size': ['interpolate', ['linear'], ['zoom'], LETTER_SCALE[0].zoom, LETTER_SCALE[0].size, LETTER_SCALE[1].zoom, LETTER_SCALE[1].size],
        // An icon's offset is in px times its size; a text's is in ems.
        'icon-offset': letterOffset((zoom) => {
          const [a, b] = LETTER_SCALE;
          return a.size + (b.size - a.size) * Math.min(1, Math.max(0, (zoom - a.zoom) / (b.zoom - a.zoom)));
        }),
        'text-offset': letterOffset(() => LETTER_SIZE),
      },
      paint: { 'text-color': lines.letter, 'icon-opacity': fade(isRoute()), 'text-opacity': fade(isRoute()) },
    },
    // No bus route numbers on the map (DESIGN.md, "Bus routes", "Numbers").
    // Three tries at them (one number per frequent route, rows of numbers in
    // the line, rows of pills) each read as clutter whose meaning wasn't
    // plain. The lines' weight says how often a bus comes; a tap says which.
    // Numbers come back only where a reason to read one is shown.
    // In the overview, where no letters ride the lines yet, each rail line
    // has its letter at each end. The station where many lines end has none
    // (scripts/lib/labels.mjs).
    sign('line-signs'),
    ...selectionMarks(),
  ];
}

function sign(id) {
  return {
    id,
    type: 'symbol',
    source: 'labels',
    // Only until letters ride along the lines: a letter at the end of a
    // line that carries the same letter an inch away says it twice.
    maxzoom: NAMES_FROM,
    filter: ['==', ['get', 'kind'], 'end'],
    layout: {
      // The letter alone. A destination beside it ("N 124th – Eastlake") is
      // a line's name spelled out on the map; the key and the line's panel
      // say where it goes, and the station at its end is named like any
      // station.
      'icon-image': ['concat', 'sign|', ['get', 'lines'], '|'],
      // Just off the end station, on the side the build found clear: the
      // sign's middle is SIGN_REACH px from the station, so its edge all but
      // touches the end of the line and the letter reads as the line's cap.
      // A sign for lines that end together is wider, and moves out by half
      // of each extra letter so it doesn't sit on the station.
      'icon-offset': [
        'match',
        ['get', 'anchor'],
        ...Object.entries(AWAY).flatMap(([a, [x, y]]) => {
          const reach = SIGN_REACH / Math.hypot(x, y);
          const at = (letters) => ['literal', [x * reach + Math.sign(x) * (letters - 1) * 9, y * reach]];
          // `lines` is letters with spaces between: 1, 3, 5 characters.
          return [a, ['match', ['length', ['get', 'lines']], 1, at(1), 3, at(2), at(3)]];
        }),
        ['literal', [0, 0]],
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.85, 10, 1],
      'icon-padding': 0,
    },
    paint: { 'icon-opacity': fade(inList('lines')) },
  };
}

// The names of stations where routes meet, and the letters along rail lines,
// start here: just under the zoom the smallest phones open at (about 9.9),
// so every opening view has them.
const NAMES_FROM = 9.75;
// A station where at least this many routes meet, trains and buses together,
// is one people change at, and is named from NAMES_FROM. Every other station
// is named from EVERY_NAME_FROM, where stations are far enough apart that
// most names fit. (A whole zoom: filters read the zoom in whole steps.)
const HUB_LINKS = 6;
const EVERY_NAME_FROM = DETAIL_FROM;
// Where a station's name can sit: beside its mark, then further out, on any
// side (ems; the first that is clear of every line and name wins).
const BESIDE = [0.7, 1.2, 1.8, 2.6].flatMap((d) => ['left', [d, 0], 'right', [-d, 0], 'top', [0, d], 'bottom', [0, -d], 'top-left', [d, d], 'bottom-right', [-d, -d], 'top-right', [-d, d], 'bottom-left', [d, -d]]);
// Closed stations: ring and name from the same zoom.
const UNSERVED_ZOOM = 13;
// Stations are ticks until CAPSULE_FROM and capsules from CAPSULE_TO.
const CAPSULE_FROM = 10.25;
const CAPSULE_TO = 11;
// Which way a symbol sits from its point, on screen, for each icon anchor.
const SIGN_REACH = 14;
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

  // Line-end signs: "sign|E R|". A white sign with the lines' bullets. (A
  // name after the last bar would be drawn beside them; the map sends none.)
  if (id.startsWith('sign|')) {
    const [, routes, ...rest] = id.split('|');
    const name = rest.join('|');
    const margin = 4;
    const h = 22;
    const bullet = 16;
    const font = '700 12px Overpass, system-ui, sans-serif';
    const measure = canvas(1, 1);
    measure.font = font;
    const text = measure.measureText(name);
    const bullets = routes.split(' ').filter(Boolean);
    const pad = 3;
    const w = pad + bullets.length * (bullet + 2) + (name ? 4 + Math.ceil(text.width) + 8 : pad - 2);
    const ctx = canvas(w + margin * 2, h + margin * 2);
    ctx.translate(margin, margin);
    ctx.shadowColor = P.sign.shadow;
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    roundRect(ctx, 0, 0, w, h, h / 2);
    ctx.fillStyle = P.sign.fill;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    let x = pad;
    for (const route of bullets) {
      const line = lines.of(route);
      ctx.beginPath();
      ctx.arc(x + bullet / 2, h / 2, bullet / 2, 0, Math.PI * 2);
      ctx.fillStyle = line?.color ?? P.ink;
      ctx.fill();
      ctx.font = '800 10.5px Overpass, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = line?.letter ?? P.white;
      const cap = ctx.measureText(route).actualBoundingBoxAscent;
      ctx.fillText(route, x + bullet / 2, h / 2 + cap / 2);
      x += bullet + 2;
    }
    x += 4;
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.fillStyle = P.sign.text;
    ctx.fillText(name, x, h / 2 + text.actualBoundingBoxAscent / 2 - 0.5);
    return add(ctx);
  }

  // Stations from far out: "dot-3" is a small tick across three lines; a
  // station where lines meet is a little stronger than one that serves one.
  if (id.startsWith('dot-')) {
    const span = Number(id.slice('dot-'.length)) || 1;
    const stroke = 1.6;
    const d = span > 1 ? 8 : 6;
    const length = (span - 1) * STATION_SPACING + d;
    const ctx = canvas(length + 2, d + 2);
    roundRect(ctx, 1 + stroke / 2, 1 + stroke / 2, length - stroke, d - stroke, (d - stroke) / 2);
    ctx.fillStyle = P.station.fill;
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = P.station.edge;
    ctx.stroke();
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
    ctx.fillStyle = P.station.fill;
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = P.station.edge;
    ctx.stroke();
    return add(ctx);
  }

  // Rail bullets: a circle in the line's color, outlined like the line.
  if (id.startsWith('bullet-')) {
    const line = lines.of(id.slice('bullet-'.length));
    const ctx = canvas(20, 20);
    ctx.beginPath();
    ctx.arc(10, 10, 9, 0, Math.PI * 2);
    ctx.fillStyle = line?.color ?? P.ink;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = P.bulletRing;
    ctx.stroke();
    return add(ctx);
  }

  // A one-pixel clear image, scaled by icon-size into an invisible box. The
  // 'keep-out-*' layers (basemap.js) use it to hold every name off the lines
  // and stations: a symbol that takes up room but draws nothing.
  if (id === 'clear') {
    return add(canvas(1, 1));
  }

  // Highway shields, in quiet gray: the interstate shield and the US badge,
  // sized for the number's length ("shield-us-interstate-2").
  const shield = id.match(/^shield-(us-interstate|us-highway)-(\d)$/);
  if (shield) {
    const digits = Number(shield[2]);
    const interstate = shield[1] === 'us-interstate';
    const w = interstate ? 12 + digits * 5 : 12 + digits * 5;
    const h = 19;
    const ctx = canvas(w, h);
    ctx.beginPath();
    if (interstate) {
      ctx.moveTo(1, 2.5);
      ctx.quadraticCurveTo(w / 2, 0, w - 1, 2.5);
      ctx.bezierCurveTo(w + 0.5, 9, w - 3, 15, w / 2, h - 0.8);
      ctx.bezierCurveTo(3, 15, -0.5, 9, 1, 2.5);
    } else {
      // The US-route shield: shoulders either side of a notch at the top,
      // tapering to a point, so it can't be taken for a bus tag's rounded box.
      ctx.moveTo(1, 3);
      ctx.lineTo(w * 0.3, 1);
      ctx.lineTo(w / 2, 2.8);
      ctx.lineTo(w * 0.7, 1);
      ctx.lineTo(w - 1, 3);
      ctx.lineTo(w - 1, 11);
      ctx.lineTo(w / 2, h - 0.8);
      ctx.lineTo(1, 11);
      ctx.closePath();
    }
    ctx.fillStyle = P.shieldFill;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = P.shieldEdge;
    ctx.stroke();
    return add(ctx);
  }

  // The ends of an open route: a white dot ringed in ink.
  if (id === 'sel-end') {
    const ctx = canvas(18, 18);
    ctx.beginPath();
    ctx.arc(9, 9, 6, 0, Math.PI * 2);
    ctx.fillStyle = P.selEnd.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.selEnd.ring;
    ctx.stroke();
    return add(ctx);
  }

  if (id === 'hatch') {
    const ctx = canvas(6, 6);
    ctx.strokeStyle = P.flex.hatch;
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
    ctx.fillStyle = P.pnr.rim;
    ctx.fill();
    roundRect(ctx, 1.5, 1.5, 14, 14, 2.75);
    ctx.fillStyle = P.pnr.plate;
    ctx.fill();
    ctx.fillStyle = P.pnr.mark;
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
    ctx.fillStyle = P.transit.rim;
    ctx.fill();
    roundRect(ctx, 1.5, 1.5, 14, 14, 2.75);
    ctx.fillStyle = P.transit.plate;
    ctx.fill();
    ctx.fillStyle = P.transit.mark;
    roundRect(ctx, 4.5, 3.8, 8, 8.4, 1.6);
    ctx.fill();
    ctx.fillStyle = P.transit.windows;
    ctx.fillRect(5.6, 5, 5.8, 3.2);
    ctx.beginPath();
    ctx.arc(6.4, 10.4, 0.8, 0, Math.PI * 2);
    ctx.arc(10.6, 10.4, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.transit.mark;
    ctx.fillRect(5.3, 12, 1.6, 1.3);
    ctx.fillRect(10.1, 12, 1.6, 1.3);
    return add(ctx);
  }
}

// The biggest file loads when the map first gets near the zoom that shows it.
function loadWhenNeeded(map) {
  const load1 = (name) => map.getSource(name).setData(`data/${name}.geojson`);
  const pending = new Map([['stops', STOPS_PRELOAD_ZOOM]]);
  const load = () => {
    for (const [name, zoom] of pending) {
      if (map.getZoom() < zoom) continue;
      pending.delete(name);
      load1(name);
    }
    if (!pending.size) map.off('zoomend', load);
  };
  map.on('zoomend', load);
  map.once('load', load);
}

// --- Legend --------------------------------------------------------------

// A symbol the map draws, as a picture for the key: the same canvas code
// (addSymbol) with a stand-in for the map, so the key can't drift from the map.
function symbolImage(id, lines, alt = '') {
  let img = '';
  addSymbol(
    {
      hasImage: () => false,
      addImage: (_, data) => {
        const c = document.createElement('canvas');
        c.width = data.width;
        c.height = data.height;
        c.getContext('2d').putImageData(data, 0, 0);
        img = `<img src="${c.toDataURL()}" width="${data.width / RATIO}" height="${data.height / RATIO}" alt="${alt}" />`;
      },
    },
    id,
    lines,
  );
  return img;
}

// How often a line comes at midday on weekdays, short enough to sit beside its name.
function howOften(r) {
  if (r.wk) return `${r.wk} min`;
  if (r.tier === 'peak') return 'Rush hours';
  if (r.tier === 'limited') return 'A few trips';
  return 'No weekday trains';
}

function buildLegend(meta, lines) {
  const legend = document.getElementById('legend');
  legend.open = !PHONE;
  document.getElementById('legend-time').textContent = middayLabel();
  // The key button's icon: the first line's outline color (light theme) or its
  // lifted fill (dark theme); app.css picks the pair.
  const first = [...lines.byRoute.values()][0];
  if (first) {
    legend.style.setProperty('--key-rail', first.light.edge);
    legend.style.setProperty('--key-rail-dark', first.dark.color);
  }

  // Each line with where it goes and how often it comes at midday, in plain
  // sight (a tooltip is no use on a phone).
  document.getElementById('legend-rail').innerHTML = meta.rail
    .map(
      (r) =>
        `<li>${bullet(r, lines)}<span class="name">${esc(Array.isArray(r.ends) && r.ends.length ? r.ends.join(' – ') : ends(r.name))}</span><span class="often">${esc(howOften(r))}</span></li>`,
    )
    .join('');

  // Everything else the map draws, only while it's on the map.
  const counts = meta.counts ?? {};
  const unserved = meta.stations?.unserved ?? [];
  const symbols = () => {
    const hatch = symbolImage('hatch', lines);
    const hatchUrl = hatch.match(/src="([^"]+)"/)?.[1];
    return [
      [symbolImage('station-1', lines), 'Rail station'],
      unserved.length ? ['<span class="station-dot unserved"></span>', 'Closed: no trains this week'] : null,
      counts.facilities ? [symbolImage('parking', lines), 'Park-n-Ride'] : null,
      counts.facilities ? [symbolImage('transit-center', lines), 'Transit center'] : null,
      counts.stops ? ['<span class="stop-dot"></span>', 'Bus stop, when zoomed in close'] : null,
      counts.flexride && hatchUrl ? [`<span class="flex" style="background-image:url(${hatchUrl})"></span>`, 'FlexRide: book a ride in this area'] : null,
      counts.boundary ? ['<span class="outside"></span>', "Outside RTD's district"] : null,
    ]
      .filter(Boolean)
      .map(([icon, text]) => `<li><span class="sym">${icon}</span><span>${text}</span></li>`)
      .join('');
  };
  // Only the tiers on the map today; the two slowest share one look, so one row.
  // Each swatch is the line itself, at the map's zoom-13 width, so the order
  // of the steps is the order of the lines.
  const present = meta.tiers ?? {};
  const drawTiers = () => {
    const seen = new Set();
    document.getElementById('legend-tiers').innerHTML = TIERS.filter((t) => present[t.id] && !seen.has(t.label) && seen.add(t.label))
      .map((t) => {
        const w = t.width[2];
        const dash = t.dashed ? ` stroke-dasharray="${w * 3} ${w * 2}" stroke-linecap="butt"` : t.dotted ? ` stroke-dasharray="0.1 ${w * 2.2}" stroke-linecap="round"` : ' stroke-linecap="round"';
        const line = `<svg class="swatch" viewBox="0 0 36 8" width="36" height="8" aria-hidden="true"><path d="M${t.dotted ? 3 : 1} 4h${t.dotted ? 31 : 34}" stroke="${t.color}" stroke-width="${w}"${dash} /></svg>`;
        return `<li>${line}<span>${t.label}</span></li>`;
      })
      .join('');
  };
  const draw = () => {
    drawTiers();
    document.getElementById('legend-symbols').innerHTML = symbols();
    moreBelow(legend);
  };
  draw();
  // The P is text, so draw it again once the font is here.
  document.fonts.load('800 12px Overpass').then(draw).catch(() => {});

  const built = new Date(meta.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('legend-note').textContent =
    `Not affiliated with RTD. Data from RTD's public map and GTFS feeds, updated ${built}.`;

  // A long key scrolls inside its box, and says so while there's more below.
  legend.addEventListener('scroll', () => moreBelow(legend));
  legend.addEventListener('toggle', () => moreBelow(legend));
  addEventListener('resize', () => moreBelow(legend));
  moreBelow(legend);
  // The swatches and drawn symbols are made for one theme; draw them again for the other.
  legend.redraw = draw;
  return legend;
}

function moreBelow(legend) {
  const scrolls = legend.open && legend.scrollHeight > legend.clientHeight + 4;
  legend.classList.toggle('scrolls', scrolls);
  legend.classList.toggle('at-end', !scrolls || legend.scrollTop + legend.clientHeight >= legend.scrollHeight - 6);
}

main();
