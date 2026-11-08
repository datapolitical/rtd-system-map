// The page's startup (DESIGN.md, "Architecture"): RTD's network on our own
// quiet basemap, trains in color, buses in ink, drawn by how often each route
// runs ("Map design"). Everything shown comes from public/data, built from
// RTD's own map and GTFS by scripts/build-data.mjs. This file makes the map,
// its controls and its framing ("Opening state"), and wires the other
// modules to it: the layers (network.js), the pictures they name
// (symbols.js), the key (legend.js), taps and panels (select.js), search,
// Live and the theme.

import * as maplibregl from '../vendor/maplibre-gl.mjs';
import { BASEMAP_SOURCES, GLYPHS, TERRAIN, basemapBelow, basemapLabels } from './basemap.js';
import { followScheme } from './palette.js';
import { PHONE_QUERY, setWindow } from './shared.js';
import { STATE } from './highlight.js';
import { initSelection, closePanel, loadDirectory } from './select.js';
import { initSearch } from './search.js';
import { keepTabbable } from './tabbable.js';
import { initLive, vehicleLayers } from './live.js';
import { initEdgeLetters } from './edgeletters.js';
import { DATA_SOURCES, dataSources, lettersFirst, loadWhenNeeded, railStyle, transitLines, transitMarks } from './network.js';
import { addSymbol, drawOnDemand } from './symbols.js';
import { buildLegend } from './legend.js';

// Start the map's worker downloading while the network summary loads.
maplibregl.prewarm();

// Phones, and any short screen (a phone on its side): framing, key closed.
const PHONE = matchMedia(PHONE_QUERY).matches;
// What the map shows when nothing else is chosen: the build's midday window
// (meta.window), said wherever the key button is and in every panel.

// Half a place name, in px: what the whole-network view keeps free at a
// phone's sides.
const EDGE_ROOM = 26;

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
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group ctrl-network-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ctrl-network';
    button.title = 'Zoom out to the whole network';
    button.setAttribute('aria-label', 'Whole network');
    button.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 8 3.5 3.5M3.5 7.5v-4h4M12 8l4.5-4.5M12.5 3.5h4v4M12 12l4.5 4.5M16.5 12.5v4h-4M8 12l-4.5 4.5M7.5 16.5h-4v-4" /></svg><span>Whole network</span>';
    button.addEventListener('click', this.onClick);
    this.el.append(button);
    // The words say what the arrows mean on arrival, then fold away to the
    // icon so the corner stays clear.
    setTimeout(() => this.el.classList.add('compact'), 5000);
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
      layers: [...lettersFirst([...basemapBelow(), ...transitLines(lines), ...basemapLabels(), ...transitMarks(lines)]), ...vehicleLayers(lines)],
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

  // Locate me in the corner, the whole network to its left on the same row,
  // then zoom buttons above (only where there's no pinch). Controls stack
  // upward, so the thumb's button goes first.
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

  // Symbols are drawn the first time the map needs them (symbols.js).
  drawOnDemand(map, lines);

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
  initEdgeLetters(map);
  legend.follow(map);
  // The theme follows the system setting, and keeps following it while the page
  // is open: the layers and drawn symbols are re-colored in place, so the map
  // keeps its position, zoom, open route and loaded tiles.
  let ready = false;
  map.once('load', () => (ready = true));
  followScheme(() => (ready ? applyTheme(map, lines, legend) : map.once('load', () => applyTheme(map, lines, legend))));
  const context = { lines, legend, opening };
  initSelection(map, context);
  // Live: the button, the relay connection and the vehicles. A tap on a
  // vehicle is the selection code's first question.
  context.tapped = initLive(map, { meta, status: showStatus, changed: legend.setLive }).tapped;
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
  const layers = [...basemapBelow(), ...transitLines(lines), ...basemapLabels(), ...transitMarks(lines), ...(map.getSource('terrain') ? TERRAIN.layers : []), ...vehicleLayers(lines)];
  for (const { id, paint } of layers) {
    if (!map.getLayer(id)) continue;
    for (const [name, value] of Object.entries(paint ?? {})) map.setPaintProperty(id, name, value);
  }
  for (const id of map.listImages()) {
    addSymbol({ hasImage: () => false, addImage: (_, data) => map.updateImage(id, data) }, id, lines);
  }
  legend.redraw();
}

main();
