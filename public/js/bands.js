// Drawing bus lines beside rail band by band (DESIGN.md, "Bus routes",
// "Beside rail"; #97). From BESIDE_FROM in, the build draws every bus line
// and stop near rail again for each zoom band, moved clear of the pack
// (scripts/lib/beside.mjs), in the `beside` source: a moved copy carries
// `bz`, its band; a piece that has stopped moving carries `sf`, the band from
// which it is drawn as it is. The streets, stops and route highlights near
// rail are marked in their own sources: a street or stop `bs` (drawn there
// only further out than BESIDE_FROM), a route stretch `sf` (hidden while it
// is moved). From BESIDE_UNTIL in, nothing near rail is moved.

import { BESIDE_BANDS, BESIDE_FROM, BESIDE_UNTIL } from './beside.js';

// Where each band starts, and one more where the moving stops.
export const BAND_STARTS = [...BESIDE_BANDS, BESIDE_UNTIL];
const BAND_EDGE = 1e-4;
export const bandOf = (z) => (z < BESIDE_FROM ? -1 : BAND_STARTS.findLastIndex((b) => b <= z + 1e-9));
export const times = (a, b) => (b === 1 ? a : b === 0 || a === 0 ? 0 : a === 1 ? b : ['*', a, b]);

// What a source's own layers draw near rail: a street or stop only further
// out than BESIDE_FROM (a filter: whole zooms are enough here).
// (Only operators evaluate.js has: the key works out these filters itself.)
export const notBeside = ['any', ['!=', ['coalesce', ['get', 'bs'], 0], 1], ['<', ['zoom'], BESIDE_FROM]];

// Which features of the `beside` source band k draws: its moved copy, and
// what has stopped moving by then. `bz` and `sf` are bound once (`let`).
const inBand = (k) => ['case', ['==', ['var', 'bz'], k], 1, ['<=', ['var', 'sf'], k], 1, 0];
// A route stretch near rail: hidden while it is moved.
const asIsIn = (k) => (k < 0 ? 1 : ['case', ['<=', ['var', 'sf'], k], 1, 0]);

// An opacity, given as `at(zoom)` (its value at a zoom, a feature expression),
// that also keeps to the bands, worked out at each of `fades` (the zooms
// where `at` changes) and on each side of each band's start (a step a
// ten-thousandth of a zoom wide; MapLibre has no step inside interpolate).
// `moved`: for the `beside` source's layers (which start at BESIDE_FROM);
// else for a route stretch marked `sf`. Each distinct value of `at` is bound
// once with `let`, so the many stops stay small for MapLibre to compile.
export function banded(at, fades = [], moved = false) {
  const gate = moved ? inBand : asIsIn;
  const zooms = [...new Set([...fades.filter((z) => !moved || z > BESIDE_FROM), ...BAND_STARTS])].sort((a, b) => a - b);
  const values = new Map();
  const ref = (value) => {
    if (typeof value === 'number') return value;
    const key = JSON.stringify(value);
    if (!values.has(key)) values.set(key, { name: `v${values.size}`, value });
    return ['var', values.get(key).name];
  };
  const stops = [];
  const stop = (z) => stops.push(z, times(ref(at(z)), gate(bandOf(z))));
  for (const z of zooms) {
    const before = z - BAND_EDGE;
    if ((!stops.length || before > stops.at(-2)) && (!moved || before >= BESIDE_FROM)) stop(before);
    stop(z);
  }
  return [
    'let',
    'bz', ['coalesce', ['get', 'bz'], -1],
    'sf', ['coalesce', ['get', 'sf'], moved ? 999 : -1],
    ...[...values.values()].flatMap((v) => [v.name, v.value]),
    ['interpolate', ['linear'], ['zoom'], ...stops],
  ];
}

// Whether a feature is drawn at a zoom (a tap finds features whatever their
// opacity, so the hidden pieces and copies are left out there).
export function shownAt(properties, zoom) {
  const k = bandOf(zoom);
  if (properties.bs) return k < 0;
  const moved = properties.of !== undefined;
  if (properties.bz !== undefined && properties.bz !== null) return properties.bz === k;
  if (properties.sf !== undefined && properties.sf !== null) return moved ? k >= 0 && properties.sf <= k : k < 0 || properties.sf <= k;
  return true;
}
