// What a tap on a sheet names, and which routes its card offers to pick (main.js). Pure, so the
// tests can read it: it takes the properties of the drawn features under the finger.

const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** The routes in a drawn list: "0, 1, 15L" or a stacked "15L,\n19" -> ['0', '1', '15L', '19']. */
export const routeList = (text) => String(text ?? '').split(/,\s*/).map((r) => r.trim()).filter(Boolean);

/**
 * The card for the features under a tap, nearest kind first: a station, a line letter, a rail
 * line, a stop, a street's route numbers, a bus street. `null` when the tap is on empty ground.
 * Returns `{ title, note, rail: [route], bus: 'list' }`; `title` is HTML.
 */
export function pickFrom({ station, letter, rail = [], stop, label, bus } = {}) {
  if (station) return { title: esc(station.name), note: 'Rail station', rail: String(station.lines ?? '').split(' ').filter(Boolean) };
  if (letter) return { title: 'Line', note: 'Rail', rail: [letter.route] };
  if (rail.length) return { title: rail.length > 1 ? 'Lines' : 'Line', note: 'Rail', rail: rail.map((r) => r.route) };
  if (stop) return { title: esc(stop.name), note: ['Bus stop', stop.heading].filter(Boolean).join(' · '), bus: stop.routes };
  if (label) return { title: routeList(label.label).length > 1 ? 'Routes on this street' : 'Route', note: 'Bus', bus: label.label };
  if (bus) {
    return { title: bus.n > 1 ? 'Routes on this street' : 'Route', bus: bus.routes,
      note: bus.hw ? `A bus about every ${Math.round(bus.hw)} minutes on this street, weekday midday` : 'Bus' };
  }
  return null;
}
