# Scorecards

Design review cards, newest first. The rubric, the views and the pass rule
are in DESIGN.md, "Design review rubric". Scores: 0 broken, 1 careless,
2 good, 3 poster quality. A change is better than the last version only if
no row goes down and at least one goes up.

## 2026-11-08: readable bus geometry (7f3e635), against the frequency card

Independent design reviewer; captures in the main checkout's
`qa/.scratch/review-2026-11-08-geometry/`, both themes, plus Chris's six
phone findings, all confirmed.

| Row | prev | now | Evidence |
|---|---|---|---|
| Useful | 2 | 1 | At the Federal wye, the I-25 ramp triangle and Civic Center a rider still can't tell where a bus turns; arrows help only on plain one-way streets. |
| Hierarchy | 2 | 2 | Unchanged. |
| Association | 2 | 2 | Paired arrows of two sizes on 15th from overlapping runs. |
| Drawn on purpose | 1 | 1 | Knots at interchanges; main draws the I-25 ramps as a clean X. |
| Calm | 2 | 1 | Civic Center at 16: diagonals, a triangle, dashes, ten arrows; arrows every 150 px speckle downtown at 15. |
| Legible | 2 | 2 | Arrows 6.6:1 light, 5.3:1 dark; core still 2.2:1. |
| Accurate | 2 | 1 | Collapsed laps cut all-day service: 135 m of the 16 on Colfax by Knox, 170 m of the 17 on Colorado Mills Parkway. |
| Across zooms | 1 | 1 | One-way drawn two ways: chevron in wide lines, corner mark on thin. |
| Phone | 2 | 2 | Unchanged. |
| Gorgeous | 1 | 1 | Junctions unfinished; main's ramps and Federal look better. |
| **Total** | **17** | **14** | main 21 |

Verdict: fails, not better. Worst: interchanges drawn as knots (I-25 by
38th/Fox, Federal wye); collapsed laps leaving gaps and teardrops on through
streets (Knox, Colorado Mills); Civic Center still unreadable. Better than
the poster only in saying where buses run one way.

## 2026-11-08: bus streets by combined frequency, against main

Scored by the independent design reviewer (`.claude/agents/design-reviewer.md`),
before it read any other card. Branch `bus-frequency`; Chromium iPhone 14
captures, Live off, both themes: fixed views, the hub at 12.5 to 16, Civic
Center, Broadway/Lincoln, 15th/17th, a quarter-zoom sweep 12 to 16, the Key
at 14. The orchestrator checked the Union Station and 15th Street crops
and agrees.

| Row | main | frequency | Evidence |
|---|---|---|---|
| Useful | 1 | 2 | At 12.5 the 15th/17th trunk, Broadway and Colfax read at once as where buses come often; which route goes where still needs a tap. |
| Hierarchy | 2 | 2 | Rail still leads by hue; in dark the downtown grid is the widest mass beside rail but doesn't outrank it. |
| Association | 2 | 2 | Nothing new labeled; "Union Station" still sits across a bus line at 16. |
| Drawn on purpose | 2 | 1 | The Union Station loop is a round-capped dead end plus a loose stub; widths notch mid-block on 15th/California; Colfax jogs and breaks at Broadway/Lincoln. |
| Calm | 2 | 2 | One line per street keeps downtown from being a wall; cored trunks read as outlined roads at 15 to 16, more in dark. |
| Legible | 3 | 2 | The core, the only "many routes" mark, is 2.2:1 on the ink (2.0:1 dark), under 3:1. |
| Accurate | 3 | 2 | 6.1 of 4,386 km drawn more than 40 m off: JUMP loses 1.5 km in Lafayette, the 31 1.36 km near Federal/112th, the FF 284 m moved onto an I-25 ramp. |
| Across zooms | 2 | 1 | Smooth widening, but the Key has no strand or core row and its three heaviest widths are about 1 px apart. |
| Phone | 2 | 2 | Unchanged. |
| Gorgeous | 2 | 1 | 12.5 is the best downtown has looked; 14.5 to 16 at both terminals is unfinished next to the poster. |
| **Total** | **21** | **17** | |

Verdict: fails, and not better than main (five rows down). Worst faults:
careless joins, ends and loops close in; width and core flickering block to
block; "many routes" unexplained in the Key and the busiest streets losing
their names (15th, 17th, Chestnut Place). Against the poster: better at
saying a street's combined frequency; worse at closed terminal loops,
joins, and keeping corridor names.

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
