// Work status page for this repo. A viewer: the plan, what's in progress and
// what's waiting come from the repo's GitHub milestones and issues; local
// agent work comes from the progress files agents keep in .agents/ (see
// CLAUDE.md, "Status page"). No dependencies; needs git and a signed-in gh.
//   node status/server.mjs [port]      (PORT, WAIT_LABEL and GH also work)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';

const PORT = +(process.argv[2] || process.env.PORT) || 8795;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAIT = process.env.WAIT_LABEL || 'needs Chris';
// Read once: other sessions may switch this checkout to a branch without it.
const PAGE = fs.readFileSync(path.join(ROOT, 'status/index.html'));
const THUMBS = path.join(os.tmpdir(), 'repo-status-thumbs');
const SIPS = fs.existsSync('/usr/bin/sips');
const GH = process.env.GH || ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((p) => fs.existsSync(p)) || 'gh';

const safe = (f, d) => { try { return f(); } catch { return d; } };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const [OWNER, NAME] = safe(() => git(ROOT, 'remote', 'get-url', 'origin').match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/).slice(1), []);

// Every checkout of this repo on this machine (the main one and its worktrees).
function worktrees() {
  const out = [];
  for (const l of safe(() => git(ROOT, 'worktree', 'list', '--porcelain'), '').split('\n')) {
    if (l.startsWith('worktree ')) out.push({ dir: l.slice(9), branch: '' });
    else if (l.startsWith('branch ')) out.at(-1).branch = l.slice(7).replace('refs/heads/', '');
    else if (l === 'detached') out.at(-1).branch = '(detached)';
  }
  return out.filter((w) => fs.existsSync(w.dir));
}
const scratchDirs = () => worktrees().map((w) => path.join(w.dir, 'qa/.scratch'));
const isCapture = (p, dirs = scratchDirs()) => p.endsWith('.png') && dirs.some((d) => p.startsWith(d + '/'));

function agents() {
  const out = [], dirs = scratchDirs();
  for (const w of worktrees()) {
    const dir = path.join(w.dir, '.agents');
    for (const f of safe(() => fs.readdirSync(dir), []).filter((f) => f.endsWith('.json'))) {
      const p = path.join(dir, f), st = safe(() => fs.statSync(p));
      const a = st && Date.now() - st.mtimeMs < 24 * 3600e3 && safe(() => JSON.parse(fs.readFileSync(p, 'utf8')));
      if (!a) continue;
      const updated = a.updated || st.mtime;
      let state = a.state || 'working';
      if (state === 'working' && Date.now() - new Date(updated) > 15 * 60e3) state = 'quiet';
      out.push({
        name: a.name || f.slice(0, -5), issue: a.issue, branch: a.branch || w.branch, step: a.step || '', state, updated,
        log: (a.log || []).slice(0, 12),
        captures: (a.captures || []).map((c) => path.resolve(w.dir, c)).filter((c) => isCapture(c, dirs)).slice(0, 8),
      });
    }
  }
  return out.sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

function captures() {
  const walk = (dir, out, depth) => {
    for (const e of safe(() => fs.readdirSync(dir, { withFileTypes: true }), [])) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 4) walk(p, out, depth + 1);
      else if (e.name.endsWith('.png')) out.push(p);
    }
    return out;
  };
  return scratchDirs().flatMap((d) => walk(d, [], 0)).map((p) => ({ p, m: safe(() => fs.statSync(p).mtimeMs, 0) }))
    .sort((a, b) => b.m - a.m).slice(0, 24).map(({ p, m }) => ({ p, name: p.split('/qa/.scratch/')[1], m }));
}

const commits = () => worktrees().map((w) => ({
  name: w.branch || path.basename(w.dir),
  log: safe(() => git(w.dir, 'log', '-8', '--format=%h|%cr|%s').split('\n').map((l) => l.split('|')), []),
  dirty: safe(() => git(w.dir, 'status', '--short', '--', '.', ':!node_modules').split('\n').filter(Boolean).length, 0),
}));

// GitHub: one plan group per open milestone, one step per issue (closed = done,
// label "in progress" = doing). Bodies may carry "Estimate: N min" and "Weight: N".
const ISSUE = 'number title state url body labels(first: 10) { nodes { name } } comments(last: 1) { nodes { body createdAt } } updatedAt';
const Q = `query { repository(owner: "${OWNER}", name: "${NAME}") {
  milestones(first: 20, states: OPEN, orderBy: {field: NUMBER, direction: ASC}) { nodes { title description url
    issues(first: 100, orderBy: {field: CREATED_AT, direction: ASC}) { nodes { ${ISSUE} } } } }
  issues(first: 50, states: OPEN, filterBy: {milestoneNumber: "none"}) { nodes { ${ISSUE} } } } }`;
const gh = { at: 0, busy: false, error: '', plan: [], current: [], waiting: [] };
const firstLine = (s) => (s || '').split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !/^(Estimate|Weight):/i.test(x)) || '';
const clip = (s) => { s = s.replace(/^[-*] /gm, '').replace(/\n+/g, '; ').replace(/`/g, ''); return s.length > 220 ? s.slice(0, 219) + '…' : s; };
const labels = (i) => i.labels.nodes.map((l) => l.name);
const latest = (i) => clip(i.comments.nodes[0]?.body?.trim().split('\n')[0] || firstLine(i.body));
const brief = (i) => ({ t: `#${i.number} ${i.title}`, url: i.url, d: latest(i), at: i.comments.nodes[0]?.createdAt || i.updatedAt });
const step = (i) => {
  const L = labels(i), num = (re) => +((i.body || '').match(re)?.[1]) || undefined;
  let d = latest(i);
  if (L.includes(WAIT) && i.state === 'OPEN') d = 'Waiting on you' + (d ? ' · ' + d : '');
  return { t: `#${i.number} ${i.title}`, url: i.url, s: i.state === 'CLOSED' ? 'done' : L.includes('in progress') ? 'doing' : 'todo', d, eta: num(/^Estimate:\s*(\d+)\s*min/im), w: num(/^Weight:\s*(\d+)/im) };
};
function refresh() {
  if (gh.busy || !OWNER) return;
  gh.busy = true;
  execFile(GH, ['api', 'graphql', '-f', `query=${Q}`], { timeout: 20000 }, (err, out, errOut) => {
    gh.busy = false; gh.at = Date.now();
    const r = !err && safe(() => JSON.parse(out).data.repository, null);
    if (!r) { gh.error = (errOut || err?.message || 'no data').trim().split('\n')[0]; return; }
    gh.error = '';
    const loose = r.issues.nodes;
    gh.plan = [
      ...r.milestones.nodes.map((m) => ({ title: m.title, url: m.url, note: m.description || '', steps: m.issues.nodes.map(step) })),
      ...(loose.length ? [{ title: 'Not in a milestone yet', note: '', steps: loose.map(step) }] : []),
    ].filter((g) => g.steps.length);
    const open = [...r.milestones.nodes.flatMap((m) => m.issues.nodes), ...loose].filter((i) => i.state === 'OPEN');
    gh.current = open.filter((i) => labels(i).includes('in progress')).map(brief);
    gh.waiting = open.filter((i) => labels(i).includes(WAIT)).map(brief);
  });
}
refresh();

const sendFile = (res, p, type) => {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=60' });
  fs.createReadStream(p).on('error', () => res.end()).pipe(res);
};
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') {
    if (Date.now() - gh.at > 60000) refresh();
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    const { busy, ...g } = gh;
    return res.end(JSON.stringify({ now: new Date(), repo: OWNER ? `${OWNER}/${NAME}` : '', waitLabel: WAIT, ...g, agents: agents(), captures: captures(), commits: commits() }));
  }
  if (u.pathname === '/img' || u.pathname === '/thumb') {
    const p = path.resolve(u.searchParams.get('p') || '');
    if (!isCapture(p)) { res.writeHead(404); return res.end(); }
    if (u.pathname === '/img' || !SIPS) return sendFile(res, p, 'image/png');
    const t = path.join(THUMBS, Buffer.from(p).toString('base64url').slice(-80) + '-' + Math.round(safe(() => fs.statSync(p).mtimeMs, 0)) + '.jpg');
    if (!fs.existsSync(t)) {
      fs.mkdirSync(THUMBS, { recursive: true });
      safe(() => execFileSync('sips', ['-Z', '360', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', p, '--out', t], { stdio: 'ignore' }));
    }
    return fs.existsSync(t) ? sendFile(res, t, 'image/jpeg') : sendFile(res, p, 'image/png');
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(PORT, '127.0.0.1', () => console.log(`status for ${OWNER}/${NAME} on http://127.0.0.1:${PORT}`));
