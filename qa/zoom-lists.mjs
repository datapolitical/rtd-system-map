// Whether the page draws the route lists as the build placed them (#156, the first trial of one
// decider for lettering). At every tenth of a zoom the placed drawings serve, at each place:
//   - every list the build placed in view is drawn: MapLibre reports it placed, and its ink is in
//     the picture where the build put it (the picture is taken twice, with the lists and with
//     their ink off, and the list's box must differ between the two);
//   - no list is drawn that the build did not place;
//   - no list lies on another list;
//   - no list lies on what is set before the lists and always shown: rail, a station's mark or
//     name, a line's letter, a stop group's mark, a bus station's name ("fixed");
//   - no lettering MapLibre still places (street and neighbourhood names, bus streets' names,
//     shields and planes) lies on a list ("placed after"): the lists' unseen marks keep it off;
//   - every list that stands straight has at least one of those marks placed under it ("no room").
// Two controls say the check can still see a fault:
//   - at each step with rail in view, a point on the rail's own line is asked what is under it,
//     and the answer must be rail ("rail seen"): if not, the run stops;
//   - with --blank the lists' ink is off in both pictures, so every list is one that is not
//     drawn. The run reports the most any box measured and fails if one reaches the floor a drawn
//     list must reach (INK_SHARE).
// Start a static server over a packaged copy (scripts/package-zoom-preview.mjs), then
//   npm run check:zoom-lists -- <origin> [outdir] [--shots] [--blank] [--places=a,b] [--tenths=0,5]
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { expression, latest } from '@maplibre/maplibre-gl-style-spec';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { previewStyle } from '../public/js/zoom/style.js';
import { BUS_DRAWINGS, RAIL_DRAWINGS, LISTS_PLACED, MAX_ZOOM, pitchAt } from '../public/js/zoom/model.js';
import { textWidth } from '../scripts/glyphs.mjs';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [origin = 'http://127.0.0.1:8804', outArg = 'qa/.scratch/zoom-lists'] = args.filter((a) => !a.startsWith('--'));
const base = origin.replace(/\/$/, '');
const out = path.resolve(outArg);
await mkdir(out, { recursive: true });
const shots = flags.includes('--shots');
const blank = flags.includes('--blank');
const only = flags.find((f) => f.startsWith('--places='))?.slice(9).split(',');
const tenths = flags.find((f) => f.startsWith('--tenths='))?.slice(9).split(',').map(Number) ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const say = (line) => { console.log(line); appendFileSync(path.join(out, 'log.txt'), `${line}\n`); };

// Downtown's diagonal grid, the hub, a street grid east of downtown, and a suburb.
const PLACES = [
  { name: '19th-and-curtis', at: [-104.9905, 39.7488] },
  { name: 'union-station', at: [-105.0003, 39.7530] },
  { name: 'colfax-and-colorado', at: [-104.9408, 39.7402] },
  { name: 'nine-mile', at: [-104.8316, 39.6575] },
].filter((p) => !only || only.includes(p.name));
const VIEW = { width: 402, height: 655 };
// A list counts as in view when its place is this far inside the screen: nearer the edge its
// tile may not be one the screen asks for.
const INSET = 24;
const NEAR = 3;
// A list is in the picture when this share of its figures' box differs, by INK_DIFFERS or more in
// colour, between the picture with the lists and the one with their ink off. (Counting pixels near
// the figures' own colour did not tell the two apart: downtown, a box with no list in it held up
// to 0.13 of a dark bus line, and the two letters of a drawn "FF" 0.075.)
const INK_SHARE = 0.04, INK_DIFFERS = 40;

const data = (name) => readFile(path.join('public/data', name), 'utf8').then(JSON.parse);
const metadata = await data('sheets.json');
const bundle = await data('zoom-prototype/trial.json');
const style = previewStyle('light', metadata, bundle, metadata.hub);
const drawings = BUS_DRAWINGS.filter((d) => LISTS_PLACED.includes(d.zoom));
const LIST_KINDS = ['bus-list', 'bus-stack', 'bus-label'];
const midOf = (coords) => {
  const steps = coords.slice(1).map((c, i) => Math.hypot(c[0] - coords[i][0], c[1] - coords[i][1]));
  let far = steps.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < steps.length; i++) { if (far <= steps[i]) { const t = steps[i] ? far / steps[i] : 0; return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t]; } far -= steps[i]; }
  return coords.at(-1);
};
const plans = {};
for (const d of drawings) {
  const drawn = await data(`zoom-prototype/bus-${d.zoom}.geojson`);
  plans[d.set] = drawn.features.filter((f) => LIST_KINDS.includes(f.properties.kind)).map((f, i) => ({
    i, kind: f.properties.kind, label: f.properties.label, street: f.properties.street ?? null,
    at: f.geometry.type === 'Point' ? f.geometry.coordinates : midOf(f.geometry.coordinates), properties: f.properties,
    path: f.geometry.type === 'Point' ? null : f.geometry.coordinates }));
}
// Each list layer's size and offset, as the style gives them, read for one list at one zoom.
const layerOf = (set, kind) => style.layers.find((l) => l.id === `${{ 'bus-list': 'bus-list', 'bus-stack': 'bus-stack', 'bus-label': 'bus-number' }[kind]}-${set}`);
const evaluators = new Map();
const valueOf = (layer, key, zoom, properties) => {
  const id = `${layer.id}/${key}`;
  if (!evaluators.has(id)) {
    const made = expression.createPropertyExpression(layer.layout[key], `layers.${layer.id}.layout.${key}`, latest.layout_symbol[key]);
    if (made.result !== 'success') throw new Error(`${id}: ${made.value.map((e) => e.message).join('; ')}`);
    evaluators.set(id, made.value);
  }
  return evaluators.get(id).evaluate({ zoom }, { type: 'Point', properties });
};
// The box a list's lettering fills on the screen: its middle, its half length along the street,
// its half height across it, and the way it runs.
const boxOf = (list, screen, zoom, set, pathScreen) => {
  const layer = layerOf(set, list.kind);
  const size = valueOf(layer, 'text-size', zoom, list.properties);
  const [, offEm] = valueOf(layer, 'text-offset', zoom, list.properties);
  const rows = String(list.label).split('\n');
  const lead = list.street ? textWidth(`${list.street} `, 'Overpass Regular', size, 0.02) : 0;
  const wide = Math.max(...rows.map((r) => textWidth(r, 'Overpass SemiBold', size, 0.02))) + lead;
  const tall = (0.72 + 1.15 * (rows.length - 1)) * size;
  let angle = list.properties.angle;
  if (angle === undefined) { const [a, b] = [pathScreen[0], pathScreen.at(-1)]; angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; }
  const r = (angle * Math.PI) / 180, ux = [Math.cos(r), Math.sin(r)], uy = [-Math.sin(r), Math.cos(r)];
  // Between a stacked list's two rows there is ground, which is not asked for ink.
  return { c: [screen[0] + uy[0] * offEm * size, screen[1] + uy[1] * offEm * size], hw: wide / 2, hh: tall / 2, ux, uy, size, lead,
    gap: rows.length > 1 ? ((1.15 - 0.72) * size) / 2 : 0 };
};
// The share of each box's figures (not its street's name, set in grey) that the lists' ink changes:
// `png` is the picture with the lists, `bare` the same view with their ink off.
const pixelsOf = async (png) => {
  const image = await loadImage(png), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height);
};
const inkIn = async (png, bare, boxes) => {
  const [{ data, width, height }, { data: under }] = [await pixelsOf(png), await pixelsOf(bare)];
  return boxes.map((b) => {
    let n = 0, ink = 0;
    for (let t = -b.hw + b.lead; t <= b.hw; t += 0.5) for (let v = -b.hh; v <= b.hh; v += 0.5) {
      if (Math.abs(v) < b.gap) continue;
      const x = Math.round(b.c[0] + b.ux[0] * t + b.uy[0] * v), y = Math.round(b.c[1] + b.ux[1] * t + b.uy[1] * v);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      n++;
      if (Math.hypot(data[i] - under[i], data[i + 1] - under[i + 1], data[i + 2] - under[i + 2]) >= INK_DIFFERS) ink++;
    }
    return n ? ink / n : 0;
  });
};
// Two turned boxes overlap unless some side of either separates them. `air` shrinks each a little,
// so boxes that only touch do not count.
const overlap = (a, b, air = 0.5) => {
  for (const u of [a.ux, a.uy, b.ux, b.uy]) {
    const reach = (q) => Math.abs(q.ux[0] * u[0] + q.ux[1] * u[1]) * (q.hw - air) + Math.abs(q.uy[0] * u[0] + q.uy[1] * u[1]) * (q.hh - air);
    if (Math.abs((b.c[0] - a.c[0]) * u[0] + (b.c[1] - a.c[1]) * u[1]) >= reach(a) + reach(b)) return false;
  }
  return true;
};
// Points along the middle of a box, a third of the type's height apart, each asked of the map as a
// small square: what else is drawn under the lettering. The squares stay inside the box's length,
// so what stands just past a list's end is not counted as under it.
const probes = (box) => {
  const half = Math.max(1, box.hh - 1), reach = Math.max(0, box.hw - half);
  const pts = [], step = Math.max(2, box.size / 3), n = Math.max(1, Math.round((2 * reach) / step));
  for (let i = 0; i <= n; i++) { const t = -reach + (2 * reach * i) / n; pts.push([box.c[0] + box.ux[0] * t, box.c[1] + box.ux[1] * t]); }
  return { pts, half };
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'light', serviceWorkers: 'block' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const [lon0, lat0] = PLACES[0].at;
await page.goto(`${base}/zoom/?theme=light#13/${lat0}/${lon0}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.zoomReady && window.zoomMap.isStyleLoaded(), null, { timeout: 90000 });
// The page's own panels lie over the map's edges; the pictures are read for the map's ink alone.
await page.addStyleTag({ content: '.panel, .maplibregl-control-container { opacity: 0 !important; }' });
const settled = async (set) => {
  await page.waitForFunction((set) => window.zoomMap.isStyleLoaded() && window.zoomMap.areTilesLoaded() && !window.zoomMap.isMoving()
    && Math.abs(window.zoomState.zoom - window.zoomMap.getZoom()) < 1e-5 && window.zoomState.busSet === set, set, { timeout: 60000 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
};
// What the page drew of the lists, and where each planned list falls on the screen.
const read = (set, plan) => page.evaluate(({ set, plan }) => {
  const map = window.zoomMap;
  const mid = (coords) => {
    const p = coords.map((c) => { const q = map.project(c); return [q.x, q.y]; });
    const steps = p.slice(1).map((c, i) => Math.hypot(c[0] - p[i][0], c[1] - p[i][1]));
    let far = steps.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < steps.length; i++) { if (far <= steps[i]) { const t = steps[i] ? far / steps[i] : 0; return [p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]; } far -= steps[i]; }
    return p.at(-1);
  };
  const ids = map.getStyle().layers.filter((l) => /^(bus-list|bus-stack|bus-number|picked-list|picked-stack|picked-number)-/.test(l.id)).map((l) => l.id);
  const drawn = map.queryRenderedFeatures({ layers: ids }).map((f) => ({ layer: f.layer.id, label: f.properties.label,
    at: f.geometry.type === 'Point' ? (() => { const q = map.project(f.geometry.coordinates); return [q.x, q.y]; })() : mid(f.geometry.coordinates) }));
  const planned = plan.map((l) => ({ i: l.i, at: (() => { const q = map.project(l.at); return [q.x, q.y]; })(),
    path: l.path ? l.path.map((c) => { const q = map.project(c); return [q.x, q.y]; }) : null }));
  return { zoom: map.getZoom(), set: window.zoomState.busSet, railSet: window.zoomState.railSet, drawn, planned };
}, { set, plan: plan.map(({ i, at, path }) => ({ i, at, path })) });
// The page keeps every rail drawing loaded and shows one, the others at no opacity (style.js): the
// map still reports those, a few pixels from the one in the picture, so only the layers of the
// drawing that shows are asked.
const under = (boxes) => page.evaluate((boxes) => {
  const map = window.zoomMap;
  const unseen = (id) => { const set = id.match(/^trial-rail.*-(\d+)$/)?.[1]; return set !== undefined && set !== window.zoomState.railSet; };
  const ids = (re) => map.getStyle().layers.filter((l) => re.test(l.id) && map.getLayoutProperty(l.id, 'visibility') !== 'none' && !unseen(l.id)).map((l) => l.id);
  const fixed = ids(/^(trial-(rail|station|name|labels-letter|attached-letter|labels-disc|attached-disc)(?!-room)|group-stop-|hall-name-)/);
  const after = ids(/^(place|street-name|bus-street|picked-street|hall-label|airport-plane|express-shield)-/);
  const room = ids(/^list-room-/);
  const words = (f) => `${f.layer.id.replace(/-(13|15|rim|casing)$/, '')}${[f.properties.name, f.properties.text, f.properties.label, f.properties.route, f.properties.shield].filter(Boolean).slice(0, 1).map((t) => `: ${String(t).replace(/\n/g, ' ')}`).join('')}`;
  const on = (layers, { pts, half }) => [...new Set(pts.flatMap(([x, y]) => map.queryRenderedFeatures([[x - half, y - half], [x + half, y + half]], { layers }).map(words)))];
  return boxes.map((b) => ({ fixed: on(fixed, b), after: on(after, b), room: on(room, b).length }));
}, boxes);
// The control for that: the middle of a straight run of the rail drawing that shows, where the
// page draws it (moved sideways by its slot times the pitch, style.js), if one is in view.
const railNear = new Map();
const railPoint = (ref, place, zoom) => {
  const key = `${ref}/${place.name}`;
  if (!railNear.has(key)) railNear.set(key, bundle.rails.features.filter((f) => f.properties.ref === ref)
    .map((f) => ({ slot: f.properties.slot ?? 0, path: f.geometry.coordinates.filter((c) => Math.abs(c[0] - place.at[0]) < 0.03 && Math.abs(c[1] - place.at[1]) < 0.03) })).filter((r) => r.path.length > 1));
  return page.evaluate(({ pieces, pitch, view, inset }) => {
    const map = window.zoomMap, inside = (q) => q.x > inset && q.x < view.width - inset && q.y > inset && q.y < view.height - inset;
    for (const piece of pieces) for (let i = 1; i < piece.path.length; i++) {
      const a = map.project(piece.path[i - 1]), b = map.project(piece.path[i]), l = Math.hypot(b.x - a.x, b.y - a.y);
      const off = piece.slot * pitch, at = { x: (a.x + b.x) / 2 - ((b.y - a.y) / l) * off, y: (a.y + b.y) / 2 + ((b.x - a.x) / l) * off };
      if (l >= 6 && inside(at)) return [at.x, at.y];
    }
    return null;
  }, { pieces: railNear.get(key), pitch: pitchAt(bundle.sizes, zoom), view: VIEW, inset: INSET });
};
// The lists' ink turned off (they keep their places and their room) and back on, each drawn before
// this returns.
const listInk = (on) => page.evaluate((on) => {
  const map = window.zoomMap;
  window.listLayers ??= map.getStyle().layers.filter((l) => /^(bus-list|bus-stack|bus-number|picked-list|picked-stack|picked-number)-/.test(l.id)).map((l) => l.id);
  window.listInk ??= {};
  for (const id of window.listLayers) {
    if (on) { map.setPaintProperty(id, 'text-opacity', window.listInk[id]); continue; }
    window.listInk[id] = map.getPaintProperty(id, 'text-opacity');
    map.setPaintProperty(id, 'text-opacity-transition', { duration: 0, delay: 0 });
    map.setPaintProperty(id, 'text-opacity', 0);
  }
  return new Promise((done) => { map.once('idle', () => requestAnimationFrame(() => requestAnimationFrame(done))); map.triggerRepaint(); });
}, on);

const report = [];
let failed = 0;
try {
  for (const place of PLACES) {
    for (const d of drawings) {
      const plan = plans[d.set];
      for (const t of tenths) {
        const zoom = Math.round((d.zoom + t / 10) * 10) / 10;
        if (zoom > MAX_ZOOM + 1e-9) continue; // the trial's last zoom
        await page.evaluate(({ center, zoom }) => window.zoomMap.jumpTo({ center, zoom }), { center: place.at, zoom });
        await settled(d.set);
        const compare = (seen) => {
          const inView = seen.planned.filter((p) => p.at[0] > INSET && p.at[0] < VIEW.width - INSET && p.at[1] > INSET && p.at[1] < VIEW.height - INSET);
          const has = (p) => seen.drawn.some((q) => q.label === plan[p.i].label && Math.hypot(q.at[0] - p.at[0], q.at[1] - p.at[1]) <= NEAR);
          const onScreen = seen.drawn.filter((q) => q.at[0] > INSET && q.at[0] < VIEW.width - INSET && q.at[1] > INSET && q.at[1] < VIEW.height - INSET);
          return { inView, missing: inView.filter((p) => !has(p)),
            extra: onScreen.filter((q) => !seen.planned.some((p) => plan[p.i].label === q.label && Math.hypot(q.at[0] - p.at[0], q.at[1] - p.at[1]) <= NEAR)) };
        };
        let seen = await read(d.set, plan), got = compare(seen), late = 0;
        if (got.missing.length) {
          // Asked once more after a moment: a list drawn only then came late, which is still a fault.
          await page.waitForTimeout(700);
          const again = compare(await read(d.set, plan));
          late = got.missing.length - again.missing.length;
        }
        // Lists on lists, and on rail, stations and their lettering.
        const boxes = got.inView.filter((p) => !got.missing.includes(p)).map((p) => ({ list: plan[p.i], box: boxOf(plan[p.i], p.at, zoom, d.set, p.path) }));
        const onLists = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i].box, boxes[j].box)) onLists.push([boxes[i].list, boxes[j].list]);
        const hits = await under(boxes.map((b) => probes(b.box)));
        const onFixed = boxes.map((b, i) => ({ list: b.list, on: hits[i].fixed })).filter((x) => x.on.length);
        const onAfter = boxes.map((b, i) => ({ list: b.list, on: hits[i].after })).filter((x) => x.on.length);
        const noRoom = boxes.filter((b, i) => b.list.kind === 'bus-list' && !hits[i].room).map((b) => b.list);
        // The control: on the rail's own line the map must answer rail.
        const railAt = await railPoint(RAIL_DRAWINGS.find((r) => r.set === seen.railSet)?.ref, place, zoom);
        const railSeen = railAt ? (await under([{ pts: [railAt], half: 1 }]))[0].fixed.some((w) => w.startsWith('trial-rail')) : null;
        // The picture itself: a list MapLibre calls placed, with no ink where the build put it.
        if (blank) await listInk(false);
        const png = await page.screenshot();
        if (!blank) await listInk(false);
        const bare = await page.screenshot();
        await listInk(true);
        const whole = boxes.filter((b) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, j]) => {
          const x = b.box.c[0] + b.box.ux[0] * b.box.hw * i + b.box.uy[0] * b.box.hh * j, y = b.box.c[1] + b.box.ux[1] * b.box.hw * i + b.box.uy[1] * b.box.hh * j;
          return x >= 0 && y >= 0 && x < VIEW.width && y < VIEW.height; }));
        const shares = await inkIn(png, bare, whole.map((b) => b.box));
        const faint = whole.map((b, i) => ({ list: b.list, share: shares[i] })).filter((x) => x.share < INK_SHARE);
        const least = shares.length ? Math.min(...shares) : null, most = shares.length ? Math.max(...shares) : null;
        const words = (l) => `${l.street ? `${l.street} ` : ''}${String(l.label).replace(/\n/g, ' / ')}`;
        const row = { place: place.name, zoom, drawing: d.zoom, planned: got.inView.length, kinds: Object.fromEntries(LIST_KINDS.map((k) => [k, got.inView.filter((p) => plan[p.i].kind === k).length])),
          missing: got.missing.map((p) => ({ label: words(plan[p.i]), kind: plan[p.i].kind, at: p.at.map(Math.round) })), late,
          extra: got.extra.map((q) => ({ label: q.label, layer: q.layer, at: q.at.map(Math.round) })),
          onLists: onLists.map(([a, b]) => [words(a), words(b)]), onFixed: onFixed.map((x) => ({ label: words(x.list), kind: x.list.kind, on: x.on })),
          onAfter: onAfter.map((x) => ({ label: words(x.list), kind: x.list.kind, on: x.on })), bare: noRoom.map(words),
          faint: faint.map((x) => ({ label: words(x.list), kind: x.list.kind, share: +x.share.toFixed(3) })), leastInk: least === null ? null : +least.toFixed(3),
          boxes: whole.length, mostInk: most === null ? null : +most.toFixed(3), railSeen };
        report.push(row);
        if (blank) {
          // Every box is empty now: one that measures as drawn says the floor is too low.
          const seenInk = whole.length - row.faint.length;
          failed += seenInk || railSeen === false ? 1 : 0;
          say(`${seenInk || railSeen === false ? 'FAIL' : 'ok  '} ${place.name} ${zoom.toFixed(1)}: ${whole.length} boxes with the lists' ink off; most ink ${row.mostInk}; at or over the floor of ${INK_SHARE}: ${seenInk}; rail seen ${railSeen === null ? 'not in view' : railSeen ? 'yes' : 'NO'}`);
          if (shots && [0, 5].includes(t)) await writeFile(path.join(out, `${place.name}-${zoom.toFixed(1)}-blank.png`), png);
          await writeFile(path.join(out, 'report.json'), JSON.stringify({ origin: base, view: VIEW, blank, steps: report, pageErrors }, null, 1));
          continue;
        }
        const bad = row.missing.length + row.extra.length + row.onLists.length + row.onFixed.length + row.onAfter.length + row.faint.length + row.bare.length + (railSeen === false ? 1 : 0);
        failed += bad ? 1 : 0;
        say(`${bad ? 'FAIL' : 'ok  '} ${place.name} ${zoom.toFixed(1)}: ${row.planned} placed in view (${row.kinds['bus-list']} points, ${row.kinds['bus-stack']} stacked, ${row.kinds['bus-label']} along a bend); missing ${row.missing.length}${late ? ` (${late} came late)` : ''}, no ink ${row.faint.length} (least ${row.leastInk}), not placed ${row.extra.length}, list on list ${row.onLists.length}, on fixed ${row.onFixed.length}, placed after on a list ${row.onAfter.length}, no room ${row.bare.length}; rail seen ${railSeen === null ? 'not in view' : railSeen ? 'yes' : 'NO'}`);
        for (const m of row.missing) say(`       missing: ${m.label} (${m.kind}) at ${m.at}`);
        for (const [a, b] of row.onLists) say(`       on each other: ${a} | ${b}`);
        for (const x of row.faint) say(`       no ink: ${x.label} (${x.kind}) share ${x.share}`);
        for (const x of row.onFixed) say(`       ${x.label} (${x.kind}) on ${x.on.join(', ')}`);
        for (const x of row.onAfter) say(`       on ${x.label} (${x.kind}): ${x.on.join(', ')}`);
        if (row.bare.length) say(`       no room: ${row.bare.join(' | ')}`);
        if (shots && [0, 5].includes(t)) await writeFile(path.join(out, `${place.name}-${zoom.toFixed(1)}.png`), png);
        await writeFile(path.join(out, 'report.json'), JSON.stringify({ origin: base, view: VIEW, steps: report, pageErrors }, null, 1));
      }
    }
  }
} finally {
  await browser.close();
}
const sum = (key) => report.reduce((s, r) => s + r[key].length, 0);
const inks = (key) => report.map((r) => r[key]).filter((v) => v !== null);
const rail = `rail seen on its own line at ${report.filter((r) => r.railSeen).length} of the ${report.filter((r) => r.railSeen !== null).length} steps with rail in view`;
if (blank) say(`\n${report.length} steps at ${PLACES.length} places with the lists' ink off; ${report.reduce((s, r) => s + r.boxes, 0)} boxes; most ink in one ${inks('mostInk').length ? Math.max(...inks('mostInk')) : 'none'}; at or over the floor of ${INK_SHARE}: ${report.reduce((s, r) => s + r.boxes - r.faint.length, 0)}; ${rail}; page errors ${pageErrors.length}`);
else say(`\n${report.length} steps at ${PLACES.length} places; ${report.reduce((s, r) => s + r.planned, 0)} placed lists looked for; missing ${sum('missing')}, no ink ${sum('faint')} (least ${inks('leastInk').length ? Math.min(...inks('leastInk')) : 'none'}, floor ${INK_SHARE}), not placed ${sum('extra')}, list on list ${sum('onLists')}, on fixed ${sum('onFixed')}, placed after on a list ${sum('onAfter')}, no room ${sum('bare')}; ${rail}; page errors ${pageErrors.length}`);
if (pageErrors.length) say(`page errors: ${JSON.stringify(pageErrors.slice(0, 5))}`);
process.exitCode = failed || pageErrors.length ? 1 : 0;
