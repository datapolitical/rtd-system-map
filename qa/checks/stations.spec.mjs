// DESIGN.md milestone 3, steps 2 and 3.
//  Step 2, done when: "at 10 and 10.5 on a phone, no two station marks overlap
//  downtown" and the Union Station hub has a mark.
//  Step 3, done when: "at 10 to 14, every station name on screen is within [a
//  short, fixed distance] of its mark" (24.4 px measured; 25 px allowed),
//  and the hub's name shows at every zoom.
//
// The view is centred on the station where the most lines meet, found in the
// site's own data (fixtures.siteData, so a run against production reads
// production's data): a test input, not a fact written into the code. Marks
// come from the map's own layers, names from MapLibre's placed text boxes.
// "Nearer than the longer one's length" means centre distance under the
// longer side of either mark. Not asserted (known open item): at 11 two
// capsules 300 m apart touch.
import { test, expect, siteData } from './fixtures.mjs';

const MARKS = ['stations-dot-far', 'stations-dot', 'stations-far', 'stations'];
const MAX_NAME_PX = 25;

const count = (f) => f.properties.lines.split(' ').length;
let views = null;
/** The hub's centre and name, from the server under test. */
const hubOf = async () => {
  if (!views) {
    const stations = await siteData('stations.geojson');
    const served = stations.features.filter((f) => f.properties.served);
    const hub = served.reduce((a, b) => (count(b) > count(a) || (count(b) === count(a) && (b.properties.links || 0) > (a.properties.links || 0)) ? b : a));
    views = { lon: hub.geometry.coordinates[0], lat: hub.geometry.coordinates[1], hubName: hub.properties.label };
  }
  return views;
};

async function measure(page) {
  return page.evaluate((MARKS) => {
    const m = window.__map, z = m.getZoom();
    const layers = MARKS.filter((id) => m.getLayer(id));
    const marks = new Map();
    for (const f of m.queryRenderedFeatures({ layers })) {
      const L = m.style._layers[f.layer.id];
      if (z < (L.minzoom ?? 0) || z >= (L.maxzoom ?? 99)) continue;
      const ff = { type: 1, properties: { ...f.properties }, id: f.id };
      const ev = (p) => L.layout.get(p).evaluate(ff, {});
      const img = ev('icon-image');
      const name = typeof img === 'string' ? img : img?.name ?? String(img);
      const image = m.getImage(name);
      if (!image) continue;
      const size = ev('icon-size');
      const w = (image.data.width / image.pixelRatio) * size, h = (image.data.height / image.pixelRatio) * size;
      const rot = L.layout.get('icon-rotation-alignment') === 'map' ? ev('icon-rotate') : 0;
      if (L.paint.get('icon-opacity').evaluate(ff, {}) < 0.05) continue;
      const p = m.project(f.geometry.coordinates);
      const prev = marks.get(f.properties.id);
      if (!prev || w * h > prev.w * prev.h) marks.set(f.properties.id, { label: f.properties.label, x: p.x, y: p.y, w, h, rot });
    }
    const list = [...marks.values()].filter((k) => k.x > -20 && k.y > -20 && k.x < innerWidth + 20 && k.y < innerHeight + 20);
    const corners = (k) => {
      const a = (k.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [k.x + u * (k.w / 2) * c - v * (k.h / 2) * s, k.y + u * (k.w / 2) * s + v * (k.h / 2) * c]);
    };
    const overlap = (A, B) => { // separating axis on oriented rectangles
      for (const P of [A, B]) for (let i = 0; i < 4; i++) {
        const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4], n = [y2 - y1, x1 - x2];
        const pa = A.map(([x, y]) => x * n[0] + y * n[1]), pb = B.map(([x, y]) => x * n[0] + y * n[1]);
        if (Math.max(...pa) <= Math.min(...pb) + 0.01 || Math.max(...pb) <= Math.min(...pa) + 0.01) return false;
      }
      return true;
    };
    const C = list.map(corners), overlaps = [], close = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (overlap(C[i], C[j])) overlaps.push([list[i].label, list[j].label]);
      const longer = Math.max(list[i].w, list[i].h, list[j].w, list[j].h);
      if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < longer) close.push([list[i].label, list[j].label]);
    }
    const pl = m.style.placement, g = pl.collisionIndex.grid;
    const at = new Map(m.querySourceFeatures('stations').map((f) => [f.properties.label, f.geometry.coordinates]));
    const labels = [];
    for (let i = 0; i < g.boxKeys.length; i++) {
      const k = g.boxKeys[i], q = pl.retainedQueryData[k.bucketInstanceId];
      if (!q) continue;
      if (!q.featureIndex.bucketLayerIDs[q.bucketIndex].some((id) => id.startsWith('station-labels'))) continue;
      const f = q.featureIndex.loadVTLayers()[q.featureIndex.sourceLayerCoder.decode(q.sourceLayerIndex)].feature(k.featureIndex);
      const [x1, y1, x2, y2] = g.bboxes.slice(i * 4, i * 4 + 4).map((v) => v - 100);
      const c = at.get(f.properties.label);
      if (!c) continue;
      const p = m.project(c);
      if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) continue;
      labels.push({ label: f.properties.label, gap: Math.round(Math.hypot(Math.max(x1 - p.x, 0, p.x - x2), Math.max(y1 - p.y, 0, p.y - y2)) * 10) / 10 });
    }
    return { marks: list.length, overlaps, close, labels };
  }, MARKS);
}

for (const zoom of [10, 10.5, 11, 12, 13, 14]) {
  test(`station marks and names at ${zoom}`, async ({ mapPage }, testInfo) => {
    const { lon, lat, hubName } = await hubOf();
    await mapPage.goto({ zoom, lat, lon });
    await mapPage.capture(`downtown-${zoom}`);
    const r = await measure(mapPage.page);
    const worst = r.labels.reduce((a, l) => Math.max(a, l.gap), 0);
    const hubGap = r.labels.find((l) => l.label === hubName)?.gap;
    const summary = `${testInfo.project.name} ${zoom}: ${r.marks} marks, ${r.overlaps.length} overlap, ${r.close.length} too close; ${r.labels.length} names, worst ${worst} px; ${hubName} ${hubGap ?? 'NOT NAMED'}`;
    console.log(summary);
    await testInfo.attach('summary', { body: summary + '\n' + JSON.stringify(r, null, 1), contentType: 'text/plain' });
    if (zoom <= 10.5) {
      expect.soft(r.overlaps, 'overlapping station marks').toEqual([]);
      expect.soft(r.close, "marks nearer each other than the longer one's length").toEqual([]);
    }
    expect.soft(worst, `a station name is ${worst} px from its mark`).toBeLessThanOrEqual(MAX_NAME_PX);
    expect.soft(hubGap, `${hubName} is named`).toBeDefined();
  });
}
