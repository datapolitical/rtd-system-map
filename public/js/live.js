// Live: vehicles at their live positions, pushed by the relay (live/) over a
// WebSocket. One button turns it on; the page then listens, draws each
// update, and says so when positions stop arriving. See DESIGN.md, "Live".

import { FONT } from './basemap.js';
import { P } from './palette.js';
import { byZoom } from './shared.js';
import { band, pillText, zoomNote } from './age.js';
import { POLL_MS, SCHEMA, STALE_S, routeOf, vehicle } from './realtime.js';
import { loadData, loadDirectory, openRoute } from './select.js';
import { offTrack, trackIndex } from './track.js';

// The zoom ladder for vehicles (DESIGN.md, "By zoom level"): trains from the
// city zoom, buses from the neighborhood zoom, their names closer in.
const TRAINS_FROM = 9.75;
const BUSES_FROM = 13;
const LETTERS_FROM = 12.5;
// From here a bus's route number sits under its arrow: downtown at 14 the
// arrows are a block apart, and the next question is which bus it is.
const NUMBERS_FROM = 14.5;
// A train further than this from its own line's track is drawn at
// OFF_TRACK_OPACITY (DESIGN.md, "2. Live"): one laid over in a yard or on a
// tail track past an end, or running on another line's track. Measured over
// twenty minutes on 2026-11-07: trains in service came within 120 m of their
// line (the A between 61st / Pena and the airport, where RTD's drawn line
// runs about 100 m off the track; most trains within 30), and trains in the
// Union Station yard 226 to 310 m.
const OFF_TRACK_M = 200;
const OFF_TRACK_OPACITY = 0.45;
// A position moves to its new place over this long, unless motion is reduced.
const GLIDE_MS = 700;
// No word from the relay for this long and the socket is reopened.
const QUIET_MS = POLL_MS * 4;
const REMEMBER = 'live';

const trains = ['==', ['get', 'mode'], 'rail'];
const buses = ['==', ['get', 'mode'], 'bus'];
const offFaint = ['case', ['boolean', ['get', 'off'], false], OFF_TRACK_OPACITY, 1];

/**
 * The vehicle layers, above everything else. Each vehicle is a rounded arrow
 * (drawn in main.js, addSymbol) turned to its heading, with its letter or
 * number upright over it from closer in. Re-applied on a theme change.
 */
export function vehicleLayers(lines) {
  const arrow = {
    'icon-rotate': ['coalesce', ['get', 'bearing'], 0],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'text-font': FONT.bold,
    'text-rotation-alignment': 'viewport',
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  };
  return [
    {
      id: 'vehicles-bus',
      type: 'symbol',
      source: 'vehicles',
      minzoom: BUSES_FROM,
      filter: buses,
      layout: {
        ...arrow,
        'icon-image': 'vehicle-bus',
        'icon-size': byZoom([0.6, 0.75, 0.95, 1.2]),
        'text-field': ['step', ['zoom'], '', NUMBERS_FROM, ['get', 'route']],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 1],
        // Two buses at one stop keep both arrows; the second number waits
        // until they part, rather than printing over the first.
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: { 'text-color': P.ink, 'text-halo-color': P.land, 'text-halo-width': 1.2 },
    },
    {
      id: 'vehicles-rail',
      type: 'symbol',
      source: 'vehicles',
      minzoom: TRAINS_FROM,
      filter: trains,
      layout: {
        ...arrow,
        'icon-image': ['concat', 'vehicle-', ['get', 'route']],
        'icon-size': byZoom([0.65, 0.8, 1, 1.3]),
        'text-field': ['step', ['zoom'], '', LETTERS_FROM, ['get', 'route']],
        'text-size': byZoom([8, 9, 11, 14]),
      },
      paint: { 'text-color': lines.letter, 'icon-opacity': offFaint, 'text-opacity': offFaint },
    },
  ];
}

export function initLive(map, { meta, status, changed = () => {} }) {
  const button = document.getElementById('live-button');
  const text = button.querySelector('.live-text');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const aliases = meta.live?.routes ?? {};
  let on = false;
  let socket = null;
  let attempts = 0;
  let retry = null;
  let watch = null;
  let latest = null; // the last snapshot or update
  let heard = 0; // when anything last arrived
  let skew = 0; // our clock minus the relay's
  let said = null; // the status line Live is showing, if any
  let since = 0; // when Live was turned on
  let shown = new Map(); // vehicle id -> [lon, lat] as drawn
  let glide = null;
  let track = null; // each rail line's track (track.js), once loaded

  const say = (line) => {
    if (line === said) return;
    if (said && !line) status('');
    if (line) status(line);
    said = line;
  };

  // How old the newest positions are, in seconds; null before any arrive.
  const ageNow = () => (latest?.vehicles ? (Date.now() - skew) / 1000 - latest.vehicles.at : null);

  // The pill shows the age of the positions, never a clock time, and keeps
  // showing it (dimmed) when they go stale.
  const label = () => {
    const age = on ? ageNow() : null;
    text.textContent = pillText(age);
    button.classList.toggle('stale', on && (age == null || age > STALE_S) && heard > 0);
  };

  // The zoom note: said once when Live is on and not everything it draws is
  // in view, and again only after the zoom crosses into another band.
  let noted = -1; // the band last told about
  let noting = null; // the note on screen, if any
  let noteTimer = null;
  let settle = null;
  const dropNote = () => {
    clearTimeout(noteTimer);
    if (noting && said === noting) say(null);
    noting = null;
  };
  const note = () => {
    if (!on) return;
    const b = band(map.getZoom(), TRAINS_FROM, BUSES_FROM);
    if (b === noted) return;
    // Wait while a more important line (loading, failure) is up.
    if (said && said !== noting) return;
    noted = b;
    const line = zoomNote(map.getZoom(), TRAINS_FROM, BUSES_FROM);
    dropNote();
    if (!line) return;
    noting = line;
    say(line);
    noteTimer = setTimeout(dropNote, 7000);
  };
  map.on('zoomend', () => {
    clearTimeout(settle);
    settle = setTimeout(note, 600);
  });

  // What the map can draw: vehicles on a route it knows, reported recently.
  const features = (dir) => {
    const list = latest?.vehicles?.list ?? [];
    const at = latest?.vehicles?.at ?? 0;
    const out = [];
    for (const row of list) {
      const v = vehicle(row);
      if (at - v.at > STALE_S) continue;
      const route = routeOf(v.route, aliases, (r) => dir.routes.has(r));
      if (!route) continue;
      const r = dir.routes.get(route);
      const off = r.mode === 'rail' && offTrack(track, route, v.lon, v.lat, OFF_TRACK_M);
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] }, properties: { id: v.id, route, mode: r.mode, tier: r.tier, trip: v.trip, bearing: v.bearing, off } });
    }
    return out;
  };

  const draw = (list) => map.getSource('vehicles')?.setData({ type: 'FeatureCollection', features: list });

  // New positions: vehicles already on the map glide to where they are now;
  // the rest appear there.
  const redraw = async () => {
    const dir = await loadDirectory().catch(() => null);
    if (!dir || !on) return;
    // The track, to tell a train off its line. Without it every train is
    // drawn at full strength.
    track ??= await loadData('routes').then(trackIndex, () => null);
    if (!on) return;
    const next = features(dir);
    const from = new Map([...shown].filter(([id]) => next.some((f) => f.properties.id === id)));
    shown = new Map(next.map((f) => [f.properties.id, f.geometry.coordinates]));
    cancelAnimationFrame(glide);
    const still = reduced.matches || !from.size || !next.some((f) => from.has(f.properties.id) && String(from.get(f.properties.id)) !== String(f.geometry.coordinates));
    if (still) return draw(next);
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / GLIDE_MS);
      const k = 1 - (1 - t) ** 2;
      draw(
        next.map((f) => {
          const was = from.get(f.properties.id);
          const [x, y] = f.geometry.coordinates;
          return was ? { ...f, geometry: { type: 'Point', coordinates: [was[0] + (x - was[0]) * k, was[1] + (y - was[1]) * k] } } : f;
        }),
      );
      if (t < 1) glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  };

  // Is what we're showing current? Said once when it stops being so.
  const check = () => {
    if (!on) return;
    label();
    if (heard && Date.now() - heard > QUIET_MS && socket?.readyState === WebSocket.OPEN) socket.close(4000, 'quiet');
    const age = latest?.vehicles ? (Date.now() - skew) / 1000 - latest.vehicles.at : Infinity;
    // Nothing yet, or nothing recent: say so, once the first wait is over.
    if ((latest || Date.now() - since > QUIET_MS / 2) && age > STALE_S) {
      say("Live positions aren't loading right now. The map shows the usual service.");
      if (shown.size) {
        shown = new Map();
        draw([]);
      }
    } else if (latest?.vehicles && !noting) say(null);
    note();
  };

  const handle = (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.v !== SCHEMA) {
      say('Live needs a newer version of this page. Reload to get it.');
      return;
    }
    heard = Date.now();
    skew = heard - msg.at;
    if (msg.kind === 'tick') return check();
    latest = msg;
    check();
    redraw();
  };

  const connect = () => {
    clearTimeout(retry);
    if (!on || document.hidden || (socket && socket.readyState <= WebSocket.OPEN)) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live/stream`);
    socket = ws;
    ws.addEventListener('open', () => (attempts = 0));
    ws.addEventListener('message', (e) => handle(e.data));
    ws.addEventListener('close', () => {
      if (socket === ws) socket = null;
      if (!on || document.hidden) return;
      // Back off to half a minute, with some spread so a relay restart isn't
      // met by every page at once.
      const wait = Math.min(30_000, 1000 * 2 ** attempts) * (0.75 + Math.random() / 2);
      attempts++;
      retry = setTimeout(connect, wait);
    });
  };

  const start = () => {
    on = true;
    button.setAttribute('aria-pressed', 'true');
    try {
      localStorage.setItem(REMEMBER, 'on');
    } catch {
      /* private mode */
    }
    heard = 0;
    noted = -1;
    since = Date.now();
    label();
    connect();
    watch = setInterval(check, 5000);
    if (!latest) say('Finding the trains and buses…');
    else note();
    changed(true);
  };

  const stop = () => {
    on = false;
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('stale');
    try {
      localStorage.setItem(REMEMBER, 'off');
    } catch {
      /* private mode */
    }
    clearTimeout(retry);
    clearInterval(watch);
    cancelAnimationFrame(glide);
    socket?.close(1000, 'off');
    socket = null;
    shown = new Map();
    draw([]);
    clearTimeout(settle);
    dropNote();
    say(null);
    label();
    changed(false);
  };

  button.addEventListener('click', () => (on ? stop() : start()));
  // A hidden tab stops listening; it has nothing to show. It reconnects, and
  // gets the current state at once, when it's looked at again.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) socket?.close(1000, 'hidden');
    else connect();
  });

  // Someone who left with Live on gets it back.
  let remembered = null;
  try {
    remembered = localStorage.getItem(REMEMBER);
  } catch {
    /* private mode */
  }
  if (remembered === 'on') map.once('load', start);

  return {
    // A tap on a vehicle opens its route.
    tapped(point, pad) {
      if (!on) return false;
      const layers = ['vehicles-rail', 'vehicles-bus'].filter((id) => map.getLayer(id));
      const hit = map.queryRenderedFeatures([[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]], { layers })[0];
      if (!hit) return false;
      openRoute(hit.properties.route);
      return true;
    },
  };
}
