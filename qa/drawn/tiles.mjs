// OpenFreeMap's vector tiles, read tile by tile and kept on disk
// (qa/drawn/README.md).
//
// The basemap's streets and buildings come from the vector source the style
// names -- never a URL written here. The source's TileJSON is fetched once,
// cached beside the tiles, and its versioned tile URL decides the cache
// path, so a new OpenFreeMap build lands in a new folder instead of being
// served stale tiles. `qa/cache/` is git-ignored.
//
// Tiles are 512 px (MapLibre's tile size) whatever their zoom. A tile's
// geometry is quantised to `extent` (4096 for OpenMapTiles), so it is scaled
// to 512 px here once, and the caller scales 512 px at the tile's zoom to
// screen px at the map's zoom.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { TILE, tileSpan } from './mercator.mjs';

const USER_AGENT = 'rtd-system-map drawn-model (qa/drawn; github.com/datapolitical/rtd-system-map)';

// The vector source the basemap draws: the style's own vector sources.
export function vectorSources(style) {
  return Object.entries(style.sources ?? {})
    .filter(([, s]) => s.type === 'vector')
    .map(([name, s]) => ({ name, ...s }));
}

export class Tiles {
  constructor({ root, source, concurrency = 6 }) {
    this.source = source;
    this.concurrency = concurrency;
    this.dir = path.join(root, 'qa', 'cache', 'tiles');
    this.tilejson = null;
    this.queue = 0;
    this.waiting = [];
    this.used = 0;
  }

  async load() {
    if (this.tilejson) return this.tilejson;
    const cacheFile = path.join(this.dir, 'tilejson.json');
    let cached = null;
    try { cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch {}
    if (cached?.url === this.source.url) {
      this.tilejson = cached.json;
      return this.tilejson;
    }
    const res = await fetch(this.source.url, { headers: { 'user-agent': USER_AGENT } });
    if (!res.ok) throw new Error(`TileJSON ${this.source.url}: HTTP ${res.status}`);
    const json = await res.json();
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify({ url: this.source.url, json }));
    this.tilejson = json;
    return json;
  }

  // Where this TileJSON's tiles live on disk: one folder per published build.
  async folder() {
    const tj = await this.load();
    const template = (this.source.tiles ?? tj.tiles)[0];
    const version = new URL(template.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')).pathname
      .split('/').filter(Boolean).slice(0, -3).join('_').replace(/[^\w.-]+/g, '_');
    return path.join(this.dir, version || 'tiles');
  }

  async template() {
    const tj = await this.load();
    return (this.source.tiles ?? tj.tiles)[0];
  }

  async maxzoom() {
    return (await this.load()).maxzoom ?? 14;
  }

  // A tile as a VectorTile, or null for one the server has no data on. The
  // bytes are cached, so a second run reads the disk.
  async tile(z, x, y) {
    const dir = await this.folder();
    const file = path.join(dir, String(z), String(x), `${y}.pbf`);
    let buf;
    try {
      buf = await fs.readFile(file);
    } catch {
      await this.acquire();
      try {
        const url = (await this.template())
          .replace('{z}', z).replace('{x}', x).replace('{y}', y)
          .replace('{s}', 'a');
        const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
        if (res.status === 404) {
          buf = Buffer.alloc(0);
        } else if (!res.ok) {
          throw new Error(`tile ${z}/${x}/${y}: HTTP ${res.status}`);
        } else {
          buf = Buffer.from(await res.arrayBuffer());
        }
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, buf);
      } finally {
        this.release();
      }
    }
    this.used++;
    return buf.length ? new VectorTile(new PbfReader(buf)) : null;
  }

  async acquire() {
    if (this.queue < this.concurrency) { this.queue++; return; }
    await new Promise((resolve) => this.waiting.push(resolve));
    this.queue++;
  }

  release() {
    this.queue--;
    const next = this.waiting.shift();
    if (next) next();
  }

  // The tile indexes covering a world-px box at zoom z, at tile zoom tz.
  static cover([minX, minY, maxX, maxY], z, tz, pad = 0) {
    const k = tileSpan(tz, z);
    const x0 = Math.floor((minX - pad) / k), x1 = Math.floor((maxX + pad) / k);
    const y0 = Math.floor((minY - pad) / k), y1 = Math.floor((maxY + pad) / k);
    const out = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
    return out;
  }
}

// A tile's geometry in world px at zoom `z`: `[ [ [x, y], ... ], ... ]` per
// part, with the tile's own zoom scaled away. Polygon rings and line parts
// look the same; a caller that cares about rings reads `type`.
export function geometry(vtFeature, tz, z, tileX, tileY) {
  const k = TILE / vtFeature.extent;
  const scale = 2 ** (z - tz);
  const ox = tileX * TILE * scale, oy = tileY * TILE * scale;
  return vtFeature.loadGeometry().map((ring) => ring.map((p) => [ox + p.x * k * scale, oy + p.y * k * scale]));
}

export const tileExists = (file) => fsSync.existsSync(file);
