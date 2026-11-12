// The four sheets on a phone: one map that rests only at the sheets' zooms.
// Pinch or scroll and it settles on the nearest sheet; the buttons step.
import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { SHEETS, sheetStyle } from './style.js';

const scheme = matchMedia('(prefers-color-scheme: dark)');
const forced = new URLSearchParams(location.search).get('theme');
const theme = () => forced ?? (scheme.matches ? 'dark' : 'light');
const zooms = SHEETS.map((s) => s.zoom);

const meta = await fetch(new URL('../../data/meta.json', import.meta.url)).then((r) => r.json());
const [[west, south], [east, north]] = meta.bounds.core;
// The page opens on the hub, a little above the middle so the lines south of it show.
const { hub, stations } = await fetch(new URL('../../data/sheets.json', import.meta.url)).then((r) => r.json()).catch(() => ({}));

const map = new maplibregl.Map({
  container: 'map',
  style: sheetStyle(theme(), stations),
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
scheme.addEventListener('change', () => { if (!forced) map.setStyle(sheetStyle(theme(), stations)); });

// --- Resting only on a sheet -------------------------------------------------

let sheet = nearest(map.getZoom());
function nearest(zoom) {
  return zooms.reduce((best, z, i) => (Math.abs(z - zoom) < Math.abs(zooms[best] - zoom) ? i : best), 0);
}
function show(index, around) {
  sheet = Math.max(0, Math.min(zooms.length - 1, index));
  map.easeTo({ zoom: zooms[sheet], around, duration: 380 });
  for (const [i, dot] of [...document.querySelectorAll('#sheets i')].entries()) dot.classList.toggle('on', i === sheet);
  document.querySelector('#out').disabled = sheet === 0;
  document.querySelector('#in').disabled = sheet === zooms.length - 1;
}
// After a pinch or a scroll: a third of the way to the next sheet is enough to go there.
let settling = false;
map.on('zoomend', (e) => {
  if (settling || !e.originalEvent) return;
  const off = map.getZoom() - zooms[sheet];
  const step = (zooms[1] - zooms[0]) / 3;
  settling = true;
  show(Math.abs(off) < step ? sheet : nearest(map.getZoom() + Math.sign(off) * step));
  map.once('moveend', () => { settling = false; });
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

map.once('idle', () => { window.sheetsReady = true; });
window.sheetsMap = map;
