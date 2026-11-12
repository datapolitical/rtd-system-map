// Makes the picture a link to the site shows in messages and social posts:
// a 600x315 view at twice the pixels (1200x630, the size Open Graph previews
// use), light theme, with the interface hidden. `sheets` is the front page
// (public/og.png); `classic` is the classic map (public/classic/og.png),
// whose route letters are hidden too: at this size they stack at Union
// Station (#114), and the lines' colours say enough.
//
//   node scripts/og-image.mjs [site] [sheets|classic] [#zoom/lat/lon]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const site = process.argv[2] ?? 'https://rtd-system-map.pages.dev/';
const classic = process.argv[3] === 'classic';
const view = process.argv[4] ?? (classic ? '#11/39.7400/-104.9700' : '#12/39.7500/-104.9965');
const out = fileURLToPath(new URL(classic ? '../public/classic/og.png' : '../public/og.png', import.meta.url));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 315 }, deviceScaleFactor: 2, colorScheme: 'light' });
  if (classic) {
    await page.route('**/js/main.js', async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace('loadWhenNeeded(map);', 'window.__map=map;loadWhenNeeded(map);');
      await route.fulfill({ response: res, body });
    });
  }
  await page.goto(new URL(`${classic ? 'classic/' : ''}${view}`, site).href, { waitUntil: 'networkidle', timeout: 60_000 });
  if (classic) {
    await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 60_000 });
    await page.evaluate(() => {
      const m = window.__map;
      for (const l of m.getStyle().layers) if (/bullets|edge-letters|line-signs/.test(l.id)) m.setLayoutProperty(l.id, 'visibility', 'none');
    });
    await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 30_000 });
  }
  await page.addStyleTag({ content: 'body > *:not(#map):not(.maplibregl-map) { visibility: hidden !important } .maplibregl-control-container { display: none !important }' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
