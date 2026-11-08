#!/usr/bin/env node
// Pick this run's job, or none, and print it for agent.yml. Read-only: it
// makes no label changes. Pure Node plus `gh` (GH_TOKEN) and git, so the
// workflow runs it before installing anything.
//
//   node .github/daily/pick.mjs [--issue N]
//
// Prints one JSON line:
//   {job: "fix"|"find"|"none", issue, branch, kind, lens, date, summary,
//    reason, was_in_progress}
//
// Every job spends model time, so the worker works only when there is a
// reason to. In order:
//   1. --issue N: someone started the workflow by hand for that issue.
//   2. Instructions waiting, oldest issue first: an issue labelled
//      `agent instructions` (the evaluator's revise, or work queued by
//      hand), or a `needs Chris` issue where Chris commented after the
//      last evaluator comment. Skipped while the issue is `in progress`
//      (an agent has it) or `ready for evaluation` (waiting on the
//      evaluator).
//   3. A review pass, at most once a day, when the map's code on main
//      (MAP_PATHS) has changed since the last review run.
// Otherwise none, and the workflow stops before installing anything.
// Open issues are not picked on their own: label one `agent instructions`
// to queue it.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// What the map is made of. The wiki script is in scripts/ but draws nothing.
const MAP_PATHS = ['public', 'scripts', 'functions', 'live', ':!scripts/wiki.mjs'];

const args = process.argv.slice(2);
const issueInput = args.includes('--issue') ? args[args.indexOf('--issue') + 1] : null;
const repo = process.env.GITHUB_REPOSITORY || 'datapolitical/rtd-system-map';
const gh = (a) => JSON.parse(execFileSync('gh', ['api', a], { encoding: 'utf8' }));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const comments = (n) => gh(`repos/${repo}/issues/${n}/comments?per_page=100`);
const issue = (n) => gh(`repos/${repo}/issues/${n}`);

const has = (i, l) => (i.labels || []).some((x) => x.name === l);
const now = new Date();
const today = now.toISOString().slice(0, 10);
const say = (o) => { console.log(JSON.stringify({ date: today, ...o })); process.exit(0); };

// The ledger (written back by agent.yml). Absent on the first run.
let ledger = { lenses: {}, rounds: {}, runs: [] };
try {
  ledger = { ...ledger, ...JSON.parse(git('show', 'origin/daily-ledger:ledger.json')) };
} catch { /* first run */ }

function branchOf(i) {
  for (const c of [...comments(i.number)].reverse()) {
    const m = (c.body || '').match(/Working on branch `([^`]+)`/);
    if (m) return m[1];
  }
  return null;
}
// `docs` lets the brief send the work to main fast-forward, so it is given
// only when the issue clearly is docs, tests or CI. Anything unsure is a
// map change: a branch, a preview and an evaluation.
function kindOf(i) {
  if (has(i, 'documentation')) return 'docs';
  if (/^Nightly checks\b|\bCI\b|\bunit tests\b/.test(i.title || '')) return 'docs';
  return 'map';
}
const fix = (i, why) => say({
  job: 'fix', issue: i.number, branch: branchOf(i), kind: kindOf(i),
  was_in_progress: has(i, 'in progress'), summary: `#${i.number} ${i.title}`, reason: why,
});

// 1. Started by hand for one issue.
if (issueInput) {
  const i = issue(Number(issueInput));
  if (i.state !== 'open') say({ job: 'none', summary: `#${i.number} is closed`, reason: 'the issue given by hand is closed' });
  fix(i, 'started by hand');
}

// 2. Instructions waiting.
const open = gh(`repos/${repo}/issues?state=open&sort=created&direction=asc&per_page=100`)
  .filter((i) => !i.pull_request && i.title !== 'Agent log');
function chrisAfterEvaluator(i) {
  const cs = comments(i.number);
  const lastEv = [...cs].reverse().find((c) => /^(Instructions for the agent|Evaluation request)/.test((c.body || '').trimStart()));
  // The evaluator and Claude sessions post from Chris's account too; they mark
  // every comment with <!-- agent -->, so only unmarked comments are his.
  const lastChris = [...cs].reverse().find((c) => c.user?.login === 'datapolitical' && c.author_association !== 'NONE' && !(c.body || '').includes('<!-- agent -->') && !/^(Instructions for the agent|Evaluation request)/.test((c.body || '').trimStart()) && !(c.body || '').startsWith('Agent log'));
  if (!lastChris) return false;
  return !lastEv || new Date(lastChris.created_at) > new Date(lastEv.created_at);
}
const free = open.filter((i) => !has(i, 'in progress') && !has(i, 'ready for evaluation'));
const queued = free.find((i) => has(i, 'agent instructions'));
if (queued) fix(queued, 'instructions waiting (agent instructions)');
const answered = free.find((i) => has(i, 'needs Chris') && chrisAfterEvaluator(i));
if (answered) fix(answered, 'Chris answered on a needs Chris issue');

// 3. A review pass when the map changed on main since the last review run.
const reviews = (ledger.runs || []).filter((r) => r.job === 'find' && r.ts);
const lastReview = reviews.at(-1);
if (lastReview?.ts?.slice(0, 10) === today) say({ job: 'none', summary: 'nothing to do', reason: 'no instructions waiting; a review already ran today' });
const changed = git('log', '--format=%h %s', ...(lastReview ? [`--since=${lastReview.ts}`] : ['-1']), 'origin/main', '--', ...MAP_PATHS);
if (!changed) say({ job: 'none', summary: 'nothing to do', reason: `no instructions waiting; the map on main is unchanged since the last review (${lastReview.ts})` });

const lenses = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.github/daily/lenses.json'), 'utf8'));
function pickLens() {
  let best = null, bestScore = null;
  for (const [i, lens] of lenses.entries()) {
    const runs = ledger.lenses?.[lens.id]?.runs || [];
    if (!runs.length) {
      const score = 1e9 - i;
      if (bestScore === null || score > bestScore) { best = lens; bestScore = score; }
      continue;
    }
    const days = (new Date(today) - new Date(runs[runs.length - 1].date)) / 86400000;
    if (days < 1) continue;
    const recent = runs.slice(-3).map((r) => r.findings ?? 0);
    if (runs.length >= 3 && recent.every((f) => f === 0) && days < 14) continue;
    const score = days * (1 + 0.5 * Math.min(recent.at(-1) ?? 0, 4));
    if (bestScore === null || score > bestScore) { best = lens; bestScore = score; }
  }
  if (!best) best = [...lenses].sort((a, b) => {
    const da = (ledger.lenses?.[a.id]?.runs || []).at(-1)?.date || '0001-01-01';
    const db = (ledger.lenses?.[b.id]?.runs || []).at(-1)?.date || '0001-01-01';
    return da < db ? -1 : 1;
  })[0];
  return best;
}
const lens = pickLens();
const n = changed.split('\n').length;
say({ job: 'find', lens: lens.id, summary: `review: ${lens.id}`, reason: lastReview ? `the map on main changed since the last review (${n} commit${n === 1 ? '' : 's'})` : 'no review has run yet' });
