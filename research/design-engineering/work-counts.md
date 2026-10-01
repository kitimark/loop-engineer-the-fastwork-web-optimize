# Work counts as a fast metric: the Chrome half (de-counts-chrome)

Design-engineering note by `de-counts-chrome`, 2026-10-02. Sibling note, WebKit/Simulator half: `de-counts-sim`,
[`work-counts-webkit.md`](work-counts-webkit.md) (its branch). The joint recommendation (§8) is written by both.

**The user's question** (2026-10-02): "does the restyle drop from ~345 elements to ~30? ... it'll make our work faster
right?" Phone frame-gap A/Bs cost a 15-30 min block plus 10 min cooling, on one phone. Work counts (restyled elements,
layout objects, invalidations, layers, paints) are cheap, deterministic and can run in parallel. Can they replace
some phone blocks?

Labels as in [`README.md`](README.md): **vendor source** (Chromium `main` at 05fd20e9f678, read 2026-10-02; our
Chrome is 154, so line numbers are for orientation), **vendor doc**, **data** (our runs, file named), **derived**,
**inference**. Platform claims carry CONFIRMED / OBSERVED / UNRESOLVED (CLAUDE.md "Platform claims").

Probe and data: [`work-counts/probe.mjs`](work-counts/probe.mjs) (one page load per build: 430x932 DPR 3 mobile +
touch, CPU 6x unless noted, 3 s idle window at y 0, then an instant `scrollTo` every 250 px with a 700 ms window per
step, one trace + CDP per load), [`work-counts/compare.mjs`](work-counts/compare.mjs), per-run JSON summaries in
[`work-counts/data/`](work-counts/data/). Runs went through the `chrome-measure` lock (short lane, counts only).

## 0. Answer in eight lines

__SUMMARY__

## 1. Inventory: what Chrome can count

Cost = the probe's overhead on top of a plain trace. Noise = run-to-run spread on the same build (§2).

| signal | how to read it | what it counts (source) | status | cost | noise (§2) |
|---|---|---|---|---|---|
| `UpdateLayoutTree` `elementCount` (trace, `blink,devtools.timeline`, end args) | per event; per window sum and max | number of `StyleResolver::ResolveStyle` calls inside that style update, pseudo-elements included: `StyleEngine::StyleForElementCount()` delta between the event's begin and end (`core/dom/document.cc` 2822, 2855-2867; incremented in `IncrementResolvedStyleCounters`, `core/css/resolver/style_resolver.cc` 1393-1395, called at 1473) | CONFIRMED (vendor source) | free with any timeline trace | __N_ULT__ |
| `Layout` `beginData.dirtyObjects` / `totalObjects` / `partialLayout`, `endData.layoutRoots` | per event | objects needing layout and all objects under the layout roots, from `LocalFrameView::CountObjectsNeedingLayout` (`core/frame/local_frame_view.cc` 692-705; `inspector_trace_events.cc` 641); `partialLayout` = subtree roots exist; `layoutRoots` (node, depth, quads) **capped at 10** (`kMaxLayoutRoots`, `inspector_trace_events.cc` 78, 702-705) | CONFIRMED (vendor source) | free | __N_LAY__ |
| `StyleInvalidatorInvalidationTracking` (`disabled-by-default-devtools.timeline.invalidationTracking`) | per event: `reason`, `nodeName`, `selectorPart`, `invalidationList` | one per node the style invalidator marks while applying pending invalidation sets; reasons "Invalidation set invalidates self / subtree / matched class / id / attribute / tagName / part" (`inspector_trace_events.cc` 486-505, 561-575). "invalidates subtree" + `selectorPart` names the rule that widened the scope (the `:where(*)` scene rule shows here, F-093) | CONFIRMED (vendor source) | invalidation tracking on: extra instant events and stack capture; its effect on the counts themselves is §2 | __N_INV__ |
| `StyleRecalcInvalidationTracking` (same category) | per event: `reason`, `subtree`, node | one per `Node::SetNeedsStyleRecalc` mark (`core/dom/node.cc` 1650-1666; data `inspector_trace_events.cc` 600-616), plus node inserts (`node.cc` 370-377). **Not** one per restyled element: a subtree mark restyles many. Reason "Animation" = marks from running animations (OBSERVED reason string) | CONFIRMED (vendor source) | same | __N_RECALC__ |
| `LayoutInvalidationTracking` (same category) | per event: node, reason ("Style changed", ...) | one per layout-dirtying mark (`inspector_layout_invalidation_tracking_event::Data`, `inspector_trace_events.cc` 712) | CONFIRMED that it exists (vendor source); reasons OBSERVED | same | __N_LAYINV__ |
| `Paint` / `PaintImage` (trace) | count per window | paint records of the main frame and image draws inside them. The `Paint` `clip` is unreliable (DevTools' own source, devtools-render-metrics §0.5); counts only | CONFIRMED (vendor source) for the fields; count semantics OBSERVED | free | __N_PAINT__ |
| `PrePaint` (trace) | count per window | main-frame lifecycle updates that reached pre-paint: our **frame count** to normalise animation-driven counts | OBSERVED | free | __N_FRAMES__ |
| `RasterTask` (trace, compositor/raster threads) | count per window | raster tiles; **unthrottled** by CPU emulation, so not a 6x signal (claims-audit §2.6) | OBSERVED | free | __N_RASTER__ |
| `SelectorStats` (`disabled-by-default-blink.debug`) | per style update: per selector elapsed, attempts, matches | selector matching (`element_rule_collector.cc` ~1466, de-style-recalc W6) | CONFIRMED (de-style-recalc) | high (slows style ~x; one-off attribution only) | not measured |
| `Performance.getMetrics` | deltas around a window | `RecalcStyleCount` / `LayoutCount`: one per `probe::RecalculateStyle` / outermost `probe::UpdateLayout` (`core/inspector/inspector_performance_agent.cc` 320-356); durations the same scopes; `Nodes`, `LayoutObjects`, `JSEventListeners`: instance counters (same file 193-197) | CONFIRMED (vendor source) | one CDP call per boundary | __N_PM__ |
| `LayerTree.layerTreeDidChange` | layer list per commit while enabled | cc layers: count, ids (created = new ids), `paintCount` per layer; `layerPainted` never fires on M148+ (protocol v2 §3.7); `paintCount` reliability on Chrome 154 is disputed (F-072) | CONFIRMED (CDP doc, §3.7) / paintCount OBSERVED | a layer list per commit over CDP | __N_LT__ |
| `CSS.trackComputedStyleUpdates` + `takeComputedStyleUpdates` | node ids whose **tracked** computed properties changed | "the list of node Ids that have their tracked computed styles updated"; only for nodes pushed to the front-end by the DOM agent (CSS.pdl 893-907, experimental) | CONFIRMED (CDP pdl) | needs `DOM.getDocument` depth -1 first; not run here | — |
| page-side `MutationObserver` (`attributeOldValue`) | per window: childList adds/removes, attribute writes that changed the value, no-op writes, top keys | what the page's JS changed; engine-neutral, the same JS runs on WebKit (shared with de-counts-sim) | — | one observer; no style or layout reads | __N_MO__ |

What none of these see (OBSERVED here, CONFIRMED for the throttle in claims-audit §2.6): raster and GPU time, the
compositor's presentation, WebKit-only costs (layout nested in RecalculateStyles for container queries, presence
flips F-075, backing-store reallocation, render-server time), touch.

## 2. Determinism

__DETERMINISM__

## 3. Headless equivalence

__HEADLESS__

## 4. CPU throttle

__THROTTLE__

## 5. Predictive value: Chrome count deltas against phone ms deltas

__PREDICT__

## 6. What a count can and can't tell us

__LESSONS__

## 7. Recommendations (Chrome side)

__RECS__

## 8. Joint recommendation (with de-counts-sim)

__JOINT__

## 9. Files

- [`work-counts/probe.mjs`](work-counts/probe.mjs): the probe (research tool; serves each build with
  `tools/serve.mjs --overlay`, launches its own Chrome, headless with `--screen-info={0,0 1512x982
  devicePixelRatio=2}` and the UA override as in ts-headless's design). `--plan <json> --out <dir> [--budget S]`.
- [`work-counts/compare.mjs`](work-counts/compare.mjs): per-metric totals, idle values, windows equal across runs.
- [`work-counts/data/`](work-counts/data/): per-run summaries (no traces, no Fastwork code).
