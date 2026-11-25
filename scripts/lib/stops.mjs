// What a bus stop's panel says without looking anything up: the lines the
// map draws that stop there, and which way its buses head.

const collator = new Intl.Collator('en', { numeric: true });
const byNumber = (a, b) => collator.compare(a, b);

/**
 * The drawn map routes serving a stop, from RTD's ROUTES field ("FF1, 15L,
 * 0"), in number order and space-separated. `lineOf(code)` names the drawn
 * route a code belongs to (a family member such as FF1 belongs to FF), or
 * null for a code the map doesn't draw, which is left out.
 */
export function stopLines(routes, lineOf) {
  const found = new Set();
  for (const code of String(routes ?? '').split(/[,\s]+/)) {
    if (!code) continue;
    const line = lineOf(code);
    if (line) found.add(line);
  }
  return [...found].sort(byNumber).join(' ');
}

const WORDS = { N: 'North', S: 'South', E: 'East', W: 'West' };

/**
 * RTD's DIR field ("N", "SE", "Northbound"…) as a word for people:
 * "Northbound", "Southeast-bound". Null when there's no direction.
 */
export function heading(dir) {
  const d = String(dir ?? '').trim().toUpperCase();
  const short = d.replace(/BOUND$/, '').replace(/^NORTH/, 'N').replace(/^SOUTH/, 'S').replace(/EAST$/, 'E').replace(/WEST$/, 'W');
  if (/^[NSEW]$/.test(short)) return `${WORDS[short]}bound`;
  if (/^[NS][EW]$/.test(short)) return `${WORDS[short[0]]}${WORDS[short[1]].toLowerCase()}-bound`;
  return null;
}

/**
 * The stops no scheduled trip calls at. RTD's stops layer still lists a stop
 * for a route that has stopped serving it (Ward Rd & W 61st Ave names the 52,
 * which no trip calls at, #168), so a stop is kept only where a trip on one of
 * the build's typical days stops. `known` is every stop id the GTFS feed has
 * and `called` the ones its trips call at. A stop the feed doesn't know is
 * kept: that is the two sources out of step, not a stop without service. When
 * fewer than `share` of the stops are known to the feed at all, the ids no
 * longer match and nothing is dropped (returns null).
 */
export function unservedStops(stops, known, called, share = 0.9) {
  const ids = stops.map((f) => String(f.properties.id));
  const matched = ids.filter((id) => known.has(id)).length;
  if (!ids.length || matched < share * ids.length) return null;
  return new Set(ids.filter((id) => known.has(id) && !called.has(id)));
}
