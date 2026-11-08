// The shapes a rail station really has, and the shapes a bus terminal is:
// scripts/lib/structures.mjs, and the terminal side of
// scripts/lib/footprints.mjs. Every case is a small OSM document, so what is
// tested is the rules — platform, canopy, station building, bus hall, bus
// platform, never a parking structure — not any station's ids.
import assert from 'node:assert/strict';
import test from 'node:test';
import { extendLineToPlatforms, parseOsmAreas, platformEndFor, ringDistance, shapesFor } from '../scripts/lib/structures.mjs';
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

test('extending a line stops at the platform, not at the station point', () => {
  const areas = parseOsmAreas(STATION);
  const stop = [-105.0, 39.7503];
  const shapes = shapesFor([stop], areas, AT);
  const byStation = new Map([[0, shapes]]);
  const path = [
    [-105.001, 39.7503],
    [-105.0, 39.7503],
  ];
  const [out] = extendLineToPlatforms([path], [0], [[stop]], byStation);
  assert.equal(out.length, path.length + 1);
  assert.ok(out.at(-1)[1] > 39.7510, `ran north along the platform, got ${out.at(-1)[1]}`);
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
