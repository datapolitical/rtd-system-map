import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { readView, writeView } from '../sheets/address.js';
import { PALETTES } from '../sheets/style.js';
import { MIN_ZOOM, MAX_ZOOM, attachedCollection, frameAt } from './model.js';
import { previewStyle } from './style.js';
import { resolveImages } from './images.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let theme = params.get('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
if (!['light', 'dark'].includes(theme)) theme = 'light';
let mode = params.get('mode') === 'drawn' ? 'drawn' : 'offset';
let picked = readView(location.hash)?.pick ?? null;
let map, bundle, metadata, drawingFrame, labelFrame;
let updatePending = false;
let moving = false;
let updatedZoom = null;
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
  if (!map.isStyleLoaded()) return;
  const started = performance.now();
  const zoom = map.getZoom();
  const frame = frameAt(bundle.frames, zoom);
  const drawn = frameAt(bundle.frames, zoom, 0.5);
  if (mode === 'drawn' && drawingFrame !== drawn.zoom) {
    map.getSource('trial-rail').setData({ type: 'FeatureCollection', features: drawn.drawn.features.filter((f) => f.properties.kind === 'rail') });
    drawingFrame = drawn.zoom;
  }
  const marks = mode === 'offset' ? attachedCollection(bundle.attached, bundle.sizes, zoom)
    : { type: 'FeatureCollection', features: drawn.drawn.features.filter((f) => f.properties.kind !== 'rail') };
  // Only the small rail-symbol sources change during a zoom; the bus drawings stay cached.
  map.getSource('trial-attached').setData(marks);
  map.getSource('trial-labels').setData(mode === 'offset' ? attachedCollection(frame.labels, bundle.sizes, zoom) : frame.labels);
  labelFrame = frame.zoom;
  updatedZoom = zoom;
  $('zoom').value = String(zoom);
  $('out').disabled = zoom <= MIN_ZOOM + 0.001;
  $('in').disabled = zoom >= MAX_ZOOM - 0.001;
  $('status').textContent = `Zoom ${zoom.toFixed(2)} · ${zoom < 13 ? 'wider' : 'closer'} street detail`;
  timings.push(performance.now() - started);
  window.zoomState = { zoom, mode, drawingFrame, labelFrame, updates: timings.length, lastUpdateMs: timings.at(-1) };
}

function schedule() {
  if (!updatePending) { updatePending = true; requestAnimationFrame(update); }
}

function applyStyle() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]').content = PALETTES[theme].ground;
  $('theme').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  drawingFrame = null;
  updatedZoom = null;
  const ready = () => { update(); setPick(picked); };
  map.once('style.load', ready);
  map.setStyle(previewStyle(theme, metadata, bundle, mode));
}

try {
  [bundle, metadata] = await Promise.all([fetchJSON('../../data/zoom-prototype/trial.json'), fetchJSON('../../data/sheets.json')]);
  const asked = readView(location.hash);
  const center = asked?.center ?? metadata.hub;
  if (!center) throw new Error('The drawing has no opening station.');
  document.documentElement.dataset.theme = theme;
  map = new maplibregl.Map({ container: 'map', style: previewStyle(theme, metadata, bundle, mode),
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
    update(); setPick(picked);
    for (const id of ['theme', 'zoom', 'sweep']) $(id).disabled = false;
    window.zoomReady = true;
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
  $('theme').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; params.set('theme', theme); history.replaceState(null, '', `?${params}${location.hash}`); applyStyle(); };
  $('zoom').oninput = () => { moving = false; map.jumpTo({ zoom: Number($('zoom').value) }); };
  $('out').onclick = () => map.easeTo({ zoom: Math.max(MIN_ZOOM, map.getZoom() - 1), duration: 700 });
  $('in').onclick = () => map.easeTo({ zoom: Math.min(MAX_ZOOM, map.getZoom() + 1), duration: 700 });
  for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => {
    mode = b.dataset.mode; params.set('mode', mode); history.replaceState(null, '', `?${params}${location.hash}`); applyStyle();
  };
  $('sweep').onclick = async () => {
    if (moving) { moving = false; map.stop(); $('sweep').textContent = 'Play zoom'; return; }
    moving = true; $('sweep').textContent = 'Stop zoom';
    for (const zoom of [12, 14, 12]) {
      if (!moving) break;
      await new Promise((resolve) => { map.once('moveend', resolve); map.easeTo({ zoom, duration: 3500, easing: (t) => t }); });
    }
    moving = false; $('sweep').textContent = 'Play zoom';
  };
  window.zoomMap = map;
  window.zoomBundle = bundle;
  window.zoomErrors = errors;
  window.zoomTimings = timings;
  window.zoomSetPick = setPick;
  window.zoomMode = (next) => { mode = next; applyStyle(); };
  window.zoomTheme = (next) => { theme = next; applyStyle(); };
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = `The zoom preview could not load. ${error.message} Run npm run prototype:zoom to prepare its data, then reload.`;
  $('status').textContent = 'Preview unavailable';
  console.error(error);
}
