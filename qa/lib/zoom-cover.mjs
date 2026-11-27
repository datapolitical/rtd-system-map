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

// The map's credit (MapLibre's attribution control, a <details> with a <summary> "i" button).
// Runs in the page (page.evaluate(creditInPage)): where the credit and its button are, how the
// button's icon repeats, and where the page's panels are. creditErrors judges it, so the same
// rule runs on a pinned measurement in the unit tests (qa/recall/prototype-credit.json).
export function creditInPage() {
  const box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const credit = document.querySelector('.maplibregl-ctrl-attrib');
  const button = credit?.querySelector('.maplibregl-ctrl-attrib-button');
  const panels = [...document.querySelectorAll('.panel')].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none')
    .map(box).filter(([, , w, h]) => w && h);
  const inner = credit?.querySelector('.maplibregl-ctrl-attrib-inner');
  const icon = button && getComputedStyle(button, '::before');
  return { viewport: [innerWidth, innerHeight], theme: document.documentElement.dataset.theme,
    open: credit?.classList.contains('maplibregl-compact-show') ?? false,
    credit: credit ? box(credit) : null, button: button ? box(button) : null,
    repeat: button ? getComputedStyle(button).backgroundRepeat : null, panels,
    ground: credit ? getComputedStyle(credit).backgroundColor : null,
    ink: inner ? getComputedStyle(inner).color : null,
    links: [...(inner?.querySelectorAll('a') ?? [])].map((a) => getComputedStyle(a).color),
    icon: icon && icon.content !== 'none' ? icon.backgroundColor : null };
}

// A computed colour as [r, g, b, alpha], 0 to 255 and 0 to 1: rgb(), rgba() or color(srgb ...).
export function parseColour(text) {
  const n = String(text).match(/-?[\d.]+/g)?.map(Number) ?? [];
  if (/^color\(srgb/.test(text)) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
  return [n[0], n[1], n[2], n[3] ?? 1];
}
const luminance = ([r, g, b]) => {
  const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// MapLibre draws the "i" as a 24 px background image on a 24 px button.
export const CREDIT_ICON = 24;
export function creditErrors(m) {
  const { viewport: [W, H], credit, button, repeat, panels } = m;
  if (!credit || !button) return ['the map has no credit'];
  const errors = [];
  for (const [what, [bx, by, bw, bh]] of [['credit', credit], ['credit\'s button', button]]) {
    if (bx < 0 || by < 0 || bx + bw > W || by + bh > H) errors.push(`the ${what} runs off the screen at ${[bx, by, bw, bh]}`);
  }
  const [x, y, w, h] = credit;
  for (const [px, py, pw, ph] of panels) {
    const overlap = Math.max(0, Math.min(x + w, px + pw) - Math.max(x, px)) * Math.max(0, Math.min(y + h, py + ph) - Math.max(y, py));
    if (overlap > 0) errors.push(`the credit ${credit} lies under the panel ${[px, py, pw, ph]}`);
  }
  // The credit follows the theme: a dark ground on the dark map, a light one on the light map,
  // and its lettering readable on it (WCAG AA, 4.5 to 1).
  if (m.theme && m.ground) {
    const ground = parseColour(m.ground);
    const light = luminance(ground) > 0.4;
    if (ground[3] > 0.3 && light !== (m.theme === 'light')) errors.push(`the credit's ground ${m.ground} is ${light ? 'light' : 'dark'} on the ${m.theme} map`);
    for (const [what, ink] of [['lettering', m.open ? m.ink : null], ...(m.open ? m.links.map((l) => ['link', l]) : []), ['"i"', m.icon]]) {
      if (!ink) continue;
      const ratio = contrast(parseColour(ink), ground);
      if (ratio < 4.5) errors.push(`the credit's ${what} ${ink} on ${m.ground} is ${ratio.toFixed(1)} to 1`);
    }
  }
  if (repeat !== 'no-repeat') {
    const icons = Math.ceil(button[2] / CREDIT_ICON - 0.01) * Math.ceil(button[3] / CREDIT_ICON - 0.01);
    if (icons > 1) errors.push(`the credit's "i" shows ${icons} times on a ${button[2]} by ${button[3]} px button`);
  }
  return errors;
}
