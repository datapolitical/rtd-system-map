// The route panel on the sheets page (#162, #22; DESIGN.md, "Route panel wording"), checked two ways.
//
//   node qa/panel-route.mjs data [dir]     every route in the built directory (public/data, or dir)
//                                          makes a panel with nothing missing or malformed in it;
//                                          prints how many routes have each row
//   node qa/panel-route.mjs page <base>    the panel in a browser: chromium, a phone (393x760) and a
//                                          desktop (1280x800), both themes; folded and open, by
//                                          pointer and by keyboard; its words against the directory;
//                                          that it stays on the screen. Captures in qa/.scratch/panel/.
//
// THEMES=light,dark and SIZES=phone,desktop narrow a run. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, arg] = process.argv.slice(2);
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); return ok; };
const { routePanel, routePanelHtml, routePanelSaid } = await import('../public/js/panel/route.js');

if (mode === 'data') {
  const dir = JSON.parse(fs.readFileSync(path.join(arg ?? path.join(ROOT, 'public/data'), 'directory.json'), 'utf8'));
  const windows = dir.windows ?? {};
  check(['midday', 'am', 'pm', 'eve'].every((w) => Array.isArray(windows[w]) && windows[w].length === 2), `the directory has no measuring windows (${JSON.stringify(windows)}): built before #22`);
  const count = { routes: 0, am: 0, pm: 0, eve: 0, oneWay: 0, saturday: 0, sunday: 0, trips: 0, link: 0 };
  const oneWay = [];
  for (const r of dir.routes) {
    count.routes++;
    const p = routePanel(r, windows);
    const text = `${routePanelHtml(p)} ${routePanelSaid(p)} ${p.title} ${p.goes}`;
    check(!/undefined|NaN|null|Every 0 min|\[object/.test(text), `route ${r.route}: malformed words: ${text.match(/.{0,30}(undefined|NaN|null|Every 0 min|\[object).{0,30}/)?.[0]}`);
    check(p.title && p.headline.figure, `route ${r.route}: no title or headline`);
    // Every figure says when: a row's label names its hours wherever it gives a frequency.
    for (const row of p.rows) check(!/^Every/.test(row.value) || /\d(am|pm)$/.test(row.label), `route ${r.route}: "${row.label}: ${row.value}" does not say its hours`);
    if (r.wk_trips) check(p.rows.length === 5, `route ${r.route}: ${p.rows.length} rows, not the five (three weekday windows, Saturday, Sunday)`);
    const value = (label) => p.rows.find((row) => row.label.startsWith(label))?.value ?? '';
    if (/^Every/.test(value('Weekdays, 6'))) count.am++;
    if (/^Every/.test(value('Weekdays, 3'))) count.pm++;
    if (/^Every/.test(value('Weekdays, 7'))) count.eve++;
    if (p.rows.some((row) => /one direction/.test(row.value))) { count.oneWay++; oneWay.push(r.route); }
    if (/^Every/.test(value('Saturday'))) count.saturday++;
    if (/^Every/.test(value('Sunday'))) count.sunday++;
    if (p.trips) count.trips++;
    if (p.link) count.link++;
    // A rush-hour route must have a rush-hour figure: the reason the rows exist.
    if (r.tier === 'peak') check(/^Every|trip/.test(value('Weekdays, 6')) || /^Every|trip/.test(value('Weekdays, 3')), `route ${r.route} is "Rush hours only" with no rush-hour row`);
  }
  console.log(`routes ${count.routes}: a frequency 6 to 9am ${count.am}, 3 to 6pm ${count.pm}, 7 to 10pm ${count.eve}, Saturday ${count.saturday}, Sunday ${count.sunday}; first and last trips ${count.trips}; timetable link ${count.link}`);
  console.log(`one direction only in a window (${count.oneWay}): ${oneWay.join(' ')}`);
} else if (mode === 'page' && arg) {
  const { chromium } = await import('@playwright/test');
  const out = path.join(ROOT, 'qa/.scratch/panel');
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
      const shot = (name) => page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
      const rest = async () => {
        await page.evaluate(() => new Promise((ok) => { const m = window.sheetsMap; const t = setTimeout(ok, 6000); const go = () => { clearTimeout(t); ok(); }; if (m.loaded() && !m.isMoving()) setTimeout(go, 300); else m.once('idle', go); }));
        await page.waitForTimeout(350);
      };
      await page.goto(`${arg}/?theme=${theme}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.sheetsReady, null, { timeout: 90000 });
      const dir = await page.evaluate(async () => (await (await fetch('/data/directory.json')).json()));
      const windows = dir.windows ?? {};
      // A frequent bus, a rush-hour bus with one-way service where there is one, and a rail line.
      const bus = dir.routes.filter((r) => r.mode === 'bus' && r.wk).sort((a, b) => a.wk - b.wk)[0];
      const peak = dir.routes.find((r) => r.mode === 'bus' && r.wk_one) ?? dir.routes.find((r) => r.tier === 'peak');
      const rail = dir.routes.find((r) => r.mode === 'rail');
      for (const [name, r] of [['bus', bus], ['peak', peak], ['rail', rail]]) {
        if (!r) continue;
        const [w, s, e, n] = r.bbox;
        await page.evaluate((hash) => { location.hash = hash; }, `#10/${((s + n) / 2).toFixed(4)}/${((w + e) / 2).toFixed(4)}/${r.mode}/${encodeURIComponent(r.route)}`);
        await page.waitForSelector('#card.route button.more', { timeout: 15000 }).catch(() => check(false, `${tag}: route ${r.route}'s card has no "Times through the week" row`));
        await rest();
        const want = routePanel(r, windows);
        if (name === 'bus') {
          // Folded: the card's two lines and the row that opens the panel, nothing more.
          check(await page.getAttribute('#card button.more', 'aria-expanded') === 'false' && await page.isHidden('#route-more'), `${tag}: route ${r.route}'s panel is not folded when its card first opens`);
          const folded = await page.evaluate(() => document.querySelector('#card').getBoundingClientRect().height);
          check(folded <= 100, `${tag}: route ${r.route}'s folded card is ${Math.round(folded)} px tall (100 at most, to keep the map clear)`);
          await shot('1-folded');
          // By keyboard: the fold is a button a keyboard reaches, and it says whether it is open.
          await page.focus('#card button.more');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(250);
          check(await page.getAttribute('#card button.more', 'aria-expanded') === 'true' && await page.isVisible('#route-more'), `${tag}: Enter on the fold does not open route ${r.route}'s panel`);
          check(await page.evaluate(() => document.activeElement?.classList.contains('more')), `${tag}: the fold loses the focus when it opens`);
          check(await page.textContent('#say') === routePanelSaid(want), `${tag}: a screen reader hears "${await page.textContent('#say')}" when route ${r.route}'s panel opens`);
        } else {
          // Once opened, it is open for the next route too.
          check(await page.getAttribute('#card button.more', 'aria-expanded') === 'true' && await page.isVisible('#route-more'), `${tag}: the panel does not stay open for the next route (${r.route})`);
        }
        const got = await page.evaluate(() => ({
          headline: document.querySelector('#route-more .headline').innerText.replace(/\s+/g, ' ').trim(),
          rows: [...document.querySelectorAll('#route-more .week dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent]),
          trips: document.querySelector('#route-more .trips')?.textContent ?? '',
          link: document.querySelector('#route-more a.link')?.href ?? '',
        }));
        check(got.headline === [want.headline.figure, want.headline.when].filter(Boolean).join(' '), `${tag}: route ${r.route}'s headline is "${got.headline}"`);
        check(JSON.stringify(got.rows) === JSON.stringify(want.rows.map((row) => [row.label, row.value])), `${tag}: route ${r.route}'s rows are ${JSON.stringify(got.rows)}`);
        check(got.trips === want.trips, `${tag}: route ${r.route}'s first and last trips read "${got.trips}"`);
        check(got.link === (want.link?.href ?? ''), `${tag}: route ${r.route}'s timetable link is "${got.link}"`);
        // Open, the card stays on the screen, clear of the buttons under it, and nothing in it is cut off.
        const box = await page.evaluate(() => {
          const c = document.querySelector('#card').getBoundingClientRect();
          const steps = document.querySelector('#steps').getBoundingClientRect();
          const cut = [...document.querySelectorAll('#route-more dt, #route-more dd, #route-more p, #card-title')].filter((el) => el.scrollWidth > el.clientWidth + 1 && el.id !== 'card-title').map((el) => el.textContent);
          return { top: c.top, bottom: c.bottom, left: c.left, right: c.right, steps: steps.top, scrolls: document.querySelector('#card').scrollHeight > document.querySelector('#card').clientHeight + 1, cut };
        });
        check(box.top >= 0 && box.left >= 0 && box.right <= sizes[size].width && box.bottom <= box.steps, `${tag}: route ${r.route}'s open card runs off the screen or over the sheet buttons (${JSON.stringify(box)})`);
        check(!box.scrolls, `${tag}: route ${r.route}'s open card has to be scrolled`);
        check(box.cut.length === 0, `${tag}: route ${r.route}'s panel cuts off: ${box.cut.join(' | ')}`);
        await rest();
        await shot(`2-open-${name}`);
        // Open stays open for the next route; a tap on the fold shuts it again.
        if (name === 'rail') {
          await page.click('#card button.more');
          await page.waitForTimeout(200);
          check(await page.isHidden('#route-more') && await page.getAttribute('#card button.more', 'aria-expanded') === 'false', `${tag}: a tap on the fold does not shut the panel`);
          await shot('3-folded-rail');
        }
      }
      // Esc closes the card from inside the panel.
      await page.focus('#card button.more');
      await page.keyboard.press('Escape');
      check(await page.isHidden('#card'), `${tag}: Esc does not close the card`);
      check(errors.length === 0, `${tag}: page errors: ${errors.slice(0, 3).join(' | ')}`);
      await context.close();
      console.log(`${tag}: done`);
    }
  }
  await browser.close();
  console.log(`captures in ${path.relative(ROOT, out)}/`);
} else {
  console.error('usage: node qa/panel-route.mjs data [dir] | node qa/panel-route.mjs page <base>');
  process.exit(2);
}

if (failures.length) {
  console.error(`${failures.length} failure${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  process.exit(1);
}
console.log('route panel: ok');
