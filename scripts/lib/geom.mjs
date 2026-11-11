// Small planar geometry helpers shared by the build's line work
// (scripts/lib/busnames.mjs, scripts/lib/streets.mjs). Points are projected
// meters, [x, y]. Nothing here knows the network.

// Segments in a grid, to find those near a point quickly.
export class Grid {
  constructor(size) {
    this.size = size;
    this.cells = new Map();
    this.stamp = 0;
  }
  add(a, b, item) {
    const seg = { a, b, item };
    const keys = new Set([this.key(a), this.key(b), this.key([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])]);
    for (const k of keys) (this.cells.get(k) ?? this.cells.set(k, []).get(k)).push(seg);
  }
  key([x, y]) {
    return cellKey(Math.floor(x / this.size), Math.floor(y / this.size));
  }
  near(p, within) {
    const [cx, cy] = [Math.floor(p[0] / this.size), Math.floor(p[1] / this.size)];
    const found = [];
    const stamp = ++this.stamp;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const seg of this.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (seg.seen === stamp) continue;
          seg.seen = stamp;
          if (segmentDistance(p, seg.a, seg.b) <= within) found.push(seg);
        }
      }
    }
    return found;
  }
}

// A grid cell's key as one number (cells are tens of meters, so the network
// spans far fewer than 2^20 of them each way).
const cellKey = (cx, cy) => (cx + 2 ** 20) * 2 ** 21 + (cy + 2 ** 20);

// Points about `step` apart along a path (segments are at most `step` long, so
// a grid with cells that size or larger sees every segment near them).
export function densify(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

// The unit direction of a path at point i (over its neighbours).
export function direction(points, i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

// Distance from p to the segment ab.
export function segmentDistance(p, a, b) {
  return Math.hypot(...sub(p, closestOnSegment(p, a, b)));
}

// The point of segment ab closest to p.
export function closestOnSegment(p, a, b) {
  const v = [b[0] - a[0], b[1] - a[1]];
  const len2 = v[0] * v[0] + v[1] * v[1];
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len2)) : 0;
  return [a[0] + t * v[0], a[1] + t * v[1]];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

export function length(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return sum;
}

// Douglas-Peucker on projected points, to `tolerance` meters.
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let [worst, index] = [-1, 0];
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > worst) [worst, index] = [d, i];
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export const dedupe = (coords) => coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1]);
export const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates);

// Is the point inside the closed ring (even-odd, the ring closed from its last
// point back to its first)?
export function insideRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Where segment ab crosses an edge, as a fraction of ab, or null.
function crossing(a, b, c, d) {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-18) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

/**
 * A line with the parts inside any ring (a terminal's hall, in lon/lat) taken
 * out: where it enters, it ends; where it leaves, it starts again. A bus route
 * is not drawn through a station it boards in (DESIGN.md, "Bus routes",
 * "Terminals"). Returns the pieces outside, in order.
 */
export function clipOutRings(points, rings) {
  const pieces = [];
  let run = [];
  const outside = (p) => !rings.some((ring) => insideRing(p, ring));
  if (outside(points[0])) run.push(points[0]);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const cuts = new Set([0, 1]);
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k++) {
        const t = crossing(a, b, ring[k], ring[(k + 1) % ring.length]);
        if (t !== null) cuts.add(t);
      }
    }
    const ts = [...cuts].sort((x, y) => x - y);
    for (let k = 1; k < ts.length; k++) {
      const [t0, t1] = [ts[k - 1], ts[k]];
      if (t1 - t0 < 1e-9) continue;
      const mid = [a[0] + (b[0] - a[0]) * ((t0 + t1) / 2), a[1] + (b[1] - a[1]) * ((t0 + t1) / 2)];
      const q0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const q1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      if (outside(mid)) {
        if (!run.length) run.push(q0);
        run.push(q1);
      } else if (run.length) {
        pieces.push(run);
        run = [];
      }
    }
  }
  if (run.length >= 2) pieces.push(run);
  return pieces.filter((p) => p.length >= 2);
}

// A local projection to meters around `origin` ([lon, lat]), and back, with
// `precision` decimals of a degree.
export function projection(origin, precision = 5) {
  const kx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const ky = 110540;
  const factor = 10 ** precision;
  return {
    project: ([lon, lat]) => [(lon - origin[0]) * kx, (lat - origin[1]) * ky],
    unproject: ([x, y]) => [Math.round((x / kx + origin[0]) * factor) / factor, Math.round((y / ky + origin[1]) * factor) / factor],
  };
}
