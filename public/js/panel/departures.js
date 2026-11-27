// Next departures at a stop or a station (DESIGN.md, "Tap anything and it explains itself"):
// which trips leave next, by route and where they are headed, from RTD's timetable as the build
// publishes it (data/departures/, scripts/lib/departures.mjs). Pure: it takes that data and a
// time, and returns rows and HTML. It knows nothing of the map that shows it, so the zoomable
// map uses it as it is (test/panel-departures.test.mjs).
//
// Times here are scheduled. A prediction from RTD's live feed, when Live is on, takes a
// departure's place through `live` (see upcoming); nothing else changes.

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** Which of the build's `count` files holds a stop: the same sum the build files it by. */
export function chunkOf(id, count) {
  let sum = 0;
  for (const ch of String(id)) sum = (sum * 31 + ch.charCodeAt(0)) >>> 0;
  return sum % count;
}

/**
 * The service day and time at `at` (a Date) in the timetable's time zone: `{ date: 'YYYYMMDD',
 * minutes }`, minutes since that day's midnight. Riders' clocks are Denver's, whatever the
 * device is set to.
 */
export function clockIn(at, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  return { date: `${parts.year}${parts.month}${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** The date `days` after a 'YYYYMMDD' date. */
export function addDays(date, days) {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + days));
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * The services that run on a date, from the feed's calendar and its exceptions (a holiday on a
 * Sunday timetable): `index.services` is `{ id: { days: 'MTWTFSS' as 0s and 1s, from, to } }`,
 * `index.exceptions` `[[date, service, 1 added | 2 removed]]`. Null when the date is outside
 * the feed: the timetable says nothing about it.
 */
export function servicesOn(index, date) {
  const all = Object.entries(index.services ?? {});
  if (!all.some(([, s]) => s.from <= date && date <= s.to)) return null;
  const weekday = (new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)))).getUTCDay() + 6) % 7; // Monday is 0
  const on = new Set(all.filter(([, s]) => s.from <= date && date <= s.to && s.days[weekday] === '1').map(([id]) => id));
  for (const [day, service, type] of index.exceptions ?? []) {
    if (day !== date) continue;
    if (type === 1) on.add(service);
    else on.delete(service);
  }
  return on;
}

/** A time of day as riders say it, from minutes since midnight: 1301 -> "9:41pm", 1455 (after midnight) -> "12:15am". */
export function clock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

/**
 * The next departures from one stop's record, or a station's several (its platforms').
 *
 * `records` are the stops' entries from the build's files: `{ d: [[pattern, [first, gap, gap…]]] }`,
 * each pattern an index into `index.patterns` (`[route, name, headsign, service]`: the map's
 * route, the name on the bus, where it is headed, the service it runs on), its times in minutes
 * since the service day's midnight, each after the first as the gap from the one before.
 * `now` is `{ date, minutes }` (clockIn). A service day runs past midnight, so last night's
 * late trips are still to come in the small hours.
 *
 * Returns `{ rows, known, ends }`: `ends` says trips only end at these stops; `rows` are `[{ route, name, headsign, times: [{ minutes, clock, in }] }]`,
 * one per route and destination, soonest first, each with its next `each` departures within
 * `within` minutes; `known` is false when the date is outside the timetable. `first(route)`
 * puts some routes ahead (a station's trains before its buses).
 */
export function upcoming(records, index, now, { each = 2, within = 180, first = () => false } = {}) {
  const today = servicesOn(index, now.date);
  const yesterday = servicesOn(index, addDays(now.date, -1));
  // Every stop given is one where trips only end: nothing boards there on any day.
  const ends = records.length > 0 && records.every((r) => r?.end);
  if (!today && !yesterday) return { rows: [], known: false, ends };
  const rows = new Map();
  for (const record of records) {
    for (const [pattern, gaps] of record?.d ?? []) {
      const [route, name, headsign, service] = index.patterns[pattern] ?? [];
      if (route === undefined) continue;
      // Today's trips at their own time; yesterday's that run past midnight, a day earlier.
      for (const [runs, shift] of [[today?.has(service), 0], [yesterday?.has(service), -1440]]) {
        if (!runs) continue;
        let t = 0;
        for (const gap of gaps) {
          t += gap;
          const at = t + shift;
          if (at < now.minutes) continue;
          if (at > now.minutes + within) break;
          const key = `${name}|${headsign}`;
          const row = rows.get(key) ?? rows.set(key, { route, name, headsign, times: [] }).get(key);
          row.times.push(at);
        }
      }
    }
  }
  const list = [...rows.values()].map((row) => {
    const times = [...new Set(row.times)].sort((a, b) => a - b).slice(0, each);
    return { ...row, times: times.map((minutes) => ({ minutes, clock: clock(minutes), in: minutes - now.minutes })) };
  });
  list.sort((a, b) => Number(first(b.route)) - Number(first(a.route)) || a.times[0].minutes - b.times[0].minutes || String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
  return { rows: list, known: true, ends };
}

/** Whether a stop can be boarded from a wheelchair, as RTD's stops file says: 1 yes, 2 no, anything else not said. */
export const accessible = (record) => (record?.a === 1 ? 'Wheelchair accessible' : record?.a === 2 ? 'Not wheelchair accessible' : '');

/**
 * The departures as HTML for a card. `chip(row)` draws a route's chip as the page does. With
 * no rows it says why, in plain words: nothing more in the hours ahead, or a date the timetable
 * doesn't cover.
 */
export function departuresHtml({ rows, known, ends = false }, { chip = (row) => `<b>${esc(row.name)}</b>`, within = 180, most = 6 } = {}) {
  if (ends && !rows.length) return '<p class="none">Trips end here. Nothing boards at this stop.</p>';
  if (!known) return '<p class="none">RTD’s timetable here doesn’t cover today. See RTD’s site for times.</p>';
  if (!rows.length) return `<p class="none">No departures in the next ${Math.round(within / 60)} hours</p>`;
  // The soonest few; a busy stop's card stays a card, and says how many more there are.
  const more = rows.length - most;
  return `<ul class="next">${rows.slice(0, most).map((row) => `<li>${chip(row)}<span class="to"><span class="sr">to </span>${esc(row.headsign)}</span><span class="at">${row.times.map((t) => `<time>${esc(t.clock)}</time>`).join('<i aria-hidden="true">,</i> ')}</span></li>`).join('')}</ul>`
    + (more > 0 ? `<p class="more">and ${more} more ${more === 1 ? 'route' : 'routes'} in the next ${Math.round(within / 60)} hours</p>` : '');
}

/** What a screen reader hears: "Route 15 to Union Station, 9:41pm and 9:56pm". At most `most` rows, then how many more. */
export function departuresSaid({ rows, known, ends = false }, { routeName = (row) => `Route ${row.name}`, most = 3, within = 180 } = {}) {
  if (ends && !rows.length) return 'Trips end here. Nothing boards at this stop';
  if (!known) return 'No timetable for today';
  if (!rows.length) return `No departures in the next ${Math.round(within / 60)} hours`;
  const said = rows.slice(0, most).map((row) => `${routeName(row)} to ${row.headsign}, ${row.times.map((t) => t.clock).join(' and ')}`);
  return `Scheduled departures: ${said.join('. ')}${rows.length > most ? `. And ${rows.length - most} more` : ''}`;
}

/**
 * Where the departures come from: the build's files under `base` (a URL ending in "/"), read
 * when first asked for and kept. `get(url)` fetches JSON. `stops({ stops, station })` resolves
 * to `{ index, records }` for some stop ids, or a rail station's platforms by the station's id.
 */
export function departureSource(base, get = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))) {
  let index = null;
  const files = new Map();
  const once = (map, key, make) => {
    if (!map.has(key)) map.set(key, make().catch((err) => { map.delete(key); throw err; }));
    return map.get(key);
  };
  const state = new Map();
  return {
    async stops({ stops = [], station = null } = {}) {
      index = await once(state, 'index', () => get(new URL('index.json', base)));
      const ids = [...new Set([...stops, ...(station === null ? [] : index.stations?.[station] ?? [])].map(String))];
      const records = await Promise.all(ids.map(async (id) => (await once(files, chunkOf(id, index.files), () => get(new URL(`${chunkOf(id, index.files)}.json`, base))))[id] ?? null));
      return { index, records: records.filter(Boolean), asked: ids.length };
    },
  };
}
