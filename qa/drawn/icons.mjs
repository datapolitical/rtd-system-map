// The pictures the page draws itself, as geometry (qa/drawn/README.md).
//
// Station ticks, capsules, the hub's ring, rail bullets, line-end signs,
// Park-n-Ride and transit-center signs are canvases the page draws at load
// (public/js/symbols.js) and hands to MapLibre as images. The model needs
// their size, anchor point and pixel ratio to place a mark's box, and it
// gets them from that same code: symbols.js is imported in Node with a
// canvas for `document.createElement` (@napi-rs/canvas) and a stand-in map
// that only records what addSymbol hands it. No size is restated here, so a
// mark reshaped in the page reshapes in the model.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

let booted = null;

// `root` is the site whose public/js draws the images: a checkout, or a frozen
// build (qa/recall). One root and one theme per process: symbols.js and
// palette.js are modules, read once.
export async function icons(theme = 'dark', root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')) {
  if (booted) return booted;
  // palette.js reads the system theme once, at module load; symbols.js
  // imports it. One theme per process, as for the style (style.mjs).
  globalThis.matchMedia = () => ({ matches: theme === 'dark', addEventListener() {} });
  globalThis.devicePixelRatio = 2;
  globalThis.document = {
    createElement: (tag) => {
      if (tag !== 'canvas') throw new Error(`symbols.js asked for <${tag}>`);
      return createCanvas(1, 1);
    },
  };
  globalThis.window = globalThis;
  const { addSymbol, RATIO } = await import(pathToFileURL(path.join(root, 'public', 'js', 'symbols.js')).href);
  const sizes = new Map();
  const map = {
    hasImage: (id) => sizes.has(id),
    addImage: (id, data, options = {}) => {
      sizes.set(id, { width: data.width, height: data.height, pixelRatio: options.pixelRatio ?? 1, pixels: data.data ?? null });
    },
  };
  // Rail bullets are sized the same for every line; the colour of one comes
  // from its route, which the style evaluates.
  const lines = { of: () => null };
  booted = {
    ratio: RATIO,
    // An image's size in CSS px.
    size(id) {
      if (!sizes.has(id)) addSymbol(map, id, lines);
      const s = sizes.get(id);
      if (!s) throw new Error(`no image ${id}`);
      return { width: s.width / s.pixelRatio, height: s.height / s.pixelRatio, ratio: s.pixelRatio };
    },
    // An image's opacity (0 to 1) at [x, y] CSS px from its top left, 0
    // outside it or where the page handed no pixels.
    alpha(id, [x, y]) {
      this.size(id);
      const s = sizes.get(id);
      const [i, j] = [Math.floor(x * s.pixelRatio), Math.floor(y * s.pixelRatio)];
      if (!s.pixels || i < 0 || j < 0 || i >= s.width || j >= s.height) return 0;
      return s.pixels[(j * s.width + i) * 4 + 3] / 255;
    },
  };
  return booted;
}
