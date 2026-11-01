# QA brief

You are checking an unofficial, phone-first map of RTD's transit network
(Denver), built only from RTD's public data. Your job is to **find problems
and prove them**, not to fix them. Another reviewer will check every finding
before anything in the project changes, so a false report costs little and a
silent change costs a lot.

Read `CLAUDE.md` and skim `DESIGN.md` (the spec) before starting.

## Rules

1. **Work on the branch `qa/deepseek`.** Create it from `main`. Commit after
   each task with a message starting `qa:`, and push only that branch. Never
   commit to `main`, never force-push, never rewrite history.
2. **Write only inside `qa/`.** Do not edit anything in `scripts/`,
   `public/`, `test/`, `functions/`, `DESIGN.md`, `CLAUDE.md`,
   `package.json`, `package-lock.json` or `.gitignore`. If a check seems
   to need a project change, write that down as a finding instead.
   Tools you need go in `qa/package.json`, not the project's.
3. **Report, don't fix.** No changes to project code, even obvious ones.
4. **Never invent results.** Every claim in a finding comes with the exact
   command that reproduces it and its real output (trimmed if long). If you
   didn't run a check, say so. If you're not sure, mark it "unsure"; that's
   useful, a guess presented as fact is not.
5. **Stay independent.** Scripts that cross-check the data must read RTD's
   GTFS themselves. Do not import anything from `scripts/lib/`, or you'll
   repeat the build's bugs instead of catching them. (Unit tests in task 2
   are the exception: they import the functions they test.)
6. **Hands off everything else on this machine.** Don't publish or deploy
   anything (no `wrangler deploy` or `wrangler pages deploy`). Don't touch the
   rtd-departures service, its repo, anything under `/opt`, systemd units, the
   Tailscale config, or `~/.ssh`. Use only RTD's public sources, the npm
   registry, and the map's own tile server through the page.
7. **If you're blocked** (a tool won't install, a source is down), write it
   down in the findings under "Blocked" and move to the next task. Don't
   work around it by changing the project.

## Setup

```bash
git checkout -b qa/deepseek
npm install
npm run build        # downloads RTD's data into public/data (about a minute)
npm test             # the project's own tests; all should pass
```

Download RTD's GTFS once for your own scripts:

```bash
mkdir -p qa/cache/gtfs
curl -L -o qa/cache/gtfs.zip https://www.rtd-denver.com/files/gtfs/google_transit.zip
unzip -o qa/cache/gtfs.zip -d qa/cache/gtfs
```

To serve the site locally: `npx wrangler pages dev public --port 8788`
(use another port if 8788 is taken; don't stop anything already running).

`qa/cache/`, `qa/out/` and `qa/node_modules/` are ignored by git. Put
screenshots and large outputs in `qa/out/`.

## What the data is

After a build, `public/data/` holds:

- `routes.geojson`: every route as drawn. Properties include `route`,
  `name`, `mode` (`rail` or `bus`), `tier`, midday headways `wk`, `sa`, `su`
  (minutes), trip counts, and weekday first and last trip. Rail on shared
  track is split into pieces with a `slot`, so a rail line can be several
  features.
- `stations.geojson`: rail stations with `served`, `lines` (space-separated),
  `returns`, `buses`.
- `directory.json`: per route, `goes` (its ends, `name` and `at`),
  `stations` (station ids in order), `bbox`, `url`; per station, `lines`,
  `buses` (space-separated map route codes), `parking` (spaces).
- `stops.geojson`, `facilities.geojson`, `labels.geojson`,
  `flexride.geojson`, `boundary.geojson`, and `meta.json` (`families` maps a
  map route to the GTFS routes it groups, for example `FF` to `FF1` through
  `FF5`).

## Tasks, in order

### 1. Cross-check the data against GTFS

Write `qa/scripts/crosscheck.mjs`. It reads `qa/cache/gtfs/*.txt` and
`public/data/*`, then prints every disagreement. Work out each item from GTFS
yourself, on a typical weekday (`meta.json` has the dates the build used),
then compare:

- **Rail station order:** each rail line's most common weekday calling
  pattern, platforms grouped by `parent_station`, against
  `directory.routes[].stations`. Match stations by distance (within 300 m),
  not by name.
- **Buses at each station:** bus routes with weekday trips stopping within
  250 m of each station, mapped to map routes with `meta.families`,
  against `directory.stations[].buses`. List what's missing and what's
  extra. **Start with this lead:** the directory lists `FF` (the Flatiron
  Flyer, Boulder to Denver) at "Colfax Station", an R Line station in
  Aurora, which looks wrong. Find out why.
- **Route ends:** the last stop of each route's most common weekday trip in
  each direction, against `directory.routes[].goes[].at` (within 500 m).
- **Station service:** a station with `served: true` should have weekday
  rail trips stopping within 300 m, and an unserved one none in the next 7
  days.
- **Frequency:** for at least 20 routes, recompute the weekday midday
  headway the way DESIGN.md ("Frequency and schedules") defines it, and
  compare with `wk` in `routes.geojson`. Flag differences over 2 minutes.
- **Basic sanity:** every route in `routes.geojson` appears in the directory
  and the other way round; every station `lines` value is a drawn rail line;
  every rail line has a color; no duplicate ids; all coordinates fall inside
  `meta.bounds.routes`.

### 2. Unit tests for the build's functions

Add tests in `qa/tests/*.qa.mjs`, using `node:test` and tiny made-up inputs
like `test/stations.test.mjs` does. Run them with:

```bash
node --test qa/tests/*.qa.mjs
```

Cover the exported functions in `scripts/lib/`: `csvRows` and `readCsv`
(quotes, commas and newlines inside quotes, CRLF, a byte-order mark),
`representativeDates`, `serviceDates`, `tierOf`, `routeFrequency`,
`lineShapes`, `lineEnds`, `stationService`, `destination`, `trimToEnds`,
`nearestOnTrack`, `trackAt`, and `sharedTrack` (two lines on the same track
should get different slots, lines apart should get none).

**Expectations must come from DESIGN.md or the function's doc comment, never
from running the function and copying what it returns.** Above each test,
quote the sentence it checks. Each failing test becomes a finding; mark the
finding "unsure" if the spec is ambiguous.

### 3. Build failure drills

DESIGN.md "Rule 3: a bad update never breaks the site" says a build that
fails its checks writes nothing. Test that without touching the real data:

1. Make a separate copy, from the repo root:

   ```bash
   QA="$PWD/qa"
   git worktree add --detach ../rtd-drill HEAD
   ln -s "$PWD/node_modules" ../rtd-drill/node_modules
   cd ../rtd-drill && node scripts/build-data.mjs   # one good build first
   ```

2. The build fetches with Node's global `fetch`. Write
   `qa/drills/mock-fetch.mjs` (in your checkout, not the copy) so it returns
   a damaged response for one source and passes everything else through.
   Choose the drill with an environment variable, and run it from the copy:

   ```bash
   DRILL=truncated-zip node --import "$QA/drills/mock-fetch.mjs" scripts/build-data.mjs
   ```
3. Before and after each drill, hash `public/data` in the copy
   (`find public/data -type f | sort | xargs shasum`).

Drills: the GTFS zip truncated; `stop_times.txt` missing; `shapes.txt`
missing (DESIGN.md says rail falls back to RTD's map geometry, so this one
should succeed); rail `route_color` blank; half the routes removed from
`routes.txt`; an ArcGIS layer returning HTTP 500; an ArcGIS layer returning
zero features; an ArcGIS layer returning an `error` object in a 200
response. For each, record the exit code, the last lines of output, and
whether the data changed. A drill that breaks the data, or succeeds when it
shouldn't, is a high-severity finding. Remove the worktree when done
(`git worktree remove ../rtd-drill`).

### 4. Browser checks

Write `qa/scripts/browser.mjs` with Playwright and `@axe-core/playwright`
(installed in `qa/`). Against the local server:

- **Sizes:** phone 390×844, small phone 360×740, desktop 1440×900.
- **Browsers:** Chromium, Firefox and WebKit. If one won't install, note it
  under "Blocked" and carry on.
- **Errors:** collect console errors and warnings, page errors, and failed
  requests for each run.
- **Accessibility:** run axe and report violations as it gives them.
- **Load time:** in Chromium with network throttling, the time from
  navigation until `#status` is hidden (that's when the routes have drawn).
  Use Lighthouse's mobile throttling numbers and state them, run 3 times,
  report the median. DESIGN.md's "Milestones" records earlier measurements to
  compare with.
- **Keyboard:** Tab from the page start reaches the Key button, and
  Enter/Space opens and closes it.
- **Screenshots:** save to `qa/out/`, but make no visual judgments; another
  reviewer will look at them.

### 5. Spec against code

Go through these DESIGN.md sections: "Map design" (especially "Bus routes",
"By zoom level", "Stations", "Shared track", "Symbols"), "Zero maintenance",
and "Quality floor". For each concrete claim (a zoom level, a distance, a
color, a behavior), find the code that does it. Record only mismatches, as
findings with the spec line and the `file:line`.

Don't report things the spec says aren't built yet. "Milestones" says
what's done: the panels, search, Live, "From here" and shareable links are
later work.

## Already known (don't report these)

- A small jog in the T Line at I-25 / Broadway.
- A step where a line leaves shared track.
- The "6" bus number overlapping the parking icon at Aurora Metro Center.
- A highway shield drawn over rail in one spot.
- Empty space at the bottom of the phone's opening view.
- RTD's own headsign wording (abbreviations, odd names). Report only names
  the build cleaned up wrongly.

## Findings

Write everything to `qa/FINDINGS.md` in this form, numbered in order:

```markdown
### F-001: One sentence saying what's wrong

- Severity: high | medium | low
- Area: data | build | page | spec
- Confidence: confirmed (reproduced twice) | likely | unsure
- Where: file:line, if known
- Reproduce: the exact command
- Expected: what should happen, and the spec line or source that says so
- Actual: the real output, trimmed
```

- **High:** riders would see wrong information (a wrong frequency, a missing
  station, a route at the wrong station), or the page or build breaks.
- **Medium:** wrong but minor, or only in an edge case.
- **Low:** cosmetic or wording.

End the file with two sections:

- **Checked and fine:** a short list of what you checked that passed, so the
  reviewer knows what was covered.
- **Blocked:** what you couldn't run, and why.
