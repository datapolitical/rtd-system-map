// The whole-district sheet (#152) in a browser: what only the page shows. Each line printed is a
// check with what it measured; a fault is marked FAIL and the run exits 1.
//
//   framed     stepping out shows the whole network: the sheet's frame (sheets.json) inside the
//              screen above the controls, on phones from 360 px wide up and on a desktop
//   names      every station name the build set on sheet 0 is drawn (none dropped by MapLibre)
//   towns      every town named lies inside RTD's district (sheets.json `district`)
//   back       the + button returns to where the reader was before stepping out
//   from       stepping out from far corners of the network frames it the same way
//   link       a link to a view on sheet 0 keeps its centre; its address reads back the same view
//   gestures   a wheel scroll out and a pinch out reach sheet 0, framed
//   pick       a tap on a rail line and on a bus street opens the card; picking a route draws it
//   speech     the sheet buttons' and dots' labels, and what a screen reader hears on a step
//   errors     no page or console errors
//
// node qa/wholecheck.mjs <base> [outDir]   (captures, both themes, go to outDir; default qa/.scratch/whole)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { stubAnalytics } from './lib/analytics.mjs';

const base = process.argv[2];
const out = process.argv[3] ?? 'qa/.scratch/whole';
fs.mkdirSync(out, { recursive: true });
let failed = 0;
const report = (ok, what, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const sheets = await (await fetch(`${base}/data/sheets.json`)).json();
const sheet0 = await (await fetch(`${base}/data/sheet-0.geojson`)).json();
const builtNames = sheet0.features.filter((f) => f.properties.shape === 'name' && !f.properties.alt).map((f) => f.properties.name).sort();

const inside = ([x, y], ring) => {
  let at = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [ring[i], ring[j]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) at = !at;
  }
  return at;
};
const inDistrict = (p) => sheets.district.coordinates.some(([outer, ...holes]) => inside(p, outer) && !holes.some((h) => inside(p, h)));

async function open(viewport, theme, hash = '', extra = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme, ...extra });
  const page = await context.newPage();
  // Cloudflare's analytics beacon on a preview host logs errors that are not the map's (#107).
  await stubAnalytics(page);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text().split('\n')[0]); });
  await page.goto(`${base}/?theme=${theme}${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.sheetsReady, null, { timeout: 60000 });
  await settled(page);
  return page;
}
// The map at rest, its tiles drawn, and the page's own step finished.
async function settled(page) {
  await page.waitForTimeout(450);
  await page.evaluate(() => new Promise((ok) => {
    const map = window.sheetsMap;
    const t = setTimeout(ok, 8000);
    const check = () => (!map.isMoving() && map.areTilesLoaded() ? (clearTimeout(t), ok()) : map.once('idle', check));
    check();
  }));
  await page.waitForTimeout(250);
}
const view = (page) => page.evaluate(() => {
  const map = window.sheetsMap;
  const c = map.getCenter();
  return { zoom: map.getZoom(), center: [c.lng, c.lat], hash: location.hash, label: document.querySelector('#sheets').getAttribute('aria-label'), said: document.querySelector('#say').textContent, out: document.querySelector('#out').disabled, in: document.querySelector('#in').disabled };
});
// How far the frame reaches past the screen (above the sheet buttons), in CSS px per side: 0 is inside.
const spill = (page) => page.evaluate((frame) => {
  const map = window.sheetsMap;
  const box = map.getContainer().getBoundingClientRect();
  const steps = document.querySelector('#steps').getBoundingClientRect();
  const [w, s, e, n] = frame;
  const a = map.project([w, n]);
  const b = map.project([e, s]);
  return { left: Math.max(0, -a.x), top: Math.max(0, -a.y), right: Math.max(0, b.x - box.width), bottom: Math.max(0, b.y - (steps.top - box.top)) };
}, sheets.frame);
const spillText = (s) => Object.entries(s).filter(([, v]) => v > 0.5).map(([k, v]) => `${k} ${v.toFixed(0)} px`).join(', ') || 'inside';
const near = (a, b, tol = 1e-4) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
const rendered = (page, layer) => page.evaluate((layer) => {
  const map = window.sheetsMap;
  if (!map.getLayer(layer)) return [];
  return map.queryRenderedFeatures({ layers: [layer] }).map((f) => ({ name: f.properties.name, at: f.geometry.coordinates, alt: f.properties.alt }));
}, layer);

const phones = [
  { name: 'android-360', viewport: { width: 360, height: 780 } },
  { name: 'iphone-se', viewport: { width: 375, height: 667 } },
  { name: 'iphone-15', viewport: { width: 393, height: 852 } },
  { name: 'iphone-17-pro', viewport: { width: 402, height: 874 } },
  { name: 'iphone-pro-max', viewport: { width: 440, height: 956 } },
  { name: 'landscape', viewport: { width: 874, height: 402 } },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, desktop: true },
];

// --- Each screen, both themes: step out, look, step back -------------------------------
for (const d of phones) {
  for (const theme of ['light', 'dark']) {
    const page = await open(d.viewport, theme, '', d.desktop ? {} : { isMobile: true, hasTouch: true });
    const start = await view(page);
    const limits = () => page.evaluate(() => window.sheetsMap.getMaxBounds().toArray().flat().map((v) => +v.toFixed(5)).join(','));
    const openedWith = await limits();
    const tag = `${d.name} ${theme}`;
    report(start.label === 'Sheet 2 of 5' && Math.abs(start.zoom - 10) < 0.01 && !start.out, `${tag}: opens on sheet 1 at zoom 10, minus live`, `${start.label}, z${start.zoom.toFixed(2)}`);
    await page.click('#out');
    await settled(page);
    const v = await view(page);
    report(Math.abs(v.zoom - 8) < 0.01 && v.label === 'Sheet 1 of 5' && v.out && !v.in, `${tag}: minus reaches the whole district`, `${v.label}, z${v.zoom.toFixed(2)}, minus ${v.out ? 'off' : 'on'}`);
    report(v.said === 'Sheet 1 of 5', `${tag}: a screen reader hears the step`, JSON.stringify(v.said));
    const s = await spill(page);
    // On a screen narrower than the network the frame is centred: equal spill each side is the best there is.
    const fits = Object.values(s).every((x) => x <= 0.5);
    const even = (Math.abs(s.left - s.right) <= 2 && s.top <= 0.5 && s.bottom <= 0.5) || (Math.abs(s.top - s.bottom) <= 2 && s.left <= 0.5 && s.right <= 0.5);
    // A screen narrower than the network (360-393 px) or shorter (a phone on its side) may spill evenly.
    report(fits || ((d.viewport.width < 400 || d.viewport.height < 450) && even), `${tag}: the whole network is on screen`, spillText(s));
    const names = [...new Set((await rendered(page, 'name-0')).filter((f) => !f.alt).map((f) => f.name))].sort();
    const missing = builtNames.filter((n) => !names.includes(n));
    report(!missing.length, `${tag}: every name the build set is drawn`, missing.length ? `missing ${missing.join(', ')}` : names.join(', '));
    const towns = await rendered(page, 'place-0');
    const outside = towns.filter((t) => !inDistrict(t.at));
    report(!outside.length && towns.length > 0, `${tag}: towns only from RTD's district`, outside.length ? `outside: ${outside.map((t) => t.name).join(', ')}` : towns.map((t) => t.name).join(', '));
    await page.screenshot({ path: `${out}/${d.name}-${theme}.png` });
    await page.click('#in');
    await settled(page);
    const backAgain = await view(page);
    report(near(backAgain.center, start.center) && Math.abs(backAgain.zoom - 10) < 0.01, `${tag}: plus returns to where it was`, `${backAgain.center.map((x) => x.toFixed(4))} vs ${start.center.map((x) => x.toFixed(4))}`);
    // The whole district's extra room to pan goes with it: the other sheets keep the bounds the loading picture assumes.
    report(await limits() === openedWith, `${tag}: back on sheet 1 the map's bounds are as it opened`, await limits());
    report(!page.errors.length, `${tag}: no errors`, page.errors.slice(0, 3).join(' | '));
    await page.context().close();
  }
}

// --- Stepping out from far corners of the network, on every closer sheet ------------------
const corners = [
  ['Boulder, sheet 3', '#14/40.0150/-105.2705'],
  ['Longmont, sheet 2', '#12/40.1672/-105.1019'],
  ['the airport, sheet 4', '#16/39.8491/-104.6737'],
  ['Castle Rock side, sheet 2', '#12/39.5250/-104.8740'],
  ['Golden, sheet 1', '#10/39.7550/-105.2210'],
];
for (const [where, hash] of corners) {
  const page = await open({ width: 402, height: 874 }, 'light', hash, { isMobile: true, hasTouch: true });
  let steps = 0;
  let before = null;
  while (!(await page.$eval('#out', (b) => b.disabled)) && steps < 6) {
    before = (await view(page)).center;
    await page.click('#out');
    await settled(page);
    steps++;
  }
  const s = await spill(page);
  report(Object.values(s).every((x) => x <= 0.5), `from ${where}: ${steps} steps out, the whole network on screen`, spillText(s));
  const lng = (await view(page)).center[0];
  report(Math.abs(lng - (sheets.frame[0] + sheets.frame[2]) / 2) < 1e-3, `from ${where}: centred on the network east and west`, lng.toFixed(4));
  await page.click('#in');
  await settled(page);
  report(near((await view(page)).center, before), `from ${where}: plus goes back to the sheet-1 view it left`);
  report(!page.errors.length, `from ${where}: no errors`, page.errors.slice(0, 3).join(' | '));
  await page.context().close();
}

// --- A link to the whole district, and the address it writes --------------------------------
{
  const page = await open({ width: 402, height: 874 }, 'dark', '#8/39.9000/-105.2000', { isMobile: true, hasTouch: true });
  const v = await view(page);
  report(Math.abs(v.zoom - 8) < 0.01 && near(v.center, [-105.2, 39.9], 1e-3) && v.label === 'Sheet 1 of 5', 'a link to sheet 0 opens there and keeps its centre', `${v.label} z${v.zoom} ${v.center.map((x) => x.toFixed(4))}`);
  await page.goto(`${base}/?theme=dark`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.sheetsReady, null, { timeout: 60000 });
  await settled(page);
  await page.click('#out');
  await settled(page);
  const stepped = await view(page);
  report(/^#8\//.test(stepped.hash), 'stepping out writes the whole district into the address', stepped.hash);
  await page.goto(`${base}/?theme=dark${stepped.hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.sheetsReady, null, { timeout: 60000 });
  await settled(page);
  const again = await view(page);
  report(near(again.center, stepped.center, 1e-3) && Math.abs(again.zoom - 8) < 0.01, 'that address opens the same view', `${again.hash}`);
  // An address edited in place to the whole district keeps the centre it names.
  await page.evaluate(() => { location.hash = '#8/39.6000/-104.9000'; });
  await settled(page);
  const edited = await view(page);
  report(near(edited.center, [-104.9, 39.6], 1e-3), 'an address changed in place keeps the centre it names', edited.center.map((x) => x.toFixed(4)).join(','));
  report(!page.errors.length, 'link: no errors', page.errors.slice(0, 3).join(' | '));
  await page.context().close();
}

// --- A wheel and a pinch ----------------------------------------------------------------------
{
  const page = await open({ width: 1280, height: 800 }, 'light', '#12/39.6500/-104.9900');
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(900, 300);
    await page.mouse.wheel(0, 240);
    await settled(page);
  }
  const v = await view(page);
  const s = await spill(page);
  report(Math.abs(v.zoom - 8) < 0.01 && Object.values(s).every((x) => x <= 0.5), 'two wheel scrolls out from sheet 2 reach sheet 0, framed', `z${v.zoom.toFixed(2)}, ${spillText(s)}`);
  report(!page.errors.length, 'wheel: no errors', page.errors.slice(0, 3).join(' | '));
  await page.context().close();
}
{
  const page = await open({ width: 402, height: 874 }, 'light', '', { isMobile: true, hasTouch: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', { x: 300, y: 500, scaleFactor: 0.6, relativeSpeed: 600, gestureSourceType: 'touch' });
  await settled(page);
  const v = await view(page);
  const s = await spill(page);
  report(Math.abs(v.zoom - 8) < 0.01 && Object.values(s).every((x) => x <= 0.5), 'a pinch out from the opening sheet reaches sheet 0, framed', `z${v.zoom.toFixed(2)}, ${spillText(s)}`);
  report(!page.errors.length, 'pinch: no errors', page.errors.slice(0, 3).join(' | '));
  await page.context().close();
}

// --- A tap on sheet 0, then a pick ------------------------------------------------------------
for (const theme of ['light', 'dark']) {
  const page = await open({ width: 402, height: 874 }, theme, '', { isMobile: true, hasTouch: true });
  await page.click('#out');
  await settled(page);
  // A spot on a line that the map draws there and nothing else does: found from what is rendered.
  const spot = (kind) => page.evaluate((kind) => {
    const map = window.sheetsMap;
    const { width, height } = map.getContainer().getBoundingClientRect();
    for (let y = 120; y < height - 140; y += 6) for (let x = 40; x < width - 40; x += 6) {
      const hits = map.queryRenderedFeatures([[x - 3, y - 3], [x + 3, y + 3]]).filter((f) => f.source === 'sheet-0');
      const kinds = new Set(hits.map((f) => f.properties.kind));
      // One rail line comes back once from each of its layers (rim, casing, line): count its routes.
      if (kinds.size === 1 && kinds.has(kind) && (kind !== 'rail' || new Set(hits.map((f) => f.properties.route)).size === 1)) return { x, y, what: hits[0].properties.route ?? hits[0].properties.routes };
    }
    return null;
  }, kind);
  for (const kind of ['rail', 'bus']) {
    const at = await spot(kind);
    if (!at) { report(false, `${theme}: a ${kind} line to tap on sheet 0`, 'none found'); continue; }
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(500);
    const card = await page.evaluate(() => {
      const c = document.querySelector('#card');
      return { open: !c.hidden, title: c.querySelector('#card-title')?.textContent ?? '', routes: [...c.querySelectorAll('button[data-route]')].map((b) => `${b.dataset.mode}:${b.dataset.route}`) };
    });
    report(card.open && card.routes.length > 0, `${theme}: a tap on ${kind} ${at.what} opens its card`, `${card.title}: ${card.routes.join(' ')}`);
    if (!card.open || !card.routes.length) continue;
    await page.click('#card button[data-route]');
    await settled(page);
    const pick = await page.evaluate(() => window.sheetsPick);
    const drawn = await page.evaluate((mode) => window.sheetsMap.queryRenderedFeatures({ layers: [mode === 'bus' ? 'pick-bus-0' : 'rail-0'] }).length, pick?.mode);
    report(Boolean(pick) && drawn > 0, `${theme}: picking ${pick?.mode} ${pick?.route} draws it on sheet 0`, `${drawn} pieces drawn, address ${await page.evaluate(() => location.hash)}`);
    await page.screenshot({ path: `${out}/pick-${kind}-${theme}.png` });
    await page.click('#card button.close').catch(() => {});
    await page.evaluate(() => window.sheetsPick && document.querySelector('#card button[data-route][aria-pressed="true"]')?.click());
    await settled(page);
  }
  report(!page.errors.length, `pick ${theme}: no errors`, page.errors.slice(0, 3).join(' | '));
  await page.context().close();
}

// --- The keyboard -----------------------------------------------------------------------------
{
  const page = await open({ width: 1280, height: 800 }, 'dark');
  await page.focus('#out');
  await page.keyboard.press('Enter');
  await settled(page);
  const v = await view(page);
  report(Math.abs(v.zoom - 8) < 0.01, 'Enter on the minus button steps out', `z${v.zoom.toFixed(2)}`);
  const labels = await page.evaluate(() => ['#out', '#in', '#sheets'].map((s) => document.querySelector(s).getAttribute('aria-label')));
  report(labels.join('|') === 'Wider sheet|Closer sheet|Sheet 1 of 5', 'the buttons and dots say what they are', labels.join(' | '));
  await page.context().close();
}

await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
