# Coverage inventory, 2026-11-21

This inventory follows the architecture split. The older
`qa/rules/design-invariants.md` audit describes Classic on 2026-11-11;
its counts must not be presented as current coverage.

| Concern | Available evidence | Remaining gap |
|---|---|---|
| Health | Default browser checks: five scales, both themes, requests/console/style | Visual/usability verdict |
| Selection | One data-derived rail route, theme/reload/Escape | All routes, tap targets, richer rider tasks |
| Station identity | Every station feature against pre-drawing IDs, display names and lines; served station/name presence on sheets 2–4 | Pipeline truth, readable rendered labels |
| Duplicate marks | Every exact mark geometry; distinct platforms allowed | Perceptual overlap/association |
| Rail identity | Every rail/letter ID; letter presence somewhere per sheet | Visibility in useful views, stable chip order |
| Stray stops | Every stop against streets carrying its routes | Real-case triage; independent street/GTFS accuracy |
| Geography | Existing `check:accuracy`: bus geometry against ArcGIS/GTFS | Shares build helpers; not an independent rider-answer grader |
| Accessibility | Color/unit checks and `check:a11y` | Complete rendered contrast, VoiceOver, physical devices |
| Smooth zoom | Explicit collector, modes/themes, boundaries/fractional samples; existing trial checks | Full range and physical performance; motion review separate |
| Label continuity | `review.mjs` compares common rendered-name anchors; real recorded regression plus synthetic/control tests | Chip order, continuous motion and unsampled locations |
| Usefulness/beauty | Rubric and inspected captures | Blind rider-success benchmark and reviewer calibration |
| Detector reliability | Historical recall and new challenge/control tests | Real-world false-alarm rate |

`node --test test/evaluation.test.mjs` challenges changed station identities,
duplicate marks, removed stations/names/letters, unknown routes, moved stops
and stops beside the wrong route. Controls include distinct platforms,
abbreviated display labels, low-scale omissions and an on-route stop. A remote
stop demonstrates independence from the usual camera locations. Synthetic
success is limited to these scenarios, not a real-world detection estimate.

`check:recall` writes `coverage.json`/`coverage.md` and a scoped CI summary.
Its baseline remains a non-regression check. No thresholds were lowered and
no missed Classic cases were removed. See [the procedure](../../docs/evaluation.md)
and [dated scorecards](../../scorecards.md).
