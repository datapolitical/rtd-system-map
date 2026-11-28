// Search on the sheets page (#238; DESIGN.md, "Search"), checked two ways.
//
//   node qa/search.mjs data            every route, station, Park-n-Ride and stop in the built data
//                                      (public/data/) is found by its own name and by its number
//   node qa/search.mjs page <base>     the box in a browser: chromium, a phone (393x760) and a desktop
//                                      (1280x800), both themes; by pointer and by keyboard; what a
//                                      screen reader is told; that the stops file waits for the box;
//                                      and that each kind of result moves the map and opens its card.
//                                      Captures go to qa/.scratch/search/.
//
// THEMES=light,dark and SIZES=phone,desktop narrow a run. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, base] = process.argv.slice(2);
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); return ok; };

if (mode === 'data') {
  const { buildIndex, find } = await import('../public/js/search/find.js');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
  const index = buildIndex({ directory: read('directory.json'), facilities: read('facilities.geojson'), stops: read('stops.geojson') });
  const count = { routes: 0, stations: 0, places: 0, stops: 0, stopNames: 0 };
  for (const e of index.routes) {
    count.routes++;
    check(find(index, e.r.route).routes[0]?.e === e, `route ${e.r.route} is not first for its own number`);
    if (e.r.name) check(find(index, e.r.name).routes.some((x) => x.e === e), `route ${e.r.route} is not found by its name "${e.r.name}"`);
    if (e.r.code) check(find(index, e.r.code).routes[0]?.e === e, `route ${e.r.route} is not first for RTD's code ${e.r.code}`);
  }
  for (const e of index.stations) {
    count.stations++;
    check(find(index, e.s.label || e.s.name).stations.some((x) => x.e === e), `station "${e.s.label}" is not found by its name`);
  }
  for (const e of index.places) {
    count.places++;
    check(find(index, e.p.name).places.some((x) => x.e === e), `"${e.p.name}" is not found by its name`);
  }
  const names = new Set();
  for (const e of index.stops) {
    count.stops++;
    check(find(index, e.id).stops[0]?.e === e, `stop ${e.id} is not first for its own number`);
    names.add(e.p.name);
  }
  for (const name of names) {
    count.stopNames++;
    check(find(index, name).stops.some((x) => x.e.p.name === name), `no stop is found by the name "${name}"`);
  }
  // Every facility is somewhere: its own result, or the station it stands at.
  const facilities = read('facilities.geojson').features.length;
  console.log(`routes ${count.routes}, stations ${count.stations}, Park-n-Rides and transit centers ${count.places} (of ${facilities} facilities; the rest are at a station), `
    + `stops ${count.stops} by number and ${count.stopNames} names`);
} else if (mode === 'page' && base) {
  const { chromium } = await import('@playwright/test');
  const out = path.join(ROOT, 'qa/.scratch/search');
  fs.mkdirSync(out, { recursive: true });
  const themes = (process.env.THEMES ?? 'light,dark').split(',');
  const sizes = { phone: { width: 393, height: 760 }, desktop: { width: 1280, height: 800 } };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const size of (process.env.SIZES ?? 'phone,desktop').split(',')) {
    for (const theme of themes) {
      const tag = `${size}-${theme}`;
      const context = await browser.newContext({ viewport: sizes[size], deviceScaleFactor: 2, colorScheme: theme, hasTouch: size === 'phone', isMobile: size === 'phone' });
      const page = await context.newPage();
      const asked = [];
      const errors = [];
      page.on('request', (r) => asked.push(new URL(r.url()).pathname));
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const shot = (name) => page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
      const rest = async () => {
        await page.evaluate(() => new Promise((ok) => { const m = window.sheetsMap; const t = setTimeout(ok, 6000); const go = () => { clearTimeout(t); ok(); }; if (m.loaded() && !m.isMoving()) setTimeout(go, 300); else m.once('idle', go); }));
        await page.waitForTimeout(350);
      };
      const type = async (text) => { await page.fill('#search', ''); await page.type('#search', text, { delay: 15 }); await page.waitForTimeout(120); };
      const rows = () => page.$$eval('#search-list .opt', (els) => els.map((el) => el.getAttribute('aria-label')));
      const card = () => page.evaluate(() => { const c = document.querySelector('#card'); return c.hidden ? null : { title: c.querySelector('#card-title')?.textContent, text: c.innerText, routes: [...c.querySelectorAll('button[data-route]')].map((b) => b.dataset.route) }; });
      const where = () => page.evaluate(() => ({ zoom: window.sheetsMap.getZoom(), center: window.sheetsMap.getCenter().toArray(), pick: window.sheetsPick ?? null }));
      // The ringed place must be on screen and clear of the search bar, the card and the buttons.
      const ringClear = () => page.evaluate(() => {
        const ring = document.querySelector('.found');
        if (!ring || !ring.isConnected) return 'no ring';
        const r = ring.getBoundingClientRect();
        const x = r.left + r.width / 2; const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return 'off screen';
        for (const q of ['#finder .bar', '#card', '#steps', '#theme-toggle']) {
          const el = document.querySelector(q);
          if (!el || el.hidden) continue;
          const b = el.getBoundingClientRect();
          if (x > b.left && x < b.right && y > b.top && y < b.bottom) return `under ${q}`;
        }
        return '';
      });

      // How far the ring's centre is from the mark the sheet draws for a stop or a station, in px:
      // the mark is found by its id among the drawn features, not by RTD's point for it (Chris,
      // 2026-11-27: "the circle seemed off center").
      const ringOff = (kind, id) => page.evaluate(({ kind, id }) => {
        const m = window.sheetsMap;
        const layers = m.getStyle().layers.filter((l) => new RegExp(`^${kind}-\\d+$`).test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id);
        const marks = m.queryRenderedFeatures({ layers }).filter((f) => String(f.properties.id) === String(id));
        const ring = document.querySelector('.found');
        if (!marks.length || !ring?.isConnected) return 999;
        // The middle of the mark as drawn: a stop's point, or a station's shape (every piece of it on screen).
        const pts = marks.flatMap((f) => { const c = f.geometry.coordinates.flat(Infinity); return c.filter((_, i) => i % 2 === 0).map((x, i) => m.project([x, c[2 * i + 1]])); });
        const p = { x: (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2, y: (Math.min(...pts.map((q) => q.y)) + Math.max(...pts.map((q) => q.y))) / 2 };
        const r = ring.getBoundingClientRect(); const box = m.getContainer().getBoundingClientRect();
        return Math.hypot(p.x + box.left - (r.left + r.width / 2), p.y + box.top - (r.top + r.height / 2));
      }, { kind, id });
      await page.goto(`${base}/?theme=${theme}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.sheetsReady, null, { timeout: 90000 });
      await rest();
      await shot('1-opening');
      // Nothing of search is fetched before the box is used.
      check(!asked.some((p) => /stops\.geojson|facilities\.geojson|search\/box\.js/.test(p)), `${tag}: search loaded before the box was used (${asked.filter((p) => /stops|facilities|search\//.test(p)).join(', ')})`);
      // The box is the first stop for a keyboard.
      await page.keyboard.press('Tab');
      check(await page.evaluate(() => document.activeElement?.id === 'search'), `${tag}: Tab from the page's start does not reach the search box first`);
      await page.waitForResponse((r) => r.url().endsWith('/data/stops.geojson'), { timeout: 30000 }).catch(() => check(false, `${tag}: the stops file never loaded`));
      await page.waitForTimeout(300);

      // --- By keyboard: a route by number --------------------------------------
      const data = await page.evaluate(async () => {
        const d = await (await fetch('/data/directory.json')).json();
        const s = await (await fetch('/data/stops.geojson')).json();
        const f = await (await fetch('/data/facilities.geojson')).json();
        const bus = d.routes.filter((r) => r.mode === 'bus').sort((a, b) => (a.wk ?? 999) - (b.wk ?? 999))[0];
        const rail = d.routes.find((r) => r.mode === 'rail');
        const station = d.stations.find((x) => x.served && x.lines.includes(rail.route));
        const stop = s.features.find((x) => !x.properties.platform && /&/.test(x.properties.name));
        const far = (p) => !d.stations.some((st) => Math.hypot((st.at[0] - p[0]) * 85000, (st.at[1] - p[1]) * 111000) < 600);
        const place = f.features.find((x) => x.properties.spaces > 0 && far(x.geometry.coordinates));
        return { bus: bus.route, busName: bus.name, rail: rail.route, station: station.label, stop: { id: String(stop.properties.id), name: stop.properties.name, at: stop.geometry.coordinates }, place: { name: place.properties.name, at: place.geometry.coordinates } };
      });
      await type(data.bus);
      const first = await rows();
      check(first.length > 0 && first.length <= 8, `${tag}: "${data.bus}" lists ${first.length} results (1 to 8 wanted)`);
      check(first[0]?.startsWith(`Route ${data.bus},`), `${tag}: "${data.bus}" does not lead with route ${data.bus} (${first[0]})`);
      check(await page.getAttribute('#search', 'aria-expanded') === 'true', `${tag}: aria-expanded is not true with the list open`);
      check(await page.getAttribute('#search', 'aria-activedescendant') === 'so-0', `${tag}: the first result is not the active one`);
      await page.waitForTimeout(500);
      const said = await page.textContent('#finder [role="status"]');
      check(said === `${first.length} ${first.length === 1 ? 'result' : 'results'}`, `${tag}: a screen reader hears "${said}", not the count`);
      await shot('2-list');
      if (first.length > 1) {
        await page.keyboard.press('ArrowDown');
        check(await page.getAttribute('#search', 'aria-activedescendant') === 'so-1', `${tag}: ArrowDown does not move to the second result`);
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        check(await page.getAttribute('#search', 'aria-activedescendant') === `so-${first.length - 1}`, `${tag}: ArrowUp from the first result does not wrap to the last`);
        await page.keyboard.press('ArrowDown');
      }
      await page.keyboard.press('Escape');
      check(await page.getAttribute('#search', 'aria-expanded') === 'false' && await page.inputValue('#search') === data.bus, `${tag}: Esc does not close the list and keep what was typed`);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      await rest();
      let c = await card();
      let w = await where();
      check(w.pick?.mode === 'bus' && w.pick.route === data.bus, `${tag}: choosing route ${data.bus} does not pick it`);
      check(c?.title === data.busName, `${tag}: route ${data.bus}'s card is titled "${c?.title}", not "${data.busName}"`);
      check(await page.evaluate(() => document.querySelector('#card').contains(document.activeElement)), `${tag}: the focus does not move to the route's card`);
      check(await page.inputValue('#search') === '', `${tag}: the box is not emptied once a result is chosen`);
      await shot('3-route');
      // The whole route is in view, between the search bar and its card. Then again with the route
      // panel open (a taller card) from a view far from the route: the tallest route there is, north
      // to south, which a guessed card height left off the screen (review of #254).
      const inView = (bbox) => page.evaluate(([w, s, e, n]) => {
        const m = window.sheetsMap; const a = m.project([w, n]); const b = m.project([e, s]);
        const top = document.querySelector('#finder .bar').getBoundingClientRect().bottom; const card = document.querySelector('#card').getBoundingClientRect().top;
        // On the widest sheet nothing wider can be shown: a route too long for it is centred there.
        const widest = m.getZoom() < window.sheetsZooms.zooms[1] - 0.3;
        const centred = Math.abs((a.x + b.x) / 2 - innerWidth / 2) < 40 && (a.y + b.y) / 2 > top && (a.y + b.y) / 2 < card;
        const fits = (a.x >= -2 && b.x <= innerWidth + 2 && a.y >= top - 2 && b.y <= card + 2) || (widest && centred);
        return fits ? '' : `route spans x ${Math.round(a.x)} to ${Math.round(b.x)}, y ${Math.round(a.y)} to ${Math.round(b.y)}; clear area is y ${Math.round(top)} to ${Math.round(card)} of ${innerWidth} wide, zoom ${m.getZoom().toFixed(2)}`;
      }, bbox);
      const entries = await page.evaluate(async () => (await (await fetch('/data/directory.json')).json()).routes);
      check((await inView(entries.find((r) => r.route === data.bus && r.mode === 'bus').bbox)) === '', `${tag}: route ${data.bus} from search is not all in view: ${await inView(entries.find((r) => r.route === data.bus && r.mode === 'bus').bbox)}`);
      if (await page.locator('#card button.more').count()) {
        await page.click('#card button.more');
        // Routes taller than they are wide, tallest first: the card's height decides their sheet.
        const tall = entries.filter((r) => r.mode === 'bus' && r.bbox[3] - r.bbox[1] > (r.bbox[2] - r.bbox[0]) * 1.3).sort((x, y) => (y.bbox[3] - y.bbox[1]) - (x.bbox[3] - x.bbox[1])).slice(0, 12);
        for (const r of tall) {
          await page.evaluate(([w, s]) => window.sheetsMap.jumpTo({ center: [w - 0.25, s - 0.2] }), r.bbox);
          await page.click('#search');
          await type(r.route);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
          await rest();
          if ((await where()).pick?.route !== r.route) continue; // another route leads for these letters
          check((await inView(r.bbox)) === '', `${tag}: with the route panel open, route ${r.route} from search is not all in view: ${await inView(r.bbox)}`);
        }
        await shot('3b-route-panel-open');
        await page.click('#card button.more');
      }
      // Esc closes the card and gives the focus back to the box.
      await page.focus('#card button[data-route]');
      await page.keyboard.press('Escape');
      check((await card()) === null && await page.evaluate(() => document.activeElement?.id === 'search'), `${tag}: Esc on the card does not close it and return to the search box`);

      // --- A rail line by its letter ----------------------------------------------
      await type(data.rail);
      check((await rows())[0]?.startsWith(`${data.rail} Line,`), `${tag}: "${data.rail}" does not lead with the ${data.rail} Line`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      await rest();
      w = await where();
      check(w.pick?.mode === 'rail' && w.pick.route === data.rail, `${tag}: choosing the ${data.rail} Line does not pick it`);
      await shot('4-rail');

      // --- By pointer: a station -------------------------------------------------------
      await page.click('#search');
      await type(data.station);
      const stationRow = page.locator('#search-list .opt', { hasText: data.station }).first();
      check(await stationRow.count() === 1, `${tag}: station "${data.station}" is not listed`);
      await shot('5-station-list');
      await stationRow.click();
      await page.waitForTimeout(600);
      await rest();
      c = await card();
      w = await where();
      check(c?.title === data.station && c.routes.includes(data.rail), `${tag}: the station's card is "${c?.title}" with ${c?.routes}`);
      check(w.pick === null, `${tag}: a station result leaves a route picked`);
      check(w.zoom >= 12.9, `${tag}: the station is shown at zoom ${w.zoom.toFixed(2)}, too far out to see it`);
      check((await ringClear()) === '', `${tag}: the station's ring is ${await ringClear()}`);
      const stationId = (await page.evaluate(async (label) => (await (await fetch('/data/directory.json')).json()).stations.find((x) => x.label === label).id, data.station));
      check((await ringOff('station', stationId)) < 1.5, `${tag}: the ring's centre is ${(await ringOff('station', stationId)).toFixed(1)} px from the station's mark as the sheet draws it`);
      await shot('6-station');

      // --- A stop by its number ---------------------------------------------------------
      await page.click('#search');
      await type(data.stop.id);
      const stopRows = await rows();
      check(stopRows[0]?.includes(`Stop ${data.stop.id}`), `${tag}: stop ${data.stop.id} does not lead for its own number (${stopRows[0]})`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      await rest();
      c = await card();
      w = await where();
      check(c?.title === data.stop.name && c.text.includes(`Bus stop ${data.stop.id}`), `${tag}: the stop's card is "${c?.title}": ${c?.text}`);
      check(await page.evaluate(() => !!window.sheetsMap.getLayer(`stop-${window.sheetsZooms.ids[window.sheetsZooms.zooms.findIndex((z) => Math.abs(z - window.sheetsMap.getZoom()) < 0.3)]}`)), `${tag}: the stop is shown on a sheet that draws no stops (zoom ${w.zoom.toFixed(2)})`);
      check((await ringClear()) === '', `${tag}: the stop's ring is ${await ringClear()}`);
      check((await ringOff('stop', data.stop.id)) < 1.5, `${tag}: the ring's centre is ${(await ringOff('stop', data.stop.id)).toFixed(1)} px from the stop's mark as the sheet draws it`);
      await shot('7-stop');
      // A tap on the map takes the ring away.
      await page.mouse.click(sizes[size].width / 2, sizes[size].height / 2 + 60);
      await page.waitForTimeout(200);
      check(await page.evaluate(() => !document.querySelector('.found')?.isConnected), `${tag}: the ring stays after a tap on the map`);

      // --- A Park-n-Ride by name ----------------------------------------------------------
      await page.click('#search');
      await type(data.place.name);
      const placeRow = page.locator('#search-list .opt', { hasText: data.place.name }).first();
      check(await placeRow.count() === 1, `${tag}: "${data.place.name}" is not listed`);
      await placeRow.click();
      await page.waitForTimeout(600);
      await rest();
      c = await card();
      check(c?.title === data.place.name && /parking spaces/.test(c.text), `${tag}: the Park-n-Ride's card is "${c?.title}": ${c?.text}`);
      check((await ringClear()) === '', `${tag}: the Park-n-Ride's ring is ${await ringClear()}`);
      await shot('8-place');

      // --- Nothing found, said plainly ---------------------------------------------------
      await page.click('#search');
      await type('qqzzx');
      check(/^Nothing matches/.test((await page.textContent('#finder .empty')) ?? ''), `${tag}: no plain words for an empty result`);
      await page.waitForTimeout(500);
      check(/^No results for qqzzx/.test(await page.textContent('#finder [role="status"]')), `${tag}: a screen reader is not told there are no results`);
      await shot('9-nothing');
      await page.click('#finder .clear');
      check(await page.inputValue('#search') === '' && await page.getAttribute('#search', 'aria-expanded') === 'false', `${tag}: the clear button does not empty the box`);

      check(errors.length === 0, `${tag}: page errors: ${errors.slice(0, 3).join(' | ')}`);
      await context.close();
      console.log(`${tag}: done`);
    }
  }
  await browser.close();
  console.log(`captures in ${path.relative(ROOT, out)}/`);
} else {
  console.error('usage: node qa/search.mjs data | node qa/search.mjs page <base>');
  process.exit(2);
}

if (failures.length) {
  console.error(`${failures.length} failure${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  process.exit(1);
}
console.log('search: ok');
