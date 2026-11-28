# Evaluation scope and evidence

The ordered principles in DESIGN.md determine priority; evidence determines
which claims are justified. A passing command covers only its stated scope.

| Profile | Target | Required scope |
|---|---|---|
| Current sheets | `main`, `/` | Five scales: 8.75, 10, 12, 14, 16; actual settled camera; both themes; selection, theme/reload/clear |
| Smooth-zoom trial | `zoom-154-merge`, `/zoom/` | Both offset/drawn modes and themes; endpoints 12/14, boundary sides 12.99/13.01, fractional samples; selection, reversal and motion separately |
| Historical Classic | Frozen fixtures / `classic-archive` | Detector regression only; cannot establish acceptance of either active version |

The district sheet fits the viewport and can settle above 8.75. Record the
actual camera. The trial covers 12–14, not the eventual full zoom range.
Choose hub, shared-track and terminal examples from data, plus reproducible
samples of all served stations with a recorded seed. After tuning one sample,
use another seed as a held-out check and retain failures. Use whole-feature
checks wherever possible; screenshots always remain samples.

## Priority and evidence for a fix

Follow the principles: false rider information, unreadability/access,
frequency hierarchy, ambiguous association, instability/crowding, then polish.
Severity is rider consequence, not detector hit count. Name the rider question
when scoring usefulness. Each meaningful change records:

1. **Problem:** rider consequence, principle, affected version and priority.
2. **Before:** commit/data hashes, reproducible camera/theme/selection and a
   failing assertion or inspected capture. Preserve this original bad case.
3. **After:** the same observation, neighboring cases and regression results;
   explain how they demonstrate resolution of the rider problem.
4. **Detector evidence:** the check catches the original/planted fault and
   passes known-good controls. Include an unfamiliar location where sampling
   caused the miss. Never lower a threshold to make a candidate pass.
5. **Limits:** exact coverage, remaining faults, unavailable measurements and
   reviewer identity. A second run by the author remains self-review.

Broad geometry/labeling changes need a distinct review before unqualified
visual acceptance. If unavailable, retain the gap and continue routine
engineering without asking the user to repeat the matrix.

## Calibration

Keep the existing Accurate/Legible gates, score minimums and no-regression
rule. Cite the worst observed example for each judged row. An applicable
unmeasured gate or row prevents an overall pass; never invent a 2 or 3.

Distinguish published standards, research principles and project choices.
WCAG contrast ratios are standards; label continuity has research support;
particular pixel tolerances are project choices needing calibration. Retain
good, bad and borderline examples and threshold rationale. Preference scores
do not establish rider task success.

Primary references: [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[dynamic labeling continuity](https://cs.nyu.edu/visual/home/pub/infovis06.pdf),
and [Roberts on schematic-map evaluation](https://repository.essex.ac.uk/11368/1/Roberts-Theoretical.pdf).

Report known-fault and planted-fault detection separately, by kind, with
denominators and default-versus-targeted scans. Keep undetected classes visible
when a regression baseline passes. Measure false alarms with triaged controls;
unexplained findings are neither automatic false positives nor confirmed
defects. Synthetic controls do not establish real-world precision.

## Reproduce and retain

With the selected server running:

```sh
npm test
npm run check
npm run check:evidence -- --url http://127.0.0.1:8788 --profile sheets
npm run check:evidence -- --url http://127.0.0.1:8879 --profile smooth-zoom --source-root <trial worktree>
node qa/evaluation/review.mjs qa/.scratch/evaluation/smooth-zoom/report.json
```

The collector hashes served inputs against the selected source checkout and
saves audits, requested/actual cameras, rendered-label metadata, controls and
screenshots to `qa/.scratch/evaluation/<profile>/`. Use `--seed 22` for a
separate sample and `--out` to preserve a distinct run. Findings or errors
produce nonzero exit status. Overall acceptance always remains incomplete
until the applicable rubric evidence is supplied and reviewed.

The whole-feature sheet audit imports no drawing helpers. It checks station
identity against pre-drawing data, duplicate marks, served-station/name
presence on sheets 2–4, route identity, whole-sheet letter presence and all
stops' proximity to their own routes. Distinct platforms and low-scale
omissions are allowed. The 12 CSS pixel stop envelope is a generous diagnostic
project choice; findings need classification before judging a gate. Input
already passed through the pipeline, so this is not independent GTFS truth.

`review.mjs` compares common rendered station-name anchors across consecutive
sampled trial zooms. It writes `transition-review.json` and fails on anchor
changes. The screenshot-confirmed trial flip is retained as a real regression
fixture alongside synthetic/control tests. This applies to continuous zoom,
not deliberate layout changes between discrete sheets.

Static captures do not establish motion quality. Run the trial's existing
motion/selection/spacing checks too. Emulation and software rendering do not
establish physical-phone performance, touch behavior or VoiceOver speech.

Commit a dated card in `scorecards.md` and a durable PR/CI evidence artifact.
Scratch files alone are not a handoff artifact. See the current coverage
inventory in [qa/evaluation](../qa/evaluation/README.md).
