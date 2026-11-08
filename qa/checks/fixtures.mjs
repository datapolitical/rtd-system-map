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
import { annotate, contrast, detect, install, jump, measure, pixels } from '../lib/detect.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The site's own data, as the server under test serves it (CHECK_URL or the
// dev server), so a run against production reads production's data.
const BASE = (process.env.CHECK_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
export const siteData = async (name) => (await fetch(`${BASE}/data/${name}`)).json();
export const readData = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', name), 'utf8'));

// WCAG contrast for [r,g,b] (0 to 255) or '#rrggbb', and a PNG as pixels
// you can sample ({ w, h, d (RGBA), at([x, y]) -> [r, g, b] | null }); the
// detectors use the same ones (../lib/detect.mjs).
export { contrast, pixels };

export const test = base.extend({
  mapPage: async ({ page, baseURL }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // For health.spec.mjs: what the console said and which requests failed.
    const consoleLog = [], failed = [];
    page.on('console', (m) => consoleLog.push({ type: m.type(), text: m.text() }));
    page.on('requestfailed', (r) => failed.push({ url: r.url(), why: r.failure()?.errorText }));
    page.on('response', (r) => { if (r.status() >= 400) failed.push({ url: r.url(), why: `HTTP ${r.status()}` }); });
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
    let installed = false;
    const mapPage = {
      page,
      errors,
      console: consoleLog,
      failed,
      theme: testInfo.project.name.endsWith('dark') ? 'dark' : 'light',
      idle,
      // A fresh load at #zoom/lat/lon; Live is off unless asked for.
      async goto({ zoom, lat, lon }, { live: on = false, settle = 2500 } = {}) {
        live = on;
        const up = await fetch(new URL('/js/main.js', baseURL)).then((r) => r.ok, () => false);
        if (!up) throw new Error(`No dev server at ${baseURL}. Run \`npm run dev\` first (and \`npm run dev:live\` for the Live checks).`);
        await page.goto('about:blank');
        // Init scripts stay for every later document, about:blank included,
        // where localStorage throws; that would read as a page error. The
        // latest one added runs last, so it sets the value.
        await page.addInitScript((v) => { try { localStorage.setItem('live', v ? 'on' : 'off'); } catch {} }, live);
        await page.goto(`/#${zoom}/${lat}/${lon}`, { waitUntil: 'domcontentloaded' });
        await idle(settle);
        installed = false;
      },
      // The detectors' helpers in the page (../lib/inpage.js), once per load.
      async install() {
        if (!installed) await install(page);
        installed = true;
      },
      // Move to { zoom, lat, lon } and wait for the map to rest.
      async jump(v) {
        await mapPage.install();
        return jump(page, v);
      },
      // Run the detectors (../lib/detect.mjs) on the view as it is.
      async detect(which, { bus } = {}) {
        await mapPage.install();
        const zoom = await page.evaluate(() => window.__map.getZoom());
        const raw = await measure(page, { bus: bus ?? zoom >= 14, lines: which.includes('continuity') || which.includes('contrast') });
        return { raw, findings: detect(raw, which) };
      },
      // Run `which` detectors over `views` ({ zoom, lat, lon }), reloading the
      // page every `recycle` views (a long-lived page leaks memory in the dev
      // server). Each view with findings gets a circled capture attached.
      async scan(views, which, { name = 'view', recycle = 30, keep = () => true } = {}) {
        const all = [];
        for (const [i, v] of views.entries()) {
          if (i && i % recycle === 0) await mapPage.goto(v, { settle: 500 });
          await mapPage.jump(v);
          const { raw, findings } = await mapPage.detect(which);
          const kept = findings.filter(keep).map((f) => ({ ...f, view: i }));
          await mapPage.report(`${name}-${i}-z${v.zoom.toFixed(2)}`, raw, kept);
          all.push(...kept);
        }
        return all;
      },
      // Attach a capture with the findings circled, and the findings as JSON.
      async report(name, raw, findings) {
        if (!findings.length) return;
        const useBare = findings.every((f) => f.detector === 'continuity');
        // Written beside the test's other output (qa/checks/out/<test>/) as
        // well as attached, so a capture has a path to point at.
        const png = testInfo.outputPath(`${name}.png`), json = testInfo.outputPath(`${name}.json`);
        fs.writeFileSync(png, await annotate(useBare ? raw.bare : raw.capture, findings, raw.view.dpr));
        fs.writeFileSync(json, JSON.stringify(findings, null, 1));
        for (const f of findings) f.capture = path.relative(ROOT, png);
        await testInfo.attach(`${name}.png`, { path: png, contentType: 'image/png' });
        await testInfo.attach(`${name}.json`, { path: json, contentType: 'application/json' });
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

// A finding list as text, logged and attached to the test.
export function summary(testInfo, title, fs) {
  const s = `${testInfo.project.name} ${title}: ${fs.length} finding(s)` + fs.map((f) => `\n  [${f.kind}] z${f.zoom} ${f.lat},${f.lon}: ${f.msg}${f.capture ? `  (${f.capture})` : ''}`).join('');
  console.log(s);
  return testInfo.attach('summary', { body: s, contentType: 'text/plain' });
}
