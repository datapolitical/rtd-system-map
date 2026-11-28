import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const [html, loadlog] = await Promise.all([
  readFile(new URL('../../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../public/js/loadlog.js', import.meta.url), 'utf8'),
]);
const iphone = (os) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1`;
const update = 'This map needs iOS 16.4 or later. Update your device, or open the map on a newer one.';

// Serve the page under test with a stand-in module graph. The real map's built
// data is unnecessary for exercising the loader and a dependency's parse error.
async function serve(page, userAgent, entry, vendor = 'export {};') {
  await page.addInitScript((ua) => {
    Object.defineProperty(navigator, 'userAgent', { value: ua });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
  }, userAgent);
  await page.route('**/*', (route) => {
    switch (new URL(route.request().url()).pathname) {
      case '/': return route.fulfill({ contentType: 'text/html', body: html });
      case '/js/sheets/main.js': return route.fulfill({ contentType: 'text/javascript', body: entry });
      case '/js/loadlog.js': return route.fulfill({ contentType: 'text/javascript', body: loadlog });
      case '/vendor/maplibre-gl.mjs': return route.fulfill({ contentType: 'text/javascript', body: vendor });
      default: return route.fulfill({ status: 404 });
    }
  });
  await page.goto('/');
}

for (const [device, ua] of [
  ['iPhone on iOS 15', iphone('15_8_4')],
  ['iPhone on iOS 16.3', iphone('16_3')],
  ['iPad requesting desktop sites', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/16.3 Safari/605.1.15'],
]) {
  test(`a dependency parse error tells an ${device} rider how to open the map`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await serve(page, ua, "import '/vendor/maplibre-gl.mjs';", 'class {');
    const status = page.locator('#loading[role="status"]');
    await expect(status).toHaveText(update);
    await expect(status).toHaveCSS('white-space', 'normal');
    const box = await status.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.x + box.width).toBeLessThanOrEqual(308);
    await expect(page.locator('#sketch')).toBeHidden();
  });
}

test('a startup error on iOS 16.4 asks the rider to reload', async ({ page }) => {
  await serve(page, iphone('16_4'), 'throw new Error("Could not start");');
  await expect(page.locator('#loading')).toHaveText('The map couldn’t load. Reload the page to try again.');
});

test('a successful import leaves the loading status to the map', async ({ page }) => {
  await serve(page, iphone('16_4'), 'window.sheetsMap = {};');
  await page.waitForFunction(() => Boolean(window.sheetsMap));
  await expect(page.locator('#loading')).toHaveText('Loading…');
  await expect(page.locator('#sketch')).toBeVisible();
});
