# RTD system map

Read [DESIGN.md](DESIGN.md) before changing the map, interface, or data
pipeline. It is the source of truth for the objective, audience, data sources,
visual design, and milestones. If a decision changes, update DESIGN.md and add
a line to its decision log in the same change.

Never hardcode anything about RTD's network: layer URLs, route lists, rail
colors, station IDs, corridor assignments, or service dates. Derive them from
RTD's data at build time so RTD's changes flow through with no code change
(DESIGN.md, "Zero maintenance").

- `npm run build` downloads RTD's public ArcGIS layers and GTFS into
  `public/data/` (generated, not committed).
- `npm run dev` serves the site locally with `wrangler pages dev` on port 8788;
  `npm run dev:live` runs the Live relay (a Durable Object in `live/`) beside
  it on 8789, which the site finds on its own.

## What's left to do: GitHub Issues

Open work lives in this repo's Issues, not in chat. Each open
milestone is one stage of work, and Chris's status page draws its "How close
we are" section from them (closed issues show as done).

- Start with `gh issue list --milestone "<stage>"`. Before working an issue,
  add the `in progress` label and comment the branch you are on.
- Post progress as a one-line comment. The status page shows the first line
  of the newest comment under the step.
- Close work with `Fixes #N` in the commit message. It closes when the commit
  reaches main on GitHub. Close it by hand if the work lands another way.
- When something waits on Chris (a phone check, a decision, the go-ahead to
  publish), add the `needs Chris` label and say what is needed in a comment.
- New work gets its own issue in the right milestone. Add a line
  `Estimate: N min of agent time` to the body when you can guess one.
- Say who did the work. Before committing or commenting, run
  `source .github/daily/madeby/madeby.sh; made_by <model>` (`made_by Claude`
  for Claude). It sets the commit author to the model, and `gh` then ends
  each comment, issue and pull request with "Made by: ..." and adds the
  `made by: free model`, `made by: DeepSeek` or `made by: Claude` label.
- The repo is public. Keep issues about the map: no usage or budget numbers,
  no personal details.

## How to work here

- The bar is a map that is both useful and beautiful. Visual work isn't done
  until it is both. Put visual criteria in every builder brief and every
  review.
- Several sessions share a checkout and switch its branch without warning.
  Do feature work in its own worktree (`git worktree add`), and check
  `git branch --show-current` in the same command as `git commit`.
- Run one heavy agent (dev server plus headless browser) at a time, and stop
  each dev server when its agent finishes. With a Playwright device profile,
  pass `browserName: 'chromium'`: profiles such as iPhone 14 default to
  WebKit, whose GPU process can use many gigabytes. Keep captures in
  `qa/.scratch/` (ignored by git), not /tmp.
- Agent time is budgeted. Before starting a build or review agent, follow the
  budget rule Chris gave you (it stays off this public repo). If you don't
  have it, ask.

## Checks: what "done" and "verified" mean

- A "Done when" line in an issue changes only when Chris says so. If one
  looks wrong, say why in a comment and add `needs Chris`; keep working to it
  until he answers.
- "Verified" says what was run: the themes, the views or places, the zooms,
  the build's commit, and a link to the run or its output. A run over part of
  what a done-when names is reported as that part, not as done.
- A detector that reports nothing at a known fault is broken, not proof that
  the map is right. Before changing a detector's rule or threshold, run
  `npm run check:recall` (qa/recall/README.md): a change that lowers its score
  is not done, whatever it does to the report's count of findings. When the
  score goes up, update `qa/recall/baseline.json` in the same commit.
- When you or Chris find a fault the checks missed, pin it in
  `qa/recall/finds.json` on the build it was seen on, then fix it.

## Status page

`node status/server.mjs [port]` (default 8795) serves a page that reads this
repo's milestones and issues through `gh`. From the top: issues labeled
`needs Chris` ("Waiting on you"), the jobs running now, the milestones ("How
close we are") and Claude usage. A folded "Details" section holds the rest:
issues labeled `in progress`, each with the first line of its newest comment,
and, for every checkout of the repo on that machine, the Hermes agents and
Claude Code sessions working there with their latest commands (read from
`~/.hermes/state.db` and the transcripts in `~/.claude/projects`), agents'
progress files, the newest captures in `qa/.scratch/`, and recent commits.

The jobs come from `status/jobs.json` (ignored by git; `JOBS_FILE` can point
elsewhere), which a collector on the machine running the agents rewrites
every few minutes. It isn't in this repo. Each job has a health light from
facts alone (green when a file in its worktree changed in the last 15
minutes, yellow up to 30, red after that or when a step stopped), its steps,
the issue's "Done when" line, facts (uncommitted files, the last test run,
the last commit and whether it is pushed, the last command), and a short
summary a model writes every 15 minutes from the job's commands and their
output, never its reasoning.

Run it from its own worktree pinned to main, used for nothing else
(`git worktree add --detach ../rtd-system-map-status origin/main`), so a
session switching a shared checkout's branch can't stop it from starting. To
update it, check out the newer origin/main there and restart the server.

When you read Claude plan usage, add a reading to `status/usage.json`, which
git ignores: `{"plan": "Pro", "snapshots": [{"t": "<ISO time>", "w":
[{"label": "Weekly · all models", "pct": 86, "resets": "<ISO time>"}],
"note": "optional"}]}`. The page charts the readings. They never go in a
commit.

Any agent can also keep a progress file at `.agents/<short-name>.json`
in the root of its worktree (ignored by git) and rewrites it whenever its
step changes:

```json
{"name": "frequency-r4", "issue": 6, "branch": "bus-frequency",
 "state": "working", "step": "Civic Center: drawing the terminal's footprint",
 "updated": "2026-11-11T18:02:00Z",
 "log": ["Newest first, one line each"],
 "captures": ["qa/.scratch/r4/civic-16.png"]}
```

`state` is `working`, `waiting` or `done`. A `working` file not updated for
15 minutes shows as quiet, and files older than a day drop off. Captures must
be PNGs under `qa/.scratch/`.
