// Next departures on the sheets page (#13; DESIGN.md, "Tap anything and it explains itself"), checked two ways.
//
//   node qa/departures.mjs data [dir] [gtfs.zip]
//       the built tables (public/data/departures, or dir/departures): every drawn stop and every
//       served station has its departures; with RTD's feed given, every stop's count is recounted
//       from the raw stop_times file by a second, independent reading
//   node qa/departures.mjs page <base>
//       a stop's and a station's card in a browser: chromium, a phone (393x760) and a desktop
//       (1280x800), both themes, with the clock held at a weekday morning and at a holiday; the
//       rows against the tables; that the card stays on the screen. Captures in qa/.scratch/departures/.
//
// THEMES=light,dark and SIZES=phone,desktop narrow a run. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upcoming, chunkOf, servicesOn, addDays, clockIn } from '../public/js/panel/departures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, a, b] = process.argv.slice(2);
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); return ok; };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

if (mode === 'data') {
  const dir = a ?? path.join(ROOT, 'public/data');
  const index = readJson(path.join(dir, 'departures/index.json'));
  const files = Array.from({ length: index.files }, (_, k) => readJson(path.join(dir, `departures/${k}.json`)));
  const record = (id) => files[chunkOf(id, index.files)][id];
  const sizes = files.map((_, k) => fs.statSync(path.join(dir, `departures/${k}.json`)).size);
  const stops = readJson(path.join(dir, 'stops.geojson')).features;
  const missing = stops.filter((f) => !record(String(f.properties.id)));
  // RTD's stops layer lists some stops its timetable feed doesn't carry at all (a service outside
  // the feed, or a stop the feed has dropped). They have no record, and their card says the
  // timetable lists no trips there. With the feed given, the recount below proves every stop
  // that is in the feed has all its departures, so a stop missing here has none in RTD's file.
  if (missing.length) {
    const onMap = missing.filter((f) => f.properties.lines);
    console.log(`${missing.length} drawn stops are not in RTD's timetable (${onMap.length} of them on a route the map draws: ${[...new Set(onMap.map((f) => f.properties.lines))].join(', ') || 'none'}); their card says the timetable lists no trips there`);
  }
  const directory = readJson(path.join(dir, 'directory.json'));
  const served = directory.stations.filter((s) => s.served);
  const noPlatforms = served.filter((s) => !(index.stations[s.id] ?? []).length);
  check(noPlatforms.length === 0, `${noPlatforms.length} served stations have no platforms to read departures from: ${noPlatforms.map((s) => s.label).join(', ')}`);
  // Each served station's platforms carry the lines the directory says call there.
  for (const s of served) {
    const lines = new Set((index.stations[s.id] ?? []).flatMap((id) => (record(id)?.d ?? []).map(([p]) => index.patterns[p][0])));
    const lacks = String(s.lines).split(' ').filter((line) => line && !lines.has(line));
    check(lacks.length === 0, `${s.label}: no departures on ${lacks.join(', ')} at its platforms (${[...lines].join(' ')})`);
  }
  let total = 0;
  for (const f of files) for (const r of Object.values(f)) for (const [p, gaps] of r.d) { total += gaps.length; check(index.patterns[p] && gaps.every((g, i) => Number.isInteger(g) && (i ? g >= 0 : g >= 0)), `a malformed record in pattern ${p}`); }
  console.log(`${total} departures, ${files.reduce((n, f) => n + Object.keys(f).length, 0)} stops in ${index.files} files (${Math.round(sizes.reduce((x, y) => x + y, 0) / 1000)} KB, largest ${Math.round(Math.max(...sizes) / 1000)} KB); `
    + `${stops.length} drawn stops and ${served.length} served stations covered; services ${Object.keys(index.services).join(' ')}, ${index.exceptions.length} exceptions, ${index.from} to ${index.to}`);
  if (b) {
    // The second reading: straight from the raw file, counting what the build should have kept.
    const { loadGtfs, csvRows } = await import('../scripts/lib/gtfs.mjs');
    const gtfs = await loadGtfs('unused', b);
    const rows = csvRows(gtfs.text['stop_times.txt']);
    const h = rows.next().value;
    const [tc, dc, sc, qc, pc] = ['trip_id', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type'].map((n) => h.indexOf(n));
    const last = new Map();
    const kept = [];
    for (const r of rows) {
      const seq = Number(r[qc]);
      if (seq > (last.get(r[tc]) ?? -Infinity)) last.set(r[tc], seq);
      kept.push([r[tc], seq, r[sc], r[dc], r[pc]]);
    }
    const want = new Map();
    for (const [trip, seq, stop, dep, pickup] of kept) if (seq !== last.get(trip) && dep && pickup !== '1') want.set(stop, (want.get(stop) ?? 0) + 1);
    let wrong = 0;
    const all = new Set([...want.keys(), ...files.flatMap((f) => Object.keys(f))]);
    for (const stop of all) {
      const got = (record(stop)?.d ?? []).reduce((n, [, gaps]) => n + gaps.length, 0);
      if (got !== (want.get(stop) ?? 0) && ++wrong <= 5) check(false, `stop ${stop}: ${got} departures built, ${want.get(stop) ?? 0} in RTD's file`);
    }
    check(wrong === 0, `${wrong} stops differ from RTD's raw file`);
    console.log(`recounted from RTD's stop_times: ${all.size} stops, ${[...want.values()].reduce((x, y) => x + y, 0)} departures, ${wrong} differ`);
  }
} else if (mode === 'page' && a) {
  const { chromium } = await import('@playwright/test');
  const out = path.join(ROOT, 'qa/.scratch/departures');
  fs.mkdirSync(out, { recursive: true });
  const sizes = { phone: { width: 393, height: 760 }, desktop: { width: 1280, height: 800 } };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const size of (process.env.SIZES ?? 'phone,desktop').split(',')) {
    for (const theme of (process.env.THEMES ?? 'light,dark').split(',')) {
      const tag = `${size}-${theme}`;
      const context = await browser.newContext({ viewport: sizes[size], deviceScaleFactor: 2, colorScheme: theme, hasTouch: size === 'phone', isMobile: size === 'phone' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const index = await (await fetch(`${a}/data/departures/index.json`)).json();
      const stops = (await (await fetch(`${a}/data/stops.geojson`)).json()).features;
      const directory = await (await fetch(`${a}/data/directory.json`)).json();
      const file = async (id) => (await (await fetch(`${a}/data/departures/${chunkOf(id, index.files)}.json`)).json())[id];
      // The clock is held: the next Monday-to-Thursday in the feed at 7:40am, and the feed's first holiday at 10am.
      const zone = (date, h, m) => { // the instant that is h:m on that date in the timetable's zone
        const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)), h + 7, m);
        for (const shift of [0, -3600e3, 3600e3]) { const c = clockIn(new Date(guess + shift), index.tz); if (c.date === date && c.minutes === h * 60 + m) return new Date(guess + shift); }
        return new Date(guess);
      };
      let day = clockIn(new Date(), index.tz).date;
      const added = new Set(index.exceptions.map(([d]) => d));
      while (added.has(day) || !Object.values(index.services).some((s) => s.days.slice(0, 4).includes('1') && [...servicesOn(index, day) ?? []].some((id) => index.services[id] === s)) || [5, 6].includes((new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)))).getUTCDay() + 6) % 7)) day = addDays(day, 1);
      const holiday = index.exceptions.map(([d]) => d).sort().find((d) => d > day) ?? null;
      const shot = (name) => page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
      const rest = async () => {
        await page.evaluate(() => new Promise((ok) => { const m = window.sheetsMap; const t = setTimeout(ok, 6000); const go = () => { clearTimeout(t); ok(); }; if (m.loaded() && !m.isMoving()) setTimeout(go, 300); else m.once('idle', go); }));
        await page.waitForTimeout(350);
      };
      const rowsOnCard = () => page.evaluate(() => [...document.querySelectorAll('#card .next li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()));
      // A row as the card reads: "Route 15 to Union Station 8:00am, 8:30am", "A Line to Denver Airport 8:05am".
      const want = (records, now, { rail, first } = {}) => upcoming(records, index, now, { first }).rows.slice(0, 6)
        .map((r) => `${rail?.has(r.route) ? `${r.name} Line` : `Route ${r.name}`} to ${r.headsign} ${r.times.map((t) => t.clock).join(', ')}`.replace(/\s+/g, ' ').trim());
      // The page's own clock, which runs on from the time it was set to while the check works.
      const pageNow = async () => clockIn(new Date(await page.evaluate(() => Date.now())), index.tz);
      const tap = async (at) => {
        const p = await page.evaluate((c) => { const q = window.sheetsMap.project(c); return [q.x, q.y]; }, at);
        await page.mouse.click(p[0], p[1]);
        await page.waitForSelector('#card:not([hidden])', { timeout: 10000 }).catch(() => {});
        await page.waitForSelector('#card .departures:not([hidden])', { timeout: 15000 }).catch(() => check(false, `${tag}: no departures on the card after a tap at ${at}`));
        await page.waitForTimeout(250);
      };
      const onScreen = async (what) => {
        const box = await page.evaluate(() => { const c = document.querySelector('#card').getBoundingClientRect(); const s = document.querySelector('#steps').getBoundingClientRect(); const cut = [...document.querySelectorAll('#card .next .at')].filter((el) => el.scrollWidth > el.clientWidth + 1).length; return { top: c.top, left: c.left, right: c.right, bottom: c.bottom, steps: s.top, cut }; });
        check(box.top >= 0 && box.left >= 0 && box.right <= sizes[size].width && box.bottom <= box.steps && box.cut === 0, `${tag}: ${what}'s card runs off the screen, over the sheet buttons, or cuts a time (${JSON.stringify(box)})`);
      };

      for (const [when, date, h, m] of [['weekday', day, 7, 40], ...(holiday ? [['holiday', holiday, 10, 0]] : [])]) {
        const now = { date, minutes: h * 60 + m };
        await page.clock.install({ time: zone(date, h, m) });
        // The busiest drawn stop then, so the card is at its fullest.
        const rail = new Set(directory.routes.filter((r) => r.mode === 'rail').map((r) => r.route));
        const some = stops.filter((f) => !f.properties.platform).filter((_, i) => i % 23 === 0);
        let best = null;
        for (const f of some) { const rec = await file(String(f.properties.id)); const n = rec ? upcoming([rec], index, now).rows.length : 0; if (!best || n > best.n) best = { f, rec, n }; }
        await page.goto(`${a}/?theme=${theme}#16/${best.f.geometry.coordinates[1].toFixed(5)}/${best.f.geometry.coordinates[0].toFixed(5)}`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.sheetsReady, null, { timeout: 90000 });
        await rest();
        await tap(best.f.geometry.coordinates);
        const title = await page.textContent('#card-title').catch(() => '');
        if (check(title === best.f.properties.name, `${tag} ${when}: tapped stop ${best.f.properties.id} "${best.f.properties.name}" but the card is "${title}"`)) {
          const got = await rowsOnCard();
          const exp = want([best.rec], await pageNow(), { rail });
          check(JSON.stringify(got) === JSON.stringify(exp), `${tag} ${when}: stop ${best.f.properties.id} shows ${JSON.stringify(got)}, the timetable gives ${JSON.stringify(exp)}`);
          check((await page.textContent('#card .departures .head')) === 'Next departures, scheduled', `${tag} ${when}: the departures are not headed as scheduled`);
          check((await page.textContent('#card .departures .about') ?? '').startsWith(`Stop ${best.f.properties.id}`), `${tag} ${when}: the stop's number is not on its card`);
          await onScreen(`stop ${best.f.properties.id}`);
        }
        await shot(`${when}-1-stop`);
        // A station: its platforms' trains, each line and direction.
        const station = directory.stations.filter((s) => s.served).sort((x, y) => y.lines.split(' ').length - x.lines.split(' ').length)[when === 'weekday' ? 0 : 3];
        await page.keyboard.press('Escape');
        await page.evaluate((hash) => { location.hash = hash; }, `#12/${station.at[1].toFixed(5)}/${station.at[0].toFixed(5)}`);
        await page.waitForTimeout(700);
        await rest();
        await tap(station.at);
        const records = (await Promise.all((index.stations[station.id] ?? []).map((id) => file(id)))).filter(Boolean);
        const stationTitle = await page.textContent('#card-title').catch(() => '');
        if (check(stationTitle === station.label, `${tag} ${when}: tapped station "${station.label}" but the card is "${stationTitle}"`)) {
          const got = await rowsOnCard();
          const exp = want(records, await pageNow(), { rail, first: (route) => rail.has(route) });
          check(JSON.stringify(got) === JSON.stringify(exp), `${tag} ${when}: ${station.label} shows ${JSON.stringify(got)}, the timetable gives ${JSON.stringify(exp)}`);
          await onScreen(station.label);
        }
        await shot(`${when}-2-station`);
        // The clock moves on: a departure that has left drops off without a tap.
        if (when === 'weekday') {
          const before = await rowsOnCard();
          await page.clock.runFor(31 * 60 * 1000);
          await page.waitForTimeout(200);
          const after = await rowsOnCard();
          const later = want(records, await pageNow(), { rail, first: (route) => rail.has(route) });
          check(JSON.stringify(after) === JSON.stringify(later) && JSON.stringify(after) !== JSON.stringify(before), `${tag}: half an hour on, ${station.label} still shows ${JSON.stringify(after)} (wanted ${JSON.stringify(later)})`);
        }
        await page.keyboard.press('Escape');
      }
      check(errors.length === 0, `${tag}: page errors: ${errors.slice(0, 3).join(' | ')}`);
      await context.close();
      console.log(`${tag}: done`);
    }
  }
  await browser.close();
  console.log(`captures in ${path.relative(ROOT, out)}/`);
} else {
  console.error('usage: node qa/departures.mjs data [dir] [gtfs.zip] | node qa/departures.mjs page <base>');
  process.exit(2);
}

if (failures.length) {
  console.error(`${failures.length} failure${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  process.exit(1);
}
console.log('departures: ok');
