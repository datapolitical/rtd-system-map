// Where a zoom the reader made comes to rest. One plain function with no DOM or MapLibre in
// it, so the page and the tests share it.

/**
 * The sheet a pinch or a scroll ends on. `from` is the zoom it began at and `to` the zoom it
 * left the map at; `resting` is the sheet the map was on, or on its way to. A zoom of `least`
 * or more goes to the next sheet the way it was heading, however short it was: the reader
 * asked for the next map, and a map that springs back has not listened. It is counted from
 * where the zoom began, not from the sheet shown, so a second scroll that catches the map on
 * its way to a sheet carries on to that sheet and never turns it round. Carried more than
 * `past` of the way beyond that sheet, it goes on to the one after. A map within `near` of a
 * sheet has arrived there, so a second scroll as it comes to rest asks for the one after too.
 * Less than `least` is a slip of the fingers and changes nothing.
 */
export function settle(zooms, resting, from, to, { least = 0.1, past = 1 / 3, near = 0.15 } = {}) {
  const moved = to - from;
  if (Math.abs(moved) < least) return resting;
  const d = Math.sign(moved);
  // The last sheet at or behind where the zoom began; the next one on is where it is going.
  let i = d > 0 ? zooms.findLastIndex((z) => z <= from + near) : zooms.findIndex((z) => z >= from - near);
  if (i < 0 && d < 0) i = zooms.length;
  let next = i + d;
  while (zooms[next + d] !== undefined && (to - zooms[next]) * d > past * Math.abs(zooms[next + d] - zooms[next])) next += d;
  return Math.max(0, Math.min(zooms.length - 1, next));
}
