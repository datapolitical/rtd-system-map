// The #64 register and zoom-range rules, exercised against RTD's built station data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import visualFixes from '../scripts/visual-fixes.json' with { type: 'json' };
import { geometryFingerprint, visualFixFingerprint, resolveVisualFixes, pinsAtZoom, visualFixReport } from '../scripts/lib/visual-fixes.mjs';

const stationsUrl = new URL('../public/data/stations.geojson', import.meta.url);
const haveData = existsSync(stationsUrl);
const stations = haveData ? JSON.parse(readFileSync(stationsUrl, 'utf8')) : null;
const station = stations?.features.find((f) => f.geometry?.type === 'Point' && f.properties?.id !== undefined);
const data = { stations };
const options = { skip: haveData ? false : 'built public/data/stations.geojson is required' };
const pin = (extra = {}) => ({
  what: { kind: 'station-name', station: station.properties.id },
  set: { side: 'left' },
  why: 'Exercise a one-place visual pin against the real source geometry',
  fingerprint: geometryFingerprint(station.geometry),
  issue: 64,
  ...extra,
});

test('the committed register is read against real RTD stations', options, () => {
  const resolved = resolveVisualFixes(visualFixes, data);
  assert.equal(resolved.total, 0);
  assert.equal(visualFixReport(resolved).live, 0);
});

test('a station pin is live only while its real RTD id and geometry match', options, () => {
  const entry = pin();
  const resolved = resolveVisualFixes([entry], data);
  assert.equal(resolved.pins.length, 1);
  assert.equal(visualFixFingerprint(entry, data), entry.fingerprint);
  assert.equal(visualFixReport(resolved).skipped.length, 0);
  assert.deepEqual(pinsAtZoom(resolved, 12.25).map((p) => p.set.side), ['left']);
});

test('changed RTD geometry skips and reports the pin rather than drawing it stale', options, () => {
  const changed = { features: stations.features.map((f) => f === station
    ? { ...f, geometry: { ...f.geometry, coordinates: [f.geometry.coordinates[0] + 0.000001, f.geometry.coordinates[1]] } } : f) };
  const resolved = resolveVisualFixes([pin()], { stations: changed });
  assert.equal(resolved.pins.length, 0);
  assert.equal(resolved.skipped.length, 1);
  assert.match(resolved.skipped[0].reason, /fingerprint changed/);
  assert.equal(pinsAtZoom(resolved, 14).length, 0);
});

test('a removed RTD station id skips and reports the pin', options, () => {
  const removed = { features: stations.features.filter((f) => f !== station) };
  const resolved = resolveVisualFixes([pin()], { stations: removed });
  assert.equal(resolved.pins.length, 0);
  assert.match(resolved.skipped[0].reason, /no longer present/);
});

test('a pin holds at every fractional and whole zoom in its inclusive range', options, () => {
  const resolved = resolveVisualFixes([pin({ zooms: { from: 12, to: 16 } })], data);
  const zooms = [12, 12.25, 12.5, 13, 13.75, 14, 14.5, 15, 15.75, 16];
  for (const zoom of zooms) assert.deepEqual(pinsAtZoom(resolved, zoom).map((p) => p.what.station), [station.properties.id], `zoom ${zoom}`);
  for (const zoom of [11.999, 16.001]) assert.equal(pinsAtZoom(resolved, zoom).length, 0, `zoom ${zoom}`);
});

test('an omitted zoom range lasts the label\'s whole life', options, () => {
  const resolved = resolveVisualFixes([pin()], data);
  for (const zoom of [8.75, 10, 12, 14, 16, 20]) assert.equal(pinsAtZoom(resolved, zoom).length, 1);
});

test('two live pins for one label conflict wherever their zoom ranges overlap', options, () => {
  const a = pin({ zooms: { from: 12, to: 14 } });
  const b = pin({ set: { side: 'right' }, zooms: { from: 14, to: 16 } });
  assert.throws(() => resolveVisualFixes([a, b], data), /Conflicting visual fixes.*entries 1 and 2/);
  const separate = resolveVisualFixes([a, { ...b, zooms: { from: 14.001, to: 16 } }], data);
  assert.equal(separate.pins.length, 2);
});

test('a stale pin cannot conflict with a live one', options, () => {
  const stale = pin({ fingerprint: '0'.repeat(64) });
  const resolved = resolveVisualFixes([pin(), stale], data);
  assert.equal(resolved.pins.length, 1);
  assert.equal(resolved.skipped.length, 1);
});

test('a pin cannot change a name, add an unsupported placement field, or use an unknown side', options, () => {
  assert.throws(() => resolveVisualFixes([pin({ set: { side: 'left', text: 'hand-set name' } })], data), /set must contain only a side/);
  assert.throws(() => resolveVisualFixes([pin({ set: { side: 'everywhere' } })], data), /set must contain only a side/);
  assert.throws(() => resolveVisualFixes([pin({ name: 'hand-set name' })], data), /cannot change wording or other facts/);
});

test('malformed selectors, fingerprints, explanations and zoom ranges fail at build time', options, () => {
  assert.throws(() => resolveVisualFixes([pin({ what: { kind: 'station-name' } })], data), /RTD station id/);
  assert.throws(() => resolveVisualFixes([pin({ fingerprint: 'stale' })], data), /SHA-256/);
  assert.throws(() => resolveVisualFixes([pin({ why: '' })], data), /why/);
  assert.throws(() => resolveVisualFixes([pin({ issue: 0 })], data), /issue/);
  assert.throws(() => resolveVisualFixes([pin({ zooms: { from: 16, to: 12 } })], data), /from <= to/);
  assert.throws(() => resolveVisualFixes([pin({ zooms: { from: 12, to: 16, extra: 1 } })], data), /only from and to/);
  assert.throws(() => pinsAtZoom(resolveVisualFixes([pin()], data), NaN), /finite zoom/);
});

test('a station id carried by two features is ambiguous: the pin is skipped, not tied to the first', options, () => {
  const twin = { ...station, geometry: { ...station.geometry, coordinates: [station.geometry.coordinates[0] + 0.01, station.geometry.coordinates[1]] } };
  const dup = { stations: { features: [...stations.features, twin] } };
  const entry = pin();
  assert.equal(visualFixFingerprint(entry, dup), null, 'a valid fingerprint for the first feature does not bless it');
  const resolved = resolveVisualFixes([entry], dup);
  assert.equal(resolved.pins.length, 0);
  assert.match(resolved.skipped[0].reason, /ambiguous/);
  assert.equal(pinsAtZoom(resolved, 14).length, 0);
});

test('the report says live pins are resolved only, not applied to a drawing', options, () => {
  const report = visualFixReport(resolveVisualFixes([pin()], data));
  assert.equal(report.live, 1);
  assert.equal(report.applied, false, 'no drawing reads the pin yet, so the report makes no claim that it changed one');
});
