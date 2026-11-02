// Opening-view census restricted to the visible canvas.
//   node qa/vision/opening.mjs <w> <h> [zoom] [lng,lat]
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const [w = 390, h = 844, zoom = null, center = null] = process.argv.slice(2);
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
  const W = m.getCanvas().clientWidth;
  const H = m.getCanvas().clientHeight;
  const box = [[0, 0], [W, H]];
  const q = (id) => m.queryRenderedFeatures({ layers: [id], geometry: box });
  const layers = m.getStyle().layers.filter((l) => ['symbol', 'line', 'circle', 'fill'].includes(l.type)).map((l) => l.id);
  const counts = Object.fromEntries(layers.map((id) => [id, q(id).length]));
  const uniq = (f, k) => [...new Set(f.map((x) => String(x.properties[k] ?? '')).filter(Boolean))].sort();
  const busRoutes = [...new Set([...q('bus'), ...q('bus-part-time'), ...q('bus-limited')].map((f) => String(f.properties.route)))].sort();
  const named = [...new Set([...q('bus-tags-region'), ...q('bus-numbers'), ...q('bus-tags')].map((f) => String(f.properties.route)))].sort();
  const corridors = q('corridors');
  return {
    zoom: +m.getZoom().toFixed(3),
    counts,
    busRoutes: busRoutes.length,
    busNamed: named.length,
    busUnnamed: busRoutes.filter((r) => !named.includes(r)),
    corridorFeatures: corridors.length,
    corridorLabels: q('corridor-labels').length,
    corridorTiers: corridors.reduce((a, f) => ((a[f.properties.tier] = (a[f.properties.tier] || 0) + 1), a), {}),
    railRoutes: [...new Set([...q('rail'), ...q('rail-part-time')].map((f) => String(f.properties.route)))].sort(),
    cityNames: uniq(q('city-label'), 'name'),
    townNames: uniq(q('town-label'), 'name'),
    signNames: uniq(q('line-signs'), 'name'),
    hubNames: uniq(q('hub-signs'), 'name'),
    stationCount: q('stations').length + q('stations-unserved').length,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
