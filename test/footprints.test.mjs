import assert from 'node:assert/strict';
import { test } from 'node:test';
import { area, footprintOf, inRing, parseOsm, terminalFootprints } from '../scripts/lib/footprints.mjs';

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

// An OSM document from closed ways given as corners with tags.
function osmXml(ways) {
  const nodes = new Map();
  const ref = (p) => {
    const key = `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
    if (!nodes.has(key)) nodes.set(key, nodes.size + 1);
    return nodes.get(key);
  };
  let id = 100;
  const body = ways
    .map(({ ring, tags }) => {
      const refs = [...ring, ring[0]].map((p) => `<nd ref="${ref(p)}"/>`).join('');
      const t = Object.entries(tags).map(([k, v]) => `<tag k="${k}" v="${v}"/>`).join('');
      return `<way id="${id++}">${refs}${t}</way>`;
    })
    .join('');
  const ns = [...nodes].map(([key, n]) => {
    const [lon, lat] = key.split(',').map(Number);
    return `<node id="${n}" lat="${lat}" lon="${lon}"/>`;
  }).join('');
  return `<osm version="0.6">${ns}${body}</osm>`;
}

test('a terminal holds its gates, leaves a stop outside its hall a street stop, and marks a track as no gate', async () => {
  const hall = rect([-105.0, 39.74], 100, 60);
  const xml = osmXml([{ ring: hall, tags: { building: 'yes', amenity: 'bus_station' } }]);
  const mid = [-105.0 + 50 * DEG, 39.74 + 30 * DEG];
  const stop = (name, c) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: c } });
  const gateIn = stop('Test Station Gate 1', [-105.0 + 20 * DEG, 39.74 + 30 * DEG]);
  const track = stop('Test Station Track 7', [-105.0 + 40 * DEG, 39.74 + 30 * DEG]);
  const gateOut = stop('Test Station Gate 2', [-105.0 + 124 * DEG, 39.74 + 30 * DEG]);
  const facility = {
    type: 'Feature',
    properties: { id: '7', name: 'Test Station', class: 'BUS' },
    geometry: { type: 'Point', coordinates: mid },
  };
  const shapes = await terminalFootprints({
    facilities: [facility],
    indexes: [0],
    stops: [gateIn, track, gateOut],
    fetchText: async () => xml,
    log: () => {},
  });
  const t = shapes.terminals.get(0);
  assert.ok(t, 'a terminal');
  assert.equal(t.feature.properties.gates, 1);
  assert.ok(t.rings.some((r) => inRing(gateIn.geometry.coordinates, r) || r.some(([x, y]) => Math.hypot(x - gateIn.geometry.coordinates[0], y - gateIn.geometry.coordinates[1]) < 0.00002)), 'a gate in the hall is in it');
  assert.equal(gateIn.properties.gate, 1);
  // The hall is drawn as OpenStreetMap has it: a stop outside it is on the
  // street, not a gate, and the hall is not grown over the block to reach it.
  assert.ok(!t.rings.some((r) => inRing(gateOut.geometry.coordinates, r)), 'a stop outside the hall stays outside');
  assert.ok(!gateOut.properties.gate, 'a stop outside the hall is not a gate');
  assert.ok(!gateOut.properties.terminal, 'a stop outside the hall is not in the terminal');
  assert.equal(track.properties.terminal, 1);
  assert.ok(!track.properties.gate, 'a track stop is not a gate');
});

test("when OpenStreetMap doesn't answer, the hall is the last build's, its stops marked, and the build is told", async () => {
  const hall = rect([-105.0, 39.74], 100, 60);
  const xml = osmXml([{ ring: hall, tags: { building: 'yes', amenity: 'bus_station' } }]);
  const mid = [-105.0 + 50 * DEG, 39.74 + 30 * DEG];
  const stop = (name, c) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: c } });
  const stops = () => ({ gate: stop('Test Station Gate 1', [-105.0 + 20 * DEG, 39.74 + 30 * DEG]), street: stop('Test St & 1st', [-105.0 + 124 * DEG, 39.74 + 30 * DEG]) });
  const facility = { type: 'Feature', properties: { id: '7', name: 'Test Station', class: 'BUS' }, geometry: { type: 'Point', coordinates: mid } };
  // The build before: OpenStreetMap answers.
  const first = stops();
  const before = await terminalFootprints({ facilities: [facility], indexes: [0], stops: Object.values(first), fetchText: async () => xml, log: () => {} });
  assert.deepEqual([before.fellBack, before.lost], [[], []]);
  const previous = [before.terminals.get(0).feature];
  // Today: it doesn't. The hall is yesterday's, and its stops are marked.
  const down = async () => { throw new Error('timed out'); };
  const today = stops();
  const again = await terminalFootprints({ facilities: [facility], indexes: [0], stops: Object.values(today), previous, fetchText: down, log: () => {} });
  assert.deepEqual(again.terminals.get(0).feature, previous[0]);
  assert.deepEqual(again.fellBack, ['Test Station']);
  assert.deepEqual(again.lost, []);
  assert.equal(today.gate.properties.terminal, 1);
  assert.equal(today.gate.properties.gate, 1);
  assert.ok(!today.street.properties.terminal, 'a stop outside the hall is still a street stop');
  // With no build before either, the hall is lost, and said so.
  const none = await terminalFootprints({ facilities: [facility], indexes: [0], stops: Object.values(stops()), fetchText: down, log: () => {} });
  assert.equal(none.terminals.size, 0);
  assert.deepEqual(none.lost, ['Test Station']);
});
