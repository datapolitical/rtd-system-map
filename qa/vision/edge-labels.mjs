// Project every rendered symbol label; flag anchors within N px of a viewport edge.
//   node qa/vision/edge-labels.mjs [w] [h] [zoom] [lng,lat] [margin]
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const [w = 390, h = 844, zoom = null, center = null, margin = 60] = process.argv.slice(2);
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

const rows = await page.evaluate((margin) => {
  const m = window.__map;
  const out = [];
  for (const l of m.getStyle().layers) {
    if (l.type !== 'symbol') continue;
    for (const f of m.queryRenderedFeatures({ layers: [l.id] })) {
      const c = f.geometry?.coordinates;
      if (!Array.isArray(c) || typeof c[0] !== 'number') continue;
      const p = m.project(c);
      const W = m.getCanvas().clientWidth;
      const H = m.getCanvas().clientHeight;
      const name = f.properties.name ?? f.properties.route ?? f.properties.ref ?? f.properties.label ?? '';
      if (p.x < margin || p.x > W - margin || p.y < margin || p.y > H - margin) out.push({ layer: l.id, name, x: Math.round(p.x), y: Math.round(p.y), W, H });
    }
  }
  return out;
}, Number(margin));
console.log(JSON.stringify(rows));
await browser.close();
