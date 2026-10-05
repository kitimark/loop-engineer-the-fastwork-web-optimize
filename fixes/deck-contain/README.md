# Fix: deck-contain

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** P-143 rev 1.1 (signed with N1-N8, delta check PASS) ended NOT REPRODUCED under its own rules (see "Result"); the follow-up is card P-146 (`P146.md`). No build, nothing to land.
**Stage:** less-work cost card (protocol v2 §4 + rendering cost card); no build yet, no counted run.
**Device class / gate:** WebKit layout (Simulator Timeline mechanism ratio) + Chrome counts + pixels T0; landing under the
less-work rule (memory `less-work-landing-rule`); phone G attribution run through the lead once the iPhone is reconnected.
**Driver(s) behind the claims:** Simulator scripted swipe (scrollTo per rAF, T-194's driver), Chrome scripted swipe; phone G later.
**Prediction:** `fixes/PREDICTIONS.md` P-143 (reserved 2ee939f8 by mgmt-clerk-1).
**Base:** v9.1d = int-v8's base patch `ce2d32a1bbbb` (f857ea8d `fixes/v9-1d/patch.diff`, the same bytes as
`fixes/hero-park/base-v9-1d.diff` at db8dc091), served JS `941aa13e5bdf`, CSS `f1997edf5309`. The card stays on v9.1d
because nothing in it depends on v9.2 (rev 1.1 N2). P-142 is signed (main 21d56125, rev 1.2 pins 2cf32d44): v9.2 = v9.1d +
people-word + nav-fade (U2 out, CSS `1c4161f56545`); neither touches the deck. Moving to v9.2 would need an addendum with
new pins, before any data.
**Target:** best build v9.3.
**Files touched (planned):** `/_app/immutable/assets/2.gBuqKVzi.css`: the winning arm's rule appended; no JS change.

## Why it lags (T-194; fix-hero-exit-threaded, db8dc091 on fix/settle-cache; all OBSERVED, Simulator)

- Source: `fixes/morph-scroll/README.md` "T-194 profile-deck layout" (`git show db8dc091:fixes/morph-scroll/README.md`,
  l.574-620).
- During a scripted swipe at 430x775 the profile deck (`.start-selling-profile-deck`) is laid out again on every frame:
  about 41 ms of Layout per frame, the same in v9 and v9.1d. Freezing the deck (`content-visibility: hidden`) brings that
  to 0.6 ms.
- Nothing writes into the deck per frame (4 DOM mutations in 250 steps).
- Ablating each outside writer changed nothing: countdown strips, image `src` swaps, script accent, avatar carousel.
  `contain: layout` changed nothing either. `content-visibility: auto` helps only while the deck is off screen.
- `contain: strict; height: 844px` on the deck took Layout from 41 ms to 0.4-0.5 ms per frame on screen. T-194's reading:
  each frame's layout re-measures the deck's size, and the deck is expensive to measure.
- UNRESOLVED (T-194): whether a real finger scroll on the iPhone dirties layout every frame too. The G run named below
  answers it.

### The deck on phones (v9.1d CSS, overlay copy, 1-based lines)

- The mobile branch is `@media (width<=860px), (device-width<=500px), (hover: none) and (pointer: coarse) and
  (width<=1200px)` (l.3694).
- `.start-selling-profile-chrome` is a column flexbox with `align-items: stretch` (l.3704-3711).
- The deck (l.3760-3777) is a flex item of that column with `flex: none` and `box-sizing: border-box`.
  - Width: `calc(100% + bleed*2)`, with `padding-inline: bleed` and a negative `margin-inline`. The bleed is 40 px, or
    36 px at width <= 640 (l.3900).
  - It is `display: flex; align-items: center; overflow: auto hidden` with horizontal scroll snap.
  - Its height is `auto`, so its flex base size comes from its content.
- Each shell (l.3778-3806) has `flex: 0 0 100%; width: 100%; aspect-ratio: 353/764; height: auto; min-height: 0; overflow:
  hidden`.
  - A shell's height is therefore the deck's content width x 764/353, whatever its content.
  - The deck's height equals the shell height.
  - So the page already knows the deck's height without measuring any content.
- Desktop (`width >= 861` outside the touch branch) has its own rules and is untouched by every arm.

## Design: the deck's height without content and without a hard-coded length

### First try, A: `aspect-ratio` on a content-box deck. Exact in Chrome, wrong in WebKit (design probe, before the card)

`arms/a-size-layout.css` sets `box-sizing: content-box; width: 100%; aspect-ratio: 353/764; contain: size layout`.

Chrome (`probe-chrome.mjs`, 15:15Z):
- The height is exact at all 17 configs. 430 wide gives 462 x 844.078, equal to 390 x 764/353 to LayoutUnit rounding.

Simulator (`probe-sim.mjs`, fw-sim 430x775, 15:4xZ):
- The deck becomes **688.234** tall instead of 844.078, which is (390 - 72) x 764/353, as if the padding were taken off the
  content width a second time.
- The page shrinks by 156 px. The same happens with:
  - `aspect-ratio` alone (no containment, arm R);
  - `contain: strict` (B);
  - `width: auto` with stretch (A2).
- So 688 appears with and without containment (OBSERVED in our setup, cause unknown; no WebKit bug cited). Posted as
  F-291. (Wording per rev 1.1 N7.)
- The spec says the ratio applies to the box named by `box-sizing` (CSS Box Sizing 4 §4.1 `aspect-ratio`; MDN "Size
  calculations involving preferred aspect ratio work with the dimensions of the box specified by box-sizing"), CONFIRMED.
  WebKit's result disagrees with that in our setup.
- A, B, R and A2 are dropped. They stay in `arms/` only as the evidence of this step.

### The card's arms (all inside the same media query, same block)

| arm | file (sha256/12) | rule | role |
|---|---|---|---|
| **A3** | `arms/a3-pad.css` | deck: `height: 0; padding-block: 0 calc(100% * 764 / 353); align-items: flex-start; contain: size layout` | the candidate: a percentage padding resolves against the containing block's width (the profile chrome's content box = the shells' width), so the deck's height is 764/353 of it with no content measured and no length; the content box is 0 tall and the shells start at its top, keeping their own ratio height |
| **A4** | `arms/a4-cq.css` | chrome: `container-type: inline-size`; deck: `height: calc(100cqi * 764 / 353); contain: size layout` | the alternate: the same height from a container query unit; also puts layout, style and inline-size containment on the chrome |
| **R3** | `arms/r3-pad-only.css` | A3 without `contain` | mechanism sibling: is the content-free definite height enough without containment? |
| **PC** | `arms/pc-strict844.css` (`a8b99f85dc7a`, = `db8dc091:fixes/morph-scroll/t194/abl-strict-deck.css` byte for byte) | `contain: strict !important; height: 844px !important` | positive control (T-194's probe) |

References:
- CSS Containment 2 §3.1, CONFIRMED: "The intrinsic sizes of the size containment box are determined as if the element had
  no content". Explicit sizes still apply ("All CSS properties of the size containment box are taken into account").
- CSS Containment 2 §3.2, CONFIRMED: layout containment gives an independent formatting context, an absolute- and
  fixed-positioning containing block and a stacking context.
- Percentage padding resolves against the containing block's inline size: CSS Box Model 3 `padding` (§ padding
  properties, "percentages: refer to logical width of containing block"), CONFIRMED.
- `cqi` is 1 % of the query container's inline size: CSS Containment 3 § container-relative lengths. `container-type:
  inline-size` applies layout, style and inline-size containment to the container. CONFIRMED, spec.
- WebKit treats a box with layout and size containment as a layout boundary, CONFIRMED (WebKit
  `Source/WebCore/rendering/RenderObject.cpp` at main `3e5ba1ef9b3e`):
  - `isLayoutBoundary()` returns true on `shouldApplyLayoutContainment() && shouldApplySizeContainment()` (l.519-533);
  - `markContainingBlocksForLayout` stops its dirty walk there (l.596-648);
  - `contain: layout` alone is no boundary, which fits T-194's null.
- R3 may also pass `isLayoutBoundary` in WebKit: overflow is not visible, the height is fixed (`0`, not auto) and the box
  makes a new formatting context (l.539-556). R3 is in the card for exactly that question.
- Which path makes WebKit lay the deck subtree out again every frame is UNRESOLVED. It is either a dirty bit from inside
  the deck, or the column flexbox measuring the flex base size: `FlexIntegrationUtils.cpp`
  `computeBlockAxisContentSizeForFlexItem` lays an item out again when it needs layout. Source: helper
  map-deck-contain-webkit's reading; which WebKit build the iOS 26.5 Simulator runs is not mapped. The arms decide it for
  this page.
- Chromium never makes a flex item a relayout boundary (`layout_object.cc` `ObjectIsRelayoutBoundary`, `if
  (box->IsFlexItem()) return false`, chromium main `2e22ca200ff2`, l.~1519). CONFIRMED by source reading. Chrome is
  therefore predicted unchanged: a no-worse check only.

### Step 2: the deck's height (design input, measured before this card; geometry only, no counts)

Chrome (headless `probe-chrome.mjs`, shared probe slots 15:15Z and 16:0xZ; `out/deck-contain/geo-chrome{,2}.json`):
- Each arm was put in the same page after the base read.
- "Mobile" is Chrome mobile emulation with touch, DPR 3.
- "Diffs" lists numbers other than the shells' `offsetLeft` and sub-pixel scroll rounding.

| config | branch | deck w x h (base) | parent w | W x 764/353 | A3 | A4 | R3 | other diffs |
|---|---|---|---|---|---|---|---|---|
| 430x775 | mobile | 462 x 844.078 | 390 | 844.079 | 844.078 | 844.078 | 844.078 | none |
| 430x815 | mobile | 462 x 844.078 | 390 | 844.079 | 844.078 | 844.078 | 844.078 | none |
| 430x932 | mobile | 462 x 844.078 | 390 | 844.079 | 844.078 | 844.078 | 844.078 | none |
| 390x844 | mobile | 422 x 757.500 | 350 | 757.507 | 757.500 | 757.500 | 757.500 | none |
| 375x667 | mobile | 407 x 725.031 | 335 | 725.042 | 725.031 | 725.031 | 725.031 | none |
| 360x780 | mobile | 392 x 692.563 | 320 | 692.578 | 692.563 | 692.563 | 692.563 | none |
| 640x900 | mobile (bleed 36) | 672 x 1298.578 | 600 | 1298.584 | 1298.578 | 1298.578 | 1298.578 | none |
| 641x900 | mobile (bleed 40) | 681 x 1300.734 | 601 | 1300.748 | 1300.734 | 1300.734 | 1300.734 | none |
| 768x1024 touch | mobile | 808 x 1575.609 | 728 | 1575.615 | 1575.609 | 1575.609 | 1575.609 | none |
| 1024x1366 touch | mobile | 992 x 1973.844 | 912 | 1973.847 | 1973.844 | 1973.844 | 1973.844 | none |
| 1200x900 touch | mobile | 1168 x 2354.750 | 1088 | 2354.765 | 2354.750 | 2354.750 | 2354.750 | none |
| 1201x900 touch | desktop | 793 x 820 | - | - | 820 (rule not applied) | 820 | 820 | none |
| 860x900 | mobile (width) | 885 x 1742.266 | 805 | 1742.266 | 1742.266 | 1742.266 | 1742.266 | none |
| 861x900 | desktop | 438 x 820 | - | - | 820 (not applied) | 820 | 820 | none |
| 1440x900 | desktop | 1017 x 820 | - | - | 820 (not applied) | 820 | 820 | none |
| 430x775 reduced motion | mobile | 462 x 844.078 | 390 | 844.079 | 844.078 | 844.078 | 844.078 | none |
| 1440x900 reduced motion | desktop | 1017 x 820 | - | - | 820 (not applied) | 820 | 820 | none |

- Resize on one page (430x775 -> 815 -> 932 -> 390x844 -> 375x667 -> 430x775): base and A3 are equal at every step. The
  height follows the width, and a viewport-height step (Chrome's model of the toolbar collapse) changes nothing.
- During a 20 px-step scroll sweep through the band, the deck's height is constant in base and A3 (e.g. 844.078 at 430).
- docH, the section box and the next section's top are unchanged in every config. The only y diffs, 0.36-0.52 px, also
  appear between two base reads: sub-pixel scroll rounding.
- Simulator (fw-sim, Safari, `probe-sim.mjs`, 15:5xZ, `out/deck-contain/geo-sim2.json`):
  - Portrait, toolbar expanded, 430x775: base 462 x 844.078. A3 844.078 and A4 844.078: exact. A, B, R and A2 gave 688.234.
  - Second pass (16:3xZ, `geo-sim3.json`; collapse by the count-only `collapse-v1.json` gesture, 1 toolbar transition;
    rotation by `sim.mjs orient`). A3, A4 and R3 are exact in every state; the only diffs are the shells' `offsetLeft`
    (A3, A4: +36, or +40 in landscape) and one 0.09 px y read for R3 (sub-pixel scroll):

    | state | viewport | base deck w x h | A3 | A4 | R3 | docH |
    |---|---|---|---|---|---|---|
    | portrait, toolbar expanded | 430x775 | 462 x 844.078 | 844.078 | 844.078 | 844.078 | 6850 |
    | portrait, toolbar collapsed | 430x815 | 462 x 844.078 | 844.078 | 844.078 | 844.078 | 6850 |
    | landscape (touch branch, bleed 40) | 814x430 | 854 x 1675.172 | 1675.172 | 1675.172 | 1675.172 | 5797 |
    | portrait again | 430x775 | 462 x 844.078 | 844.078 | 844.078 | 844.078 | 6850 |

  - Tabs in the Simulator for A3 (second pass): identical after-click states to base and base again in all 6 cases.

### One DOM difference: the shells' offsetParent (A3 and A4, any arm with layout containment)

- With layout containment the deck becomes the shells' containing block (§3.2) and their `offsetParent`. Their `offsetLeft`
  grows by the bleed (0, 392, ... -> 36, 428, ...).
- The deck's scroll code reads that value:
  - JS v9.1d l.11700-11708 `he()`: a tab click scrolls the deck to `shell.offsetLeft - (deck.clientWidth -
    shell.offsetWidth) / 2`;
  - l.11750-11761 `be()`: the shell nearest the deck's centre becomes active.
- Behaviour check (`tabs.mjs`): six cases, each centring shell k and then clicking tab j (0->0, 2->2, 2->4, 5->5, 5->1,
  3->0). Read after each: the resting deck `scrollLeft`, the active shell and the active tab.
  - Simulator (portrait, 15:5xZ): identical for base, A3, A4, A2 and base again.
  - Chrome (430x775 and 430x932): identical for base, A, B, R and base again (15:27Z); for A3, A4, R3 the after-click states are identical to base and base again in all 6 cases at both sizes (16:2xZ,
    `out/deck-contain/tabs-chrome3.json`). A3 and A4 show offsetParent = deck (ol 36, 428, ...); R3 keeps the chrome
    (ol 0, 392, ...).
- Intermediate difference: when the tab of the already-centred shell is clicked, base computes a target 36 px off and calls
  `scrollTo` (the snap brings it back); A3 skips the call (|diff| < 8). OBSERVED, both engines; no resting state differs.

## Card P-143 rev 1: less-work cost card (registered before any counted data)

**Question.** On v9.1d in WebKit, does a deck whose height needs no content measurement and which is size + layout
contained (A3) remove the deck's per-frame Layout during a swipe, as the strict + 844 px probe (PC) does? Does it keep pixels
T0, and keep the deck's behaviour? Is containment needed (A3 vs R3)? Does the container-query form (A4) do the same?

**What this card can and cannot claim.**
- A Simulator Layout-ms ratio within one session is a mechanism ratio. It is never a gain and never a phone result (F-084).
- Chrome numbers are counts of the page around the deck.
- A smoothness claim would need phone data. Under the less-work rule this fix lands on the cost counts plus one short
  phone no-worse check.

### Instrument

- **Simulator driver** `sim-swipe.mjs`, adapted from T-194's `swipe-sim.mjs` (cited in its header). Per step:
  - fw-sim (the iPhone 15 Pro Max stand-in), Safari, 430x775 (scripted geometry, toolbar expanded);
  - open the base, settle 4 s, add the arm's CSS in a `<style>` after load;
  - read the deck's geometry and computed style (the arm-applied check, `APPLIED` in the driver);
  - start the WebKit Timeline (Page.disable -> Page.enable -> Timeline.start);
  - run the scripted swipe 0 -> 2600 at 10 px per rAF (`scrollTo`, so scroll events fire).
  - Recorded per RenderingFrame: the drawn y, outermost Layout records and ms, RecalculateStyles, InvalidateLayout, Paint.
- **Deck band:** frames whose drawn y has the deck in the viewport (`deck.top - innerHeight < y < deck.bottom`, from the
  run's own read). Expected n is about 160 frames per run at 430x775.
- **Metric L** (per run): the median Layout ms per frame over the band.
  - Ratio = arm L / mean L of the nearest valid C run before and after it in the same hold.
  - Calls: LOCATES <= 0.30, PARTIAL <= 0.70, NONE above (P-131/P-133's thresholds).
- **Chrome counts** `chrome-swipe.mjs`: headless, 430x932 DPR 3 mobile + touch, CPU 1x, a cold isolated load per step, the
  same swipe with a `console.timeStamp` per step.
  - Per frame over the band: Layout events, `beginData.dirtyObjects`, UpdateLayoutTree `elementCount`, Paint events.
  - Ratio = arm / mean of the hold's C runs. ms are printed and never judged.
- **Frozen scorer** `score-p143.mjs`, with self-test `selftest-p143.mjs` (`SELFTEST ok 32 checks`). The checks cover:
  - the band, the ratio neighbours, the replication gate, A/A, drift, CONTROL-FAILED, GEOMETRY, run states, call
    thresholds, the two-run arm rule and the Chrome ratios;
  - the pinned arm files and forms, and that A3, A4 and R3 contain no px length.

### Holds and order (nothing runs before the signature)

- **S1, then S2**: two normal exclusive chrome-measure holds in P-133's form: `--max-seconds 600`, a cold Simulator session
  each, FIFO, in the background, nobody moved. DEFERRED while a phone block is marked.
  - S1: `C:1 PC:1 A3:1 C:2 A4:1 R3:1 C:3`
  - S2: `C:4 A3:2 R3:2 C:5 PC:2 A4:2 C:6`
  ```sh
  node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-deck-contain --doing "P-143 Simulator hold S1" -- \
    node tools/sim.mjs session --owner fix-deck-contain -- node fixes/deck-contain/sim-swipe.mjs S1 C:1 PC:1 A3:1 C:2 A4:1 R3:1 C:3
  ```
- Driver gates:
  - Served bytes must be JS `941aa13e5bdf` / CSS `f1997edf5309`, else exit 26 (no data).
  - load1 > 200 before a step (HOST_MAX, P-141's ruling) exits 28: VOID-HOST.
    - The hold's folder is renamed `<hold>-void1`, kept, and never scored.
    - The hold is re-run once. A second VOID-HOST stops the card; it goes to the lead.
  - Budget stop `SB_BUDGET_S=500`: a step that would end past it is not started; it is logged as dropped and not scored.
  - Every step logs load1 at its start and end.
- **Chrome C1**: one shared slot (weight probe, <= 300 s): `chrome-swipe.mjs C1 <url> C:1 A3:1 A4:1 R3:1 PC:1 C:2 A3:2 C:3`.
  The base is served by `fix.mjs serve deck-contain--base -- --vendors=local --https`.
- **Pixels** (arms A3 and A4):
  - `px-chrome.mjs` in shared probe slots, split with `--only` to stay under 300 s;
  - `px-sim.mjs` in functional Simulator slots, split by `--states`.
- Order: S1, S2, Chrome C1, px-chrome, px-sim. A later step runs whatever an earlier one showed. Nothing is scored before
  S2 has run.

### Rules (frozen before data)

1. **NOT-REPRODUCED per hold.** The hold's arms are not read when any of these holds:
   - a C run is not OK (an error, the arm not applied, the swipe short of the deck's bottom, band n < 60);
   - fewer than 2 C runs;
   - an inner C's A/A ratio (C_k / mean of C_k-1 and C_k+1) outside [0.80, 1.25].
   If both holds are NOT-REPRODUCED, the card reads NOT REPRODUCED and no arm is judged.
2. **VOID per hold**: C drift (last C vs first C) > 30 %.
3. **CONTROL-FAILED per hold**: PC does not LOCATE in that hold, so its other arms are not read (any LOCATES is still
   reported).
4. **Arm call** over the readable holds:
   - LOCATES when every valid run locates, or the mean ratio is <= 0.30;
   - PARTIAL when the mean is <= 0.70;
   - NONE above that;
   - INSUFFICIENT with no valid run.
5. **GEOMETRY.** An A3, A4 or R3 run is not valid when its docH differs from a neighbouring C by > 2 px, or its deck height
   differs by > 0.5 px; the arm's call is GEOMETRY. PC's own 844 vs 844.08 is reported and never GEOMETRY for PC.
6. **Pixels T0.** A pair is one config or state x position x rest/swipe x arm.
   - Every running Web Animation is paused (finished ones are left alone).
   - Shots: base -> arm -> base again, with only the arm `<style>` toggled between them.
   - Mask: the hero clock's rect (`.hero-copy [role=timer]` + 4 CSS px), and nothing else.
   - T0 = 0 differing pixels between base and arm.
   - If base and base-again differ, the triple is shot once more. Still different = UNSTABLE, reported.
   - An arm passes pixels with 0 FAIL, UNSTABLE <= 10 % of its pairs, and no UNSTABLE at `inview`.
   - Any FAIL: no T0 claim. The look goes to a proposal with Try-it pages (memory `illusion-must-be-pixel-identical`), and
     nothing lands on it.
7. A Simulator ratio is never a gain and never a phone result. Chrome numbers are counts, never timing.
8. **Precedence** (as P-141 N5):
   - Rule 1 fails: P1 is a miss; P2-P6 and P13 are insufficient.
   - A CONTROL-FAILED, VOID or VOID-HOST hold drops its arm runs. An arm left with one run is called on it; with none it is
     insufficient.
   - PARTIAL is a miss for P3-P5.
   - GEOMETRY is a miss for P7 and for its arm's item.
   - P8 counts the scored holds only.

### Predictions (registered before data)

- Informed by T-194's numbers: PC 0.4-0.5 vs C 40-42 ms on screen; `contain: layout` null.
- P7 is informed by the step-2 geometry above. Disclosed: geometry was measured before the card, as a design check.
- R3's p reflects the WebKit source reading (a fixed height + overflow clip + new formatting context can be a boundary too).

| # | prediction | pass line | p |
|---|---|---|---|
| 1 | C replicates in both holds | rule 1 passes in S1 and S2 | 80 % |
| 2 | PC LOCATES in both holds | ratio <= 0.30 in S1 and S2 | 90 % |
| 3 | A3 LOCATES | rule 4 | 60 % |
| 4 | A4 LOCATES | rule 4 | 60 % |
| 5 | R3 NONE | rule 4 NONE | 50 % |
| 6 | A3's mean ratio within 0.10 of PC's mean ratio | abs difference <= 0.10 | 55 % |
| 7 | no A3, A4 or R3 run GEOMETRY | rule 5 | 95 % |
| 8 | every Simulator step applied its arm and none was dropped by the budget | driver logs | 80 % |
| 9 | Chrome no-worse: A3's band means of Layout events, dirtyObjects and elementCount each <= 1.10 x C | both A3 runs | 85 % |
| 10 | Chrome unchanged: A3's band dirtyObjects ratio within [0.90, 1.10] | both A3 runs | 55 % |
| 11 | pixels Chrome: A3 passes rule 6 at every listed config | px-chrome | 80 % |
| 12 | pixels Simulator: A3 passes rule 6 in expanded, collapsed and landscape | px-sim | 75 % |
| 13 | Simulator Layout records per band frame: A3 within +-15 % of its C neighbours (the cut is in the cost of each layout, not in their number) | mean of the A3 runs | 60 % |

### Decision (registered before data)

- **The build.** Pick the smallest arm that LOCATES, passes rule 6 and keeps tabs.mjs's resting states, in this order:
  R3, then A3, then A4.
  1. Append that arm's rule to the overlay CSS and fill the build card (served hashes, `fix.mjs check`, curl
     `x-mirror-source: overlay`).
  2. Run the phone G run below.
  3. Run the less-work no-worse phone check through the lead and int-v8 (v9.3).
- **A3 and A4 NONE or PARTIAL while PC LOCATES**: the content-free height plus containment is not enough in WebKit; PC's
  difference is paint and style containment or a fixed length. That needs a new card; nothing is built from this one.
- **PC CONTROL-FAILED in both holds**: T-194's mechanism does not reproduce on this base, and the card goes to the lead.
- **Any pixel FAIL for the winning arm**: a proposal with Try-it pages, and no landing.

### Phone G attribution run (the UNRESOLVED question; after the user reconnects the iPhone, through the lead)

- Name: **P-143-G1**.
- Driver G: `iphone.mjs gesture fixes/deck-contain/deck-g-v1.json --timeline <file>`, hash `fe961246a1e6`, dry run about
  9 s of strokes, GESTURE_BUDGET_S 150.
- Gesture: reload, 3 s idle, slow finger drags down until y >= 2300 (the finger on the glass, no momentum), then one fling
  back up (momentum through the band).
- Arms: base v9.1d and the winning build.
  - One uncounted warm-up per port, then C V V C.
  - Timeline on in every counted run, with the sentinel per protocol v2 §5.2.
  - Profile xcode-serious (memory `phone-checks-start-warm`).
  - Served from immutable snapshot copies, after a slot ticket to mgmt-ops.
- Reading: the reader is pinned in an addendum before the run. Per RenderingFrame in the deck band with the page moving:
  Layout records, InvalidateLayout records and Layout ms, plus the share of moving band frames that carry a Layout record.
- **Prediction 14 (registered now)**: on the base, >= 80 % of moving band frames during the drags carry a Layout record:
  p 60 %.
  - Below 20 % would mean a real touch scroll does not dirty layout per frame. The fix then removes the cost only where
    layout runs anyway (scroll-event handlers, toolbar steps, IO writes), and the less-work claim is limited to those
    frames.

### Rev 1.1 addendum: the read's notes N1-N8 and the lead's ruling (registered before any counted data)

Rev 1 was read by ops-reader-P143 at d87f7e0f: PASS WITH NOTES N1-N8. The lead signed it with N1-N8 as conditions.
Rev 1.1 changes no rev 1 prediction, rule, arm or hold. It adds:
- the N1 checks (P15, P16);
- the N3 dry run;
- the N4 guard;
- the precedence and arithmetic N5 asks for;
- the N6 pixel judge;
- the wording fixes N2 and N7, made in place above;
- the labels N8.

**N1, the offsetParent shift (lead ruling).**
- Under A3 and A4 the shells' offsetLeft is +36, so be() (l.11750-11761) moves the active-shell switch during a
  horizontal deck drag by about +36 px of deck scrollLeft.
  - Base switches at about k x 392 + 160; A3 and A4 at about k x 392 + 196, the true midpoint.
  - he()'s tab-click overshoot of 36 px (snapped back in base) is skipped.
- The lead rules these are motion differences the user can see. Under memory `illusion-must-be-pixel-identical` a
  motion-only difference is a proposal, not "accepted as disclosed".
- So S1 and S2 run as planned; they are mechanism attribution, and every arm stays measurable.
- **An arm may land without a proposal only if P15 and P16 below show it equal to base in Chrome and the Simulator.**
  - An arm that fails them goes to the user as a proposal with Try-it pages.
  - A compensating variant (e.g. correcting the bleed so offsetLeft reads as in base) is a new arm and needs its own
    addendum and read.
- This changes the Decision's build step: "smallest arm that LOCATES, passes rule 6 and keeps tabs.mjs's resting states"
  becomes "... passes rule 6, P15 and P16". The order R3, then A3, then A4 is unchanged.
- **P15, tabs** (`tabs.mjs`, unchanged; runners `n1-chrome.mjs` and `probe-sim.mjs --sweep`):
  - In one page: base, each arm, base again.
  - Six cases each: centre shell k, click tab j.
  - Pass per arm and engine: all 6 after-states (scrollLeft, active shell, active tab) equal base and base again.
- **P16, deck sweep** (`sweep.mjs`, new):
  - In the same page: scroll snap is switched off inline on the deck (the same for every arm).
  - The deck's scrollLeft is stepped from 0 across 2 shell pitches (784 px) in 8 px steps; after each step, two rAFs +
    200 ms (past be()'s 150 ms timer).
  - Read: the active shell and the active tab. Every switch is recorded (first scrollLeft at which it changed).
  - be() calls he(id, false), which returns before any deck scroll (l.11699), so nothing fights the sweep.
  - Pass per arm and engine: `sweepDiff` gives shellEqual and tabEqual (the same switches, each within 8 px of base),
    and base2 equals base.
- Where they run:
  - Chrome 430x775 and 430x932: `n1-chrome.mjs <out> <base url> --h 775|932 --arms A3,A4,R3`, one shared probe slot per
    height.
  - Simulator, toolbar expanded: `probe-sim.mjs <out> <base overlay> --arms A3,A4,R3 --tabs A3,A4,R3 --sweep --states
    none`, in a functional Simulator shared slot.
  - Both run on every arm that can win the decision, R3 included. They run after S2 and before pixels. They are
    functional, so they are never a measurement.
- Predictions (informed by tabs-chrome3 / geo-sim3, see N8):

| # | prediction | pass line | p |
|---|---|---|---|
| 15 | P15 passes for A3, A4 and R3 in Chrome (both heights) and the Simulator | all 6 after-states equal base and base2 | 90 % |
| 16a | P16 fails for A3 and A4 in both engines, with a shift of +36 +- 8 px at each shell switch | `shellShift` all in [28, 44] | 85 % |
| 16b | P16 passes for R3 in both engines | shellEqual and tabEqual | 90 % |

- Consequence registered now: if 16a holds, A3 and A4 can land only through a user proposal. A3 or A4 alone then lands
  no build from this card; R3, if it LOCATES and passes, is the build.

**N2.** Fixed in the Base line above. P-142 is signed; v9.2 = v9.1d + people-word + nav-fade, U2 out. The card stays on
v9.1d.

**N3, budget and C runs.**
- Rule 1 addition: a C run dropped by the budget stop, or in a VOID-HOST hold, is "not OK". A hold whose last C (C:3,
  C:6) is dropped is therefore NOT-REPRODUCED. The scorer already does this; it is now stated.
- To size the risk, the lead allows **one uncounted 2-step dry run before S1**:
  - hold name `DRY1`, steps `C:0 A3:0`, the same form as S1 (a normal exclusive hold);
  - only the step times (`stepS`) and load1 are read;
  - its folder is never passed to the scorer, and it is disclosed in the results.
  - If the 2 steps take more than 2 x 500/7 s (about 143 s), the holds are split before S1 and the split is sent to the
    lead as a delta: S1 into `C:1 PC:1 A3:1 C:2` + `C:2b A4:1 R3:1 C:3`, the same for S2. Otherwise S1 and S2 run
    unchanged.

**N4, run folders.**
- `sim-swipe.mjs` and `chrome-swipe.mjs` now refuse (exit 27, `HOLD-EXISTS`) when `out/deck-contain/{sim,chrome}/<hold>`
  already exists, so a run never appends to an old `runs.jsonl`.
- After a VOID-HOST the folder is renamed `<hold>-void1` before the one re-run (P-141 N2).

**N5, precedence gaps.**
- P6: insufficient when A3 or PC has no readable ratio; a miss when A3 is GEOMETRY.
- P13 arithmetic, from the score JSON (the scorer does not compute it):
  - per A3 run, `layPerF` / the mean `layPerF` of the same two ratio neighbours;
  - hit when the mean over the A3 runs is in [0.85, 1.15]; insufficient with no valid A3 run.
- P9 and P10: insufficient when the Chrome hold has fewer than 2 OK C runs, an A3 run is not OK, or the slot is killed
  at 300 s (exit 124). One re-run to a new folder (`C1b`) is allowed after a kill or a host stop; its result replaces
  C1, and both are reported.

**N6, pixels.**
- `px.mjs` `judge()` replaces the UNSTABLE state:
  - T0: base equals base again, and the arm equals base;
  - T1: base differs from base again, and every pixel where the arm differs from base lies inside that base-vs-base2
    diff;
  - FAIL: anything else.
- The triple is shot once more while T1, as before.
- A FAIL reports the memory's five numbers:
  - largest shade (`largestShade`);
  - share of the screen beyond A/A (`shareBeyondAA`);
  - area in CSS px (`areaCssPx`, from the bbox);
  - edge or fill: read from the saved shots (`px-chrome-fail/`, `px-sim/fail-*`);
  - static or moving: the pair's mode.
- Rule 6 now reads: an arm passes pixels with 0 FAIL; T1 pairs are counted and reported.
- Pixels run for A3, A4 and R3 (`FILES` in both runners).
- Self-test: 41 checks (rev 1 had 32), adding the sweep comparison and the judge.

**N7.** Wording fixed in place (the F-291 sentence; the padding-box clip, now CONFIRMED by CSS Overflow 3).

**N8, labels.**
- P1 and P2 are informed by T-194 (post-data for C and PC).
- P7 is informed by the step-2 geometry.
- P15 and P16 are informed by tabs-chrome3 / geo-sim3 and by the be() arithmetic.
- P14 stays outside this card's read: the G1 reader addendum gets its own pre-data read.

**Order after the delta check:** DRY1, S1, S2, Chrome C1, P15/P16 (Chrome, Simulator), px-chrome, px-sim. Nothing is
scored before S2.

### Pins (sha256/12; `out/` paths are gitignored)

| file (under `fixes/deck-contain/`) | sha256/12 | role |
|---|---|---|
| `arms/pc-strict844.css` | `a8b99f85dc7a` | PC, positive control (= T-194 abl-strict-deck.css) |
| `arms/a3-pad.css` | `02588998685b` | A3, candidate |
| `arms/a4-cq.css` | `cb41934fd049` | A4, alternate |
| `arms/r3-pad-only.css` | `7dc1abfe2824` | R3, no-containment sibling |
| `sim-swipe.mjs` | `1b8419a51438` | Simulator counted driver (S1, S2) |
| `chrome-swipe.mjs` | `2384f2dec39f` | Chrome counts driver (C1) |
| `score-p143.mjs` | `a562b312dabb` | frozen scorer |
| `selftest-p143.mjs` | `27d4729eac79` | scorer self-test (`SELFTEST ok 41 checks`) |
| `geo.mjs` | `4963586afcab` | geometry read, arm toggle, `evalAsync` |
| `tabs.mjs` | `37c19962b29e` | tab-click behaviour check |
| `px.mjs` | `3ed26f490e2b` | pixel diff, freeze, clock mask, positions |
| `px-chrome.mjs` | `0b0f1776d32b` | pixels T0, Chrome |
| `px-sim.mjs` | `a17b77dfd20c` | pixels T0, Simulator |
| `probe-chrome.mjs` | `0d2e2a174279` | step-2 geometry, Chrome |
| `probe-tabs-chrome.mjs` | `71d4ed91eaf7` | step-2 tabs, Chrome |
| `probe-sim.mjs` | `522cc40c1200` | step-2 geometry and tabs; rev 1.1 P15/P16 with `--sweep`, Simulator |
| `sweep.mjs` | `02fa46054aea` | rev 1.1 P16 deck sweep and `sweepDiff` |
| `n1-chrome.mjs` | `2bb8c4fa4478` | rev 1.1 P15/P16 runner, Chrome |
| `collapse-v1.json` | `1f4305ebed83` | Simulator toolbar collapse (count-only gesture) |
| `deck-g-v1.json` | `456ebec13061` | phone G1 gesture (gesture hash `fe961246a1e6`) |
| `arms/a-size-layout.css`, `a2-stretch.css`, `b-strict.css`, `r-ratio-only.css` | `e035f8334d28`, `c2775de88736`, `d4a3a79302a0`, `7591c48acc9f` | dropped design arms (step-2 evidence only) |

Served base pins: JS `941aa13e5bdf`, CSS `f1997edf5309` (`sim-swipe.mjs` `PINS`), base patch `ce2d32a1bbbb`.

## Result: P-143 reads NOT REPRODUCED (S1 and S2, frozen scorer; `results.json`)

- Holds:
  - S1 2026-10-05, 155 s, load1 35 -> 7;
  - S2 2026-10-06, load1 39 -> 8.
- Both holds: every arm applied, nothing dropped, no VOID-HOST.
- Both holds fail rule 1, because C runs are LOW-N (band n < MIN_N 60). So no arm is read.
- Precedence (rule 8): P1 is a miss; P2-P6 and P13 are insufficient. P7 and P8 are reported in `results.json` and nothing
  rests on them. Chrome C1, P15/P16 and pixels were not run, because the card ended at S2.

| hold | run | state | band n | L ms (median) | ratio (unread) |
|---|---|---|---|---|---|
| S1 | C:1 | LOW-N | 46 | 37.8 | |
| S1 | PC:1 | OK | 105 | 25.1 | 0.668 |
| S1 | A3:1 | OK | 162 | 0.43 | 0.011 |
| S1 | C:2 | LOW-N | 59 | 38.0 | |
| S1 | A4:1 | OK | 162 | 0.43 | 0.012 |
| S1 | R3:1 | OK | 162 | 0.44 | 0.012 |
| S1 | C:3 | OK | 61 | 37.6 | |
| S2 | C:4 | OK | 64 | 39.2 | |
| S2 | A3:2 | OK | 104 | 25.6 | 0.653 |
| S2 | R3:2 | OK | 107 | 25.4 | 0.648 |
| S2 | C:5 | LOW-N | 46 | 37.7 | |
| S2 | PC:2 | OK | 105 | 25.2 | 0.642 |
| S2 | A4:2 | OK | 162 | 0.43 | 0.011 |
| S2 | C:6 | LOW-N | 56 | 38.2 | |

The ratios are unread: OBSERVED only, never a result. They are listed for the next card's design.

**Signed** by the lead as NOT REPRODUCED, after the result read (ops-reader-P143r-P146).
- Tally: 2 hit (P7, P8), 1 miss (P1), 13 insufficient.
- The 13 insufficient: P2-P6 and P13 by precedence; P9-P12, P15 and P16 were not run, because the card does not require
  them after rule 1 fails. P14 is outside this read.

**Reader disclosures** (the card has no rule on either):
- S1's Simulator never settled before the steps: 59 s, background 67 % of a core, amsengagementd 58 %. DRY1 settled
  after 43 s and S2 after 52 s.
- The display was off at the start of all three holds (the lock's I-033 warning).

**Disclosed** (lead ruling: no rule change after data):
- DRY1, uncounted, never scored. Its STEP lines showed Layout ms per band frame: C 38.8, A3 26.7. Band n: C 66, A3 116.
  These were seen before S1.
- **Structural 1.** A C run draws only 90-110 RenderingFrames for the 260-step swipe; arm runs draw 145-260. The C band
  therefore holds 46-64 frames, so MIN_N 60 sits at the C runs' own edge: 4 of the 6 C runs were LOW-N.
- **Structural 2.** PC (strict + 844 px) read PARTIAL in both holds (0.64-0.67), not LOCATES as in T-194. Its deck is
  844 tall against the base's 844.078. OBSERVED in our setup, cause unknown.
- **Observation 3.** Layout ms per band frame falls on three levels: C about 38, a middle level about 25, a low level
  about 0.43.
  - Layout records per frame stay at 2.74-2.90 in every run.
  - The same arm landed on different levels in S1 and S2: A3 0.43 then 25.6; R3 0.44 then 25.4.
  - The low level comes with every rAF step drawn (259-260 frames); the middle level with 145-152 frames.
  - OBSERVED in our setup, cause unknown.
  - This is the main input for P-146: an arm's effect may be bimodal per run, so a single run per arm per hold cannot
    show it.
- **Observation 4.** The first step of every session (DRY1 C:0, S1 C:1, S2 C:4) read the deck top 48 px lower than every
  later step (1229.98 against 1181.98). This was not part of any rule. Effect on the band: the band uses each run's own
  read.

## Scenarios not run

- Real iPhone, any driver: the phone is disconnected (T-199). G1 and the no-worse check wait for the lead.
- iPad Simulators (touch branch up to 1200 wide): Chrome's touch emulation covers the 768-1200 geometry only.
- Finger (F) and perception tests: not planned for a less-work fix.

## Risks, conflicts, follow-ups

- **offsetParent**: see step 2. The resting behaviour is equal in both engines checked so far. Any later code that reads
  the shells' `offsetLeft` against another ancestor would see +bleed.
- **Layout containment** makes the deck a containing block for positioned and fixed descendants. The shells are already
  `position: relative` (l.3802), so no positioned descendant changes its containing block; the geometry diffs show none.
- **Stacking**: the deck already has `isolation: isolate`, so it is already a stacking context.
- **A3 specifics**:
  - The deck's content box is 0 tall and the shells overflow into its padding box. A scroll container clips its content at
    its padding box, CONFIRMED by spec (CSS Overflow 3, `overflow` values `hidden`/`auto`: the content "is clipped to
    its padding box"), so the visible clip is the same; pixels (rule 6) check it in both engines.
  - `align-items` changes from center to flex-start. With the content box at 0 that keeps the shells at the top, where
    `center` put them before (their height equalled the content height).
- **A4 specifics**: the chrome gets layout, style and inline-size containment. That makes it a containing block for the
  tabs and scopes counters; no counters are used in that subtree (not checked beyond the geometry).
- **Overlaps**:
  - morph-scroll (fix-hero-exit-threaded, parked; T-194 owner);
  - scroll-cb (`l()` l.12161 reads the card rects);
  - toolbar-resize: F-286 found that a `contain: size layout` boundary above a sticky renderer did not stop the
    toolbar-step relayout. That is a different trigger; informative only.
  - int-v8 (v9.2 / v9.3 builds).
- **Posted**: F-291 (WebKit aspect-ratio pitfall).
