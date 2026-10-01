# Our render metrics against Chrome DevTools' rendering guidance (de-devtools)

Design-engineering note by `de-devtools` (2026-10-01), method and notation as in [`README.md`](README.md). The user
asked whether our performance measurement follows Google's DevTools guidance
(https://developer.chrome.com/docs/devtools/performance/overview, …/performance/reference, …/rendering/performance)
and the rendering model behind it (https://web.dev/articles/rendering-performance). This note covers the **render
pipeline** side:
- where each of our hotspots sits in the docs' pixel pipeline;
- what DevTools' Performance panel and Rendering tab would show that we don't capture;
- the per-frame budget in the docs' terms.

Division of work:
- `arch-devtools` owns method and tooling (recording protocol, throttling, statistics);
- `de-safari` owns the iOS/WebKit signals (Web Inspector, the Layers tab, Instruments): §3 here is only a pointer.

This is a read-only study: no Chrome, no iPhone, no locks, no tool edits. Labels:
- **vendor doc**: developer.chrome.com, web.dev;
- **vendor source**: Chromium/DevTools frontend or WebKit `main`, read 2026-10-01;
- **spec**;
- **data**: our logs, file named;
- **derived**: my arithmetic;
- **inference**: my reasoning; check it.

## 0. Verdict in seven lines

1. **The docs' pipeline names every hotspot correctly**, but it has only five cost terms (JS, style, layout, paint,
   composite). Our iPhone models need three more:
   - **backing-store reallocation** on resize (WebKit drops a resized store, F1);
   - **raster on the critical path** (on iOS it is not off-thread as in Chrome);
   - **commit back-pressure** from GPU work (F3).

   The docs' fixes (transform/opacity, smaller paint areas, read-before-write, fewer layers) match ours on 7 of 8
   hotspots. They differ on one: the morph, where the docs' "promote it" advice is exactly what makes WebKit pay
   per frame (§2).
2. **Our Chrome measurement follows the docs on the main thread.** We have:
   - CPU throttling, calibrated as the docs recommend (6x ≈ iPhone);
   - the rAF logger;
   - LoAF (`forcedStyleAndLayoutDuration`, `renderStart`), which the docs name for forced reflow;
   - `--trace-frames` script/style/layout/paint buckets with style `elementCount`.

   It skips the **render-side** half: no Frames track (presentation), no paint area, no layer counts, no invalidation
   attribution.
3. **The real blind spots are two.**
   - **(a) Paint area per frame:** our models *derive* every Mpx figure, and the raster rates came out about 2x
     wrong.
   - **(b) Presentation:** rAF gaps can't credit threaded animations, so the main gains of hero v2, morph R3
     (WAAPI) and a countdown WAAPI strip are invisible to our verdicts by construction.
4. **Mostly redundant for us:** Layout Shift, Frame Rendering Stats, the scrolling-issues overlay and CSS selector
   stats. We have equal or better counts, or the signal doesn't bear on these hotspots.
5. **A Chrome trap the docs don't warn about:** DevTools' own source marks the trace `Paint` event's `clip` as
   "unreliable and often wrong" (vendor source). A paint-area metric must come from CDP `LayerTree.layerPainted`, not
   from trace clips.
6. **Under 6x, Chrome slows only the main thread.** Raster and GPU stay unthrottled (render.md Q10). So
   presentation signals don't transfer to the iPhone, while **areas and counts do**: they are device-agnostic.
7. **Top 3 additions (§6):**
   - (1) per-frame durations from WebKit's Timeline (`de-safari`; the execution stopwatch, §3);
   - (2) per-frame paint area and per-layer paint counts in Chrome (`verify.mjs --paint-rects`);
   - (3) Frames-track presentation states in `--trace-frames`.

## 1. The docs' model, and where WebKit/iOS adds terms

**The docs' pipeline** (vendor doc, web.dev rendering-performance): JavaScript → Style → Layout → Paint → Composite.
It runs one of three ways:
- **full:** a geometric property changes, so Style > Layout > Paint > Composite;
- **paint-only:** e.g. colour or box-shadow, so Style > Paint > Composite;
- **composite-only:** "the most efficient approach for animations".

Compositor-only properties are "transform and opacity" (web.dev stick-to-compositor-only-properties). Each layer
"requires memory and management". "Paint is often the most expensive part of the pixel pipeline", and the browser
unions paint areas (web.dev simplify-paint-complexity). Forced synchronous layout and thrashing are fixed by "batch
your style reads and do them first" (web.dev avoid-large-complex-layouts). Style cost ≈ elements × selector matching
(web.dev reduce-the-scope-and-complexity-of-style-calculations).

**Our formula, written in the docs' stages** (README method 4):

| docs stage | our term | where it runs on iOS | where it runs in Chrome (6x) |
|---|---|---|---|
| JavaScript | `T_js` | WebContent main | main (throttled) |
| Style | `S·c_el` (S = restyled elements, inherited custom props fan out) | main | main (throttled) |
| Layout | `T_layout` | main | main (throttled) |
| Paint | `Σ A_i/R_i`: **record and raster** | main / GPU-process replay, **on the commit path** | record on main (throttled); **raster on worker threads, unthrottled** |
| (none) | `B/R_alloc`: fresh backing stores (resized store dropped, F1) | main | raster tiles are reused; Chrome invalidates per tile (inference) |
| Composite | `T_commit` + layer creation `c_L` | main (commit) | main `Layerize`/`Commit` (throttled) |
| Composite (GPU) | `T_rs`: blur/backdrop passes, offscreen groups | render server, **serial via F3** | GPU process, unthrottled, pipelined |

So the docs' "Paint" is one box for what Chrome splits into a cheap throttled recording and an unthrottled raster.
On iOS it is one expensive main-path box. That is why the morph is invisible in Chrome (110 fps, 0 frames > 50 ms;
morph-endpage §2) and 29-35 ms on the phone.

## 2. Q1: every hotspot in the docs' pipeline

"Stage" is the docs' name for the dominant cost. "Docs' fix" paraphrases the web.dev articles above.

| hotspot (iPhone cost, source) | what changes per frame | stage (docs) | docs' fix | our fix | agree? |
|---|---|---|---|---|---|
| **Morph panel resize** (g 29-35 ms moving p50; gh −7-10; morph-endpage §6) | nav `width/height` from `--morph`; %-sized panel children resize | **full pipeline**: Layout → Paint (+ WebKit's reallocation, not in the docs) | animate transform/opacity, not geometry; promote what moves | gh (size-stable panel, center/footer/veil by transform); a1/R2 (box fixed, `clip-path` mask, colour by opacity layer) | **yes on the fix, no on the cause.** The docs would say "promote it"; it already is a layer, and on WebKit a *promoted* layer that resizes repaints in full every frame (F1). Promotion is the problem, not the cure. |
| **Morph backdrop / filter radii** (nav backdrop ~4-8 ms est.; panel+platform filters 2-7 ms measured as gb; ghb −3 more) | `backdrop-filter: blur(20px·(1−m))`, panel and `#platform` `filter` radii | docs: **Paint complexity** ("blur and shadows are expensive"); really **Composite/GPU**, coupled to main by F3 | avoid expensive effects while animating; find cheaper alternatives | R8 (gate the blurs off where provably invisible, exact); ghbn (diagnostic); R7 fixed radius + opacity (design call) | **partly.** The docs file blur under paint. On both engines a backdrop is a compositor effect; on iOS its cost reaches the frame only through commit back-pressure (F3, inference). The docs have no word for that. |
| **Morph first frame** (49-54 ms driver, 91-96 finger) | scene flip `active`: ~88 layers created, cold tile raster, high-quality image resample | **Composite** (layer creation) + Paint | "manage layer count", promote ahead of time, "don't promote without profiling" | R5 (keep the track layers / activate on arm), R6/h3 (one strip per digit) | **yes.** The docs' "promote before animating" is R5(b). |
| **0.72 flip** (2 × 43-63 ms, hero §2B) | `visibility` toggles on the future card (inherits: S = 450-1150), `is-hero-pill` off, first raster of a 4 Mpx card, `blur(14px)→none` transition | **Style** (scope) + **forced style** (thrashing: nav `ee()` `getComputedStyle` pays 21.7 ms in Chrome, F-029) + **Paint** (first raster) | reduce the number of invalidated elements; read before write; compositor-only properties | h1 (`opacity:0` + `inert` pre-raster, matching filter lists), N12 (cached ranges, no dirty read) | **yes.** One WebKit-only addition: mismatched filter lists aren't threaded (webkit.md §1). The docs' advice is only "transform and opacity". |
| **y≈1960 image `src` burst** (86-114 ms, iphone-wave2 §3c: ≥ 12 `src` sets in the frame, 9/9 runs) | morph IO assigns ~12-21 `src` on a pre-mounted, invisible panel | **JavaScript** (IO callback) → image load/decode → **Paint**. The split on the phone is unmeasured | RAIL idle: do non-urgent work in idle chunks ≤ 50 ms; lazy-load | `mw10e-src` (`src` in idle time; middle R1, apple a2) | **yes.** The docs' pipeline has no "decode" box (Chrome files `Decode Image` under painting). Which stage the 90 ms is on the phone is exactly what a per-frame Timeline would answer (§3). |
| **Countdown layers** (160 face layers; 1 Hz idle spikes 35-58 ms; 85 created at morph start) | rAF spring writes `transform` on ≤ 10 faces per digit | **JavaScript + Style**, composite-only per write; **Composite** (layer count/memory) | "do not promote elements unnecessarily"; transform-only animation | h3 (one 12-glyph strip per digit, no per-face `will-change`, or WAAPI `linear()`) | **yes.** The docs say "aim for compositing to take around 4-5 ms during scrolling" (web.dev compositor-only). Our counts say it is the *creation*, not the count, that breaks the budget (apple §5.4). |
| **Section background switches** (`is-pain-dark` y≈888, `.commission.shrinking`; 10-20 ms once, middle §3.1) | a class swaps the background of a section whose painted layer holds text and 11 notes | **Style → Paint** (paint-only path over ~3.6-4.6 Mpx) | reduce paint areas; promote and fade by opacity | middle R2 / apple 5: an empty `::before` solid-colour composited layer (WebKit's direct-colour path, 0 backing) | **yes.** The WebKit solid-colour path is a sharper version of "promote it": no backing at all. |
| **Feed repaint** (373 × 344 every frame over y 1600-2500, 2-5 ms/frame; cause unattributed, middle §3.8) | unknown: an animating paint property or an unpromoted rotation | **Paint** (paint-only path, every frame) | Paint flashing to find it; promote it or switch to transform; pause off-screen | middle R3: name it first (Timeline at y≈1900), then a layer or transform + an IO pause | **yes**, and the docs' first tool for it (paint flashing / invalidation tracking) is the one we lack (§4.2). |
| **Hero exit** (JS path: 2.3-5.8 ms style/frame + 3 flushes; y≈50 43 → 35 ms with v2; hero §1-2) | `--exit-opacity` written on `.hero` (inherits: S ≈ 230 for 7 consumers), a rect read in its own rAF | **Style** (scope) + **forced layout** + Composite (opacity/transform/filter) | reduce style scope; read then write; compositor-only properties | h2: scroll-driven animations (threaded in Safari 26.4+); `@property inherits:false` fallback | **yes.** Its main gain (threaded, presented even when main is late) is the one rAF gaps can't show (§4.1). |
| (touch path) morph `touchmove` frames +10-30 ms (morph-endpage §2) | non-passive `touchmove` on `window` | not a pipeline stage: **input → main** (RAIL Response) | passive listeners; the Rendering tab's "scrolling performance issues" | #6 (passive, blocking only while morphing) | **yes** |

**Where the docs' model is not enough for our numbers (derived):**
- the reallocation term `B/R_alloc` (29 MB per morph frame in g);
- the GPU term entering the frame time serially (F3);
- the "first resize paints at high quality" spike (`ImageQualityController`).

The docs' budget wording ("browser overhead… ~6 ms") hides all three in the browser's share. On a phone whose raster
is on the commit path they are the page's share (§5).

## 3. Q3: WebKit / iPhone equivalents (pointer)

`de-safari` owns this question: see [`safari-render-signals.md`](safari-render-signals.md). Two vendor-source facts
from my reading, handed over:
- **Why iOS Timeline timestamps are 0 over the proxy (vendor source):**
  - `InspectorTimelineAgent::timestamp()` returns `executionStopwatch().elapsedTime()`, and record times go through
    `fromMonotonicTime()` (`Source/WebCore/inspector/agents/InspectorTimelineAgent.cpp`).
  - `WTF::Stopwatch` returns elapsed 0 (and `nullopt` from `fromMonotonicTime`) when it was never `start()`ed
    (`Source/WTF/wtf/Stopwatch.h`).
  - Not one of `Timeline.start`, `toggleInstruments`, `ScriptProfiler.startTracking` or
    `PageInspectorController::connectFrontend` starts it. `InspectorDebuggerAgent` only stops and restarts an
    already-active stopwatch around pauses.
  - So our session never starts the clock (inference). What Safari's own frontend does differently (another
    command, or the `frame` target that iOS 26 also exposes) is the open check.
- **What exists in the protocol JSON** (`Source/JavaScriptCore/inspector/protocol/*.json`):
  - Timeline records `Paint` (with `data.clip`, a quad), `Composite`, `Layout`, `RecalculateStyles` and
    `RenderingFrame`;
  - `LayerTree.Layer` has `paintCount`, `memory` and `compositedBounds`, plus `reasonsForCompositingLayer`;
  - `Memory.trackingUpdate` has a `layers` category;
  - `Page.setShowPaintRects` and `Page.overrideSetting(ShowDebugBorders | ShowRepaintCounter)`;
  - `CPUProfiler` reports per-thread usage.

  Per-layer `paintCount` and `memory` would replace our *derived* per-layer areas and MB on the phone.

## 4. Q2: what DevTools would show that we don't capture

What we have, Chrome side:
- the rAF frame logger (`perf-page.mjs`);
- LoAF ≥ 50 ms with `renderStart`, `styleAndLayoutStart` and per-script `forcedStyleAndLayoutDuration`;
- `--cdp-metrics` (`Performance.getMetrics` counts and durations per phase);
- `--trace-frames`: per-frame script/style/layout/paint/other/offMain buckets, from `toplevel`, `devtools.timeline`,
  `disabled-by-default-devtools.timeline`, `blink.user_timing` and `v8.execute`;
- bench counts: writes, layout reads, animations inventory, listeners, getMetrics deltas;
- a few one-off probes with `LayerTree` (countdown, infinite-animations).

iPhone side:
- the rAF logger and the morph driver logs (8.33 ms quantized);
- 1 s-chunk Timeline counts with paint rects (large-area-blur /03, middle §3.8);
- the R3 mutation logger (named the y≈1960 `src` burst).

| DevTools signal | what it shows (vendor doc) | our nearest | blind spot for **verdicts**? | for **cost models**? |
|---|---|---|---|---|
| **Frames track** | per frame: idle / presented / **partially presented** ("did its best to render at least some visual updates in time") / **dropped** | rAF gaps; trace `offMain` bucket | **yes, for threaded refactors** (§4.1); no for main-thread A/Bs | small: Chrome's GPU and raster are unthrottled, so its dropped frames aren't the iPhone's |
| **Paint events + paint rects** (paint profiler with advanced instrumentation) | which layer painted, when, how much | Chrome: paint *ms* only (trace bucket). iPhone: rects per 1 s chunk | **yes in Chrome**: a paint-only regression costs raster threads, invisible at 6x | **yes**: every Mpx in our notes is derived; rates were ~2x off |
| **Layerize / layer tree per frame** (Layers tab) | layer count, creation, compositing reasons, per frame | lumped into `paint`; ad-hoc LayerTree probes | partly (layer creation in a frame: morph first frame, the 0.72 reveal) | **yes** for `c_L` and the allocation term; Chrome ≠ WebKit layerization |
| **Layout Shift** track / regions | boxes that moved without input | none | no (scroll pages aren't scored on CLS for these frames) | no: layout cost is already in style/layout ms and counts |
| **Paint flashing** | repainted areas, live, in green | none in Chrome; iPhone rects per chunk | as a *visual*, no | one-shot attribution (the feed rect) |
| **Layer borders** | layers (orange/olive) and tiles (cyan) | none | no | one-shot: tile vs single buffer (F1's 1280 px threshold) |
| **Frame Rendering Stats** | fps, frame timeline (rendered / partial / dropped), GPU raster state, GPU memory used/max | rAF logger | no: visual only, and the Frames track holds the same data in a trace | GPU memory: a weak proxy for Σ 36·A (Chrome's GPU ≠ iOS) |
| **Scrolling performance issues** | elements with scroll-related listeners | bench `listeners` probe (passive flag); CDP `eventListeners` | no: redundant | no |
| **Layers panel memory** | per-layer memory estimate and reasons | derived `B = 36·A` | no | **yes on iOS** (WebKit's `LayerTree.memory`, §3); Chrome's figure applies to Chrome only |
| (also) **Animations track** | per animation, non-composited ones flagged | bench `animations` inventory (no composited flag) | partly: the threaded/not-threaded question is engine-specific | small (WebKit's rules differ: filter lists) |
| (also) **invalidation tracking**, **CSS selector stats** | which node and rule invalidated style/layout/paint; selector match cost | trace `UpdateLayoutTree.elementCount` (S) | no | invalidation: **yes** for attribution; selector stats: refines `c_el` only |

### 4.1 Presentation vs rAF gaps: the one verdict-level blind spot

- **What a rAF gap is.** It measures the main thread's frame cadence: when the next `BeginMainFrame` could run.
- **What the Frames track adds.** It classifies presentation. In Chrome the compositor keeps presenting scroll and
  composited animations while the main frame is late. Those frames are "partially presented", not dropped (vendor
  doc, web.dev/articles/smoothness). The same article warns that rAF polling "doesn't actually capture all types of
  animation updates".
- **Case 1, main thread late, compositor on time.** The rAF gap reads 50 ms; the user sees scroll and threaded
  animations move at full rate. Our verdicts then **can't credit** a refactor whose point is to move an animation
  off the main thread:
  - h2 (hero exit on a scroll timeline);
  - morph R3 (WAAPI with the exact easing);
  - a countdown `linear()` WAAPI strip.

  Their rAF-gap gain is only the main-thread work they remove, so far smaller than what the user sees. For example,
  morph R3's "frames no longer depend on the main thread during touch" (morph-endpage R3) shows up as no rAF change
  at all (inference).
- **Case 2, main thread on time, presentation late** (GPU or raster slow). In Chrome at 6x this is rare (inference): GPU and
  raster run unthrottled. On iOS, F3 back-pressure stretches the *next* rAF gap, so the rAF logger sees it one frame
  late, not never. **So for the iPhone the rAF logger is less blind than in Chrome**, and the 8.33 ms quantization
  reflects real presentation slots (morph-endpage §6).
- **Verdict.** Our main-thread A/Bs are consistent: rAF against rAF, calibrated against iPhone rAF. The blind spot is
  *what the user saw* for threaded refactors.
  - **Chrome:** the Frames track's states per phase (dropped / partial / all presented) close it.
  - **iPhone:** no web API reports presentation. Safari's Rendering Frames timeline (de-safari) or a screen-capture
    frame diff would.

### 4.2 Paint area and layers: the cost-model blind spot

- **The models rest on derived areas.** de-morph's areas, de-middle's 1.15 Mpx feed rect and de-apple's budget rows
  (Mpx, MB, layers created) are all derived. de-morph had to back out an effective raster rate from the gh ablation
  (≈ 0.6-0.9 Gpx/s, 2x its assumption).
- **The fix is a measured area A per frame**, together with the iPhone deltas: `R = ΔA/Δt` per hotspot instead of
  one assumed mix.
- **Chrome's area is device-agnostic** but engine-specific:
  - it tells which elements paint in which frame, and how much;
  - Chrome invalidates per tile and doesn't drop a resized store, so Chrome's A is a **lower bound** on WebKit's A
    for resizing layers (inference);
  - it is exact for the paint-only switches (background, feed).
- **The source to use.** The trace `Paint` event's `clip` is not usable: "This rect is unreliable and often wrong.
  We'll remove it" (devtools-frontend `models/trace/types/TraceEvents.ts`, crbug 41402938; vendor source).
  - CDP `LayerTree.layerPainted` (layerId + clip per paint) is the usable source. Our infinite-animations probe
    already uses it.
  - The trace category `disabled-by-default-devtools.timeline.invalidationTracking` names the node that invalidated
    the paint. That is DevTools' route to "why did this repaint", which is the feed rect's open question.
- **Layers.** Our `paint` bucket hides `Layerize`, `UpdateLayerTree` and `Commit` (trace-frames KINDS). Split out,
  plus `LayerTree.layerTreeDidChange` counts per frame, they would show layer creation inside a frame:
  - the morph first frame's ~88 layers;
  - /10c's will-change window flips;
  - the 0.72 reveal.

  These are the "no bulk layer creation" rule (apple §2.6) in Chrome terms.

### 4.3 What is redundant

- **Layout Shift:**
  - our layout terms are counted (`LayoutCount`, Layout `dirtyObjects`, LoAF forced);
  - the hotspots with layout (people-o, the nav morph) are known by code;
  - CLS scores don't map to frame cost.

  Keep it only as a parity guard for refactors that might move boxes (R1 title wrap, h4). The frozen-frame diff
  already does that.
- **Frame Rendering Stats** and **paint flashing** are live overlays for a human. Their data is in the trace and
  `LayerTree` events above.
- **Scrolling performance issues** = our listeners probe.
- **CSS selector stats:** the style term is dominated by scope S (inherited custom properties: 230 or 150 or 1150
  elements), not by selector cost. `elementCount` is enough.

## 5. Q4: de-apple's iPhone budget in the docs' terms

**The docs' budget.**
- RAIL: "Produce each frame in an animation in 10 ms or less… the maximum budget for each frame is 16 ms…
  browsers need about 6 ms to render each frame" (web.dev/articles/rail, vendor doc).
- rendering-performance: "all of your work needs to be completed inside 10 milliseconds".

**de-apple's budget (§3).**
- 16.7 ms frame. Fixed: JS ≈ 1, commit ≈ 2, rendering-update walk ≈ 1, composite under F3 ≈ 3-4 ms.
- That leaves 8-12 ms variable: style 3, layout 2, raster 3, allocation and new layers 2 ms.

**Reconciliation (derived).**
- de-apple's fixed share (commit 2 + walk 1 + composite 3-4 = **6-7 ms**) matches RAIL's "~6 ms to render".
- de-apple's 8-12 ms matches RAIL's 10 ms.
- One difference: RAIL counts raster in the browser's 6 ms, which is true in Chrome, where raster is off-thread. On
  iOS, raster and allocation sit on the commit path, so they come out of **the page's 10 ms**. A page that is
  "within RAIL" by DevTools' own Painting category can still miss the phone's frame.
- Two device facts the docs don't have:
  - Safari's rAF runs at 60 Hz while the panel presents at 120 Hz. A frame just over 16.7 ms costs 25 ms (3 × 8.33),
    not 33.
  - Under F3 the GPU time adds instead of overlapping.

| budget line (de-apple) | docs' term | hotspots over it | Chrome measurement that verifies it | have it? | iPhone measurement |
|---|---|---|---|---|---|
| JS ≈ 1 ms | Scripting | none (morph JS ~1 ms) | trace `script` bucket; LoAF scripts | yes | Timeline `FunctionCall` counts (have); durations need §3 |
| style 3 ms = 120-300 elements | Rendering: Recalculate Style, "Elements affected" | 0.72 flip (450-1150), hero JS exit (230/frame), morph (~150 + `#platform`) | trace `UpdateLayoutTree.elementCount` per frame | **yes** (`styleElements`) | Timeline `RecalculateStyles` counts (have); per-frame ms via §3 |
| layout 2 ms, 0 dirty reads | Rendering: Layout; Forced reflow insight | morph g (nav subtree), people-o (slow finger only), nav `ee()` | Layout `dirtyObjects`; LoAF `forcedStyleAndLayoutDuration` | **yes** | Timeline `Layout` counts (have) |
| raster 3 ms ≈ 1.5 Mpx text/images | Painting (record) + raster (off-thread in Chrome) | morph g 3.9-10.4 Mpx, y≈1830 3.6 Mpx, feed 1.15 Mpx/frame, 0.72 first raster 3-4 Mpx | **area**: `LayerTree.layerPainted` per frame. **ms**: not representative (raster unthrottled) | **no** (§6 rank 2) | Timeline `Paint` rects per chunk (have); per frame needs §3; per layer `paintCount` (de-safari) |
| allocation + new layers 2 ms ≈ 10 MB or 1 card | Composite: Layerize, layer count, Layers panel memory | morph g 11-29 MB/frame, morph first frame ~88 layers, /10c window flips 7-13 ms | layer count delta per frame (`layerTreeDidChange`); `Layerize` ms split out | **no** (rank 4) | `LayerTree` count and `memory` at positions (de-safari) |
| blur ≲ 7 Mpx GPU; changing radius counts as paint | Painting "complexity" (docs); GPU in fact | morph ≈ 9 Mpx changing (nav backdrop, panel, `#platform`) | none: GPU unthrottled, Chrome's blur ≠ CA | **no, by design** | ablations (gb, ghb, ghbn) only; Timeline `Composite` counts |
| rAF at rest = 0 | RAIL Idle | countdown 1 Hz, accent 3.15 s, 48-95 rAF/s at rest | idle-phase rAF count, LoAF | yes | idle Timeline counts (have) |
| frame ≤ 16.7 ms presented | Frames track: presented / partial / dropped | all the above | `PipelineReporter` states | **no** (rank 3) | rAF logger (8.33 ms ticks); Rendering Frames (§3) |

## 6. Ranked measurement additions (render cost models and verdicts)

Value = how much it improves a model term or a verdict on the hotspots, per unit of cost. "Measurement code" means it
changes what `verify.mjs`/`lib/cdp.mjs`/`fix.mjs ab` record. Such a change must be called out (Hard rule 6) and
needs `npm run test:chrome`. An **opt-in** flag leaves default A/B runs comparable.

| rank | addition | tool to change | measurement code? | cost | value |
|---|---|---|---|---|---|
| 1 | **Per-frame durations from WebKit's Timeline** (start the execution stopwatch, §3), giving style/layout/paint/composite ms per frame on the phone | `de-safari`'s probe, then `tools/iphone.mjs` (a `timeline` mode) | no (iPhone tool; not part of Chrome A/B) | one investigation session (which command starts the clock) + a toolsmith change with a fake-proxy test | **highest**: turns every iPhone term from derived to measured, settles the raster rate, splits the y≈1960 frame (decode vs paint vs JS) |
| 2 | **Per-frame paint area and per-layer paint counts in Chrome**: `LayerTree.enable` + `layerPainted` rects, bucketed by rAF frame, summed Mpx per phase, top rects with layer and node | `tools/verify.mjs --paint-rects` (opt-in) + `lib/cdp.mjs`; or a bench probe kind `paintArea` | **yes** (opt-in; `LayerTree` adds per-commit overhead, so it only compares with other `--paint-rects` runs) | ~1 toolsmith day + fake-CDP tests | **high**: measured A_i per hotspot (lower bound for WebKit resizes, exact for paint-only switches); catches paint regressions that 6x hides; finds the feed rect's owner |
| 3 | **Frames-track presentation states** in `--trace-frames`: add `disabled-by-default-devtools.timeline.frame`, count `PipelineReporter` dropped / partial / all-presented per phase | `tools/lib/trace-frames.mjs` + `verify.mjs` summary | **yes**, inside the already-opt-in traced runs (traced runs are not comparable to untraced ones anyway) | low: one category + a parser + tests | **medium-high for verdicts**: credits threaded refactors (h2, morph R3, countdown WAAPI); Chrome-only, says nothing about iPhone GPU |
| 4 | **Layer creation per frame**: split `Layerize`/`UpdateLayerTree`/`Commit` out of the `paint` bucket; layer-count delta per frame from `layerTreeDidChange` | `trace-frames.mjs` (bucket split) + the `--paint-rects` session (count) | yes (bucket split changes `paint` ms: call it out) | low | **medium**: verifies a3 / R5 / h3 / /10c window flips in Chrome terms; Chrome layerization ≠ WebKit, so the iPhone `LayerTree` (de-safari) stays the truth |
| 5 | **Invalidation tracking for attribution** (`disabled-by-default-devtools.timeline.invalidationTracking`) | a one-off `fixes/<topic>/probe.mjs` (short lane, counts only) | no | very low | **medium, one-shot**: names what repaints the feed rect (middle R3) and which roots the 0.72 flip invalidates |
| 6 | **Composited flag per animation**: trace `Animation` events' compositing failure reasons, or DevTools' Animations track | bench `animations` probe (a new field) | no (bench probe) | low | low-medium: Chrome's threading rules ≠ WebKit's (filter lists, SDA 26.4+). It catches only cross-engine mistakes |
| 7 | Layout Shift / CLS, Frame Rendering Stats, paint flashing, layer borders | none (human overlays; one-off looks) | no | — | low: redundant with the counts above or with the frozen-frame parity diff |

**Not recommended:**
- a paint-area metric from trace `Paint.clip` (unreliable per DevTools' own source);
- Chrome raster or GPU ms as a proxy for the iPhone (unthrottled at 6x);
- chrome-devtools MCP performance traces (Hard rule 8). `--trace-frames` and CDP do the same work under the lock.

**Order (inference):** 3 and 4 are cheap and ride on `--trace-frames`. 2 is the model fix on the Chrome side. 1 is the
model fix on the device and is worth more than the rest together, if the stopwatch can be started. Hand 2-4 to a
toolsmith as one incident ("render-side trace signals"); 1 belongs to de-safari's note.

## 7. For the user, in plain words

Google's guide breaks every frame into five steps: run JavaScript, work out styles, lay out boxes, paint pixels,
put the layers together. It says to keep animations to "move and fade" (transform and opacity), paint as little as
possible, and read the page's geometry before changing it. Every slow spot we found fits one of those steps, and
nearly all of our fixes are what the guide would advise. The one exception is the menu that grows to full screen:
on the iPhone, a layer that changes size is repainted from scratch every frame, which the guide doesn't cover. Our
measuring follows the guide for the script, style and layout side: slowed-down Chrome, frame timings, long-frame
reports. What we don't record yet is the "paint and present" side. We don't measure *how many pixels* each frame
paints (our models estimate it, and the estimate was off by about 2x), and we don't record whether a frame reached
the screen in time. The second gap means a fix that moves an animation off the busy main thread can look like no gain
in our numbers, even when it looks smoother. The three upgrades that help most: get timings out of Safari's own
timeline on the iPhone, record painted area per frame in Chrome, and record DevTools' "dropped / partially shown"
frame states.

## Sources

- Chrome DevTools (vendor doc):
  - https://developer.chrome.com/docs/devtools/performance/overview (capture settings: advanced paint
    instrumentation, CSS selector stats; CPU throttle calibration);
  - https://developer.chrome.com/docs/devtools/performance/reference (Frames track states, Layout shifts, Layers,
    Animations, Interactions);
  - https://developer.chrome.com/docs/devtools/rendering/performance (paint flashing, layout shift regions, layer
    borders, Frame Rendering Stats, scrolling performance issues).
- web.dev (vendor doc): `rendering-performance`, `rail`, `smoothness`, `stick-to-compositor-only-properties-and-manage-layer-count`,
  `simplify-paint-complexity-and-reduce-paint-areas`, `avoid-large-complex-layouts-and-layout-thrashing`,
  `reduce-the-scope-and-complexity-of-style-calculations` (all under https://web.dev/articles/).
- DevTools frontend (vendor source):
  https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/trace/types/TraceEvents.ts
  (`DefaultCategories`, `OptionalCategories`, the `Paint.clip` comment, `PipelineReporter` states).
- WebKit (vendor source, `main`):
  - `Source/JavaScriptCore/inspector/protocol/{Timeline,LayerTree,Page,Memory,CPUProfiler,Animation}.json`;
  - `Source/WebCore/inspector/agents/InspectorTimelineAgent.cpp`;
  - `Source/WebCore/inspector/TimelineRecordFactory.cpp` (`createPaintData` → `clip`);
  - `Source/WebCore/inspector/PageInspectorController.cpp`;
  - `Source/JavaScriptCore/inspector/agents/{InspectorScriptProfilerAgent,InspectorDebuggerAgent}.cpp`;
  - `Source/WTF/wtf/Stopwatch.h`.
- Chromium throttling: `research/architecture/render.md` Q10 (vendor source cited there).
- Our tools, read: `tools/lib/perf-page.mjs`, `tools/lib/trace-frames.mjs`, `tools/verify.mjs`,
  `tools/lib/bench-spec.mjs`, `tools/iphone.mjs`.
- Our data and notes: `fixes/iphone-wave2/README.md` (§3b-3c: gh/gb/g, ghb, e1/e2), `fixes/large-area-blur/README.md`
  (Timeline paint areas), `research/cpu-throttle-calibration/iphone.md`, `research/01-initial-investigation/README.md`
  (timestamps 0), and the four DE notes.
