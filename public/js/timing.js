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
  import('/vendor/maplibre-gl.mjs').then((m) => {
    const fire = m.Map.prototype.fire;
    m.Map.prototype.fire = function (e, ...rest) {
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

  let posterGone = null;
  const watchPoster = () => {
    const p = document.getElementById('poster');
    if (!p) return;
    new MutationObserver(() => { if (posterGone === null && p.classList.contains('gone')) posterGone = now(); })
      .observe(p, { attributes: true, attributeFilter: ['class'] });
  };
  document.addEventListener('DOMContentLoaded', watchPoster);

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
    rows.push(['loading picture shown (first paint)', ms(performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')?.startTime)]);
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
    rows.push(['MAP READY (picture goes)', ms(ready)]);
    rows.push(['picture told to go', ms(posterGone)]);
    rows.push(['repeat visit (offline copy)', String(repeat)]);
    rows.push(['screen', `${innerWidth}×${innerHeight} @${devicePixelRatio}x`]);
    const text = rows.map(([a, b]) => `${a}: ${b}`).join('\n') + `\n${navigator.userAgent}`;
    window.loadTiming = text;
    const box = document.createElement('pre');
    box.textContent = `Load timing (ms from tap)\n${text}`;
    Object.assign(box.style, {
      position: 'fixed', left: '8px', right: '8px', top: 'calc(env(safe-area-inset-top) + 8px)', zIndex: 9999,
      margin: 0, padding: '10px', font: '11px/1.35 ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap',
      background: 'rgba(0,0,0,.85)', color: '#fff', borderRadius: '8px', maxHeight: '70vh', overflow: 'auto',
    });
    box.addEventListener('click', () => box.remove());
    document.body.append(box);
  }
})();
