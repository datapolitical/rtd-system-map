# Corridor audit — 2026-11-01

Independent check of `public/data/corridors.geojson` and `public/data/routes.geojson`
against the raw GTFS feed in `qa/cache/gtfs/`. The script is
`qa/scripts/audit-corridors.mjs`; it imports nothing from `scripts/lib/`.

## Inputs and method

- Feed: 8155 stops, 21814 trips, 815809 stop_times rows, 130 routes.
- Representative weekday: **2026-11-02**, services active: `MT`, `WK` (8835 trips). Midday = 09:00–15:00 departures.
- Corridors: **85** features, 447 geometry points.
- **`properties.stopIds` is not present in the published file.** The build computes it but `build-data.mjs` emits only `id`, `members`, `headwayMinutes`, `tier`, `label`. The audit therefore reconstructs each corridor's ordered stop list from its geometry by nearest GTFS stop (every point matched within 10 m; points with a second stop within 1 m: 0) and corroborates it with the stop ids embedded in the feature `id`.
- `members` are display route names (e.g. `83`, `AB`, `FF`), not GTFS `route_id`s. They are resolved through the `gtfs` field of `routes.geojson` (validated token-by-token against `routes.txt`); a member is considered served if one of its GTFS variants serves the stop. Family pooling is discussed under Limitations.

Reproduce: `node qa/scripts/audit-corridors.mjs` (add `--dump` for per-corridor stop/headway detail in `qa/corridors-detail.json`).

## Verdicts

| # | Invariant | Violations | Verdict |
| --- | --- | --- | --- |
| 1 | Every member exists and serves every corridor stop | 0 | PASS (members are pooled display routes; see Limitations) |
| 2 | Stops are consecutive on at least one member trip | 0 | PASS |
| 3 | Combined headway ≤ fastest member alone | 0 | PASS |
| 4 | Tier matches headway boundaries | 0 | PASS |
| 5 | LineString, ≥3 pts, coordinates on the corridor's stops in order | 0 | PASS — structure, coordinates, and order (the id hash reproduces all 85) |
| 6 | No duplicate member set + stop sequence | 0 | PASS |

| Extra check (not one of the six) | Findings |
| --- | --- |
| 3b. Declared headway vs measured combined | **0** corridors overstate frequency |
| Feature `id` still describes the published geometry | **0** of 85 do not |
| Invariant-2 failures that are pure merge seams | **0** of 0 |

Diagnostics (not one of the six):

- No corridor carries a stale id: all 85 reproduce their id hash from the geometry they ship with.
- No invariant-2 failure is a merge seam, because no run is merged across trips.

## Findings

1. **No corridor is a stitched path.** All 85 published sequences are a contiguous run of a real weekday trip in at least one direction, and every feature id describes the geometry it ships with.
5. **Invariants 4 and 6 pass, and the route table is clean.** Every tier matches its declared headway; no duplicate member-set + stop-sequence; routes.geojson has no missing names, no zero `wk`, and all 125 non-null `wk` values agree with the feed within 2 minutes.
6. **Invariant 1 passes only on the pooled definition.** 4 of the distinct member names (83, AB, FF, LD) are display families, not GTFS route_ids, and 10 (corridor, member) pairs have variants that skip stops. The worst is `corridor:AB+FF:12478-34195:24223591`: AB3 and FF3 call at none of its 10 stops and the other FF variants miss 3–5, so that "corridor" only exists by pooling different variants' coverage.

## Invariant detail

### 1. Members exist and serve every stop

Unresolved member names plus (member, stop) pairs where the member does not call at a corridor stop. **0** violations.

### 2. Stops consecutive on one member trip

No weekday trip of any member contains the corridor stop list as a contiguous run in either direction. `run lengths` splits the published sequence into maximal pieces that each are a real consecutive run on a member trip. **0** violations.

### 3a. Headway slower than a member

`headwayMinutes` is greater than the fastest member's own midday headway measured at these same corridor stops (worst stop/direction, 09:00–15:00). **0** violations.

Wider test, against each member's own route-level headline headway (its busiest stop): **3** more corridors would fail (20+FF 30 vs FF 15, 35+83 24 vs 83 15, 225+287+LD 60 vs 225 30). Those are not counted: the member's headline frequency is at its busiest stop, not on this shared stretch (e.g. 35+83 claims 24 while 83's headline is 15, but 83 runs every 30 at this corridor's stops and the combined service really is 24).

### Extra 3b. Declared headway vs measured combined

Declared headway differs by more than 2 minutes from the headway measured by merging every member's departures at stops where at least two members call (≥4 midday departures), taking the least-frequent stop/direction. A negative delta means the corridor claims more frequent service than its published stops actually get. **0** violations.

### 4. Tier boundaries

Tier recomputed from the declared `headwayMinutes` with the site boundaries (≤15 frequent, ≤30 every30, ≤60 hourly, else infrequent). **0** violations.

### 5. Geometry

Geometry must be a LineString of at least 3 points, each on a GTFS stop, with id endpoints matching the first/last stop. `properties.stopIds` is not published, so "matches the stop list in order" is verified as: every coordinate is a stop (max offset shown), and the id hash — which encodes the original stop list — still reproduces the published sequence. **0** violations.

### 5b. Feature id vs published geometry (diagnostic)

The id embeds the original first/last stop and an FNV hash of the original stop list. These features were merged after the id was minted, so the id describes a run that is no longer what the feature draws. **0** violations.

### 6. Duplicates

Two corridors with the identical member set and identical stop sequence. **0** violations.

## `routes.geojson` checks

- Routes: **138**; missing `name`: **0**.
- `wk` = 0: **0**; `wk` = null: **13** — peak/limited with no midday service: **9**, fewer than 2 midday departures in the weaker direction: **4**, unexpectedly null: **0**.
- `wk` differs from the feed by more than 2 min: **0**; matched within 2 min: **125** (largest gap 0 min on route 0).

All routes with null `wk` and weekday trips, and why null is or is not correct:

| route | tier | weekday trips | weaker-direction midday deps | case |
| --- | --- | --- | --- | --- |
| 116X | peak | 6 | 0 | peak/limited, no midday service |
| 145X | peak | 4 | 0 | peak/limited, no midday service |
| 169L | infrequent | 11 | 1 | single midday departure |
| 23 | peak | 14 | 0 | peak/limited, no midday service |
| 3L | peak | 6 | 0 | peak/limited, no midday service |
| CV | peak | 6 | 0 | peak/limited, no midday service |
| EV | peak | 6 | 0 | peak/limited, no midday service |
| FMR | infrequent | 73 | 1 | single midday departure |
| GS | infrequent | 8 | 1 | single midday departure |
| LD | infrequent | 12 | 1 | single midday departure |
| LX2 | peak | 8 | 0 | peak/limited, no midday service |
| PD | peak | 6 | 0 | peak/limited, no midday service |
| RX | peak | 12 | 0 | peak/limited, no midday service |

`wk` disagreements beyond 2 minutes:

_None._

## Limitations / what could not be checked

- **`properties.stopIds` is not in the published file**, so invariants 1, 2 and 5 cannot be checked against a declared stop list. The stop list was reconstructed from geometry by nearest stop (all 447 points match a stop; 0 points with a second stop within 1 m). The reconstruction is corroborated by the feature id: for the 85 unmerged corridors the reconstructed sequence reproduces the id hash exactly. For the 0 merged corridors it cannot be corroborated, because their ids are stale.
- **Weekday definition**: 2026-11-02 (MT, WK), the same representative date as `meta.json`. Friday-only (`FR`), Saturday and Sunday services are excluded (8835 weekday trips). A different weekday would change headways for routes that use day-specific services.
- **Headway definition**: median gap between 09:00–15:00 boarding departures. A member's own headway is its worst stop/direction on the corridor; the combined headway merges members at stops where at least two members call and at least four departures exist. This is the same family of measurement the site uses for routes, re-implemented from the CSVs.
- **Members are display routes, not GTFS route_ids.** Families are pooled (83 = 83D+83L, AB = AB1…AB3, FF = FF1…FF5, LD = LD1), matching how the map draws them. 10 (corridor, member) pairs have at least one GTFS variant that does not call at every corridor stop; the pooled member still serves every stop, which is the level the map claims.

| corridor | member | variants missing some stops |
| --- | --- | --- |
| corridor:10+15+20+FF:12999-25561:56e8b3ef | FF | FF1: 3, FF2: 3, FF3: 3, FF4: 3 |
| corridor:20+FF:26213-26411:87495a75 | FF | FF1: 4, FF2: 4, FF3: 4, FF4: 4 |
| corridor:35+83:13246-15780:a6a205d8 | 83 | 83D: 1, 83L: 3 |
| corridor:225+287+LD:17875-17969:3f262ffc | 225 | 225D: 3 |
| corridor:AB+FF:12478-34195:24223591 | AB | AB2: 3, AB3: 4 |
| corridor:AB+FF:12478-34195:24223591 | FF | FF3: 4, FF4: 3 |
| corridor:AB+FF:34195-35215:a12376d9 | AB | AB1: 3, AB3: 4 |
| corridor:AB+FF:34195-35215:a12376d9 | FF | FF1: 3, FF2: 3, FF3: 4, FF5: 3 |
| corridor:AB+FF:16342-17989:3a89923c | AB | AB1: 3, AB3: 4 |
| corridor:AB+FF:16342-17989:3a89923c | FF | FF1: 3, FF2: 3, FF3: 4, FF5: 3 |
- **Not checked**: whether the drawn line follows the street (shapes.txt), or whether corridors overlap each other on the map. Those are cartographic questions outside these six invariants.

## Corridor table

| corridor | members | stops | declared | fastest member at stops | route headline | measured combined | tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| corridor:0+0L:12519-17772:6bdb3477 | 0 0L | 4 | 9 | 15 | 15 | 9.1 | frequent |
| corridor:1+3:33211-35024:17c840c9 | 1 3 | 3 | 24 | 31 | 30 | 24.3 | every30 |
| corridor:3+4:12023-12029:446849f8 | 3 4 | 8 | 25 | 30 | 30 | 24.7 | every30 |
| corridor:16+6:12849-18999:d7171492 | 6 16 | 3 | 10 | 10 | 10 | 10 | frequent |
| corridor:153+6:21457-26651:83c92135 | 6 153 | 3 | 13 | 15 | 15 | 12.8 | frequent |
| corridor:9+ART:14720-14722:2db0a625 | 9 ART | 4 | 23 | 30 | 30 | 23.2 | every30 |
| corridor:76+9:33170-33666:38937f3b | 9 76 | 8 | 26 | 30 | 30 | 25.6 | every30 |
| corridor:10+32+44:17710-17717:663ede89 | 10 32 44 | 4 | 15 | 20 | 20 | 15 | frequent |
| corridor:10+121:15885-15921:98fe133f | 10 121 | 3 | 15 | 15 | 15 | 15 | frequent |
| corridor:10+15:12974-25561:2722624e | 10 15 | 5 | 10 | 10 | 10 | 10 | frequent |
| corridor:12+38:13379-20547:042870ef | 12 38 | 3 | 14 | 30 | 30 | 14.4 | frequent |
| corridor:19+28+32+44:17707-22572:fecfd518 | 19 28 32 44 | 3 | 18 | 30 | 30 | 18.3 | every30 |
| corridor:10+15+20+FF:12999-25561:56e8b3ef | 10 15 20 FF | 3 | 8 | 10 | 10 | 8.4 | frequent |
| corridor:20+FF:26213-26411:87495a75 | 20 FF | 4 | 30 | 30 | 15 | 30 | every30 |
| corridor:130+21:16387-16402:3ecdb7ac | 21 130 | 4 | 10 | 15 | 15 | 10.5 | frequent |
| corridor:130+21:16382-16399:b0e3c2a5 | 21 130 | 3 | 14 | 15 | 15 | 13.7 | frequent |
| corridor:30+36:13816-13817:c7c5f9a5 | 30 36 | 3 | 15 | 15 | 15 | 15 | frequent |
| corridor:30+35+36:13783-13806:6bddc4d4 | 30 35 36 | 3 | 15 | 15 | 15 | 15 | frequent |
| corridor:30+36:13809-13855:fa595de0 | 30 36 | 5 | 15 | 15 | 15 | 15 | frequent |
| corridor:30+35+36:13802-13856:70e8a0dd | 30 35 36 | 3 | 15 | 15 | 15 | 15 | frequent |
| corridor:30+36:13805-13818:3ad61d7b | 30 36 | 4 | 15 | 15 | 15 | 15 | frequent |
| corridor:30+36+59:12408-12762:32ee5c1e | 30 36 59 | 4 | 15 | 15 | 15 | 15 | frequent |
| corridor:35+76:17021-17063:acac51d8 | 35 76 | 6 | 21 | 30 | 30 | 20.9 | every30 |
| corridor:105+35:14182-33367:e4d8e884 | 35 105 | 4 | 12 | 15 | 15 | 12.3 | frequent |
| corridor:35+83:13246-15780:a6a205d8 | 35 83 | 5 | 24 | 30 | 15 | 23.7 | every30 |
| corridor:105+35:14132-14179:331f7aa1 | 35 105 | 4 | 13 | 15 | 15 | 13.3 | frequent |
| corridor:35+40:14136-15561:e6706492 | 35 40 | 6 | 11 | 15 | 15 | 11 | frequent |
| corridor:37+49:11275-11278:e7495d57 | 37 49 | 3 | 27 | 30 | 30 | 26.8 | every30 |
| corridor:40+46:13110-13144:061b802e | 40 46 | 4 | 12 | 15 | 15 | 12 | frequent |
| corridor:40+46:13124-26151:a28043e8 | 40 46 | 4 | 13 | 15 | 15 | 13 | frequent |
| corridor:42+45:24513-26020:3ef0cd51 | 42 45 | 4 | 15 | 30 | 30 | 15.3 | frequent |
| corridor:28+43:17707-17733:3e0fbb46 | 28 43 | 3 | 15 | 15 | 15 | 15 | frequent |
| corridor:121+45:15910-23518:2462ba4a | 45 121 | 4 | 15 | 30 | 15 | 14.6 | frequent |
| corridor:121+45:15911-34875:f3b65230 | 45 121 | 4 | 15 | 30 | 15 | 15.2 | frequent |
| corridor:48+ART:11298-13147:cf1be8b6 | 48 ART | 4 | 23 | 30 | 30 | 23 | every30 |
| corridor:52+76+80:20821-20827:867125b8 | 52 76 80 | 3 | 25 | 30 | 30 | 24.5 | every30 |
| corridor:76+80:17011-21974:52734431 | 76 80 | 14 | 25 | 30 | 30 | 25 | every30 |
| corridor:80+92:11828-22944:dd89225f | 80 92 | 7 | 24 | 30 | 30 | 24 | every30 |
| corridor:80+92:11807-22993:55df6039 | 80 92 | 4 | 27 | 30 | 30 | 26.6 | every30 |
| corridor:3+83:10480-11974:0baa3be0 | 3 83 | 5 | 15 | 15 | 15 | 15 | frequent |
| corridor:3+83:18861-33149:7beea0e7 | 3 83 | 4 | 15 | 15 | 15 | 15 | frequent |
| corridor:100+92:11800-18685:2aae4ae0 | 92 100 | 4 | 25 | 30 | 30 | 25 | every30 |
| corridor:92+93L:23181-23183:ffbed3be | 92 93L | 4 | 26 | 30 | 30 | 26.3 | every30 |
| corridor:92+93L:20760-23103:b64f5eee | 92 93L | 4 | 26 | 30 | 30 | 26 | every30 |
| corridor:100+92:11815-18685:5533ab6a | 92 100 | 3 | 25 | 30 | 30 | 25 | every30 |
| corridor:135+139:16195-26193:30ef315e | 135 139 | 3 | 30 | 60 | 60 | 30 | every30 |
| corridor:135+139:16196-26193:dda5568e | 135 139 | 4 | 30 | 60 | 60 | 30 | every30 |
| corridor:139+169+169L:12645-22227:b9dfde3b | 139 169 169L | 3 | 30 | 60 | 60 | 30 | every30 |
| corridor:139+169+169L:12646-23486:c1fe4289 | 139 169 169L | 3 | 26 | 60 | 60 | 26.5 | every30 |
| corridor:120L+145X:22733-24530:2be2f906 | 120L 145X | 9 | 60 | 60 | 60 | 60 | hourly |
| corridor:153+483:25752-35358:49b3dd78 | 153 483 | 3 | 15 | 15 | 15 | 15 | frequent |
| corridor:153+483:25559-25738:263802ba | 153 483 | 4 | 15 | 15 | 15 | 15 | frequent |
| corridor:153+169:22037-33362:e4376b9c | 153 169 | 11 | 15 | 15 | 15 | 14.8 | frequent |
| corridor:169+169L:19618-19620:8eb8d3c9 | 169 169L | 3 | 60 | 60 | 60 | 60 | hourly |
| corridor:169+169L:17630-23890:79790378 | 169 169L | 29 | 60 | 60 | 60 | 60 | hourly |
| corridor:169+169L:24512-25812:6c9a5643 | 169 169L | 6 | 60 | 60 | 60 | 60 | hourly |
| corridor:169+169L:23902-24520:41b51df0 | 169 169L | 5 | 60 | 60 | 60 | 60 | hourly |
| corridor:169+169L:23912-24521:1e0cc32b | 169 169L | 10 | 60 | 60 | 60 | 60 | hourly |
| corridor:169+169L:17628-23917:d86f62e3 | 169 169L | 7 | 60 | 60 | 60 | 60 | hourly |
| corridor:169+169L:22200-23659:3e7f7342 | 169 169L | 3 | 60 | 60 | 60 | 60 | hourly |
| corridor:153+169:22038-25559:445859c0 | 153 169 | 12 | 15 | 15 | 15 | 15 | frequent |
| corridor:169L+45:23707-25805:f6750926 | 45 169L | 4 | 30 | 30 | 30 | 30 | every30 |
| corridor:204+SKIP:16686-19310:d484aeaf | 204 SKIP | 3 | 9 | 10 | 10 | 9 | frequent |
| corridor:206+SKIP:12603-14126:185b9b14 | 206 SKIP | 7 | 10 | 10 | 10 | 10 | frequent |
| corridor:208+SKIP:24252-33604:59610b53 | 208 SKIP | 11 | 10 | 10 | 10 | 10 | frequent |
| corridor:208+BOND:10726-10845:830ede98 | 208 BOND | 4 | 15 | 15 | 15 | 15 | frequent |
| corridor:208+SKIP:12539-12590:2bdfcd27 | 208 SKIP | 10 | 10 | 10 | 10 | 10 | frequent |
| corridor:225+287+LD:17875-17969:3f262ffc | 225 287 LD | 5 | 60 | 53 | 30 | 59.8 | hourly |
| corridor:287+LD:17962-29202:01e67409 | 287 LD | 4 | 60 | 60 | 60 | 59.5 | hourly |
| corridor:287+LD+LX2:17635-33297:ae40adf7 | 287 LD LX2 | 5 | 60 | 60 | 60 | 60 | hourly |
| corridor:287+324:15146-17636:1eb7f425 | 287 324 | 3 | 22 | 30 | 30 | 22.4 | every30 |
| corridor:287+324:15159-17639:9f9d99db | 287 324 | 6 | 23 | 30 | 30 | 23.2 | every30 |
| corridor:287+LD:21222-25900:5b2702f0 | 287 LD | 5 | 59 | 60 | 60 | 59 | hourly |
| corridor:287+324+327:17848-26342:0c9a3cb7 | 287 324 327 | 3 | 20 | 30 | 30 | 20 | every30 |
| corridor:287+324:15142-17968:f88d0d8d | 287 324 | 6 | 27 | 30 | 30 | 27.4 | every30 |
| corridor:287+324:17660-25633:b3ce09a3 | 287 324 | 3 | 27 | 30 | 30 | 26.9 | every30 |
| corridor:287+LD:17661-29201:db0f1688 | 287 LD | 22 | 60 | 60 | 60 | 59.8 | hourly |
| corridor:323+324:19441-34190:620accc2 | 323 324 | 3 | 25 | 30 | 30 | 25.2 | every30 |
| corridor:323+324:23342-34191:2e4f2600 | 323 324 | 3 | 29 | 30 | 30 | 29.3 | every30 |
| corridor:205+BOLT:10726-33383:12b4c1fe | 205 BOLT | 8 | 30 | 30 | 30 | 29.8 | every30 |
| corridor:205+BOLT:10725-19979:b4231777 | 205 BOLT | 8 | 29 | 30 | 30 | 29 | every30 |
| corridor:DASH+GS+SKIP:12471-12604:fd930e61 | DASH GS SKIP | 3 | 10 | 10 | 10 | 10 | frequent |
| corridor:AB+FF:12478-34195:24223591 | AB FF | 4 | 15 | 15 | 15 | 14.8 | frequent |
| corridor:AB+FF:34195-35215:a12376d9 | AB FF | 4 | 11 | 15 | 15 | 11 | frequent |
| corridor:AB+FF:16342-17989:3a89923c | AB FF | 4 | 13 | 15 | 15 | 13 | frequent |

_Generated 2026-11-02T04:35:27.650Z by qa/scripts/audit-corridors.mjs_
