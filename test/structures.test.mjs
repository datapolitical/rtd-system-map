// The shapes a rail station really has, and the shapes a bus terminal is:
// scripts/lib/structures.mjs, and the terminal side of
// scripts/lib/footprints.mjs. Every case is a small OSM document, so what is
// tested is the rules — platform, canopy, station building, bus hall, bus
// platform, never a parking structure — not any station's ids.
import assert from 'node:assert/strict';
import test from 'node:test';
import { extendLineToPlatforms, parseOsmAreas, platformEndFor, platformsToMarks, ringDistance, shapesFor } from '../scripts/lib/structures.mjs';
import { parseOsm, terminalShapeOf } from '../scripts/lib/footprints.mjs';

// [lon, lat] at Denver, and a little helper to make an OSM XML document from
// closed ways given as corners with tags.
const AT = [-105.0, 39.75];
const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n]];
function osm(ways) {
  const nodes = new Map();
  const ref = (p) => {
    const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    if (!nodes.has(key)) nodes.set(key, nodes.size + 1);
    return nodes.get(key);
  };
  let id = 100;
  const body = ways
    .map(({ ring, tags, open = false }) => {
      const pts = open ? ring : [...ring, ring[0]];
      const refs = pts.map((p) => `<nd ref="${ref(p)}"/>`).join('');
      const t = Object.entries(tags).map(([k, v]) => `<tag k="${k}" v="${v}"/>`).join('');
      return `<way id="${id++}">${refs}${t}</way>`;
    })
    .join('');
  const ns = [...nodes].map(([key, n]) => {
    const [lon, lat] = key.split(',').map(Number);
    return `<node id="${n}" lat="${lat}" lon="${lon}"/>`;
  });
  return `<osm version="0.6">${ns.join('')}${body}</osm>`;
}

// A platform 30 m by 130 m, running north; a canopy over it; the station
// building beside its south end; and the blocks that are not the station.
const PLATFORM = box(-105.0002, 39.7500, -104.9998, 39.7512);
const CANOPY = box(-105.00025, 39.74995, -104.99975, 39.75125);
const BUILDING = box(-105.0002, 39.7493, -104.9996, 39.74998);
const STATION = osm([
  { ring: PLATFORM, tags: { railway: 'platform', name: 'Union Station Platform 1' } },
  { ring: CANOPY, tags: { building: 'roof', name: 'Train hall' } },
  { ring: BUILDING, tags: { building: 'train_station', name: 'Union Station' } },
  { ring: box(-105.0006, 39.7502, -105.0002, 39.7508), tags: { building: 'apartments', name: 'Ashley Union Station' } },
  { ring: box(-105.0006, 39.7490, -105.0002, 39.7494), tags: { building: 'office', name: 'One Union Station' } },
]);

test('an OSM box gives the closed ways and their tags, and drops open ones', () => {
  const areas = parseOsmAreas(STATION);
  assert.equal(areas.length, 5);
  assert.ok(areas.some((a) => a.tags.building === 'train_station'));
  const open = parseOsmAreas(osm([{ ring: PLATFORM.concat([[-105.0, 39.7506]]), tags: { railway: 'platform' }, open: true }]));
  assert.equal(open.length, 0);
});

test('a station is its platform, the canopy over it and its station building', () => {
  const areas = parseOsmAreas(STATION);
  const stop = [-105.0, 39.7506];
  const shapes = shapesFor([stop], areas, AT);
  assert.equal(shapes.platforms.length, 1);
  assert.equal(shapes.platforms[0].tags.name, 'Union Station Platform 1');
  assert.equal(shapes.canopies.length, 1);
  assert.equal(shapes.canopies[0].tags.name, 'Train hall');
  assert.equal(shapes.building.tags.name, 'Union Station');
  // The blocks called "Ashley Union Station" and "One Union Station" are not
  // the station: they carry no station tag and no platform stops.
  assert.ok(!shapes.canopies.concat(shapes.platforms).some((a) => /Ashley|One/.test(a.tags.name ?? '')));
});

test('a platform set to no public transport is not a platform', () => {
  const areas = parseOsmAreas(
    osm([
      { ring: PLATFORM, tags: { railway: 'platform', public_transport: 'no' } },
      { ring: CANOPY, tags: { building: 'roof' } },
    ]),
  );
  const shapes = shapesFor([[-105.0, 39.7506]], areas, AT);
  assert.equal(shapes.platforms.length, 0);
  assert.equal(shapes.canopies.length, 0);
});

test('a line runs to the platform end away from where it comes from', () => {
  const rings = [PLATFORM];
  // End at the north end, the line coming up from the south: it runs on to
  // the north end (the far end from the approach).
  const north = platformEndFor([-105.0, 39.7502], rings, { from: [-105.0, 39.7490] });
  assert.ok(north && north[1] > 39.7510, `north end, got ${north}`);
  // End at the north end, the line coming down from the north: it runs back
  // along the platform to its south end, where the trains stop.
  const south = platformEndFor([-105.0, 39.7512], rings, { from: [-105.0, 39.7530] });
  assert.ok(south && south[1] < 39.7505, `south end, got ${south}`);
});

test('a line runs along its platform to the platform end nearest it', () => {
  const rings = [PLATFORM];
  // A stop at the south end of the platform: the line should run north.
  const tip = platformEndFor([-105.0, 39.7502], rings);
  assert.ok(tip, 'a platform end');
  assert.ok(tip[1] > 39.7510, `north end, got ${tip[1]}`);
  assert.ok(ringDistance([-105.0, 39.7502], rings[0]) < 30);
  // Far from any platform, nothing to run along.
  assert.equal(platformEndFor([-105.01, 39.75], rings), null);
});

test('extending a line runs it on beside its platform, parallel to it, to the platform end', () => {
  const areas = parseOsmAreas(STATION);
  const stop = [-105.0, 39.7503];
  const shapes = shapesFor([stop], areas, AT);
  const byStation = new Map([[0, shapes]]);
  // A line coming up from the south to 3 m west of the platform's middle
  // line, 3 degrees off the platform's own direction.
  const metre = 1 / (111320 * Math.cos((39.75 * Math.PI) / 180));
  const west = -105.0 - 3 * metre;
  const path = [
    [west - 7.5 * metre, 39.749],
    [west, 39.7503],
  ];
  const [out] = extendLineToPlatforms([path], [0], [[stop]], byStation);
  assert.equal(out.length, path.length + 1);
  assert.ok(out.at(-1)[1] > 39.7510, `ran north along the platform, got ${out.at(-1)[1]}`);
  // Parallel to the platform from where it met it: not bent across to the
  // platform's middle line, and not carried on along its own slant.
  assert.ok(Math.abs(out.at(-1)[0] - west) < 1e-7, `ended ${((out.at(-1)[0] - west) / metre).toFixed(1)} m to the side`);
  // A line that only crosses the platform is not turned along it.
  const across = [
    [-105.001, 39.7503],
    [-105.0, 39.7503],
  ];
  assert.deepEqual(extendLineToPlatforms([across], [0], [[stop]], byStation)[0], across);
  // A line with no platform in OSM is left alone.
  const [same] = extendLineToPlatforms([path], [1], [[[-105.02, 39.75]]], new Map());
  assert.deepEqual(same, path);
});

test('a bus terminal is its hall, its platforms, or its building, never its parking', () => {
  const gates = [
    [-105.0001, 39.7503],
    [-105.0002, 39.7504],
  ];
  const hall = box(-105.0005, 39.75, -104.9995, 39.7508);
  const garage = box(-105.0006, 39.7495, -104.9994, 39.7502);
  const areas = parseOsm(
    osm([
      { ring: garage, tags: { building: 'parking', amenity: 'parking', name: 'Nine Mile Station' } },
      { ring: box(-105.0005, 39.7502, -104.9995, 39.7509), tags: { amenity: 'bus_station', location: 'underground', layer: '-1', name: 'Union Station Bus Concourse' } },
    ]),
  );
  const shape = terminalShapeOf(areas, [-105.0001, 39.7503], gates);
  assert.equal(shape.kind, 'bus_station');
  assert.equal(shape.underground, true);
  // Without the hall, the garage is still never the terminal.
  const onlyGarage = parseOsm(osm([{ ring: garage, tags: { building: 'parking', amenity: 'parking' } }]));
  assert.equal(terminalShapeOf(onlyGarage, [-105.0001, 39.7503], gates), null);
  // The bus platforms at the gates are a terminal, above ground.
  const bays = parseOsm(
    osm([
      { ring: box(-105.0006, 39.7502, -105.0001, 39.7505), tags: { public_transport: 'platform', bus: 'yes' } },
      { ring: garage, tags: { building: 'parking' } },
    ]),
  );
  const atBays = terminalShapeOf(bays, [-105.0001, 39.7503], gates);
  assert.equal(atBays.kind, 'platform');
  assert.equal(atBays.underground, false);
});

test('the OSM reader keeps a bus station even without a building tag', () => {
  const ways = parseOsm(
    osm([
      { ring: box(-105.0005, 39.75, -104.9995, 39.7508), tags: { amenity: 'bus_station' } },
      { ring: box(-105.0006, 39.7502, -105.0001, 39.7505), tags: { public_transport: 'platform', bus: 'yes' } },
      { ring: PLATFORM, tags: { railway: 'platform' } },
    ]),
  );
  assert.equal(ways.length, 2);
  assert.ok(ways.some((w) => w.tags.amenity === 'bus_station'));
});

test('a platform and its roof are drawn only as far as the mark their lines end at', () => {
  const shape = (kind, station, s, n) => ({
    type: 'Feature',
    properties: { kind, station },
    geometry: { type: 'Polygon', coordinates: [[[0, s], [0.0001, s], [0.0001, n], [0, n], [0, s]]] },
  });
  // The lines come from the north and end at a mark 66 m up a 111 m platform.
  const ends = [{ station: 7, at: [0.00005, 0.0006], inward: [0, 1] }];
  const features = [
    shape('platform', '7', 0, 0.001),
    shape('canopy', '7', 0.0002, 0.0009),
    shape('platform', '7', 0, 0.0004),
    shape('building', '7', 0, 0.001),
    shape('platform', '8', 0, 0.001),
  ];
  const out = platformsToMarks(features, ends);
  const south = (f) => Math.min(...f.geometry.coordinates[0].map((p) => p[1]));
  assert.deepEqual(out.map((f) => `${f.properties.kind} ${f.properties.station}`), ['platform 7', 'canopy 7', 'building 7', 'platform 8'], 'a platform wholly past the mark goes');
  // Cut 2 m past the mark, so the shape tucks under it.
  for (const f of out.slice(0, 2)) assert.ok(Math.abs((0.0006 - south(f)) * 110540 - 2) < 0.5, `${f.properties.kind} ends at the mark: ${south(f)}`);
  assert.equal(south(out[2]), 0, 'the station building is left whole');
  assert.equal(south(out[3]), 0, "another station's platform is left whole");
  assert.deepEqual(platformsToMarks(features, []), features, 'no marks, nothing cut');
});
