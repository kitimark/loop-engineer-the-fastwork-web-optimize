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
- `start.mjs`: the first 400 ms of scroll.

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
   - countdown ticks.

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
  layouts in two frames**, and the nav width transition plays no part.
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
- **Fix only after NAMED:** end states that keep presence. `blur(0px)` / `translateY(0)` remove the +940
  layout. For opacity, either align its duration with the 0.9 s pair (two long frames → one) or end at 0.999.
  The 0.999 end needs a render-server check: group opacity on a full-section layer may cost an offscreen pass
  every frame.

## 3. h3 and h4 in the corrected model

- **h3 (countdown strip).** The Timeline shows each 1.05 s tick, on each of the two countdowns, triggering a
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
  - Decision: if confirmed, Card 4 → NAMED and a build card for the end-state fix. Post the page-wide pitfall
    (every reveal ending at 1/none).
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
4. **h3:** name the countdown tick's layout dirtier offline from `e-tc*` before building the strip.
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
