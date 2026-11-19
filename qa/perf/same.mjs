// Before/after: are the key's pictures and the map's pixels the same? Both themes.
import { chromium, devices } from 'playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('qa/.scratch/perf', { recursive: true });
// Browser: CHROMIUM=/path/to/chrome to pick one; SOFTWARE_GL=1 for machines
// with no GPU (WebGL in SwiftShader: timings then run high).
const BROWSER = { executablePath: process.env.CHROMIUM || undefined, args: process.env.SOFTWARE_GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] };
const [A, B] = [process.argv[2] || 'http://127.0.0.1:8824/', process.argv[3] || 'http://127.0.0.1:8823/'];
const tag = process.argv[4] || 'ab';
const only = process.argv[5];
const views0 = { whole: '#10/39.74/-104.99', union: '#15.5/39.7530/-105.0003', boulder: '#14/40.017/-105.276', i25: '#13/39.70/-104.99' };
const browser = await chromium.launch(BROWSER);
async function grab(base, scheme, hash) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: scheme, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(base + hash, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const key = await page.$$eval('img[data-mark]', (a) => a.map((i) => [i.dataset.mark, i.getAttribute('src')]));
  const png = await page.screenshot();
  await ctx.close();
  return { key, png };
}
async function diff(p, q) {
  const [a, b] = await Promise.all([loadImage(p), loadImage(q)]);
  const ca = createCanvas(a.width, a.height).getContext('2d'); ca.drawImage(a, 0, 0);
  const cb = createCanvas(b.width, b.height).getContext('2d'); cb.drawImage(b, 0, 0);
  const da = ca.getImageData(0, 0, a.width, a.height).data, db = cb.getImageData(0, 0, b.width, b.height).data;
  let n = 0, max = 0; for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (d > 0) n++; if (d > max) max = d; }
  return { changedPx: n, of: da.length / 4, maxChannelDiff: max };
}
const views = only ? Object.fromEntries(Object.entries(views0).filter(([k]) => only.split(',').includes(k))) : views0;
for (const scheme of ['light', 'dark']) for (const [name, hash] of Object.entries(views)) {
  const [a, b] = [await grab(A, scheme, hash), await grab(B, scheme, hash)];
  await writeFile(`qa/.scratch/perf/same-${tag}-${scheme}-${name}-a.png`, a.png); await writeFile(`qa/.scratch/perf/same-${tag}-${scheme}-${name}-b.png`, b.png);
  const keyDiff = [];
  for (const [i, [m, src]] of a.key.entries()) {
    const other = b.key[i]?.[1]; if (other === src) continue;
    const d = await diff(Buffer.from(src.split(',')[1], 'base64'), Buffer.from(other.split(',')[1], 'base64'));
    keyDiff.push(`${m}(${d.changedPx}px,max ${d.maxChannelDiff})`);
  }
  console.log(scheme, name, 'key images', a.key.length, b.key.length, 'differ:', keyDiff.length ? keyDiff.join(',') : 'none', 'map', JSON.stringify(await diff(a.png, b.png)));
}
await browser.close();
