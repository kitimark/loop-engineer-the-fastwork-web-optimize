# Fix: sticky-walk (the layout a dirty sticky box triggers walks the profile deck's aspect-ratio shells)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** P-172 phone block done (lead-signed, tool-serious, all holds VALID): finger-down > 50 at y 1000-3400 C 3,1,2,2 vs V 1,1,1,1, NO SEPARATION by the card rule but threshold-sensitive (both twins separate lower); > 34 separated (C 12-18, V 2-6); Layout >= 5 ms 152-159 -> 0-1 (prediction HIT). Waiting for the lead: landing rule and the deck look ruling (split reads T2).
**Stage:** D NAMED (lead, fast path, 2026-10-09 ~21:2xZ, after the drag check). F: build `fixcq`, restacked on g0.0i; gates in "F: build fixcq".
**Open item (own, outside the deck):** the y 0-600 static-nudge residual (~19 ms per nudge, `sw-map.mjs`, every knock-out arm). In G drags with the served fixcq CSS it is gone (0 big layouts at y < 1000); it appears only when the fixcq rules are injected after load (see "F: build fixcq", gate 5).
**Device class / gate:** touch-only (G) for the gain; Simulator counts for attribution
**Driver(s) behind the claims:** Simulator static nudge map (`sw-map.mjs`); Simulator G approach (`sw-drag.mjs`); G knock-outs from scrollcb-g0 (`out/scrollcb-g0/kog/`)
**Base:** D and gates 1-5 on g0.0h (JS 9162843e750f / CSS 26d28a0a263b, `out/sticky-walk/snap/C`). The build is restacked on **g0.0i** (main 8d726460; JS 9162843e750f / CSS adb875d94c1f, `out/sticky-walk/snap-i/C`); the CSS edits do not overlap (lead 2026-10-09: the gates carry over, plus a Simulator spot check).
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

## F: build fixcq

**The change** (`delta.diff`, CSS only, inside the mobile / coarse-pointer media rule `(width<=860px), (device-width<=500px),
(hover: none) and (pointer: coarse) and (width<=1200px)`; motion settings untouched):
- `.start-selling-profile-deck` gets `container-type: inline-size`.
- `.start-selling-profile-shell` (and its `.is-rail-in` twin selector): `aspect-ratio: 353/764` removed, `height: auto` becomes
  `height: calc(100cqi * 764 / 353)`. 100cqi is the deck's content width, which is also the shell's width
  (`flex: 0 0 100%; width: 100%`), so the box is the same 353:764 box: 844.078125 px at 430 wide, as in g0.0h.
- Containment added: WebKit's `container-type: inline-size` adds style and inline-size containment only, no layout or
  paint containment (CONFIRMED: `Source/WebCore/style/computed/StyleComputedStyle.cpp` 458-468, `usedContain()`,
  WebKit main e8c36a19). So the only new constraint is that the deck's inline size ignores its children; gate 4 checks it.

**Builds** (immutable copies, hashes in each `HASHES.txt`):

| build | JS | CSS | copy |
|---|---|---|---|
| g0.0h (gates 1-5 control) | 9162843e750f | 26d28a0a263b | `out/sticky-walk/snap/C` |
| g0.0h + fixcq (gates 1-5) | 9162843e750f | 2d1a1995fd2b | `out/sticky-walk/snap/V` |
| **g0.0i** (phone control) | 9162843e750f | adb875d94c1f | `out/sticky-walk/snap-i/C` |
| **g0.0i + fixcq** (phone build; `patch.diff`, baseline-relative) | 9162843e750f | bee7fce9ad56 | `out/sticky-walk/snap-i/V` |

**Gates** (A = control, V = build; each check loads A, V, A2, V2 on separate servers and origins; "consistent" = over 8
levels in all four cross pairs while neither A/A pair is):

| # | gate | tool | result |
|---|---|---|---|
| 2 | IO callbacks fire at the same y (wrapped IntersectionObserver, 25 px steps down and back, Chrome 430x775) | `gates/io-chrome.mjs` | **PASS**: 52 targets, A~V 0 differ (A/A 0). The `.hero` / `.pain-sticky` watchers flip at the same y. |
| 1 | Chrome pixels, phone 430x932, 13 stops, carousel frozen, commission fee aligned | `gates/px-chrome.mjs mobile` | **PASS**: consistent 0 at every stop. One V load showed 182 css px² in the fee bar at y 3875 (V/V the same, A2~V2 0): loop phase. |
| 1, 3 | Chrome pixels, desktop 1440 | `px-chrome.mjs desktop` | **PASS**: consistent 0 at all 13 stops (the media rule does not match there). |
| 3 | Chrome pixels, tablet 768x1024 and 1024x1366 (coarse pointer, inside the rule) | `px-chrome.mjs tablet / tablet1024` | **PASS**: 768 consistent 0 everywhere. 1024: clusters at y 3177 (206 css px²) and 3781 (6595) sit on the pain-note stack, a timer shuffle the gate does not freeze (A/A 11-17 % there; all four loads show a different stack). Deck geometry and document height at 1024 are equal (gate 4). |
| 3 | Chrome pixels, reduced motion (430x932) | `PX_RM=1 px-chrome.mjs mobile` | **PASS**: consistent 0 at all 13 stops. |
| 1 | Simulator pixels, 13 stops | `gates/px-sim.mjs` | **PASS**: consistent 0, except the iOS status-bar clock at y 0/300 (04:40 / 04:41 / 04:42 across loads; standard exclusion, lead 2026-10-09) and 15 css px² at max level 19 at y 3384 (commission card). px-sim calibration read the status bar (row 0, F-367): it uses the result only to label clusters, so labels within a shot sit ~59 css px off; the scores compare whole screens and are unaffected. |
| 4 | Deck in Chrome: geometry, `scrollLeft` after a touch swipe to each shell and back, deck crop at each position; 430x775, 430x815, 390x844, 768, 1024, 1440 | `gates/deck-chrome.mjs`, `deck-score.mjs` | **PASS**: geometry, snap positions (392 px steps at 430, 352 at 390, 730 at 768, 914 at 1024) and every deck crop equal (0 px over 8 levels), all four pairs. |
| 4 | Deck in the Simulator (real WDA swipes) | `gates/deck-sim.mjs` | Geometry **PASS** (deck 462 wide, `scrollWidth` 2422, shells 844.078125 px; snaps 0/392/784/1176/1568/1960 and back, all loads). Pixels: see "Simulator deck: image sharpness" below. |
| 4 | PR-013 avatar slider (keep-st6): behaviour and pixels, on g0.0i vs g0.0i + fixcq | `gates/avatar-gate.mjs --engine chrome|sim` | **PASS**. Behaviour: slide period 1021-1026 ms (Chrome) and 1022-1034 ms (Simulator) in all four loads (A, V, A2, V2), the same state sequence, every load aligned to the mount state and stepped through 4 slides with the same keyed captures. Pixels, 4 rest and 4 mid-slide crops per load (the slide animations paused at 110 ms): Chrome 0 px over 8 levels A~V and A/A on all 8 crops; Simulator consistent 0 px on all 8 crops, max level 31-32, with Simulator raster noise of the same size in the A/A and V/V pairs (up to 797 and 1283 px over 8 levels per 51,840 px crop). A sanity check proves that the crops show the moving row: rest~mid ~26,000 px and rest~next rest ~23,000 px over 8 levels in every load (`motionOk`). Correction (2026-10-09): the first runs of this gate were void. Chrome clipped by `Page.captureScreenshot` clip, and the Simulator cropped with a calibration that read the status bar. Neither crop showed the row (rest = mid = next rest), so their 0-px results proved nothing. Fixed: Chrome now crops a full-viewport shot; the Simulator calibration bar now sits at css top 100 px (Safari tints the status bar with a fixed bar's colour, so a bar at top 0 read as row 0; finding F-367). Both runs were repeated: `out/sticky-walk/avatar/chrome-2026-10-08T23-20-45-495Z`, `sim-2026-10-08T23-23-24-074Z`. |
| 5 | Simulator G approach counts, 3 loads per arm, served CSS (not injected) | `sw-drag.mjs --driver g` | **PASS**, table below. |

Gate 5 (data `out/sticky-walk/drag-f.json`; interleaved C:1 V:1 C:2 V:2 C:3 V:3, one load per arm per session order):

| arm | layouts >= 5 ms per run | at y < 1000 | at y >= 1000 | finger-down at y 1000-3400 | frames delivered | layouts (all) |
|---|---|---|---|---|---|---|
| g0.0h | 169, 142, 129 | 76, 64, 60 | 93, 78, 69 | 73, 65, 56 | 1051, 1087, 1101 | 853, 888, 880 |
| g0.0h + fixcq | 2, 2, 4 | 0, 0, 0 | 2, 2, 4 | 2, 2, 2 | 1197, 1203, 1180 | 955, 951, 934 |

- The ranges do not overlap on any column (OBSERVED, Simulator; Simulator timing is not a verdict, F-084; the counts are).
- The served build also removes the y < 1000 big layouts. The earlier drag check injected the fixcq rules after settle and kept
  34-47 there. A no-op style sheet injected the same way leaves V clean (`drag-vnoop.json`: 2 and 2 big layouts, 0 at
  y < 1000), so it is not injection as such; why the injected fixcq rules differ from the served ones is UNRESOLVED and
  does not affect the build.
- The 2-4 left are at y 1707 and 3602 in every V load.

**Simulator deck: image sharpness after a swipe (for the lead's T2 call).**
- In the Simulator only, at some deck positions after a swipe, the shells' photos are painted at a different resampling
  quality in C and V: no offset (the best shift is 0,0), only edges inside bitmaps differ.
- V is as sharp or sharper at every such step, never blurrier (edge energy, e.g. f3 10.86 vs 10.46, b3 11.06 vs 10.47).
- It is settled, not transient: a second shot 1.5 s later is identical. Stalling the avatar slider does not remove it.
- Which positions show it changes from session to session (run 1: f3/f5/b3/b0; stalled: f2/f3/f4/b1/b0/b4; late: s0/f2/f5/b2).
  Within a session A matches A2 and V matches V2.
- Numbers: largest consistent shade 42-91, or 206 on the vinyl-record image at one step (there the A/A pair differs too);
  up to 1,897 css px² per step (0.47 % of the screen); all inside the deck; static.
- Chrome shows none of it (deck crops 0 px at every position).
- Cause UNRESOLVED. Candidates: WebKit's page-wide ImageQualityController paints scaled bitmaps at Low quality while any
  bitmap changes its drawn size within 500 ms, and repaints at high quality only afterwards (CONFIRMED as code:
  `Source/WebCore/rendering/ImageQualityController.cpp` 46, 196-228, WebKit main e8c36a19; that it explains these shots
  is OBSERVED, cause unknown); or a different decode size.
- Reading: this is a rendering-quality state, not a layout change; by the PR-010 numbers it is T2 except the one 206-level step.
  The lead decides T2 or proposal.
- **Fill / edge split** (lead's look ruling, 2026-10-09; `gates/deck-split.mjs` over the three deck-sim sessions, offline, no
  Simulator; fill = consistent pixels whose 3x3 luma range in A is <= 2, edge = the rest; the status bar excluded):
  - Every step except b0, in all three sessions: fill max 15, edge max 91, at most 1,897 css px² (0.473 % of the screen) per
    step. Within T2 (fill <= 64, edge <= 128, <= 0.5 %).
  - Step b0 (the vinyl card in view) is beyond the limits in every session (fill up to 206, edge up to 206). The card's record
    spins: `animation: 4s linear infinite vinyl-spin` (CSS 3850-3852). The four shots show the label at four different angles,
    and the A/A pairs differ there too: A~A2 up to 187-200 and V~V2 up to 4-220 in the same box. These are rotation phases,
    not the build.
  - b0 without the vinyl card (css y < 685): 0 or 788 css px² at max level 63. Within T2.
  - Reading by the lead's rule: T2, with the vinyl step excluded as A/A noise (numbers above). The lead's ruling decides.

**Restack on g0.0i (lead 2026-10-09).** `fix.mjs apply sticky-walk --from g0-0i --reset`, then `delta.diff` applied (the
edits do not overlap: g0.0i adds rules at the end of the CSS). Simulator pixel spot check, g0.0i vs g0.0i + fixcq
(`px-sim.mjs` with `PX_SNAP=out/sticky-walk/snap-i`, stops 548, 1400, 2400, 3384, 4856, 5260; carousel frozen, fee
aligned): **PASS**. Consistent 0 at 548, 2400, 4856 and 5260 (the end of the page, where g0.0i's rules sit). At 1400: 57 css px² at max
level 23, inside the deck (the photo-sharpness state above). At 3384: 15 css px² at max level 19, the commission-card spot
already seen on g0.0h. The status-bar clock falls inside the A/A mask.

## Phone card: P-172 (signed by the lead 2026-10-09)

Signed as drafted below, with these pre-data notes (sent to the lead before the block):
- Profile **tool-serious**, not xcode-serious: Serious is induced by `iphone.mjs rearm` / `thermal.mjs`, with no Xcode user
  step (the lead: no user steps). P-159..P-171 ran the same way. Comparisons stay within the block.
- Kit `phone/sw-*.sh`: a text-substitution copy of fix-menu-layers' P-170b kit with the same gates and G program
  (`g-fastshort-g0.json`, 38d7fe5d7fa8). The program's first phase (mark `approach`, up to 12 strokes of 520 px in 1200 ms,
  drag profile, x 215, 300 ms pause) is the G approach; the y 1000-3400 read uses only that phase. One change: a phone that
  is not ready stops the block instead of posting a user step.
- Order: H1 WC, H2 WV, H3 S0 (start sentinel right after the warm-ups), H4-H11 EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4, H12 TAIL
  (re-runs, then S1).
- Reader `phone/p172-read.mjs` (sha256 89ad7f069998, written 23:32:55Z, before any counted run existed; selftest ok).

Draft as signed:

```
TICKET sticky-walk · g0.0i + fixcq: JS 9162843e750f / CSS bee7fce9ad56 (out/sticky-walk/snap-i/V)
       control g0.0i: JS 9162843e750f / CSS adb875d94c1f (out/sticky-walk/snap-i/C), same base
driver G (WDA gesture, the g0 G approach program: 10 strokes, 520 px up in 1200 ms, profile drag, x 215, 300 ms pause)
profile xcode-serious (default, T-162 #3)
question: does fixcq remove the finger-down long frames at y 1000-3400 that the deck's aspect-ratio walk causes?
prediction P-<id>
primary metric: finger-down frames dt > 50 ms at y 1000-3400 (and dt > 34), with twins (dt > 46 / 54, dt > 30 / 38);
  near bands (30, 38] / (46, 54] flagged; minShift 4 ms
secondary: whole-run > 50 / > 34; Timeline Layout records >= 5 ms (count and total ms) finger-down at y 1000-3400
decisions: if V < C at y 1000-3400 on > 50 with separated ranges (twins agree) -> F done, V review, land on the
  less-work rule; if within noise -> keep the Simulator counts as the cost card and land on the no-worse rule if
  whole-run > 50 is not worse; if V worse -> stop, back to D (the walk is not the phone's drag cost)
probe set: std + timeline (every counted run captures Timeline; sentinel = one uncounted Timeline-OFF control run after the
  warm-ups and one at the block end)
order: warm-up per arm port (uncounted), then C V V C C V V C (8 counted runs)
per run: battery temperature, charging state, thermal state
expected minutes: ~35
```

```
PREDICTION P-<id> · fix-scrollcb-g0 · 2026-10-09
1 g0.0i + fixcq (bee7fce9ad56) vs g0.0i (adb875d94c1f) · driver G · finger-down >50 / >34 at y 1000-3400, plus twins
2 baseline: no phone G baseline for g0.0h/g0.0i at y 1000-3400 within 24 h; the block's own C runs are the baseline
3 closure: Simulator G, g0.0h: 56-73 finger-down layouts >= 5 ms at y 1000-3400 per run (20-35 ms each in the static map);
  phone closure not available (phone-only segment card owed if the lead asks)
4 terms removed: | the deck shells' relayout per dirty-sticky layout | 20-35 ms per layout (Simulator static map) |
  calibrated on the Simulator (fixpx / fixcq knock-outs, drag check) | platform claims: setViewportConstrainedObjectsNeedLayout
  marks every sticky renderer (CONFIRMED); the link from a sticky's walk to the deck (UNRESOLVED; the knock-out carries it) |
5 prediction: Layout records >= 5 ms finger-down at y 1000-3400 drop by >= 80 % (Simulator: 56-73 -> 2); frames > 50 ms
  there fall in V vs C, size unknown (no phone baseline) · visible to rAF gaps and Timeline
6 falsified if: the Timeline shows no drop of big Layout records at y 1000-3400 in V, or > 50 counts are not lower in V
7 decision: as in the ticket
```

## P-172 result (iPhone, G, tool-serious, 2026-10-08 23:31Z to 2026-10-09 00:37Z)

- Block: H1-H12 VALID, no re-runs; every counted run's P-129 gates ok; sentinels S0 PASS (53.5 fps) and S1 PASS (53.8 fps).
  Thermal cleared after the hold. Data in `out/swp/runs`, read in `out/sticky-walk/p172-read.json`, summary in `results.json`.
- Reader `phone/p172-read.mjs` (89ad7f069998, unchanged since before the data). Window: approach phase, finger-down
  frames at scrollY 1000-3400.

| run | frames in window | > 50 (46 / 54) | > 34 (30 / 38) | Layout >= 5 ms in window | whole run > 50 | whole run > 34 |
|---|---|---|---|---|---|---|
| EC1 | 331 | 3 (4 / 1) | 18 (30 / 12) | 159 (2,208 ms) | 10 | 58 |
| EC2 | 333 | 1 (2 / 1) | 12 (25 / 9) | 153 (2,112 ms) | 5 | 50 |
| EC3 | 332 | 2 (2 / 1) | 12 (25 / 8) | 152 (2,126 ms) | 7 | 46 |
| EC4 | 333 | 2 (3 / 1) | 13 (28 / 8) | 155 (2,150 ms) | 9 | 47 |
| EV1 | 354 | 1 (1 / 0) | 2 (2 / 1) | 1 (5 ms) | 1 | 32 |
| EV2 | 352 | 1 (1 / 0) | 3 (4 / 1) | 0 | 1 | 32 |
| EV3 | 352 | 1 (1 / 0) | 5 (6 / 3) | 1 (5 ms) | 2 | 31 |
| EV4 | 350 | 1 (1 / 0) | 6 (6 / 2) | 1 (5 ms) | 2 | 33 |

- **Card rule, primary (> 50):** C 3,1,2,2 vs V 1,1,1,1. The ranges touch at 1, so the rule says **NO SEPARATION**. The
  no-worse check holds (whole-run > 50: C 5-10, V 1-2). The result is **threshold-sensitive**: both twins separate lower
  (> 46: C 2-4, V 1; > 54: C 1, V 0).
- **> 34:** separated lower, both twins agree (C 12-18, V 2-6).
- **Prediction HIT:** big Layout records in the window fall from 152-159 to 0-1 per run (-99 %). V also delivers more frames in
  the window (350-354 vs 331-333).
- **What is left:** the one > 50 frame in every V run sits at y 1747-1752 (51-52 ms). In C the same frame is 61-63 ms at y 1762.
  It is the te crossing frame that P-171 / cm-return targets (window 1650-1850), not the deck walk. fixcq shortens it by
  about 10 ms but does not remove it.
- Next: the lead picks the landing rule (the less-work rule on the Simulator cost card plus this no-worse check, or GAIN on
  > 34 and the twins) and rules on the deck look (the split reads T2).

## Probes

- `sw-map.mjs`: static nudge cost map, knock-out arms in `KO`, `SW_DUMP=<selector>` subtree dump, `--selftest`.
- `sw-drag.mjs`: a copy of `fixes/scrollcb-g0/sim-approach.mjs` with window resize and visualViewport event stamps; arms C (g0.0h) and V (g0.0h + fixcq) from the immutable copies.
- `gates/`: `px-chrome.mjs`, `px-sim.mjs` (copies of g0-box's pixel gates; `PX_SNAP`, `PX_ALIGN_FEE`, `PX_RM`, tablet viewports), `io-chrome.mjs`, `deck-chrome.mjs` + `deck-score.mjs`, `deck-sim.mjs` (`DECK_STALL`, `DECK_LATE`), `avatar-gate.mjs`, `deck-split.mjs` (the PR-010 fill / edge split, offline).
- `phone/`: the P-172 kit (`sw-run.sh`, `sw-block.sh`, `sw-hold.sh`, `sw-serve.sh`, `sw-k.env`) and its pre-data reader `p172-read.mjs`.
