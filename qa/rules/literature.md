# Drawing-quality rules for transit maps: literature catalogue

Written 2026-11-11 for the RTD system map checker. Scope: rules that software can test on a rendered, geographically accurate map (MapLibre, zoom 9 to 18). Extends, and does not repeat, the sources DESIGN.md already cites (Imhof, Brewer, Kern and Brewer, Nöllenburg and Wolff, LOOM, Roberts, Walker). Where a rule is already in DESIGN.md it says so.

## How to read a rule

- **id**: section prefix and number.
- **Rule**: one plain sentence.
- **Measure**: the quantity to compute on the rendered model, and a threshold. A threshold is marked *(source)* when a loaded source gives it, and *(suggested)* when the number is mine and not from any source. Suggested numbers need calibrating against `qa/recall/finds.json`.
- **Basis**: *stated* = the source says this; *derived* = I applied a stated principle to this map's geometry (the derivation is mine); *none* = no source states it.
- **Source**: author, year, short title, place in the source, and a key. Each key resolves to the URL I actually loaded in the Source key table.
- **verified**: `yes` = I loaded the source and the statement the rule rests on is in it. `no` = it is not (the rule is my extension, or I could not load the text). Abstract-only sources are marked (abstract).
- **px** means CSS pixels at the zoom under test.

## Source key (each URL was loaded)

| Key | Source | URL loaded | What I read |
|---|---|---|---|
| NW11 | Nöllenburg and Wolff (2011), Drawing and Labeling High-Quality Metro Maps by Mixed-Integer Programming, IEEE TVCG 17(5), author manuscript | http://web.archive.org/web/20240604030532id_/https://i11www.iti.kit.edu/extra/publications/nw-dlhqm-10.pdf (Internet Archive copy of https://i11www.iti.kit.edu/extra/publications/nw-dlhqm-10.pdf, which now returns 404) | Full text, section 3 (design rules R1-R7, hard H1-H4, soft S1-S3), section 5.3 (labels) |
| KITP | KIT Algorithmics project page, Metro maps | https://algo.iti.kit.edu/en/projects/geovis/metro | Page text: hard criteria (a) minimum edge length (b) topology (c) octilinearity; soft criteria (a) few bends (b) relative position (c) total edge length |
| R14 | Roberts (2014), What's Your Theory of Effective Schematic Map Design? | https://repository.essex.ac.uk/11368/1/Roberts-Theoretical.pdf | Full text. Figure 2 reproduces R1-R7 and attributes them to Nöllenburg and Wolff 2011; section III defines simplicity, coherence, harmony, balance, topographicity |
| ST11 | Stott, Rodgers, Martínez-Ovando and Walker (2011), Automatic Metro Map Layout Using Multicriteria Optimization, IEEE TVCG (Kent author version) | https://www.cs.kent.ac.uk/pubs/2011/2963/content.pdf | Full text, station criteria cN1-cN5 and label criteria cL1-cL7 |
| LOOM | Bast, Brosi and Storandt (2018), Efficient Generation of Geographically Accurate Transit Maps, SIGSPATIAL | https://ad-publications.informatik.uni-freiburg.de/SIGSPATIAL_transitmaps_2018.pdf | Full text, sections 1, 2, 3.3, 3.4, 5, 6.2, 7 |
| WU20 | Wu, Niedermann, Takahashi, Roberts and Nöllenburg (2020), A Survey on Transit Map Layout, Computer Graphics Forum 39(3) | https://www.ac.tuwien.ac.at/files/pub/metromapsurvey-2020.pdf | Full text, section 3 (design criteria), 4.1 (criteria L1-L6, P1-P6), 4.2.4 (wiring) |
| BNUW | Benkert, Nöllenburg, Uno and Wolff (2006/2007), Minimizing intra-edge crossings in wiring diagrams and public transport maps, Graph Drawing | https://research.tue.nl/nl/publications/minimizing-intra-edge-crossings-in-wiring-diagrams-and-public-tra/ | Abstract only |
| ABKS | Argyriou, Bekos, Kaufmann and Symvonis (2010), On Metro-Line Crossing Minimization, JGAA 14(1) | https://jgaa.info/index.php/jgaa/article/view/paper199 | Abstract only |
| FP13 | Fink and Pupyrev (2013), Ordering Metro Lines by Block Crossings (JGAA 2015 with Wolff) | https://arxiv.org/abs/1305.0069 | Abstract only |
| BHNP | Bereg, Holroyd, Nachmanson and Pupyrev (2011/2016), Edge Routing with Ordered Bundles | https://arxiv.org/abs/1209.4227 | Abstract only |
| FHNRSW | Fink, Haverkort, Nöllenburg, Roberts, Schuhmann and Wolff (2013), Drawing Metro Maps Using Bézier Curves, Graph Drawing | https://repository.essex.ac.uk/7229/ | Abstract only |
| TFL | Transport for London, Line diagram standard, Issue 4 | https://content.tfl.gov.uk/tfl-line-diagram-standard.pdf | Full text (sections 5, 6, 8, 10) |
| KB08 | Kern and Brewer (2008), Automation and the Map Label Placement Problem, Cartographic Perspectives 60 | https://cartographicperspectives.org/index.php/journal/article/download/cp60-kern-brewer/pdf/1397 | Section "Label Placement Rules" |
| WL | Wikipedia, Labeling (map design) | https://en.wikipedia.org/wiki/Labeling_(map_design) | Page text (summarises Imhof, Yoeli, Wood) |
| PSU | Penn State GEOG 486, Label placement | https://courses.ems.psu.edu/geog486/node/557 | Page text |
| BREWER | Brewer (2015), Designing Better Maps, Esri Press, sample chapter 1 | https://www.esri.com/content/dam/esrisites/en-us/esri-press/book-pages/sample-page/designing-better-maps-guide-gis-users.pdf | Sample chapter text on visual hierarchy |
| AXIS | Axis Maps, Cartography Guide: Visual hierarchy | https://www.axismaps.com/guide/visual-hierarchy | Page text |
| LED22 | Ledermann (2022), Empirical assessment of minimum dimensions for cartographic symbology on smartphone displays, TU Wien dissertation | https://repositum.tuwien.at/bitstream/20.500.12708/139892/1/Ledermann%20Florian%20-%202022%20-%20Empirical%20assessment%20of%20minimum%20dimensions%20for...pdf | Chapter 3 literature review, task 7 (counting parallel lines), Table 8.1 |
| LED23 | Ledermann (2023), Minimum dimensions for cartographic symbology, Int. J. Cartography | https://repositum.tuwien.at/handle/20.500.12708/176798 | Abstract only |
| RRC | Esri, Resolve Road Conflicts (ArcGIS Pro tool reference) | https://doc.esri.com/en/arcgis-pro/latest/tool-reference/cartography/resolve-road-conflicts.html | Page text |
| WGEN | Wikipedia, Cartographic generalization | https://en.wikipedia.org/wiki/Cartographic_generalization | Operator definitions |
| WALK1 | Walker, The Case for Frequency Mapping (Human Transit basics) | https://humantransit.org/basics/the-case-for-frequency-mapping | Page text |
| WALK2 | Walker (2011), good network maps: clear without color? | https://humantransit.org/?p=22131 | Page text |
| WALKC | Walker's comments under The case for frequency mapping (2010) | https://humantransit.org/2010/08/basics-the-case-for-frequency-mapping.html | Comments 5, 50, 60, 67 only; the post body did not load from this URL |
| LAND15 | Landman, on Walker's blog (2015), Portland: New Transit Map Underscores Frequent Network | https://humantransit.org/2015/10/new-trimet-map-focuses-more-heavily-on-the-frequent-network.html | Page text |
| KIND | Kindermann, after Nöllenburg (2021), Visualization of Graphs, lecture 13, slides (design rules R1-R9) | https://algo.uni-trier.de/lectures/graphvis/gv-ss21-13-metromaps-print.pdf | Slide text (secondary) |
| AH06 | Avelar and Hurni (2006), On the Design of Schematic Transport Maps, Cartographica 41(3) | https://api.crossref.org/works/10.3138/A477-3202-7876-N514 (abstract also on OpenAlex) | Abstract only. It states the literature gives "very little guidance" on rules; no rule extracted |
| IM75 | Imhof (1975), Positioning Names on Maps, The American Cartographer 2(2):128-144 | https://api.crossref.org/works/10.1559/152304075784313304 | Bibliographic record only (content via KB08, WL, PSU) |

Counts: 28 sources are listed and were loaded. 26 are used for rules. Six of those 26 were read as abstracts only (BNUW, ABKS, FP13, BHNP, FHNRSW, LED23). AH06 (abstract) and IM75 (bibliographic record) were loaded but yield no rule.

## The owner's six finds mapped to rules

| Owner's find | Rules that test it |
|---|---|
| Two marks of one station not parallel | ST-02, ST-01 |
| Uneven gaps between parallel lines | PL-02, PL-03, PL-04 |
| A line drifts sideways after another line ends | PL-11, PL-12, LE-02 |
| A line not parallel to its platform | ST-01, PL-16 |
| A bus line drawn underneath a rail line | KD-02, PL-01, KD-03 |
| A kink where lines part at a junction | JN-01, JN-02, LN-05, PL-13 |

---

## 1. Lines (continuity, straightness, bends)

**LN-01** Each line is one unbroken path that starts in its first station's mark, passes through every intermediate station in order and ends in its last station's mark.
- Measure: gap between consecutive drawn pieces of a line = 0 (tolerance 0.5 px for rasterising, suggested); ordered list of station marks the path crosses equals the line's stop sequence. Overlaps an existing check (gaps, stops far from line).
- Basis: stated. Source: Wu et al. 2020, section 4.1.3 (wiring definition) [WU20]. verified: yes

**LN-02** A line has few bends, and where a bend cannot be avoided it is a wide (obtuse) one, not a sharp one.
- Measure: for each line, count bends where the turning angle exceeds 2 degrees (suggested) per 1000 px of path; report the interior angle at each; flag any interior angle under 90 degrees (the sources prefer obtuse angles, that is interior angle over 90). The per-length limit is suggested.
- Basis: stated. Source: Nöllenburg and Wolff 2011, rule R3 and soft constraint S1 [NW11]; KIT project page, soft criterion (a) a minimum number of bends [KITP]; Stott et al. 2011, line straightness cN4 [ST11]; Wu et al. 2020, L2 Straightness [WU20]. verified: yes

**LN-03** A line passes straight through each station: the stretch entering a station and the stretch leaving it are collinear.
- Measure: absolute deflection between the line's tangent entering and leaving each station mark (ST11 sums this angle over stations as cN4). Flag deflection above 5 degrees (suggested). Overlaps an existing check (hooks, sideways steps).
- Basis: stated. Source: Stott et al. 2011, Line Straightness Criterion cN4 [ST11]. verified: yes

**LN-04** A line is not drawn as a run of short zig-zag segments.
- Measure: along each line, count sign changes of the turning angle (inflection points) in any window of 10 line widths; flag 3 or more (suggested). Also report bend count per line against the unsimplified geometry: a drawn line should have fewer bends than the raw track.
- Basis: stated (principle), derived (windows). Source: Roberts 2014, simplicity: "If reality is instead converted into numerous short zig-zagging segments, nothing has been simplified" [R14]; Wu et al. 2020, L2 (few inflection points) [WU20]. verified: yes

**LN-05** A curved line has even curvature with no sudden kink.
- Measure: sample the centreline every 1 line width; compute curvature; flag any point where the turning over a stretch shorter than 2 line widths exceeds 10 degrees while the neighbouring stretches turn less than 3 degrees (suggested). Count curvature sign changes per line.
- Basis: stated (uniform curvature, few inflection points). Source: Wu et al. 2020, L2 Straightness (curvilinear layouts) [WU20]. verified: yes

**LN-06** A line does not bend inside a station mark or within one mark-length of it.
- Measure: turning angle of each line over the mark footprint plus a lead-in of one mark width each side; flag above 1 degree (suggested).
- Basis: stated. Source: Fink et al. 2013, "we forbid metro lines to bend (even in stations)" [FHNRSW]; Nöllenburg and Wolff 2011, R3 "especially in interchange stations" [NW11]. verified: yes (abstract for FHNRSW)

**LN-07** A line has no dent or bump smaller than one pixel, and wobble is smoothed away.
- Measure: lateral deviation of the drawn centreline from a smoothed copy (window of 8 line widths) stays at or under 1 px at every zoom (window and 1 px are suggested; the one-pixel minimum feature size is the source figure).
- Basis: stated (min dent/protrusion about one pixel), derived (smoothing test). Source: Ledermann 2022, literature review on Malić's screen minima, "minimum size of dents or protrusions ... correspond with the size of a single pixel" [LED22]; Wikipedia, smoothing "removing small details" [WGEN]. verified: yes

**LN-08** A line is at least one pixel wide, and two line weights meant to look different differ by at least 1.6 px.
- Measure: minimum rendered stroke width at each zoom >= 1 px with antialiasing, 2 px without (Neudeck 2001, as reported by Ledermann); distinct width classes differ by >= 1.6 px (Table 8.1: 0.2 mm = 1.6 px "to discriminate line widths"). Applies to the bus frequency widths.
- Basis: stated. Source: Ledermann 2022, ch. 3 (Neudeck 2001; Swiss Society of Cartography) and Table 8.1 [LED22]. Caveat from Ledermann 2023 (abstract): "only few studies have actually verified minimum dimensions in controlled empirical experiments" [LED23]. verified: yes

**LN-09** Drawing a line does not change the network's topology: no crossing that is not in the data and no change of the circular order of lines around a junction.
- Measure: set of drawn pairwise crossings is a subset of those implied by the data (crossings only at junctions); clockwise order of incident lines at each junction equals the order in the geographic data.
- Basis: stated. Source: Nöllenburg and Wolff 2011, R2 and H2 [NW11]; Wu et al. 2020, L1 Topology Preservation [WU20]. verified: yes

**LN-10** A line stays within a stated tolerance of its real course; the only allowed departure is the sideways offset made to place it beside another line.
- Measure: maximum distance from the drawn centreline to the true track centreline. Allowed: (sum of line widths in the bundle) / 2 (LOOM equation 2) plus 1 px (suggested).
- Basis: stated (tolerance idea and the bundle half-width). Source: Bast, Brosi, Storandt 2018, section 1 ("within a given tolerance") and section 2 equation 2 [LOOM]. verified: yes

## 2. Parallel lines sharing a corridor (spacing, order, crossings, joining and leaving)

**PL-01** Lines that share track are drawn next to each other, never on top of each other.
- Measure: for every pair of lines on a shared stretch, centreline distance >= (w1 + w2) / 2 at every sample; share of the shared length where it is smaller = 0.
- Basis: stated. Source: Bast et al. 2018, section 1: "should then of course not be rendered on top of each other as this would obfuscate the visibility. Instead, they should be drawn next to each other" [LOOM]; Nöllenburg and Wolff 2011, R7 [NW11]. verified: yes

**PL-02** Every gap between neighbouring lines in a bundle is the same size, and stays the same along the bundle.
- Measure: for each bundle with n lines, edge-to-edge gaps g1..g(n-1) sampled every 1 line width along the bundle; max(g) - min(g) over all samples and all gaps <= 0.5 px or 15 percent of the median gap, whichever is larger (suggested). The source gives the construction: lines sit at a fixed pitch (offset = -w|L|/2 + w(p-1) in LOOM; TfL fixes spacing as a multiple of line thickness x).
- Basis: stated (construction), derived (test). Source: Bast et al. 2018, section 5 step 1 [LOOM]; Transport for London, Line diagram standard Issue 4, section 5 ("principles of line spacing are also based upon the 'x' height") [TFL]. verified: yes

**PL-03** The gap between two neighbouring lines is large enough to be seen as a gap, or the lines are merged; there is no sliver.
- Measure: edge-to-edge gap between any two strokes that run side by side. Thresholds *(source)*: >= 1.2 CSS px minimum to separate parallel lines (Ledermann Table 8.1, 0.15 mm, smartphone, near-maximum contrast, symbols examined singly); 2 px (Neudeck 2001 and the Swiss Society of Cartography screen minimum, as reported); for counting individual lines reliably about 4 px (0.5 mm with line >= 0.08 mm; success about 90 percent at 0.75 mm, a significant drop at 0.25 mm; mm to px at Table 8.1's ratio of 8 px per mm). Flag gaps strictly between 0 and 1.2 px, and report the share under 2 px. Project target (suggested): >= 2 px, or touching.
- Basis: stated. Source: Ledermann 2022, Table 8.1 and task 7 results (section 7.3.4) [LED22]. verified: yes

**PL-04** One bundling style is used across the whole map: the gap-to-width ratio of bundles is the same everywhere.
- Measure: gap / line width for every bundle at a given zoom; spread (max/min) <= 1.2 (suggested). A bundle can be tight or spaced; the choice should be made once.
- Basis: stated (two valid styles), derived (consistency). Source: Wu et al. 2020, section 3.1 Co-routed Lines [WU20]. verified: yes

**PL-05** The order of lines in a bundle does not change along a stretch of shared track; order changes only at junctions.
- Measure: for each pair of lines on a shared edge, the sign of (lateral offset A minus lateral offset B) is constant along the edge. Count of sign changes inside an edge = 0.
- Basis: stated. Source: Bast et al. 2018, section 3 (one ordering per edge; crossings only at nodes) [LOOM]; Benkert et al. 2006 [BNUW]. verified: yes

**PL-06** The number of crossings between lines in a bundle is as small as possible.
- Measure: total pairwise line crossings at junctions, compared with the minimum from an ordering search (ILP or heuristic as in LOOM). Flag any junction where drawn crossings exceed the number of inversions between the incoming and outgoing orders (see JN-05).
- Basis: stated. Source: Bast et al. 2018, abstract and section 3 [LOOM]; Argyriou et al. 2010 [ABKS]; Bereg et al. (arXiv 1209.4227): bundled edges drawn separately as in metro maps, ordered to keep crossings few [BHNP]; Wu et al. 2020, section 4.2.4 (metro-line crossing minimisation) [WU20]. verified: yes

**PL-07** Crossings and line separations are not hidden under a station mark.
- Measure: number of line-pair crossings, and of places where two partner lines stop being adjacent, whose location falls inside any station mark footprint = 0.
- Basis: stated. Source: Benkert et al. 2006: "For esthetic reasons we insist that the relative order of the paths that traverse a node does not change within the area occupied by that node" [BNUW]; Bast et al. 2018, section 3.4 (prevent crossings or separations in station nodes) [LOOM]; Wu et al. 2020, section 4.2.4 (station crossings hidden underneath the symbol are error-prone to track) [WU20]. verified: yes (abstract for BNUW)

**PL-08** Crossings between two bundles happen once, as a block, not scattered along the edge.
- Measure: for each pair of bundles that cross, count separate crossing events along the shared edge; expect 1. Flag > 1.
- Basis: stated. Source: Fink and Pupyrev 2013, block crossings [FP13]; Bast et al. 2018, section 1.3.2 (scattered crossings not visually pleasing) [LOOM]. verified: yes (abstract for FP13)

**PL-09** Lines that run together on neighbouring stretches keep side by side; they are not parted for no reason.
- Measure: for each pair of lines that continue across a node, flag the pair if adjacent in the edge before and not adjacent in the edge after (a line separation). Report count per junction; weight them as LOOM's separation penalty.
- Basis: stated. Source: Bast et al. 2018, section 3.3 "Preventing Line Partner Separation" [LOOM]. verified: yes

**PL-10** A line that ends or begins at a junction does not force the lines that continue to cross each other.
- Measure: at each node where a line ends or begins, count crossings among the continuing lines; compare with the best ordering found by search. Flag when the drawn count is above the best.
- Basis: derived. Source: Bast et al. 2018, section 3.3.1 (periphery condition) [LOOM]. verified: yes

**PL-11** Along one stretch, each line keeps the same sideways offset from the track axis; offsets change only inside the junction area.
- Measure: standard deviation of each line's signed lateral offset (from the corridor axis) along each edge <= 0.5 px (suggested); the offset step between consecutive edges occurs within the junction transition zone (see PL-13), not along the edge. This catches "drifts sideways after another line ends".
- Basis: stated (construction: one offset per line per edge), derived (test). Source: Bast et al. 2018, section 5 [LOOM]. verified: yes

**PL-12** When a line leaves or joins a bundle, the remaining lines re-centre in whole half-pitch steps and the bundle stays centred on the track axis.
- Measure: the mean lateral offset of the bundle from the axis = 0 +/- 0.5 px on every edge; each line's offset step across a node is a multiple of half the pitch (+/- 0.5 px). This is LOOM's convention (bundle centred on the geometry), not a universal rule.
- Basis: stated (LOOM construction), derived (test). Source: Bast et al. 2018, section 5: offset "-w|L(e)|/2 + w(p_e(l) - 1)" [LOOM]. verified: yes

**PL-13** Where a bundle changes (a line joins, leaves or swaps place), the change is made by short smooth connectors inside a bounded junction area, not by a long diagonal drift.
- Measure: length along the track over which any line's lateral offset changes <= 6 pitches (suggested); connector is a smooth curve or straight piece with tangent continuity at both ends (see JN-01). Source states a maximum expansion distance and Bézier, arc or straight connectors; the number is suggested.
- Basis: stated (bounded area, connector types), suggested (number). Source: Bast et al. 2018, section 5 steps 2-3 [LOOM]. verified: yes

**PL-14** Where a bundle turns, the lines stay concentric: neighbouring lines turn about one centre, and the inner lines do not pinch or cross.
- Measure: for each bend of a bundle, radius difference between neighbouring lines = pitch +/- 0.5 px; innermost line radius >= 0 (no cusp, no self-intersection of the offset curve). TfL applies a radius of 3x (3 line thicknesses) to the innermost curve of adjacent lines; on a map fixed to real track, report innermost radius / line width and flag under 3 only for bends the data allows rounding.
- Basis: stated (TfL 3x), derived (concentric test). Source: Transport for London, Line diagram standard Issue 4, section 6: "Where lines run adjacent, 3x is applied to the innermost curve" [TFL]. verified: yes

**PL-15** Lines in a bundle do not overlap each other, and none passes under another at a junction connector.
- Measure: area of overlap between strokes of different lines within a bundle and in junction areas, as a share of the smaller stroke = 0 (excluding intentional crossings, which show one line over the other with equal clarity).
- Basis: derived. Source: Bast et al. 2018, section 1 [LOOM]. verified: yes

**PL-16** Neighbouring lines of a bundle are parallel along their whole shared length.
- Measure: angle between the tangents of neighbouring lines, sampled every 1 pitch, <= 1 degree (suggested); lateral distance constant per PL-02.
- Basis: stated (parallel lines make a coherent map), derived (test). Source: Roberts 2014, coherence "can be achieved via parallel lines, and aligning stations and termini" [R14]. verified: yes

**PL-17** A shared stretch is not so short that it makes a bead or a jog: bundle changes are not packed closer together than the bundle is wide.
- Measure: distance along the track between two consecutive bundle-change nodes >= bundle width (LOOM merges a new node into an existing one when closer than d = (w|L(e1)| + w|L(e2)|)/2). Flag shorter stretches.
- Basis: stated. Source: Bast et al. 2018, section 2 (merging nodes closer than d-hat "to avoid cluttering the graph with many start and end nodes of shared segments") [LOOM]. verified: yes

**PL-18** Lines that always travel together stay together as a pack, side by side, on every edge.
- Measure: for any set of lines with the identical route over a whole corridor, they occupy consecutive positions on every edge, and their order among themselves is the same on every edge (0 inversions).
- Basis: stated (LOOM collapses such lines into one without losing optimality), derived (test). Source: Bast et al. 2018, section 4.1 pruning rule 2 and section 1.2 [LOOM]. verified: yes

## 3. Junctions

**JN-01** Where lines part at a junction, each branch leaves in a smooth curve, with no kink.
- Measure: tangent direction jump along each line through the junction <= 1 degree (suggested); no turn of more than 10 degrees within 2 line widths of path unless the geography forces it (suggested). LOOM draws connections as cubic Bézier curves; it notes a circular arc or a straight line may suit better.
- Basis: stated (smooth connectors), suggested (numbers). Source: Bast et al. 2018, section 5 step 3 [LOOM]; Wu et al. 2020, L2 [WU20]. verified: yes

**JN-02** The angles between branches at a junction are not tiny, and the branches are spread out as evenly as the geography allows.
- Measure: minimum angle between neighbouring incident edges at each node; deviation from 360 / degree degrees (Stott cN1 sums |2π/ρ(v) - θ| over adjacent edge pairs). Flag minimum angle under 15 degrees (suggested).
- Basis: stated (metric). Source: Stott et al. 2011, Angular Resolution Criterion cN1 [ST11]; Wu et al. 2020, L5 Angular Resolution [WU20]; Nöllenburg and Wolff 2011 soft constraint S1 (bend angles as large as possible) [NW11]. verified: yes

**JN-03** Lines pass straight through a junction wherever the data allows.
- Measure: for each line at a node of degree 3 or more, deflection between in and out tangents; report lines with deflection above 15 degrees (suggested) while another route through the node would be straighter.
- Basis: stated. Source: Kindermann after Nöllenburg, slide "Let lines pass straight through interchanges" (R4 in that deck) [KIND]; Stott et al. 2011, cN4 [ST11]. verified: yes (secondary slides)

**JN-04** Unrelated features keep a minimum clearance; two lines that do not share a node are not closer than the minimum gap.
- Measure: minimum edge-to-edge distance between strokes of lines that share no node or corridor >= 1.2 px (source, LED22), 2 px recommended (suggested). Report any pair in the sliver band (0 to 1.2 px).
- Basis: stated. Source: Nöllenburg and Wolff 2011, H4 (distance at least d_min from every non-incident edge) [NW11]; Wu et al. 2020, L6 Distance of Features [WU20]; Ledermann 2022, Table 8.1 [LED22]. verified: yes

**JN-05** The number of crossings drawn inside a junction equals the number of line pairs whose order differs between the incoming and outgoing edges, and no more.
- Measure: for each junction, count drawn crossings; compare with the count of pairs (A,B) with p_e(A) < p_e(B) but p_e'(A) > p_e'(B). Flag drawn > required.
- Basis: stated. Source: Bast et al. 2018, section 3.2 and Figure 4 (crossing oracle) [LOOM]. verified: yes

**JN-06** A junction's connectors stay inside a small area around the node; they do not run on into the neighbouring stretch.
- Measure: extent of the junction area (from where the first offset starts to change to where the last stops) <= 6 pitches along the track (suggested); the source bounds the expansion by a "maximum distance from the node front".
- Basis: stated (bounded), suggested (number). Source: Bast et al. 2018, section 5 step 2 [LOOM]. verified: yes

## 4. Stations and interchanges

**ST-01** A station mark is perpendicular to its line, so the line is parallel to the platform side of the mark.
- Measure: angle between the mark's long axis and the line tangent at the mark centre = 90 degrees +/- 3 (suggested). For a mark that stands for a platform with known geometry: angle between the platform's long axis and the line tangent <= 3 degrees (suggested). Stott's criterion is the absolute difference of the two angles between the tick and the two connecting edges (zero when perpendicular and symmetric).
- Basis: stated (perpendicular tick), derived (platform wording). Source: Stott et al. 2011, Perpendicular Tick Criterion cL7 [ST11]; Bast et al. 2018, section 5 (node fronts are the polygon sides of each incident edge) [LOOM]. verified: yes

**ST-02** The two marks of one station that has far-apart platforms are parallel when the lines they serve run parallel, and the link joins them centre to centre.
- Measure: angle between the long axes of the two marks <= 2 degrees (suggested) when the two line tangents differ by under 2 degrees; link is a straight segment from centre to centre, at 90 degrees to the marks within 5 degrees (suggested). TfL joins the circles of a platform change so the outside rings touch and a 0.5x white strip bridges them; a dumbbell is allowed.
- Basis: derived (ST-01 applied to both marks), stated (TfL joined circles). Source: Transport for London, Line diagram standard Issue 4, section 8 points 3-4 [TFL]; Stott et al. 2011, cL7 [ST11]. verified: yes

**ST-03** An interchange mark sits centred across the lines that share its platforms.
- Measure: lateral offset between the mark's centre and the centre of the bundle's lateral extent <= 1 px (suggested).
- Basis: stated. Source: Transport for London, Line diagram standard Issue 4, section 8 point 2: "the interchange circle is centred between the lines" [TFL]. verified: yes

**ST-04** A station mark covers every line that stops there and does not cover a line that does not.
- Measure: share of each serving line's cross-section covered by the mark = 100 percent (+/- 1 px); mark overhang beyond the bundle <= 3 px (suggested); count of non-serving lines whose stroke lies under the mark = 0.
- Basis: derived. Source: Bast et al. 2018, section 5 step 4 (station polygon built from the node fronts) [LOOM]; Wu et al. 2020, section 4.1.3 (station region) [WU20]. verified: yes

**ST-05** Station marks are sized by class, and interchanges and termini look stronger than plain stops; marks of one class are the same size.
- Measure: mark width and length per class at one zoom: spread within a class <= 0.5 px; class ordering strictly increasing (plain < interchange < terminus or hub).
- Basis: stated. Source: Wu et al. 2020, section 3.3 Station Styles ("more salient node styles can indicate interchange stations and terminals") [WU20]. verified: yes

**ST-06** Station mark size follows line thickness.
- Measure: mark thickness / line width constant per class across the map. TfL: tick is 0.66x square (x = line thickness, from the standard's text) so ratio ~0.66; use as a reference, not a target, since the sizes here are set by other needs (suggested).
- Basis: stated (TfL). Source: Transport for London, Line diagram standard Issue 4, section 5: "Station ticks are 0.66x squared" [TFL]. verified: yes

**ST-07** Station marks do not overlap each other.
- Measure: overlap area between marks = 0 at every zoom; where marks would touch, the lower-ranked one is dropped (not squeezed). LOOM lists overlapping station nodes at small resolution as an open problem.
- Basis: stated. Source: Wu et al. 2020, section 3.1 Spatially-separated Stations [WU20]; Bast et al. 2018, section 7 [LOOM]. verified: yes

**ST-08** A station is on its line: the mark centre lies on, or within half a bundle width of, the line it serves.
- Measure: distance from mark centre to the line centreline <= bundle half width + 1 px (suggested). Overlaps an existing check (stops far from line).
- Basis: stated. Source: Wu et al. 2020, section 4.1.3 [WU20]. verified: yes

**ST-09** A station's position is not moved from its real location by more than the drawing's tolerance.
- Measure: distance from drawn mark to true station location in metres and px; flag over bundle half width + 1 px (suggested).
- Basis: stated (principle). Source: Roberts 2014, topographicity [R14]; Wu et al. 2020, L3 Distortion [WU20]. verified: yes

## 5. Line ends

**LE-01** A line ends inside its terminal station mark and does not run past it.
- Measure: distance from the line's last point beyond the far edge of the terminal mark = 0 (cap hidden under or flush with the mark). Overlaps an existing check (lines past their station mark).
- Basis: stated. Source: Wu et al. 2020, section 4.1.3 (curve ends in the region of its last station) [WU20]; Transport for London, Line diagram standard Issue 4, section 10.1 (double tab marks the end of a line) [TFL]. verified: yes

**LE-02** A line that ends takes the outermost place in its bundle, so the lines that continue do not cross it, shift or step sideways.
- Measure: at each node where a line ends, its lateral position is the first or last in the incoming order (periphery condition). Count lines that end at an inner position = 0; if the remaining lines step, the step is a clean half-pitch (PL-12).
- Basis: stated. Source: Bast et al. 2018, section 3.3.1 (periphery condition) and section 1.3.2 [LOOM]; Argyriou et al. 2010 [ABKS]. verified: yes

**LE-03** Lines that end at the same station end together, aligned.
- Measure: along-track position of the end of each line arriving at one terminal from the same direction: spread <= 1 px (suggested).
- Basis: stated (aligned termini aid coherence). Source: Roberts 2014, coherence "aligning stations and termini" [R14]. verified: yes

**LE-04** The end of a line is marked distinctively from an ordinary stop.
- Measure: terminal marks belong to a class with a different shape or weight from plain stops (see ST-05). TfL uses a double tab for a line end and a ring when the end is an interchange.
- Basis: stated. Source: Transport for London, Line diagram standard Issue 4, section 10.1 [TFL]. verified: yes

## 6. Lines of different kinds beside each other (rail beside bus, hierarchy, weights)

**KD-01** The map has a clear layer order: rail first, then frequent bus, then other bus, then everything else; no layer pulls the eye from the ones above it.
- Measure: visual weight per class = stroke width x contrast against background; strictly decreasing down the hierarchy at each zoom; z-order draws higher classes above lower ones. Squint test: blur the render and rank classes by darkness-times-width; ranking equals the hierarchy.
- Basis: stated. Source: Walker 2011: "each layer is never allowed to distract from the ones above it" and supplementary services "must be presented in a way that visually recedes" [WALK2]; Brewer 2015, ch. 1: contrasting colours, line weights and line detail establish hierarchy [BREWER]; Axis Maps: "A map's visual hierarchy should match its intellectual hierarchy" [AXIS]. verified: yes

**KD-02** A bus line is never hidden beneath a rail line (or beneath any higher class): where they share a street or track they are drawn side by side.
- Measure: for each bus line sample, share of its stroke width covered by any rail stroke (or higher-class stroke). Flag any run of 1 line width or more where the covered share exceeds 10 percent (suggested). Target 0 percent.
- Basis: stated. Source: Landman 2015 on Walker's blog: the 10-Harold "is actually beneath the 14's line"; the new map separates the overlapping lines by line displacement so the overlap is clear [LAND15]; Bast et al. 2018, section 1 [LOOM]. verified: yes

**KD-03** When room has to be made, the lower class moves and the higher class keeps its place.
- Measure: displacement of each line from its true centreline, by class: rail displacement <= bus displacement <= minor bus displacement; the top class <= 1 px.
- Basis: stated. Source: Esri, Resolve Road Conflicts: "Movement will be minimized for the most important roads"; "lower-hierarchy roads generally will be moved to accommodate higher-hierarchy roads" [RRC]. verified: yes

**KD-04** Width carries the frequency (or class) information, and the same class always has the same width.
- Measure: rendered width per class at each zoom: spread within a class <= 0.25 px (suggested); width strictly increasing with frequency across classes; adjacent classes differ by >= 1.6 px (LN-08).
- Basis: stated. Source: Walker, The case for frequency mapping (line weight shows which lines are frequent) [WALK1]; Wu et al. 2020, section 3.3 Line Styles (width can show frequency) [WU20]; Ledermann 2022, Table 8.1 [LED22]. verified: yes

**KD-05** Information is not carried by colour alone: the classes remain distinct in greyscale.
- Measure: render in greyscale (and a colour-blind simulation); every pair of adjacent classes differs by width >= 1.6 px or lightness by a ratio >= 3:1 (the 3:1 is the project's existing figure for essential lines).
- Basis: stated. Source: Walker 2011: Spokane's map is distinguishable in black and white; "the information is all there in line weights and styles, so that the color is supplementary" [WALK2]. verified: yes

**KD-06** There are few classes: about three bus tiers.
- Measure: number of distinct bus width classes drawn at each zoom <= 4 (suggested; Walker says three categories are enough).
- Basis: stated (opinion in a comment by Walker). Source: Walker, comments 60 and 50: "Creating too many categories is counterproductive to the goal of simplification"; "the three basic categories are all you need" [WALKC]. verified: yes

**KD-07** Rail and bus differ in more than one visual variable so that kinds are told apart at a glance.
- Measure: rail and bus strokes differ in hue or outline (casing) and in width; Portland's layers were light rail as a colour line with black outline, frequent bus as a heavy line, basic bus thinner, peak-only dashed.
- Basis: stated. Source: Walker 2011 [WALK2]; Landman 2015 [LAND15]. verified: yes

**KD-08** A lower-class line beside a higher-class line leaves a visible gap or sits clearly on one side, never a hairline.
- Measure: edge-to-edge gap between rail and nearest bus stroke where they run together: 0 (touching, treated as one pack) or >= 2 px (suggested); never in (0, 1.2) px (source, LED22).
- Basis: derived. Source: Ledermann 2022, Table 8.1 [LED22]. verified: yes

## 7. Labels

Labels are placed by MapLibre, so these rules are tests on the result. The DESIGN.md section "Where the labeling rules come from" already covers Imhof's aims, point label corners, repeated line labels and the keep-out; the rules below add only measures and sources it does not give.

**LB-01** No label overlaps another label.
- Measure: pairwise overlap area of label boxes = 0. Already tested (hidden names).
- Basis: stated. Source: Wu et al. 2020, P1 Overlap-free [WU20]; Stott et al. 2011, cL3 [ST11]; Nöllenburg and Wolff 2011, R6 [NW11]; Kern and Brewer 2008 (Imhof's principles) [KB08]. verified: yes

**LB-02** No label covers a line or a station mark.
- Measure: overlap of label box with line strokes and marks = 0, except a line's own label sitting on it. Already in DESIGN.md (keep-out).
- Basis: stated. Source: Nöllenburg and Wolff 2011, R6 ("not obscure other labels or parts of the network") [NW11]; Wu et al. 2020, P6 Layout Compliant [WU20]; Stott et al. 2011, cL1-cL2 [ST11]. verified: yes

**LB-03** A label sits close to its own mark and is closer to it than to any other mark.
- Measure: for each label, the nearest station mark (by box distance) is its own; Stott penalises closeness to other stations with a sum of inverse-distance terms and counts only stations within one grid spacing. Distance to own mark <= 1.4 em (already in DESIGN.md).
- Basis: stated. Source: Stott et al. 2011, Station Proximity Criterion cL6 [ST11]; Wu et al. 2020, P2 Adjacent [WU20]. verified: yes

**LB-04** Labels of consecutive stations along a line sit on the same side of it.
- Measure: along each line, between two interchanges, count changes of side from one station label to the next; report per 10 stations; flag over 2 (suggested). Stott counts disagreements between neighbouring stations of degree two.
- Basis: stated. Source: Nöllenburg and Wolff 2011, R6 ("labels along the track between two interchanges should use the same side"); Stott et al. 2011, cL5; Wu et al. 2020, P4 Consistent [NW11, ST11, WU20]. verified: yes

**LB-05** Labels are horizontal (point labels); line labels follow the line.
- Measure: point label rotation = 0; line label direction within the line's tangent; no upside-down text (angle within +/- 90 degrees of horizontal).
- Basis: stated. Source: Nöllenburg and Wolff 2011, R6 (horizontal preferred); Penn State: "Do not write labels upside down" [NW11, PSU]. verified: yes

**LB-06** A line label is on a straight stretch, not across a sharp bend.
- Measure: total turning of the line under the label box <= 20 degrees (suggested). Source says text on sharp bends is hard to read and advises a straight segment or a smoothed line.
- Basis: stated (principle), suggested (number). Source: Wikipedia, Labeling (map design) (summarising Imhof) [WL]. verified: yes

**LB-07** A line label does not cross lines running at right angles to it.
- Measure: number of other strokes crossing the label box (excluding the carrying line) = 0.
- Basis: stated. Source: Penn State: labels "should generally follow line features, but not cross over perpendicular lines" [PSU]. verified: yes

**LB-08** Labels are large enough to read.
- Measure: capital-letter height >= 8 CSS px (Roboto, Table 8.1: 1.0 mm, 8.0-8.8 px); horizontal text in a sans-serif font >= 7 px and curved or rotated text >= 10 px (Malić 1998, as reported by Ledermann, for 108 ppi screens, so older).
- Basis: stated. Source: Ledermann 2022, Table 8.1 and chapter 3 [LED22]. verified: yes

**LB-09** Labels are neither evenly dispersed nor densely clustered; labels in a row are not placed so close that they read as one.
- Measure: labels per 256 x 256 px tile at each zoom: coefficient of variation and maximum (suggested); already framed in DESIGN.md as Imhof's density rule.
- Basis: stated (principle). Source: Wikipedia, Labeling (map design), quoting Imhof: "Names should not be evenly dispersed over the map, nor should names be densely clustered" [WL]. verified: yes

**LB-10** Where a label must cross something, it carries a halo or mask, and this is the exception.
- Measure: share of labels overlapping any stroke that have a halo >= 1 px = 100 percent; share of labels overlapping at all <= 5 percent (suggested).
- Basis: stated (halos hide underlying features; leader lines lose association). Source: Wikipedia, Labeling (map design) [WL]. verified: yes

**LB-11** Label colour and weight follow the hierarchy: station and line names stronger than base-map names.
- Measure: contrast ratio of label text against its background, ordered rail letters >= station names >= place names >= minor base names; Landman: points of interest were set "in a brown color much closer to that of the map's background".
- Basis: stated. Source: Landman 2015 [LAND15]; Brewer 2015, ch. 1 [BREWER]. verified: yes

## 8. Background and geography

**BG-01** The base map recedes: every base feature class has lower contrast against the background than every transit class.
- Measure: contrast ratio (or lightness difference) per class; max over base classes < min over transit classes. Transit lines against their background >= 3:1 (existing project check).
- Basis: stated. Source: Axis Maps: "The less contrast in a map, the poorer the figure-ground effect"; use colours "noticeably different from the background, especially in terms of lightness" [AXIS]; Brewer 2015: base geography lower in the visual hierarchy [BREWER]. verified: yes

**BG-02** Non-transit symbols and text do not sit over transit routes.
- Measure: count of base-map labels and symbols overlapping a transit stroke = 0. Landman called overlap of points of interest with routes a fault.
- Basis: stated. Source: Landman 2015: "both text and symbols frequent overlapping the most important features (the transit routes)" [LAND15]. verified: yes

**BG-03** The amount of non-transit information is small.
- Measure: count of non-transit labelled features per viewport at each zoom (suggested cap to be set from the existing maps); fewer points of interest than the old TriMet map is Landman's direction.
- Basis: stated (direction), none (cap). Source: Landman 2015 [LAND15]. verified: yes

**BG-04** Water, parks and landmarks are simplified to the same visual language as the lines and placed so the nearby stations can be identified.
- Measure: base outlines drawn at the line's smoothness (no feature edge rougher than the lines); no strong base edge passes through a station mark.
- Basis: stated. Source: Wu et al. 2020, section 3.3 Landmarks [WU20]. verified: yes

**BG-05** Drawn geography stays faithful enough to orient by.
- Measure: angle between the true and the drawn direction from each station to its neighbour (S2). N&W suggest limiting it to 90 degrees as a hard constraint and charging smaller deviations as a soft one; for this map the target is near 0 apart from the bundle offsets (PL-12). Also KIT project page soft criterion (b), preserve the relative position of adjacent stations.
- Basis: stated. Source: Roberts 2014, topographicity [R14]; Nöllenburg and Wolff 2011, R4 and S2 [NW11]; KIT project page [KITP]. verified: yes

**BG-06** Density is balanced: crowded areas are not next to empty areas.
- Measure: ink and label density per 128 x 128 px cell; ratio between neighbouring cells; flag a neighbour ratio above 8:1 (suggested). Also the largest empty circle (no ink, no label) as a share of the viewport.
- Basis: stated. Source: Roberts 2014, balance: "an even density of stations across the page, or at least gentle density gradients, so that congested spaces and empty spaces are not adjacent" [R14]; Kindermann after Nöllenburg, R9 "Avoid large empty spaces" [KIND]. verified: yes

## 9. Consistency across zooms

The literature is thin here. WU20 says only that, for maps whose layout changes as the user zooms or pans, "it is desirable to maintain a topographically consistent placement of components". The rules below apply that sentence, and the generalisation literature's minimum-size thresholds, per zoom.

**CZ-01** The order of lines in a bundle is the same at every zoom where the bundle is drawn.
- Measure: for each corridor, the order of lines present at both z and z+1 has zero inversions.
- Basis: derived. Source: Wu et al. 2020, section 3.4 ("topographically consistent placement of components") [WU20]; Bast et al. 2018, section 3 (order is a property of the edge) [LOOM]. verified: yes

**CZ-02** At every zoom, any two neighbouring strokes are either at least the minimum gap apart or merged; none sits in the sliver band.
- Measure: histogram of edge-to-edge gaps at each zoom; count in (0, 1.2) px = 0; count in [1.2, 2) px reported. When a gap falls under the minimum the standard fixes are displacement, collapse, merge or typification.
- Basis: stated (operators and thresholds). Source: Wikipedia, Cartographic generalization: displacement, collapse, merging, typification [WGEN]; Ledermann 2022, Table 8.1 [LED22]; Esri, Resolve Road Conflicts [RRC]. verified: yes

**CZ-03** A feature's position in map space (metres) does not jump between zooms.
- Measure: for each line, distance between the drawn centreline at z and at z+1, converted to metres, <= bundle half width at the coarser zoom.
- Basis: derived. Source: Wu et al. 2020, section 3.4 [WU20]. verified: yes

**CZ-04** Line width and gap change smoothly with zoom.
- Measure: width at z+0.5 lies between widths at z and z+1; width ratio between consecutive integer zooms in [1, 2] (suggested). No source states this.
- Basis: none. Source: none found. verified: no

**CZ-05** A feature drawn at zoom z is still drawn at every higher zoom in the same view (no flicker), except where a higher-ranked item displaces it.
- Measure: set of drawn lines, marks and labels at z is a subset of those at z+1 for the same viewport, minus recorded displacements.
- Basis: none. Source: none found. verified: no

## Rules that do not transfer to this map

These recur across the schematic-map literature and are deliberately left out because this map is geographically accurate, not a diagram:

- Octilinear or other fixed angles (N&W R1 and H1; Roberts octolinear; TfL section 6 45/90 degrees; Vignelli's 45/90 degree grid). A real street at 30 degrees must stay at 30 degrees. The part that does transfer is smooth, even bends (LN-02 to LN-05, PL-14).
- Uniform edge lengths and enlarging the centre at the expense of the edge (N&W R5, S3; Stott cN2, cN3; Wu et al. "Even Spacing of Stations", "Global Scale Distortion").
- Moving stations to free up label space.

## Sources not retrieved

- **Imhof (1975), Positioning Names on Maps, and Imhof (1962, German).** Tried: Crossref (record only, confirms the 1975 paper exists), Kern and Brewer 2008, Wikipedia, Penn State. The original text is paywalled; I made no claim about its text beyond what those three say.
- **Yoeli (1972), Freeman and Ahn (1987), Wood (2000).** Known only through Kern and Brewer 2008; originals not tried.
- **Avelar and Hurni (2006), full text.** Tried: Crossref and OpenAlex (abstract only), the T&F/UTP publisher pages (403). No rule taken. Its abstract says the literature offers "very little guidance" on rules.
- **Vignelli, New York subway diagram (1972) rationale and Unimark standards.** Tried: https://en.wikipedia.org/wiki/New_York_City_Subway_map and https://id.iit.edu/story/full-circle-vignellis-1972-nyc-subway-map-vision-returns-in-2025/ (both loaded; give no drawing rule beyond 45/90 degree straight lines, which does not transfer), the MoMA collection record (403), web search (secondary pages only). No primary source retrieved.
- **Transport for London design standards web page.** Blocked by a Cloudflare challenge. The Line diagram standard itself loaded directly and is used (TFL). One caution on TFL: the figure on page 8 labels 0.33x, 0.66x and x dimensions; I read "line spacing is based on x" from the text and did not confirm which dimension is the gap between parallel lines, so no TfL gap value is stated.
- **Jarrett Walker, Human Transit (book), chapter 7.** Not retrieved. Used his blog pages and comments instead.
- **Brewer, Designing Better Maps (full book).** Only the Esri sample chapter loaded; line weight and drawing order are not covered there.
- **Fuller texts behind abstract-only sources:** Benkert et al. 2006 (Springer redirected to a login, KIT PDF 404), Argyriou et al. 2010, Fink and Pupyrev 2013/2015, Bereg et al. 2011/2016, Fink et al. 2013 (KIT PDF not tried), Ledermann 2023 (T&F 403; the 2022 dissertation was used instead).
- **Older thresholds quoted only through Ledermann 2022:** Töpfer 1974, Arnberger and Kretschmer 1975, Swiss Society of Cartography 1980 and 2002, Malić 1998, Brunner 2000, Neudeck 2001. Originals not retrieved. I give them as "as reported by Ledermann".
- **Misue, Eades, Lai and Sugiyama (1995), Layout adjustment and the mental map.** Seen only in search snippets; the publisher and abstract pages did not load. Not used for any rule.
- **Monmonier on displacing parallel linear symbols; Mapbox label placement docs; the LOOM journal extension and Brosi's thesis; Hong et al. 2006; Merrick and Gudmundsson.** Not tried for lack of time.
- **Nöllenburg and Wolff (2011), published IEEE version.** IEEE page returned no content, PubMed needs cookies, the KIT and Würzburg PDFs return 404. The author manuscript was read from an Internet Archive copy, which may differ in wording from the published version.
