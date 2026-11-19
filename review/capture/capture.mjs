// Capture views of the live RTD system map for the review page's Issues tab.
//   node capture.mjs jobs.json
// jobs.json: {"site": "https://rtd-system-map.pages.dev",
//             "views": [{"out": "/abs/path.jpg", "z": 16, "lat": 39.7, "lon": -104.99, "theme": "light"}]}
// Each view is opened the way its link opens on a phone: the address `#z/lat/lon`, a phone
// viewport, the theme as the phone's light or dark setting. One browser, one page per view.
// Prints one JSON line per view: {"out", "ok", "error"?}.
import fs from 'node:fs';
import { chromium } from 'playwright';

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const site = jobs.site.replace(/\/$/, '');
const MAP = 'canvas.maplibregl-canvas';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const v of jobs.views) {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, colorScheme: v.theme === 'dark' ? 'dark' : 'light' });
    try {
      const page = await ctx.newPage();
      await page.goto(`${site}/#${v.z}/${v.lat}/${v.lon}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForSelector(MAP, { state: 'visible', timeout: 90_000 });
      // The page says when its opening view is drawn (window.sheetsReady). If a later page
      // drops that flag, wait for the network to go quiet instead of failing every capture.
      await page.waitForFunction(() => window.sheetsReady === true, null, { timeout: 60_000 })
        .catch(() => page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {}));
      await page.waitForTimeout(1000);
      const box = await page.locator(MAP).first().boundingBox();
      // A square around the centre: the whole width of the phone screen.
      const side = Math.min(box.width, box.height);
      const clip = { x: box.x + (box.width - side) / 2, y: box.y + (box.height - side) / 2, width: side, height: side };
      const tmp = `${v.out}.tmp.jpg`;
      await page.screenshot({ path: tmp, clip, type: 'jpeg', quality: 82 });
      fs.renameSync(tmp, v.out);
      console.log(JSON.stringify({ out: v.out, ok: true }));
    } catch (e) {
      console.log(JSON.stringify({ out: v.out, ok: false, error: e.message.split('\n')[0] }));
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
