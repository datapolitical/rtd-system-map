// Waits for Cloudflare Pages' check run on this commit, then prints the
// branch's preview URL as a step output (`url`). Cloudflare creates one check
// run per push that changes the site, named "Cloudflare Pages", whose summary
// carries the branch preview's address; the branch alias
// `<branch>.rtd-system-map.pages.dev` is the fallback. A build that fails
// fails this step, so the checks never run against the previous deployment.
//
// A push that only changes files outside the site (this workflow, qa/, docs)
// gets no build: Cloudflare's watch paths skip it. Then the branch alias, if
// it answers from an earlier push, is still that branch's preview and is
// used; if there is none, `url` is left empty and the workflow skips the
// checks with a notice rather than waiting forever.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const branch = process.env.GITHUB_REF_NAME;
if (!repo || !sha || !branch) {
  console.error('preview.mjs needs GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_REF_NAME');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p) => JSON.parse(execFileSync('gh', ['api', p], { encoding: 'utf8' }));
const output = (url) => {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
};

// How long Cloudflare may take to notice the push and start a build.
const START_BY = Date.now() + 8 * 60_000;
// How long a started build may take.
const BUILD_BY = Date.now() + 25 * 60_000;
let run;
while (Date.now() < START_BY) {
  try {
    const runs = api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs.filter((r) => r.name === 'Cloudflare Pages');
    run = runs.find((r) => r.status === 'completed') || runs[0];
    if (run) break;
    console.log('Cloudflare Pages has not started a build for this push');
  } catch (e) {
    console.log(`waiting: ${String(e.message).split('\n')[0]}`);
  }
  await sleep(15_000);
}

if (!run) {
  // No build: the push did not change the site. An earlier deployment of
  // this branch is still this branch's preview.
  const alias = `https://${branch}.rtd-system-map.pages.dev`;
  for (let i = 0; i < 6; i++) {
    try {
      if ((await fetch(`${alias}/js/main.js`)).ok) {
        console.log(`::notice::Cloudflare Pages did not build this push (no site change); using the branch's existing preview`);
        console.log(`preview: ${alias}`);
        output(alias);
        process.exit(0);
      }
    } catch { /* not there yet */ }
    await sleep(5000);
  }
  console.log('::notice::Cloudflare Pages did not build this push (no site change), and the branch has no preview yet; skipping the checks');
  output('');
  process.exit(0);
}

while (run.status !== 'completed' && Date.now() < BUILD_BY) {
  console.log(`Cloudflare Pages: ${run.status}`);
  await sleep(15_000);
  run = api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs.find((r) => r.id === run.id) || run;
}
if (run.status !== 'completed') {
  console.error('Cloudflare Pages did not finish within 25 minutes');
  process.exit(1);
}
if (run.conclusion !== 'success') {
  console.error(`Cloudflare Pages finished ${run.conclusion}; there is no new preview to check`);
  process.exit(1);
}

// Cloudflare's summary names the address in a row titled "Preview URL" (it
// said "Branch Preview URL" when this was written; both are read).
const summary = run.output?.summary || '';
const match = summary.match(/Branch Preview URL:[\s\S]*?href='([^']+)'/) || summary.match(/Preview URL:[\s\S]*?href='([^']+)'/);
const url = (match?.[1] || `https://${branch}.rtd-system-map.pages.dev`).replace(/\/$/, '');

// The deployment answers a moment after the check run turns green.
let up = false;
for (let i = 0; i < 24 && !up; i++) {
  try {
    const res = await fetch(`${url}/js/main.js`);
    up = res.ok;
    if (!up) console.log(`preview answers HTTP ${res.status}`);
  } catch (e) {
    console.log(`preview not answering yet: ${String(e.cause?.code || e.message)}`);
  }
  if (!up) await sleep(5000);
}
if (!up) {
  console.error(`The preview at ${url} does not serve /js/main.js`);
  process.exit(1);
}

console.log(`preview: ${url}`);
output(url);
