// Line continuity (DESIGN.md, "Shared track" and "Hierarchy": a rail line
// is one unbroken stroke in its own color, eased between slots, never
// stepping sideways). Finds a line that breaks on screen, wherever it is.
//
// For every rail line on screen (and the strongest bus tier from 14), the
// detector (../lib/detect.mjs, `continuity`) projects each piece of
// routes.geojson as the page serves it, moves it sideways by the layer's own
// line-offset at this zoom (the piece's `slot` times the width, evaluated
// from the style), joins the pieces of a route end to end, and walks the
// result in a capture taken with every symbol layer hidden. It flags:
//  - a gap: 4 px or more along the line with no pixel of the line's own
//    color within a third of its width (max channel difference 48);
//  - a cover: the same, where another line's color is there instead;
//  - a jog: the drawn ends of two joined pieces more than 2 px and 0.4 of
//    the width apart sideways.
// Where another line crosses (over 20 degrees apart), where rail runs over a
// bus line, and under the page's own controls, nothing is judged.
// The data check reads routes.geojson alone: pieces of a route whose ends
// miss each other by 0.3 to 30 m, and joined pieces whose slots (signed by
// each piece's direction) differ by more than a sixteenth of a width.
// Any finding fails. Captures are attached with each finding circled.
import { test, expect, siteData, summary as say } from './fixtures.mjs';
import { routeJoins } from '../lib/detect.mjs';
import { seededViews } from '../lib/views.mjs';

test('routes.geojson: joined pieces meet and ease between slots @deep', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-light', 'data only: once');
  const out = routeJoins(await siteData('routes.geojson'));
  await testInfo.attach('summary', { body: out.map((f) => f.msg).join('\n') || 'none', contentType: 'text/plain' });
  console.log(`routes.geojson joins: ${out.length} finding(s)${out.map((f) => '\n  ' + f.msg).join('')}`);
  expect(out.map((f) => f.msg)).toEqual([]);
});

test('rail lines are unbroken in twenty seeded views at 10 to 12 @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(900_000);
  const views = seededViews(await siteData('routes.geojson'));
  await mapPage.goto(views[0], { settle: 500 });
  const fs = await mapPage.scan(views, ['continuity'], { name: 'seeded' });
  await say(testInfo, 'seeded views', fs);
  expect(fs.map((f) => f.msg)).toEqual([]);
});

test('rail and frequent bus lines are unbroken in eight seeded views at 14 @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(900_000);
  const views = seededViews(await siteData('routes.geojson'), { seed: 14, count: 8, zooms: [14] });
  await mapPage.goto(views[0], { settle: 500 });
  const fs = await mapPage.scan(views, ['continuity'], { name: 'z14' });
  await say(testInfo, 'views at 14', fs);
  expect(fs.map((f) => f.msg)).toEqual([]);
});

// The detector fires: a piece dropped from the line layer (its edge and
// casing still drawn) is a gap; a piece moved 8 px sideways is a jog. The
// view is the hub at 12, where most lines are on screen.
test('the detector finds a seeded gap and a seeded jog @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(300_000);
  const stations = await siteData('stations.geojson');
  const count = (f) => (f.properties.lines || '').split(' ').length;
  const hub = stations.features.filter((f) => f.properties.served).reduce((a, b) => (count(b) > count(a) ? b : a));
  const [lon, lat] = hub.geometry.coordinates;
  await mapPage.goto({ zoom: 12, lat, lon }, { settle: 500 });
  await mapPage.jump({ zoom: 12, lat, lon });
  const { page } = mapPage;
  // The rail piece with the longest stretch in the open part of the screen.
  const pick = await page.evaluate(() => {
    const A = window.__qa.area();
    let best = null;
    for (const l of window.__qa.lines()) {
      if (l.layer !== 'rail') continue;
      let len = 0;
      for (let i = 1; i < l.pts.length; i++) {
        const [a, b] = [l.pts[i - 1], l.pts[i]];
        if (a[1] > A.y0 + 20 && a[1] < A.y1 - 20 && a[0] > 20 && a[0] < A.x1 - 20) len += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      if (!best || len > best.len) best = { route: l.route, slot: l.slot, len };
    }
    return best;
  });
  const which = ['all', ['==', ['get', 'route'], pick.route], ['==', ['get', 'slot'], pick.slot]];
  const before = await page.evaluate(() => ({ filter: window.__map.getFilter('rail'), offset: window.__map.getPaintProperty('rail', 'line-offset') }));

  await page.evaluate(([before, which]) => { window.__map.setFilter('rail', ['all', before.filter, ['!', which]]); return window.__qa.settle(); }, [before, which]);
  const gap = await mapPage.detect(['continuity']);
  await mapPage.report('seeded-gap', gap.raw, gap.findings);
  await page.evaluate((before) => { window.__map.setFilter('rail', before.filter); return window.__qa.settle(); }, before);

  // Every output stop of the offset's zoom curve, 8 px more for this piece.
  await page.evaluate(([before, which]) => {
    const e = before.offset, moved = e.map((v, i) => (i > 3 && i % 2 === 0 ? ['case', which, ['+', v, 8], v] : v));
    window.__map.setPaintProperty('rail', 'line-offset', moved);
    return window.__qa.settle();
  }, [before, which]);
  const jog = await mapPage.detect(['continuity']);
  await mapPage.report('seeded-jog', jog.raw, jog.findings);
  await page.evaluate((before) => { window.__map.setPaintProperty('rail', 'line-offset', before.offset); return window.__qa.settle(); }, before);
  const clean = await mapPage.detect(['continuity']);

  await say(testInfo, `seeded on line ${pick.route} slot ${pick.slot}`, [...gap.findings, ...jog.findings]);
  expect(gap.findings.filter((f) => f.kind.startsWith('line-') && f.kind !== 'line-jog' && f.route === pick.route).length, 'a gap where the piece was dropped').toBeGreaterThan(0);
  expect(jog.findings.filter((f) => f.kind === 'line-jog' && f.route === pick.route).length, 'a jog where the piece was moved').toBeGreaterThan(0);
  expect(clean.findings.map((f) => f.msg), 'nothing once restored').toEqual([]);
});

// Regression fixture for the break seen on production in dark mode (a gap
// and a sideways jog in one line at a piece boundary). The place is read
// from this test's title, so the detector itself knows no place; the zooms
// span where the break was seen.
test('regression: no break near 39.70045, -104.99003 (I-25 / Broadway) from 12 to 16 in quarter zooms @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(900_000);
  const [lat, lon] = testInfo.title.match(/(-?\d+\.\d+), (-?\d+\.\d+)/).slice(1).map(Number);
  const views = [];
  for (let z = 12; z <= 16; z += 0.25) views.push({ zoom: z, lat, lon });
  await mapPage.goto(views[0], { settle: 500 });
  const fs = await mapPage.scan(views, ['continuity'], { name: 'regression' });
  await say(testInfo, `regression at ${lat}, ${lon}`, fs);
  expect(fs.map((f) => `z${f.zoom}: ${f.msg}`)).toEqual([]);
});
