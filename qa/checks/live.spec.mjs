// DESIGN.md milestone 3, step 7. Done when: "Live on at any zoom shows
// something live or says why not, and nothing on the pill can be read as the
// time of day." Needs the Live relay on 8789 (npm run dev:live).
//  - Live on at 9.75, 10.3 and 11: trains are on the map, or the page says
//    why not (a status line, or a stale/off state on the button). Fewer
//    trains than expected is not a failure while the page says so.
//  - The pill (the Live button's text) never holds a clock time, from just
//    after turning Live on to about 40 s later.
// The downtown view is a test input.
import { test, expect } from './fixtures.mjs';

const CLOCK = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(am|pm)\b/i;

test('Live shows trains or says why not, and the pill never shows a clock time', async ({ mapPage }, testInfo) => {
  test.setTimeout(180_000);
  const { page } = mapPage;
  await mapPage.goto({ zoom: 9, lat: 39.745, lon: -104.995 }, { settle: 500 });
  const read = () => page.evaluate(() => {
    const m = window.__map, b = document.getElementById('live-button'), s = document.getElementById('status');
    return {
      pill: b.textContent.trim(), cls: b.className, on: b.getAttribute('aria-pressed') === 'true',
      status: s.hidden ? '' : s.textContent.trim(),
      trains: m.querySourceFeatures('vehicles').filter((f) => f.properties.mode === 'rail').length,
    };
  });
  const lines = [];
  const noClock = (s, when) => expect.soft(s.pill, `the pill ${when} can be read as a time of day`).not.toMatch(CLOCK);
  noClock(await read(), 'before Live');
  await page.click('#live-button');
  await page.waitForTimeout(3500);
  for (const z of [9.75, 10.3, 11]) {
    await page.evaluate((z) => window.__map.jumpTo({ zoom: z }), z);
    await page.waitForTimeout(2500);
    const s = await read();
    lines.push(`zoom ${z}: ${s.trains} trains on the map; pill "${s.pill}" [${s.cls}]; status "${s.status}"`);
    expect.soft(s.on, `zoom ${z}: Live is on after tapping the button`).toBe(true);
    expect.soft(s.trains > 0 || !!s.status || /stale|off/.test(s.cls), `zoom ${z}: trains on the map, or the page says why not`).toBe(true);
    noClock(s, `at zoom ${z}`);
  }
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(8000);
    const s = await read();
    seen.add(s.pill);
    noClock(s, `after ${(i + 1) * 8} s`);
  }
  lines.push(`pill texts seen: ${[...seen].map((x) => `"${x}"`).join(', ')}`);
  console.log(lines.map((l) => `${testInfo.project.name} ${l}`).join('\n'));
  await testInfo.attach('summary', { body: lines.join('\n'), contentType: 'text/plain' });
  await testInfo.attach('final', { body: await page.screenshot(), contentType: 'image/png' });
});
