// Where most of the service is (DESIGN.md, "Opening state"): the box holding
// the middle `share` of the network's weekday service, east to west and north
// to south. Service is trips times distance, so a street with a bus every few
// minutes counts for far more than a long commuter run with six trips a day,
// and the box lands on the part of the district most trips are in, wherever
// RTD's schedule puts it.

/**
 * `routes` are the route features as drawn, each with `wk_trips`. Returns
 * [[west, south], [east, north]], or null when nothing runs on a weekday.
 */
export function coreBounds(routes, share = 0.6) {
  const bits = []; // [lon, lat, trips x length]
  for (const f of routes) {
    const trips = f.properties.wk_trips ?? 0;
    if (!trips) continue;
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const line of parts) {
      for (let k = 1; k < line.length; k++) {
        const [a, b] = [line[k - 1], line[k]];
        const lat = (a[1] + b[1]) / 2;
        // Length in degrees of latitude: only shares of the total matter.
        const length = Math.hypot((b[0] - a[0]) * Math.cos((lat * Math.PI) / 180), b[1] - a[1]);
        if (length) bits.push([(a[0] + b[0]) / 2, lat, trips * length]);
      }
    }
  }
  const total = bits.reduce((sum, bit) => sum + bit[2], 0);
  if (!total) return null;
  const at = (axis, fraction) => {
    let run = 0;
    for (const bit of [...bits].sort((p, q) => p[axis] - q[axis])) {
      run += bit[2];
      if (run >= total * fraction) return bit[axis];
    }
    return bits.at(-1)[axis];
  };
  const [low, high] = [(1 - share) / 2, (1 + share) / 2];
  return [
    [at(0, low), at(1, low)],
    [at(0, high), at(1, high)],
  ];
}
