import { openModel } from '../drawn/model.mjs';
const root = process.argv[2], theme = process.argv[3] ?? 'dark';
const model = await openModel({ root, theme });
const seen = new Map();
for (const z of [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) {
  const at = model.zoom(z);
  const by = new Map();
  for (const l of at.lines) {
    const key = [l.layer, l.mode, l.properties.cls ?? '', l.tier ?? '', l.mode === 'rail' ? (l.properties.wk ?? '') : ''].join('|');
    if (!by.has(key)) by.set(key, { w: new Set(), o: new Set(), c: new Set(), n: 0, d: new Set() });
    const b = by.get(key); b.w.add(+l.width.toFixed(3)); b.o.add(+l.opacity.toFixed(3)); b.c.add(l.color); b.n++; b.d.add(JSON.stringify(l.dash));
  }
  for (const [k, b] of by) {
    if (!seen.has(k)) seen.set(k, {});
    seen.get(k)[z] = `${[...b.w].join('/')} o${[...b.o].join('/')}`;
    seen.get(k).colors = [...b.c].slice(0, 4).join(' ');
    seen.get(k).dash = [...b.d].join(' ');
  }
}
for (const [k, v] of [...seen].sort()) console.log(k.padEnd(48), [9,10,11,12,13,14,15,16,17,18].map((z) => (v[z] ?? '-').padEnd(12)).join(''), v.colors, v.dash);
