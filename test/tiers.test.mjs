import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tierOf } from '../scripts/lib/gtfs.mjs';

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
