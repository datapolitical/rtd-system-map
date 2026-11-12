// The page's symbol placement, replayed on the drawn model (qa/drawn/README.md).
//
// MapLibre places symbols one layer at a time, from the LAST layer of the
// style to the first (PauseablePlacement.continuePlacement counts down from
// `order.length - 1`), and within a layer in order of `symbol-sort-key`. A
// symbol takes the first of its anchors whose box is clear of everything
// placed before it, unless its layer says `allow-overlap`, and then keeps its
// room unless the layer says `ignore-placement`. Nothing else decides what
// the map names: so the order the style lists its layers in IS the priority
// (the lines' letters first, then the hub's name, then the rail keep-out,
// then every other station's name, then the basemap's names last), and a
// keep-out layer is only a layer of invisible symbols.
//
// `labels.mjs` replays only the station names, in the model's order (first
// layer first), and knows nothing of the keep-outs, the letters or the marks.
// This file replays all of it, so a question like "does a name sit on a
// line" is asked of where the page puts the name, not of a first guess.
//
// What is replayed, and how:
//  - A point symbol (a mark, a name, a rail letter with its bullet) is an
//    icon box and/or a list of text boxes, one for each anchor the layer
//    tries. Icon and text of one symbol both have to fit unless the layer
//    lets them overlap.
//  - A keep-out symbol (a 1 px `clear` image set along a line every few px,
//    scaled to the line's width) is a BAND: the line, and the half side of
//    the square. Squares a few px apart along a line are the strip they
//    sweep, so a band is that strip.
//  - A name or shield set along a line (a street name, a highway number) is
//    laid out the way MapLibre does: anchors every `symbol-spacing` px from
//    an offset, kept only where the line is straight enough under the text
//    (`text-max-angle`), the text carried along the line, moved to the side
//    by `text-offset`, and tested as a chain of circles the height of the
//    text (a circle is how MapLibre tests a line label). A shield is its
//    icon's box.
//
// Not replayed: the runtime layers (the letters added where a line enters the
// screen, the live vehicles, the open route's ends), the screen's edge (a
// whole district is placed at once, which is what a screen as large as the
// district would show) and tile edges (symbols are laid out per tile, in an
// order of tiles this does not keep). Where two symbols fight for one place
// near a tile edge the page may choose the other. `qa/drawn/README.md` says
// how far the model has been compared with the page; placement has not (the
// drift test compares collision boxes, not which symbol won).

const CELL = 64;

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inside = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const crosses = (a, b, c, d) => side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);

// Does a segment touch a box? An endpoint inside is a touch, so is a crossing
// of any edge.
export function segmentHitsBox(a, b, box) {
  if (inside(a, box) || inside(b, box)) return true;
  const edges = [
    [[box[0], box[1]], [box[2], box[1]]],
    [[box[2], box[1]], [box[2], box[3]]],
    [[box[2], box[3]], [box[0], box[3]]],
    [[box[0], box[3]], [box[0], box[1]]],
  ];
  return edges.some(([c, d]) => crosses(a, b, c, d));
}

// Distance between two segments.
export function segmentGap(a, b, c, d) {
  if (crosses(a, b, c, d)) return 0;
  const pt = (p, q, r) => {
    const dx = r[0] - q[0], dy = r[1] - q[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy);
  };
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}

const grow = (b, h) => [b[0] - h, b[1] - h, b[2] + h, b[3] + h];

// --- the collision index ------------------------------------------------------

// What a placed symbol takes up: a box, a circle (a piece of a line label), or
// a band (a keep-out along a line). One spatial hash of all three.
const boundsOf = (s) => (s.type === 'box' ? s.b : s.type === 'circle' ? [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r] : grow([Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])], s.h));

function hit(shape, item) {
  if (shape.type === 'box') {
    if (item.type === 'box') return overlaps(shape.b, item.b);
    if (item.type === 'circle') {
      const dx = Math.max(shape.b[0] - item.x, 0, item.x - shape.b[2]);
      const dy = Math.max(shape.b[1] - item.y, 0, item.y - shape.b[3]);
      return dx * dx + dy * dy < item.r * item.r;
    }
    return segmentHitsBox(item.a, item.b, grow(shape.b, item.h));
  }
  // a circle
  if (item.type === 'box') return hit(item, shape);
  if (item.type === 'circle') return Math.hypot(shape.x - item.x, shape.y - item.y) < shape.r + item.r;
  return segmentHitsBox(item.a, item.b, grow([shape.x - shape.r, shape.y - shape.r, shape.x + shape.r, shape.y + shape.r], item.h));
}

export class Index {
  constructor() { this.cells = new Map(); this.stamp = 0; }

  insert(item) {
    const b = boundsOf(item);
    for (let x = Math.floor(b[0] / CELL); x <= Math.floor(b[2] / CELL); x++) {
      for (let y = Math.floor(b[1] / CELL); y <= Math.floor(b[3] / CELL); y++) {
        const k = `${x},${y}`;
        let cell = this.cells.get(k);
        if (!cell) this.cells.set(k, (cell = []));
        cell.push(item);
      }
    }
  }

  // The first placed item the shape collides with, or null.
  first(shape) {
    const b = boundsOf(shape);
    const stamp = ++this.stamp;
    for (let x = Math.floor(b[0] / CELL); x <= Math.floor(b[2] / CELL); x++) {
      for (let y = Math.floor(b[1] / CELL); y <= Math.floor(b[3] / CELL); y++) {
        for (const item of this.cells.get(`${x},${y}`) ?? []) {
          if (item.stamp === stamp) continue;
          item.stamp = stamp;
          if (hit(shape, item)) return item;
        }
      }
    }
    return null;
  }
}

// --- anchors along a line (MapLibre's get_anchors.ts) --------------------------

const lengthOf = (line) => line.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0);
const angleTo = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]);

// May text of `labelLength` px centred on this anchor lie along the line? The
// line may not turn more than `maxAngle` degrees within `windowSize` px under
// it.
function straightEnough(line, anchor, labelLength, windowSize, maxAngle) {
  let p = anchor.at;
  let index = anchor.segment + 1;
  let anchorDistance = 0;
  while (anchorDistance > -labelLength / 2) {
    index--;
    if (index < 0) return false;
    anchorDistance -= Math.hypot(line[index][0] - p[0], line[index][1] - p[1]);
    p = line[index];
  }
  anchorDistance += Math.hypot(line[index][0] - line[index + 1][0], line[index][1] - line[index + 1][1]);
  index++;
  const recent = [];
  let recentDelta = 0;
  while (anchorDistance < labelLength / 2) {
    const prev = line[index - 1], current = line[index], next = line[index + 1];
    if (!next) return false;
    let delta = angleTo(current, prev) - angleTo(next, current);
    delta = Math.abs(((delta + 3 * Math.PI) % (Math.PI * 2)) - Math.PI);
    recent.push({ distance: anchorDistance, delta });
    recentDelta += delta;
    while (anchorDistance - recent[0].distance > windowSize) recentDelta -= recent.shift().delta;
    if ((recentDelta * 180) / Math.PI > maxAngle) return false;
    index++;
    anchorDistance += Math.hypot(current[0] - next[0], current[1] - next[1]);
  }
  return true;
}

function resample(line, offset, spacing, windowSize, maxAngle, labelLength, continued, middle) {
  const total = lengthOf(line);
  let distance = 0;
  let marked = offset - spacing;
  let anchors = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (marked + spacing < distance + segment) {
      marked += spacing;
      const t = (marked - distance) / segment;
      if (marked - labelLength / 2 >= 0 && marked + labelLength / 2 <= total) {
        const anchor = { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], segment: i, s: marked };
        if (!windowSize || straightEnough(line, anchor, labelLength, windowSize, maxAngle)) anchors.push(anchor);
      }
    }
    distance += segment;
  }
  // Nowhere to put one: the middle of the line, if it does not run on.
  if (!middle && !anchors.length && !continued) anchors = resample(line, distance / 2, spacing, windowSize, maxAngle, labelLength, continued, true);
  return anchors;
}

/**
 * Where a name or shield set along a line sits: its anchors (each an arc
 * distance along the line `s`), as MapLibre lays them out. `entry` is a
 * model `line-text` entry: `parts[0]` the line, `block`/`box` the text,
 * `size`, `spacing`, `maxAngle`, `continued` and, for a shield, `icon`.
 */
export function lineAnchors(entry) {
  const line = entry.parts[0];
  const labelLength = Math.max(entry.box?.width ?? entry.block?.width ?? 0, entry.icon?.w ?? 0);
  let spacing = entry.spacing ?? 250;
  if (spacing - labelLength < spacing / 4) spacing = labelLength + spacing / 4;
  const offset = !entry.continued ? (labelLength / 2 + 2 * entry.size) % spacing : (spacing / 2) % spacing;
  return resample(line, offset, spacing, 0.6 * entry.size, entry.maxAngle ?? 45, labelLength, entry.continued, false)
    .map((a) => ({ ...a, labelLength }));
}

// The label's centreline carried along its line from `s - L/2` to `s + L/2`,
// moved to the side by the layer's `text-offset` (ems; negative y is up in
// the text's own frame, which always reads left to right). Points about
// `step` px apart.
export function ribbonOf(entry, anchor, step = 4) {
  const line = entry.parts[0];
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const s0 = Math.max(0, anchor.s - anchor.labelLength / 2), s1 = Math.min(cum.at(-1), anchor.s + anchor.labelLength / 2);
  const at = (s) => {
    let i = 1;
    while (i < line.length - 1 && cum[i] < s) i++;
    const t = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return { p: [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t], d: [line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]] };
  };
  const first = at(s0), last = at(s1);
  const read = [last.p[0] - first.p[0], last.p[1] - first.p[1]];
  // Text reads left to right (a vertical line, upward).
  const flip = read[0] < -1e-9 || (Math.abs(read[0]) <= 1e-9 && read[1] > 0);
  const sign = flip ? -1 : 1;
  const [ox, oy] = entry.textOffset ?? [0, 0];
  const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
  const points = [];
  for (let k = 0; k < n; k++) {
    const { p, d } = at(s0 + ((s1 - s0) * k) / (n - 1));
    const l = Math.hypot(d[0], d[1]) || 1;
    const u = [(sign * d[0]) / l, (sign * d[1]) / l];
    const up = [u[1], -u[0]];
    points.push([p[0] + u[0] * ox * entry.size - up[0] * oy * entry.size, p[1] + u[1] * ox * entry.size - up[1] * oy * entry.size]);
  }
  return points;
}

// --- the replay -----------------------------------------------------------------

const rankOf = (layers) => {
  const rank = new Map();
  (layers ?? []).forEach((l, i) => rank.set(typeof l === 'string' ? l : l.id, i));
  return rank;
};

/**
 * Place a zoom's symbols the way the page does.
 *
 * @param {{labels?: Array, marks?: Array, bands?: Array}} zoom
 *   `labels`: model `text` (and `line-text`) entries; `marks`: the model's
 *   icon entries; `bands`: `model.linePlaced(z)`. Everything of one symbol
 *   shares `layer` and `index`.
 * @param {{layers?: Array}} opts the style's layers in order (ids or layer
 *   objects); a layer later in the list is placed first. Without them, the
 *   layers rank in the order they first appear in the input.
 * @returns {{placed: Array, hidden: Array, index: Index}} `placed`: one
 *   entry for each symbol (a name along a line: each copy) that took a place,
 *   with `box` (collision box) and `ink` (the text as drawn) or `ribbon`;
 *   `hidden`: symbols with no clear anchor and the layer that blocked them.
 */
export function placeSymbols(zoom, { layers = null } = {}) {
  const symbols = new Map();
  const rank = rankOf(layers);
  const seenLayers = [];
  const sym = (layer, index) => {
    const key = `${layer}\u0000${index}`;
    let s = symbols.get(key);
    if (!s) {
      s = { layer, index, sortKey: 0, icon: null, text: null, line: null, band: null, order: symbols.size };
      symbols.set(key, s);
      if (!rank.has(layer) && !seenLayers.includes(layer)) seenLayers.push(layer);
    }
    return s;
  };
  for (const m of zoom.marks ?? []) {
    if (m.kind !== 'icon' || !m.box) continue;
    const s = sym(m.layer, m.index);
    s.icon = m;
    s.properties = m.properties;
    s.sortKey = m.sortKey ?? 0;
  }
  for (const l of zoom.labels ?? []) {
    const s = sym(l.layer, l.index);
    if (l.kind === 'line-text') s.line = l; else s.text = l;
    s.properties = l.properties;
    s.sortKey = l.sortKey ?? s.sortKey;
  }
  for (const b of zoom.bands ?? []) {
    const s = sym(b.layer, b.index);
    s.band = b;
    s.properties = b.properties;
  }
  // Layers not named in `layers` rank in the order they were first seen.
  seenLayers.forEach((id) => rank.set(id, rank.size));
  const queue = [...symbols.values()].sort((a, b) => rank.get(b.layer) - rank.get(a.layer) || a.sortKey - b.sortKey || a.order - b.order);

  const index = new Index();
  const placed = [];
  const hidden = [];
  const who = (item) => item?.layer ?? null;

  for (const s of queue) {
    if (s.band) {
      // A keep-out: it takes its room without asking, and gives none up.
      if (!s.band.ignorePlacement) {
        for (const part of s.band.parts) {
          for (let i = 1; i < part.length; i++) index.insert({ type: 'band', a: part[i - 1], b: part[i], h: s.band.half, layer: s.layer, symbol: s });
        }
      }
      continue;
    }
    if (s.line) { placeLine(s, index, placed, hidden); continue; }

    const iconShape = s.icon ? { type: 'box', b: s.icon.box } : null;
    const iconBlock = iconShape && !s.icon.allowOverlap ? index.first(iconShape) : null;
    let chosen = null;
    let block = iconBlock;
    if (s.text) {
      for (const c of s.text.candidates) {
        const shape = { type: 'box', b: c.box };
        const hitBy = s.text.allowOverlap ? null : index.first(shape);
        if (!hitBy) { chosen = c; break; }
        block ??= hitBy;
      }
    }
    const fits = (!s.icon || !iconBlock) && (!s.text || chosen);
    if (!fits) {
      hidden.push({ layer: s.layer, index: s.index, text: s.text?.text ?? null, properties: s.properties, symbol: s, blockedBy: who(block), boxes: s.text ? s.text.candidates.map((c) => c.box) : [s.icon.box] });
      continue;
    }
    if (s.icon && !s.icon.ignorePlacement) index.insert({ type: 'box', b: s.icon.box, layer: s.layer, symbol: s });
    if (s.text && chosen && !s.text.ignorePlacement) index.insert({ type: 'box', b: chosen.box, layer: s.layer, symbol: s });
    placed.push({
      layer: s.layer,
      index: s.index,
      kind: s.text ? (s.icon ? 'pair' : 'text') : 'icon',
      text: s.text?.text ?? null,
      properties: s.properties,
      source: (s.text ?? s.icon).source,
      anchor: chosen?.anchor ?? null,
      box: chosen?.box ?? null,
      ink: chosen?.ink ?? null,
      iconBox: s.icon?.box ?? null,
      icon: s.icon ?? null,
      label: s.text ?? null,
      symbol: s,
    });
  }
  return { z: zoom.z, placed, hidden, index };
}

// A name or shield set along a line: every anchor that fits is a copy.
function placeLine(s, index, placed, hidden) {
  const e = s.line;
  const anchors = lineAnchors(e);
  let blocked = null;
  let copies = 0;
  for (const anchor of anchors) {
    let shape;
    let shapes;
    let ribbon = null;
    let ink;
    if (e.icon) {
      const h = e.icon.padding;
      const box = [anchor.at[0] - e.icon.w / 2 - h, anchor.at[1] - e.icon.h / 2 - h, anchor.at[0] + e.icon.w / 2 + h, anchor.at[1] + e.icon.h / 2 + h];
      shapes = [{ type: 'box', b: box }];
      ink = [anchor.at[0] - e.icon.w / 2, anchor.at[1] - e.icon.h / 2, anchor.at[0] + e.icon.w / 2, anchor.at[1] + e.icon.h / 2];
    } else {
      ribbon = ribbonOf(e, anchor);
      // MapLibre tests a line label as circles the height of its box (the
      // text's line height and its padding), set half a circle apart.
      const r = (e.box?.height ?? e.size * 1.2) / 2 + (e.padding ?? 2);
      shapes = [];
      let carry = 0;
      for (let i = 0; i < ribbon.length; i++) {
        if (i && (carry += Math.hypot(ribbon[i][0] - ribbon[i - 1][0], ribbon[i][1] - ribbon[i - 1][1])) < r / 2 && i < ribbon.length - 1) continue;
        carry = 0;
        shapes.push({ type: 'circle', x: ribbon[i][0], y: ribbon[i][1], r });
      }
    }
    shape = null;
    const allow = e.allowOverlap;
    const blockedBy = allow ? null : shapes.map((x) => index.first(x)).find(Boolean);
    if (blockedBy) { blocked ??= blockedBy; continue; }
    if (!e.ignorePlacement) for (const x of shapes) index.insert({ ...x, layer: s.layer, symbol: s });
    copies++;
    placed.push({
      layer: s.layer,
      index: s.index,
      kind: e.icon ? 'shield' : 'line-text',
      text: e.text,
      properties: s.properties,
      source: e.source,
      anchor: null,
      box: null,
      ink: ink ?? null,
      ribbon: ribbon ? { points: ribbon, half: e.size * 0.4 } : null,
      at: anchor.at,
      label: e,
      symbol: s,
    });
  }
  if (!copies && anchors.length) hidden.push({ layer: s.layer, index: s.index, text: e.text, properties: s.properties, symbol: s, blockedBy: blocked?.layer ?? null, boxes: [] });
}

// --- strokes ---------------------------------------------------------------------

/**
 * The lines a name must keep off, as strokes: each segment of each line's
 * drawn centreline with the half width it is drawn at.
 */
export class Strokes {
  constructor(lines, { half = (l) => (l.drawnWidth ?? l.width ?? 0) / 2 } = {}) {
    this.cells = new Map();
    this.stamp = 0;
    for (const line of lines) {
      const h = half(line);
      for (const part of line.drawn ?? line.parts) {
        for (let i = 1; i < part.length; i++) this.add({ a: part[i - 1], b: part[i], h, line });
      }
    }
  }

  add(seg) {
    const b = grow([Math.min(seg.a[0], seg.b[0]), Math.min(seg.a[1], seg.b[1]), Math.max(seg.a[0], seg.b[0]), Math.max(seg.a[1], seg.b[1])], seg.h);
    for (let x = Math.floor(b[0] / CELL); x <= Math.floor(b[2] / CELL); x++) {
      for (let y = Math.floor(b[1] / CELL); y <= Math.floor(b[3] / CELL); y++) {
        const k = `${x},${y}`;
        let cell = this.cells.get(k);
        if (!cell) this.cells.set(k, (cell = []));
        cell.push(seg);
      }
    }
  }

  // The lines whose strokes come within `slack` px of a shape (a box, or a
  // ribbon {points, half}), each once, with how far into the stroke the shape
  // reaches (px, 0 for a graze).
  touching(shape, { slack = 0 } = {}) {
    const box = Array.isArray(shape) ? shape : null;
    const pts = box ? null : shape.points;
    const b = box ?? grow([Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))], shape.half);
    const stamp = ++this.stamp;
    const out = new Map();
    for (let x = Math.floor(b[0] / CELL); x <= Math.floor(b[2] / CELL); x++) {
      for (let y = Math.floor(b[1] / CELL); y <= Math.floor(b[3] / CELL); y++) {
        for (const seg of this.cells.get(`${x},${y}`) ?? []) {
          if (seg.stamp === stamp) continue;
          seg.stamp = stamp;
          let depth = -Infinity;
          if (box) {
            if (!segmentHitsBox(seg.a, seg.b, grow(box, seg.h - slack))) continue;
            depth = 0;
          } else {
            let best = Infinity;
            for (let i = 1; i < pts.length; i++) best = Math.min(best, segmentGap(pts[i - 1], pts[i], seg.a, seg.b));
            if (best > shape.half + seg.h - slack) continue;
            depth = shape.half + seg.h - best;
          }
          const had = out.get(seg.line);
          if (!had || depth > had.depth) out.set(seg.line, { line: seg.line, depth });
        }
      }
    }
    return [...out.values()];
  }
}
