// Station shapes against the lines (qa/drawn/shapes.mjs): for each rule one
// made-up place that must be reported and one that must not, on the model's
// own shapes (lines, marks and areas at zoom 17, the build's `structures` and
// `terminals` read by area index). Places are laid out in metres east and
// north of a point in Denver, then projected as the model does, so metres and
// degrees mean what they do on the map. No browser, no build data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toLonLat, toWorld } from '../qa/drawn/mercator.mjs';
import { LIMITS, SHAPE_KINDS, shapeFaults } from '../qa/drawn/shapes.mjs';

const Z = 17;
const ORIGIN = [-105.0, 39.75];
const KX = 111320 * Math.cos((ORIGIN[1] * Math.PI) / 180);
const KY = 110540;
const lonlat = ([e, n]) => [ORIGIN[0] + e / KX, ORIGIN[1] + n / KY];
const px = (p) => toWorld(lonlat(p), Z);
const turn = (deg, len, from = [0, 0]) => [from[0] + Math.sin((deg * Math.PI) / 180) * len, from[1] + Math.cos((deg * Math.PI) / 180) * len];
// A rectangle len m along `bearing` degrees (clockwise from north) and wide m across it, centred at c.
const rect = (c, bearing, len, wide) => {
  const u = turn(bearing, 1), v = [u[1], -u[0]];
  const at = (a, b) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b];
  return [at(-len / 2, -wide / 2), at(len / 2, -wide / 2), at(len / 2, wide / 2), at(-len / 2, wide / 2), at(-len / 2, -wide / 2)];
};

// A scene as the model hands it over at zoom 17, plus the build's collections.
function scene({ rails = [], marks = [], structures = [], terminals = [], joins = [] } = {}) {
  const lines = rails.map((r, i) => {
    const pts = r.points.map(px);
    return { layer: 'rail', source: 'routes', index: r.index ?? i, route: r.route, mode: 'rail', properties: { route: r.route, mode: 'rail' }, parts: [pts], drawn: [r.drawn ? r.drawn.map(px) : pts], width: r.width ?? 9, drawnWidth: r.width ?? 9, cap: 'butt' };
  });
  joins.forEach((j, i) => lines.push({ layer: 'platform-joins', source: 'platforms', index: i, properties: { kind: 'join', id: j.id }, parts: [j.points.map(px)], drawn: [j.points.map(px)], width: 2, drawnWidth: 2, cap: 'round' }));
  const markList = marks.map((m, i) => ({ kind: 'icon', layer: m.group ? 'platform' : 'stations', source: m.group ? 'platforms' : 'stations', index: i, properties: { id: m.id, lines: m.lines, ...(m.group ? { kind: 'mark' } : {}) }, at: px(m.at), box: [0, 0, 1, 1] }));
  const data = { structures: { type: 'FeatureCollection', features: [] }, terminals: { type: 'FeatureCollection', features: [] } };
  const areas = [];
  structures.forEach((s, i) => {
    data.structures.features.push({ type: 'Feature', properties: { kind: s.kind, station: String(s.station) }, geometry: { type: 'Polygon', coordinates: [s.ring.map(lonlat)] } });
    areas.push({ layer: s.kind === 'platform' ? 'station-platform' : s.kind === 'canopy' ? 'station-canopy' : 'station-building', source: 'structures', index: i, parts: [s.ring.map(px)] });
  });
  terminals.forEach((t, i) => {
    data.terminals.features.push({ type: 'Feature', properties: { id: String(t.id) }, geometry: { type: 'Polygon', coordinates: [t.ring.map(lonlat)] } });
    areas.push({ layer: 'bus-terminal-under', source: 'terminals', index: i, parts: [t.ring.map(px)] });
  });
  return { zoom: { z: Z, lines, marks: markList, areas }, data };
}
const run = (s, kinds, z = Z) => shapeFaults({ ...s.zoom, z }, { data: s.data, kinds });
const kindsOf = (faults) => faults.map((f) => f.kind).sort();
const platform = (c, bearing, len = 120, wide = 6, station = 1) => ({ kind: 'platform', station, ring: rect(c, bearing, len, wide) });

test('the kinds the detectors report are the kinds they list', () => {
  assert.deepEqual(SHAPE_KINDS, ['off-platform', 'skew', 'past-roof', 'past-mark', 'walk-bent', 'platform-covered']);
  assert.ok(LIMITS.skew <= LIMITS.skewThrough);
});

// --- SS02: the line runs parallel to its platform ---------------------------

// A line that ends at the north tip of a platform running north, coming in
// `off` degrees off the platform's axis. Its end is 3 m east of the axis.
const approach = (off, { platformBearing = 0, route = 'A' } = {}) => {
  const end = [3, 60];
  const from = turn(180 + off, 130, end); // back along the line
  return scene({
    rails: [{ route, points: [from, end] }],
    marks: [{ id: 1, lines: route, at: end }],
    structures: [platform([0, 0], platformBearing)],
  });
};

test('SS02: a line 4 degrees off its platform over its last 100 m is reported', () => {
  const f = run(approach(4), ['skew']);
  assert.deepEqual(kindsOf(f), ['skew']);
  assert.match(f[0].msg, /runs 4\.0 degrees off its platform over 100 m before its end/);
  assert.equal(f[0].route, 'A');
  assert.equal(f[0].station, '1');
});

test('SS02: the finding is placed at the middle of the stretch that is off, 50 m back from the end', () => {
  const [f] = run(approach(4), ['skew']);
  const [lon, lat] = toLonLat(f.px, Z);
  const [e, n] = [(lon - ORIGIN[0]) * KX, (lat - ORIGIN[1]) * KY];
  // The line ends at (3, 60) and runs back 4 degrees off north.
  assert.ok(Math.abs(n - (60 - 50)) < 1 && Math.abs(e - (3 - 50 * Math.tan((4 * Math.PI) / 180))) < 1, `${e.toFixed(1)}, ${n.toFixed(1)}`);
});

test('SS02: a line 1 degree off its platform is not', () => {
  assert.deepEqual(run(approach(1), ['skew']), []);
  assert.deepEqual(run(approach(0), ['skew']), []);
});

test('SS02: the platform need not run north: the angle is to its own axis', () => {
  // A platform tilted 40 degrees and a line carried straight on along north is 40 degrees off: a crossing, not a skew.
  assert.deepEqual(run(approach(0, { platformBearing: 40 }), ['skew']), []);
  // Tilted 5 degrees, the line along north is 5 degrees off it.
  assert.deepEqual(kindsOf(run(approach(0, { platformBearing: 5 }), ['skew'])), ['skew']);
});

test('SS02: a line that crosses a platform at a wide angle is not one that should run along it', () => {
  assert.deepEqual(run(approach(45), ['skew']), []);
});

test('SS02: a line through a station is judged abreast of the platform middle, at 3 degrees', () => {
  const through = (off) => scene({
    rails: [{ route: 'C', points: [turn(180 + off, 150, [2, 0]), turn(off, 150, [2, 0])] }],
    marks: [{ id: 1, lines: 'C', at: [2, 0] }],
    structures: [platform([0, 0], 0)],
  });
  const bent = run(through(4), ['skew']);
  assert.deepEqual(kindsOf(bent), ['skew']);
  assert.match(bent[0].msg, /abreast of its middle/);
  assert.deepEqual(run(through(2.5), ['skew']), []);
});

test('SS02: a line that ends at the platform is not also a free end where its pieces meet', () => {
  // The route's two pieces meet at (3, 0), mid-platform: not an end, so the 4 degrees is judged as a line through (3 allowed).
  const a = turn(180 + 4, 80, [3, 0]), b = turn(4, 80, [3, 0]);
  const s = scene({ rails: [{ route: 'A', points: [a, [3, 0]] }, { route: 'A', points: [[3, 0], b] }], marks: [{ id: 1, lines: 'A', at: [3, 0] }], structures: [platform([0, 0], 0)] });
  assert.ok(run(s, ['skew']).every((f) => /abreast of its middle/.test(f.msg)));
});

// --- SS01: a line ends beside its platform ----------------------------------

test('SS01: a line that ends 30 m from the nearest platform of its station is reported', () => {
  const s = scene({
    rails: [{ route: 'A', points: [[0, -200], [0, -30]] }],
    marks: [{ id: 1, lines: 'A', at: [0, -30] }],
    structures: [platform([0, 60], 0)],
  });
  const f = run(s, ['off-platform']);
  assert.deepEqual(kindsOf(f), ['off-platform']);
  assert.match(f[0].msg, /ends 3\d\.\d m from the nearest platform/);
});

test('SS01: a line that ends beside its platform, or on it, is not', () => {
  const beside = scene({ rails: [{ route: 'A', points: [[8, -200], [8, 55]] }], marks: [{ id: 1, lines: 'A', at: [8, 55] }], structures: [platform([0, 0], 0)] });
  assert.deepEqual(run(beside, ['off-platform']), []);
  const on = scene({ rails: [{ route: 'A', points: [[0, -200], [0, 30]] }], marks: [{ id: 1, lines: 'A', at: [0, 30] }], structures: [platform([0, 0], 0)] });
  assert.deepEqual(run(on, ['off-platform']), []);
});

test('SS01: a platform of another station does not count', () => {
  const s = scene({ rails: [{ route: 'A', points: [[0, -200], [0, 0]] }], marks: [{ id: 1, lines: 'A', at: [0, 0] }], structures: [platform([0, 0], 0, 120, 6, 2)] });
  // Station 1 has no platform drawn: nothing to judge.
  assert.deepEqual(run(s, ['off-platform']), []);
});

test('SS01: a line through a station 60 m from every platform is reported, one 4 m from its platform is not', () => {
  const through = (e) => scene({ rails: [{ route: 'E', points: [[e, -300], [e, 300]] }], marks: [{ id: 1, lines: 'E', at: [e, 0] }], structures: [platform([0, 0], 0)] });
  const f = run(through(-65), ['off-platform']);
  assert.deepEqual(kindsOf(f), ['off-platform']);
  assert.match(f[0].msg, /runs 6\d\.\d m from the nearest platform/);
  assert.deepEqual(run(through(-7), ['off-platform']), []);
});

// --- SS03: the line ends under the roof -------------------------------------

// A roof 40 m long by 36 m wide over the end of a platform; a line ending `at` metres north.
const roofed = (kind, at, { wide = 36, lines = 'A' } = {}) => scene({
  rails: [{ route: 'A', points: [[0, -150], [0, at]] }],
  marks: [{ id: 1, lines, at: [0, at] }],
  structures: [platform([0, -60], 0, 120, 6), { kind, station: 1, ring: rect([0, 0], 0, 40, wide) }],
});

test('SS03: a line that ends at the tip of a hall roof, or past it, is reported', () => {
  for (const at of [19, 20, 24]) {
    const f = run(roofed('hall', at), ['past-roof']);
    assert.deepEqual(kindsOf(f), ['past-roof'], `ends ${at} m north`);
  }
  assert.match(run(roofed('hall', 19), ['past-roof'])[0].msg, /1\.0 m from the roof's far edge/);
  assert.match(run(roofed('hall', 24), ['past-roof'])[0].msg, /m past the edge of the roof/);
});

test('SS03: a line that ends under the roof, well short of its tip, is not', () => {
  for (const at of [0, 8, 14]) assert.deepEqual(run(roofed('hall', at), ['past-roof']), [], `ends ${at} m north`);
});

test('SS03: a canopy at least 10 m wide and 600 m2 is a hall too (before the build had the kind), a narrow one is not', () => {
  assert.deepEqual(kindsOf(run(roofed('canopy', 19), ['past-roof'])), ['past-roof']);
  assert.deepEqual(run(roofed('canopy', 19, { wide: 8 }), ['past-roof']), []);
});

test('SS03: a roof the line does not reach is not judged', () => {
  const s = scene({
    rails: [{ route: 'A', points: [[0, -150], [0, -50]] }],
    marks: [{ id: 1, lines: 'A', at: [0, -50] }],
    structures: [platform([0, -60], 0, 120, 6), { kind: 'hall', station: 1, ring: rect([0, 40], 0, 40, 36) }],
  });
  assert.deepEqual(run(s, ['past-roof']), []);
});

// --- SS04: nothing stands past the mark ---------------------------------------

// One line ends at a mark at (0, 0); a platform (and a roof) runs `past` metres beyond it.
const marked = (past, { through = false } = {}) => scene({
  rails: [{ route: 'A', points: [[0, -200], [0, through ? 200 : 0]] }],
  marks: [{ id: 1, lines: 'A', at: [0, 0] }],
  structures: [platform([2, -60 + past / 2], 0, 120 + past, 6), { kind: 'canopy', station: 1, ring: rect([2, -30 + past / 2], 0, 60 + past, 5) }],
});

test('SS04: a platform and a narrow roof that stand 20 m past the mark the line ends at are reported', () => {
  const f = run(marked(20), ['past-mark']);
  assert.deepEqual(f.map((x) => x.layer).sort(), ['station-canopy', 'station-platform']);
  assert.match(f[0].msg, /stands (20|19)\.\d m past the mark that A end at/);
});

test('SS04: shapes that stop at the mark, or 2 m past it, are not', () => {
  assert.deepEqual(run(marked(0), ['past-mark']), []);
  assert.deepEqual(run(marked(2), ['past-mark']), []);
});

test('SS04: where a line runs on through the mark the platform may run on too', () => {
  assert.deepEqual(run(marked(20, { through: true }), ['past-mark']), []);
});

test('SS04: a hall roof is kept whole, not cut at the mark', () => {
  const s = scene({
    rails: [{ route: 'A', points: [[0, -200], [0, 0]] }],
    marks: [{ id: 1, lines: 'A', at: [0, 0] }],
    structures: [{ kind: 'hall', station: 1, ring: rect([0, 0], 0, 60, 40) }, { kind: 'canopy', station: 1, ring: rect([0, 0], 0, 60, 40) }],
  });
  assert.deepEqual(run(s, ['past-mark']), []);
});

test('SS04: a platform on another track, 60 m across, is not this mark\'s', () => {
  const s = scene({
    rails: [{ route: 'A', points: [[0, -200], [0, 0]] }],
    marks: [{ id: 1, lines: 'A', at: [0, 0] }],
    structures: [platform([60, 30], 0, 120, 6)],
  });
  assert.deepEqual(run(s, ['past-mark']), []);
});

// --- PG01: the marks, the walk and the hall are one line ----------------------

// Union Station's, as the build draws it (the live build's marks, the walk's
// ends and the underground hall's corners).
const UNION = {
  station: [-105.00067, 39.7536],
  group: [-105.00302, 39.75541],
  hall: [[-105.00293, 39.75508], [-105.00056, 39.75325], [-105.00022, 39.75351], [-105.00259, 39.75534], [-105.00293, 39.75508]],
};
// The same place in this file's metres east and north of ORIGIN.
const local = ([lon, lat]) => [(lon - ORIGIN[0]) * KX, (lat - ORIGIN[1]) * KY];
const union = ({ group = UNION.group, hall = UNION.hall } = {}) => {
  const a = local(UNION.station), b = local(group);
  return scene({ marks: [{ id: 89, lines: 'A', at: a }, { id: 89, lines: 'C E W', at: b, group: true }], joins: [{ id: 89, points: [a, b] }], terminals: [{ id: 89, ring: hall.map(local) }] });
};

test('PG01: Union Station as built (the two marks, the walk and the hall in one line) passes', () => {
  assert.deepEqual(run(union(), ['walk-bent']), []);
});

test('PG01: a group mark 30 m off the hall\'s axis is reported', () => {
  const f = run(union({ group: [-105.00302 + 30 / KX, 39.75541] }), ['walk-bent']);
  assert.deepEqual(kindsOf(f), ['walk-bent']);
  assert.match(f[0].msg, /off the hall's long axis|off that axis/);
});

test('PG01: a hall turned 10 degrees from the walk is reported on its bearing', () => {
  // The same hall turned 10 degrees about its middle.
  const c = [(UNION.hall[0][0] + UNION.hall[2][0]) / 2, (UNION.hall[0][1] + UNION.hall[2][1]) / 2];
  const t = (10 * Math.PI) / 180;
  const turned = UNION.hall.map(([lon, lat]) => {
    const x = (lon - c[0]) * KX, y = (lat - c[1]) * KY;
    return [c[0] + (x * Math.cos(t) - y * Math.sin(t)) / KX, c[1] + (x * Math.sin(t) + y * Math.cos(t)) / KY];
  });
  const f = run(union({ hall: turned }), ['walk-bent']);
  assert.deepEqual(kindsOf(f), ['walk-bent']);
  assert.match(f[0].msg, /the walk runs (9|10)\.\d degrees off the hall's long axis/);
});

test('PG01: a pair of marks with no hall between them is not judged', () => {
  const a = [0, 0], b = [150, 40];
  const s = scene({ marks: [{ id: 5, lines: 'A', at: a }, { id: 5, lines: 'R', at: b, group: true }], joins: [{ id: 5, points: [a, b] }] });
  assert.deepEqual(run(s, ['walk-bent']), []);
});

// --- a platform under the line (a proposal) -----------------------------------

// A platform 4 m wide with a line `off` m from its middle line; strokes 9 px wide at zoom 17 (4 m).
const under = (off, wide = 4) => scene({
  rails: [{ route: 'A', points: [[off, -150], [off, 150]], width: 12 }],
  marks: [{ id: 1, lines: 'A', at: [off, 0] }],
  structures: [platform([0, 0], 0, 100, wide)],
});

test('platform-covered: a stroke drawn along a platform\'s middle line is reported at zoom 17 and 16', () => {
  for (const z of [16, 17]) {
    const f = run(under(0.5), ['platform-covered'], z);
    assert.deepEqual(kindsOf(f), ['platform-covered'], `z${z}`);
    assert.equal(f[0].lead, true);
  }
});

test('platform-covered: a platform beside the track is not, and nothing is reported below zoom 16', () => {
  assert.deepEqual(run(under(7), ['platform-covered']), []);
  assert.deepEqual(run(under(0.5), ['platform-covered'], 15), []);
});

test('platform-covered: a wide platform with the stroke along its edge is not', () => {
  assert.deepEqual(run(under(5, 12), ['platform-covered']), []);
});

test('findings are in the shape the other detectors use', () => {
  const [f] = run(approach(4), ['skew']);
  for (const key of ['kind', 'layer', 'route', 'px', 'msg']) assert.ok(key in f, key);
  assert.equal(f.px.length, 2);
  const [lon, lat] = toLonLat(f.px, Z);
  assert.ok(Math.abs(lat - 39.7506) < 0.001 && Math.abs(lon + 105) < 0.001);
});

test('areas: polygons handed in are judged when the zoom draws none (as at zoom 14, before the structures layers start)', () => {
  const s = approach(4);
  const bare = { ...s.zoom, areas: [] };
  assert.deepEqual(shapeFaults(bare, { data: s.data, kinds: ['skew'] }), []);
  assert.deepEqual(shapeFaults(bare, { data: s.data, kinds: ['skew'], areas: s.zoom.areas }).map((x) => x.kind), ['skew']);
});

test('a scene with no data is not judged, and no rail lines is no findings', () => {
  const s = approach(4);
  assert.deepEqual(shapeFaults(s.zoom, { data: {} }), []);
  assert.deepEqual(shapeFaults({ z: 17, lines: [], marks: [], areas: [] }, { data: { structures: { features: [] } } }), []);
});
