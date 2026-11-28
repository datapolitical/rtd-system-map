// One lettering plan (#234): the build writes every label once, the checks read it, and
// one record holds the room each label takes. The rule tests use small drawings shaped
// like the sheets' own; the last test builds the plan from the built map in public/data
// and plants faults in it, as the recall fixtures do. Without built data it skips loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boxesOverlap, carryFaults, corners, letteringPlan, overlapFaults, planFaults, planReport, Room } from '../scripts/lib/lettering-plan.mjs';
import { toLonLat, toPx } from '../scripts/lib/sheets.mjs';

const DATA = fileURLToPath(new URL('../public/data/', import.meta.url));
const HAVE_DATA = ['0', '1', '2', '3', '4'].every((n) => existsSync(`${DATA}sheet-${n}.geojson`));
const NO_DATA = HAVE_DATA ? false : 'BUILT DATA MISSING: public/data/sheet-*.geojson is not here; run "node scripts/sheets.mjs" to run the plan tests';

// A point on a drawing, `x` and `y` pixels from the middle of the sheets' area.
const at = (x, y, zoom) => toLonLat([toPx([-105, 39.75], zoom)[0] + x, toPx([-105, 39.75], zoom)[1] + y], zoom);
const point = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const lineString = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });

// A station's name as drawSheet writes it: the bar's middle, and the ink box it measured
// relative to that middle. `box` is [x0, y0, x1, y1].
const name = (id, nid, text, [x, y], box = [-40, -12, 40, 12]) => point({
  kind: 'station', shape: 'name', id, nid, name: text, text, lines: 'A', anchor: 'left', offset: [1, 0], justify: 'left', bx: box.join(','),
}, at(x, y, 12));
// A route list on a street running east, as `bus-label` writes it.
const list = ([x, y], [x2, y2], label, routes, extra = {}) => lineString({
  kind: 'bus-label', cls: 'c15', label, n: 0, routes, ...extra,
}, [at(x, y, 12), at(x2, y2, 12)]);

const drawing = (id, zoom, features) => ({ id, zoom, features });
const sheets = (features12, features14) => [drawing(2, 12, features12), drawing(3, 14, features14)];

test('a station name on two drawings is one label with a stop on each, in zoom order', () => {
  const plan = letteringPlan(sheets([name(7, '0.0', 'Union Station', [0, 0])], [name(7, '0.0', 'Union Station', [0, 0])]));
  const one = plan.labels.filter((l) => l.kind === 'station-name');
  assert.equal(one.length, 1);
  assert.deepEqual(one[0].stops.map((s) => s.zoom), [12, 14]);
  assert.equal(one[0].from, 12);
  assert.equal(one[0].to, 14);
  assert.equal(planFaults(plan).length, 0);
});

test('the same drawing always makes the same plan', () => {
  const drawings = () => sheets([name(7, '0.0', 'Union Station', [0, 0]), list([-100, 20], [100, 20], '0, 1', '0 1')], [name(7, '0.0', 'Union Station', [0, 0])]);
  assert.deepEqual(letteringPlan(drawings()), letteringPlan(drawings()));
});

test('a name that goes and comes back is a new label with a parent, and the check counts it', () => {
  const plan = letteringPlan([
    drawing(2, 12, [name(7, '0.0', 'Union Station', [0, 0])]),
    drawing(3, 14, []),
    drawing(4, 16, [name(7, '0.0', 'Union Station', [0, 0])]),
  ]);
  const names = plan.labels.filter((l) => l.kind === 'station-name');
  assert.equal(names.length, 2);
  assert.equal(names[1].parent, names[0].id);
  const faults = carryFaults(plan);
  assert.ok(faults.some((f) => f.kind === 'gave-way' && f.id === names[0].id), 'the gap is reported');
});

test('a recorded reason silences the check', () => {
  const plan = letteringPlan([drawing(2, 12, [name(7, '0.0', 'Depot', [0, 0])]), drawing(3, 14, [])]);
  plan.labels[0].why = 'handover: the junction is named here from 14';
  assert.equal(carryFaults(plan).filter((f) => f.kind === 'gave-way').length, 0);
});

test('a label that moves more than 2 px at the next drawing is a fault', () => {
  const plan = letteringPlan(sheets([name(7, '0.0', 'Union Station', [0, 0])], [name(7, '0.0', 'Union Station', [6, 0])]));
  assert.equal(plan.labels[0].stops[1].moved, 24, '6 px at 12 is 24 px at 14');
  assert.ok(carryFaults(plan).some((f) => f.kind === 'moved' && f.px === 24));
});

test('a route list carries to the nearest copy of the same list, and its move is measured', () => {
  const plan = letteringPlan(sheets(
    [list([-100, 20], [100, 20], '0, 1', '0 1'), list([-100, 200], [100, 200], '0, 1', '0 1')],
    [list([-100, 21], [100, 21], '0, 1', '0 1'), list([-100, 200], [100, 200], '0, 1', '0 1')],
  ));
  const lists = plan.labels.filter((l) => l.kind === 'route-list');
  assert.equal(lists.length, 2, 'two lists on each drawing, each carried');
  assert.equal(lists[0].stops.length, 2);
  assert.equal(lists[1].stops.length, 2);
});

test('two labels whose ink overlaps are reported, and separated ones are not', () => {
  const a = { x: 0, y: 0, w: 100, h: 20, angle: 0 };
  assert.equal(boxesOverlap(a, { x: 60, y: 0, w: 100, h: 20, angle: 0 }), true);
  assert.equal(boxesOverlap(a, { x: 101, y: 0, w: 100, h: 20, angle: 0 }), false, 'touching edges do not overlap');
  // A long box turned across a short one overlaps; the same two side by side do not.
  assert.equal(boxesOverlap(a, { x: 0, y: 8, w: 20, h: 100, angle: Math.PI / 2 }), true);
  assert.equal(boxesOverlap(a, { x: 0, y: 60, w: 20, h: 100, angle: Math.PI / 2 }), false);
  assert.equal(corners(a).length, 4);
});

test('the Room record answers what is already taken, and forgets nothing it took', () => {
  const room = new Room();
  assert.deepEqual(room.take({ x: 0, y: 0, w: 20, h: 10, angle: 0 }, { id: 'a' }), []);
  assert.deepEqual(room.hits({ x: 5, y: 0, w: 20, h: 10, angle: 0 }).map((o) => o.id), ['a']);
  assert.deepEqual(room.hits({ x: 500, y: 0, w: 20, h: 10, angle: 0 }), []);
  // A second box that overlaps the first is told so when it is taken.
  assert.deepEqual(room.take({ x: 10, y: 0, w: 20, h: 10, angle: 0 }, { id: 'b' }).map((o) => o.id), ['a']);
});

test('a planted overlap on a drawing is found, and the same two labels apart are not', () => {
  const plan = letteringPlan(sheets([], [name(7, '0.0', 'Union Station', [0, 0]), name(8, '1.0', 'Civic Center', [-300, 0])]));
  assert.equal(overlapFaults(plan).length, 0);
  plan.labels.find((l) => l.key === 'station-name:8:0').stops[0].at = plan.labels.find((l) => l.key === 'station-name:7:0').stops[0].at;
  const faults = overlapFaults(plan);
  assert.equal(faults.length, 1);
  assert.deepEqual(new Set([faults[0].a, faults[0].b]), new Set(['station-name:7:0#1', 'station-name:8:0#1']));
});

test('a name and its own row of letters do not count as an overlap', () => {
  const features = [name(7, '0.0', 'Union Station', [0, 0]), point({ kind: 'letter', small: true, route: 'A', nid: '0.0', color: '#f00', ink: '#000' }, at(0, 9, 12))];
  const plan = letteringPlan([drawing(2, 12, features)]);
  assert.equal(plan.labels.filter((l) => l.kind === 'station-letter')[0].partOf, 'station-name:7:0');
  assert.equal(overlapFaults(plan).length, 0);
});

test('the plan built from the real map is whole and every kind of lettering is in it', { skip: NO_DATA }, () => {
  const drawings = [0, 1, 2, 3, 4].map((id) => ({ id, zoom: [8.75, 10, 12, 14, 16][id], features: JSON.parse(readFileSync(`${DATA}sheet-${id}.geojson`, 'utf8')).features }));
  const plan = letteringPlan(drawings);
  assert.equal(planFaults(plan).length, 0);
  assert.ok(plan.labels.length > 7000, `the five drawings hold ${plan.labels.length} labels`);
  const kinds = new Set(plan.labels.map((l) => l.kind));
  for (const kind of ['station-name', 'station-letter', 'line-letter', 'route-list']) assert.ok(kinds.has(kind), `${kind} is in the plan`);
  // Most stations named at 12 are named at 14 too, and the plan says so with one label.
  const carried = plan.labels.filter((l) => l.kind === 'station-name' && l.stops.some((s) => s.zoom === 12) && l.stops.some((s) => s.zoom === 14));
  assert.ok(carried.length > 50, `${carried.length} station names run from 12 to 14 as one label`);
  const report = planReport(plan);
  assert.equal(report.stops, plan.labels.reduce((n, l) => n + l.stops.length, 0));
});

test('a planted overlap and a planted disappearance are caught on the real plan', { skip: NO_DATA }, () => {
  const drawings = [0, 1, 2, 3, 4].map((id) => ({ id, zoom: [8.75, 10, 12, 14, 16][id], features: JSON.parse(readFileSync(`${DATA}sheet-${id}.geojson`, 'utf8')).features }));
  const plan = letteringPlan(drawings);
  const at14 = plan.labels.filter((l) => !l.partOf && l.stops.some((s) => s.zoom === 14));
  const [a, b] = at14.filter((l) => l.kind === 'station-name').slice(0, 2);
  assert.ok(a && b);
  const pair = (faults) => faults.some((f) => [f.a, f.b].includes(a.id) && [f.a, f.b].includes(b.id));
  assert.equal(pair(overlapFaults(plan)), false, 'the two names start clear of each other');
  const was = { at: b.stops.find((s) => s.zoom === 14).at, angle: b.stops.find((s) => s.zoom === 14).angle, room: b.stops.find((s) => s.zoom === 14).room };
  Object.assign(b.stops.find((s) => s.zoom === 14), { at: a.stops.find((s) => s.zoom === 14).at, angle: a.stops.find((s) => s.zoom === 14).angle, room: a.stops.find((s) => s.zoom === 14).room });
  assert.equal(pair(overlapFaults(plan)), true, 'a name planted on another is caught');
  Object.assign(b.stops.find((s) => s.zoom === 14), was);
  assert.equal(pair(overlapFaults(plan)), false, 'and putting it back clears the fault');
  // A label at 12 that is missing at 14 is a disappearance unless something takes over.
  const gone = at14.find((l) => l.from === 12);
  const before = gone.stops.slice();
  gone.stops = gone.stops.filter((s) => s.zoom !== 14);
  gone.to = gone.stops.at(-1).zoom;
  assert.ok(carryFaults(plan).some((f) => f.id === gone.id && (f.kind === 'gap' || f.kind === 'gave-way')), 'a label gone from 14 is caught');
  gone.stops = before;
  gone.to = before.at(-1).zoom;
});

test('overlap is exact for tiny rotated boxes: a real overlap is found and a clear control is not', () => {
  const tiny = { x: 0, y: 0, w: 1e-5, h: 1e-5, angle: 0.3 };
  assert.equal(boxesOverlap(tiny, { x: 2e-6, y: 1e-6, w: 1e-5, h: 1e-5, angle: 0.9 }), true, 'tiny boxes sharing ink overlap');
  assert.equal(boxesOverlap(tiny, { x: 1, y: 0, w: 1e-5, h: 1e-5, angle: 0.9 }), false, 'tiny boxes far apart do not');
  assert.equal(boxesOverlap(tiny, { x: 1e-4, y: 0, w: 1e-5, h: 1e-5, angle: 0 }), false, 'tiny boxes close but clear do not');
});

test('a station name is checked where its ink is, not at its station bar', () => {
  // The ink sits 100 px east of the bar. A route list there collides; one on the bar does not.
  const names = [name(1, 1, 'Far Name', [0, 0], [60, -10, 140, 10])];
  const onInk = list([60, 0], [140, 0], 'ROUTES', 'X');
  const onBar = list([-40, 0], [40, 0], 'ROUTES', 'X');
  const stopOf = (plan, kind) => plan.labels.find((l) => l.kind === kind).stops[0];
  const plan = letteringPlan([drawing(2, 12, [...names, onBar])]);
  const s = stopOf(plan, 'station-name');
  const [bx, by] = toPx(at(0, 0, 12), 12);
  const [sx, sy] = toPx(s.at, 12);
  assert.ok(Math.abs(sx - (bx + 100)) < 0.01 && Math.abs(sy - by) < 0.01, 'the stop is at the ink centre');
  assert.equal(overlapFaults(plan).length, 0, 'a list on the bar, clear of the ink, is no fault');
  const plan2 = letteringPlan([drawing(2, 12, [...names, onInk])]);
  assert.ok(overlapFaults(plan2).length > 0 || !plan2.labels.some((l) => l.kind === 'route-list'), 'a list on the ink is a fault');
});
