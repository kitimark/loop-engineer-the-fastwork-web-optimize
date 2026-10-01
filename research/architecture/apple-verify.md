# apple-verify: runtime check of the apple.com scroll-animation findings

By `apple-verify`, 2026-10-01. This is the runtime follow-up to [apple-smooth-scroll.md](apple-smooth-scroll.md),
which was static analysis only. It answers that doc's §6 "Open points" where Chrome can, and gives a verdict for
each claim in §2/§3 that a page script can observe. Not affiliated with Apple or Fastwork. No Apple code is stored
in the repo. Quotes are one-liners with their URL.

**Short answer.** Apple's scroll engine does what the doc says. It reads scroll positions only, not rects. It
writes inline styles on the moving element, skips unchanged values, sleeps at rest, and toggles `will-change` per
card. Three of the four pages are smooth under our calibrated throttle, with almost no script in long frames.
Five things the static read missed or got wrong:

1. At 430x932 Apple serves its **static base tier**, because 932 px is taller than any Safari viewport.
2. Apple's **analytics** re-reads 200-440 element offsets on every scroll event (a debounce bug). It costs
   nothing measurable when layout is clean.
3. The **iPhone 18 Pro page is janky** at 6x: about 31-37 fps, 35-50 frames >50 ms, 0.7-1.1 s of forced layout in
   `onscroll`. It also arms a **non-passive document `touchmove`** at load, from its 3D viewer.
4. "Composite-only" is **not** strict. A shared component writes `width`/`height` on leaf elements every frame on
   three pages.
5. About 35-80 elements keep a **static `will-change`** besides the per-card windows.

## 1. Method

| | |
|---|---|
| browser | chrome-devtools MCP Chrome (dedicated profile, not signed in, default Chrome UA). No `performance_*` MCP tools (Hard rule 8). All numbers come from in-page scripts. |
| lock | 5 `chrome-measure` holds, all ≤ 10 min, MCP pages closed after each, servers started and stopped inside the hold. Hold 1: 00:09:49-00:13:47Z, load 4.77→3.41. Hold 2: 03:21:06-03:26:11Z, 2.05→1.43. Hold 3: 03:32:53-03:40:17Z, 1.46→1.19. Hold 4: 03:47:26-03:52:58Z, 2.38→2.35. Hold 5: 04:55:39-04:58:49Z, 1.57→2.10. Hold 1 ran on a **loaded host**. Holds 2-5 were quiet (load < 2.5). |
| emulation | mobile, DPR 3, touch, **CPU 6x**. The Apple pages ran at **430x739**, not 430x932 (§2). |
| scroll | rAF-driven `scrollTo`, linear top to bottom in **9 s**. Before it: 4 s wait, 1.5 s settle, 3 s idle at the top. After it: 3 s idle at the bottom. Apple pages are 21-34k px tall at this width, so the speed is **2700-3800 px/s**, about a flick. Our page is 5.2k px (570 px/s). `verify.mjs` uses `scrollBy({top:250, behavior:'smooth'})` every 300 ms, about 830 px/s. |
| light run (timing) | separate navigation with only a rAF frame logger and a `long-animation-frame` observer (`buffered:true`, per-script `forcedStyleAndLayoutDuration`). All fps and frame-class numbers come from this run. |
| instrumented run (counts) | separate navigation with counting wrappers installed by `initScript` before any page script. **Reads:** `getBoundingClientRect`, `getClientRects`, `elementFromPoint(s)`, `getComputedStyle`, `offset*`, `client*`, `scrollTop/Height/Width`, plus `scrollY` and `innerWidth/Height`. Each read is bucketed per rAF frame, tagged with its context (scroll listener / page rAF / other), with a 1-in-3 call-stack sample. **Writes:** a subtree `MutationObserver` on `style`/`class` with old values, diffed per property and class token. **Other:** page rAF requests and time, `scroll` listener calls, `addEventListener` for scroll/resize/wheel/touch/pointer (target, `passive`, call site), `HTMLMediaElement.currentTime` setter, `seeking`/`seeked`, `drawImage`/`getImageData`, WebGL draws, `transitionrun`/`animationstart`. The wrappers cost time (100-430k counted reads per 9 s scroll), so this run's fps is not used for timing. |
| sweep | after the instrumented run, at 0/15/30/50/70/85/100 % of the page (3 points on MacBook Pro and on our page): computed `will-change` (count, in view, values), `content-visibility`, `backdrop-filter`, and `document.getAnimations()` with the properties they animate. |
| raw data | `out/apple-verify/*.json` in this worktree (gitignored; per-page `-light`, `-collect`, `-sweep`). |

One run per page, no repeats. Treat differences under about 20 % as noise.

## 2. Our viewport is not a Safari viewport, so Apple served its base tier at 430x932

At 430x932 all four pages put `no-enhanced no-inline-media` on `<html>` and run the static base tier. The shared
head script lists `InvalidViewport.smallTall: "(max-width: 734px) and (min-height: 927px)"` in all four pages'
bundles, e.g. https://www.apple.com/v/iphone-18-pro/b/built/scripts/overview/head.built.js. 932 px is the full
screen height of a 6.7-inch iPhone. Safari's visible viewport is shorter (about 740-830 CSS px, depending on the
toolbar), so to Apple a 932 px-tall phone viewport is a resized desktop window.

The enhanced tier was measured at **430x739**. Two more selection quirks under Chrome emulation:

- **Vision Pro** still fell back to base with cause `"ipad"`: a touch device that is not iOS Safari. Its head
  script honours a query override, `if(window.location.search.includes("enhanced"))return!0`
  (https://www.apple.com/v/apple-vision-pro/l/built/scripts/head.built.js), so it was measured as
  `/apple-vision-pro/?enhanced`. This answers the doc's §6 open point about a debug switch: `?enhanced` / `?base`.
- `document.documentElement.causeForBase` holds the reason for the base tier (`"ipad"`, `"text zoom"`, ...). It is
  a cheap check before trusting any measurement of an Apple page.

For us this changes nothing about the calibration, since CPU 6x was calibrated against 430x932. But at 932 px more
of our page is visible per frame than on the phone. Posted as F-016.

## 3. Per-page results

### 3.1 Frame timing (light run, scroll phase, 9 s)

| page (430x739 unless noted) | tier | fps | p95 ms | max ms | >20 | >34 | >50 | LoAF ms | LoAF script ms | forced style+layout ms |
|---|---|---|---|---|---|---|---|---|---|---|
| iPhone 18 Pro | enhanced | 31.2 | 87.5 | 1262 | 79 | 43 | 35 | 5166 | 4205 | 703 |
| AirPods Pro 3 | enhanced | 76.4 | 27.5 | 141 | 107 | 14 | 2 | 226 | 6 | 0 |
| MacBook Pro | enhanced | 76.0 | 28.2 | 75 | 109 | 19 | 2 | 129 | 51 | 27 |
| Vision Pro `?enhanced` | enhanced | 105.5 | 15.1 | 197 | 27 | 6 | 2 | 374 | 0 | 0 |
| Vision Pro | base (`ipad`) | 98.7 | 15.3 | 234 | 24 | 6 | 5 | 976 | 0 | 0 |
| iPhone 18 Pro, 430x932 (instrumented run only) | base (viewport) | 58.4* | 47.1* | 192* | 126* | 64* | 19* | 595* | 216* | 157* |

\* Instrumented run, inflated by the wrappers; hold 1, loaded host.

- **iPhone 18 Pro.** The light run started about 5 s after the load event while the 3D viewer was still loading.
  Its largest LoAF scripts are `autopricing.built.js` rAF callbacks (1323 ms over 24 frames) and
  `vendors~lotus-lib.built.js` (1120 ms rAF + 824 ms `arrayBuffer` handling). The engine's own `onScroll`
  shows 635 ms, **558 ms of it forced layout**. The instrumented run started 4 s later, after initialisation,
  and is still bad: 37 fps, 50 frames >50 ms, 1102 ms forced in `onscroll` over 45 events.
- **AirPods, MacBook, Vision Pro.** 2 frames >50 ms each and almost no script inside long frames. The many
  20-34 ms frames on AirPods and MacBook are **rendering-bound**, not script-bound (they carry no LoAF script time).
- Idle phases: 120 fps on every page except the iPhone page's first idle (still loading).

### 3.2 Per-frame layout reads (instrumented run, scroll phase)

| page | layout reads / frame, mean (p95) | `scrollY` reads / frame | `scrollTop` reads / frame | `getBoundingClientRect` total | `getComputedStyle` total | `elementFromPoint(s)` | reads in scroll listeners |
|---|---|---|---|---|---|---|---|
| iPhone 18 Pro | 300 (310) | 4.1 | 30 | 2 | 26 | 0 | 99.5 % |
| AirPods Pro 3 | 204 (211) | 4.1 | 16 | 2 | 0 | 0 | 99.7 % |
| MacBook Pro | 268 (274) | 4.1 | 24 | 0 | 23 | 0 | 99.6 % |
| Vision Pro `?enhanced` | 440 (448) | 4.0 | 0 | 0 | 31 | 0 | 99.7 % |

Where the reads come from (call-stack samples):

- **Almost all of them are Apple's analytics, not the animation engine.** Every sampled `offset*` read is in
  `ac-analytics.js` `refreshElementMetrics` → `getPagePosition` (an `offsetTop`/`offsetParent` walk per tracked
  element). The cause is a debounce that is rebuilt on every call:
  `_onScroll(){return l((()=>{this.refreshMetrics(),this._checkForPageEnd()}),300,y)()}` with
  `l = debounce` and `y = {leading:!0}` (https://www.apple.com/metrics/ac-analytics/2.30.0/scripts/ac-analytics.js).
  A fresh leading-edge debounce runs every time, so all tracked elements are re-measured on **every scroll event**.
  The same library's `ElementTracker` does use metrics cached on resize, as the doc said. Posted as F-017.
- **The engine reads scroll positions only.** It reads `scrollY` once per `scroll` event (`onScroll(){n.pageMetrics.scrollY=window.scrollY||window.pageYOffset,…}`).
  It also reads `scrollTop` for each scroll group bound to a horizontal gallery: the window `onScroll` calls
  `updateTimeline()` on every group, and a gallery group's `getPosition` is `()=>t.scrollTop`. That gives 16-30
  `scrollTop` reads per frame. No rect reads and no hit tests per frame.
- **Reads are cheap when layout is clean.** Vision Pro does 440 offset reads per frame and has **0 ms forced
  layout**, at 105 fps. AirPods does 204 reads per frame with 0 ms forced.
- **The iPhone page pays for read-after-write:** 558 ms (light run) to 1102 ms (instrumented) of forced layout
  inside `onscroll`. The engine's `onScroll` runs every group's `updateTimeline` synchronously, and event or class
  keyframes fire inside it. The likely mechanism is a gallery group's `scrollTop` read after an earlier group
  wrote; the measurements don't prove which write.

### 3.3 Style writes per frame (instrumented run, scroll phase)

| page | records / frame mean (p95) | elements / frame mean (p95) | elements written in total | frames with a write | properties written (count over 9 s) | no-op style writes | writes at idle (top / bottom) |
|---|---|---|---|---|---|---|---|
| iPhone 18 Pro | 23 (60) | 13 (34) | 356 | 290/333 | opacity 5025, transform 3131, **width 1153, height 608**, `--var` 646, class 343 | 2.0 % | 0 / 0 |
| AirPods Pro 3 | 21 (59) | 11 (27) | 255 | 629/637 | opacity 7297, transform 5439, `--var` 3587, **width 2479, height 1057**, class 330 | 2.4 % | 0 / 0.1 |
| MacBook Pro | 21 (60) | 11 (27) | 255 | 487/653 | opacity 6087, transform 5502, `--var` 4408, **width 3149, height 1353**, class 372, clip-path 13 | 2.6 % | 0 / 0 |
| Vision Pro `?enhanced` | 2.3 (7) | 2 (7) | 174 | 785/979 | transform 712, stroke-dashoffset 672, opacity 346, `--var` 165, class 491 | 0 % | 0 / 0.4 |

- **The written elements are leaves.** The most-written elements have 0-26 descendants (`.all-access-pass__intro-element`
  0, `.all-access-pass__background` 0, tab-nav `li.control-item` 24-26, SVG `circle` 0). Custom properties are
  written on the element that uses them. No custom property is written on a section root or on `html`/`body`.
- **Layout properties are written per frame.** The `width`/`height` writes all come from one shared component
  (the "All Access Pass" intro/background elements and the tab-nav icons). It is a leaf, so each write relayouts
  a small subtree.
- **Epsilon gating works.** 2-2.6 % of style mutations leave the value unchanged, and nothing is written at rest.
- **Discrete state changes are class toggles** at range boundaries: `staggered-start`/`staggered-end`,
  `will-change`, `loaded`, `playing`/`paused`, and on MacBook Pro `ac-localnav-dark`/`-light` (nav theme by range,
  with no hit test: 0 `elementFromPoint` calls).

### 3.4 Layers, animations, listeners, media

| page | `will-change` elements across the sweep (in view) | `will-change` class toggles in the scroll (+/−) | values seen | `content-visibility` ≠ visible | animations (sweep) | page rAF callbacks at idle top (3 s) |
|---|---|---|---|---|---|---|
| iPhone 18 Pro | 81-85 (1-18) | 16 / 16 | transform, opacity, both (+10 with computed "", unidentified) | 3 | 51: opacity+transform 46, width 1, transform 1, background-position-x 1, opacity 2 | **360 (every frame, 0.3 ms)** |
| AirPods Pro 3 | 58 (1-12) | 14 / 14 | transform, opacity, both | 0 | 38: opacity+transform 34, width 1, transform 1, opacity 2 | 0 |
| MacBook Pro | 71-81 (1-12) | 21 / 21 | transform, opacity, both | 0 | 56: opacity+transform 48, color 2, background-color 1, width 1, transform 2, opacity 2 | 0 |
| Vision Pro `?enhanced` | 35-47 (0-11) | 9 / 10 | transform | 0 | 17: opacity+transform | 0 |

- **Listeners on window/document** (all pages): `scroll` ×4-5, `resize` ×4-6, `orientationchange`, plus `touchstart`/
  `touchend` on document/body from the global nav and locale switcher. On AirPods, MacBook and Vision there is
  also `touchmove` on window (local nav). None of these sets `passive`, and touch listeners on window, document
  and body default to passive in Chrome and Safari.
- **The one exception is the iPhone 18 Pro 3D viewer.** `vendors~lotus-lib.built.js` adds `touchmove`/`touchend`
  on **document** with `{passive:!1}` from its `addEventListeners()` at setup, not on gesture start
  (`const t={passive:!1};…document.addEventListener("touchmove",this.onTouchMove,t)`,
  https://www.apple.com/v/iphone-18-pro/b/built/scripts/vendors~lotus-lib.built.js). Setup runs twice and removes
  the first pair, so **one non-passive document `touchmove` stays armed** while the viewer exists.
- **Video scrub:** `currentTime` is set once per frame while the scrub section is in range, and never at rest.
  Counts: iPhone camera scrub 9 writes (the section passes in about 0.3 s at this speed), AirPods `#design` 15,
  Vision `#technology-displays` 33. Chrome completes fewer seeks than it starts (`seeked` 4-16 of 11-41
  `seeking`), so seeks coalesce.
- **Canvas image sequence (Vision Pro):** not present at 430 px. There are 0 `<canvas>` elements; the scroll
  video keyframes carry `breakpointMask:"XLM"` and `disabledWhen:["no-enhanced","ipad"]`. Only a desktop-width
  run (or a real iPad) can test it.
- The iPhone page draws WebGL (4603 `drawElements` during the scroll, one canvas). Something keeps a page rAF loop
  running every frame at rest with no GL draws; the source was not attributed (the 3D viewer is the likely one).

## 4. Claim verdicts

| # | claim (apple-smooth-scroll.md) | verdict | numbers |
|---|---|---|---|
| §2.1 / P1 | Per frame the engine reads only `scrollY`; geometry is cached | **CONFIRMED for the engine** | 4 `scrollY` reads/frame, plus 16-30 `scrollTop` reads for gallery groups; 0-2 `getBoundingClientRect` and 0-31 `getComputedStyle` per 9 s; 0 hit tests |
| §2.1 / P1 | …so the page reads no layout per frame | **REFUTED page-wide** | analytics reads 204-440 `offset*` per frame on every page (per-call debounce bug) |
| §2.1 | No read-after-write, so no forced layout | **CONFIRMED on 3 pages, REFUTED on iPhone 18 Pro** | forced ms: AirPods 0, Vision 0, MacBook 27, iPhone 703 (558 in Apple's own `onScroll`) |
| §2.6 | Analytics computes view state from metrics cached on resize | **REFUTED (partly)** | `ElementTracker` yes; `_onScroll` → `refreshMetrics()` re-measures on every scroll event |
| §2.1 / P2 | One rAF executor; the loop sleeps when nothing changes | **CONFIRMED on 3 pages, REFUTED on iPhone 18 Pro** | page rAF callbacks at idle: 0 (AirPods, MacBook, Vision, iPhone base); 360 per 3 s on iPhone enhanced (3D viewer, not attributed further) |
| §2.1 / P3 | Out-of-range groups return before any DOM work | **CONFIRMED (in effect)** | 11-13 elements written per frame (p95 27-34) of 255-356 written over the whole page |
| §2.2 / P4 | Writes go on the moving element (own `--var`), not on roots | **CONFIRMED** | the most-written elements have 0-26 descendants; no root or `html` variable writes |
| §2.2 / P4 | Write only when the value moved (epsilon 0.05) | **CONFIRMED** | 0-2.6 % no-op style writes; 0 writes at rest |
| §2.2 / P5 | Transitions/animations are opacity/transform; one `clip-path` exception | **PARTLY REFUTED** | CSS animations mostly opacity+transform (1 `width`, 1 `background-position` and color animations exist). Per-frame JS writes include **width/height** on leaves (1.8-4.5k per scroll on 3 pages), `stroke-dashoffset` (Vision), `clip-path` 13 (MacBook) |
| §2.2 | `will-change` values only transform/opacity | **CONFIRMED** | sweep: transform, opacity, both (plus 10 elements whose computed value is "", unidentified) |
| §2.3 / P6 | Per-card `will-change` windows | **CONFIRMED (mechanism)** | `will-change` class +/− 9-21 times per scroll, at most 12 elements carry it at a sampled point |
| §2.3 / P6 | …so layers exist only near the viewport | **REFUTED** | 35-85 elements have a static `will-change` at every scroll position, mostly off-screen (1-18 in view) |
| §2.3 | Margins are `t - 150vh` / `b + 50vh` (0.5 viewport) | **NOT OBSERVABLE** (this run) | toggles seen; their scroll positions were not logged |
| §2.4 / P8 | Video scrub = one `currentTime` write per frame in range | **CONFIRMED** | 9-33 writes per section, 0 at rest |
| §2.4 | Vision Pro canvas image sequence with `drawImage` | **NOT OBSERVABLE** at 430 px | 0 canvases; keyframes masked to `XLM` and disabled on `ipad` |
| §1 | No `content-visibility` | **CONFIRMED (3 of 4)** | 0 elements on AirPods/MacBook/Vision; 3 on iPhone 18 Pro (source not identified) |
| §2.6 / P7 | Only scroll/resize on window; touch listeners only during a gesture | **CONFIRMED on 3 pages, REFUTED on iPhone 18 Pro** | the 3D viewer arms document `touchmove` `{passive:false}` at setup |
| §2.7 / P13 | The tier is picked once at load | **CONFIRMED, with new causes** | `smallTall` (≥ 927 px tall) and `ipad` force base; `?enhanced` overrides on Vision Pro; `html.causeForBase` names the cause |
| §2.8 / P9 | Reveals play once, then drop `will-change` | **CONFIRMED** | `-staggered-start`/`+staggered-end` toggles (iPhone 29/58); opacity+transform JS writes on headlines; no filter writes |
| §2.9 / P10 | Nav theme from declared ranges, no hit test | **CONFIRMED** | MacBook: `ac-localnav-dark/light` class flips, 0 `elementFromPoint` |
| §6 | Frame-time claims (smooth on the phone) | **CONFIRMED on 3 of 4 pages, under Chrome 6x** | 76-105 fps and 2 frames >50 ms on AirPods/MacBook/Vision; iPhone 18 Pro 31-37 fps. Not an iPhone measurement. |

## 5. Approximate comparison with our page

Two sources. **(a)** The same script, run on our mirror in hold 5 at **430x739**: baseline and wave1-partial,
one light run each plus one counting run on the baseline, scrolled with `scrollTo({behavior:'instant'})`. The
servers were `serve.mjs --root site-pretty --vendors=local --latency 150`, plain http, and the wave1-partial
overlay was hash-checked against `results.json`. **(b)** `fixes/wave1-partial/results.json`: `fix.mjs ab`, 5 runs
ABBA, **430x932**, https, `verify.mjs` smooth `scrollBy` at about 830 px/s. Our page is 5.2k px tall at 430x739,
so a 9 s top-to-bottom is **570 px/s**; Apple's pages ran at **2700-3800 px/s**. Neither source compares
like-for-like scroll speed, so read the table as a picture of where the cost sits, not as an A/B.

| | viewport, px/s | fps | p95 ms | >20 | >34 | >50 | LoAF script ms | forced ms |
|---|---|---|---|---|---|---|---|---|
| ours baseline, same script (1 run) | 739, 570 | 111.1 | 13.6 | 9 | 2 | 1 | 49 (gtag `onscrollend`) | 0 |
| ours wave1-partial, same script (1 run) | 739, 570 | 87.3 | 17.4 | 23 | 4 | 2 | 62 | 8 |
| ours baseline, results.json (median of 5) | 932, ~830 | 74.9 | 25.1 | 65 | 10 | 4 | 144 | 44 |
| ours wave1-partial, results.json (median of 5) | 932, ~830 | 95.4 | 17.3 | 24 | 6 | 5 | 114 | 25 |
| AirPods Pro 3 | 739, 2693 | 76.4 | 27.5 | 107 | 14 | 2 | 6 | 0 |
| MacBook Pro | 739, 3777 | 76.0 | 28.2 | 109 | 19 | 2 | 51 | 27 |
| Vision Pro `?enhanced` | 739, 2743 | 105.5 | 15.1 | 27 | 6 | 2 | 0 | 0 |
| iPhone 18 Pro | 739, 3714 | 31.2 | 87.5 | 79 | 43 | 35 | 4205 | 703 |

- The two single same-script runs of our page differ by more than the wave-1 effect: baseline 111 fps vs
  wave1-partial 87 fps, one run each, and the wave1-partial run has one 224 ms frame. Treat this as **noise, not a
  regression**. The 5-run ABBA in `results.json` is the verdict for wave 1.
- **At 430x739 and a slow scroll our page is already smooth in Chrome 6x:** 1-2 frames >50 ms and 0-8 ms forced
  layout, against 4-5 and 25-44 ms at 430x932 in `verify.mjs`. The taller viewport (more of the page laid out and
  painted per frame, F-016) and the slower verify scroll both play a part. This method does not separate them.
- **Per-frame reads, same script.** Our baseline does **12 layout reads per frame** (p95 15). Per frame: about 6
  `getBoundingClientRect`, 1 `getComputedStyle` and 1 `elementsFromPoint` from the engine callbacks in page rAF
  (stacks: nav `ee()`/`F`/`_` at JS 13010-13067, commission/future `l` at JS 11340-11360, JS 4190), plus about 1
  each of `clientWidth/Height` and `scrollWidth/Height/Top` from gtag. That is far fewer reads than Apple's
  analytics does (200-440), but ours are rects in rAF and Apple's engine reads none. 0 ms forced layout in this
  run, so the reads were clean here.
- **Per-frame writes, same script.** Our baseline writes 7.5 records per frame (p95 20) on 60 elements: almost all
  `transform` on countdown `span.face` leaves, plus 100 `--var` writes. That is lower than Apple's 21-23 on
  AirPods, MacBook and iPhone.
- **At rest our page keeps working; Apple's does not.** Idle at the top: 143 page rAF callbacks in 3 s and 4 style
  records per frame. Idle at the bottom: 286 callbacks and 8 records per frame (countdown faces). Apple's AirPods,
  MacBook and Vision pages: 0 and 0.
- **Layers.** Our `will-change` count is 103 at the top (93 in view), 15 mid-page and 7 at the bottom (hold 4
  sweep). Apple's is a flat 35-85, mostly off-screen.
- **Listeners.** `window` `wheel` and `touchmove` are registered `{passive:false, capture:true}` at load (the morph
  scroll-jack, before nav-morph #6), and `document` `pointerdown`/`pointermove` `{passive:false}`. Apple's AirPods,
  MacBook and Vision pages have no non-passive window/document listener.
- **Hold 4's scroll phase on our page was invalid** and is not used. Our CSS sets `html { scroll-behavior: smooth }`
  (`2.gBuqKVzi.css` 11738-11740), so a per-frame `scrollTo(0, y)` kept retargeting a smooth scroll: 0 scroll
  events during the drive. Hold 5 repeated it with `behavior:'instant'` (1000 scroll events in 9 s). Any per-frame
  scroll driver on our page must do the same (F-021).

## 6. What it changes in apple-smooth-scroll.md §5 (ranked next actions)

| rank | action | change |
|---|---|---|
| 1 | N10 transition-frames, per-element `will-change` windows | **Keep at 1.** The per-card toggling is real (9-21 toggles per scroll, ≤ 12 elements at once). Apple still keeps 35-85 static `will-change` elements, so the lesson is "no bulk flips at section boundaries", not "zero permanent layers". Our 103 at the top, 93 in view, is the outlier. |
| 2 | `scroll-metrics-cache` | **Keep, but change the success metric.** Our baseline does 12 rect/style reads per frame in rAF, with 0 ms forced at 739 px and 44 ms at 932 px. Apple's pages show that reads in a clean-layout scroll handler are cheap: 440 reads per frame, 0 ms forced, 105 fps. The cost is read-after-write: the iPhone page pays 0.6-1.1 s. Verify with LoAF `forcedStyleAndLayoutDuration` → about 0, not with "reads per frame → 0". Do the work before writes, or from cached offsets. |
| 3 | N11 vendor-scrollend | **Unchanged.** Apple's own analytics carries a per-event re-measure bug (F-017). Check gtag/GTM for the same per-call debounce/throttle pattern while deferring. |
| 4 | nav-theme-ranges | **Confirmed as Apple's approach:** class flips by range, 0 hit tests per frame (MacBook Pro). Unchanged. |
| 5 | N4 custom-property-scope / `--morph` element-local | **Confirmed:** Apple writes `--var` only on the consuming leaf. Unchanged. |
| 6 | N2 morph-composited | **Slightly lower priority.** Apple writes `width`/`height` per frame on small leaves and still reaches 76 fps at 6x. The real problem is layout writes on large containers with descendants (our morph panel), not layout properties as such. Keep the clip-path plan for the large panel. |
| 7 | countdown-idle-raf variant 05 | **Raise priority (to 5 or 6).** At rest our page runs 48-95 page rAF callbacks/s and writes 4-8 records per frame. Apple's loop sleeps (0) on every page except the one with the 3D viewer. On the phone, idle work costs commits and battery even when Chrome shows 120 fps. |
| 8 | reveal-without-blur | Unchanged (no Apple reveal writes a filter). |
| new | nav-morph #6 / P7 | **Supported.** The only Apple page with a non-passive document `touchmove` armed at rest (iPhone 18 Pro) is also the only janky one. That is not causal proof, but it argues for keeping the scroll-jack listeners unarmed until the morph is engaged. |
| method | measurement | (a) F-016: any per-frame comparison with the phone or another site should note that 430x932 shows more content per frame than Safari does. (b) F-021: page scripts that scroll our page must pass `behavior:'instant'`. (c) Before trusting an Apple measurement, check `html.enhanced` and `causeForBase`. |

## 7. Limits and open points

- One run per page, in Chrome with CPU throttling. Not Safari, not the iPhone. WebKit's UI-process scrolling and
  compositor behave differently. A Web Inspector Timeline on the test phone remains the only phone-level check.
- The iPhone 18 Pro light run overlaps with late page initialisation (3D viewer, pricing). The instrumented run
  waited 4 s longer and was also janky, but its fps carries wrapper overhead. A repeat light run with a longer
  settle would give a clean number.
- Vision Pro's canvas `VideoScroll` (desktop breakpoints) and the 0.5-viewport `will-change` margins were not
  measured. The Low Power validator was not exercised.
- Our page was measured at 430x739 with one run per variant. The speed mismatch with Apple (570 vs 2700-3800 px/s)
  is not corrected. Matching px/frame would need a 1.5-2 s scroll of our page, or a 40-60 s scroll of Apple's.
