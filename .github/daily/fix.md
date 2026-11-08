# Daily work: one issue

You work on the RTD system map (datapolitical/rtd-system-map). Today you
take ONE issue and move it forward. Your worktree is a fresh checkout of
origin/main. Make or switch to the issue's branch.

## Which issue

The workflow's picker has already chosen today's job and printed it in
the assignment below (or passed it as the `issue` input). Work only on
that issue.

## Before you start

- Read `CLAUDE.md` in the worktree root and follow it. `DESIGN.md` is
  the source of truth. Never hardcode anything about RTD's network:
  derive it from RTD's data at build time.
- Read the issue and all its comments. The newest instruction wins:
  the latest "Instructions for the agent (round N)" comment, or Chris's
  newest comment on a `needs Chris` issue.
- Add the `in progress` label and comment which branch you are on
  (`gh issue edit <N> --add-label "in progress"` and
  `gh issue comment <N> --body "Working on branch <branch>: ..."`).
- Branch from origin/main, or from the branch the issue's work is
  already on when the instructions say to continue it. Never push to a
  branch the job did not create, except the ledger's `my_branches`.
  Never force-push.

## The bar

The map must be both useful and beautiful. Visual work is not done
until it is both. Put visual criteria in every change and check them:

- Useful: a rider on a phone can tell what the place is, where each
  line stops, and where to change. Text legible and clear of other
  marks, in both dark and light.
- Beautiful: calm, consistent with the rest of the map, no clutter, no
  stray marks, no clashing colours, nothing that looks broken or
  temporary.

For visual work, take before/after captures (phone 402x874, Chromium,
both themes) under `qa/.scratch/` in the worktree, look at them, and
score them against DESIGN.md's design review rubric. Save the
after-captures; the workflow uploads them as the run's artifact.

## Checked against the real place

Before you ask for evaluation, check your own work against satellite
imagery with `qa/sat/render.py`
(`python3 qa/sat/render.py public/data/ <out.png> W,S,E,N`; the workflow
installs Pillow). Every shape the map draws — stations, platforms,
terminals, buildings, lines, labels — must sit on the real structure in
the photo. Rail lines end where the platforms really end. A station's
label sits on the place riders know by that name. Something underground
is drawn as underground, not as a building or a street on the surface.
No apartment block, office block or parking garage is drawn as a station
because of its name.

## Map changes

- Your commits, comments and issues are credited to your model
  automatically: the git author is set and `gh` adds a "Made by" line and
  label. Do not set `git config user.name` or `user.email`, and do not pass
  `--author`.
- Push the branch (`git push -u origin <branch>`). Do not merge map
  changes to main.
- Pushes made with the workflow token do not start other workflows, so
  start the branch-preview checks yourself:
  `gh workflow run checks-preview.yml --ref <branch>` (or
  `checks-preview` by name). The Cloudflare preview itself is built
  separately; you do not need a Cloudflare credential.
- When the branch preview shows the commit (it answers at
  `https://<branch>.rtd-system-map.pages.dev`), post an evaluation
  request (below), then set `ready for evaluation` and remove
  `in progress`
  (`gh issue edit <N> --add-label "ready for evaluation" --remove-label "in progress"`).
  Never add `needs Chris` for a routine phone check; the evaluator
  decides what goes to Chris.
- Docs, tests and CI only: these may go to main fast-forward with a
  commit message ending `Fixes #N`
  (`git push origin <branch>:main` after a rebase, never force). They
  still ask for evaluation first unless the issue says otherwise; the
  evaluator's pass closes them by hand or the next run merges them.

## Evaluation request

One comment on the issue. Its first line is exactly `Evaluation request`,
then one fenced `json` block with exactly these fields:

```json
{
  "branch": "<branch>",
  "commit": "<full sha>",
  "round": 3,
  "asked": "what the issue or the last instructions asked for",
  "changed": "what this round changed, in plain words",
  "places": [
    {"name": "Union Station", "bounds": [-105.0052, 39.7517, -104.9988, 39.7566],
     "views": ["https://<branch>.rtd-system-map.pages.dev/#16/39.7540/-105.0015"]}
  ]
}
```

- `round` counts evaluation rounds on this issue: the ledger's `rounds`
  for the issue, plus one for this request. The first request is round 1.
- `bounds` are small (a few hundred metres), around what changed.
- `views` open the map at the zooms where the change shows, so the
  evaluator does not have to guess the map's URL format. Use the
  `#<zoom>/<lat>/<lon>` form (for example
  `#16/39.7540/-105.0015`). Include dark and light where the change
  differs by theme.
- Keep the comment about the map only.

## If you run low on turns

Stop at a clean commit, push, comment where you stopped, and write
`daily-summary.txt` saying so. Do not post an evaluation request for
unfinished work.

## Finish

Write `daily-summary.txt` in the worktree root, last: at most three short
plain lines — the issue (number and title), what changed, and where it
was handed off (evaluation request posted, branch, commit). The workflow
takes this file to mean you are done. Until it exists you will be told to
carry on, so write it only when the job is finished or you are truly
blocked, and if blocked, say why in it.

After you, the workflow reads what the run did from GitHub and sets the
labels: with an evaluation request posted, the issue goes to the
evaluator; without one, it goes to Chris (`needs Chris`) with your
summary as the reason. Do not add `needs Chris` yourself.
