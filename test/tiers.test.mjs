import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directionSummary, tierOf } from '../scripts/lib/gtfs.mjs';

const day = (fields) => ({ trips: 6, middayDepartures: 0, headway: null, morning: false, evening: false, ...fields });

test('headways set the tier', () => {
  assert.equal(tierOf(day({ headway: 10, middayDepartures: 36 })), 'frequent');
  assert.equal(tierOf(day({ headway: 30, middayDepartures: 12 })), 'every30');
  assert.equal(tierOf(day({ headway: 60, middayDepartures: 6 })), 'hourly');
  assert.equal(tierOf(day({ headway: 90, middayDepartures: 4 })), 'infrequent');
});

test('no midday trips, but both rush periods, is rush hours only', () => {
  assert.equal(tierOf(day({ morning: true, evening: true })), 'peak');
});

test('no midday trips and only early-morning trips is a few trips, not rush hours', () => {
  // For example, five trips between about 4 and 6am.
  assert.equal(tierOf(day({ trips: 5, morning: true })), 'limited');
});

test('one midday trip is infrequent, and no trips at all is none', () => {
  assert.equal(tierOf(day({ middayDepartures: 1 })), 'infrequent');
  assert.equal(tierOf(day({ trips: 0 })), 'none');
  assert.equal(tierOf(undefined), 'none');
});

// Departures from 9am with these gaps between them, in minutes.
const departures = (gaps) => gaps.reduce((times, g) => [...times, times.at(-1) + g * 60], [9 * 3600 + 60]);
const tierAt = (gaps) => tierOf({ trips: gaps.length + 1, ...directionSummary(departures(gaps)) });

test('buses bunched in pairs are not frequent', () => {
  // Two hourly patterns 7 minutes apart: the median gap is 7, but a rider
  // usually waits most of an hour.
  const pairs = [7, 53, 7, 53, 7, 53, 7, 53, 7, 53, 7];
  // 12 departures over 307 minutes: about every 28.
  assert.equal(directionSummary(departures(pairs)).headway, 28);
  assert.equal(tierAt(pairs), 'every30');
});

test('a timetable drifting a minute or two keeps its headway', () => {
  const drift = [30, 29, 31, 33, 30, 29, 31, 33, 30, 29, 31];
  assert.equal(directionSummary(departures(drift)).headway, 30);
  assert.equal(tierAt(drift), 'every30');
});
