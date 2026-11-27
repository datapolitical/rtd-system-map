# RTD system map

Read [DESIGN.md](DESIGN.md) before changing the map, interface, or data
pipeline. It is the source of truth for the objective, audience, data sources,
visual design, and milestones. If a decision changes, update DESIGN.md and add
a line to its decision log in the same change.

Never write a real server or tailnet address into a committed file; the repo
is public. Read it from `RTD_REVIEW_ORIGIN` or `RTD_SITE_URL`, or write a path
that starts at the root, like `/shots/`. `test/no-tailnet-addresses.test.mjs`
fails on any tracked file that holds one.

Never hardcode anything about RTD's network: layer URLs, route lists, rail
colors, station IDs, corridor assignments, or service dates. Derive them from
RTD's data at build time so RTD's changes flow through with no code change
(DESIGN.md, "Zero maintenance").

- `npm run build:data` downloads RTD's public ArcGIS layers and GTFS into
  `public/data/` and takes the loading pictures. It runs on our own machine,
  by hand, and its output (`public/data/`, `public/poster/`) is not committed
  (DESIGN.md, Rule 2). `npm run build:sheets` redraws the sheets and pictures
  from the data on disk, for a drawing change without RTD's newer data.
  `npm run build` runs the publish check: it fails if the built data wasn't
  made by the code beside it. `npm run deploy` runs that check and uploads
  `public/` to Cloudflare Pages: from a branch it makes a preview at
  `<branch>.rtd-system-map.pages.dev`, from `main` it publishes the live site.
  A merge publishes nothing. The smooth-zoom trial is never committed.
  `refresh/watch.mjs` sends the phone alert when RTD changes.
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
- The implementation agent owns routine visual, interaction and regression QA
  ([docs/verification.md](docs/verification.md), updated 2026-11-21). Inspect
  actual captures, fix defects and verify them before involving Chris.
  `needs Chris` is only for a specific product tradeoff, final release approval,
  or a prepared physical-device check the available tools cannot perform.
  State the exact question, evidence and why the agent cannot resolve it.
- "Launch (v1.0)" holds what must be done before launch; the later
  milestones (DESIGN.md, the roadmap after launch) hold what can wait. Put
  new work in the one it belongs to, and ask Chris before adding to the
  launch milestone.
- Releases (DESIGN.md, "Launch and versions"): only after Chris signs off a
  milestone, tag `main` with `git tag -a vX.Y`, push the tag, and run
  `gh release create vX.Y --notes` listing the milestone's closed issues.
  Never tag on your own judgment that a milestone is done.
- New work gets its own issue in the right milestone. Add a line
  `Estimate: N min of agent time` to the body when you can guess one.
- The repo is public. Keep issues about the map: no usage or budget numbers,
  no personal details.

## How to work here

- Drawing work goes in the order [docs/refining.md](docs/refining.md) sets
  out, with a work log kept as it happens. Rebuilding for RTD's new data and
  what watches the live site are in [docs/upkeep.md](docs/upkeep.md).
- Read [docs/development.md](docs/development.md) for the branch boundaries.
  `main` owns the current sheet map; `zoom-prototype-154` owns smooth-zoom
  experiments; `classic-archive` preserves the earlier application. Do not
  merge the archive back into main or restore Classic under `public/`.
  Fix shared/current-map faults on main first, then bring main into the
  smooth-zoom branch. Its preview and checks must explicitly exercise `/zoom/`.
- `npm run check` checks the current sheet map. `check:classic*` requires an
  explicitly selected archive server and never substitutes for a current-map check.

- The bar is a map that is both useful and beautiful. Visual work isn't done
  until it is both. Put visual criteria in every builder brief and every
  review.
- Several sessions share a checkout and switch its branch without warning.
  Do feature work in its own worktree (`git worktree add`), and check
  `git branch --show-current` in the same command as `git commit`.
- To bring a pull request up to date, merge `origin/main` into its branch
  and push normally; pull requests are squash-merged, so the branch's own
  history rarely matters. Rebasing, amending or force-pushing a branch that
  is already on GitHub needs Chris's OK first: tell him why it is better
  than a merge in this case, and wait for his answer. A task that says
  "rebase" does not count as that OK.
- Run one heavy agent (dev server plus headless browser) at a time, and stop
  each dev server when its agent finishes. With a Playwright device profile,
  pass `browserName: 'chromium'`: profiles such as iPhone 14 default to
  WebKit, whose GPU process can use many gigabytes. Keep captures in
  `qa/.scratch/` (ignored by git), not /tmp.
- Agent time is budgeted. Before starting a build or review agent, follow the
  budget rule Chris gave you (it stays off this public repo). If you don't
  have it, ask.

## Checks: what "done" and "verified" mean

- Follow [docs/evaluation.md](docs/evaluation.md): name the version, rider
  consequence and priority; preserve before/after evidence and detector controls;
  record unmeasured criteria. Historical Classic recall is not current-map
  acceptance. `npm run check:evidence` collects scoped, fingerprinted evidence.

- A "Done when" line in an issue changes only when Chris says so. His
  2026-11-21 instruction assigns routine evaluation to the agent; replace
  blanket manual-review gates with evidence-backed agent verification,
  preserving correctness, accessibility and performance requirements.
  Device-specific gaps and formal release approval stay explicit. If one
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
- Branch previews no longer run the map checks: Chris turned the "Checks
  (branch preview)" workflow off on 2026-11-13 because waiting on it slowed
  work down. Don't wait for a `checks/map` status before merging or asking
  for a phone check. The nightly run is only the live site's page health
  check now; the other checks run only by hand.

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

## Review page

`review/` (README there) is where Chris reviews map work on his phone: a
session posts a review request with `shotctl publish manifest.json` (before/
after pictures, an `ask` saying what he must do, and optional `choices` he can
tap instead of typing), and he answers with picks, comments and screenshots. A
Claude Code hook (`review/hook.py`) hands what he sends to the main session
working in an `rtd-system-map*` checkout at its next tool call. When it does,
read any images named, tell Chris what you will do, and mark each item handled
with `shotctl done ID --note "..."` (the note is his reply). Ask through the
review page whenever you need his eyes or a decision. The service runs on
mini as a systemd user unit (`review/systemd/`), from a checkout pinned to
main; its data and settings stay out of git.
