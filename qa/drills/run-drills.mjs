// Task 3 harness: run every drill against the copy, and record what the build
// did — exit code, the output, and whether public/data changed.
//
//   node qa/drills/run-drills.mjs
//
// The copy is a git worktree at ../rtd-drill with node_modules symlinked to
// this checkout's, so a drill build writes the copy's public/data and never
// this one's.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const COPY = path.resolve(here, '..', '..', '..', 'rtd-drill');
const MOCK = path.join(here, 'mock-fetch.mjs');

const DRILLS = [
  ['truncated-zip', 'The GTFS zip arrives cut short (60% of its bytes).'],
  ['stop-times-missing', 'The GTFS zip has no stop_times.txt.'],
  ['shapes-missing', 'The GTFS zip has no shapes.txt.'],
  ['rail-color-blank', 'routes.txt has an empty route_color for every rail line.'],
  ['half-routes-removed', 'routes.txt keeps every other route.'],
  ['arcgis-500', "The stations layer answers every query with HTTP 500."],
  ['arcgis-zero-features', 'The stations layer reports a count of 0 and returns no features.'],
  ['arcgis-error-200', 'The stations layer reports an error inside a 200 response.'],
];

/** sha1 over every file under a folder, path and bytes, in path order. */
function treeHash(root) {
  const hash = createHash('sha1');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(path.relative(root, full)).update(readFileSync(full));
    }
  };
  walk(root);
  return hash.digest('hex');
}

if (!existsSync(path.join(COPY, 'scripts', 'build-data.mjs'))) {
  console.error(`No copy at ${COPY}. Create it with:\n  git worktree add --detach ../rtd-drill HEAD && ln -s "$PWD/node_modules" ../rtd-drill/node_modules`);
  process.exit(1);
}

const data = path.join(COPY, 'public', 'data');
const lines = ['Task 3 drills — each one damages a source, then builds in ../rtd-drill.', ''];
const rows = [];

for (const [drill, what] of DRILLS) {
  const before = treeHash(data);
  const run = spawnSync('node', ['--import', MOCK, 'scripts/build-data.mjs'], {
    cwd: COPY,
    env: { ...process.env, DRILL: drill },
    encoding: 'utf8',
    timeout: 900_000,
  });
  const after = treeHash(data);
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trimEnd();
  const changed = before !== after;

  lines.push(`## ${drill}`, '', what, '', '```', `cd ../rtd-drill && DRILL=${drill} node --import "$QA/drills/mock-fetch.mjs" scripts/build-data.mjs`, '```', '');
  lines.push(`exit code: ${run.status}${run.signal ? ` (signal ${run.signal})` : ''}`);
  lines.push(`public/data changed: ${changed ? 'YES' : 'no'} (${before.slice(0, 12)} -> ${after.slice(0, 12)})`, '');
  lines.push('```', output.split('\n').slice(-25).join('\n'), '```', '');

  rows.push({ drill, exit: run.status, changed, output });
  console.log(`${run.status === 0 ? 'PASS' : 'FAIL'}  ${drill.padEnd(22)} exit ${run.status}  changed ${changed ? 'YES' : 'no'}`);
}

mkdirSync(path.join(here, '..', 'out'), { recursive: true });
writeFileSync(path.join(here, '..', 'out', 'drills.txt'), lines.join('\n'));

console.log(`\n${rows.filter((r) => r.exit === 0).length} of ${rows.length} drills built without failing; transcript in qa/out/drills.txt`);
