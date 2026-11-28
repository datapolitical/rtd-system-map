// One lettering plan (DESIGN.md, "Continuous zoom changes the build as well as the
// page"; the plan is #129, issue #234). Every label the build draws — a station's
// name and its row of line letters, a line's letter, a route list on a street — is
// written down once: what it says, where its ink sits, its angle and size, the
// drawings it shows on, and the label it took over from if any.
//
// The page is meant to draw this plan and decide nothing, so the plan must say what
// the map shows at every zoom. Two checks read it: no two labels' ink overlaps, and
// a label on one drawing is still there on the next unless the plan records why it
// changed. This module writes the plan and the one record of the room each label
// takes. #156 carries those placements from wide to close; #158 makes the page draw them.
//
// Nothing here names RTD's network: every label comes from the built drawing, and
// every size and offset comes from SIZES and the page's own style constants.
import { SIZES, SHEETS, toPx, toLonLat, busWide } from './sheets.mjs';
import { textWidth } from '../glyphs.mjs';
import { NUMBER_SIZE, ROW_HEIGHT, numberOffset } from '../../public/js/sheets/style.js';

/** Every kind of our own lettering on the sheets. The base map's names follow in #235. */
export const KINDS = ['station-name', 'station-letter', 'line-letter', 'hall-label', 'route-list', 'hall-name', 'street-name'];

/** The zoom whose pixels compare places across drawings. Sheet 2 draws at it. */
export const REFERENCE_ZOOM = 12;
/** A label may move this far, in reference-zoom pixels, and still be the same label
 * when a drawing holds several of its kind (line letters, route lists). */
export const LINK_PX = 8;
/** The rule from the proposal: a label at one drawing is at the next within this many
 * pixels of its place, or the plan records why it moved. */
export const MOVE_PX = 2;
const FONT = { name: 'Overpass SemiBold', minor: 'Overpass Medium', list: 'Overpass SemiBold', street: 'Overpass Regular' };
const LETTER_SPACING = 0.02;
const ROUND = (v, by = 10) => Math.round(v * by) / by;
const lonlat = ([x, y], zoom) => toLonLat([x, y], zoom).map((v) => Math.round(v * 1e6) / 1e6);

// --- the room each label takes --------------------------------------------------

/** The corners of a label's ink: a box `w` by `h` centred on (x, y), turned by `angle`
 * radians clockwise from east (the screen's +x), as MapLibre turns map-aligned text. */
export function corners({ x, y, w, h, angle }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}

const axis = (pts, [ax, ay]) => pts.map(([x, y]) => x * ax + y * ay);

/** Whether two turned boxes share ink. Touching edges do not count. */
export function boxesOverlap(a, b) {
  const [ca, cb] = [corners(a), corners(b)];
  for (const pts of [ca, cb]) {
    for (let i = 0; i < 4; i++) {
      const [p, q] = [pts[i], pts[(i + 1) % 4]];
      const ax = [-(q[1] - p[1]), q[0] - p[0]];
      const [a0, a1] = [Math.min(...axis(ca, ax)), Math.max(...axis(ca, ax))];
      const [b0, b1] = [Math.min(...axis(cb, ax)), Math.max(...axis(cb, ax))];
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
  }
  return true;
}

/**
 * One record of the room the labels of one drawing take. A label is taken before the
 * ones that give way to it; `hits` answers what it would overlap. The grid is only an
 * index — whether two boxes share ink is decided exactly (`boxesOverlap`), never by a
 * copy of MapLibre's rules. A whole sheet's pixels are far too many to hold in a
 * bitmap, so cells hold the boxes near them instead.
 */
export class Room {
  constructor(cell = 64) {
    this.cell = cell;
    this.grid = new Map();
    this.boxes = [];
  }
  #cells(box) {
    const pts = corners(box);
    const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    const out = [];
    for (let i = Math.floor(x0 / this.cell); i <= Math.floor(x1 / this.cell); i++)
      for (let j = Math.floor(y0 / this.cell); j <= Math.floor(y1 / this.cell); j++) out.push(`${i},${j}`);
    return out;
  }
  /** Take `box` for `owner`; returns the owners it overlapped. */
  take(box, owner) {
    const taken = this.hits(box);
    const item = { ...owner, box };
    for (const k of this.#cells(box)) {
      const cell = this.grid.get(k) ?? [];
      cell.push(item);
      this.grid.set(k, cell);
    }
    this.boxes.push(item);
    return taken;
  }
  /** The owners whose room shares ink with `box`, nearest cell first. */
  hits(box) {
    const seen = new Set();
    const out = [];
    for (const k of this.#cells(box)) {
      for (const item of this.grid.get(k) ?? []) {
        if (seen.has(item)) continue;
        seen.add(item);
        if (boxesOverlap(box, item.box)) out.push(item);
      }
    }
    return out;
  }
}

// --- reading the drawing -------------------------------------------------------

/** The ink centre and box of a line-placed label: its stretch's middle, the street's
 * offset to the side the build chose, and its own direction. */
function alongStretch(path, { sheetId, cls, size, side = 1, stack = false, offset = true }) {
  let pts = path.map((c) => toPx(c, SHEETS[sheetId].zoom));
  if (pts.length < 2) return null;
  // Read left to right, as MapLibre turns a label along a line that runs the other way.
  if (pts[0][0] > pts.at(-1)[0] || (pts[0][0] === pts.at(-1)[0] && pts[0][1] > pts.at(-1)[1])) pts = [...pts].reverse();
  // The middle by length, and the direction of the segment it falls in.
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const half = lengths.at(-1) / 2;
  let i = 1;
  while (i < pts.length - 1 && lengths[i] < half) i++;
  const [a, b] = [pts[i - 1], pts[i]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const t = (half - lengths[i - 1]) / len;
  const mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // The page sets a list just beside its street (style.js, numberOffset), on the side
  // the build found room. A stack's middle sits half a row farther off.
  const off = offset ? (-numberOffset(sheetId, busWide(cls, { id: sheetId })) + (stack ? ROW_HEIGHT / 2 : 0)) * size : 0;
  const normal = [u[1], -u[0]];
  const centre = [mid[0] + normal[0] * off * side, mid[1] + normal[1] * off * side];
  if (!centre.every(Number.isFinite)) return null;
  return { mid, centre, angle: Math.atan2(u[1], u[0]) };
}

/** The page wraps a hall's name at nine ems. Do that here too, so the plan owns the place. */
function hallRows(text, size) {
  const rows = [''];
  for (const word of String(text).split(/\s+/)) {
    const candidate = `${rows.at(-1)} ${word}`.trim();
    if (rows.at(-1) && textWidth(candidate, FONT.name, size) > 9 * size) rows.push(word);
    else rows[rows.length - 1] = candidate;
  }
  return rows;
}

/** Every label of one drawing, as plan entries. */
export function planEntries({ id: sheetId, zoom, features }) {
  const out = [];
  // Each station's bars, in the build's order (its first bar, then any more): a long
  // station is named at more than one end, and each name keeps to its own bar.
  const bars = new Map();
  for (const f of features) {
    const p = f.properties;
    if (p.kind !== 'station' || p.shape !== 'bar') continue;
    const [a, b] = f.geometry.coordinates.map((c) => toPx(c, zoom));
    const k = String(p.id);
    bars.set(k, [...(bars.get(k) ?? []), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]);
  }
  const barOf = (id, at) => {
    const pts = bars.get(String(id)) ?? [];
    let best = 0, bestD = Infinity;
    for (const [i, p] of pts.entries()) {
      const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
      if (d < bestD) [best, bestD] = [i, d];
    }
    return best;
  };
  // A name's own identity: the station, and which of its bars.
  const names = new Map();
  for (const f of features) {
    const p = f.properties;
    if (p.kind !== 'station' || p.shape !== 'name') continue;
    const at = toPx(f.geometry.coordinates, zoom);
    names.set(p.nid, { p, at, bar: barOf(p.id, at), key: `station-name:${p.id}:${barOf(p.id, at)}` });
  }
  const nameLetter = SIZES.nameLetter[sheetId];
  const disc = SIZES.letterDisc[sheetId];
  // The page draws no route list wider out than sheet 2 (style.js, NUMBER_SIZE).
  const listSize = NUMBER_SIZE[sheetId];
  const via = (p) => (p.alt ? null : p); // placements shown only while a route is picked
  for (const f of features) {
    const p = f.properties;
    // A station's name, and the row of letters under it: the build already measured the
    // ink it takes (`bx`, relative to the station's bar) and it does not turn.
    if (p.kind === 'station' && p.shape === 'name' && via(p)) {
      const { at, key } = names.get(p.nid);
      const [x0, y0, x1, y1] = String(p.bx).split(',').map(Number);
      const centre = [at[0] + (x0 + x1) / 2, at[1] + (y0 + y1) / 2];
      out.push({
        kind: 'station-name', key, text: p.text, font: p.minor ? FONT.minor : FONT.name,
        anchor: at, centre, angle: 0, size: p.minor ? SIZES.nameMinor : SIZES.name[sheetId], room: [x1 - x0, y1 - y0],
        why: null,
      });
    }
    if (p.kind === 'letter' && p.small && via(p)) {
      const own = names.get(p.nid);
      if (!own) continue;
      // The whole district holds a name's letters to it in pixels at its station.
      const at = toPx(f.geometry.coordinates, zoom);
      const centre = p.held ? [at[0] + p.px[0], at[1] + p.px[1]] : at;
      out.push({
        kind: 'station-letter', key: `station-letter:${own.key}:${p.route}`, text: p.route, font: FONT.name,
        anchor: own.at, centre, angle: 0, size: nameLetter * SIZES.letterText,
        room: [2 * nameLetter, 2 * nameLetter], partOf: own.key,
      });
    }
    // A line's letter on its disc.
    if (p.kind === 'letter' && !p.small) {
      const at = toPx(f.geometry.coordinates, zoom);
      out.push({ kind: 'line-letter', key: `line-letter:${p.route}`, text: p.route, font: FONT.name, anchor: at, centre: at, angle: 0, size: disc * SIZES.letterText, room: [2 * disc, 2 * disc] });
    }
    // A route list: one row set along its street (`bus-label`), or two rows turned on
    // the street's middle (`bus-stack`).
    if (p.kind === 'bus-label' && listSize) {
      const place = alongStretch(f.geometry.coordinates, { sheetId, cls: p.cls, size: listSize, side: p.side === -1 ? -1 : 1 });
      if (!place) continue;
      const street = p.street ? textWidth(p.street, FONT.street, listSize) + listSize : 0;
      const wide = street + textWidth(p.label, FONT.list, listSize, LETTER_SPACING);
      out.push({
        kind: 'route-list', key: `route-list:${listKey(p.label)}`, text: p.label, street: p.street ?? null, font: FONT.list,
        anchor: place.mid, centre: place.centre, angle: place.angle, size: listSize, room: [wide, listSize * ROW_HEIGHT],
      });
    }
    if (p.kind === 'bus-stack' && listSize) {
      const at = toPx(f.geometry.coordinates, zoom);
      const angle = ((p.angle ?? 0) * Math.PI) / 180;
      const u = [Math.cos(angle), Math.sin(angle)];
      const normal = [u[1], -u[0]];
      const width = Math.max(...String(p.label).split('\n').map((row) => textWidth(row, FONT.list, listSize, LETTER_SPACING)));
      const rows = String(p.label).split('\n').length;
      const off = (-numberOffset(sheetId, busWide(p.cls, { id: sheetId })) + ROW_HEIGHT / 2) * listSize;
      const side = p.side === -1 ? -1 : 1;
      out.push({
        kind: 'route-list', key: `route-list:${listKey(p.label)}`, text: p.label, street: null, font: FONT.list,
        anchor: at, centre: [at[0] + normal[0] * off * side, at[1] + normal[1] * off * side], angle, size: listSize,
        room: [width, rows * listSize * ROW_HEIGHT],
      });
    }
    // A bus street's own name, from RTD's stop names, beside the street like its list.
    if (p.kind === 'bus-street' && listSize) {
      const place = alongStretch(f.geometry.coordinates, { sheetId, cls: p.cls, size: listSize, side: p.side === -1 ? -1 : 1 });
      if (!place) continue;
      out.push({
        kind: 'street-name', key: `street-name:${p.label}`, text: p.label, font: FONT.street,
        anchor: place.mid, centre: place.centre, angle: place.angle, size: listSize,
        room: [textWidth(p.label, FONT.street, listSize, LETTER_SPACING), listSize * ROW_HEIGHT],
      });
    }
    // What a hall is, down its axis. Unlike the old page layer, the plan owns its exact centre.
    if (p.kind === 'hall-name') {
      const size = SIZES.hallLetter;
      const place = alongStretch(f.geometry.coordinates, { sheetId, size, offset: false });
      if (!place) continue;
      const text = String(p.text).toUpperCase();
      out.push({ kind: 'hall-name', key: `hall-name:${p.text}`, text, font: FONT.minor, anchor: place.mid, centre: place.centre,
        angle: place.angle, size, room: [textWidth(text, FONT.minor, size, 0.18), size * ROW_HEIGHT] });
    }
    // A bus station's name starts to the right of its hall. Carrying may move it only for a
    // recorded collision; the page will no longer choose a variable anchor (#158).
    if (p.kind === 'hall-label') {
      const at = toPx(f.geometry.coordinates, zoom);
      const size = SIZES.name[sheetId] - 2;
      const rows = hallRows(p.text, size);
      const width = Math.max(...rows.map((row) => textWidth(row, FONT.name, size)));
      const height = rows.length * size * 1.12;
      const centre = [at[0] + (p.r ?? 0) + size / 2 + width / 2, at[1]];
      out.push({ kind: 'hall-label', key: `hall-label:${p.text}`, text: rows.join('\n'), font: FONT.name,
        anchor: at, centre, angle: 0, size, room: [width, height] });
    }
  }
  // A fixed order, so the same drawing always makes the same plan (and the nth copy of
  // a label links to the nth of the drawing before it).
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.centre[1] - b.centre[1] || a.centre[0] - b.centre[0]));
  return out;
}

/** A route list's identity, whatever rows it was set on: "0, 1, 15" and "0,\n1, 15" are one list. */
function listKey(text) {
  return String(text).split(/[\s,]+/).filter(Boolean).join(',');
}

const groundPx = ([lon, lat]) => toPx([lon, lat], REFERENCE_ZOOM);

/**
 * Build one plan from the drawings, widest first. A label present on consecutive
 * drawings is one entry with a stop on each; one that goes and comes back is a new
 * entry whose `parent` is the one before it, which the checks count.
 *
 * `link` is how near, in reference-zoom pixels, a second copy (a line letter, a route
 * list) must be to be carried; single-copy labels (a station's name) carry by identity
 * however far they move, and the move itself is what the check measures.
 */
export function letteringPlan(drawings, { link = LINK_PX, carry = false } = {}) {
  const sorted = [...drawings].sort((a, b) => a.zoom - b.zoom);
  const labels = new Map();
  const counts = new Map();
  const active = new Map(); // key -> ids on the drawing just before
  const dormant = new Map(); // key -> id of the last label of that key with no stop on the drawing just before
  let conditional = 0;
  const stats = [];
  for (const drawing of sorted) {
    const entries = planEntries(drawing);
    const copies = new Map();
    for (const e of entries) copies.set(e.key, (copies.get(e.key) ?? 0) + 1);
    const used = new Set();
    const next = new Map();
    const take = (key, id) => next.set(key, [...(next.get(key) ?? []), id]);
    for (const e of entries) {
      const before = active.get(e.key) ?? [];
      let match = null;
      // A station's name is one thing however far it moves: it carries by identity. A
      // line letter or a route list is one of many, so it carries to the nearest copy.
      if (before.length === 1 && copies.get(e.key) === 1) match = before[0];
      else {
        const here = groundPx(lonlat(e.centre, drawing.zoom));
        let best = null, bestD = Infinity;
        for (const id of before) {
          if (used.has(id)) continue;
          const was = groundPx(labels.get(id).stops.at(-1).at);
          const d = Math.hypot(here[0] - was[0], here[1] - was[1]);
          if (d < bestD) [best, bestD] = [id, d];
        }
        if (best && bestD <= link) match = best;
      }
      if (match) {
        used.add(match);
        const label = labels.get(match);
        label.stops.push(stop(e, drawing, label.stops.at(-1)));
        label.text = e.text;
        label.to = drawing.zoom;
        take(e.key, match);
      } else {
        const n = (counts.get(e.key) ?? 0) + 1;
        counts.set(e.key, n);
        const id = `${e.key}#${n}`;
        const parent = dormant.get(e.key) ?? null;
        labels.set(id, {
          id, kind: e.kind, key: e.key, text: e.text, partOf: e.partOf ?? null,
          from: drawing.zoom, to: drawing.zoom, parent, stops: [stop(e, drawing, null)],
        });
        take(e.key, id);
      }
    }
    // Whatever had a copy on the drawing before and has none now has gone.
    for (const key of new Set([...active.keys(), ...next.keys()])) {
      if (next.has(key)) { dormant.delete(key); continue; }
      const ids = active.get(key) ?? [];
      if (ids.length) dormant.set(key, ids.at(-1));
    }
    active.clear();
    for (const [key, ids] of next) active.set(key, ids);
    conditional += drawing.features.filter((f) => f.properties.alt).length;
    stats.push({ id: drawing.id, zoom: drawing.zoom, labels: entries.length });
  }
  const out = [...labels.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const l of out) l.stops.sort((a, b) => a.zoom - b.zoom);
  const plan = { version: 1, referenceZoom: REFERENCE_ZOOM, kinds: KINDS, conditional, drawings: stats, labels: out };
  return carry ? carryLettering(plan) : plan;
}

/** One stop: where the label's ink sits on this drawing, and how far it moved. */
function stop(e, drawing, before) {
  const at = lonlat(e.centre, drawing.zoom);
  let moved = 0;
  if (before) {
    const [x, y] = toPx(at, drawing.zoom);
    const [px, py] = toPx(before.at, drawing.zoom);
    moved = Math.round(Math.hypot(x - px, y - py) * 10) / 10;
  }
  return {
    sheet: drawing.id, zoom: drawing.zoom, at, anchor: lonlat(e.anchor, drawing.zoom),
    angle: ROUND((e.angle * 180) / Math.PI, 10), size: ROUND(e.size), room: e.room.map((v) => ROUND(v)), text: e.text,
    moved, ...(e.why ? { why: e.why } : {}),
  };
}

// --- carrying the plan from one drawing to the next ----------------------------

const routesOf = (text) => new Set(String(text).split(/[\s,]+/).filter(Boolean));
const sharesRoute = (a, b) => [...routesOf(a)].some((r) => routesOf(b).has(r));
const stopBox = (s, zoom) => {
  const [x, y] = toPx(s.at, zoom);
  return { x, y, w: s.room[0], h: s.room[1], angle: (s.angle * Math.PI) / 180 };
};
const distanceAt = (a, b, zoom) => {
  const p = toPx(a, zoom), q = toPx(b, zoom);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
};

/**
 * The consistency rule, applied to a fresh sheet plan (#156). Existing labels claim
 * their old ground first, in rank order. One keeps its old centre and angle when its
 * new ink box fits; otherwise the fresh sheet placement is a fallback and its stop
 * records what it overlapped. A label missing from the fresh drawing is retained on
 * the same rule. A route list that splits hands over to a nearby list sharing a route
 * instead of staying behind as a duplicate. New labels take only room still free.
 *
 * This pass decides label-on-label fit. Rail, stations and street geometry become
 * zoom rules in #155; until then a move caused only by those drawings changing is
 * left for that integration, not guessed here.
 */
export function carryLettering(freshPlan) {
  const labels = new Map();
  let before = [];
  const lastZoom = freshPlan.drawings.at(-1)?.zoom;
  for (const drawing of freshPlan.drawings) {
    const fresh = freshPlan.labels.flatMap((l) => {
      const stop = l.stops.find((s) => s.zoom === drawing.zoom);
      return stop ? [{ label: l, stop }] : [];
    });
    const byId = new Map(fresh.map((f) => [f.label.id, f]));
    // The fresh linker is deliberately conservative at 8 reference pixels. A carry
    // pass may continue the same copy farther (up to 48 px at the closer zoom), but
    // still one-to-one and only within its stable identity key.
    const continued = new Set(fresh.filter((f) => before.some((old) => old.label.id === f.label.id)).map((f) => f.label.id));
    for (const old of before) {
      if (byId.has(old.label.id)) continue;
      let best = null;
      for (const candidate of fresh) {
        if (continued.has(candidate.label.id) || candidate.label.key !== old.label.key) continue;
        const d = distanceAt(old.stop.at, candidate.stop.at, drawing.zoom);
        if (d <= 48 && (!best || d < best.d)) best = { candidate, d };
      }
      if (best) {
        byId.set(old.label.id, best.candidate);
        continued.add(best.candidate.label.id);
      }
    }
    const claimed = new Set();
    const handovers = new Map();
    // A merged trunk's old list must not survive beside the lists that replace it.
    // Match only the same kind, shared route identity and nearby ink at this zoom.
    for (const old of before) {
      if (old.label.kind !== 'route-list' || byId.has(old.label.id)) continue;
      let best = null;
      for (const candidate of fresh) {
        if (claimed.has(candidate.label.id) || continued.has(candidate.label.id) || candidate.label.kind !== old.label.kind || listKey(old.stop.text) === listKey(candidate.stop.text) || !sharesRoute(old.stop.text, candidate.stop.text)) continue;
        const d = distanceAt(old.stop.at, candidate.stop.at, drawing.zoom);
        if (d <= 48 && (!best || d < best.d)) best = { candidate, d };
      }
      if (!best) continue;
      const why = `handover: a more detailed route list replaces it at zoom ${drawing.zoom}`;
      claimed.add(best.candidate.label.id);
      handovers.set(old.label.id, { child: best.candidate, why });
    }

    const room = new Room();
    const current = [];
    const used = new Set();
    // A retained label has no fresh stop to take its size from. Read the same build
    // and page tables as a fresh entry, never a median inferred from other labels.
    const sizeFor = (old) => {
      switch (old.label.kind) {
        case 'station-name': return old.stop.size === SIZES.nameMinor ? SIZES.nameMinor : SIZES.name[drawing.id];
        case 'station-letter': return SIZES.nameLetter[drawing.id] * SIZES.letterText;
        case 'line-letter': return SIZES.letterDisc[drawing.id] * SIZES.letterText;
        case 'route-list':
        case 'street-name': return NUMBER_SIZE[drawing.id];
        case 'hall-label': return SIZES.name[drawing.id] - 2;
        case 'hall-name': return SIZES.hallLetter;
        default: throw new Error(`No size rule for ${old.label.kind}`);
      }
    };
    const take = (label, stop, held) => {
      if (!label.partOf) room.take(stopBox(stop, drawing.zoom), { id: label.id, kind: label.kind });
      current.push({ label, stop });
      if (held) stop.carried = true;
    };
    const finish = (label, stop) => {
      label.stops.push(stop);
      label.to = drawing.zoom;
      labels.set(label.id, label);
    };
    const ranks = [...new Set([...before, ...fresh].map((x) => RANK[x.label.kind]))].sort((a, b) => a - b);
    for (const rank of ranks) {
    const ordered = [...before].filter((x) => RANK[x.label.kind] === rank).sort((a, b) => a.label.id.localeCompare(b.label.id));
    for (const old of ordered) {
      const source = labels.get(old.label.id);
      const now = byId.get(old.label.id);
      const handover = handovers.get(old.label.id);
      if (handover) {
        source.why = handover.why;
        continue;
      }
      const retainedSize = now ? null : sizeFor(old);
      const scale = retainedSize / old.stop.size;
      const held = {
        ...old.stop, sheet: drawing.id, zoom: drawing.zoom, moved: 0, ...(!now ? { retained: true } : {}),
        size: now?.stop.size ?? ROUND(retainedSize),
        room: now?.stop.room ?? old.stop.room.map((v) => ROUND(v * scale)),
        text: now?.stop.text ?? old.stop.text,
      };
      delete held.carried;
      delete held.why;
      if (now) delete held.retained;
      let why = null;
      if (now && now.stop.text.replace(/\s+/g, ' ').length < old.stop.text.replace(/\s+/g, ' ').length)
        why = `handover: the closer drawing changes the wording at zoom ${drawing.zoom}`;
      const hits = source.partOf ? [] : room.hits(stopBox(held, drawing.zoom));
      if (!hits.length) {
        if (why) held.why = why;
        take(source, held, true);
        finish(source, held);
        if (now) used.add(now.label.id);
        continue;
      }
      // The old place no longer fits: the fresh sheet's place is the one recorded move.
      const reason = `no longer fits at zoom ${drawing.zoom}: overlaps ${hits.map((h) => h.id).join(', ')}`;
      if (now) {
        const moved = { ...now.stop, why: reason };
        const freshHits = source.partOf ? [] : room.hits(stopBox(moved, drawing.zoom));
        if (!freshHits.length) {
          take(source, moved, false);
          finish(source, moved);
          used.add(now.label.id);
          continue;
        }
        source.why = `${reason}; the fresh place also overlaps ${freshHits.map((h) => h.id).join(', ')}`;
      } else source.why = reason;
    }

    // New lettering, and the detailed labels that took over, fill the room left.
    const additions = fresh.filter((f) => !used.has(f.label.id) && RANK[f.label.kind] === rank).sort((a, b) => a.label.from - b.label.from || a.label.id.localeCompare(b.label.id));
    for (const item of additions) {
      let id = item.label.id;
      let parent = item.label.parent;
      let why = null;
      for (const [oldId, handover] of handovers) if (handover.child.label.id === id) {
        parent = oldId;
        why = handover.why;
        break;
      }
      // A base-plan id that last ran before a gap cannot be revived with a gap. Give
      // the new interval its own id and an explicit parent, as the format intends.
      if (labels.has(id) && labels.get(id).to !== before[0]?.stop.zoom) {
        let n = 2;
        parent = id;
        while (labels.has(`${id}/interval-${n}`)) { parent = `${id}/interval-${n}`; n++; }
        id = `${id}/interval-${n}`;
        why ??= `appears again at zoom ${drawing.zoom} after its previous interval ended`;
      }
      const label = labels.get(id) ?? { ...item.label, id, parent, stops: [] };
      label.parent = parent;
      label.stops = labels.get(id)?.stops ?? [];
      label.from = label.stops[0]?.zoom ?? drawing.zoom;
      const stop = { ...item.stop, ...(why ? { why } : {}) };
      const hits = label.partOf ? [] : room.hits(stopBox(stop, drawing.zoom));
      if (hits.length) {
        // It cannot start here. Keep an existing earlier interval with its reason, but
        // do not write a new label with no placements.
        if (label.stops.length) labels.get(id).why = `no longer fits at zoom ${drawing.zoom}: overlaps ${hits.map((h) => h.id).join(', ')}`;
        continue;
      }
      take(label, stop, false);
      finish(label, stop);
    }
    }
    before = current;
  }
  const out = [...labels.values()].filter((l) => l.stops.length).sort((a, b) => a.id.localeCompare(b.id));
  for (const l of out) {
    l.stops.sort((a, b) => a.zoom - b.zoom);
    l.from = l.stops[0].zoom;
    l.to = l.stops.at(-1).zoom;
    if (l.to === lastZoom) delete l.why;
  }
  return { ...freshPlan, version: 2, placement: 'carried', labels: out };
}

// --- the checks the plan makes possible ----------------------------------------

const RANK = { 'station-name': 0, 'station-letter': 0, 'line-letter': 1, 'hall-label': 2, 'route-list': 3, 'hall-name': 4, 'street-name': 5 };

/** The plan's own arithmetic: every stop has ink, stops run in zoom order, and a
 * label's first and last zooms are those of its first and last stop. */
export function planFaults(plan) {
  const faults = [];
  const ids = new Set(plan.labels.map((l) => l.id));
  const seen = new Set();
  for (const l of plan.labels) {
    if (seen.has(l.id)) faults.push({ kind: 'repeated-id', id: l.id });
    seen.add(l.id);
    if (!KINDS.includes(l.kind)) faults.push({ kind: 'unknown-kind', id: l.id, of: l.kind });
    if (!l.stops.length) faults.push({ kind: 'no-stops', id: l.id });
    l.stops.forEach((s, i) => {
      if (s.room[0] <= 0 || s.room[1] <= 0) faults.push({ kind: 'no-room', id: l.id, zoom: s.zoom });
      if (!(s.at?.length === 2) || !s.at.every(Number.isFinite)) faults.push({ kind: 'bad-place', id: l.id, zoom: s.zoom });
      if (i && s.zoom <= l.stops[i - 1].zoom) faults.push({ kind: 'out-of-order', id: l.id, zoom: s.zoom });
    });
    if (l.stops.length && (l.from !== l.stops[0].zoom || l.to !== l.stops.at(-1).zoom)) faults.push({ kind: 'range', id: l.id });
    if (l.parent && !ids.has(l.parent)) faults.push({ kind: 'missing-parent', id: l.id, parent: l.parent });
  }
  return faults;
}

/** Every pair of labels whose ink shares an area on a drawing. `partOf` labels (a
 * station name's own row of letters) are inside their owner's room, which holds it. */
export function overlapFaults(plan) {
  const faults = [];
  for (const drawing of plan.drawings) {
    const stops = plan.labels.flatMap((l) => {
      const s = l.stops.find((x) => x.zoom === drawing.zoom);
      return s && !l.partOf ? [{ id: l.id, kind: l.kind, from: l.from, s }] : [];
    }).sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.from - b.from || (a.id < b.id ? -1 : 1));
    const room = new Room();
    for (const { id, kind, s } of stops) {
      const [x, y] = toPx(s.at, drawing.zoom);
      const box = { x, y, w: s.room[0], h: s.room[1], angle: (s.angle * Math.PI) / 180 };
      for (const other of room.hits(box)) faults.push({ zoom: drawing.zoom, a: other.id, aKind: other.kind, b: id, bKind: kind });
      room.take(box, { id, kind });
    }
  }
  return faults;
}

/**
 * Zooming in only adds. A label on one drawing is on the next, within MOVE_PX of its
 * place and no shorter in wording, unless the plan records why. A label that stops
 * before the last drawing without a label taking over from it is a fault too.
 */
export function carryFaults(plan) {
  const zooms = plan.drawings.map((d) => d.zoom);
  const last = zooms.at(-1);
  const faults = [];
  // A label may hand over to one that starts at the next drawing, but only with a
  // recorded reason (the plan says why the thing changed); the parent link alone is not one.
  const handedOver = new Map(plan.labels.filter((l) => l.parent).map((l) => [l.parent, l]));
  for (const l of plan.labels) {
    const stops = new Set(l.stops.map((s) => s.zoom));
    for (const z of zooms) if (z > l.from && z < l.to && !stops.has(z)) faults.push({ kind: 'gap', id: l.id, zoom: z });
    l.stops.forEach((s, i) => {
      if (!i || s.why) return;
      if (s.moved > MOVE_PX) faults.push({ kind: 'moved', id: l.id, zoom: s.zoom, px: s.moved });
      const was = l.stops[i - 1].text.replace(/\s+/g, ' ');
      const now = s.text.replace(/\s+/g, ' ');
      if (now.length < was.length) faults.push({ kind: 'shorter', id: l.id, zoom: s.zoom, was, now });
    });
    const child = handedOver.get(l.id);
    const next = zooms[zooms.indexOf(l.to) + 1];
    // A successor takes over only if it starts at the very next drawing and says why.
    const takes = child && child.from === next && (child.why || child.stops[0]?.why);
    if (l.to < last && !takes) faults.push({ kind: 'gave-way', id: l.id, zoom: l.to });
  }
  return faults;
}

/**
 * Labels that end before the last drawing with no label taking over from them: a
 * recorded fit reason explains why they went, but it is not a successor. Listed apart
 * so the plan never passes a disappearance off as a handover.
 */
export function droppedLabels(plan) {
  const last = plan.drawings.at(-1)?.zoom;
  const parents = new Set(plan.labels.filter((l) => l.parent).map((l) => l.parent));
  return plan.labels.filter((l) => l.to < last && !parents.has(l.id)).map((l) => ({ id: l.id, kind: l.kind, zoom: l.to, why: l.why ?? null }));
}

/** The carry audit for every neighbouring pair: what stayed, what changed, and why. */
export function transitionReport(plan) {
  const out = [];
  for (let i = 1; i < plan.drawings.length; i++) {
    const from = plan.drawings[i - 1].zoom, to = plan.drawings[i].zoom;
    const at = (zoom) => plan.labels.flatMap((l) => {
      const stop = l.stops.find((s) => s.zoom === zoom);
      return stop ? [{ label: l, stop }] : [];
    });
    const before = at(from), after = at(to);
    const ended = plan.labels.filter((l) => l.to === from);
    out.push({
      from, to, before: before.length, after: after.length,
      carried: after.filter((x) => x.stop.carried).length,
      retained: after.filter((x) => x.stop.retained).length,
      moved: after.filter((x) => x.stop.why?.startsWith('no longer fits')).length,
      handovers: ended.filter((l) => l.why?.startsWith('handover')).length,
      gaveWay: ended.filter((l) => l.why?.startsWith('no longer fits')).length,
      added: plan.labels.filter((l) => l.from === to).length,
    });
  }
  return out;
}

/** What a build should print: the plan's size, its counts and both checks, grouped. */
export function planReport(plan) {
  const tally = (list, key) => Object.entries(list.reduce((o, f) => {
    const k = key(f);
    o[k] = (o[k] ?? 0) + 1;
    return o;
  }, {})).sort((a, b) => b[1] - a[1]);
  const overlap = overlapFaults(plan);
  const carry = carryFaults(plan);
  const byKind = {};
  for (const l of plan.labels) byKind[l.kind] = (byKind[l.kind] ?? 0) + 1;
  const bytes = Buffer.byteLength(JSON.stringify(plan));
  return {
    labels: plan.labels.length,
    stops: plan.labels.reduce((n, l) => n + l.stops.length, 0),
    byKind,
    carried: plan.labels.filter((l) => l.parent).length,
    conditional: plan.conditional,
    transitions: transitionReport(plan),
    bytes,
    overlap: { count: overlap.length, byPair: tally(overlap, (f) => [f.aKind, f.bKind].sort().join(' / ')), byZoom: tally(overlap, (f) => `z${f.zoom}`) },
    carry: { count: carry.length, byKind: tally(carry, (f) => f.kind), byZoom: tally(carry, (f) => `z${f.zoom}`) },
  };
}
