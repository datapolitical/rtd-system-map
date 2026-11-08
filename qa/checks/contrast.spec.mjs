// Contrast, per theme (DESIGN.md, "Color" and "Accessibility"): what the
// network draws must read against the land beneath it.
//
// The detector (../lib/detect.mjs, `contrastOf`) measures, on each screen:
//  - each rail line and the frequent bus tier against the land 3 px past
//    its casing, from a capture with every symbol hidden: the line's fill
//    or its edge (the light theme's outline), whichever reads more; the
//    median over the line's samples must be at least 3:1 (WCAG 1.4.11,
//    graphics), and a line needs 8 samples to be judged (a sample beside another line's color is not land and is skipped);
//  - each station mark against the ring of pixels 3 px outside it: the
//    95th-percentile pixel inside the mark must reach 3:1; in dark mode a
//    tick's median luma must stay under 70 of 255 (DESIGN.md step 2: dark
//    ticks read dark);
//  - each rail letter's text color against its bullet's fill: 4.5:1 (WCAG
//    1.4.3, text);
//  - the bus tiers, in the order the style lists them, each at least as
//    strong against the land as the one after it (within 0.05).
// Any finding fails. The views are seeded from the rail geometry (the same
// seed as letters.spec.mjs) at 10 to 12, and 14.
import { test, expect, siteData, summary } from './fixtures.mjs';
import { seededViews } from '../lib/views.mjs';

test('lines, marks, letters and bus tiers read in ten seeded views at 10 to 14 @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(900_000);
  const routes = await siteData('routes.geojson');
  const views = [...seededViews(routes, { count: 6 }), ...seededViews(routes, { seed: 14, count: 4, zooms: [14] })];
  await mapPage.goto(views[0], { settle: 500 });
  const fs = await mapPage.scan(views, ['contrast'], { name: 'contrast' });
  await summary(testInfo, 'contrast', fs);
  expect(fs.map((f) => `z${f.zoom} ${f.lat},${f.lon}: ${f.msg}`)).toEqual([]);
});

// The detector fires: one rail line painted the land's color (fill and
// edge), the letters painted their bullets' color, and the bus tiers'
// colors reversed; all restored after.
test('the detector finds seeded low contrast @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(300_000);
  const stations = await siteData('stations.geojson');
  const count = (f) => (f.properties.lines || '').split(' ').length;
  const [lon, lat] = stations.features.filter((f) => f.properties.served).reduce((a, b) => (count(b) > count(a) ? b : a)).geometry.coordinates;
  const v = { zoom: 12, lat, lon };
  await mapPage.goto(v, { settle: 500 });
  await mapPage.jump(v);
  const { page } = mapPage;
  const clean = await mapPage.detect(['contrast']);
  const seeded = await page.evaluate(() => {
    const m = window.__map, q = window.__qa;
    const route = q.lines().find((l) => l.layer === 'rail').route;
    const land = m.getPaintProperty('land', 'background-color');
    const keep = {};
    const set = (id, prop, v) => { if (!m.getLayer(id)) return; keep[`${id}|${prop}`] = m.getPaintProperty(id, prop); m.setPaintProperty(id, prop, v); };
    const only = (id, prop) => ['case', ['==', ['get', 'route'], route], land, m.getPaintProperty(id, prop)];
    set('rail', 'line-color', only('rail', 'line-color'));
    set('rail-edge', 'line-color', only('rail-edge', 'line-color'));
    // A letter in the open part of the screen: its bullet's fill becomes every letter's text color.
    const A = q.area();
    const fill = q.bullets().find((b) => b.x > A.x0 + 10 && b.x < A.x1 - 10 && b.y > A.y0 + 10 && b.y < A.y1 - 10)?.fill;
    if (fill) for (const id of ['rail-bullets', 'rail-edge-letters']) set(id, 'text-color', `rgb(${fill.join(',')})`);
    // The bus tiers: the outputs of the match on `tier`, reversed.
    const flip = (e) => {
      if (!Array.isArray(e)) return e;
      if (e[0] === 'match' && Array.isArray(e[1]) && e[1][1] === 'tier') {
        const outs = []; for (let i = 3; i < e.length - 1; i += 2) outs.push(e[i]);
        outs.reverse();
        const c = [...e]; let k = 0; for (let i = 3; i < e.length - 1; i += 2) c[i] = outs[k++];
        return c;
      }
      return e.map(flip);
    };
    set('bus', 'line-color', flip(m.getPaintProperty('bus', 'line-color')));
    window.__keep = keep;
    return route;
  });
  await page.evaluate(() => window.__qa.settle());
  const got = await mapPage.detect(['contrast'], { bus: true });
  await mapPage.report('seeded-contrast', got.raw, got.findings);
  await page.evaluate(() => { const m = window.__map; for (const [k, v] of Object.entries(window.__keep)) { const [id, prop] = k.split('|'); m.setPaintProperty(id, prop, v); } return window.__qa.settle(); });
  await summary(testInfo, `seeded on line ${seeded}`, got.findings);
  expect(clean.findings.map((f) => f.msg), 'clean before').toEqual([]);
  expect(got.findings.some((f) => f.route === seeded && /against the land/.test(f.msg)), 'the line painted the land').toBe(true);
  expect(got.findings.some((f) => /on its bullet/.test(f.msg)), 'letters painted their bullets').toBe(true);
  expect(got.findings.some((f) => /bus tier/.test(f.msg)), 'bus tiers reversed').toBe(true);
});
