# Fault classes: everything a transit map can get wrong

The checker's scope. It comes from first principles: what makes any transit
map wrong or ugly, and DESIGN.md's own rules (design-invariants.md). It does
not come from the faults that happen to have been reported. Reported finds and
planted faults (qa/recall/) measure how much of this the checker catches.
When a fault slips through, name its class here and make the checker find the
class, not the one case. The first test: the 52 faults in the opening view on
12 November (#114), which the checks must find without being pointed at them.

From first principles, not from reported faults. Each class: what it is, how a
detector sees it in the drawn model (or pixels), where it must run. "Every
view" means the whole district at every half zoom 9-17, both themes, plus the
opening view and every named view (Whole network, each line, each station).

## A. Continuity: a line is one unbroken path
A1 Break: a line's drawn path has a gap where its route has none (model: path
   endpoints that aren't route termini, closer than X to the same line).
A2 Stub: a short piece that ends, separate from the rest of its line.
A3 Hook / kink / zig-zag / sideways step: direction changes the track doesn't make.
A4 Start/end away from its terminus: a line ends short of or past its end station.
A5 Phantom continuation: a different line (rail or bus) lines up with a line's
   end so it reads as the same line carrying on.

## B. Junctions and hubs: you can see where every line goes
B1 Hidden junction: a mark or label covers the point where lines meet or
   diverge, so entry/exit directions can't be read.
B2 Lines don't meet the hub: lines that serve a station end visibly short of
   its mark, or pass by it.
B3 Knot: lines crossing or swapping order inside a junction more than needed.
B4 Hub mark out of scale: a mark much larger than its neighbours or than the
   lines it joins needs to be (reads as a hole).
B5 False through-line: lines of similar colour meet on opposite sides of a hub
   so they read as one line passing through (opening view: W-A, C-G, E-N).

## C. Shared track
C1 Order changes along a bundle without a junction.
C2 Uneven gaps, slivers (a line shown only as an edge), a line fully hidden.
C3 Bundle width or offsets jump.
C4 Station marks on a bundle read as breaks rather than stations.

## D. Marks
D1 Invisible: mark contrast against ground or line too low (either theme).
D2 Inconsistent: same kind of station drawn differently at the same zoom.
D3 Misplaced: mark off its line, or on the wrong line.
D4 Size jumps across zooms.
D5 Marks for things that aren't there / missing marks for things that are.

## E. Letters and names of lines
E1 A line on screen with no letter anywhere in view.
E2 Letters overlapping each other, marks, or other lines; hidden under a bundle.
E3 Letter on the wrong line or ambiguous between bundled lines.

## F. Colour
F1 Two lines too close in hue/lightness to tell apart (each theme; also for
   colour-blind simulation and greyscale where lines share track).
F2 A line's colour against the ground too weak (dark lines on dark).
F3 Non-rail things in rail-like hues.

## G. Hierarchy and weight
G1 Bus (or basemap) visually as strong as or stronger than rail at a zoom
   (measured as area x contrast in a view, not width alone).
G2 Level order wrong: quieter classes drawn louder than busier ones.
G3 Basemap competing: roads, water, parks, terrain louder than the network.
G4 No hierarchy where there is no rail: in a bus-only area the busiest
   corridor (e.g. US 36 to Boulder) isn't clearly the strongest line, and its
   stations aren't marked.

## H. Bus streets as streets
H1 Geometry that no street has: boxes, squares, circuit-board jogs, wedges.
H2 Dangling ends that aren't terminals.
H3 Bus line off its street.
H4 Width/class steps with no junction.
H5 Fragments: pieces of a route that connect to nothing at a zoom (floating
   stubs, a lone 'L' or hook), because the rest is filtered out or thinned.
H6 Closed loops that read as enclosures (a route's turnaround drawn as a ring).

## I. Labels
I1 Collisions: label on a line, mark, other label.
I2 Clipped by the screen edge or chrome.
I3 Inconsistent style for the same kind of place.
I4 Missing: an important place (served station, major town) unnamed at a zoom
   where it should be.
I5 Wrong place or ambiguous which feature it names.

## J. Framing and interface
J1 Opening view doesn't show what it promises (whole network, centred, using
   the screen), on a phone and on a desktop.
J2 Interface chrome covers network features at the opening view or named views.
J3 Named views (each line, each station) frame their subject badly.
J4 Screen-dependent view: a view's zoom depends on screen size and lands near a
   drawing threshold (a layer switch, a fade), so different phones see
   different maps. Every check runs at the zoom each common screen size gets,
   not one size.

## K. Unanticipated
K1 Whole-view visual review: a vision model lists anything wrong in a fixed set
   of views (opening view x2 themes, every junction, every line end, each
   named view). Every new kind of fault it finds becomes a class above.
