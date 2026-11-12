import { iconReader } from '../drawn/iconpix.mjs';
import { hex, contrast, parse } from '../drawn/colours.mjs';
const [root, theme] = process.argv.slice(2);
const icon = await iconReader({ root: new URL('../../' + root, import.meta.url).pathname.replace(/\/$/, ''), theme });
for (const n of ['shield-us-interstate-2', 'shield-us-highway-2', 'dot-1', 'dot-3', 'station-1', 'station-3', 'hub-3', 'parking', 'transit-center', 'chevron']) {
  const p = icon(n); console.log(n, p && p.outer && hex(p.outer), p && p.inner && hex(p.inner));
}
console.log(contrast(parse('#6b7886'), parse('#ffffff')));
