// TEMPORARY diagnostic for issue #31 (letters.spec). Not part of the suite.
// Jumps to the views the check failed on and records, every 150 ms, how many
// frames and idles the map has drawn and which letters are on screen: does
// the page's edge-letter pass run on its own, or only when something forces
// another frame?
import { test, siteData } from './fixtures.mjs';
import { seededViews } from '../lib/views.mjs';

test('does the edge-letter pass run without a repaint', async ({ mapPage }) => {
  test.setTimeout(300_000);
  const views = seededViews(await siteData('routes.geojson'));
  await mapPage.goto(views[0], { settle: 1000 });
  await mapPage.install();
  const { page } = mapPage;
  for (const i of [0, 2, 4, 6, 7, 10]) {
    const v = views[i];
    const log = await page.evaluate(async (v) => {
      const m = window.__map;
      const t0 = performance.now();
      const routes = (layers) => [...new Set(m.queryRenderedFeatures({ layers }).map((f) => f.properties.route))].sort().join(',');
      let idles = 0, renders = 0;
      m.on('idle', () => idles++);
      m.on('render', () => renders++);
      const lines = routes(['rail']);
      m.jumpTo({ center: [v.lon, v.lat], zoom: v.zoom, bearing: 0, pitch: 0 });
      const out = [];
      for (let k = 0; k < 22; k++) {
        await new Promise((r) => setTimeout(r, 150));
        out.push({
          t: Math.round(performance.now() - t0), loaded: m.loaded() ? 1 : 0, idles, renders,
          edge: m.queryRenderedFeatures({ layers: ['rail-edge-letters'] }).length,
          letters: routes(['rail-bullets', 'rail-edge-letters']),
        });
      }
      return { lines, out };
    }, v);
    console.log(`VIEW ${i} z${v.zoom.toFixed(2)} ${v.lat},${v.lon} lines=[${log.lines}]`);
    for (const o of log.out) console.log(`  t=${String(o.t).padStart(5)} loaded=${o.loaded} idles=${o.idles} renders=${o.renders} edge=${o.edge} letters=[${o.letters}]`);
    await page.waitForTimeout(500);
  }
});
