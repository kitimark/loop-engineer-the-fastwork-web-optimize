# Architecture answers, round 2: transition frames and touch-path metrics (W1-W3, R1-R3)

2026-10-01, architecture-team specialist (rules: `fixes/ARCH_TEAM.md`). Public sources only, with generic
queries: no project code, URLs or personal data. The questions come from `measurement-review.md` §7 (the
iPhone >34 ms clusters at fixed scroll positions where sections flip `content-visibility` and
`will-change`, and the touch-path metrics). Builds on `webkit.md`, `render.md` and `README.md`.

Confidence labels: **spec**, **vendor doc**, **vendor source** (engine source on `main`, read 2026-10-01;
iOS 26.6.1 and the local Chrome can lag it), **third-party doc**, **inference** (my reasoning; verify it).

## Headline

1. **On WebKit, native `content-visibility: auto` has no margin.** WebKit's relevancy observer uses an
   empty `rootMargin` on the layout viewport (vendor source). Chromium uses 150 % (vendor source), and the
   spec suggests 50 %. On the iPhone a section therefore un-skips only once its box touches the viewport, one
   frame late, and it pays style, layout, paint **and creates all its composited layers** in that one
   rendering update: skipped content can't be composited in WebKit (vendor source). This is a strong
   candidate for the iPhone clusters that Chrome doesn't show at the same positions.
2. **A `will-change` flip across a subtree is layer churn in one commit.** Removing it drops each layer's
   backing store (its content is repainted into the ancestor). Adding it back paints new backing stores.
   Paused animations keep their layers anyway (`isCurrentlyAffectingProperty`, vendor source), so the
   `will-change: auto !important` override buys nothing for animated elements and costs a churn at every
   pause and resume.
3. **iOS `scrollBy({behavior:'smooth'})` on the main page is a UIKit animation in the UI process**
   (`setContentOffset:animated:YES`, vendor source). rAF gaps during it measure the WebContent rendering
   cadence (main-thread work plus waiting for the previous commit), not scroll smoothness.
4. **Chrome's legacy `Event.Latency.*.Touch.TimeToScrollUpdateSwapBegin4` histograms are gone.** Use
   `EventLatency.FirstGestureScrollUpdate.Touchscreen.TotalLatency2` for blocking listeners, because
   touchmoves turn non-blocking after the first consumed scroll update (vendor source).
   `Browser.getHistograms` only sees browser-process histograms: open `chrome://histograms` first to merge
   the renderer's.
5. **In both engines, the animation update runs before rAF callbacks** (spec + both sources). The first
   layout read in a rAF pays the style recalc of every CSS animation that ticked this frame. E3 is well
   founded.
6. **`contentvisibilityautostatechange` is a good marker.** It fires as a posted task right *after* the
   frame that did the (un)skip rendering. Attribute the cost to the frame that ends just before the event.
   It doesn't bubble, so listen in the capture phase on `document`.

---

## W1. Un-skip and `will-change` flips: one frame? How to pre-warm?

**Answer.** Yes, in one rendering update, and on WebKit at the worst moment.

- **Spec timing:** proximity determinations other than the initial one "take effect at the next rendering
  opportunity" (spec: css-contain-2 "update content relevancy",
  https://drafts.csswg.org/css-contain-2/#proximity-to-the-viewport; HTML "update the rendering", the
  content-visibility loop after "recalculate styles and update layout",
  https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering). Frame N decides; frame N+1
  styles, lays out and paints the whole subtree.
- **WebKit, detection:** `ContentVisibilityDocumentState` creates its IntersectionObserver with
  `IntersectionObserver::Init { document, { }, { }, { } }`, which means an empty `rootMargin`. It
  intersects against `layoutViewportRectIncludingObscuredInsets()`. **There is no look-ahead margin** (vendor
  source: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/ContentVisibilityDocumentState.cpp,
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/IntersectionObserver.cpp, "IncludeObscuredInsets::Yes is only used by
  ContentVisibilityDocumentState"). Compare Chromium: `kViewportMarginPercentage = 150.f`, "so that we get the
  observation before the element enters the viewport" (vendor source:
  https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/display_lock/display_lock_document_state.cc
  and `.h`).
- **WebKit, frame N+1:** the rendering-update order is `… Animations → AnimationFrameCallbacks →
  ResizeObservations → FocusFixup → UpdateContentRelevancy → … IntersectionObservations → … LayerFlush`
  (vendor source: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/Page.cpp,
  `updateRendering`). The observer fires in frame N's IntersectionObservations step (after
  UpdateContentRelevancy) and calls `scheduleContentRelevancyUpdate` (vendor source: `Document.cpp`). Frame
  N+1's UpdateContentRelevancy step then runs `invalidateStyle()` on the section (vendor source:
  `checkRelevancyOfContentVisibilityElement`). The same update's style, layout, paint and layer flush then
  render the subtree.
- **WebKit, layers:** `RenderLayerCompositor::canBeComposited` returns false for `isSkippedContent()` (vendor
  source: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/RenderLayerCompositor.cpp).
  Every composited descendant (will-change, filters, backdrop, 3D transforms) loses its layer while the section is
  skipped. On un-skip, all of them are created and their backing stores painted in that single update, and
  **again on every re-entry**, because re-skipping tears them down.
- **Commit back-pressure:** after a commit, the WebContent process doesn't start the next rendering update
  until the UI side reports `displayDidRefresh` (`m_waitingForBackingStoreSwap`; vendor source:
  https://github.com/WebKit/WebKit/blob/main/Source/WebKit/WebProcess/WebPage/RemoteLayerTree/RemoteLayerTreeDrawingArea.mm).
  A commit with many new, large backing stores therefore also delays the *following* frame (inference).
- **`will-change` flip:** `requiresCompositingForWillChange` is one of the reasons that give an element its
  own layer (vendor source, same file). Removing it on N elements drops N backings, and their content is
  repainted into the enclosing layer. Adding it back creates N backings and paints them. Both happen in one
  compositing update and commit (vendor source + inference on the timing). Elements with a paused animation
  on transform, opacity or filter stay composited through `requiresCompositingForAnimation` →
  `isCurrentlyAffectingProperty` (vendor source). So the `!important` override only churns the layers that
  are *not* animated. On iOS under memory pressure `will-change` doesn't composite at all (Conservative
  policy, `webkit.md` §4), so layer counts differ between runs.

**Confidence:** high for the order and the zero margin (vendor source, `main`; iOS 26.6.1 may lag but this
code is old: WebKit's content-visibility shipped in 18.0). Medium on the relative size of the layer part
vs the style/layout part (inference: measure it).

**Consequence: pre-warming options, best first.**

1. **Don't use native `content-visibility: auto` on the iPhone for sections with composited children.**
   Use a JS gate with its own IntersectionObserver (`rootMargin: '150% 0px'` or more, as Chromium does
   natively) that toggles `content-visibility: hidden` → `visible`. `contain-intrinsic-size: auto <px>`
   **only fixes the placeholder size**; it pre-warms nothing.
2. **Render once, then keep it.** After a section's first un-skip, leave it `visible` (never re-skip), or
   re-skip only when it is far away (≥ 3 viewports). This removes the repeat cost on scroll-back, which
   WebKit pays in full because of the layer teardown.
3. **Move the un-skip to a quiet moment:** `scrollend` (Safari 26.2+, `webkit.md` §7) or a `setTimeout`
   of about 150 ms after the last `scroll` event, for the next 1-2 sections in the scroll direction. Safari
   has no `requestIdleCallback`. Pair it with the wide IO as a fallback.
4. **Split the cost over frames:** un-skip the section shell first, then its heavy children (their own
   `content-visibility: hidden` wrappers), one per rAF. Each frame pays one child's style, layout, paint
   and layers.
5. **`will-change`:** drop the `will-change: auto !important` override on paused scenes and keep only
   `animation-play-state: paused` (N9 candidate 1). If memory is the reason for the override, toggle it at
   `scrollend`, never mid-scroll.

**Cheap verification (in-page probe, iPhone, no Chrome slot).** Add a capture listener on `document` for
`contentvisibilityautostatechange` that logs `performance.now()`, `scrollY` and the target's
`getBoundingClientRect().top` (a read on the section box itself is safe), joined to the rAF-delta log.

- Expected on the iPhone: at `skipped: false`, the section's top is inside `[0, innerHeight]` (zero
  margin), and the rAF delta ending just before the event is the cluster frame.
- Expected in Chrome: top ≈ 1.5-2.5 × `innerHeight` below the viewport.
- For the layer part: Web Inspector's Layers tab count before and after the section enters, and whether
  it drops again when you scroll away. For the ablation: the N9 variants (no override / no deferral), 3+3
  scripted runs per variant, reading clusters C and F.

## W2. Is `window.scrollBy({behavior:'smooth'})` async on iOS 26? What do rAF gaps mean?

**Answer.** It runs in the UI process as a UIKit animation (for the main document).

The chain is:

1. The request travels in the scrolling-state tree with the next layer-tree commit.
2. For the root node, `RemoteScrollingCoordinatorProxy::scrollingTreeNodeRequestsScroll` defers it until
   after the commit, and `adjustViewScrollPosition` calls `WebPageProxy::requestScroll(…, ScrollIsAnimated::Yes)`.
3. `WKWebView _scrollToContentScrollPosition:…animated:` then calls
   `[_scrollView setContentOffset:… animated:YES]`.

Sources (vendor source):
https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/RemoteLayerTree/RemoteScrollingCoordinatorProxy.cpp,
https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm. Overflow
scrollers take the same route through `ScrollingTreeScrollingNodeDelegateIOS::startAnimatedScrollToPosition`
(`setContentOffset:animated:YES`). Consequences:

- The scroll itself keeps moving while the WebContent main thread is blocked. The animation curve and
  duration are UIKit's, not CSSOM's (inference: I found no public duration figure).
- The request starts one commit late: the scroll begins after the next rendering update.
- `scrollY` on the main thread comes from the UI process's visible-rect updates, so scroll-linked JS sees a
  position one or more frames old (inference).

**What the rAF gaps mean.** A gap is the time between two WebContent rendering updates:

- script, style, layout and paint recording of that update, **plus**
- waiting for the previous commit to be displayed (the back-pressure in W1).

It is **not** a gap in the page's scrolling. On the phone, a long gap is visible as a stutter only in what
the main thread drives: JS scroll effects, main-thread CSS animations (custom properties, SDA before 26.4),
newly un-skipped or unpainted areas (blank until painted), and `position` changes made by JS.

Finger scrolls go through UIScrollView in the UI process too. The difference is non-passive touch listeners,
which make the gesture wait for the main thread (`webkit.md` §6). So scripted and finger runs measure the
same frame-production cost, except for touch handling.

**Confidence:** high for the main-frame path (vendor source). Medium for "one commit late" and for the
`scrollY` lag (inference from the commit path).

**Consequence.** Keep rAF-gap frames as the KPI: this page's jank is main-thread-driven effects, and those
are what rAF gaps measure. But label the metric "main-thread frame gaps", not "scroll jank". A section that
arrives blank is **not** caught by rAF gaps; it needs a screenshot or a finger test. Don't read a
cluster's `scrollY` as exact: allow a frame or two of lag.

**Cheap verification (iPhone, 1 min, needs the lease).** Mid-way through one scripted `scrollBy` smooth
call, run a 300 ms busy loop from a `setTimeout`. Log `scrollY` just before and just after the loop, and
watch the screen.

- Async: the page keeps moving during the loop, and `scrollY` jumps by roughly 300 ms of travel.
- Main-thread animated: the page freezes, and `scrollY` continues from where it stopped.

## W3. Background or theme class flip on a full-viewport section root: repaint all tiles?

**Answer.** Yes, for the tiles that exist.

- A background change is a repaint-type style difference on the element. Its whole background rect is
  invalidated in the backing store of the composited layer that paints it.
- If the section root is not composited, that is an ancestor's layer: often the root layer, and then the
  tiles of the whole visible area plus the coverage margin.
- Every non-composited descendant painted in those tiles is re-recorded and re-rastered with it.

`contain: paint` doesn't help: it isn't a compositing reason in WebKit (not in `requiresCompositingLayer`;
vendor source, `RenderLayerCompositor.cpp`). It only clips overflow, so the element's own area still
repaints.

**What does avoid it:**

- **Solid colours: a composited layer with nothing to paint gets its colour directly.**
  `RenderLayerBacking::updateDirectlyCompositedBackgroundColor` uses `setContentsToSolidColor` when the
  layer `isSimpleContainerCompositingLayer`: no box decorations, no painted content (vendor source:
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/RenderLayerBacking.cpp).
  - An empty, absolutely-positioned background element behind the content, composited with
    `will-change: transform` or `transform: translateZ(0)`, changes colour with **no backing store and
    no repaint**, just a layer property in the commit (vendor source for the mechanism; inference that a
    class flip takes that path each time).
  - A CSS transition of its `background-color` is main-thread per frame (not accelerated, `webkit.md`
    §9), but each frame costs a style recalc of one element, no repaint (inference).
- **Gradients or images: an opacity cross-fade between two pre-painted layers.**
  - Opacity on a composited layer is a layer property. A CSS transition of it runs as a Core Animation
    animation off the main thread (`webkit.md` §2 and §9).
  - Both layers paint once, at creation. Create them at load, or at the first un-skip, not at the flip.
  - Cost: memory. A full-viewport layer at DPR 3 is about 1290 × 2796 × 4 B ≈ 14 MB per layer (tiled,
    visible area plus coverage; inference). Two per themed section is fine; ten is not.
- The theme's **text colour** change still repaints the text (re-record plus raster) wherever it is, so
  keep the flipped colour on the background layer and leave text colours alone, or accept that repaint.

**Confidence:** high for "background change repaints the painting layer's tiles" and for
`contain: paint` (vendor source). High for the direct solid-colour mechanism (vendor source), medium that
a given page element qualifies: any border, shadow or painted child disqualifies it. Check in the Layers
tab.

**Consequence (N9 candidate 3).** Move theme and background flips off the section root onto a dedicated
empty background element (solid colour) or two stacked layers (gradient) cross-faded with `opacity`.
Expected: the flip frame loses its paint and raster share. The cluster should shrink to one element's
style recalc plus the commit.

**Cheap verification (iPhone).**

- Web Inspector Timelines, Rendering Frames plus Paint events: at the flip position, baseline shows a Paint
  covering the section. The patch shows none, or only small ones.
- Layers tab on the background element: "Paints: 0" after the first frame and no backing-store memory, for
  the solid-colour variant.

## R1. Chrome histograms for touch-scroll latency; does `Input.synthesizeScrollGesture` touch respect non-passive listeners?

**Answer, histograms.** From Chromium's `tools/metrics/histograms/metadata/event/histograms.xml` (vendor
source, https://chromium.googlesource.com/chromium/src/+/HEAD/tools/metrics/histograms/metadata/event/histograms.xml):

| histogram | what it measures | blocking listeners included? |
|---|---|---|
| `EventLatency.FirstGestureScrollUpdate.Touchscreen.TotalLatency2` | from the first scroll-causing touchmove's generation to presentation | **yes**: touchstart and the first touchmove block (see below) |
| `EventLatency.GestureScrollUpdate.Touchscreen.TotalLatency2` (and the non-v2 `TotalLatency`) | the same for the later, non-inertial updates | mostly no: touchmoves become non-blocking once scrolling starts |
| `EventLatency.TouchPressed.TotalLatency`, `EventLatency.TouchMoved.TotalLatency` | the touch events themselves, generation to presented frame | yes, the main-thread dispatch |
| `EventLatency.GestureScrollBegin.Touchscreen.TotalLatency2` | rarely populated (the xml says so) | - |
| `Event.ScrollJank.DelayedFramesPercentage.FixedWindow` / `.PerScroll`, `Event.ScrollJank.MissedVsyncs*` | frames that missed a vsync during a scroll; FixedWindow is emitted only per 64 presented frames | indirectly |

- The legacy `Event.Latency.ScrollBegin/ScrollUpdate.Touch.TimeToScrollUpdateSwapBegin4` are **no longer
  in the xml**; only `…Touch.AverageLagPresentation` remains. Don't build on them.
- All `EventLatency.*` record "only on machines with high-resolution clocks" (Macs qualify).

**Catch: `Browser.getHistograms` reads only the browser process's `StatisticsRecorder`** (vendor source:
`BrowserHandler::GetHistograms`,
https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/devtools/protocol/browser_handler.cc).
Renderer and GPU histograms (EventLatency, Graphics.Smoothness, Blink) reach it only when a UMA log is staged or
`chrome://histograms` is opened (third-party doc:
https://pkg.go.dev/github.com/kernel/kernel-images/server/lib/metrics). I infer that EventLatency is
reported by the renderer's compositor frame reporter (inference, strong), so without that sync the
numbers are empty or stale.

**Answer, synthetic touch.** Yes, it goes through the real browser input path and respects non-passive
listeners. Input it doesn't exercise: only the OS event source. On Mac:

1. `SyntheticGestureTargetMac::DispatchWebTouchEventToPlatform` → `RenderWidgetHostViewMac::InjectTouchEvent`.
2. That feeds the `FilteredGestureProvider`, where scroll gestures are released per touch ack, then
   `RouteTouchEvent` or `ForwardTouchEventWithLatencyInfo` into the touch queue.
3. The renderer's compositor then decides blocking vs non-blocking from the listener region.

Sources (vendor source):
https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/renderer_host/input/synthetic_gesture_target_mac.mm,
https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/renderer_host/render_widget_host_view_mac.mm.

**The blocking window is short:** `PassthroughTouchEventQueue` sets `send_touch_events_async_ = true` after
the first **consumed** GestureScrollUpdate. From then on every touch event except touchstart goes out
`kEventNonBlocking` until GestureScrollEnd (vendor source:
https://chromium.googlesource.com/chromium/src/+/HEAD/components/input/passthrough_touch_event_queue.cc).
Plus, window, document and body touch listeners are passive by default.

**Confidence:** high (vendor source) for the path and the async switch. Medium for which process records
EventLatency.

**Consequence (morph-scrolljack, nav-morph).**

- A passive-listener fix moves **scroll-start latency** (`FirstGestureScrollUpdate`, `TouchPressed`), not
  steady-state update latency. The earlier flat CDP-ack result is expected: it measured the wrong window.
- Probe recipe, one Chrome slot, a toolsmith change to measurement code:
  1. Open a second target on `chrome://histograms/#EventLatency` and wait 1 s, to sync the child processes.
  2. `Browser.getHistograms({query:'EventLatency', delta:true})` to set a baseline.
  3. Run N touch `synthesizeScrollGesture` calls, **each a separate gesture** (each has one first update).
  4. Re-open or reload `chrome://histograms`, then `getHistograms` delta again.
  5. Compare the medians of `FirstGestureScrollUpdate.Touchscreen.TotalLatency2`.
- Use ≥ 20 gestures per side: one sample per gesture.

**Cheap verification (one short slot, fixture page).** A page with a `{passive:false}` touchmove
listener that busy-waits 30 ms of wall time, and the same page with `{passive:true}`.

- Expect: `FirstGestureScrollUpdate` median up by ≈ 30 ms or more on the blocking side, `GestureScrollUpdate`
  roughly unchanged.
- If both are empty without the `chrome://histograms` step and populated with it, the sync caveat is
  confirmed.

## R2. Blink: CSS animations updated before or after rAF? Does the first read in rAF pay for them?

**Answer.** Before. The first style or layout read in a rAF pays their style recalc.

1. **Spec order:** "update animations and send events" comes before "run the animation frame callbacks",
   then "recalculate styles and update layout" (spec:
   https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering).
2. **Blink's order:** `PageAnimator::ServiceScriptedAnimations` runs, in this order:
   1. resize and scroll events;
   2. media queries;
   3. step 11, `UpdateAnimationsForDocument` → `LocalFrameView::ServiceScrollAnimations` →
      `DocumentAnimations::UpdateAnimationTimingForAnimationFrame` ("Update the current time of all
      timelines"), plus animation events;
   4. step 14, `ExecuteFrameCallbacks` (rAF).

   Style and layout run later, in the lifecycle (vendor source:
   https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/page/page_animator.cc,
   `…/core/animation/document_animations.cc`, `…/core/frame/local_frame_view.cc`).
3. **Invalidation:** a sampled effect whose interpolations changed calls
   `effect_target_->SetNeedsAnimationStyleRecalc()` (vendor source: `KeyframeEffect::ApplyEffects`,
   https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/animation/keyframe_effect.cc).
   Style recalc is lazy, so at rAF entry every element with a ticking main-thread animation is style-dirty.
   A `getBoundingClientRect` needs clean style and layout for the document and pays all of it. A
   `getComputedStyle` of an unrelated element may not (inference).
4. **Scope of the bill:** an animated *inherited* property, including an unregistered or `inherits: true`
   custom property, restyles the target's descendants too (`render.md` Q1).
5. **Composited animations:** they are also sampled on the main thread. I did not find a gate in
   `ApplyEffects`, so assume they add some recalc; far less than main-thread ones, since they don't dirty
   layout or paint (inference).
6. **Scroll handlers:** these run *before* the animation update, so a read in a scroll handler doesn't pay
   for this frame's animation ticks. A read in rAF does (inference from the order).
7. **WebKit does the same:** `Page::updateRendering` runs `RenderingUpdateStep::Animations`
   (`updateAnimationsAndSendEvents`) before `AnimationFrameCallbacks` (vendor source, `Page.cpp`). The same
   bill therefore lands on the first reader in rAF on the iPhone (inference for how much accelerated
   animations contribute there).

**Where it shows:**

- LoAF: in the rAF script's `forcedStyleAndLayoutDuration` (spec:
  https://w3c.github.io/long-animation-frames/).
- Trace: an `UpdateLayoutTree` nested under `FireAnimationFrame` → `FunctionCall`, whose `elementCount`
  includes the animated elements.

**Confidence:** high for the order and the invalidation (spec + vendor source). Medium for the size split
between composited and main-thread animations.

**Consequence (E3).** The ablation design is sound: pausing all CSS animations should cut the forced
style in the first rAF reader (`iE`/`l`), if running animations are the pending work. An even cheaper
probe than E3 is a **first-reader probe**:

- At page start (`addScriptToEvaluateOnNewDocument`), register a rAF loop that times
  `document.documentElement.getBoundingClientRect()` at the top of its callback.
- rAF callbacks run in registration order, and the probe re-registers first each frame, so it stays
  first.
- That duration is "pending style+layout at rAF entry". It then drops out of `iE`/`l`: the cost-migration
  trap, but known and measured.
- Log it per frame next to `dt` and `scrollY`.

**Cheap verification.** Run the probe with and without `* { animation-play-state: paused !important }`
in one short Chrome run: the probe's median should fall by roughly the share E3 predicts. Cross-check one
frame in a one-off trace: `UpdateLayoutTree` under `FireAnimationFrame` with a large `elementCount`.

## R3. `contentvisibilityautostatechange` as a probe marker; cost of the first render of a skipped subtree

**Answer, marker.** Yes, with a known offset.

- **Spec:** "dispatched by posting a task at the time when the state change occurs"
  (https://drafts.csswg.org/css-contain-2/, §4.4).
- **Blink:** `ScheduleStateChangeEventIfNeeded` posts a `kMiscPlatformAPI` task from `Lock()` and
  `Unlock()` (vendor source:
  https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/display_lock/display_lock_context.cc).
  After the first observation, an unlock runs as a *start-of-lifecycle* task of the next frame
  (`EnqueueStartOfLifecycleTask`, `display_lock_document_state.cc`). So the subtree renders in that
  frame's lifecycle and the event runs as a task **after** that frame.
- **WebKit:** `queueTaskKeepingNodeAlive(…DOMManipulation…)` is called from the UpdateContentRelevancy step
  of the same rendering update that then styles, lays out and paints (vendor source,
  `ContentVisibilityDocumentState.cpp`). Again the event follows the costly update.
- **Rule:** the cost frame is the frame that *ends at or just before* `event.timeStamp`, not the frame
  after it.
- **Listening:** the event doesn't bubble (WebKit creates it with bubbles = false), so use
  `document.addEventListener('contentvisibilityautostatechange', f, {capture: true})`.
- **Support:** Baseline since September 2024, which covers Safari 18+ and current Chrome (vendor doc:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/contentvisibilityautostatechange_event).
- **JS gates:** the event fires only for native `content-visibility: auto`. For a JS-applied gate
  (class or style change with a placeholder), use the MutationObserver record instead. It is delivered in
  a microtask right after the write, and the cost lands in the *next* rendering update.

**Answer, cost of the first render.** There is no fixed figure: it equals rendering that subtree from
scratch, minus DOM creation and parsing.

- **Style:** the whole subtree, including the recalc blocked while skipped (`blocked_child_recalc_change_`
  in Blink).
- **Layout:** the subtree, plus ancestors if the real size differs from `contain-intrinsic-size`. In
  Chrome that also triggers scroll anchoring; iOS 26 has none (`webkit.md` §3).
- **Pre-paint and paint recording:** the subtree.
- **Raster of the newly exposed tiles.**
- **WebKit only:** creation of every composited descendant layer and its backing-store paint (W1).
- **Re-entry:** a subtree that was rendered before and re-skipped keeps its style and layout objects in
  Blink, so it pays only for what changed while skipped, plus paint. WebKit always rebuilds the layers
  (inference for Blink's reuse, vendor source for WebKit's teardown).

**Where it shows:**

- Chrome trace: in the frame's lifecycle, with no JS stack. `UpdateLayoutTree` has a large `elementCount`,
  `Layout` has large `dirtyObjects`, then `PrePaint`/`Paint`/`Layerize`, and raster on the raster threads.
  Raster is not slowed by the 6x CPU throttle (`render.md` Q10).
- LoAF: in the rendering part of an entry. The time from `styleAndLayoutStart` to `startTime + duration`
  is large, and script durations are small.
- LoAF invisibility: nothing is attributed to a script unless a script forced it first; then it is that
  script's `forcedStyleAndLayoutDuration`. Only frames over 50 ms produce an entry at all (spec:
  https://w3c.github.io/long-animation-frames/).
- iPhone: the Rendering Frames timeline shows it as Layout plus Paint in one frame; the rAF log shows the
  gap.

**Confidence:** high for the timing (spec + both sources). Medium for the Blink re-entry reuse
(inference). The cost size is unknown: measure it.

**Consequence (E2 probe).** One probe covers both kinds of flip:

1. The capture-phase `contentvisibilityautostatechange` listener: `t`, `skipped`, target id, `scrollY`,
   the target's top.
2. A MutationObserver on `class`, `style` and `data-*` of the section roots.
3. The rAF `dt` log.

Join them offline: for each frame over 34 ms, find the nearest marker. A c-v event within ≤ 1 frame
*after* the long frame, or a mutation 1 frame *before* it, names it. The success criterion is unchanged
(≥ 80 % named).

**Cheap verification.** On any Chrome run with the probe, the first `skipped:false` events for sections
below the fold should arrive with the target's top at about 1.5-2.5 viewports down (150 % target margin).
On the iPhone, the top should be at the viewport edge. The same log answers W1's zero-margin claim.

---

## Summary for owners (short form)

- **N10/N9 transition-frames (fix-scroll-engine):** replace native `content-visibility: auto` on
  heavy sections with a JS IO gate (`rootMargin ≥ 150%`) that un-skips once and doesn't re-skip, instead
  of relying on WebKit's zero-margin native gate. WebKit un-skips at the viewport edge and rebuilds all
  descendant layers on each entry (vendor source, high). Expected: the iPhone c-v clusters move off-screen
  or vanish on scroll-back. Verify with the W1/R3 probe (top at event time, Layers count).
- **N9 candidate 1:** drop `will-change: auto !important` on paused scenes. Paused animations keep their
  layers anyway (vendor source, high). Expected: no layer churn at pause and resume positions. Verify in
  the Layers tab and the cluster ablation.
- **N9 candidate 3:** a solid-colour background element (direct composited colour, no repaint), or two
  layers cross-faded with opacity, instead of flipping the section root's background. The root flip
  repaints the painting layer's tiles, and `contain: paint` doesn't prevent it (vendor source, high).
  Verify with Paint events at the flip.
- **Measurement (iphone.mjs):** read rAF gaps as main-thread frame gaps. The smooth `scrollBy` is a UIKit
  animation in the UI process (vendor source, high), so blank or unpainted sections need screenshots.
- **nav-morph / morph-scrolljack (touch path):** measure `EventLatency.FirstGestureScrollUpdate.Touchscreen.TotalLatency2`
  after syncing through `chrome://histograms`, not the CDP ack or the legacy `Event.Latency.*` names.
  Touchmoves stop blocking after the first consumed update (vendor source, high).
- **E3:** sound as designed (spec + vendor source, high). Add the first-reader rAF probe to see the
  pending style bill per frame directly.
