// The design review's fixed views (DESIGN.md, "Design review rubric"), both
// themes, on one contact sheet, so a builder or reviewer reads GitHub's
// captures instead of taking their own.
//
//   CHECK_URL=https://... node qa/checks/review-captures.mjs [--out qa/review]
//
// The five views: the metro at 10.5 over downtown, the west side at 10.7, the
// south at 10.2, downtown over the hub at 12.5 and 14.5. Which station is the
// hub, and which are the west and south of the network, is read from the
// site's own stations.geojson at run time; nothing about RTD's network is
// written here. Captures are iPhone 14, Chromium with software GL, Live off.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { stubAnalytics } from '../lib/analytics.mjs';

const BASE = (process.env.CHECK_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
const outIndex = process.argv.indexOf('--out');
const OUT = outIndex >= 0 ? process.argv[outIndex + 1] : 'qa/review';

const stations = await (await fetch(`${BASE}/data/stations.geojson`)).json();
const served = stations.features.filter((f) => f.properties.served);
if (!served.length) throw new Error('stations.geojson has no served stations');
const lines = (f) => (f.properties.lines || '').split(' ').filter(Boolean).length;
const hub = served.reduce((a, b) => (lines(b) > lines(a) ? b : a));
const west = served.reduce((a, b) => (b.geometry.coordinates[0] < a.geometry.coordinates[0] ? b : a));
const south = served.reduce((a, b) => (b.geometry.coordinates[1] < a.geometry.coordinates[1] ? b : a));
const centre = (f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });

const views = [
  { name: 'metro', zoom: 10.5, ...centre(hub), about: 'downtown' },
  { name: 'west', zoom: 10.7, ...centre(west), about: 'west side' },
  { name: 'south', zoom: 10.2, ...centre(south), about: 'south' },
  { name: 'hub-12.5', zoom: 12.5, ...centre(hub), about: 'the hub' },
  { name: 'hub-14.5', zoom: 14.5, ...centre(hub), about: 'the hub' },
];

fs.mkdirSync(OUT, { recursive: true });
const { defaultBrowserType, ...phone } = devices['iPhone 14'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shots = [];
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ ...phone, colorScheme: theme });
    const page = await context.newPage();
    await stubAnalytics(page);
    await page.route('**/js/main.js', async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace('loadWhenNeeded(map);', 'window.__map=map;loadWhenNeeded(map);');
      await route.fulfill({ response: res, body });
    });
    await page.addInitScript(() => { try { localStorage.setItem('live', 'off'); } catch {} });
    for (const v of views) {
      await page.goto(`${BASE}/#${v.zoom}/${v.lat}/${v.lon}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 90_000 });
      await page.waitForTimeout(2500);
      const buf = await page.screenshot();
      const file = `${theme}-${v.name}.png`;
      fs.writeFileSync(path.join(OUT, file), buf);
      shots.push({ theme, view: v.name, about: v.about, zoom: v.zoom, lat: v.lat, lon: v.lon, file });
      console.log(`${theme} ${v.name} (z${v.zoom}) at ${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

// One sheet: five views across, one theme per row.
const cellW = 195, cellH = 332, gap = 10, pad = 16, caption = 20, title = 26;
const width = pad * 2 + views.length * cellW + (views.length - 1) * gap;
const height = pad + title + 6 + 2 * (cellH + caption + gap);
const canvas = createCanvas(width, height);
const g = canvas.getContext('2d');
g.fillStyle = '#ffffff';
g.fillRect(0, 0, width, height);
g.fillStyle = '#111111';
g.font = 'bold 18px sans-serif';
g.fillText('Design review: fixed views, light and dark (iPhone 14, software GL)', pad, pad + 18);
for (const [row, theme] of ['light', 'dark'].entries()) {
  const y = pad + title + 6 + row * (cellH + caption + gap);
  for (const [col, v] of views.entries()) {
    const x = pad + col * (cellW + gap);
    const img = await loadImage(fs.readFileSync(path.join(OUT, `${theme}-${v.name}.png`)));
    g.drawImage(img, x, y, cellW, cellH);
    g.strokeStyle = '#cccccc';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
    g.fillStyle = '#333333';
    g.font = '12px sans-serif';
    g.fillText(`${theme} · ${v.name} · ${v.about} · z${v.zoom}`, x, y + cellH + 14);
  }
}
fs.writeFileSync(path.join(OUT, 'design-review.png'), canvas.toBuffer('image/png'));
fs.writeFileSync(path.join(OUT, 'views.json'), JSON.stringify(shots, null, 1));
console.log(`contact sheet: ${path.join(OUT, 'design-review.png')} (${width}x${height})`);
