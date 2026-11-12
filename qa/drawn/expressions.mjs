// The style's own expressions, evaluated in Node (qa/drawn/README.md).
//
// The model never re-states a width, colour, offset, filter or font: it
// reads the layer definitions the page builds (public/js/network.js,
// public/js/basemap.js) and asks @maplibre/maplibre-gl-style-spec to
// evaluate them at a zoom and a feature's properties, exactly as MapLibre
// does when it draws. A layer added or restyled in the page is therefore in
// the model with no code change here.
//
// Where the model follows MapLibre's quirks rather than the style spec's
// plain reading:
//
//  - A filter sees the zoom as a whole number (shared.js): the tile's zoom,
//    which is the map's zoom floored. `zoom` is floored before a filter is
//    asked.
//  - A paint property that reads BOTH the zoom and a feature's property (the
//    spec's "composite") is not worked out at the zoom on screen. MapLibre
//    works it out per feature when the tile is cut, at the tile's whole zoom
//    and at the next one (program_configuration.ts, CompositeExpressionBinder),
//    and the shader blends the two by how far the zoom has got between them.
//    A stop between two whole zooms in such an expression does nothing: a
//    mark whose opacity ramps 0 to 1 over 13 to 14 is whatever it is at 13
//    and at 14, blended in a straight line. Properties that read only the
//    zoom ("camera") or only the feature are worked out as they are. Layout
//    properties are a separate case (the symbol's size, in model.mjs).

import { Color, createPropertyExpression, expression, featureFilter, latest } from '@maplibre/maplibre-gl-style-spec';

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
    out = evaluateAt(expr, kind, zoom, { type: featureType(properties), properties });
  } catch {
    return fallback;
  }
  return out === undefined || out === null ? fallback : out;
}

// A paint property at a zoom, the way MapLibre draws it. A composite one (it
// reads the zoom and a feature property) is evaluated at the whole zoom below
// and the whole zoom above, and the two are blended by the expression's own
// interpolation of the zoom between them (its `interpolationFactor`: linear,
// exponential or a curve for an `interpolate`; none for a `step`, which
// holds the lower value). Everything else is evaluated at the zoom itself.
export function evaluateAt(expr, kind, zoom, feature) {
  if (kind !== 'paint' || expr.kind !== 'composite') return expr.evaluate({ zoom }, feature);
  const lower = Math.floor(zoom);
  const a = expr.evaluate({ zoom: lower }, feature);
  if (zoom === lower) return a;
  const t = Math.max(0, Math.min(1, expr.interpolationFactor(zoom, lower, lower + 1)));
  if (!(t > 0)) return a;
  const b = expr.evaluate({ zoom: lower + 1 }, feature);
  return blend(a, b, t);
}

// Two evaluated values, `t` of the way from a to b: numbers and colours (in
// the premultiplied form the shader mixes them in) are mixed; anything else
// (a string, a list of numbers the shader does not mix) stays the lower one.
function blend(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (a instanceof Color && b instanceof Color) {
    const mix = (x, y) => x + (y - x) * t;
    return new Color(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b), mix(a.a, b.a));
  }
  return a;
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
