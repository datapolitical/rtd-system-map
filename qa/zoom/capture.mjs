import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { stubAnalytics } from '../lib/analytics.mjs';
import { railOrderFindings } from './rules.mjs';

const [reportPath, url, out = 'qa/.scratch/zoom/review'] = process.argv.slice(2);
if (!reportPath || !url) throw new Error('Usage: npm run check:zoom-captures -- <report.json> <exact preview page URL> [outdir]');
const { commit, cameras, partial, zooms } = JSON.parse(await readFile(reportPath, 'utf8'));
if (!cameras?.length) throw new Error('Missing review cameras in the zoom report');
const target = new URL(url);
const { defaultBrowserType, ...phone } = devices['iPhone 14'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const environment = `iPhone 14 emulation, Chromium ${browser.version()}, SwiftShader software WebGL`;
const sections = [];
const findings = [];
const errors = [];
await mkdir(out, { recursive: true });
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ ...phone, colorScheme: theme, serviceWorkers: 'block' });
    const page = await context.newPage();
    await stubAnalytics(page);
    page.on('pageerror', (error) => errors.push(String(error)));
    const [startLon, startLat] = cameras[0].at;
    target.hash = `${cameras[0].zoom}/${startLat}/${startLon}`;
    target.searchParams.set('theme', theme);
    await page.goto(target.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window.zoomMap ?? window.__map)?.loaded(), null, { timeout: 60000 });
    const items = [];
    for (const [i, camera] of cameras.entries()) {
      const { zoom, at: [lon, lat], reasons } = camera;
      await page.evaluate(({ zoom, at }) => (window.zoomMap ?? window.__map).jumpTo({ center: at, zoom }), camera);
      const actual = await page.waitForFunction(() => {
        const map = window.zoomMap ?? window.__map;
        if (!map?.loaded() || !map.areTilesLoaded() || map.isMoving() || window.zoomState?.fading) return null;
        if (window.zoomMap && (!window.zoomReady || Math.abs((window.zoomState?.zoom ?? Infinity) - map.getZoom()) > 1e-5)) return null;
        const { lng, lat } = map.getCenter();
        return { zoom: map.getZoom(), at: [lng, lat], layers: map.getStyle().layers.map(({ id }) => ({ id })) };
      }, null, { timeout: 60000 }).then((value) => value.jsonValue());
      if (Math.abs(actual.zoom - zoom) > 1e-5 || actual.at.some((v, j) => Math.abs(v - camera.at[j]) > 1e-5)) {
        throw new Error(`Camera snapped for ${theme} z${zoom}: ${JSON.stringify(actual.at)} z${actual.zoom}`);
      }
      if (actual.layers.some(({ id }) => /^trial-rail(?:-rim|-casing)?(?:-\d+)?$/.test(id))) {
        findings.push(...railOrderFindings(actual).map((f) => ({ ...f, theme, zoom })));
      }
      const id = `${theme}-${i + 1}`;
      const file = `${id}.png`;
      await page.screenshot({ path: path.join(out, file) });
      items.push({ id, title: `z${zoom} · ${theme}`, text: `${reasons.join(', ')} at ${lat}, ${lon}`, images: [file] });
    }
    sections.push({ heading: theme, items });
    await context.close();
  }
} finally {
  await browser.close();
}
const manifest = { title: `Continuous zoom checks · ${commit}`, intro: environment, sections };
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(out, 'captures.json'), JSON.stringify({ commit, partial, url, zooms, environment, cameras, findings, errors }, null, 2) + '\n');
console.log(`${sections.reduce((n, s) => n + s.items.length, 0)} captures for ${commit} in ${out} (${environment})`);
if (findings.length || errors.length) process.exitCode = 1;
