// The zoomable map's drawings served as tiles (#237; the plan's step 13, #129). Main already cuts
// the sheets into vector tiles when the site is published (scripts/tiles.mjs, #216); the trial
// (#154) still loads whole GeoJSON drawings — five bus drawings (the zoom-15 one alone is 302 KB
// gzipped), two rail drawings and the lettering. This cuts the drawings the same way, with the
// same library, options and buffer, so each drawing's tiles serve its own zoom range and the
// phone only reads what is on screen.
//
// Nothing about the drawings is written here. The zooms come from what the build made: each bus
// drawing is `bus-<zoom>.geojson` beside its route lines, and a drawing at a sheet's own zoom is
// cut one under it, as the sheets are (public/js/sheets/style.js, tileZooms), while one drawn
// between sheets is cut at its own zoom, as the trial's page cut it (zoom/style.js, drawing).
// The rail drawings' zooms come from the bundle's own `ref` values: the drawing at ref R serves
// the whole zooms R-1 up to the last ref's R-1, as the trial's one rail source did.
//
//   node scripts/zoom-tiles.mjs [dir with the drawings] (default public/data/zoom-prototype)
//
// The lettering plan (the bundle's 17 quarter-zoom `frames`) is not cut. The page composes it at
// every camera zoom: a name glides between the two frames either side of the camera and fades when
// it changes side (public/js/zoom/model.js, labelsAt), which tiles cannot express — no tile knows
// what the next frame holds. It stays one small file, like the ground's basemap pack, and its
// sizes are in the report below for #158 to decide with the page.
//
// #157 replaces the trial's drawings with main's own build; this reads whatever drawings are in
// the directory, so that build needs only to write them there.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { SHEETS } from '../public/js/sheets/style.js';
import { cutData } from './tiles.mjs';
import { seamFaults, seamControls, labelKey } from './lib/zoom-seam.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

/** A tile can hold no list (a label's offset, an attachment's frame), so a list goes in as its
 * text the way the sheets do it (style.js, listKey), and this table — written beside the tiles —
 * holds what each text names, for the page to look up. */
export const listsOf = (features) => {
  const lists = {};
  const keep = (key, value) => { if (!Object.hasOwn(lists, key)) lists[key] = value; };
  for (const f of features) {
    // The trial's attached and lettered features carry their attachment beside `properties`,
    // where GeoJSON on the page could read it; tiles carry properties only.
    for (const key of ['attachment', 'labelOffset']) {
      if (f[key] === undefined) continue;
      const text = JSON.stringify(f[key]).replaceAll('[', '').replaceAll(']', '');
      f.properties ??= {};
      f.properties[key] = text;
      keep(text, f[key]);
    }
    for (const [k, v] of Object.entries(f.properties ?? {})) if (Array.isArray(v)) {
      const text = v.flat(Infinity).join(',');
      f.properties[k] = text;
      keep(text, v);
    }
  }
  return lists;
};

/** The drawings in `dir`, and the whole zooms each is cut at, derived from what the build wrote
 * (#154's trial layout; #157 keeps it). Returns [{ name, zooms, features }] or null if the
 * directory holds none. */
export async function zoomDrawings(dir) {
  const drawings = [];
  // The bus drawings: `bus-<zoom>.geojson` and its route lines. One drawn at a sheet's own zoom
  // is that sheet's drawing redrawn, so it is cut one under, as sheets are; one drawn between
  // sheets is cut at its own zoom, as the trial's page cut it client-side.
  const sheetZooms = SHEETS.map((s) => Math.floor(s.zoom));
  const seen = new Map();
  for (const name of ['bus']) {
    for (let z = 0; z <= 24; z++) {
      for (const routes of [false, true]) {
        const file = path.join(dir, `bus-${z}${routes ? '-routes' : ''}.geojson`);
        const data = await readFile(file, 'utf8').then(JSON.parse, () => null);
        if (!data) continue;
        seen.set(`${z}${routes}`, true);
        drawings.push({ name: `zoom-bus-${z}${routes ? '-routes' : ''}`, zooms: [sheetZooms.includes(z) ? z - 1 : z], features: data.features, file });
      }
    }
  }
  if (!seen.size) return null;
  // The rail drawings and what rides them, all refs in one collection each (the trial's one rail
  // source): a drawing at ref R serves the whole zooms from R-1 to the last ref's R-1.
  const bundle = await readFile(path.join(dir, 'trial.json'), 'utf8').then(JSON.parse, () => null);
  if (bundle?.rails?.features?.length) {
    const refs = [...new Set(bundle.rails.features.map((f) => f.properties.ref))].sort((a, b) => a - b);
    const zooms = [];
    for (let z = refs[0] - 1; z <= refs.at(-1) - 1; z++) zooms.push(z);
    drawings.push({ name: 'zoom-rail', zooms, features: bundle.rails.features, file: path.join(dir, 'trial.json') });
    if (bundle.attached?.features?.length) drawings.push({ name: 'zoom-attached', zooms, features: bundle.attached.features, file: path.join(dir, 'trial.json') });
  }
  return drawings;
}

/** A tile set's gzip size in bytes, every tile of it. */
async function sizeOf(dir) {
  let total = 0;
  const walk = async (p) => {
    for (const e of await readdir(p, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(path.join(p, e.name));
      else total += gzipSync(await readFile(path.join(p, e.name))).length;
    }
  };
  await walk(dir);
  return total;
}

/** Cuts `drawings` into `out`, checks each for seam faults with its controls planted first, and
 * writes `tiles.json` beside the drawings: the sets, what each holds, and the lists a tile names
 * by text. Returns the report. */
export async function cutZoomDrawings(drawings, dir, out) {
  const controls = seamControls();
  const sets = [];
  const lists = {};
  for (const d of drawings) {
    const features = structuredClone(d.features);
    Object.assign(lists, listsOf(features));
    const faults = seamFaults(features, { zooms: d.zooms });
    const written = await cutData({ type: 'FeatureCollection', features }, d.name, { minzoom: d.zooms[0], maxzoom: d.zooms.at(-1) }, out);
    sets.push({ name: d.name, zooms: d.zooms, tiles: written, gzip: await sizeOf(path.join(out, d.name)), features: d.features.length,
      ...(faults.length ? { seamFaults: faults } : {}) });
    console.log(`${d.name}: ${written} tiles at zooms ${d.zooms.join(', ')}; ${features.length} features${faults.length ? `; ${faults.length} SEAM FAULTS` : ''}`);
  }
  const report = { controls, sets, lists };
  await writeFile(path.join(dir, 'tiles.json'), JSON.stringify(report));
  return report;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const dir = path.resolve(process.argv[2] ?? path.join(ROOT, 'public/data/zoom-prototype'));
  const drawings = await zoomDrawings(dir).catch(() => null);
  if (!drawings) {
    console.log('zoom tiles: no drawings in public/data (the trial builds them, and #157 will from main\'s build); nothing cut');
    process.exit(0);
  }
  const out = path.join(ROOT, 'public', 'tiles');
  const report = await cutZoomDrawings(drawings, dir, out);
  const totalTiles = report.sets.reduce((n, s) => n + s.tiles, 0);
  console.log(`Cut ${totalTiles} zoom-map tiles into public/tiles; ${report.sets.reduce((n, s) => n + (s.seamFaults?.length ?? 0), 0)} seam faults`);
}
