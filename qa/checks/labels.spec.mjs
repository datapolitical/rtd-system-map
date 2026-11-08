// Labels (DESIGN.md, "Stations" and milestone 3 step 3: a station's name
// sits with its mark; nothing the network draws is placed where a panel
// covers it). Every station at 10 to 12; those near the busiest at 13, 14.
//
// Each zoom is tiled so every station lands in the open part of some phone
// screen (tiles from stations.geojson and meta.json, the open part from the
// page's uncovered()). On each screen the detector (../lib/detect.mjs,
// `labels`) reads every box MapLibre placed this frame, with its layers and
// feature, and flags:
//  - far: a station name whose box is more than max(25 px, 1.4 ems on each
//    axis, i.e. 1.4 * sqrt(2) * text-size) from its own station;
//  - under a card: a network label (a station name, an edge letter, a line
//    sign; not the letters the build places along the lines) whose centre
//    is in the top or bottom band uncovered() leaves out and more than 30%
//    of whose box is under a control;
//  - overlap: a network label's box intersecting another placed box by more
//    than 2 px on both axes, or a station mark's turned box (shrunk a pixel
//    for its soft edge).
// Any finding fails, except overlaps with the basemap's own labels and a
// name in a band whose own station is in the band too (it has nowhere else
// to go), which are reported only. Above 12 only the screens within about
// 6 km of the busiest station are checked; the sweep covers the rest.
// Captures are attached with each finding circled.
import { test, expect, siteData, summary } from './fixtures.mjs';
import { tiles } from '../lib/views.mjs';

const ZOOMS = [10, 11, 12, 13, 14];
const DOWNTOWN_ONLY_ABOVE = 12;

test('station names stay near their marks, clear of cards and of each other, at 10 to 14 @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(3_600_000);
  const [stations, meta] = [await siteData('stations.geojson'), await siteData('meta.json')];
  const points = stations.features.map((f) => f.geometry.coordinates);
  const count = (f) => (f.properties.lines || '').split(' ').length;
  const hub = stations.features.filter((f) => f.properties.served).reduce((a, b) => (count(b) > count(a) ? b : a)).geometry.coordinates;
  await mapPage.goto({ zoom: ZOOMS[0], lat: hub[1], lon: hub[0] }, { settle: 500 });
  const area = await mapPage.uncovered();
  const screen = await mapPage.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const near = (v) => v.zoom <= DOWNTOWN_ONLY_ABOVE || Math.hypot((v.lon - hub[0]) * 0.77, v.lat - hub[1]) < 0.06;
  const views = ZOOMS.flatMap((zoom) => tiles({ bounds: meta.bounds.stations, zoom, screen, area, points }).tiles).filter(near);
  console.log(`${views.length} screens: ${ZOOMS.map((z) => `${z}: ${views.filter((v) => v.zoom === z).length}`).join(', ')}`);
  const fs = await mapPage.scan(views, ['labels'], { name: 'labels' });
  await summary(testInfo, 'labels', fs);
  const basemapOnly = (f) => f.kind === 'label-overlap' && f.basemap;
  expect(fs.filter((f) => f.kind !== 'note' && !basemapOnly(f)).map((f) => `z${f.zoom} ${f.lat},${f.lon}: ${f.msg}`)).toEqual([]);
});

// The detector fires: the station-name layer's text pushed 3 ems below its
// anchor (far, and onto other things), restored after.
test('the detector finds a seeded far name @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(300_000);
  const stations = await siteData('stations.geojson');
  const count = (f) => (f.properties.lines || '').split(' ').length;
  const [lon, lat] = stations.features.filter((f) => f.properties.served).reduce((a, b) => (count(b) > count(a) ? b : a)).geometry.coordinates;
  const v = { zoom: 12.5, lat, lon };
  await mapPage.goto(v, { settle: 500 });
  await mapPage.jump(v);
  const { page } = mapPage;
  const clean = await mapPage.detect(['labels']);
  const before = await page.evaluate(() => {
    const m = window.__map, b = m.getLayoutProperty('station-labels', 'text-variable-anchor-offset');
    m.setLayoutProperty('station-labels', 'text-variable-anchor-offset', ['top', [0, 3]]);
    m.setLayoutProperty('station-labels', 'text-allow-overlap', true);
    return b;
  });
  await page.evaluate(() => window.__qa.settle());
  const got = await mapPage.detect(['labels']);
  await mapPage.report('seeded-far', got.raw, got.findings);
  await page.evaluate((b) => {
    const m = window.__map;
    m.setLayoutProperty('station-labels', 'text-variable-anchor-offset', b);
    m.setLayoutProperty('station-labels', 'text-allow-overlap', false);
    return window.__qa.settle();
  }, before);
  await summary(testInfo, 'seeded far names', got.findings);
  expect(got.findings.filter((f) => f.kind === 'label-far').length, 'far names once the offset is pushed').toBeGreaterThan(0);
  expect(clean.findings.filter((f) => f.kind === 'label-far').map((f) => f.msg), 'none before').toEqual([]);
});
