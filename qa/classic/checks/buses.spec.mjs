// DESIGN.md milestone 3, step 5. Done when: "at 14 downtown in light, every
// bus arrow is countable in a screenshot", the arrow's ring reads on a bus
// line in both themes, and (dark) the bus tiers read against land and road.
//
// Reported, not failed: how many bus arrows are placed (they depend on the
// live feed). Failed: the median ring-against-line contrast under 3:1 (the
// WCAG floor for graphics; measured 13.5 light, 10.3 dark); and in dark any
// tier under 3:1 against the land, the frequent tier under 6:1 against a
// road, or another tier under 2.5:1 against a road (measured 9.2, 5.6, 3.7
// on land and 6.7, 4.1, 2.7 on a road). The original script printed these
// numbers without limits; the limits sit just under them. The downtown view
// is a test input.
import { test, expect, contrast } from './fixtures.mjs';

const VIEW = { zoom: 14, lat: 39.747, lon: -104.995 };
const GEOM = { r: 5.5, stroke: 5 }; // main.js: arrow body radius 5.5; ring is BUS_RING * 2 wide
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const median = (cols) => [0, 1, 2].map((k) => cols.map((c) => c[k]).sort((a, b) => a - b)[Math.floor(cols.length / 2)]);

test('bus arrows at 14 have a ring that reads on the line', async ({ mapPage }, testInfo) => {
  const { page } = mapPage;
  await mapPage.goto(VIEW, { live: true });
  await page.waitForFunction(() => window.__map.querySourceFeatures('vehicles').length > 0, null, { timeout: 40_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const { px, dpr } = await mapPage.capture('downtown-14');
  const land = await page.evaluate(() => window.__map.getPaintProperty('land', 'background-color'));
  const arrows = await page.evaluate(() => {
    const m = window.__map, L = m.style._layers['vehicles-bus'];
    if (!L) return [];
    return m.queryRenderedFeatures({ layers: ['vehicles-bus'] }).map((f) => {
      const size = L.layout.get('icon-size').evaluate({ type: 1, properties: f.properties }, {}, { zoom: m.getZoom() });
      const p = m.project(f.geometry.coordinates);
      return { x: p.x, y: p.y, bearing: f.properties.bearing ?? 0, size };
    }).filter((a) => a.x > 0 && a.y > 0 && a.x < innerWidth && a.y < innerHeight && document.elementFromPoint(a.x, a.y)?.tagName === 'CANVAS');
  });
  const ratios = [];
  for (const a of arrows) {
    const k = a.size * dpr;
    const ringR = (GEOM.r + GEOM.stroke / 2 - Math.min(0.5, GEOM.stroke / 4)) * k; // inside the ring's outer half
    const aroundR = (GEOM.r + GEOM.stroke / 2) * k + 2.5 * dpr;
    const angles = Array.from({ length: 24 }, (_, i) => i * 15);
    const away = angles.filter((d) => Math.abs((((d - a.bearing) % 360) + 540) % 360 - 180) > 70); // not the tip
    const pt = (R, d) => [a.x * dpr + R * Math.sin((d * Math.PI) / 180), a.y * dpr - R * Math.cos((d * Math.PI) / 180)];
    const ring = away.map((d) => px.at(pt(ringR, d))).filter(Boolean);
    if (ring.length < 6) continue; // too near the screen edge
    const rc = median(ring);
    const around = angles.map((d) => px.at(pt(aroundR, d))).filter(Boolean);
    const landRGB = [1, 3, 5].map((i) => parseInt(land.slice(i, i + 2), 16));
    const line = around.reduce((p, c) => (contrast(c, landRGB) > contrast(p, landRGB) ? c : p)); // the bus line
    ratios.push({ ring: hex(rc), line: hex(line), ratio: contrast(rc, line) });
  }
  const sorted = ratios.map((r) => r.ratio).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const summary = `${testInfo.project.name}: ${arrows.length} bus arrows placed at 14` + (sorted.length ? `; ring against line min ${sorted[0].toFixed(1)}, median ${med.toFixed(1)}:1 (ring ${ratios[0].ring}, line ${ratios[0].line})` : ' (none in the feed right now)');
  console.log(summary);
  await testInfo.attach('summary', { body: summary, contentType: 'text/plain' });
  test.skip(!sorted.length, 'no bus arrows in the live feed right now, so no ring to measure');
  expect(med, summary).toBeGreaterThanOrEqual(3);
});

test('dark bus tiers read against land and road', async ({ mapPage }, testInfo) => {
  test.skip(mapPage.theme !== 'dark', 'dark mode only');
  const { page } = mapPage;
  await mapPage.goto(VIEW);
  const c = await page.evaluate(() => {
    const m = window.__map, cols = [], expr = m.getPaintProperty(m.getLayer('street') ? 'street' : 'bus', 'line-color');
    for (let i = 2; i < expr.length - 1; i += 2) if (!cols.includes(expr[i + 1])) cols.push(expr[i + 1]);
    const road = m.getPaintProperty('road-street', 'line-color');
    return { land: m.getPaintProperty('land', 'background-color'), tiers: cols.slice(0, 3), road: Array.isArray(road) ? road.filter((x) => typeof x === 'string' && x[0] === '#').pop() : road };
  });
  const rows = c.tiers.map((col) => ({ col, land: contrast(col, c.land), road: contrast(col, c.road) }));
  const summary = `dark tiers (frequent, next, slowest) against land ${c.land}: ${rows.map((r) => r.land.toFixed(1)).join(', ')}; against a road ${c.road}: ${rows.map((r) => r.road.toFixed(1)).join(', ')}`;
  console.log(summary);
  await testInfo.attach('summary', { body: summary, contentType: 'text/plain' });
  expect(rows.length, 'bus tiers read from the map style').toBeGreaterThanOrEqual(3);
  rows.forEach((r, i) => {
    expect.soft(r.land, `tier ${i + 1} ${r.col} against land`).toBeGreaterThanOrEqual(3);
    expect.soft(r.road, `tier ${i + 1} ${r.col} against a road`).toBeGreaterThanOrEqual(i === 0 ? 6 : 2.5);
  });
});
