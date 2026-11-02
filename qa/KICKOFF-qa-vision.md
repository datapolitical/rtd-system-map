# Kickoff brief — full QA of the RTD system map, with vision

You are a fresh Hermes session with no memory of any other conversation. Everything
you need is in this file or in the files it names. Read this whole file first, then
the documents it lists, before you run anything.

## Mission

Do a full QA pass on the map at `/home/chris/code/rtd-v2` (git branch
`feat/v2-finish`, a worktree of `datapolitical/rtd-system-map`). Chris wants to know
what is actually wrong with it — as measured, and as seen. You are the QA session:
you find and prove defects. You do not fix them, and you do not commit.

The thing that is new this time: **a working vision model**. Earlier passes judged
only numbers and one bad image description. You can look at the rendered map and say
what a rider sees, then verify every such claim against the DOM or the data.

## Read first, in full

1. `/home/chris/code/rtd-v2/DESIGN.md` — the specification. The zoom ladder
   (`DESIGN.md:742-749`), the symbols section (`:751-770`), the quality floor
   (`:966`, "usable map in under 2 seconds"), and the V2 milestones (`:1109-1157`)
   are the parts that matter most.
2. `/home/chris/code/rtd-v2/qa/NOTES-readability.md` — the state of knowledge,
   including which earlier claims were wrong.
3. `/home/chris/code/rtd-v2/qa/CORRIDOR-AUDIT.md` — the corridor audit, currently
   green after a real bug was fixed.
4. `/home/chris/code/rtd-system-map/qa/FINDINGS.md` — the earlier QA of `main`
   (F-001…F-009). Useful history; do not assume it still applies.
5. `/home/chris/code/rtd-v2/qa/QA-SESSION-LOG.md` — your log. Create it if absent
   and append a line at every milestone: what you ran, what you found, what is next.

## What is already known (verify, never trust)

- Corridors: 85 features; the audit at `qa/CORRIDOR-AUDIT.md` reports every
  invariant passing. Re-run it before believing it.
- Zoom ladder: an audit found 14 places where what renders disagrees with
  `DESIGN.md:742-749` — corridor numbers absent at the opening view, the Union
  Station hub sign suppressed until zoom 11, the T line's Lincoln sign missing, no
  airport label below 10, Denver missing from the phone opening view, campuses only
  at 14, neighborhoods at 12 not 11, park-n-rides and unserved stations at 12.5 not
  12, bus stops at 15 not 14.5, and no stop-name layer at all at 16+.
- Accessibility: focus invisible on the map canvas, the geolocate button and the
  desktop zoom buttons; the loading toast overlaps the Key button at 320 px.
- Performance: median 6,551 ms to a usable map at 1.6 Mbps with CPU throttled 4x,
  against a 2 s floor.

## How to run the thing

```
cd /home/chris/code/rtd-v2
PORT=8830 node qa/scripts/serve.mjs        # serves public/, brotli, cache keyed on mtime
```

Playwright: import `/home/chris/code/rtd-system-map/qa/node_modules/playwright/index.mjs`
by absolute path. `@axe-core/playwright` sits beside it. Never `npm install`.

The page does not expose its MapLibre instance. To query rendered features, copy
`public/` to your scratch dir and add `window.__map = map;` to the copy only.

Tests: `npm test` (35 expected). Build: `npm run build` (10-90 s, hits the network).
Corridor audit: `node qa/scripts/audit-corridors.mjs`.

## Vision rules — this is the point of the session

The vision lane is configured as provider `opencode-go`, model `deepseek-v4.1-flash`,
timeout 240 s, `max_tokens` 4000. It works. Rules that come from hard experience:

1. **Downscale first.** A 1206x2622 phone screenshot times out. Run
   `ffmpeg -y -i shot.png -vf scale=828:-1 -q:v 4 shot-828.jpg` before every
   `vision_analyze` call. ffmpeg is at
   `/home/chris/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg`.
2. **One question per call.** Ask for literal content: what text, where, what
   overlaps. Not "is this good".
3. **The model hallucinates.** It has already invented a fact about Denver's rail
   network and been wrong. Every claim it makes about the map ("the label says T",
   "these two overlap") must be checked against `queryRenderedFeatures`,
   `map.getLayer()`, or the GeoJSON before it becomes a finding.
4. Its reasoning sometimes leaks into the answer. Ignore the rambling; take only
   concrete observations you can verify.
5. Vision is for what numbers cannot say: density, collisions, clipping, whether a
   corridor reads as one line, whether a label sits on top of another. Numbers are
   for everything else.

## What to produce

`/home/chris/code/rtd-v2/qa/FINDINGS-v2.md`:

- One numbered finding per defect: what a rider sees, the exact command that
  reproduces it, the real output, and a severity (high / medium / low).
- **Source location — required for every finding.** Name where the behaviour is
  produced as `path:line` (the layer definition, placement option, or code path
  that causes it; layer definitions live in `public/js/main.js` and
  `public/js/basemap.js`), and include the `grep -n` command you used to find
  it. If the cause is data rather than code, name the file and the field/query
  that shows it. A finding without a source pointer is incomplete: another
  model will fix from this report and must be able to open the file and act
  without re-deriving the location.
- When the same cause produces several symptoms (e.g. one collision setting
  dropping both a hub sign and route numbers), file it as ONE finding listing
  all symptoms and the single source line, not one finding per symptom.
- A section for "things the vision model claimed that turned out to be false",
  with what you checked. This matters as much as the findings.
- A short "what the map looks like" section: screenshots at 390x844 and 1440x900,
  at the opening zoom, 11.5, and 14, saved under
  `/home/chris/.hermes/cache/scratch/qa-vision/`, each with one sentence on what is
  legible and what is not.

## Hard constraints

- Write only inside `/home/chris/code/rtd-v2/qa/` and your scratch dir. Do not edit
  `public/`, `scripts/`, `test/`, `DESIGN.md`, or anything on another branch.
  READING them is required and expected — `grep -n` across the whole repo is how
  you fill in source locations. Read-only there, always.
- No `git commit`, no `git push`, no `git checkout` of other branches, no deploy.
- Do not touch `/opt`, systemd, Tailscale, `~/.ssh`, or the `rtd-departures` service.
- Another session (the one that spawned you) owns the code. It will not write while
  you work. If you find something that must change, write it as a finding and stop.
- Report numbers you actually observed. If something cannot be measured, write
  "unsure" and say why. Never estimate and present it as measured.

## First actions

1. Read the five documents above.
2. Start the server on 8830, load the page at 390x844, confirm it draws.
3. Take the opening-view screenshot, downscale it, and run one literal vision
   question on it. Confirm the lane works before relying on it.
4. Log that in `QA-SESSION-LOG.md`, then work through the zoom ladder, the
   accessibility checks, the performance run, and the vision pass, in that order.
