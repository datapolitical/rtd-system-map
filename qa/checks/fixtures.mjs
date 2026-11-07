// Shared fixture for the checks: a page with the map exposed as window.__map.
//
//   test('...', async ({ mapPage }) => {
//     await mapPage.goto({ zoom: 10, lat: 39.74, lon: -104.99 }, { live: false });
//     await mapPage.page.evaluate(() => window.__map.getZoom());
//   });
//
// main.js is fetched through a route that adds `window.__map=map;` just
// before `loadWhenNeeded(map);`. The project (phone-light or phone-dark)
// decides the theme; `mapPage.theme` says which.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readData = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', name), 'utf8'));

// WCAG relative luminance and contrast for [r,g,b] (0 to 255) or '#rrggbb'.
const rgbOf = (c) => (typeof c === 'string' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c);
const lum = (c) => {
  const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgbOf(c);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Pixels of a PNG buffer: { w, h, d (RGBA), at([x, y]) -> [r, g, b] | null }.
export async function pixels(buf) {
  const img = await loadImage(buf);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const at = ([x, y]) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
    const i = (y * img.width + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  return { w: img.width, h: img.height, d, at };
}

export const test = base.extend({
  mapPage: async ({ page, baseURL }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/js/main.js', async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace('loadWhenNeeded(map);', 'window.__map=map;loadWhenNeeded(map);');
      await route.fulfill({ response: res, body });
    });
    let live = false;
    const idle = async (settle = 2500) => {
      await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 90_000 });
      await page.waitForTimeout(settle);
      await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 60_000 }).catch(() => {});
    };
    const mapPage = {
      page,
      errors,
      theme: testInfo.project.name.endsWith('dark') ? 'dark' : 'light',
      idle,
      // A fresh load at #zoom/lat/lon; Live is off unless asked for.
      async goto({ zoom, lat, lon }, { live: on = false, settle = 2500 } = {}) {
        live = on;
        const up = await fetch(new URL('/js/main.js', baseURL)).then((r) => r.ok, () => false);
        if (!up) throw new Error(`No dev server at ${baseURL}. Run \`npm run dev\` first (and \`npm run dev:live\` for the Live checks).`);
        await page.goto('about:blank');
        await page.addInitScript((v) => localStorage.setItem('live', v ? 'on' : 'off'), live);
        await page.goto(`/#${zoom}/${lat}/${lon}`, { waitUntil: 'domcontentloaded' });
        await idle(settle);
      },
      // The part of the screen not covered by panels, from the page's own code.
      uncovered: () => page.evaluate(async () => (await import('/js/edgeletters.js')).uncovered(window.__map)),
      // A screenshot of the page as pixels you can sample.
      async capture(name) {
        const buf = await page.screenshot();
        if (name) await testInfo.attach(name, { body: buf, contentType: 'image/png' });
        return { buf, px: await pixels(buf), dpr: await page.evaluate(() => devicePixelRatio) };
      },
    };
    await use(mapPage);
    expect(errors, 'page errors').toEqual([]);
  },
});
export { expect };
