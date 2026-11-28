import assert from 'node:assert/strict';

// Exercise the real shared-street picker, range input and theme button.
export async function checkBusControls(page) {
  await page.evaluate(() => { window.zoomSetPick(null); window.zoomMap.jumpTo({ zoom: 13.37, center: window.zoomBundle.frames[0].labels.features.find((f) => f.properties.kind === 'name').geometry.coordinates }); });
  await page.waitForFunction(() => window.zoomMap.isStyleLoaded() && window.zoomMap.areTilesLoaded() && !window.zoomMap.isMoving(), null, { timeout: 30000 });
  const point = await page.evaluate(() => {
    const m = window.zoomMap;
    for (let y = 150; y < innerHeight - 260; y += 8) for (let x = 24; x < innerWidth - 24; x += 8) {
      const hits = m.queryRenderedFeatures([[x - 7, y - 7], [x + 7, y + 7]]);
      if (hits.some((f) => ['rail', 'letter'].includes(f.properties.kind) && f.properties.route)) continue;
      const bus = hits.find((f) => f.properties.kind === 'bus' && String(f.properties.routes).includes(','));
      if (bus) return [x, y];
    }
    return null;
  });
  assert.ok(point, 'a shared bus street can be tapped clear of rail');
  await page.touchscreen.tap(...point);
  const options = page.locator('#route-options button');
  assert.ok(await options.count() >= 2, 'the reader chooses among shared-street routes');
  const route = await options.first().textContent();
  await options.first().click();
  assert.deepEqual(await page.evaluate(() => window.zoomPick), { mode: 'bus', route });
  const before = await page.evaluate(() => window.zoomMap.getZoom());
  await page.locator('#zoom').focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction((from) => window.zoomMap.getZoom() > from + 0.005, before);
  const after = await page.evaluate(() => window.zoomMap.getZoom());
  assert.ok(Math.abs(after - before - 0.01) < 1e-6);
  await page.locator('#theme').click();
  await page.waitForFunction(() => window.zoomMap.isStyleLoaded());
  assert.deepEqual(await page.evaluate(() => window.zoomPick), { mode: 'bus', route });
  await page.reload();
  await page.waitForFunction(() => window.zoomReady && window.zoomMap.isStyleLoaded(), null, { timeout: 60000 });
  assert.deepEqual(await page.evaluate(() => window.zoomPick), { mode: 'bus', route });
  assert.ok(Math.abs(await page.evaluate(() => window.zoomMap.getZoom()) - after) < 1e-6);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.zoomPick), null);
  assert.deepEqual(await page.evaluate(() => window.zoomErrors), []);
  return { route, restoredZoom: after, changedTheme: true, sharedStreetChooser: true };
}
