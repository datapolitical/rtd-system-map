// Relief at DEM maxzoom 12 (as live) vs lower: screenshots per view and theme,
// and the bytes of elevation tiles each view fetched. Rewrites basemap.js on the fly.
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('qa/.scratch/perf', { recursive: true });
// Browser: CHROMIUM=/path/to/chrome to pick one; SOFTWARE_GL=1 for machines
// with no GPU (WebGL in SwiftShader: timings then run high).
const BROWSER = { executablePath: process.env.CHROMIUM || undefined, args: process.env.SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] };
const base = process.env.BASE || 'http://127.0.0.1:8825/';
const zs = (process.argv[2] || '12,11,10').split(',').map(Number);
const views = { open: '', whole: '#10/39.74/-105.05', golden: '#12/39.75/-105.21', flatirons: '#13/39.99/-105.28', morrison: '#14/39.655/-105.19' };
const only = process.argv[3]; const pick = only ? Object.fromEntries(Object.entries(views).filter(([k]) => only.split(',').includes(k))) : views;
const browser = await chromium.launch(BROWSER);
for (const scheme of ['light', 'dark']) for (const [name, hash] of Object.entries(pick)) {
  const row = [];
  for (const z of zs) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: scheme, serviceWorkers: 'block' });
    await ctx.route('**/js/basemap.js', async (route) => {
      const r = await route.fetch(); let body = await r.text();
      body = body.replace(/(encoding: 'terrarium',[\s\S]*?maxzoom: )12,/, `$1${z},`);
      await route.fulfill({ response: r, body });
    });
    let dem = 0, n = 0;
    const page = await ctx.newPage();
    page.on('response', async (res) => { if (res.url().includes('elevation-tiles')) { n++; try { dem += (await res.body()).length; } catch {} } });
    await page.goto(base + hash, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await writeFile(`qa/.scratch/perf/${scheme}-${name}-z${z}.png`, await page.screenshot());
    row.push(`z${z}: ${n} tiles ${Math.round(dem / 1024)} KB`);
    await ctx.close();
  }
  console.log(scheme, name, row.join(' | '));
}
await browser.close();
