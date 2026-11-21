// The nightly watchdog checks the current sheet map, in both themes at every built scale.
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { SHEETS } from '../../public/js/sheets/style.js';
import { test, expect } from './sheets-fixture.mjs';

test('the sheet map has no page, console, request or style errors', async ({ sheetPage }, testInfo) => {
  test.setTimeout(240_000);
  const { page } = sheetPage;
  const response = await page.request.get('/data/sheets.json');
  expect(response.ok()).toBe(true);
  const { hub } = await response.json();
  await sheetPage.goto();
  for (const sheet of SHEETS) {
    await page.evaluate(({ zoom, hub }) => { location.hash = `#${zoom}/${hub[1]}/${hub[0]}`; }, { zoom: sheet.zoom, hub });
    await expect(page.locator('#sheets')).toHaveAttribute('aria-label', `Sheet ${SHEETS.indexOf(sheet) + 1} of ${SHEETS.length}`);
    await sheetPage.settled();
  }
  const style = await page.evaluate(() => window.sheetsMap.getStyle());
  await sheetPage.flushConsole();
  const report = {
    page: sheetPage.errors,
    console: sheetPage.consoleLog,
    requests: sheetPage.failed,
    style: validateStyleMin(style).map((error) => error.message),
    preloadTiming: sheetPage.preloadTiming,
    zooms: SHEETS.map((sheet) => sheet.zoom),
  };
  await testInfo.attach('health', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  for (const key of ['page', 'console', 'requests', 'style']) expect.soft(report[key], key).toEqual([]);
});
