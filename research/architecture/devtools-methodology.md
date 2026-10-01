# Do we measure the way Chrome DevTools says to? A methodology gap analysis (arch-devtools, 2026-10-01)

User question: "do you measure following this guideline? developer.chrome.com/docs/devtools/performance/overview,
…/devtools/performance and other related pages. Research this."

This note covers **method and tooling**: setup, recording, what we collect, the statistics, and the tool changes.
`de-devtools` (design engineering) owns the render-pipeline side: frames, paint, layers, the Rendering tab, and what
to measure per frame. `arch-safari` owns Safari Web Inspector and iOS probing (`research/architecture/safari-inspector-probing.md`).
§5 here only compares what Chrome's guidance assumes with what the phone is.

Read-only: no Chrome, iPhone, locks or measurements. Public docs only, fetched 2026-10-01. Labels: **vendor doc**
(developer.chrome.com, web.dev, webkit.org), **vendor source** (devtools-frontend, Chromium, WebKit source), **spec**,
**blog**, **inference** (mine, unverified), **derived** (computed from our own committed data). Code refs are
`file:line` at `4516c0d`.

## 0. The answer in six lines

1. **For setup we follow the guidance, or go further.** Each run uses a clean profile and a fresh isolated
   context, mobile emulation, CPU throttling, and records the runtime phase after load. We are stricter in four
   places: ABBA ordering, n=5, a non-overlap verdict, and a host-load gate. Google's tutorial asks for none of these.
2. **Our main metric is not DevTools'.** We count rAF gaps (main-thread frame cadence). DevTools' Frames track and
   FPS meter classify *presented* frames: presented, partially presented, dropped, idle. Choosing rAF is right
   (the one metric that works the same on the iPhone). But we never check how far the two disagree, and our
   `--trace-frames` trace can't, because it lacks the category the Frames track is built from.
3. **The 6x throttle is a deliberate departure, and the better choice here.** Google suggests 4x/20x or a
   calibrated preset. Ours is calibrated against the target device's observed jank. Two caveats: the calibration
   used a frame logger that reads `scrollY`, and verify's default logger doesn't; and the mapping was fitted on the
   unfixed page.
4. **We collect no Core Web Vitals.** For a scroll study that is right for LCP and mostly right for INP (scroll
   isn't an interaction). CLS is the one that matters: layout shifts during a scroll *do* count toward CLS, and we
   never look.
5. **The biggest gaps are on the touch path and the GPU side.** We don't measure input latency on the iPhone's
   finger runs; Safari 26.2+ has Event Timing, so this is cheap. We don't check paint area or layer count in
   Chrome. Both blind spots can produce a "within noise" for a real change, or a win on the wrong device.
6. **Google's analysis workflow is out of reach as built.** Insights, Bottom-Up and Forced reflow need a trace
   file, and our tools never save one. One small change fixes that (§3, G6).

## 1. Guideline by guideline

Verdicts: **follow**; **differ** (deliberately, reason in §2); **gap**.

### 1a. Setup

| # | Google guideline (source) | ours | verdict | evidence |
|---|---|---|---|---|
| S1 | Incognito, "so that Chrome runs in a clean state" ([tutorial](https://developer.chrome.com/docs/devtools/performance), vendor doc) | Dedicated profile, no extensions. Every run opens a fresh `Target.createBrowserContext` (an incognito-like context: cold cache, no cookies). | follow (stricter) | `tools/verify.mjs:151`, `tools/lib/cdp.mjs:146-148`, `verify.mjs:328` |
| S2 | No extensions interfering (implied by S1) | Same profile as S1; headed, with occlusion and background throttling off | follow | `cdp.mjs:44-58` |
| S3 | CPU throttling "4x slowdown (or 20x for low-end mobile)" ([tutorial](https://developer.chrome.com/docs/devtools/performance)); calibrated low/mid-tier presets since Chrome 134 ([blog](https://developer.chrome.com/blog/devtools-grounded-real-world), vendor doc) | 6x, calibrated against iPhone 15 Pro Max scripted-scroll jank; applied only after load + settle | differ (§2b) | `fix.mjs:382`, `verify.mjs:360`; `research/cpu-throttle-calibration/README.md` |
| S4 | Network throttling preset (e.g. Fast 4G) and "Disable network cache" ([overview](https://developer.chrome.com/docs/devtools/performance/overview), vendor doc) | No CDP network throttling: the mirror server adds 150 ms latency, with no bandwidth limit. The cache isn't disabled, but every run's context starts cold. | differ (§2d) | `fix.mjs:63`, `verify.mjs:340` |
| S5 | Device mode / mobile emulation ([overview](https://developer.chrome.com/docs/devtools/performance/overview)) | 430x932, DPR 3, `mobile: true`, touch with 5 points, focus emulation | follow | `verify.mjs:83, 341-343` |
| S6 | "Hardware concurrency" override ([reference](https://developer.chrome.com/docs/devtools/performance/reference), vendor doc) | Not set. The Fastwork app code never reads `hardwareConcurrency` or `deviceMemory` (grep of `site-pretty/_app`, derived) | follow (n/a) | - |
| S7 | Throttling "is relative to your computer's capabilities" ([reference](https://developer.chrome.com/docs/devtools/performance/reference)); thermal, memory bandwidth and GPU aren't emulated ([blog](https://developer.chrome.com/blog/devtools-grounded-real-world)) | Mac load is gated and recorded (load1, other CPU, memory pressure, sleep); the iPhone gets thermal control runs | follow (stricter) | `verify.mjs:42-64, 448`; `fixes/iphone-wave2/README.md` "Thermal episode" |

### 1b. Recording

| # | guideline | ours | verdict | evidence |
|---|---|---|---|---|
| R1 | Record *runtime*, separate from load ("Record and reload" is for load) ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | Three runtime phases after load + settle: idle 6 s at the top, scripted scroll, touch "morph" push past the end | follow | `verify.mjs:348-409` |
| R2 | Interact by hand while recording ([tutorial](https://developer.chrome.com/docs/devtools/performance)) | Scripted: `scrollBy({top:250, behavior:'smooth'})` every 300 ms, then 4 synthesized touch gestures. Human finger runs only on the iPhone. | differ (§2e) | `verify.mjs:261-271, 401-402`; `tools/iphone.mjs:140-163` |
| R3 | Screenshots on while recording (filmstrip) ([tutorial](https://developer.chrome.com/docs/devtools/performance)) | Three still shots (top, middle, bottom) on an unthrottled reload in run 0, pixel-diffed against the baseline: a regression check, not a filmstrip | differ (fine) | `verify.mjs:413-429, 462-480` |
| R4 | Live metrics: LCP, CLS, INP ([overview](https://developer.chrome.com/docs/devtools/performance/overview)) | None | gap (G2, G4) | - |
| R5 | Memory checkbox: JS heap alongside the trace ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | Not collected; `Performance.getMetrics` returns heap and node counts, but `CDP_KEYS` drops them | gap (G7) | `verify.mjs:226-227` |
| R6 | "Enable advanced paint instrumentation", which "carries performance overhead" and feeds the Layers track and Paint profiler ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | None in verify. One-off CDP `LayerTree` in the countdown probe. | gap (G3) | `fixes/countdown-idle-raf/probe.mjs:41-49` |
| R7 | CSS selector stats, for `Recalculate Style` (adds overhead) ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | None, although style recalc is our biggest main-thread cost (`UpdateLayoutTree` 2951 ms of 11.4 s at 6x) | gap (G6) | `research/architecture/README.md` §0 |
| R8 | JS samples (call stacks) on by default ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | LoAF script attribution (≥ 5 ms scripts in ≥ 50 ms frames only); `--trace-frames` has no sampler category | differ / gap (G6) | `perf-page.mjs:17-26`, `trace-frames.mjs:35` |
| R9 | Recording overhead: DevTools turns optional instrumentation off by default ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | Untraced by default; traced runs are labelled "not comparable with untraced" | follow | `verify.mjs:30-37, 566` |

### 1c. Metrics and tracks

| # | DevTools track or meter | ours | verdict | evidence |
|---|---|---|---|---|
| M1 | **Frames track**: idle, presented, "partially presented … Chrome did its best to render at least some visual updates in time", and "dropped … can't render the frame in reasonable time" ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | rAF interval per frame; counts >20/34/50/100 ms, p50/p95/max, fps | differ (§2a), gap (G1) | `perf-page.mjs:14`, `verify.mjs:277-299` |
| M2 | FPS chart with red bars; Rendering tab "Frame rendering stats" (presented, partial, dropped, plus GPU memory) ([tutorial](https://developer.chrome.com/docs/devtools/performance); [Rendering tab](https://developer.chrome.com/docs/devtools/rendering/performance), vendor doc) | fps = frames / seconds from rAF; no GPU memory | differ | `verify.mjs:295` |
| M3 | Main track, Summary, Bottom-Up, Call tree ([overview](https://developer.chrome.com/docs/devtools/performance/overview)) | LoAF top scripts by `url:pos` and by file. `--trace-frames` splits each >20 ms frame into script, style, layout, paint, other and offMain self time. | follow, differently | `verify.mjs:277-310`; `trace-frames.mjs:1-33` |
| M4 | Forced reflow warnings and the Forced reflow insight; LoAF `forcedStyleAndLayoutDuration` for the field ([layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing), vendor doc) | `forcedLayoutMs` from LoAF; bench `readAfterWrite` and `layoutsPerFrame` counters | follow | `verify.mjs:305`; `automated-benchmarks.md` §2 |
| M5 | Interactions track (input delay, processing, presentation) and INP ([reference](https://developer.chrome.com/docs/devtools/performance/reference); [optimize INP](https://web.dev/articles/optimize-inp), vendor doc) | None. A one-off CDP touch-ack probe was blind (`measurement-review.md` §1, morph-scrolljack). | gap (G2) | - |
| M6 | Layout shifts track; the Rendering tab's "Layout shift regions" ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | None | gap (G4) | - |
| M7 | Animations track: flags non-composited animations ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | bench `animations` probe (`getKeyframes()` per target) | partial | `automated-benchmarks.md` §2 |
| M8 | GPU, Raster and Compositor tracks ([reference](https://developer.chrome.com/docs/devtools/performance/reference)) | Folded into `offMain` ("compositor/raster/GPU/vsync; GPU not separated") | gap (G1, G3) | `trace-frames.mjs:10-13, 55, 141` |
| M9 | Performance monitor: CPU, heap, DOM nodes, listeners, "Layouts and style recalculations per second" ([performance monitor](https://developer.chrome.com/docs/devtools/performance-monitor), vendor doc) | `--cdp-metrics` (opt-in): style/layout counts and ms, script ms per phase. bench uses `getMetrics` deltas. | follow (opt-in) | `verify.mjs:26-29, 226-238`; `lib/cdp.mjs:192-201` |
| M10 | Rendering tab: Paint flashing, Layer borders ([Rendering tab](https://developer.chrome.com/docs/devtools/rendering/performance)) | Nothing in Chrome. On the iPhone, Timeline paint count and area in research tools (large-area-blur). | gap (G3) | `fixes/large-area-blur/README.md:122-132` |
| M11 | Rendering tab: "Scrolling performance issues" (scroll-related listeners that may harm performance) | bench `listeners` probe (`DOMDebugger.getEventListeners`: type, passive) | follow | `lib/cdp.mjs:202-212` |
| M12 | RAIL: "produce each frame in 10ms or less"; the 16.7 ms budget ([RAIL](https://web.dev/articles/rail), dated 2020; [rendering performance](https://web.dev/articles/rendering-performance), vendor doc) | Absolute thresholds 20/34/50/100 ms. The goal is "no frame >50 ms, steady 60 fps" (`fixes/LEAD.md:14-16`). | differ (§2f) | `verify.mjs:297-298` |

### 1d. Analysis steps and fixes

| # | guideline | ours | verdict |
|---|---|---|---|
| A1 | Start from Performance insights; Bottom-Up; Call tree; Event log ([overview](https://developer.chrome.com/docs/devtools/performance/overview)) | No trace file is ever saved, so none of these can be opened on our runs. Traces are summarised in-tool, with the raw events dropped (`verify.mjs:391`: `events: te.events.length`). | gap (G6) |
| A2 | Find the long frame, then what ran in it ([tutorial](https://developer.chrome.com/docs/devtools/performance)) | `--frame-log` + `tools/frames.mjs` (long frames per scroll position); `--trace-frames` per-frame buckets; iPhone frame clusters by `scrollY` | follow |
| A3 | Compare against field data (CrUX) ([blog](https://developer.chrome.com/blog/devtools-grounded-real-world)) | Our "field" is one physical iPhone: scripted runs and finger runs | differ (right for a one-device goal) |
| A4 | Confirm on a real device for GPU-heavy styling: "GPU-intensive styling remains a blind spot" (paraphrase, [blog](https://developer.chrome.com/blog/devtools-grounded-real-world)) | CLAUDE.md "Confirm winners on the real iPhone"; `iphone.mjs scroll/record` | follow |
| F1 | Fixes: compositor-only properties, few layers ("Do not promote elements unnecessarily"), no layout thrash, light rAF-debounced input handlers, passive listeners ([compositor](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count), [thrash](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing), [debounce](https://web.dev/articles/debounce-your-input-handlers), vendor doc) | The same principles as our playbook (`research/architecture/README.md`, `apple-smooth-scroll.md` table, `fixes/FINDINGS.md`) | follow |

## 2. Where we differ on purpose, and where that could be wrong

**(a) rAF gaps instead of the Frames track and FPS meter.** *Why it's right:* rAF behaves the same in Safari, and
WebKit has neither LoAF nor a Frames track over our proxy, so it is the only per-frame metric on both devices. It
costs nothing (no tracing). The page's jank is main-thread-driven scroll-linked effects, and a rAF gap is exactly
those effects missing a frame (`iphone.md` caveats; `answers-2.md` headline 3). *Where it can mislead:*
- **It over-counts visible drops for scrolling itself.** Google: rAF polling "doesn't actually capture all types of
  animation updates", and a page can drop many main-thread frames "yet [show] smooth scrolling"
  ([smoothness](https://web.dev/articles/smoothness), vendor doc). Chrome would label many of our >20 ms gaps
  *partially presented* (the scroll moved, the JS effects didn't), not *dropped*. For our goal that is acceptable,
  because the effects are what stutters. But "frames >20 ms" is not "dropped frames" in DevTools' sense, and the two
  must never be quoted interchangeably.
- **It under-counts raster- and GPU-bound jank.** DevTools CPU throttling "doesn't touch the GPU process"
  ([blog](https://developer.chrome.com/blog/devtools-grounded-real-world), vendor doc), and LoAF doesn't measure
  "compositor or off-main-thread work" or presentation ([LoAF](https://developer.chrome.com/docs/web-platform/long-animation-frames), vendor doc).
  A blur that is slow to raster at DPR 3 can drop presented frames while rAF stays on time. This is why
  large-area-blur came out "flat" in Chrome and real on the phone (`measurement-review.md` §1). The Frames track
  (DroppedFrame events) would see some of it. We never record it (G1).
- **It mixes refresh rates.** Chrome's rAF runs at the Mac's 120 Hz, the iPhone's at 60 Hz. ">20 ms" is ≥ 2 missed
  vsyncs on the Mac and 1 on the phone (`iphone.md` "Normalising"). Our goal thresholds (34/50 ms) are absolute, so
  they are fine. `gt20` and `fps` are not comparable across devices (G8).

**(b) 6x instead of 4x/20x or a calibrated preset.** Google's presets come from a CPU benchmark scaled to "typical"
mobile devices. On this Mac they work out to mid-tier 2.8x and low-tier 10.3-10.8x
(`research/cpu-throttle-calibration/README.md`, derived). For CPU speed alone the iPhone matches Chrome at ≈1x.
What 6x reproduces is *this page's jank* on *the target phone* (distance 0.17 vs 0.60 at 4x and 13 at 20x, derived).
For a one-device goal, calibrating to the device beats calibrating to the CPU, so this is right. Three risks:
- The throttle is super-linear for DOM work (6x costs 7.8x on DOM benches, derived), so it may over-reward style
  and layout fixes relative to the phone.
- It touches only the main thread (see (a)), so it under-rewards GPU fixes.
- **The calibration logger read `scrollY` every frame** (`research/cpu-throttle-calibration/tools/chrome_scroll.mjs:126`).
  verify's default logger doesn't (`perf-page.mjs:14`; `--frame-log` adds the read, `perf-page.mjs:37-43`). The
  iPhone probes still do (`tools/iphone.mjs:54, 147`). In Blink a `scrollY` read can force pending style and layout,
  and the logger was the top rAF self-cost in the calibration traces ("(inline)" 6114 ms, `chrome-sweep.md:131`).
  So today's A/B runs do a little less forced work per frame than the runs that fixed "6x" (inference: mostly a
  shift of forced cost into the page's first reader, small net effect). Also, the mapping was fitted on the
  *unfixed* page. Waves change the mix of style, script and GPU work, so the Chrome-to-iPhone ratio can drift (G5).

**(c) Runtime-only, no Core Web Vitals.** LCP is a load metric, which we deliberately don't measure. INP observes
taps, clicks and keys; "hovering, zooming, or scrolling … are not observed" ([INP](https://web.dev/articles/inp),
vendor doc), so most of the study rightly ignores it. The exception is the touch that *starts* a scroll: `touchstart`
is an Event Timing event, `touchmove` is not ([Event Timing spec](https://w3c.github.io/event-timing/), spec). CLS is
the CWV that scroll *does* affect: "continuous interactions such as scrolls … are not considered 'recent input'"
([CLS](https://web.dev/articles/cls), vendor doc). So a scroll-linked height or position write that moves other
content counts toward field CLS (G4).

**(d) A latency-shaped server instead of CDP network throttling.** This is right. The same server shapes both
devices (the iPhone loads the same `--latency 150` mirror), and the browser under test stays untouched. Network only
matters at load, which we don't score. One small gap: no bandwidth cap, so lazy images that load during the scroll
arrive at localhost speed, and their decode and raster land earlier and denser than on cellular (inference, low
impact). Not disabling the cache is fine: every run gets a fresh browser context.

**(e) Scripted scroll instead of a manual recording.** This is right for A/B statistics (reproducible, ABBA,
clusters by `scrollY`). But the stimulus underestimates finger scrolling by about 2x in dropped ratio, and it never
triggers the toolbar resize (`iphone.md` §3). On iOS, `scrollBy` smooth is a UIKit animation (`answers-2.md` W2).
The touch morph phase and the iPhone finger tests cover the gap. Keep both, and keep calling the scripted number a
lower bound.

**(f) Thresholds instead of a per-frame budget.** The RAIL "10 ms" and the "~10 ms of work per 16.7 ms frame"
budgets ([rendering performance](https://web.dev/articles/rendering-performance)) are design targets for the work
inside a frame. Our counts are of missed deadlines, which is what users see. That is a fine translation; just don't
read ">20 ms = 0" as meeting RAIL.

**(g) Statistics.** Google's docs give no repeat-and-compare protocol. Ours is ABBA, n≥5, non-overlapping ranges,
an A/A floor, a host gate and a contamination flag. It goes beyond the guidance, and nothing here argues for less.

## 3. Real gaps, ranked by how much they could mislead a verdict or the goal (iPhone first)

"Measurement code" means it changes what an A/B run does or reports (Hard rule 6: toolsmith + reviewer, call it out,
`test:chrome`). An opt-in path, a one-off probe or a bench Tier A counter does not change existing A/B numbers.

| # | gap | concrete, low-cost addition | measurement code? | expected value |
|---|---|---|---|---|
| **G1** | **Presented vs main-thread frames.** We can't tell whether a rAF gap was a dropped, partial or fine frame, nor see GPU-bound drops (§2a). | Chrome: add `disabled-by-default-devtools.timeline.frame` to `TRACE_CATEGORIES` (`trace-frames.mjs:35`). DevTools always records it (`DefaultCategories`, [TraceEvents.ts](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/trace/types/TraceEvents.ts), vendor source). Count per phase `DroppedFrame` with and without `args.hasPartialUpdate` (the Frames track's dropped/partial rule, [FramesHandler.ts](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/trace/handlers/FramesHandler.ts) L345-346, vendor source), next to the rAF gaps of the same run. One traced A/A run gives the gap ↔ dropped/partial mapping. iPhone side: arch-safari. | yes, but opt-in (`--trace-frames` only; untraced A/Bs unchanged) | **High.** It answers "do our gaps match what Chrome calls dropped?" with data, and catches the raster-bound frames that make GPU fixes look flat. ~1 short traced run. |
| **G2** | **Touch input latency.** The goal is a *finger* scroll, but finger runs log only rAF; scroll-start blocking by non-passive `touchstart` is unmeasured on both devices. | iPhone: in `iphone.mjs record`, add `new PerformanceObserver(…).observe({type:'event', durationThreshold:16, buffered:true})` and keep `touchstart`/`pointerdown`/`touchend` entries (`startTime`, `processingStart − startTime` = input delay, `duration`). Event Timing ships in Safari 26.2+ ([web.dev](https://web.dev/blog/lcp-and-inp-are-now-baseline-newly-available), vendor blog); our phone runs 26.6.1. `touchmove` is excluded by spec, so this measures scroll *start*, not steady scrolling. Chrome: the `EventLatency.FirstGestureScrollUpdate.Touchscreen.TotalLatency2` histogram recipe in `answers-2.md` R1. | iPhone: no (device logging, finger runs aren't A/B'd by verify). Chrome: yes (new probe, own slot). | **High for the iPhone goal and for morph-scrolljack / nav-morph verdicts.** Today those rest on "feels better" finger runs. |
| **G3** | **Paint and layer checks.** Chrome records neither paint area nor layer count, so layer-diet and blur fixes are invisible in Chrome (P5) and the iPhone Timeline is the only paint evidence. | (a) `--trace-frames`: sum `Paint` count and `args.data.clip` area per phase, the same Mpx metric as the iPhone Timeline tool, for cross-device parity. (b) bench Tier A probe kind `layers`: `LayerTree.enable` + `layerTreeDidChange` layer count at named spots, as `fixes/countdown-idle-raf/probe.mjs:41-49` already does. Counts don't depend on load, so it fits the short lane. (c) arch-safari's Layers-tab counts for the phone. | (a) opt-in; (b) no (bench) | **Medium-high.** Prevents false "within noise" on GPU/raster fixes and catches layer explosions before the phone does. Web.dev: "Do not promote elements unnecessarily". |
| **G4** | **CLS during scroll.** Scroll-linked writes to height/position (shrink, morph, reveals) can create layout shifts that count toward field CLS, and we'd never see it, in either direction. | `layout-shift` PerformanceObserver as a bench Tier A counter (sum of `value` with `hadRecentInput === false` per segment, plus `sources[].node` selectors), or an opt-in `--layout-shift` in verify. Chrome only: LayoutShift is not Baseline ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift), vendor doc). | no as bench; yes if added to the default logger (keep it opt-in) | **Medium.** A real user-facing metric the guidance puts first. It also guards fixes that move layout work around, and backs layout→transform claims ("composited animations using translate … don't count toward CLS", [optimize CLS](https://web.dev/articles/optimize-cls)). |
| **G5** | **Calibration drift and the logger asymmetry** (§2b). | Re-run the calibration (Chrome 4/6/8x vs iPhone scripted) on the current landed overlay, once per wave. Use the *same* logger on both sides: either verify's (no `scrollY` read) on the iPhone probe, reading `scrollY` from a passive scroll listener, or `--frame-log` in Chrome. Record which in `results.json` config. | iPhone probe change: device tooling; Chrome: no change (flag exists) | **Medium.** Keeps "6x ≈ iPhone" true after the page changed, the premise of every Chrome verdict. ~1 slot + 15 min of phone per wave. |
| **G6** | **Google's analysis workflow can't be run on our data.** No saved trace, no JS samples, no invalidation tracking, no selector stats. | `--trace-frames --save-trace`: write `{traceEvents:[…]}` to `out/` (the events are already collected; it's written after the run, no timing effect) so the lead or user can open it in the Performance panel (Insights, Bottom-Up, Forced reflow). A separate one-off `--trace-deep` adds `disabled-by-default-v8.cpu_profiler`, `…devtools.timeline.invalidationTracking` and the selector-stats categories (`OptionalCategories`, TraceEvents.ts, vendor source). Diagnostic only, never an A/B. | save: no (after the run); deep: opt-in | **Medium.** It answers render.md's open question (which elements and selectors drive the 20-50 ms style frames) and lets the user check our numbers in DevTools. |
| **G7** | **Memory.** No heap, node or layer-memory record, though the phone's layer policy changes under memory pressure (`webkit.md` §4). | Add `JSHeapUsedSize`, `Nodes`, `LayoutObjects`, `JSEventListeners` to `CDP_KEYS` (`verify.mjs:226-227`; `--cdp-metrics` only). Phone layer memory: arch-safari. | opt-in path only | **Low-medium.** Catches leaks from lazy mount and observer fixes; layer memory matters more (phone). |
| **G8** | **Cross-device frame summaries.** `gt20` and fps are refresh-rate dependent (§2a). | In the summaries, add `iphone_analyze.mjs`'s missed-vsync "dropped ratio" with each device's own period. Report-only, computed from the existing frames. | report-only (summarize/ab) | **Low.** Prevents mis-quoting; no new data. |

**Not recommended:** the chrome-devtools MCP performance tools (Hard rule 8 stands: they hang under throttling and
ignore the lock); traces in every A/B (Google itself flags instrumentation overhead); CDP network throttling
(§2d); the Rendering-tab overlays as automated checks. Paint flashing and layer borders are visual aids, and G3's
counts are their machine-readable form.

**Order of work (one toolsmith incident, plus one for bench):** G6-save + G1 + G3a together in `trace-frames.mjs`
(one opt-in path, one review, one traced A/A). G2-iPhone in `iphone.mjs record` (small, no Chrome). G3b + G4 as
bench probe kinds. G5 as a lead-scheduled calibration slot. G7 and G8 whenever `verify.mjs` is next touched.

## 4. How we measure, in Google's terms (for the user)

> We follow the DevTools runtime-performance method. We use a clean, extension-free browser profile and a fresh
> incognito-like context per run, mobile device emulation (430×932, DPR 3, touch) and CPU throttling. We record the
> runtime only, after load: 6 s idle at the top, a scripted scroll to the bottom, and touch gestures past the end.
> Two choices differ from the tutorial on purpose. Our CPU throttle is 6x, not 4x or 20x: we calibrated it so that
> Chrome's jank on this page matches the real iPhone 15 Pro Max, which is what DevTools' own "calibrate" feature
> aims at, but against our actual target device. Our frame metric is the gap between `requestAnimationFrame`
> callbacks, plus the Long Animation Frames API for attribution. That is the main-thread view: it works the same in
> Safari, so we can compare against the phone. It is not the same as the Frames track's "dropped / partially
> presented" frames, and we're adding that view as a cross-check. We don't record full traces in A/B runs, because
> tracing slows the page; we use them one-off to explain frames. Every comparison is repeated 5 times per side in
> alternating order on a quiet machine, and only non-overlapping results count as a win. Winners are then confirmed
> on the real iPhone. Not yet covered: layout shifts during scrolling (CLS), touch input latency (INP's input delay),
> and paint/layer counts in Chrome. Those are the next additions.

## 5. Safari/iPhone: what Chrome's guidance assumes vs the phone

Everything about Web Inspector Timelines, Layers, the protocol over `ios_webkit_debug_proxy` and Instruments is in
`research/architecture/safari-inspector-probing.md` (arch-safari, in progress). Here, only the assumptions that
don't carry over:

| Chrome guidance assumes | on our iPhone | consequence for method |
|---|---|---|
| Mobile = slower CPU, so throttle the CPU | The A17 Pro ≈ the Mac at 1x on a CPU bench (`iphone.md` §1). The jank comes from WebKit's style costs, 60 Hz rendering and touch-only paths. | "6x" is a jank match, not a CPU match (§2b). Never quote it as "the iPhone is 6x slower". |
| The GPU is roughly comparable, so throttling the main thread is enough | The GPU and raster at DPR 3 are real costs on the phone (blur, layers), and Chrome's throttle leaves the GPU alone | GPU fixes need phone evidence (G3, arch-safari) |
| LoAF and the Frames track exist | WebKit has no LoAF. Web Inspector's Frames view is per runloop on the main thread ([Rendering Frames](https://webkit.org/blog/3996/introducing-the-rendering-frames-timeline/), vendor doc). Timeline timestamps are 0 over our proxy (`research/01-initial-investigation/README.md:39`). | rAF gaps stay the cross-device metric; attribution on the phone comes from Timeline counts |
| Scroll runs on the compositor; rAF jank ≠ scroll jank | The same holds on iOS: page scroll is a UIKit animation in the UI process (`answers-2.md` W2) | Our metric means "scroll-linked effects stutter" on both devices, consistently |
| INP/Event Timing and CLS available | Event Timing and LCP since Safari 26.2 ([web.dev](https://web.dev/blog/lcp-and-inp-are-now-baseline-newly-available)); no LayoutShift ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift)) | G2 works on the phone; G4 is Chrome-only |

## Sources

Vendor doc: https://developer.chrome.com/docs/devtools/performance/overview ·
https://developer.chrome.com/docs/devtools/performance · https://developer.chrome.com/docs/devtools/performance/reference ·
https://developer.chrome.com/docs/devtools/performance/timeline-reference (legacy event reference, 2015-era) ·
https://developer.chrome.com/docs/devtools/rendering/performance · https://developer.chrome.com/docs/devtools/performance-monitor ·
https://developer.chrome.com/blog/devtools-grounded-real-world · https://developer.chrome.com/docs/web-platform/long-animation-frames ·
https://web.dev/articles/rendering-performance · https://web.dev/articles/rail (2020) ·
https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing ·
https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count · https://web.dev/articles/debounce-your-input-handlers ·
https://web.dev/articles/smoothness · https://web.dev/articles/inp · https://web.dev/articles/optimize-inp · https://web.dev/articles/cls ·
https://web.dev/articles/optimize-cls · https://webkit.org/blog/3996/introducing-the-rendering-frames-timeline/ ·
https://webkit.org/web-inspector/timelines-tab/ · https://webkit.org/web-inspector/layers-tab/ ·
https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift.
Vendor blog: https://web.dev/blog/lcp-and-inp-are-now-baseline-newly-available.
Spec: https://w3c.github.io/event-timing/ (considered event types; `touchmove` and `wheel` excluded; minimum
`durationThreshold` 16 ms).
Vendor source: devtools-frontend `front_end/models/trace/types/TraceEvents.ts` (`DefaultCategories`,
`OptionalCategories`, PipelineReporter states) and `front_end/models/trace/handlers/FramesHandler.ts` (DroppedFrame,
`hasPartialUpdate`; the frames handler is marked "legacy", migrating to AnimationFrame events), main branch, read
2026-10-01.
