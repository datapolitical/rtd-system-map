// Task 2: edge cases in scripts/lib/sharedtrack.mjs.
//
// Expectations come from the module's doc comments and DESIGN.md ("Shared
// track"), never from watching what the code currently does.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestOnTrack, sharedTrack, trackAt, trimToEnds } from '../../scripts/lib/sharedtrack.mjs';

const line = (route, coordinates, slot = 0) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: { route, slot },
});

// A meridian path from lat 39.70 to 39.72: about 2.2 km.
const meridian = (lons = -105, from = 39.7, to = 39.72, steps = 8) =>
  Array.from({ length: steps + 1 }, (_, i) => [lons, from + ((to - from) * i) / steps]);

test('nearestOnTrack returns the closest point, and null past maxMeters', () => {
  // Doc comment: "The nearest point on the track to `point`, among the pieces
  // `sharedTrack` returned, or null if none is within `maxMeters`."
  const pieces = [line('A', meridian())];
  const near = nearestOnTrack(pieces, [-105.0002, 39.705], 50);
  assert.ok(near, 'a point 17 m off the track is within 50 m');
  assert.equal(near[0], -105);
  assert.ok(Math.abs(near[1] - 39.705) < 1e-4, `nearest latitude was ${near[1]}`);
  assert.equal(nearestOnTrack(pieces, [-105.0002, 39.705], 5), null, 'and not within 5 m');
});

test('trackAt reports how many lines run side by side, from the slot', () => {
  // Doc comment: "how many lines run side by side there, and the track's
  // bearing (degrees clockwise from north) ... Slots run from -(n - 1) / 2 to
  // (n - 1) / 2."
  const point = [-104.995, 39.7];
  const piece = (slot) => line('A', [[-105, 39.7], [-104.99, 39.7]], slot);

  assert.deepEqual(trackAt([piece(0)], point), { span: 1, bearing: 90 });
  assert.deepEqual(trackAt([piece(0.5)], point), { span: 2, bearing: 90 }, 'two lines side by side');
  assert.deepEqual(trackAt([piece(-1)], point), { span: 3, bearing: 90 });
  assert.deepEqual(trackAt([line('A', [[-105, 39.6], [-104.99, 39.6]], 0)], point), { span: 1, bearing: 0 }, 'nothing within 20 m: a station mark spans one line');
});

test('trimToEnds cuts the tail track past the end station and keeps the longer side', () => {
  // Doc comment: "Cut track that runs on past a line's end station (tail track
  // trains pull into to turn back): each path is split where it passes closest
  // to each end station, and only the longer side kept."
  const path = meridian();
  const [out] = trimToEnds([path], [[-105, 39.715]]);
  assert.ok(out.length < path.length, 'something was cut');
  assert.equal(out.at(-1)[1], 39.715, 'the path now ends at the station');
  assert.equal(out[0][1], 39.7, 'the long side is the one kept');
});

test('trimToEnds leaves a path alone when no end station is within 300 m', () => {
  const path = meridian();
  const [out] = trimToEnds([path], [[-104.9, 39.71]]);
  assert.deepEqual(out, path);
});

test('sharedTrack gives two lines on one corridor different slots, and 1 where a line runs alone', () => {
  // Module doc: "where another line runs within a few meters, the two share
  // track ... each piece gets a `slot`: how many line widths to the side of the
  // shared centerline it is drawn".
  // A and B run the same 2 km corridor (about 5 m apart, inside SHARED_METERS),
  // then A alone runs 2 km further east.
  const corridor = Array.from({ length: 21 }, (_, i) => [-105 + i * 0.00025, 39.7]);
  const alone = Array.from({ length: 21 }, (_, i) => [-104.995 + i * 0.00025, 39.7]);
  const a = line('A', [...corridor, ...alone.slice(1)]);
  const b = line('B', corridor.map(([lon, lat]) => [lon, lat + 0.00005]));

  const pieces = sharedTrack([a, b]);
  const atShared = trackAt(pieces, [-104.998, 39.7]);
  const atAlone = trackAt(pieces, [-104.9925, 39.7]);

  assert.ok(atShared.span >= 2, `two lines on the corridor: span ${atShared.span}`);
  assert.equal(atAlone.span, 1, `one line east of the corridor: span ${atAlone.span}`);
  const slots = new Set(pieces.filter((p) => p.properties.route === 'A').map((p) => p.properties.slot));
  assert.ok(slots.size >= 2, `A is cut where its sharing changes: slots ${[...slots].join(',')}`);
});
