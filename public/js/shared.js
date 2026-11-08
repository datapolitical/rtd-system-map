// What the map code and the panels both need: the bus tiers and how they are
// drawn, the words we use for frequency (DESIGN.md, "Voice"), and small
// formatting helpers. Nothing here knows any route, station or id.

import { textOn } from './color.js';
import { P, PALETTES } from './palette.js';
import { BUS_BUNDLE_FROM, BUS_PITCH, FREQUENT_BUS_WIDTH, ZOOMS, frequentWidth } from './sizes.js';

// Phones, and any short screen (a phone on its side): framing, key closed,
// panel as a bottom sheet. The same query is in app.css.
export const PHONE_QUERY = '(max-width: 767px), (max-height: 499px)';
export const isPhone = () => matchMedia(PHONE_QUERY).matches;

// Bus frequency tiers, strongest first (DESIGN.md, "Bus routes"). One ink,
// lighter and thinner by tier. Widths are at zoom 9, 11, 13 and 16; each tier
// fades in from `from`, so the region view shows the frequent network first.
// The steps have to be unmistakable on a phone: frequent is bold navy, every
// 16-30 is clearly thinner but still dark, and everything less often than
// every 30 is one thin, light look (`hourly` and `infrequent` stay separate in
// the data). Their colours are in the palette (palette.js), one set for each
// theme, and `color` reads the theme in use. Contrast against the land, light
// theme: 12.3, 7.4, 3.5; dark theme: 9.2, 5.6, 3.7. The dashed and dotted
// tiers share the lightest look.
const tier = (look, spec) => ({
  ...spec,
  look,
  get color() {
    return P.tier[look];
  },
});
export const TIERS = [
  tier('frequent', { id: 'frequent', label: 'Every 15 min or better', width: FREQUENT_BUS_WIDTH, from: 0 }),
  tier('every30', { id: 'every30', label: 'Every 16 to 30 min', width: [0.85, 1.4, 2.1, 3.7], from: 9 }),
  tier('slow', { id: 'hourly', label: 'Every 31 min or more', width: [0.45, 0.6, 1, 2], from: 10.5 }),
  tier('slow', { id: 'infrequent', label: 'Every 31 min or more', width: [0.45, 0.6, 1, 2], from: 10.5 }),
  tier('slow', { id: 'peak', label: 'Rush hours only', width: [0.5, 0.7, 1.1, 2.1], from: 11, dashed: true }),
  tier('slow', { id: 'limited', label: 'A few trips a day', width: [0.6, 0.9, 1.4, 2.5], from: 11, dotted: true }),
];
// Routes that don't run all day are drawn broken (dashed, or dotted for a few
// trips a day), beneath the rest.
export const PART_TIME = ['peak', 'limited', 'none', 'unknown'];
export const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t.id, TIERS.length - i]));

// Below OVERVIEW_UNTIL (sizes.js) the map is an overview of the whole
// network. Between the overview and here, the map names only what someone
// choosing a line or a place to change needs: lines, the stations where
// routes meet, frequent buses, cities. Every other station's name, town names, FlexRide
// zones and the smaller highway numbers start here, where there's room for
// them and a reason to read them. (A whole zoom: filters read the zoom in
// whole steps.)
export const DETAIL_FROM = 11;

// ZOOMS is in sizes.js, beside the widths given at it; exported here too,
// beside byZoom.
export { ZOOMS };
export const byZoom = (values) => ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => [z, values[i]])];
export const tierMatch = (pick, key = 'tier') => ['match', ['get', key], ...TIERS.flatMap((t) => [t.id, pick(t)]), pick(TIERS.at(-1))];
export const tierWidth = (extra = 0) =>
  ['interpolate', ['exponential', 1.4], ['zoom'], ...ZOOMS.flatMap((z, i) => [z, tierMatch((t) => t.width[i] + extra)])];

// A number knocked out of its line, in its route's ink, darkened for the
// lightest routes. `scheme` names a theme other than the one in use ('light'
// or 'dark').
export const tierColor = (t, scheme) => PALETTES[scheme].tier[t.look];
export const tagInk = (t, scheme = P.scheme) => (TIER_RANK[t.id] >= TIER_RANK.every30 ? tierColor(t, scheme) : PALETTES[scheme].tagSlow);

// A bus route's pill, on the map and in the panels alike: filled in the tier's
// color for routes every 30 minutes or better, with the number in white or
// ink, whichever reads better on it; outlined in the slow tiers' color, with
// the number in their darker ink, for slower routes and for the "+" that
// stands for routes a row doesn't name (tier 'more'). So a row of pills keeps
// the tiers' order of weight.
export function pillStyle(tierId, scheme = P.scheme) {
  const pal = PALETTES[scheme];
  const t = TIERS.find((x) => x.id === tierId);
  if (t && TIER_RANK[t.id] >= TIER_RANK.every30) {
    const fill = tierColor(t, scheme);
    return { fill, text: textOn(fill, pal.onColor), edge: null };
  }
  return { fill: pal.tagFill, text: pal.tagSlow, edge: pal.tier.slow };
}

// --- Words ------------------------------------------------------------------

// GTFS times like 25:19 are after midnight.
export function time(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h % 24;
  return `${hour % 12 || 12}:${String(m).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

// The build's midday window (meta.window), said the same way everywhere:
// "Weekdays, 9am to 3pm". Set once when meta.json loads.
let midday = { from: '09:00', to: '15:00' };
export function setWindow(w) {
  if (w?.from && w?.to) midday = w;
}
const hourOnly = (t) => time(t).replace(':00', '');
export const middayLabel = () => `Weekdays, ${hourOnly(midday.from)} to ${hourOnly(midday.to)}`;
export const middayPhrase = () => middayLabel().replace(/^W/, 'w');

// "2026-11-23" -> "Nov 23"
export const date = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// How often a route comes on a weekday midday, in a few words. `r` is a route
// (or one stretch of a route) with its tier and weekday headway.
export function freq(r) {
  if (r.tier === 'none' || r.tier === 'unknown') return 'No weekday service';
  if (r.tier === 'peak') return 'Rush hours only';
  if (r.tier === 'limited') return 'A few trips a day';
  if (r.wk) return `Every ${r.wk} min`;
  return 'A few trips a day';
}

// The same for Saturday or Sunday: "Every 30 min", "A few trips", "No Sunday service".
export function dayFreq(headway, trips, day) {
  if (!trips) return `No ${day} service`;
  return headway ? `Every ${headway} min` : 'A few trips';
}

// "Union Station to Denver Airport Station" -> "Union Station – Denver Airport"
export function ends(name) {
  return String(name)
    .split(/\s+to\s+/i)
    .map((end) => (/^\S+\s+Station$/i.test(end) && /union/i.test(end) ? end : end.replace(/\s+Station$/i, '')))
    .join(' – ');
}

// A route's two ends, from the directory.
export const goesText = (r) => (r.goes?.length ? r.goes.map((g) => g.name).join(' – ') : r.name);

// The route's bullet: a lettered circle in the line's colour for rail, a
// pill in the route's tier for bus (pillStyle, as on the map). `lines` is the
// rail style (railStyle in network.js). Both themes' colours ride on the element
// as custom properties and app.css picks the pair that matches the system
// setting, so a bullet already on the page (a panel, the results) follows a
// change of theme with no redraw.
export function bullet(r, lines) {
  if (r.mode === 'rail') {
    const line = lines.byRoute.get(r.route);
    const pair = (scheme) => line?.[scheme] ?? { color: r.color, letter: '#ffffff' };
    const [l, d] = [pair('light'), pair('dark')];
    return `<span class="bullet rail" style="--b1:${l.color};--t1:${l.letter};--b2:${d.color};--t2:${d.letter}">${esc(r.route)}</span>`;
  }
  const [l, d] = [pillStyle(r.tier, 'light'), pillStyle(r.tier, 'dark')];
  const vars = `--b1:${l.fill};--t1:${l.text};--e1:${l.edge ?? 'transparent'};--b2:${d.fill};--t2:${d.text};--e2:${d.edge ?? 'transparent'}`;
  return `<span class="bullet bus" style="${vars}">${esc(r.route)}</span>`;
}

// A stretch with no weekday trips, said honestly: "No weekday service here;
// runs Saturday". `here` adds the word for a part of a route.
export function weekendOnly(r, here = false) {
  const days = [r.sa_trips && 'Saturday', r.su_trips && 'Sunday'].filter(Boolean);
  const base = `No weekday service${here ? ' here' : ''}`;
  return days.length ? `${base}; runs ${days.join(' and ')}` : base;
}

// --- Separators -------------------------------------------------------------

// Overpass's middle dot (U+00B7) has no width of its own, in the site's font
// and in the map's glyph files alike: the next character starts where the dot
// does, so " · " reads "0 ·15". Text on the page uses a drawn dot with equal
// space on each side; map labels swap in the bullet (U+2022), which has width.
// `parts` are plain strings; the result is HTML.
export const joinDot = (parts) =>
  parts
    .filter(Boolean)
    .map(esc)
    .join('<span class="dot" aria-hidden="true"></span><span class="sr-only">, </span>');
export const mapDots = (text) => text.replaceAll(' \u00b7 ', ' \u2022 ');

// Bus routes that share a street are drawn side by side (prototype,
// scripts/lib/busbundles.mjs): each piece is `slot` slots from the street's
// path; the slot's width, and the zoom the slots open at, are in sizes.js
// beside the other sizes the build reads. `busOffset` is the open offset: a
// frequent bus's width times BUS_PITCH per slot at every zoom. Below
// BUS_BUNDLE_FROM the routes of a bundle, all on one path, are drawn with no
// offset and are one line, the strongest on top (the bus layer sorts by
// tier). The two can't be one expression: a paint property that reads both
// the zoom and the feature is worked out at the whole zooms either side and
// blended between them, so a gate at 14.5 would open from 14 to 15, with
// the lines half over each other all the way. So `bundledByZoom` makes two
// layers of one: the same layer with no offset up to BUS_BUNDLE_FROM
// (id + '-flat'), and with the offset from there; a layer's own zoom range
// is exact.
export { BUS_BUNDLE_FROM, BUS_PITCH, frequentWidth };
export const busOffset = () => byZoom(FREQUENT_BUS_WIDTH.map((w) => ['*', ['coalesce', ['get', 'slot'], 0], w * BUS_PITCH]));
export function bundledByZoom(layer) {
  const { 'line-offset': offset, ...flat } = layer.paint;
  return [
    { ...layer, id: `${layer.id}-flat`, maxzoom: BUS_BUNDLE_FROM, paint: flat },
    { ...layer, minzoom: Math.max(layer.minzoom ?? 0, BUS_BUNDLE_FROM), paint: { ...flat, 'line-offset': offset ?? busOffset() } },
  ];
}
// Where a layer id is looked up (a tap, a filter), both halves.
export const bundledIds = (ids) => ids.flatMap((id) => [`${id}-flat`, id]);
