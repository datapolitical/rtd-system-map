// Capture focused/unfocused pairs for each control; pixel diff is computed by
// qa/vision/focus-diff.py (PIL + numpy).
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const OUT = '/home/chris/.hermes/cache/scratch/qa-vision';
const browser = await chromium.launch();

async function pair(page, name, sel, clip) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/fp-${name}-a.png`, clip });
  const el = await page.$(sel);
  if (!el) return console.log(name, 'not found');
  await el.focus();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/fp-${name}-b.png`, clip });
  console.log(name, sel, JSON.stringify(clip));
}

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto('http://localhost:8831/', { waitUntil: 'load' });
await phone.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
await phone.waitForTimeout(1200);

await pair(phone, 'canvas', '.maplibregl-canvas', { x: 0, y: 0, width: 390, height: 844 });
for (const [sel, nm] of [
  ['button.maplibregl-ctrl-geolocate', 'geolocate'],
  ['button.maplibregl-ctrl-zoom-in', 'zoomin'],
  ['button.maplibregl-ctrl-zoom-out', 'zoomout'],
]) {
  const box = await (await phone.$(sel)).boundingBox();
  const clip = { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 };
  await pair(phone, nm, sel, clip);
}

const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await desk.goto('http://localhost:8831/', { waitUntil: 'load' });
await desk.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
await desk.waitForTimeout(1200);
const sel = 'button.maplibregl-ctrl-zoom-in';
const box = await (await desk.$(sel)).boundingBox();
await pair(desk, 'deskzoom', sel, { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 });
await browser.close();
