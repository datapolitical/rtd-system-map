// The search box (DESIGN.md, "Search"): find a route, a rail station, a Park-n-Ride or transit
// center, or a bus stop by name or number, and open it. A combobox with a listbox of results
// (ARIA 1.2): the box keeps the focus, the arrow keys move through the results, Enter opens one,
// Esc closes the list, and a screen reader hears how many results there are.
//
// It reads RTD's built data and nothing of the map: what to do with a chosen result is the one
// function it is given (`open`), which is the only part a different map replaces. The small
// files load when the box is first used; so does the stops file (1.5 MB), never at page load.

import { buildIndex, find, shortList, describe, result, HEADINGS } from './find.js';
import { contrast } from '../color.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const DARK_INK = '#10151d';
const inkOn = (color) => (contrast(color, DARK_INK) >= contrast(color, '#ffffff') ? DARK_INK : '#ffffff');
const dataUrl = (name) => new URL(`../../data/${name}`, import.meta.url);
const load = (name) => fetch(dataUrl(name)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(name))));

// What stands at a row's left: a rail line's disc in its colour, a bus route's number, or the kind of place.
function mark(m) {
  const look = m.kind === 'rail' ? ` style="background:${esc(m.color ?? '#888888')};color:${esc(inkOn(m.color ?? '#888888'))}"` : '';
  return `<span class="mark" aria-hidden="true"><i class="${m.kind}"${look}>${esc(m.text ?? '')}</i></span>`;
}

/**
 * Wires the search box in `root` (index.html, #finder). `open(result)` is called with what was
 * chosen (find.js, result) and the box, so whatever opens can hand the focus back.
 */
export function initSearch({ root, open }) {
  const input = root.querySelector('input');
  const clear = root.querySelector('.clear');
  const pop = root.querySelector('.pop');
  const listbox = root.querySelector('[role="listbox"]');
  const empty = root.querySelector('.empty');
  const live = root.querySelector('[role="status"]');

  const data = { directory: null, facilities: null, stops: null };
  let index = buildIndex(data);
  let started = false;
  let pending = 0; // files still loading
  let failed = false; // a file that didn't load: the list says so, not "no match"
  let items = []; // the options on screen, in order
  let active = -1;
  let announceTimer;
  let lastQuery = '';

  function start() {
    if (started) return;
    started = true;
    for (const [key, file] of [['directory', 'directory.json'], ['facilities', 'facilities.geojson'], ['stops', 'stops.geojson']]) {
      pending++;
      load(file).then((json) => { data[key] = json; index = buildIndex(data); }, () => { failed = true; })
        .then(() => { pending--; refresh(); });
    }
  }

  function render(groups, query) {
    items = groups.flatMap(([, list]) => list);
    let n = 0;
    listbox.innerHTML = groups.map(([g, list], gi) => {
      const options = list.map((item) => {
        const d = describe(item);
        return `<div role="option" class="opt" id="so-${n}" data-i="${n++}" aria-selected="false" aria-label="${esc(d.label)}">${mark(d.mark)}`
          + `<span class="text"><span class="main">${esc(d.main)}</span><span class="sub">${esc(d.sub)}</span></span></div>`;
      }).join('');
      return `<div role="group" aria-labelledby="sg-${gi}"><div class="group" id="sg-${gi}">${HEADINGS[g]}</div>${options}</div>`;
    }).join('');
    const none = !items.length;
    listbox.hidden = none;
    empty.hidden = !none;
    if (none) {
      empty.textContent = pending ? 'Looking…'
        : failed ? 'Search isn’t loading. Check your connection and try again.'
          : `Nothing matches “${query.trim()}”. Try a route number, a station or a stop.`;
    }
    setActive(none ? -1 : 0);
  }

  function setActive(i) {
    active = i;
    for (const el of listbox.querySelectorAll('.opt')) {
      const on = Number(el.dataset.i) === i;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    }
    if (i >= 0 && isOpen()) input.setAttribute('aria-activedescendant', `so-${i}`);
    else input.removeAttribute('aria-activedescendant');
  }

  const isOpen = () => !pop.hidden;
  function setOpen(on) {
    pop.hidden = !on;
    root.classList.toggle('open', on);
    input.setAttribute('aria-expanded', String(on));
    if (on && active >= 0) input.setAttribute('aria-activedescendant', `so-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  // The count is said once typing settles, not on every key.
  function announce(text) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { live.textContent = text; }, 450);
  }

  function refresh() {
    clear.hidden = !input.value;
    const query = input.value;
    lastQuery = query;
    if (!query.trim()) {
      items = [];
      listbox.innerHTML = '';
      setOpen(false);
      setActive(-1);
      announce('');
      return;
    }
    setOpen(true);
    render(shortList(find(index, query)), query);
    announce(items.length ? `${items.length} ${items.length === 1 ? 'result' : 'results'}` : pending ? '' : `No results for ${query.trim()}`);
  }

  function choose(i) {
    const item = items[i];
    if (!item) return;
    const chosen = result(item, index);
    input.value = '';
    refresh();
    clearTimeout(announceTimer);
    live.textContent = '';
    open(chosen, input);
  }

  input.addEventListener('focus', () => {
    start();
    if (input.value.trim() && items.length) setOpen(true);
  });
  input.addEventListener('input', () => { start(); refresh(); });
  input.addEventListener('keydown', (e) => {
    const n = items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      if (!isOpen()) return setOpen(true);
      setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault(); // the box is a form's: Enter never reloads the page
      if (isOpen() && active >= 0) choose(active);
    } else if (e.key === 'Escape') {
      // Esc closes the list, then empties the box; only after that is it the page's (which closes the card).
      if (isOpen()) { e.stopPropagation(); setOpen(false); }
      else if (input.value) { e.stopPropagation(); input.value = ''; refresh(); }
    }
  });
  root.addEventListener('submit', (e) => e.preventDefault());
  // A pointer: the box keeps the focus while a result is pressed, then it opens.
  listbox.addEventListener('pointerdown', (e) => e.preventDefault());
  listbox.addEventListener('mousedown', (e) => e.preventDefault());
  listbox.addEventListener('click', (e) => {
    const opt = e.target.closest('.opt');
    if (opt) choose(Number(opt.dataset.i));
  });
  clear.addEventListener('click', () => { input.value = ''; refresh(); input.focus(); });
  // Leaving the box (Tab away, a tap elsewhere) closes the list; coming back shows the same results.
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) setOpen(false); });
  addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) setOpen(false); });
  input.addEventListener('click', () => { if (input.value.trim() && items.length && lastQuery === input.value) setOpen(true); });
  // The script loads when the box is first used, so the box may already have the focus, and letters in it.
  if (document.activeElement === input) { start(); refresh(); }
}
