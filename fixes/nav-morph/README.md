# nav-morph (F3): the morph at the end of the page

Owner fix-nav-morph. Cost card, coverage map and the lead's decisions on V/D: `costcard.md`. V (arm-scope-c) was dropped
as a perf fix (lead, 2026-10-03: the same work as C, no touch effect anyone can reach); 9bfb4ab on fix/f3-arm-scope keeps
the record. This file covers candidate A ("tween paint diet") and the handoff.

## A, step 1: which tween paints repaint unchanged content (Simulator, 2026-10-03)

Base: C = st6-rb2 (JS 7bf7c4657d21 / CSS f523598b2a24), V = cd-strip tc (JS 6fa0e1e8a221 / CSS 982a747d9263), served
from immutable copies (served hashes checked on every load). Two functional Simulator sessions in the shared lane,
counts only (Simulator ms are never judged, F-084). M driver (`__fwMorphDrive`, 2 cycles, hold 3.5 s), Timeline Paint
clip rects cut per rAF frame on the page clock, LayerTree paintCount snapshots in the holds, isolation probes at rest.
Tools: `tween-paint-sim.mjs`, `tween-paint-read.mjs`, `tween-paint-sim2.mjs`; data in `out/f3a/` (gitignored).

V = C in every row (within ±1 paint). The Simulator's counts match the phone's P-079 attribution (hold ~4.1, open ~15,
close 13.4-13.7 paints per frame).

**Caveat, added 2026-10-03 (F-183): these counts were measured on a morph whose children were stale (WebKit).** In
the Simulator, C's nav children never follow the header's `--morph` during a tween. Affected: nav bar, logo, actions,
earn button and the panel. The cause is scene-scope R4b: `@property --morph { inherits: false }` plus
`--morph: inherit` on those children. They re-resolve only when a header class flips:
- the logo stays at the left;
- "Join waitlist" stays visible at m = 1;
- the panel's fade is frozen at the value from the `is-morphing` flip (~0.08, so opacity ~0), then jumps at the
  `is-expanded` flip (m > 0.92).

The plain baseline animates all of them. The control (`inherit-scroll-sim.mjs`, user path, a push past the end) shows:
- baseline at m = 1: children `--morph` 1, logo x 169, earn width 0;
- C at m = 1: children `--morph` 0, logo x 43, earn width 110.

So the table below counts C's broken morph, not the motion the baseline shows. "The nav bar (logo moves)" below is
really the bar's box. P-079 (phone) is affected the same way: the iPhone read by iphone-runner on 2026-10-03 (55922
st6-rb2, 55926 strip-tc) shows children 0, logo x 43, earn width 110 and panel 0.924. Status OBSERVED, cause unknown;
the reference is UNRESOLVED. The correction is `fixes/morph-inherit/`.

| phase | paints / frame | layouts / frame | style recalcs / frame |
|---|---|---|---|
| hold m=0 / m=1 | 4.3 / 4.5 | 1.2 / 1.4 | 2.0 / 2.4 |
| open tween (17-19 frames) | 15.5-15.7 | 2.0 | 3.1 |
| close tween (22-23 frames) | 13.6-13.7 | 2.0-2.1 | 3.0 |

What paints, by layer (LayerTree paintCount, names from the layer's node):
- Holds: apart from the panel clock (~0.5/frame into `.start-selling-morph-center`), every paint is the platform's
  idle animations: `.start-selling-platform-card` (430x1880, 13 MB) 2/frame, `.start-selling-platform-stage-artboard`
  1/frame; rects 57x4 ×2, 93x39, 140x39. They go on at m=1, where the platform is at `--morph-fade` 0 (opacity 0)
  under the panel.
- Tweens: the extra ~11 (open) / ~9 (close) paints are all in the nav/panel subtree, every one a layer whose size
  changes each frame and that repaints whole (clip = whole layer, OBSERVED): the 3 image column tracks (131 → 139 wide,
  images re-scaled; ~5.5/frame open, ~3.5 close, visible tiles), the header (background colour-mix and radius,
  398x52 → 406x791; 1/frame open, ~3 close), the veil (radial gradient sized by its box), the centre block (text
  re-centred), the footer, the nav bar (logo moves); 1/frame each. Painted area: ~1.08M CSS px² per open frame,
  ~0.59M per close frame; >97 % from these layers.
- The nav actions (188x36) and the language switch (73x36) paint ~0.8/frame each without changing size or content:
  sub-pixel offset moves (RenderLayerBacking, CONFIRMED in `costcard.md`). The switch has `backdrop-filter: blur(12px)`
  (compositing reason `filters`; its parent `transformWithCompositedDescendants`), so it needs its own layer.
- Isolation: stepping only the nav's `--morph` (no classes, platform untouched) reproduces the tween's paint set
  (~12/frame); stepping only the platform's `--morph-fade` gives no per-frame paints (~4 at fade start and end). The
  whole-card repaints of the aw1-10e attribution are gone on this base.

Repaints of unchanged content: (1) nav actions + language switch, ~1.6/frame, ~1 % of the area; (2) the platform card
and artboard while the fade is exactly 0 (invisible): the m=1 hold, the open tween once m ≥ 0.55 (`QM`: fade =
1 − min(1, m/0.55), ~76 % of its time) and the first ~18 % of the close tween. Everything else repaints content that
really changes with the panel size.

Fixes that follow (sent to the lead before building):
- (a) quantising the panel width/offset reaches only (1); the resized layers still change by ≥ 1 device px per frame.
  Mid-motion edge change (T-tier). Recommended: drop.
- (b) the `--morph-fade` restyle has no target on this base (no per-frame paint; R4a keeps it to one element). Drop.
- (c) `visibility: hidden` on `.start-selling-platform` while `--morph-fade` is exactly 0 (set in `S()`), identical
  by construction (invisible both ways). Probe at the m=1 hold, 73 frames: Timeline paints 407 → 51 (C), 409 → 55 (V);
  card/artboard 0; layouts unchanged; restoring brings them back. Caveat: unlike opacity 0, it also drops the subtree
  from the accessibility tree and focus order while hidden. Overlaps fix-platform-idle (glint-ca + sweep-exact moves
  these animations to the compositor), finding F-182. Less work, little smoothness.
- A cannot reach its registered "~15 → ≤ 6 paints per tween frame": the miss it pre-registered (the extra paints are
  the box's real size change). Tween frames over 34 ms are expected to stay at ~5-11 per tween, so #4 (composited
  reveal) meets the lead's threshold for a user proposal.

Lead's decision (2026-10-03): #4 now, as a console proposal for the user (drafted here, posted by the lead; no
prediction registered until the user decides). (c) is on hold until platform-idle lands; then re-count the m=1 hold and
open-tween paints on top of it (Simulator, shared slot, counts only) and build (c) only if it still saves real work,
as a less-work fix (cost card + short phone no-worse check, the a11y/focus change in its card).

Platform claims for this card:
- "Safari doesn't animate clip-path on the compositor": CONFIRMED. WebKit `Source/WebCore/css/CSSProperties.json` at
  safari-7624-branch 0f8c6795eafb755b6c7480d2a57305315fd40ae4: the `clip-path` entry (l.4172) has no
  `animation-wrapper-acceleration`; only opacity (l.7022), filter (l.10141), backdrop-filter (l.10520), transform
  (l.11995), translate / scale / rotate (l.12143 / 12164 / 12189) carry `"always"`, offset-* `"threaded-only"`.
- "time-based `linear()` easing is not accelerated in WebKit": CONFIRMED. `Source/WebCore/animation/KeyframeEffect.cpp`,
  same commit: `canBeAccelerated` (l.1926) refuses linear() with points (l.1962); the threaded early return (l.1952)
  needs `canHaveAcceleratedRepresentation` (l.3135-3146), which for time-based animations needs
  `ThreadedTimeBasedAnimationsEnabled`, default false, status unstable (`UnifiedWebPreferences.yaml` l.8339-8352).
- "WebKit keeps repainting composited descendants of an opacity-0 layer; `visibility: hidden` stops it": OBSERVED
  (Simulator, in our setup; source not checked; decisive check: RenderLayerBacking's display path for a layer under an
  opacity-0 ancestor).

## Handoff

- **#1, panel clock on the compositor roll → cd-roll-ca (when it resumes; the lead passes it on).** Extend
  cd-roll-ca's roll to the panel clock (`.start-selling-morph-panel .waitlist-closing-countdown`), gated to m ∈ {0, 1}
  (no tween running); while a tween runs keep the spring. Why the gate: layered rolling cells repaint whole when the
  resizing panel moves them by a sub-pixel offset (the cdwc mechanism, RenderLayerBacking, CONFIRMED), so a roll
  overlapping a tween could make tween frames worse. Effect: less work only (~30 rAF/s for half of each second,
  ~0.5 paints per frame at the hold); no smoothness gain (the hold is already 17 ms p95 at Serious). Pixel class: T2,
  the user's near-identical decision would have to cover the panel clock. It stacks after cd-strip tc and cd-roll-ca;
  the panel clock's layering is fix-nav-morph's cdwc rule, so tell fix-nav-morph before changing it.
