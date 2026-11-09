// The map's label text, measured from the glyph files it downloads
// (qa/drawn/README.md; scripts/glyphs.mjs makes them).
//
// MapLibre draws text from one signed-distance-field protobuf per font and
// range of 256 characters. Each glyph carries the same numbers the shaper
// uses: `advance` (how far the pen moves, at 24 px), and the ink box
// (`left`, `top`, `width`, `height`). So a label's width is the sum of its
// glyphs' advances scaled to the text size, its height is the number of
// lines times the line height, and wrapping runs the same line breaker
// MapLibre runs (node_modules/maplibre-gl/src/symbol/tagged_string.ts,
// `determineLineBreaks`): try to fit on one line, otherwise aim every line
// at the same width and pick the breaks with the least raggedness -- no
// browser and no font file of our own.

import fs from 'node:fs';
import path from 'node:path';
import { PbfReader } from 'pbf';

const GLYPH_SIZE = 24; // scripts/glyphs.mjs draws at this size
const ONE_EM = 24; // MapLibre's font units

const cache = new Map();

function readGlyphs(buf) {
  const p = new PbfReader(buf);
  const glyphs = new Map();
  // scripts/glyphs.mjs writes one `glyph` stack per file, as field 1 of the
  // protobuf: `name` (1), `range` (2), then each glyph as field 3.
  const stack = (end) => {
    while (p.pos < end) {
      const key = p.readVarint();
      const tag = key >> 3;
      if (tag !== 3) { p.skip(key); continue; }
      const glyphEnd = p.readVarint() + p.pos;
      const g = { id: 0, width: 0, height: 0, left: 0, top: 0, advance: 0 };
      while (p.pos < glyphEnd) {
        const k = p.readVarint();
        const field = k >> 3;
        if (field === 1) g.id = p.readVarint();
        else if (field === 2) p.skip(k);
        else if (field === 3) g.width = p.readVarint();
        else if (field === 4) g.height = p.readVarint();
        else if (field === 5) g.left = p.readSVarint();
        else if (field === 6) g.top = p.readSVarint();
        else if (field === 7) g.advance = p.readVarint();
        else p.skip(k);
      }
      p.pos = glyphEnd;
      glyphs.set(g.id, g);
    }
  };
  while (p.pos < p.length) {
    const key = p.readVarint();
    if (key >> 3 === 1) {
      const end = p.readVarint() + p.pos;
      stack(end);
      p.pos = end;
    } else {
      p.skip(key);
    }
  }
  return glyphs;
}

export function glyphs(root, fontstack, code) {
  const dir = path.join(root, 'public', 'vendor', 'glyphs', fontstack);
  const start = Math.floor(code / 256) * 256;
  const file = path.join(dir, `${start}-${start + 255}.pbf`);
  const key = `${fontstack}/${start}`;
  if (!cache.has(key)) {
    cache.set(key, fs.existsSync(file) ? readGlyphs(fs.readFileSync(file)) : new Map());
  }
  return cache.get(key);
}

// The break opportunities MapLibre has: after these characters, or before an
// opening parenthesis. (tagged_string.ts, `breakable` / `breakableBefore`.)
const BREAK_AFTER = new Set([0x0a, 0x0d, 0x20, 0x26, 0x29, 0x2b, 0x2d, 0x2f, 0xad, 0xb7, 0x200b, 0x2010, 0x2013, 0x2027]);
const BREAK_BEFORE = new Set([0x28]);

const isSpace = (code) => /\s/u.test(String.fromCodePoint(code));

function badness(lineWidth, targetWidth, penalty, isLastBreak) {
  const raggedness = (lineWidth - targetWidth) ** 2;
  if (!isLastBreak) return raggedness + Math.abs(penalty) * penalty;
  return lineWidth < targetWidth ? raggedness / 2 : raggedness * 2;
}

function penaltyFor(prev, next) {
  let penalty = 0;
  if (prev === 0x0a || prev === 0x0d) penalty -= 10000;
  if (prev === 0x28 || prev === 0xff08) penalty += 50;
  if (next === 0x29 || next === 0xff09) penalty += 50;
  return penalty;
}

// Grapheme clusters, as MapLibre measures them. The map's labels are Latin
// and punctuation, where a codepoint is a cluster.
const clusters = (text) => Array.from(String(text));

// MapLibre's break indices (cluster indices), in font units.
function lineBreaks(root, text, fontstack, spacing, maxWidth) {
  const glyphsOf = (ch) => glyphs(root, fontstack, ch.codePointAt(0)).get(ch.codePointAt(0));
  const advance = (ch) => {
    const g = glyphsOf(ch);
    return (g ? g.advance : 0) + spacing;
  };
  const chars = clusters(text);
  const total = chars.reduce((sum, ch) => sum + advance(ch), 0);
  if (spacing >= 0 && total > 0 && total <= maxWidth && !/[\n\r]/.test(text)) return [chars.length];

  const target = total / Math.max(1, Math.ceil(total / maxWidth));
  const breaks = [];
  const evaluate = (index, x, isLast) => {
    let best = null;
    let bestBadness = badness(x, target, 0, isLast);
    for (const b of breaks) {
      const value = badness(x - b.x, target, b.penalty, isLast) + b.badness;
      if (value <= bestBadness) {
        best = b;
        bestBadness = value;
      }
    }
    return { index, x, prior: best, badness: bestBadness };
  };

  let x = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (i > 0) {
      const prev = chars[i - 1].codePointAt(0);
      const code = ch.codePointAt(0);
      if (BREAK_AFTER.has(prev) || (i + 1 < chars.length && BREAK_BEFORE.has(code))) {
        breaks.push({ ...evaluate(i, x, false), penalty: penaltyFor(prev, code) });
      }
    }
    if (!isSpace(ch.codePointAt(0))) x += advance(ch);
  }
  let last = evaluate(chars.length, x, true);
  const out = [];
  for (let b = last; b; b = b.prior) out.unshift(b.index);
  return out;
}

// The advance width of a line in px, trailing spaces trimmed as MapLibre's
// line.trim() trims them.
function lineWidth(root, fontstack, text, size, spacing) {
  let w = 0;
  for (const ch of String(text).replace(/\s+$/u, '')) {
    const g = glyphs(root, fontstack, ch.codePointAt(0)).get(ch.codePointAt(0));
    w += ((g ? g.advance : 0) + spacing) * (size / GLYPH_SIZE);
  }
  return w;
}

// One label's layout: its lines (text and width in px) and its block box.
// `maxWidth` is `text-max-width` in ems; 0 or absent means no wrapping.
export function layout(root, text, { fontstack, size, letterSpacing = 0, lineHeight = 1.2, maxWidth = 0 }) {
  const spacing = (letterSpacing * ONE_EM);
  const max = (maxWidth || 0) * ONE_EM;
  const chars = clusters(text);
  const cuts = max > 0 ? lineBreaks(root, text, fontstack, spacing, max) : [chars.length];
  const lines = [];
  let start = 0;
  for (const cut of cuts) {
    const line = chars.slice(start, cut).join('');
    lines.push(line);
    start = cut;
  }
  if (!lines.length || start < chars.length) lines.push(chars.slice(start).join(''));
  const widths = lines.map((l) => lineWidth(root, fontstack, l, size, spacing));
  const linePx = lineHeight * size;
  return {
    lines: lines.map((l, i) => ({ text: l.trim(), width: widths[i] })),
    width: Math.max(...widths, 0),
    height: linePx * lines.length,
    lineHeight: linePx,
  };
}
