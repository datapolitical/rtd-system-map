// Loading-sketch regression (index.html, #sketch; scripts/sketch.mjs): while the map's data is held
// back, the opening view shows RTD's rail lines drawn in the page itself, in the theme's colours, and
// a link to another view shows none. Saves the sketch and the live map that replaces it.
// node qa/poster.mjs <site> [output]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://localhost:8788/';
const out = process.argv[3] ?? 'qa/.scratch/poster';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
const hex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
try {
  for (const theme of ['light', 'dark']) {
    for (const mode of ['opening', 'other-view']) {
      const page = await browser.newPage({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 1, colorScheme: theme, serviceWorkers: 'block' });
      let release;
      const gate = new Promise((done) => { release = done; });
      try {
        // Let the HTML and fonts finish, while withholding the map's first data.
        await page.route('**/data/meta.json', async (route) => { await gate; await route.continue(); });
        // A link to a view other than the opening one: the sketch is of the opening view only.
        await page.goto(mode === 'other-view' ? `${base}#12/39.6/-104.88` : base, { waitUntil: 'commit' });
        await page.waitForFunction(() => document.readyState !== 'loading' && document.querySelector('#poster'), null, { timeout: 30000 });
        const lines = await page.evaluate(() => [...document.querySelectorAll('#sketch path')].map((p) => {
          const s = getComputedStyle(p), g = getComputedStyle(p.parentElement);
          return { stroke: s.stroke, want: g.getPropertyValue(document.documentElement.dataset.theme === 'dark' ? '--d' : '--l').trim() };
        }));
        const shown = lines.length > 0;
        assert.equal(shown, mode === 'opening', `${theme}: ${mode}`);
        // Each line in the map's own colour for this theme (scripts/sketch.mjs, railInk).
        for (const { stroke, want } of lines) assert.equal(hex(stroke), want.toLowerCase(), `${theme}: a line's colour`);
        if (shown) {
          await page.addStyleTag({ content: '#steps,#credit,#card,#inview,#loading { visibility:hidden!important } #poster { transition:none!important } #sketch path { animation-play-state:paused!important }' });
          await page.screenshot({ path: `${out}/${theme}-sketch.png` });
          release();
          await page.waitForFunction(() => window.sheetsAll && window.sheetsMap.loaded() && !window.sheetsMap.isMoving(), null, { timeout: 60000 });
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${out}/${theme}-live.png` });
        }
        results.push({ theme, mode, shown, lines: lines.length, ok: true });
        console.log(`ok ${theme}: ${mode} (${lines.length} lines)`);
      } finally { release(); await page.close(); }
    }
  }
} finally { await browser.close(); await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); }
