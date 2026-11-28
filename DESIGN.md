# RTD system map: design specification

> Current implementation: `main` deploys the five-sheet map. Smooth zoom is
> developed separately on `zoom-154-merge`. Classic is preserved on
> `classic-archive`; its older interface details below are historical or planned
> features, rather than a second deployed application. See
> [the development guide](docs/development.md).


This is the source of truth for what this site is, who it is for, and how it
should look and behave. Read it before changing the map, the interface, or the
data pipeline. When a decision changes, update this file and add a line to the
decision log at the bottom.

The deployed front page is the five sheets: four for the network at closer
scales and the whole district one step out from them ("Five sheets"). Old
`/classic/` links redirect to that page.
The smooth-zoom trial has its own branch and `/zoom/` entry point. Classic
details elsewhere below describe the archive or planned features.

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

When RTD edits its map or publishes a new schedule, nobody should have to
touch the code for routine changes: new or retired routes, a new rail line,
recolored lines, moved stops, new Park-n-Rides, a new runboard, or RTD
pointing its map at different services. The build draws them all from RTD's
data as it is. Since 2026-11-24 a person starts that build and looks at the
result before it goes live (Rule 2): a new map from RTD's data is where a
drawing fault first shows, and it is ours to fix before riders see it.

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

The file is `scripts/visual-fixes.json`, read by the sheet build. Each entry
must explain the visual fault and link its issue. A missing RTD id or changed
geometry fingerprint skips and reports it; malformed entries and conflicting
pins stop the build. The first supported entry pins a station name's side by
RTD station id. Its optional inclusive `zooms: { "from": ..., "to": ... }`
range covers every zoom between its ends; without one, the pin lasts the
label's whole life. A station id that more than one source feature carries is
ambiguous and skips like a missing one. `sheets.json` reports live and skipped
entries (`applied: false`: the build resolves pins but draws none of them). Applying
those pins to the zoomable map's lettering plan waits for #234 and #156;
until then the register stays empty and every cleanup is still a rule in the
build.

### Rule 2: we rebuild; Cloudflare only publishes

```
every hour   timer on our machine (refresh/watch.mjs)
               │  ask RTD: has anything changed?
               │  (Experience, web map and layer edit dates; GTFS file hash;
               │   the basemap's tile build)
               │  compare with /data/meta.json on the live site
               ▼
   changed?  ──yes──> one phone alert; nothing is rebuilt

when we choose   npm run build:data on our machine (download, checks, sheets,
                 loading pictures) ─> look at it ─> npm run deploy
                   └─> publish check, then wrangler uploads public/ to
                       Cloudflare Pages (from main: the live site)
```

- RTD changes its schedules three times a year (January, May, and late
  August or September), and republishes a feed or edits its map now and then
  in between. Each new map is built here, its pictures checked, and anything
  the new data draws badly fixed before it is committed. The alert says what
  changed and is sent once per change.
- The data is built here and uploaded, not committed (`public/data/`, with the
  loading pictures in `public/poster/`; `public/index.html` is committed).
  `npm run deploy` runs the publish check (`npm run build`,
  `scripts/publish-check.mjs`), which downloads nothing, and uploads
  `public/` to Cloudflare Pages with wrangler; a merge publishes nothing. It
  fails, and the live site stays as it is, when a file is missing or the built
  data was not made by the code going live: each build records a hash of the
  modules that made it (`scripts/lib/fingerprint.mjs`), the data build's in
  `meta.json` and the sheets' in `sheets.json`, and the loading pictures must
  show the current drawing. A change to the sheets or the page's drawing code
  needs only `npm run build:sheets` (redraw from the data on disk, new
  pictures), so a drawing fix doesn't bring in RTD's newer data with it.

- ArcGIS reports change dates directly: the Experience and web map items have
  `modified`, and each feature service has `editingInfo.lastEditDate`.
- RTD's GTFS download sends no `Last-Modified` or `ETag` header, but its bytes
  are identical between downloads. The checker downloads the file (about
  11 MB) and compares its SHA-256 hash with the last build's.
- `meta.json`, published with each build, records the version of every source
  the build used. The checker compares against it; the only state it keeps
  is which change it last alerted on.
- Live vehicle data needs none of this. It is always current.
- Until 2026-11-24 a Cloudflare Worker ran this check and called a Pages
  deploy hook, so Cloudflare rebuilt the whole map from RTD's data on every
  change and on every push (about 12 minutes each). See the decision log.

### Rule 3: a bad update never breaks the site

The build checks the data before it deploys:

- Every source downloaded and parsed.
- Counts are plausible: routes, stops, and stations are within a reasonable
  range of the live site's `meta.json`. A sudden drop to zero means a broken
  download, not a network change.
- At least 95% of ArcGIS routes match a GTFS route.
- Every rail line has a color.
- At least half of the map's stations have trains (see "Station service").

OpenStreetMap's shapes are checked the same way (#69). A station or hall whose
box OSM doesn't answer for (an error or a timeout) keeps the last good build's
shapes, roofs included: the committed data's, or on a checkout without it
the published site's. The count checks compare with the
same last good build. So OSM being down costs nothing, and a build fails when:

- OSM answers with much less than before: the stations' shapes (platforms,
  canopies, buildings, hall roofs) or the bus halls, above or below ground,
  fall by more than 30% or to none.
- OSM is down and there is no last build to fall back on either.

A smaller change, such as one station's platforms redrawn or removed in OSM,
is taken as a change in the place and drawn. The drills are in
`qa/drills/mock-fetch.mjs` (`DRILL=osm-down`, `osm-empty`, `osm-half`,
`osm-down-cold`).

If any check fails, the build fails and writes nothing, so there is nothing to
commit and the live site keeps the last good version. A temporary outage at
RTD means building again later. A failure that lasts means RTD changed
something structural, such as renaming fields or retiring the map.

Cloudflare's deployment-failure notification emails the owner when the
publish check refuses a push.

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

Built on today's sheets (2026-11-27, #13): a stop's and a station's card
show the next departures, live where RTD has a prediction and scheduled
otherwise (see "Departures", "Live times on a card"). Alerts in panels and
the vehicle panel are not built; the vehicle panel and alert marks on the
map wait for Live on the zoomable map (#251).

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

Built so far: routes, rail stations, Park-n-Rides and transit centers, and
bus stops (on the classic map 2026-11-06; on today's sheets 2026-11-27, #238).
Landmarks and street addresses are not built.

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

All data is public. The network, its schedules and its live trains come from
RTD. Two things come from OpenStreetMap:

- **The basemap** (streets, water, parks, place names), as OpenFreeMap's
  vector tiles, served by the site itself ("Basemap"). `npm run build:basemap`
  reads the district's tiles out of OpenFreeMap's weekly planet file (one
  PMTiles file anyone may download, read by range requests rather than tile by
  tile from its tile server), keeps only what the style draws at each zoom,
  and writes them gzipped to `basemap/` (about 34 MB, committed). It runs by
  hand, like the RTD data; every build unpacks it into `public/tiles/ground/`.
- **The shapes of stations**, read by the build from OpenStreetMap's map API
  (`api.openstreetmap.org/api/0.6/map`, a box around each station): rail
  platforms, the canopies over them and station buildings
  (`scripts/lib/structures.mjs`, "Stations"), and the halls of RTD's bus
  stations with their roofs (`scripts/lib/footprints.mjs`, "Terminals").
  Nothing about a station's shape is written down here: a station draws what
  OSM has, and one with nothing in OSM is drawn from RTD's data alone.

Nothing depends on a private key, a private server, or the departures project
on mini. The credit names both sources.

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
service. The peak rows are RTD's own periods, 6 to 9am and 3 to 6pm, and the
evening row is 7 to 10pm (`WINDOWS` in `scripts/lib/gtfs.mjs`; #22). Each is
measured as midday is (the typical gap, the bunching rule, the less frequent
direction), at the stop with the most departures in that window, since a
route's rush-hour trips may not pass its busiest midday stop. Rush-hour
service often runs one way only, in to the city in the morning and out in
the afternoon. Where only one direction comes twice or more in a window, the
row gives that direction's frequency and says "one direction"; a window with
one trip says "1 trip", and with none "No trips". These figures are in
`directory.json` only (`wk_am`, `wk_pm`, `wk_eve`, `wk_one`, and the hours
themselves in `windows`), so the drawings do not change.

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

### Departures: every stop's timetable, in small files

The build writes every stop's departures from the feed's `stop_times.txt`
to `data/departures/` (`scripts/lib/departures.mjs`; #13): one small file
per group of stops and an index, so a card fetches a few kilobytes, not the
timetable. A trip's last stop is not a departure, nor is a stop where it
only sets down; a stop where trips only end is marked, and its card says
"Trips end here". Each departure belongs to a pattern (the map's route, the
name on the bus, where it is headed, and the service it runs on), and the
index carries the feed's calendar and its exceptions and each rail station's
platforms. The page works out "next" itself for today's real date
(`public/js/panel/departures.js`): the services running today, and
yesterday's that run past midnight, in the timetable's own time zone
whatever the device is set to. So a holiday shows its own timetable, and
nothing is rebuilt each day. Measured on the November 2026 feed: 791,758
departures at 7,468 stops in 128 files, 2.8 MB in all and about 460 KB
compressed, the largest 58 KB; `qa/departures.mjs data` recounts every
stop from RTD's raw file by a second reading.

A card shows the next two departures for each route and destination within
three hours, soonest first, at most six rows, trains first at a station,
as clock times ("9:41pm"): a count of minutes is kept for RTD's live
predictions. It is headed "Next departures, scheduled" and redrawn each
half minute, so a bus that has left drops off. Stops in RTD's stops layer
that its timetable does not carry (64 in November 2026) say "RTD's
timetable lists no trips here".

The panel is its own code and reads nothing of the sheets; the sheets' page
only says which stop or station a card is for (`leaves` and
`showDepartures` in `public/js/sheets/main.js`).

**Live times on a card.** While a stop's or a station's card is open, the
page asks the relay for RTD's predictions for that card's stops, and only
those (`public/js/panel/live.js`; the relay's side is under "Live data").
There is no Live button on the sheets: an open card is what asks.

- A prediction takes the place of its own scheduled departure, matched by
  trip, and reads as minutes ("4 min", "Now") with the live mark, the amber
  dot of "Visual tokens". From an hour away it reads as a clock time, still
  marked. A scheduled time stays a clock time with no mark. So a late bus
  stays on the card past its scheduled time, and one that left early drops
  off.
- A call RTD marks skipped, or a cancelled trip, is left out: its scheduled
  time would be wrong.
- The card always says which kind it shows. With any live time its heading
  is "Next departures, live" and a line under the rows says "Minutes are
  RTD's live predictions. Clock times are scheduled." With none it is "Next
  departures, scheduled".
- Nothing stale is shown as live. Predictions count as live only while the
  relay has answered in the last 50 seconds, RTD's feed could be read, and
  the feed's own time is under two minutes old (`fresh` in `live.js`).
  Otherwise the card is the timetable, and after 20 seconds without live
  times, or at once when the relay says RTD's feed failed, it adds "Live
  times aren't loading. These are scheduled."
- A relay that knows nothing of predictions, or no relay, leaves the
  timetable: the page works with either.

To match by trip the build keeps each departure's trip id beside its time,
in files of their own (`data/departures/trips-N.json`, about 1.7 MB
compressed in all, 13 KB a file) that only a page showing live times reads.
A trip's id is stored as its distance from the smallest id
(`index.tripBase`). The same trip runs every weekday, so a prediction
belongs to the departure of its trip scheduled within 90 minutes of it.
Measured 2026-11-27: RTD's TripUpdate feed held 375 trips, all in the
timetable, at 5,571 stops, with absolute times and no delays, and marked
159 calls skipped.

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
| TripUpdate | Predicted departures in stop and station panels (built 2026-11-27, below), and how late a vehicle is |
| Alerts | Alert marks on the map, and alert text in panels |

**Predictions for a card's stops.** A page with only a stop's or a
station's card open connects as a card (`/live/stream?for=card`) and says
which stops it shows (`{"watch": [...]}`, at most 40). It is sent those
stops' predictions and nothing else (`kind: "stops"`): each call's trip,
time and route, and the trips RTD says will skip the stop. It is not sent
the vehicles. The object asks RTD for `TripUpdate.pb` only while some card
is watching a stop, at most once a poll, and reads it into memory, not
storage (it is 340 KB). A feed it cannot read is said (`problem`), never
sent as empty predictions. An empty watch list means the card closed; when
no card watches and nobody has Live on, polling stops as before. Vehicle
positions are asked for only while someone has Live on, not for cards.

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
the place (#64). Geometry edits still need an applying build pass; the
register's first supported override is a station-name pin.

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
  90th percentile, an hour over it (`rate`). The class is read from that
  wait rounded to whole minutes, the number the street's panel shows
  (`classOf`), so a 15-minute route whose stop times come out a few seconds
  over 15 is still "every 11 to 15". So the wait the map promises
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
  went stops short of the road it led onto). Each pass that merges a divided
  road's two ways into one centre builds the graph again from RTD's pieces,
  so the graph is tidied again after every pass: a terminal loop a pass
  brings back is made a short end too (#102; the 120's loop at Eastlake /
  124th had come back as a spike).
- A street with only part-time routes is drawn from the graph too, as their
  dashed or dotted line (`n: 0`, `tier`), so it meets the streets it joins
  and moves with a divided road.

*Route accuracy* (`qa/accuracy.mjs`, `npm run check:accuracy`; #117): every
sheet's bus lines are checked against both of RTD's sources, its route layer
(the lines the sheets are drawn from) and its GTFS trip shapes. The two agree
to a metre (p99) for every route, so a difference between the map and either
is the map's. For each sheet the check reports pieces carrying a route on a
street it doesn't take, stretches of a route with no line carrying it, and how
far lines sit from their route, and fails on any fault. "Near" on a sheet is
what it draws as one street: the fold distance (`busMerge`) plus a street's
width plus 30 m. What a sheet may leave off or draw simpler, by design:
- a loop, ramp or divided road the street graph draws simpler (above), within
  250 m of the route's own street, on every sheet;
- a short end that leads nowhere, with a terminal loop too small to read as a
  ring drawn as the point where it meets its street, only while it is both
  under 25 px (a loop under 24 px across) and under 250 m on the ground
  (`busEndKeep`): a rider must see where the bus goes, so on sheets 1 and 2
  an end of 250 m or more is drawn however few pixels it is, and a ring is
  gathered to a point only while half round it is under 250 m. An end whose
  loop was drawn simpler is kept when a stop of its routes is within 320 m
  plus 250 m of it;
- a route's end led to its station's mark (within 110 m);
- two ways round a strip drawn as one street only where the way not drawn
  lies within the street drawn (the fold distance plus a street's width): a
  route is never drawn on another real street, even if keeping it on its
  own adds a small jog;
- a divided road drawn down its middle, and corners rounded within the fold
  distance. On sheet 4, 67% of drawn route lies on its street (within half
  its drawn width), 31% down the middle of a divided road and 2% rounded.
Anything else is a fault and is fixed at its cause, not allowed for here.

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
the map and the interface share one typeface. Of general punctuation they
hold only what a label can use (spaces, dashes, quotes, the bullet, the
ellipsis and a few more); the canvas would draw the rest from another font.

**Route bullets:** rail lines are a circle with the letter; bus routes are a
pill, a rounded rectangle filled in the tier's color for routes every 30
minutes or better, outlined in the slow tiers' color for the rest. They are
the only strongly colored elements in the interface itself.

### Dark mode

The Classic map follows the system setting (`prefers-color-scheme`). The
sheets start with that setting too, and have a 44 px circular sun/moon button
in the lower-right corner. It switches the map and interface together and
remembers the reader's choice locally. Until a choice is made, system changes
recolour the open map. Theme changes preserve the view, card and picked route.
A saved choice is applied before paint, including to the loading placeholder.
The button has a stable accessible name, “Dark mode”, and reports its pressed
state; its icon and tooltip show the mode a tap will choose.

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

## Five sheets

The site's front page and its only map: RTD's data drawn as fixed sheets, built to be
finished before it is clever. Think of five printed maps of the district, each drawn
for one scale on a phone, each complete: every rail line and every bus route
is on every sheet. The page rests only on a sheet. A scroll or a pinch goes
to the next sheet the way it was heading, however short it was (a tenth of
a zoom level by wheel, a quarter by pinch, so two fingers dragging the map
do not change it); carried more than a third of the way past that sheet it
goes on to the one after. The move is counted from where the reader's zoom
began, not from the sheet shown, so a second scroll that catches the map on
its way to a sheet carries on to that sheet and never sends it back. Issue
#117 holds the work. At a fixed sheet zoom, panning moves the drawing without
repositioning, shortening or hiding its labels to fit the screen. Names may
be cropped by the viewport, as on a printed map. Zooming selects another
built drawing; choosing a route may select its built name alternatives.

The sheets are `public/index.html`, the only deployed application. Classic is
preserved on `classic-archive` at commit
`811135ffe4230f598082667c7fda20994d1bd97d`; its source page remains at
`public/classic/index.html` on that branch. Main redirects `/classic/` and
`/classic/*` to `/`, preserving view fragments. The current page asks for
files from the site's root, including at addresses the host answers with it.

`main` holds the current sheets. Smooth-zoom work stays on
`zoom-154-merge`, in its own worktree and `/zoom/` preview, until reviewed.
Shared/current-map fixes land on main first and then merge into that branch.
See `docs/development.md` for the workflow and separate verification commands.
`npm run check` exercises the sheets. Historical browser checks and renderer
fixtures live outside `public/`, under `qa/classic/`; the frozen-build recall
suite still checks the original historical drawings.

| Sheet | Zoom | What it adds |
|---|---|---|
| 0 | 8.75 | The whole district on one screen: every rail line and bus street, the hub and each line's far end named, the towns in RTD's district. |
| 1 | 10 | The network: rail lines whole, every bus street by how often a bus comes, the hub and line ends named. Tap a line for its routes. |
| 2 | 12 | Every station named, route numbers along bus streets. |
| 3 | 14 | Divided roads as one line, one-way pairs on their own streets, names of the main streets. |
| 4 | 16 | Every stop, buildings, platforms apart from each other. |

**The whole district** (#152). Sheet 0 is one step out from sheet 1, where
the page still opens: the whole rail network on one screen, with the bus
streets, towns and freeways round it. It is drawn at zoom 8.75, where the
rail network with its names (0.53° of longitude across) fills a phone's
width from 360 px. It is the one sheet that does not always rest at the zoom
it is drawn at: a phone is narrower than the network is tall, and a desktop
is wider, so one zoom left the network small on one or the other. It rests
as close as fits its frame (below) in the screen above the sheet buttons,
44 px clear at the sides, where frequent lines end in a town whose name,
centred on its point, needs the room (Boulder), and 16 px above and below,
never farther out than 8.5 (a phone in Safari, its bars taking a quarter of
its height, rests a little under 8.75 to show it all) and never past the
point where sheet 1's band begins (`edge`, halfway between the two sheets'
zooms, less 0.05). A 402 px phone rests at about 8.8 on its whole screen and about 8.7 in Safari; a desktop or a tablet
stops at about 9.33 with room round the network. A turned phone or a
resized window rests again for its new screen. It is the same procedure as
the other sheets, with these differences, all set in `SIZES` and the page's
tables:

- Stepping out to it by button, pinch or scroll frames the network,
  wherever the reader was: side to side, the frequent bus network (streets
  every 15 minutes or better), from Boulder to Parker; top to bottom, that
  network and the rail lines, stations, letters, names and bus streets
  within it (`wholeFrame`; the build writes it as `frame` in `sheets.json`),
  so a town between its sides served by hourly buses (Longmont) is in. The
  hourly bus streets out past its sides are left out: a few reach far past
  the rest (Nederland), and framing them left the network small. A town's
  name that would run off the screen there is left off until the reader
  pans it into room (`townsOnScreen`, main.js): Parker sits at the frame's
  corner, and its name was cut in half. The A line runs on past the
  frame's east side to the airport, off the screen on a phone: its far
  end's name is set on one row by the line where it goes off a phone's
  screen (`namePointer.reach`, 14 px past the frame's side, inside the
  32 px the page keeps there), on the frame's side of it, with an arrow
  after it turned toward the end itself ("Denver Airport →"). The font has
  no arrows, so the page draws it (`pointer-arrow`, main.js), held to the
  name in pixels like its letters and inked like it. On a desktop, where
  the end is on screen, the arrow points across to it. The +
  button goes back to where the reader was, unless they moved the map on
  sheet 0. A link that names a view on sheet 0 keeps its own centre. Its
  address is written at the zoom the sheet is drawn at (`#8.75/…`), so a
  link opens the same sheet on any screen. The network is centred on the
  whole screen, side to side and top to bottom, and lifted only as far as
  keeps it 16 px clear of the sheet buttons; a phone on its side, too short
  for the network at zoom 8.75, centres it in the screen above them and
  crops it evenly top and bottom. A turned phone or a resized window frames
  it again, unless the reader has moved the map.
- Only on sheet 0 can the reader pan half a screen past the routes' margin:
  a phone held upright is taller than that margin at this zoom, and MapLibre
  raises the zoom of a screen larger than its bounds. Back on the other
  sheets the bounds are the routes' margin again, the ones the loading
  picture is placed by.
- The letters under a name are held to the name in pixels, at its station
  (`held`, `px`, `em`), and drawn as a disc image the page inks with the
  line's colour (`letter-chip`). A letter set on the ground, as on the other
  sheets, drifts off its name once the sheet rests closer than it is drawn.
- It names the hub and each line's far end only: of the stations a line ends
  at, the one farthest from the hub (`nameFar`). A far end within
  `nameHubClear` (60 px) of the hub is left unnamed: the B and G lines end
  so near Union Station that their names stacked against its own, and one
  step in names them. Such a line's letter goes on the hub's name, since
  it ends there too (the B). Every far end's name carries its lines' letters in a
  row, since no letter fits on the lines at this scale; a line's letter is
  set on the line only where its far end goes unnamed. A name costs
  `nameSpill` for each pixel it reaches past the rail network's lines and
  stations, so names turn inward and the network fits the phone's width:
  Golden's name sits under its station on two rows, not 170 px west of it. Every place round
  the hub is nearer some other station than the hub at this scale, so a
  name's cost there grows with how much nearer (`nameStray` a pixel), and
  the hub's name stands where it reads as the hub's. A name set where its
  line leaves the frame pays no such cost: it names no station there.
- It names only the towns inside RTD's district, so Greeley and Loveland
  are not lettered over a map that doesn't reach them. The district is RTD's
  boundary layer turned from its mask into the cut-outs, with the places
  inside them that are not in the district as holes, simplified to 250 m
  (`districtShape`, about 10 KB in `sheets.json`). A town's name may stand
  to a side of its point, so Lakewood and Thornton find room between the
  lines. Denver and Aurora have none at this scale: their points sit among
  the lines, and Union Station names the centre.
- As on sheet 1, the quiet bus step is a hairline and the ground draws only
  freeways.

`qa/wholecheck.mjs <base>` checks it in a browser: framed on screens from
360 px wide to a desktop, resting where MapLibre's own fit of the frame
(32 px at the sides, 16 above and below) puts
it (and again when a phone is turned), centred to 2 px, every name and held letter the build
set drawn, towns only from the
district, + back to where the reader was, stepping out from the network's
far corners, links and their addresses, a wheel and a pinch, a tap and a
pick, the bounds put back on sheet 1, and the labels a screen reader hears.
At zoom 8.75 a pixel is about 140 m, and `npm run check:accuracy` finds bus
routes there a few pixels off their street, where streets closer than
`busMerge` are drawn as one; the other sheets are unchanged.

**Tap a route to highlight it** (#118). A tap on a street, its route numbers,
a line letter, a rail line, a station or a stop opens the card, which lists
each route there as a button. A tap on a line or a street that has only one
route picks that route at once and opens its own small card, since there is
nothing to choose between; a station or a stop keeps its own card. Picking one draws that route whole and every
other street and line faded; the same button, or a tap on empty ground,
clears it. A picked bus route is one ink and one weight from end to end (the
sheet's rail width, near-black in the light, near-white in the dark, no rail
line's hue) on a rim of ground, so it reads as one line however many streets
it takes; its stops are ringed over it on sheet 4, and place names step off
it rather than cut it. It is drawn from the route's own line on each sheet,
which the build composes from the street pieces the route takes
(`scripts/lib/routeline.mjs`): pieces whose ends meet are joined, gaps up to
`SIZES.pickBridge` closed, the main path taken end to end, a second street
kept only where it stands more than `SIZES.pickApart` off the main path (so a
one-way pair the sheet can't tell apart is one line, and an end loop stays),
dead ends shorter than `SIZES.pickStub` dropped, and every path smoothed over
`SIZES.pickSmooth` px, so a jog between near streets is a bend, not a stair
step, with round ends. The smoothing moves the line off its street by under
a line's width; check:accuracy measures the street pieces, which stay true,
and the smoothing is the only tolerance the picked line gets. No station
name sits on a picked bus route: where a route runs under a name, the build
gives the name (and its row of line letters) a second place off that route,
which shows only while that route is picked; where there is no such place
that reads as its own station's, the picked line runs on under a tight halo
round the lettering, and the name's row of line letters steps aside while
that route is picked, so the line reads unbroken and the name printed over
it. A picked route's card is two short lines: its number's chip and RTD's
name for it, then its two ends and how often it runs, all from the directory
(`pickCard`). While a route is picked, other lines' letters on their lines
are not drawn, since one on shared track would sit on the picked line; the
small letters beside station names stay. A picked rail line keeps its
own colour and its stations' bars; the other stations fade, and only half as
far while a bus is picked, so the places a bus passes still read. What is
faded is inked nearer the ground, not made see-through, so overlapping
pieces show no darker knots. Ground, streets' names and place names stay as
they are. The pick is MapLibre global state (`bus`, `rail`) that each sheet's
layers read, so it holds on every sheet and through zooms with no tile made
again (`public/js/sheets/style.js`, `pick.js`).

How it is built:

- **One procedure, run once per sheet.** `scripts/lib/sheets.mjs` draws a
  sheet from the build's own files (`routes`, `streets`, `stations`) and
  writes `sheet-<n>.geojson`. Its rules are sizes in phone pixels, so the same
  rule gives a different drawing at each scale. No rule names a place, a
  line or a sheet.
- **The build decides where things go; the page only inks them.** Rail pieces
  are joined into whole lines and set side by side; a station is one white bar
  across the lines that stop there; each line's letter sits where the line
  runs alone, or among its neighbours where it shares track for a long way;
  each station's name goes on the clearest side of its mark. A second track
  of the same line is not drawn, the shared track is rounded before lines are
  set beside it so a pack turns as one (lines on one track share one rounded
  track, and a line leaves it at the fork, not before), and a line ends square at its last
  station. A bend that moves the track less than about two thirds of a
  line's width (a line and its gap) is too small to draw on that sheet: the
  track is drawn straight through it, the station bars with it, and it
  arrives at its end the way it was heading. A turn that moves it further
  keeps its place, so the same S-bend that is gone on sheet 1 is drawn on
  sheet 2. Where a line at the side of a pack ends, it just stops: the lines
  beside it carry straight on in the places they had, until the lines on
  their track next change. They do not move over to the middle of the track
  as they do on the main map. Where a line in the middle of a pack ends, the
  lines either side close up. Track that runs on past a station no farther than a walk (600 m),
  with none of the line's stations beyond it, is tail track: the line ends
  at that station's bar. A line never ends at a station while another of
  its stations lies beyond, however little track is left. On the first sheet the hub and line ends are named large and other
  stations small, where a name has open ground.
- **Drawn, not traced.** Where the true position of a thing makes an ugly
  drawing, the drawing wins by a few pixels. A station bar is square across
  its lines. The platforms of one station where lines end are drawn parallel,
  and each ending line is led into its bar in a smooth curve so it arrives
  square. The curve never reaches back to the line's station before: there
  the line is where its track is, under that station's bar. Lines that end at one bar coming in from either side meet back to
  back on it, each set centred: that bar is drawn about half again as thick,
  with a thin divider down its middle, so the sets read as one station's two
  platforms and not as lines running through. Where two or more lines end
  together at a bar, no letter can sit on a line near it, so the station's
  name carries their letters in a small row beneath it: each side's lines
  together, by letter, the side with the first letter leading (a list, read
  as one, not the order the lines lie across the bar); a bar far from the station's first is named again with
  its own lines, and a near one puts its letters on the first name. A hall
  long enough is lettered down its length with what it is ("Bus concourse"
  where the data says underground, "Bus station" otherwise), and street
  names give way to it. From sheet 3 a bus station that is not a rail
  station's (Civic Center, Downtown Boulder) is named beside its hall, as a
  station is, on whichever side has room once the route numbers are
  placed. A place the ground map names the same as a station
  is not lettered twice. Places are named by rank: cities and towns on
  sheets 1 and 2, a city's neighbourhoods on 3 and 4 (its own statistical
  neighbourhoods before smaller ones), the most important first. A place's
  name gives way to rail, line letters and station names, but not to bus
  streets: it sits over them on its halo, and route numbers give way to it.
  The largest cities (Denver, Boulder, Aurora by the tiles' rank) are set a
  size up and a step clearer than the busiest bus street. A register entry
  ("... Historic District") is not a place name and is not set.
  From sheet 3 a bus street is named from its stops: the street most of
  the stops its routes serve along it give (RTD names a stop "Colfax Ave &
  Hudson St"; a stop that leaves the kind off, "Colfax & Elati", counts for
  the same street, and the name is set in its full form, so a sheet names a
  street one way), set beside the street like its route list, in a quieter
  grey, on a stretch no list is on, about once a screen (on sheet 4 a little
  more often than a phone is wide, so a street across the screen is named
  on it). Where a list's block holds both, the street's name leads the list
  ("Colfax  15, 15L"), the name in the names' grey; otherwise the name takes
  a stretch of its own, half a line of type clear of any list, sliding along
  its street to the nearest stretch between stop rings (which keep lettering
  off them) and inside one of the page's tiles (MapLibre may drop a label
  across a tile's edge). Route lists are placed first, and a list a name
  leads stays in its block, so a name never costs one. The streets between bus streets
  keep the ground map's names, shortened ("W 13th Ave"), on the centreline,
  at about 3:1. A ground-map name for a street one of our labels names on
  the screen (a bus street's name, a list it leads, a picked route's label)
  is hidden while that label shows, so a street is not named twice. Lines that end over a bus station's hall end at the
  wall they come in through, with their bar on it, not at a point inside the
  room. A corner of bus streets beside a hall's wall sits on the wall. A
  street's weight is its own buses'. Where streets gather into one (a
  street with more routes than a street it meets, every one of that
  street's among them, when those buses have no other street to take at
  the corner), the one they make is no lighter than any of them; each is
  judged by its own weight, so a weight is never handed on down a route
  from street to street. A stop whose
  ring would sit half under a rail line is not ringed. The two halves of a divided road are one straight line down the
  middle. A short break in a bus street between two ends that share a route
  is bridged. A line weight holds for a few blocks: a short stretch takes the
  weight of the longer stretch of the same routes it runs into, so one
  service is never dashes of different weights. Where the list of routes
  changes the service does, and a short stretch is never drawn heavier than
  its own buses by a street of other routes: a heavy street does not run on
  past the corner its routes turn at. (A tick a few pixels long may lose
  its weight to the pale street it ends, and a blip between two stretches
  that agree takes theirs.) A run a tick long (under 14 px) that leaves a
  street at least as wide and ends at a fork of streets all drawn at most
  half its width takes the weight of the widest of them: on the opening
  sheet, where the quiet step is a hairline, a frequent piece between a
  corridor's corner and a fork of hourly streets read as a stub ending in
  nothing; now the corner reads as the fork it is. A short end that leads nowhere (under 25 px from its
  loose end to the first corner where streets part, however many pieces it
  is in, and under 250 m) is left off; this is the one thing not drawn.
  A turnaround loop too small to read as a ring is drawn as the point where
  its streets meet, and a street that runs straight through that point
  stays straight: the point is on it, not beside it. A turnaround drawn as
  a loop too slim to see into is one street out to its far end. Its way out
  and way back are paired by nearness, not by distance along each, so a way
  back that wanders a little longer still lies on the way out; the loop
  opens only where the two lie six pixels apart for more than eighteen, and
  a shorter bulge is drawn through.
  A street whose loose end stops a short walk (110 m) from a rail
  station's mark, heading for it, is led on to the mark: a route that turns
  round at a station ends at the station, not in the open beside it.
  An end at a bus station's hall is not led on: that is where its buses go.
  A last stop behind a line's end (more than 100° round from the way the
  line ends, where the line ran on past it round a loop drawn simpler) is
  not led back to, which would double the line back on itself: the line is
  cut to end level with the stop, and an end already on its mark is not led
  on to the next stop.
  A station name written "A/B" or "A @ B" is set as "A / B" on two lines.
  Where a full name would sit on lines or stand off from its mark, common
  words take their usual short forms ("Stn", "Ave", "Ctr", "Jct") if the
  shorter name sits better; a name with room is written out. A name beside
  its bar is level with it, the letters of lines that end there hanging
  below. A name is never nearer another station's bar than its own, and
  never level with another bar close by (or in line above or below it)
  unless it is level or in line with its own: it
  moves, is set in one row, or (where not every station is named) is left
  off. A name that cannot sit right beside its bar stands off only as far
  as it must, in small steps. Where every line at a bar ends and the station before stands closer
  than the name is tall, the name goes beyond the end of the line, the way
  the line was heading: beside the bar it would stand beside that station
  too.
  `public/js/sheets/style.js` is a table of colours and widths per sheet.
  The build's six bus classes are drawn as three steps: a bus every 10
  minutes or better, every 15, and every 30 or less often (more steps than
  three don't read as steps). A street with a bus every 10 minutes is as
  wide as the sheet's rail, never wider: wider bands made downtown, where
  every street is frequent, a heavy mat. The very busiest, a bus every
  5 minutes or better (the build's two top classes: Colfax, the 16th Street
  shuttle, and a few downtown blocks where many routes share a street), are
  a size up on sheets 1 to 3: 1.3 times rail's width, band and spine with
  them. They are a few streets, not a district (about an eighth of the bus
  ink downtown on sheet 3), so they read as the spine without making the
  mat. Sheet 4 keeps them at rail's width, under a stop's ring.
  Bus streets are one blue, in the hue RTD's rail colours leave free: the
  middle of the widest gap their hues leave round the OKLCh colour wheel
  (greys don't count), worked out by the page from the line colours in
  `sheets.json`, so a new line colour moves the blue with no change here.
  Today it is about 265°, at least 38° from every line. The steps are
  lighter and a little stronger in the dark, darker in the light (OKLCh
  lightness and chroma per step in `PALETTES`). A frequent street (a bus
  every 15 minutes or better) is a tint: a pale band of the blue at the
  street's width, laid over the ground as a mixed colour (not see-through,
  so crossings show no knot), with a spine of the step's ink down the
  middle, 0.42 of the band's width (0.45 for a bus every 15 minutes, whose
  band is paler). A quiet street is a plain line in its ink. Each step
  stands at least a quarter again above the one below in contrast with the
  ground, so 15, 10 and 5 minutes read in order. The quiet step is the
  sheet's rail width over 1.6 twice, and on the opening sheet a one-pixel
  hairline, nearer the ground: there it is the whole outer street grid, and
  the sheet's job is where service is frequent, so the grid sits back. The
  middle step is rail's width over 1.4. The quietest reads clearly in both
  themes (in the dark, where a thin line of light reads faint, more so).
  Rail reads first by its colour and width: every rail line has at least
  10% more contrast with the ground than the busiest band, and the spine
  is under half a band, thinner than any rail line. Rail's own inks are
  set as before, at least 15% above the contrast the busiest bus street
  had when bus streets were grey (`railFloor`).
  The page takes each line's colour from RTD's data (the build lists them
  in `sheets.json`) and, where one is too dim for that, lifts it in the dark
  (lighter, same hue, keeping its share of the most chroma that hue can
  have, so deep red lifts to a bright red, not salmon) or, in the light, darkens it by at most a shade; a
  colour that would need more (lime, gold, orange, sky blue on cream) keeps
  RTD's colour and gets a thin casing of itself, darker. Pure white is for
  station marks. A stop's ring on sheet 4 is wider than the busiest street.
  A bus line never ends in the open. Where it ends (no other street, rail
  station or bus station's hall meets it) and a stop of one of its routes is
  within 320 m, it is led on to that stop and ends on a ring there: ground
  inside, in the line's own ink, a little wider than the line. Lines that
  end at one stop, or at stops a ring's width apart (gates either side of a
  highway), share one ring. An end with none of its stops that near is a
  spur in the data, and the run back to the street it leaves is not drawn
  when it is shorter than 1.6 km. Sheet 4 draws every stop, so its lines
  already end on one.
- **The express** (the Flatiron Flyer, FF) is drawn in rose. Which routes
  get it follows RTD's route category: the routes in the service category
  RTD files the FF under in its routes layer, read by the build
  (`expressRoutes` and `EXPRESS_CATEGORY` in `scripts/lib/sheets.mjs`),
  never a list of routes. Today that is the FF alone; the 15 and 15L and
  RTD's regional routes stay regular buses. The map calls it an express
  (Chris), never by RTD's category name. A street the FF runs on is marked
  `express` and drawn exactly as any bus street of its frequency (the same
  band and spine, or plain line on a quieter stretch, the same widths,
  steps and order among the buses, the same end ring), with only the hue
  changed: rose (OKLCh hue 355°) in place of the blue, at the same
  lightness and chroma. No casing and no station dots: it is a bus, not a
  rail line (Chris: a rail-like drawing "looks too much like a rail line,
  and not like the 15"). The rose is at least 30° from every rail hue
  (clear of the purple N and E lines and the red T line, never red), and
  rail stands above its band as above the blue's. It fades with the bus
  streets when another route is picked; a tap says "Express" on the card.
  Two marks say it is special: where it runs often, a thin pale dashed line
  down its spine, highway style; and along it, every 160 to 320 px by
  sheet, a small slanted shield (a lozenge) in its rose on a rim of ground,
  carrying the route's name from RTD's data ("FF"). A quiet stretch keeps
  the plain line, so it never looks more frequent than it is.
- **Airport buses** are drawn the same way in indigo, with a plane. Which
  routes follows RTD's route category for its airport buses (SkyRide, read
  by the build: `airportRoutes` and `AIRPORT_CATEGORY` in
  `scripts/lib/sheets.mjs`), never a list; today that is the AB and AT.
  Their streets are marked `airport` and drawn as any bus street of their
  frequency in indigo (OKLCh hue 278°, `AIRPORT` in `style.js`): between the
  bus blue and the E Line's purple, a little stronger than the blue so the
  colour shows on a quiet line, and lifted a little lighter so it tells
  from the E Line in the light theme. Never light blue: that is the A Line,
  the airport train. Where it runs often it gets the same dashed spine as
  the express; along it, a small plane seen from above, nose along the line,
  on a disc of ground. Where an airport bus shares a street with the
  express, the street stays rose. A tap says "Airport bus", never RTD's
  category name. The shields and planes are placed before the labels, so
  labels and stop names keep clear of them, and they never stack.
- **Every route is drawn.** A bus street too short to read at a sheet's scale
  takes the weight of the street it joins; none is dropped for tidiness.
  Streets too close to tell apart at a sheet's scale are drawn as one street
  that carries the routes of both, only along the stretch where they run
  together: where one turns away, the other goes on with its own routes
  alone (Chris saw the AT drawn far down a street it never takes).
  `test/sheets.test.mjs` holds the rules.
- **Bus stations are rooms.** Where buses go indoors (the halls in
  `terminals.geojson`) RTD's route lines stop at the door. A hall at least
  five pixels wide on a sheet is drawn as a quiet filled shape, a shade off
  both the ground and the buildings round it in either theme, edged in a
  line that reads against it, under the streets and stops. The stops the build
  counted as the station's are not ringed, nor are stops only trains call at:
  the hall and the bar stand for them. Its shape is a squared room:
  the tightest rectangle round the surveyed outline, along its own lie,
  brought in until it covers the same ground. A street whose loose end is
  within ten pixels of a hall's wall is drawn onto the wall without
  the wander or gentle hook of its last few yards: it carries straight on
  to the wall, or turns square onto it, whichever bends it less. No street
  is drawn inside a hall:
  one that runs in stops at the wall, and one that runs on through the room
  is cut at both walls, so the room reads whole. A street that only clips a
  corner or edge of a hall (less than ten pixels of it inside) stays as it is.
- **More fudges for a clean bus drawing.** A loose end with a street of the
  same route a short walk away (110 m) is led to it, so a turnaround is a
  closed shape. Where two ways between the same corners enclose a strip
  under six pixels wide, the quietest side is not drawn and the sides drawn
  beside it carry its routes: a route that leaves a street and rejoins it a
  block later is no longer a notch. A short side that only crosses the strip
  runs beside none, so its routes go on from its corners and are never drawn
  round the strip. A short stretch takes the weight of the busier longer
  street it runs into, not merely the longer one.
- **Streets meet at corners.** Before any of those rules run, every place
  two streets meet is made a corner both share: where one ends on the
  middle of another, where two cross, and where an end stops within a few
  pixels of a street (the end is led onto the street; the street does not
  bend to it). Rings, strips and stubs are then judged between real
  corners. A strip is thin when its area over its length is under six
  pixels and it is at least three times as long as wide, so a small square
  block between streets that carry on past it is kept. Of a strip's sides
  the quietest goes, then one no street runs straight through. Two streets
  side by side tied by short links are one street. The same street said
  twice between two corners is drawn once. Where a street's two halves come
  into a cross street at corners a few pixels apart (under three slim
  widths), carry straight on across from each other, share a route and are
  at least as busy as the cross street between, the corners are one, half
  way: the link is not drawn and each half runs straight into it, without
  the hook of its last stretch. Along a street that nothing else meets, a stretch
  a class apart from the rest and shorter than a ring (32 pixels) takes the
  weight of the longer stretch beside it; a longer one is a real change of
  service and stays.
  A street that carries straight on through its corners and strays no more
  than two and a half pixels from a straight line is drawn on that line,
  its corners with it, and the streets that meet it there move their ends
  the same few pixels: no gentle bend either side of a cross street. A real
  bend strays farther and stays. The longest streets are set first.
  Where a street turns at a corner, the two pieces that carry on most nearly
  straight are rounded into each other over a few pixels (3 on sheet 1 up to
  9 on sheet 4), as a pen would take the turn, and a third street meeting
  them there ends on the curve; each street's own bends are smoothed over
  half that, so a curve has no facets. A street that carries straight on, or
  a corner where four or more meet, is left.
  Where two streets run between the same two corners and one bows well out
  past the other (a turnaround, out one way and back the other), the bow is
  drawn as one smooth curve that leaves each corner the way the street does
  and reaches as far out as it did: the route data along it bulges and
  pinches. The bow gives way to rail: where it would run against a line or a
  station's bar it is drawn tighter, down to half its reach, until it stands
  a line's width clear. The curve only smooths the street: it is drawn only
  where it stays within a street's width of it all the way, both ways. A
  loop round blocks is not a bow and keeps its own path, unless its own path
  runs against rail: rail is drawn wider than its track, so a turnaround
  beside a station is covered by it. Then the loop is drawn as the widest
  sweep that stands clear of the rail, or the one that stands clearest, as
  long as it stays within that clearance of the street. Its stops follow it.
  At Union Station's light rail this draws the 15 and FreeRide loop beside the
  E Line on sheet 4 and slims it to the concourse on sheet 3.
- **A stop's ring sits on its street.** The streets are drawn, not traced,
  so a stop at its true place can sit beside its line or between two. Each
  ring is moved to the nearest point of the nearest street, within two
  merge-widths or 100 m (`stopReach`), whichever is farther, that carries
  one of its routes, so a stop in a station's bay or set back from the road
  still sits on its line; stops that land ring on ring
  (the two sides of one street) are one ring with the routes of both. Two
  stops the same way round that land ring on ring but are not one stop (a
  station's Gate A and Gate B) are rings in a row along their street, each
  with its own name and routes. On a
  free route (one RTD names free: the FreeRide and the MetroRide), a stop
  each way either side of a crossing (two stops RTD names for the same
  crossing, on the same street with the same routes, 50 m apart or less)
  is one ring between them, at the crossing: the FreeRide's pair at every
  block. Other routes keep both rings.
- **A stop no trip calls at is not drawn.** RTD's stops layer can still
  name a route that no longer serves a stop (Ward Rd & W 61st Ave names the
  52). A stop the GTFS feed knows but no trip on the build's typical days
  calls at is left out of the build; one the feed doesn't know is kept. If
  the layer and the feed stop sharing ids, nothing is dropped and the build
  says so.
- **A line's curve into its last bar starts from the station**, fourteen
  pitches back along the line, not from the end of any tail track.
- **A hall is drawn over the streets that end on it**, so each ends flat on
  the wall.
- **Route numbers are said once, not every block.** A street is cut at every
  corner and each piece's list differs a little from the next. Pieces that
  carry straight on from each other are one street, and along it neighbours
  with the same list are one run. A label is the run's whole list, in one
  order everywhere (numbers by value, then names): never part of a list and
  a count of the rest. A run long enough for its list is labelled, the
  longest first, none closer than a sheet's spacing (170, 240 and 320
  pixels on sheets 2 to 4); the label sits within one block where a block
  holds it and runs on across cross streets only where none does. A run too
  short for its list in one row has it in two, stacked beside the street
  and turned the way it runs, where the street is straight for their
  length. Where routes join and leave a street block by block and no run
  of one list holds it, the label runs on across runs and lists every
  route on the stretch it is lettered along, grown from the longest
  unlabelled run one run at a time, taking the neighbour that adds the
  fewest routes, in one row where the street can hold it and two stacked
  only where it can't. A street too short even for that is not labelled on
  that sheet, and a tap gives the list anywhere.
  Where RTD letters a street's stops ("... [ X Stop ]", 15th and 17th
  downtown), a bus stops only at its letter's stops, so a stop serves one
  group, not the whole list. There the routes are said once in a table, not
  along the street. Streets whose lettered stops share a letter and a route
  are one table (a one-way pair), titled with their names ("15th & 17th
  St"), with a row for each letter: the letter in a small square in that
  letter's own colour, then its routes, spaced, no commas. The colours go by
  row (slate, rust and green, `GROUP_INK`; a fourth row takes the first
  again), the same on the streets, on the stops and in the card, so a
  stop is matched to its row by colour as well as by its small letter. The
  table is a key on the screen, not a plate on the map (#198): from sheet 2,
  whenever one of the lettered stops is on the screen, it sits in a corner of
  the screen, a small card in the controls' style with the title in capitals
  and a row for each letter. Of the four corners (top left and right under
  the top edge, bottom left and right above the sheet and theme buttons) it
  takes one clear of the lettered stops and of the open card, keeps it while
  it stays clear, and otherwise moves to the clear corner covering the least
  of the network. While the map moves it stays where it is and fades out if
  its corner comes over a stop or the stops leave the screen; once the map
  stops it fades in again, moved if need be. A tap opens the full table on
  the card, and the key goes while that card is open. A picked route is
  marked in its row: its number as the card's pressed chip, its letter's
  square ringed. The build gives each sheet's lettered stops' places in
  sheets.json (`groups`). On sheet 3
  the route lists along those streets are gone, and each lettered stop
  shows its letter on its street, in the table's square in its colour with a
  thin rim of ground, centred on the line at the stop's place as a rail
  line's letter sits on its line, so the street reads X Y Z block by block
  and matches the key. A square keeps off cross streets, rail, route
  numbers and names, moving along its street within its block as little as
  it must, and two that would touch both stay, moved apart: none is
  dropped. On sheet 2 the lettered streets carry no letters and no numbers;
  the key says what they are. On sheet 4 each lettered stop shows
  its letter in a small square in its colour in place of its ring. A tap on these streets, a
  lettered stop or the key lists the routes by letter. Routes on those
  streets that stop at no lettered stop are still listed along the street.
  The numbers are set just beside their street, a pixel and a half clear of
  its ink, never on it: on the line, the street shows between the figures
  and a comma reads as a dash.
  Nor on a stop: on sheet 4 each stop's ring keeps lettering off it.
  Nor on the street beside it: where another street runs within the
  figures' reach on one side (the other half of a one-way pair), they go on
  the other side, and a block crowded both sides leaves its label to another
  block of the street. A block is labelled only if it is longer than its
  figures and four pixels of air at each end, so a number never overruns
  the cross streets at its ends.
- **Lines change place gently.** Where a line joins or leaves a pack, the
  others slide to their new places over about 26 pixels each side, so the
  lines beside one that ends do not jog at its last station.
- **Continuous zoom changes the build as well as the page.** Each sheet's
  layers show for a band of zooms around its own. The zoom trial (#154)
  showed that drawing between sheets is not a page step alone. The build
  sets rail lines side by side at one zoom's pixel scale, so the zoomable
  map draws rail once for every two zooms and the page sets the space
  between lines. Each drawing places its lettering fresh, so the build plans
  lettering across zooms. The plan is #129. (Corrected 2026-11-27; until
  then this said the change was the page's alone.)
- **Sizes run between the sheets; switches are zooms (#155).** Every size
  that has a value per sheet runs straight from one sheet's value to the
  next, so a drawing at one of today's five zooms is exactly today's drawing,
  and `drawSheet` takes any zoom from 8.75 to 16 without a sheet number.
  Each "which sheet" test is the zoom at which the thing comes in. Street
  merging is held in ground metres, not sheet pixels, so it only shrinks as
  the map zooms in: two streets drawn apart at one zoom are never joined
  again at a closer one.
- **A divided road is one line out to zoom 16 (#81, #240).** From zoom 14,
  the sheet draws the joined street graph as well; sheet 3 used to draw both
  carriageways. At 41st / Fox the I-25 express braid and its crossing ramps
  are gone, and the doubled bus ink on sheet 3 falls from 276.4 to 183.4 km
  (express 38.6 to 16.7 km; small loops 75 to 54). Broadway and Lincoln and
  the downtown one-way pairs stay two lines: they are different streets, not
  two carriageways of one.

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
- **Whole network** is a button on the bottom row, to the left of Locate
  me, with four arrows pointing out, that zooms out to all of the network.
  On a phone it is the way to Boulder and Longmont from the opening view, so
  it opens with its words beside the arrows, then after five seconds folds
  to the arrows alone (its name stays for screen readers), leaving the
  corner clear. It hides while the whole network is on screen, where it
  would do nothing.
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
page load; so do the search scripts.

A Park-n-Ride or transit center within 300 m of a rail station is found as
that station. A station's platforms are not listed as bus stops. A stop
number is matched from its third digit, so "15" is route 15 and "157" starts
stop numbers.

On today's sheets (#238) a route result steps to the closest sheet that
shows all of the route and picks it, as a tap on it does. A station or a
Park-n-Ride is shown on the first sheet at zoom 13 or closer, and a bus stop
on the first sheet that draws stops; the place is ringed until the next tap,
because the finger did not choose it. The card is the one a tap opens. A
stop's card adds its stop number, and a Park-n-Ride's the routes at stops
within 400 m.

Search is its own code, apart from the map (`public/js/search/`): `find.js`
holds the matching and the order, with no page in it, and `box.js` the box
and its list. Neither reads anything of the sheets. What happens when a
result is chosen is one function the map hands to it (`goTo` in
`public/js/sheets/main.js`), the only part the zoomable map replaces
(`test/search-find.test.mjs` fails if either file names the sheets).

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

On today's sheets (#162, #22) the panel is folded under the picked route's
card: the card keeps its two lines (the chip and name, then the ends and the
midday figure), and a row under them, "Times through the week", opens the
panel in place. Open or shut, it stays that way for the next route. Each row
says its own hours ("Weekdays, 6 to 9am", "Saturday, 9am to 3pm"), which
come from the build, never from the page. The rows are for the whole route:
the stretch note and "here" are not on the sheets, since which stretch is
under the finger is the drawing's to say. Data built before a row existed
leaves that row out.

The panel's words are their own code (`public/js/panel/route.js`): it takes
a route's directory entry and returns the rows, with no page and nothing of
the sheets in it (`test/panel-route.test.mjs` fails if it names them). The
sheets' page only puts it on its card.

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

On the sheets page (v1.0) there is no share button: the address is the link
(#14, Chris 2026-11-14). It always holds the sheet, the centre and a picked
route, `#14/39.72264/-104.99487/bus/ART` (MapLibre's `#zoom/lat/lon`, which
the page read before, then the pick), rewritten in place with
`history.replaceState` each time the map comes to rest or a route is picked,
so Back still leaves the page. Opening it without a pick shows the same sheet and the centre to within half
a pixel. Opening it with a pick shows the pick with the picked route's card
open. Where the whole route fits on the link's sheet, it is framed whole in
the map left clear above the card (`frame`, main.js) and the address
rewritten to that view; a link to a closer sheet keeps its exact view, since
it shows a place on the route. Closing the card clears the pick, as after a tap.
A plain visit keeps its plain address until
the view changes. An address that names no view or a centre off the map
opens the opening view; a pick the sheets no longer draw is dropped. The rules
are in `public/js/sheets/address.js`, with tests.

### Link preview

A link to the site shows the title "RTD system map", the page's description
and a picture (`public/og.png`, 1200x630): central Denver on sheet 2 in the
dark theme, the rail lines fanning out from Union Station past Ball Arena and
Empower Field, with the buttons and credit hidden. An old classic link
redirects to the front page, so it shows the same picture.
The build retakes the sheets' picture each time, from the site it just built
(`scripts/poster-build.mjs` runs `scripts/og-image.mjs`), and gives the
`og:image` link the picture's hash as `?v=`, so apps that keep a preview by
its address fetch the new one. `node scripts/og-image.mjs` makes it again by
hand from the live site. The browser tab says
"RTD system map", and the sheets' credit line says the map is unofficial.

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
- The icon is the map itself: a square of the map as drawn, nothing hidden
  but the page's buttons, centred on the hub (sheets.json `hub`, Union
  Station) on sheet 2 in the dark theme, with Union Station, its line letters,
  Auraria and downtown's streets. `scripts/icons.mjs` crops it in the build,
  after the loading pictures, so a redrawn map redraws its icon. The maskable
  icon is a wider square shrunk to fit, so a launcher's circle keeps the
  station. The favicon is the same square at 32 pixels.
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

- **Stable names:** a sheet keeps the station-name positions chosen by the
  build while it is panned. Screen edges and controls crop the drawing;
  they do not trigger alternate positions or abbreviations. Place names
  have a fixed centre anchor. `qa/labels.mjs` compares label pixels at the
  same world positions before and after pans on every sheet.
- **A picked route looks right:** `qa/pickcheck.mjs` picks every bus and
  rail route on every sheet and counts gaps in the picked line, stubs under
  a stub's length beside the rest of the line (a route drawn whole as one
  short part is listed as small, not counted), self-overlap, turns sharper than a set angle over a
  short run, station names over the picked line, and a pick link that does
  not frame the whole route. Each fault count is 0, or each remaining case
  is explained in #117. The browser report also records cropped names as
  information; cropping at screen edges and controls is expected while
  panning a fixed drawing.
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
  - The sheets are cut into vector tiles when the site is published
    (`scripts/tiles.mjs`, `public/tiles/sheet-N/`), by the same library and
    options MapLibre used to cut their GeoJSON on the phone, so the drawing
    is the same to the pixel and the phone only reads tiles: no sheet's
    whole file is downloaded, parsed and indexed (sheet 4's was 4.85 MB).
    Each sheet has tiles only at the zoom it is drawn from. A list in a
    feature (a label's offset) can't go in a tile, so it goes in as its
    text and the style looks it up in `sheets.json` (`lists`). An address
    naming a route checks it against the routes `sheets.json` lists.
    Every tile, the sheets' and the ground's, comes from the site itself and
    is fetched by the page (`addProtocol`), so the service worker sees it.
    Its HTML asks at once for the modules, `meta.json` and `sheets.json`,
    and a script in its head fetches the opening view's tiles, which the
    poster names (`data-early`), before the map is made. The glyphs the opening view letters
    with are fetched by a script at the top of its head and handed to the
    map (`addProtocol`), not preloaded: on an iPhone Safari appeared to fetch
    the preloaded glyphs again when the map asked, so they came last and the
    opening view waited for them. The glyphs are served as protobuf so
    Cloudflare compresses them (`public/_headers`). Measured 2026-11-12 on slow 4G (390 px phone, 4x
    CPU): drawn at 5.9 s, was 8.9 s; opening view settled at 6.5 s, was 12 s.
  - Once a sheets view is at rest (from the opening on), the page loads the neighbouring sheets' tiles for that view, and the
    tiles of each whole zoom between them, into MapLibre's cache (nearest
    zoom first, again after each move), so the first step to a sheet draws
    at once instead of showing bare ground. Every zoom at once was about
    twice the work, all of it handled on the phone's main thread.
  - No step goes to a sheet before its drawing and those tiles are in. A
    tap on + or −, or a double tap, waits for them with a "Loading…" line
    at the top of the screen, then steps; a pinch or a scroll stops at the
    edge of the sheet shown (in, short of the next whole zoom; out, at the
    sheet's own zoom), shows the same line, and steps on once they are in.
    While a step waits, its own tiles are the only ones asked for. After 8
    seconds (a dropped connection) the step goes ahead anyway, and on that
    sheet no step waits again. A tap made during the wait adds a step to
    it (#210): two taps on + go two sheets on, up to the last sheet, one
    sheet at a time, each step waiting for its sheet as above (a move of
    two sheets at once drew bare ground on the way: 2 of 8 frames, and 9
    of 14 for three); a tap on − takes one off, and back to the sheet shown
    ends the wait. A tap on + or − counts when the finger lifts, not on
    the click Safari makes of it: Safari makes no click of a tap within
    about 300 ms of the last, so quick taps were lost (#210). A double tap
    on the map still goes one sheet on. The + and − keys step as the
    buttons do. A pinch or a
    scroll that meets the sheet's edge just after the next sheet is ready,
    before the edge is let out, steps on too (it was lost). Measured on a 9 Mbps connection (local copy,
    412 px phone): a step 0.3 s after the opening waited 1.2 to 1.5 s and
    drew no blank frame, where the page before drew 9 or 10 blank frames.
    Those tiles start loading at the opening, not at the first touch, so
    the next sheet is finished as soon as on the page before.
  - MapLibre builds a GL program for each kind of layer and each mix of
    paint values that are fixed for the layer or vary by feature, and
    building them holds up the first drawing. Every line, circle and symbol
    layer gives its colour, width and opacity per feature, with the same
    values, so the opening needs 10 programs, not 17 (`style.js`, SAME).
  - MapLibre's stylesheet doesn't hold up the first paint: the page uses
    none of its controls, and the placeholder covers the map until it is drawn.
  - The Overpass font swaps in when it arrives; until then "Loading…" is in
    the phone's own font, not hidden.
  - Each sheet's route lines (a route's whole path, drawn only for a picked bus route) are tiles
    of their own, `routes-N`, whose layers show from the first pick, or at the opening when the
    address picks a bus route (#193). They were about 40% of every sheet's bytes.
  - While it loads, the sheets page shows RTD's rail lines on the map's
    ground, each in its own colour (as the map draws it in that theme) and
    where the map will draw it on the opening view, with the "Loading…"
    line at the top. The whole network is there faint, and over it bright
    pulses flow out from the hub (sheets.json) along every line, one every
    360 px, moving 360 px in 2 s, each run timed by its distance from the
    hub so they carry on from one run to the next, until the map has drawn
    that view (or at once, if a button is pressed first); then the sketch
    fades and the map lands on the same lines. With reduced motion the
    lines are there whole and still. The sketch is part of the page (an inline SVG of
    about 14 KB, 4 KB compressed), so it is on screen with the first
    bytes and asks for nothing: the map's downloads have the whole
    connection from the start (#222). `scripts/sketch.mjs` writes it from
    the built rail lines, the opening view and the map's colour rule
    (`railInk`), as part of the build's picture step; the publish check
    fails if it is not of the built lines. A link to another view gets the
    line on plain ground. The build still takes the pictures of the
    opening view (`scripts/poster.mjs`, `public/poster/`): the same step
    records the opening view and its tile zooms (`data-view`,
    `data-early`), the drawing programs, and the drawing and ground
    fingerprints the publish check reads, but the page no longer shows or
    asks for the pictures.
  - MapLibre and the Overpass font are served from the site itself: no extra
    connections to a CDN or Google before the map can start.
  - Symbols are drawn on canvases kept in memory, not on the GPU
    (`willReadFrequently`), because each is read back as pixels for the map
    and the key, and a read off a GPU canvas waits for the GPU. That wait
    was over half the page's opening main-thread time (#105).
- **Offline:** after the first visit, a service worker keeps the page, the
  map data, and the schedule, so the full map, other times, and scheduled
  departures work with no signal (underground at Union Station, say). Live
  says it's offline. Tiles already seen are kept up to a size cap.
  This is dependable only once the site is on the Home Screen, where
  Safari's seven-day deletion of a site's storage does not apply (see
  "Installed on a phone").
  The sheets page has this from v1.0 (`public/sw.js`, #14): its page,
  scripts, styles, font, glyphs, route directory and tiles go
  to the network first. A failure or 2.5-second stall uses a saved copy;
  a slow successful response still refreshes it for the next visit. A new deploy
  reaches everyone online on their next load and nobody is held on an old
  version (a cache-first copy with versioned names would need a build step to
  name every file, and would show the old version once after each deploy).
  Tiles (each sheet's, its route lines' and the ground's) are kept up to
  3000, oldest dropped first: offline, the map draws the places already
  looked at, and at rest the page loads the neighbouring sheets' tiles for
  that view, so each place looked at is kept at every sheet near it. Until
  2026-11-25 every sheet's whole drawing was kept, so the drawing worked
  anywhere offline over bare ground; now the drawing and the ground go
  together. The worker is registered only after
  the opening view is drawn and the reader has it (the first touch, or 5
  seconds), so it never slows the first load; the files that
  load fetched are handed to it then, and those each later rest fetches
  until it takes over. Navigation preload keeps it from
  delaying later loads. The Live relay and other pages are never touched.
- **Accessibility:** WCAG AA contrast for text, visible keyboard focus, every
  action reachable by keyboard, motion reduced when the user prefers it, and
  nothing identified by color alone. On the sheets page (#14) a screen reader
  hears it all: the map's canvas is labelled and Tab moves on from it; the
  − / + buttons are named, and the dots between them say "Sheet 2 of 4";
  each route button on the card is "Route 15" or "W Line", pressed or not,
  and each stop letter is "Stop A" before its routes. The card is a region
  with a heading, next after the map, and a polite live region says what
  changed: the card's title and how many routes it offers when it opens, the
  sheet on a step, "Route 15 shown, the rest faded" or "Cleared". A × in the
  card's corner (or Esc) closes it as a tap on empty ground does, and
  returns focus to the map. The card's quieter text (`--note`) and a route
  button's ring (`--rim`) meet AA (4.5:1 and 3:1) in both themes; a line's
  label on the card takes whichever of near-black and white reads better on
  its colour. Nobody can tap a chosen spot on the canvas without seeing it,
  so next after the map a button, "List what's in view", lists what the
  sheet draws on screen (#135): its stations and stops, each opening its own
  card, and its rail lines and bus routes, each picked as on a card. It is
  out of sight until a keyboard reaches it, like a skip link, so the map
  shows no extra control; the canvas's label names it, and closing a card
  opened from it returns focus to it. `qa/a11y.mjs` checks the tree,
  axe-core, the live region and that keyboard path in headless Chromium; a
  real VoiceOver pass on a phone is a person's check.
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
before and after. Current sheets use scales 8.75, 10, 12, 14 and 16, with the
actual settled camera recorded. The smooth-zoom trial is evaluated explicitly
at `/zoom/`, both modes, over 12–14 including fractional samples and both
sides of drawing boundaries. Classic's older fractional views are historical
only. Include data-derived hub/shared-track/terminal examples, reproducible
unfamiliar samples and the affected place. Judge the worst view, not the best.
See [evaluation scope and evidence](docs/evaluation.md).

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
topographicity) and discusses evidence that preference and actual task
performance can diverge. This does not establish a universal zero correlation.
So usefulness (the Useful row and the
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

**Who scores.** The implementation agent owns routine visual QA and scores
from inspected captures and measurements. It must reproduce and fix visible
faults before declaring a candidate ready; a green script alone is not a
visual pass. An independent reviewer is useful where available, but routine
work never waits for the user to inspect every view or choose a technical
algorithm. The project's `design-reviewer` prompt is available for a distinct
review pass; a self-review is not described as independent.

Measured checks decide the gates they actually cover; a failing check caps its
row at 1. The gates, minimum scores and no-regression rule above remain in force.
Every score cites its evidence and scope. An unmeasured applicable gate or
row prevents an overall pass. Broad geometry/labeling changes need a distinct
review before unqualified visual acceptance; if unavailable, retain that gap
and continue routine engineering. Each meaningful fix records rider impact
and priority, a reproducible bad case, comparable after evidence, detector
challenges/controls and limits, as specified in [evaluation.md](docs/evaluation.md).
Device emulation is not evidence of
physical-phone speed or real VoiceOver speech. Ask the user only for a prepared device-only check,
a product tradeoff that evidence and principles cannot resolve, or concise
formal-release approval. See `docs/verification.md`. The user's verdict can
override a card; asking for that verdict on every zoom band is not a required
QA step (updated 2026-11-21).

## Validation

Before a version is called done, the agent tries the applicable tasks in a
phone-size browser and measures completion, time and wrong answers. Physical
device behavior is checked separately where the available tools cannot verify it.
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

**Who tries them.** The implementation agent, using the available browser
tools and direct data checks, with rendered inspection as well as assertions.
The user reviews when a specific valuable decision or device-only observation
is ready, rather than serving as a manual QA panel (updated 2026-11-21).

The independent task-test proposal in #66 remains useful for checking answers
without sharing the implementation's assumptions. Its design is:

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
hourly check (refresh/watch.mjs) ── RTD changed? ──> phone alert

build (npm run build:data,         Cloudflare Pages site
 on our machine, uploaded)         (npm run deploy checks and uploads it)
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

- Static site with no backend beyond the Live relay.
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
- `npm run build:data` discovers, fetches, checks, and writes the data and
  takes the loading pictures; `npm run build:sheets` redraws the sheets and
  pictures from the data on disk; `npm run build`
  checks the built site; `npm run deploy` checks it and uploads it to
  Cloudflare Pages; `npm run
  dev` runs the site locally with `wrangler pages dev`, and `npm run
  dev:live` the relay beside it, which the site finds on its own.
- Updates are built by hand when the hourly check alerts (see "Zero
  maintenance", Rule 2).

The deployed page uses plain ES modules under `public/js/sheets/`:

- `main.js`: startup, sheet transitions, selection, theme, offline loading and framing.
- `style.js`: sheet scales, palettes, map sources and layers.
- `pick.js`, `say.js`: hit testing, route cards and screen-reader wording.
- `address.js`, `view.js`, `settle.js`: share links, visible space and zoom settling.
- `public/js/color.js` and `often.js`: shared colour and frequency helpers.

`scripts/build-data.mjs` still builds the shared transit data, then
`scripts/sheets.mjs` draws the sheets with `scripts/lib/sheets.mjs`.
Shared size and frequency modules remain inputs to that data build. The Live
relay and protocol are retained for the planned smooth-zoom features.

The Classic application is archived on `classic-archive`, rather than shipped
from `public/`. `qa/classic/js/` retains only the renderer dependencies needed
by unit tests and frozen-build recall. `qa/drawn/` reads those fixtures or an
old frozen build's original `public/js/` layout; it does not model the current
sheets. Its historical browser checks require an explicit archive target.

`qa/checks/` checks the deployed sheet map in light and dark: page health at
each scale, route selection, theme changes, reload, Escape and old-link
redirects. `qa/sheets.mjs` and `qa/a11y.mjs` retain the longer sheet and
accessibility checks. `npm test` runs unit tests without a server. Nightly
checks exercise sheet-map health; the branch workflow stays disabled until
explicitly enabled.

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
- Only DeepSeek V4.1 Flash builds, on GitHub and on the home machine;
  Claude evaluates. (Work was credited by model until 2026-11-13; see the
  decision log.)

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
   at :23, no page of its own; retired 2026-11-24 for the hourly alert,
   Rule 2). Live since 2026-11-06: the first production
   build succeeded and the site answers at rtd-system-map.pages.dev; the
   Worker is deployed with its `DEPLOY_HOOK` secret and cron. Not yet done:
   the deployment-failure email (Cloudflare dashboard, Notifications),
   offline caching, a domain.

### Launch and versions

Decided 2026-11-13. The site is called launched at **v1.0**, when the
"Launch (v1.0)" milestone closes: the agent has verified the five sheets
in both themes, route highlighting, view URLs, offline use and accessibility
(#14), with specific physical-device gaps recorded and resolved where required,
and Chris has given concise release approval. Routine QA belongs to the agent;
release approval does not ask the user to repeat that test matrix. The page address
is its share link; a custom domain is not a launch requirement. V1 to
V3 above are the names of the design stages that led there, not releases.
What comes after launch is in these milestones, in this order (decided
2026-11-13; v2 and v2.x redrawn 2026-11-18; v1.3 added and v2 replanned
2026-11-27):

1. **v1.1: Sheets polish.** Faults on the sheets and in the bus data they
   draw from. Released 2026-11-25.
2. **v1.2: Fixes from the weekly round.** Fixes Chris picks in the weekly
   map round, on today's sheets.
3. **v1.3: Live, panels and search.** On today's sheets, only what carries
   over to the zoomable map without being built twice: search, the route
   panel with its frequency rows, and stop and station panels with next
   departures and alerts. Each is its own module under `public/js/` that
   never reads sheet state; moving the map is one small function, the only
   part the zoomable map replaces. Route tracing and Live vehicles wait for
   the zoomable map (#251).
4. **v2: One zoomable map.** The sheets' drawing at every zoom from the
   whole district to 16, one map that zooms smoothly, with the build
   deciding every label. The milestone holds only the steps to it, in
   order; the plan is #129. Classic is preserved on
   `classic-archive`; its historical issues carry the `classic` label. Work on
   the isolated smooth-zoom branch proceeds under regression and current-sheet
   parity checks; blanket manual launch review is not an engineering gate.
5. **v2.x: Other times, Live tiers, edge letters and relief.** On the
   zoomable map: edge letters and relief, then Saturday, Sunday and evening
   in the Key, and Live tiers, built on how other times fit the drawings
   (#233); and route tracing and Live vehicles (#251).
6. **Later.** Ideas with no date.

A fifth milestone, **Parked: recheck on the zoomable map**, is not a
release and not planned work. It holds faults and leftovers written against
the classic map's drawing, which the zoomable map replaces. Each is
rechecked on the zoomable map before v2 is signed off (#161): one that
still shows becomes a new issue, the rest close.

Every open issue is labelled `sheets`, `classic` or `both` (the shared data
pipeline or the site as a whole).

A release is a tag on `main` (`v1.0`, `v1.1`, ...) with a GitHub Release
listing the milestone's closed issues, made only after Chris's sign-off.
Each group of new features that ships is a minor version; fixes between
releases are not tagged. Cloudflare Pages still deploys every commit to
`main`; a tag names a build worth going back to.

## Open questions

- **Shared streets by combined frequency (decided 2026-11-08):** each
  street is drawn once at the rider's combined rate (see "Bus routes"). The
  busiest are no longer capped at rail's width on sheets 1 to 3 (decided
  2026-11-15, decision log). Still open: the right threshold for strands against a core line
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

- 2026-11-17: Chris requested a light/dark toggle in the lower-right corner
  of the sheets. Use a 44 px sun/moon button aligned with the zoom controls,
  clear of the credit and safe areas. Save a manual choice, apply it before
  paint, and keep the map's view and route selection through a theme change.

- 2026-11-17: Chris clarified that panning at a given zoom must leave the
  drawing static. This supersedes #147's earlier screen-fit alternatives:
  station names keep their built positions and are cropped at the screen
  edge. Remove viewport-driven name flips and suppression, and use a fixed
  centre anchor for place names. The first-load picture must match the
  current drawing fingerprint before it is shown; refreshing an old picture
  alone cannot prevent a later data rebuild from bringing the jump back.

- 2026-11-17: A rail line left without a letter may use the configured
  minimum air around a station bar instead of the preferred extra air
  (#145). Measure that minimum from the whole bar. The fresh deployment
  had no T letter: its clearest point was 20.6 px from a station, just under
  the preferred 21 px, while the configured minimum is 15 px. The fallback
  keeps the line identified without touching station marks or other discs.

- 2026-11-16: Launch cleanup combines the signoff drawing and the keyboard
  list / first-visit offline fixes in one candidate. A picked route keeps
  its name while the map is dragged, Escape clears it, and an invalid route
  in an updated address is dropped. Route hints promise highlighting.
  Stop-group tables keep their full ink while a route is picked, with the
  matching row emphasized. Rail cards name the line; visual separators are
  left out of speech. A tapped place is moved clear of its card, including
  in landscape. Zoom buttons from the opening view keep the hub in view.
  Station names use measured font widths and can use a build-approved
  alternative that fits inside the screen and clears other names and
  controls. A short rail line sharing all its track still gets its letter;
  a bus stop with no served bus route is omitted. Branch smoothing holds
  shared junctions so the picked route stays connected. The directory is
  saved on the first visit, and a network request stalled for 2.5 seconds
  falls back to a saved copy while its refresh continues. These changes
  address the audited launch and sheets-polish faults; phone signoff and
  a real screen reader pass remain release requirements.
- 2026-11-16: Capture scripts preserve the map's `main` landmark and fail
  if it is hidden, so loading and sharing images contain the drawing after
  the accessibility changes. Recall fixtures freeze their original planting
  exclusions: adding a fault seen on a newer build must not move an older
  fixture's planted faults or change what its baseline compares.

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

- 2026-11-08: "Whole network" moves to the bottom row, left of Locate me,
  and folds from words to its icon after five seconds. Chris: "let's move
  that to the bottom row to the left of the arrow rather than above it. and
  let's have it start out with the label and then shrink after like five
  seconds down to the icon."
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
- 2026-11-12: The browser tab says "RTD system map", as the link preview
  does (was "Denver transit map (unofficial)"). The key's first line still
  says the map is unofficial.
- 2026-11-12: Four sheets (#117). Alongside the continuous map, the same data
  is drawn as four finished phone maps at zooms 10, 12, 14 and 16, served at
  `/sheets/`. Each sheet shows every route. The build places lines, station
  marks, letters and names for each sheet's scale; the page holds only
  colours and widths. Reason: the continuous map kept gaining per-zoom special
  cases and was never finished at any one zoom. Continuous zoom comes back
  later as drawing between sheets.
- 2026-11-12: Sheets are drawn, not traced (#117). Station bars are squared
  and the platforms of one terminal made parallel, ending lines curve into
  their bar, divided roads and streets too close to tell apart are one
  midline, short breaks in bus streets are bridged, and a bus line's weight
  holds for a few blocks. Stops show only on sheet 4, and sheet 3 names only
  main streets. Reason: Chris's phone review found each view had things that
  were true to the ground and not beautiful; he asked for small fudges of
  place and shape where they make the drawing clean.
- 2026-11-12: Sheets draw bus stations' halls, and four more "drawn, not
  traced" rules (#117). A hall wide enough to see on a sheet is a quiet room
  that its buses' streets end on, square to the wall. A turnaround whose data
  stops short of the street it leaves from is closed. Two ways round a strip
  too thin to see into are one street. Along one street only blocks well
  apart carry the route list, and a long list is three routes and a count.
  A short stretch takes the weight of the busier street it runs into. Where
  a rail line joins or leaves a pack, the others slide over about three times
  as far as before. Reason: at Union Station and Civic Center bus streets
  ended in mid-air where buses go indoors, turnarounds read as scraps, the
  same long list repeated block after block downtown, and lines beside one
  that ended jogged at its last station.
- 2026-11-12: Sheets give bus streets real corners, and halls are squared
  rooms. Streets are cut and joined wherever they meet before rings, strips
  and stubs are judged; a stub is measured from its loose end to the first
  corner where streets part; a slim turnaround loop is one street; two
  streets tied by short links are one; a gathered turnaround never bends a
  street running through it; a hall is the squared room over its outline
  and no street is drawn inside one unless it crosses straight above.
  Reason: stray spurs, the Decatur-Federal tangle, teardrop loops, ladder
  cells and the torn outline of Civic Center's hall all came from streets
  that touched without a shared corner, or from a surveyed shape drawn
  true. The stub rule's old bound (half a percent of route length) is no
  longer claimed; it was measured for single pieces.
- 2026-11-12: Sheets set route numbers beside their street, not on it.
  Reason: in the dark theme especially, the street showed through the
  gaps between figures, so "0, 6, 10" read as "0-6-10".
- 2026-11-12: Sheets' halls are a shade off the buildings in both themes.
  Reason: in the dark theme a hall was the same tone as the blocks round
  it, and in the light theme nearly so; only its edge showed.
- 2026-11-12: Sheets draw a street straight across a cross street it met at
  two corners a little apart. Reason: the two corners drew as a step in
  the street with a break in its weight where the quieter link showed
  between them.
- 2026-11-12: Sheets keep one weight along a street where nothing else
  meets it. Reason: pieces weighed apart left a short dark tick on the end
  of a pale street at the downtown hub on sheet 1.
- 2026-11-12: Sheets pair a slim loop's two sides by nearness. Reason: long
  out-and-back loops whose way back ran a little longer were left as a
  doubled line two pixels apart (on sheets 3 and 4).
- 2026-11-12: Sheets draw the quietest bus streets brighter in the dark and a
  shade darker in the light, each class still well above the one below.
  Reason: on dark ground the hairline streets with a bus an hour faded out.
- 2026-11-12: Sheets draw a street straight where it strays only a pixel or
  two from a straight line. Reason: Colfax kept two gentle bends either side
  of Lincoln on sheet 3, left by the divided road's middle found block by block.
- 2026-11-12: Sheets cut a street that runs through a hall at both walls.
  Reason: a quiet street across Union Station's hall read as a notch in the
  room; streets crossing a hall had been left whole.
- 2026-11-12: Sheets lead a street's loose end on to a rail station a short
  walk ahead. Reason: the routes that turn round at Peoria ended in the open
  south of the station on sheet 4; their loop is drawn as one street out to
  its far end, after the rules that join loose ends to other streets run,
  and those rules only look for streets, never stations.
- 2026-11-12: Sheets set a street's numbers on the side with room, and only on
  blocks long enough for them. Reason: south of downtown on sheet 2 the
  numbers of one half of a one-way pair sat on the other half, and a
  number on the short rung between them overran both.
- 2026-11-12: Sheets end a line at its last station's bar, whatever tail
  track runs on past it. Reason: on sheet 4 three light rail lines ran about
  100 px past Union Station's bar to a ragged cut; a line counted as ending
  only when its track stopped within three pitches of the station, which at
  zoom 16 is a few yards.
- 2026-11-12: Sheets set lines that end at one bar from either side beside
  each other along it. Reason: on sheet 1 light rail and commuter rail met
  head to head at Union Station's bar, so E read as running on into N.
- 2026-11-12: Sheets draw lines that end back to back at one bar on a fat bar
  with a divider down it, in place of two bars joined by a link. Reason:
  Chris asked for Union Station on sheet 1 to be one marker, slightly fat,
  with a divider through it, and found the angled link on sheet 2 confusing
  and not beautiful.
- 2026-11-12: Sheets round a street's turns and smooth its curves. Reason:
  the FreeRide loop beside Union Station's light rail on sheet 4 turned in
  sharp angles where its pieces met and was faceted between them; Chris
  said it did not look hand drawn.
- 2026-11-12: Sheets draw a turnaround's bow in one sweep. Reason: rounding
  corners left the FreeRide loop by Union Station with a bulge and a pinch
  from the route data; Chris saw a bend that made no sense.
- 2026-11-12: Sheets don't lead a street that ends at a bus station's hall
  on to a rail station. Reason: route 15's few trips out of Union Station's
  hall were drawn back across to the light rail bar, a line that isn't
  there, beside the FreeRide loop on sheet 4.
- 2026-11-12: Sheets say which trains end where, and what a hall is. Where
  two or more lines end together at a bar, the station's name carries their
  letters in a row; a station's bar far from its first is named too; a long
  hall is lettered "Bus concourse" (underground) or "Bus station" down its
  length; a place that shares a station's name is not lettered by the ground
  map; the closest sheet lists up to seven routes on a street before "+N";
  street names sit beside their street on the closest sheet, where the bus
  street's own marks had kept them off. Reason: Chris's red-team of Union
  Station on sheet 4: no line letters in view, no name at the light rail
  end, the hall read as a road, no street names, routes hidden behind "+N".
- 2026-11-12: Sheets end rail at a hall's wall, set corners beside a wall on
  it, keep a street no lighter than a street whose routes it all carries, and
  leave out a stop ring half under a rail line. Reason: on sheet 4 at Union
  Station the commuter lines ended inside the bus hall, the FreeRide loop
  stopped five pixels short of it, a street carrying eleven routes was drawn
  lighter than one of the two that fed it, the same "15, 19" was heavy on
  one side of the hall and faint on the other, and a sliver of a stop ring
  showed from under the light rail.
- 2026-11-12: Sheets label a street across runs where no run of one list
  holds it, listing every route on the lettered stretch. Reason: Chris saw
  15th and 17th downtown unlabelled on sheet 3. Their lists change by a
  route or two at almost every cross street, so no run of one list was
  long enough for its sixteen or so routes. One row is preferred to two
  stacked: a stack turned with the street claims a square around itself
  on the page, and pushed the FreeRide and nearby labels off.
- 2026-11-12: Sheets list every route on a street's label, or leave the
  stretch unlabelled: no "+N". Reason: Chris, "it's absurd to have that on a
  map". This replaces the three-routes-and-a-count rule and the seven-route
  limit on sheet 4 from earlier the same day. Labels became their own
  features along a run of blocks with one list, and the sheets' tiles are
  drawn one zoom out with a wide margin so a label's stretch is whole in
  the tile that places it.
- 2026-11-12: Sheets put stop rings on their streets, keep a turnaround's
  bow clear of rail, start a line's lead-in from its station, draw halls
  over street ends, and give route lists one order. Reason: Chris's
  red-team of Union Station on sheet 4: rings floated beside or between
  streets; the FreeRide bow ran against the light rail and its bar; the
  light rail wiggled just before its bar, because the lead-in was measured
  from the tail track's end; streets ended in round blobs across the hall's
  wall; one loop read "FreeRide, 15" and "15, FreeRide". A tapped stop or
  street on the sheets also showed "undefined": the tap now reads what the
  sheet holds.
- 2026-11-12: Sheets: bus street weights follow the buses. Chris: "the
  street grid lines in downtown don't make sense in terms of how thick they
  are and where". Three rules handed a weight from one street to another
  whatever routes each carried: an hourly street north of Colfax and
  Broadway was drawn at the heaviest weight, and one short heavy piece of
  route 28 made hundreds of pixels of it heavy. On sheet 2, streets drawn
  heavier than their own measured service fell from 3,143 px to 270 px; on
  sheet 4 from 223,931 px to 990 px.
- 2026-11-12: Sheets: a scroll goes to the next sheet. Chris: "scrolling
  just bounces you back out ... unless you scroll wheel in quite a lot".
  The page judged a zoom against the sheet shown and needed a third of the
  way; and MapLibre does not mark a single wheel notch as the reader's, so
  one notch left the map between sheets. Checked in Chromium with real
  wheel notches and pinches.
- 2026-11-12: Sheets: two rows of route numbers where one does not fit
  (Chris: "you can stack routes into two rows above a street").
- 2026-11-12: Sheets: a line does not end at a station while another of its
  stations lies beyond, and a name is never nearer another station's bar
  than its own. On sheet 1 the E line was said to end at Lone Tree City
  Center, and "RidgeGate Parkway" and "Lone Tree City Center" each sat
  beside the other's bar (Chris: "this looks ugly and inaccurate").
- 2026-11-12: Sheets: bars at the last stations of a line sit on their
  lines, and a crowded last station is named beyond the line's end. Chris,
  of the south end of E and R on sheet 1 after the fix above: "this still
  looks ugly". The curve into RidgeGate reached fourteen pitches back, 70 px
  on sheet 1, through Sky Ridge and Lone Tree City Center, and pulled the
  lines up to 6 px off those stations' bars; and the large two-row
  "RidgeGate Parkway" stood beside the small names of the stations before.
- 2026-11-12: Sheets: a bend smaller than a line is wide is drawn straight.
  Chris, of the south end of E and R on sheet 1: "So how do we fix it?" The
  track there swings 10 px side to side within 17 px, which the rounding over
  three line widths left as a 6 px kink between Sky Ridge and Lone Tree City
  Center. The track is now also rounded over nine line widths each way, and
  that straighter course is the one drawn wherever it stays within 0.7 of a
  line's width of the first; no line moves further than that on any sheet.
  The slide where a line ends at Lincoln, about 1 px, no longer shows on the
  straight line and is unchanged. Names step out from a bar in smaller steps
  (1, 1.4, 1.8, 2.8) so one beside a leaning line stays close.
- 2026-11-12: Sheets: where a line at the side of a pack ends, the others
  carry straight on. Chris, of E and R past Lincoln: "just have the E and R
  continue. Don't have it bend inward to cover the T line. Just have the T
  line stop". The data steps E and R half a place over where T ends, to
  centre them on the track; the sheet slid them across over 26 px each side,
  which read as the pack bending in over the line that had stopped. The
  sheet now tells that step from a slide (the data slides in thirty-seconds
  of a place), and where another line's track ends within a walk of it and
  every line stepping there moves the same way, each keeps the place it had.
  The main map is unchanged.
- 2026-11-12: Sheets: a name does not line up with another station's bar.
  On sheet 1 "Arapahoe at Village Center" stood up and to the right of its
  bar, level with Orchard's, and read as Orchard's name; it was nearer its
  own bar, so the nearness rule let it by. A name off on the diagonal, level
  with neither its own bar nor in line with it, now gives way when another
  bar within twice the distance is. Six names moved on sheets 1 and 2
  (I-25 / Broadway on sheet 2 came in from far off to beside its bar) and
  Arvada Ridge is left off sheet 1.
- 2026-11-12: A branch preview named after a page opens on that page.
  Reason: the `sheets` preview's root opened the main map, and Chris was
  sent there for the sheets.
- 2026-11-12: Only a page of the preview's own name moves its root, and
  the checks open each build's own address. Reason: the site has no 404
  page, so Cloudflare answers every path with the main map and "the page
  exists" was true of any name: each build's own address
  (`<hash>.rtd-system-map.pages.dev`) was sent to `/<hash>/`, a broken copy
  of the main map. And the checks opened the `sheets` alias, were sent to
  the sheets, and timed out waiting for the main map (the first finished run
  on the branch, on 1688fd1). The page must now differ from the main map,
  and `qa/checks/preview.mjs` reads the build's own address from
  Cloudflare's summary.
- 2026-11-12: The four sheets are the front page and the map they replace
  is the Classic map at `/classic/`. Reason: Chris: "I want to migrate the
  current main and rename it and make this the main"; asked which, he chose
  the sheets as the front page and "Classic map at /classic/". The preview
  redirect (`functions/index.js`) is gone, since every preview's root is now
  the sheets. The classic map's scripts ask for their files from where the
  scripts are, because MapLibre writes the address relative to the page and a
  `<base>` tag would have sent it to the root. The checks still read the
  classic map and find it on each site, so they also run on builds from
  before the move.
- 2026-11-12: The sheets' credit line no longer links to the Classic map.
  Reason: Chris: "Remove the classic map from the credit line". The classic
  map stays at `/classic/`, reached by its address.
- 2026-11-12: The row of letters under a station's name lists each side's
  lines by letter. Reason: Chris: "The order of the lines should be ABGNCEW
  when you list them at Union Station like that". The row read G B N A W C E,
  the order the lines lie across the bar, which reads as no order at all.
- 2026-11-12: Sheets ring only stops a bus street serves: not a bus
  station's gates, nor stops only trains call at. Reason: Union Station's
  bus gates and rail tracks were scattered as rings over its hall and round
  its bars on sheet 4.
- 2026-11-12: Sheets keep route numbers off bus stops. Reason: a stop's ring
  takes no part in placing lettering, so numbers landed on stops on sheet 4.
- 2026-11-12: Sheets draw bus streets in three steps, the busiest as wide
  as rail and below every rail line's contrast, with dim rail colours lifted
  in the dark and pale ones cased in the light (#117, review items 1 to 3;
  #114). Reason: in the dark the busiest streets were nearly white and the
  downtown grid outshone the purple and red lines; five classes at 0.9 to
  3.1 px in close greys read as gridlines, not steps; in the light lime,
  gold and sky blue faded into the cream. Sheet 4's stop rings grow to stay
  wider than the busiest street. The dark street grid is left as it was: at
  1.09:1 against the ground it is well under the quietest bus step (2.27:1).
- 2026-11-12: The opening sheet steps its bus streets more steeply (1.9, the
  quiet step a 1 px hairline in a fainter grey), and in the dark the busiest
  bus grey drops from OKLab L 0.63 to 0.60 and dim rail lifts keep their
  chroma (#117). Reason: at 1.41 px the quiet step made the opening view's
  outer grid read like chart gridlines; and no red bright enough to clear
  the old floor (6.1:1) is still red, so T lifted to salmon #fe6156 and E
  and N to lavender and orchid. Now T is #fb4b43, E #a673e3, N #d84af3, all
  over a 5.4:1 floor.
- 2026-11-12: The sheets page loads only the sheet it opens on first, and
  asks for the opening view's files from its HTML (#125). Reason: on slow 4G
  the page was blank for about 9 s, waiting on sheets that don't show at the
  opening zoom.
- 2026-11-12: While the sheets page loads it shows a picture of its opening
  view with "Loading…" over it, then fades to the map (#125). Reason: Chris:
  "have a loading thing show up in front of it, so it shows the map as a
  static, and then it says loading…and then it goes to the actual thing".
- 2026-11-12: Sheets place town and neighbourhood names by rank, before
  route numbers and over bus streets (#117). Reason: placed last, behind the
  marks that keep lettering off bus streets, they lost every busy area:
  sheet 1 named Thornton and Niwot but not Denver, Aurora, Lakewood or
  Boulder, sheet 2 named no town at all, and sheet 3 named "Quality Hill
  Historic District" instead of Capitol Hill.
- 2026-11-12: The front page's link preview is sheet 2 in the dark theme,
  framed so every station name on the lines is whole. Reason: Chris asked
  for "whichever one you think is the most captivating"; against the dark
  ground the coloured lines are what the eye goes to, and the stadiums and
  station names make it recognisably Denver. Sheet 3 at Union Station, the
  first try at more detail, was mostly grey bus streets.
- 2026-11-12: Sheets name bus streets from their stops' names, beside the
  street after its route numbers, and shorten the ground map's street
  names (#117). Reason: the ground map's names were kept off bus streets,
  so sheet 3 named West 14th Avenue and Pine Street but not Colfax or
  Broadway; set on a bus street's centreline they cut its line and read
  muddy, and set ahead of the route lists they took 8 of 18 downtown.
- 2026-11-12: On the sheets a street with a bus every 10 minutes is a band
  at least 7 pixels wide, wider than rail on sheets 1 to 3, and the middle
  step sits evenly between it and the quiet step (#117). Reason: Chris
  asked why the Flatiron Flyer was "so insubstantial" and for the very
  frequent lines to be more significant; at rail's width in a grey kept
  under rail's contrast the frequent streets read as no more than the
  grid. The pieces of the Flatiron Flyer still drawn as a hairline (to
  Anschutz along I-70 and I-225, and through downtown to Civic Center) are
  its peak-only legs, 4 to 17 trips a weekday with none at midday, so they
  stay quiet.
- 2026-11-13: The busiest bus step is back to rail's width, never wider,
  and the two frequent steps read by a lit core down their middle instead
  (#117). Reason: Chris found the 7 px band too heavy downtown, where
  every street is frequent, and asked for a better way than width. A core
  adds contrast without width, so Colfax and US 36 stand out on the
  opening sheet while downtown weighs about what it did before the band.
- 2026-11-13: Bus lines end on a mark: the ring of the stop their route
  ends at, or, for a short spur near none of its stops, not drawn (#117).
  Reason: Chris found line ends around US 36 and Interlocken that "don't
  make any sense": AB and 228 stopped short of the US 36 & Flatiron
  station, AB with a hook. Ends in the open went from 25 to 2 on sheet 1
  and from 27 to 1 on sheet 2. The three left (the airport, Evergreen and
  Parker) are where RTD's route data stops 400 m to 1 km short of the
  stop, too far to lead on to by rule.
- 2026-11-12: Sheet 4 names its bus streets: a name leads its street's
  route list where the block holds both, and a name of its own slides along
  its street to a stretch between stops and within one of the page's tiles
  (#117). Reason: on sheet 4 a stop's ring every half block keeps lettering
  off the street, so almost no name was set (none at Colfax and Broadway).
  Over eight sheet-4 views names went from 7 to 17 and over three sheet-3
  views from 6 to 14, with no route list lost. Colfax between Broadway and
  Lincoln still has no room: two stops and its list fill the block.
- 2026-11-13: Where RTD letters a street's stops (15th and 17th downtown),
  the sheets give the routes in one table by letter, tied to the streets by
  a bracket, and on sheet 4 each lettered stop shows its letter (#126).
  Reason: the long row of every route on those streets was hard to read
  and misleading, since any one stop serves one group. Chris approved the
  table after a mock.
- 2026-11-13: The table's bracket crosses its streets mid-block, at least
  8 px off any street it doesn't cross, or where it has the most room if no
  block gives that; and sheet 3 shows each lettered stop's letter in a
  square on its street (#126). Reason: on sheet 3 the bracket ran about
  3 px beside a cross street and read as a doubled street; and Chris asked
  for the letters along 15th and 17th so the streets read X Y Z block by
  block, matching the table. With the letters in the blocks, the bracket
  has about 5 px at its best place on sheet 3, and a version without it
  went to Chris to choose between.
- 2026-11-13: Bracket removed: the table has no bracket or leader on any
  sheet, and stays where it was (#126). Reason: with each stop's letter on
  its street, the matching squares tie the table to the streets, and the
  bracket was too faint to see on a phone.

- 2026-11-13: Work is no longer credited by model: the `made_by` script,
  its `gh` wrapper and the instruction to run it are gone. Reason: Chris
  no longer uses DeepSeek here (the Agent workflow is switched off), and the
  step made every commit and comment ask for permission.
- 2026-11-13: Launch is v1.0, set by a "Launch (v1.0)" milestone: the four
  sheets signed off, route highlight on the sheets, and #14. V3's remaining
  steps (other times, Live tiers, alerts) move after launch. Releases are
  tags on `main` after Chris's sign-off. Reason: the V3 milestone no longer
  matched the work after the four-sheets decision, and nothing said what
  launch meant.
- 2026-11-13: A street's class is read from its wait rounded to whole
  minutes, not its exact buses per hour. Reason: Chris saw route 83 west of
  University drawn every 16 to 30 between stretches drawn every 15. Its wait
  came out at 15 minutes and a few seconds (stop times filled in between
  RTD's timepoints), so the line said every 30 while the panel said 15.
- 2026-11-13: The roadmap after launch is v1.1 (sheets polish), v2 (one
  zoomable map built from the sheets, carrying the classic map's
  features), v2.x (other times and Live), then Later. The classic map is
  paused until the sheets launch. Reason: Chris: the classic map waits
  "until we get the sheets version working", and the goal is to make the
  sheets infinitely zoomable and merge in the classic map's features.
- 2026-11-13: Sheets: lines that share track are set beside one rounded
  track (#128). Chris, of sheet 2: "the alignment for the C line at I-25 and
  Broadway looks wrong". Each line's track was rounded on its own over up to
  nine line widths, so past a fork its rounding leaned its own way early: C
  pulled away from T and E between Alameda and I-25 / Broadway, 1.1 to 2.6
  pitches from T where the data has them on one track. Where the data has
  lines on one track, each now takes the mean of their rounded tracks, and
  past the shared track a line eases back to its own over at least eight
  line widths (slowly at both ends, so a straight line shows no corner). On
  sheets 2 to 4, C, T and E stay a pitch apart (0.94 to 1.03) to the fork;
  the other forks (Union Station, the B/G split, W at Decatur, Nine Mile)
  also leave the pack at the fork, moving lines by at most 10 px on sheet 4.
- 2026-11-13: Sheets: the tiles of every sheet around the view load while
  the map rests. Chris: the first zoom to each sheet flashed black, and later
  ones were fine. MapLibre makes a sheet's tiles only once the zoom reaches
  it, so the first step drew bare ground until they came: 120 to 190 ms on a
  desktop, 300 to 460 ms at the "Quality floor" phone profile. The page now
  loads them ahead (MapLibre has no public way to, so it uses its tile
  managers) and keeps room for them in a larger tile cache. Measured on the
  live data, every first step in and out drew with no blank frame on both.
- 2026-11-14: Sheets: tap a route to highlight it, the rest faded (#118). A
  picked bus route is drawn in one ink and weight end to end, not each
  street's grey, so it reads as one line; fading mixes colours toward the
  ground instead of using opacity, so overlaps leave no knots.
- 2026-11-14: Sheets: the address is the share link, no share button (#14,
  Chris). It holds the sheet, centre and picked route, rewritten in place as
  the view settles; old and malformed addresses open the opening view.
- 2026-11-14: Sheets work offline after one visit (#14): a service worker,
  network-first for the page's own files so a deploy is never held back,
  cache-first for basemap tiles (versioned addresses), registered after the
  first draw so the first load is no slower.
- 2026-11-14: OpenStreetMap is named as a data source (#69): the basemap
  and the stations' shapes. Its shapes join the count checks, which now
  compare with the published site's counts on a fresh checkout (before, a
  Cloudflare build had nothing to compare with and skipped them), and a hall
  kept from the last build keeps its roof. OSM down falls back; OSM
  answering with less than 70% of last time, or nothing, fails the build.
- 2026-11-14: Screen reader pass on the sheets page (#14): named controls,
  "Sheet N of 4", "Route 15" buttons, "Stop A" letters, a live region for
  the card, steps and picks, a close button on the card, and AA tokens for
  the card's quieter text (`--note`) and route rings (`--rim`).
- 2026-11-14: Sheets: a street folded into a nearby one adds its routes
  only along the stretch where the two run together, not along the whole
  kept street (#136). Before, a block of two streets side by side put
  routes on kilometres of street they never use (route 1 on Colfax from
  Federal to downtown).
- 2026-11-14: Sheets offline after one visit, for real (#133). The map's
  drawing worker starts before the service worker exists, so on a first
  visit its fetches (every sheet's drawing, the basemap tiles) never reached
  the cache and the page opened offline only after a second visit. The page
  now names them to the service worker: all four sheets, and the basemap
  tiles of every sheet around each view it rests at during that first visit.
- 2026-11-14: Sheets: "List what's in view" for a keyboard or a screen
  reader (#135). The cards could only be opened by tapping the map, which a
  screen reader can't aim. A button next after the map lists the stations,
  stops, lines and routes drawn on screen; it shows only with the keyboard's
  focus, so the map gains no visible control.
- 2026-11-15: Sheets: no bright tick into faint streets (#117, Chris's phone
  check: a stub east of US 36 at I-25 on sheet 1). A run of bus street
  shorter than 14 px from a corner, leaving a street at least as wide, that
  ends at a fork where every street going on is drawn at most half its
  width, takes the widest of those streets' weight. Judged by the page's
  widths, so it acts where the quiet step is a hairline (sheet 1: 11
  places) and almost nowhere else (sheet 3: 1, a stub into a transit
  centre's loop; sheets 2 and 4: none).
- 2026-11-15: Sheets: the busiest streets a size up (#117, Chris: "Colfax
  should be thicker"). A bus every 5 minutes or better (classes `c5`, `c3`)
  is drawn 1.3 times rail's width on sheets 1 to 3, core included; a bus
  every 10 minutes stays at rail's width. Taken from the build's classes,
  so it is whichever streets RTD runs that often. Downtown stays open:
  those classes are about an eighth of its bus ink on sheet 3.
- 2026-11-15: Sheets: bus streets in blue, frequent ones as a tint (#117,
  Chris picked "Tint firmer" of eight options). The greys and lit core give
  way to one blue in the hue the rail colours leave free; a frequent street
  is a pale band with a spine of its step's ink. Teal was dropped: it sat
  10° from the W line. Rail's inks are unchanged.
- 2026-11-15: Sheets: the Flatiron Flyer in rose (#117, Chris picked "Rose"
  over silver and none). First drawn as a cased line a step below rail with
  station dots; Chris: it "looks too much like a rail line, and not like
  the 15". Now drawn as any bus street of its frequency with only the hue
  changed. Which routes are rose follows RTD's route category (the one RTD
  files the FF under); RTD's regional routes stay regular buses ("the
  flyer can stay a separate color"). Silver was dropped: near the white of
  station marks in the dark.
- 2026-11-15: FF drawn as an express in rose, not called BRT (Chris, 2026-11-15).
- 2026-11-15: Express and airport marks (#117). Chris picked a dashed
  centre plus shields for the FF over a shadow and chevrons (chevrons read
  as stop marks at phone size), then a lozenge shield over a diamond and a
  hexagon. Airport buses (RTD's SkyRide category) get their own colour, the
  dashed centre and a plane; Chris picked indigo over jade. Slate was
  dropped (looked like any street), amber can't fit between the C and G
  lines, and light blue is the A Line's. The indigo was lifted a little
  lighter after the pick so it tells from the E Line in the light theme.
- 2026-11-15: Sheets: a street folded into one beside it adds its routes
  only along the stretch they share (#117). Before, the kept street took
  them along its whole length, so a route a block beside a long street was
  drawn all down it (Chris: the AT east of County Line). Every sheet's bus
  pieces checked against each route's own GTFS shape: 655 piece-routes off
  their shape before, 3 after: on sheet 1 the 24 near Civic Center, where
  a thin strip of two streets is drawn as one at that scale, and on sheet 4
  the 59's end loop, drawn off its own shape (a shape fault, not a route on
  the wrong street).
- 2026-11-15: Sheets: a turnaround's sweep is drawn only where it stays
  within a street's width of the street, and a side of a thin strip that is
  not drawn hands its routes only to the sides drawn beside it (#117).
  Reason: on sheet 4 the 59's end loop round blocks was swapped for one
  curve about 450 m inside it (and loops of the PD, 73, 3 and 15 were bent
  the same way on sheets 3 and 4); on sheet 1 the 24's short crossing of
  the strip between Colfax and 14th handed it to the whole strip, so it was
  drawn to Civic Center. Pieces carrying a route off its line (RTD's route
  layer, which the sheets are drawn from; first written here as its GTFS
  shape, which agrees with it to a metre): 3 to 0 on all four sheets.
- 2026-11-15: Route accuracy is checked from data, every sheet, against
  both of RTD's sources (`npm run check:accuracy`, "Route accuracy" under
  Bus routes), and what the sheets may leave off or draw simpler is written
  down there (#117). Fixes: a ring too small to draw leads the streets that
  met it round to its point (the 169L and AT stopped 1 km short on Peña
  Boulevard on sheet 2); an end a hair off a street just short of its corner
  is led to the corner (the 169L dropped by 61st and Peña on sheet 3); a
  turnaround loop carries only the routes that go round it (the 42, 88 and
  105 were drawn 80 m round the 28's loop on sheet 3); a strip's ladder
  rails are never more than a slim width apart; a street is cut wherever its routes change,
  however short the run, not merged into its neighbours'. Reason: Chris asked that accuracy be settled from
  GTFS and RTD's published lines, not by eye. What the check couldn't
  explain: 84 pieces and stretches to 0 (most were the simplifications now
  written down; the rest came from these causes).

- 2026-11-15: No route is drawn on a street it doesn't take, and no
  route's end of 250 m or more is left off, on any sheet (#117). Two ways
  round a strip are one street only where the way not drawn lies within the
  street drawn; a short end, a terminal loop and a ring gathered to a point
  are left off only while under 250 m too; ends a hair apart in a row weld
  to one corner (the nearest), and a street drawn out and back keeps its
  tip where another street meets it. Reason: Chris's bar is a map that is
  accurate: on sheet 1 the 72 and the 28 were drawn up to 670 m off, on the
  FF's and the 20's streets, and on sheet 2 the 65's end toward Thomas
  Jefferson High School was left off for 590 m. `check:accuracy` holds
  both: 0 on all four sheets.
- 2026-11-15: Sheets: a picked route reads as one clean line, framed whole,
  with a two-line card (#117). The picked bus line is the route's own
  composed line (joined, gaps closed, stubs and a close second street
  dropped, smoothed, round ends) instead of its street pieces drawn again; a
  name it runs under keeps a tight halo and drops its letter row while it is
  picked, not a knockout; a pick link frames the whole route above the card
  where it fits on the link's sheet; and a station name the screen's edge or the
  page's own controls would cut is hidden whole. Reason: Chris, from the 28
  picked on sheet 1: "this isn't how this should look, right?" (a tangle at
  Union Station, stair steps, gaps, a knockout reading as a gap, an arrow
  end, a card saying "Route / Bus / 28" over a quarter of the screen, the
  route not framed, names cut at the edges).
- 2026-11-15: Sheets: a picked bus route has no station name on it, and a
  link with a pick opens that route's card (#117). A name a route runs under
  has a second place off it, shown while that route is picked; with none,
  its halo knocks the route out under the name. Reason: Chris, from a review
  link with the 28 picked: "The Union Station label sits on top of route
  28", and the route lit up with no card saying which route it was until he
  tapped it.
- 2026-11-18: The whole district as sheet 0, at zoom 8, one step out from
  the sheet the page opens on (#152). Stepping out frames the whole network;
  it names only the hub and each line's far end, and only towns in RTD's
  district. Reason: Chris asked for a full system view one more zoom-out
  level on mobile. A first draft zoomed out about the reader's place, cut
  names off at the screen's edge, set the hub's name on Westminster's, and
  lettered Greeley and Windsor; on 2026-11-18 he chose framing and left the
  naming and the towns to Claude.
- 2026-11-18: Sheet 0 drawn at zoom 8.75 and framed on the rail network,
  resting as close as fits it on each screen, up to just short of sheet 1's
  band; a name's letters are held to it in pixels there. Reason: on his
  phone Chris found zoom 8 "a little too zoomed out", and asked what the
  view looks like at its best size on a phone and on a desktop. Of one zoom
  for every screen, or a zoom that fits each screen, he chose the second.
  He then asked that it be properly centred: it had been centred in the
  screen above the sheet buttons, which sit only in a corner on a desktop,
  so the network stood high; it is centred on the whole screen now.
- 2026-11-18: Sheet 0 framed on the frequent bus network side to side and
  the rail within it top to bottom, 32 px clear at the sides; the airport's
  name set where the A line leaves the frame, pointing to it. Reason: Chris
  sent his own phone view, panned and pinched to about zoom 8.94 with
  Boulder to Parker across and the A line running off the east side, and
  said: "I think it needs to be this, but with a fix to the label, so that
  you can see that it's Denver airport off to the side". Framed on the rail,
  a 402 px phone rested at 8.94 too but centred on the airport; the new
  frame rests a 402 px phone at 8.94 on his view.
- 2026-11-18: The airport's name moved up to where the A line goes off a
  phone's screen, on one row, with a drawn arrow turned toward the airport
  in place of "›". Reason: Chris, on the first version: "the Denver airport
  label is in the wrong place on that map. It's way too low, and the arrow
  isn't pointing to the right place"; "Maybe it literally says Denver
  airport with an arrow". It had been set where the line crosses the
  frame's side, below the bend where the line turns north to the airport.
- 2026-11-18: A tap on a line or street with one route picks it at once and
  shows the route's small card, not the full card with its one route as a
  button to tap. Reason: Chris, on a tap on the T line: "the box that comes
  up showing the line is huge compared to what it needs to be, and it only
  has one line, so obviously that one is the one that should be selected
  automatically".
- 2026-11-18: Other lines' letters are hidden, not faded, while a route is
  picked, on the sheets and the classic map (#153). Reason: a faded E disc on
  the shared track sat on the picked T line, so it didn't read as one
  unbroken line.
- 2026-11-18: The roadmap after launch redrawn around the zoomable map. v2
  ends when the map zooms smoothly, and its milestone holds only the steps
  to that, in order (#129, #154 to #161). The classic map's features move
  to v2.x, now "Classic features, other times and Live". Faults written
  against the classic map's drawing move to a new milestone, "Parked:
  recheck on the zoomable map", and are rechecked before v2 is signed off.
  Reason: Chris asked for the issues to be sorted into the roadmap to v2
  and the rest. The v2 milestone mixed the path to the zoomable map with
  faults in a drawing it replaces, and the smooth zoom can ship before the
  classic features come over.
- 2026-11-21: Separate the active map versions for handoff. Preserve Classic on
  `classic-archive` at `811135f`, remove its page, startup and CSS from the deployed
  site, and move its remaining renderer dependencies and browser checks into
  `qa/classic/` for historical regressions. Old Classic links redirect to the
  current map. `main` owns the sheets, `zoom-prototype-154` owns the smooth-zoom
  experiment, and current/shared fixes flow from main into the trial. Standard
  browser and nightly health checks now exercise the sheets. Reason: Chris
  asked to make the version separation concrete while both active tracks continue.

- 2026-11-21: Routine visual and interaction QA belongs to the implementation
  agent. It inspects captures, fixes defects, proves regression checks on bad
  examples and recommends technical choices from evidence. Replace blanket
  user inspection of every sheet or zoom band with that verification. User
  requests are limited to prepared device-only checks, unresolved product
  tradeoffs and brief formal-release approval. Quality requirements and honest
  reporting of real-device evidence gaps remain. Isolated engineering can
  continue under parity checks while those requests are pending. Reason: Chris
  asked the agent to take on fixing and evaluation rather than defaulting to
  extensive manual review. The workflow is in `docs/verification.md`.

- 2026-11-21: Make evaluation version-specific and evidence-backed. Current-sheet
  whole-feature audits and fingerprinted captures are distinct from historical
  Classic recall. Report detector blind spots, triage heuristic findings, and
  keep unmeasured criteria explicit. Fixes require rider priority and comparable
  before/after evidence; preserve score minimums and agent-owned routine QA.
  See docs/evaluation.md and the dated scorecard.
- 2026-11-23: The whole district's frame takes in the bus streets between its
  sides top to bottom, keeps 44 px at the sides, may rest as far out as 8.5,
  and leaves off a town's name that would run off the screen. Reason: on the
  v1.0 launch check Chris said "On my phone, Longmont is cut off, and I have
  to scroll a little bit". In Safari his map is about 402 by 655 px; Longmont
  lay north of the frame, and Boulder's and Parker's names ran off the sides.
- 2026-11-23: Each stop letter of a table in its own colour, by row, on the
  streets, the stops, the table and the card. Reason: Chris, on the
  neighbourhood sheet: "Let's make the XYZ stops different colors or something
  so that they're easy to distinguish because the letters are small. The
  alternative is to make the XYZ letters bigger." Bigger squares don't fit:
  on sheet 3 they stand about 22 px apart along the street.
- 2026-11-23: A stop each way either side of a crossing is one ring at the
  crossing. Reason: Chris, on the street sheet: "The pair of free ride stops
  aren't helpful. Those should just be a single stop at the intersection."
  The rule comes from RTD's stop names, so it applies wherever a route has a
  stop each way within 50 m at one crossing (686 rings fewer on sheet 4).
- 2026-11-23: The loading pictures are taken in the build that deploys
  them, not from the live site afterwards. Reason: after each change the
  live page showed "Loading…" on plain ground until a GitHub job had taken
  new pictures and Cloudflare had built again, and for up to a day after a
  new basemap tile build. Chris: "Why don't we just rebuild it when we push
  the change?" The refresh Worker now also rebuilds on a new tile build.
- 2026-11-23: The pair rule above is for free routes only, the ones RTD names
  free (the FreeRide and the MetroRide). Reason: shown the same
  rule on route 65 at Monaco & Mansfield, Chris picked "FreeRide only".

- 2026-11-24: Stops snap to their line from up to 100 m, stops no trip calls
  at are dropped, and the hub's name carries the letter of a line whose far
  end is too near to name (#168). Reason: the evaluation found 22 stops off
  their lines on the street sheet (station bays and set-back stops the drawn
  street passes, and six Ward Rd stops for a 52 that no longer runs there)
  and no B letter on the whole district.
- 2026-11-24: The street graph is tidied after each merge pass, and a line
  whose last stop is behind its end ends level with the stop (#102). A sheet
  names a street one way, the ground map's name for a street our labels
  name on screen is hidden, and a bus station that isn't a rail station's is
  named beside its hall from sheet 3 (#174). Reason: the v1.0 check found a
  spike and a hook at Eastlake / 124th, "Colfax" beside "Colfax Ave", the
  same street named twice, and Civic Center's hall with no name. The line
  is cut level with the stop only where it ran on 40 m or less; farther is
  the bus's way round to turn, drawn to its tip (the 323 on Olympia Ave).
  Stops the same way round that land ring on ring keep a ring each (the
  120L's Gate B had become part of Gate A's ring). The picked route's own
  street names stay on the screen while it is picked.
- 2026-11-24: The map is built on our machine and committed; Cloudflare only
  publishes (Rule 2). The hourly check sends a phone alert instead of
  rebuilding, and `npm run build` on Cloudflare checks that the committed
  data was made by the code going live. Reason: Chris: "I don't actually want
  it to check RTD data and rebuild, because there's probably things we're
  gonna need to tweak when there's new map data." RTD's schedules change
  three times a year, so building those by hand costs little, and each
  Cloudflare build no longer takes about 12 minutes. This replaces the
  2026-11-01 entry's automatic rebuild and the refresh Worker.
- 2026-11-24: The site has a favicon, a Home Screen icon and a manifest
  (#177), and the build retakes the link preview. The icon is a square of the
  real map at Union Station, exactly as drawn. Reason: Chris turned down an
  icon drawn for the purpose ("There is no station that looks like your fake
  example!") and then the same map with its streets and names hidden ("You
  hide too much and it's a meaningless image"), and picked the middle of three
  real squares.
- 2026-11-24: On sheet 2 a small box stands for the 15th & 17th table: its
  title, its letters and "Tap", tied to downtown by a hairline; a tap opens
  the full table (#170). It may lie over quiet bus streets, since no place
  clear of them is near enough. Reason: Chris asked for "a downtown table or
  some kind of box that represents downtown" on the city sheet, where the
  table didn't fit, and picked the small box from three mocks.
- 2026-11-24: A turnaround whose own path runs against rail is drawn as a
  sweep clear of it, even where the sweep strays further from the street
  than the rule for smoothing allows (#97). Reason: Chris, of Union Station:
  the light rail "overlaps the bus routes in a way that a hand drawn map
  wouldn't". The 15 and FreeRide loop's own path ran against the E Line and
  its stop ring sat on it; the street was right, the rail drawn wider.
- 2026-11-25: Map work follows one written method (docs/refining.md) and
  keeps a work log as it happens, shown under its step on the roadmap;
  docs/upkeep.md says how the map is kept working. A weekly round
  (qa/round/) sweeps the map and proposes fixes on the review page, and only
  what Chris picks is fixed. Reason: Chris: "this type of process is what we want to have going
  on regularly to refine the map", and once it is finished "it should be
  clear how we're doing what we're doing to keep it working".
- 2026-11-25: The live page shows a timing readout when its address has
  ?timing (public/js/timing.js, loaded only then): when the files arrived,
  the tiles were ready and the opening view was drawn. Reason: a visit took
  about six seconds on Chris's phone, while the test copy opened in under a
  second there; only the live address on his phone can show the difference.
- 2026-11-25: The opening does less on the phone's main thread (PageSpeed
  Insights' mobile score, which counts each long task the page makes the
  phone wait through): the farther sheets, the warmed tiles and the offline
  copy start at the reader's first touch or 5 seconds after the opening
  (the two neighbouring sheets still load at once, so an early step finds
  its drawing);
  the warmed tiles are the neighbouring sheets' only; layers share GL
  programs (17 to 10, the drawing unchanged to the pixel); MapLibre's
  stylesheet no longer blocks the first paint; and the stop tables' plates
  are drawn on CPU canvases, which the sheets page had missed (#105).
- 2026-11-25: Sheets: no step before the next sheet is ready. Chris: an
  early step still flashed bare ground, so the map should not zoom until it
  can, and say it is loading. A tap or double tap waits with a "Loading…"
  line and then steps; a pinch or a scroll stops at the sheet's edge with
  the same line and steps on once the tiles are in; 8 seconds at most. The
  farther sheets now wait until a step either way is ready, so they never
  hold one up. Chris: the wait made a step slower than before; the tiles a
  step needs now load from the opening, not the first touch.
- 2026-11-25: The 15th & 17th table is a key on the screen, not a plate or
  a small box on the map (#198, replacing the box of 2026-11-24 and the
  plate placed on open ground): it shows in a free corner whenever a
  lettered stop is in view, and fades out and in, moving corner if need be,
  as the map moves. Reason: the weekly round found the table hard to read
  at Union Station, and Chris: "it should always be on screen when it is
  supposed to be on screen, and so we can move it to different locations on
  the page that we have and fade it in and out once you scroll around".
- 2026-11-25: The pick check counts a stub only beside the rest of a
  route's line. A route drawn whole as one part shorter than a stub is
  listed as small, for information. Reason: the only two stubs it found
  were the FreeRide and the MetroRide on the whole-district sheet, each
  drawn whole as one 8 px dash, with nothing for it to be left over from.
  Chris said go.
- 2026-11-25: The opening view's glyphs are fetched by the page's head and
  handed to the map, not preloaded, and the punctuation glyph files hold
  only what a label can use (about 10 KB sent to about 2 KB each). Reason:
  on Chris's iPhone the opening view was ready within 70 ms of the glyphs
  arriving in each of four runs, and they arrived last: the timing readout
  showed seven glyph and font requests where Chrome makes four, which reads
  as Safari fetching the preloaded files again when the map asked. The drawing is
  unchanged to the pixel (5 zooms, both themes).
- 2026-11-25: The sheets are cut into vector tiles when the site is
  published, not sent whole for the phone to cut, and the basemap's tiles
  are the site's own (`basemap/`, from OpenFreeMap's planet file, trimmed to
  what the style draws), not fetched from OpenFreeMap's tile server.
  Offline, the page keeps the tiles of places looked at instead of every
  sheet's whole drawing. Reason: on Chris's iPhone the opening waited on
  the phone parsing and cutting the opening sheet and on a second
  connection for the ground, and every sheet's whole file was downloaded
  in the background (sheet 4's 4.85 MB). Chris: "Don't we also want to
  serve the base map ourselves?" and "Yes, let's do that."
- 2026-11-25: The map starts with the opening sheet's layers only and adds
  the other sheets' layers once it is first ready, and the opening sets its
  sheet without a move. Reason: the timing readout's map-worker rows on
  Chris's iPhone showed each worker reading the whole style, two-thirds of
  it for sheets not in view (37 to 158 ms a worker), and the opening's
  380 ms move to the zoom the map was already at kept MapLibre from calling
  the map ready until it ended (a reload ready at 785 ms, drawn by 664).
  The drawing is unchanged to the pixel at 18 views in both themes, and a
  step through every sheet gives the same layers in the same order.
  Chris said go.
- 2026-11-25: Sheets: a tap during a step's wait adds a step (#210). Each
  tap on + or − counts from the sheet the map is going to, not the one
  shown, clamped at the first and last sheets; − during a wait for + ends
  it. The map goes one sheet at a time, each step waiting for its sheet.
  The + and − keys go the same way instead of through MapLibre's own
  keyboard zoom. Reason: three taps on + during a wait gave one step, since
  each asked for the same next sheet. The checks wait while a step is held.
- 2026-11-25: Sheets: + and − step when the finger lifts (#210), and the
  click a browser makes of that tap is not counted again; a click with no
  touch before it (a mouse, a key, a screen reader) steps as before.
  Reason: on Chris's iPhone quick taps were lost; Safari makes no click of
  a tap within about 300 ms of the last one.
- 2026-11-26: The page head builds the map's drawing programs in a worker
  (OffscreenCanvas, KHR_parallel_shader_compile) while the map downloads,
  from the programs recorded from the map when the pictures are taken
  (public/data/programs.json, kept in the offline copy; the publish check fails if they are from
  another drawing or MapLibre). The head also asks at once for color.js and
  often.js. Reason: on iPhone 17 Pros in AWS Device Farm that had never
  opened the map, MapLibre building its ten programs at its first draw
  blocked the page about 600 ms (Chris's own phone keeps them, so his runs
  never showed it); with the worker, the time from the code arriving to a
  live map fell from 864 and 941 ms to 586 to 655 ms in four runs, and
  reloads are unchanged. Waiting on each program in the worker held up the
  map's own first GL call and saved nothing, so the worker never waits on
  them. Chris: find "what is causing it to be slower than it needs to be".
- 2026-11-26: Steps keep making the other sheets' tiles ahead (main.js warm(),
  which reaches into MapLibre's tile managers), and now go at once if a
  MapLibre update takes away what it uses (canWarm). Reason: asked whether it
  is worth what it costs a future maintainer, Chris had it measured. In 24
  first visits on mini (headless, emulated 9 Mbps phone connection,
  alternating), a step 3 s after the map appeared showed 0 blank frames and
  finished in 0.79 s with it, against 11 to 15 of about 20 frames blank and
  1.02 s without. A tap the moment the map appears waits about 1 s and
  finishes later (1.75 s against 0.98 s), but with no blank frames. With the
  internals renamed and no check, the step waited the whole 8 s cap before
  going; test/maplibre-internals.test.mjs now fails when an update renames
  them. Chris: "Do the second one" (measure it before deciding).
- 2026-11-26: MapLibre 6.15.0 -> 6.19.0. The version stays pinned exactly, so
  a rebuild never changes it on its own; it moves only by a change like this
  one, checked before and after. Reason: it had not moved since the map was
  built, four releases behind, and 6.16 fixes two iPhone faults that hit the
  map from the Home Screen (it stopped loading after iOS shut down its
  workers; it shrank to one pixel on return from the background). Checked: on
  mini 18 views and 7 steps identical to 6.15 to the pixel; on the Mac in
  WebKit (Safari 26's engine) at iPhone size, 20 views in light and dark
  identical, opening and steps as fast, no new errors. Chris: "Update, with
  the Mac check".
- 2026-11-27: The Overpass font is swap-display, not block. Reason: on
  Chris's iPhone at about 0.65 Mbit/s (the page's ?timing readout), the font
  came in at 8.3 s with everything else, and the block-display "Loading…"
  line kept the screen empty until 8.4 s. Holding the map's downloads until
  the loading picture is in (#222, branch first-paint) showed the picture
  much sooner on slow links but drew the map 0.3 s later on typical 4G; it
  waits until real load times (Cloudflare Web Analytics) say how many
  visits are on slow connections. Chris agreed: land the font change alone.
- 2026-11-27: The built map (`public/data/`, `public/poster/`) is no longer
  committed; `npm run deploy` uploads `public/` to Cloudflare Pages from mini
  after the publish check, and a merge publishes nothing. Reason: the built
  files were most of what each pull request changed, and Cloudflare's build
  only re-checked what mini had already built.
- 2026-11-27: Live, the route panel and route tracing, stop and station
  panels with next departures and alerts, and search come to today's sheets
  first, in a new milestone, v1.3 (#162, #13, #22, #238), built so the
  zoomable map reuses them. Other times and Live tiers stay in v2.x until
  #233 settles how they fit the zoomable map's drawings, since each drawing
  holds one time's frequency classes and route lists. The v2 plan (#129) is
  rewritten from the zoom trial, the consistency proposal and Chris's
  answers of 2026-11-26. In order: the other-times decision (#233); the
  groundwork, one lettering plan the build writes and the page draws
  (#234); base-map names placed by our build (#235); streets that only
  split and sizes as zoom rules (#155, with #81 moved out of Parked); what
  carries between zooms (#156); then hand fixes that hold across zooms
  (#64), landmark tints (#243), our own ground (#241) and area and river
  lettering (#242), which Chris put next after the lettering; then
  drawings at every whole zoom (#157), zooms 8.75 to 12 (#236), tiles
  (#237), the page, checks, review and close. The zoom-14 sheet's express
  braid is fixed on today's map first (#240; Chris, 2026-11-27). Reason:
  since Classic left the site on 2026-11-21 the live map has no Live,
  search or other times, and a tap gives a short card with no departures
  ("What people can do", items 2 to 5); most of these sit on top of the
  drawing rather than in it; and the plan of 2026-11-18 no longer
  described the work the trial found. Chris: yes to both.
- 2026-11-27: The project is moving to the zoomable map, so today's sheets
  get only what carries over to it easily: search (#238), the route panel
  with its frequency rows (#162, #22) and next departures and alert panels
  (#13). Route tracing and Live vehicles wait for the zoomable map (#251,
  in v2.x): tracing draws from the sheets' own route-line layers (#193) and
  Live vehicles depend on how v2 serves its drawings (#237), so either
  would be built twice. Each v1.3 piece is its own module under
  `public/js/` that never reads sheet state (no sheet numbers, no sheet
  layers, no step code); moving the map to a result or a card is one small
  function, the only part v2 replaces. This narrows the v1.3 entry above of
  the same day. Chris, about 15:30 MST.
- 2026-11-27: Search on today's sheets (#238). The box is the top row, as
  "Layout" has it, so the loading line and the keyboard's "List what's in
  view" button moved under it, and a picked route from a link is framed
  below it. A place search finds is ringed on the map: a tap marks its own
  place with the finger, a search result has none. The "Lines" button is
  not part of this; the keyboard's list of what is in view stays.
- 2026-11-27: The route panel on today's sheets (#162) with weekday
  rush-hour and evening rows (#22). The panel is folded under the picked
  route's two-line card, so the card still covers as little of the map as
  it did; "Times through the week" opens it. #22 was not blocked on #11:
  the rows need two more measures per route, in windows DESIGN.md already
  set, and #11 is the Key's time chooser. One-way rush service says "one
  direction": the less-frequent-direction rule alone gave an express no
  rush-hour figure at all.
- 2026-11-27: The section "Four sheets" is now "Five sheets" (#229, phase 2).
  The map has had five since sheet 0 joined (#152); entries above keep
  their wording. Text that described the removed classic map's link
  picture and tab title now says old classic links redirect.
- 2026-11-27: The smooth-zoom trial's branch is `zoom-154-merge` (PR #224),
  not `zoom-prototype-154`. On 2026-11-23 the trial's history was rewritten
  without the tailnet addresses in its fix register, under the new name, and
  the old branch left GitHub. Every commit of the old branch has a twin
  there with the same change, so no work was lost.
- 2026-11-27: Next departures on today's sheets (#13), scheduled first.
  The build publishes every stop's timetable in small files and the page
  works out "next" for today's real calendar, so nothing is rebuilt daily
  and a holiday shows its own timetable. Scheduled times are clock times;
  minutes are kept for live predictions, which are not built: RTD's
  TripUpdate feed reaches the page only through the Live relay, and Live
  waits for the zoomable map (#251). Alerts in panels are not built
  either: the relay asks RTD for alerts only while someone has Live on.
- 2026-11-27: While the map loads, the page shows RTD's rail lines with
  pulses flowing out from the hub along them, in their own colours and
  where the map will draw them, and
  the "Loading…" line, all drawn in the page itself; not a picture of the
  opening view (#222). This replaces the picture of 2026-11-12 and the
  download order tried on the first-paint branch (#226). Reason: the
  picture was 90 to 102 KB of the about 680 KB a phone fetched before the
  map drew, and on a normal connection it gave nothing but cost the map's
  downloads that share of the line. Chris: "show something immediately,
  with no extra download", then, on the measurements, "we shouldn't use
  the picture anymore", and he picked the rail sketch from four looks
  (review of 2026-11-27: the sketch, trains on grey tracks, line bullets, a
  small mark) because he wanted "something visually interesting". On the
  first version, which drew the lines in once: "it just sort of sits there
  when what it should probably do is either pulse or something like it
  should branch out and repeat that until it loads".
  Measured locally with the pulses (Chromium at iPhone 14 size, 4x CPU,
  light and dark, three runs each): 583 KB before the map, was 689 KB (677
  in dark); the map drawn at 3.35 s on typical 4G (was 3.51 s), 5.79 s on
  slow 4G (was 6.50 s) and about 11 s at 0.65 Mbit/s (was 12.1 s), the
  same with no throttling (2.85 s, was 2.90 s); the lines on screen from
  first paint (0.4 s on slow 4G), where the picture showed at 3.1 s on
  slow 4G and 6.5 s at 0.65 Mbit/s.
- 2026-11-27: Live predictions on stop and station cards (#13; Chris, about
  20:10 MST, with the relay change). An open card asks, since the sheets
  have no Live button. The relay sends a page only its own stops, and asks
  RTD for trip updates only while a card is open. Predictions are matched
  to the timetable by trip, so the build keeps each departure's trip id in
  files only live pages read; matching by route and nearest time was
  rejected because a wrong match shows a rider a wrong bus. Nothing stale
  is shown as live, and the card always says which kind of time it shows.
  The relay deploys before the page, and the page works with the old relay
  (scheduled times).

- 2026-11-27: Sizes are functions of zoom between the five sheets and the
  "which sheet" switches are the zooms at which the thing comes in (#155),
  so main's build draws any zoom from 8.75 to 16. Sheet 3 draws the joined
  street graph, making a divided road one line out to zoom 16 (#81, #240):
  at 41st / Fox the I-25 express braid is gone, and sheet 3's doubled bus
  ink falls from 276.4 to 183.4 km. The street merge distance is held in
  ground metres so streets only split as the map zooms in. The page still
  keeps its own copies of five sizes until the lettering plan (#234) gives
  it the build's tables.

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
