import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { readView, writeView } from '../sheets/address.js';
import { PALETTES } from '../sheets/style.js';
import { MIN_ZOOM, MAX_ZOOM, attachedCollection, labelsAt } from './model.js';
import { previewStyle } from './style.js';
import { resolveImages } from './images.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let theme = params.get('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
if (!['light', 'dark'].includes(theme)) theme = 'light';
let picked = readView(location.hash)?.pick ?? null;
let map, bundle, metadata, labelFrame;
let updatePending = false;
let moving = false;
let updatedZoom = null;
const labelState = { sides: new Map(), fades: new Map() };
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
  // While a source is still taking the last update, try again next frame rather than drop it.
  if (!map.isStyleLoaded()) { schedule(); return; }
  const started = performance.now();
  const zoom = map.getZoom();
  // Only the small rail-symbol sources change during a zoom; the rail and bus drawings stay cached.
  // Line letters appear as the zoom reaches them and stay for every closer zoom.
  const shown = { ...bundle.attached, features: bundle.attached.features.filter((f) => !(f.properties.minzoom > zoom + 1e-9)) };
  map.getSource('trial-attached').setData(attachedCollection(shown, bundle.sizes, zoom));
  const labels = labelsAt(bundle.frames, zoom, bundle.sizes, labelState, performance.now(), { motion: !calm.matches });
  map.getSource('trial-labels').setData(labels.collection);
  labelFrame = labels.frame.zoom;
  // A name changing side fades on a timer, so keep drawing until it has finished.
  if (labels.busy) schedule();
  updatedZoom = zoom;
  $('zoom').value = String(zoom);
  $('out').disabled = zoom <= MIN_ZOOM + 0.001;
  $('in').disabled = zoom >= MAX_ZOOM - 0.001;
  $('status').textContent = `Zoom ${zoom.toFixed(2)}`;
  timings.push(performance.now() - started);
  window.zoomState = { zoom, labelFrame, fading: labels.busy, updates: timings.length, lastUpdateMs: timings.at(-1) };
}

function schedule() {
  if (!updatePending) { updatePending = true; requestAnimationFrame(update); }
}

function applyStyle() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]').content = PALETTES[theme].ground;
  $('theme').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  updatedZoom = null;
  const ready = () => { update(); setPick(picked); };
  map.once('style.load', ready);
  map.setStyle(previewStyle(theme, metadata, bundle));
}

try {
  [bundle, metadata] = await Promise.all([fetchJSON('../../data/zoom-prototype/trial.json'), fetchJSON('../../data/sheets.json')]);
  const asked = readView(location.hash);
  const center = asked?.center ?? metadata.hub;
  if (!center) throw new Error('The drawing has no opening station.');
  document.documentElement.dataset.theme = theme;
  map = new maplibregl.Map({ container: 'map', style: previewStyle(theme, metadata, bundle),
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
  $('sweep').onclick = async () => {
    if (moving) { moving = false; map.stop(); $('sweep').textContent = '▶'; $('sweep').ariaLabel = 'Play zoom'; return; }
    moving = true; $('sweep').textContent = '■'; $('sweep').ariaLabel = 'Stop zoom';
    for (const zoom of [12, 14, 12]) {
      if (!moving) break;
      await new Promise((resolve) => { map.once('moveend', resolve); map.easeTo({ zoom, duration: 3500, easing: (t) => t }); });
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
