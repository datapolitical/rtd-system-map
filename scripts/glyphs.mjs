// Map label glyphs in Overpass, the same face as the interface (DESIGN.md,
// "Visual tokens"). MapLibre draws text from signed-distance-field glyphs in
// protobuf files, one per font and range of 256 characters; this renders them
// from the pinned font package with MapLibre's own SDF method.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import TinySDF from '@mapbox/tiny-sdf';
import { PbfWriter } from 'pbf';

const FILES = path.resolve(import.meta.dirname, '../node_modules/@fontsource-variable/overpass/files');

// The font names map styles ask for, by weight.
export const STACKS = {
  'Overpass Regular': { weight: 400 },
  'Overpass Medium': { weight: 500 },
  'Overpass SemiBold': { weight: 600 },
  'Overpass Bold': { weight: 700 },
  'Overpass ExtraBold': { weight: 800 },
  'Overpass Italic': { weight: 400, italic: true },
};

// Latin, Latin Extended-A, and general punctuation (dashes and curly quotes).
const RANGES = [0, 256, 8192];

// MapLibre's glyph format: 24 px, with a 3 px buffer around each glyph.
const SIZE = 24;
const BUFFER = 3;
// MapLibre places a glyph's top at -17 px less its `top`, inside a line box
// centered on the anchor; this `top` centers capitals and figures in that box,
// so a route number sits in the middle of its tag.
const SHAPING_OFFSET = 17;

class NodeSDF extends TinySDF {
  _createCanvas(size) {
    return createCanvas(size, size);
  }
}

function registerFonts() {
  for (const [file, family] of [
    ['overpass-latin-wght-normal.woff2', 'OverpassGlyphs'],
    ['overpass-latin-ext-wght-normal.woff2', 'OverpassGlyphs'],
    ['overpass-latin-wght-italic.woff2', 'OverpassGlyphsItalic'],
    ['overpass-latin-ext-wght-italic.woff2', 'OverpassGlyphsItalic'],
  ]) {
    GlobalFonts.registerFromPath(path.join(FILES, file), family);
  }
}

function writeGlyph(g, pbf) {
  pbf.writeVarintField(1, g.id);
  if (g.bitmap) pbf.writeBytesField(2, g.bitmap);
  pbf.writeVarintField(3, g.width);
  pbf.writeVarintField(4, g.height);
  pbf.writeSVarintField(5, g.left);
  pbf.writeSVarintField(6, g.top);
  pbf.writeVarintField(7, g.advance);
}

function writeStack(stack, pbf) {
  pbf.writeStringField(1, stack.name);
  pbf.writeStringField(2, stack.range);
  for (const g of stack.glyphs) pbf.writeMessage(3, writeGlyph, g);
}

function rangeFile(name, { weight, italic }, start) {
  const sdf = new NodeSDF({
    fontSize: SIZE,
    buffer: BUFFER,
    radius: 8,
    cutoff: 0.25,
    fontFamily: italic ? 'OverpassGlyphsItalic' : 'OverpassGlyphs',
    fontWeight: String(weight),
    fontStyle: italic ? 'italic' : 'normal',
  });
  const capHeight = sdf.ctx.measureText('H').actualBoundingBoxAscent;
  const lift = capHeight / 2 - SHAPING_OFFSET;
  const glyphs = [];
  for (let id = start; id < start + 256; id++) {
    // Control characters have no glyph.
    if (id < 32 || (id >= 127 && id < 160)) continue;
    const g = sdf.draw(String.fromCharCode(id));
    const ink = g.glyphWidth > 0 && g.glyphHeight > 0;
    glyphs.push({
      id,
      bitmap: ink ? Buffer.from(g.data) : null,
      width: ink ? g.glyphWidth : 0,
      height: ink ? g.glyphHeight : 0,
      left: g.glyphLeft,
      top: Math.round(g.glyphTop - capHeight + lift),
      advance: Math.round(g.glyphAdvance),
    });
  }
  const pbf = new PbfWriter();
  pbf.writeMessage(1, writeStack, { name, range: `${start}-${start + 255}`, glyphs });
  return pbf.finish();
}

export async function buildGlyphs(out) {
  registerFonts();
  let files = 0;
  for (const [name, style] of Object.entries(STACKS)) {
    const dir = path.join(out, name);
    await mkdir(dir, { recursive: true });
    for (const start of RANGES) {
      await writeFile(path.join(dir, `${start}-${start + 255}.pbf`), rangeFile(name, style, start));
      files++;
    }
  }
  return files;
}
