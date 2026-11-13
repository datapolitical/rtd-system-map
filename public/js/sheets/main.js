// The four sheets on a phone: one map that rests only at the sheets' zooms.
// Pinch or scroll and it goes to the next sheet that way; the buttons step.
import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { SHEETS, sheetData, sheetStyle } from './style.js';
import { settle } from './settle.js';

// Start the map's worker downloading while the two small files below load.
maplibregl.prewarm();

const scheme = matchMedia('(prefers-color-scheme: dark)');
const forced = new URLSearchParams(location.search).get('theme');
const theme = () => forced ?? (scheme.matches ? 'dark' : 'light');
const zooms = SHEETS.map((s) => s.zoom);

// Both at once: neither needs the other (index.html has already asked for them).
const [meta, { hub, stations } = {}] = await Promise.all([
  fetch(new URL('../../data/meta.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../../data/sheets.json', import.meta.url)).then((r) => r.json()).catch(() => ({})),
]);
const [[west, south], [east, north]] = meta.bounds.core;

// Only the sheet the page opens on loads first: the others are most of the page's weight and
// none of them shows until the reader zooms (DESIGN.md, "Quality floor"). The page opens at
// the widest sheet unless its address names a zoom (`#zoom/lat/lon`).
const asked = parseFloat(location.hash.slice(1));
const wanted = new Set([SHEETS[nearest(Number.isFinite(asked) ? asked : zooms[0])].id]);

const map = new maplibregl.Map({
  container: 'map',
  // The page opens on the hub, a little above the middle so the lines south of it show.
  style: sheetStyle(theme(), stations, wanted),
  center: hub ? [hub[0], hub[1] - 0.035] : [(west + east) / 2, (south + north) / 2],
  zoom: zooms[0],
  minZoom: zooms[0] - 0.6,
  maxZoom: zooms.at(-1) + 0.6,
  maxBounds: [[meta.bounds.routes[0][0] - 0.3, meta.bounds.routes[0][1] - 0.3], [meta.bounds.routes[1][0] + 0.3, meta.bounds.routes[1][1] + 0.3]],
  hash: true,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  attributionControl: false,
  fadeDuration: 0,
});
map.touchZoomRotate.disableRotation();
map.keyboard.disableRotation();
scheme.addEventListener('change', () => { if (!forced) map.setStyle(sheetStyle(theme(), stations, wanted)); });

// --- The other sheets, once the first is drawn ----------------------------------

// Hand a sheet's drawing to the map, if it hasn't had it.
function want(index) {
  const s = SHEETS[index];
  if (!s || wanted.has(s.id)) return;
  wanted.add(s.id);
  map.getSource(`sheet-${s.id}`)?.setData(sheetData(s.id));
}
// One at a time, nearest the sheet shown first, so each gets the whole connection and the one
// the reader will reach next comes soonest. A zoom asks for its sheet straight away (show).
function fillIn() {
  const next = SHEETS.map((_, i) => i).filter((i) => !wanted.has(SHEETS[i].id)).sort((a, b) => Math.abs(a - sheet) - Math.abs(b - sheet))[0];
  if (next === undefined) { window.sheetsAll = true; return; }
  const id = `sheet-${SHEETS[next].id}`;
  const done = (e) => {
    if (e.sourceId !== id || !map.isSourceLoaded(id)) return;
    map.off('sourcedata', done);
    fillIn();
  };
  map.on('sourcedata', done);
  want(next);
}

// --- Resting only on a sheet -------------------------------------------------

let sheet = nearest(map.getZoom());
function nearest(zoom) {
  return zooms.reduce((best, z, i) => (Math.abs(z - zoom) < Math.abs(zooms[best] - zoom) ? i : best), 0);
}
function show(index, around) {
  sheet = Math.max(0, Math.min(zooms.length - 1, index));
  want(sheet);
  map.easeTo({ zoom: zooms[sheet], around, duration: 380 }, { settling: true });
  for (const [i, dot] of [...document.querySelectorAll('#sheets i')].entries()) dot.classList.toggle('on', i === sheet);
  document.querySelector('#out').disabled = sheet === 0;
  document.querySelector('#in').disabled = sheet === zooms.length - 1;
}
// After a pinch or a scroll: on to the next sheet the way it was heading (settle.js). The
// page's own move to a sheet is marked, and every other zoom is the reader's: MapLibre does
// not say whose a zoom is on a single notch of a scroll wheel. A pinch has to be a little
// firmer than a scroll, so two fingers dragging the map do not change it.
let input = {};
map.getContainer().addEventListener('wheel', (e) => { input = { wheel: [e.clientX, e.clientY] }; }, { passive: true, capture: true });
map.getContainer().addEventListener('touchstart', () => { input = { touch: true }; }, { passive: true, capture: true });
let last = map.getZoom();
let began = null;
map.on('zoomstart', (e) => {
  // A pinch shows the next sheet before it ends: ask for the sheets either side now.
  want(sheet - 1);
  want(sheet + 1);
  if (!e.settling && began === null) began = last;
});
map.on('zoom', () => { last = map.getZoom(); });
map.on('zoomend', (e) => {
  if (e.settling || began === null) return;
  const to = settle(zooms, sheet, began, map.getZoom(), { least: input.touch ? 0.25 : 0.1 });
  began = null;
  // A scroll zooms about the pointer, and so does the rest of the way.
  const box = map.getContainer().getBoundingClientRect();
  show(to, input.wheel ? map.unproject([input.wheel[0] - box.left, input.wheel[1] - box.top]) : undefined);
});
map.doubleClickZoom.disable();
map.on('dblclick', (e) => show(sheet + 1, e.lngLat));
document.querySelector('#in').addEventListener('click', () => show(sheet + 1));
document.querySelector('#out').addEventListener('click', () => show(sheet - 1));
show(sheet);

// --- What is this? Tap a line, a station or a stop --------------------------------

const card = document.querySelector('#card');
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
function tell(title, note) {
  card.innerHTML = `<b>${title}</b>${note ? `<span>${esc(note)}</span>` : ''}`;
  card.hidden = false;
}
map.on('click', (e) => {
  const n = SHEETS[sheet].id;
  const reach = 9;
  const box = [[e.point.x - reach, e.point.y - reach], [e.point.x + reach, e.point.y + reach]];
  const hit = (ids) => map.queryRenderedFeatures(box, { layers: ids.map((id) => `${id}-${n}`).filter((id) => map.getLayer(id)) });
  const station = hit(['station', 'name'])[0];
  if (station) return tell(esc(station.properties.name), `Rail station · ${String(station.properties.lines).split(' ').join(', ')}`);
  const rail = [...new Map(hit(['rail']).map((f) => [f.properties.route, f.properties])).values()];
  if (rail.length) {
    const bullets = rail.map((r) => `<i style="background:${esc(r.color)};color:${esc(inkOn(r.color))}">${esc(r.route)}</i>`).join('');
    return tell(`${bullets}${rail.length > 1 ? 'Lines' : 'Line'}`, 'Rail');
  }
  const stop = hit(['stop'])[0];
  if (stop) return tell(esc(stop.properties.name), `Bus stop · ${stop.properties.heading ?? ''} · ${stop.properties.routes}`.replace(' ·  · ', ' · '));
  const bus = hit(['bus']).sort((a, b) => b.properties.n - a.properties.n)[0];
  if (bus) {
    const q = bus.properties;
    return tell(`${q.n > 1 ? 'Routes' : 'Route'} ${esc(q.routes)}`, q.hw ? `A bus about every ${Math.round(q.hw)} minutes on this street, weekday midday` : 'Bus');
  }
  card.hidden = true;
});
map.on('dragstart', () => { card.hidden = true; });
function inkOn(color) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(String(color).slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#10151d' : '#ffffff';
}

// The opening view is drawn: then the other sheets (sheetsAll once they all have).
map.once('idle', () => { window.sheetsReady = true; fillIn(); });
window.sheetsMap = map;
