// Bus streets, terminals and stops, drawn (qa/drawn/buslines.mjs and
// buslines-style.mjs): for each rule one case that must be reported and one
// that must not, on made-up geometry at zoom 16 in Denver (0.92 m per px
// there), no browser and no data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toWorld } from '../qa/drawn/mercator.mjs';
import {
  APPLIES_FROM, arrowFaults, arrowsOn, besideFaults, braids, busFaults, chainsOf, graphOf, hallFaults, lineEnds, stopsOffLine, streetsOf,
  strandFaults, turnFaults, wedges, widthSteps,
} from '../qa/drawn/buslines.mjs';
import { DEFAULTS, styleFaults } from '../qa/drawn/buslines-style.mjs';

const Z = 16;
const [X, Y] = toWorld([-104.99, 39.74], Z);
const pt = (x, y) => [X + x, Y + y];
const MPP = 0.92;

let n = 0;
// A street the way the model gives one: the page's own layer, the build's own numbers.
const street = (routes, part, o = {}) => ({
  layer: o.layer ?? 'street', source: 'streets', index: o.index ?? n++, mode: 'bus',
  properties: { routes, mode: 'bus', n: o.n ?? 1, pt: o.pt ?? 0, cls: o.cls ?? 'c15', len: o.len ?? Math.round(part.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - part[i - 1][0], p[1] - part[i - 1][1]) : 0), 0) * MPP), oneway: o.oneway ? 1 : undefined, zoom: o.tag, bph: o.bph },
  parts: [part], drawn: [o.drawn ?? part], drawnWidth: o.w ?? 5.2, width: o.w ?? 5.2, opacity: o.opacity ?? 1, offset: 0, cap: o.cap ?? 'round', dash: o.dash ?? null,
});
const stop = (id, at, lines, name = `Stop ${id}`, layer = 'stops') => ({ kind: 'circle', layer, source: 'stops', index: id, at, radius: 2.4, stroke: 1, properties: { id, name, lines } });
const station = (at, buses, name = 'Station') => ({ kind: 'icon', layer: 'stations', source: 'stations', index: 0, at, box: [at[0] - 4, at[1] - 4, at[0] + 4, at[1] + 4], properties: { name, buses } });
const hall = (parts, name = 'Hall') => ({ layer: 'bus-terminal', source: 'terminals', index: 0, name, parts, opacity: 1, color: '#e3e6ea' });
const zoom = (lines, marks = [], areas = [], z = Z) => ({ z, lines, marks, areas, labels: [] });
const kinds = (found) => found.map((f) => f.kind);

// --- line ends -----------------------------------------------------------------

test('a wide street ending in the open is a blob; a thin one, or one whole on its hall, is not', () => {
  const wide = street('FreeRide', [pt(0, 0), pt(100, 0)], { w: 14, cls: 'c3' });
  assert.deepEqual(kinds(lineEnds(zoom([wide])).filter((f) => f.kind === 'end-blob')), ['end-blob', 'end-blob']);
  const thin = street('104', [pt(0, 0), pt(100, 0)], { w: 2, cls: 'c60' });
  assert.deepEqual(lineEnds(zoom([thin])).filter((f) => f.kind === 'end-blob'), []);
  // Its far end wholly inside a hall (the near end, at x 0, is another matter).
  const east = (found) => found.filter((f) => f.kind === 'end-blob' && f.px[0] > X + 50);
  const big = hall([[pt(60, -30), pt(160, -30), pt(160, 30), pt(60, 30), pt(60, -30)]]);
  assert.deepEqual(east(lineEnds(zoom([wide], [], [big]))), []);
  // Its end on the hall's edge, the cap half outside: reported again.
  const edge = hall([[pt(100, 0), pt(160, -40), pt(220, 0), pt(160, 40), pt(100, 0)]]);
  const found = east(lineEnds(zoom([wide], [], [edge])));
  assert.equal(found.length, 1);
  assert.ok(found[0].outOfHall > 5, `${found[0].outOfHall}`);
});

test('a thick street ending on a thinner one stands out of it; a thin one ending on a thick one does not', () => {
  const stem = street('FreeRide', [pt(0, -80), pt(0, 0)], { w: 14, cls: 'c3' });
  const v = [street('15', [pt(0, 0), pt(60, -60)], { w: 10, cls: 'c5' }), street('15', [pt(0, 0), pt(60, 60)], { w: 10, cls: 'c5' })];
  const found = lineEnds(zoom([stem, ...v])).filter((f) => f.kind === 'end-bulge');
  assert.equal(found.length, 1);
  assert.ok(found[0].stand > 1.5);
  const thin = street('15', [pt(0, -80), pt(0, 0)], { w: 5.2 });
  const thick = [street('FreeRide', [pt(-60, 0), pt(0, 0)], { w: 14, cls: 'c3' }), street('FreeRide', [pt(0, 0), pt(60, 0)], { w: 14, cls: 'c3' })];
  assert.deepEqual(lineEnds(zoom([thin, ...thick])).filter((f) => f.kind === 'end-bulge'), []);
});

test('a line that stops short of the stop it is heading for is reported; one that ends at its stop is not', () => {
  const line = street('483', [pt(0, 0), pt(100, 0)], { w: 2, cls: 'c60' });
  const home = stop(9, pt(-3, 3), '483', 'Start');
  const ahead = stop(1, pt(160, 6), '483', 'Gate B');
  const found = lineEnds(zoom([line], [home, ahead])).filter((f) => f.kind === 'end-short');
  assert.equal(found.length, 1);
  assert.ok(found[0].gapM > 40, `${found[0].gapM}`);
  const at = stop(1, pt(104, 4), '483');
  assert.deepEqual(lineEnds(zoom([line], [home, at])).filter((f) => /end-/.test(f.kind) && f.kind !== 'end-blob'), []);
  // A stop of another route does not count; a station of its own does.
  assert.equal(lineEnds(zoom([line], [home, stop(1, pt(160, 6), '12')])).filter((f) => f.kind === 'end-in-air').length, 1);
  assert.equal(lineEnds(zoom([line], [home, station(pt(150, 20), '483')])).filter((f) => f.kind === 'end-short').length, 1);
});

test('a line with nothing of its own near its end ends in the air; one past its last stop does not', () => {
  const line = street('104', [pt(0, 0), pt(100, 0)], { w: 2, cls: 'c60' });
  assert.equal(lineEnds(zoom([line], [stop(1, pt(-300, 0), '104')])).filter((f) => f.kind === 'end-in-air').length, 2);
  const stops = [stop(1, pt(10, 5), '104'), stop(2, pt(90, 5), '104')];
  assert.deepEqual(lineEnds(zoom([line], stops)).filter((f) => f.kind === 'end-in-air' || f.kind === 'end-short'), []);
});

// --- width -----------------------------------------------------------------------

const run = (routes, x0, x1, o = {}) => street(routes, [pt(x0, 0), pt(x1, 0)], o);

test('a width that changes between streets with the same routes and no junction is reported', () => {
  const found = widthSteps(zoom([run('104L AB', 0, 200, { w: 2, cls: 'c60' }), run('104L AB', 200, 400, { w: 3.4, cls: 'c30' })]));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'width-step');
  assert.equal(found[0].sameRoutes, true);
  assert.deepEqual(widthSteps(zoom([run('104L AB', 0, 200, { w: 2, cls: 'c60' }), run('104L AB', 200, 400, { w: 2, cls: 'c60' })])), []);
});

test('a width that changes where a route leaves at its stop is not reported; with no stop it is', () => {
  const a = run('1 2', 0, 200, { w: 5.2 }), b = run('1', 200, 400, { w: 3.4, cls: 'c30' });
  assert.equal(widthSteps(zoom([a, b])).length, 1);
  assert.deepEqual(widthSteps(zoom([a, b], [stop(1, pt(205, 10), '2')])), []);
  // At a junction (a third street meets) it is not a step at all.
  assert.deepEqual(widthSteps(zoom([a, b, street('9', [pt(200, 0), pt(200, 100)])])), []);
});

test('a short thick stretch in a thin line is one blip, a long one is not', () => {
  const thin = (x0, x1) => run('104L AB', x0, x1, { w: 2, cls: 'c60' });
  const thick = (x0, x1) => run('104L AB', x0, x1, { w: 3.4, cls: 'c30' });
  const blip = widthSteps(zoom([thin(0, 200), thick(200, 260), thin(260, 460)]));
  assert.deepEqual(kinds(blip), ['class-blip']);
  assert.ok(blip[0].lengthM > 40 && blip[0].lengthM < 60, `${blip[0].lengthM}`);
  // 400 px is 370 m: a real change of class, two steps and no blip.
  assert.deepEqual(kinds(widthSteps(zoom([thin(0, 200), thick(200, 600), thin(600, 800)]))), ['width-step', 'width-step']);
});

// --- wedges and slivers --------------------------------------------------------------

test('two thick streets that fork at a small angle leave a wedge of land; at a right angle they do not', () => {
  const fork = (deg) => {
    const r = (deg * Math.PI) / 360;
    return [street('A', [pt(0, 0), pt(200 * Math.cos(r), 200 * Math.sin(r))], { w: 10, cls: 'c5' }), street('B', [pt(0, 0), pt(200 * Math.cos(r), -200 * Math.sin(r))], { w: 10, cls: 'c5' })];
  };
  const found = wedges(zoom(fork(24)));
  assert.equal(found.filter((f) => f.kind === 'bus-wedge').length, 1);
  assert.ok(found.find((f) => f.kind === 'bus-wedge').runPx >= 8);
  assert.deepEqual(wedges(zoom(fork(90))), []);
  // The same fork of thin streets has no wedge anyone sees.
  const thin = fork(24).map((s) => ({ ...s, drawnWidth: 2, width: 2 }));
  assert.deepEqual(wedges(zoom(thin)), []);
});

test('two streets side by side with a hairline of land between them are a sliver; with a clear gap they are not', () => {
  const pair = (apart) => [street('A', [pt(0, 0), pt(200, 0)], { w: 8, cls: 'c10' }), street('B', [pt(0, apart), pt(200, apart)], { w: 8, cls: 'c10' })];
  const found = wedges(zoom(pair(8.8)));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'bus-sliver');
  assert.ok(found[0].minGap < 1.5);
  assert.deepEqual(wedges(zoom(pair(16))), []);
  assert.deepEqual(wedges(zoom(pair(8))), []); // touching: one line
});

// --- braids and overlaps ---------------------------------------------------------------

test('two streets that cross at a shallow angle with no node there are a braid; at a right angle, or at a node, they are not', () => {
  const a = street('FF', [pt(0, 0), pt(300, 20)]);
  const b = street('FF', [pt(0, 20), pt(300, 0)]);
  const found = braids(zoom([a, b]));
  assert.equal(found.filter((f) => f.kind === 'braid').length, 1);
  assert.ok(found.find((f) => f.kind === 'braid').angle < 10);
  assert.deepEqual(braids(zoom([street('FF', [pt(0, 0), pt(300, 0)]), street('FF', [pt(150, -100), pt(150, 100)])])), []);
  // The same two streets meeting at a node: A ends where B passes.
  assert.deepEqual(braids(zoom([street('FF', [pt(0, 0), pt(150, 10)]), street('FF', [pt(150, 10), pt(300, 20)]), street('FF', [pt(0, 20), pt(150, 10), pt(300, 0)])])).filter((f) => f.kind === 'braid'), []);
});

test('a street drawn twice a little apart is an overlap; the same line twice, or two lines clear of each other, is not', () => {
  const a = street('FF', [pt(0, 0), pt(200, 0)], { w: 8 });
  const found = braids(zoom([a, street('FF', [pt(0, 3), pt(200, 3)], { w: 8 })]));
  assert.equal(found.filter((f) => f.kind === 'street-overlap').length, 1);
  assert.deepEqual(braids(zoom([a, street('FF', [pt(0, 0), pt(200, 0)], { w: 8 })])), []);
  assert.deepEqual(braids(zoom([a, street('FF', [pt(0, 12), pt(200, 12)], { w: 8 })])), []);
});

// --- stops --------------------------------------------------------------------------------

test('a stop with no line of its routes near it is reported, from the whole map; one at its curb is not', () => {
  const line = street('31', [pt(0, 0), pt(300, 0)]);
  const near = stop(1, pt(100, 8), '31'), far = stop(2, pt(100, 120), '31', 'Gate C'), wrong = stop(3, pt(100, 8), '72', 'Other route');
  const found = stopsOffLine(zoom([line], [near, far, wrong]));
  assert.deepEqual(found.map((f) => f.id).sort(), [2, 3]);
  assert.ok(found.find((f) => f.id === 2).nearestM > 100);
  assert.equal(found.find((f) => f.id === 3).nearestM, null);
});

test('a gate inside a hall is not judged against the streets; one just outside it is', () => {
  const big = hall([[pt(50, 100), pt(150, 100), pt(150, 200), pt(50, 200), pt(50, 100)]]);
  const line = street('31', [pt(0, 0), pt(300, 0)]);
  assert.deepEqual(stopsOffLine(zoom([line], [stop(1, pt(100, 150), '31', 'Gate 1')], [big])), []);
  const out = stopsOffLine(zoom([line], [stop(2, pt(100, 230), '31', 'Gate 2')], [big]));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'hall-stray-stop');
});

// --- the part-time hairline, strands, the core ---------------------------------------------

const beside = (feature, drawn, o = {}) => ({ ...street(feature.properties.routes, feature.parts[0], { layer: 'street-part-time-beside', index: feature.index, w: 0.6, n: feature.properties.n, pt: 1, dash: [3, 2], drawn }), drawnWidth: o.w ?? 0.6, width: o.w ?? 0.6 });

test('a part-time hairline 2.2 px clear of its street is right; touching it or a long way off is not', () => {
  const s = street('1 5', [pt(0, 0), pt(200, 0)], { w: 7.2, pt: 1, cls: 'c10' });
  const at = (gap) => { const y = 3.6 + 0.3 + gap; return [pt(0, y), pt(200, y)]; };
  assert.deepEqual(besideFaults(zoom([s, beside(s, at(2.2))])), []);
  assert.deepEqual(kinds(besideFaults(zoom([s, beside(s, at(0))]))), ['beside-gap']);
  assert.deepEqual(kinds(besideFaults(zoom([s, beside(s, at(6))]))), ['beside-gap']);
});

test('a part-time hairline lying under another street is reported', () => {
  const s = street('1 5', [pt(0, 0), pt(200, 0)], { w: 7.2, pt: 1, cls: 'c10' });
  const other = street('9', [pt(0, 6), pt(200, 6)], { w: 7.2, cls: 'c10' });
  const h = beside(s, [pt(0, 6.1), pt(200, 6.1)]);
  assert.ok(kinds(besideFaults(zoom([s, other, h]))).includes('beside-covered'));
  assert.ok(!kinds(besideFaults(zoom([s, beside(s, [pt(0, 6.1), pt(200, 6.1)])]))).includes('beside-covered'));
});

test('a part-time hairline that hops to the other side of the street at a joint is reported; one that carries on is not', () => {
  const a = street('1 5', [pt(0, 0), pt(200, 0)], { w: 7.2, pt: 1, cls: 'c10' });
  const b = street('1 5', [pt(200, 0), pt(400, 0)], { w: 7.2, pt: 1, cls: 'c10' });
  const y = 3.6 + 0.3 + 2.2;
  const same = [beside(a, [pt(0, y), pt(200, y)]), beside(b, [pt(200, y), pt(400, y)])];
  assert.deepEqual(besideFaults(zoom([a, b, ...same])), []);
  const hop = [beside(a, [pt(0, y), pt(200, y)]), beside(b, [pt(200, -y), pt(400, -y)])];
  assert.deepEqual(kinds(besideFaults(zoom([a, b, ...hop]))), ['beside-hop']);
});

const seam = (feature, k, ys, layer = 'street-strand-1') => ({ ...street(feature.properties.routes, feature.parts[0], { layer, index: feature.index, w: 0.8, drawn: feature.parts[0].map((p) => [p[0], p[1] + ys]) }), drawnWidth: 0.8, width: 0.8, k });

test('a street with three routes and one seam is reported; with two seams it is not', () => {
  const s = street('1 2 3', [pt(0, 0), pt(200, 0)], { w: 12, n: 3, cls: 'c5' });
  const one = strandFaults(zoom([s, seam(s, 1, -2, 'street-strand-1')], [], [], 14));
  assert.deepEqual(kinds(one), ['strand-count']);
  assert.deepEqual(strandFaults(zoom([s, seam(s, 1, -2, 'street-strand-1'), seam(s, 2, 2, 'street-strand-2')], [], [], 14)), []);
});

test('a seam that steps sideways where two streets of the same routes meet is reported; one that carries on is not', () => {
  const a = street('1 2', [pt(0, 0), pt(200, 0)], { w: 8, n: 2 }), b = street('1 2', [pt(200, 0), pt(400, 0)], { w: 8, n: 2 });
  const fine = [seam(a, 1, 0), seam(b, 1, 0)];
  assert.deepEqual(strandFaults(zoom([a, b, ...fine], [], [], 14)), []);
  assert.deepEqual(kinds(strandFaults(zoom([a, b, seam(a, 1, -2), seam(b, 1, 2)], [], [], 14))), ['strand-step']);
});

test('a street of seven routes needs a core a third of its width; six routes need none', () => {
  const s7 = street('1 2 3 4 5 6 7', [pt(0, 0), pt(200, 0)], { w: 14, n: 7, cls: 'c3' });
  const core = (w) => ({ ...street('1 2 3 4 5 6 7', s7.parts[0], { layer: 'street-core', index: s7.index, w }), drawnWidth: w, width: w });
  assert.deepEqual(kinds(strandFaults(zoom([s7], [], [], 15))), ['core-wrong']);
  assert.deepEqual(strandFaults(zoom([s7, core(14 * 0.34)], [], [], 15)), []);
  assert.deepEqual(kinds(strandFaults(zoom([s7, core(8)], [], [], 15))), ['core-wrong']);
  const s6 = street('1 2 3 4 5 6', [pt(0, 300), pt(200, 300)], { w: 14, n: 6, cls: 'c3' });
  assert.deepEqual(strandFaults(zoom([s6], [], [], 15)), []);
  assert.deepEqual(kinds(strandFaults(zoom([s6, { ...core(4.8), index: s6.index }], [], [], 15))), ['core-wrong']);
});

// --- one-way arrows -------------------------------------------------------------------------

test('arrows are placed about every 300 px, the spacing growing by the fraction of the zoom', () => {
  assert.deepEqual(arrowsOn(700, 16), [32, 332, 632]);
  assert.equal(arrowsOn(700, 16.5).length, 2);
});

test('two one-way streets side by side going opposite ways, both with arrows, are reported; a lone one-way street is not', () => {
  const east = street('1', [pt(0, 0), pt(600, 0)], { oneway: true, len: 550 }), west = street('1', [pt(600, 20), pt(0, 20)], { oneway: true, len: 550 });
  assert.deepEqual(kinds(arrowFaults(zoom([east, west]))), ['arrow-twin']);
  assert.deepEqual(arrowFaults(zoom([east])), []);
  assert.deepEqual(arrowFaults(zoom([east, { ...west, parts: [[pt(600, 400), pt(0, 400)]] }])), []);
});

test('arrows bunched where one-way streets meet are reported; evenly spread ones are not', () => {
  const pair = (lenA) => [street('1', [pt(0, 0), pt(lenA, 0)], { oneway: true, len: 400 }), street('1', [pt(lenA, 0), pt(lenA + 700, 0)], { oneway: true, len: 600 })];
  assert.deepEqual(kinds(arrowFaults(zoom(pair(640)))), ['arrow-bunched']);
  assert.deepEqual(arrowFaults(zoom(pair(900))), []);
  // Under 250 m the page draws none: not judged.
  assert.deepEqual(arrowFaults(zoom([street('1', [pt(0, 0), pt(100, 0)], { oneway: true, len: 100 })])), []);
});

// --- ramps and loops ----------------------------------------------------------------------

const junctionWith = (at) => [street('x', [at, pt(at[0] - 100, at[1] - 100)]), street('y', [at, pt(at[0] + 100, at[1] - 100)])];

test('a stretch three times longer than its chord between two junctions is a ramp drawn as driven; a straight one, or one riders board, is not', () => {
  const a = pt(0, 0), b = pt(60, 0);
  const curl = street('3 4', [a, pt(0, 90), pt(60, 90), b]);
  const around = [curl, ...junctionWith(a), ...junctionWith(b)];
  const found = turnFaults(zoom(around));
  assert.deepEqual(kinds(found), ['ramp-curl']);
  assert.ok(found[0].ratio > 2.5);
  assert.deepEqual(turnFaults(zoom([street('3 4', [a, b]), ...junctionWith(a), ...junctionWith(b)])), []);
  assert.deepEqual(turnFaults(zoom(around, [stop(1, pt(30, 95), '3')])), []);
});

test('a stretch that leaves a junction and comes back to it is a loop; a street corner, or a ring that is the whole line, is not', () => {
  const at = pt(0, 0);
  const loop = (r) => street('7', [at, pt(r, 0), pt(r, r), pt(0, r), at]);
  assert.deepEqual(kinds(turnFaults(zoom([loop(80), ...junctionWith(at)]))), ['loop']);
  assert.deepEqual(turnFaults(zoom([loop(10), ...junctionWith(at)])), []);
  assert.deepEqual(turnFaults(zoom([loop(80)])), []);
});

// --- halls ------------------------------------------------------------------------------------

const lonLatBox = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const feature = (geometry, properties) => ({ type: 'Feature', geometry, properties });
const hallData = (gateAt) => ({
  terminals: { features: [feature({ type: 'Polygon', coordinates: lonLatBox(-104.9905, 39.7395, -104.9895, 39.7405) }, { id: '82', name: 'Civic', gates: 2 })] },
  facilities: { features: [feature({ type: 'Point', coordinates: [-104.9900, 39.7400] }, { id: 82, name: 'Civic Center Station', class: 'BUS' }), feature({ type: 'Point', coordinates: [-104.9800, 39.7400] }, { id: 83, name: 'Airport Station', class: 'STN' })] },
  stops: { features: [feature({ type: 'Point', coordinates: [-104.9900, 39.7400] }, { id: 1, name: 'Civic Gate 1', gate: 1, lines: 'A' }), feature({ type: 'Point', coordinates: gateAt }, { id: 2, name: 'Civic Gate 2', gate: 1, lines: 'B' }), feature({ type: 'Point', coordinates: [-104.9801, 39.7400] }, { id: 3, name: 'Airport Gate 6', lines: 'C' }), feature({ type: 'Point', coordinates: [-104.9799, 39.7401] }, { id: 4, name: 'Airport Gate 7', lines: 'C' })] },
});

test('a gate of a hall that stands outside it is reported, and so is a bus station with gates and no hall', () => {
  const found = hallFaults(zoom([]), { data: hallData([-104.9888, 39.7400]) });
  assert.deepEqual(kinds(found).sort(), ['hall-gate-outside', 'hall-missing']);
  assert.equal(found.find((f) => f.kind === 'hall-gate-outside').id, 2);
  const clean = hallFaults(zoom([]), { data: hallData([-104.9900, 39.7401]) });
  assert.deepEqual(kinds(clean), ['hall-missing']);
});

// --- all of them, from their zoom ----------------------------------------------------------------

test('a kind is judged from the zoom it applies from', () => {
  const sceneAt = (z) => {
    const [x, y] = toWorld([-104.99, 39.74], z);
    const a = [x, y], b = [x + 400 * 2 ** (z - 16), y];
    return zoom([{ ...street('483', [a, b], { w: 2, cls: 'c60' }) }], [stop(1, [b[0] + 150 * 2 ** (z - 16), b[1]], '483', 'Far')], [], z);
  };
  const shorts = (z, opts) => busFaults(sceneAt(z), opts).filter((f) => f.kind === 'end-short').length;
  assert.ok(shorts(APPLIES_FROM['end-short']) >= 1);
  assert.equal(shorts(APPLIES_FROM['end-short'] - 1), 0);
  assert.ok(shorts(APPLIES_FROM['end-short'] - 1, { applyFrom: {} }) >= 1);
});

// --- the style rules -------------------------------------------------------------------------------

// A fake model: a class's streets at the widths a zoom gives them.
const fakeModel = ({ widths, rail = 9, opacity = {}, areas = [], style = null, data = {}, marks = [], labels = [], extra = [] }) => {
  const classes = [['c3', 20], ['c5', 12], ['c10', 6], ['c15', 4], ['c30', 2], ['c60', 0]];
  return {
    ZOOMS: [10],
    data,
    style: style ?? { layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#f4f5f6' } }, { id: 'street', type: 'line', source: 'streets' }, { id: 'rail', type: 'line', source: 'routes' }] },
    zoom: (z) => ({
      z,
      lines: [
        ...classes.map(([id, bph], i) => ({ ...street(String(i + 1), [pt(0, i * 30), pt(100, i * 30)], { cls: id, w: widths[i], bph }), opacity: opacity[id] ?? 1 })),
        { layer: 'rail', source: 'routes', index: 99, route: 'A', mode: 'rail', properties: { mode: 'rail' }, parts: [[pt(0, 300), pt(100, 300)]], drawn: [[pt(0, 300), pt(100, 300)]], drawnWidth: rail, width: rail, opacity: 1 },
        ...extra,
      ],
      marks, labels, areas,
    }),
  };
};
const at16 = [14, 10, 7.2, 5.2, 3.4, 2];

test('a class that is not one width, or is narrower than a quieter class, is reported', () => {
  assert.deepEqual(styleFaults(fakeModel({ widths: at16 }), 16), []);
  const twin = fakeModel({ widths: at16 });
  const z = twin.zoom;
  twin.zoom = (zz) => { const m = z(zz); m.lines.push({ ...street('x', [pt(0, 500), pt(100, 500)], { cls: 'c3', w: 12, bph: 22 }) }); return m; };
  assert.ok(kinds(styleFaults(twin, 16)).includes('class-width'));
  assert.ok(kinds(styleFaults(fakeModel({ widths: [10, 14, 7.2, 5.2, 3.4, 2] }), 16)).includes('class-width'));
});

test('classes closer than a step of 1.2 times are reported', () => {
  assert.deepEqual(kinds(styleFaults(fakeModel({ widths: [14, 10, 7.2, 5.2, 3.4, 3.2] }), 16)), ['class-step']);
});

test('a class is drawn from the zoom it comes in at and not before', () => {
  const only = (found, kind) => kinds(found).filter((k) => k === kind);
  const m = (opacity) => fakeModel({ widths: at16, rail: 14, opacity });
  assert.deepEqual(only(styleFaults(m({ c30: 0, c60: 0 }), 10), 'class-zoom'), ['class-zoom']);
  assert.deepEqual(only(styleFaults(m({ c60: 0 }), 10), 'class-zoom'), []);
  assert.deepEqual(only(styleFaults(m({ c30: 0, c60: 1 }), 9), 'class-zoom'), ['class-zoom']);
});

test('the busiest street narrower than rail close in is reported; wider, or about equal in the overview, is not', () => {
  const rails = (found) => kinds(found).filter((k) => k === 'class-vs-rail');
  assert.deepEqual(rails(styleFaults(fakeModel({ widths: [7, 5, 3.6, 2.6, 1.7, 1], rail: 9 }), 16)), ['class-vs-rail']);
  assert.deepEqual(rails(styleFaults(fakeModel({ widths: at16, rail: 9 }), 16)), []);
  const overview = [2.8, 2.1, 1.6, 1.2, 0.8, 0.45];
  assert.deepEqual(rails(styleFaults(fakeModel({ widths: overview, rail: 3.4 }), 11.5, { from: [0, 0, 0, 0, 0, 0] })), []);
  assert.deepEqual(rails(styleFaults(fakeModel({ widths: overview, rail: 9 }), 11.5, { from: [0, 0, 0, 0, 0, 0] })), ['class-vs-rail']);
});

test('a street layer drawn after rail is reported', () => {
  const layers = [{ id: 'rail', type: 'line', source: 'routes' }, { id: 'street', type: 'line', source: 'streets' }, { id: 'land', type: 'background', paint: { 'background-color': '#f4f5f6' } }];
  const order = (m) => kinds(styleFaults(m, 11, { orderAt: 11 })).filter((k) => k === 'draw-order');
  assert.deepEqual(order(fakeModel({ widths: at16, rail: 14, style: { layers } })), ['draw-order']);
  assert.deepEqual(order(fakeModel({ widths: at16, rail: 14 })), []);
});

test('a part-time street drawn solid, or wider than a class it is under, is reported; a dashed hairline is not', () => {
  const pts = (o) => ({ ...street('9', [pt(0, 600), pt(100, 600)], { layer: 'bus-part-time', n: 0, ...o }), mode: 'bus' });
  assert.deepEqual(kinds(styleFaults(fakeModel({ widths: at16, extra: [pts({ w: 2.1, dash: null })] }), 16)), ['parttime-style']);
  assert.deepEqual(kinds(styleFaults(fakeModel({ widths: at16, extra: [pts({ w: 5, dash: [3, 2] })] }), 16)), ['parttime-style']);
  assert.deepEqual(styleFaults(fakeModel({ widths: at16, extra: [pts({ w: 2.1, dash: [3, 2] })] }), 16), []);
});

test('halls with an outline, or filled like the land, are reported; faint fills and a shade under the land are not', () => {
  const data = { terminals: { features: [{ properties: { underground: 1 } }, { properties: { underground: 0 } }] }, stops: { features: [] } };
  const area = (index, color) => ({ layer: 'bus-terminal', source: 'terminals', index, name: `Hall ${index}`, parts: [[pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 0)]], opacity: 1, color });
  const good = fakeModel({ widths: at16, data, areas: [area(0, '#e3e5e8'), area(1, '#f0f1f3')] });
  assert.deepEqual(styleFaults(good, 16), []);
  const same = fakeModel({ widths: at16, data, areas: [area(0, '#f4f5f6'), area(1, '#f4f5f6')] });
  assert.ok(kinds(styleFaults(same, 16)).filter((k) => k === 'hall-style').length >= 2);
  const outlined = fakeModel({ widths: at16, data, areas: [area(0, '#e3e5e8')], style: { layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#f4f5f6' } }, { id: 'street', type: 'line', source: 'streets' }, { id: 'rail', type: 'line', source: 'routes' }, { id: 'hall-edge', type: 'line', source: 'terminals' }] } });
  assert.ok(kinds(styleFaults(outlined, 16)).includes('hall-style'));
  assert.ok(kinds(styleFaults(fakeModel({ widths: at16, data, areas: [] }), 14)).includes('hall-style'));
});

test('stops before zoom 15 are reported, and so is a map with none from there on', () => {
  const data = { stops: { features: [{ properties: {} }] }, terminals: { features: [] } };
  const dot = stop(1, pt(5, 5), '1');
  assert.deepEqual(styleFaults(fakeModel({ widths: at16, data, marks: [dot] }), 16), []);
  assert.deepEqual(kinds(styleFaults(fakeModel({ widths: at16, data, marks: [dot] }), 14)), ['stop-zoom']);
  assert.deepEqual(kinds(styleFaults(fakeModel({ widths: at16, data, marks: [] }), 16)), ['stop-zoom']);
});

// --- the graph ---------------------------------------------------------------------------------------

test('streets that share an end vertex are one node; chains run through nodes where exactly two meet', () => {
  const a = street('1', [pt(0, 0), pt(100, 0)]), b = street('1', [pt(100, 0), pt(200, 0)]), c = street('1', [pt(200, 0), pt(300, 0)]), d = street('2', [pt(200, 0), pt(200, 100)]);
  const streets = streetsOf(zoom([a, b, c, d]));
  const graph = graphOf(streets);
  assert.equal(graph.free.length, 3 + 0); // a's start, c's end, d's end
  const chains = chainsOf(streets, graph);
  assert.equal(chains.length, 3);
  assert.deepEqual(chains.map((ch) => ch.streets.length).sort(), [1, 1, 2]);
});
