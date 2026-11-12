// The bus rules that are about the style, not about a place (BS07, BS09, BS10,
// BS11, TH02, SP02, CW07; KD-04, KD-06, LN-08): how wide each street class is
// at each zoom, the zoom each comes in at, a part-time line's style, how the
// halls are filled, the zoom the stops come in at, and what is drawn over what.
//
// They read the drawn model (qa/drawn/model.mjs) at the zoom the caller asks
// for, from the page's own style and the build's own data: nothing here is a
// width or a colour the page does not give. The rules are DESIGN.md's; where
// one is a number it is in DEFAULTS, with the line it comes from.
//
// A finding is { kind, layer, route, px, zoom, msg } like the others, its px a
// point on a street of the class (or the hall, or the stop) it is about, so it
// has a place on the ground and a link.
//
//   class-width    KD-04, LN-08: one class is one width (within `widthTol` px
//                  across its streets), and the width never falls as the class
//                  gets busier.
//   class-step     KD-04, BS09: neighbouring classes differ by a ratio of at
//                  least `minRatio` (DESIGN.md: steps of about 1.4 times).
//   class-zoom     BS09: a class is drawn (opacity at least 0.3) from half a
//                  zoom after the zoom DESIGN.md says it comes in at, and not
//                  half a zoom before it.
//   class-vs-rail  BS10: the busiest street is at least as wide as the rail
//                  line's fill from z13, and within `overview` of it below.
//   draw-order     CW07, BS10: every street layer is drawn before (under) every
//                  rail layer.
//   parttime-style BS11: a street with only part-time routes is a dashed or
//                  dotted line no wider than the next class up and gets no
//                  solid stroke.
//   hall-style     TH02: halls are filled, never outlined, from z13; a hall
//                  below ground is a fill a shade under the land.
//   stop-zoom      SP02: stops from z15, gates from z17, stop names from z16.

import { toLonLat } from './mercator.mjs';
import { streetsOf, tokens } from './buslines.mjs';

export const DEFAULTS = {
  widthTol: 0.25, // KD-04
  minRatio: 1.2, // DESIGN.md "six steps of about 1.4 times"
  // BS09: the zoom each class comes in at (DESIGN.md table). By class order,
  // busiest first; the model's classes are found from the data, busiest = the
  // highest buses an hour.
  from: [0, 0, 0, 0, 9, 10.5],
  railFrom: 13, // BS10: close in the busiest street is wider than rail
  overview: 0.4, // BS10: "about equal" below it, as a share of the rail's width
  hallFrom: 13, // TH02
  stopsFrom: 15,
  gatesFrom: 17,
  stopNamesFrom: 16,
  hallFaint: 0.12, // TH02: a hall above ground is faint: its relative luminance within this of the land's
  hallBelow: 0.003, // TH02: a hall below ground is at least this much darker than the land
};

const lum = (c) => {
  if (!c) return null;
  let r, g, b;
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(c);
  if (m) { [r, g, b] = [+m[1], +m[2], +m[3]]; if (r <= 1 && g <= 1 && b <= 1 && /\./.test(m[1])) { r *= 255; g *= 255; b *= 255; } } else {
    const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!h) return null;
    const x = h[1].length === 3 ? [...h[1]].map((v) => v + v).join('') : h[1];
    r = parseInt(x.slice(0, 2), 16); g = parseInt(x.slice(2, 4), 16); b = parseInt(x.slice(4, 6), 16);
  }
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// The street classes at a zoom, busiest first: id, width of its main stroke,
// the buses an hour that sort them, and one street of it.
function classesAt(zoom) {
  const by = new Map();
  for (const s of streetsOf(zoom, { minOpacity: 0 })) {
    if (s.layer !== 'street' || !s.cls) continue;
    let c = by.get(s.cls);
    if (!c) by.set(s.cls, (c = { id: s.cls, widths: [], bph: [], sample: s, opacity: 0 }));
    c.widths.push(s.w);
    if (s.props?.bph != null) c.bph.push(s.props.bph);
    c.opacity = Math.max(c.opacity, s.opacity ?? 1);
  }
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  return [...by.values()].map((c) => ({ ...c, bphMid: med(c.bph), w: med(c.widths), wMin: Math.min(...c.widths), wMax: Math.max(...c.widths) })).sort((a, b) => b.bphMid - a.bphMid);
}

/**
 * Style findings at one zoom of the model.
 * @param {object} model openModel()'s result (style, zoom(z), data)
 * @param {number} z the zoom
 * @param {object} opts DEFAULTS overrides
 */
export function styleFaults(model, z, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const zoom = model.zoom(z);
  const faults = [];
  const px = (p) => p;
  const classes = classesAt(zoom);
  const point = (c) => c?.sample?.part?.[0] ?? [0, 0];
  const at = (p) => { const [lon, lat] = toLonLat(p, z); return `${lat.toFixed(5)},${lon.toFixed(5)}`; };
  const push = (kind, c, msg, layer = 'street') => faults.push({ kind, layer, route: c?.sample?.routes?.join(' ') ?? null, px: px(point(c)), zoom: z, msg: `${msg} at ${at(point(c))}` });

  // KD-04 / LN-08: one class, one width; busier never narrower; steps of a ratio.
  for (const c of classes) {
    if (c.wMax - c.wMin > o.widthTol) push('class-width', c, `class ${c.id} is drawn ${c.wMin.toFixed(2)} to ${c.wMax.toFixed(2)} px wide at zoom ${z} (one class is one width within ${o.widthTol} px)`);
  }
  const seen = classes.filter((c) => c.opacity >= 0.5);
  for (let i = 1; i < seen.length; i++) {
    const busier = seen[i - 1], quieter = seen[i];
    if (busier.w < quieter.w - 1e-6) push('class-width', busier, `class ${busier.id} (${busier.bphMid} buses an hour) is ${busier.w.toFixed(2)} px, narrower than the quieter ${quieter.id} (${quieter.w.toFixed(2)} px) at zoom ${z}`);
    else if (quieter.w > 0 && busier.w / quieter.w < o.minRatio) push('class-step', busier, `classes ${busier.id} (${busier.w.toFixed(2)} px) and ${quieter.id} (${quieter.w.toFixed(2)} px) differ by a ratio of ${(busier.w / quieter.w).toFixed(2)} at zoom ${z}, under ${o.minRatio}`);
  }

  // BS09: the zoom a class comes in at.
  const order = classes.map((c) => c.id);
  classes.forEach((c, i) => {
    const from = o.from[i];
    if (from === undefined) return;
    if (z >= from + 0.5 && c.opacity < 0.5) push('class-zoom', c, `class ${c.id} is not drawn at zoom ${z}: it comes in at ${from}`);
    if (z <= from - 0.5 && c.opacity >= 0.3) push('class-zoom', c, `class ${c.id} is drawn at zoom ${z}, before the zoom ${from} it comes in at`);
  });
  void order;

  // BS10: the busiest street against rail.
  const top = classes[0];
  const railWidths = zoom.lines.filter((l) => l.mode === 'rail' && l.layer === 'rail').map((l) => l.drawnWidth ?? l.width);
  if (top && top.opacity >= 0.5 && railWidths.length) {
    const rail = Math.max(...railWidths);
    if (z >= o.railFrom && top.w < rail - 0.05) push('class-vs-rail', top, `the busiest street (${top.id}) is ${top.w.toFixed(1)} px, narrower than rail's ${rail.toFixed(1)} px at zoom ${z}: close in it is wider`);
    if (z < o.railFrom && Math.abs(top.w - rail) > o.overview * rail) push('class-vs-rail', top, `the busiest street (${top.id}) is ${top.w.toFixed(1)} px against rail's ${rail.toFixed(1)} px at zoom ${z}: in the overview they are about equal`);
  }

  // BS11: a street of part-time routes only.
  const widthOf = (id) => classes.find((c) => c.id === id)?.w;
  const next = classes.at(-2)?.w; // the class above the quietest
  for (const l of zoom.lines) {
    if (l.source !== 'streets' || l.mode !== 'bus' || (l.properties?.n ?? 0) !== 0 || l.layer === 'street' || /^street-/.test(l.layer)) continue;
    if (!(l.opacity >= 0.3)) continue;
    const w = l.drawnWidth ?? l.width;
    const dashed = Array.isArray(l.dash) && l.dash.length > 0;
    const sample = { sample: { part: l.parts[0], routes: tokens(l.properties?.routes) } };
    if (!dashed) push('parttime-style', sample, `part-time ${tokens(l.properties?.routes).join(' ')} is a solid line (${w.toFixed(1)} px) at zoom ${z}: part-time routes are dashed or dotted`, l.layer);
    else if (next !== undefined && w > next + 0.05) push('parttime-style', sample, `part-time ${tokens(l.properties?.routes).join(' ')} is ${w.toFixed(1)} px, wider than the class above the quietest (${next.toFixed(1)} px) at zoom ${z}`, l.layer);
    void widthOf;
  }

  // CW07 / BS10: draw order (once per model; every zoom would repeat it).
  if (z === (opts.orderAt ?? model.ZOOMS?.[0] ?? z)) {
    const layers = model.style.layers;
    const firstRail = layers.findIndex((l) => l.type === 'line' && l.source === 'routes');
    const lastStreet = layers.map((l, i) => (l.source === 'streets' && l.type === 'line' ? i : -1)).reduce((m, i) => Math.max(m, i), -1);
    if (firstRail >= 0 && lastStreet > firstRail) {
      push('draw-order', top, `a street layer (${layers[lastStreet].id}) is drawn after rail (${layers[firstRail].id}): rail must be over every bus layer`, layers[lastStreet].id);
    }
  }

  // TH02: the halls.
  const land = lum(model.style.layers.find((l) => l.type === 'background')?.paint?.['background-color']?.toString?.());
  const hallLines = model.style.layers.filter((l) => l.type === 'line' && l.source === 'terminals');
  if (hallLines.length && z >= o.hallFrom) {
    faults.push({ kind: 'hall-style', layer: hallLines[0].id, route: null, px: point(top), zoom: z, msg: `the halls have an outline layer (${hallLines.map((l) => l.id).join(', ')}): a hall is a fill with no edge, at ${at(point(top))}` });
  }
  const halls = zoom.areas.filter((a) => a.source === 'terminals');
  const wanted = model.data?.terminals?.features?.length ?? 0;
  if (wanted && z >= o.hallFrom + 0.5 && !halls.some((a) => a.opacity >= 0.5)) {
    faults.push({ kind: 'hall-style', layer: 'terminals', route: null, px: point(top), zoom: z, msg: `the halls are not drawn at zoom ${z}: they come in at ${o.hallFrom}` });
  }
  if (wanted && z <= o.hallFrom - 0.5 && halls.some((a) => a.opacity >= 0.3)) {
    faults.push({ kind: 'hall-style', layer: 'terminals', route: null, px: point(top), zoom: z, msg: `the halls are drawn at zoom ${z}, before the zoom ${o.hallFrom} they come in at` });
  }
  if (land != null && z >= o.hallFrom + 1) {
    for (const a of halls) {
      if (!(a.opacity >= 0.5)) continue;
      const f = model.data.terminals.features[a.index];
      const L = lum(a.color);
      if (L == null) continue;
      const under = f?.properties?.underground === 1;
      const at0 = a.parts[0]?.[0] ?? point(top);
      if (under && !(L <= land - o.hallBelow)) faults.push({ kind: 'hall-style', layer: a.layer, route: null, px: at0, zoom: z, msg: `the hall of ${a.name} is below ground but its fill is not a shade under the land (luminance ${L.toFixed(3)} against ${land.toFixed(3)}) at ${at(at0)}` });
      if (!under && Math.abs(L - land) > o.hallFaint) faults.push({ kind: 'hall-style', layer: a.layer, route: null, px: at0, zoom: z, msg: `the hall of ${a.name} is above ground but is not a faint fill (luminance ${L.toFixed(3)} against ${land.toFixed(3)}) at ${at(at0)}` });
      if (contrast(L, land) < 1.02) faults.push({ kind: 'hall-style', layer: a.layer, route: null, px: at0, zoom: z, msg: `the hall of ${a.name} cannot be seen against the land (contrast ${contrast(L, land).toFixed(3)}) at ${at(at0)}` });
    }
  }

  // SP02: stops from z15, gates from z17, stop names from z16.
  const dots = zoom.marks.filter((m) => m.kind === 'circle' && m.source === 'stops');
  const plain = dots.filter((m) => m.layer === 'stops' || !/gate/.test(m.layer));
  const gates = dots.filter((m) => /gate/.test(m.layer));
  const names = zoom.labels.filter((l) => l.source === 'stops');
  const stopSample = { sample: { part: [dots[0]?.at ?? point(top)], routes: [] } };
  const stopsExist = (model.data?.stops?.features?.length ?? 0) > 0;
  if (stopsExist) {
    if (z >= o.stopsFrom && !plain.length) faults.push({ kind: 'stop-zoom', layer: 'stops', route: null, px: point(top), zoom: z, msg: `no stops are drawn at zoom ${z}: they come in at ${o.stopsFrom}` });
    if (z < o.stopsFrom && plain.length) faults.push({ kind: 'stop-zoom', layer: 'stops', route: null, px: plain[0].at, zoom: z, msg: `stops are drawn at zoom ${z}, before the zoom ${o.stopsFrom} they come in at, at ${at(plain[0].at)}` });
    if (z < o.gatesFrom && gates.length) faults.push({ kind: 'stop-zoom', layer: gates[0].layer, route: null, px: gates[0].at, zoom: z, msg: `gates are drawn at zoom ${z}, before the zoom ${o.gatesFrom} they come in at, at ${at(gates[0].at)}` });
    if (z >= o.gatesFrom && !gates.length && (model.data.stops.features.some((f) => f.properties?.gate === 1))) faults.push({ kind: 'stop-zoom', layer: 'stops-gate', route: null, px: point(top), zoom: z, msg: `no gates are drawn at zoom ${z}: they come in at ${o.gatesFrom}` });
    if (z < o.stopNamesFrom && names.length) faults.push({ kind: 'stop-zoom', layer: names[0].layer, route: null, px: names[0].at, zoom: z, msg: `stop names are drawn at zoom ${z}, before the zoom ${o.stopNamesFrom} they come in at, at ${at(names[0].at)}` });
    void stopSample;
  }
  return faults;
}
