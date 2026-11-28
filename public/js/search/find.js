// What search finds, and in what order (DESIGN.md, "Search"): routes by number, letter or name,
// rail stations, Park-n-Rides and transit centers, and bus stops by name or stop number. Pure:
// it takes RTD's built data (directory.json, facilities.geojson, stops.geojson) and a typed
// query, and returns results that say what each is and where it is. It knows nothing of the map
// that shows them, so the zoomable map uses it as it is (test/search-find.test.mjs).

export const SHOWN = 8; // results at most
// How many each group gets first; room a group doesn't use goes to the groups below.
const QUOTA = { routes: 4, stations: 3, places: 2, stops: 3 };
export const HEADINGS = { routes: 'Routes', stations: 'Stations', places: 'Park-n-Rides and transit centers', stops: 'Bus stops' };
const ORDER = ['routes', 'stations', 'places', 'stops'];
// A match score this high is a weak one: the words were found inside other words, or only in
// the names of a route's ends.
const WEAK = 3;
// A Park-n-Ride or transit center this close to a rail station is that station's own, and is
// found as the station. The routes of a place are those at stops within a five-minute walk.
const AT_STATION_M = 300;
export const WALK_M = 400;
// The service tiers, most frequent first: a tie between two routes goes to the one that comes more often.
const TIERS = ['frequent', 'every30', 'hourly', 'infrequent', 'peak', 'limited', 'none', 'unknown'];

export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const wordsOf = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
// One collator, made once: `localeCompare` makes one per call, and a single letter matches thousands of stops.
const natural = new Intl.Collator('en', { numeric: true }).compare;

/** Metres between two [lon, lat] points, near enough for a walk. */
export function metres(a, b) {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
  const y = (b[1] - a[1]) * k;
  return Math.hypot(x, y) * 6371000;
}

// How well every word of the query matches the words of a name: 0 is a perfect match, higher is
// worse, null is no match. Each query word must start a word of the name (or, from three
// letters, be inside one).
function match(tokens, words) {
  let total = 0;
  for (const t of tokens) {
    let best = Infinity;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === t) best = Math.min(best, i * 0.1);
      else if (w.startsWith(t)) best = Math.min(best, 1 + i * 0.1);
      else if (t.length >= 3 && w.includes(t)) best = Math.min(best, 3 + i * 0.1);
    }
    if (best === Infinity) return null;
    total += best;
  }
  return total + words.length * 0.01;
}
// The query is the whole name, word for word.
const whole = (tokens, words) => tokens.length === words.length && tokens.every((t, i) => t === words[i]);

const routeCodes = (text) => String(text ?? '').split(/[,\s]+/).filter(Boolean);
/** What a Park-n-Ride or transit center is called, from RTD's facility record. */
export const placeKind = (p) => (p.class !== 'TS' && p.spaces > 0 ? 'Park-n-Ride' : 'Transit center');

/**
 * The index search reads. Any part may be missing while its file is still loading: `directory`
 * is directory.json, `facilities` and `stops` are GeoJSON. Stops that are a station's platforms
 * are left to the station.
 */
export function buildIndex({ directory = null, facilities = null, stops = null } = {}) {
  const modeOf = new Map((directory?.routes ?? []).map((r) => [r.route, r]));
  // A route as a card shows it: its mode, and a rail line's colour, from the directory.
  const asRoutes = (codes) => [...new Set(codes)].sort(natural).map((route) => {
    const r = modeOf.get(route);
    return { mode: r?.mode === 'rail' ? 'rail' : 'bus', route, ...(r?.mode === 'rail' && r.color ? { color: r.color } : {}) };
  });
  const routes = (directory?.routes ?? []).map((r) => ({
    r,
    code: fold(r.route),
    alias: r.code ? fold(r.code) : null, // RTD's map code for the route ("BOND" for the Bound)
    words: wordsOf(`${r.route} ${r.mode === 'rail' ? 'line' : ''} ${r.name ?? ''}`),
    goes: wordsOf((r.goes ?? []).map((g) => g.name).join(' ')),
  }));
  const stations = (directory?.stations ?? []).map((s) => ({
    s,
    words: wordsOf(`${s.label ?? ''} ${s.name ?? ''}`),
    routes: [...asRoutes(routeCodes(s.lines)).map((x) => ({ ...x, mode: 'rail' })), ...asRoutes(routeCodes(s.buses))],
  }));
  const stopList = (stops?.features ?? []).filter((f) => !f.properties.platform).map((f) => ({
    p: f.properties,
    at: f.geometry.coordinates,
    id: String(f.properties.id),
    words: wordsOf(f.properties.name),
    routes: asRoutes(routeCodes(f.properties.lines ?? f.properties.routes)),
  }));
  const places = (facilities?.features ?? [])
    .filter((f) => !(directory?.stations ?? []).some((s) => s.at && metres(s.at, f.geometry.coordinates) <= AT_STATION_M))
    .map((f) => ({ p: f.properties, at: f.geometry.coordinates, words: wordsOf(f.properties.name) }));
  return { routes, stations, places, stops: stopList, asRoutes };
}

/** Every match for a query, by group, best first. */
export function find(index, query) {
  const q = fold(query).trim();
  const tokens = wordsOf(query);
  const compact = q.replace(/\s+/g, '');
  const found = { routes: [], stations: [], places: [], stops: [] };
  if (!tokens.length) return found;

  for (const e of index.routes ?? []) {
    let score = null;
    if (e.code === compact || e.alias === compact) score = -10;
    else if (e.r.mode === 'rail' && tokens.length === 2 && tokens[1] === 'line' && e.code === tokens[0]) score = -9;
    else if (tokens.length === 1 && e.code.startsWith(compact)) score = -5 + e.code.length * 0.01;
    else {
      const own = match(tokens, e.words);
      const far = own === null ? match(tokens, e.goes) : null;
      score = own ?? (far === null ? null : 4 + far);
    }
    // Ties go to trains, then to the route that comes most often.
    const tier = Math.max(0, TIERS.indexOf(e.r.tier));
    if (score !== null) found.routes.push({ kind: 'route', exact: score <= -9, score: score - (e.r.mode === 'rail' ? 0.5 : 0) + tier * 0.01 + (e.r.wk ?? 99) / 1000, e });
  }
  for (const e of index.stations ?? []) {
    const score = match(tokens, e.words);
    if (score !== null) found.stations.push({ kind: 'station', exact: whole(tokens, wordsOf(e.s.label)) || whole(tokens, wordsOf(e.s.name)), score: score + (e.s.served ? 0 : 0.5), e });
  }
  for (const e of index.places ?? []) {
    const score = match(tokens, e.words);
    if (score !== null) found.places.push({ kind: 'place', exact: whole(tokens, e.words), score, e });
  }
  const digits = /^\d+$/.test(compact) && compact.length >= 3;
  for (const e of index.stops ?? []) {
    let score = null;
    if (digits && e.id === compact) score = -10;
    else if (digits && e.id.startsWith(compact)) score = -5;
    else score = match(tokens, e.words);
    if (score !== null) found.stops.push({ kind: 'stop', exact: score === -10, score, e });
  }
  const name = (x) => x.e.r?.route ?? x.e.s?.label ?? x.e.p?.name ?? '';
  const order = (a, b) => a.score - b.score || natural(name(a), name(b)) || natural(a.e.id ?? '', b.e.id ?? '');
  for (const g of ORDER) found[g].sort(order);
  return found;
}

/**
 * The short list shown: at most eight, in groups. Each group gets its share and the room a
 * group doesn't use goes to the next. A group whose best match is the whole name leads ("Union
 * Station" is the station, then the lines that go there); one whose best match is weak (a route
 * found only by where it ends) goes last. Returns `[[group, [match]]]`.
 */
export function shortList(found) {
  const take = Object.fromEntries(ORDER.map((g) => [g, Math.min(found[g].length, QUOTA[g])]));
  let room = SHOWN - ORDER.reduce((n, g) => n + take[g], 0);
  for (const g of ORDER) {
    const more = Math.max(0, Math.min(room, found[g].length - take[g]));
    take[g] += more;
    room -= more;
  }
  // Eight in all, even when every group is full: the last groups give way.
  let over = ORDER.reduce((n, g) => n + take[g], 0) - SHOWN;
  for (const g of [...ORDER].reverse()) {
    const less = Math.max(0, Math.min(over, take[g] - 1));
    take[g] -= less;
    over -= less;
  }
  const place = (list) => (list[0].exact ? -1 : list[0].score >= WEAK ? 1 : 0);
  return ORDER.map((g) => [g, found[g].slice(0, take[g])])
    .filter(([, list]) => list.length)
    .sort((a, b) => place(a[1]) - place(b[1]));
}

const frequency = (r) => {
  if (r.tier === 'none' || r.tier === 'unknown') return 'No weekday service';
  if (r.tier === 'peak') return 'Rush hours only';
  if (r.tier === 'limited' || !r.wk) return 'A few trips a day';
  return `Every ${r.wk} min`;
};
const ends = (r) => (r.goes ?? []).map((g) => g.name).join(' to ');
const dot = (parts) => parts.filter(Boolean).join(' · ');
const spacesOf = (p) => (p.spaces > 0 ? `${Number(p.spaces).toLocaleString('en-US')} parking spaces` : '');

/**
 * A match as the list shows it and as a screen reader says it: `{ main, sub, label, mark }`.
 * `mark` is what stands at the row's left: a route's chip, or the kind of place.
 */
export function describe(item) {
  if (item.kind === 'route') {
    const r = item.e.r;
    const rail = r.mode === 'rail';
    const main = rail ? `${r.route} Line` : r.name || `Route ${r.route}`;
    const sub = dot([rail ? ends(r) : '', frequency(r)]);
    return { main, sub, label: `${rail ? '' : `Route ${r.route}, `}${main}, ${sub.replace(/ · /g, ', ')}`, mark: { kind: rail ? 'rail' : 'bus', text: r.route, color: rail ? r.color : null } };
  }
  if (item.kind === 'station') {
    const s = item.e.s;
    const name = s.label || s.name;
    const lines = routeCodes(s.lines);
    const sub = s.served === false ? 'Rail station · No trains this week' : dot(['Rail station', lines.join(', ')]);
    return { main: name, sub, label: `${name}, ${sub.replace(/ · /g, ', ')}`, mark: { kind: 'station' } };
  }
  if (item.kind === 'place') {
    const p = item.e.p;
    const kind = placeKind(p);
    const sub = dot([kind, spacesOf(p)]);
    return { main: p.name, sub, label: `${p.name}, ${sub.replace(/ · /g, ', ')}`, mark: { kind: 'place', text: kind === 'Park-n-Ride' ? 'P' : 'TC' } };
  }
  const p = item.e.p;
  const sub = dot([`Stop ${p.id}`, p.heading]);
  return { main: p.name, sub, label: `${p.name}, ${sub.replace(/ · /g, ', ')}`, mark: { kind: 'stop' } };
}

/**
 * What choosing a match hands to the map: what it is, where it is, and what its card says.
 * `{ kind, name, at: [lon, lat] | null, bbox, note, routes: [{ mode, route, color }], ... }`.
 * A route carries its directory entry; a place, the routes at stops within a five-minute walk.
 */
export function result(item, index) {
  if (item.kind === 'route') {
    const r = item.e.r;
    return { kind: 'route', mode: r.mode === 'rail' ? 'rail' : 'bus', route: r.route, name: r.name, bbox: r.bbox ?? null, entry: r };
  }
  if (item.kind === 'station') {
    const s = item.e.s;
    return { kind: 'station', id: s.id, name: s.label || s.name, at: s.at ?? null,
      note: dot(['Rail station', s.served === false ? 'No trains this week' : '', s.parking > 0 ? `${Number(s.parking).toLocaleString('en-US')} parking spaces` : '']), routes: item.e.routes };
  }
  if (item.kind === 'place') {
    const p = item.e.p;
    const near = (index?.stops ?? []).filter((s) => metres(s.at, item.e.at) <= WALK_M).flatMap((s) => s.routes.map((x) => x.route));
    const routes = index?.asRoutes ? index.asRoutes(near) : [];
    return { kind: 'place', id: p.id, name: p.name, at: item.e.at, note: dot([placeKind(p), spacesOf(p)]),
      lead: routes.length ? 'Routes at stops within a five-minute walk' : '', routes };
  }
  const p = item.e.p;
  return { kind: 'stop', id: item.e.id, name: p.name, at: item.e.at, note: dot([`Bus stop ${p.id}`, p.heading]), routes: item.e.routes };
}
