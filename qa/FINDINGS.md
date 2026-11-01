# QA findings

See `qa/BRIEF.md` for the format. Branch `qa/deepseek`, from `main` at `208a7b0`.

### F-001: Route 225 is shown as hourly (53 min) but runs every 30 minutes, because its GTFS variants 225D and 225T are never joined to it

- Severity: high
- Area: build
- Confidence: confirmed (reproduced twice)
- Where: scripts/build-data.mjs:63-69 (`matchGtfs`: `if (exact.length) return exact;`)
- Reproduce: `node qa/scripts/family-check.mjs`
- Expected: DESIGN.md:520-523 says route matching step 2 is "As a family RTD draws as one line, such as FF for FF1 to FF5. Family members share the map route's prefix and have exactly the same route name." `225D` and `225T` share the prefix `225` and have exactly the same `route_long_name` (`Boulder / Lafayette via Baseline`), so all three are one line. DESIGN.md:423-428 puts 16–30 min in the **Every 30** tier.
- Actual: the family is only tried when the exact match finds nothing, so `225D` and `225T` are dropped and 225 is measured on 44 of its 92 weekday trips. `npm run build` prints them as unmatched (`GTFS routes not on RTD's map: 225D, 225T, ATA`). Trimmed output:

```
route 225 — Boulder / Lafayette via Baseline
  matched by exact code: 225 (44 weekday trips)
  also share the prefix and the same name: 225D (40 weekday trips), 225T (8 weekday trips)
  weekday midday headway the build uses: 53 min from 8 departures -> tier hourly (routes.geojson says 53 min, hourly)
  weekday midday headway with every member: 30 min from 15 departures -> tier every30
```

  `public/data/routes.geojson` for route 225: `"wk":53,"tier":"hourly"`. At Broadway & Pleasant St the midday departures the build sees are 09:00 09:30 09:58 10:28 11:20 12:20 13:20 14:14 14:53; with 225D/225T included there are 15, every 15–30 min. The same one-line defect drops `ATA` (1 weekday trip, headsign "Denver Airport via 40th & Airport Stn") from route AT, so the four stops it serves — Nine Mile Gate H, Salida St & 40th Ave, Gateway Park Gate K, Denver Airport Gate 7 — never show that trip on route AT.

### F-002: The ends recorded for routes AB, AL and AT are 1.1–2.9 km away from where those routes actually end

- Severity: low
- Area: data
- Confidence: confirmed (reproduced twice)
- Where: scripts/lib/gtfs.mjs `lineEnds` (`at: points?.at(-1)` — the last point of the most-used shape, not the last stop)
- Reproduce: `node qa/scripts/crosscheck.mjs | sed -n '/route ends: AB/,/directory:/p'`
- Expected: qa/BRIEF.md task 1 — "the last stop of each route's most common weekday trip in each direction, against `directory.routes[].goes[].at` (within 500 m)".
- Actual:

```
  - route ends: AB (bus) — directory has 2 end(s), GTFS has 2:
      GTFS end not within 500 m of any directory end: Denver Airport Station Gate 6 [-104.67376,39.84791] dir 0
      directory end not within 500 m of any GTFS end: Denver Airport [-104.66953,39.83828]
```

  AL is the same at the airport plus `8th & Coffman PnR Gate F [-105.10367,40.17306]` vs `Longmont [-105.10384,40.19953]` (2.94 km apart); AT is the same at the airport (1.13 km apart). The name is right in all three cases — only the coordinate is short, because RTD's GTFS shapes stop short of the airport station and of Longmont. Nothing in `public/js/` reads `goes`, so this is not visible in the page today.

### F-003: The legend's fine print is 3.48:1 against white, below the 4.5:1 that WCAG AA asks for

- Severity: medium
- Area: page
- Confidence: confirmed (reproduced twice, axe on desktop at 1440×900)
- Where: public/css/app.css:209 (`color: var(--ink-3)`) with `--ink-3: #7e8b98` at public/css/app.css:26
- Reproduce: `cd qa && BASE=http://localhost:8811 node scripts/browser.mjs` then read `qa/out/browser.json`, or `npx @axe-core/cli http://localhost:8811` (the script uses `@axe-core/playwright`)
- Expected: DESIGN.md:986 "Accessibility: WCAG AA contrast for text". The note is 12px normal weight, so AA asks for 4.5:1.
- Actual: axe reports

```
[serious] color-contrast: Elements must meet minimum color contrast ratio thresholds
  target: #legend-note
  html: <p class="note" id="legend-note">Not affiliated with RTD. Data from RTD's public map and GTFS feeds, updated Nov 1, 2026
  why: Element has insufficient color contrast of 3.48 (foreground color: #7e8b98, background color: #ffffff,
       font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
```

  Only the desktop runs see it: the key is closed on phones, so `.legend-body` is not rendered there.

### F-004: The opening view takes 15.9 s on Lighthouse's slow 4G, against 6.7 s recorded in Milestones and a 2 s target

- Severity: medium
- Area: page
- Confidence: confirmed (measured seven times: 15,610 / 15,708 / 15,904 / 15,794 / 15,886 / 16,094 ms)
- Where: public/index.html:10 loads `vendor/maplibre-gl.mjs` (1,073 KB), and `data/routes.geojson` is 1,022 KB
- Reproduce: `cd qa && BASE=http://localhost:8811 node scripts/browser.mjs`; the throttle is Lighthouse's mobile preset (150 ms RTT, 1,638.4 kbit/s down, 750 kbit/s up, 4× CPU), and the clock runs from navigation until `#status` is hidden
- Expected: DESIGN.md:966 "a usable map in under 2 seconds on a mid-range phone over 4G"; DESIGN.md:1127 records 6.7 s on slow 4G for V2 step 1 and notes 2.5 s was out of reach.
- Actual: median **15,886 ms** over three runs (15,886 / 16,094 / 15,794). Resource timing on one run: 1,919 KB of local files before `#status` hid, of which `vendor/maplibre-gl.mjs` is 1,073 KB and took 6,440 ms on its own, plus `vendor/maplibre-gl-worker.mjs` 507 KB and `vendor/glyphs/Overpass Bold/0-255.pbf` 81 KB. The GeoJSON is fetched by the map's worker, so it does not appear in that list; `routes.geojson` alone is another 1,022 KB, `boundary.geojson` 158 KB, `flexride.geojson` 54 KB. At 1,638.4 kbit/s, the ~3.2 MB that has to arrive before the routes draw cannot land in under 15 s, which is exactly what was measured. Caveat: this Chromium fell back to software WebGL (5 warnings), so drawing may be slower here than on a phone GPU; the byte count is not affected by that.

### F-005: With no WebGL2 the page says "Loading the network…" forever instead of saying the map cannot draw

- Severity: low
- Area: page
- Confidence: confirmed (3 runs, all three sizes, headless Firefox)
- Where: public/js/main.js:77 (`new maplibregl.Map(...)` inside `async function main()`), with `#status` cleared only at public/js/main.js:124
- Reproduce: `cd qa && BASE=http://localhost:8811 node scripts/browser.mjs` (Firefox is skipped by the script now, so this needs a browser without WebGL: `npx playwright open --browser=firefox http://localhost:8811` in an environment where `canvas.getContext('webgl2')` is null)
- Expected: DESIGN.md:989 "Resilience: if the live feed fails, the map still works and says live data is unavailable" — the pattern is that the page tells the rider what is wrong rather than spinning.
- Actual: the map constructor throws, `main()` rejects, and `#status` is never touched again:

```
page: GPUInitializationError: WebGL2 is required to display this map. ...
console warning: Failed to create WebGL context: WebGL creation failed: * AllowWebgl2:false restricts context creation on this system.
after 45 s: document.getElementById('status').hidden === false, textContent "Loading the network…"
```

  No browser without WebGL2 is in wide use, so this is an edge case; the point is that the failure is invisible to the rider and lands only in the console.

### F-006: The 30-minute and 60-minute rail lines are drawn exactly as heavy as the 15-minute ones

- Severity: medium
- Area: spec
- Confidence: confirmed
- Where: public/js/main.js:45 (`railWidth`) and public/js/main.js:270 (`'line-width': railWidth()`); the rail layer ignores `tier`, though `meta.rail[].tier` carries it
- Reproduce: `node -e 'const m=require("./public/data/meta.json"); console.log(m.rail.map(r=>r.route+":"+r.tier+":"+r.wk+"min").join(" "))'` and `grep -n "railWidth" public/js/main.js`
- Expected: DESIGN.md:650-652 "Rail stays heavier than any bus at every tier. 15-minute rail is full width; 30- and 60-minute rail is a step thinner; rail with only a few trips or rush-hour trips is dashed and drawn *beneath* full-service rail, so on shared track the line that actually runs wins."
- Actual: `railWidth()` is a function of zoom only — `const railWidth = (extra = 0) => byZoom(RAIL_WIDTH.map((w) => w + extra))` with one `RAIL_WIDTH = [3, 4, 5.6, 9]` — so every rail line is drawn at the same weight. The data has the mix the spec describes: `A:frequent:15min B:hourly:60min C:frequent:15min E:frequent:15min G:frequent:15min N:every30:30min R:frequent:15min T:frequent:15min W:frequent:15min`. Only `PART_TIME = ['peak','limited','none','unknown']` (main.js:33) gets the dashed, thinner treatment, and no rail line is in those tiers today, so B at one train an hour is drawn identically to A at four an hour.

### F-007: The zoom ladder in the code has drifted from the table: stops arrive at 15 not 14.5, and no zoom shows stop names

- Severity: low
- Area: spec
- Confidence: confirmed for the numbers; unsure whether stop names are later work
- Where: public/js/main.js:36 (`STOPS_ZOOM = 15`), :297 (`stations-unserved` minzoom 12.5), :325 (`facilities` minzoom 12.5); `transitMarks` (main.js:276-291) has a circle layer for stops and no label layer
- Reproduce: `grep -n "STOPS_ZOOM\|minzoom" public/js/main.js` and `grep -n "id: 'stops'" -A 10 public/js/main.js`
- Expected: DESIGN.md:742-749 — "Park-n-Rides, transit centers, and unserved stations from 12", "Bus stops (loaded only when first needed) and smaller streets" at 14.5 and up, "Stop names, with the routes that serve each stop" at 16 and up.
- Actual: `stations-unserved` and `facilities` both start at **12.5**, the stops layer starts at **15**, and there is no symbol layer over the `stops` source at any zoom, so stop names and their routes are only in a click popup (main.js:787). The half-level differences are small; the missing stop-name layer is the substantive one. Milestones puts "Interaction" (step 5) after this, and stop names are not on that list, so I am not certain whether they were deferred.

### F-008: Bus corridors are not built, so two every-30 routes on one street never show as the frequent corridor the spec describes

- Severity: medium
- Area: spec
- Confidence: confirmed
- Where: DESIGN.md:731-736 (the rule) and Milestones step 2.2 (DESIGN.md:1134, "bus corridors with combined frequency"); no code implements it — `scripts/build-data.mjs` has no corridor step, and the only "corridor" in the tree is the rail side-ordering in `scripts/lib/sharedtrack.mjs:102-135`
- Reproduce: `grep -rn "combined\|corridor" scripts/build-data.mjs scripts/lib/gtfs.mjs scripts/lib/stations.mjs` (no output) and `grep -c combined public/data/routes.geojson` (`0`)
- Expected: "Where several routes share a street and its stops, riders can take whichever comes first. The build finds these shared stretches from GTFS stop sequences and draws the corridor once, weighted by the combined frequency of the routes on it (two routes every 30 minutes, evenly spaced, are a frequent corridor). Only stops both routes serve count, so a limited-stop route adds to the corridor only at its stops."
- Actual: each route is drawn on its own, at its own tier; nothing computes shared stretches of bus stop sequences and nothing carries a combined frequency. `routes.geojson` has no `combined` field and both files' route properties are per-route only (`route`, `name`, `tier`, `wk`, `sa`, `su`, `wk_trips`, …). So a street served by two every-30 routes reads as two every-30 lines rather than one every-15 corridor — the exact question the site exists to answer at a shared stop.

### F-009: The hourly, infrequent, rush-hour and few-trips bus lines are under the 3:1 against the land that the spec promises

- Severity: medium
- Area: page
- Confidence: confirmed
- Where: public/js/main.js:22-25 (tier colors `#8995a2` and `#9aa5b0`) against `PALETTE.land` `#f4f5f6` (public/js/basemap.js:7)
- Reproduce:

```bash
node -e 'const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};const cr=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05)};for (const c of ["#1d3044","#58697b","#8995a2","#9aa5b0"]) console.log(c, cr(c,"#f4f5f6").toFixed(2))'
```

- Expected: DESIGN.md:709 "Every tier stays visible against the land, so even the lightest bus line meets 3:1."
- Actual:

```
#1d3044 12.34   (frequent)
#58697b 5.17    (every 30)
#8995a2 2.79    (hourly)
#9aa5b0 2.29    (infrequent, rush hours, a few trips)
```

  Two of the four inks miss the target, and they are the ones used for the least frequent routes; the two lightest also carry the dashed and dotted patterns that thin them further.

## Checked and fine

- Rail station order (task 1): every line's station sequence matches its most common weekday GTFS pattern; C, G and T read the opposite way round, which is the same sequence and allowed.
- Buses at stations (task 1): all 77 stations' bus lists match GTFS (weekday trips, stops within 250 m), after matching families the way DESIGN.md describes. The brief's lead — FF at Colfax Station — is correct, not a bug: `FF5` runs Boulder to Anschutz Medical Campus and calls at `Colfax & Wheeling/Fitzsimons Station`, 194 m from Colfax Station and filed under it as a platform in GTFS.
- Station service (task 1): all 77 served/unserved flags and return dates match GTFS.
- Frequency (task 1): 116 of 117 routes' weekday midday headway matches; only route 225 differs (F-001).
- Route ends (task 1): 114 of 117 match within 500 m; AB, AL and AT differ (F-002).
- Sanity (task 1): no route or station missing from either side of the two files, no duplicate station ids, no station naming a line that is not drawn, every rail line has a colour, every coordinate inside `meta.bounds.routes`.
- Unit tests (task 2): 32 tests over 18 exported functions in six files — `readCsv`, `csvRows`, `serviceDates`, `representativeDates`, `tierOf`, `routeFrequency`, `lineShapes`, `lineEnds` (gtfs.mjs); `stationService` (stations.mjs); `sharedTrack`, `trackAt`, `trimToEnds`, `nearestOnTrack` (sharedtrack.mjs); `directory` (directory.mjs); `destination` (labels.mjs); `downloadLayer` (arcgis.mjs); `fetchWithRetry`, `getJson` (http.mjs). All pass; no defect found in the edge cases they cover. Run with `node --test qa/tests/`.
- Build failure drills (task 3): a worktree at `../rtd-drill` with `node_modules` symlinked, one good build first, then eight drills driven by `qa/drills/mock-fetch.mjs`, with `public/data` hashed before and after each (`node qa/drills/run-drills.mjs`). Seven failed and left the data byte-identical; the eighth succeeded, which is what the spec asks for. Full transcript in `qa/drills/transcript.txt`. No drill broke the data and none succeeded when it shouldn't, so no finding here.
  - `truncated-zip`: exit 1, `Error: invalid zip data`, changed no.
  - `stop-times-missing`: exit 1, `Error: GTFS feed has no stop_times.txt`, changed no.
  - `shapes-missing`: exit 0, `rail drawn from GTFS shapes: none`, changed yes — 117 routes, 9 rail, 67 stations served, the same counts as a normal build (DESIGN.md:656: rail falls back to RTD's map geometry).
  - `rail-color-blank`: exit 1, nine `Rail line X has no color in GTFS` checks, changed no. (D is absent from the list because it is positioning, so it is not drawn.)
  - `half-routes-removed`: exit 1, `rail dropped from 9 to 4`, `stations_served dropped from 67 to 40`, `Only 52% of map routes match GTFS`, changed no.
  - `arcgis-500`: exit 1 after its retries, `Error: 500 Internal Server Error for .../FeatureServer/1/query`, changed no.
  - `arcgis-zero-features`: exit 1, `No stations downloaded`, `stations dropped from 77 to 0`, changed no — caught by the checks, not by a crash.
  - `arcgis-error-200`: exit 1, `Error: ...: Layer is temporarily unavailable`, changed no.
- Browser checks (task 4): Chromium at 390×844, 360×740 and 1440×900 draws the network in 852–935 ms with no console errors, no page errors, no failed requests and no 4xx/5xx responses. axe finds 0 violations on both phone sizes and 2 on desktop (F-003 and a `region` best-practice hit on `.legend-body`, which axe rates moderate, not an AA failure). Keyboard: 6 Tab stops from the page start reaches the Key at every size, and Enter and Space both toggle it at every size (`toggles true/true`). Screenshots in `qa/out/`; I made no visual judgement. Run with `cd qa && npm run serve` in one shell and `BASE=http://localhost:8811 node scripts/browser.mjs` in another.
- Spec against code (task 5), claims that hold: shared track at 20 m with runs under 200 m smoothed away (`scripts/lib/sharedtrack.mjs:10,14`); the rail outline at OKLab lightness × 0.72 with a 3:1 floor and a white-or-ink bullet letter (`public/js/color.js:68,74`, `public/js/main.js:160`); bus tiers fading in at 0 / 9 / 10.5 / 11, which is what DESIGN.md:745 says; rail heavier than any bus at every zoom (`RAIL_WIDTH` 3–9 against the frequent bus's 1.2–5.2); stops fetched only when the map first reaches stop zoom (`public/js/main.js:706`); the 250 m bus-stop rule and the 400 m Park-n-Ride rule in the build (checked in task 1).

## Blocked

- WebKit: `npx playwright install webkit` downloaded build v2215, but it will not launch — the host is missing two system libraries, `libwoff1` and `libavif16` (Playwright's `validateDependenciesLinux`, and `browserType.launch` fails on them). Fixing it needs root: `sudo npx playwright install-deps`, or `sudo apt-get install libwoff1 libavif16`. `sudo` requires a password on this machine and neither package is installed, so no WebKit run was possible.
- Firefox: Playwright's Firefox in this environment has no WebGL at all — `getContext('webgl')` and `getContext('webgl2')` both return null on `about:blank` — so the map cannot draw and the run stops at a blank map. That is the environment, not the page; the page's own behaviour in that state is F-005.
- Port 8788, the port DESIGN.md uses for `npm run dev`, is already taken on this machine by another app that answers 302 to `/login`, and `wrangler` is not installed, so `qa/scripts/serve.mjs` served `public/` on 8811 instead. It is a plain static server: no `_headers`, no Workers.
- Note for the reviewer: on this machine's Node (v26.7.0) `node --test qa/tests/` fails with `Cannot find module .../qa/tests` because a bare directory is no longer accepted, so `qa/tests/index.mjs` plus a `qa/tests/package.json` `main` make the command in the brief work as written; `node --test "qa/tests/*.qa.mjs"` works without them.
