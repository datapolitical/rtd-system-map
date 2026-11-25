// The site's icons (DESIGN.md, "Added to the Home Screen"): the favicon, the Home Screen icon and
// the manifest's icons. Nothing here is drawn by hand: each icon is a square of the map just built,
// exactly as it's drawn, centred on the hub's station (sheets.json `hub`). scripts/poster-build.mjs
// runs it on the site it serves from public/, after the loading pictures and the sharing image, so
// the icon is always a picture of the map that goes live with it.
//
//   node scripts/icons.mjs [site] [--theme dark|light] [--view region|downtown|station]
import { chromium } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTES } from '../public/js/sheets/style.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

export const ICON_THEME = 'dark';
// How far out the square is taken: the rail lines meeting at the hub, the hub and downtown round
// it, or the hub's station close up.
export const VIEWS = { region: 10.5, downtown: 12.5, station: 14.5 };
export const ICON_VIEW = 'downtown';
const SIZE = 256; // CSS pixels; taken at 2x, so 512 px.

/** One square of the map round the hub, 512 px. `scale` < 1 takes a wider square at the same
 *  zoom and shrinks it (maskable icons): the map draws in steps, so zooming out would not. */
async function crop(browser, site, hub, { theme, zoom, scale = 1 }) {
  const side = Math.round(SIZE / scale);
  const page = await browser.newPage({ viewport: { width: side, height: side }, deviceScaleFactor: 2, colorScheme: theme });
  try {
    await page.goto(new URL(`#${zoom}/${hub[1]}/${hub[0]}`, site).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.sheetsReady && window.sheetsMap?.loaded(), null, { timeout: 60_000 });
    // The page's buttons and panels go; the map stays as drawn.
    await page.addStyleTag({ content: 'body > :not(main):not(#map):not(.maplibregl-map), main > :not(#map):not(.maplibregl-map), .maplibregl-control-container { visibility: hidden !important }' });
    await page.evaluate(() => new Promise((ok) => { const map = window.sheetsMap; map.once('idle', ok); map.triggerRepaint(); }));
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: side, height: side } });
    return side === SIZE ? shot : resize(shot, SIZE * 2);
  } finally {
    await page.close();
  }
}

/** A smaller PNG, halving step by step so thin lines don't break up. */
async function resize(png, px) {
  let img = await loadImage(png);
  let w = img.width;
  while (w / 2 >= px) {
    w = Math.round(w / 2);
    const c = createCanvas(w, w);
    c.getContext('2d').drawImage(img, 0, 0, w, w);
    img = await loadImage(c.toBuffer('image/png'));
  }
  const c = createCanvas(px, px);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, px, px);
  return c.toBuffer('image/png');
}

export async function writeIcons(site, { theme = ICON_THEME, view = ICON_VIEW } = {}) {
  const { hub } = JSON.parse(await readFile(path.join(OUT, 'data', 'sheets.json'), 'utf8'));
  if (!Array.isArray(hub)) throw new Error('sheets.json names no hub to take the icon at');
  if (!(view in VIEWS)) throw new Error(`no icon view "${view}" (${Object.keys(VIEWS).join(', ')})`);
  const browser = await chromium.launch();
  let plain, maskable;
  try {
    plain = await crop(browser, site, hub, { theme, zoom: VIEWS[view] });
    // Maskable: a launcher may cut it to a circle 80% wide, so the crop is taken further out.
    maskable = await crop(browser, site, hub, { theme, zoom: VIEWS[view], scale: 0.8 });
  } finally {
    await browser.close();
  }
  await mkdir(path.join(OUT, 'icons'), { recursive: true });
  const files = {
    'icons/favicon-32.png': await resize(plain, 32),
    'icons/apple-touch-icon.png': await resize(plain, 180),
    'icons/icon-192.png': await resize(plain, 192),
    'icons/icon-512.png': plain,
    'icons/icon-maskable-512.png': maskable,
  };
  // Installing it (DESIGN.md, "Added to the Home Screen"): the map's name, opening on the map, on
  // the light theme's ground; the page sets each theme's own bar colour itself (index.html).
  const page = PALETTES.light.ground;
  files['manifest.webmanifest'] = Buffer.from(`${JSON.stringify({
    name: 'RTD system map',
    short_name: 'RTD map',
    description: 'An easy-to-read map of RTD bus and rail service in the Denver region, showing how often each route runs.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: page,
    theme_color: page,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2)}\n`);
  for (const [name, bytes] of Object.entries(files)) await writeFile(path.join(OUT, name), bytes);
  // The hand-drawn SVG favicon this replaced.
  await rm(path.join(OUT, 'favicon.svg'), { force: true });
  console.log(`icons: ${Object.keys(files).join(', ')} (${view}, ${theme} ground)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'https://rtd-system-map.pages.dev/';
  await writeIcons(site, { theme: arg('--theme') ?? ICON_THEME, view: arg('--view') ?? ICON_VIEW });
}
