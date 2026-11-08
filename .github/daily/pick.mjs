#!/usr/bin/env node
// Pick one job for today's run and print it for agent.yml to pass to the
// model. Pure Node, no network beyond `gh`; the workflow runs this with
// the repository token as GH_TOKEN.
//
//   node .github/daily/pick.mjs [--issue N]
//
// Prints JSON on the last line:
//   {job: "fix"|"find"|"none", issue, branch, kind, lens, date, summary}
// It also appends the lens run to nothing; the workflow writes the ledger
// back at the end. This script is read-only: it makes no label changes.
//
// Job order (protocol):
//   a. an issue labelled `agent instructions`, or a `needs Chris` issue
//      where Chris commented after the last evaluator comment: do the
//      newest instructions on that issue's branch.
//   b. otherwise the next ready issue: open, not `needs Chris`, not
//      `ready for evaluation`, not `in progress`, not blocked, oldest
//      milestone first. At most two map-change branches in the loop at
//      once; when two are, pick docs/tests/CI/data issues instead.
//   c. otherwise, or the first run each day whatever else is waiting, a
//      review pass under the next lens.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const issueInput = args.includes('--issue') ? args[args.indexOf('--issue') + 1] : null;
const repo = process.env.GITHUB_REPOSITORY || 'datapolitical/rtd-system-map';
const gh = (a) => JSON.parse(execFileSync('gh', ['api', a], { encoding: 'utf8' }));
const list = (q) => gh(`repos/${repo}/issues?${q}&per_page=100&state=open`);
const comments = (n) => gh(`repos/${repo}/issues/${n}/comments?per_page=100`);
const issue = (n) => gh(`repos/${repo}/issues/${n}`);

const has = (i, l) => (i.labels || []).some((x) => x.name === l);
const today = new Date().toISOString().slice(0, 10);

// The ledger (written back by agent.yml). Absent on the first run.
let ledger = { lenses: {}, rounds: {}, my_branches: ['union-platforms', 'bus-round4', 'github-checks', 'union-building'] };
try {
  const raw = execFileSync('git', ['show', 'origin/daily-ledger:ledger.json'], { encoding: 'utf8' });
  ledger = { ...ledger, ...JSON.parse(raw) };
} catch { /* first run */ }

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
    const last = new Date(runs[runs.length - 1].date);
    const days = (new Date(today) - last) / 86400000;
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

const open = list(`state=open&sort=created&direction=asc`);
// a. instructions waiting, oldest first.
const waiting = open.filter((i) => has(i, 'agent instructions') || (has(i, 'needs Chris') && chrisAfterEvaluator(i)));
function chrisAfterEvaluator(i) {
  const cs = comments(i.number);
  const lastEv = [...cs].reverse().find((c) => /^(Instructions for the agent|Evaluation request)/.test((c.body || '').trimStart()));
  const lastChris = [...cs].reverse().find((c) => c.user?.login === 'datapolitical' && c.author_association !== 'NONE' && !/^(Instructions for the agent|Evaluation request)/.test((c.body || '').trimStart()) && !(c.body || '').startsWith('Agent log'));
  if (!lastChris) return false;
  return !lastEv || new Date(lastChris.created_at) > new Date(lastEv.created_at);
}
if (issueInput) {
  const n = Number(issueInput);
  const i = issue(n);
  if (i.state === 'open') {
    console.log(JSON.stringify({ job: 'fix', issue: n, branch: branchOf(i), kind: kindOf(i), date: today, summary: `#${n} ${i.title}` }));
    process.exit(0);
  }
}
const first = waiting.sort((a, b) => a.number - b.number)[0];
if (first) {
  console.log(JSON.stringify({ job: 'fix', issue: first.number, branch: branchOf(first), kind: kindOf(first), date: today, summary: `#${first.number} ${first.title} (instructions waiting)` }));
  process.exit(0);
}
function branchOf(i) {
  const cs = comments(i.number);
  const m = [...cs].reverse().find((c) => /Working on branch `([^`]+)`/.test(c.body || ''));
  return m ? m[1].match(/Working on branch `([^`]+)`/)[1] : null;
}
function kindOf(i) {
  const labels = (i.labels || []).map((l) => l.name);
  const title = (i.title || '').toLowerCase();
  if (labels.includes('documentation') || /docs|test|CI|check/.test(title)) return 'docs';
  return 'map';
}

// b. next ready issue. At most two map-change branches in the loop.
const inLoop = open.filter((i) => ['ready for evaluation', 'agent instructions', 'needs Chris'].some((l) => has(i, l)) && !has(i, 'in progress'));
const mapInLoop = inLoop.filter((i) => kindOf(i) === 'map').length;
const ready = open.filter((i) =>
  !has(i, 'needs Chris') && !has(i, 'ready for evaluation') && !has(i, 'in progress') &&
  !/blocked by #\d+/i.test(i.body || '') && i.milestone?.title !== 'Later');
const order = { 'Buses you can read': 1, 'V3 roadmap': 2, 'Prior-art follow-ups': 3 };
ready.sort((a, b) => (order[a.milestone?.title] ?? 9) - (order[b.milestone?.title] ?? 9) || a.number - b.number);
let next = ready.find((i) => kindOf(i) !== 'map') || (mapInLoop < 2 ? ready[0] : null);
// c. review pass: first run each day, or nothing else waiting.
const ranToday = Object.values(ledger.lenses || {}).some((l) => (l.runs || []).some((r) => r.date === today));
const findToday = !ranToday;
if (findToday && next) {
  const lens = pickLens();
  console.log(JSON.stringify({ job: 'find', lens: lens.id, date: today, summary: `review: ${lens.id} (first run today, ${next ? `#${next.number} waiting` : 'nothing waiting'})` }));
  process.exit(0);
}
if (next) {
  console.log(JSON.stringify({ job: 'fix', issue: next.number, branch: branchOf(next), kind: kindOf(next), date: today, summary: `#${next.number} ${next.title}` }));
  process.exit(0);
}
const lens = pickLens();
console.log(JSON.stringify({ job: 'find', lens: lens.id, date: today, summary: `review: ${lens.id}` }));
