// node qa/.scratch/draw.mjs <build> <lat> <lon> <zoom> <out.png> [w h scale]
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { open } from './open.mjs';
const [build, lat, lon, zoom, out] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
const W = +(process.argv[7] ?? 600), H = +(process.argv[8] ?? 450), S = +(process.argv[9] ?? 2);
const { model } = await open(build, process.argv[10] ?? 'light');
const f = await model.frame({ zoom, center: [lon, lat], width: W, height: H });
const c = createCanvas(W * S, H * S);
const g = c.getContext('2d');
g.scale(S, S);
g.fillStyle = process.argv[10] === 'dark' ? '#14181c' : '#f4f5f6';
g.fillRect(0, 0, W, H);
for (const a of f.areas) {
  g.globalAlpha = a.opacity ?? 1; g.fillStyle = a.color ?? '#888';
  g.beginPath();
  for (const part of a.parts) { part.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
  g.fill('evenodd');
  g.globalAlpha = 1;
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
  else { g.strokeStyle = '#f0f'; g.lineWidth = 0.5; g.strokeRect(m.box[0], m.box[1], m.box[2] - m.box[0], m.box[3] - m.box[1]); }
}
// crosshair at centre
g.strokeStyle = '#e00'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(W / 2 - 6, H / 2); g.lineTo(W / 2 + 6, H / 2); g.moveTo(W / 2, H / 2 - 6); g.lineTo(W / 2, H / 2 + 6); g.stroke();
fs.writeFileSync(out, c.toBuffer('image/png'));
console.log('wrote', out);
