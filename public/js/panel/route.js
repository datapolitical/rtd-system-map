// The route panel (DESIGN.md, "Tap anything and it explains itself", "Route panel wording"):
// where a route goes, how often it runs through the week, its first and last trips, and RTD's
// timetable. Pure: it takes the route's entry in RTD's built directory (data/directory.json) and
// the windows the build measured in, and returns words and HTML. It knows nothing of the map
// that shows it, so the zoomable map uses it as it is (test/panel-route.test.mjs).

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** A clock time as riders say it: "04:22" -> "4:22am", "15:00" -> "3pm", "24:15" (after midnight) -> "12:15am". */
export function time(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return '';
  const h = Number(m[1]) % 24;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m[2] === '00' ? '' : `:${m[2]}`}${h < 12 ? 'am' : 'pm'}`;
}
/** A window as riders say it: ["09:00", "15:00"] -> "9am to 3pm"; ["06:00", "09:00"] -> "6 to 9am". */
export function span(window) {
  const [from, to] = (window ?? []).map(time);
  if (!from || !to) return '';
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -2)} to ${to}` : `${from} to ${to}`;
}

/** An end as a panel says it: "Olde Town Arvada Station" -> "Olde Town Arvada"; Union Station keeps its name. */
const end = (name) => (/union/i.test(name) ? String(name) : String(name).replace(/\s+Station$/i, ''));

// How often, from a headway in minutes and how many trips there are when there is no headway.
function often(minutes, trips, none) {
  if (minutes) return `Every ${minutes} min`;
  if (trips === 0) return none;
  if (trips === 1) return '1 trip';
  return 'A few trips';
}

/**
 * What the panel says about a route. `r` is its directory entry; `windows` the build's measuring
 * windows (directory.json, `windows`: midday, am, pm, eve, each ["HH:MM", "HH:MM"]), any of which
 * may be missing in data built before a row existed: its row is then left out, never guessed.
 *
 * Returns `{ title, goes, headline: { figure, when }, rows: [{ label, value }], trips,
 * link: { href, text } | null }`. Every row says the hours its figure is for.
 */
export function routePanel(r, windows = {}) {
  const rail = r.mode === 'rail';
  const midday = span(windows.midday);
  // The headline is the midday figure, with the time it is measured in beside it, never a span of service.
  const figure = r.tier === 'none' || r.tier === 'unknown' ? 'No weekday service'
    : r.tier === 'peak' ? 'Rush hours only'
      : r.tier === 'limited' || !r.wk ? 'A few trips a day'
        : `Every ${r.wk} min`;
  const when = r.wk && !['none', 'unknown', 'peak', 'limited'].includes(r.tier) ? `weekdays${midday ? `, ${midday}` : ''}` : '';
  const one = new Set(String(r.wk_one ?? '').split(' ').filter(Boolean));
  const weekday = [['am', 'wk_am'], ['pm', 'wk_pm'], ['eve', 'wk_eve']]
    .filter(([name, key]) => windows[name] && (key in r || `${key}_trips` in r))
    .map(([name, key]) => ({
      label: `Weekdays, ${span(windows[name])}`,
      value: `${often(r[key], r[`${key}_trips`] ?? (r[key] ? 2 : 0), 'No trips')}${r[key] && one.has(name) ? ', one direction' : ''}`,
    }));
  // Saturday and Sunday are measured in the same hours as the headline, and say so where they give a frequency.
  const weekend = [['Saturday', r.sa, r.sa_trips], ['Sunday', r.su, r.su_trips]]
    .map(([day, minutes, trips]) => ({ label: minutes && midday ? `${day}, ${midday}` : day, value: often(minutes, trips ?? 0, 'No service') }));
  return {
    title: rail ? `${r.route} Line` : String(r.name || `Route ${r.route}`),
    goes: (r.goes ?? []).map((g) => end(g.name)).join(' – '),
    headline: { figure, when },
    rows: [...(r.wk_trips ? weekday : []), ...weekend],
    trips: r.wk_trips && r.wk_first && r.wk_last ? `First trip ${time(r.wk_first)}, last ${time(r.wk_last)} on weekdays` : '',
    link: /^https?:\/\//.test(r.url ?? '') ? { href: r.url, text: 'Timetable on RTD’s site' } : null,
  };
}

/** The panel's rows as HTML, for the page to put under the route's name. */
export function routePanelHtml(p) {
  const rows = p.rows.map((row) => `<dt>${esc(row.label)}</dt><dd>${esc(row.value)}</dd>`).join('');
  return `<p class="headline"><strong>${esc(p.headline.figure)}</strong>${p.headline.when ? ` <span>${esc(p.headline.when)}</span>` : ''}</p>`
    + `<dl class="week">${rows}</dl>`
    + (p.trips ? `<p class="trips">${esc(p.trips)}</p>` : '')
    + (p.link ? `<a class="link" href="${esc(p.link.href)}" target="_blank" rel="noopener">${esc(p.link.text)}<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M8 4.5H4.5v11h11V12M11 4.5h4.5V9M15.5 4.5 9 11"/></svg><span class="sr"> (opens in a new tab)</span></a>` : '');
}

/** What a screen reader hears when the panel opens: the rows as sentences. */
export function routePanelSaid(p) {
  const rows = p.rows.map((row) => `${row.label}: ${row.value}`);
  return [[p.headline.figure, p.headline.when].filter(Boolean).join(' '), ...rows, p.trips].filter(Boolean).join('. ');
}
