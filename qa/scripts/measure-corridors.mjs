// What the corridor layer actually puts on screen, at the zooms that matter.
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:8902';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 60000 });
await page.waitForFunction(() => !!window.__map, null, { timeout: 60000 });

const opening = await page.evaluate(() => window.__map.getZoom());
console.log('opening zoom', opening.toFixed(2));

for (const zoom of [8.75, 11, 11.5, 12, 12.5, 13, 13.5]) {
  await page.evaluate((z) => new Promise((resolve) => {
    const map = window.__map;
    map.jumpTo({ zoom: z });
    map.once('idle', resolve);
  }), zoom);
  const row = await page.evaluate(() => {
    const map = window.__map;
    const lines = map.queryRenderedFeatures({ layers: ['corridors'] });
    const labels = map.queryRenderedFeatures({ layers: ['corridor-labels'] });
    return {
      lines: lines.length,
      labels: labels.length,
      texts: [...new Set(labels.map((l) => l.properties.label))].slice(0, 6),
      colfax: labels.some((l) => l.properties.label === '10 15'),
    };
  });
  console.log(`zoom ${String(zoom).padEnd(5)} corridors ${String(row.lines).padStart(3)}  labels ${String(row.labels).padStart(3)}  colfax ${row.colfax}  ${row.texts.join(' / ')}`);
}
console.log('console errors', errors.length);
await browser.close();
