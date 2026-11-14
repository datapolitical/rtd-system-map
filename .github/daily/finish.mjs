#!/usr/bin/env node
// After the agent: what the run really did, read from GitHub rather than
// from the model's own account, and the labels that follow from it.
// Called by agent.yml; the agent never runs it.
//
//   node .github/daily/finish.mjs
//
// Reads from the environment: JOB_FILE (pick.mjs's job), REFS_BEFORE
// (`git ls-remote --heads origin` before the agent ran), RUN_START (ISO
// time the agent started), FINISHED (yes when the agent wrote
// daily-summary.txt), TRIES, MODEL, MODEL_ERROR (yes when the model
// failed straight away), SUMMARY_FILE, RUN_URL, DRY_RUN (change nothing).
// Writes outcome.json for the ledger and prints the Agent log line.
//
// The agent's own comments and issues are the ones the Actions bot posted
// since the run began. The checks it starts post as the same bot, so they
// count too (they were told apart by a "Made by:" line, dropped 2026-11-13
// while the Agent workflow is off). Its pushes are
// the branches GitHub Actions pushed during the run (the repo's activity
// list), not every branch that moved: mini pushes too.
//
// Labels, for a fix job, so a finished or stuck issue never comes back to
// the worker by itself:
// - It asked for evaluation: `ready for evaluation` on, and
//   `agent instructions`, `needs Chris` and `in progress` off. The
//   instructions are answered; the evaluator has it now.
// - The model failed straight away: `in progress` off (if this run put it
//   there) and nothing else, so the next run tries the same job again.
// - It stopped any other way: `agent instructions` and `in progress` off,
//   `needs Chris` on, and a one-line comment on the issue saying why, so
//   it waits for a person instead of being picked again every run. A run
//   started by hand (a trial) only takes `in progress` off: whoever
//   started it reads the Agent log line.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = process.env;
const repo = env.GITHUB_REPOSITORY || 'datapolitical/rtd-system-map';
const job = JSON.parse(fs.readFileSync(env.JOB_FILE || 'job.json', 'utf8'));
const start = env.RUN_START;
const finished = env.FINISHED === 'yes';
const tries = Number(env.TRIES || 0);
// Zero tries: a setup step failed and the model never ran.
const modelError = env.MODEL_ERROR === 'yes' || tries === 0;
const model = env.MODEL || '';
const runUrl = env.RUN_URL || '';
const ghRaw = (args) => execFileSync('gh', args, { encoding: 'utf8' });
// DRY_RUN=1: read everything, change nothing (for trying it by hand).
const ghWrite = (args) => env.DRY_RUN ? console.error('would run: gh ' + args.join(' ')) : ghRaw(args);
const gh = (path) => JSON.parse(ghRaw(['api', '--paginate', '--slurp', path])).flat();
const mark = '<!-- agent -->';

// Branches the run pushed (the ledger's own branch aside).
const heads = (text) => new Map(text.split('\n').filter(Boolean).map((l) => {
  const [sha, ref] = l.split(/\s+/);
  return [ref.replace('refs/heads/', ''), sha];
}));
const before = heads(fs.existsSync(env.REFS_BEFORE || '') ? fs.readFileSync(env.REFS_BEFORE, 'utf8') : '');
const after = heads(execFileSync('git', ['ls-remote', '--heads', 'origin'], { encoding: 'utf8' }));
// A branch can move during the run because someone else pushed it (mini
// pushes as Chris's account), so count only branches GitHub Actions pushed
// since the run began. If the activity list can't be read, fall back to
// every branch that moved.
let byActions = null;
try {
  const activity = JSON.parse(ghRaw(['api', `repos/${repo}/activity?time_period=day&per_page=100`]));
  byActions = new Set(activity.filter((a) => a.actor?.login === 'github-actions[bot]' && start && a.timestamp >= start).map((a) => a.ref.replace('refs/heads/', '')));
} catch (e) {
  console.error(`could not read the push activity, counting every branch that moved: ${e.message.split('\n')[0]}`);
}
const pushed = [...after].filter(([b, sha]) => b !== 'daily-ledger' && before.get(b) !== sha && (!byActions || byActions.has(b))).map(([branch, sha]) => ({ branch, sha }));

// Comments and issues the agent made since it started.
const mine = (x) => x.user?.login === 'github-actions[bot]' && x.created_at >= start;
const numberOf = (url) => Number(url.split('/').pop());
const comments = start ? gh(`repos/${repo}/issues/comments?since=${start}&per_page=100`).filter(mine) : [];
const filed = start ? gh(`repos/${repo}/issues?state=all&since=${start}&per_page=100`).filter((i) => !i.pull_request && mine(i)).map((i) => i.number) : [];
const commented = [...new Set(comments.map((c) => numberOf(c.issue_url)))].filter((n) => !filed.includes(n));
const evaluation = [...new Set(comments.filter((c) => /^Evaluation request/.test((c.body || '').trimStart())).map((c) => numberOf(c.issue_url)))];

const output = job.job === 'find' ? filed.length + commented.length > 0 : pushed.length + evaluation.length > 0;
const summary = fs.existsSync(env.SUMMARY_FILE || '') ? fs.readFileSync(env.SUMMARY_FILE, 'utf8').trim().split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' ') : '';

// Labels for a fix job.
let labelled = '';
if (job.job === 'fix' && job.issue) {
  const n = String(job.issue);
  const issue = JSON.parse(ghRaw(['api', `repos/${repo}/issues/${n}`]));
  const has = (l) => (issue.labels || []).some((x) => x.name === l);
  const edit = (add, remove) => {
    const a = add.filter((l) => !has(l));
    const r = remove.filter((l) => has(l));
    if (!a.length && !r.length) return;
    ghWrite(['issue', 'edit', n, ...a.flatMap((l) => ['--add-label', l]), ...r.flatMap((l) => ['--remove-label', l])]);
  };
  const progress = job.was_in_progress ? [] : ['in progress'];
  if (issue.state !== 'open') {
    labelled = `#${n} is closed`;
  } else if (evaluation.includes(job.issue)) {
    edit(['ready for evaluation'], ['agent instructions', 'needs Chris', ...progress]);
    labelled = `#${n} handed to the evaluator`;
  } else if ((modelError && !output) || job.reason === 'started by hand') {
    edit([], progress);
    labelled = job.reason === 'started by hand' ? `#${n} labels left as they were (started by hand)` : `#${n} left queued for the next run`;
  } else {
    edit(['needs Chris'], ['agent instructions', ...progress]);
    const why = finished ? `the agent stopped without asking for evaluation${summary ? `: ${summary}` : ''}` : `the agent stopped unfinished after ${tries} ${tries === 1 ? 'try' : 'tries'}`;
    ghWrite(['issue', 'comment', n, '--body', `Worker stopped: ${why}. Waiting for a person before the worker takes this again. [Run](${runUrl}).\n\n${mark}`]);
    labelled = `#${n} set to needs Chris`;
  }
}

const parts = [];
for (const p of pushed) parts.push(`pushed ${p.branch} (${p.sha.slice(0, 7)})`);
if (filed.length) parts.push(`filed ${filed.map((n) => `#${n}`).join(', ')}`);
if (commented.length) parts.push(`commented on ${commented.map((n) => `#${n}`).join(', ')}`);
if (evaluation.length) parts.push(`asked for evaluation on ${evaluation.map((n) => `#${n}`).join(', ')}`);
const how = tries === 0 ? 'did not start (a setup step failed)' : modelError ? `failed straight away after ${tries} ${tries === 1 ? 'try' : 'tries'}` : finished ? `finished in ${tries} ${tries === 1 ? 'try' : 'tries'}` : `stopped unfinished after ${tries} ${tries === 1 ? 'try' : 'tries'}`;
const did = output ? parts.join('; ').replace(/^./, (c) => c.toUpperCase()) : `No output${parts.length ? ` (${parts.join('; ')})` : ''}: ${job.job === 'find' ? 'nothing filed or commented' : 'nothing pushed, no evaluation request'}`;
const line = `Agent log: ${job.summary || job.job} — ${model || 'no model'}, ${how}. Why it ran: ${job.reason || 'scheduled'}. ${did}.${labelled ? ` ${labelled[0].toUpperCase()}${labelled.slice(1)}.` : ''}${summary ? ` Summary: ${summary}` : ''} [Run](${runUrl}).`;

fs.writeFileSync('outcome.json', JSON.stringify({ finished, model_error: modelError, tries, output, pushed, filed, commented, evaluation, line }, null, 2) + '\n');
console.log(line);
