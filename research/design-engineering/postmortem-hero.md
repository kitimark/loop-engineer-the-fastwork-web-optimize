# Post-mortem: the hero refactors on the phone (de-pm-hero)

2026-10-01. Question from the lead: our phone-tested hero refactors underperformed or failed; what did we
misunderstand, and what do we do next? Offline analysis only: no Chrome, no phone, no locks. The cards below
use protocol v2's attribution-card form (`research/architecture/measurement-protocol-v2.md` §2.3). Labels as
in the team README: **data** (file named), **derived** (our arithmetic), **vendor source** (path cited).

Inputs:
- **iPhone raw logs**, iphone-runner's worktree `fixes/iphone-wave2/raw/`:
  - `hero-{B,P,Q,R}*`: the hero block, window top → y≈1250 then a hold. B = aw1-10c, P = hero v2 on aw1-10e,
    Q = aw1-10e ("P2"), R = v2 + people-o ("P3").
  - `hero-{H,K}*` and `hero-P4-6` / `hero-Q7-9`: hero-A, window top → y≈1745. H = h1v2, K = h1.
  - `finger-*`.
- **iPhone Timeline captures** (iphone-runner `out/iphone-runner/`): `e-tc1`, `e-tc2` (aw1-10e) and `e-ta1`, with
  `.tl.json`, top → y 2500, real durations (F-047).
- **Write-ups:** `hero.md`, `safari-render-signals.md`, F-035, F-045, and fix-hero-exit's README (variant rows 09-17).

Scripts (scratch, not committed) live in `<scratchpad>/de-pm-hero/`:
- `lock.mjs` / `arrive.mjs` / `win2.mjs`: frames relative to the flip crossing;
- `tl2-4.mjs`: Timeline segments;
- `start.mjs`: the first 400 ms of scroll;
- `payer.mjs` (who pays each Layout), `dirtier.mjs` / `dxp.mjs` (who dirties it, crossed with the payer),
  `cdcheck.mjs` (the record types under one script line): §1.4 and §7.

## 0. Summary: the five misunderstandings

| # | the model said | the phone says | consequence |
|---|---|---|---|
| M1 | Chrome mechanism PASS (exit-opacity writes 14 → 0) means v2 costs nothing anywhere else on WebKit | v2 adds ~11 ms to the flip frame at y≈700. P3 shows it without v2's y≈50 saving, so it is a v2 cost, not a moved cost | v2 shipped a win and a loss we can't attribute yet |
| M2 | the 0.72 flip is restyle-bound (style 5-29 ms) plus raster of the newly visible card | Timeline: style 1.9-3.1 ms. Layout 13.9 ms (whole view, forced by the nav callback) + Composite 23.7 ms, then a second frame with 12.1 + 14.0 ms of Layout + 23.1 ms Composite | h1 could remove only part of Composite, so ≤34 ms was unreachable by construction |
| M3 | "the y≈700 frame (#people entry)" is one event | it is a **pair** of frames with **three** whole-view layouts from at least two invalidation sources, plus two ~23 ms composites | per-frame fixes aimed at one trigger can't close it |
| M4 | the y≈1250 frame is y-locked (F-045: the commission scene gate) | it is **time-locked to the flip**: flip + 741-767 ms in 27/27 runs; its sibling at flip + 932-960 ms appears at a held y 1237-1250 *and* at a moving y 1376-1437 | F-045's gate is not the cause. The card's reveal transitions ending (0.7 s opacity, 0.9 s filter/transform) are |
| M5 | layout is priced by the size of the change | routine layouts are 0.1-0.5 ms. Every long frame here holds one layout of **12-16 ms** (root = the whole view); a few specific invalidations cost the whole page | the cost term to model is "which writes cause a 14 ms layout", not "how many elements restyle" |

## 1. The shared corrected model (data + vendor source)

1. **Long hero frames are Layout ~14 ms + Composite 17-24 ms, not style.** All six long frames in the three
   Timeline captures between the flip and y 1600 have this shape:
   - flip t+767, +826;
   - transition ends +1466, +1666;
   - a class toggle at +1900 (L11538 write, then a forced read in the commission rAF L3258: Layout 16.2);
   - ~1 Hz idle and in-scroll layouts first read as countdown ticks. **Corrected in §7 (D3):** they come from
     the avatar carousel rotator, not from the countdown.

   Style is 0.1-3 ms in every one. The script that *pays* the layout is whichever code reads geometry first
   (the nav callback `ee` L2671, the logger rAF, the commission rAF); it is never the cause. (**data**: `e-tc2`,
   repeated in `e-tc1`/`e-ta1` within ±4 ms.)
2. **Most frames lay out cheaply.** Routine frames run a 0.1-0.5 ms Layout; even 12 ms layouts with a cheap
   composite stay ≤24 ms (t+888, t+1044). A frame goes long only when a whole-view layout coincides with a
   17-24 ms Composite (layer-tree or backing change).
3. **WebKit forces layout when an element's layer presence flips.** In `miscDataChangeRequiresLayout`, a change
   "requires layout" when:
   - `transform` goes none ↔ some;
   - `opacity` crosses opaque (comment: "a full layout is necessary to keep floating object lists sane");
   - `filter` goes none ↔ some (`hasFilters()`).

   Source: **vendor source**, WebKit `Source/WebCore/style/StyleDifference.cpp`, main, read 2026-10-01; the shipping
   iOS build may differ in detail, but the FIXME is old. Blink does not relayout for these. So a transition whose
   endpoint is `opacity: 1`, `filter: none` or `transform: none` costs a layout **in the frame where it ends** on
   WebKit, and a transition that *starts* from such a value costs one in its first animated frame.
   **Derived:** why that layout costs 14 ms rather than 0.5 ms is not named (candidates: the card is a whole
   section's subtree; layer create/destroy; positioned descendants).
4. **Who pays the long layouts (added after R-U1: our logger reads `scrollY` in rAF and forces layout).**
   Every Layout ≥10 ms in t −0.5..2.6 s of the three captures, by payer (**data**: `payer.mjs`):

   | capture | render update itself | page script | logger `loop` (scriptName "") |
   |---|---|---|---|
   | e-tc2 | 12 | 2 | 5 |
   | e-tc1 | 15 | 2 | 5 |
   | e-ta1 | 13 | 2 | 5 |

   So 40 of 59 whole-view layouts happen with no reader; the 12-16 ms layout is not a probe artifact.
   - The logger pays the flip+60 frame's first layout and the reveal-end frames (+700, +900); a few others
     too.
   - In the reveal-end frames it is the **only** long layout. A read only moves *who* pays a dirty layout,
     unless something dirties it again later in the same frame. Without the logger, the same style
     resolution should run in the render update: same frame, same cost (prediction for the y-source A/A).
   - **The one possible double:** the flip+60 frame holds a logger-paid 12.1-12.5 ms layout *and* a
     render-update 12.1-14.0 ms layout inside Composite, in 3/3 captures. The second follows a stackless
     InvalidateLayout after the paints, next to a vendor PerformanceObserver callback (not our logger).
     Without the logger the two may merge into one.

## 2. Case cards

### Card 1: hero v2 (scroll-timeline exit): y≈50 better, y≈700 +11 ms

- **Assumption:** composite-only CSS on a scroll timeline replaces 14 JS writes per frame; Chrome counts → 0
  proves the mechanism, so the phone gains at y≈50 and is neutral elsewhere (hero.md §2D listed overlap /
  effect resync / noise as candidates for the +11 ms, with no measurement planned before shipping).
- **Phone data** (block, median [range]):

  | build | y≈50 | y≈700 |
  |---|---|---|
  | B | 48 [42-64] | 51 [45-53] |
  | Q (P2) | 43 [37-48] | 52 [44-56] |
  | P (v2) | 35 [22-37] | 63 [58-68] |
  | R (P3) | 44 [38-48] | 61 [57-64] |

  The ranges at y≈700 are disjoint from B and Q.
  - The extra cost is in the flip pair: max of flip + 0-130 ms is 58-73 for P, 57-64 for R, 44-59 for Q.
  - Elsewhere in the window, v2 is flat or better.
  - **Data:** the 7 ViewTimeline animations run until track − innerHeight = y 815-855 on the phone. That is
    *past* the flip crossing at y 587-616, so they are live in the flip frames.
- **Broken assumption:**
  1. "Chrome mechanism PASS ⇒ phone cost parity." The counter that went to 0 (JS writes) was not the thing that
     costs on WebKit in the flip frames.
  2. **Conservation is refuted.** v2 did not move the y≈50 cost to y≈700: R keeps the +10 ms at y≈700 while
     getting y≈50 back (44 ms).
- **Corrected model:** the +11 ms is a v2-CSS cost in a frame that already pays a whole-view layout + layer
  change. Three hypotheses, all *assumed*:
  - (a) WebKit re-resolves the live ViewTimeline animations or their ranges after a layout (+style/layout
    segment);
  - (b) accelerated-effect resync when the layer tree changes under 7 running effects (+Composite);
  - (c) overlap layers / backing for the hero copy (+Composite, extra Paint records).
- **Attribution card:**
  - stage: unknown (Layout vs Composite);
  - code: v2 CSS (fix-hero-exit overlay 8a14ac2e);
  - ablations: hero-B v4nocards / v5noblur / v6noflip / v7copyop are built but not run, and none yet has a
    mechanism check;
  - device class: phone-only (Chrome flip step 2.9-3.4 ms in all builds);
  - **verdict: LOCATED** (frame and build factor known, segment and mechanism not).
- **Next action:** Timeline ticket **ST-1** (§4) before any hero-B block; it says which arm to run. Cheapest
  positive ablation to add: **v2-endearly**, the timeline range ends before the 0.72 crossing (the copy is already
  invisible there, so parity should hold), so no v2 animation is live in the flip frames. Prediction: y≈700
  returns to Q's 52 [44-56] while y≈50 stays ≤37.

### Card 2: h1 (pre-raster the future card): 56 → 45, target ≤34 missed

- **Assumption** (hero.md §2B): `T_flip ≈ (N_card+N_nav)·c_el + raster + transition-start`, with restyle 5-29 ms
  and raster of the newly visible card as the big terms. `opacity: 0` + `inert` instead of `visibility: hidden`
  pre-rasters the card, so the flip drops to ≤34.
- **Phone data:**
  - h1 45/41/52 vs Q 56/59/52; h1v2 77/35/52 vs P 60/65/73. That is −11 to −13 ms, and ≤34 in 1 of 6 runs.
  - Timeline on aw1-10e (the build h1 sits on):

    | frame | RF | style | Layout | Composite |
    |---|---|---|---|---|
    | flip | 58.2 | 1.9 + 3.1 (the reads in `ee` and L11538) | 13.9 | 23.7 |
    | next | 43.3 | - | 12.1 (logger) + 14.0 (inside Composite) | 23.1 |
- **Broken assumption:** style is ~5 ms across the pair, not 5-29. The dominant terms are ~40 ms of whole-view
  layout across the pair plus 2 × ~23 ms Composite. h1 touches only Composite.
  - **Derived:** removing all raster from frame 1 would still leave ≥ 3 (script) + 5 (style) + 14 (layout) +
    commit ≈ 25-30 ms. Frame 2's 26 ms of layout is untouched.
  - So the ≤34 target needed a layout term the model didn't have.
- **Corrected model:** h1's −11 ms fits Composite 23.7 → ~12-15 (raster moved earlier). The rest is the layouts
  of M3/M5.
- **Attribution card:**
  - stage: Composite (h1's part), Layout (the remainder);
  - code: the reveal's `visibility` → raster at reveal;
  - ablation: h1 itself is the positive arm; no negative or mechanism check (paintCount before the flip,
    safari-render-signals P3b) has run;
  - device class: phone-only;
  - **verdict: LOCATED** (h1's gain plausible, not attributed).
- **Next action:** keep h1 parked. In ST-1 add K vs Q. **Prediction:** frame 1 Composite ≤15 ms in K vs 23 ± 3 in
  Q, Layout unchanged ±2 in both frames. If Layout moved instead, this card is wrong.

### Card 3: the y≈700 frame itself (F-035), two triggers in one step

- **Assumption:** the nav pill drop and `#people` `is-visible` share one frame, and the cost is two layout
  transitions starting (Chrome: ~30 layouts per step, with the nav's max-width/padding/gap transitions).
- **Phone data:**
  - All writes come from one rAF: `l` at L11538 (the 0.72 flip `z(y, …)`, `is-future-shrinking`,
    `is-pain-dark`) runs 3.7 ms. Then the nav callback `ee` (L2671) reads and pays the 13.9 ms Layout.
  - One frame later the logger rAF pays a 12.1 ms Layout with no script write in between. Inside that frame's
    Composite another 14.0 ms Layout follows an InvalidateLayout.
  - No per-frame layouts for 0.68 s after the flip (frames between are 0.1-0.5 ms). The nav's earn-button
    max-width transition does not run as layout on the phone.
- **Broken assumption:** "two transition starts" is Chrome's picture. On the phone it is **three whole-view
  layouts in two frames**, and the nav width transition plays no part. After the R-U1 check (§1.4):
  - **certain:** two layouts, one per frame. Frame 1's is paid by page code (13.4-14.0 ms, 3/3). Frame 2's
    render-update layout is 12.1-14.0 ms, 3/3.
  - **unconfirmed:** the third (frame 2's logger-paid 12.1-12.5 ms) may be a probe double. The y-source A/A
    decides.
  - **Derived from §1.3:** frame 1's card styles don't flip presence (opacity 0 → animated, filter blur(14px)
    → animated, transform translateY(48px) → animated), so the card's reveal is *not* frame 1's layout source.
    The source is another element whose style the flip writes change.
  - Frame 2's logger-paid layout matches a transition whose *from* value is `opacity: 1` / `none` taking its
    first animated value. The writer is not named.
- **Attribution card:**
  - stage: Layout (3 × 12-14 ms) + Composite (2 × 23 ms);
  - code: the L11538 flip writes. Which element's change requires the layout is not named;
  - ablation: none run;
  - device class: phone-only;
  - **verdict: LOCATED.**
- **Cheapest naming probe:**
  1. **Offline first, Chrome short lane, counts only** (a bundle-mapper or fix-hero-exit): list every element
     whose computed `opacity` crosses 1 or whose `filter`/`transform` crosses `none` in the flip frame and the
     next, at 430×775. Diff `getComputedStyle` per element across the two frames.
  2. Then **one phone attribution run of a split build**: the nav class flip at 0.72, the `is-visible` reveal at
     0.80 (a position-moving ablation, so it proves *which trigger*, not what costs; §2.3). Prediction: the
     Layout ≥10 ms frames follow the trigger that owns the presence flips from step 1.

### Card 4: the "y≈1250" frame is time-locked to the reveal ends (F-045 weakened)

- **Assumption** (F-045): the frame is y-locked to the `.commission` scene gate (paused → active at Chrome
  y 1340), mapped to the phone y≈1250-1410.
- **Phone data** (27 hero runs, all builds; **data**: `arrive.mjs`, `win2.mjs`):
  - **Max frame in flip + 700-800 ms:** 40-54 ms at **+740 to +767** in 27/27 runs.
  - **Max frame in flip + 900-1000 ms:** 32-45 ms at **+932 to +960** in 27/27 runs.
  - In the hero block the scroll is already **held** at y 1237-1250 (arrived at +717-764) when the +940 frame
    comes. In hero-A the same frame comes at a **moving** y 1376-1437.
  - Same time, different y: the +940 frame is time-locked. The +745 frame only *looks* y-locked because the
    scripted driver reaches y≈1250 at that moment in every run.
  - Timeline (tc2):
    - +700 frame: Layout 14.7 (logger-paid, whole view), Composite 17.3;
    - +900 frame: Layout 15.6, Composite 19.6;
    - no script writer, no timer, no IO, no scene attribute in either.
  - The card's transitions (aw1-10e and every tested build):
    - `opacity 0.7s`;
    - `filter 0.9s linear(…)`;
    - `transform 0.9s`.

    They end at `opacity: 1; filter: none; transform: none`. They start ~45 ms after the crossing frame, so the
    ends fall at ≈ +745 and +945. Each end is a presence flip that requires layout (§1.3).
  - Finger runs are too noisy to add evidence (long frames everywhere).
- **Broken assumption:** "the only non-periodic *y-locked* event near 1250". The event isn't y-locked; the scan
  for y-locked events could not see a timed one.
- **Corrected model:** two long frames at flip + 0.7 s and + 0.9 s, each ~15 ms whole-view Layout + ~17-20 ms
  Composite, caused by the reveal transitions *ending*. A third, at +1.13 s (y≈1528, tc2), is a separate
  class write (L11538: `is-future-shrinking` or `is-pain-dark`, not yet told apart). Its forced read is in the
  commission rAF L3258 (Layout 16.2).
- **Attribution card:**
  - stage: Layout + Composite;
  - code: `.start-selling-future.is-visible > .start-selling-future-card` transitions (CSS 2405-2414 baseline;
    2416-2428 aw1-10e) + WebKit `miscDataChangeRequiresLayout`;
  - ablation set (not run):
    - positive arm 1, `re-dur`: card opacity 0.7 → 0.5 s; predicted the +745 frame moves to +545 ± 20 ms;
    - positive arm 2 / negative for arm 1, `re-keep`: end state `filter: blur(0px); transform: translateY(0)`;
      predicted the +940 frame's Layout < 2 ms while +745 stays;
    - mechanism check: computed `transition-duration` / end-state `filter`, `transform`;
  - device class: phone-only (Blink has no such layout rule);
  - **verdict: LOCATED, with a NAMED candidate.** Timing (27/27), Timeline shape and vendor source agree. The
    ablation is one block.
  - **Status (P3 block, 13:35-13:44Z, n=2 per arm, lead signed D): NAMED for the +700 and +900 frames.**
    Details in §7.9.
    - **re-dur:** the +700 Layout moves by -199 ms (predicted -200 ± 20). This is a causal intervention, so the
      attribution does not rest on a platform claim.
    - **re-keep:** removes the +900 Layout.
    - **ST-2d:** the +900 frame still fires at rest, with no flick. U5 is out for these two frames.
    - **Condition 1:** the WebKit mechanism stays **OBSERVED in our setup, cause unknown**. That is why a
      finished opacity/filter/transform transition triggers a whole-view Layout (`miscDataChangeRequiresLayout`
      above is a candidate, not a reference check). arch-claims routes the reference check. No fix decision may
      depend on the mechanism.
    - **Condition 2:** re-keep also removes the +1150 Layout (rAF L3258). That stays **UNEXPLAINED** until
      fix-hero-exit traces what re-keep changes on the L3258 path, before re-keep-op's build card. fix-hero-exit
      has since sent a proposed trace (§7.9); the lead decides whether it lifts this condition.
      **Lifted (lead):** the code path is accepted. `l()`'s rAF writes `is-future-shrinking` (L11552); on phones
      that flips the card's transform `none` → `scale(1)`; L3258's forced read pays. So +1150 joins the
      presence-flip family, superseding "L11538, not told apart". The platform half stays **OBSERVED in our
      setup**: that a `none` → non-`none` transform change triggers a WebKit layout and `translateY(0)` →
      `scale(1)` does not. It is part of condition 1's reference check. re-keep-op's build card may cite the code
      path, not the WebKit rule.
    - **Condition 1 update: mechanism CONFIRMED** by arch-claims in WebKit-7624.4.5 source (claims-audit §2.8,
      762fc40; board F-075). Lifting condition 1 is the lead's decision.
      - **Transform flip:** `StyleDifference.cpp` l.191-193 returns Layout when `hasTransform()` flips, and
        `hasTransform()` means "not `none`" (`StyleTransformData.h` l.50). So `none` → `scale(1)` causes a Layout.
      - **No flip:** `translateY(0)` → `scale(1)` is only a context-sensitive Transform change (l.194-197).
        `RenderElement::adjustStyleDifference` (l.302-316) then makes it RecompositeLayer or Overflow if the card
        has a layer, and Layout only if it has none.
      - **Opacity and filter:** the same rule covers the +700 / +900 ends, through an isOpaque flip and a
        hasFilters/hasTransform flip.
      - **Why the root is the view:** no layout boundary sits above the card (RenderObject.cpp l.523-562,
        598-660).
      - **Still OBSERVED:** the tie of each frame to this rule (the re-dur and re-keep ablations, n=2).
      - **LIFTED (lead):** the presence-flip mechanism is CONFIRMED (§2.8, F-075). The attribution of these
        phone frames to it stays OBSERVED (n=2).
- **Fix only after NAMED:** end states that keep presence. `blur(0px)` / `translateY(0)` remove the +940
  layout. For opacity, either align its duration with the 0.9 s pair (two long frames → one) or end at 0.999.
  The 0.999 end needs a render-server check: group opacity on a full-section layer may cost an offscreen pass
  every frame.

## 3. h3 and h4 in the corrected model

- **h3 (countdown strip).** **Superseded by §7 (D3).** The 1 Hz layout pairs below belong to the avatar carousel
  rotator. The countdown spring dirties no layout in any capture. The t+2286 frame was dirtied by an
  IntersectionObserver mount (L13345 overlay), not by a tick. The original text is kept for the record:
  The Timeline shows each 1.05 s tick, on each of the two countdowns, triggering a
  whole-view Layout of 15-37 ms: at idle (pairs Δ205-233 ms) and in scroll (t+1002, +1241, +2286 with RF 128.8 /
  Layout 44.6, +3397).
  - hero.md R3 priced the tick by layers (160 → 16) and writes (10 → 1). Under M5 the term that matters is the
    **layout invalidation per tick**; a strip that still flips presence or mutates text in an auto-sized
    inline-flex keeps it.
  - Not named: what in the tick dirties layout. Code facts: faces have `will-change: transform`; per-frame
    `style.transform` writes (no presence flip); `bind:offsetHeight` on the spacer (a ResizeObserver read that
    *pays* whatever is dirty).
  - **Next:** offline, name the dirtier from `e-tc*` (the first InvalidateLayout record after each TimerFire
    and its stack). Then h3's prediction card must state Layout per tick before/after.
  - Cheapest candidate fix family: a fixed-size `contain: strict` box around each countdown, if the dirtier is
    inside it.
- **h4 (people-o FLIP).** Still valid but scored only at slow speed (the people-o reset fires at G/F speeds, not
  at the scripted speed). Its "0.92 s of per-frame layout" is the costly kind only if those layouts are
  whole-view; the Timeline has no slow-scroll pass to check it.
  - Open flag: R (P3 = v2 + people-o CSS) lost v2's y≈50 gain (44 [38-48] vs 35 [22-37], n = 3, disjoint).
    Explain this before h4 builds on P3.
  - **Next:** one G-driver attribution run on P3 vs P over y 900-1100. Prediction: the people-o frames show
    Layout ≥10 ms per frame (whole view) if h4's gain is real at the predicted size.

## 4. Slot tickets (via mgmt-ops-4; Timeline attribution runs per §5.5, Page.disable → Page.enable first)

- **ST-1. Flip pair, y 0-1000, segment attribution.**
  - Builds and hashes:
    - control Q = aw1-10e (JS 3e2f599a / CSS c6aad94b);
    - P = v2 (JS 71d76d69 / CSS 8a14ac2e);
    - K = h1 (JS 94e205d6 / CSS d49a050e).
  - Driver: W (6 s idle, window top → y 1000). 1 warm-up, then Q P K Q K P (2 per arm), ~20 min.
  - The question: which RenderingFrame segment carries v2's +11 ms and h1's −11 ms?
  - Pre-registered, per flip frame and frame + 1:

    | hypothesis | Layout (P vs Q) | Composite (P vs Q) | other |
    |---|---|---|---|
    | H2a ViewTimeline re-resolve | ≥ +5 ms, or an extra RecalculateStyles ≥3 ms | ±3 | - |
    | H2b effect resync | ±2 | ≥ +6 | - |
    | H2c overlap/backing | ±2 | up | ≥3 more Paint records |
    | h1 (K vs Q) | ±2 | frame 1 ≤15 vs 23 ± 3 | - |
  - Decision:
    - H2a or H2b → hero-B runs v2-endearly + v7copyop only;
    - H2c → v4nocards / v5noblur;
    - none → v2's cost is not in these frames: re-read the block data before spending more.
- **ST-2. Reveal ends, y 1100-1450, ablation block.**
  - Builds (built by the reveal owner, fix-hero-exit coordinating): `re-dur`, `re-keep` on aw1-10e, against
    control Q.
  - Driver: hero-A W (top → y 1745). C V V C with V alternating the two arms, plus 1 Timeline run per arm, ~25 min.
  - Predictions (Card 4):
    - `re-dur`: +745 → +545 ± 20, +940 unchanged;
    - `re-keep`: +940 frame Layout < 2 ms and dt ≤ 25 ms, +745 unchanged;
    - Q: both present.
  - Falsified if: both frames stay put in both arms.
  - **Rival, R-U5** (de-unknowns-render, `unknowns-render.md` 8de2df7):
    - claim: the y 1249-1749 long frames are a forced ~15 ms layout + a 16-20 ms raster of the two deck panels
      (402×857). iOS shrinks tile coverage at velocity 0, so backings detach and fully repaint on the next
      flick; the period comes from the driver's flicks.
    - prediction in this block: `re-dur` and `re-keep` change nothing; the frames stay tied to the flicks
      (time since the last velocity-0 frame), not to the flip.
    - data already against it for the +940 frame: in the hero block that frame comes 185-237 ms *after*
      the scroll arrived and held at y 1237-1250, with no further flick. Also, t+1900 has a page-script
      writer (L11538 → L3258).
    - data compatible with both: the +700 / +900 frames do paint the 402×857 panels.
  - **Arm ST-2d "fling-hold"** (de-unknowns-render's decoupling arm, build Q, no new build):
    - driver: W over y 1100-1800 as one constant-velocity fling (~20 px/frame, no velocity-0 dips), a 1.5 s
      hold at y 1800, then one short flick;
    - runs: 1 Timeline + 2 counted, ~10 phone min;
    - U5(a) predicts: at most one long frame at the fling start; no full 402×857 paint after the first 100 ms;
      after the hold, the resuming flick repaints both panels (Composite ≥15 ms); flip timing irrelevant;
    - Card 4 predicts: long frames at flip + 745 / + 945 whatever the velocity profile.
  - **Readout per frame >34 ms:** time since the flip, time since the last velocity-0 frame, Layout ms (with
    payer, §1.4), Composite ms, and whether a 402×857 paint clip is present.
  - **Decision:**
    - `re-dur` moves the frame and ST-2d leaves it → Card 4 NAMED, U5 out for these frames;
    - `re-dur` changes nothing and ST-2d removes it → U5 NAMED, Card 4 retracted;
    - both move → two mechanisms coincide (each owns its frames);
    - neither → both rivals wrong; re-read.

    If Card 4 holds, the next step is a build card for the end-state fix and the page-wide pitfall (every
    reveal ending at 1/none).
- **ST-3 (cheap, optional, existing build Q):** a W run with a 1.5 s hold at y 900. Prediction: the
  Layout ≥10 ms frames still come at flip + 745 / + 945 while held at y 900, where no scene gate can fire. It
  removes the last y-lock doubt without new builds.

## 5. Ranked next actions

1. **ST-2 (+ a findings-board pitfall now):** the reveal-end layouts. 2 long frames per pass in every build,
   a cheap CSS ablation, phone-only. The same rule applies to any transition on the page that ends at
   `opacity: 1` / `filter: none` / `transform: none`.
2. **ST-1:** split v2's +11 ms and h1's −11 ms by segment. It decides which hero-B arms are worth a block
   (saves up to 2 blocks).
3. **Name the flip pair's layout sources** (Card 3): first the Chrome short-lane computed-style diff (counts
   only), then one split-trigger phone run.
4. **h3:** ~~name the countdown tick's layout dirtier offline~~ done in §7 (D3). The countdown dirties no layout,
   so h3's Layout term is zero; the 1 Hz layouts are the avatar carousel's. Its fix ticket is **ST-4**.
5. **h4:** hold until P3's y≈50 regression is explained; then one G-driver attribution run.
6. **F-045:** retract the commission gate as the y≈1250 cause (keep it as a possible small term). The +1.13 s
   class-toggle frame (L11538 → L3258) goes to fix-scroll-engine / commission-forced-layout.

## 6. Note for de-pm-morph (rest-to-motion)

First 400 ms after the 6 s idle (`start.mjs`):
- **B / Q / K / H:** one 40-64 ms frame at +40-70 ms (y 26-58), often a second 30-38 ms frame at +95-100.
- **P (v2):** none above 30 ms in all 4 runs, and nothing reappears in the next 300 ms. So the y≈50 frame is
  removable work (the JS exit writes), not a pure rest transient.
- **R (P3):** it returns (38 at +0).
- The y≈700 frame comes ~2 s after motion starts, so it is not a first-frame-after-rest effect.

## 7. Addendum D3: what dirties layout "on each countdown tick" (unknowns-actions D3)

Question (unknowns-actions D3): what dirties the 15-37 ms whole-view layout seen about once per second?
Answer: **not the countdown.** It is the avatar carousel rotator in `#people`, in the "start-selling-future"
community pill. It runs at nearly the countdown's cadence, which is why §3 h3 mixed the two up. This is offline
work only: the three Timeline captures `e-tc1`, `e-tc2`, `e-ta1` (aw1-10e) and the source. No phone, no Chrome.

### 7.1 Dirtier vs payer, with the logger separated (data: `e-tc1/tc2/ta1.tl.json`; `dirtier.mjs`, `dxp.mjs`)

Method, for every Layout record ≥10 ms:
- **Dirtier:** the last InvalidateLayout record before it that is not under the logger's `loop` (scriptName "",
  L5), with its script chain.
- **Payer:** the script that encloses the Layout (§1.4).
- **No dirtier:** if no non-logger InvalidateLayout happened since the previous Layout, style resolution
  (transition or animation steps) dirtied the layout, and the logger pays it.

| dirtier (overlay line) | idle (t<0): n, ms each | scroll: n, ms each | paid by |
|---|---|---|---|
| **Timer → `2.DyWL8TcE.js:11571` (avatar rotator)** | **15**, 14-31 (med 24) | **32**, 11-43 (med 18) | render update 47/47, logger 0 |
| Timer → `:3864` (hero script accent, word swap) | 2, 22 | 1, 14 | render update |
| IntersectionObserver (→ `:13345`, lazy section mount) | 0 | 5, 13-24 | render update |
| rAF → `:2671` (nav callback `ee`), rAF → `:3258` (commission rAF) | 0 | 3 + 3, 13-16 | page script |
| native (scroll, reveal, IO; no script on the stack) | 3, 14-15 | 28, 11-23 | render update |
| none recorded (style-driven) | 0 | 20, 12-25 | **logger** 20/20 |
| **countdown spring rAF `:4039`** (baseline L3836, `$E`) | **0** | **0** | n/a |

**The countdown (`cdcheck.mjs`):**
- The spring rAF at overlay L4039 runs 113-183 times per capture.
- Under it there are only `RequestAnimationFrame` and `ScheduleStyleRecalculation` records (51-57 per capture),
  and **0 InvalidateLayout**.
- Its face writes are `style.transform` on `will-change: transform` faces, i.e. composited translates. So the
  countdown dirties no layout; its cost lies elsewhere (face repaints, F-050 / de-pm-morph).

**The rotator:**
- Its 17-18 timer callbacks per capture hold an InvalidateLayout in 14-17 of them, with 16-19 ms of script in
  total.
- Each callback also holds 3 MutationObserver callbacks from the analytics vendors (`analytics.js:118`, the
  Amplitude GTM bundle). They are small, and the InvalidateLayout record comes before them in the chain.
- `dirtier2.mjs` on tc2: for all 14 rotator layouts ≥10 ms, the rotator's InvalidateLayout is the **only**
  non-logger InvalidateLayout since the previous Layout.

**The logger caveat (F-051 / X9) does not apply to these layouts.**
- The logger dirties none of them and pays none of them (47/47 are paid by the render update).
- The 20 layouts the logger does pay are the style-driven ones, with no script InvalidateLayout. Without the
  logger, the next render update would pay them: they can move in time but are not added.

### 7.2 The writer (page source)

Baseline `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js`, component `mM` (`#people`):

- **Where it runs.** L11330-11356; the timer callback is L11332 (overlay L11571).
  - It runs while `dE`'s element is within one viewport (`rootMargin: 100% 0px`, L2749-2776). That covers
    y 0 and also y≈2745 in these captures.
  - `prefers-reduced-motion` stops it (`if (!e.matches)`).
- **One cycle (about 1.02-1.05 s) makes two writes.**
  1. It waits 800 ms, then sets `z(S, true)`.
  2. It waits 220 ms, then sets `z(x, x+1)` and `z(S, false)`.
- **The pairs.** The two writes of a cycle are 205-240 ms apart. In tc2 idle: −2130 / −1895. In scroll:
  +4257 / +4497 and +5306 / +5546. These are the "pairs Δ205-233 ms" that §3 credited to two countdowns.
- **Each write swaps a whole `{#if}` branch.** The swap is L11415-11447, `s(S) ? e(ge) : e(_e, -1)`, inside
  `<div class="start-selling-avatars is-carousel">` (template `pM`, L11257).
  - S = true mounts `dM`: 5 new `<img loading="lazy">`, the first with `is-exit` and the last with `is-enter`.
  - S = false mounts a keyed each of 4 new `fM` imgs.
  - So every tick removes 4-5 renderers and inserts 4-5 new ones.
- **The CSS** (`2.gBuqKVzi.css` L2856-2887):
  - `.is-carousel` is `display:flex; width:104px; height:32px; overflow:hidden`.
  - `img.is-exit` runs `avatars-exit` for 0.22 s. It animates **`width`, `flex-basis` and `margin-right`**
    (layout properties, on the main thread) plus opacity (keyframes L2888; a twin `start-selling-avatars-exit` at L10412).
  - `img.is-enter` runs `avatars-pop` (L2905: opacity 0 → 1, scale .35 → 1). It ends at opacity 1, a presence flip in
    §1.3's sense.
- **The second dirtier** (3 per capture) has the same shape. The hero script accent's draw-out → draw-in timer
  (baseline L3699-3701) changes the shown word (`z(r, o)`), which is a text change.

### 7.3 Why the layout is whole-view rather than local: LOCATED, not NAMED

**The data says full layout from the RenderView, not a subtree layout at the carousel.**
- Every rotator Layout has the Timeline `root` quad `[0,0,430,0,430,775,0,775]`, which is the RenderView's.
- The few subtree layouts in the same captures report their own root quad (e.g. 398×52 boxes).
- The cost depends on page state, not on the carousel: 19-31 ms at y 0, 11-18 ms mid-scroll, 30-43 ms at
  y≈2745.

**Vendor source:** WebKit main, `Source/WebCore/rendering/RenderObject.cpp`, `isLayoutBoundary` and
`markContainingBlocksForLayout`.
- A box stops the upward marking if it has non-visible overflow, a fixed width and height, and a new formatting
  context, or if it has layout + size containment.
- `.is-carousel` (104×32, overflow hidden, a flex container) appears to meet the first set. On main's rules an
  insert inside it should therefore schedule a **subtree** layout at the carousel.

The phone shows a full layout instead, so one of these candidates holds (none tested):
- **W1:** the phone's WebKit differs from main here. Either an older rule applies, or being a flex item inside
  the inline-flex `.start-selling-future-community-proof` disqualifies the carousel.
- **W2:** something marks above the carousel. Two candidates:
  - preferred-width invalidation (`invalidateContentLogicalWidths`, containing-block chain) from the removed and
    inserted renderers, through the shrink-to-fit ancestors (the proof is inline-flex `flex:none`; the pill is
    auto-width);
  - the `avatars-exit` width/flex-basis steps.
- **W3:** a subtree root is converted to a full layout because a layout was already pending
  (`scheduleSubtreeLayout`). This is weakened: the record shows no competing InvalidateLayout (7.1). A style-only
  dirtying would not show there, though.

The section's only containment is lifted while the rotator runs.
- `[data-start-selling-render="deferred"]` (`content-visibility: auto`, CSS L11759) applies only while `dE` is
  inactive.
- The rotator only runs while `dE` is active (`sE`, L2689-2694).

**Evidence on W1 (P-033 step 0, fix-scroll-engine `layout-containment/idle6-8.cjs`, OBSERVED):**
- At rest, within 0-60 ms of a rotator tick, 23/26 and 22/27 small Layouts (~0.1 ms) have a 104×32 root quad.
  That is exactly `.is-carousel`'s CSS box (width 104px, height 32px).
- 14-15 of them sit in Composite after the paints, with no RecalculateStyles before them. That fits an image
  load changing intrinsic size inside the carousel.
- So the phone's WebKit appears to treat the carousel as a layout boundary for that dirtying. If so, W1 is
  weakened and W2 or W3 (something in the tick itself marks above the carousel) gains.
- The element identity rests on size only. The decisive check: the element at the quad's position in phone
  geometry. The cause of the load-time Layout is UNRESOLVED.
- **Identity check done (fix-scroll-engine `who.mjs`, Chrome DOM read, layout-containment README 0fd8fe2).**
  - `.is-carousel` is the only 104×32 element. It sits at doc (58.3, 2023.9), which matches the phone quad once
    the toolbar offset is allowed for.
  - So the phone's WebKit already uses the carousel as a layout root. **W1 is out.** The tick's whole-view
    Layout comes from W2 or W3: the tick's renderer insert/remove, the exit width steps, or a pending full layout.
  - Correction to the step-0 note: the 398×52 subtree root is the fixed `.start-selling-top-nav` at (16, 16), not
    a countdown strip.

**Verdict (§2.3 form):**
- **Dirtier: LOCATED.** Code, cadence and Timeline agree in 3/3 captures and 47/47 layouts ≥10 ms. NAMED needs
  the ablation in 7.4.
- **Whole-view mechanism: UNEXPLAINED** between W1, W2 and W3.
- **Device class:** iPhone 15 Pro Max Safari (the tc/ta captures). Chrome is not evidence for WebKit's layout
  root.

### 7.4 Cheapest naming probe: ticket ST-4 (via mgmt-ops-4)

Setup:
- one phone Timeline attribution run per arm (Page.disable → Page.enable → Timeline.start, F-047);
- top → y 2500 as in `e-tc*`, on aw1-10e;
- counts only, no timing block;
- readout: the same script as 7.1 (`dirtier.mjs`/`dxp.mjs`) plus the root quad.

| arm | change (overlay) | prediction if 7.2 is right | what it splits |
|---|---|---|---|
| C | aw1-10e | 14-17 rotator layouts ≥10 ms, root = view | (control) |
| A1 (positive ablation) | rotator loop off (`if (!e.matches)` → `if (false)`) | 0 layouts dirtied by L11571; idle at y 0 loses its 19-31 ms layouts | names the dirtier |
| A2 (boundary) | `.start-selling-avatars.is-carousel { contain: strict }`, CSS only; the box is already 104×32 and clipped, so expect 0 % pixel diff | root = the carousel quad, Layout <1 ms | A2 drops: W1 or W2 (a forced boundary works). Root stays view: W3 |
| A3 (mechanism) | keep the 5 imgs mounted; rotate by `src` and transform/opacity only; no width/flex-basis keyframes; ends not at 1/none | rotator layouts <1 ms | separates the DOM swap from the width animation |

- If A2 holds, it is also the fix candidate: one CSS line, no visual change. A3 is the design-engineering
  version: it keeps presence (F-049).
- Prediction to check before spending a block: the idle-at-y-0 `>34` frames (7-10 per 6 s in the hero block,
  iphone-wave2 §3a) should drop by about the rotator's share. The rotator causes 2 writes per second, so about
  12 whole-view layouts per 6 s of idle.

### 7.5 Consequences

- **h3 (countdown strip):** its Layout term is **zero**. Keep h3 priced by face repaint and layers only
  (F-050). P-017 (fix-nav-morph's countdown probe) should not predict a Layout drop.
  - **Scope (F-081, P-033 step 0, OBSERVED):** "zero" holds for Layouts ≥10 ms. At rest on the #people card,
    ~800 small Layouts per 20 s (<5 ms, ~165 ms in total) are style-dirtied. fix-scroll-engine binned them by
    frame co-occurrence: countdown-spring frames 314-333, accent `stroke-dashoffset` window 434-445, 0-240 ms
    after a rotator tick (`avatars-exit`) 23-24, other 9. Co-occurrence names no dirtier. §7.1 found no
    InvalidateLayout under the spring rAF. The spring writes transforms on `will-change` faces, which is not a
    Layout change by the §2.8 rule. So which style change dirties the spring-frame Layouts is UNRESOLVED. The
    decisive check: the RecalculateStyles before each such Layout, in spring frames outside the accent windows.
  - **Decisive check done (fix-scroll-engine, `layout-containment/idle4.cjs`, `idle5.cjs`):** the spring as
    dirtier is REFUTED by the check.
    - Outside the accent windows, spring frames hold a small Layout in 27/210 and 27/216 (~13 %); non-spring
      frames in 26/112 and 27/117 (~23 %).
    - The spring's rAF subtrees hold only ScheduleStyleRecalculation, no InvalidateLayout.
    - Most of the F-081 "spring" row sits inside the accent windows, which cover ~12.4 of the 20 s.
  - **What is left, all OBSERVED (time association only):**
    - The accent `stroke-dashoffset` draw drives most small Layouts. Why WebKit marks layout for an SVG stroke
      change is UNRESOLVED; it needs a WebKit reference.
    - Outside the accent windows, 26/65 and 27/67 small Layouts fall 0-60 ms after a rotator tick, against
      ~8-10 % if uniform. That makes the rotator the leading candidate.
- **Idle and rest-to-motion:** the rotator is the main source of whole-view layout at y 0.
  - It keeps running in the hero, because the hero is within one viewport of its element.
  - Any "idle quiet" assumption (I-002's 6 s idle; the rest-to-motion note in §6) includes 2 whole-view layouts
    per second from it.
- **ST-2 / Card 4:** the rotator can coincide with the +745 / +945 reveal ends. Before scoring, exclude
  windows where a rotator InvalidateLayout lands within 16 ms of the frame.
- **arch-lead's +1645 check (filter end):** it cannot be run on the existing phone data.
  - Every phone build (aw1-10c, aw1-10e, h1, h1v2, P, P3 and the hero-exit variants) carries the aw1-10e rule
    `filter 0.9s linear(...)` (aw1-10e overlay CSS L2427). So the filter ends together with transform at +945.
  - In the window +1550..1750 after the flip, the max dt is 17-18 ms in 27/27 hero runs (`win3.mjs`). With no
    event there and no frame, this is a null control, not evidence either way.
  - A test needs the baseline (A, `filter 1.6s`) in a hero block.

### 7.6 Claim status (CLAUDE.md "Platform claims")

WebKit source was read on 2026-10-01 from `github.com/WebKit/WebKit` at `main`. It is pinned to commit
**`a1fb7ce122d0cd99f7d6cc82775f02565e266ece`**, the head of `main` per `commits/main.atom` (updated
2026-10-01T11:28:47Z). All three files cited below were re-fetched at that commit, and they are byte-identical to
the copies the line numbers were taken from. The phone's Safari build may differ from this commit.

| claim in §7 | status | reference / decisive check |
|---|---|---|
| A Timeline `Layout` record's `root` is the layout root's absolute quad, and the root is the subtree root or else the RenderView. So root = viewport quad means a full layout from the RenderView. | **CONFIRMED** (on `main`) | `Source/WebCore/page/LocalFrameViewLayoutContext.cpp` L257 (`layoutRoot = subtreeLayoutRoot() ? subtreeLayoutRoot() : renderView()`), L301 (`layoutRoot->absoluteQuads(layoutAreas)`), L335; `inspector/agents/page/PageTimelineAgent.cpp` L226-238 (`appendLayoutRoot(layoutAreas[0])`) |
| On the phone, the rotator's layouts are full layouts | OBSERVED (in our setup; follows from the row above if the phone build matches `main`) | ST-4 A2: the root quad changes or it doesn't |
| Layout-boundary criteria (non-visible overflow + fixed width/height + new formatting context, or layout + size containment) | **CONFIRMED** (on `main`) | `Source/WebCore/rendering/RenderObject.cpp` `isLayoutBoundary` L519-556, `markContainingBlocksForLayout` L596-660 |
| `.is-carousel` meets those criteria on the phone | UNRESOLVED | decisive check: ST-4 A2 (`contain: strict` makes it a boundary on any version that has the containment rule) |
| W3 path: a full layout already pending absorbs a subtree root | CONFIRMED that the path exists; UNRESOLVED whether it fires here | `LocalFrameViewLayoutContext.cpp` `scheduleSubtreeLayout` L778-781: if the RenderView needs layout and there is no subtree root, it marks up to the RenderView |
| The countdown dirties no layout | OBSERVED (Timeline records, 3/3 captures) | ST-4 control vs rotoff idle counts |
| `avatars-exit` width/flex-basis steps need layout every frame (not composited) | OBSERVED / unchecked | the reference to check is WebKit's accelerated-property list for CSS animations; A3 dropped for now |

The Chrome ST-4 build check (fix-scroll-engine, 12:24Z) is valid as a build check: childList 75/75 vs 0/0;
`contain: strict` is applied. Its Layout roots are Chrome's: all three arms report document-rooted layouts,
`st4-strict` included. That is **not** evidence for WebKit's root and does not change A2's prediction.

### 7.7 Pre-registered decision table for the merged block P14 (before data)

**Superseded for V1 (re-registered at 15:3xZ, layout-containment README 0fd8fe2, second reader mgmt-ops-5).** W1
is out (§7.3, identity check), so the table's carousel row no longer applies.
- V1 is now **st4-noswap**: no img insert or remove at either tick; `src` is updated in place.
- V1 now tests the W2 insert/remove path directly.
- The other rows keep this logic.
- Image-load Layouts rooted at the carousel are excluded from every column.
- fix-scroll-engine and de-pm-hero read the result together.

**Block.** C aw1-10e, V1 st4-strict (`contain: strict` on `.is-carousel`), V2 re-contain (`contain: layout size`
around #people). One uncounted st4-rotoff attribution run follows. The source is the same pin `a1fb7ce`.

**Source facts (CONFIRMED on that commit):**
- **Only ancestors are boundary-checked.** `markContainingBlocksForLayout` starts at `container()` and tests
  `isLayoutBoundary` only on ancestors (`RenderObject.cpp` L596-650). A renderer that marks *itself* dirty is
  never its own boundary.
- **The carousel can mark itself.** `RenderElement::setChildNeedsLayout` marks from the element's own container
  upward (`RenderElement.h` L489-497). `RenderTreeBuilder` calls it on the parent at insert when the parent is
  not already child-dirty (`RenderTreeBuilder.cpp` L524-555).
  - So a path where the carousel marks *itself* skips the carousel's own boundary and reaches the next boundary
    above.
  - Whether that path fires here is UNRESOLVED. It needs the new child to be self-dirty already at attach.
    `initializeStyle` (`NewStyle`) does not set that (`RenderElement.cpp` L583-589, L1396-1399), and no trigger
    has been found.
- **On these rules the carousel is already a boundary in C**, as arch-claims also reads it: non-visible
  overflow, fixed 104×32, a flex container (new formatting context).
- Therefore, if the phone matches `main`, V1 changes nothing for marking that comes up from the imgs.

**Decision table:**

| C root | V1 root | V2 root | reading |
|---|---|---|---|
| view | **carousel** | (any) | The phone's rules differ from `main` (**W1**): in C the carousel was not a boundary on the phone; forced containment makes it one |
| view | view | **#people** | The marking enters at or above the carousel but below #people: the carousel marks itself (path above), or preferred-width/flex marking through the proof and pill (**W2**). The fix is a boundary above the carousel, not on it |
| view | view | view | **W3** (a pending full layout absorbs the subtree root, `scheduleSubtreeLayout` L778-781) or a dirtier outside #people. Read rotoff and the co-occurring InvalidateLayout records |
| carousel / small | (any) | (any) | The C baseline moved (phone build or snapshot changed). Stop and re-check the build |

- **Cost prediction:** wherever the root moves off the view, the rotator's Layout drops below 1 ms (carousel)
  or to at most half of C's median (#people).
- **Idle at y 0:** dt>34 (and dt>50) drop in proportion to the rotator's share (2 writes/s). Phone frame
  columns follow CLAUDE.md: ms only, with ±4 ms counts.

The A2 prediction in 7.4 assumed C's carousel is *not* a boundary on the phone. This table replaces it: on
`main`'s rules V1 should change nothing unless W1 holds.

### 7.8 The user's finger run F3: "small user profile blinking" follows the rotator's cycle (OBSERVED, rAF timing only)

**The run.**
- F3 page 1 is a blind finger run on build aw1-10e (:5476), 12:54Z, recorded with `iphone.mjs record`. It is
  rAF-only, with no Timeline attached.
- The user's words: "i saw small user profile are blinking. and animation of hero section and end of the page
  are laggy the same." The lead's gloss: the #people avatar carousel.
- Data: iphone-runner `out/iphone-runner/finger/F3-p1.json`. Scripts: scratchpad `de-pm-hero/f3.mjs`,
  `f3b.mjs`.

**Idle before the first touch.** The page sat still at y 1500 for 41.5 s (2404 frames):

| dt>34 | dt>50 | >30 | >38 | >46 | >54 |
|---|---|---|---|---|---|
| 76 | 15 | 83 | 57 | 21 | 8 |

dt>50 is threshold-sensitive (21 / 15 / 8 across ±4 ms).

- **Pattern:** the long frames come in pairs about 225-240 ms apart, and the pairs repeat every **1050 ms**
  (median of 40 cycles, range 876-1067). That is about 1.9 long frames per cycle.
- **This matches the rotator** (§7.2): about 800 ms dwell plus the 220 ms exit phase, timer at
  `2.DyWL8TcE.js:11571`. A plausible split is one frame at the swap (`{#if}` flip plus insert) and one at the
  exit end (removal). That split is OBSERVED in our setup; the cause is not yet attributed for this run.
- **Headline counts.** The record's headline `gt34` 118 / `gt50` 24 includes these idle frames. The scroll
  figures are the "while scrollY changes" counts: 737 frames, dt>34 34, dt>50 9, max 353 ms at the first touch
  (y 1522).
- **During the scroll,** the long frames cluster at y 1500-2000, while the carousel is still on screen. From
  2000 to 4580 they are sparse.

**What "blinking" is: UNRESOLVED.** rAF timing cannot separate two readings:
- **(a) Perceived design motion.** The designed exit/pop animation (`avatars-exit`, `avatars-pop`, CSS
  L2888/L2905) reads as blinking at this cadence.
- **(b) A real blank frame.** The swap inserts new `img` renderers (§7.2 templates); if one paints before its
  image is decoded, a slot shows empty for one or more frames.

**Decisive checks:**
1. **Frame grabs.** WDA `/screenshot` at 14-17/s over the carousel at y 1500 on aw1-10e, about 2 min (queued with
   iphone-runner after the finger batch). An empty avatar slot in any frame means (b); a continuous exit/pop
   means (a). The `ioscap` screen recording would be better, but it waits on the terminal's Camera permission.
2. **Timeline run.** P14's uncounted st4-rotoff slot is now a Timeline attribution run, reading Paint and
   Decode records next to the rotator's Layouts. With the rotator off, the 1050 ms pairs, and with them the
   blinking, should disappear.

**For P14.**
- **C's baseline:** the Timeline-off control sentinels idle 6 s at y 0. That gives about 5-6 cycles per
  run. Read pairs per 1.05 s cycle there.
- **Between arms:** compare pairs per cycle in the idle phase of the Timeline-on counted runs. Mark that column
  Timeline-on, since the Timeline may inflate dt.
- **A Timeline-off comparison between arms** (one uncounted run per arm, idle at y 1500, +about 5 min) is an
  add-on requested from mgmt-ops-5.
- **Prediction:** about 2 dt>34 frames per cycle on C. Any arm that moves the layout root off the view drops
  toward under 1 per cycle.

mgmt-ops-5 accepted the add-on on P-025: one uncounted Timeline-off run per arm idling at y 1500, plus Paint and
Decode records in every arm.

### 7.9 ST-2 result: the P3 block, Card 4 NAMED (lead signed D; n=2 per arm)

**Block.** P3 (P-019 / P-020), 13:35-13:44Z, aw1-10e family, both sentinels passed. Arms:
- Q (Q1, Q4);
- `re-dur` (D2, D6);
- `re-keep` (K3, K5);
- baseline-A (B7, B8);
- ST-2d fling-hold on Q (QF9-11).

**Data and scripts.** Data: iphone-runner `out/iphone-runner/p3-*.json` and `.tl.json`, Timeline depth 1,
F-047 sequence. Scripts (scratchpad `de-pm-hero/`):
- `p3x.mjs`: Layouts by phase and dirtier;
- `p3flip.mjs`: Layouts relative to the y-687 crossing frame, with every non-logger InvalidateLayout since the
  previous Layout.

fix-hero-exit's flip-relative read is its README "P3 phone block" (75d4f74).

**Offsets.** Offsets here are from the start of the crossing frame (y 687). Card 4's "+745 / +945" were measured
from the flip, so they read here as about **+700 / +900**. Compare shifts, not absolute offsets.

**Rotator exclusion (§7.5).**
- A Layout is excluded when its last non-logger InvalidateLayout is under Timer → L11571 (baseline-A: L11332).
- Per run, the rotator accounts for these Layouts >=10 ms in every arm, baseline-A included:

  | phase | rotator Layouts |
  |---|---|
  | idle | 10-11 |
  | scroll | 4-5 |
  | bottom | 4 |

- The rotator's phase relative to the crossing varies by run (+463 to +634 ms).
- A logger-paid or unattributed Layout 25-40 ms after a rotator Layout is its follow-on (OBSERVED, attributed
  by proximity).
  - This matters in the +500 window: QF9-11, K5 and Q4 each have one at +489 to +549.
  - D2 and D6 have none.

**Results by arm** (all OBSERVED):

| arm | +700 frame | +900 frame | +1150 frame |
|---|---|---|---|
| Q | present (12-15 ms, logger-paid, whole view) | present (14-18 ms) | present: 14-18 ms, page-paid, rAF L3258 |
| `re-dur` | **moved to +501 / +502** (12.1 ms, logger-paid; no rotator invalidation before it; rotator at +553 / +634, separate frames). Shift **-199 ms** vs predicted -200 ± 20: **HIT** | present (+901 / +902) | present (+1136 / +1152) |
| `re-keep` | present (+697 / +701) | **gone**: no Layout >=2 ms after +714: **HIT** | **gone too: UNEXPLAINED** |

**ST-2d fling-hold.**
- **Hold window:** the driver's hold mark starts at +1137 to +1438, so both reveal ends fall before it.
- **+696 to +705:** y 1084-1097, still decelerating (the scroll arrives at 1101 around +764). Not decisive.
- **+904 to +913:** 14.7-17.8 ms, logger-paid, at rest at y 1101-1102 about 140 ms after arrival, with no flick.
  That goes against U5(a), as the hero block's +940 frame already did (ST-2 above).
- **Inside the formal hold:** only the rotator pair (+1538-1554 and +1778-1792) plus its logger-paid follow-on.

**Decision (§4 ST-2 table).** `re-dur` moves the frame and ST-2d leaves it, so **Card 4 NAMED** for the +700 and
+900 frames, and U5 is out for them. The lead signed D on the strength of the causal shift.

**Conditions, from the lead's signature:**
1. **Mechanism: OBSERVED in our setup, cause unknown.** Why a finished opacity/filter/transform transition costs
   a whole-view Layout in WebKit is not established. arch-claims routes the reference check, and fix decisions
   must not depend on it. The NAMED status rests on the intervention, not on the mechanism.
2. **The +1150 result: UNEXPLAINED, then lifted.** The lead accepted fix-hero-exit's trace below as the code
   path, so +1150 joins the presence-flip family. The WebKit rule stays OBSERVED and sits under condition 1. The
   original text follows.
   - What we know: in Q and `re-dur`, the +1150 Layout's InvalidateLayout sits inside rAF L3258 itself. Card 4 had
     called this frame a separate class write (L11538 → L3258).
   - What it would mean: `re-keep` removing it means its end state also changes what L3258 finds dirty or writes.
   - Before re-keep-op's build card, fix-hero-exit traces what `re-keep` changes on the L3258 path.
   - **fix-hero-exit's proposed trace** (OBSERVED on the phone, K 2/2; the source mechanism is with arch-claims;
     not yet reviewed by the lead):
     - At +1150, `l()`'s rAF writes `is-future-shrinking` (JS L11552, `z(b, t > 0.04)`). On phones that rule sets
       the card's `transform: scale(var(--future-shrink-scale))`, which is `scale(1)` here.
     - In Q and `re-dur` the card's resting transform is `none`, so the write is a `none` → `scale(1)` presence
       flip.
     - L3258 does not dirty the layout. It is the commission scroll rAF whose forced read pays for the pending
       style change, which is why the InvalidateLayout sits inside it.
     - In `re-keep` the resting transform is `translateY(0)`. `translateY(0)` → `scale(1)` is no presence change,
       so there is nothing to pay.
     - fix-hero-exit notes that P-019 predicted this ("+940 and +1.13 s lose their ≥10 ms layout").
     - §4's ST-2 prediction did not include it, and Card 4's corrected model put this frame's class write at
       "L11538, not yet told apart". If the lead accepts the trace, both points are superseded: the class is
       `is-future-shrinking`, and the frame belongs to the same presence-flip family as +700 / +900.

**Also seen, not attributed.**
- A 12-13 ms Layout at +420-460 (y about 991-999, native or logger-paid) appears in every arm. It is outside the
  Card 4 frames.
- baseline-A's +1645 frame is still unresolved: from +1119, baseline-A runs a Layout every frame under L11303
  (fix-hero-exit).

**re-keep-op transparency-layer risk** (claims-audit §2.8 "Risk for re-keep-op", UNRESOLVED). Recorded
before the untimed at-rest check of re-keep-op vs re-keep (ticket via mgmt-ops-5).
- **Why the risk is live at rest here.** The avatar carousel (`.is-carousel`, template L11257) is *inside*
  `.start-selling-future-card`. So the rotator (§7.2, about 2 writes per 1.05 s) repaints part of the card while
  the page is idle.
- **What it costs if the card is not composited.** At opacity 0.999, each of those repaints goes through
  `beginTransparencyLayer` over the card (RenderLayerInlines.h l.70-75, RenderLayer.cpp l.2711-2737). That cost
  recurs every rotator cycle, not once per pass.
- **Readout per arm** (one untimed run each, page held at the card):
  1. LayerTree, read outside any timed block: does the card have its own layer, and is it composited?
  2. Idle Paint records whose clip intersects the card's rect, over about 10 s: count, total ms, median ms per
     Paint.
  3. Whether each such Paint follows a rotator Layout (Timer L11571) within 1 frame.
- **Decision:**
  - The card is composited in re-keep-op: the risk is void at rest (the opacity sits on the GraphicsLayer).
  - Not composited, and no idle Paint touches the card: void at rest. Re-check during scroll.
  - Not composited, with card-intersecting idle Paints: compare per-Paint ms against re-keep.
    - Fail if the extra transparency cost across one pass's idle and scroll repaints is larger than the single
      +700 Layout re-keep-op removes (12-15 ms per pass).
    - Fallbacks:
      - give the card its own compositing reason (`will-change: opacity`, which costs layer memory);
      - or keep opacity at 1 and accept the +700 frame;
      - or move the carousel's repaint off the card. A boundary does not help paint, so this means the
        carousel's own layer.
- **Result (P-033 step 0, 2026-10-01 14:47Z, 1 untimed run per arm, about 21 s at rest with the card at the
  viewport top; fix-hero-exit 57ba3ac, iphone-runner `s0-rk*`, `s0-rkop*`): the risk is VOID at rest. The
  first decision branch applies.**
  - LayerTree, read after Timeline.stop: in both arms the card has its own composited layer, reason
    `willChange`, 430x1328, 15.9 MB. So the 0.999 opacity sits on the GraphicsLayer, and the rotator's repaints
    do not go through a transparency layer.
  - Idle Paint over the card (fix-hero-exit's `s0score`): re-keep 4.89 ms per rotator cycle (1205 Paints),
    re-keep-op 4.77 (1203). The delta is −0.12 ms.
  - The scroll re-check in the second branch is not needed: the layer comes from `will-change`, not from motion.
    Caveat: the layer exists in both arms, so this needs no new layer memory. It also means the risk returns if
    a later fix drops that `will-change`.
- **Against §7.1/§7.4 (D3), same data (`s0rot.mjs`):** the rotator prediction HITS at rest on the card.
  - 41 rotator callbacks in about 21 s. 40/41 (rk) and 41/41 (rkop) hold an InvalidateLayout, and each is
    followed 1-5 ms later (one at +12 ms) by a whole-view Layout, root `[0,0,430,775]`.
  - That is 2 per cycle, as §7.4 predicted (about 38 per 20 s).
  - Sizes: 12.8-43.6 ms, median 25-26 ms. By write:
    - the `S = true` write (after the 800 ms dwell; mounts 5 imgs and `is-exit`): median 27.9 / 26.9 ms;
    - the `S = false` write (220 ms later; 4 imgs): median 23.3 / 22.6 ms.
  - That is a little above §7.1's idle-at-y-0 median of 24 ms (range 14-31).
  - The "n 23-28" in 57ba3ac is the count at ≥25 ms (25 / 22 here). At ≥10 ms it is 40 / 41.

**Next.** A build card for the end-state fix. Conditions 1 and 2 are lifted. The at-rest check above passed, so
re-keep-op's gain block can go ahead. Also a page-wide pitfall: every reveal
that ends at `opacity: 1` / `filter: none` / `transform: none` pays this frame on the phone.
