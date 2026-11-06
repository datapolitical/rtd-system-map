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

This is the view that opens. It shows every route RTD runs, drawn by how often
it comes on a typical weekday, 9am to 3pm:

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
(median) gap between departures at the route's busiest stop within a time
window. A route's tier is set by its less frequent direction. The window
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
| Hourly | 31–60 min | thin |
| Infrequent | more than 60 min, or a single trip | thin, light |
| Not running | no departure in the next hour (Live, picked time); no trips that day (typical times) | hairline, faint, no tag |

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

**What the build publishes for this.** The build doesn't fix one answer. It
publishes:

- **The weekday daytime tiers** on the route lines themselves, as now, so
  the full map draws with nothing else loaded.
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

- Rail carries its bullet at both ends with where it goes, and along the line.
- Buses carry their number, starting with the frequent ones.

When something is drawn but there's no room to name it, it's drawn lighter
until there is. The by-zoom table below is built on this rule.

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
  can find an intersection; smaller streets from 14.5
- **Interstate and US highway numbers** in quiet gray shields from zoom 8.5
  ("east of I-25" is how people say where they are). The shield shape keeps
  them from being read as bus route numbers.
- **Neighborhood, town and city names**, in plain sentence case
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
color alone: every line carries its letter in a round bullet, and from the
opening zoom each end of a line has a sign with its bullet and where its
trains say they're going ("A, Denver Airport"; see "Symbols").

### Rail frequency

Rail stays heavier than any bus at every tier. 15-minute rail is full width;
30- and 60-minute rail is a step thinner; rail with only a few trips or
rush-hour trips is dashed and drawn *beneath* full-service rail, so on shared
track the line that actually runs wins. The exact weights are settled on
screen in V2 step 3.

### Stations

| State | How it's drawn |
|---|---|
| Served | a white capsule with an ink edge laid across the track, as wide as the lines it serves and turned to the track's direction; a circle where one line stops |
| Returning | hollow gray ring from zoom 12, gray label from 14. Panel: "Trains return Nov 23" |
| No current service | hollow gray ring from zoom 12, gray label from 14. Panel: "No train service right now" |

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

The build works this out from the geometry every time
(`scripts/lib/sharedtrack.mjs`):

1. Find where two or more lines run within 20 m of each other, point by point
   along each line. Runs shorter than 200 m are smoothed away.
2. Group the shared runs into *places*: runs of the same set of lines that
   touch. The same lines can share track in more than one place, and each
   place is ordered on its own.
3. Order each place's lines by which side each one leaves toward, measured
   over 1.2 km past each end, so lines don't cross where they part. Bigger
   places are ordered first. A smaller place whose lines all go on into a
   bigger one keeps the bigger one's order, so lines don't cross where one
   joins or leaves either (E and R stay side by side south of Lincoln, where
   the T ends).
4. Point every shared piece the same way (east, or north), and save each
   line's slot in its place. The map turns the slot into an on-screen offset
   that stays the same width at every zoom.

Where a line leaves a bundle, the others close up by half a line's width at
once. A smooth taper is a known gap.

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

Route numbers sit in their lines until zoom 14: bold numbers in the line's
ink, knocked out of the line, so the line breaks around its number. From 14,
where lines are wide and streets are named, numbers get small white tags
outlined in the line's ink. Filled tags from far out were tried and rejected:
they read as highway shields, covered streets, and outweighed the buses they
named. A number follows the tier at the time shown, so the 15 is navy at noon
and may be slate at 10pm.

When numbers appear:

- **Frequent routes:** from the opening zoom, one number per route, placed
  where the route runs alone, away from other frequent routes and well away
  from rail, so it can only mean one line. The build places them one at a
  time, the routes that run most alone first, each clear of the signs and of
  the numbers before it on a phone, a laptop and a desktop. Where there's no
  room, the route left without a number is one that shares its street with
  another: downtown, the 0L, 15L and FreeRide, and on phones a few more in
  central Denver. They get their numbers by zoom 10, except FreeRide, which
  sits under the Denver name until numbers repeat along the line from 11.5.
  A number sits on its line, or just beside it where a city name is.
- **Every-30 routes:** from 11.5.
- **Every route:** from 13.
- **Not running:** no number.

**Corridors.** Where several routes share a street and its stops, riders can
take whichever comes first. The build finds these shared stretches from GTFS
stop sequences and draws the corridor once, weighted by the combined
frequency of the routes on it (two routes every 30 minutes, evenly spaced, are
a frequent corridor). Only stops both routes serve count, so a limited-stop
route adds to the corridor only at its stops.

### By zoom level

Each bus tier fades in over about a zoom level rather than popping on.

| Zoom | Shows | Also in Live |
|---|---|---|
| Up to 10 (the opening view) | District wash and relief. Rail, with a sign at both ends of each line. Frequent buses and corridors, each with one number. Stations. Every town and city in the district, the airport, downtown, and the main campuses. Highway shields. | Alert marks on rail, closed stations |
| 9–11.5 | Every-30 buses from 9, drawn lighter until their tags arrive. Hourly and less from 10.5. Station names and rail bullets along the lines from 10.5. Part-time buses and neighborhoods from 11. | Train positions from 11 |
| 11.5–13 | Every-30 numbers. Main street names from 12. Park-n-Rides, transit centers, and unserved stations from 12. | |
| 13–14.5 | Every route's number, in tags from 14. Line-end signs give way to station names. Landmarks and unserved station names from 14. | Bus positions, alert marks on bus routes |
| 14.5 and up | Bus stops (loaded only when first needed) and smaller streets | Closed stops crossed out |
| 16 and up | Stop names, with the routes that serve each stop | Vehicles' route numbers |

### Symbols

- **Park-n-Ride:** a small slate "P" sign drawn as an icon, not a text
  square, set just up and to the left of its spot so it never covers a
  station. One size for all; the panel gives the number of spaces.
- **Line-end signs**, from the opening zoom to 13: a white sign at each end
  of each line, with its bullets and where trains there say they're going.
  The name is the GTFS headsign without the line's own name ("W-Line Jeffco"
  becomes "Jeffco", "Train to Alameda Station" becomes "Alameda"); a headsign
  that spells out the station's name uses that name ("Union Station"). Lines
  ending together share one sign. Where more than three end together (Union
  Station), it's one ink sign with the name alone. The build picks every
  sign's side together: the arrangement that covers the least track and
  reaches least past the network's edges (the stations' width, which is what
  phones fit, and the desktop's frame above and below), with no two signs
  meeting at any scale from the smallest phone's opening view in to where
  signs give way. Each pair is checked at a dozen scales, because two signs
  facing each other can clear at one and meet at another. Phones open wide
  enough to show every sign whole, from 360 px wide. Signs claim their space
  first, then city names, which move just beside their point rather than
  disappear, then route numbers.
- **Rail bullets** ride along each line from zoom 10.5, so a line can be
  named anywhere on screen, not only in the key.
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

Basemap tints (`PALETTE` in `public/js/basemap.js`): land `#F4F5F6`, water
`#BCD5E4`, parks `#E0EADB`, roads white with a `#DFE4E8` casing, main street
names `#4F5B67`, outside the district a `#E3E7EA` wash.

**Type:** Overpass, a descendant of Highway Gothic, the US road-sign face.
Weights 400, 600 and 800, tabular numerals. Scale: 13, 15, 17, 22, 28 px.
The site serves the font itself (from the `@fontsource-variable/overpass`
package), with no request to Google. Map labels use Overpass too: the build
generates MapLibre glyph files from the same font (`scripts/glyphs.mjs`), so
the map and the interface share one typeface.

**Route bullets:** rail lines are a circle with the letter; bus routes are a
white rounded rectangle with the number, outlined in the route's ink. They are the only strongly colored
elements in the interface itself.

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
- **The key** is a small button whose icon is the key in miniature: a rail line,
  then a frequent and an every-30 bus line, at their weights. It opens on demand, and is open by default only on wide screens.
- **Zoom:** touch screens get no zoom buttons, because people pinch.
- **Locate me** is an arrow that fills blue once it has found you, and you're
  a blue dot with a white ring.
- **Map credits** sit in a small tab in the corner.

### Layout

Phone: full-screen map, with search and Live at the top. A bottom sheet
appears only when something is open.

```
┌───────────────────────────┐
│ [⌕ Search lines, places]  │
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

Search and Live are both within thumb reach of the top. The sheet has three
heights: peek (about 120 px), half, and full. Drag or tap the handle to move
between them.

Desktop (768 px and wider): the sheet becomes a panel on the left, about
380 px wide, floating over the map, with search at its top.

### Opening state

The first visit opens on the whole network, Live off. Phones frame the rail
network and its signs; wider screens frame the network drawn at full
strength (rail and buses every 30 minutes or better), beside the open key, so
the network rather than the district's far edges fills the screen.

- **Returning visitors** open where they left off, with Live as they left it.
  Someone who rides with Live on gets it back.
- **A shared link** opens on what it shares.
- **Location:** the page never asks for your location on load. If you've
  already allowed it, your dot appears without moving the map, because
  centering on you would assume the question is "what's near me".

### What the opening view tells you

Without a card or a caption, the first screen answers:

- **What the network is:** every line, drawn by how often it comes.
- **What each line is:** rail letters with where each line goes, and frequent
  bus numbers.
- **Where things are:** towns, the airport, downtown, campuses, the
  mountains.
- **How to see right now:** the Live button.

### One tap model

- Tap a vehicle (Live): vehicle details.
- Tap a station, Park-n-Ride, or stop symbol: that place.
- Tap an alert mark (Live): the alert.
- Tap a route's tag or a rail bullet: that line.
- Tap anywhere else: "From here" for that spot.

Routes are opened from a list (From here, a station, search), from their tag
or bullet, never by trying to hit a thin line with a finger.

### Highlight, don't list

Opening a route highlights it end to end, fades everything else to about
20%, and labels its two ends. The panel shows one route at a time; a list of
20 routes in a popup is never the answer. On phones the panel is the bottom
sheet; on desktop it is the left panel. The map's opening view and every
"fit to route" leaves room for the panel, so the panel never covers what it
describes.

### Stations lead with trains

A station's panel starts with its rail lines (bullet, where each goes, how
often), then the buses that stop there, then parking. An unserved station
says so first ("No train service right now" or "Trains return Nov 23").

### Lines list

A "Lines" view lists every rail line and bus route, grouped by tier and
searchable by number or name, so any route can be opened without finding it
on the map. It is also the keyboard path to every route.

### Shareable links

The URL reflects what's open (`#route=15`, `#station=…`, `#here=lat,lon`) and
when (`#at=sunday`, `#at=2026-11-27T18:00`, `#live`), so any view can be
shared or bookmarked.

### The key

Always one tap away. Its title says what time the lines show ("Weekdays, 9am
to 3pm", "Sunday, 9am to 3pm", or "Live, next 90 minutes"). Under the title
are the other times (Weekday evening, Saturday, Sunday, Pick a day and time),
then what each symbol means:

- **Frequency tiers.**
- **Rail lines**, each with its bullet and where it goes ("A to Airport"), not
  as a row of letters.
- **Other symbols.** In Live, these include vehicles and the alert mark.

It shows what a symbol means, not statistics about it: no route counts.
Entries appear only for things on the map (the unserved-station symbol only
when a station is unserved). It has no layer toggles: Live is the one switch
that changes what the map shows.

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
  - Bus stops (the largest file) load only when the map first reaches stop
    zoom.
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
   5. **Interaction** (next). Highlight a route, the bottom sheet and desktop panel,
      station panels that lead with trains, the Lines list, keyboard access
      to all of it, and padding so panels never cover what they describe.
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

## Open questions

- **Shared corridors (decided for V2 step 2, details open):** corridors are
  drawn by combined frequency (see "Bus routes"). Still open: how evenly two
  routes must be spaced to count. Two routes every 30 minutes that leave a
  minute apart are not "every 15" to a rider.
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
- **Dark mode.**
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
