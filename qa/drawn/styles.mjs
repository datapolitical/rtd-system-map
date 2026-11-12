// Rules of style, measured on the page's own style (qa/rules/design-invariants.md
// sections 12 to 16; qa/rules/literature.md sections 6, 8 and 9).
//
// The geometry detectors in this folder ask where things are. These ask what
// they look like: colour against what lies under it, width and weight by
// class, which layer is drawn above which, what appears at which zoom, whether
// anything jumps between half zooms, and whether the Key says what the map
// draws. They read the style JSON the page builds and the build's GeoJSON
// (stylekit.mjs), never a screenshot, in one theme at a time.
//
// Wiring (qa/checks/run.mjs, after the zoom loop; one call per theme):
//
//   import { styleFindings } from '../drawn/styles.mjs';
//   for (const f of await styleFindings(model, { meta })) findings.push({ theme, check: 'style', kind: f.kind, layer: f.layer, route: f.route ?? null, zoom: f.zoom, lat: f.lat, lon: f.lon, msg: f.msg, link: linkTo(site, f.zoom, f.lat, f.lon), where: 'district' });
//
// and `...STYLE_SEVERITY` into run.mjs's SEVERITY. A finding is
// { kind, rule, layer, route, zoom, lat, lon, msg, ... }: the place is a point
// on the thing the finding is about (the first vertex of a line, a mark's
// point), because a style fault has no place of its own.
//
// What each kind is, by the rule it holds (thresholds are tagged (source),
// (design) for a number DESIGN.md gives, or (suggested)):
//
//   CW01  bus-hue          a bus colour tinted within 30 deg of a rail colour; bus-inks: more than one bus hue
//   CW02  line-contrast    a rail line or bus class under 3:1 against land, water, park, wood, building or road
//   CW03  letter-contrast  a rail letter under 4.5:1 against its bullet
//   CW04  dark-lift        a dark-theme rail colour under 4:1 against the land
//   CW05  text-contrast    map text under 4.5:1 against what it sits on (halo, land, road, water, park, shield)
//   CW06  tier-order       a bus class weaker than the one below it; tier-number: DESIGN.md's ratios missing;
//                          bus-brighter-than-rail (dark)
//   CW07  layer-order      a layer drawn on the wrong side of another (rail under a bus, casing missing, ...)
//   CW08  tier-look        tier looks broken: width order, dashes, dots, part-time above full service
//   CW09  none-heavy       a line not running at the time shown drawn heavier than a line that runs
//   CW11  flex-look        FlexRide not a hatch with a dashed edge, or green
//   KD-01 rail-lighter     a bus reads heavier (width x contrast) than a rail line; rail-lighter-design where
//                          DESIGN.md allows it (the busiest streets close in, L1024)
//   KD-04 class-spread     one class, more than one width; class-close: classes under 1.6 px apart
//   KD-05 grey-confusable  two classes apart by neither 1.6 px nor 3:1 in lightness
//   KD-06 many-classes     more than 4 bus width classes drawn at once
//   KD-07 kinds-alike      rail and bus differ in fewer than two visual variables
//   BG-01 base-loud        a basemap class contrasts more with the land than a transit class does
//   --    rail-pair        two rail lines that share track too close in colour, or in greyscale
//   CW05+ mark-contrast    a station or stop mark under 3:1 against what it sits on
//   BM03  shield-zoom      highway shields at a zoom DESIGN.md does not allow; BM04 basemap-icons;
//   BM02  basemap-mask     a basemap layer drawn only inside the district
//   LV01  off-track        a train off its track not drawn at 45%; LV02 vehicle-zoom
//
// Zoom rows and the change between half zooms are in zooms.mjs; the Key is in
// keys.mjs; the rail-beside-bus gap is in sideby.mjs.

import { contrast, deltaE, grey, hex, hueGap, luminance, oklch, over, parse } from './colours.mjs';
import { placeOf, styleView } from './stylekit.mjs';

// The style's own layer ids the detectors lean on. A page that renames one
// changes it here; nothing else in this file names a layer.
export const ROLES = {
  land: 'land',
  railFill: 'rail', railEdge: 'rail-edge', railCasing: 'rail-casing', railPart: 'rail-part-time',
  street: 'street', busPart: ['bus-part-time', 'bus-limited'],
  flexFill: 'flexride-fill', flexLine: 'flexride-line',
  grounds: { water: 'water', park: 'park', wood: 'wood', building: 'building', road: 'road-street' },
  roadEdges: ['road-street-edge', 'road-motorway-edge'],
  bullets: 'rail-bullets',
  vehicles: ['vehicles-rail', 'vehicles-bus'],
};

export const LIMITS = {
  lineContrast: 3, // (source) WCAG 1.4.11 graphics; DESIGN.md "essential lines 3:1"
  darkRailContrast: 4, // (design) DESIGN.md "Dark mode": lifted to 4:1
  textContrast: 4.5, // (source) WCAG 1.4.3; DESIGN.md "Text meets 4.5:1"
  letterContrast: 4.5,
  markContrast: 3, // contrast.spec.mjs
  busRoadContrast: 2.5, // buses.spec.mjs
  busFrequentRoadContrast: 6, // buses.spec.mjs
  inkChroma: 0.05, // (suggested) OKLCH chroma under which a colour reads as a neutral ink
  hueApart: 30, // (suggested) DESIGN.md puts the dark bus hue 38 and 39 degrees from its neighbours
  hueSpread: 15, // (suggested) "one ink"
  classApart: 1.6, // (source) Ledermann 2022 Table 8.1, 0.2 mm
  classSpread: 0.25, // (suggested)
  greyRatio: 3, // (source) literature KD-05, the project's figure for essential lines
  busClasses: 4, // (suggested) literature KD-06
  pairDeltaE: 0.1, // (suggested) OKLab distance between two lines that share track
  pairGreyRatio: 1.5, // (suggested) luminance ratio of their greys
  busOtherContrast: 2.5, // (suggested) a bus over water, park, wood or a building: the road floor
  tierNumbers: [9.2, 5.6, 3.7], // (design) DESIGN.md "Dark mode": tiers against the land
  tierRoadNumbers: [6.7, 4.1, 2.7], // ...and against a dark road
  tierTolerance: 0.15,
};

const here = (view) => {
  // A point to place a style-wide finding at: the middle of the first source with a line.
  const routes = view.data.routes?.features ?? [];
  const f = routes[Math.floor(routes.length / 2)];
  return f ? placeOf({ feature: f }) : [0, 0];
};
const at = (rep, view) => placeOf(rep) ?? here(view);
export const finding = (view, rep, kind, rule, extra) => {
  const [lon, lat] = at(rep, view);
  return { kind, rule, lon, lat, zoom: 16, route: null, layer: null, ...extra };
};

const r2 = (x) => Math.round(x * 100) / 100;
const dark = (view) => luminance(view.colour(view.layerById(ROLES.land), 'background-color', 12, {}) ?? { r: 255, g: 255, b: 255 }) < 0.2;
export const themeOf = (view) => (dark(view) ? 'dark' : 'light');

// ---------------------------------------------------------------- the pieces

// Every colour an expression can come out as (a match's branches, a case's,
// an interpolate's stops, or the literal itself).
export function colourOutputs(expr, out = new Set()) {
  if (expr == null) return out;
  if (typeof expr === 'string') { if (parse(expr)) out.add(expr); return out; }
  if (!Array.isArray(expr)) return out;
  const [op, ...args] = expr;
  if (op === 'literal') return colourOutputs(args[0], out);
  if (op === 'match') { for (let i = 2; i < args.length; i += 2) colourOutputs(args[i], out); colourOutputs(args.at(-1), out); return out; }
  if (op === 'case') { for (let i = 1; i < args.length - 1; i += 2) colourOutputs(args[i], out); colourOutputs(args.at(-1), out); return out; }
  if (op === 'interpolate') { for (let i = 3; i < args.length; i += 2) colourOutputs(args[i], out); return out; }
  if (op === 'step') { colourOutputs(args[1], out); for (let i = 3; i < args.length; i += 2) colourOutputs(args[i], out); return out; }
  if (op === 'coalesce') { for (const a of args) colourOutputs(a, out); return out; }
  return out;
}

// The grounds a line, mark or word can lie on, as colours over the land.
export function groundsOf(view, z = 14) {
  const land = view.colour(view.layerById(ROLES.land), 'background-color', z, {});
  const out = { land };
  for (const [name, id] of Object.entries(ROLES.grounds)) {
    const layer = view.layerById(id);
    if (!layer) continue;
    const prop = layer.type === 'fill' ? 'fill-color' : 'line-color';
    const c = view.colour(layer, prop, 16, { class: 'minor', $type: 2 });
    if (!c) continue;
    const op = layer.type === 'fill' ? view.get(layer, 'fill-opacity', 'paint', z, { class: 'wood' }, 1) : 1;
    out[name] = over(c, land, op);
  }
  return out;
}

// Each rail route as drawn: fill, outline and casing colours, from the style.
export function railLooks(view, z = 16) {
  const fillL = view.layerById(ROLES.railFill), edgeL = view.layerById(ROLES.railEdge), caseL = view.layerById(ROLES.railCasing);
  const out = new Map();
  if (!fillL) return out;
  for (const rep of view.reps(fillL)) {
    const route = rep.props.route;
    if (route == null || out.has(route)) continue;
    out.set(route, {
      route, rep,
      fill: view.colour(fillL, 'line-color', z, rep.props),
      edge: edgeL ? view.colour(edgeL, 'line-color', z, rep.props) : null,
      casing: caseL ? view.colour(caseL, 'line-color', z, rep.props) : null,
    });
  }
  return out;
}

// The look of each bus class: the street layer's classes and the part-time
// layers' tiers.
export function busLooks(view, z = 16) {
  const out = [];
  const streetL = view.layerById(ROLES.street);
  const seen = new Set();
  if (streetL) {
    for (const rep of view.reps(streetL)) {
      const key = `street:${rep.props.cls ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: rep.props.cls, layer: streetL, rep, colour: view.colour(streetL, 'line-color', z, rep.props) });
    }
  }
  for (const id of ROLES.busPart) {
    const layer = view.layerById(id);
    if (!layer) continue;
    for (const rep of view.reps(layer)) {
      const key = `${id}:${rep.props.tier ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: rep.props.tier, layer, rep, colour: view.colour(layer, 'line-color', z, rep.props) });
    }
  }
  return out;
}

const worst = (c, grounds) => {
  let best = null;
  for (const [name, g] of Object.entries(grounds)) {
    const r = contrast(c, g);
    if (!best || r < best.ratio) best = { name, ratio: r };
  }
  return best;
};

// ---------------------------------------------------------------- colour

/**
 * CW01, CW02, CW03, CW04, CW05, CW06, BG-01 and the rail pairs, for the theme
 * the view was built in.
 */
export function colourFaults(view, { limits = LIMITS, zoom = 16, icon = null } = {}) {
  const L = { ...LIMITS, ...limits };
  const faults = [];
  const theme = themeOf(view);
  const grounds = groundsOf(view);
  const land = grounds.land;
  const rails = railLooks(view, zoom);
  const buses = busLooks(view, zoom);

  // CW01: bus colours are an ink with no hue of a rail line.
  const railColours = [];
  for (const r of rails.values()) for (const [what, c] of [['fill', r.fill], ['outline', r.edge]]) if (c) railColours.push({ route: r.route, what, c, lch: oklch(c) });
  const hues = [];
  for (const b of buses) {
    if (!b.colour) continue;
    const lch = oklch(b.colour);
    if (lch.C > L.inkChroma) {
      hues.push({ b, lch });
      for (const r of railColours) {
        if (r.lch.C <= L.inkChroma) continue;
        const gap = hueGap(lch.h, r.lch.h);
        if (gap < L.hueApart) {
          faults.push(finding(view, b.rep, 'bus-hue', 'CW01', { layer: b.layer.id, route: r.route, msg: `${theme}: bus colour ${hex(b.colour)} (${b.key}, hue ${Math.round(lch.h)}, chroma ${r2(lch.C)}) is ${Math.round(gap)} deg from rail line ${r.route}'s ${r.what} (hue ${Math.round(r.lch.h)}); a bus ink must keep ${L.hueApart} deg from every rail hue or stay under chroma ${L.inkChroma}`, gap: Math.round(gap) }));
        }
      }
    }
  }
  if (hues.length > 1) {
    const hs = hues.map((x) => x.lch.h);
    const spread = Math.max(...hs) - Math.min(...hs);
    if (spread > L.hueSpread && Math.max(...hs) - Math.min(...hs) < 180) {
      faults.push(finding(view, hues[0].b.rep, 'bus-inks', 'CW01', { layer: hues[0].b.layer.id, msg: `${theme}: bus colours with a hue span ${Math.round(spread)} deg (${hues.map((x) => `${x.b.key} ${Math.round(x.lch.h)}`).join(', ')}): buses are one ink` }));
    }
  }

  // CW02: every rail line reads against everything it can lie on.
  for (const r of rails.values()) {
    const readers = [r.fill, r.edge].filter(Boolean);
    // Not the road: on a road a rail line wears its casing, and it is read
    // against the land beyond it (DESIGN.md, "Rail line colors").
    for (const [name, g] of Object.entries(grounds)) {
      if (name === 'road') continue;
      const best = Math.max(...readers.map((c) => contrast(c, g)));
      if (best < L.lineContrast) {
        faults.push(finding(view, r.rep, 'line-contrast', 'CW02', { layer: ROLES.railFill, route: r.route, msg: `${theme}: rail line ${r.route} (fill ${hex(r.fill)}${r.edge ? `, outline ${hex(r.edge)}` : ''}) reads ${r2(best)}:1 against the ${name} (${hex(g)}); floor ${L.lineContrast}:1`, ratio: r2(best), ground: name }));
      }
    }
    // CW04: in the dark theme the fill itself is lifted to 4:1 against the land.
    if (theme === 'dark' && r.fill && contrast(r.fill, land) < L.darkRailContrast - 0.005) {
      faults.push(finding(view, r.rep, 'dark-lift', 'CW04', { layer: ROLES.railFill, route: r.route, msg: `dark: rail line ${r.route} fill ${hex(r.fill)} is ${r2(contrast(r.fill, land))}:1 against the land; DESIGN.md lifts it to ${L.darkRailContrast}:1`, ratio: r2(contrast(r.fill, land)) }));
    }
  }
  // Buses: against the land 3:1, against the road they run on 2.5:1, the
  // strongest class 6:1 against the road (buses.spec.mjs).
  const strongest = buses.filter((b) => b.layer.id === ROLES.street).sort((a, b) => widthAt(view, b, zoom) - widthAt(view, a, zoom))[0];
  for (const b of buses) {
    if (!b.colour) continue;
    for (const [name, g] of Object.entries(grounds)) {
      const floor = name === 'land' ? L.lineContrast : name === 'road' ? (b === strongest ? L.busFrequentRoadContrast : L.busRoadContrast) : L.busOtherContrast;
      const ratio = contrast(b.colour, g);
      if (ratio < floor) {
        faults.push(finding(view, b.rep, 'line-contrast', 'CW02', { layer: b.layer.id, msg: `${theme}: bus class ${b.key} (${hex(b.colour)}) reads ${r2(ratio)}:1 against the ${name} (${hex(g)}); floor ${floor}:1`, ratio: r2(ratio), ground: name }));
      }
    }
  }

  // CW03: each rail letter against its bullet.
  const bulletL = view.layerById(ROLES.bullets);
  if (bulletL) {
    const done = new Set();
    for (const rep of view.reps(bulletL)) {
      const route = rep.props.route;
      if (route == null || done.has(route)) continue;
      done.add(route);
      const text = view.colour(bulletL, 'text-color', zoom, rep.props);
      const fill = rails.get(route)?.fill;
      if (!text || !fill) continue;
      const ratio = contrast(text, fill);
      if (ratio < L.letterContrast) {
        const other = Math.max(contrast({ r: 255, g: 255, b: 255 }, fill), contrast({ r: 0, g: 0, b: 0 }, fill));
        faults.push(finding(view, rep, 'letter-contrast', 'CW03', { layer: ROLES.bullets, route, msg: `${theme}: letter ${route} (${hex(text)}) on its bullet ${hex(fill)} is ${r2(ratio)}:1; floor ${L.letterContrast}:1 (the best of white and black would give ${r2(other)}:1)`, ratio: r2(ratio) }));
      }
    }
  }

  // CW05: map text against what it sits on.
  faults.push(...textFaults(view, grounds, L, theme, icon));

  // CW06: the tiers in order, and DESIGN.md's own numbers.
  const street = buses.filter((b) => b.layer.id === ROLES.street).sort((a, b) => widthAt(view, b, zoom) - widthAt(view, a, zoom));
  for (let i = 1; i < street.length; i++) {
    const a = street[i - 1], b = street[i];
    if (!a.colour || !b.colour) continue;
    if (contrast(b.colour, land) > contrast(a.colour, land) + 0.05) {
      faults.push(finding(view, b.rep, 'tier-order', 'CW06', { layer: ROLES.street, msg: `${theme}: bus class ${b.key} (${r2(contrast(b.colour, land))}:1 against the land) is stronger than the wider class ${a.key} (${r2(contrast(a.colour, land))}:1)` }));
    }
  }
  if (theme === 'dark' && street.length) {
    const road = grounds.road;
    const ratios = (g) => [...new Set(buses.filter((b) => b.colour).map((b) => r2(contrast(b.colour, g))))];
    for (const [numbers, g, name] of [[L.tierNumbers, land, 'land'], [L.tierRoadNumbers, road, 'road']]) {
      if (!g) continue;
      const have = ratios(g);
      for (const n of numbers) {
        if (!have.some((h) => Math.abs(h - n) <= L.tierTolerance)) {
          faults.push(finding(view, street[0].rep, 'tier-number', 'CW06', { layer: ROLES.street, msg: `dark: DESIGN.md gives a bus tier ${n}:1 against the ${name}; the bus colours read ${have.join(', ')}:1` }));
        }
      }
    }
    const top = oklch(street[0].colour);
    const railL = Math.max(...[...rails.values()].map((r) => oklch(r.fill).L));
    if (top.L > railL + 0.005) {
      faults.push(finding(view, street[0].rep, 'bus-brighter-than-rail', 'CW06', { layer: ROLES.street, msg: `dark: the frequent bus ink ${hex(street[0].colour)} (lightness ${r2(top.L)}) is brighter than every rail colour (brightest ${r2(railL)})` }));
    }
  }

  // BG-01: no basemap class contrasts with the land more than the weakest transit class.
  const baseRatios = [];
  for (const [name, g] of Object.entries(grounds)) if (name !== 'land') baseRatios.push({ name, ratio: contrast(g, land) });
  for (const id of ROLES.roadEdges) {
    const layer = view.layerById(id);
    const c = layer && view.colour(layer, 'line-color', 16, { class: 'motorway', $type: 2 });
    if (c) baseRatios.push({ name: id, ratio: contrast(c, land) });
  }
  const transit = [
    ...[...rails.values()].map((r) => ({ name: `rail ${r.route}`, ratio: Math.max(...[r.fill, r.edge].filter(Boolean).map((c) => contrast(c, land))), rep: r.rep })),
    ...buses.filter((b) => b.colour).map((b) => ({ name: b.key, ratio: contrast(b.colour, land), rep: b.rep })),
  ];
  if (baseRatios.length && transit.length) {
    const loud = baseRatios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    const quiet = transit.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    if (loud.ratio >= quiet.ratio) {
      faults.push(finding(view, quiet.rep, 'base-loud', 'BG-01', { msg: `${theme}: the basemap's ${loud.name} reads ${r2(loud.ratio)}:1 against the land, as much as the weakest transit class (${quiet.name}, ${r2(quiet.ratio)}:1)` }));
    }
  }

  // Two rail lines that share track.
  faults.push(...railPairFaults(view, rails, L, theme));
  return faults;
}

const widthAt = (view, b, z) => view.get(b.layer, 'line-width', 'paint', z, b.rep.props, 0);

// ---------------------------------------------------------------- text

// The basemap's words, by layer: the feature properties that pick each colour
// the layer can show, and what that kind of name lies on (OpenMapTiles
// schema). A layer not listed has one look and sits on the land. A shield's
// text sits on its icon (the icon reader), a halo is always counted.
export const TEXT_VARIANTS = {
  'water-label': [{ props: {}, on: ['water'] }],
  'road-label': [{ props: {}, on: ['road'] }],
  'road-label-minor': [{ props: {}, on: ['road'] }],
  'landmark-label': [{ props: { class: 'park' }, on: ['land', 'park'] }, { props: { class: 'hospital' }, on: ['land'] }],
  'highway-shield': [{ props: { network: 'us-interstate', ref_length: 2 }, on: [] }],
  'highway-shield-us': [{ props: { network: 'us-highway', ref_length: 2 }, on: [] }],
};

// Pictures drawn in a rail line's colour, which the style, not the picture, knows.
const NOT_A_GROUND = /^(bullet-|sign\||vehicle)/;

function textFaults(view, grounds, L, theme, icon) {
  const faults = [];
  const vector = (layer) => view.style.sources?.[layer.source]?.type === 'vector';
  for (const layer of view.layers) {
    if (layer.type !== 'symbol' || layer.layout?.['text-field'] === undefined || !view.draws(layer)) continue;
    const hasIcon = layer.layout?.['icon-image'] !== undefined;
    let variants;
    if (vector(layer)) variants = TEXT_VARIANTS[layer.id] ?? [{ props: {}, on: ['land'] }];
    else if (view.data[layer.source]) variants = view.reps(layer).map((rep) => ({ props: rep.props, on: ['land'], rep }));
    else continue; // Live's and the selection's words have no data to read
    const seen = new Set();
    for (const v of variants) {
      const c = view.colour(layer, 'text-color', 14, v.props);
      if (!c) continue;
      // What it sits on: the icon behind it, else the halo (the ground right
      // round the glyphs) and the ground its kind of name lies on.
      const sits = new Map();
      if (hasIcon) {
        const image = view.get(layer, 'icon-image', 'layout', 14, v.props, null);
        const name = image?.name ?? (typeof image === 'string' ? image : null);
        const px = name && icon && !NOT_A_GROUND.test(name) ? icon(name) : null;
        if (!px?.inner) continue; // an icon the style cannot read (a bullet in its line's colour: CW03)
        sits.set(`its icon ${name}`, px.inner);
      } else {
        const haloW = view.get(layer, 'text-halo-width', 'paint', 14, v.props, 0);
        const halo = haloW >= 1 ? view.colour(layer, 'text-halo-color', 14, v.props) : null;
        if (halo) sits.set(`its halo ${hex(halo)}`, halo);
        for (const name of v.on) if (grounds[name]) sits.set(`the ${name} ${hex(grounds[name])}`, grounds[name]);
      }
      for (const [name, g] of sits) {
        const key = `${hex(c)}|${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ratio = contrast(c, g);
        if (ratio < L.textContrast) {
          faults.push(finding(view, v.rep ?? null, 'text-contrast', 'CW05', { layer: layer.id, msg: `${theme}: ${layer.id} text ${hex(c)} reads ${r2(ratio)}:1 against ${name}; floor ${L.textContrast}:1`, ratio: r2(ratio), ground: name }));
        }
      }
    }
  }
  return faults;
}

// ---------------------------------------------------------------- marks

// Pictures that are not marks of a place: lines' letters and signs (their
// colour is the line's), arrows, the hatch.
const NOT_A_MARK = /^(bullet-|sign\||vehicle|chevron|clear|shield-|hatch|parking-?shadow)/;

/**
 * Each station, stop and facility mark against the ground it lies on: the
 * stronger of its outline and its fill must read 3:1 (contrast.spec.mjs'
 * "marks" rule, from the style and the pictures instead of pixels).
 * @param {Function} icon from iconpix.mjs
 */
export function markContrast(view, { icon, limits = LIMITS, zoom = 16 } = {}) {
  const L = { ...LIMITS, ...limits };
  const faults = [];
  const theme = themeOf(view);
  const grounds = groundsOf(view);
  const sits = [['land', grounds.land], ...(grounds.road ? [['road', grounds.road]] : [])];
  const seen = new Set();
  for (const layer of view.layers) {
    if (!view.draws(layer) || !view.data[layer.source] || (layer.type !== 'circle' && layer.type !== 'symbol')) continue;
    for (const rep of view.reps(layer)) {
      const readers = [];
      let name = layer.id;
      if (layer.type === 'circle') {
        const fillC = view.colour(layer, 'circle-color', zoom, rep.props);
        const strokeC = view.colour(layer, 'circle-stroke-color', zoom, rep.props);
        const sw = view.get(layer, 'circle-stroke-width', 'paint', zoom, rep.props, 0);
        const fo = view.get(layer, 'circle-opacity', 'paint', zoom, rep.props, 1);
        const so = view.get(layer, 'circle-stroke-opacity', 'paint', zoom, rep.props, 1);
        if (fillC && fo > 0) readers.push(['fill', fillC, fo]);
        if (strokeC && sw > 0 && so > 0) readers.push(['ring', strokeC, so]);
      } else {
        if (layer.layout?.['icon-image'] === undefined || !icon) continue;
        const image = view.get(layer, 'icon-image', 'layout', zoom, rep.props, null);
        name = image?.name ?? (typeof image === 'string' ? image : null);
        if (!name || NOT_A_MARK.test(name)) continue;
        const px = icon(name);
        if (!px) continue;
        const o = view.get(layer, 'icon-opacity', 'paint', zoom, rep.props, 1);
        if (o <= 0) continue;
        if (px.outer) readers.push(['outline', px.outer, 1]);
        if (px.inner) readers.push(['fill', px.inner, 1]);
      }
      if (!readers.length) continue;
      for (const [gname, g] of sits) {
        const key = `${layer.id}|${name}|${gname}|${readers.map(([, c]) => hex(c)).join()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const best = readers.map(([what, c, o]) => ({ what, c, ratio: contrast(over(c, g, o), g) })).sort((a, b) => b.ratio - a.ratio)[0];
        if (best.ratio < L.markContrast) {
          faults.push(finding(view, rep, 'mark-contrast', 'CW02', { layer: layer.id, msg: `${theme}: the ${layer.id} mark (${name}) reads ${r2(best.ratio)}:1 against the ${gname}, by its ${best.what} ${hex(best.c)}; floor ${L.markContrast}:1`, ratio: r2(best.ratio), ground: gname }));
        }
      }
    }
  }
  return faults;
}

// ---------------------------------------------------------------- rail pairs

// The pairs of rail routes whose drawn track is the same track: two routes
// with at least `shared` vertices within about a metre of each other.
export function sharedTrack(view, { shared = 5 } = {}) {
  const routes = view.data.routes?.features ?? [];
  const cells = new Map();
  const cell = (c) => `${Math.round(c[0] * 1e5)},${Math.round(c[1] * 1e5)}`;
  const parts = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
  for (const f of routes) {
    if (f.properties?.mode !== 'rail') continue;
    for (const part of parts(f.geometry)) for (const c of part) {
      const k = cell(c);
      if (!cells.has(k)) cells.set(k, new Set());
      cells.get(k).add(f.properties.route);
    }
  }
  const count = new Map();
  for (const set of cells.values()) {
    if (set.size < 2) continue;
    const list = [...set].sort();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const k = `${list[i]}|${list[j]}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return [...count].filter(([, n]) => n >= shared).map(([k, n]) => ({ pair: k.split('|'), vertices: n }));
}

export function railPairFaults(view, rails, L, theme) {
  const faults = [];
  for (const { pair: [a, b], vertices } of sharedTrack(view)) {
    const ra = rails.get(a), rb = rails.get(b);
    if (!ra?.fill || !rb?.fill) continue;
    // The fills: they are the lines' identity, side by side on shared track
    // (the outline only darkens each one).
    const colourGap = deltaE(ra.fill, rb.fill);
    const greyRatio = contrast(grey(ra.fill), grey(rb.fill));
    if (colourGap < L.pairDeltaE) {
      faults.push(finding(view, ra.rep, 'rail-pair', 'KD-05', { route: `${a} ${b}`, msg: `${theme}: rail lines ${a} (${hex(ra.fill)}) and ${b} (${hex(rb.fill)}) share ${vertices} vertices of track and differ by ${r2(colourGap)} in OKLab; floor ${L.pairDeltaE}`, deltaE: r2(colourGap), shared: vertices }));
    } else if (greyRatio < L.pairGreyRatio) {
      faults.push(finding(view, ra.rep, 'rail-pair-grey', 'KD-05', { route: `${a} ${b}`, msg: `${theme}: rail lines ${a} and ${b} share ${vertices} vertices of track and differ by ${r2(greyRatio)}:1 in greyscale; floor ${L.pairGreyRatio}:1`, ratio: r2(greyRatio), shared: vertices }));
    }
  }
  return faults;
}
