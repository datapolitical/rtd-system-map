// The page's address is its share link (DESIGN.md, "Four sheets", "The address is the link"):
// `#zoom/lat/lon`, MapLibre's own form, which the page has always read, and a picked route after
// it: `#14/39.74230/-104.99210/bus/15L`. Pure, so the tests can read it (test/sheets-address.test.mjs).

const MODES = ['bus', 'rail'];
// A route's name as RTD's data gives it: "15L", "FF1", "A". Anything else in an address is ignored.
const ROUTE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,15}$/;

/**
 * What an address asks for: `{ zoom, center: [lon, lat] | null, pick: { mode, route } | null }`,
 * or `null` when it names no view. Each part stands alone: a bad centre still keeps the zoom,
 * a bad pick still keeps the view.
 */
export function readView(hash) {
  const parts = String(hash ?? '').replace(/^#/, '').split('/');
  const num = (s) => (/^-?\d+(\.\d+)?$/.test(s ?? '') ? Number(s) : NaN);
  const zoom = num(parts[0]);
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) return null;
  const [lat, lon] = [num(parts[1]), num(parts[2])];
  const center = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? [lon, lat] : null;
  let route = null;
  try { route = parts[4] === undefined ? null : decodeURIComponent(parts[4]); } catch { /* a broken escape: no pick */ }
  const pick = center && MODES.includes(parts[3]) && ROUTE.test(route ?? '') ? { mode: parts[3], route } : null;
  return { zoom, center, pick };
}

/** The address for a view: its zoom, its centre to about half a pixel, and the picked route. */
export function writeView({ zoom, center: [lon, lat], pick }) {
  // MapLibre's own rule for how many decimals hold a centre to half a pixel at a zoom.
  const places = Math.max(0, Math.ceil((zoom * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10));
  const z = Math.round(zoom * 100) / 100;
  const at = `#${z}/${lat.toFixed(places)}/${lon.toFixed(places)}`;
  return pick && MODES.includes(pick.mode) && ROUTE.test(pick.route) ? `${at}/${pick.mode}/${encodeURIComponent(pick.route)}` : at;
}

/** Whether a sheet's data draws a route: read from its text, without parsing the whole file. */
export function drawsRoute(text, { mode, route }) {
  const r = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return mode === 'rail' ? new RegExp(`"route":"${r}"`).test(text) : new RegExp(`"routes":"(?:[^"]*, *)?${r}(?:,[^"]*)?"`).test(text);
}
