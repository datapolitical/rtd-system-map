# Scorecards

Design review cards, newest first. The rubric, the views and the pass rule
are in DESIGN.md, "Design review rubric". A card has two gates, Accurate and
Legible, which pass or fail, and ten judged rows scored 0 broken, 1 careless,
2 good, 3 poster quality, for a total out of 30. A change is better than the
last version only if no gate that passed now fails, no row goes down, and at
least one goes up.

The cards dated 2026-11-08 below predate this card (2026-11-10): they score
Accurate and Legible 0 to 3 as rows and have no Coherence or Topographicity
row. They are left as they were scored.

## 2026-11-21: current-sheet and smooth-zoom evidence baseline

**Verdict: incomplete; no overall pass.** This establishes current evidence
and exposes gaps. It does not claim a rendering improvement or a release.
Reviewer: Codex, self-review; no independent design review claimed.

- Current sheet runtime: `f8299c0c6b1e6907c1387d2f337aa2e42ff6724d`.
  QA edits were uncommitted at capture time and are identified as dirty in the
  report; deployed runtime/build source was unchanged.
- Trial: unchanged `329752293fdc756a10f5d68a1c17391f4e849684`, explicitly `/zoom/`,
  offset and drawn modes. Both use the preserved input snapshot built
  `2026-11-19T04:51:34.367Z`, not newly fetched production data.
- Chromium software rendering, 390 × 844, light/dark, seed 21. Current:
  five scales plus shared track, terminal and three sampled stations (20
  captures). Trial: 12, 12.99, 13.01, 14 at the hub, shared track, terminal,
  samples at 13.37, both modes/themes (36 captures). Actual cameras recorded.
- Validation: **511 unit/regression tests and 8 browser checks pass**. The
  new challenge/control tests include a real recorded, screenshot-confirmed
  anchor flip. Browser checks cover health, selection/theme/reload/Escape and
  Classic redirects. A stopped-server attempt is retained separately.

| Gate or row | Current sheets | Smooth-zoom trial |
|---|---|---|
| Accurate | Unmeasured overall: identity/completeness checks passed their stated scope; 23 diagnostic leads need triage | Unmeasured: independent route/data truth not established by this run |
| Legible | Unmeasured: complete rendered contrast/readability not established | Unmeasured: complete rendered contrast/readability not established |
| Across zooms | Unmeasured: no complete transition review | **1, fails:** common rendered names change anchor; confirmed Union Station side/chip-order change between 12.99 and 14 |
| Useful, Hierarchy, Association, Calm, Phone, Drawn on purpose, Coherence, Topographicity, Gorgeous | Unmeasured: captures inspected for specific findings, not a complete calibrated score | Unmeasured: captures inspected for specific findings, not a complete calibrated score |

The whole-feature audit examined **34,992 features**, including all **6,853
stops**. It flagged 22 stop-to-own-route proximity leads and no B letter
feature anywhere on sheet 0. These are not automatically confirmed defects;
classification and any fixes are tracked in [#168](https://github.com/datapolitical/rtd-system-map/issues/168).
Stop proximity uses a diagnostic project tolerance, not a GTFS truth test.

The trial metadata review caught **16 anchor-change observations across three
stations**, repeated across modes/themes; not 16 unique defects. The inspected
Union Station views show the name above-left at 12.99 and below at 14, with
chip order changing. The recorded pair is in
`test/fixtures/zoom-anchor-observations.json`; `qa/evaluation/review.mjs` catches it.
This remains prototype work, not a request for the user to repeat routine QA.

[Download the complete evidence](https://github.com/datapolitical/rtd-system-map/releases/download/checks-fixtures/evaluation-2026-11-21-f8299c0-3297522.zip)
(10,600,715 bytes; SHA-256
`d9bf918f4f9b75879f1c3710e91b561c8ec047f5d53899bd0ca0cd086b6c91d5`).
It contains the 56 images, fingerprinted input/module bytes, evaluator sources,
actual cameras, audits, transition findings, test results and failed attempts.
External basemap tiles are not frozen. Physical-phone performance, blind rider
task success, real-world detector precision and distinct design review remain
explicit gaps. Historical Classic recall is reported separately.

## 2026-11-08: bus bundling, prototype round two, against main

Question: where does each bus go downtown? Views: downtown over the hub at
12.5 and 14.5, one screen southeast at 14.5, the longest suburban corridor
at 14.5; light and dark. Captures on branch `bundles-prototype`, in
`.captures/` of its worktree. Scored by the orchestrator, who did not build
it; no second reviewer yet. The Chromium re-run of the checks is pending,
so Legible is scored by eye.

| Row | main | round two | Evidence |
|---|---|---|---|
| Useful | 1 | 2 | main draws a street once, so no route can be followed. Round two: routes countable on 15th and Broadway, but identical lines can't be followed through a corner. |
| Hierarchy | 3 | 1 | Bundles of twelve at full ink outweigh the rail beside them at Union Station. |
| Association | 3 | 2 | Nothing labeled yet; a member of a bundle can't be told from its neighbor without a tap. |
| Drawn on purpose | 2 | 1 | Knots at Union Station and Civic Center Station; round caps where a tier drops mid-block; corners not concentric. |
| Calm | 3 | 1 | Downtown at 14.5 reads as a striped band, not lines. |
| Legible | 3 | 2 | Two frequent routes (15, 15L) sit a hairline apart. |
| Accurate | 3 | 2 | Terminal loops are drawn as tangles, not the paths buses take. |
| Across zooms | 2 | 1 | One line becomes twelve in a single step at 14.5. |
| Phone | 2 | 2 | Unchanged. |
| Gorgeous | 2 | 1 | Not yet something to show anyone. |
| **Total** | **24** | **15** | |

Verdict: round two fails the test (Accurate and Legible below 3, five rows
below 2) and is not better than main: Useful rises, seven rows fall. Lowest
rows, the next work: Hierarchy, Drawn on purpose, Calm, Across zooms,
Gorgeous. Main fails too, on Useful (1): it can't say where buses go, which
is why this work exists.

### Second card, by the design-reviewer agent (independent)

Its own Chromium captures (iPhone 14, Live off), both themes: the fixed
views, the hub at 12.5 to 16, Civic Center and Union Station transit centers
at 15, a quarter-zoom sweep 13.75 to 15.25, and the Broadway/Lincoln
corridor at 12.5 and 14.5. Captures in `qa/.scratch/review-2026-11-08-bundles-r2/`
(not kept in git). Scored before reading the card above.

| Row | main | round two | Evidence |
|---|---|---|---|
| Useful | 1 | 1 | Round two: a line can be traced along 15th/17th but not through the Broadway/Lawrence crossing or either terminal; no route numbers. |
| Hierarchy | 2 | 1 | Squinted, bus packs of 8 to 12 are the heaviest mass downtown; in dark, solid bands as wide as the rail pack. |
| Association | 2 | 1 | No member of a pack tied to its route without a tap; "Union Station" on the bus knot at 16 (main puts it on one bus line). |
| Drawn on purpose | 2 | 1 | Knots at both terminals, dash fragments attached to nothing, beads, stubs, a bowtie pinch near I-25/Broadway. One good concentric corner at 17th. |
| Calm | 2 | 1 | 15th and 17th become walls of lines; every crossing a knot. |
| Legible | 3 | 2 | Members 1.15 widths apart: a gap under 1 px at 15, so neighbors fuse, worst in dark. |
| Accurate | 3 | 0 | The northbound 0 and 0L are moved off Lincoln onto Broadway for about 2.5 km; about 60 km of every-30-minute-or-better service is drawn more than 40 m from where main draws it. |
| Across zooms | 2 | 1 | One line becomes up to twelve in one step at 14.5. |
| Phone | 2 | 2 | Unchanged. |
| Gorgeous | 2 | 1 | Unfinished next to the poster's downtown inset, worst at the terminals. |
| **Total** | **21** | **11** | |

Verdict: round two fails (Accurate 0) and is not better: no row up, eight
down. Where the cards disagree: the orchestrator gave Accurate 2 and missed
that whole routes leave their street (checked: in round two Lincoln keeps
only the dashed rush-hour line, and the rest is drawn on Broadway); the
reviewer gives Useful 1, since without numbers and with routes on the wrong
streets a rider still can't say where a bus goes; and it marks main's
Hierarchy, Association and Calm 2, not 3. The next work, in order: Accurate
(bundle only routes that run on that street; every route stays within tens
of meters of its own), then the terminal and crossing knots, then pack
weight, spacing and a gradual opening across zooms.
