// Why do route 121 and FREE never place?
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:8831/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
await page.waitForTimeout(1000);

const out = await page.evaluate(async () => {
  const m = window.__map;
  const log = {};
  log.layout = {
    placement: m.getLayoutProperty('bus-tags-region', 'symbol-placement'),
    padding: m.getLayoutProperty('bus-tags-region', 'text-padding'),
    allowOverlap: m.getLayoutProperty('bus-tags-region', 'text-allow-overlap'),
    size: m.getLayoutProperty('bus-tags-region', 'text-size'),
  };
  const read = () => [...new Set(m.queryRenderedFeatures({ layers: ['bus-tags-region'] }).map((f) => String(f.properties.route)))].sort();
  const settle = () => new Promise((r) => { let d = false; const t = setTimeout(() => { if (!d) r(); }, 2500); m.once('idle', () => { d = true; clearTimeout(t); r(); }); m.triggerRepaint(); });
  log.base = read();
  m.setLayoutProperty('bus-tags-region', 'text-allow-overlap', true);
  await settle(); await new Promise((r) => setTimeout(r, 600));
  log.allowOverlap = read();
  m.setLayoutProperty('bus-tags-region', 'text-allow-overlap', false);

  // Project each label point; is it on canvas?
  const feats = m.querySourceFeatures('labels').filter((f) => f.properties.kind === 'bus');
  log.projected = ['121', 'FREE', '17', '73', '0'].map((r) => {
    const f = feats.find((x) => x.properties.route === r);
    if (!f) return [r, 'not-in-source-tiles'];
    const p = m.project(f.geometry.coordinates);
    return [r, Math.round(p.x), Math.round(p.y), document.querySelector('#map')?.clientWidth];
  });

  // Center on 121 and FREE separately.
  for (const r of ['121', 'FREE']) {
    const f = m.querySourceFeatures('labels').find((x) => x.properties.route === r);
    m.jumpTo({ center: f.geometry.coordinates, zoom: 10.2 });
    await settle(); await new Promise((r2) => setTimeout(r2, 900));
    log['at_' + r] = read();
    m.jumpTo({ center: [-104.9659, 39.7472], zoom: 8.752 });
    await settle(); await new Promise((r2) => setTimeout(r2, 900));
  }
  return log;
});
console.log(
  JSON.stringify(
    {
      base: out.base,
      allowOverlap: out.allowOverlap,
      projected: out.projected,
      at121: out.at_121,
      atFREE: out.at_FREE,
      layout: out.layout,
    },
    null,
    0,
  ),
);
await browser.close();
