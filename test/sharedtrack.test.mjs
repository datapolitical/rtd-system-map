import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sharedTrack } from '../scripts/lib/sharedtrack.mjs';

// Made-up lines near (0, 0), where a kilometer is 1/111.32 of a degree
// either way. Paths are in km, with a point every 100 m.
const KM = 1 / 111.32;
function line(route, path) {
  const coordinates = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
    for (let k = 1; k <= n; k++) coordinates.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return { type: 'Feature', properties: { route, tier: 'frequent' }, geometry: { type: 'LineString', coordinates: coordinates.map(([x, y]) => [x * KM, y * KM]) } };
}
const km = ([lon, lat]) => [lon / KM, lat / KM];
const of = (pieces, route) => pieces.filter((p) => p.properties.route === route);
const meters = (points) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) * 1000, 0);
// How many line widths east of the track's middle a piece going north or
// south is drawn: its slot is to the right of the way it points.
const east = (piece) => {
  const points = piece.geometry.coordinates;
  return piece.properties.slot * Math.sign(points.at(-1)[1] - points[0][1]);
};
// The pieces of a line that cover the track at `y` km north.
const atY = (pieces, route, y) =>
  of(pieces, route).filter((p) => {
    const ys = p.geometry.coordinates.map((c) => km(c)[1]);
    return Math.min(...ys) <= y && y <= Math.max(...ys);
  });

// X and Y share 8 km of track north from the origin. Then X goes on north and
// Y leaves to the north-east; Z is on its own, far to the west.
const network = () => [
  line('X', [[0, 0], [0, 20]]),
  line('Y', [[0, 0], [0, 8], [8, 16]]),
  line('Z', [[-10, 0], [-10, 20]]),
];

test('lines on the same track are drawn side by side, each on the side it leaves toward', () => {
  const { pieces } = sharedTrack(network());
  const [x] = atY(pieces, 'X', 4);
  const [y] = atY(pieces, 'Y', 4);
  assert.equal(Math.abs(x.properties.slot), 0.5);
  assert.equal(east(y) - east(x), 1, 'Y leaves to the east, so it is the eastern one');
  assert.ok(of(pieces, 'Z').every((p) => p.properties.slot === 0), 'a line alone is on its track');
});

test('a line eases back to its track after the other leaves, with no sideways step', () => {
  const { pieces } = sharedTrack(network());
  assert.equal(atY(pieces, 'X', 19)[0].properties.slot, 0, 'on its own track well past the split');
  for (const route of ['X', 'Y']) {
    const mine = of(pieces, route);
    let joins = 0;
    for (const a of mine) {
      for (const b of mine) {
        if (a === b) continue;
        const [end, start, otherEnd] = [a.geometry.coordinates.at(-1), b.geometry.coordinates[0], b.geometry.coordinates.at(-1)];
        const same = end[0] === start[0] && end[1] === start[1];
        const facing = end[0] === otherEnd[0] && end[1] === otherEnd[1];
        if (!same && !facing) continue;
        joins++;
        // Facing pieces count their slots from opposite sides.
        const step = Math.abs(a.properties.slot - (same ? b.properties.slot : -b.properties.slot));
        assert.ok(step <= 1 / 16 + 1e-9, `${route} steps ${step} of a line's width where two pieces join`);
      }
    }
    assert.ok(joins > 0, `${route} is in pieces that join`);
  }
});

test('an out-and-back along the same track is drawn once', () => {
  // 10 km north, with 300 m run back over and forward again on the way.
  const { pieces } = sharedTrack([line('X', [[0, 0], [0, 5], [0, 4.7], [0, 10]])]);
  const drawn = of(pieces, 'X').reduce((sum, p) => sum + meters(p.geometry.coordinates.map(km)), 0);
  assert.ok(Math.abs(drawn - 10000) < 50, `${Math.round(drawn)} m drawn for 10 km of track`);
});

test('lines that end side by side end level, at the furthest of their ends', () => {
  // X and Y come south on tracks 10 m apart; Y's platform stops 80 m short
  // of X's. Z ends 3 km away and is left alone.
  const { pieces } = sharedTrack([
    line('X', [[0, 10], [0, 0]]),
    line('Y', [[0.01, 10], [0.01, 0.08]]),
    line('Z', [[3, 10], [3, 0.5]]),
  ]);
  const south = (route) => Math.min(...of(pieces, route).flatMap((p) => p.geometry.coordinates.map((c) => km(c)[1])));
  assert.ok(Math.abs(south('Y') - south('X')) < 0.002, `Y ends ${Math.round((south('Y') - south('X')) * 1000)} m from X's end`);
  assert.ok(Math.abs(south('X')) < 0.002, 'X, the furthest, is not moved');
  assert.ok(Math.abs(south('Z') - 0.5) < 0.002, 'a line ending on its own is not moved');
});

test('lines that end far apart, or end facing each other, are left as they are', () => {
  // Y stops 400 m short of X: a different station. W comes the other way
  // and ends 50 m from X's end, as light rail and commuter rail do at a hub.
  const { pieces } = sharedTrack([
    line('X', [[0, 10], [0, 0]]),
    line('Y', [[0.01, 10], [0.01, 0.4]]),
    line('W', [[0, -10], [0, -0.05]]),
  ]);
  const ys = (route) => of(pieces, route).flatMap((p) => p.geometry.coordinates.map((c) => km(c)[1]));
  assert.ok(Math.abs(Math.min(...ys('Y')) - 0.4) < 0.002);
  assert.ok(Math.abs(Math.min(...ys('X'))) < 0.002);
  assert.ok(Math.abs(Math.max(...ys('W')) + 0.05) < 0.002);
});

test('lines on tracks side by side are drawn as one pack, and leave it without a jump', () => {
  // X and Y run north on tracks 16 m apart for 8 km, then Y leaves to the
  // north-east. Drawn on their own tracks, a slot apart, the gap between
  // them would change with the zoom.
  const { pieces } = sharedTrack([
    line('X', [[0, 0], [0, 20]]),
    line('Y', [[0.016, 0], [0.016, 8], [8, 16]]),
  ]);
  const xAt = (route, y) => {
    const points = atY(pieces, route, y).flatMap((p) => p.geometry.coordinates.map(km));
    const [a, b] = [points.filter((p) => p[1] <= y).at(-1), points.find((p) => p[1] >= y)];
    return a[1] === b[1] ? a[0] : a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  };
  for (const y of [0.01, 2, 4, 6]) {
    assert.ok(Math.abs(xAt('X', y) - 0.008) < 0.001, `X is ${Math.round(xAt('X', y) * 1000)} m east at ${y} km, not on the middle (8 m)`);
    assert.ok(Math.abs(xAt('Y', y) - 0.008) < 0.001, `Y is ${Math.round(xAt('Y', y) * 1000)} m east at ${y} km, not on the middle (8 m)`);
  }
  assert.ok(Math.abs(xAt('X', 19)) < 0.001, 'X is back on its own track well past the split');
  // Each line is one unbroken path: every piece starts where another ends.
  for (const route of ['X', 'Y']) {
    const mine = of(pieces, route).map((p) => p.geometry.coordinates.map(km));
    const ends = mine.flatMap((points) => [points[0], points.at(-1)]);
    const loose = ends.filter((p) => !ends.some((q) => q !== p && Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.002));
    assert.equal(loose.length, 2, `${route} has ${loose.length} loose ends; a line in one piece has 2`);
    for (const points of mine) {
      for (let i = 2; i < points.length; i++) {
        const [u, v] = [[points[i - 1][0] - points[i - 2][0], points[i - 1][1] - points[i - 2][1]], [points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]];
        const turn = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
        assert.ok(turn < 0.9, `${route} turns ${Math.round((turn * 180) / Math.PI)} degrees at one point`);
      }
    }
  }
});

test('a corner in a path is drawn as a curve, and the ends stay put', () => {
  // 5 km north, then a 37 degree turn at one point, as RTD's paths have.
  const { pieces } = sharedTrack([line('X', [[0, 0], [0, 5], [3, 9]])]);
  const points = of(pieces, 'X').flatMap((p) => p.geometry.coordinates.map(km));
  let sharpest = 0;
  for (let i = 2; i < points.length; i++) {
    const [u, v] = [[points[i - 1][0] - points[i - 2][0], points[i - 1][1] - points[i - 2][1]], [points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]];
    if (Math.hypot(...u) && Math.hypot(...v)) sharpest = Math.max(sharpest, Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])));
  }
  assert.ok(sharpest < 0.3, `turns ${Math.round((sharpest * 180) / Math.PI)} degrees at one point`);
  // The curve cuts the corner by a few meters, no more.
  const cut = Math.min(...points.map((p) => Math.hypot(p[0], p[1] - 5))) * 1000;
  assert.ok(cut > 1 && cut < 10, `passes ${cut.toFixed(1)} m from the corner`);
  const ends = [points[0], points.at(-1)].sort((a, b) => a[1] - b[1]);
  assert.ok(Math.hypot(ends[0][0], ends[0][1]) < 0.002 && Math.hypot(ends[1][0] - 3, ends[1][1] - 9) < 0.002, 'the ends are where they were');
});

test('every line carries its letter at every zoom, and lines sharing track take turns', () => {
  const { letters } = sharedTrack(network());
  for (let zoom = 9; zoom <= 18; zoom++) {
    const shown = letters.filter((f) => f.properties.from <= zoom && zoom < f.properties.to);
    for (const route of ['X', 'Y', 'Z']) {
      assert.ok(shown.some((f) => f.properties.route === route), `${route} has a letter at zoom ${zoom}`);
    }
  }
  // At zoom 13 the 8 km shared (about 1200 px) has room for a few letters.
  // Counted to just past the fork: a line's letter past the fork counts as
  // its turn there (the line with the nearer letter yields the place).
  const shared = sharedLetters(letters, 13, 9);
  const count = (route) => shared.filter((f) => f.properties.route === route).length;
  assert.ok(count('X') > 0 && count('Y') > 0, `both lines are named on the track they share: X ${count('X')}, Y ${count('Y')}`);
  assert.ok(Math.abs(count('X') - count('Y')) <= 1, `turns: X ${count('X')}, Y ${count('Y')}`);
});

test('a line is lettered about once a screen, not more', () => {
  const { letters } = sharedTrack(network());
  // Z alone, 20 km. Sized for halfway through each zoom's range.
  for (let zoom = 10; zoom <= 16; zoom++) {
    const mine = letters.filter((f) => f.properties.route === 'Z' && f.properties.from <= zoom && zoom < f.properties.to).map((f) => km(f.geometry.coordinates)[1]).sort((a, b) => a - b);
    const px = (kms) => (kms * 1000) / (40075017 / (512 * 2 ** (zoom + 0.5)));
    assert.ok(mine.length >= 1, `Z has a letter at zoom ${zoom}`);
    for (let i = 1; i < mine.length; i++) {
      assert.ok(px(mine[i] - mine[i - 1]) >= 350, `letters ${Math.round(px(mine[i] - mine[i - 1]))} px apart at zoom ${zoom}`);
    }
    assert.ok(mine.length <= Math.ceil(px(20) / 700) + 1, `${mine.length} letters on ${Math.round(px(20))} px of line at zoom ${zoom}`);
  }
});

// The letters on the track X and Y share, in the set for `zoom`, up to
// `until` km north (short of where Y leaves, by default).
const sharedLetters = (letters, zoom, until = 7.5) => letters.filter((f) => f.properties.from === zoom && Math.abs(km(f.geometry.coordinates)[0]) < 0.01 && km(f.geometry.coordinates)[1] < until);

test("a letter says which side of the track its line is drawn on", () => {
  const { letters } = sharedTrack(network());
  const shared = sharedLetters(letters, 13);
  assert.ok(shared.length > 0, 'letters on the shared track');
  for (const f of shared) {
    // The track runs north: Y is half a line east (right on screen), X west.
    assert.equal(f.properties.sx, f.properties.route === 'Y' ? 0.5 : -0.5);
    assert.equal(Math.abs(f.properties.sy), 0);
  }
  assert.ok(letters.filter((f) => f.properties.route === 'Z').every((f) => f.properties.sx === 0 && f.properties.sy === 0));
});

test('letters keep clear of stations', () => {
  // A station every 3 km along Z: room for a letter between two at any zoom.
  const stations = Array.from({ length: 7 }, (_, i) => [-10 * KM, i * 3 * KM]);
  const { letters } = sharedTrack(network(), stations);
  for (const f of letters.filter((l) => l.properties.route === 'Z')) {
    const y = km(f.geometry.coordinates)[1];
    // On screen, halfway through the zooms the letter is shown for.
    const zoom = Math.max(10, f.properties.from) + 0.5;
    const px = (Math.abs(y - Math.round(y / 3) * 3) * 1000) / (40075017 / (512 * 2 ** zoom));
    assert.ok(px >= 15, `letter ${y.toFixed(2)} km along is ${Math.round(px)} px from a station at zoom ${zoom}`);
  }
});
