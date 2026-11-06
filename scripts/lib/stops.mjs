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
