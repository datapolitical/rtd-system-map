// What a tap on a sheet names, and which routes its card offers to pick (main.js). Pure, so the
// tests can read it: it takes the properties of the drawn features under the finger.

import { freq } from '../often.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** The routes in a drawn list: "0, 1, 15L" or a stacked "15L,\n19" -> ['0', '1', '15L', '19']. */
export const routeList = (text) => String(text ?? '').split(/,\s*/).map((r) => r.trim()).filter(Boolean);
const railTitle = (routes) => routes.length === 1 ? `${routes[0]} Line` : `${routes.slice(0, -1).join(', ')} and ${routes.at(-1)} Lines`;

/**
 * The card for the features under a tap, nearest kind first: a station, a line letter, a rail
 * line, a stop, a street's route numbers, a bus street. `null` when the tap is on empty ground.
 * Returns `{ title, note, rail: [route], bus: 'list' }`; `title` is HTML.
 */
export function pickFrom({ station, letter, rail = [], stop, label, bus } = {}) {
  if (station) return { title: esc(station.name), note: 'Rail station', rail: String(station.lines ?? '').split(' ').filter(Boolean) };
  if (letter) return { title: esc(railTitle([letter.route])), note: 'Rail', rail: [letter.route] };
  if (rail.length) return { title: esc(railTitle(rail.map((r) => r.route))), note: 'Rail', rail: rail.map((r) => r.route) };
  if (stop) return { title: esc(stop.name), note: ['Bus stop', stop.heading].filter(Boolean).join(' · '), bus: stop.routes };
  if (label) return { title: routeList(label.label).length > 1 ? 'Routes on this street' : 'Route', note: 'Bus', bus: label.label };
  if (bus) {
    const often = bus.hw ? `A bus about every ${Math.round(bus.hw)} minutes on this street, weekday midday` : 'Bus';
    return { title: bus.n > 1 ? 'Routes on this street' : 'Route', bus: bus.routes, note: bus.express ? `Express · ${often}` : bus.airport ? `Airport bus · ${often}` : often };
  }
  return null;
}

/**
 * The card an address with a picked route opens on (main.js): the card a tap on that route's
 * number gives, so a shared link shows what its sender saw. `{ title, note, rail | bus }`.
 */
export function pickCard({ mode, route } = {}, r = null) {
  const base = mode === 'rail' ? { title: esc(railTitle([route])), note: 'Rail', rail: [route] } : mode === 'bus' ? { title: 'Route', note: 'Bus', bus: route } : null;
  if (!base || !r) return base;
  // With the route's entry in RTD's directory, the card says what the route is in one or two
  // lines: its chip and RTD's name for it, then its two ends and how often it runs.
  const name = mode === 'rail' ? `${route} Line` : String(r.name ?? '');
  const goes = (r.goes ?? []).map((g) => routeEnd(g.name));
  return { ...base, kind: 'route', name, line: [goes.join(' – '), freq(r)].filter(Boolean).join(' · ') };
}

/** An end as a card says it: "Olde Town Arvada Station" -> "Olde Town Arvada"; Union Station keeps its name. */
export const routeEnd = (name) => (/union/i.test(name) ? String(name) : String(name).replace(/\s+Station$/i, ''));
