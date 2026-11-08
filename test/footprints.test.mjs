import assert from 'node:assert/strict';
import { test } from 'node:test';
import { area, footprintOf, inRing, parseOsm } from '../scripts/lib/footprints.mjs';

// A rectangle in lon/lat about a corner, `w` and `h` in metres (near the
// equator, where a degree is 111.32 km).
const DEG = 1 / 111320;
const rect = ([lon, lat], w, h) => [
  [lon, lat],
  [lon + w * DEG, lat],
  [lon + w * DEG, lat + h * DEG],
  [lon, lat + h * DEG],
];
const way = (id, ring, tags = {}) => ({ id, tags: { building: 'yes', ...tags }, ring });

test('a ring holds the points inside it and takes its area from its corners', () => {
  const ring = rect([0, 0], 50, 40);
  assert.equal(inRing([0.0001, 0.0001], ring), true);
  assert.equal(inRing([0.001, 0.0001], ring), false);
  assert.ok(Math.abs(area(ring) - 2000) < 20, `area ${area(ring)} m² of 2,000`);
});

test('the terminal is the building its gates stand in', () => {
  const point = [0, 0];
  const station = way('1', rect([-0.0004, -0.0004], 90, 70), { amenity: 'bus_station' });
  const beside = way('2', rect([0.0002, 0.0002], 120, 120));
  const gates = [
    [0.0003, 0.0003],
    [0.0004, 0.0003],
  ];
  // The station wins on its tag even though the building beside it holds
  // both gates: a station building is the station.
  assert.equal(footprintOf([beside, station], point, gates).id, '1');
  // Without the tag, the building holding the most gates wins.
  const plain = { ...station, tags: { building: 'yes' } };
  assert.equal(footprintOf([plain, beside], point, gates).id, '2');
});

test('a building the gates are only beside is not the terminal', () => {
  const shop = way('3', rect([0.0015, 0.0015], 60, 60));
  assert.equal(footprintOf([shop], [0, 0], [[0, 0]]), null, 'a shop 200 m away');
  // A kiosk under 80 m² is a shelter, not a terminal.
  const kiosk = way('4', rect([-0.00005, -0.00005], 8, 6));
  assert.equal(footprintOf([kiosk], [0, 0], [[0, 0]]), null, 'a kiosk holding the point');
});

test('two buildings holding the same gates: the tighter fit wins', () => {
  const big = way('5', rect([-0.001, -0.001], 300, 300));
  const small = way('6', rect([-0.0002, -0.0002], 40, 30));
  const gates = [
    [0, 0],
    [0.00005, 0.00005],
  ];
  assert.equal(footprintOf([big, small], [0, 0], gates).id, '6');
});

test('a parking structure is never the terminal', () => {
  const garage = way('7', rect([-0.0004, -0.0004], 90, 70), { building: 'parking', amenity: 'parking', name: 'Nine Mile Station' });
  const gates = [
    [0.0003, 0.0003],
    [0.0004, 0.0003],
  ];
  assert.equal(footprintOf([garage], [0, 0], gates), null, 'a garage holding the gates');
  // The bus platforms at the gates are a terminal, even beside the garage.
  const bay = way('8', rect([0.0001, 0.0001], 40, 40), { public_transport: 'platform', bus: 'yes' });
  assert.equal(footprintOf([garage, bay], [0, 0], gates).id, '8');
});

test('parseOsm keeps closed building ways and drops open ones', () => {
  const xml = `<osm>
  <node id="1" lat="39.7410" lon="-104.9868"/>
  <node id="2" lat="39.7410" lon="-104.9860"/>
  <node id="3" lat="39.7416" lon="-104.9860"/>
  <node id="4" lat="39.7416" lon="-104.9868"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
    <tag k="building" v="yes"/><tag k="name" v="Station"/></way>
  <way id="11"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="building" v="yes"/></way>
  <way id="12"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
    <tag k="highway" v="footway"/></way>
</osm>`;
  const ways = parseOsm(xml);
  assert.equal(ways.length, 1);
  assert.equal(ways[0].id, '10');
  assert.equal(ways[0].tags.name, 'Station');
  assert.deepEqual(ways[0].ring[0], [-104.9868, 39.741]);
});
