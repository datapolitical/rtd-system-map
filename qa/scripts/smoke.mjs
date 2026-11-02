// Cheap smoke: does the page still load clean after a data rebuild?
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';
const BASE = process.env.BASE ?? 'http://localhost:8820';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('requestfailed', (r) => errors.push(`request failed ${r.url()}`));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 60000 });
const corridors = await page.evaluate(async () => (await (await fetch('data/corridors.geojson')).json()).features.length);
console.log('corridors served', corridors, 'errors', errors.length, errors.slice(0, 3));
await browser.close();
