// Zoom-ladder sweep against the instrumented copy (window.__map) on 8831.
//   node qa/vision/zoom-sweep.mjs <width> <height> <out.json> [label] [lng,lat]
// Writes one JSON row per zoom as it goes, so a crash loses nothing.
import { chromium } from '/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const [w, h, out, label = `${w}x${h}`, center] = process.argv.slice(2);
const ZOOMS = String(process.env.ZOOMS ?? '8.752,9,10,10.5,11,11.5,12,12.5,13,14,14.5,15,16,17')
  .split(',')
  .map(Number);

const LABELS = {
  'bus-tags-region': 'route',
  'corridor-labels': 'label',
  'bus-numbers': 'route',
  'bus-tags': 'route',
  'rail-bullets': 'route',
  'station-labels': 'label',
  'station-labels-unserved': 'label',
  'hub-signs': 'name',
  'line-signs': 'name',
  'city-label': 'name',
  'town-label': 'name',
  'village-label': 'name',
  'neighborhood-label': 'name',
  'airport-label': 'name',
  'landmark-label': 'name',
  'road-label': 'name',
  'highway-shield': 'ref',
};

const state = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { viewport: label, rows: [], errors: [] };
state.rows = state.rows.filter((r) => !ZOOMS.includes(r.z));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => state.errors.push(`pageerror ${e}`));
page.on('console', (m) => m.type() === 'error' && state.errors.push(`console ${m.text().slice(0, 200)}`));
await page.goto('http://localhost:8831/', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.hidden === true, null, { timeout: 90000 });
if (center) {
  const [lng, lat] = center.split(',').map(Number);
  await page.evaluate(([x, y]) => window.__map.jumpTo({ center: [x, y] }), [lng, lat]);
}
await page.waitForTimeout(800);

for (const z of ZOOMS) {
  await page.evaluate((zz) => window.__map.jumpTo({ zoom: zz, bearing: 0, pitch: 0 }), z);
  await page.waitForTimeout(1400);
  const row = await page.evaluate(
    ({ z, LABELS }) => {
      const m = window.__map;
      const layers = m.getStyle().layers;
      const counts = {};
      const texts = {};
      for (const l of layers) {
        if (!['line', 'symbol', 'circle', 'fill'].includes(l.type)) continue;
        try {
          counts[l.id] = m.queryRenderedFeatures({ layers: [l.id] }).length;
        } catch {
          counts[l.id] = null;
        }
        if (l.id in LABELS) {
          const key = LABELS[l.id];
          texts[l.id] = [
            ...new Set(
              m
                .queryRenderedFeatures({ layers: [l.id] })
                .map((f) => String(f.properties[key] ?? ''))
                .filter(Boolean),
            ),
          ];
        }
      }
      const drawn = (ids) => [
        ...new Set(m.queryRenderedFeatures({ layers: ids }).flatMap((f) => String(f.properties.route ?? '').split(' ')).filter(Boolean)),
      ].sort();
      const busDrawn = drawn(['bus', 'bus-part-time', 'bus-limited']);
      const busNamed = drawn(['bus-tags-region', 'bus-numbers', 'bus-tags']);
      const railDrawn = drawn(['rail', 'rail-part-time']);
      const railNamed = drawn(['rail-bullets']);
      const c = m.getCenter();
      const b = m.getBounds();
      return {
        z,
        zoom: +m.getZoom().toFixed(3),
        center: [+c.lat.toFixed(4), +c.lng.toFixed(4)],
        viewBounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => +v.toFixed(4)),
        counts,
        texts,
        busDrawn,
        busNamed,
        busUnnamed: busDrawn.filter((r) => !busNamed.includes(r)),
        railDrawn,
        railNamed,
      };
    },
    { z, LABELS },
  );
  state.rows.push(row);
  state.rows.sort((a, b) => a.z - b.z);
  writeFileSync(out, JSON.stringify(state, null, 1));
  const pick = (ids) => Object.fromEntries(ids.map((id) => [id, row.counts[id]]));
  console.error(
    label, z,
    JSON.stringify(pick(['bus', 'corridors', 'rail', 'stations', 'stations-unserved', 'stops', 'facilities',
      'bus-tags-region', 'corridor-labels', 'bus-numbers', 'bus-tags', 'rail-bullets', 'station-labels',
      'hub-signs', 'line-signs', 'city-label', 'town-label', 'village-label', 'neighborhood-label',
      'airport-label', 'landmark-label'])),
    `bus ${row.busNamed.length}/${row.busDrawn.length}`,
  );
}

console.log(JSON.stringify({ out, rows: state.rows.length, errors: state.errors.length }));
await browser.close();
