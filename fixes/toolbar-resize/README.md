# Fix: toolbar-resize

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (P-106 ablation block run 2026-10-04 13:19-13:45Z); no shippable fix yet
**Stage:** D signed by lead 2026-10-04 14:02Z (LOCATED); P-109 + P-110 Simulator bisects: cost = #people's showcase (0.03), trigger = any viewport-constrained renderer (no single one); indicative; P-115 on v8: content-visibility:auto on the showcase LOCATES (0.036), contain:layout and svh pin NONE; P-115 read AGREE (ops); P-119 (ops pre-data PASS): cct NONE, cva LOCATES (0.036/0.037) but N-SENSITIVE: the skip removes the cost only off screen, in-view frames still ~21 ms; look gate LOOK-RISK (applies to cva's paint containment too); R7 review (lead, 2026-10-05): M2 refuted, M1 accepted as the working model (OBSERVED); P-123 (count-only, S5) result: WRITE (ops read AGREE; predictions 3 of 5): no viewport value in the box flips (the shells' 100vh clamp is overridden on phones by `height: auto`, corrected); step-specific writes are IntersectionObserver state, among them the v8 will-change window `data-fw-wc` (rootMargin 50 %, moves with the toolbar): candidate trigger, OBSERVED, untested; P-125 (ops pre-data PASS, lead signed; one Simulator hold 2026-10-05): NOT-THE-WINDOW: the will-change window writes on step frames (C coincidence COVERS 22/22) but pinning it (wc1: no toggles) leaves the in-view Layout unchanged (ratio 1.045, NONE); wpx did not stop the writes (design miss, disclosed); predictions 7 of 10; ops result read AGREE (3f95feb9), landed a28a29ad; P-126 (card rev 2, ops PASS, lead signed; stage 1 read the P-125 captures, no hold): NATIVE (only `inval:native` links, by rate, RRlo 7.57, Hw 22/22; no page script key links; FORCED UPDATE; heavy roots are the 430x775 view box, frozen call SUBTREE is a rule miss), R AGREE; N1: NATIVE means only that no script key links; N4: the instrument's view of observer-callback writes is unknown (fwWC's known writes leave no keyed record; same-value writes match records as often, so dropped stacks vs no invalidation are both UNRESOLVED); K1 SUPPORTS (IO root follows the step, OBSERVED; root = layoutViewportRect, CONFIRMED in WebKit source); predictions 6 of 10; ops result read AGREE with N4 reworded (R1), R2 and R4 folded in
**Device class / gate:** touch-only / phone-only (Safari's toolbar resize does not exist in Chrome's emulation)
**Driver(s) behind the claims:** phone G (WDA flick scripts `flick-hero-v1`, `flick-end-v1`) with Timeline; S sentinels
**Prediction:** P-106 (this card, section "Prediction P-106"; ops pre-data read requested)
**Topic:** `fixes/TOPICS.md` row 10 (toolbar-resize); part of user T-113 (fast-flick lag on best build v7)
**Base:** v7 (`fixes/v7-best`, JS `8c90da217745`, CSS `308f0da70c3a`, sha256/12 of the served `2.DyWL8TcE.js` / `2.gBuqKVzi.css`)

## I card: what reacts to the toolbar height change

**Axis (ops C7): toolbar step × page y.** While Safari's toolbar moves, innerHeight steps through 775 → 815 (or back)
in 6-14 steps over ~300 ms. Each step is a new layout viewport. What a step costs depends on where the page is:

| v7, G flicks with Timeline (iphone-runner TH1/2, TF1/2, TE1/2; `score-tr.mjs`) | toolbar-moving frames | heavy (largest Layout ≥ 5 ms) | median largest Layout | > 34 / > 50 ms |
|---|---|---|---|---|
| y < 3250 (hero track 0-1550 and #people 776-2105 rendered) | 114 | 104 (0.91) | 12.3-14.2 ms per run | 41 / 14 |
| y ≥ 3250 (both re-skipped by v7's far re-skip, JS 2838-2870) | 83 | 5 (0.06) | 0.56-0.58 ms (TH2's 5 frames: 14 ms, just past the split) | 2 / 0 |

- Steady 815 at hero y (~503): every logger-forced layout is 13-14 ms; the same invalidations at y 0 / height 775 cost
  0.1 ms (`probe-inval.mjs`, `probe-resize.mjs`, OBSERVED, in our setup). Layout root stays 775 tall in the Timeline.
- So the cost follows "a new viewport height while the hero subtree is rendered", not the scroll itself.
- A separate cluster: heavy layouts at steady 815 around y 3283-3554 (pain zone). Not this topic's axis; noted for
  fix-morph-scroll / pain owners.

**The heavy work is style-interleaved layout** (OBSERVED in the v7 Timelines; mechanism CONFIRMED in source below).
In every heavy toolbar-moving hero frame (104/104 over the six runs, `score-tr.mjs` column `in-style`) the ~12-15 ms
Layout runs *inside* a RecalculateStyles record (Timeline nesting `Layout < RecalculateStyles`, e.g.
`RenderingFrame > Layout 15.1 > RecalculateStyles 15.1 > Layout 14.7`), often twice per frame (once from a rAF
callback's forced read, once in the rendering update). In the end zone no Layout ≥ 5 ms is nested in style.
- WebKit brackets `Document::resolveStyle` with `willRecalculateStyle` / `didRecalculateStyle` (Document.cpp l.2843,
  l.2918); inside, `while (resolver.needsInterleavedLayout()) { updateRenderTree(); layoutContext().interleavedLayout(); }`
  (l.2879-2890). `TreeResolver::resolve` sets `m_needsInterleavedLayout` only for unresolved query containers or
  anchor-positioned elements (StyleTreeResolver.cpp l.1586-1666); a query container is an element whose
  `containerType().hasSizeContainment()` (l.1535-1556). A normal `updateLayout` runs style, then layout, side by side.
- The page has no anchor positioning (no `anchor-name` / `position-anchor` in any CSS). Query containers in v7 CSS:
  `.orbit-card` `container-type: inline-size` (l.1658), `built-stage` (l.6641) and `…-kr-arm` `size` (l.7317), the
  last two in `#platform`, far below y 3250. On mobile `.orbit` is `display: none` (l.2093), so the four
  `.mobile-deck .orbit-card`s in the sticky hero are the only query containers in the hero zone.
- So candidate 6 (`--cq`) is the leading one; the block tests it against the others.

**What a viewport-size change invalidates in WebKit** (CONFIRMED in source, WebKit main `2d9f94fae5f57d291987f98c980ecab42dba6d29`):
- `LocalFrameView::setLayoutViewportOverrideRect` (LocalFrameView.cpp l.1969-1991): on a rect change marks every
  viewport-constrained (fixed/sticky) renderer `setNeedsLayout` (`setViewportConstrainedObjectsNeedLayout`, l.3821);
  on a size change also `updateViewportUnitsOnResize`.
- `Style::Scope::didChangeViewportSize` (StyleScope.cpp l.760-807): style invalidation for every element whose style
  uses viewport units (any: vh, svh, dvh, vw); whole-document only for a registered `@property` with viewport units
  (the page has none).
- `Style::TreeResolver` (StyleTreeResolver.cpp l.1535-1556): only `container-type` with size containment makes a
  query container (interleaved layout); `contain:` alone does not.
- `RenderView::layout` (RenderView.cpp l.178-222): relayouts children when the view size changed.

**Candidates in v7 that react to innerHeight** (pretty lines of `2.gBuqKVzi.css` / `2.DyWL8TcE.js` in the v7 overlay):

| # | candidate | where | arm |
|---|---|---|---|
| 1 | `100dvh` (5 rules; none in the hero) | CSS 1161, 4159, 4186, 4196, 11422 | `--dvh` (→ `100svh`) |
| 2 | hero view timeline `--hero-exit` (CSS path on WebKit, `heCss` gate) | JS heCss gate | `--vt` (gate off, JS writer path) |
| 3 | `content-visibility:auto` + far re-skip | CSS 12227 | `--cv` (`visible`; positive control for the y split) |
| 4 | JS resize listeners (`rE` scroll callbacks, `heArm`) | JS `aE`/`oE`, `heArm` | `--js` (height-only resizes skipped) |
| 5 | sticky `.hero` (423 descendants) as a viewport-constrained object | CSS 1597 | `--sticky` (`relative`, MECHANISM ARM, not shippable) |
| 6 | `container-type: inline-size` on the 4 mobile-deck `.orbit-card`s | CSS `@media (width<=600px) .mobile-deck .orbit-card` | `--cq` (`normal` + `contain: inline-size layout style`, `--orbit-u` in px) |

Which one makes the hero relayout ~13 ms per step is UNRESOLVED; the block below decides it.

## Ablation block (ticket; lead: attribution, approved 2026-10-04)

Lead exception (ruling on the ops FAIL, 2026-10-04 ~13:05Z): **attribution block, judged as counts, no U-test**.
Verdict metric per toolbar-moving frame (largest Layout, Layout count), split at y 3250, each arm vs neighbouring C
runs, not fps.

**Arms** (each = v7 + one edit; served hashes checked by the driver before every hold, `x-mirror-source: overlay`):

| arm | JS | CSS | edit |
|---|---|---|---|
| C (v7) | 8c90da217745 | 308f0da70c3a | none |
| sticky | 8c90da217745 | eebdbe9ad8d9 | `.hero` `position: relative` (mechanism only) |
| cq | 8c90da217745 | 499beb8bc2ec | orbit-cards not query containers; `--orbit-u: calc(118px / 302)` (is-a, is-d), `calc(158.92px / 302)` (is-b), `calc(158.625px / 302)` (is-e) |
| dvh | 8c90da217745 | 0c57fd23ea50 | 5× `100dvh` → `100svh` (DialogHeader's fullscreen dialog left out) |
| vt | 86086110616c | 308f0da70c3a | `heCss = !1 && …` |
| cv | 8c90da217745 | 0e4595558023 | `content-visibility: visible` on the deferred sections |
| js | b338adb5e776 | 308f0da70c3a | `trzR`/`heArmW`: resize callbacks only when innerWidth changes |

Negative sibling: `dvh` (no `dvh` rule is in the hero, so it predicts no change) and `js` (predicted within C ± 0.20).

**Order** (one warm-up load per arm, uncounted; S sentinels Timeline-OFF at start and end, lead condition (c)):
- warm-ups: C sticky cq dvh vt cv js; sentinel `C:S1`
- pass 1: C:H1 sticky:H1 cq:H1 C:H2 dvh:H1 vt:H1 C:H3 cv:E1 C:E1 js:H1 C:H4
- pass 2: sticky:H2 cq:H2 C:H5 dvh:H2 vt:H2 C:H6 cv:E2 C:E2 js:H2 C:H7
- sentinel `C:S2`; `cv` gets its matched control `C:E` right next to it (lead condition (d)).
- Phone parts run beside the shared chrome-measure group (lead correction), iphone lease only, thermal gate
  (`--expect serious --max-c 44`) at each hold's start and end, Safari parked after each hold. No user steps.

**Mechanism checks before the phone (ops C5, lead condition (e)):** `node tools/check.mjs` on all 7 targets, mobile,
with computed-style probes (`out/toolbar-resize/check2.log`). Results: see "Mechanism check" below. The WebKit
`--orbit-u` equality check (Simulator) is needed only before `cq` goes to V.

## Prediction P-106 (registered before data)

Scorer: `fixes/toolbar-resize/score-tr.mjs <folder>` (ops C2), sha256/12 **`4b7fca760270`**. Filters frozen in its header.

- **Metric (H arms):** per run, heavy fraction = toolbar-moving frames (775 < innerHeight < 815) at y < 3250 whose
  largest Layout ≥ 5 ms, over all toolbar-moving frames at y < 3250. A run counts with ≥ 8 such frames.
- **Expected C:** ~0.90 (v7: 0.86, 0.96 on H runs; 104/114 over all six runs).
- **WIN:** every counted arm run ≤ 0.20 AND ≤ 0.5 × mean of its neighbouring C-H runs (≥ 2 counted runs).
- **PARTIAL:** every counted arm run ≤ 0.6 × that C mean, but not WIN.
- **NONE:** otherwise. Threshold-sensitive when the call changes with heavy at 4 or 6 ms (scorer reports it).
- **cv (positive control for the y split):** metric = heavy fraction of toolbar-moving frames at y ≥ 3250 on
  `flick-end-v1`. C-E expected ≤ 0.10 (v7: 0/33, 0/34). CONFIRMS when both cv-E runs ≥ 0.50 and the neighbouring
  C-E runs ≤ 0.10.
- **Per-arm predictions** (made after the in-style finding, before any arm data): cq WIN (~70 %, WIN or PARTIAL
  ~85 %); sticky NONE or PARTIAL (WIN ~25 %); dvh NONE; vt NONE; js NONE and within C ± 0.20; cv CONFIRMS (~70 %).
  Mechanism check per arm (reported): cq's `in-style` count drops to ~0 even where a heavy frame remains.
- **Tie:** sticky and cq both WIN or PARTIAL → both are in series (the sticky hero is the viewport-constrained root,
  the cards the query containers inside it); ship the look-alike `cq` first, after the WebKit `--orbit-u` check.
- **None wins:** D stays LOCATED (hero subtree, by the y split); next step a hero-subtree bisect (display:none halves
  under `.hero`, mechanism arms).
- **VOID:** the C-H hero-zone median largest Layout drifts > 30 % from the first to the last C-H run (lead condition
  (b)), or a sentinel fails (scroll < 44 fps or bottom < 58 fps).
- Slow-frame counts (> 34 / > 50 with the ±4 ms twins) are reported, not judged (attribution block).

## Mechanism check

`node tools/check.mjs` (mobile, headless, shared lane) on all 7 servers, 2026-10-04 13:04-13:14Z; logs
`out/toolbar-resize/check2.log`, `check3.log` (gitignored). Every page: morph reached, 0 errors, 0 4xx.

| arm | computed-style probe (v7 → arm) | screenshot diff vs v7, top / middle / bottom (%) |
|---|---|---|
| sticky | `.hero` position `sticky` → `relative` | 0.20 / 0 / 0.42 |
| cq | deck cards `container-type`/`contain`: `inline-size`/`none` → `normal`/`inline-size layout style`; deck text sizes equal except 2 lines (font 8.41887 → 8.4196 px, height +0.008 px) | 0.15 / 0 / 0.53 |
| dvh | style rules using `dvh`: 6 → 1 (the left-out DialogHeader rule) | 0.18 / 0.01 / 0.46 |
| cv | a section set to `deferred`: `content-visibility` `auto` → `visible` | 0.21 / 0.01 / 0.51 |
| vt | none in Chrome: the `heCss` gate needs `GestureEvent` (WebKit only), so Chrome runs the JS path in both | 0.17 / 0.01 / 0.44 |
| js | none in Chrome at a fixed size (the change acts only on height-only resizes) | 0.14 / 0 / 0.48 |

- The diffs are countdown and orbit phase noise (0-0.4 % usual; bottom 0.42-0.53 % in every arm, including the
  arms that change nothing in Chrome). None of the arms changes the look in Chrome.
- `cq` is not exact yet: `--orbit-u` in px is off by < 0.01 px in two text lines. It is fine as a mechanism arm.
  For F/V it gets exact values from the Simulator, plus the WebKit equality check (lead condition (e)).
- `vt` and `js` act only on WebKit or on height-only resizes. The driver checks their served hashes
  (JS `86086110616c`, `b338adb5e776`) before every hold.
- Arm deltas vs v7: `fixes/toolbar-resize/arms.diff`.

## D card: P-106 ablation result (attribution, counts)

Block: test iPhone, G driver `flick-hero-v1` / `flick-end-v1` with Timeline, served bytes checked before every hold.
21 counted runs plus 1 aborted (`dvh:H1`: Runtime.evaluate timeout, re-run as `dvh:H3`; the scorer lists it as thin).
- Sentinels (S, Timeline off): C:S1 58 / 60 fps, C:S2 59 / 60 fps (scroll / bottom), both PASS.
- C drift (hero median largest Layout, C-H1 → C-H7): 13.29 → 13.23 ms (0.5 %). Not VOID.
- Thermal: Serious at 10 of 12 gates. Hold 1 ended Fair and hold 2 started Fair (`FAIL too cool`; the driver stopped
  only on the 44 °C ceiling, code 3, not on a too-cool FAIL; fixed in the driver since). That hold's runs `dvh:H1`
  (aborted), `vt:H1`, `C:H3`, `cv:E1` and `C:E1` began at Fair. Their values match the other holds, and dropping them
  changes no call (ops second read, AGREE, 765d1330).
- Scorer `score-tr.mjs` (sha 4b7fca760270) on `out/toolbar-resize/phone`. Output: `results.json`.

| arm | heavy fraction, hero zone, run 1 / 2 | neighbouring C mean | in-style heavy frames | median largest Layout (ms) | call |
|---|---|---|---|---|---|
| sticky | 0.912 / 0.925 | 0.968 | all | 13.6 / 13.3 | NONE |
| cq | 1.000 / 0.939 | 0.968 | 0 / 1 (C: all) | 13.8 / 13.7 | NONE |
| dvh | 0.907 / 1.000 | 0.976 | all | 12.7 / 13.5 | NONE |
| vt | 1.000 / 1.000 | 0.978 | all | 13.0 / 13.5 | NONE |
| js | 0.967 / 1.000 | 0.977 | all | 13.1 / 12.9 | NONE |
| C (7 H runs) | 0.933-1.000 | | all | 12.6-14.0 | |
| cv, end zone | 1.000 / 1.000 (12/12, 13/13 frames) | C-E 0 / 0 (0/32, 0/34) | all | 13.8 / 13.8 | CONFIRMS |

All calls hold with heavy at 4 or 6 ms (`thresholdSensitive: false`).

**Predictions vs outcome:**
- cq WIN (~70 %): wrong. cq removed the style interleaving (the hero's RecalculateStyles went from ~13.5 ms to 0.8 ms),
  but the Layout stayed ~13.7 ms; it now runs on its own instead of inside style. The query containers decide *where*
  the relayout runs, not what it costs.
- sticky WIN (~25 %): NONE. Taking the hero out of the viewport-constrained set changes nothing.
- dvh, vt, js NONE: as predicted. js stayed within C ± 0.20.
- cv CONFIRMS: as predicted. With render deferral off, the end zone pays the same ~13.8 ms per toolbar step. cv keeps
  *everything* rendered, the hero and #people included, so this does not separate "the hero/#people subtrees relayout
  whenever they are rendered" from "every rendered subtree relayouts".

**Mechanism notes (ops N1-N4; `mech-tr.mjs`):**
- vt acted on WebKit. C runs the CSS-path scroll handler `heSc` (JS 4675, ~500 calls per run); vt runs the JS writer
  `s` (JS 4710 in the vt build, ~300 per run) instead.
- js acted. The resize listeners are the wrappers `trzR` (JS 2760) and `heArmW` (4829) instead of `rE` (2702) and
  `heArm` (4807). On C the whole resize path costs 1.6-1.9 ms per run (16-24 dispatches), with no Layout and no call
  ≥ 0.5 ms, so JS resize handling could not explain 13 ms per step anyway.
- N3, page height: 5999 → 6035 px in every arm, sticky included. The y split stays raw y 3250.
- N4: both C-E runs are 0 in the end zone, so there is no split-edge effect.

**D verdict proposed: LOCATED.**
- On each toolbar step (a new layout-viewport height), WebKit runs a ~13 ms layout whenever the hero track and #people
  are rendered (not skipped by `content-visibility`), wherever the viewport is. Whether only those subtrees or all
  rendered content is laid out is open (cv cannot tell).
- It is not one of the listed properties: dvh units, the hero view timeline, JS resize handlers, the sticky hero as
  a viewport-constrained object, or the deck query containers (which only move it).
- v7's far re-skip (`content-visibility: auto` back on sections far above the viewport) is what makes the page end
  cheap. Turn it off and the end pays too.
- Status: OBSERVED in our setup. Why a height-only layout-viewport change dirties the whole rendered tree is
  UNRESOLVED. In WebKit source, `setLayoutViewportOverrideRect` marks only viewport-constrained renderers and
  viewport-unit styles, and `RenderView::layout` relayouts children only when the view size changes. The Timeline's
  layout root stays 430x775.

**Next step (planned, not run):**
1. Read the WebKit source for what a layout-viewport height step dirties beyond the above: iOS `WebPage` dynamic
   viewport updates, `LocalFrameView::setLayoutViewportOverrideRect` callers, the `RenderView` size versus
   `layoutSize` on iOS, and percent and viewport-relative heights up the chain.
2. A subtree bisect on the phone (mechanism arms). First, force-skip only #people, then only the hero track, at
   hero-zone y (cv hidden: a mechanism-only look change). Then halves inside the guilty one. It answers "which subtree,
   and is the cost ∝ rendered nodes or one specific box?".
3. A less-work candidate already follows from the cv result: re-skip the hero track and #people sooner (a smaller
   far-re-skip distance), or skip them while the toolbar is moving. Any such change is a look-alike that must be
   pixel-identical (the skipped sections are off screen).

## WebKit source reading (for D; WebKit main `2d9f94fae5f57d291987f98c980ecab42dba6d29`)

Files were fetched with `gh api` at that commit; their byte sizes match the repository. Each claim below is CONFIRMED by
the source cited. How the steps add up to 13 ms on this page stays OBSERVED.

| # | claim | source |
|---|---|---|
| S1 | iOS: each visible-rect update sets the layout viewport override; layout is triggered only in a stable state and not while obscured insets (the toolbar) change interactively | [WebPageCocoa.mm l.4163-4174](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebKit/WebProcess/WebPage/Cocoa/WebPageCocoa.mm#L4163-L4174) (`updateVisibleContentRects`, l.3975) |
| S2 | A size change of the override rect forces `TriggerLayoutOrNot::Yes`. A changed rect marks the viewport-constrained objects for layout; a changed size also runs `updateViewportUnitsOnResize` | [LocalFrameView.cpp l.1969-1991](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/page/LocalFrameView.cpp#L1969-L1991) |
| S3 | "Viewport-constrained objects need layout" = `setNeedsLayout()` (plus a compositing geometry update) on every fixed or sticky renderer | [LocalFrameView.cpp l.3821-3833](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/page/LocalFrameView.cpp#L3821-L3833) |
| S4 | `dvh` = the layout viewport override size (it changes every step); default `vh` comes from a separate override | [LocalFrameView.cpp l.7110-7116, 7232-7246](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/page/LocalFrameView.cpp#L7232-L7246) |
| S5 | `updateViewportUnitsOnResize` → `Style::Scope::didChangeViewportSize`. It walks every element and invalidates the style of those whose style (or a pseudo-element's style) uses any viewport unit, or that run a viewport-unit animation. Only a registered custom property with viewport units invalidates the whole document | [Document.cpp l.5903-5906](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/dom/Document.cpp#L5903-L5906), [StyleScope.cpp l.760-807](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/style/StyleScope.cpp#L760-L807) |
| S6 | A query container is an element with `containerType().hasSizeContainment()`; `contain:` alone is not one | [StyleTreeResolver.cpp l.1535-1556](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/style/StyleTreeResolver.cpp#L1535-L1556) (`updateStateForQueryContainer`) |
| S7 | `TreeResolver::resolve` asks for interleaved layout only for unresolved query containers or anchor-positioned elements | [StyleTreeResolver.cpp l.1558-1666](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/style/StyleTreeResolver.cpp#L1558-L1666) |
| S8 | `Document::resolveStyle` brackets the interleaved-layout loop with the RecalculateStyles Timeline record, which is why a Layout nests inside RecalculateStyles | [Document.cpp l.2843, 2879-2890, 2918](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/dom/Document.cpp#L2843-L2918) |
| S9 | `RenderView::layout` relayouts its children only when the view's border box differs from the view size. The Timeline's layout root stays 430x775 through the steps | [RenderView.cpp l.178-222](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/rendering/RenderView.cpp#L178-L222) |
| S10 | (context) iOS can expand the layout viewport height when the toolbar collapses; a fixed or sticky element covering > 90 % of the viewport (the sticky hero is 100svh) turns that off ("large container"). It applies only when the `layoutViewportHeightExpansionFactor` setting is non-zero; whether iOS Safari 26 sets it is UNRESOLVED | [WebPageIOS.mm l.3633-3711](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebKit/WebProcess/WebPage/ios/WebPageIOS.mm#L3633-L3711) |

**What the block adds to S1-S10 (OBSERVED, in our setup):**
- Viewport-constrained renderers in the hero zone (Chrome DOM probe, `check4`): `.start-selling-top-nav` (fixed, 221
  descendants), `.hero` (sticky, 422), `.pain-sticky` (sticky, 29).
- The sticky arm took the hero out of S3 and changed nothing.
- dvh (S4) and the deck query containers (S6-S8) only change where or whether style runs, not the ~13 ms Layout.
- So none of S2-S8 alone names what the 13 ms Layout lays out. P-109 bisects by subtree.

## Prediction P-109: Simulator subtree bisect (registered before data)

Lead (14:02Z): Simulator, shared slots at weight simulator, no phone, one hold where possible. This is a mechanism
attribution: Simulator times are compared only within the session against interleaved C runs, never as a gain (F-084).

- **Arms** (v7 + one appended CSS rule; served CSS sha256/12; the arm deltas are appended to `arms.diff`):
  - `nvc`, `9c3d7e989f94`: no viewport-constrained renderers in the hero zone (`.hero` relative, top-nav absolute,
    `.pain-sticky` relative). Tests S2/S3 as a whole.
  - `skh`, `903bc0a5380b`: `section.hero-track { content-visibility: hidden; contain-intrinsic-block-size: 200vh }`
    (hero never rendered; 200vh = the track's own `height`, CSS l.1583, so its box keeps its size).
  - `skp`, `b6cac1379bd7`: `section#people { content-visibility: hidden; contain-intrinsic-block-size: 1329px }`
    (1329 px = #people's rendered height on the phone at 775, y 776-2105; ops C1: hidden implies size containment).
  - `ch`, `496c6ec41688`: fix idea (a), `.hero { contain: size layout style }`. The hero has an explicit height
    (100svh, min 680px), so size containment keeps its box.
  - All four are mechanism-only (look changes allowed) except `ch`, which must be look-identical if it ever goes to F.
- **Order:** two 300 s holds, because a gesture refuses with < 150 s left in its hold (`GESTURE_BUDGET_S`, I-112).
  Hold 1: C:H1 skh:H1 skp:H1 C:H2. Hold 2: C:H3 nvc:H1 ch:H1 C:H4. The driver (`sim-bisect.mjs`) stops before a step
  when < 45 s are left; an arm without a later C uses the C before it. Drift is checked from C:H1 to C:H4.
- **GEOMETRY (ops C1):** an arm whose final page height differs from a neighbouring C run's by > 2 px is called
  GEOMETRY and not judged.
- **Served bytes (ops C2):** before each hold, the driver hashes every arm's served CSS (http twin), logs it to
  `runs.jsonl` and refuses on any mismatch with the hashes above.
- **Scorer:** `score-bisect.mjs`, sha256/12 `cb6f0c97b81b` (filters frozen in its header). On the phone's C-H1 / cq-H1 /
  C-H2 it reproduces P-106: cq ratio 1.04 NONE, replica true.
- **Metric:** per run, the median largest Layout over toolbar-moving frames (strictly between the run's two toolbar
  heights) at y < 3250. Ratio = arm / mean of the neighbouring C runs.
- **Calls:** LOCATES ratio ≤ 0.30; PARTIAL ≤ 0.70; NONE otherwise; INSUFFICIENT with < 8 moving hero frames. One run
  per arm, so every call is indicative. Any arm that feeds a fix gets a phone G check before F.
- **Replication gate:** every C run has ≥ 8 moving hero frames, and ≥ half of them hold a Layout ≥ 0.5 ms nested in
  RecalculateStyles (the phone signature). Otherwise NO-REPLICA: the Simulator does not reproduce, and the bisect
  moves to the phone with a new ticket.
- **VOID:** C medians drift > 30 % first → last.
- **Predictions:** replica ~70 %. skh LOCATES ~45 % (PARTIAL ~35 %). skp PARTIAL ~45 % (NONE ~40 %). nvc NONE ~60 %.
  ch NONE ~55 % (LOCATES or PARTIAL ~45 %).
- **Reading:**
  - skh LOCATES and skp NONE: the cost is the hero subtree.
  - skh and skp both PARTIAL: the cost scales with rendered content.
  - nvc LOCATES: the S3 path through the top-nav or `.pain-sticky` (the hero alone was ruled out by P-106 sticky).
  - ch LOCATES or PARTIAL: fix idea (a) goes to a look check and a phone G check.

## P-109 result (Simulator, one normal hold, 2026-10-04 ~14:50Z)

| run | moving hero frames | median largest Layout | inStyle | docH | ratio | call |
|---|---|---|---|---|---|---|
| C-H1 | 11 | 21.4 ms | 10 | 5999->6035 | | |
| skh-H1 | 14 | 20.2 ms | 12 | 5999->6035 | 0.956 | NONE |
| skp-H1 | 29 | 1.03 ms | 3 | 6001->6037 | 0.049 | LOCATES |
| C-H2 | 10 | 20.9 ms | 8 | 5999->6035 | | |
| nvc-H1 | 19 | 0.36 ms | 5 | 5999->6035 | 0.017 | LOCATES |
| ch-H1 | 12 | 21.0 ms | 10 | 5999->6035 | 0.982 | NONE |
| C-H3 | 11 | 21.9 ms | 10 | 5999->6035 | | |

REPLICA true (every C run counted, inStyle >= half), DRIFT 0.024 (C-H1 -> C-H3), VOID false. Scorer cb6f0c97b81b,
`p109-score.json`; served-bytes log `p109-runs.jsonl` (all arms served the card's CSS from their overlay).

- **What it says (indicative, one run per arm):** the ~21 ms toolbar-step Layout (phone ~13 ms) disappears when
  #people is not rendered (skp) and when the hero zone has no viewport-constrained renderers (nvc). Hiding the hero
  (skh) and containing it (ch, fix idea a) change nothing. With P-106 `sticky` (hero not sticky: NONE), the trigger is
  the fixed top-nav or `.pain-sticky` (S3, `setViewportConstrainedObjectsNeedLayout`), and the time is spent laying
  out #people's subtree. That is the "skh NONE, skp LOCATES" case, which the predictions did not expect
  (skh LOCATES ~45 %, nvc NONE ~60 %). The mechanism behind "constrained renderer -> #people relayout" is
  UNRESOLVED (no source read yet); decisive check: P-110 below.
- **Deviations from the card (for ops):** CHANGE IN METHOD (asked for by the desk): the bisect ran in one
  exclusive Simulator hold of 7 steps, not in the shared lane as 2 holds of 4.
  - Lock mode. `sim.mjs session --functional` (shared lane) refuses `sim.mjs gesture` as a timing run, so the shared
    hold took no data. Every run here comes from one normal Simulator session (`lock.mjs run chrome-measure
    --max-seconds 600 -- sim.mjs session`), which is quieter than the card's lane. Filters and scorer are unchanged.
  - Order. Seven steps in one hold, not two holds of four: C:H1 skh skp C:H2 nvc ch C:H3. Every arm has a C run on
    each side; there is no C:H4, and drift is C:H1 -> C:H3.
  - The gesture's pull-to-refresh guard ended loop s2/s4 early in every run, C and arms alike (the page sat near the
    top). nvc-H1 reached y -202 (rubber band at the top).
- **N1 (cold C:H1):** not an outlier (21.4 vs 20.9 / 21.9 ms), so no exploratory ratios are needed.
- **N2 (single-neighbour cases):** none. Every arm sits between two C runs.
- **N3 (cross-hold neighbours):** none. Everything ran in one hold.
- **N4:** every call is indicative. Only a phone G run feeds F.
- **GEOMETRY edge:** skp's page height is 2 px off its neighbours (6001 vs 5999). The rule calls GEOMETRY at > 2 px,
  so skp is judged, but only just. The 1329 px pin was not changed after the data (ops note).
- **More frames in skp/nvc** (29/19 vs ~11 moving hero frames): cheaper steps give more frames during each toolbar
  move. This is expected, not a filter effect.

### Next (plan, not yet a ticket; needs an ops read)

- **P-110 (Simulator, same scorer):** split the two located arms. Trigger: `nav-abs` (top-nav absolute only) vs
  `pain-rel` (`.pain-sticky` relative only). Cost: hide each of #people's top-level children in turn, pinning its
  height and keeping GEOMETRY.
- **Then a phone G check:** v7 vs the smallest located change, Timeline on, same filters as P-106. If a
  look-identical form exists (for example `contain: layout` or `content-visibility: auto` with a measured intrinsic
  size on the located #people child, or isolating the constrained renderer), add a look check (pixel-identical rule)
  before F.

## Prediction P-110: trigger and cost split (Simulator, registered before data)

Lead (via desk): the Simulator part goes now, mechanism only; its phone G check waits for the ops reads (P-109 result and
this pre-data card). It runs after v8's P-111 and PR-018 6d in the phone order. v8's phone block is P-111.

- **Question.** P-109: removing the hero zone's fixed/sticky renderers (nvc) and not rendering #people (skp) each remove the
  toolbar-step Layout; hero hide (skh) and `contain` on .hero (ch) do not. Which constrained renderer triggers it, and which
  part of #people carries the cost?
- **Arms** (all on the v7 server, CSS `308f0da70c3a`, JS `8c90da217745`; the arm is applied in the page by
  `p110-inject.mjs`, sha256/12 `a2a4d4419f4b`, after each load and before the Timeline starts; mechanism only, look may change):
  - Trigger: `nav` (`.start-selling-top-nav` position absolute), `pain` (`.pain-sticky` position relative), `navpain` (both;
    nvc without the `.hero` change, to see whether the hero's own sticky is needed).
  - Cost, inside `#people .start-selling-future-card`: `ph` (header), `ps` (showcase), `pc` (community pill):
    `content-visibility: hidden` with `contain-intrinsic-block-size` = that box's own height measured in the same page just
    before (so the Simulator's height is used; no height is typed in; GEOMETRY still checks docH).
  - C = v7 with the same injection and no change (it reads the heights only).
- **Order (one exclusive hold, <= 10 min):** C:H1 nav:H1 pain:H1 C:H2 navpain:H1 ph:H1 C:H3 ps:H1 pc:H1 C:H4. The driver
  `sim-bisect110.mjs` (sha256/12 `93c7459a12cf`) stops before a step when < 45 s of its 520 s budget are left; an arm with
  only one neighbouring C uses it and says so. Served bytes are hashed before the hold (refuses on a mismatch, exit 26).
- **Applied-arm gate (ops C1, frozen):** `check-inject110.mjs` (sha256/12 `61931a562308`) runs on every run before the
  calls. An arm run counts only when its gesture file's inject record shows `applied: true`, the arm's rule is in `css`, and,
  for ph/ps/pc, `heightsBefore[arm] > 0` and the child's class is among `kids` (C runs: record present with arm `none`).
  Otherwise that arm is INSUFFICIENT (never NONE), and the result reports its inject record.
- **Dropped steps (ops N1):** if the budget stop drops any steps, they run in one more exclusive hold as
  `C:H5 <dropped arms> C:H6` with the same scorer and gate, and the result says so.
- Driver fix before data: `sim-bisect110.mjs` now reads the inject record from `run.inject` (sha256/12 `f77c5e456d17`,
  replaces `93c7459a12cf`; logging only, the steps are unchanged).
- **Scorer and filters:** unchanged, `score-bisect.mjs` `cb6f0c97b81b` (LOCATES <= 0.30, PARTIAL <= 0.70, NONE, GEOMETRY > 2 px,
  replication gate, VOID at 30 % drift). One run per arm, so every call is indicative; only phone G feeds a fix.
- **Predictions:** navpain LOCATES ~80 % (the layout needs a constrained renderer other than the hero). Of nav and pain:
  nav LOCATES ~40 %, pain LOCATES ~35 %, both NONE with navpain LOCATES (needs both) ~25 %. Cost: ps (showcase) LOCATES
  or PARTIAL ~70 %; ph NONE ~75 %; pc NONE ~80 %. skp's 0.05 and the three parts together should make sense: if ps is only
  PARTIAL the cost is spread.
- **Reading.**
  - nav or pain LOCATES: that renderer is the trigger; a fix keeps it from invalidating #people (look-identical forms to be
    found; a phone G check before F).
  - ps LOCATES: the cost is the showcase subtree; `contain` / `content-visibility: auto` on it is the candidate.
  - Nothing locates in a group: the cost is not one child (replace by the next split).


## P-110 result (Simulator, one exclusive hold, 2026-10-04 ~16:40Z; ops PASS at 4329275d)

Gate first (`check-inject110.mjs` 61931a562308), then the scorer (`score-bisect.mjs` cb6f0c97b81b). All 10 steps ran
(no C:H5/C:H6 needed). Measured heights in the Simulator page: header 170, showcase 904.08, pill 84.66 px.

| run | gate | moving hero frames | median largest Layout | inStyle | docH | ratio | call |
|---|---|---|---|---|---|---|---|
| C-H1 | applied | 12 | 20.4 ms | 12 | 5999->6035 | | |
| nav-H1 | applied | 15 | 19.6 ms | 12 | 5999->6035 | 1.018 | NONE |
| pain-H1 | applied | 14 | 19.8 ms | 12 | 5999->6035 | 1.030 | NONE |
| C-H2 | applied | 15 | 18.1 ms | 13 | 5999->6035 | | |
| navpain-H1 | applied | 16 | 19.4 ms | 12 | 5999->6035 | 1.007 | NONE |
| ph-H1 | applied | 14 | 19.9 ms | 12 | 5999->6035 | 1.031 | NONE |
| C-H3 | applied | 14 | 20.4 ms | 12 | 5999->6035 | | |
| ps-H1 | applied | 45 | 0.64 ms | 3 | 5999->6035 | 0.032 | LOCATES |
| pc-H1 | applied | 14 | 19.9 ms | 11 | 5999->6035 | 0.980 | NONE |
| C-H4 | applied | 14 | 20.2 ms | 12 | 5999->6035 | | |

REPLICA true, DRIFT 0.012 (C-H1 -> C-H4), VOID false; INJECT-GATE all applied; no arm moved docH. Files: `p110-score.json`,
`p110-runs.jsonl` (served bytes, inject sha and each run's inject record).

- **Cost: the showcase.** Not rendering `.start-selling-future-showcase` (904 px, the profile deck) removes the
  toolbar-step Layout (0.032), as #people did in P-109 (0.049). Header and pill: NONE. Prediction (ps LOCATES or PARTIAL
  ~70 %) held.
- **Trigger: no single renderer.** nav, pain and nav+pain are all NONE (Simulator); P-106 `sticky` (hero only) was NONE
  on the phone, not in the Simulator (two platforms combined here); only nvc
  (hero + nav + pain together) located in P-109. Reading (OBSERVED, in our setup, mechanism UNRESOLVED): the step's layout
  happens while any viewport-constrained renderer is present, so removing a subset changes nothing. That fits S3 (every
  viewport-constrained object is marked for layout on a layout-viewport change) but S3 does not say why the showcase is laid
  out; the predictions (navpain LOCATES ~80 %) were wrong.
- **A lead, not a claim:** the `.start-selling-future-card` has `min-height: 100svh` (CSS l.3522, width <= 860px), and S5 says a
  viewport-size change invalidates every element that uses any viewport unit; the heavy Layout runs nested in style
  resolution. Whether that invalidation reaches the showcase's layout is UNRESOLVED; decisive local check: an `svh` arm that
  pins the card's min-height to its measured px (look-identical in portrait), same driver and scorer.
- Every call is indicative (one run per arm). Only a phone G run feeds F.
- **ps-H1 frame count (ops N1):** ps-H1 had 45 moving hero frames, the other runs 12-16 (cheaper steps give more frames per
  toolbar move), so its median covers a different frame set. The call does not rest on that: in-style Layouts fell from
  11-13 to 3. The phone G check reports n per run.
- Ops second read: AGREE (mgmt-ops-10, b7daeac0).

### Next (plan; needs an ops read)

- P-115 (was written P-112 here; P-112 to P-114 are int-v8's) (Simulator, same driver/gate/scorer): `svh` (card min-height pinned to px), `csl` (`contain: layout` on the
  showcase; look-identical if no descendant overflows to the card), and `cva` (`content-visibility: auto` +
  `contain-intrinsic-block-size: auto 904px` on the showcase; helps only while it is off screen). Whichever locates and is
  look-identical goes to a look check (pixel-identical rule) and a phone G check, after v8's P-111.

## Prediction P-115: candidate forms for the showcase cost (Simulator, registered before data)

Lead (message, after P-110): yes; one exclusive `--no-timing` Simulator hold, <= 10 min, after the phone work (iphone-runner
opens the gap). Mechanism and candidate screening only; a candidate that locates still needs a look check and a phone G check.

- **Hold kind (correction, no data taken):** the Simulator gestures need a normal exclusive hold, not `--no-timing` (`sim.mjs`
  refuses scroll/record/run/gesture in a no-timing hold). My first P-115 hold (2026-10-04 21:54Z) was queued `--no-timing`: all six
  steps refused, no run, no data (log kept in `out/`, gitignored); it is rerun as a normal hold with the same steps.
- **Amended before data (lead, 2026-10-04 19:2xZ): C = v8** (`fixes/v8-best`, landed 743295de; JS `3e3e94cb6e9f`, CSS
  `f836404b3728`, rebuilt here with `fix.mjs apply v8-best`, hashes checked). Nothing else changes: same arms, order, inject
  file (`0cc373b2594d`), gate (`126f46d31f3c`), scorer (`cb6f0c97b81b`) and predictions. v7 to v8 does not touch the tested
  rules: v8 CSS l.3646-3946 equals v7 l.3600-3900 line for line (offset +46), none of the 56 changed CSS lines names
  `.start-selling-future*`, `.start-selling-profile*`, `#people` or a viewport unit, and no changed JS line names the showcase,
  the profile deck, `innerHeight` or `resize` (v8's parts: countdown K + faces, accent exact, morph rev 3, the glue line).
  No P-115 data was taken on v7.
- **Question.** P-110: the toolbar-step Layout is spent in `#people .start-selling-future-showcase`. Which change that
  keeps the look removes it?
- **Arms** (all on the v8 server, CSS `f836404b3728`, JS `3e3e94cb6e9f`; applied in the page by `p115-inject.mjs`,
  sha256/12 `0cc373b2594d`, after each load and before the Timeline starts, like P-110):
  - `svh`: `.start-selling-future-card { min-height: <its own computed px> }` (replaces `100svh`, v8 CSS l.3811 (v7 l.3765), width <= 860px;
    the small viewport height is constant while the toolbar moves, so the look is the same in portrait). Tests the S5 lead.
  - `csl`: `contain: layout` on the showcase.
  - `cva`: `content-visibility: auto; contain-intrinsic-block-size: auto <its measured px>` on the showcase. Per spec,
    `auto` always turns on layout, style and paint containment and skips the contents only while the element is not
    relevant to the user (CONFIRMED, CSS Containment 2, w3.org/TR/css-contain-2/#content-visibility, value `auto`; WebKit
    assumed to follow it). So cva = csl + style and paint containment + a skip while off screen (ops C1, amended before data).
  - C = v8 with the same injection and no change.
- **Order (one hold):** C:H1 svh:H1 csl:H1 C:H2 cva:H1 C:H3. Driver `sim-bisect115.mjs` (sha256/12 `4e1077d555cd`, a copy of
  sim-bisect110 with the arm list, inject file, folder and the v8 server (state file, served hashes) changed). If the budget stop drops steps, they run in one more
  hold as `C:H4 <dropped arms> C:H5`, same scorer and gate, and the result says so.
- **Applied-arm gate (frozen, as P-110 C1):** `check-inject115.mjs` (sha256/12 `126f46d31f3c`) runs before the scorer. An arm
  counts only when `applied: true`, its rule is in `css`, and: svh, `measured.cardMinH` is a px value > 0; csl, the computed
  `contain` includes `layout`; cva, `measured.showcaseH > 0` and the computed `content-visibility` is `auto`. Otherwise
  INSUFFICIENT (never NONE), with the inject record reported. C runs need arm `none`.
- **Scorer and filters:** unchanged, `score-bisect.mjs` `cb6f0c97b81b` (LOCATES <= 0.30, PARTIAL <= 0.70, NONE, GEOMETRY > 2 px,
  replication gate, VOID at 30 % drift). Each gate line is reported next to its call, with n per run. One run per arm:
  indicative.
- **Predictions** (cva amended before data, ops C1): svh LOCATES ~35 % (NONE ~55 %). csl LOCATES ~35 %, PARTIAL ~20 %.
  cva's ratio at most csl's (+0.05 noise) ~85 %; cva LOCATES ~50 %.
- **Reading.**
  - svh LOCATES: the card's min-height viewport-unit invalidation (S5) drives it; the fix is a px min-height set once
    (resize listener for rotation); look check, then phone G. svh NONE refutes only that path (the card's min-height reaching
    the showcase), not the S5 lead as a whole (ops N1): other svh users stay, e.g. `.start-selling-future` margin-top
    `calc(1px - 100svh)` (v8 CSS l.2602; v7 l.2556; baseline l.2368), the hero and pain. Inside the showcase,
    `.start-selling-profile-shell`'s `100vh` clamp (v8 l.3308-3309; v7 l.3262-3263; baseline l.3019-3020) is overridden on phones by
    `height: auto; min-height: 0` (v8 l.3757-3774 in the phone media query at l.3673; v7 l.3711-3728 / l.3627; checked against the v8 CSS), so it is
    not a live viewport-unit user there.
  - csl and cva both LOCATE: layout containment is enough; csl is the candidate.
  - cva LOCATES and csl NONE: style or paint containment, or the off-screen skip; separate them in the next card.
  - csl, cva change the box (independent formatting context; paint containment clips overflow): any arm that locates goes to
    the pixel-identical look check before a phone G check (ops N2).
  - All NONE: the cost is inside the showcase and needs its own split (profile deck children).
  - (ops N4, before data) P-110 located the cost on v7. If C on v8 shows no toolbar-step Layout in the showcase, the result
    is NOT REPRODUCED on v8 (not NONE for the arms), and it goes to the lead before any next card.

## P-115 result (Simulator, 2026-10-04 22:11Z, one normal exclusive hold; indicative, one run per arm)

Build C = v8 (JS `3e3e94cb6e9f`, CSS `f836404b3728`; served bytes checked by the driver), inject `0cc373b2594d`, driver
`4e1077d555cd`. Data: `p115-score.json`, `p115-runs.jsonl`, `results.json` key `p115`.

- Gate: `node fixes/toolbar-resize/check-inject115.mjs out/toolbar-resize/sim115 C-H1 svh-H1 csl-H1 C-H2 cva-H1 C-H3` ->
  `INJECT-GATE all applied` (every arm applied; C runs arm none).
- Scorer: `node fixes/toolbar-resize/score-bisect.mjs out/toolbar-resize/sim115 C-H1 svh-H1 csl-H1 C-H2 cva-H1 C-H3` ->
  `REPLICA true DRIFT 0.002 VOID false`.

| run | n (toolbar-moving hero frames) | median largest Layout | in RecalcStyle | docH | ratio | call |
|---|---|---|---|---|---|---|
| C-H1 | 11 | 20.778 ms | 11 | 5999->6035 | | |
| svh-H1 | 12 | 20.465 ms | 11 | 5999->6035 | 0.973 | NONE |
| csl-H1 | 12 | 21.131 ms | 10 | 5999->6035 | 1.005 | NONE |
| C-H2 | 12 | 21.269 ms | 11 | 5999->6035 | | |
| cva-H1 | 38 | 0.757 ms | 7 | 5999->6035 | 0.036 | LOCATES |
| C-H3 | 14 | 20.738 ms | 13 | 5999->6035 | | |

- **N4:** C reproduces on v8 (20.7-21.3 ms, as on v7: P-110 C ~20 ms), so the calls stand; not NOT REPRODUCED.
- **Predictions:** svh LOCATES ~35 % (missed; NONE was ~55 %). csl LOCATES ~35 % / PARTIAL ~20 % (missed: NONE). cva ratio
  at most csl's + 0.05, ~85 % (hit: 0.036 vs 1.005). cva LOCATES ~50 % (hit).
- **Reading (card: "cva LOCATES and csl NONE"):** layout containment alone does nothing; the cost goes with style or
  paint containment, or with the skip of the showcase's contents while it is off screen. In the H flick the showcase
  sits below the viewport (hero zone, y < 3250), so the skip is the likely path, OBSERVED in our setup, cause
  unknown; the next card separates them. svh NONE: the card's own `100svh` min-height is not the path (other svh users
  stay open, ops N1).
- **Read, not judged:** cva-H1 has 38 toolbar-moving frames against 11-14 elsewhere (cheaper frames, more of them in the
  same toolbar move). The flick script's pull-to-refresh guard ended its loop early in C-H1, svh-H1, cva-H1 and C-H3
  (page near the top); every run kept >= 11 moving frames.
- **What it does not show:** look and the cost when the showcase comes into view. WebKit's content-visibility margin
  is 0 (v8 JS l.2809 comment; OBSERVED by the scroll-engine owner, not checked by me against WebKit source), so a
  skipped showcase may render on its entering frame (a cost spike or an unpainted frame) where v8 has none.

### Next (plan; needs an ops read and a P-id)

- Simulator: split cva into `cct` (`contain: content`, i.e. layout + paint + style, no skip) and `cva` again (a
  replicate), plus an entering check: a flick that brings the showcase into view (`flick-middle-v1`, the part that
  crosses #people), counting the largest Layout/Paint on the entering frames, C vs cva. cct LOCATES -> containment is
  enough and no skip is needed (safer); cct NONE -> the skip is the mechanism, and the entering check decides whether
  cva can ship as is or needs an un-skip ahead (the pattern v8's deferred sections use).
- Then a look check (pixel-identical rule) of the winning build (`p115-cands.mjs`), then the phone G kit.

### Pre-staged while P-115 waits (roles v3 R3; no data, not a ticket)

- Candidate builds on v8, CSS only, each the in-page arm as a build rule appended last inside `(width<=860px)` (no
  `!important`): `p115-csl.css` and `p115-cva.css` (cva uses P-110's 904 px as the placeholder size; `auto` keeps the
  last rendered size). `node fixes/toolbar-resize/p115-cands.mjs` builds `fixes/toolbar-resize--p115-{csl,cva}/overlay`
  (gitignored) from the v8 overlay and refuses another v8: csl JS `3e3e94cb6e9f` CSS `010f197b09d0`, cva JS `3e3e94cb6e9f`
  CSS `cade62fb4bd2`. svh needs JS (pin at load and on width change), so it is built only if it is the one that locates.
- Phone G kit draft `phone/serve.sh` and `phone/hold.sh` (copies of int-v8's P-114 kit, with credit): C = v8, V = v8 +
  the chosen candidate (`ARM=csl|cva sh phone/serve.sh snap`), G part H with a Timeline per run, so `score-tr.mjs`'s
  frozen filters apply. It becomes a ticket only after P-115 names a locating, look-identical candidate: then the look
  check, the scorer card with the run order, and a P-id from ops.

## Prediction P-119: containment vs skip, plus the entering check (Simulator, registered before data)

P-id from mgmt-ops-10 (P-115 read AGREE; pre-data notes R1-R7 answered below). Attribution, Simulator only; one normal
exclusive hold. Nothing here drives a build (R7).

- **Question.** P-115: `content-visibility: auto` on the showcase removes the toolbar-step Layout; `contain: layout` does
  not. Is containment enough (`contain: content` = layout + paint + style, no skip), or is skipping the off-screen showcase
  the mechanism? And what does cva cost when the showcase comes into view?
- **Build:** C = v8 (JS `3e3e94cb6e9f`, CSS `f836404b3728`; served bytes checked by the driver, exit 26 on a mismatch).
- **Arms** (applied in the page by `p119-inject.mjs`, sha256/12 `ce37284b199d`, after each load and before the Timeline
  starts, as P-110/P-115):
  - `cct`: `contain: content` on `#people .start-selling-future-card > .start-selling-future-showcase` (R1).
  - `cva`: P-115's rule unchanged, `content-visibility: auto; contain-intrinsic-block-size: auto <its height measured in
    the same page just before>px` (R2).
  - C: the same injection and no rule.
  - Every arm, C included, also gets an IntersectionObserver on the showcase (root = viewport, rootMargin 0, threshold 0)
    that logs `[time, in, top, bottom, rootH]` per entry (the crossing record), and the look gate's structural probe,
    taken before the arm rule. The observer runs JS only on a crossing (a few per run) and is the same in every arm.
- **Order (one normal exclusive hold, `--max-seconds 600`, `SB_BUDGET_S=520`):**
  C:H1 cct:H1 C:H2 cva:H1 C:H3 cva:H2 C:H4 cct:H2 C:H5. That is two replicates per arm, five C runs, mirrored. About 9 x 33 s
  plus ~60 s setup (P-115 took 33-34 s per run). Driver `sim-bisect119.mjs` (sha256/12 `c57654440d01`, a copy of
  sim-bisect115 with the arm list, inject file, folder `out/toolbar-resize/sim119` and labels changed). It uses the same
  gesture script, flick-hero-v1 (`6ae05e12ace9`, now committed as `fixes/toolbar-resize/flick-hero-v1.json`). If the
  budget stop drops steps, they run in one more normal hold as `C:H6 <dropped arms> C:H7`, same gate and scorer, and the
  result says so.
- **Hold kind:** normal exclusive chrome-measure hold (`sim.mjs` refuses gestures in `--no-timing` holds and in the
  shared lane; P-115's correction).
- **Applied-arm gate** (`check-inject119.mjs`, sha256/12 `b280e6d5b930`, runs before the scorer). Each run, else INSUFFICIENT
  (never NONE):
  - every run: an IO record with >= 1 entry;
  - C: arm none, no rule;
  - cct: the rule is applied and the computed `contain` is `content` or names layout, paint and style;
  - cva: the rule is applied, the measured height is > 0, and the computed `content-visibility` is `auto`.
- **Look gate (R1).** Paint containment clips overflow, makes the box the containing block for fixed and absolute
  descendants, and (with layout containment) a stacking context. Style containment scopes counters. Layout containment
  stops margin collapse through the box and drops its baseline. The probe counts exactly those risks before the rule is
  applied:
  - descendants outside the box (unless it already clips overflow);
  - fixed descendants;
  - absolute descendants whose containing block is outside the box;
  - positioned z-index descendants when the box is not already a stacking context;
  - counters;
  - child margins that collapse through its top or bottom edge;
  - shadow, filter or outline descendants within 32 px of an edge;
  - baseline alignment in the parent.

  `LOOK-GATE clean` means none of these exist, so the rule cannot change the static look by those paths. Otherwise the gate
  reads `LOOK-RISK` with the flags, and cct's and cva's calls are mechanism only (no candidate) until a pixel check. In
  every case the pixel-identical check (PR-010: Chrome + Simulator with a true A/A) comes before any build (F), and the
  probe does not see motion. A Chrome look pre-check (`probe-look119.mjs`, shared lane, no timing: probe plus screenshots
  at 3 stops, none vs none2 / cct / cva) is queued. Its result is read before the hold if it arrives first; it is not a gate.
- **Scorer** `score-p119.mjs` (sha256/12 `265d0c827b5f`). Self-test `p119-selftest.mjs` (`70b127f955d8`): `SELFTEST PASS`
  on a fixture built from P-115's runs with synthetic crossing logs. It checks event count and direction, update match,
  window maxima, catch-up k and medians, and that the primary block equals score-bisect's own output. Frozen sections:
  1. **Primary, unchanged:** `score-bisect.mjs` `cb6f0c97b81b` on the same runs (LOCATES <= 0.30, PARTIAL <= 0.70, NONE;
     GEOMETRY > 2 px; replication gate; VOID at > 30 % C drift). An arm's call is the common call of its two replicates,
     else SPLIT (no call).
  2. **Secondary (R5):** Layout ms per second of toolbar motion on the primary's frames. It sums the outermost Layout
     records and divides by summed dt, so it does not depend on how many frames the move was cut into. The ratio is
     banded like the primary. A run whose band differs from its primary call is N-SENSITIVE.
  3. **Mid-page** (registered from a post-hoc read of P-115's data, see below): frames with the toolbar still, y >= 3000,
     scrolling; count of frames whose largest Layout >= 10 ms. vs neighbouring C: MID-REMOVES <= 0.2x, MID-SAME >= 0.7x,
     else MID-PARTIAL; MID-THIN when the C mean < 5.
  4. **Entering (R3):**
     - **Window by crossing, not y:** an enter event is an IO entry that turns intersecting (the showcase's edge crosses
       the viewport edge: the same test as WebKit's own content-visibility observer, see R4). It counts down (enters at
       the bottom) or up.
     - **Updates are the Timeline's RenderingFrame records.** U_E is the update whose start lies within 2 ms of the
       entry's time (else the last one starting before it). The window is updates E-1 .. E+2.
     - **Metric:** the window's largest Layout and largest Paint. Per run, the medians over its events.
     - **Unpainted proxy:** the catch-up k is the first update in E..E+2 with a Layout >= 5 ms. UNPAINTED-PROXY counts
       events with k >= 1, i.e. the showcase's big Layout lands after the update that first saw it intersect. It is a
       proxy, since the Timeline cannot see pixels. Read for cva only, because C and cct relayout the showcase anyway.
     - **C replicates (R3):** five C runs. Each arm run is compared with the mean of its two neighbouring C runs.
     - **Falsification line (frozen):** cva is ENTER-COST when its entering Layout (or Paint) is >= 1.5x C's and
       >= 8 ms above it. It is ENTER-OK when both are <= 1.2x C's or within 4 ms. Anything else is ENTER-UNCLEAR, and
       ENTER-THIN applies when a run has < 2 events. ENTER-COST, or UNPAINTED-PROXY >= 1 in both cva runs, falsifies
       "cva as is enters for free".
- **R4, WebKit's content-visibility margin: CONFIRMED for WebKit main, UNRESOLVED for the shipped iOS 26.5 WebKit.**
  - Source: WebKit main [`6cf979a79f7b`](https://github.com/WebKit/WebKit/tree/6cf979a79f7bb78c0635ff43f02282d78137583e),
    fetched read-only with `gh api` on 2026-10-05. The file last changed in `ce1fa925b83a`, 2026-09-26.
  - The content-visibility observer is created with `IntersectionObserver::Init options { document, { }, { }, { } }`,
    i.e. an empty rootMargin, scrollMargin and threshold
    ([ContentVisibilityDocumentState.cpp l.105-117](https://github.com/WebKit/WebKit/blob/6cf979a79f7bb78c0635ff43f02282d78137583e/Source/WebCore/dom/ContentVisibilityDocumentState.cpp#L105-L117);
    field order in [IntersectionObserver.h l.75-80](https://github.com/WebKit/WebKit/blob/6cf979a79f7bb78c0635ff43f02282d78137583e/Source/WebCore/page/IntersectionObserver.h#L75-L80)).
  - An empty margin parses to 0
    ([IntersectionObserver.cpp l.88-89](https://github.com/WebKit/WebKit/blob/6cf979a79f7bb78c0635ff43f02282d78137583e/Source/WebCore/page/IntersectionObserver.cpp#L88-L89)),
    and an empty threshold to 0 (l.163-164). So: margin 0, threshold 0.
  - Timing, from the same source: a crossing found by the observer reaches `updateViewportProximity`, which calls
    `scheduleContentRelevancyUpdate` (CVDS l.249-259, l.69-77; Document.cpp l.12284-12290).
  - In `Page::updateRendering`, `UpdateContentRelevancy` (l.2562) runs before `IntersectionObservations` (l.2570)
    ([Page.cpp](https://github.com/WebKit/WebKit/blob/6cf979a79f7bb78c0635ff43f02282d78137583e/Source/WebCore/page/Page.cpp#L2562-L2572)).
  - So a showcase that starts to intersect in update N is un-skipped and laid out in update N+1 at the earliest, and
    update N shows its box without content.
  - The decisive local check for the shipped WebKit is P-119's catch-up k on cva's enter events.
- **R5, runs with different moving-frame counts (cva had 38 vs 11-14).**
  - When frames get cheaper, the same toolbar move is cut into more, shorter frames. So n follows the cost; it is not a
    filter artefact.
  - The primary is a per-frame median, so it is not biased by n while n >= 8 (its gate), but it weights a frame, not a
    millisecond.
  - The secondary weights milliseconds and does not depend on n. Both are reported per run with n.
  - When they disagree (N-SENSITIVE), no gain is read from either. The call says "per frame X, per second of motion Y",
    and the phone G check decides.
  - The scorer's self-test on P-115's data (post hoc) already gives cva-H1 secondary 0.41 (PARTIAL) against primary 0.036.
    4 of its 38 moving frames (y 660-1653, the showcase in view, so cva cannot skip it) still pay ~20 ms, and they take
    371 of the 995 ms of toolbar motion. C-H2: 11 of 12 frames pay it.
- **Predictions** (before data; mine; leans missed in P-110 and P-115):
  - Primary: cct NONE ~60 %, PARTIAL ~15 %, LOCATES ~25 %. cva LOCATES in both replicates ~85 %.
  - Secondary: cva N-SENSITIVE in at least one replicate ~60 %. This is informed by the post-hoc self-test numbers above.
  - Mid-page: cva MID-REMOVES ~70 %; cct MID-SAME ~55 %.
  - Entering: cva ENTER-OK ~50 %, ENTER-UNCLEAR ~30 %, ENTER-COST ~20 %. C already pays ~20 ms per frame while the showcase
    is in view, and cva's catch-up Layout should be about that size.
  - Unpainted proxy: cva has >= 1 event with k >= 1 in each run ~65 % (the source order above).
  - Look gate: clean ~50 % (the probe has not run yet).
- **Model, for the lead's review (R6/R7).**
  - What is known: the toolbar-step Layout is nested in RecalculateStyles (D, S8). It is spent in the showcase (P-110).
    Layout containment on the showcase does not remove it (P-115 csl). The off-screen skip does (P-115 cva). D's block
    already showed that dvh and the deck's query containers change only where or whether style runs, not this Layout.
  - My model (M1): the showcase's relayout starts from an invalidation that containment does not block. Either it starts
    inside the box (a style change of its own descendants, e.g. a viewport-unit value, S5) or it arrives as an inherited
    style change from an ancestor.
  - Skipping removes M1's cost because the skipped subtree's style and layout are not updated while it is skipped. That
    is the spec's intent (CSS Containment 2: a skipped element's contents are not rendered); that WebKit skips the style
    work too is OBSERVED via P-115.
  - So M1 predicts cct NONE, and it fits csl NONE.
  - M2: the invalidation enters through the box from outside (its size or position), and paint or style containment stops
    it. M2 predicts cct LOCATES. csl NONE already argues against the layout-only form.
  - The mid-page cost (C pays big Layouts at y >= 3000 with the toolbar still; cva did not in P-115) says something on
    scroll frames, not only the toolbar, also re-lays out the showcase whenever it is laid out at all. That is OBSERVED,
    cause unknown, and touches fix-scroll-cb (finding posted).
- **Reading.**
  - cct LOCATES (both runs), look gate clean: containment is enough, with no skip and no blank risk. cct is the candidate:
    pixel check (Chrome + Simulator A/A), then R7, then the phone G kit.
  - cct NONE, cva LOCATES: the skip is the mechanism.
    - With ENTER-OK and UNPAINTED-PROXY 0, cva as is is the candidate: pixel check, then R7, then phone G.
    - With UNPAINTED-PROXY >= 1 or ENTER-COST, cva needs an un-skip ahead (the pattern of v8's deferred sections). That
      un-skip margin must be smaller than the gap between the viewport bottom and the showcase's top at the top of the
      page (`gapAtTop`, measured in every run), or the skip is off during the toolbar steps and the gain goes. That makes
      it a design card (next P-id), not a build.
  - cct PARTIAL: both contribute; the next card splits paint (`contain: paint`) and style (`contain: style`).
  - Any SPLIT: no call; the arm runs again in one more hold. N-SENSITIVE: both numbers reported, no gain claimed.
  - GEOMETRY, NO-REPLICA or VOID: as in score-bisect; no call.
- **Gate R7 (lead's instruction, via ops):** lead model review (two-miss rule): after the P-119 read and before cva or cct
  drives any build, the lead reviews the author's model.

## P-119 result (Simulator, 2026-10-05 00:13-00:19Z, one normal exclusive hold; ops pre-data PASS with N1-N4)

- **Hold.** One normal exclusive chrome-measure hold; `sim.mjs session` (Simulator iPhone 15 Pro Max) on the v8 server.
  - Served build: JS `3e3e94cb6e9f`, CSS `f836404b3728` (from the overlay; checked by the driver).
  - Inject `ce37284b199d`. Order as registered: C:H1 cct:H1 C:H2 cva:H1 C:H3 cva:H2 C:H4 cct:H2 C:H5. All 9 runs ran;
    none was dropped. The first run started at 00:13:49Z, after the split helper's pin (b090aa1b, 22:49:14Z).
  - All pins are unchanged: scorer `265d0c827b5f`, gate `b280e6d5b930`, driver `c57654440d01`, split `1ad22b858eb8`.
  - Simulator background: mean 41 % of a core, 13 of 34 windows above 60 %. Every arm is compared with neighbouring
    C runs in the same session.
  - The gesture's pull-to-refresh guard ended the loop early in 5 runs (C-H3, cva-H2, C-H4, cct-H2, C-H5). Every run
    still has one segment of 1053-1302 frames reaching y 4033-4131, so coverage is the same in every arm.
- **Applied gate:** `INJECT-GATE all applied`.
  - C: no rule, computed contain none, cv visible.
  - cct: contain `content`.
  - cva: content-visibility auto, intrinsic size 904.08 px.
  - Every run has 9 IO entries. docH is 5999 -> 6035 in every run.
- **Look gate (R1): `LOOK-RISK`**, the same in every run because it is the same DOM. The showcase is `display: flex`,
  overflow visible, and already a stacking context.
  - 81 descendants paint outside its box, mostly the profile tabs rail: `div.start-selling-profile-tabs.is-rail-in`
    and its buttons.
  - 8 ink sources sit near its edges: box-shadow on `div.start-selling-profile-shell` and the active tab button.
  - 8 positioned z-index descendants. These are harmless here, since the box is already a stacking context.
  - No fixed descendants, no absolute descendants with an outside containing block, no counters, no margin collapse,
    no baseline alignment.
  - **This applies to cva too, not only cct.** `content-visibility: auto` always turns on layout, style and paint
    containment; it only adds the skip when the element is not relevant. CONFIRMED by
    [MDN content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility), value `auto`:
    "The element turns on layout containment, style containment, and paint containment"; CSS Containment 2 §4.3
    "Using content-visibility: auto".
  - So both forms may clip the rail and the shadows, and **neither call is look-clean**. Under the card's rule both
    are mechanism-only until a pixel check.

| run | arm | moving frames n | median largest Layout (ms) | primary ratio | secondary (Layout ms/s), ratio | mid big / frames | enter L / P (ms) | unpainted proxy |
|---|---|---|---|---|---|---|---|---|
| C-H1 | C | 15 | 21.685 | | 791.7 | 9/173 | 22.79 / 4.91 | 0 |
| cct-H1 | cct | 13 | 21.449 | 1.013 NONE | 832.8, 1.027 NONE | 12/236, MID-SAME 1.2 | 21.89 / 1.80, ENTER-OK | 0 |
| C-H2 | C | 13 | 20.666 | | 829.4 | 11/234 | 22.21 / 1.47 | 0 |
| cva-H1 | cva | 34 | 0.770 | 0.037 LOCATES | 274.5, 0.331 PARTIAL (N-SENSITIVE) | 0/249, MID-REMOVES | 22.60 / 3.51, ENTER-OK | 0 |
| C-H3 | C | 15 | 20.850 | | 827.4 | 11/238 | 20.88 / 0.86 | 0 |
| cva-H2 | cva | 34 | 0.736 | 0.036 LOCATES | 346.8, 0.419 PARTIAL (N-SENSITIVE) | 0/245, MID-REMOVES | 21.76 / 3.21, ENTER-OK | 2 |
| C-H4 | C | 14 | 20.316 | | 829.8 | 10/244 | 22.07 / 1.55 | 0 |
| cct-H2 | cct | 15 | 20.474 | 0.988 NONE | 831.6, 1.002 NONE | 15/232, MID-SAME 1.5 | 20.86 / 1.06, ENTER-OK | 0 |
| C-H5 | C | 12 | 21.150 | | 829.5 | 10/242 | 21.48 / 1.41 | 0 |

Scorer summary: REPLICA true, DRIFT 0.025, VOID false.

- **Arm calls (frozen scorer).**
  - **cct:** primary NONE in both runs; MID-SAME; ENTER-OK; unpainted proxy 0/4 in both runs.
  - **cva:** primary LOCATES in both runs, but N-SENSITIVE (secondary 0.33 and 0.42, PARTIAL); MID-REMOVES; ENTER-OK;
    unpainted proxy 0/4 and 2/4.
- **N1, frames split by the showcase's IO state** (split-io119.mjs, descriptive only, no call). Ratios are against the
  neighbouring C runs.

| run | in view: n, median largest Layout (ratio), ms/s (ratio) | off screen: n, median largest Layout (ratio), ms/s (ratio) |
|---|---|---|
| cct-H1 | 5, 21.45 (0.99), 801 (0.97) | 8, 20.71 (0.99), 864 (1.08) |
| cct-H2 | 5, 21.26 (1.03), 842 (1.04) | 10, 20.46 (0.99), 824 (0.97) |
| cva-H1 | 4, 20.32 (0.97), 785 (0.96) | 30, 0.75 (0.036), 52 (0.062) |
| cva-H2 | 5, 21.95 (1.06), 758 (0.93) | 29, 0.70 (0.034), 47 (0.056) |

  - C runs: 4-6 frames in view, 7-11 off screen, about 21 ms in both groups.
  - Read: **the skip is the whole mechanism, and only for off-screen frames.** Off screen, cva removes about 96 % of
    the cost per frame and about 94 % per second.
  - In view, cva pays the same about 21 ms per toolbar-moving frame as C (ratios 0.93-1.06), on 4-5 such frames per
    run. This is what makes cva N-SENSITIVE: the per-frame median is set by the many cheap off-screen frames, while the
    remaining in-view frames carry about 0.33-0.42 of C's Layout time per second of toolbar motion.
  - cct changes neither group.
- **N2, C level against P-115.** P-119's C median largest Layout is 20.32-21.69 ms (mean 20.94); P-115's was
  20.74-21.27 (mean 20.93). The IntersectionObserver that P-119 adds in every arm did not move the C level. This is a
  read; the ratios above compare only within P-119.
- **N3, mid-page.** This is the first confirmation from data registered before the run.
  - C pays 9-11 big (>= 10 ms) Layouts on toolbar-still scroll frames at y >= 3000.
  - cva pays 0 in both runs (MID-REMOVES).
  - cct pays 12 and 15 (MID-SAME, ratio 1.2 and 1.5).
  - What re-lays out the showcase on those frames is still OBSERVED, cause unknown (F-254).
- **N4, entering.**
  - Every run had 4 enter events (2 down, 2 up), so there is no ENTER-THIN and the flick-hero events are enough.
  - 29 of the 36 events matched an update only "approx": the IO entry time was not within 2 ms of a RenderingFrame
    start, so the last update starting <= T + 2 ms was used. This is the frozen fallback, and it applies alike in
    every arm.
  - cva's entering Layout (about 22 ms) equals C's (about 21.5 ms), and its Paint is 3.2-3.5 ms against C's 1.2 ms:
    ENTER-OK under the frozen line (the Paint difference is under 4 ms).
  - Catch-up k = 1 in 2 of cva-H2's 4 events. That is the unpainted proxy: the big Layout lands one update after the
    update that first saw the showcase intersect.
  - So the shipped Simulator WebKit shows the one-update lag that the WebKit-main source order predicts in 2 of 8 cva
    events. R4's UNRESOLVED moves to OBSERVED in our setup: present, not in every event.
- **Falsification line.** It needed ENTER-COST, or an unpainted proxy >= 1 in *both* cva runs. Neither happened (0 and
  2), so "cva as is enters for free" is not falsified. But under the card's Reading, an unpainted proxy >= 1 in any
  run sends cva to the "needs an un-skip ahead" branch.
- **Predictions, scored.** 6 hits, 2 misses:

| prediction | result | hit |
|---|---|---|
| cct NONE (60 %) | NONE, both runs | yes |
| cva LOCATES in both runs (85 %) | LOCATES, both runs | yes |
| cva N-SENSITIVE in >= 1 run (60 %) | both runs | yes |
| cva MID-REMOVES (70 %) | yes | yes |
| cct MID-SAME (55 %) | yes | yes |
| cva ENTER-OK (50 %) | yes | yes |
| unpainted proxy >= 1 in each cva run (65 %) | 0 and 2 | no |
| look gate clean (50 %) | LOOK-RISK | no |

- **Model (R6/R7).**
  - M2 (the invalidation enters from outside and containment stops it) is REFUTED for cct in this setup: NONE in both
    runs, in view and off screen.
  - M1 (the invalidation starts inside the box or arrives as inherited style, and only the skip avoids it) fits every
    arm. M1 is OBSERVED (in our setup, cause unknown): it rests on our Simulator runs only, and no reference names the
    trigger yet. The lead accepted it as the working model (R7 review, 2026-10-05); P-123 tests it. With N1, it also fits the in-view frames: while the showcase is relevant, nothing we tried avoids its about
    21 ms relayout.
  - What starts the relayout inside the box is not yet identified. D's S5 (a viewport-dependent value inside the
    showcase) is the open lead.
  - Per R7, no build starts until the lead has reviewed this model.
- **Reading (as registered).** The result lands in the branch "cct NONE, cva LOCATES: the skip is the mechanism", with
  an unpainted proxy >= 1 in one run. It adds two things the card's Reading did not price in:
  1. **LOOK-RISK applies to cva's paint containment as well.** A pixel check (Chrome + Simulator A/A, PR-010 T2
     numbers) must clear cva as is before any build, and probably fails at the rail and the shadows. A look-safe cva
     needs room for that overflow: a wrapper that contains the overflow, or padding or `overflow-clip-margin`, a design
     question.
  2. **N1 caps the gain.** The skip removes the cost only while the showcase is off screen. Toolbar steps with the
     showcase in view (y about 395-2070 at the top; `gapAtTop` 394.98 px) still pay about 21 ms per frame.
  - An un-skip margin ahead of the viewport (for the unpainted proxy) must stay smaller than `gapAtTop`, or the skip is
    off during the top-of-page toolbar steps and the off-screen gain goes as well.
- **Next (plan; needs the lead's R7 review, an ops read and a P-id):**
  1. A pixel check of cva as is and cct (Chrome look pre-check, then a Simulator A/A), to size the look risk. It is a
     read, not a gate for anything else.
  2. A design card for a look-safe skip with a small un-skip margin.
  3. A separate question, for the in-view frames: what inside the showcase reacts to the toolbar step (M1, D's S5).
     This is the only route to the remaining about 21 ms frames.
- **Files:** `fixes/toolbar-resize/p119-score.json` (scorer output), `p119-split.json` (N1 split),
  `p119-runs.jsonl` (driver log, served-hash records). `results.json` key `p119`.

## Prediction P-123: what inside the showcase reacts to a toolbar step (D's S5; count-only, registered before data)

P-id: P-123 (lead's R7 review names it as the next free id; ops confirms it with the pre-data read).

- **Question.** On a toolbar step (innerHeight 775 <-> 815), which value or read inside
  `#people .start-selling-future-card > .start-selling-future-showcase` changes, or what starts its ~21 ms in-view
  relayout? This is step 3 of the R7 review, run first.
- **Why these four reads.**
  - S5 (WebKit source, CONFIRMED above): on a viewport size change, WebKit re-resolves the style of every element whose
    style uses any viewport unit, whether or not the value changes.
  - S7/S8 (CONFIRMED above): a Layout nested inside RecalculateStyles is the interleaved layout. It runs only for an
    unresolved query container or an anchor-positioned element.
  - So the probe lists:
    1. the box's viewport-unit elements;
    2. the values that really flip;
    3. script writes in step frames;
    4. query containers and anchors in and above the box.
- **Design.** COUNT-ONLY. Simulator, `sim.mjs gesture --count-only` (I-184) in a functional session, in a shared
  slot (weight simulator, `--max-seconds 300`). One arm: the v8 build as served, no rule. Two runs (R1, R2) of
  `flick-hero-v1`, the P-115/P-119 script. No Timeline and no time values: frame indices and counts only.
  `p123-inject.mjs` records, per run:
  1. **audit** (at install): the CSS rules that match the box (the showcase and its descendants, 316 elements in
     P-119) or its ancestors and use a viewport unit (`[sld]?v(h|w|i|b|min|max)`) or `env()`. It also lists inline
     styles with such units, custom properties holding one, running animations whose keyframes hold one, and query
     containers or anchors (`container-type` other than normal, `anchor-name`, `position-anchor`).
  2. **values**: full computed-style snapshots of the same elements at five points:
     - A: at load (ih0);
     - A2: still at ih0, at least 30 frames later and before any step (the no-step noise control);
     - B: first new innerHeight of at least ih0 + 20, held 3 frames;
     - C: back at ih0, held 3 frames;
     - B2: high again.

     A property flips with the toolbar when A == A2 == C, B == B2 and A != B. If B2 is missing, C == A is enough
     (partial flip).
  3. **writes**: MutationObserver records (attributes, with style diffs per property, and childList) on the box,
     inside it, or on its ancestors. Each record counts as "step" when innerHeight changed since the last rAF, else
     "rest".
  4. **sizes**: ResizeObserver entries on the box, its children and its two nearest ancestors, split the same way.
- **Validity (per run; else INSUFFICIENT).** Both must hold:
  - the inject installed without an error, and snapshots A, B and C were taken;
  - at least 2 toolbar steps were seen, with ihMax - ihMin >= 20.
- **Call per run** (`read-p123.mjs`, frozen; the first rule that matches wins):

  | call | rule |
  |---|---|
  | VALUE-FLIP | at least one ATTRIBUTED property of an element in the box flips (T3 below) |
  | WRITE | no attributed flip, and at least one STEP-SPECIFIC write key on or in the box (T2 below) |
  | INVAL-ONLY | no flip, no step write, and at least one element in the box matches a viewport-unit rule (the S5 set; values unchanged) |
  | OUTSIDE | none of these |

  - **Ops pre-data conditions (mgmt-ops-10, 2026-10-05), frozen before data:**
    - **T1, list cap.** Flips are counted over every element:property. Only the other rows are capped (300 printed).
      A flip list over its own cap (2000) makes the run INSUFFICIENT.
    - **T2, step-specific writes.** A write key (target, attribute, style property) is step-specific when it has
      at least 2 records in step frames and either none in rest frames, or a per-step-frame rate at least 2x its
      per-rest-frame rate. Step and rest frame counts are printed. A write seen in every frame (carousel,
      countdown) is not step-specific.
    - **T3, scroll confound, rule (a).** A flip counts only when its element:property is in the audit's
      viewport-unit set, or when the element inherits it from an ancestor that is (same value as that ancestor at
      A and at B). The set is: own matched rule, inline style, or a var() of a viewport-unit custom property;
      logical aliases and shorthand prefixes count. Every other flip is listed as "scroll-confounded or
      layout-derived" and never decides the call.
    - Ops' note (UNRESOLVED in our setup; the probe answers it): on iOS, vh is the large viewport and svh the
      small one, so neither should flip. Only dvh or script values can flip.
  - Probe call: the two runs agree. For VALUE-FLIP, their flipping element:property sets must also overlap. Else
    the call is SPLIT.
  - Ancestor flips, writes and sizes are always listed but never decide the call.
- **Predictions (before data).**

  | # | prediction | p |
  |---|---|---|
  | 1 | at least one element in the box uses a viewport unit (e.g. `.start-selling-profile-shell` height `clamp(743px, 100vh - 80px, 820px)`, `.start-selling-future-card` min-height `100svh`, an ancestor) | 85 % |
  | 2 | probe call VALUE-FLIP | 35 % |
  | 2 | INVAL-ONLY | 40 % |
  | 2 | WRITE | 15 % (ops' result read: T2 passes any key with 2-3 step records against ~1000 rest frames, so WRITE means coincident with steps, not caused by them) |
  | 2 | OUTSIDE | 10 % |
  | 3 | at least one query container or anchor in the box or among its ancestors (S7/S8's interleaved layout needs one) | 60 % |
  | 4 | ResizeObserver: the showcase's own height does not change on a step (its 904 px is not viewport-bound) | 70 % |
  | 5 | A2 noise > 0 (carousel and countdown write every frame), so the A2 control matters | 80 % |

- **What falsifies M1 (OBSERVED).** OUTSIDE, with no ancestor flip of an inherited property and no step write on an
  ancestor. Nothing in or above the box would then react to the step, and the in-view relayout would need a cause
  that is neither in the box nor inherited. M1 is then dropped, and the next read is the S3 path (viewport-constrained
  renderers), which cct did not block.
- **Reading.**
  - VALUE-FLIP names the value: the fix is to pin that value (e.g. an svh or px form), checked pixel-identical.
  - WRITE names the script: the fix is to skip the write when unchanged.
  - INVAL-ONLY with a query container in the box: the fix candidates are to take the viewport unit off the
    container's subtree, or to resolve the container's size without the unit.
  - INVAL-ONLY without one: re-resolved style should give an equal style and no layout. The cost is then unexplained
    by S5 alone, and the D card stays open on it.
- **Pins (sha256/12).**

  | file | hash |
  |---|---|
  | `p123-inject.mjs` | 9849c25577b9 |
  | `sim-p123.mjs` | 787e8e69b75e |
  | `read-p123.mjs` | aa8c9896dc68 |
  | `p123-selftest.mjs` | e7cf99d230a3 |
  | `flick-hero-v1.json` | 6ae05e12ace9 |

  - Served bytes (v8): CSS f836404b3728, JS 3e3e94cb6e9f, from the overlay. The driver stops (exit 26) otherwise.
  - Self-test: `node fixes/toolbar-resize/p123-selftest.mjs` gives SELFTEST PASS (18 checks). It covers T1 (flips
    counted past 400 noise rows; over the cap is INSUFFICIENT), T2 (an every-frame write is not step-specific, a
    step-only one is), T3 (own and inherited attribution; an unattributed transform flip is confounded), the reader's
    calls, and no time fields. Rev 1 pins (501b0261da31 / 2a32093959f3 / f9098cfaec1e, commit 1dc26faa) are
    superseded.
- **Slot.** One shared slot (weight simulator, 300 s, functional session). Free slots only, never ahead of int-v8 or
  fix-hero-exit-threaded (lead R7).
  - Command: in `sim-p123.mjs`'s header.
  - Output: `out/toolbar-resize/sim123/`, then the read is committed as `p123-read.json`.

## P-123 result (Simulator, count-only, 2026-10-05 ~00:58-01:02Z; one shared slot, functional session)

The lead signed rev 2 (443bafa1) after ops' final pre-data read PASS (T1-T3). The run used the v8 build as served
(CSS f836404b3728, JS 3e3e94cb6e9f, from the overlay) with inject 9849c25577b9. Both runs are valid. In R1 the
pull-to-refresh guard ended one loop early, but the run still saw 30 toolbar steps. Read: `p123-read.json`
(`read-p123.mjs`).

**Probe call: WRITE** (both runs agree). The reading is OBSERVED, in our setup.

| run | frames (step / rest) | ih | attributed flips in the box | other flips (confounded) | A2 noise | step-specific write keys (box+in / anc) | ResizeObserver (step / rest) |
|---|---|---|---|---|---|---|---|
| R1 | 30 / 1260 | 775-815 | 0 | 3 (`will-change`) | 1 | 3 / 4 | 0 / 0 |
| R2 | 29 / 999 | 775-815 | 0 | 0 | 15 | 3 / 4 | 0 / 0 |

- **Values.** No property in or above the box flips with the toolbar (0 attributed flips).
  - The audit finds 6 viewport-unit elements in the box, all `.start-selling-profile-shell`, plus 2 ancestors.
  - Their matched rule is `height` and `min-height: clamp(743px, 100vh - 80px, 820px)` (v8 CSS l.3308-3309).
  - **Correction (2026-10-05, before P-125, no new data).** The audit lists *matched* rules, not cascade winners.
    On the phone the rule loses: the phone media query (v8 CSS l.3673) sets `height: auto; min-height: 0` on the
    same elements (l.3757-3774, with `aspect-ratio: 353/764`; P-115's card already noted this). So the shells'
    used height does not depend on vh at all, and the earlier line "the clamp pins both values to 743 px" was wrong.
    Read correctly, no element in the box has a live viewport-unit value; the 6 hits are overridden declarations.
  - Whether WebKit's S5 re-resolution still covers an element whose only viewport-unit declaration lost the
    cascade is UNRESOLVED (no source read yet; the decisive reference is where WebKit's style builder sets the
    "uses viewport units" flag: while converting the applied value, or for every matched declaration).
  - Either way, no value changes. The run does not answer ops' vh/svh note (no live vh user in the box); it
    stays UNRESOLVED.
  - There are no query containers or anchors in or above the box (prediction 3 missed). S7/S8's interleaved layout
    therefore cannot start inside the box.
- **Sizes.** The showcase, its children and its two nearest ancestors never change size (0 ResizeObserver entries),
  as prediction 4 said.
- **Writes (the call).** The step-specific write keys all come from IntersectionObserver-driven state:
  - `data-fw-wc` on the two live `.start-selling-profile-shell`s (in the box; 2-3 step records against 7-8 rest
    records per run, over about 30 step frames and 1000-1260 rest frames) and on `.start-selling-future-card`
    (an ancestor);
  - `data-start-selling-scene` on `#profile-showcase`;
  - `data-start-selling-render`, the `is-visible` class and `data-start-selling-scene` on `#people`.
- **Candidate trigger (OBSERVED; not yet tested).** `data-fw-wc` is the v8 will-change window (scroll-engine /10,
  JS l.2730-2748): an IntersectionObserver with `rootMargin: 50% 0px 50% 0px` toggles
  `[data-fw-wc="0"] { will-change: auto }`.
  - A percentage root margin follows the viewport height, so a toolbar step moves the window edge by 20 px at
    each end. A step can therefore flip `will-change: transform` on the profile shells and the card. R1's three
    confounded flips are exactly that toggle.
  - Toggling `will-change: transform` changes whether the element makes a stacking context and a containing
    block. Whether WebKit relayouts the box for that is UNRESOLVED (no reference read yet).
  - The counts are small: 2-3 step writes per run in the box, against the 4-5 in-view ~21 ms frames per run in
    P-119. At most it explains part of the cost, and part of its step association may be scroll (T2's rule
    measures rates, not cause).
- **Predictions, scored: 3 of 5** (ops' result read, mgmt-ops-10, 2026-10-05; corrected from "4 of 5").
  - Hits: 1 (viewport-unit elements in the box: 6), 4 (no size change), 5 (A2 noise above 0).
  - Misses: 2 and 3. Prediction 2 was a spread over four calls whose lean was INVAL-ONLY (40 %); WRITE had 15 %.
    The lean missed, so WRITE coming out is not a hit. 3: no query containers or anchors.
  - R7: the call lean has now missed in P-110, P-115, P-119 and P-123, so the lead's model review gates the next card.
- **Caveat (ops, also in the predictions row).** A run has about 30 step frames against 1000-1260 rest frames. With
  that split, T2's frozen rule (>= 2 step records and >= 2x the rest rate) passes any key with 2-3 step records. So
  WRITE shows writes that happen at the same time as steps, not writes the steps cause. The mechanism (the 50 %
  rootMargin window moving 20 px per step) is OBSERVED and untested, and at 2-3 step writes per run it can explain at
  most part of P-119's 4-5 in-view ~21 ms frames. P-125 compares per-frame rates with a frozen floor instead.
- **M1 (OBSERVED).** M1 is not falsified: the call is not OUTSIDE. Its "starts inside the box" branch now has one
  concrete form, a script toggle of `will-change` driven by a viewport-relative IntersectionObserver margin.
- **Next (plan; needs an ops read and a P-id).** One decisive check, look-safe:
  1. An arm with the same will-change windows, but with the IO `rootMargin` in px (387.5 px = 50 % of 775), so
     the windows no longer move with the toolbar.
  2. Optionally a second arm with `data-fw-wc` pinned to 1 on the showcase elements.
  3. Either arm is read with a Timeline attribution of the in-view step frames (Simulator; per-run Layout of the
     box, as in P-119 N1).

  The px margin changes no pixels at rest. The window edges move by at most 20 px, so it needs no look gate
  beyond a parity screenshot.
- **Files.** `fixes/toolbar-resize/p123-read.json` (reader output, both runs), `results.json` key `p123`. The raw
  runs are in `out/toolbar-resize/sim123/` (gitignored).

## Prediction P-125: does the v8 will-change window trigger the in-view toolbar-step relayout? (Simulator, registered before data)

P-id from mgmt-ops-10 (P-123 result read: AGREE on WRITE, predictions 3 of 5). Lead: yes in principle to the
px-rootMargin arm with the optional pinned arm; Simulator only; Timeline attribution; steps 1 and 2 stay deferred; the
trigger stays OBSERVED in all text until this arm tests it. Order of gates: this card, ops' pre-data read, the lead's
R7 model review (the call lean missed in P-110, P-115, P-119 and P-123), the lead's signature.

- **Question.** In-view toolbar-step frames each pay a ~21 ms Layout in the showcase (P-119 N1: every in-view moving
  frame in every C run, 4-6 per run). P-123 found the v8 will-change window (`fwWC`, JS l.2738-2748) among the
  step-coincident writes: its IntersectionObserver uses `rootMargin: 50% 0px 50% 0px`, so a toolbar step (775 <-> 815)
  moves each window edge by 20 px and can toggle `[data-fw-wc="0"] { will-change: auto !important }` (CSS l.12270).
  Does that toggle start the in-view relayout?
- **Arms** (all on v8; three arms, Simulator iPhone 15 Pro Max, `flick-hero-v1` `6ae05e12ace9` as P-115/P-119/P-123):
  - **C**: v8 as served (server A: `fixes/v8-best` overlay, JS `3e3e94cb6e9f`, CSS `f836404b3728`).
  - **wpx**: v8 with one changed line, `rootMargin: 387.5px 0px 387.5px 0px` in `fwWC()` (`p125-wpx.diff`,
    `24bb62f4b48b`). 387.5 px is 50 % of the scripted innerHeight 775, so the window is the same as C's at 775 and no
    longer moves with the toolbar (C's is 407.5 px at 815). Served by server B (`fixes/toolbar-resize` overlay = v8 CSS
    + that JS, `6a79036cc108`); nothing else differs.
  - **wc1**: v8 as served (server A) with `data-fw-wc` pinned to 1 in the page (`p125-inject.mjs`): at install every
    `[data-fw-wc="0"]` is set to 1, then any `setAttribute('data-fw-wc', x)` with x != "1" is dropped and counted. The
    window's CSS rule never matches, so its elements keep their own `will-change` at every position.
  - Every arm, C included, runs the same inject (`8b8c8eac2603`): the setAttribute wrapper (pass-through in C and wpx),
    a MutationObserver logging `data-fw-wc` and `data-start-selling-scene` writes with `performance.now()` (the frames'
    clock), the showcase IntersectionObserver crossing log (rootMargin 0, threshold 0, as P-119), and a promotion count
    at install and at read (elements with `data-fw-wc`, those at "0", those whose computed `will-change` is not auto;
    no `getComputedStyle` during the gesture).
- **Order and runs (one hold):** C:H1 wpx:H1 C:H2 wc1:H1 C:H3 wc1:H2 C:H4 wpx:H2 C:H5. Two replicates per arm, five C
  runs, mirrored (P-119's layout). Driver `sim-p125.mjs` (`62c34d165a31`, from sim-bisect119): checks both servers'
  served bytes before any run (exit 26 on a mismatch), starts WDA, then per step `sim.mjs open` on the arm's server and
  `sim.mjs gesture flick-hero-v1.json --timeline --inject p125-inject.mjs`. Output `out/toolbar-resize/sim125/`. If the
  budget stop drops steps, they run in one more hold as `C:H6 <dropped> C:H7`, same scorer, and the result says so.
- **Hold kind (needs the lead's OK).** A gesture with `--timeline` refuses in a functional session, in a `--no-timing`
  hold and in the shared lane (`sim.mjs` header l.83-91; P-115's correction), so Timeline attribution cannot run in a
  shared Simulator slot. It needs **one normal exclusive chrome-measure hold**, `--max-seconds 600`, `SB_BUDGET_S=520`,
  as P-119 (9 runs in about 6 min). Free windows only, never ahead of int-v8, fix-hero-exit-threaded or a marked phone
  block. Command in `sim-p125.mjs`'s header (both servers start and stop inside the hold).
- **In-view step frames (frozen, as P-119 N1 / `split-io119.mjs` `1ad22b858eb8`).** The run's longest segment; a frame
  `[t, dt, y, ih]` covers (t - dt, t]. Moving = innerHeight strictly between the run's min and max. In view = the
  showcase's last IO entry with time <= t says intersecting. In-view step frame = moving, y < 3250, in view. Per frame:
  the largest outermost Timeline Layout that starts in its interval (0 if none) and the summed outermost Layout ms.
  Off-screen step frames (moving, y < 3250, not in view) are scored the same way, descriptive only.
- **Scorer** `score-p125.mjs` (`c52de0edd5d3`), frozen:
  1. **Gate** (per run, else INSUFFICIENT, never NONE): inject installed with its IO and write log; >= 100 frames;
     >= 1 Timeline Layout; `runs.jsonl` puts the run on its arm's server and the served-bytes record matches; C and wpx
     have 0 drops; wc1 has no `data-fw-wc="0"` at read; wpx starts at ih0 = 775 and its promotion at install is within
     +-1 of its neighbouring C runs' mean (the windows are the same at rest).
  2. **Metric:** per run, in-view step frames n, medL (median largest Layout per frame), and msPerS (summed Layout ms
     per second of those frames). Each arm run is divided by the mean of the nearest valid C run before and after.
  3. **Noise:** each C run against the mean of its C neighbours; N = the largest |1 - ratio| over the C runs, per
     metric, floor 0.10 (P-119's C runs give 0.075 per frame and 0.010 per second, so the floor applies). N > 0.30, or fewer than 3 valid C runs: VOID.
  4. **Bands:** ratio <= 0.30 LOCATES; <= 0.70 PARTIAL; < 1 - N SMALL; <= 1 + N **NONE (within C-to-C noise: no
     effect claimed)**; else WORSE. Run call = the medL band. A different msPerS band flags N-SENSITIVE (both
     reported, no effect size claimed). THIN when the run or a neighbouring C run has < 3 in-view step frames. Arm call =
     the common call of its two replicates, else SPLIT; an INSUFFICIENT or THIN replicate makes the arm that.
     **Arms within noise of each other:** |mean ratio wpx - mean ratio wc1| <= N is ARMS-EQUAL, and no difference
     between the arms is claimed; else ARMS-DIFFER.
  5. **Coincidence (C runs pooled; per key, `data-fw-wc` decides, `data-start-selling-scene` descriptive).** A frame
     carries a write when a record falls in its own interval or the previous frame's (an IO callback's write takes
     effect in the next update). Heavy = an in-view step frame with largest Layout >= 10 ms. H heavy frames, Hw
     carrying. Base b = the share of rest frames carrying. h = Hw / H, hLo = its Clopper-Pearson one-sided 95 % lower
     bound. Floor F = max(5, 2 x pooled runs) = 10 for five C runs. THIN when H < 5; COVERS when Hw >= F, hLo >= 2b and
     h >= 0.8; LINKED-PART when Hw >= F and hLo >= 2b; else NO-LINK.
  6. **Write rate (lead's rule via ops, descriptive, no call uses it):** per arm pooled and per key, s records over Fs
     moving frames against r records over Fr rest frames; RR = (s/Fs)/(r/Fr); RRlo = the Clopper-Pearson one-sided 95 %
     lower bound of s/(s+r) as odds, times Fr/Fs. STEP-LINKED when s >= max(8, 4 x pooled runs) (20 for five runs) and
     RRlo >= 2. P-123's 2-3 step records per run (10-15 pooled) cannot pass. Raw step counts never count toward a call.
  7. **Reading (frozen, printed by the scorer):**

     | reading | rule |
     |---|---|
     | WINDOW-TRIGGER | wpx LOCATES or PARTIAL, and the C coincidence is not NO-LINK |
     | UNCLEAR (wpx effect without coincidence) | wpx LOCATES or PARTIAL, coincidence NO-LINK |
     | NOT-THE-WINDOW | wpx NONE, and wc1 NONE or not run |
     | PROMOTION-STATE | wpx NONE, wc1 LOCATES, PARTIAL or SMALL (the layer state matters, not when it toggles) |
     | MINOR | wpx SMALL |
     | UNCLEAR | anything else (WORSE, SPLIT, THIN, INSUFFICIENT, VOID) |

- **Self-test** `p125-selftest.mjs` (`3cbb931ad9dd`): `SELFTEST PASS (38 checks)` on P-119's runs relabelled (C = C,
  wpx = cct, wc1 = cva), with synthetic write logs and served records. It checks the Clopper-Pearson bound (3/10 ->
  0.0873), both floors (P-123-level records stay below them, pooled or not), the bands, noise 0.10, wpx NONE and wc1
  NONE in view with wc1 LOCATES off screen (P-119 N1's numbers), NOT-THE-WINDOW; Layouts scaled by 0.2 in wpx with a
  write in every moving frame give LOCATES, COVERS and WINDOW-TRIGGER; the same scaling without coincidence gives
  UNCLEAR; and the gate (wpx promotion mismatch, wpx on server A, wpx at ih 815, wc1 not pinned, drops in C) gives
  INSUFFICIENT, never NONE.
- **Pixel and behaviour check (before data; no build comes from this probe).**
  - **Both arms change only when or whether `will-change` toggles.** The window's IO tests each element's whole box
    against the viewport grown by the margin, so a toggle happens only while the element lies entirely outside the
    viewport by >= 387.5 px. wpx moves the toggle point by at most 20 px inside that off-screen band; wc1 removes the
    toggle. On screen, every window element is at "1" in all three arms, so no on-screen pixel can differ, unless a
    window element has a `position: fixed` descendant (will-change: transform makes it the containing block). P-119's
    look probe found no fixed descendant in the showcase; the other window elements are not checked. Not verified
    against pixels here: any build that grows out of this probe gets the PR-010 Chrome + Simulator A/A pixel check
    before F (memory: illusions must be pixel-identical).
  - **wpx at rest:** the gate requires its promotion count at install (ih 775) to equal C's within +-1.
  - **wc1 changes promotion:** off-screen window elements keep their layers. Logged: promotion at install and at read
    (C's `n0` > 0 and wc1's `willChange` count above C's are expected), drops, pinned-at-install count. More layers can
    cost raster and memory off screen; a WORSE in wc1 is read as that, not as a trigger.
- **Predictions (before data; one probability each; my leans missed in P-110, P-115, P-119 and P-123).**

  | # | prediction | p |
  |---|---|---|
  | 1 | wpx arm call NONE | 65 % |
  | 2 | wc1 arm call NONE | 55 % |
  | 3 | reading NOT-THE-WINDOW | 50 % |
  | 4 | C coincidence (`data-fw-wc`) NO-LINK | 70 % |
  | 5 | C write rate (`data-fw-wc`) not STEP-LINKED | 80 % |
  | 6 | both wpx runs pass the gate (promotion at rest equal to C's) | 85 % |
  | 7 | wc1's promotion count at install above the C runs' | 90 % |
  | 8 | noise N stays at the 0.10 floor (C as stable as in P-119) | 75 % |
  | 9 | wpx off-screen call NONE in both runs | 75 % |
  | 10 | `data-start-selling-scene` coincidence in C NO-LINK (descriptive) | 65 % |

  Why the lean is NONE: P-119 found every in-view step frame heavy (~21 ms, 4-6 per run), while P-123 counted 2-3
  window writes per run in step frames, so at most a few heavy frames can carry a toggle. A trigger that fires on a
  few frames cannot explain a cost seen on all of them.
- **Model, for the lead's R7 review.**
  - Known (OBSERVED, in our setup): the step's ~21 ms Layout is in the showcase (P-110), nested in RecalculateStyles
    (D, S8), in every in-view step frame (P-119 N1); containment does not stop it, the off-screen skip does (P-115,
    P-119). No value in or above the box changes on a step, no size changes, no query container or anchor (P-123).
  - Corrected: P-123's 6 "viewport-unit" shells have that unit only in a declaration the phone media query overrides
    (`height: auto; min-height: 0`, v8 CSS l.3757-3774). So no live viewport-unit value in the box is known. Whether
    S5 still re-resolves them is UNRESOLVED.
  - M1 (OBSERVED, cause unknown) stays the working model: the relayout starts inside the box or arrives as inherited
    style. Its candidates now are script writes driven by viewport-relative IntersectionObservers: the will-change
    window (this card) and the scene gate (`data-start-selling-scene`, its own % rootMargin, `100% 0px` default,
    `150% 0px` for the deferred sections, JS l.2937-2942 and l.5493; `paused` also sets `will-change: auto` on the card
    and shells, CSS l.12260-12271). The scene gate gets descriptive coincidence numbers here, no arm.
  - What would change the model: WINDOW-TRIGGER makes the window's toggle (part of) the trigger; NOT-THE-WINDOW drops
    the window, and the next card (needs a P-id) asks the same of the scene gate, or reads the Timeline's style
    invalidation records of the heavy frames if the scene coincidence is also NO-LINK.
- **Pins (sha256/12).**

  | file | hash |
  |---|---|
  | `p125-inject.mjs` | 8b8c8eac2603 |
  | `sim-p125.mjs` | 62c34d165a31 |
  | `score-p125.mjs` | c52de0edd5d3 |
  | `p125-selftest.mjs` | 3cbb931ad9dd |
  | `p125-wpx.diff` | 24bb62f4b48b |
  | `flick-hero-v1.json` | 6ae05e12ace9 |
  | served JS A (v8) / B (wpx) | 3e3e94cb6e9f / 6a79036cc108 |
  | served CSS (both) | f836404b3728 |

## P-125 result (Simulator, Timeline attribution; scored by the frozen `score-p125.mjs` `c52de0edd5d3`)

**Reading: NOT-THE-WINDOW.** The v8 will-change window (`fwWC`, `data-fw-wc`) does fire on the toolbar step, but
the in-view step relayout stays without it. Removing every window toggle (wc1) leaves the ~21 ms showcase Layout as
it is. OBSERVED, in our setup (Simulator iPhone 15 Pro Max, `flick-hero-v1`).

- **Hold.** One normal exclusive chrome-measure hold, 01:51-01:57Z 2026-10-05, after fix-morph-gpu and
  fix-hero-exit-threaded. The host gate waited 600 s and then granted the hold anyway (load1 6-42 while waiting).
  Order and served bytes as pinned: A js `3e3e94cb6e9f`, B js `6a79036cc108`, css `f836404b3728` on both, inject
  `8b8c8eac2603`, all from overlay. All 9 steps ran (C-H5 ended at t+334 s of 524 s), no steps dropped, exit 0.
  - **Host context (descriptive):** load1 77 at SIM_QUIET and up to 92 during the runs. Simulator background mean 59 %
    of a core, 18 of 34 windows above 60 %. Timeline Layout ms can grow with load; C-to-C noise stayed at the floor (below).
  - **Pull-to-refresh guard.** The guard ended `flick-hero-v1`'s loop early 7 times: C-H1 (s2, s4), C-H2 (s2),
    wc1-H1 (s2, s4), C-H3 (s2), C-H4 (s4). Those runs have fewer strokes; every run still has 4-5 in-view step frames
    (none THIN).
- **Per run** (medL = median largest Layout per in-view step frame; ratio = medL / msPerS against the neighbouring C mean):

  | run | gate | in-view n | medL ms | ms/s | ratio | off-screen n / medL | fw-wc writes | drops | at read: n / at "0" / will-change |
  |---|---|---|---|---|---|---|---|---|---|
  | C-H1 | valid | 5 | 21.53 | 819.5 | | 8 / 21.61 | 122 | 0 | 29 / 23 / 6 |
  | wpx-H1 | valid | 5 | 21.65 | 819.5 | 1.004 / 1.017 NONE | 8 / 21.09 NONE | 122 | 0 | 29 / 23 / 6 |
  | C-H2 | valid | 4 | 21.61 | 792.8 | | 6 / 21.29 | 122 | 0 | 29 / 23 / 6 |
  | wc1-H1 | valid | 5 | 22.76 | 813.2 | 1.054 / 1.028 NONE | 8 / 21.90 NONE | 65 | 51 | 29 / 0 / 27 |
  | C-H3 | valid | 5 | 21.59 | 789.3 | | 8 / 20.94 | 122 | 0 | 29 / 23 / 6 |
  | wc1-H2 | valid | 5 | 22.37 | 805.0 | 1.036 / 0.995 NONE | 8 / 21.04 NONE | 66 | 54 | 29 / 0 / 27 |
  | C-H4 | valid | 4 | 21.60 | 829.3 | | 7 / 20.93 | 122 | 0 | 29 / 23 / 6 |
  | wpx-H2 | valid | 5 | 21.04 | 823.8 | 0.981 / 1.008 NONE | 6 / 20.13 NONE | 122 | 0 | 29 / 23 / 6 |
  | C-H5 | valid | 4 | 21.30 | 805.8 | | 7 / 20.72 | 122 | 0 | 29 / 23 / 6 |

  Every run also logged 20 `data-start-selling-scene` writes.
- **Noise** N = 0.10 for medL and for ms/s: the floor. The raw C-to-C value is below 0.015 (C medL 21.30-21.61 ms).
- **Arms:**
  - wpx: NONE (both runs NONE, mean ratio 0.992).
  - wc1: NONE (both runs NONE, mean ratio 1.045).
  - No run is N-SENSITIVE (the msPerS band equals the medL band in every run).
  - ARMS-EQUAL: |0.992 - 1.045| = 0.053 <= N. **ARMS-EQUAL compares medL ratios only** (ops N2), so no difference
    between the arms is claimed on either metric.
- **Coincidence (`data-fw-wc`, rule 5): C COVERS.** All 22 heavy in-view frames in the five C runs carry a window
  write in their own or the previous frame (h 1.00, hLo 0.873), against a rest base of 0.047.
  - Write rate (rule 6, descriptive): STEP-LINKED. s 92 over 155 moving frames against r 518 over 5888 rest frames:
    RR 6.75, RRlo 5.55, floor 20.
  - wpx is the same as C: COVERS (10 of 10) and STEP-LINKED (RR 6.56).
  - wc1 is LINKED-PART (6 of 10) and not STEP-LINKED (RR 1.75). The writes left in wc1 are the "1" writes the pin lets
    through; no element is at "0" at read.
  - `data-start-selling-scene`: NO-LINK and not STEP-LINKED in every arm (descriptive).
- **What this means.**
  - The window *is* step-linked: the step moves the IO root and the window rewrites its attributes on the step frames
    (P-123's 2-3 step writes per run were the visible part; with frames counted per interval it is about 18 records over
    about 31 moving frames per run).
  - Two facts together make the window's toggle not the trigger:
    - wc1 removes every toggle: drops 51/54, no "0" left, 27 elements keep `will-change`, against C's 6.
    - wc1 still pays the same in-view Layout: 22.4-22.8 ms per frame, ratio 1.036-1.054, inside the noise band.
  - The full coincidence in C is co-occurrence. The step drives both the window writes and the relayout, and taking the
    writes away does not take the Layout away.
- **wpx did not do what the card assumed (a design miss, disclosed).**
  - The card expected a px margin to stop the window from moving with the toolbar.
  - It wrote exactly what C wrote: 122 records per run, the same state at read, COVERS and STEP-LINKED like C.
  - Likely cause (OBSERVED, not checked): the root rectangle itself grows by 40 px on a step, so a px margin only
    narrows the edge's move (60 px to 40 px), and with a flick's per-frame motion the same frames cross.
  - So wpx's NONE says nothing about the window. **The reading rests on wc1**, which did remove the toggles. The frozen
    rule gives NOT-THE-WINDOW either way (wpx NONE, wc1 NONE), and this paragraph says why only wc1 carries the weight.
- **Ops result read (mgmt-ops-10, 3f95feb9): AGREE, 7 of 10, re-score byte-identical (`p125-score.json` 2a5e45b7d19d).**
  Ops' notes:
  - **Scope.** wc1 still makes 65-66 same-value "1" writes per run, and the window's IntersectionObserver callbacks run
    in every arm. So the reading excludes the window's toggle and its style change (`will-change: auto`), not the IO
    observation itself or a same-value attribute write.
  - **Prediction 6 is a vacuous hit.** `promo0` is 0 in every run, so the gate compared nothing.
  - **The wpx miss** was missed in ops' pre-data read too. "The root grows 40 px on a step" is consistent with the
    spec, but whether WebKit's IO root follows innerHeight is UNRESOLVED. P-126 checks it as item K1.
- **Ops N1 (two changes in wc1).** wc1 removes the toggle and also keeps the off-screen layers (27 at read against 6).
  So a non-NONE wc1 would have read as "toggle or promotion state", not as promotion alone. wc1 is NONE, so neither
  the toggle nor the promotion state shows an effect on the in-view Layout in this setup.
- **Gate note.** The wpx promotion gate (install count within +-1 of C) passed trivially. The inject installs before
  `fwWC` tags anything, so `promo0` is 0 in every run of every arm. The equality the gate meant, the same windows at
  rest, shows instead at read: wpx and C are both 29 / 23 / 6.
- **Off-screen frames (descriptive).** On v8, off-screen step frames are as heavy as in-view ones (C medL 20.7-21.6 ms).
  Neither arm changes that (NONE in all four runs). This is as P-119: only the off-screen skip (cva) removed them.
- **Pixels (ops N3).** No build comes from this probe. The argument that the window's arms cannot change on-screen
  pixels (toggles only while a box is >= 387.5 px off screen) rests on reading the code and is OBSERVED, not checked
  against pixels. Any build that grows out of the window gets the PR-010 Chrome + Simulator pixel A/A before F.
- **Predictions: 7 of 10.**

  | # | prediction | p | result |
  |---|---|---|---|
  | 1 | wpx arm call NONE | 65 % | hit (NONE, but see the design miss) |
  | 2 | wc1 arm call NONE | 55 % | hit |
  | 3 | reading NOT-THE-WINDOW | 50 % | hit |
  | 4 | C coincidence NO-LINK | 70 % | **miss** (COVERS, 22/22) |
  | 5 | C write rate not STEP-LINKED | 80 % | **miss** (RRlo 5.55, s 92 >= 20) |
  | 6 | both wpx runs pass the gate | 85 % | hit (trivially, `promo0` = 0 everywhere) |
  | 7 | wc1 promotion at install above C | 90 % | **miss** (0 = 0 at install; above C only at read, 27 vs 6) |
  | 8 | noise N at the 0.10 floor | 75 % | hit |
  | 9 | wpx off-screen NONE in both runs | 75 % | hit |
  | 10 | scene coincidence in C NO-LINK | 65 % | hit |

  The two misses that matter (4, 5) are the same misjudgement. I took P-123's few step-frame writes as "the window
  rarely writes on steps", but per frame interval it writes on almost every step frame. The reading's lean held because
  wc1 tested the toggle directly.
- **Model (R7), next.**
  - M1 stays the working model (OBSERVED, cause unknown): the relayout starts inside the box or arrives as inherited style.
  - The window is dropped as a trigger candidate.
  - The scene gate is the remaining script-write candidate, but its coincidence is NO-LINK (20 writes per run, none
    step-linked). By the card's own branch, the next step reads the Timeline's style-invalidation records of the heavy
    frames before an arm on the scene gate.
  - **Per the lead's R7 note, the scene gate is not folded into P-125: it needs its own P-id (P-126) from ops.**
  - The trigger stays OBSERVED, untested, in all text.
- Files: `p125-score.json` (scorer output), `p125-runs.jsonl` (served-bytes and per-run inject records); the raw
  Timeline and gesture files stay in the gitignored `out/toolbar-resize/sim125/`.

## Prediction P-126: what invalidates the heavy in-view toolbar-step frames? (stage 1: read the P-125 Timeline captures, no hold; registered before reading)

P-id P-126 (the lead reserved it for the scene gate, 11ffba5f). The lead says: read the heavy frames'
style-invalidation records first, before any scene-gate arm; read what P-125 already captured, and ask for a hold only
for what is missing; check the "root grows 40 px" guess as a named, cheap item. Ops (P-125 result read) agrees with
that order. Gates: this card, then ops' pre-data read, then the lead's R7 review and signature. The trigger stays
OBSERVED in all text.

- **Rev 2 (ops' pre-data read NOT YET PASS, 1eec3977; still no per-frame content read).**
  - C1: a stack holding only the injected probe's frames keyed as `native`. It now keys as `probe`, which is reported
    (`probeLinked`) and never decides. Probe-forced Layouts no longer count as SCRIPT.
  - C2: with ~1 stackless invalidation per frame, a feature present in half or more of the control frames could never
    pass the presence rule (hLo >= 2 x base), so NATIVE was unreachable by construction. Every `inval:<key>` now also
    gets a per-frame RATE test in P-125 rule 6's form (rule 5b below), symmetric for native and script keys. The base
    is printed for every feature.
  - Predictions 4 and 10 revised (allowed by ops). Reader and self-test re-pinned.

- **Question.**
  - P-125 ruled out the will-change window's toggle (wc1: no toggles, Layout unchanged). It did not rule out the IO
    observation itself or same-value writes (ops' scope note).
  - So what invalidates style or layout in the heavy in-view step frames: a script (and which function), or the
    engine with no script on the stack?
  - Is the heavy Layout forced by a script read or run in the rendering update? Does it start at the view root or at a
    subtree?
- **Data: no new hold.**
  - Input: the 9 P-125 runs in `out/toolbar-resize/sim125/` (all valid under P-125's gate), plus their Timeline files
    `tl-*.json` and the inject records in `g-*.json`.
  - C = the 5 C runs, the primary set. R = wpx + wc1 (4 runs), a replicate set: neither arm changed the Layout
    (P-125), so it is read the same way and reported descriptively.
- **What the captures hold (format survey before freezing, disclosed).**
  - Before writing the reader I counted record types and data keys over all 9 captures; I looked at no per-frame or
    per-stack content.
  - WebKit's Timeline gives `ScheduleStyleRecalculation` (10316, 1657 with a stack), `InvalidateLayout` (10302, 5543
    with a stack), `RecalculateStyles` (11736, 6776 with a stack), `Layout` (12049, each with `data.root`, a quad;
    6013 with a stack), `EventDispatch` (with `data.type`), `ObserverCallback` (with `data.type`), `TimerFire`,
    `FireAnimationFrame` and `FunctionCall`.
  - Unlike Chrome, there are no per-element invalidation reasons. What the records can tell is which script, if any,
    was on the stack when style or layout was invalidated or forced, and the layout root's box.
  - So stage 1 asks exactly that, and nothing finer.
- **Reader** `read-inval126.mjs` (`4f920b6450f7`, rev 2, frozen; it imports `coincidence`, `cpLower` and `rateRule` from
  `score-p125.mjs` `c52de0edd5d3`, unchanged). Rules, as its header states:
  1. **Frames as P-125.** HEAVY = moving, y < 3250, in view, largest outermost Layout >= 10 ms. CONTROL = in-view rest
     frames (not moving, y < 3250, in view). If fewer than 20 of them are pooled, every rest frame with y < 3250 is the
     control, flagged "wide".
  2. **Carrying.** A frame carries a feature when a record with it starts in the frame's own interval or the previous
     frame's (as P-125).
  3. **Stack key.** The innermost call frame whose url contains `/_app/immutable/` (the page's own JS). Its line maps
     to a region of the v8 JS `2.DyWL8TcE.js`, padded by one line because the
     protocol's line base is taken from the docs, not checked:
     - fwWC: l.2738-2748
     - sceneCE: l.2793-2805 (cE)
     - sceneB: l.2925-2955
     - sceneC: l.14205-14220

     Any other page line keys as `<file>:<function>@<line>`. No page frame on the stack (rev 2, C1):
     - the first frame with another url (not `[native code]`) keys as `ext:<file>:<function>@<line>` and decides like
       a page key;
     - else, a frame with an empty url (the injected probe, evaluated without a sourceURL) gives `probe`: reported,
       never deciding;
     - else `native` (no stack, or native frames only).
  4. **Features.** `inval:<key>` (a ScheduleStyleRecalculation or InvalidateLayout with that key), `ev:<type>`
     (EventDispatch, e.g. `resize`: the scroll engine `rE` also listens to resize, JS l.2762), and `obs:<type>`
     (ObserverCallback, so IntersectionObserver callbacks are counted, not excluded).
  5. **Coincidence per feature,** C pooled, P-125's frozen rule against the CONTROL base: THIN when H < 5; COVERS when
     Hw >= max(5, 2 x runs) (10 for C), hLo >= 2 x base and h >= 0.8; LINKED-PART when Hw >= floor and hLo >= 2 x base;
     else NO-LINK. The base is printed for every feature.

     5b. **Rate per `inval:<key>` (rev 2, C2; P-125 rule 6's form, `rateRule` imported).** s = records with that key
     starting in the heavy frames' own intervals, Fs = heavy frames; r = the same over the CONTROL frames, Fr = control
     frames. RR = (s/Fs)/(r/Fr); RRlo = the Clopper-Pearson 95 % lower bound of s/(s+r), as odds, x Fr/Fs. RATE-LINKED
     when s >= max(8, 4 x runs) (20 for C, 16 for R) and RRlo >= 2. Own intervals only, so no record counts twice.
     It applies to native and script keys alike. **LINKED** = COVERS, LINKED-PART or RATE-LINKED.
  6. **Per heavy Layout:**
     - PARENT: RECALC when >= 80 % sit directly in RecalculateStyles, else OTHER (parent and top-level ancestor types
       kept).
     - FORCED: the Layout's own stack key, else its RecalculateStyles parent's. SCRIPT when >= 80 % have a page or ext
       key (`probe` and `native` excluded), UPDATE when <= 20 %, else MIXED (keys counted).
     - ROOT: VIEW when the root quad's box is 0..430 x 0..ih (+-1 px), else SUBTREE (size kept). VIEW when >= 80 %,
       SUBTREE when <= 20 %, else MIXED.
  7. **Reading (frozen).** fwWC is reported but cannot decide, because P-125's wc1 removed its toggles without effect.
     `probe` is reported (`probeLinked`) but cannot decide: the probe's own work is not the page's.

     | reading | rule |
     |---|---|
     | SCRIPT-SOURCE(keys) | some `inval:<page or ext key>` other than fwWC is LINKED in C |
     | NATIVE | no such key, and `inval:native` is LINKED in C |
     | UNCLEAR | anything else (no invalidation record links, or THIN) |

     R gives its own reading: AGREE when it equals C's, else DIFFER (descriptive).
- **K1, the root-growth check (the P-125 wpx miss; cheap, from data on disk).**
  - Every inject `io` entry is `[time, in, top, bottom, rootH]` from the showcase IO (rootMargin 0, the same implicit
    root as `fwWC`'s IO).
  - SUPPORTS when, pooled over all runs, heights within 1 px of both the runs' min and max innerHeight appear
    (775 and 815). ONE-HEIGHT when only one appears. NONE when there are no entries.
  - K1b (descriptive): the distinct heights of VIEW layout roots, which show whether the layout view grows with the
    step. That is the layout viewport, not necessarily the IO root, so K1b cannot decide K1.
- **K2 (reference, no hold).** The IntersectionObserver spec's "root intersection rectangle" for an implicit root (the
  document's viewport), and WebKit's source for the rectangle it uses (`IntersectionObserver.cpp`: layout viewport or
  visual viewport). Cited with link and line. It is needed for any CONFIRMED wording. Plan:
  1. W3C IntersectionObserver spec, "root intersection rectangle".
  2. github.com/WebKit/WebKit `Source/WebCore/page/IntersectionObserver.cpp` and `LocalFrameView` viewport rect getters,
     with their history.
  3. Bugs on rootBounds and the iOS dynamic toolbar.
  4. How our probe could mislead: the io entries come only at crossings, so one height can be pure sampling.
- **K3 (only if K1 is ONE-HEIGHT or NONE and K2 leaves it open; needs a slot, asked for separately).** A count-only
  Simulator check in the shared lane (`--weight simulator`, `--functional`, no timing): an IO with thresholds on a
  sentinel element logs `rootBounds.height` on each callback across a toolbar step. This is the only item that would
  need lock time; it gets its own approval, not this card's.
- **Ops' lesson, folded in.** Any arm that grows out of P-126 (a scene-gate pin, or a change to the function the
  reading names) first gets a pre-data **target check**: a count-only Simulator run in the shared lane that shows the
  arm changes its target (the targeted writes or invalidations gone or changed, counted per run) before any Timeline
  hold. An arm that does not change its target is fixed or dropped before data; wpx would have failed this check.
- **Self-test** `p126-selftest.mjs` (`c7ca7eb2ef09`, rev 2): `SELFTEST PASS (43 checks)`, on synthetic runs only.
  Checks:
  - stack keys: a page frame wins over inject and native frames, region padding, file check, native, scene regions;
  - rev 2, C1: a probe-only stack (`[inj]`, `[native, inj]`) keys `probe`; another url keys `ext:`; probe-linked
    invalidations give `probeLinked` and UNCLEAR, never NATIVE; a probe-forced Layout is not SCRIPT;
  - rev 2, C2: native in every control frame (base 1) is presence NO-LINK, and at 4 records per heavy frame it is
    RATE-LINKED and the reading is NATIVE; at an equal rate it stays unlinked (UNCLEAR); a script key decides by rate
    as well; the rate floor (20 for C, 16 for R) is met exactly at s = floor and missed below it; rates only on
    `inval:` keys;
  - native + fwWC + resize gives NATIVE, with fwWC COVERS reported but not deciding, RECALC / UPDATE / VIEW, and R
    AGREE;
  - a scene invalidation on step frames gives SCRIPT-SOURCE(sceneCE);
  - a scene invalidation in every frame gives NO-LINK, then NATIVE;
  - a forced layout is keyed `2.DyWL8TcE.js:gBCR@5000`;
  - a subtree root gives SUBTREE;
  - no records give UNCLEAR;
  - a previous-frame record carries;
  - K1 gives SUPPORTS, ONE-HEIGHT or NONE;
  - the wide-control fallback;
  - THIN at 4 heavy frames;
  - the floors are 10 for 5 runs and 8 for 4.
- **What each reading leads to (frozen before data).**

  | reading | next step |
  |---|---|
  | SCRIPT-SOURCE(sceneCE / sceneB / sceneC) | a scene-gate arm card (pin `data-start-selling-scene`), after the target check above |
  | SCRIPT-SOURCE(other key) | an arm on that function (new card), same target check |
  | NATIVE with ROOT VIEW | the step re-lays out from the view root with no script on the stack; next is a reference check of WebKit's layout-viewport resize invalidation (what it dirties) against what in the showcase depends on it (P-123's open S5 question); no scene arm |
  | NATIVE with ROOT SUBTREE | as above, plus the subtree's box (from the quad) names the layout root |
  | UNCLEAR | the Timeline cannot see the cause; the lead decides the next instrument |

  FORCED = SCRIPT adds the named reading function as a candidate whatever the reading.
- **Pixel and behaviour check.** Stage 1 changes nothing: it reads files on disk, and no build comes from it. Any later
  build gets the PR-010 pixel A/A before F, as P-125 N3.
- **Predictions (before reading; one probability each; my leans missed in P-110, P-115, P-119, P-123, and P-125's 4/5).**

  | # | prediction | p |
  |---|---|---|
  | 1 | C PARENT RECALC | 80 % |
  | 2 | C FORCED UPDATE | 60 % |
  | 3 | C ROOT VIEW | 55 % |
  | 4 | C reading NATIVE (SCRIPT-SOURCE 35 %, UNCLEAR 15 %; rev 2, was 45 % before NATIVE was reachable by rate) | 50 % |
  | 5 | `inval:fwWC` COVERS in C (as P-125's writes) | 70 % |
  | 6 | every scene key NO-LINK or absent in C | 75 % |
  | 7 | `ev:resize` COVERS in C | 65 % |
  | 8 | R AGREE | 80 % |
  | 9 | K1 SUPPORTS | 55 % |
  | 10 | `inval:native` RATE-LINKED in C (rev 2; was "COVERS", which ops showed is likely unreachable at ~1 stackless invalidation per frame) | 60 % |

  The lean: P-125 showed the step-coincident script writes are not needed for the Layout, and P-123 found no value in
  the box that flips. So I lean to an engine-side invalidation from the resize itself. But P-125 taught me that "few
  writes" was wrong, and a forced read in the resize handler (`rE`) would make it SCRIPT. Hence 50 %.
- **Model, for the lead's R7 review.**
  - M1 stays (OBSERVED, cause unknown): the relayout starts inside the box or arrives as inherited style.
  - P-125 removed the window's toggle as a cause. Candidates left: the scene gate's writes (NO-LINK in P-125, as
    writes); the scroll engine's resize handler `rE` (JS l.2761-2762, it listens to `resize`), and a read it might
    force; and the engine's own reaction to a layout-viewport height change.
  - Stage 1 tells these apart only by the stacks on invalidation and layout records, plus the layout root. It cannot
    say which property or element was invalidated (WebKit's Timeline has no such field).
  - What would change the model:
    - SCRIPT-SOURCE or FORCED SCRIPT moves the trigger to a named function.
    - NATIVE moves it to the engine and makes the scene arm low value.
    - UNCLEAR says this instrument is exhausted.
- **Cost.** Stage 1 reads files only: no lock, no Simulator, no phone. K2 is web reading (no personal data). K3 is the
  only possible lock use, and it is asked for separately.
- **Pins (sha256/12).**

  | file | hash |
  |---|---|
  | `read-inval126.mjs` | 4f920b6450f7 (rev 2; rev 1 was 5ea7520852a8) |
  | `p126-selftest.mjs` | c7ca7eb2ef09 (rev 2; rev 1 was f3f922b0bbb9) |
  | `score-p125.mjs` (imported) | c52de0edd5d3 |
  | input: the 18 P-125 capture files, `cat g-*.json tl-*.json` in name order | 8435065642cc (`out/toolbar-resize/sim125/`; `runs.jsonl` = committed `p125-runs.jsonl`) |

## P-126 result (stage 1, files only, no hold; frozen reader `4f920b6450f7` on input `8435065642cc`, 2026-10-05)

Card rev 2 passed ops' delta read (c37f7df1, notes N1-N3); the lead signed it after the R7 review. Run:
`node fixes/toolbar-resize/read-inval126.mjs out/toolbar-resize/sim125 C-H1 … C-H5 wpx-H1 wpx-H2 wc1-H1 wc1-H2`
(output `p126-read.json`). Input pin re-checked before reading (8435065642cc). The descriptive extras after it come from
`p126-desc.mjs` (`8db940b3736e`, written after the frozen read; output `p126-desc.json`): they decide nothing.

- **Frozen calls.**

  | set | H | control | READING | PARENT | FORCED | ROOT | probeLinked |
  |---|---|---|---|---|---|---|---|
  | C (5 runs) | 22 | 435 | **NATIVE** | OTHER (0.455: RecalculateStyles 10, Composite 7, RenderingFrame 5) | UPDATE (0 of 22 scripted; all `native`) | SUBTREE (0 VIEW; see the root note) | false |
  | R (wpx + wc1) | 20 | 347 | NATIVE | OTHER (0.2: Composite 9, RenderingFrame 7, RecalculateStyles 4) | UPDATE (0) | SUBTREE (0 VIEW) | false |

  AGREE. K1 SUPPORTS.
- **What links (C; R the same calls unless noted).**

  | feature | presence | Hw/H | base | rate s/Fs vs r/Fr | RR | RRlo | rate |
  |---|---|---|---|---|---|---|---|
  | `inval:native` | NO-LINK (saturated) | 22/22 | 0.86 | 234/22 vs 535/435 | 8.65 | 7.57 | **RATE-LINKED** |
  | `inval:probe` | NO-LINK | 18/22 | 0.66 | 21/22 vs 288/435 | 1.44 | 0.95 | no |
  | `inval:2.DyWL8TcE.js:ee@13860` | NO-LINK | 6/22 | 0.05 | 6/22 vs 12/435 | 9.89 | 3.66 | no: s 6 < floor 20 |
  | `inval:…:fwNearChange@12128`, `hePE@4815`, `?@4332`, `?@12092` | NO-LINK | 0/22 | ≤ 0.055 | 0 in heavy frames | 0 | 0 | no |
  | `inval:fwWC`, every scene key | absent from heavy and control frames | | | | | | |
  | `ev:resize` | LINKED-PART | 12/22 | 0.05 | | | | |
  | `ev:touchmove` / `ev:touchend` | COVERS / COVERS (R: COVERS / LINKED-PART) | 22/22, 19/22 | 0.002 | | | | |
  | `obs:MutationObserver` | COVERS | 22/22 | 0.25 | | | | |
  | `obs:IntersectionObserver` | NO-LINK | 22/22 | 0.56 | | | | |

  R: `inval:native` RATE-LINKED (s 192/20 vs 381/347, RR 8.74, RRlo 7.52; Hw 20/20, base 0.85); `ee@13860` 4/20, below
  floor 16; no other key links. Touch events cover the step frames by construction (the gesture driver's toolbar steps
  happen during a touch scroll). The MutationObserver callbacks are the probe's own (p125 inject l.45 watches
  `data-fw-wc` and scene writes), so they cover the frames where those writes land; they are probe work, not page work.
- **N1 (ops): what NATIVE means here.** A toolbar step resizes the viewport, so more stackless invalidations in step
  frames are nearly expected by construction. NATIVE says only that **no page, ext or fwWC script key links** to the
  heavy frames; it does not show the engine's invalidation is the cause.
- **N4 (descriptive; reworded after ops' result read R1): the instrument's view of observer-callback writes is
  unknown.**
  - What we see. In the C runs the P-125 probe logged 610 `data-fw-wc` writes by fwWC's IntersectionObserver callback
    (JS l.2742): 150 value changes and 460 same-value writes. No record in any of the 9 captures keys as `fwWC`
    (census: native 15964, probe 4314, every page key ≤ 78).
  - Matching (nearest ScheduleStyleRecalculation / InvalidateLayout record within 2 ms of the probe's
    MutationObserver stamp):

    | writes (C) | with a record within 2 ms | nearest record stackless |
    |---|---|---|
    | value changes (150) | 150 (100 %; median lag 0.1 ms, p10-p90 -0.41..0.61) | 142 |
    | same-value (460), ops' control | 460 (100 %) | 447 |
    | value changes, stamps shifted -25 / +25 ms (ops) | 41 / 60 | |
    | same-value, shifted -25 / +25 ms (ops) | 90 / 155 | |

    Same-value writes, which may invalidate nothing, match as often as value changes, and shifted stamps match far
    less. So the record is time-locked to the IO callback's moment, not shown to be the write's own invalidation.
  - Two explanations remain, both UNRESOLVED: (a) WebKit's Timeline drops the stack for invalidations raised inside
    observer callbacks; (b) the write raises no invalidation record at all (no selector depends on the attribute, or
    a same-value skip), and the matched record is other rendering-update work at that moment. The decisive local check
    is a count-only Simulator page that writes one attribute (a value change and a same-value arm, with and without a
    selector on it) from an IO callback, a rAF and a timer, and reads each record's stack (ops' matching script:
    mgmt-ops-10 scratchpad `p126res/n4ctl.mjs`). Not run; it needs its own slot.
  - So no claim is made about what `native` contains beyond N1. The instrument's view of observer-callback writes is
    unknown, which leaves observer callbacks (the showcase's own IOs: `fwNearChange` l.12128 and others) neither
    shown nor excluded.
  - What holds regardless: R contains the wc1 runs, which have no fwWC toggles at all (P-125), and the native surplus is
    the same there (per run RR: C 7.0-9.7, wpx 8.0-9.2, wc1 8.4-9.7). So fwWC's toggles are not the surplus.
- **Ops R2 (descriptive, from ops' result read; supports N1).** Every in-view mid-step frame is heavy (0 light ones in C
  and in R), so in view "step" and "heavy" cannot be told apart. Out-of-view mid-step frames carry 4.4 native records
  per frame (R 4.3) against 1.2 at rest, with a Layout median of 0.9 ms: the step raises stackless records without the
  heavy Layout too.
- **N2 (ops): the rate bound is optimistic.** The Clopper-Pearson bound on s/(s+r) assumes Poisson counts; records cluster
  within frames. Control frames are overdispersed (variance/mean 2.05 in C, 1.41 in R), so RRlo 7.57 overstates the
  certainty; the >= 2 margin only partly absorbs it. Descriptively the link does not lean on the pooling: every one of the
  9 runs has a per-run ratio of 7.0-9.7; the heavy frames' median count is 12 (C; 10 in R) against a control median of 1
  and control p99 of 7 (5 in R); only 0.9 % (C) and 0.3 % (R) of control frames reach the heavy median; 64 % (C) and 90 %
  (R) of heavy frames exceed the control p99.
- **N3 (ops): Hw beside s.** The only RATE-LINKED key is `inval:native`: s 234 over Hw 22/22 heavy frames (C), s 192 over
  Hw 20/20 (R). `ee@13860` (rate high but below floor): s 6 over Hw 6/22 (C), 4 over 4/20 (R).
- **Root note (a rule design miss, disclosed; the frozen call stands as SUBTREE).** Every heavy Layout's root quad is
  430x775 at the origin (42 of 42). Rule 6 called VIEW only when the box height equals the frame's innerHeight; heavy
  frames are mid-step (776-814), so none matched. The same 430x775 box is also the root of most rest-frame Layouts at
  innerHeight 815 (1655 of 2728), so in our setup the view root's box stays at 775 while innerHeight grows (OBSERVED;
  WebKit's root quad presumably reports the view's layout size, not innerHeight; not checked against source). So,
  descriptively, the heavy Layouts start at the view root, not at a subtree. K1b (VIEW root heights) is empty for the
  same reason. Read the table's "NATIVE with ROOT SUBTREE" branch as "NATIVE with ROOT VIEW" (the subtree box the
  SUBTREE branch asks for is the view itself).
  - Two different rects (ops R4): K1's IO root grows 775 → 815 with the step, while the Layout root box stays 430x775.
    The 775 box is not the layout viewport (which K2 makes the IO root); what rect WebKit reports as the Layout root is
    not checked.
- **K1: root growth, SUPPORTS.** The showcase IO's rootBounds heights take 15 distinct values over 81 entries, from 775
  to 815, including mid-step values (785-804). So in our setup (Simulator) the implicit IO root follows the toolbar step
  (OBSERVED). The P-125 wpx miss is explained: a px rootMargin on a root that grows 40 px still flips at the same place.
- **K2: reference.**
  - Spec: W3C IntersectionObserver § 2.2, "root intersection rectangle": an implicit root observer is treated as if the
    root were the top-level browsing context's document, and for a document root it is "the size of the document's
    viewport" (https://w3c.github.io/IntersectionObserver/#intersectionobserver-root-intersection-rectangle).
  - WebKit: `Source/WebCore/page/IntersectionObserver.cpp` (main, last commit to the file 51ae7b6cb801): for the implicit
    root, `computeRootBounds` sets `rootBounds = layoutViewportRectForIntersection()` (l.428-433), which returns
    `hostFrameView.layoutViewportRect()` (l.375-385; the obscured-insets variant is only for content-visibility).
  - Status: the root is the layout viewport rect, CONFIRMED (source). That this rect grows with the iOS toolbar step is
    OBSERVED (K1, Simulator); no WebKit source line for the toolbar link was checked.
  - K3 is not needed (it was only for ONE-HEIGHT or NONE).
- **Predictions: 6 of 10.**

  | # | prediction | p | outcome |
  |---|---|---|---|
  | 1 | PARENT RECALC | 80 % | miss (OTHER, 0.455; Composite holds 7 of 22) |
  | 2 | FORCED UPDATE | 60 % | hit |
  | 3 | ROOT VIEW | 55 % | miss as frozen (SUBTREE); the root note shows a view-sized root, a rule miss |
  | 4 | reading NATIVE | 50 % | hit (with N1 and N4) |
  | 5 | `inval:fwWC` COVERS | 70 % | miss (absent; why is unknown, N4) |
  | 6 | every scene key NO-LINK or absent | 75 % | hit (absent) |
  | 7 | `ev:resize` COVERS | 65 % | miss (LINKED-PART, 12/22) |
  | 8 | R AGREE | 80 % | hit |
  | 9 | K1 SUPPORTS | 55 % | hit |
  | 10 | `inval:native` RATE-LINKED | 60 % | hit |
- **What it leads to (the frozen table, with the notes).**
  - Frozen branch: NATIVE (with the root read as VIEW). The table's next step is a reference check of what WebKit's
    layout-viewport resize invalidates, against what in the showcase depends on it (P-123's open S5 question); no scene
    arm. FORCED UPDATE names no reading function.
  - N4 limits it: the instrument's view of observer-callback writes is unknown (fwWC's known writes left no keyed
    record, explanation (a) or (b) open). So "no scene arm" rests on the scene keys' absence plus P-125's NO-LINK for
    scene writes, not on proof that no script runs in the step frames.
  - Open for the lead (no step taken): (a) the reference check above (web and source reading, no hold); (b) the
    count-only N4 check with a same-value arm, which needs its own Simulator slot (shared lane, `--weight simulator`),
    asked separately (ops recommends it before (a); the lead decides); (c) the showcase's own IO callbacks
    (`fwNearChange` l.12128 and peers) as a candidate the reading neither shows nor excludes.
  - The trigger stays OBSERVED, untested.
- **Pixel and behaviour.** Nothing was built or served; no pixel check applies.

## Scenarios not run

idle after scroll · reload while scrolled · early input · scroll up · rubber band (this topic is the toolbar resize).

## Risks, conflicts, follow-ups

- `js` (`trzR`) touches the shared scroll engine `rE`: shipping it is "ask first" with fix-scroll-cb and fix-nav-morph.
- `sticky` changes the hero's look; mechanism only, never shipped as is.
- `cq` must be pixel-identical (memory: illusions must be pixel-identical): Chrome parity in check2, WebKit before V.
- Probes: `probe-resize.mjs`, `probe-inval.mjs`, `probe-geom.mjs` (Chrome; cited above).
