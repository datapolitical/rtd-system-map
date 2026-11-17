// What a screen reader hears on the sheets page (main.js; #14). Pure, so the tests can read it.

/** A route as it is said: "A Line" for rail, "Route 15" for a bus. */
export const routeName = ({ mode, route }) => (mode === 'rail' ? `${route} Line` : `Route ${route}`);

/** Which sheet is showing: "Sheet 2 of 4". */
export const sheetName = (index, count) => `Sheet ${index + 1} of ${count}`;

/** Said when a route is picked or cleared: "Route 15 shown, the rest faded", or "Cleared". */
export const pickSaid = (pick) => (pick ? `${routeName(pick)} shown, the rest faded` : 'Cleared');

/**
 * Said when the card opens: its title, what it is, and its routes, named when there are up to
 * three ("Line. Rail. E Line"), counted when there are more ("Union Station. Rail station. 8 routes").
 */
export function cardSaid({ title, note, lead, routes = [] }) {
  const names = routes.map(routeName);
  const parts = [title, note || lead, names.length > 3 ? `${names.length} routes` : names.join(', ')];
  return parts.map((p) => String(p ?? '').trim().replace(/\.$/, '')).filter(Boolean).join('. ');
}

// WCAG 2 relative luminance and contrast ratio, from #rrggbb.
const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => channel(parseInt(String(hex).slice(at, at + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The ink for a label on a line's colour: whichever of near-black and white reads better on it. */
export const DARK_INK = '#10151d';
export const inkOn = (color) => (contrast(color, DARK_INK) >= contrast(color, '#ffffff') ? DARK_INK : '#ffffff');
