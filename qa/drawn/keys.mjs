// The Key against the map (qa/rules/design-invariants.md KL02, KL03, KL04, and
// "the Key lists everything the map draws at its zoom and nothing that is
// not").
//
// readKey() runs the page's own legend.js in Node (keyrows.mjs) at each zoom
// and returns the Key's rows; keyFaults() holds them against what the style
// draws at that zoom (stylekit.mjs, zooms.mjs) and what the data has.
//
//  - key-missing: something is drawn at this zoom and no row of the Key
//    stands for it.
//  - key-ahead: a row for something not drawn at this zoom. DESIGN.md (L2246-50)
//    shows "marks that arrive only closer in (closed stations, signs, stops,
//    FlexRide)" as they first look, on purpose; those four are `designed`,
//    every other row that runs ahead of the map is not.
//  - key-extra: a row for something the data does not have.
//  - key-station-row: the station row or the hub's row is not the one the
//    zoom draws (KL03).
//  - swatch-differs: a bus row's swatch is not its layer's own width, colour,
//    cap or dash at zoom 13 (KL02).
//  - key-counts: a row that counts things (KL04).

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse } from './colours.mjs';
import { ROLES, finding } from './styles.mjs';
import { strength } from './zooms.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const KEY_ZOOMS = [8.5, 9, 10, 10.6, 10.7, 11, 12, 13, 14, 15, 16, 17];
export const SWATCH_ZOOM = 13; // legend.js: ZOOMS[2]

/** The Key's lists at each zoom: { zooms: { z: { rail, tiers, symbols, live } } }. */
export async function readKey({ root, theme, meta, zooms = KEY_ZOOMS, live = false }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawn-key-'));
  const metaFile = path.join(dir, 'meta.json');
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  try {
    const args = [path.join(HERE, 'keyrows.mjs'), '--theme', theme, '--root', path.resolve(root), '--meta', metaFile, '--zooms', zooms.join(',')];
    if (live) args.push('--live');
    const { stdout } = await run(process.execPath, args, { cwd: path.resolve(root), maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- parsing

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** A list's `<li>`s as rows: { text, marks: [{ mark, size, stroke, width, cap, dash }] }. */
export function parseRows(html) {
  const rows = [];
  for (const [, li] of String(html ?? '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const marks = [];
    for (const [tag] of li.matchAll(/<(?:img|svg)\b[^>]*>/g)) {
      const mark = attr(tag, 'data-mark');
      if (mark) marks.push({ mark, size: attr(tag, 'data-size') === null ? null : Number(attr(tag, 'data-size')) });
    }
    const path = /<path\b[^>]*>/.exec(li)?.[0];
    if (path && marks.length) {
      const dash = attr(path, 'stroke-dasharray');
      Object.assign(marks[0], { stroke: attr(path, 'stroke'), width: Number(attr(path, 'stroke-width')), cap: attr(path, 'stroke-linecap'), dash: dash ? dash.split(/\s+/).map(Number) : null });
    }
    const spans = [...li.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    rows.push({ text: spans.at(-1) ?? li.replace(/<[^>]+>/g, '').trim(), marks });
  }
  return rows;
}

// ---------------------------------------------------------------- groups

// What the Key has a row for, against the layers that draw it. `mark` matches
// a row's data-mark (an image id, or the layers a swatch is made from).
export const KEY_GROUPS = [
  { id: 'station marks', layers: ['stations-dot', 'stations', 'platform', 'platform-dot'], mark: /^(dot|station)-\d/ },
  { id: "the hub's ring", layers: ['stations-hub'], mark: /^hub-/ },
  { id: 'closed stations', layers: ['stations-unserved'], mark: /^stations-unserved$/, designed: true },
  { id: 'Park-n-Ride and transit centers', layers: ['facilities'], mark: /^(parking|transit-center)$/, designed: true },
  { id: 'bus terminals', layers: ['bus-terminal'], mark: /^bus-terminal$/ },
  { id: 'bus halls below the street', layers: ['bus-terminal-under'], mark: /^bus-terminal-under$/ },
  { id: 'station platforms and roofs', layers: ['station-platform', 'station-canopy'], mark: /station-platform/ },
  { id: 'station buildings', layers: ['station-building'], mark: /^station-building/ },
  { id: 'one-way arrows', layers: ['street-oneway'], mark: /^street-oneway$/ },
  { id: 'bus stops', layers: ['stops', 'stops-gate'], mark: /^stops$/, designed: true },
  { id: 'FlexRide', layers: ['flexride-fill', 'flexride-line'], mark: /^flexride/, designed: true },
  { id: "the walk between a station's marks", layers: ['platform-joins'], mark: /^platform-join/ },
  { id: 'rush-hour buses', layers: ['bus-part-time'], where: (p) => p.tier === 'peak', mark: /^bus-part-time$/ },
  { id: 'few-trip buses', layers: ['bus-limited'], mark: /^bus-limited$/ },
];

const drawnAt = (view, group, z) => Math.max(0, ...group.layers.map((id) => strength(view, { id, where: group.where }, z)));
const hasData = (view, group) => group.layers.some((id) => { const l = view.layerById(id); return l && view.reps(l).some((r) => !group.where || group.where(r.props)); });

/**
 * @param {object} view styleView of the same theme
 * @param {{zooms: Object}} key readKey()'s answer
 * @param {{meta?: object}} opts
 */
export function keyFaults(view, key, { meta = null, groups = KEY_GROUPS } = {}) {
  const faults = [];
  const theme = key.theme;
  const zooms = Object.keys(key.zooms).map(Number).sort((a, b) => a - b);
  const rowsAt = (z) => ({ tiers: parseRows(key.zooms[z].tiers), symbols: parseRows(key.zooms[z].symbols), rail: parseRows(key.zooms[z].rail) });
  const listed = (rows, group) => [...rows.tiers, ...rows.symbols].some((r) => r.marks.some((m) => group.mark.test(m.mark)));
  const ahead = new Map();

  for (const z of zooms) {
    const rows = rowsAt(z);
    for (const group of groups) {
      if (!hasData(view, group)) {
        if (listed(rows, group)) faults.push(finding(view, null, 'key-extra', 'KL04', { zoom: z, layer: group.layers[0], msg: `${theme}: the Key has a row for ${group.id} at zoom ${z} and the build has none of it` }));
        continue;
      }
      const drawn = drawnAt(view, group, z) >= 0.5;
      const has = listed(rows, group);
      if (drawn && !has) {
        faults.push(finding(view, anyRep(view, group), 'key-missing', 'KL', { zoom: z, layer: group.layers[0], msg: `${theme}: ${group.id} (${group.layers.join(', ')}) are drawn at zoom ${z} and the Key has no row for them` }));
      } else if (!drawn && has && drawnAt(view, group, z) < 0.2) {
        if (!ahead.has(group.id)) ahead.set(group.id, { group, zooms: [] });
        ahead.get(group.id).zooms.push(z);
      }
    }
    // Every bus class the style draws has its row.
    const streetL = view.layerById(ROLES.street);
    if (streetL) {
      const drawnClasses = new Set(view.reps(streetL).filter((r) => view.opacity(streetL, r, z) >= 0.5).map((r) => r.props.cls));
      const swatches = rows.tiers.filter((r) => r.marks.some((m) => m.mark === ROLES.street)).length;
      if (drawnClasses.size > swatches) faults.push(finding(view, view.reps(streetL)[0], 'key-missing', 'KL', { zoom: z, layer: ROLES.street, msg: `${theme}: ${drawnClasses.size} street classes are drawn at zoom ${z} and the Key has ${swatches} rows for them` }));
    }
    // Every rail line has its row.
    if (meta?.rail && rows.rail.length < meta.rail.length) faults.push(finding(view, null, 'key-missing', 'KL', { zoom: z, layer: ROLES.railFill, msg: `${theme}: the build has ${meta.rail.length} rail lines and the Key's list of trains has ${rows.rail.length}` }));
  }
  for (const { group, zooms: zs } of ahead.values()) {
    faults.push(finding(view, anyRep(view, group), 'key-ahead', 'KL', { zoom: zs[0], layer: group.layers[0], designed: !!group.designed, msg: `${theme}: the Key has a row for ${group.id} at ${zs.length} of ${zooms.length} zooms (${zs.join(', ')}) where the map has not drawn it${group.designed ? ' (DESIGN.md L2246-50 shows marks that arrive only closer in as they first look)' : ''}` }));
  }

  faults.push(...stationRowFaults(view, key, theme));
  faults.push(...swatchFaults(view, key, theme));
  faults.push(...dataRowFaults(view, key, theme, meta));
  return faults;
}

const anyRep = (view, group) => { for (const id of group.layers) { const l = view.layerById(id); const r = l && view.reps(l)[0]; if (r) return r; } return null; };

// KL03: the station row follows the zoom.
function stationRowFaults(view, key, theme) {
  const faults = [];
  for (const z of Object.keys(key.zooms).map(Number).sort((a, b) => a - b)) {
    const symbols = parseRows(key.zooms[z].symbols);
    const row = symbols.find((r) => /^Rail station/.test(r.text));
    const marks = (row?.marks ?? []).map((m) => m.mark);
    const dot = strength(view, { id: 'stations-dot', where: (p) => p.served === true }, z), cap = strength(view, { id: 'stations', where: (p) => p.served === true }, z);
    const wantDots = dot >= 0.5 && dot >= cap, wantCaps = cap >= 0.5 && cap > dot;
    const none = dot < 0.5 && cap < 0.5;
    const gotDots = marks.some((m) => m.startsWith('dot-')), gotCaps = marks.some((m) => m.startsWith('station-'));
    const say = (what) => faults.push(finding(view, null, 'key-station-row', 'KL03', { zoom: z, layer: 'stations', msg: `${theme}: at zoom ${z} the map draws ${what} (ticks ${dot.toFixed(2)}, capsules ${cap.toFixed(2)}) and the Key's station row shows ${marks.length ? marks.join(', ') : `"${row?.text ?? 'nothing'}"`}` }));
    if (none && (gotDots || gotCaps)) say('no station marks');
    else if (wantDots && !gotDots) say('ticks');
    else if (wantCaps && !gotCaps) say('capsules');
    const hub = Math.max(0, strength(view, { id: 'stations-hub' }, z));
    const hubRow = symbols.some((r) => r.marks.some((m) => /^hub-/.test(m.mark)));
    if ((hub >= 0.5) !== hubRow) faults.push(finding(view, null, 'key-station-row', 'KL03', { zoom: z, layer: 'stations-hub', msg: `${theme}: at zoom ${z} the hub's ring is drawn at ${hub.toFixed(2)} and the Key ${hubRow ? 'has' : 'has no'} row for it (a row only while the ring is at least half drawn)` }));
  }
  return faults;
}

const close = (a, b, tol = 0.06) => Math.abs(a - b) <= tol;
const sameColour = (a, b) => { const x = parse(a), y = parse(b); return !!x && !!y && Math.abs(x.r - y.r) <= 1.5 && Math.abs(x.g - y.g) <= 1.5 && Math.abs(x.b - y.b) <= 1.5; };

// KL02: each bus row's swatch is its layer's own look at zoom 13.
function swatchFaults(view, key, theme) {
  const faults = [];
  const z0 = Number(Object.keys(key.zooms)[0]);
  const tiers = parseRows(key.zooms[z0].tiers);
  const streetL = view.layerById(ROLES.street);
  // The classes the Key lists are the build's, strongest first.
  const classes = streetL ? [...new Map(view.reps(streetL).map((r) => [r.props.cls, r])).values()].sort((a, b) => view.get(streetL, 'line-width', 'paint', 16, b.props, 0) - view.get(streetL, 'line-width', 'paint', 16, a.props, 0)) : [];
  const streets = tiers.filter((r) => r.marks[0]?.mark === ROLES.street);
  const check = (layer, rep, row, what) => {
    const m = row.marks[0];
    const w = view.get(layer, 'line-width', 'paint', SWATCH_ZOOM, rep.props, 1);
    const colour = view.colour(layer, 'line-color', SWATCH_ZOOM, rep.props);
    const cap = view.get(layer, 'line-cap', 'layout', SWATCH_ZOOM, rep.props, 'butt');
    const dash = view.get(layer, 'line-dasharray', 'paint', SWATCH_ZOOM, rep.props, null);
    const problems = [];
    if (!close(m.width, w)) problems.push(`width ${m.width} (the layer draws ${Math.round(w * 100) / 100})`);
    if (colour && !sameColour(m.stroke, colour)) problems.push(`colour ${m.stroke} (the layer draws rgb ${Math.round(colour.r)},${Math.round(colour.g)},${Math.round(colour.b)})`);
    if (m.cap !== cap) problems.push(`cap ${m.cap} (the layer draws ${cap})`);
    const expectDash = Array.isArray(dash) ? dash.map((d) => d * w) : null;
    if (!!expectDash !== !!m.dash || (expectDash && !expectDash.every((d, i) => close(d, m.dash[i], 0.1)))) problems.push(`dash ${JSON.stringify(m.dash)} (the layer draws ${JSON.stringify(expectDash)})`);
    if (problems.length) faults.push(finding(view, rep, 'swatch-differs', 'KL02', { zoom: SWATCH_ZOOM, layer: layer.id, msg: `${theme}: the Key's swatch for ${what} is not the ${layer.id} layer's own look at zoom ${SWATCH_ZOOM}: ${problems.join('; ')}` }));
  };
  if (streetL) streets.forEach((row, i) => { if (classes[i]) check(streetL, classes[i], row, `class ${classes[i].props.cls} ("${row.text}")`); });
  for (const row of tiers) {
    const id = row.marks[0]?.mark;
    if (!ROLES.busPart.includes(id)) continue;
    const layer = view.layerById(id);
    const rep = layer && view.reps(layer).sort((a, b) => b.n - a.n)[0];
    if (rep) check(layer, rep, row, `${id} ("${row.text}")`);
  }
  return faults;
}

// KL04: rows only for what the data has; no counts; no row for tier none.
function dataRowFaults(view, key, theme, meta) {
  const faults = [];
  const z0 = Number(Object.keys(key.zooms)[0]);
  const rows = [...parseRows(key.zooms[z0].tiers), ...parseRows(key.zooms[z0].symbols)];
  const has = (src, pred = () => true) => (view.data[src]?.features ?? []).some((f) => pred(f.properties ?? {}));
  const expect = [
    [/^stations-unserved$/, 'a closed station', has('stations', (p) => p.served === false)],
    [/^(parking|transit-center)$/, 'a Park-n-Ride or transit center', has('facilities')],
    [/^bus-terminal$/, 'a bus terminal', has('terminals', (p) => !p.underground)],
    [/^bus-terminal-under$/, 'a bus hall below ground', has('terminals', (p) => p.underground === 1)],
    [/station-platform/, 'a station structure', has('structures')],
    [/^stops$/, 'a bus stop', has('stops')],
    [/^flexride/, 'a FlexRide zone', has('flexride')],
  ];
  for (const [re, what, present] of expect) {
    const row = rows.find((r) => r.marks.some((m) => re.test(m.mark)));
    if (row && !present) faults.push(finding(view, null, 'key-extra', 'KL04', { layer: row.marks[0].mark, msg: `${theme}: the Key has a row ("${row.text}") and the build has no ${what}` }));
  }
  for (const r of rows) {
    if (/\b\d[\d,]*\s+(routes?|stops?|stations?|streets?|buses|lines|km|miles)\b/i.test(r.text)) faults.push(finding(view, null, 'key-counts', 'KL04', { layer: r.marks[0]?.mark ?? null, msg: `${theme}: the Key row "${r.text}" counts things; the Key shows what a symbol means, not statistics` }));
    if (/\bno (weekday )?service\b|not running|\bnone\b/i.test(r.text) && r.marks.some((m) => m.mark === ROLES.street || ROLES.busPart.includes(m.mark))) faults.push(finding(view, null, 'key-extra', 'KL04', { layer: r.marks[0]?.mark ?? null, msg: `${theme}: the Key has a row for lines not running ("${r.text}"); DESIGN.md has none for tier none` }));
  }
  if (meta?.classes) {
    const present = Object.entries(meta.classes).filter(([, v]) => v?.streets).length;
    const listed = rows.filter((r) => r.marks[0]?.mark === ROLES.street).length;
    if (listed !== present) faults.push(finding(view, null, 'key-extra', 'KL04', { layer: ROLES.street, msg: `${theme}: the build has ${present} street classes and the Key lists ${listed}` }));
  }
  return faults;
}
