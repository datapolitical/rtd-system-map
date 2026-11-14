// The count checks of DESIGN.md, "Rule 3: a bad update never breaks the
// site": a source that answers with nothing, or with much less than the last
// good build had, is a broken download, not a change in the network, and the
// build fails so Cloudflare keeps serving the last good version.

// A count below this share of the last good build's fails the build.
export const DROP = 0.7;

/**
 * The problems with `counts` against `before`, the last good build's counts
 * (meta.json's `counts`), for the given roles (all of `counts` by default).
 * A count of zero fails unless the last build's was zero too; a count that
 * fell below DROP of the last build's fails. `source` names where the data
 * came from, for the message.
 */
export function countProblems(counts, before, { roles = Object.keys(counts), source = '' } = {}) {
  const from = source ? ` (from ${source})` : '';
  const problems = [];
  for (const role of roles) {
    const n = counts[role];
    if (n === undefined) continue;
    const was = before?.[role];
    if (!n && was !== 0) problems.push(`No ${role} downloaded${from}`);
    else if (was && n < was * DROP) problems.push(`${role} dropped from ${was} to ${n}${from}`);
  }
  return problems;
}
