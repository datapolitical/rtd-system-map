// Width, weight and hierarchy of the lines (qa/rules/ CW07, CW08, CW09 and
// literature KD-01, KD-04, KD-05, KD-06, KD-07), from the style.
//
// Each kind of line (a rail tier, a street class, a part-time bus tier) is a
// "class row" at a zoom: the width it is drawn at, how strongly it is drawn
// (opacity), its colour against the land, and its weight, width times
// contrast. The rules are about the rows' order and spacing:
//
//  - rail-lighter (KD-01, DESIGN.md L1021 and L1122): a bus class reads
//    heavier than a rail tier. Where DESIGN.md itself lets the busiest streets
//    be as wide as or wider than rail close in (L1024) the finding is
//    `rail-lighter-design`: the document contradicts itself, and the
//    detector says so instead of picking one reading.
//  - class-spread (KD-04): one class, more than 0.25 px of width between its
//    members (a tier whose headways straddle a step of the style).
//  - class-close (KD-04, LN-08): neighbouring classes less than 1.6 px apart.
//  - grey-confusable (KD-05): neighbouring classes apart by neither 1.6 px
//    nor 3:1 in greyscale lightness.
//  - many-classes (KD-06): more than four bus widths drawn at once.
//  - kinds-alike (KD-07): rail and a bus class that differ in fewer than two
//    of outline, colour and width.
//  - tier-width-order, tier-dash, tier-below (CW08): the looks of the tiers.
//  - none-heavy (CW09): a line not running drawn heavier than one that runs.

import { contrast, grey, hex, oklch } from './colours.mjs';
import { ROLES, finding, groundsOf, themeOf } from './styles.mjs';

// The zooms the rows are read at: every half zoom from 9 to 18.
export const GRID = Array.from({ length: 19 }, (_, i) => 9 + i / 2);

export const WEIGHT_LIMITS = {
  drawn: 0.5, // a class is "drawn" at a zoom when its opacity is at least this
  classApart: 1.6, // (source) Ledermann 2022 Table 8.1
  classSpread: 0.25, // (suggested)
  greyRatio: 3, // (source) literature KD-05
  busClasses: 4, // (suggested) literature KD-06
  widthStep: 0.25, // widths within this are one width class
  chromaApart: 0.04, // (suggested) OKLCH chroma difference that reads as another colour
  exempt: 3, // DESIGN.md L1020-24: the busiest streets (every 10 minutes or better) may match rail close in
};

const r2 = (x) => Math.round(x * 100) / 100;
const group = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

/**
 * The class rows at a zoom.
 * @returns {Array<{key, mode, label, layer, width, widths, opacity, colour, ratio, weight, rep, worst}>}
 */
export function classRows(view, z, land = groundsOf(view).land) {
  const rows = [];
  const fillL = view.layerById(ROLES.railFill), edgeL = view.layerById(ROLES.railEdge), partL = view.layerById(ROLES.railPart);
  const read = (layer, rep) => view.get(layer, 'line-width', 'paint', z, rep.props, 0);

  // Rail: the outline is the outermost ink of a full-service line.
  if (fillL) {
    for (const [tier, reps] of group(view.reps(fillL), (r) => r.props.tier ?? '')) {
      const per = reps.map((rep) => {
        const fill = view.colour(fillL, 'line-color', z, rep.props), edge = edgeL ? view.colour(edgeL, 'line-color', z, rep.props) : null;
        const width = read(edgeL ?? fillL, rep);
        const ratio = Math.max(...[fill, edge].filter(Boolean).map((c) => contrast(c, land)));
        return { rep, width, ratio, weight: width * ratio, fill, edge, opacity: view.opacity(fillL, rep, z), route: rep.props.route };
      });
      const worst = per.reduce((a, b) => (b.weight < a.weight ? b : a));
      rows.push({ key: `rail:${tier}`, per, mode: 'rail', label: `rail ${tier}`, layer: ROLES.railFill, width: worst.width, widths: per.map((p) => p.width), opacity: Math.min(...per.map((p) => p.opacity)), colour: worst.edge ?? worst.fill, fill: worst.fill, ratio: worst.ratio, weight: worst.weight, rep: worst.rep, worst: worst.route, reps });
    }
  }
  if (partL) {
    for (const [tier, reps] of group(view.reps(partL), (r) => r.props.tier ?? '')) {
      const per = reps.map((rep) => {
        const fill = view.colour(partL, 'line-color', z, rep.props), width = read(partL, rep);
        const ratio = contrast(fill, land);
        return { rep, width, ratio, weight: width * ratio, fill, opacity: view.opacity(partL, rep, z), route: rep.props.route };
      });
      const worst = per.reduce((a, b) => (b.weight < a.weight ? b : a));
      rows.push({ key: `rail-part:${tier}`, mode: 'rail', partTime: true, label: `part-time rail ${tier}`, layer: ROLES.railPart, width: worst.width, widths: per.map((p) => p.width), opacity: Math.min(...per.map((p) => p.opacity)), colour: worst.fill, fill: worst.fill, ratio: worst.ratio, weight: worst.weight, rep: worst.rep, worst: worst.route, reps });
    }
  }

  // Bus: the street classes, then the part-time tiers.
  const streetL = view.layerById(ROLES.street);
  if (streetL) {
    for (const [cls, reps] of group(view.reps(streetL), (r) => r.props.cls ?? '')) {
      const per = reps.map((rep) => ({ rep, width: read(streetL, rep), colour: view.colour(streetL, 'line-color', z, rep.props), opacity: view.opacity(streetL, rep, z) }));
      const strong = per.reduce((a, b) => (b.opacity > a.opacity ? b : a));
      const ratio = strong.colour ? contrast(strong.colour, land) : 0;
      rows.push({ key: `street:${cls}`, mode: 'bus', label: `street ${cls}`, cls, layer: ROLES.street, width: strong.width, widths: per.map((p) => p.width), opacity: strong.opacity, colour: strong.colour, ratio, weight: strong.width * ratio, rep: strong.rep, reps });
    }
  }
  for (const id of ROLES.busPart) {
    const layer = view.layerById(id);
    if (!layer) continue;
    for (const [tier, reps] of group(view.reps(layer), (r) => r.props.tier ?? '')) {
      const per = reps.map((rep) => ({ rep, width: read(layer, rep), colour: view.colour(layer, 'line-color', z, rep.props), opacity: view.opacity(layer, rep, z) }));
      const strong = per.reduce((a, b) => (b.opacity > a.opacity ? b : a));
      const ratio = strong.colour ? contrast(strong.colour, land) : 0;
      rows.push({ key: `${id}:${tier}`, mode: 'bus', partTime: true, label: `${id} ${tier}`, tier, layer: id, width: strong.width, widths: per.map((p) => p.width), opacity: strong.opacity, colour: strong.colour, ratio, weight: strong.width * ratio, rep: strong.rep, reps });
    }
  }
  return rows;
}

const merge = (items) => {
  // One finding per (kind, key): the zooms it was seen at, and the worst one.
  const out = new Map();
  for (const f of items) {
    const k = `${f.kind}|${f.key}`;
    const had = out.get(k);
    if (!had) out.set(k, { ...f, zooms: [f.zoom] });
    else {
      had.zooms.push(f.zoom);
      if ((f.badness ?? 0) > (had.badness ?? 0)) Object.assign(had, { ...f, zooms: had.zooms });
    }
  }
  return [...out.values()].map((f) => {
    const zs = [...new Set(f.zooms)].sort((a, b) => a - b);
    return { ...f, zooms: zs, msg: `${f.msg} [zoom ${zs[0]}${zs.length > 1 ? ` to ${zs.at(-1)}` : ''}${zs.length > 2 ? `, ${zs.length} half zooms` : ''}]` };
  });
};

/**
 * KD-01, KD-04, KD-05, KD-06, KD-07, CW08 and CW09 for the theme the view was built in.
 */
export function weightFaults(view, { limits = {}, grid = GRID } = {}) {
  const L = { ...WEIGHT_LIMITS, ...limits };
  const theme = themeOf(view);
  const land = groundsOf(view).land;
  const found = [];
  const tables = grid.map((z) => ({ z, rows: classRows(view, z, land) }));
  const isDrawn = (r) => r.opacity >= L.drawn && r.width > 0;

  for (const { z, rows } of tables) {
    const rails = rows.filter((r) => r.mode === 'rail' && !r.partTime && isDrawn(r));
    const streets = rows.filter((r) => r.layer === ROLES.street && isDrawn(r)).sort((a, b) => b.width - a.width || b.ratio - a.ratio);
    const allBus = rows.filter((r) => r.mode === 'bus' && isDrawn(r));

    // KD-01: every drawn rail tier heavier than every drawn bus class.
    const busiest = new Set(rows.filter((r) => r.layer === ROLES.street).sort((a, b) => b.widths[0] - a.widths[0] || b.ratio - a.ratio).slice(0, L.exempt).map((r) => r.key));
    for (const rail of rails) for (const bus of allBus) {
      if (bus.weight < rail.weight) continue;
      const design = busiest.has(bus.key);
      const losing = [...new Set(rail.per.filter((p) => p.weight <= bus.weight).map((p) => p.route))].sort();
      found.push({
        kind: design ? 'rail-lighter-design' : 'rail-lighter', rule: 'KD-01', key: `${rail.key}|${bus.key}`, zoom: z, rep: bus.rep, layer: bus.layer, route: rail.worst,
        badness: bus.weight / rail.weight,
        msg: `${theme}: ${bus.label} (${r2(bus.width)} px, ${r2(bus.ratio)}:1, weight ${r2(bus.weight)}) reads heavier than ${rail.label} (${r2(rail.width)} px, ${r2(rail.ratio)}:1, weight ${r2(rail.weight)}, weakest line ${rail.worst}; lines under it: ${losing.join(' ')})${design ? ': DESIGN.md L1021 says rail is always heavier, L1024 lets the busiest streets match it close in' : ''}`,
      });
    }

    // KD-04: one class, one width.
    for (const row of rows) {
      const spread = Math.max(...row.widths) - Math.min(...row.widths);
      if (spread > L.classSpread && row.opacity >= L.drawn) {
        found.push({ kind: 'class-spread', rule: 'KD-04', key: row.key, zoom: z, rep: row.rep, layer: row.layer, badness: spread, msg: `${theme}: ${row.label} is drawn at ${row.widths.map(r2).filter((w, i, a) => a.indexOf(w) === i).join(' to ')} px; a class has one width (spread ${r2(spread)} px, limit ${L.classSpread})` });
      }
    }

    // KD-04 / LN-08 and KD-05: neighbouring classes apart.
    for (const list of [streets, rails]) {
      const ordered = [...list].sort((a, b) => b.width - a.width);
      for (let i = 1; i < ordered.length; i++) {
        const a = ordered[i - 1], b = ordered[i];
        const gap = a.width - b.width;
        if (gap >= L.classApart) continue;
        const lightness = a.colour && b.colour ? contrast(grey(a.colour), grey(b.colour)) : 1;
        const same = gap < L.widthStep;
        found.push({ kind: lightness < L.greyRatio ? 'grey-confusable' : 'class-close', rule: lightness < L.greyRatio ? 'KD-05' : 'KD-04', key: `${a.key}|${b.key}`, zoom: z, rep: b.rep, layer: b.layer, badness: L.classApart - gap, msg: `${theme}: ${a.label} (${r2(a.width)} px) and ${b.label} (${r2(b.width)} px) are ${r2(gap)} px apart${same ? ', one width' : ''}; classes must differ by ${L.classApart} px${lightness < L.greyRatio ? ` or ${L.greyRatio}:1 in greyscale (they differ by ${r2(lightness)}:1)` : ''}` });
      }
    }

    // KD-07: rail and bus differ in two variables or more.
    const casing = !!view.layerById(ROLES.railCasing);
    for (const rail of rails) for (const bus of allBus) {
      const dw = Math.abs(rail.width - bus.width) >= L.classApart;
      const dc = rail.fill && bus.colour ? Math.abs(oklch(rail.fill).C - oklch(bus.colour).C) >= L.chromaApart : false;
      const dout = casing; // rail has a casing and an outline layer; the bus layers have none
      const n = [dw, dc, dout].filter(Boolean).length;
      if (n < 2) found.push({ kind: 'kinds-alike', rule: 'KD-07', key: `${rail.key}|${bus.key}`, zoom: z, rep: bus.rep, layer: bus.layer, badness: 3 - n, msg: `${theme}: ${rail.label} and ${bus.label} differ in ${n} of outline, colour and width (${r2(rail.width)} and ${r2(bus.width)} px); a rider tells the kinds apart by two` });
    }

    // KD-06: not many bus widths at once.
    const widths = [];
    for (const r of [...allBus].sort((a, b) => b.width - a.width)) if (!widths.some((w) => Math.abs(w - r.width) < L.widthStep)) widths.push(r.width);
    if (widths.length > L.busClasses) {
      found.push({ kind: 'many-classes', rule: 'KD-06', key: 'bus', zoom: z, rep: allBus[0]?.rep, layer: ROLES.street, badness: widths.length, msg: `${theme}: ${widths.length} bus widths are drawn at once (${widths.map(r2).join(', ')} px); more than ${L.busClasses} do not read as classes` });
    }

    // CW08: the looks of the tiers.
    for (const list of [streets, rails]) {
      // The tier order is the style's: strongest first by the width at the top zoom.
      const top = tables.at(-1).rows;
      const rank = (r) => top.find((t) => t.key === r.key)?.width ?? 0;
      const byRank = [...list].sort((a, b) => rank(b) - rank(a));
      for (let i = 1; i < byRank.length; i++) {
        if (byRank[i].width >= byRank[i - 1].width - 1e-6 && rank(byRank[i]) < rank(byRank[i - 1])) {
          found.push({ kind: 'tier-width-order', rule: 'CW08', key: `${byRank[i - 1].key}|${byRank[i].key}`, zoom: z, rep: byRank[i].rep, layer: byRank[i].layer, badness: 1, msg: `${theme}: ${byRank[i].label} (${r2(byRank[i].width)} px) is no thinner than ${byRank[i - 1].label} (${r2(byRank[i - 1].width)} px)` });
        }
      }
    }

    // CW09: a line not running is thinner than the thinnest that runs.
    const none = rows.filter((r) => r.mode === 'bus' && r.tier === 'none' && isDrawn(r));
    const running = rows.filter((r) => r.mode === 'bus' && !r.partTime && isDrawn(r));
    if (none.length && running.length) {
      const thin = Math.min(...running.map((r) => r.width));
      for (const n of none) if (n.width > thin + 1e-6) {
        found.push({ kind: 'none-heavy', rule: 'CW09', key: n.key, zoom: z, rep: n.rep, layer: n.layer, badness: n.width - thin, msg: `${theme}: a line not running at the time shown (${n.label}) is ${r2(n.width)} px wide, thicker than the thinnest line that runs (${r2(thin)} px); DESIGN.md draws it as a hairline` });
      }
    }
  }

  const faults = merge(found).map((f) => finding(view, f.rep, f.kind, f.rule, { layer: f.layer, route: f.route ?? null, zoom: f.zooms.at(-1) >= 16 ? 16 : f.zooms.at(-1), zooms: f.zooms, msg: f.msg, key: f.key }));
  faults.push(...tierLooks(view, theme));
  return faults;
}

// CW08, the part of it that is layer structure rather than width: part-time
// rail dashed and beneath full-service rail; rush-hour buses dashed, a few
// trips dotted, both beneath the streets.
export function tierLooks(view, theme = themeOf(view)) {
  const faults = [];
  const fillL = view.layerById(ROLES.railFill), partL = view.layerById(ROLES.railPart), edgeL = view.layerById(ROLES.railEdge), streetL = view.layerById(ROLES.street);
  const dashOn = (layer, rep, z = 16) => {
    const d = view.get(layer, 'line-dasharray', 'paint', z, rep.props, null);
    return Array.isArray(d) && d.length ? d : null;
  };
  if (partL) {
    const reps = view.reps(partL);
    if (reps.length && reps.some((r) => !dashOn(partL, r))) {
      faults.push(finding(view, reps[0], 'tier-dash', 'CW08', { layer: partL.id, msg: `${theme}: part-time rail (${partL.id}) is not dashed` }));
    }
    for (const above of [fillL, edgeL].filter(Boolean)) {
      if (view.layerById(above.id).index < view.layerById(partL.id).index) {
        faults.push(finding(view, reps[0], 'tier-below', 'CW08', { layer: partL.id, msg: `${theme}: part-time rail is drawn above ${above.id}; on shared track the line that runs must win (beneath full-service rail)` }));
      }
    }
  }
  for (const id of ROLES.busPart) {
    const layer = view.layerById(id);
    if (!layer) continue;
    for (const rep of view.reps(layer)) {
      const tier = rep.props.tier;
      const d = dashOn(layer, rep);
      const width = view.get(layer, 'line-width', 'paint', 16, rep.props, 1);
      const cap = view.get(layer, 'line-cap', 'layout', 16, rep.props, 'butt');
      const dotted = d && d[0] * width <= 0.5 && cap === 'round';
      if (tier === 'limited' && !dotted) faults.push(finding(view, rep, 'tier-dash', 'CW08', { layer: id, msg: `${theme}: few-trip buses (${id}) are not dotted (dash ${JSON.stringify(d)}, cap ${cap})` }));
      if (tier === 'peak' && (!d || d[0] * width < 1)) faults.push(finding(view, rep, 'tier-dash', 'CW08', { layer: id, msg: `${theme}: rush-hour buses (${id}) are not dashed (dash ${JSON.stringify(d)})` }));
    }
    if (streetL && layer.index !== undefined && view.layerById(id).index > view.layerById(streetL.id).index) {
      faults.push(finding(view, view.reps(layer)[0] ?? null, 'tier-below', 'CW08', { layer: id, msg: `${theme}: part-time buses (${id}) are drawn above the streets of buses that run all day` }));
    }
  }
  return faults;
}
