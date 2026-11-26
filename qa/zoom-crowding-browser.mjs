// RTD-006: do bus route numbers land on the hub's own lettering? Measured in the hub view at every
// quarter zoom of the trial, by the ink the two share (qa/lib/zoom-crowding.mjs).
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { crowding } from './lib/zoom-crowding.mjs';
import { MIN_ZOOM, MAX_ZOOM } from '../public/js/zoom/model.js';

const base = process.argv[2] ?? 'http://127.0.0.1:8804';
const out = process.argv[3] ?? 'qa/.scratch/zoom-crowding';
await mkdir(out, { recursive: true });
const pin = JSON.parse(await readFile('qa/recall/prototype-spacing.json', 'utf8'));
const zooms = [];
for (let z = MIN_ZOOM; z <= MAX_ZOOM + 1e-9; z += 0.25) zooms.push(z);
if (process.env.ZOOMS) zooms.splice(0, zooms.length, ...process.env.ZOOMS.split(',').map(Number)); // a few zooms, e.g. ZOOMS=13,13.25
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
const results = [], errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const theme of (process.env.THEMES ?? 'light').split(',')) {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1,
      hasTouch: true, isMobile: true, colorScheme: theme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/zoom/?theme=${theme}#13/${pin.origin[1]}/${pin.origin[0]}`);
    await page.waitForFunction(() => window.zoomReady, null, { timeout: 60000 });
    for (const zoom of zooms) {
      await page.evaluate((view) => window.zoomMap.jumpTo(view), { zoom, center: pin.origin });
      await page.waitForFunction(() => window.zoomMap.isStyleLoaded() && window.zoomMap.areTilesLoaded() && !window.zoomMap.isMoving()
        && Math.abs(window.zoomState.zoom - window.zoomMap.getZoom()) < 1e-6, null, { timeout: 30000 });
      await page.waitForTimeout(600); // drawing handovers fade over 260 ms
      await page.screenshot({ path: `${out}/${theme}-hub-${zoom}.png` });
      const m = await crowding(page);
      results.push({ theme, zoom, ...m });
      console.log(`${theme} ${zoom}: ${m.both} shared px (station ${m.station}, bus ${m.bus})`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify({ base, commit, dirty, view: { center: pin.origin, viewport: [402, 874] },
    measure: 'pixels where bus-number/stack glyphs land on station name (with halo), chips, line letters or bars', results, errors }, null, 2) + '\n');
}
if (errors.length) { console.error(errors); process.exit(1); }
