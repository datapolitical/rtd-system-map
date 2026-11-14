// The four sheets on a phone: one map that rests only at the sheets' zooms.
// Pinch or scroll and it goes to the next sheet that way; the buttons step.
import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { SHEETS, sheetData, sheetStyle, PALETTES, GROUP } from './style.js';
import { pickFrom, routeList } from './pick.js';
import { settle } from './settle.js';
import { readView, writeView, drawsRoute } from './address.js';
import { routeName, sheetName, pickSaid, cardSaid, inkOn } from './say.js';

// Start the map's worker downloading while the two small files below load.
maplibregl.prewarm();
// Room to list every file and tile the first visit fetches, for the offline cache (sw.js, below).
performance.setResourceTimingBufferSize?.(2000);

const scheme = matchMedia('(prefers-color-scheme: dark)');
const forced = new URLSearchParams(location.search).get('theme');
const theme = () => forced ?? (scheme.matches ? 'dark' : 'light');
const zooms = SHEETS.map((s) => s.zoom);

// Both at once: neither needs the other (index.html has already asked for them).
const [meta, { hub, stations, colors } = {}] = await Promise.all([
  fetch(new URL('../../data/meta.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../../data/sheets.json', import.meta.url)).then((r) => r.json()).catch(() => ({})),
]);
const [[west, south], [east, north]] = meta.bounds.core;

// Only the sheet the page opens on loads first: the others are most of the page's weight and
// none of them shows until the reader zooms (DESIGN.md, "Quality floor"). The page opens at
// the widest sheet unless its address names another (address.js: `#zoom/lat/lon/mode/route`).
// An address that names no view, or a centre off the map, opens the page as a plain visit does.
const [[minLon, minLat], [maxLon, maxLat]] = meta.bounds.routes;
const onMap = (c) => c && c[0] >= minLon - 0.3 && c[0] <= maxLon + 0.3 && c[1] >= minLat - 0.3 && c[1] <= maxLat + 0.3;
const asked = ((v) => (v && v.center && !onMap(v.center) ? null : v))(readView(location.hash));
const start = nearest(asked?.zoom ?? zooms[0]);
const wanted = new Set([SHEETS[start].id]);
// The page opens on the hub, a little above the middle so the lines south of it show.
const home = hub ? [hub[0], hub[1] - 0.035] : [(west + east) / 2, (south + north) / 2];

const map = new maplibregl.Map({
  container: 'map',
  style: sheetStyle(theme(), stations, colors, wanted),
  center: asked?.center ?? home,
  zoom: zooms[start],
  minZoom: zooms[0] - 0.6,
  maxZoom: zooms.at(-1) + 0.6,
  maxBounds: [[minLon - 0.3, minLat - 0.3], [maxLon + 0.3, maxLat + 0.3]],
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  attributionControl: false,
  fadeDuration: 0,
  // What a screen reader calls the map (#14). Its canvas takes focus, and Tab moves on from it.
  locale: { 'Map.Title': 'Map of RTD bus and rail service. Tap a line, a station or a stop to hear what it is' },
  // Room in the cache for every sheet's tiles around the view (warm, below), as well as the
  // tiles of the places just looked at.
  maxTileCacheZoomLevels: 12,
});
map.touchZoomRotate.disableRotation();
map.keyboard.disableRotation();
// A new theme is a new style; the picked route is set on it again (pick, below).
scheme.addEventListener('change', () => {
  if (forced) return;
  map.setStyle(sheetStyle(theme(), stations, colors, wanted));
  map.once('styledata', () => setPick(picked));
});

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

// --- The other sheets' tiles, before the reader steps ------------------------------

// MapLibre makes a sheet's tiles only once the zoom reaches that sheet, so the first step to
// each sheet showed bare ground for a moment (black in the dark theme) until they came. While
// the map rests, every other sheet's tiles for this view are made and put in its cache, where
// a step finds them. This reaches into MapLibre's tile managers: it has no way to ask for
// another zoom's tiles. If they change, nothing breaks; the flash only comes back.
const ready = new Set(wanted); // sheets whose drawing the map has, not the empty stand-in
map.on('sourcedata', (e) => {
  const n = Number(/^sheet-(\d+)$/.exec(e.sourceId ?? '')?.[1]);
  if (e.sourceDataType !== 'content' || !wanted.has(n)) return;
  ready.add(n);
  tried.delete(map.style?.tileManagers?.[e.sourceId]); // new data empties the source's cache
});
let tried = new WeakMap(); // tile manager -> tiles asked for while the map has rested here
map.on('movestart', () => { tried = new WeakMap(); });
function warm() {
  const managers = map.style?.tileManagers;
  const sample = managers?.ground?.getTileByID(managers.ground.getIds()[0] ?? '');
  if (!sample) return;
  const [Tile, TileID] = [sample.constructor, sample.tileID.constructor];
  // A step passes through every whole zoom between two sheets, and at each one the sheet whose
  // band it is in shows, drawn from that zoom's tiles. All of them, nearest the map's first.
  const here = map.getZoom();
  const levels = [];
  for (let t = zooms[0]; t <= zooms.at(-1); t++) levels.push(t);
  levels.sort((a, b) => Math.abs(a - here) - Math.abs(b - here));
  for (const t of levels) {
    const s = SHEETS.findLast((sh, i) => !i || sh.zoom - 1 <= t);
    for (const id of ['ground', ...(ready.has(s.id) ? [`sheet-${s.id}`] : [])]) {
      const tm = managers[id];
      const source = tm?.getSource();
      if (!source?.loadTile || !tm._outOfViewCache) continue;
      if (!tried.has(tm)) tried.set(tm, new Set());
      for (const [over, z, x, y] of cover(source, t)) {
        const tileID = new TileID(over, 0, z, x, y);
        if (tried.get(tm).has(tileID.key) || tm.getTileByID(tileID.key) || tm._outOfViewCache.has(tileID)) continue;
        tried.get(tm).add(tileID.key);
        // Made apart from the tiles in view, which the map's tidying would drop half-loaded,
        // then put in the cache that a step takes its tiles from.
        const tile = new Tile(tileID, source.tileSize * tileID.overscaleFactor());
        Promise.resolve(source.loadTile(tile)).then(() => {
          if (tile.hasData() && !tm.getTileByID(tileID.key) && !tm._outOfViewCache.has(tileID) && map.style?.tileManagers?.[id] === tm) {
            tm._outOfViewCache.add(tileID, tile, tile.getExpiryTimeout());
          } else source.unloadTile?.(tile);
        }, () => {});
      }
    }
  }
}
// The tiles a source draws a view at `zoom` from, about the map's centre, as MapLibre picks
// them for a map that is never tilted or turned: [overscaled zoom, zoom, x, y].
function cover(source, zoom) {
  const want = Math.floor(zoom + Math.log2(512 / (source.tileSize || 512)));
  const z = Math.max(source.minzoom ?? 0, Math.min(want, source.maxzoom ?? want));
  const over = z === source.maxzoom ? Math.max(z, want) : z;
  const n = 2 ** z;
  const size = (512 * 2 ** zoom) / n; // a tile's width on screen at that zoom
  const { lng, lat } = map.getCenter();
  const cx = ((lng + 180) / 360) * n;
  const cy = ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * n;
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const tiles = [];
  for (let x = Math.floor(cx - w / 2 / size); x <= Math.floor(cx + w / 2 / size); x++) {
    for (let y = Math.max(0, Math.floor(cy - h / 2 / size)); y <= Math.min(n - 1, Math.floor(cy + h / 2 / size)); y++) tiles.push([over, z, x, y]);
  }
  return tiles;
}
map.on('idle', warm);

// --- Resting only on a sheet -------------------------------------------------

let sheet = nearest(map.getZoom());
function nearest(zoom) {
  return zooms.reduce((best, z, i) => (Math.abs(z - zoom) < Math.abs(zooms[best] - zoom) ? i : best), 0);
}
// A screen reader hears what changed (#14): a sheet, a card, a pick. Cleared first, so the same
// words said twice are said again.
const voice = document.querySelector('#say');
let quiet = 0;
function say(text) {
  if (!voice) return;
  voice.textContent = '';
  clearTimeout(quiet);
  quiet = setTimeout(() => { voice.textContent = text; }, 60);
}
function show(index, around) {
  const was = sheet;
  sheet = Math.max(0, Math.min(zooms.length - 1, index));
  const dots = document.querySelector('#sheets');
  dots.setAttribute('aria-label', sheetName(sheet, zooms.length));
  if (sheet !== was) say(sheetName(sheet, zooms.length));
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
// A double tap or double click shows the next sheet, about the point tapped. MapLibre's own
// handlers recognise it (Safari never makes a dblclick of a double tap); the one-level step
// they start is turned into the move to the next sheet straight away, so the map makes one
// move, not two.
map.on('zoomstart', (e) => {
  const o = e.originalEvent;
  if (e.settling || !o || !['touchend', 'dblclick'].includes(o.type)) return;
  const p = o.changedTouches?.[0] ?? o;
  const box = map.getContainer().getBoundingClientRect();
  const around = map.unproject([p.clientX - box.left, p.clientY - box.top]);
  began = null;
  requestAnimationFrame(() => show(sheet + 1, around));
});
document.querySelector('#in').addEventListener('click', () => show(sheet + 1));
document.querySelector('#out').addEventListener('click', () => show(sheet - 1));
show(sheet);

// --- What is this? Tap a line, a station or a stop --------------------------------
// The card names what is under the finger; each route on it is a button, and picking one
// highlights that route on every sheet, the rest faded (style.js, PICKED). A tap on empty
// ground clears both.

const card = document.querySelector('#card');
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
let picked = null; // { mode: 'bus' | 'rail', route }
let shown = null; // what the card names: { title, note, routes: [{ mode, route, color }] }
function setPick(p) {
  picked = p;
  map.setGlobalStateProperty('bus', p?.mode === 'bus' ? p.route : '');
  map.setGlobalStateProperty('rail', p?.mode === 'rail' ? p.route : '');
  window.sheetsPick = p;
  document.documentElement.classList.toggle('picked', !!p);
  remember();
}
function chip(r) {
  const on = picked?.mode === r.mode && picked.route === r.route;
  const look = r.mode === 'rail' ? ` style="background:${esc(r.color)};color:${esc(inkOn(r.color))}"` : '';
  return `<button type="button" class="${r.mode}" data-mode="${r.mode}" data-route="${esc(r.route)}" aria-label="${esc(routeName(r))}" aria-pressed="${on}"${look}>${esc(r.route)}</button>`;
}
// A stop group's rows ("X 1 15 | Y 10 28", scripts/lib/sheets.mjs, groupRows): each letter in a
// square like the map's, then its routes, each one a button like the card's other routes.
const groupList = (rows) => String(rows ?? '').split(' | ').filter(Boolean).map((row) => {
  const [letter, ...routes] = row.split(' ');
  return { letter, routes: routes.filter(Boolean).map((route) => ({ mode: 'bus', route })) };
});
const routesOf = (what) => [...(what.routes ?? []), ...(what.groups ?? []).flatMap((g) => g.routes)];
function hintFor(routes) {
  if (!routes.length) return '';
  return picked && routes.some((r) => r.mode === picked.mode && r.route === picked.route) ? 'Tap empty ground to clear' : `Tap ${routes.length > 1 ? 'a route' : 'it'} to show its whole way`;
}
function tell(what) {
  shown = what;
  const { title, note, lead, groups = [] } = what;
  const routes = routesOf(what);
  const hint = hintFor(routes);
  // Each letter is said as its stop ("Stop A"), then its routes.
  const rows = groups.length ? `<div class="rows">${groups.map((g) => `<i><span class="sr">Stop </span>${esc(g.letter)}</i><div class="routes">${g.routes.map(chip).join('')}</div>`).join('')}</div>` : '';
  const list = what.routes?.length ? `${what.also ? `<span>${esc(what.also)}</span>` : ''}<div class="routes">${what.routes.map(chip).join('')}</div>` : '';
  // A plain card says what it is before its routes; a stop-group card leads with its letters.
  const said = note ? `<span>${esc(note)}</span>` : '';
  card.innerHTML = `<b id="card-title" role="heading" aria-level="2">${title}</b>${lead ? `<span>${esc(lead)}</span>` : ''}${groups.length ? '' : said}${rows}${list}${groups.length ? said : ''}<span class="hint">${hint}</span>`
    + '<button type="button" class="close" aria-label="Close">\u00d7</button>';
  card.hidden = false;
  say(cardSaid({ title: card.querySelector('#card-title').textContent, note, lead, routes }));
}
// Closing the card is a tap on empty ground: the card goes, and so does a pick.
function close({ focus = false } = {}) {
  if (card.hidden) return;
  card.hidden = true;
  shown = null;
  if (picked) { setPick(null); say(pickSaid(null)); }
  if (focus) map.getCanvas().focus({ preventScroll: true });
}
card.addEventListener('click', (e) => {
  if (e.target.closest('button.close')) return close({ focus: true });
  const b = e.target.closest('button[data-route]');
  if (!b) return;
  const p = { mode: b.dataset.mode, route: b.dataset.route };
  setPick(picked?.mode === p.mode && picked.route === p.route ? null : p);
  say(pickSaid(picked));
  // Changed in place, so the button pressed keeps its focus (and a screen reader its place).
  for (const other of card.querySelectorAll('button[data-route]')) {
    other.setAttribute('aria-pressed', String(picked?.mode === other.dataset.mode && picked.route === other.dataset.route));
  }
  if (shown) card.querySelector('.hint').textContent = hintFor(routesOf(shown));
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close({ focus: card.contains(document.activeElement) }); });
// Each line's colour, as the sheets draw it (a station lists its lines by letter only).
const colorOf = new Map();
map.on('idle', () => {
  for (const f of map.querySourceFeatures(`sheet-${SHEETS[sheet].id}`, { filter: ['==', ['get', 'kind'], 'rail'] })) colorOf.set(f.properties.route, f.properties.color);
});
const rails = (list) => list.map((route) => ({ mode: 'rail', route, color: colorOf.get(route) ?? '#888888' }));
const buses = (text) => routeList(text).map((route) => ({ mode: 'bus', route }));
map.on('click', (e) => {
  const n = SHEETS[sheet].id;
  const reach = 9;
  const box = [[e.point.x - reach, e.point.y - reach], [e.point.x + reach, e.point.y + reach]];
  const hit = (ids) => map.queryRenderedFeatures(box, { layers: ids.map((id) => `${id}-${n}`).filter((id) => map.getLayer(id)) });
  for (const f of hit(['rail', 'letter'])) if (f.properties.color) colorOf.set(f.properties.route, f.properties.color);
  // RTD's stop groups first: a table, a lettered stop, or a street whose stops are lettered lists
  // its routes by the letter of the stop each one uses.
  const table = hit(['group-area'])[0]?.properties;
  if (table) return tell({ title: esc(table.title), lead: 'Each stop serves the routes of its letter', groups: groupList(table.rows) });
  const station = hit(['station', 'name'])[0]?.properties;
  const lettered = station ? null : hit(['group-stop', 'stop-letter'])[0]?.properties;
  if (lettered?.letter) {
    return tell({ title: esc(lettered.name), note: `Bus stop ${lettered.letter}${lettered.heading ? ` · ${lettered.heading}` : ''}`,
      groups: groupList(`${lettered.letter} ${routeList(lettered.routes).join(' ')}`) });
  }
  const bus = hit(['bus', 'pick-bus']).map((f) => f.properties).sort((a, b) => b.n - a.n)[0];
  const what = pickFrom({
    station,
    letter: hit(['letter'])[0]?.properties,
    rail: [...new Map(hit(['rail']).map((f) => [f.properties.route, f.properties])).values()],
    stop: hit(['stop'])[0]?.properties,
    label: hit(['bus-number', 'bus-stack'])[0]?.properties,
    bus,
  });
  if (!what) {
    card.hidden = true;
    shown = null;
    if (picked) say(pickSaid(null));
    setPick(null);
    return;
  }
  if (what.bus === bus?.routes && bus?.groups) {
    return tell({ title: esc(bus.street), lead: 'Routes by the letter of their stop', groups: groupList(bus.groups),
      routes: buses(bus.others ?? ''), also: bus.others ? 'Also on this street' : '', note: what.note === 'Bus' ? '' : what.note });
  }
  tell({ title: what.title, note: what.note, routes: [...rails(what.rail ?? []), ...buses(what.bus ?? '')] });
});
map.on('dragstart', () => { card.hidden = true; });

// --- The address is the share link (address.js) ----------------------------------
// It holds the sheet, the centre and the picked route, rewritten in place as the map comes to
// rest: no history entry per move, so Back still leaves the page. Opening it shows the same view.

// A plain visit keeps its plain address until the view changes: it is the opening view, and the
// loading picture is fetched early only for an address without one (index.html).
const opening = writeView({ zoom: zooms[0], center: home });
function remember() {
  const hash = writeView({ zoom: zooms[sheet], center: map.getCenter().toArray(), pick: picked });
  if (hash === location.hash || (!location.hash && hash === opening)) return;
  history.replaceState(history.state, '', hash);
}
map.on('moveend', remember);
// An address edited in place, or a link to this page followed from itself.
addEventListener('hashchange', () => {
  const v = readView(location.hash);
  if (!v || (v.center && !onMap(v.center))) return;
  if (v.center) map.jumpTo({ center: v.center });
  show(nearest(v.zoom));
  setPick(v.pick);
});
// A picked route the address names is set once the map has its style, and kept only if the
// sheets still draw it: an old link to a route RTD has dropped opens on the plain map. Sheet 2
// draws every route; its file is read as text, not parsed, from the browser's cache.
if (asked?.pick) {
  const check = fetch(sheetData(2)).then((r) => (r.ok ? r.text() : '')).then((text) => drawsRoute(text, asked.pick), () => true);
  map.once('load', async () => {
    setPick(asked.pick);
    if (!(await check) && picked === asked.pick) setPick(null);
  });
}

// --- The picture shown while the map loads (index.html, #poster) -----------------

// It goes once the map has drawn the same view, fading so the few labels the two place
// differently near the screen's edges change softly. A step the reader takes before then
// clears it at once: the map is moving away from the view it shows.
const poster = document.querySelector('#poster');
function reveal() {
  if (!poster?.isConnected || poster.classList.contains('gone')) return;
  poster.classList.add('gone');
  poster.setAttribute('aria-hidden', 'true');
  setTimeout(() => poster.remove(), 300);
}
for (const button of document.querySelectorAll('#steps button')) button.addEventListener('click', reveal);
// A pinch, drag or double tap reaches the map through the picture (index.html), and moves it.
map.on('movestart', (e) => { if (e.originalEvent) reveal(); });

// The opening view is drawn: then the other sheets (sheetsAll once they all have).
map.once('idle', () => { window.sheetsReady = true; reveal(); fillIn(); });

// --- Offline (sw.js) ------------------------------------------------------------------
// Asked for only once the opening view is drawn, so it never slows it (DESIGN.md, "Quality
// floor"). On the first visit the files already fetched are handed to it to keep; from then on
// it sees every request itself.
//
// Not quite every request on that first visit: the map's drawing worker was started before the
// service worker existed, so what it fetches (each sheet's drawing and the basemap's tiles) never
// passes through the service worker, and the page's list of what it fetched doesn't hold it
// either (#133). So the page names those itself: every sheet's drawing, and the basemap tiles
// of each sheet around every view the map rests at, until the visit ends.
const firstVisit = 'serviceWorker' in navigator && !navigator.serviceWorker.controller;
// The basemap tiles every sheet draws this view from: the ones in view and the ones warm() makes.
function groundTiles() {
  const source = map.getSource('ground');
  const template = source?.tiles?.[0];
  if (!template) return [];
  const urls = new Set();
  const add = (z, x, y) => urls.add(template.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  for (const key of map.style?.tileManagers?.ground?.getIds() ?? []) {
    const c = map.style.tileManagers.ground.getTileByID(key)?.tileID?.canonical;
    if (c) add(c.z, c.x, c.y);
  }
  for (let t = zooms[0]; t <= zooms.at(-1); t++) for (const [, z, x, y] of cover(source, t)) add(z, x, y);
  return [...urls];
}
if ('serviceWorker' in navigator) {
  map.once('idle', async () => {
    try {
      await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), { scope: new URL('../../', import.meta.url).pathname });
      const reg = await navigator.serviceWorker.ready;
      let sent = 0;
      const hand = (more = []) => {
        const entries = performance.getEntriesByType('resource');
        const urls = [new URL('../../', import.meta.url).href, ...entries.slice(sent).map((e) => e.name), ...more];
        sent = entries.length;
        reg.active?.postMessage({ type: 'keep', urls });
      };
      hand(firstVisit ? [...SHEETS.map((s) => sheetData(s.id)), ...groundTiles()] : []);
      // What came in between, until the worker sees requests itself.
      if (!navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', () => hand(), { once: true });
      // The drawing worker never comes under it on this visit, so the tiles of each new view are named too.
      if (firstVisit) map.on('idle', () => hand(groundTiles()));
    } catch { /* no offline copy: the page works as before */ }
  });
}

// --- The stop-group tables' plates and letter squares (style.js, GROUP) -------------

// Drawn here, in the theme's colours, the first time the map asks for one: a plate of the
// size the build laid its table out at, a letter's square, a letter's square on its street (with
// a rim of ground), or a lettered stop's square. At
// least twice the screen's pixels, so their edges stay crisp.
const ratio = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
function groupImage(id) {
  const m = /^stopgroup-(plate|badge|street|stop)-(light|dark)(?:-(\d+)x(\d+))?$/.exec(id);
  if (!m) return null;
  const c = PALETTES[m[2]];
  const square = { badge: GROUP.badge, street: GROUP.badge + 2 * GROUP.streetRim, stop: GROUP.stopBadge + 2 * GROUP.stopRim }[m[1]];
  const [w, h] = m[1] === 'plate' ? [Number(m[3]), Number(m[4])] : [square, square];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.beginPath();
  if (m[1] === 'plate') {
    ctx.roundRect(0.5, 0.5, w - 1, h - 1, GROUP.corner - 0.5);
    ctx.fillStyle = c.ground;
    ctx.fill();
    ctx.globalAlpha = GROUP.edge;
    ctx.strokeStyle = c.number;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (m[1] === 'badge') {
    ctx.roundRect(0, 0, w, h, GROUP.badgeCorner);
    ctx.fillStyle = c.number;
    ctx.fill();
  } else {
    const rim = m[1] === 'street' ? GROUP.streetRim : GROUP.stopRim;
    ctx.roundRect(0, 0, w, h, GROUP.badgeCorner + rim);
    ctx.fillStyle = c.ground;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(rim, rim, w - 2 * rim, h - 2 * rim, GROUP.badgeCorner);
    ctx.fillStyle = m[1] === 'street' ? c.number : c.stop;
    ctx.fill();
  }
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
map.setMissingStyleImageResolver((id) => {
  const image = !map.hasImage(id) && groupImage(id);
  if (image) map.addImage(id, image, { pixelRatio: ratio });
});
window.sheetsMap = map;
