// The drawn model: everything the map draws, as geometry (qa/drawn/README.md,
// issue #42).
//
// The page is a style plus data plus tiles, and a style is expressions. So
// the model builds the page's own style for a theme (style.mjs, which calls
// the page's layer functions), reads the build's output, evaluates the style
// at a zoom, and projects the result to screen px -- no browser, no
// screenshot, every zoom.
//
// What it gives, at a zoom z:
//   lines    every line layer's features, as polylines in world px at z,
//            with the width, offset, dash, colour and opacity drawn;
//   marks    every stop and station mark, every sign: a circle's centre and
//            radius, or an icon's box and rotation;
//   labels   every one of our label boxes, measured from the glyph files,
//            at each anchor the style lets it take;
//   areas    FlexRide zones and the basemap's fills (frame() adds tiles).
// A frame() clips that to a phone's screen and adds the basemap's streets,
// buildings and water from OpenFreeMap's tiles, tile by tile.
//
// World px at zoom z are screen px at zoom z (mercator.mjs), so a gap or a
// width measured here is what a phone shows. Nothing here names a line,
// station, colour or place: layers, filters, widths, colours, anchors and
// fonts are the style's; routes, stops and names are the build's.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { hasGlyphs, layout as layoutText } from './glyphs.mjs';
import { icons } from './icons.mjs';
import { css, filterOf, inZoom, property, setState } from './expressions.mjs';
import { bbox, clipLine, tileAt, tileSpan, toWorld } from './mercator.mjs';
import { Tiles, geometry, vectorSources } from './tiles.mjs';
import { drawnWidth, offsetParts } from './strokes.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

// The zooms the model describes: whole and half steps from 9 to 17.
export const ZOOMS = Array.from({ length: 17 }, (_, i) => 9 + i / 2);

// The build files the page draws from are the page's own list (network.js,
// DATA_SOURCES), read through style.mjs: the model keeps no copy, so a map
// with fewer sources (main) or more (a branch) is read as it is. A caller
// that fetches a deployed build's data asks for this list first.
const sourcesCache = new Map();
export async function pageSources(root = ROOT) {
  const key = path.resolve(root);
  if (!sourcesCache.has(key)) {
    const { stdout } = await run(process.execPath, [path.join(HERE, 'style.mjs'), '--sources', '--root', key], { cwd: key });
    sourcesCache.set(key, JSON.parse(stdout));
  }
  return sourcesCache.get(key);
}

// GeoJSON sources the page fills in the browser, not from the build. The model
// cannot draw them from data, so they are named here with the reason, and any
// other source the page draws that the model does not load fails openModel:
// a missing source must be loud, not a layer the drift test never asks about.
export const RUNTIME_ONLY = {
  'rail-edge-letters': 'placed by edgeletters.js in the browser after each move; not yet modelled',
  selection: 'the route a rider has open',
  vehicles: 'Live positions',
};

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// The page's style for one theme, through the page's own code (style.mjs).
// `root` is the site whose public/js is read: a checkout, or a frozen build
// (qa/recall); style.mjs itself is always this folder's. `metaFile` points
// style.mjs at a meta.json other than the root's own.
export async function buildStyle(root = ROOT, theme = 'dark', metaFile = null, servedFile = null) {
  const args = [path.join(HERE, 'style.mjs'), '--theme', theme, '--root', path.resolve(root)];
  if (metaFile) args.push('--meta', metaFile);
  if (servedFile) args.push('--served', servedFile);
  const { stdout } = await run(process.execPath, args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

// A feature's properties, with the geometry type the style's filters read
// (`['geometry-type']`).
function featureAt(source, index, feature) {
  const type = feature.geometry.type === 'Point' ? 1 : /Polygon/.test(feature.geometry.type) ? 3 : 2;
  return { source, index, properties: { ...feature.properties, $type: type }, feature };
}

function parts(feature) {
  const g = feature.geometry;
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  if (g.type === 'Point') return [[g.coordinates]];
  return [];
}

export async function openModel({ root = ROOT, theme = 'dark', tileCache = true, data: given = null, meta = null } = {}) {
  // A caller with a deployed build's data passes it in; then nothing here is
  // read from a checkout's public/data. meta is the build's meta.json (rail
  // colours), and only style.mjs reads it, so it goes through a temp file.
  let metaFile = null;
  let metaDir = null;
  if (meta) {
    metaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawn-meta-'));
    metaFile = path.join(metaDir, 'meta.json');
    fs.writeFileSync(metaFile, JSON.stringify(meta));
  }
  // The names of the served stations, which the page hands to the basemap's
  // labels (main.js) so a place with a station's name is left to the station.
  let servedFile = null;
  try {
    const stations = given?.stations ?? readJSON(path.join(root, 'public', 'data', 'stations.geojson'));
    const labels = stations.features.filter((f) => f.properties?.served && f.properties.label).map((f) => f.properties.label);
    metaDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'drawn-meta-'));
    servedFile = path.join(metaDir, 'served.json');
    fs.writeFileSync(servedFile, JSON.stringify(labels));
  } catch { /* no stations to read: every place is named, as before */ }
  const style = await buildStyle(root, theme, metaFile, servedFile);
  if (metaDir) fs.rmSync(metaDir, { recursive: true, force: true });
  setState(style.state);
  // The build files to read are the page's own list. Every GeoJSON source the
  // style draws from must be one of them or be runtime-only.
  const SOURCES = style.metadata?.['rtd:data-sources'];
  if (!Array.isArray(SOURCES)) throw new Error('openModel: the page does not export DATA_SOURCES (network.js)');
  const notLoaded = Object.entries(style.sources)
    .filter(([name, s]) => s.type === 'geojson' && !SOURCES.includes(name) && !(name in RUNTIME_ONLY))
    .map(([name]) => name);
  if (notLoaded.length) {
    throw new Error(`openModel: the page draws from ${notLoaded.join(', ')}, which is neither in its DATA_SOURCES nor runtime-only (qa/drawn/model.mjs RUNTIME_ONLY)`);
  }
  const data = {};
  for (const name of SOURCES) {
    if (!given) {
      data[name] = readJSON(path.join(root, 'public', 'data', `${name}.geojson`));
    } else if (given[name]) {
      data[name] = given[name];
    } else {
      throw new Error(`openModel: no data given for "${name}"`);
    }
  }
  const imageSizes = await icons(theme, root);

  const sourceFor = (layer) => {
    if (!(layer.source in style.sources)) return null;
    const source = style.sources[layer.source];
    if (source.type !== 'geojson') return null;
    return data[layer.source] ?? null;
  };

  const features = {};
  for (const name of SOURCES) features[name] = data[name].features.map((f, i) => featureAt(name, i, f));

  // Project a feature's coordinates to world px at z, once per feature per
  // zoom whatever number of layers read it.
  const projected = new Map();
  const project = (x, z) => {
    const key = `${x.source}:${x.index}`;
    let hit = projected.get(key);
    if (hit && hit.z === z) return hit.parts;
    const out = parts(x.feature).map((part) => part.map((c) => toWorld(c, z)));
    projected.set(key, { z, parts: out });
    return out;
  };

  function linesAt(z) {
    const out = [];
    for (const layer of style.layers) {
      if (layer.type !== 'line') continue;
      const list = sourceFor(layer);
      if (!list || !inZoom(layer, z)) continue;
      const f = filterOf(layer);
      for (const x of features[layer.source]) {
        if (f && !f(z, x.properties)) continue;
        const width = property(layer, 'line-width', 'paint', z, x.properties, 1);
        if (!(width > 0)) continue;
        const opacity = property(layer, 'line-opacity', 'paint', z, x.properties, 1);
        const offset = property(layer, 'line-offset', 'paint', z, x.properties, 0);
        const gapWidth = property(layer, 'line-gap-width', 'paint', z, x.properties, 0);
        const parts = project(x, z);
        out.push({
          layer: layer.id,
          source: layer.source,
          index: x.index,
          route: x.properties.route,
          kind: x.properties.kind,
          mode: x.properties.mode,
          tier: x.properties.tier,
          slot: x.properties.slot ?? 0,
          properties: x.properties,
          parts,
          // The line as drawn (strokes.mjs): its centreline moved by its
          // offset the way MapLibre moves it, and the full width it is drawn
          // and hit-tested at.
          drawn: offset ? offsetParts(parts, offset, z) : parts,
          width,
          gapWidth,
          drawnWidth: drawnWidth(width, gapWidth),
          offset,
          dash: property(layer, 'line-dasharray', 'paint', z, x.properties, null),
          color: css(property(layer, 'line-color', 'paint', z, x.properties, '#000000')),
          opacity,
          cap: property(layer, 'line-cap', 'layout', z, x.properties, 'butt'),
          join: property(layer, 'line-join', 'layout', z, x.properties, 'miter'),
        });
      }
    }
    return out;
  }

  // `only` names the sources to read; `anyZoom` ignores a layer's zoom range
  // (places(), below).
  function areasAt(z, { only = null, anyZoom = false } = {}) {
    const out = [];
    for (const layer of style.layers) {
      if (layer.type !== 'fill') continue;
      if (only && !only.includes(layer.source)) continue;
      const list = sourceFor(layer);
      if (!list || !(anyZoom || inZoom(layer, z))) continue;
      const f = filterOf(layer);
      for (const x of features[layer.source]) {
        if (f && !f(z, x.properties)) continue;
        out.push({
          layer: layer.id,
          source: layer.source,
          index: x.index,
          name: x.properties.name,
          parts: project(x, z),
          color: css(property(layer, 'fill-color', 'paint', z, x.properties, null)),
          opacity: property(layer, 'fill-opacity', 'paint', z, x.properties, 1),
        });
      }
    }
    return out;
  }

  // A point as screen px, or null when neither of its coordinates is finite.
  const point = (x, z) => {
    const p = x.feature.geometry.coordinates;
    return Array.isArray(p[0]) ? null : toWorld(p, z);
  };

  // A padding property, as one number. MapLibre's style spec resolves
  // padding to a four-sided value; placement uses it as a distance.
  const pad = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Array.isArray(v?.values) ? Math.max(...v.values) : 2);

  function markBox(at, w, h, rot, anchor, offset, padding) {
    // The four corners of the icon, anchored and turned (clockwise degrees),
    // then their axis-aligned box. The anchor point itself sits at `at` plus
    // the icon's offset (which MapLibre scales by icon-size; the caller does).
    // The collision box grows by icon-padding on every side, as
    // collision_feature.ts does.
    const [px, py] = at;
    const ax = anchor.includes('left') ? 0 : anchor.includes('right') ? -w : -w / 2;
    const ay = anchor.includes('top') ? 0 : anchor.includes('bottom') ? -h : -h / 2;
    const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
    const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => [
      px + offset[0] + ax + x * c - y * s,
      py + offset[1] + ay + y * c + x * s,
    ]);
    const box = bbox(corners);
    return [box[0] - padding * (anchor.includes('right') ? 2 : anchor.includes('left') ? 0 : 1), box[1] - padding * (anchor.includes('bottom') ? 2 : anchor.includes('top') ? 0 : 1), box[2] + padding * (anchor.includes('left') ? 2 : anchor.includes('right') ? 0 : 1), box[3] + padding * (anchor.includes('top') ? 2 : anchor.includes('bottom') ? 0 : 1)];
  }

  function marksAt(z, { only = null, anyZoom = false } = {}) {
    const out = [];
    for (const layer of style.layers) {
      if (only && !only.includes(layer.source)) continue;
      const list = sourceFor(layer);
      if (!list || !(anyZoom || inZoom(layer, z))) continue;
      const f = filterOf(layer);
      for (const x of features[layer.source]) {
        if (f && !f(z, x.properties)) continue;
        const at = point(x, z);
        if (!at) continue;
        const props = x.properties;
        if (layer.type === 'circle') {
          const radius = property(layer, 'circle-radius', 'paint', z, props, 0);
          const stroke = property(layer, 'circle-stroke-width', 'paint', z, props, 0);
          out.push({
            kind: 'circle',
            layer: layer.id,
            source: layer.source,
            index: x.index,
            properties: props,
            at,
            radius,
            stroke,
            strokeColor: css(property(layer, 'circle-stroke-color', 'paint', z, props, null)),
            color: css(property(layer, 'circle-color', 'paint', z, props, null)),
            opacity: property(layer, 'circle-opacity', 'paint', z, props, 1),
            strokeOpacity: property(layer, 'circle-stroke-opacity', 'paint', z, props, 1),
            box: [at[0] - radius - stroke, at[1] - radius - stroke, at[0] + radius + stroke, at[1] + radius + stroke],
          });
          continue;
        }
        if (layer.type !== 'symbol') continue;
        if (layer.layout?.['icon-image'] === undefined) continue;
        const resolved = property(layer, 'icon-image', 'layout', z, props, null);
        const image = resolved?.name ?? (typeof resolved === 'string' ? resolved : null);
        if (!image) continue;
        const size = property(layer, 'icon-size', 'layout', z, props, 1);
        // The collision box is built at the bucket's layout size (icon-size
        // at the next whole zoom), like a label's.
        const boxSize = property(layer, 'icon-size', 'layout', Math.floor(z) + 1, props, size);
        // icon-rotate is clockwise degrees on screen; the station marks carry
        // the track's bearing, which is what turns a capsule across it.
        const rot = property(layer, 'icon-rotate', 'layout', z, props, 0);
        const anchor = property(layer, 'icon-anchor', 'layout', z, props, 'center');
        const off = property(layer, 'icon-offset', 'layout', z, props, [0, 0]);
        const padding = pad(property(layer, 'icon-padding', 'layout', z, props, 2));
        const img = imageSizes.size(image);
        const w = img.width * boxSize, h = img.height * boxSize;
        const offset = [(off?.[0] ?? 0) * boxSize, (off?.[1] ?? 0) * boxSize];
        out.push({
          kind: 'icon',
          layer: layer.id,
          source: layer.source,
          index: x.index,
          properties: props,
          image,
          at,
          size,
          boxSize,
          w,
          h,
          rot,
          anchor,
          offset,
          opacity: property(layer, 'icon-opacity', 'paint', z, props, 1),
          box: markBox(at, w, h, rot, anchor, offset, padding),
          // For the placement replay (place.mjs).
          sortKey: property(layer, 'symbol-sort-key', 'layout', z, props, 0),
          allowOverlap: property(layer, 'icon-allow-overlap', 'layout', z, props, false) === true,
          ignorePlacement: property(layer, 'icon-ignore-placement', 'layout', z, props, false) === true,
        });
      }
    }
    return out;
  }

  // The collision box of a text block at one anchor: [x0, y0, x1, y1]
  // around `at`. MapLibre's offset y grows down, a bottom/top anchor shifts
  // it by the baseline (variable_text_anchor.ts), and text-padding grows the
  // box away from the text: twice the padding on the far sides, once on a
  // centred side, none where the text meets its point. That is what
  // MapLibre's placement leaves in the collision boxes the browser reports,
  // measured against the page (qa/checks/drawn.spec.mjs).
  function textBox(at, block, anchor, offsetPx, padding) {
    const { width: w, height: h } = block;
    const ha = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5;
    const va = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
    const x = at[0] + offsetPx[0] - ha * w;
    const y = at[1] + offsetPx[1] - va * h;
    return [x - 2 * padding * ha, y - 2 * padding * va, x + w + 2 * padding * (1 - ha), y + h + 2 * padding * (1 - va)];
  }

  const BASELINE = 7; // font units; the baseline sits below the em box top

  // A frozen build vendors only the fonts its own labels use (qa/recall/
  // fixtures); the basemap's names are set in others of the same family.
  // Measure those from this checkout's glyph files.
  const fontRoot = (font) => (hasGlyphs(root, font) ? root : hasGlyphs(ROOT, font) ? ROOT : root);

  // One text label of a layer: its block, and a collision box (and the ink
  // box of the text as drawn) at each anchor the layer lets it take. `x` is
  // `{ index, source, properties }`; `at` is the label's point in world px.
  function labelEntry(layer, x, at, z) {
    // Read per feature: a layer can place each feature its own way (a
    // rail letter's text-offset puts it on its own line, #56).
    const variable = property(layer, 'text-variable-anchor-offset', 'layout', z, x.properties, null);
    const anchor = property(layer, 'text-anchor', 'layout', z, x.properties, 'center');
    const offset = property(layer, 'text-offset', 'layout', z, x.properties, [0, 0]);
    const padding = pad(property(layer, 'text-padding', 'layout', z, x.properties, 2));
    // Collision boxes are built at the bucket's layout size (the text size
    // at the next whole zoom, symbol_layout.ts `sizes.layoutTextSize`), so
    // they are a touch larger than the ink below it.
    const boxSize = property(layer, 'text-size', 'layout', Math.floor(z) + 1, x.properties, 16);
    const raw = property(layer, 'text-field', 'layout', z, x.properties, null);
    let value = typeof raw === 'string' ? raw : raw?.toString?.();
    if (!value) return null;
    if (property(layer, 'text-transform', 'layout', z, x.properties, 'none') === 'uppercase') value = value.toUpperCase();
    const size = property(layer, 'text-size', 'layout', z, x.properties, 16);
    const font = property(layer, 'text-font', 'layout', z, x.properties, ['Overpass Regular'])[0];
    const lineHeight = property(layer, 'text-line-height', 'layout', z, x.properties, 1.2);
    const letterSpacing = property(layer, 'text-letter-spacing', 'layout', z, x.properties, 0);
    // A name set along a line is never wrapped (symbol_layout.ts).
    const maxWidth = layer.layout?.['symbol-placement'] === 'line' ? 0 : property(layer, 'text-max-width', 'layout', z, x.properties, 10);
    const block = layoutText(fontRoot(font), value, { fontstack: font, size, letterSpacing, lineHeight, maxWidth });
    const box = layoutText(fontRoot(font), value, { fontstack: font, size: boxSize, letterSpacing, lineHeight, maxWidth });
    const baseline = (BASELINE / 24) * boxSize;
    const inkBaseline = (BASELINE / 24) * size;
    const candidates = [];
    const anchors = Array.isArray(variable) ? variable : variable?.values;
    if (Array.isArray(anchors) && anchors.length) {
      for (let i = 0; i < anchors.length; i += 2) {
        const a = anchors[i];
        const [dx, dy] = anchors[i + 1];
        const shift = a.startsWith('top') ? -baseline : a.startsWith('bottom') ? baseline : 0;
        const inkShift = a.startsWith('top') ? -inkBaseline : a.startsWith('bottom') ? inkBaseline : 0;
        candidates.push({
          anchor: a,
          offset: [dx, dy],
          box: textBox(at, box, a, [dx * boxSize, dy * boxSize + shift], padding),
          ink: textBox(at, block, a, [dx * size, dy * size + inkShift], 0),
        });
      }
    } else {
      const shift = anchor.startsWith('top') ? -baseline : anchor.startsWith('bottom') ? baseline : 0;
      const inkShift = anchor.startsWith('top') ? -inkBaseline : anchor.startsWith('bottom') ? inkBaseline : 0;
      candidates.push({
        anchor,
        offset: [offset[0], offset[1]],
        box: textBox(at, box, anchor, [offset[0] * boxSize, offset[1] * boxSize + shift], padding),
        ink: textBox(at, block, anchor, [offset[0] * size, offset[1] * size + inkShift], 0),
      });
    }
    return {
      kind: 'text',
      layer: layer.id,
      source: x.source ?? layer.source,
      index: x.index,
      properties: x.properties,
      at,
      text: value,
      size,
      font,
      block,
      box,
      candidates,
      opacity: property(layer, 'text-opacity', 'paint', z, x.properties, 1),
      color: css(property(layer, 'text-color', 'paint', z, x.properties, null)),
      // What the placement replay (place.mjs) needs: the order within a
      // layer and whether the label takes room and gives way.
      sortKey: property(layer, 'symbol-sort-key', 'layout', z, x.properties, 0),
      allowOverlap: property(layer, 'text-allow-overlap', 'layout', z, x.properties, false) === true,
      ignorePlacement: property(layer, 'text-ignore-placement', 'layout', z, x.properties, false) === true,
      haloWidth: property(layer, 'text-halo-width', 'paint', z, x.properties, 0),
    };
  }

  function labelsAt(z) {
    const out = [];
    for (const layer of style.layers) {
      const list = sourceFor(layer);
      if (!list || !inZoom(layer, z)) continue;
      if (layer.type !== 'symbol' || layer.layout?.['text-field'] === undefined) continue;
      const f = filterOf(layer);
      for (const x of features[layer.source]) {
        if (f && !f(z, x.properties)) continue;
        const at = point(x, z);
        if (!at) continue;
        const entry = labelEntry(layer, x, at, z);
        if (entry) out.push(entry);
      }
    }
    return out;
  }

  const zoomCache = new Map();

  function zoom(z) {
    if (zoomCache.has(z)) return zoomCache.get(z);
    const model = { z, lines: linesAt(z), marks: marksAt(z), labels: labelsAt(z), areas: areasAt(z) };
    if (zoomCache.size > 24) zoomCache.clear();
    zoomCache.set(z, model);
    return model;
  }

  // Where things are, whatever the zoom: the marks and fills of these sources
  // as the style draws them once their layers are on, at the positions they
  // have at z. A check that asks what a line end is at (routes.mjs) must not
  // depend on whether the layer is already drawn at the zoom it looks at
  // (park-and-ride marks start at z12.5, halls at z13).
  function places(z, sources) {
    return { marks: marksAt(z, { only: sources, anyZoom: true }), areas: areasAt(z, { only: sources, anyZoom: true }) };
  }

  // The keep-out layers (basemap.js): symbols that take up room and draw
  // nothing, placed along a line every few px. Their points are not features
  // the model can list, so each line feature is given as a band: the line's
  // parts and the half side of the invisible square set along it. The
  // placement replay (place.mjs) treats a band as the whole strip the squares
  // cover, which they do at the spacing the style gives them.
  const bandCache = new Map();
  function linePlaced(z) {
    if (bandCache.has(z)) return bandCache.get(z);
    const out = [];
    for (const layer of style.layers) {
      if (layer.type !== 'symbol' || layer.layout?.['icon-image'] === undefined) continue;
      if (layer.layout?.['symbol-placement'] !== 'line') continue;
      const list = sourceFor(layer);
      if (!list || !inZoom(layer, z)) continue;
      const f = filterOf(layer);
      for (const x of features[layer.source]) {
        if (x.feature.geometry.type !== 'LineString' && x.feature.geometry.type !== 'MultiLineString') continue;
        if (f && !f(z, x.properties)) continue;
        const resolved = property(layer, 'icon-image', 'layout', z, x.properties, null);
        const image = resolved?.name ?? (typeof resolved === 'string' ? resolved : null);
        if (image !== 'clear') continue;
        const boxSize = property(layer, 'icon-size', 'layout', Math.floor(z) + 1, x.properties, 1);
        const img = imageSizes.size(image);
        const padding = pad(property(layer, 'icon-padding', 'layout', z, x.properties, 2));
        out.push({
          kind: 'band',
          layer: layer.id,
          source: layer.source,
          index: x.index,
          properties: x.properties,
          parts: project(x, z),
          half: (img.width * boxSize) / 2 + padding,
          allowOverlap: property(layer, 'icon-allow-overlap', 'layout', z, x.properties, false) === true,
          ignorePlacement: property(layer, 'icon-ignore-placement', 'layout', z, x.properties, false) === true,
          sortKey: 0,
        });
      }
    }
    if (bandCache.size > 24) bandCache.clear();
    bandCache.set(z, out);
    return out;
  }

  // --- the basemap, from tiles -------------------------------------------

  let tiles = null;
  const tileSource = () => {
    if (!tileCache) return null;
    if (!tiles) {
      const source = vectorSources(style)[0];
      if (!source) return null;
      tiles = new Tiles({ root, source });
    }
    return tiles;
  };

  // The basemap's line and fill layers, by source-layer, so a tile is read
  // once for all of them.
  const basemapLayers = style.layers.filter((l) => (l.type === 'line' || l.type === 'fill') && style.sources[l.source]?.type === 'vector' && l['source-layer']);

  async function basemapAt(z, rect, size) {
    const t = tileSource();
    if (!t) return { streets: [], fills: [], tiles: 0 };
    const tz = Math.min(Math.floor(z), await t.maxzoom());
    const cover = Tiles.cover(rect, z, tz, tileSpan(tz, z) / 2);
    const streets = [], fills = [];
    const seen = new Set();
    for (const [tx, ty] of cover) {
      const tile = await t.tile(tz, tx, ty);
      if (!tile) continue;
      seen.add(`${tz}/${tx}/${ty}`);
      for (const layer of basemapLayers) {
        if (!inZoom(layer, z)) continue;
        const vtLayer = tile.layers[layer['source-layer']];
        if (!vtLayer) continue;
        const f = filterOf(layer);
        for (let i = 0; i < vtLayer.length; i++) {
          const feature = vtLayer.feature(i);
          const properties = { ...feature.properties, $type: feature.type };
          if (f && !f(z, properties)) continue;
          const rings = geometry(feature, tz, z, tx, ty);
          const parts2 = [];
          for (const ring of rings) {
            for (const run of clipLine(ring, rect)) parts2.push(run.map(([x, y]) => [x - rect[0], y - rect[1]]));
          }
          if (!parts2.length && layer.type === 'fill') {
            // A polygon wholly around the view: clip its ring to the view.
            for (const ring of rings) if (ring.length > 2) parts2.push(ring.map(([x, y]) => [x - rect[0], y - rect[1]]));
          }
          if (!parts2.length) continue;
          if (layer.type === 'line') {
            streets.push({
              layer: layer.id,
              kind: properties.class ?? properties.subclass ?? '',
              name: properties.name ?? null,
              ref: properties.ref ?? null,
              parts: parts2,
              width: property(layer, 'line-width', 'paint', z, properties, 0),
              color: css(property(layer, 'line-color', 'paint', z, properties, null)),
              opacity: property(layer, 'line-opacity', 'paint', z, properties, 1),
            });
          } else {
            fills.push({
              layer: layer.id,
              kind: properties.class ?? '',
              parts: parts2,
              color: css(property(layer, 'fill-color', 'paint', z, properties, null)),
              opacity: property(layer, 'fill-opacity', 'paint', z, properties, 1),
            });
          }
        }
      }
    }
    return { streets, fills, tiles: seen.size };
  }

  // --- the basemap's names (qa/rules LN05, LN06, LN07) -----------------------
  //
  // The basemap's symbol layers (places, water, landmarks, airports, street
  // names, highway shields) as labels, for every tile that holds network at
  // this zoom. A point name is a `text` entry like the page's own, with a box
  // at each anchor the layer allows; a street name or shield is a `line-text`
  // entry: the stretch of line it is set along (clipped to its tile, as the
  // page's tiles clip it), the spacing, offset and bend limit the layer gives,
  // and, for a shield, its picture. The placement replay (place.mjs) lays them
  // along the line.
  const nameLayers = style.layers.filter((l) => l.type === 'symbol' && style.sources[l.source]?.type === 'vector' && l['source-layer'] && l.layout?.['text-field'] !== undefined);
  const namesCache = new Map();

  async function namesAt(z) {
    if (namesCache.has(z)) return namesCache.get(z);
    const t = tileSource();
    if (!t) return [];
    const tz = Math.min(Math.floor(z), await t.maxzoom());
    const span = tileSpan(tz, z);
    // The tiles the network crosses.
    const cells = new Set();
    const mark = (x, y) => cells.add(`${Math.floor(x / span)},${Math.floor(y / span)}`);
    for (const line of zoom(z).lines) {
      if (line.source === 'flexride') continue;
      for (const part of line.parts) {
        for (let i = 0; i < part.length; i++) {
          mark(part[i][0], part[i][1]);
          if (!i) continue;
          const n = Math.ceil(Math.hypot(part[i][0] - part[i - 1][0], part[i][1] - part[i - 1][1]) / (span / 2));
          for (let k = 1; k < n; k++) mark(part[i - 1][0] + ((part[i][0] - part[i - 1][0]) * k) / n, part[i - 1][1] + ((part[i][1] - part[i - 1][1]) * k) / n);
        }
      }
    }
    const wanted = [...cells].map((c) => c.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [];
    const seen = new Set();
    for (let from = 0; from < wanted.length; from += 12) {
      const batch = await Promise.all(wanted.slice(from, from + 12).map(async ([tx, ty]) => [tx, ty, await t.tile(tz, tx, ty)]));
      for (const [tx, ty, tile] of batch) {
        if (!tile) continue;
        const rect = [tx * span, ty * span, (tx + 1) * span, (ty + 1) * span];
        for (const layer of nameLayers) {
          if (!inZoom(layer, z)) continue;
          const vt = tile.layers[layer['source-layer']];
          if (!vt) continue;
          const f = filterOf(layer);
          const placement = layer.layout?.['symbol-placement'] ?? 'point';
          for (let i = 0; i < vt.length; i++) {
            const feature = vt.feature(i);
            const properties = { ...feature.properties, $type: feature.type };
            if (f && !f(z, properties)) continue;
            const x = { index: `${tz}/${tx}/${ty}:${i}`, source: layer.source, properties };
            const rings = geometry(feature, tz, z, tx, ty);
            if (placement !== 'line') {
              const at = rings[0]?.[0];
              if (!at) continue;
              const entry = labelEntry(layer, x, at, z);
              if (!entry) continue;
              entry.sourceLayer = layer['source-layer'];
              const key = `${layer.id}|${entry.text}|${Math.round(at[0])}|${Math.round(at[1])}`;
              if (seen.has(key)) continue;
              seen.add(key);
              out.push(entry);
              continue;
            }
            for (const ring of rings) {
              for (const run of clipLine(ring, rect)) {
                const entry = labelEntry(layer, x, run[0], z);
                if (!entry) continue;
                const edge = (p) => Math.abs(p[0] - rect[0]) < 1e-6 || Math.abs(p[0] - rect[2]) < 1e-6 || Math.abs(p[1] - rect[1]) < 1e-6 || Math.abs(p[1] - rect[3]) < 1e-6;
                const resolved = layer.layout?.['icon-image'] !== undefined ? property(layer, 'icon-image', 'layout', z, properties, null) : null;
                const image = resolved?.name ?? (typeof resolved === 'string' ? resolved : null);
                const img = image ? imageSizes.size(image) : null;
                const iconSize = image ? property(layer, 'icon-size', 'layout', Math.floor(z) + 1, properties, 1) : 1;
                out.push({
                  ...entry,
                  kind: 'line-text',
                  sourceLayer: layer['source-layer'],
                  candidates: [],
                  at: run[0],
                  parts: [run],
                  continued: edge(run[0]),
                  spacing: property(layer, 'symbol-spacing', 'layout', z, properties, 250),
                  textOffset: property(layer, 'text-offset', 'layout', z, properties, [0, 0]),
                  maxAngle: property(layer, 'text-max-angle', 'layout', z, properties, 45),
                  padding: pad(property(layer, 'text-padding', 'layout', z, properties, 2)),
                  icon: img ? { image, w: img.width * iconSize, h: img.height * iconSize, padding: pad(property(layer, 'icon-padding', 'layout', z, properties, 2)) } : null,
                });
              }
            }
          }
        }
      }
    }
    if (namesCache.size > 6) namesCache.clear();
    namesCache.set(z, out);
    return out;
  }

  // --- a frame: the model on a screen ------------------------------------

  async function frame({ zoom: z, center, width, height, basemap = false }) {
    const [cx, cy] = toWorld(center, z);
    const rect = [cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2];
    const screen = ([x, y]) => [x - rect[0], y - rect[1]];
    const inside = ([x, y]) => x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
    const m = zoom(z);

    const lines = [];
    for (const line of m.lines) {
      const runs = [];
      for (const part of line.parts) for (const run of clipLine(part, rect)) runs.push(run.map(screen));
      const drawn = [];
      for (const part of line.drawn) for (const run of clipLine(part, rect)) drawn.push(run.map(screen));
      if (runs.length || drawn.length) lines.push({ ...line, parts: runs, drawn });
    }
    // A mark is kept when its anchor is on the screen, even if its box sits
    // mostly off it (a tick drawn beside the point), or when its box reaches
    // into the screen from an anchor just outside.
    const marks = m.marks
      .filter((k) => inside(k.at) || (k.box[2] > rect[0] && k.box[0] < rect[2] && k.box[3] > rect[1] && k.box[1] < rect[3]))
      .map((k) => ({ ...k, at: screen(k.at), box: [k.box[0] - rect[0], k.box[1] - rect[1], k.box[2] - rect[0], k.box[3] - rect[1]] }));
    const labels = [];
    for (const label of m.labels) {
      const candidates = label.candidates.map((c) => ({ ...c, box: [c.box[0] - rect[0], c.box[1] - rect[1], c.box[2] - rect[0], c.box[3] - rect[1]] }))
        .filter((c) => c.box[2] > 0 && c.box[0] < width && c.box[3] > 0 && c.box[1] < height);
      if (candidates.length) labels.push({ ...label, at: screen(label.at), candidates });
    }
    const areas = m.areas.map((a) => ({ ...a, parts: a.parts.map((part) => part.map(screen)) })).filter((a) => a.parts.length);
    const base = basemap ? await basemapAt(z, rect, { width, height }) : null;
    return { zoom: z, rect, width, height, lines, marks, labels, areas, basemap: base };
  }

  // The whole district at each zoom, as geometry. Tile-free: the basemap is
  // read by frame() tile by tile, where a screen bounds the work.
  async function* district({ zooms = ZOOMS } = {}) {
    for (const z of zooms) yield zoom(z);
  }

  return { root, theme, style, data, zoom, places, frame, district, linePlaced, names: namesAt, ZOOMS, icons: imageSizes };
}
