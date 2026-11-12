// The second batch of station-mark, platform-group, walk and station-shape
// detectors (qa/drawn/rail2marks.mjs): for each rule one case that must be
// reported and one that must not, on made-up geometry in screen px (zoom 17
// unless a test says another). The track runs north to south; a mark lies
// across it, so its turn is 0. No browser, no data, no build.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_KINDS, SIZES, markFaults2, structureStyle } from '../qa/drawn/rail2marks.mjs';
import { rail2Faults, RAIL2_KINDS, LEAD_KINDS } from '../qa/drawn/rail2.mjs';
import { toLonLat } from '../qa/drawn/mercator.mjs';

const O = 2 ** 25;
const P = (x, y) => [O + x, O + y];
let next = 0;

// A rail line as the model gives it.
const rail = (route, parts, { width = 9, slot = 0, offset = 0 } = {}) => ({
  layer: 'rail', source: 'routes', index: next++, route, mode: 'rail', slot, offset, properties: { route, mode: 'rail' },
  parts, drawn: parts, width, drawnWidth: width, cap: 'round', opacity: 1,
});
// A line down the screen at x from y0 to y1.
const vl = (route, x, y0 = -300, y1 = 300, opts) => rail(route, [[P(x, y0), P(x, y1)]], opts);

// A picture: `span` lines wide at size 1 (the image has a 1 px margin all round).
const SPAN = { capsule: (n) => [(n - 1) * 11 + 13 + 2, 15], tick: (n) => [(n - 1) * 11 + (n > 1 ? 10 : 8) + 2, (n > 1 ? 10 : 8) + 2], ring: (n) => [(n - 1) * 11 + 12 + 2, (n - 1) * 11 + 12 + 2] };
const mark = ({ id = 1, lines = 'E R T', at = [0, 0], span = 3, type = 'capsule', rot = 0, opacity = 1, size = 1, layer, source = 'stations', props = {}, image } = {}) => {
  const [w, h] = SPAN[type](span);
  return {
    kind: 'icon', layer: layer ?? (source === 'platforms' ? 'platform' : type === 'tick' ? 'stations-dot' : type === 'ring' ? 'stations-hub' : 'stations'), source, index: next++,
    image: image ?? `${{ capsule: 'station', tick: 'dot', ring: 'hub' }[type]}-${span}`, properties: { id, lines, label: 'Test Station', served: true, tickFrom: 9, ...(source === 'platforms' ? { kind: 'mark' } : {}), ...props },
    at: P(...at), size, boxSize: size, w: w * size, h: h * size, rot, anchor: 'center', offset: [0, 0], opacity, box: [0, 0, 0, 0],
  };
};
const zoom = (lines = [], marks = [], extra = {}) => ({ z: 17, lines, marks, areas: [], labels: [], ...extra });
const of = (z, kind, opts = {}) => markFaults2(z, { kinds: [kind], ...opts });
// Three lines side by side down the screen, 11 px apart.
const three = () => [vl('E', -11), vl('R', 0), vl('T', 11)];

test('the kinds the detectors report are the kinds they list, and the leads are among them', () => {
  assert.equal(new Set(MARK_KINDS).size, MARK_KINDS.length);
  for (const k of LEAD_KINDS) assert.ok(RAIL2_KINDS.includes(k), k);
  assert.ok(SIZES.walkWidth.length === 3);
});

// PG03, ST-08, LN-01
test('mark-off-line: a mark with no line of its station under it is reported, one on its lines is not', () => {
  const lines = three();
  assert.deepEqual(of(zoom(lines, [mark()]), 'mark-off-line'), []);
  const far = of(zoom(lines, [mark({ at: [120, 0] })]), 'mark-off-line');
  assert.equal(far.length, 1);
  assert.match(far[0].msg, /in the air/);
  // Its lines are not drawn anywhere near.
  assert.equal(of(zoom([vl('W', 0)], [mark()]), 'mark-off-line').length, 1);
});

// ST-04
test('mark-wide: a mark for three lines over two is reported, three over three is not', () => {
  assert.deepEqual(of(zoom(three(), [mark()]), 'mark-wide'), []);
  const wide = of(zoom([vl('R', 0), vl('T', 11)], [mark()]), 'mark-wide');
  assert.equal(wide.length, 1);
  assert.match(wide[0].msg, /reaches 1[23]\.\d px past the first line/);
});

// ST-03
test('mark-off-centre: a mark 4 px off the middle of its lines is reported, a centred one is not', () => {
  assert.deepEqual(of(zoom(three(), [mark()]), 'mark-off-centre'), []);
  const off = of(zoom(three(), [mark({ at: [4, 0] })]), 'mark-off-centre');
  assert.equal(off.length, 1);
  assert.match(off[0].msg, /4\.0 px off the middle/);
});

// ST-04
test('mark-clips-end: a line that ends at a mark with its stroke out past the side is reported, one inside is not', () => {
  const ending = (x) => [vl('E', -11, -300, 0), vl('R', 0, -300, 0), vl('T', x, -300, 0)];
  assert.deepEqual(of(zoom(ending(11), [mark()]), 'mark-clips-end'), []);
  const out = of(zoom(ending(16), [mark()]), 'mark-clips-end');
  assert.equal(out.length, 1);
  assert.equal(out[0].route, 'T');
});

test('mark-covers-other: a line the station does not serve under the mark is reported, one beside it is not', () => {
  const lines = (x) => [vl('E', -5.5), vl('R', 5.5), vl('W', x)];
  const m = mark({ lines: 'E R', span: 2 });
  const found = of(zoom(lines(0), [m]), 'mark-covers-other');
  assert.equal(found.length, 1);
  assert.equal(found[0].route, 'W');
  assert.deepEqual(of(zoom(lines(60), [m]), 'mark-covers-other'), []);
});

// SM03, ST-07
test('marks-collide: two stations\' marks that overlap are reported, two apart are not; one station\'s marks are SM09\'s', () => {
  const a = mark({ id: 1, span: 1, lines: 'E' }), near = mark({ id: 2, span: 1, lines: 'R', at: [10, 0] }), far = mark({ id: 2, span: 1, lines: 'R', at: [60, 0] });
  assert.equal(of(zoom([], [a, near]), 'marks-collide').length, 1);
  assert.deepEqual(of(zoom([], [a, far]), 'marks-collide'), []);
  assert.deepEqual(of(zoom([], [a, mark({ id: 1, span: 1, lines: 'E', at: [10, 0] })]), 'marks-collide'), []);
});

test('marks-crowded: ticks nearer than the longer mark plus 4 px are reported at zoom 10, not at 17', () => {
  const tick = (id, x) => mark({ id, span: 1, type: 'tick', lines: 'E', at: [x, 0], size: 0.5 });
  const z10 = (xs) => ({ ...zoom([], xs.map((x, i) => tick(i + 1, x))), z: 10 });
  assert.equal(of(z10([0, 6]), 'marks-crowded').length, 1);
  assert.deepEqual(of(z10([0, 14]), 'marks-crowded'), []);
  assert.deepEqual(of(zoom([], [mark({ id: 1, span: 1, lines: 'E' }), mark({ id: 2, span: 1, lines: 'R', at: [18, 0] })]), 'marks-crowded'), []);
});

// SM02
test('tick-parting: a tick across two lines that draw apart along its length is reported, parallel lines are not', () => {
  const tick = mark({ span: 2, type: 'tick', lines: 'E R' });
  const z10 = (r) => ({ ...zoom(r, [tick]), z: 10 });
  const parallel = [vl('E', -5.5), vl('R', 5.5)];
  const parting = [vl('E', -5.5), rail('R', [[P(5.5, -300), P(5.5, 0), P(5.5 + 0.3 * 300, 300)]])];
  assert.deepEqual(of(z10(parallel), 'tick-parting'), []);
  const found = of(z10(parting), 'tick-parting');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /px closer or further apart/);
  // No tick over 11: from there the station is a capsule.
  assert.deepEqual(of({ ...z10(parting), z: 11 }, 'tick-parting'), []);
});

test('dot-for-pack (a lead): a dot where its lines run together is reported, where they part it is not', () => {
  const dot = mark({ span: 1, type: 'tick', lines: 'E R' });
  const z10 = (r) => ({ ...zoom(r, [dot]), z: 10 });
  const found = of(z10([vl('E', -5.5), vl('R', 5.5)]), 'dot-for-pack');
  assert.equal(found.length, 1);
  assert.deepEqual(of(z10([vl('E', -5.5), rail('R', [[P(5.5, -300), P(5.5, 0), P(5.5 + 0.3 * 300, 300)]])]), 'dot-for-pack'), []);
});

// SM04
test('hub-ring: a hub with no ring at zoom 10, a turned ring, a wrong-sized ring and a second ring are reported; the right ring is not', () => {
  const hub = { id: 7, lines: 'E R T', props: { meet: true } };
  const tick = mark({ ...hub, type: 'tick', span: 3 });
  const ring = (extra = {}) => mark({ ...hub, type: 'ring', span: 3, ...extra });
  const z10 = (marks) => ({ ...zoom(three(), marks), z: 10 });
  assert.deepEqual(of(z10([tick, ring()]), 'hub-ring'), []);
  const missing = of(z10([tick]), 'hub-ring');
  assert.equal(missing.length, 1);
  assert.match(missing[0].msg, /no ring/);
  assert.match(of(z10([tick, ring({ rot: 30 })]), 'hub-ring')[0].msg, /turned 30/);
  const big = ring();
  big.w += 8; big.h += 8;
  assert.match(of(z10([tick, big]), 'hub-ring')[0].msg, /across/);
  const other = mark({ id: 8, lines: 'E', type: 'ring', span: 1, props: { meet: false }, at: [100, 0] });
  assert.match(of(z10([tick, ring(), other]), 'hub-ring')[0].msg, /not where the most lines meet/);
  // At 11 and later the capsule has taken over: no ring is due.
  assert.deepEqual(of({ ...z10([tick]), z: 11.5 }, 'hub-ring'), []);
});

// SM05
test('mark-size: a picture the size DESIGN.md states is not reported, one 3 px too long is', () => {
  assert.deepEqual(of(zoom(three(), [mark()]), 'mark-size'), []);
  const long = mark();
  long.w += 3;
  const found = of(zoom(three(), [long]), 'mark-size');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /station-3 is 40\.0 x 15\.0/);
});

test('mark-scale: a mark drawn at 0.8 of its size over lines 11 px apart is reported, at 1 it is not', () => {
  const lines = [rail('E', [[P(-5.5, -300), P(-5.5, 300)]], { slot: -0.5, offset: -5.5 }), rail('R', [[P(5.5, -300), P(5.5, 300)]], { slot: 0.5, offset: 5.5 })];
  assert.deepEqual(of(zoom(lines, [mark({ span: 2, lines: 'E R' })]), 'mark-scale'), []);
  const found = of(zoom(lines, [mark({ span: 2, lines: 'E R', size: 0.8 })]), 'mark-scale');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /8\.80 px apart/);
});

test('mark-fade: a capsule at half strength at zoom 12 is reported, at full it is not', () => {
  const at12 = (o) => ({ ...zoom(three(), [mark({ opacity: o })]), z: 12 });
  assert.deepEqual(of(at12(1), 'mark-fade'), []);
  assert.equal(of(at12(0.5), 'mark-fade').length, 1);
  // Waiting for a stronger station near it (tickFrom 13): not due yet.
  assert.deepEqual(of({ ...zoom(three(), [mark({ opacity: 0, props: { tickFrom: 13 } })]), z: 12 }, 'mark-fade'), []);
});

// ST-05
test('mark-class: two marks of one picture drawn in two sizes are reported, in one size they are not', () => {
  const a = mark({ id: 1, span: 1, lines: 'E' }), b = mark({ id: 2, span: 1, lines: 'R', at: [100, 0] });
  assert.deepEqual(of(zoom([], [a, b]), 'mark-class'), []);
  const big = mark({ id: 2, span: 1, lines: 'R', at: [100, 0] });
  big.w += 3;
  assert.equal(of(zoom([], [a, big]), 'mark-class').length, 1);
});

// SM06
test('unserved-mark: a closed station\'s ring before 13, or with no name from 13, is reported; both from 13 in gray are not', () => {
  const st = { type: 'Feature', properties: { id: 5, label: 'Closed', served: false }, geometry: { type: 'Point', coordinates: toLonLat(P(0, 0), 17) } };
  const ring = (o = 1, stroke = '#9aa5b0') => ({ kind: 'circle', layer: 'stations-unserved', source: 'stations', index: next++, properties: { id: 5, label: 'Closed' }, at: P(0, 0), radius: 5, stroke: 2, strokeColor: stroke, color: 'rgba(255, 255, 255, 0.7)', opacity: o, box: [0, 0, 0, 0] });
  const name = (o = 1, color = '#66717e') => ({ kind: 'text', layer: 'station-labels-unserved', source: 'stations', properties: { id: 5 }, at: P(0, 0), text: 'Closed', opacity: o, color, candidates: [] });
  const data = { stations: { features: [st] } };
  const at = (z, marks, labels) => ({ ...zoom([], marks, { labels }), z });
  assert.deepEqual(of(at(13, [ring()], [name()]), 'unserved-mark', { data }), []);
  assert.match(of(at(12, [ring()], []), 'unserved-mark', { data })[0].msg, /from 13/);
  assert.match(of(at(12, [], [name()]), 'unserved-mark', { data })[0].msg, /name of Closed is drawn/);
  const noName = of(at(14, [ring()], []), 'unserved-mark', { data });
  assert.equal(noName.length, 1);
  assert.match(noName[0].msg, /no name/);
  assert.match(of(at(14, [ring(1, '#d03030')], [name()]), 'unserved-mark', { data })[0].msg, /not gray/);
  // Nothing drawn before 13 is right.
  assert.deepEqual(of(at(12, [ring(0)], [name(0)]), 'unserved-mark', { data }), []);
});

// SM10
test('mark-off-building: a mark 200 m from its station building is reported, one beside it is not', () => {
  const ring = (cx, cy) => [[cx - 30, cy - 30], [cx + 30, cy - 30], [cx + 30, cy + 30], [cx - 30, cy + 30], [cx - 30, cy - 30]].map(([x, y]) => toLonLat(P(x, y), 17));
  const data = (cx) => ({ structures: { features: [{ type: 'Feature', properties: { kind: 'building', station: '1' }, geometry: { type: 'Polygon', coordinates: [ring(cx, 0)] } }] } });
  const m = mark({ id: 1, span: 1, lines: 'E' });
  assert.deepEqual(of(zoom([vl('E', 0)], [m]), 'mark-off-building', { data: data(40) }), []);
  const far = of(zoom([vl('E', 0)], [m]), 'mark-off-building', { data: data(400) });
  assert.equal(far.length, 1);
  assert.match(far[0].msg, /stands \d+ m from its station building/);
});

// ST-09
test('mark-far-from-stop: a mark 300 m from its nearest rail platform stop is reported, 30 m is not', () => {
  const stop = (x) => ({ type: 'Feature', properties: { platform: 1, lines: 'E' }, geometry: { type: 'Point', coordinates: toLonLat(P(x, 0), 17) } });
  const m = mark({ span: 1, lines: 'E' });
  assert.deepEqual(of(zoom([vl('E', 0)], [m]), 'mark-far-from-stop', { data: { stops: { features: [stop(50)] } } }), []);
  assert.equal(of(zoom([vl('E', 0)], [m]), 'mark-far-from-stop', { data: { stops: { features: [stop(500)] } } }).length, 1);
});

// SM11
test('facility-covers-station: a Park-n-Ride sign over a station mark is reported, one up and left of it is not', () => {
  const sign = (x, y) => ({ kind: 'icon', layer: 'facilities', source: 'facilities', index: next++, image: 'parking', properties: { name: 'Lot' }, at: P(x, y), opacity: 1, box: [O + x - 8, O + y - 8, O + x + 8, O + y + 8] });
  const m = mark({ span: 1, lines: 'E' });
  assert.equal(of(zoom([], [m, sign(0, 0)]), 'facility-covers-station').length, 1);
  assert.deepEqual(of(zoom([], [m, sign(-30, -30)]), 'facility-covers-station'), []);
});

// PG04, ST-02
const walkScene = ({ width = 2.6, dash = [0.01, 2.1], endShift = 0, groupRot = 90, z = 16 } = {}) => {
  const walk = { layer: 'platform-joins', source: 'platforms', index: next++, properties: { kind: 'join', id: 1 }, parts: [[P(0, 0), P(200 + endShift, 0)]], drawn: [[P(0, 0), P(200 + endShift, 0)]], width, drawnWidth: width, dash, cap: 'round', opacity: 0.9 };
  const own = mark({ id: 1, span: 2, lines: 'A B C', rot: 90 });
  const group = mark({ id: 1, span: 2, lines: 'C', source: 'platforms', at: [200, 0], rot: groupRot });
  return { ...zoom([walk], [own, group]), z };
};
test('walk-dots: dots 2.6 px across at zoom 16, two and a bit apart, are not reported; a hairline and fat dots are', () => {
  assert.deepEqual(of(walkScene(), 'walk-dots'), []);
  assert.match(of(walkScene({ width: 4 }), 'walk-dots')[0].msg, /4\.00 px across at zoom 16; DESIGN\.md has 2\.60/);
  assert.match(of(walkScene({ dash: null }), 'walk-dots')[0].msg, /not a row of dots/);
  assert.match(of(walkScene({ dash: [0.01, 4] }), 'walk-dots')[0].msg, /widths apart/);
  // Zoom 13 wants 2 px, and the 1.4 px of zoom 10 is not 2.6.
  assert.deepEqual(of(walkScene({ z: 13, width: 2 }), 'walk-dots'), []);
  assert.equal(of(walkScene({ z: 10, width: 2.6 }), 'walk-dots').length, 1);
});

test('walk-end: a walk that ends at both marks is not reported, one that stops 12 px short is', () => {
  assert.deepEqual(of(walkScene(), 'walk-end'), []);
  const found = of(walkScene({ endShift: -12 }), 'walk-end');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /12\.0 px from a mark/);
});

test('walk-oblique: marks square to the walk are not reported, one turned 30 degrees is', () => {
  assert.deepEqual(of(walkScene(), 'walk-oblique'), []);
  const found = of(walkScene({ groupRot: 60 }), 'walk-oblique');
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /30\.0 degrees off square/);
});

// PG05
test('name-on-walk: a station name placed over the walk, or twice, is reported; a name beside the mark is not', () => {
  const label = (box, id = 1) => ({ kind: 'text', layer: 'station-labels', source: 'stations', properties: { id }, at: P(0, 0), text: 'Union', opacity: 1, candidates: [{ anchor: 'center', offset: [0, 0], box }] });
  const s = walkScene();
  const over = label([O + 80, O - 6, O + 130, O + 6]);
  const beside = label([O + 80, O + 20, O + 130, O + 32]);
  assert.equal(of({ ...s, labels: [over] }, 'name-on-walk').length, 1);
  assert.deepEqual(of({ ...s, labels: [beside] }, 'name-on-walk'), []);
  const twice = of({ ...s, labels: [beside, label([O + 150, O + 20, O + 200, O + 32])] }, 'name-on-walk');
  assert.equal(twice.length, 1);
  assert.match(twice[0].msg, /named 2 times/);
});

// LN-03, LN-06
test('bent-through-station: a line that turns 20 degrees across a mark is reported, a straight one is not', () => {
  const m = mark({ span: 1, lines: 'E' });
  const t = Math.tan((20 * Math.PI) / 180);
  assert.deepEqual(of(zoom([vl('E', 0)], [m]), 'bent-through-station'), []);
  const bent = of(zoom([rail('E', [[P(0, -300), P(0, 0), P(300 * t, 300)]])], [m]), 'bent-through-station');
  assert.equal(bent.length, 1);
  assert.match(bent[0].msg, /E turns 20\.0 degrees across/);
});

// SS05
test('structure-style: the building, platforms and canopy as fills in order and from their zooms are not reported; an outline, a wrong zoom and a wrong order are', () => {
  const layer = (id, minzoom, type = 'fill') => ({ id, type, source: 'structures', minzoom, paint: {} });
  const ok = { layers: [layer('station-building', 13), layer('station-platform', 14.2), layer('station-canopy', 14.2)] };
  assert.deepEqual(structureStyle(ok), []);
  assert.match(structureStyle({ layers: [...ok.layers, layer('station-outline', 14, 'line')] })[0].msg, /outline/);
  assert.match(structureStyle({ layers: [layer('station-building', 12), layer('station-platform', 14.2), layer('station-canopy', 14.2)] })[0].msg, /start at zoom 12/);
  assert.match(structureStyle({ layers: [layer('station-canopy', 14.2), layer('station-platform', 14.2), layer('station-building', 13)] })[0].msg, /not drawn building, then platform, then canopy/);
});

test('rail2Faults runs both batches and holds the leads back', () => {
  const z = zoom([vl('E', 0), vl('R', 0)], [mark({ span: 1, lines: 'E R' })]);
  const faults = rail2Faults(z);
  assert.ok(faults.some((f) => f.kind === 'overlap'));
  assert.ok(faults.every((f) => !LEAD_KINDS.has(f.kind)));
  assert.ok(faults.every((f) => f.px.length === 2 && typeof f.msg === 'string'));
});
