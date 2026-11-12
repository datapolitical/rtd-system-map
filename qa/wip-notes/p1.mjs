import { openModel } from '../drawn/model.mjs';
import { placeSymbols } from '../drawn/place.mjs';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? 'qa/recall/fixtures/3e38acb');
const z = Number(process.argv[3] ?? 14);
const withNames = process.argv[4] === 'names';
const m = await openModel({ root, theme: 'dark' });
console.time('zoom'); const zm = m.zoom(z); console.timeEnd('zoom');
console.time('bands'); const bands = m.linePlaced(z); console.timeEnd('bands');
let names = [];
if (withNames) { console.time('names'); names = await m.names(z); console.timeEnd('names'); }
console.time('place');
const r = placeSymbols({ z, labels: [...zm.labels, ...names], marks: zm.marks, bands }, { layers: m.style.layers });
console.timeEnd('place');
const by = {}, hb = {};
for (const p of r.placed) by[p.layer + '/' + p.kind] = (by[p.layer + '/' + p.kind] || 0) + 1;
for (const p of r.hidden) hb[p.layer + '<-' + p.blockedBy] = (hb[p.layer + '<-' + p.blockedBy] || 0) + 1;
console.log('placed', by); console.log('hidden', hb);
