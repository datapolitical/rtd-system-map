// Load timing readout, only with ?timing in the address (index.html). Measures from outside the
// map's code: the files' arrival (Resource Timing), the GL programs MapLibre builds, the frames
// the page manages while it waits, and the moment the opening view is drawn (window.sheetsReady,
// main.js). Shows a box with the numbers once the map is ready.
(() => {
  const now = () => performance.now();
  const gl = { compile: 0, link: 0, programs: 0, firstDraw: null, contexts: 0 };
  const wrap = (proto) => {
    if (!proto) return;
    for (const name of ['compileShader', 'getShaderParameter', 'linkProgram', 'getProgramParameter']) {
      const orig = proto[name];
      proto[name] = function (...a) {
        const t = now();
        const r = orig.apply(this, a);
        const d = now() - t;
        if (name === 'compileShader' || name === 'getShaderParameter') gl.compile += d; else gl.link += d;
        if (name === 'linkProgram') gl.programs++;
        return r;
      };
    }
    const draw = proto.drawElements;
    proto.drawElements = function (...a) { if (gl.firstDraw === null) gl.firstDraw = now(); return draw.apply(this, a); };
  };
  wrap(window.WebGL2RenderingContext?.prototype);
  wrap(window.WebGLRenderingContext?.prototype);

  // Frames: every gap between animation frames, to find the long ones while the map draws.
  const gaps = [];
  let last = now();
  let running = true;
  const tick = () => {
    const t = now();
    gaps.push([last, t - last]);
    last = t;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // The map's own events, from the shared MapLibre module main.js imports: when each source's
  // tiles arrived (the worker fetches them, so they are not in the page's Resource Timing).
  const repeat = Boolean(navigator.serviceWorker?.controller);
  const ev = { load: null, idle: null, tiles: {}, firstTile: {} };

  // The map's worker, with a stopwatch inside (timing-worker.mjs; main.js hands MapLibre this
  // address before it starts its workers): when each worker was made and running, what it was
  // busy with, and how long it waited on the page.
  window.timingWorker = '/js/timing-worker.mjs';
  const workers = {};
  const fromPage = (t) => t - performance.timeOrigin;
  if (window.BroadcastChannel) {
    new BroadcastChannel('map-timing').onmessage = ({ data }) => {
      const w = (workers[data.w] ??= { busy: [], jobs: [], waits: [] });
      for (const r of data.list) {
        if (r.kind === 'start') { w.born = fromPage(r.born); w.start = fromPage(r.at); w.files = r.files?.map((f) => ({ ...f, s: fromPage(f.s), e: fromPage(f.e) })) ?? null; }
        if (r.kind === 'ready') { w.ready = fromPage(r.at); if (r.files?.length) w.files = r.files.map((f) => ({ ...f, s: fromPage(f.s), e: fromPage(f.e) })); }
        if (r.kind === 'sent') (asks[r.id] ??= {}).sent = fromPage(r.t);
        if (r.kind === 'back') (asks[r.id] ??= {}).back = fromPage(r.t);
        if (r.kind === 'busy') w.busy.push([fromPage(r.s), fromPage(r.e)]);
        if (r.kind === 'job') w.jobs.push({ ...r, s: fromPage(r.s), e: fromPage(r.e) });
        if (r.kind === 'wait') w.waits.push({ ...r, s: fromPage(r.s), e: fromPage(r.e) });
      }
    };
  }
  // The page answering the workers' requests (tile bytes, letters, icons): when each request reached
  // the page (the worker's message), when the page started on it (MapLibre's Actor.processTask)
  // and when the answer went back, matched by the request's id. Between arrival and start the page
  // was busy with something else; between start and answer it was doing the work.
  const asks = {};
  const NativeWorker = window.Worker;
  if (NativeWorker) {
    let made = 0;
    window.Worker = class extends NativeWorker {
      constructor(...a) {
        super(...a);
        const n = ++made;
        this.addEventListener('message', ({ data }) => {
          if (data?.type && data.type !== '<response>' && data.id) Object.assign((asks[data.id] ??= {}), { n, type: data.type, at: now() });
        });
      }
      postMessage(m, ...rest) {
        if (m?.type === '<response>' && asks[m.id]) asks[m.id].reply = now();
        return super.postMessage(m, ...rest);
      }
    };
  }
  let actorTimed = false;
  const timeActor = (actor) => {
    const proto = Object.getPrototypeOf(actor);
    const run = proto.processTask;
    if (typeof run !== 'function') return;
    proto.processTask = function (id, task) {
      if (asks[id] && task?.type !== '<response>') asks[id].start ??= now();
      return run.call(this, id, task);
    };
  };
  const drawsAt = [];

  // The page's side: reading the style (MapLibre checks every layer's rules and builds them; the
  // worker then reads them again), and each draw of the map before it is ready.
  const page = { style: null, layers: null, draws: 0, drawMs: 0, drawMax: 0, after: [] };
  const ms = (v) => (v == null ? '–' : `${Math.round(v)}`);
  const timed = (proto, name, done) => {
    const f = proto?.[name];
    if (typeof f !== 'function') return;
    proto[name] = function (...a) {
      const s = now();
      try { return f.apply(this, a); } finally { done(now() - s, s); }
    };
  };
  let styleTimed = false;
  import('/vendor/maplibre-gl.mjs').then((m) => {
    // Each draw between the map's "load" (style and opening tiles in) and its first "idle" (the
    // map ready): when, how long, and what MapLibre still had to do after it.
    const render = m.Map.prototype._render;
    m.Map.prototype._render = function (...a) {
      const s = now();
      try { return render.apply(this, a); } finally {
        const d = now() - s;
        if (!window.sheetsReady) {
          page.draws++; page.drawMs += d; page.drawMax = Math.max(page.drawMax, d);
          drawsAt.push([s, d]);
          if (ev.load !== null) {
            const left = [['sources', this._sourcesDirty], ['style', this._styleDirty], ['labels', this._placementDirty], ['moving', this.isMoving?.()], ['not loaded', !this.loaded?.()]]
              .filter(([, on]) => on).map(([k]) => k);
            page.after.push(`${ms(s)}+${ms(d)}${left.length ? ` (${left.join(', ')})` : ''}`);
          }
        }
      }
    };
    const fire = m.Map.prototype.fire;
    m.Map.prototype.fire = function (e, ...rest) {
      if (!actorTimed && this.style?.dispatcher?.actors?.length) {
        actorTimed = true;
        timeActor(this.style.dispatcher.actors[0]);
      }
      if (!styleTimed && this.style) {
        styleTimed = true;
        const proto = Object.getPrototypeOf(this.style);
        timed(proto, '_load', (d, s) => { page.style ??= [s, d]; });
        timed(proto, '_createLayers', (d) => { page.layers ??= d; });
      }
      const t = now();
      const type = typeof e === 'string' ? e : e?.type;
      if (type === 'load' && ev.load === null) ev.load = t;
      if (type === 'idle' && ev.idle === null) ev.idle = t;
      if (type === 'data' && e?.dataType === 'source' && e?.tile && e?.sourceId) {
        ev.tiles[e.sourceId] = t;
        ev.firstTile[e.sourceId] ??= t;
      }
      return fire.call(this, e, ...rest);
    };
  });

  // When the loading picture is shown (index.html adds "whole" once its file is in and the
  // drawing matches /data/sheets.json; it then fades in over 200 ms) and when it goes.
  let posterGone = null;
  let posterShown = null;
  new MutationObserver(() => {
    if (posterShown === null && document.querySelector('#poster img.whole')) posterShown = now();
    if (posterGone === null && document.getElementById('poster')?.classList.contains('gone')) posterGone = now();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true });

  const wait = () => {
    if (!window.sheetsReady) return setTimeout(wait, 10);
    const ready = ev.idle ?? now();
    running = false;
    setTimeout(() => show(ready), 50);
  };
  wait();

  function show(ready) {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource').filter((e) => e.responseEnd <= ready);
    const groups = {
      'page code': (u) => /\/(js|vendor)\/.*\.(m?js|css)/.test(u) && !/worker/.test(u),
      'map worker': (u) => /worker/.test(u),
      'map data (ours)': (u) => /\/data\//.test(u),
      'glyphs + font': (u) => /glyphs|woff2/.test(u),
      'loading picture': (u) => /\/poster\//.test(u),
      'basemap tiles': (u) => /openfreemap/.test(u),
    };
    const rows = [];
    const ms = (v) => (v == null ? '–' : `${Math.round(v)}`);
    rows.push(['page arrived', ms(nav?.responseEnd)]);
    // How the page itself got here: a first visit pays for the connection; a return visit's is 0.
    if (nav) rows.push(['  page: connect / secure / first byte / all in / parsed', `${ms(nav.connectStart)}–${ms(nav.connectEnd)} / ${nav.secureConnectionStart ? ms(nav.secureConnectionStart) : '–'} / ${ms(nav.responseStart)} / ${ms(nav.responseEnd)} / ${ms(nav.domInteractive)}`]);
    // First paint is the first text or picture drawn: the "Loading…" line once its font is in, or the picture.
    rows.push(['first paint (loading line or picture)', ms(performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')?.startTime)]);
    const poster = res.find((e) => /\/poster\//.test(e.name));
    const sheets = res.find((e) => /\/data\/sheets\.json/.test(e.name));
    rows.push(['loading picture: file in / sheets.json in / shown', `${ms(poster?.responseEnd)} / ${ms(sheets?.responseEnd)} / ${posterShown == null ? 'not shown' : ms(posterShown)}`]);
    for (const [label, test] of Object.entries(groups)) {
      const hit = res.filter((e) => test(e.name));
      if (!hit.length) continue;
      const kb = hit.reduce((s, e) => s + (e.transferSize || 0), 0) / 1024;
      rows.push([`${label}: ${hit.length} in by`, `${ms(Math.max(...hit.map((e) => e.responseEnd)))}  (from ${ms(Math.min(...hit.map((e) => e.startTime)))}, ${Math.round(kb)} KB)`]);
    }
    // Each glyph file: when it was asked for and when it was in, and how (fetch = the page's head,
    // index.html; other = the map). Two lines for one file means it was fetched twice.
    for (const e of res.filter((x) => /\/glyphs\//.test(x.name))) {
      const name = decodeURIComponent(e.name.replace(/^.*\/glyphs\/Overpass /, '')).replace('.pbf', '');
      rows.push([`  glyphs ${name}`, `${ms(e.startTime)}–${ms(e.responseEnd)} (${e.initiatorType}, ${Math.round((e.transferSize || 0) / 1024)} KB)`]);
    }
    // Each code file: when it was asked for and when it was in. The map can't start until the last is in.
    for (const e of res.filter((x) => groups['page code'](x.name)).sort((a, b) => a.responseEnd - b.responseEnd)) {
      rows.push([`  code ${e.name.replace(/^.*\/(js|vendor)\//, '')}`, `${ms(e.startTime)}–${ms(e.responseEnd)} (${Math.round((e.transferSize || 0) / 1024)} KB)`]);
    }
    const allIn = Math.max(...res.map((e) => e.responseEnd), ...Object.values(ev.tiles));
    rows.push(['downloads in + tiles ready', ms(allIn)]);
    rows.push(['map style loaded', ms(ev.load)]);
    for (const [id, t] of Object.entries(ev.tiles)) rows.push([`tiles ready to draw: ${id}`, `${ms(ev.firstTile[id])}–${ms(t)}`]);
    rows.push(['first GL draw', ms(gl.firstDraw)]);
    rows.push([`GL programs built (${gl.programs})`, `compile ${ms(gl.compile)} + link ${ms(gl.link)}`]);
    const long = gaps.filter(([t, d]) => d > 50 && t + d <= ready + 1);
    const after = long.filter(([t]) => t >= allIn);
    rows.push(['frames over 50 ms', `${long.length}, ${ms(long.reduce((s, [, d]) => s + d, 0))} ms in all`]);
    rows.push(['  of which after downloads', `${after.length}, ${ms(after.reduce((s, [, d]) => s + d, 0))} ms`]);
    rows.push(['longest frame', ms(Math.max(0, ...gaps.map(([, d]) => d)))]);
    rows.push(['style read on the page', page.style ? `${ms(page.style[0])}, ${ms(page.style[1])} ms (of which layers built ${ms(page.layers)})` : '–']);
    rows.push([`map draws before ready (${page.draws})`, `${ms(page.drawMs)} ms, longest ${ms(page.drawMax)}`]);
    rows.push(['draws after load, then still to do', page.after.join('; ') || '–']);
    const name = { SL: 'read style layers', UL: 'update style layers', LT: 'tile', RT: 'tile again', GR: 'tile bytes', GG: 'letters', GI: 'icons', GDA: 'dashes' };
    const sum = (list) => list.reduce((a, [s, e]) => a + Math.max(0, Math.min(e, ready) - s), 0);
    Object.values(workers).sort((a, b) => (a.born ?? 0) - (b.born ?? 0)).forEach((w, i) => {
      const busy = sum(w.busy.filter(([s]) => s < ready));
      const jobs = w.jobs.filter((j) => j.s < ready);
      rows.push([`WORKER ${i + 1}`, `made ${ms(w.born)}, code in ${ms(w.start)}, running ${ms(w.ready)}; busy ${ms(busy)} ms before ready`]);
      if (!w.files?.length) rows.push(['  its files', 'not reported by this browser']);
      for (const f of w.files ?? []) rows.push([`  file ${f.name}`, `${ms(f.s)}–${ms(f.e)} (${f.kb} KB)`]);
      const lastFile = Math.max(...(w.files ?? []).map((f) => f.e));
      if (Number.isFinite(lastFile)) rows.push(['  files in → code in (compiling)', `${ms(w.start - lastFile)} ms`]);
      const kinds = {};
      for (const j of jobs) {
        const k = j.type === 'LT' || j.type === 'RT' ? `${name[j.type]} ${j.source} z${j.z}` : name[j.type] ?? j.type;
        const g = (kinds[k] ??= { n: 0, sync: 0, s: Infinity, e: 0 });
        g.n++; g.sync += j.sync; g.s = Math.min(g.s, j.s); g.e = Math.max(g.e, j.e);
      }
      for (const [k, g] of Object.entries(kinds)) {
        if (!/^tile/.test(k) && g.sync < 1) continue;
        rows.push([`  ${k} ×${g.n}`, /^tile/.test(k) ? `${ms(g.s)}–${ms(g.e)}` : `${ms(g.s)}, ${ms(g.sync)} ms`]);
      }
      const waits = {};
      for (const x of w.waits.filter((x) => x.s < ready)) {
        const g = (waits[name[x.type] ?? x.type] ??= { n: 0, max: 0, last: 0 });
        g.n++; g.max = Math.max(g.max, x.e - x.s); g.last = Math.max(g.last, x.e);
      }
      for (const [k, g] of Object.entries(waits)) rows.push([`  waited on page: ${k} ×${g.n}`, `longest ${ms(g.max)} ms, last in ${ms(g.last)}`]);
    });
    // Each request a worker made of the page before the map was ready.
    const askName = { GR: 'tile bytes', GG: 'letters', GI: 'icons', GDA: 'dashes' };
    const listed = Object.values(asks).filter((a) => a.type && a.at < ready).sort((a, b) => a.at - b.at);
    // sent (worker) → page got it (+ the page busy before it) → page started → answered (+ its work)
    // → back in the worker (+ the worker busy before it).
    if (listed.length) rows.push(['PAGE ANSWERING THE WORKERS', 'sent; page got it +ms later; worked +ms; worker got answer +ms later']);
    for (const a of listed) {
      const begin = a.start ?? a.at;
      const meanwhile = drawsAt.filter(([s, d]) => s + d > (a.sent ?? a.at) && s < a.at);
      const drew = meanwhile.length ? `; page drew ${meanwhile.length}× ${ms(meanwhile.reduce((x, [, d]) => x + d, 0))} ms before getting it` : '';
      rows.push([`  w${a.n} ${askName[a.type] ?? a.type}`, `${ms(a.sent)}; +${ms(a.at - a.sent)}; +${ms(a.reply - begin)}${a.start - a.at > 1 ? ` (after +${ms(a.start - a.at)} queued)` : ''}; +${ms(a.back - a.reply)}${drew}`]);
    }
    rows.push(['MAP READY (picture goes)', ms(ready)]);
    rows.push(['picture told to go', ms(posterGone)]);
    rows.push(['repeat visit (offline copy)', String(repeat)]);
    rows.push(['screen', `${innerWidth}×${innerHeight} @${devicePixelRatio}x`]);
    const text = rows.map(([a, b]) => `${a}: ${b}`).join('\n') + `\n${navigator.userAgent}`;
    window.loadTiming = text;
    // The same and every file, for a runner to save (qa/devicefarm/load_run.py).
    window.loadTimingRaw = { ready, nav: nav?.toJSON?.(), files: performance.getEntriesByType('resource').map((e) => ({ name: e.name, s: Math.round(e.startTime), e: Math.round(e.responseEnd), kb: Math.round((e.transferSize || 0) / 1024), type: e.initiatorType })) };
    const box = document.createElement('pre');
    box.textContent = `Load timing (ms from tap)\n${text}`;
    Object.assign(box.style, {
      position: 'fixed', left: '8px', right: '8px', top: 'calc(env(safe-area-inset-top) + 8px)', zIndex: 9999,
      margin: 0, padding: '10px', font: '11px/1.35 ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap',
      background: 'rgba(0,0,0,.85)', color: '#fff', borderRadius: '8px', maxHeight: '70vh', overflow: 'auto',
    });
    // Copy puts the numbers on the clipboard to paste into a message; tapping elsewhere closes the box.
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    Object.assign(copy.style, { position: 'sticky', top: 0, float: 'right', font: '600 14px system-ui', padding: '6px 14px', borderRadius: '6px', border: 0, background: '#fff', color: '#000' });
    copy.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(`Load timing (ms from tap)\n${text}`).then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Copy failed'; });
    });
    box.prepend(copy);
    box.addEventListener('click', () => box.remove());
    document.body.append(box);
  }
})();
