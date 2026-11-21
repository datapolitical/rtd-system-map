import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditSheet, sampleStations, anchorChanges } from '../qa/evaluation/checks.mjs';
import { coverageSummary, coverageMarkdown } from '../qa/recall/summary.mjs';

const feature = (properties, type, coordinates) => ({ type: 'Feature', properties, geometry: { type, coordinates } });
const point = [0, 0];
const station = feature({ id: 'station-a', name: 'Example station', lines: 'R', served: true }, 'Point', point);
const route = feature({ route: 'R', mode: 'rail' }, 'LineString', [[0, 0], [0.01, 0]]);
const mark = feature({ kind: 'station', shape: 'bar', ...station.properties }, 'LineString', [[0, -0.00001], [0, 0.00001]]);
const name = feature({ kind: 'station', shape: 'name', ...station.properties }, 'Point', point);
const rail = feature({ kind: 'rail', route: 'R' }, 'LineString', route.geometry.coordinates);
const letter = feature({ kind: 'letter', route: 'R' }, 'Point', [0.001, 0]);
const street = feature({ kind: 'bus', routes: '12, 34' }, 'LineString', [[0, 0], [0.01, 0]]);
const stop = feature({ kind: 'stop', id: 'stop-a', routes: '12' }, 'Point', [0.005, 0]);
const clean = [mark, name, rail, letter, street, stop];
const audit = (features = clean) => auditSheet({ features, stations: [station], routes: [route], zoom: 16, allStations: true });

test('known-good control: consistent station and a stop on its own route', () => {
  assert.deepEqual(audit().findings, []);
  assert.equal(audit().counts.stops, 1);
});

test('known-good control: separate hub platform marks are legitimate', () => {
  const platform = structuredClone(mark);
  platform.geometry.coordinates = [[0.001, -0.00001], [0.001, 0.00001]];
  assert.deepEqual(audit([...clean, platform]).findings, []);
});

test('known-good control: the source display label may abbreviate its full name', () => {
  const source = structuredClone(station);
  source.properties.name = 'Example station Transit Center';
  source.properties.label = station.properties.name;
  assert.deepEqual(auditSheet({ features: clean, stations: [source], routes: [route], zoom: 16 }).findings, []);
});

test('known-good control: omitted low-scale stations are not silently required', () => {
  assert.deepEqual(auditSheet({ features: [rail, letter], stations: [station], routes: [route], zoom: 8.75 }).findings, []);
});

for (const [title, alter, expected] of [
  ['a moved stop', (fs) => { fs.at(-1).geometry.coordinates = [0.005, 0.001]; }, 'stray-stop'],
  ['a stop on another route', (fs) => { fs.at(-1).properties.routes = '99'; }, 'stray-stop'],
  ['a changed station line', (fs) => { fs[0].properties.lines = 'S'; }, 'station-identity'],
  ['a changed station name', (fs) => { fs[1].properties.name = 'Wrong name'; }, 'station-identity'],
  ['an unknown station', (fs) => { fs[0].properties.id = 'unknown'; }, 'station-identity'],
  ['an exactly duplicated mark', (fs) => fs.push(structuredClone(fs[0])), 'duplicate-mark'],
  ['a removed station', (fs) => fs.splice(0, 1), 'missing-station'],
  ['a removed station name', (fs) => fs.splice(1, 1), 'missing-name'],
  ['an unknown route letter', (fs) => { fs[3].properties.route = 'S'; }, 'rail-identity'],
  ['all letters removed', (fs) => fs.splice(3, 1), 'missing-letter'],
]) {
  test(`planted fault: ${title}`, () => {
    const changed = structuredClone(clean);
    alter(changed);
    assert.ok(audit(changed).findings.some((f) => f.kind === expected));
    assert.deepEqual(audit().findings, [], 'the unmodified control remains clean');
  });
}

test('stops far outside familiar map views are still examined', () => {
  const remote = feature({ kind: 'stop', routes: '12' }, 'Point', [45, 45]);
  const result = audit([...clean, remote]);
  assert.equal(result.counts.stops, 2);
  assert.equal(result.findings.filter((f) => f.kind === 'stray-stop').length, 1);
});

test('sampling is reproducible, unique, seed-sensitive and independent of source order', () => {
  const stations = Array.from({ length: 20 }, (_, i) => feature({ id: i, served: true }, 'Point', [i, 0]));
  const ids = (fs, seed) => sampleStations(fs, { seed }).map((f) => f.properties.id);
  assert.deepEqual(ids(stations, 21), ids([...stations].reverse(), 21));
  assert.notDeepEqual(ids(stations, 21), ids(stations, 22));
  assert.equal(new Set(ids(stations, 21)).size, 3);
});

test('recall reports blind spots and sampling misses without claiming current acceptance', () => {
  const summary = coverageSummary([{ finds: [{ pipeline: false, looking: false }], planted: [
    { kind: 'stray-stop', pipeline: false, looking: true },
    { kind: 'gap', pipeline: true, looking: true },
  ] }]);
  assert.deepEqual(summary.planted, { total: 2, pipeline: 1, pointed: 2 });
  assert.deepEqual(summary.byKind['stray-stop'], { total: 1, pipeline: 0, pointed: 1 });
  assert.equal(summary.currentMapAcceptance, false);
  assert.match(coverageMarkdown(summary), /does not establish current-sheet or smooth-zoom acceptance/);
});

const frame = (zoom, anchor, mode = 'offset') => ({ theme: 'light', mode, view: 'hub', file: `${mode}-${zoom}.png`,
  actual: { zoom, names: [{ id: 'example', name: 'Example station', anchor }] } });

test('rendered continuity catches the kind of anchor flip seen in the actual trial', () => {
  const findings = anchorChanges([frame(12.99, 'bottom-right'), frame(14, 'top')]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].before.anchor, 'bottom-right');
  assert.equal(findings[0].after.anchor, 'top');
});

test('rendered continuity control: stable names and separate trial modes do not fail', () => {
  assert.deepEqual(anchorChanges([frame(12.99, 'top'), frame(14, 'top')]), []);
  assert.deepEqual(anchorChanges([frame(12.99, 'top'), frame(14, 'bottom', 'drawn')]), []);
});

test('rendered continuity control: a name not visible in both frames is not an anchor flip', () => {
  const absent = frame(12.99, 'top');
  absent.actual.names = [];
  assert.deepEqual(anchorChanges([absent, frame(14, 'bottom')]), []);
});

test('recorded trial regression: the detector catches the screenshot-confirmed real anchor flip', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/zoom-anchor-observations.json', import.meta.url), 'utf8'));
  const findings = anchorChanges(fixture.captures);
  assert.deepEqual(findings, [fixture.expected]);
});
