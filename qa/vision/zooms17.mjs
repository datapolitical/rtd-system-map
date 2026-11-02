// Zoom 17 over Civic Center: what exists at a dense stop location, and does
// the keyboard actually operate the Key?
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const OUT = '/home/chris/.hermes/cache/scratch/qa-vision';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8831/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });

// Keyboard: focus Key and toggle with Enter.
await page.evaluate(() => document.querySelector('#legend > summary').focus());
const before = await page.evaluate(() => document.getElementById('legend').open);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const afterEnter = await page.evaluate(() => document.getElementById('legend').open);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const afterSecond = await page.evaluate(() => document.getElementById('legend').open);

// Zoom 17 on Civic Center.
await page.evaluate(() => window.__map.jumpTo({ center: [-104.9903, 39.7392], zoom: 17 }));
await page.waitForTimeout(3000);
const at17 = await page.evaluate(() => {
  const m = window.__map;
  const layers = m.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);
  const counts = Object.fromEntries(layers.map((id) => [id, m.queryRenderedFeatures({ layers: [id] }).length]));
  const stops = m.queryRenderedFeatures({ layers: ['stops'] });
  const anyText = m.getStyle().layers.filter((l) => l.type === 'symbol' && JSON.stringify(l.layout?.['text-field'] ?? '').includes('stops'));
  return { zoom: m.getZoom(), counts, stopCount: stops.length, textLayersOnStopsSource: anyText.length, sampleStops: stops.slice(0, 5).map((f) => f.properties.name ?? f.properties.stopName ?? Object.keys(f.properties)) };
});
await page.screenshot({ path: `${OUT}/phone-17-stops.png` });
console.log(JSON.stringify({ keyboard: { before, afterEnter, afterSecond }, at17 }, null, 1));
await browser.close();
