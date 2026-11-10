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
import { lineFaults } from '../drawn/lines.mjs';
import { routeFaults } from '../drawn/routes.mjs';
import { labelFaults } from '../drawn/labels.mjs';
import { toLonLat, toWorld } from '../drawn/mercator.mjs';
import { markFaults } from '../drawn/marks.mjs';
import { streetFaults } from '../drawn/streets.mjs';
import { seededViews } from '../lib/views.mjs';

export const SEVERITY = { gap: 1, overshoot: 1, dangling: 1, hook: 2, 'off-street': 2, 'stray-stop': 3, duplicate: 4, 'over-line': 5, step: 6, hidden: 7, far: 8, translucent: 9 };
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
export async function runChecks({ data, meta, root, theme, zooms = [12, 14, 16, 17], views = 10, site = '', extraPlaces = [], defaults = true }) {
  const model = await openModel({ ...(root ? { root } : {}), theme, data, meta });
  const findings = [];
  const nameLayers = model.style.layers.filter((l) => l.type === 'symbol'
    && l.layout?.['text-field'] !== undefined
    && l.layout?.['icon-image'] === undefined
    && l.layout?.['symbol-placement'] !== 'line' && model.data[l.source]).map((l) => l.id);

  for (const zoom of zooms) {
    const at = model.zoom(zoom);
    for (const fault of [...lineFaults(at), ...routeFaults(at)]) {
      const [lon, lat] = toLonLat(fault.px, zoom);
      findings.push({ theme, check: 'lines', kind: fault.kind, layer: fault.layer, route: fault.route ?? null, zoom, lat, lon, msg: fault.msg, link: linkTo(site, zoom, lat, lon), where: 'district' });
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
