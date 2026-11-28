// RTD's live predictions for the stops a card shows (DESIGN.md, "Tap anything and it explains
// itself": "live where RTD has a prediction, scheduled otherwise"). The site's relay sends a
// page only the stops it asks for, while its card is open (js/realtime.js, live/src/worker.mjs).
// This is the page's side: asking, deciding whether what came back is fresh enough to call
// live, and putting it in the shape departures.js applies to the timetable. It knows nothing of
// the map that shows the card, so the zoomable map uses it as it is (test/panel-live.test.mjs).
//
// Nothing here is shown as live unless RTD's feed is fresh and the relay is still talking. A
// relay that sends no predictions (an older one), a feed that fails, or a dropped connection
// all leave the timetable's scheduled times, labelled as scheduled.

import { PREDICTIONS_STALE_S, SCHEMA } from '../realtime.js';

// The relay polls every 15 seconds: with nothing from it for this long, it is not talking.
export const QUIET_MS = 50_000;

/** What the relay sent, kept with when it arrived: null for anything that is not this page's predictions. */
export function received(text, at) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.v !== SCHEMA || m.kind !== 'stops') return null;
  return { at, feed: m.feed ?? 0, problem: Boolean(m.problem), stops: m.stops ?? {} };
}

/**
 * Whether predictions may be shown as live at `now` (ms): the relay answered lately, RTD's feed
 * could be read, and the feed itself is not old.
 */
export function fresh(state, now) {
  return Boolean(state) && !state.problem && now - state.at <= QUIET_MS && now / 1000 - state.feed <= PREDICTIONS_STALE_S;
}

/**
 * The predictions as departures.js's `upcoming` takes them, for the stops `ids` (in step with
 * its records) and their `trips` (the build's trips files, in step too). `index.tripBase` says
 * how a trip's id is read from those files.
 */
export function liveFor(state, ids, trips, index, now) {
  const base = index.tripBase;
  return {
    trips,
    id: (n) => (base === null || base === undefined ? String(n) : String(base + n)),
    at: ids.map((id) => new Map((state.stops[id]?.times ?? []).map(([trip, time]) => [String(trip), time]))),
    skipped: ids.map((id) => new Set((state.stops[id]?.skipped ?? []).map(String))),
    nowS: now / 1000,
  };
}

/**
 * The connection that watches stops. `url` is the relay's stream for a card; `changed()` is
 * called when predictions arrive. `watch(ids)` says which stops to send (none: the card closed,
 * and the connection is let go); calling it again with the same stops is how a dropped
 * connection is picked up again. `state()` is the latest answer, or null.
 */
export function watcher(url, { changed = () => {}, Socket = globalThis.WebSocket, clock = () => Date.now() } = {}) {
  let socket = null;
  let wanted = [];
  let latest = null;
  const say = () => { if (socket?.readyState === 1) socket.send(JSON.stringify({ watch: wanted })); };
  const open = () => {
    if (!Socket || (socket && socket.readyState <= 1)) return;
    try {
      const s = new Socket(url);
      socket = s;
      s.onopen = () => { if (socket === s) say(); };
      s.onmessage = (e) => {
        const got = socket === s && typeof e.data === 'string' ? received(e.data, clock()) : null;
        if (!got) return;
        latest = got;
        changed();
      };
      s.onclose = () => { if (socket === s) socket = null; };
      s.onerror = () => {};
    } catch {
      socket = null;
    }
  };
  return {
    watch(ids) {
      const same = ids.length === wanted.length && ids.every((id, i) => id === wanted[i]);
      wanted = [...ids];
      if (!wanted.length) {
        latest = null;
        try { say(); socket?.close(1000); } catch { /* already gone */ }
        socket = null;
        return;
      }
      if (!same) latest = null;
      if (socket?.readyState === 1) { if (!same) say(); } else open();
    },
    state: () => latest,
  };
}
