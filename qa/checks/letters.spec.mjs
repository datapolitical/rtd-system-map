// DESIGN.md milestone 3, step 4. Done when: "twenty random phone views at 10
// to 12 each show a letter for every rail line that crosses them."
//
// The views are test inputs: 40 seeded views drawn from the rail geometry in
// the built data, the first 20 checked, so they are the same every run
// (../lib/views.mjs, seededViews). A line counts as shown if it has a letter
// inside the part of the screen the panels do not cover (`uncovered` from
// /js/edgeletters.js). The rule lives in ../lib (inpage.js `letters`,
// detect.mjs `letters`) so the sweep applies it to any view: a line in the
// open part of the screen with no letter there is a finding, a note if the
// line spans under 130 px. Needs 20/20.
import { test, expect, siteData, summary } from './fixtures.mjs';
import { seededViews } from '../lib/views.mjs';

const count = (fs) => fs.filter((f) => f.kind === 'letter-missing' || f.kind === 'note');

test('twenty seeded phone views at 10 to 12 each show a letter for every rail line', async ({ mapPage }, testInfo) => {
  test.setTimeout(600_000);
  const views = seededViews(await siteData('routes.geojson'));
  await mapPage.goto(views[0], { settle: 1000 });
  let pass = 0, passBig = 0;
  const all = [];
  for (const [i, v] of views.entries()) {
    await mapPage.jump(v);
    const { raw, findings } = await mapPage.detect(['letters']);
    if (!findings.length) pass++;
    if (!findings.some((f) => f.kind === 'letter-missing')) passBig++;
    await mapPage.report(`view-${i}-missing`, raw, findings);
    all.push(...findings.map((f) => ({ ...f, msg: `view ${i}: ${f.msg}` })));
  }
  const s = `${views.length} views: ${pass} show a letter for every line (${passBig} ignoring lines under 130 px on screen)`;
  await summary(testInfo, s, all);
  expect(pass, s).toBe(views.length);
});

// Any view, not only the seeded twenty: another seed, at 10 to 12.
test('twenty more views from another seed at 10 to 12 @deep', async ({ mapPage }, testInfo) => {
  test.setTimeout(600_000);
  const views = seededViews(await siteData('routes.geojson'), { seed: 7 });
  await mapPage.goto(views[0], { settle: 1000 });
  const fs = await mapPage.scan(views, ['letters'], { name: 'seed7' });
  await summary(testInfo, 'seed 7', fs);
  expect(fs.filter((f) => f.kind === 'letter-missing').map((f) => `z${f.zoom} ${f.lat},${f.lon}: ${f.msg}`)).toEqual([]);
});

// The detector fires: with the edge-letter layer and the letters along the
// lines hidden, every line on screen is unnamed.
test('the detector finds seeded missing letters @deep', async ({ mapPage }, testInfo) => {
  const [v] = seededViews(await siteData('routes.geojson'), { count: 2, zooms: [11] });
  await mapPage.goto(v, { settle: 1000 });
  await mapPage.jump(v);
  const { page } = mapPage;
  const clean = await mapPage.detect(['letters']);
  await page.evaluate(() => { for (const id of ['rail-bullets', 'rail-edge-letters']) window.__map.setLayoutProperty(id, 'visibility', 'none'); return window.__qa.settle(); });
  const got = await mapPage.detect(['letters']);
  await mapPage.report('seeded-missing', got.raw, got.findings);
  await page.evaluate(() => { for (const id of ['rail-bullets', 'rail-edge-letters']) window.__map.setLayoutProperty(id, 'visibility', 'visible'); return window.__qa.settle(); });
  await summary(testInfo, 'seeded missing', got.findings);
  expect(count(clean.findings).map((f) => f.msg), 'clean before').toEqual([]);
  expect(count(got.findings).length, 'a line unnamed once its letters are hidden').toBeGreaterThan(0);
  expect(count(got.findings).length).toBe(got.raw.letters.lines.length);
});
