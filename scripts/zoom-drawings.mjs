// Draw and measure the whole-zoom drawings for #157 from an existing public/data build.
// No network, server, tiles or deploy. Until #155 lands, the three anchored zooms are
// measured and the intermediate zooms are reported as blocked instead of using the trial's
// size-table adapter. Once sheets.mjs exports sheetAt, the same command draws all five.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as sheetModel from './lib/sheets.mjs';

export const WHOLE_ZOOMS = Object.freeze([11, 12, 13, 14, 15, 16]);
const SOURCE_NAMES = ['routes', 'stations', 'streets', 'terminals', 'stops'];
const sha256 = (raw) => createHash('sha256').update(raw).digest('hex');
const collection = (features) => ({ type: 'FeatureCollection', features });

/** Which drawings this checkout can make without borrowing the zoom trial's adapter. */
export function wholeZoomPlan(model = sheetModel, zooms = WHOLE_ZOOMS) {
  return zooms.map((zoom) => {
    const anchor = model.SHEETS.find((sheet) => Math.abs(sheet.zoom - zoom) < 1e-9);
    if (anchor) return { zoom, sheet: anchor, anchor: anchor.id };
    if (typeof model.sheetAt === 'function') return { zoom, sheet: model.sheetAt(zoom), anchor: null };
    return { zoom, sheet: null, anchor: null, blocked: '#155: drawSheet needs zoom-dependent sizes for this intermediate zoom' };
  });
}

/** The deployable drawing, its separately fetched picked-route lines, and size/count measures. */
export function measureDrawing(drawn, elapsedMs = 0) {
  const features = drawn.features.filter((f) => !['route-line', 'group-key'].includes(f.properties.kind));
  const routeFeatures = drawn.features.filter((f) => f.properties.kind === 'route-line');
  const drawing = { ...drawn, features };
  const routes = collection(routeFeatures);
  const raw = JSON.stringify(drawing);
  const routesRaw = JSON.stringify(routes);
  const count = (predicate) => features.filter(predicate).length;
  return {
    drawing,
    routes,
    report: {
      elapsedMs: Math.round(elapsedMs),
      features: features.length,
      routeFeatures: routeFeatures.length,
      rail: count((f) => f.properties.kind === 'rail'),
      busStreets: count((f) => f.properties.kind === 'bus'),
      stationNames: count((f) => f.properties.shape === 'name' && !f.properties.alt && !f.properties.edge),
      letters: count((f) => f.properties.kind === 'letter' && !f.properties.edge),
      rawBytes: Buffer.byteLength(raw),
      gzipBytes: gzipSync(raw).length,
      routesRawBytes: Buffer.byteLength(routesRaw),
      routesGzipBytes: gzipSync(routesRaw).length,
      totalRawBytes: Buffer.byteLength(raw) + Buffer.byteLength(routesRaw),
      totalGzipBytes: gzipSync(raw).length + gzipSync(routesRaw).length,
      drawingSha256: sha256(raw),
      routesSha256: sha256(routesRaw),
    },
  };
}

async function readSources(dir) {
  const data = {};
  for (const name of SOURCE_NAMES) data[name] = JSON.parse(await readFile(path.join(dir, `${name}.geojson`), 'utf8'));
  return data;
}

async function anchorComparison(dir, anchor, report) {
  if (anchor == null) return {};
  const compare = async (suffix, key) => {
    try {
      const existing = await readFile(path.join(dir, `sheet-${anchor}${suffix}.geojson`), 'utf8');
      const name = key.replace(/Sha256$/, '');
      return { [`${name}MatchesSheet`]: sha256(existing) === report[key] };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return {};
    }
  };
  return { ...(await compare('', 'drawingSha256')), ...(await compare('-routes', 'routesSha256')) };
}

/**
 * Write zoom-N.geojson, zoom-N-routes.geojson and report.json. `data` and `draw` are injectable
 * so the real anchor files can exercise the writer without a several-minute redraw in unit tests.
 */
export async function writeZoomDrawings({ dir, out, data = null, draw = sheetModel.drawSheet, model = sheetModel, zooms = WHOLE_ZOOMS }) {
  data ??= await readSources(dir);
  await mkdir(out, { recursive: true });
  const started = performance.now();
  const drawings = [];
  for (const item of wholeZoomPlan(model, zooms)) {
    if (item.blocked) {
      drawings.push({ zoom: item.zoom, blocked: item.blocked });
      console.log(`zoom ${item.zoom}: blocked by ${item.blocked}`);
      continue;
    }
    const before = performance.now();
    const { drawing, routes, report } = measureDrawing(draw(data, item.sheet), performance.now() - before);
    const comparison = await anchorComparison(dir, item.anchor, report);
    const raw = JSON.stringify(drawing);
    const routesRaw = JSON.stringify(routes);
    await writeFile(path.join(out, `zoom-${item.zoom}.geojson`), raw);
    await writeFile(path.join(out, `zoom-${item.zoom}-routes.geojson`), routesRaw);
    drawings.push({ zoom: item.zoom, ...report, ...comparison });
    console.log(`zoom ${item.zoom}: ${report.features} features + ${report.routeFeatures} route features, ${(report.totalGzipBytes / 1000).toFixed(1)} KB gzipped, ${(report.elapsedMs / 1000).toFixed(1)} s${Object.values(comparison).includes(false) ? ', DOES NOT MATCH ANCHOR' : ''}`);
  }
  const report = { drawings, elapsedMs: Math.round(performance.now() - started), complete: drawings.every((d) => !d.blocked) };
  await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const [dir = path.join(root, 'public', 'data'), out = path.join(root, 'qa', '.scratch', 'whole-zooms')] = process.argv.slice(2);
  const report = await writeZoomDrawings({ dir: path.resolve(dir), out: path.resolve(out) });
  console.log(`report: ${path.resolve(out, 'report.json')}; ${(report.elapsedMs / 1000).toFixed(1)} s total; complete=${report.complete}`);
}
