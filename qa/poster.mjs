// Loading-picture regression: the captured drawing must match, and a stale drawing must never
// be shown. (The basemap is the site's own, and the publish check holds the picture to it.) Save the matching picture and the live handoff.
// node qa/poster.mjs <site> [output]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://localhost:8788/';
const out = process.argv[3] ?? 'qa/.scratch/poster';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const theme of ['light', 'dark']) {
    for (const mode of ['matching', 'old-drawing']) {
      const page = await browser.newPage({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 1, colorScheme: theme, serviceWorkers: 'block' });
      let release;
      const gate = new Promise((done) => { release = done; });
      try {
        // Let the HTML and fonts finish, while withholding the map's first data.
        await page.route('**/data/meta.json', async (route) => { await gate; await route.continue(); });
        if (mode === 'old-drawing') await page.route('**/data/sheets.json', async (route) => {
          const response = await route.fetch(), json = await response.json();
          await route.fulfill({ response, json: { ...json, drawing: 'different-drawing' } });
        });
        await page.goto(base, { waitUntil: 'commit' });
        await page.waitForFunction(() => {
          const img = document.querySelector('#poster img');
          return document.readyState !== 'loading' && document.querySelector('#poster') && (!img || img.classList.contains('whole'));
        }, null, { timeout: 30000 });
        const shown = await page.locator('#poster img.whole').count() === 1;
        assert.equal(shown, mode === 'matching', `${theme}: ${mode}`);
        if (shown) {
          await page.addStyleTag({ content: '#steps,#credit,#card,#inview,#loading { visibility:hidden!important } #poster,#poster img { transition:none!important }' });
          await page.screenshot({ path: `${out}/${theme}-picture.png` });
          release();
          await page.waitForFunction(() => window.sheetsAll && window.sheetsMap.loaded() && !window.sheetsMap.isMoving(), null, { timeout: 60000 });
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${out}/${theme}-live.png` });
        }
        results.push({ theme, mode, shown, ok: true });
        console.log(`ok ${theme}: ${mode}`);
      } finally { release(); await page.close(); }
    }
  }
} finally { await browser.close(); await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); }
