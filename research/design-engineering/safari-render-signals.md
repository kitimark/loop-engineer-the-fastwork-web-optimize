# Safari's render and GPU signals for our cost models: WebKit's iOS frame, what each tool measures, the probes (de-safari)

Design-engineering note by `de-safari` (2026-10-01). Method and notation are those of [`README.md`](README.md). It
builds on [`morph-endpage.md`](morph-endpage.md) (§6 revision), [`hero.md`](hero.md), [`middle.md`](middle.md) and
[`apple-math.md`](apple-math.md).

The user asked the team to study Apple's Safari Developer Tools "for how to inspect/probe the rendering frame, GPU and
performance" (https://developer.apple.com/documentation/safari-developer-tools,
…/safari-developer-tools/inspecting-ios). The work is split three ways:
- `arch-safari` owns tooling and automation: how to capture, protocol v2;
- `de-devtools` owns the Chrome side ([`devtools-render-metrics.md`](devtools-render-metrics.md), on its branch);
- this note covers **which render/GPU signals our cost models need and how to read them**.

Read-only. No iPhone, no Chrome, no locks, no measurements. WebKit `main` was read on 2026-10-01 at
https://github.com/WebKit/WebKit/blob/main/Source/…; iOS 26.6.1 may lag it.

Labels:
- **vendor source**: WebKit file:line, read 2026-10-01;
- **vendor doc**: developer.apple.com, webkit.org;
- **observed / data**: the team's logs, named;
- **derived**: my arithmetic;
- **inference**: my reasoning, to check on the device.

## 0. Verdict in eight lines

1. **One WebKit/iOS frame has 12 phases in 4 processes** (§1.1):
   - WebContent main thread: script → style → layout → rendering-update tail (event regions, IO) → compositing
     update → transaction build → buffer prepare → paint **recording**;
   - commit-queue thread: waits for the **GPU process** to raster (CPU CoreGraphics replay; on by default on iOS,
     vendor source);
   - UI process: applies the commit and waits for a display-link tick;
   - render server (backboardd): the GPU work.
2. **The back-pressure rule, corrected.** WebContent starts frame N+1 when the UI process has *received and applied*
   commit N, at the next display refresh (vendor source; iOS allows only 1 pending commit). It does **not** wait for
   the render server to *display* it: WebKit's own comment says so. So the rAF gap = main + raster wait + UI apply +
   tick, and **render-server (GPU) time is not on that path** (inference from source; this refines de-apple's F3).
3. Hence two signals per frame, not one:
   - the **rAF gap** prices WebContent + GPU-process raster;
   - **render hitches** (Instruments) price the render server: backdrop and filter passes.

   The nav backdrop can make the morph *look* janky without stretching a single rAF gap, or the reverse.
4. **"Composite" on iOS is not compositing.** In Web Inspector it spans the transaction build, buffer
   prepare/allocation, all paint recording and the **wait for the GPU-process raster** (vendor source + WebKit's own
   comment). "Paint" records time only display-list *recording*, not raster.
5. **Rendering Frames has 4 segments: Script, Layout (style + layout), Paint (Paint + Composite), Other.**
   - "Other" is the uninstrumented part, which is where our suspects live: compositing update (layer creation), event-region
     walks, IO computation.
   - rAF gap − RenderingFrame duration ≈ the UI apply + tick wait ("commit wait").
6. **Direct readings replace three derived terms:**
   - paint area: Paint `clip` quads, per RenderLayer;
   - repaints per layer: Layers tab `paintCount` deltas;
   - layer size/memory: Layers tab `memory` = WebKit's own size × scale² × 4.

   Raster ms needs Instruments (GPU-process threads); backdrop GPU ms needs Animation Hitches or Metal System Trace.
7. **Timestamps:** the 0 timestamps over the proxy are fixed by `Page.enable`, which starts the Inspector stopwatch
   (vendor source, `InspectorPageAgent.cpp` l.134-147; sent to arch-safari and de-devtools; arch-safari confirmed that
   no repo tool sends it).
8. **Top 3 probes (§3):**
   - (P1) `ghbn` vs `ghb` with **Animation Hitches** next to the rAF driver: is the backdrop a rAF term or a render
     term?
   - (P2) **Rendering Frames by m bin** on g/gh/ghb: where do the filter ms live?
   - (P3) **Layers `paintCount`/`memory`** over one driver cycle (gh) and over the 0.72 reveal (baseline vs h1v2).
9. **First device readings (§6, iphone-runner, 10:57-11:09Z):**
   - The morph cost sits in **Composite − Paint** (the raster wait), not in script, style or paint recording.
   - It scales with the **number of layers repainted** (≈ 0.14 ms each) far more than with their area.
   - In gh, the ~40 % slow frames are the frames in which **~80 countdown-face layers plus the panel children
     repaint**. They repaint because their subpixel offset changes as the panel width changes (vendor source), not
     because their size changes.

## 1. WebKit's frame pipeline on iOS (Q1)

### 1.1 The phases, traced in source

| # | phase | process / thread | what runs | source (vendor source unless marked) |
|---|---|---|---|---|
| 0 | release | WC main | `DisplayDidRefresh` IPC → `triggerRenderingUpdate` → 0 s timer → `updateRendering()`. Skipped while `m_waitingForBackingStoreSwap` | `RemoteLayerTreeDrawingArea.mm` l.319-345, 451-471 |
| 1 | script | WC main | Animations step, then rAF callbacks; timers, events and IO callbacks as separate tasks | `Page.cpp` l.2414-2546 |
| 2 | style + layout | WC main | `RecalculateStyles`, `Layout` (forced inside script, or in the update) | Page::updateRendering, `layoutIfNeeded` l.2553 |
| 3 | update tail | WC main | `IntersectionObservations`, content relevancy, **touch-event regions + event regions** (`updateEventRegion` re-walks a layer's paint tree with a `NullGraphicsContext`; on our page every composited layer keeps one because we use `touch-action`, CSS 2252/3405/3461), AX regions | `Page.cpp` l.2516, 2625-2660; `RenderLayerBacking.cpp` l.2302-2420 |
| 4 | compositing update | WC main | `flushCompositingStateIncludingSubframes`: layer creation and destruction, geometry, `ensureBackingStore` (a size change → `clearBackingStore` → full dirty) | `Page.cpp` l.2709-2718; `RemoteLayerBackingStore.mm` l.139-152 |
| 5 | Composite begins | WC main | `willStartRenderingUpdateDisplay` → Inspector `willComposite` | `RemoteLayerTreeDrawingArea.mm` l.356; `Page.cpp` l.2755-2762 |
| 6 | transaction + prepare | WC main (+ GPU proc.) | `recursiveBuildTransaction` (changed layers), `prepareBackingStoresForDisplay` (swap or allocate buffers in the GPU process) | `RemoteLayerTreeContext.mm` l.204-216; `RemoteLayerBackingStoreCollection.mm` l.69-81 |
| 7 | paint (record) | WC main | `paintReachableBackingStoreContents`: each dirty store paints its dirty rects. With GPU-process DOM rendering (default on iOS: `ENABLE_GPU_PROCESS_DOM_RENDERING_BY_DEFAULT` for IOS_FAMILY) this **records display lists**; Inspector `Paint` records with the dirty rect | `PlatformEnableCocoa.h` l.404-408; `RemoteLayerBackingStore.mm` l.154-158, 387-404; `RenderLayerBacking.cpp` l.4387, 4421 |
| 8 | raster | **GPU process** (CPU) | display-list replay into IOSurfaces, overlapping phase 7 | tracepoints `DisplayListReplayStart/End` (`SystemTracing.h`) |
| 9 | flush wait + send | WC commit queue | `BackingStoreFlusher::flush` waits on each buffer set's flush fence, then sends `CommitLayerTree`; done posted back to main → `didComposite`, then `didCompleteRenderingFrame` | `RemoteLayerTreeDrawingArea.mm` l.427-449, 508-526; `RemoteImageBufferSetProxy.cpp` l.98-106 |
| 10 | UI apply | UI main | `commitLayerTree`: decode, apply to CALayers, scrolling tree, CA commit; the pending commit clears | `RemoteLayerTreeDrawingAreaProxy.mm` l.334-457 |
| 11 | tick | UI main | `CADisplayLink` fire → `didRefreshDisplay` sends `DisplayDidRefresh` only if no commit is pending (`canSendDisplayDidRefresh`; `AllowMultipleCommitLayerTreePending` = false on iOS). A display link that fires while a commit is pending is marked delayed and sent as soon as the commit lands | `RemoteLayerTreeDrawingAreaProxy.mm` l.446-448, 807-841; `UnifiedWebPreferences.yaml` l.268-276; `RemoteLayerTreeDrawingAreaProxyIOS.mm` l.155-163 |
| 12 | render | render server: CPU prepare + GPU execute | compositing; offscreen passes for backdrops, filtered groups, masks, group opacity | vendor doc: "Demystify and eliminate hitches in the render phase" (https://developer.apple.com/videos/play/tech-talks/10857/) |

WebKit's comment at phase 11 (`RemoteLayerTreeDrawingAreaProxy.mm` l.837-839): "Waiting for CA to commit is
insufficient, because the render server can still be using our backing store … for now we will make extra buffers
if need be."

So a slow render server costs **extra buffers** (allocation in phase 6), not a wait. The display link runs at 60 fps
and goes to 120 for web animations (`updateFrameRate`, l.313-338 of the iOS proxy). **observed:** the phone's gaps
are quantized to 8.33 ms.

### 1.2 Time model per frame (derived from 1.1)

```
W  = T_script + T_style + T_layout + T_tail + T_cu + T_txn + T_prep + T_rec           WebContent main
F  = max(0, T_raster − overlap(T_rec)),  T_raster ≈ 9·A_dirty/R_cg + 36·A_new/R_alloc GPU process via flush fence
U  = T_ipc + T_apply(changed layers, new CALayers, IOSurface handles)                  UI process
gap_k ≈ ⌈(W + F + U) / 8.33 ms⌉ · 8.33 ms   (release at the first tick after commit N lands; 2 ticks minimum at 60 Hz rAF)
RS_k = T_prepare(layer count) + Σ_passes A_p/R_fill + Σ_backdrops c_b·A_b               render server, per displayed frame
render hitch when RS_k > V (double buffer) or 2V (triple), V = 8.33 ms at 120 Hz
```

- R_cg is the effective CPU raster rate. de-morph §6.1 recalibrated it to ≈ 0.6-0.9 Gpx/s, allocation included.
- **RS_k is not in gap_k.** It couples back only in three ways (inference): extra-buffer allocation (in T_prep), CPU
  and thermal contention (backboardd and the GPU process share the cores), and a UI process whose CA commit stalls.
- The difference from de-apple's F3 ("waits until N is displayed", `T_main + T_commit + T_rs`): the serial part is
  **F + U**, i.e. the GPU-process raster and the UI apply, not the render server.

### 1.3 Where each hotspot spends its time (derived; ms on the A17 Pro under the driver, ranges)

| hotspot | Script | Layout seg. (style + layout) | Other (tail, comp. update, txn) | Paint seg. (prepare + record + F) | U + tick | render server per displayed frame |
|---|---|---|---|---|---|---|
| morph **g**, moving, m ≈ 0.5 (measured p50 29-34) | ~1 (data) | 2-5: inherited `--morph` (~150) + `#platform` while m < 0.55 + nav layout | 2-4: geometry of ~100 layers; event-region walks of resized nav/panel layers | **9-14**: 7.2 Mpx re-raster + 22 MB of fresh stores (morph §1.3, §6.1 rate) | 1-8 (tick phase) | 4-9: nav backdrop at 1.5 Mpx, r = 30 device px; panel filter group 2.6 Mpx; panel opacity group; `#platform` filter ≤ 3.6 Mpx while m < 0.55 |
| morph **gh** (24) | ~1 | 2-5 | 2-4 | **2-4**: nav box 0.45-2.6 Mpx + bar | 1-8 | same as g |
| morph **ghb** (21) | ~1 | 2-5 | 1-3 (fewer filter layers) | 2-4, **minus** any filter-outset repaint | 1-8 | 1-4 (panel and platform passes gone; backdrop stays) |
| morph first frame (49-54 driver) | ~1 | 3-6 (`is-morphing` relayout) | **8-15**: ~88 layers created (scene flip) | **15-25**: cold track tiles ~3 Mpx at high quality + ≥ 15 MB; first paint of a new layer decodes images asynchronously (`RenderLayerBacking.cpp` l.4781-4783), so image repaints spill into the next frames | 1-8 | creation of the new CA layers |
| 0.72 flip, y ≈ 625-745 (43-63) | 1-2 + the forced `ee()` read | **5-29**: 450-1150 elements (hero §2B); the forced style read has a stack trace, so the UI counts it as Layout | 1-3: the card layer gets content and a filter | 6-9: first raster 3-4 Mpx + 16 MB with the 14 px outset | 1-8 | +1-3: 14 px blur on 4 Mpx |
| reveal tail, 0.9-1.6 s after the flip | ~0 | ~1 per frame (`blur(14px)` ↔ `none` don't match, so the transition ticks on main: hero §1.4) | ~1 | **if the outset changes the bounds: a 4 Mpx re-raster per frame (≈ 5 ms)**, else ~0 | | 1-3 |
| y ≈ 1960 IO edge (86-106; F-044: the panel's `inert` removal) | the IO callback task | 2-6 for a ~150-250-element inherited restyle: **far too small** for 90 ms | event-region and touch-region walks for every layer whose hit-testing changed | ~0 expected (`inert` changes no pixels) | | ~0 |
| countdown 1 Hz tick (idle spikes 35-58) | spring JS ≤ 1 | face style (10 writes, leaves) < 1 | compositing update over ~160 layers + commit of the changed faces | 0 expected (composited transforms) | | ~0 |

- **What fits:** gh's measured −7-10 ms sits in the Paint segment, as the model says.
- **What doesn't fit yet:** the y≈1960 frame. By this model its known inputs add up to < 15 ms. So its 90 ms must be in
  Script (the IO callback) or in Other (region walks, AX, an unexpected compositing change). The countdown spike is
  the same kind of unknown. §3 P2 names the segment.
- **gb/ghb's 3-7 ms** fit either of two places:
  - a WebContent term: a changing filter radius changes the filter outset, so the composited bounds and the backing
    size change, and the layer repaints (webkit.md §2, P4);
  - render-server coupling.

  The m-bin data can't separate them: the g sessions disagree by up to 11 ms in the same bin (morph §6, g4/g5 vs
  g1-g3).

## 2. What each Safari tool shows (Q2)

### 2.1 Web Inspector, Timelines

- **Rendering Frames** (vendor source: `RenderingFrameTimelineRecord.js` l.62-75, 120-150; vendor doc:
  https://webkit.org/web-inspector/timelines-tab/):
  - Segments: **Script**, **Layout** (= all Layout-type records except Paint/Composite: invalidations,
    `RecalculateStyles`, `Layout`, forced layout), **Paint** (= `Paint` + `Composite`), **Other** = frame duration
    minus the three.
  - Forced style/layout with a stack trace is moved from Script to Layout.
  - **Frame bounds on Cocoa:**
    - start: the first run-loop wake after the previous frame completed (`RunLoopObserver`, Entry/AfterWaiting);
    - end: `didCompleteRenderingFrame`, posted after the flush fence (phase 9);
    - vendor source: `PageTimelineAgent.cpp` l.119-136, 361-376.
  - So a frame record = W + F + run-loop slack. **gap − frame ≈ U + tick wait.**
- **"Composite" on iOS** spans phases 5-9: transaction, buffer prepare (allocation), paint recording, the
  GPU-process raster wait, the send.
  - WebKit (`Page.cpp` l.2757-2758): "Inspector's use of "composite" is rather innacurate. On Apple platforms, the
    "composite" step happens in another process; these hooks wrap the non-WebKit CA commit time which is mostly
    painting-related."
  - Not included: the UI apply, CA's render or the GPU.
  - **Caveat** (inference from the record stack): any task that runs during the flush wait (a timer, an IO callback)
    nests under Composite and is counted as "Paint". Check Composite's children before reading it as raster.
- **"Other"** holds phases 3-4 and run-loop overhead, with **no records**:
  - compositing update and layer creation;
  - event/touch regions;
  - IntersectionObserver computation;
  - AX regions.

  Large "Other" = layer churn or region walks.
- **Layout & Rendering records:**
  - `Paint` carries `data.clip`: the RenderLayer's paint dirty rect as a quad in root-view CSS px
    (`PageTimelineAgent.cpp` l.309-326; `RenderLayerBacking.cpp` l.4421). There is one record per RenderLayer painted
    into a backing, so nested layers can overlap: sum per layer, not per frame union.
  - **Event-region paints emit no Paint record** (`if (!regionContext)`, l.4385/4419), so Paint area is visual raster
    only. Unlike Chrome's trace clip (de-devtools §0.5), this is the rect WebKit was asked to paint.
  - `RecalculateStyles`, `Layout` (with the layout root quad), `Composite` as above.
- **CPU timeline:** WebContent threads only (`task_threads(mach_task_self())`, `ResourceUsageThreadCocoa.mm` l.79-130):
  main vs WebKit vs other threads, sampled coarsely. It **can't see** the GPU-process raster, the UI process or the
  render server.
- **Memory timeline "Layers":** IOKit + LayerKit VM of the WebContent process (l.44-49). With GPU-process DOM
  rendering the buffers are mapped in the GPU process, so it **under-counts** (inference).

### 2.2 Web Inspector, Layers tab (LayerTree domain)

- Per composited layer (`InspectorLayerTreeAgent.cpp` l.186-192, 252-300; vendor doc https://webkit.org/web-inspector/layers-tab/):
  - `bounds`, `compositedBounds`;
  - `memory` = `backingStoreMemoryEstimate()` = bytes/px × w × h × scale², or the retained tiles for tiled layers
    (`GraphicsLayerCA.cpp` l.5329-5345). That is our `36·A` formula computed by WebKit with the true sizes. It counts
    **one** buffer: front/back/secondary buffers and the outset are what it shows, not what IOSurfaces hold
    (inference: real ≈ 2-3×);
  - `paintCount` = the GraphicsLayer repaint counter (cumulative);
  - compositing reasons: transform3D, video/canvas, clips-descendants, animation, filters, position fixed/sticky,
    overflow, stacking, overlap, will-change, …
- **Reading:**
  - ΔpaintCount over a known number of frames = paints per frame **per layer**: the direct answer to "does this layer
    still repaint";
  - Δmemory and Δcount across an event = layer creation.
- `layersForNode` reads state without forcing layout. But `layerTreeDidChange` fires on every compositing change and
  the frontend re-fetches. **Snapshot before and after, don't keep it live while timing** (inference).

### 2.3 Instruments (vendor doc: https://developer.apple.com/documentation/xcode/understanding-hitches-in-your-app, tech talks 10855/10856/10857)

- **Animation Hitches.**
  - A *commit hitch*: the app's CA commit misses its deadline. A *render hitch*: the render server's prepare
    (CPU) or execute (GPU) misses it.
  - Tracks: hitch duration, commits per process, **Renders/GPU** with a render count (offscreen passes).
  - **For Safari** (inference from 1.1):
    - the committing app is the **UI process**, so its commit hitches price phase 10 (and a UI thread that blocks on
      a non-passive touch);
    - a late WebContent frame sends no commit at all, so it is not a "commit hitch";
    - **render hitches price phase 12**: the backdrop and filter passes.
- **Metal System Trace:** GPU execution per command buffer. The render server's GPU ms per displayed frame is the
  direct "backdrop GPU ms".
- **Time Profiler / System Trace, all processes:**
  - CPU per thread in WebContent, the GPU process (com.apple.WebKit.GPU: the raster rate), the UI process and
    backboardd.
  - WebKit emits kdebug trace points with real timestamps: `RenderingUpdate`, `CompositingUpdate`,
    `ComputeEventRegions`, `PaintLayer`, `DisplayListRecord/Replay`, `BackingStoreFlush`, `CommitLayerTree`,
    `DisplayLinkUpdate` (`SystemTracing.h` l.81-178, `Resources/Signposts/SystemTracePoints.plist`).
  - Whether Instruments decodes them by name on iOS is unverified (arch-safari: a one-time user check).

### 2.4 Which tool measures which term we now derive

| derived term (where) | direct measurement | status |
|---|---|---|
| paint area per frame, Mpx (morph §1.3, middle R3) | Σ `Paint.clip` area × 9, per layer, per RenderingFrame | **direct**; per 1 s chunk today, per frame after `Page.enable` |
| which layers repaint | Layers `paintCount` deltas | **direct** |
| layer area, memory, count (B = 36·A) | Layers `memory`, `compositedBounds`, count | **direct** (one buffer) |
| raster ms, R_cg (the ~2x-off rate) | GPU-process thread CPU (Time Profiler), `DisplayListReplay` intervals. Proxy: Composite − ΣPaint − children | Instruments direct; Web Inspector bound |
| allocation ms | inside Composite (prepare); System Trace | proxy |
| style / layout ms | Layout segment, `RecalculateStyles`/`Layout` records | **direct** |
| compositing update, layer creation, region walks | "Other"; `CompositingUpdate`, `ComputeEventRegions` trace points | residual / Instruments |
| commit wait (de-apple F3) | gap − RenderingFrame duration; `CommitLayerTree` + `DisplayLinkUpdate` | **derivable per frame** after `Page.enable` |
| backdrop/filter GPU ms | Hitches Renders/GPU track, render count; Metal System Trace | **Instruments only** |
| presented-frame smoothness | Hitches hitch duration (ms/s) | Instruments only; rAF can't see it |

### 2.5 Probes that change what they measure (vendor source; inference on size)

- `ShowRepaintCounter` adds the counter rect to every painted store's dirty region (`RemoteLayerBackingStore.mm`
  l.383): more paint.
- `Page.setShowPaintRects` draws flashes in an overlay layer: an extra layer that repaints.
- `ShowDebugBorders` adds CA borders: render-server only, small.
- Timeline `Screenshots` captures a snapshot after **every** composite (`PageTimelineAgent.cpp` l.296-297): heavy.
  Keep it off for timing.
- A live Layers tab: see 2.2. Call stacks: use `maxCallStackDepth` 1 (arch-safari). The Script profiler slows JS.
- Timing runs: Timeline (Script/Layout/Paint/Composite/RenderingFrame) + rAF logger only. Counts and areas: separate
  runs.

## 3. Experiments that would settle the open questions (Q3)

Run each on the existing builds, with the driver as today (cool phone, ABBA). "Confirm" is the source model of §1.

| # | question | minimal probe | confirms | refutes |
|---|---|---|---|---|
| **P1** | Is the nav backdrop a **rAF** term or a **render** term? (morph §6.3 V0b, de-apple F3) | `ghbn` vs `ghb` vs `g`: rAF driver **plus Animation Hitches** (or Metal System Trace) recorded over the same cycles; bin by m | rAF moving p50 ghbn within ±2 ms of ghb and the mid-m hump stays. Render-server time per frame (Renders/GPU) falls by the backdrop share, largest at m ≈ 0.46 (area × radius); render hitches at mid-m → ~0. **Then R8 is a "looks smoother" fix that rAF can't score.** | ghbn ≤ 17-20 ms and the hump flattens (de-morph's prediction): the render server *does* gate WebContent. Check the coupling: GPU-process and backboardd CPU overlap in Time Profiler, extra-buffer allocation in Composite |
| P1b | Does the backdrop's GPU cost scale with radius or only with area? | from P1: render GPU ms per frame vs A_b(m) and vs A_b·r(m) across the 5 m bins, g and ghb | GPU ms tracks A_b (CA blurs through a downsampled pyramid; apple-math §2.11) | GPU ms tracks A_b·r: a fixed small radius (R7) pays more than its area suggests |
| **P2** | Where do the filters' 3-7 ms live (gb, ghb) and what is gh's remaining hump? | Rendering Frames with `Page.enable` (real timestamps) on g, gh, ghb, 1 cycle each: per frame Script / Layout / Paint / Other, Composite's children, and gap − frame; bin by m | the gb/ghb saving appears in **Paint** at m < 0.55 (filter outset → bounds → repaint of `#platform`). The hump is in Paint/Other on the nav (resize + event regions) | no WebContent segment shrinks but the rAF gap does: coupling via U + tick, or the render server (go to P1) |
| P2b | y ≈ 1960 (`inert` removal, F-044): which phase holds 90 ms? | one scripted pass, Rendering Frames around y 1830-1990, plus the `RecalculateStyles` count in that frame | a 90 ms **Other**: event/touch/AX region walks → fix: drop `inert` earlier (at an idle moment, not at the IO edge) or use `content-visibility`/`hidden` instead. A 90 ms **Script**: the IO callback itself | a 90 ms **Layout** with thousands of elements: an invalidation far wider than the panel (selector or `:has()` fan-out); check which nodes |
| **P3** | Do gh's size-fixed panel layers still repaint? | Layers tab snapshot before and after one driver cycle (hold at m = 1, then at m = 0): ΔpaintCount for nav, veil, center, footer, bar, 3 tracks; plus Paint clip area per layer | gh: children Δ ≈ 1-2 per tween (first frame only), nav Δ ≈ frames per tween. g: every child Δ ≈ frames | children Δ ≈ frames in gh: the non-clipping path (`shouldClipCompositedBounds`, apple-math §2.5) differs on 26.6.1, so R1/R2's premise needs a recheck |
| P3b | 0.72 flip: layer creation, memory jump, the reveal tail | Layers snapshot at y 580 and 780 (baseline, h1v2), card ΔpaintCount over the 1.6 s reveal; Rendering Frames over y 580-780 | baseline: card memory 0 → ~16 MB at the flip; card paintCount climbs **per frame** during the reveal if the outset resizes the bounds. h1v2: memory present before the flip, paintCount ≥ 1 before it (pre-rastered) and +0-1 during the threaded `blur(14px → 0px)` | h1v2 paintCount 0 before the flip: WebKit doesn't raster an `opacity: 0` layer (hero open Q3); the first raster stays in the flip frame |
| P4 | Recalibrate R_cg (the ~2x-off rate) | from P2's g frames: Σ Paint clip area × 9 against (Composite − ΣPaint − children) per frame; once, Time Profiler of the GPU-process raster thread | slope ≈ 0.6-0.9 Gpx/s with a small intercept (allocation) | a flat relation: raster isn't the Composite tail (the flush isn't waiting), so revisit 1.1 phase 9 on 26.6.1 |
| P5 | First tween frame (49-54) | Rendering Frames on the first frames of 3 tweens; Layers count before and after arming | Other 8-15 ms (layer creation), Paint 15-25 ms, image Paint records repeating 1-3 frames later (async decode on first paint) | Other small: creation is cheap and the cost is cold raster, so R5 (keep layers) gains less than its 15 MB costs |
| P6 | Countdown 1 Hz spike (35-58) | idle at the top, 10 s, Rendering Frames; face ΔpaintCount per second | spike in **Other** (compositing update over ~160 layers) → h3 strips; face paintCount flat | spike in Paint with faces repainting: digits aren't composited-only (text repaint); spike in Script: the spring's JS |

Order (gain × decisiveness): P1 (decides R8's value and the F3 model), P2 + P2b (one session, real timestamps,
names the segment of the two biggest unknowns), then P3/P3b (counts only, no timing; can share a run with the
iPhone scripted block).

## 4. A refined model: the per-frame budget in Safari's phases (Q4)

### 4.1 The budget (derived from apple-math §3 with the §1 phases and de-morph's §6.1 rate)

A 2-tick (16.7 ms) rAF gap needs W + F + U ≤ ~15 ms, because the release falls on the next 8.33 ms tick after
commit N lands; 15-23 ms gives a 25 ms gap. The render server has its own budget per displayed frame.

| segment (what Safari reports) | budget per frame | how it follows | phase-check reading |
|---|---|---|---|
| Script | ≤ 2 ms | logger: page rAF JS 0-1 ms | Script segment |
| Layout (style + layout) | ≤ 3-4 ms | S ≤ 150-350 elements at c_el 10-25 µs; no dirty reads | Layout segment; `RecalculateStyles` count = 1 per frame |
| Other | ≤ 2 ms | no layer creation in a scroll/tween frame; event-region walks only on unchanged layers | Other segment |
| Paint (prepare + record + F) | ≤ 5-6 ms | **≈ 3.5-5 device Mpx** of re-raster at 0.6-0.9 Gpx/s incl. allocation (about one full screen, 2x apple-math §3's 1.5 Mpx because the rate was 2x pessimistic); ≤ 10 MB new buffers | Paint segment; ΣPaint clip area × 9 |
| U + tick slack | ~1-2 ms + tick phase | UI apply of ~100 changed layers | gap − RenderingFrame |
| **render server** (separate) | ≤ 8.33 ms CPU prepare, ≤ 8.33-16.7 ms GPU, per displayed frame at 120 Hz | ≲ 2 full-screen blurs (apple-math §3) + group/mask passes | Hitches render hitches = 0; Metal GPU ms |

### 4.2 Predictions to check phase by phase (derived; ms)

| build / event | Script | Layout | Other | Paint | gap − frame | rAF p50 | render server |
|---|---|---|---|---|---|---|---|
| g, m 0.4-0.8 | 1 | 2-5 | 2-4 | 9-14 | 1-8 | 29-34 (data) | 4-9 → render hitches likely |
| gh | 1 | 2-5 | 2-4 | 2-4 | 1-8 | 24 (data) | same as g |
| ghb | 1 | 2-5 | 1-3 | 2-4 (lower at m < 0.55 if the outset path is real) | 1-8 | 21 (data) | 1-4 |
| ghbn | as ghb | | | | | **≈ 21 (source model) vs ≤ 17-20 (de-morph)** | ≤ 1-2 |
| gh + R8 (ghr8) | as gh at m < 0.55; as ghbn above | | | | | ≈ gh − (outset share); the render server gains most | backdrop pass gone at m ≥ 0.55 |
| first tween frame | 1 | 3-6 | 8-15 | 15-25 | | 49-54 (data) | layer creation |
| 0.72 flip frame | 1-2 | 5-29 | 1-3 | 6-9 | | 43-63 (data) | +1-3 |
| y ≈ 1960 | ? | 2-6 | **? (P2b)** | ~0 | | 86-106 (data) | ~0 |

**How to use it:** a fix's claim names the segment it moves and by how much. The phone check reads that segment.
A total-gap change with no segment change is a coupling to explain, not a win to bank. This matches the team's
failure mode: gh's prediction failed on the total, while the segment it targeted, Paint, probably moved as predicted.

## 5. Corrections and open items for the team

- **apple-math F3 / §2.5's serial test:**
  - WebContent waits for the UI process to *apply* commit N, plus a tick (vendor source), not for its display;
  - the serial term is the GPU-process raster + UI apply;
  - "ghb ≈ 17-23 ms means serial" no longer discriminates: ghb's additive savings fit WebContent terms too.
  - P1 is the discriminating test.
- **morph-endpage open Q3** (in-process vs GPU-process raster): GPU process by default on iOS on `main`
  (`PlatformEnableCocoa.h` l.404-408). The raster sits on the commit path through the flush fence; Paint ms is
  recording only. 26.6.1 unverified; Time Profiler shows it at once.
- **For every DE note:** "repaint" costs land in Web Inspector's **Paint** segment only as recording time. The raster
  shows as the Composite tail. Read Paint + Composite together, never Paint alone.
- **Event regions are a per-frame term we never modelled.** Our CSS uses `touch-action`, so every composited layer
  keeps an event region (`maintainsEventRegion`, `RenderLayerBacking.cpp` l.2302-2316). Any layout or hit-test change
  inside a layer re-walks its paint tree with a null context (no pixels, no Paint record, cost in "Other",
  `ComputeEventRegions` trace point). Candidates: the morph's resized nav/panel layers every frame, y≈1960's `inert`
  removal. Unmeasured; P2/P2b size it.
- **Async decode on a new layer's first paint** (`DefaultAsynchronousImageDecode` when `repaintCount == 0`): a newly
  created layer's images arrive 1-3 frames later as extra paints. That fits the "first frame + next frames" pattern of
  the morph start and the flip (vendor source; effect size unknown).
- **Timestamps:** `Page.enable` on the `page` target before `Timeline.start`. It resets the stopwatch on every call;
  if the domain is already enabled, disable it first (de-devtools). arch-safari folds this into protocol v2.

## 6. First readings: P2/P3 on the phone (added 2026-10-01 ~11:20Z)

**Data:**
- iphone-runner ran `mdtl-{gh,g,ghb}-tl1.json`, `mdtl-ghbn-nav1.json` (Timeline on, real timestamps per F-047, one
  cycle, hold 2000) and `lt-gh-lt4.json` (LayerTree census, no Timeline). The files are in its worktree's
  `out/iphone-runner/` (gitignored, not copied here). Phone cool, 10:57-11:09Z.
- My re-analysis (scratch scripts, not committed) groups each frame's Paint clips by size and fits Composite −
  ΣPaint children ("cMP") against the paint area and the number of Paint records.
- Timeline was on in these runs: they are attribution runs, not A/B runs. Moving p50 was gh 25, g 29, ghb 20,
  ghbn 30 ms; the census run without Timeline gave gh 22. So the Timeline adds ~1-3 ms.

**Observed:**

| reading | gh | g | ghb | ghbn |
|---|---|---|---|---|
| Script / style / layout / Paint (recording), per moving frame | ~1 / 1-5 / < 1 / ≤ 1.7 | same | same | same, style up to 6 |
| cMP per moving frame, bin p50 range | 8-39 | 15-40 | 10-31 | 12-41 |
| cMP at rest (m = 0 or held m = 1, ≤ 0.04 Mpx painted) | 6-8 | 6-9 | 6-9 | 7-12 |
| "heavy" frames (≥ 80 Paint records): count, cMP p50, rAF gap p50 | 18/46, 24.8, 29 | 31/39, 21.8, 27 | 19/49, 27.1, 20 | 16/38, 24.9, 28 |
| "light" frames (< 50 records): count, cMP p50, rAF gap p50 | 28/46, 8.5, **17** | 8/39, 10.2, 33 | 30/49, 9.6, 17 | 22/38, 12.0, 30 |
| fit: cMP ≈ a + b·device Mpx + c·records | 7.5 + 0.58·Mpx + **0.13**·n | 6.1 + 0.25·Mpx + **0.15**·n | 7.5 + 0.30·Mpx + **0.14**·n | 11.7 + 0.12·Mpx + **0.16**·n |

**Readings:**
1. **Where the time goes: Composite − Paint, the raster/flush wait.** That is the Paint *segment* the model
   predicted (P2 confirm, in the UI's sense). Paint recording is ≤ 2 ms and style ≤ 5 ms; neither is a lever.
2. **Per-layer cost dominates the area cost.** g gives a clean natural experiment:
   - its light and heavy frames repaint about the same area (7.8 vs 8.1 device Mpx);
   - the heavy frames have ~85 more Paint records and take +11.6 ms (cMP 10.2 vs 21.8);
   - so each repainted layer costs ≈ 0.14 ms (derived), consistent with the fit's c = 0.13-0.16 in all four builds;
   - area costs only 0.1-0.6 ms per device Mpx, i.e. ≥ 1.7 Gpx/s.

   **This revises §4.1's "≤ 3.5-5 Mpx" Paint budget to a two-term budget:**
   - a fixed ~6-8 ms Composite floor (observed at rest; mechanism unknown, possibly part Timeline overhead);
   - plus ≈ 0.14 ms per repainted layer;
   - plus ≈ 0.1-0.6 ms per device Mpx.

   Caveat: the per-record term may include Inspector record overhead. A run without Timeline (gh 22 vs 25 p50)
   bounds that at ~3 ms per frame.
3. **What the heavy frames repaint (gh):**
   - **80 Paint records of 18×37 CSS px** at y ≈ 5539 and 5610: the countdown faces (two rows, stacked faces);
   - plus the center (402×385), the footer (402×87), nav box + veil, the 3 tracks (2 rects each) and the bar.

   The census agrees: the face layers are created at the tween start (35 → 113 layers) and **each repaints 15 times
   in a 25-frame forward tween**; the center, veil and footer repaint 15-16 times.

   Their memory and `compositedBounds` stay constant (center 7.1 MB, 406×388). So gh's size fix works, and this
   repaint has **another cause**.
4. **The cause: WebKit repaints a composited layer whenever its subpixel offset from the renderer, snapped to
   device pixels, changes.** Vendor source: `RenderLayerBacking.cpp` l.1440-1445 `subpixelOffsetFromRendererChanged`
   → l.1904 `setContentsNeedDisplay()`.
   - Derived: the panel's width goes 398 → 406 CSS px, so centered content moves ~4 CSS px = 12 device px at
     DPR 3. That is ~12 snapped-offset changes per tween, against 15 observed repaints per face (incl. the first
     paint) and 9-11 heavy frames per tween.
   - Inference, to check: the faces' layout x moves by fractions of a device pixel.
   - In gh, light frames hit 17 ms (on time) and heavy frames 29 ms, so **this one mechanism is most of gh's
     remaining jank.**
5. **Fix direction for `fix-nav-morph` / de-morph** (inference; the owner decides):
   - lay out the panel content (center with countdown, veil, footer, tracks) at the **final** width and at
     whole-pixel positions for the whole tween;
   - do any visible motion with composited `transform` or `clip-path`. A transform moves the GraphicsLayer and
     leaves the renderer offset unchanged.
   - Alternative: quantize the panel width so the centering offset stays on the device grid.

   Expected (derived from gh's light frames): heavy frames fall to light ones, so gh's moving p50 goes ~25 → ~17-20 ms.
6. **ghb and ghbn (P1, rAF half):**
   - ghb's gain over g is fewer heavy frames and less area. Against gh, one run each can't tell ghb apart in
     WebContent terms (heavy cMP 27 vs 25; light 9.6 vs 8.5).
   - ghbn (backdrop off) was not faster in WebContent: cMP and area like gh/ghb, moving p50 30, one run.
   - That matches the source model (the backdrop is not on the rAF path), not de-morph's ≤ 17-20 ms prediction.
   - The render-server half of P1 (Animation Hitches/Metal) is still open.
7. **Corrections to §2.1:**
   - At rest the RenderingFrame record lasts the whole 16.6 ms tick (it opens on any run-loop wake), with "Other"
     ≈ 8-10 ms of idle slack. So **"Other" is not a work term** and **gap − frame is not the commit wait**: it read
     −8 to +28 ms, partly alignment.
   - Read Script, Style, Layout, Paint and Composite − Paint, not the frame duration or Other.
8. **Open discrepancy:**
   - The census counts `platform-card` 11-14 and `platform-stage-artboard` 5-7 paints per frame. For tiled layers
     the count goes up once **per tile** painted (vendor source: `TileGrid.cpp` l.785 → `drawLayerContents` of the
     root layer, `PlatformCALayerCocoa.mm` l.1336). That would be ≈ one full repaint of the card's ~12.6 retained
     tiles (13.3 MB) per frame.
   - But the Timeline run of the same build shows **no** 430-wide or tile-sized Paint clip in any moving frame.
   - Either the card repaint happens only with LayerTree enabled, or these are tile paints without a Paint record
     (tile revalidation). Next check: one run with Timeline and the census together, comparing tile-sized clips with
     the card's ΔpaintCount.

## Sources

- WebKit (vendor source, `main`, 2026-10-01, https://github.com/WebKit/WebKit/blob/main/Source/…):
  - `WebKit/WebProcess/WebPage/RemoteLayerTree/RemoteLayerTreeDrawingArea.mm`, `RemoteLayerTreeContext.mm`;
  - `WebKit/UIProcess/RemoteLayerTree/RemoteLayerTreeDrawingAreaProxy.mm`, `ios/RemoteLayerTreeDrawingAreaProxyIOS.mm`;
  - `WebKit/Shared/RemoteLayerTree/RemoteLayerBackingStore.mm`, `RemoteLayerBackingStoreCollection.mm`;
  - `WebKit/WebProcess/GPU/graphics/RemoteImageBufferSetProxy.cpp`, `WebKit/WebProcess/WebPage/DrawingArea.cpp`,
    `WebPage.cpp`;
  - `WebCore/page/Page.cpp`, `WebCore/rendering/RenderLayerBacking.cpp`,
    `WebCore/platform/graphics/ca/GraphicsLayerCA.cpp`, `GraphicsLayer.h`, `ca/TileGrid.cpp`,
    `ca/cocoa/PlatformCALayerCocoa.mm` (repaint counts per tile);
  - `WebCore/html/HTMLElement.cpp` (`inert` → `invalidateStyle`);
  - Inspector: `WebCore/inspector/agents/page/PageTimelineAgent.cpp`, `InspectorTimelineAgent.cpp`,
    `InspectorLayerTreeAgent.cpp`, `InspectorPageAgent.cpp` (stopwatch), `WebCore/page/cocoa/ResourceUsageThreadCocoa.mm`;
  - Web Inspector UI: `WebInspectorUI/UserInterface/Models/RenderingFrameTimelineRecord.js`, `Controllers/TimelineManager.js`;
  - `WTF/wtf/SystemTracing.h`, `WebKit/Resources/Signposts/SystemTracePoints.plist`, `WTF/wtf/PlatformEnableCocoa.h`,
    `WTF/Scripts/Preferences/UnifiedWebPreferences.yaml`, `WebKit/Shared/WebPreferencesDefaultValues.cpp`.
- Apple (vendor doc):
  - https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios (setup only; no perf content);
  - https://developer.apple.com/documentation/xcode/understanding-hitches-in-your-app (render loop, commit and render
    hitches, 120 Hz deadlines, double and triple buffering);
  - tech talks https://developer.apple.com/videos/play/tech-talks/10855/, …/10856/ (commit phases),
    …/10857/ (offscreen passes, render prepare/execute, the Animation Hitches template).
- WebKit (vendor doc): https://webkit.org/web-inspector/timelines-tab/, https://webkit.org/web-inspector/layers-tab/,
  https://webkit.org/blog/3996/introducing-the-rendering-frames-timeline/.
- Team: morph-endpage §1.3/§6, hero §1.4/§2B, middle §2, apple-math §1/§3; driver data via `fixes/DIRECTION.md`
  (09:27Z, 10:08Z); F-043/F-044; `research/01-initial-investigation/README.md` (zero timestamps).
