// Accessibility pass: axe, tab order, focus visibility, and the 320px toast.
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const AXE = readFileSync('/home/chris/code/rtd-system-map/qa/node_modules/axe-core/axe.min.js', 'utf8');
const OUT = '/home/chris/.hermes/cache/scratch/qa-vision';
const browser = await chromium.launch();
const report = {};

// ---------- phone: axe + tab order + focus ----------
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8831/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
await page.waitForTimeout(1200);

await page.addScriptTag({ content: AXE });
const axe = await page.evaluate(async () => {
  const r = await window.axe.run(document, { resultTypes: ['violations'] });
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 6) }));
});
report.axe = axe;

// Tab order from the top of the document.
await page.evaluate(() => document.body.focus());
const order = [];
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab');
  const el = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    const cs = getComputedStyle(a);
    return {
      tag: a.tagName,
      cls: (a.className || '').toString().slice(0, 40),
      id: a.id,
      label: a.getAttribute('aria-label') || a.textContent?.trim().slice(0, 30) || '',
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 40),
      rect: (() => { const r = a.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
    };
  });
  order.push(el);
}
report.tabOrder = order;

// Focus each control deliberately and screenshot it.
const shots = [];
for (const [name, sel] of [
  ['canvas', '.maplibregl-canvas'],
  ['geolocate', '.maplibregl-ctrl-geolocate'],
  ['key', '#legend > summary'],
]) {
  const el = await page.$(sel);
  if (!el) { shots.push([name, 'not-found']); continue; }
  await el.focus();
  await page.waitForTimeout(300);
  const info = await page.evaluate((s) => {
    const e = document.querySelector(s);
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { outline: `${cs.outlineStyle} ${cs.outlineWidth}`, shadow: cs.boxShadow.slice(0, 60), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], parentOverflow: e.parentElement ? getComputedStyle(e.parentElement).overflow : null };
  }, sel);
  const clip = { x: Math.max(0, info.rect[0] - 8), y: Math.max(0, info.rect[1] - 8), width: Math.min(390 - Math.max(0, info.rect[0] - 8), info.rect[2] + 16), height: Math.min(844 - Math.max(0, info.rect[1] - 8), info.rect[3] + 16) };
  await page.screenshot({ path: `${OUT}/focus-phone-${name}.png`, clip });
  shots.push([name, info]);
}
report.focusPhone = shots;

// ---------- 320px: toast vs Key ----------
const small = await browser.newPage({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 });
await small.goto('http://localhost:8831/', { waitUntil: 'load' });
await small.waitForTimeout(250); // catch the toast while it is up
const overlap = await small.evaluate(() => {
  const t = document.getElementById('status').getBoundingClientRect();
  const k = document.querySelector('#legend > summary').getBoundingClientRect();
  const ix = Math.max(0, Math.min(t.right, k.right) - Math.max(t.left, k.left));
  const iy = Math.max(0, Math.min(t.bottom, k.bottom) - Math.max(t.top, k.top));
  return {
    toast: [Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)],
    key: [Math.round(k.x), Math.round(k.y), Math.round(k.width), Math.round(k.height)],
    overlap: [Math.round(ix), Math.round(iy)],
    toastHidden: document.getElementById('status').hidden,
    toastText: document.getElementById('status').textContent,
  };
});
report.toast320 = overlap;
await small.screenshot({ path: `${OUT}/toast-320.png` });

// ---------- desktop: zoom button focus ----------
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await desk.goto('http://localhost:8831/', { waitUntil: 'load' });
await desk.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
await desk.waitForTimeout(1000);
const zoomBtn = await desk.$('.maplibregl-ctrl-zoom-in button');
report.zoomButton = zoomBtn ? 'found' : 'none';
if (zoomBtn) {
  await zoomBtn.focus();
  await desk.waitForTimeout(300);
  report.zoomFocus = await desk.evaluate(() => {
    const e = document.querySelector('.maplibregl-ctrl-zoom-in button');
    const cs = getComputedStyle(e);
    const p = e.closest('.maplibregl-ctrl-group');
    return { outline: `${cs.outlineStyle} ${cs.outlineWidth}`, shadow: cs.boxShadow.slice(0, 60), groupOverflow: p ? getComputedStyle(p).overflow : null, groupRadius: p ? getComputedStyle(p).borderRadius : null };
  });
  const r = await zoomBtn.boundingBox();
  if (r) await desk.screenshot({ path: `${OUT}/focus-desktop-zoom.png`, clip: { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 } });
}

console.log(JSON.stringify(report, null, 1));
await browser.close();
