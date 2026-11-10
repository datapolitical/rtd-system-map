// Runs inside the page, beside the map (window.__map, exposed by the
// fixture's main.js route). The detectors in detect.mjs ask it what the map
// has drawn: where each line runs on screen, the marks and names placed, the
// letters on each line, the colors the style gives. Nothing here knows RTD's
// network: lines come from data/routes.geojson as the page serves it (so a
// run against production reads production's data), and which of them a
// layer draws, at what width, offset and color, from the style's own
// expressions at the current zoom (public/js/evaluate.js where it is
// available, MapLibre's own evaluation otherwise).
//
// Installed by `install()` in detect.mjs as window.__qa; `init` once per page.
(() => {
  if (window.__qa) return;
  const qa = (window.__qa = {});
  const map = () => window.__map;
  let routes = null, stations = null, streets = [], evaluate = null, uncoveredFn = null;
  const filters = {};

  qa.init = async (evaluateSource) => {
    if (!routes) routes = (await (await fetch('data/routes.geojson')).json()).features;
    if (!stations) stations = (await (await fetch('data/stations.geojson')).json()).features;
    // Streets by combined bus frequency (the `street` layer), where the site has them.
    if (!streets.length) { try { const r = await fetch('data/streets.geojson'); if (r.ok) streets = (await r.json()).features; } catch {} }
    if (evaluateSource && !evaluate) {
      const url = URL.createObjectURL(new Blob([evaluateSource], { type: 'text/javascript' }));
      try { evaluate = (await import(url)).evaluate; } catch { evaluate = null; }
    }
    try { uncoveredFn = (await import('/js/edgeletters.js')).uncovered; } catch { uncoveredFn = null; }
    // The filters as the site set them: a test that drops a piece from a
    // layer still expects the piece to be drawn.
    for (const id of ['rail', 'rail-part-time', 'bus', 'street']) if (map().getLayer(id) && !(id in filters)) filters[id] = map().getFilter(id);
    return { routes: routes.length, stations: stations.length, evaluate: !!evaluate, uncovered: !!uncoveredFn };
  };

  // Global state (the open route) as the style sees it.
  function state() {
    const m = map();
    try { const s = m.getGlobalState?.() ?? m.style.getGlobalState?.(); if (s && Object.keys(s).length) return s; } catch {}
    const out = {};
    for (const [k, v] of Object.entries(m.style?.stylesheet?.state ?? {})) out[k] = v?.default ?? v;
    return out;
  }

  // A layer property for a feature with `props` at the current zoom.
  function value(layerId, prop, props = {}, kind = 'paint') {
    const m = map();
    const expr = kind === 'paint' ? m.getPaintProperty(layerId, prop) : m.getLayoutProperty(layerId, prop);
    if (evaluate && expr !== undefined) {
      try { return evaluate(expr, { zoom: m.getZoom(), props, state: state() }); } catch {}
    }
    const L = m.style._layers[layerId];
    const v = (kind === 'paint' ? L.paint : L.layout).get(prop);
    if (v && typeof v.evaluate === 'function') return v.evaluate({ type: 2, properties: props }, {}, { zoom: m.getZoom() });
    return v;
  }
  qa.value = value;

  const ctx = document.createElement('canvas').getContext('2d');
  function rgb(c) {
    if (c == null) return null;
    if (typeof c === 'object' && 'r' in c) { const a = c.a || 1; return [c.r / a, c.g / a, c.b / a].map((v) => Math.round(v * 255)); }
    ctx.fillStyle = '#000';
    ctx.fillStyle = String(c);
    const s = ctx.fillStyle;
    if (s[0] === '#') return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    return s.match(/[\d.]+/g).slice(0, 3).map(Number);
  }
  qa.rgb = rgb;

  function draws(layerId, props) {
    const m = map(), L = m.getLayer(layerId), f = filters[layerId];
    if (!L) return false;
    const z = m.getZoom();
    if (z < (L.minzoom ?? 0) || z >= (L.maxzoom ?? 99)) return false;
    if (f == null) return true;
    if (evaluate) { try { return !!evaluate(f, { zoom: z, props, state: state() }); } catch {} }
    return false;
  }

  // Which 4 px cells of the screen a control covers: the topmost element
  // there isn't the map's canvas. A string of '0' and '1', row by row.
  qa.cover = (step = 4) => {
    const canvas = map().getCanvas(), cols = Math.ceil(innerWidth / step), rows = Math.ceil(innerHeight / step);
    let bits = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bits += document.elementFromPoint(c * step + step / 2, r * step + step / 2) === canvas ? '0' : '1';
    return { step, cols, rows, bits };
  };
  // The part of the map no control covers, from the page's own code; on a
  // build without it, the same rule (full width, less a band across the top
  // and bottom for whatever covers the upper and lower half) from cover().
  qa.area = () => {
    const m = map();
    if (uncoveredFn) return uncoveredFn(m);
    const { step, cols, rows, bits } = qa.cover(8);
    let top = 0, bottom = innerHeight;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (bits[r * cols + c] === '1') {
      const y = r * step;
      if (y < innerHeight / 2) top = Math.max(top, y + step); else bottom = Math.min(bottom, y);
    }
    return { x0: 0, y0: top, x1: innerWidth, y1: Math.max(top, bottom) };
  };
  qa.view = () => {
    const m = map(), c = m.getCenter();
    return { zoom: m.getZoom(), lat: c.lat, lon: c.lng, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, area: qa.area() };
  };

  // Rest: no frame drawn for `quiet` ms and every tile loaded, or `max` ms
  // with frames still coming. The cap matters: a renderer slow enough to
  // draw a frame every half second never leaves a `quiet` gap, and a wait
  // that only ends on a gap never ends at all (a run of twenty views sat in
  // here for fifty minutes). Every tile is loaded by then, which is what the
  // gap was really for.
  qa.settle = (quiet = 700, max = 12000) => new Promise((res) => {
    const m = map(), t0 = performance.now();
    let timer;
    const done = () => {
      clearTimeout(timer);
      m.off('render', arm);
      res(performance.now() - t0);
    };
    const arm = () => {
      if (performance.now() - t0 >= max) return done();
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!m.loaded() && performance.now() - t0 < max) return arm();
        done();
      }, quiet);
    };
    m.on('render', arm);
    m.triggerRepaint();
    arm();
  });
  // The map's own rest: the next idle, which is what the page waits for
  // before it places a letter for each line with none (edgeletters.js), or
  // `max` ms of no idle at all. A frame is forced because MapLibre only
  // fires idle from inside a frame, and after a teleport it can go quiet
  // without drawing one.
  qa.idle = (max = 1500) => new Promise((res) => {
    const m = map();
    const t = setTimeout(() => { m.off('idle', onIdle); res(false); }, max);
    const onIdle = () => { clearTimeout(t); res(true); };
    m.once('idle', onIdle);
    m.triggerRepaint();
  });
  // The routes with a letter drawn, sorted, as one string.
  qa.letterKey = () => {
    const m = map();
    const layers = ['rail-bullets', 'rail-edge-letters'].filter((id) => m.getLayer(id));
    return [...new Set(m.queryRenderedFeatures({ layers }).map((f) => f.properties.route))].sort().join(',');
  };
  // Does the page still have a letter to place? Its own account, which is
  // empty once every line on screen has one drawn where it can be read.
  qa.pending = async () => {
    const mod = await import('/js/edgeletters.js');
    return mod.placeEdgeLetters(map()).length > 0;
  };
  // A move, then the map at rest: its own idle, and the letters the page
  // places once it is. The map can take several frames to place them on a
  // loaded runner, so while the page says it still has one to place, force a
  // frame and let it draw, up to `rounds` times. A quiet spell alone read the
  // view while the page was still working and reported lines with no letter
  // on a map that was about to draw one (#31).
  qa.rest = async (quiet = 700, rounds = 6) => {
    await qa.settle(quiet);
    for (let i = 0; i < rounds; i++) {
      // Force a frame even when `pending` still reads the view before the
      // jump: a teleport can leave the rendered features on the old view
      // until the next frame, and a check that then saw no line to place for
      // returned before the map had drawn the new one.
      await qa.idle();
      await qa.settle(400, 4000);
      if (!(await qa.pending())) break;
    }
    return qa.letterKey();
  };
  // A move, then the map at rest.
  qa.jump = async (v, quiet) => {
    map().jumpTo({ center: [v.lon, v.lat], zoom: v.zoom, bearing: 0, pitch: 0 });
    return qa.rest(quiet);
  };

  // Every symbol and circle layer hidden, so the lines can be read from
  // pixels with nothing drawn over them; showSymbols puts them back.
  let hidden = [];
  qa.hideSymbols = () => {
    const m = map();
    hidden = [];
    for (const id of m.style._order) {
      const L = m.getLayer(id);
      if ((L.type === 'symbol' || L.type === 'circle') && (m.getLayoutProperty(id, 'visibility') ?? 'visible') !== 'none') {
        m.setLayoutProperty(id, 'visibility', 'none');
        hidden.push(id);
      }
    }
    return hidden.length;
  };
  qa.showSymbols = () => {
    for (const id of hidden) map().setLayoutProperty(id, 'visibility', 'visible');
    const n = hidden.length;
    hidden = [];
    return n;
  };

  // The bus tiers, strongest first, as the bus layer's color match lists
  // them: the `street` layer's classes (match on `cls`) where the site draws
  // streets by combined frequency, else the `bus` layer's tiers.
  const busLayer = () => (map().getLayer('street') ? { id: 'street', key: 'cls' } : map().getLayer('bus') ? { id: 'bus', key: 'tier' } : null);
  qa.busLayer = () => busLayer()?.id ?? null;
  qa.busTiers = () => {
    const L = busLayer();
    if (!L) return [];
    const expr = map().getPaintProperty(L.id, 'line-color');
    const out = [];
    const walk = (e) => {
      if (!Array.isArray(e)) return;
      if (e[0] === 'match' && Array.isArray(e[1]) && e[1][1] === L.key) {
        for (let i = 2; i + 1 < e.length; i += 2) for (const t of [].concat(e[i])) out.push({ tier: t, color: rgb(value(L.id, 'line-color', { [L.key]: t, mode: 'bus', n: 1, routes: '' })) });
        return;
      }
      e.forEach(walk);
    };
    walk(expr);
    return out;
  };
  qa.land = () => rgb(value('land', 'background-color'));

  const project = (coords) => {
    const m = map(), out = [];
    for (const c of coords) {
      const p = m.project(c);
      const q = out.at(-1);
      if (!q || Math.hypot(p.x - q[0], p.y - q[1]) > 0.05) out.push([p.x, p.y]);
    }
    return out;
  };
  // A polyline moved `d` px to the right of its direction, as MapLibre's
  // line-offset does (screen y runs down), with mitred joins.
  function offsetLine(pts, d) {
    if (!d || pts.length < 2) return pts.map((p) => p.slice());
    const seg = [];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], L = Math.hypot(dx, dy) || 1;
      seg.push([-dy / L, dx / L]);
    }
    return pts.map((p, i) => {
      const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
      let nx = a[0] + b[0], ny = a[1] + b[1];
      const L = Math.hypot(nx, ny);
      if (L < 1e-6) [nx, ny] = b; else { nx /= L; ny /= L; }
      const k = Math.min(2, 1 / Math.max(nx * b[0] + ny * b[1], 0.5));
      return [p[0] + nx * d * k, p[1] + ny * d * k];
    });
  }

  // Each piece of line the map draws near the screen: its route, layer,
  // color, width and offset at this zoom, and its path on screen with the
  // offset applied. With `bus`, the strongest bus tier too.
  qa.lines = ({ bus = false, margin = 60 } = {}) => {
    const m = map();
    const a = m.unproject([-margin, -margin]), b = m.unproject([innerWidth + margin, innerHeight + margin]);
    const [w, e, s, n] = [Math.min(a.lng, b.lng), Math.max(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lat, b.lat)];
    const strong = bus ? qa.busTiers()[0]?.tier : null;
    const L = busLayer();
    const out = [];
    // Streets (one line per street, its routes listed) stand in for the
    // strongest bus tier where the site draws them; reported as layer `bus`.
    const pieces = L?.id === 'street' ? [...routes, ...streets] : routes;
    pieces.forEach((f, i) => {
      const p = f.properties;
      let layer = null;
      if (p.mode === 'rail' && draws('rail', p)) layer = 'rail';
      else if (p.mode === 'rail' && draws('rail-part-time', p)) layer = 'rail-part-time';
      else if (strong && L?.id === 'bus' && p.mode === 'bus' && p.tier === strong && draws('bus', p)) layer = 'bus';
      else if (strong && L?.id === 'street' && p.cls === strong && draws('street', p)) layer = 'street';
      if (!layer) return;
      const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      parts.forEach((c, k) => {
        if (!c.some(([x, y]) => x >= w && x <= e && y >= s && y <= n)) return;
        const width = value(layer, 'line-width', p);
        const offset = value(layer, 'line-offset', p) || 0;
        const raw = project(c);
        if (raw.length < 2) return;
        out.push({
          id: `${i}.${k}`, route: p.route ?? p.routes, slot: p.slot ?? 0, layer: layer === 'street' ? 'bus' : layer, width, offset,
          color: rgb(value(layer, 'line-color', p)),
          edge: layer === 'rail' && m.getLayer('rail-edge') ? rgb(value('rail-edge', 'line-color', p)) : null,
          casing: layer.startsWith('rail') && m.getLayer('rail-casing') ? value('rail-casing', 'line-width', p) : width,
          ends: [c[0], c.at(-1)],
          pts: offsetLine(raw, offset),
        });
      });
    });
    return out;
  };

  // Station, hub, facility and closed-station marks on screen: centre, size
  // and turn, from the layer's icon image and icon-size (or circle radius)
  // at this zoom. One per station: the largest where two layers crossfade.
  const MARK_LAYERS = ['stations-dot', 'stations', 'stations-hub', 'facilities', 'stations-unserved'];
  qa.marks = () => {
    const m = map(), z = m.getZoom(), bearing = m.getBearing();
    const layers = MARK_LAYERS.filter((id) => m.getLayer(id) && (m.getLayoutProperty(id, 'visibility') ?? 'visible') !== 'none');
    const marks = new Map();
    for (const f of m.queryRenderedFeatures({ layers })) {
      const id = f.layer.id, L = m.getLayer(id), props = { ...f.properties };
      if (z < (L.minzoom ?? 0) || z >= (L.maxzoom ?? 99)) continue;
      const p = m.project(f.geometry.coordinates);
      let w, h, rot = 0, cx = p.x, cy = p.y;
      if (L.type === 'circle') {
        if (value(id, 'circle-opacity', props) < 0.05) continue;
        const r = value(id, 'circle-radius', props) + (value(id, 'circle-stroke-width', props) || 0);
        w = h = 2 * r;
      } else {
        if (value(id, 'icon-opacity', props) < 0.05) continue;
        const img = value(id, 'icon-image', props, 'layout');
        const name = typeof img === 'string' ? img : img?.name ?? String(img);
        const image = m.getImage(name);
        if (!image) continue;
        const size = value(id, 'icon-size', props, 'layout') ?? 1;
        w = (image.data.width / image.pixelRatio) * size;
        h = (image.data.height / image.pixelRatio) * size;
        if (m.getLayoutProperty(id, 'icon-rotation-alignment') === 'map') rot = (value(id, 'icon-rotate', props, 'layout') || 0) - bearing;
        const anchor = value(id, 'icon-anchor', props, 'layout') || 'center';
        const off = value(id, 'icon-offset', props, 'layout') || [0, 0];
        cx += off[0] * size + (anchor.includes('left') ? w / 2 : anchor.includes('right') ? -w / 2 : 0);
        cy += off[1] * size + (anchor.includes('top') ? h / 2 : anchor.includes('bottom') ? -h / 2 : 0);
      }
      const key = (id === 'facilities' ? 'fac:' : 'stn:') + (props.id ?? props.label ?? `${cx},${cy}`);
      const prev = marks.get(key);
      if (!prev || w * h > prev.w * prev.h) marks.set(key, { key, label: props.label ?? props.name ?? id, layer: id, x: cx, y: cy, w, h, rot, px: p.x, py: p.y });
    }
    return [...marks.values()].filter((k) => k.x > -20 && k.y > -20 && k.x < innerWidth + 20 && k.y < innerHeight + 20);
  };

  // Every box MapLibre placed this frame (both collision grids), with its
  // layers and feature properties, in CSS px.
  // A layer that only takes up room (an icon with no visible pixel and no
  // text, like the page's keep-out layers) is left out.
  const blank = new Map();
  const drawsNothing = (id) => {
    if (blank.has(id)) return blank.get(id);
    const m = map(), L = m.getLayer(id);
    let none = false;
    if (L && L.type === 'symbol' && m.getLayoutProperty(id, 'text-field') == null) {
      const img = m.getLayoutProperty(id, 'icon-image');
      const image = typeof img === 'string' ? m.getImage(img) : null;
      if (image) { none = true; const d = image.data.data; for (let i = 3; i < d.length; i += 4) if (d[i]) { none = false; break; } }
    }
    blank.set(id, none);
    return none;
  };
  qa.placed = () => {
    const m = map(), pl = m.style.placement, ci = pl.collisionIndex;
    const byKey = new Map();
    for (const [ignored, g] of [[false, ci.grid], [true, ci.ignoredGrid]]) {
      for (let i = 0; i < g.boxKeys.length; i++) {
        const k = g.boxKeys[i], q = pl.retainedQueryData[k.bucketInstanceId];
        if (!q) continue;
        const layers = q.featureIndex.bucketLayerIDs[q.bucketIndex];
        if (layers.every(drawsNothing)) continue;
        let props = {};
        try { props = q.featureIndex.loadVTLayers()[q.featureIndex.sourceLayerCoder.decode(q.sourceLayerIndex)].feature(k.featureIndex).properties; } catch {}
        const [x1, y1, x2, y2] = Array.from(g.bboxes.slice(i * 4, i * 4 + 4), (v) => v - 100);
        const key = `${k.bucketInstanceId}:${k.featureIndex}`;
        const prev = byKey.get(key);
        if (prev) prev.box = [Math.min(prev.box[0], x1), Math.min(prev.box[1], y1), Math.max(prev.box[2], x2), Math.max(prev.box[3], y2)];
        else byKey.set(key, { key, layers, props, box: [x1, y1, x2, y2], ignored });
      }
    }
    // How much of each box is under the page's controls: the share of a
    // 3x3 grid of points where the topmost element isn't the map.
    const canvas = m.getCanvas(), rect = canvas.getBoundingClientRect();
    for (const p of byKey.values()) {
      const [x1, y1, x2, y2] = p.box;
      let n = 0, under = 0, by = null;
      for (const u of [0.15, 0.5, 0.85]) for (const v of [0.2, 0.5, 0.8]) {
        const x = rect.left + x1 + (x2 - x1) * u, y = rect.top + y1 + (y2 - y1) * v;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        n++;
        const el = document.elementFromPoint(x, y);
        if (el && el !== canvas) { under++; by ??= el.closest('[id]')?.id || el.className || el.tagName; }
      }
      p.covered = n ? under / n : 0;
      p.coveredBy = by;
    }
    return [...byKey.values()];
  };

  // Stations by id and by name, for a label's own mark.
  qa.stationAt = () => {
    const m = map();
    return stations.map((f) => {
      const p = m.project(f.geometry.coordinates);
      return { id: f.properties.id, label: f.properties.label, x: p.x, y: p.y };
    });
  };
  qa.textSize = (layerId, props = {}) => value(layerId, 'text-size', props, 'layout');

  // The rail lines in the uncovered part of the screen and the letters on
  // them (letters.spec.mjs, generalized): for each line, how far it spans and
  // where its middle is.
  qa.letters = () => {
    const m = map(), A = qa.area();
    const inA = (p) => p.x >= A.x0 && p.x <= A.x1 && p.y >= A.y0 && p.y <= A.y1;
    // A letter counts where it can be read: on the screen and not under a
    // control. The open bands leave out the gap between the Key and the Live
    // button, where a letter is still visible (edgeletters.js counts it too).
    const { step, cols, bits } = qa.cover(4);
    const onScreen = (p) => p.x >= 0 && p.y >= 0 && p.x < innerWidth && p.y < innerHeight && bits[Math.floor(p.y / step) * cols + Math.floor(p.x / step)] !== '1';
    const reach = {};
    for (const f of m.queryRenderedFeatures({ layers: ['rail'] })) {
      const route = f.properties.route;
      const r = (reach[route] ??= { xs: [], ys: [] });
      for (const part of f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates) {
        const ps = part.map((c) => m.project(c));
        for (let k = 1; k < ps.length; k++) {
          const n = Math.max(1, Math.ceil(Math.hypot(ps[k].x - ps[k - 1].x, ps[k].y - ps[k - 1].y) / 4));
          for (let s = 0; s <= n; s++) {
            const p = { x: ps[k - 1].x + ((ps[k].x - ps[k - 1].x) * s) / n, y: ps[k - 1].y + ((ps[k].y - ps[k - 1].y) * s) / n };
            if (inA(p)) { r.xs.push(p.x); r.ys.push(p.y); }
          }
        }
      }
    }
    const lines = Object.keys(reach).filter((k) => reach[k].xs.length).sort();
    const letterLayers = ['rail-bullets', 'rail-edge-letters'].filter((id) => m.getLayer(id));
    const letters = [...new Set(m.queryRenderedFeatures({ layers: letterLayers }).filter((f) => onScreen(m.project(f.geometry.coordinates))).map((f) => f.properties.route))];
    const out = {};
    for (const k of lines) {
      const { xs, ys } = reach[k];
      const mid = Math.floor(xs.length / 2);
      out[k] = { span: Math.round(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))), x: xs[mid], y: ys[mid] };
    }
    return { lines, letters, reach: out };
  };

  // Each rail letter on screen: its text color and its bullet's fill (the
  // commonest opaque color of the bullet image).
  qa.bullets = () => {
    const m = map(), out = new Map();
    const layers = ['rail-bullets', 'rail-edge-letters'].filter((id) => m.getLayer(id));
    for (const f of m.queryRenderedFeatures({ layers })) {
      const route = f.properties.route;
      if (out.has(route)) continue;
      const img = value(f.layer.id, 'icon-image', { ...f.properties }, 'layout');
      const image = m.getImage(typeof img === 'string' ? img : img?.name ?? String(img));
      if (!image) continue;
      const d = image.data.data, count = new Map();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; count.set(k, (count.get(k) || 0) + 1); }
      if (!count.size) continue;
      const top = [...count].sort((a, b) => b[1] - a[1])[0][0];
      const p = m.project(f.geometry.coordinates);
      out.set(route, { route, fill: [top >> 16, (top >> 8) & 255, top & 255], text: rgb(value(f.layer.id, 'text-color', { ...f.properties })), x: p.x, y: p.y });
    }
    return [...out.values()];
  };
})();
