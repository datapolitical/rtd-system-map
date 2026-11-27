// The four sheets on a phone: one map that rests only at the sheets' zooms.
// Pinch or scroll and it goes to the next sheet that way; the buttons step.
import * as maplibregl from '../../vendor/maplibre-gl.mjs';
import { SHEETS, OPENING, LOWEST, HIGHEST, edge, tilesUrl, TILE_LAYER, sheetStyle, PALETTES, GROUP, GROUP_INK, PLACE_SIZE, PLACE_MAJOR_RANK, expressInk, airportInk, shortStreet } from './style.js';
import { pickFrom, pickCard, routeList } from './pick.js';
import { settle } from './settle.js';
import { readView, writeView, drawsRoute } from './address.js';
import { routeName, sheetName, pickSaid, cardSaid, inkOn } from './say.js';
import { clearPoint } from './view.js';

// Start the map's worker downloading while the two small files below load. With ?timing, the
// worker carries a stopwatch (timing.js sets the address).
if (window.timingWorker) maplibregl.setWorkerUrl(window.timingWorker);
maplibregl.prewarm();
// Room to list every file and tile the first visit fetches, for the offline cache (sw.js, below).
performance.setResourceTimingBufferSize?.(2000);

const scheme = matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;
let manualTheme = root.dataset.themeManual === 'true';
const theme = () => root.dataset.theme ?? (scheme.matches ? 'dark' : 'light');
// The zoom each sheet is drawn for: what an address says, whatever the screen.
const zooms = SHEETS.map((s) => s.zoom);

// Both at once: neither needs the other (index.html has already asked for them).
const [meta, { hub, stations, colors, drawing, district, frame: wholeFrame, groups: stopGroups = [], lists = {}, routes: drawnRoutes = null } = {}] = await Promise.all([
  fetch(new URL('../../data/meta.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../../data/sheets.json', import.meta.url)).then((r) => r.json()).catch(() => ({})),
]);
window.sheetsDrawing = drawing;
const [[west, south], [east, north]] = meta.bounds.core;

// Only the sheet the page opens on loads first: the others are most of the page's weight and
// none of them shows until the reader zooms (DESIGN.md, "Quality floor"). The page opens on
// sheet 1, one step in from the whole district, unless its address names another (address.js: `#zoom/lat/lon/mode/route`).
// An address that names no view, or a centre off the map, opens the page as a plain visit does.
const [[minLon, minLat], [maxLon, maxLat]] = meta.bounds.routes;
const onMap = (c) => c && c[0] >= minLon - 0.3 && c[0] <= maxLon + 0.3 && c[1] >= minLat - 0.3 && c[1] <= maxLat + 0.3;
const asked = ((v) => (v && v.center && !onMap(v.center) ? null : v))(readView(location.hash));
// The zoom each sheet rests at. Each rests at the zoom it is drawn for, but the whole district
// (#152): it is drawn for a phone's width, and a wider screen comes as close as holds the rail
// network (the build's `frame`) in the map above the sheet buttons, SIDE px clear at the sides, up
// to just short of where the next sheet's band begins (style.js, edge). Chris, 2026-11-18: the
// district at one zoom was too far out on a phone, and a desktop's screen is wider than it is tall.
const rests = [...zooms];
// 44 px each side: the frame's sides are where frequent lines end, in a town whose name, centred on
// its point, needs the room (Boulder; at 32 px its name ran off a phone's edge, Chris 2026-11-20).
const SIDE = 44;
// On a short screen (a phone in Safari, its bars taking a quarter of it) the district rests as far
// out as this to show all of it, a little smaller than it is drawn, rather than cut off its top.
const WHOLE_LEAST = 0.25;
function fitWhole() {
  const i = SHEETS.findIndex((s) => s.whole);
  if (i < 0 || !wholeFrame) return;
  const [w, s, e, n] = wholeFrame;
  const y = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
  const box = document.getElementById('map');
  const across = box.clientWidth - 2 * SIDE;
  const down = box.clientHeight - stepsHeight() - 32;
  const fits = Math.min(Math.log2(across / (512 * ((e - w) / 360))), Math.log2(down / (512 * (y(s) - y(n)))));
  const top = i < SHEETS.length - 1 ? edge(i) - 0.05 : zooms[i];
  rests[i] = Number.isFinite(fits) ? Math.max(zooms[i] - WHOLE_LEAST, Math.min(top, fits)) : zooms[i];
}
// How much of the map the sheet buttons sit over at its foot: the whole district keeps clear of them.
function stepsHeight() {
  const box = document.getElementById('map').getBoundingClientRect();
  const steps = document.querySelector('#steps')?.getBoundingClientRect();
  return steps ? Math.max(0, box.bottom - steps.top) : 0;
}
fitWhole();
const start = nearest(asked?.zoom ?? zooms[OPENING]);
// The picked bus route's lines (style.js, pick-bus): shown, and their tiles loaded, only once a bus
// route is picked or the address picks one (#193).
let routeLines = asked?.pick?.mode === 'bus';
// The page opens on the hub, a little above the middle so the lines south of it show.
const home = hub ? [hub[0], hub[1] - 0.035] : [(west + east) / 2, (south + north) / 2];
let openingSteps = !asked;

// How far the reader can pan: the routes and a margin (`bounded`, which the loading picture's
// placing assumes: index.html, data-bounds). On the whole district (#152) they reach half a
// screen further each way, so any part of the network can be brought to the middle and the
// screen always fits at zoom 8: MapLibre raises the zoom of a screen larger than its bounds.
const bounded = [[minLon - 0.3, minLat - 0.3], [maxLon + 0.3, maxLat + 0.3]];
function roomy() {
  const x = (lon) => (lon + 180) / 360;
  const y = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
  const lon = (u) => u * 360 - 180;
  const lat = (v) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - v) * 2 * Math.PI)) - 90;
  const box = document.getElementById('map');
  const world = 512 * 2 ** zooms[0];
  const [halfX, halfY] = [box.clientWidth / world / 2, box.clientHeight / world / 2];
  const [[w, s], [e, n]] = bounded;
  return [[lon(x(w) - halfX), lat(y(s) + halfY)], [lon(x(e) + halfX), lat(y(n) - halfY)]];
}

// The glyphs and tiles of the opening view, fetched by the page's head (index.html, early) as it
// loads, are handed to the map here, so the first drawing doesn't wait for requests the map makes
// only once it lays it out. Anything else is fetched here as it is asked for, by the page rather
// than the map's worker, so the service worker sees it (sw.js). A tile the site doesn't have is
// empty: the host answers a file it doesn't have with the front page.
const isTile = (path) => path.startsWith('/tiles/');
const notTile = (data) => new Uint8Array(data)[0] === 0x3c;
maplibregl.addProtocol('early', async ({ url }, abort) => {
  const plain = url.slice('early://'.length);
  const path = new URL(plain).pathname;
  const early = window.early?.[path];
  if (early) {
    delete window.early[path];
    const data = await early;
    if (data) return { data };
  }
  const response = await fetch(plain, { signal: abort.signal });
  if (isTile(path) && !response.ok) return { data: new ArrayBuffer(0) };
  if (!response.ok) throw new Error(`${response.status} ${plain}`);
  const data = await response.arrayBuffer();
  // The front page comes back with the tiles' own type (public/_headers): it is known by its "<".
  return { data: isTile(path) && notTile(data) ? new ArrayBuffer(0) : data };
});
// `only`: the one sheet whose layers the map starts with (below, "The other sheets' layers").
function mapStyle(t, only = null) {
  const style = sheetStyle(t, stations, colors, { district, routeLines, lists });
  for (const source of Object.values(style.sources)) if (source.tiles) source.tiles = source.tiles.map((u) => `early://${u}`);
  const other = (l) => /^(sheet|routes)-\d+$/.test(l.source ?? '') && l.source.split('-')[1] !== String(only);
  const layers = only === null ? style.layers : style.layers.filter((l) => !other(l));
  return { ...style, layers, glyphs: `early://${style.glyphs}` };
}
// The other sheets' layers. The map starts with the ground's and the opening sheet's, a quarter of
// the style's rules, which the phone reads twice before it draws (on the page and in each map
// worker: on Chris's iPhone 66-139 ms in a worker, 2026-11-25). The rest go in when the opening
// is drawn, in the style's own order, so every sheet is drawn as before. The tests check the style
// against MapLibre's rules (test/pages.test.mjs), so the map doesn't check them again.
function addOtherSheets() {
  const all = mapStyle(theme()).layers;
  let before;
  for (let i = all.length - 1; i >= 0; i--) {
    if (!map.getLayer(all[i].id)) map.style.addLayer(all[i], before, { validate: false });
    before = all[i].id;
  }
  map._update(true);
}

// How far out and in the map goes (style.js, LOWEST and HIGHEST); a step waiting for its tiles
// limits it less far (limits()).
const map = new maplibregl.Map({
  container: 'map',
  style: mapStyle(theme(), SHEETS[start].id),
  validateStyle: false,
  center: asked?.center ?? home,
  zoom: rests[start],
  minZoom: LOWEST,
  maxZoom: HIGHEST,
  maxBounds: SHEETS[start].whole ? roomy() : bounded,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  attributionControl: false,
  fadeDuration: 0,
  // What a screen reader calls the map (#14). Its canvas takes focus, and Tab moves on from it.
  // A screen reader can't tap a chosen spot on it, so the label names the list that can (#135).
  locale: { 'Map.Title': 'Map of RTD bus and rail service. Tap a line, a station or a stop to hear what it is, or use the next button, List what\'s in view' },
  // Room in the cache for every sheet's tiles around the view (warm, below), as well as the
  // tiles of the places just looked at.
  maxTileCacheZoomLevels: 12,
  // Each sheet's tiles are cut at one zoom (style.js, tileZooms) and drawn larger closer in, as the
  // GeoJSON was. MapLibre would otherwise ask for tiles no more than 4 zooms short of the
  // deepest zoom and cut them out of the sheet's own on the phone.
  zoomLevelsToOverscale: undefined,
});
map.touchZoomRotate.disableRotation();
map.keyboard.disableRotation();
// A theme change only recolours the drawing; keep its camera, card and route selection.
const themeButton = document.querySelector('#theme-toggle');
function themeButtonState() {
  const dark = theme() === 'dark';
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
}
function changeTheme(next) {
  if (next === theme()) return;
  root.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]').content = PALETTES[next].ground;
  themeButtonState();
  reveal();
  map.setStyle(mapStyle(next));
  map.once('styledata', () => setPick(picked));
}
themeButtonState();
themeButton.disabled = false;
themeButton.addEventListener('click', () => {
  const next = theme() === 'dark' ? 'light' : 'dark';
  manualTheme = true;
  try { localStorage.setItem('rtd-sheets-theme', next); } catch {}
  // Keep an explicitly themed link consistent with the choice on reload.
  const url = new URL(location.href);
  if (url.searchParams.has('theme')) {
    url.searchParams.set('theme', next);
    history.replaceState(null, '', url);
  }
  changeTheme(next);
});
scheme.addEventListener('change', () => {
  if (!manualTheme) changeTheme(scheme.matches ? 'dark' : 'light');
});

// --- Waiting for the reader before doing what is for later ------------------------

const SETTLE_MS = 5000;
let settled = false;
const later = [];
function whenSettled(fn) { if (settled) fn(); else later.push(fn); }
const settleOn = ['pointerdown', 'wheel', 'keydown'];
let touched = false; // before the opening is drawn, a touch only brings the start forward
function readerHasIt() {
  if (settled) return;
  if (!window.sheetsReady) { touched = true; return; }
  settled = true;
  for (const type of settleOn) removeEventListener(type, readerHasIt, true);
  for (const fn of later.splice(0)) fn();
}
for (const type of settleOn) addEventListener(type, readerHasIt, { capture: true, passive: true });

// --- The other sheets' tiles, before the reader steps ------------------------------

// MapLibre makes a sheet's tiles only once the zoom reaches that sheet, so the first step to
// each sheet showed bare ground for a moment (black in the dark theme) until they came. While
// the map rests, every other sheet's tiles for this view are made and put in its cache, where
// a step finds them. This reaches into MapLibre's tile managers: it has no way to ask for
// another zoom's tiles. If a MapLibre update takes away what it uses (canWarm), steps go at
// once, as they would with plain MapLibre, and the flash comes back; without that check every
// first step to a sheet would wait the whole HOLD_MS for tiles that never come.
// test/maplibre-internals.test.mjs fails when an update renames them. Worth keeping: on mini,
// 2026-11-26, a step 3 s after the map appeared showed 0 blank frames and finished in 0.79 s,
// against about 13 of 20 frames blank and 1.02 s without it (DESIGN.md decision log).
let tried = new WeakMap(); // tile manager -> tiles asked for while the map has rested here
map.on('movestart', () => { tried = new WeakMap(); });
// Any tile the map has made, for MapLibre's Tile and OverscaledTileID, which it does not export.
function aTile() {
  const tm = map.style?.tileManagers?.ground;
  return tm?.getTileByID?.(tm.getIds?.()[0] ?? '');
}
// Whether MapLibre still has every part warm() and stepReady() reach into. Taken as yes until the
// map has drawn, since a step waits for that anyway.
function canWarm() {
  if (!window.sheetsReady) return true;
  const tm = map.style?.tileManagers?.ground;
  const cache = tm?._outOfViewCache;
  const tile = aTile();
  return typeof tm?.getIds === 'function' && typeof tm.getTileByID === 'function' && typeof tm.getSource?.()?.loadTile === 'function'
    && typeof cache?.has === 'function' && typeof cache.add === 'function'
    && typeof tile?.tileID?.overscaleFactor === 'function' && typeof tile.hasData === 'function' && typeof tile.getExpiryTimeout === 'function';
}
// A step passes through every whole zoom between two sheets, and at each one the sheet whose
// band it is in shows, drawn from that zoom's tiles: these are the tiles, the basemap's and
// that sheet's, for each of `levels`.
function* stepTiles(levels) {
  const managers = map.style?.tileManagers;
  const TileID = aTile()?.tileID.constructor;
  if (!TileID) return;
  for (const t of levels) {
    const s = SHEETS.findLast((sh, i) => !i || edge(i - 1) <= t);
    for (const id of ['ground', `sheet-${s.id}`]) {
      const tm = managers[id];
      const source = tm?.getSource();
      if (!source?.loadTile || !tm._outOfViewCache) continue;
      for (const [over, z, x, y] of cover(source, t)) yield { id, s, tm, source, tileID: new TileID(over, 0, z, x, y) };
    }
  }
}
// `levels`: those of a step to either neighbouring sheet, unless a step waits (held), when only
// its own, so they come first.
function warm(levels = held ? between(sheet, held.to) : stepLevels()) {
  const Tile = aTile()?.constructor;
  if (!Tile) return;
  // Nearest the map's first: on reaching a sheet, the map rests again and its neighbours' come
  // then. (Every zoom at once was about twice the work, all on the phone's main thread.)
  const here = map.getZoom();
  levels.sort((a, b) => Math.abs(a - here) - Math.abs(b - here));
  for (const { id, tm, source, tileID } of stepTiles(levels)) {
    if (!tried.has(tm)) tried.set(tm, new Set());
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
// Whether a step from this sheet to sheet `to` has every tile it passes through, so none of
// it would show bare ground.
function stepReady(to) {
  if (to === sheet || !SHEETS[to]) return true;
  if (!window.sheetsReady) return false;
  let any = false;
  for (const { tm, tileID } of stepTiles(between(sheet, to))) {
    if (!tm.getTileByID(tileID.key)?.hasData() && !tm._outOfViewCache.has(tileID)) return false;
    any = true;
  }
  return any;
}
// The whole zooms a step from sheet `a` to sheet `b` passes through, and from this sheet to either neighbour.
function between(a, b) {
  const levels = [];
  for (let t = Math.floor(Math.min(rests[a], rests[b])); t <= Math.max(rests[a], rests[b]); t++) levels.push(t);
  return levels;
}
function stepLevels() {
  return between(Math.max(0, sheet - 1), Math.min(rests.length - 1, sheet + 1));
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
// From the opening on: a step soon after it is as quick as one later (Chris, 2026-11-25).
map.on('idle', () => { if (window.sheetsReady) warm(); });

// --- Resting only on a sheet -------------------------------------------------

let sheet = nearest(map.getZoom());
function nearest(zoom) {
  return rests.reduce((best, z, i) => (Math.abs(z - zoom) < Math.abs(rests[best] - zoom) ? i : best), 0);
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
// The middle of what the whole-district sheet draws (the build's `frame`), in the map's own
// (Mercator) terms, so the network sits in the middle of the screen however far north it reaches.
const frameCentre = wholeFrame && (() => {
  const [w, s, e, n] = wholeFrame;
  const y = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const mid = (y(s) + y(n)) / 2;
  return [(w + e) / 2, (2 * Math.atan(Math.exp(mid)) - Math.PI / 2) * (180 / Math.PI)];
})();
// How far above the screen's middle the frame's middle sits at `zoom`: none where the frame
// clears the sheet buttons by 16 px centred on the whole screen, else just enough to clear them,
// and at most half their height (centred in the screen above them), where it fits nowhere.
function lift(zoom) {
  const [, s, , n] = wholeFrame;
  const y = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
  const tall = (y(n) - y(s)) * 512 * 2 ** zoom;
  const high = map.getContainer().clientHeight;
  const under = stepsHeight();
  return Math.min(under / 2, Math.max(0, high / 2 + tall / 2 - (high - under - 16)));
}
// Where the reader was before stepping out to the whole district: the button back in returns
// there, unless the reader has moved the map on the whole district since.
let cameFrom = null;
// Whether the whole district is as stepping out framed it: a turned phone frames it again.
let framed = false;
// `keep`: a link names this view's centre, so stepping to the whole district keeps it.
// `duration`: the move's length; none at the opening (below).
function show(index, around, keep = false, duration = 380) {
  const was = sheet;
  sheet = Math.max(0, Math.min(zooms.length - 1, index));
  const dots = document.querySelector('#sheets');
  dots.setAttribute('aria-label', sheetName(sheet, zooms.length));
  if (sheet !== was) say(sheetName(sheet, zooms.length));
  // A step goes the whole way: the limits a wait put on are for the reader's own zooms.
  if (sheet !== was) { map.setMinZoom(LOWEST); map.setMaxZoom(HIGHEST); }
  // Stepping out to the whole district shows all of it, wherever the reader was (#152).
  const whole = SHEETS[sheet].whole && frameCentre && sheet !== was && !keep;
  const back = !whole && cameFrom && SHEETS[was]?.whole && sheet === was + 1 && !around ? cameFrom : null;
  if (whole) cameFrom = map.getCenter().toArray();
  else if (!SHEETS[sheet].whole) cameFrom = null;
  if (whole) framed = true;
  else if (!SHEETS[sheet].whole || keep) framed = false;
  // The whole district's room is given before the move there, and taken back after the move off it.
  if (SHEETS[sheet].whole) map.setMaxBounds(roomy());
  else if (SHEETS[was]?.whole) map.once('moveend', () => { if (!SHEETS[sheet].whole) map.setMaxBounds(bounded); });
  map.easeTo({ zoom: rests[sheet], ...(whole ? { center: frameCentre, offset: [0, -lift(rests[sheet])] } : back ? { center: back } : { around }), duration }, { settling: true });
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
  if (!e.settling && began === null) began = last;
});
map.on('zoom', () => { last = map.getZoom(); });
map.on('zoomend', (e) => {
  if (e.settling || began === null) return;
  const to = settle(rests, sheet, began, map.getZoom(), { least: input.touch ? 0.25 : 0.1 });
  began = null;
  aim = null; // the reader's own zoom says where the map goes now
  // A scroll zooms about the pointer, and so does the rest of the way.
  const box = map.getContainer().getBoundingClientRect();
  step(to, input.wheel ? map.unproject([input.wheel[0] - box.left, input.wheel[1] - box.top]) : undefined);
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
  requestAnimationFrame(() => nudge(1, around));
});
// + and - step when a finger lifts off them, not on the click Safari makes of a tap: of two quick
// taps, Safari on the iPhone makes no click of the second (it waits for a double tap; on the home
// screen, any tap within about 300 ms of the last), so quick taps were lost (#210, Chris
// 2026-11-25). A click that follows a counted tap is not counted again; a click with no tap
// before it (a mouse, a key, a screen reader) steps as before.
const stepButtons = [['#in', 1], ['#out', -1]].map(([id, dir]) => [document.querySelector(id), dir]);
let tappedAt = -Infinity;
const press = (dir) => nudge(dir, dir > 0 && !cameFrom && openingSteps && hub ? hub : undefined);
for (const [button, dir] of stepButtons) {
  button.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' || button.disabled || !e.isPrimary) return;
    const box = button.getBoundingClientRect(); // a finger slid off the button is not a tap
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return;
    tappedAt = performance.now();
    reveal();
    press(dir);
  });
  button.addEventListener('click', () => {
    if (performance.now() - tappedAt < 800) return; // the click Safari makes of a tap already counted
    press(dir);
  });
  button.addEventListener('dblclick', (e) => e.preventDefault());
}

// --- No step before the next sheet is ready ----------------------------------------

// A step to a sheet whose tiles have not all come showed bare ground for a moment (black in the
// dark theme), most often in the first seconds of a visit. So the map waits for them (Chris,
// 2026-11-25): a tap on + or -, or a double tap, holds the step and shows "Loading…" until
// they are there, then steps. A pinch or a scroll stops at the edge of the sheet shown, with
// the same line, and steps on the same way. HOLD_MS at most: if the tiles never come (the
// connection dropped), the step goes ahead as it did before.
const HOLD_MS = 8000;
const waitLine = document.querySelector('#wait');
let showing = 0;
function waiting(on) {
  clearTimeout(showing);
  // Not for a wait too short to see.
  if (on) showing = setTimeout(() => { waitLine.hidden = false; }, 120);
  else waitLine.hidden = true;
}
let held = null; // { to, around, since }: the sheet a step waits for
let givenUp = -1; // the sheet on which a wait ran out: no more waits there
// ?hold=off steps at once, as the page did before, to compare the two (js/steptest.js).
const NO_HOLD = new URLSearchParams(location.search).get('hold') === 'off';
function step(index, around) {
  const to = Math.max(0, Math.min(zooms.length - 1, index));
  if (to === sheet) return show(to, around); // back to the sheet shown: a wait goes on
  if (NO_HOLD || givenUp === sheet || !canWarm() || stepReady(to)) {
    held = null;
    waiting(false);
    return show(to, around);
  }
  if (map.isMoving()) map.stop(); // a double tap's own zoom, which would go on to the limit
  hold({ to, around });
}
function hold(h) {
  held = { ...h, since: held?.to === h.to ? held.since : performance.now() };
  waiting(true);
  watch();
}
// A tap on + or -, a double tap, or the + and - keys: one sheet on from where the map is going,
// not from the sheet shown. So a tap during a wait or a step adds a step (two taps go two sheets
// on, #210), up to the first or last sheet, and a tap the other way takes one off; back to the
// sheet shown ends a wait. The map goes there one sheet at a time, each step as any other, which
// waits for its sheet: a move of several sheets at once drew bare ground on the way.
let aim = null; // the sheet the taps ask for, until the map is there
let aimAround;
function nudge(dir, around) {
  aim = Math.max(0, Math.min(zooms.length - 1, (aim ?? held?.to ?? sheet) + dir));
  aimAround = around;
  onward();
}
// Our own step under way: the next waits for it to end.
let stepping = false;
map.on('movestart', (e) => { stepping = !!e.settling; });
map.on('moveend', () => {
  stepping = false;
  // After the map's own handlers are done with the move; a move cut off by the next is not an end.
  requestAnimationFrame(() => { if (!map.isMoving()) onward(); });
});
function onward() {
  if (aim === null || held?.to === aim) return;
  if (aim === sheet) {
    aim = null;
    if (held) { // a tap on - during a wait for +
      held = null;
      waiting(false);
      show(sheet);
    }
    return;
  }
  const next = sheet + Math.sign(aim - sheet);
  if (held?.to === next || (stepping && map.isMoving())) return;
  step(next, aimAround);
}
// For the checks: whether a step waits for its sheet, or more steps are to come (qa/a11y.mjs,
// qa/wholecheck.mjs). The map rests while it waits.
Object.defineProperty(window, 'sheetsHeld', { get: () => !!held || (aim !== null && aim !== sheet) });
// Pinch or scroll at the edge of the sheet's limits: a step like any other, which waits. The
// limits are let out a moment after the next sheet is ready (watch); a scroll that meets them
// in that moment steps at once, and a pinch once the fingers are off, where both were lost.
function pushed(dir) {
  const to = sheet + dir;
  if (held || !SHEETS[to] || givenUp === sheet || !canWarm()) return;
  const z = map.getZoom();
  if (!(dir > 0 ? z >= map.getMaxZoom() - 0.01 : z <= map.getMinZoom() + 0.01)) return;
  if (stepReady(to) && !map.isMoving()) step(to);
  else hold({ to });
}
map.getContainer().addEventListener('wheel', (e) => { if (e.deltaY) pushed(e.deltaY < 0 ? 1 : -1); }, { passive: true });
let spread = 0;
const apart = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
map.getContainer().addEventListener('touchstart', (e) => { spread = e.touches.length === 2 ? apart(e.touches) : 0; }, { passive: true });
map.getContainer().addEventListener('touchmove', (e) => {
  if (!spread || e.touches.length !== 2) return;
  const r = apart(e.touches) / spread;
  if (r > 1.05 || r < 0.95) pushed(r > 1 ? 1 : -1);
}, { passive: true });
// The + and - keys step as the buttons do, so a key pressed during a wait counts as a tap does.
// Taken before MapLibre's own keyboard zoom sees them, which would zoom one level and settle.
map.getContainer().addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const dir = ['+', '='].includes(e.key) ? 1 : ['-', '_'].includes(e.key) ? -1 : 0;
  if (!dir) return;
  e.stopPropagation();
  e.preventDefault();
  nudge(dir);
}, { capture: true });
// The sheet's limits: no further than its own tiles reach, toward a neighbour not yet ready. A
// pinch in can go almost to the next whole zoom (the same tiles, larger), and then steps on
// once the next sheet is ready; out, there is nothing to show past the sheet's own zoom.
function limits() {
  const r = rests[sheet];
  const loose = NO_HOLD || givenUp === sheet || !canWarm();
  const max = loose || stepReady(sheet + 1) ? HIGHEST : Math.min(edge(sheet), Math.floor(r) + 1) - 0.001;
  const min = loose || stepReady(sheet - 1) ? LOWEST : Math.max(edge(sheet - 1), Math.floor(r));
  // Drawn in only at rest on the sheet, so the map never jumps; let out at once.
  const still = !map.isMoving() && Math.abs(map.getZoom() - r) < 0.01;
  if (max > map.getMaxZoom() || (max < map.getMaxZoom() && still)) map.setMaxZoom(max);
  if (min < map.getMinZoom() || (min > map.getMinZoom() && still)) map.setMinZoom(min);
  return map.getMaxZoom() < HIGHEST || map.getMinZoom() > LOWEST;
}
// While the map is limited or a step waits: make the tiles, and look for them.
let watching = 0;
function watch() {
  if (watching) return;
  watching = setInterval(() => {
    if (!map.isMoving()) warm();
    if (held && !map.isMoving()) { // after a pinch, once the fingers are off
      const over = performance.now() - held.since > HOLD_MS;
      if (over) givenUp = sheet;
      if (over || stepReady(held.to)) {
        const { to, around } = held;
        held = null;
        waiting(false);
        show(to, around);
      }
    }
    if (!limits() && !held) { clearInterval(watching); watching = 0; }
  }, 150);
}
map.on('idle', () => { if (window.sheetsReady && limits()) watch(); });
map.on('movestart', (e) => { if (e.originalEvent) openingSteps = false; });
map.on('dragstart', () => { if (SHEETS[sheet].whole) cameFrom = null; framed = false; });
// The opening is already at its sheet's zoom: no move. A move, even to where the map is, keeps
// MapLibre from calling the map ready until it ends, 380 ms after the page starts (on Chris's
// iPhone, 2026-11-25, it held a reload's opening 120 ms after everything was drawn).
show(sheet, undefined, false, 0);

// --- What is this? Tap a line, a station or a stop --------------------------------
// The card names what is under the finger; each route on it is a button, and picking one
// highlights that route on every sheet, the rest faded (style.js, PICKED). A tap on empty
// ground clears both.

const card = document.querySelector('#card');
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
let picked = null; // { mode: 'bus' | 'rail', route }
let shown = null; // what the card names: { title, note, routes: [{ mode, route, color }] }
let opener = null; // the button the card was opened from (the list, #135), where closing it returns
let selectedAt = null;
function setPick(p) {
  picked = p;
  // A picked bus route is drawn from its sheets' route lines, whose layers show only now (#193).
  if (p?.mode === 'bus' && !routeLines) {
    routeLines = true;
    for (const l of map.getStyle().layers) if (l.source?.startsWith('routes-')) map.setLayoutProperty(l.id, 'visibility', 'visible');
  }
  map.setGlobalStateProperty('bus', p?.mode === 'bus' ? p.route : '');
  map.setGlobalStateProperty('rail', p?.mode === 'rail' ? p.route : '');
  window.sheetsPick = p;
  document.documentElement.classList.toggle('picked', !!p);
  remember();
  markKey();
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
  if (!routes.length || shown?.list) return '';
  return picked && routes.some((r) => r.mode === picked.mode && r.route === picked.route) ? 'Tap empty ground to clear' : routes.length > 1 ? 'Tap a route to highlight it' : 'Tap to highlight this route';
}
// A visual separator gets its spacing from layout; speech uses punctuation (say.js).
const detail = (text) => esc(text).replace(/\s*·\s*/g, '<span class="sep" aria-hidden="true">·</span>');
function keepVisible() {
  if (!selectedAt || card.hidden || !map.isStyleLoaded()) return;
  const box = map.getContainer().getBoundingClientRect();
  const p = map.project(selectedAt);
  const blocks = [card, document.querySelector('#steps'), document.querySelector('#credit'), themeButton]
    .filter((el) => el && !el.hidden).map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top };
    });
  const to = clearPoint([p.x, p.y], box, blocks);
  if (to && Math.hypot(p.x - to[0], p.y - to[1]) > 1) map.panBy([p.x - to[0], p.y - to[1]], { duration: 0 });
}
function tell(what) {
  shown = what;
  const { title, note, lead, groups = [] } = what;
  const routes = routesOf(what);
  const hint = hintFor(routes);
  // A picked route's own card: its chip and RTD's name on one line, its ends and how often it
  // runs under them, and nothing else, so it covers as little of the map as it can (DESIGN.md).
  card.classList.toggle('route', what.kind === 'route');
  if (what.kind === 'route') {
    card.innerHTML = `<div class="head"><div class="routes">${routes.map(chip).join('')}</div><b id="card-title" role="heading" aria-level="2">${esc(what.name)}</b></div>`
      + `${what.line ? `<span>${detail(what.line)}</span>` : ''}<button type="button" class="close" aria-label="Close">\u00d7</button>`;
    card.hidden = false;
    say(cardSaid({ title: what.name, note: what.line, routes }));
    requestAnimationFrame(keepVisible);
    return;
  }
  // Each letter is said as its stop ("Stop A"), then its routes.
  const rows = groups.length ? `<div class="rows">${groups.map((g, i) => `<i class="g${i % GROUP_INK.light.length}"><span class="sr">Stop </span>${esc(g.letter)}</i><div class="routes">${g.routes.map(chip).join('')}</div>`).join('')}</div>` : '';
  const list = what.routes?.length ? `${what.also ? `<span>${esc(what.also)}</span>` : ''}<div class="routes">${what.routes.map(chip).join('')}</div>` : '';
  // A plain card says what it is before its routes; a stop-group card leads with its letters.
  const said = note ? `<span>${detail(note)}</span>` : '';
  card.innerHTML = `<b id="card-title" role="heading" aria-level="2">${title}</b>${lead ? `<span>${esc(lead)}</span>` : ''}${groups.length ? '' : said}${rows}${list}${groups.length ? said : ''}<span class="hint">${hint}</span>`
    + '<button type="button" class="close" aria-label="Close">\u00d7</button>';
  card.classList.remove('list');
  card.hidden = false;
  say(cardSaid({ title: card.querySelector('#card-title').textContent, note, lead, routes }));
  requestAnimationFrame(keepVisible);
}
// Closing the card is a tap on empty ground: the card goes, and so does a pick.
function close({ focus = false } = {}) {
  if (card.hidden && !picked) return;
  card.hidden = true;
  shown = null;
  selectedAt = null;
  if (picked) { setPick(null); say(pickSaid(null)); }
  if (focus) (opener ?? map.getCanvas()).focus({ preventScroll: true });
}
card.addEventListener('click', (e) => {
  if (e.target.closest('button.close')) return close({ focus: true });
  const place = e.target.closest('button[data-place]');
  if (place) return placeCard(shown.places[Number(place.dataset.place)], { focus: true });
  const b = e.target.closest('button[data-route]');
  if (!b) return;
  const p = { mode: b.dataset.mode, route: b.dataset.route };
  setPick(picked?.mode === p.mode && picked.route === p.route ? null : p);
  say(pickSaid(picked));
  // Changed in place, so the button pressed keeps its focus (and a screen reader its place).
  for (const other of card.querySelectorAll('button[data-route]')) {
    other.setAttribute('aria-pressed', String(picked?.mode === other.dataset.mode && picked.route === other.dataset.route));
  }
  for (const row of card.querySelectorAll('.rows > .routes')) row.previousElementSibling.classList.toggle('selected', !!row.querySelector('[aria-pressed="true"]'));
  const hint = card.querySelector('.hint');
  if (shown && hint) hint.textContent = hintFor(routesOf(shown));
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close({ focus: card.contains(document.activeElement) }); });
// Panning only moves the sheet. Names keep the places chosen by the build.
map.on('idle', keepVisible);
// On the whole district a town's name that would run off the screen is left off, not cut (Chris,
// 2026-11-20, of Boulder and Parker at a phone's edges): each town's name is measured where it is
// centred on its point (style.js, place: its size, capitals and spacing) and kept only whole on
// the screen. Panning brings it back where it fits.
let edgeClause = null;
function townsOnScreen() {
  const n = SHEETS[sheet].id;
  const id = `place-${n}`;
  if (!SHEETS[sheet].whole || !map.getLayer(id)) return;
  let filter = map.getFilter(id);
  const had = edgeClause && JSON.stringify(filter.at(-1)) === JSON.stringify(edgeClause);
  if (had) filter = filter.slice(0, -1);
  const { clientWidth: wide, clientHeight: high } = map.getContainer();
  const off = new Set();
  for (const t of map.querySourceFeatures('ground', { sourceLayer: 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]] })) {
    const name = t.properties.name;
    if (!name || t.geometry.type !== 'Point') continue;
    const major = t.properties.class === 'city' && Number(t.properties.rank ?? 99) <= PLACE_MAJOR_RANK;
    const size = PLACE_SIZE[n] + (major ? 2 : 0);
    const half = (name.length * size * (0.68 + (major ? 0.26 : 0.22))) / 2 + 2;
    const p = map.project(t.geometry.coordinates);
    if (p.x - half < 0 || p.x + half > wide || p.y - size < 0 || p.y + size > high) off.add(name);
  }
  const clause = ['!', ['in', ['get', 'name'], ['literal', [...off].sort()]]];
  if (had && JSON.stringify(clause) === JSON.stringify(edgeClause)) return;
  edgeClause = clause;
  map.setFilter(id, [...filter, clause]);
}
map.on('moveend', townsOnScreen);
map.on('idle', townsOnScreen);
// A street our own lettering names on the screen (a bus street's name, or the name leading its
// route list) is not named again beside it by the ground's tiles (#174: "E 17th Ave" twice). The
// two are matched in the short form the sheets set ("W Alameda Ave"), without a direction before
// it. Panning brings the ground's name back where ours is off the screen.
const bareStreet = (name) => String(name).replace(/^[NSEW] /, '');
const groundStreet = ['let', 'short', shortStreet(['let', 'label', ['to-string', ['coalesce', ['get', 'name'], '']], ['case', ['==', ['var', 'label'], ''], ['to-string', ['coalesce', ['get', 'ref'], '']], ['var', 'label']]]),
  ['case', ['in', ['slice', ['var', 'short'], 0, 2], ['literal', ['N ', 'S ', 'E ', 'W ']]], ['slice', ['var', 'short'], 2], ['var', 'short']]];
const streetBase = new Map();
let streetKey = '';
function streetsOnScreen() {
  const n = SHEETS[sheet].id;
  const id = `street-name-${n}`;
  if (!map.getLayer(id)) return;
  if (!streetBase.has(id)) streetBase.set(id, map.getFilter(id));
  const ours = ['bus-street', 'picked-street', 'bus-number', 'picked-number'].map((l) => `${l}-${n}`).filter((l) => map.getLayer(l));
  const names = new Set();
  for (const f of map.queryRenderedFeatures({ layers: ours })) {
    const name = f.properties.kind === 'bus-street' ? f.properties.label : f.properties.street;
    if (name) names.add(bareStreet(name));
  }
  const list = [...names].sort();
  const filter = list.length ? ['all', streetBase.get(id), ['!', ['in', groundStreet, ['literal', list]]]] : streetBase.get(id);
  // (A new style, on a change of theme, comes with the layer's own filter again.)
  const key = JSON.stringify(filter);
  if (key === streetKey && JSON.stringify(map.getFilter(id)) === key) return;
  streetKey = key;
  map.setFilter(id, filter);
}
map.on('idle', streetsOnScreen);
new ResizeObserver(keepVisible).observe(card);
// Each line's colour, as the sheets draw it (a station lists its lines by letter only).
const colorOf = new Map();
map.on('idle', () => {
  for (const f of map.querySourceFeatures(`sheet-${SHEETS[sheet].id}`, { sourceLayer: TILE_LAYER, filter: ['==', ['get', 'kind'], 'rail'] })) colorOf.set(f.properties.route, f.properties.color);
});
const rails = (list) => list.map((route) => ({ mode: 'rail', route, color: colorOf.get(route) ?? '#888888' }));
const buses = (text) => routeList(text).map((route) => ({ mode: 'bus', route }));
map.on('click', (e) => {
  opener = null;
  selectedAt = e.lngLat;
  const n = SHEETS[sheet].id;
  const reach = 9;
  const box = [[e.point.x - reach, e.point.y - reach], [e.point.x + reach, e.point.y + reach]];
  const hit = (ids) => map.queryRenderedFeatures(box, { layers: ids.map((id) => `${id}-${n}`).filter((id) => map.getLayer(id)) });
  for (const f of hit(['rail', 'letter'])) if (f.properties.color) colorOf.set(f.properties.route, f.properties.color);
  // RTD's stop groups first: a lettered stop, or a street whose stops are lettered, lists its
  // routes by the letter of the stop each one uses (the table itself is the key, below).
  const station = hit(['station', 'name'])[0]?.properties;
  const lettered = station ? null : hit(['group-stop', 'pick-letter', 'stop-letter'])[0]?.properties;
  if (lettered?.letter) return placeCard({ lettered });
  const bus = hit(['bus']).map((f) => f.properties).sort((a, b) => b.n - a.n)[0];
  const stop = hit(['stop'])[0]?.properties;
  const what = pickFrom({
    station,
    letter: hit(['letter'])[0]?.properties,
    rail: [...new Map(hit(['rail']).map((f) => [f.properties.route, f.properties])).values()],
    stop,
    label: hit(['picked-number', 'picked-stack', 'bus-number', 'bus-stack'])[0]?.properties,
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
  const routes = [...rails(what.rail ?? []), ...buses(what.bus ?? '')];
  // A line with only one route on it can mean only that route: it is picked at once, and named
  // on its own small card, not a card asking the reader to pick it.
  if (routes.length === 1 && !station && !stop) {
    const p = { mode: routes[0].mode, route: routes[0].route };
    setPick(p);
    return openCard(p);
  }
  tell({ title: what.title, note: what.note, routes });
});
map.on('dragstart', () => {
  selectedAt = null;
  if (picked) {
    // A selected route remains named while panning; its compact card takes little room.
    const focused = card.contains(document.activeElement);
    if (shown?.kind !== 'route') openCard(picked);
    if (focused) map.getCanvas().focus({ preventScroll: true });
  } else close();
});

// A station's or a stop's card, from a tap or from the list of what's in view.
function placeCard({ station, lettered, stop }, { focus = false } = {}) {
  if (lettered) {
    tell({ title: esc(lettered.name), note: `Bus stop ${lettered.letter}${lettered.heading ? ` · ${lettered.heading}` : ''}`,
      groups: groupList(`${lettered.letter} ${routeList(lettered.routes).join(' ')}`) });
  } else {
    const what = pickFrom({ station, stop });
    tell({ title: what.title, note: what.note, routes: [...rails(what.rail ?? []), ...buses(what.bus ?? '')] });
  }
  // Opened from the list, the card takes the focus its button had: the button is gone.
  if (focus) (card.querySelector('button:not(.close)') ?? card.querySelector('button.close')).focus();
}

// --- The stop groups' key (#198) --------------------------------------------------
// Where RTD letters its stops (downtown's 15th and 17th Streets), the table saying which routes
// stop at which letter is a key on the screen, not a plate on the map: it shows whenever one of
// the lettered stops is in view, in whichever corner of the screen is free of them, the open
// card and the controls, and fades out while the map moves when its corner covers a stop or the
// stops go off the screen, to fade in again, moved if need be, once the map stops (Chris,
// 2026-11-25: "it should always be on screen when it is supposed to be on screen"). The build
// says where each group's stops are on each sheet (sheets.json, groups). A tap opens its table
// on the card, its routes buttons there as on any card.
const keyBox = document.querySelector('#key');
const SLOTS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
// The room kept clear of a stop's letter, and between the key and the screen's edges.
const KEY_CLEAR = 10;
let keyGroup = null; // the group the key shows, by its index in stopGroups
let keySlot = null;
function keyRows(g) {
  return groupList(g.rows).map((r, i) => `<span class="row"><i class="g${i % GROUP_INK.light.length}">${esc(r.letter)}</i><span class="routes">${r.routes
    .map((x) => `<span data-route="${esc(x.route)}">${esc(x.route)}</span>`).join('')}</span></span>`).join('');
}
// A picked route's row in the key: its letter's square ringed and the route set as the card's
// pressed chip is, so the reader sees which stop it uses.
function markKey() {
  if (!keyBox || keyGroup === null) return;
  for (const row of keyBox.querySelectorAll('.row')) {
    let on = false;
    for (const r of row.querySelectorAll('[data-route]')) {
      const it = picked?.mode === 'bus' && picked.route === r.dataset.route;
      r.classList.toggle('picked', it);
      on ||= it;
    }
    row.classList.toggle('picked', on);
  }
}
// Each group's stops on the screen now, in the map's own pixels.
function keyStops() {
  const box = map.getContainer();
  const w = box.clientWidth;
  const h = box.clientHeight;
  const id = SHEETS[sheet].id;
  return stopGroups.map((g) => (g.at?.[id] ?? []).map((c) => map.project(c)).filter((p) => p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h));
}
// Each corner's rectangle for the key, in the map's pixels: the top corners under the top edge
// (where the keyboard's list button sits), the bottom ones above the sheet buttons and the
// theme button, where the card opens.
function slotRect(slot) {
  const box = map.getContainer().getBoundingClientRect();
  const steps = document.querySelector('#steps').getBoundingClientRect();
  const toggle = themeButton.getBoundingClientRect();
  const top = parseFloat(getComputedStyle(document.querySelector('#inview')).top) || 12;
  const w = keyBox.offsetWidth;
  const h = keyBox.offsetHeight;
  const left = slot.endsWith('left') ? steps.left - box.left : toggle.right - box.left - w;
  const y = slot.startsWith('top') ? top : steps.top - box.top - 12 - h;
  return { left, top: y, right: left + w, bottom: y + h };
}
const overlaps = (a, b, pad = 0) => a.left - pad < b.right && b.left - pad < a.right && a.top - pad < b.bottom && b.top - pad < a.bottom;
function slotFree(slot, stops) {
  const r = slotRect(slot);
  if (stops.some((p) => p.x > r.left - KEY_CLEAR && p.x < r.right + KEY_CLEAR && p.y > r.top - KEY_CLEAR && p.y < r.bottom + KEY_CLEAR)) return false;
  if (!card.hidden) {
    const box = map.getContainer().getBoundingClientRect();
    const c = card.getBoundingClientRect();
    if (overlaps(r, { left: c.left - box.left, top: c.top - box.top, right: c.right - box.left, bottom: c.bottom - box.top }, 8)) return false;
  }
  return true;
}
// How much of the network a corner would cover: the sheet's lines, stops and areas drawn in its
// rectangle. Not its lettering: a query over a symbol layer evaluates the layer's layout on the
// tile's copy of each feature, whose list-valued properties (a name's offset) are strings, and
// MapLibre warns of each.
function slotCovers(slot) {
  const r = slotRect(slot);
  const layers = map.getStyle().layers.filter((l) => l.source?.startsWith('sheet-') && l.type !== 'symbol').map((l) => l.id);
  return map.queryRenderedFeatures([[r.left, r.top], [r.right, r.bottom]], { layers }).length;
}
function keyShown(on) {
  keyBox.classList.toggle('off', !on);
  keyBox.setAttribute('aria-hidden', String(!on));
  keyBox.tabIndex = on ? 0 : -1;
}
// While the map moves: the key stays where it is, and fades out if that corner is no longer
// free or its stops have left the screen; it fades back in if both come right again there.
function keyMoving() {
  if (!keyBox || keyGroup === null) return;
  const stops = keyStops()[keyGroup];
  keyShown(!(shown?.key) && stops.length > 0 && !!keySlot && slotFree(keySlot, stops));
}
// Once the map stops (or the card opens or closes): the group whose stops are in view, in its
// corner if that is still free, or else in the free corner covering the least of the network.
function placeKey() {
  if (!keyBox || !map.isStyleLoaded()) return;
  const stops = keyStops();
  const g = stops.findIndex((s) => s.length);
  if (g < 0 || shown?.key) return keyShown(false);
  if (g !== keyGroup) {
    keyGroup = g;
    keySlot = null;
    const group = stopGroups[g];
    keyBox.innerHTML = `<b>${esc(group.title)}</b>${keyRows(group)}`;
    keyBox.setAttribute('aria-label', `${group.title}: which routes stop at each lettered stop`);
    markKey();
  }
  const free = SLOTS.filter((slot) => slotFree(slot, stops[g]));
  if (!free.length) return keyShown(false);
  if (!free.includes(keySlot)) {
    const covers = free.map(slotCovers);
    keySlot = free[covers.indexOf(Math.min(...covers))];
  }
  const r = slotRect(keySlot);
  const moved = keyBox.dataset.slot !== keySlot;
  // A key that moves corner is set there unseen, then fades in.
  if (moved) {
    keyShown(false);
    keyBox.classList.add('still');
    keyBox.dataset.slot = keySlot;
    keyBox.style.left = `${r.left}px`;
    keyBox.style.top = `${r.top}px`;
    void keyBox.offsetWidth;
    keyBox.classList.remove('still');
  }
  keyShown(true);
}
if (keyBox) {
  keyShown(false);
  map.on('move', keyMoving);
  map.on('moveend', placeKey);
  map.on('idle', placeKey);
  addEventListener('resize', () => { keySlot = null; placeKey(); });
  new MutationObserver(() => requestAnimationFrame(placeKey)).observe(card, { attributes: true, attributeFilter: ['hidden', 'class'] });
  new ResizeObserver(() => requestAnimationFrame(placeKey)).observe(card);
  keyBox.addEventListener('click', (e) => {
    if (keyGroup === null) return;
    const g = stopGroups[keyGroup];
    opener = keyBox;
    selectedAt = null;
    tell({ title: esc(g.title), lead: 'Each stop serves the routes of its letter', groups: groupList(g.rows), key: true });
    keyShown(false);
    // From the keyboard (a click with no pointer), the card takes the key's focus: the key is gone.
    if (e.detail === 0) (card.querySelector('button:not(.close)') ?? card.querySelector('button.close')).focus({ preventScroll: true });
  });
}

// --- What's in view, for a keyboard or a screen reader (#135) ----------------------
// Nobody can tap a chosen spot on the map without seeing it, so a button lists what the sheet
// draws on screen: its stations and stops, each opening its card, and its lines and routes,
// each picked as on a card. It shows only when it has the keyboard's focus; a screen reader
// finds it next after the map.
const listButton = document.querySelector('#inview');
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
const byRoute = (a, b) => a.route.localeCompare(b.route, undefined, { numeric: true });
function inView() {
  const n = SHEETS[sheet].id;
  const drawn = (id) => (map.getLayer(`${id}-${n}`) ? map.queryRenderedFeatures({ layers: [`${id}-${n}`] }).map((f) => f.properties) : []);
  const once = (list, key) => [...new Map(list.map((p) => [key(p), p])).values()];
  for (const p of drawn('rail')) if (p.color) colorOf.set(p.route, p.color);
  const stations = once(drawn('station'), (p) => p.name).sort(byName).map((station) => ({ name: station.name, station }));
  const stops = [
    ...once(drawn('group-stop').filter((p) => p.letter), (p) => `${p.name}|${p.letter}`).map((lettered) => ({ name: `${lettered.name}, stop ${lettered.letter}`, lettered })),
    ...once(drawn('stop'), (p) => `${p.name}|${p.heading}`).map((stop) => ({ name: [stop.name, stop.heading].filter(Boolean).join(', '), stop })),
  ].sort(byName);
  const lines = rails([...new Set(drawn('rail').map((p) => p.route))]).sort(byRoute);
  const routes = [...new Set(drawn('bus').flatMap((p) => routeList(p.routes)))].map((route) => ({ mode: 'bus', route })).sort(byRoute);
  return { places: [...stations, ...stops], stations: stations.length, routes: [...lines, ...routes], lines: lines.length };
}
function showList() {
  selectedAt = null;
  const { places, stations, routes, lines } = inView();
  shown = { list: true, places, routes };
  opener = listButton;
  const part = (head, html) => (html ? `<span class="head" role="heading" aria-level="3">${head}</span>${html}` : '');
  const placeList = (from, to) => (to > from ? `<div class="places">${places.slice(from, to).map((p, i) => `<button type="button" data-place="${from + i}">${esc(p.name)}</button>`).join('')}</div>` : '');
  const routeRow = (list) => (list.length ? `<div class="routes">${list.map(chip).join('')}</div>` : '');
  const nothing = !places.length && !routes.length;
  card.innerHTML = `<b id="card-title" role="heading" aria-level="2">In view</b>`
    + (nothing ? '<span>No lines or stations here</span>' : '')
    + part('Stations', placeList(0, stations)) + part('Stops', placeList(stations, places.length))
    + part('Rail lines', routeRow(routes.slice(0, lines))) + part('Bus routes', routeRow(routes.slice(lines)))
    + '<span class="hint"></span><button type="button" class="close" aria-label="Close">\u00d7</button>';
  card.classList.add('list');
  card.hidden = false;
  const count = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : '');
  say(['In view:', [count(stations, 'station', 'stations'), count(places.length - stations, 'stop', 'stops'), count(lines, 'rail line', 'rail lines'), count(routes.length - lines, 'bus route', 'bus routes')].filter(Boolean).join(', ') || 'nothing'].join(' '));
  (card.querySelector('button:not(.close)') ?? card.querySelector('button.close')).focus();
}
listButton?.addEventListener('click', showList);

// --- The address is the share link (address.js) ----------------------------------
// It holds the sheet, the centre and the picked route, rewritten in place as the map comes to
// rest: no history entry per move, so Back still leaves the page. Opening it shows the same view.

// A plain visit keeps its plain address until the view changes: it is the opening view, and the
// loading picture is fetched early only for an address without one (index.html).
const opening = writeView({ zoom: zooms[OPENING], center: home });
function remember() {
  const hash = writeView({ zoom: zooms[sheet], center: map.getCenter().toArray(), pick: picked });
  if (hash === location.hash || (!location.hash && hash === opening)) return;
  history.replaceState(history.state, '', hash);
}
map.on('moveend', remember);
// A turned phone or a resized window on the whole district needs room for its new screen.
// It may also rest at a different zoom there (rests, above).
map.on('resize', () => {
  const was = rests[sheet];
  fitWhole();
  if (!SHEETS[sheet].whole) return;
  map.setMaxBounds(roomy());
  if (framed) map.easeTo({ zoom: rests[sheet], center: frameCentre, offset: [0, -lift(rests[sheet])], duration: 0 }, { settling: true });
  else if (Math.abs(rests[sheet] - was) > 0.01) map.easeTo({ zoom: rests[sheet], duration: 0 }, { settling: true });
});
// An address edited in place, or a link to this page followed from itself.
addEventListener('hashchange', (event) => {
  // A resize can rewrite the address before this queued event is handled. Read the
  // address that was followed, so its view wins over that intervening map update.
  const v = readView(new URL(event.newURL).hash);
  if (!v || (v.center && !onMap(v.center))) return;
  openingSteps = false;
  selectedAt = null;
  if (v.center) map.jumpTo({ center: v.center });
  show(nearest(v.zoom), undefined, Boolean(v.center));
  applyAddressPick(v.pick);
});
// A picked route in the address opens its card too, as a tap on it would: closing the card
// clears the pick, the same as after a tap. A rail line's chip takes its colour from the map.
let directory = null;
const routeEntry = (p) => (directory ??= fetch(new URL('../../data/directory.json', import.meta.url)).then((r) => (r.ok ? r.json() : { routes: [] })).catch(() => ({ routes: [] })))
  .then((d) => d.routes.find((r) => r.route === p.route && r.mode === p.mode) ?? null);
// A picked route framed whole in the map left clear above its card (DESIGN.md, "the address"):
// on the link's own sheet, its middle in the middle of that clear area, where it fits there. A
// link to a closer sheet than the whole route fits on keeps its view: it shows a place on the route.
function frame(r) {
  const [w, s, e, n] = r.bbox ?? [];
  if (![w, s, e, n].every(Number.isFinite)) return;
  const box = map.getContainer().getBoundingClientRect();
  const over = card.hidden ? box.bottom : card.getBoundingClientRect().top;
  const pad = { top: 16, left: 16, right: 16, bottom: Math.max(16, box.bottom - over + 12) };
  const fit = map.cameraForBounds([[w, s], [e, n]], { padding: pad });
  if (!fit || fit.zoom < rests[sheet] - 0.05) return;
  map.jumpTo({ center: [(w + e) / 2, (s + n) / 2], zoom: rests[sheet] }, { settling: true });
  map.panBy([0, (pad.bottom - pad.top) / 2], { duration: 0 }, { settling: true });
}
function openCard(p, { framed = false } = {}) {
  if (!pickCard(p ?? {})) return;
  const fill = (r = null) => {
    if (picked !== p) return;
    const what = pickCard(p, r);
    tell({ ...what, routes: [...rails(what.rail ?? []), ...buses(what.bus ?? '')] });
  };
  fill();
  // RTD's name for it, its ends and how often it runs come from the directory, read once.
  routeEntry(p).then((r) => { if (!r) return; fill(r); if (framed && picked === p) frame(r); });
  if (p.mode === 'rail' && !colorOf.has(p.route)) map.once('idle', () => routeEntry(p).then(fill));
}
// A picked route the address names is set once the map has its style, and kept only if the
// sheets still draw it (sheets.json, routes): an old link to a route RTD has dropped opens on the
// plain map.
function applyAddressPick(p) {
  if (p && drawsRoute(drawnRoutes, p)) {
    setPick(p);
    openCard(p, { framed: true });
  } else {
    close();
    setPick(null); // also removes an invalid route from the address when no card was open
  }
}
if (asked?.pick) map.once('load', () => applyAddressPick(asked.pick));

// --- The picture shown while the map loads (index.html, #poster) -----------------

// It goes once the map has drawn the same view. The page only shows a picture whose
// drawing fingerprint matches this build. A step the reader takes before then
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

// The opening view is drawn. The tiles of a step to either side (warm) come at once: every sheet's
// tiles are there to read, cut when the site was published, so no sheet waits to be handed to the
// map (sheetsAll, which the checks wait for, is set with sheetsReady). The rest of what the page
// does for later (the offline copy) waits until the reader first touches the page, or until the
// opening has been on the screen for SETTLE_MS, so none of it competes with the opening view on a
// slow phone (DESIGN.md, "Quality floor").
map.once('idle', () => { addOtherSheets(); window.sheetsReady = true; window.sheetsAll = true; reveal(); if (touched) readerHasIt(); else setTimeout(readerHasIt, SETTLE_MS); });

// --- Offline (sw.js) ------------------------------------------------------------------
// Asked for only once the opening view is drawn and the reader has it (whenSettled), so it
// never slows it (DESIGN.md, "Quality floor"). On the first visit the files already fetched
// are handed to it to keep; from then on it sees every request itself.
//
// Every tile, the sheets' and the ground's, is fetched by the page itself (the "early" protocol,
// above), so the page's list of what it fetched holds them, and once the service worker has the
// page it sees them itself. What is kept is what was looked at: every sheet's tiles around each
// view the map rests at (warm makes the neighbouring sheets'), as the ground's always were.
const firstVisit = 'serviceWorker' in navigator && !navigator.serviceWorker.controller;
if ('serviceWorker' in navigator) {
  whenSettled(async () => {
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
      hand(firstVisit ? [new URL('../../data/directory.json', import.meta.url).href] : []);
      // What came in between, until the worker sees requests itself.
      if (!navigator.serviceWorker.controller) {
        const more = () => hand();
        map.on('idle', more);
        navigator.serviceWorker.addEventListener('controllerchange', () => { map.off('idle', more); hand(); }, { once: true });
      }
    } catch { /* no offline copy: the page works as before */ }
  });
}

// --- The stop groups' letter squares on the map (style.js, GROUP) -------------------

// Drawn here, in the theme's colours, the first time the map asks for one: a letter's square on
// its street (with a rim of ground), or a lettered stop's square. At least twice the screen's
// pixels, so their edges stay crisp.
const ratio = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
function groupImage(id) {
  const m = /^stopgroup-(street|stop)-(light|dark)-i(\d+)$/.exec(id);
  if (!m) return null;
  const c = PALETTES[m[2]];
  // A letter's own colour, by its row (style.js, GROUP_INK).
  const inks = GROUP_INK[m[2]];
  const ink = inks[Number(m[3]) % inks.length];
  const rim = m[1] === 'street' ? GROUP.streetRim : GROUP.stopRim;
  const w = (m[1] === 'street' ? GROUP.badge : GROUP.stopBadge) + 2 * rim;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(w * ratio);
  // Drawn on the CPU: its pixels are read straight back, which from the GPU stalls the map's drawing.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.scale(ratio, ratio);
  ctx.beginPath();
  ctx.roundRect(0, 0, w, w, GROUP.badgeCorner + rim);
  ctx.fillStyle = c.ground;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(rim, rim, w - 2 * rim, w - 2 * rim, GROUP.badgeCorner);
  ctx.fillStyle = ink;
  ctx.fill();
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
// The marks repeated along the express and the airport buses (style.js): the express's shield, a slanted
// plate in its rose on a rim of ground, and the airport plane, seen from above with its nose along the
// line, in the airport indigo on a disc of ground.
function markImage(id) {
  const m = /^(express-shield|airport-plane)-(light|dark)$/.exec(id);
  if (!m) return null;
  const [, kind, theme] = m;
  const c = PALETTES[theme];
  const [w, h] = kind === 'express-shield' ? [18, 10] : [13, 13];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); // read back at once (groupImage)
  ctx.scale(ratio, ratio);
  if (kind === 'express-shield') {
    const lozenge = (inset) => {
      ctx.beginPath(); ctx.moveTo(inset + 3, inset); ctx.lineTo(w - inset, inset); ctx.lineTo(w - inset - 3, h - inset); ctx.lineTo(inset, h - inset); ctx.closePath();
    };
    ctx.lineJoin = 'round';
    lozenge(0.5); ctx.fillStyle = c.ground; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = c.ground; ctx.stroke();
    lozenge(1.4); ctx.fillStyle = expressInk(theme, 2).c10; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, 2 * Math.PI); ctx.fillStyle = c.ground; ctx.fill();
    ctx.translate(w / 2, h / 2); ctx.fillStyle = airportInk(theme, 2).c10; ctx.beginPath();
    ctx.moveTo(5.2, 0); ctx.quadraticCurveTo(5, -0.9, 3.6, -0.9); ctx.lineTo(1, -0.9); ctx.lineTo(-1.6, -5); ctx.lineTo(-2.8, -5); ctx.lineTo(-1.2, -0.9);
    ctx.lineTo(-3.6, -0.9); ctx.lineTo(-4.6, -2.4); ctx.lineTo(-5.4, -2.4); ctx.lineTo(-4.8, 0);
    ctx.lineTo(-5.4, 2.4); ctx.lineTo(-4.6, 2.4); ctx.lineTo(-3.6, 0.9); ctx.lineTo(-1.2, 0.9); ctx.lineTo(-2.8, 5); ctx.lineTo(-1.6, 5); ctx.lineTo(1, 0.9);
    ctx.lineTo(3.6, 0.9); ctx.quadraticCurveTo(5, 0.9, 5.2, 0); ctx.closePath(); ctx.fill();
  }
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
// A line letter's disc on the whole district (style.js, letter-chip): a signed distance field, so
// the map inks it with the line's colour and rings it with ground as it does the circles. Its
// edge is at 192 of 255, and a pixel on screen is 32 steps of it (MapLibre's SDF_PX).
function discImage(id) {
  const m = /^letter-disc-([\d.]+)$/.exec(id);
  if (!m) return null;
  const r = Number(m[1]) * 2;
  const side = Math.ceil(2 * r + 12);
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const d = Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2);
    const i = (y * side + x) * 4;
    data.set([255, 255, 255, Math.max(0, Math.min(255, 192 + (r - d) * 16))], i);
  }
  return { width: side, height: side, data };
}
// The arrow a far end's name points with (style.js, pointer): a shaft and an open head, pointing
// east, as a distance field the page inks and haloes. 12 px long, drawn at twice that.
function arrowImage(id) {
  if (id !== 'pointer-arrow') return null;
  const [len, head, half, pad] = [24, 9, 1.8, 6];
  const [w, h] = [len + 2 * pad, 2 * head + 2 * pad];
  const [x0, x1, y] = [pad, pad + len, h / 2];
  const segs = [[[x0, y], [x1, y]], [[x1, y], [x1 - head, y - head]], [[x1, y], [x1 - head, y + head]]];
  const toSeg = (px, py, [[ax, ay], [bx, by]]) => {
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = Math.min(...segs.map((sg) => toSeg(i + 0.5, j + 0.5, sg))) - half;
    data.set([255, 255, 255, Math.max(0, Math.min(255, 192 - d * 16))], (j * w + i) * 4);
  }
  return { width: w, height: h, data };
}
map.setMissingStyleImageResolver((id) => {
  const arrow = !map.hasImage(id) && arrowImage(id);
  if (arrow) return map.addImage(id, arrow, { pixelRatio: 2, sdf: true });
  const disc = !map.hasImage(id) && discImage(id);
  if (disc) return map.addImage(id, disc, { pixelRatio: 2, sdf: true });
  const mark = !map.hasImage(id) && markImage(id);
  if (mark) return map.addImage(id, mark, { pixelRatio: ratio });
  const image = !map.hasImage(id) && groupImage(id);
  if (image) map.addImage(id, image, { pixelRatio: ratio });
});
window.sheetsMap = map;
window.sheetsZooms = { zooms, rests, ids: SHEETS.map((s) => s.id) }; // for js/steptest.js
