// Which layer suppresses a label? At the phone opening view, hide candidate
// layers one at a time and count the labels that reappear.
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:8831/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
await page.waitForTimeout(1200);

const candidates = ['city-label', 'highway-shield', 'line-signs', 'hub-signs', 'bus-tags-region', 'town-label', 'airport-label'];
const read = () =>
  page.evaluate(() => {
    const m = window.__map;
    const get = (ids) => [...new Set(m.queryRenderedFeatures({ layers: ids }).map((f) => String(f.properties.route ?? f.properties.name ?? '')))].sort();
    return {
      zoom: +m.getZoom().toFixed(3),
      bus: get(['bus-tags-region']),
      signs: get(['line-signs']),
      hub: get(['hub-signs']),
    };
  });

console.log('baseline', JSON.stringify(await read()));
for (const id of candidates) {
  await page.evaluate((lid) => window.__map.setLayoutProperty(lid, 'visibility', 'none'), id);
  await page.waitForTimeout(500);
  const r = await read();
  console.log(`hidden ${id}`.padEnd(24), JSON.stringify(r));
  await page.evaluate((lid) => window.__map.setLayoutProperty(lid, 'visibility', 'visible'), id);
  await page.waitForTimeout(350);
}
await browser.close();
