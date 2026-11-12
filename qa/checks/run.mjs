// Every fault check the drawn model has, run over one build in one theme
// (issue #45). `report.mjs` (npm run check:map) and `qa/recall/recall.mjs`
// (npm run check:recall) both call this, so the score measures the same
// checks the report runs.
//
// Line checks walk the whole district at each zoom. Label, mark and street
// checks run per screen, at places: the busiest interchanges and a seeded
// walk over the network, plus any `extraPlaces` a caller asks for (recall
// asks for the places where faults are known or planted, to tell a detector
// that misses a fault from a run that never looked there).
import { openModel } from '../drawn/model.mjs';
import { assertStyleEvaluates } from '../drawn/expressions.mjs';
import { coveredFaults, mergeCovered } from '../drawn/covered.mjs';
import { endFaults } from '../drawn/ends.mjs';
import { packFaults } from '../drawn/packs.mjs';
import { shapeFaults } from '../drawn/shapes.mjs';
import { lineFaults } from '../drawn/lines.mjs';
import { PLACE_SOURCES, routeFaults } from '../drawn/routes.mjs';
import { labelFaults } from '../drawn/labels.mjs';
import { toLonLat, toWorld } from '../drawn/mercator.mjs';
import { markFaults } from '../drawn/marks.mjs';
import { streetFaults } from '../drawn/streets.mjs';
import { seededViews } from '../lib/views.mjs';

export const SEVERITY = {
  gap: 1, break: 1, 'end-hidden': 1, overshoot: 1, dangling: 1, 'end-unmarked': 1,
  hook: 2, tick: 2, 'steep-ease': 2, 'off-street': 2, 'under-rail': 2, 'stop-on-rail': 2, 'bus-in-hall': 2, 'mark-askew': 2, 'marks-not-parallel': 2, 'off-platform': 2, skew: 2, 'past-roof': 2,
  'stray-stop': 3, drift: 3, 'uneven-gap': 3, swap: 3, 'mark-short': 3, 'ends-uneven': 3, 'past-mark': 3, 'walk-bent': 3, 'rail-only-stop': 3, 'rail-under-bus': 3,
  duplicate: 4, 'marks-overlap': 4, sliver: 4, 'zig-zag': 4, 'sharp-bend': 4, 'over-line': 5, step: 6, hidden: 7, far: 8, translucent: 9, 'marks-nested': 9, 'platform-covered': 9,
};
// Every half zoom the page shows the network at. The checks used to look at
// 12, 14, 16 and 17 only, and two faults Chris found by eye on 2026-11-11
// were at 11 and 13. A theme takes about 15 seconds at all fifteen. From 9
// to 10.5 by quarters: phones open at about 10 (9.99 on a 402x655 screen,
// 10.11 on 390x844), and below 10 the page's tiles are cut at zoom 9, so
// two phones a hair apart were two different maps (#115).
export const ZOOMS = [9, 9.25, 9.5, 9.75, 10, 10.25, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17];
// `dangling` measures in metres (no mark within 150 m), which is under 3 px
// below zoom 12, where the outer lines of a pack are drawn hundreds of metres
// from their station: every find there was a line ending inside its mark.
// `end-unmarked` (ends.mjs) is the rule at every zoom; this one is kept from
// 12 for the finds it is scored on.
const DANGLING_FROM = 12;
// A platform mostly under the lines drawn over it (shapes.mjs) is two thirds
// of all platforms at zoom 16: a question for the design, not a fault list.
// Ask for it with `leads: true`.
const LEADS = new Set(['platform-covered']);
export const FRAME = { width: 390, height: 664 };
// The zooms a place is looked at when the caller names none; marks and street
// alignment need the basemap, read from z16.
export const PLACE_ZOOMS = [17, 14];
const DETAIL_FROM = 16;

const atPlace = (px, view) => {
  const centre = toWorld([view.lon, view.lat], view.zoom);
  const [lon, lat] = toLonLat([centre[0] + px[0] - FRAME.width / 2, centre[1] + px[1] - FRAME.height / 2], view.zoom);
  return { lon, lat };
};
const linkTo = (site, zoom, lat, lon) => `${site}/#${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`;

// The places the report looks at, from the build's own data: the busiest
// interchanges (where names are densest) and a seeded walk over the lines.
export function defaultPlaces(data, { views = 10 } = {}) {
  const served = data.stations.features.filter((f) => f.properties?.served && f.properties.label);
  const busiest = [...served].sort((a, b) => (b.properties.links ?? 0) - (a.properties.links ?? 0)).slice(0, 12);
  const places = busiest.map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], zooms: PLACE_ZOOMS, why: 'busiest' }));
  for (const s of seededViews(data.routes, { count: views, zooms: [17], seed: 7 })) places.push({ lon: s.lon, lat: s.lat, zooms: PLACE_ZOOMS, why: 'seeded' });
  return places;
}

/**
 * @returns {Promise<Array>} findings, one per detector hit, unmerged
 */
export async function runChecks({ data, meta, root, theme, zooms = ZOOMS, views = 10, site = '', extraPlaces = [], defaults = true, leads = false }) {
  const model = await openModel({ ...(root ? { root } : {}), theme, data, meta });
  const findings = [];
  const nameLayers = model.style.layers.filter((l) => l.type === 'symbol'
    && l.layout?.['text-field'] !== undefined
    && l.layout?.['icon-image'] === undefined
    && l.layout?.['symbol-placement'] !== 'line' && model.data[l.source]).map((l) => l.id);

  const covered = [];
  for (const zoom of zooms) {
    const at = model.zoom(zoom);
    // Where a line end can be at, as the page draws those marks and halls
    // once their layers are on, so the answer is the same at every zoom.
    const places = model.places(zoom, PLACE_SOURCES);
    const push = (fault, check) => {
      const [lon, lat] = toLonLat(fault.px, zoom);
      findings.push({ theme, check, kind: fault.kind, layer: fault.layer, route: fault.route ?? null, zoom, lat, lon, msg: fault.msg, link: linkTo(site, zoom, lat, lon), where: 'district' });
    };
    for (const fault of [...lineFaults(at), ...routeFaults(at, { places })]) {
      if (fault.kind === 'dangling' && zoom < DANGLING_FROM) continue;
      push(fault, 'lines');
    }
    // Rail ends and station marks (ends.mjs), and lines against platforms,
    // roofs and walks (shapes.mjs).
    for (const fault of endFaults(at, { alpha: (id, xy) => model.icons.alpha(id, xy) })) push(fault, 'ends');
    // Lines sharing track (packs.mjs): even gaps, no drift, no steep ease.
    for (const fault of packFaults(at)) push(fault, 'packs');
    for (const fault of shapeFaults(at, { data: model.data })) if (leads || !LEADS.has(fault.kind)) push(fault, 'shapes');
    // Bus lines and stops under rail (covered.mjs), kept with their zoom to
    // be merged below: a stretch is not the same length at every zoom.
    for (const fault of coveredFaults(at, { places })) covered.push({ ...fault, zoom });
  }
  // One row per stretch or stop, at the point the merge gives it, once for
  // each zoom it was seen at (mergeFindings then makes it one finding).
  for (const row of mergeCovered(covered)) {
    for (const zoom of row.zooms) {
      findings.push({ theme, check: 'covered', kind: row.kind, layer: row.layer ?? null, route: row.route ?? null, zoom, lat: row.lat, lon: row.lon, msg: row.msg, link: linkTo(site, Math.max(...row.zooms), row.lat, row.lon), where: 'district' });
    }
  }

  const places = [...(defaults ? defaultPlaces(model.data, { views }) : []), ...extraPlaces];
  const seen = new Set();
  for (const place of places) {
    for (const zoom of place.zooms ?? PLACE_ZOOMS) {
      const key = `${zoom}/${place.lat.toFixed(4)}/${place.lon.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const detail = zoom >= DETAIL_FROM;
      const frame = await model.frame({ zoom, center: [place.lon, place.lat], ...FRAME, basemap: detail });
      const view = { ...place, zoom };
      const where = place.why ?? 'asked';
      const at = (fault, check, extra = {}) => {
        const p = atPlace(fault.px, view);
        findings.push({ theme, check, kind: fault.kind, layer: fault.layer, route: fault.route ?? null, ...extra, zoom, ...p, msg: fault.msg, link: linkTo(site, zoom, view.lat, view.lon), where });
      };
      for (const fault of labelFaults(frame, { layers: nameLayers })) at(fault, 'labels', { route: fault.crossed?.route ?? null, crossed: fault.crossed ?? null });
      if (detail) {
        for (const fault of markFaults(frame)) at(fault, 'marks');
        for (const fault of streetFaults(frame)) at(fault, 'streets');
      }
    }
  }
  // A property the model couldn't evaluate is drawn with its default, so
  // every finding above may be about a map the page doesn't draw (#58).
  assertStyleEvaluates();
  return findings;
}

// One fault, one row: the same fault measured at several zooms is one
// finding, with the zooms it was seen at.
export function mergeFindings(findings) {
  const merged = new Map();
  for (const f of findings) {
    // No theme in the key: the geometry is shared, so a fault found in both
    // themes is one row (as report.mjs has always merged).
    const key = `${f.check}|${f.kind}|${f.route ?? ''}|${f.lat.toFixed(4)}|${f.lon.toFixed(4)}`;
    const had = merged.get(key);
    if (had) {
      if (!had.zooms.includes(f.zoom)) had.zooms.push(f.zoom);
      if (f.msg.length > had.msg.length) had.msg = f.msg;
    } else {
      merged.set(key, { ...f, zooms: [f.zoom] });
    }
  }
  const out = [...merged.values()];
  for (const f of out) f.severity = SEVERITY[f.kind] ?? 9;
  return out.sort((a, b) => a.severity - b.severity || a.check.localeCompare(b.check) || a.theme.localeCompare(b.theme));
}
