---
name: illusion-must-be-pixel-identical
description: "look-alike fixes may not change the visual (PR-001 exception)"
type: feedback
audience: every agent
since: 2026-10-02
updated: 2026-10-02
---

**Rule.** An "illusion" fix must be indistinguishable from the original at every frame, not only at rest. A cheaper
animation that looks different is not acceptable.

**Why.** On 2026-10-02 the user rejected PR-001 rev 1 (hero accent word: a sliding wipe instead of the stroke-by-stroke
draw) because it changed the visual, and asked instead for the apple.com approach: pre-rendered image frames or video.

**How to apply.** Use containment/layout boundaries, layer tricks, or pre-rendered frame sequences (canvas image
sequence or video, checked for 3x sharpness, size and transparency). State any visible difference up front and
expect rejection if there is one.

**Exception (PR-001 rev 2, accepted 2026-10-02 06:31Z).** For PR-001 only, the user accepted a small pixel difference
and asked the team to pick the option with the best measured phone performance: quantify each option's pixel
difference and choose by phone timing (this also lifts the timing deferral for PR-001). The user also asked that one
proposal carry several options to pick from (I-053). Other illusions stay pixel-identical.

Related: [perception-tests-touch-ab](perception-tests-touch-ab.md), [proposal-decision-is-the-spec](proposal-decision-is-the-spec.md).
