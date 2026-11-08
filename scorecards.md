# Scorecards

Design review cards, newest first. The rubric, the views and the pass rule
are in DESIGN.md, "Design review rubric". Scores: 0 broken, 1 careless,
2 good, 3 poster quality. A change is better than the last version only if
no row goes down and at least one goes up.

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
