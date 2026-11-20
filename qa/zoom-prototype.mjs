// Browser evidence for #154. Start a static server, then npm run check:zoom -- <origin>.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const base = (process.argv[2] ?? 'http://127.0.0.1:8804').replace(/\/$/, '');
const out = path.resolve(process.argv[3] ?? 'qa/.scratch/zoom-prototype/browser');
await mkdir(out, { recursive: true });
const stations = JSON.parse(await readFile('public/data/stations.geojson', 'utf8')).features.filter((f) => f.properties.served);
const hub = stations.find((f) => f.properties.hub);
const shared = stations.filter((f) => !f.properties.hub).sort((a, b) => String(b.properties.lines).split(' ').length - String(a.properties.lines).split(' ').length)[0];
const terminal = stations.find((f) => f.properties.end && !f.properties.hub);
const views = [{ name: 'hub', at: hub }, { name: 'shared', at: shared }, { name: 'terminal', at: terminal }];
const results = [];
const failures = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const check = async (name, run) => {
  try { const detail = await run(); results.push({ name, ok: true, detail }); console.log(`ok ${name}`); }
  catch (e) { failures.push({ name, error: e.message }); console.log(`FAIL ${name}: ${e.message}`); }
};
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, colorScheme: theme, serviceWorkers: 'block', recordVideo: { dir: path.join(out, 'video'), size: { width: 402, height: 874 } } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const [lon, lat] = hub.geometry.coordinates;
    await page.goto(`${base}/zoom/?theme=${theme}#12.37/${lat}/${lon}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.zoomReady && window.zoomMap.isStyleLoaded(), null, { timeout: 60000 });
    const settled = async () => {
      await page.waitForFunction(() => window.zoomMap.isStyleLoaded() && window.zoomMap.areTilesLoaded()
        && !window.zoomMap.isMoving() && Math.abs(window.zoomState.zoom - window.zoomMap.getZoom()) < 1e-5, null, { timeout: 30000 });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    };
    await settled();
    await check(`${theme}: fractional URL restores without snapping`, async () => {
      assert.ok(Math.abs(await page.evaluate(() => window.zoomMap.getZoom()) - 12.37) < 1e-6);
    });
    for (const mode of ['offset', 'drawn']) {
      await page.locator(`[data-mode=${mode}]`).click();
      await settled();
      for (const view of views) {
        for (const zoom of [12, 12.99, 13.01, 14]) {
          await page.evaluate(({ center, zoom }) => window.zoomMap.jumpTo({ center, zoom }), { center: view.at.geometry.coordinates, zoom });
          await settled();
          await check(`${theme}/${mode}/${view.name}/${zoom}: rails and station marks rendered`, async () => {
            const counts = await page.evaluate(() => ({
              rail: window.zoomMap.queryRenderedFeatures({ layers: ['trial-rail'] }).length,
              stations: window.zoomMap.queryRenderedFeatures({ layers: ['trial-station'] }).length,
              names: window.zoomMap.queryRenderedFeatures({ layers: ['trial-name'] }).length,
            }));
            assert.ok(counts.rail > 0 && counts.stations > 0 && counts.names > 0, JSON.stringify(counts));
            return counts;
          });
          if (view.name === 'hub' || zoom === 14) await page.screenshot({ path: path.join(out, `${theme}-${mode}-${view.name}-${zoom}.png`) });
        }
      }
      await check(`${theme}/${mode}: selection survives a continuous zoom and reversal`, async () => {
        await page.evaluate(({ center, route }) => { window.zoomMap.jumpTo({ center, zoom: 12 }); window.zoomSetPick({ mode: 'rail', route }); },
          { center: hub.geometry.coordinates, route: String(hub.properties.lines).split(' ')[0] });
        await settled();
        const frames = await page.evaluate(async () => {
          const times = []; let last = performance.now(); let active = true;
          const tick = (now) => { times.push(now - last); last = now; if (active) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          for (const zoom of [14, 12]) await new Promise((resolve) => {
            window.zoomMap.once('moveend', resolve); window.zoomMap.easeTo({ zoom, duration: 2500, easing: (t) => t });
          });
          active = false;
          return { times, pick: window.zoomPick, updates: window.zoomTimings.slice(), zoom: window.zoomMap.getZoom() };
        });
        await settled();
        assert.ok(frames.pick?.route);
        assert.match(await page.locator('#selection').textContent(), /highlighted/);
        assert.ok(Math.abs(frames.zoom - 12) < 1e-6);
        const sorted = frames.times.slice(1).sort((a, b) => a - b);
        return { animationFrames: sorted.length, medianFrameMs: sorted[Math.floor(sorted.length / 2)], p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
          updates: frames.updates.length, p95GeometryMs: frames.updates.sort((a, b) => a - b)[Math.floor(frames.updates.length * 0.95)] };
      });
      await page.locator('#clear').click();
      await check(`${theme}/${mode}: clear selection`, async () => assert.equal(await page.evaluate(() => window.zoomPick), null));
    }
    await check(`${theme}: theme change preserves centre, fractional zoom and selection`, async () => {
      await page.evaluate(({ center, route }) => { window.zoomMap.jumpTo({ center, zoom: 13.37 }); window.zoomSetPick({ mode: 'rail', route }); },
        { center: hub.geometry.coordinates, route: String(hub.properties.lines).split(' ')[0] });
      await settled();
      const before = await page.evaluate(() => ({ center: window.zoomMap.getCenter(), zoom: window.zoomMap.getZoom(), pick: window.zoomPick }));
      await page.locator('#theme').click(); await settled();
      const after = await page.evaluate(() => ({ center: window.zoomMap.getCenter(), zoom: window.zoomMap.getZoom(), pick: window.zoomPick }));
      assert.deepEqual(after, before);
    });
    await check(`${theme}: browser and map errors`, async () => {
      assert.deepEqual(pageErrors, []); assert.deepEqual(await page.evaluate(() => window.zoomErrors), []);
    });
    await context.close();
  }
} finally {
  await browser.close();
  let commit = 'unknown'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
  const build = JSON.parse(await readFile('public/data/zoom-prototype/report.json', 'utf8'));
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ commit, uncommittedPrototype: true, base, views: views.map((v) => ({ name: v.name, station: v.at.properties.name, coordinates: v.at.geometry.coordinates })),
    themes: ['light', 'dark'], screenshotsAt: [12, 12.99, 13.01, 14], build, results, failures,
    limitation: 'Chromium with software rendering at a phone viewport; this does not replace a physical phone review or establish a phone frame-rate budget.' }, null, 2) + '\n');
}
if (failures.length) process.exitCode = 1;
