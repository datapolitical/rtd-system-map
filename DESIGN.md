# RTD system map: design specification

This is the source of truth for what this site is, who it is for, and how it
should look and behave. Read it before changing the map, the interface, or the
data pipeline. When a decision changes, update this file and add a line to the
decision log at the bottom.

## Principles

Six principles, in priority order. When two of them pull against each other,
the higher one wins (Chris, 2026-11-10). The sections named after each carry
the detail.

1. **Nothing a rider acts on is wrong:** which line, which station, how
   often, where it goes. A drawing may be tidied; a fact may not ("It looks
   designed" under "Objective", "Zero maintenance", "Data").
2. **Everything can be read:** contrast and size, in light and in dark, on a
   phone ("Quality floor", "Dark mode", "Phones first").
3. **How often service comes is obvious at a glance.** It is the map's main
   job, and the lines carry it ("Objective", "Frequency and schedules",
   "Hierarchy").
4. **Every label clearly belongs to one thing.** A label that can't be tied
   to its line or place at a glance is dropped, not nudged ("Name what can be
   read as named", "Where the labeling rules come from").
5. **The map is calm, not crowded.** A mark is there because someone looking
   at that much of the city needs it ("Every mark earns its place", "By zoom
   level").
6. **The map looks designed by a person:** even packs, clean branches, lines
   that end together ("It looks designed", "Shared track").

Two examples of the order at work. A place's name gives way to a line,
because the lines carry how often service comes (3) and a name can move
where a line can't: DENVER and AURORA are not drawn in a phone's "Whole
network" view, where no clear spot is near enough. And a clean drawing wins
over the surveyed geometry (6) only until it would put a line on another
street or past a station (1).

The design review rubric scores a change against these (see "Design review
rubric").

## Objective

Open the site and see **all of Denver's transit** at a glance: where service
goes, **how often** it comes, and where you are in relation to it. That's
what people expect when they look up a transit map, so it's what opens.

One button, **Live**, turns the same map into right now: what's running and
how often it's coming at this moment, where the trains and buses are, and
what's wrong. The full map is the reference. Live is for the trip you're
taking.

The map's main job is to show how often service runs, not just where it goes.
The full map shows a typical weekday; Live shows the next 90 minutes. They differ a
lot: of the 27 lines that run every 15 minutes at noon on a weekday, 5 still
do at 9pm, and 44 routes have stopped for the night (see "Why"). So Live is
always one tap away, and every frequency the map states says when it
applies.

**The map is the interface.** People come with many questions: what's near
me, which lines run near a place, where a route goes, whether a neighborhood
has good service, or just how the network fits together. We don't know yet
which questions matter most, so the design doesn't pick one and funnel
everyone into it. RTD's app does that, with a few fixed views built on
assumptions about what riders want, and it's the thing this site is meant to
fix. Instead, the map reads well at every zoom, and tapping anything (a
line, a station, a stop, a FlexRide zone, a spot on the map) explains it. We
specialize only after seeing what people actually do.

**What the bus lines say.** Two things. How often a bus comes along a
street, at every zoom, by the line's weight. And which routes run on it,
without a tap, from the zoom where a rider is choosing a bus (Chris,
2026-11-10: the map must show which route is which, at the appropriate zoom
level). The first is drawn. The second is not yet: three ways of numbering
the lines failed (see "Bus routes", "Numbers"), and the scheme and its zoom
are still to be found (#7).

**Name what can be read as named.** A train line carries its letter along
it, so any line on screen can be told from the others; a station is named
where its name can sit beside it; a bus route is named where its number can
be tied to one line or one street, and until a way of doing that passes
review it is named by a tap. A label goes on the map only where a reader can
tell at a glance what it belongs to. Bus numbers along shared streets were
tried three ways and failed that test, so the map carries none today, not an
ambiguous one (see "Map design"). Comparing V2 with other agencies'
maps had found unnamed lines its biggest gap (see "Why"); a week of
screenshots found labels that couldn't be tied to their lines a worse one.

**It looks designed, and it is as accurate as it can be while looking that
way.** The map should look as if a person drew it on purpose: lines that run
together are one even pack, they branch off in clean curves, they end
together, and nothing is ragged or accidental. RTD's data is a survey, exact
to the meter, and a survey drawn as it comes looks like a mistake wherever
tracks sit unevenly side by side or platforms are staggered. A rider judges
the map by how it looks, and a map that looks careless isn't trusted on the
things it gets right. So where the exact geometry and a clean drawing
disagree, the clean drawing wins, within reason: a line may sit some meters
from its track, never on another street, past a station, or anywhere that
would send a rider to the wrong place. Everything a rider acts on (which
lines, which stations, how often, where they go) stays exact and is never
set by hand. The cleaning is a rule in the build that works on any network
wherever a place is one case of a pattern; a visual fix for one named place
is allowed only in the way "Rule 1" sets out. (Chris, 2026-11-06: "we want
this to look intentional
and clean, like it was designed by a person ... the goal of this is to look
designed while also being technically accurate as much as possible.")

**Phones first.** Most people will use this on a phone, in their hand, often
on the move. Print transit maps (the NYC subway poster, say) are references
for clarity, not for interaction: big tap targets, one-thumb reach, detail
that arrives with zoom, and panels that never hide what they describe come
first.

**A sense of place.** You should always be able to tell where you are:
which streets cross, which neighborhood you're in, which way the mountains
are. The basemap's colors stay quiet so the network leads, but its words
(streets, highways, neighborhoods, landmarks) stay clear, and "near me" puts
you on the map.

## Who it is for

**People finding out what transit they can use** at a specific place:
everyday riders (at home, at a new job), new residents, apartment hunters,
occasional riders, visitors. They want the whole network and how often each
line comes. That's the map that opens.

**Riders on the move,** at a stop, on a platform, leaving work. They want to
know what's running, when the next one comes, and whether something's wrong.
Live is for them, one tap from the opening view, and any stop's panel gives
its next departures in either view.

**People who talk about the system.** Advocates, journalists, and elected
officials need a clear picture of where Denver has useful transit and when.
A frequency map at any time of the week ("here's Denver's Sunday network")
is that picture, and every view can be shared as a link. They need no extra
features.

## Why: the research behind these choices

- **Maps come before trip planners.** People look for transit information only
  once they already consider transit an option (Farag & Lyons, 2010, 2012).
  Trip planners answer a question you already have. A map shows what is
  possible, which is how people find the question (Wessel, *Human Transit*).
- **Frequency is the most useful thing a map can show.** In a Vienna
  experiment, maps showing service frequency helped most on trips with
  transfers, especially for novices; real-time positions helped most on simple
  trips (Hochmair). Frequent-network maps show *when* service exists, not just
  *where* (Walker). RTD's current map draws a route that comes every 10
  minutes exactly like one that runs four times a day.
- **Maps strongly shape decisions.** London riders weighted Tube map distance
  twice as heavily as actual travel time (Guo, 2011). Redrawing one transfer
  on the Paris RER map reversed riders' choices, and about a third misread
  transfers (Grison et al., 2022). Clutter and ambiguous drawing cause wrong
  choices.
- **Whole-network bus maps are cluttered for local questions.** Riders find
  them a useful reference but hard to read for "what's near me" (UK suburban
  bus map research, 1982). Maps of a single stop's service improved accuracy
  and speed (Evans, 2009).
- **Live data helps, modestly.** Real-time arrivals cut perceived and actual
  waits (Watkins et al., 2011, Seattle: 7.5 vs 9.9 minutes perceived) and
  raised bus ridership about 2% (Brakewood et al., 2015, NYC; Tang &
  Thakuriah, 2012, Chicago). Worth having, but it is a layer, not the product.
- **Preference is not performance.** The most popular map designs in Maxwell
  Roberts's studies caused the most journey-planning errors, and users did not
  notice. We validate with task tests, not opinion.
- **A typical-weekday map overstates service at night and on weekends.**
  Counted from RTD's schedule (November 2026 feed) by departures in one hour at each
  route's busiest stop, about 125 routes in all:

  | When | Every 15 min or better | Not running |
  |---|---|---|
  | Weekday 7am | 32 (7 of them rail) | 16 |
  | Weekday noon | 27 (7 rail) | 19 |
  | Weekday 6pm | 22 (5 rail) | 16 |
  | Weekday 9pm | 5 (no rail) | 44 |
  | Weekday 11pm | 2 | 65 |
  | Saturday noon | 20 (7 rail) | 26 |
  | Sunday noon | 16 (7 rail) | 37 |
  | Sunday 9pm | 2 | 55 |

  A rider at a stop at 9pm, shown the noon map, sees 22 frequent lines that
  aren't. That's why Live exists, and why the full map labels its frequencies
  "weekdays 9 to 3".
- **Other agencies' maps name what they draw** (survey, 2026-11-01, region
  to street zoom, phone and desktop):
  - **TransLink** (Vancouver): shows only rapid lines at region zoom. At city
    zoom it repeats every route's number along its line and names every
    station. At street zoom it shows every stop with its stop number.
  - **RTD's own map** names each rail line along it at region zoom ("A-Line").
  - **Google** draws rail only, but fills the map with places: neighborhoods,
    hospitals, malls, the zoo.
  - **TriMet** opens on downtown with vehicles moving live.
  - **Metro Transit** (Minneapolis) shows every route number at once, which
    is unreadable.
  - **MTA** has retired its live subway map.

  Our V2 drew lines one or two zoom levels before naming them. On the opening
  view no line, station, or airport was named, which is why it felt like it
  said less than it should.

Links are in [Sources](#sources).

## Zero maintenance: RTD's changes flow through automatically

When RTD edits its map or publishes a new schedule, the site picks it up on
its own within about an hour. Nobody should have to touch the code, the data,
or a deploy button for routine changes: new or retired routes, a new rail
line, recolored lines, moved stops, new Park-n-Rides, a new runboard, or RTD
pointing its map at different services.

### Rule 1: nothing about the network is hardcoded

The code knows how to draw *kinds* of things, never *specific* things.

- **Sources are discovered, not listed.** The build starts from the one ID
  that defines RTD's official map, the Experience Builder item
  `4a812ebf793646be945b7d58dcfbb794`. It follows that item to its current web
  map, then to the feature layers the web map uses, identifying each layer by
  its role (routes, stations, facilities, stops, FlexRide, boundary) from the
  service's own metadata. If RTD points its map at a new web map or new
  services, the build follows.
- **Rail lines, their letters, and their colors come from the data:** the
  route layer plus GTFS `route_color`. A new line appears with its official
  color and bullet without a code change.
- **Side-by-side rail is computed, not assigned.** The build finds where lines
  share track and works out each line's position in the bundle from the
  geometry. Nothing lists which lines share which corridor.
- **Categories come from attributes.** Bus styling is driven by computed
  frequency and by ArcGIS `TYPE`/`SERVICE` values. An unfamiliar value falls
  back to the plain local-bus style and is reported in the build log; it
  never breaks the map.
- **Prominence follows rules, not lists.** For example, "stations served by
  rail show at low zoom." Never a list of station IDs (RTD's own web map
  hardcodes one; we don't copy that).
- **Frequency is recomputed on every build** from whatever schedule RTD
  currently publishes. Representative dates (a typical weekday, Saturday, and
  Sunday) are chosen from the feed's own calendar, skipping holidays and
  one-off exceptions, so a new runboard needs no configuration. Live is
  worked out in the page from the published schedule and calendar, so the
  time of day, holidays, and service changes need no configuration either.

Tables of current values in this document (layer URLs, rail colors, counts)
are a snapshot for reference only. The code must not depend on them.

**Facts are never set by hand. A visual fix for one named place may be**
(Chris, 2026-11-10; until then every cleanup had to be a general rule, which
meant writing an algorithm for any network to tidy a single station).

- *Facts* are routes, stations, frequencies, colors, names and what stops
  where. They come from RTD's data on every build, as above, with no
  exceptions.
- *A visual fix* moves or reshapes what is drawn at one place, within the
  limits "It looks designed" sets: some meters, never onto another street or
  past a station. It cannot add, remove or rename anything.
- Fixes live in one small file the build reads. Each names its place by
  RTD's own ids and records a fingerprint of the geometry it was written
  for. When RTD changes that place the fingerprint no longer matches, the
  fix is skipped, and the build log says so. A stale fix can never draw, so
  RTD's changes still flow through with nobody involved.
- A general rule is still preferred where one place is a case of a pattern.

Not built yet: neither the file nor the build's reading of it exists (#64).
Until it does, every cleanup is still a rule in the build.

### Rule 2: the site refreshes itself

```
every hour   Cloudflare Worker (cron)
               │  ask RTD: has anything changed?
               │  (Experience, web map and layer edit dates; GTFS file hash)
               │  compare with /data/meta.json on the live site
               ▼
   changed?  ──yes──> Cloudflare Pages deploy hook
                         └─> fresh build: npm run build, checks, deploy
```

- ArcGIS reports change dates directly: the Experience and web map items have
  `modified`, and each feature service has `editingInfo.lastEditDate`.
- RTD's GTFS download sends no `Last-Modified` or `ETag` header, but its bytes
  are identical between downloads. The checker downloads the file (about
  11 MB) and compares its SHA-256 hash with the last build's.
- A full build runs only when something has actually changed.
- `meta.json`, published with each build, records the version of every source
  the build used. The checker compares against it, so it needs no stored
  state of its own.
- This runs on Cloudflare, not as a scheduled GitHub Action, because GitHub
  turns off scheduled workflows in public repos after 60 days without
  commits. That would silently stop updates.
- Live vehicle data needs none of this. It is always current.

### Rule 3: a bad update never breaks the site

The build checks the data before it deploys:

- Every source downloaded and parsed.
- Counts are plausible: routes, stops, and stations are within a reasonable
  range of the live site's `meta.json`. A sudden drop to zero means a broken
  download, not a network change.
- At least 95% of ArcGIS routes match a GTFS route.
- Every rail line has a color.
- At least half of the map's stations have trains (see "Station service").

If any check fails, the build fails, and Cloudflare keeps serving the last good
version. The live `meta.json` still shows the old versions, so the next hourly
check tries again. A temporary outage at RTD therefore fixes itself.

Cloudflare's deployment-failure notification emails the owner. That email is
the only time a person needs to look, and it should be rare: a failure that
lasts means RTD changed something structural, such as renaming fields or
retiring the map.

The footer shows when the map data was last updated ("Map data from RTD,
updated Oct 30"), so a stale map is visible to everyone.

## Non-goals

- **Trip planning (A to B directions).** Google Maps and Transit do this well.
  Link out to them instead: place, stop, and "From here" panels have a
  Directions link that opens transit directions to that spot in Google Maps,
  or Apple Maps on Apple devices.
- **Fares, tickets, accounts.** Link to RTD.
- **Looking official.** This is an independent site. No RTD logo or branding,
  and every page says it is not affiliated with RTD.

## What people can do, in priority order

### 1. See the whole network

This is the map itself: what opens on a wide screen, and one tap ("Whole
network") from what opens on a phone (see "Opening state"). It shows every
route RTD runs, drawn by how often it comes on a typical weekday, 9am to 3pm:

- Routes every 15 minutes or better are bold and unmistakable.
- Less frequent routes get progressively lighter.
- Rush-hour and few-trip routes are dashed or dotted and faint.
- Rail lines are the strongest element, in their official colors.

Rail lines carry their letter, and stations their name, where it can be read
as theirs (see "Map design"). Bus lines carry no number yet (see "Bus
routes", "Numbers").
Stations without trains for now are drawn gray (see "Station service").

*Done when:* someone who has never seen the map can point to the frequent
routes near a named place within 10 seconds.

### 2. Live: what's running now

One button, always on screen, labeled **Live**. Turning it on redraws the same
map for right now:

- **Frequency:** lines are drawn by how often they run over the next 90
  minutes of today's service, in the same tiers.
- **Lines that aren't running now** stay as faint hairlines, so the network
  keeps its shape. Each says when it starts again.
- **Calendar:** holidays and service changes come from the feed's calendar,
  so on Thanksgiving Live shows Thanksgiving service.
- **Vehicles:** trains move at their live positions from zoom 9.75, where
  the rail letters begin, and buses from zoom 13, with their route numbers
  from 14.5. When Live is on and part of that is out of view, the map says
  so once (see below).
- **A train off its track is drawn fainter**, at 45%: one more than 200 m
  from its own line's track, as the map draws it (the routes file, read in
  the page and measured at each update; `public/js/track.js`). That is a
  train laid over in a yard or on a tail track past a line's end, or
  running on another line's track to get there, and drawn at full strength
  in a park it read as an error. Measured 2026-11-07 over twenty minutes of
  RTD's feed (952 positions of 52 trains): trains in service came within
  120 m of their line, 83% within 30 (the 120 is the A between 61st / Pena
  and the airport, where RTD's drawn line runs about 100 m off the real
  track); trains at an end platform within 95 m. Trains in the Union
  Station yard were 226 to 310 m off, so 200 leaves 80 m on each side.
  Trains on tail tracks past an end measured 130 to 380 m: past Wheat
  Ridge / Ward Road and Littleton / Mineral (230 to 380) they are faint,
  past RidgeGate (130 to 196) and Lincoln not. A T running on another line's
  track to or from a yard is faint when it is that far from the T's own
  line. A line the map has no track for is never judged.
- **Alerts:** RTD's service alerts are drawn where they apply.
  - A line with no service, a detour, or major delays gets an alert mark on
    its bullet or tag.
  - A closed stop or station is crossed out.
  - An elevator outage shows on its station.
  - Tapping a mark shows RTD's text.
  - Only alerts in effect now that change service are drawn. The rest are in
    the panels.
  - A line whose alert stops all its service draws as not running.

While Live is on, the button reads "Live, just now" with the live mark: the
age of the positions shown, never a clock time. Under 30 seconds old it says
"just now"; after that "1 min ago", "2 min ago", and so on, redrawn every few
seconds as time passes, not only when positions arrive. Past two minutes the
dot stops pulsing and dims, and the age stays on the pill. Before the first
positions arrive it reads just "Live". Tapping it again returns to the full
map.

Live says why when the screen shows nothing live. When it's turned on, and
when the zoom later settles on the other side of a threshold, a line on the
map says what's missing: below 9.75, "Zoom in to see the trains."; from 9.75
to 13, "Trains are on the map. Zoom in for buses."; from 13, nothing. It waits
for the zoom to rest for a moment, so a pinch doesn't make it chatter, and
goes after a few seconds. A loading or failure line takes its place.

If RTD's live feeds fail, Live still shows the schedule for now and says
plainly that positions and alerts aren't loading.

*Done when:* someone can say within 10 seconds which lines near a named place
are running often right now, and whether any of them has a problem.

### 3. Tap anything and it explains itself

One tap opens a panel for whatever you touched. Panels answer "when's the
next one?" and "is anything wrong?" in either view, Live or not:

- **A stop:** its next departures by route and direction. Each is live where
  RTD has a prediction ("4 min", with the live mark) and scheduled otherwise
  ("9:41 pm"). The panel also gives the stop number and whether the stop is
  accessible.
- **A station:** the next trains on each line and direction, then the buses
  that stop there, then parking (spaces, fees). An unserved station says so
  first.
- **A line**, opened from a stop, a station, search, the Lines list, or its
  tag or bullet on the map:
  - It's highlighted end to end and everything else fades.
  - The panel shows where it goes, how often it runs through the week and
    right now, its first and last trips, alerts, and (in Live) its vehicles.
- **A vehicle** (in Live): its route, where it's headed, how late it is, and
  how full.
- **A FlexRide zone:** what it is, its hours, and a link to RTD to book.
- **Anywhere else, "From here":** every route within about a 10-minute walk.
  - Each row shows the route's bullet, where it goes, how often it runs, its
    next departure, and the walk to its stop.
  - Rows are sorted by how often the route runs at the time the map shows,
    then by walking time.
  - Rail within about a 20-minute walk is included.
  - "Near me" does the same for your location.

*Done when:* someone can answer "when's the next bus I can catch from here?"
in under 20 seconds, and "what's the most frequent bus within a 5-minute walk
of this address?" in under 30.

### 4. Other times of the week

The full map shows weekday daytime, and its key says so. The key also offers
Weekday evening, Saturday, Sunday, or a day and time you pick:

- The map redraws for the time you chose, and the key's title says which.
- The choice is part of the link, so "Denver's Sunday network" can be shared.
- Turning on Live replaces the chosen time with now. Turning it off returns
  to the chosen time.

### 5. Find anything

One search box for routes (by number or name), stations, Park-n-Rides, stops
(by name or stop number), landmarks, and street addresses.

Built so far (2026-11-06): routes, rail stations, Park-n-Rides and transit
centers, and bus stops. Landmarks and street addresses are not built.

### 6. Understand rail and transfers

Stations are clear and labeled. Where several rail lines share track, they are
drawn side by side, never on top of each other.

### Later

- **Places worth going (V3).** Once you're zoomed in to a neighborhood,
  places you might want to go fade in, from the points-of-interest database
  the project has access to. Which database, and how it's updated and
  licensed, is an open question.
- **Spanish.** The interface in Spanish, chosen from the device's language.

## Data

All data is public and comes from RTD. Nothing depends on a private key, a
private server, or the departures project on mini.

### Map geometry: RTD's own system map

The same ArcGIS feature services that RTD's official Experience Builder map
uses. All are public, return GeoJSON, and allow requests from any site. The
build discovers them from the Experience item on every run (see Rule 1). The
table below shows what that discovery currently finds, as of 2026-11-01 (web
map `941d6614b0cf4ece851cad9960e295e7`).

Base: `https://services5.arcgis.com/1fZoXlzLW6FCIUcE/arcgis/rest/services/`

| Layer | Service / layer | Notes |
|---|---|---|
| Bus and rail routes | `RTD_GIS_Current_Runboard/FeatureServer/4` | 131 routes. `TYPE` is LOC, REG, SKY, CNR or LRT (LRT includes commuter rail). `SERVICE` gives the category. |
| FlexRide zones | `RTD_GIS_Current_Runboard/FeatureServer/7` | 13 polygons |
| Rail stations | `RTD_GIS_Current_Runboard/FeatureServer/1` | 77 stations |
| Facilities | `RTD_GIS_Current_Runboard/FeatureServer/0` | 131: Park-n-Rides, transit centers, stations. Parking spaces (`AUTOS`) and fees. |
| Bus stops | `RTD_GIS_Current_Runboard/FeatureServer/2` | 7,555 stops. `BSID` matches the GTFS `stop_id` for 7,497 of them. |
| RTD boundary | `RTD_GIS_Boundaries/FeatureServer/0` | Use the web map's own filter (currently `BND <> 'IN'`) |
| Landmarks | `RTD_Search_Layers/FeatureServer/1` | 371 landmarks, for search. Found through the Experience's search data source. |

Where RTD's web map applies a filter to a layer, the build reads and applies
that filter instead of copying it into our code.

The boundary layer RTD's map shows is a mask: a large rectangle with the
district cut out of it. ArcGIS's GeoJSON output lists that cut-out as a
separate polygon, so the build rebuilds polygon nesting from the geometry
for every polygon layer.

The build step downloads these and saves simplified GeoJSON, so the site
doesn't depend on ArcGIS staying up.

**Rail is drawn from GTFS shapes, not from RTD's map.** RTD's map draws some
rail lines twice on slightly different paths, with tail track past the last
station and connecting spurs, so line ends looked wrong and shared track
couldn't be found. Each rail line is drawn from the shape its trains most
often use in each direction on a typical weekday, simplified to about a
meter. A line with no shapes keeps the map's geometry. Then the build:

- keeps a line's track once: the longest direction whole, the other only
  where it goes somewhere the first doesn't
- drops kinks where a shape doubles back over less than 100 m (at a stop or a
  switch), which offset lines would turn into spikes
- cuts the track at each line's end stations, removing tail track
- moves each station onto its lines' track when it's within 200 m, since
  RTD's station points can sit a platform's width off it

### Frequency and schedules: RTD's GTFS feed

`https://www.rtd-denver.com/files/gtfs/google_transit.zip` (about 11 MB).
RTD updates it with each runboard and sometimes between runboards. The build
records the feed's `feed_version` and file hash in `meta.json`.

**How frequency is measured.** For each route and direction, take the typical
(median) gap between departures at one representative place within a time
window; a rail line's place is its busiest stop, a bus route's is described
under "Bus routes are measured by stretch". A tier is set by the less
frequent direction. When trips bunch, the average gap stands in for the
median: if the average is more than 1.5 times the median, the average is
used (`BUNCHED` in `scripts/lib/gtfs.mjs`). The threshold comes from the
November 2026 feed, where genuinely bunched pairs ran at 4 times the median
or more and ordinary timetable drift stayed under 1.4. Route 8's Broadway
stretch is the one that changed: "every 7 min" became every 30. The window
follows the time the map shows:

| Time shown | Window |
|---|---|
| Weekday daytime (the full map, the default) | 9am to 3pm on a representative weekday |
| Saturday, Sunday | 9am to 3pm on a representative date |
| Weekday evening | 7 to 10pm on a representative weekday |
| Live | the next 90 minutes of today's service |
| A day and time you pick | the 90 minutes from then, on that date's service |

Times are Denver's, whatever time zone the device is set to. Representative
dates come from the feed's calendar (see Rule 1). Live and a picked time use
the real calendar for that date, exceptions included.

**How this compares with RTD's and DRCOG's measures.** The map's measure is
for riders: how often one line comes at one time of day. It is not RTD's
service standard, and the README says so where RTD's staff will look first.

- RTD's *Transit Service Policies & Standards* (revised July 22, 2016, the
  latest version found, see Sources) sets minimum frequencies by service type
  and time of day, "by corridor (multiple routes sharing a segment)" (Table
  1). Its weekday midday is 9am to 3pm, the same window as ours; its peaks
  are 6 to 9am and 3 to 6pm (our "Rush hours only" test uses 3 to 8pm). Rail
  and BRT: every 15 min weekdays 6am to 6pm, every 30 weekday evenings and
  Saturday, every 60 on Sunday and late at night. Local buses: every 30 at
  peaks; every 30 or 60 at midday, by ridership; every 60 evenings and
  weekends. It defines no "frequent" label. Section 2.3.4 says RTD schedules
  on the clock (every 60, 30, 15, 10, 7.5 or 5 min), so our tier breaks at
  15, 30 and 60 sit on RTD's own scheduled frequencies.
- DRCOG's Metro Vision plan calls a stop high-frequency when it has 96 or
  more departures on a typical weekday (an average of every 15 min across
  the day), counted at the stop.

Where the map differs: it measures each route alone (combined frequency on
shared streets is open, see "Corridors by combined frequency are not
built"), and it shows one window, so all-day standards and the map can
disagree about the same route.

| Tier | In the window | How it's drawn |
|---|---|---|
| Frequent | every 15 min or better | bold, full ink |
| Every 30 | 16–30 min | medium |
| Hourly | 31–60 min | thin, light |
| Infrequent | more than 60 min, or a single trip | thin, light (the same look as hourly) |
| Not running | no departure in the next hour (Live, picked time); no trips that day (typical times) | hairline, faint, no tag |

Hourly and infrequent stay separate in the data (`tier` keeps both) but share
one look and one row in the key, "Every 31 min or more", because the 30-minute,
hourly and less-than-hourly looks could not be told apart on screen.

In the typical views, a route that runs that day but not in the window is
described by when it does run:

- **Rush hours only:** trips both before 9am and between 3 and 8pm. Drawn
  thin, dashed, and faint.
- **A few trips:** any other part-time pattern. Drawn thin, dotted, and faint.

In Live, the same routes are simply running or not, and their panel says
"Rush hours only".

"Rush hours only" is a promise about *when*, so it is used only when the
route really runs in both rush periods. A route whose only trips are early
in the morning is "A few trips"; calling that rush-hour service would mislead.

Every frequency shown to riders says when it applies. Some examples:

- "Every 10 min now"
- "Every 15 min, weekdays 9 to 3"
- "Not running now, starts 5:12 am"
- "No more trips today"

The route panel also shows weekday peak, evening, Saturday, and Sunday
frequency, plus first and last trips, so one number is never read as all-day
service.

**Bus routes are measured by stretch, not once per route.** A bus route can
come every 15 minutes in one place and a few times a day in another: the
Flatiron Flyer family was drawn as every 15 minutes all the way to Aurora,
where only a few trips a day run, and routes 83, 225, 228, AB, AT and NB had
the same error. So the build (`scripts/lib/stretches.mjs`):

1. cuts each drawn bus line into 50 m cells
2. matches the cells to GTFS shapes (within 50 m, on a similar bearing).
   A shape can pass a cell twice: a loop, or a tail past the last stop where
   the bus runs back empty along the street it came in on (the airport
   routes do). Each trip pattern takes its closest pass that lies between
   its own first and last stops
3. measures the weekday 9am to 3pm gap in each direction at one
   representative place for each stretch, the middle of the stretch's longest
   run; the worse direction sets the tier
4. merges runs shorter than 600 m (300 m at a free end) into their neighbour

In `routes.geojson` each bus feature is one stretch with its own `tier`,
`wk`, `sa`, `su`, trip counts, and first and last times. It also carries
`route_tier` and `route_wk` for the whole route, and `stretch` (0 is the
longest). A stretch's tier can be `none`: no weekday service there, weekend
only. Today 31 of 108 bus routes are split. `directory.json` keeps one
whole-route entry per route. Rail is not split.

Known limit: the worse direction sets the tier even where it is a couple of
stray trips on a one-way roadway. The AL's last 0.8 km into the airport
carries 16 inbound trips a day, hourly, and 2 outbound, so it is drawn "rush
hours only"; the hourly line beside it reaches the terminal. Ignoring a
direction with under a quarter of the other's trips was tried 2026-11-06 and
not adopted: it also relabelled pieces of the 169L, 225 and FF where neither
reading is clearly better.

**What the build publishes for this.** The build doesn't fix one answer. It
publishes:

- **The weekday daytime tiers** on the route lines themselves, as now, so
  the full map draws with nothing else loaded.
- **Shared-street labels** (`busnames.geojson`, built and tested, not loaded
  by the page since 2026-11-06; see "Bus routes", "Numbers"): where several
  routes share a street (within 35 m, within 25 degrees of bearing), one
  label run naming them, strongest tier first and then in number order, at
  most four, with a "+" for the rest. Fields: `pills`
  (`"0:frequent 15:frequent 9:slow +:more"`: each route's look, the two main
  tiers and one look for every slower tier, so a route's hourly and
  rush-hour stretches share a row), `text_main` (the routes every 30 minutes
  or better, as text), `more` (1 when the row doesn't name every route),
  `routes`, `tier` and `n`. This is naming only: the drawn lines are the
  streets of `streets.geojson` (see "Bus routes").
- **Stops** with `lines`, the drawn map routes that actually stop there
  (families mapped to the drawn code, so FF1 is FF), and `heading`
  ("Northbound", "Southeast-bound", and so on). Stop popups used to list
  routes that pass a stop but do not stop at it, with no direction. A stop
  only trains call at carries `platform`: it is a platform of its station,
  which the station's mark stands for, and is not drawn as a stop (the small
  dot is a bus stop, and these stood on the rail line beside the mark).
- **`meta.json`:** besides source versions and bounds, `window` (`{"from":
  "09:00","to":"15:00"}`, from which the page words "Weekdays, 9am to 3pm"),
  `rail[].ends` (each line's two end names, from what trains there say
  they're going),
  and `counts.busnames`. `tiers` counts the routes with at least one stretch
  in each tier.
- **FlexRide zones** carry `url`, which is null for every zone today: RTD's
  layer and GTFS have no per-zone link. The page falls back to RTD's general
  FlexRide page (a named constant in `public/js/select.js`).
- **A schedule summary:** each route's departure times at its reference stop,
  for each direction and service pattern, plus the calendar with its
  exceptions. It loads in the background after the map draws, so Live and
  the other times switch instantly. It must stay small: tens of KB
  compressed, measured on every build.
- **Per-route timetables:** compact stop patterns with trip start times and
  offsets, one small file per route. They load when a stop, station, or route
  panel opens, and give scheduled departures where there's no live
  prediction.

The page works out the tiers for any moment from the summary. In Live it
recomputes every minute and fades a line to its new tier when it changes.

### Station service: also from GTFS

RTD's station layer lists every station, including ones with no trains right
now. Today ten stations on the downtown loop and Welton Street (16th &
California, 16th & Stout, 18th & California, 18th & Stout, 20th & Welton,
25th & Welton, 27th & Welton, 30th & Downing, Theatre District, Colfax at
Auraria) have no rail trips at all, but RTD's map draws them like every other
station. Service will return to them, so the build must notice both the loss
and the return on its own.

On every build:

1. Find GTFS stops served by rail trips and group platforms by their
   `parent_station`. Each group keeps its child stops and the lines that call
   at each, so the map can mark a station at more than one platform (see
   "Platform groups" under "Stations").
2. Match each group to the nearest station on RTD's map within 300 m.
3. For each map station, check the feed's calendar (with its exceptions):
   - **Served:** trains call there in the next seven days. Its lines are the
     rail routes that call there in that window.
   - **Returning:** no trains this week, but the feed has trains there on a
     later date. The map says "Trains return Nov 23".
   - **No current service:** no trains anywhere in the feed.

When RTD's feed brings trains back downtown, those stations draw as normal
stations on the next build, with no code or data change. The build reports
GTFS rail stops that match no map station, and fails if fewer than half of the
map's stations are served (a broken join, not a network change).

### Trains that aren't a line

RTD's feed can list trips under a line that RTD doesn't advertise. Today it
has five early-morning "D Line" trains a day, all southbound from Englewood
to Mineral, stopping only at C Line stations: trains getting into position
for their first runs. Drawn as a line, they put a D on the map that riders
can't use.

So a rail line whose trips all run in one direction, and which stops only
where another line also stops, is not drawn, listed, or shown at stations.
The build reports it ("not drawn, one-way trains on other lines' track: D").
A line that runs both ways, or serves a station no other line does, is drawn
as usual, so a real D Line returns to the map on its own.

Routes are matched between ArcGIS and GTFS in this order:

1. By route number or ID: ArcGIS `ROUTE` against GTFS `route_short_name` or
   `route_id`. For example, the map's `FREE` is GTFS route ID `FREE`, whose
   short name is `FreeRide`.
2. As a family RTD draws as one line, such as `FF` for FF1 to FF5. Family
   members share the map route's prefix and have exactly the same route name.
   A route RTD's map draws on its own is never another's family member, so
   225D and 225T stay their own lines while ATA, which has AT's name, joins
   AT. A family's frequency is measured across all its members, as riders on
   the shared trunk experience it.
3. Map routes that share a code with a FlexRide zone (`BMFX` and so on) are
   on-demand service with no timetable. The zone layer draws them, and they
   are left out of the route lines and the match check.

The build reports any map route that still doesn't match, and stops if more
than 5% don't. It reports any GTFS route RTD's map doesn't draw (none today)
without stopping.

**Routes go by their timetable names.** ArcGIS `ROUTE` is RTD's own code
for a route, and it is not always the name riders know: the map layer's
`BOND` is the Bound, `FMR` the MetroRide, `FREE` the FreeRide, `LD` the LD1.
Everything a rider reads (map labels, panels, the Lines list, stops,
stations, search results) shows the name on the bus and the timetable, by
this rule in the build (`riderNames`), with no list of routes:

- A map route that matches exactly one GTFS route takes that route's
  `route_short_name`.
- A family drawn as one line keeps the map's code, which is the part its
  members' names share (FF for FF1 to FF5).
- A route keeps the map's code if the timetable name has a space (routes are
  listed with spaces between them) or another route already goes by it.

The map's code is kept only as `code` in the route's directory entry, so a
search for "BOND" or "FMR" still finds the route. RTD's stop layer lists
routes by the map's codes; the build translates those too. The build reports
each change ("shown by their timetable name: BOND as Bound, ...") and
`meta.json` lists them under `renamed`. Checked 2026-11-06: four routes
change, and the other 113 already had the same code in both sources.

### Live data: RTD's GTFS-realtime feeds

`https://open-data.rtd-denver.com/files/gtfs-rt/rtd/VehiclePosition.pb`, plus
`TripUpdate.pb` and `Alerts.pb` in the same folder. Keyless and updated about
every 30 seconds. VehiclePosition is about 32 KB and covers about 380 vehicles
with route, trip, position, heading, and occupancy. TripUpdate is about 340 KB.

These feeds don't allow cross-site requests (no CORS headers, and the
browser's preflight check gets a 403), so the page can't read them itself. The
site relays them, and the relay pushes rather than being polled: one
Cloudflare Durable Object (`live/`, class `LiveRoom`) fetches the feeds
while anyone has Live on and sends each change to every open page over a
WebSocket (`/live/stream`, a Pages Function that hands the socket to the
object; same-origin only). The object polls RTD every 15 seconds, asks for
alerts once a minute, stores the latest decoded state, and stops polling when
the last page leaves, so RTD sees at most four requests a minute from the
whole site, and nothing at all when nobody is watching. A page that connects
gets the current state at once; one that sees nothing new gets a small tick
so it knows the relay is alive. The object decodes the protobuf
(`live/src/gtfsrt.mjs`, a hand-written reader of the few fields used, no
dependencies) and sends compact JSON, so the page has no decoder to load.

This replaced the first plan, a pull relay (a Pages Function per request with
a 10-second edge cache). That costs a Pages Function invocation for every
poll by every viewer, about 240 an hour per person with Live on, against a
free allowance of 100,000 a day. A push relay costs about one request per
page per visit plus a fixed four a minute, however many people are watching;
the nextride departures board uses the same shape of relay.

RTD's realtime feeds name some routes differently from its GTFS: its trains
report as 101E, 103W, 107R and so on where GTFS says E, W and R, and some
bus variants (83L, FF1, AB3) report under names GTFS folds into one route.
The build reads the vehicle and trip-update feeds and learns the table from
the trips both feeds name (`scripts/lib/realtime.mjs`), writing it to
`meta.json` as `live.routes`; nothing is listed by hand, and a feed that's
down at build time teaches nothing that day without failing the build. The
page puts a vehicle on its route by that table, and for an id the build never
saw, tries the pattern the table shows (the leading number removed) if that
names a route on the map; otherwise the vehicle isn't drawn.

What each feed is used for:

| Feed | Used for |
|---|---|
| VehiclePosition | Vehicles on the map, with heading and occupancy |
| TripUpdate | Predicted departures in stop and station panels, and how late a vehicle is |
| Alerts | Alert marks on the map, and alert text in panels |

The page listens only while Live is on and the tab is visible; a hidden tab
closes its socket and reconnects, getting the current state at once, when it's
looked at again. A dropped connection is reopened with a growing wait, up to
half a minute, spread so a relay restart isn't met by every page at once.
Predictions (TripUpdate) are not relayed yet; they will be asked for per stop
over the same socket while a stop or station panel is open. Vehicles glide
between updates unless the user prefers reduced motion. A vehicle whose own
report is more than two minutes old is not drawn, and when the newest feed the
relay has is that old, Live says positions aren't loading and shows the map
without them. A departure is called live only when it comes from a prediction.
Otherwise it's scheduled, and looks it.

### Addresses

Street-address search uses Photon (`photon.komoot.io`), an OpenStreetMap
geocoder that allows cross-site requests, limited to the Denver region. RTD's
own address layer covers only RTD facilities.

## Map design

Four rules shape the drawing, and each serves one of the numbered principles
at the top of this document (see "Principles"): trains in color, buses in ink
serves 3, so frequency and mode read at a glance; name what can be read as
named serves 4; every mark earns its place serves 5; and no name covers a
line serves 3, since the lines carry how often service comes and a name can
move where a line can't.

The V2 principle: **trains in color, buses in ink.** Rail is the only color
on the map, so a rail line can be found at a glance. Buses are drawn in a
single dark ink, and how often they come is shown by weight and darkness.
Everything else (streets, parks, water, labels) steps back.

The second principle is **name what can be read as named**. A label is on
the map only where a reader can tell at a glance which line or place it
belongs to (Imhof's second aim, "Where the labeling rules come from",
below):

- Rail carries its letter along the line, on the line itself, at least once
  a screen. Only below zoom 9.75, where there are no letters along the lines
  yet, the letter sits at each end instead: both at once said the same thing
  twice. The letter is the whole label: where a line goes is in the key, the
  Lines list and the line's panel, not on the map.
- Buses carry no number today, and must carry one from the zoom where a
  rider is choosing a bus (Chris, 2026-11-10). On a shared street a number
  beside the line can't be tied to one of the lines there, which is why the
  three schemes tried so far came off the map (see "Bus routes", "Numbers").
  Until a scheme ties each number to one line or one street (#7), a tap says
  which route it is: no number is better than one that can't be read as
  named. The lines' weight says how often a bus comes at every zoom.
- A station's name sits within about two ems of its mark, or isn't drawn at
  that zoom. The one exception is the hub where most lines end (Union
  Station), whose name may go further out until every station is named.

The earlier form of this principle, "name what you draw" (every line
identified at the zoom where it appears), put numbers on the bus lines from
2026-11-02 to 2026-11-06. They were read but not understood, which is a
label failing at its one job.

The third is **every mark earns its place**. A label is on the map at a
given zoom because someone looking at that much of the city needs it, not
because there's empty map to put it in. The test for each one: would a rider
miss it? If not, it waits for the zoom where they would. Applied
2026-11-06, after the phone's opening view named four stations on the empty
north end of the N line and almost none downtown, repeated each line's
letter three or four times, and set town names where they read as stations:

- **Station names go to the ends of the lines.** Until zoom 11 the only
  stations named are where a rail line ends (the build marks them, `end`;
  Union Station among them), the station with the most routes first: at
  the metro zooms the question is where the trains go. The first rule,
  naming the stations where six or more routes meet (bus routes counted),
  was dropped the same day it was applied: on Chris's phone it named
  Decatur-Federal, Alameda, I-25 / Broadway, Englewood and Olde Town Arvada
  and left Union Station and every line's end bare, which read as a random
  handful, because the count is of lines a reader can't see at that zoom.
  Union Station, where more lines end than get a sign (`hub`), is the one
  name these zooms must have and the one with the least room beside it,
  so until 11 its name alone may sit further out, in the first clear space
  around the knot of lines. Every station is named from 11, the busiest
  first. Every station can be tapped at any zoom.
- **A line's letter appears at least once a screen,** evenly spaced along
  the line (270 to 540 px apart on screen, 380 at the middle of each zoom), so
  a line is named wherever it is looked at and repeated only occasionally.
  Until 2026-11-06 a line alone was lettered every 200 px, which put three
  C's on one phone screen; from then to 2026-11-07 every 700 px, which was
  990 px at the far end of each zoom and left the W and T crossing a phone
  with no letter. The build places them (see "Rail bullets").
- **Places are named by cities until zoom 11.** Towns and villages start
  there, in the same small capitals as cities, so a place name is never
  taken for a station.
- **FlexRide zones start at zoom 11.** Further out their outlines are boxes
  around nothing and read as city limits.
- **Highway numbers:** until zoom 11, only the main Interstates (one or two
  digits). Spurs (I-270) and US routes start at 11.
- **A button shows only while it does something.** "Whole network" hides
  while the whole network is on screen.

The fourth is **no name covers a line**. The lines are what the map is of,
and a name can sit a little to one side where a line can't. Chris asked for
this 2026-11-06 ("Aurora could go a little further down ... to avoid sitting
on top of the 15"). How it works (`public/js/basemap.js`, "keep-out"
layers):

- Every rail and bus line that is drawn takes up its own room, and names
  are placed after it. Only what names a line sits on it: a rail letter or a
  bus number.
- Rail and the frequent buses are kept clear at every zoom. The lighter bus
  lines are kept clear from zoom 11.5: further out they are closer together
  than a word is long, so a name that had to clear them all would have
  nowhere to go.
- A name whose own point is taken moves to the nearest clear spot, up to
  3.4 em away (a city, town, neighborhood, landmark, airport or water name).
  If there is none, the name isn't drawn at that zoom: a line is worth more
  than a place's name. Today DENVER and AURORA are not drawn in the phone's
  "Whole network" view or a laptop's opening view for this reason.
- Street names sit beside their street, never on it, at every zoom. A name
  is only drawn on a stretch no bus line crosses, so most main streets get
  their name from about zoom 13.5.
- One exception: a station's name stays off rail and the frequent buses but
  can cross a lighter bus line. Downtown those are a block apart, and a
  station with no name is worse than a name across one of them.
- Highway shields give way to lines like any other name.

### Where the labeling rules come from

Chris, 2026-11-06, after the bus numbers came off: "there have to be best
practices that should inform what these rules should be." There are, and
the rules above are checked against them. What the literature settles, and
what it leaves to us:

- **Imhof's three aims** (1962, 1975), which every later placement rule is
  built on: names should be legible, easily associated with the features
  they describe, and should not overlap other map content, in that order of
  priority; and "names should not be evenly dispersed over the map, nor
  should names be densely clustered." The bus pills failed the second aim
  (a row of numbers beside a gray street belonged to nothing a reader could
  see); three C's on one screen failed the third and the density rule. So:
  a label that can't be unambiguously associated with its line is dropped,
  not nudged, and no name covers a line.
- **Point labels** (Imhof; Brewer, *Designing Better Maps*; Penn State's
  ranking of positions): up and to the right first, then the other corners,
  then the sides; "as close as possible to their symbols without touching
  them"; a point beside a line takes its label on the point's side. So:
  station names sit in the corners first, the name's nearest corner at most
  1.4 ems across and 1.4 down from the station (under two ems, about 25 px
  at zoom 14), and a name that would have to go further isn't drawn. The
  hub's name keeps the same distance, but is placed first, before every
  other name and before the frequent buses claim their room, because at the
  metro zooms the map must have it: it stays off rail and may cross a bus
  line. From zoom 15 there is room, and it stays off rail and the frequent
  buses like every other name, with one more ring (1.8 ems) to find its
  place in: the lines end at the hub's mark, so the ground past their end is
  on no line. (Until 2026-11-07 it could go six ems out and sat a quarter of a
  phone's width from the knot, in empty space.)
- **Line labels** (Imhof): follow the line; if repeated, the copies are
  evenly spaced; on long lines in dense networks a label "may be repeated
  occasionally," and "too much repetition can be overwhelming." So: a
  letter at least once a screen, evenly, on shared track at the same rate
  per line as alone.
- **Transit maps name their termini** ("Route termini should be clearly
  marked, especially if trains or buses refer to those endpoints on their
  signboards," Railway Technology on transit map design; Nöllenburg & Wolff
  2011 make non-overlapping station labels a hard constraint and prefer
  horizontal labels kept to one side of a line). So: at the metro zooms the
  stations named are the ends of the lines and the hub, and they win every
  collision; every station from zoom 11, which is also where Mapbox Streets
  begins its transit stop labels.
- **Frequency maps are read by tracing lines** (Walker; TriMet's 2015 map,
  whose base labels are a brown close to the background; Spokane's). Walker
  on his own Seattle map: "I try to keep the labels to a minimum, sufficient
  to connect the dots." So: labels exist to connect dots (which line, where
  it ends, where am I), not to annotate every stretch.
- **Bus numbers work only with an unambiguous line.** Halifax's redesign
  draws one black line per street with one box of numbers for it; the
  Glasgow taxonomy of bus maps notes that numbers beside lines make readers
  "read the number above each line to tell routes apart," which only works
  when each number has its own line; a 2021 study (MDPI, IJGI 11(6):338)
  found map-style bus layouts impose more cognitive load than linear ones.
  Our pills sat on streets shared by two to four routes of different tiers,
  the known-bad case. So: no numbers on the map until each can be tied to
  one line or one street; Halifax's one line and one box per street is the
  form the sources support.
- **Density by zoom** is an industry convention, not a measured rule: Mapbox
  tiers its data by zoom and shows transit stops from 11; the Google and
  Apple transit patents keep line colors at every zoom and hold station
  detail for high zooms. No source gives a tested spacing for repeated
  labels or a tested zoom for bus numbers, so those numbers (700 px, zoom
  11) are ours, and are judged on the fixed phone views below.

What the literature does not have: a controlled test of where route numbers
belong on a street-geography bus map, and a public TfL standard for bus
maps (its published standards cover line diagrams and stop graphics).

**How a label change is judged.** Before and after, the same four phone
views (390 × 844, dark where the night screenshots came from): the metro at
10.5 over downtown, the west side at 10.7, the south at 10.2, downtown at
14.3 (`node views.cjs` in the session scratchpad takes them headless). The
change gets a decision-log line that says what the views showed.

### Hierarchy (strongest to quietest)

1. Rail lines, in their official hues, always heavier than any bus, with a
   white casing
2. Bus streets, by how often a bus comes along them with every route
   counted: the busiest (every 10 minutes or better) in full ink, as wide
   as or wider than rail close in, but under it and in no hue
3. Stations and Park-n-Rides
4. In Live, vehicles and alert marks
5. Quieter bus streets, lighter and thinner by class, and part-time routes
   dashed or dotted
6. FlexRide zones, as a light hatch with a dashed edge
7. Lines not running at the time shown, as faint hairlines
8. Basemap: streets, water, parks, labels, the same inside RTD's district
   and out, to the edge of the pannable rectangle

### Basemap

Our own style on OpenFreeMap's vector tiles (`public/js/basemap.js`), not
Positron with tweaks. Its colors are quiet (pale cool-gray land, soft blue
water, white streets with light casings) so the network leads. Its words
carry the sense of place:

- **Street names** on main streets from zoom 12, darker than the rest, so you
  can find an intersection; smaller streets from 14.5. They sit beside the
  street rather than on it (1.3 em off, 1.45 em by zoom 17), so they don't
  cover the bus line down its middle, and are drawn only where no line
  crosses them (see "no name covers a line"). In practice most main streets
  are named from about zoom 13.5.
- **Interstate and US highway numbers** in quiet gray shields: the main
  Interstates from zoom 8.5, spurs and US routes from 11
  ("east of I-25" is how people say where they are). The shield shape keeps
  them from being read as bus route numbers. A shield never sits on a bus
  line that is drawn, at any zoom: a bus route that runs up a highway
  would wear that highway's number, and a bus line with a shield on it
  reads as the highway. So where buses run on a highway, its shield gives
  way to them (I-25 through central Denver has none from 10; US 6, I-76,
  I-270 and US 285 none at 11 over the metro, where they had three to
  five a phone screen). From 11.5 the lighter bus lines' own room does
  this, as for every name; below it, copies of that room are placed just
  before the shields and street names and hold back only those. Interstates have their own
  shield and fade out from 14.5 to 15. US highways have a notched US-route
  shield, so "40" on Colfax doesn't read as a bus tag, and fade out from 13
  to 13.5. State highway numbers are not drawn.
- **Neighborhood names** in plain sentence case, from zoom 12. A place whose
  name is a served station's label (the Union Station neighbourhood, the
  Central Park suburb) is left out: the map reads the served stations'
  own labels from `data/stations.geojson` when it loads and passes them to
  the basemap's place layer, so a place never reads as a second name for the
  station (from 2026-11-08; nothing is written down about any one place).
  **City names**,
  and town names from zoom 11, in
  small, letter-spaced capitals in the same quiet gray, the convention for a
  name that covers an area rather than marks a point, so "DENVER" reads as
  background and not as a place to tap. At every zoom a city name gives way
  to the lines, stations and station names, and is set beside its point (up
  to 3.4 em off) rather than on the lines that meet there; with nowhere
  clear that near, it isn't drawn (see "no name covers a line"). City names
  fade out from 12.5 to 13.5 and town names from 13.5 to 14.5 (the "Denver"
  label used to sit on Colfax and Broadway through 14.5).
- **Water names** skip intermittent water bodies (this removed an
  OpenStreetMap joke name on a gravel pit).
- **Landmarks people give directions by** from zoom 14: hospitals, campuses,
  stadiums, museums, theaters, libraries, city halls, and the larger parks
  (parks in green italics). Names only, no icons.
- **Relief** for the foothills, soft hillshade from free elevation tiles,
  because "the mountains are west" is how the region orients itself. It loads
  after the network so it never delays it.

It drops what competes with transit: basemap railways (they look like RTD's
lines), POI icons, and road colors.

### Rail line colors

Each line's hue comes from GTFS `route_color` on every build. Several
official colors are too light to see against a light map: a map line needs a
contrast of at least 3:1 against the land color, and today A (1.85), G (1.67),
R (1.45), C (2.07) and W (2.94) fall short. White letters on the A, G and C
bullets fail too (2.06, 1.86 and 2.30).

So each line keeps its official color as its fill, and gets a thin outline in
a darker shade of the same hue (OKLab lightness × 0.72, and never under 3:1
against the land). The outline gives the contrast; the fill keeps the brand.
Darkening the fills themselves was tried first and failed: G and C both turned
the same brown and R went olive. Each bullet's letter is white or ink,
whichever has more contrast. A new line with a light color is handled the
same way, in the browser (`public/js/color.js`). Current official values, for
reference:

| Line | Official | Line | Official |
|---|---|---|---|
| A | `#57C1E9` | N | `#9F26B5` |
| B | `#4E9D2D` | R | `#C4D600` |
| C | `#F79239` | T | `#B71318` |
| D | `#008348` | W | `#009DAA` |
| E | `#552683` | G | `#F6B221` |

Some lines are close in color (B and D, E and N). Rail is never identified by
color alone: every line carries its letter in a round bullet, along the line
from zoom 9.75 and at each end below it (see "Symbols").

### Rail frequency

Rail stays heavier than any bus at every tier. 15-minute rail is full width;
30- and 60-minute rail is a step thinner; rail with only a few trips or
rush-hour trips is dashed and drawn *beneath* full-service rail, so on shared
track the line that actually runs wins. The exact weights are settled on
screen in V2 step 3.

### Stations

| State | How it's drawn |
|---|---|
| Served | no mark below zoom 9 (stations a few pixels apart read as noise); from 9 to 10.25 a small tick across the track, or a dot (see "From far out"); from 11 a white capsule with an ink edge laid across the track, as wide as the lines it serves and turned to the track's direction (a circle where one line stops), crossfading with the tick from 10.25 to 11. The hub has a ring from 9.75 |
| Returning | hollow gray ring and gray label, both from zoom 13. Panel: "Trains return Nov 23" |
| No current service | hollow gray ring and gray label, both from zoom 13. Panel: "No train service right now" |

The state comes from GTFS on every build (see "Station service"), so stations
that lose or regain trains change on their own. The key shows the gray
station only when at least one station is unserved.

**From far out (zoom 9 to 11).** One mark per cluster of stations, square
to the lines it spans, and one mark that says "this is where the lines
meet". The build decides each station's mark from the drawn track
(`scripts/lib/stationmarks.mjs`, with `test/stationmarks.test.mjs`), so a new
station, line or split needs no change:

- *The tick spans its lines only where they run together.* A tick is turned
  across the lines it serves only if, for the tick's own length either way
  along the track, the lines stay the same distance apart as drawn (within
  a pixel), checked at zooms 9, 10 and 11. Where they part within that
  length (a split, a line easing out of a pack) the station is a dot
  instead. The tick is turned to the track's direction over that whole
  stretch, not at the one point the station stands on, so on a bend it isn't
  crooked. On RTD's network today this makes Pecos Junction (B and G part
  there), Auraria West, Empower Field, I-25 / Broadway, Alameda,
  Belleview and RidgeGate Parkway dots; 41st / Fox, where B and G still
  run together, a tick square to both.
- *Stations too close to tell apart collapse to the strongest.* A station
  waits (`tickFrom`, in quarter zooms) until it is the longer mark's length
  plus 4 px from every stronger station along the track. Stronger is more
  lines, then the hub, then more routes. A station waits only for one that
  every one of its lines also stops at, and the end of a line never waits,
  so no line loses its mark where it stops alone or where it ends. Every
  station has its mark again from 11, with the capsules.
- *The hub has a ring.* The place where the most lines meet (`meet`; Union
  Station) is found from the data, not named. From 9.75, where its name and
  the lines' letters arrive, it is drawn as a ring as wide as a tick across
  its lines plus 12 px of the widest zoom (about 17 px at 10), not turned,
  since lines leave it every way. Nothing else is a ring that size. It
  crossfades into its capsule from 10.25 to 11, as ticks do.
- *Edges are drawn for the size they're seen at.* Station marks are drawn at
  the widest zoom's spacing and scaled with the lines, to under half size at
  9. A tick's edge is 1.1 px before scaling (about half a pixel at 9 to 11),
  a capsule's 1.5 (0.8 px at 11, 1.5 at 16), the ring's 2.6. At 1.6 px on a
  6 to 8 px tick, the edge was most of the mark, and a dark-mode tick (dark
  fill, light edge) read as a light pill. Ticks across lines are 10 px
  before scaling (5 at zoom 10), a dot 8.

**Platform groups.** A station whose lines stop in places too far apart for
one mark gets a mark at each group, joined to the station's own mark by a row
of dots, the walk between them. Union Station is the one place this happens: its light rail ends on the
west side and its four commuter lines end 273 m east, where RTD's single point
for the station cannot stand for them. The build finds the groups from the
GTFS child stops it already collects under each station (`parent_station`) and
knows nothing about a station, a platform or a line
(`scripts/lib/platforms.mjs`, with `test/platforms.test.mjs`):

- *One group or two.* Child stops up to 100 m apart are one place whatever
  lines call there, since two sides of one platform are one platform. Up to
  250 m apart they are one place when a line calls at both, since RTD puts a
  line's two directions' platforms up to 200 m apart along the street. Beyond
  that, or at that distance with no line in common, they are two. A stop
  between two others makes one group of all three, so a long platform is not
  split in two.
- *One group or two, by track.* Lines of one place whose drawn tracks are
  more than 20 m apart where they stop are two groups (`splitByTrack`): one
  mark can't stand across both tracks, and the line left out ran past the
  station with no mark on it. Peoria is the case: R ends at its own platform
  and A passes 30 m north. Lines that share track are drawn on one path and
  are never split.
- *Where a group's mark goes.* In this order. (1) In line with the hall:
  where a bus terminal's hall lies between a station's groups, the marks
  stand where the hall's long axis crosses each group's track beside its
  stops (`walkAxis`; the axis is carried 80 m past each end of the hall, and
  a hall counts when it is at least twice as long as it is wide), so the two
  marks, the walk between them and the hall are one straight line. Union
  Station's two marks are at the two ends of its bus concourse, and the walk
  runs down the middle of it. The marks used to stand at the lines' ends,
  one at the north end of the light-rail platform and one at the south end
  of the train hall, and the walk between them ran at an angle across the
  hall: "you would never draw it that way if you were just drawing this by
  hand". A mark on the walk lies along it, not exactly across its own lines,
  when the two are within 25 degrees (`alongWalk`), so the marks at the two
  ends of the walk are parallel and in one line with it; the light rail
  comes in 14 degrees off square to the concourse, and its mark was tilted
  that much against the other. (2) At the lines' end, where every line of the group ends there, so
  each runs the length of its platform and ends at the mark. (3) Abreast of
  the station's own mark, where the platform reaches that far (within 40 m of
  one of the group's stops), so two marks of one station stand side by side
  (Peoria). (4) Otherwise on the track beside the group's stops, and only
  when the stops are nowhere near the drawn track at the lines' ends, so it
  never stands in the air. A line that ends at the group ends at its mark
  (`endAtMarks`), never past it. It is a station mark like any other, the
  same image at the same size, turned across its lines, as wide as the lines
  that stop there, so a group reads as a station, not a new kind of thing.
- *When it comes.* A group whose lines run on through waits until its mark
  clears the station's own (`clearFrom`), so a group a few metres from the
  station never doubles it, and a group that never clears gets no mark. A
  group its lines end at does not wait: the lines end at its mark, and with
  the mark held back they ended at nothing (the light rail at Union Station
  at zoom 13). It is marked from zoom 11, where stations become capsules, and
  overlaps the station's own mark until it is clear of it; further out the
  hub's ring stands for both. `tickFrom` is a whole zoom, and the map shows
  the mark by a filter on it: a paint property that reads both the zoom and
  the feature is worked out at whole zooms and blended between, so a mark
  due at 13 was nothing at 13 and a ghost until 14. The mark and the walk
  take their room before any station's name, the hub's included, which sat
  on the second mark. The station's own mark stands for the group its point
  is on, if it is on one.
- *One station.* A row of dots from the station's mark to each group's, in
  the station's edge ink (dots 1.4 px across at zoom 10, 2 at 13 and 2.6 at
  16, a little over two dots apart), says the marks are one place and the way
  between them is on foot. It was a hairline at 55%, which read as a scratch
  across the blocks. No name sits on the dots (`keep-out-walk`). The name is
  still drawn once, on the station's own mark.

Union Station and Peoria have more than one group in RTD's feed today. The build
reports every station it marks at more than one group, so a change in RTD's
data shows in the build's output instead of going unnoticed.

**The station's real shape.** A station is a place with a building, platforms
and a roof, and at the zooms where it is bigger than a mark the map draws
those, from OpenStreetMap, at build time (`scripts/lib/structures.mjs`, with
`test/structures.test.mjs`). Nothing about a station is written down: the
build asks OSM for the box around the station's own platform stops and picks
the shapes by tag and by where those stops are, so a station RTD adds, moves
or loses draws itself.

- *A platform* is a `railway=platform` area holding or touching one of the
  station's platform stops. A platform tagged `public_transport=no` is not
  one (Track 3 at Union Station, out of service).
- *A canopy* is a `building=roof`, `man_made=canopy` or `amenity=shelter`
  area over a platform, and *the station building* is a
  `building=train_station` area touching one. A block that happens to be
  called "... Union Station", such as an apartment tower or an office, carries
  none of these tags and is never drawn: the match is on tags and stops, never
  names.
- *Lines run the platform's length.* Where a line ends at a station whose
  platforms OSM draws, it runs along the platform it stops at to the
  platform's real end, instead of stopping at RTD's single point
  (`extendLineToPlatforms`). At Union Station that fills the train hall with
  A, B, G and N and the light-rail platforms with C, E and W. A station with
  no platform in OSM is left exactly where RTD's data puts it.
  The line runs on parallel to its platform, from where it meets it, to
  abreast of the platform's far end (`platformEndFor`). Bent toward the
  platform's middle line it kinked just before its mark; carried straight on
  along its own bearing it drifted across the platform, where RTD's line
  comes in a few degrees off it (the airport, 4 degrees over 120 m: "not
  parallel with the platform which is obviously wrong"). A line that only
  crosses a platform (more than 30 degrees off it) is not turned along it.
- *Under the roof.* A roof at least 10 m wide and 600 m2 is a hall, not the
  awning along a platform: it is drawn like the station building (kind
  `hall`), whole, and where one stands over the end of the platform (its
  middle abreast of a point 5 to 60 m short of the lines' end) the station's
  mark is on the track abreast of the roof's middle and the lines end there.
  The airport's A line ends under its canopy, 15 m short of the buffers; run
  to the platform's very end it came out past the canopy's tip. The pale
  wash a canopy gets made a hall's roof paler than the building the basemap
  draws there, so it looked as if the roof had been taken away.
- *The mark is at the end of the line.* A train runs the whole platform it
  stops at and stops at its head end, so the platform's far end is the one
  away from the side the line came in on. A station a line ends at is marked
  there, at the line's end, one line or several, whether or not other lines
  run on through it: Westminster's mark is at the far end of its platform,
  and Lincoln's, where T ends and E and R run on, at the south end of its
  platform. Lines that end at a station from the same side end together, in
  one row (ends within 60 m of each other, `ROW_METERS` in the build), and
  the mark is drawn across the row. A mark left back at the stops had the
  line cut there, short of the platform drawn beside it, and the rest of the
  platform showed past the mark like the ghost of the line.
- *A line ends at its station's mark.* Where the mark stands short of the
  line's end all the same (a platform group's mark in line with a hall, see
  "Platform groups"), the line is cut where the mark crosses it (`endAtMarks`
  in `sharedtrack.mjs`), so no line runs on past the station it ends at. A
  piece wholly past the mark goes; an end with no mark of its line within
  150 m, or a mark more than 25 m off its track, is left as it is.
- *Nothing stands past the mark.* Where every line at a mark ends there, the
  station's platforms and the roofs over them are drawn only as far as the
  mark (`platformsToMarks`; 2 m past it, so they tuck under it), and one
  wholly past it is not drawn; the station building is left whole. A rail
  letter past the mark, on the side the line doesn't come from, is not drawn,
  nor one within 24 px of the mark at the zoom the letter comes in, which
  crowded it.
- *The station's point moves to its building.* A station whose OSM has a
  station building takes the platform group nearest that building as its own
  point (`geo.stations`), so its mark, its ring and its one name stand at the
  station's building and hall, not at whichever platform RTD's point fell on.
  Union Station's name is on the train hall and the historic building; the
  light-rail platforms carry a group mark joined to it by the transfer line.
- *Drawn quiet.* The building is a faint neutral fill with no outline, the
  same as a bus hall, so it never reads as a line round its block; the
  platforms are a step off the land; the canopy is the palest wash on the map,
  over them. Platforms and canopies arrive at zoom 14.2, where they are more
  than a smudge; the building from 13, with the halls. The roofs the build
  finds over the bus halls are in the same layer (`structures`), drawn the
  same way, and the Key has a row for platforms and their roof.

### Shared track

Where lines share track (today, for example, C, E and T in the south, and
A, B, G and N leaving Union Station), they are drawn as parallel lines, never
on top of each other. When trains return downtown, the loops run on one-way
couplets (California and Stout, Welton), so each direction is its own track:
the algorithm must treat a line's two directions on separate streets as one
line, not as two lines sharing a corridor.

**Reading right comes before matching the survey** (the Objective's "it
looks designed", applied to rail). RTD's geometry is exact: each line on its
own track, stopping at its own platform, drawn with a corner every hundred
meters or so. Drawn exactly, that looks wrong, and a rider reads the look.
So the build may nudge a line a little (tens of meters, never to another
street or past a station) where that makes the picture say what is true:
lines on the same track are one pack, lines that end at one station end
together, and track curves. By a rule in the build wherever the place is one
case of a pattern; a fix for one named place goes in the fixes file "Rule 1"
describes, never into the data. (Chris, 2026-11-06: "It's more important
that it visually
makes sense. And if that means nudging things a little bit so that they line
up properly, that's actually better (within reason).")

The build works this out from the geometry every time
(`scripts/lib/sharedtrack.mjs`):

1. Clean each line's path: drop spikes, a stretch that runs out and back
   over itself, and a sideways hop of a few meters between two tracks (RTD's
   T line had both at I-25 / Broadway, drawn as a blob). Then level the ends:
   lines whose ends are within 150 m of each other and run the same way
   (within 20 degrees) end at one station, at platforms staggered by a
   train's length. Each is carried on to where the furthest of them stops,
   square across the track, so the ends line up. No line is cut short. At
   Union Station the N was drawn about 75 m short of the A, and B and G
   about 7 m short. Lines that end facing each other (light rail and
   commuter rail at Union Station) are left alone.
2. Find where two or more lines run within 20 m of each other, point by point
   along each line. Sharing carries across: if C is within 20 m of E and E
   of T, all three share the track there, even where C and T are 25 m apart.
   Runs shorter than 200 m are smoothed away.
3. Group the shared runs into *places*: runs of the same set of lines that
   touch. The same lines can share track in more than one place.
4. Decide, for each pair of lines, which is on the left. Each place says
   which side each line leaves toward, measured over 1.2 km past each end.
   A pair is ordered once for all the places it runs through in a row, on
   what those places say together, so two lines never swap sides between one
   place and the next and never cross where a third joins or leaves (E and R
   stay side by side south of Lincoln, where the T ends).
5. Point every shared piece the same way, and save each line's slot in its
   place. The map turns the slot into an on-screen offset that stays the
   same width at every zoom.
6. Draw each place as one pack. Tracks side by side are anything from 0 to
   20 m apart (at Union Station B and G are on one, N and A on another 20 m
   away), so lines drawn on their own tracks, each a slot to the side, sat
   unevenly: two tight, a gap, two tight. Every line of a place is moved
   onto the middle of the place's tracks, where the slots space them evenly.
   A line that has started to leave counts for less and less toward the
   middle (from 20 m away to 40 m), so it doesn't pull the others after it.
   Where a line joins or leaves a pack, the piece with fewer lines swings
   between its own track and the pack's middle over 300 m, so the lines
   leave together and then part, with no sideways jump.
7. Round every line. Each point goes to the average of the path for 60 m
   either side, nearer path counting for more, so a corner in RTD's path, or
   one made by a line swinging into a pack, is drawn as a curve. A sharp
   corner is cut by a few meters. The ends of a line don't move.
8. Ease each line between slots. Where a line leaves others, it starts in
   the slot it had beside them and moves to its new one in steps of a
   thirty-second of a line's width (a sixteenth until 2026-11-11: at a phone's
   pixel density each step showed as a notch in the line's edge), over up to
   1.5 km, finishing before the next
   station, and over all of that room: the move used to finish as soon as
   the other lines were 250 m away, which at a junction where they turn
   sharply aside is within 300 m, and a slot sideways in 300 m is a kink at
   zoom 11 (10 px along, 6 across) that read as the line breaking (C south
   of I-25 / Broadway, where E and T turn east). Only the piece with fewer
   lines moves; lines still together stay put. So a line never steps sideways at a junction, and isn't drawn over
   another while their tracks are still close. The one exception is where
   the line that leaves does so by ending: a station's mark lies across the
   pack at that very place, so the lines that run on take their own places
   abreast of the end (`atLineEnds`), under the mark, and are straight on
   both sides of it. Eased over the next few hundred metres they bent away
   from the mark for no reason a reader could see (E and R south of Lincoln,
   C and E north of Alameda, where T ends: "they don't look straight",
   "jerky rather than clean and hand drawn"). The join check
   (`routeJoins`) allows a step abreast of another line's end.

9. Put the lines of a pack on one path (`aligned`). Steps 6 and 7 leave them
   up to a metre apart, most where one of them ends, and a metre is a pixel
   at zoom 16: one gap in a pack came out wider than the next (T beside E and
   R at Lincoln). Each line is moved onto the path of the lines before it, in
   the order of their names, where it shares their track: all the way within
   1 m, less and less out to 2.5 m. The lines are written to six decimals
   (0.1 m) and keep every point more than 0.1 m off the straight line past
   it; at five decimals and 0.5 m each line was rounded and thinned its own
   way. On RTD's network 2026-11-11 the mean distance between two lines'
   paths where they share track went from 0.36 m to 0.06 m, for 64 KB more
   rail data.

Checked on RTD's network 2026-11-06: no two joined pieces of a line differ by
more than a sixteenth of a width, and no two lines within 20 m of each other
are drawn less than 0.88 of a width apart. In the pack leaving Union Station
the four lines are within 0.8 m of one path all the way (they were up to
20 m apart). `test/sharedtrack.test.mjs` holds these rules on a made-up
network.

Where a line ends, it ends on a mark: at Union Station the four commuter
lines end 273 m from RTD's one point for the station, so the build marks their
platform group and joins it to the station's own mark (see "Platform groups"
under "Stations"). Nothing in the shared-track work treats the place
differently.

A new line, a rerouted line, or a new shared corridor is handled with no
changes. Never fix a corridor by hand-editing data or hiding a line, and
which lines share which track is a fact, never listed: improve the algorithm
first. (This is a studied problem; see LOOM by Bast, Brosi and Storandt.)
Where one place still draws badly, a visual fix for it may go in the fixes
file "Rule 1" describes, tied to RTD's data so it drops out when RTD changes
the place (not built yet, #64).

### Bus routes

**Each street a bus runs on is one line, and its width says how often a bus
comes along it, every route on it counted together.** Chris, 2026-11-08: "the
trunks are not gonna work... show the frequency of the section of road and
just have it scale up, so it's a single line but very thick". A downtown
street with twelve routes is one very thick line; a street with one hourly
route is a hairline; a route's own weight no longer exists on the map. The
build (`scripts/lib/streets.mjs`, from the per-stretch departures
`stretches.mjs` measures) does this:

- **One street graph from RTD's own lines** (#80). RTD draws its bus routes
  on one street network: routes that share a street share its line (on
  2026-11-10, where another route ran within 50 m of a route it was within
  1 m for 86% of the length; most of the rest is the two carriageways of a
  divided road, 12 to 24 m apart, each carrying every route on that road).
  So the build doesn't guess which routes run together: it joins RTD's
  lines where they meet. Vertices within 1.5 m are one node, a node lying
  on another line's segment splits it, and each edge between two nodes
  carries the route stretches drawn along it (`streetGraph`). A street is a
  run of edges with one set of stretches (route, tier and headway), through
  every node where that set goes straight on, so a crossing street doesn't
  cut it, and cut where a route joins or leaves (`runsOf`). Each street is
  drawn once, so nothing overlaps and nothing darkens: on RTD's line, or,
  for a divided road out to zoom 16, down the middle of its two
  carriageways (see "Readable geometry, on the street graph").
- A street's buses per hour are the rider's rate, not a sum: the weekday
  9am–3pm departures of every all-day route on it, merged each way along
  the street, the busier way counting (a one-way street has one). The gaps
  between the merged departures are the waits a rider can get, and the
  street is as fast as the gap that nine in ten gaps are at or under — the
  90th percentile, an hour over it (`rate`). So the wait the map promises
  is a wait it keeps: evenly spaced buses give their plain headway, two
  every-30 routes that leave a minute apart stay "every 30" (nine waits in
  ten are the long gap), two that interleave are "every 15", and a bunch of
  four buses is one bunch, not four times the speed. Summing routes, and
  the interleaving rule of the corridor prototype (`feat/v2-finish`,
  `corridors.mjs`: routes add up only where the longest wait is at most 1.5
  times the combined median gap), were rejected because both credit a
  street with buses a rider cannot catch. The cost is honest: the top class
  is now rare, because a downtown street with 25 buses an hour over nine
  routes whose timetables leave holes of more than three minutes reads
  "every 4 to 5", which is what a rider there waits nine times in ten. A run has one set of routes, so its rate is read once, from each
  all-day route's measured cell nearest the run's middle on its own line
  (`stretches.mjs`), and a width can't flicker along a street.
- Part-time routes (rush hours, a few trips) are listed on the street but
  add nothing to its rate, and keep their own dashed and dotted lines.
- Six classes, each a width and a key row (`public/js/frequency.js`,
  `STREET_CLASSES`); discrete rather than continuous because the key must
  be able to name every width, and six steps of about 1.4 times are the
  most a reader can tell apart. Width grows about with the square root of
  frequency at the overview and faster close in, so the busiest downtown
  streets are unmistakable at 14 and up without swallowing the overview. A
  class that holds for under 200 m with the same routes, or one step from
  its neighbour where routes join one after another, takes its neighbour's
  class (`CLASS_MIN`), so a width doesn't flicker along a block.
- Each shared run carries its routes (`routes`, `n`, `bph`, `hw`, `cls`),
  so a tap on a street names every route along it and the highlight follows
  the open route through every street it uses.
- Streets meet at the graph's nodes: a branch starts on the trunk's own
  line where its route leaves it, at the same point the trunk's run ends,
  and street lines have round ends, so a turn shows no notch at its corner.
  A loose end whose own route has another line within 30 m ahead of it
  (within 60 degrees of the way it came in), or within 15 m in any
  direction (where the bus turns round), stops short of where its buses
  go: a gap in RTD's lines, or a terminal loop drawn open. A short edge
  joins it to that line (`closeGaps`). A street is simplified between
  junctions only, so a node where another line meets it (a branch, a
  part-time route's dashed line) stays exactly where it is and that line
  still meets the street. The build reports the loose ends
  left, and those within 30 m of their own route's line (`streetGraph` in
  meta.json): 4 and 2 before loops were tidied, and about 35 and 25 since
  (2026-11-11), most of them short ends at the Park-n-Ride or station they
  serve.
- **Strands.** From zoom 13.5, a hairline a shade off the ink runs along
  the inside of a shared street between each pair of routes, like the
  strands of a cable, so a reader can see that several routes run there
  without the street breaking into separate lines (Chris: "you can draw a
  very thin dividing line inside the line or something... you can indicate
  the fact that there are multiple lines without having to have like
  visibly separate lines"). No land shows between strands. A seam is drawn
  only where each strand would be at least 2.6 px wide at that zoom, so a
  four-route every-10 street gets its seams at 17, a two-route one at 14.
  Every route on the street has a strand, part-time ones too (`pt`, after
  the all-day ones), and a seam that bounds a part-time strand is dashed.
  Until the strands have room, a part-time route rides beside the street
  from 14, a dashed hairline a shade off the ink with 2.2 px of land between
  it and the street's edge (so it reads as a second line beside the first,
  not as the first line's edge), on a street at least 25 m long (on the few
  metres where a route turns round or two junctions nearly meet, a dash
  that short is a speck); the gap is measured from the street's edge
  at that zoom and grows with the strand, so the two never touch. Chris, on
  round three: "the dashed part-time strand rides the edge of the solid line
  instead of sitting beside it."
  Streets with more than six routes don't get strands (Chris: "something
  special on the places where there's just like too many lines to have a
  divider"): a core line a third of the width, in the strand color, runs
  down the middle instead, which says "many" without counting.

*One-way arrows*: the build marks a street `oneway` where departures one
way are no more than 15% of the other's, read once for the whole run, and
draws it the way its buses go (`streets.mjs`). A divided road drawn as
one line reads both carriageways' buses, so it is two way. Drawn as its
two carriageways (from zoom 16, or where the merge leaves a pair alone),
each reads one way but the road is two way: a one-way run with a twin (a
one-way run of one of its routes the other way, parallel and within 60 m,
the widest median the build treats as one road) carries no arrows. The page draws chevrons from
zoom 14 (`street-oneway` in `network.js`), about 300 px apart: one glyph at
one size on every street, a light chevron in the arrow tint cased in the
darkest street ink, so it reads inside a wide line and over a hairline
alike and two arrows never differ (round two's chevron-in-the-line and
arrowhead-on-a-hairline came in pairs of two sizes on 15th). None on a
one-way piece under 250 m, where it would sit at a junction. Two-way
streets have no arrows. The Key has a row for them.

*Readable geometry, on the street graph* (`streets.mjs`; #81, #82). RTD
draws each bus as driven: both carriageways of a divided road, round a
cloverleaf's circle, a lap round a block to turn back. Drawn as they are,
several routes doing that at one place are a knot (Chris, round two: "I
can't tell which bus goes which direction, where it's making turns"). The
graph is tidied once for every route on a street, so the streets still
meet (tidying each route's line alone, as round two did, left shared
streets that no longer met):

- *Divided roads* (`carriagewayCentres`): two lines 4 to 60 m apart,
  parallel within 20 degrees and square across, sharing three-quarters of
  their all-day routes (or the routes of one all on the other and each
  measured running both ways on both lines: routes that run up one
  carriageway only, as the 10, 16 and 20 do on Federal by Colfax, don't make
  it two roads), along 60% of an edge and 100 m in all, not
  measured running the same way (those are lanes), are one road. Each node
  moves halfway to the other carriageway and the lines are joined again,
  up to three times (a highway drawn as two carriageways and an express
  lane). The road is one two-way line out to zoom 16, smoothed to 8 m, and
  its two carriageways from 16 in, where one line would sit in the median
  off both (Chris, 2026-11-11). The build tags each street that differs
  between the two graphs `zoom: 'far'` or `'near'`; a street the same in
  both is drawn once at every zoom.
- *Ramps* (`simplifyLoops`): a stretch of one set of routes between two
  junctions, 2.5 times longer than the straight line between them, its
  ends within 100 m and no wider than 220 m, is the turn from one road to
  the other and is drawn straight. Where riders board on it (a bus stop
  within 30 m of it and more than 60 m from its ends) it stays as drawn:
  the bus leaves the street to stop there.
- *Loops*: a stretch that leaves a junction and comes back to it, no
  farther from it than 220 m, is a turn there. If riders board on it (a
  stop on it, or a station or Park-n-Ride within 60 m of it), it is the
  terminal loop of the station or Park-n-Ride within 250 m and becomes a
  short end, the shorter way round to its point nearest that place, so the
  line ends at the place; with no place near, at its stop farthest out. A
  short end that doubles back on the street it came along within 40 m (a
  barb) stops at the tip. A loop no rider boards on goes, and a stem under
  120 m with it. Not a stretch under 60 m (a street corner), nor a loop
  that is all of its line (a circulator).
- Every count of the streets at a junction follows the graph as it is
  tidied (edges are emptied and added as ramps are drawn straight): counted
  from the graph as it first was, a ramp drawn straight was missed where it
  ended, and the street beyond it taken for a loop's stem and dropped.
- Gaps are closed before loops are tidied (a terminal loop RTD draws open
  is one), and again after, onto a line ahead only (a ramp whose circle
  went stops short of the road it led onto).
- A street with only part-time routes is drawn from the graph too, as their
  dashed or dotted line (`n: 0`, `tier`), so it meets the streets it joins
  and moves with a divided road.

*Terminals* (`footprints.mjs`; `scripts/build-data.mjs`, `shortenAtHall`;
#82): each of RTD's bus-station facilities (class `BUS` or `STN` in RTD's
facilities layer) is drawn as the hall its bus gates stand in, from
OpenStreetMap at build time (`terminalShapeOf`): its `amenity=bus_station`
hall, above or below ground; else the `public_transport=platform` +
`bus=yes` platforms at its gates; else the station building holding them;
else the building holding the most of its stops. A parking structure is
never the terminal, and at a rail station only a bus hall or bus platforms
are (the rail station is already the place). A hall above ground is a faint
fill with no edge (`bus-terminal`), one below ground a quieter fill a shade
under the land (`bus-terminal-under`; the paler wash it first had could
not be seen on the light map), from z13. A bus that boards in
a hall is drawn only as far as its edge: where its line comes to the hall,
goes away round the block and back (to and from the ramp), the stretch
between is the approach, not the route, and goes; and no line is drawn
through a hall. The halls are drawn beneath the bus lines, so a line ends
on its hall with its round end whole. A stop inside a hall is one of its
gates, shown from z17 (`stops-gate`); a stop within 80 m of a hall that no
drawn line comes within 30 m of (it stood on the approach) is shown with
the hall, not left as a dot beside nothing. Last build's halls stand in
for a station OSM doesn't answer for, with their stops marked as they
were: this folder's `terminals.geojson`, or on a fresh checkout (the daily
build) the published site's. The build says so in capitals and records it
(`halls` in meta.json: `drawn`, `fellBack`, `lost`), so OpenStreetMap not
answering never passes for a change in the place. A tap on a gate or a
stop over a hall opens that stop; elsewhere on the hall, its station. On 2026-11-11: Union Station Transit Center and Civic Center
(below ground) and Downtown Boulder.

As drawn on the land (`#F4F5F6`), widths at zoom 9, 11, 13 and 16; dark
mode uses the periwinkles under "Dark mode":

| Key row | Buses an hour | Color | Width | From zoom |
|---|---|---|---|---|
| Every 3 min or better | 20 or more | `#1D3044` | 2.8 / 4.4 / 7 / 14 | 0 |
| Every 4 to 5 min | 12 to 20 | `#1D3044` | 2.1 / 3.3 / 5 / 10 | 0 |
| Every 6 to 10 min | 6 to 12 | `#1D3044` | 1.6 / 2.5 / 3.6 / 7.2 | 0 |
| Every 11 to 15 min | 4 to 6 | `#2A3D52` | 1.2 / 1.8 / 2.6 / 5.2 | 0 |
| Every 16 to 30 min | 2 to 4 | `#3F5266` | 0.8 / 1.2 / 1.7 / 3.4 | 9 |
| Every 31 min or more | under 2 | `#78848F` | 0.45 / 0.6 / 1 / 2 | 10.5 |
| Rush hours only (a route) | | `#78848F` | 0.5 / 0.7 / 1.1 / 2.1 | dashed, 11 |
| A few trips (a route) | | `#78848F` | 0.6 / 0.9 / 1.4 / 2.5 | dotted, 11 |

Hierarchy against rail: a street with a bus every three minutes moves more
buses than a line with a train every fifteen, and close in it is drawn
wider than the rail line (14 px against 9 at zoom 16; 7 against 5.6 at 13).
Rail still leads, by what width can't give: its saturated hue against the
buses' one navy, its white casing, and its place above every bus layer. At
the overview the busiest streets and rail are about the same width (2.8–4.4
against 3–4), and the squint test holds: color first, then the heavy navy
grid, then everything else. Only about 16 km of street (classes 3 and 5,
downtown and the station approaches) is wider than rail at all.

The route tiers in the table above (frequent, every 30, hourly...) remain
what a route *is*, for its panel, its tag, its part-time line and the Lines
list; the map's bus lines are streets.

**Numbers.** The map must show which route is which without a tap, at the
appropriate zoom (Chris, 2026-11-10; see "What the bus lines say" under
"Objective"). It doesn't yet: the map carries no bus route numbers today.
The lines' weight says how often a bus comes; a tap on a line says which
route it is and where it goes, and from zoom 16 each stop names the routes
that serve it. Numbers on the lines were tried three ways over a
week and pulled on 2026-11-06, when Chris's phone screenshots of downtown
showed that even the best of them could be read but not understood: a
reader could see "0 0L 83 +" and not know what it was telling them.

- *One number per frequent route, where it ran alone* (from the opening
  zoom): which routes got a number was whatever the packing left room for,
  so at the metro scale the 0L and 15L were named and the 15 and most trunks
  were not, and "FreeRide", a mile of shuttle, was named at a 30-mile view.
- *Rows of numbers knocked out of the line* ("0 • 15 • 15L +13", 11.5 to
  13): the dots read as stops, the box's outline was the color of the
  streets on the dark map, nobody can act on a count, and because every
  downtown block gains or loses a route the same three numbers sat in three
  boxes within four blocks.
- *Rows of pills, one per route, filled by tier* (from 13): the way bus maps
  number their lines, and still wrong here. Short rows are short because
  they run between intersections, so their one label sat on the
  intersection, covering the crossing line; one-way pairs (Broadway and
  Lincoln, Kalamath and Santa Fe) were labelled as two streets a block
  apart; and on the dark map a frequent pill and an every-30 pill were both
  near white, so the fill said nothing.

The rule from here: numbers come back, at the zoom where a rider is choosing
a bus, with a scheme in which a reader can tie every number to one line or
one street, placed clear of every line, and shown to pass on the rubric's
fixed views. Which scheme and which zoom are not decided; #7 researches how
other maps place route numbers and proposes schemes for Chris to choose
from. Until one passes, the map carries no number, not an ambiguous one.
Where routes share a street the build still reads the street as one
(`scripts/lib/busnames.mjs`: routes within 35 m and 25 degrees of each other
are one run, named strongest tier first, a route's per-tier stretches joined
end to end, neighbouring stretches with the same names merged), so a shared
street can be named once when a reason to name it is shown; the file it
writes is not loaded by the page. The drawn streets come from
`streets.mjs`, which uses the same alongside rule.

**Streets by combined frequency are built** (above); the earlier plan to
count only stops both routes serve was dropped in favour of the rider's
rate, which asks only whether the buses interleave.

### By zoom level

Each bus tier fades in over about a zoom level rather than popping on.

| Zoom | Shows | Also in Live |
|---|---|---|
| Below 9 (the overview: a phone's "Whole network") | Relief. Rail, with each line's letter at both ends and nothing else on it. Bus streets with a bus every 15 minutes or better, with no numbers. City names where they clear the lines. Main Interstate shields. No station marks, no FlexRide zones. | Alert marks on rail |
| 9–11.5 (phones open at about 10, laptops at about 9.4) | Station ticks from 9. The letter at each rail line's end stays until 9.75. Every-16-to-30 streets from 9, fading in. From 9.75: rail letters along the lines, in place of the ones at the ends, and the names of the stations where lines end. Streets with a bus every 31 minutes or more from 10.5. Stations are small ticks (or dots, where lines part) to 10.25, one per cluster; capsules from 11. The hub's ring from 9.75 to 11. From 11: every station's name, town names, FlexRide zones, Interstate spur and US highway shields, and part-time buses. | Train positions from 9.75, closed stations |
| 11.5–13 | Names keep off every bus line, not only the frequent ones. Main street names from 12, beside the street, where no line crosses them. Park-n-Rides and transit centers from 12.5. No bus numbers (see "Numbers"). | |
| 13–14.5 | Most main streets named from about 13.5. Closed stations, ring and name together, from 13. Landmarks from 14. City names are gone by 13.5, towns by 14.5. | Bus positions, alert marks on bus routes |
| 14.5 and up | Smaller streets. Bus stops are loaded from zoom 14, when first needed, and drawn from 15. | Buses' route numbers, closed stops crossed out |
| 16 and up | Stop names, with the routes that serve each stop | |

### Symbols

Every symbol below is drawn once, by `addSymbol` in `public/js/symbols.js` or
by its layer's paint, and the key shows that same drawing at the size the map
draws it at its zoom (see "The key"). Nothing in the key is a second drawing.

- **Park-n-Ride:** a small slate "P" sign drawn as an icon, not a text
  square, set just up and to the left of its spot so it never covers a
  station. One size for all; the panel gives the number of spaces.
- **Line-end signs**, below zoom 9.75 only: each line's letter, alone, just
  past each end of the line. From 9.75 the letters along the line take
  over; a letter at the end beside one on the line a little way along was
  the same thing twice. No destination name: the letter says
  which line this is, and the end station is named by the same rule as any
  other station. Where the line goes is in the key, the Lines list and the
  line's panel. Lines ending together share one sign ("E R"). Where more
  than three end together (Union Station), there is no sign. The build
  picks which side of the end each sign sits on, all together: the
  arrangement that covers the least track and reaches least past the
  network's edges, with no two signs meeting at any scale from the smallest
  phone's opening view in to where signs give way. It still sizes that
  check for the wider sign with a name that the map used to draw, so
  letters have more room than they need. The page sets the letter 14 px
  from the end on that side. A phone's "Whole network" view shows every
  letter whole, from 360 px wide; its opening view is closer in and has the
  letters along the lines instead. Signs and rail letters claim their space
  first, then station names, then every other name. `meta.rail[].ends` still carries each line's end names,
  worded from the GTFS headsign without the line's own name ("W-Line Jeffco"
  becomes "Jeffco"), for the key and the Lines list.
- **Rail bullets** ride along each line from zoom 9.75, so a line can be
  named anywhere on screen, not only in the key. The build decides where
  (`lettersAlong` in `scripts/lib/sharedtrack.mjs`), once for each whole
  zoom from 10 to 16; the map shows the set for the zoom it is at (the
  zoom-10 set from 9.75, the zoom-16 set from 16 in).
  - A letter sits just past each fork (90 px), where a line leaves the
    others it shared track with: that is where the branches have to be told
    apart, and on this network, nine lines radiating from one station, it is
    the downtown view's only chance at a letter for each. Transit diagrams
    label lines at their branch points for the same reason.
  - Between the forks, letters come about every 380 px along the line,
    spread evenly: once a screen wherever the line is looked at, repeated
    occasionally (see "Where the labeling rules come from"). The 380 is the
    spacing at the middle of the zoom the set is shown for. The map can
    change sets only at a whole zoom (a filter sees the zoom as a whole
    number), and on screen the same letters are 1.4 times as far apart at
    the zoom's far end as at its middle and 0.7 times at its near end: 270
    to 540 px. A phone screen is 844 px tall and 390 wide, so a stretch of
    line as long as the screen is never lacks a letter. A new place is only
    added for a full spacing of extra track, not a half one, so a line alone
    on a stretch shorter than a spacing of track is named once, not twice
    (2026-11-08: rounding counted half a spacing over as a second place, and
    Union Station's tails, each a platform short, were named twice: a second
    B beside its first, with A, G and N between). (At 700
    the far end was 990 px: the W and the T crossed a phone with no letter.)
    A stretch with no fork is lettered from its middle out; one shorter than
    60 px gets none of its own. Until 2026-11-06 a place came up every
    100 px and a line alone took every other one, which put three C's,
    three T's or three E's on one phone screen.
  - On shared track the spacing is 380 px divided by the lines there, and
    the lines take turns: each place goes to the line whose nearest letter
    (on any stretch) is furthest away, but only among lines with no letter
    yet on this stretch, until every line on it has one (the stretch gets
    at least a place for each line, as far as they fit 28 px apart). So
    every line is named on every piece of track it shares, before any is
    named twice, and then at the same rate as a line alone. Each line's
    first letter on a stretch has `rank` 0 and the rest 1; the layer's
    `symbol-sort-key` is the rank, so where the map is short of room the
    first letters are drawn before the second ones. A line's letter claims
    its space before a station's name does (letters are placed before names
    in `lettersFirst`). A line with a letter of its own within a spacing
    (380 px) of a place counts as named there, on a neighboring stretch too:
    where branches bunch at the approach to a station (Union Station's), the
    same letter shows once, before the next station, and not twice
    (2026-11-08: the guard keeps its screen distance and gains a floor of
    200 m in metres, the whole approach a couple of branches bunch at. The
    screen rule alone, a third of a screen, left two B's 180 m apart with
    A, G and N between on the hall's approach at 16). Letters are kept
    clear of each other by
    28 px as the map shows them at the near end of their zoom (where the same
    meters are fewest pixels), not at its middle: at the middle they were 22
    px apart at the near end and the map drew one of two.
  - Each letter moves along its line, up to 60 px (120, if it must), to sit
    clear of stations (16 px) and of other letters (28 px). The map draws
    only one of two symbols that touch, so a letter placed on a station was
    a letter not drawn.
  - A line too short to have come up gets one letter mid-way along its
    longest stretch. So every line has a letter at every zoom
    (`test/sharedtrack.test.mjs`).
  - The letter sits on its own line, not on the middle of the track. The
    build gives each letter the side its line is drawn on (`sx`, `sy`, in
    line widths), and the map moves it there. On track four lines wide the
    gold G used to sit on the purple N.

  Letters are placed before station names, so lines keep their letters at
  middle zooms. A line too short to have come up anywhere gets one letter
  mid-way along its longest stretch, so every line has a letter at every
  zoom (the test above). The build can't know where the screen is, so a
  line that only clips a corner, or whose nearest letter is just off an
  edge, is covered by edge letters (below).
  Measured 2026-11-06 on a 390 × 844 phone: the opening view (zoom 10.1)
  has every line's letter once (the E twice); at 10.5 over the metro the W
  and G, which enter from the west edge, have theirs just off it; downtown
  at 12.3 every line but the N has one.

  **Edge letters** (`public/js/edgeletters.js`, layer `rail-edge-letters`,
  from the letters' zoom): when the map comes to rest, each rail line on
  screen that has no letter drawn gets one, a little in from where it
  enters. Lines and where they run are read from what the map has drawn (the
  rail layer, and the letters drawn by `rail-bullets`), so nothing about the
  network is written into the code. Where the screen holds a line's visible
  length as several pieces, the longest takes the letter, 18 px in from the
  edge (the bullet's radius and 8 px, so it isn't clipped); a line wholly
  inside the screen with nothing to enter from gets it mid-way. Letters are
  kept 28 px from each other and from the letters already drawn: a line is
  pushed further along its track until there is room, and lines that enter
  together on shared track are done in route order so they stack the same
  way each time. The layer copies `rail-bullets` (image, text, size, offset
  by zoom, fade when a route is open) so an edge letter and an ordinary one
  look alike, and the build's `sx`/`sy` are worked out from the line's slot
  and direction on screen. It draws over other symbols (overlap allowed) but
  does not ignore placement, so station names placed after it keep clear.
  "On screen" means the part of the map no control covers: the search and Key
  cards, the Live, locate and whole-network buttons and the panel are read
  from the page, and the map less a full-width band for each of the top and
  bottom ones is where a letter counts, so a line seen only under a card gets
  none and a letter hidden under one does not name its line.
  It runs once after each move, only over the rail layer (1 to 2 ms at zoom
  12 on the phone profile), never while the map moves. Why not more
  letters in the build: a set is shown across a whole zoom, so the spacing
  runs 270 to 540 px, and a stretch of a line under 300 px or a stub at the
  edge can fall between two (measured 2026-11-07: 16 of 20 random phone
  views).
- **Not running** (at the time shown): a hairline in the lightest bus gray,
  with no tag, so the network keeps its shape without claiming service.
- **Vehicles** (Live): a small rounded arrow pointing where the vehicle is
  heading. Trains in their line's color with the letter, on a thin ring of
  land color. Buses in ink (the light theme's text ink, near-white in dark)
  on a wide ring of the casing color, white in light and near-black in
  dark, 2.5 px all round, with the route number under it from zoom 14.5.
  A bus is almost always on a bus line, and in light its line is the same
  ink: with a hairline ring of land color (until 2026-11-07) an arrow on a
  frequent line read as a bump in the line, and downtown at 14 the buses on
  the 16th Street grid could not be counted. A fill other than ink was the
  other way, and was not taken: a white arrow with an ink edge is the
  station capsule's look, and the arrow should stay the strongest mark. So
  the ring is what cuts the arrow out of the line: 13.5:1 against a
  frequent line in light, 10.3:1 in dark, and wide enough to see at a
  glance.
  The body is 11 px across at 14, three times a frequent line's width. Two
  buses at one stop keep both arrows; the second number waits until they
  part. A train more than 200 m from its own line's track is drawn at 45%
  ("2. Live"). A vehicle running late says so in its panel, not on the map.
- **Alert mark** (Live): a small triangle on the line's bullet or tag, or on
  the station. It's identified by shape, never by a color that could be a rail
  line. A closed stop or station is crossed out. The exact color is settled on
  screen.
- **Highway shields:** see "Basemap".
- **Transit centers:** a rounded square with a bus glyph. Never a "T", which
  reads as the T Line.
- **FlexRide:** a light diagonal hatch with a dashed edge, never green (green
  reads as a park).
- **Outside the district:** nothing. The basemap runs on unchanged to the
  edge of the map's pannable rectangle; the network itself shows where RTD
  goes.

### Visual tokens

| Token | Value | Use |
|---|---|---|
| Ink | `#17222E` | primary text |
| Ink 2 | `#4C5A69` | secondary text |
| Ink 3 | `#7E8B98` | tertiary text, disabled |
| Rule | `#E2E7EB` | dividers |
| Surface | `#FFFFFF` | panels |
| Wash | `#F1F4F6` | pressed states, chips |
| Focus | `#1F6FEB` | keyboard focus ring |
| Live | `#E89A00` | the Live button when on, and the mark beside live times only (amber, like an LED departure sign) |

Basemap tints (light theme; `PALETTES` in `public/js/palette.js`): land
`#F4F5F6`, water `#BCD5E4`, parks `#E0EADB`, roads white with a `#DFE4E8`
casing, main street names `#4F5B67`.

**Type:** Overpass, a descendant of Highway Gothic, the US road-sign face.
Weights 400, 600 and 800, tabular numerals. Scale: 13, 15, 17, 22, 28 px.
The site serves the font itself (from the `@fontsource-variable/overpass`
package), with no request to Google. Map labels use Overpass too: the build
generates MapLibre glyph files from the same font (`scripts/glyphs.mjs`), so
the map and the interface share one typeface.

**Route bullets:** rail lines are a circle with the letter; bus routes are a
pill, a rounded rectangle filled in the tier's color for routes every 30
minutes or better, outlined in the slow tiers' color for the rest. They are
the only strongly colored elements in the interface itself.

### Dark mode

The site follows the system setting (`prefers-color-scheme`). There is no
toggle and nothing is stored. If the setting changes while the page is open,
the map and interface re-color in place and the map stays where it was.

- **One palette, two themes.** Every map color, including the symbols drawn
  on canvas (tags, shields, station capsules, signs, key swatches), comes
  from `public/js/palette.js`. Every interface color is a CSS custom property
  in `app.css`, with a dark set under the media query. No color literal sits
  in a layer definition.
- **The hierarchy is the same, inverted.** On dark land (`#161B21`) the most
  frequent buses are the brightest and thickest, with the same widths and the
  same dashes and dots as the light theme (12.3, 7.4 and 3.5:1 there).
- **Buses are a hue, not white.** On a dark map, near-white lines are what
  streets look like, and a white bus grid read as a street grid: the bus up
  I-25, with the 25 shield on it, read as the freeway (V2 review). So the
  dark tiers are one periwinkle, OKLCH hue 265, lighter and stronger by
  tier: `#A1BDF9`, `#7C92C1`, `#667493`. Against the land 9.2, 5.6 and
  3.7:1; against a dark road (`#2B343D`) 6.7, 4.1 and 2.7:1, so even the
  lightest tier stands off the street it runs on. The hue is the light
  theme's navy ink (hue 251) turned a little toward violet, so the two
  themes' buses are one family, and it sits in the widest gap between rail
  colors: the A's sky blue is 226 and the E's purple, lifted, 303. It is not
  amber (Live) or green (parks). Frequent buses are no longer brighter than
  the rail lines (lightness 0.80, where the A is 0.76 and the G 0.81), so
  rail still leads. Roads keep their dark gray and draw under every bus line,
  and a highway shield gives way to any bus line drawn ("Basemap").
- **Rail colors still come from RTD's data.** In dark, a line whose official
  color is under 4:1 against the dark land is lifted in lightness, keeping
  its hue, until it reaches 4:1 (today the E, N and T). Brighter colors are
  left alone. The rule is applied in code; no line's color is written down.
- **Text** meets 4.5:1 in both themes, each label against what it sits on
  (land, road, water, park, shield). Five light-theme labels were under it
  until 2026-11-06 (neighborhood 3.9, minor road names 4.0, shield numbers
  3.0, water names 2.8, park names 4.2) and were darkened just to the line,
  so they stay the quietest text on the map.
- A chosen route's casing is the dark land color instead of white, and the
  20% fade is unchanged.
- `color-scheme` and `theme-color` metas cover both themes.

## Interface

**Clean, at the quality of the best product design,** in this site's own
look rather than anyone else's: nothing on screen without a job, a few
controls all the same size (44 px), solid white with soft depth instead of
borders, and one typeface. The map
fills the screen; there is no title bar or tagline.

The controls:

- **Live** is the one labeled button, because it's the one that changes what
  the map means. Off, it's white with the word "Live". On, it fills with the
  live mark and the age of the positions ("Live, just now"), never a clock
  time (see "2. Live").
- **The key** is a button with an icon (a thick rail-colored line with a
  white station circle over a shorter, thinner ink line), the word "Key" and
  the time the map shows ("Weekdays, 9am to 3pm"). It opens on demand, and is
  open by default only on wide screens. It folds to its button while a panel
  is open.
- **Zoom:** touch screens get no zoom buttons, because people pinch.
- **Locate me** is an arrow that fills blue once it has found you, and you're
  a blue dot with a white ring. If it finds you outside RTD's area, the map
  stays where it was and says "You're outside RTD's area, so the map stayed
  here."
- **Whole network** is a button with the map controls, with the words on
  it and four arrows pointing out, that zooms out to all of the network. On
  a phone it is the way to Boulder and Longmont from the opening view, so
  it is labelled, not an icon alone. It hides while the whole network is
  on screen, where it would do nothing.
- **North up, flat.** The map can't be rotated or tilted, by drag, touch or
  keyboard, and a bearing or pitch in a link's hash is dropped. A rotated map
  had no way back, because there is no compass.
- **Bounds.** The map can't be panned far outside RTD's area: the routes'
  bounds plus a margin.
- **Map credits** sit in a small tab in the corner.

### Layout

Phone: full-screen map, with search at the top and the key under it, with
Live at the right of the key's row. A bottom sheet appears only when
something is open.

```
┌───────────────────────────┐
│ [⌕ Search lines, places | Lines] │
│ [key]            [● Live] │
│                           │
│           map             │
│                           │
│ (i)                  [➤]  │  credits, locate me
└───────────────────────────┘

after a tap:
├───────────────────────────┤
│ ───                       │  drag handle
│ Colfax & Pearl  stop 12345│
│ [15] Downtown     4 min ● │
│ [15] Aurora      11 min ● │
└───────────────────────────┘
```

The search bar is the top row, with a "Lines" button at its right end. The
sheet has three heights: peek (120 px), half, and full, measured from below
the search bar and key. It opens at a height that fits its content, up to
half. Drag or tap the handle (a 44 px touch target) to move between them.

Desktop (768 px and wider): search sits at the top left, 380 px wide, with
the key's button under it. The sheet becomes a card on the left, 380 px
wide, floating over the map under both.

Tab order from page load: search, Lines, the key, the map, then the map
controls. The map's accessible name says how to open things without a
pointer: "To open a route or place, use Search or Lines." Safari's Tab key
skips buttons and links by default, so every button and link gets an
explicit `tabindex="0"` as it's added to the page (`tabbable.js`); the order
is then the same in Safari, Firefox and Chrome.

One panel replaces popups. Esc closes it. Focus moves to the panel's title
when it opens and returns to where it was when it closes. Motion is reduced
when the user prefers it.

### Opening state

Live is off. Where the map opens is the first of these that applies:

1. **A shared link** opens on what it shares, and nothing moves it.
2. **Your location, if the browser already allows it.** The map opens on
   you at zoom 13.5 (about a 20-minute walk each way), with your blue dot.
   The bus lines around you carry no numbers yet (see "Bus routes",
   "Numbers"). The page never asks for your location
   on load: it checks the permission, and only an existing "allowed" counts.
   If you've started using the map before the position arrives, or you're
   outside RTD's area, the map stays where it is and says nothing. Safari on
   iPhone mostly answers "ask" unless the site is set to Allow, so most
   iPhones get the next case.
3. **Phones open on the middle of the service:** the box that holds the
   middle 60% of weekday service (trips times distance) east to west and
   north to south, worked out by the build from RTD's data
   (`scripts/lib/core.mjs`, `meta.bounds.core`). Today that is central
   Denver and west Aurora, about Wadsworth to Peoria, at about zoom 10: close
   enough to tell stations apart and read their names. It is framed between
   the search bar and key above and the buttons below.
4. **Wider screens open on the whole network** drawn at full strength (rail
   and buses every 30 minutes or better), beside the open key, at about zoom
   9.4, where stations and signs already read.

**Whole network** is one tap from any of these. On a phone it frames the
full-strength network with 36 px of room each side for the names of the
places at its ends (Boulder), at about zoom 8.5, which is the overview: lines
and letters, no station marks (see "By zoom level").

Short screens (under 500 px tall) are framed like phones; on a phone held
sideways the map is framed beside the search bar and key, not under them.

Why not the whole network on a phone: at zoom 8.4 it put every station,
ten line-end signs and the Union Station sign in a strip a third of the
screen tall. Stations were a
few pixels apart, the signs and city names covered the lines, and nothing
could be read or tapped accurately. The whole-network overview answers "what
shape is the system"; someone on a phone is more often asking about a place.

Known limits: the service-weighted box reaches north to Thornton, so the top
third of a phone's opening view is the N line alone. Union Station has no
name in a phone's opening view: its name has nowhere clear of the lines
that meet there until about zoom 12.

- **Returning visitors** open where they left off, with Live as they left it.
  Someone who rides with Live on gets it back.

### What the opening view tells you

Without a card or a caption, the first screen answers:

- **What the network is:** every line in view, drawn by how often it comes.
- **What each line is:** rail letters along the lines. Bus lines are not
  numbered yet (see "Bus routes", "Numbers").
- **Where the stations are, and what they're called.**
- **Where things are:** city and town names, kept quiet and off the lines.
- **That there's more:** the "Whole network" button.
- **How to see right now:** the Live button.

### One tap model

- Tap a vehicle (Live): vehicle details.
- Tap a station: the station, trains first. When it's closed, "Closed: no
  trains this week" (or the return date) comes first. Then buses, then
  parking.
- Tap a stop: the stop ("Stop 17731 · Southbound"), then only the routes that
  stop there.
- Tap a Park-n-Ride or transit center: the station if one is within 300 m;
  otherwise its own panel, with the spaces and the routes at stops within
  400 m.
- Tap an alert mark (Live): the alert.
- Tap a rail letter or a line-end sign: that line.
- Tap on or near lines: "Routes here", strongest first.
- Tap a FlexRide zone: a FlexRide panel, or the last row of a list when lines
  are there too.
- Tap anywhere else: "From here" for that spot (not built yet). A tap on
  nothing closes the panel.

Routes are opened from a list (Routes here, a station, search, Lines), from
their tag or letter, or by tapping near the line.

### Search

Search finds routes (by number, letter or name), rail stations, Park-n-Rides
and transit centers, and bus stops (by name or stop number). It does not find
addresses or landmarks yet. Results are a short list, at most eight, grouped
as Routes, Stations, Park-n-Rides and transit centers, and Bus stops. An
exact route number comes first; trains come before buses on a tie. A route
shown by its timetable name is also found by RTD's map code for it ("BOND"
finds the Bound). When the
words typed are a station's or Park-n-Ride's whole name, that group leads,
so "Union Station" is the station, then the lines that go there. Choosing a
result moves the map there and opens its panel. An empty result says so in
plain words.

It works by keyboard: the arrow keys move through results, Enter opens one,
Esc closes the list, and a screen reader hears how many results there are.
The stops file (1.5 MB) loads when the search box is first used, never at
page load.

### Highlight, don't list

Opening a route draws it over a white casing, fades everything else to about
20% (with MapLibre global state), and labels its two ends. The end labels
claim their space, so a city name beneath one gives way. Each stretch keeps
its own tier's color and dash. The panel shows one route at a time; a list of
20 routes in a popup is never the answer. On phones the panel is the bottom
sheet; on desktop it is the left panel. The map's opening view and every
"fit to route" leaves room for the panel, so the panel never covers what it
describes.

### Route panel wording

The headline is the midday figure with "weekdays, 9am to 3pm" beside it.
Under it are Weekdays, Saturday and Sunday rows. First and last trip go on a
separate line, never beside the midday figure: the old popup read "Every 10
min midday on weekdays, 3:12am to 1:19am", which looked like a span of
frequency. When a route's stretches differ, a note lists them and the rows
say "here" for the stretch under the finger. A stretch with no weekday
service reads "No weekday service here; runs Saturday and Sunday". The panel
ends with a link to RTD's timetable.

Where a bus goes is read from its signs (GTFS `trip_headsign`), most common
first, without the route's number, "free" and any "via ...", and with RTD's
short forms spelled out (Stn, Ctr, PnR). An end at a rail station takes the
station's name. Words every direction's sign begins with that are not part
of any RTD station or facility name are the service's name, not a place, and
are dropped: the FreeRide's signs read "Free MallRide Civic Center" and
"Free MallRide Union Station" (RTD's old name for it), so it goes to Civic
Center and Union Station. Route 37's "40th & Airport" and "40th & Colorado"
share "40th &", which names places, so both stay whole.

### Stations lead with trains

A station's panel starts with its rail lines (bullet, where each goes, how
often), then the buses that stop there, then parking. An unserved station
says so first ("No train service right now" or "Trains return Nov 23").

### Lines list

A "Lines" button at the right of the search bar opens every rail line and
bus route in the panel, grouped as in the key (trains, then each bus tier),
so any route can be opened without finding it on the map. Each row opens
that route, and Back returns to the same row in the list. The search box
finds a route by number or name, so the list has no filter of its own. It is
also the keyboard path to every route.

### Shareable links

The URL reflects what's open (`#route=15`, `#station=…`, `#here=lat,lon`) and
when (`#at=sunday`, `#at=2026-11-27T18:00`, `#live`), so any view can be
shared or bookmarked.

### Link preview

A link to the map shows the title "RTD system map", the page's description
and a picture (`public/og.png`, 1200x630): central Denver at zoom 11 in the
light theme, with the interface and route letters hidden.
`node scripts/og-image.mjs` makes it again from the live site; run it when
the map's look changes. The page's own title stays "Denver transit map
(unofficial)".

### The key

Always one tap away. The closed key is a button: its icon, the word "Key",
and the time the lines show ("Weekdays, 9am to 3pm"; later "Sunday, 9am to
3pm" or "Live, next 90 minutes"). The time is worded from `window` in
`meta.json`. Open, it lists:

- A one-line "An unofficial map of RTD buses and trains."
- **Buses:** how often a bus comes along a street, every route counted
  (`meta.classes`: only the classes the network has), each row a swatch of
  the street layer itself at its width, the busiest first; then "Rush hours
  only" and "A few trips", the part-time route lines. There is no row for
  tier `none`.
- **Trains:** each rail line with its bullet, where it goes ("A to Airport"),
  and a "How often" column.
- **On the map:** Rail station; the hub ("Union Station, where the most
  lines meet", its name from the data) while its ring is drawn; "Closed: no
  trains this week"; Park-n-Ride; Transit center; Bus stop, when zoomed in
  close; "FlexRide: book a ride in this area".
- **Live**, only while Live is on: a train (the first rail line's arrow) and
  a bus, each "zoom in to see them" below the zoom their layer starts at,
  and the dot on the Live pill in words: fresh (pulsing, positions up to
  `STALE_S` old, 2 min), stale (dimmed and still, nothing newer), off
  (gray). The words are `dotStates` in `public/js/age.js`. The alert mark
  joins this list when alerts are drawn.

**The key draws nothing of its own.** Every mark in it is the map's: a
station, sign or vehicle is the map's image (`addSymbol`, by the same id the
layer asks for), shown at the size its layer draws it at the map's zoom now
(the layer's `icon-size`, worked out for that zoom by `public/js/evaluate.js`
from the layer definition itself, so no size is typed twice). A closed
station and a bus stop are drawn from their circle layer's paint, FlexRide
from its fill's hatch and its edge's dash, and
each bus row's swatch is its layer's own width, color, dash and cap at zoom
13 (the street layer for the classes, the part-time layers for the rest). The station row follows the zoom: below 9, "Rail stations: zoom in
to see them"; from 9 to 11 the tick or dot for a one-line station and for
one across the most lines (both picked from the data); from where the
capsule is at least half crossfaded in (10.625), the capsules. The hub's
row is there only while its ring is at least half drawn (9.8 to 10.625).
Marks that arrive only closer in (closed stations, signs, stops, FlexRide)
are shown as they first look once faded in, since the row says what they
are. The key's marks are drawn again
when it opens, when the zoom settles while it is open, on a theme change,
and when Live turns on or off. Each image has an alt naming the mark ("Small
tick across the lines", "Train arrow"). The key's button icon and the rail
bullets in the Trains list are the interface's own, not marks on the map.
- A note: not affiliated with RTD, and when the data was updated.

Once the other times (Weekday evening, Saturday, Sunday, Pick a day and
time) are built, they go under the title.

It shows what a symbol means, not statistics about it: no route counts.
Rows appear only when the data has that thing (the closed-station row only
when a station is closed). It has no layer toggles: Live is the one switch
that changes what the map shows. When it scrolls, the title stays put and a
"More below" hint shows.

### While it loads

The page shows the map's frame, the key, and a quiet "Loading the
network…" line at once; transit lines draw as soon as they arrive, even
before every basemap tile is in. The attribution is a small "i" button on
phones, not a full-width bar.

## Installed on a phone

The site is a web page and stays one. On a phone it should be
indistinguishable from an app from the second launch onward, and everything
here is reachable from a URL: no app store, no native build, no Mac.

Nothing here asks for a change to what V3 is building. It is the layer around
it: how the page is installed, what it stops doing that only browsers do, and
the three things a device can tell a transit map held in the hand.

### Added to the Home Screen

From iOS 26, every site added to the Home Screen opens as a web app, with
Safari's chrome gone and no manifest required. The site ships a manifest
anyway, because it decides the icon and the name instead of leaving them to
the browser, and because Android and older iPhones still need one.

- `display: standalone`, `start_url` the map, and `background_color` the map's
  own land color, so the launch shows one color instead of white and then
  gray. Both themes, following "Dark mode".
- An `apple-touch-icon` beside the manifest's icons, because it is how iOS
  picks an icon rather than photographing the page.
- `theme-color` per theme, and a translucent status bar, so the map runs under
  it.

Installing is what makes the offline caching in "Quality floor" and milestone
6 dependable rather than lucky. Safari deletes a site's service worker, caches
and databases after seven days of browser use without a visit. A Home Screen
web app is not part of Safari: it counts its own days, and they reset whenever
it is opened. So the offline map survives a week of not riding only once
installed.

iOS gives a page no way to offer the install. So the page never asks on a
first visit; on a later visit it offers once, in one line, and never again
once dismissed.

### Nothing that reads as a browser

Each of these is a tell that the thing in your hand is a web page, and each
one goes:

- No rubber-band bounce and no pull-to-refresh: `overscroll-behavior: none`
  (iOS 16).
- No gray flash on every tap: `-webkit-tap-highlight-color: transparent`.
- No long-press callout or selection on the controls, while panel text stays
  selectable, because stop numbers and addresses get copied.
- No wait for a second tap: `touch-action: manipulation` on buttons.
- No page zoom when the search field takes focus: inputs at 16px or more.
- Heights in `dvh` rather than `vh` (iOS 15.4), so nothing shifts as the
  browser's toolbars collapse.

Page zoom itself stays. `user-scalable=no` would remove the last tell and take
the quality floor's WCAG AA with it.

### Back closes what's open

The back gesture is the test of whether this reads as an app. If opening a
station and swiping back leaves the site, it is a web page; if it closes the
station, it is an app. An installed web app has no toolbar but keeps the
gesture, so this matters most once the chrome is gone.

The panel already exists (V2 step 5, `public/js/panel.js` and `select.js`).
What it needs is a history entry per opened thing and `popstate` to close it.
The state to push is the one "Shareable links" defines — `#route=15`,
`#station=…`, `#here=…` — which V3 step 11 writes anyway. Done together, a
shared link and the back gesture are one mechanism instead of two, and neither
costs the other anything. The page then owns the whole hash, the map view
included, which means taking it over from MapLibre's `hash` option
(`public/js/main.js:157`); that only ever replaced history entries, so panning
never filled the back stack and never will.

### The panel follows the thumb

The panel tracks the finger, keeps its velocity when released, snaps to its
heights, and resists past the ends. A panel that jumps between heights is the
loudest tell left once the ones above are gone. Content changing inside it (a
station, then one of its routes) uses a view transition where there is one
(iOS 18), and nothing animates for a reader who prefers reduced motion.

### While you're holding it

- **The screen stays awake while Live is on,** and only then, and only while
  the tab is visible, beside the live updates that already stop when it isn't.
  A rider watching the next train should not have the screen dim at them.
  Screen Wake Lock works in Home Screen web apps from iOS 18.4, and Live is
  already remembered between visits, so this follows the pill.
- **Which way you're facing.** Where the device reports a heading, the locate
  dot gets a cone for it, so coming up out of a station tells you which way
  you are pointed — the objective's "sense of place", at street level. An
  enhancement, never a dependency: heading asks for a permission of its own,
  iOS support is partial, and the sensors vary.
- **The keyboard never covers the panel.** Search exists (added 2026-11-06),
  and on a phone its keyboard takes half the screen. The panel is held above
  it using the visual viewport, not the layout viewport.

### What a web app cannot do here

Worth stating so that no plan rests on it: no widget, no Live Activity, no
Siri, no background location, and no work in the background at all, since
Background Sync has never shipped in Safari. The Home Screen icon has no
long-press actions, because manifest shortcuts are not supported on iOS. And
there is no haptic feedback: Safari has no vibration API, and the switch trick
that produced one is a hack that newer iOS reportedly closed.

Push notifications are the exception: they do work, for installed web apps,
from iOS 16.4, with badging and without an Apple Developer membership. They
are deferred, not ruled out. See "Open questions".

## Voice

- Name things the way riders do: "Every 10 min", "Rush hours only", "No
  Sunday service". Never "headway" or "runboard".
- Say when. In Live, "Every 10 min now", "Not running now, starts 5:12am",
  "No more trips today". On the full map, "Every 15 min, weekdays 9 to 3".
- Tell live from scheduled. A live departure is a countdown with the live
  mark ("4 min"); a scheduled one is a clock time ("9:41pm").
- Sentence case everywhere. No all-caps labels.
- Errors say what happened and what to do: "Live positions aren't loading.
  Showing the schedule." The map keeps working either way.
- Footer on every view: "Not affiliated with RTD. Data from RTD's public map
  and GTFS feeds."

## Quality floor

- **Speed:** a usable map in under 2 seconds on a mid-range phone over
  typical 4G (170 ms latency, 9 Mbps, a 4x slower CPU), with slow 4G (150 ms,
  1.6 Mbps) as a stretch. Measured 2026-11-05 on a 390 px phone: line-end
  signs on screen at 1.5 s and rail at 1.7 s, settled at 2.4 s; on slow 4G,
  rail at 5.5 s. The opening view downloads about 760 KB, which alone takes
  nearly 4 s at 1.6 Mbps. Load data for interactions (trips, stop names) only
  when needed. Pause live updates when the tab is hidden. How:
  - The page loads only `meta.json` (a few KB: bounds, rail lines, counts)
    before creating the map. The key is built from it.
  - Map layers are added as soon as the style is parsed, not on the map's
    `load` event, which waits for every basemap tile.
  - GeoJSON is passed to MapLibre by URL, so it downloads and parses in the
    map's worker, off the main thread.
  - Bus stops (the largest file) load only when the map first reaches zoom
    14, and are drawn from 15. The shared-street labels (`busnames`) are
    built but have not been loaded by the page since 2026-11-06.
  - `directory.json` (every route's ends, hours and stations) loads after
    the first draw, since it's only needed once something is tapped.
  - The schedule summary loads after the map first draws, and a route's
    timetable only when its panel opens. Live feeds are fetched only while
    Live is on (or a stop panel is open) and the tab is visible.
  - MapLibre and the Overpass font are served from the site itself: no extra
    connections to a CDN or Google before the map can start.
  - Symbols are drawn on canvases kept in memory, not on the GPU
    (`willReadFrequently`), because each is read back as pixels for the map
    and the key, and a read off a GPU canvas waits for the GPU. That wait
    was over half the page's opening main-thread time (#105).
- **Offline:** after the first visit, a service worker keeps the page, the
  map data, and the schedule, so the full map, other times, and scheduled
  departures work with no signal (underground at Union Station, say). Live
  says it's offline. Basemap tiles already seen are kept up to a size cap.
  This is dependable only once the site is on the Home Screen, where
  Safari's seven-day deletion of a site's storage does not apply (see
  "Installed on a phone").
- **Accessibility:** WCAG AA contrast for text, visible keyboard focus, every
  action reachable by keyboard, motion reduced when the user prefers it, and
  nothing identified by color alone.
- **Resilience:** if the live feed fails, the map still works and says live
  data is unavailable. If ArcGIS is down, the site uses the last built
  snapshot.

## Design review rubric

Every change to what the map draws is checked on this card before it is
called done, and the card goes with it (Chris, 2026-11-08: "it has to be
useful and look gorgeous"; "you should have clear design evaluation
principles by now"). The gates and rows are this document's own principles
(the number beside each is its place in "Principles"), so a result is a
claim about a section above, not taste.

**The views.** Judged from phone captures (390 x 844), light and dark,
before and after, at the same fixed views every time: the metro at 10.5
over downtown, the west side at 10.7, the south at 10.2, downtown at 12.5
and 14.5 over the hub, and whatever the change is about (a corridor, a
terminal). `qa/checks` takes them headless. A row is scored on the worst
view, not the best.

**The gates.** Two things are not scored. They pass or fail (Chris,
2026-11-10: a score of "poster quality" means nothing for accuracy or
contrast, and two reviewers gave the same build's accuracy 2 and 0).

| Gate | Principle (section) | Fails when |
|---|---|---|
| Accurate | 1 (It looks designed, within reason; Data) | A measured check fails (a line on the wrong street or past a station, a data cross-check), or a reviewer cites a capture that says something false. |
| Legible | 2 (Quality floor; Dark mode) | A measured check fails (text under 4.5:1, or an essential line under 3:1, on what it sits on, in either theme), or a reviewer cites a capture of a word or mark that can't be read. |

Where a check doesn't exist yet, the cited capture decides.

**The scores.** The ten rows below are judged, 0 to 3. 0: broken or wrong.
1: works, but looks careless or accidental. 2: good; nothing a rider would
notice as wrong. 3: poster quality; it would hold up printed beside the best
hand-drawn transit maps.

| Row | Principle (section) | Asks |
|---|---|---|
| Useful | 3 (Objective; Validation tasks) | Can a rider answer the question this change is for from the view alone, without a tap? Name the question. |
| Hierarchy | 3 (Hierarchy) | Squint: rail first, then frequent buses, then stations, then the rest. Does anything new outrank what should be stronger? |
| Association | 4 (Name what can be read as named; Imhof) | Is every label and mark tied at a glance to one thing? Anything ambiguous is dropped, not nudged. |
| Calm | 5 (Imhof's density rule; Hierarchy 8) | Room to breathe: nothing crowded, nothing repeated nearby, no wall of lines or words, no crowded areas next to empty ones. |
| Across zooms | 5 (By zoom level; The key) | Changes between zooms are calm, not a jump; the same thing looks the same everywhere, and as the Key draws it. |
| Phone | 2 (Phones first; Layout) | Nothing a rider needs is under the cards or buttons; works in one hand. |
| Drawn on purpose | 6 (It looks designed; Shared track) | Even packs, concentric corners, clean branches, flush ends; line paths straight and calm, not zigzag. No stubs, knots, jogs, beads, wobble. |
| Coherence | 6 (1. See the whole network) | Do the overall shape and organization of the network read clearly? |
| Topographicity | 6 (A sense of place) | Is the map faithful enough to geography to orient by? |
| Gorgeous | 6 (It looks designed) | Is it appealing to look at? Would Chris screenshot it to show someone? Side by side with the Denver poster, does it hold its own? |

**Why usefulness and looks are both on the card.** Roberts (2014) scores
schematic maps on five criteria (simplicity, coherence, balance, harmony,
topographicity) and found that how much people like a map has no
correlation with how well they use it. So usefulness (the Useful row and the
Validation tasks) and looks are scored separately, and a version that is
useful but ugly, or lovely but wrong, cannot pass on the strength of the
other. Until 2026-11-10 the five were a second total out of 15 beside the
rows. Three of them measured what a row already did, so simplicity is now
part of Drawn on purpose, balance part of Calm and harmony part of Gorgeous;
coherence and topographicity are rows of their own.

**The test.** A version passes when both gates pass, no row is below 2, and
Gorgeous is at least 2 (aimed at 3). A pass is not a finish: the lowest row
is named as the next work.

**Better than the last version.** A change is better only if no gate that
passed now fails, no row goes down, and at least one row goes up or a failed
gate now passes. The total (out of 30) is reported but never traded: a gain
in Useful does not buy a loss in Calm. A change that lowers a row ships only
if Chris accepts that trade, and the decision log says so. Every card is
kept, dated, in `scorecards.md`, so each version is scored against the one
before it.

**Who scores.** Not whoever did the work. The orchestrator scores from the
captures; for anything large (a new kind of mark, a roadmap step) a second
reviewer who did not build it scores independently, and the two cards are
shown side by side. Each score cites the capture that earns it. The measured
checks (`npm run check`, the sweep) decide the gates where they exist and
back the rows they can (Drawn on purpose, Association, Phone), and a failing
check caps its row at 1. Chris's verdict on the screenshots overrides the
card.
The second reviewer is the project's `design-reviewer` agent
(`.claude/agents/design-reviewer.md`): it takes its own captures from a
running server, never sees the builder's report, judges against the
hand-drawn Denver transit poster (kept outside the repo), and returns a card
without editing anything.

## Validation

Before a version is called done, these six tasks are tried on a phone and
measured: whether each was completed, how long it took, and wrong answers.
Not whether anyone likes the map (see "Preference is not performance" under
"Why").

1. You're at a given address. What's the most frequent bus within a 5-minute
   walk, and when does the next one leave?
2. Can you get from a given neighborhood to the airport by train? Where would
   you board?
3. Where does route 15 go, and how often does it run on Sunday?
4. Find the nearest Park-n-Ride to a given place. How many spaces does it have?
5. Is there bus service every 15 minutes or better near a given apartment at
   weekday noon? At 9pm?
6. Is anything wrong on the W Line right now?

Tasks 1, 5 and 6 need Live or the key's other times; tasks 2 to 4 should work
from the opening view without either.

**Who tries them.** No panel of people (Chris, 2026-11-10: validation is
automated, apart from his own review, which he does when he chooses).
Before that the plan was five people who don't know the system. The tasks
are run by an automated task test, which is not built yet (#66). As
proposed there:

- Each task's place or route is picked from the data at run time, never
  written down.
- A model that has seen neither the code nor this document is given only a
  headless phone browser on the site and one task at a time, as a new rider
  would be.
- Its answers are graded against answers worked out from RTD's GTFS by a
  script that does not import the build's code.
- The report gives, for each task: answered or not, right or wrong, and how
  many taps and seconds it took. A wrong answer given with confidence is the
  worst result and is listed first.
- One command runs it against any preview.

## V1 review (red team, 2026-11-01)

What V1 got wrong, measured on real screens. V2 fixes each of these; the
sections above describe the fixes.

**Correctness**

- Ten downtown stations with no trains were drawn exactly like served ones.
- The D Line was labeled "Rush hours only" for five trips between 4 and 6am.
- "Every 15 min on weekdays" was a midday figure presented as all-day.

**Hierarchy and color**

- A frequent bus was about as thick as a rail line, so rail didn't lead.
- Against the land color, half the official rail colors and the lighter bus
  tiers fall below 3:1:

  | Line | Contrast | Line | Contrast |
  |---|---|---|---|
  | Bus, frequent | 6.08 | Rail A | 1.85 |
  | Bus, every 30 | 3.36 | Rail G | 1.67 |
  | Bus, hourly | 1.95 | Rail R | 1.45 |
  | Bus, less than hourly | 1.63 | Rail C | 2.07 |
  | Rail N | 5.51 | Rail W | 2.94 |
  | Rail E | 9.47 | | |

- Look-alikes: B and D (1.42 apart), E and N (1.72), and the A Line against
  the every-30 bus blue (1.82). A blue bus palette made the A Line read as a
  bus.
- On shared track, lines swapped color as they overlapped, and C and D read
  as yellow-and-green "hazard tape" because the dashed D was drawn on top.

**Basemap and symbols**

- Positron's italic capital neighborhood names, highway shields, and street
  names larger than route numbers competed with transit.
- Park-n-Rides and transit centers were "P" and "T" text squares; "T" reads as
  the T Line.
- FlexRide's green tint read as parks; the district mask had a hard edge; the
  attribution was a full-width bar on phones.

**Interface**

- The legend gave route counts nobody needs and rail letters without
  destinations, and on desktop it covered Boulder, because the opening view
  didn't pad for it.
- The screen was blank while data loaded.
- Popups listed up to 20 routes with repeated wording; station popups listed
  nearby buses but not the station's own trains.
- The keyboard reached only the zoom and location buttons.

**Speed**

| Test | Basemap style | Transit visible | Idle |
|---|---|---|---|
| Desktop, local | | 1.6 s | 2.3 s |
| Phone (150 ms latency, 1.6 Mbps, 4x slower CPU) | 5.2 s | 7.2 s | 8.4 s |

The page waited for every data file, including 1.3 MB of bus stops, before
creating the map, then waited for every basemap tile before drawing any
transit. "Transit visible" here is when the first transit layer was added;
filmed, transit reached the phone's screen with the basemap, at 8.4 s. V2's
step 1 shows it at 6.7 s, measured the same way. Compressed sizes: routes 141 KB, stops 121 KB, boundary 28 KB.

## V2 review (red team, 2026-11-07)

What V2 gets wrong, measured on Chris's phone in dark mode at zoom 10.5 and
on headless captures at 9.2, 10.3, 11.2, 12 and 14 in both themes. V3 fixes
each of these; the roadmap under "Milestones" says in what order.

**Correctness**

- Station marks looked like the other theme's. In dark mode the shared-track
  bars read as bright white pills while single-line dots read dark. Checked
  2026-11-07 with pixel probes in headless captures: every mark is drawn in
  the right theme. The tick's light edge is 1.6 px on a mark 6 to 8 px tall,
  drawn at 60 to 80 percent of its size from zoom 9 to 11, so the edge
  covers most of the mark and a dark fill with a light edge reads light. A
  weight problem, folded into step 2 of the roadmap.
- The Key says "Weekdays, 9am to 3pm" on a Saturday morning, beside a Live
  pill that says now. The two claims sit on one row.
- Live is on at zoom 10 and nothing on the screen is live: trains draw
  from 11 and buses from 13, and nothing says to zoom in. The pill's time
  reads as a clock, not as the age of the data.

**Marks and hierarchy**

- Shared-track stations pile up. Between 10 and 11 the C, E and W corridor
  has five stations within about a mile; each bar is as wide as three lines
  and turned to the track where the track is curving, so they stack as
  rotated pills at the one place people look first. The bar at the B and G
  split sits crooked because the lines it spans aren't parallel there yet.
- Union Station has no mark of its own from 9.75 to 11, and its name sits a
  quarter of the screen west of it, in empty space. "Alameda",
  "Decatur-Federal" and "Sheridan" float with no visible tie to a mark.
- Rail letters were spaced 700 px apart, so the W and the T crossed a phone
  screen with no letter: a color and nothing else. (Fixed 2026-11-07, step
  4: 380 px, "Rail bullets".)
- In dark mode frequent buses are white lines on a near-black ground, and
  the bus network reads as a street grid; the ribbon up I-25 with the 25
  shield on it reads as a freeway. Nothing outside the collapsed Key says
  white means bus. (Fixed 2026-11-07, step 5: a periwinkle, and shields
  give way to bus lines; "Dark mode".)
- At 14 in light mode buses are ink arrows on ink bus lines and vanish into
  the 16th Street grid; their numbers wait for 16. (Fixed 2026-11-07, step
  5: a wide white ring, numbers from 14.5; "Symbols".)
- The Key draws a rail station as a hollow ring; the map draws a dot at 10
  and a capsule from 11, and the dot looks like the Key's bus stop.
- A train in the Union Station yard draws in a park with no track near it
  and reads as an error. (Fixed 2026-11-07, step 5: drawn at 45% when over
  200 m from its line; "2. Live".)

**What holds**

Shared track (C, E and W; E and R; B and G; A and N) reads as separate
ribbons with no overlap in both themes at every zoom. Rail leads buses,
buses lead streets. The overview at 9 is a clean diagram. The train arrows
read as vehicles, not stations, keep their letter upright, and open their
route on a tap. The Union Station capsule at 14 is the mark this document
describes. Live works end to end against the deployed relay, and its stale
and failure states have words.

## Architecture

```
refresh Worker (hourly cron) ── RTD changed? ──> Pages deploy hook
                                                      │
build (npm run build)              Cloudflare Pages site
───────────────────────            ─────────────────────────────
RTD Experience item                /              static map app, service worker
 └─> web map ─> ArcGIS layers ─┐   /data/*        GeoJSON, frequency, lookups
RTD GTFS ──────────────────────┼─> /data/meta.json  source versions used
                               │   /data/schedule   summary for any time of week
                               │   /data/timetables/{route}  for panels
                               │   /live/stream   WebSocket to the Live relay
             checks pass? ─────┘                        │
                                   Live relay Worker (live/): one Durable Object
                                    polls RTD GTFS-realtime every 15 s while
                                    anyone is connected, pushes each change
```

- Static site with no backend beyond the Live relay and the refresh Worker.
  Live tiers are computed in the page from the schedule summary and the
  clock, so the server never does per-visitor work. The relay is one Durable
  Object that polls RTD while anyone has Live on and pushes to every page
  over WebSockets, so RTD sees at most four requests a minute however many
  people are watching, and the site's cost is a request per connection, not
  per poll (see "Live data").
- MapLibre GL JS for the map, plain ES modules, no framework. MapLibre
  rather than Leaflet because the basemap is vector tiles we restyle, shared
  track depends on `line-offset` (parallel lines a fixed pixel distance apart
  at every zoom), labels need collision handling, and WebGL keeps thousands
  of features smooth on phones. Version 6, which ships as ES modules (a main
  file and a worker, about 360 KB with brotli). Older versions are smaller
  but carry an unpatched attribution XSS (fixed in 6.4.1) and get no fixes.
  The page preloads the main module and starts the worker early.
- `npm run build` discovers, fetches, checks, and writes the data; `npm run
  dev` runs the site locally with `wrangler pages dev`, and `npm run
  dev:live` the relay beside it, which the site finds on its own.
- Updates are automatic (see "Zero maintenance").

The page is plain ES modules in `public/js/`, served as they are (no
bundler), one concern to a file, so a change to one concern is a change to
one file:

- `main.js`: startup only. Makes the map, its controls and framing ("Opening
  state", "Layout"), the theme switch, and wires the other modules to it.
- `network.js`: RTD's network as map layers: each line's colors in both
  themes (`railStyle`), lines and areas (`transitLines`), stations, signs,
  letters and names (`transitMarks`), their zooms, and the data sources.
- `symbols.js`: every picture the map draws on a canvas, by image id
  (stations, bullets, signs, vehicles, shields, icons), drawn on demand.
- `legend.js`: the key ("The key"), drawn from the layers and `symbols.js`.
- `sizes.js`: rail widths, station mark sizes and the zooms marks change at.
  No DOM or MapLibre, so the build imports the same file
  (`scripts/lib/stationmarks.mjs`) rather than a copy kept in step by hand;
  it sits in `public/` because that is served with no copy step.
- `basemap.js`: our basemap's layers on OpenFreeMap tiles ("Basemap").
- `palette.js`, `color.js`: every color in both themes, and the rules that
  keep RTD's colors legible ("Dark mode", "Rail line colors").
- `shared.js`: bus tiers, frequency words and formatting both the map and
  the panels use.
- `highlight.js`: fading the rest of the network when a route is open.
- `select.js`, `panel.js`: what a tap opens, the panels' words, and the
  panel container ("One tap model").
- `search.js`: the search box ("Search").
- `edgeletters.js`: a line's letter where it enters the screen.
- `evaluate.js`: style expressions worked out for one zoom, for the key.
- `live.js`, `realtime.js`, `age.js`, `track.js`: Live: the button and
  vehicles, the relay's protocol, the pill's words, and on-track checks.
- `tabbable.js`: Tab order for Safari.

Checks on the page live in `qa/checks/`: Playwright Test specs that open the
site in headless Chromium (an iPhone 14 profile, light and dark) and measure
what the map draws, one spec per "Done when" line of milestone 3 (`npm run
check`, against a running `npm run dev`). `npm test` stays pure Node for the
build's own modules. The specs are the record of what each step measured;
the detectors that look for faults nobody has named yet (a line that breaks,
marks that overlap, a letter missing) are the next thing to add there.

## Unattended work

The map is worked on continuously in two halves that talk only through
GitHub issue labels and comments, so either side can stop or restart
without the other noticing.

- The worker runs on GitHub Actions (`.github/workflows/agent.yml`). It
  wakes every four hours, or on demand for one issue, and works only when
  there is a reason to (`.github/daily/pick.mjs`): instructions waiting
  (an issue labelled `agent instructions`, which is also how an open
  issue is queued for it), a human's answer on a `needs Chris` issue, or,
  at most once a day, a review pass after the map's code on main has
  changed. With no reason it stops before installing anything or calling
  a model. One issue or one review pass per run, done by DeepSeek V4.1
  Flash through the opencode CLI, with map changes on branches and docs,
  tests and CI allowed to main fast-forward. Its briefs are
  `.github/daily/find.md` and `.github/daily/fix.md`, and a job is done
  when the agent writes `daily-summary.txt`; a model that ends its turn
  before then is told to carry on in the same session, up to five times.
  When a run finishes a map change it posts an evaluation request
  (branch, commit, round, what was asked, what changed, and where to look,
  with views that open the map at the zooms where the change shows).
- After each run the workflow, not the model, reads what the run did
  from GitHub (branches GitHub Actions pushed during the run, issues
  filed, comments, evaluation requests; `.github/daily/finish.mjs`) and sets the labels: an issue
  with an evaluation request goes to `ready for evaluation` with
  `agent instructions` off; one where the agent stopped without asking
  goes to `needs Chris` with a comment saying why (a run started by hand
  leaves the labels as they were). So
  nothing comes back
  to the worker by itself, and a stuck job waits for a person instead of
  running again every four hours. It records the run in `ledger.json` on
  the orphan branch `daily-ledger` and one line on the "Agent log" issue:
  why it ran, what it did, or "No output" when nothing changed.
- The evaluator runs on the home machine and is the only thing that talks
  to a human. It checks the preview, puts phone captures beside a
  satellite overlay (`qa/sat/render.py`), and returns `pass` (a phone
  check for a human), `revise` (instructions for the worker), or
  `escalate` (a decision only a human can make). After round 3 without a
  pass it escalates whatever the evaluation said.
- A human's newest comment on a `needs Chris` issue is the worker's next
  instruction. The evaluator posts from the same GitHub account as the
  human, so every comment it posts ends with the hidden mark
  `<!-- agent -->`, and the worker skips marked comments when it looks
  for the human's.
- All work says who made it: DeepSeek or Claude. Only DeepSeek V4.1
  Flash builds, on GitHub and on the home machine; Claude evaluates.
  `.github/daily/madeby/madeby.sh` (`made_by <model>`) sets the git
  author to the model, and its `gh` wrapper ends every comment, issue and
  pull request with "Made by: ..." and labels the issue `made by: DeepSeek` or
  `made by: Claude` (`made by: free model` marks earlier work by the free
  models). The worker sets it for
  its model, the home lanes the same, and the evaluator always runs as
  Claude.

The satellite overlay (`qa/sat/render.py`) draws Esri satellite tiles
with OpenStreetMap shapes and the map's own stops, rail lines,
terminals, structures and stations on top, so a builder checks their own
work against the real structure before asking for evaluation.

## Milestones

1. **V1, the layout (done 2026-11-01):** the full data build, with sources
   discovered from the Experience item, frequency tiers, and checks. RTD's
   network on a plain Positron basemap, with bus lines drawn by tier, rail in
   its official colors, stations, Park-n-Rides, stops from zoom 15, FlexRide
   zones, a legend, and tap-for-routes popups. Runs locally with
   `npm start`.
2. **V2, the visual design,** in five steps, using V1 as the canvas. See
   "V1 review" for what each step fixes.
   1. **Correctness and speed.** Station service from GTFS (served,
      returning, none) with a test; unserved stations drawn gray; frequency
      wording that says "midday" and gives first and last trips; "Rush hours
      only" versus "A few trips", with part-time rail drawn beneath; the
      meta-first loading described under "Quality floor"; MapLibre and
      Overpass self-hosted.
      *Done when:* the ten downtown stations draw gray today and a test shows
      a station with trains becomes served; transit appears sooner than V1 on
      the throttled phone test. Measured: 6.7 s on slow 4G against V1's 8.4
      s, and about 1 s on desktop. The 2.5 s first planned is out of reach
      on slow 4G, where the map library alone takes about 2 s to download.
      Step 3's own basemap style drops the 117 KB sprite, which helps
      further. Re-measured 2026-11-05 against the floor as it now reads
      (typical 4G): 1.7 s to rail.
   2. **Build-step geometry and color.** Contrast-adjusted rail colors and
      bullet letter colors; computed shared track with per-line offsets
      (including one-way couplets); bus corridors with combined frequency.
      Done 2026-11-08: bus streets by combined (rider's) frequency,
      `scripts/lib/streets.mjs` (see "Bus routes").
      *Done when:* no line overlaps another on shared track anywhere in the
      network, and every line and bullet meets its contrast target, all
      computed with nothing listed by hand.
   3. **Visual pass.** Our own basemap style, Overpass map glyphs, symbols,
      FlexRide hatch, feathered district edge, the zoom ladder, slimmer
      legend, loading state, and attribution. Compare two directions side by
      side on real screens (whole region, downtown, a suburb; phone and
      desktop) and pick one.
      *Done when:* rail, frequent buses and stations read first in a
      screenshot at every zoom, on phone and desktop.
   4. **Name what you draw** (done 2026-11-01). The labels in "By zoom
      level": rail signs at both ends from the opening zoom, one tag per
      frequent route at the opening zoom, every town and the main anchors,
      station names from 10.5, and tiers that arrive lighter until their tags
      do. The key's title says "Weekdays, 9am to 3pm".
      *Done when:* in the opening screenshot on a phone and on desktop, every
      line drawn has a name or number on screen, and the airport, downtown,
      Boulder, and every end of the rail network are labeled.
      Revisited 2026-11-05: every sign, Union Station and Denver show on
      phones from 360 px wide and on desktop. Frequent routes that share a
      street downtown wait for zoom 10 for their numbers, FreeRide for 11.5
      (see "Bus routes").
   5. **Interaction** (partly done 2026-11-05). Highlight a route, the bottom
      sheet and desktop panel, station panels that lead with trains, the
      Lines list, keyboard access to all of it, and padding so panels never
      cover what they describe. Done so far: the panel (bottom sheet and
      desktop card, replacing popups), route highlight, station, stop,
      Park-n-Ride and FlexRide panels, "Routes here" and shared-street lists.
      Added 2026-11-06: search, the Lines list, and a keyboard path to
      every route, station, Park-n-Ride and stop. Not done: shareable links,
      "From here", and a check with a real screen reader.
      *Done when:* every route and station can be opened by keyboard, and a
      tapped route is unmistakable on a phone.
3. **V3, right now: what the map says matches the moment.** Fix what the
   V2 review found, then finish Live and other times, in this order. Steps
   1 to 7 are the first screen, each a few hours and independent of the
   schedule work; 8 to 10 are the build; 11 closes the version.
   1. **Station marks hold their theme.** Withdrawn 2026-11-07: pixel
      probes of headless captures at 10.3, 11.2, 12 and 14 in both themes,
      with and without a mid-session switch, found every station image and
      every rendered mark in the right theme. What looked wrong is the
      edge's weight at small sizes, handled in step 2.
   2. **Shared track from 9 to 11** (done 2026-11-07). On shared track,
      one mark per station cluster below 11: stations on the same piece
      closer than a bar's length collapse to the strongest, and a bar is
      turned only where the lines it spans are parallel for its whole
      length, otherwise it is a dot. A hub mark for the place where the
      most lines meet from 9.75. The tick's edge scaled with its size, so
      from 9 to 11 the fill is most of the mark and a dark-mode tick reads
      dark.
      *Done when:* at 10 and 10.5 on a phone, no two station marks overlap
      downtown, the bar at the B and G split is square to both lines, and
      Union Station has a mark.
      Measured on a 390 px phone over the hub in both themes: overlapping
      marks 1, 1 at 10 and 10.5 before, 0, 0 after; marks nearer each other
      than the longer one's length 7 and 5 before, 0 and 0 after. The split
      (Pecos Junction) is a dot; at 41st / Fox, where B and G still run
      together, the tick is square to both. Ticks in dark mode: median
      luminance across the mark 88 before, 48 after, at 10. Still open: at
      11 the Auraria West and Empower Field capsules (300 m apart) touch;
      the collapse covers ticks only, as this step asked.
   3. **Names stay with their marks** (done 2026-11-07). Station names sit
      within a short, fixed distance of their mark at every zoom, the hub's
      name first.
      *Done when:* at 10 to 14, every station name on screen is within that
      distance of its mark, checked headlessly for the downtown stations.
      Measured from MapLibre's placed text boxes at 10, 10.5, 11, 12, 13 and
      14 in both themes: every station name within 24.4 px (under two of
      its ems) of its station, Union Station's at every zoom; before, Union
      Station's was 53 and 71 px out at 10 and 10.5, absent at 11, and
      Decatur-Federal's 27 px at 11.
   4. **Every line named on every screen** (done 2026-11-07: 10 of 20, then
      15, 16, and 20 of 20 in light and in dark). Letters along rail lines at
      least once per phone screen, with one where a line enters the view.
      *Done when:* twenty random phone views at 10 to 12 each show a letter
      for every rail line that crosses them.
   5. **Buses look like buses** (done 2026-11-07). A dark-mode bus tint
      that isn't road white, roads and shields kept under it; bus arrows
      with a ring that reads on a bus line in both themes, numbers from
      14.5; a train off its track drawn fainter.
      *Done when:* at 14 downtown in light, every bus arrow is countable in
      a screenshot, and the Key's bus swatch is the map's line in both
      themes.
      Measured headlessly on a 390 px phone downtown at 14: 20 to 26 bus
      arrows placed in light, each with a 2.5 px ring outside its edge at
      13.5:1 against a frequent line (10.3:1 in dark); before, a 0.75 px
      edge left them as bumps in the line. The Key's bus swatch, the drawn
      frequent paint and a line pixel agree: #1d3044 in light, #a1bdf9 in
      dark (was #dce6ef, the road white). The dark frequent tier against
      land 13.7 before, 9.2 after; against a road 10.0 before, 6.7 after.
      Shields on a bus line in dark at 11, three views: 3 to 5 before, 0
      after. Faint trains, 3 of 46 at one time: an E 209 m past RidgeGate,
      a T at 10th / Osage on another line's track, a B 243 m past
      Westminster. Still open: tail-track layovers within 200 m (RidgeGate,
      Lincoln) are not faded; arrows at one stop overlap, ring on each.
   6. **The Key matches the map.** Key symbols are drawn by the same code
      as the map's marks, at the zoom the Key is opened at, with a Live row
      (train arrow, bus arrow) when Live is on.
      *Done when:* no symbol in the Key is a second drawing of anything.
      (Done 2026-11-07; "The key".) Measured headlessly on an iPhone 14
      profile near Union Station at 8.5, 10, 10.6, 12 and 14 in both themes:
      the station row is "zoom in to see them" at 8.5, `dot-1` and `dot-3`
      at 0.492 (10) and 0.522 (10.6), `station-1` and `station-3` at 0.606
      (12) and 0.762 (14); the hub row (`hub-3`) at 10 and 10.6 only; the
      train arrow from 10 (0.713 to 1.069), the bus arrow at 14 (1.007).
      Each Key image against the same image drawn by the map with the
      layer's own icon-size, over the land: mean difference 0.4 to 7.4 of
      255 per pixel, 91 to 99.5% of pixels within 24, the rest at the
      edges (resampling). The CSS-drawn `.flex` and `.outside` spans and
      their colors are gone, and the Key no longer uses `.station-dot` or
      `.stop-dot` (search results still do). Tier swatches read width,
      color, dash and cap from the bus layers themselves.
   7. **Live says what it shows.** (Done 2026-11-07.) Trains from the letter
      zoom (9.75), which held up on screen; below the bus zoom the map says
      "Trains are on the map. Zoom in for buses." (a status line, not the
      pill); the pill shows age ("just now", "2 min ago"), never a clock;
      the dot's states (fresh, stale, off) are named in the Key's Live row.
      *Done when:* Live on at any zoom shows something live or says why
      not, and nothing on the pill can be read as the time of day.
   8. **Other times: the key's time choices.** The schedule summary in the
      build (tiers per route for weekday midday, weekday evening, Saturday,
      Sunday, and now), and a chooser in the Key's title. The Key opens on
      the time it is, so a Saturday morning says Saturday.
      *Done when:* validation task 5 is answerable, and the Key never names
      a time other than the one the lines are drawn for.
   9. **Live tiers and hairlines.** From the summary and the feeds, the
      next-90-minute tier per route when Live is on, hairlines for lines not
      running with when they start, holding a tier a few minutes at the
      edges of the day (see "Live window").
      *Done when:* at 9pm on a weekday, Live draws the lines the schedule
      says that night and every idle line says when it starts.
   10. **Alerts, predictions, vehicle panels.** Marks for alerts whose
       effect is no service, detour, reduced service, significant delay or a
       moved stop, the rest in panels (see "Alert noise"); next departures
       from TripUpdate in stop and station panels, scheduled when Live is
       off or its feeds fail; a vehicle panel with where it's going, its
       next stop and how full it is.
       *Done when:* validation task 6 is answerable, and stopping the relay
       leaves a working map that says it's showing the schedule.
   11. **Close the version.** Shareable links; a real screen reader pass;
       the headless captures from steps 1 to 7 re-run; then milestone 5's
       task test on V3. Publishing (milestone 6) continues beside all of
       this: the failure email, the public repository, offline caching, a
       domain.
       *Done when:* the six tasks are measured by the automated task test
       (see "Validation") and what failed is listed under a V3 review.
   Started 2026-11-07: the relay (a Durable Object, see "Live data"), the
   Live button, and vehicles on the map: trains from zoom 9.75 (at first 11) in their line's
   color with the letter from 12.5, buses from 13 with the number from 16
   (14.5 since step 5), gliding between updates; a tap on a vehicle opens its route; Live is
   remembered between visits; stale or missing positions are said so. The
   build learns the realtime route names. Not done: the schedule summary and
   live tiers, the not-running hairlines, the key's time choices, alerts on
   the map (the relay carries them, the page doesn't draw them yet),
   predictions and vehicle panels.
4. **From here, search, near me, shareable links, Directions.**
5. **Task testing:** the six tasks, run by the automated task test (see
   "Validation"); fix what fails.
6. **Publish** to Cloudflare Pages from a public GitHub repo, with the hourly
   refresh Worker, deploy hook, failure notification, and offline caching set
   up. After this one-time setup, routine RTD changes need no human.
   Started 2026-11-06: the Pages project `rtd-system-map`
   (rtd-system-map.pages.dev) is connected to the GitHub repository and
   builds `main` with `npm run build` on Node 22, output `public`; a deploy
   hook named `daily-refresh` exists; the refresh Worker is written in
   `refresh/` (`check.mjs` with tests, `worker.mjs`, `wrangler.toml`, hourly
   at :23, no page of its own). Live since 2026-11-06: the first production
   build succeeded and the site answers at rtd-system-map.pages.dev; the
   Worker is deployed with its `DEPLOY_HOOK` secret and cron. Not yet done:
   the deployment-failure email (Cloudflare dashboard, Notifications),
   offline caching, a domain.

## Open questions

- **Shared streets by combined frequency (decided 2026-11-08):** each
  street is drawn once at the rider's combined rate (see "Bus routes"). Still
  open: whether the busiest streets should be capped at rail's width rather
  than drawn wider, and the right threshold for strands against a core line
  (six routes today).
- **Span (decided 2026-11-08):** "Frequent" does not also require all-day
  service. A strict test (4 or more departures in every hour from 6am to 8pm)
  leaves only 4 routes: FreeRide, 15, 31, and SKIP, and even 15-minute rail
  fails it at the edges of the day. Lines keep the frequency of the window
  the Key names ("Weekdays, 9am to 3pm"), and span shows by switching times
  (milestone 8: Saturday, Sunday, evening), not as a stricter tier.
- **Rail frequency (decided, weights open):** weekday midday, A, C, E, G, R,
  T, and W run every 15 minutes; N every 30; and B hourly. (The feed's D
  trips are positioning trains and aren't drawn; see "Trains that aren't a
  line".) V2 draws 30- and 60-minute rail a step thinner and
  part-time rail dashed beneath the rest (see "Rail frequency"). The exact
  weights are settled on screen in step 3.
- **Station service window:** a station counts as served if trains call in
  the next seven days. A closure that starts later this week still shows the
  station as served until the build after it starts. Good enough while builds
  run whenever RTD changes something; revisit if closures are announced in
  the feed well ahead.
- **Live window (decided 2026-11-08):** frequency over the next 90 minutes,
  and "not running" when nothing leaves within the next hour. At the edges of
  the day (5am, midnight), where a line can flip between tiers each minute, a
  line changes tier only once the new tier has held for about 10 minutes.
  When a line's first trip of the day is within the hour, its panel says when
  it starts ("First train 5:12") rather than only its tier.
- **Alert noise (decided 2026-11-08, pending a week of the feed):** RTD
  posts many alerts. Draw marks only for alerts in effect now whose effect is
  no service, detour, reduced service, significant delays, or a moved stop;
  alerts that start later, and the rest, are listed in panels. The several
  alerts RTD posts for one event (often one per stop) draw as one mark.
  Review a week of the feed before building: if most alerts carry a vague
  effect, this filter would draw almost nothing.
- **Vehicles at region zoom:** about 600 buses at once would cover the map,
  which is why buses start at neighborhood zoom. Whether trains should show
  from the opening zoom is settled on screen.
- **Remembering Live:** returning visitors get Live as they left it. If the
  task test or Chris's review shows it misleads (opening at night to a mostly
  faint map), open
  on the full map and remember only where they were.
- **Push notifications (deferred):** RTD's alerts could be pushed to
  installed web apps (iOS 16.4 and later), with a badge count, and with no
  Apple Developer membership. The Live relay Worker is somewhere to send
  them from, but they still need stored per-user subscriptions, something
  that decides what is worth sending, and a privacy policy. Deferred until
  "Alert noise" is settled and V3's task test has run: push is
  the least forgiving place to get alert selection wrong. If it is adopted,
  scope it to the lines someone has chosen rather than the whole network.
- **Points of interest for V3:** which database, where it lives, how it's
  updated, and whether it can be published.
- **Name and domain.**
- **Bunching threshold:** a direction is rated by its average gap instead of
  its median when the average is more than 1.5 times the median. Measured
  2026-11-06: only route 8 passes 1.5 (ratio 4.1); 1.75 and 2.0 change
  nothing. At 1.25 the AB (Boulder to the airport, 9 midday trips in gaps of
  30 and 60 minutes, average 41, ratio 1.38) would be drawn hourly, "every
  41 min", instead of every 30, and two short pieces of the 104L at the
  airport would drop a tier. Lower it to 1.25?
- **Where a bus goes, in RTD's sign wording (open):** a bus route's ends are
  named from its bus signs (GTFS `trip_headsign`), which abbreviate: "US36 &
  Bfld" (76), "Gnprk/Lookout" (205), "Wads/Hampden Park-n-Ride" (35),
  "NRL/Golden" (23), "CCA" (6), "Aspen Rdg/Black Dmnd" (228). RTD's
  misspellings come through too ("Broomfiled", "Prarie"). Ends at a rail
  station already take the station's name. The same rule could cover RTD's
  Park-n-Rides and transit centers
  (the facility layer has their full names), which would fix about half of
  these; the rest would need the name of the last stop. Neither is built.
- **Director districts:** RTD's map includes them. Useful for the secondary
  audience, but not the default view.

## Decision log

- 2026-11-01: Objective set: frequency map answering "what can I take from
  here, and how often?" Live vehicles are a bonus layer.
- 2026-11-01: Fully public and independent: RTD ArcGIS + GTFS + GTFS-realtime,
  hosted on Cloudflare Pages, code on GitHub. No trip planning.
- 2026-11-01: Frequency comes from RTD's GTFS, going slightly beyond RTD's map
  data, because it is the most useful thing a map can show.
- 2026-11-01: Zero maintenance. Sources are discovered from RTD's Experience
  item, nothing about the network is hardcoded, an hourly Cloudflare check
  rebuilds when RTD changes anything, and a failed check keeps the last good
  version live.
- 2026-11-01: Build a light V1 first (real geography and data, plain
  styling), then do the visual design as V2 with V1 as the canvas.
- 2026-11-01: Route matching handles families (FF for FF1 to FF5) and
  FlexRide codes, found from RTD's own data. The first build run without this
  matched only 83% of routes; its check stopped the build, as designed.
- 2026-11-01: Phones open on the rail network (the stations' extent); wider
  screens open on the whole district.
- 2026-11-01: V1 red-teamed (see "V1 review"). V2 is "trains in color, buses
  in ink": a blue bus palette made the light-blue A Line read as a bus, and
  only rail needs color to be told apart.
- 2026-11-01: Official rail colors keep their hue but are darkened at build
  time to reach 3:1 against the map, and bullet letters are white or ink by
  contrast. Five of ten official colors fail 3:1 today.
- 2026-11-01: Station service comes from GTFS, not RTD's station layer, which
  still lists ten downtown stations with no trains. Unserved stations draw
  gray and return to normal on their own when the feed has trains there.
- 2026-11-01: "Rush hours only" requires trips both before 9am and between 3
  and 8pm; other routes with no midday trips are "A few trips". The D Line
  becomes "A few trips". Part-time rail is drawn beneath full-service rail.
- 2026-11-01: Every frequency shown says it is a midday figure and gives the
  first and last trip.
- 2026-11-01: The feed's D Line trips (five a day, one way, on C Line track)
  are positioning trains, not a line. A rail line that runs one way only and
  stops only where other lines stop is not drawn or listed. This replaces
  drawing the D as "A few trips".
- 2026-11-01: Bus corridors are drawn by combined frequency, computed from
  shared GTFS stops.
- 2026-11-01: Loading is meta-first: the map starts after a few KB, layers are
  added when the style parses, GeoJSON parses in the worker, and bus stops
  load at stop zoom. MapLibre and Overpass are self-hosted. On a throttled
  phone, V1 showed transit at 8.4 s and this shows it at 6.7 s. Preloading
  the route data alongside the library made it slower, so the page doesn't.
- 2026-11-01: MapLibre, not Leaflet: vector basemap styling, `line-offset` for
  shared track, label collision, and WebGL performance outweigh its size.
- 2026-11-01: The map is the interface: no single assumed question ("nearest
  stop") and no fixed views; tapping anything explains it. Phones first.
  Sense of place is a goal alongside looks: clear street names, highway
  shields, neighborhoods, landmarks and relief, on a quiet basemap.
- 2026-11-01: Rail keeps its official colors as fills, with a darker
  same-hue outline for contrast, replacing darkened fills (which turned G and
  C the same brown).
- 2026-11-01: Highway shields are shown after all (reversing "no highway
  shields"): they're how people orient, and the shield shape keeps them
  distinct from bus route tags.
- 2026-11-01: No title or tagline on the map. The key is a small button
  that opens on demand ("weekday middays" lives in the key, over the bus
  tiers). No zoom buttons on touch screens. Controls are solid white, in the
  site's own style.
- 2026-11-01: Points of interest from the project's own database are planned
  for V3, appearing at neighborhood zoom.
- 2026-11-01: MapLibre 6 (ES modules), not 4: current, patched for the
  attribution XSS, with newer line and label rendering. A few hundred KB more
  is acceptable for a map that should look its best.
- 2026-11-01: Surveyed six agencies' and Google's online maps (see "Why").
  Ours drew lines a zoom or two before naming them, so the opening view named
  no line, station, or airport. New rule: name what you draw, and draw
  lighter what can't be named yet. Labels move earlier (see "By zoom level").
- 2026-11-01: The full network is the default view, because people looking
  up a transit map expect to see all of it. A Live button turns it into right
  now: next-90-minute frequency, idle lines as hairlines that say when they
  start, vehicles, predictions, and alerts. This replaces "live vehicles are
  a bonus layer". Making Live the default was considered and reversed: at
  9pm it shows 5 frequent lines of 117, which reads as a broken map to
  someone who came to see the network.
- 2026-11-01: The full map is labeled as weekdays 9am to 3pm. Weekday
  evening, Saturday, Sunday, and a picked time live in the key, not as more
  buttons, and every time can be shared by link.
- 2026-11-01: First visit opens on the whole network; returning visitors open
  where they left off; the map never centers on your location by itself
  (that would assume the question is "what's near me").
- 2026-11-01: No trip planner, but place, stop, and "From here" panels link
  to directions in Google Maps (Apple Maps on Apple devices).
- 2026-11-01: The map, data, and schedule work offline after the first
  visit. Spanish is planned for later.
- 2026-11-01: Map labels in Overpass, from glyphs the build generates from
  the same font package as the interface, replacing Noto Sans.
- 2026-11-01: Rail is drawn from GTFS shapes, with RTD's map geometry as the
  fallback. RTD's map draws some lines twice with tail track and spurs, which
  made line ends look wrong (the E at RidgeGate). The build keeps each line's
  track once, cuts tail track at the end stations, drops short kinks, and
  moves stations onto their track.
- 2026-11-01: Shared track is ordered by place, and a smaller place inherits
  the order of a bigger one its lines run on into, so lines no longer cross
  where one joins or leaves (E and R crossed at Lincoln).
- 2026-11-01: Stations are capsules laid across the track, as wide as the
  lines they serve, replacing circles that covered side-by-side lines.
- 2026-11-01: Bus numbers are knocked out of their lines until zoom 14, with
  outlined tags only from there. Filled navy tags from the opening view read
  as highway shields, covered streets, and outweighed the buses they named
  (user review).
- 2026-11-01: Line-end signs name where trains say they're going (the GTFS
  headsign without the line's name) rather than the station's full name, so
  every sign fits on a phone ("Jeffco", not "Jefferson CO
  Government-Golden"). Phones open on the stations and the signs together.
- 2026-11-05: Line-end signs are arranged together, clear of each other at
  every scale from the smallest phone in, replacing one sign at a time at a
  single scale, which let signs meet at other scales and hid Lincoln and the
  Union Station sign. Wheat Ridge Ward faces west because no arrangement
  clears otherwise, so phones open at about zoom 8.4.
- 2026-11-05: City names come after signs and step beside their point when a
  sign covers it, so Denver shows with the Union Station sign. Route numbers
  come last, placed in order so the ones left out share a street.
- 2026-11-05: Wider screens frame rail and buses every 30 minutes or better,
  not every route, so the network fills the screen.
- 2026-11-05: The speed floor is typical 4G, under 2 seconds; slow 4G is a
  stretch.
- 2026-11-05: Route families: a route RTD's map draws on its own is never
  another's family member. The outside review's rule that a variant left
  unjoined fails the build is reversed: it flagged routes RTD draws on their
  own, and a build that stops over a name breaks the zero-maintenance rule.
- 2026-11-05: A bus ending within 400 m of a station goes to that station
  (was 300 m), so the 15 and 20 go to Colfax Station, not "Billings", now
  that route ends come from the trips.
- 2026-11-05: Phones narrower than 360 px are not a target. A 320 px screen
  would need about zoom 7.1 to show every sign whole, where signs meet, so
  the westmost sign is cut by the edge there instead.

- 2026-11-05: Bus frequency is measured per stretch of a route, not once per
  route. The build cuts each drawn line into 50 m cells, matches them to GTFS
  shapes, measures the weekday 9am to 3pm gap in each direction at the middle
  of each stretch's longest run, and the worse direction sets the tier. Runs
  under 600 m (300 m at a free end) merge into a neighbor. The Flatiron
  Flyer family was drawn as every 15 min all the way to Aurora, where few
  trips run, and routes 83, 225, 228, AB, AT and NB had the same error. 31 of
  108 bus routes are split; `directory.json` keeps one entry per route.
- 2026-11-05: When trips bunch, headway uses the average gap instead of the
  median if the average is more than 1.5 times the median. In the November
  2026 feed, bunched pairs ran at 4 times or more and ordinary drift stayed
  under 1.4. Route 8's Broadway stretch went from every 7 min to every 30.
- 2026-11-05: Streets shared by several routes get one label naming them
  ("30 · 31"), from `busnames.geojson`, loaded lazily. This is naming only:
  lines are still drawn per route, and combined frequency stays an open
  question.
- 2026-11-05: Stops carry `lines` (the drawn routes that stop there) and a
  `heading`, because popups listed routes that pass but do not stop, with no
  direction. `meta.json` gains `window`, `rail[].ends` and `counts.busnames`,
  and `tiers` counts routes with a stretch in each tier. FlexRide `url` is
  null for every zone; the page links RTD's general FlexRide page.
- 2026-11-05: Basemap: Interstate and US highway shields fade out at 14.5–15
  and 13–13.5, and US routes get their own notched shape, so "40" on Colfax
  doesn't read as a bus tag. State highway numbers are not drawn. City names
  fade out 12.5–13.5 and towns 13.5–14.5. From about zoom 14 street names sit
  beside the street, not on it. Water names skip intermittent water.
- 2026-11-05: Bus looks: every 31 min or more is one look and one key row
  (`#78848F`), because the 30-minute, hourly and less-than-hourly looks could
  not be told apart, and the key's swatches were in the wrong order.
- 2026-11-05: The key's button shows a new icon, the word "Key" and the time
  shown; the open key has "Buses", "Trains" and "On the map" sections, with
  rows only for what the data has. Rail letters repeat about every 90 px on
  phones and are placed before station names. Stations are ticks below zoom
  10.25 and capsules from 11; a closed station's ring and name both show from
  13.
- 2026-11-05: The map is north-up and flat, with rotation and tilt off (also
  stripped from the link), because a rotated map had no way back. It can't be
  panned far outside RTD's area, a locate that lands outside leaves the map
  where it was and says so, and a "Show the whole network" button joins the
  map controls.
- 2026-11-05: Short screens (under 500 px tall) open framed like phones, with
  10 px side margins on phones. Known limit: on a tall phone the network
  still fills only about a third of the height, because the line-end signs
  set the opening zoom.
- 2026-11-05: One panel replaces popups: a bottom sheet on phones (peek 120
  px, half, full; opens fit to content up to half) and a 380 px card on the
  left on desktop. A tag or rail letter opens its line; a shared-street label
  opens a short list; a tap on lines opens "Routes here"; a stop, station
  (trains first), Park-n-Ride or FlexRide zone opens its own panel; a tap on
  nothing closes. A Park-n-Ride within 300 m of a station opens the station.
- 2026-11-05: Route panels put the midday figure and "weekdays, 9am to 3pm"
  together and the first and last trip on a separate line, and say "here"
  and "No weekday service here; runs Saturday and Sunday" where stretches
  differ. Choosing a route draws it over a white casing and fades the rest to
  about 20%.
- 2026-11-05: Loading order: `directory.json` after the first draw,
  `busnames` from zoom 10.8, stops from zoom 14.
- 2026-11-06: Search and the Lines list are built. Search is the top row on
  phones and desktop, with a "Lines" button at its right end; the key moves
  to the row under it. Search covers routes, stations, Park-n-Rides, transit
  centers and stops, not addresses or landmarks. The review found nothing
  could be found by name or opened by keyboard.
- 2026-11-06: The separator in map labels is the bullet "•", not the middle
  dot, because Overpass's middle dot has no width and "30 · 31" drew as
  "30 ·31". Page text uses a drawn dot.
- 2026-11-06: A highlighted bus route keeps each stretch's own tier color
  and dash, so the lighter parts still read as less frequent.
- 2026-11-06: Dark mode follows the system setting, with no toggle and
  nothing stored. One palette (`palette.js` and CSS custom properties)
  holds both themes, and a change re-colors in place. Bus tiers keep their
  order (13.7, 7.9 and 3.9:1 on dark land). Rail colors under 4:1 on dark
  land are lifted by rule (E, N and T today). This closes the "Dark mode"
  open question.
- 2026-11-06: A panel's title takes focus when it opens but shows no focus
  ring, because the ring covered the line under it. Everything reachable by
  Tab keeps its ring.
- 2026-11-06: Where two stretches of a route meet, a stop or tap there
  shows the busier stretch's frequency, because all of its buses pass that
  spot. Stop 17731 showed route 83 as every 30 min when it is every 15.
- 2026-11-06: In search, a station or Park-n-Ride whose whole name was
  typed leads the list. "Union Station" used to open the C Line first.
- 2026-11-06: A phone held sideways frames the network beside the search
  bar and key. Under them, Boulder was cut off.
- 2026-11-06: Shared-street labels name at most three routes when they would
  run past 16 characters, never end in "+1", and repeat half as often when
  long. Downtown Broadway read "0 • 0L • 83 • 10 +7" three times on one
  phone screen; 41 labels ended in "+1"; the longest was 26 characters, now
  17.
- 2026-11-06: Every button and link gets `tabindex="0"`, because Safari's
  Tab key skipped Lines, the map's buttons and every row in a panel. Checked
  in Playwright's WebKit and Firefox builds: the Tab order now matches
  Chrome's. The search box's focus ring and the results list's height have
  fallbacks for browsers without `:has` and `dvh`.
- 2026-11-06: Tall phones open centred on the full-strength network (rail
  and buses every 30 minutes or better), not on rail alone: the stations'
  width still sets the zoom, the frame grows north and south as far as the
  height allows, and the bottom margin clears the buttons. Before, the
  bottom third of a tall phone opened on empty map.
- 2026-11-06: Every stretch was recounted from the raw GTFS, independently
  of the build's code. Every "every N min" matched. One bug turned up: where
  a shape passes a place twice, the build kept only the closer pass, and on
  the airport approach that was the empty run back out past the last stop,
  so the AB, AT and AL were drawn "a few trips a day" for 1 to 2 km where
  their full service runs. Each trip pattern now takes its closest pass that
  is in service. 170 stretches became 165; no other route changed.
- 2026-11-06: Phones open zoomed in, not on the whole network (reverses
  2026-11-01 and the phone framing of 2026-11-05). The whole network on a
  phone was a strip of signs and station marks too small to read. Phones now
  open on the middle 60% of weekday service, derived by the build
  (`meta.bounds.core`; today central Denver and west Aurora, about zoom 10),
  with a labelled "Whole network" button one tap away. Wider screens still
  open on the whole network.
- 2026-11-06: If the browser already allows location, the map opens on you
  at zoom 13.5 (reverses "never centers on your location", 2026-11-01). The
  page still never asks on load, a shared link still wins, and someone
  outside RTD's area or already using the map is left where they are.
- 2026-11-06: An overview below zoom 9: lines, a letter at each rail line's
  end, and city names. Station ticks, the names on line-end signs, bus
  numbers and FlexRide zones start at 9; station names and letters along the
  lines at 9.75 (was 10.5), so every phone's opening view has them.
- 2026-11-06: No sign at Union Station (reverses the ink hub sign of
  2026-11-05). It named a station, not a line, over the busiest part of the
  map; the station is named like any other.
- 2026-11-06: City names are small letter-spaced capitals that give way to
  rail, stations and station names from zoom 9 and sit beside their point
  (replaces "City names come after signs", 2026-11-05). In the overview
  they stay on their point.
- 2026-11-06: Light-theme neighborhood, minor road, shield, water and park
  labels darkened to 4.5:1 (closes the open question).
- 2026-11-06: "Every mark earns its place" becomes a design principle,
  after a review of the phone's opening view on a real phone found labels
  placed where there was room, not where they were needed. Until zoom 11:
  only stations where six or more routes meet are named (was: any station
  with room, which named the N line's quiet end and left downtown bare);
  towns, FlexRide zones, Interstate spurs and US highway shields are not
  drawn; rail letters repeat every 110 px on phones, not 90. Towns are set
  in small capitals like cities. "Whole network" hides while the whole
  network is on screen.
- 2026-11-06: Line-end signs are the line's letter alone at every zoom
  (reverses "Line-end signs name where trains say they're going",
  2026-11-01, and the names from zoom 9 in the overview entry above). Chris
  asked for letters only; it was first applied only below zoom 9, which was
  wrong. A destination on the map repeated the key and covered the map to
  do it. End stations are named by the same rule as every other station.
- 2026-11-06: Rail letters repeat every 90 px on phones narrower than
  375 px, and stay at 110 px on the rest. With the smaller signs, 110 left
  the C line with no letter in a 360 px phone's opening view.
- 2026-11-06: "No name covers a line" becomes a design principle (Chris:
  labels "should try to avoid covering lines at all costs. Even if that
  means putting them a little off-centre"). Every drawn line holds names
  off; a name moves up to 3.4 em to a clear spot or isn't drawn. Lighter
  bus lines count from zoom 11.5. Station names may cross a lighter bus
  line, nothing else may. Street names sit beside the street at every zoom.
  City names follow the same rule at every zoom (ends "in the overview they
  stay on their point", same day). Cost, accepted for now: DENVER and AURORA
  are missing from some far-out views, Union Station is unnamed until about
  zoom 12, and most main streets are named from about 13.5.
- 2026-11-06: Line-end letters only below zoom 9.75 (was: to zoom 13). Chris:
  with letters on the line close by, the ones at the ends "look
  duplicative".
- 2026-11-06: Shared track redone after Chris's screenshot of B, G, N and A
  north of Union Station ("They don't line up"). Lines ease between slots
  instead of stepping (closes the "smooth taper" gap); sharing carries
  across lines 20 m apart in a chain; each pair of lines keeps its sides
  through every place it runs through in a row (replaces "bigger places are
  ordered first"); out-and-back stretches and sideways hops in RTD's paths
  are dropped. B and G swapped sides at Union Station so they no longer
  cross at Pecos Junction.
- 2026-11-06: Reading right comes before matching the survey: the build may
  nudge a line a little, by rule, where exact geometry looks wrong (Chris,
  on the four lines ending raggedly at Union Station). First use: lines
  that end side by side are carried on to end level.
- 2026-11-06: New objective: the map looks designed, and is as accurate as
  it can be while looking that way (Chris: "we want this to look intentional
  and clean, like it was designed by a person"). Where exact geometry and a
  clean drawing disagree, the clean drawing wins, within reason and by rule.
  Applied to rail: lines sharing track are drawn as one pack on the middle
  of their tracks and swing in and out of it over 300 m; every line is
  rounded over 60 m either side, so corners in RTD's paths are curves.
- 2026-11-06: The build places rail letters (replaces the spacing by screen
  width, 110 and 90 px, of earlier entries). Lines on shared track
  take turns by rule, not by which letter the map happened to draw; every
  line has a letter at every zoom; letters keep clear of stations and each
  other; and each letter sits on its own line rather than the middle of the
  track.
- 2026-11-06: Routes go by their timetable names, not RTD's map codes
  (Chris: "BOND it's not the name of the route, it's the bound"). A map
  route that is one GTFS route takes its `route_short_name`: BOND is shown
  as Bound, FMR as MetroRide, FREE as FreeRide, LD as LD1. Families keep the
  map's code. The map's code still works in search. With it, a service's
  name at the start of every sign of a route is dropped from where it goes,
  so the FreeRide goes to "Civic Center", not "MallRide Civic Center" (see
  "Route panel wording"). Not changed: RTD's other sign abbreviations ("US36
  & Bfld", "Gnprk/Lookout"); see "Open questions".
- 2026-11-06: Publishing begun (milestone 6): Pages project connected to
  the repository with the build on Cloudflare, so a build whose checks fail
  leaves the live site as it was; the refresh is the Cloudflare Worker in
  `refresh/`, as Rule 2 says (a scheduled GitHub Action was written first
  and dropped: GitHub stops them in a quiet public repository). The Worker
  treats a source it can't read as unchanged, so an RTD outage never
  triggers a rebuild that would fail on the same outage.
- 2026-11-06: Live. First production build succeeded; the refresh Worker is
  deployed (cron `23 * * * *`, `DEPLOY_HOOK` secret set). From here, RTD's
  data changes reach the site within about an hour with no one involved.
- 2026-11-06: Bus numbers from zoom 13 are rows of pills, one per route,
  filled in the tier's color, instead of one outlined box of numbers with a
  count ("0 • 15 • 15L +13"). Chris's phone screenshot of downtown at night:
  the boxes' outlines were the color of the streets, the dots between
  numbers looked like stops, the same three numbers sat in three boxes
  within four blocks, and nobody can act on "+13". One pill per route is how
  bus maps number their lines. The count became a "+" pill, so stretches
  with the same row merge; rows with a "+" leave at 15, where stops take
  over. The panels' bus bullets are the same pill, so the map and the lists
  match.
- 2026-11-06: All bus route numbers taken off the map, at every zoom, the
  same evening. Chris, on the pill rows: they can be read, but it isn't
  intuitive what the information is telling you, and that isn't good map
  design; start from a map with no labels at all and add only what is
  absolutely necessary and makes sense. The three tries and what each got
  wrong are under "Bus routes", "Numbers", with the rule for adding one
  back. Rail letters, station names and street names stay for now; they are
  the next things to question. The shared-street reader is still built and
  tested, not drawn. The panels' bus bullets keep the pill look.
- 2026-11-06: Station names at the metro zooms (9.75 to 11) go to the ends
  of the rail lines, Union Station first, not to the stations where six or
  more routes meet. Chris: "the station labels don't make sense"; the
  screenshot named Decatur-Federal, Alameda, I-25 / Broadway, Englewood and
  Olde Town Arvada and not Union Station or any line's end. Union Station's
  name gets further anchor offsets of its own, since nothing nearer was ever
  clear (see "Reading the map", "Station names go to the ends of the
  lines").
- 2026-11-06: The labeling rules grounded in the cartographic and transit-map
  literature (new section, "Where the labeling rules come from"), at Chris's
  ask: "there have to be best practices that should inform what these rules
  should be." Two rules changed as a result, and the second principle was
  reworded from "name what you draw" to "name what can be read as named",
  which is what the week's failures had in common. Rail letters go from
  every 200 px on a lone line (every 100 px shared among lines on shared
  track) to one just past each fork and about once per line per screen,
  700 px, evenly, between, after Imhof on repeating line labels: the phone
  views had three C's, T's or E's each. The fork letter was added the same
  hour: with letters only at the middles of lines, the phone's opening view
  lost the W's, R's and A's (their middles are off its edge) and the
  downtown view lost five of nine, since all nine radiate from one station
  and their middles are miles out.
  Station names stay within about two ems of their mark, corners first
  (Imhof, Brewer), or aren't drawn; the hub's name alone may go further.
  Judged on the four fixed phone views before and after.
- 2026-11-07: The Live relay is a Durable Object that pushes, not a Pages
  Function that is polled. The pull relay planned in V1 would have cost a
  function invocation for every poll by every viewer (about 240 an hour each)
  against a free allowance of 100,000 a day, and a hundred people with Live
  on for an evening would have used most of it. One object polls RTD every
  15 seconds while anyone is connected, stops when nobody is, and pushes
  each change to every page over a hibernating WebSocket, so the cost is one
  request per connection plus a fixed four a minute. Modelled on the
  nextride departures board's relay, with no home server and no key: the
  object fetches RTD's public feeds itself. The realtime route names (101E,
  103W, 83L) are learned at build time from the trips both feeds name, not
  listed, keeping Rule 1. Each vehicle is a rounded arrow turned to its
  heading, a train in its line's color with its letter upright over it, a bus
  in ink; distinct from the letter bullets that sit on the lines.
- 2026-11-07: V3 is "right now": the V2 review's fixes first (station marks
  in both themes, shared-track stations and names from 9 to 11, a letter on
  every screen, buses that read as buses, a Key drawn by the map's code, a
  Live pill that says what it shows), then other times, live tiers, alerts
  and predictions, then the five-person test. Ordered so the first screen
  is right before the schedule work, which is larger and separable.
- 2026-11-07: Rail letters are placed 380 px apart (at the middle of each
  zoom's range) instead of 700. A set is shown for a whole zoom because a
  filter sees the zoom as a whole number, so 700 meant 990 px at the far end
  and lines crossing a phone with no letter; 380 is 270 to 540 px.
- 2026-11-07: The V2 review's "wrong theme" station marks did not
  reproduce: pixel probes of headless captures at 10.3, 11.2, 12 and 14 in
  both themes, with and without a mid-session switch, found every station
  image and every rendered mark in the right theme. The look comes from the
  tick's 1.6 px light edge on a 6 to 8 px mark drawn below full size, which
  is most of the mark. No code changed; roadmap step 1 is withdrawn and the
  edge's weight moves into step 2.
- 2026-11-07: Live trains draw from zoom 9.75 (was 11), the letter zoom.
  Checked on a phone in both themes at 9.75, 10.3 and 11 with Live on: about
  31, 19 and 13 trains in view, small arrows in the line's color that sit on
  the lines without covering the rail letters or station ticks, so nothing
  failed and the lower zoom stays. Train letters stay at 12.5; at these
  sizes they would cover the line's own letter bullets. Buses stay at 13.
- 2026-11-07: The Live pill shows the age of the positions ("Live, just
  now", "Live, 2 min ago"), never a clock time, and is redrawn every few
  seconds. "Just now" is under 30 s, about the feed's own update interval.
  Past the stale limit the age stays and the dot dims. The time it showed
  read as the time of day, not as how current the data was.
- 2026-11-07: When Live is on and trains or buses are out of view for the
  zoom, a status line says so once ("Zoom in to see the trains." below 9.75;
  "Trains are on the map. Zoom in for buses." to 13), on turning Live on and
  when the zoom settles across a threshold, not on every zoom tick. It
  clears itself, and never replaces a loading or failure line. The pill is
  not used for this, so it keeps one job, saying how fresh the data is.
- 2026-11-07: On shared track every line gets a letter before any gets a
  second (a place for each line, if they fit), and each line's first letter
  on a stretch is drawn first (`rank`, the layer's symbol-sort-key). The
  browser check showed that was not enough: in downtown, letters of two
  lines 22 px apart at the near end of a zoom collided and the map drew
  one, and a line's second and third letters took room from another's
  first. Letters now keep 28 px clear at the near end of their zoom, and a
  line with a letter within 110 px counts as named there. Measured with
  `check.cjs` on twenty seeded phone views at zoom 10 to 12: 10 of 20 at
  700 px, 15 at 380, 16 of 20 now. The four that fail: two with a line's
  stub of 60 to 130 px at the screen's edge (B, G, N; W), and two (C and W,
  290 to 310 px of C on screen) where the nearest letters sit 95 to 105 px
  off screen: a set is shown across a whole zoom, so spacing runs 270 to 540
  px and cannot be both under 300 and over a third of a screen. Step 4
  stays open.
- 2026-11-07: Station marks from 9 to 11 are decided by the build from the
  drawn track (`scripts/lib/stationmarks.mjs`, "Stations", "From far out").
  A tick spans its lines only where they stay the same distance apart for
  its own length either way, otherwise it is a dot (Pecos Junction, where B
  and G part, was a crooked bar), turned to the stretch's direction rather
  than the point's. A station nearer a stronger one along the track than the
  longer mark plus 4 px waits for the zoom where it is clear, in quarter
  zooms; only for one all its lines stop at, and never at a line's end. The
  hub, found as the place where the most lines meet, has a ring from 9.75.
  Edges are drawn for the size marks are seen at (1.1 px tick, 1.5 capsule
  before scaling), so dark-mode ticks read dark. On a phone over the hub at
  10 and 10.5, marks nearer than a mark's length went from 7 and 5 pairs to
  none, overlapping ones from 1 to 0.
- 2026-11-07: Station names sit with their nearest corner at most 1.4 ems
  across and down from the station (was 1.8, and up to 6.2 for the hub),
  so under two ems. The hub's name keeps that distance at every zoom and is
  placed before every other station name and before the frequent buses'
  keep-out, so it stays off rail and may cross a bus line; until now it
  found room only a quarter of a phone's width away. Measured headlessly
  over the hub at 10 to 14: every name within 24.4 px of its station, Union
  Station's within 19 to 24 px at every zoom (was 53 and 71 at 10 and 10.5).
- 2026-11-07: Edge letters: a runtime layer (`public/js/edgeletters.js`,
  `rail-edge-letters`) puts a letter on each rail line on screen that has
  none, 18 px in from where it enters, 28 px from other letters, once after
  each move. Build-time letters can't know the screen, and sets that switch
  only at whole zooms left 4 of 20 phone views with a line unnamed (edge
  stubs, and 300 px stretches between two letters). Twenty random phone views
  at zoom 10 to 12 now show a letter for every rail line that crosses them,
  20 of 20 in light and 20 of 20 in dark. Roadmap step 4 is done.

- 2026-11-07: Buses in dark mode are a periwinkle (OKLCH hue 265; frequent
  #a1bdf9, every 30 #7c92c1, slow #667493), not near-white, which read as
  streets: 9.2, 5.6 and 3.7 against land, 6.7, 4.1 and 2.7 against a road.
  The Key's bus swatch is set from the palette, so it is the map's line in
  both themes. A bus arrow is ink with a 2.5 px casing ring outside its
  edge (13.5:1 against a frequent line in light, 10.3:1 in dark), and
  20 to 26 are countable at 14 downtown. Bus numbers from 14.5 (was 16),
  optional, so a number never hides an arrow. Highway shields give way to
  every drawn bus line below the thin-line zoom, so none sit on a bus line
  (3 to 5 per screen at 11 before). A train more than 200 m from its own
  line's track is drawn at 45% (`public/js/track.js`); trains in service
  measured within 120 m, the Union Station yard 226 to 310. Roadmap step 5
  is done.
- 2026-11-07: The Key draws nothing of its own (roadmap step 6). Every mark
  is the map's image (`addSymbol`) at its layer's icon-size for the map's
  zoom, or its layer's paint (circles, FlexRide, the district wash, bus
  tiers), worked out from the layer definitions by `public/js/evaluate.js`.
  The station row follows the zoom (none below 9, tick or dot to 10.625,
  capsules after), the hub row shows while its ring does, and a Live
  section (train and bus arrows, the pill dot's fresh, stale and off) shows
  while Live is on. Redrawn on open, zoom, theme and Live. Below the
  vehicles' zooms the Live rows say "zoom in to see them" rather than a
  zoom number, which riders never see.
- 2026-11-07: The page's code is split by concern: startup (`main.js`),
  layers (`network.js`), drawn symbols (`symbols.js`) and the key
  (`legend.js`), so agents and people each edit one concern in one file. The
  sizes the build also needs are in one module (`sizes.js`) that both
  import; before, `stationmarks.mjs` and `basemap.js` copied them by hand.
- 2026-11-07: The "Done when" measurements of milestone 3 are kept as
  Playwright Test specs in `qa/checks/` (`npm run check`), light and dark,
  rather than as scripts in a scratch folder, so each step can be re-measured
  after any change. They run against a dev server already up and never start
  one: a server started from the config hid a server that had died mid-run.
  `npm run dev` gives wrangler a 4 GB heap, since it leaks under the checks'
  traffic and died twice at about 1.4 GB.
- 2026-11-07: The checks name Chromium as their browser. Playwright's iPhone
  14 profile defaults to WebKit, so they had been running there, where the
  software-GL flags do nothing. WebKit's GPU process reached 8.4 GB in 90
  seconds, and the 16 GB Mac ran out of memory and restarted.
- 2026-11-08: The checks run on GitHub as a nightly and on every branch
  preview, and the visual baselines are the runner's: six `-linux.png`
  captures taken on GitHub's own runner are committed, a platform with no
  baseline writes one from its run, says so in the job summary and passes
  (a red run that only said "no baseline yet" opened #32), and a Checks
  (baselines) workflow re-captures and commits them on request. A view is
  read at the map's own rest, not after a quiet spell: the page places the
  edge letters on idle, and after a teleport MapLibre can draw a dozen
  frames on a slow renderer without ever going idle, so the check forces a
  frame and waits for the letters to stop arriving (a quiet spell, or one
  idle, read the view mid-work and reported a line with no letter on a map
  that was about to draw one, #31).

- 2026-11-08: A design review rubric ("Design review rubric"): ten rows,
  each one of this document's principles, scored 0 to 3 from fixed phone
  views in both themes, before and after; Accurate and Legible must be 3,
  nothing below 2, a change is better only if no row drops and one rises,
  and the scorer is never whoever did the work. Chris asked
  for it after the bus bundling prototype was called a success for being
  countable when it did not yet look good.

- 2026-11-08: An independent `design-reviewer` agent does the second
  scoring: read-only, its own Chromium captures, blind to the builder's
  report. Chris asked whether a special-purpose reviewer should audit the
  work.
- 2026-11-08: The rubric also scores Roberts' five criteria (simplicity,
  coherence, balance, harmony, topographicity), 0 to 3 each and reported as
  their own total, because liking a map and using it well are uncorrelated
  (Roberts, 2014); score usefulness and looks separately. The reviewer agent
  and the cards in `scorecards.md` follow.

- 2026-11-08: No wash outside RTD's district: the basemap is the same
  everywhere inside the map's rectangular pan bounds. The wash hid towns,
  roads and terrain past the boundary and gave the map a ragged edge; Chris:
  "there's no reason to limit it to the RTD service area and it looks weird."
  The page no longer loads the boundary layer.
- 2026-11-08: Buses are drawn as streets by combined frequency, one line
  per street, its width the rider's rate of every route on it, replacing
  per-route lines and the trunk idea. Chris: "the trunks are not gonna
  work... show the frequency of the section of road and just have it scale
  up, so it's a single line but very thick", and on showing how many routes
  share a street: "up to a certain point, you can draw a very thin dividing
  line inside the line or something, or just make it doubly thick or
  something, but like you can indicate the fact that there are multiple
  lines without having to have like visibly separate lines and then maybe
  we use something special on the places where there's just like too many
  lines to have a divider or something." Hence `scripts/lib/streets.mjs`,
  six width classes (`public/js/frequency.js`), hairline strands inside a
  shared street from 13.5 where each strand has 2.6 px, and a core line on
  streets with more than six routes. The rate is evenness-adjusted (the
  expected wait of a rider arriving at random, not a count of buses), the
  continuous form of the `feat/v2-finish` corridor prototype's interleaving
  test; raw counts were rejected because a bunched pair would be drawn
  twice as frequent as it is to a rider. Rail keeps the lead by hue, casing
  and draw order; the busiest streets are allowed to be wider than rail
  close in, since they carry more buses than a 15-minute line carries
  trains (open whether to cap them). Part-time routes keep their own dashed
  and dotted lines and add no width.

- 2026-11-07: No native iOS app. A native build needs a Mac, 99 USD a year and
  App Review for every change, and it trades away the shareable links the
  secondary audience needs. WebKit already draws the whole network in 1.6 to
  2.3 seconds at phone size, so the engine is not the problem: the gap on a
  phone is interaction and Live, which V3 is closing, not the packaging.
- 2026-11-07: On a phone the site is an installed web app (see "Installed on a
  phone"): manifest, icons, theme color per theme, and the service worker
  milestone 6 still owes. Installed rather than bookmarked, because Safari
  deletes a site's storage after seven days without a visit while a Home
  Screen web app's storage survives, and that is what makes the offline map
  dependable.
- 2026-11-07: The browser's tells are removed (bounce, pull-to-refresh, tap
  flash, long-press callout, double-tap delay, zoom on focus), but page zoom
  stays, because `user-scalable=no` would take the quality floor's WCAG AA
  with it.
- 2026-11-07: Back and the edge swipe close what's open, pushing the state
  "Shareable links" defines, so a shared link and the back gesture are one
  mechanism rather than two. It lands with V3 step 11's shareable links, and
  the page takes the hash over from MapLibre's `hash` option, which only ever
  replaced history entries and so never filled the back stack.
- 2026-11-07: The screen stays awake while Live is on and the tab is visible;
  the locate dot gets a heading cone where the device reports one, as an
  enhancement; the visual viewport holds the panel above the search keyboard.
- 2026-11-07: Push notifications deferred, not ruled out. They work on
  installed web apps from iOS 16.4 with badging and without an Apple Developer
  membership, and the Live relay is somewhere to send them from, but they need
  stored per-user subscriptions and a privacy policy, and they rest on the
  unsettled "Alert noise" question.
- 2026-11-07: No haptics. Safari has no vibration API, and the switch trick
  that produced one is a hack that newer iOS reportedly closed.
- 2026-11-08: The README and "Frequency and schedules" say how the map's
  frequency measure differs from RTD's 2016 service standards and DRCOG's
  high-frequency stops, for RTD staff reading the code. The measure itself
  is unchanged.
- 2026-11-08: Three open questions settled (see "Open questions"). Frequent
  does not require all-day service; span shows by switching times. Live
  lines hold a new tier for about 10 minutes before changing at the edges of
  the day. Alert marks only for alerts in effect now with a serious effect,
  one mark per event, after a week's review of the feed.
- 2026-11-08: This file is also published as the repository's wiki, one page
  per "## " section with a grouped contents page, regenerated on every change
  on main (`scripts/wiki.mjs`, `.github/workflows/wiki.yml`). This file stays
  the only source; the wiki is never edited by hand.
- 2026-11-08: Unattended work talks only through GitHub issue labels and
  comments: a GitHub Actions worker (`.github/workflows/agent.yml`) does
  the building, fixing and finding, and a home evaluator checks finished
  work and writes the worker's next instructions. Either side can stop or
  restart without the other noticing; the satellite overlay
  (`qa/sat/render.py`) is how builders check their own work first.
- 2026-11-08: The evaluator posts from the same GitHub account as the human,
  so its comments carry the hidden mark `<!-- agent -->`. Without it the
  worker read the evaluator's own pass note as the human's go-ahead and
  would have started the issue again.
- 2026-11-08: Work is credited to who made it (free model, DeepSeek or
  Claude) in the commit author, a "Made by" line on every comment, and a
  `made by:` label on the issue, so it is clear which models did which work.
- 2026-11-08: The worker runs DeepSeek V4.1 Flash only, and only when there
  is a reason to: instructions waiting, a human's answer, or a review once
  the map on main has changed. Its first four runs, on the free models,
  produced nothing: the models ended their turns early and the workflow
  took that as success. Now a job is done only when the agent writes
  `daily-summary.txt` (until then it is told to carry on), and the
  workflow sets the labels after each run from what really happened on
  GitHub, so a finished or stuck issue is never picked again by itself.
- 2026-11-08: The free models are no longer used; DeepSeek V4.1 Flash does
  all the building, on GitHub and on the home machine, and Claude still
  evaluates. On most jobs they were given they ended their turns within
  minutes, wrote a plan instead of the change, or left edits uncommitted,
  while DeepSeek finished its jobs and asked for evaluation.
- 2026-11-08: The checks get a model of the map in plain Node
  (`qa/drawn/`): the page's own style, data, glyphs and symbols worked out as
  line, mark and label geometry at any zoom and either theme, tile by tile,
  with the basemap from the tiles the style names. Nothing in it restates a
  width, colour, offset or font, so a styling change flows through; a drift
  test in the browser keeps the two from parting (`drawn.spec.mjs`). It
  exists because the screenshot checks only see zoom 9 to 14 of a phone
  screen, and the next steps' checks need to see everywhere.
- 2026-11-10: The checks are scored, not just run (`qa/recall/`). Every fault
  a person finds is pinned on the build it was seen on (`finds.json`), and
  faults are planted in a frozen build's data on purpose; `npm run
  check:recall` reports how many of each the checks catch, and fails when a
  change catches fewer. A report with few findings no longer counts as a good
  map on its own: the checks had been tuned until the report came out clean
  while most of the faults in #42 were still on the map.
- 2026-11-10: A break in a line is judged as a rider sees it (#43,
  `qa/drawn/routes.mjs`): each route is followed across every piece that
  carries it, and a break is a line end with nothing drawn over it whose
  route carries on just ahead across empty land. The old check compared
  pieces inside one feature only, so it never saw a bus line, which is many
  street features, break where one street meets the next.
- 2026-11-10: A branch fails its map check when it adds a fault main
  doesn't have (#45): every preview runs `npm run check:map` on itself and on
  main's live site with the same checks, and the commit status `checks/map`
  says what it adds and removes. An agent asks for a phone check only when
  that passes or each new fault is answered in the issue.
- 2026-11-10: Six principles, in priority order, at the top of this file
  ("Principles"): nothing a rider acts on is wrong; everything can be read;
  how often service comes is obvious; every label belongs to one thing; calm;
  looks designed. Chris accepted the order after a review found the
  principles spread over four sections with nothing to say which wins, so
  each conflict (a city's name against a line, a clean drawing against the
  survey) had been settled on its own.
- 2026-11-10: The map must show which bus route is which without a tap, at
  the appropriate zoom (reverses "buses carry no number" of 2026-11-06 as a
  principle; the bar it set stays). Chris chose this over "weight says how
  often, a tap says which": the Nov 8 bus cards had marked main down because
  a rider can't say where a bus goes, a question this file had never
  claimed. No number is drawn yet. The scheme and its zoom are #7, and until
  one ties every number to one line or one street the map carries none.
- 2026-11-10: Facts are never set by hand, but a visual fix for one named
  place may be, in a file the build reads, tied to RTD's own ids and a
  fingerprint of the geometry so it drops out when RTD changes the place
  (narrows "always a rule in the build, never a hand edit of one spot" of
  2026-11-06). Chris chose it because a general algorithm was being written
  for single places: only Union Station has platform groups. Not built
  (#64).
- 2026-11-10: The rubric's Accurate and Legible are gates that pass or fail,
  by the measured checks where they exist, and Roberts' five criteria are no
  longer a second total: simplicity, balance and harmony join Drawn on
  purpose, Calm and Gorgeous, and coherence and topographicity are rows. Ten
  judged rows, out of 30. Chris agreed after two reviewers scored the same
  main 24 and 21 and round two's accuracy 2 and 0, and because "poster
  quality" means nothing for accuracy. The Nov 8 cards keep their old form.
- 2026-11-10: No panel of people. The six validation tasks are run by an
  automated task test (not built, #66), and Chris reviews the map himself
  when he chooses. Replaces the five-person test of milestone 5 and V3 step
  11.
- 2026-11-10: Frequency stays a weekday 9am to 3pm measure (#35). A reviewer
  found the 120 drawn hourly though it comes about every 30 minutes in rush
  hours; ten routes are hourly at midday and about every 30 in rush hours,
  and four go from every 30 to every 15 or better. The lines keep the
  midday measure the key names, and the route panel gains weekday morning
  and afternoon rush-hour rows in RTD's own periods, 6 to 9am and 3 to 6pm
  (#22). A longer measuring day (6am to 7pm) was not adopted: the 120 would
  still draw hourly, and the 8, 88 and 92 would drop from every 30 to
  hourly. A time-of-day choice is looked at again once streets are drawn as
  one line. Chris left the choice to the review; it took the research's
  recommendation.
- 2026-11-10: Bus streets are built on one street graph from RTD's own
  lines (#80). RTD's routes share their streets' centrelines, so the build
  joins the lines where they meet instead of finding shared streets by
  proximity (35 m, 25 degrees), moving each to the middle of its routes and
  stitching the pieces back together. On the union-building batch that
  stitching broke bus lines in 346 places at z14 to z17 (#77); drawn from
  the graph, a break can only come from RTD's lines, and the few there are
  joined. Built in stages from main: the graph and widths with divided
  roads as two lines (#80), divided roads as one line (#81), then the
  batch's readable-geometry rules as graph operations (#82).
- 2026-11-11: Bus terminals are RTD's bus-station facilities (class `BUS`
  or `STN`), drawn as their halls from OpenStreetMap, with the lines that
  board inside ending at the hall's edge, as round four drew them, now on
  the street graph (#82). Round four found terminals from where streets
  dangled, which counted breaks in the lines (#78); RTD's own class for its
  bus stations names them instead. A divided road is one line out to z16
  and its two carriageways from there in (#81, Chris's choice), and ramp
  circles, small loops and terminal loops are drawn as the turn the bus
  makes or a short end to the place it serves, on the graph (#82).
- 2026-11-08: A station whose lines stop at platforms too far apart for one
  mark gets a mark at each platform group, joined to the station's own mark by
  a thin line (see "Platform groups"). The groups come from the GTFS child
  stops, clustered by distance and by shared lines, so nothing knows a station
  or a line, and the rule covers any station RTD splits this way, not the one
  place it happens today. It replaces the known limit where Union Station's
  four commuter lines ended with no mark, 273 m from the station's point.
- 2026-11-08: A rail station draws its real shape from OpenStreetMap at build
  time: its platforms, the canopy over them and its station building, matched
  by tag and by the station's own platform stops, never by name (see "The
  station's real shape"). Lines run along the platform they stop at to the
  platform's real end, and a station with a station building takes the
  platform group nearest it as its point, so Union Station's one name and
  ring stand on the train hall and the historic building, not at the
  light-rail tip RTD's single point falls on. A platform group's mark now
  stands on the track at the platform's stops, where riders board, because a
  line no longer ends there. The station building is drawn as the bus halls
  are, a faint fill with no outline. (Ported onto the street-graph bus work
  from the union-building batch, #83; that batch's bus terminal text is not
  carried over.)
- 2026-11-08: Round four, Union Station. A train runs the whole platform it
  stops at, so a line ends at the platform's far end from the side it came in
  on, and the lines of a terminal end together in one row with the station's
  mark drawn across it, not fanned out at whichever end RTD's own route ends
  happen to fall on (see "The station's real shape"). This is the rail half
  of that round; its bus-hall changes are not ported, since the street graph
  draws the halls and the lines that end at them.
- 2026-11-11: "The rail line breaks at I-25 and Broadway" (a screenshot at
  zoom 11). A line that leaves a pack eases to its own track over all the
  room it has, up to 1.5 km, not within the 300 m it takes the other lines
  to be 250 m away ("Shared track", step 8). And the two marks at Union
  Station were still 12 degrees apart on the live map: once the lines were
  cut at their marks they ended on the walk's line instead of crossing it,
  and the mark was not turned; a track that ends within 2 m of the walk's
  line now counts as crossing it.
- 2026-11-11: Chris's review of the stations the evening they went out.
  The light rail had no mark at its end at Union Station at zoom 13: a
  platform group its lines end at is now marked from zoom 11 without waiting
  to clear the station's own mark, by a filter on a whole zoom. The two
  marks at Union Station are parallel, both along the walk. The gap between
  T and E at Lincoln was wider than between E and R: lines sharing track are
  put on one path and written to 0.1 m ("Shared track", step 9). Where a
  line of a pack ends, the others take their places under its end mark
  instead of easing afterwards (step 8). A line runs on parallel to its
  platform, and ends under a hall's roof where there is one (the airport);
  hall roofs are drawn like station buildings.
- 2026-11-11: Stations, after looking at each terminus at a phone's size
  (#83). A station a line ends at is marked at the line's end, and the line
  runs straight along its platform to it; this replaces the cut at the stops
  of 2026-11-10 below wherever the mark can stand at the end. Where a hall
  lies between a station's platform groups, their marks stand in line with
  it and the walk between them runs along it (Union Station), because a walk
  at an angle across the hall is not how anyone would draw it; there the
  lines are cut at the marks, and the platforms and roofs past the marks are
  not drawn. The walk is a row of dots, not a hairline. Lines on tracks more
  than 20 m apart are separate groups, so A has a mark at Peoria. A stop only
  trains call at is not drawn as a bus stop. The hub's name stays off lines
  from zoom 15. Lines ease between slots in thirty-seconds of a width.
- 2026-11-12: The symbols' canvases are created with `willReadFrequently`
  (#105). Profiled in headless Chromium, reading each symbol back off a GPU
  canvas (`getImageData` for the map, `toDataURL` for the key) took 3 to
  4.5 s and 1.3 s of the page's opening main-thread work; with the option,
  about none. At the "Quality floor" profile (170 ms, 9 Mbps, 4x CPU) the
  main thread was blocked 2.2 to 2.5 s during load instead of 4.8 to 5.8 s.
  Drawing the symbols at build time into a sprite sheet was the other way;
  it was not needed once the cost turned out to be the read, not the
  drawing. The symbols look the same in both themes; only edge pixels'
  anti-aliasing differs.
- 2026-11-10: A rail line ends at the mark of the station it ends at, not
  past it. Running each line along its platform to the platform's far end
  while the mark stays at the stops, where riders board, left lines running
  on past the station they end at: on the map-fixes branch's build that was
  41 to 53 px at zoom 16 at Union Station's light rail (C, E, W), 51 at
  Golden, 47 at Lincoln and 64 at the airport, and 16 overshoots in the route
  check (#74, #75). The line is now cut where its
  end station's mark, or its platform group's mark, crosses it (see "The
  station's real shape").
- 2026-11-08: Round three on the sketch evaluation. A place whose name is a
  served station's label (the Union Station neighbourhood) is no longer named
  by the basemap: the served stations' labels are read from stations.geojson
  when the page loads and passed to the place layer, so the station has the
  one name it deserves (see "Basemap"). On an approach where branches bunch at
  one place, a line's letter shows once: the third-of-a-screen guard gains a
  200 m floor in metres, and a place is only added for a full spacing of extra
  track, which had rounded a half-over into a second letter on Union
  Station's platform-short tails (see "Rail bullets"). The hub's name is now
  placed before rail's keep-out as well as the buses', because at a station
  the lines end there: every point beside the mark is on a track, and a
  haloed name on its own station's tracks reads where no name at all does
  not.
- 2026-11-12: Links to the map get a preview: Open Graph and Twitter tags
  titled "RTD system map", with a picture of central Denver made from the
  live site by `scripts/og-image.mjs` (see "Link preview"). The picture is a
  committed file, so it shows the map as it was when made; the route letters
  are hidden because they stack at Union Station at that size (#114).

## Sources

- Guo, Z. (2011). Mind the map! The impact of transit maps on path choice in
  public transit. *Transportation Research Part A* 45(7).
  [Working paper](https://wagner.nyu.edu/files/faculty/publications/Mind_the_Map_Guo_Zhan_2010.pdf)
- Grison, Leprévost & Morgagni (2022). Do you believe in transit schematic
  maps? [Listing](https://timetableworld.com/?p=29315)
- Roberts, M. J. (2014). What's your theory of effective schematic map
  design? [PDF](https://repository.essex.ac.uk/11368/1/Roberts-Theoretical.pdf)
- Roberts & Rose (2016). Map-induced journey-planning biases for a simple
  network. [PDF](https://repository.essex.ac.uk/17832/1/Roberts_Rose_TRA_2017.pdf);
  Roberts, Gray & Lesnik (2017), preference versus performance.
  [PDF](https://repository.essex.ac.uk/17237/1/1-s2.0-S1071581916300751-main.pdf)
- Hochmair, Vienna route-choice experiment.
  [Summary](https://nextcity.org/urbanist-news/frequency-and-real-time-info-help-transit-riders-most)
- RTD (2016). Transit Service Policies & Standards, revised July 22, 2016.
  [PDF](https://cdn.rtd-denver.com/image/upload/v1707247621/service-standards-7-2016_rg0fun.pdf)
- DRCOG (2022). Denver Region Data Brief: the COVID-19 pandemic's effect on
  high-frequency transit. [PDF](https://drcog.org/sites/default/files/acc/RPD-FL-DATABRIEFFREQUENCY-EN-ACC-24-06-14-V1.pdf)
- Walker, J., frequent network maps.
  [Coverage](https://www.geekwire.com/2012/seattle-redesigns-public-transit-maps-emphasis-frequency/)
- Wessel, N., why trip planners aren't enough.
  [Human Transit](https://humantransit.org/?p=21188)
- Watkins et al. (2011). Where is my bus? *Transportation Research Part A*.
  [Listing](https://iaorifors.com/paper/72407)
- Brakewood, Macfarlane & Watkins (2015). Real-time information and bus
  ridership in New York City. *Transportation Research Part C* 53.
  [Listing](https://www.worldtransitresearch.info/research/5519)
- Tang & Thakuriah (2012). Ridership effects of real-time bus information,
  Chicago. *Transportation Research Part C* 22.
  [Listing](https://www.worldtransitresearch.info/research/4150)
- Farag & Lyons (2010, 2012), public transport information use.
  [2010](https://uwe-repository.worktribe.com/OutputFile/984779),
  [2012](https://uwe-repository.worktribe.com/index.php/OutputFile/999706)
- Grotenhuis, Wiegmans & Rietveld (2007). Desired quality of integrated
  multimodal travel information. *Transport Policy* 14(1).
  [Listing](https://ideas.repec.org/a/eee/trapol/v14y2007i1p27-38.html)
- Le-Klähn, Gerike & Hall (2014). Visitor users vs. non-users of public
  transport: Munich.
  [Listing](https://fis.tu-dresden.de/portal/en/publications/visitor-users-vs-nonusers-of-public-transport(935b5533-12cc-46bb-af35-cdb1656d0676).html)
- Evans, G. (2009). The design and applications of the stop-specific bus map.
  [PDF](https://icaci.org/files/documents/ICC_proceedings/ICC2009/html/refer/17_14.pdf)
- Results of research into a new suburban bus map (1982).
  [Listing](https://timetableworld.com/?p=29405)
- Bast, Brosi & Storandt (2018). Efficient generation of geographically
  accurate transit maps (LOOM).
- Online maps surveyed (2026-11-01): TransLink's
  [interactive map](https://experience.arcgis.com/experience/258b7d75a1d146e7bd4570bdbdf3713d)
  and [system maps](https://www.translink.ca/schedules-and-maps/transit-system-maps);
  RTD's [system map](https://www.rtd-denver.com/system-map); Metro Transit's
  [schedules and maps](https://www.metrotransit.org/schedules-maps); TriMet's
  [home page map](https://trimet.org/home/) and its
  [release notes](https://support.trimet.org/hc/en-us/articles/4481465890971-TriMet-website-release-notes);
  the MTA's [maps](https://www.mta.info/maps); Google Maps' transit layer.
- Walker, J., on TriMet's frequent-network map and the history of frequent
  network maps. [2015](https://humantransit.org/2015/10/new-trimet-map-focuses-more-heavily-on-the-frequent-network.html),
  [2009](https://humantransit.org/2009/06/frequent-network-maps-an-obvious-idea-that-took-forever-to-happen.html);
  on his own [Seattle](https://humantransit.org/?p=22774) and on
  [Spokane's](https://humantransit.org/?p=22139) frequent network maps.
- Labeling (read 2026-11-06 for "Where the labeling rules come from"):
  Imhof, E. (1975). Positioning names on maps. *The American Cartographer*
  2(2), as summarized with later practice in
  [Labeling (map design)](https://en.wikipedia.org/wiki/Labeling_(map_design));
  Brewer, C. (2015). *Designing Better Maps*, and Penn State's
  [label placement](https://courses.ems.psu.edu/geog486/node/557) lesson
  built on it; Kern & Brewer (2008) on Imhof's rules as the basis of
  automated placement
  ([Cartographic Perspectives 60](https://cartographicperspectives.org/index.php/journal/article/download/cp60-kern-brewer/pdf/1397));
  Nöllenburg & Wolff (2011). Drawing and labeling high-quality metro maps by
  mixed-integer programming. *IEEE TVCG* 17(5)
  ([PDF](https://i11www.iti.kit.edu/extra/publications/nw-dlhqm-10.pdf));
  Railway Technology, [Easy as A to B: the art of the transit map](https://www.railway-technology.com/features/featureeasy-as-a-to-b-the-art-of-the-transit-map-4215400/);
  Halifax Transit's bus map redesign
  ([SEGD](https://segd.org/projects/content-halifax-transit-bus-map-and-street-signage-redesign/));
  Classifying the diversity of bus mapping systems
  ([Glasgow](http://eprints.gla.ac.uk/150750/1/150750.pdf));
  Bus route map design and cognitive load, *IJGI* 11(6):338
  ([MDPI](https://www.mdpi.com/2220-9964/11/6/338));
  Mapbox, [optimize map label placement](https://docs.mapbox.com/help/dive-deeper/optimize-map-label-placement/)
  and Mapbox Streets v8's zoom tiers.
  [PDF](https://ad-publications.informatik.uni-freiburg.de/SIGSPATIAL_transitmaps_2018.pdf)
