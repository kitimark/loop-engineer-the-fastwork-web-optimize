# Work counts on WebKit: what the Simulator can count, and whether it predicts the phone

`de-counts-sim`, 2026-10-02. WebKit/Simulator half of the user's question (2026-10-02): "does the restyle drop
from ~345 elements to ~30? ... it'll make our work faster right? let's research both chrome and iphone simulator."
The Chrome half and the joint recommendation are `de-counts-chrome`'s
[`work-counts.md`](work-counts.md). Probe, scorer and phone twin: [`work-counts-webkit/`](work-counts-webkit/).

Labels as in the README: **vendor source** (WebKit tag, path, line), **data** (our runs, file named), **derived**.
Platform claims carry CLAUDE.md's status words (CONFIRMED / OBSERVED / UNRESOLVED / REFUTED).

## 0. Answer in plain words

- **WebKit cannot answer "how many elements were restyled".** The Timeline's style record carries no data at all,
  and the only element counter WebKit has (`internals.lastStyleUpdateSize`) exists in WebKit's test runners, not in
  Safari (§1, CONFIRMED from source). The "~345 → ~30" number can only be counted in Chrome.
- **What the Simulator can count** is the *structure* of WebKit's work, without timing: how many style recalcs, how
  many layouts nested inside a style recalc (the container-query trap), how many layouts were rooted at the whole
  view, how many paints and how large, how many layers were created/destroyed/repainted, how many CSS animation
  state changes, plus engine-neutral page-side counts (attribute mutations and the subtree size under each).
- **Does it predict the phone?** For layout-record *structure*, yes so far (§6, OBSERVED): with the phone's own
  scroll driver, every style-nested layout event at the known crossings (y≈1840, ≈2450, the platform switch ≈2620,
  the hero-track ≈2990) appears on the Simulator with the same count and root class, in both A and B, and the P14
  rotator's idle whole-view layouts match even in absolute (C 15/14 vs phone 15; N 0 vs 0). Durations, frame-coupled
  totals and one idle count (A's view layouts ~half) do not match. A coarse step walk does not reproduce crossings.
- **Does it make our work faster?** §7 (partial: for "where does a layout happen, is it nested, what is its root",
  the Simulator can replace the phone's attribution block; the phone stays for every ms and fps claim).

## 1. Inventory: what WebKit's inspector exposes (vendor source)

Tags: `WebKit-7624.4.5` (the phone's 26.6.x family) and `WebKit-7624.2.5.10.5` (the nearest tag to the Simulator
runtime's WebKit 8624.2.5.10.4, iOS 26.5). Every inspector file below is byte-identical between the two tags
(compared locally, 2026-10-02). Links use
`https://github.com/WebKit/WebKit/blob/WebKit-7624.4.5/<path>#L<n>`.

| what | where (path, line) | carries | status |
|---|---|---|---|
| Timeline record types | `Source/JavaScriptCore/inspector/protocol/Timeline.json` l.11-37 | EventType enum: `ScheduleStyleRecalculation`, `RecalculateStyles`, `InvalidateLayout`, `Layout`, `Paint`, `Composite`, `RenderingFrame`, `TimerFire`, `FireAnimationFrame`, `ObserverCallback`, `TimeStamp`, … ; instruments ScriptProfiler, Timeline, CPU, Memory, Heap, Animation, Screenshot | CONFIRMED |
| `RecalculateStyles` data | `Source/WebCore/inspector/agents/page/PageTimelineAgent.cpp` l.218-221 | **an empty object**: no element count, no selector, no invalidation reason | CONFIRMED |
| `ScheduleStyleRecalculation` | same file l.213-216 | empty object **plus a JS stack** (the initiator) | CONFIRMED |
| …fires once per dirtying episode | `Source/WebCore/dom/Document.cpp` l.2807-2819 | `scheduleStyleRecalc` returns early while the style timer is active, so N attribute writes in one task give ONE record; the count is "episodes", not writes | CONFIRMED |
| `InvalidateLayout` | `PageTimelineAgent.cpp` l.189-192 | empty object plus a JS stack | CONFIRMED |
| `Layout` data | `PageTimelineAgent.cpp` l.199-211, `Source/WebCore/inspector/TimelineRecordFactory.cpp` l.180-183 | `root`: the layout root's quad (8 numbers, root-view coordinates). No dirty-object count | CONFIRMED |
| Layout nested in style | `Document.cpp` l.2889 (willRecalculateStyle) … l.2964 (didRecalculateStyle); the container-query interleaved layout loop runs between them (l.2925-2932) | so an interleaved layout appears as a **child `Layout` record of `RecalculateStyles`** | CONFIRMED |
| `Paint` data | `TimelineRecordFactory.cpp` l.166-171; `PageTimelineAgent.cpp` l.253-268 | `clip`: the painted quad in root-view coordinates. One record per painted layer/rect | CONFIRMED |
| `Composite` | `PageTimelineAgent.cpp` l.228-243 | empty; brackets the layer flush | CONFIRMED |
| `RenderingFrame` | `PageTimelineAgent.cpp` l.299-315 | one per rendering update (our frame counter) | CONFIRMED |
| generic record | `TimelineRecordFactory.cpp` l.46-57 | startTime (+ endTime), stackTrace when `maxCallStackDepth` > 0 | CONFIRMED |
| element counter (tests only) | `Document.cpp` l.2938 `m_lastStyleUpdateSizeForTesting = styleUpdate->size()`, l.2960 `++m_styleRecalcCount`; `Source/WebCore/style/StyleUpdate.h` l.82 size() = elements + texts; `Source/WebCore/testing/Internals.idl` (`startTrackingStyleRecalcs`, `styleRecalcCount`, `lastStyleUpdateSize`, `layoutUpdateCount`, `compositingUpdateCount`, `renderingUpdateCount`, `repaintRectsAsText`) | **only through `window.internals`**, which `WebCoreTestSupport::injectInternalsObject` (`Source/WebCore/testing/js/WebCoreTestSupport.cpp` l.71) installs, called from `Tools/WebKitTestRunner/InjectedBundle/InjectedBundlePage.cpp` l.790: the test runner, not Safari | CONFIRMED (not reachable in Safari or the Simulator's Safari) |
| LayerTree | `Source/JavaScriptCore/inspector/protocol/LayerTree.json` | `Layer` {layerId, nodeId, bounds, **paintCount**, memory, compositedBounds}; `reasonsForCompositingLayer` (28 flags); event `layerTreeDidChange` (no payload) | CONFIRMED |
| `paintCount` | `Source/WebCore/inspector/agents/InspectorLayerTreeAgent.cpp` l.192 = `graphicsLayer()->repaintCount()`; incremented on every drawLayerContents, "always … so that it's accurate even if the count itself is not shown" (`Source/WebCore/platform/graphics/ca/PlatformCALayer.mm` l.1339-1341) | cumulative per layer: a diff between two censuses = repaints in between. `layersForNode` walks composited layers without forcing layout (`InspectorLayerTreeAgent.cpp` l.122-160) | CONFIRMED |
| Animation domain | `Source/JavaScriptCore/inspector/protocol/Animation.json`; `Source/WebCore/inspector/agents/InspectorAnimationAgent.cpp` l.393-494 | `startTracking` → `trackingUpdate` {animationState ready/delayed/active/canceled/done, nodeId, animationName, transitionProperty} for **CSS** animations/transitions only, on state or iteration changes | CONFIRMED |
| CSS / DOM events | `CSS.json` (mediaQueryResultChanged, nodeLayoutFlagsChanged), `DOM.json` (attributeModified, childNodeInserted …) | DOM events only for nodes the frontend has bound; not a restyle counter | CONFIRMED |

So, compared with Chrome (`UpdateLayoutTree.elementCount`, invalidation tracking, `Layout` dirty objects): WebKit
gives **no restyle scope and no layout scope as numbers**. It gives *record counts*, *nesting*, *layout roots*,
*paint rects*, *per-layer repaint counts* and *initiator stacks*.

## 2. Derived counts (what `wkscore.mjs` computes per window)

Window = Timeline records whose start lies between two `performance.mark` TimeStamps (`wk:<k>` … `wk:c:<k>`), so no
clock sync is needed. Durations are used only as a class cut (heavy = ≥ 2 ms, also reported at 1 and 5 ms; the phone's
view-rooted layouts are bimodal 0.1 ms vs 12-18 ms, arch-sim amendment 6); a count that changes with the cut is
"cut-sensitive".

| count | definition | catches |
|---|---|---|
| `rs` | outermost `RecalculateStyles` records | style episodes per window |
| `nestedLayout`, `nest[n/view/heavy]` | `Layout` records under a `RecalculateStyles` (per RS: count, view-rooted, heavy) | container-query interleaved layout (W4/U3), the scene-flip trap |
| `layoutView`, `layoutViewHeavy(10)` | `Layout` whose root quad is at (0,0) and covers the viewport; heavy subset | W1 (transition-end flip → whole-view layout), W2 (boundary escalation), the P14 rotator |
| `paint`, `paintArea` | `Paint` records, sum of clip areas (CSS px²) | P4 (subpixel repaints), P7 (filter repaint), P1 (resize → full repaint) |
| `composite` | `Composite` records | flush count (≈ frames) |
| `schedStyle`, `invalidateLayout` + top initiators | stack top frame "fn file:line" | which JS dirtied style/layout |
| `layers n/+/-/Δpaint` | `LayerTree.layersForNode(document)` census after each window, diffed with the previous | W10 (layer rebuilds), P1, layer churn |
| `animEv` | `Animation.trackingUpdate` events in the window | CSS animation/transition starts/ends (W1's triggers) |
| `mo attr/add`, `subtree` | page-side MutationObserver (de-counts-chrome's `MO_INSTALL`, verbatim) and the summed subtree size under every element whose attribute really changed | engine-neutral; the subtree sum is an upper bound of descendant-invalidation scope (F-093/F-094) |

## 3. WebKit-only costs a count can catch

From claims-audit (status as there) and unknowns-render:

| cost | WebKit-only? | count that shows it | in Chrome counts? |
|---|---|---|---|
| W1 transition-end flip → whole-view Layout (WEAKENED) | yes (Blink's StyleDifference differs) | `layoutViewHeavy` at the flip window; `animEv` done-states in the same window | no: re-keep had equal Chrome counts while the phone lost 12-18 ms layouts |
| W2 layout-boundary escalation (P14 rotator) | partly | `layoutViewHeavy` in idle-top | Chrome's Layout root differs |
| W4/U3 interleaved CQ layout in RS (WEAKENED: only recalcs that visit a container) | yes (Blink has its own CQ path, not as a child of style) | `nestedLayout`, `nest[]` | no |
| W5 window wheel/touch listener → full style rebuild (wheel CONFIRMED) | yes | `rs` heavy + `schedStyle` initiator at the listener add | no |
| P1 layer size change → full repaint (CONFIRMED non-tiled) | WebKit backing-store rule | `layers Δpaint`, `paintArea` | Chrome raster differs |
| P4 subpixel-offset repaint (mechanism CONFIRMED) | yes | `paint` count in morph windows | no |
| P7 filter change repaint (OBSERVED) | likely | `paint`, `paintArea` | partly |
| W10 content-visibility un-skip rebuilds layers (OBSERVED/inference) | yes | `layers +/-` | no |

None of these needs an element count. All of them need WebKit's own engine, which the Simulator has (§4).

## 4. Fidelity: the Simulator's WebKit vs the phone's

(Sources: `research/simulator/README.md` arch-sim, our runs' UA.)
- Simulator runtime iOS 26.5 (23F77), WebKit 8624.2.5.10.4; phone iOS 26.6.1. Two point releases apart. Between
  the nearest public tags (`WebKit-7624.2.5.10.5` vs `WebKit-7624.4.5`, sha256 compared 2026-10-02): the 12 inspector
  files of §1 are identical; of 12 style/layout/compositing files (`StyleInvalidator`, `StyleDifference`,
  `StyleChange`, `StyleAdjuster`, `RenderStyle`, `RenderObject`, `LocalFrameViewLayoutContext`, `RenderLayerBacking`,
  `RenderLayerCompositor`, `GraphicsLayerCA`, `Document`, `StyleTreeResolver`) 10 are identical and the other two
  differ in three hunks that touch no style/layout path (`Document.cpp`: an execCommand name compare, a
  view-transition origin; `StyleTreeResolver.cpp`: Mail's render-tree depth limit). **vendor source**; the exact
  Simulator build has no public tag, so "same engine logic" is CONFIRMED for the nearest tags only.
- **Shared by construction** (same WebCore source compiled for the host): style resolution, invalidation, layout,
  compositing decisions, the inspector. The Simulator's viewport is the phone's (430x775, DPR 3, docH 6035).
- **Not shared:** timing (Mac CPU; ~1.4x slower in style/layout than the A17, faster in JS, FP-1; the morph ~4x
  slower, D4), the GPU/IOSurface path (D5: the Simulator build lacks `HAVE_IOSURFACE_ACCELERATOR` and other device
  features), the display link and its rate (D2, UNRESOLVED), Low Power Mode (D7), the finger cadence (D9), memory
  pressure and the tiling threshold (D11, UNRESOLVED), thermals.
- arch-sim's class verdicts: A/B direction (class 1) and absolute counts (class 2) **not usable**; positions
  (class 3) lead generator only; the layout mechanism (class 4) 11/13 cells agree. This note tests counts again, as
  per-event and per-window structure rather than whole-run totals (whole-run totals scale with frame count, which
  differs: the Simulator renders fewer frames).

## 5. Runs (2026-10-02, Simulator holds in chrome-measure; no ms used anywhere below)

| hold | driver | arms (build JS / CSS sha256[:12]) | runs |
|---|---|---|---|
| n1 (20:23Z) | step walk (`wkcounts.mjs`) | A baseline, B user-bplus | **no data**: the probe's tab pick (wip `pickTab`) threw after the first cross-port navigation, which left the previous page listed; fixed with `simtab.mjs` (pick the one *visible* tab) |
| n2 (20:30Z) | step walk: 8 s settle, 6 s idle at y 0, instant `scrollTo` every 250 px, 700 ms dwell, TLDEPTH 8 | C aw1-10e (3e2f599a1632 / c6aad94b455f), N st4-noswap (b8c085d9b619 / c6aad94b455f) | C1 N2 N3 C4 |
| w1 (20:37Z, `--no-timing`) | the phone's W driver: iphone-runner's `srwin.mjs` (sr2 block: 6 s idle, `scrollBy 250 smooth` every 300 ms to the end, 6 synthetic wheel pushes, 3 s hold, TLDEPTH 10) as `srwin-sim.mjs` | A baseline (4606120cf392 / 27776f3d4138), B user-bplus (dbd5fdb4f1fb / cc8d1340b449) | A1 B2 B3 A4 |
| w2 | W driver | B, B+V1 (851c397012bc), B+V1i (298587e0bb94) | **not run**: parked by the lead 20:41Z (usage budget); resume: w2 |

Phone references (iphone-runner, same counting through `phonecounts.mjs`): `sr-A7/A10/A11`, `sr-B8/B9/B12` (sr2 block,
W driver, 26.6.1) and `p14-C1/C5/C9`, `p14-A2/A6/A7` (= N; P14, idle 6 s at y 0 then W to y 2500).

## 6. Does the Simulator reproduce the phone's layout records?

### 6.1 Event structure at the known crossings (W driver on both; per run: nested Layouts in the RS / of them view-rooted / of them ≥ 2 ms)

| crossing | phone A (A7, A10, A11) | Sim A (A1, A4) | phone B (B8, B9, B12) | Sim B (B2, B3) |
|---|---|---|---|---|
| y≈1840 (#people end) | 2/2/1 ×3 | 2/2/1 ×2 | none ×3 | none ×2 |
| y≈2410-2500 | 1/1/1 at y≈2450 ×3 (A7 2452) | 1/1/1 at y≈2490-2499 ×2 (+ a light 1/1/0 at 2410 in A1) | 1/1/0 at y≈2410 ×3 | 1/1/0 at y≈2412-2431 ×2 |
| **platform switch y≈2620** | 2/2/1 ×3 | 2/2/1, 2/2/2 | 2/2/1 ×3 | 2/2/1 ×2 |
| **hero-track y≈2990** | none ×3 | none ×2 | 1/1/1 ×3 (y 2989-2991) | 1/1/1 ×2 (y 2998-3005) |

**Every event's presence, nested count and root class matches, in both builds** (OBSERVED, n = 2 Sim / 3 phone
runs per arm, in our setup). The "≥ 2 ms" column is a duration class and differs once (A4 2 heavy vs 1): heaviness is
cut-sensitive on the Simulator, the structure is not.

### 6.2 Idle and per-phase counts

| count | phone | Simulator | verdict |
|---|---|---|---|
| P14 idle 6 s, view-rooted Layout ≥ 2 ms (and ≥ 10 ms): C vs N | 15/15/15 vs 0/0/0 | 15, 14 vs 0, 0 (step-walk probe, same idle) | **match** (also in absolute) |
| sr idle 6 s, view-rooted ≥ 2 ms: A vs B | 56/54/63 vs 13/13/13 | 31/31 vs 14/13 | direction matches; **A's absolute count is ~half** on the Sim (cause unknown, OBSERVED) |
| scroll phase, nested Layouts: A / B | 36-37 / 72-73 | 37, 33 / 51, 60 | A matches; B lower (frame-count-coupled: Sim scroll phase has fewer frames) |
| push phase, nested Layouts: A / B | 28-31 / 44-48 | 9, 12 / 24, 24 | lower: per-frame events × fewer Sim frames (37-63 vs 71-94) |
| RS records per phase | A 1424-1506, B 613-627 | A 1135, 1081, B 483, 516 | direction and ratio (A ≈ 2.3x B) match; absolute frame-coupled |

Page-side counts (MO): C adds 48 nodes per 3 s idle, N 3 (the keyed img remount, F-088), the same on every run.

### 6.3 The step walk is not a crossing driver

With the 250 px instant-jump walk (n2), the platform switch's 2-nested RS does **not** appear (0 nested in the
2500→2750 window, all four runs), while the y≈1840 2-nested and the y≈2410 1-nested events do. One jump crosses
several thresholds at once and JS geometry reads lay out before the style flush, so the container is clean when the
RS runs. Positions also differ (the y≈2990 event shows at the 2750→3000 jump in C and N, for which no phone run
reaches 2990). Rule: step-walk windows compare with the phone only for **dwell states** (idle, per-frame repeating
work while parked); **crossings need the phone's own driver** (W, `srwin-sim.mjs`).

### 6.4 Determinism (same build twice)

- Event structure (6.1): identical between the two Sim runs of each arm, except one extra light 1/1/0 event at
  y≈2410 in A1.
- Step walk (n2): per-window `nest[]` lists identical or ±1-3 events in the repeating-region windows (y 3750-5000),
  idle view-heavy counts ±1, layer census `n/+/-` identical in most windows (e.g. 87 layers destroyed at the
  2250→2500 jump in all four runs).
- Frame, RS, paint and composite *totals* vary with Simulator timing (±10-20 %): not usable as counts.

## 7. Recommendations

(resume: after w2; partial verdict in §6)
