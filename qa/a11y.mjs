// The sheets page with a screen reader's eyes (#14): the accessibility tree, axe-core, what the
// live region says, focus and the tab order, in headless Chromium at 393×760 touch, both themes.
// Usage: node qa/a11y.mjs [base url, default http://localhost:8788/] [out dir, default qa/.scratch/a11y]
// It reads the tree, not speech: a VoiceOver check on a phone is still a person's.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SHEETS, OPENING } from '../public/js/sheets/style.js';

const BASE = process.argv[2] ?? process.env.CHECK_URL ?? 'http://localhost:8788/';
const OUT = process.argv[3] ?? 'qa/.scratch/a11y';
await mkdir(OUT, { recursive: true });
const results = [];
const check = (theme, name, ok, detail = '') => {
  results.push({ theme, name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${theme}: ${name}${detail ? ` (${detail})` : ''}`);
};

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 393, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // At rest, and no step waiting for its sheet (main.js, sheetsHeld): a held step has not happened yet.
  const settled = async () => {
    await page.waitForFunction(() => window.sheetsMap?.isStyleLoaded() && window.sheetsMap.areTilesLoaded() && !window.sheetsMap.isMoving() && !window.sheetsHeld, null, { timeout: 60_000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  };
  let visits = 0;
  const visit = async () => {
    const url = new URL(BASE); url.searchParams.set('qa-a11y', ++visits);
    await page.goto(url.href);
    await page.waitForFunction(() => window.sheetsReady && window.sheetsAll, null, { timeout: 60_000 });
    await settled();
  };
  await visit();
  // What the live region says once a step that waits for its sheet has been taken.
  const said = () => page.waitForFunction(() => !window.sheetsHeld, null, { timeout: 60_000 }).then(() => page.waitForTimeout(250)).then(() => page.locator('#say').textContent());
  const axe = async (label, include) => {
    let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']);
    if (include) b = b.include(include);
    const { violations } = await b.analyze();
    check(theme, `axe, ${label}`, !violations.length, violations.map((v) => `${v.id}: ${v.nodes.length} [${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}]`).join('; '));
  };

  // The page at rest.
  const tree = await page.locator('body').ariaSnapshot();
  await writeFile(path.join(OUT, `${theme}-rest.yaml`), tree);
  check(theme, 'map canvas has a label', /region "Map of RTD bus and rail service/.test(tree) || /Map of RTD bus and rail service/.test(tree));
  check(theme, 'sheet buttons named', /button "Wider sheet"/.test(tree) && /button "Closer sheet"/.test(tree));
  // The page opens one step in from the whole district (#152): its sheet, of all of them.
  const of = (i) => `Sheet ${i + 1} of ${SHEETS.length}`;
  check(theme, 'which sheet is showing', tree.includes(`img "${of(OPENING)}"`));
  await axe('at rest');

  // Steps.
  await page.locator('#in').click();
  check(theme, 'a step is said', (await said()) === of(OPENING + 1), await page.locator('#say').textContent());
  check(theme, 'dots say the sheet', (await page.locator('#sheets').getAttribute('aria-label')) === of(OPENING + 1));
  await settled();

  // A card: tap the first bus line found near the middle.
  const at = await page.evaluate(() => {
    const map = window.sheetsMap;
    const layers = map.getStyle().layers.map((l) => l.id).filter((id) => /^bus-\d+$/.test(id));
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    for (let r = 0; r < 200; r += 6) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        const p = [w / 2 + dx, h / 2 - 60 + dy];
        if (map.queryRenderedFeatures(p, { layers }).length) return p;
      }
    }
    return null;
  });
  check(theme, 'found a bus line to tap', at);
  if (at) {
    await page.touchscreen.tap(at[0], at[1]);
    await page.locator('#card:not([hidden])').waitFor();
    const open = await said();
    check(theme, 'the card is said when it opens', /\. (\d+ routes|(Route \S+|\S+ Line)(, |$))/.test(open), open);
    const cardTree = await page.locator('#card').ariaSnapshot();
    await writeFile(path.join(OUT, `${theme}-card.yaml`), cardTree);
    check(theme, 'card is a named region with a heading', /region/.test(await page.locator('body').ariaSnapshot()) && /heading .*\[level=2\]/.test(cardTree));
    check(theme, 'route buttons say "Route …" or "… Line"', /button "(Route [^"]+|[^"]+ Line)"/.test(cardTree));
    check(theme, 'card has a close button', /button "Close"/.test(cardTree));
    await axe('card open');
    await page.locator('#card').screenshot({ path: path.join(OUT, `${theme}-card.png`), scale: 'css' });

    // Pick and clear, by the card's first route.
    const first = page.locator('#card button[data-route]').first();
    const route = await first.getAttribute('data-route');
    const name = (await first.getAttribute('data-mode')) === 'rail' ? `${route} Line` : `Route ${route}`;
    await first.focus();
    await page.keyboard.press('Enter');
    check(theme, 'a pick is said', (await said()) === `${name} shown, the rest faded`, await page.locator('#say').textContent());
    check(theme, 'the pressed button keeps focus', await page.evaluate((r) => document.activeElement?.dataset?.route === r && document.activeElement.getAttribute('aria-pressed') === 'true', route));
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check(theme, 'focus is visible on a route button', ring === 'solid', ring);
    await page.keyboard.press('Enter');
    check(theme, 'a clear is said', (await said()) === 'Cleared');

    // Close: by the button, focus back on the map.
    await first.click();
    await page.locator('#card button.close').click();
    check(theme, 'close hides the card', await page.locator('#card').isHidden());
    check(theme, 'close clears the pick and says so', (await said()) === 'Cleared' && !(await page.evaluate(() => window.sheetsPick)));
    check(theme, 'focus goes back to the map', await page.evaluate(() => document.activeElement === window.sheetsMap.getCanvas()));
    // And by Escape.
    await page.touchscreen.tap(at[0], at[1]);
    await page.locator('#card:not([hidden])').waitFor();
    await page.keyboard.press('Escape');
    check(theme, 'Escape closes the card', await page.locator('#card').isHidden());
  }

  // A stop group, on a fresh page: the closest sheet, at the hub, a street whose stops are
  // lettered, its first point in the middle of the screen.
  await visit();
  for (let i = 0; i < 3; i++) { await page.locator('#in').click(); await settled(); }
  await page.evaluate(async () => {
    const { hub } = await (await fetch('/data/sheets.json')).json();
    window.sheetsMap.jumpTo({ center: hub });
  });
  await page.waitForTimeout(3000);
  const group = await page.evaluate(async () => {
    const map = window.sheetsMap;
    const f = map.querySourceFeatures('sheet-4', { sourceLayer: '_geojsonTileLayer', filter: ['has', 'groups'] })[0];
    if (!f) return null;
    const g = f.geometry;
    map.jumpTo({ center: g.type === 'MultiLineString' ? g.coordinates[0][0] : g.coordinates[0] });
    await new Promise((r) => setTimeout(r, 2500));
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    return [w / 2, h / 2];
  });
  check(theme, 'found a stop group to tap', group);
  if (group) {
    await page.touchscreen.tap(group[0], group[1]);
    await page.locator('#card:not([hidden])').waitFor({ timeout: 5000 }).catch(() => {});
    const groupTree = await page.locator('#card').ariaSnapshot().catch((e) => `error: ${e.message.split('\n')[0]} / hidden=${''}`);
    await writeFile(path.join(OUT, `${theme}-group.yaml`), groupTree);
    check(theme, 'each letter is said as its stop', /Stop [A-Z]/.test(groupTree), groupTree.split('\n').slice(0, 4).join(' / '));
    await axe('stop group card');
    await page.locator('#card').screenshot({ path: path.join(OUT, `${theme}-group.png`), scale: 'css' }).catch(() => {});
  }

  // Tab order from the top: nothing traps focus, the map is a stop on the way.
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur());
  const order = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || a.id || a.tagName).slice(0, 30) : ''; }));
  }
  check(theme, 'tab moves past the map', new Set(order).size >= 3, order.join(' → '));
  check(theme, 'focus visible on the sheet buttons', await page.evaluate(() => { const b = document.querySelector('#out:not(:disabled), #in:not(:disabled)'); b.focus(); return getComputedStyle(b).outlineStyle; }) !== 'none');
  // What's in view, by keyboard alone (#135): next after the map, a list of what is on screen
  // whose places open their cards and whose routes are picked, and Escape back to the button.
  check(theme, 'the map label names the list', /List what's in view/.test(await page.locator('canvas').getAttribute('aria-label')));
  await page.locator('canvas').focus();
  await page.keyboard.press('Tab');
  check(theme, 'Tab from the map reaches the list button', await page.evaluate(() => document.activeElement?.id === 'inview'));
  check(theme, 'the list button shows when focused', await page.locator('#inview').evaluate((b) => b.getBoundingClientRect().width > 40));
  await page.keyboard.press('Enter');
  check(theme, 'the list is said', /^In view: /.test(await said()), await page.locator('#say').textContent());
  check(theme, 'focus goes into the list', await page.evaluate(() => document.querySelector('#card').contains(document.activeElement)));
  const tree3 = await page.locator('#card').ariaSnapshot();
  await writeFile(path.join(OUT, `${theme}-list.yaml`), tree3);
  check(theme, 'the list has a heading and items', /heading "In view" \[level=2\]/.test(tree3) && /button "/.test(tree3));
  await axe('list of what is in view', '#card');
  const place = page.locator('#card .places button').first();
  if (await place.count()) {
    await place.focus();
    await page.keyboard.press('Enter');
    check(theme, 'a place in the list opens its card', (await page.locator('#card-title').textContent()) !== 'In view' && await page.evaluate(() => document.querySelector('#card').contains(document.activeElement)));
  }
  const route = page.locator('#card .routes button').first();
  if (await route.count()) {
    await route.focus();
    await page.keyboard.press('Enter');
    check(theme, 'a route is picked from the keyboard', !!(await page.evaluate(() => window.sheetsPick)));
  }
  await page.keyboard.press('Escape');
  check(theme, 'Escape goes back to the list button', await page.evaluate(() => document.activeElement?.id === 'inview') && await page.locator('#card').isHidden());

  // --- Search, the route panel and departures (#238, #162, #13) -----------------------
  // Each is scanned open, where its markup is: the results list, the panel unfolded, and a
  // stop's and a station's departures. And each is reached and left by keyboard alone.
  await visit();
  const focused = (test) => page.evaluate(test);
  const ringOn = (selector) => page.evaluate((q) => { const el = document.querySelector(q); return el ? getComputedStyle(el).outlineStyle : 'missing'; }, selector);
  const data = await page.evaluate(async () => {
    const d = await (await fetch('/data/directory.json')).json();
    const stops = (await (await fetch('/data/stops.geojson')).json()).features;
    const bus = d.routes.filter((r) => r.mode === 'bus' && r.wk).sort((a, b) => a.wk - b.wk)[0];
    const stop = stops.find((f) => !f.properties.platform && String(f.properties.lines ?? '').split(' ').includes(bus.route));
    const station = d.stations.filter((x) => x.served).sort((a, b) => b.lines.split(' ').length - a.lines.split(' ').length)[0];
    return { bus: bus.route, stop: String(stop.properties.id), stopName: stop.properties.name, station: station.label };
  });
  await page.keyboard.press('Tab');
  check(theme, 'search: Tab from the top of the page reaches the box first', await focused(() => document.activeElement?.id === 'search'));
  check(theme, 'search: focus is visible on the box', (await ringOn('#finder .bar')) === 'solid', await ringOn('#finder .bar'));
  await page.keyboard.type(data.bus, { delay: 20 });
  await page.waitForSelector('#search-list .opt', { timeout: 30_000 });
  await page.waitForTimeout(600);
  const box = await page.evaluate(() => {
    const input = document.querySelector('#search');
    const list = document.getElementById(input.getAttribute('aria-controls'));
    const active = document.getElementById(input.getAttribute('aria-activedescendant') ?? '');
    const options = [...list.querySelectorAll('[role="option"]')];
    return {
      role: input.getAttribute('role'), expanded: input.getAttribute('aria-expanded'), named: !!input.getAttribute('aria-label'),
      list: list?.getAttribute('role'), listNamed: !!list?.getAttribute('aria-label'),
      options: options.length, optionsNamed: options.every((o) => o.getAttribute('aria-label')),
      groups: [...list.querySelectorAll('[role="group"]')].every((g) => document.getElementById(g.getAttribute('aria-labelledby'))?.textContent),
      active: active?.getAttribute('aria-selected') === 'true', activeLabel: active?.getAttribute('aria-label') ?? '',
      said: document.querySelector('#finder [role="status"]').textContent,
    };
  });
  check(theme, 'search: the box is a named combobox that says its list is open', box.role === 'combobox' && box.expanded === 'true' && box.named, JSON.stringify(box));
  check(theme, 'search: results are named options in a named listbox, in named groups', box.list === 'listbox' && box.listNamed && box.options > 0 && box.optionsNamed && box.groups, JSON.stringify(box));
  check(theme, 'search: the box names the active result', box.active && box.activeLabel.startsWith(`Route ${data.bus},`), box.activeLabel);
  check(theme, 'search: how many results is said', /^\d+ results?$/.test(box.said), box.said);
  check(theme, 'search: the focus stays in the box while results show', await focused(() => document.activeElement?.id === 'search'));
  await axe('search results open', '#finder');
  if (box.options > 1) {
    await page.keyboard.press('ArrowDown');
    check(theme, 'search: the arrow keys move the active result', await focused(() => document.querySelector('#search').getAttribute('aria-activedescendant') === 'so-1' && document.getElementById('so-1').getAttribute('aria-selected') === 'true'));
    await page.keyboard.press('ArrowUp');
  }
  await page.keyboard.press('Escape');
  check(theme, 'search: Escape closes the list and keeps the box', await focused(() => document.querySelector('#search').getAttribute('aria-expanded') === 'false' && document.activeElement?.id === 'search'));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#card.route button.more', { timeout: 20_000 });
  await settled();
  check(theme, 'search: Enter opens the result and moves the focus to its card', await focused(() => document.querySelector('#card').contains(document.activeElement)));

  // The route panel, folded under the route's card.
  for (let i = 0; i < 4 && !(await focused(() => document.activeElement?.classList.contains('more'))); i++) await page.keyboard.press('Tab');
  check(theme, 'route panel: Tab reaches its fold', await focused(() => document.activeElement?.classList.contains('more')));
  check(theme, 'route panel: focus is visible on the fold', (await ringOn('#card button.more')) === 'solid', await ringOn('#card button.more'));
  check(theme, 'route panel: the fold says it is shut and what it opens', await focused(() => { const b = document.querySelector('#card button.more'); return b.getAttribute('aria-expanded') === 'false' && !!document.getElementById(b.getAttribute('aria-controls')); }));
  await page.keyboard.press('Enter');
  const panelSaid = await said();
  check(theme, 'route panel: the fold says it is open, and keeps the focus', await focused(() => { const b = document.querySelector('#card button.more'); return b.getAttribute('aria-expanded') === 'true' && document.activeElement === b && !document.querySelector('#route-more').hidden; }));
  check(theme, 'route panel: its rows are said when it opens', /Saturday.*Sunday/.test(panelSaid ?? ''), panelSaid);
  const panelTree = await page.locator('#route-more').ariaSnapshot();
  check(theme, 'route panel: rows are terms with their figures, and the link says it opens a new tab', /term/.test(panelTree) && /definition/.test(panelTree) && /link ".*opens in a new tab/.test(panelTree), panelTree.split('\n').slice(0, 6).join(' / '));
  await axe('route panel open', '#card');
  await page.keyboard.press('Tab');
  check(theme, 'route panel: Tab reaches the timetable link', await focused(() => document.activeElement?.matches('#route-more a.link')));
  check(theme, 'route panel: focus is visible on the link', (await ringOn('#route-more a.link')) === 'solid', await ringOn('#route-more a.link'));
  await page.keyboard.press('Escape');
  check(theme, 'route panel: Escape closes the card and returns to the search box', await page.locator('#card').isHidden() && await focused(() => document.activeElement?.id === 'search'));

  // Departures on a stop's card, then a station's, each found from the box by keyboard.
  for (const [kind, query, title] of [['stop', data.stop, data.stopName], ['station', data.station, data.station]]) {
    await page.locator('#search').fill('');
    await page.keyboard.type(query, { delay: 15 });
    await page.waitForFunction((q) => (document.querySelector('#search-list .opt')?.getAttribute('aria-label') ?? '').includes(q), kind === 'stop' ? `Stop ${query}` : title, { timeout: 30_000 }).catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForSelector('#card .departures:not([hidden])', { timeout: 30_000 }).catch(() => {});
    await settled();
    await page.waitForTimeout(400);
    const dep = await page.evaluate(() => {
      const box = document.querySelector('#card .departures');
      const head = box?.querySelector('[role="heading"]');
      const rows = [...(box?.querySelectorAll('.next li') ?? [])];
      return { shown: !!box && !box.hidden, title: document.querySelector('#card-title')?.textContent, head: head?.textContent, level: head?.getAttribute('aria-level'),
        rows: rows.length, said: rows.map((li) => li.innerText.replace(/\s+/g, ' ').trim()), times: rows.every((li) => li.querySelector('time')), none: box?.querySelector('.none')?.textContent ?? '',
        focus: document.querySelector('#card').contains(document.activeElement) };
    });
    check(theme, `departures (${kind}): the card opens on what was found, with the focus in it`, dep.title === title && dep.focus, `${dep.title}`);
    check(theme, `departures (${kind}): they sit under a heading that says they are scheduled`, dep.shown && dep.head === 'Next departures, scheduled' && dep.level === '3', `${dep.head}`);
    // With no trips in the hours ahead the card says so in words; otherwise each row is a list item that names its route and where it is headed.
    check(theme, `departures (${kind}): each row says its route, where to and its times; or the card says there are none`,
      dep.rows ? dep.times && dep.said.every((row) => /^(Route \S+|\S+ Line) to \S/.test(row)) : dep.none.length > 0, dep.rows ? dep.said[0] : dep.none);
    if (dep.rows) {
      const tree = await page.locator('#card .departures').ariaSnapshot();
      check(theme, `departures (${kind}): the rows are a list`, /- list/.test(tree) && /listitem/.test(tree), tree.split('\n').slice(0, 4).join(' / '));
    }
    await axe(`departures on a ${kind}'s card`, '#card');
    await page.keyboard.press('Escape');
    check(theme, `departures (${kind}): Escape closes the card and returns to the search box`, await page.locator('#card').isHidden() && await focused(() => document.activeElement?.id === 'search'));
  }
  check(theme, 'no page errors', !errors.length, errors.join('; '));
  await context.close();
}
await browser.close();
await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);
