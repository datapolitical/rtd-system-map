// Task 3: damage one source, to see whether a failed build leaves public/data
// alone (DESIGN.md, "Rule 3: a bad update never breaks the site").
//
// Load it before the build, from the copy:
//
//   DRILL=truncated-zip node --import "$QA/drills/mock-fetch.mjs" scripts/build-data.mjs
//
// DRILL=... picks what to damage; anything else passes straight through to the
// real fetch. Live rail is not touched: this only wraps outbound requests.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

const here = import.meta.dirname;
const cache = path.join(here, '..', 'cache');
const realFetch = globalThis.fetch;

const GTFS_URL = 'https://www.rtd-denver.com/files/gtfs/google_transit.zip';
const STATIONS_LAYER = '/FeatureServer/1/query';

const drill = process.env.DRILL ?? '';

const feedFiles = () => {
  const dir = path.join(cache, 'gtfs');
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => [f, readFileSync(path.join(dir, f), 'utf8')]),
  );
};

const zipped = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));

/** The GTFS zip this drill serves, or null to pass the real one through. */
function damagedFeed() {
  if (drill === 'truncated-zip') {
    const real = readFileSync(path.join(cache, 'gtfs.zip'));
    return real.subarray(0, Math.floor(real.length * 0.6));
  }
  if (drill === 'stop-times-missing') {
    const files = feedFiles();
    delete files['stop_times.txt'];
    return zipped(files);
  }
  if (drill === 'shapes-missing') {
    const files = feedFiles();
    delete files['shapes.txt'];
    return zipped(files);
  }
  if (drill === 'rail-color-blank') {
    const files = feedFiles();
    files['routes.txt'] = files['routes.txt']
      .split('\n')
      .map((line, i) => {
        if (!line || i === 0) return line;
        const cells = line.split(',');
        if (!['0', '1', '2'].includes(cells[5])) return line;
        cells[7] = '';
        return cells.join(',');
      })
      .join('\n');
    return zipped(files);
  }
  if (drill === 'half-routes-removed') {
    const files = feedFiles();
    const lines = files['routes.txt'].split('\n').filter(Boolean);
    const header = lines.shift();
    files['routes.txt'] = [header, ...lines.filter((_, i) => i % 2 === 0)].join('\n') + '\n';
    return zipped(files);
  }
  return null;
}

const feed = damagedFeed();

globalThis.fetch = async (url, init) => {
  const href = String(url);

  if (feed && href.startsWith(GTFS_URL)) {
    return new Response(feed, { status: 200, statusText: 'OK', headers: { 'content-type': 'application/zip' } });
  }

  if (href.includes(STATIONS_LAYER)) {
    if (drill === 'arcgis-500') {
      return new Response('upstream error', { status: 500, statusText: 'Internal Server Error' });
    }
    if (drill === 'arcgis-zero-features') {
      const onlyCount = new URL(href).searchParams.get('returnCountOnly') === 'true';
      return Response.json(onlyCount ? { count: 0 } : { type: 'FeatureCollection', features: [] });
    }
    if (drill === 'arcgis-error-200') {
      return Response.json({ error: { code: 500, message: 'Layer is temporarily unavailable' } });
    }
  }

  return realFetch(url, init);
};

if (drill) console.log(`[drill] ${drill}`);
