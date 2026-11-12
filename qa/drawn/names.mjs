// Names on the drawn model (qa/rules/design-invariants.md: LN03, LN04, LN05,
// LN06, LN07, LN10, LN11, PG05; qa/rules/literature.md: LB-02, LB-03, LB-10).
//
// Where each name ends up is worked out by the placement replay (place.mjs),
// which places every symbol the way the page does: rail letters first, then
// the hub's name, then the rail and frequent-bus keep-outs, then every other
// station's name, then the basemap's names last. These checks ask of the
// result what a rider sees: is a name on a line, on a mark, on the walk
// between two marks, twice, or the wrong one's.
//
//  - station-name-on-line (LN04): a station's name whose text touches rail or
//    a frequent bus street, the lines that serve the station included
//    (`over-line` lets a name sit on its own lines). A lighter bus line may be
//    crossed. From zoom 9.75, where the names start.
//  - hub-name-on-line (LN10): the hub's name touching rail or a frequent bus
//    street from zoom `hubClearFrom` (15). Below it the hub's name is placed
//    before the rail keep-out on purpose.
//  - place-name-on-line (LN05): a city, town, neighbourhood, landmark,
//    airport or water name touching rail or a frequent bus street at any
//    zoom, or a lighter bus line from zoom `lightBusFrom` (11.5).
//  - street-name-on-line (LN06): a street's name touching a rail or bus line
//    (the one it is set beside, or any other), at any zoom it is drawn.
//  - shield-on-bus (LN07): a highway shield touching any bus line, any zoom.
//  - name-on-mark (LB-02, LN08): a station's name touching a station mark
//    (its own or another's), or a Park-n-Ride sign. name-on-walk (PG05): the
//    same for the dotted walk between a station's two marks, and the second
//    mark.
//  - name-twice (PG05): two names placed for one station. name-repeated
//    (LN11): a place name that repeats a station's name beside it.
//  - name-nearer-other (LB-03): a station's name nearer another station's
//    mark than its own.
//  - name-early (LN03): below zoom 11 a name for a station that is neither
//    the end of a line nor the hub. hub-unnamed (LN02, LN10): the hub has no
//    name placed at a zoom it should.
//  - name-no-halo (LB-10): a name with no halo drawn over a line or a mark.
//
// Thresholds are screen px at the zoom of the model passed in, except where
// they are zooms (the page's own, written in DESIGN.md: "from zoom 15", "from
// 11.5", "every station is named from 11"). A name's "text" is the ink box of
// its text as drawn (or, for a name along a street, a ribbon the text's
// height), not the collision box MapLibre keeps around it. Nothing here names
// a route, a station, a layer or a colour; the sources are the page's own
// (`stations`, `platforms`, the basemap's `openmaptiles`).

import { Strokes, segmentGap } from './place.mjs';
import { quadOf, stationMarks } from './ends.mjs';

export const NAME_LIMITS = {
  // Ink may touch a stroke by this much (px) before it counts: a graze of
  // the halo is not a name on a line.
  touch: 0.5,
  // A name and a mark overlap by at least this much (px, the shallower way).
  markDepth: 1,
  // DESIGN.md: the hub stays off rail and frequent buses from here; lighter
  // buses are kept clear of other names from here; every station is named
  // from here, and below it only line ends and the hub.
  hubClearFrom: 15,
  lightBusFrom: 11.5,
  everyNameFrom: 11,
  // The first zoom the hub's name is drawn at (DESIGN.md, LN02: 9.75 to 14,
  // then the near name).
  hubNamedFrom: 9.75,
  // A place name this near (px) a station's name and the same words is its
  // second name.
  repeatPx: 80,
  // The station's own mark must be nearer than another's by this much (px).
  nearerBy: 1,
};

const isCasing = (layer) => /-(casing|edge|outline)$/.test(layer);
const isRail = (l) => l.mode === 'rail' || l.properties?.mode === 'rail';
const isBus = (l) => (l.mode === 'bus' || l.properties?.mode === 'bus') && !isCasing(l.layer);
// "Frequent": a bus every 15 minutes or better. A street class is named for
// its headway (`c15`: every 15), and a route by its tier.
const frequent = (l) => {
  const cls = /^c(\d+)$/.exec(String(l.properties?.cls ?? ''));
  return cls ? Number(cls[1]) <= 15 : l.properties?.tier === 'frequent';
};
const words = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const centre = (shape) => {
  if (Array.isArray(shape)) return [(shape[0] + shape[2]) / 2, (shape[1] + shape[3]) / 2];
  const n = shape.points.length;
  return shape.points[Math.floor(n / 2)];
};

// The name's text as drawn: its ink box, or the ribbon of a street name.
export const shapeOf = (p) => (p.ribbon ?? p.ink);
const boxOf = (shape) => (Array.isArray(shape)
  ? shape
  : [Math.min(...shape.points.map((q) => q[0])) - shape.half, Math.min(...shape.points.map((q) => q[1])) - shape.half, Math.max(...shape.points.map((q) => q[0])) + shape.half, Math.max(...shape.points.map((q) => q[1])) + shape.half]);

// --- a name against a mark ------------------------------------------------------------

const rectQuad = (r) => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// How deep a box and a turned mark overlap (px, the shallower way; 0 when
// they do not), by separating axes.
export function depthBoxQuad(box, quad) {
  let depth = Infinity;
  for (const axis of [[1, 0], [0, 1], quad.u, quad.v]) {
    const a = rectQuad(box).map((c) => dot(c, axis)), b = quad.corners.map((c) => dot(c, axis));
    const o = Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b));
    if (o <= 0) return 0;
    depth = Math.min(depth, o);
  }
  return depth;
}

// The gap between a box and a turned mark (0 when they overlap).
export function gapBoxQuad(box, quad) {
  if (depthBoxQuad(box, quad) > 0) return 0;
  const r = rectQuad(box);
  let best = Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) best = Math.min(best, segmentGap(r[i], r[(i + 1) % 4], quad.corners[j], quad.corners[(j + 1) % 4]));
  return best;
}

// --- the checks ------------------------------------------------------------------------

/**
 * Faults among the names a placement put down.
 * @param {{placed: Array, hidden: Array}} placement from placeSymbols
 * @param {{z: number, lines: Array, marks: Array}} zoom the model's zoom
 */
export function nameFaults(placement, zoom, opts = {}) {
  const o = { ...NAME_LIMITS, ...opts };
  const z = zoom.z ?? placement.z;
  const lines = (zoom.lines ?? []).filter((l) => !isCasing(l.layer) && l.source !== 'flexride');
  const rail = new Strokes(lines.filter(isRail));
  const heavy = new Strokes(lines.filter((l) => isBus(l) && frequent(l)));
  const lightOnly = new Strokes(lines.filter((l) => isBus(l) && !frequent(l)));
  const anyBus = new Strokes(lines.filter(isBus));
  const faults = [];
  const fault = (kind, p, msg, extra = {}) => {
    const c = p.at ?? centre(shapeOf(p) ?? [0, 0, 0, 0]);
    faults.push({ kind, layer: p.layer, text: p.text, px: [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10], msg, ...extra });
  };
  const names = placement.placed.filter((p) => (p.kind === 'text' || p.kind === 'line-text' || p.kind === 'shield') && shapeOf(p));
  const station = (p) => p.kind === 'text' && p.source === 'stations';
  const basemap = (p) => p.source !== 'stations' && p.source !== 'labels' && p.label?.sourceLayer;

  const hits = (strokes, p) => strokes.touching(shapeOf(p), { slack: o.touch });
  const onLine = (kind, p, found, what) => {
    if (!found.length) return;
    const worst = found.reduce((a, b) => (b.depth > a.depth ? b : a));
    const l = worst.line;
    fault(kind, p, `"${p.text}" touches ${what(l)}`, { route: l.route ?? l.properties?.routes ?? null, crossed: { layer: l.layer, route: l.route ?? l.properties?.routes ?? null, cls: l.properties?.cls ?? null } });
  };
  const nameOf = (l) => (isRail(l) ? `rail ${l.route}` : frequent(l) ? `the frequent bus line ${l.properties?.routes ?? l.route ?? ''}`.trim() : `bus line ${l.properties?.routes ?? l.route ?? ''}`.trim());

  for (const p of names) {
    const hub = p.properties?.hub === true || p.properties?.meet === true;
    if (station(p)) {
      // LN04 / LN10: off rail and frequent buses, own lines included.
      const found = [...hits(rail, p), ...hits(heavy, p)];
      if (hub) {
        if (z >= o.hubClearFrom) onLine('hub-name-on-line', p, found, nameOf);
      } else {
        onLine('station-name-on-line', p, found, nameOf);
      }
    } else if (p.kind === 'shield') {
      // LN07: never on a bus line.
      onLine('shield-on-bus', p, hits(anyBus, p), nameOf);
    } else if (p.kind === 'line-text' && basemap(p)) {
      // LN06: beside the street, never on a line.
      onLine('street-name-on-line', p, [...hits(rail, p), ...hits(anyBus, p)], nameOf);
    } else if (basemap(p)) {
      // LN05: rail and frequent buses always; the lighter lines from 11.5.
      const found = [...hits(rail, p), ...hits(heavy, p), ...(z >= o.lightBusFrom ? hits(lightOnly, p) : [])];
      onLine('place-name-on-line', p, found, nameOf);
    }
  }

  // Marks: a name on a station's mark, or a P sign, or the second mark or
  // the walk to it.
  const marks = stationMarks(zoom).filter((m) => m.drawn);
  const signs = (zoom.marks ?? []).filter((m) => m.kind === 'icon' && m.source === 'facilities' && m.opacity >= 0.5).map((m) => ({ ...m, quad: quadOf(m) }));
  const walks = new Strokes(lines.filter((l) => l.source === 'platforms' && l.properties?.kind === 'join'), { half: (l) => Math.max((l.drawnWidth ?? 0) / 2, 1.5) });
  for (const p of names.filter(station)) {
    const box = p.ink;
    for (const m of [...marks, ...signs]) {
      const d = depthBoxQuad(box, m.quad);
      if (d < o.markDepth) continue;
      const second = m.source === 'platforms';
      const own = m.properties?.id != null && m.properties.id === p.properties?.id;
      fault(second ? 'name-on-walk' : 'name-on-mark', p, `"${p.text}" overlaps ${second ? 'the second mark' : m.source === 'facilities' ? 'a sign' : own ? 'its own mark' : `the mark of ${m.name}`} by ${d.toFixed(1)} px`, { with: m.name ?? m.layer });
    }
    for (const w of walks.touching(box, { slack: o.touch })) {
      fault('name-on-walk', p, `"${p.text}" sits on the walk between the marks of a station`, { with: w.line.layer });
    }
  }

  // Once: one name for each station id.
  const byId = new Map();
  for (const p of names.filter(station)) {
    const id = p.properties?.id;
    if (id == null) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(p);
  }
  for (const list of byId.values()) {
    if (list.length > 1) fault('name-twice', list[1], `"${list[1].text}" is named ${list.length} times (${list.map((q) => q.layer).join(', ')})`);
  }
  // LN11: a place that repeats a station's name beside it.
  const stationNames = [...byId.values()].flat();
  for (const p of names.filter(basemap)) {
    if (p.kind !== 'text') continue;
    const w = words(p.text);
    if (!w) continue;
    for (const s of stationNames) {
      const sw = words(s.text);
      const same = sw === w || (` ${sw} `).includes(` ${w} `) || (` ${w} `).includes(` ${sw} `);
      if (!same) continue;
      const a = centre(p.ink), b = centre(s.ink);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > o.repeatPx) continue;
      fault('name-repeated', p, `"${p.text}" (${p.layer}) repeats the name of the station beside it, "${s.text}"`);
      break;
    }
  }

  // LB-03: nearer another station's mark than its own.
  for (const p of names.filter(station)) {
    const id = p.properties?.id;
    const gaps = marks.filter((m) => m.properties?.id != null).map((m) => ({ m, g: gapBoxQuad(p.ink, m.quad), own: m.properties.id === id }));
    const own = Math.min(Infinity, ...gaps.filter((x) => x.own).map((x) => x.g));
    const other = gaps.filter((x) => !x.own).reduce((a, b) => (b.g < a.g ? b : a), { g: Infinity });
    if (own !== Infinity && other.g + o.nearerBy < own) {
      fault('name-nearer-other', p, `"${p.text}" is ${own.toFixed(0)} px from its mark and ${other.g.toFixed(0)} px from the mark of ${other.m.name}`, { with: other.m.name });
    }
  }

  // LB-10: a name with no halo drawn over a line or a mark.
  for (const p of names) {
    if (p.kind === 'shield' || (p.label?.haloWidth ?? 1) >= 1) continue;
    const found = [...hits(rail, p), ...hits(anyBus, p)];
    if (found.length) fault('name-no-halo', p, `"${p.text}" has no halo and lies over ${nameOf(found[0].line)}`);
  }

  // LN03 and the hub: which names a zoom has.
  const stations = (zoom.labels ?? []).filter((l) => l.kind === 'text' && l.source === 'stations' && l.properties?.served === true);
  if (z < o.everyNameFrom) {
    for (const l of stations) {
      const hub = l.properties.hub === true || l.properties.meet === true;
      if (!hub && l.properties.end !== true) {
        faults.push({ kind: 'name-early', layer: l.layer, text: l.text, px: l.at, msg: `"${l.text}" is named at zoom ${z}, below ${o.everyNameFrom}, and is not the end of a line` });
      }
    }
  }
  if (z >= o.hubNamedFrom) {
    const hubs = (zoom.marks ?? []).filter((m) => m.kind === 'icon' && m.source === 'stations' && (m.properties?.hub === true || m.properties?.meet === true) && m.properties?.served === true);
    const named = new Set(names.filter(station).map((p) => p.properties?.id));
    const seen = new Set();
    for (const m of hubs) {
      if (named.has(m.properties.id) || seen.has(m.properties.id)) continue;
      seen.add(m.properties.id);
      faults.push({ kind: 'hub-unnamed', layer: m.layer, text: m.properties.label ?? m.properties.name, px: m.at, msg: `the hub, ${m.properties.label ?? m.properties.name}, has no name at zoom ${z}` });
    }
  }
  return faults;
}
