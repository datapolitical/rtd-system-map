// Work status page for this repo. A viewer: the plan, what's in progress and
// what's waiting come from the repo's GitHub milestones and issues; local work
// comes from Claude Code's transcripts and from the progress files agents keep
// in .agents/ (see CLAUDE.md, "Status page"). No dependencies; needs git and a signed-in gh.
//   node status/server.mjs [port]      (PORT, WAIT_LABEL, GH, USAGE_FILE and JOBS_FILE also work)
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
// Claude plan usage readings, kept on this machine only (ignored by git).
const USAGE = process.env.USAGE_FILE || path.join(ROOT, 'status/usage.json');
// Jobs: facts and plain summaries for each running job, written by a collector
// on the machine that runs the agents (ignored by git; see CLAUDE.md, "Status page").
const JOBS = process.env.JOBS_FILE || path.join(ROOT, 'status/jobs.json');
const THUMBS = path.join(os.tmpdir(), 'repo-status-thumbs');
const SIPS = fs.existsSync('/usr/bin/sips');
const GH = process.env.GH || ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((p) => fs.existsSync(p)) || 'gh';

const safe = (f, d) => { try { return f(); } catch { return d; } };
// --no-optional-locks: never take index.lock, so a commit in another session can't collide with a refresh.
const git = (dir, ...a) => execFileSync('git', ['--no-optional-locks', '-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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
        captures: (a.captures || []).map((c) => path.resolve(w.dir, c)).filter((c) => isCapture(c, dirs) && fs.existsSync(c)).slice(0, 8),
      });
    }
  }
  return out.sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

function captures() {
  const walk = (dir, out, depth) => {
    for (const e of safe(() => fs.readdirSync(dir, { withFileTypes: true }), [])) {
      const p = path.join(dir, e.name);
      // Skip Playwright trace folders: their resources/ hold internal frames, not captures.
      if (e.isDirectory() && depth < 4 && !/^(trace|resources$)/.test(e.name)) walk(p, out, depth + 1);
      else if (e.name.endsWith('.png')) out.push(p);
    }
    return out;
  };
  return scratchDirs().flatMap((d) => walk(d, [], 0)).map((p) => ({ p, m: safe(() => fs.statSync(p).mtimeMs, 0) }))
    .sort((a, b) => b.m - a.m).slice(0, 24).map(({ p, m }) => ({ p, name: p.split('/qa/.scratch/')[1], m }));
}

// Claude Code sessions and subagents working in any checkout of this repo,
// read from Claude's own transcripts: ~/.claude/projects/*/<session>.jsonl and
// <session>/subagents/agent-*.jsonl. A transcript counts when its working
// directory (each line's cwd) is inside one of the repo's checkouts.
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
function readTail(p, size, max = 4e6) {
  const n = Math.min(size, max), buf = Buffer.alloc(n), fd = fs.openSync(p, 'r');
  try { fs.readSync(fd, buf, 0, n, size - n); } finally { fs.closeSync(fd); }
  return buf.toString('utf8');
}
const parsed = new Map();
function parseTranscript(p, st, dirs) {
  const key = `${st.mtimeMs}:${st.size}`;
  if (parsed.get(p)?.key === key) return parsed.get(p).v;
  const events = [], tools = {}, calls = new Map();
  let title = '', done = false, model = '', effort = '', type = '', first = '', last = null, mine = false, branch = '', cwd = '';
  for (const line of safe(() => readTail(p, st.size), '').split('\n')) {
    const j = line.startsWith('{') && safe(() => JSON.parse(line));
    if (!j) continue;
    if (j.cwd && dirs.some((d) => j.cwd === d || j.cwd.startsWith(d + '/'))) { mine = true; cwd = j.cwd; branch = j.gitBranch || branch; }
    if (!j.message) continue;
    first ||= j.timestamp;
    const c = j.message.content;
    if (j.type === 'user' && !title) {
      const t = (typeof c === 'string' ? c : c?.find?.((x) => x.type === 'text')?.text || '').trim();
      if (t && !/^(<|\[|Base directory for this skill|Caveat:)/.test(t)) title = t.split('\n')[0];
    }
    if (j.type !== 'assistant' || !Array.isArray(c)) continue;
    model = j.message.model || model; effort = j.effort || effort; type = j.attributionAgent || type;
    const u = j.message.usage;
    if (u && j.requestId) { calls.set(j.requestId, u); last = u; }
    for (const x of c) {
      if (x.type === 'text' && x.text.trim()) events.push({ t: j.timestamp, kind: 'note', s: x.text.trim() });
      if (x.type === 'tool_use') {
        if (x.name === 'SubagentHandback') done = true;
        tools[x.name] = (tools[x.name] || 0) + 1;
        const i = x.input || {};
        events.push({ t: j.timestamp, kind: 'tool', s: `${x.name}: ${i.description || i.file_path || i.pattern || (i.command || '').slice(0, 120)}` });
      }
    }
  }
  let v = null;
  if (mine && events.length) {
    let out = 0, think = 0, fresh = 0, cached = 0, units = 0;
    // Cost-weighted tokens in the ratios of the model's prices (input 1, cache write
    // 1.25, cache read 0.1, output 5); the page turns them into a share of the
    // weekly limit with the ratio kept in the usage file.
    for (const u of calls.values()) units += (u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0) + 5 * (u.output_tokens || 0);
    for (const u of calls.values()) { out += u.output_tokens || 0; think += u.output_tokens_details?.thinking_tokens || 0; fresh += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0); cached += u.cache_read_input_tokens || 0; }
    v = { units: Math.round(units), transcriptMB: Math.round(st.size / 1e5) / 10, title: title.slice(0, 160), done, model, effort, type, branch, cwd, started: first, calls: calls.size, out, think, fresh, cached,
      context: last ? (last.input_tokens || 0) + (last.cache_read_input_tokens || 0) + (last.cache_creation_input_tokens || 0) : 0,
      tools: Object.entries(tools).sort((a, b) => b[1] - a[1]), steps: events.length, events: events.slice(-14).reverse() };
  }
  parsed.set(p, { key, v });
  return v;
}
// Hermes agents (models run through the Hermes agent CLI) working in a checkout
// of this repo, read from Hermes's own database, ~/.hermes/state.db. Node 20 has
// no SQLite of its own, so Python's standard library reads it. One card per
// checkout: the newest session there, since a restarted agent replaces the old.
const HERMES_DB = path.join(process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'), 'state.db');
const HERMES_PY = String.raw`
import sqlite3, sys, json, time
from datetime import datetime, timezone
iso = lambda t: datetime.fromtimestamp(float(t), timezone.utc).isoformat() if t else None
db = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
dirs = json.loads(sys.argv[2]); seen = set(); out = []
q = """select id, cwd, model, started_at, ended_at, last_activity_at, last_activity_description,
       api_call_count, input_tokens, output_tokens, cache_read_tokens from sessions
       where last_activity_at > ? order by started_at desc"""
for sid, cwd, model, started, ended, upd, now, calls, fresh, written, cached in db.execute(q, (time.time() - 6 * 3600,)):
    if not cwd or cwd in seen or not any(cwd == d or cwd.startswith(d + '/') for d in dirs): continue
    seen.add(cwd)
    first = db.execute("select content from messages where session_id=? and role='user' order by id limit 1", (sid,)).fetchone()
    heads = [l[2:] for l in ((first or [''])[0] or '').split('\n') if l.startswith('# ') and 'Ground rules' not in l]
    tools, events = {}, []
    for tc, text, ts in db.execute("select tool_calls, content, timestamp from messages where session_id=? and role='assistant' order by id", (sid,)):
        if text and text.strip(): events.append({'t': iso(ts), 'kind': 'note', 's': ' '.join(text.split())[:300]})
        for k in (json.loads(tc) if tc else []):
            f = k.get('function', {}); name = f.get('name', '?'); tools[name] = tools.get(name, 0) + 1
            try: a = json.loads(f.get('arguments') or '{}')
            except Exception: a = {}
            arg = (a.get('command') or a.get('path') or a.get('question') or a.get('code') or '') if isinstance(a, dict) else ''
            arg = str(arg).replace('cd ' + cwd + ' && ', '')
            events.append({'t': iso(ts), 'kind': 'tool', 's': (name + ': ' + ' '.join(str(arg).split()))[:160]})
    out.append({'id': sid, 'cwd': cwd, 'model': model, 'started': iso(started), 'ended': iso(ended), 'updated': iso(upd),
                'now': now or '', 'title': (heads[0] if heads else '').replace('Your task: ', '', 1), 'calls': calls or 0,
                'fresh': fresh or 0, 'out': written or 0, 'cached': cached or 0, 'steps': len(events),
                'tools': sorted(tools.items(), key=lambda x: -x[1]), 'events': events[-14:][::-1]})
print(json.dumps(out))
`;
const hmemo = { at: 0, v: [] };
function hermes() {
  if (Date.now() - hmemo.at < 10000) return hmemo.v;
  hmemo.at = Date.now();
  if (!fs.existsSync(HERMES_DB)) return (hmemo.v = []);
  const wts = worktrees();
  const rows = safe(() => JSON.parse(execFileSync('python3', ['-c', HERMES_PY, HERMES_DB, JSON.stringify(wts.map((w) => w.dir))],
    { encoding: 'utf8', timeout: 8000, maxBuffer: 16e6, stdio: ['ignore', 'pipe', 'ignore'] })), []);
  return (hmemo.v = rows.map((r) => ({ ...r,
    branch: wts.find((w) => r.cwd === w.dir || r.cwd.startsWith(w.dir + '/'))?.branch || '',
    state: r.ended ? 'finished' : Date.now() - new Date(r.updated) > 30 * 60e3 ? 'stopped' : Date.now() - new Date(r.updated) > 10 * 60e3 ? 'quiet' : 'working' })));
}

const memo = { at: 0, v: [] };
function sessions() {
  if (Date.now() - memo.at < 10000) return memo.v;
  const wts = worktrees(), dirs = wts.map((w) => w.dir), out = [], root = path.join(CLAUDE, 'projects');
  for (const proj of safe(() => fs.readdirSync(root), [])) {
    const base = path.join(root, proj);
    const files = safe(() => fs.readdirSync(base), []).flatMap((f) => f.endsWith('.jsonl') ? [[path.join(base, f), false]]
      : safe(() => fs.readdirSync(path.join(base, f, 'subagents')), []).filter((s) => s.endsWith('.jsonl')).map((s) => [path.join(base, f, 'subagents', s), true]));
    for (const [p, sub] of files) {
      const st = safe(() => fs.statSync(p));
      if (!st || Date.now() - st.mtimeMs > 6 * 3600e3) continue;
      const v = parseTranscript(p, st, dirs);
      if (!v) continue;
      // A subagent's .meta.json names it and says whether it finished.
      const meta = sub ? safe(() => JSON.parse(fs.readFileSync(p.replace(/\.jsonl$/, '.meta.json'), 'utf8')), {}) : {};
      out.push({ ...v, title: meta.description || v.title, type: meta.agentType || v.type, done: meta.finished || v.done,
        branch: wts.find((w) => v.cwd === w.dir || v.cwd.startsWith(w.dir + '/'))?.branch || v.branch,
        kind: sub ? 'subagent' : 'session', state: meta.finished || v.done ? 'finished' : Date.now() - st.mtimeMs > 10 * 60e3 ? 'quiet' : 'working', updated: st.mtime });
    }
  }
  memo.at = Date.now(); memo.v = out.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  return memo.v;
}

// Skip the page's own pinned copy (see CLAUDE.md, "Status page").
const commits = () => worktrees().filter((w) => !(w.dir === ROOT && w.branch === '(detached)')).map((w) => ({
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
    return res.end(JSON.stringify({ now: new Date(), repo: OWNER ? `${OWNER}/${NAME}` : '', waitLabel: WAIT, ...g, usage: safe(() => JSON.parse(fs.readFileSync(USAGE, 'utf8')), null), jobs: safe(() => JSON.parse(fs.readFileSync(JOBS, 'utf8')), null), sessions: sessions(), hermes: hermes(), agents: agents(), captures: captures(), commits: commits() }));
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
