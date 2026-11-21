// DESIGN.md milestone 3, step 6. Done when: "no symbol in the Key is a second
// drawing of anything." At 8.5, 10, 10.6, 12 and 14 (Live on, near Union
// Station), in both themes:
//  - every image in the Key is an image the map has, from a layer the map
//    has, at that layer's icon-size at this zoom;
//  - each Key image, as the page renders it, matches the same image drawn by
//    the map (a probe symbol layer using the real layer's own icon-size) over
//    the land: mean difference under 8 of 255 per pixel and at least 90% of
//    pixels within 24. Measured 0.4 to 7.4 and 91 to 99.5% (the rest is edge
//    resampling); the original script printed these without limits, so the
//    limits sit just outside them.
// The view is a test input. The Key and map crops are attached to each test.
import { test, expect, pixels } from './fixtures.mjs';

const VIEW = { lat: 39.75491, lon: -105.00348 };
const MAX_MEAN = 8, MIN_WITHIN = 90;
const layerOf = (m) =>
  m.includes('+') ? null // an area drawn from paint, compared by its own layers elsewhere
  : m.startsWith('dot-') ? 'stations-dot' : m.startsWith('station-') ? 'stations' : m.startsWith('hub-') ? 'stations-hub'
  : m === 'parking' || m === 'transit-center' ? 'facilities' : m === 'vehicle-bus' ? 'vehicles-bus' : m.startsWith('vehicle-') ? 'vehicles-rail'
  : m === 'stations-unserved' || m === 'stops' ? m : null;

// Slide the Key image over the map crop and keep the best fit (the two are
// not pixel aligned).
function compare(key, map) {
  let best = null;
  for (let dy = 0; dy <= map.h - key.h; dy++) for (let dx = 0; dx <= map.w - key.w; dx++) {
    let sum = 0, near = 0;
    for (let y = 0; y < key.h; y++) for (let x = 0; x < key.w; x++) {
      const i = (y * key.w + x) * 4, j = ((y + dy) * map.w + x + dx) * 4;
      const d = Math.max(Math.abs(key.d[i] - map.d[j]), Math.abs(key.d[i + 1] - map.d[j + 1]), Math.abs(key.d[i + 2] - map.d[j + 2]));
      sum += d; if (d <= 24) near++;
    }
    const mean = sum / (key.w * key.h);
    if (!best || mean < best.mean) best = { mean, within: (near / (key.w * key.h)) * 100 };
  }
  return best;
}

for (const zoom of [8.5, 10, 10.6, 12, 14]) {
  test(`the Key matches the map at ${zoom}`, async ({ mapPage }, testInfo) => {
    test.setTimeout(240_000);
    const { page } = mapPage;
    await mapPage.goto({ zoom, ...VIEW }, { live: true, settle: 1500 });
    await page.waitForFunction(() => document.querySelector('#legend-symbols li'), null, { timeout: 20_000 });
    if (!(await page.evaluate(() => document.getElementById('legend').open))) await page.click('#legend summary');
    await page.waitForTimeout(400);
    const marks = await page.evaluate(() => [...document.querySelectorAll('#legend img[data-mark]')].map((el) => ({ mark: el.dataset.mark, size: Number(el.dataset.size) })));
    console.log(`${testInfo.project.name} ${zoom}: Key images ${marks.map((m) => `${m.mark}@${m.size}`).join(' ') || 'none'}`);
    await mapPage.capture('key-open');

    // Ids and sizes against the map's layers.
    for (const m of marks) {
      const layerId = layerOf(m.mark);
      if (!layerId) continue; // an area drawn from paint, not an image
      const info = await page.evaluate(({ mark, layerId }) => {
        const map = window.__map, L = map.style._layers[layerId];
        let size = null;
        try { size = L?.layout.get('icon-size')?.evaluate({ type: 1, properties: {} }, {}); } catch {}
        return { symbol: L?.type === 'symbol', hasImage: !!map.getImage(mark), hasLayer: !!L, size: typeof size === 'number' ? size : null };
      }, { mark: m.mark, layerId });
      expect.soft(info.hasLayer, `${m.mark}: a layer on the map draws it`).toBe(true);
      if (!info.symbol) continue; // a circle layer: compared by pixels below
      if (info.size !== null) expect.soft(Math.abs(info.size - m.size), `${m.mark}: Key size ${m.size}, layer size ${info.size}`).toBeLessThan(0.01);
    }

    // Pixels: each Key image on a land-colored backdrop, then the map's own.
    const land = await page.evaluate(() => window.__map.getPaintProperty('land', 'background-color'));
    await page.addStyleTag({ content: '.legend-more{display:none!important}' });
    const imgs = await page.$$('#legend img[data-mark]');
    const shots = [];
    for (const el of imgs) {
      const box = await el.evaluate((e, land) => {
        const back = document.createElement('div');
        back.id = 'cmp-back';
        back.style.cssText = `position:fixed;left:0;top:0;width:200px;height:120px;background:${land};z-index:2147483647`;
        const copy = e.cloneNode(true);
        copy.style.cssText = 'position:absolute;left:40px;top:40px;display:block';
        back.append(copy);
        document.body.append(back);
        const r = copy.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }, land);
      await page.waitForTimeout(50);
      shots.push({ shot: await page.screenshot({ clip: { x: 36, y: 36, width: Math.ceil(box.w) + 8, height: Math.ceil(box.h) + 8 } }), box });
      await page.evaluate(() => document.getElementById('cmp-back').remove());
    }
    await page.evaluate(() => { // close the Key; leave only the land on the map
      document.getElementById('legend').open = false;
      document.getElementById('legend').style.visibility = 'hidden';
      for (const sel of ['#live-button', '#status', '#finder', '.maplibregl-control-container']) document.querySelectorAll(sel).forEach((e) => (e.style.visibility = 'hidden'));
      for (const l of window.__map.getStyle().layers) if (l.id !== 'land') window.__map.setLayoutProperty(l.id, 'visibility', 'none');
    });
    for (const [k, m] of marks.entries()) {
      const layerId = layerOf(m.mark);
      if (!layerId) continue;
      const info = await page.evaluate(({ mark, layerId, n }) => {
        const map = window.__map, layer = map.getLayer(layerId), c = map.getCanvas().getBoundingClientRect();
        if (!layer) return { skip: 'no layer' };
        const at = map.unproject([c.width / 2, c.height / 2]), src = `probe${n}`;
        map.addSource(src, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [at.lng, at.lat] }, properties: { served: false } } });
        if (layer.type === 'circle') {
          if (map.getZoom() < (layer.minzoom ?? 0)) return { skip: `not drawn below ${layer.minzoom}` };
          const paint = {};
          for (const p of ['circle-radius', 'circle-color', 'circle-stroke-color', 'circle-stroke-width']) paint[p] = map.getPaintProperty(layerId, p);
          map.addLayer({ id: src, type: 'circle', source: src, paint });
        } else {
          map.addLayer({ id: src, type: 'symbol', source: src, layout: { 'icon-image': mark, 'icon-size': map.getLayoutProperty(layerId, 'icon-size'), 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
        }
        return { symbol: layer.type === 'symbol', cx: c.left + c.width / 2, cy: c.top + c.height / 2 };
      }, { mark: m.mark, layerId, n: k });
      if (info.skip) continue;
      await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(600);
      // Images load on demand, so the probe has made the map create this one.
      if (info.symbol) expect.soft(await page.evaluate((id) => !!window.__map.getImage(id), m.mark), `${m.mark}: the map has this image`).toBe(true);
      const pad = 8, cw = Math.ceil(shots[k].box.w) + pad * 2, ch = Math.ceil(shots[k].box.h) + pad * 2;
      const shot = await page.screenshot({ clip: { x: info.cx - cw / 2, y: info.cy - ch / 2, width: cw, height: ch } });
      await testInfo.attach(`${m.mark}-key`, { body: shots[k].shot, contentType: 'image/png' });
      await testInfo.attach(`${m.mark}-map`, { body: shot, contentType: 'image/png' });
      const r = compare(await pixels(shots[k].shot), await pixels(shot));
      console.log(`${testInfo.project.name} ${zoom} ${m.mark}: mean ${r.mean.toFixed(2)}, ${r.within.toFixed(1)}% within 24`);
      expect.soft(r.mean, `${m.mark}: mean difference of 255`).toBeLessThanOrEqual(MAX_MEAN);
      expect.soft(r.within, `${m.mark}: % of pixels within 24`).toBeGreaterThanOrEqual(MIN_WITHIN);
      await page.evaluate((n) => window.__map.setLayoutProperty(`probe${n}`, 'visibility', 'none'), k);
    }
  });
}
