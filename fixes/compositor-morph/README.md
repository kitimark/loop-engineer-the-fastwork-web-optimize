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
