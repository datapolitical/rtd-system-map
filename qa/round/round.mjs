// The weekly round (docs/refining.md, "The weekly round"). It looks at the
// live map, finds what is drawn wrong, and posts one review request with Fix
// and Leave on each finding. It never changes the map.
//
//   node qa/round/round.mjs              run this week's round and post it
//   node qa/round/round.mjs --dry-run    run and write the files; post, file and alert nothing
//   node qa/round/round.mjs --no-look    skip the model's look at the captures
//
// Each run:
// 1. Reads Chris's picks on last week's request: Leave is remembered and not
//    proposed again; Fix is filed as a GitHub issue (label "weekly round")
//    unless an issue already names the finding. Then it closes that request.
// 2. Checks out origin/main (the code and data that are live) in a temporary
//    worktree and runs, against the live site, the evidence collector
//    (qa/evaluation/run.mjs: the sheets' whole-feature checks and captures of
//    Union Station at every sheet, a shared station, a terminal and three
//    stations drawn with this week's seed at sheets 1 to 4, both themes),
//    the sheet checks (qa/sheets.mjs) and the route check (qa/accuracy.mjs,
//    on RTD's current GTFS).
// 3. Keeps the check findings that were not there last week, and asks Claude
//    (qa/round/look.md) what is wrong in the captures.
// 4. Posts what it found to the review page and sends one phone alert.
//
// Settings from the environment: RTD_SITE_URL (default the live map);
// RTD_ROUND_STATE (where rounds are kept, default ~/.local/state/rtd-map-round);
// RTD_REVIEW_CTL (the command that runs review/shotctl.py, default
// "python3 review/shotctl.py" in this checkout); RTD_ROUND_SOURCE (a checkout
// to run the checks from instead of origin/main, to test the round itself);
// RTD_ROUND_MODEL (default
// sonnet); CLAUDE_BIN (default claude); PUSHOVER_USER_KEY and
// PUSHOVER_APP_TOKEN for the alert. Runs from a systemd user timer
// (qa/round/systemd/).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = (process.env.RTD_SITE_URL ?? 'https://rtd-system-map.pages.dev').replace(/\/$/, '');
const STATE = process.env.RTD_ROUND_STATE ?? path.join(homedir(), '.local', 'state', 'rtd-map-round');
const CTL = (process.env.RTD_REVIEW_CTL ?? `python3 ${path.join(ROOT, 'review/shotctl.py')}`).split(' ').filter(Boolean);
const MODEL = process.env.RTD_ROUND_MODEL ?? 'sonnet';
const CLAUDE = process.env.CLAUDE_BIN ?? 'claude';
const DRY = process.argv.includes('--dry-run');
const LOOK = !process.argv.includes('--no-look');
const MOST = 12; // findings proposed in one round; the rest are listed
const SAMPLE_ZOOMS = [10, 12, 14, 16];
const KIND_ORDER = ['false-info', 'unreadable', 'weight', 'ambiguous', 'crowding'];
const KIND_NAME = { 'false-info': 'drawn wrong', unreadable: 'hard to read', weight: 'wrong weight', ambiguous: 'unclear which line', crowding: 'crowded' };

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 1)); fs.renameSync(`${file}.tmp`, file); };
const short = (key) => `f${createHash('sha1').update(key).digest('hex').slice(0, 10)}`;
const log = (...xs) => console.log(new Date().toISOString().slice(11, 19), ...xs);

function run(cmd, args, { cwd = ROOT, env = {}, timeout = 30 * 60_000, quiet = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout, maxBuffer: 64 << 20 });
  if (!quiet && r.stdout) process.stdout.write(r.stdout.split('\n').slice(-6).join('\n'));
  if (r.stderr && r.status !== 0) process.stderr.write(r.stderr.split('\n').slice(-12).join('\n'));
  return r;
}

// This week, Monday to Sunday in Denver, as an ISO week.
function thisWeek(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(now).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  return { id: `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, seed: t.getUTCFullYear() * 100 + week, date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

async function alert(title, message, url, priority = 0) {
  const { PUSHOVER_USER_KEY: user, PUSHOVER_APP_TOKEN: token } = process.env;
  if (DRY || !user || !token) { log(`alert not sent: ${title}: ${message}`); return; }
  const body = new URLSearchParams({ token, user, title, message, priority: String(priority) });
  if (url?.startsWith('https://')) { body.set('url', url); body.set('url_title', 'Open the review page'); }
  const res = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body, signal: AbortSignal.timeout(30_000) });
  log(`alert: ${res.status}`);
}

const ctl = (...args) => run(CTL[0], [...CTL.slice(1), ...args], { quiet: true });

// 1. Last week's picks.
function settleLastRound(week, left) {
  const last = readJson(path.join(STATE, 'last.json'), null);
  if (!last?.review || last.week === week.id || last.settled) return { carried: new Set(), note: '' };
  const r = ctl('picks', last.review);
  if (r.status !== 0) { log(`last round's picks unreadable: ${r.stderr.trim()}`); return { carried: new Set(), note: '' }; }
  const picks = JSON.parse(r.stdout).items;
  const filed = [], kept = [], carried = new Set();
  if (!DRY) run('gh', ['label', 'create', 'weekly round', '--color', 'BFD4F2', '--description', 'Found by the weekly round (docs/refining.md)', '--force'], { quiet: true });
  for (const [id, item] of Object.entries(last.items ?? {})) {
    const choice = picks[id]?.choice;
    if (choice === 'Leave') { left[item.key] = { title: item.title, week: last.week }; kept.push(item.title); continue; }
    if (choice !== 'Fix') { carried.add(item.key); continue; }
    if (DRY) continue;
    const seen = run('gh', ['issue', 'list', '--state', 'all', '--search', `"Round finding: ${item.key}" in:body`, '--json', 'number'], { quiet: true });
    const already = seen.status === 0 ? JSON.parse(seen.stdout) : [];
    if (already.length) { filed.push(`#${already[0].number}`); continue; }
    const body = [item.text, '', `Where: ${item.link}`, '', `Found by the weekly round of ${last.week}; Chris picked Fix. Work it as docs/refining.md sets out.`, '', `Round finding: ${item.key}`].join('\n');
    const made = run('gh', ['issue', 'create', '--title', item.title, '--body', body, '--label', 'weekly round'], { quiet: true });
    if (made.status === 0) filed.push(made.stdout.trim().split('/').pop().replace(/^/, '#'));
    else log(`issue not filed for ${item.key}: ${made.stderr.trim()}`);
  }
  const note = [filed.length && `Fix: filed as ${filed.join(', ')}.`, kept.length && `Leave: ${kept.length}, not proposed again.`,
    carried.size && `Not picked: ${carried.size}, proposed again if this week's round still finds them.`].filter(Boolean).join(' ') || 'Nothing was picked.';
  if (!DRY) {
    ctl('close', last.review, '--note', `This week's round (${week.id}) read the picks. ${note}`);
    writeJson(path.join(STATE, 'last.json'), { ...last, settled: true });
  }
  return { carried, note };
}

// 2. The checks, from the code and data that are live.
function source() {
  if (process.env.RTD_ROUND_SOURCE) return path.resolve(process.env.RTD_ROUND_SOURCE);
  const src = path.join(STATE, 'src');
  run('git', ['-C', ROOT, 'fetch', '-q', 'origin', 'main']);
  if (fs.existsSync(src)) run('git', ['-C', ROOT, 'worktree', 'remove', '--force', src], { quiet: true });
  run('git', ['-C', ROOT, 'worktree', 'prune'], { quiet: true });
  const r = run('git', ['-C', ROOT, 'worktree', 'add', '-q', '--detach', src, 'origin/main']);
  if (r.status !== 0) throw new Error('could not check out origin/main');
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(src, 'node_modules'));
  return src;
}

function checkFindings(dir, evidence) {
  const out = [];
  const sheetZoom = Object.fromEntries((evidence.audits ?? []).map((a) => [a.sheet, a.zoom]));
  const place = (zoom, at) => at && { zoom, lon: +at[0].toFixed(5), lat: +at[1].toFixed(5) };
  const near = (at) => `${at[0].toFixed(3)},${at[1].toFixed(3)}`;
  for (const a of evidence.audits ?? []) for (const f of a.findings) {
    const what = { 'stray-stop': `stop ${f.id} drawn away from its routes' street` }[f.kind] ?? `${f.kind} ${f.id ?? f.route ?? ''}`.trim();
    out.push({ key: `audit|${a.sheet}|${f.kind}|${f.id ?? f.route ?? near(f.at)}`, title: `Sheet ${a.sheet}: ${what}`,
      text: f.detail ?? f.message ?? JSON.stringify(f), place: place(a.zoom, f.at) });
  }
  for (const e of evidence.errors ?? []) if (e.kind !== 'runner') {
    out.push({ key: `error|${e.kind}|${e.url ?? e.message}`, title: `The live page: ${e.kind} error (${e.theme})`, text: `${e.url ?? ''} ${e.status ?? ''} ${e.message ?? ''}`.trim() });
  }
  for (const r of readJson(path.join(dir, 'sheets', 'results.json'), [])) if (!r.ok) {
    out.push({ key: `sheets|${r.theme}|${r.name}`, title: `Sheet check failed: ${r.name}`, text: `${r.theme} theme: ${r.error}` });
  }
  const acc = readJson(path.join(dir, 'accuracy.json'), { sheets: [] });
  for (const s of acc.sheets) {
    const zoom = s.zoom ?? sheetZoom[s.sheet];
    for (const w of s.wrong) out.push({ key: `route|${s.sheet}|wrong|${w.route}|${near(w.at)}`, title: `Sheet ${s.sheet}: the ${w.route} drawn on another route's street`,
      text: `For ${w.metres} m the ${w.route} is drawn on a street that RTD's data gives to ${w.routes}, not to the ${w.route}.`, place: place(zoom, w.at) });
    for (const [what, list] of [['missing', s.missing.list], ['off', s.off.list]]) for (const x of list.filter((x) => x.kind === 'fault')) {
      out.push({ key: `route|${s.sheet}|${what}|${x.route}|${near(x.at)}`, title: `Sheet ${s.sheet}: the ${x.route} ${what === 'missing' ? 'missing from part of its route' : 'drawn off its route'}`,
        text: what === 'missing' ? `For ${x.metres} m where RTD runs the ${x.route}, the sheet draws no line for it.` : `For ${x.metres} m the sheet draws the ${x.route} where RTD does not run it.`,
        place: place(zoom, x.at) });
    }
  }
  return out;
}

// 3. Claude's look at the captures.
function look(dir, evidence, left) {
  const caps = evidence.captures ?? [];
  if (!caps.length) return [];
  const names = Object.fromEntries((evidence.sample ?? []).map((s) => [s.id, s.station]));
  const lines = caps.map((c) => `${c.file}: ${names[c.stationId] ?? c.stationId} (${c.view}), zoom ${c.requested.zoom}, ${c.theme}`);
  const ids = new Set(caps.map((c) => `|${c.stationId}|`));
  const seen = Object.entries(left).filter(([k]) => k.startsWith('look|') && [...ids].some((i) => k.includes(i))).map(([, v]) => `- ${v.title}`);
  const prompt = fs.readFileSync(path.join(ROOT, 'qa/round/look.md'), 'utf8')
    .replace('{{CAPTURES}}', lines.join('\n'))
    .replace('{{LEFT}}', seen.length ? `Chris has already seen these and left them as they are; do not report them again:\n${seen.join('\n')}` : '');
  const cwd = path.join(dir, 'evidence');
  log(`asking ${MODEL} about ${caps.length} captures`);
  const r = run(CLAUDE, ['-p', prompt, '--model', MODEL, '--allowedTools', 'Read', '--output-format', 'json'], { cwd, timeout: 25 * 60_000, quiet: true });
  fs.writeFileSync(path.join(dir, 'look.raw.json'), r.stdout ?? '');
  if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${(r.stderr || r.stdout || '').slice(-300)}`);
  const text = JSON.parse(r.stdout).result ?? '';
  const found = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1) || '[]');
  const byFile = Object.fromEntries(caps.map((c) => [c.file, c]));
  const out = new Map();
  for (const f of found) {
    const files = (f.files ?? []).filter((x) => byFile[x]);
    if (!files.length || !KIND_ORDER.includes(f.kind)) continue;
    const c = byFile[files[0]];
    const key = `look|${c.stationId}|${c.requested.zoom}|${f.kind}`;
    const prev = out.get(key);
    if (prev) { prev.files.push(...files); continue; }
    const [lon, lat] = c.actual?.center ?? c.requested.center;
    out.set(key, { key, kind: f.kind, title: `${names[c.stationId] ?? `Station ${c.stationId}`}, zoom ${c.requested.zoom}: ${KIND_NAME[f.kind]}`,
      text: [`${f.where.charAt(0).toUpperCase()}${f.where.slice(1).replace(/\.$/, '')}.`, f.wrong, f.rider, f.sure === 'medium' ? 'Likely, not certain.' : ''].filter(Boolean).join(' '),
      files, place: { zoom: c.requested.zoom, lat: +lat.toFixed(5), lon: +lon.toFixed(5) } });
  }
  // Show the first capture named and the same view in the other theme.
  const twin = (file) => file.startsWith('light-') ? file.replace('light-', 'dark-') : file.replace('dark-', 'light-');
  return [...out.values()].map((f) => ({ ...f, files: [f.files[0], f.files.includes(twin(f.files[0])) ? twin(f.files[0]) : f.files.find((x) => x !== f.files[0])].filter(Boolean) }));
}

// A capture for a check finding, with a ring at the place.
async function capturePlaces(findings, dir) {
  const todo = findings.filter((f) => f.place && !f.files);
  if (!todo.length) return;
  fs.mkdirSync(path.join(dir, 'places'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(`${SITE}/?theme=light`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.sheetsReady, null, { timeout: 90_000 });
    for (const f of todo) {
      try {
        const { zoom, lat, lon } = f.place;
        await page.evaluate((h) => { location.hash = h; }, `#${zoom}/${lat}/${lon}`);
        await page.waitForTimeout(500);
        await page.waitForFunction(() => !window.sheetsMap.isMoving() && window.sheetsMap.isStyleLoaded() && window.sheetsMap.areTilesLoaded(), null, { timeout: 60_000 });
        await page.waitForTimeout(400);
        await page.evaluate(({ lon, lat }) => {
          document.getElementById('round-ring')?.remove();
          const p = window.sheetsMap.project([lon, lat]);
          const ring = Object.assign(document.createElement('div'), { id: 'round-ring' });
          ring.style.cssText = `position:fixed;left:${p.x - 28}px;top:${p.y - 28}px;width:56px;height:56px;border:3px solid #e4002b;border-radius:50%;pointer-events:none;z-index:9999`;
          document.body.append(ring);
        }, { lon, lat });
        const file = `places/${short(f.key)}.png`;
        await page.screenshot({ path: path.join(dir, file) });
        f.files = [file];
      } catch (e) { log(`no capture for ${f.key}: ${e.message.split('\n')[0]}`); }
    }
  } finally { await browser.close(); }
}

function manifest(week, dir, proposed, extra, info) {
  const img = path.join(dir, 'review', 'img');
  fs.rmSync(path.join(dir, 'review'), { recursive: true, force: true });
  fs.mkdirSync(img, { recursive: true });
  const link = (p) => `${SITE}/#${p.zoom}/${p.lat}/${p.lon}`;
  const items = proposed.map((f) => {
    const images = (f.files ?? []).map((file) => {
      const from = path.join(dir, file.startsWith('places/') ? '' : 'evidence', file);
      const name = path.basename(file);
      fs.copyFileSync(from, path.join(img, name));
      return `img/${name}`;
    });
    return { id: short(f.key), title: f.title, text: `${f.text}\nRound finding: ${f.key}`, images,
      links: f.place ? [{ label: 'Open this view on the live map', url: link(f.place) }] : [], ask: 'Fix or leave?', choices: ['Fix', 'Leave'] };
  });
  const sections = [{ heading: 'Found this week', items }];
  const more = [...info, ...extra.map((f) => `Also found, not shown (over ${MOST}): ${f.title}`)];
  if (more.length) sections.push({ heading: 'For information', items: [{ id: 'round-notes', title: 'What else the round saw', text: more.join('\n') }] });
  const m = { title: `Weekly map round, ${week.id}`, ask: 'Tap Fix or Leave on each item. Fix ones are filed as issues and worked through the usual steps; Leave ones are not proposed again.',
    intro: 'Each picture is the live map as a phone shows it. The link under it opens the same view.', status: info[0] ?? '', sections };
  writeJson(path.join(dir, 'review', 'manifest.json'), m);
  return { file: path.join(dir, 'review', 'manifest.json'), items: Object.fromEntries(proposed.map((f) => [short(f.key), { key: f.key, title: f.title, text: f.text, link: f.place ? link(f.place) : SITE }])) };
}

async function main() {
  const week = thisWeek();
  const dir = path.join(STATE, 'weeks', week.id);
  fs.mkdirSync(dir, { recursive: true });
  const left = readJson(path.join(STATE, 'left.json'), {});
  log(`round ${week.id} (seed ${week.seed}) on ${SITE}${DRY ? ', dry run' : ''}`);
  const { carried, note } = settleLastRound(week, left);
  if (!DRY) writeJson(path.join(STATE, 'left.json'), left);

  const src = source();
  let evidence;
  try {
    const commit = run('git', ['-C', src, 'rev-parse', '--short', 'HEAD'], { quiet: true }).stdout.trim();
    log(`checks on origin/main ${commit}`);
    run('node', ['qa/evaluation/run.mjs', '--url', `${SITE}/`, '--source-root', src, '--out', path.join(dir, 'evidence'), '--seed', String(week.seed), '--count', '3', '--sample-zooms', SAMPLE_ZOOMS.join(',')], { cwd: src });
    run('node', ['qa/sheets.mjs', `${SITE}/`, path.join(dir, 'sheets')], { cwd: src });
    const gtfs = path.join(dir, 'gtfs.zip');
    run('node', ['qa/accuracy.mjs', '--json', path.join(dir, 'accuracy.json')], { cwd: src, env: { RTD_GTFS_ZIP: gtfs } });
    fs.rmSync(gtfs, { force: true });
    evidence = readJson(path.join(dir, 'evidence', 'report.json'), { errors: [{ kind: 'runner', message: 'no report' }] });
    evidence.commit = commit;
  } finally {
    if (!process.env.RTD_ROUND_SOURCE) run('git', ['-C', ROOT, 'worktree', 'remove', '--force', src], { quiet: true });
  }
  const broken = (evidence.errors ?? []).filter((e) => e.kind === 'runner').map((e) => e.message.split('\n')[0]);

  // Check findings: new since last week's round, or proposed then and not picked.
  const checks = checkFindings(dir, evidence);
  const keys = checks.map((f) => f.key);
  writeJson(path.join(dir, 'keys.json'), keys);
  const prevWeek = fs.readdirSync(path.join(STATE, 'weeks')).filter((w) => w < week.id && fs.existsSync(path.join(STATE, 'weeks', w, 'keys.json'))).sort().pop();
  const before = prevWeek ? new Set(readJson(path.join(STATE, 'weeks', prevWeek, 'keys.json'), [])) : null;
  const newChecks = before ? checks.filter((f) => (!before.has(f.key) || carried.has(f.key)) && !left[f.key]) : [];

  const looked = LOOK ? look(dir, evidence, left).filter((f) => !left[f.key]) : [];
  looked.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  // A finding an issue already carries (its "Round finding:" line) is being worked; leave it alone.
  const listed = run('gh', ['issue', 'list', '--state', 'all', '--search', '"Round finding:" in:body', '--limit', '500', '--json', 'body'], { quiet: true });
  const filed = new Set(listed.status === 0 ? JSON.parse(listed.stdout).flatMap((i) => [...i.body.matchAll(/^Round finding: (\S+)\s*$/gm)].map((m) => m[1])) : []);
  const all = [...newChecks, ...looked].filter((f) => !filed.has(f.key));
  const proposed = all.slice(0, MOST), extra = all.slice(MOST);
  await capturePlaces(proposed, dir);

  const info = [
    `Live map at ${evidence.commit ?? '?'}, data built ${evidence.dataBuilt ?? '?'}. Looked at ${evidence.captures?.length ?? 0} captures (${(evidence.sample ?? []).filter((s) => s.view.startsWith('sample')).map((s) => s.station).filter((s, i, a) => a.indexOf(s) === i).join(', ') || 'no sample'} this week, with Union Station, a shared station and a terminal).`,
    before ? `Checks: ${checks.length} findings, ${newChecks.length} new since ${prevWeek}.` : `Checks: ${checks.length} findings. This is the first round, so they are the starting point; later rounds propose what is new.`,
    ...broken.map((b) => `The evidence run broke: ${b}`),
    note && `Last week's picks: ${note}`,
  ].filter(Boolean);
  writeJson(path.join(dir, 'round.json'), { week, site: SITE, at: new Date().toISOString(), info, proposed, extra, checks: checks.length, looked: looked.length });
  log(info.join('\n'));
  log(`${proposed.length} proposed, ${extra.length} more listed`);

  if (!proposed.length) {
    await alert('Map round', broken.length ? `The round could not look at the map: ${broken[0]}` : 'Nothing new to fix on the map this week.', null, broken.length ? 0 : -1);
    if (!DRY) writeJson(path.join(STATE, 'last.json'), { week: week.id, review: null, items: {} });
    return;
  }
  const m = manifest(week, dir, proposed, extra, info);
  if (DRY) { log(`dry run: manifest at ${m.file}`); return; }
  const r = ctl('publish', m.file);
  if (r.status !== 0) throw new Error(`publish failed: ${r.stderr.trim()}`);
  const [, review, url] = r.stdout.trim().match(/^published (\S+): (.*)$/m) ?? [];
  writeJson(path.join(STATE, 'last.json'), { week: week.id, review, items: m.items });
  await alert('Map round', `${proposed.length} thing${proposed.length === 1 ? '' : 's'} on the map to look at: Fix or Leave.`, url);
}

main().catch(async (e) => {
  console.error(e);
  await alert('Map round failed', String(e.message ?? e).slice(0, 300)).catch(() => {});
  process.exitCode = 1;
});
