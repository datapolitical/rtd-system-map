// DESIGN.md milestone 3, step 4. Done when: "twenty random phone views at 10
// to 12 each show a letter for every rail line that crosses them."
//
// The views are test inputs: 40 seeded views drawn from the rail geometry in
// the built data, the first 20 checked, so they are the same every run. A
// line counts as shown if it has a letter inside the part of the screen the
// panels do not cover (`uncovered` from /js/edgeletters.js). Needs 20/20.
import { test, expect, readData } from './fixtures.mjs';

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededViews() {
  const pts = [];
  for (const f of readData('routes.geojson').features.filter((f) => f.properties.mode === 'rail')) {
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const c of parts) for (const p of c) pts.push(p);
  }
  const rand = rng(20261107);
  const views = [];
  for (let i = 0; i < 40; i++) {
    const zoom = [10, 11, 12][i % 3];
    const p = pts[Math.floor(rand() * pts.length)]; // the point is drawn first, then the zoom
    views.push({ zoom: zoom + rand() * 0.9, center: p });
  }
  return views.slice(0, 20);
}

const STUB = 130; // px of a line on screen under which a missing letter is only noted

test('twenty seeded phone views at 10 to 12 each show a letter for every rail line', async ({ mapPage }, testInfo) => {
  test.setTimeout(600_000);
  const { page } = mapPage;
  const views = seededViews();
  await mapPage.goto({ zoom: 10, lat: 39.74, lon: -104.99 }, { settle: 1000 });
  let pass = 0, passBig = 0;
  const notes = [];
  for (const [i, v] of views.entries()) {
    await page.evaluate((v) => window.__map.jumpTo({ center: v.center, zoom: v.zoom }), v);
    await page.waitForTimeout(500);
    await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 60_000 });
    await page.waitForTimeout(3500);
    await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 60_000 });
    const r = await page.evaluate(async () => {
      const m = window.__map;
      const { uncovered } = await import('/js/edgeletters.js');
      const A = uncovered(m);
      const inA = (p) => p.x >= A.x0 && p.x <= A.x1 && p.y >= A.y0 && p.y <= A.y1;
      const reach = {};
      for (const f of m.queryRenderedFeatures({ layers: ['rail'] })) {
        const route = f.properties.route;
        const xs = reach[route]?.xs || [], ys = reach[route]?.ys || [];
        for (const part of f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates) {
          const ps = part.map((c) => m.project(c));
          for (let k = 1; k < ps.length; k++) {
            const n = Math.max(1, Math.ceil(Math.hypot(ps[k].x - ps[k - 1].x, ps[k].y - ps[k - 1].y) / 4));
            for (let s = 0; s <= n; s++) {
              const p = { x: ps[k - 1].x + ((ps[k].x - ps[k - 1].x) * s) / n, y: ps[k - 1].y + ((ps[k].y - ps[k - 1].y) * s) / n };
              if (inA(p)) { xs.push(p.x); ys.push(p.y); }
            }
          }
        }
        reach[route] = { xs, ys };
      }
      const lines = Object.keys(reach).filter((k) => reach[k].xs.length);
      const letters = m.queryRenderedFeatures({ layers: ['rail-bullets', 'rail-edge-letters'] })
        .filter((f) => inA(m.project(f.geometry.coordinates))).map((f) => f.properties.route);
      const span = {};
      for (const k of lines) span[k] = Math.round(Math.hypot(Math.max(...reach[k].xs) - Math.min(...reach[k].xs), Math.max(...reach[k].ys) - Math.min(...reach[k].ys)));
      return { lines: lines.sort(), letters: [...new Set(letters)], span };
    });
    const missing = r.lines.filter((l) => !r.letters.includes(l));
    if (!missing.length) pass++;
    if (!missing.some((l) => r.span[l] >= STUB)) passBig++;
    if (missing.length) {
      notes.push(`view ${i} (zoom ${v.zoom.toFixed(2)}): missing ${missing.map((l) => `${l} (${r.span[l]} px)`).join(', ')}`);
      await testInfo.attach(`view-${i}-missing`, { body: await page.screenshot(), contentType: 'image/png' });
    }
  }
  const summary = `${testInfo.project.name}: ${pass}/${views.length} views show a letter for every line (${passBig}/${views.length} ignoring lines with under ${STUB} px on screen)`;
  console.log(summary + (notes.length ? '\n  ' + notes.join('\n  ') : ''));
  await testInfo.attach('summary', { body: [summary, ...notes].join('\n'), contentType: 'text/plain' });
  expect(pass, summary).toBe(views.length);
});
