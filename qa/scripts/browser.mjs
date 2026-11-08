// Task 4: browser checks against the local server.
//
//   cd qa && npm run serve &        # or any server on :8788
//   node qa/scripts/browser.mjs
//
// Runs Chromium, Firefox and WebKit at three sizes, collecting console errors
// and warnings, page errors and failed requests; runs axe on each; screenshots
// to qa/out/; then times the first paint of the network in Chromium with
// Lighthouse's mobile throttling. No visual judgements are made here.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, firefox, webkit } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8788';
const out = path.resolve(import.meta.dirname, '..', 'out');
mkdirSync(out, { recursive: true });

// ONLY=webkit runs a subset and merges its rows into the existing browser.json;
// HEADED=1 launches with a display, which WebKit's GTK build needs here.
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const headed = process.env.HEADED === '1';

const SIZES = [
  { label: 'phone', width: 390, height: 844, scale: 2 },
  { label: 'small-phone', width: 360, height: 740, scale: 2 },
  { label: 'desktop', width: 1440, height: 900, scale: 1 },
];

const BROWSERS = [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
];

const summarize = (el) =>
  el.replace(/\s+/g, ' ').trim().slice(0, 60) ||
  (el.tagName === 'BODY' ? 'body' : '');

async function watch(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.consoleErrors.push(msg.text().slice(0, 300));
    if (msg.type() === 'warning') bucket.consoleWarnings.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => bucket.pageErrors.push(String(err).slice(0, 300)));
  page.on('requestfailed', (req) =>
    bucket.failedRequests.push(`${req.method()} ${req.url().slice(0, 160)} — ${req.failure()?.errorText ?? 'failed'}`),
  );
  page.on('response', (res) => {
    if (res.status() >= 400) bucket.badResponses.push(`${res.status()} ${res.url().slice(0, 160)}`);
  });
}

const results = [];
const blocked = [];

for (const [name, type] of BROWSERS) {
  if (only && !only.includes(name)) continue;
  let browser;
  try {
    // Chromium and Firefox stay headless; WebKit's GTK build here needs a display.
    browser = await type.launch({ headless: name === 'webkit' ? !headed : true });
    // Headless Firefox on this host has no WebGL at all, so the map cannot draw
    // there; HEADED=1 under Xvfb gives it a context. Same for WebKit.
    const probe = await browser.newPage();
    await probe.goto('about:blank');
    const webgl2 = await probe.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    await probe.close();
    if (!webgl2) {
      blocked.push(`${name}: no WebGL2 in this environment (the map cannot draw)`);
      console.log(`BLOCKED ${name}: no WebGL2`);
      await browser.close();
      continue;
    }
  } catch (err) {
    blocked.push(`${name}: ${String(err.message).split('\n').find((l) => l.trim()) ?? err.message}`);
    console.log(`BLOCKED ${name}: will not launch`);
    continue;
  }

  for (const size of SIZES) {
    const bucket = { consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], badResponses: [] };
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.scale,
    });
    const page = await context.newPage();
    await watch(page, bucket);

    const started = Date.now();
    let drew = true;
    try {
      await page.goto(BASE, { waitUntil: 'load', timeout: 45_000 });
      await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 45_000 });
    } catch {
      drew = false;
    }
    const loadMs = Date.now() - started;

    const file = path.join(out, `${name}-${size.label}.png`);
    await page.screenshot({ path: file, fullPage: false });

    let axe = { violations: [] };
    try {
      axe = await new AxeBuilder({ page }).analyze();
    } catch (err) {
      bucket.pageErrors.push(`axe: ${String(err.message).split('\n')[0]}`);
    }

    // Keyboard: tab from the page start to the Key button, then Enter and Space.
    const tabs = [];
    let reached = false;
    for (let i = 0; i < 15 && !reached; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return {
          tag: el.tagName,
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
          label: el.getAttribute('aria-label') ?? '',
          isKey: el.tagName === 'SUMMARY' && !!el.closest('#legend'),
        };
      });
      if (!focused) break;
      tabs.push(summarize(`${focused.tag} ${focused.label} ${focused.text}`));
      reached = focused.isKey;
    }

    let toggledByEnter = null;
    let toggledBySpace = null;
    let legendOpenAtStart = null;
    if (reached) {
      // The key is already open on wide screens, so this checks that the key
      // toggles, not that it opens from closed.
      legendOpenAtStart = await page.evaluate(() => document.getElementById('legend').open);
      await page.keyboard.press('Enter');
      const afterEnter = await page.evaluate(() => document.getElementById('legend').open);
      toggledByEnter = afterEnter !== legendOpenAtStart;
      await page.keyboard.press('Space');
      const afterSpace = await page.evaluate(() => document.getElementById('legend').open);
      toggledBySpace = afterSpace !== afterEnter;
    }

    results.push({
      browser: name,
      size: size.label,
      viewport: `${size.width}x${size.height}`,
      drew,
      loadMs,
      tabs: tabs.length,
      reachedKey: reached,
      tabStops: tabs,
      legendOpenAtStart,
      toggledByEnter,
      toggledBySpace,
      screenshot: path.relative(path.join(out, '..'), file),
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      })),
      ...bucket,
    });

    console.log(
      `${name} ${size.label}: ${drew ? `${loadMs} ms` : 'STATUS NEVER HID'}  axe ${axe.violations.length}  ` +
        `tabs ${tabs.length}${reached ? ' (Key)' : ' (no Key)'}  toggles ${toggledByEnter}/${toggledBySpace}  ` +
        `errors ${bucket.consoleErrors.length}/${bucket.pageErrors.length}  ` +
        `warnings ${bucket.consoleWarnings.length}  failed ${bucket.failedRequests.length}/${bucket.badResponses.length}`,
    );
    await context.close();
  }
  await browser.close();
}

// Load time: Lighthouse's mobile throttling, three runs, median.
const THROTTLE = { rttMs: 150, downKbps: 1638.4, upKbps: 750, cpu: 4 };
const timings = [];
if (!only || only.includes('chromium')) {
  const browser = await chromium.launch();
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: THROTTLE.rttMs,
      downloadThroughput: (THROTTLE.downKbps * 1024) / 8,
      uploadThroughput: (THROTTLE.upKbps * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE.cpu });
    const started = Date.now();
    try {
      await page.goto(BASE, { waitUntil: 'load', timeout: 90_000 });
      await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90_000 });
      timings.push(Date.now() - started);
    } catch {
      timings.push(null);
    }
    await context.close();
  }
  await browser.close();
}

const sorted = timings.filter((t) => t !== null).sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

const report = {
  when: new Date().toISOString(),
  base: BASE,
  throttle: { ...THROTTLE, note: "Lighthouse's mobile defaults: 150 ms RTT, 1,638.4 kbit/s down, 750 kbit/s up, 4x CPU" },
  loadMs: { runs: timings, median },
  blocked,
  runs: results,
};
writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2));

console.log(`\nThrottled load (chromium, 390x844): runs ${timings.map((t) => (t === null ? 'timeout' : `${t} ms`)).join(', ')} — median ${median ?? 'none'}`);
if (blocked.length) console.log(`Blocked: ${blocked.map((b) => b.split(':')[0]).join(', ')}`);
console.log(`Wrote qa/out/browser.json and ${results.length} screenshots`);
