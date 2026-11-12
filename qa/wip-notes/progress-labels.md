# progress-labels (rules-labels branch)

2026-11-12 start. Read CLAUDE.md, qa/rules/*, qa/drawn/*. Findings that shape the work:
- MapLibre places symbol layers from the LAST style layer to the first (PauseablePlacement, order.length-1 down to 0). labels.mjs placeLabels goes in model order (first to last) and ignores every icon, keep-out and letter, so its `over-line` replays a different placement from the page's. I build a separate replay (place.mjs) and leave labels.mjs alone.
- Keep-outs are line-placed 'clear' icons (1 px image scaled by icon-size) every 4 px along rail and bus lines; the model's marks skip them (point() is null for lines). place.mjs models them as a continuous band (Chebyshev distance to the polyline <= icon-size/2).
- Fixtures vendor 3 fonts only (Regular/Bold/ExtraBold); basemap labels use Medium/SemiBold/Italic. model.mjs falls back to the checkout's public/vendor for a missing font.
- Plan: place.mjs (replay), names.mjs (names vs lines/marks/walk), letters.mjs (rail letters), model.mjs names(z) (basemap labels from tiles).

2026-11-12 WIP stop (owner moving the work). Done: model.mjs labelEntry refactor + names(z) + linePlaced(z) + font fallback; style.mjs --served; place.mjs replay; names.mjs detectors (no unit tests yet). Not started: letters.mjs, tests, style-level checks, planting, timing at z14/z17, ten-strongest review.
