// One command, one report (issue #45): run every fault check the drawn model
// has over the whole district and write findings.json plus a readable
// report.html. Node only — no browser, no screenshots, no vision.
//
//   node qa/checks/report.mjs                     # reads public/data
//   CHECK_URL=https://... node qa/checks/report.mjs  # reads the site's data
//   ... --root <checkout>   # the model from another checkout's page code (the
//                           # site under test is that checkout's build: main's
//                           # live site checked by this branch's checks)
//
// Every finding carries the place on the ground and a link that opens the map
// there at the zoom the fault was found at.
import fs from 'node:fs';
import path from 'node:path';
import { pageSources } from '../drawn/model.mjs';
import { mergeFindings, runChecks } from './run.mjs';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const THEMES = arg('theme', 'dark,light').split(',');
const ZOOMS = arg('zooms', '12,14,16,17').split(',').map(Number);
const VIEWS = Number(arg('views', '10'));
const OUT = arg('out', path.join('qa', 'findings'));
const SITE = arg('url', process.env.CHECK_URL ?? 'https://drawn-map.rtd-system-map.pages.dev').replace(/\/$/, '');
const BASE = (process.env.CHECK_URL ?? '').replace(/\/$/, '');
const ROOT = arg('root', null) && path.resolve(arg('root', null));

const readData = async (name) => {
  if (BASE) return (await fetch(`${BASE}/data/${name}`)).json();
  return JSON.parse(fs.readFileSync(path.join(ROOT ?? '.', 'public', 'data', name), 'utf8'));
};

// The build files the page draws, from the page's own code (network.js).
const data = Object.fromEntries(await Promise.all((await pageSources(ROOT ?? undefined)).map(async (n) => [n, await readData(`${n}.geojson`)])));
const meta = await readData('meta.json');

// The checks themselves are in run.mjs, shared with qa/recall/recall.mjs.
const all = [];
for (const theme of THEMES) all.push(...await runChecks({ ...(ROOT ? { root: ROOT } : {}), data, meta, theme, zooms: ZOOMS, views: VIEWS, site: SITE }));
const findings = mergeFindings(all);

fs.mkdirSync(OUT, { recursive: true });
const payload = { generated: new Date().toISOString(), site: SITE, themes: THEMES, zooms: ZOOMS, total: findings.length, findings };
fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(payload, null, 2));

const counts = {};
for (const f of findings) {
  const k = `${f.check}/${f.kind} (${f.theme})`;
  counts[k] = (counts[k] ?? 0) + 1;
}
console.log(`${findings.length} findings over ${THEMES.length} theme(s), zooms ${ZOOMS.join(', ')}`);
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

const rows = findings.map((f) => `      <tr class="${f.check}">
        <td>${f.check}</td><td>${f.kind}</td><td>${f.theme}</td><td>z${f.zooms.join(', ')}</td>
        <td>${f.route ?? f.layer}</td><td>${f.msg.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
        <td><a href="${f.link}">open</a></td>
      </tr>`).join('\n');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Map findings</title>
<style>
  body { font: 14px/1.45 system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { font-size: 1.3rem; } p { color: #444; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f6f6f6; }
  tr.labels td { background: #fffbe8; }
  a { color: #0645ad; }
</style>
<h1>${findings.length} findings</h1>
<p>${new Date().toISOString()} · ${THEMES.join(', ')} · zooms ${ZOOMS.join(', ')} · <a href="${SITE}">${SITE}</a></p>
<table><thead><tr><th>check</th><th>kind</th><th>theme</th><th>zoom</th><th>route / layer</th><th>finding</th><th></th></tr></thead>
<tbody>
${rows}
</tbody></table>
</html>`;
fs.writeFileSync(path.join(OUT, 'report.html'), html);
console.log(`wrote ${OUT}/findings.json and ${OUT}/report.html`);
