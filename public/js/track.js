// Is a train on its line? Live draws a train that reports a position away
// from its line's track fainter (DESIGN.md, "2. Live"): one in a yard, or
// with a bad fix, otherwise reads as a train running through a park. The
// track is the routes file the map draws, read in the page; nothing here
// knows any line.

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320; // at the equator; times cos(latitude)

/**
 * Each rail route's track as a flat list of segments, [lon1, lat1, lon2, lat2,
 * ...], from the routes GeoJSON (mode 'rail'). Full and part-time pieces of a
 * route are all its track.
 */
export function trackIndex(geojson) {
  const parts = new Map();
  for (const f of geojson?.features ?? []) {
    const p = f.properties ?? {};
    if (p.mode !== 'rail' || !p.route || !f.geometry) continue;
    const { type, coordinates } = f.geometry;
    const lines = type === 'LineString' ? [coordinates] : type === 'MultiLineString' ? coordinates : [];
    const out = parts.get(p.route) ?? [];
    for (const line of lines) for (let i = 0; i + 1 < line.length; i++) out.push(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
    parts.set(p.route, out);
  }
  return new Map([...parts].map(([route, segs]) => [route, Float64Array.from(segs)]));
}

/** The distance in metres from a point to the nearest of `segs`, or Infinity. */
export function metresTo(segs, lon, lat) {
  const kx = M_PER_DEG_LON * Math.cos((lat * Math.PI) / 180);
  const ky = M_PER_DEG_LAT;
  let best = Infinity;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    // In metres, with the point at the origin.
    const ax = (segs[i] - lon) * kx, ay = (segs[i + 1] - lat) * ky;
    const bx = (segs[i + 2] - lon) * kx, by = (segs[i + 3] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

/**
 * True when a train on `route` at lon, lat is further than `limit` metres
 * from that route's track. A route with no track in the index is never off
 * it: there is nothing to judge by.
 */
export function offTrack(index, route, lon, lat, limit) {
  const segs = index?.get(route);
  if (!segs?.length) return false;
  return metresTo(segs, lon, lat) > limit;
}
