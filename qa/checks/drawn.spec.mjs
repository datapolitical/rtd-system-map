// The drawn model against the browser (issues #42, #59): at a set of views,
// what the page draws must match what qa/drawn/model.mjs works out in Node.
//
// - Lines, page to model: every vertex the page's queryRenderedFeatures
//   returns lies within 1 px of the model's line for the same layer and route.
//   That geometry is the source's, so this ties the projection and the
//   filters, not where a line is drawn.
// - Lines as drawn (#59): queryRenderedFeatures doesn't return offsets or
//   widths, but its hit-test applies both. At sample points on the model's
//   drawn lines (strokes.mjs) the test walks out along the normal until the
//   page stops returning that feature, which gives the page's centre and
//   width there: the centre must be within 1 px of the model's, the width
//   within 0.6 px.
// - Lines, model to page: every line the model draws on the screen must be
//   among the page's, so a line the page doesn't draw can't pass.
// - Marks: centres within 1 px. Names, and rail letters with their bullets:
//   MapLibre's collision boxes within 2 px of one of the model's.
//
// The model restates nothing: it reads the page's style (js/network.js and
// friends, through style.mjs), its data, glyphs, symbols and tiles. If the
// page's drawing changes in a way the model doesn't follow, a view fails here
// with the layer and the distance (needs a site and a browser).
//
// Views: a seeded walk over the lines (DRAWN_VIEWS, DRAWN_ZOOMS), the three
// busiest interchanges, and every place in qa/recall/finds.json, where people
// have seen faults.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, siteData } from './fixtures.mjs';
import { openModel, pageSources } from '../drawn/model.mjs';
import { styleErrors } from '../drawn/expressions.mjs';
import { compareBoxes, compareLines, compareLinesBack, compareProbes, comparePoints, lineSamples, modelHitMap, probeLines, signature } from '../drawn/compare.mjs';
import { offsetParts } from '../drawn/strokes.mjs';
import { seededViews } from '../lib/views.mjs';

const VIEWS = Number(process.env.DRAWN_VIEWS ?? 10);
const ZOOMS = (process.env.DRAWN_ZOOMS ?? '10,12,14,16').split(',').map(Number);
const PROBES = Number(process.env.DRAWN_PROBES ?? 150);
// DRAWN_ROOT: the page code to build the model from, when the site under test
// is not this checkout's build: a frozen build (qa/recall/fixtures/<commit>)
// with CHECK_URL at that commit's preview.
const ROOT = process.env.DRAWN_ROOT ? path.resolve(process.env.DRAWN_ROOT) : undefined;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// The places people have seen faults (qa/recall/finds.json), one view each.
function findViews() {
  try {
    const { finds } = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'recall', 'finds.json'), 'utf8'));
    const seen = new Map();
    for (const f of finds) {
      const [zoom, lat, lon] = f.capture.view.split('/').map(Number);
      seen.set(f.capture.view, { zoom, lat, lon });
    }
    return [...seen.values()];
  } catch {
    return [];
  }
}

// The site's own build and the model of it, the views to read, and the
// layers each comparison reads.
async function setup(mapPage) {
  // The page's own build output, as the site under test serves it: the
  // preview is this commit's build, and a CI checkout has no public/data.
  const meta = await siteData('meta.json');
  const data = Object.fromEntries(await Promise.all(
    (await pageSources(ROOT)).map(async (name) => [name, await siteData(`${name}.geojson`)]),
  ));
  // Seeded views over the lines, plus the busiest interchanges the data has
  // (by how many lines meet there), where names are densest. No place is
  // named here; the finds' places come from finds.json.
  const busiest = data.stations.features.filter((f) => f.properties.served)
    .sort((a, b) => (b.properties.links ?? 0) - (a.properties.links ?? 0))
    .slice(0, 3);
  const busy = busiest.map((f, i) => ({ zoom: 15.25 + i, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  const views = [...seededViews(data.routes, { count: VIEWS, zooms: ZOOMS, seed: 42 }), ...busy, ...findViews()];
  await mapPage.goto(views[0], { settle: 800 });
  const model = await openModel({ ...(ROOT ? { root: ROOT } : {}), theme: mapPage.theme, data, meta });

  // The layers that draw the network's own data, in the style's order.
  const own = model.style.layers.filter((l) => model.data[l.source]);
  const pointPlaced = (l) => (l.layout?.['symbol-placement'] ?? 'point') === 'point';
  const lineLayers = own.filter((l) => l.type === 'line').map((l) => l.id);
  const markLayers = own.filter((l) => l.type === 'circle'
    || (l.type === 'symbol' && l.layout?.['icon-image'] !== undefined && l.layout?.['text-field'] === undefined)).map((l) => l.id);
  // Names: point-placed text with no icon beside it.
  const labelLayers = own.filter((l) => l.type === 'symbol' && pointPlaced(l)
    && l.layout?.['text-field'] !== undefined && l.layout?.['icon-image'] === undefined).map((l) => l.id);
  // Text with an icon, point-placed: the rail letters on their bullets.
  const bulletLayers = own.filter((l) => l.type === 'symbol' && pointPlaced(l)
    && l.layout?.['text-field'] !== undefined && l.layout?.['icon-image'] !== undefined).map((l) => l.id);
  return { model, views, lineLayers, markLayers, labelLayers, bulletLayers };
}

// Read a view the way a rider reaches it, then what the page drew there.
async function readView(mapPage, v, layers) {
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
  const drawn = await mapPage.page.evaluate(({ lines, marks, labels, bullets }) => {
    const m = window.__map;
    const project = (c) => { const p = m.project(c); return [p.x, p.y]; };
    // The same as compare.mjs signature(): a feature's scalar properties.
    const sigOf = (properties) => JSON.stringify(Object.keys(properties ?? {}).filter((k) => k !== '$type').sort()
      .filter((k) => ['string', 'number', 'boolean'].includes(typeof properties[k]))
      .map((k) => [k, typeof properties[k] === 'number' ? Math.round(properties[k] * 1e6) / 1e6 : properties[k]]));
    // Query the viewport, not the loaded tiles: without a geometry
    // MapLibre answers for every tile it holds, on screen or not.
    const s = m.getCanvas().getBoundingClientRect();
    const query = [[0, 0], [s.width, s.height]];
    // `lineSigs`: every feature a line layer draws here, whatever its geometry
    // (a FlexRide zone is a polygon drawn by a line layer), for the
    // model-to-page check; `lines`: the line geometries, for page-to-model.
    const out = { lines: [], lineSigs: [], marks: [] };
    // A tile holds features of a layer from the whole zoom below its
    // minzoom (a z13 tile carries a layer that starts at 13.5), and
    // queryRenderedFeatures answers for them although nothing is drawn.
    // Read a layer only where MapLibre draws it (StyleLayer.isHidden).
    const z = m.getZoom();
    const drawnNow = (id) => {
      const l = m.getLayer(id);
      return !!l && z >= (l.minzoom ?? 0) && z < (l.maxzoom ?? 24) && m.getLayoutProperty(id, 'visibility') !== 'none';
    };
    for (const layer of lines) {
      if (!drawnNow(layer)) continue;
      for (const f of m.queryRenderedFeatures(query, { layers: [layer] })) {
        out.lineSigs.push({ layer, sig: sigOf(f.properties) });
        const g = f.geometry;
        if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
        const parts = (g.type === 'LineString' ? [g.coordinates] : g.coordinates).map((part) => part.map(project));
        out.lines.push({ layer, route: f.properties.route ?? null, kind: f.properties.kind ?? null, sig: sigOf(f.properties), parts });
      }
    }
    for (const layer of marks) {
      if (!drawnNow(layer)) continue;
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
    // positions of an earlier camera, so a name's box is only trusted when
    // its station is on the screen now, and a letter's when its whole box is.
    const onScreen = new Set(window.__qa.stationAt()
      .filter((st) => st.x >= 0 && st.y >= 0 && st.x <= s.width && st.y <= s.height)
      .map((st) => st.id));
    const inside = (b) => b[0] >= 0 && b[1] >= 0 && b[2] <= s.width && b[3] <= s.height;
    // A rail letter's box is this camera's only when a letter with the same
    // properties is drawn now, its anchor (projected by the camera as it is
    // now) within reach of the box: a box kept from an earlier camera sits
    // where that camera put it, far from where the letter is now.
    const lettersNow = [];
    for (const layer of bullets) {
      if (!drawnNow(layer)) continue;
      for (const f of m.queryRenderedFeatures(query, { layers: [layer] })) {
        if (f.geometry.type !== 'Point') continue;
        const p = m.project(f.geometry.coordinates);
        lettersNow.push({ layer, sig: sigOf(f.properties), x: p.x, y: p.y });
      }
    }
    const letterNow = (p, layer) => lettersNow.some((q) => q.layer === layer && q.sig === sigOf(p.props)
      && Math.hypot((p.box[0] + p.box[2]) / 2 - q.x, (p.box[1] + p.box[3]) / 2 - q.y) <= 60);
    const placed = window.__qa.placed();
    out.labels = placed
      .filter((p) => p.layers.some((l) => labels.includes(l)))
      .filter((p) => p.props.id != null && onScreen.has(p.props.id))
      // A label placed in a tile's buffer can sit wholly outside the canvas;
      // it is not drawn on this screen, so there is no drawn box to match.
      .filter((p) => p.box[2] > 0 && p.box[3] > 0 && p.box[0] < s.width && p.box[1] < s.height)
      .map((p) => ({ layer: p.layers.find((l) => labels.includes(l)), props: p.props, box: p.box }))
      .concat(placed
        .filter((p) => p.layers.some((l) => bullets.includes(l)) && inside(p.box))
        .map((p) => ({ layer: p.layers.find((l) => bullets.includes(l)), props: p.props, box: p.box }))
        .filter((p) => letterNow(p, p.layer)));
    return out;
  }, layers);
  return { view, drawn };
}

// The model's boxes for one placed name or letter: each candidate anchor's
// text box, the icon's box beside it, and the two together (placed() merges
// a feature's boxes).
function boxesFor(frame, p) {
  const same = (l) => l.layer === p.layer && (p.props.id != null
    ? l.properties.id === p.props.id
    : p.props.route != null && l.properties.route === p.props.route && (p.props.kind == null || l.properties.kind === p.props.kind));
  const boxes = [];
  for (const l of frame.labels.filter(same)) {
    const mark = frame.marks.find((k) => k.layer === l.layer && k.index === l.index);
    for (const c of l.candidates) {
      boxes.push(c.box);
      if (mark) boxes.push(mark.box, [Math.min(c.box[0], mark.box[0]), Math.min(c.box[1], mark.box[1]), Math.max(c.box[2], mark.box[2]), Math.max(c.box[3], mark.box[3])]);
    }
  }
  return boxes;
}

const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));

test('the drawn model matches what the browser draws', async ({ mapPage }) => {
  test.setTimeout(2_400_000);
  const { model, views, lineLayers, markLayers, labelLayers, bulletLayers } = await setup(mapPage);
  const layers = { lines: lineLayers, marks: markLayers, labels: labelLayers, bullets: bulletLayers };

  const report = [];
  for (const [i, v] of views.entries()) {
    let { view, drawn } = await readView(mapPage, v, layers);
    let frame = await model.frame({ zoom: view.zoom, center: [view.lon, view.lat], width: view.width, height: view.height });
    // A page read before it settled returns next to nothing (on a slow
    // renderer, a view with marks came back with none): give it a moment
    // and read it once more, rather than compare nothing and call it a pass.
    const marksHere = frame.marks.filter((k) => markLayers.includes(k.layer) && k.at[0] >= 0 && k.at[1] >= 0 && k.at[0] <= view.width && k.at[1] <= view.height).length;
    if (marksHere >= 5 && drawn.marks.length === 0) {
      console.log(`view ${i}: the page drew no marks where the model has ${marksHere}; reading it again`);
      await mapPage.page.waitForTimeout(2000);
      ({ view, drawn } = await readView(mapPage, v, layers));
      frame = await model.frame({ zoom: view.zoom, center: [view.lon, view.lat], width: view.width, height: view.height });
    }
    const shown = frame.lines.filter((l) => lineLayers.includes(l.layer));

    const lines = compareLines(drawn.lines, frame.lines, { tolerance: 1, width: view.width, height: view.height });
    const back = compareLinesBack(shown, drawn.lineSigs);
    // The page and the model measured the same way (probeLines), at samples
    // where the line stands alone (lineSamples).
    const samples = lineSamples(shown, { width: view.width, height: view.height, max: PROBES });
    const probes = compareProbes(samples, await mapPage.page.evaluate(probeLines, { samples }), probeLines({ samples }, modelHitMap(shown)));
    const marks = comparePoints(drawn.marks, (p) => frame.marks
      .filter((k) => k.layer === p.layer && ((p.id !== null && k.properties.id === p.id) || (p.route !== null && k.properties.route === p.route && p.id === null)))
      .map((k) => k.at), { tolerance: 1 });
    const labels = compareBoxes(drawn.labels, (p) => boxesFor(frame, p), { tolerance: 2 });

    report.push({ view: i, zoom: +view.zoom.toFixed(2), lon: +view.lon.toFixed(5), lat: +view.lat.toFixed(5), lines, back, probes, marks, labels });
    console.log(`${i} z${view.zoom.toFixed(2)} ${view.lat.toFixed(4)},${view.lon.toFixed(4)}: lines ${lines.pairs} missing ${lines.missing}${lines.missing ? ' ' + JSON.stringify(lines.missingKeys) : ''} worst ${lines.worst.toFixed(2)}; drawn ${probes.checked} probes, centre ${fmt(probes.worstShift)} width ${fmt(probes.worstWidth)}; model lines not on the page ${back.missing} of ${back.checked}; marks ${marks.checked} worst ${marks.worst.toFixed(2)}; boxes ${labels.checked} worst ${labels.worst.toFixed(2)}`);
  }

  const kinds = [['line', 'lines'], ['drawn', 'probes'], ['model line', 'back'], ['mark', 'marks'], ['box', 'labels']];
  for (const r of report) for (const [what, k] of kinds) for (const f of r[k].failures) console.log(`off in view ${r.view} z${r.zoom}: ${what} ${JSON.stringify(f)}`);
  const failed = report.filter((r) => kinds.some(([, k]) => r[k].failures.length));
  const detail = failed.map((r) => `view ${r.view} z${r.zoom} ${r.lat},${r.lon}: ` + JSON.stringify(Object.fromEntries(kinds.map(([, k]) => [k, r[k].failures]))));
  const sum = (f) => report.reduce((n, r) => n + f(r), 0);
  const totalMissing = sum((r) => r.lines.missing);
  const missingLayers = report.flatMap((r) => r.lines.missingLayers.map(([l, n]) => `${l}:${n}`));
  // Per layer, the worst drawn centre and width over the run.
  const layersSeen = {};
  for (const r of report) {
    for (const [layer, L] of Object.entries(r.probes.byLayer)) {
      const t = (layersSeen[layer] ??= { checked: 0, worstShift: 0, worstWidth: 0 });
      t.checked += L.checked;
      if (Math.abs(L.worstShift) > Math.abs(t.worstShift)) t.worstShift = L.worstShift;
      if (Math.abs(L.worstWidth) > Math.abs(t.worstWidth)) t.worstWidth = L.worstWidth;
    }
  }
  for (const [layer, t] of Object.entries(layersSeen)) console.log(`  ${layer}: ${t.checked} probes, centre ${fmt(t.worstShift)} px, width ${fmt(t.worstWidth)} px`);
  console.log(`${views.length} views, ${sum((r) => r.lines.pairs)} line points, ${totalMissing} the model does not have; ${sum((r) => r.probes.checked)} drawn-line probes over ${Object.keys(layersSeen).length} layers; ${sum((r) => r.back.checked)} model lines, ${sum((r) => r.back.missing)} not on the page; ${sum((r) => r.marks.checked)} marks; ${sum((r) => r.labels.checked)} boxes; ${failed.length} view(s) off`);
  // A run that compared almost nothing is a broken run, not a pass: a camera
  // that never settled, or a style with no layers the model knows. The floors
  // scale with the number of views.
  expect(sum((r) => r.lines.pairs)).toBeGreaterThan(Math.max(100, views.length * 40));
  expect(sum((r) => r.probes.checked)).toBeGreaterThan(views.length * 5);
  expect(sum((r) => r.marks.checked)).toBeGreaterThan(30);
  expect(sum((r) => r.labels.checked)).toBeGreaterThan(Math.max(1, Math.floor(views.length / 3)));
  // Every line point the page drew must have a model line to be compared
  // with, and every line the model draws must be on the page.
  expect(totalMissing, `line points the model does not have (${missingLayers.join(' ')})`).toBe(0);
  expect(sum((r) => r.back.missing), 'lines the model draws and the page does not').toBe(0);
  expect(styleErrors(), 'style expressions the model could not evaluate').toEqual([]);
  await expect(detail, 'the model and the browser disagree').toEqual([]);
});

// The test above has to fail when the model is wrong. At the busiest
// interchange, each of these planted model errors must be caught against the
// real page: an offset 2 px off, a width 1 px off, a layer the model leaves
// out, and a line the page does not draw. (test/drawn-strokes.test.mjs plants
// the same against a fake page in npm test.)
test('the drift test catches a model that is off', async ({ mapPage }) => {
  test.setTimeout(600_000);
  const { model, views, lineLayers, markLayers, labelLayers, bulletLayers } = await setup(mapPage);
  const v = views[VIEWS] ?? views[0];
  const { view, drawn } = await readView(mapPage, { ...v, zoom: 16 }, { lines: lineLayers, marks: markLayers, labels: labelLayers, bullets: bulletLayers });
  const frame = await model.frame({ zoom: view.zoom, center: [view.lon, view.lat], width: view.width, height: view.height });
  const shown = frame.lines.filter((l) => lineLayers.includes(l.layer));
  const probe = async (lines) => {
    const samples = lineSamples(lines, { width: view.width, height: view.height, max: 60 });
    return compareProbes(samples, await mapPage.page.evaluate(probeLines, { samples }), probeLines({ samples }, modelHitMap(lines)));
  };

  // The layer with the most samples here is the one to plant errors in.
  const counts = {};
  for (const s of lineSamples(shown, { width: view.width, height: view.height, max: 400 })) counts[s.layer] = (counts[s.layer] ?? 0) + 1;
  const layer = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  expect(layer, 'a line layer with straight stretches on screen').toBeTruthy();
  const only = shown.filter((l) => l.layer === layer);
  console.log(`planting in ${layer} (${only.length} lines) at z${view.zoom.toFixed(2)} ${view.lat.toFixed(4)},${view.lon.toFixed(4)}`);

  const honest = await probe(only);
  expect(honest.failures, 'the unplanted model agrees here').toEqual([]);

  const shifted = await probe(only.map((l) => ({ ...l, drawn: offsetParts(l.parts, (l.offset ?? 0) + 2, view.zoom) })));
  console.log(`offset +2 px: worst centre ${fmt(shifted.worstShift)} px, ${shifted.failures.length} failure(s)`);
  expect(shifted.failures.length, 'an offset 2 px off fails').toBeGreaterThan(0);

  const wider = await probe(only.map((l) => ({ ...l, drawnWidth: (l.drawnWidth ?? l.width) + 1 })));
  console.log(`width +1 px: worst width ${fmt(wider.worstWidth)} px, ${wider.failures.length} failure(s)`);
  expect(wider.failures.length, 'a width 1 px off fails').toBeGreaterThan(0);

  const without = compareLines(drawn.lines, frame.lines.filter((l) => l.layer !== layer), { tolerance: 1, width: view.width, height: view.height });
  console.log(`layer left out: ${without.missing} page line points with no model line`);
  expect(without.missing, 'a layer the model leaves out fails').toBeGreaterThan(0);

  const extra = only.find((l) => (l.drawn ?? l.parts).some((p) => p.length > 1));
  const planted = compareLinesBack([...shown, { ...extra, properties: { ...extra.properties, planted: 1 } }], drawn.lineSigs);
  console.log(`line the page does not draw: ${planted.missing} model line(s) not on the page`);
  expect(planted.missing, 'a line the page does not draw fails').toBeGreaterThan(0);
  expect(signature({ ...extra.properties, planted: 1 })).not.toBe(signature(extra.properties));
});
