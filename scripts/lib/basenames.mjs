// The base map's place names, read from our own copy of the ground and placed
// by the build (#235; plan #129, step 4).
//
// OpenMapTiles writes a place's name into the deepest tile that holds it, and
// our copy of the ground keeps every name at zoom 14 (`basemap/`, #213). The
// page's own place layers then let MapLibre decide where each name goes and
// which names fit, so a neighbourhood name arrives when the tiles first carry
// it (zoom 14) and takes a place a route list may already hold.
//
// This module makes the build the one that decides. It reads the names the
// ground holds, keeps the classes the page letters (style.js, `place-<n>`),
// records the first zoom the tiles carry each one at, and places them against
// the room every other label in a drawing takes. Placement happens once for
// every drawing from the name's first zoom to the closest, at one ground
// position, so zooming in only adds: a name never changes place or goes.
//
// Stage 1 of #235 is these names at 13 and 14. It is enough for them alone;
// street names and shields are stage 2, after #155 and the lettering plan
// (#234). Nothing here hardcodes RTD's network or the ground's contents.

import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { textWidth } from '../glyphs.mjs';
import { SIZES, toPx } from './sheets.mjs';
import { PLACE_SIZE, ROW_HEIGHT } from '../../public/js/sheets/style.js';

// The classes the page letters from the first sheet that draws neighbourhoods
// inward, most important first. This is style.js's `classes` at `place-<n>`
// for n >= 3, and the order of its `symbol-sort-key`.
export const PLACE_CLASSES = ['suburb', 'quarter', 'neighbourhood'];
// The page's own type for these names: medium weight, uppercase, with the
// style's letter spacing and padding (style.js, `place-<n>`).
export const PLACE_FONT = 'Overpass Medium';
export const PLACE_SPACING = 0.22;
export const PLACE_PAD = 4;

// How far a name may move, in metres, to keep off a label already placed.
// The least move that clears wins, so a name stays as near its place as the
// room allows.
export const MOVE_BY = [0, 40, 80, 130, 200, 300, 450, 650, 850];

// The grid that holds the room labels take. Cells are small enough to keep a
// drawing's check cheap and large enough that a 40 km drawing is not one
// entry per pixel.
const CELL = 16;

const rankOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 99;
};

/** A place's point, in longitude and latitude, from a tile's own coordinates. */
export function tilePoint([x, y], z, extent, tx, ty) {
  const world = 2 ** z;
  const lon = ((tx + x / extent) / world) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * (ty + y / extent)) / world;
  return [lon, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
}

// A tile's place layer as name records. The ground keeps only the layers and
// properties the page draws, so anything here is a name the map may show.
function placesInTile(bytes, key) {
  const [z, tx, ty] = key.split('/').map(Number);
  const layer = new VectorTile(new PbfReader(bytes)).layers.place;
  if (!layer) return [];
  const out = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const { name, class: cls, rank } = f.properties;
    if (!name || !PLACE_CLASSES.includes(cls)) continue;
    // The style does not set a register entry ("… Historic District"): a name
    // people use for where they are, not a listing (style.js, place-<n>).
    if (/historic district/i.test(name)) continue;
    for (const ring of f.loadGeometry()) {
      for (const p of ring) out.push({ name, cls, rank: rankOf(rank), at: tilePoint([p.x, p.y], z, layer.extent, tx, ty), zoom: z });
    }
  }
  return out;
}

// One record per name and point: a place on a tile's edge is written into
// every tile that edge touches, and the same place is carried from zoom to
// zoom. Names that genuinely occur twice stay two records; they are two
// places with one name.
const keyOf = (r) => `${r.cls}|${r.name}|${r.at.map((v) => v.toFixed(5)).join(',')}`;

/**
 * Every place name the ground holds, at every zoom it holds them, one record
 * per name and point, with `from`: the shallowest zoom its point is drawn at.
 * Returns `{ names, counts }`; `counts` is per zoom and class, for the report.
 */
export function readPlaces(pack, { zooms = null } = {}) {
  const found = new Map();
  for (const [key, bytes] of pack.tiles()) {
    const z = Number(key.split('/')[0]);
    if (zooms && !zooms.includes(z)) continue;
    for (const r of placesInTile(bytes, key)) {
      const k = `${z}|${keyOf(r)}`;
      if (!found.has(k)) found.set(k, r);
    }
  }
  const counts = {};
  for (const r of found.values()) {
    counts[r.zoom] ??= { names: 0, classes: {} };
    counts[r.zoom].names++;
    counts[r.zoom].classes[r.cls] = (counts[r.zoom].classes[r.cls] ?? 0) + 1;
  }
  const { names, deepZoom } = chainPlaces([...found.values()]);
  return { names, counts, deepZoom };
}

/** Records (one per zoom, name and point) to the deepest zoom's places, each with `from`. */
export function chainPlaces(records) {
  const zooms = [...new Set(records.map((r) => r.zoom))].sort((x, y) => y - x);
  const deepZoom = zooms[0];
  const names = records.filter((r) => r.zoom === deepZoom).map((r) => ({ ...r, from: deepZoom }));
  // Walk outward one zoom at a time. Each place at a shallower zoom takes the
  // nearest same-name, same-class place one zoom deeper that no other place has
  // taken (one to one), so repeated names stay separate places and a point the
  // tiles moved by more than a pixel is still followed. A place with no match
  // starts its own chain and is not carried back.
  let deeper = names.map((r) => ({ r, root: r }));
  for (const z of zooms.slice(1)) {
    const here = records.filter((r) => r.zoom === z);
    const pairs = [];
    for (const [i, r] of here.entries()) {
      for (const [j, d] of deeper.entries()) {
        if (d.r.cls !== r.cls || d.r.name !== r.name) continue;
        const dist = pixelGap(d.r.at, r.at, d.r.zoom);
        if (dist <= MATCH_PX) pairs.push({ i, j, dist });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist || a.i - b.i || a.j - b.j);
    const takenHere = new Set(), takenDeep = new Set(), next = [];
    for (const { i, j } of pairs) {
      if (takenHere.has(i) || takenDeep.has(j)) continue;
      takenHere.add(i);
      takenDeep.add(j);
      deeper[j].root.from = Math.min(deeper[j].root.from, z);
      next.push({ r: here[i], root: deeper[j].root });
    }
    deeper = next;
  }
  return { names, deepZoom };
}

// How far the tiles may carry one place between two zooms: simplification
// moves a point, so a pixel is too tight (#265).
const MATCH_PX = 4;
const pixelGap = (a, b, zoom) => {
  const [p, q] = [toPx(a, zoom), toPx(b, zoom)];
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
};

/** The drawings a plan must be checked on: every one at or past `firstZoom`. Names
 * that are missing a drawing were never checked there, so the caller stops. */
export function drawingsNeeded(sheets, firstZoom, has) {
  const need = sheets.filter((s) => s.zoom >= firstZoom);
  return { need, missing: need.filter((s) => !has(s)) };
}

/** The box a name takes when its text is centred on `at`, at `zoom` and `size`. */
export function nameBox(text, at, zoom, size) {
  const [x, y] = toPx(at, zoom);
  const w = textWidth(text, PLACE_FONT, size, PLACE_SPACING) + 2 * PLACE_PAD;
  const h = size * 1.12 + 2 * PLACE_PAD;
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}

/** The room labels take in one drawing, as boxes on a grid. */
export class Room {
  constructor(cell = CELL) {
    this.cell = cell;
    this.grid = new Map();
    this.all = [];
  }

  add(box) {
    this.all.push(box);
    for (let x = Math.floor(box[0] / this.cell); x <= Math.floor(box[2] / this.cell); x++) {
      for (let y = Math.floor(box[1] / this.cell); y <= Math.floor(box[3] / this.cell); y++) {
        const k = `${x},${y}`;
        const at = this.grid.get(k);
        if (at) at.push(box);
        else this.grid.set(k, [box]);
      }
    }
  }

  /** Whether `box` touches a box already taken. */
  hits(box) {
    for (let x = Math.floor(box[0] / this.cell); x <= Math.floor(box[2] / this.cell); x++) {
      for (let y = Math.floor(box[1] / this.cell); y <= Math.floor(box[3] / this.cell); y++) {
        for (const o of this.grid.get(`${x},${y}`) ?? []) {
          if (box[0] < o[2] && o[0] < box[2] && box[1] < o[3] && o[1] < box[3]) return true;
        }
      }
    }
    return false;
  }
}

const boxesAlong = (path, radius, room) => {
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1, radius)));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n;
      const y = a[1] + ((b[1] - a[1]) * k) / n;
      room.add([x - radius, y - radius, x + radius, y + radius]);
    }
  }
};

const pointsOf = (coords, out = []) => {
  if (typeof coords[0] === 'number') out.push(coords);
  else coords.forEach((c) => pointsOf(c, out));
  return out;
};

// A MultiLineString's parts, each on its own: joining the end of one sketch to
// the start of the next would take room where no line runs.
const lineParts = (coords, out = []) => {
  if (!coords.length) return out;
  if (typeof coords[0][0] === 'number') out.push(coords);
  else coords.forEach((c) => lineParts(c, out));
  return out;
};

/**
 * The room a sheet's own labels take: rail, a line's letter, station names,
 * route lists and bus street names. The page's place layers sit after these
 * (style.js), and a place name never covers rail or a station.
 */
export function roomOfSheet(drawn, sheet) {
  const room = new Room();
  const { id, zoom } = sheet;
  const listSize = SIZES.busLabelSize[id];
  const px = (c) => toPx(c, zoom);
  const path = (f) => pointsOf(f.geometry.coordinates).map(px);
  for (const f of drawn.features) {
    const p = f.properties ?? {};
    if (!f.geometry) continue;
    if (p.kind === 'rail') {
      for (const part of lineParts(f.geometry.coordinates)) boxesAlong(part.map(px), SIZES.rail[id] / 2 + SIZES.gap[id] / 2, room);
    } else if (p.kind === 'letter') {
      const r = (p.small ? SIZES.nameLetter[id] : SIZES.letterDisc[id]) + 1;
      for (const [x, y] of path(f)) room.add([x - r, y - r, x + r, y + r]);
    } else if (p.kind === 'bus-label' || p.kind === 'bus-street') {
      // The figures' one row and its halo, along the stretch they are set on.
      for (const part of lineParts(f.geometry.coordinates)) boxesAlong(part.map(px), listSize * 0.6 + 4, room);
    } else if (p.kind === 'bus-stack') {
      // A list too long for its stretch is stacked in two rows, turned with the
      // street (style.js, busStack): the upright box around the turned text.
      const [x, y] = path(f)[0];
      const rows = String(p.label ?? '').split('\n');
      const wide = Math.max(...rows.map((t) => textWidth(t, 'Overpass SemiBold', listSize, 0.02)));
      const tall = rows.length * listSize * ROW_HEIGHT;
      const a = ((Number(p.angle) || 0) * Math.PI) / 180;
      const hx = (Math.abs(Math.cos(a)) * wide + Math.abs(Math.sin(a)) * tall) / 2 + 4;
      const hy = (Math.abs(Math.sin(a)) * wide + Math.abs(Math.cos(a)) * tall) / 2 + 4;
      room.add([x - hx, y - hy, x + hx, y + hy]);
    } else if (p.kind === 'station' && p.shape === 'name' && p.bx && !p.alt && !p.edge) {
      const [x, y] = path(f)[0];
      const [x0, y0, x1, y1] = String(p.bx).split(',').map(Number);
      room.add([x + x0 - PLACE_PAD, y + y0 - PLACE_PAD, x + x1 + PLACE_PAD, y + y1 + PLACE_PAD]);
    }
  }
  return room;
}

// A point `metres` from `at`, along a bearing given as [east, north].
const movedTo = ([lon, lat], [east, north], metres) => [
  lon + metres * east / (111320 * Math.cos((lat * Math.PI) / 180)),
  lat + metres * north / 111320,
];

const bearings = [[0, 0]];
for (let i = 0; i < 16; i++) {
  const a = (2 * Math.PI * i) / 16;
  bearings.push([Math.cos(a), Math.sin(a)]);
}

const sortKey = (r) => `${String(PLACE_CLASSES.indexOf(r.cls)).padStart(2, '0')}|${String(r.rank).padStart(3, '0')}|${r.name}|${r.at.join(',')}`;

/**
 * Places `names` against the room in `frames` (`[{ zoom, size, room }]`), each
 * drawing from the name's `from` zoom inward, at one ground position for its
 * whole life. A name takes its own point when it can, then the least move in
 * MOVE_BY that clears every drawing. A name with no room anywhere does not
 * show at all: showing at a wider zoom and not at a closer one breaks the
 * rule that zooming in only adds.
 *
 * Returns `{ names, dropped }`: the placed names carry `at` (their ground
 * point), `moved` (metres) and `to` (the closest drawing's zoom).
 */
export function placeBaseNames(names, frames, { moves = MOVE_BY } = {}) {
  const ordered = [...frames].sort((a, b) => a.zoom - b.zoom);
  if (!ordered.length) throw new Error('base names: no drawings to place them on');
  const placed = [];
  const dropped = [];
  for (const name of [...names].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1))) {
    const range = ordered.filter((f) => f.zoom >= name.from);
    const text = name.name.toUpperCase();
    let found = null;
    for (const metres of moves) {
      for (const bearing of metres === 0 ? [[0, 0]] : bearings.slice(1)) {
        const at = metres === 0 ? name.at : movedTo(name.at, bearing, metres);
        const clear = range.every((f) => !f.room.hits(nameBox(text, at, f.zoom, f.size)));
        if (clear) {
          found = { at, moved: metres };
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      dropped.push({ ...name, reason: 'no room in every drawing from its first zoom' });
      continue;
    }
    for (const f of range) f.room.add(nameBox(text, found.at, f.zoom, f.size));
    placed.push({ ...name, at: found.at, moved: found.moved, from: range[0].zoom, to: range.at(-1).zoom });
  }
  return { names: placed, dropped };
}

/**
 * What is wrong with a plan, as a list of messages. It reads the plan alone:
 * ids are unique, no two names at a zoom overlap, and no name goes while the
 * map zooms in. The build must fail on a non-empty list (the proposal's plan
 * check, #234).
 */
export function checkPlan(plan) {
  const problems = [];
  const seen = new Set();
  const deepest = Math.max(...plan.frames.map((f) => f.zoom));
  for (const n of plan.names) {
    if (seen.has(n.id)) problems.push(`${n.id}: id used twice`);
    seen.add(n.id);
    if (n.from > n.to) problems.push(`${n.id}: from ${n.from} is closer than to ${n.to}`);
    if (n.to < deepest) problems.push(`${n.id}: goes at ${n.to} while the map zooms on to ${deepest}`);
  }
  for (const f of plan.frames) {
    const room = new Room();
    for (const n of plan.names) {
      if (n.from > f.zoom || n.to < f.zoom) continue;
      const box = nameBox(n.text, n.at, f.zoom, f.size);
      if (room.hits(box)) problems.push(`${n.id}: overlaps another name at ${f.zoom}`);
      room.add(box);
    }
  }
  return problems;
}

/** The plan's names as the file the page reads: one record per name. */
export function planOf({ names, frames, source }) {
  return {
    kind: 'basenames',
    source,
    frames: frames.map((f) => ({ zoom: f.zoom, size: f.size })),
    names: names.map((n) => ({
      id: n.id,
      kind: n.cls === 'suburb' ? 'district' : 'neighbourhood',
      cls: n.cls,
      text: n.name.toUpperCase(),
      rank: n.rank,
      at: n.at.map((v) => Math.round(v * 1e6) / 1e6),
      from: n.from,
      to: n.to,
      moved: Math.round(n.moved * 10) / 10,
    })),
  };
}

/** The stable id of a place: its class, its name and the point it names. */
export const placeId = (r) => `place:${r.cls}:${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}:${r.at[0].toFixed(4)},${r.at[1].toFixed(4)}`;

/** The size the page letters these names at, on a drawing of `sheet`. */
export const placeSize = (sheet) => PLACE_SIZE[sheet.id];
