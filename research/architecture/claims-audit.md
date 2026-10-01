# Platform claims audit (arch-claims, 2026-10-01)

Why: F-059 ("Chrome 154 never sends `LayerTree.layerPainted`") rested on two probes that saw 0 events, and still went
into protocol v2 §3.7/§6.2, a tool design (`verify --paint-rects` falls back to `paintCount`) and a statement to the
user. The user asked whether anyone had checked a reference. CLAUDE.md "Platform claims: confirm against a reference"
(71ad57d) is the rule; this file is the inventory of every platform claim the team relies on, the verification of the
riskiest ones, and the changes to how we work.

Scope: findings board F-001..F-063 and `fixes/FINDINGS.md`; `research/architecture/*.md` (protocol v2, unknowns-*,
oss-rendering-libs, webkit.md, render.md, devtools-methodology, apple-smooth-scroll); `research/design-engineering/*.md`;
`fixes/PREDICTIONS.md`, `fixes/TOPICS.md`; the claims the lead passed to the user (handover/digests). Read-only:
no Chrome, no iPhone, no locks. Verification by three read-only verifiers (sonnet), each plan-then-execute:
`ver-webkit-layout`, `ver-webkit-paint`, `ver-chrome-platform`; F-059 by `res-layerpainted`.

Status words (CLAUDE.md): **OBSERVED** (our data only, in our setup), **CONFIRMED** (a reference agrees; cited),
**REFUTED**, **UNRESOLVED** (references silent; decisive local check named). This audit adds **WEAKENED** as a
verdict (a reference confirms part of the claim and contradicts or fails to support another part) and records,
for a CONFIRMED claim, **which build the reference applies to**: "WebKit `main`" is not "iOS 26.6.1".

Two halves of most claims. Almost every engine claim on this page has a *mechanism* half ("WebKit does X when Y")
and an *attribution* half ("X is what our frame at y≈1250 pays"). A source citation can confirm the first; only an
ablation on the device confirms the second. The table states the mechanism status; the attribution status lives on
the topic's D card.

## 1. Inventory

Columns: **came from** = the probe/tool/version (or reading) that produced the claim; **status** = before this audit
→ after it (§2 for the verified rows); **risk** = decision impact × doubt, each 1-3 (9 = verify first).

### 1.1 WebKit: style, layout, events (iOS 26.6.1 Safari)

| id | claim (wording as used) | source | came from | status before → after | depends on it | risk |
|---|---|---|---|---|---|---|
| W1 | A transition ending at `opacity:1` / `filter:none` / `transform:none` costs a whole-view layout in its end frame (`miscDataChangeRequiresLayout`) | F-049, F-054(b), unknowns-actions K12, postmortem-hero Card 4 | phone Timeline (tlwin, depth 1) e-tc1/tc2/ta1 + WebKit `main` StyleDifference read by de-pm-hero | **WEAKENED** (§2.4): Layout diff CONFIRMED on 26.6; "whole-view" = no boundary above, not the change type | P-019/P-020 (P3 ST-2 ticket), hero re-keep fix, D2 page-wide scan, F-054 | 9 |
| W2 | `isLayoutBoundary`: overflow clip + fixed width and height + new formatting context, or layout + size containment, stops upward marking; `.is-carousel` (104×32) "should" be a subtree root, yet the phone lays out the whole view (W1/W2/W3 candidates); "a fixed width alone is no relayout boundary without an overflow clip" | postmortem-hero §7.3, F-058, K34, F-060 / navw | WebKit `main` RenderObject.cpp read + Timeline root quad | **CONFIRMED** rule on 26.6 (§2.4); "flex item disqualifies" REFUTED; which dirtier escalates: UNRESOLVED (boundary ticket) | P9 (P-026 navw `contain: layout size`), N14 layout-containment, P11/P14, ST-4 A2 `contain:strict` | 9 |
| W3 | "Every layout on this page is a full 12-17 ms one" (**told to the user**) | unknowns-render U2, unknowns-actions K26 + §1 note, protocol v2 l.234, TOPICS N14 | Timeline Layout records > 0.5 ms (tlstat), `root` quad = 430×775 view; 3 captures | **WEAKENED** (§2.4): root = view CONFIRMED for rotator records; "every" and "full" overreach | N14 rationale ("biggest page-wide lever"), every phone cost model's layout term | 9 |
| W4 | Container queries force an interleaved full layout inside RecalculateStyles | F-052, unknowns-render U3 | WebKit `main` StyleTreeResolver/Document read + nested Layout in 3 Timeline frames | **WEAKENED** (§2.4): only recalcs that visit a container; pending layout only if dirty | N14 `lc-cq` probe, P11/P14, K26/K27 | 6 |
| W5 | Adding/removing a wheel/touch listener on window (passive too) → event-region types change → full style rebuild + event-region invalidation on every layer | F-062, F-054(a), unknowns-render §1.3, X1, K13/K22 | phone A/B C/na/nb (104/107 vs 34/35 ms, NAMED) + WebKit `main` Document/StyleAdjuster read | wheel **CONFIRMED** but only on a region-type set change; touch **UNSUPPORTED on 26.6** (compiled out until 7625) (§2.4) | nav-morph F1/F2/F3, P-013, P-022 (P4) | 6 |
| W6 | Arming `wheel`/`touchmove` `passive:false` once on window makes the whole page a synchronous touch region for life | F-055, oss-mechanism-map H6 | WebKit source (event regions per element) + Lenis code; "inference for our page" | **REFUTED for 26.6** (touch regions compiled out); "for life" wrong on 7625+ too (§2.4); observed effect stays OBSERVED | P4 F1 vs F3 choice, K20 | 6 |
| W7 | The logger's rAF `scrollY` read forces a full layout every frame (`updateLayoutIgnorePendingStylesheets`) | F-051, U1, X9, K25 | WebKit `main` LocalDOMWindow read + Timeline "Layout in rAF" | **WEAKENED** (§2.4): lays out only if dirty; cost REFUTED on device by P-023 | A9 caveat (lifted, F-061) | 2 |
| W8 | Safari ≥ 11.3: touchstart/touchmove on window/document/body are passive by default | webkit.md landmarks | bug 184250 | CONFIRMED (bug 184250 + Quirks.cpp 26.6 l.983-1019) | F-055 reading (explicit `passive:false` needed to block) | 1 |
| W9 | Safari 26: keyframes that reference an animated custom property resolve against its base value | FINDINGS P3, webkit.md §1 | hero-exit device observation; no public bug found | OBSERVED (in our setup, cause unknown) | T12 practice (animate real properties); harmless workaround | 2 |
| W10 | WebKit's native `content-visibility:auto` un-skips at a 0 margin and rebuilds every descendant layer on each entry | apple-math l.132, middle W1 | reading (apple-math) | OBSERVED/inference | scroll-engine /10 idle un-skip, F-019 | 4 |
| W11 | `requestIdleCallback` is off by default in Safari through 27.x | webkit.md | vendor doc / MDN "not Baseline" | CONFIRMED (MDN: limited availability) | F-019 setTimeout fallback | 1 |
| W12 | Scroll-driven animations threaded since Safari 26.4; accelerated property list (opacity, transform, filter, backdrop-filter, …) | webkit.md §1, oss-mechanism-map | WebKit blog 26.4 + AcceleratedEffect.cpp | CONFIRMED (vendor doc + source) | T12 hero exit, H-series PoCs | 2 |

### 1.2 WebKit: compositing, paint, frame timing

| id | claim | source | came from | status before → after | depends on it | risk |
|---|---|---|---|---|---|---|
| P1 | A composited layer whose size changes repaints completely every frame (backing store dropped) | F-036, morph-endpage §4, devtools-render-metrics | WebKit `main` RemoteLayerBackingStore read (de-morph) | **CONFIRMED for non-tiled layers** (§2.1); tiled layers revalidate tiles | morph R1 size-stable panel, gh predictions (L1 miss), R2 checks | 6 |
| P2 | WebKit iOS tiles a layer only when one side exceeds 1280 CSS px; below, one backing store | morph-endpage l.84, F-036 | source read (de-morph) | **CONFIRMED** (§2.1), CSS px × page scale; 1024 under low memory | morph raster model (Mpx per frame) | 4 |
| P3 | Repeatedly resized images paint at low quality, then high quality 500 ms after the last resize (ImageQualityController) | F-037 | source read (de-morph) | **CONFIRMED** (§2.1), per-RenderView flag | morph first-frame cost model | 3 |
| P4 | A composited layer whose device-pixel-snapped subpixel offset from its renderer changes gets `setContentsNeedDisplay` (countdown faces repaint as the panel width animates 398→406) | F-057, F-063, safari-render-signals §6 | phone Timeline Paint records + RenderLayerBacking `main` read (de-safari) | mechanism **CONFIRMED** with corrections (§2.1); attribution OBSERVED (P-017) | countdown fix (fix-nav-morph, P-017), gh model | 6 |
| P5 | `linear(<points>)` or `steps()` easing makes a time-based transition/animation/WAAPI main-thread on iOS 26.6.1 (legacy CA path) | F-048, oss-rendering-libs §1.3, oss-mechanism-map | WebKit `main` KeyframeEffect.cpp + commit history (arch-oss-survey) | **CONFIRMED for iOS 26.x** (§2.1, F-065 line fix); not Safari 27 | T10 (landed blur tail uses `linear()`), countdown-ca, morph WAAPI PoCs | 6 (check imminent) |
| P6 | Filter keyframe `none` matches any filter list on the legacy CA path (none→blur(14px) stays CA-eligible) — **contradicts** webkit.md §1 and hero.md l.160 ("never none→blur") | F-053 vs webkit.md §1, hero.md | GraphicsLayer.cpp `main` read vs AcceleratedEffect.cpp read | F-053 **CONFIRMED**; webkit.md §1 **REFUTED** (§2.1) | future-card reveal fix (blur(0px) endpoint), h1 | 6 |
| P7 | WebKit repaints a filtered element's contents on every frame the filter value changes | FINDINGS P4 | phone paint counts (large-area-blur) | OBSERVED | blur fixes (T10), morph filter radii | 3 |
| P8 | A basic-shape clip on a composited layer is a shape-layer mask update, no repaint | apple-smooth-scroll l.85 | inference | OBSERVED/inference | R2 clip build | 3 |
| P9 | Safari rAF / page rendering runs at **60 Hz** on the 120 Hz ProMotion panel (iphone.md, webkit.md bug 173434) vs **frame gaps quantize at 8.33 ms on the phone** (protocol §3.2 title "both devices at 120 Hz", morph-endpage l.371, CLAUDE.md "open") | cpu-throttle iphone.md, webkit.md, protocol §3.2, CLAUDE.md | rAF logger gap histograms; bug 173434 | 60 Hz **CONFIRMED**; "phone at 120 Hz / 8.33 ms grid" **REFUTED** (§2.1, §2.3) | tick metrics k≥5/k≥7, A5, every phone verdict | 6 |
| P10 | WebKit's rAF timestamp is the rendering-update start, not a vsync (75 % of phone gaps ≥34 ms off the 8.33 ms grid) | X6, protocol §3.2 A5, V-U2 | phone gap histogram | **CONFIRMED** (§2.1) | A5 dual-threshold rule | 4 |
| P11 | On iOS the rAF gap = WebContent + GPU-process raster wait + UI apply + tick; render-server time is not on that path; 1 pending commit | protocol L13, safari-render-signals §0/§1 | WebKit `main` source read + inference (de-safari) | **WEAKENED** with P12 (§2.1): gap − frame is not UI apply | device classes at D, Instruments route T10, render-bound gate | 6 |
| P12 | `RenderingFrame` segments: Paint = recording + Composite (incl. allocation and GPU-process raster wait); Other = compositing update, layer creation, event regions, IO (no records); UI apply ≈ gap − frame | protocol §3.1, safari-render-signals §2.1 | `RenderingFrameTimelineRecord.js`, `PageTimelineAgent.cpp` read | **WEAKENED** (§2.1): frame includes the flush wait; gap − frame = tick wait + wake latency + post-flush | every phone segment card at D (A1), morph "inside WebContent" | 6 |
| P13 | WebKit Timeline `Paint data.clip` is the RenderLayer's paint dirty rect; event-region paints emit no record; `layerTreeDidChange` is coalesced | protocol §3.7 | source read | source-cited (main) | phone paint-area metric | 3 |
| P14 | Under memory pressure iOS tiling shrinks coverage to the visible rect; backing-store volatility at 1 s / 200 ms (post-idle Composite) | unknowns-render U6/U7 | inference / source | OBSERVED/inference | K28/K29 (unscheduled) | 2 |
| P15 | iPhone thermal throttling after ~10 min of back-to-back scripted scrolls; cold first run slow | F-028, F-042 | phone runs | OBSERVED (device behaviour; Apple documents thermal states, not this threshold) | §5 sentinel, warm-up run (conservative either way) | 2 |
| P16 | iPhone Timeline timestamps work after `Page.disable` + `Page.enable` on the page target | F-047, protocol §5.5 | iphone-runner probe | OBSERVED (works in use) | attribution runs | 2 |

### 1.3 Chrome / CDP / host

| id | claim | source | came from | status before → after | depends on it | risk |
|---|---|---|---|---|---|---|
| C1 | Chrome 154 never sends `LayerTree.layerPainted`; DidPaint hook "dead since CompositeAfterPaint" | F-059, protocol §3.7/§6.2, I-032 | ts-render-signals probe (2 runs, 0 events) | absence **CONFIRMED** by source for M148+ (Chromium 1bf9d9eb378c, crbug 488803411); stated cause **REFUTED** (§2.2) | `--paint-rects` design, §3.7 | 9 |
| C2 | "`--paint-rects` costs ~20 fps" (provisional on/off A/A: scroll p50 k=1→2) (**told to the user**) | 2824c33, protocol §3.7 | one A/A, host contaminated by the lead's download | **WEAKENED** (§2.6): −17 fps in one host-flagged n=3 A/A, two treatments confounded; mechanism plausible by source | "never in timing runs" rule | 4 |
| C3 | Display on ≈ 63.5-78 fps vs DarkWake 92-94 fps on the plain baseline; display state "explains" the floor and the canary drift (**told to the user**) | research/host-display-state, protocol §6.3 A7, LEAD "Canary drift" | `pmset -g log` back-tag of 27 holds (correlation) | **UNRESOLVED** (§2.6): correlation only; timer-fallback mechanism REFUTED (caps at 60) | A7 rule, canary band 76-78, every cross-hold comparison | 6 |
| C4 | CPU 6x ≈ iPhone 15 Pro Max jank on this page (**told to the user**; CLAUDE.md calibrated setting) | research/cpu-throttle-calibration | 3 cold runs per rate, 2026-09-30 ~19Z (display on), pre-I-002 tools, one rAF logger | **OBSERVED with limits** (§2.6): scripted-scroll jank counts, display on, this page only | every `fix.mjs ab` default, Chrome-measurable device class | 6 |
| C5 | Under 6x Chrome slows only the renderer main thread; raster and GPU stay unthrottled | protocol L6, devtools-render-metrics, FINDINGS P5, render.md Q10 | render.md source read | **CONFIRMED** (§2.6): main-thread spin duty cycle | device class at D, "Chrome is blind to raster" | 4 |
| C6 | The trace `Paint.clip` is "unreliable and often wrong" per DevTools' own source | protocol §3.7 | DevTools frontend source comment | CONFIRMED (cited) | §3.7 paint-area source | 1 |
| C7 | IntersectionObserver cannot see opacity 0 | F-001 | design reasoning | **CONFIRMED for IO v1**; wording WEAKENED (v2 isVisible sees opacity, Chrome only) (§2.6) | countdown `active` prop | 1 |
| C8 | `Page.captureScreenshot` `clip` is in document coordinates | F-002, FINDINGS P14 | blank-strip false passes | **CONFIRMED** by source (§2.6) | every frozen-frame parity check | 2 |
| C9 | Same-value `setAttribute` still queues a mutation record | F-020 | probe with `attributeOldValue` | **CONFIRMED** (spec + Chrome 154) (§2.6) | MO-based counters | 1 |
| C10 | `scrollTo(0,y)` is smoothed by `html{scroll-behavior:smooth}`; drivers pass `behavior:'instant'` | F-021 | MCP rAF driver | **CONFIRMED** (CSSOM View §3.1) (§2.6) | every per-frame driver | 1 |
| C11 | Chrome cv un-skip renders in the next frame; `contentvisibilityautostatechange` is posted after the frame | F-011, F-019 | trace + event order | **CONFIRMED** (a)(b); F-019 geometry reason WEAKENED to our attribute toggle (§2.6) | scroll-engine /10 idle un-skip | 2 |
| C12 | `verify`/`ab` settle the page unthrottled, so load-time costs are invisible | F-025 | reading our tool | **CONFIRMED** (our code; line cite stale) (§2.6) | protocol §6.2 load phase | 1 |
| C13 | LoAF only reports frames ≥ 50 ms | FINDINGS lessons | — | CONFIRMED: LoAF spec §2 "any of the following occurrences whose duration exceeds 50ms" (https://w3c.github.io/long-animation-frames/) | LoAF-based attribution | 1 |
| C14 | Blink already no-ops identical style writes (T3 saves parsing only) | render.md Q3 | source read | source-cited (not re-checked) | T3 expectations in Chrome | 1 |

Not platform claims (left out on purpose): what our bundle does (F-015, F-017, F-031/F-032, F-035, F-041, F-043/F-044,
F-050, F-058's rotator, F-060's box sizing), measurement results (F-006, F-009, F-022), process rules (F-007, F-010,
F-012, F-046), apple.com's own code (F-016, F-017).

### 1.4 Where unverified claims came from

| origin | claims | pattern |
|---|---|---|
| WebKit `main` source read, no history check | W1, W2, W4, W5, W7, P1-P5, P11-P13 | the citation is real, but `main` ≠ iOS 26.6.1, and the read stops at the first function that "returns layout"; propagation (subtree vs full) is inferred |
| phone Web Inspector Timeline (tlwin, depth-1 stacks) | W1, W3, W4, P4, P12 | record fields read as engine facts (`root` quad = "whole view", nested Layout = "full layout") without checking what the record reports |
| a CDP probe with 0 events | C1 | absence of an event read as "never fires", no check of enable order, target, or domain |
| one A/A or a log correlation on a loaded host | C2, C3 | single uncontrolled run, then a protocol rule |
| design reasoning / inference labelled as such, later quoted without the label | W6, W10, P7, P8, P14 | the label ("inference") is dropped when the claim moves into a finding title or a ticket |
| our own calibration | C4 | correct as a calibration, but quoted without its conditions (display state, tools version, logger) |

## 2. Verified results

Version map used throughout (ver-webkit-paint, from webkit.org release posts and Apple release notes): Safari
26.0-26.1 = WebKit 622, 26.2-26.3 = 623, 26.4 = 624.1, 26.5 = 624.2.5, 26.6 = 624.4.5. **iOS 26.6.1 is in the 624
family; `safari-7624-branch` is the closest public branch** (point-release cherry-picks are not visible).
`safari-7625-branch` and `main` are Safari 27 development, not the phone. Raw files:
`https://raw.githubusercontent.com/WebKit/WebKit/<ref>/Source/<path>`; line numbers are `main` unless a branch is
named; read 2026-10-01 (commit hashes not retrievable: unauthenticated GitHub API rate-limited).

### 2.1 WebKit compositing, paint, frame timing (`ver-webkit-paint`)

| id | verdict | what stands, what changes | references |
|---|---|---|---|
| P4 (F-057/F-063) | **CONFIRMED** (mechanism), with 3 corrections; attribution stays OBSERVED (P-017 ablation is the device evidence) | `RenderLayerBacking::updateGeometry` repaints the **whole layer** when the **device-pixel-rounded** sub-pixel offset from its renderer changes: buckets of 1/6 CSS px at DPR 3, not every fractional change, so slow motion repaints only some frames. Second trigger: `GraphicsLayer::setOffsetFromRenderer` when the device-pixel part changes. Runs only inside `updateGeometry` (geometry dirtied by layout), not for pure transform animation; no `will-change` exemption; the remainder is relative to the compositing-ancestor chain | RenderLayerBacking.cpp l.1440-1445, 1464-1466, 1737-1746, 1904, setContentsNeedDisplay l.4254-4300 (7624: l.1356, 1761, ~3700-3740); GraphicsLayer.cpp l.608-618; GraphicsLayerCA.cpp l.1022-1054; RenderLayerBacking.h l.491 |
| P1 (F-036) | **CONFIRMED for non-tiled layers**; WEAKENED as a general rule | any change of bounds size, scale, opaque flag or format discards the backing store and repaints the whole layer; **tiled layers only revalidate tiles**. Layers ≤ 64×64 px always repaint fully | PlatformCALayerRemote.mm l.360-382, 623-635; RemoteLayerBackingStore.mm l.139-152, 240-243, 293-307 (same in 7620-7625); TileController.cpp l.114-119 |
| P2 (1280) | **CONFIRMED**, unit clarified | iOS `cMaxPixelDimension = 1280` (1024 when `systemMemoryLevel() < 35`), compared against layer size in CSS px × page scale, either side | GraphicsLayerCA.cpp l.98-106, `requiresTiledLayer` l.4891-4904 (7624 l.98-105, 4852) |
| P3 (F-037) | **CONFIRMED**, tightened | 500 ms; a different paint size while the timer runs → low quality. The "resize active" flag is **per RenderView**: any scaled image painted meanwhile is low quality too. First paint of an image is high quality. Layout-size changes only (a transform scale is not covered) | ImageQualityController.cpp l.46, 136-223, 83-101 (same in 7620-7625) |
| P9 (60 vs 120 Hz) | **REFUTED**: protocol §3.2 "both devices at 120 Hz" / "phone gaps quantize at 8.33 ms". **CONFIRMED**: Safari rAF runs at 60 Hz by default | pref `PreferPageRenderingUpdatesNear60FPSEnabled` stable, default true (all but visionOS); `framesPerSecondNearestFullSpeed(120)` = 60; iOS display link 60 fps. Low Power Mode → 30 Hz; plain thermal mitigation does not change it. Ticks stay a unit on the phone, not a grid. CLAUDE.md corrected by the lead (0ceacbe) | UnifiedWebPreferences.yaml main l.4810-4818 (7624 ~l.6395-6401); AnimationFrameRate.cpp l.33-66; Page.cpp l.2925-2968, 553-558; RemoteLayerTreeDrawingAreaProxyIOS.mm (7624 l.43, 170); https://bugs.webkit.org/show_bug.cgi?id=173434 c67-77 |
| P10 (rAF stamp) | **CONFIRMED** | the rAF timestamp is `frozenNowTimestamp()`, frozen at the start of `Page::updateRendering` in WebContent after the display-link IPC and a run-loop turn, at 1 ms resolution: not vsync | Document.cpp l.8959-8964; Page.cpp l.2424-2428; Performance.cpp l.73, 174-176 |
| P12 (RenderingFrame) | **WEAKENED** | the record starts at **any** main-run-loop wake and ends after the commit's backing-store flush completes, so it includes the GPU-process flush wait; `gap − RenderingFrame` = wait for the next tick + wake latency + post-flush time, **not "UI apply"** and not purely "outside WebContent". Protocol §3.1/L13 wording sent to doc-protocol-v2 (lead GO) | PageTimelineAgent.cpp l.118-135, 361-376 (7624 l.118-131, 299-313); RemoteLayerTreeDrawingArea.mm l.431-440; InspectorTimelineAgent.cpp l.661-662 |
| P5 (F-048) | **CONFIRMED for iOS 26.x** incl. `steps()`; cited lines were wrong (fixed as F-065 by arch-oss-survey); **will not hold on Safari 27** | `canBeAccelerated` excludes steps (l.2016) and linear-with-points (l.2019) on the legacy CA path because `toCAMediaTimingFunction` builds only cubic-bezier or identity linear; `ThreadedTimeBasedAnimationsEnabled` is unstable/false in 7624 (stable/true on main). P-021 ca-check confirms on the device | KeyframeEffect.cpp l.1973-2032 (7624 l.1959, 1962); PlatformCAAnimationCocoa.mm l.130-151; UnifiedWebPreferences.yaml 7624 l.8339-8352, main l.6246-6255 |
| P6 (filter `none`) | **F-053 CONFIRMED; webkit.md §1 / hero.md "never none→blur()" REFUTED** on both paths | legacy: empty filter lists match anything, the missing side is filled with a default op; threaded: `canInterpolate` accepts an empty list. What really falls back: function order mismatch between non-empty lists, drop-shadow not last. Reason to prefer `none` at rest: a resting `blur(0px)` keeps the element composited | GraphicsLayer.cpp l.807-838; GraphicsLayerCA.cpp l.4294-4328 (7624 l.4252); AcceleratedEffect.cpp l.503-565; FilterOperations.cpp l.94-115 |

### 2.2 Chrome 154 `layerPainted` (C1, `res-layerpainted`; landed on main as 93a81a1)

**The observation was right; its explanation was wrong.** `LayerTree.layerPainted` is unavailable from Chrome M148
on: CONFIRMED by source (Chromium 1bf9d9eb378c "[HiC] Allow cc::Layer update rect mutation during paint callback",
crbug 488803411), empirical check (Chrome 154 vs 143) pending with ts-render-signals. The protocol's cause, "the
DidPaint hook dead since CompositeAfterPaint", is REFUTED. `paintCount` deltas stay the paint source. This is the
pattern the audit is about: an absence seen by a probe was promoted to a fact with an invented cause.

### 2.3 Phone thresholds at 60 Hz (lead's follow-up to P9)

At 60 Hz the phone's frames sit at multiples of 16.67 ms (1, 2, 3, 4 vsyncs = 16.7, 33.3, **50.0**, 66.7 ms), with
non-vsync 1 ms timestamps and wake jitter (P10), and further off-grid when the main thread is busy (75 % of gaps
≥ 34 ms are off the 8.33 ms grid, V-U2). Today's phone thresholds were built for Chrome's 120 Hz grid:

| threshold | where it cuts on the 60 Hz grid | problem |
|---|---|---|
| dt > 34 (legacy) | 0.7 ms above the 2-vsync mode (33.3) | jitter pushes ordinary 2-vsync frames over it |
| k ≥ 5 (dt ≥ 37.5) | between 2 (33.3) and 3 vsyncs (50.0), 4.2 ms above 33.3 | fine, but not centred |
| dt > 50 (legacy, the user's goal wording) | **on** the 3-vsync mode (50.0 ± ~1) | a coin toss for every 3-vsync frame: systematic disagreement with k≥7 (the lead's point) |
| k ≥ 7 (dt ≥ 54.17) | 4.2 ms above the 3-vsync mode | counts ≥ 4-vsync frames only |
| A5 flag band ±4 ms around 34 / 37.5 / 50 / 54.17 | contains the 2-vsync mode (33.3) and the 3-vsync mode (50.0) | flags fire on the most common frames, so a flag says nothing |

**Proposal (for the lead).** On the phone, classify a frame by vsyncs, v = dt / 16.667, with cuts at the **midpoints**
between vsync modes:
- **v ≥ 3 ⇔ dt ≥ 41.67 ms** (2.5 × 16.67; = 5 ticks exactly): "≥ 2 refreshes missed". Replaces ">34" on the phone.
- **v ≥ 4 ⇔ dt ≥ 58.33 ms** (3.5 × 16.67; = 7 ticks exactly): "more than 50 ms" without the coin toss.
- **Goal metric on the phone: v ≥ 3 count = 0** (the lead's lean). Reason: a 3-vsync frame is a visible 2-frame hitch,
  "50.0 ms" is not distinguishable from "50.5 ms" with 1 ms stamps and wake jitter, and the stricter form is the one a
  fix can't game by shaving 1 ms. Report v ≥ 4 and the legacy dt > 50 next to it for one wave (continuity with
  earlier verdicts); a verdict that differs between v ≥ 3 and v ≥ 4 says so ("3-vsync frames only").
- **Flag band:** ±4 ms around 41.67 and 58.33 = [37.7, 45.7] and [54.3, 62.3]. Both stay ≥ 4.3 ms away from every
  vsync mode, so a flagged frame is a genuinely off-grid one (busy main thread), which is what the flag should mean.
- **Chrome is unchanged** (120 Hz, vsync-aligned BeginFrame stamps): k ≥ 5 / k ≥ 7 at the tick midpoints stay right.
  Note the same 50.0 ms coincidence exists there (6 ticks = 50.0 ms) for the legacy dt > 50 column.
- Low Power Mode halves rAF to 30 Hz (P9): the phone's per-run record should note it (K9 settings), or every gap
  doubles.
- Decisive check (cheap, phone, one line): a 10 s idle rAF loop, dt histogram; expect modes at 16.7 / 33.3 ms and
  none at 8.3. Existing phone logs can be re-binned offline first (no phone time): if the 3-vsync mode is tight
  around 50 ± 1-2 ms, the proposal holds as written.

**Offline re-bin, 2026-10-01: the proposal's premise FAILS; superseded by the revision below.** The lead
adopted the proposal provisionally on one check: existing phone logs show a 3-vsync peak tight at 50 ± 1-2 ms and
no mass of frames in the new flag bands. Data: 183 iphone-runner logs (ctl, e, goal, hero, md, morphlog, finger, ys,
f6), 198 349 rAF gaps. The logger stores the rAF **timestamp argument** (`tools/iphone.mjs` l.60, l.153: `t - last`),
which WebKit delivers at 1 ms resolution. Script: scratchpad `arch-claims/rebin.mjs` (read-only).
- **No grid above one vsync.** From 25 to 75 ms the per-ms histogram falls smoothly. It has no peak at 33 or 50 ms,
  and 25 ms (1.5 vsyncs) is the fullest bucket. Of the frames in the 3-vsync class [41.67, 58.33), 29.9 % lie in
  50 ± 2 ms; an even spread over that 16.7 ms class would put 24 % there. Of the 2-vsync class [25, 41.67), 17.6 % lie
  in 33.3 ± 2 ms, below an even spread. The only bump is weak: finger runs, 50 ms = 70 frames against 44-54 at 46-53.
  Every subset (ctl, md, morphlog, hero, ys, goal) looks the same.
- **Catch-up pairs.** 2.5 % of gaps are < 12 ms (4 954): a late update start is followed by an early one. This fits
  P10 (the stamp marks when the rendering update starts, not a vsync).
- **The new flag bands are not empty.** [37.7, 45.7] holds 2 332 frames and [54.3, 62.3] holds 658, against 5 895 and
  1 861 in the old bands. With a continuous distribution, any ±4 ms band holds about half of the frames in its
  16.7 ms neighbourhood. No band placement can make a per-frame flag mean "off-grid".
- Counts, all logs: v≥3 (≥ 41.67) 5 118 · dt > 50: 3 258 · k≥7 (≥ 54.17) 2 694 · v≥4 (≥ 58.33) 2 309 · dt > 34: 7 923 ·
  k≥5: 6 502. Between dt > 50 and k≥7 sit 564 frames (17 % of the > 50 frames). They are an ordinary 4 ms slice of a
  continuous tail, not a pile-up at 50.0.

So the rAF gaps measured on the phone are **not** quantized at 16.67 ms, and the vsync-class argument does not
apply to them. The display's own frames are vsync-quantized, but the rAF stamp cannot tell how many vsyncs a frame
was shown for: that would need a display-side signal (Instruments Animation Hitches, protocol §2.3 render-bound
class). Status of "phone gaps cluster at 16.7/33.3/50.0" (written into protocol L7 today, fa04fa2): **REFUTED by
our data** above one vsync. Only "≈ 16.7 ms when on time" holds.

**Revised proposal (replaces the v≥3 / v≥4 classes on the phone). ADOPTED by the lead 2026-10-01; CLAUDE.md
"Frame thresholds" 668b612; protocol §3.2 A5 by doc-protocol-v2:**
- **Goal metric on the phone: the user's literal goal, dt > 50 ms on the rAF stamp, target 0.** With no grid, the cut
  at 50 is no coin toss, and the metric says exactly what the user asked for.
- **Secondary count: dt > 34 ms**, the legacy cut, kept for continuity. It claims no vsync meaning.
- **No k forms on the phone.** k≥5 and k≥7 snap to nothing there; on a continuous tail k≥7 only raises the bar by 4 ms
  and drops 17 % of the > 50 frames. Chrome keeps k≥5/k≥7: its BeginFrame stamps are vsync-aligned.
- **A5 on the phone becomes a sensitivity test, not a per-frame flag.** Also report the counts at the threshold
  ± 4 ms (dt > 46 and dt > 54; dt > 30 and dt > 38). A verdict that differs between the −4 and +4 counts is
  "threshold-sensitive". This keeps A5's intent (do not trust a verdict that rides a cut) without a grid assumption.
- Keep "record Low Power Mode" (rAF halves to 30 Hz, P9).
- No rescoring of past phone verdicts is needed: they already report dt > 50 / dt > 34. Only verdicts that rested on
  the k forms alone should add the ms counts.

### 2.4 WebKit style, layout, events (`ver-webkit-layout`)

Source read through the jsDelivr mirror `https://cdn.jsdelivr.net/gh/WebKit/WebKit@<ref>/<path>`; device proxy =
tag `WebKit-7624.4.5` (Safari 26.6 = 20624.4.5; the mapping to iOS 26.6.1 is inference, see K-version below).
Lines "26.6 / main".

| id | verdict | what stands, what changes | references |
|---|---|---|---|
| W1 (F-049) | **WEAKENED**: mechanism CONFIRMED, "whole-view" REFUTED as a property of the change | a flip of `hasTransform()`, `opacity.isOpaque()` or `hasFilters()` is `DifferenceResult::Layout` ("full" = this renderer needs normal layout). It dirties up the containing-block chain **to the first layout boundary**; the view is the root only because nothing above the hero is a boundary. Only the start (1→<1) and end (<1→1) frames cross; accelerated-only effects don't tick main-thread style between. **Blink does not pay for the opacity flip** (only a stacking-context change), so Chrome A/Bs can't predict it | StyleDifference.cpp `miscDataChangeRequiresLayout` 26.6 l.192-209 / main l.206-224; RenderElement.cpp main l.1160, 1396-1400; RenderObject.cpp `markContainingBlocksForLayout` main l.596-670; KeyframeEffect.cpp 26.6 l.2679; Blink computed_style.cc l.772-786, 863-865 |
| W2 (isLayoutBoundary) | **(b) CONFIRMED**; (a) hypothesis "flex item disqualifies" **REFUTED**; "second dirtier" hypothesis supported by code; "preferred-width climb" has no mechanism found | rule: RenderView; text control; **`contain: layout size` (or `strict`) with no overflow needed**; SVG root; else needs non-visible overflow + fixed width/height (width % allowed) + not a table part + a new formatting context (added in Safari 26.0; flex passes). `.is-carousel` IS a boundary on 26.6. The test applies to the dirtied object's **ancestors only**. A subtree layout becomes a view layout when a full layout is already pending or a second disjoint subtree root is scheduled ("Two disjoint subtrees need layout... issue a full layout instead"): one other dirtier in the task is enough. Our "no competing InvalidateLayout" is weak evidence: the record fires only when the object was clean | RenderObject.cpp `isLayoutBoundary` 26.6 l.523-563 / main l.519-561 (same conditions back to 7613.3.9); LocalFrameViewLayoutContext.cpp `scheduleSubtreeLayout` main l.769-820, 26.6 l.583-584; RenderObjectInlines.h l.89-95; StyleContainmentCheckerInlines.h l.44-92, 170-183 |
| W3 (U2/K26, told to the user) | **WEAKENED** | the record's `root` is the first absolute quad of the layout root (view quad for a view layout, the subtree root's box otherwise); 26.6 has no node id. "Every layout" is contradicted by our own postmortem §7.3 (398×52 subtree roots). The 12-17 ms bracket includes pending style recalc, layout of the **dirty chain only**, view-size adjust and post-layout region/scroll updates: it proves the root, not that the whole document was laid out. Supportable wording: "every rotator Layout record has the view as its root and lasts 12-17 ms including style and post-layout work" | LocalFrameViewLayoutContext.cpp `performLayout` 26.6 l.225-310 (l.275 `absoluteQuads`); PageTimelineAgent.cpp 26.6 l.180-211; LocalFrameView.cpp main l.1324-1353 |
| W4 (F-052) | **WEAKENED** | a style recalc that **visits** a size/inline-size container sets `needsInterleavedLayout`; `resolveStyle` loops: render-tree update, the ordinary pending layout **only if something is dirty**, another resolve pass. Not every recalc, not a full layout | StyleTreeResolver.cpp 26.6 l.1397-1416, 1450-1458; Document.cpp `resolveStyle` 26.6 l.2923-2935 |
| W5/W6 (F-062, F-055, F-054(a)) | wheel path **CONFIRMED** but narrowed; **touch part UNSUPPORTED on 26.6** (stays OBSERVED, mechanism unknown) | window wheel add/remove → `invalidateEventListenerRegions` → full style rebuild **only when the set of region types changes** (first wheel listener, first non-passive one, removal of the last); otherwise only the root element's style. `ENABLE_TOUCH_EVENT_REGIONS` is 0 on iOS through 7624.4.5 (1 from 7625 / Safari 27), so on the phone a touch listener costs no style rebuild and makes no synchronous touch region by this path. "For life" is wrong even where it exists (removal recomputes) | LocalDOMWindow.cpp 26.6 l.2063-2075, 2330-2342; Document.cpp 26.6 l.6556-6571; StyleAdjuster.cpp l.319-352; PlatformEnable.h 26.6 l.656-658; PlatformEnableCocoa.h main l.919-920 |
| W8 (default passive) | **CONFIRMED** | unspecified `passive` on window/document/documentElement/body touchstart/touchmove/wheel → passive | Quirks.cpp 26.6 l.983-1019; EventTarget.cpp l.100-104 |
| W7 (F-051) | **WEAKENED** | `scrollY` at 0 returns without layout; otherwise `updateLayoutIgnorePendingStylesheets()`, which lays out **only if style or layout is dirty**. Consistent with P-023 (neutral on the phone): a read costs only after a layout-dirtying write in the same frame | LocalDOMWindow.cpp 26.6 l.1467-1481; Document.cpp `updateLayout` main l.3076-3195 |

**K-version (open).** All "26.6" verdicts read tag 7624.4.5. The phone's exact WebKit build (iOS 26.6.1) is
unknown; mgmt-ops-5 can read it from the phone's user agent / `navigator` at the next ticket. A verdict whose code
differs between 7624 and 7625 (F-048, touch regions) is the one that would move.

**Decisive local checks (all phone Timeline, one ticket each, via mgmt-ops-5):**
1. *Boundary ticket (W1 + W2 + W3):* the hero exit transition and one rotator tick, with the accent timer frozen,
   on the baseline and on an overlay with `contain: layout size` on the transitioning element's container.
   Prediction: Layout records at the start and end frames only; root quad = the boundary box, durations drop.
   If the rotator's root becomes the carousel with the accent frozen, the second dirtier (W3) was the cause.
2. *Container ticket (W4):* `container-type: normal` overlay vs baseline; count Layout records nested in
   RecalculateStyles (Blink differs, Chrome can't decide).
3. *Listener ticket (W5/W6):* a second window wheel listener vs the first; the F-055 touch arm repeated to see
   whether any style or region cost exists at all on 26.6.

### 2.6 Chrome, specs, host (`ver-chrome-platform`)

Chrome reference = tag 154.0.8037.100 (`https://chromium.googlesource.com/chromium/src/+/refs/tags/154.0.8037.100/<path>`);
CDP = devtools-protocol `json/browser_protocol.json` (2026-10-01). Local copies of every source read:
scratchpad `arch-claims/ver-chrome-platform/src/`.

| id | verdict | what stands, what changes | references |
|---|---|---|---|
| C2 `--paint-rects` "~20 fps" (**told to the user**) | **WEAKENED** | the only evidence is one host-flagged A/A, n=3 per side at 6x: scroll 80.8 → 63.4 fps (**−17**, not ~20), tick median 1 → 2. The tool adds two treatments, `LayerTree.enable` and a per-frame `Runtime.addBinding` rAF recorder, and the A/A can't split them. Mechanism plausible by source: `layerTreeDidChange` sends the whole layer list, built synchronously on the main thread on every BeginMainFrame that updates layers. That is tens of KB per frame (estimate), and 6x multiplies it. User wording: "about 17 fps in one host-flagged n=3 A/A; mechanism plausible; attribution runs only" | inspector_layer_tree_agent.cc l.175-340; web_frame_widget_impl.cc ~l.3226-3235; layer_tree_host.cc l.958-971; tools/verify.mjs l.415-425, 489-510 (ae56738a worktree) |
| C3 display on 76-78 vs DarkWake 92-94 (**told to the user**) | **UNRESOLVED** (correlation); the obvious mechanism is **REFUTED** | the timer fallback `ExternalBeginFrameSourceMac` → `DelayBasedTimeSource` at 1/60 s (`kUseDisplayRefreshRateForTimer` disabled) would cap rAF at 60, so it can't produce 92-94. No source or doc says what CA/CVDisplayLink does in DarkWake. Confounds: all DarkWake holds fall in one 2-h window and one tools build; thermal not logged. Only holds #17-18 vs #25-26 isolate display state with the same tools | root_compositor_frame_sink_impl.cc l.219-228; external_begin_frame_source_mac.cc l.146-185, 520-534; viz/common/features.cc l.208; begin_frame_args.h l.174-176 |
| C4 CPU 6x ≈ iPhone 15 Pro Max (**told to the user**) | **OBSERVED, with limits**; scope narrowed | wording: "6x reproduces scripted-scroll jank counts on this page, in our setup", never "6x = iPhone speed". Calibration: display on, 3 runs × 3 rates, pre-I-002 tools, scripted scroll only. It can't represent raster/GPU/compositor costs, WebKit-only amplifiers (custom-property recalc, UI-process commit, 60 Hz), load (throttle starts after settle, C12) or the finger case. DarkWake holds run ~20 % faster at 6x, so the equivalence holds for display-on holds only | as C5; research/cpu-throttle-calibration |
| C5 6x = main thread only | **CONFIRMED** | `ThreadCPUThrottler` signals the Blink main thread every ~200 µs with SIGUSR2; the handler busy-waits `run_duration×(rate−1)`. A duty-cycle spin, not a clock change. Compositor, raster, GPU and workers are not slowed. Inference: it may add idle wake latency | inspector_emulation_agent.cc l.594-599; thread_cpu_throttler.cc l.76-86, 117-175, 215-225 |
| C7 F-001 IO can't see opacity 0 | **CONFIRMED for v1**; wording WEAKENED | IO v2 `isVisible` / `trackVisibility` does see opacity (Chrome 74+, ≥ 100 ms delay; not Safari/Firefox). The explicit-prop technique stands | https://w3c.github.io/IntersectionObserver/ §3.2, §3.2.8; MDN BCD |
| C8 F-002 screenshot clip in document coords | **CONFIRMED** by source (CDP docs silent) | `viewport_offset = (clip.x, clip.y)`; the emulator translates by −position + scroll, so scroll cancels | page_handler.cc l.1496-1498; dev_tools_emulator.cc l.553-575 |
| C9 F-020 same-value setAttribute queues a record | **CONFIRMED** (spec + Chrome 154) | only style invalidation checks old ≠ new; `attributeOldValue` is the right filter. WebKit not checked | https://dom.spec.whatwg.org/ "handle attribute changes"; element.cc l.13767-13772, 12039-12048 |
| C10 F-021 smooth scrollTo | **CONFIRMED** | `behavior:'instant'` always instant; a per-frame smooth scrollTo aborts the previous one ("0 scroll events") | https://drafts.csswg.org/cssom-view/ §3.1; page CSS 2.gBuqKVzi.css l.11738-11740 |
| C11 cv un-skip next frame / event after the frame (F-011, F-019) | (a)(b) **CONFIRMED**; F-019's geometry reason **WEAKENED** | 150 % viewport-margin IO; lock change queued to the next lifecycle (the first-ever notification is synchronous); the event is posted as a task, only on a state change. The re-skip geometry jump comes from **our** attribute toggle clearing the remembered size (`contain-intrinsic-size: auto` only under `deferred`), not from cv itself; the one-way deferral stays sound | display_lock_document_state.h l.190, .cc l.112-185; display_lock_context.cc l.313, 515-543, 601; css-contain-2 §4.4; element.cc ~l.6053-6075 |
| C12 F-025 settle unthrottled | **CONFIRMED** (our code) | throttle set after `gotoAndSettle` + 1.5 s (verify.mjs l.348-361, reset l.411; bench-scenario.mjs l.183/209). F-025's line cite (250-262) is stale | tools/verify.mjs |

**Decisive checks (owners, one lock hold each):**
- C2: interleaved A B C D D C B A (none / binding+rAF / LayerTree only / both), ≥ 3 each, quiet host, display state fixed.
- C3 = U1(b): plain baseline `verify --runs 3 --idle 6` before and after `pmset displaysleepnow` in one hold. Add a viz trace that counts `OnDisplayLinkCallback` vs `OnTimerTick` per second in each state.

### 2.7 Phone rAF above 60 Hz in finger scrolls (F-071, `ver-rafrate`)

**Observation (F-071, our data).** In finger scrolls, moving frames come in sustained runs of 12-13 ms gaps (≈ 80 Hz),
for example 13,12,14,11,13,12,13,13. On apple.com (F6-try2) 563 of 1027 moving gaps fall in 12-13 ms; in fastwork
finger runs the share is smaller (E1: 43 of 352, A1: 30 of 816). Idle and scripted runs (S, W, M) show only
16-17 ms. No run shows an ~8 ms (120 Hz) cadence. Script: scratchpad `arch-claims/f6.mjs`.

**Verdict: "Safari rAF at 60 Hz" is WEAKENED.** WebKit asks for 60 Hz but does not enforce it. Source is tag
WebKit-7624.4.5; main is the same on these points.
- **WebKit only requests 60 Hz.** By default the iOS display link sets only `preferredFramesPerSecond = 60`, a hint,
  with no frame-rate range (RemoteLayerTreeDrawingAreaProxyIOS.mm l.167-177, 206-227).
- **Every tick drives an update.** `DisplayUpdate::relevantForUpdateFrequency` gives a rate factor of 1, so no tick is
  dropped (DisplayUpdate.cpp l.33-41). Each tick goes to the web process as DisplayDidRefresh
  (RemoteLayerTreeDrawingAreaProxy.mm l.799). `RemoteLayerTreeDrawingArea::scheduleRenderingUpdate` (l.560-580) has
  no 16.7 ms gate. So the rAF cadence equals the display-link cadence.
- **Core Animation picks the link rate. CONFIRMED by Apple's documentation**
  (https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays):
  - "Core Animation arbitrates … and determines the refresh rate".
  - Callbacks are not guaranteed "at the rate requested".
  - "80Hz (12ms)" is listed as an iPhone rate.
- **Candidate driver (plausible, unproven).** WebKit sets `preferredFrameRateRange` to (80, 120, 120) on every
  accelerated CA animation it creates (PlatformCAAnimationRemote.mm l.609-613). A page with composited animations
  therefore asks the system for 80-120 Hz. That could explain why apple.com's share is larger. Which request raises the
  rate during a finger scroll is UNRESOLVED.
- **Ruled out in the files read:**
  - No site quirk or opt-in exists (Quirks.cpp; REFUTED).
  - No touch- or scroll-triggered rate request exists, except for keyboard scrolling (REFUTED; the scan was not
    exhaustive).
  - Bug 272165 (fixed in 278949@main) applies only with the preference off.
- **Decisive phone check (ticket via mgmt-ops-5).** Run a finger scroll on three pages and log the rAF gap histogram
  for each: (i) no animations; (ii) one infinite composited transform animation; (iii) the same animation paused or on
  `left`. Add idle runs with (ii), a gesture-driven (WDA, G) scroll vs a finger (F) scroll, and Low Power Mode on/off.
  Record the "Prefer Page Rendering Updates near 60fps" feature flag on every run.
- **How our probe could mislead.** The stamp marks the start of the rendering update, not a vsync. A finger scroll also
  changes load and scrolling-tree traffic, so "touch" is not yet separable from "animation mix".

**Already in force (lead):** fps and frame counts from finger (F) and gesture (G) runs don't compare with scripted runs
(S, W, M). The ms thresholds still compare.

### 2.8 Layout at a transition end on the hero card (fix-hero-exit, de-pm-hero; arch-claims)

**Claim (OBSERVED, iPhone P3 block, n=2 per arm).** On the #people card, three moments are each followed by one
whole-view Layout of 12-18 ms:
- the end of the opacity transition (+700);
- the end of the filter/transform transition (+900);
- the `is-future-shrinking` write, which changes `transform` from `none` to `scale(1)` (+1150).

Two device ablations move or remove these Layouts:
- re-dur shifts the +700 Layout by -199 ms.
- re-keep, where the card rests at `blur(0px)` / `translateY(0)`, removes the +900 and +1150 Layouts.

The question for re-keep-op (re-keep plus a resting opacity of 0.999): what in WebKit causes the Layout, and does
re-keep-op avoid it?

All line numbers are from tag WebKit-7624.4.5 (≈ Safari 26.6). StyleDifference.cpp is the same on main (§2.4). The
other files were read at 7624.4.5 only.

**Q1. Why the end value needs a Layout: CONFIRMED.** The style diff returns Layout when a property's presence flips:
- `miscDataChangeRequiresLayout` (StyleDifference.cpp l.191-209) returns Layout when any of these flips:
  `transform->hasTransform()`, `opacity.isOpaque()` or `hasFilters()`.
- `hasTransform()` means "not `none`" (style/computed/data/StyleTransformData.h l.50). So `translateY(0)` and
  `scale(1)` count as transforms, and `none` → `scale(1)` is a flip.
- The opacity branch carries a FIXME. A full layout is needed "to keep floating object lists sane" "when layers
  come and go".

The diff does not check whether a RenderLayer really appears or goes. It fires on the flip alone, even when the
renderer keeps its layer for another reason. Examples are `position: relative`, z-index and overflow
(RenderBoxModelObject::requiresLayer l.1027-1030; RenderBox::requiresLayer l.5199-5205).

When a layer really is gained or lost, it adds Layout through two separate paths:
- `RenderElement::adjustStyleDifference` (RenderElement.cpp l.348-355): `hasLayer() != requiresLayer()` gives Layout.
- `RenderLayerModelObject::styleDidChange` (l.157-184) creates or removes the layer. When the element was
  transformed, it also calls `setNeedsLayoutAndPreferredWidthsUpdate()`.

A Layout diff reaches `setNeedsLayoutForStyleDifference` (RenderElement.cpp l.1106, l.1270-1273), which calls
`setNeedsLayoutAndPreferredWidthsUpdate()`.

Without a flip, `translateY(0)` → `scale(1)` is only a context-sensitive Transform change
(StyleDifference.cpp l.194-197). `adjustStyleDifference` (RenderElement.cpp l.302-316) then makes it:
- RecompositeLayer if the layer is composited;
- Overflow (simplified layout) if the layer is not composited;
- Layout only if the renderer has no layer.

This matches re-keep's phone result: no Layout of 2 ms or more at +900 and +1150.

**Q2. Accelerated end vs main-thread end: same diff, different route. CONFIRMED.**
- **Accelerated (opacity, transform with cubic-bezier).**
  - While the effect runs fully accelerated, it does not re-resolve style every frame (`ticksContinuouslyWhileActive`
    returns false, KeyframeEffect.cpp l.2668-2687).
  - At the end, the Stop action calls `renderer->animationFinished` and then
    `m_target->invalidateStyleAndLayerComposition()` (l.2429-2434).
  - The next style resolution applies the remaining effects to the base style (StyleTreeResolver.cpp l.850-879,
    `applyKeyframeEffects`). The new style holds the end value 1 / `none`, and it is diffed against the last style,
    which still held an animated value below 1 or not `none`.
- **Main thread (the filter, `linear()` easing, F-048/F-065).**
  - The filter is re-resolved every frame. `hasFilters()` stays true across `blur(Npx)`, so each frame is only a
    Filter context-sensitive change: RepaintLayer or RecompositeLayer (RenderElement.cpp l.337-343).
  - The final `blur(…)` → `none` is the flip, so the Layout comes in the end frame only.
- **What the end itself does to compositing.** The animation's compositing reason goes away when the effect no longer
  affects the property (`requiresCompositingForAnimation`, RenderLayerCompositor.cpp l.3813-3840). That GraphicsLayer
  teardown is a compositing update and repaint, not a Layout.
- **Answer to the lead's question.** The Layout does not come from "a finished transition" or from GraphicsLayer
  teardown. It comes from the end value flipping presence, so re-keep-op's premise holds:
  - At a resting opacity of 0.999, `isOpaque()` never flips, so there is no Layout.
  - The RenderLayer stays, because `createsGroup` holds while opacity is below 1.
  - The compositing update at the end stays (expected: Composite/Paint at +700, no Layout).

**Q3. Why the root is the view: CONFIRMED, as in §2.4.** Neither creating nor removing a layer schedules a full
layout. Both mark only the renderer itself (RenderLayerModelObject.cpp l.161-184). The marks climb through
`markContainingBlocksForLayout` (RenderObject.cpp l.598-660) to the first `isLayoutBoundary` ancestor
(l.523-562). A boundary is one of:
- the RenderView;
- `contain: layout size`;
- an SVG root;
- an element with non-visible overflow, a definite non-percent width and height, and a new formatting context.

#people has no such ancestor, so the root is the view. `setNeedsLayoutAndPreferredWidthsUpdate` also dirties the
ancestors' preferred widths. `scheduleSubtreeLayout` turns the layout into a full one when a full layout is already
pending or when there are two disjoint roots (§2.4).

**de-pm-hero's transform claim (Card 4, condition 1): CONFIRMED.** `none` → `scale(1)` is a `hasTransform()` flip,
so it is Layout. `translateY(0)` → `scale(1)` is not a flip; it is Transform → RecompositeLayer or Overflow. Two more
things happen when an element gains a transform, and both are additional, not the cause:
- it becomes the containing block for fixed and absolute descendants
  (`removeOutOfFlowBoxesIfNeededOnStyleChange`, RenderBoxModelObject.cpp l.1032);
- it gains a RenderLayer.

**Attribution of the phone frames to these paths: OBSERVED.** The evidence is device ablations (re-dur shift,
re-keep removal, n=2 per arm), consistent with the source. A Layout from another dirtier in the same frame (the
rotator, the logger's forced flush) is not excluded beyond those ablations.

**Risk for re-keep-op: UNRESOLVED.** Once the transitions end, nothing in the code read keeps the card composited.
On iOS, `allowedCompositingTriggers` (WebChromeClient.h l.292-306) has no FilterTrigger, and a 2D `translateY(0)`
is not a 3D trigger; overlap or `will-change` would still composite it. A non-composited layer with opacity 0.999
paints through `beginTransparencyLayer` on every repaint of its area (RenderLayerInlines.h l.70-75, RenderLayer.cpp
l.2711-2737). The only exception is a single-image layer that can use `setAlpha`.

`blur(0px)` is free here: it is an identity filter, so it is not painted (`shouldPaintWithFilters` → `isIdentity`,
RenderLayer.cpp l.1017-1027).

Decisive check: in an untimed attribution run on re-keep-op, at rest, check two things:
- whether the card has its own layer (LayerTree, outside a timed block);
- the Paint events covering the card while the page is idle, against re-keep.
If the card repaints often (anything inside it animating on the main thread), 0.999 can cost more per paint than it
saves at +700. Chrome cannot answer this, because Blink handles opacity differently (§2.4).

### 2.9 iOS touch path: does a touchmove listener make scrolling wait, and what is `event.timeStamp`? (de-unknowns-ux pacing v3, C1/C2)

All references are to tag WebKit-7624.4.5 (≈ Safari 26.6). The iOS `TouchEvent` class and its dispatch code are in
WebKitAdditions, which is not public (TouchEvent.h l.29-30: `#if ENABLE(IOS_TOUCH_EVENTS) #include
<WebKitAdditions/TouchEventIOS.h>`). Only the UI-process side and the shared `Event` code can be read.

**C1. A non-passive touchmove listener makes the scroll wait only once per touch sequence, at the start.**
Status: CONFIRMED for the gesture gate in the UI process.

- **Passive by default (CONFIRMED).** A listener added without an explicit `passive` option to `window`,
  `document`, `<html>` or `<body>` becomes passive when its type is in TouchScrollBlocking. Sources:
  EventTarget.cpp l.100-104; Quirks.cpp `shouldMakeEventListenerPassive` l.983-1008. This applies when
  `passiveTouchListenersAsDefaultOnDocument` is on. On iOS the setting is on for apps linked on or after the SDK
  that brought the behaviour (UnifiedWebPreferences.yaml l.6137-6148; WebPreferencesDefaultValues.cpp l.62-66), so
  it holds for current Safari. As a result, only `{passive: false}` makes a window touchmove listener blocking.

- **Tracking type.** At touchstart, the UI process asks the scrolling-tree proxy for the tracking type of each touch
  point, by event type (`updateTouchEventTracking`, WebPageProxy.cpp l.4568-4600). On iOS 7624,
  `TOUCH_EVENT_REGIONS` is off (§2.4), so the scrolling coordinator's EventTrackingRegions answer. A passive-only
  listener gives `Asynchronous`. Then `handlePreventableTouchEvent` sends the event as unpreventable and
  immediately calls `doneDeferring…(false)`, so nothing waits (l.4779-4797).

- **What waits for a Synchronous (non-passive) touchmove.**
  - The event goes over `sendWithAsyncReply`, so the UI thread is never blocked (l.4690-4736).
  - The gate is a UIKit gesture recognizer. `_touchMoveDeferringGestureRecognizer` holds back only UIPan and UIPinch
    (WKContentViewInteraction.mm l.10484-10485). It holds them until the web process replies to the first preventable
    touchmove.
  - `m_touchMovePreventionState` is reset at touchstart (l.4764-4765). It goes to `Waiting` only from `None`
    (l.4803-4804), and the reply calls `doneDeferringTouchMove(handled)` once (l.4711-4734).
  - So scrolling starts only after the page's first touchmove handlers have run on the web process's main thread.
    A busy main thread delays the start of the scroll.

- **After the pan begins, the moves don't gate scrolling.**
  - `scrollViewWillStartPanOrPinchGesture` sets `_touchEventsCanPreventNativeGestures = NO`
    (WKContentViewInteraction.mm l.4174-4181).
  - Every later move then goes through `handleUnpreventableTouchEvent`, asynchronously (l.2242-2245).
  - The flag is set back to YES only when all touch points are released (l.2247-2248).
  - So scrolling never waits per move.

- **Whether those later moves arrive with `cancelable = false` in the DOM: UNRESOLVED.** The DOM side is in
  WebKitAdditions, so the source can't answer it. Decisive check: log `e.cancelable` per touchmove in the V arm.
  Chrome's 0-2 % cancelable is a different engine and settles nothing here.

- **For pacing.**
  - The C vs V comparison should show a difference in touch-to-scroll-start (first move) only. Steady-state
    moving frames should not differ through this path.
  - Main-thread work in the handler still costs frames, through the rendering update, as any main-thread work does.

**C2. `Event.timeStamp` for iOS touch events: UNRESOLVED.**

- **What the shared code shows.** It returns `m_createTime`, reduced in resolution, relative to the time origin
  (Event.cpp l.188-199).
- **Why that doesn't settle it.** The open-source `TouchEvent` constructor uses `MonotonicTime::now()` at creation
  (TouchEvent.cpp l.47). But the iOS class comes from WebKitAdditions, so whether it passes the platform event's
  timestamp instead can't be read.
- **Decisive local check (phone, any driver).**
  - In the touchmove handler, log `performance.now() - e.timeStamp`.
  - Run it with and without a 50 ms busy loop placed just before the touch, so that it ends while the touch is
    pending.
  - If the gap stays below about 2 ms in both cases, the stamp is the web process's creation time at dispatch:
    queue delay is invisible to it.
  - If the gap grows by tens of ms with the busy loop, the stamp is earlier, from the UI process or the OS.
- **Until then.** Queue delay and touch-to-scroll can be read only as within-page comparisons (C vs V), as
  de-unknowns-ux already does.

### 2.5 What changes because of §2 (for owners)

| verdict | affected | change |
|---|---|---|
| W1 F-049 whole-view → nearest boundary | fix-hero-exit (P3 ST-2), mgmt-ops-5 (P3 scoring), FINDINGS P-row | a boundary (`contain: layout size` on a sized container) should shrink the end-frame layout; "end at `none`" still removes the flip itself. Predictions that assumed a fixed whole-view cost per crossing need the boundary term |
| W2 boundary rule | fix-hero-exit (P9 navw/nomask/split80, ticket P-026), fix-scroll-engine (N14, P11/P14) | navw's `contain: layout size` is a valid boundary on 26.6 (CONFIRMED); a width alone is not. "Flex items can't be boundaries" is wrong: designs that avoided boundaries for that reason can use them |
| W3 "every layout full 12-17 ms" | **lead (told to the user)** | correct to "every rotator Layout record is rooted at the view, 12-17 ms including style and post-layout work; why it isn't rooted at the carousel is open (second-dirtier hypothesis, boundary ticket)" |
| W5/W6 touch | owners of F-055/F-062 (nav-hit-test, scroll-engine) | a touch-listener fix can't be justified by "style rebuild / sync touch region" on 26.6; keep the OBSERVED effect, mechanism unknown |
| P6 filter `none` | hero-exit, webkit.md §1 | correction appended to webkit.md §1 |
| P9 60 Hz | protocol §3.2 (done, doc-protocol-v2 5ffb00c), phone thresholds (§2.3) | |
| P12 RenderingFrame | protocol §3.1, L13 (done), L7, §2 stage list, §5.5 note, morph-endpage l.372, CARDS D stage list | all done (doc-protocol-v2 fa04fa2; CARDS on this branch) |
| §2.3 re-bin: phone gaps not vsync-quantized | CLAUDE.md Tick bullet, protocol §3.2 A5, L7, every phone verdict | phone uses dt > 50 / dt > 34 + ±4 ms sensitivity, no k forms (CLAUDE.md 668b612; L7 fixed in 5406ca3; A5 by doc-protocol-v2). Past verdicts already carry dt > 50 / dt > 34 |
| C2 `--paint-rects` ~20 fps | **lead (told to the user)**, ts-render-signals | "about 17 fps in one host-flagged n=3 A/A; attribution runs only"; split A/B/C/D check before the number is quoted again |
| C3 display state | **lead (told to the user)**, A7, canary band | stays a correlation; the timer-fallback explanation must not be offered; U1(b) is the decisive hold |
| C4 CPU 6x | **lead (told to the user)**, CLAUDE.md "Calibrated setting" | "reproduces scripted-scroll jank counts on this page with the display on (OBSERVED)"; raster/GPU, WebKit-only costs and the finger case are outside it |
| C11 F-019 reason | scroll-engine | the geometry jump is caused by our attribute toggle clearing the remembered size, not by cv; the one-way deferral stays |

## 3. What changes in how we work

1. **Status next to every platform claim.** A finding, protocol rule, card, ticket or user report that states an
   engine/browser/device behaviour carries OBSERVED / CONFIRMED / REFUTED / UNRESOLVED and, if CONFIRMED, the
   reference and the build it applies to. "WebKit main" is not "iOS 26.6.1": a source citation says when the code
   landed (blame/commit date vs the Safari 26 branch), or the claim stays UNRESOLVED for the device.
2. **Mechanism and attribution are separate claims.** A source read can confirm "WebKit does X when Y"; only an
   ablation on the device confirms "X is our frame". Cards keep the two apart (D card item 5 vs items 1-3).
3. **Verifier role** (`fixes/AGENT_ROLES.md` "Verifier"): read-only, sonnet/medium (opus/high when it decides a
   phone block), plan-then-execute, tries to *break* the claim (versions, how our probe could mislead), returns a
   claim card (`fixes/_template/CARDS.md`). Runs in parallel with I and D; its verdict is due before D is signed.
4. **D gate** (`fixes/LEAD.md` "Stages and gates"): no NAMED while a claim the mechanism rests on is OBSERVED;
   CONFIRMED with a device-applicable citation, or UNRESOLVED with its decisive local check run and passed.
   A REFUTED claim sends the card back to I. The fast path needs no platform claim.
5. **Absence is not a fact.** "0 events" / "never fires" / "no records" from one probe is OBSERVED until the
   verifier has checked the enable order, the target/session, coalescing, caps and the docs (C1 is the case).
6. **One A/A or a log correlation is not a protocol rule.** C2 and C3 became rules after one contaminated A/A and
   a correlation; a rule now names its controlled check and stays provisional ("in our setup") until it ran.
7. **Contradictions between our own docs are claims to verify first.** P6 (filter `none`) and P9 (60 vs 120 Hz)
   sat in two documents each with opposite wording; a verifier resolves such a pair before either is used.
8. **The lead's reports to the user** quote OBSERVED claims as "in our setup, cause unknown".

## 4. Toolsmith spec: platform-claim status on the findings board

For the lead to hand to a toolsmith (`ts-claims-board`); test-first, one `tools:` commit, `npm test`. Not
measurement code.

**Problem.** A finding's title states a platform behaviour as fact, and acks spread it (F-059: 1 ack, cited in the
protocol within the hour). The board has a lifecycle `status` (open/folded/duplicate/rejected) but no field for how
well a claim is supported.

**Change (tools/lib/finding.mjs, tools/finding.mjs, tests/unit/finding*.test.mjs):**
1. New optional fields on a finding: `claim` ∈ {`observed`, `confirmed`, `refuted`, `unresolved`} and `refs`
   (array of strings: URL + line/commit/milestone, or a raw-data path for the decisive check). The existing
   `status` field keeps its meaning; do not reuse it.
2. `post`: `--claim observed|confirmed|refuted|unresolved` and repeatable `--ref "<url + line/commit>"`.
   - `--claim confirmed` or `refuted` without at least one `--ref`: error, exit 1 ("a confirmed/refuted claim needs
     --ref").
   - `--kind limitation` (new kind, for "X never/always happens in browser Y" statements) without `--claim`: post
     with `claim: observed` and print `NOTE: posted as OBSERVED; add --claim/--ref after verification`.
   - Other kinds: `--claim` optional (a technique or coupling may carry none).
3. New subcommand `claim <id> --by <agent> --status <…> [--ref …]... [--note "…"]`: sets/updates `claim` and
   appends `refs`; a history entry `{action: 'claim', changes: {claim: {from, to}}, refs, note}`; any agent may run
   it (verifiers are read-only on the repo but post to the board). `refuted` also prints a reminder to post the
   correction as a new finding naming the old id.
4. `list`: show `[OBSERVED]` / `[CONFIRMED]` / `[REFUTED]` / `[UNRESOLVED]` before the title when `claim` is set;
   filter `--claim <s>`. `show`: a `claim` line and the refs. `digest`: carry the tag into the row so FINDINGS.md
   shows it.
5. `wait`: a `claim` change on a finding counts as news for its topics (so owners who acked F-nnn hear about a
   refutation), printed as `CLAIM F-059 observed -> refuted by ver-layerpainted`.
6. Back-compat: old findings have no `claim` field; `list --claim observed` does not match them (unknown ≠
   observed). The lead back-fills the platform findings from this audit with `claim` once it lands.

**Tests (unit):** post with/without `--claim`/`--ref` (error paths); limitation kind defaulting to observed;
`claim` subcommand transitions + history; list tag and filter; digest tag; wait notification on a claim change;
old records without the field.
