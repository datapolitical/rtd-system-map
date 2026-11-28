import { test, expect } from './sheets-fixture.mjs';

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`the loading sketch holds whole lines before the map starts (${reducedMotion})`, async ({ sheetPage }) => {
    const { page, theme } = sheetPage;
    await page.emulateMedia({ reducedMotion });
    // Hold startup independently of the connection speed. The sketch must finish on its own.
    let release;
    const canStart = new Promise((resolve) => { release = resolve; });
    await page.route('**/data/meta.json', async (route) => {
      await canStart;
      await route.continue();
    });

    try {
      await page.goto(`/?theme=${theme}`, { waitUntil: 'commit' });
      const poster = page.locator('#poster');
      const run = poster.locator('#sketch path:not(.base)').first();
      await expect(poster.getByRole('status')).toHaveText('Loading…');
      await expect(run).toHaveCSS('animation-name', reducedMotion === 'reduce' ? 'none' : 'sketch-ink');
      await expect(run).toHaveCSS('stroke-dasharray', 'none');
      await expect(run).toHaveCSS('opacity', '0.9');
      await expect(poster.locator('#loading span')).toHaveCSS('animation-name', 'none');
      await expect.poll(() => poster.locator('#sketch').evaluate((sketch) => sketch.getAnimations({ subtree: true }).length)).toBe(0);
    } finally {
      release();
    }

    await sheetPage.settled();
    await expect(page.locator('#poster')).toHaveCount(0);
  });
}

test('a fast start settles the sketch before the map creates its canvas', async ({ sheetPage }) => {
  const { page, theme } = sheetPage;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release;
  const canStart = new Promise((resolve) => { release = resolve; });
  await page.route('**/data/meta.json', async (route) => {
    await canStart;
    await route.continue();
  });
  await page.addInitScript(() => {
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild = function (child) {
      if (child instanceof HTMLCanvasElement && this.closest?.('#map')) {
        const poster = document.querySelector('#poster');
        window.sketchSettledAtCanvas = poster.classList.contains('settled') &&
          poster.querySelector('#sketch').getAnimations({ subtree: true }).length === 0;
        Node.prototype.appendChild = append;
      }
      return append.call(this, child);
    };
  });

  try {
    await page.goto(`/?theme=${theme}`, { waitUntil: 'commit' });
    const sketch = page.locator('#sketch');
    await sketch.waitFor();
    // Guarantee the early-start case even on a slow CI machine.
    await page.addStyleTag({ content: '#sketch path { animation-duration: 120s !important; }' });
    expect(await sketch.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
  } finally {
    release();
  }

  await sheetPage.settled();
  expect(await page.evaluate(() => window.sketchSettledAtCanvas)).toBe(true);
});
