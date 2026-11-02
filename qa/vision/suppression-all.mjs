// Does hiding every other label layer let all 21 frequent-route numbers place?
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
        let done = false;
        const t = setTimeout(() => {
          if (!done) r();
        }, 3000);
        m.once('idle', () => {
          done = true;
          clearTimeout(t);
          r();
        });
        m.triggerRepaint();
      }),
  );

const read = () =>
  page.evaluate(() => {
    const m = window.__map;
    const get = (ids) => [...new Set(m.queryRenderedFeatures({ layers: ids }).map((f) => String(f.properties.route ?? f.properties.name ?? '')))].sort();
    return { bus: get(['bus-tags-region']), hub: get(['hub-signs']), city: get(['city-label']), signs: get(['line-signs']) };
  });

const stable = async () => {
  await settle();
  await page.waitForTimeout(700);
  let a = await read();
  await page.waitForTimeout(600);
  let b = await read();
  return { a, b, same: JSON.stringify(a) === JSON.stringify(b) };
};

const others = ['city-label', 'town-label', 'village-label', 'highway-shield', 'line-signs', 'hub-signs', 'station-labels', 'rail-bullets', 'corridor-labels', 'bus-numbers', 'bus-tags', 'airport-label', 'landmark-label', 'neighborhood-label'];
console.log('baseline', JSON.stringify(await stable()));
await page.evaluate((ids) => { for (const id of ids) window.__map.setLayoutProperty(id, 'visibility', 'none'); }, others);
console.log('others hidden', JSON.stringify(await stable()));
await page.evaluate((ids) => { for (const id of ids) window.__map.setLayoutProperty(id, 'visibility', 'visible'); }, others);
console.log('restored', JSON.stringify(await stable()));
await browser.close();
