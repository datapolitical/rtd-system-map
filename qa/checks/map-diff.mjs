// What a branch changes in the map's faults (issue #45): the findings of
// `npm run check:map` on a branch's preview against those on main's live site,
// both from the branch's own checks, so a difference is the map, not the
// checker.
//
//   node qa/checks/map-diff.mjs --base main/findings.json --head branch/findings.json [--out dir] [--status]
//
// A finding on the branch is the same as one on main when it is the same
// check and kind within `--metres` (default 10) on the ground. Writes
// diff.json and diff.md to --out, adds diff.md to the run's summary when
// GITHUB_STEP_SUMMARY is set, and with --status posts a commit status named
// checks/map: failure when the branch adds a fault main doesn't have.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const M_LAT = 110_540;
const metres = (a, b) => {
  const lat = (a.lat + b.lat) / 2;
  return Math.hypot((a.lon - b.lon) * 111_320 * Math.cos((lat * Math.PI) / 180), (a.lat - b.lat) * M_LAT);
};

/**
 * The findings only the head has (new) and only the base has (gone).
 * @param {Array} base findings [{check, kind, lat, lon, ...}]
 * @param {Array} head findings
 */
export function diffFindings(base, head, { within = 10 } = {}) {
  const same = (a, b) => a.check === b.check && a.kind === b.kind && metres(a, b) <= within;
  const added = head.filter((h) => !base.some((b) => same(b, h)));
  const gone = base.filter((b) => !head.some((h) => same(b, h)));
  return { added, gone, kept: head.length - added.length };
}

const byKind = (list) => {
  const out = {};
  for (const f of list) out[`${f.check}/${f.kind}`] = (out[`${f.check}/${f.kind}`] ?? 0) + 1;
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
};

export function markdown({ added, gone, kept }, { base, head }) {
  const lines = [`### The map's faults on this branch against main`, ''];
  lines.push(`${added.length} new, ${gone.length} gone, ${kept} the same (${head.site ?? 'branch'} against ${base.site ?? 'main'}).`, '');
  if (added.length) {
    lines.push(`**New:** ${byKind(added).map(([k, n]) => `${n} ${k}`).join(', ')}`, '');
    for (const f of added.slice(0, 40)) lines.push(`- ${f.check}/${f.kind} z${(f.zooms ?? [f.zoom]).join(',')}: ${f.msg} ([open](${f.link}))`);
    if (added.length > 40) lines.push(`- ... and ${added.length - 40} more (diff.json)`);
    lines.push('');
  }
  if (gone.length) {
    lines.push(`**Gone:** ${byKind(gone).map(([k, n]) => `${n} ${k}`).join(', ')}`, '');
    for (const f of gone.slice(0, 20)) lines.push(`- ${f.check}/${f.kind} z${(f.zooms ?? [f.zoom]).join(',')}: ${f.msg}`);
    if (gone.length > 20) lines.push(`- ... and ${gone.length - 20} more (diff.json)`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const arg = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
  };
  const basePath = arg('base'), headPath = arg('head');
  if (!basePath || !headPath) {
    console.error('usage: map-diff.mjs --base <findings.json> --head <findings.json> [--out dir] [--status] [--metres 10]');
    process.exit(2);
  }
  const out = arg('out', path.dirname(headPath));
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
  const diff = diffFindings(base.findings, head.findings, { within: Number(arg('metres', '10')) });
  const md = markdown(diff, { base, head });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'diff.json'), JSON.stringify({ base: base.site, head: head.site, ...diff }, null, 2));
  fs.writeFileSync(path.join(out, 'diff.md'), md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);

  if (process.argv.includes('--status')) {
    const repo = process.env.GITHUB_REPOSITORY, sha = process.env.GITHUB_SHA;
    const runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    const state = diff.added.length ? 'failure' : 'success';
    const kinds = byKind(diff.added).slice(0, 4).map(([k, n]) => `${n} ${k.split('/')[1]}`).join(', ');
    const description = (diff.added.length
      ? `${diff.added.length} new map faults against main (${kinds}); ${diff.gone.length} gone`
      : `No new map faults against main; ${diff.gone.length} gone`).slice(0, 140);
    console.log(`${state}: ${description}`);
    execFileSync('gh', ['api', '-X', 'POST', `repos/${repo}/statuses/${sha}`, '-f', `state=${state}`, '-f', 'context=checks/map', '-f', `description=${description}`, '-f', `target_url=${runUrl}`], { stdio: 'inherit' });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
