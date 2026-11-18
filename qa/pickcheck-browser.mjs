// The page's half of qa/pickcheck.mjs: for every bus and rail route, a pick link opened on a phone
// (chromium, 393×760, both themes), and what only the page shows counted per sheet:
//   unframed  the route's bounds not wholly in the map left clear above the card, where they fit
//             on the sheet the links open on (`toobig` counts the routes that don't)
//   clipped   informational: names cropped by the screen edge or page controls
//             (allowed on the fixed printed sheet; not a fault on its own)
//   nocard    no card, or a card without RTD's name for the route
// node qa/pickcheck-browser.mjs <base> [--json] [--route 28]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const base = args[0];
const json = args.includes('--json');
const only = args.includes('--route') ? args[args.indexOf('--route') + 1] : null;
const themes = (process.env.THEMES ?? 'light,dark').split(',');

const browser = await chromium.launch();
const out = {};
const worst = [];
for (const theme of themes) {
  const page = await browser.newPage({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 1, colorScheme: theme });
  await page.goto(`${base}/?theme=${theme}#10/39.74/-104.99`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.sheetsReady, null, { timeout: 60000 });
  const routes = await page.evaluate(async () => (await (await fetch('/data/directory.json')).json()).routes.map((r) => ({ mode: r.mode, route: r.route, bbox: r.bbox })));
  for (const r of routes) {
    if (only && r.route !== only) continue;
    if (!r.bbox) continue;
    const res = await page.evaluate(async ({ mode, route, bbox }) => {
      const map = window.sheetsMap;
      const idle = () => new Promise((ok) => { const t = setTimeout(ok, 4000); map.once('idle', () => { clearTimeout(t); ok(); }); });
      location.hash = `#10/39.74/-104.99/${mode}/${route}`;
      // The card fills once the directory answers, and the frame follows it.
      for (let i = 0; i < 40 && !document.querySelector('#card.route b')?.textContent; i++) await new Promise((ok) => setTimeout(ok, 50));
      await idle();
      // Wait for the drawing to settle before measuring its framing.
      const frames = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      await frames();
      await new Promise((ok) => { const t = setTimeout(ok, 800); map.once('idle', () => { clearTimeout(t); ok(); }); });
      await frames();
      const card = document.querySelector('#card');
      const name = card.hidden ? '' : card.querySelector('b')?.textContent ?? '';
      const view = map.getContainer().getBoundingClientRect();
      const cardTop = card.hidden ? view.bottom : card.getBoundingClientRect().top;
      // The sheets as the page has them (#152 added a wider sheet 0 the links here don't open on).
      const { SHEETS, OPENING } = await import('/js/sheets/style.js');
      const zooms = SHEETS.map((x) => x.zoom);
      const z = map.getZoom();
      const sheet = SHEETS[zooms.reduce((b, x, i) => (Math.abs(x - z) < Math.abs(zooms[b] - z) ? i : b), 0)].id;
      const [w, s, e, n] = bbox[0].length ? bbox[0] : bbox;
      const a = map.project([w, n]);
      const b = map.project([e, s]);
      const tol = 2;
      const inside = a.x >= -tol && a.y >= -tol && b.x <= view.width + tol && b.y <= cardTop - view.top + tol;
      // Would it fit on the sheet these links open on? Its size there against the clear area.
      const scale = 2 ** (zooms[OPENING] - z);
      const fits = (b.x - a.x) * scale <= view.width - 32 && (b.y - a.y) * scale <= cardTop - view.top - 28;
      // Names drawn now, their boxes from the build's `bx`, against the edge and our controls.
      const blocks = ['#card', '#steps', '#credit'].map((q) => document.querySelector(q)).filter((el) => el && !el.hidden && el.offsetParent !== null).map((el) => el.getBoundingClientRect());
      const drawn = map.queryRenderedFeatures({ layers: [`name-${sheet}`] });
      const cut = new Set();
      for (const f of drawn) {
        const { nid, bx, text } = f.properties;
        if (!bx) continue;
        const [x0, y0, x1, y1] = String(bx).split(',').map(Number);
        const p = map.project(f.geometry.coordinates);
        const box = { left: p.x + x0 + view.left, top: p.y + y0 + view.top, right: p.x + x1 + view.left, bottom: p.y + y1 + view.top };
        // Wholly off the screen shows nothing, so cuts nothing.
        if (box.right < view.left || box.left > view.right || box.bottom < view.top || box.top > view.bottom) continue;
        const edged = box.left < view.left || box.right > view.right || box.top < view.top || box.bottom > view.bottom;
        const under = blocks.some((k) => box.left < k.right && box.right > k.left && box.top < k.bottom && box.bottom > k.top);
        if (edged || under) cut.add(`${nid} ${String(text).replace(/\n/g, ' / ')}`);
      }
      return { sheet, name, inside, fits, clipped: [...cut], hash: location.hash };
    }, r);
    const key = res.sheet;
    const sum = (out[key] ??= { routes: 0, unframed: 0, toobig: 0, clipped: 0, nocard: 0 });
    sum.routes++;
    if (!res.fits) sum.toobig++;
    else if (!res.inside) sum.unframed++;
    sum.clipped += res.clipped.length;
    if (!res.name) sum.nocard++;
    if ((res.fits && !res.inside) || !res.name) worst.push({ theme, ...r, bbox: undefined, ...res });
  }
  await page.close();
}
await browser.close();
if (json) console.log(JSON.stringify({ sheets: out, worst }, null, 1));
else {
  console.log('framed sheet  routes  unframed  toobig  clipped  nocard  (both themes)');
  for (const [id, s] of Object.entries(out)) console.log(`  ${id}    ${String(s.routes).padStart(4)}   ${s.unframed}   ${s.toobig}   ${s.clipped}   ${s.nocard}`);
  for (const w of worst.slice(0, 15)) console.log(`  ${w.theme} ${w.mode} ${w.route} s${w.sheet} ${!w.name ? 'no card ' : ''}${w.fits && !w.inside ? 'unframed ' : ''}${w.clipped.join('; ')}`);
}
