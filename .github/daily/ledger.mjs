#!/usr/bin/env node
// Write the run's ledger back to the orphan branch `daily-ledger`.
// Called by agent.yml after the agent step; the agent never touches it.
//
//   node .github/daily/ledger.mjs <job.json> [model]
//
// job.json is pick.mjs's output plus finish.mjs's outcome:
//   {job, issue, lens, date, model, reason, finished, output, tries,
//    filed, evaluation}
// `rounds` counts evaluation requests, so a run that stopped short does not
// move an issue to its next round.
// It reads the current ledger from origin/daily-ledger (or seeds one),
// applies this run, and pushes the branch (create if absent).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const job = JSON.parse(fs.readFileSync(process.argv[2] || 'job.json', 'utf8'));
const model = process.argv[3] || (job.model || '');
const run = (c) => execFileSync('bash', ['-c', c], { encoding: 'utf8' });
run('git fetch origin daily-ledger --quiet 2>/dev/null || true');

let ledger;
try {
  ledger = JSON.parse(run('git show origin/daily-ledger:ledger.json'));
} catch {
  ledger = {
    lenses: {}, areas: { stations: {}, routes: {}, views: [] }, spec_sections: {},
    trips: [], filed: [], dont_refile: [],
    my_branches: ['union-platforms', 'bus-round4', 'github-checks', 'union-building'],
    rounds: {}, last_main_sha: null, last_feed: null, runs: [],
  };
}
ledger.runs ||= [];
ledger.rounds ||= {};
const entry = {
  date: job.date || new Date().toISOString().slice(0, 10), job: job.job, model: model || null, ts: new Date().toISOString(),
  reason: job.reason || null, finished: job.finished ?? null, output: job.output ?? null, tries: job.tries ?? null,
};
if (job.issue) {
  entry.issue = job.issue;
  if ((job.evaluation || []).includes(job.issue)) ledger.rounds[String(job.issue)] = (ledger.rounds[String(job.issue)] || 0) + 1;
  if (job.branch) {
    ledger.my_branches ||= [];
    if (!ledger.my_branches.includes(job.branch)) ledger.my_branches.push(job.branch);
  }
}
if (job.job === 'find' && job.lens) {
  ledger.lenses ||= {};
  ledger.lenses[job.lens] ||= { runs: [] };
  ledger.lenses[job.lens].runs.push({ date: entry.date, findings: Array.isArray(job.filed) ? job.filed.length : null, issues: job.filed || [] });
  for (const n of job.filed || []) ledger.filed.push?.({ issue: n, lens: job.lens, date: entry.date, outcome: 'open' });
}
ledger.runs.push(entry);
fs.writeFileSync('/tmp/ledger.json', JSON.stringify(ledger, null, 2) + '\n');
// Update the orphan branch in a temp worktree so the runner's checkout is untouched.
run('git fetch origin daily-ledger --quiet 2>/dev/null || true');
let onLedger = false;
try { run('git rev-parse --verify origin/daily-ledger >/dev/null'); onLedger = true; } catch {}
if (onLedger) {
  execFileSync('git', ['checkout', '-q', '-B', 'daily-ledger', 'origin/daily-ledger'], { stdio: 'inherit' });
} else {
  execFileSync('git', ['checkout', '-q', '--orphan', 'daily-ledger'], { stdio: 'inherit' });
  execFileSync('git', ['rm', '-rfq', '.'], { stdio: 'inherit' });
}
run('cp /tmp/ledger.json ledger.json');
execFileSync('git', ['add', 'ledger.json'], { stdio: 'inherit' });
execFileSync('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '-m', `Ledger: ${job.summary || job.job} on ${entry.date}`], { stdio: 'inherit' });
execFileSync('git', ['push', '-u', 'origin', 'daily-ledger'], { stdio: 'inherit' });
execFileSync('git', ['checkout', '-q', '-'], { stdio: 'inherit' });
console.log(`ledger updated: ${entry.date} ${job.job}${job.issue ? ' #' + job.issue : ''} model=${model || 'none'}`);
