// Street alignment faults (issue #46): a route line that leaves the streets
// it is supposed to run on.
//
// The basemap's own street centrelines come from the same frame as the lines
// (qa/drawn/model.mjs reads the page's vector tiles); a route vertex farther
// than `maxOff` px from every street centreline is off the street grid. The
// route geometry is the build's unshifted centreline — the strand offset the
// style applies is cosmetic and would otherwise be measured as a fault.

const cell = 32;

function gridOf(streets) {
  const grid = new Map();
  for (const s of streets) {
    for (const part of s.parts ?? []) {
      for (let i = 1; i < part.length; i++) {
        const [a, b] = [part[i - 1], part[i]];
        const x0 = Math.floor(Math.min(a[0], b[0]) / cell);
        const x1 = Math.floor(Math.max(a[0], b[0]) / cell);
        const y0 = Math.floor(Math.min(a[1], b[1]) / cell);
        const y1 = Math.floor(Math.max(a[1], b[1]) / cell);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const k = `${x},${y}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push([a, b]);
        }
      }
    }
  }
  return grid;
}

const distToSeg = ([px, py], a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
};

const isRoute = (l) => l.route != null || String(l.properties?.routes ?? '').trim() !== '';

/**
 * Route vertices that are off every street in the frame.
 * @param {{lines: Array, basemap?: {streets: Array}}} frame
 * @param {{maxOff?: number}} opts px from the nearest street centreline
 */
export function streetFaults(frame, { maxOff = 12 } = {}) {
  const grid = gridOf(frame.basemap?.streets ?? []);
  // A bus inside a terminal or on a platform is where it should be; the
  // street grid does not run through the building.
  const inside = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  const facility = [];
  for (const a of frame.areas ?? []) {
    if (!/terminal|platform/i.test(a.layer)) continue;
    const xs = [], ys = [];
    for (const part of a.parts ?? []) for (const p of part) { xs.push(p[0]); ys.push(p[1]); }
    if (xs.length) facility.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  const faults = [];
  for (const line of frame.lines) {
    if (/-(casing|edge|outline)$/.test(line.layer) || line.source === 'flexride' || !isRoute(line)) continue;
    // A train in its own corridor is not on a street; only street-running
    // routes are judged against the street grid.
    if (/^rail|(^|-)rail(-|$)/.test(line.layer)) continue;
    for (const part of line.parts ?? []) {
      let run = [];
      const flush = () => {
        // One stray vertex is a clipped end or a corner off the tile; a run
        // of two or more is a stretch of route with no street under it.
        if (run.length >= 2) {
          const worst = run.reduce((a, b) => (b.d > a.d ? b : a));
          faults.push({
            kind: 'off-street',
            layer: line.layer,
            route: line.route ?? line.properties?.routes ?? null,
            px: worst.p,
            msg: `route runs ${run.length} vertices, up to ${worst.d.toFixed(0)} px, off every street`,
          });
        }
        run = [];
      };
      for (const p of part) {
        let best = Infinity;
        const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
        for (let dx = -1; dx <= 2 && best > 2; dx++) for (let dy = -1; dy <= 2; dy++) {
          for (const [a, b] of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            const d = distToSeg(p, a, b);
            if (d < best) best = d;
          }
        }
        if (best > maxOff && !facility.some((b) => inside(p, b))) run.push({ p, d: best }); else flush();
      }
      flush();
    }
  }
  return faults;
}
