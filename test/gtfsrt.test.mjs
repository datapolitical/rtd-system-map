import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeFeed } from '../live/src/gtfsrt.mjs';

// A small protobuf writer, enough to build feeds for the decoder to read.
const varint = (n) => {
  const out = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
};
const key = (field, type) => varint(field * 8 + type);
const str = (field, s) => {
  const b = [...new TextEncoder().encode(s)];
  return [...key(field, 2), ...varint(b.length), ...b];
};
const int = (field, n) => [...key(field, 0), ...varint(n)];
const float = (field, f) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, f, true);
  return [...key(field, 5), ...b];
};
const fixed64 = (field) => [...key(field, 1), 1, 2, 3, 4, 5, 6, 7, 8];
const msg = (field, parts) => {
  const b = parts.flat();
  return [...key(field, 2), ...varint(b.length), ...b];
};
const bytes = (parts) => new Uint8Array(parts.flat());

const header = msg(1, [str(1, '2.0'), int(2, 0), int(3, 1794063578)]);
const trip = (id, route, direction) => msg(1, [str(1, id), str(5, route), int(6, direction)]);

test('a vehicle position decodes with its trip, position, time and occupancy', () => {
  const feed = bytes([
    header,
    msg(2, [
      str(1, '1515'),
      msg(4, [
        trip('116056032', '103W', 1),
        msg(2, [float(1, 39.848), float(2, -104.673), float(3, 270), float(5, 12.5)]),
        int(3, 7),
        int(4, 1),
        int(5, 1794063557),
        str(7, '34652'),
        msg(8, [str(1, '1515'), str(2, 'Car 1515')]),
        int(9, 1),
      ]),
    ]),
  ]);
  const { header: h, entities } = decodeFeed(feed);
  assert.equal(h.version, '2.0');
  assert.equal(h.timestamp, 1794063578);
  assert.equal(entities.length, 1);
  const v = entities[0].vehicle;
  assert.equal(entities[0].id, '1515');
  assert.deepEqual(v.trip, { trip: '116056032', route: '103W', direction: 1 });
  assert.ok(Math.abs(v.position.lat - 39.848) < 1e-5 && Math.abs(v.position.lon + 104.673) < 1e-5);
  assert.equal(v.position.bearing, 270);
  assert.equal(v.timestamp, 1794063557);
  assert.equal(v.stop, '34652');
  assert.equal(v.stop_sequence, 7);
  assert.equal(v.status, 1);
  assert.equal(v.occupancy, 1);
  assert.deepEqual(v.vehicle, { id: '1515', label: 'Car 1515' });
});

test('an alert decodes with its periods, what it applies to and its English text', () => {
  const feed = bytes([
    header,
    msg(2, [
      str(1, '63945'),
      msg(5, [
        msg(1, [int(1, 1752274680), int(2, 1830247140)]),
        msg(5, [str(1, 'RTD'), str(2, '15'), int(3, 3), str(5, '12875')]),
        msg(5, [str(2, '15L'), msg(4, [str(1, 'trip-9')])]),
        int(6, 10),
        int(7, 1),
        msg(10, [msg(1, [str(1, 'Parada cerrada'), str(2, 'es')]), msg(1, [str(1, 'Stop closed'), str(2, 'en')])]),
        msg(11, [msg(1, [str(1, 'Use the next stop')])]),
      ]),
    ]),
  ]);
  const a = decodeFeed(feed).entities[0].alert;
  assert.deepEqual(a.periods, [{ start: 1752274680, end: 1830247140 }]);
  assert.deepEqual(a.entities, [
    { agency: 'RTD', route: '15', route_type: 3, stop: '12875' },
    { route: '15L', trip: 'trip-9' },
  ]);
  assert.equal(a.cause, 10);
  assert.equal(a.effect, 1);
  assert.equal(a.header, 'Stop closed');
  assert.equal(a.description, 'Use the next stop');
});

test('a trip update decodes its stop times', () => {
  const feed = bytes([
    header,
    msg(2, [
      str(1, '116031098'),
      msg(3, [
        trip('116031098', '15', 0),
        msg(2, [int(1, 22), msg(2, [int(2, 1794063560)]), msg(3, [int(1, 60), int(2, 1794063620)]), str(4, '17779')]),
        msg(2, [int(1, 23), str(4, '14967'), int(5, 1)]),
        int(4, 1794063579),
      ]),
    ]),
  ]);
  const u = decodeFeed(feed).entities[0].trip_update;
  assert.equal(u.trip.route, '15');
  assert.equal(u.timestamp, 1794063579);
  assert.deepEqual(u.stops, [
    { sequence: 22, arrival: { time: 1794063560 }, departure: { delay: 60, time: 1794063620 }, stop: '17779' },
    { sequence: 23, stop: '14967', relationship: 1 },
  ]);
});

test('fields the map does not use are skipped, whatever their wire type', () => {
  const feed = bytes([
    header,
    msg(2, [
      str(1, 'x'),
      fixed64(99),
      str(98, 'future text'),
      msg(4, [trip('t', 'A', 0), msg(2, [float(1, 39.7), float(2, -104.9), float(4, 1.5)]), int(5, 1794063000), int(77, 3)]),
    ]),
  ]);
  const v = decodeFeed(feed).entities[0].vehicle;
  assert.equal(v.trip.route, 'A');
  assert.equal(v.timestamp, 1794063000);
  assert.ok(Math.abs(v.position.lat - 39.7) < 1e-5);
});

test('a truncated feed is an error, not a half-read feed', () => {
  const whole = bytes([header, msg(2, [str(1, '1'), msg(4, [trip('t', 'A', 0), int(5, 1794063000)])])]);
  assert.throws(() => decodeFeed(whole.subarray(0, whole.length - 3)), /truncated/);
});

test('times past 2^31 decode as plain numbers', () => {
  const feed = bytes([msg(1, [int(3, 4102444800)])]); // 2100-01-01
  assert.equal(decodeFeed(feed).header.timestamp, 4102444800);
});
