// qa/drawn/style.mjs — build the map's style JSON for one theme, in Node.
//
// The page assembles it in public/js/main.js:
//   layers: [...lettersFirst([...basemapBelow(), ...transitLines(lines),
//            ...basemapLabels(), ...transitMarks(lines)]), ...vehicleLayers(lines)]
// with sources from BASEMAP_SOURCES + dataSources().
//
// palette.js reads the system theme through matchMedia at load, so the two
// themes cannot be built in one process; this script builds one theme per
// run and prints the style JSON on stdout.
//
//   node qa/drawn/style.mjs --theme dark [--root /path/to/checkout] [--meta FILE]
//   node qa/drawn/style.mjs --sources [--root DIR]   # the page's DATA_SOURCES
//
// It is the drawn model's style source: qa/drawn/model.mjs reads this file's
// output (the model never re-implements the style, it evaluates it). --meta
// points at a meta.json from a deployed build, when the checkout has none.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const theme = process.argv.includes('--theme') ? process.argv[process.argv.indexOf('--theme') + 1] : 'dark';
if (!['light', 'dark'].includes(theme)) {
  console.error('usage: node qa/drawn/style.mjs --theme light|dark [--root DIR]');
  process.exit(2);
}
const rootIdx = process.argv.indexOf('--root');
const root = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// palette.js calls matchMedia at module load. Live.js imports panel.js and
// select.js, which touch the DOM at module load; the layer functions are
// pure, so stub the DOM with a proxy that absorbs everything.
globalThis.matchMedia = () => ({ matches: theme === 'dark', addEventListener() {} });
globalThis.devicePixelRatio = 2;
const inert = new Proxy(function () {}, {
  get: (t, k) => (k === 'querySelector' || k === 'getElementById' ? () => inert : inert),
  apply: () => inert,
  set: () => true,
});
globalThis.document = new Proxy({ baseURI: 'http://localhost/' }, {
  get: (t, k) => (k in t ? t[k] : inert),
});
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.location = { hash: '' };
globalThis.innerWidth = 390;
globalThis.innerHeight = 844;

const js = (name) => path.join(root, 'public', 'js', name);

// `--sources`: only the build files the page draws (network.js DATA_SOURCES),
// for a caller that has to fetch the data before it can build the style.
if (process.argv.includes('--sources')) {
  const { DATA_SOURCES } = await import(js('network.js'));
  if (!Array.isArray(DATA_SOURCES)) {
    console.error(`${js('network.js')} does not export DATA_SOURCES`);
    process.exit(1);
  }
  console.log(JSON.stringify(DATA_SOURCES));
  process.exit(0);
}

const metaIdx = process.argv.indexOf('--meta');
const metaFile = metaIdx >= 0
  ? process.argv[metaIdx + 1]
  : path.join(root, 'public', 'data', 'meta.json');
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

const { BASEMAP_SOURCES, basemapBelow, basemapLabels } = await import(js('basemap.js'));
const network = await import(js('network.js'));
const { dataSources, lettersFirst, railStyle, transitLines, transitMarks } = network;
const { STATE } = await import(js('highlight.js'));
const shared = await import(js('shared.js'));
// live.js also pulls select.js and panel.js; vehicleLayers is pure, so take
// it from a fresh read of the file without its import chain: its imports
// (panel, select) are UI only.
const { vehicleLayers } = await import(js('live.js'));

const lines = railStyle(meta.rail);
const style = {
  version: 8,
  sources: { ...BASEMAP_SOURCES, ...dataSources() },
  state: STATE,
  // The page's own list of the build files it draws (network.js), so the
  // model can check it loads every one rather than trusting a copy.
  // and the tiers it draws as part-time (shared.js), for qa/recall/plant.mjs.
  metadata: { 'rtd:data-sources': network.DATA_SOURCES ?? null, 'rtd:part-time': shared.PART_TIME ?? null },
  layers: [
    ...lettersFirst([...basemapBelow(), ...transitLines(lines), ...basemapLabels(), ...transitMarks(lines)]),
    ...vehicleLayers(lines),
  ],
};

console.log(JSON.stringify(style));
