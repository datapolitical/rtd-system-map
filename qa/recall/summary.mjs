// Explicitly scoped coverage: a non-regression baseline is not acceptance.
export function coverageSummary(results) {
  const score = (xs) => ({ total: xs.length, pipeline: xs.filter((x) => x.pipeline).length, pointed: xs.filter((x) => x.looking).length });
  const known = results.flatMap((r) => r.finds);
  const planted = results.flatMap((r) => r.planted);
  return {
    profile: 'historical-classic', currentMapAcceptance: false,
    known: score(known), planted: score(planted),
    byKind: Object.fromEntries([...new Set(planted.map((p) => p.kind))].sort().map((kind) => [kind, score(planted.filter((p) => p.kind === kind))])),
    precision: 'unmeasured: unexplained findings have not been classified as real faults or false alarms',
    limitation: 'Only these frozen Classic fixtures and plants. A green job means no detection regression against baseline.json; known blind spots may remain.',
  };
}

export function coverageMarkdown(summary) {
  const count = (s, key) => `${s[key]}/${s.total}`;
  return [
    '### Historical Classic detector coverage', '',
    '**This job does not establish current-sheet or smooth-zoom acceptance.**', '',
    '| Targets | Default scan | Targeted scan |', '|---|---:|---:|',
    `| Known case/build pairs | ${count(summary.known, 'pipeline')} | ${count(summary.known, 'pointed')} |`,
    `| Planted faults | ${count(summary.planted, 'pipeline')} | ${count(summary.planted, 'pointed')} |`,
    ...Object.entries(summary.byKind).map(([kind, s]) => `| Plant: ${kind} | ${count(s, 'pipeline')} | ${count(s, 'pointed')} |`),
    '', summary.limitation, '', `Precision: ${summary.precision}.`, '',
  ].join('\n');
}
