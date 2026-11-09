// Line faults in the drawn model (issue #43): gaps, short pieces and
// sideways steps, found from the geometry alone, with no browser.
//
// The model gives every line layer's features as polylines in screen px at a
// zoom (world px at z are screen px at z). These checks read that, and only
// that: a fault is a place where what is drawn is not a line a rider could
// follow. Thresholds are screen px, because that is what a rider sees, and
// they hold at every zoom.
//
// What is checked, and why:
//  - gap: two ends of the same route and layer sit 1 to `maxGap` px apart.
//    Ends further apart are termini or branches, not a break (15th Street's
//    corner, Nine Mile's stub).
//  - short: a drawn piece shorter than `minPiece` px: a nub or a dot where a
//    line should be (the stray marks at 15th Street).
//  - step: two nearly parallel runs joined by a short sideways jump, 1 px to
//    `maxStep` px off (lower 15th Street, west of Nine Mile).
// A casing and an edge draw the same geometry as their line, so a fault is
// reported once, on the line layer itself.

import { toLonLat } from './mercator.mjs';

const isCasing = (layer) => /-(casing|edge|outline)$/.test(layer);

// A line that carries at least one route: a rail or bus feature with a route
// name, or a street drawn for the routes that run on it. A bare street is
// basemap-shaped geometry, not a route, and none of these checks apply to it.
const isRoute = (entry) => entry.route != null
  || String(entry.properties?.routes ?? '').split(/\s+/).some(Boolean);

// Ground metres per screen px at a latitude, for the model's 512 px tiles.
const metresPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);

const length = (part) => {
  let n = 0;
  for (let i = 1; i < part.length; i++) n += Math.hypot(part[i][0] - part[i - 1][0], part[i][1] - part[i - 1][1]);
  return n;
};

const at = (part) => part[Math.floor(part.length / 2)];

// The angle between two vectors, in degrees, 0 to 180.
function turn(a, b) {
  const la = Math.hypot(a[0], a[1]);
  const lb = Math.hypot(b[0], b[1]);
  if (!la || !lb) return 0;
  const c = (a[0] * b[0] + a[1] * b[1]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

// A sideways step at vertex i: the connector (i to i+1) is short and roughly
// square to the runs on either side, and those runs go the same way.
function stepAt(part, i, maxStep) {
  if (i < 1 || i + 2 >= part.length) return null;
  const a = part[i - 1], b = part[i], c = part[i + 1], d = part[i + 2];
  const before = [b[0] - a[0], b[1] - a[1]];
  const connector = [c[0] - b[0], c[1] - b[1]];
  const after = [d[0] - c[0], d[1] - c[1]];
  const jump = Math.hypot(connector[0], connector[1]);
  if (jump < 1 || jump > maxStep) return null;
  if (Math.hypot(before[0], before[1]) < jump * 2 || Math.hypot(after[0], after[1]) < jump * 2) return null;
  const squareIn = turn(before, connector);
  const squareOut = turn(connector, after);
  if (squareIn < 60 || squareIn > 120 || squareOut < 60 || squareOut > 120) return null;
  // Both runs point along the same strand (a jump across, not a corner).
  if (turn(before, after) > 30) return null;
  return jump;
}

function distToSeg([px, py], a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/**
 * Faults in a zoom's drawn lines.
 * @param {{lines: Array}} zoom the model's zoom(z) output
 * @param {{maxGap?: number, minPiece?: number, maxStep?: number}} opts
 *   maxGap in ground metres (the data's own join scale), the rest in screen px
 * @returns {Array<{kind:string, layer:string, route:string|null, px:number[], msg:string}>}
 */
export function lineFaults(zoom, { maxGap = 30, minPiece = 3, maxStep = 8 } = {}) {
  const faults = [];
  const seen = new Set();
  const add = (kind, entry, px, detail) => {
    const key = `${kind}:${entry.layer}:${entry.route}:${Math.round(px[0] / 2)}:${Math.round(px[1] / 2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    faults.push({
      kind,
      layer: entry.layer,
      route: entry.route,
      px: [Math.round(px[0] * 10) / 10, Math.round(px[1] * 10) / 10],
      msg: `${kind} on ${entry.layer} ${entry.route ?? entry.properties?.routes ?? '(no route)'} at ${px[0].toFixed(0)},${px[1].toFixed(0)}: ${detail}`,
    });
  };

  // A short piece that lies on another route line is a fragment of that line,
  // not a stray dot: at low zooms the build splits a route into many small
  // pieces that draw on top of one another. Only a short piece with no route
  // line within a few px of any of its points is a fault.
  const coverPx = 2;
  const coverCell = 64;
  const coverGrid = new Map();
  const routeLines = zoom.lines.filter((e) => !isCasing(e.layer) && e.source !== 'flexride' && isRoute(e));
  for (const e of routeLines) {
    for (const part of e.parts) {
      for (let i = 1; i < part.length; i++) {
        const [a, b] = [part[i - 1], part[i]];
        const x0 = Math.floor(Math.min(a[0], b[0]) / coverCell);
        const x1 = Math.floor(Math.max(a[0], b[0]) / coverCell);
        const y0 = Math.floor(Math.min(a[1], b[1]) / coverCell);
        const y1 = Math.floor(Math.max(a[1], b[1]) / coverCell);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const k = `${x},${y}`;
          if (!coverGrid.has(k)) coverGrid.set(k, []);
          coverGrid.get(k).push({ a, b, part });
        }
      }
    }
  }
  const covered = (part) => {
    for (const q of part) {
      const cx = Math.floor(q[0] / coverCell);
      const cy = Math.floor(q[1] / coverCell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const s of coverGrid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (s.part === part) continue;
          if (distToSeg(q, s.a, s.b) <= coverPx) return true;
        }
      }
    }
    return false;
  };

  // The build writes a route's pieces in order (one MultiLineString per
  // feature), so the end of one piece should be the start of the next. That
  // order is what the gap test follows: pairing arbitrary ends instead would
  // join a branch to a main line and report every branch mouth as a break.
  for (const entry of zoom.lines) {
    if (isCasing(entry.layer) || entry.source === 'flexride' || !isRoute(entry)) continue;
    const parts = entry.parts.filter((p) => p.length >= 2);
    // The join distance from part p-1's end to part p's start, in px (Infinity
    // when either part is missing or the ends are not on the same ground).
    const join = (p) => {
      if (p <= 0 || p >= parts.length) return Infinity;
      const a = parts[p - 1][parts[p - 1].length - 1];
      const b = parts[p][0];
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    };
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const len = length(part);
      const gapPx = maxGap / metresPerPx(toLonLat(part[0], zoom.z)[1], zoom.z);
      // A short piece is a fault only when it stands alone: a tiny segment
      // between two exact joins is just a vertex pair the build split.
      if (len < minPiece && !covered(part) && join(p) > gapPx && join(p + 1) > gapPx) {
        add('short', entry, at(part), `isolated piece ${len.toFixed(1)} px long`);
      }
      for (let i = 1; i < part.length - 2; i++) {
        const off = stepAt(part, i, maxStep);
        if (off !== null) add('step', entry, part[i], `sideways ${off.toFixed(1)} px between parallel runs`);
      }
      if (p === 0) continue;
      const d = join(p);
      // The join scale is ground metres: 30 m is 2 px at zoom 12 and 50 px at
      // zoom 17, so the same data gap is judged the same at every zoom.
      if (d >= 1 && d <= gapPx) {
        const a = parts[p - 1][parts[p - 1].length - 1];
        const b = part[0];
        add('gap', entry, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], `pieces ${p - 1} and ${p} end ${d.toFixed(1)} px apart`);
      }
    }
  }

  return faults.sort((a, b) => a.kind.localeCompare(b.kind) || a.layer.localeCompare(b.layer));
}
