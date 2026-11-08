// Page health: what the browser says while the map loads and moves. A
// warning in the console (MapLibre reports a bad style value, a missing
// image or a failed tile there), a page error, a request that fails or
// answers 4xx/5xx, or a style that doesn't validate against MapLibre's
// style spec (validateStyleMin from @maplibre/maplibre-gl-style-spec, on
// map.getStyle() once loaded) all fail.
//
// The views: the busiest station at 9, 10.5, 12 and 14, then a panel
// opened from the Lines button and closed. Live stays off, so the relay is
// not needed; a run with Live on is live.spec.mjs's. The detector fires on
// a style property set to a value of the wrong type (the second test).
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { test, expect, siteData } from './fixtures.mjs';

const hubOf = async () => {
  const stations = await siteData('stations.geojson');
  const count = (f) => (f.properties.lines || '').split(' ').length;
  return stations.features.filter((f) => f.properties.served).reduce((a, b) => (count(b) > count(a) ? b : a)).geometry.coordinates;
};
// Chromium's software GL logs its own performance notes ("GL Driver Message
// ... GPU stall due to ReadPixels") when anything reads pixels back; they
// come from the test's renderer, not the site.
const driver = (m) => /GL Driver Message/.test(m.text);
const noisy = (m) => (m.type === 'error' || m.type === 'warning') && !driver(m);
const styleErrors = (style) => validateStyleMin(style).map((e) => e.message);

test('no console errors or warnings, failed requests or style errors at 9 to 14', async ({ mapPage }, testInfo) => {
  test.setTimeout(240_000);
  const [lon, lat] = await hubOf();
  const { page } = mapPage;
  await mapPage.goto({ zoom: 9, lat, lon });
  for (const zoom of [10.5, 12, 14]) await mapPage.jump({ zoom, lat, lon });
  const style = await page.evaluate(() => window.__map.getStyle());
  await page.click('#lines-button');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const out = {
    console: mapPage.console.filter(noisy).map((m) => `${m.type}: ${m.text}`),
    requests: mapPage.failed.map((r) => `${r.why}: ${r.url}`),
    pageErrors: [...mapPage.errors],
    style: styleErrors(style),
  };
  const s = `${testInfo.project.name}: ${out.console.length} console errors/warnings, ${out.requests.length} failed requests, ${out.pageErrors.length} page errors, ${out.style.length} style errors (${style.layers.length} layers)`;
  console.log(s + Object.entries(out).flatMap(([k, v]) => v.slice(0, 10).map((x) => `\n  [${k}] ${x}`)).join(''));
  await testInfo.attach('health', { body: s + '\n' + JSON.stringify(out, null, 1), contentType: 'application/json' });
  expect.soft(out.console, 'console errors and warnings').toEqual([]);
  expect.soft(out.requests, 'failed requests').toEqual([]);
  expect.soft(out.style, 'style validation').toEqual([]);
});

// The detector fires: a paint value of the wrong type is a style error
// (validateStyleMin) and a MapLibre console error.
test('the detector finds a seeded style error @deep', async ({ mapPage }) => {
  const [lon, lat] = await hubOf();
  const { page } = mapPage;
  await mapPage.goto({ zoom: 11, lat, lon });
  const style = await page.evaluate(() => window.__map.getStyle());
  const rail = style.layers.find((l) => l.id === 'rail');
  rail.paint['line-width'] = 'wide';
  expect(styleErrors(style).some((m) => m.includes('line-width')), 'validateStyleMin reports it').toBe(true);
  const before = await page.evaluate(() => window.__map.getPaintProperty('rail', 'line-width'));
  await page.evaluate(() => window.__map.setPaintProperty('rail', 'line-width', 'wide'));
  await page.waitForTimeout(300);
  await page.evaluate((b) => window.__map.setPaintProperty('rail', 'line-width', b), before);
  expect(mapPage.console.filter(noisy).some((m) => m.text.includes('line-width')), 'and MapLibre logs it').toBe(true);
});
