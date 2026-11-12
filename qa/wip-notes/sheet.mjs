// node qa/.scratch/sheet.mjs <build> <out.png> <theme> <cols> <tileW> <tileH> <scale> lat,lon,zoom[,label] ...
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { open } from './open.mjs';
const [build, out, theme, cols, TW, TH, S] = [process.argv[2], process.argv[3], process.argv[4], +process.argv[5], +process.argv[6], +process.argv[7], +process.argv[8]];
const items = process.argv.slice(9).map((a) => { const [lat, lon, z, ...l] = a.split(','); return { lat: +lat, lon: +lon, z: +z, label: l.join(',') }; });
const { model } = await open(build, theme);
const rows = Math.ceil(items.length / cols);
const c = createCanvas(cols * TW * S, rows * TH * S);
const g = c.getContext('2d');
g.scale(S, S);
const dark = theme === 'dark';
for (let n = 0; n < items.length; n++) {
  const it = items[n];
  const f = await model.frame({ zoom: it.z, center: [it.lon, it.lat], width: TW, height: TH });
  g.save();
  g.translate((n % cols) * TW, Math.floor(n / cols) * TH);
  g.beginPath(); g.rect(0, 0, TW, TH); g.clip();
  g.fillStyle = dark ? '#14181c' : '#f4f5f6'; g.fillRect(0, 0, TW, TH);
  for (const a of f.areas) {
    g.globalAlpha = a.opacity ?? 1; g.fillStyle = a.color ?? '#888';
    g.beginPath(); for (const part of a.parts) { part.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); } g.fill('evenodd'); g.globalAlpha = 1;
  }
  for (const l of f.lines) {
    const w = l.drawnWidth ?? l.width;
    if (!(w > 0) || !(l.opacity > 0)) continue;
    g.globalAlpha = l.opacity; g.strokeStyle = l.color ?? '#000'; g.lineWidth = w;
    g.lineCap = l.cap === 'round' ? 'round' : l.cap === 'square' ? 'square' : 'butt'; g.lineJoin = l.join === 'round' ? 'round' : 'miter';
    g.setLineDash(l.dash ? l.dash.map((d) => d * w) : []);
    for (const part of l.drawn) { g.beginPath(); part.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
    g.globalAlpha = 1;
  }
  g.setLineDash([]);
  for (const m of f.marks) {
    if (m.kind === 'circle') { g.globalAlpha = m.opacity ?? 1; g.fillStyle = m.color ?? '#fff'; g.strokeStyle = m.strokeColor ?? '#000'; g.lineWidth = m.stroke; g.beginPath(); g.arc(m.at[0], m.at[1], m.radius, 0, 7); g.fill(); if (m.stroke) g.stroke(); g.globalAlpha = 1; }
    else { g.strokeStyle = 'rgba(255,0,255,0.45)'; g.lineWidth = 0.5; g.strokeRect(m.box[0], m.box[1], m.box[2] - m.box[0], m.box[3] - m.box[1]); }
  }
  g.strokeStyle = '#e00'; g.lineWidth = 0.8; g.beginPath(); g.arc(TW / 2, TH / 2, 14, 0, 7); g.stroke();
  g.fillStyle = '#000'; g.font = '10px sans-serif'; g.fillText(`${n + 1} ${it.label} z${it.z}`, 4, 11);
  g.restore();
  g.strokeStyle = '#999'; g.lineWidth = 0.5; g.strokeRect((n % cols) * TW, Math.floor(n / cols) * TH, TW, TH);
}
fs.writeFileSync(out, c.toBuffer('image/png'));
console.log('wrote', out);
