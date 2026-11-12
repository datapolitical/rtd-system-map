// Station marks that overlap or crowd (DESIGN.md, "Stations", and milestone
// 2 step 2: "no two station marks overlap"). Every station, at 9.75 to 14.
//
// Each zoom is tiled so that every station lands in the open part of some
// phone screen (the tiles come from stations.geojson and meta.json's bounds;
// the open part from the page's uncovered()). On each screen the detector
// (../lib/detect.mjs, `marks`) takes every drawn station mark (ticks, dots,
// capsules, hub rings, Park-n-Ride symbols and unserved marks, at the size,
// rotation, anchor and offset the style gives them, skipping marks faded
// below 5%), one box per station, and tests every pair:
//  - overlap: the turned boxes intersect (separating-axis test);
//  - crowded: centres nearer than the longer box's long side.
// Below 11, where step 2 is done, an overlap or crowding fails. From 11 they
// are reported, not failed: the Auraria West and Empower Field capsules are
// listed as still open there. Each screen with a finding gets a capture.
import { test, expect, siteData, summary } from './fixtures.mjs';
import { tiles } from '../lib/views.mjs';

const ZOOMS = [9.75, 10, 10.5, 11, 12, 13, 14];
const STRICT_BELOW = 11;

test('no station marks overlap or crowd at 9.75 to 14, every station @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(3_600_000);
  const [stations, meta] = [await siteData('stations.geojson'), await siteData('meta.json')];
  const points = stations.features.map((f) => f.geometry.coordinates);
  const [lon, lat] = points[0];
  await mapPage.goto({ zoom: ZOOMS[0], lat, lon }, { settle: 500 });
  const area = await mapPage.uncovered();
  const screen = await mapPage.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const views = ZOOMS.flatMap((zoom) => tiles({ bounds: meta.bounds.stations, zoom, screen, area, points }).tiles);
  console.log(`${views.length} screens: ${ZOOMS.map((z) => `${z}: ${views.filter((v) => v.zoom === z).length}`).join(', ')}`);
  const fs = await mapPage.scan(views, ['marks'], { name: 'marks' });
  await summary(testInfo, 'marks', fs);
  const strict = fs.filter((f) => f.zoom < STRICT_BELOW);
  expect(strict.map((f) => `z${f.zoom}: ${f.msg}`), `overlap or crowding below ${STRICT_BELOW}`).toEqual([]);
});

// The detector fires: a copy of the busiest station, moved a third of a
// mark's length along the screen, overlaps the original.
test('the detector finds a seeded overlap @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(300_000);
  const stations = await siteData('stations.geojson');
  const count = (f) => (f.properties.lines || '').split(' ').length;
  const hub = stations.features.filter((f) => f.properties.served).reduce((a, b) => (count(b) > count(a) ? b : a));
  const [lon, lat] = hub.geometry.coordinates;
  const v = { zoom: 10.5, lat, lon };
  await mapPage.goto(v, { settle: 500 });
  await mapPage.jump(v);
  const { page } = mapPage;
  // The source's data as the page set it (its own copy, or the file).
  const original = await page.evaluate(async () => {
    const src = window.__map.getSource('stations');
    const d = (await src.getData?.()) ?? src._data?.geojson ?? src._data ?? src.serialize().data;
    return typeof d === 'string' ? fetch(d).then((r) => r.json()) : d;
  });
  // The drawn station mark nearest the screen's centre (not a hub ring or a
  // Park-n-Ride), its station copied with a new id 4 px east of itself.
  await page.evaluate((d) => {
    const m = window.__map, c = m.project(m.getCenter());
    const k = window.__qa.marks().filter((k) => k.key.startsWith('stn:')).sort((a, b) => Math.hypot(a.px - c.x, a.py - c.y) - Math.hypot(b.px - c.x, b.py - c.y))[0];
    const s = d.features.find((f) => `stn:${f.properties.id}` === k.key);
    const p = m.project(s.geometry.coordinates), ll = m.unproject([p.x + 4, p.y]);
    const copy = { ...s, id: undefined, properties: { ...s.properties, id: `${s.properties.id}-copy`, label: `${s.properties.label} (copy)` }, geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] } };
    window.__seeded = s.properties.label;
    m.getSource('stations').setData({ ...d, features: [...d.features, copy] });
    return window.__qa.settle();
  }, original);
  const seeded = await page.evaluate(() => window.__seeded);
  const got = await mapPage.detect(['marks']);
  await mapPage.report('seeded-overlap', got.raw, got.findings);
  await page.evaluate((d) => { window.__map.getSource('stations').setData(d); return window.__qa.settle(); }, original);
  await summary(testInfo, `seeded copy of ${seeded}`, got.findings);
  expect(got.findings.some((f) => f.kind === 'mark-overlap' && f.pair.some((n) => n.includes(seeded))), `an overlap at ${seeded}`).toBe(true);
});
