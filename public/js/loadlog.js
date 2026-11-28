// Load details: every load of the map is noted, quietly, on this phone only (issue #286). The last
// five runs stay in localStorage; a long press on the credit line ("Unofficial. Data: RTD") opens
// "Load details", where the reader can Share or Copy them after a slow load. Nothing is sent anywhere.
//
// It adds no work while the page starts: it listens for the map being ready, then waits for an idle
// moment, then reads what the browser already measured (Navigation, Paint and Resource Timing) and
// writes it. Unlike ?timing (timing.js) it wraps nothing in the map's code. No personal data: no
// address, no location, no query strings, no cookies; just times, sizes, the screen's size, the
// theme and the build.
export const KEY = 'rtd-load-runs';
export const KEEP = 5;
export const MAX_FILES = 24; // the slowest requests of a run; the rest only count in the totals
export const MAX_BYTES = 6000; // one run's stored size, as JSON

const round = (v) => (Number.isFinite(v) ? Math.round(v) : null);

// The path of a request without the site's address or any query: where it went, not who asked.
export function pathOf(url) {
  try { const u = new URL(url, 'https://x.invalid'); return u.host === 'x.invalid' ? u.pathname : `${u.host}${u.pathname}`; } catch { return String(url).split('?')[0]; }
}

// One run from what the browser measured. `seen` is { nav, paint, resources, ready, screen, ... }.
export function makeRun(seen) {
  const res = (seen.resources ?? []).filter((e) => e.responseEnd <= seen.ready + 1);
  const files = res
    .map((e) => ({ f: pathOf(e.name), s: round(e.startTime), e: round(e.responseEnd), kb: round((e.transferSize || 0) / 1024) }))
    .sort((a, b) => (b.e - b.s) - (a.e - a.s))
    .slice(0, MAX_FILES);
  const run = {
    v: 1,
    at: seen.at, // when, to the minute, in UTC
    build: seen.build ?? null,
    ready: round(seen.ready),
    stages: {
      paint: round(seen.paint), // first thing drawn: the loading line or the sketch
      arrived: round(seen.nav?.responseEnd),
      parsed: round(seen.nav?.domInteractive),
      sheet: round(seen.ready), // the opening sheet drawn
    },
    requests: { n: res.length, kb: round(res.reduce((s, e) => s + (e.transferSize || 0), 0) / 1024) },
    files,
    net: seen.net ?? null,
    screen: seen.screen ?? null,
    theme: seen.theme ?? null,
    repeat: Boolean(seen.repeat),
    agent: seen.agent ?? null,
  };
  // Keep a run small: drop the slowest requests' tail until it fits.
  while (JSON.stringify(run).length > MAX_BYTES && run.files.length) run.files.pop();
  return run;
}

// The list with a run added at the front, newest first, never more than KEEP.
export function addRun(list, run, keep = KEEP) {
  return [run, ...(Array.isArray(list) ? list : [])].slice(0, keep);
}

export function parseRuns(text) {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter((r) => r && r.v === 1).slice(0, KEEP) : [];
  } catch { return []; }
}

const sec = (v) => (v == null ? '–' : `${(v / 1000).toFixed(1)} s`);
const msText = (v) => (v == null ? '–' : `${v} ms`);

// A run as plain text a person can read in a message.
export function formatRun(run, label = '') {
  const s = run.stages ?? {};
  const lines = [
    `${label ? `${label}: ` : ''}${run.at ?? 'unknown time'}${run.repeat ? ' (return visit)' : ' (first visit)'}`,
    `Map ready: ${sec(run.ready)}`,
    `First paint ${msText(s.paint)}, page arrived ${msText(s.arrived)}, parsed ${msText(s.parsed)}, first sheet drawn ${msText(s.sheet)}`,
    `Requests: ${run.requests?.n ?? '–'}, ${run.requests?.kb ?? '–'} KB`,
    `Connection: ${run.net ? [run.net.type, run.net.downlink != null && `${run.net.downlink} Mbit/s`, run.net.rtt != null && `${run.net.rtt} ms round trip`, run.net.saveData && 'data saver on'].filter(Boolean).join(', ') || 'not reported' : 'not reported'}`,
    `Screen: ${run.screen ?? '–'}, ${run.theme ?? '–'} theme`,
    `Build: ${run.build ?? 'unknown'}`,
  ];
  if (run.files?.length) {
    lines.push('Slowest requests (start–end ms, KB):');
    for (const f of run.files) lines.push(`  ${f.f}  ${f.s}–${f.e}  ${f.kb} KB`);
  }
  if (run.agent) lines.push(run.agent);
  return lines.join('\n');
}

export function formatAll(runs) {
  if (!runs.length) return 'No loads recorded on this device yet.';
  return ['RTD system map: load details', ...runs.map((r, i) => `\n${formatRun(r, i === 0 ? 'Last load' : `Load ${i + 1} back`)}`)].join('\n');
}

export const asJson = (runs) => JSON.stringify(runs, null, 1);

// ---- In the page -------------------------------------------------------------------------------

function read() {
  try { return parseRuns(localStorage.getItem(KEY)); } catch { return []; }
}

function record() {
  const nav = performance.getEntriesByType('navigation')[0];
  const conn = navigator.connection;
  const run = makeRun({
    at: new Date().toISOString().slice(0, 16) + 'Z',
    ready: performance.now(),
    nav,
    paint: performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')?.startTime,
    resources: performance.getEntriesByType('resource'),
    net: conn ? { type: conn.effectiveType ?? null, downlink: conn.downlink ?? null, rtt: conn.rtt ?? null, saveData: Boolean(conn.saveData) } : null,
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    repeat: Boolean(navigator.serviceWorker?.controller),
    agent: navigator.userAgent,
    build: null,
  });
  // The build the site was published from (the deploy manifest; absent in local development).
  fetch('/deploy-manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => {
    if (m?.commit) run.build = `${String(m.commit).slice(0, 7)}${m.dirty ? ' (uncommitted)' : ''}`;
    try { localStorage.setItem(KEY, JSON.stringify(addRun(read(), run))); } catch { /* storage full or off: nothing is lost but the note */ }
  });
}

function whenIdle(fn) {
  if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 5000 }); else setTimeout(fn, 1500);
}

function sheet() {
  let dlg = document.getElementById('load-details');
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'load-details';
  dlg.setAttribute('aria-labelledby', 'load-details-h');
  dlg.innerHTML = `<style>
    #load-details { border: 0; padding: 16px; width: min(94vw, 460px); max-height: 80vh; border-radius: 14px; background: var(--card, #fff); color: var(--ink, #161c28); box-shadow: 0 10px 40px rgba(0,0,0,.35); }
    #load-details::backdrop { background: rgba(0,0,0,.4); }
    #load-details h2 { margin: 0 0 4px; font: 600 17px system-ui, sans-serif; }
    #load-details p { margin: 0 0 10px; font: 13px/1.4 system-ui, sans-serif; color: var(--note, #656a74); }
    #load-details pre { margin: 0 0 12px; padding: 10px; max-height: 42vh; overflow: auto; font: 11px/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-all; border-radius: 8px; background: color-mix(in srgb, var(--ground, #f5f3ef) 70%, var(--card, #fff)); }
    #load-details .row { display: flex; gap: 8px; flex-wrap: wrap; }
    #load-details button { font: 600 14px system-ui, sans-serif; padding: 9px 16px; border-radius: 10px; border: 1px solid var(--rim, #8b8f98); background: var(--card, #fff); color: var(--ink, #161c28); }
    #load-details button:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
  </style>
  <h2 id="load-details-h">Load details</h2>
  <p>The last loads on this device. Nothing leaves it unless you share it.</p>
  <pre tabindex="0"></pre>
  <div class="row"><button type="button" data-do="share">Share</button><button type="button" data-do="copy">Copy</button><button type="button" data-do="close">Close</button></div>
  <p role="status" class="said" style="margin:8px 0 0"></p>`;
  document.body.append(dlg);
  const said = dlg.querySelector('.said');
  const text = () => formatAll(read());
  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) return dlg.close();
    const what = e.target.closest?.('button')?.dataset.do;
    if (what === 'close') dlg.close();
    if (what === 'copy') {
      try { await navigator.clipboard.writeText(`${text()}\n\n${asJson(read())}`); said.textContent = 'Copied.'; } catch { said.textContent = 'Couldn’t copy. Select the text above and copy it.'; }
    }
    if (what === 'share') {
      if (!navigator.share) { said.textContent = 'Sharing isn’t available here. Use Copy.'; return; }
      try { await navigator.share({ title: 'RTD system map: load details', text: text() }); said.textContent = ''; } catch (err) { said.textContent = err?.name === 'AbortError' ? '' : 'Couldn’t share. Use Copy.'; }
    }
  });
  return dlg;
}

export function openDetails(from) {
  const dlg = sheet();
  dlg.querySelector('pre').textContent = formatAll(read());
  dlg.querySelector('.said').textContent = '';
  dlg.addEventListener('close', () => from?.focus?.(), { once: true });
  dlg.showModal();
  dlg.querySelector('button').focus();
}

function wire() {
  const credit = document.getElementById('credit');
  if (!credit) return;
  // Keyboard: the credit line takes focus, and Enter or Space on it (not on its links) opens the sheet.
  credit.tabIndex = 0;
  credit.setAttribute('aria-keyshortcuts', 'Enter');
  credit.setAttribute('aria-description', 'Press Enter for load details');
  credit.addEventListener('keydown', (e) => {
    if (e.target === credit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetails(credit); }
  });
  // Touch and mouse: a long press (about 0.6 s) anywhere on the line but a link.
  let timer = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  credit.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a')) return;
    fired = false;
    cancel();
    timer = setTimeout(() => { fired = true; openDetails(credit); }, 600);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) credit.addEventListener(t, (e) => { if (t !== 'pointermove' || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel(); });
  // A long press on a phone also asks for the page's own menu; the sheet replaces it.
  credit.addEventListener('contextmenu', (e) => { if (fired || timer) e.preventDefault(); });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  wire();
  let done = false;
  const go = () => { if (done) return; done = true; whenIdle(record); };
  if (window.sheetsReady) go(); else window.addEventListener('sheetsready', go, { once: true });
}
