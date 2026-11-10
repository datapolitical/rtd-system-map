// Comparing what the page drew with what the drawn model says it draws
// (qa/drawn/README.md). Plain geometry: distances in screen pixels, no
// browser and no data of its own, so `npm test` can seed a fault and check
// the comparison finds it.

// The distance from a point to a polyline, in px.
export function distanceToParts([x, y], parts) {
  let best = Infinity;
  for (const part of parts) {
    for (let i = 1; i < part.length; i++) {
      const [x1, y1] = part[i - 1];
      const [x2, y2] = part[i];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0;
      const d = Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
      if (d < best) best = d;
    }
    if (part.length === 1) best = Math.min(best, Math.hypot(x - part[0][0], y - part[0][1]));
  }
  return best;
}

const key = (f) => `${f.layer}|${f.route ?? f.kind ?? ''}`;

// Every vertex the page drew inside the screen must lie within `tolerance`
// px of the model's line for the same layer (and route, when the layer has
// one). `drawn` and `model` are [{layer, route, kind, parts}], parts in
// screen px. Vertices outside the screen are skipped: tiles clip lines in
// places the model's own clip need not match.
export function compareLines(drawn, model, { tolerance = 1, width, height } = {}) {
  const byKey = new Map();
  for (const line of model) {
    const k = key(line);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(line);
  }
  let pairs = 0;
  let worst = 0;
  let missing = 0;
  const missingLayers = new Map();
  const missingKeys = new Map();
  const failures = [];
  for (const line of drawn) {
    const parts = (byKey.get(key(line)) ?? []).flatMap((l) => l.parts);
    // A page line the model has nothing for is not a pass: without this the
    // model could omit a whole layer and every page vertex on it would be
    // skipped in silence (which is how `streets` went unseen).
    if (!parts.length) {
      // Only the vertices on the screen, as below: the page's viewport query
      // also returns a line whose centre is just off the screen but whose
      // drawn width (with its offset) reaches onto it.
      const n = line.parts.reduce((sum, part) => sum + part.filter((pt) => pt[0] >= 0 && pt[1] >= 0 && pt[0] <= width && pt[1] <= height).length, 0);
      if (!n) continue;
      missing += n;
      missingLayers.set(line.layer, (missingLayers.get(line.layer) ?? 0) + n);
      missingKeys.set(key(line), (missingKeys.get(key(line)) ?? 0) + n);
      continue;
    }
    for (const part of line.parts) {
      for (const pt of part) {
        if (pt[0] < 0 || pt[1] < 0 || pt[0] > width || pt[1] > height) continue;
        const d = distanceToParts(pt, parts);
        pairs++;
        if (d > worst) worst = d;
        if (d > tolerance && failures.length < 12) failures.push({ layer: line.layer, route: line.route ?? line.kind ?? null, distance: d, at: pt });
      }
    }
  }
  return { pairs, worst, missing, missingLayers: [...missingLayers], missingKeys: [...missingKeys], failures };
}

// Every point the page drew must lie within `tolerance` px of one of the
// model's points for the same layer and feature. `drawn` is [{layer, id,
// route, x, y}]; `pointsFor(drawn)` returns [[x, y], ...].
export function comparePoints(drawn, pointsFor, { tolerance = 1 } = {}) {
  let worst = 0;
  const failures = [];
  for (const p of drawn) {
    const pts = pointsFor(p);
    const best = pts.length ? Math.min(...pts.map(([x, y]) => Math.hypot(x - p.x, y - p.y))) : Infinity;
    if (best > worst) worst = best;
    if (best > tolerance && failures.length < 12) failures.push({ layer: p.layer, id: p.id ?? null, route: p.route ?? null, distance: best });
  }
  return { checked: drawn.length, worst, failures };
}

// The largest edge difference between two boxes, in px.
export function boxDistance(a, b) {
  return Math.max(...[0, 1, 2, 3].map((i) => Math.abs(a[i] - b[i])));
}

// Every box the page placed must match one of the model's boxes for that
// layer and feature within `tolerance` px: the text's candidate anchors, the
// mark's box, or their union. `drawn` is [{layer, props, box}]; `model` is a
// function (drawn) => [box], so the caller decides which boxes one feature
// has (a bullet is its icon plus its letter).
export function compareBoxes(drawn, boxesFor, { tolerance = 2 } = {}) {
  let worst = 0;
  const failures = [];
  for (const p of drawn) {
    const boxes = boxesFor(p);
    const best = boxes.length ? Math.min(...boxes.map((b) => boxDistance(b, p.box))) : Infinity;
    if (best > worst) worst = best;
    if (best > tolerance && failures.length < 12) failures.push({ layer: p.layer ?? p.layers?.[0], id: p.props?.id ?? null, label: p.props?.label ?? p.props?.route ?? null, distance: best === Infinity ? null : best, box: p.box, candidates: boxes.length });
  }
  return { checked: drawn.length, worst, failures };
}

// --- lines as drawn: offsets and widths, measured by the page's hit-test ---
//
// `queryRenderedFeatures` returns a line's source geometry, not where it is
// drawn: MapLibre applies `line-offset` and the line's width only when it
// hit-tests a query (queryIntersectsFeature, line_style_layer.ts). So the
// drift test asks the hit-test itself. At sample points on the model's drawn
// lines (strokes.mjs) it walks out along the normal on each side until the
// page stops returning that feature: the two distances give the page's
// centre and width there, to a few hundredths of a px.

// A feature's identity on both sides: its scalar properties, sorted. The
// page's copy of a GeoJSON feature keeps them as the build wrote them.
export function signature(properties) {
  return JSON.stringify(Object.keys(properties ?? {}).filter((k) => k !== '$type').sort()
    .filter((k) => ['string', 'number', 'boolean'].includes(typeof properties[k]))
    .map((k) => [k, typeof properties[k] === 'number' ? Math.round(properties[k] * 1e6) / 1e6 : properties[k]]));
}

// Distance from p to segment a-b.
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/**
 * Sample points on the model's drawn lines in a frame: the middle of straight
 * segments, clear of the screen's edges, a few per line, spread over the
 * layers in turn.
 *
 * Only where the line stands alone. The page's hit-test can't tell two lines
 * of one feature apart (a route's two directions, often parts of one
 * feature, a px apart at low zoom), and the page simplifies each a little
 * differently in its tiles (up to 0.375 px at the tile's zoom), so where two
 * come within reach of a sample their combined band on the page and in the
 * model can differ by more than a width error. A sample is skipped when any
 * other line or part with the same layer and properties is within `reach` px
 * (plus both half widths and `slack`) of it.
 * @param {Array} lines a frame's lines (screen px, with `drawn` and `drawnWidth`)
 * @returns {Array<{layer, sig, route, x, y, nx, ny, half}>}
 */
export function lineSamples(lines, { width, height, perLine = 3, max = 150, reach = 3, slack = 1 } = {}) {
  // Every drawn segment, by layer and feature identity.
  const bySig = new Map();
  for (const line of lines) {
    const key = `${line.layer}|${signature(line.properties)}`;
    const half = (line.drawnWidth ?? line.width ?? 0) / 2;
    if (!bySig.has(key)) bySig.set(key, []);
    (line.drawn ?? line.parts).forEach((part, pi) => {
      for (let i = 1; i < part.length; i++) bySig.get(key).push({ line, pi, i, a: part[i - 1], b: part[i], half });
    });
  }
  // Clear of every other line and part of the same feature. Its own part is
  // left out: a sample sits mid-segment, clear of its own corners.
  const alone = (line, pi, i, p, half) => (bySig.get(`${line.layer}|${signature(line.properties)}`) ?? [])
    .every((s) => (s.line === line && s.pi === pi) || segDist(p, s.a, s.b) > half + reach + s.half + slack);
  const byLayer = new Map();
  for (const line of lines) {
    const w = line.drawnWidth ?? line.width;
    if (!(w > 0)) continue;
    const half = w / 2;
    const margin = half + 8;
    const sig = signature(line.properties);
    const picks = [];
    // On the centreline's own segments, moved by the line's offset along the
    // segment's normal: in the middle of a segment the renderer and the
    // hit-test offset a line alike; near a corner each has its own rule (the
    // renderer adds vertices 15 px either side of a sharp one), so a sample
    // must sit further from both corners than either rule reaches.
    const off = line.offset ?? 0;
    const clearOfCorners = 15 + 2 * Math.abs(off) + w;
    for (const [pi, part] of line.parts.entries()) {
      for (let i = 1; i < part.length && picks.length < perLine; i++) {
        const [ax, ay] = part[i - 1], [bx, by] = part[i];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < Math.max(12, 3 * w, 2 * clearOfCorners)) continue;
        const nx = -(by - ay) / len, ny = (bx - ax) / len;
        const x = (ax + bx) / 2 + nx * off, y = (ay + by) / 2 + ny * off;
        if (x < margin || y < margin || x > width - margin || y > height - margin) continue;
        if (!alone(line, pi, i, [x, y], half)) continue;
        picks.push({ layer: line.layer, sig, route: line.route ?? line.properties?.routes ?? line.kind ?? null, x, y, nx, ny, half });
      }
    }
    if (!picks.length) continue;
    if (!byLayer.has(line.layer)) byLayer.set(line.layer, []);
    byLayer.get(line.layer).push(...picks);
  }
  // In turn from each layer, so one busy layer can't take every probe.
  const out = [];
  const queues = [...byLayer.values()];
  for (let i = 0; out.length < max && queues.some((q) => i < q.length); i++) {
    for (const q of queues) if (i < q.length && out.length < max) out.push(q[i]);
  }
  return out;
}

/**
 * Runs in the page (Playwright passes it by its source; it must not close
 * over anything), and in Node against the model (modelHitMap) so both sides
 * are measured the same way. For each sample: the nearest place within
 * `near` px of the model's centre where the hit-test returns that feature,
 * and from there how far it keeps returning it to the right (+n) and left
 * (-n). It walks out in `step` px steps and halves between the last hit and
 * the first miss, so a neighbouring line of the same feature beyond a gap is
 * not counted, and lines that touch are measured together on both sides.
 */
export function probeLines({ samples, reach = 3, near = 1, step = 0.5, halve = 6 }, map = window.__map) {
  const sigOf = (properties) => JSON.stringify(Object.keys(properties ?? {}).filter((k) => k !== '$type').sort()
    .filter((k) => ['string', 'number', 'boolean'].includes(typeof properties[k]))
    .map((k) => [k, typeof properties[k] === 'number' ? Math.round(properties[k] * 1e6) / 1e6 : properties[k]]));
  const hit = (s, d) => map.queryRenderedFeatures([s.x + s.nx * d, s.y + s.ny * d], { layers: [s.layer] }).some((f) => sigOf(f.properties) === s.sig);
  // From a hit at signed position `start` on the normal, the signed position
  // where the line ends, walking in direction `sign` (+1 right, -1 left).
  const edge = (s, start, sign) => {
    const limit = s.half + reach;
    let last = start;
    for (let p = start + sign * step; Math.abs(p) <= limit; p += sign * step) {
      if (!hit(s, p)) {
        let lo = last, hi = p;
        for (let i = 0; i < halve; i++) {
          const mid = (lo + hi) / 2;
          if (hit(s, mid)) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      }
      last = p;
    }
    return sign * limit;
  };
  return samples.map((s) => {
    // The page's line nearest the model's centre, within `near` px.
    let at = null;
    for (let d = 0; d <= near && at === null; d += step / 4) {
      if (hit(s, d)) at = d;
      else if (d && hit(s, -d)) at = -d;
    }
    if (at === null) return { centre: false };
    // Distances from the model's centre: `right` to the right edge, `left`
    // to the left edge (negative when that edge is right of the centre).
    return { centre: true, right: edge(s, at, 1), left: -edge(s, at, -1) };
  });
}

/**
 * The model as a hit-test, for probeLines in Node: the features of a layer's
 * drawn lines whose stroke covers a point (within half the drawn width of the
 * line as drawn), as MapLibre's line hit-test does.
 */
export function modelHitMap(lines) {
  const CELL = 16;
  const grids = new Map();
  for (const line of lines) {
    const half = (line.drawnWidth ?? line.width ?? 0) / 2;
    if (!grids.has(line.layer)) grids.set(line.layer, new Map());
    const grid = grids.get(line.layer);
    for (const part of line.drawn ?? line.parts) {
      for (let i = 1; i < part.length; i++) {
        const a = part[i - 1], b = part[i];
        const x0 = Math.floor((Math.min(a[0], b[0]) - half) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + half) / CELL);
        const y0 = Math.floor((Math.min(a[1], b[1]) - half) / CELL), y1 = Math.floor((Math.max(a[1], b[1]) + half) / CELL);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 10_000) continue;
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const k = `${x},${y}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push({ a, b, half, line });
        }
      }
    }
  }
  return {
    queryRenderedFeatures([x, y], { layers }) {
      const out = new Set();
      for (const layer of layers) {
        for (const seg of grids.get(layer)?.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
          if (out.has(seg.line)) continue;
          const dx = seg.b[0] - seg.a[0], dy = seg.b[1] - seg.a[1], l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((x - seg.a[0]) * dx + (y - seg.a[1]) * dy) / l2)) : 0;
          if (Math.hypot(x - seg.a[0] - t * dx, y - seg.a[1] - t * dy) <= seg.half) out.add(seg.line);
        }
      }
      return [...out].map((line) => ({ properties: line.properties }));
    },
  };
}

/**
 * The page's measurements against the model's, both from probeLines: how far
 * the page's line is centred from the model's (px, + to the right) and how
 * much wider it is. A sample the page has no line at is a failure.
 */
export function compareProbes(samples, page, model, { centre = 1, width = 0.6 } = {}) {
  let worstShift = 0, worstWidth = 0, checked = 0;
  const failures = [];
  const byLayer = {};
  samples.forEach((s, i) => {
    const r = page[i], m = model?.[i]?.centre ? model[i] : { right: s.half, left: s.half };
    const L = (byLayer[s.layer] ??= { checked: 0, worstShift: 0, worstWidth: 0 });
    checked++;
    L.checked++;
    if (!r?.centre) {
      if (failures.length < 12) failures.push({ layer: s.layer, route: s.route, at: [s.x, s.y], problem: 'the page draws no such line where the model has it' });
      worstShift = Infinity;
      L.worstShift = Infinity;
      return;
    }
    const shift = ((r.right - m.right) - (r.left - m.left)) / 2;
    const dWidth = (r.right + r.left) - (m.right + m.left);
    if (Math.abs(shift) > Math.abs(worstShift)) worstShift = shift;
    if (Math.abs(dWidth) > Math.abs(worstWidth)) worstWidth = dWidth;
    if (Math.abs(shift) > Math.abs(L.worstShift)) L.worstShift = shift;
    if (Math.abs(dWidth) > Math.abs(L.worstWidth)) L.worstWidth = dWidth;
    if ((Math.abs(shift) > centre || Math.abs(dWidth) > width) && failures.length < 12) {
      failures.push({ layer: s.layer, route: s.route, at: [s.x, s.y], shift: +shift.toFixed(2), width: +dWidth.toFixed(2), problem: Math.abs(shift) > centre ? `drawn ${shift.toFixed(2)} px to the side of the model's line` : `drawn ${dWidth.toFixed(2)} px wider than the model's` });
    }
  });
  return { checked, worstShift, worstWidth, failures, byLayer };
}

/**
 * The other way round: every line the model draws on the screen (long
 * enough to matter, not invisible) must be among the page's lines for that
 * layer. `page` is [{layer, sig}].
 */
export function compareLinesBack(model, page, { minLength = 4 } = {}) {
  const have = new Set(page.map((p) => `${p.layer}|${p.sig}`));
  let checked = 0, missing = 0;
  const failures = [];
  for (const line of model) {
    if ((line.opacity ?? 1) <= 0.01) continue;
    const length = (line.drawn ?? line.parts).reduce((n, part) => n + part.slice(1).reduce((m, p, i) => m + Math.hypot(p[0] - part[i][0], p[1] - part[i][1]), 0), 0);
    if (length < minLength) continue;
    checked++;
    if (have.has(`${line.layer}|${signature(line.properties)}`)) continue;
    missing++;
    if (failures.length < 12) {
      failures.push({ layer: line.layer, route: line.route ?? line.properties?.routes ?? line.kind ?? null, length: +length.toFixed(1), problem: 'the model draws a line the page does not' });
    }
  }
  return { checked, missing, failures };
}
