// Color helpers for keeping RTD's line colors legible on our map (DESIGN.md,
// "Rail line colors"): contrast as WCAG measures it, and darkening a color in
// OKLab so it keeps its hue.

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

function hex(channels) {
  return `#${channels
    .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function luminance(color) {
  const [r, g, b] = rgb(color).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toOklab(color) {
  const [r, g, b] = rgb(color).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return hex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(toGamma),
  );
}

// A color's lightness, 0 to 1 (OKLab L).
export const lightness = (color) => toOklab(color)[0];

// The color itself if it already stands out from `background` by `ratio`;
// otherwise the same hue, darkened only as far as it needs to.
export function darkenTo(color, background, ratio) {
  if (contrast(color, background) >= ratio) return color;
  const [L, a, b] = toOklab(color);
  for (let k = 1; k <= 100; k++) {
    const next = fromOklab([L * (1 - k / 100), a, b]);
    if (contrast(next, background) >= ratio) return next;
  }
  return '#000000';
}

// The dark theme's counterpart of darkenTo: the color itself if it already
// stands out from `background` by `ratio`; otherwise the same hue, lightened
// only as far as it needs to (OKLab lightness, chroma kept).
export function lightenTo(color, background, ratio) {
  if (contrast(color, background) >= ratio) return color;
  const [L, a, b] = toOklab(color);
  for (let k = 1; k <= 100; k++) {
    const next = fromOklab([L + ((1 - L) * k) / 100, a, b]);
    if (contrast(next, background) >= ratio) return next;
  }
  return '#ffffff';
}

const inGamut = (lab) => {
  const [L, a, b] = lab;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].every((v) => v >= -1e-4 && v <= 1 + 1e-4);
};

// The most chroma a screen can show at this lightness and hue (OKLCh, radians).
function maxChroma(L, h) {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 24; i++) {
    const c = (lo + hi) / 2;
    if (inGamut([L, c * Math.cos(h), c * Math.sin(h)])) lo = c;
    else hi = c;
  }
  return lo;
}

// Like lightenTo, but the lifted colour keeps its share of the most chroma
// its hue can have at each lightness, so it stays as strong a colour as it
// was: a deep red lifts to a bright red, not to salmon, and a purple to a
// violet, not lavender.
export function liftTo(color, background, ratio) {
  if (contrast(color, background) >= ratio) return color;
  const [L, a, b] = toOklab(color);
  const h = Math.atan2(b, a);
  const share = Math.min(1, Math.hypot(a, b) / (maxChroma(L, h) || 1));
  for (let k = 1; k <= 200; k++) {
    const L2 = L + ((1 - L) * k) / 200;
    const c = maxChroma(L2, h) * share;
    const next = fromOklab([L2, c * Math.cos(h), c * Math.sin(h)]);
    if (contrast(next, background) >= ratio) return next;
  }
  return '#ffffff';
}

// A darker shade of the same hue, for a line's outline: `factor` of its
// lightness, and never less than `ratio` against `background`.
export function shade(color, factor, background, ratio) {
  const [L, a, b] = toOklab(color);
  return darkenTo(fromOklab([L * factor, a, b]), background, ratio);
}

// White or ink, whichever reads better on `color`.
export function textOn(color, ink) {
  return contrast('#ffffff', color) >= contrast(ink, color) ? '#ffffff' : ink;
}

// A colour as OKLCh: lightness, chroma and hue (radians). And back.
export function toLch(color) {
  const [L, a, b] = toOklab(color);
  return [L, Math.hypot(a, b), Math.atan2(b, a)];
}
export const fromLch = (L, chroma, hue) => fromOklab([L, chroma * Math.cos(hue), chroma * Math.sin(hue)]);

// A colour with less chroma than this has no hue to speak of: black, white, a grey.
export const GREY_UNDER = 0.04;

// The hue farthest from every one of `colors` (radians): the middle of the
// widest gap they leave round the colour wheel. Null when none of them has a hue.
export function freeHue(colors) {
  const turn = 2 * Math.PI;
  const hues = colors.map(toLch).filter(([, chroma]) => chroma >= GREY_UNDER).map(([, , hue]) => (hue + turn) % turn).sort((a, b) => a - b);
  let widest = null;
  hues.forEach((hue, i) => {
    const gap = (i + 1 < hues.length ? hues[i + 1] : hues[0] + turn) - hue;
    if (!widest || gap > widest.gap) widest = { gap, hue: (hue + gap / 2) % turn };
  });
  return widest ? widest.hue : null;
}
