import { open } from './open.mjs';
import { streetsOf, wedges, segDist, unit, lineAngle } from '../drawn/buslines.mjs';
import { toLonLat, toWorld } from '../drawn/mercator.mjs';
const { model } = await open('3e38acb');
for (const z of [16, 17]) {
  const at = model.zoom(z);
  const c = toWorld([-105.00352, 39.7540], z);
  const near = streetsOf(at).filter((s) => s.part.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 120));
  for (const s of near) console.log(z, s.key, s.routes.join(' '), s.cls, s.w.toFixed(1), s.part.map((p) => `${(p[0] - c[0]).toFixed(0)},${(p[1] - c[1]).toFixed(0)}`).join(' '));
  const A = near.find((s) => s.key.endsWith(':2818')), B = near.find((s) => s.key.endsWith(':779'));
  if (A && B) {
    const prof = [];
    const last = A.part.at(-1), prev = A.part.at(-2);
    const len = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
    for (let s = 0; s < Math.min(len, 80); s += 4) {
      const t = 1 - s / len; const p = [prev[0] + (last[0] - prev[0]) * t, prev[1] + (last[1] - prev[1]) * t];
      let best = Infinity; for (let i = 1; i < B.part.length; i++) best = Math.min(best, segDist(p, B.part[i - 1], B.part[i]).d);
      prof.push(`${s}:${(best - A.hw - B.hw).toFixed(1)}`);
    }
    console.log(z, 'gap profile (from node along stem):', prof.join(' '));
  }
  console.log(z, wedges(at).filter((f) => Math.hypot(f.px[0] - c[0], f.px[1] - c[1]) < 150).map((f) => f.msg));
}
