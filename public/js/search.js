// Search (DESIGN.md, "Interface"): find a route, a rail station, a Park-n-Ride
// or transit center, or a bus stop by name or number, and open it. It is a
// combobox with a listbox of results (ARIA 1.2): the input keeps focus, the
// arrow keys move through the results with aria-activedescendant, Enter opens
// one, Esc closes the list. A hidden live region says how many results there are.
//
// Data: directory.json (routes and stations) and facilities.geojson are small
// and come through select.js; stops.geojson (1.5 MB) is fetched the first time
// the box is focused or typed in, never at page load.

import * as ui from './panel.js';
import { loadDirectory, loadData, places, openRoute, openStation, openStop, openPlace, openLines } from './select.js';
import { TIER_RANK, bullet, esc, freq, goesText, joinDot, weekendOnly } from './shared.js';

const SHOWN = 8; // results at most
// How many each group gets first; unused room goes to the groups below.
const QUOTA = { routes: 4, stations: 3, places: 2, stops: 3 };
const HEADINGS = { routes: 'Routes', stations: 'Stations', places: 'Park-n-Rides and transit centers', stops: 'Bus stops' };
const ORDER = ['routes', 'stations', 'places', 'stops'];
// A match score this high is a weak one: the words were found inside other
// words, or only in the names of a route's ends.
const WEAK = 3;

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const wordsOf = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

// How well every word of the query matches the words of a name: 0 is a
// perfect match, higher is worse, null is no match. Each query word must start
// a word of the name (or, from three letters, be inside one).
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

export function initSearch({ lines }) {
  const input = document.getElementById('search');
  const clear = document.getElementById('search-clear');
  const linesButton = document.getElementById('lines-button');
  const pop = document.getElementById('search-pop');
  const listbox = document.getElementById('search-list');
  const empty = document.getElementById('search-empty');
  const live = document.getElementById('search-status');
  const finder = document.getElementById('finder');

  const index = { routes: [], stations: [], places: [], stops: [] };
  let started = false;
  let stopsPending = false;
  let items = []; // the options on screen, in order
  let active = -1;
  let announceTimer;

  // --- Data: the small files with the first use, stops on first focus ---------

  function start() {
    if (started) return;
    started = true;
    loadDirectory().then((dir) => {
      index.routes = [...dir.routes.values()].map((r) => ({
        r,
        code: fold(r.route),
        // RTD's map code for the route ("BOND" for the Bound), if it has one.
        alias: r.code ? fold(r.code) : null,
        words: wordsOf(`${r.route} ${r.mode === 'rail' ? 'line' : ''} ${r.name}`),
        goes: wordsOf((r.goes ?? []).map((g) => g.name).join(' ')),
      }));
      index.stations = dir.list.map((s) => ({ s, words: wordsOf(`${s.label || ''} ${s.name || ''}`) }));
      refresh();
    }, () => {});
    places().then((list) => {
      index.places = list.map((p) => ({ p, words: wordsOf(p.name) }));
      refresh();
    }, () => {});
    stopsPending = true;
    loadData('stops').then(
      (g) => {
        index.stops = g.features.map((f) => ({ p: f.properties, words: wordsOf(f.properties.name), id: String(f.properties.id) }));
        stopsPending = false;
        refresh();
      },
      () => {
        stopsPending = false;
        refresh();
      },
    );
  }

  // --- Matching -----------------------------------------------------------

  function find(query) {
    const q = fold(query).trim();
    const tokens = wordsOf(query);
    const compact = q.replace(/\s+/g, '');
    if (!tokens.length) return { routes: [], stations: [], places: [], stops: [] };

    const routes = [];
    for (const e of index.routes) {
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
      if (score !== null) routes.push({ kind: 'route', exact: score <= -9, score: score - (e.r.mode === 'rail' ? 0.5 : 0) - (TIER_RANK[e.r.tier] ?? 0) * 0.01 + (e.r.wk ?? 99) / 1000, e });
    }
    const stations = [];
    for (const e of index.stations) {
      const score = match(tokens, e.words);
      if (score !== null) stations.push({ kind: 'station', exact: whole(tokens, wordsOf(e.s.label)) || whole(tokens, wordsOf(e.s.name)), score: score + (e.s.served ? 0 : 0.5), e });
    }
    const spots = [];
    for (const e of index.places) {
      const score = match(tokens, e.words);
      if (score !== null) spots.push({ kind: 'place', exact: whole(tokens, e.words), score, e });
    }
    const stops = [];
    const digits = /^\d+$/.test(compact);
    for (const e of index.stops) {
      let score = null;
      if (digits && compact.length >= 3 && e.id === compact) score = -10;
      else if (digits && compact.length >= 3 && e.id.startsWith(compact)) score = -5;
      else score = match(tokens, e.words);
      if (score !== null) stops.push({ kind: 'stop', score, e });
    }
    const order = (a, b) => a.score - b.score || natural(a.e.r?.route ?? a.e.s?.label ?? a.e.p?.name ?? '', b.e.r?.route ?? b.e.s?.label ?? b.e.p?.name ?? '');
    return { routes: routes.sort(order), stations: stations.sort(order), places: spots.sort(order), stops: stops.sort(order) };
  }

  // Each group gets its share, and room a group doesn't use goes to the next.
  function pick(found) {
    const take = Object.fromEntries(ORDER.map((g) => [g, Math.min(found[g].length, QUOTA[g])]));
    let room = SHOWN - ORDER.reduce((n, g) => n + take[g], 0);
    for (const g of ORDER) {
      const more = Math.min(room, found[g].length - take[g]);
      take[g] += more;
      room -= more;
    }
    // A group whose best match is weak (a route found only by where it ends)
    // goes after the groups that match by name.
    // And a group whose best match is the whole name, word for word, goes
    // first: "Union Station" is the station, then the lines that go there.
    const place = (list) => (list[0].exact ? -1 : list[0].score >= WEAK ? 1 : 0);
    return ORDER.map((g) => [g, found[g].slice(0, take[g])])
      .filter(([, list]) => list.length)
      .sort((a, b) => place(a[1]) - place(b[1]));
  }

  // --- Drawing -----------------------------------------------------------

  function describe(item) {
    if (item.kind === 'route') {
      const r = item.e.r;
      const text = r.tier === 'none' || r.tier === 'unknown' ? weekendOnly(r) : freq(r);
      const main = r.mode === 'rail' ? goesText(r) : r.name || `Route ${r.route}`;
      return {
        label: `${r.mode === 'rail' ? `${r.route} Line` : `Route ${r.route}`}, ${main}, ${text}`,
        html: `${bullet(r, lines)}<span class="row-text"><span class="row-main">${esc(main)}</span><span class="row-sub">${esc(text)}</span></span>`,
      };
    }
    if (item.kind === 'station') {
      const s = item.e.s;
      const name = s.label || s.name;
      const codes = String(s.lines ?? '').split(/\s+/).filter(Boolean);
      const sub = s.served ? joinDot(['Train station', codes.join(', ')]) : esc('Closed: no trains this week');
      return {
        label: `${name}, train station${s.served ? '' : ', closed: no trains this week'}`,
        html: `<span class="sym"><span class="station-dot${s.served ? '' : ' unserved'}"></span></span><span class="row-text"><span class="row-main">${esc(name)}</span><span class="row-sub">${sub}</span></span>`,
      };
    }
    if (item.kind === 'place') {
      const p = item.e.p;
      const spaces = p.spaces ? `${p.spaces.toLocaleString()} parking spaces` : '';
      return {
        label: `${p.name}, ${p.kind}${spaces ? `, ${spaces}` : ''}`,
        html: `<span class="sym"><span class="pnr">${p.kind === 'Park-n-Ride' ? 'P' : 'TC'}</span></span><span class="row-text"><span class="row-main">${esc(p.name)}</span><span class="row-sub">${joinDot([p.kind, spaces])}</span></span>`,
      };
    }
    const p = item.e.p;
    return {
      label: `${p.name}, stop ${p.id}${p.heading ? `, ${p.heading}` : ''}`,
      html: `<span class="sym"><span class="stop-dot"></span></span><span class="row-text"><span class="row-main">${esc(p.name)}</span><span class="row-sub">${joinDot([`Stop ${p.id}`, p.heading])}</span></span>`,
    };
  }

  function render(groups, query) {
    items = groups.flatMap(([, list]) => list);
    let n = 0;
    listbox.innerHTML = groups
      .map(([g, list], gi) => {
        const options = list
          .map((item) => {
            const d = describe(item);
            return `<div role="option" class="search-opt" id="so-${n}" data-i="${n++}" aria-selected="false" aria-label="${esc(d.label)}">${d.html}</div>`;
          })
          .join('');
        return `<div role="group" aria-labelledby="sg-${gi}"><div class="search-group" id="sg-${gi}">${HEADINGS[g]}</div>${options}</div>`;
      })
      .join('');
    const none = !items.length;
    listbox.hidden = none;
    empty.hidden = !none;
    if (none) {
      empty.textContent = stopsPending
        ? 'Still looking through bus stops…'
        : `No routes or places match “${query.trim()}”. Try a route number, a line, or a name.`;
    }
    setActive(none ? -1 : 0);
  }

  function setActive(i) {
    active = i;
    for (const el of listbox.querySelectorAll('.search-opt')) {
      const on = Number(el.dataset.i) === i;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    }
    if (i >= 0) input.setAttribute('aria-activedescendant', `so-${i}`);
    else input.removeAttribute('aria-activedescendant');
  }

  const isOpen = () => !pop.hidden;
  function setOpen(open) {
    pop.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (!open) input.removeAttribute('aria-activedescendant');
    else if (active >= 0) input.setAttribute('aria-activedescendant', `so-${active}`);
  }

  // The count is announced once typing settles, not on every key.
  function announce(text) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => (live.textContent = text), 450);
  }

  let lastQuery = '';
  function refresh() {
    clear.hidden = !input.value;
    const query = input.value;
    lastQuery = query;
    if (!query.trim()) {
      items = [];
      listbox.innerHTML = '';
      setActive(-1);
      setOpen(false);
      announce('');
      return;
    }
    render(pick(find(query)), query);
    setOpen(true);
    announce(items.length ? `${items.length} ${items.length === 1 ? 'result' : 'results'}` : `No results for ${query.trim()}`);
  }

  // --- Choosing -----------------------------------------------------------

  function choose(i) {
    const item = items[i];
    if (!item) return;
    ui.rememberOpener(input);
    if (item.kind === 'route') openRoute(item.e.r.route);
    else if (item.kind === 'station') openStation(item.e.s.id);
    else if (item.kind === 'place') openPlace(item.e.p.id);
    else openStop(item.e.p.id);
    input.value = '';
    refresh();
    live.textContent = '';
  }

  // --- Events -----------------------------------------------------------

  input.addEventListener('focus', () => {
    start();
    if (input.value.trim() && items.length) setOpen(true);
  });
  input.addEventListener('input', () => {
    start();
    refresh();
  });
  input.addEventListener('keydown', (e) => {
    const n = items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      if (!isOpen()) return setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + n) % n);
    } else if (e.key === 'Enter') {
      if (isOpen() && active >= 0) {
        e.preventDefault();
        choose(active);
      }
    } else if (e.key === 'Escape') {
      if (isOpen()) {
        e.preventDefault();
        setOpen(false);
      } else if (input.value) {
        e.preventDefault();
        input.value = '';
        refresh();
      }
    }
  });
  // Pointer: keep focus in the box while an option is pressed, then open it.
  listbox.addEventListener('pointerdown', (e) => e.preventDefault());
  listbox.addEventListener('mousedown', (e) => e.preventDefault());
  listbox.addEventListener('click', (e) => {
    const opt = e.target.closest('.search-opt');
    if (opt) choose(Number(opt.dataset.i));
  });
  clear.addEventListener('click', () => {
    input.value = '';
    refresh();
    input.focus();
  });
  linesButton.addEventListener('click', () => {
    setOpen(false);
    ui.rememberOpener(linesButton);
    openLines();
  });
  // Leaving the whole box (Tab away, tap the map) closes the list.
  finder.addEventListener('focusout', (e) => {
    if (!finder.contains(e.relatedTarget)) setOpen(false);
  });
  // Tapping the map closes the list even though the map may not take focus.
  document.getElementById('map').addEventListener('pointerdown', () => setOpen(false));
  // Coming back to the box with text in it shows the same results.
  input.addEventListener('click', () => {
    if (input.value.trim() && items.length && lastQuery === input.value) setOpen(true);
  });
}
