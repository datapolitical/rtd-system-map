// Focused rendered checks for the shared-spine change, using the same view as the report.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:8804';
const out = 'qa/.scratch/zoom-spacing/browser';
await mkdir(out, { recursive: true });
const pin = JSON.parse(await readFile('qa/recall/prototype-spacing.json', 'utf8'));
const stations = JSON.parse(await readFile('public/data/stations.geojson', 'utf8')).features;
const hub = stations.find((f) => f.properties.hub);
const shared = stations.filter((f) => f.properties.served && !f.properties.hub)
  .sort((a, b) => String(b.properties.lines).split(' ').length - String(a.properties.lines).split(' ').length)[0];
const terminal = stations.find((f) => f.properties.served && f.properties.end && !f.properties.hub);
const errors = [], results = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2,
      hasTouch: true, isMobile: true, colorScheme: theme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/zoom/?theme=${theme}#14/${hub.geometry.coordinates[1]}/${hub.geometry.coordinates[0]}`);
    await page.waitForFunction(() => window.zoomReady, null, { timeout: 60000 });
    for (const view of [
      ...[12, 12.99, 13.01, 14].map((zoom) => ({ name: 'hub', zoom, center: pin.origin })),
      { name: 'shared', zoom: 14, center: shared.geometry.coordinates },
      { name: 'terminal', zoom: 14, center: terminal.geometry.coordinates },
    ]) {
      await page.evaluate((view) => window.zoomMap.jumpTo(view), { zoom: view.zoom, center: view.center });
      await page.waitForFunction(() => window.zoomMap.isStyleLoaded() && window.zoomMap.areTilesLoaded() && !window.zoomMap.isMoving()
        && Math.abs(window.zoomState.zoom - window.zoomMap.getZoom()) < 1e-6, null, { timeout: 30000 });
      const counts = await page.evaluate(() => ({
        rail: window.zoomMap.queryRenderedFeatures({ layers: ['trial-rail'] }).length,
        station: window.zoomMap.queryRenderedFeatures({ layers: ['trial-station'] }).length,
      }));
      assert.ok(counts.rail && counts.station);
      assert.deepEqual(await page.evaluate(() => window.zoomErrors), []);
      await page.screenshot({ path: `${out}/${theme}-${view.name}-${view.zoom}.png` });
      results.push({ theme, view, counts });
      console.log(`ok ${theme}/${view.name}/${view.zoom}`);
    }
    const route = String(hub.properties.lines).split(' ')[0];
    await page.evaluate(({ center, route }) => { window.zoomMap.jumpTo({ center, zoom: 12.5 }); window.zoomSetPick({ mode: 'rail', route }); }, { center: pin.origin, route });
    await page.locator('#in').click();
    await page.waitForFunction(() => !window.zoomMap.isMoving() && window.zoomMap.getZoom() > 13.49);
    assert.deepEqual(await page.evaluate(() => window.zoomPick), { mode: 'rail', route });
    results.push({ theme, controls: 'zoom button preserves selection', ok: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify({ base, results, errors, scope: 'Light/dark rendered offset view, same reported camera, other shared track and a terminus, plus selection during zoom.' }, null, 2) + '\n');
}
