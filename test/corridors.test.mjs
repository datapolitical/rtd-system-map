import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCorridors, mergeCorridors } from '../scripts/lib/corridors.mjs';

const MINUTE = 60;
const at = (hours, minutes = 0, seconds = 0) => hours * 3600 + minutes * 60 + seconds;

/**
 * `specs`: [{ id, name, stops, first, every, count }]. A route leaves its first
 * stop `first` seconds after midnight, then every `every` seconds, `count`
 * times. Each stop is two minutes further along, so every route's trips keep
 * the same gaps at every stop. Returns the build's inputs.
 */
function network(specs) {
  const tripsByRoute = {};
  const stopTimesByRoute = {};
  for (const spec of specs) {
    tripsByRoute[spec.id] = [];
    stopTimesByRoute[spec.id] = [];
    for (let k = 0; k < spec.count; k++) {
      const trip = `${spec.id}-${k}`;
      tripsByRoute[spec.id].push(trip);
      spec.stops.forEach((stop, i) => {
        stopTimesByRoute[spec.id].push({
          trip,
          stop,
          seq: i + 1,
          time: spec.first + k * spec.every + i * 2 * MINUTE,
        });
      });
    }
  }
  return {
    routes: specs.map((spec) => ({ route: spec.id, shortName: spec.name ?? spec.id })),
    tripsByRoute,
    stopTimesByRoute,
    stops: [...new Set(specs.flatMap((spec) => spec.stops))],
  };
}

const shared = ['s1', 's2', 's3'];
const member = (route, headwayMinutes, shortName = route) => ({ route, shortName, headwayMinutes });

test('two evenly spaced 30-minute routes on shared stops make one every-15 corridor', () => {
  const [corridor] = buildCorridors(
    network([
      { id: 'A', stops: shared, first: at(9), every: 30 * MINUTE, count: 13 },
      { id: 'B', stops: shared, first: at(9, 15), every: 30 * MINUTE, count: 13 },
    ]),
  );
  assert.deepEqual(corridor.members, [member('A', 30), member('B', 30)]);
  assert.deepEqual(corridor.stopIds, shared);
  assert.equal(corridor.headwayMinutes, 15);
  assert.equal(corridor.tier, 'frequent');
  assert.match(corridor.id, /^corridor:A\+B:s1-s3:[0-9a-f]{8}$/);
});

test('two 30-minute routes whose departures bunch a minute apart do not combine', () => {
  const corridors = buildCorridors(
    network([
      { id: 'A', stops: shared, first: at(9), every: 30 * MINUTE, count: 13 },
      { id: 'B', stops: shared, first: at(9) + MINUTE, every: 30 * MINUTE, count: 13 },
    ]),
  );
  assert.deepEqual(corridors, []);
});

test('routes with no shared stops make no corridor', () => {
  const corridors = buildCorridors(
    network([
      { id: 'A', stops: ['a1', 'a2', 'a3'], first: at(9), every: 30 * MINUTE, count: 13 },
      { id: 'B', stops: ['b1', 'b2', 'b3'], first: at(9, 15), every: 30 * MINUTE, count: 13 },
    ]),
  );
  assert.deepEqual(corridors, []);
});

test('three evenly spaced 20-minute routes combine to about every 6 to 7 minutes', () => {
  const [corridor] = buildCorridors(
    network([
      { id: 'A', stops: shared, first: at(9), every: 20 * MINUTE, count: 19 },
      { id: 'B', stops: shared, first: at(9) + 400, every: 20 * MINUTE, count: 19 },
      { id: 'C', stops: shared, first: at(9) + 800, every: 20 * MINUTE, count: 19 },
    ]),
  );
  assert.deepEqual(corridor.members, [member('A', 20), member('B', 20), member('C', 20)]);
  assert.deepEqual(corridor.stopIds, shared);
  assert.ok(corridor.headwayMinutes >= 6 && corridor.headwayMinutes <= 7, `headway ${corridor.headwayMinutes}`);
  assert.equal(corridor.tier, 'frequent');
});

test('a single route is never a corridor', () => {
  const corridors = buildCorridors(
    network([{ id: 'A', stops: shared, first: at(6), every: 5 * MINUTE, count: 120 }]),
  );
  assert.deepEqual(corridors, []);
});

test('routes that meet at one stop are a crossing, not a corridor', () => {
  const corridors = buildCorridors(
    network([
      { id: 'A', stops: ['a1', 'a2', 'hub'], first: at(9), every: 30 * MINUTE, count: 13 },
      { id: 'B', stops: ['hub', 'b1', 'b2'], first: at(9, 15), every: 30 * MINUTE, count: 13 },
    ]),
  );
  assert.deepEqual(corridors, []);
});

test('two shared stretches with the same members are two corridors', () => {
  const corridors = buildCorridors(
    network([
      { id: 'A', stops: ['s1', 's2', 'a3', 'a4', 's8', 's9'], first: at(9), every: 30 * MINUTE, count: 13 },
      { id: 'B', stops: ['s1', 's2', 'b3', 'b4', 's8', 's9'], first: at(9, 15), every: 30 * MINUTE, count: 13 },
    ]),
  );
  assert.deepEqual(
    corridors.map((corridor) => corridor.stopIds),
    [
      ['s1', 's2'],
      ['s8', 's9'],
    ],
  );
  assert.ok(corridors.every((corridor) => corridor.headwayMinutes === 15));
});

test('a route crossing the middle of the street does not break the corridor or join it', () => {
  const corridors = buildCorridors(
    network([
      { id: 'A', stops: shared, first: at(9), every: 30 * MINUTE, count: 13 },
      { id: 'B', stops: shared, first: at(9, 15), every: 30 * MINUTE, count: 13 },
      // C stops only at s2, and is not frequent enough to add to the corridor.
      { id: 'C', stops: ['s2'], first: at(9, 7), every: 90 * MINUTE, count: 8 },
    ]),
  );
  assert.deepEqual(corridors, [
    {
      id: corridors[0].id,
      members: [member('A', 30), member('B', 30)],
      stopIds: shared,
      headwayMinutes: 15,
      tier: 'frequent',
    },
  ]);
});

test('member numbers read naturally: numbers by value, then names alphabetically', () => {
  // Six routes, five minutes apart in each 30, so the corridor runs every 5.
  const ids = ['AT', '15', 'AB', '9', 'AL', '225'];
  const [corridor] = buildCorridors(
    network(
      ids.map((id, i) => ({ id, stops: shared, first: at(9) + i * 5 * MINUTE, every: 30 * MINUTE, count: 13 })),
    ),
  );
  assert.deepEqual(
    corridor.members.map((entry) => entry.shortName),
    ['9', '15', '225', 'AB', 'AL', 'AT'],
  );
  assert.equal(corridor.headwayMinutes, 5);
});

test('each member reports its own headway, not the corridor headway', () => {
  // A and B every 30, C every 15 halfway between them: together every 7.5.
  const [corridor] = buildCorridors(
    network([
      { id: 'A', stops: shared, first: at(9), every: 30 * MINUTE, count: 13 },
      { id: 'B', stops: shared, first: at(9, 15), every: 30 * MINUTE, count: 13 },
      { id: 'C', stops: shared, first: at(9) + 450, every: 15 * MINUTE, count: 25 },
    ]),
  );
  assert.deepEqual(corridor.members, [member('A', 30), member('B', 30), member('C', 15)]);
  assert.equal(corridor.headwayMinutes, 8);
  assert.equal(corridor.tier, 'frequent');
});

test('the combined headway takes its bus tier', () => {
  const corridor = (every, offset) =>
    buildCorridors(
      network([
        { id: 'A', stops: shared, first: at(8), every, count: 8 },
        { id: 'B', stops: shared, first: at(8) + offset, every, count: 8 },
      ]),
    )[0];
  assert.equal(corridor(60 * MINUTE, 30 * MINUTE).tier, 'every30');
  assert.equal(corridor(90 * MINUTE, 45 * MINUTE).tier, 'hourly');
  assert.equal(corridor(150 * MINUTE, 75 * MINUTE).tier, 'infrequent');
});

test('opposite directions are measured apart, not pooled', () => {
  // Each route runs both ways at these stops. Pooled, the four departures in
  // each half hour look evenly spread; by direction, they leave in pairs.
  const series = (route, direction, first, every, count) => {
    const trips = [];
    const rows = [];
    for (let k = 0; k < count; k++) {
      const trip = `${route}-${direction}-${k}`;
      trips.push({ trip, direction });
      shared.forEach((stop, i) => rows.push({ trip, stop, seq: i + 1, time: first + k * every + i * 2 * MINUTE }));
    }
    return { trips, rows };
  };
  const build = {
    A: [series('A', '0', at(9), 30 * MINUTE, 13), series('A', '1', at(9, 15), 30 * MINUTE, 13)],
    B: [series('B', '0', at(9) + 7 * MINUTE, 30 * MINUTE, 13), series('B', '1', at(9, 22), 30 * MINUTE, 13)],
  };
  const corridors = buildCorridors({
    routes: ['A', 'B'],
    tripsByRoute: Object.fromEntries(Object.entries(build).map(([id, all]) => [id, all.flatMap((s) => s.trips)])),
    stopTimesByRoute: Object.fromEntries(Object.entries(build).map(([id, all]) => [id, all.flatMap((s) => s.rows)])),
    stops: shared,
  });
  assert.deepEqual(corridors, []);
});

test('corridors stop where the caller stops listing stops', () => {
  const data = network([
    { id: 'A', stops: shared, first: at(9), every: 30 * MINUTE, count: 13 },
    { id: 'B', stops: shared, first: at(9, 15), every: 30 * MINUTE, count: 13 },
  ]);
  const [corridor] = buildCorridors({ ...data, stops: ['s1', 's2'] });
  assert.deepEqual(corridor.stopIds, ['s1', 's2']);
  assert.equal(corridor.headwayMinutes, 15);
});

test('a corridor keeps its id when the input order changes', () => {
  const data = network([
    { id: 'A', stops: shared, first: at(9), every: 30 * MINUTE, count: 13 },
    { id: 'B', stops: shared, first: at(9, 15), every: 30 * MINUTE, count: 13 },
  ]);
  const reversed = { ...data, routes: [...data.routes].reverse() };
  assert.equal(buildCorridors(data)[0].id, buildCorridors(reversed)[0].id);
});

test('the same data always gives the same corridors, and is not changed', () => {
  const data = network([
    { id: 'A', stops: shared, first: at(9), every: 30 * MINUTE, count: 13 },
    { id: 'B', stops: shared, first: at(9, 15), every: 30 * MINUTE, count: 13 },
  ]);
  const before = structuredClone(data);
  assert.deepEqual(buildCorridors(data), buildCorridors(data));
  assert.deepEqual(data, before);
});

// --- mergeCorridors: one street, one stretch -------------------------------

const feature = (members, coordinates) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: { id: members.join('|'), members, headwayMinutes: 15, tier: 'frequent', label: members.join(' ') },
});

test('runs that meet end to end with the same members become one stretch', () => {
  const merged = mergeCorridors([
    feature(['10', '15'], [[-105.0, 39.7], [-104.99, 39.7], [-104.98, 39.7]]),
    feature(['10', '15'], [[-104.98, 39.7], [-104.97, 39.7]]),
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].geometry.coordinates, [[-105.0, 39.7], [-104.99, 39.7], [-104.98, 39.7], [-104.97, 39.7]]);
});

test('a run drawn in the opposite direction still joins', () => {
  // 0.001 degrees is about 86 m at this latitude, inside the join tolerance.
  const merged = mergeCorridors([
    feature(['10', '15'], [[-105.0, 39.7], [-104.999, 39.7]]),
    feature(['10', '15'], [[-104.997, 39.7], [-104.998, 39.7]]),
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].geometry.coordinates, [[-105.0, 39.7], [-104.999, 39.7], [-104.997, 39.7]]);
});

test('different member sets stay separate even when they touch', () => {
  const merged = mergeCorridors([
    feature(['10', '15'], [[-105.0, 39.7], [-104.99, 39.7]]),
    feature(['10', '15', '20'], [[-104.99, 39.7], [-104.98, 39.7]]),
  ]);
  assert.equal(merged.length, 2);
});

test('runs of the same members far apart are not joined across the city', () => {
  const merged = mergeCorridors([
    feature(['10', '15'], [[-105.0, 39.7], [-104.99, 39.7]]),
    feature(['10', '15'], [[-104.8, 39.9], [-104.79, 39.9]]),
  ]);
  assert.equal(merged.length, 2);
});
