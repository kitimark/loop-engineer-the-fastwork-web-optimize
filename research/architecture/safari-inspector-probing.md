# Probing Safari on the iPhone: frames, layers, GPU (arch-safari, 2026-10-01)

Architecture team (`fixes/ARCH_TEAM.md`), role: **method and tooling**. This note covers what we can probe on the iPhone 15 Pro
Max (iOS 26.6.1 Safari) and how to automate it. `de-safari` owns which render/GPU signals the cost models need
(`research/design-engineering/`); this note doesn't repeat that. Read-only research: no iPhone, Chrome, locks, tool
edits or Instruments runs. Public sources only, fetched 2026-10-01 with generic queries.

Labels: **vendor doc** (developer.apple.com, webkit.org), **vendor source** (WebKit `main`, read through jsDelivr's
GitHub mirror on 2026-10-01; 26.6.1 can lag `main`), **bug**, **measured** (our own data in this repo), **inference**
(ours, unverified). "Toolsmith" below means measurement code (Hard rule 6: test, own commit, README call-out).
"User" means a one-time action at the Mac or the phone.

## 0. Headline

1. **Our Timeline timestamps are 0 because no tool ever sends `Page.enable`.** Timeline records take their times
   from the inspector's execution stopwatch (`InspectorTimelineAgent::timestamp()`). On a page target, the only
   thing that starts that stopwatch is `InspectorPageAgent::enable()`, which calls `reset(); start();`. That is
   vendor source: `Source/WebCore/inspector/agents/InspectorPageAgent.cpp`. `Timeline.start`, `setInstruments`,
   `ScriptProfiler.startTracking` and `connectFrontend` don't start it, and a stopwatch that never started reads 0.
   The iOS 26 `frame` target has its own stopwatch, which nothing starts, and it has no Page or Timeline agent
   (`FrameInspectorController.cpp`). So: send `Page.enable` once per connection on the **page** target, then
   `Timeline.start`. Every record then carries `startTime`/`endTime` in seconds. That's inference until one probe
   call confirms it (`de-safari` reached the same reading independently). This unlocks per-frame attribution on the
   phone (P1).
2. **Web Inspector's "Rendering Frames" are main-thread runloop turns, and "Composite" is the WebContent layer
   commit.** Neither is GPU time. On Cocoa, `PageTimelineAgent` opens a `RenderingFrame` record per runloop turn
   (`RunLoopObserver`, vendor source). Its children are script, style, layout, Paint (with a clip quad) and
   Composite. Waiting on the UI process doesn't show up: WebContent defers its next rendering update until the
   previous commit's backing stores are swapped (`m_waitingForBackingStoreSwap` in `RemoteLayerTreeDrawingArea.mm`,
   vendor source). **Compare the busy time with the rAF interval.** A 30 ms rAF gap with ~28 ms of children is
   main-thread-bound. A 30 ms gap with ~10 ms of children is back-pressure or render/GPU-bound.
3. **Everything the protocol can render is painted in software and omits `backdrop-filter`:** `Page.snapshotRect`,
   the Timeline `Screenshot` instrument and `LayerTree.requestContent`. They go through `snapshotFrameRect` or
   `paintGraphicsLayerContents` (vendor source), while a backdrop is a `CABackdropLayer` drawn by the render server
   (`webkit.md` §2). That explains the R2 result (measured, `fixes/iphone-wave2/README.md` §3b). Only a real screen
   capture can settle clip-path × backdrop: a WDA `/screenshot`, a side-button screenshot, or QuickTime.
4. **Layers, memory and repaint counts are fully scriptable over our proxy.** `LayerTree.layersForNode(<document>)`
   returns, for every composited layer, `paintCount`, `memory` (a backing-store estimate) and `compositedBounds`.
   `reasonsForCompositingLayer` gives 29 reason flags, `backdropRoot` and `filters` among them. `Memory` tracking
   reports a `layers` category every 500 ms. Paint flashing (`Page.setShowPaintRects`), compositing borders and
   repaint counters (`Page.overrideSetting` with `ShowDebugBorders`/`ShowRepaintCounter`) are protocol commands
   too, the same ones the Layers tab uses for remote iOS targets (vendor source, `LayerTreeManager.js`).
5. **GPU, render-server time and true hitches exist only in Xcode Instruments** (Animation Hitches, System Trace,
   Metal System Trace, Time Profiler with all processes), scriptable through `xctrace`. They need Developer Mode
   (and Xcode's device support). They are the only way to see whether the nav backdrop costs render-server/GPU time.
   rAF can't see it, and Web Inspector can't either. Apple defines hitch duration as actual minus expected frame
   lifetime, split into commit hitches and render hitches (vendor doc). Safari's own Develop menu adds nothing
   programmatic beyond the protocol. Apple's new Safari MCP server (`safaridriver --mcp`) needs Safari 27 on macOS,
   drives desktop Safari only, and its tool list (tabs, navigation, screenshots, console, network, JS evaluation,
   interactions) has no timeline or layer tools (vendor doc). It doesn't apply to the phone.

## 1. Apple's Safari Developer Tools docs: what exists

Sources: [Safari Developer Features](https://developer.apple.com/documentation/safari-developer-tools),
[Inspecting iOS and iPadOS](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios), its
siblings (Develop menu, Web Inspector, Developer/Feature Flag settings, Inspect Apps and Devices, Connecting an AI
agent), and the [Web Inspector Reference](https://webkit.org/web-inspector/) (all vendor doc).

- **Enabling (vendor doc).** On the iPhone: Settings > Apps > Safari > Advanced > Web Inspector on. Connect by cable;
  the device appears in the Mac Safari's Develop menu after "Trust this computer". **Connect via Network** in the
  device's Develop submenu enables Wi-Fi inspection after one wired pairing. No Developer Mode and no Apple account
  are needed for inspection. Inspecting a tab follows it across navigations. While a device is inspected, extra
  per-device options appear: user agent override, cross-origin restrictions, site-specific quirks.
- **Timelines tab (vendor doc).** Events view with these timelines:
  - Screenshots: "a screenshot of the viewport after every composite";
  - Network;
  - Layout & Rendering: every style invalidation/recalc, layout, composite and paint, "including information about
    the size of each";
  - Media & Animations: off by default, because it "can impact the performance";
  - JavaScript & Events: sampled call trees;
  - CPU: "all threads related to the inspected page";
  - Memory: off by default, same reason;
  - JavaScript Allocations: heap snapshots every 10 s.

  The **Frames view** groups activity per rendering frame into JavaScript, Layout, Paint and Other, with 30/60 fps
  lines. Recording can also start from page code (`console.profile`/`profileEnd`). Recordings **export to a file
  (⌘S)**, which we can parse offline. Debugging features (JIT deopts, breakpoints) are off while recording, "to
  measure realistic performance". The 2015 Rendering Frames post defines a frame as "a single cycle of the browser's
  event processing loop" ([blog 3996](https://webkit.org/blog/3996/introducing-the-rendering-frames-timeline/),
  vendor doc).
- **Layers tab (vendor doc,** [layers-tab](https://webkit.org/web-inspector/layers-tab/)**).** A 3D layer view. Per
  layer: paint count, memory cost, dimensions and compositing reasons. Toggles: **Show compositing borders** (borders
  plus a repaint number per layer; the colour legend includes "backdrop layer" and "tiled layer") and **Enable paint
  flashing**. The same toggles sit in the Elements tab.
- **Graphics tab:** canvas/WebGL recordings and the animation list. Not relevant here: the page's motion is CSS/JS.
  **Audit tab:** JS test cases run in the page, exportable. It could hold one-click counts, such as `will-change`
  elements or composited reasons via `getComputedStyle`, but our WIP `Runtime.evaluate` already does that (vendor doc).
- **Settings (vendor doc).** On the Mac: Developer pane (remote automation, cross-origin) and Feature Flags
  (statuses Stable/Preview/Testable/Developer). None of them is a GPU or performance HUD. The iOS Safari >
  Advanced > Feature Flags page is the same list; I found no public doc of a compositing-border flag on iOS
  (inference: use the protocol settings in §2 instead).

## 2. What is reachable programmatically over `ios_webkit_debug_proxy`

Domains are from WebKit's protocol JSON (`Source/JavaScriptCore/inspector/protocol/*.json`, vendor source).
"Measured" means our tools already use it on 26.6.1. All of the following go to the `page` target.

| domain | commands / events | gives us | status on our phone |
|---|---|---|---|
| Page | `enable` (**starts the stopwatch**), `snapshotRect`, `snapshotNode`, `setShowPaintRects`, `overrideSetting(ShowDebugBorders, ShowRepaintCounter)`, `disable` (resets every override) | time base; paint flashing and compositing borders on the device's screen; software snapshots | `snapshotRect` measured (no backdrop); `navigate` absent (measured) |
| Timeline | `enable`, `setInstruments([ScriptProfiler, Timeline, CPU, Memory, Heap, Animation, Screenshot])`, `start({maxCallStackDepth})`, `stop`; `eventRecorded`, `recordingStarted/Stopped` | records: RenderingFrame, RecalculateStyles, Layout, Paint (clip quad), Composite, FireAnimationFrame, ObserverCallback, FunctionCall, TimerFire, EventDispatch, TimeStamp, Screenshot | counts measured; timestamps 0 (no Page.enable) |
| ScriptProfiler | `startTracking({includeSamples})`, `trackingUpdate` (API/Microtask/Other script intervals), `trackingComplete` (sampled stacks) | JS sampling profile with stopwatch timestamps | not tried |
| CPUProfiler | `startTracking`; `trackingUpdate{timestamp, usage, threads[name, usage, type]}` every 500 ms | WebContent CPU per thread (main vs WebKit threads); WebContent process only | not tried |
| Memory | `startTracking`; `trackingUpdate{categories: javascript, jit, images, layers, page, other}`; `memoryPressure` | `layers` = IOKit + LayerKit VM regions of WebContent (`ResourceUsageThreadCocoa.mm`) | not tried |
| LayerTree | `enable`, `layersForNode(nodeId)`, `reasonsForCompositingLayer(layerId)`, `requestContent` (main only, new); event `layerTreeDidChange` (coalesced until the next `layersForNode`) | layer census: count, `memory`, `paintCount`, `compositedBounds`, reasons | not tried; needs `DOM.getDocument` for a nodeId |
| Animation | `enable`, `startTracking`; `animationCreated`, `trackingUpdate` | CSS/WAAPI animation lifecycle with timestamps | not tried |
| Canvas, Heap | recordings, heap snapshots | not needed | - |

Details that matter for tooling (vendor source unless marked):
- `maxCallStackDepth` ≤ 0 falls back to 5, so **1 is the cheapest** setting (`InspectorTimelineAgent::internalStart`).
  FunctionCall, Paint, Composite, Layout and EvaluateScript records capture a stack.
- `performance.mark(name)` arrives as a Timeline `TimeStamp` record. Its time is converted from the mark's own
  monotonic time (`didPerformanceMark`), which aligns page clock and Timeline exactly. A mark per phase, or per
  rAF-logger frame, lets us join the two logs.
- `console.profile()`/`profileEnd()` in page code starts and stops a programmatic capture (Timeline + ScriptProfiler +
  the instruments set by `setInstruments`) once a frontend has `Timeline.enable`d. That brackets e.g. the morph
  window exactly, with no proxy round-trip.
- `Page.enable` side effects: it resets the stopwatch, emits `defaultUserPreferencesDidChange`, and turns on
  load/navigation events. No reload, no style change. A second `enable` fails with "already enabled" (harmless).
  Target ids change on navigation (measured), so re-send it after every reconnect.
- Records are serialised to JSON and sent on the WebContent main thread as they complete (`sendEvent`). The finger
  session saw chunk flushes of 4-10 s (measured, `iphone.md` caveats), i.e. a backlog on the transport. With real
  timestamps a late record is still correct, but the serialisation cost lands in measured frames (inference).
  Hence P1 is an attribution run, not an A/B metric.
- With `Screenshot` in `setInstruments`, every composite triggers a full-viewport software snapshot plus PNG
  encode on the main thread (`PageTimelineAgent::captureScreenshot`). Never use it in timed runs.

**Why the counts worked but the times didn't:** `Timeline.start` turns tracking on and records flow, but each
`startTime`/`endTime` is the never-started stopwatch's 0 s. ScriptProfiler, CPUProfiler and Memory read the same
stopwatch, so they would also be 0 without `Page.enable`. No other record type or instrument fixes it; the
stopwatch does.

## 3. GPU and compositor: who does what, and what can see it

Path of one frame on iOS (vendor source and doc, compressed):
1. WebContent main thread (rAF, style, layout, paint into backing stores).
2. Layer-tree commit plus `BackingStoreFlush` over IPC.
3. The UI process (MobileSafari) applies it in a Core Animation commit. It also owns scrolling.
4. The render server renders on CPU + GPU: backdrop blur, filters, compositing.
5. Display.

Apple: a **commit hitch** is the app process missing the commit deadline. A **render hitch** is the render server
missing presentation. Hitch duration = actual minus expected frame lifetime
([Understanding hitches](https://developer.apple.com/documentation/xcode/understanding-hitches-in-your-app), vendor doc).
For Safari, "app" is the UI process. A slow WebContent frame doesn't hitch the scroll by itself, because the UI
process keeps scrolling (W2 in `answers-2.md`). It makes page-driven motion such as the morph late. So **rAF gaps
and Instruments hitches measure different things, and we need both.**

| tool | sees | needs | automation |
|---|---|---|---|
| rAF logger (today) | WebContent main-thread frame cadence | nothing | yes, measured |
| Web Inspector Timeline / P1 | main-thread work per runloop turn, Paint rects, Composite (= commit, not GPU) | Web Inspector on | yes, over WIP |
| Layers tab / LayerTree / P2 | layer count, memory estimate, repaint count, reasons | same | yes |
| Instruments **Animation Hitches** | hitches (commit vs render, duration) per process, frame lifetimes, display/vsync track | Xcode, paired device, **Developer Mode** | `xctrace record --template 'Animation Hitches' --device <id> --all-processes --time-limit 10s --output x.trace`, then `xctrace export --input x.trace --toc` / `--xpath` ([xctrace(1)](https://keith.github.io/xcode-man-pages/xctrace.1.html), third-party copy of Apple's man page) |
| Instruments **Metal System Trace / System Trace** | GPU encoder/execution intervals and render-server CPU (Metal), thread states and kdebug points (System Trace) | same | same CLI; heavier (inference) |
| Instruments **Time Profiler**, all processes | stacks of `com.apple.WebKit.WebContent`, `…GPU`, MobileSafari, render server | same | same CLI |
| WebKit kdebug trace points (`RenderingUpdateStart/End`, `CompositingUpdate*`, `PaintLayer*`, `BackingStoreFlush*`, `CommitLayerTree*`, `DisplayListReplay*`) | per-phase intervals in every WebKit process | emitted always via `kdebug_trace(ARIADNEDBG_CODE(47, code))` (`SystemTracing.h`, vendor source) | **unknown**: whether System Trace on iOS decodes them by name (`SystemTracePoints.plist`) has no public doc; one-time check (P9) |
| Compositing borders / repaint counters | per-layer outlines and repaint numbers drawn on the device screen | protocol `Page.overrideSetting` | set yes; reading them needs a screen capture |
| Real screen (WDA `/screenshot`, side-button screenshot, QuickTime "New Movie Recording" with the iPhone as camera) | the composited pixels, **including backdrop-filter** | WDA: Developer Mode + Apple ID signing (`finger-simulation.md`); others: none | WDA yes; QuickTime manual (inference: `ffmpeg -f avfoundation` could automate it, unverified) |

Rules:
- **Developer Mode:** needed for Instruments on the device and for WDA (vendor doc,
  [Enabling Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device):
  "Developer settings appear on the device"). Not needed for Web Inspector or our proxy.
- **Apple account:** needed for WDA signing, not for Instruments (inference). On first use, Xcode prepares the
  device's developer disk image, which may involve Apple's servers (inference). That is the user's own Xcode doing
  it, not our tooling (Hard rule 12).
- **Metal Performance HUD:** in iOS Developer settings; it applies to CAMetalLayer content. Safari's page layers are
  CA backing stores, so it is not expected to show the page's GPU cost (inference, low priority).

## 4. Probe recipes

Every recipe that touches the phone runs under the `iphone` lease, on the plain-http twin (I-003), after a passing
control run. It counts toward heat: keep windows ≤ 10-20 s and lock the phone between blocks
(`fixes/iphone-wave2/README.md` "Thermal episode"). Safari's own Web Inspector window must be **closed** during
proxy runs: a second frontend shares the agents, so `Page.enable` would fail "already enabled" and time bases and
overrides would mix (inference from the agent code).

**P1. Timeline v2: per-frame attribution with real timestamps.** *Toolsmith* (measurement code in `tools/lib/wip.mjs`
and `iphone.mjs`, plus an analyzer).
- Steps:
  1. `openTab`, then `Page.enable` on `page`.
  2. `Timeline.enable`, `Timeline.setInstruments(['Timeline'])` (optionally `'ScriptProfiler'`).
  3. Install the rAF logger, which calls `performance.mark('f'+n)` every frame, or only at phase edges to keep it
     light.
  4. `Timeline.start({maxCallStackDepth: 1})` once for the whole window, ≤ 15 s. Alternatively, page code calls
     `console.profile('morph')`/`profileEnd` around the morph drive (`__fwMorphDrive`).
  5. `Timeline.stop`; drain `eventRecorded` until `recordingStopped` plus ~2 s.
  6. Analyzer: per `RenderingFrame`, the summed child durations by type (script = FunctionCall/FireAnimationFrame/
     TimerFire/EventDispatch/ObserverCallback; style; layout; paint with summed quad area; composite). Join to rAF
     frames through the marks. Report, per long frame, busy ms vs interval ms, and the "idle-in-gap" share.
- Metric: main-thread ms per frame by phase, paint area per frame, commit (Composite) ms. **Not** GPU.
- Overhead: medium (record JSON on the main thread, a stack per record). Validate once: Timeline-on vs off, n=3
  interleaved, idle and scroll phases. The old 1 s-chunk run sat inside the clean spread (measured, n=1), but
  continuous recording is new. Use it as an attribution run next to unprobed control runs, never as the A/B number.
- Runner fit: yes. It only adds WIP traffic; no WDA, no human.

**P2. Layer census at fixed points.** *Toolsmith* (small; a library function plus a `layers` probe kind).
- Steps:
  1. `DOM.getDocument` gives the root nodeId; then `LayerTree.enable`.
  2. At named states, call `LayerTree.layersForNode(root)`: page top; morph at rest; morph start (`--morph` > 0);
     0.72 flip held via `__fwMorphDrive({hold})`; morph at 1; bottom after release.
  3. Per layer, store `layerId, nodeId, memory, paintCount, compositedBounds`.
  4. For the top-20 by memory and every backdrop/filter candidate, call `reasonsForCompositingLayer`.
- Metric: layer count, Σ memory (estimate), per-layer reasons. **ΔpaintCount between two census points** = repaints
  per layer over that window: a cheap paint-flashing number with no Timeline. Add `Memory.startTracking` for the
  `layers` category at 2 Hz as a cross-check (WebContent-side IOSurfaces only; backing stores owned by the GPU
  process are not in it, inference).
- Overhead: one synchronous walk on the main thread per call (tens of ms on a big tree, inference). Only at held
  states or after a timed window, never per frame. Counts don't depend on heat, so this can run on a warm phone.
- Caveat: under memory pressure iOS ignores `will-change` (`webkit.md` §4), so a census should record
  `memoryPressure` events and compare counts from fresh loads only.

**P3. Real-screen check for clip-path × backdrop-filter.** *User one-time* (side-button screenshot) or *toolsmith*
(WDA `/screenshot` once the WDA runner exists).
- Steps: open the R2 probe page (`/fw-clip-probe.html`) and screenshot the composited screen. Then do the same with
  the morph held at 0.72 on the real page.
- Not usable for this: `Page.snapshotRect`, `snapshotNode`, Timeline Screenshot and `LayerTree.requestContent`, which
  all paint in software (§0.3).
- Metric: yes/no, visual; blur inside vs outside the inset. WebKit bug
  [142662](https://bugs.webkit.org/show_bug.cgi?id=142662) ("backdrop-filter cannot be clipped with … clip-path") was
  fixed in 2016 (bug), but an animated `inset(round)` on 26.6.1 still needs the look.
- Overhead: none on the timed metric (separate, static).

**P4. Hitches and GPU via Instruments (`xctrace`).** *User one-time* (Developer Mode, Xcode device support, checking
template names with `xctrace list templates`, the first manual Instruments run). After that, *toolsmith* (a wrapper
that records alongside a WIP/WDA-driven morph).
- Steps:
  1. `xctrace record --template 'Animation Hitches' --device <udid> --all-processes --time-limit 12s --output
     out/iphone/<label>.trace`, started 2 s before the morph drive.
  2. A second run with the System Trace or Metal System Trace template.
  3. `xctrace export --toc`, then `--xpath` for the hitch and GPU tables, into JSON (schema names found at step 1).
- Metric: hitch count, duration and type (commit vs render) for MobileSafari and the render server; GPU busy ms per
  frame; render-server CPU. Run ghbn-style variants (nav backdrop off) as A/B pairs: **this is the backdrop-cost
  answer.**
- Overhead: recording runs on the phone (System Trace is heaviest) and adds heat. Mac-side export/symbolication is
  CPU-heavy, so do it after the block and outside other agents' `chrome-measure` holds (short lane or a quiet window).
- Runner fit: yes for scripted drives (WIP or WDA). Its numbers don't compare with probe-free rAF runs, so they go
  in their own block with their own control.

**P5. Event Timing on finger runs** (from `arch-devtools`, `devtools-methodology.md` G2). *Toolsmith* (a few lines in
`iphone.mjs record`).
- Steps: `new PerformanceObserver(…).observe({type:'event', durationThreshold:16, buffered:true})` and keep
  `touchstart`/`pointerdown`/`touchend` entries: `processingStart - startTime` is the input delay, plus `duration`.
  Safari 26.2+ has it (vendor doc). `touchmove` is excluded by spec, so it measures scroll *start* and the morph
  push, not steady scrolling.
- Overhead: negligible. Runner fit: yes, also in WDA gesture runs.

**P6. CPU and memory side channels.** *Toolsmith*: `Timeline.setInstruments(['CPU','Memory'])` or the domains'
`startTracking`, at 500 ms samples (`ResourceUsageThread.cpp`: "Web Inspector expects this interval to be 500ms").
- Metric: WebContent CPU % per thread and the `layers` memory over the run.
- Use: a saturated main thread vs idle-in-gap (complements P1); a heat early-warning (CPU high while rAF drops).
- Overhead: low (inference). Runner fit: yes.

**P7. Visual paint and layer diagnostics on the device.** *Toolsmith* or a manual step:
`Page.setShowPaintRects(true)`, `Page.overrideSetting({setting:'ShowDebugBorders', value:true})` and the same for
`ShowRepaintCounter`. Drive the morph, take a screen capture or recording (P3 means), then `Page.disable` to reset.
- Metric: which layers repaint during the morph, and backdrop-layer outlines (the legend's backdrop colour).
- Overhead: large (extra debug layers and painting). Never in a timed run. Good for a one-off "what repaints at the
  0.72 flip" picture to hand to the owners.

**P8. Manual Web Inspector session.** *User at the Mac*:
- Steps:
  1. Develop > iPhone > tab. Timelines with Layout & Rendering, JavaScript & Events, CPU and Memory on.
  2. Frames view during a morph push.
  3. Layers tab at the held states.
  4. Export the recording (⌘S) to `out/iphone/` for offline parsing.
- Value: a human-readable first look, and a ground truth to check the P1/P2 parsers against. The proxy must not be
  driving the tab at the same time.

**P9. kdebug trace points.** *User one-time experiment*:
- Steps: one System Trace with all processes during a morph. Look for a WebKit lane or named intervals, or a kdebug
  table in `xctrace export --toc` filterable to class Ariadne/component 47 (`de-safari`'s question).
- Value: if visible, they give rendering-update, commit and display-list-replay intervals with real times in
  WebContent, the GPU process and the UI process. That is the best attribution we could get. If not visible, drop it.

(The Animation domain was skipped: lifecycle events, low value for these questions.)

## 5. Ranking against our open questions

| open question | best probe | then | why |
|---|---|---|---|
| Why are morph moving frames ~21-33 ms (p50 21-35, `iphone-wave2` §3b)? | **P1** | P4 | P1 splits the main-thread part and shows idle-in-gap. If busy ≪ interval, the cost is back-pressure or render-side, and P4 sees it |
| Does the nav backdrop dominate? | **P4** (A/B: nav backdrop on vs off) | P2 (its layer's memory and reasons), P7 | backdrop blur runs in the render server/GPU; rAF and Web Inspector are blind to it (inference from §3) |
| Does clip-path clip backdrop-filter? | **P3** | P7 | only real composited pixels show a backdrop |
| How many layers and how much memory at morph start and at the 0.72 flip? | **P2** | P6 (`layers` memory), P8 | direct counts, memory estimates and reasons |
| Touch-start delay on finger runs (goal is a finger) | **P5** | - | cheap, already designed |

Overall order to build: **P1, P2, P3, P4, P5, P6, P7, P8, P9.**
- P1 and P2 are pure WIP, so no new setup, and together they answer two of the four questions.
- P3 is a one-minute user action today.
- P4 waits for Developer Mode (in progress for WDA), but it is the only GPU evidence.

## 6. What must not run during a timed block

- Timeline `Screenshot` instrument; P7 debug borders, repaint counters or paint rects; `LayerTree.layersForNode`
  inside the window; heap snapshots (`Heap` instrument, every 10 s in the UI); `Runtime.evaluate` polling faster
  than ~1 Hz; WDA `/source` or element queries (`finger-simulation.md`); Safari's Web Inspector UI open on the tab.
- Continuous Timeline (P1) is allowed only in attribution runs, labelled as such. The A/B metric stays the
  probe-free rAF log (or the per-frame logger agreed in protocol v2).
- **Overhead check rule:** one A/A per probe version (probe on vs off, n=3 interleaved, same control). Exemptions:
  probes that only run outside the timed window (P2 at held states, P3), and passive page observers whose own time
  the page measures (wrap the callback in `performance.now()` and report Σ ms per frame). The second exemption is
  cheaper and suits Event Timing and mutation counters.

## Sources

Vendor doc:
- https://developer.apple.com/documentation/safari-developer-tools and children: inspecting-ios, develop-menu,
  web-inspector, developer-settings, feature-flag-settings, inspect-apps-and-devices, connecting-an-ai-agent-to-safari.
- https://webkit.org/web-inspector/timelines-tab/, https://webkit.org/web-inspector/layers-tab/,
  https://webkit.org/web-inspector/audit-tab/
- https://webkit.org/blog/3996/introducing-the-rendering-frames-timeline/
- https://developer.apple.com/documentation/xcode/understanding-hitches-in-your-app
- https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device

Vendor source (WebKit `main`, under https://github.com/WebKit/WebKit/blob/main/):
- Protocol: `Source/JavaScriptCore/inspector/protocol/{Timeline,Page,LayerTree,ScriptProfiler,CPUProfiler,Memory,Animation}.json`
- WebCore inspector agents: `Source/WebCore/inspector/agents/{InspectorTimelineAgent,InspectorPageAgent,InspectorLayerTreeAgent,InspectorMemoryAgent,InspectorCPUProfilerAgent}.cpp`
- WebCore inspector, other: `Source/WebCore/inspector/agents/page/PageTimelineAgent.cpp`,
  `Source/WebCore/inspector/{PageInspectorController,FrameInspectorController}.cpp`
- JavaScriptCore: `Source/JavaScriptCore/inspector/agents/{InspectorScriptProfilerAgent,InspectorDebuggerAgent}.cpp`
- WebCore page: `Source/WebCore/page/ResourceUsageThread.cpp`, `Source/WebCore/page/cocoa/ResourceUsageThreadCocoa.mm`
- WebKit: `Source/WebKit/WebProcess/WebPage/RemoteLayerTree/RemoteLayerTreeDrawingArea.mm`
- WTF and resources: `Source/WTF/wtf/SystemTracing.h`, `Source/WebKit/Resources/Signposts/SystemTracePoints.plist`
- Web Inspector UI: `Source/WebInspectorUI/UserInterface/Controllers/{TimelineManager,LayerTreeManager}.js`

Bug: https://bugs.webkit.org/show_bug.cgi?id=142662

Third-party: https://keith.github.io/xcode-man-pages/xctrace.1.html (copy of Apple's man page)

Repo:
- `research/cpu-throttle-calibration/iphone.md` and `tools/iphone_scroll.mjs` (no `Page.enable`)
- `tools/lib/wip.mjs`, `fixes/iphone-wave2/README.md`
- `research/architecture/{webkit,answers-2,finger-simulation}.md`
- `devtools-methodology.md` (arch-devtools, worktree `agent-ad5593c3c7d3b8c97`)
