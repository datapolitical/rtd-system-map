// Makes the pictures the front page shows while its map loads (DESIGN.md, "Quality floor"):
// the opening view in each theme, for a phone and for a wider screen, taken from the site
// itself so they are the map the page then draws. The page centres the picture on the
// screen, as the map is centred, so one picture fits any screen up to its size. The view
// they show goes in index.html (#poster's data-view), so a link to another view skips them,
// and so do the map's bounds (data-bounds): a screen wider than the bounds allow round that
// view has the map shifted in from the edge, and the page shifts the picture with it.
//
//   node scripts/poster.mjs [site]
//
// .github/workflows/poster.yml runs this after a change to how the sheets look, and daily.
import { chromium } from 'playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const site = process.argv[2] ?? 'https://rtd-system-map.pages.dev/';
const OUT = fileURLToPath(new URL('../public/poster/', import.meta.url));
const PAGE = fileURLToPath(new URL('../public/index.html', import.meta.url));
// In CSS pixels. A phone screen is used up to 600 wide (index.html's <source> media); a wider screen
// past the picture's edge shows the ground colour round it. The wide one stays inside the
// map's bounds, so it shows the view unshifted.
const SIZES = [
  { name: 'phone', width: 480, height: 960, scales: [2] },
  { name: 'wide', width: 1800, height: 1200, scales: [1, 2] },
];
const QUALITY = 60;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const views = new Set();
const bounds = new Set();
try {
  for (const theme of ['light', 'dark']) {
    for (const size of SIZES) {
      for (const scale of size.scales) {
        const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: scale, colorScheme: theme });
        await page.goto(site, { timeout: 60_000 });
        await page.waitForFunction(() => window.sheetsReady && window.sheetsMap.loaded(), null, { timeout: 90_000 });
        // The map alone: no buttons, credit, card, or an earlier picture over it.
        await page.addStyleTag({ content: 'body > *:not(#map) { display: none !important }' });
        await page.waitForTimeout(500);
        const [view, limits] = await page.evaluate(() => {
          const m = window.sheetsMap;
          const { lat, lng } = m.getCenter();
          return [`${+m.getZoom().toFixed(2)}/${lat.toFixed(4)}/${lng.toFixed(4)}`, m.getMaxBounds().toArray().flat().map((v) => +v.toFixed(4)).join(',')];
        });
        views.add(view);
        bounds.add(limits);
        const png = await page.screenshot();
        const image = await loadImage(png);
        const canvas = createCanvas(image.width, image.height);
        canvas.getContext('2d').drawImage(image, 0, 0);
        const file = `${size.name}-${theme}${size.scales.length > 1 ? `-${scale}x` : ''}.webp`;
        const webp = await canvas.encode('webp', QUALITY);
        await writeFile(OUT + file, webp);
        console.log(`wrote public/poster/${file} (${Math.round(webp.length / 1024)} KB)`);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (views.size !== 1) throw new Error(`the pictures show different views: ${[...views].join(', ')}`);
if (bounds.size !== 1) throw new Error(`the map's bounds differ between pictures: ${[...bounds].join(' | ')}`);
const [view] = views;
const [limits] = bounds;
const html = await readFile(PAGE, 'utf8');
if (!/<div id="poster" data-view="[^"]*" data-bounds="[^"]*">/.test(html)) throw new Error('index.html has no <div id="poster" data-view data-bounds> to write the view in');
await writeFile(PAGE, html.replace(/<div id="poster" data-view="[^"]*" data-bounds="[^"]*">/, `<div id="poster" data-view="${view}" data-bounds="${limits}">`));
console.log(`the view: ${view}; the bounds: ${limits}`);
