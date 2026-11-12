// Rules that are about the style's structure rather than a colour or a width
// (qa/rules/design-invariants.md CW07, CW11, BM02, BM03, BM04, LV01, LV02):
// which layer is drawn above which, what FlexRide is made of, what the basemap
// is and is not, and where the Live vehicles start. Each reads the style JSON
// the page builds and, where a layer's look depends on a feature, the build's
// features (stylekit.mjs).

import { hueGap, oklch, parse } from './colours.mjs';
import { ROLES, colourOutputs, finding, themeOf } from './styles.mjs';

const GREEN_CHROMA = 0.04; // (suggested) a colour this tinted has a hue

const basemapLayer = (view, l) => view.style.sources?.[l.source]?.type === 'vector';
const busLine = (view, l) => l.type === 'line' && view.data[l.source] && view.reps(l).length && view.reps(l).every((r) => r.props.mode === 'bus');
const railLine = (view, l) => l.type === 'line' && view.data[l.source] && view.reps(l).length && view.reps(l).every((r) => r.props.mode === 'rail');

/**
 * CW07: draw order is the hierarchy (DESIGN.md L1019-33, L1653-57). Checked as
 * pairs: rail above every bus line, with its casing under its outline under
 * its fill; the streets above the part-time lines; the part-time lines above
 * FlexRide; FlexRide above the basemap; station and stop marks above the rail;
 * Live's vehicles above the marks. (DESIGN.md's list puts stations third, under
 * the bus streets; a mark under a line it names would be hidden, so the style
 * draws marks on top, and this does not hold the list's order to the letter.)
 */
export function layerOrderFaults(view) {
  const faults = [];
  const theme = themeOf(view);
  const idx = (l) => view.layerById(l.id).index;
  const L = view.layers.filter((l) => view.draws(l));
  const groups = {
    basemap: L.filter((l) => basemapLayer(view, l) && l.type !== 'symbol'),
    flex: L.filter((l) => l.source === 'flexride'),
    partTime: ROLES.busPart.map((id) => view.layerById(id)).filter(Boolean),
    streets: L.filter((l) => busLine(view, l) && !ROLES.busPart.includes(l.id)),
    rail: L.filter((l) => railLine(view, l)),
    marks: L.filter((l) => (l.type === 'circle' || (l.type === 'symbol' && l.layout?.['icon-image'] !== undefined)) && view.data[l.source] && ['stations', 'platforms', 'facilities', 'stops'].includes(l.source)),
    vehicles: ROLES.vehicles.map((id) => view.layerById(id)).filter(Boolean),
  };
  const above = [['rail', 'streets'], ['rail', 'partTime'], ['streets', 'partTime'], ['partTime', 'flex'], ['flex', 'basemap'], ['streets', 'flex'], ['marks', 'rail'], ['vehicles', 'marks']];
  for (const [hi, lo] of above) {
    for (const a of groups[hi]) for (const b of groups[lo]) {
      if (idx(a) < idx(b)) {
        faults.push(finding(view, view.reps(a)[0] ?? view.reps(b)[0] ?? null, 'layer-order', 'CW07', { layer: a.id, msg: `${theme}: ${a.id} (${hi}) is drawn under ${b.id} (${lo}); the hierarchy wants ${hi} above ${lo}` }));
      }
    }
  }
  // Rail: casing, then outline, then fill, each its own layer.
  const casing = view.layerById(ROLES.railCasing), edge = view.layerById(ROLES.railEdge), fill = view.layerById(ROLES.railFill);
  if (fill) {
    if (!casing) faults.push(finding(view, view.reps(fill)[0], 'layer-order', 'CW07', { layer: ROLES.railFill, msg: `${theme}: rail has no casing layer (${ROLES.railCasing}); rail floats on a casing so a bus never touches its colour` }));
    else {
      if (edge && idx(casing) > idx(edge)) faults.push(finding(view, view.reps(fill)[0], 'layer-order', 'CW07', { layer: casing.id, msg: `${theme}: the rail casing is drawn over the rail outline` }));
      if (idx(casing) > idx(fill)) faults.push(finding(view, view.reps(fill)[0], 'layer-order', 'CW07', { layer: casing.id, msg: `${theme}: the rail casing is drawn over the rail fill` }));
      // The casing must stand out of the line it frames, at every zoom.
      const rep = view.reps(fill)[0];
      for (const z of [9, 11, 13, 16]) {
        const wc = view.get(casing, 'line-width', 'paint', z, rep.props, 0), wf = view.get(edge ?? fill, 'line-width', 'paint', z, rep.props, 0);
        if (wc - wf < 1) faults.push(finding(view, rep, 'layer-order', 'CW07', { layer: casing.id, zoom: z, msg: `${theme}: the rail casing is ${(wc - wf).toFixed(2)} px wider than the line at zoom ${z}; it must frame it (1 px or more)` }));
      }
    }
  }
  return faults;
}

/**
 * CW11: FlexRide is a light diagonal hatch with a dashed edge, never green
 * (DESIGN.md L1884-85). `icon(name)` is iconpix.mjs; without it the hatch's
 * colour is not judged.
 */
export function flexFaults(view, { icon = null } = {}) {
  const faults = [];
  const theme = themeOf(view);
  const fill = view.layerById(ROLES.flexFill), line = view.layerById(ROLES.flexLine);
  if (!fill || !view.reps(fill).length) return faults;
  const rep = view.reps(fill)[0];
  const pattern = view.get(fill, 'fill-pattern', 'paint', 13, rep.props, null);
  const name = pattern?.name ?? (typeof pattern === 'string' ? pattern : null);
  if (!name) faults.push(finding(view, rep, 'flex-look', 'CW11', { layer: fill.id, msg: `${theme}: FlexRide is not filled with a pattern (a hatch)` }));
  else if (!/hatch/i.test(name)) faults.push(finding(view, rep, 'flex-look', 'CW11', { layer: fill.id, msg: `${theme}: FlexRide is filled with "${name}", not a hatch` }));
  const dash = line ? view.get(line, 'line-dasharray', 'paint', 13, rep.props, null) : null;
  if (!Array.isArray(dash) || !dash.length) faults.push(finding(view, rep, 'flex-look', 'CW11', { layer: line?.id ?? fill.id, msg: `${theme}: FlexRide's edge is not dashed` }));
  const colours = [];
  if (line) for (const s of colourOutputs(line.paint?.['line-color'])) colours.push(['edge', parse(s)]);
  if (name && icon) {
    const px = icon(name);
    if (px?.ink) colours.push(['hatch', px.ink]);
  }
  for (const [what, c] of colours) {
    if (!c) continue;
    const lch = oklch(c);
    if (lch.C >= GREEN_CHROMA && hueGap(lch.h, 140) <= 40) {
      faults.push(finding(view, rep, 'flex-look', 'CW11', { layer: fill.id, msg: `${theme}: FlexRide's ${what} is green (hue ${Math.round(lch.h)}, chroma ${lch.C.toFixed(2)}); DESIGN.md says never green, which reads as a park` }));
    }
  }
  return faults;
}

/**
 * BM02, BM03, BM04: the basemap (DESIGN.md L1035-40, L1048-62, L1084-89,
 * L1032-34, L1886-88).
 */
export function basemapFaults(view) {
  const faults = [];
  const theme = themeOf(view);
  const base = view.layers.filter((l) => basemapLayer(view, l));
  const anchor = view.reps(view.layerById(ROLES.railFill) ?? { id: '-', source: '-' })[0] ?? null;

  // BM02: the same inside the district and out; nothing masks it.
  for (const l of view.layers) {
    const text = JSON.stringify([l.filter, l.paint, l.layout]);
    if (/\b(within|distance)\b/.test(text) && basemapLayer(view, l)) {
      faults.push(finding(view, anchor, 'basemap-mask', 'BM02', { layer: l.id, msg: `${theme}: basemap layer ${l.id} reads a geographic test (within or distance); the basemap must be the same inside RTD's district and out` }));
    }
    if (/boundary|district|mask/i.test(l.id) || /boundary|district|mask/i.test(l.source ?? '')) {
      faults.push(finding(view, anchor, 'basemap-mask', 'BM02', { layer: l.id, msg: `${theme}: layer ${l.id} (source ${l.source}) looks like a district mask; nothing is drawn outside the district` }));
    }
  }

  // BM04: no basemap railways, no POI icons, no road colours.
  for (const l of base) {
    const image = l.layout?.['icon-image'];
    const shield = image !== undefined && /shield/.test(JSON.stringify(image));
    if (image !== undefined && !shield) {
      faults.push(finding(view, anchor, 'basemap-extra', 'BM04', { layer: l.id, msg: `${theme}: basemap layer ${l.id} draws an icon (${JSON.stringify(image).slice(0, 60)}); DESIGN.md drops POI icons, only the highway shields are pictures` }));
    }
    if (l.type === 'line' && /"(rail|transit|railway)"/.test(JSON.stringify(l.filter ?? ''))) {
      faults.push(finding(view, anchor, 'basemap-extra', 'BM04', { layer: l.id, msg: `${theme}: basemap layer ${l.id} draws railways; DESIGN.md drops them (they look like RTD's lines)` }));
    }
    if (l.type === 'line' && /^road/.test(l.id)) {
      for (const s of [...colourOutputs(l.paint?.['line-color'])]) {
        const c = parse(s);
        if (c && oklch(c).C > 0.03) faults.push(finding(view, anchor, 'basemap-extra', 'BM04', { layer: l.id, msg: `${theme}: road layer ${l.id} is coloured ${s} (chroma ${oklch(c).C.toFixed(2)}); DESIGN.md drops road colours` }));
      }
    }
  }

  // BM03: highway shields. The main Interstates (one or two digits) from 8.5,
  // spurs and US routes from 11, state routes and long refs never.
  const shields = view.layers.filter((l) => basemapLayer(view, l) && l.layout?.['icon-image'] !== undefined && /shield/.test(JSON.stringify(l.layout['icon-image'])));
  const draws = (props, z) => shields.some((l) => z >= (l.minzoom ?? -Infinity) && z < (l.maxzoom ?? Infinity) && view.opacity(l, { props: { $type: 2, ...props } }, z) >= 0.2);
  const never = [
    { props: { network: 'us-state', ref: '83', ref_length: 2 }, what: 'a state highway number' },
    { props: { network: 'us-interstate', ref: '2540', ref_length: 4 }, what: 'a four-character Interstate ref' },
    { props: { network: 'us-highway', ref: '2540', ref_length: 4 }, what: 'a four-character US ref' },
    { props: { network: 'us-state', ref: '7', ref_length: 1 }, what: 'a one-digit state highway number' },
  ];
  for (const n of never) {
    for (let z = 6; z <= 20; z += 0.5) {
      if (draws({ ref: 'x', ...n.props }, z)) {
        faults.push(finding(view, anchor, 'shield-zoom', 'BM03', { zoom: z, msg: `${theme}: ${n.what} is drawn at zoom ${z}; DESIGN.md draws no state highway numbers and none longer than three characters` }));
        break;
      }
    }
  }
  const ladder = [
    { props: { network: 'us-interstate', ref: '25', ref_length: 2 }, what: 'a main Interstate shield', from: 8.5 },
    { props: { network: 'us-interstate', ref: '270', ref_length: 3 }, what: 'an Interstate spur shield', from: 11 },
    { props: { network: 'us-highway', ref: '40', ref_length: 2 }, what: 'a US highway shield', from: 11 },
  ];
  for (const n of ladder) {
    for (let z = 6; z < n.from; z += 0.5) {
      if (draws({ ref: 'x', ...n.props }, z)) {
        faults.push(finding(view, anchor, 'shield-zoom', 'BM03', { zoom: z, msg: `${theme}: ${n.what} is drawn at zoom ${z}; DESIGN.md starts it at ${n.from}` }));
        break;
      }
    }
  }
  return faults;
}

/**
 * LV01, LV02: Live's vehicles (DESIGN.md L357-75, L1859-65). Trains from 9.75,
 * buses from 13 and their numbers from 14.5; a train more than 200 m off its
 * track at 45%.
 */
export function liveFaults(view) {
  const faults = [];
  const theme = themeOf(view);
  const rail = view.layerById('vehicles-rail'), bus = view.layerById('vehicles-bus');
  const anchor = view.reps(view.layerById(ROLES.railFill) ?? { id: '-', source: '-' })[0] ?? null;
  if (rail) {
    if ((rail.minzoom ?? 0) !== 9.75) faults.push(finding(view, anchor, 'vehicle-zoom', 'LV02', { layer: rail.id, msg: `${theme}: trains are drawn from zoom ${rail.minzoom ?? 0}; DESIGN.md starts them at 9.75` }));
    const on = view.get(rail, 'icon-opacity', 'paint', 12, { mode: 'rail', route: 'A', off: false }, 1);
    const off = view.get(rail, 'icon-opacity', 'paint', 12, { mode: 'rail', route: 'A', off: true }, 1);
    if (Math.abs(on - 1) > 0.01) faults.push(finding(view, anchor, 'off-track', 'LV01', { layer: rail.id, msg: `${theme}: a train on its track is drawn at ${on}, not full strength` }));
    if (Math.abs(off - 0.45) > 0.02) faults.push(finding(view, anchor, 'off-track', 'LV01', { layer: rail.id, msg: `${theme}: a train more than 200 m off its track is drawn at ${off}; DESIGN.md says 45%` }));
  }
  if (bus) {
    if ((bus.minzoom ?? 0) !== 13) faults.push(finding(view, anchor, 'vehicle-zoom', 'LV02', { layer: bus.id, msg: `${theme}: buses are drawn from zoom ${bus.minzoom ?? 0}; DESIGN.md starts them at 13` }));
    const number = (z) => view.get(bus, 'text-field', 'layout', z, { mode: 'bus', route: '15' }, '');
    const shown = (z) => { const v = number(z); return String(v?.toString?.() ?? v ?? '') !== ''; };
    if (shown(14.4) || !shown(14.5)) faults.push(finding(view, anchor, 'vehicle-zoom', 'LV02', { layer: bus.id, msg: `${theme}: bus route numbers ${shown(14.4) ? 'show before' : 'do not show at'} zoom 14.5; DESIGN.md starts them at 14.5` }));
  }
  return faults;
}
