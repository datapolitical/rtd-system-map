// Live predictions on a stop's and a station's card (#13), in a browser: chromium, a phone
// (393x760), light and dark. Captures in qa/.scratch/live/.
//
//   node qa/live-predictions.mjs fake <site> <feed>
//       <site> is the map served with the local relay bound to it (npm run dev beside
//       npm run dev:live), the relay pointed at qa/lib/fake-feed.mjs at <feed>. The check tells
//       the stand-in feed what RTD "says" and reads the card: a late bus as minutes with the live
//       mark, a skipped call left out, the rest scheduled; then the feed gone stale, then
//       failing, then back; that the relay stops asking once the card is closed; and a station.
//   node qa/live-predictions.mjs real <site>
//       the same relay on RTD's own feed: a busy stop's card turns live, and every live time is
//       one RTD's feed gives for that stop.
//   node qa/live-predictions.mjs old <site>
//       a relay that knows nothing of predictions (it answers a card's page as it answers
//       anyone, with the vehicles), and no relay at all: the card stays the timetable.
//
// THEMES=light,dark narrows a run. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { upcoming, chunkOf, clockIn, timeText, servicesOn } from '../public/js/panel/departures.js';
import { liveFor } from '../public/js/panel/live.js';
import { decodeFeed } from '../live/src/gtfsrt.mjs';
import { predictionsByStop } from '../public/js/realtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, site, feed] = process.argv.slice(2);
if (!['fake', 'real', 'old'].includes(mode) || !site || (mode === 'fake' && !feed)) {
  console.error('usage: node qa/live-predictions.mjs fake <site> <feed> | real <site> | old <site>');
  process.exit(2);
}
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); return ok; };
const out = path.join(ROOT, 'qa/.scratch/live');
fs.mkdirSync(out, { recursive: true });
const json = async (p) => (await fetch(`${site}${p}`)).json();
const index = await json('/data/departures/index.json');
const stops = (await json('/data/stops.geojson')).features.filter((f) => !f.properties.platform);
const directory = await json('/data/directory.json');
const rail = new Set(directory.routes.filter((r) => r.mode === 'rail').map((r) => r.route));
const record = async (id) => (await json(`/data/departures/${chunkOf(id, index.files)}.json`))[id];
const tripsOf = async (id) => (await json(`/data/departures/trips-${chunkOf(id, index.files)}.json`))[id];
const tripId = (n) => (index.tripBase === null || index.tripBase === undefined ? String(n) : String(index.tripBase + n));
const set = (query) => fetch(`${feed}/set?${query}`).then((r) => r.json());
const count = () => fetch(`${feed}/count`).then((r) => r.text()).then(Number);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const first = (route) => rail.has(route);
// A row as the card reads: "Route 15 to Union Station 4 min, live, 8:30am".
const label = (r) => `${rail.has(r.route) ? `${r.name} Line` : `Route ${r.name}`} to ${r.headsign} ${r.times.map((t) => `${timeText(t)}${t.live ? ', live' : ''}`).join(', ')}`.replace(/\s+/g, ' ').trim();

// The next scheduled departures at a stop, with their trips: [{ minutes, trip, route }], soonest first.
async function coming(id, now, within = 60) {
  const rec = await record(id);
  const trips = await tripsOf(id);
  if (!rec || !trips) return [];
  const list = [];
  const running = servicesOn(index, now.date) ?? new Set();
  rec.d.forEach(([pattern, gaps], j) => {
    if (!running.has(index.patterns[pattern][3])) return;
    let t = 0;
    gaps.forEach((gap, i) => { t += gap; if (t >= now.minutes + 3 && t <= now.minutes + within) list.push({ minutes: t, trip: tripId(trips[j][1][i]), route: index.patterns[pattern][1], service: index.patterns[pattern][3] }); });
  });
  return list.sort((a, b) => a.minutes - b.minutes);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const theme of (process.env.THEMES ?? 'light,dark').split(',')) {
  const tag = `${mode}-${theme}`;
  const context = await browser.newContext({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 2, colorScheme: theme, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (name) => page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
  const rest = async () => {
    await page.evaluate(() => new Promise((ok) => { const m = window.sheetsMap; const t = setTimeout(ok, 6000); const go = () => { clearTimeout(t); ok(); }; if (m.loaded() && !m.isMoving()) setTimeout(go, 300); else m.once('idle', go); }));
    await page.waitForTimeout(300);
  };
  const card = () => page.evaluate(() => {
    const box = document.querySelector('#card .departures');
    return !box || box.hidden ? null : {
      kind: box.dataset.kind, head: box.querySelector('[role="heading"]')?.textContent, note: box.querySelector('.kind')?.textContent ?? '',
      rows: [...box.querySelectorAll('.next li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
      live: [...box.querySelectorAll('time.live')].map((t) => t.textContent),
      marks: [...box.querySelectorAll('time.live')].every((t) => getComputedStyle(t, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)'),
    };
  });
  const until = async (test, ms, what) => {
    const end = Date.now() + ms;
    let c = null;
    while (Date.now() < end) { c = await card(); if (c && test(c)) return c; await sleep(500); }
    check(false, `${tag}: ${what}; the card reads ${JSON.stringify(c)}`);
    return c;
  };
  // Open a stop's card from the search box by its number, or a station's by its name.
  const open = async (query, want) => {
    await page.click('#search');
    await page.fill('#search', query);
    await page.waitForFunction((q) => (document.querySelector('#search-list .opt')?.getAttribute('aria-label') ?? '').includes(q), want, { timeout: 30000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('#card .departures:not([hidden])', { timeout: 30000 });
    await rest();
  };
  const pageNow = async () => { const ms = await page.evaluate(() => Date.now()); return { ms, ...clockIn(new Date(ms), index.tz) }; };

  if (mode === 'old') {
    // An older relay: it sends a card's page the vehicles, as it sends anyone, and no predictions.
    await page.routeWebSocket(/\/live\/stream/, (ws) => { ws.send(JSON.stringify({ v: 1, kind: 'snapshot', seq: 1, at: Date.now(), vehicles: { at: 0, list: [] }, alerts: null, problem: null })); });
  }
  await page.goto(`${site}/?theme=${theme}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.sheetsReady, null, { timeout: 90000 });
  await rest();
  const now = await pageNow();
  // The busiest sampled stop over the next hour, with at least three departures to work with.
  let stop = null;
  for (const f of stops.filter((_, i) => i % 29 === 0)) {
    const list = await coming(String(f.properties.id), now);
    if (list.length >= 3 && (!stop || list.length > stop.list.length)) stop = { id: String(f.properties.id), name: f.properties.name, list };
  }
  if (!check(stop, `${tag}: no sampled stop has three departures in the next hour`)) { await context.close(); continue; }

  if (mode === 'fake') {
    // RTD "says": the first departure is 4 minutes late, the second will not call here.
    const [late, skipped] = stop.list;
    const lateAt = Math.floor(now.ms / 1000) + Math.round((late.minutes + 4 - now.minutes) * 60) - new Date(now.ms).getSeconds();
    await set(`mode=live&times=${stop.id}:${late.trip}:${lateAt}:${late.route}&skip=${stop.id}:${skipped.trip}`);
    await open(stop.id, `Stop ${stop.id}`);
    let c = await until((x) => x.kind === 'live', 40000, `stop ${stop.id}'s card never turned live`);
    const rec = await record(stop.id);
    const trips = await tripsOf(stop.id);
    const expect = async (state) => { const n = await pageNow(); return upcoming([rec], index, n, { first, live: state ? liveFor(state, [stop.id], [trips], index, n.ms) : null }).rows.slice(0, 6).map(label); };
    const said = { at: 0, feed: 0, problem: false, stops: { [stop.id]: { times: [[late.trip, lateAt, late.route]], skipped: [skipped.trip] } } };
    c = await card();
    check(c.head === 'Next departures, live', `${tag}: the heading reads "${c.head}" with live times on the card`);
    check(JSON.stringify(c.rows) === JSON.stringify(await expect(said)), `${tag}: stop ${stop.id} live shows ${JSON.stringify(c.rows)}, wanted ${JSON.stringify(await expect(said))}`);
    check(c.live.length === 1 && /^(\d+ min|Now), live$/.test(c.live[0]) && c.marks, `${tag}: exactly the late bus is marked live, in minutes, with the live mark (${JSON.stringify(c.live)})`);
    check(/live predictions/.test(c.note) && /scheduled/.test(c.note), `${tag}: the card does not say which times are live and which scheduled ("${c.note}")`);
    const box = await page.evaluate(() => { const r = document.querySelector('#card').getBoundingClientRect(); const s = document.querySelector('#steps').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, steps: s.top, cut: [...document.querySelectorAll('#card .next .at')].filter((el) => el.scrollWidth > el.clientWidth + 1).length }; });
    check(box.top >= 0 && box.bottom <= box.steps && box.cut === 0, `${tag}: the live card runs off the screen or cuts a time (${JSON.stringify(box)})`);
    await shot('1-stop-live');

    // RTD's feed stops moving: ten minutes old. Nothing stale is shown as live.
    await set('mode=stale');
    c = await until((x) => x.kind === 'scheduled' && /aren.t loading/.test(x.note), 60000, 'with a stale feed the card did not fall back to scheduled and say so');
    check(c && c.live.length === 0 && c.head === 'Next departures, scheduled', `${tag}: a stale feed still shows live times (${JSON.stringify(c?.live)}) or the heading "${c?.head}"`);
    check(c && JSON.stringify(c.rows) === JSON.stringify(await expect(null)), `${tag}: with a stale feed the card shows ${JSON.stringify(c?.rows)}, the timetable gives ${JSON.stringify(await expect(null))}`);
    await shot('2-stop-stale-feed');
    // RTD's feed fails outright.
    await set('mode=live');
    await until((x) => x.kind === 'live', 40000, 'the card did not turn live again after the feed recovered');
    await set('mode=fail');
    c = await until((x) => x.kind === 'scheduled' && /aren.t loading/.test(x.note), 40000, 'with the feed failing the card did not fall back to scheduled and say so');
    check(c && c.live.length === 0, `${tag}: a failing feed still shows live times`);
    await shot('3-stop-feed-failing');
    await set('mode=live');
    await until((x) => x.kind === 'live', 40000, 'the card did not turn live again after the feed came back');

    // The card closes: the relay stops asking RTD.
    await page.keyboard.press('Escape');
    await sleep(3000);
    const before = await count();
    await sleep(35000);
    const after = await count();
    check(after === before, `${tag}: the relay asked for trip updates ${after - before} more times with no card open`);

    // A station: its platforms' trains, the next one late.
    const station = directory.stations.filter((s) => s.served).sort((a, b) => b.lines.split(' ').length - a.lines.split(' ').length)[0];
    const platforms = index.stations[station.id] ?? [];
    const n2 = await pageNow();
    let train = null;
    for (const id of platforms) { const list = await coming(id, n2, 90); if (list.length && (!train || list[0].minutes < train.minutes)) train = { id, ...list[0] }; }
    if (check(train, `${tag}: no train leaves ${station.label} in the next 90 minutes`)) {
      const trainAt = Math.floor(n2.ms / 1000) + Math.round((train.minutes + 3 - n2.minutes) * 60) - new Date(n2.ms).getSeconds();
      await set(`mode=live&times=${train.id}:${train.trip}:${trainAt}:${train.route}&skip=`);
      await open(station.label, station.label);
      c = await until((x) => x.kind === 'live', 40000, `${station.label}'s card never turned live`);
      const recs = (await Promise.all(platforms.map(record)));
      const ids = platforms.filter((_, i) => recs[i]);
      const trs = await Promise.all(ids.map(tripsOf));
      const n3 = await pageNow();
      const want = upcoming(recs.filter(Boolean), index, n3, { first, live: liveFor({ stops: { [train.id]: { times: [[train.trip, trainAt, train.route]] } } }, ids, trs, index, n3.ms) }).rows.slice(0, 6).map(label);
      c = await card();
      check(JSON.stringify(c.rows) === JSON.stringify(want), `${tag}: ${station.label} live shows ${JSON.stringify(c.rows)}, wanted ${JSON.stringify(want)}`);
      check(c.live.length === 1, `${tag}: ${station.label} marks ${c.live.length} times live, not the one train`);
      await shot('4-station-live');
    }
    await page.keyboard.press('Escape');
  } else if (mode === 'real') {
    await open(stop.id, `Stop ${stop.id}`);
    const c = await until((x) => x.kind === 'live', 60000, `on RTD's own feed stop ${stop.id}'s card never turned live`);
    if (c?.kind === 'live') {
      // Every live time on the card is one RTD's feed gives for this stop now (read here, apart from the relay).
      const base = fs.readFileSync(path.join(ROOT, 'live/src/worker.mjs'), 'utf8').match(/RTD_FEEDS\s*=\s*'([^']+)'/)[1];
      const real = predictionsByStop(decodeFeed(new Uint8Array(await (await fetch(`${base}TripUpdate.pb`, { headers: { 'user-agent': 'transit-map-check/1.0' } })).arrayBuffer())));
      const n = await pageNow();
      const theirs = (real.byStop.get(stop.id)?.times ?? []).map(([, time]) => Math.round((time - n.ms / 1000) / 60));
      const mine = c.live.map((t) => (t.startsWith('Now') ? 0 : Number(t.match(/^(\d+) min/)?.[1] ?? NaN)));
      check(mine.length > 0 && mine.every((m) => Number.isNaN(m) || theirs.some((t) => Math.abs(t - m) <= 2)), `${tag}: live times ${JSON.stringify(c.live)} are not among RTD's for stop ${stop.id} (${theirs.join(', ')} min)`);
      check(c.head === 'Next departures, live' && c.marks, `${tag}: live times without the live heading or mark`);
      console.log(`${tag}: stop ${stop.id} ${stop.name}: ${c.rows.join(' | ')}`);
    }
    await shot('1-stop-real-feed');
    await page.keyboard.press('Escape');
  } else {
    // An older relay (above), then no relay at all: scheduled, labelled scheduled, nothing live.
    await open(stop.id, `Stop ${stop.id}`);
    await sleep(4000);
    let c = await card();
    check(c?.kind === 'scheduled' && c.live.length === 0 && c.head === 'Next departures, scheduled', `${tag}: with an older relay the card reads ${JSON.stringify(c)}`);
    c = await until((x) => /aren.t loading/.test(x.note), 40000, 'with an older relay the card never said live times are not loading');
    check(c?.kind === 'scheduled' && c.rows.length > 0, `${tag}: with an older relay the timetable is not shown`);
    await shot('1-older-relay');
    await page.keyboard.press('Escape');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.routeWebSocket(/\/live\/stream/, (ws) => { ws.close({ code: 1011, reason: 'no relay' }); });
    await open(stop.id, `Stop ${stop.id}`);
    await sleep(3000);
    c = await card();
    check(c?.kind === 'scheduled' && c.live.length === 0 && c.rows.length > 0, `${tag}: with no relay the card reads ${JSON.stringify(c)}`);
    await shot('2-no-relay');
    await page.keyboard.press('Escape');
  }
  check(errors.length === 0, `${tag}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  await context.close();
  console.log(`${tag}: done`);
}
await browser.close();
if (failures.length) {
  console.error(`${failures.length} failure${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures.slice(0, 30)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`live predictions (${mode}): ok`);
