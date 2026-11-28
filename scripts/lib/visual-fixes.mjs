// Visual overrides for one named RTD place (DESIGN.md, "Zero maintenance", Rule 1).
// The register is scripts/visual-fixes.json. Facts and network-specific code stay out of this
// module: an entry names a station by RTD's id and carries the SHA-256 of that station's source
// geometry. A missing station or changed geometry disables the entry instead of drawing it stale.
import { createHash } from 'node:crypto';

const SIDES = new Set(['left', 'right', 'bottom-left', 'top-left', 'bottom-right', 'top-right', 'top', 'bottom']);
const HASH = /^[0-9a-f]{64}$/;
const ZOOM_EPSILON = 1e-9;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keyOf = (fix) => `${fix?.what?.kind ?? 'unknown'}:${fix?.what?.station ?? 'unknown'}`;
const nameOf = (fix, index) => `${keyOf(fix)} (entry ${index + 1})`;
const invalid = (fix, index, message) => { throw new Error(`Invalid visual fix ${nameOf(fix, index)}: ${message}`); };

/** A stable fingerprint of the exact RTD geometry an override was written against. */
export function geometryFingerprint(geometry) {
  if (!object(geometry) || typeof geometry.type !== 'string' || !Array.isArray(geometry.coordinates)) {
    throw new Error('A visual-fix fingerprint needs a GeoJSON geometry');
  }
  return createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
}

/** The current fingerprint for a register entry, or null when RTD no longer has its station. */
export function visualFixFingerprint(fix, data) {
  const found = stationMatches(fix, data);
  return found.length === 1 ? geometryFingerprint(found[0].geometry) : null;
}

/** Every source feature that carries the entry's station id. Exactly one identifies a place. */
const stationMatches = (fix, { stations }) => {
  const wanted = String(fix.what.station);
  return (stations?.features ?? []).filter((f) => String(f.properties?.id) === wanted);
};

function checkedRange(fix, index) {
  if (fix.zooms === undefined) return { from: -Infinity, to: Infinity };
  if (!object(fix.zooms) || Object.keys(fix.zooms).some((k) => !['from', 'to'].includes(k))) {
    invalid(fix, index, 'zooms must contain only from and to');
  }
  const { from, to } = fix.zooms;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) invalid(fix, index, 'zooms need finite from <= to');
  return { from, to };
}

function checkedFix(fix, index) {
  if (!object(fix)) invalid(fix, index, 'expected an object');
  if (!object(fix.what) || fix.what.kind !== 'station-name' || !['string', 'number'].includes(typeof fix.what.station) || String(fix.what.station).length === 0) {
    invalid(fix, index, 'what must name one station-name by its RTD station id');
  }
  if (Object.keys(fix.what).some((k) => !['kind', 'station'].includes(k))) invalid(fix, index, 'unsupported selector');
  if (!object(fix.set) || !SIDES.has(fix.set.side) || Object.keys(fix.set).some((k) => k !== 'side')) {
    invalid(fix, index, `set must contain only a side: ${[...SIDES].join(', ')}`);
  }
  if (!HASH.test(fix.fingerprint ?? '')) invalid(fix, index, 'fingerprint must be a lowercase SHA-256 hash');
  if (typeof fix.why !== 'string' || !fix.why.trim()) invalid(fix, index, 'why must explain the visual fault');
  if (!Number.isInteger(fix.issue) || fix.issue <= 0) invalid(fix, index, 'issue must be a positive issue number');
  const allowed = ['what', 'set', 'why', 'fingerprint', 'issue', 'zooms'];
  if (Object.keys(fix).some((k) => !allowed.includes(k))) invalid(fix, index, 'unsupported setting; a pin cannot change wording or other facts');
  return checkedRange(fix, index);
}

/**
 * Validate a register against the current RTD data. Programmer errors throw; a place RTD has
 * removed or changed is reported in `skipped` and contributes no pin. Only live pins conflict.
 */
export function resolveVisualFixes(fixes, data) {
  if (!Array.isArray(fixes)) throw new Error('scripts/visual-fixes.json must contain an array');
  const pins = [], skipped = [];
  for (const [index, fix] of fixes.entries()) {
    const range = checkedFix(fix, index);
    const matches = stationMatches(fix, data);
    if (matches.length > 1) {
      skipped.push({ index, key: keyOf(fix), reason: `RTD station id is ambiguous: ${matches.length} features carry it` });
      continue;
    }
    const fingerprint = visualFixFingerprint(fix, data);
    if (fingerprint === null) {
      skipped.push({ index, key: keyOf(fix), reason: 'RTD station id is no longer present' });
      continue;
    }
    if (fingerprint !== fix.fingerprint) {
      skipped.push({ index, key: keyOf(fix), reason: 'RTD station geometry fingerprint changed', expected: fix.fingerprint, actual: fingerprint });
      continue;
    }
    pins.push({ ...fix, range, index });
  }
  for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
    const a = pins[i], b = pins[j];
    if (keyOf(a) !== keyOf(b) || a.range.to < b.range.from - ZOOM_EPSILON || b.range.to < a.range.from - ZOOM_EPSILON) continue;
    throw new Error(`Conflicting visual fixes ${keyOf(a)} (entries ${a.index + 1} and ${b.index + 1}) share a zoom`);
  }
  return { total: fixes.length, pins, skipped };
}

/** Every live pin at this zoom. Ranges are inclusive; omitted ranges last the label's whole life. */
export function pinsAtZoom(resolved, zoom) {
  if (!Number.isFinite(zoom)) throw new Error('A pin lookup needs a finite zoom');
  return resolved.pins.filter((pin) => zoom >= pin.range.from - ZOOM_EPSILON && zoom <= pin.range.to + ZOOM_EPSILON);
}

/** The serializable build report; no source features or drawn geometry are copied into it. */
export function visualFixReport(resolved) {
  return {
    total: resolved.total,
    // Pins are resolved against RTD's data and listed here; no drawing or lettering plan
    // reads them yet (#234/#156), so a live pin has changed nothing that is drawn.
    applied: false,
    live: resolved.pins.length,
    skipped: resolved.skipped,
    pins: resolved.pins.map(({ range, index, ...pin }) => pin),
  };
}
