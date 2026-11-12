// Colour arithmetic for the style detectors (qa/drawn/styles.mjs): parse what
// the style evaluates to, contrast as WCAG 2.x measures it, OKLab/OKLCH for
// hue, chroma and difference, and a greyscale. Pure; no page code, so a test
// can use it on made-up colours. (public/js/color.js has the same contrast and
// OKLab for the page; this is kept apart so the check does not read its
// answer from the code under test.)

// Parses '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(r, g, b)' and 'rgba(r, g, b, a)'
// (the form the style-spec's Color prints). Channels 0..255, alpha 0..1.
export function parse(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return { r: value[0], g: value[1], b: value[2], a: value[3] ?? 1 };
  if (typeof value === 'object' && 'r' in value) {
    // The style-spec's Color: premultiplied channels 0..1.
    const a = value.a ?? 1;
    return a > 0 ? { r: (value.r / a) * 255, g: (value.g / a) * 255, b: (value.b / a) * 255, a } : { r: 0, g: 0, b: 0, a: 0 };
  }
  const s = String(value).trim();
  let m = /^#([0-9a-f]{3,4})$/i.exec(s);
  if (m) {
    const h = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r: h[0], g: h[1], b: h[2], a: h[3] === undefined ? 1 : h[3] / 255 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] === undefined ? 1 : parseInt(m[2], 16) / 255 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}

export const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

// `top` laid over `under` at its own alpha (and `opacity` more): the colour
// that reaches the eye. Both parsed.
export function over(top, under, opacity = 1) {
  const a = (top.a ?? 1) * opacity;
  return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
}

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

// WCAG 2.x contrast ratio, 1..21.
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function oklab(c) {
  const [r, g, b] = [lin(c.r), lin(c.g), lin(c.b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}

// OKLCH: lightness 0..1, chroma (about 0..0.4), hue in degrees 0..360.
export function oklch(c) {
  const { L, a, b } = oklab(c);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

// Distance between two colours in OKLab (a just-noticeable step is about 0.02).
export function deltaE(a, b) {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

// The smaller of two hue angles' distance, in degrees.
export const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// The grey a colour becomes in a greyscale print or a colour-blind-safe check:
// its relative luminance as a grey of the same luminance.
export function grey(c) {
  const y = luminance(c);
  const v = 255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
  return { r: v, g: v, b: v, a: c.a ?? 1 };
}
