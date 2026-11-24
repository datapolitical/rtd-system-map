# Verification ownership

Updated 2026-11-21. The implementation agent owns routine quality evaluation,
including visual judgment. The map's correctness, readability, appearance and
performance requirements remain in force. A passing script alone is not
visual acceptance. Follow [evaluation.md](evaluation.md) for version-specific
coverage, rider priorities, detector calibration and evidence for each fix.
Unmeasured applicable criteria prevent an overall pass.

## The agent's work

1. Reproduce each reported or observed defect on a named build. Preserve the
   exact camera, zoom, theme and capture before changing it.
2. Run applicable data, geometry and interaction checks. For continuous zoom,
   sample fractional zooms and both sides of each drawing boundary.
3. Inspect rendered phone-size captures in both themes. Check letters, station
   association, route-chip order, rail spacing, joins, ends, label collisions,
   selected routes and space covered by controls. Inspect frames during motion
   where an endpoint screenshot could hide a defect.
4. Fix defects, preserve a known failing example, and add a regression check
   where a meaningful detector is possible. Prove the detector catches the
   original fault. Do not lower a threshold to make the fixed build pass.
5. Repeat the affected checks and inspect the corrected captures. Report what
   passed, what remains, and the measured limitations, with the build and evidence.
6. Choose technical implementations from that evidence and the design principles.
   Present a recommendation rather than asking the user to conduct routine
   comparisons or select an algorithm without supporting analysis.

Existing commands and the branch boundaries are in
[development.md](development.md). Keep the disabled branch-preview workflow
disabled unless explicitly authorized to enable it. Run relevant checks during
implementation; a future automation project is not a prerequisite for fixing
defects now.

The next prototype pass addresses the existing register's station-label anchor,
route-chip ordering, rail-letter visibility and control-occlusion findings.
Confirm each finding on the current trial before calling it a current defect.
Then validate the zoom-12-to-14 candidates and recommend the rail-spacing
approach. Broader isolated engineering can proceed once its evidence and
current-sheet parity checks pass; it does not wait for a blanket manual launch review.

## When the user is needed

- A real product tradeoff that the existing principles and evidence do not resolve.
- A physical-device behavior unavailable to the tools, such as iPhone Safari
  pull-to-refresh, actual VoiceOver speech, or physical-phone rendering/touch
  responsiveness. Complete the automated and visual work first and ask only
  for the specific remaining observation.
- A concise approval of a verified release candidate before a version tag or
  formal release. The user is not asked to repeat the agent's test matrix.

Every request includes one exact action or choice, a working candidate, the
relevant before/after evidence and the reason the agent cannot answer it.
Combine related device checks into one focused session when practical.
Ordinary fixes and unrelated engineering continue while such a check is pending.

## Evidence and closure

Use GitHub Issues as the canonical tracker. Remove `needs Chris` when routine
agent work remains; add it when a concrete user-only request is ready. Do not
close a defect merely because it was fixed in a local preview.

Reports distinguish unit/geometry checks, rendered inspection, emulated browser
interactions and physical-device measurements. Emulation does not establish
actual iOS behavior or physical-phone performance. Preserve a real evidence gap
as such; it does not turn every view into a manual acceptance task.
