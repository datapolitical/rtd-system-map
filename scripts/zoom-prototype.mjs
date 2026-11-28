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
import { textWidth } from './glyphs.mjs';
import { labelChanges, labelsAt, attachedCollection, REFERENCE_ZOOM, MIN_ZOOM, MAX_ZOOM, RAIL_DRAWINGS, LISTS_PLACED, railRefAt, pitchAt, sizeAt } from '../public/js/zoom/model.js';
import { BUS_WIDTH, ROW_HEIGHT, numberOffset } from '../public/js/sheets/style.js';

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

// A divided road is one line at every zoom of the trial, and two lines only where a route's two
// directions use different streets (Chris, 2026-11-27: "One line unless the directions use
// different streets"; DESIGN.md's decision log). The joined street graph keeps the two
// carriageways of one road as one line and different streets apart, so every drawing uses it: a
// road keeps one shape through the band. Drawings from this zoom would use both carriageways;
// past MAX_ZOOM, none does. TRIAL_CARRIAGEWAYS_FROM draws a variant for a comparison (16: both
// carriageways at 16, as before), e.g. `TRIAL_CARRIAGEWAYS_FROM=16 node scripts/zoom-prototype.mjs --bus <copy of data>`.
export const CARRIAGEWAYS_FROM = Number(process.env.TRIAL_CARRIAGEWAYS_FROM) || MAX_ZOOM + 1;

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
  try { return run({ id, zoom, streets: zoom >= CARRIAGEWAYS_FROM - 1e-9 ? 'near' : 'far' }); }
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

// Route lists the build places itself (#156; model.js, LISTS_PLACED). drawSheet gives each list
// the stretch of street it runs along, for MapLibre to set it there, and MapLibre hides the list
// whenever its own tests fail: the stretch too short to start a label on (it wants two more glyph
// sizes at each end than the lettering), or turning too sharply under it. Here the build makes
// those decisions and the page draws what it is given (style.js):
//   - a list stands straight where its stretch is straight for the lettering's whole length
//     (LIST_STRAIGHT), at the clear place nearest the stretch's middle: a point with the angle
//     the street runs at, as a stacked list already is. A turned point takes room as the upright
//     box around it, on downtown's diagonal grid several times the lettering, so the page gives
//     these lists no room of their own, and each comes with a `list-room` line the length of its
//     lettering, along which the page sets unseen marks that take the room instead (as
//     keep-off-bus does for a bus line);
//   - where no such place is, the list follows its stretch about the middle, if the stretch turns
//     gently enough to read along (LIST_FOLLOW);
//   - a clear place is one where the list lies on no other list and on no rail, station's mark or
//     station's lettering at any zoom its drawing serves (fixedOver). drawSheet kept the list off
//     its own drawing of the rail; the page shows the trial's;
//   - a list with no clear place tries again without its street's name leading, and then, both
//     ways, on the other side of its street, where it must be clear of the bus lines too;
//   - and a list that still has no place is left out, and the report says which and why.
// How far, in pixels at the drawing's zoom, a street may leave the straight line under a list that
// stands straight (twice that by the zoom the next drawing takes over).
export const LIST_STRAIGHT = 1.5;
export const LIST_FOLLOW = 25;
// Clear ground kept between a list's lettering and rail, a station's mark or other lettering.
export const LIST_AIR = 1.5;
const LIST_FONT = 'Overpass SemiBold', LEAD_FONT = 'Overpass Regular', NAME_FONT = 'Overpass SemiBold', LIST_SPACING = 0.02;
// How wide the page sets a list at `size`: its figures (the longer row of a stack), and before
// them its street's name and an em of space where the build found room for one
// (public/js/sheets/style.js, busNumber).
export const listWide = ({ label, street }, size) => Math.max(...String(label).split('\n').map((row) => textWidth(row, LIST_FONT, size, LIST_SPACING)))
  + (street ? textWidth(street, LEAD_FONT, size, LIST_SPACING) + (1 + 2 * LIST_SPACING) * size : 0);
const LIST_SIZES = SHEETS.map((s) => [s.zoom, SIZES.busLabelSize[s.id]]);
// How far a list's middle stands off its street, in ems of its size (down the screen for a list
// read left to right; negative is above the street): the page's own rule, for the sheet whose
// layers draw this zoom's drawing.
const listOff = ({ cls, side, label }, zoom) => {
  const n = SHEETS.find((s) => s.zoom >= zoom - 1e-9).id, rows = String(label).split('\n').length;
  const off = numberOffset(n, BUS_WIDTH[n][cls] ?? Object.values(BUS_WIDTH[n])[0]) + (rows > 1 ? -ROW_HEIGHT / 2 : 0);
  return side === -1 ? -off : off;
};
const span = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lengthOf = (p) => p.slice(1).reduce((sum, q, i) => sum + span(p[i], q), 0);
const pointAt = (p, d) => {
  for (let i = 1; i < p.length; i++) {
    const step = span(p[i - 1], p[i]);
    if (d <= step || i === p.length - 1) { const t = step ? Math.max(0, Math.min(1, d / step)) : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
    d -= step;
  }
  return p[0];
};
const pieceOf = (p, from, to) => {
  const out = [pointAt(p, from)];
  for (let i = 1, d = 0; i < p.length - 1; i++) { d += span(p[i - 1], p[i]); if (d > from && d < to) out.push(p[i]); }
  return [...out, pointAt(p, to)];
};
// Each place on the stretch `p` where lettering `wide` can stand straight, nearest `from` first
// (a distance along the stretch; its middle unless given) and a pixel at a time either way: the
// way the street runs under it, and the point it is set from. `toward` is the side the list
// stands on (1: to the right of the way the street runs, which is below it on the screen). The
// street may leave the straight line between the lettering's ends by LIST_STRAIGHT in all; the
// point is on that line moved out to where the street comes nearest the list, so the list is
// nowhere closer to its street than the page sets it.
function* standings(p, wide, toward, from = null) {
  const whole = lengthOf(p), [lo, hi] = [wide / 2 - 1e-6, whole - wide / 2 + 1e-6];
  const start = Math.max(wide / 2, Math.min(whole - wide / 2, from ?? whole / 2));
  for (let k = 0; start - k >= lo || start + k <= hi; k++) {
    for (const mid of k ? [start - k, start + k] : [start]) {
      if (mid < lo || mid > hi) continue;
      const piece = pieceOf(p, Math.max(0, mid - wide / 2), Math.min(whole, mid + wide / 2));
      const [a, b] = [piece[0], piece.at(-1)], l = span(a, b);
      if (!l) continue;
      const u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      const out = piece.map((q) => toward * ((q[1] - a[1]) * u[0] - (q[0] - a[0]) * u[1])), high = Math.max(...out);
      if (high - Math.min(...out) > LIST_STRAIGHT) continue;
      yield { at: [(a[0] + b[0]) / 2 - u[1] * toward * high, (a[1] + b[1]) / 2 + u[0] * toward * high], u };
    }
  }
}
// Whether lettering `wide` set about the middle of `p` turns gently enough to read: the turns
// within any 3/5 of a glyph, summed, stay under LIST_FOLLOW degrees (MapLibre's own test,
// check_max_angle; the page allows a little more, so this one decides), and the stretch reaches a
// pixel past the lettering at each end. MapLibre asks both of the lettering at the largest size
// the page ever sets it (`top`, the size when the next drawing takes over; style.js, sizeUntil)
// against the stretch at the drawing's own zoom, so the lettering is measured that much longer.
function follows(p, wide, size, top = size) {
  const whole = lengthOf(p), corners = [], reach = (wide * top) / size;
  if (whole < reach + 2) return false;
  for (let i = 1, d = 0; i < p.length - 1; i++) {
    d += span(p[i - 1], p[i]);
    if (d < whole / 2 - reach / 2 || d > whole / 2 + reach / 2) continue;
    const turn = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]) - Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]);
    corners.push({ d, turn: Math.abs(((turn + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) });
  }
  return corners.every((c, i) => corners.slice(i).filter((o) => o.d - c.d <= 0.6 * top).reduce((sum, o) => sum + o.turn, 0) * 180 / Math.PI <= LIST_FOLLOW);
}

// What the page sets before the lists and always shows, at the zooms the drawing at `zoom` serves:
// the trial's rail, station marks, line letters and station names (trial.json), each in the pixels
// of its zoom. A name glides, and changes side, between the quarter-zoom frames it was placed at,
// so each step is read at its start, its middle and just short of its end.
export function fixedOver(bundle, zoom) {
  const { sizes } = bundle;
  // The zooms the drawing serves, up to the trial's last.
  return [0, 0.125, 0.2499, 0.25, 0.375, 0.4999, 0.5, 0.625, 0.7499, 0.75, 0.875, 0.9999].filter((t) => zoom + t <= MAX_ZOOM + 1e-9).map((t) => {
    const z = zoom + t, ref = railRefAt(z), wide = sizeAt(sizes.rail, z), pitch = pitchAt(sizes, z);
    const lines = [], discs = [], boxes = [];
    for (const f of bundle.rails.features) {
      if (f.properties.ref !== ref) continue;
      const centre = f.geometry.coordinates.map((c) => toPx(c, z));
      lines.push({ path: f.properties.slot ? offset(centre, f.properties.slot * pitch) : centre, half: wide / 2 + 0.6, what: 'rail' });
    }
    const attached = attachedCollection({ features: bundle.attached.features.filter((f) => (f.properties.ref ?? REFERENCE_ZOOM) === ref && !(f.properties.minzoom > z + 1e-9)) }, sizes, z);
    for (const f of attached.features) {
      if (f.properties.kind === 'letter') { discs.push({ at: toPx(f.geometry.coordinates, z), r: sizeAt(sizes.letterDisc, z), what: 'letter' }); continue; }
      // A station's mark as the page draws it (style.js, mark, and its edge).
      const thin = f.properties.single ? wide + 1.4 : f.properties.hub ? wide * 0.72 + 2.2 : wide * 0.72;
      lines.push({ path: f.geometry.coordinates.map((c) => toPx(c, z)), half: ((f.properties.fat ? 1.6 * thin + 1 : thin) + 2.6) / 2, what: 'station' });
    }
    const size = sizeAt(sizes.name, z);
    for (const f of labelsAt(bundle.frames, z, sizes, { sides: new Map(), fades: new Map() }, 0, { motion: false }).collection.features) {
      const [x, y] = toPx(f.geometry.coordinates, z);
      if (f.properties.kind === 'letter') { discs.push({ at: [x, y], r: sizeAt(sizes.nameLetter, z) + 1.5, what: 'name' }); continue; }
      const rows = String(f.properties.text).split('\n'), anchor = f.properties.anchor ?? 'center';
      const w = Math.max(...rows.map((row) => textWidth(row, NAME_FONT, size))), h = rows.length * 1.12 * size;
      const ax = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5, ay = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
      boxes.push({ box: [x - ax * w, y - ay * h, x + (1 - ax) * w, y + (1 - ay) * h], what: 'name' });
    }
    return { zoom: z, near: nearOf(lines, discs, boxes) };
  });
}

// What a point is near: lines of a half width (`path`, `half`), discs (`at`, `r`) and upright
// boxes (`box`), each with `what` it is. Returns near(q, reach): what lies within `reach` of the
// point `q`, if anything (reach under 24 px). A coarse grid, so a list asks only what is near it.
function nearOf(lines, discs = [], boxes = []) {
  const CELL = 96, REACH = 24, grid = new Map();
  const put = (x1, y1, x2, y2, item) => {
    for (let i = Math.floor(x1 / CELL); i <= Math.floor(x2 / CELL); i++) for (let j = Math.floor(y1 / CELL); j <= Math.floor(y2 / CELL); j++) {
      const key = `${i},${j}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(item);
    }
  };
  for (const l of lines) for (let i = 1; i < l.path.length; i++) {
    const [a, b] = [l.path[i - 1], l.path[i]];
    put(Math.min(a[0], b[0]) - REACH, Math.min(a[1], b[1]) - REACH, Math.max(a[0], b[0]) + REACH, Math.max(a[1], b[1]) + REACH, { a, b, half: l.half, what: l.what });
  }
  for (const d of discs) put(d.at[0] - d.r - REACH, d.at[1] - d.r - REACH, d.at[0] + d.r + REACH, d.at[1] + d.r + REACH, d);
  for (const b of boxes) put(b.box[0] - REACH, b.box[1] - REACH, b.box[2] + REACH, b.box[3] + REACH, b);
  return (q, reach) => {
    for (const item of grid.get(`${Math.floor(q[0] / CELL)},${Math.floor(q[1] / CELL)}`) ?? []) {
      let d;
      if (item.box) d = Math.hypot(Math.max(item.box[0] - q[0], 0, q[0] - item.box[2]), Math.max(item.box[1] - q[1], 0, q[1] - item.box[3]));
      else if (item.at) d = span(item.at, q) - item.r;
      else {
        const [vx, vy] = [item.b[0] - item.a[0], item.b[1] - item.a[1]], l2 = vx * vx + vy * vy;
        const t = l2 ? Math.max(0, Math.min(1, ((q[0] - item.a[0]) * vx + (q[1] - item.a[1]) * vy) / l2)) : 0;
        d = Math.hypot(q[0] - item.a[0] - vx * t, q[1] - item.a[1] - vy * t) - item.half;
      }
      if (d < reach) return item.what;
    }
    return null;
  };
}

// The middle line of a list's lettering at the zoom `z`, a point every 2 px or so, and how far
// its ink reaches either side of that line. `place` is where the list stands at its drawing's
// zoom `zoom`: a point and direction, or the stretch it follows.
function inkOf(properties, place, zoom, z) {
  const size = sizeAt(LIST_SIZES, z), k = 2 ** (z - zoom), wide = listWide(properties, size), rows = String(properties.label).split('\n').length;
  const off = listOff(properties, zoom) * size, reach = ((0.72 + ROW_HEIGHT * (rows - 1)) * size) / 2;
  const n = Math.max(2, Math.ceil(wide / 2));
  const points = [];
  if (place.at) {
    const c = [place.at[0] * k - place.u[1] * off, place.at[1] * k + place.u[0] * off];
    for (let i = 0; i <= n; i++) { const t = -wide / 2 + (wide * i) / n; points.push([c[0] + place.u[0] * t, c[1] + place.u[1] * t]); }
  } else {
    const path = place.path.map((q) => [q[0] * k, q[1] * k]), middle = lengthOf(path) / 2;
    for (let i = 0; i <= n; i++) {
      const d = middle - wide / 2 + (wide * i) / n, [a, b] = [pointAt(path, Math.max(0, d - 1)), pointAt(path, d + 1)], l = span(a, b) || 1, q = pointAt(path, d);
      points.push([q[0] - ((b[1] - a[1]) / l) * off, q[1] + ((b[0] - a[0]) / l) * off]);
    }
  }
  return { points, reach };
}

// `fixed` (fixedOver) is what the lists must keep off; without it only other lists are. `before`
// is the features this gave the drawing one zoom out: a list that stood there is looked for a
// place from where it stood, on the side it stood, before the lists new to this drawing take
// theirs, so it keeps its place when this drawing takes over.
export function placedLists(features, zoom, fixed = null, before = null) {
  const size = sizeAt(LIST_SIZES, zoom);
  const counts = { placed: 0, along: 0, unnamed: 0, moved: 0, across: 0, held: 0 }, left = [];
  const stood = (before ?? []).filter((f) => f.properties.kind === 'bus-list').map((f) => {
    const r = (f.properties.angle * Math.PI) / 180;
    return { label: f.properties.label, side: f.properties.side, at: toPx(f.geometry.coordinates, zoom), u: [Math.cos(r), Math.sin(r)] };
  });
  // Where along the stretch `p` the same list stood one zoom out, if it stood on this stretch (not
  // past either end of it: that one belongs to the next stretch along). Each is one stretch's.
  const HELD_NEAR = 6;
  const stoodOn = (label, p) => {
    const whole = lengthOf(p);
    let best = null;
    for (const o of stood) {
      if (o.label !== label || o.taken) continue;
      for (let i = 1, far = 0; i < p.length; i++) {
        const [a, b] = [p[i - 1], p[i]], step = span(a, b), t = step ? Math.max(0, Math.min(1, ((o.at[0] - a[0]) * (b[0] - a[0]) + (o.at[1] - a[1]) * (b[1] - a[1])) / (step * step))) : 0;
        const d = Math.hypot(o.at[0] - a[0] - (b[0] - a[0]) * t, o.at[1] - a[1] - (b[1] - a[1]) * t), from = far + step * t;
        if (d <= HELD_NEAR && from > 0.5 && from < whole - 0.5 && (!best || d < best.d)) best = { d, from, o };
        far += step;
      }
    }
    if (!best) return null;
    best.o.taken = true;
    return { from: best.from, side: best.o.side, at: best.o.at, u: best.o.u };
  };
  // Whether lettering `wide` can stand exactly where the list stood one zoom out: within the
  // stretch, the street no nearer the list than the page sets it (half a pixel's grace) and no
  // further off than a street may bend under a list by the end of a drawing's zooms.
  const holds = (p, wide, toward, was) => {
    if (was.from - wide / 2 < -1e-6 || was.from + wide / 2 > lengthOf(p) + 1e-6) return false;
    return pieceOf(p, Math.max(0, was.from - wide / 2), was.from + wide / 2).every((q) => {
      const out = toward * ((q[1] - was.at[1]) * was.u[0] - (q[0] - was.at[0]) * was.u[1]);
      return out <= 0.5 && out >= -2 * LIST_STRAIGHT - 0.5;
    });
  };
  // The lists placed so far, as the points of their ink at each end of the zooms the drawing
  // serves: lists grow more slowly than the map does, so one clear of another at both is clear of
  // it between.
  // The ends of the zooms the drawing serves, up to the trial's last (16 serves 16 alone).
  const ENDS = [zoom, Math.min(zoom + 0.9999, MAX_ZOOM)], CELL = 32, taken = ENDS.map(() => new Map());
  const cell = (q) => `${Math.floor(q[0] / CELL)},${Math.floor(q[1] / CELL)}`;
  const inks = (properties, place) => ENDS.map((z) => inkOf(properties, place, zoom, z));
  const take = (properties, place) => inks(properties, place).forEach((ink, e) => {
    for (const q of ink.points) { if (!taken[e].has(cell(q))) taken[e].set(cell(q), []); taken[e].get(cell(q)).push({ q, reach: ink.reach }); }
  });
  const blocked = (properties, place) => {
    for (const [e, ink] of inks(properties, place).entries()) for (const q of ink.points) {
      const [i, j] = [Math.floor(q[0] / CELL), Math.floor(q[1] / CELL)];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const o of taken[e].get(`${i + di},${j + dj}`) ?? []) {
        if (span(o.q, q) < o.reach + ink.reach + LIST_AIR) return 'list';
      }
    }
    for (const at of fixed ?? []) {
      const ink = inkOf(properties, place, zoom, at.zoom);
      for (const q of ink.points) { const what = at.near(q, ink.reach + LIST_AIR); if (what) return what; }
    }
    return null;
  };
  // The drawing's bus lines, their ends and the hall, for a list tried on the side of its street
  // the sheet's build did not choose: there it must be clear of them too. (On the side it chose,
  // the build has seen to that.) The list's own street is LIST_GAP from its ink, so less is asked.
  const LIST_GAP = 0.4;
  const streets = ENDS.map((z) => {
    const n = SHEETS.find((sh) => sh.zoom >= z - 1e-9).id, lines = [], discs = [];
    for (const f of features) {
      if (f.properties.kind === 'bus') lines.push({ path: f.geometry.coordinates.map((c) => toPx(c, z)), half: (BUS_WIDTH[n][f.properties.cls] ?? Object.values(BUS_WIDTH[n])[0]) / 2, what: 'street' });
      else if (f.properties.kind === 'hall') for (const ring of f.geometry.coordinates) lines.push({ path: ring.map((c) => toPx(c, z)), half: 0.5, what: 'street' });
      else if (f.properties.kind === 'bus-end') discs.push({ at: toPx(f.geometry.coordinates, z), r: 4, what: 'street' });
    }
    return nearOf(lines, discs);
  });
  const crowded = (properties, place) => {
    for (const [e, ink] of inks(properties, place).entries()) for (const q of ink.points) if (streets[e](q, ink.reach + LIST_GAP)) return 'street';
    return null;
  };
  const words = (q) => `${q.street ? `${q.street} ` : ''}${String(q.label).replace(/\n/g, ' / ')}`;
  // The list as the build made it, then on the other side of its street.
  const turned = (q) => { const { side, ...rest } = q; return [q, side === -1 ? rest : { ...rest, side: -1 }]; };
  // A stacked list is a point already, with nowhere else along its street to go, so the stacks
  // take their places first.
  const stacks = new Map();
  for (const f of features) {
    if (f.properties.kind !== 'bus-stack') continue;
    const r = (f.properties.angle * Math.PI) / 180, place = { at: toPx(f.geometry.coordinates, zoom), u: [Math.cos(r), Math.sin(r)] };
    let why = null, kept = null;
    for (const [across, properties] of turned(f.properties).entries()) {
      const on = blocked(properties, place) ?? (across ? crowded(properties, place) : null);
      if (on) { why ??= on; continue; }
      kept = { ...f, properties };
      take(properties, place);
      counts.across += across;
      break;
    }
    stacks.set(f, kept);
    if (!kept) left.push({ list: words(f.properties), why });
  }
  const set = (f, p, was) => {
    // On its own side with its street's name first, then without; then the same on the other
    // side (the side it stood on one zoom out comes first). Each time: standing straight, at the
    // clear place nearest where it stood or else the stretch's middle; then along the bend.
    let why = null;
    const sides = [...turned(f.properties).entries()];
    if (was && (was.side ?? 1) !== (f.properties.side ?? 1)) sides.reverse();
    for (const [across, sided] of sides) for (const named of f.properties.street ? [true, false] : [false]) {
      const { street, ...bare } = sided, properties = named ? sided : bare;
      const on = (place) => blocked(properties, place) ?? (across ? crowded(properties, place) : null);
      const wide = listWide(properties, size);
      const toward = Math.sign(listOff(properties, zoom));
      let place = null, tried = 0;
      // Exactly where it stood, if that still serves.
      if (was && (was.side ?? 1) === (properties.side ?? 1) && holds(p, wide, toward, was) && !on(was)) place = { at: was.at, u: was.u };
      if (!place) for (const stand of standings(p, wide, toward, was?.from)) {
        const what = on(stand);
        if (!what) { place = stand; break; }
        why ??= what;
        tried++;
      }
      if (!place && follows(p, wide, size, sizeAt(LIST_SIZES, zoom + 1))) {
        const what = on({ path: p });
        if (what) why ??= what; else place = { path: p };
      }
      if (!place) continue;
      take(properties, place);
      counts.across += across;
      if (street && !named) counts.unnamed++;
      if (place.path) { counts.along++; return [{ ...f, properties }]; }
      counts.placed++;
      if (tried) counts.moved++;
      if (was && (was.side ?? 1) === (properties.side ?? 1) && span(was.at, place.at) <= 2) counts.held++;
      const { cls, side } = properties, half = wide / 2;
      return [{ ...f, properties: { ...properties, kind: 'bus-list', angle: Math.round((Math.atan2(place.u[1], place.u[0]) * 1800) / Math.PI) / 10 },
        geometry: { type: 'Point', coordinates: toLonLat(place.at, zoom) } },
      feature({ kind: 'list-room', cls, ...(side === undefined ? {} : { side }) }, 'LineString',
        [-half, half].map((t) => toLonLat([place.at[0] + place.u[0] * t, place.at[1] + place.u[1] * t], zoom)))];
    }
    left.push({ list: words(f.properties), why: why ?? 'bend' });
    return [];
  };
  // The lists that stood one zoom out first, then the rest, each in the drawing's order.
  const lists = features.filter((f) => f.properties.kind === 'bus-label').map((f) => {
    let p = f.geometry.coordinates.map((c) => toPx(c, zoom));
    // Read left to right, as MapLibre turns a label along a line that runs the other way.
    if (p[0][0] > p.at(-1)[0]) p = p.reverse();
    return { f, p, was: stoodOn(f.properties.label, p) };
  });
  const made = new Map();
  for (const l of [...lists.filter((l) => l.was), ...lists.filter((l) => !l.was)]) made.set(l.f, set(l.f, l.p, l.was));
  const out = features.flatMap((f) => (f.properties.kind === 'bus-stack' ? (stacks.get(f) ? [stacks.get(f)] : []) : made.get(f) ?? [f]));
  return { features: out, ...counts, stood: lists.filter((l) => l.was).length, left };
}

// The bus drawings from 12 to 16, written to `out`; returns what the report says of them.
export async function drawBus(data, dir, out, bundle) {
  // Each bus drawing is one of 12 to 16, so each bus drawing is only ever enlarged up to the next
  // (public/js/zoom/model.js, busDrawingAt). Each keeps every route list and street name the one
  // before it set, in place, and adds its own between them: zooming in, lettering is only added,
  // and zooming out only taken away (Chris, 2026-11-26: no labels that appear, disappear and
  // reappear). Rail, stations and their lettering come from the trial's own model, so they are
  // left out. A picked route's whole line is a file of its own, as on the sheets (#193).
  const bus = {};
  // The first has nothing to keep, but is drawn with the same care for the page's room.
  let carry = { lists: [], names: [] };
  let placedBefore = null;
  for (const zoom of BUS_BUILT) {
    const started = performance.now();
    const drawn = withZoom(zoom, (sheet) => drawSheet(data, sheet, carry));
    const before = carry;
    carry = carryOf(drawn);
    bus[zoom] = { carried: { lists: before.lists.length, names: before.names.length } };
    const all = drawn.features.filter((f) => !['rail', 'station', 'letter', 'group-key'].includes(f.properties.kind) && f.properties.shape !== 'name');
    // What the next drawing keeps was read from the stretches (carryOf, above); only the copy
    // the page reads has its lists placed, against the rail and names the page shows (`bundle`).
    const lists = LISTS_PLACED.includes(zoom) ? placedLists(all, zoom, fixedOver(bundle, zoom), placedBefore) : null;
    placedBefore = lists?.features ?? null;
    const kept = lists?.features ?? all;
    const busRaw = JSON.stringify({ ...drawn, features: kept.filter((f) => f.properties.kind !== 'route-line') });
    const routesRaw = JSON.stringify(collection(kept.filter((f) => f.properties.kind === 'route-line')));
    await writeFile(path.join(out, `bus-${zoom}.geojson`), busRaw);
    await writeFile(path.join(out, `bus-${zoom}-routes.geojson`), routesRaw);
    bus[zoom] = { ...bus[zoom], features: kept.length, labels: all.filter((f) => f.properties.kind === 'bus-label').length,
      ...(lists ? { lists: { placed: lists.placed, along: lists.along, unnamed: lists.unnamed, moved: lists.moved, across: lists.across, stood: lists.stood, held: lists.held, left: lists.left } } : {}),
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
    const report = JSON.parse(await readFile(path.join(out, 'report.json')));
    const bundle = JSON.parse(await readFile(path.join(out, 'trial.json')));
    const bus = await drawBus(data, dir, out, bundle);
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
  report.bus = await drawBus(data, dir, out, bundle);
  const raw = JSON.stringify(bundle);
  report.bytes = { raw: Buffer.byteLength(raw), gzip: gzipSync(raw).length };
  await writeFile(path.join(out, 'trial.json'), JSON.stringify(bundle));
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ totals: report.totals, bytes: report.bytes, railPieces: report.railPieces }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
