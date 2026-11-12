// Capture a phone view of a deployed build, for pinning a fault a person saw
// to a place on the ground (qa/recall/README.md, finds.json).
//
//   node qa/recall/capture.mjs --url <site> --view <zoom>/<lat>/<lon> --theme dark|light --out <file.png> [--grid]
//
// Writes the PNG (CSS px at device scale 2) and <file>.json with the view as
// the map settled: zoom, centre, canvas size. `--grid` draws a labelled grid
// every 50 CSS px over the map, so a point read off the picture can be turned
// into lon/lat with `node qa/recall/capture.mjs --at <file>.json x,y ...`.
import fs from 'node:fs';
import path from 'node:path';
import { toLonLat, toWorld } from '../drawn/mercator.mjs';
import { stubAnalytics } from '../lib/analytics.mjs';

const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : null;
};

// Turn picture points into lon/lat for a capture already made.
if (arg('at')) {
  const view = JSON.parse(fs.readFileSync(arg('at'), 'utf8'));
  const points = process.argv.slice(process.argv.indexOf('--at') + 2);
  const c = toWorld([view.lon, view.lat], view.zoom);
  for (const p of points) {
    const [x, y] = p.split(',').map(Number);
    const [lon, lat] = toLonLat([c[0] + x - view.width / 2, c[1] + y - view.height / 2], view.zoom);
    console.log(`${p} -> ${lat.toFixed(6)},${lon.toFixed(6)}`);
  }
  process.exit(0);
}

const url = arg('url')?.replace(/\/$/, '');
const [zoom, lat, lon] = (arg('view') ?? '').split('/').map(Number);
const theme = arg('theme') ?? 'dark';
const out = arg('out');
if (!url || !Number.isFinite(zoom) || !out) {
  console.error('usage: node qa/recall/capture.mjs --url <site> --view z/lat/lon --theme dark|light --out file.png [--grid]');
  process.exit(2);
}
const { chromium } = await import('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  // The phone size the evaluator and the checks use.
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  await stubAnalytics(page);
  await page.route('**/js/main.js', async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('loadWhenNeeded(map);', 'window.__map=map;loadWhenNeeded(map);');
    await route.fulfill({ response: res, body });
  });
  await page.addInitScript(() => { try { localStorage.setItem('live', 'off'); } catch {} });
  await page.goto(`${url}/#${zoom}/${lat}/${lon}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 90_000 });
  for (let i = 0; i < 4; i++) {
    const busy = await page.evaluate(() => new Promise((r) => {
      const t = setTimeout(() => r(true), 3000);
      window.__map.once('idle', () => { clearTimeout(t); r(false); });
    }));
    if (!busy) break;
  }
  await page.waitForTimeout(1500);
  const view = await page.evaluate(() => {
    const m = window.__map, c = m.getCenter(), r = m.getCanvas().getBoundingClientRect();
    return { zoom: m.getZoom(), lat: c.lat, lon: c.lng, width: r.width, height: r.height, left: r.left, top: r.top, bearing: m.getBearing(), pitch: m.getPitch() };
  });
  if (arg('grid') !== null && process.argv.includes('--grid')) {
    await page.evaluate((v) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('width', v.width); s.setAttribute('height', v.height);
      s.style.cssText = `position:fixed;left:${v.left}px;top:${v.top}px;pointer-events:none;z-index:99999`;
      let g = '';
      for (let x = 0; x <= v.width; x += 50) g += `<line x1="${x}" y1="0" x2="${x}" y2="${v.height}" stroke="#f0f" stroke-opacity="${x % 100 ? 0.25 : 0.55}" stroke-width="0.5"/>` + (x % 100 ? '' : `<text x="${x + 2}" y="10" font-size="9" fill="#f0f">${x}</text>`);
      for (let y = 0; y <= v.height; y += 50) g += `<line x1="0" y1="${y}" x2="${v.width}" y2="${y}" stroke="#f0f" stroke-opacity="${y % 100 ? 0.25 : 0.55}" stroke-width="0.5"/>` + (y % 100 ? '' : `<text x="2" y="${y - 2}" font-size="9" fill="#f0f">${y}</text>`);
      s.innerHTML = g;
      document.body.appendChild(s);
    }, view);
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out });
  fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify({ url, theme, requested: { zoom, lat, lon }, ...view }, null, 2));
  console.log(`${out}: z${view.zoom.toFixed(2)} ${view.lat.toFixed(5)},${view.lon.toFixed(5)} canvas ${view.width}x${view.height} at ${view.left},${view.top}`);
} finally {
  await browser.close();
}
