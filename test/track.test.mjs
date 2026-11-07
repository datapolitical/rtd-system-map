import assert from 'node:assert/strict';
import { test } from 'node:test';
import { metresTo, offTrack, trackIndex } from '../public/js/track.js';

// A made-up line running east along latitude 39.75 for about 860 m, and a bus.
const routes = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { route: 'X', mode: 'rail' }, geometry: { type: 'LineString', coordinates: [[-105, 39.75], [-104.995, 39.75]] } },
    { type: 'Feature', properties: { route: 'X', mode: 'rail' }, geometry: { type: 'MultiLineString', coordinates: [[[-104.995, 39.75], [-104.99, 39.75]]] } },
    { type: 'Feature', properties: { route: '15', mode: 'bus' }, geometry: { type: 'LineString', coordinates: [[-105, 39.76], [-104.99, 39.76]] } },
  ],
};
const north = (m) => 39.75 + m / 110_574; // a latitude m metres north of the line

test('the index keeps rail only, each route with all its pieces', () => {
  const index = trackIndex(routes);
  assert.deepEqual([...index.keys()], ['X']);
  assert.equal(index.get('X').length, 8); // two segments of four numbers
});

test('distance to the track is measured square to it, and past its end from the end', () => {
  const segs = trackIndex(routes).get('X');
  assert.ok(Math.abs(metresTo(segs, -104.997, north(50)) - 50) < 0.5);
  assert.ok(metresTo(segs, -104.997, 39.75) < 0.01);
  // 0.001 degrees of longitude west of the end, at this latitude, is about 86 m.
  assert.ok(Math.abs(metresTo(segs, -105.001, 39.75) - 85.6) < 0.5);
  assert.equal(metresTo(new Float64Array(), -105, 39.75), Infinity);
});

test('a train is off its track only beyond the limit, and only on a route with track', () => {
  const index = trackIndex(routes);
  assert.equal(offTrack(index, 'X', -104.997, north(30), 100), false);
  assert.equal(offTrack(index, 'X', -104.997, north(250), 100), true);
  assert.equal(offTrack(index, 'Y', -104.997, north(250), 100), false);
  assert.equal(offTrack(null, 'X', -104.997, north(250), 100), false);
});
