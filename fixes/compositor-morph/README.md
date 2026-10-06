# Research: compositor-morph (end-of-page nav morph with compositor-only properties, scroll-driven)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft prototype (CM v1) on v9-final. Nothing here lands without the user's pick (user T-204 #27/#29):
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
| **CM v1.1** | CM v1 + two fixes found by the after-close probe (below): `html.fw-cm-out` holds off the nav's width / background transitions on the frame `.is-morphing` drops; the Join button keeps today's unmask animation in its list, so it no longer replays; `delta.diff` (this folder) | **887b4cde06eb / 2948d49e47c6** |

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

## Phone card (ticket draft; predictions frozen before any phone data, 2026-10-06 11:15Z, row A revised 11:50Z)

**Question (one):** under the G driver (WDA robot finger, the E procedure of P-152/P-155), does CM v1.1 remove the
WebKit main thread's per-frame Layout and most of its Paint in the morph frames, while the per-frame style pass
stays (step 1)? Counts from Safari's Timeline, no timing claim (memory defer-timing-focus-call-tree).

| item | value |
|---|---|
| arms | C = v9-final (control), V = CM v1.1, same base; snapshot `out/cm/snap` (read-only, rebuilt 11:36Z for v1.1), `HASHES.txt` 8926d9f97923 (C JS 647c9ef2b1e2 CSS e1359ab9994a, V JS 887b4cde06eb CSS 2948d49e47c6, probe P index.html fab9522e5c50 probe.js 657015b37fee), checked by `phone/cm-serve.sh` before every start and part |
| servers | `phone/cm-serve.sh start`: plain http (I-003), `--latency 150 --vendors=local`, B (thermal gate page), C, V, P (probe) |
| driver / script | G, `fixes/morph-scroll/g-fastshort-v1.json`, compiled program 8737f212c0ff, GESTURE_BUDGET_S 229; probe `phone/g-probe-v1.json`, 7ff27a2413c8, GESTURE_BUDGET_S 150 |
| profile | xcode-serious (no heat pre-warm, no cooling wait; `CM_COOL=0`), the sentinel decides validity |
| order | WC, WV (uncounted warm-ups, Timeline off, `--warmup`), EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4 (counted, Timeline on), TAIL (at most 2 re-runs of runs that failed a P-129 run gate), S1 (uncounted Timeline-off end sentinel on C), then AN AS AR (attribution, probe page `?v=none|sda|raf`, Timeline on, uncounted) |
| holds | one item per 600 s chrome-measure `--no-timing` hold inside one phone hold `--block <ticket> --max-seconds 3600` (`phone/cm-block.sh`, a copy of P-155's runner); before every hold: park Safari, WDA check (else `wda ensure`); every part starts with the served-hash check, `iphone.mjs wda ensure` (I-220, 5803d436: keeps a ready WDA; exit 4 = re-plug, the block stops and the lead is told) and a Safari restart (I-214) |
| kit pins (sha256/12) | `phone/cm-hold.sh` 14d205b17331, `phone/cm-block.sh` 4d7accc06889, `phone/cm-serve.sh` 66c9f9ff4e53, `phone/cm-read.mjs` bed0fe10d768, `g-fastshort-v1.json` df597802d2f0, `phone/g-probe-v1.json` 05c8bda33b07, `p129-gates.mjs` a06847c64a2e, `p129-read.mjs` 06f74f5d19ca, `thermal-gate.mjs` ecb403b3ad25, `pmcheck.mjs` d36bd7437b7c; every hold prints them (`PIN` line) |
| dry run (c) | 2026-10-06 11:31:53-11:33Z on head 054e8bdd (main with I-220, 5803d436): all 14 holds `DRY ok` (pins, served hashes C/V ok, compiled programs fs 8737f212c0ff budget 229 s and pr 7ff27a2413c8 budget 150 s, one item per hold), `wda check` READY; logs `out/cmp/hold-H*.log` (not committed) |
| budget per hold | E/W/S items 229 s (P-155's holds of the same script took 219-234 s); A items 150 s; 14 holds, about 1.5-1.8 h with the restarts; three phone holds of at most 3600 s each (11-13 holds in one would need under ~4.6 min per hold): part 1 = WC WV EC1 EV1 EV2 EC2 EC3 (7 holds, ~45 min), part 2 = EV3 EV4 EC4 TAIL S1 (4-7 holds), part 3 = AN AS AR (3 holds, ~15 min); a hold whose next item would end past 600 s is VOID (7) and re-run once |
| reader | `phone/cm-read.mjs` (`--selftest` 6 checks): morph frames = rows in the lastScreen band that moved with 0 < m < 1 (P-155's `mOf`); per frame the Layout / Paint / RecalculateStyles records that start in (t - dt, t]; P-129 run gates role E. Probe runs: every moved frame, ungated |

Calibration (not this block's data): P-155's C runs read with the same reader (EC1-EC3, fix-end-morph's runs):
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

Revision note (11:50Z, before any phone data): row A first said "AS Layout ≤ 0.1, AN style ≤ 0.1 per frame" in
absolute numbers. The Simulator probe (11:31Z, WDA strokes) shows the probe page itself lays out and restyles in some
frames without any animation (AN: 0.30 layouts and 0.26 style recalcs per frame; AS: 0.37 and 1.32, style in every
frame), so A is now judged against AN. P1-P4 are unchanged. V changed from CM v1 to v1.1 at 11:36Z: the two fixes act
only on the frame the morph ends, outside the counted morph frames (0 < m < 1).

Between the marks (P1 0.3-0.6, P2 0.5-0.8, P3 0.5-0.8): "partial", reported as such, no landing claim. The block
names no frame-time or fps prediction; the P-129 gates and the sentinel (bottom ≥ 58 and scroll ≥ 44 fps) only
decide validity.

PENDING-SECTIONS
