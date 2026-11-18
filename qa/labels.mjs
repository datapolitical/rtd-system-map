// Compare label pixels in the common world area after a 100 px horizontal pan.
// Geometry and controls are hidden only in these diagnostic captures. A label
// that flips, changes text, disappears or moves produces different pixels.
// node qa/labels.mjs <site> [output]; THEME / ZOOM narrow a fault-reproduction run.
import { chromium } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { SHEETS } from '../public/js/sheets/style.js';

const base = process.argv[2] ?? 'http://localhost:8788/';
const out = process.argv[3] ?? 'qa/.scratch/labels';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
const themes = process.env.THEME ? [process.env.THEME] : ['light', 'dark'];
const zooms = process.env.ZOOM ? [+process.env.ZOOM] : SHEETS.map((x) => x.zoom);
async function pixels(buffer) {
  const image = await loadImage(buffer), canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas.getContext('2d').getImageData(0, 0, image.width, image.height).data;
}
try {
  for (const theme of themes) {
    const page = await browser.newPage({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 1, colorScheme: theme, serviceWorkers: 'block' });
    await page.goto(base);
    await page.waitForFunction(() => window.sheetsAll && window.sheetsMap.isStyleLoaded(), null, { timeout: 60000 });
    const opening = await page.evaluate(() => window.sheetsMap.getCenter().toArray());
    const { hub } = await (await page.request.get(new URL('/data/sheets.json', base).href)).json();
    await page.addStyleTag({ content: '#poster,#steps,#credit,#card,#inview,#loading { display:none!important }' });
    for (const zoom of zooms) {
      await page.evaluate(({ zoom, center }) => {
        const map = window.sheetsMap;
        map.jumpTo({ center, zoom });
        for (const layer of map.getStyle().layers) {
          if (!['symbol', 'background'].includes(layer.type)) map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }, { zoom, center: zoom <= 10 ? opening : hub });
      await page.waitForFunction(() => window.sheetsMap.loaded() && !window.sheetsMap.isMoving(), null, { timeout: 60000 });
      await page.waitForTimeout(400);
      const before = await page.screenshot({ path: `${out}/${theme}-${zoom}-before.png` });
      await page.evaluate(() => window.sheetsMap.panBy([100, 0], { duration: 0 }));
      await page.waitForFunction(() => window.sheetsMap.loaded() && !window.sheetsMap.isMoving(), null, { timeout: 60000 });
      await page.waitForTimeout(400);
      const after = await page.screenshot({ path: `${out}/${theme}-${zoom}-after.png` });
      const a = await pixels(before), b = await pixels(after);
      let changed = 0, left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      // Compare only the shared world area, leaving 20 px for antialiasing at its
      // edges. A 60/255 colour difference excludes faint compression/edge noise.
      for (let y = 20; y < 740; y++) for (let x = 20; x < 273; x++) {
        const i = (y * 393 + x) * 4, j = (y * 393 + x + 100) * 4;
        if (Math.max(...[0, 1, 2].map((c) => Math.abs(b[i + c] - a[j + c]))) <= 60) continue;
        changed++;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      const row = { theme, zoom, changed, box: changed ? [left, top, right, bottom] : null };
      results.push(row);
      console.log(row);
      await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
    }
    await page.close();
  }
} finally { await browser.close(); }
if (results.some((row) => row.changed)) process.exitCode = 1;
