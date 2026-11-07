# RTD system map: design specification

This is the source of truth for what this site is, who it is for, and how it
should look and behave. Read it before changing the map, the interface, or the
data pipeline. When a decision changes, update this file and add a line to the
decision log at the bottom.

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

**Name what you draw.** Every line on screen says what it is at the zoom
where it appears: a train line carries its letter and where it goes, a bus
its number. A map that shows service without naming it says less than it
seems to. That was V2's biggest gap, found by comparing it with other
agencies' maps (see "Why").

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
lines, which stations, how often, where they go) stays exact. And the
cleaning is always a rule in the build that works on any network, never a
hand edit of one spot. (Chris, 2026-11-06: "we want this to look intentional
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

Every line is named at the zoom where it appears (see "Name what you draw").
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
- **Vehicles:** trains move at their live positions from city zoom, and buses
  from neighborhood zoom.
- **Alerts:** RTD's service alerts are drawn where they apply.
  - A line with no service, a detour, or major delays gets an alert mark on
    its bullet or tag.
  - A closed stop or station is crossed out.
  - An elevator outage shows on its station.
  - Tapping a mark shows RTD's text.
  - Only alerts in effect now that change service are drawn. The rest are in
    the panels.
  - A line whose alert stops all its service draws as not running.

While Live is on, the button reads "Live, 9:41 pm" with the live mark. Tapping
it again returns to the full map.

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
- **Shared-street labels** (`busnames.geojson`, loaded lazily): where several
  routes share a street (within 35 m, within 25 degrees of bearing), one
  label run naming them, strongest tier first and then in number order, as a
  row of pills, at most four, with a "+" pill for the rest (see "Bus
  routes"). Fields: `pills` (`"0:frequent 15:frequent 9:slow +:more"`: each
  pill's look, the two main tiers and one look for every slower tier, so a
  route's hourly and rush-hour stretches share a row), `text_main`
  (the routes every 30 minutes or better, as text, for the zooms before the
  pills), `more` (1 when the row doesn't name every route), `routes`, `tier`
  and `n`. This is naming only: lines are still drawn per route, not by
  combined frequency (see "Open questions").
- **Stops** with `lines`, the drawn map routes that actually stop there
  (families mapped to the drawn code, so FF1 is FF), and `heading`
  ("Northbound", "Southeast-bound", and so on). Stop popups used to list
  routes that pass a stop but do not stop at it, with no direction.
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
   `parent_station`.
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
browser's preflight check gets a 403). The site therefore relays them through a
same-origin Cloudflare Pages Function. The relay passes the raw bytes through
and caches each feed for about 10 seconds at the edge, so RTD sees roughly one
request per feed per edge location no matter how many people are viewing. The
browser decodes the protobuf itself.

What each feed is used for:

| Feed | Used for |
|---|---|
| VehiclePosition | Vehicles on the map, with heading and occupancy |
| TripUpdate | Predicted departures in stop and station panels, and how late a vehicle is |
| Alerts | Alert marks on the map, and alert text in panels |

The page polls vehicles and alerts only while Live is on and the tab is
visible, about every 15 seconds. Predictions are fetched while a stop or
station panel is open, in either view. Vehicles glide between updates unless the user prefers
reduced motion. A position more than two minutes old is dropped rather than
shown as current. A departure is called live only when it comes from a
prediction. Otherwise it's scheduled, and looks it.

### Addresses

Street-address search uses Photon (`photon.komoot.io`), an OpenStreetMap
geocoder that allows cross-site requests, limited to the Denver region. RTD's
own address layer covers only RTD facilities.

## Map design

The V2 principle: **trains in color, buses in ink.** Rail is the only color
on the map, so a rail line can be found at a glance. Buses are drawn in a
single dark ink, and how often they come is shown by weight and darkness.
Everything else (streets, parks, water, labels) steps back.

The second principle is **name what you draw**. Every line on screen is
identified at the zoom where it appears, without a tap:

- Rail carries its letter along the line, on the line itself. Only below
  zoom 9.75, where there are no letters along the lines yet, the letter sits
  at each end instead: both at once said the same thing twice. The letter is
  the whole label: where a line goes is in the key, the Lines list and the
  line's panel, not on the map.
- Buses carry their number, starting with the frequent ones.

When something is drawn but there's no room to name it, it's drawn lighter
until there is. The by-zoom table below is built on this rule.

The third is **every mark earns its place**. A label is on the map at a
given zoom because someone looking at that much of the city needs it, not
because there's empty map to put it in. The test for each one: would a rider
miss it? If not, it waits for the zoom where they would. Applied
2026-11-06, after the phone's opening view named four stations on the empty
north end of the N line and almost none downtown, repeated each line's
letter three or four times, and set town names where they read as stations:

- **Station names go to where routes meet.** Until zoom 11 the only
  stations named are those where six or more routes meet, trains and buses
  together (the build counts them, `links`; today 17 stations: Union
  Station, Nine Mile, Central Park, Federal Center, I-25 / Broadway and so
  on). They're the ones people change at and ask for. Every station is named
  from 11, the busiest first. Every station can be tapped at any zoom.
- **A line's letter appears as often as it takes for every line in view to
  have one,** and no more. The build places them (see "Rail bullets").
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

### Hierarchy (strongest to quietest)

1. Rail lines, in their official hues, always heavier than any bus, with a
   white casing
2. Frequent bus routes, in full ink
3. Stations and Park-n-Rides
4. In Live, vehicles and alert marks
5. Less frequent bus routes, lighter and thinner by tier
6. FlexRide zones, as a light hatch with a dashed edge
7. Lines not running at the time shown, as faint hairlines
8. Basemap: streets, water, parks, labels
9. Outside RTD's district, a soft gray wash with a feathered edge

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
  them from being read as bus route numbers. Interstates have their own
  shield and fade out from 14.5 to 15. US highways have a notched US-route
  shield, so "40" on Colfax doesn't read as a bus tag, and fade out from 13
  to 13.5. State highway numbers are not drawn.
- **Neighborhood names** in plain sentence case, from zoom 12. **City names**,
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
and at each end (see "Symbols").

### Rail frequency

Rail stays heavier than any bus at every tier. 15-minute rail is full width;
30- and 60-minute rail is a step thinner; rail with only a few trips or
rush-hour trips is dashed and drawn *beneath* full-service rail, so on shared
track the line that actually runs wins. The exact weights are settled on
screen in V2 step 3.

### Stations

| State | How it's drawn |
|---|---|
| Served | no mark below zoom 9 (stations a few pixels apart read as noise); from 9 to 10.25 a small tick across the track; from 11 a white capsule with an ink edge laid across the track, as wide as the lines it serves and turned to the track's direction (a circle where one line stops), crossfading with the tick from 10.25 to 11 |
| Returning | hollow gray ring and gray label, both from zoom 13. Panel: "Trains return Nov 23" |
| No current service | hollow gray ring and gray label, both from zoom 13. Panel: "No train service right now" |

The state comes from GTFS on every build (see "Station service"), so stations
that lose or regain trains change on their own. The key shows the gray
station only when at least one station is unserved.

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
together, and track curves. Always by a rule in the build, never by editing
one place by hand. (Chris, 2026-11-06: "It's more important that it visually
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
   sixteenth of a line's width, over up to 1.5 km, finishing before the next
   station. Only the piece with fewer lines moves; lines still together stay
   put. So a line never steps sideways at a junction, and isn't drawn over
   another while their tracks are still close.

Checked on RTD's network 2026-11-06: no two joined pieces of a line differ by
more than a sixteenth of a width, and no two lines within 20 m of each other
are drawn less than 0.88 of a width apart. In the pack leaving Union Station
the four lines are within 0.8 m of one path all the way (they were up to
20 m apart). `test/sharedtrack.test.mjs` holds these rules on a made-up
network.

Known limit: the four commuter lines end at Union Station with no station
mark on them. RTD's data has one point for Union Station, and it sits on the
light rail end, 250 m away.

A new line, a rerouted line, or a new shared corridor is handled with no
changes. Never fix a corridor by hand-editing data or hiding a line; improve
the algorithm instead. (This is a studied problem; see LOOM by Bast, Brosi
and Storandt.)

### Bus routes

Frequency is the main visual variable for buses: line weight and ink
darkness follow the tier table above. Frequent buses are nearly as dark as
text; each tier below is thinner and lighter, and dashed (rush hours) or
dotted (a few trips) where service is part-time. Every tier stays visible
against the land, so even the lightest bus line meets 3:1. Frequent buses are
a deep navy ink (`#1D3044`) rather than black, so a dense downtown grid
doesn't read as a solid block.

As drawn, on the land color (`#F4F5F6`), with widths at zoom 9, 11, 13 and 16:

| Look | Color | Width | Style |
|---|---|---|---|
| Every 15 min or better | `#1D3044` | 1.2 / 1.9 / 3 / 5.2 | solid |
| Every 16–30 min | `#3F5266` | 0.85 / 1.4 / 2.1 / 3.7 | solid |
| Every 31 min or more (hourly, less than hourly) | `#78848F` | 0.45 / 0.6 / 1 / 2 | solid |
| Rush hours only | `#78848F` | 0.5 / 0.7 / 1.1 / 2.1 | dashed |
| A few trips | `#78848F` | 0.6 / 0.9 / 1.4 / 2.5 | dotted |

The 30-minute, hourly and less-than-hourly looks could not be told apart,
and the key's swatches were in the wrong order, so the two slowest tiers now
share one look and one key row, "Every 31 min or more".

Each stretch of a route takes the tier measured for it (see "Bus routes are
measured by stretch"), so one route can change weight where its service does.

Route numbers sit in their lines until zoom 13: bold numbers in the line's
ink, knocked out of the line, so the line breaks around its number. Between
11.5 and 13 the numbers that repeat along a line come from the shared-street
labels below, so a street with several routes reads "30 • 31". From 13,
where every route is numbered and streets are named, a street's routes are a
row of **pills, one per route**, the way bus maps generally number their
lines (a pill is a highway shield for a bus): each filled in its tier's
color with the number knocked out, slower tiers outlined in their lighter
ink instead, so the row keeps the tiers' order of weight, and each pill
ringed in land color so a navy pill reads on a navy line. The same pill is
the route's bullet in the panels and lists, so a number on the map and the
same number in a list are one thing. Filled tags further out were tried and
rejected: at zoom 12 a filled pill is five times its line's width, reads as
a highway shield, and outweighs the bus it names. The white tag outlined in
the line's ink that preceded the pills was dropped too: on the dark map its
outline was the color of the streets, so a box of numbers read as part of
the street grid. A number follows the tier at the time shown, so the 15 is
navy at noon and may be slate at 10pm.

When numbers appear:

- **Frequent routes:** from the opening zoom, one number per route, placed
  where the route runs alone, away from other frequent routes and well away
  from rail, so it can only mean one line. The build places them one at a
  time, the routes that run most alone first, each clear of the signs and of
  the numbers before it on a phone, a laptop and a desktop. Where there's no
  room, the route left without a number is one that shares its street with
  another: downtown, the 0L, 15L and FreeRide, and on phones a few more in
  central Denver. They get their numbers by zoom 10, except FreeRide on
  phones, which is crowded out downtown until numbers repeat along the line
  from 11.5. None is drawn below zoom 9 (the overview).
- **Every-30 routes:** from 11.5, in the shared-street labels below.
- **Every route:** from 13.
- **Not running:** no number.

**Shared streets.** Where several routes run along one street, they share
one label so the street reads as a whole instead of alternating numbers
(30, 31, 30, 31). The build (`scripts/lib/busnames.mjs`) finds routes within
35 m of each other and within 25 degrees of the same bearing, and makes one
label run naming them all: strongest tier first, then in number order. A row
names at most four routes (about 40% of a phone's width). Where more share a
street, the strongest three are named and a fourth pill, "+", stands for the
rest: tapping it opens the list of all of them. Counting them ("+13") was
tried first and dropped: no one can act on the count, and because every
block downtown gains or loses a route, the count made every block's row
different, so the same three numbers repeated block after block. With a
plain "+", neighbouring stretches whose rows would read the same are one
stretch, named once, and the list a tap opens names every route along it.
For the same reason every tier below every-30 is one look on the map, and a
route's drawn stretches (one per tier) are joined end to end before the
street is read, so a route going from hourly to rush-hours-only halfway
along a street does not cut the row there: on Wadsworth, "76 9" was four
rows before that and is one.
A label repeats every 400 px along a long stretch (about once a screen); a
short stretch gets one in its middle if it fits, and none if it doesn't.
Before zoom 13 only the routes every 30 minutes or better are named, as text
in the line; from 13, all of them, as pills. From 15, where the stops are
drawn, a row with a "+" is left out: the stops say what serves the street,
and these rows, on the downtown trunks, were the ones that repeated. This is
naming only. Each route is still drawn as its own line, with its own tier.

**Corridors by combined frequency are not built.** Where several routes share
a street and its stops, riders can take whichever comes first, so two routes
every 30 minutes, evenly spaced, are a frequent corridor to a rider. The
plan was to draw the shared stretch once, weighted by combined frequency,
counting only stops both routes serve. That is still open (see "Open
questions"); today the map draws each route by its own frequency.

### By zoom level

Each bus tier fades in over about a zoom level rather than popping on.

| Zoom | Shows | Also in Live |
|---|---|---|
| Below 9 (the overview: a phone's "Whole network") | District wash and relief. Rail, with each line's letter at both ends and nothing else on it. Frequent buses as lines, with no numbers. City names where they clear the lines. Main Interstate shields. No station marks, no FlexRide zones. | Alert marks on rail |
| 9–11.5 (phones open at about 10, laptops at about 9.4) | Station ticks and one number on each frequent bus, from 9. The letter at each rail line's end stays until 9.75. Every-30 buses from 9, drawn lighter until their tags arrive. From 9.75: rail letters along the lines, in place of the ones at the ends, and the names of stations where six or more routes meet. Hourly and less from 10.5. Stations are small ticks to 10.25; capsules from 11. From 11: every station's name, town names, FlexRide zones, Interstate spur and US highway shields, and part-time buses. | Train positions from 11, closed stations |
| 11.5–13 | Every-30 numbers, in shared-street labels knocked out of the line. Names now keep off every bus line, not only the frequent ones. Main street names from 12, beside the street, where no line crosses them. Park-n-Rides and transit centers from 12.5. | |
| 13–14.5 | Every route's number, as a row of pills, one per route, four at most and then a "+". Most main streets named from about 13.5. Closed stations, ring and name together, from 13. Landmarks from 14. City names are gone by 13.5, towns by 14.5. | Bus positions, alert marks on bus routes |
| 14.5 and up | Smaller streets. Bus stops are loaded from zoom 14, when first needed, and drawn from 15; from 15 the rows that end in "+" are gone, and the stops carry those streets. | Closed stops crossed out |
| 16 and up | Stop names, with the routes that serve each stop | Vehicles' route numbers |

### Symbols

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
  first, then bus numbers, then station names, then every other name. `meta.rail[].ends` still carries each line's end names,
  worded from the GTFS headsign without the line's own name ("W-Line Jeffco"
  becomes "Jeffco"), for the key and the Lines list.
- **Rail bullets** ride along each line from zoom 9.75, so a line can be
  named anywhere on screen, not only in the key. The build decides where
  (`lettersAlong` in `scripts/lib/sharedtrack.mjs`), once for each whole
  zoom from 10 to 16; the map shows the set for the zoom it is at (the
  zoom-10 set from 9.75, the zoom-16 set from 16 in).
  - A place for a letter comes up about every 100 px along each stretch of
    track.
  - Lines sharing the track take turns at those places: each goes to the
    line whose nearest letter is furthest away. So every line is named along
    track it shares, about every 100 px times the number of lines.
  - A line alone takes every other place (about every 200 px), so a line in
    open country (the N) isn't lettered three times in one screen.
  - Each letter moves along its line, up to a quarter of the way to the next
    place (half, if it must), to sit clear of stations (16 px) and of other
    letters (28 px). The map draws only one of two symbols that touch, so a
    letter placed on a station was a letter not drawn.
  - A line too short to have come up gets one letter mid-way along its
    longest stretch. So every line has a letter at every zoom
    (`test/sharedtrack.test.mjs`).
  - The letter sits on its own line, not on the middle of the track. The
    build gives each letter the side its line is drawn on (`sx`, `sy`, in
    line widths), and the map moves it there. On track four lines wide the
    gold G used to sit on the purple N.

  Letters are placed before station names, so lines keep their letters at
  middle zooms. Measured 2026-11-06: every line in view has a letter in the
  opening view of 360, 375, 390, 412 and 430 px phones and at zooms 9.8, 11,
  13 and 16 around downtown.
- **Not running** (at the time shown): a hairline in the lightest bus gray,
  with no tag, so the network keeps its shape without claiming service.
- **Vehicles** (Live): a small rounded arrow pointing where the vehicle is
  heading. Trains in their line's color with the letter; buses in ink, with
  the route number from zoom 16. A vehicle running late says so in its panel,
  not on the map.
- **Alert mark** (Live): a small triangle on the line's bullet or tag, or on
  the station. It's identified by shape, never by a color that could be a rail
  line. A closed stop or station is crossed out. The exact color is settled on
  screen.
- **Highway shields:** see "Basemap".
- **Transit centers:** a rounded square with a bus glyph. Never a "T", which
  reads as the T Line.
- **FlexRide:** a light diagonal hatch with a dashed edge, never green (green
  reads as a park).
- **Outside the district:** a gray wash that fades over about 1 km at the
  edge, instead of a hard-edged mask.

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
casing, main street names `#4F5B67`, outside the district a `#E3E7EA` wash.

**Type:** Overpass, a descendant of Highway Gothic, the US road-sign face.
Weights 400, 600 and 800, tabular numerals. Scale: 13, 15, 17, 22, 28 px.
The site serves the font itself (from the `@fontsource-variable/overpass`
package), with no request to Google. Map labels use Overpass too: the build
generates MapLibre glyph files from the same font (`scripts/glyphs.mjs`), so
the map and the interface share one typeface.

**Route bullets:** rail lines are a circle with the letter; bus routes are
the map's pill (see "Bus routes"): a rounded rectangle filled in the tier's
color for routes every 30 minutes or better, outlined in the slow tiers'
color for the rest. They are the only strongly colored elements in the
interface itself.

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
  frequent buses are the brightest and thickest (`#DCE6EF`, 13.7:1), then
  `#9FB1C3` (7.9:1), then `#687A8E` (3.9:1), with the same widths and the
  same dashes and dots as the light theme (12.3, 7.4 and 3.5:1).
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
  live mark and the time ("Live, 9:41 pm").
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

Phone: full-screen map, with search at the top and the key under it (Live
joins the key's row when it ships). A bottom sheet appears only when
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
   you at zoom 13.5 (every route number around you, and about a 20-minute
   walk each way), with your blue dot. The page never asks for your location
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
- **What each line is:** rail letters along the lines, and frequent bus
  numbers.
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
- Tap a route's tag or a rail letter: that line.
- Tap a shared-street label, "30 • 31" or a row of pills: a short list of
  those routes, every one along that stretch when the row ends in "+".
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

### The key

Always one tap away. The closed key is a button: its icon, the word "Key",
and the time the lines show ("Weekdays, 9am to 3pm"; later "Sunday, 9am to
3pm" or "Live, next 90 minutes"). The time is worded from `window` in
`meta.json`. Open, it lists:

- A one-line "An unofficial map of RTD buses and trains."
- **Buses:** the frequency tiers, each a swatch of the line itself. The two
  slowest share one row, "Every 31 min or more". There is no row for tier
  `none`.
- **Trains:** each rail line with its bullet, where it goes ("A to Airport"),
  and a "How often" column.
- **On the map:** Rail station; "Closed: no trains this week"; Park-n-Ride;
  Transit center; Bus stop, when zoomed in close; "FlexRide: book a ride in
  this area"; "Outside RTD's district". In Live this would include vehicles
  and the alert mark.
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
    14, and are drawn from 15. The shared-street labels (`busnames`) load
    from zoom 10.8, a little before the zoom that shows them.
  - `directory.json` (every route's ends, hours and stations) loads after
    the first draw, since it's only needed once something is tapped.
  - The schedule summary loads after the map first draws, and a route's
    timetable only when its panel opens. Live feeds are fetched only while
    Live is on (or a stop panel is open) and the tab is visible.
  - MapLibre and the Overpass font are served from the site itself: no extra
    connections to a CDN or Google before the map can start.
- **Offline:** after the first visit, a service worker keeps the page, the
  map data, and the schedule, so the full map, other times, and scheduled
  departures work with no signal (underground at Union Station, say). Live
  says it's offline. Basemap tiles already seen are kept up to a size cap.
- **Accessibility:** WCAG AA contrast for text, visible keyboard focus, every
  action reachable by keyboard, motion reduced when the user prefers it, and
  nothing identified by color alone.
- **Resilience:** if the live feed fails, the map still works and says live
  data is unavailable. If ArcGIS is down, the site uses the last built
  snapshot.

## Validation

Before calling a version done, five people who don't know the system each try
these tasks on a phone. Measure completion, time, and wrong answers, not
whether they like it.

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
                               │   /rt/{feed}     Pages Function relay
             checks pass? ─────┘                   └─> RTD GTFS-realtime
```

- Static site with no backend beyond the relay function and the refresh
  Worker. Live tiers are computed in the page from the schedule summary and
  the clock, so the server never does per-visitor work. The relay caches each
  feed at the edge for 10 seconds, so RTD sees a few requests a minute however
  many people have Live on.
- MapLibre GL JS for the map, plain ES modules, no framework. MapLibre
  rather than Leaflet because the basemap is vector tiles we restyle, shared
  track depends on `line-offset` (parallel lines a fixed pixel distance apart
  at every zoom), labels need collision handling, and WebGL keeps thousands
  of features smooth on phones. Version 6, which ships as ES modules (a main
  file and a worker, about 360 KB with brotli). Older versions are smaller
  but carry an unpatched attribution XSS (fixed in 6.4.1) and get no fixes.
  The page preloads the main module and starts the worker early.
- `npm run build` discovers, fetches, checks, and writes the data; `npm run
  dev` runs the site and relay locally with `wrangler pages dev`.
- Updates are automatic (see "Zero maintenance").

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
      Partly done: shared streets are named together, but lines are drawn per
      route, not by combined frequency (see "Open questions").
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
3. **Live and other times.** The schedule summary and per-route timetables
   in the build; the key's time choices; the Live button, with next-90-minute
   tiers, not-running hairlines, and the minute-by-minute refresh; the relay;
   vehicles, predictions, and alerts; scheduled departures in panels when
   Live is off or its feeds fail; returning visitors open as they left.
   *Done when:* at 9pm on a weekday, Live draws 5 frequent lines (or whatever
   the schedule says that night), every idle line says when it starts, and
   stopping the relay leaves a working map that says it's showing the
   schedule.
4. **From here, search, near me, shareable links, Directions.**
5. **Task testing** with five people; fix what fails.
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
   the deployment-failure email (Cloudflare dashboard, Notifications), making
   the repository public, offline caching, a domain.

## Open questions

- **Shared corridors by combined frequency (open):** shared streets are
  named together ("30 · 31"), but each route is still drawn by its own
  frequency, so two routes every 30 minutes that run evenly spaced on one
  street don't draw as a frequent corridor. Whether to draw them that way,
  and how evenly two routes must be spaced to count (two routes every 30
  minutes that leave a minute apart are not "every 15" to a rider), are
  unsettled.
- **Span:** should "Frequent" also require all-day service? A strict test
  (4 or more departures in every hour from 6am to 8pm) leaves only 4 routes:
  FreeRide, 15, 31, and SKIP. Even 15-minute rail fails it at the edges of
  the day. A span rule needs a looser window, or span could be shown
  separately.
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
- **Live window:** frequency over the next 90 minutes, and "not running" when
  nothing leaves within the next hour. Check both at the edges of the day
  (5am, midnight), where a line can flip between tiers each minute; it may
  need to hold its tier for a few minutes before changing.
- **Alert noise:** RTD posts many alerts. Draw marks only for alerts whose
  effect is no service, detour, reduced service, significant delays, or a
  moved stop, and list the rest in panels. Review a week of the feed before
  settling.
- **Vehicles at region zoom:** about 600 buses at once would cover the map,
  which is why buses start at neighborhood zoom. Whether trains should show
  from the opening zoom is settled on screen.
- **Remembering Live:** returning visitors get Live as they left it. If that
  surprises people in testing (opening at night to a mostly faint map), open
  on the full map and remember only where they were.
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

## Sources

- Guo, Z. (2011). Mind the map! The impact of transit maps on path choice in
  public transit. *Transportation Research Part A* 45(7).
  [Working paper](https://wagner.nyu.edu/files/faculty/publications/Mind_the_Map_Guo_Zhan_2010.pdf)
- Grison, Leprévost & Morgagni (2022). Do you believe in transit schematic
  maps? [Listing](https://timetableworld.com/?p=29315)
- Roberts & Rose (2016). Map-induced journey-planning biases for a simple
  network. [PDF](https://repository.essex.ac.uk/17832/1/Roberts_Rose_TRA_2017.pdf);
  Roberts, Gray & Lesnik (2017), preference versus performance.
  [PDF](https://repository.essex.ac.uk/17237/1/1-s2.0-S1071581916300751-main.pdf)
- Hochmair, Vienna route-choice experiment.
  [Summary](https://nextcity.org/urbanist-news/frequency-and-real-time-info-help-transit-riders-most)
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
  [2009](https://humantransit.org/2009/06/frequent-network-maps-an-obvious-idea-that-took-forever-to-happen.html)
  [PDF](https://ad-publications.informatik.uni-freiburg.de/SIGSPATIAL_transitmaps_2018.pdf)
