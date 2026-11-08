// Waits for Cloudflare Pages' check run on this commit, then prints the
// branch's preview URL as a step output (`url`). Cloudflare creates one check
// run per push, named "Cloudflare Pages", whose summary carries the branch
// preview's address; the branch alias `<branch>.rtd-system-map.pages.dev` is
// the fallback. Fails if the build did, so the checks never run against the
// previous deployment.
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

const deadline = Date.now() + 25 * 60_000;
let run;
while (Date.now() < deadline) {
  try {
    const runs = api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs.filter((r) => r.name === 'Cloudflare Pages');
    run = runs.find((r) => r.status === 'completed') || runs[0];
    if (run?.status === 'completed') break;
    console.log(`Cloudflare Pages: ${run ? `${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}` : 'not started'}`);
  } catch (e) {
    console.log(`waiting: ${String(e.message).split('\n')[0]}`);
  }
  await sleep(15_000);
}
if (!run || run.status !== 'completed') {
  console.error('Cloudflare Pages did not finish within 25 minutes');
  process.exit(1);
}
if (run.conclusion !== 'success') {
  console.error(`Cloudflare Pages finished ${run.conclusion}; there is no new preview to check`);
  process.exit(1);
}

const summary = run.output?.summary || '';
const match = summary.match(/Branch Preview URL:[\s\S]*?href='([^']+)'/);
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
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
