// One cold load of the live site as a mid-range phone on a fast-3G/slow-4G link,
// then a scripted pan + pinch-ish zoom, counting frames. Prints JSON.
import { chromium, devices } from 'playwright';
// Browser: CHROMIUM=/path/to/chrome to pick one; SOFTWARE_GL=1 for machines
// with no GPU (WebGL in SwiftShader: timings then run high).
const BROWSER = { executablePath: process.env.CHROMIUM || undefined, args: process.env.SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] };
const url = process.argv[2] || 'https://rtd-system-map.pages.dev/';
const cpu = Number(process.argv[3] || 4);
const browser = await chromium.launch(BROWSER);
const ctx = await browser.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: 9e6 / 8, uploadThroughput: 750e3 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const reqs = [];
cdp.on('Network.loadingFinished', e => reqs.push({ id: e.requestId, bytes: e.encodedDataLength, t: e.timestamp }));
const meta = new Map();
cdp.on('Network.responseReceived', e => meta.set(e.requestId, { url: e.response.url, type: e.type, proto: e.response.protocol, cache: e.response.headers['cache-control'] || e.response.headers['Cache-Control'] }));
await page.addInitScript(() => {
  window.__perf = { lt: [], lcp: 0 };
  new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.lcp = Math.round(e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
});
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 90000 });
const loadMs = Date.now() - t0;
// wait for network quiet
await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {});
const idleMs = Date.now() - t0;
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint'); return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), fcp: Math.round((p.find(x => x.name === 'first-contentful-paint') || {}).startTime || 0) }; });
const perf1 = await page.evaluate(() => window.__perf);
const sumBy = (list) => { const o = {}; for (const r of list) { const m = meta.get(r.id) || {}; let h = '?'; try { h = new URL(m.url).host; } catch {} o[h] = (o[h] || 0) + r.bytes / 1024; } for (const k in o) o[k] = Math.round(o[k]); return o; };
const openBytes = sumBy(reqs.slice()); const nOpen = reqs.length;
// interaction: pan and zoom, count frames
const box = await page.locator('canvas').first().boundingBox();
await page.evaluate(() => { window.__frames = []; const f = t => { window.__frames.push(t); if (window.__frames.length < 100000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
for (let r = 0; r < 3; r++) { await page.mouse.down(); for (let i = 0; i < 30; i++) await page.mouse.move(cx + (r % 2 ? -1 : 1) * i * 6, cy + i * 3); await page.mouse.up(); }
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
await page.waitForTimeout(1500);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
await page.waitForTimeout(1500);
const frames = await page.evaluate(() => window.__frames);
const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
const pct = q => Math.round(gaps[Math.floor(gaps.length * q)] || 0);
const perf2 = await page.evaluate(() => window.__perf);
const rows = reqs.map(r => ({ ...r, ...(meta.get(r.id) || {}) }));
const byHost = {}; for (const r of rows) { const h = (() => { try { const u = new URL(r.url); return u.host + ' ' + (r.type || ''); } catch { return '?'; } })(); byHost[h] = byHost[h] || { n: 0, kb: 0 }; byHost[h].n++; byHost[h].kb += r.bytes / 1024; }
for (const k in byHost) byHost[k].kb = Math.round(byHost[k].kb);
const biggest = rows.sort((a, b) => b.bytes - a.bytes).slice(0, 12).map(r => [Math.round(r.bytes / 1024) + ' KB', r.proto, (r.cache || '').slice(0, 40), (r.url || '').replace(/^https?:\/\//, '').slice(0, 90)]);
console.log(JSON.stringify({ openBytes, panBytes: sumBy(reqs.slice(nOpen)), cpu, loadMs, idleMs, ...nav, lcp: perf2.lcp, longTasksDuringLoad: perf1.lt.length, longTaskMsDuringLoad: perf1.lt.reduce((s, x) => s + x[1], 0), worstLongTasks: perf1.lt.sort((a, b) => b[1] - a[1]).slice(0, 5), totalKB: Math.round(rows.reduce((s, r) => s + r.bytes, 0) / 1024), requests: rows.length, byHost, biggest, interaction: { frames: frames.length, p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), over50ms: gaps.filter(g => g > 50).length, longTasks: perf2.lt.length - perf1.lt.length } }, null, 1));
await browser.close();
