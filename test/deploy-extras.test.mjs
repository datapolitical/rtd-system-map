import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BUILT_DATA_FOLDERS, ignoredUnderPublic, judgePublicExtras } from '../scripts/deploy.mjs';

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

test('main accepts the departures tables: files directly in the folder the build makes in public/data/', () => {
  const r = judgePublicExtras([...normal, 'public/data/departures/index.json', 'public/data/departures/0.json'], 'main');
  assert.deepEqual(r, { extras: [], refuse: false });
});

test('main refuses a folder inside the departures tables, and the folder itself unexpanded', () => {
  const deeper = judgePublicExtras([...normal, 'public/data/departures/index.json', 'public/data/departures/trial/'], 'main');
  assert.equal(deeper.refuse, true);
  assert.deepEqual(deeper.extras, ['public/data/departures/trial/']);
  const file = judgePublicExtras([...normal, 'public/data/departures/trial/x.json'], 'main');
  assert.deepEqual(file.extras, ['public/data/departures/trial/x.json']);
  // Unexpanded, what is inside is unknown: refused.
  assert.equal(judgePublicExtras([...normal, 'public/data/departures/'], 'main').refuse, true);
});

test('main refuses an unexpected folder in public/data/ and an unexpected file or folder in public/', () => {
  const r = judgePublicExtras([...normal, 'public/data/departures/index.json', 'public/data/departures-trial/', 'public/notes.txt', 'public/scratch/'], 'main');
  assert.equal(r.refuse, true);
  assert.deepEqual(r.extras, ['public/data/departures-trial/', 'public/notes.txt', 'public/scratch/']);
});

test('the listing opens the build\'s folders, so what is in them is judged', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'deploy-extras-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    await writeFile(path.join(root, '.gitignore'), 'public/data/\n');
    for (const dir of BUILT_DATA_FOLDERS) {
      await mkdir(path.join(root, 'public/data', dir, 'trial'), { recursive: true });
      await writeFile(path.join(root, 'public/data', dir, 'index.json'), '{}');
      await writeFile(path.join(root, 'public/data', dir, 'trial', 'x.json'), '{}');
    }
    await mkdir(path.join(root, 'public/data/zoom-prototype'));
    await writeFile(path.join(root, 'public/data/zoom-prototype/x.json'), '{}');
    await writeFile(path.join(root, 'public/data/meta.json'), '{}');
    // As in the repo, public/ holds tracked files, so git lists what is ignored in it and not public/ itself.
    await writeFile(path.join(root, 'public/index.html'), '');
    execFileSync('git', ['add', '.gitignore', 'public/index.html'], { cwd: root });
    const listed = (await ignoredUnderPublic(root)).sort();
    const want = ['public/data/meta.json', 'public/data/zoom-prototype/', ...BUILT_DATA_FOLDERS.flatMap((dir) => [`public/data/${dir}/index.json`, `public/data/${dir}/trial/`])].sort();
    assert.deepEqual(listed, want);
    const r = judgePublicExtras(listed, 'main');
    assert.equal(r.refuse, true);
    assert.deepEqual(r.extras.sort(), ['public/data/zoom-prototype/', ...BUILT_DATA_FOLDERS.map((dir) => `public/data/${dir}/trial/`)].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
