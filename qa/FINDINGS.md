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

## Checked and fine

- Rail station order (task 1): every line's station sequence matches its most common weekday GTFS pattern; C, G and T read the opposite way round, which is the same sequence and allowed.
- Buses at stations (task 1): all 77 stations' bus lists match GTFS (weekday trips, stops within 250 m), after matching families the way DESIGN.md describes. The brief's lead — FF at Colfax Station — is correct, not a bug: `FF5` runs Boulder to Anschutz Medical Campus and calls at `Colfax & Wheeling/Fitzsimons Station`, 194 m from Colfax Station and filed under it as a platform in GTFS.
- Station service (task 1): all 77 served/unserved flags and return dates match GTFS.
- Frequency (task 1): 116 of 117 routes' weekday midday headway matches; only route 225 differs (F-001).
- Route ends (task 1): 114 of 117 match within 500 m; AB, AL and AT differ (F-002).
- Sanity (task 1): no route or station missing from either side of the two files, no duplicate station ids, no station naming a line that is not drawn, every rail line has a colour, every coordinate inside `meta.bounds.routes`.

## Blocked
