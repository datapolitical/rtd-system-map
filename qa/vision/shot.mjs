// Screenshot + state probe for QA. Usage:
//   node qa/vision/shot.mjs <width> <height> <out.png> [zoom] [base]
// Uses the instrumented copy (window.__map) served on 8831.
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const [w, h, out, zoom, base = 'http://localhost:8831/'] = process.argv.slice(2);
const dpr = Number(process.env.DPR ?? (Number(w) <= 500 ? 2 : 1));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: dpr });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text().slice(0, 200)}`));
page.on('requestfailed', (r) => errors.push(`requestfailed ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
await page.waitForTimeout(1200);
if (process.env.CENTER) {
  const [lng, lat] = process.env.CENTER.split(',').map(Number);
  await page.evaluate(([x, y]) => window.__map.jumpTo({ center: [x, y] }), [lng, lat]);
  await page.waitForTimeout(600);
}
if (zoom) {
  await page.evaluate((z) => window.__map.jumpTo({ zoom: Number(z) }), zoom);
  await page.waitForFunction(() => window.__map.isStyleLoaded() && !window.__map.isMoving(), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
}
const state = await page.evaluate(() => {
  const m = window.__map;
  const c = m.getCenter();
  const layers = m.getStyle().layers.map((l) => l.id);
  const counts = {};
  for (const id of ['bus', 'bus-part-time', 'bus-limited', 'corridors', 'rail', 'rail-part-time', 'stations', 'stations-unserved', 'stops', 'facilities']) {
    try { counts[id] = m.queryRenderedFeatures({ layers: [id] }).length; } catch { counts[id] = null; }
  }
  return { zoom: +m.getZoom().toFixed(3), center: [+c.lat.toFixed(4), +c.lng.toFixed(4)], canvas: [m.getCanvas().width, m.getCanvas().height], layers: layers.length, counts };
});
await page.screenshot({ path: out });
console.log(JSON.stringify({ state, errors: errors.slice(0, 8), errorCount: errors.length, out }, null, 0));
await browser.close();
