// TEMPORARY diagnostic for issue #31 (letters.spec). Not part of the suite.
// Runs the same seeded views the check does and prints what the map has drawn,
// when, so the failure can be told from the check.
import { test } from './fixtures.mjs';
import { seededViews } from '../lib/views.mjs';
import { siteData } from './fixtures.mjs';

test('diagnose the seeded views', async ({ mapPage }, testInfo) => {
  test.setTimeout(600_000);
  const views = (await seededViews(await siteData('routes.geojson'))).slice(0, 20);
  await mapPage.goto(views[0], { settle: 1000 });
  const { page } = mapPage;
  for (const [i, v] of views.entries()) {
    await mapPage.jump(v);
    const now = await page.evaluate(async () => {
      const m = window.__map;
      const mod = await import('/js/edgeletters.js');
      const src = m.getSource('rail-edge-letters');
      const lyr = m.getLayer('rail-edge-letters');
      const routes = (layer) => [...new Set(m.queryRenderedFeatures({ layers: [layer] }).map((f) => f.properties.route))];
      const placed = mod.placeEdgeLetters(m).map((f) => f.properties.route);
      return {
        zoom: +m.getZoom().toFixed(2), loaded: m.loaded(), tiles: m.areTilesLoaded(),
        area: mod.uncovered(m),
        edgeLayer: !!lyr, edgeMinzoom: lyr?.minzoom, edgeVisibility: lyr?.layout?.visibility,
        edgeSourceLoaded: m.isSourceLoaded('rail-edge-letters'),
        edgeSourceFeatures: src?._data?.features?.length ?? null,
        drawn: { bullets: routes('rail-bullets'), edge: routes('rail-edge-letters') },
        wouldPlace: placed,
      };
    });
    const { raw, findings } = await mapPage.detect(['letters']);
    const later = await page.evaluate(() => window.__qa.settle(1500).then(() => window.__qa.letters()));
    console.log(`VIEW ${i} z${v.zoom.toFixed(2)} ${v.lat},${v.lon}`);
    console.log(`  now: loaded=${now.loaded} tiles=${now.tiles} edgeLayer=${now.edgeLayer} minzoom=${now.edgeMinzoom} vis=${now.edgeVisibility} srcLoaded=${now.edgeSourceLoaded} srcFeatures=${now.edgeSourceFeatures}`);
    console.log(`  area: ${JSON.stringify(now.area)}`);
    console.log(`  drawn now: bullets=[${now.drawn.bullets}] edge=[${now.drawn.edge}] wouldPlace=[${now.wouldPlace}]`);
    console.log(`  detector: lines=[${raw.letters.lines}] letters=[${raw.letters.letters}]`);
    console.log(`  later: letters=[${later.letters}]`);
    console.log(`  findings: ${findings.map((f) => `${f.kind}:${f.route}(${f.span})`).join('; ') || 'none'}`);
  }
  await testInfo.attach('done', { body: 'diagnostic', contentType: 'text/plain' });
});
