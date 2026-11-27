// Uploads the map built on this machine to Cloudflare Pages (docs/upkeep.md).
// Nothing is built by Cloudflare: public/data and public/poster are made here
// by `npm run build:data` / `npm run build:sheets` and are not in git.
//
//   npm run deploy                  from a branch: a preview at <branch>.rtd-system-map.pages.dev
//   npm run deploy                  from main: the live site
//   npm run deploy -- --allow-dirty deploy with uncommitted changes (marked dirty in the manifest)
//   npm run deploy -- --dry-run     do the checks and write the manifest, upload nothing
//
// It refuses to upload when the publish check fails (scripts/publish-check.mjs:
// the built data does not match the code beside it), or when the worktree has
// uncommitted changes and --allow-dirty was not given. It writes
// public/deploy-manifest.json (commit, branch, dirty, build time) so the
// deployed site says which commit it came from, then runs
// `wrangler pages deploy`. Credentials come from the environment:
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (docs/upkeep.md).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'rtd-system-map';
const args = new Set(process.argv.slice(2));
const allowDirty = args.has('--allow-dirty');
const dryRun = args.has('--dry-run');
const unknown = [...args].filter((a) => !['--allow-dirty', '--dry-run'].includes(a));
if (unknown.length) fail(`unknown option ${unknown.join(' ')}; options are --allow-dirty and --dry-run`);

function fail(message) {
  console.error(`Not deploying: ${message}`);
  process.exit(1);
}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

// 1. The built site must be whole and current.
const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'publish-check.mjs')], { cwd: ROOT, stdio: 'inherit' });
if (check.status !== 0) fail('the publish check failed (above); build with npm run build:data or npm run build:sheets');

// 2. Which commit this is.
const sha = git('rev-parse', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch === 'HEAD') fail('the checkout is on no branch (detached HEAD); check out a branch');
const dirty = git('status', '--porcelain').length > 0;
if (dirty && !allowDirty) fail('the worktree has uncommitted changes; commit them, or pass --allow-dirty');
const meta = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'meta.json'), 'utf8'));
const manifest = { commit: sha, branch, dirty, built: meta.built, deployed: new Date().toISOString() };
await writeFile(path.join(ROOT, 'public', 'deploy-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest: ${sha.slice(0, 10)} on ${branch}${dirty ? ' (dirty)' : ''}, data built ${meta.built}`);

if (dryRun) {
  console.log('Dry run: nothing uploaded.');
  process.exit(0);
}

// 3. Upload.
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  if (!process.env[name]) fail(`${name} is not set in the environment (docs/upkeep.md says where it comes from)`);
}
const wrangler = path.join(ROOT, 'node_modules', '.bin', 'wrangler');
const subject = git('log', '-1', '--format=%s');
const up = spawnSync(
  wrangler,
  ['pages', 'deploy', 'public', '--project-name', PROJECT, '--branch', branch, '--commit-hash', sha, '--commit-message', subject, ...(dirty ? ['--commit-dirty=true'] : [])],
  { cwd: ROOT, stdio: 'inherit' },
);
process.exit(up.status ?? 1);
