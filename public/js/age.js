// Words for Live's pill and its zoom note. Pure, so tests can import them
// (DESIGN.md, "Live: what's running now").

// Under this the positions are "just now"; the feed itself updates about
// every 30 seconds, so a fresh pill never reads older than one update.
export const JUST_NOW_S = 30;

/** How old the positions are, as a rider would say it. Never a clock time. */
export function ageText(seconds) {
  const s = Math.max(0, seconds);
  if (s < JUST_NOW_S) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const hr = Math.floor(s / 3600);
  return hr < 24 ? `${hr} hr ago` : 'over a day ago';
}

/** The pill's words: "Live" until positions have arrived, then their age. */
export const pillText = (seconds) => (seconds == null || !Number.isFinite(seconds) ? 'Live' : `Live, ${ageText(seconds)}`);

/**
 * Which vehicles show at this zoom: 0 none, 1 trains only, 2 trains and buses.
 */
export const band = (zoom, trainsFrom, busesFrom) => (zoom < trainsFrom ? 0 : zoom < busesFrom ? 1 : 2);

/** What to tell someone who has Live on but can't see everything it draws. */
export const NOTES = [
  'Zoom in to see the trains.',
  'Trains are on the map. Zoom in for buses.',
  null,
];
export const zoomNote = (zoom, trainsFrom, busesFrom) => NOTES[band(zoom, trainsFrom, busesFrom)];

/**
 * What the dot on the Live pill means in each of its states, for the key's
 * Live rows. `staleS` is the age past which positions are stale (STALE_S in
 * realtime.js, which live.js dims the dot by).
 */
export function dotStates(staleS) {
  const min = Math.round(staleS / 60);
  return [
    { state: 'fresh', text: `Fresh: the dot on Live pulses. The positions are up to ${min} min old.` },
    { state: 'stale', text: `Stale: the dot dims and stops. Nothing newer than ${min} min has come; the pill says how old the positions are.` },
    { state: 'off', text: 'Off: the dot is gray, and the map shows the usual service.' },
  ];
}
