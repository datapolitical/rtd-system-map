// Which layer suppresses the "Denver" city label on the phone opening view?
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:8831/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });

const settle = () =>
  page.evaluate(
    () =>
      new Promise((r) => {
        const m = window.__map;
        let d = false;
        const t = setTimeout(() => { if (!d) r(); }, 3000);
        m.once('idle', () => { d = true; clearTimeout(t); r(); });
        m.triggerRepaint();
      }),
  );
const read = () =>
  page.evaluate(() => {
    const m = window.__map;
    const names = (id) => [...new Set(m.queryRenderedFeatures({ layers: [id] }).map((f) => String(f.properties.name ?? '')))].sort();
    const denver = m.querySourceFeatures('openmaptiles').filter((f) => f.properties.name === 'Denver' && f.properties.class === 'city');
    const p = denver[0] ? m.project(denver[0].geometry.coordinates ?? [0, 0]) : null;
    return { city: names('city-label'), denverSources: denver.length, at: p ? [Math.round(p.x), Math.round(p.y)] : null };
  });

const stable = async () => { await settle(); await page.waitForTimeout(700); return read(); };

console.log('baseline', JSON.stringify(await stable()));
for (const id of ['hub-signs', 'line-signs', 'bus-tags-region', 'highway-shield', 'town-label', 'village-label', 'airport-label']) {
  await page.evaluate((lid) => window.__map.setLayoutProperty(lid, 'visibility', 'none'), id);
  const r = await stable();
  console.log(`hidden ${id}`.padEnd(22), JSON.stringify(r));
  await page.evaluate((lid) => window.__map.setLayoutProperty(lid, 'visibility', 'visible'), id);
  await settle();
}
await browser.close();
