// The style's own expressions, evaluated in Node (qa/drawn/README.md).
//
// The model never re-states a width, colour, offset, filter or font: it
// reads the layer definitions the page builds (public/js/network.js,
// public/js/basemap.js) and asks @maplibre/maplibre-gl-style-spec to
// evaluate them at a zoom and a feature's properties, exactly as MapLibre
// does when it draws. A layer added or restyled in the page is therefore in
// the model with no code change here.
//
// One difference from MapLibre is deliberate: filters read the zoom the way
// the page says they do (shared.js: "a filter sees the zoom as a whole
// number"), so `zoom` is floored before a filter is asked, while paint and
// layout read the zoom as it is.

import { createPropertyExpression, expression, featureFilter, latest } from '@maplibre/maplibre-gl-style-spec';

const SPEC = {
  paint: { line: latest.paint_line, fill: latest.paint_fill, circle: latest.paint_circle, symbol: latest.paint_symbol, background: latest.paint_background, fillExtrusion: latest.paint_fill_extrusion, heatmap: latest.paint_heatmap },
  layout: { line: latest.layout_line, fill: latest.layout_fill, circle: latest.layout_circle, symbol: latest.layout_symbol, background: latest.layout_background },
};

const cache = new Map();
// The style's global state (`sel`, `selStations`), so `fade()` evaluates as
// it does with nothing open. The style declares defaults per key; the
// evaluator wants the values themselves. Set from the style before any
// property is read.
let state;
export const setState = (s = {}) => {
  state = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v?.default ?? v]));
  cache.clear();
};

// A literal array (a dash pattern, a font stack, an anchor list) is not an
// expression: MapLibre wraps it, and so does the model. An expression written
// where one is allowed (icon-offset's match) starts with its operator and is
// left be.
const isLiteralArray = (v, spec) =>
  Array.isArray(v) && (spec.type === 'array' || spec.type === 'variableAnchorOffsetCollection') && !expression.isExpression(v);

function compiled(value, key, spec, kind) {
  const input = isLiteralArray(value, spec) ? ['literal', value] : value;
  const hit = cache.get(input);
  if (hit && hit.key === `${kind}:${key}` && hit.state === state) return hit.expr;
  const result = createPropertyExpression(input, key, spec, state);
  if (result.result !== 'success') {
    throw new Error(`style expression for ${kind} ${key}: ${result.value.map((e) => e.message).join('; ')}`);
  }
  cache.set(input, { key: `${kind}:${key}`, state, expr: result.value });
  return result.value;
}

// A property's value for a feature at a zoom. `fallback` is used when the
// layer doesn't set the property at all (the style's default), and when an
// expression yields nothing (a symbol-sort-key on a feature without one):
// MapLibre draws that as the default too.
export function property(layer, name, kind, zoom, properties, fallback = undefined) {
  const value = layer[kind]?.[name];
  if (value === undefined) return fallback;
  const spec = SPEC[kind]?.[layer.type]?.[name];
  if (!spec) throw new Error(`no ${kind} spec for ${layer.type} ${name}`);
  const expr = compiled(value, name, spec, kind);
  let out;
  try {
    out = expr.evaluate({ zoom }, { type: featureType(properties), properties });
  } catch {
    return fallback;
  }
  return out === undefined || out === null ? fallback : out;
}

// Filters see the zoom in whole steps (shared.js), so pass the floor. The
// compiled filter wants a globals object, not a number.
export function filterOf(layer) {
  if (!layer.filter) return null;
  const compiledFilter = featureFilter(layer.filter, 'filter');
  return (zoom, properties) => compiledFilter.filter({ zoom: Math.floor(zoom) }, { type: featureType(properties), properties });
}

function featureType(properties) {
  return properties?.$type ?? 1;
}

// A layer is drawn at a zoom when its minzoom/maxzoom say so. Layer zooms
// are whole numbers in MapLibre too.
export const inZoom = (layer, z) => (layer.minzoom ?? -Infinity) <= z && z < (layer.maxzoom ?? Infinity);

// An evaluated colour as CSS. style-spec hands back a Color for colours the
// model will compare, and a string for one written as a string.
export function css(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toString === 'function') return v.toString();
  return null;
}
