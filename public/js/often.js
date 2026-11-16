// How often a route comes on a weekday midday, in a few words. `r` is a route
// (or one stretch of a route) with its tier and weekday headway. Pure, so the sheets and tests can read it.
export function freq(r) {
  if (r.tier === 'none' || r.tier === 'unknown') return 'No weekday service';
  if (r.tier === 'peak') return 'Rush hours only';
  if (r.tier === 'limited') return 'A few trips a day';
  if (r.wk) return `Every ${r.wk} min`;
  return 'A few trips a day';
}
