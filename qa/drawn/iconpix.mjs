// The colours of the pictures the page draws itself (public/js/symbols.js),
// read from the pixels it draws: an outline colour (the ring of opaque
// pixels at the picture's edge) and an inside colour (the commonest opaque
// colour within). The style detectors need them for the marks (a capsule's
// ink edge on the land) and for the words that sit on a picture (a highway
// number on its shield).
//
// symbols.js is the module icons.mjs already booted for the model, so this
// reads the same canvases the model measured, in the theme the model was
// opened in.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { icons } from './icons.mjs';

// ImageData -> { outer, inner, ink } as {r,g,b,a} (or null when nothing is opaque).
export function analyse(img) {
  const { width: w, height: h, data } = img;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
  const ring = [], inside = new Map(), ink = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] >= 20) { ink[0] += data[i]; ink[1] += data[i + 1]; ink[2] += data[i + 2]; ink[3]++; }
    if (data[i + 3] < 200) continue;
    const edge = A(x - 1, y) < 40 || A(x + 1, y) < 40 || A(x, y - 1) < 40 || A(x, y + 1) < 40;
    if (edge) ring.push([data[i], data[i + 1], data[i + 2]]);
    else {
      const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      const e = inside.get(k) ?? { n: 0, sum: [0, 0, 0] };
      e.n++;
      for (let c = 0; c < 3; c++) e.sum[c] += data[i + c];
      inside.set(k, e);
    }
  }
  const mean = (list) => (list.length ? { r: list.reduce((s, c) => s + c[0], 0) / list.length, g: list.reduce((s, c) => s + c[1], 0) / list.length, b: list.reduce((s, c) => s + c[2], 0) / list.length, a: 1 } : null);
  const best = [...inside.values()].sort((a, b) => b.n - a.n)[0];
  return { ink: ink[3] ? { r: ink[0] / ink[3], g: ink[1] / ink[3], b: ink[2] / ink[3], a: 1 } : null, outer: mean(ring), inner: best ? { r: best.sum[0] / best.n, g: best.sum[1] / best.n, b: best.sum[2] / best.n, a: 1 } : null };
}

/**
 * A reader for the model's pictures: `icon(name)` is { outer, inner } or null.
 * @param {{root: string, theme: string}} model
 */
export async function iconReader(model) {
  await icons(model.theme, model.root);
  const { addSymbol } = await import(pathToFileURL(path.join(model.root, 'public', 'js', 'symbols.js')).href);
  const cache = new Map();
  // A rail line's colour is the style's, not the picture's: bullets and signs
  // are drawn here without one, so they read as the default ink.
  const lines = { of: () => null };
  return (name) => {
    if (!cache.has(name)) {
      let img = null;
      try { addSymbol({ hasImage: () => false, addImage: (_, d) => { img = d; } }, name, lines); } catch { img = null; }
      cache.set(name, img ? analyse(img) : null);
    }
    return cache.get(name);
  };
}
