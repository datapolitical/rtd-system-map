// What the page's controls cover. Runs in the page (page.evaluate(coverInPage)): the share of the
// screen under the panels, and the station names and line letters whose place is under one.
export function coverInPage() {
  const m = window.zoomMap;
  const W = innerWidth, H = innerHeight;
  const rects = [...document.querySelectorAll('.panel')].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none')
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
  const area = rects.reduce((n, r) => n + Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)), 0);
  const seen = new Map();
  for (const source of ['trial-labels', 'trial-attached']) {
    for (const f of m.querySourceFeatures(source)) {
      const { kind, key, name, route, fade } = f.properties;
      if (!['name', 'letter'].includes(kind) || fade === 0) continue;
      const p = m.project(f.geometry.coordinates);
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
      seen.set(`${source}:${key}`, { kind, label: kind === 'name' ? name : route, x: p.x, y: p.y });
    }
  }
  const pad = 4;
  const under = [...seen.values()].filter((s) => rects.some((r) => s.x > r.left - pad && s.x < r.right + pad && s.y > r.top - pad && s.y < r.bottom + pad));
  return { share: area / (W * H), panels: rects.map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]),
    onScreen: seen.size, under: under.map((s) => `${s.kind} ${s.label} at ${Math.round(s.x)},${Math.round(s.y)}`) };
}

// The most of the screen the controls may cover. The first preview's panels took 23%.
export const MAX_COVER = 0.1;
export const coverShare = (panels, [W, H]) => panels.reduce((n, [x, y, w, h]) => n + Math.max(0, Math.min(x + w, W) - Math.max(x, 0)) * Math.max(0, Math.min(y + h, H) - Math.max(y, 0)), 0) / (W * H);
