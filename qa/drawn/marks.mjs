// Mark faults (issue #44): two marks for one station, a stop with no line of
// its route anywhere near it, and a translucent fill lying over the network.
//
// Stops sit at the curb, not on the centreline: the map's median stop is
// about 20 px from its line at z17, so "touches" cannot be the rule. A stop
// is a fault here only when no line of any route it carries comes within
// `maxStray` px — a stop that belongs to no drawn route at all.

const inside = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

const distToSeg = ([px, py], a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
};

const routesOf = (v) => String(v ?? '').split(/\s+/).filter(Boolean);

/**
 * @param {{marks: Array, lines: Array, areas: Array}} frame
 * @param {{maxStray?: number}} opts px from any line of the stop's routes
 */
export function markFaults(frame, { maxStray = 50 } = {}) {
  const faults = [];

  // One mark per station: two station marks for the same id at one place.
  const byId = new Map();
  for (const m of frame.marks) {
    if (!/^stations/.test(m.layer)) continue;
    const id = m.properties?.id;
    if (id == null) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(m);
  }
  for (const [id, list] of byId) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) < 3) {
        faults.push({ kind: 'duplicate', layer: b.layer, id, px: b.at, msg: `station ${id} is drawn twice (${a.layer} and ${b.layer})` });
      }
    }
  }

  // A stop whose routes are drawn, but none of their lines come near it.
  const routeLines = frame.lines.filter((l) => l.route != null || routesOf(l.properties?.routes).length);
  for (const m of frame.marks) {
    if (m.layer !== 'stops') continue;
    // A station gate or platform is inside the station, not a street stop.
    if (/\b(Gate|Track|Platform|Bay)\b/i.test(m.properties?.name ?? '')) continue;
    const mine = new Set(routesOf(m.properties?.lines));
    if (!mine.size) continue;
    let best = Infinity, matched = false;
    for (const line of routeLines) {
      if (!routesOf(line.route ?? line.properties?.routes).some((r) => mine.has(r))) continue;
      matched = true;
      for (const part of line.parts ?? []) {
        for (let i = 1; i < part.length; i++) {
          const d = distToSeg(m.at, part[i - 1], part[i]);
          if (d < best) best = d;
        }
      }
    }
    if (matched && best > maxStray) {
      faults.push({ kind: 'stray-stop', layer: m.layer, id: m.properties?.id, px: m.at, msg: `stop "${m.properties?.name}" is ${best.toFixed(0)} px from every line it rides` });
    }
  }

  // A translucent fill over the network: a lead, not a fault.
  for (const area of frame.areas) {
    if (!(area.opacity > 0 && area.opacity < 1)) continue;
    const xs = [], ys = [];
    for (const part of area.parts ?? []) for (const p of part) { xs.push(p[0]); ys.push(p[1]); }
    if (!xs.length) continue;
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const under = frame.marks.some((m) => inside(m.at, box))
      || frame.lines.some((l) => (l.parts ?? []).some((part) => part.some((p) => inside(p, box))));
    if (under) faults.push({ kind: 'translucent', layer: area.layer, px: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], msg: `${area.layer} lies over lines or marks (lead)` });
  }
  return faults;
}
