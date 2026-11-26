import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { readView, writeView } from '../sheets/address.js';
import { PALETTES } from '../sheets/style.js';
import { MIN_ZOOM, MAX_ZOOM, RAIL_DRAWINGS, attachedCollection, attachedFor, labelsAt, busDrawingAt, railDrawingAt } from './model.js';
import { previewStyle } from './style.js';
import { resolveImages } from './images.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Chosen before the first paint (zoom/index.html).
let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
let picked = readView(location.hash)?.pick ?? null;
let map, bundle, metadata, labelFrame;
let updatePending = false;
let moving = false;
let updatedZoom = null;
const labelState = { sides: new Map(), fades: new Map() };
const busState = {};
const railState = {};
let busLayers = null;
let busSources = null;
// True from the style's load until the theme changes it: the page's sources exist.
let styleReady = false;
const busShown = new Map();
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const timings = [];
const errors = [];
const fetchJSON = async (path) => {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};

function saveView() {
  const c = map.getCenter();
  history.replaceState(null, '', `${location.pathname}${location.search}${writeView({ zoom: map.getZoom(), center: [c.lng, c.lat], pick: picked })}`);
}

function setPick(pick) {
  picked = pick;
  map.setGlobalStateProperty('bus', picked?.mode === 'bus' ? picked.route : '');
  map.setGlobalStateProperty('rail', picked?.mode === 'rail' ? picked.route : '');
  $('card').hidden = !picked;
  $('route-options').replaceChildren();
  $('selection').textContent = picked ? `${picked.mode === 'rail' ? 'Line' : 'Route'} ${picked.route} highlighted` : '';
  window.zoomPick = picked;
  saveView();
}

function update() {
  updatePending = false;
  // Only until the style has loaded. Waiting for every source to finish loading instead froze the
  // drawings, names and bars through a fast pinch, then changed them all at once (real iPhone run
  // 2026-11-25); a source sent new data while still busy takes the newest when it is free.
  if (!styleReady) { schedule(); return; }
  const started = performance.now();
  const zoom = map.getZoom();
  // Only the small rail-symbol sources change during a zoom; the rail and bus drawings stay cached.
  // The rail drawing for this zoom, faded in from the one before, with its own station bars and
  // letters (model.js, railDrawingAt). Line letters appear as the zoom reaches them and stay for
  // every closer zoom.
  const rail = railDrawingAt(zoom, railState);
  for (const d of RAIL_DRAWINGS) {
    const value = rail.sets[d.set].lines, key = `rail${d.set}`;
    if (busShown.get(key) !== value) { map.setGlobalStateProperty(key, value); busShown.set(key, value); }
  }
  map.getSource('trial-attached').setData(attachedCollection(attachedFor(bundle.attached, rail, zoom), bundle.sizes, zoom));
  const labels = labelsAt(bundle.frames, zoom, bundle.sizes, labelState, performance.now(), { motion: !calm.matches });
  map.getSource('trial-labels').setData(labels.collection);
  busLayers ??= map.getStyle().layers.filter((l) => l.metadata?.busKey).map((l) => ({ id: l.id, key: l.metadata.busKey, source: l.source, plain: l.metadata.busPlain, set: null }));
  busSources ??= busLayers.reduce((m, l) => m.set(l.key, [...new Set([...(m.get(l.key) ?? []), l.source])]), new Map());
  // The bus drawing for this zoom, once its streets can be drawn (model.js, busDrawingAt). Only its
  // lines change here; each drawing's labels hold their own zooms (style.js).
  const bus = busDrawingAt(zoom, busState, { ready: (set) => (busSources.get(`busLines${set}`) ?? []).every(drawable) });
  for (const [set, o] of Object.entries(bus.sets)) {
    const key = `busLines${set}`;
    if (busShown.get(key) !== o.lines) { map.setGlobalStateProperty(key, o.lines); busShown.set(key, o.lines); }
  }
  for (const l of busLayers) {
    const value = busShown.get(l.key);
    if (l.set !== value) { for (const [k, base] of l.plain) map.setPaintProperty(l.id, k, base * value); l.set = value; }
  }
  labelFrame = labels.frame.zoom;
  // A name changing side fades on a timer, and a drawing may wait to load: ask again next frame.
  if (labels.busy || bus.busy || rail.busy) schedule();
  updatedZoom = zoom;
  $('zoom').value = String(zoom);
  $('out').disabled = zoom <= MIN_ZOOM + 0.001;
  $('in').disabled = zoom >= MAX_ZOOM - 0.001;
  $('status').textContent = `Zoom ${zoom.toFixed(2)}`;
  timings.push(performance.now() - started);
  window.zoomState = { zoom, labelFrame, busSet: bus.set, railSet: rail.set, fading: labels.busy || bus.busy || rail.busy, updates: timings.length, lastUpdateMs: timings.at(-1) };
}

// Whether a source has something to draw on screen: its tiles for this zoom, or, while those
// load, the ones MapLibre stands in with from a zoom out. A source with no data counts as drawable.
function drawable(id) {
  const tiles = map.style?.tileManagers?.[id];
  if (!tiles) return map.isSourceLoaded(id);
  return !tiles.used || tiles.getRenderableIds().length > 0 || tiles.loaded();
}

function schedule() {
  if (!updatePending) { updatePending = true; requestAnimationFrame(update); }
}

function applyStyle() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]').content = PALETTES[theme].ground;
  $('theme').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  updatedZoom = null;
  busLayers = null;
  busSources = null;
  styleReady = false;
  busShown.clear();
  const ready = () => { styleReady = true; update(); setPick(picked); };
  map.once('style.load', ready);
  map.setStyle(previewStyle(theme, metadata, bundle, map.getCenter().toArray()));
}

try {
  [bundle, metadata] = await Promise.all([fetchJSON('../../data/zoom-prototype/trial.json'), fetchJSON('../../data/sheets.json')]);
  const asked = readView(location.hash);
  const center = asked?.center ?? metadata.hub;
  if (!center) throw new Error('The drawing has no opening station.');
  document.documentElement.dataset.theme = theme;
  map = new maplibregl.Map({ container: 'map', style: previewStyle(theme, metadata, bundle, center),
    center, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, asked?.zoom ?? 12)), minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM,
    dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0,
    attributionControl: false, maxTileCacheZoomLevels: 3 });
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.setMissingStyleImageResolver((id) => resolveImages(map, id));
  map.on('error', (e) => { errors.push(String(e.error?.message ?? e.message)); console.error(e.error ?? e); });
  map.on('zoom', schedule);
  map.on('idle', () => { if (updatedZoom === null || Math.abs(updatedZoom - map.getZoom()) > 1e-7) schedule(); });
  map.on('moveend', saveView);
  map.on('load', () => {
    styleReady = true;
    update(); setPick(picked);
    for (const id of ['theme', 'zoom', 'sweep']) $(id).disabled = false;
    window.zoomReady = true;
    // Shown once everything at the opening zoom has drawn (zoom.css), or after 10 s regardless.
    const reveal = () => { if (window.zoomShown) return; document.documentElement.dataset.ready = ''; window.zoomShown = performance.now(); };
    map.once('idle', reveal);
    setTimeout(reveal, 10000);
  });
  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures([[e.point.x - 7, e.point.y - 7], [e.point.x + 7, e.point.y + 7]]);
    const rail = hits.find((f) => ['rail', 'letter'].includes(f.properties.kind) && f.properties.route);
    const bus = hits.find((f) => f.properties.kind === 'bus' && f.properties.routes);
    if (rail) setPick({ mode: 'rail', route: rail.properties.route });
    else if (bus) {
      const routes = bus.properties.routes.split(/,\s*/);
      if (routes.length === 1) setPick({ mode: 'bus', route: routes[0] });
      else {
        setPick(null);
        $('card').hidden = false;
        $('selection').textContent = 'Choose a route on this street';
        for (const route of routes) {
          const button = document.createElement('button');
          button.textContent = route;
          button.onclick = () => setPick({ mode: 'bus', route });
          $('route-options').append(button);
        }
      }
    }
    else setPick(null);
  });
  $('clear').onclick = () => setPick(null);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setPick(null); });
  $('theme').onclick = () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    // Saved as the sheets save it, so the choice holds on the next visit to either.
    try { localStorage.setItem('rtd-sheets-theme', theme); } catch {}
    if (params.has('theme')) { params.set('theme', theme); history.replaceState(null, '', `?${params}${location.hash}`); }
    applyStyle();
  };
  $('zoom').oninput = () => { moving = false; map.jumpTo({ zoom: Number($('zoom').value) }); };
  $('out').onclick = () => map.easeTo({ zoom: Math.max(MIN_ZOOM, map.getZoom() - 1), duration: 700 });
  $('in').onclick = () => map.easeTo({ zoom: Math.min(MAX_ZOOM, map.getZoom() + 1), duration: 700 });
  $('sweep').onclick = async () => {
    if (moving) { moving = false; map.stop(); $('sweep').textContent = '▶'; $('sweep').ariaLabel = 'Play zoom'; return; }
    moving = true; $('sweep').textContent = '■'; $('sweep').ariaLabel = 'Stop zoom';
    for (const zoom of [MAX_ZOOM, MIN_ZOOM]) {
      if (!moving) break;
      await new Promise((resolve) => { map.once('moveend', resolve); map.easeTo({ zoom, duration: 1750 * Math.abs(map.getZoom() - zoom), easing: (t) => t }); });
    }
    moving = false; $('sweep').textContent = '▶'; $('sweep').ariaLabel = 'Play zoom';
  };
  window.zoomMap = map;
  window.zoomBundle = bundle;
  window.zoomErrors = errors;
  window.zoomTimings = timings;
  window.zoomSetPick = setPick;
  window.zoomTheme = (next) => { theme = next; applyStyle(); };
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = `The zoom preview could not load. ${error.message} Run npm run prototype:zoom to prepare its data, then reload.`;
  $('status').textContent = 'Preview unavailable';
  console.error(error);
}
