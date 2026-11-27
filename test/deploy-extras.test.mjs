import test from 'node:test';
import assert from 'node:assert/strict';
import { judgePublicExtras } from '../scripts/deploy.mjs';

const normal = [
  'public/data/meta.json',
  'public/data/sheet-a.geojson',
  'public/poster/a.png',
  'public/tiles/ground.bin',
  'public/vendor/maplibre-gl.js',
  'public/deploy-manifest.json',
];

test('main accepts the normal built site', () => {
  assert.deepEqual(judgePublicExtras(normal, 'main'), { extras: [], refuse: false });
});

test('main refuses a trial folder in public/data/ and a data.next folder', () => {
  const r = judgePublicExtras([...normal, 'public/data/zoom-prototype/', 'public/data.next/'], 'main');
  assert.equal(r.refuse, true);
  assert.deepEqual(r.extras, ['public/data/zoom-prototype/', 'public/data.next/']);
});

test('main refuses a stray public/zoom/', () => {
  const r = judgePublicExtras([...normal, 'public/zoom/'], 'main');
  assert.equal(r.refuse, true);
  assert.deepEqual(r.extras, ['public/zoom/']);
});

test('a branch accepts extras and lists them', () => {
  const r = judgePublicExtras([...normal, 'public/data/zoom-prototype/', 'public/zoom/'], 'zoom-trial');
  assert.equal(r.refuse, false);
  assert.deepEqual(r.extras, ['public/data/zoom-prototype/', 'public/zoom/']);
});

test('a branch with the normal set has no extras', () => {
  assert.deepEqual(judgePublicExtras(normal, 'deploy-from-mini'), { extras: [], refuse: false });
});
