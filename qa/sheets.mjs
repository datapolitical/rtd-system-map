// Regression checks for the four-sheet launch and the issues found in its audit.
// node qa/sheets.mjs <base-url> [out-dir]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? process.env.CHECK_URL ?? 'http://localhost:8788/';
const OUT = process.argv[3] ?? 'qa/.scratch/sheets';
await mkdir(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 760 }, hasTouch: true, isMobile: true, colorScheme: theme, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], warnings = [];
    let visits = 0;
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    const check = async (name, run) => {
      try { const detail = await run(); results.push({ theme, name, ok: true, detail }); console.log(`ok ${theme}: ${name}`); }
      catch (e) { results.push({ theme, name, ok: false, error: e.message }); console.log(`FAIL ${theme}: ${name}: ${e.message}`); }
    };
    const visit = async (hash = '') => {
      await page.goto(`${BASE}?theme=${theme}&qa=${++visits}${hash}`);
      await page.waitForFunction(() => window.sheetsReady && window.sheetsAll && !window.sheetsMap.isMoving() && window.sheetsMap.isStyleLoaded() && window.sheetsMap.areTilesLoaded(), null, { timeout: 60000 });
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
      await page.waitForFunction(() => !window.sheetsMap.isMoving() && window.sheetsMap.isStyleLoaded() && window.sheetsMap.areTilesLoaded(), null, { timeout: 60000 });
    };
    await visit();
    await check('#145 every rail line in the opening view is lettered', async () => {
      const { rails, letters } = await page.evaluate(() => {
        const m = window.sheetsMap;
        return { rails: [...new Set(m.queryRenderedFeatures({ layers: ['rail-1'] }).map((f) => f.properties.route))],
          letters: [...new Set(m.queryRenderedFeatures({ layers: ['letter-1'] }).map((f) => f.properties.route))] };
      });
      assert.deepEqual(rails.filter((r) => !letters.includes(r)), []);
      return { rails, letters };
    });
    await check('#146 zoom buttons keep the hub on screen', async () => {
      for (let i = 0; i < 3; i++) {
        await page.locator('#in').click(); await page.waitForTimeout(600);
        const visible = await page.evaluate(async () => {
          const { hub } = await (await fetch('/data/sheets.json')).json();
          const p = window.sheetsMap.project(hub), c = window.sheetsMap.getContainer();
          return p.x >= 0 && p.y >= 0 && p.x <= c.clientWidth && p.y <= c.clientHeight;
        });
        assert.ok(visible, `hub visible on sheet ${i + 2}`);
      }
    });
    await check('#144 every drawn bus stop names at least one route', async () => {
      const empty = await page.evaluate(async () => (await (await fetch('/data/sheet-4.geojson')).json()).features.filter((f) => f.properties.kind === 'stop' && !f.properties.routes).map((f) => f.properties.name));
      assert.deepEqual(empty, []); return { unservedStops: empty.length };
    });
    await check('#134 a picked route stays named while panning and Escape clears it', async () => {
      await visit('#14/39.7530/-105.0000/bus/15L');
      await page.waitForFunction(() => window.sheetsPick?.route === '15L' && !document.querySelector('#card').hidden);
      await page.mouse.move(160, 180); await page.mouse.down(); await page.mouse.move(210, 220, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(300);
      assert.ok(await page.locator('#card').isVisible());
      assert.ok((await page.locator('#card').textContent()).includes('15L'));
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.sheetsPick), null);
      assert.ok(await page.locator('#card').isHidden());
    });
    await check('#138 an invalid in-place route is dropped', async () => {
      await page.evaluate(() => { location.hash = '#14/39.7530/-105.0000/bus/NOPE99'; });
      await page.waitForFunction(() => !window.sheetsPick && !location.hash.includes('NOPE99'));
      assert.ok(await page.locator('#card').isHidden());
    });
    await check('#139 route hints describe highlighting without promising a fitted view', async () => {
      await visit('#14/39.7407/-104.9660');
      const point = await page.evaluate(() => {
        const m = window.sheetsMap, c = m.getContainer();
        for (let y = c.clientHeight / 2 - 90; y < c.clientHeight / 2 + 90; y += 4) for (let x = c.clientWidth / 2 - 80; x < c.clientWidth / 2 + 80; x += 4) {
          if (m.queryRenderedFeatures([x, y], { layers: ['bus-3'] }).some((f) => String(f.properties.routes).split(/,\s*/).includes('15'))) return [x, y];
        }
      });
      assert.ok(point); await page.touchscreen.tap(...point);
      assert.match(await page.locator('#card .hint').textContent(), /highlight/);
      assert.doesNotMatch(await page.locator('#card .hint').textContent(), /whole|way/);
    });
    await check('#137 #198 the stop-group key is on the screen and marks a picked route', async () => {
      await visit('#14/39.7465/-104.9925/bus/15L');
      await page.waitForFunction(() => window.sheetsPick?.route === '15L');
      await page.waitForFunction(() => !document.querySelector('#key').classList.contains('off'));
      const key = await page.evaluate(() => ({ picked: [...document.querySelectorAll('#key .routes span.picked')].map((e) => e.textContent), rows: document.querySelectorAll('#key .row.picked').length }));
      assert.deepEqual(key.picked, ['15L']);
      assert.equal(key.rows, 1);
      await page.screenshot({ path: path.join(OUT, `${theme}-groups.png`) });
    });
    await check('#141 separators are not spoken', async () => {
      await visit('#12/39.7542/-105.0018/rail/W');
      await page.waitForFunction(() => document.querySelector('#card.route'));
      await page.waitForTimeout(250);
      assert.doesNotMatch(await page.locator('#say').textContent(), /·/);
      assert.equal(await page.locator('#credit .sep[aria-hidden="true"]').count(), 2);
    });
    await check('#142 a tap on a rail letter names the line', async () => {
      await visit('#12/39.7542/-105.0018');
      const p = await page.evaluate(() => {
        const m = window.sheetsMap, c = m.getContainer();
        for (const f of m.queryRenderedFeatures({ layers: ['letter-2'] })) {
          if (f.properties.small) continue;
          const p = m.project(f.geometry.coordinates);
          if (p.x > 20 && p.x < c.clientWidth - 20 && p.y > 20 && p.y < c.clientHeight - 140) return [p.x, p.y];
        }
      });
      assert.ok(p); await page.touchscreen.tap(...p);
      const title = await page.locator('#card-title').textContent();
      assert.match(title, /\S+ Line/); assert.ok(!['Line', 'Lines'].includes(title));
    });
    await check('#147 station names keep their built places while panning', async () => {
      const snapshots = [];
      for (const zoom of [10, 12]) {
        await visit(`#${zoom}/39.71919/-105.00184`);
        const n = [10, 12, 14, 16].indexOf(zoom) + 1;
        const names = () => page.evaluate((sheet) => {
          const m = window.sheetsMap;
          return [...new Map(m.queryRenderedFeatures({ layers: [`name-${sheet}`] }).map((f) => [f.properties.nid, {
            text: f.properties.text, anchor: f.properties.anchor, offset: f.properties.offset, edge: f.properties.edge ?? null,
          }])).entries()];
        }, n);
        const before = new Map(await names());
        await page.evaluate(() => window.sheetsMap.panBy([100, 0], { duration: 0 }));
        await page.waitForFunction(() => window.sheetsMap.loaded() && !window.sheetsMap.isMoving());
        const after = new Map(await names());
        const common = [...before.keys()].filter((id) => after.has(id));
        assert.ok(common.length, `zoom ${zoom} has names in the common area`);
        for (const id of common) { assert.deepEqual(after.get(id), before.get(id)); assert.equal(after.get(id).edge, null); }
        snapshots.push({ zoom, compared: common.length });
      }
      return snapshots;
    });
    await check('#140 a landscape card leaves the tapped station visible', async () => {
      await page.setViewportSize({ width: 852, height: 393 });
      await visit('#12/39.7542/-105.0018');
      await page.evaluate(() => window.sheetsMap.resize());
      await page.waitForFunction(() => {
        const m = window.sheetsMap, p = m.project([-105.001838, 39.754193]);
        return !m.isMoving() && p.x > 10 && p.x < innerWidth - 10 && p.y > 10 && p.y < innerHeight - 10 && m.queryRenderedFeatures([[p.x - 9, p.y - 9], [p.x + 9, p.y + 9]], { layers: ['station-2', 'name-2'] }).some((f) => f.properties.name === 'Union Station');
      });
      const p = await page.evaluate(() => { const p = window.sheetsMap.project([-105.001838, 39.754193]); return [p.x, p.y]; });
      const hit = await page.evaluate(([x, y]) => ({ at: document.elementFromPoint(x, y)?.outerHTML.slice(0, 300), card: document.querySelector('#card').hidden, view: [innerWidth, innerHeight] }), p);
      await page.touchscreen.tap(...p);
      try { await page.locator('#card:not([hidden])').waitFor({ timeout: 5000 }); }
      catch (e) { await page.screenshot({ path: path.join(OUT, `${theme}-landscape-failed.png`) }); throw new Error(`${e.message}; ${JSON.stringify({ p, ...hit })}`); }
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => {
        const r = document.querySelector('#card').getBoundingClientRect(), p = window.sheetsMap.project([-105.001838, 39.754193]);
        return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
      }), false);
      await page.screenshot({ path: path.join(OUT, `${theme}-landscape.png`) });
    });
    await check('#148 number-only roads produce no null-name warnings', () => assert.deepEqual(warnings.filter((w) => /street-name|Expected first argument/.test(w)), []));
    await check('#145 every rail line is lettered on a wide opening view', async () => {
      await page.setViewportSize({ width: 1800, height: 1000 });
      await visit();
      const missing = await page.evaluate(() => {
        const m = window.sheetsMap;
        const rails = new Set(m.queryRenderedFeatures({ layers: ['rail-1'] }).map((f) => f.properties.route));
        const letters = new Set(m.queryRenderedFeatures({ layers: ['letter-1'] }).map((f) => f.properties.route));
        return [...rails].filter((r) => !letters.has(r));
      });
      assert.deepEqual(missing, []);
    });
    await check('no page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks pass`);
process.exitCode = failed.length ? 1 : 0;
