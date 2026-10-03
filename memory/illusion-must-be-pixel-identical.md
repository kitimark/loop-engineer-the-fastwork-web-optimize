---
name: illusion-must-be-pixel-identical
description: "look-alike fixes: exact, or within the PR-010 wide numbers (T2) after a numbers check; anything more is a proposal"
type: feedback
audience: every agent
since: 2026-10-02
updated: 2026-10-03
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

**Tolerance tiers (PR-010 rev 3, option "wide", accepted by the user 2026-10-03 15:21Z).** A look-alike fix lands
without a user decision when it is:
- T0 exact, or T1 within the original's own A-against-A noise (as before); or
- T2 near-identical, after a numbers check: only anti-aliased edge pixels or a sub-pixel colour phase differ; fill
  pixels at most 64 of 255, edge pixels at most 128; at most 0.5 % of the screen beyond A-against-A and at most
  2,000 CSS px per element; nothing moved, recoloured or re-worded; reduced motion exact; checked in Chrome AND the
  iPhone Simulator (WebKit) with a real A-against-A run; a moving part stays within 1 device pixel of the original at
  every frame.
Every case reports the same five numbers: largest shade, share of screen beyond A-against-A, area in CSS px, edge or
fill, static or moving. Anything beyond T2 (T3), and any difference that shows only in motion (frozen frames cannot
see feel), is a proposal to the user. Write-up: `research/pixel-tolerance/README.md`.
**Why:** the user chose the wide numbers over the recommended standard ones; frozen-frame numbers still cannot judge
motion, so motion-only differences stay with the user.

Related: [perception-tests-touch-ab](perception-tests-touch-ab.md), [proposal-decision-is-the-spec](proposal-decision-is-the-spec.md).
