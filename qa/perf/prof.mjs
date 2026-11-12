// CPU profile of one cold load (no throttling), self time grouped by script and function.
import { chromium, devices } from 'playwright';
// Browser: CHROMIUM=/path/to/chrome to pick one; SOFTWARE_GL=1 for machines
// with no GPU (WebGL in SwiftShader: timings then run high).
const BROWSER = { executablePath: process.env.CHROMIUM || undefined, args: process.env.SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] };
const browser = await chromium.launch(BROWSER);
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
if (process.env.WRF) await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return g.call(this, t, t === '2d' ? { ...(o || {}), willReadFrequently: true } : o); }; });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await page.goto(process.argv[2] || 'https://rtd-system-map.pages.dev/', { waitUntil: 'load' });
await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
const { profile } = await cdp.send('Profiler.stop');
const dt = {}; const ts = profile.timeDeltas; profile.samples.forEach((id, i) => dt[id] = (dt[id] || 0) + (ts[i] || 0));
const byFn = {}, byUrl = {};
for (const n of profile.nodes) {
  const ms = (dt[n.id] || 0) / 1000; if (!ms) continue;
  const f = n.callFrame; const u = (f.url || '(' + f.functionName + ')').replace(/^https?:\/\/[^/]+/, '');
  byUrl[u] = (byUrl[u] || 0) + ms;
  const k = `${f.functionName || '(anon)'} ${u}:${f.lineNumber + 1}`; byFn[k] = (byFn[k] || 0) + ms;
}
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${Math.round(v).toString().padStart(6)} ms  ${k}`).join('\n');
console.log('main thread self time by script:\n' + top(byUrl) + '\n\nby function:\n' + top(byFn));
await browser.close();
