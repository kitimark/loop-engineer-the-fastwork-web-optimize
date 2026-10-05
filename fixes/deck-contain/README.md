# Fix: deck-contain

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. Card P-143 rev 1 registered before any counted data; waiting for the Opus pre-data read and the lead's signature.
**Stage:** less-work cost card (protocol v2 §4 + rendering cost card); no build yet, no counted run.
**Device class / gate:** WebKit layout (Simulator Timeline mechanism ratio) + Chrome counts + pixels T0; landing under the
less-work rule (memory `less-work-landing-rule`); phone G attribution run through the lead once the iPhone is reconnected.
**Driver(s) behind the claims:** Simulator scripted swipe (scrollTo per rAF, T-194's driver), Chrome scripted swipe; phone G later.
**Prediction:** `fixes/PREDICTIONS.md` P-143 (reserved 2ee939f8 by mgmt-clerk-1).
**Base:** v9.1d = int-v8's base patch `ce2d32a1bbbb` (f857ea8d `fixes/v9-1d/patch.diff`, the same bytes as
`fixes/hero-park/base-v9-1d.diff` at db8dc091), served JS `941aa13e5bdf`, CSS `f1997edf5309`. P-142 (v9.2) was not signed
when this card was written, so the card is on v9.1d. v9.2 adds people-word a and nav-hit-cache U2, neither of which touches
the deck. Moving to v9.2 needs an addendum with new pins, before any data.
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
- So the cause is WebKit's ratio path for this padded flex item, not containment. OBSERVED in our setup, cause unknown; no
  WebKit bug cited. Posted as F-291.
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

### Pins (sha256/12; `out/` paths are gitignored)

| file (under `fixes/deck-contain/`) | sha256/12 | role |
|---|---|---|
| `arms/pc-strict844.css` | `a8b99f85dc7a` | PC, positive control (= T-194 abl-strict-deck.css) |
| `arms/a3-pad.css` | `02588998685b` | A3, candidate |
| `arms/a4-cq.css` | `cb41934fd049` | A4, alternate |
| `arms/r3-pad-only.css` | `7dc1abfe2824` | R3, no-containment sibling |
| `sim-swipe.mjs` | `917816a52212` | Simulator counted driver (S1, S2) |
| `chrome-swipe.mjs` | `e2907bd65033` | Chrome counts driver (C1) |
| `score-p143.mjs` | `a562b312dabb` | frozen scorer |
| `selftest-p143.mjs` | `aa6fbf90ba5d` | scorer self-test (`SELFTEST ok 32 checks`) |
| `geo.mjs` | `4963586afcab` | geometry read, arm toggle, `evalAsync` |
| `tabs.mjs` | `37c19962b29e` | tab-click behaviour check |
| `px.mjs` | `78069e46aae1` | pixel diff, freeze, clock mask, positions |
| `px-chrome.mjs` | `26a3d3814e93` | pixels T0, Chrome |
| `px-sim.mjs` | `4fd33a4c042c` | pixels T0, Simulator |
| `probe-chrome.mjs` | `0d2e2a174279` | step-2 geometry, Chrome |
| `probe-tabs-chrome.mjs` | `71d4ed91eaf7` | step-2 tabs, Chrome |
| `probe-sim.mjs` | `ede2d908d3be` | step-2 geometry and tabs, Simulator |
| `collapse-v1.json` | `1f4305ebed83` | Simulator toolbar collapse (count-only gesture) |
| `deck-g-v1.json` | `456ebec13061` | phone G1 gesture (gesture hash `fe961246a1e6`) |
| `arms/a-size-layout.css`, `a2-stretch.css`, `b-strict.css`, `r-ratio-only.css` | `e035f8334d28`, `c2775de88736`, `d4a3a79302a0`, `7591c48acc9f` | dropped design arms (step-2 evidence only) |

Served base pins: JS `941aa13e5bdf`, CSS `f1997edf5309` (`sim-swipe.mjs` `PINS`), base patch `ce2d32a1bbbb`.

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
  - The deck's content box is 0 tall and the shells overflow into its padding box. Both engines clip a scroll container at
    the padding box, so the visible clip is the same; pixels (rule 6) check it.
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
