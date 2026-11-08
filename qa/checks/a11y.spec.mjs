// Accessibility of the interface (DESIGN.md, "Accessibility"): axe-core
// (@axe-core/playwright) with the WCAG 2.0 and 2.1 A and AA rules, in four
// states: the map alone, the Key open, a panel open (from the Lines
// button), and the search box focused with a query typed. The map's
// <canvas> is exempt: what it draws is checked by the pixel detectors, and
// axe can't see into it. Any violation fails; each is listed with its rule,
// impact and the elements it found.
//
// The detector fires on a seeded fault (the second test): the search box's
// accessible name removed.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';

const VIEW = { zoom: 12, lat: 39.7392, lon: -104.9903 }; // a test input: any view over the network
const scan = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#map canvas').analyze();
const list = (r) => r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('; ')}`);

const STATES = {
  closed: async () => {},
  'Key open': async (page) => {
    await page.waitForFunction(() => document.querySelector('#legend-symbols li'), null, { timeout: 20_000 });
    if (!(await page.evaluate(() => document.getElementById('legend').open))) await page.click('#legend summary');
  },
  'panel open': async (page) => {
    await page.click('#lines-button');
    await page.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
    await page.waitForTimeout(600);
  },
  'search focused': async (page) => {
    await page.click('#search');
    await page.keyboard.type('union', { delay: 40 });
    await page.waitForTimeout(800);
  },
};

for (const [name, open] of Object.entries(STATES)) {
  test(`no WCAG 2.1 AA violations: ${name}`, async ({ mapPage }, testInfo) => {
    await mapPage.goto(VIEW);
    await open(mapPage.page);
    const r = await scan(mapPage.page);
    const v = list(r);
    console.log(`${testInfo.project.name} ${name}: ${r.violations.length} violations, ${r.passes.length} rules pass` + v.map((s) => '\n  ' + s).join(''));
    await testInfo.attach('axe', { body: JSON.stringify(r.violations, null, 1), contentType: 'application/json' });
    expect(v).toEqual([]);
  });
}

test('the detector finds a seeded unnamed search box', async ({ mapPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-light', 'once');
  await mapPage.goto(VIEW);
  await mapPage.page.evaluate(() => { const s = document.getElementById('search'); s.removeAttribute('aria-label'); s.removeAttribute('placeholder'); });
  const r = await scan(mapPage.page);
  expect(r.violations.some((v) => v.nodes.some((n) => n.target.join(' ').includes('#search'))), list(r).join('\n')).toBe(true);
});
