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
  const failures = [];
  for (const line of drawn) {
    const parts = (byKey.get(key(line)) ?? []).flatMap((l) => l.parts);
    if (!parts.length) continue;
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
  return { pairs, worst, failures };
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
