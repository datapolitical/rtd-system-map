// Independent audits of the generated sheets. No drawing/build helpers are imported.
// These establish consistency with the pre-drawing data, not independent GTFS truth
// or what a rider can perceive. Every relevant feature is visited, without cameras.
const words = (value) => [...new Set(String(value ?? '').split(/[ ,|]+/).filter(Boolean))].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const paths = (geometry) => geometry.type === 'LineString' ? [geometry.coordinates]
  : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
const project = ([lon, lat], zoom) => {
  const scale = 512 * 2 ** zoom;
  const sin = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360 * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
};
const distance = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

// A generous diagnostic envelope: a stop should touch a street carrying one of
// its routes within 12 CSS pixels. This is a project choice, not a literature
// threshold. Findings need inspection; zero findings do not prove route accuracy.
export const STOP_REACH_PX = 12;

export function auditSheet({ features, stations, routes, zoom, allStations = false }) {
  const findings = [], counts = { features: features.length, stationFeatures: 0, stops: 0, railFeatures: 0, letters: 0 };
  const stationById = new Map(stations.map((f) => [String(f.properties.id), f.properties]));
  const railRoutes = new Set(routes.filter((f) => f.properties.mode === 'rail').map((f) => f.properties.route));
  const marks = new Set(), exactMarks = new Set(), named = new Set(), lettered = new Set(), rails = new Set();
  const add = (kind, f, detail) => findings.push({ kind, id: f?.properties.id ?? null, at: f?.geometry.coordinates ?? null, detail });
  // Grid every bus segment once. Stops search only their neighborhood and routes.
  const cell = 32, grid = new Map();
  for (const f of features.filter((f) => f.properties.kind === 'bus')) {
    for (const line of paths(f.geometry)) {
      const points = line.map((p) => project(p, zoom));
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++) {
          for (let y = Math.floor(Math.min(a[1], b[1]) / cell); y <= Math.floor(Math.max(a[1], b[1]) / cell); y++) {
            const key = `${x},${y}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push({ a, b, routes: words(f.properties.routes) });
          }
        }
      }
    }
  }
  for (const f of features) {
    const p = f.properties;
    if (p.kind === 'station') {
      counts.stationFeatures++;
      const id = String(p.id), source = stationById.get(id);
      if (!source?.served) add('station-identity', f, 'Drawn station is absent or unserved in the pre-drawing data.');
      else if (p.name !== (source.label || source.name) || !same(words(p.lines), words(source.lines))) {
        add('station-identity', f, `Name or lines disagree with pre-drawing station ${id}.`);
      }
      if (p.shape === 'name') named.add(id);
      else {
        marks.add(id);
        // A hub may legitimately have distinct marks at distinct platforms.
        const key = `${id}:${JSON.stringify(f.geometry)}`;
        if (exactMarks.has(key)) add('duplicate-mark', f, 'The same station mark is drawn twice at identical coordinates.');
        exactMarks.add(key);
      }
    }
    if (p.kind === 'rail' || p.kind === 'letter') {
      if (p.kind === 'rail') { counts.railFeatures++; rails.add(p.route); }
      else { counts.letters++; lettered.add(p.route); }
      if (!railRoutes.has(p.route)) add('rail-identity', f, `Unknown rail route ${p.route}.`);
    }
    if (p.kind === 'stop') {
      counts.stops++;
      const point = project(f.geometry.coordinates, zoom), own = words(p.routes);
      let best = Infinity;
      const [cx, cy] = point.map((v) => Math.floor(v / cell));
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        for (const segment of grid.get(`${x},${y}`) ?? []) {
          if (segment.routes.some((r) => own.includes(r))) best = Math.min(best, distance(point, segment.a, segment.b));
        }
      }
      if (best > STOP_REACH_PX) add('stray-stop', f, `No street carrying this stop's routes within ${STOP_REACH_PX} CSS px.`);
    }
  }
  if (allStations) for (const [id, source] of stationById) {
    if (!source.served) continue;
    if (!marks.has(id)) add('missing-station', null, `Served station ${id} (${source.name}) has no mark.`);
    if (!named.has(id)) add('missing-name', null, `Served station ${id} (${source.name}) has no name feature.`);
  }
  for (const route of rails) if (!lettered.has(route)) add('missing-letter', null, `No letter feature anywhere on this sheet for ${route}.`);
  return { counts, findings, scope: 'All input features; pre-drawing consistency and stop-to-own-route proximity only.' };
}

// Deterministic sampling from all served stations, separate from the busiest
// examples. Sorting IDs makes selection independent of input file order.
export function sampleStations(stations, { seed = 21, count = 3 } = {}) {
  let state = seed >>> 0;
  const pool = stations.filter((f) => f.properties.served).slice().sort((a, b) => String(a.properties.id).localeCompare(String(b.properties.id)));
  const out = [];
  while (pool.length && out.length < count) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out.push(pool.splice(Math.floor(state / 2 ** 32 * pool.length), 1)[0]);
  }
  return out;
}

// Observe the rendered trial, not the label-placement implementation. Only
// labels present at both consecutive zooms in the same camera series compare;
// appearing at the viewport edge is not evidence of an unstable anchor.
export function anchorChanges(captures) {
  const previous = new Map(), findings = [];
  for (const capture of captures) {
    const group = `${capture.theme}/${capture.mode}/${capture.view}`;
    const before = previous.get(group);
    if (before && before.actual.zoom !== capture.actual.zoom) {
      const old = new Map(before.actual.names.filter((n) => n.name && n.anchor).map((n) => [`${n.id}:${n.name}`, n]));
      for (const n of capture.actual.names.filter((n) => n.name && n.anchor)) {
        const was = old.get(`${n.id}:${n.name}`);
        if (was && was.anchor !== n.anchor) findings.push({ kind: 'label-anchor-change', group, id: n.id, name: n.name,
          before: { file: before.file, zoom: before.actual.zoom, anchor: was.anchor },
          after: { file: capture.file, zoom: capture.actual.zoom, anchor: n.anchor } });
      }
    }
    previous.set(group, capture);
  }
  return findings;
}
