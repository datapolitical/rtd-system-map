// The drawn model against the browser (issue #42): for a seeded set of views
// over the network, the page's own rendered lines, marks and label boxes must
// match the geometry qa/drawn/model.mjs computes in Node, within a pixel for
// lines and mark centres and within two for label boxes.
//
// The model restates nothing: it reads the page's style (js/network.js and
// friends, through style.mjs), its data, its glyphs, its symbols and its
// tiles. This test is the tie between the two: if the page's drawing changes
// in a way the model does not follow, a view fails here with the distance
// and the layer, and the model gets fixed before anything built on it is
// trusted (needs the dev server and a browser).
import { test, expect, readData } from './fixtures.mjs';
import { openModel } from '../drawn/model.mjs';
import { compareBoxes, compareLines, comparePoints } from '../drawn/compare.mjs';
import { seededViews } from '../lib/views.mjs';

const VIEWS = Number(process.env.DRAWN_VIEWS ?? 10);
const ZOOMS = [10, 12, 14, 16];

test('the drawn model matches what the browser draws', async ({ mapPage }) => {
  test.setTimeout(1_800_000);
  const routes = readData('routes.geojson');
  // Seeded views over the lines, plus the busiest interchanges the data has
  // (by how many lines meet there), where names are densest and label boxes
  // have the most to disagree about. No place is named here.
  const stations = readData('stations.geojson').features;
  const busy = [...stations]
    .sort((a, b) => (b.properties.links ?? 0) - (a.properties.links ?? 0))
    .filter((f, i, all) => i < 3 && f.properties.served)
    .map((f, i) => ({ zoom: 15.25 + i, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  const views = [...seededViews(routes, { count: VIEWS, zooms: ZOOMS, seed: 42 }), ...busy];
  await mapPage.goto(views[0], { settle: 800 });
  const model = await openModel({ theme: mapPage.theme });

  // The layers that draw the network's own data, in the style's order. Text
  // placed along a line draws as circles of collision, not boxes, so it is
  // left out of the label comparison.
  const own = model.style.layers.filter((l) => model.data[l.source]);
  const lineLayers = own.filter((l) => l.type === 'line').map((l) => l.id);
  const markLayers = own.filter((l) => {
    if (l.type === 'circle') return true;
    if (l.type !== 'symbol' || l.layout?.['icon-image'] === undefined) return false;
    return l.layout?.['text-field'] === undefined;
  }).map((l) => l.id);
  // Text that stands for itself: point-placed, with no icon beside it. A
  // bullet's letter comes and goes with collision and is checked as a mark;
  // text along a line draws as circles of collision, not as a box.
  const labelLayers = own.filter((l) => l.type === 'symbol'
    && l.layout?.['text-field'] !== undefined
    && l.layout?.['icon-image'] === undefined
    && l.layout?.['symbol-placement'] !== 'line').map((l) => l.id);

  const report = [];
  for (const [i, v] of views.entries()) {
    await mapPage.jump(v);
    // The camera is set at once but tiles and placement settle a frame or two
    // later; a second jump to the same view makes MapLibre re-place what it
    // still holds from the last one, so every box read below is this camera's.
    await mapPage.page.waitForTimeout(400);
    await mapPage.jump(v);
    await mapPage.page.waitForTimeout(400);
    const view = await mapPage.page.evaluate(() => {
      const m = window.__map;
      const c = m.getCenter();
      const s = m.getCanvas().getBoundingClientRect();
      return { zoom: m.getZoom(), lon: c.lng, lat: c.lat, width: s.width, height: s.height };
    });
    const drawn = await mapPage.page.evaluate(([lines, marks, labels]) => {
      const m = window.__map;
      const project = (c) => { const p = m.project(c); return [p.x, p.y]; };
      // Query the viewport, not the loaded tiles: without a geometry
      // MapLibre answers for every tile it holds, on screen or not.
      const s = m.getCanvas().getBoundingClientRect();
      // A box in CSS px, as MapLibre takes it: two corners.
      const query = [[0, 0], [s.width, s.height]];
      const out = { lines: [], marks: [] };
      for (const layer of lines) {
        if (!m.getLayer(layer)) continue;
        for (const f of m.queryRenderedFeatures(query, { layers: [layer] })) {
          const g = f.geometry;
          if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
          const parts = (g.type === 'LineString' ? [g.coordinates] : g.coordinates).map((part) => part.map(project));
          out.lines.push({ layer, route: f.properties.route ?? null, kind: f.properties.kind ?? null, parts });
        }
      }
      for (const layer of marks) {
        if (!m.getLayer(layer)) continue;
        for (const f of m.queryRenderedFeatures(query, { layers: [layer] })) {
          if (f.geometry.type !== 'Point') continue;
          const p = m.project(f.geometry.coordinates);
          // Placement holds boxes for tiles loaded off-screen too; the
          // comparison is of what is on the screen.
          if (p.x < 0 || p.y < 0 || p.x > s.width || p.y > s.height) continue;
          out.marks.push({ layer, id: f.properties.id ?? null, route: f.properties.route ?? null, x: p.x, y: p.y });
        }
      }
      // Collision boxes for tiles that are loaded but off screen hold the
      // positions of an earlier camera, so a box is only trusted when its
      // feature is on the screen now.
      const onScreen = new Set(window.__qa.stationAt()
        .filter((st) => st.x >= 0 && st.y >= 0 && st.x <= s.width && st.y <= s.height)
        .map((st) => st.id));
      out.labels = window.__qa.placed()
        .filter((p) => p.layers.some((l) => labels.includes(l)))
        .filter((p) => p.props.id != null && onScreen.has(p.props.id))
        .map((p) => ({ layer: p.layers.find((l) => labels.includes(l)), props: p.props, box: p.box }));
      return out;
    }, [lineLayers, markLayers, labelLayers]);

    const frame = await model.frame({ zoom: view.zoom, center: [view.lon, view.lat], width: view.width, height: view.height });

    const lines = compareLines(drawn.lines, frame.lines, { tolerance: 1, width: view.width, height: view.height });
    const marks = comparePoints(drawn.marks, (p) => frame.marks
      .filter((k) => k.layer === p.layer && ((p.id !== null && k.properties.id === p.id) || (p.route !== null && k.properties.route === p.route && p.id === null)))
      .map((k) => k.at), { tolerance: 1 });
    const labels = compareBoxes(drawn.labels, (p) => {
      // The text Field can be an expression, so match the feature itself:
      // its id when it has one, its route when the layer's text is the route.
      const found = frame.labels.filter((l) => l.layer === p.layer
        && (p.props.id != null ? l.properties.id === p.props.id : p.props.route != null && l.properties.route === p.props.route));
      const boxes = [];
      for (const l of found) {
        const mark = frame.marks.find((k) => k.layer === l.layer && k.index === l.index);
        for (const c of l.candidates) {
          boxes.push(c.box);
          // The page may have placed the text, the icon beside it, or both:
          // any of the three is a match for its box.
          if (mark) boxes.push(mark.box, [Math.min(c.box[0], mark.box[0]), Math.min(c.box[1], mark.box[1]), Math.max(c.box[2], mark.box[2]), Math.max(c.box[3], mark.box[3])]);
        }
      }
      return boxes;
    }, { tolerance: 2 });

    report.push({ view: i, zoom: +view.zoom.toFixed(2), lon: +view.lon.toFixed(5), lat: +view.lat.toFixed(5), lines, marks, labels });
    console.log(`${i} z${view.zoom.toFixed(2)} ${view.lat.toFixed(4)},${view.lon.toFixed(4)}: lines ${lines.pairs} worst ${lines.worst.toFixed(2)}; marks ${marks.checked} worst ${marks.worst.toFixed(2)}; labels ${labels.checked} worst ${labels.worst.toFixed(2)}`);
  }

  for (const r of report) {
    for (const [what, list] of [['line', r.lines.failures], ['mark', r.marks.failures], ['label', r.labels.failures]]) {
      for (const f of list) console.log(`off in view ${r.view} z${r.zoom}: ${what} ${JSON.stringify(f)}`);
    }
  }
  const failed = report.filter((r) => r.lines.failures.length || r.marks.failures.length || r.labels.failures.length);
  const detail = failed.map((r) => `view ${r.view} z${r.zoom} ${r.lat},${r.lon}: ` + JSON.stringify({ lines: r.lines.failures, marks: r.marks.failures, labels: r.labels.failures }));
  console.log(`${views.length} views, ${report.reduce((n, r) => n + r.lines.pairs, 0)} line points, ${report.reduce((n, r) => n + r.marks.checked, 0)} marks, ${report.reduce((n, r) => n + r.labels.checked, 0)} label boxes; ${failed.length} view(s) off`);
  await expect(detail, 'the model and the browser disagree').toEqual([]);
});
