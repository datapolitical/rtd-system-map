// Isolated #154 experiment. Reads a validated public/data build; never runs in npm run build.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SHEETS, SIZES, drawSheet, carryOf, HOLD_RAIL_SLACK, HOLD_INK_SLACK, railLines, railTracks, stationMarks, letters, names, halls, busStreets,
  nearest, resample, offset, toPx, toLonLat } from './lib/sheets.mjs';
import { canonicalTracks, slotPieces, fitTerminalSpines } from './lib/zoom-rail.mjs';
import { projection, simplify } from './lib/geom.mjs';
import { labelChanges, REFERENCE_ZOOM, MIN_ZOOM, MAX_ZOOM, RAIL_DRAWINGS, railRefAt, pitchAt, sizeAt } from '../public/js/zoom/model.js';

export const zoomStops = (table) => SHEETS.map((s) => [s.zoom, table[s.id]]);
// The bus drawings this build makes (model.js, BUS_DRAWINGS): 13 and 15 between the sheets, and
// 12, 14 and 16 drawn again so each keeps the lettering of the one before (drawSheet, carry) and
// sets only lettering the page has room to show.
export const BETWEEN = [13, 15];
export const BUS_BUILT = [12, 13, 14, 15, 16];
const PITCH_13 = pitchAt({ rail: zoomStops(SIZES.rail), gap: zoomStops(SIZES.gap) }, REFERENCE_ZOOM);

// A rail piece as the page receives it. The pieces are sampled every few pixels of their own
// drawing, so the zoom-15 drawing carries four times the points of the zoom-13 one, most of them
// on straight track. Each is thinned to a tenth of a pixel at the closest zoom its drawing serves
// (RAIL_DRAWINGS: one zoom past its own). Only the shipped copy is thinned: names were placed
// against the full pieces.
export const THIN_PX = 0.1;
export function thinned(f, px = THIN_PX) {
  if (f.geometry.type !== 'LineString') return f;
  const coords = f.geometry.coordinates, { project } = projection(coords[0], 6);
  const tolerance = px * (40075016.686 * Math.cos((coords[0][1] * Math.PI) / 180)) / (512 * 2 ** (f.properties.ref + 1));
  return { ...f, geometry: { ...f.geometry, coordinates: simplify(coords.map((c, i) => [...project(c), i]), tolerance).map((p) => coords[p[2]]) } };
}

// The production size tables stay untouched after each synchronous experiment. This adapter
// is intentionally local to the trial; #155 replaces sheet lookups in the production build.
// Between two sheets a size runs straight from the wider sheet's value to the closer one's; a
// value that is not a number (a switch) keeps the wider sheet's until the closer sheet's zoom.
export function withZoom(zoom, run) {
  const hi = SHEETS.findIndex((s) => s.zoom >= zoom - 1e-9);
  if (hi < 1) throw new Error(`withZoom: ${zoom} is not between two sheets`);
  const lo = SHEETS[hi - 1], up = SHEETS[hi];
  const t = (zoom - lo.zoom) / (up.zoom - lo.zoom);
  const id = lo.id + t * (up.id - lo.id);
  const saved = [];
  for (const table of Object.values(SIZES)) {
    if (!table || typeof table !== 'object' || !Object.hasOwn(table, lo.id) || !Object.hasOwn(table, up.id)) continue;
    saved.push([table, Object.hasOwn(table, id), table[id]]);
    const a = table[lo.id], b = table[up.id];
    table[id] = typeof a === 'number' && typeof b === 'number' ? a + (b - a) * t : t < 1 - 1e-9 ? a : b;
  }
  try { return run({ id, zoom, streets: zoom >= 13 ? 'near' : 'far' }); }
  finally { for (const [table, existed, value] of saved) { if (existed) table[id] = value; else delete table[id]; } }
}

const feature = (properties, type, coordinates, extra = {}) => ({ type: 'Feature', properties, geometry: { type, coordinates }, ...extra });
const collection = (features) => ({ type: 'FeatureCollection', features });
const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const keep = (n) => ({ key: n.placement?.historyKey ?? `${n.mark.id}:0`, name: n.mark.name,
  anchor: n.anchor, text: n.text, offset: n.offset, reason: n.placement?.reason ?? 'independent placement',
  inkCost: n.placement?.inkCost ?? null, railCost: n.placement?.railCost ?? null, box: n.box, reach: n.placement?.reach ?? null });

export function drawRail(data, sheet, history = null, { lettering: named = true } = {}) {
  const lines = railLines(data.routes, sheet);
  const walls = halls(data.terminals, sheet);
  const marks = stationMarks(data.stations, lines, sheet, walls);
  const discs = letters(lines, marks, sheet);
  const streets = busStreets(data.streets, sheet, walls, marks, lines);
  const lettering = named ? names(marks, lines, discs, sheet, streets, history, { alternates: false }) : null;
  return { lines, marks, discs, streets, lettering };
}

export function drawnFeatures(drawing, sheet) {
  const back = (p) => toLonLat(p, sheet.zoom);
  return collection([
    ...drawing.lines.flatMap((l) => l.paths.map((p) => feature({ kind: 'rail', route: l.route, color: l.color }, 'LineString', p.map(back)))),
    ...drawing.marks.flatMap((m) => [m.ends, ...m.more].map((p, bi) => feature({ kind: 'station', id: m.id, name: m.name, lines: m.lines,
      hub: m.hub, single: Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) < 0.5, fat: !bi && m.fat, bar: bi }, 'LineString',
      (Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) < 0.5 ? [p[0], [p[0][0] + 0.5, p[0][1]]] : p).map(back)))),
    ...drawing.discs.map((d, i) => feature({ kind: 'letter', route: d.route, color: d.color, ink: d.ink, key: `${d.route}:${i}` }, 'Point', back(d.at))),
  ]);
}

// One shared rounded spine before offsets, rather than trying to remove the
// offsets from separately finished lines. This prevents residual geographic
// displacements from tightening a pack as it leaves a station or as zoom changes.
export function offsetDrawing(data, drawing, sheet) {
  const raw = railTracks(data.routes, sheet);
  const pitch = raw.pitch;
  const tracks = canonicalTracks(raw, sheet);
  const preliminary = new Map();
  for (const track of tracks) {
    const path = [];
    for (const piece of slotPieces(track)) path.push(...offset(piece.points, piece.slot * pitch).slice(path.length ? 1 : 0));
    if (!preliminary.has(track.route)) preliminary.set(track.route, { route: track.route, color: track.color, paths: [] });
    preliminary.get(track.route).paths.push(path);
  }
  const preliminaryWalls = halls(data.terminals, sheet);
  const preliminaryMarks = stationMarks(data.stations, [...preliminary.values()], sheet, preliminaryWalls);
  fitTerminalSpines(tracks, [...preliminary.values()], preliminaryMarks, pitch);

  const reference = [];
  const features = [];
  const lines = new Map();
  for (const track of tracks) {
    const points = [];
    const path = [];
    for (const piece of slotPieces(track)) {
      const positioned = offset(piece.points, piece.slot * pitch);
      features.push(feature({ kind: 'rail', route: track.route, color: track.color, slot: piece.slot,
        key: `${track.route}:${track.run}:${piece.from}` }, 'LineString', piece.points.map((p) => toLonLat(p, sheet.zoom))));
      for (let i = 0; i < positioned.length; i++) {
        const center = piece.points[i], at = positioned[i];
        const a = piece.points[Math.max(0, i - 1)], b = piece.points[Math.min(piece.points.length - 1, i + 1)];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        points.push({ at, slot: piece.slot, normal: [-(b[1] - a[1]) / d, (b[0] - a[0]) / d], center });
      }
      path.push(...positioned.slice(path.length ? 1 : 0));
    }
    reference.push({ route: track.route, points });
    if (!lines.has(track.route)) lines.set(track.route, { route: track.route, color: track.color, paths: [] });
    lines.get(track.route).paths.push(path);
  }
  // Derive the symbols from the same placed rail, so their attachment slots
  // and the rails agree. The existing sheet drawings remain a separate comparison.
  const walls = halls(data.terminals, sheet);
  const marks = stationMarks(data.stations, [...lines.values()], sheet, walls);
  const discs = letters([...lines.values()], marks, sheet);
  drawing = { ...drawing, lines: [...lines.values()], marks, discs };
  // Features that must follow the same rail slots: station bars, line letters and label anchors.
  const attach = (p, routes = null) => {
    const candidates = reference.filter((r) => !routes || routes.includes(r.route));
    let best = null;
    for (const r of candidates) for (const q of r.points) {
      const d = Math.hypot(q.at[0] - p[0], q.at[1] - p[1]);
      if (!best || d < best.d) best = { d, q };
    }
    if (!best) return [...p, 0, 0];
    const q = best.q;
    const along = (p[0] - q.at[0]) * q.normal[1] - (p[1] - q.at[1]) * q.normal[0];
    const center = [q.center[0] + along * q.normal[1], q.center[1] - along * q.normal[0]];
    return [...center, p[0] - center[0], p[1] - center[1]];
  };
  // A point on a line, held to that line's own slot: the nearest sample of the route's spine,
  // moved sideways exactly as the page moves the line (attachedPoint).
  const attachOn = (p, route) => {
    let best = null;
    for (const r of reference) if (r.route === route) for (const q of r.points) {
      const d = Math.hypot(q.center[0] - p[0], q.center[1] - p[1]);
      if (!best || d < best.d) best = { d, q };
    }
    return best && [...best.q.center, best.q.at[0] - best.q.center[0], best.q.at[1] - best.q.center[1]];
  };
  // Every attachment leaves here in one frame, whichever rail drawing it rides: a point in
  // REFERENCE_ZOOM pixels and a sideways move in REFERENCE_ZOOM pitches, so the page's
  // attachedPoint places it the same way for every drawing (model.js, RAIL_DRAWINGS).
  const shrink = 2 ** (sheet.zoom - REFERENCE_ZOOM), perPitch = PITCH_13 / pitch;
  const framed = (a) => a && [a[0] / shrink, a[1] / shrink, a[2] * perPitch, a[3] * perPitch];
  const ref = sheet.zoom;
  for (const f of features) f.properties.ref = ref;
  // Line letters are not taken from this one drawing: the build adds them zoom by zoom (main).
  const extras = drawnFeatures(drawing, sheet).features.filter((f) => !['rail', 'letter'].includes(f.properties.kind)).map((f) => {
    const routes = String(f.properties.lines ?? f.properties.route).split(' ');
    return { ...f, properties: { ...f.properties, ref }, attachment: f.geometry.type === 'Point' ? framed(attach(toPx(f.geometry.coordinates, sheet.zoom), routes))
      : f.geometry.coordinates.map((c) => framed(attach(toPx(c, sheet.zoom), routes))) };
  });
  // Both take a point in this drawing's own pixels.
  return { ref, rails: collection(features), attached: collection(extras), drawing,
    attach: (p, routes) => framed(attach(p, routes)), attachOn: (p, route) => framed(attachOn(p, route)) };
}

// The bus drawings from 12 to 16, written to `out`; returns what the report says of them.
export async function drawBus(data, dir, out) {
  // Each bus drawing is one of 12 to 16, so each bus drawing is only ever enlarged up to the next
  // (public/js/zoom/model.js, busDrawingAt). Each keeps every route list and street name the one
  // before it set, in place, and adds its own between them: zooming in, lettering is only added,
  // and zooming out only taken away (Chris, 2026-11-26: no labels that appear, disappear and
  // reappear). Rail, stations and their lettering come from the trial's own model, so they are
  // left out. A picked route's whole line is a file of its own, as on the sheets (#193).
  const bus = {};
  // The first has nothing to keep, but is drawn with the same care for the page's room.
  let carry = { lists: [], names: [] };
  for (const zoom of BUS_BUILT) {
    const started = performance.now();
    const drawn = withZoom(zoom, (sheet) => drawSheet(data, sheet, carry));
    const before = carry;
    carry = carryOf(drawn);
    bus[zoom] = { carried: { lists: before.lists.length, names: before.names.length } };
    const kept = drawn.features.filter((f) => !['rail', 'station', 'letter', 'group-key'].includes(f.properties.kind) && f.properties.shape !== 'name');
    const busRaw = JSON.stringify({ ...drawn, features: kept.filter((f) => f.properties.kind !== 'route-line') });
    const routesRaw = JSON.stringify(collection(kept.filter((f) => f.properties.kind === 'route-line')));
    await writeFile(path.join(out, `bus-${zoom}.geojson`), busRaw);
    await writeFile(path.join(out, `bus-${zoom}-routes.geojson`), routesRaw);
    bus[zoom] = { ...bus[zoom], features: kept.length, labels: kept.filter((f) => f.properties.kind === 'bus-label').length,
      bytes: { raw: Buffer.byteLength(busRaw), gzip: gzipSync(busRaw).length, routesGzip: gzipSync(routesRaw).length } };
    console.log(`bus drawing ${zoom}: ${kept.length} features; ${(performance.now() - started).toFixed(0)} ms`);
  }
  return bus;
}

async function main() {
  // `--bus` draws the bus drawings alone (a few minutes), keeping the rail drawings already built.
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'public/data');
  const out = path.join(dir, 'zoom-prototype');
  await mkdir(out, { recursive: true });
  const sourceNames = ['routes', 'stations', 'streets', 'terminals', 'stops'];
  const sources = {};
  const data = {};
  for (const name of sourceNames) {
    const raw = await readFile(path.join(dir, `${name}.geojson`));
    data[name] = JSON.parse(raw);
    if (data[name].type !== 'FeatureCollection') throw new Error(`${name} is not a FeatureCollection`);
    sources[name] = createHash('sha256').update(raw).digest('hex');
  }
  if (args.includes('--bus')) {
    const bus = await drawBus(data, dir, out);
    const report = JSON.parse(await readFile(path.join(out, 'report.json')));
    const bundle = JSON.parse(await readFile(path.join(out, 'trial.json')));
    report.bus = bus;
    bundle.report = { ...bundle.report, bus };
    await writeFile(path.join(out, 'trial.json'), JSON.stringify(bundle));
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    return;
  }
  const sizes = Object.fromEntries(['rail', 'gap', 'name', 'nameLetter', 'letterDisc'].map((k) => [k, zoomStops(SIZES[k])]));
  // One rail drawing for each stretch of the band (model.js, RAIL_DRAWINGS): 13 serves 12 to 14 and
  // 15 serves 14 to 16, so no drawing is enlarged or shrunk by more than one zoom.
  const bases = new Map(RAIL_DRAWINGS.map((d) => [d.ref, withZoom(d.ref, (sheet) => {
    const drawing = drawRail(data, sheet);
    return { drawing, ...offsetDrawing(data, drawing, sheet) };
  })]));
  const base = bases.get(REFERENCE_ZOOM);
  const drawings = new Map();
  // One pass over the band, MIN_ZOOM to MAX_ZOOM. `seed` is where each name starts at the widest zoom.
  const runBand = (seed) => {
    const history = new Map(seed);
    const frames = [];
    // Line letters, placed from the widest zoom inward (Been, Daiches and Yap 2006): each drawing
    // adds a letter only where its line has none near enough, and a letter once shown stays, on
    // its line's slot, for every closer zoom. So zooming in adds letters and never moves one.
    const carried = [];
    const comparisons = [];
    let before = null;
    for (let zoom = MIN_ZOOM, f = 0; zoom <= MAX_ZOOM; zoom += 0.25, f++) {
      const ref = railRefAt(zoom), rb = bases.get(ref);
      const started = performance.now();
      // A planned change of side: the name is offered its new side as if it had held it.
      for (const [key, path] of seed.plan ?? []) if (f && path[f] !== path[f - 1] && history.has(key)) history.set(key, { ...history.get(key), anchor: path[f] });
      const frame = withZoom(zoom, (sheet) => {
        // The drawing itself does not depend on the names' history, so both passes share it.
        if (!drawings.has(zoom)) drawings.set(zoom, drawRail(data, sheet, null, { lettering: false }));
        const drawn = drawings.get(zoom);
        // Names keep off the line letters the page shows (carried from wider zooms, on their
        // lines' slots), not this drawing's own letters, which the page never shows.
        const placedAt = (l) => { const [x, y, dx, dy] = l.attachments[ref]; const k = pitchAt(sizes, zoom) / pitchAt(sizes, REFERENCE_ZOOM) / 2 ** (zoom - REFERENCE_ZOOM);
          return toPx(toLonLat([x + dx * k, y + dy * k], REFERENCE_ZOOM), zoom); };
        // And off the rail the page shows: the reference centre lines, moved sideways by slot
        // times this zoom's pitch (style.js, line-offset), not this drawing's own packs.
        const shownLines = new Map();
        for (const f of rb.rails.features) {
          const { route, color, slot } = f.properties;
          const centre = f.geometry.coordinates.map((c) => toPx(c, zoom));
          if (!shownLines.has(route)) shownLines.set(route, { route, color, paths: [] });
          shownLines.get(route).paths.push(slot ? offset(centre, slot * pitchAt(sizes, zoom)) : centre);
        }
        const shown = carried.map((l) => ({ ...l, at: placedAt(l) }));
        const drawing = { ...drawn, lines: [...shownLines.values()], discs: [...shown] };
        // Independent placement measured with its ink: a throwaway history-free pass that records costs.
        const independent = names(drawing.marks, drawing.lines, drawing.discs, sheet, drawing.streets, new Map(), { alternates: false }).map(keep);
        const lettering = names(drawing.marks, drawing.lines, drawing.discs, sheet, drawing.streets, history, { alternates: false });
        const stable = lettering.map(keep);
        // Then the letters this zoom adds, where their line has none near enough.
        const every = SIZES.letterEvery[sheet.id], clear = SIZES.letterClear[sheet.id];
        for (const d of letters([...shownLines.values()], drawn.marks, sheet)) {
          if (shown.some((l) => l.route === d.route && Math.hypot(l.at[0] - d.at[0], l.at[1] - d.at[1]) < every * 0.6)) continue;
          if (shown.some((l) => Math.hypot(l.at[0] - d.at[0], l.at[1] - d.at[1]) < 2 * clear)) continue;
          // A name already showing keeps its place: a new letter goes where no name is.
          const r = sizeAt(sizes.letterDisc, zoom) + 2;
          if (lettering.some((n) => d.at[0] > n.box[0] - r && d.at[0] < n.box[2] + r && d.at[1] > n.box[1] - r && d.at[1] < n.box[3] + r)) continue;
          // Held on its line in every rail drawing, so it stays put when the drawing changes.
          const attachments = Object.fromEntries([...bases].map(([r, b]) => [r, b.attachOn(toPx(toLonLat(d.at, zoom), r), d.route)]));
          if (Object.values(attachments).some((a) => !a)) continue;
          const letter = { route: d.route, color: d.color, ink: d.ink, minzoom: zoom, attachments };
          carried.push(letter);
          shown.push({ ...letter, at: placedAt(letter) });
        }
        const shownDiscs = shown;
        const labelFeatures = [];
        for (const n of lettering) {
          const key = n.placement.historyKey;
          const bi = Number(key.split(':').at(-1));
          const mark = rb.drawing.marks.find((m) => m.id === n.mark.id);
          const anchor = mark ? mid([mark.ends, ...mark.more][bi] ?? mark.ends) : toPx(toLonLat(n.at, zoom), ref);
          const attachment = rb.attach(anchor, String(n.mark.lines).split(' '));
          const properties = { kind: 'name', id: n.mark.id, key, name: n.mark.name, lines: n.mark.lines, text: n.text,
            anchor: n.anchor, offset: n.offset, justify: n.justify, reason: n.placement.reason };
          labelFeatures.push(feature(properties, 'Point', toLonLat(n.at, zoom), { attachment }));
          for (const d of n.letters) labelFeatures.push(feature({ kind: 'letter', small: true, route: d.route, color: d.color, ink: d.ink,
            key: `${key}:${d.route}` }, 'Point', toLonLat(d.at, zoom), { attachment,
            labelOffset: [d.at[0] - n.at[0], d.at[1] - n.at[1]], labelZoom: zoom }));
          history.set(key, n.placement);
        }
        // Names whose lettering crosses a shown rail line or a line letter (not merely its margin).
        const discR = sizeAt(sizes.letterDisc, zoom);
        const railPts = drawing.lines.flatMap((l) => l.paths.flatMap((pth) => resample(pth, 1)));
        const crossing = (list) => list.filter((x) => x.box && (railPts.some((p) => p[0] > x.box[0] + 1 && p[0] < x.box[2] - 1 && p[1] > x.box[1] + 1 && p[1] < x.box[3] - 1)
          || shownDiscs.some((d) => Math.hypot(Math.max(x.box[0] - d.at[0], 0, d.at[0] - x.box[2]), Math.max(x.box[1] - d.at[1], 0, d.at[1] - x.box[3])) < discR))).map((x) => x.name);
        // Control: a name planted on a rail line, and one planted on a letter, must be caught.
        const [px, py] = railPts[Math.floor(railPts.length / 2)], [dx, dy] = shownDiscs[0].at;
        const planted = crossing([{ name: 'planted rail', box: [px - 20, py - 6, px + 20, py + 6] }, { name: 'planted letter', box: [dx + 6, dy - 5, dx + 40, dy + 5] }]);
        if (planted.length !== 2) throw new Error(`rail crossing detector missed a planted fault at ${zoom}: ${planted}`);
        const onRail = { independent: crossing(independent), stable: crossing(stable) };
        const options = new Map(lettering.map((n) => [n.placement.historyKey, n.placement.options ?? {}]));
      return { zoom, labels: collection(labelFeatures), independent, stable, onRail, options };
      });
      // A name that keeps its side but changes its wording (shortened, or set on one row) jumps too.
      const stepped = (a, b) => b.filter((n) => { const o = a.find((x) => x.key === n.key); return o && o.anchor === n.anchor && o.reach !== n.reach; }).map((n) => n.name);
    const reworded = (a, b) => b.filter((n) => { const o = a.find((x) => x.key === n.key); return o && o.anchor === n.anchor && o.text !== n.text; }).map((n) => n.name);
      if (before) comparisons.push({ from: before.zoom, to: zoom, independent: { ...labelChanges(before.independent, frame.independent), reworded: reworded(before.independent, frame.independent) },
        stable: { ...labelChanges(before.stable, frame.stable), reworded: reworded(before.stable, frame.stable), stepped: stepped(before.stable, frame.stable) } });
      before = frame;
      frames.push(frame);
      console.log(`zoom ${zoom}: ${frame.stable.length} names; ${(performance.now() - started).toFixed(0)} ms`);
    }
    return { frames, comparisons, carried };
  };
  // Place offline (Been, Daiches and Yap 2006): the first pass scores every side of every name
  // at every zoom. For each name the plan is the run of sides over the band with the fewest
  // changes, using only sides the hold rule would keep (no other name, not stranded, no more
  // rail or bus ink than the clearest side allows), then the lowest cost. The second pass
  // starts each name on its planned side and moves it only where the plan does.
  const first = runBand(new Map());
  const keepable = (o, all) => {
    const free = Object.values(all).filter((x) => x.ok).sort((x, y) => x.score - y.score)[0];
    return o.ok && (!free || (o.rail - free.rail <= HOLD_RAIL_SLACK && o.ink - free.ink <= Math.max(HOLD_INK_SLACK, free.ink * 0.5)));
  };
  const plan = new Map();
  for (const key of new Set(first.frames.flatMap((f) => f.stable.map((x) => x.key)))) {
    const seen = first.frames.map((f) => f.options.get(key) ?? {});
    const anchors = [...new Set(seen.flatMap((o) => Object.keys(o)))];
    // cost[f][a]: fewest changes (weighted 1e4), then summed score, ending frame f on side a.
    let cost = anchors.map((a) => (seen[0][a] && keepable(seen[0][a], seen[0]) ? { c: seen[0][a].score, path: [a] } : null));
    for (let f = 1; f < seen.length; f++) {
      cost = anchors.map((a) => {
        if (!seen[f][a] || !keepable(seen[f][a], seen[f])) return null;
        let best = null;
        anchors.forEach((b, j) => { const prev = cost[j]; if (!prev) return;
          const c = prev.c + seen[f][a].score + (a === b ? 0 : 1e4);
          if (!best || c < best.c) best = { c, path: [...prev.path, a] }; });
        return best;
      });
    }
    const done = cost.filter(Boolean).sort((x, y) => x.c - y.c)[0];
    if (done) plan.set(key, done.path);
  }
  const start = first.frames[0];
  const seed = new Map([...plan].map(([key, path]) => [key, { anchor: path[0], text: start.stable.find((x) => x.key === key)?.text, reach: 1, historyKey: key }]));
  seed.plan = plan;
  const { frames, comparisons, carried } = runBand(seed);
  const firstPass = first.comparisons.reduce((n, c) => n + c.stable.changed, 0);
  const planned = [...plan.values()].reduce((n, p) => n + p.filter((a, i) => i && a !== p[i - 1]).length, 0);
  // A planned move happens because the side it leaves cannot be held somewhere further in.
  const whyLeave = (o, all) => {
    if (!o) return 'that side has no place for the name';
    if (!o.ok) return 'another name is on that side, or it reads as another station';
    const free = Object.values(all).filter((x) => x.ok).sort((x, y) => x.score - y.score)[0];
    if (o.rail - free.rail > HOLD_RAIL_SLACK) return `rail under the name: ${o.rail - free.rail} cells more than the clearest place`;
    return `line obstruction ${o.ink - free.ink} more than the clearest place`;
  };
  comparisons.forEach((c, i) => c.stable.changes.forEach((x) => {
    const path = plan.get(x.key);
    if (!path || path[i + 1] !== x.to || path[i] === path[i + 1]) return;
    for (let g = i + 1; g < first.frames.length; g++) {
      const all = first.frames[g].options.get(x.key) ?? {};
      if (!all[path[i]] || !keepable(all[path[i]], all)) { x.reason = `planned: at ${first.frames[g].zoom} the old side fails: ${whyLeave(all[path[i]], all)}`; return; }
    }
  }));
  const offPlan = comparisons.flatMap((c, i) => c.stable.changes.filter((x) => plan.get(x.key)?.[i + 1] !== x.to)
    .map((x) => ({ zoom: c.to, name: x.name, planned: plan.get(x.key)?.[i + 1], got: x.to, reason: x.reason })));
  const report = { referenceZoom: REFERENCE_ZOOM, sources, comparisons, offPlan,
    totals: { independent: comparisons.reduce((n, c) => n + c.independent.changed, 0), stable: comparisons.reduce((n, c) => n + c.stable.changed, 0),
      disappeared: comparisons.reduce((n, c) => n + c.stable.disappeared.length, 0), firstPass, planned,
      rewordedIndependent: comparisons.reduce((n, c) => n + c.independent.reworded.length, 0), rewordedStable: comparisons.reduce((n, c) => n + c.stable.reworded.length, 0),
      steppedStable: comparisons.reduce((n, c) => n + c.stable.stepped.length, 0) },
    // What holding costs: ink under the names, summed over every drawing, held against fresh placement.
    ink: (() => {
      const sum = (k, f) => frames.reduce((n, fr) => n + fr[k].reduce((m, x) => m + (x[f] ?? 0), 0), 0);
      const worst = frames.flatMap((fr) => fr.stable.map((x) => ({ zoom: fr.zoom, name: x.name,
        extra: (x.inkCost ?? 0) - (fr.independent.find((y) => y.key === x.key)?.inkCost ?? 0) }))).sort((a, b) => b.extra - a.extra).slice(0, 8);
      return { independent: { ink: sum('independent', 'inkCost'), rail: sum('independent', 'railCost') },
        stable: { ink: sum('stable', 'inkCost'), rail: sum('stable', 'railCost') }, worstHeld: worst,
        railByName: Object.entries(frames.flatMap((fr) => fr.stable.map((x) => [x.name, (x.railCost ?? 0) - (fr.independent.find((y) => y.key === x.key)?.railCost ?? 0)]))
          .reduce((o, [n, v]) => ({ ...o, [n]: (o[n] ?? 0) + v }), {})).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 12) };
    })(),
    onRail: { independent: frames.reduce((n, f) => n + f.onRail.independent.length, 0), stable: frames.reduce((n, f) => n + f.onRail.stable.length, 0),
      byZoom: frames.map((f) => ({ zoom: f.zoom, independent: f.onRail.independent, stable: f.onRail.stable })) },
    railPieces: Object.fromEntries([...bases].map(([r, b]) => [r, b.rails.features.length])),
    limitation: 'Shared spines are canonical at the reference zoom; per-zoom symbol source updates and label continuity still need physical-phone review.' };
  // One feature for each letter in each rail drawing; the page shows the drawing's own.
  const letterFeatures = carried.flatMap((l, i) => [...bases.keys()].map((ref) => ({ ...feature({ kind: 'letter', route: l.route, color: l.color, ink: l.ink,
    minzoom: l.minzoom, ref, key: `${l.route}:${i}` }, 'Point', toLonLat(l.attachments[ref].slice(0, 2), REFERENCE_ZOOM)), attachment: l.attachments[ref] })));
  report.letters = { total: carried.length, byZoom: Object.fromEntries(frames.map((f) => [f.zoom, carried.filter((l) => l.minzoom <= f.zoom).length])) };
  const bundle = { sizes, referenceZoom: REFERENCE_ZOOM, rails: collection([...bases.values()].flatMap((b) => b.rails.features).map((f) => thinned(f))),
    attached: collection([...[...bases.values()].flatMap((b) => b.attached.features), ...letterFeatures]),
    frames: frames.map(({ zoom, labels }) => ({ zoom, labels })), report };
  report.bus = await drawBus(data, dir, out);
  const raw = JSON.stringify(bundle);
  report.bytes = { raw: Buffer.byteLength(raw), gzip: gzipSync(raw).length };
  await writeFile(path.join(out, 'trial.json'), JSON.stringify(bundle));
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ totals: report.totals, bytes: report.bytes, railPieces: report.railPieces }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
