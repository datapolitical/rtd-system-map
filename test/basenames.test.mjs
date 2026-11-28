// The base map's place names (#235, plan #129 step 4). Every rule the
// placement adds has a case here: the ground is read once per name and point,
// a name keeps the first zoom its tiles carry it at, it holds one ground
// position from that zoom inward, it gives way to the labels a drawing already
// has, and the plan check catches an overlap or a name that goes while zooming
// in. The names are the committed ground's (basemap/), so these run without a
// data build; the drawing tests skip when public/data is not built.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readPack } from '../scripts/lib/basemap.mjs';
import { PLACE_CLASSES, Room, chainPlaces, checkPlan, drawingsNeeded, nameBox, placeBaseNames, placeId, planOf, readPlaces, roomOfSheet } from '../scripts/lib/basenames.mjs';
import { SHEETS, toLonLat, toPx } from '../scripts/lib/sheets.mjs';
import { PLACE_SIZE } from '../public/js/sheets/style.js';

const pack = await readPack();
const noGround = pack ? false : 'NO GROUND: basemap/ has no tiles; run "npm run build:basemap" to run this test';
const ground = pack ? readPlaces(pack) : { names: [], counts: {}, deepZoom: 14 };
const names = ground.names.map((r) => ({ ...r, id: placeId(r) }));

const sheetAt = (zoom) => SHEETS.find((s) => s.zoom === zoom);
const hasData = (sheet) => existsSync(new URL(`../public/data/sheet-${sheet.id}.geojson`, import.meta.url));
const drawnAt = (sheet) => JSON.parse(readFileSync(new URL(`../public/data/sheet-${sheet.id}.geojson`, import.meta.url), 'utf8'));
const framesFor = (sheets) => sheets.map((sheet) => ({ zoom: sheet.zoom, size: PLACE_SIZE[sheet.id], room: roomOfSheet(drawnAt(sheet), sheet) }));

test('the ground is read once per name and point, at every class the page letters', { skip: noGround }, () => {
  const deepest = ground.deepZoom;
  assert.ok(names.length > 250, `${names.length} names at the deepest zoom; the ground holds hundreds`);
  assert.equal(names.length, ground.counts[deepest].names, 'one record for every unique name and point');
  assert.equal(new Set(names.map((n) => n.id)).size, names.length, 'ids are unique');
  for (const n of names) {
    assert.ok(PLACE_CLASSES.includes(n.cls), `${n.name}: ${n.cls} is a class the page letters`);
    assert.ok(!/historic district/i.test(n.name), `${n.name}: a register entry is not a place name`);
    assert.equal(n.text, undefined, 'the raw record, not the plan');
    assert.ok(Number.isFinite(n.rank), `${n.name}: rank is a number`);
  }
  const classes = new Set(names.map((n) => n.cls));
  assert.deepEqual([...classes].sort(), [...PLACE_CLASSES].sort(), 'all three classes are here today');
});

test('a name keeps the first zoom the tiles carry it at', { skip: noGround }, () => {
  const deep = ground.deepZoom;
  const shallow = Math.min(...Object.keys(ground.counts).map(Number));
  assert.ok(shallow < deep, `${shallow} and ${deep}: the ground holds more than one zoom`);
  const early = names.filter((n) => n.from === shallow);
  assert.equal(early.length, ground.counts[shallow].names, 'every name at the shallow zoom is one record at the deep one');
  assert.ok(early.every((n) => n.cls === 'suburb'), 'the shallow zoom holds districts only, in this ground');
  for (const n of names) assert.ok(n.from >= shallow && n.from <= deep, `${n.name}: from ${n.from}`);
});

test('a name takes its point, and gives way to a route list there', { skip: noGround }, () => {
  const sheet = sheetAt(14);
  const name = names.find((n) => n.name === 'Baker') ?? names[0];
  const size = PLACE_SIZE[sheet.id];
  const room = new Room();
  const there = toPx(name.at, sheet.zoom);
  // A route list planted across the name's own point: the name must move.
  const list = [there[0] - 30, there[1] - 3, there[0] + 30, there[1] + 3];
  room.add(list);
  const frame = { zoom: sheet.zoom, size, room };
  const out = placeBaseNames([name], [frame]);
  assert.equal(out.names.length, 1);
  const placed = out.names[0];
  assert.ok(placed.moved > 0, `moved ${placed.moved} m`);
  const box = nameBox(name.name.toUpperCase(), placed.at, sheet.zoom, size);
  assert.ok(!(box[0] < list[2] && list[0] < box[2] && box[1] < list[3] && list[1] < box[3]), 'clear of the list');
});

test('a name keeps one ground position from its first zoom inward', { skip: noGround }, () => {
  const sheet = sheetAt(14);
  const size = PLACE_SIZE[sheet.id];
  const frames = [
    { zoom: sheet.zoom, size, room: new Room() },
    { zoom: 16, size, room: new Room() },
  ];
  const out = placeBaseNames(names.slice(0, 40), frames);
  assert.equal(out.dropped.length, 0);
  for (const n of out.names) {
    assert.equal(n.from, sheet.zoom);
    assert.equal(n.to, 16, 'it is there at the closest drawing too');
    assert.ok(n.at[0] === n.at[0] && n.at[1] === n.at[1], 'a real point');
  }
  // The same ground position at both drawings: the plan has one `at` per name.
  const plan = planOf({ ...out, frames, source: {} });
  for (const n of plan.names) assert.ok(Array.isArray(n.at) && n.at.length === 2);
});

test('a name with no room anywhere does not show at all', { skip: noGround }, () => {
  const sheet = sheetAt(14);
  const size = PLACE_SIZE[sheet.id];
  const room = new Room();
  const [x, y] = toPx(names[0].at, sheet.zoom);
  // Room taken all around the point, past the furthest move: every candidate hits.
  room.add([x - 500, y - 500, x + 500, y + 500]);
  const out = placeBaseNames([names[0]], [{ zoom: sheet.zoom, size, room }]);
  assert.equal(out.names.length, 0);
  assert.equal(out.dropped.length, 1);
});

test('placement is the same every time', { skip: noGround }, () => {
  const sheet = sheetAt(14);
  const size = PLACE_SIZE[sheet.id];
  const run = () => placeBaseNames(names.slice(0, 60), [{ zoom: sheet.zoom, size, room: new Room() }]).names.map((n) => `${n.id}@${n.at.join(',')}`);
  assert.deepEqual(run(), run());
});

test('the plan check catches an overlap and a name that goes while zooming in', { skip: noGround }, () => {
  const at = names[0].at;
  const base = {
    frames: [{ zoom: 14, size: 10 }, { zoom: 16, size: 10.5 }],
    names: [
      { id: 'a', text: 'BAKER', at, from: 14, to: 16 },
      { id: 'b', text: 'BAKER', at, from: 14, to: 16 },
    ],
  };
  const overlap = checkPlan(base);
  assert.ok(overlap.some((p) => p.includes('overlaps')), overlap.join('; '));
  assert.equal(checkPlan({ ...base, names: base.names.slice(0, 1) }).length, 0, 'one name is fine');
  const gone = checkPlan({ ...base, names: [{ ...base.names[0], to: 14 }] });
  assert.ok(gone.some((p) => p.includes('zooms on to 16')), gone.join('; '));
  const twice = checkPlan({ ...base, names: [base.names[0], { ...base.names[0], at: at.map((v) => v + 0.01) }] });
  assert.ok(twice.some((p) => p.includes('id used twice')), twice.join('; '));
});

test('the drawing\'s own route lists, street names and station names are the room', { skip: noGround || !hasData(sheetAt(14)) }, () => {
  const sheet = sheetAt(14);
  const drawn = drawnAt(sheet);
  const room = roomOfSheet(drawn, sheet);
  assert.ok(room.all.length > 10000, `${room.all.length} boxes: a dense drawing`);
  const list = drawn.features.find((f) => f.properties.kind === 'bus-label');
  const mid = list.geometry.coordinates[Math.floor(list.geometry.coordinates.length / 2)];
  const name = names[0];
  const [x, y] = toPx(mid, sheet.zoom);
  assert.ok(room.hits([x - 2, y - 2, x + 2, y + 2]), 'a route list takes room on its stretch');
  const frame = { zoom: sheet.zoom, size: PLACE_SIZE[sheet.id], room };
  const out = placeBaseNames([{ ...name, at: mid }], [frame]);
  assert.equal(out.names.length, 1, 'the name finds room near the list');
  assert.ok(out.names[0].moved > 0);
});

test('every name fits on the built drawings, and the plan checks', { skip: noGround || !hasData(sheetAt(14)) }, () => {
  const sheets = SHEETS.filter((s) => s.zoom >= Math.min(...Object.keys(ground.counts).map(Number)) && hasData(s));
  const frames = framesFor(sheets);
  const out = placeBaseNames(names, frames);
  assert.equal(out.dropped.length, 0, `${out.dropped.length} names with no room`);
  const plan = planOf({ ...out, frames, source: {} });
  assert.deepEqual(checkPlan(plan), []);
  assert.equal(plan.names.length, names.length);
});

test('a place the tiles moved by a few pixels is still one place back to its first zoom', () => {
  const rec = (zoom, [x, y]) => ({ name: 'Park Hill', cls: 'suburb', rank: 1, zoom, at: toLonLat([toPx([-104.9, 39.75], zoom)[0] + x, toPx([-104.9, 39.75], zoom)[1] + y], zoom) });
  // 3 px apart at zoom 12, 1.5 px at 11: past the old one-pixel reach, still the same place.
  const { names } = chainPlaces([rec(12, [0, 0]), rec(11, [3 / 2, 0]), rec(10, [3 / 4 * 3, 0])]);
  assert.equal(names.length, 1);
  assert.equal(names[0].from, 10);
});

test('two places with one name and one point-pair stay two, each with its own first zoom', () => {
  const rec = (zoom, [x, y]) => ({ name: 'Union', cls: 'suburb', rank: 1, zoom, at: toLonLat([toPx([-104.9, 39.75], zoom)[0] + x, toPx([-104.9, 39.75], zoom)[1] + y], zoom) });
  // Two same-name places 2 px apart at the deepest zoom; only one of them is carried to zoom 11.
  const { names } = chainPlaces([rec(12, [0, 0]), rec(12, [2, 0]), rec(11, [1, 0])]);
  assert.equal(names.length, 2);
  assert.deepEqual(names.map((n) => n.from).sort(), [11, 12], 'one place is not claimed by both');
});

test('a plan is not checked on a partial set of drawings: a missing sheet is reported', () => {
  const sheets = [{ id: 2, zoom: 12 }, { id: 3, zoom: 14 }, { id: 4, zoom: 16 }];
  const { need, missing } = drawingsNeeded(sheets, 12, (s) => s.id !== 3);
  assert.equal(need.length, 3);
  assert.deepEqual(missing.map((s) => s.zoom), [14]);
  assert.deepEqual(drawingsNeeded(sheets, 12, () => true).missing, []);
});
