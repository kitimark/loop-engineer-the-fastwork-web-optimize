# Research: compositor-morph (end-of-page nav morph with compositor-only properties, scroll-driven)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** CM v1.2 on v9-final, gated (counts, pixels, corners); goes to the user as a proposal with Try-it. Nothing here lands without the user's pick (user T-204 #27/#29):
the look differs from today in small ways (listed below), so it goes to the user as a proposal with Try-it.
**Owner:** arch-compositor-morph. **Stage:** research + F (prototype, gates). No timing (memory
defer-timing-focus-call-tree); counts, layers and pixels only.
**Device class / gate:** phone render-bound (WebKit main thread in the morph frames); Chrome counts as a second view.
**Drivers:** Chrome: rAF-stepped scroll (`cm-chrome.mjs`, fix-end-morph's em-chrome) and synthesized touch scroll
(probe); Simulator: rAF-stepped scroll and WDA finger strokes (probe). No phone run yet (P-155/P-156 first, lead's
order 2026-10-06).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (v9-final + CM: `__msTick`'s write line; new block
`__cmMq` … `__cmSet` after `__msTick`; one line in the morph-scroll setup), `/_app/immutable/assets/2.gBuqKVzi.css`
(+~110 lines at the end, `html.fw-cm` rules).

## Step 1: does a threaded scroll-driven transform/opacity animation still cost main-thread work per frame?

**Answer: style yes, layout and paint no.** Each rendering update still restyles every element whose scroll-driven
animation is active, also when WebKit runs it on the scrolling thread. Layout and repaint go away for
transform / opacity / filter / backdrop-filter.

| claim | status | reference |
|---|---|---|
| Safari runs qualifying scroll-driven animations threaded by default on iOS | CONFIRMED (source) | WebKit `safari-7624.5.1.11-branch`: `Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml` 8316-8329 (`ThreadedScrollDrivenAnimationsEnabled`, status stable, WebKit default true, condition `ENABLE(THREADED_ANIMATIONS)`); `Source/WTF/wtf/PlatformEnableCocoa.h` 934-936 (`ENABLE_THREADED_ANIMATIONS 1` on every Cocoa platform but macOS < 15) |
| The threaded path needs: not pending, a scroller with a scrolling node, accelerated properties only, no reference filter, no size-dependent transform | CONFIRMED (source) | `Source/WebCore/animation/KeyframeEffect.cpp` 1930-1958 (`canBeAccelerated`), 3142-3153 (`canHaveAcceleratedRepresentation`); `ScrollTimeline.cpp` 416-426 |
| transform, opacity, filter and backdrop-filter are accelerated properties | CONFIRMED (source) | `Source/WebCore/platform/animation/AcceleratedEffect.cpp` 141-145 (backdrop-filter), `Source/WebKit/UIProcess/RemoteLayerTree/RemoteAnimationStack.mm` (the UI process applies them) |
| Every rendering update ticks every relevant animation of every scroll timeline whose source is connected | CONFIRMED (source) | `Source/WebCore/animation/AnimationTimelinesController.cpp` 140-180 (`updateAnimationsAndSendEvents`); `ScrollTimeline.cpp` 290-297 |
| Each tick invalidates the target's style, threaded or not | CONFIRMED (source) | `WebAnimation.cpp` 1554-1576 (`tick` -> `animationDidTick`); `KeyframeEffect.cpp` 2081-2088 (`animationDidTick` -> `invalidate()`), 1706-1710, 125-133 (`invalidateStyleForAnimation`) |
| Without the threaded path a scroll-driven animation is never accelerated (main thread every frame) | CONFIRMED (source) | `KeyframeEffect.cpp` 1960-1961 |
| Chrome: a scroll-driven animation in its range costs one style recalc per main frame, 0 Layout, 0 Paint, also under a compositor touch scroll | OBSERVED (Chrome 154 probe, in our setup) | `out/cm/probe` (not committed): sda 162 UpdateLayoutTree / 208 main frames under `Input.synthesizeScrollGesture`, view-timeline variant only inside its range (32), no-animation control 0; rAF-driven control 160-162 plus its script |
| WebKit: under a finger (async) scroll a scroll-driven transform/opacity animation adds a style recalc to every frame and little layout or paint | OBSERVED (iOS 26.5 Simulator, WDA finger strokes, in our setup; the phone probe AN/AS/AR checks it) | `out/cm/probe` (not committed), 2026-10-06 11:31Z: sda 382 frames with 503 style recalcs (every frame), 142 layouts (96 frames), 126 paints (125 frames); no-animation control 391 frames, 103 style recalcs (79 frames), 117 layouts (80 frames), 100 paints (98 frames). The rAF-stepped scrollTo driver costs ~1 style + 2 layouts per frame by itself, so it can't separate them |

**Glass corners.** Chrome clips a backdrop-filter inside nested rounded overflow clips only by the outermost clip, so
CM's glass shows square corners there (Chromium source reading, finding F-309: `property_tree_manager.cc`
CloseCcEffect, SynthesizeCcEffectsForClipsIfNeeded; no crbug found). The same test page in the iOS Simulator
(`out/cm/bd`, variant "as CM") draws the blurred glass with clean rounded corners: OBSERVED (Simulator shot, in our
setup). So the corner artefact is Chrome-only; the phone is the target.

So the gain to expect is not "zero main-thread work" but "no layout, no repaint, no per-frame script": the per-frame
cost moves from layout + paint + raster of the nav, panel, header and footer to a style pass over ~40 elements.

## Step 2: design (CM)

Today (v9-final) the morph writes `--morph` on the nav every frame; CSS derives `top`, `width`, `height`,
`border-radius`, `background` (color-mix), the bar's and logo's positions, the panel's opacity / blur / scale, the
footer's and columns' offsets from it, so every frame lays out and repaints the nav and the panel.

CM, phones only (`html.fw-cm`, width <= 640 px, touch phones where morph-scroll runs, and only where
`CSS.supports('(timeline-scope: --a) and (animation-range: cover 0% cover 100lvh)')`):

- **The nav takes its final size once** (`.is-morphing`: top 12 px, `--panel-w` x `--panel-h`, no background, no
  radius, overflow visible). Today's box at m (inset 4(1-m), height 52 + (H-52)m, radius min(32-12m, h/2, w/2)) is
  cut out of it by **four nested corner clippers** `c0 > u0 > c1 > u1 > c2 > u2 > c3 > u3`: each `c_i` is a 2000 px
  `overflow:hidden; border-radius:32px` box anchored at one corner, moved to that corner of today's box and scaled
  by k = r/32 (so its corner is today's radius); each `u_i` counter-transforms (scale 1/k, translate back), so the
  content stays in place. All eight transforms are compositor properties.
- **Every part follows the scroll by transform/opacity/filter only**, generated as `@keyframes fw-cm-<key>` on the
  named view timeline `--fwms` (the morph-scroll end element, `animation-range: cover 0% cover 100lvh`, so the
  range is exactly the morph's scroll range at any toolbar state): bar translate, logo translate (P1's formula),
  actions, Join (blur + translate), language switch, panel (opacity, blur 12(1-o), scale .96+.04m about the box
  centre), backdrop, veil, centre, footer, the columns, and the dark layer `.fw-cm-dk` (`#131922` at opacity m,
  today's color-mix). The glass (white 10 % + `backdrop-filter: blur(20(1-m)px)`) is on `u3`, which keeps it the
  backdrop root of the nested language-switch blur, as on today's nav.
- **The non-linear parts** (1/k on `u_i`, the kink of the radius at m_k = 6/((H-52)/2+12), the logo, the columns)
  get dense keyframe grids (`u_i`: 16 points up to m_k, 72 after; logo 8; columns 16). The values come from one
  function, `__cmVals(m, geometry)`, which also writes the inline values for the first frame (a new scroll-driven
  animation is pending for one frame, F-162). The geometry (W, H, logo width, column factors) comes from a hidden
  size box read by a ResizeObserver, never in a morph frame.
- **Script per frame: none that writes style.** `__msTick` still reads the scroll position (7d settle), and the
  Svelte state `x` is written only when m crosses a threshold the template uses (0, 0.08, 0.2, 0.35, 0.4, 0.55,
  qM): classes, `inert`, `aria-*` and `tabindex` flip at the same m as today.
- The wrappers are `role="none"`, the dark layer and the size box `aria-hidden` (F-307). They are created in the
  morph-scroll setup effect (after hydration), and the header's own children move into `u3`; no CSS rule in the
  bundle uses a child combinator from the header (checked: CSS 11998 is the only `>` rule near it, on the actions).

## Builds

| name | how | JS / CSS sha256/12 |
|---|---|---|
| C = v9-final (7c) | baseline + `fixes/v9-best/patch.diff` (the A arm, a copy in `out/cm/C`) | 647c9ef2b1e2 / e1359ab9994a |
| CM v1 | C + the first CM change | 0c6860678741 / 85fbec678324 |
| CM v1.1 | CM v1 + two fixes found by the after-close probe (below): `html.fw-cm-out` holds off the nav's width / background transitions on the frame `.is-morphing` drops; the Join button keeps today's unmask animation in its list, so it no longer replays (the P-157 phone build) | 887b4cde06eb / 2948d49e47c6 |
| CM v1.2 (pre end fix) | v1.1 + the hit test skipped while the CM morph stands past 0.2 (below) | b131d0a92404 / 2948d49e47c6 |
| **CM v1.2** | + the end fix (`__cmK` bucket `t >= 1`, below); `delta.diff` (this folder) | **b9d2eceae44a / 2948d49e47c6** |

`patch.diff` is baseline-relative (v9-final + CM, `fix.mjs diff`); `delta.diff` is the CM change alone, against C.
Earlier gate runs in this README name the build they measured (CM v1 had JS 4335ca5e6cad before the
`cover 0% cover 100lvh` range and the F-307 attributes; the CSS was the same).

## Step 3: evidence (no timing)

### Chrome: work per morph frame (`gates/cm-chrome.mjs`, fix-end-morph's em-chrome + a layer census)

Headless Chrome 154, 430x775 DPR 3, mobile + touch, no CPU throttle, one scroll step per rAF, touch held, 40 steps
per direction. Totals per phase (C = v9-final, CM = JS 0c6860678741):

| phase (frames) | build | style recalcs (elements) | Layout (dirty objects) | Paint (area, Mpx) | Raster tasks |
|---|---|---|---|---|---|
| open (40) | C | 94 (1379) | **44** (160) | 324 (127.9) | **582** |
| open (40) | CM | 118 (2010) | **7** (461) | 219 (121.7) | **152** |
| close (40) | C | 106 (1051) | **41** (131) | 320 (128.8) | **555** |
| close (40) | CM | 132 (1682) | **3** (425) | 194 (122.7) | **141** |
| lift-open drag (20) | C / CM | 41 / 60 | 22 / 5 | 141 / 93 | 260 / 112 |
| lift-close drag (20) | C / CM | 56 / 63 | 19 / 0 | 163 / 108 | 336 / 72 |
| rest at m 1 (40) | C / CM | 38 / 38 | 0 / 0 | 122 / 122 | 12 / 10 |
| rest after close (40) | C / CM | 38 / 38 | 38 / 38 | 141 / **271** | 159 / 180 |

Per-frame medians in "open": C 2 style / 1 layout / 7 paints / 15 rasters; CM 3 style / 0 layout / 4 paints / 3
rasters (rest at m 1 is 1 / 0 / 3 / 0 in both, the page's own countdown and orbit). So in Chrome CM removes the
morph's per-frame layout and ~3/4 of its rasters, and adds one style pass of ~15 elements per frame (the
scroll-driven animations, as step 1 predicts). The few layouts left in CM are the threshold frames (classes flip,
`.is-morphing` arrives); their dirty count is higher (the wrappers and the panel) but they happen ~6 times per
pass, not 40. Forced style recalcs stay equal (60 / 61: `__msTick`'s scroll read and nav-hit-cache's probe, F-297),
the CPU profile's top script functions are the same.

**After the close (CM v1, traced and fixed in v1.1).** CM v1 repainted more at rest after the close (271 vs 141
paints over 40 frames). `out/cm/rest/rest-card.mjs` (Chrome, paint counts per layer in 500 ms windows after a 40-step
close, not committed) found two behaviour bugs:
- the nav jumped from its CM size back to today's box with `.is-morphing` gone, so today's `:not(.is-morphing)`
  `width 0.68s` / `background 0.7s` transitions animated the jump (header repainted 30 times in 0.5 s);
- the Join button's one-shot unmask animation (CSS 12065, 0.98 s after 0.52 s) left the list while CM's animation
  replaced it and restarted when `.is-morphing` dropped: the Join shimmer replayed after every close.

v1.1 holds the two transitions off for the flip's frame (`html.fw-cm-out`, two rAFs) and keeps the unmask in the
Join button's animation list during the morph (same name: the running animation continues). After the fix, in the
first 500 ms after the close: v9-final repaints the header 12 times and the Join button 12; v1.1 repaints neither.
From 1 s on, both builds repaint only the platform titles (1 per 500 ms each).

Layers (LayerTree, composited layers that draw content; memory = area x 9 x 4 bytes, an estimate):

| position | C layers (drawing) / est. MB | CM layers (drawing) / est. MB |
|---|---|---|
| m 0 (before the zone) | 80 (75) / 373 | 80 (75) / 373 |
| m 0.5 | 68 (65) / 342 | 82 (71) / 387 |
| m 1 | 68 (65) / 366 | 82 (71) / 387 |

CM adds 14 layers (6 that draw) and about 21-45 MB of estimated backing store while the morph is on (the eight
wrappers, the dark layer and the full-size glass are composited); none before the zone.

## Phone card (ticket draft; predictions frozen before any phone data, 2026-10-06 11:15Z, row A revised 11:36Z)

**Question (one):** under the G driver (WDA robot finger, the E procedure of P-152/P-155), does CM v1.1 remove the
WebKit main thread's per-frame Layout and most of its Paint in the morph frames, while the per-frame style pass
stays (step 1)? Counts from Safari's Timeline, no timing claim (memory defer-timing-focus-call-tree).

| item | value |
|---|---|
| arms | C = v9-final (control), V = CM v1.1, same base; snapshot `out/cm/snap` (read-only, rebuilt 11:31:12Z for v1.1), `HASHES.txt` 8926d9f97923 (C JS 647c9ef2b1e2 CSS e1359ab9994a, V JS 887b4cde06eb CSS 2948d49e47c6, probe P index.html fab9522e5c50 probe.js 657015b37fee), checked by `phone/cm-serve.sh` before every start and part |
| servers | `phone/cm-serve.sh start`: plain http (I-003), `--latency 150 --vendors=local`, B (thermal gate page), C, V, P (probe) |
| driver / script | G, `fixes/morph-scroll/g-fastshort-v1.json`, compiled program 8737f212c0ff, GESTURE_BUDGET_S 229; probe `phone/g-probe-v1.json`, 7ff27a2413c8, GESTURE_BUDGET_S 150 |
| profile | xcode-serious (no heat pre-warm, no cooling wait), the sentinel decides validity. `cm-block.sh` defaults to `CM_COOL=1` (a cooling wait below 38 °C before every hold), so **every P-157 block command sets `CM_COOL=0`**: `CM_TICKET=P-157 CM_COOL=0 node tools/lock.mjs run iphone --owner arch-compositor-morph --block P-157 --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone/cm-block.sh <part's holds>` |
| order | WC, WV (uncounted warm-ups, Timeline off, `--warmup`), EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4 (counted, Timeline on), TAIL (at most 2 re-runs of runs that failed a P-129 run gate), S1 (uncounted Timeline-off end sentinel on C), then AN AS AR (attribution, probe page `?v=none|sda|raf`, Timeline on, uncounted) |
| holds | one item per 600 s chrome-measure `--no-timing` hold inside one phone hold `--block <ticket> --max-seconds 3600` (`phone/cm-block.sh`, a copy of P-155's runner); before every hold: park Safari, WDA check (else `wda ensure`); every part starts with the served-hash check, `iphone.mjs wda ensure` (I-220, 5803d436: keeps a ready WDA; exit 4 = re-plug, the block stops and the lead is told) and a Safari restart (I-214) |
| kit pins (sha256/12) | `phone/cm-hold.sh` 14d205b17331, `phone/cm-block.sh` 4d7accc06889, `phone/cm-serve.sh` 66c9f9ff4e53, `phone/cm-read.mjs` bed0fe10d768, `g-fastshort-v1.json` df597802d2f0, `phone/g-probe-v1.json` 05c8bda33b07, `p129-gates.mjs` a06847c64a2e, `p129-read.mjs` 06f74f5d19ca, `thermal-gate.mjs` ecb403b3ad25, `pmcheck.mjs` d36bd7437b7c; every hold prints them (`PIN` line) |
| dry run (c) | 2026-10-06 11:31:53-11:33Z on head 054e8bdd (main with I-220, 5803d436): all 14 holds `DRY ok` (pins, served hashes C/V ok, compiled programs fs 8737f212c0ff budget 229 s and pr 7ff27a2413c8 budget 150 s, one item per hold), `wda check` READY; logs `out/cmp/hold-H*.log` (not committed) |
| budget per hold | E/W/S items 229 s (P-155's holds of the same script took 219-234 s); A items 150 s; 14 holds, about 1.5-1.8 h with the restarts; three phone holds of at most 3600 s each (11-13 holds in one would need under ~4.6 min per hold): part 1 = WC WV EC1 EV1 EV2 EC2 EC3 (7 holds, ~45 min), part 2 = EV3 EV4 EC4 TAIL S1 (4-7 holds), part 3 = AN AS AR (3 holds, ~15 min); a hold whose next item would end past 600 s is VOID (7) and re-run once |
| reader | `phone/cm-read.mjs` (`--selftest` 6 checks): morph frames = rows in the lastScreen band that moved with 0 < m < 1 (P-155's `mOf`); per frame the Layout / Paint / RecalculateStyles records that start in (t - dt, t]; P-129 run gates role E. Probe runs: every moved frame, ungated |

**Signed as P-157** by the lead, 2026-10-06 11:41Z (conditions: real time of the row A revision; the clock items;
this calibration note). Phone order: after P-156. **The clock items were dropped** (lead, 11:46Z): the panel-clock
layer showed no iOS gain (fixes/panel-clock-layer/README.md), so P-157 has no clock no-worse items.

Calibration (not this block's data, and another profile: P-155's holds cooled the phone below 38 °C before each
hold, rev 1.4, while P-157 runs xcode-serious with no cooling wait; so it only sets the scale of the predictions,
and every comparison stays within P-157): P-155's C runs read with the same reader (EC1-EC3, fix-end-morph's runs):
per morph frame Layout 2.32-2.38, Paint 11.6-12.2, RecalculateStyles 1.85-1.92; share of morph frames with any
Layout 0.95-0.96, Paint 0.97-0.98, style 0.89-0.93; ~1430 morph frames per run.

Predictions (each judged on the valid counted runs, at least 3 per arm; "separated" = every V run beyond every C run):

| # | count | pass | fail |
|---|---|---|---|
| P1 | Layout per morph frame | V ≤ 0.3 per frame in every V run (this is what "~0" means: the threshold frames, ~6 per pass, and the page's own layouts), and separated from C | any V run > 0.6, or not separated |
| P2 | Paint per morph frame | V ≤ 0.5 x the lowest C run, separated | V ≥ 0.8 x the lowest C run, or not separated |
| P3 | style per morph frame | V share of frames with a style recalc ≥ 0.8 (step 1: the style pass stays) | V share < 0.5 (then step 1's WebKit claim is wrong for the finger driver: report, no gain claim on it) |
| P4 | share of morph frames with any Layout | V ≤ 0.15 | V > 0.3 |
| A | probe (uncounted, attribution), judged against AN (the same page without the animation) | AS: style share ≥ 0.8 and ≥ AN's share + 0.5; AS Layout per moved frame ≤ AN's + 0.15; AR: style share ≥ 0.8 (rAF writes) | AS style share < 0.5 (WebKit skips the per-tick restyle under a threaded scroll: then step 1 row 5 is REFUTED in practice; cite and re-read the source) |

Revision note (written 11:35-11:36Z, committed 11:36:51Z in 64bca5a3, before any phone data; an earlier draft of this line said 11:50Z by mistake): row A first said "AS Layout ≤ 0.1, AN style ≤ 0.1 per frame" in
absolute numbers. The Simulator probe (11:31Z, WDA strokes) shows the probe page itself lays out and restyles in some
frames without any animation (AN: 0.30 layouts and 0.26 style recalcs per frame; AS: 0.37 and 1.32, style in every
frame), so A is now judged against AN. P1-P4 are unchanged. V changed from CM v1 to v1.1 (overlay 11:21-11:24Z, snapshot 11:31:12Z): the two fixes act
only on the frame the morph ends, outside the counted morph frames (0 < m < 1).

Between the marks (P1 0.3-0.6, P2 0.5-0.8, P3 0.5-0.8, P4 0.15-0.3): "partial", reported as such, no landing
claim. Row A is partial when it is neither pass nor fail (reported, no landing claim). P1-P4 are judged per V run:
every valid V run must meet the pass bound (P3 and P4 included), and P1/P2 also need "separated" as defined above;
one V run past a fail bound fails the row. The block
names no frame-time or fps prediction; the P-129 gates and the sentinel (bottom ≥ 58 and scroll ≥ 44 fps) only
decide validity.

## P-157 results (iPhone 15 Pro Max, G driver, xcode-serious; read by ops-reader-P157, fixes/PREDICTIONS.md P-157 c[8]-c[11])

All 8 counted runs VALID (P-129 gates E ok, served hashes ok in every hold, TAIL none), end sentinel S1 PASS (fps
54.3, slow 0.039). H7 (EC3) was cut by the owner's session ending (API errors, I-221) before any data and re-run
fresh in part 2. Morph frames per run: C 1389-1434, V 1468-1475.

| per morph frame (share of frames with any) | C (EC1-EC4) | V = CM v1.1 (EV1-EV4) | row | verdict |
|---|---|---|---|---|
| Layout | 2.23-2.38 (0.93-0.96) | 1.00-1.04 (0.58-0.59) | P1 / P4 | **MISS / MISS** (separated from C, but every V run past the fail bounds 0.6 / 0.3) |
| Paint | 11.45-12.01 (0.95-0.98) | 3.19-3.28 (0.68-0.70) | P2 | **HIT** (0.28-0.29 x the lowest C run, separated) |
| style recalcs | 1.82-1.90 (0.89-0.97) | 2.13-2.18 (0.93-0.94) | P3 | **HIT** (the style pass stays, as step 1 says) |

Row A (probe page, uncounted, moved frames): AN (no animation) Layout 0.389 / style share 0.277; AS (scroll-driven)
0.371 / 0.855; AR (rAF writes) 0.377 / 0.917: **HIT**. On the phone a threaded scroll-driven animation restyles every
frame and adds no layout of its own (OBSERVED, matches the WebKit source read in step 1).

So on the phone CM cut Paint to about a quarter and Layout to less than half; the prediction "Layout ~0" is refuted.
POST HOC (not in the card, decides nothing): median frame time 17 ms in all 8 runs; share of morph frames > 34 ms
V 0.014-0.015 vs C 0.015-0.024, > 50 ms V 0.001-0.003 vs C 0.002-0.005: the ranges overlap, **no frame-time
separation** under G at xcode-serious (a small V tendency at most, inside the ±4 ms twin noise).

## Where V's remaining Layout comes from (Simulator, stacks)

The phone Timeline records carry no stacks (0 of ~12.5k), so the source was traced in the iOS Simulator
(`out/cm/lay/lay-sim.mjs`, not committed: Safari Timeline with `maxCallStackDepth` 12, WDA finger strokes up through the
zone and back, every Layout inside script grouped by stack). CM v1.1, 922 rendering frames, 291 script-forced layouts:

| forced layouts | stack |
|---|---|
| 158 | `elementsFromPoint` < `F` 13867 < `_` 14140 < `L` < scroll engine `iE` 2707 (nav-hit-cache's backdrop hit test) |
| 44 | `__msTick` 14291 (`window.scrollY`, it pays for whatever layout is dirty at that point) |
| (style only) | `getBoundingClientRect` < `a` 3301 |

C (v9-final) had 132 + 194 (F's `getBoundingClientRect` and `elementsFromPoint`) + 24 from the same places. On the
phone tl the rAF-forced layouts sit at m > 0.35. `_()` re-runs F() on every morph frame (`C()` is true while m > 0),
yet the answer cannot show while m > 0.2: the nav's `is-on-dark` class is `g || m > 0.2` (JS 14716).

**v1.2** skips that hit test while the CM morph stands past 0.2 (`__cmLive && __msP > 0.2 && r > 0.2`; `r` is the spring's value, in case the debug driver moves m). Below 0.2 it runs as
before, and `__msTick` already re-tests (queueMicrotask F()) after a write that brings m to <= 0.2, so the class the
user sees is the same. The same skip on today's build (no CM) is the separate delta `fixes/hit-skip/`.

**v1.2 end fix** (found by the screencast gate below): `__cmSet` writes the Svelte state x (classes and `--morph`)
only when a bucket of `__cmK` changes, and the last bucket opened at qM 0.92. So after a normal scroll to the end, x
stayed at the value where t crossed 0.92 (0.9496 in the gate), and the still frame at m 1 differed from today by
~2 % (a straight jump to m 1 gave 0.19 %). v1.2 adds one bucket, `t >= 1`: x is exactly 1 at the end, where the 7d
settle rests. It costs one Svelte update per arrival at the end; nothing changes below m 1 (checked below).

## v1.2 results (Chrome counts, Simulator counts, pixels, corners)

### Chrome, work per morph frame (`gates/cm-chrome.mjs`, 430x775, 40-step open/close, medians per frame)

| phase | C = v9-final | v1.2 |
|---|---|---|
| open: style / layout / paint / raster | 2 / 1 / 7 / 15 | 3 / 0 / 3 / 3 |
| close: style / layout / paint / raster | 3 / 1 / 7 / 13 | 3 / 0 / 3 / 2 |
| forced layouts in script, open / close | 10 / 11 | 5 / 3 |
| layers at m 0.5 / m 1 (est. MB) | 68 / 68 (342 / 366) | 82 / 82 (387 / 387) |

(`out/compositor-morph/em-C-775-…13-31-44…json`, `em-CM12-775-…13-32-14…json`, v1.2 before the end fix; the end
fix adds one Svelte update at m 1 only.) CM keeps ~14 more layers (+~44 MB est.) while the morph stands.

### Simulator (WebKit, iOS 26.5, rAF-stepped, `gates/cm-sim.mjs`, counts only, one run per arm)

| phase | C = v9-final | v1.1 (P-157 build) | v1.2 | v1.2 + end fix |
|---|---|---|---|---|
| open (40-41 frames): paints / kpx / layouts / styles | 559 / 45495 / 181 / 91 | 193 / 13213 / 138 / 86 | 179 / 12755 / 136 / 79 | 145 / 10917 / 125 / 68 |
| close (40 frames): paints / kpx / layouts / styles | 505 / 42765 / 174 / 60 | 114 / 13532 / 123 / 90 | 120 / 13367 / 116 / 92 | 88 / 11462 / 119 / 74 (39 frames) |
| layers after open | 44 | 56 | 56 | 56 |

v1.2 is at parity with v1.1 (the gain on the phone, P-157, was measured on v1.1), and paints about a third of C.

### Forced layouts by stack (Simulator, WDA finger strokes, `out/cm/lay/lay-sim.mjs`, one session per arm)

| arm | frames | layouts | inside script |
|---|---|---|---|
| HSC = v9-final+7d | 907 | 656 | 399 |
| HS = v9-final+7d + hit-skip (`fixes/hit-skip/`) | 939 | 621 | 302 |
| V12 = CM v1.2 | 934 | 547 | 314 |
| V13 = V12 + no `window.scrollY`/geometry reads in `__msTick` (attribution arm, `out/cm/V13`) | 953 | 483 | 181 |

V12's largest stack left is `__msTick` 14295 (`window.scrollY`, 119 calls with work, 64 of them forced Layout): WebKit
lays out on a `scrollY` read whenever scrollY != 0 (CONFIRMED: Source/WebCore/page/LocalDOMWindow.cpp 1477-1481,
safari-7624.5.1.11-branch, `updateLayoutIgnorePendingStylesheets`). V13 passes the engine's y into `__msTick` and
caches the geometry (cleared by the existing ResizeObserver): 64 fewer forced layouts, 133 fewer inside script. It is
the next less-work candidate, a separate delta, not part of this proposal.

### Pixels

Chrome, PR-010 multi-pair (A, V, A2, V2), A = v9-final. Two capture paths:
- `Page.captureScreenshot` (3x): at m 1 it showed transparent (alpha 0) bottom card corners, 1282 px, in V only,
  switching on and off between repaints. The screencast frame of the same state (`Page.startScreencast`) was clean
  (corners = page background), see "Corners" below. So the gate now uses `--capture screencast`.
- Screencast frames come out at 1x (430x932) even when 3x is asked for (headless Chrome, OBSERVED), so they are scored
  against the screencast A/A floor, which was 0 % over 8 at every stop (A vs A2 and V vs V2).

A~V share of pixels over 8 levels (consistent in all four cross pairs; screencast, 1x):

| stop | pre | 0.02 | 0.05 | 0.1 | 0.15 | 0.19 | 0.25 | 0.4 | 0.5 | 0.54 | 0.6 | 0.8 | 0.95 | 0.99 | 1 | down 0.5 | 0.1 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| % | 0.02 | 3.07 | 0.72 | 0.98 | 1.54 | 0.81 | 0.56 | 0.80 | 0.71 | 1.00 | 1.95 | 4.42 | 6.90 | 3.02 | 1.99 (0.19 by a jump) | 0.64 | 0.94 | 0.16 |

What differs, in plain words: in the early morph (m 0.02-0.4) the nav bar's top-left (logo and pill edge) is drawn
slightly differently; from m 0.8 on the whole card's content sits up to ~1 px off and the blurred photos behind it
differ a little. At m 0.8 (3x screenshot): 3.2 % of pixels differ by more than 8 levels, 0.93 % by more than 64, 0.32 %
by more than 128. So CM is not pixel-identical; it is a proposal for the user to judge (Try-it), not an illusion fix.

The m 1 cell depends on how the page gets there (Chrome only):
- After a jump straight to m 1 the frame differs from today by 0.19 %; after scrolling up through 0.95 and 0.99,
  by 1.99 %, on text edges (title, countdown, buttons, footer).
- A dump of every element in the nav (computed transform, translate, opacity, filter, rect, animations) is the same on
  both paths except two hidden (display:none) columns. So it is not a style or DOM difference.
- Code lead (chromium main 39d5b374, read via gh): cc keeps a layer's raster scale and raster translation while its
  transform animates ("Keep the non-ideal raster translation unchanged for transform animations to avoid
  re-rasterization during animation", cc/layers/picture_layer_impl.cc 1120-1123; maximum animation scale 1257-1269).
  A scroll-driven animation never finishes, so text rastered at m 0.95 is kept at m 1: OBSERVED + code lead,
  UNRESOLVED as the cause.
- Safari (Simulator, the same slow path, `out/cm/pxSimPath`): 0.108 % vs today at m 1, the same as a straight jump
  (0.068 %). Chrome/Android-only look issue; a possible later remedy (not in this build): let the layer re-raster once
  m rests at 1 (e.g. drop the transform animation's layer hint there).
- The end fix changed nothing below m 1: the frames before and after it are equal at m 0.95, 0.99, 1 (jump) and down
  0.5 / 0 (max 0-2 levels), and at down 0.1 within its V/V noise (0.04 %).

### Corners at m 1

- Chrome `captureScreenshot`: 1282 alpha-0 px at the bottom card corners; turned on and off by unrelated repaints
  (toggling `--morph`, the panel filter, u3's backdrop-filter; none decides it). Screencast frame of the same state:
  0 non-opaque px, corners = page background (`out/cm/pxEP4`). OBSERVED, one headless run.
- Code lead (chromium main via gh, read by map-cm-chromium-src, no commit pinned): `captureScreenshot` is a forced
  redraw plus surface copy (content/browser/devtools/protocol/page_handler.cc ~1420/1630,
  render_widget_host_impl.cc 2371-2400), not the scanned-out frame; the only clears are `ClearOutsideBackdropBounds`
  for backdrop-filter quads (components/viz/service/display/skia_renderer.cc 964-1010, clear TRANSPARENT 975-981,
  rounded bounds 870-881). With the rounded `.fw-cm-c` clippers as the backdrop bounds this would erase outside the
  rounded rect if the backdrop layer misbehaves: UNRESOLVED (inference). It fits V12nr (clipper radius 0): 0 alpha px.
- Safari (Simulator, `out/cm/pxK12s`): clean, A~V = 0 px over 8 in a 40x45 css px box at each bottom corner; whole
  frame 0.068 %.
- F-309's corner part (backdrop clipped by the outermost rounded clip) is REFUTED as the cause (the corners are a
  capture-path effect). Known issue in the proposal: "Chrome screenshot-only artifact; the displayed frame is clean".

## CM in v10 (PR-030 accepted by the user 15:49Z; integration with int-v8)

- `cm-on-v10.diff`: CM v1.2 cut against v10's V (61257aa0969a / fb9f6aa28ad4) → JS a33a6c7c1f2b, CSS 62743920fe1a
  (int-v8's "new V", byte-equal). Three decisions:
  - CM's own hit-test skip is dropped: hit-skip's `!(__msOn && __msP > 0.2 && r > 0.2)` covers it (`__cmSup` needs
    `__msOn`).
  - P1's reveal and P1b (a)'s size probe stay off where CM runs: `__rvW` and `__rvSzInit` check `html.fw-cm` (CM's
    locals are not visible there; `__cmMq` and `__rvMq` are both `(width <= 640px)`, so exactly one of the two runs).
  - nolift: CM's `v.earn` loses its `translateY(-8e)` (it was written inline and into the generated keyframes, so it
    brought the 8 px rise back over nolift's CSS).
  - pause (c) and I-219: no interaction found.
- The morph driver (M, `__fwMorphDrive`) does not drive CM: it tweens x with `E()` at a fixed bottom scroll, never calls
  `__cmSet` / `__cmPrep`, and CM's keyframes stay at progress 1. No user path calls `E()` in 7c mode (`N()` arms wheel
  and touch only when `!__msOn`). M-driver frames on a CM build (fix-end-morph's pfa runs, 15:36-15:38Z) are not
  evidence about CM; use S, W or G.

### The first-open frame and (c1)

- P-157 G runs (CM v1.1, Timeline on, `out/cm/openframes.mjs`): every V run has one 79-82 ms frame at m ~0.06, the first
  open of the page load. In EV1: the open frame runs 45 ms of script in the shared scroll rAF dispatcher `iE` (JS 2705),
  in which a `getBoundingClientRect` forces a 27 ms style recalc and a 7 ms layout; the next frame has 27 ms of style
  and 31 ms of composite. The first open is also where CM generated its keyframes and read the logo width and bar
  inset. Later opens: 38-50 ms, with a 14-17 ms forced layout in the same place. C's opens: 10-48 ms, no such frame.
- (c1) `c1-on-cm-v10.diff` (JS b8b194b7ff56, CSS 62743920fe1a): once the page has been still for 300 ms after load and
  the panel has mounted, read the logo width, bar inset and column offsets and generate the keyframes (`__cmWarm`,
  a passive scroll listener and a timer, both removed when done or on teardown); `__cmPrep` keeps reading what is
  missing (the fallback). The logo width is intrinsic and the inset depends only on the viewport, so the values equal
  what `__cmPrep` read.
- Simulator, cold (the timed open is the first of the load; `cm-sim.mjs --cold`), new V vs c1: keyframes before the
  open 0 / 39155 chars; first open frame 36 paints 2765 kpx (30 / 2657 in a second run) vs 12 paints 1122 kpx (as any
  later open); open phase 197 / 13681 vs 185 / 13330 paints / kpx; rest and close equal.
- Pixels, Chrome screencast, 4 loads: 0 % at pre, 0.02, 0.5, 1, down 0 (T0).
- (c2), deferring CM's inline writes to a microtask after the dispatcher's reads, was tried and dropped: forced
  layouts and styles did not change (Simulator, `forced L/S`). The forced reads per frame come from outside CM (`n` at
  JS 13330, once per frame; `__msTick` at 14307, 31 per open; `F` at 13864/13867), the V13 item.
- In int-v8's v10 block as arm D (lead, 16:3xZ).
- Rest at m 1 restyles every frame (Simulator restOpen: 72 styles in 72 frames). CM's scroll-driven animations are
  finished there; the running animations at rest are 4 time-based ones: the panel's three column marquees
  (`start-selling-morph-col-up/down`) and the hero's orbit (`hero-cta-orbit`, offscreen). Which one restyles:
  UNRESOLVED; decisive check: a rest probe pausing each in turn.

### Gate change (`gates/cm-sim.mjs`)

`--cold` (no warm-up open; the walk stops two screens before the end), `--stack N` (Timeline call stacks N deep;
forced Layout / RecalculateStyles records counted per phase by their script frames, `forcedBy`), per-frame forced
counts (`fLayouts`, `fStyles`: nested in a script record), the first three frames per phase in the log, the running
animations after each rest phase, and the keyframes' size before the timed phases.

### V13 on v10 + c1 (less-work candidate; `v13-on-c1.diff`, JS a769bb169c4a)

Read sites forced inside script (Simulator, `cm-sim.mjs --stack 6`, open / close phase of 40 frames, v10 + c1):

| site (V JS line) | what | forced per phase |
|---|---|---|
| `n` 13329-13330 (#platform shrink, scroll engine callback) | `c.getBoundingClientRect()` every frame; on phones only `a > 0.04` (is-platform-shrinking) is used | 38-39 L, 11-23 S |
| `__msTick` 14307 | `window.scrollY`, `offsetHeight`, `scrollHeight` (V13 removes them) | 31 L |
| `F` 13864/13867 (nav hit test) | `getBoundingClientRect` + `elementsFromPoint` (hit-skip covers m > 0.2) | 8-12 L, 7-10 S |
| `a` 3301 (approach only) | card geometry | 17 L |
| no JS frame | style recalcs started by the engine | 39 S |

V13 (y from the nav's scroll listener, `__nsY`; geometry cached, cleared by `__msRO` and an innerHeight change): forced
layouts open 94 -> 61, close 85 -> 52; total layouts 139 -> 135, 121 -> 117 (one session each: the layout moves to `n`'s
read rather than going away). Pixels, Chrome screencast, 4 loads, 8 stops (pre .. down 0): consistent 0 everywhere (T0).
The next read to remove is `n` (on phones a boolean crossing, which an observer could give).

### Rest at m 1 restyles every frame: CM's scroll-driven animations

- Simulator rest probe (`--rest-pause`): pausing the 4 running time-based animations (3 panel marquees, the hero
  orbit) leaves 72 style recalcs in 72 frames; the invalidations carry no script stack.
- WebKit (main b4363b9b3694, Source/WebCore/animation/ScrollTimeline.cpp `documentWillUpdateAnimationsAndSendEvents`,
  ~line 291): a scroll timeline whose source is connected asks for an animation update on every rendering update,
  scrolled or not. Code lead + OBSERVED: with the pf candidate below (one scroll-driven animation on #platform for the
  whole page) rest at m 0 went from 3 to 96 style recalcs in 96 frames.
- Cost on the phone (P-157 G runs, Timeline durations, frames resting at m 1): style 0.72 ms per frame with CM vs
  0.15 ms with C (2005-2025 frames per run). Small against a 16.7 ms frame; a remedy (static values and no animations
  while resting at 1) would cost an open-like frame on every leave from 1. Not pursued now.

### Candidate 2 (#platform's fade on the scroll timeline, `out/cm/v10pf`): does not pay as built

Keyframes `fw-cm-pf` on `--fwms` (blur 12 px x m / 0.55, opacity min(1 - m / 0.55, 0.9999)), S() skips the
`--morph-fade` write where CM runs. Pixels T0 at 10 stops (Chrome screencast). Simulator: style recalcs open 89 -> 77,
close 68 -> 54, but #platform is still repainted (44 -> 48 paints in the open: the filter animation is not composited
there) and rest at m 0 goes from 3 to 96 style recalcs and 1 to 48 paints (the scroll timeline above). A variant that
attaches the animation only while the morph is live would keep the ~12 saved recalcs per open and no paint gain. Parked.

## P-158 card: v11 vs C, slow frames on CM threshold crossings in a fast short swipe (pre-data)

Ticket P-158, signed by the lead 2026-10-07 00:5xZ (issue loop on v11, user report 2 "fast-swipe lag"). Written
before any P-158 data; the commit time of this section is the pre-data time.

| item | value |
|---|---|
| question | in a fast short swipe (G, `fixes/morph-scroll/g-fastshort-v1.json`, compiled program 8737f212c0ff), does v11 have more slow frames than C on the frames that cross a CM threshold? |
| arms | C = v9-final rev 7d as in int-v11's snap, JS 1b2eecc66011 / CSS e1359ab9994a; V = v11 (Vc + V13 + H1c), JS 9b4a829d15a0 / CSS 62743920fe1a. Snapshot out/cm/snap11 (copy of int-v11's arms), HASHES 4b9448f985b1, checked before every hold |
| profile | xcode-serious; `CM_COOL=0` (no cooling wait); the end sentinel S1 decides validity |
| kit | `fixes/compositor-morph/phone-v11/` (cm-serve.sh, cm-hold.sh, cm-block.sh: copies of `phone/` with the pins above) |
| order | H1:WC H2:WV (uncounted warm-ups, one per arm's port) H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 (C V V C C V V C, Timeline on) H11:TAIL (at most 2 RERUN-NEEDED runs once each, then S1) |
| command | `CM_TICKET=P-158 CM_COOL=0 node tools/lock.mjs run iphone --owner arch-compositor-morph --block P-158 --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone-v11/cm-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL` |
| pre-data check | Simulator start state per arm (`sim.mjs gesture … --count-only`, shared lane, weight simulator): start m, order of opens/closes, settle ys, moving frames; `p158-read.mjs --start-state`. Arms must agree on start m and event order |
| reader | `node fixes/compositor-morph/phone-v11/p158-read.mjs out/cmp11/runs` (selftest: `--selftest`, 6 checks) |
| metric | per counted run, segment 0: moving frames whose (m_prev, m] crosses 0, 0.08, 0.2, 0.35, 0.4, 0.55, 0.92 or 1 (m = (y - (docH - 2 ih)) / ih); share with dt > 50 ms, twins > 46 / > 54 (> 34 with > 30 / > 38 and the non-crossing frames are descriptive) |
| decision | per T in {50, 46, 54}: "le" when V's median share <= C's; "worse" when every V run > every C run (>= 3 valid runs per arm); else "open". (a) le at all three: the lag is the gesture, start the cheaper-flip fix for a later build. (b) worse at all three: the lead re-rules v11X; v11-nw stays the landing gate. (c) anything else: threshold-sensitive / insufficient; reported, no second block without the lead's OK |

**Prediction (frozen).** (a) or (c), not (b). Basis: the same reader on P-157's runs (C vs CM v1.1, same gesture,
same profile) gives crossing n 186-194 per run, > 50 shares C 0.0155-0.0323 vs V 0-0.0212, > 46 C 0.0207-0.0376 vs
V 0.0156-0.0313, > 54 C 0.0106-0.0269 vs V 0-0.0156: VERDICT 50 open (V median 0.0207 vs C 0.0184), 46 le, 54 le,
decision (c). v11's parts (CM, V13: no forced read in the morph tick) only remove main-thread work on those
frames, so I expect V's medians at or below C's at 46 and 54, and the > 50 column to sit within one frame
(1/190 = 0.0053) of C's. One slow frame per run moves a share by 0.005, so (c) through a single-frame tie at 50 is as
likely as (a).

Context added after the pre-data time (2026-10-07, lead FYI from the user's thread T-228 #11; changes neither the
question nor the decision rules): the user swiped v11 "really hard" as a stress test, so the user's own gestures
differed between the two builds. This supports the reading that the reported fast-swipe difference came from the
gesture, not the build; P-158 tests it with the identical G gesture on both arms.

**Pre-data amendment (2026-10-07, lead's condition on the accepted start-state check; no P-158 data exists yet).** The
Simulator start-state check (count-only, one session per arm) matched starts, stroke order and settle ys, but momentum
flings differed (C 2, v11 5). So:
- The reader splits the crossing frames by finger state: **finger-down** (frame stamp between a touch start `s` and the
  next end `e` or cancel `c` in `touches`) and **momentum** (after lift), and reports both plus the pooled number.
- The (a)/(b)/(c) rule applies to the **finger-down** crossing frames first (`VERDICT` line); the pooled and momentum
  verdicts are reported beside it and decide nothing.
- **Driver difference:** when the arms' median momentum crossing-frame counts, or median fling counts
  (`summary.momentum.flings`), differ by more than 2x, the result is reported as a driver difference, not a build result.
- Reader: `p158-read.mjs` (selftest 8 checks: the split and the driver flag added).

Prediction under the amendment (frozen with it): on P-157's runs the split gives about 75 finger-down and 115 momentum
crossing frames per run; finger-down > 50 shares are 0 in 7 of 8 runs (EV3 0.0132, one frame), momentum > 50 shares C
0.026-0.054 vs V 0-0.035, momentum ratio 1.02, flings ratio 1 (no driver difference). Finger-down VERDICT on P-157:
50 le, 46 open, 54 le, decision (c). For P-158 I expect the same picture: finger-down slow frames at or near 0 in both
arms, so the decision is (a) or a single-frame (c), not (b); the slow crossing frames sit in momentum, where v11 is not
above C; no driver difference on the phone (G is the same program on both arms).

**Pre-data amendment 2 (2026-10-07, lead, user T-228 #15: no manual Xcode steps; no P-158 data exists yet).** P-158
runs under the **tool-held** thermal condition, profile **`tool-serious`** (never pooled with xcode-serious):
- `cm-block.sh` with `CM_THERMAL=serious`: inside the phone hold, `node tools/thermal.mjs set serious` runs in the
  background for the whole part (I-199 stage 3), the part waits for its `SET` line, then `iphone.mjs preflight --settle
  120`; the exit trap kills the set (the condition ends with its connection) and parks Safari. Xcode's condition is never
  touched. The hold logs' PIN line names the profile (`CM_PROFILE=tool-serious`).
- The start gate stays `thermal-gate.mjs --expect serious --accept-induced --max-c 44` (the instrument's "induced"
  covers the tool's condition too). A start gate that reads **Critical** on a cool phone (I-225): the part re-arms by
  itself, no user step: kill the set, `thermal.mjs clear`, a plain read (`--expect fair --no-timer`) once a minute until
  Nominal/Fair (at most 10), set serious again, settle 120 s, and the hold runs once more (`iphone.mjs rearm` replaces
  this when ts-i225 lands).
- Block command: `CM_TICKET=P-158 CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner
  arch-compositor-morph --block P-158 --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone-v11/cm-block.sh
  H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL`.
- Question, arms, order, reader, decision rules and prediction are unchanged.

**Pre-data amendment 3 (2026-10-07, lead; mechanics only, no P-158 data yet).** The re-arm uses `iphone.mjs rearm`
(I-225, 9c644179), and it is the **only owner of the condition**: the block no longer starts a `thermal.mjs set` of its
own. At the part's start (after `iphone.mjs preflight`) and once more when a hold's start gate reads Critical, the
block runs `iphone.mjs rearm --owner arch-compositor-morph --settle 120` (it clears, waits for a plain Nominal/Fair read,
starts its detached `set serious`, settles, reads the profile; exit 0 cleared or not needed, 8 still Critical or misfit,
13 timeout: the block stops and reports). `FW_PHONE_CONDITION=tool` for the whole part, so no gate posts an Xcode step;
the exit trap runs `thermal.mjs clear` at the part's end. Profile, question, arms, reader and decision rules unchanged.

**Restart (2026-10-07, lead ruling (a); before any counted data).** The first start (03:06Z) found Xcode's condition
still on: `iphone.mjs rearm` read a fitting Serious phone and returned `REARM NOT-NEEDED` without setting ours. The
block was stopped before H1 ran (warm-ups discarded, no runs). `thermal.mjs clear` (exit trap) printed NONE while
`thermal.mjs status` still showed the condition ACTIVE (OBSERVED, in our setup), so a detached `thermal.mjs set serious`
inside the phone hold (03:09:40Z) took the condition over (HOLDER `thermal.mjs set`, owner arch-compositor-morph).
The block was restarted from H1 at 03:10Z; its rearm read a fitting phone (NOT-NEEDED) and set nothing, and H1's start gate read
Serious, induced, battery 36.3 C, PASS. Every hold of the restarted block therefore ran under the tool-held condition
(profile tool-serious in every PIN line). The tool's REARM and GATE texts say "induced by Xcode" / `xcode-serious`
whoever holds the condition (fixed labels, `tools/lib/thermal-profile.mjs:56,70`); the holder record is the evidence.
Follow-up for ts-i225 (sent to the lead): under `FW_PHONE_CONDITION=tool` rearm should refuse NOT-NEEDED for an
induced condition that has no holder of ours.

## P-158 results (iPhone 15 Pro Max, G driver, tool-serious, Timeline on; 2026-10-07 03:10-03:54Z)

- Holds H1-H9 VALID (warm-ups WC, WV; counted EC1-EC3, EV1-EV4), every start and end gate PASS. H10 (EC4) VOID: its
  end gate read Critical at battery 42.0 C (start 41.7 C), real heat after ~45 min of back-to-back gestures (36.4 ->
  42 C), not I-225's cool-phone Critical. The block stopped there: TAIL did not run. The exit trap cleared the
  condition and parked Safari.
- Caveats (lead ruling 2026-10-07 ~04:00Z): **end sentinel not run (heat ceiling at H10)**: a gap, not a failure; every
  per-hold gate passed, so H1-H9 stand and nothing is voided. H10/EC4 stays VOID, no top-up, no more phone time on
  P-158. Nothing lands on this verdict (v11 already waits on c2 for its first open).
- Reader: `p158-read.mjs out/cmp11/runs --runs EC1,EC2,EC3,EV1,EV2,EV3,EV4` (3 C vs 4 V, the >= 3 rule holds).

| finger-down crossing frames, share | C (EC1-3) | V = v11 (EV1-4) |
|---|---|---|
| > 50 ms | 0, 0, 0 | 0, 0.0135, 0, 0 |
| > 46 ms | 0, 0, 0 | 0, 0.0135, 0.0133, 0 |
| > 54 ms | 0, 0, 0 | 0, 0.0135, 0, 0 |
| > 34 ms (descriptive) | 0.016, 0.026, 0 | 0.065, 0.095, 0.067, 0.092 |

- VERDICT (finger-down, decides): 50 le, 46 open, 54 le: **decision (c)**, as predicted ((a) or (c), not (b)).
  Pooled and momentum (decide nothing): 46 worse, 50 open, 54 open. DRIVER: none (momentum ratio 1.01, flings 1.5).
- Descriptive, OBSERVED (n 3 / 4): at > 34 ms every V run is above every C run on the finger-down crossing frames
  (about 5-7 frames per run in the 34-50 ms band vs 0-2). v11's flip frames under the finger are slower than C's but
  rarely over 50 ms; the same direction as int-v11's first-open finding (rAF script + style on the flip frames).
- The > 34 ms band goes into the c2 card as a secondary, descriptive check (lead): v11+c2's finger-down 34-50 ms
  crossing share vs C, with the table above as the before (OBSERVED, n 3 / 4).

## The Join button at m 0.2 (issue loop T-228, PR-032)

- What happens there (v11 JS 14035-14072, CSS 11961-12045): `.is-earn-hidden` turns on at m >= 0.2 and off only at
  m <= 0 (hysteresis). On the flip, nav-earn rev 3 (PR-021 rev 3, T-158) plays the original's 0.68 s
  cubic-bezier(0.33, 0, 0.2, 1) geometry as Web Animations (button translate, pill clip-path, language-switch
  translate) and the button's CSS opacity transition runs (0.32 s after 0.12 s; 0.2 s into the hero pill at the top).
  Under CM the button's blur (0 -> 10 px over m 0..0.2) and EN's 4 px nudge follow the scroll (`v.earn`, `v.lang`).
- PR-032 rev 1/2 (`fade-on-v11.diff`): opacity and EN's slide on the scroll timeline (finger-driven, like v0's CSS).
  Rev 2's premise "the pill vanishes in one step" was **wrong**: it came from resting shots 900 ms apart, not frames.
  The user asked for no finger-driven fade (changes requested 03:13Z: a state-started fade like the top of the page).
- **Rev 3** (`fade3-on-v11.diff`, JS bc6215f5f8e0 / CSS 97b0d77fe66e, on v11): nothing on the button follows the
  finger. Under CM at phone widths: no `earn` / `lang` keys; on the flip the button fades opacity and blur (0 <-> 10 px)
  on its CSS transitions (0.32 s after 0.12 s, the button's appear transition), the pill keeps its shape and place
  (no clip-path, no button translate), EN slides by the button's width + the 4 px gap on nav-earn's 0.68 s timer
  (`__ewGo`, translate only). `will-change: opacity, filter` keeps the button on its own layer. Hysteresis unchanged.
  Reduced motion: no transitions, no blur (as before).
- WebKit acceleration (CONFIRMED): Source/WebCore/css/CSSProperties.json at 0a254e20987b marks opacity (7590), filter
  (10836), transform (12787), translate (12935) "animation-wrapper-acceleration": "always"; clip-path (4318) has none.
  KeyframeEffectStack.cpp allowsAcceleration (215-283) runs the stack accelerated unless an effect prevents it, and an
  effect with no accelerated property does not (KeyframeEffect.cpp preventsAcceleration 2052-2053).
- Frame check (`gates/fadeframes.mjs`: Chrome 430x815 DPR 3, per-rAF computed values + every screencast frame;
  `gates/simfade.mjs`: Simulator, per-rAF values; arms A = v11, B = rev 3, plus C in Chrome): the opacity change runs
  +133 -> +433 ms after the crossing in every arm (timed in v11 too); v11's blur jumps to 10 px at the flip and follows
  the scroll below 0.2 (7.5 px at m 0.15), B's blur moves with the opacity; EN 0 -> 110 px (v11), 0 -> 114 px (B). A
  0.22 / 0.18 wiggle (120 ms steps) never shows the button again in any arm. 0 reversals in every phase and arm for
  opacity, blur, EN and (Chrome) the region's luminance (tolerance 0.5): no frame lighter or darker than the fade curve.
  C's one-off Simulator flash (simstep, 01:2xZ) did not show in Chrome's frames.
- Counts, 3 runs per arm (A1 / A2 = the A/A pair):

| | v11 (A1 / A2 / A3) | rev 3 (B1 / B2 / B3) |
|---|---|---|
| Chrome, styled elements per frame, open / close | 43 43 43 / 32 32 32 | 36 35 42 / 29 29 29 |
| Chrome, paints per frame, open / close (median) | 3 3 3 / 3 3 3 | 3 3 5 / 3 3 3 |
| Chrome, layout per frame | 0 | 0 |
| Simulator, paints open | 193 / 190 / 175 | 137 / 142 / 122 |
| Simulator, layouts open | 137 / 138 / 139 | 128 / 140 / 132 |
| Simulator, paints close | 86 / 86 / 87 | 92 / 111 / 82 |
| Simulator, layouts close | 114 / 114 / 117 | 114 / 121 / 122 |
| Simulator, Join button paints open / close | 17 17 24 / 14 11 8 | <= 5 (not in the top 8 painted layers) / 2 2 2 |

- Reading: Simulator open paints are lower in B (ranges apart; A/A 193 vs 190): the button repaints far less during
  the open (v11's scroll-driven blur repaints it, 17-24 per open). Close paints and layouts overlap: within noise.
  Chrome: same layout (0) and paints; B3's open (5 paints, 8 rAF) is one outlier. Host load was high during the
  Simulator runs (load1 up to 105). OBSERVED, counts only, no timing.

## c2 on v11: each open from closed (lead 04:1xZ; int-v11's brief; `c2-on-v11.diff`)

Build `out/cm/c2` = v11 (JS 9b4a829d15a0 / CSS 62743920fe1a) + c2: JS 59b07dadb99c, CSS unchanged. Two parts:

- **(ii) No forced hit test in the open frame on the CM path.** v11's tick re-tests the nav backdrop after every write
  that brings m to <= 0.2: `queueMicrotask(() => z(g, F()))` (JS 14434). On the open from closed that microtask runs
  right after `__cmSet`'s class and keyframe writes, so `F()`'s `getBoundingClientRect` forces the style (206 elements)
  and the layout (421 dirty) of the new morph state inside the tick. c2 calls `__cmReTest()` there instead (CM path
  only; the non-CM path keeps the microtask). It sets `__nsForce` at once and runs the same `z(g, F())` in the next
  frame's rAF, at most one pending (`__cmRT`), guarded by `__navNode()?.isConnected` and cancelled in the teardown.
- **(i) Memo for `__cmGen`.** `__cmPrep` calls `__cmGen()` on every open from closed. c2 keys the grid (`W|H|L|ix|cols`)
  and returns early when the key is unchanged, so an open from closed no longer rebuilds the ~39 KB keyframe text.

### Gates (no timing verdicts)

- **Class parity, Chrome** (`out/cm/c2trace.mjs`, 430x815, touch held, a one-frame m sequence across 0 / 0.08 / 0.2 with
  wiggles, 237 frames): v11 vs c2 0 frame-class differences (is-on-dark, is-morphing, is-earn-hidden, is-expanded,
  is-hero-pill); v11 vs v11 0. is-on-dark was 1 in every frame in both arms, which is why the coverage check below exists.
- **First open, Chrome** (int-v11's `fixes/v11/first-open.mjs --cold`, 430x775, 6x):

| open frame 1 | v11 | c2 |
|---|---|---|
| open1 frame span | 118.45 ms | 51.39 ms |
| open1 FunctionCall | 97.4 ms | 12.5 ms |
| open1 forced style | 206 elements, 21.85 ms (F < microtask 14435) | 7 elements, 1.56 ms (__nsOnScroll) |
| open1 layout | 421 dirty, forced by F | 421 dirty, in the rendering step (not forced) |
| open2 frame span | 115.4 ms | 48.5 ms |

  The deferred test lands in the next frame (forced style 12 elements, about 1.2 ms).
- **Simulator** (`cm-sim.mjs --cold --stack 6`, iOS 26.5, 3 runs per arm interleaved, one session each; counts only;
  sim background mean 6-78 % of a core, load1 up to 66):

| per phase | v11 (A1 / A2 / A3) | c2 (B1 / B2 / B3) |
|---|---|---|
| open, forced style | 64 / 63 / 60 | 48 / 58 / 42 |
| open, forced layout | 57 / 57 / 57 | 55 / 59 / 62 |
| open, first frame forced layout | 4 / 4 / 4 | 2 / 2 / 2 (B3: the second frame) |
| open, paints | 178 / 171 / 160 | 160 / 184 / 189 |
| open, layouts | 126 / 130 / 128 | 129 / 135 / 135 |
| close, forced style / layout | 65 / 49 / 69 ; 52 / 62 / 50 | 47 / 61 / 59 ; 58 / 47 / 50 |
| approach, paints | 165 / 208 / 212 | 205 / 208 / 168 |

  Forced style in the open is lower (ranges apart): F's forced style left the tick (`S F@13961 < microtask 14434`,
  6-8 per open in v11, 0 in c2). F's layouts now sit in the rAF test (`L F < rAF 14467`, 15-16 per open, against 13 F
  layouts in v11): same work, moved to the start of the next frame. Everything else within the A spread. OBSERVED,
  counts only.
- **Coverage of the one-frame-late re-test** (lead's caveat; `out/cm/c2cover.mjs` + `c2cover-read.mjs`, Chrome
  430x775 and 430x815, shared lane, arms v11 and c2). c2 changes when the nav colour is decided after an m <= 0.2 write:
  the next frame instead of the same one. The probe replicates `F()` exactly (probe point, nav skip rule, dark lists, JS
  13929-13967) and walks every scroll position where the re-test can fire, 4 px steps from endStart - 2 ih to endStart
  + 0.2 t, down from closed and up from m 0.6 (panel back from open), settling two rAFs at each:

| | 775 | 815 |
|---|---|---|
| F() from the flip to endStart + 0.2 t | 1 at every position, both walks, both arms | 1 at every position, both walks, both arms |
| the only flip (commission-card -> platform-card) | 1146 px above endStart (1.48 ih) | 1106 px above endStart (1.36 ih) |
| v11 vs c2, same-y positions / F differs | 854 / 0 | 898 / 0 |
| F() != the is-on-dark class | 0 | 0 |

  The probe point always hits page content, never the morph panel, so an m write can't change the answer; only y can.
  A re-test fires only for m <= 0.2 writes: inside [endStart, endStart + 0.2 t], plus the one frame that leaves the zone
  upward. Reaching the flip from there in one frame takes a step of more than 1100 px; the largest per-frame step in
  every P-158 G run is 298 px (EV2, an 86 ms frame). Flips far above are caught by `_()`'s edge test (`__nsCross`),
  unchanged. So the shown colour is constant wherever the deferral applies (OBSERVED in Chrome's layout of the frozen
  snapshot; the lead accepted it 04:4xZ as closing the caveat; no screencast compare needed).

## P-159 card: v11+c2 vs C, first open and each open from closed (pre-data)

Ticket P-159, the lead's word 2026-10-07 04:4xZ (less-work landing rule: cost counts plus a short phone no-worse check).
Written before any P-159 data; the commit time of this section is the pre-data time.

| item | value |
|---|---|
| question | is v11+c2 no worse than C on the first open after load and on every open from closed, under the finger? |
| arms | C = v9-final rev 7d, JS 1b2eecc66011 / CSS e1359ab9994a (the same file as P-158's C); V = v11+c2, JS 59b07dadb99c / CSS 62743920fe1a. Snapshot out/cm/snap159 (C and P copied from out/cm/snap11, V from out/cm/c2), HASHES a853ddc82ce5, checked before every hold |
| driver | G fast-short, `fixes/morph-scroll/g-fastshort-v1.json`, compiled program 8737f212c0ff (the program behind v11-nw's Pr1 and P-158's open-from-closed line-up); Timeline on in every counted run |
| profile | tool-serious: `CM_THERMAL=serious`, `iphone.mjs rearm` at the part's start owns the condition (I-225, I-233, I-234 on main bd6d70fa), `thermal.mjs clear` in the exit trap; `CM_COOL=0`; start and end gate per hold (`--expect serious --accept-induced --max-c 44`) |
| kit | `fixes/compositor-morph/phone-c2/` (cm-serve.sh, cm-hold.sh, cm-block.sh: copies of `phone-v11/` with the pins above; p159-read.mjs) |
| order | H1:WC H2:WV (uncounted warm-ups, one per arm's port) H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 (C V V C C V V C) H11:TAIL (at most 2 re-runs, then the end sentinel S1 on C) |
| heat | P-158 reached Critical after about 45 min of back-to-back gestures. A hold that reads Critical stops the block (after the kit's one re-arm at a start gate); then the block is read with what it has if each arm has >= 3 valid counted runs, no top-up. Park Safari after the block |
| command | `CM_TICKET=P-159 CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner arch-compositor-morph --block P-159 --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone-c2/cm-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL` |
| reader | `node fixes/compositor-morph/phone-c2/p159-read.mjs out/cmp159/runs` (selftest 8 checks); a run counts only when its hold log ends VALID |
| metrics | O1.f2 = p153-read's firstOpen (the first open after load, f2 as nw11-read's Pr1). Open-0 frames = finger-down moving frames whose m ((y - (docH - 2 ih)) / ih) goes from <= 0 to > 0: per run n, median dt, share > 34 with twins > 30 / > 38 (> 50 descriptive) |
| decision | D1: median V O1.f2 - median C O1.f2 <= +4 ms. D2: median of per-run open-0 median dt, V - C <= +4 ms. D3: per T in {34, 30, 38}: "le" when V's median open-0 share <= C's, "worse" when every V run > every C run (>= 3 valid runs per arm), else "open". **PASS**: D1 and D2 within +4 ms and D3 "le" at all three. **FAIL**: D1 or D2 over +4 ms, or D3 "worse" at all three. Anything else: **OPEN** (threshold-sensitive or insufficient), reported; no second block without the lead's OK |
| descriptive | P-158's finger-down crossing frames: the 34-50 ms band share (> 34 minus > 50) per run, against C here and against P-158 (C 0-0.026, v11 0.065-0.092) as the before; the success check for c2 is that it falls toward C's with no new frames over 50 ms |

Reader check on P-158's runs (C vs v11, before c2; the same program): D1 C 25 (25-25) vs v11 45.5 (43-48), +20.5;
D2 C 20 (18.5-20) vs v11 38 (29-40), +18; D3 worse at 34, 30 and 38 (C 0.11 vs v11 0.61 at > 34): DECISION FAIL. The
reader reproduces v11-nw's Pr1 failure and int-v11's line-up (C 20 vs v11 38 ms).

**Prediction (frozen).** PASS. Basis: c2 removes F's forced style and layout from the open frame (Chrome open1 118 -> 51
ms, FunctionCall 97 -> 12 ms; Simulator first open frame forced layouts 4 -> 2, open forced style 60-64 -> 42-58). On the
phone the open-0 FunctionCall was 20.7 ms in v11 vs 2.1 in C, with 15.7 ms of it layout (P-158 line-up); c2 moves that
layout into the rendering step of the same frame (dirty work done once, not forced twice) and the test itself into the next
frame's rAF, where the layout is clean. I expect O1.f2 and the open-0 median within 4 ms of C's, and the open-0 > 34 share
at or below C's at all three thresholds. Risk: the next frame now carries one F() (a clean layout read and a hit test,
about 1-2 ms in Chrome at 6x); if WebKit dirties the layout again before that rAF, the cost moves to f3 rather than
disappearing (visible in O1's f123, descriptive).

**Pre-data amendment (2026-10-07 04:5xZ, lead: the user accepted PR-031 X2 and PR-032 rev 3; no P-159 data exists
yet).** V becomes the build that would land, so one block covers it:
- V = **v12** = v11 + X2 + c2 + PR-032 rev 3, JS 807ea24c4bf5 / CSS a9a47b10326a, built by
  `fixes/compositor-morph/v12-build.sh` (deltas pinned: X2 `fixes/people-gpu/patch.diff` 24c2a1625316, c2
  `c2-on-v11.diff` 9e5d6780c85c, rev 3 `fade3-on-v11.diff` 21a4199bd6fc; patch -F 0; routes V11+X2+c2+rev3 and
  V11+c2+rev3+X2 give the same bytes; V11+X2 = int-v11's V11X pin 71ad4f9b82ac / 592d1f2a8af4; node --check ok).
- Snapshot out/cm/snap159b (C and P from out/cm/snap11, V from out/cm/v12), HASHES 48736dab87cf; the kit's pins
  (cm-serve.sh, cm-hold.sh) name it. C, driver, profile, order, heat rule, command, reader and decision rule D1-D3 are
  unchanged.
- Stack check against v11+c2 before the phone (see "v12 stack check" below): no new forced style or layout from stacking.
- Prediction unchanged (PASS). X2 (the People title slide) and rev 3 (the Join button's timed exit) remove work in
  their own areas; rev 3 removes the earn/lang keys from the CM keyframes and the button's scroll-driven blur, so the
  open frame does at most the same work as v11+c2's.

### v12 stack check (against v11+c2; 04:45-04:50Z, shared lane, counts only)

- Chrome class parity (`gates/c2trace.mjs`, 430x815, 237 frames): v11+c2 vs v12 0 frame-class differences.
- Chrome first open (`fixes/v11/first-open.mjs --cold`, 430x775, 6x, one run per arm): the same structure. Open1 frame 1:
  v11+c2 51.4 ms vs v12 55.5 ms (Paint 28.7 vs 38.2 ms, one run). Both have forced style of 7 elements from
  `__nsOnScroll` only, and 421 dirty in the rendering step. Open2 frame 1: 51.1 vs 52.5 ms. The keyframe text before
  the open is 39119 vs 38183 chars (rev 3 drops the earn/lang keys).
- Simulator (`cm-sim.mjs --cold --stack 6`, 2 runs per arm interleaved):

| per phase | v11+c2 (A1 / A2) | v12 (B1 / B2) |
|---|---|---|
| open, forced layout / style | 63 / 57 ; 60 / 56 | 57 / 57 ; 60 / 57 |
| open, first open frame forced layout | 3 / 2 | 2 / 2 |
| open, paints | 201 / 182 | 128 / 145 |
| open, layouts | 139 / 137 | 127 / 134 |
| close, forced layout / style | 57 / 42 ; 60 / 41 | 62 / 42 ; 64 / 41 |
| rest closed, paints / styles | 46 / 26 ; 56 / 31 | 3 / 13 ; 3 / 13 |

- Reading: no new forced style or layout from stacking. F's stacks are the same (rAF re-test, 6-8 + 6-8 per open).
  The open paints and the rest-closed tail are lower in v12: rev 3's button no longer repaints for its blur, as in the
  PR-032 counts. The close's forced layouts are 2-7 higher, inside the earlier v11 / c2 spread (47-62). Chrome's
  open1 Paint +9.5 ms is one run; Paint is not forced work. OBSERVED, counts only, no timing.

## P-159 results (iPhone 15 Pro Max, G fast-short, tool-serious, Timeline on; 2026-10-07 04:52-05:46Z)

**DECISION FAIL** (`node fixes/compositor-morph/phone-c2/p159-read.mjs out/cmp159/runs`). Prediction (PASS) missed.

Holds:
- The part's rearm cleared and set our condition (`REARM CLEARED`, holder thermal.mjs, battery 36.8 C).
- H1-H10 are VALID: warm-ups WC and WV, and every counted run EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4. Every start and
  end gate read Serious, induced. The battery rose from 36.8 to 41.7 C.
- **Runner stop (I-240):** the first runner was killed at 05:21Z by Claude Code's 30-min background limit. It was
  mid-gesture in H7, after H7's start gate passed. That H7 has no VALID line, so its EC3 was not counted. The exit
  trap did not run; our `thermal.mjs set` (pid 38363) kept the condition.
- The block resumed from H7 at 05:23Z with the same command and a 2 h timeout (lead OK). There were no extra warm-ups:
  the gap was about 2 min and the phone was warm. The resumed part's rearm read NOT-NEEDED (the condition was ours).
- The end sentinel S1 PASSED (55.6 fps, slow 0.028), but H11's end gate read Critical at 42.1 C, so hold H11 is VOID.
  This is the same as P-158's H10. The counted runs are not affected: their own holds ended VALID.
- The exit trap then cleared the condition and parked Safari. No `thermal.mjs set` process survives (checked after
  the block).

| per run | EC1 | EC2 | EC3 | EC4 | EV1 | EV2 | EV3 | EV4 |
|---|---|---|---|---|---|---|---|---|
| O1 f2 / f123 ms | 29 / 61 | 23 / 61 | 30 / 63 | 30 / 65 | 39 / 68 | 42 / 70 | 38 / 68 | 38 / 66 |
| open-0 frames n | 10 | 10 | 11 | 12 | 10 | 11 | 11 | 11 |
| open-0 median dt ms | 18 | 17 | 19 | 23.5 | 34 | 35 | 36 | 36 |
| open-0 > 34 / > 30 / > 38 | 0 / 0.2 / 0 | 0.1 / 0.1 / 0.1 | 0.09 / 0.18 / 0 | 0.25 / 0.42 / 0 | 0.4 / 0.6 / 0.2 | 0.55 / 0.55 / 0.18 | 0.64 / 0.64 / 0.09 | 0.64 / 0.73 / 0.18 |
| open-0 > 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P-158 finger-down 34-50 band | 0 | 0.013 | 0.013 | 0.039 | 0.053 | 0.079 | 0.092 | 0.092 |

| check | C median (range) | v12 median (range) | v12 - C | verdict |
|---|---|---|---|---|
| D1 O1.f2 | 29.5 (23-30) | 38.5 (38-42) | +9 | over +4 |
| D2 open-0 median dt | 18.5 (17-23.5) | 35.5 (34-36) | +17 | over +4 |
| D3 open-0 share > 34 / > 30 / > 38 | 0.095 / 0.19 / 0 | 0.59 / 0.62 / 0.18 | | worse / worse / open |

- Against v11 (P-158, same program and profile, another block; descriptive only, never pooled):
  - O1.f2: v11 45.5 (43-48), v12 38.5 (38-42), so about 7 ms better.
  - Open-0 median dt: v11 38 (29-40), v12 35.5 (34-36), about the same.
  - Open-0 > 34 share: v11 0.61, v12 0.59, the same.
  - The 34-50 band: v11 0.065-0.092, v12 0.053-0.092, the same.
  - In short: the first open got cheaper; each open from closed did not.
- No frame over 50 ms in any open-0 frame of either arm.

**Where the open-0 time goes** (`phone-c2/open0-attr.mjs`, the block's own Timeline; records overlapping each open-0
frame, clipped; medians):

| | C all (n 43) | v12 all (n 43) | C > 34 (n 5) | v12 > 34 (n 24) |
|---|---|---|---|---|
| frame dt | 19 | 35 | 36 | 37 |
| FunctionCall | 2.1 | 14.2 | 16.8 | 14.7 |
| Layout inside a FunctionCall | 0.4 | 13.0 | 14.3 | 13.5 |
| RecalculateStyles | 2.1 | 4.5 | 2.9 | 4.8 |
| Composite | 7.3 | 13.5 | 15.6 | 16.4 |

- The Layout that makes the frame slow is still synchronous, inside script. In every slow open-0 frame of both arms
  it sits in the FunctionCall at scriptLine 2705, which is `iE`, the scroll engine's rAF loop that runs the
  registered callbacks.
  - v12: 33 frames, mean 15.4 ms. C: 14 frames, mean 19.8 ms.
- c2 removed the script around it: FunctionCall went from 20.7 ms (v11, P-158) to 14.2 ms, while Layout inside stayed
  about 13-16 ms. So the `F()` microtask was not the read that forces this layout on WebKit; another read in an `iE`
  callback is.
- C pays the same layout on 5 of 43 opens; v12 pays it on 24.
- Chrome showed no forced layout in c2's open frame (the 421-object layout ran in the rendering step), so this read
  is WebKit-only or finger-only. OBSERVED, in our setup, cause unknown.
- Candidates, to be checked with per-frame forced-layout stacks on the open frame (the Simulator's cm-sim gives stacks
  per phase only):
  - `_()`'s own hit test when `__nsForce` or an edge crossing is set in the same `iE` pass after the CM write.
    c2 sets `__nsForce` at once.
  - `__msTick`'s geometry re-read when innerHeight changes under the finger (the toolbar).
  - `__cmPrep`'s reads on the open from closed.

**Both facts, side by side (lead 05:5xZ; neither explains the other away).** On the user's own gesture (console step
C-103, `out/cm/blink`, logger only), v12 had 72 frames over 50 ms in 28.8 s and C had 48 in 53.8 s. Yet the user
wrote that with that swipe C felt laggier than v12. The target stays the re-open stalls (62-204 ms in that log).

## The open-0 cause (Simulator, stacks; 06:0xZ)

`out/cm/open0-sim.mjs` (WDA finger strokes, Timeline depth 12, open-0 frames marked by a MutationObserver):
- In every open-0 frame of both arms the forced layout is `R < __nsMeasure < _ < L < iE`: 22-23 ms (C), 23-30 ms (v12).
- Cause: Safari's toolbar slides while the finger is down. Each step fires `resize`, and `__nsOnResize` nulls the
  nav cache's geometry, so the next `iE` pass re-measures every theme section with getBoundingClientRect: a
  synchronous whole-page layout. OBSERVED (Simulator stacks; phone correlation in P-159's open-0 attribution).
- `out/cm/tbar-sim.mjs`: across 13 toolbar moves (innerHeight 775 to 815) scrollHeight, `.fw-ms-end` (100lvh) and every
  theme-section edge stayed equal. OBSERVED.
- Keyframe rebuilds per toolbar move: 0 in 13 moves (`out/cm/kfregen-sim.mjs`). That hypothesis is REFUTED.
- Finding F-322 (technique, nav-hit-cache): the page-wide version for the nav-hit-cache owner. Not built here.

## The blink: v12's glass disappears while the morph is on (06:1xZ)

- What blinks: the moment `.is-morphing` turns on (m 0.004), v12's nav loses its frosted glass. The pill turns almost
  see-through (logo, EN and Join stay), and the glass comes back at m 0. Under a finger near m 0 the switch flips every
  0.1-0.4 s (C-103 log), so the glass flickers. C keeps the glass at every m.
- Evidence: Simulator screenshots, `gates/c3/simswitch.mjs`. Corner boxes vs m 0, at m 0.004: v12 32/20/28/21,
  C 3/10/6/10. Nav pill band vs C at m 0.004, Join button excluded: v12 20.6 % of px over 24 levels (6.9 % over 64).
  Chrome shows only square glass corners there (F-309, Chrome-only), which is why the earlier Chrome checks did
  not catch it. At m 1 the dark `.fw-cm-dk` covers the missing blur.
- Cause: u3's `backdrop-filter` is animated by the scroll-driven keyframes (blur 20px x (1 - m)). CONFIRMED by decisive
  Simulator variants (`gates/c3/glass*.diff`):

| variant | change against v12 | glass at m 0.004 |
|---|---|---|
| glassA | no backdrop-filter in the keyframes (static CSS blur 20px) | back |
| glassB | corner clippers `overflow: visible` | still missing |
| glassC | the backdrop-filter animation attaches one frame after `.is-morphing` (backdrop layer already made) | there in the first frame, gone once the animation attaches |
| glassD | no backdrop-filter in the keyframes; `__cmSet` writes today's value inline when m changes | back, every step |

- Engine mechanism: UNRESOLVED. `CSSProperties.json` marks backdrop-filter `"animation-wrapper-acceleration": "always"`.
  `GraphicsLayerCA.cpp` (WebKit main 8367a12e) lines 4401-4403: `animatedLayer(WebkitBackdropFilter)` falls back to
  the primary layer when no backdrop layer exists ("FIXME ... bug 145322"). glassC REFUTES the simple form of that
  lead (the glass also vanishes when the animation starts after the backdrop layer exists).
- glassD against C, nav pill band (Join excluded; the Join button differs by design, PR-032 rev 3's timed fade):
  0.36 % of px over 24 levels and 0.04 % over 64 at m 0.004 (the same in the switch frame itself, held still by
  test hooks); 0.22 % / 0.03 % at m 0.016; 0.14 % / 0.02 % at m 0.03. Back at rest it is 0.59 %, but that is the page's
  animated connector dashes under the nav (crop `out/cm/pill-GDm0r.png`), as in C's own repeat (0.31-0.55 %).
  Within the PR-010 wide numbers (fill 64, 0.5 %).

## c3 on v12 (`c3-on-v12.diff`; JS 1e6daf11957a, CSS 9c1067cff473; plan approved by the lead 06:2xZ)

Contents:
- **R (toolbar):** near the end zone on the CM path, a `resize` keeps the nav cache's geometry and `__msTick`'s end
  geometry (only innerHeight is updated), skips the nav hit test while the geometry is late, and re-measures once,
  300 ms after the toolbar's last step, in a timer. Elsewhere, as before.
  - rev 1 re-measured in rAF + timeout after every resize and cleared `__msTick.g`. The toolbar steps through
    ~30 innerHeights per move, so the next resize failed the end-zone test and re-measured in `iE` anyway (open-0
    still 5/5).
  - rev 3: an answer is kept only when the last real hit test was taken near the end zone (`__nsTy`). rev 2 kept a
    colour taken far up the page after a jump: 6 frames with the wrong nav colour in the stale proof.
- **Glass:** glassD (above).
- **#1:** on the CM path the nav answer is kept for 0 < m <= 0.2 (with rev 3's near condition). The next-frame
  re-test (`__cmReTest`) now runs only on the return to m 0. Coverage: c2cover walked endStart - 2 ih to
  endStart + 0.2 t at 775 and 815. In the end zone the probe hits only `div.start-selling-platform-secure.is-network`
  (62-70 positions), never a nav-owned box. Audit note confirmed: inside `_()` the local `r` shadows the morph
  value, so its `r > 0.2` gate is always true.
- **#3:** `S()` keeps the `#platform` node and writes `--morph-fade` / pointer-events only when they differ from the
  inline values.
- **#4:** `__cmEls()` is cached per `__cmD` once the panel has mounted.
- **#7:** dead CSS of the old spring morph removed (`.start-selling-morph`, `.is-active`, `.is-expanded`, the `-pill`
  rules, and those names in three selector lists). No element in the snapshot's JS or HTML has these classes. Two
  lists that still name them (12252, 10904) were left alone.
- **Not taken:** #2. `n()`'s per-frame `getBoundingClientRect` reads `.start-selling-platform-card`, and `#platform` is
  `position: sticky` with a dvh-based top under `html.fw-ms` (CSS 12437), so a cached offset would be wrong. #5 and #6
  go to c3b with a look check; #8 is probe-only.

### Gates (no timing verdicts; shared lane; `gates/c3/c3-gates3.sh`, `c3-gates4.sh`)

| check | v12 | c3 |
|---|---|---|
| Chrome class parity, 237 frames (c2trace; A/A v12-v12: 0) | | 0 differences |
| Chrome coverage 775 / 815 (c2cover): F() flips, F != class | 1 flip, 0 | 1 flip (same y), 0 |
| Simulator stale proof (`gates/c3/stale-sim.mjs`, 622 frames, innerHeight 775-815 in 31 values): nav colour, is-morphing, m written vs fresh | | 0 / 0 / 0 mismatches (220 frames within 400 ms of a toolbar step, 214 with m > 0; max m diff 1e-5) |
| open-0 frames with the forced re-measure in `iE` (open0-sim, 5 opens) | 5 (107.8 ms) | 1 (21.6 ms) |
| open-0 frame span, Simulator ms (ranks only) | 82-89 | 86 (the first), then 61-64 |
| re-measures forced in `iE`, whole session | 24 (507 ms) | 1 (22 ms) |
| re-measures in the 300 ms timer (off-frame) | 0 | 18 (389 ms) |
| `__cmReTest` / `_` F() forced style | 54 + 10 (165 ms) | 0 |
| `#platform` `n()` forced style, whole session | 311 (610 ms) | 414 (1062 ms) |
| glass vs C (above) | 20.6 % | 0.36 % (Join excluded) |

- **Cost of the glass fix:** the inline blur write dirties u3's style each morph frame. `#platform`'s `n()` rAF then
  reads `getBoundingClientRect` and pays a forced style pass: +450 ms (Simulator) over the session, about +1 ms per
  forced pass. #2 (`n()` without a per-frame rect read) would remove it in both builds. That is c3b's first candidate.
- cm-sim (rAF-stepped, no toolbar; rev 1, 3 runs per arm): open forced layouts 53-55 vs 59-66; styles 92-105 vs 69-82
  (the glass write); close about equal.
- Phone: none yet; only on the lead's word.

## P-160 card: v13 (v12 + c3) vs C, first open and each open from closed (pre-data)

Ticket P-160, the lead's go 2026-10-07 07:15Z (c3 landed as bcaaadca). This section was written before any P-160 data;
its commit time is the pre-data time. Everything not named here is as in the P-159 card.

| item | value |
|---|---|
| question | is v13 = v12 + c3 no worse than C on the first open after load and on every open from closed, under the finger? |
| arms | C = v9-final rev 7d, JS 1b2eecc66011 / CSS e1359ab9994a (the same file as P-158's and P-159's C). V = v13 = v12 + c3, JS 1e6daf11957a / CSS 9c1067cff473. `fixes/compositor-morph/v13-build.sh` proves v12 (807ea24c4bf5 / a9a47b10326a) + `c3-on-v12.diff` (0f4a51ea92d5, patch -F 0) equals the gated out/cm/c3 byte for byte; node --check ok |
| snapshot | out/cm/snap160 (C and P copied from out/cm/snap11, V from out/cm/c3, read-only), HASHES ae245de936fc. The kit checks it, and the served hashes, before every hold |
| driver | G fast-short, `fixes/morph-scroll/g-fastshort-v1.json`, compiled program 8737f212c0ff (as P-158 and P-159). Timeline on in every counted run, with Page.disable, Page.enable, then Timeline.start on the page target, re-sent after every navigation (F-047) |
| profile | tool-serious: `CM_THERMAL=serious`. `iphone.mjs rearm` at the part's start owns the condition (I-225); `thermal.mjs clear` runs in the exit trap; `CM_COOL=0`; start and end gate per hold. Never pooled with xcode-serious |
| kit | `fixes/compositor-morph/phone-c3/`: cm-serve.sh, cm-hold.sh and cm-block.sh are copies of `phone-c2/` with the pins above; reader `p160-read.mjs`; attribution `open0-attr.mjs` |
| link loss (new, I-222, d0439a26) | cm-block.sh runs `usblink.mjs status` before every hold and after every failed hold, and acts on phone-temp exit 5 (LINK-LOST). On a loss it pauses and polls the status every 20 s (at most 3600 s; the lead's watch posts the re-plug step). Then it runs wda ensure, a Safari restart and the I-225 rearm, ONE uncounted warm-up per arm (`H<n>lw<k>C` WC, `H<n>lw<k>V` WV), and re-runs the failed hold once. At most 3 losses per part. A loss is never read as "did not cool". Tested end to end with stubs (no device) |
| order | H1:WC H2:WV (uncounted warm-ups, one per arm's port), then H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 (C V V C C V V C), then H11:TAIL (at most 2 re-runs, then the end sentinel S1 on C) |
| heat | A hold whose start gate reads Critical gets the kit's one rearm. A second Critical stops the block, and we stop and read: the block is read with what it has if each arm has >= 3 valid counted runs, with no top-up. An end gate that reads Critical voids only that hold. Park Safari after the block. Afterwards, check that no `thermal.mjs set` process survives (`thermal.mjs clear` if one does) |
| command | `CM_TICKET=P-160 CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner arch-compositor-morph --block P-160 --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone-c3/cm-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL`, as a Bash background job with a 7200000 ms timeout (I-240) |
| reader | `node fixes/compositor-morph/phone-c3/p160-read.mjs out/cmp160/runs` (selftest 8 checks). A run counts only when its hold log ends VALID. Warm-ups never count |
| metrics and decision | P-159's, unchanged. D1: median V O1.f2 - median C O1.f2 <= +4 ms. D2: median of per-run open-0 median dt, V - C <= +4 ms. D3: per T in {34, 30, 38}: "le" when V's median open-0 share <= C's; "worse" when every V run > every C run (>= 3 valid runs per arm); else "open". **PASS**: D1 and D2 within +4 ms and D3 "le" at all three. **FAIL**: D1 or D2 over +4 ms, or D3 "worse" at all three. Anything else is **OPEN** (threshold-sensitive or insufficient) and is reported; no second block without the lead's OK |
| descriptive: where the time goes | `open0-attr.mjs out/cmp160/runs`: per open-0 frame, FunctionCall, Layout inside a FunctionCall (P-159: C 0.4 vs v12 13.0 ms, at scriptLine 2705 `iE`), RecalculateStyles and Composite. c3's success check: the in-`iE` Layout falls toward C's |
| descriptive: glass and blink | The G runs carry no class log and no pixel channel, and the Timeline cannot show a backdrop that was not drawn. So the blink check itself stays the Simulator gate (glassD against C: 0.36 % of px over 24 levels at m 0.004, Join excluded), plus the user's eye on the Try-it pages. On the phone this block reports the glass write's cost: RecalculateStyles per open-0 frame, V against C and against P-159's v12 (4.5 ms). From the Simulator (n() +1 ms per forced pass) I expect about +1 ms, not more than +2 ms. No verdict rides on it |

**Prediction (frozen).** D2 and D3 PASS: open-0 median dt within +4 ms of C's, and open-0 > 34 share at or below C's at
all three thresholds. Basis: P-159 put the slow open-0 frames' cost in a Layout forced inside `iE` (13 ms). c3 R moves
the toolbar's re-measure out of `iE` into a 300 ms timer (Simulator: forced re-measures in `iE` 24 -> 1; open-0 frames
with one 5/5 -> 1/5). #1 drops the next-frame re-test (F forced style 64 -> 0).
D1 is the risk. In the Simulator the first open after load still paid the re-measure (86 ms vs 61-64 for the later
opens), and P-159's D1 was +9 ms. My overall call is **PASS**, at about 55 %. The likeliest miss is **FAIL by D1 alone**,
with D2 and D3 passing. If that happens, the first open's own re-measure is c3b's next target.

## P-160 results (iPhone 15 Pro Max, G fast-short, tool-serious, Timeline on; 2026-10-07 07:3x-08:15Z)

**DECISION FAIL, by D1 alone** (`node fixes/compositor-morph/phone-c3/p160-read.mjs out/cmp160/runs`). The prediction
named this as the likeliest miss. D2 and D3 pass, and they are better than C.

Holds:
- The part's rearm read `REARM CLEARED`: Serious, induced by our thermal.mjs, battery 32.6 C.
- H1-H10 are VALID: warm-ups WC and WV, and every counted run (EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4). There was no link
  loss and no re-run.
- The end sentinel S1 PASSED (55.4 fps, slow 0.029). H11's end gate then read Critical at 41.5 C, so hold H11 is VOID.
  This is the same as P-158 H10 and P-159 H11. It does not touch the counted runs: each ended VALID in its own hold.
- The exit trap cleared the condition and parked Safari. No `thermal.mjs set` process survives (checked after the block).
- The gate lines print `profile xcode-serious`, the gate's own label, as in P-159's holds; the condition was tool-held.

| check | C median (range) | v13 median (range) | v13 - C | verdict |
|---|---|---|---|---|
| D1 O1.f2 ms | 27 (25-31) | 38 (37-40) | +11 | over +4 |
| D2 open-0 median dt ms | 19.25 (18-21) | 9.5 (9-16) | -9.75 | within |
| D3 open-0 share > 34 | 0.045 | 0 | | le |
| D3 twin > 30 | 0.19 | 0 | | le |
| D3 twin > 38 | 0 | 0 | | le |
| open-0 > 50 | 0 | 0 | | |
| P-158 finger-down 34-50 band (descriptive) | 0.0065 (0-0.013) | 0 (0-0) | | |

Against v12 (P-159; same program and profile, another block; descriptive only, never pooled):

| | v12 (P-159) | v13 (P-160) |
|---|---|---|
| O1.f2 ms | 38.5 (38-42) | 38 (37-40) |
| open-0 median dt ms | 35.5 (34-36) | 9.5 (9-16) |
| open-0 share > 34 | 0.59 | 0 |
| open-0 Layout inside a FunctionCall ms (all frames) | 13.0 | 0 |

- c3 did what it was built for. The Layout forced inside `iE` on each open from closed is gone (13.0 -> 0 ms), and the
  open-0 frames are now shorter than C's (10 vs 19 ms).
- The first open after load did not move (38.5 -> 38 ms), so its cost is not the re-measure.

**Where O1.f2 goes** (`phone-c3/o1-attr.mjs`, a copy of fix-end-morph's `o1-attr.mjs` with arm V; the f2 gap, medians
over 4 runs per arm):

| f2 gap | C | v13 | v13 - C |
|---|---|---|---|
| dt ms | 27 (25-31) | 38 (37-40) | +11 |
| RenderingFrame | 26.9 | 37.9 | +11 |
| Composite | 13.5 | 20.0 | +6.6 |
| RecalculateStyles (n) | 2.95 (1) | 6.1 (2) | +3.1 |
| FunctionCall | 9.65 | 4.35 | -5.3 |
| Layout | 2.9 | 2.7 | |

- The first open's extra time is in the rendering step: compositing +6.6 ms and one more style pass +3.1 ms. Script is
  cheaper than C's.
- Likely reason, OBSERVED in our setup, cause unknown: the first commit of CM's layer tree after load (the corner
  clippers c0-c3 / u0-u3, u3's backdrop layer, `.fw-cm-dk`), which later opens reuse.
- Next check: a Simulator layer and composite count on the first open against the second.

**Glass write cost (descriptive):**
- Open-0 RecalculateStyles: C 1.8, v13 4.1 ms; inside a FunctionCall: C 1.0, v13 2.6 ms (`n()`'s forced pass after the
  inline blur write).
- That is +2.3 ms, a bit over my +2 ms expectation. No verdict rides on it; c3b #2 targets it.

## c3b-a on v13 (`c3b-a-on-v13.diff`; JS 4175a56193ab, CSS unchanged 9c1067cff473; lead go 08:2xZ)

Four "does less work" items on v13. Each one leaves the page's look and behaviour unchanged, and each has its own gate.

| item | what changes | why it is the same |
|---|---|---|
| #2 | `#platform`'s `n()`: where `shrinkOffMq` matches (phones), an IntersectionObserver (root reaching far up, bottom margin -17 %, threshold 1) sets `is-platform-shrinking`. The per-frame `getBoundingClientRect` read goes. The scroll-engine registration stays, because it also drives the section's render deferral; with the observer on, its per-frame callback does nothing | On phones `n()` only uses `a > 0.04`, i.e. card bottom < 0.83 innerHeight. Under fw-ms the card is sticky with its bottom at the viewport bottom (774.6 at innerHeight 775), so the class is constantly off in both builds. The per-frame read computed a constant and forced a style pass after the nav's inline blur write |
| #5 | `__mkW`: where CM runs (fw-cm, width <= 640, not reduced motion), the six inline `--morph` copies are written only at m 0. A pending value is written if CM stops applying | Under CM the consumers of those copies are overridden (the CM rules and the threshold classes). The one remaining reader, the Join button's base `filter: blur(var(--earn-out) * 10px)`, is overridden under CM except with reduced motion, so reduced motion keeps the writes |
| #6 | `__msTick`: the 200 ms rest timer and the lift check only within one viewport of the end screen (last frame's geometry) | Further up, the settle acts at e > -0.1 only, so it decided nothing there. Removed: one clearTimeout + setTimeout per scroll frame page-wide, and the timer's geometry read 200 ms after every stop |
| timer | c3's 300 ms deferred re-measure waits 150 ms more while a finger is down or the page moved in the last 150 ms, near the end screen only | The Simulator caught it once inside an open frame (25 ms forced layout in a TimerFire). Away from the end no open can come next, so it runs as before |

Gates (`gates/c3b/c3b-a-gates.sh chrome|snap|sim`; v13 = out/cm/snap160/V against the frozen out/cm/c3ba, every gate re-run on the frozen build 08:45-08:53Z with the same results; counts and looks only):

| gate | result |
|---|---|
| Nav computed style, every element of the nav (233), 17 held m values from -1.2 to 1 and back (`settle-css.mjs`, `settle-read.mjs`), Chrome 775 / 815 / 775 reduced motion, Simulator | Only the unused custom property `--earn-out` on the Join button and its box differs (no computed property that draws changes), plus a 0.001 px translate rounding that the A/A also shows. Reduced motion: 0 differences. Time-driven animations (countdown cells, the panel's column marquee) are set aside, as the A/A shows they move with the clock |
| `is-platform-shrinking` against the old rule, read fresh, every 40 px over the whole page plus 1 px around each change (`pf-io.mjs`): Chrome 775 / 815, Simulator | 0 mismatches. The class and the rule are off everywhere on phones |
| Settle behaviour (`settle-snap.mjs`, Chrome 775): where 10 releases from m -0.05 to 0.95 come to rest; 200 ms timers armed in 60 frames far from the end and 60 near it | Rests identical. Timers far 59 -> 0, near 59 = 59 |
| Deferred re-measure (`timer-open.mjs`, Simulator, 8 open/close stroke pairs; two runs, the second on the frozen build) | v13: 18 / 17 fires, 0 / 0 in an open frame, 5 / 7 in a frame with touchmove/scroll. c3b-a: 11 / 12 fires, 0 / 0 and 0 / 0. (The one fire inside an open frame was seen in an earlier Simulator session, not in these two: the check is the 0 in moving frames, since an open only comes in a moving frame) |
| Forced work by stack (`open0-sim.mjs`, Simulator, whole session, ms rank only) | `n()` forced style 394 (1091 ms) -> 0, its forced layout 151 -> 0. The pass moves to the next reader, `__msTick`'s geometry read, 14 (20 ms) -> 50 (145 ms), and `__msSettle` 4 -> 28 (24 ms). Total forced style about 1125 -> 177 ms |

A first try of #2 dropped the section's scroll-engine registration with the per-frame read. That also took `#platform` out of the render deferral. The parity gate caught it (`--start-selling-intrinsic-block-size` missing); fixed as above.

### First open (D1): the cost is the open frame's layer build

- Phone (P-160 Timeline, per rendering frame): v13's open frame composites about 20 ms on every open (O1 20.7, a later open 19.8). C's open frame is 17 ms on O1 and about 8 ms on later opens. v13's later opens still beat C (f2 28 vs 32 ms), because C pays its 13 ms re-measure there; O1 has no toolbar step, so v13's composite shows. (The earlier "+6.6 ms Composite" came from clipping records to the frame gaps; per rendering frame O1 is +3.7 ms Composite and +1.8 ms style.)
- Simulator layer census with a held touch (`out/cm/o1-sim.mjs`, OBSERVED): every v13 open creates 11 composited layers and every close drops them (the 4 corner clippers, the 4 inner boxes, the dark overlay, the logo, the language switch). C creates 1.
- WebKit source (main 616ee3ad, CONFIRMED): there is no layer pool.
  - RenderLayer.cpp 5865-5890 (`ensureBacking` / `clearBacking`); RenderLayerBacking.cpp 329-338 and 670-700; GraphicsLayerCA.cpp 441.
  - The backdrop layer is created and destroyed with the filter at GraphicsLayerCA.cpp 2752-2784.
  - RemoteLayerTreeContext.mm 113-122 registers new layers, and 204-222 builds the transaction with backing stores for layers that draw.
  - Each display:contents -> block cycle is a full build (finding F-324).
- Not the cause: the keyframes are not generated again on the first open (Simulator, text unchanged). The first-open-only DOM work (render culling on `.commission` / `.pain`, the panel's aria-hidden, the Join button's tabindex) is the same in C (`out/cm/o1-mut.mjs`).
- Next: c3b-K builds the CM layers near the end at a still moment, so the open frame builds nothing (lead's go 08:4xZ, with the gates: look, approach scroll, fewer clippers, hit-test and behaviour, memory, rest layouts).

## c3b-K: pre-build the CM layers near the end (2 h box, 08:50-09:40Z): FAILS, not a fix

Idea (lead's go 08:4xZ): while the morph is still closed and the page rests within one end screen above the end (m in
(-1, 0]), turn the CM structure on early ("pre": `.is-morphing` plus `.fw-cm-pre`, `__cmPreSet` from the 200 ms rest
timer, off below m -1.25), so the open frame builds no layers. Builds (all on the frozen c3b-a, gitignored):
c3bk1 (pre = plain `.is-morphing`), c3bk2 (+ `.fw-cm-pre` rules, the glass in a pill-sized `u3::before`), c3bk3
(u3 kept as backdrop root with `blur(0px)`), c3bk4 (the glass on the bar; `c3b-k4-on-c3b-a.diff`, sha 180ca694165b,
CSS f8488b770361), c3bk5 (K-min: K4 plus `animation: none` under pre on every part that draws, so only the corner
clippers and boxes animate early; CSS 4fafb83f1e72). Gate tools: `gates/c3b/pre-look.mjs` (PR-010 multi-pair pixels and
tap targets, no touch held), `slide.mjs`, `k-sim.mjs` (Simulator open frames, approach scroll, rest, layers),
`k-gates.sh look-chrome|look-sim|sim-cost`.

| gate | result |
|---|---|
| 1 look, Chrome 775 (A/A 0-0.02 %) | c3bk1 0.4-2.9 %, max 236 (u3's panel-sized backdrop: the card below the pill bleeds in, square bottom corners). c3bk2 0.3-0.9 %, max 144-215. c3bk3 4-4.6 % (the glass vanished: a backdrop root sees only its own content). c3bk4 0.27-0.91 %, max 144-215. c3bk5 0.30-0.87 %, max 144-215. Every K build is over T2 (0.5 %, edge 128) at most stops between m -0.75 and 0 |
| 1 look, Simulator (815 viewport) | c3bk2 0.02-0.6 %; c3bk3 1.1-3.8 %; c3bk4 0.05-0.36 %, max 134-142 on edges at m -0.75 / -0.25 and 232 at -0.5 (fill clusters stay <= 59). Closest, still over the edge limit |
| 4a taps (fixed points of the closed pill, the receiving element) | c3bk1: taps on the Join button fell through (CSS 11935 gives it pointer-events only outside `.is-morphing`). From c3bk2 on: 0 of 12 differ at every stop, Chrome and Simulator (two Simulator points differ by 1 px of the panel's hidden CTA, same receiving element) |
| 4b slide | `is-scroll-hidden` never turns on between m -1.3 and 0 in either build (8 px scan, Chrome 775); the pre rule slides by the pill height anyway. 97 sampled frames identical |
| 4c rules that change meaning under pre | 11162/12047 (reduced-motion filter/transition none), 11734/12040 (closed transitions), 11811 (logo absolute; needed), 11832 (actions transition none), 11919/11931/12534 (language switch transform, 0 at m 0), 11935 (Join pointer-events). Covered by `.fw-cm-pre` rules in c3bk2+ |
| 2 open frames, Simulator (`k-sim.mjs` pass O, ms rank only) | first open f1 Composite: v13 61.3, c3bk4 62.2 (unchanged). Later opens f1: v13 52.2 / 50.6, c3bk4 22.6 / 25.7 |
| 2 approach scroll and rest, Simulator | scroll segments with pre on: Composite about equal (D1 209 vs 218, U2 234 vs 246 ms), script and forced style up (D1 133 vs 81 ms script, forced style 51 vs 18). At rest with pre on, rendering-step style about doubles (R2 70 vs 24 ms, S-0.5 182 vs 100 ms over 3 s): the pre-built scroll-driven animations are restyled every rendering update |
| 5 memory | c3bk4 at rest at m -0.5 with pre on: 78 layers, 141.4 MB vs v13 66 layers, 130.7 MB (+12 layers, +10.7 MB: the clippers and boxes draw nothing; the panel's veil 11.6 MB, centre 5.7 MB, column tracks 3 x 2.6 MB already exist in v13 once opened). Pre stays on whenever a visit rests within one screen of the end, until it scrolls 1.25 screens up |
| 3 fewer clippers | not cheap: each corner needs its own anchor because width, height and radius change independently with m; one element could cut all four only with an animated clip-path, which WebKit does not run on the compositor (the pre-CM design wrote it inline every frame) |

Verdict: K fails. The pre state does not look like the closed pill in Chrome (T2 exceeded in every variant, K-min
included), and in the Simulator it does not remove the first open's composite (the D1 target, 62 vs 61 ms), while
it adds style work at rest and 10.7 MB. Later opens do halve their open-frame composite. Not worth a proposal for D1.

F-321 (rest layouts, v13 today, with or without K; Simulator `k-sim.mjs` pass A): 26.7 layouts/s at rest at m -0.5,
3.0 at m 0, 24.7 at m 1. At m 1 every rest layout's root is a CM corner clipper (the Timeline root quad is 1250 x 1250
= 2000 px x k at m 1), so the work is inside the open panel; at m -0.5 the root is the whole viewport (the platform
section's own animations, not CM; the nav is closed there).

## c3b-a phone card: c3b-a vs C, first open and each open from closed (pre-data; ticket number from the lead, P-161 proposed)

Written before any data; its commit time is the pre-data time. Everything not named here is as in the P-160 card.

| item | value |
|---|---|
| question | does c3b-a (v13 + #2 platform observer, #5 --morph copies at m 0, #6 rest timer near the end, the re-measure timer kept out of moving frames) stay no worse than C on the first open after load and on every open from closed, under the finger; and does it cut v13's first-open style pass? |
| arms | C = v9-final rev 7d, JS 1b2eecc66011 / CSS e1359ab9994a (the same file as P-158/159/160). V = c3b-a, JS 4175a56193ab / CSS 9c1067cff473 (out/cm/c3ba, `c3b-a-on-v13.diff`, landed da69ea0c) |
| snapshot | out/cm/snap161 (C and P copied from out/cm/snap160, V from out/cm/c3ba, read-only), HASHES a36f8565979f, checked by the kit before every hold |
| kit | `fixes/compositor-morph/phone-c3ba/`: a copy of `phone-c3/` with the pins above (state out/cmp161); reader `p161-read.mjs` (P-160's rules unchanged; selftest 8 checks ok); attribution `open0-attr.mjs`, `o1-attr.mjs` |
| driver, profile, order, heat, link loss | as P-160: G fast-short (8737f212c0ff), Timeline on in every counted run, tool-serious (`CM_THERMAL=serious`, `CM_COOL=0`), H1:WC H2:WV, then EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4, H11:TAIL with the end sentinel |
| command | `CM_TICKET=<ticket> CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner arch-compositor-morph --block <ticket> --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone-c3ba/cm-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL` (servers first: `sh fixes/compositor-morph/phone-c3ba/cm-serve.sh start`), as a Bash background job with a 7200000 ms timeout |
| metrics and decision | P-160's, unchanged. D1: median V O1.f2 - median C O1.f2 <= +4 ms. D2: median of per-run open-0 median dt, V - C <= +4 ms. D3 at T in {34, 30, 38}. PASS / FAIL / OPEN as in P-160 |
| descriptive | `o1-attr.mjs`: O1's open frame per rendering frame, RecalculateStyles and Composite, V against C and against P-160's v13 (Composite +3.7 ms, style +1.8 ms over C) |

**Prediction (frozen).** D2 and D3 PASS, as in P-160 (c3b-a changes nothing in the open frame's layer build). D1
**FAIL** again, by about +7 to +10 ms (P-160: +11): the layer build that makes O1's Composite cost is untouched (K, which
targeted it, failed). The share c3b-a can take is the style part: O1's RecalculateStyles from v13's +1.8 ms over C
toward 0 (#2 drops the per-frame forced style pass of `n()`, Simulator 394 passes / 1091 ms per session -> 0; #5 drops
six inline `--morph` writes per frame). Overall call: **FAIL by D1 alone**, about 70 %.

## O1: what the first open pays for, and K on WebKit only (lead 09:0xZ-09:5xZ; Simulator only, no phone)

### What O1 pays for

- **"Once per page load" is REFUTED for v13 / K.** The 62 ms first open of c3bk4 (table above) was one run. Repeats
  of the same build gave 23.3 and 22.1 ms. P-160 on the phone (OBSERVED) shows the same: v13's open frame composites
  about 20 ms on O1 and on later opens alike. It is C whose first open costs extra (17 vs about 8 ms).
- **O1's D1 gap is v13's per-open layer build.** Every v13 open creates 11 composited layers and every close drops
  them (Simulator census, OBSERVED). WebKit keeps no layer pool, so each open builds them again (F-324, CONFIRMED in
  WebKit source; main 616ee3ad and 8f0a69f19a28). On O1 C pays only its own first paint, so v13's build shows there.
  On later opens C pays its 13 ms re-measure, which hides it.
- **Tests (a) to (c) from the brief.** `o1-frames.mjs` reads the open frames of the k-sim Timelines.
  - (a) first paint and decode: open 1 has no record type that the later opens lack, and every open paints the same
    20 rects with the same sizes (c3b-a, Simulator, OBSERVED; e.g. Paint 20x 1.3 / 1.5 / 1.2 ms, Composite 44.5 /
    40.3 / 41.3 ms). WebKit decodes images under 500 KB synchronously at their first paint (RenderBoxModelObject.cpp
    306-368, CONFIRMED). WebKit's Timeline has no decode record of its own (EventType enum, Source/JavaScriptCore/inspector/protocol/Timeline.json
    lines 11-38 at 8f0a69f19a28, CONFIRMED), so a decode would show only as a longer
    Paint, and open 1's Paint is not longer.
  - (b) first backdrop use: the backdrop layer is made lazily with the filter (GraphicsLayerCA.cpp 2734-2814,
    CONFIRMED) on every open, not only the first.
  - (c) first keyframes and fonts: not regenerated on the first open (unchanged text, see "First open (D1)").
  - So nothing in O1 is first-only on v13. What remains is the build that happens on every open.
- **Source points that bear on F-324** (helper, WebKit 8f0a69f19a28, CONFIRMED):
  - A layer with no visible content gets no backing store only while `!mayHaveNonZeroOpacity`
    (RenderLayerBacking::containsPaintedContent 3880-3890). An opacity keyframe effect defeats that check
    (Styleable.cpp 224-238), so CM's animated wrappers get backing stores.
  - IOSurfacePool reuses a surface only at the exact same size (IOSurfacePool.cpp 81-90, takeSurface 120-165).
    Surfaces whose size changes with m are not reused across opens.
  - RemoteLayerBackingStore paints lazily (RemoteLayerBackingStore.mm 235-243, 333-401). The paint lands in the
    first frame that shows the layer, which is the open frame unless the layer exists earlier.
- **F-321 / c3b-c is parked** (lead). The rest layouts at m 1 stay as described under c3b-K.

### The fix candidate: K on WebKit only (c3bk6), and K8 (pre ends after 3 s of rest)

**Gate.**
- Today the page turns CM on with `__cmSup`, i.e. `__msOn` (no reduced motion, `(hover: none) and (pointer: coarse)`,
  smallest screen side <= 600) and `CSS.supports('(timeline-scope: --a) and (animation-range: cover 0% cover 100lvh)')`.
  That is every touch phone with scroll-driven animations, Android Chrome included. So it cannot select WebKit.
- c3bk6 adds the page's own WebKit feature test, `'GestureEvent' in window`. The page already uses it for heCss and
  cites MDN browser-compat-data api/GestureEvent.json there. It is a feature test, not a UA string.
- `GestureEvent` is a WebKit-only interface:
  - iOS Safari has it, and so does Chrome on iOS, which runs on WebKit.
  - Android Chrome and desktop Chrome do not.
  - Desktop browsers also fail `__msOn` (hover and a fine pointer), so pre never turns on there.
- Status: CONFIRMED by BCD for the interface. That Chrome on iOS gets pre follows from its WebKit engine; it is not
  checked on a device.

**Builds** (frozen, gitignored):

| build | what it is | JS | CSS |
|---|---|---|---|
| c3bk6 | c3bk5 (K4 plus no animations under pre on the parts that draw) + the WebKit gate | d23ee885d54f | 4fafb83f1e72 |
| c3bk8 | c3bk6 + pre ends after 3 s of rest and comes back on the next scroll toward the end | 237563792c42 | 4fafb83f1e72 |

K8 detail:
- Pre ends after 3 s with no scroll frame, no touch and the morph closed (`__cmPreEnd`), with the same hold as any pre
  end.
- It comes back in the first scroll frame that moves toward the end with m in (-1, 0] (`__cmPreRe`). It also comes back
  at the next rest in range, as in K6.

### Gates (Simulator and Chrome; counts, pixels and Simulator ms as a rank only; no timing verdicts)

Tools: `gates/c3b/pre-look.mjs`, `k-sim.mjs` (new pass P: opens after 4.5 s rests; new segments S-0.5a / S-0.5z;
`--trace`: where each stroke starts and rests), `o1-frames.mjs`, `k-gates.sh sim-runs|sim-k8|sim-k8p`. Logs are in
out/cm/c3bk-gates/.

**1. Chrome look against c3b-a.**
- In Chrome, pre never turns on (the `pre` column is false at every stop).
- K8, 775: consistent 0 at every stop, 12 of 12 taps equal everywhere.
- K6, 775: consistent at most 6 css px² (0.0174 %, max 34, at m 0). 815: 0.
- Both are 0 or inside T2, as expected by construction.

**2. Simulator look, K6 against c3b-a** (innerHeight 775 only; the Simulator shows 815 only after a finger stroke,
and pre-look holds no touch).
- At m -0.5, -0.1, 0 and -1.1d: consistent 0.32-0.34 %, max 26-59, all in one fill cluster at the pill's lower left
  (css 16-48 x 64-128). This is the glass's blur on the bar instead of on u3. It is inside T2 (fill 64, 0.5 %).
  Simulator A/A at those stops: 0.04-0.07 %.
- -0.5d: consistent 0.336 %, max 173. The edge pixels are in the page's agents-ask list, a one-device-px content
  shift; that stop is noisy (A/A 1.19 %, V/V 2.66 %).
- -1: 0.033 %, max 194, in the same list (A/A 1.87 %, V/V 4.7 %). At -1 pre is off in both arms, so this content
  noise is not pre's.
- Taps: 12 of 12 equal at every stop.
- Verdict: **T2 pass at 775**, with -1 and -0.5d flagged for page-content noise that also shows without pre. 815
  untested in the Simulator.
- K8 has the same pre CSS, and pre stays on between pre-look's stops (1.75 s each, under the 3 s end), so its pre
  states are K6's. Its "pre ended" state is the closed state, checked at -1.5d (0.0009 %, max 28).

**3. Rest cost** (rendering-step style ms per 3 s, styles/s, layouts/s; one Simulator session, K8, K6 and c3b-a back to back):

| segment | K8 | K6 | c3b-a |
|---|---|---|---|
| R2 (1.2 s rest at m -0.9, pre on) | 67.9 ms | 56.6 | 20.3 |
| S-0.5 (0-3 s at m -0.5, pre on) | 184.2 ms, 57.0/s, 27.3/s | 178.8, 59.0, 28.3 | 74.3, 37.0, 21.0 |
| S0 (0-3 s at m 0) | 50.3, 14.7, 3.7 (pre ends inside) | 43.9, 14.0, 3.3 | 26.4, 11.3, 3.0 |
| S-0.5a (0-3 s at m -0.5 after a close) | 157.0, 66.3, 23.7 | 133.7, 67.0, 22.7 | 57.1, 29.3, 18.3 |
| S-0.5z (3.5-6.5 s, same rest) | **73.5, 42.3, 30.7 (pre ended)** | 144.7, 76.3, 30.0 | 43.8, 32.0, 24.7 |

- The earlier session's K6 vs c3b-a at S-0.5: 156 vs 93 ms.
- While pre is on, rest style is 2-2.5x c3b-a. K6 keeps paying that for as long as the page rests near the end. K8
  pays it for 3 s per rest, then drops to about +30 ms per 3 s over c3b-a (one session).
- **What the rest cost is not.** c3bk7 (K6 plus `animation-play-state: paused` on the clippers and boxes under pre;
  specificity 0,6,1 over the keyframe rules' 0,4,1) changes nothing: S-0.5 155.6, S-0.5a 140.4, S-0.5z 147.4 ms. So
  the extra style is not the scroll-driven animations ticking (REFUTES the guess in the c3b-K table above). It comes
  with the bigger styled tree under `.is-morphing` (OBSERVED, cause otherwise unknown).

**4. Memory** (layers census at rest at m -0.5, pre on):
- K6: 74 layers, 141.25 MB, against c3b-a's 66 layers, 130.7 MB (+10.6 MB).
- K8: the same while pre is on. After the 3 s end, its DOM state is the closed state, whose layers a close drops (the
  census above). Not measured separately.

**5. Open frame f1 Composite** (Simulator ms, rank only; "first" is the first open after load, "later" the opens after
a close):

| pass | build | run 1 first / later | run 2 | run 3 |
|---|---|---|---|---|
| O (1.5 s rest) | K6 | 27.4 / 70.4, 33.8 | 26.1 / 36.7, 34.7 | 26.2 / 39.8, 34.0 |
| O | K8 | 27.3 / 42.1, 35.4 | 37.6 / 34.1, 38.0 | 11.6 / 34.7, 35.6 |
| O | c3b-a | 39.4 / 37.1, 36.8 | 44.5 / 40.3, 41.3 | 43.9 / 43.0, 41.1 |
| O | C | 42.4 / 37.4, 38.2 | 40.0 / 39.0, 38.1 | 41.2 / 37.0, 36.1 |
| P (4.5 s rests) | K8 | 27.1 / 48.1, 36.9 | 31.7 / 53.1, 41.3 | 28.2 / 58.0, 62.7 |
| P | c3b-a | 46.3 / 55.4, 41.1 | 52.1 / 42.6, 45.7 | 53.2 / 45.0, 56.8 |
| P (trace run) | K8 / K6 | 24.5 / 86.7, 39.2 | 9.8 / 54.4, 38.6 (K6) | |

- **The first open drops** from about 40-53 ms to 10-38 ms (median 27) in K6 and K8 alike. Its paints drop from 19-20
  to 7-16. This is the D1 cost.
- **K8 after a long rest.** Pre comes back in the first scroll frame of the stroke (the trace shows on at m -0.26).
  That frame then carries the build: Composite 23.0 / 23.1 / 31.1 ms, frame span 50-61 ms. So after a rest over 3 s,
  K8 moves the build from the open frame into the first moving frame toward the end; it does not remove it. After a
  shorter rest it behaves like K6.
- **Later opens gain nothing in either K** (20 paints, Composite like c3b-a).
  - The trace shows why they differ: every close settles at m 0 exactly, and the next stroke starts there.
  - In K6, pre is on at m 0 (on 1.2 s after the close), yet the open from m 0 rebuilds anyway (OBSERVED, cause
    UNRESOLVED; the decisive check is a layer census at rest at m 0 with pre on, against m -0.3).
  - K8's re-arm cannot help there: the first scroll frame is already at m > 0.
  - Earlier note: the "later opens cut about 5 ms" in the K6 runs is within these spreads. It is withdrawn.

### Verdict and card

- K on WebKit only passes the look (Chrome 0 by construction, Simulator T2 at 775). It cuts the first open's build,
  which is the D1 cost, from about 40-53 to about 27 ms in the Simulator.
- It does nothing for later opens. While pre is on, rest style is 2-2.5x and memory is +10.6 MB.
- K8 bounds that rest cost to 3 s per rest. The price: an open after a longer rest pays the build one frame earlier,
  in its first scroll frame, instead of in the open frame.
- **I propose c3b-a + K8 for the card** below. K6 is the alternative if the lead prefers no build in any moving frame
  over the bounded rest cost.

## c3b-K8 phone card: c3b-a + K8 vs C, first open and each open from closed (pre-data; ticket number from the lead)

Written before any data; its commit time is the pre-data time. Everything not named here is as in the c3b-a card above
(itself P-160's).

| item | value |
|---|---|
| question | does pre-building CM's layers at rest near the end (K8, WebKit only) bring c3b-a's first open after load within D1 of C, and stay no worse than C on every open from closed, under the finger? |
| arms | C = v9-final rev 7d, JS 1b2eecc66011 / CSS e1359ab9994a (as P-158/159/160/161). V = c3b-a + K8, JS 237563792c42 / CSS 4fafb83f1e72 (out/cm/c3bk8; `c3b-k8-on-c3b-a.diff`, sha 12db8c45dea6) |
| snapshot | out/cm/snap162 (C and P from out/cm/snap160, V from out/cm/c3bk8, read-only), HASHES 6bee1e1d19a8, checked by the kit before every hold |
| kit | `fixes/compositor-morph/phone-c3bk/`: a copy of `phone-c3ba/` with the pins above (state out/cmp162). Dry run: serve check ok (3 of 3 servers serve the pinned hashes), H1 DRY ok, programs fs 8737f212c0ff / pr 7ff27a2413c8 ok. Reader `p161-read.mjs` unchanged (selftest 8 checks ok) |
| driver, profile, order, heat, link loss | as P-160/P-161: G fast-short, Timeline on in every counted run, tool-serious (`CM_THERMAL=serious`, `CM_COOL=0`), H1:WC H2:WV, then EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4, H11:TAIL with the end sentinel |
| command | `CM_TICKET=<ticket> CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner arch-compositor-morph --block <ticket> --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone-c3bk/cm-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL` (servers first: `sh fixes/compositor-morph/phone-c3bk/cm-serve.sh start`), as a Bash background job with a 7200000 ms timeout |
| metrics and decision | P-160's, unchanged. D1: median V O1.f2 - median C O1.f2 <= +4 ms. D2: median of per-run open-0 median dt, V - C <= +4 ms. D3 at T in {34, 30, 38}. PASS / FAIL / OPEN as in P-160 |
| descriptive | `o1-attr.mjs`: O1's open frame per rendering frame (RecalculateStyles, Composite), V against C and against P-160's v13. Also: was pre on when O1's stroke began (the frame where `.fw-cm-pre` drops), and, if the run rested over 3 s before O1, the first scroll frame's Composite |

**Prediction (frozen).**
- **D1: PASS, about 60 %.** In the Simulator the first open's Composite falls about 15-25 ms below c3b-a and
  below C (median 27 vs about 40-53). P-160/161's D1 gap was +11 ms.
- The risk: if the G driver rests over 3 s before O1, the build moves into the stroke's first scroll frame. That frame
  can count in D3's window but not in O1.f2.
- **D2: PASS.** Later opens start from m 0 after a close and rebuild as in c3b-a.
- **D3: PASS**, as in P-160, unless the moved build frame crosses T.
- **Overall: PASS, about 55 %.**

**Lead decision (10:2xZ): the K8 card above is not run.** P-161 is C against c3b-a + K6.
- Why K8 lost: after a rest of more than 3 s, K8 moves the build into the first scroll frame (Simulator span 50-61 ms).
  That is the over-50 ms moving frame the goal removes, and the driver's rest before O1 can trigger it.
- K6's cost is accepted as a known cost: rest-only style work (2-2.5x near the end) and +10.6 MB. It shows no visible
  jank.
- K8 stays as the alternative (`c3b-k8-on-c3b-a.diff`, kit `phone-c3bk/`, snapshot snap162, not run).
- The rebuild of later opens at m 0 stays UNRESOLVED, for after P-161.

## P-161: C vs c3b-a + K6, first open and each open from closed (pre-data)

Written before any data; its commit time is the pre-data time. The rules are P-160's. Everything not named here is
as in the c3b-a card above.

| item | value |
|---|---|
| question | does pre-building CM's layers at rest near the end (K6, WebKit only) bring c3b-a's first open after load within D1 of C, and stay no worse than C on every open from closed, under the finger? |
| arms | C = v9-final rev 7d, JS 1b2eecc66011 / CSS e1359ab9994a (as P-158/159/160). V = c3b-a + K6, JS d23ee885d54f / CSS 4fafb83f1e72 (out/cm/c3bk6; `c3b-k6-on-c3b-a.diff`, sha 4836ece355c8) |
| snapshot | out/cm/snap163 (C and P from out/cm/snap160, V from out/cm/c3bk6, read-only), HASHES b3c356f6d76f, checked by the kit before every hold |
| kit | `fixes/compositor-morph/phone-c3bk6/`: a copy of `phone-c3bk/` with the pins above (state out/cmp163). Dry run 10:07Z: serve check ok (3 of 3 servers serve the pinned hashes), H1-H4 and TAIL DRY ok, programs fs 8737f212c0ff / pr 7ff27a2413c8 ok. Reader `p161-read.mjs` (P-160's rules unchanged; selftest 8 checks ok); attribution `open0-attr.mjs`, `o1-attr.mjs` |
| driver, profile, order, heat, link loss | as P-160: G fast-short (8737f212c0ff), Timeline on in every counted run, tool-serious (`CM_THERMAL=serious`, `CM_COOL=0`), H1:WC H2:WV, then EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4, H11:TAIL with the end sentinel; link loss as before (a VOID item is re-run, the block resumes at the hold that failed) |
| command | `CM_TICKET=P-161 CM_COOL=0 CM_THERMAL=serious node tools/lock.mjs run iphone --owner arch-compositor-morph --block P-161 --max-seconds 3600 --keep 120 -- sh fixes/compositor-morph/phone-c3bk6/cm-block.sh H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:EV4 H10:EC4 H11:TAIL` (servers first: `sh fixes/compositor-morph/phone-c3bk6/cm-serve.sh start`), as a Bash background job with a 7200000 ms timeout |
| metrics and decision | P-160's, unchanged. D1: median V O1.f2 - median C O1.f2 <= +4 ms. D2: median of per-run open-0 median dt, V - C <= +4 ms. D3 at T in {34, 30, 38}. PASS / FAIL / OPEN as in P-160 |
| descriptive (no verdict) | (1) O1's open frame Composite ms per arm, per rendering frame (`o1-attr.mjs`), against P-160's v13. (2) Rest style at m -0.5: skipped. The driver has no rest there: it approaches in 520 px drags with 300 ms pauses, then rests only at the end (m 1, 1200 ms) and after each settle |

The driver and pre: the approach pauses are 300 ms. K6 turns pre on 200 ms into a pause that falls in m (-1, 0], so
the build should land in a still frame of the approach, about 100 ms before the next drag. If no pause falls in that
range, O1 is c3b-a's open. The descriptive item (1) shows which happened (the frame where `.fw-cm-pre` drops is the
open).

**Prediction (frozen).**
- **D1: PASS, about 55 %.** In the Simulator the first open's Composite falls 15-25 ms below c3b-a and C (median 27
  vs about 40-53), and P-160/161's D1 gap was +11 ms. The risk is a pre-on still frame that lands where the reader
  counts it, or an approach where no pause falls in range.
- **D2: PASS.** Later opens start from m 0 after a close and rebuild as in c3b-a.
- **D3: PASS**, as in P-160.
- **Overall: PASS, about 50 %.**

**P-161 start 1 (10:09-10:21Z): stopped before any run (rearm exit 13), no data.**
- The rearm read real Serious at 39.4 → 39.8 °C for 10 min.
- Cause on our side: `wdarestart` leaves Safari on B, the thermal gate's timer page, whose countdown and hero
  animations run forever, and the rearm ran without a park.
- Battery during the rearm: not charging (held at 80 %), -11 mA.
- Kit fix: `thermalrearm` parks Safari before `iphone.mjs rearm`, in every compositor-morph kit that has it (phone-c2,
  phone-v11, phone-c3, phone-c3ba, phone-c3bk, phone-c3bk6). The card's rules are unchanged.
- Added descriptive reader `phone-c3bk6/pre-o1.mjs`: was pre on at O1. Per run it lists the approach pauses in m
  (-1, 0] with their Paint/Composite records, and O1's f1+f2 paints and Composite.
- On P-160's runs it shows two pauses in range before O1, each about 1.4 s, at m -0.85 and m -0.23. So K6's
  200 ms rest timer has time to turn pre on.
