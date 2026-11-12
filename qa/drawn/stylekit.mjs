// A style read as a table of looks (qa/drawn/styles.mjs and zooms.mjs use it).
//
// The geometry detectors measure what the page draws on a screen. The style
// detectors ask something else: what does each layer look like at each zoom,
// for each kind of feature it draws? A layer's look depends on a few feature
// properties (a street's class, a rail line's headway), so the features are
// grouped by what the layer reads from them, and one representative of each
// group stands for the rest. The values come from the style-spec's own
// evaluator (expressions.mjs), at the zoom asked, exactly as the model's
// `zoom(z)` gets them, but without projecting or clipping a single vertex.
//
// Nothing here names a layer, class, route or colour. A caller passes the
// style JSON and the build's GeoJSON by source name; the tests pass made-up
// ones.

import { css, filterOf, inZoom, property, setState } from './expressions.mjs';
import { parse } from './colours.mjs';

// The zooms a layer's filter is tried at to decide whether a feature is ever
// drawn by it (a filter sees the whole zoom, shared.js).
const FILTER_ZOOMS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
// A property with more distinct values than this is an identifier or a
// measurement (a name, a list of routes, a length), not a class.
const MANY = 60;

// Every feature property an expression reads.
export function keysOf(layer) {
  const keys = new Set();
  const walk = (e) => {
    if (!Array.isArray(e)) return;
    if ((e[0] === 'get' || e[0] === 'has') && typeof e[1] === 'string') keys.add(e[1]);
    for (const x of e) walk(x);
  };
  walk(layer.filter);
  for (const kind of ['paint', 'layout']) for (const v of Object.values(layer[kind] ?? {})) walk(v);
  return keys;
}

// The opacity properties a layer type has, in the order they matter.
const OPACITY = { line: ['line-opacity'], fill: ['fill-opacity'], circle: ['circle-opacity', 'circle-stroke-opacity'], symbol: ['icon-opacity', 'text-opacity'], background: ['background-opacity'] };

const featureType = (g) => (g?.type === 'Point' ? 1 : /Polygon/.test(g?.type ?? '') ? 3 : 2);

export function styleView({ style, data }) {
  setState(style.state ?? {});
  const layers = style.layers;
  const byId = new Map(layers.map((l, i) => [l.id, { ...l, index: i }]));
  const cache = new Map();
  const filters = new Map();
  const filterFor = (layer) => {
    if (!filters.has(layer.id)) filters.set(layer.id, layer.filter ? filterOf(layer) : null);
    return filters.get(layer.id);
  };

  const layerById = (id) => byId.get(id) ?? null;
  const sourceOf = (layer) => (style.sources?.[layer.source]?.type === 'geojson' || data[layer.source] ? data[layer.source] ?? null : null);

  // A keep-out layer takes up room and draws nothing (basemap.js).
  const draws = (layer) => layer.layout?.['icon-image'] !== 'clear' && layer.layout?.visibility !== 'none';

  function reps(layer) {
    if (cache.has(layer.id)) return cache.get(layer.id);
    const source = sourceOf(layer);
    const out = [];
    if (source && draws(layer)) {
      const filter = filterFor(layer);
      const keys = [...new Set([...keysOf(layer), 'cls', 'tier', 'mode', 'kind'])];
      // Which keys are classes: those with few distinct values in this source.
      const distinct = new Map(keys.map((k) => [k, new Set()]));
      for (const f of source.features) for (const k of keys) { const set = distinct.get(k); if (set.size <= MANY) set.add(f.properties?.[k]); }
      const classKeys = keys.filter((k) => distinct.get(k).size <= MANY);
      const bucketKeys = keys.filter((k) => distinct.get(k).size > MANY && [...distinct.get(k)].every((v) => typeof v === 'number' || v == null));
      const seen = new Map();
      for (const f of source.features) {
        const props = { ...f.properties, $type: featureType(f.geometry) };
        const sig = JSON.stringify([...classKeys.map((k) => f.properties?.[k]), ...bucketKeys.map((k) => (typeof f.properties?.[k] === 'number' ? Math.floor(Math.log2(Math.abs(f.properties[k]) + 1) * 2) : null))]);
        let rep = seen.get(sig);
        if (!rep) {
          // Drawn at some zoom at all?
          const zooms = layer.filter ? FILTER_ZOOMS.filter((z) => filter(z, props)) : FILTER_ZOOMS;
          rep = { props, n: 0, feature: f, filterZooms: zooms, layer: layer.id };
          seen.set(sig, rep);
          if (zooms.length) out.push(rep);
        }
        rep.n++;
      }
    }
    cache.set(layer.id, out);
    return out;
  }

  // Does the feature `rep` pass the layer's filter at zoom z (whole-zoom, as
  // MapLibre reads a filter)?
  const passes = (layer, rep, z) => !layer.filter || filterFor(layer)(z, rep.props);

  const get = (layer, name, kind, z, props, fallback) => property(layer, name, kind, z, props, fallback);

  // The strongest opacity a representative is drawn at, at zoom z (0 when the
  // layer is out of its zoom range or its filter says no).
  function opacity(layer, rep, z) {
    if (!inZoom(layer, z) || !passes(layer, rep, z)) return 0;
    const names = OPACITY[layer.type] ?? [];
    let best = null;
    for (const n of names) {
      const v = layer.paint?.[n];
      if (v === undefined) continue;
      const o = get(layer, n, 'paint', z, rep.props, 1);
      best = best === null ? o : Math.max(best, o);
    }
    if (best === null) best = 1;
    // A symbol with an icon or text that is empty here is not drawn.
    return best;
  }

  // A colour property as {r,g,b,a} (or null).
  const colour = (layer, name, z, props) => parse(css(get(layer, name, 'paint', z, props, null)));

  // The zoom a layer of this look first has any strength, searched on a grid.
  function firstDrawn(layer, { from = 0, to = 20, step = 0.05, min = 0.02 } = {}) {
    const rs = reps(layer);
    for (let z = from; z <= to + 1e-9; z += step) {
      const zz = Math.round(z * 1000) / 1000;
      if (rs.some((r) => opacity(layer, r, zz) >= min && widthOf(layer, r, zz) > 0)) return zz;
    }
    return null;
  }

  // A line's width, a circle's radius, a symbol's icon size, a fill's 1.
  function widthOf(layer, rep, z) {
    if (layer.type === 'line') return get(layer, 'line-width', 'paint', z, rep.props, 1);
    if (layer.type === 'circle') return get(layer, 'circle-radius', 'paint', z, rep.props, 5);
    if (layer.type === 'symbol') {
      if (layer.layout?.['icon-image'] !== undefined) return get(layer, 'icon-size', 'layout', z, rep.props, 1);
      return get(layer, 'text-size', 'layout', z, rep.props, 16) > 0 ? 1 : 0;
    }
    return 1;
  }

  return { style, data, layers, layerById, reps, opacity, widthOf, colour, get, passes, firstDrawn, draws, sourceOf };
}

// A point on the ground standing for a representative: the first vertex of
// its first feature, as [lon, lat]. Style-wide findings are placed with it so
// a report can link somewhere.
export function placeOf(rep) {
  let g = rep?.feature?.geometry;
  while (g && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0])) g = { coordinates: g.coordinates[Math.floor(g.coordinates.length / 2)] };
  const c = g?.coordinates;
  return Array.isArray(c) && typeof c[0] === 'number' ? [c[0], c[1]] : null;
}
