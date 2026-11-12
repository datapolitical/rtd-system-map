// What appears at which zoom, and whether anything jumps between zooms
// (qa/rules/ ZB01 to ZB04, BM03, LV02; literature CZ-03, CZ-04, CZ-05).
//
//  - zoom-row (ZB01 to ZB03): every "from zoom N" in DESIGN.md's table "By
//    zoom level" and the sections it summarises is a row below with the line
//    it comes from. A thing that should be drawn from N must be at its
//    strength by then (`late`) and not before (`early`); one that should be
//    gone by M must be. The finding is `zoom-late`, `zoom-early`, `zoom-stays`
//    `zoom-gap` (drawn, then not again before it should go) or `zoom-missing`
//    (no layer draws it at any zoom). `until` is the zoom it must be gone
//    by; `fadeOut` how long before that it may be fading.
//  - tick-from (ZB04): a mark held back by a filter on `tickFrom` shows at
//    that whole zoom, not before and not a zoom late.
//  - abrupt-width, abrupt-opacity, pop-in (CZ-04): a width, a size or an
//    opacity that changes by more than a fixed share in a tenth of a zoom, or a
//    layer that appears at once. DESIGN.md lets some do it (`DESIGNED`, each
//    with its line); every other one is a finding. Properties that read both
//    the zoom and a feature are blended between whole zooms, as MapLibre
//    does, and so are smooth by construction (expressions.mjs).
//  - offset-jump (CZ-03): a line's sideways offset, in metres of ground,
//    changes by more than half the outermost lane's between two half zooms.
//  - vanishes (CZ-05): a thing drawn at one half zoom and gone at the next,
//    unless DESIGN.md has it replaced.

const STRONG = 0.5; // "drawn": at least this strong
const FAINT = 0.2; // "not drawn": under this

const isTrue = (v) => v === true || v === 1;

// ---------------------------------------------------------------- the rows
//
// layers: [{ id, props? (a stand-in feature for a basemap layer), where? (a
// test on the properties of the build's features) }]. from / until are the
// zooms DESIGN.md names. fade: how long the design lets the arrival take
// ("fading in over about a zoom"); rampFrom: where the arrival may start
// (a crossfade begun before `from`).
export const ZOOM_ROWS = [
  { id: 'rail', design: 'L1718', what: 'rail lines in the overview', layers: [{ id: 'rail' }], from: 0 },
  { id: 'frequent-streets', design: 'L1718', what: 'bus streets with a bus every 15 minutes or better, in the overview', layers: [{ id: 'street', where: (p) => ['c3', 'c5', 'c10', 'c15'].includes(p.cls) }], from: 0 },
  { id: 'end-letters', design: 'L1719', what: "each rail line's letter at its ends, until the letters ride the lines", layers: [{ id: 'line-signs', where: (p) => p.kind === 'end' }], from: 0, until: 9.75 },
  { id: 'city-names', design: 'L1069, L1718, L1721', what: 'city names, gone by 13.5', layers: [{ id: 'city-label', props: { class: 'city', rank: 2 } }], from: 0, until: 13.5, fadeOut: 1 },
  { id: 'interstate-shields', design: 'L1048, L1718', what: 'main Interstate shields from 8.5, fading out 14.5 to 15', layers: [{ id: 'highway-shield', props: { network: 'us-interstate', ref_length: 2, ref: '25' } }], from: 8.5, until: 15, fadeOut: 0.5 },
  { id: 'station-ticks', design: 'L1132, L1719', what: 'station ticks from 9, none below', layers: [{ id: 'stations-dot', where: (p) => p.served === true && !(p.tickFrom > 9) }], from: 9, fade: 0.5, until: 11, fadeOut: 0.75 },
  { id: 'every30-streets', design: 'L1719', what: 'every-16-to-30 streets from 9, fading in', layers: [{ id: 'street', where: (p) => p.cls === 'c30' }], from: 9, fade: 1.5 },
  { id: 'rail-letters', design: 'L1719', what: 'rail letters along the lines from 9.75', layers: [{ id: 'rail-bullets' }], from: 9.75, note: "the letters the page places at run time on lines that have none on screen ('rail-edge-letters', edgeletters.js) are not modelled, so this may be where they stand in" },
  { id: 'end-names', design: 'L1719', what: 'names of the stations where lines end from 9.75', layers: [{ id: 'station-labels', where: (p) => isTrue(p.end) }], from: 9.75 },
  { id: 'hub-ring', design: 'L1132, L1719', what: "the hub's ring from 9.75 to 11", layers: [{ id: 'stations-hub' }], from: 9.75, fade: 0.25, until: 11, fadeOut: 0.75 },
  { id: 'hub-name', design: 'L888-98, L966-70', what: "the hub's name from 9.75, in its own layer until 15", layers: [{ id: 'station-labels-hub' }], from: 9.75, until: 15 },
  { id: 'hub-name-near', design: 'L966-70', what: "from 15 the hub's name stays off rail and the frequent buses (its second layer)", layers: [{ id: 'station-labels-hub-near' }], from: 15 },
  { id: 'slow-streets', design: 'L1719', what: 'streets with a bus every 31 minutes or more from 10.5', layers: [{ id: 'street', where: (p) => p.cls === 'c60' }], from: 10.5, fade: 1.5 },
  { id: 'capsules', design: 'L1132, L1719', what: 'station capsules from 11, crossfading with the tick from 10.25', layers: [{ id: 'stations', where: (p) => p.served === true && !(p.tickFrom > 9) }], from: 11, rampFrom: 10.25 },
  { id: 'every-name', design: 'L898, L1719', what: "every station's name from 11", layers: [{ id: 'station-labels', where: (p) => !isTrue(p.end) }], from: 11 },
  { id: 'town-names', design: 'L1069, L1719', what: 'town names from 11, gone by 14.5', layers: [{ id: 'town-label', props: { class: 'town', rank: 5 } }], from: 11, until: 14.5, fadeOut: 1 },
  { id: 'village-names', design: 'L907', what: 'village names, with the towns, from 11', layers: [{ id: 'village-label', props: { class: 'village' } }], from: 11, until: 14.5, fadeOut: 1 },
  { id: 'flexride', design: 'L910, L1719', what: 'FlexRide zones from 11', layers: [{ id: 'flexride-fill' }, { id: 'flexride-line' }], from: 11, fade: 1 },
  { id: 'spur-shields', design: 'L912, L1719', what: 'Interstate spur shields from 11, fading out 14.5 to 15', layers: [{ id: 'highway-shield', props: { network: 'us-interstate', ref_length: 3, ref: '270' } }], from: 11, until: 15, fadeOut: 0.5 },
  { id: 'us-shields', design: 'L1048, L1719', what: 'US highway shields from 11, gone by 13.5', layers: [{ id: 'highway-shield-us', props: { network: 'us-highway', ref_length: 2, ref: '40' } }], from: 11, until: 13.5, fadeOut: 0.5 },
  { id: 'part-time-buses', design: 'L1719', what: 'part-time buses from 11', layers: [{ id: 'bus-part-time', where: (p) => p.tier === 'peak' }, { id: 'bus-limited' }], from: 11, fade: 1 },
  { id: 'main-street-names', design: 'L1042, L1720', what: 'main street names from 12', layers: [{ id: 'road-label', props: { class: 'primary' } }], from: 12 },
  { id: 'neighbourhood-names', design: 'L1063, L1720', what: 'neighbourhood names from 12', layers: [{ id: 'neighborhood-label', props: { class: 'suburb' } }], from: 12 },
  { id: 'park-n-ride', design: 'L1720', what: 'Park-n-Rides and transit centers from 12.5', layers: [{ id: 'facilities' }], from: 12.5 },
  { id: 'closed-ring', design: 'L1133-34, L1721', what: 'closed stations: ring from 13', layers: [{ id: 'stations-unserved' }], from: 13 },
  { id: 'closed-name', design: 'L1133-34, L1721', what: 'closed stations: name with the ring from 13', layers: [{ id: 'station-labels-unserved' }], from: 13 },
  { id: 'landmarks', design: 'L1081, L1721', what: 'landmark names from 14', layers: [{ id: 'landmark-label', props: { class: 'hospital', subclass: 'hospital' } }], from: 14 },
  { id: 'small-street-names', design: 'L1722', what: 'smaller street names from 14.5', layers: [{ id: 'road-label-minor', props: { class: 'minor' } }], from: 14.5 },
  { id: 'bus-stops', design: 'L1722', what: 'bus stops drawn from 15', layers: [{ id: 'stops' }], from: 15 },
  { id: 'stop-gates', design: 'L1628', what: 'the gates of a bus hall from 17', layers: [{ id: 'stops-gate' }], from: 17 },
  { id: 'stop-names', design: 'L1723', what: 'stop names, with the routes that serve each stop, from 16', layers: [], from: 16, named: 'stop names' },
];

// ---------------------------------------------------------------- strength

// How strongly a layer shows a feature of this kind at a zoom: its opacity,
// or 0 when the layer, its filter or its size says it is not there.
export function strength(view, spec, z) {
  const layer = view.layerById(spec.id);
  if (!layer || !view.draws(layer)) return 0;
  let best = 0;
  const reps = spec.props ? [{ props: { $type: 2, ...spec.props } }] : view.reps(layer).filter((r) => !spec.where || spec.where(r.props));
  for (const rep of reps) {
    if (view.widthOf(layer, rep, z) <= 0) continue;
    best = Math.max(best, view.opacity(layer, rep, z));
    if (best >= 1) break;
  }
  return best;
}
const rowStrength = (view, row, z) => Math.max(0, ...row.layers.map((l) => strength(view, l, z)));

const frange = (a, b, step) => { const out = []; for (let z = a; z <= b + 1e-9; z += step) out.push(Math.round(z * 1000) / 1000); return out; };

/**
 * ZB01 to ZB03: the zoom rows against the style.
 * @param {object} view styleView
 * @param {{rows?: Array, theme?: string}} opts
 */
export function zoomRowFaults(view, { rows = ZOOM_ROWS } = {}) {
  const faults = [];
  const out = (row, kind, extra) => faults.push({ kind, rule: row.rule ?? 'ZB', row: row.id, layer: row.layers.map((l) => l.id).join('+') || null, route: null, ...extra, msg: row.note ? `${extra.msg} (${row.note})` : extra.msg });
  for (const row of rows) {
    if (!row.layers.length) {
      out(row, 'zoom-missing', { zoom: row.from, msg: `DESIGN.md ${row.design} says ${row.what}; no layer in the style draws it at any zoom` });
      continue;
    }
    // A row whose layers have nothing to draw in this build (no FlexRide zone,
    // no closed station) is not judged.
    const anyData = row.layers.some((l) => l.props || (view.layerById(l.id) && view.reps(view.layerById(l.id)).some((r) => !l.where || l.where(r.props))));
    if (!anyData) continue;
    const fade = row.fade ?? 0;
    const after = row.from + fade;
    const have = rowStrength(view, row, after);
    if (row.from > 0 && have < STRONG) {
      out(row, 'zoom-late', { zoom: after, msg: `DESIGN.md ${row.design}: ${row.what}; at zoom ${after} it is drawn at ${have.toFixed(2)} (wanted ${STRONG} by then)`, strength: have });
    }
    if (row.from === 0) {
      const z0 = 8.5;
      const s0 = rowStrength(view, row, z0);
      if (s0 < STRONG) out(row, 'zoom-late', { zoom: z0, msg: `DESIGN.md ${row.design}: ${row.what}; at zoom ${z0} it is drawn at ${s0.toFixed(2)}`, strength: s0 });
    }
    // And not gone again before it is meant to be.
    const last = row.until !== undefined ? row.until - (row.fadeOut ?? 0) - 0.05 : 18;
    if (row.from > 0 && have >= STRONG) {
      const gap = frange(after, last, 0.05).find((z) => rowStrength(view, row, z) < FAINT);
      if (gap !== undefined) out(row, 'zoom-gap', { zoom: gap, msg: `DESIGN.md ${row.design}: ${row.what}; it is drawn at ${after} but not at ${gap}` });
    }
    // Not before: nothing earlier than the ramp's start.
    const ramp = row.rampFrom ?? (fade > 0 ? row.from - 0.5 : row.from);
    if (row.from > 0) {
      const early = frange(5, ramp - 0.05, 0.05).find((z) => rowStrength(view, row, z) >= FAINT);
      if (early !== undefined) out(row, 'zoom-early', { zoom: early, msg: `DESIGN.md ${row.design}: ${row.what}; it is already drawn at ${rowStrength(view, row, early).toFixed(2)} at zoom ${early}` });
    }
    if (row.until !== undefined) {
      const stays = frange(row.until + 0.05, 20, 0.05).find((z) => rowStrength(view, row, z) >= FAINT);
      if (stays !== undefined) out(row, 'zoom-stays', { zoom: stays, msg: `DESIGN.md ${row.design}: ${row.what}; at zoom ${stays} it is still drawn at ${rowStrength(view, row, stays).toFixed(2)}` });
    }
  }
  return faults;
}

// ---------------------------------------------------------------- ZB04

/**
 * A mark held back by a filter on `tickFrom` shows at that zoom (ZB04, L1232).
 * A `tickFrom` that is not a whole zoom is read by the filter as the next whole
 * one, so the mark comes a zoom late.
 */
export function tickFromFaults(view) {
  const faults = [];
  for (const layer of view.layers) {
    if (!view.draws(layer) || !JSON.stringify(layer.filter ?? '').includes('"tickFrom"')) continue;
    const seen = new Set();
    for (const rep of view.reps(layer)) {
      const t = rep.props.tickFrom;
      if (typeof t !== 'number' || t <= 0 || seen.has(t)) continue;
      seen.add(t);
      const at = view.opacity(layer, rep, t), before = view.opacity(layer, rep, t - 0.05);
      if (!Number.isInteger(t) && view.opacity(layer, rep, Math.ceil(t)) >= STRONG && at < STRONG) {
        faults.push({ kind: 'tick-from', rule: 'ZB04', layer: layer.id, route: null, zoom: t, rep, msg: `${layer.id}: a mark due at zoom ${t} is filtered by the whole zoom and shows from ${Math.ceil(t)}` });
      } else if (Number.isInteger(t) && at < STRONG) {
        faults.push({ kind: 'tick-from', rule: 'ZB04', layer: layer.id, route: null, zoom: t, rep, msg: `${layer.id}: a mark due at zoom ${t} is drawn at ${at.toFixed(2)} at that zoom` });
      } else if (before >= FAINT) {
        faults.push({ kind: 'tick-from', rule: 'ZB04', layer: layer.id, route: null, zoom: t - 0.05, rep, msg: `${layer.id}: a mark due at zoom ${t} is already drawn at ${before.toFixed(2)} just before it` });
      }
    }
  }
  return faults;
}

// ---------------------------------------------------------------- jumps

export const JUMP = {
  step: 0.1, // the zoom step the style is read at
  width: 0.25, // a width or size changing by more than this share in one step
  opacity: 0.35, // an opacity changing by more than this in one step
  from: 9, to: 18,
  lane: 0.5, // an offset (metres) changing by more than this share of the outermost lane in a half zoom
};

// Changes the design makes abruptly or appears at once, each with its line.
// `layer` is a regular expression on the layer id; `kind` the finding it
// excuses.
export const DESIGNED = [
  { layer: /^rail-bullets$/, kind: /^(pop-in|abrupt-opacity|vanishes)$/, why: 'L903-06: one set of letters per whole zoom, each spaced along its line (the build places them, `from` to `to`)' },
  { layer: /^street-strand-|^street-part-time-beside$|^street-core$/, kind: /^(pop-in|abrupt-opacity)$/, why: 'L1526-37: a seam is drawn only where each strand would be at least 2.6 px wide; until the strands have room a part-time route rides beside the street' },
  { layer: /^street$/, kind: /^abrupt-opacity$/, why: 'L1714: a street class fades in by tier (over about a zoom)', only: (f) => f.step > 0.4 },
];

const metresPerPx = (lat, z) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);

/**
 * CZ-04, CZ-03: a width, size or opacity that jumps, a layer that pops on, an
 * offset (in metres) that jumps; and CZ-05, a thing that vanishes.
 * @param {{imageSize?: (name: string) => {width: number, height: number}}} opts
 */
export function jumpFaults(view, { limits = {}, imageSize = null, designed = DESIGNED, rows = ZOOM_ROWS } = {}) {
  const J = { ...JUMP, ...limits };
  const faults = [];
  const zs = frange(J.from, J.to, J.step);
  const excused = (layerId, kind, f) => designed.find((d) => d.layer.test(layerId) && d.kind.test(kind) && (!d.only || d.only(f)));
  // A row of DESIGN.md that has this layer arrive (or leave) within a
  // little of zoom z.
  const rowFor = (layerId, z, edge) => rows.find((r) => r.layers.some((l) => l.id === layerId) && (edge === 'in'
    ? z >= (r.rampFrom ?? r.from) - 0.25 && z <= r.from + (r.fade ?? 0) + 0.25
    : r.until !== undefined && z >= r.until - (r.fadeOut ?? 0) - 0.5 && z <= r.until + 0.5));
  const edgeNear = (layerId, z) => rowFor(layerId, z, 'in') || rowFor(layerId, z, 'out');
  // A layer whose filter reads tickFrom shows a mark at its own whole zoom (ZB04, L1225-34).
  const byTick = (layer) => JSON.stringify(layer.filter ?? '').includes('"tickFrom"');

  for (const layer of view.layers) {
    if (!view.draws(layer) || !view.data[layer.source]) continue;
    // Group the representatives by how they look over the whole range, so a
    // thousand streets of one class are one curve.
    const looks = new Map();
    for (const rep of view.reps(layer)) {
      const curve = zs.map((z) => [view.opacity(layer, rep, z), view.widthOf(layer, rep, z), imageWidth(view, layer, rep, z, imageSize)]);
      const key = JSON.stringify(curve.map((c) => c.map((v) => Math.round(v * 1000) / 1000)));
      if (!looks.has(key)) looks.set(key, { rep, curve, n: 0 });
      looks.get(key).n++;
    }
    for (const { rep, curve } of looks.values()) {
      const what = rep.props.cls ?? rep.props.tier ?? rep.props.route ?? '';
      for (let i = 1; i < zs.length; i++) {
        const [o0, w0, s0] = curve[i - 1], [o1, w1, s1] = curve[i];
        const z = zs[i];
        // Appearing: from nothing to something in one step.
        if (o0 < 0.05 && o1 >= STRONG && !rowFor(layer.id, z, 'in') && !byTick(layer) && rep.props.zoom !== 'near') {
          const f = { layer: layer.id, step: o1 - o0 };
          if (!excused(layer.id, 'pop-in', f)) faults.push({ kind: 'pop-in', rule: 'CZ-04', layer: layer.id, route: null, zoom: z, rep, msg: `${layer.id}${what ? ` (${what})` : ''} appears at once at zoom ${z.toFixed(2)}: opacity ${o0.toFixed(2)} to ${o1.toFixed(2)} in a tenth of a zoom, and DESIGN.md has no row for it` });
        } else if (o0 >= 0.05 && Math.abs(o1 - o0) > J.opacity) {
          const f = { layer: layer.id, step: Math.abs(o1 - o0) };
          if (!edgeNear(layer.id, z) && rep.props.zoom == null && !excused(layer.id, 'abrupt-opacity', f)) faults.push({ kind: 'abrupt-opacity', rule: 'CZ-04', layer: layer.id, route: null, zoom: z, rep, msg: `${layer.id}${what ? ` (${what})` : ''} changes opacity ${o0.toFixed(2)} to ${o1.toFixed(2)} in a tenth of a zoom at ${z.toFixed(2)}` });
        }
        // Size: only while it is drawn on both sides.
        if (o0 >= STRONG && o1 >= STRONG) {
          const grew = w0 > 0 && Math.abs(w1 - w0) / w0 > J.width;
          if (grew) faults.push({ kind: 'abrupt-width', rule: 'CZ-04', layer: layer.id, route: null, zoom: z, rep, msg: `${layer.id}${what ? ` (${what})` : ''} changes size ${w0.toFixed(2)} to ${w1.toFixed(2)} in a tenth of a zoom at ${z.toFixed(2)}` });
          else if (s0 > 0 && s1 > 0 && Math.abs(s1 - s0) / s0 > J.width) faults.push({ kind: 'abrupt-width', rule: 'CZ-04', layer: layer.id, route: null, zoom: z, rep, msg: `${layer.id}${what ? ` (${what})` : ''} mark changes size ${s0.toFixed(1)} to ${s1.toFixed(1)} px in a tenth of a zoom at ${z.toFixed(2)}` });
        }
      }
      // CZ-05: drawn at one half zoom, gone at the next.
      const at = (z) => curve[Math.round((z - J.from) / J.step)];
      for (let z = J.from; z + 0.5 <= J.to + 1e-9; z += 0.5) {
        const a = at(Math.round(z * 10) / 10), b = at(Math.round((z + 0.5) * 10) / 10);
        if (!a || !b) continue;
        if (a[0] >= STRONG && b[0] < 0.1 && !rowFor(layer.id, z + 0.25, 'out') && rep.props.zoom !== 'far' && !excused(layer.id, 'vanishes', {})) {
          faults.push({ kind: 'vanishes', rule: 'CZ-05', layer: layer.id, route: null, zoom: z + 0.5, rep, msg: `${layer.id}${what ? ` (${what})` : ''} is drawn at zoom ${z} and gone at ${z + 0.5}, and DESIGN.md has no row that removes it` });
        }
      }
    }
  }
  return dedupe(faults);
}

function imageWidth(view, layer, rep, z, imageSize) {
  if (!imageSize || layer.type !== 'symbol' || layer.layout?.['icon-image'] === undefined) return 0;
  const image = view.get(layer, 'icon-image', 'layout', z, rep.props, null);
  const name = image?.name ?? (typeof image === 'string' ? image : null);
  if (!name) return 0;
  let size;
  try { size = imageSize(name); } catch { return 0; }
  const scale = view.get(layer, 'icon-size', 'layout', z, rep.props, 1);
  return Math.max(size.width, size.height) * scale;
}

// One finding per (kind, layer, what): the zooms it was seen at.
function dedupe(faults) {
  const out = new Map();
  for (const f of faults) {
    const k = `${f.kind}|${f.layer}|${f.rep?.props?.cls ?? f.rep?.props?.tier ?? f.rep?.props?.route ?? ''}`;
    const had = out.get(k);
    if (!had) out.set(k, { ...f, zooms: [f.zoom] });
    else had.zooms.push(f.zoom);
  }
  return [...out.values()].map((f) => {
    const zs = [...new Set(f.zooms.map((z) => Math.round(z * 100) / 100))].sort((a, b) => a - b);
    return { ...f, zooms: zs, msg: zs.length > 1 ? `${f.msg} (and ${zs.length - 1} more steps, ${zs[0]} to ${zs.at(-1)})` : f.msg };
  });
}

/**
 * CZ-03: a line's sideways offset in metres between two half zooms.
 * @param {number} lat the latitude to turn pixels to metres at
 */
export function offsetFaults(view, { lat = 39.74, limits = {} } = {}) {
  const J = { ...JUMP, ...limits };
  const faults = [];
  for (const layer of view.layers) {
    if (layer.type !== 'line' || layer.paint?.['line-offset'] === undefined || !view.data[layer.source] || !view.draws(layer)) continue;
    const reps = view.reps(layer);
    for (let z = J.from; z + 0.5 <= J.to + 1e-9; z += 0.5) {
      const metres = (zz, rep) => view.get(layer, 'line-offset', 'paint', zz, rep.props, 0) * metresPerPx(lat, zz);
      const lane = Math.max(0, ...reps.map((r) => Math.abs(metres(z, r))));
      if (!lane) continue;
      for (const rep of reps) {
        const a = metres(z, rep), b = metres(z + 0.5, rep);
        if (Math.abs(b - a) > J.lane * lane) {
          faults.push({ kind: 'offset-jump', rule: 'CZ-03', layer: layer.id, route: rep.props.route ?? null, zoom: z + 0.5, rep, msg: `${layer.id}: a line ${rep.props.route ?? ''} moves ${Math.abs(b - a).toFixed(1)} m sideways between zoom ${z} and ${z + 0.5} (outermost lane ${lane.toFixed(1)} m)` });
          break;
        }
      }
    }
  }
  return dedupe(faults);
}
