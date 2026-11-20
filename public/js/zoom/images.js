// Prototype copies of the current sheets' marks, to keep comparisons visually consistent.
import { PALETTES, GROUP, expressInk, airportInk } from '../sheets/style.js';
const ratio = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
function groupImage(id) {
  const m = /^stopgroup-(plate|badge|street|stop)-(light|dark)(?:-(\d+)x(\d+))?$/.exec(id);
  if (!m) return null;
  const c = PALETTES[m[2]];
  const square = { badge: GROUP.badge, street: GROUP.badge + 2 * GROUP.streetRim, stop: GROUP.stopBadge + 2 * GROUP.stopRim }[m[1]];
  const [w, h] = m[1] === 'plate' ? [Number(m[3]), Number(m[4])] : [square, square];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.beginPath();
  if (m[1] === 'plate') {
    ctx.roundRect(0.5, 0.5, w - 1, h - 1, GROUP.corner - 0.5);
    ctx.fillStyle = c.ground;
    ctx.fill();
    ctx.globalAlpha = GROUP.edge;
    ctx.strokeStyle = c.number;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (m[1] === 'badge') {
    ctx.roundRect(0, 0, w, h, GROUP.badgeCorner);
    ctx.fillStyle = c.number;
    ctx.fill();
  } else {
    const rim = m[1] === 'street' ? GROUP.streetRim : GROUP.stopRim;
    ctx.roundRect(0, 0, w, h, GROUP.badgeCorner + rim);
    ctx.fillStyle = c.ground;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(rim, rim, w - 2 * rim, h - 2 * rim, GROUP.badgeCorner);
    ctx.fillStyle = m[1] === 'street' ? c.number : c.stop;
    ctx.fill();
  }
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
// The marks repeated along the express and the airport buses (style.js): the express's shield, a slanted
// plate in its rose on a rim of ground, and the airport plane, seen from above with its nose along the
// line, in the airport indigo on a disc of ground.
function markImage(id) {
  const m = /^(express-shield|airport-plane)-(light|dark)$/.exec(id);
  if (!m) return null;
  const [, kind, theme] = m;
  const c = PALETTES[theme];
  const [w, h] = kind === 'express-shield' ? [18, 10] : [13, 13];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  if (kind === 'express-shield') {
    const lozenge = (inset) => {
      ctx.beginPath(); ctx.moveTo(inset + 3, inset); ctx.lineTo(w - inset, inset); ctx.lineTo(w - inset - 3, h - inset); ctx.lineTo(inset, h - inset); ctx.closePath();
    };
    ctx.lineJoin = 'round';
    lozenge(0.5); ctx.fillStyle = c.ground; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = c.ground; ctx.stroke();
    lozenge(1.4); ctx.fillStyle = expressInk(theme, 2).c10; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, 2 * Math.PI); ctx.fillStyle = c.ground; ctx.fill();
    ctx.translate(w / 2, h / 2); ctx.fillStyle = airportInk(theme, 2).c10; ctx.beginPath();
    ctx.moveTo(5.2, 0); ctx.quadraticCurveTo(5, -0.9, 3.6, -0.9); ctx.lineTo(1, -0.9); ctx.lineTo(-1.6, -5); ctx.lineTo(-2.8, -5); ctx.lineTo(-1.2, -0.9);
    ctx.lineTo(-3.6, -0.9); ctx.lineTo(-4.6, -2.4); ctx.lineTo(-5.4, -2.4); ctx.lineTo(-4.8, 0);
    ctx.lineTo(-5.4, 2.4); ctx.lineTo(-4.6, 2.4); ctx.lineTo(-3.6, 0.9); ctx.lineTo(-1.2, 0.9); ctx.lineTo(-2.8, 5); ctx.lineTo(-1.6, 5); ctx.lineTo(1, 0.9);
    ctx.lineTo(3.6, 0.9); ctx.quadraticCurveTo(5, 0.9, 5.2, 0); ctx.closePath(); ctx.fill();
  }
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

export function resolveImages(map, id) {
  if (map.hasImage(id)) return;
  const image = groupImage(id) ?? markImage(id);
  if (image) map.addImage(id, image, { pixelRatio: ratio });
}
