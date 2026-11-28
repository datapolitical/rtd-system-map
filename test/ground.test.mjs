// The ground our build draws (#241): the written street rule, simplification at each drawing's
// scale, and the drawings made from the committed OpenStreetMap pack (basemap/), on real tiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPack } from '../scripts/lib/basemap.mjs';
import { SHEETS } from '../public/js/sheets/style.js';
import { STREET_CLASSES, STREET_RULE, streetClassesAt, simplify, readGround, drawGround, describe } from '../scripts/lib/ground.mjs';
import { GROUND_DIR } from '../scripts/ground.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = GROUND_DIR;
const pack = await readPack();
const skip = pack ? false : 'basemap/ has no ground pack (run `npm run build:basemap`)';

test('the street rule only adds classes as the zoom grows', () => {
  // The rule is a table of thresholds; each step keeps every class the step before it drew.
  for (let i = 1; i < STREET_RULE.length; i++) {
    for (const cls of STREET_RULE[i - 1].classes) assert.ok(STREET_RULE[i].classes.includes(cls), `${cls} is still drawn at ${STREET_RULE[i].from}`);
    assert.ok(STREET_RULE[i].from > STREET_RULE[i - 1].from, 'the thresholds rise');
  }
  let last = [];
  for (const zoom of [7, 8, 8.75, 10, 11, 11.5, 12, 13, 13.5, 14, 15, 16, 17]) {
    const now = streetClassesAt(zoom);
    for (const cls of last) assert.ok(now.includes(cls), `${cls} stays at zoom ${zoom}`);
    last = now;
  }
  // And today's five sheets keep their street sets.
  assert.deepEqual(streetClassesAt(8.75), ['motorway']);
  assert.deepEqual(streetClassesAt(10), ['motorway']);
  assert.deepEqual(streetClassesAt(12), ['motorway', 'trunk', 'primary']);
  assert.deepEqual(streetClassesAt(14), STREET_CLASSES);
  assert.deepEqual(streetClassesAt(16), STREET_CLASSES);
});

test('a shape is simplified within its drawing\'s tolerance and its ends stay', () => {
  // A gentle wave: every bend is under a pixel, so a 1 px tolerance leaves the two ends.
  const wave = Array.from({ length: 21 }, (_, i) => [i * 5, Math.sin(i / 3) * 0.4]);
  assert.deepEqual(simplify(wave, 1), [wave[0], wave.at(-1)]);
  // A 6 px spike is kept, and nothing dropped lies further than the tolerance from the kept line.
  const spike = [[0, 0], [10, 0], [20, 6], [30, 0], [40, 0]];
  const kept = simplify(spike, 1);
  assert.deepEqual(kept, spike);
  const shallow = [[0, 0], [10, 0.5], [20, 0], [30, 0.4], [40, 0]];
  const out = simplify(shallow, 1);
  assert.deepEqual(out, [[0, 0], [40, 0]]);
  const near = (p) => {
    let best = Infinity;
    for (let i = 1; i < out.length; i++) {
      const [ax, ay] = out[i - 1];
      const [bx, by] = out[i];
      const [dx, dy] = [bx - ax, by - ay];
      const len = Math.hypot(dx, dy);
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len ** 2));
      best = Math.min(best, Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t)));
    }
    return best;
  };
  for (const p of shallow) assert.ok(near(p) <= 1 + 1e-9, `${p} is within a pixel of the drawn line`);
});

// A slice of real tiles over Union Station and I-25, so the test's read is seconds, not minutes.
const at = (lon, lat, zoom) => [
  Math.floor(((lon + 180) / 360) * 2 ** zoom),
  Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** zoom),
];
const [[w, n], [e, s]] = [[-105.06, 39.79], [-104.94, 39.72]];
const sliceKeys = pack ? pack.keys.filter((key) => {
  const [z, x, y] = key.split('/').map(Number);
  if (z !== pack.zooms.at(-1)) return false;
  const [x0] = at(w, n, z); const [x1] = at(e, s, z); const [, y0] = at(w, n, z); const [, y1] = at(e, s, z);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}) : [];
const slice = pack && {
  zooms: pack.zooms,
  *tiles(zoom = null) { for (const key of sliceKeys) if (zoom === null || Number(key.split('/')[0]) === zoom) yield [key, pack.tile(key)]; },
};

test('the drawings on real tiles choose by the rule and hold water, parks and rivers', { skip }, () => {
  assert.ok(sliceKeys.length >= 4, `the slice has tiles (${sliceKeys.length})`);
  const ground = readGround(slice);
  assert.ok(ground.tiles >= 4, `read ${ground.tiles} tiles`);
  const seen = {};
  for (const zoom of [8.75, 10, 12, 14, 16]) {
    const drawn = drawGround(ground, zoom);
    const allowed = streetClassesAt(zoom);
    const counts = describe(drawn).counts;
    seen[zoom] = counts;
    for (const f of drawn.features) {
      const { kind, cls } = f.properties;
      if (kind !== 'street') continue;
      assert.ok(allowed.includes(cls), `zoom ${zoom} draws no ${cls}`);
      assert.ok(f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString', 'a street is drawn as lines');
    }
    // Water and parks are drawn on every drawing; a river where the slice has one.
    assert.ok(counts.water > 0 && counts.park > 0, `zoom ${zoom} has water (${counts.water}) and parks (${counts.park})`);
    if (zoom >= 12) assert.ok(counts.river > 0, `zoom ${zoom} has rivers (${counts.river})`);
    // Closer draws more streets, never fewer.
    if (zoom > 8.75) assert.ok(counts.street >= seen[zoom === 10 ? 8.75 : zoom === 12 ? 10 : zoom === 14 ? 12 : 14].street, `zoom ${zoom} adds streets`);
  }
  assert.deepEqual(Object.keys(describe(drawGround(ground, 8.75)).classes), ['motorway'], 'the widest drawing shows motorways only');
});

test('each drawing is simplified at its own scale', { skip }, () => {
  const ground = readGround(slice);
  const wide = describe(drawGround(ground, 8.75)).bytes;
  const close = describe(drawGround(ground, 16)).bytes;
  assert.ok(close > wide, `the closer drawing holds more detail (${wide} bytes at 8.75, ${close} at 16)`);
});

test('the build\'s drawings are on disk, from this pack, and follow the rule', { skip }, async () => {
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(DATA, 'ground.json'), 'utf8')); } catch { return; }
  assert.equal(manifest.planet, pack.planet, 'drawn from the committed pack');
  assert.equal(manifest.tileZoom, pack.zooms.at(-1), 'from its deepest tiles');
  assert.equal(manifest.drawings.length, SHEETS.length, 'one drawing per sheet');
  let streets = 0;
  const classes = new Set();
  for (const [i, drawing] of manifest.drawings.entries()) {
    assert.equal(drawing.id, SHEETS[i].id);
    assert.equal(drawing.zoom, SHEETS[i].zoom);
    const allowed = streetClassesAt(drawing.zoom);
    for (const cls of Object.keys(drawing.classes)) {
      assert.ok(allowed.includes(cls), `ground ${drawing.id} draws no ${cls}`);
      if (drawing.zoom >= 14) classes.add(cls);
    }
    assert.ok(drawing.counts.street > 0 && drawing.counts.water > 0 && drawing.counts.park > 0, `ground ${drawing.id} has streets, water and parks`);
    assert.ok(drawing.counts.street >= streets, `ground ${drawing.id} adds streets`);
    streets = drawing.counts.street;
    const { size } = await stat(path.join(DATA, `ground-${drawing.id}.geojson`));
    assert.equal(size, drawing.bytes, `ground-${drawing.id}.geojson is the size the manifest says`);
  }
  // Every class in the rule is actually drawn somewhere at 14 or closer: the rule is not describing
  // streets the pack does not have.
  for (const cls of STREET_CLASSES) assert.ok(classes.has(cls), `the district has ${cls} streets`);
});



test('a shape too small for a drawing is not drawn on it, and is on a closer one', () => {
  // About 5 m: a third of a pixel at 8.75, several pixels at 16.
  const d = 0.00005;
  const [[lon, lat]] = [[-105, 39.75]];
  const ground = {
    zoom: 14,
    streets: new Map([['short', { cls: 'motorway', parts: [[[lon, lat], [lon + d, lat]]] }]]),
    polygons: { water: [[[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]]], park: [] },
    rivers: [[[lon, lat], [lon + d, lat]]],
  };
  const wide = drawGround(ground, 8.75);
  assert.equal(wide.features.length, 0, 'nothing a third of a pixel across is drawn at 8.75');
  const close = drawGround(ground, 16);
  assert.deepEqual(close.features.map((f) => f.properties.kind).sort(), ['river', 'street', 'water'], 'the same shapes are drawn at 16');
});
