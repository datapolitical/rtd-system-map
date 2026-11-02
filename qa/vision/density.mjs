// Station-dot crowding: how many pairs of station symbols are closer than a
// dot's own width at this view?
//   node qa/vision/density.mjs [zoom] [lng,lat] [w] [h]
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const [zoom = null, center = null, w = 390, h = 844] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
await page.goto('http://localhost:8831/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
if (center) {
  const [lng, lat] = center.split(',').map(Number);
  await page.evaluate(([x, y]) => window.__map.jumpTo({ center: [x, y] }), [lng, lat]);
}
if (zoom) await page.evaluate((z) => window.__map.jumpTo({ zoom: Number(z) }), zoom);
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const m = window.__map;
  const pts = m
    .queryRenderedFeatures({ layers: ['stations', 'stations-unserved'] })
    .map((f) => f.geometry?.coordinates)
    .filter((c) => Array.isArray(c) && typeof c[0] === 'number')
    .map((c) => m.project(c));
  let pairs12 = 0, pairs8 = 0, min = Infinity;
  let worst = null;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < min) { min = d; worst = [Math.round(pts[i].x), Math.round(pts[i].y), Math.round(pts[j].x), Math.round(pts[j].y)]; }
      if (d < 12) pairs12++;
      if (d < 8) pairs8++;
    }
  }
  return { stations: pts.length, pairsUnder12px: pairs12, pairsUnder8px: pairs8, minDistance: +min.toFixed(2), worstPair: worst, zoom: +m.getZoom().toFixed(3) };
});
console.log(JSON.stringify(out));
await browser.close();
