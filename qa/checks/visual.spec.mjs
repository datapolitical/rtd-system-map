// Visual baselines: three views per theme compared with a stored image
// (toHaveScreenshot), so a change nobody meant shows up as a diff in the
// report. Images are at CSS scale (390 x 664), the Live button and status
// line are masked. A pixel differs at 0.25 YIQ distance and up to 1% of
// pixels may differ: two runs a minute apart differed by 0.00%, and with
// every rail line painted out the view at 11.5 differs by only 2.9%, so a
// looser 3% would have passed a map with no trains on it. A failure is not
// a defect by itself: open the report (npm run check:report), look at the
// diff, and if the change was meant, refresh the baselines with
// `npm run check:baselines`.
//
// The views are the busiest station (from stations.geojson) at 9, 11.5 and 14.
import fs from 'node:fs';
import { test, expect, siteData, pixels } from './fixtures.mjs';

const ZOOMS = [9, 11.5, 14];
const hubOf = async () => {
  const stations = await siteData('stations.geojson');
  const count = (f) => (f.properties.lines || '').split(' ').length;
  return stations.features.filter((f) => f.properties.served).reduce((a, b) => (count(b) > count(a) ? b : a)).geometry.coordinates;
};

for (const zoom of ZOOMS) {
  test(`looks as it did at ${zoom}`, async ({ mapPage }) => {
    const [lon, lat] = await hubOf();
    await mapPage.goto({ zoom, lat, lon });
    await mapPage.jump({ zoom, lat, lon });
    const { page } = mapPage;
    await expect(page).toHaveScreenshot(`hub-${zoom}.png`, {
      scale: 'css', animations: 'disabled', caret: 'hide',
      mask: [page.locator('#live-button'), page.locator('#status')],
      threshold: 0.25, maxDiffPixelRatio: 0.01, timeout: 20_000,
    });
  });
}

// The comparison fires: with every rail line painted the land's color, the
// view at 11.5 differs from its baseline by more than the 1% allowed. The
// share is measured here the same way (a pixel differs when a channel moves
// by more than 64 of 255), and the untouched view stays under it.
test('the comparison finds a seeded change @deep', async ({ mapPage }, testInfo) => {
  const [lon, lat] = await hubOf();
  await mapPage.goto({ zoom: 11.5, lat, lon });
  await mapPage.jump({ zoom: 11.5, lat, lon });
  const { page } = mapPage;
  const baseline = testInfo.snapshotPath('hub-11.5.png');
  test.skip(!fs.existsSync(baseline), 'no baseline yet: npm run check:baselines');
  const base = await pixels(fs.readFileSync(baseline));
  const share = async () => {
    const shot = await pixels(await page.screenshot({ scale: 'css', mask: [page.locator('#live-button'), page.locator('#status')] }));
    let n = 0;
    for (let i = 0; i < base.d.length; i += 4) if (Math.max(Math.abs(base.d[i] - shot.d[i]), Math.abs(base.d[i + 1] - shot.d[i + 1]), Math.abs(base.d[i + 2] - shot.d[i + 2])) > 64) n++;
    return n / (base.w * base.h);
  };
  const clean = await share();
  const before = await page.evaluate(() => { const m = window.__map, b = m.getPaintProperty('rail', 'line-color'); m.setPaintProperty('rail', 'line-color', m.getPaintProperty('land', 'background-color')); return b; });
  await page.evaluate(() => window.__qa.settle());
  const seeded = await share();
  await page.evaluate((b) => window.__map.setPaintProperty('rail', 'line-color', b), before);
  console.log(`${testInfo.project.name}: ${(clean * 100).toFixed(2)}% of pixels differ untouched, ${(seeded * 100).toFixed(2)}% with rail painted the land`);
  expect(clean).toBeLessThan(0.01);
  expect(seeded).toBeGreaterThan(0.01);
});
