import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busStretches } from '../scripts/lib/stretches.mjs';

// Tiny made-up feeds near (0, 0), where a kilometer east is 1/111.32 of a
// degree of longitude. Every route runs both ways, 06:00 to 20:00 weekdays,
// a minute between stops.
const KM = 1 / 111.32;
const at = (x, y = 0) => [x * KM, y * KM];
const dates = { weekday: { services: ['WK'] }, saturday: { services: ['SA'] }, sunday: { services: ['SU'] } };
const csv = (rows) => rows.map((r) => r.join(',')).join('\n');
const time = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:00`;

// A path (km points) as points 100 m apart.
function along(path) {
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// `patterns`: { path: [[x, y] km], every: minutes, offset: minutes, stops:
// km along the path where it stops (default every 400 m) }. The map draws
// `drawn` (km paths) as route R.
function feed(patterns, drawn) {
  const shapes = [['shape_id', 'shape_pt_sequence', 'shape_pt_lon', 'shape_pt_lat']];
  const stops = [['stop_id', 'stop_lon', 'stop_lat']];
  const trips = [['route_id', 'service_id', 'trip_id', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  const stopAt = new Map();
  const stopId = ([x, y]) => {
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (!stopAt.has(key)) {
      stopAt.set(key, `s${stopAt.size}`);
      stops.push([stopAt.get(key), ...at(x, y)]);
    }
    return stopAt.get(key);
  };
  patterns.forEach((p, n) => {
    for (const dir of [0, 1]) {
      const pts = along(dir ? [...p.path].reverse() : p.path);
      const shape = `S${n}d${dir}`;
      pts.forEach((pt, i) => shapes.push([shape, i, ...at(...pt)]));
      const total = (pts.length - 1) * 0.1;
      const marks = (p.stops ?? Array.from({ length: Math.floor(total / 0.4 + 1e-9) + 1 }, (_, k) => k * 0.4)).map((d) => (dir ? total - d : d)).sort((a, b) => a - b);
      const ids = marks.map((d) => stopId(pts[Math.round(d / 0.1)]));
      for (let t = 6 * 3600 + (p.offset ?? 0) * 60, k = 0; t < 20 * 3600; t += p.every * 60, k++) {
        const trip = `T${n}d${dir}k${k}`;
        trips.push(['R', 'WK', trip, dir, shape]);
        ids.forEach((id, i) => times.push([trip, time(t + i * 60), time(t + i * 60), id, i + 1]));
      }
    }
  });
  const text = { 'shapes.txt': csv(shapes), 'stops.txt': csv(stops), 'trips.txt': csv(trips), 'stop_times.txt': csv(times) };
  const feature = {
    type: 'Feature',
    geometry: { type: 'MultiLineString', coordinates: drawn.map((path) => along(path).map((pt) => at(...pt))) },
    properties: { route: 'R', mode: 'bus', tier: 'frequent', wk: 15, sa: null, su: null, wk_trips: 0, sa_trips: 0, su_trips: 0, wk_first: null, wk_last: null },
  };
  return busStretches([feature], text, dates).features;
}

const km = (f) => {
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let sum = 0;
  for (const p of parts) for (let i = 1; i < p.length; i++) sum += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) / KM;
  return sum;
};

test('a short turn makes the busy end its own stretch', () => {
  const line = [[0, 0], [10, 0]];
  const out = feed(
    [
      { path: line, every: 30 },
      { path: [[0, 0], [6, 0]], every: 30, offset: 15 },
    ],
    [line],
  );
  assert.equal(out.length, 2);
  const [busy, quiet] = [out.find((f) => f.properties.tier === 'frequent'), out.find((f) => f.properties.tier === 'every30')];
  assert.ok(busy && quiet);
  assert.equal(busy.properties.wk, 15);
  assert.equal(quiet.properties.wk, 30);
  assert.ok(Math.abs(km(busy) - 6) < 0.3, `busy end is ${km(busy)} km`);
  assert.ok(Math.abs(km(quiet) - 4) < 0.3, `quiet end is ${km(quiet)} km`);
  // Each stretch keeps the route's own values.
  for (const f of out) assert.equal(f.properties.route_tier, 'frequent');
  assert.deepEqual(out.map((f) => f.properties.stretch).sort(), [0, 1]);
});

test('one stop only some trips make does not split a route', () => {
  const line = [[0, 0], [10, 0]];
  const all = Array.from({ length: 26 }, (_, k) => k * 0.4);
  const out = feed(
    [
      { path: line, every: 30 },
      // The other half of the trips skip the stop at 5.2 km.
      { path: line, every: 30, offset: 15, stops: all.filter((d) => Math.abs(d - 5.2) > 0.01) },
    ],
    [line],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].properties.tier, 'frequent');
});

test('an express run with no stops for miles is one stretch', () => {
  const line = [[0, 0], [12, 0]];
  const out = feed([{ path: line, every: 15, stops: [0, 0.4, 0.8, 1.2, 10.8, 11.2, 11.6, 12] }], [line]);
  assert.equal(out.length, 1);
  assert.equal(out[0].properties.tier, 'frequent');
  assert.equal(out[0].properties.wk, 15);
});

test('branches each get their own frequency, the trunk the sum', () => {
  const trunk = [[0, 0], [5, 0]];
  const east = [[5, 0], [10, 0]];
  const north = [[5, 0], [5, 5]];
  const out = feed(
    [
      { path: [...trunk, ...east.slice(1)], every: 30 },
      { path: [...trunk, ...north.slice(1)], every: 30, offset: 15 },
    ],
    [trunk, east, north],
  );
  const frequent = out.filter((f) => f.properties.tier === 'frequent');
  const every30 = out.filter((f) => f.properties.tier === 'every30');
  assert.equal(frequent.length, 1);
  assert.ok(Math.abs(km(frequent[0]) - 5) < 0.3, `trunk is ${km(frequent[0])} km`);
  // Both branches are every 30, drawn as one stretch that meets at the fork.
  assert.equal(every30.length, 1);
  assert.ok(Math.abs(km(every30[0]) - 10) < 0.4, `branches are ${km(every30[0])} km`);
  // Every bit of the line is drawn once.
  assert.ok(Math.abs(out.reduce((s, f) => s + km(f), 0) - 15) < 0.3);
});

test('a shape that runs back out of service past its last stop does not hide the trips in service', () => {
  // Most trips' shape carries on past the last stop at 8 km and back along
  // the same street to 4 km, empty, a few meters nearer the drawn line than
  // the pass in service. A few trips a day have no such tail.
  const line = [[0, 0], [8, 0]];
  const inService = [[0, 0.005], [8, 0.005]];
  const stops = Array.from({ length: 21 }, (_, k) => k * 0.4);
  const out = feed(
    [
      { path: [...inService, [8, 0], [4, 0]], every: 15, stops },
      { path: inService, every: 240, offset: 7 },
    ],
    [line],
  );
  assert.equal(out.length, 1, out.map((f) => `${f.properties.tier} ${km(f).toFixed(1)} km`).join(', '));
  assert.equal(out[0].properties.tier, 'frequent');
  assert.equal(out[0].properties.wk, 15);
});
