# QA session log

Newest entries at the bottom. Each line: what I ran, what I found, what is next.

- 2026-11-01 21:05 — Read the five briefs (`KICKOFF-qa-vision.md`, `DESIGN.md`,
  `qa/NOTES-readability.md`, `qa/CORRIDOR-AUDIT.md`, `rtd-system-map/qa/FINDINGS.md`)
  and `qa/BRIEF.md`. Branch `feat/v2-finish`, clean except untracked `node_modules`.
- 2026-11-01 21:07 — Started `PORT=8830 node qa/scripts/serve.mjs` (200 OK). Copied
  `public/` to `~/.hermes/cache/scratch/qa-vision/public`, added `window.__map = map;`
  in the copy only, served it on 8831 with a root-adjusted copy of `serve.mjs`.
  Phone opening view (390x844, DPR 2) draws: zoom 8.752, 111 bus / 12 part-time /
  85 corridor / 30 rail / 67 station features rendered, 0 console or page errors.
- 2026-11-01 21:08 — Vision lane checked: `phone-open.png` downscaled to 780x1688
  JPEG (156 KB) and read with one literal question. Lane works; the answer leaked
  ~3,000 words of reasoning and invented labels ("BOND", "JUMP", "SKIP", "oulder",
  "Hu", "OL"). Nothing from it is a finding until checked against the DOM.
  Next: zoom-ladder sweep, phone and desktop.
- 2026-11-01 21:24 — Zoom ladder swept at 14 zooms on 390x844 and 3 on 1440x900
  (`qa/vision/zoom-sweep.mjs`, results in `qa/vision/results/`). Opening view:
  85 corridors, 0 corridor labels; 108 bus routes, 17 numbered (phone) / 18
  (desktop); 9 of 10 rail end signs on phone (Lincoln missing), 10 on desktop;
  Union Station hub sign 0 on both; Denver absent on phone. Ladder drifts
  confirmed by layer minzoom: neighbourhoods 12, facilities/unserved 12.5,
  stops 15, campuses 14, airport label 10. Next: accessibility.
- 2026-11-01 21:36 — Accessibility (`qa/vision/a11y.mjs`, `focus-pixels.mjs`,
  `focus-diff.py`). axe 0 violations; 14-stop tab order; Key toggles with Enter.
  Canvas focus ring is drawn outside the viewport (pixel diff 5 px). Geolocate
  and zoom buttons get only a pale clipped glow (244–952 changed device px, no
  saturated ring). Toast overlaps Key 13x38 px at 320x568. Next: performance.
- 2026-11-01 21:47 — Performance (`qa/vision/perf.mjs`): 1.6 Mbps, CPU 4x, 5 cold
  runs -> 4,330 / 4,331 / 4,368 / 4,493 / 4,624 ms to usable, median 4,368 ms
  against the 2,000 ms floor. Unthrottled 943–1,284 ms. Load event at ~1.9 s, so
  ~2.4 s is post-load main-thread work. Re-ran the corridor audit (exit 0, all
  six invariants 0 violations) and `npm test` (31/31; the brief's "35" is stale).
  Next: vision pass and findings.
- 2026-11-01 22:05 — Vision pass on six screenshots (390x844 and 1440x900 at
  opening, 11.5, 14). Checked every claim: station names at 11.5 all true,
  "Boulder clipped" true (anchor x=8), "Union Station absent" true; "shield 6"
  false (only 25/36/287), "badge 18" false (it is "18th St / Stout Station"),
  "Theatre District / Convention Center" false (not rendered). Wrote
  `qa/FINDINGS-v2.md`: 14 findings (F-01..F-14), the false-claims table, and the
  six-screenshot section. Next: final verification and hand back.
- 2026-11-01 22:20 — Re-censused the four zoomed screenshot views with a canvas
  bbox (`opening.mjs`): phone 11.5 = 12 corridors / 2 numbers, desktop 11.5 = 29 / 5,
  both 14 views = 0 numbers. Corrected two figures in the report that had mixed
  the opening-centre sweep with the Union Station views.
- 2026-11-01 22:28 — Found and documented a MapLibre quirk: at map zoom 12,
  `queryRenderedFeatures` returns 10 `stations-unserved` features although the
  layer minzoom is 12.5; a pixel crop of 16th/California shows the ring only at
  12.5 (394 ring px vs ~220 background). F-13 uses the pixel result; the quirk is
  noted under "Not measured".
- 2026-11-01 22:32 — Final checks: `git status` shows only `qa/` changes (the
  corridor audit rewrote its own date line); six screenshots present at
  390x844/780x1688 and 1440x900; report numbers re-read against the JSON.
- 2026-11-01 22:41 — Background corridor audit finished (`AUDIT_EXIT=0`): GTFS
  8,155 stops / 21,814 trips / 815,809 stop_times, feed weekday 2026-11-02,
  85 corridors, all six invariants 0 violations, no unresolved members or
  stray stops. Corrected the one stale line reference in F-01
  (`CORRIDOR_LABELS_FROM` is `main.js:59`, not `:68`; flagged by
  `qa/HANDOFF-fix-v2.md` and confirmed in source). Report is final.
