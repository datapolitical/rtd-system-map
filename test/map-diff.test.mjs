// What a branch changes in the map's faults (qa/checks/map-diff.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffFindings, markdown } from '../qa/checks/map-diff.mjs';

const f = (kind, lat, lon, check = 'lines') => ({ check, kind, lat, lon, zoom: 16, msg: `${kind} here`, link: 'https://example.invalid/#16/0/0' });
// 0.00005 degrees of latitude is about 5.5 m.

test('the same fault a few metres off is kept; a new one is new; a fixed one is gone', () => {
  const base = [f('gap', 39.75, -105), f('hook', 39.76, -105)];
  const head = [f('gap', 39.75005, -105), f('overshoot', 39.77, -105)];
  const d = diffFindings(base, head);
  assert.deepEqual(d.added.map((x) => x.kind), ['overshoot']);
  assert.deepEqual(d.gone.map((x) => x.kind), ['hook']);
  assert.equal(d.kept, 1);
});

test('a different kind or check at the same place is a different fault', () => {
  const d = diffFindings([f('gap', 39.75, -105)], [f('hook', 39.75, -105), f('gap', 39.75, -105, 'streets')]);
  assert.equal(d.added.length, 2);
  assert.equal(d.gone.length, 1);
});

test('more than ten metres apart is not the same fault', () => {
  const d = diffFindings([f('gap', 39.75, -105)], [f('gap', 39.7502, -105)]);
  assert.equal(d.added.length, 1);
});

test('the summary says what is new and what is gone', () => {
  const md = markdown(diffFindings([f('hook', 39.76, -105)], [f('gap', 39.75, -105)]), { base: { site: 'main' }, head: { site: 'branch' } });
  assert.match(md, /1 new, 1 gone, 0 the same/);
  assert.match(md, /\*\*New:\*\* 1 lines\/gap/);
  assert.match(md, /\*\*Gone:\*\* 1 lines\/hook/);
});
