import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { codeFingerprint } from '../scripts/lib/fingerprint.mjs';

// A small module tree outside the repository; codeFingerprint takes absolute paths too.
async function tree(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fingerprint-'));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), text);
  }
  return dir;
}

const base = {
  'entry.mjs': "import { a } from './lib/a.mjs';\nimport {\n  b,\n} from './lib/b.mjs';\nexport { c } from './lib/c.mjs';\n// import './lib/missing.mjs' is only a comment\nconst url = 'https://example.com/x';\n",
  'lib/a.mjs': "import './d.mjs';\nexport const a = 1;\n",
  'lib/b.mjs': 'export const b = 2;\n',
  'lib/c.mjs': 'export const c = 3;\n',
  'lib/d.mjs': '',
  'lib/unused.mjs': 'export const u = 4;\n',
};

test('a change to any imported module changes the fingerprint; others do not', async () => {
  const dir = await tree(base);
  const fp = () => codeFingerprint(path.join(dir, 'entry.mjs'));
  const first = await fp();
  assert.equal(await fp(), first);
  await writeFile(path.join(dir, 'lib/unused.mjs'), 'export const u = 5;\n');
  assert.equal(await fp(), first, 'a module nothing imports does not count');
  await writeFile(path.join(dir, 'lib/d.mjs'), '// edited\n');
  assert.notEqual(await fp(), first, 'a side-effect import two levels down counts');
});

test('stopAt leaves out a module and what only it imports', async () => {
  const dir = await tree(base);
  const fp = () => codeFingerprint(path.join(dir, 'entry.mjs'), { stopAt: [path.join(dir, 'lib/b.mjs')] });
  const first = await fp();
  await writeFile(path.join(dir, 'lib/b.mjs'), 'export const b = 9;\n');
  assert.equal(await fp(), first);
  await writeFile(path.join(dir, 'lib/c.mjs'), 'export const c = 9;\n');
  assert.notEqual(await fp(), first, 'an export-from counts');
});
