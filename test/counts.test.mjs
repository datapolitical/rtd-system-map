import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countProblems } from '../scripts/lib/counts.mjs';

test('a count that falls to zero or by more than 30% fails the build (DESIGN.md, Rule 3)', () => {
  const before = { stops: 7555, structures: 160, terminals: 1, terminals_under: 2 };
  assert.deepEqual(countProblems({ stops: 7500, structures: 150 }, before), []);
  assert.deepEqual(countProblems({ stops: 0 }, before), ['No stops downloaded']);
  assert.deepEqual(countProblems({ structures: 40 }, before, { source: 'OpenStreetMap' }), ['structures dropped from 160 to 40 (from OpenStreetMap)']);
  assert.deepEqual(countProblems({ terminals: 0 }, before), ['No terminals downloaded']);
});

test('only the roles asked for are checked, and nothing to compare with checks only for zero', () => {
  assert.deepEqual(countProblems({ stops: 1, structures: 1 }, { stops: 100, structures: 100 }, { roles: ['structures'] }), ['structures dropped from 100 to 1']);
  assert.deepEqual(countProblems({ structures: 5 }, null), []);
  assert.deepEqual(countProblems({ structures: 0 }, null), ['No structures downloaded']);
  // A count that was zero last time may stay zero.
  assert.deepEqual(countProblems({ terminals_under: 0 }, { terminals_under: 0 }), []);
});
