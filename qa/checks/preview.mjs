// Waits for Cloudflare Pages' check run on this commit, then prints the
// address of this commit's build as a step output (`url`). Cloudflare creates
// one check run per push that changes the site, named "Cloudflare Pages",
// whose summary carries the build's own address; the branch alias
// `<branch>.rtd-system-map.pages.dev` is the fallback. A build that fails
// fails this step, so the checks never run against the previous deployment.
//
// A push that only changes files outside the site (this workflow, qa/, docs)
// gets no build: Cloudflare's watch paths skip it. Then the newest earlier
// build on the branch (or the branch alias, if it answers) is still that
// branch's preview and is used; if there is none, `url` is left empty and the
// workflow skips the checks with a notice rather than waiting forever.
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

// This commit's Cloudflare check run, preferring a finished one. Read afresh
// each time it is asked for: Cloudflare replaces its check run when a build
// ends (a new id, already completed), so one held by id stays "in progress"
// for ever and the wait below would run out against a build that was done.
const pagesRun = (of = sha) => {
  const all = api(`repos/${repo}/commits/${of}/check-runs?per_page=100`).check_runs.filter((r) => r.name === 'Cloudflare Pages');
  return all.find((r) => r.status === 'completed') || all[0];
};

// The address of one build, from Cloudflare's summary: the first row titled "Preview URL"
// is that build's own address (<hash>.rtd-system-map.pages.dev), which always opens the
// main map. The branch's alias, in the row after it, opens another page on a branch named
// after one (functions/index.js), and moves on to the next push while these checks run.
const own = (r) => (r?.output?.summary || '').match(/Preview URL:[\s\S]*?href='([^']+)'/)?.[1]?.replace(/\/$/, '');

// How long Cloudflare may take to notice the push and start a build.
const START_BY = Date.now() + 8 * 60_000;
// How long a started build may take.
const BUILD_BY = Date.now() + 25 * 60_000;
let run;
while (Date.now() < START_BY) {
  try {
    run = pagesRun();
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
  // The newest earlier build on this branch, by its own address; the branch's alias if none is found.
  let alias = `https://${branch}.rtd-system-map.pages.dev`;
  try {
    for (const c of api(`repos/${repo}/commits?sha=${sha}&per_page=20`).slice(1)) {
      const built = pagesRun(c.sha);
      if (built?.conclusion === 'success' && own(built)) {
        alias = own(built);
        break;
      }
    }
  } catch (e) {
    console.log(`no earlier build found: ${String(e.message).split('\n')[0]}`);
  }
  for (let i = 0; i < 6; i++) {
    try {
      if ((await fetch(`${alias}/js/main.js`)).ok) {
        console.log('::notice::Cloudflare Pages did not build this push (no site change); using the branch\'s existing preview');
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
  try {
    run = pagesRun() || run;
  } catch (e) {
    console.log(`waiting: ${String(e.message).split('\n')[0]}`);
  }
}
if (run.status !== 'completed') {
  console.error('Cloudflare Pages did not finish within 25 minutes');
  process.exit(1);
}
if (run.conclusion !== 'success') {
  console.error(`Cloudflare Pages finished ${run.conclusion}; there is no new preview to check`);
  process.exit(1);
}

// This build's own address; the branch's alias only if the summary names none.
const url = own(run) || `https://${branch}.rtd-system-map.pages.dev`;

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
