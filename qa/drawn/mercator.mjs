// Web Mercator, the way MapLibre projects it (qa/drawn/README.md).
//
// A map at zoom z is a square 512 * 2^z px on a side: one 512 px tile at
// zoom 0, doubled. Screen pixels at zoom z and these world pixels are the
// same thing, which is what lets the drawn model measure in screen px
// without a screen: a line's width is 3 px at zoom 9 on any phone, and a
// gap between two pieces is that many world px at zoom 9.
//
// Tiles are 512 px too (OpenFreeMap's OpenMapTiles), so a tile at zoom tz
// covers 512 * 2^(z - tz) world px at zoom z, and its geometry (extent 4096)
// maps onto 512 px at the tile's own zoom.

export const TILE = 512;

export const worldSize = (z) => TILE * 2 ** z;

export function toWorld([lon, lat], z) {
  const s = worldSize(z);
  const r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}

export function toLonLat([x, y], z) {
  const s = worldSize(z);
  return [(x / s) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI];
}

// The tile at `tz` holding a lon/lat, and its top-left corner in world px at
// zoom z.
export function tileAt([lon, lat], tz) {
  const [x, y] = toWorld([lon, lat], tz);
  return [Math.floor(x / TILE), Math.floor(y / TILE)];
}

export function tileOrigin([tx, ty], tz, z) {
  const k = 2 ** (z - tz);
  return [tx * TILE * k, ty * TILE * k];
}

// A tile's world px size at zoom z.
export const tileSpan = (tz, z) => TILE * 2 ** (z - tz);

// Bounding box [minX, minY, maxX, maxY] of a list of points.
export function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

// Liang-Barsky: the part of segment a-b inside rect [x0, y0, x1, y1], or
// null. The four flags say whether each end was moved onto an edge.
export function clipSegment(a, b, [x0, y0, x1, y1]) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1) return null;
  return {
    a: [a[0] + dx * t0, a[1] + dy * t0],
    b: [a[0] + dx * t1, a[1] + dy * t1],
    aCut: t0 > 0,
    bCut: t1 < 1,
  };
}

// The parts of a polyline inside a rect, as polylines. A run that leaves and
// comes back is two runs, which is what a screen shows.
export function clipLine(points, rect) {
  const runs = [];
  let run = null;
  for (let i = 1; i < points.length; i++) {
    const c = clipSegment(points[i - 1], points[i], rect);
    if (!c) { run = null; continue; }
    if (!run || c.aCut) { run = [c.a]; runs.push(run); }
    run.push(c.b);
    if (c.bCut) run = null;
  }
  return runs.filter((r) => r.length > 1);
}

// Distance from p to segment a-b, and the nearest point on it.
export function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  const q = [a[0] + dx * t, a[1] + dy * t];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), at: q, t };
}
