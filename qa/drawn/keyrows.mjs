// The Key as the page builds it, at each zoom, in Node: runs the page's own
// legend.js (buildLegend) against a stand-in DOM that only records what is
// written into the Key's lists, and prints those lists as JSON. The model never
// restates a row: a row added to legend.js is in the output.
//
//   node qa/drawn/keyrows.mjs --theme dark --meta FILE --zooms 8.5,10,12 [--root DIR] [--live]
//
// One theme per process (palette.js reads the system theme at load), as for
// style.mjs. keys.mjs spawns this and reads the lists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, DOMMatrix, ImageData } from '@napi-rs/canvas';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const theme = arg('theme', 'dark');
const root = path.resolve(arg('root', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')));
const meta = JSON.parse(fs.readFileSync(arg('meta', path.join(root, 'public', 'data', 'meta.json')), 'utf8'));
const zooms = arg('zooms', '8.5,10,12,14').split(',').map(Number);
const live = process.argv.includes('--live');

globalThis.matchMedia = () => ({ matches: theme === 'dark', addEventListener() {} });
globalThis.devicePixelRatio = 2;
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.location = { hash: '' };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;

// The elements the Key writes into, by id.
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      id, innerHTML: '', textContent: '', hidden: false, open: false, scrollHeight: 0, clientHeight: 0, scrollTop: 0,
      style: { setProperty() {} },
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {},
      querySelector: () => element(`${id} child`),
    });
  }
  return elements.get(id);
};
const inert = new Proxy(function () {}, { get: (t, k) => (k === 'querySelector' || k === 'getElementById' ? () => inert : inert), apply: () => inert, set: () => true });
globalThis.document = new Proxy({
  baseURI: 'http://localhost/',
  getElementById: element,
  createElement: (tag) => (tag === 'canvas' ? createCanvas(1, 1) : inert),
  fonts: { load: () => Promise.resolve([]) },
}, { get: (t, k) => (k in t ? t[k] : inert) });

// The Key loads the stations file through fetch('data/stations.geojson').
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  const u = String(url);
  if (u.startsWith('data/')) {
    const file = path.join(root, 'public', u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  }
  return realFetch(url, ...rest);
};

const js = (name) => pathToFileURL(path.join(root, 'public', 'js', name)).href;
const { railStyle } = await import(js('network.js'));
const { buildLegend } = await import(js('legend.js'));

const lines = railStyle(meta.rail);
const legend = buildLegend(meta, lines);
let zoom = zooms[0];
const map = { getZoom: () => zoom, on() {} };
legend.follow(map);
if (live) legend.setLive(true);
// Let the stations file arrive (the Key draws again when it does).
await new Promise((r) => setTimeout(r, 200));

const out = { theme, meta: { counts: meta.counts, tiers: meta.tiers, classes: meta.classes }, zooms: {} };
for (const z of zooms) {
  zoom = z;
  legend.redraw();
  out.zooms[z] = {
    rail: element('legend-rail').innerHTML,
    tiers: element('legend-tiers').innerHTML,
    symbols: element('legend-symbols').innerHTML,
    live: element('legend-live').innerHTML,
  };
}
console.log(JSON.stringify(out));
process.exit(0);
