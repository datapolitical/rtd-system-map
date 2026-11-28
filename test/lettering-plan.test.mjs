// One lettering plan (#234): the build writes every label once, the checks read it, and
// one record holds the room each label takes. The rule tests use small drawings shaped
// like the sheets' own; the last test builds the plan from the built map in public/data
// and plants faults in it, as the recall fixtures do. Without built data it skips loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boxesOverlap, carryFaults, corners, droppedLabels, letteringPlan, overlapFaults, planFaults, planReport, Room } from '../scripts/lib/lettering-plan.mjs';
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
  assert.equal(carryFaults(plan).filter((f) => f.kind === 'gave-way').length, 1, 'a reason alone is not a successor');
  const child = { ...plan.labels[0], id: 'junction#2', parent: plan.labels[0].id, from: 14, to: 14, stops: [{ ...plan.labels[0].stops[0], zoom: 14, why: plan.labels[0].why }] };
  plan.labels.push(child);
  assert.equal(carryFaults(plan).filter((f) => f.kind === 'gave-way').length, 0, 'a successor that records the handover is');
  // One that only comes back later leaves the label missing at the drawing between.
  const late = { ...child, from: 16, to: 16 };
  plan.drawings.push({ id: 4, zoom: 16, labels: 0 });
  plan.labels.splice(plan.labels.indexOf(child), 1, late);
  assert.equal(carryFaults(plan).filter((f) => f.kind === 'gave-way' && f.id === plan.labels[0].id).length, 1, 'a successor two drawings later is not a handover');
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

test('carrying keeps a station name on its old ground when the fresh drawing moves it', () => {
  const plan = letteringPlan(sheets([name(7, '0.0', 'Union Station', [0, 0])], [name(7, '0.0', 'Union Station', [6, 0])]), { carry: true });
  const label = plan.labels.find((l) => l.kind === 'station-name');
  assert.equal(label.stops.length, 2);
  assert.equal(label.stops[1].moved, 0);
  assert.equal(label.stops[1].carried, true);
  assert.deepEqual(label.stops[1].at, label.stops[0].at);
  assert.equal(carryFaults(plan).length, 0);
});

test('a label missing from the fresh drawing stays while its old room is clear', () => {
  const plan = letteringPlan(sheets([name(7, '0.0', 'Union Station', [0, 0])], []), { carry: true });
  const label = plan.labels.find((l) => l.kind === 'station-name');
  assert.deepEqual(label.stops.map((s) => s.zoom), [12, 14]);
  assert.equal(label.stops[1].carried, true);
  assert.equal(label.stops[1].retained, true);
  assert.equal(label.stops[1].size, 13, 'the zoom-14 size comes from SIZES, not a fitted median');
  assert.equal(label.stops[1].moved, 0);
  assert.deepEqual(planReport(plan).transitions, [{ from: 12, to: 14, before: 1, after: 1, carried: 1, retained: 1, moved: 0, handovers: 0, gaveWay: 0, added: 0 }]);
  assert.equal(carryFaults(plan).length, 0);
});

test('a new higher-rank label makes a carried list move to its fresh place with a reason', () => {
  const plan = letteringPlan(sheets(
    [list([-100, 2], [100, 2], '0, 1', '0 1')],
    [name(7, '0.0', 'Union Station', [0, 0]), list([-100, 102], [100, 102], '0, 1', '0 1')],
  ), { carry: true });
  const listLabel = plan.labels.find((l) => l.kind === 'route-list');
  assert.equal(listLabel.stops.length, 2);
  assert.ok(listLabel.stops[1].moved > 2);
  assert.match(listLabel.stops[1].why, /no longer fits.*station-name/);
  assert.equal(plan.labels.find((l) => l.kind === 'station-name').stops[0].moved, 0);
  assert.equal(overlapFaults(plan).length, 0);
  assert.equal(carryFaults(plan).length, 0);
});

test('a carried label with nowhere fresh to go ends with a recorded fit reason', () => {
  const plan = letteringPlan(sheets(
    [list([-100, 2], [100, 2], '0, 1', '0 1')],
    [name(7, '0.0', 'Union Station', [0, 0])],
  ), { carry: true });
  const listLabel = plan.labels.find((l) => l.kind === 'route-list');
  assert.deepEqual(listLabel.stops.map((s) => s.zoom), [12]);
  assert.match(listLabel.why, /no longer fits/);
  assert.deepEqual(carryFaults(plan).map((f) => f.kind), ['gave-way'], 'the reason is recorded, but nothing took over');
});

test('the same copy beyond the fresh linker threshold continues instead of becoming a handover', () => {
  const plan = letteringPlan(sheets(
    [list([-100, 0], [100, 0], '0, 1', '0 1')],
    [list([-100, 10], [100, 10], '0, 1', '0 1')],
  ), { carry: true });
  const lists = plan.labels.filter((l) => l.kind === 'route-list');
  assert.equal(lists.length, 1);
  assert.deepEqual(lists[0].stops.map((s) => s.zoom), [12, 14]);
  assert.equal(lists[0].stops[1].carried, true);
  assert.equal(lists[0].stops[1].why, undefined);
  assert.equal(lists[0].stops[1].moved, 0);
});

test('a merged route list hands over to a nearby detailed list instead of duplicating it', () => {
  const plan = letteringPlan(sheets(
    [list([-100, 0], [100, 0], '0, 1', '0 1')],
    [list([-100, 2], [100, 2], '0', '0'), list([-100, 30], [100, 30], '1', '1')],
  ), { carry: true });
  const old = plan.labels.find((l) => l.kind === 'route-list' && l.text === '0, 1');
  assert.deepEqual(old.stops.map((s) => s.zoom), [12]);
  assert.match(old.why, /handover/);
  const child = plan.labels.find((l) => l.parent === old.id);
  assert.equal(child.text, '0');
  assert.match(child.stops[0].why, /handover/);
  assert.equal(carryFaults(plan).length, 0);
});

test('a handover reason belongs only to the stop where the handover happens', () => {
  const plan = letteringPlan([
    drawing(2, 12, [list([-100, 0], [100, 0], '0, 1', '0 1')]),
    drawing(3, 14, [list([-100, 2], [100, 2], '0', '0')]),
    drawing(4, 16, [list([-100, 2], [100, 2], '0', '0')]),
  ], { carry: true });
  const child = plan.labels.find((l) => l.kind === 'route-list' && l.text === '0');
  assert.match(child.stops[0].why, /handover/);
  assert.equal(child.stops[1].why, undefined);
  assert.equal(child.stops[1].carried, true);
});

test('bus street names and both kinds of hall lettering enter the plan with measured ink', () => {
  const features = [
    lineString({ kind: 'bus-street', cls: 'c15', label: 'Test Street', lines: '0' }, [at(-100, 0, 12), at(100, 0, 12)]),
    lineString({ kind: 'hall-name', text: 'Bus concourse' }, [at(-100, 100, 12), at(100, 100, 12)]),
    point({ kind: 'hall-label', text: 'A Bus Station', r: 10 }, at(0, 200, 12)),
  ];
  const plan = letteringPlan([drawing(2, 12, features)], { carry: true });
  const street = plan.labels.find((l) => l.kind === 'street-name');
  assert.equal(street.text, 'Test Street');
  assert.ok(street.stops[0].room[0] > 0);
  assert.equal(plan.labels.find((l) => l.kind === 'hall-name').text, 'BUS CONCOURSE');
  assert.equal(plan.labels.find((l) => l.kind === 'hall-label').text, 'A Bus Station');
  assert.equal(planFaults(plan).length, 0);
});

test('the carried plan from the real map has no overlaps or unexplained changes', { skip: NO_DATA }, () => {
  const drawings = [0, 1, 2, 3, 4].map((id) => ({ id, zoom: [8.75, 10, 12, 14, 16][id], features: JSON.parse(readFileSync(`${DATA}sheet-${id}.geojson`, 'utf8')).features }));
  const plan = letteringPlan(drawings, { carry: true });
  assert.equal(planFaults(plan).length, 0);
  assert.equal(overlapFaults(plan).length, 0);
  // Known faults the stricter rule found (#271): labels that no longer fit at the next zoom and
  // have no successor. Every other carry rule is clean; this list must only shrink.
  const faults = carryFaults(plan);
  assert.deepEqual([...new Set(faults.map((f) => f.kind))].filter(Boolean), faults.length ? ['gave-way'] : [], 'only gave-way faults remain');
  assert.ok(faults.length <= 6, `${faults.length} labels go with no successor (6 known)`);
  assert.equal(droppedLabels(plan).filter((d) => d.why === null).length, 0, 'every drop records why');
  assert.ok(plan.labels.some((l) => l.kind === 'street-name' && l.stops.some((s) => s.carried)), 'real street names carry');
  // Whatever the real map moves, it names the collision (the sizes now leave none; the planted case above pins the rule).
  for (const l of plan.labels) for (const s of l.stops) if (s.why?.startsWith('no longer fits')) assert.match(s.why, /overlaps \S+/, 'a move names its collision');
  assert.ok(plan.labels.some((l) => l.why?.startsWith('handover')), 'real route-list handovers are linked');
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

test('a label that goes for lack of room with nothing taking over is listed as dropped, not as handed over', () => {
  const plan = letteringPlan(sheets([name(7, '0.0', 'Depot', [0, 0])], []));
  plan.labels[0].why = 'no longer fits at zoom 14: overlaps station-name:9:0#1';
  assert.equal(carryFaults(plan).filter((f) => f.kind === 'gave-way').length, 1, 'the reason is recorded but is not a successor');
  assert.deepEqual(droppedLabels(plan).map((d) => d.id), [plan.labels[0].id], 'but it is still a drop');
  // A label with a successor is a handover, not a drop.
  const child = { ...plan.labels[0], id: 'x#2', parent: plan.labels[0].id, from: 14, to: 14 };
  assert.deepEqual(droppedLabels({ ...plan, labels: [...plan.labels, child] }).map((d) => d.id), ['x#2'].filter(() => false).concat([]));
});

test('every later interval of a label that comes back points at the one before it, never at itself', () => {
  const plan = letteringPlan(sheets([name(7, '0.0', 'Depot', [0, 0])], [name(7, '0.0', 'Depot', [0, 0])]), { carry: true });
  for (const l of plan.labels) assert.notEqual(l.parent, l.id, `${l.id} is not its own parent`);
  assert.equal(planFaults(plan).length, 0);
});
