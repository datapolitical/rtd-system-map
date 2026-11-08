// Views for the detectors: seeded random views drawn from the network's own
// geometry, and tiles that cover an area at a zoom on a phone's screen. All
// are test inputs read from the built data (routes.geojson, stations.geojson,
// meta.json), never written down.

// Web Mercator at 512 px tiles (MapLibre's world size at zoom z is 512 * 2^z).
const WORLD = 512;
export const toPx = ([lon, lat], z) => {
  const s = WORLD * 2 ** z, r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
};
export const toLonLat = ([x, y], z) => {
  const s = WORLD * 2 ** z;
  return [(x / s) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI];
};

export function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
export const railPoints = (routes) => routes.features.filter((f) => f.properties.mode === 'rail').flatMap((f) => partsOf(f.geometry).flat());

// letters.spec.mjs's views: `count` points on rail, each at a zoom in
// `zooms` plus up to 0.9, from one seed so they are the same every run.
export function seededViews(routes, { seed = 20261107, count = 20, zooms = [10, 11, 12], take = 40 } = {}) {
  const pts = railPoints(routes);
  const rand = rng(seed);
  const views = [];
  for (let i = 0; i < take; i++) {
    const zoom = zooms[i % zooms.length];
    const p = pts[Math.floor(rand() * pts.length)];
    views.push({ zoom: zoom + rand() * 0.9, lon: p[0], lat: p[1] });
  }
  return views.slice(0, count);
}

// Tiles of the uncovered part of a phone's screen (`area`, CSS px, from
// uncovered()) laid over `bounds` at `zoom`, keeping those that hold at
// least one of `points` (any [lon, lat]) inside the uncovered part. Each
// tile is a view: the map centre that puts that tile in the uncovered part.
export function tiles({ bounds, zoom, screen = { w: 390, h: 664 }, area = { x0: 0, y0: 0, x1: 390, y1: 664 }, points = [], overlap = 0.06 }) {
  const [[w, s], [e, n]] = bounds;
  const [x0, y0] = toPx([w, n], zoom), [x1, y1] = toPx([e, s], zoom);
  const aw = area.x1 - area.x0, ah = area.y1 - area.y0;
  const sx = aw * (1 - overlap), sy = ah * (1 - overlap);
  const cols = Math.max(1, Math.ceil((x1 - x0) / sx)), rows = Math.max(1, Math.ceil((y1 - y0) / sy));
  const px = points.map((p) => toPx(p, zoom));
  // Bucket the points by tile so each is looked up once.
  const hit = new Set();
  for (const [x, y] of px) {
    const c = Math.floor((x - x0) / sx), r = Math.floor((y - y0) / sy);
    if (c >= 0 && r >= 0 && c < cols && r < rows) hit.add(r * cols + c);
  }
  const out = [];
  for (const k of [...hit].sort((a, b) => a - b)) {
    const r = Math.floor(k / cols), c = k % cols;
    // The tile's top-left in world px is the uncovered area's top-left.
    const tl = [x0 + c * sx, y0 + r * sy];
    const centre = [tl[0] - area.x0 + screen.w / 2, tl[1] - area.y0 + screen.h / 2];
    const [lon, lat] = toLonLat(centre, zoom);
    out.push({ zoom, lon, lat, row: r, col: c });
  }
  return { tiles: out, cols, rows };
}

// Points spaced every `step` metres along every line of `features`, so a
// tile is kept wherever a line runs through it, not only at its vertices.
export function alongPoints(features, step = 150) {
  const out = [];
  const m = (a, b) => {
    const k = Math.cos((a[1] * Math.PI) / 180) * 111320;
    return Math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * 110540);
  };
  for (const f of features) for (const c of partsOf(f.geometry)) {
    for (let i = 1; i < c.length; i++) {
      const d = m(c[i - 1], c[i]), n = Math.max(1, Math.ceil(d / step));
      for (let s = 0; s < n; s++) out.push([c[i - 1][0] + ((c[i][0] - c[i - 1][0]) * s) / n, c[i - 1][1] + ((c[i][1] - c[i - 1][1]) * s) / n]);
    }
    if (c.length) out.push(c.at(-1));
  }
  return out;
}
