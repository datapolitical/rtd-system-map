// Load-time measurement: 1.6 Mbps downlink, CPU throttled 4x, cold cache.
//   node qa/vision/perf.mjs [runs]
// "Usable" = the loading toast (#status) hides, which is when every map layer
// has been added and the key is built. Timed in Node around goto so no in-page
// instrumentation is needed.
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const RUNS = Number(process.argv[2] ?? 5);
const THROTTLE = process.env.UNTHROTTLED !== '1';
const browser = await chromium.launch();

const rows = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (THROTTLE) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
      uploadThroughput: Math.round((750 * 1024) / 8),
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const t0 = Date.now();
  await page.goto('http://localhost:8830/', { waitUntil: 'load', timeout: 180000 });
  const load = Date.now() - t0;
  await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 180000 });
  const usable = Date.now() - t0;
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const f = performance.getEntriesByName('first-contentful-paint')[0];
    return { dcl: Math.round(n.domContentLoadedEventEnd), loadEnd: Math.round(n.loadEventEnd), fcp: f ? Math.round(f.startTime) : null, transfer: Math.round(n.transferSize / 1024) };
  });
  rows.push({ run: i + 1, load, usable, ...nav });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await ctx.close();
}
const vals = rows.map((r) => r.usable).sort((a, b) => a - b);
const med = vals.length % 2 ? vals[(vals.length - 1) / 2] : Math.round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2);
console.log(JSON.stringify({ throttled: THROTTLE, runs: RUNS, usable: vals, median: med, min: vals[0], max: vals[vals.length - 1] }));
await browser.close();
