// How much of what is wrong do the checks catch? (qa/recall/README.md)
//
//   npm run check:recall                 # score, compare with baseline.json
//   npm run check:recall -- --update-baseline
//   node qa/recall/recall.mjs --fixtures 0fe749b --plant-on 0fe749b --per 3 --seed 1
//
// For each frozen build (qa/recall/fixtures/<commit>, see snapshot.mjs) it runs
// the same checks as `npm run check:map` (qa/checks/run.mjs) and scores them
// against:
//   - the finds seen on that build (finds.json): faults people saw;
//   - faults planted in the build's data (plant.mjs): faults nobody had to see.
// Each target is scored twice:
//   pipeline  caught by the report as it runs (its places and zooms);
//   looking   caught when the checks are also pointed at the target's place,
//             which tells a detector that misses a fault from a run that
//             never looked there.
// A planted fault counts only for a finding that the unplanted build does not
// already have. The run fails when anything baseline.json had caught is missed.
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_SOURCES } from '../drawn/model.mjs';
import { runChecks } from '../checks/run.mjs';
import { KINDS, metres, plant } from './plant.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const FIXTURES = path.join(HERE, 'fixtures');
const PIPELINE = new Set(['district', 'busiest', 'seeded']);
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

export const metresPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);

/**
 * The findings that catch a target: a kind it lists, within its radius (px at
 * `refZoom`) of one of its points, and not already in `clean` (the same check
 * and kind within the radius on the build before anything was planted).
 */
export function catches(target, findings, { refZoom, clean = [] } = {}) {
  const r = target.radius_px * metresPerPx(target.points[0][1], refZoom);
  return findings.filter((f) => target.caught_by.includes(f.kind)
    && target.points.some((p) => metres([f.lon, f.lat], p) <= r)
    && !clean.some((c) => c.check === f.check && c.kind === f.kind && metres([c.lon, c.lat], [f.lon, f.lat]) <= r));
}

const brief = (f) => `${f.check}/${f.kind} z${f.zoom} ${f.where}: ${f.msg}`;

// The frozen builds, their tarballs and checksums (fixtures.json).
export const FIXTURE_LIST = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures.json'), 'utf8'));

// A fixture on disk, or downloaded from the checks-fixtures release, checked
// against its sha256 and unpacked into qa/recall/fixtures/.
export async function ensureFixture(id) {
  const dir = path.join(FIXTURES, id);
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  const entry = FIXTURE_LIST.fixtures[id];
  if (!entry) throw new Error(`fixture ${id} is not in qa/recall/fixtures.json`);
  const url = `${FIXTURE_LIST.base}${id}.tar.gz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fixture ${id}: ${url}: HTTP ${res.status}`);
  const tar = Buffer.from(await res.arrayBuffer());
  const sum = crypto.createHash('sha256').update(tar).digest('hex');
  if (sum !== entry.sha256) throw new Error(`fixture ${id}: sha256 ${sum} is not the ${entry.sha256} fixtures.json pins`);
  fs.mkdirSync(FIXTURES, { recursive: true });
  execFileSync('tar', ['-xz', '-C', FIXTURES], { input: tar, maxBuffer: 1 << 30 });
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error(`fixture ${id}: the tarball has no ${id}/manifest.json`);
  return dir;
}

// One fixture, in its own process: the model reads the page's symbols and
// palette once per process, so two builds must not share one.
async function child() {
  const id = arg('child');
  const root = await ensureFixture(id);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', name), 'utf8'));
  const data = Object.fromEntries(DATA_SOURCES.map((n) => [n, read(`${n}.geojson`)]));
  const meta = read('meta.json');
  const site = manifest.url;
  const all = JSON.parse(fs.readFileSync(path.join(HERE, 'finds.json'), 'utf8')).finds;
  const finds = all.filter((f) => f.seen_on.some((c) => manifest.commit.startsWith(c)));
  const doPlant = flag('plant');
  const planting = doPlant
    ? await plant(data, { root, seed: Number(arg('seed', '1')), per: Number(arg('per', '3')), avoid: all.flatMap((f) => f.points) })
    : { data, planted: [] };

  const places = [
    ...finds.flatMap((f) => f.points.map(([lon, lat]) => ({ lon, lat, zooms: [...new Set([f.zoom, 17, 14])], why: 'find' }))),
    ...planting.planted.flatMap((p) => p.points.map(([lon, lat]) => ({ lon, lat, zooms: [17, 16, 14], why: 'planted' }))),
  ];
  const themes = [...new Set(['dark', ...finds.map((f) => f.theme)])];
  const clean = [];
  for (const theme of themes) clean.push(...await runChecks({ root, data, meta, theme, site, extraPlaces: places }));

  const score = (target, findings, refZoom, before = []) => {
    const hits = catches(target, findings, { refZoom, clean: before });
    const pipe = hits.filter((f) => PIPELINE.has(f.where));
    return { pipeline: pipe.length > 0, looking: hits.length > 0, by: [...new Set(hits.map(brief))].slice(0, 4) };
  };
  const findScores = finds.map((f) => ({
    id: f.id, kind: f.kind, said: f.said, confidence: f.confidence,
    ...score(f, clean.filter((c) => c.theme === f.theme), f.zoom),
  }));

  let plantedScores = [];
  if (doPlant) {
    const after = await runChecks({ root, data: planting.data, meta, theme: 'dark', site, extraPlaces: places });
    const before = clean.filter((c) => c.theme === 'dark');
    plantedScores = planting.planted.map((p) => ({ id: p.id, kind: p.kind, detail: p.detail, points: p.points, ...score(p, after, 17, before) }));
  }

  // What the report finds on the unplanted build that no find explains: real
  // faults nobody has logged, or false alarms. Not scored; listed for triage.
  const pipelineClean = clean.filter((c) => PIPELINE.has(c.where) && c.theme === 'dark');
  const unexplained = pipelineClean.filter((c) => !finds.some((f) => catches(f, [c], { refZoom: f.zoom }).length));
  const byKind = {};
  for (const c of unexplained) byKind[`${c.check}/${c.kind}`] = (byKind[`${c.check}/${c.kind}`] ?? 0) + 1;

  process.stdout.write(`\n${JSON.stringify({ fixture: id, commit: manifest.commit, url: site, finds: findScores, planted: plantedScores, unexplained: { total: unexplained.length, byKind } })}\n`);
}

function runChild(id, extra) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', id, ...extra], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`fixture ${id}: exit ${code}`));
      resolve(JSON.parse(out.trim().split('\n').at(-1)));
    });
  });
}

async function main() {
  const fixtures = arg('fixtures', Object.keys(FIXTURE_LIST.fixtures).join(',')).split(',');
  const plantOn = arg('plant-on', FIXTURE_LIST.plant_on);
  const seed = arg('seed', '1');
  const per = arg('per', '3');
  const results = [];
  for (const id of fixtures) {
    const extra = id === plantOn ? ['--plant', '--seed', seed, '--per', per] : [];
    results.push(await runChild(id, extra));
  }

  const yes = (b) => (b ? 'yes' : ' - ');
  const lines = [];
  const say = (s = '') => { lines.push(s); console.log(s); };
  for (const r of results) {
    if (r.finds.length) {
      say(`\nFinds seen on ${r.fixture} (${r.url})`);
      say('  caught by the report | when pointed there | find');
      for (const f of r.finds) say(`  ${yes(f.pipeline).padEnd(20)} | ${yes(f.looking).padEnd(18)} | ${f.id}: ${f.said}${f.by.length ? `\n${' '.repeat(26)}by ${f.by.join('; ')}` : ''}`);
      say(`  ${r.finds.filter((f) => f.pipeline).length} of ${r.finds.length} caught by the report; ${r.finds.filter((f) => f.looking).length} of ${r.finds.length} when the checks are pointed at each place`);
    }
    if (r.planted.length) {
      say(`\nFaults planted in ${r.fixture} (seed ${seed}, ${per} of each kind)`);
      say('  kind            caught by the report | when pointed there | what was planted');
      const kinds = [...new Set(r.planted.map((p) => p.kind))];
      for (const k of kinds) {
        const ps = r.planted.filter((p) => p.kind === k);
        say(`  ${k.padEnd(15)} ${`${ps.filter((p) => p.pipeline).length} of ${ps.length}`.padEnd(20)} | ${`${ps.filter((p) => p.looking).length} of ${ps.length}`.padEnd(18)} | ${KINDS[k].about}`);
      }
      say(`  total: ${r.planted.filter((p) => p.pipeline).length} of ${r.planted.length} by the report; ${r.planted.filter((p) => p.looking).length} of ${r.planted.length} when pointed there`);
      const missingKinds = Object.keys(KINDS).filter((k) => !kinds.includes(k));
      if (missingKinds.length) say(`  not planted (no candidate in this build): ${missingKinds.join(', ')}`);
    }
    say(`\n${r.fixture}: the report's ${r.unexplained.total} findings on the unplanted build that no find explains: ${JSON.stringify(r.unexplained.byKind)}`);
  }

  const outDir = path.join(HERE, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'recall.json'), JSON.stringify({ generated: new Date().toISOString(), seed: Number(seed), per: Number(per), results }, null, 2));
  fs.writeFileSync(path.join(outDir, 'recall.txt'), `${lines.join('\n')}\n`);

  // The ratchet: nothing baseline.json had caught may be missed now.
  const now = {};
  for (const r of results) {
    for (const f of r.finds) now[`find ${r.fixture} ${f.id}`] = { pipeline: f.pipeline, looking: f.looking };
    const kinds = [...new Set(r.planted.map((p) => p.kind))];
    for (const k of kinds) {
      const ps = r.planted.filter((p) => p.kind === k);
      now[`planted ${r.fixture} ${k}`] = { pipeline: ps.filter((p) => p.pipeline).length, looking: ps.filter((p) => p.looking).length, of: ps.length };
    }
  }
  const baseFile = path.join(HERE, 'baseline.json');
  if (flag('update-baseline')) {
    fs.writeFileSync(baseFile, `${JSON.stringify({ seed: Number(seed), per: Number(per), scores: now }, null, 2)}\n`);
    console.log(`\nwrote ${path.relative(REPO, baseFile)}`);
    return;
  }
  if (!fs.existsSync(baseFile)) {
    console.log('\nno baseline.json yet: run with --update-baseline to set one');
    return;
  }
  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  if (base.seed !== Number(seed) || base.per !== Number(per)) {
    console.log(`\nbaseline.json was made with seed ${base.seed}, ${base.per} of each; not compared`);
    return;
  }
  const worse = [];
  for (const [key, was] of Object.entries(base.scores)) {
    const is = now[key];
    if (!is) { worse.push(`${key}: no longer scored`); continue; }
    for (const m of ['pipeline', 'looking']) if (Number(is[m]) < Number(was[m])) worse.push(`${key}: ${m} ${Number(was[m])} -> ${Number(is[m])}`);
  }
  const better = Object.entries(now).filter(([k, v]) => base.scores[k] && ['pipeline', 'looking'].some((m) => Number(v[m]) > Number(base.scores[k][m]))).map(([k]) => k);
  if (better.length) console.log(`\nbetter than baseline.json: ${better.join('; ')} (run with --update-baseline to keep it)`);
  if (worse.length) {
    console.error(`\nworse than baseline.json:\n  ${worse.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nnothing worse than baseline.json');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--child')) await child();
  else await main();
}
