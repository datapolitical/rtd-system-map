// Tap anything and it explains itself (DESIGN.md, "One tap model"): what a tap
// on the map opens, what each panel says, and how an open route is
// highlighted. The next features (search, the Lines list) open things through
// the functions exported here:
//
//   openRoute(code)    a route, highlighted end to end
//   openStation(id)    a station (id as in directory.json / stations.geojson)
//   openStop(id)       a bus stop (id as in stops.geojson)
//   openPlace(id)      a Park-n-Ride or transit center (id as in facilities.geojson)
//   openLines()        the list of every route, grouped by how often it comes
//   closePanel()       close whatever is open and restore the map
//
// Search (search.js) also reads the data through loadDirectory(), loadData()
// and places(), so there is one copy of each file.
//
// All of them need initSelection() to have run (main.js does that), and wait
// for the directory (loadDirectory) if it hasn't arrived yet.

import * as ui from './panel.js';
import { setHighlight, setEnds } from './highlight.js';
import { TIERS, TIER_RANK, bullet, dayFreq, date, esc, freq, goesText, isPhone, joinDot, middayPhrase, time, weekendOnly } from './shared.js';

const ROUTE_LAYERS = ['street', 'bus-part-time', 'bus-limited', 'rail', 'rail-part-time'];
const STATION_LAYERS = ['stations', 'stations-dot', 'stations-unserved'];
const TAG_LAYERS = ['rail-bullets', 'rail-edge-letters', 'line-signs'];
const POINTER_LAYERS = [...ROUTE_LAYERS, ...STATION_LAYERS, 'facilities', 'stops', ...TAG_LAYERS, 'flexride-fill', 'vehicles-rail', 'vehicles-bus'];

// A park-and-ride or transit center this close to a station is that station's
// (the data puts every station's own facility within 260 m, and the next
// nearest at 640 m or more).
const STATION_RADIUS = 300; // metres
// Routes "within a short walk" of a place that isn't a station: about five
// minutes on foot.
const WALK_RADIUS = 400; // metres
// A long list of buses shows this many, then a button for the rest.
const SHOWN = 6;

let map;
let ctx; // { lines, legend, opening }
let directory; // promise of the indexed directory
let dir;
let view = null; // what the panel shows: { key, label, at, refit, run }
let trail = []; // views to go back to
let token = 0; // newest open wins
let legendMemo = false; // the key was open when the panel took its corner
let legendSet = null; // the open state we set ourselves (to ignore its toggle event)
const flexZones = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

// --- Data ---------------------------------------------------------------

export function loadDirectory() {
  directory ??= fetch('data/directory.json')
    .then((res) => {
      if (!res.ok) throw new Error(`directory.json: ${res.status}`);
      return res.json();
    })
    .then((d) => {
      dir = {
        routes: new Map(d.routes.map((r) => [r.route, r])),
        stations: new Map(d.stations.map((s) => [s.id, s])),
        list: d.stations,
      };
      return dir;
    })
    .catch((err) => {
      directory = null;
      throw err;
    });
  return directory;
}

const files = {};
export const loadData = (name) => loadFile(name);
const loadFile = (name) =>
  (files[name] ??= fetch(`data/${name}.geojson`)
    .then((res) => {
      if (!res.ok) throw new Error(`${name}.geojson: ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      delete files[name];
      throw err;
    }));

// --- Geometry -----------------------------------------------------------

const M = 111320; // metres per degree of latitude
function metres(a, b) {
  const dx = (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180) * M;
  return Math.hypot(dx, (a[1] - b[1]) * M);
}

function distToSegment(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const [px, py] = [p[0] * k, p[1]];
  const [ax, ay] = [a[0] * k, a[1]];
  const [bx, by] = [b[0] * k, b[1]];
  const len = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len)) : 0;
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) * M;
}

function distToFeature(p, geometry) {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
  let best = Infinity;
  for (const line of lines) for (let i = 1; i < line.length; i++) best = Math.min(best, distToSegment(p, line[i - 1], line[i]));
  return best;
}

// Stretches this close to the nearest one count as meeting at the spot.
const STRETCH_JOIN = 30; // metres

// The stretch of a route that passes nearest a spot: what the route is like
// right there. Null when the map hasn't got that part of the route loaded.
function stretchAt(code, at) {
  const near = [];
  let bestDistance = Infinity;
  for (const f of map.querySourceFeatures('routes', { filter: ['==', ['get', 'route'], code] })) {
    const d = distToFeature(at, f.geometry);
    near.push([d, f.properties]);
    bestDistance = Math.min(bestDistance, d);
  }
  // Where two stretches meet, the buses of the busier one all pass the spot,
  // so the busier stretch is what the route is like there.
  let best = null;
  for (const [d, p] of near) {
    if (d > bestDistance + STRETCH_JOIN) continue;
    const stronger = !best || (TIER_RANK[p.tier] ?? 0) > (TIER_RANK[best.tier] ?? 0)
      || ((TIER_RANK[p.tier] ?? 0) === (TIER_RANK[best.tier] ?? 0) && (p.wk ?? 999) < (best.wk ?? 999));
    if (stronger) best = p;
  }
  return best;
}

// --- Rows: one route, wherever routes are listed ---------------------------

const words = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });

// "Union Station – Denver Airport", or from a station that is one of the ends,
// just the other end: "To Denver Airport".
function goesFrom(r, station) {
  const ends = r.goes ?? [];
  const here = ends.findIndex((g) => g.at && station.at && metres(g.at, station.at) < STATION_RADIUS);
  if (here >= 0 && ends.length === 2) return `To ${ends[1 - here].name}`;
  return goesText(r);
}

// One route as it is at a place: its own numbers where the data has the
// stretch there, the whole route's otherwise. `props` is that stretch, if known.
function rowData(code, props, from) {
  const r = dir.routes.get(code);
  if (!r) return null;
  const here = props ?? r;
  let text = here.tier === 'none' ? weekendOnly(here, !!props) : freq(here);
  // A stretch that differs from its route says so.
  if (props && here.tier !== 'none' && props.route_tier !== undefined && freq({ tier: props.route_tier, wk: props.route_wk }) !== text) text += ' here';
  return { code, r, text, rank: TIER_RANK[here.tier] ?? 0, wk: here.wk ?? 999, rail: r.mode === 'rail', where: from ? goesFrom(r, from) : goesText(r) };
}

const byStrength = (a, b) => b.rail - a.rail || b.rank - a.rank || a.wk - b.wk || natural(a.code, b.code);

const CHEVRON = '<svg class="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>';

function rowHtml(row, extra = false) {
  return `<li${extra ? ' class="extra" hidden' : ''}><button type="button" class="row" data-open="route:${esc(row.code)}">${bullet(row.r, ctx.lines)}<span class="row-text"><span class="row-main">${esc(row.where)}</span><span class="row-sub">${esc(row.text)}</span></span>${CHEVRON}</button></li>`;
}

// A list of rows, strongest first; a long one shows a few and a button for the rest.
function rowsHtml(rows, { cap = SHOWN, noun = 'routes', tail = '' } = {}) {
  rows = rows.filter(Boolean).sort(byStrength);
  const items = rows.map((row, i) => rowHtml(row, i >= cap && rows.length > cap + 1)).join('');
  const hidden = rows.length > cap + 1 ? rows.length - cap : 0;
  const label = `Show ${hidden} more ${noun}`;
  const more = hidden ? `<li class="more-item"><button type="button" class="more" data-more data-label="${label}" aria-expanded="false">${label}</button></li>` : '';
  return `<ul class="rows">${items}${more}${tail}</ul>`;
}

const section = (heading, inner) => `<section><h3>${heading}</h3>${inner}</section>`;
const ext = '<svg class="ext" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4.5H4.5v11h11V12M11 4.5h4.5V9M15.5 4.5 9 11" /></svg>';
// RTD's layer and GTFS give FlexRide zones no booking link today, so this
// general FlexRide page is the fallback when a zone has no url of its own.
const FLEXRIDE_FALLBACK_URL = 'https://www.rtd-denver.com/routes-services/other-services/flexride';
const link = (href, text) =>
  /^https?:\/\//.test(href ?? '') ? `<a class="link" href="${esc(href)}" target="_blank" rel="noopener">${text}${ext}</a>` : '';

// --- Opening and closing --------------------------------------------------

function open(next, fromPanel) {
  if (fromPanel && view) trail.push(view);
  else trail = [];
  view = next;
  const mine = ++token;
  Promise.resolve(loadDirectory())
    .then(() => mine === token && next.run(mine))
    .catch((err) => {
      console.error(err);
      if (mine === token) {
        ui.show({ head: 'Something went wrong', content: '<p class="plain">The route details aren\'t loading. Close this and try again.</p>' });
      }
    });
}

function present(parts) {
  const back = trail.at(-1);
  ui.show({ ...parts, backLabel: back ? `Back to ${back.label}` : '' });
  setLegend(false, true);
}

export function closePanel({ focus = true } = {}) {
  if (ui.isOpen()) ui.hide({ focus });
  else clearSelection();
}

function clearSelection() {
  token++;
  view = null;
  trail = [];
  setHighlight(map, '');
  setEnds(map, []);
}

// The key and the panel share a corner on wide screens: the key folds to its
// button while a panel is open, and comes back when the panel closes. Opened
// by hand while a panel is up, the key takes the corner and the panel steps
// aside until it closes.
function setLegend(open, remember = false) {
  const { legend } = ctx;
  if (legend.open === open) return;
  if (remember && legend.open && !isPhone()) legendMemo = true;
  legendSet = open;
  legend.open = open;
}

// --- Map placement ---------------------------------------------------------

const duration = () => (reducedMotion.matches ? 0 : 450);

// The part of the map the panel leaves free, with the key button's room.
function freeBox() {
  const c = ui.covered();
  const phone = isPhone();
  return {
    left: c.left + 12,
    right: innerWidth - c.right - 12,
    top: phone ? ui.TOP_ROOM : 12,
    bottom: innerHeight - c.bottom - (phone ? 8 : 12),
  };
}

function fitPadding() {
  const b = freeBox();
  // Room at the sides for the names of a route's ends.
  const pad = 28;
  const side = 56;
  return { top: b.top + pad, left: b.left + side, right: innerWidth - b.right + side, bottom: innerHeight - b.bottom + pad };
}

// Bring a spot into the free part of the map without moving it if it's
// already clear of the panel.
function reveal(at, { minZoom = 0 } = {}) {
  const b = freeBox();
  const p = map.project(at);
  const margin = 56;
  const clear = p.x > b.left + margin && p.x < b.right - margin && p.y > b.top + margin && p.y < b.bottom - margin;
  const zoom = map.getZoom() < minZoom ? minZoom : undefined;
  if (clear && zoom === undefined) return;
  map.easeTo({
    center: at,
    zoom,
    offset: [(b.left + b.right) / 2 - innerWidth / 2, (b.top + b.bottom) / 2 - innerHeight / 2],
    duration: duration(),
  });
}

function fitRoute(r) {
  const [w, s, e, n] = r.bbox;
  map.fitBounds([[w, s], [e, n]], { padding: fitPadding(), maxZoom: 15, duration: duration() });
}

// --- Views -------------------------------------------------------------------

const routeView = (code) => ({
  key: `route:${code}`,
  get label() {
    const r = dir?.routes.get(code);
    return r ? (r.mode === 'rail' ? `${code} Line` : `route ${code}`) : 'the route';
  },
  async run(mine) {
    const r = dir.routes.get(code);
    if (!r) return closePanel({ focus: false });
    const rail = r.mode === 'rail';
    const stations = (r.stations ?? []).map((id) => dir.stations.get(id)).filter(Boolean);

    let headline;
    if (r.tier === 'none' || r.tier === 'unknown') headline = '<strong>No weekday service</strong>';
    else if (r.tier === 'peak' || r.tier === 'limited' || !r.wk) headline = `<strong>${esc(freq(r))}</strong><span>weekdays</span>`;
    else headline = `<strong>${esc(freq(r))}</strong><span>${esc(middayPhrase())}</span>`;

    const week = [
      ['Weekdays', freq(r)],
      ['Saturday', dayFreq(r.sa, r.sa_trips, 'Saturday')],
      ['Sunday', dayFreq(r.su, r.su_trips, 'Sunday')],
    ]
      .map(([day, text]) => `<div><dt>${day}</dt><dd>${esc(text)}</dd></div>`)
      .join('');
    const hours = r.wk_first && r.wk_trips ? `<p class="plain">First trip ${time(r.wk_first)}, last ${time(r.wk_last)} on weekdays</p>` : '';

    const stationRows = stations.length
      ? section(
          rail ? 'Stations' : 'Connects with trains at',
          `<ul class="rows compact">${stations
            .map(
              (s) =>
                `<li><button type="button" class="row" data-open="station:${s.id}"><span class="row-text"><span class="row-main">${esc(s.label || s.name)}</span>${s.served ? '' : '<span class="row-sub">Closed: no trains this week</span>'}</span>${CHEVRON}</button></li>`,
            )
            .join('')}</ul>`,
        )
      : '';

    present({
      head: `${rail ? bullet(r, ctx.lines).replace('<span class="bullet', '<span aria-hidden="true" class="bullet') : bullet(r, ctx.lines)} <span>${esc(rail ? `${code} Line` : r.name || `Route ${code}`)}</span>`,
      subtitle: esc(goesText(r)),
      content: `<div class="headline">${headline}</div><dl class="week">${week}</dl>${hours}<p class="plain" id="stretch-note" hidden></p>${stationRows}${link(r.url, "Timetable on RTD's site")}`,
    });

    view.refit = () => fitRoute(r);
    setHighlight(map, code, stations.map((s) => s.id));
    setEnds(map, r.goes);
    fitRoute(r);

    // Once the route is on screen, say if it is not the same all along.
    map.once('idle', () => {
      if (mine !== token) return;
      const seen = new Map();
      for (const f of map.querySourceFeatures('routes', { filter: ['==', ['get', 'route'], code] })) {
        const p = f.properties;
        const text = p.tier === 'none' ? weekendOnly(p, true) : freq(p);
        if (!seen.has(p.stretch)) seen.set(p.stretch, text);
      }
      const texts = [...new Set(seen.values())];
      if (texts.length > 1) {
        const note = document.getElementById('stretch-note');
        note.textContent = `Not the same all along: ${texts.map((t) => t[0].toLowerCase() + t.slice(1)).join('; ')}. The thinner, fainter parts on the map come less often.`;
        note.hidden = false;
        ui.refit();
      }
    });
  },
});

const stationView = (id, { move = false } = {}) => ({
  key: `station:${id}`,
  get label() {
    const s = dir?.stations.get(id);
    return s?.label || s?.name || 'the station';
  },
  async run(mine) {
    const s = dir.stations.get(id);
    if (!s) return closePanel({ focus: false });
    const rows = (codes) => words(codes).map((c) => rowData(c, stretchAt(c, s.at), s));
    const trains = words(s.lines).length ? section('Trains', rowsHtml(rows(s.lines), { cap: 99 })) : '';
    const buses = words(s.buses).length ? section('Buses that stop here', rowsHtml(rows(s.buses), { noun: 'buses' })) : '';

    let parking = '';
    if (s.parking > 0) {
      const fees = await loadFile('facilities').then(
        (g) => g.features.find((f) => f.properties.fees && metres(f.geometry.coordinates, s.at) < STATION_RADIUS)?.properties.fees,
        () => null,
      );
      if (mine !== token) return;
      parking = section('Parking', `<p class="plain">${s.parking.toLocaleString()} parking spaces</p>${link(fees, 'Parking details')}`);
    }

    const closed = s.served ? '' : s.returns ? `Trains return ${date(s.returns)}` : 'Closed: no trains this week';
    present({
      head: `<span>${esc(s.label || s.name)}</span>`,
      subtitle: closed ? `<strong>${esc(closed)}</strong>` : '',
      content: (trains + buses + parking) || '<p class="plain">No routes are listed for this station.</p>',
    });
    setHighlight(map, '');
    setEnds(map, []);
    view.at = s.at;
    view.refit = () => reveal(s.at);
    reveal(s.at, { minZoom: move ? 14 : 0 });
  },
});

const stopView = (props, at, { move = false } = {}) => ({
  key: `stop:${props.id}`,
  label: props.name,
  async run() {
    const rows = words(props.lines).map((c) => rowData(c, stretchAt(c, at)));
    const where = joinDot([`Stop ${props.id}`, props.heading]);
    present({
      head: `<span>${esc(props.name)}</span>`,
      subtitle: where,
      content: rows.some(Boolean)
        ? section('Routes that stop here', rowsHtml(rows, { noun: 'routes' }))
        : '<p class="plain">No routes are listed for this stop.</p>',
    });
    setHighlight(map, '');
    setEnds(map, [], at);
    view.at = at;
    view.refit = () => reveal(at);
    reveal(at, { minZoom: move ? 16 : 0 });
  },
});

// A Park-n-Ride or transit center that isn't at a station: what it has, and
// the routes at stops within a short walk.
const placeKind = (props) => (props.class === 'TS' ? 'Transit center' : props.spaces > 0 ? 'Park-n-Ride' : 'Transit center');
const placeView = (props, at, { move = false } = {}) => ({
  key: `place:${props.id}`,
  label: props.name,
  async run(mine) {
    const kind = placeKind(props);
    const spaces = props.spaces > 0 ? `<p class="plain">${Number(props.spaces).toLocaleString()} parking spaces</p>${link(props.fees, 'Parking details')}` : '';
    const shell = (routes) =>
      present({
        head: `<span>${esc(props.name)}</span>`,
        subtitle: esc(kind),
        content: `${spaces}${routes}`,
      });
    shell(section('Routes nearby', '<p class="plain">Looking for routes at stops within a five-minute walk…</p>'));
    setHighlight(map, '');
    setEnds(map, [], at);
    view.at = at;
    view.refit = () => reveal(at);
    reveal(at, { minZoom: move ? 15 : 0 });

    let html;
    try {
      const stops = (await loadFile('stops')).features.filter((f) => metres(f.geometry.coordinates, at) <= WALK_RADIUS);
      const codes = [...new Set(stops.flatMap((f) => words(f.properties.lines)))];
      const rows = codes.map((c) => rowData(c, stretchAt(c, at)));
      html = rows.some(Boolean)
        ? section('Routes within a five-minute walk', `<p class="plain">At bus stops within ${WALK_RADIUS} m (about a quarter mile) of here.</p>${rowsHtml(rows)}`)
        : section('Routes nearby', '<p class="plain">No bus stops are listed within a five-minute walk.</p>');
    } catch {
      html = section('Routes nearby', "<p class=\"plain\">The nearby stops aren't loading. Close this and try again.</p>");
    }
    if (mine !== token) return;
    shell(html);
    ui.refit();
  },
});

// Several routes at once: what a tap on a street, a label run, or a sign opens.
const listView = (title, entries, at, flex) => ({
  key: `list:${title}:${at.join()}`,
  label: title.toLowerCase(),
  async run() {
    const rows = entries.map(([code, props]) => rowData(code, props));
    let tail = '';
    if (flex) {
      flexZones.set(flex.name, flex);
      tail = `<li><button type="button" class="row" data-open="flex:${esc(flex.name)}"><span class="flex-swatch" aria-hidden="true"></span><span class="row-text"><span class="row-main">FlexRide: ${esc(flex.name)}</span><span class="row-sub">Book a ride inside this area</span></span>${CHEVRON}</button></li>`;
    }
    present({
      head: `<span>${esc(title)}</span>`,
      content: rows.some(Boolean) ? rowsHtml(rows, { tail, cap: 99 }) : `<ul class="rows">${tail}</ul>`,
    });
    setHighlight(map, '');
    setEnds(map, []);
    view.at = at;
    view.refit = () => reveal(at);
    reveal(at);
  },
});

const flexView = (zone, at) => ({
  key: `flex:${zone.name}`,
  label: `${zone.name} FlexRide`,
  async run() {
    flexZones.set(zone.name, zone);
    present({
      head: `<span>FlexRide: ${esc(zone.name)}</span>`,
      subtitle: 'Shaded on the map',
      content: `<p class="plain">FlexRide is a small shared bus that you book for trips inside the shaded area. It doesn't follow a fixed route or stop at every corner.</p>${link(zone.url || FLEXRIDE_FALLBACK_URL, "Book on RTD's site")}`,
    });
    setHighlight(map, '');
    setEnds(map, []);
    view.at = at;
    view.refit = () => reveal(at);
    reveal(at);
  },
});

// Every route, grouped the way the key groups them: trains, then the bus tiers
// from the most frequent down, in the key's own words.
function lineGroups() {
  const all = [...dir.routes.values()].sort((a, b) => natural(a.route, b.route));
  const groups = [];
  const trains = all.filter((r) => r.mode === 'rail');
  if (trains.length) groups.push({ heading: 'Trains', routes: trains });
  const buses = all.filter((r) => r.mode !== 'rail');
  const seen = new Set();
  for (const t of TIERS) {
    if (seen.has(t.label)) continue;
    seen.add(t.label);
    const ids = TIERS.filter((x) => x.label === t.label).map((x) => x.id);
    const routes = buses.filter((r) => ids.includes(r.tier));
    if (routes.length) groups.push({ heading: t.label, routes, bus: true });
  }
  const rest = buses.filter((r) => !TIERS.some((t) => t.id === r.tier));
  if (rest.length) groups.push({ heading: 'No weekday service', routes: rest, bus: true });
  return groups;
}

function lineRow(r) {
  const text = r.tier === 'none' || r.tier === 'unknown' ? weekendOnly(r) : freq(r);
  const main = r.mode === 'rail' ? goesText(r) : r.name || `Route ${r.route}`;
  const label = r.mode === 'rail' ? `${r.route} Line` : `Route ${r.route}`;
  return `<li><button type="button" class="row" data-open="route:${esc(r.route)}" aria-label="${esc(`${label}, ${main}, ${text}`)}">${bullet(r, ctx.lines)}<span class="row-text"><span class="row-main">${esc(main)}</span><span class="row-sub">${esc(text)}</span></span>${CHEVRON}</button></li>`;
}

const linesView = () => ({
  key: 'lines',
  label: 'lines',
  last: null, // the route opened from here, so Back lands on its row
  async run() {
    const content = lineGroups()
      .map((g) => section(`${g.bus ? '<span class="sr-only">Buses </span>' : ''}${esc(g.heading)}`, `<ul class="rows">${g.routes.map(lineRow).join('')}</ul>`))
      .join('');
    present({ head: '<span>Lines</span>', content: content || '<p class="plain">No routes are listed.</p>' });
    setHighlight(map, '');
    setEnds(map, []);
    view.refit = () => {};
    const back = this.last && ui.body.querySelector(`[data-open="route:${CSS.escape(this.last)}"]`);
    if (back) back.focus();
  },
});

// --- Public ---------------------------------------------------------------

export function openRoute(code) {
  open(routeView(String(code)), false);
}

export function openLines() {
  open(linesView(), false);
}

// Park-n-Rides and transit centers that aren't at a station (the ones at a
// station are that station), for search.
export async function places() {
  const [g] = await Promise.all([loadFile('facilities'), loadDirectory().catch(() => null)]);
  return g.features
    .filter((f) => (f.properties.spaces > 0 || f.properties.class === 'TS') && !dir?.list.some((s) => metres(s.at, f.geometry.coordinates) <= STATION_RADIUS))
    .map((f) => ({ id: f.properties.id, name: f.properties.name, kind: placeKind(f.properties), spaces: Number(f.properties.spaces) || 0 }));
}

export async function openPlace(id) {
  try {
    const f = (await loadFile('facilities')).features.find((x) => String(x.properties.id) === String(id));
    if (!f) return;
    await loadDirectory().catch(() => {});
    const home = dir?.list.find((s) => metres(s.at, f.geometry.coordinates) <= STATION_RADIUS);
    if (home) return openStation(home.id);
    open(placeView(f.properties, f.geometry.coordinates, { move: true }), false);
  } catch (err) {
    console.error(err);
  }
}

export function openStation(id) {
  const n = Number(id);
  open(stationView(n, { move: true }), false);
  loadDirectory().then(() => {
    const s = dir.stations.get(n);
    if (s) map.easeTo({ center: s.at, zoom: Math.max(map.getZoom(), 14), duration: duration() });
  });
}

export async function openStop(id) {
  const want = String(id);
  try {
    const f = (await loadFile('stops')).features.find((x) => String(x.properties.id) === want);
    if (!f) return;
    open(stopView(f.properties, f.geometry.coordinates, { move: true }), false);
  } catch (err) {
    console.error(err);
  }
}

// --- Taps ------------------------------------------------------------------

function near(point, pad, layers) {
  const layer = layers.filter((id) => map.getLayer(id));
  return map.queryRenderedFeatures([[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]], { layers: layer });
}

// The closest of some point features to where the finger landed.
function closest(features, point) {
  let best = null;
  let bestD = Infinity;
  for (const f of features) {
    const p = map.project(f.geometry.coordinates);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestD) [best, bestD] = [f, d];
  }
  return best;
}

// Each route once, at its stretch nearest the tap. A street names every
// route along it (`routes`); each is then described by its own stretch there.
function routesNear(features, at) {
  const best = new Map();
  for (const f of features) {
    const d = distToFeature(at, f.geometry);
    const codes = f.properties.route ? [f.properties.route] : words(f.properties.routes);
    for (const code of codes) if (!best.has(code) || d < best.get(code).d) best.set(code, { d, props: f.properties.route ? f.properties : null });
  }
  return [...best].map(([code, { props }]) => [code, props ?? stretchAt(code, at) ?? null]);
}

async function onTap(e) {
  ui.rememberOpener(null);
  const pad = coarse.matches ? 16 : 8;
  const at = [e.lngLat.lng, e.lngLat.lat];
  if (isPhone()) setLegend(false);

  // A vehicle (Live): its route. live.js answers, when Live is on.
  if (ctx.tapped?.(e.point, pad)) return;

  // A place: station (whichever symbol was hit), then Park-n-Ride, then a
  // stop or a gate, and only then a bus terminal's hall: the hall lies under
  // its own gates and the stops beside it, and a tap on one of those means
  // that stop, not the whole station.
  const station = closest(near(e.point, pad, STATION_LAYERS), e.point);
  const facility = closest(near(e.point, pad, ['facilities']), e.point);
  const stop = closest(near(e.point, pad, ['stops', 'stops-gate']), e.point);
  if (station) return open(stationView(Number(station.properties.id)), false);
  if (facility) {
    await loadDirectory().catch(() => {});
    const where = facility.geometry.coordinates;
    const home = dir?.list.find((s) => metres(s.at, where) <= STATION_RADIUS);
    return open(home ? stationView(home.id) : placeView(facility.properties, where), false);
  }
  if (stop) return open(stopView(stop.properties, stop.geometry.coordinates), false);
  const terminal = near(e.point, 0, ['bus-terminal', 'bus-terminal-under'])[0];
  if (terminal) {
    await loadDirectory().catch(() => {});
    const where = e.lngLat.toArray();
    const home = dir?.list.find((s) => metres(s.at, where) <= STATION_RADIUS);
    return open(home ? stationView(home.id) : placeView(terminal.properties, where), false);
  }

  // A route's own number or letter, or a sign: that line.
  const tag = near(e.point, coarse.matches ? 14 : 9, TAG_LAYERS)[0];
  if (tag) {
    const p = tag.properties;
    const codes = words(tag.layer.id === 'bus-tags-region' || tag.layer.id === 'rail-bullets' || tag.layer.id === 'rail-edge-letters' ? p.route : tag.layer.id === 'line-signs' ? p.lines : p.routes);
    if (codes.length === 1) return open(routeView(codes[0]), false);
    if (codes.length > 1) {
      await loadDirectory().catch(() => {});
      return open(listView('Routes on this street', codes.map((c) => [c, stretchAt(c, at)]), at), false);
    }
  }

  // Lines under the finger, and a FlexRide zone under them.
  const routes = routesNear(near(e.point, pad, ROUTE_LAYERS), at);
  const zone = map.getLayer('flexride-fill') ? map.queryRenderedFeatures(e.point, { layers: ['flexride-fill'] })[0] : null;
  if (routes.length) return open(listView('Routes here', routes, at, zone?.properties), false);
  if (zone) return open(flexView(zone.properties, at), false);
  closePanel({ focus: false });
}

export function initSelection(theMap, context) {
  map = theMap;
  ctx = context;

  map.on('click', onTap);
  for (const id of POINTER_LAYERS) {
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
  }

  ui.on({
    close() {
      clearSelection();
      ui.stepAside(false);
      if (legendMemo) setLegend(true);
      legendMemo = false;
    },
    back() {
      const previous = trail.pop();
      if (!previous) return;
      view = previous;
      const mine = ++token;
      Promise.resolve(loadDirectory()).then(() => mine === token && previous.run(mine));
    },
    resize() {
      view?.refit?.();
    },
  });

  // Rows in a panel open what they name; "Show more" opens the rest of a list.
  ui.body.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (more) {
      const list = more.closest('ul');
      const open = more.getAttribute('aria-expanded') !== 'true';
      for (const li of list.querySelectorAll('li.extra')) li.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show fewer' : more.dataset.label;
      ui.refit();
      return;
    }
    const row = e.target.closest('[data-open]');
    if (!row) return;
    const [kind, ...rest] = row.dataset.open.split(':');
    const id = rest.join(':');
    if (kind === 'route') {
      if (view?.key === 'lines') view.last = id;
      open(routeView(id), true);
    }
    else if (kind === 'station') open(stationView(Number(id)), true);
    else if (kind === 'flex' && flexZones.has(id)) open(flexView(flexZones.get(id), view?.at ?? map.getCenter().toArray()), true);
  });

  // The key and the panel share a corner (see setLegend).
  ctx.legend.addEventListener('toggle', () => {
    if (legendSet === ctx.legend.open) {
      legendSet = null;
      return;
    }
    legendSet = null;
    if (ctx.legend.open) legendMemo = false;
    ui.stepAside(ctx.legend.open && ui.isOpen());
  });
}
