// The deployed application, including the links and interactions that must survive Classic's retirement.
import { test, expect } from './sheets-fixture.mjs';

test('the current map loads without requesting the Classic application', async ({ sheetPage }) => {
  const asked = [];
  sheetPage.page.on('request', (request) => asked.push(new URL(request.url()).pathname));
  await sheetPage.goto();
  await expect(sheetPage.page.locator('#theme-toggle')).toBeEnabled();
  expect(asked).toContain('/js/sheets/main.js');
  expect(asked.filter((path) => /^\/(?:classic(?:\/|$)|qa\/|css\/app\.css|js\/(?:main|network|select|legend)\.js)/.test(path))).toEqual([]);
});

test('a selected route survives theme changes and reload; Escape clears it', async ({ sheetPage }) => {
  const { page } = sheetPage;
  const metaResponse = await page.request.get('/data/meta.json');
  expect(metaResponse.ok()).toBe(true);
  const meta = await metaResponse.json();
  const sheetResponse = await page.request.get('/data/sheets.json');
  expect(sheetResponse.ok()).toBe(true);
  const { hub } = await sheetResponse.json();
  const route = meta.rail[0].route;
  await sheetPage.goto(`#12/${hub[1]}/${hub[0]}/rail/${encodeURIComponent(route)}`);
  await page.waitForFunction((value) => window.sheetsPick?.route === value, route);
  await expect(page.locator('#card')).toBeVisible();
  await page.locator('#theme-toggle').click();
  await sheetPage.settled();
  expect(await page.evaluate(() => window.sheetsPick?.route)).toBe(route);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sheetPage.settled();
  expect(await page.evaluate(() => window.sheetsPick?.route)).toBe(route);
  await page.keyboard.press('Escape');
  await expect(page.locator('#card')).toBeHidden();
  expect(await page.evaluate(() => window.sheetsPick)).toBeNull();
});

test('an old Classic link redirects to the current map and keeps its view', async ({ sheetPage }) => {
  const { page } = sheetPage;
  const response = await page.request.get('/data/sheets.json');
  expect(response.ok()).toBe(true);
  const { hub } = await response.json();
  const hash = `#12/${hub[1]}/${hub[0]}`;
  await page.goto(`/classic/${hash}`, { waitUntil: 'domcontentloaded' });
  await sheetPage.settled();
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).hash.split('/')[0]).toBe('#12');
  const center = await page.evaluate(() => window.sheetsMap.getCenter().toArray());
  expect(center[0]).toBeCloseTo(hub[0], 3);
  expect(center[1]).toBeCloseTo(hub[1], 3);
});
