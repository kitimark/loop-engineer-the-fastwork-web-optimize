# Fix: sticky-walk (the layout a dirty sticky box triggers walks the profile deck's aspect-ratio shells)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft
**Stage:** D LOCATED, signed by the lead 2026-10-09 (~20:5xZ). Upgrade to NAMED (fast path) if `sw-drag.mjs` shows fixcq removing the finger-down layouts >= 5 ms in G drags, 3 loads per arm, non-overlapping with base; only then F with fixcq.
**Open item (own, outside the deck):** the y 0-600 residual, ~19 ms per nudge in every arm including fixcq (see "Residual").
**Device class / gate:** touch-only (G) for the gain; Simulator counts for attribution
**Driver(s) behind the claims:** Simulator static nudge map (`sw-map.mjs`); Simulator G knock-outs from scrollcb-g0 (`out/scrollcb-g0/kog/`)
**Base:** g0.0h (main 03a46dc5; JS 9162843e750f / CSS 26d28a0a263b), immutable copy `out/sticky-walk/snap/C`
**Topic history:** started as sticky-far (un-stick a sticky box while its container is far off-screen). The G knock-outs predicted no gain from that, so it was dropped (F-358 correction) and renamed (lead 2026-10-09).

## D card

**Question.** When a finger drags toward the end of the page, the Simulator has 135-150 layouts of 5 ms or more per G approach run (y 0-4600). They go away when both `.hero` and `.pain-sticky` are made non-sticky (19-20). Taking out either box alone, the end panel or the nav changes nothing. What does that layout spend its time on?

**Method.**
- `sw-map.mjs`, Simulator 430x775.
- At each y from 0 to 4600 (step 200): a programmatic 1 px scroll nudge, out and back, 4 windows of 300 ms. A programmatic scroll moves the layout viewport, which marks every sticky/fixed renderer for layout. That is the same marking as in a drag (sources below).
- Per window: the Layout records, their count, and the largest ms.
- Knock-out CSS is added after the page settles. Knock-outs are attribution only and change the look.
- Mechanism check per y: computed `position` and rect top of `.hero` and `.pain-sticky`. Once per load: the census of rendered sticky/fixed boxes. Only `header.start-selling-top-nav` (fixed), `.hero` and `.pain-sticky` are rendered; `dialog.sb-dialog` is fixed but not rendered.
- Data: `out/sticky-walk/map.json`, `map-b2.json`, `map-b3.json`.

**Arms**, largest Layout per nudge window. At y 800-3400 there are 14 y × 4 = 56 windows.

| arm (CSS knock-out) | computed position hero / pain | y 800-3400: range (median); windows with a Layout >= 5 ms | reading |
|---|---|---|---|
| base, load 1 / load 2 | sticky / sticky | 0.1-36.1 (25.7), 60 / 19.4-32.2 (22.7), 57 | control |
| both relative (`nosticky`) | relative / relative | 0.2-22.3 (0.5), 1 | **positive**: no sticky, no big layout |
| hero sticky alone (`heroonly`) | sticky / relative | 0-37.3 (26.4), 58 | negative sibling: either one alone keeps it |
| pain-sticky alone (`painonly`) | relative / sticky | 18.7-35.9 (26.1), 57 | negative sibling |
| hero sticky alone, its children `display:none` (`heroempty1`) | sticky / relative | 17.9-37.6 (28.8), 57 | the cost is not in the sticky's subtree |
| hero sticky alone, `contain: size layout` on it (`herocontain1`) | sticky / relative | 17.3-36.1 (26.8), 58 | a boundary at the sticky does not stop it |
| hero alone + `#people` or `#profile-showcase` hidden | sticky / relative | 0.4-0.9 at y 400/1400/2400 | **located**: #people's profile showcase |
| hero alone + pain / commission / platform hidden | | 20-33 | not these sections |
| hero alone + the deck hidden (`pnodeck`) | | 0.5-0.7 | inside the deck |
| hero alone + the shells' panel/body `height:100%` set to auto (`pnopct`) | | 22-31 | not those percent heights |
| hero alone + only the active shell shown (`ponlyactive`) | | 9.7-15.9 | the cost scales with the number of shells (6) |
| hero alone + shells `aspect-ratio: auto; height: 900px` (`pnoar`) | | 0.6-0.7 at y 1400/2400 | **the shells' aspect-ratio** |
| both sticky + shells `aspect-ratio: auto; height: 844.078125px` (`fixpx`) | sticky / sticky | 0.3-2.5 (0.4), 0 | same size, no aspect-ratio: gone |
| both sticky + `container-type: inline-size` on the deck, shells `height: calc(100cqi * 764 / 353)` (`fixcq`) | sticky / sticky | 0.3-1.0 (0.4), 0 | **candidate**: gone; shell height 844.078125 px, deck 462x844, the same as base |

The panel and sb-dialog arms come from the earlier G knock-outs (`out/scrollcb-g0/kog/`): panel `display:none` 150, nav `display:none` 137 layouts of 5 ms or more per run (base 135-150). Both are negative.

**Verdict proposed: LOCATED.**
- Any dirty sticky renderer leads to a 20-35 ms layout of the six `.start-selling-profile-shell` boxes in `#profile-showcase`'s horizontal snap deck. The shells are `aspect-ratio: 353/764; height: auto; flex: 0 0 100%`, in the mobile / coarse-pointer media query at CSS ~3712-3801.
- The 0.4-0.9 ms map rows were measured at y 400/1400/2400 only.
- With the same height given without aspect-ratio, it drops to about 0.5 ms (OBSERVED, Simulator).
- Same box as fix-toolbar-resize's toolbar-step cost (F-237, P-110/P-115). It explains why `contain` on the showcase did nothing there.

**Why the cost stops at y ~3600.** g0.0h's far re-skip puts `content-visibility: auto` back on scenes well behind the user. Once #people (y 776-2104) is skipped, its layout does not run, so the deck's relayout disappears. This is inferred from the y profile; the flip of `data-start-selling-render` was not logged.

**Residual, outside this topic.** At y 0-600 a ~19 ms layout per nudge stays in every arm, fixcq included (median 19.3). The no-sticky arm has it only in some windows (median 0.6). This is a second sticky-triggered cost in the hero zone. It is not the deck. OBSERVED, cause unknown.

**Source** (WebKit main e64e28917cb4):
- CONFIRMED: `LocalFrameView::setViewportConstrainedObjectsNeedLayout` marks every fixed and sticky renderer (`LocalFrameView.cpp` 3822-3834).
  - It is called from `setLayoutViewportOverrideRect` (1970-1990). That function forces Yes when the rect size changes (1977-1980) and runs for programmatic scrolls via `updateLayoutViewport` (2019-2026).
  - A drag's visible-rect updates pass No (`WebPageCocoa.mm` 4218-4229; `WKWebViewIOS.mm` 3130-3150: isDragging is unstable).
- CONFIRMED: `RenderBlockFlow::layoutBlock` re-dirties its percent-height descendants on every full (non-simplified) layout (`RenderBlockFlow.cpp` 588, 638, 833-841). It invalidates the preferred widths of boxes on that chain that have an aspect ratio (807-828).
- Percent heights whose containing blocks have auto height register on the first definite ancestor or the RenderView (`RenderBox.cpp` 2605-2609, 3958-3962, 4038ff.).
- UNRESOLVED: which link carries a sticky's walk into the deck's shells. A WebKit source helper is mapping the RenderFlexibleBox aspect-ratio paths.

**Why mid-drag (UNRESOLVED).**
- The drag path passes No (above). The sticky renderers still get dirty mid-drag.
- The only drag-capable trigger found in source is a layout-viewport size change (`LocalFrameView.cpp` 1977-1980), for example a toolbar or obscured-inset change.
- The G counts show the sticky boxes do not add layouts: both-relative has 1010 layouts per run vs 832-900 for base. They make the per-frame layouts expensive.
- **Decisive check, stated now:** `sw-drag.mjs`, G approach on base vs `fixcq`, 3 loads per arm. It stamps window `resize` and `visualViewport` resize/scroll events, with no geometry reads.
  - If fixcq removes the finger-down layouts of 5 ms or more the way both-relative did, the drag cost is this same walk.
  - If the big layouts in base line up with resize or visualViewport-resize stamps, the trigger is the size-change path. If not, the trigger stays unknown and the phone version of this run (P-164-style Timeline plus event stamps) decides it, after the lead signs.

## Drag check result (sw-drag.mjs, Simulator G approach, 10 drags y 0 -> ~5100, counts only)

| arm | loads | layouts >= 5 ms / run | finger-down | at y >= 1000 | frames delivered | layouts (all) | big ones within 40 ms of a resize / vv-resize |
|---|---|---|---|---|---|---|---|
| g0.0h base | 3 | 138, 139, 144 | 134-139 | 56-83 | 1060-1073 | 857-866 | 8-23 |
| + fixcq (CSS injected after settle) | 4 (one more VOID: `sim.mjs open` failed) | 36, 36, 43, 49 | 33-46 | 2 | 1174-1206 | 910-921 | 18-21 |

Data: `out/sticky-walk/drag-base.json`, `drag-fixcq.json`.

- The ranges don't overlap. Above y 1000, fixcq removes the finger-down big layouts the way both-relative did (2 per run left). The drag cost there is this walk (OBSERVED, Simulator).
- The 34-47 left at y 0-1000 are the hero-zone residual; both-relative had 19-20 in total.
- **Why mid-drag:** window resize events (2-3 per run) and visualViewport resize events (6-9) are rare. Only 8-23 of base's 138-144 big layouts fall within 40 ms of one. So a layout-viewport size change explains a minority (OBSERVED). What dirties the sticky renderers on the other finger-down frames is still UNRESOLVED; the phone version decides it, after the lead signs.

## Build gates (after D)

1. **Pixels.** Pixel-identical to g0.0h at every y, or T2 within PR-010 wide (Chrome + Simulator A/A). Include the deck at each of the 6 shells' snap positions.
2. **IO callbacks.** The IO callbacks that watch `.hero` / `.pain-sticky` fire at the same scroll positions, logged in both arms.
3. **Other devices.** Desktop, tablet (the rule is also in the coarse-pointer ≤1200 branch) and reduced motion unchanged.
4. **Lead's cqi gates:**
   - The deck's width is the same at every breakpoint and toolbar state (430x775/815, Simulator), including at the snap scroll positions of all 6 shells.
   - The snap positions and targets are unchanged: `scrollLeft` after a swipe to each shell, A vs V.
   - The PR-013 avatar slider (keep-st6) behaves the same.
5. **Counts.** Simulator G approach counts (layouts >= 5 ms, frames delivered) vs g0.0h, 3 loads per arm.
6. **Phone.** Only with the lead's signature.

## Probes

- `sw-map.mjs`: static nudge cost map, knock-out arms in `KO`, `SW_DUMP=<selector>` subtree dump, `--selftest`.
- `sw-drag.mjs`: a copy of `fixes/scrollcb-g0/sim-approach.mjs` on g0.0h, with window resize and visualViewport event stamps.
