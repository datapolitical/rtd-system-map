// The sheets page with a screen reader's eyes (#14): the accessibility tree, axe-core, what the
// live region says, focus and the tab order, in headless Chromium at 393×760 touch, both themes.
// Usage: node qa/a11y.mjs [base url, default http://localhost:8788/] [out dir, default qa/.scratch/a11y]
// It reads the tree, not speech: a VoiceOver check on a phone is still a person's.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8788/';
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
  await page.goto(BASE);
  await page.waitForFunction(() => window.sheetsReady, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  const said = () => page.waitForTimeout(250).then(() => page.locator('#say').textContent());
  const axe = async (label, include) => {
    let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']);
    if (include) b = b.include(include);
    const { violations } = await b.analyze();
    check(theme, `axe, ${label}`, !violations.length, violations.map((v) => `${v.id}: ${v.nodes.length}`).join('; '));
  };

  // The page at rest.
  const tree = await page.locator('body').ariaSnapshot();
  await writeFile(path.join(OUT, `${theme}-rest.yaml`), tree);
  check(theme, 'map canvas has a label', /region "Map of RTD bus and rail service/.test(tree) || /Map of RTD bus and rail service/.test(tree));
  check(theme, 'sheet buttons named', /button "Wider sheet"/.test(tree) && /button "Closer sheet"/.test(tree));
  check(theme, 'which sheet is showing', /img "Sheet 1 of 4"/.test(tree));
  await axe('at rest');

  // Steps.
  await page.locator('#in').click();
  check(theme, 'a step is said', (await said()) === 'Sheet 2 of 4', await page.locator('#say').textContent());
  check(theme, 'dots say the sheet', (await page.locator('#sheets').getAttribute('aria-label')) === 'Sheet 2 of 4');
  await page.waitForTimeout(600);

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
  await page.goto(BASE);
  await page.waitForFunction(() => window.sheetsReady, null, { timeout: 60_000 });
  for (let i = 0; i < 3; i++) { await page.locator('#in').click(); await page.waitForTimeout(600); }
  await page.evaluate(async () => {
    const { hub } = await (await fetch('/data/sheets.json')).json();
    window.sheetsMap.jumpTo({ center: hub });
  });
  await page.waitForTimeout(3000);
  const group = await page.evaluate(async () => {
    const map = window.sheetsMap;
    const f = map.querySourceFeatures('sheet-4', { filter: ['has', 'groups'] })[0];
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
  check(theme, 'no page errors', !errors.length, errors.join('; '));
  await context.close();
}
await browser.close();
await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);
