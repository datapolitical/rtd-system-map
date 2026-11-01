// What the panels say about each route and station (DESIGN.md, "Highlight,
// don't list" and "Stations lead with trains"), in one small file the page
// loads once the map has drawn: where each route goes, a rail line's stations
// in order, the buses that stop at each station, and its parking.

import { destination } from './labels.mjs';

// A bus stop belongs to a station within this distance: bus bays can be a
// block from the platforms.
const STOP_METERS = 250;
// A Park-n-Ride serves the station within this distance.
const PARKING_METERS = 400;
// A bus whose trips end this close to a rail station goes to that station.
const END_METERS = 300;

/**
 * `routes` and `stations` are the features as drawn, `stops` and `facilities`
 * RTD's stop and facility points, `service` the rail service from
 * stationService, and `busEnds` lineEnds' result for buses. `lineOf(code)`
 * names the map route a stop's route code belongs to, and `urls` holds each
 * route's page on RTD's site. Returns { routes, stations }.
 */
export function directory({ routes, stations, stops, facilities, service, busEnds, lineOf, urls }) {
  const byRoute = new Map();
  for (const f of routes) (byRoute.get(f.properties.route) ?? byRoute.set(f.properties.route, []).get(f.properties.route)).push(f);

  // A route's two ends read from the end nearer the network's hub, the
  // station the most lines serve, so most routes read outward from downtown.
  const hub = stations.reduce((a, b) => (count(b.properties.lines) > count(a.properties.lines) ? b : a)).geometry.coordinates;
  const fromHub = (goes) => (goes.length === 2 && goes[1].at && goes[0].at && meters(goes[1].at, hub) < meters(goes[0].at, hub));

  // Buses at each station, from the stops near it.
  const busRoutes = new Set(routes.filter((f) => f.properties.mode === 'bus').map((f) => f.properties.route));
  const buses = stations.map((s) => {
    const found = new Set();
    for (const stop of stops) {
      if (meters(stop.geometry.coordinates, s.geometry.coordinates) > STOP_METERS) continue;
      for (const code of String(stop.properties.routes ?? '').split(/,\s*/)) {
        const route = lineOf(code);
        if (route && busRoutes.has(route)) found.add(route);
      }
    }
    return [...found].sort(byNumber);
  });

  const out = [...byRoute].map(([route, features]) => {
    const p = features[0].properties;
    let goes;
    let order = null;
    if (p.mode === 'rail' && service.ends[route]) {
      goes = service.ends[route].map((i, k) => {
        const station = stations[i];
        const headsign = service.headsigns[route]?.[k];
        return { name: headsign ? destination(headsign, route, station.properties.label) : station.properties.label, at: station.geometry.coordinates };
      });
      order = (service.order[route] ?? []).map((i) => stations[i].properties.id);
    } else {
      goes = (busEnds.get(route) ?? [])
        .filter((e) => e.headsigns.length)
        .map((e) => {
          // RTD's headsigns abbreviate; a station's own name doesn't.
          const station = e.at && stations.find((s) => s.properties.served && meters(s.geometry.coordinates, e.at) <= END_METERS);
          const label = station?.properties.label;
          return { name: label ? (/\bstation\b/i.test(label) ? label : `${label} Station`) : place(e.headsigns, route), at: e.at };
        });
      // A loop shows one end.
      if (goes.length === 2 && goes[0].name === goes[1].name) goes = goes.slice(0, 1);
      // The stations it stops at, in the order its first direction passes them.
      const path = busEnds.get(route)?.find((e) => e.path)?.path;
      if (path) {
        const along = (at) => path.reduce((best, p, i) => (meters(p, at) < meters(path[best], at) ? i : best), 0);
        order = stations
          .map((s, i) => ({ s, i, k: buses[i].includes(route) ? along(s.geometry.coordinates) : -1 }))
          .filter(({ s, k }) => k >= 0 && s.properties.served)
          .sort((a, b) => a.k - b.k)
          .map(({ s }) => s.properties.id);
        // Read from the first end in `goes`.
        const first = busEnds.get(route).find((e) => e.path);
        if (goes[0]?.at && first.at && meters(goes[0].at, first.at) < meters(goes[0].at, first.path[0])) order.reverse();
      }
    }
    if (fromHub(goes)) {
      goes.reverse();
      order?.reverse();
    }
    return {
      route,
      name: p.name,
      mode: p.mode,
      tier: p.tier,
      color: p.color,
      wk: p.wk,
      sa: p.sa,
      su: p.su,
      wk_trips: p.wk_trips,
      sa_trips: p.sa_trips,
      su_trips: p.su_trips,
      wk_first: p.wk_first,
      wk_last: p.wk_last,
      url: urls.get(route) ?? null,
      bbox: bbox(features),
      goes,
      ...(order ? { stations: order } : {}),
    };
  });

  const parkingNear = (at) =>
    facilities
      .filter((f) => f.properties.spaces > 0 && meters(f.geometry.coordinates, at) <= PARKING_METERS)
      .sort((a, b) => meters(a.geometry.coordinates, at) - meters(b.geometry.coordinates, at))[0]?.properties.spaces ?? 0;

  return {
    routes: out.sort((a, b) => (b.mode === 'rail') - (a.mode === 'rail') || byNumber(a.route, b.route)),
    stations: stations.map((s, i) => ({
      id: s.properties.id,
      name: s.properties.name,
      label: s.properties.label,
      at: s.geometry.coordinates,
      served: s.properties.served,
      lines: s.properties.lines,
      returns: s.properties.returns,
      buses: buses[i].join(' '),
      parking: parkingNear(s.geometry.coordinates),
    })),
  };
}

// Where a bus goes, from its headsigns, most common first: "Billings via E
// Colfax Ave" -> "Billings", "40th & Colorado Stn" -> "40th & Colorado
// Station". When the two most common share two or more leading words, those
// are the place and the rest says how the bus gets there ("Union Station
// All-Station", "Union Station Express").
function place(headsigns, route) {
  const number = new RegExp(`(^|\\s)${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g');
  const clean = (h) =>
    h
      .replace(/\s+via\s+.*$/i, '')
      .replace(number, ' ')
      .replace(/\bfree\b/gi, '')
      .replace(/\bStn\b\.?/g, 'Station')
      .replace(/\b(Cntr|Ctr)\b\.?/g, 'Center')
      .replace(/\b(Dtwn|Dwtn)\b\.?/g, 'Downtown')
      .replace(/\bPnR\b/gi, 'Park-n-Ride')
      .replace(/\bXing\b/g, 'Crossing')
      .replace(/\bAirpt\b/g, 'Airport')
      .replace(/\s+-\s+/g, ' – ')
      .replace(/\s+/g, ' ')
      .trim();
  const [first, second] = headsigns.map(clean);
  if (second && second !== first) {
    const [a, b] = [first.split(' '), second.split(' ')];
    let k = 0;
    while (k < a.length && a[k] === b[k]) k++;
    if (k >= 2) return a.slice(0, k).join(' ');
  }
  return first;
}

const count = (lines) => String(lines ?? '').split(' ').filter(Boolean).length;
const byNumber = (a, b) => a.localeCompare(b, 'en', { numeric: true });

function bbox(features) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => {
    if (typeof c[0] !== 'number') return c.forEach(visit);
    [w, s, e, n] = [Math.min(w, c[0]), Math.min(s, c[1]), Math.max(e, c[0]), Math.max(n, c[1])];
  };
  for (const f of features) visit(f.geometry.coordinates);
  return [w, s, e, n];
}

// Meters between two [lon, lat] points (equirectangular; fine at these distances).
function meters([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6371e3;
}
