// The current map's sharing image: 1200x630 with its interface hidden.
// node scripts/og-image.mjs [site] [#zoom/lat/lon]
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const site = process.argv[2] ?? 'https://rtd-system-map.pages.dev/';
if (process.argv[3] === 'classic') throw new Error('Classic image generation is preserved on classic-archive.');
const view = (process.argv[3] === 'sheets' ? process.argv[4] : process.argv[3]) ?? '#12/39.7500/-105.0085';
const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 315 }, deviceScaleFactor: 2, colorScheme: process.env.OG_THEME ?? 'dark' });
  await page.goto(new URL(view, site).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.sheetsReady && window.sheetsMap?.loaded(), null, { timeout: 60_000 });
  await page.addStyleTag({ content: 'body > :not(main):not(#map):not(.maplibregl-map), main > :not(#map):not(.maplibregl-map) { visibility: hidden !important } .maplibregl-control-container { display: none !important }' });
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
