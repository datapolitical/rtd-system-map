// Theme toggle: map/UI agreement, camera and pick preservation, keyboard access,
// saved preference before paint, the correct poster, and responsive placement.
// node qa/theme.mjs <site> [output]
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { SHEETS } from '../public/js/sheets/style.js';
const base = process.argv[2] ?? 'http://localhost:8788/';
const out = process.argv[3] ?? 'qa/.scratch/theme';
await mkdir(out, { recursive: true });
let browser;
const results = [];
try {
  for (const system of (process.env.THEME ? [process.env.THEME] : ['light', 'dark'])) {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 393, height: 760 }, colorScheme: system, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const ready = () => page.waitForFunction(() => window.sheetsAll && window.sheetsMap.loaded() && !window.sheetsMap.isMoving(), null, { timeout: 60000 });
    const palette = async (expected) => {
      await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, expected);
      await ready();
      const actual = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        scheme: getComputedStyle(document.documentElement).colorScheme,
        ground: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
        map: window.sheetsMap.getPaintProperty('ground', 'background-color'),
        browser: document.querySelector('meta[name="theme-color"]').content,
        pressed: document.querySelector('#theme-toggle').getAttribute('aria-pressed'),
      }));
      assert.equal(actual.theme, expected); assert.equal(actual.scheme, expected);
      assert.equal(actual.map, actual.ground); assert.equal(actual.browser, actual.ground);
      assert.equal(actual.pressed, String(expected === 'dark'));
    };
    const other = system === 'light' ? 'dark' : 'light';
    await page.goto(base); await palette(system);
    await page.screenshot({ path: `${out}/${system}-initial.png` });
    await page.emulateMedia({ colorScheme: other }); await palette(other);
    await page.emulateMedia({ colorScheme: system }); await palette(system);
    results.push({ system, check: 'uses device setting until a manual choice', ok: true });

    const directory = await (await page.request.get(new URL('/data/directory.json', base).href)).json();
    const rail = directory.routes.find((r) => r.mode === 'rail');
    assert.ok(rail);
    await page.evaluate((route) => {
      const m = window.sheetsMap, c = m.getCenter();
      location.hash = `#${m.getZoom()}/${c.lat}/${c.lng}/rail/${route}`;
    }, rail.route);
    await page.waitForFunction((route) => window.sheetsPick?.route === route && !document.querySelector('#card').hidden, rail.route);
    await ready();
    const button = page.getByRole('button', { name: 'Dark mode', exact: true });
    for (const zoom of SHEETS.map((x) => x.zoom)) {
      await page.evaluate((zoom) => window.sheetsMap.jumpTo({ zoom }), zoom); await ready();
      const before = await page.evaluate(() => ({ center: window.sheetsMap.getCenter().toArray(), zoom: window.sheetsMap.getZoom(), pick: window.sheetsPick, state: window.sheetsMap.getGlobalState(), card: document.querySelector('#card').textContent }));
      for (const expected of [other, system]) {
        await button.focus(); await page.keyboard.press('Enter'); await palette(expected);
        const after = await page.evaluate(() => ({ center: window.sheetsMap.getCenter().toArray(), zoom: window.sheetsMap.getZoom(), pick: window.sheetsPick, state: window.sheetsMap.getGlobalState(), card: document.querySelector('#card').textContent }));
        assert.deepEqual(after, before);
        assert.equal(await button.evaluate((b) => b === document.activeElement && getComputedStyle(b).outlineStyle === 'solid'), true);
      }
      results.push({ system, check: `keyboard toggle preserves view, pick and card at zoom ${zoom}`, ok: true });
    }
    await button.click(); await palette(other);
    await page.emulateMedia({ colorScheme: other }); await palette(other);
    await page.emulateMedia({ colorScheme: system }); await palette(other);
    assert.equal(await page.evaluate(() => localStorage.getItem('rtd-sheets-theme')), other);

    // Hold the map back so a saved preference and its poster can be checked before draw.
    let release; const gate = new Promise((done) => { release = done; });
    await page.route('**/data/meta.json', async (route) => { await gate; await route.continue(); });
    try {
      await page.goto(base, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelector('#poster img.whole')?.complete, null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), other);
      assert.ok((await page.locator('#poster img').evaluate((i) => i.currentSrc)).includes(`-${other}`));
    } finally { release(); }
    await palette(other); await page.unroute('**/data/meta.json');
    results.push({ system, check: 'saved preference overrides device setting before paint and uses matching poster', ok: true });

    for (const [width, height] of [[393, 760], [852, 393], [1440, 900]]) {
      await page.setViewportSize({ width, height }); await ready();
      const boxes = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { button: rect('#theme-toggle'), steps: rect('#steps'), credit: rect('#credit') };
      });
      const b = boxes.button;
      assert.ok(b.width >= 44 && b.height >= 44 && b.right <= width && b.bottom <= height && b.left > width / 2 && b.top > height / 2);
      for (const r of [boxes.steps, boxes.credit]) assert.ok(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom);
      await page.screenshot({ path: `${out}/${other}-${width}.png` });
      results.push({ system, check: `lower-right placement at ${width}×${height}`, ok: true });
    }
    const { violations } = await new AxeBuilder({ page }).include('#theme-toggle').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(violations, []);
    assert.deepEqual(errors, []);
    results.push({ system, check: 'accessible control and no page errors', ok: true });
    console.log(`${system}: ${results.filter((r) => r.system === system).length} theme checks passed`);
    await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
    await context.close();
    await browser.close(); browser = null;
  }
} finally { await browser?.close(); await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); }
