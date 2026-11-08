// What the checks tell GitHub: one issue per failing spec, and the one-line
// status on a branch's commit.
//
//   node qa/checks/github.mjs issues --site <url> [--close] [--dry-run]
//   node qa/checks/github.mjs status [--dry-run]
//
// The issues mode reads Playwright's JSON report (CHECK_JSON), opens an issue
// labelled "found by checks" for each spec that failed, or comments on the
// open one, listing the findings its detector specs attached and linking the
// run. With --close (the nightly only: the live site is the authority) it
// comments on and closes an open issue for each spec that passed again.
// The status mode posts the branch preview's summary as a commit status.
//
// The issue text is about the map only: spec names, failing tests, detector
// findings (place, zoom, theme) and the run's link. Nothing about the
// machines or their cost.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const LABEL = 'found by checks';
const repo = process.env.GITHUB_REPOSITORY || 'datapolitical/rtd-system-map';
const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
const runUrl = `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID || '0'}`;
const sha = process.env.GITHUB_SHA || '';
const dry = process.argv.includes('--dry-run');

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const site = opt('--site') || 'the site';
const reportPath = process.env.CHECK_JSON || 'qa/report/results.json';

const gh = (...a) => {
  if (dry) {
    console.log(`[dry-run] gh ${a.join(' ')}`);
    return '';
  }
  return execFileSync('gh', a, { encoding: 'utf8' }).trim();
};

/** The report's specs, grouped by file: failed tests and their findings. */
function readReport(file) {
  if (!fs.existsSync(file)) throw new Error(`No Playwright report at ${file}`);
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const specs = new Map();
  const walk = (suite, file) => {
    const f = suite.file || file;
    for (const s of suite.specs || []) {
      const entry = specs.get(f) || { file: f, failed: [], passed: [], findings: [], messages: [] };
      for (const t of s.tests || []) {
        const results = t.results || [];
        const bad = results.find((r) => ['failed', 'timedOut', 'interrupted'].includes(r.status));
        const good = results.some((r) => r.status === 'passed');
        if (bad) {
          entry.failed.push(`${t.projectName}: ${s.title}`);
          if (bad.error?.message) entry.messages.push(`${t.projectName}: ${bad.error.message.split('\n')[0]}`);
          for (const a of bad.attachments || []) {
            if (a.contentType !== 'application/json' || !a.path || !fs.existsSync(a.path)) continue;
            try {
              const data = JSON.parse(fs.readFileSync(a.path, 'utf8'));
              for (const x of Array.isArray(data) ? data : []) {
                entry.findings.push({
                  kind: x.kind || 'finding',
                  severity: x.severity ?? 0,
                  msg: String(x.msg || x.message || '').replace(/\s+/g, ' '),
                  zoom: x.zoom,
                  theme: x.theme,
                  where: x.lat != null ? `${x.lat}, ${x.lon}` : '',
                  capture: a.name?.replace(/\.json$/, '.png') || path.basename(a.path).replace(/\.json$/, '.png'),
                });
              }
            } catch { /* not a findings file */ }
          }
        } else if (good) entry.passed.push(`${t.projectName}: ${s.title}`);
      }
      if (entry.failed.length || entry.passed.length) specs.set(f, entry);
    }
    for (const s of suite.suites || []) walk(s, f);
  };
  for (const s of report.suites || []) walk(s, '');
  return specs;
}

const name = (file) => path.basename(file);
const findingLines = (entry) => {
  const list = entry.findings
    .slice()
    .sort((a, b) => a.severity - b.severity)
    .slice(0, 20)
    .map((x) => {
      const at = [x.zoom != null ? `at zoom ${x.zoom}` : '', x.theme || '', x.where].filter(Boolean).join(' ');
      return `- ${x.kind}${at ? ` (${at})` : ''}: ${x.msg.slice(0, 300)}${x.capture ? ` — capture \`${x.capture}\`` : ''}`;
    });
  if (entry.findings.length > 20) list.push(`- ...and ${entry.findings.length - 20} more in the artifact`);
  return list;
};

function openIssues() {
  const out = gh('issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title,comments', '--limit', '100');
  return out ? JSON.parse(out) : [];
}

/** A comment is sent once per site and failure signature, not on every push. */
function seen(issue, marker) {
  return (issue.comments || []).some((c) => (c.body || '').includes(marker));
}

function issuesMode() {
  const specs = [...readReport(reportPath).values()].filter((s) => s.failed.length || s.passed.length);
  const failed = specs.filter((s) => s.failed.length);
  const passed = specs.filter((s) => !s.failed.length && s.passed.length);
  console.log(`${failed.length} spec(s) failing, ${passed.length} passing on ${site}`);
  if (!failed.length && !passed.length) return;

  const open = openIssues();
  for (const entry of failed) {
    const title = `Checks: ${name(entry.file)} fails`;
    const fingerprint = crypto.createHash('sha1').update(entry.failed.slice().sort().join('|')).digest('hex').slice(0, 10);
    const marker = `<!-- checks ${crypto.createHash('sha1').update(site).digest('hex').slice(0, 8)} ${fingerprint} -->`;
    const issue = open.find((i) => i.title === title);
    const testLines = entry.failed.map((t) => `- ${t}`).join('\n');
    const messageLines = entry.messages.slice(0, 5).map((m) => `- ${m.slice(0, 300)}`);
    const findings = findingLines(entry);
    const body = [
      `${failed.length === 1 ? 'This spec' : 'The checks'} failed on ${site} in [this run](${runUrl}).`,
      '',
      'Failed tests:',
      testLines,
      ...(messageLines.length ? ['', 'What failed:', ...messageLines] : []),
      ...(findings.length ? ['', `Findings (${entry.findings.length}):`, ...findings] : []),
      '',
      `The report and captures are the run's artifact: ${runUrl}#artifacts`,
      marker,
    ].join('\n');
    if (issue) {
      if (seen(issue, marker)) {
        console.log(`#${issue.number} already says this; no comment`);
        continue;
      }
      console.log(`Commenting on #${issue.number}: ${title}`);
      gh('issue', 'comment', String(issue.number), '--body', body);
    } else {
      console.log(`Opening: ${title}`);
      gh('issue', 'create', '--title', title, '--label', LABEL, '--body', body);
    }
  }

  if (!args.includes('--close')) return;
  for (const entry of passed) {
    const title = `Checks: ${name(entry.file)} fails`;
    const issue = open.find((i) => i.title === title);
    if (!issue) continue;
    const marker = `<!-- checks ${crypto.createHash('sha1').update(site).digest('hex').slice(0, 8)} pass -->`;
    const body = `Passing again on ${site} in [this run](${runUrl}).\n${marker}`;
    console.log(`Closing #${issue.number}: ${title}`);
    gh('issue', 'close', String(issue.number), '--comment', body);
  }
}

function statusMode() {
  let specs = [];
  try {
    specs = [...readReport(reportPath).values()].filter((s) => s.failed.length || s.passed.length);
  } catch (e) {
    console.log(e.message);
  }
  const skip = process.env.NO_PREVIEW === 'true';
  const failed = specs.filter((s) => s.failed.length);
  const names = failed.map((s) => name(s.file).replace(/\.spec\.mjs$/, ''));
  const description = skip
    ? 'No preview: this push does not change the site'
    : !specs.length
      ? 'The checks did not run: no report (no preview, or the run stopped first)'
      : failed.length
        ? `${specs.length - failed.length} of ${specs.length} specs passed; failed: ${names.join(', ')}`.slice(0, 140)
        : `All ${specs.length} specs passed`;
  const state = skip ? 'success' : failed.length || !specs.length ? 'failure' : 'success';
  console.log(`${state}: ${description}`);
  const body = ['api', '-X', 'POST', `repos/${repo}/statuses/${sha}`, '-f', `state=${state}`, '-f', 'context=checks/preview', '-f', `description=${description}`, '-f', `target_url=${runUrl}`];
  gh(...body);
}

try {
  if (mode === 'issues') issuesMode();
  else if (mode === 'status') statusMode();
  else {
    console.error('usage: github.mjs issues --site <url> [--close] | status');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
