# Fix: toolbar-resize

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (P-106 ablation block run 2026-10-04 13:19-13:45Z); no shippable fix yet
**Stage:** D signed by lead 2026-10-04 14:02Z (LOCATED); P-109 + P-110 Simulator bisects: cost = #people's showcase (0.03), trigger = any viewport-constrained renderer (no single one); indicative; P-115 on v8: content-visibility:auto on the showcase LOCATES (0.036), contain:layout and svh pin NONE; P-115 read AGREE (ops); P-119 (ops pre-data PASS): cct NONE, cva LOCATES (0.036/0.037) but N-SENSITIVE: the skip removes the cost only off screen, in-view frames still ~21 ms; look gate LOOK-RISK (applies to cva's paint containment too); R7 review (lead, 2026-10-05): M2 refuted, M1 accepted as the working model (OBSERVED); P-123 (count-only, S5) result: WRITE (ops read AGREE; predictions 3 of 5): no viewport value in the box flips (the shells' 100vh clamp is overridden on phones by `height: auto`, corrected); step-specific writes are IntersectionObserver state, among them the v8 will-change window `data-fw-wc` (rootMargin 50 %, moves with the toolbar): candidate trigger, OBSERVED, untested; P-125 (ops pre-data PASS, lead signed; one Simulator hold 2026-10-05): NOT-THE-WINDOW: the will-change window writes on step frames (C coincidence COVERS 22/22) but pinning it (wc1: no toggles) leaves the in-view Layout unchanged (ratio 1.045, NONE); wpx did not stop the writes (design miss, disclosed); predictions 7 of 10; ops result read AGREE (3f95feb9), landed a28a29ad; P-126 (card rev 2, ops PASS, lead signed; stage 1 read the P-125 captures, no hold): NATIVE (only `inval:native` links, by rate, RRlo 7.57, Hw 22/22; no page script key links; FORCED UPDATE; heavy roots are the 430x775 view box, frozen call SUBTREE is a rule miss), R AGREE; N1: NATIVE means only that no script key links; N4: the instrument's view of observer-callback writes is unknown (fwWC's known writes leave no keyed record; same-value writes match records as often, so dropped stacks vs no invalidation are both UNRESOLVED); K1 SUPPORTS (IO root follows the step, OBSERVED; root = layoutViewportRect, CONFIRMED in WebKit source); predictions 6 of 10; ops result read AGREE with N4 reworded (R1), R2 and R4 folded in; P-128 FWWC-ONLY (script-caller line closed by the lead); P-131 card rev 1 (was PGP; swap nvn/tps accepted by the lead before data; page-side arms on the viewport-constrained renderers, v9-final, Simulator Timeline mechanism ratio) registered before data, signed by the lead on ops' pre-data PASS; result NOT REPRODUCED (rule 1: C-H1 n = 7 < 8; all runs gated; no arm judged), closed by the lead, ops result read PASS, landed; cause of the low n corrected (fling overshoot past the hero zone, not the guard); P-133 card rev 1 (same arms and rule 1, fresh data, drag cycles sized for n >= 12, two holds, count-only dry run, frozen n check before scoring; base main 189ca7ed = v9-final + 7d, JS 1b2eecc66011) registered before data, to ops for the pre-data read
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

## P-126 addendum D1 (2026-10-05, descriptive, written after the result; changes no frozen call)

The P-125 captures that P-126 read were taken with stacks cut to one frame. The frozen reader assumed full stacks. So
its `native` key mixed two different things. The frozen calls stand as computed, but what NATIVE means is compromised.

- **Cause: the capture depth.**
  - Our code: `tools/lib/wip.mjs` l.267-268, `TIMELINE_START` sends `Timeline.start {maxCallStackDepth: 1}`
    (`gesture --timeline` uses it).
  - WebKit: `Source/JavaScriptCore/inspector/protocol/Timeline.json` l.78, "Samples JavaScript stack traces up to
    maxCallStackDepth, defaults to 5" (file commit `7af6d5a321879450ab6d21f113e233e957caf14f`). Also
    `InspectorTimelineAgent.cpp` `internalStart` l.172-177 (file commit `9a8a5f7d36ab`) stores the depth.
  - Status: the depth cut is CONFIRMED.
  - In the data, all 9 runs hold 13418 invalidation records with no stackTrace and 7200 with a 1-frame stack, and none
    with more. A script call into a DOM function keeps only its innermost frame (`setAttribute [native code]` and the
    like). The reader skips `[native code]` frames, so it keyed those records `native`, the same key as the records
    that have no stack.
- **A missing stackTrace means no JS frame was on the stack, at any depth.**
  - `TimelineRecordFactory::createGenericRecord`, `Source/WebCore/inspector/TimelineRecordFactory.cpp` l.46-57 (file
    commit `f7dd925a68af`): a record gets `stackTrace` only when `createScriptCallStack(...)` returns a non-empty stack.
  - `createScriptCallStack`, `Source/JavaScriptCore/inspector/ScriptCallStackFactory.cpp` l.105-120 (file commit
    `9a8a5f7d36ab`): it walks from `vm.topCallFrame` and is empty when there is no global object or no top frame. The
    depth only truncates the walk (l.70-80). It skips implementation-private (builtin) frames (l.68).
  - Both invalidation records ask for a stack: `PageTimelineAgent.cpp` (file commit `3941d977dc3a`)
    `willInvalidateLayout` l.195-208 and `didScheduleStyleRecalculation` l.243-250 call `appendRecord(..., true)`.
  - So the 8.23 vs 0.93 per-frame no-stack surplus is not hidden by the depth cut. Status: CONFIRMED (WebKit main
    source).
  - Caveats: the Simulator's Safari build was not checked against these exact lines. A write made only from a private
    builtin frame would also leave no stack.
- **Side note from the same source, for P-127.** `willInvalidateLayout` returns early when the renderer already needs
  layout (l.197-198). So an InvalidateLayout record marks the first invalidation of a clean renderer, not every write
  (CONFIRMED, source).
- **The `native` key split by shape** (`p126-depth.mjs` `8ac787c8c83a`, output `p126-depth.json` `bd3cfe4551f6`;
  records in each frame's own interval, per frame):

  | bucket | C heavy (22 frames) | C control (435) | R heavy (20) | R control (347) |
  |---|---|---|---|---|
  | no stack | 181 (8.23) | 406 (0.93) | 168 (8.40) | 304 (0.88) |
  | one `[native code]` frame (DOM call, caller cut) | 53 (2.41) | 129 (0.30) | 24 (1.20) | 77 (0.22) |
  | of which `setAttribute` / `toggle` / `getBoundingClientRect` / `setProperty` | 21 / 13 / 10 / 9 | 49 / 56 / 0 / 10 | 9 / 10 / 0 / 5 | 24 / 40 / 0 / 8 |

- **Rule 5b on each bucket.** These are the frozen `rateRule` and `coincidence` (from `score-p125.mjs` `c52de0edd5d3`),
  applied descriptively to two keys the frozen reader did not have:

  | bucket | set | s/Fs | r/Fr | RR | RRlo | floor | rate | presence (Hw/H, base) |
  |---|---|---|---|---|---|---|---|---|
  | DOM call | C | 53/22 | 129/435 | 8.12 | 6.11 | 20 | RATE-LINKED | COVERS (21/22, 0.22) |
  | DOM call | R | 24/20 | 77/347 | 5.41 | 3.54 | 16 | RATE-LINKED | COVERS (16/20, 0.18) |
  | no stack | C | 181/22 | 406/435 | 8.82 | 7.57 | 20 | RATE-LINKED | NO-LINK (22/22, 0.66; saturates) |
  | no stack | R | 168/20 | 304/347 | 9.59 | 8.14 | 16 | RATE-LINKED | NO-LINK (20/20, 0.64) |

- **What this does to the P-126 reading.**
  - The DOM-call bucket alone passes rule 5b. With its own key it would have taken the SCRIPT-SOURCE branch.
  - So under a depth-aware key, P-126 reads as script-called invalidations whose caller is unknown, beside a larger
    surplus with no JS on the stack at all. It does not plainly read NATIVE.
  - The frozen calls stand as computed (NATIVE, FORCED UPDATE, PARENT OTHER, ROOT SUBTREE with the root note).
    "NATIVE" means "no page or ext frame was visible at depth 1", not "no script".
  - FORCED UPDATE has the same limit: a forced Layout whose stack is one `[native code]` frame (a layout read, say)
    keys `native` too. The call was not re-read here.
  - The no-stack surplus (about 7.3 more records per heavy frame than at rest in C, 7.5 in R) is not script on the stack:
    no JS frame was running when it was recorded (CONFIRMED source; see the caveats). What schedules it (the
    engine's resize path, or deferred work from earlier script) is open.
- **N4 gets a third explanation (c), and it covers most matches.** The fwWC write log against the nearest record within
  2 ms (`p126-depth.json` `fwWCWrites`; ops' control `p126-n4ctl.mjs` `605214d05180`, copied in with relative imports,
  reproduces ops' 150/150 and 460/460):

  | fwWC writes | n | nearest record is a `setAttribute` `[native code]` frame | nearest is no-stack | any `setAttribute` record within 2 ms |
  |---|---|---|---|---|
  | value changes | 150 | 122 | 12 | 137 |
  | same-value writes | 460 | 353 | 80 | 445 |

  - (c): the write did leave a record. The record kept only its `setAttribute` frame, so it keyed `native`. N4's
    "stackless" matches are mostly this.
  - Same-value writes also sit next to `setAttribute` records (445 of 460). Two readings stay open: a same-value
    `setAttribute` schedules a style recalc too, or the neighbour is another write in the same batch. Status: UNRESOLVED.
    P-127 decides it: one write per round, an arm without a selector, and a no-write arm.
  - (a) and (b) as worded in N4 are not refuted. (c) means they are no longer needed for most matches.
- **Ops lesson (from ops).** The pre-data and result reads never checked the capture depth either. Ops logged it.
- **Findings board.** F-261 (posted before this addendum) names the pitfall. F-262 adds the source confirmation and is tagged to every topic whose scripts read Timeline stacks.

## Prediction P-127: how does WebKit's Timeline record a write from an observer callback? (Simulator, count-only, registered before data)

P-id P-127 (assigned by ops, 5d08937c). The lead chose the design: a count-only check of observer-callback writes in the
Simulator shared lane. The capture script lives here and sets the Timeline depth on its own inspector connection
(tools/ unchanged; the `--stack-depth` ask is I-198, P3). Gates: this card, then ops' pre-data read, then the lead's
signature. The trigger stays OBSERVED in all text.

- **Question.** P-126's NATIVE reading rests on how the instrument shows script writes. On a quiet test page, how does
  WebKit's Timeline record one attribute write made from:
  - an IntersectionObserver callback;
  - a requestAnimationFrame callback;
  - a timer callback?
  It asks four things:
  1. Does the write raise a record?
  2. Does the record keep the page caller at depth 16?
  3. What does the record show at depth 1?
  4. Does a same-value write, or a write to an attribute no selector reads, raise anything?
- **Why.**
  - N4 left (a) "stacks dropped in observer callbacks" and (b) "the write raised no record" open.
  - Addendum D1 added (c) "the caller was cut at depth 1".
  - P-126's same-value fwWC writes sat next to `setAttribute` records 445 of 460 times; this is UNRESOLVED.
  - Only a write we control, with its records found by structure, separates these.
- **What WebKit main's source says** (CONFIRMED for WebKit main; the Simulator's build is not checked, so P-127 is the
  local check):
  - A same-value `setAttribute` does no style invalidation. `Element::setAttributeInternal` runs
    `AttributeChangeInvalidation` only when `newValue != oldValue` (`Source/WebCore/dom/Element.cpp` l.2350-2353), and
    `attributeChanged` returns early on equal values (l.2444-2445) (file commit `74af04025b3b`).
  - An attribute change invalidates style only when a rule's features name the attribute
    (`Source/WebCore/style/AttributeChangeInvalidation.cpp` l.44-61, file commit `aeb822d74e8b`).
  - ScheduleStyleRecalculation is recorded only when the style-recalc timer is not already running
    (`Source/WebCore/dom/Document.cpp` `scheduleStyleRecalc` l.2761-2772, file commit `10740b3a1fa5`).
  - InvalidateLayout counts first invalidations only. It records nothing when the renderer already needs layout
    (`PageTimelineAgent.cpp` l.197-198).
  - A record's stack is the visible JS stack up to the depth; it is absent when no JS frame is on the stack (addendum D1).
- **Design (COUNT-ONLY; no durations, no timing).**
  - Page `p127-page.html` (`503385ed36a8`) with its script `p127-page.js` (`457f3abc43f1`, rev 3), no Fastwork code. The
    capture copies them into this topic's overlay as `/p127/index.html` and `/p127/p127.js` and checks both served bytes
    and sources (exit 26 on a mismatch). It then waits until `window.__p127` is an object (STOP exit 28 after 10 s).
    - Three boxes: `#tsel` (attribute `data-sel`, read by the rule `.t[data-sel="b"] { width: 120px }`), `#tnosel`
      (attribute `data-nosel`, read by no rule) and `#iotarget` (the IO target, always in view).
    - One round:
      - io: a new IntersectionObserver per round; its first callback disconnects it and does the round;
      - raf: one rAF callback;
      - timer: one `setTimeout(..., 0)` callback.
    - Rounds start 100 ms apart. The round itself is `performance.mark('p127:<spec>:<i>')`, the write (in function
      `p127write`), then `performance.mark('p127end:<spec>:<i>')`.
    - Write kinds:
      - change: `b`/`a` alternating, so every write changes the value;
      - same: always `a`, the value already set;
      - none: marks only.
  - Arms, in this order (`PLAN` in `p127-capture.mjs` `e93886c95d56`), 30 rounds each:

    | depth | arms (spec = cause-kind-attr) |
    |---|---|
    | 16 (15 arms) | {io, raf, timer} x change-sel; x same-sel; x none; x change-nosel; x same-nosel |
    | 1 (4 arms) | io-change-sel, raf-change-sel, timer-change-sel, io-same-sel |

  - Per arm, on the capture's own inspector connection (one connection for the whole run), in order:
    1. `__p127.reset()` (both attributes `a`), then two rAFs.
    2. Timeline start: exactly wip.mjs `TIMELINE_START` with only the depth replaced: `Page.disable {}`, `Page.enable {}`,
       `Timeline.enable {}`, `Timeline.setInstruments {instruments: ['Timeline']}`,
       `Timeline.start {maxCallStackDepth: 16}` (depth-1 arms: `{maxCallStackDepth: 1}`).
    3. `__p127.run(spec, 30, 100)`.
    4. `Timeline.stop`, then wait for `recordingStopped` (at most 3 s) and drain 500 ms.
    The records are saved as sent (`out/toolbar-resize/sim127/tl-<arm>.json`).
  - **Dry record first (uncounted; ops' condition).** Arm `raf-change-sel` at depth 16, 5 rounds. The run continues only
    when at least one bracketed invalidation record has >= 2 stack frames. Otherwise STOP exit 27, before any counted arm.
    The stack-length histogram goes to `runs.jsonl`. This proves both that depth 16 gives multi-frame stacks and that the
    bracket is found.
  - Lane and cost: one shared slot, weight simulator, `--max-seconds 300`, in a functional session (no
    scroll/record/run). About 6 s per arm, 19 arms plus the dry record, about 2 min after the session settles. The
    capture stops itself 12 s before its 200 s budget (`SB_BUDGET_S`) and keeps the arms done so far.
    ```sh
    node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-toolbar-resize -- \
      sh -c 'node tools/fix.mjs serve toolbar-resize > out/toolbar-resize/serve127.log 2>&1 & S=$!; \
        node tools/wait.mjs serve out/serve-toolbar-resize.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
        node tools/sim.mjs session --functional --owner fix-toolbar-resize -- node fixes/toolbar-resize/p127-capture.mjs; \
        E=$?; kill $S; exit $E'
    node fixes/toolbar-resize/p127-read.mjs out/toolbar-resize/sim127 --json fixes/toolbar-resize/p127-read.json
    ```
- **Reader (frozen, rev 2: `p127-read.mjs` `53e4f4ab3bfd`; self-test `p127-selftest.mjs` `89d309d05aae`, 48 checks pass).**
  - Fields read, and nothing else:
    - per record: `type`, `children` (nesting and sibling order), `data.message` (TimeStamp only),
      `stackTrace.callFrames[].url` and `.functionName`;
    - `startTime` only for rule T and for rule W's window (ordering only);
    - per arm file: `arm`, `spec`, `depth`, `page.fired`.
    - No `endTime`, no durations.
  - Bracket (structural): a round's records are the siblings strictly between its two marks, with their descendants.
    The two marks must be siblings in the same parent, else the round is unbracketed. Container = the parent's type.
  - Shape of a ScheduleStyleRecalculation / InvalidateLayout record:
    - page: a frame on `/p127/`;
    - dom-call: frames, none of them page, the first one `[native code]`;
    - no-stack;
    - other.
  - Per-arm counts: rounds fired, marks, bracketed rounds, rounds with >= 1 record (and with a ScheduleStyleRecalculation
    or an InvalidateLayout), records by type and shape, stack lengths, page share, records whose stack names
    `p127write` or the callback.
  - Calls per arm:
    - RAISES: bracketed >= 20 and >= 80 % of them hold a record. NONE: <= 20 %. PARTIAL: in between. THIN: < 20
      bracketed.
    - STACK: PAGE, DOM-ONLY or STACKLESS at >= 80 % of the bracketed records; MIXED otherwise; n/a when there are none.
  - Rule T (descriptive, P-126's N4 form): per round, write time = the open mark's `startTime`. A hit is any invalidation
    record anywhere in the capture within 2 ms. The same is counted at -25 and +25 ms (background).
  - **Rule W (frozen, rev 2; lead and ops N2): stackless records downstream of a write.** It measures ops C1's follow-up
    case.
    - Window per round: from its end mark's `startTime` to the next round's open mark, capped at 100 ms. The last round
      gets end mark + 100 ms. Windows of two rounds never overlap.
    - A round counts when at least one stackless (no `stackTrace` frames) ScheduleStyleRecalculation or InvalidateLayout
      record, anywhere in the capture, starts in (end, end + window].
    - Call per arm, over rounds with an end mark: RAISES >= 80 %, NONE <= 20 %, PARTIAL in between, THIN under 20 rounds
      (floor 20).
    - Reported beside rule T's +-25 ms background (same capture, same arm). The none and same-sel arms are W's controls.
  - **Depth rule (lead).** Depth 16 adds overhead and can move frame boundaries. Per-round counts compare only within the
    same depth: the d16 arms with each other, and the d1 arms only with P-126, by stack shape. Never d1 counts against
    d16 counts.
- **Outcome table (frozen; computed by `outcomes()` in the reader).**

  | outcome | rule | what it means for P-126's NATIVE | next |
  |---|---|---|---|
  | CONTROL | every d16 none arm NONE | a cause whose none arm is not NONE is VOID in every row below | (VOID: fix the page, a new card) |
  | O1 SEEN-WITH-CALLER | d16-io-change-sel RAISES, PAGE | N4 (a) REFUTED: a write's own record keeps its caller, observer callbacks included. So a script write's own record in P-126's step frames sits in the dom-call bucket. Where P-126's no-stack surplus comes from stays open: engine work, or the follow-up of earlier writes (the InvalidateLayout raised later, while style is resolved in the rendering update, has no JS on the stack; prediction 8) (ops C1) | a depth-16 recapture of the step frames (own card) to name the dom-call callers; the no-stack surplus stays open (engine work vs write follow-up) |
  | O1 STACKLESS | RAISES, STACKLESS | (a) SUPPORTED: the no-stack surplus may hold observer-callback writes; NATIVE cannot exclude them | a recapture with marks around the showcase's IO callbacks (`fwNearChange` and peers) |
  | O1 CALLER-CUT | RAISES, DOM-ONLY | even depth 16 loses the caller in IO callbacks; stacks cannot name observer writers | as STACKLESS (marks, not stacks) |
  | O1 UNSEEN | NONE while raf and timer change-sel RAISE | the instrument shows no record for IO-callback writes; P-126 says nothing about them | a write log (MutationObserver) instead of Timeline |
  | O1 NO-RECORD | NONE, and a raf or timer change-sel not RAISES | the test raised nothing: VOID | fix the page |
  | O2 DOM-ONLY-AT-1 | d1 io/raf/timer change-sel all RAISES, DOM-ONLY | D1's (c) confirmed locally: at depth 1 a script write shows one `[native code]` frame | none |
  | O2 PAGE-AT-1 | any d1 change-sel PAGE | (c) REFUTED: D1's split misread the bucket | re-read D1 |
  | O3 NEVER / SOMETIMES (n) | no-stack bracketed records over the d16 write arms | NEVER: a write's own (bracketed) record is never stackless, for these write kinds. It does not say where P-126's no-stack surplus comes from: records raised later as the follow-up of a write (style resolution in the rendering update) carry no stack either (ops C1). SOMETIMES: a write's own record can be stackless (contradicts the source reading; report) | |
  | O4 SILENT / RECORDS | d16 same-sel arms all NONE / any RAISES | SILENT: P-126's 445 of 460 same-value matches were neighbours, and the 2 ms rule does not find a write's own record on a busy page. RECORDS: same-value writes invalidate in our setup (contradicts WebKit main; report) | |
  | O5 GATED / NOT-GATED | d16 change-nosel arms all NONE / any RAISES | GATED: only writes to attributes a selector reads raise records, so showcase writes matter only where a rule reads them | |
  | O6 (descriptive) | rule T on d16-io-change-sel vs d16-io-same-sel | how the 2 ms rule behaves on a quiet page (hits vs +-25 ms) | |
  | O7 DOWNSTREAM-STACKLESS (rev 2, N2) | per cause with CONTROL OK: rule W on d16 change-sel RAISES, and on d16 none and d16 same-sel NONE; overall = the common value of all OK causes | a script write is followed by stackless records (its follow-up during style resolution). So a stackless surplus can come from script writes, and P-126's no-stack surplus alone is no evidence of engine-only work | the no-stack surplus needs marks or a write log, not stacks, to split writes from engine work |
  | O7 NONE-DOWNSTREAM | change-sel W NONE | on a quiet page one write raises no stackless follow-up within 100 ms, so the follow-up reading of C1 gets no support here. Limit: first-only records; on a busy frame the follow-up may still merge with other work | the no-stack surplus leans to engine work (still OBSERVED) |
  | O7 BACKGROUND | change-sel W RAISES, and none or same-sel W RAISES too | stackless records come without the write; W cannot separate follow-up from background | none (W says nothing) |
  | O7 MIXED / VOID | any PARTIAL or THIN, or causes disagree / no cause with CONTROL OK | no call | |

  - **Limits.**
    - InvalidateLayout counts first invalidations only.
    - ScheduleStyleRecalculation counts the first schedule while no recalc is pending. On a busy frame (P-126's step
      frames), later writes in the same frame leave no record of their own. So P-127's per-round counts give the shape
      of a write's record, not a rate that transfers to P-126.
    - The capture's own `Runtime.evaluate` polls (`runAsync`, every 500 ms) add records outside the brackets. Rule T's
      background measures them.
    - Simulator, not the phone. Any real-iPhone arm is a separate ask with its own ticket (lead).
    - Write kinds (ops N3): only `setAttribute` from IO, rAF and timer callbacks is tested. Writes to a style property,
      `classList` and custom properties are not, and the write-up says so.
    - The bracket assumes Timeline records `performance.mark` as a TimeStamp record (P-125 found its own sync marks that
      way; no source line cited). The dry gate checks it. If the dry record stops (exit 27), the card is revised; the data
      is not reinterpreted (ops N1).
- **Predictions (registered before data).**

  | # | prediction | p |
  |---|---|---|
  | 1 | the dry record passes (a bracketed record with >= 2 frames) | 90 % |
  | 2 | CONTROL OK for io, raf and timer | 85 % |
  | 3 | O1 SEEN-WITH-CALLER | 75 % |
  | 4 | O2 DOM-ONLY-AT-1 | 85 % |
  | 5 | O3 NEVER | 80 % |
  | 6 | O4 SILENT (source) | 80 % |
  | 7 | O5 GATED (source) | 80 % |
  | 8 | in the d16 change-sel arms, <= 20 % of bracketed rounds hold an InvalidateLayout (the layout dirtying comes later, in style resolution, outside the bracket) | 70 % |
  | 9 | io rounds' container is ObserverCallback or FunctionCall in >= 80 % of rounds | 60 % |
  | 10 | O6: io change-sel 2 ms hits >= 80 % of rounds, io same-sel <= 20 % | 60 % |
  | 11 | O7 DOWNSTREAM-STACKLESS (rev 2; the width change dirties layout during style resolution in the next rendering update, with no JS on the stack) | 65 % |

  Predictions 1-10 are unchanged from rev 1 (97667ac9); 11 is new in rev 2.
- **Rev 3 (after rev 2's signature, before any data): the page script could not run.**
  - The signed rev 2 run (2026-10-05 03:22Z, shared slot, Simulator) stopped before the dry record. The first
    `__p127.reset()` failed with `ReferenceError: Can't find variable: __p127`. No Timeline was started, and no arm and no
    dry record exist. The attempt's log is kept outside `sim127/` (`out/toolbar-resize/sim127-rev2-attempt1/`, gitignored),
    so `sim127/` is empty again.
  - Cause 1: the mirror server sends every HTML page with `content-security-policy: ... script-src 'self'`
    (`tools/lib/mirror-handler.mjs` `localCsp`, the default for a page with no production CSP; seen in the served headers).
    Without `'unsafe-inline'`, a nonce or a hash, a CSP blocks inline `<script>` (CONFIRMED: CSP Level 3 §6.7.3.3 "Does element
    match source list for type and source?" and §4.2.3, https://www.w3.org/TR/CSP3/#match-element-to-source-list; MDN `script-src`,
    `'unsafe-inline'`). Rev 2's page script was inline.
  - Cause 2: the capture's readiness loop took `typeof __p127` as ready. That is the string `"undefined"`, which is truthy,
    so it did not catch the blocked script.
  - Fix, text and code only:
    - the script moves unchanged into `p127-page.js`, served as `/p127/p127.js`; the page loads it with
      `<script src="p127.js">` (same origin, allowed by `'self'`);
    - the capture copies and checks both files, and waits for `typeof window.__p127 === 'object'`, else STOP 28.
  - Unchanged: the reader and self-test (a page frame is still any url containing `/p127/`, and `/p127/p127.js` does),
    every rule, outcome and prediction, the plan, rounds, gap and depth. The function names the reader matches
    (`p127write`, `p127round`, `p127io`, `p127raf`, `p127timer`) are unchanged.
  - Checked before re-sign: the served headers (HTML with `script-src 'self'`, JS `application/javascript` from the
    overlay) and the script in a node stub (every cause and kind fires its rounds). No browser run.
- **Pins.**
  - page `503385ed36a8`, page script `457f3abc43f1` (new), capture `e93886c95d56`, reader `53e4f4ab3bfd`,
    self-test `89d309d05aae`;
  - rev 3 changed the page (script moved out), added the page script and changed the capture (copies both files,
    readiness check). Rev 2 pins: page `05ab5364cbc6`, capture `5dae67bd2ab1`. The reader and self-test are unchanged
    from rev 2;
  - rev 2 changed the reader (rule W, O7) and the self-test (33 to 48 checks). Rev 1 pins: reader `9f691bfa77eb`,
    self-test `253346c592e4`. The page and the capture are unchanged, and no data exists yet (`out/toolbar-resize/sim127/`
    is empty);
  - `tools/lib/wip.mjs` as imported (`TIMELINE_START`, `openTab`, `runAsync`) `3dcab04e362a`.
  - sha256, first 12 hex.
- **Pixel and behaviour.** It is a test page only. No Fastwork code is changed or served differently, so no pixel check
  applies.

## Result P-127 (Simulator, count-only; run 2026-10-05 03:34Z, rev 3 signed 03:33:13Z)

- **Run.**
  - Shared slot, Simulator weight, functional session (fw-sim 15 Pro Max). Capture `e93886c95d56`, page `503385ed36a8`, page
    script `457f3abc43f1`.
  - Both served files matched and came from the overlay; `__p127` was ready.
  - The dry record passed: 5 bracketed records, each with a 4-frame stack.
  - All 19 counted arms ran. Every arm fired 30 of 30 rounds, and all 30 were bracketed.
  - Simulator background: mean 72 % of a core (sim.mjs `SIM_BACKGROUND`). These are counts, not timings, so this is
    context only.
  - Every arm after the dry record logged `Timeline.enable: Timeline domain already enabled`: the domain stayed enabled
    from the arm before. `Timeline.start` still ran at each arm's depth: d16 arms show 4-frame stacks, d1 arms 1-frame.
    The command list sent is the one in the card.
  - The rev 2 attempt (`sim127-rev2-attempt1/`, no Timeline) is never counted.
- **Reader output** (frozen reader `53e4f4ab3bfd`; `p127-read.json` `310a987080f8`):

  | arms | bracketed rounds with a record | stack | frames | rule T 2 ms hits (+-25 ms) | rule W |
  |---|---|---|---|---|---|
  | d16 change-sel: io, raf, timer | 30/30 each (ScheduleStyleRecalculation 30, InvalidateLayout 0): RAISES | PAGE | 4 | 30/30 (0, 0) | 30/30: RAISES |
  | d16 same-sel, none, change-nosel, same-nosel: x io, raf, timer (12 arms) | 0/30 each: NONE | n/a | | 0/30 (0, 0) | 0/30: NONE |
  | d1 change-sel: io, raf, timer | 30/30 each (ScheduleStyleRecalculation 30): RAISES | DOM-ONLY | 1 | io 29, raf 30, timer 29 (0, 0) | 30/30: RAISES |
  | d1 io-same-sel | 0/30: NONE | n/a | | 0/30 | 0/30: NONE |

  The container is FunctionCall in 30 of 30 rounds of every arm, IO included.
- **Outcomes** (`outcomes()`):

  | outcome | result |
  |---|---|
  | CONTROL | OK for io, raf and timer |
  | O1 | SEEN-WITH-CALLER |
  | O2 | DOM-ONLY-AT-1 |
  | O3 | NEVER (0 stackless bracketed records) |
  | O4 | SILENT |
  | O5 | GATED |
  | O6 | io change-sel 30/30 hits, io same-sel 0/30, background 0 at +-25 ms |
  | O7 | DOWNSTREAM-STACKLESS for io, raf and timer |

- **Predictions: all 11 hold.**

  | # | prediction | p | result |
  |---|---|---|---|
  | 1 | dry passes | 90 % | holds (5 records, 4 frames) |
  | 2 | CONTROL OK | 85 % | holds |
  | 3 | O1 SEEN-WITH-CALLER | 75 % | holds |
  | 4 | O2 DOM-ONLY-AT-1 | 85 % | holds |
  | 5 | O3 NEVER | 80 % | holds |
  | 6 | O4 SILENT | 80 % | holds |
  | 7 | O5 GATED | 80 % | holds |
  | 8 | d16 change-sel: <= 20 % of bracketed rounds hold an InvalidateLayout | 70 % | holds (0 %) |
  | 9 | io container ObserverCallback or FunctionCall >= 80 % | 60 % | holds (FunctionCall 100 %) |
  | 10 | O6: io change >= 80 %, same <= 20 % | 60 % | holds (100 %, 0 %) |
  | 11 | O7 DOWNSTREAM-STACKLESS | 65 % | holds |

- **What it means for P-126's NATIVE** (the frozen table's meanings; OBSERVED in our setup, Simulator, one quiet test page):
  - O1: a script write's own record keeps its page caller at depth 16, observer callbacks included. N4 (a) "stacks
    dropped in observer callbacks" is REFUTED locally. At depth 1 the same record shows one `[native code]` frame (O2), so
    addendum D1's (c) is confirmed locally. Script writes' own records in P-126's step frames therefore sit in the
    dom-call bucket.
  - O7: every changing write was followed by one stackless InvalidateLayout record, and no none or same-value round was.
    So a stackless surplus can come from script writes, and P-126's no-stack surplus alone is no evidence of engine-only
    work (ops C1).
  - O3: a write's own record was never stackless. That says nothing about where P-126's no-stack surplus comes from (C1).
  - O4 and O5: same-value writes, and writes to an attribute no selector reads, raise no record. This matches WebKit main's
    source (CONFIRMED, card) and is now OBSERVED locally. A showcase write matters only where it changes a value that a
    rule reads.
  - O6: on a quiet page, the 2 ms rule finds every changing write and no same-value write, with no background. P-126's
    busy step frames break this (first-only records), so the rule's P-126 counts stay neighbour counts.
- **Descriptive add-on (post hoc, not frozen, decides nothing; `p127-desc.mjs` `2e9c140738ce`).** In all six change-sel
  arms (d16 and d1), every rule-W record is an InvalidateLayout nested in RenderingFrame > RecalculateStyles. It starts
  0.0-0.4 ms after the round's end mark (one IO round at 6.1 ms). So the follow-up is the layout dirtying from style
  resolution (the `width` change) in the rendering update right after the write. That is prediction 8's mechanism,
  OBSERVED. For the timer cause the rendering update came within 0.4 ms of the callback, not at a later display tick: in
  our setup, cause unknown.
- **Scope (lead D1, ops N3).**
  - O7 came out DOWNSTREAM-STACKLESS, so D1's NONE-DOWNSTREAM limit is not triggered, but the same scope holds for every
    reading above: one `setAttribute` per round, on one element, on a quiet page, in the Simulator. All of it is OBSERVED.
  - Not tested: style-property, `classList` and custom-property writes; busy frames, where first-only
    ScheduleStyleRecalculation and InvalidateLayout hide later writes; the real iPhone.
  - The page script is unchanged code from rev 2's inline script (not byte-identical: a 4-line header and one indent level
    less).
- **Next (from the frozen table; each needs its own card and the lead's go).**
  - O1: a depth-16 recapture of P-126's step frames, to name the dom-call callers.
  - O7: splitting P-126's no-stack surplus into write follow-up and engine work needs marks or a write log
    (MutationObserver), not stacks.

## Prediction P-128: which JS functions make the DOM calls in the in-view toolbar-step frames? (Simulator, count-only census, registered before data)

P-id P-128 (the lead, after P-127's O1: "name the callers of the script writes"). The lead first asked for a depth-16
recapture of P-126's step frames. That cannot run in the shared lane as tools/ stands:
- the step frames need a WDA gesture;
- in a functional session, `sim.mjs gesture --count-only` refuses `--timeline` (I-184: "a WebKit Timeline is timing");
- a second inspector connection next to the gesture's own is the I-038 failure (one client per page);
- the gesture's own `--timeline` is fixed at depth 1 (I-198, P3).

So the lead chose (2026-10-05) an in-page stack census instead: shared lane, count-only, v8-best overlay, 5 runs of
`flick-hero-v1`, frozen reader. The literal Timeline recapture stays a later option if the census leaves the caller
question open. Gates: this card, then mgmt-ops-10's pre-data read, then the lead's signature. `out/toolbar-resize/sim128/`
stays empty until then. The trigger stays OBSERVED in all text.

- **Question.** P-126 addendum D1 split the depth-1 `native` key. A DOM-call bucket of invalidation records with one
  `[native code]` frame is RATE-LINKED to the heavy in-view step frames (C: 53 over 22 frames, against 129 over 435
  control frames, RR 8.12). Four functions fill it: `setAttribute` 21, `classList.toggle` 13, `getBoundingClientRect`
  10, `style.setProperty` 9. Their JS callers were cut off by the depth. Which page functions make those four calls more
  often in the in-view step frames than at rest, and do they change anything when they do?
- **Instrument: an in-page census, not a Timeline** (`p128-inject.mjs`, through the gesture tool's own `--inject` on its
  own connection, as P-125's logger).
  - **Wrappers** on the prototypes, all pass-through.
    - Deciding: `Element.setAttribute`, `DOMTokenList.toggle`, `CSSStyleDeclaration.setProperty` (each records whether
      it changed the attribute, the class state, or the value and priority) and `Element.getBoundingClientRect` (a read).
    - Descriptive only (the cousins, never deciding): `removeAttribute`, `toggleAttribute`, `classList.add` / `remove` /
      `replace`, `style.removeProperty`.
  - **Stack.** Each wrapped call records `new Error().stack`, its own frames stripped (the install expression carries
    `//# sourceURL=p128-inject.js`), at most 16 lines, urls cut to the path from `/_app/` (no host).
  - **Frames.** A rAF loop pushes `[innerHeight, round(scrollY), view]` each tick. `view` is the showcase IO's latest
    `isIntersecting` (IO root = viewport, rootMargin 0, threshold 0, as P-125). A call made while k ticks have been
    logged belongs to frame k. **No timestamps anywhere**: calls bin by rAF order.
  - **The wrappers change what they wrap.** Each wrapped call now also runs the wrapper and `new Error().stack`. This is a
    counted check, never a timing number, and the record holds no time. The extra work can shift frame pacing, so the
    per-frame counts are counts under the census, not under the plain page. Calls made through a reference the page
    took before the inject installed bypass the wrapper (an undercount). Direct property sets (`el.style.x = …`,
    `el.className = …`) are not wrapped.
- **Runs (one shared slot, weight simulator, 300 s; `sim-p128.mjs`).** `fix.mjs serve v8-best` (JS `3e3e94cb6e9f`, CSS
  `f836404b3728`, both from the overlay; else exit 26), `wda start`, then C:H1..C:H5. Each run is `sim.mjs open` plus
  `sim.mjs gesture flick-hero-v1.json --count-only --inject p128-inject.mjs`.
  - **Run-1 gate (rev 2, ops N2):** after the first run its record must pass the reader's run gate (`runGateWhy`,
    shared by driver and reader): an inject value, installs >= 1, the four deciding wrappers, the showcase IO, >= 100
    frames, an innerHeight range >= 30 px, and >= 1 call whose stack has a `/_app/immutable/` line with `:line:col`.
    Else STOP exit 27 before any further run. (Rev 1 checked only the stack format here.)
  - **Wrapper frames (rev 2, ops N3):** every run logs `ownFramesLeft`, the calls whose stack still holds a
    `p128-inject.js` line, i.e. whether JSC dropped the wrapper's frames by sourceURL. Logged only: the caller key skips
    to the innermost page line either way.
  - **Budget stop** at < 45 s left (`SB_BUDGET_S=250`). Dropped runs go into one more shared slot under the same names,
    and the result says so.
  - **Command (in `sim-p128.mjs`'s header):** `node tools/lock.mjs run chrome-measure --shared --weight simulator
    --max-seconds 300 --owner fix-toolbar-resize -- sh -c '<serve v8-best; wait.mjs serve; SB_BUDGET_S=250 sim.mjs
    session --functional -- node fixes/toolbar-resize/sim-p128.mjs C:H1 … C:H5; kill the server>'`. It runs in the
    background (fg-guard).
- **Reader** `p128-read.mjs` (frozen; imports `coincidence` and `rateRule` from `score-p125.mjs` `c52de0edd5d3` and
  `REGIONS` from `read-inval126.mjs` `4f920b6450f7`, unchanged). Rules, as its header states:
  1. **Gate per run** (a run that fails is not read). The run must have:
     - an inject value (the segment with the most frames) with installs >= 1;
     - the four deciding wrappers installed;
     - the showcase IO installed;
     - >= 100 frames;
     - an innerHeight range >= 30 px (a toolbar step happened);
     - >= 1 call with a page stack line;
     - `runs.jsonl`'s served record at JS `3e3e94cb6e9f` and CSS `f836404b3728`, both from the overlay.

     Fewer than 3 valid runs: INSUFFICIENT.
  2. **Frames.**
     - STEP = moving (lo < ih < hi), y < 3250, view 1. This is P-125's in-view step frame without its Layout test, because
       no duration is read here. P-126 ops R2 found every in-view mid-step frame heavy in all 9 P-125 runs, so STEP stands
       in for HEAVY as a geometry class. It says nothing about cost.
     - CONTROL = not moving, y < 3250, view 1 (this includes scrolling frames at a settled toolbar). When fewer than 20 are
       pooled, CONTROL is every not-moving frame with y < 3250 ("wide").
     - A frame carries a feature when it or the previous frame has a call with it.
  3. **Caller key.**
     - The innermost stack line in `/_app/immutable/nodes/` (the route's component code, so a Svelte runtime helper in
       `chunks/` does not hide its caller). In `2.DyWL8TcE.js` it maps to P-126's regions (fwWC, sceneCE, sceneB,
       sceneC; padded by 1), else `<file>:<fn>@<line>`.
     - With no nodes line: the innermost `/_app/immutable/` line.
     - Else the first other url as `ext:…`.
     - Else `probe` (frames without a url: injected code such as the gesture recorder) or `native`.
     - HELPER (the innermost page line) and ENTRY (the outermost page line) are descriptive.
  4. **Features.**
     - Deciding: `setAttribute:<caller>`, `toggle:<caller>`, `setProperty:<caller>` (changed calls only) and
       `gBCR:<caller>` (every call).
     - Descriptive: the cousins (changed only) and `same:<api>:<caller>` (unchanged writes, any api).
  5. **Links.** C pooled, P-126 rules 5 and 5b unchanged:
     - presence (THIN when H < 5; COVERS when Hw >= 10, hLo >= 2 x base and h >= 0.8; LINKED-PART when Hw >= 10 and
       hLo >= 2 x base; else NO-LINK);
     - rate: calls in STEP frames against CONTROL frames, RATE-LINKED when s >= 20 and RRlo >= 2.
     - **Spread (rev 2, ops C1).** The rate counts calls, and DOM calls cluster: one loop of 20 calls in one STEP frame
       would clear the floor. A RATE-LINKED feature links only when its calls fall in >= max(5, 2 x runs) = 10
       distinct STEP frames (own interval, no carry) and in >= 3 valid runs. Otherwise it reads **RATE-CLUSTERED**,
       descriptive, never LINKED.

     LINKED = COVERS, LINKED-PART, or RATE-LINKED with the spread.
  6. **Reading (frozen).** A deciding feature counts unless its caller is `probe` or `native`.

     | reading | rule |
     |---|---|
     | NAMED(features) | some counting deciding feature whose caller is not fwWC is LINKED |
     | FWWC-ONLY | none such, and a deciding feature with caller fwWC is LINKED (P-125's wc1 removed fwWC's toggles without effect) |
     | NONE-LINKED | no counting deciding feature is LINKED |
     | THIN | < 5 STEP frames pooled |
     | INSUFFICIENT | < 3 valid runs |

  7. **Descriptive (no call uses it).**
     - B1, the bucket check: per deciding api, all callers pooled, `rateRule` STEP vs CONTROL.
     - pageShare: the share of deciding-api calls in STEP frames with a page line.
     - Per LINKED feature: its attribute, property or token names, ENTRY and HELPER, and per-run s, r and RR (ops N2:
       calls cluster within frames, so the pooled bound is optimistic).
     - The cousins and the unchanged writes, LINKED or not.
     - The RATE-CLUSTERED features (rate, spread frames and runs).
     - **Rev 2, ops N1:** per LINKED feature, calls per frame in STEP frames, in CONTROL frames whose y moved since the
       previous frame, and in CONTROL frames whose y did not. STEP frames are the earliest and fastest frames of the
       flick, so a caller driven by scrolling can link to them as well. This split tells an arm card which it is.
  8. **Wording (ops answer a).** STEP frames here are chosen without a Layout test. The write-up never calls a census
     frame heavy; the link to P-125/P-126's heavy frames is only that they were the same in-view step frames.
- **Self-test** `p128-selftest.mjs`: `SELFTEST PASS (82 checks)`, synthetic data only.
  - The inject itself, in a node vm with a stub DOM:
    - pass-through;
    - the changed flags for a value change and a same value, toggle, setProperty, gBCR and the cousins;
    - frame binning before the first rAF and after it;
    - own-frame stripping by sourceURL;
    - <= 16 lines.
  - The stack keys on JSC-format lines:
    - a nodes line wins over a chunk helper;
    - HELPER and ENTRY;
    - the fwWC and sceneCE regions and their padding;
    - chunk-only, ext, probe and native.
  - The reader on synthetic runs:
    - NAMED for a changed write in every STEP frame;
    - unchanged writes and cousins LINKED but never deciding;
    - FWWC-ONLY;
    - a probe caller never deciding;
    - gBCR deciding without a changed flag;
    - an equal rate at rest giving NONE-LINKED;
    - the rate floor (19 not linked, 20 linked);
    - the previous-frame carry counting for presence and not for rate;
    - the gate (missing wrappers, no toolbar step, no IO, served-bytes mismatch, no page stack line) giving
      INSUFFICIENT, never NONE-LINKED;
    - THIN, and the wide control out of view.
  - Rev 2 (ops C1, N1-N3):
    - one clustered frame per run (30 calls in one STEP frame of each of 5 runs: 5 frames < 10) reads RATE-CLUSTERED,
      not deciding, NONE-LINKED;
    - a rate link spread over 50 STEP frames of only 2 runs reads RATE-CLUSTERED, NONE-LINKED;
    - a rate link in every STEP frame of 5 runs (presence NO-LINK at a high base) is LINKED and NAMED;
    - the rev-1 rate-floor case (20 calls in run 1 only) is RATE-CLUSTERED;
    - N1's split of CONTROL into y-moved and still frames sums to CONTROL;
    - `runGateWhy` for each gate reason, and `ownFramesLeft`.
- **What each reading leads to (frozen before data).**

  | reading | next step |
  |---|---|
  | NAMED(f) | for each named function, an arm card. Its first gate is a count-only target check in the shared lane: the arm removes or defers that call in step frames, counted by this census. Only then a card asks whether the heavy Layout goes (that needs a Timeline or Layout count and its own hold). Any build gets the PR-010 pixel A/A before F. |
  | FWWC-ONLY or NONE-LINKED | the step frames' DOM calls have no caller beyond fwWC (known not to be the trigger, P-125). Next is option 2 (split P-126's no-stack surplus into write follow-up and engine work: marks or a write log), or the literal depth-16 Timeline recapture (I-198 plus one exclusive hold); the lead picks. |
  | THIN or INSUFFICIENT | the missing runs go in one more shared slot; if it stays, the lead decides. |

- **Scope (carried over: lead D1, ops N3, ops R1-R3 from the P-127 result read).**
  - **R1, the setAttribute-only limit.** P-127 links a call to an invalidation record only for a changed `setAttribute`
    on an attribute a selector reads. For a changed `toggle` or `setProperty`, and for a `getBoundingClientRect` read,
    nothing here or in P-127 shows that it raises a ScheduleStyleRecalculation or InvalidateLayout record. So P-126's
    dom-call bucket is not read as "all script writes". A NAMED feature names a function whose DOM calls are more frequent
    in step frames. It does not name a cause of the heavy Layout.
  - **R2.** O7 says nothing about busy frames, and STEP frames are busy. This census reads no Timeline record, stackless
    or otherwise, so it does not try to tell a write's follow-up from engine work. That split is option 2, still waiting.
  - **R3.** There is no Timeline in this card, so nothing needs disabling between runs. If the later Timeline recapture
    comes, it disables Timeline between arms.
  - **D1.** Every reading is OBSERVED, in the Simulator, on v8, in one gesture script. It covers only what the wrappers
    see (rule above).
- **Frame binning differs from P-125 (disclosed).**
  - P-125 binned by stamps, a frame covering (t - dt, t] with the IO entry time <= t.
  - Here a frame is the interval between two rAF callbacks of the census loop, and `view` is the IO state at that rAF.
    IO callbacks are delivered after the update, so `view` can lag one frame at a crossing.
  - Page rAF callbacks that run after the census loop's callback in the same tick bin into the next frame. The
    previous-frame carry absorbs this for presence; the rate counts each call once.
- **Pixel and behaviour.** No build comes from this card. The wrappers pass every call through and change no value
  (self-test). Nothing is served beyond the v8-best overlay.
- **Predictions (before data; one probability each; my leans missed in P-110, P-115, P-119, P-123, P-125 (4/5) and
  P-126 (held 6 of 10); P-127 held 11 of 11).**

  | # | prediction | p |
  |---|---|---|
  | 1 | all 5 runs pass the gate | 80 % |
  | 2 | all 5 runs fit in one shared slot (no budget stop) | 65 % |
  | 3 | reading NAMED (some deciding non-fwWC caller LINKED) | 65 % |
  | 4 | `setAttribute:fwWC` LINKED (reported; P-125's write coincidence was COVERS) | 75 % |
  | 5 | a `gBCR:<caller>` is LINKED (P-126 D1: 10 such records in heavy frames, 0 in 435 control frames) | 55 % |
  | 6 | a `toggle:<caller>` is LINKED | 40 % |
  | 7 | a `setProperty:<caller>` is LINKED | 45 % |
  | 8 | no scene-region caller (sceneCE, sceneB, sceneC) is LINKED | 80 % |
  | 9 | B1 pooled over the four apis is RATE-LINKED (the census sees the bucket's step surplus) | 80 % |
  | 10 | pageShare >= 0.95 (the step frames' deciding calls come from page code, not the probe or ext) | 80 % |

  Why the lean is NAMED: the bucket's gBCR and setProperty records sit almost only in step frames (P-126 D1). The
  census counts every call, not only the first invalidation, so s should clear the floor of 20 that the records missed.
  Against it: a step-linked caller may be the scroll engine's resize path, called from a chunk with no nodes line. That
  still names a caller (a chunk key), so it does not lower NAMED.
- **Cost.** One shared Simulator slot (about 4-5 min), no exclusive hold, no phone, no timing number.
- **Pins (sha256/12).**

  | file | hash |
  |---|---|
  | `p128-inject.mjs` | e44cdd1f9e9a |
  | `sim-p128.mjs` | 247980631fd9 (rev 2; rev 1 e1df2c982108) |
  | `p128-read.mjs` | db7dab05773e (rev 2; rev 1 881d93fe1d45) |
  | `p128-selftest.mjs` | c550069e20d2 (82 checks; rev 1 c8bc6f4a6910, 57) |
  | `flick-hero-v1.json` | 6ae05e12ace9 |
  | `score-p125.mjs` (imported) | c52de0edd5d3 |
  | `read-inval126.mjs` (imported) | 4f920b6450f7 |
  | served JS / CSS (v8-best overlay) | 3e3e94cb6e9f / f836404b3728 |

- **Rev 2 (mgmt-ops-10's pre-data read of rev 1: PASS with condition C1; on main as 133374f7).** Applied before any data:
  - C1, the spread condition on rate links (rule 5) and RATE-CLUSTERED, with self-test cases; the reader and self-test
    re-pinned;
  - N1, the y-moved and still CONTROL rates per LINKED feature (rule 7, descriptive);
  - N2, run 1's STOP 27 applies the reader's whole run gate (one shared function);
  - N3, `ownFramesLeft` logged per run;
  - N4, rebased on main before the re-pin.
  - Ops' answers: STEP without a Layout test is fine under rule 8's wording; the caller key and the format gate stand.
    Predictions stay as registered (prediction 3, NAMED, 65 %).
  - Ops' delta check of rev 2: PASS (65734941; self-test re-run PASS 82, pins match, no data). **Signed by the lead
    2026-10-05T04:09:22Z** on rev 2 (2b5eedc8). The data was taken after the signature.

## Result P-128: in-page stack census (Simulator, count-only; rev 2 signed 04:09:22Z)

**Reading (frozen reader rev 2, db7dab05773e): FWWC-ONLY.** In the in-view toolbar-step frames, the only deciding
feature that links is `setAttribute:fwWC` (the `data-fw-wc` write at JS 2742), which P-125 already showed is not the
trigger. No other wrapped caller links. Per the frozen table, next is option 2 (split P-126's no-stack surplus into
write follow-up and engine work) or the literal depth-16 Timeline recapture; the lead picks. Everything below is
OBSERVED, in the Simulator, on v8 (v8-best overlay), in one gesture script (D1), and covers only the wrapped functions.
Census frames are rAF intervals chosen without a Layout test; none of them is called heavy here (rule 8).

- **Runs.** Slot 1 (shared, weight simulator): C-H1..C-H4 passed the gate. C-H5's gesture was refused by `sim.mjs`'s own
  budget guard (about 49 s needed, 30 s left in the hold), so it recorded no inject value. As carded, C-H5 ran in a
  second shared slot under the same name and passed. Served bytes: JS 3e3e94cb6e9f and CSS f836404b3728, from the
  overlay, in both slots. Inject e44cdd1f9e9a, script 6ae05e12ace9. The gesture tool's pull-to-refresh guard ended
  one or two "back to top" loops early in C-H2..C-H5 (page at y 47-139). All runs still crossed the toolbar range
  (ih 775-815). Simulator background CPU was high in slot 1 (mean 79 % of a core, load1 up to 90; slot 2 mean 65 %).
  Under I-082 the per-frame counts carry that context, though no timing is read here.

  | run | frames | STEP | CONTROL | calls (all apis) |
  |---|---|---|---|---|
  | C-H1 | 1111 | 1 | 44 | 3125 |
  | C-H2 | 1121 | 2 | 77 | 2959 |
  | C-H3 | 1203 | 2 | 92 | 3285 |
  | C-H4 | 1190 | 2 | 102 | 3290 |
  | C-H5 | 984 | 5 | 130 | 1758 |
  | pooled | | **12** | 445 | |

- **Power (the main limit of this reading).**
  - Only 12 STEP frames were pooled. That clears the THIN rule (>= 5), but it leaves the presence rule needing a
    feature in >= 10 of the 12 frames, and the rate rule needing >= 20 calls.
  - So FWWC-ONLY says: no other wrapped caller makes calls in almost every STEP frame, or 20+ step-frame calls with
    RRlo >= 2.
  - A caller that writes once per toolbar step stays below both floors (see "below the floors").
- **Linked feature.** `setAttribute:fwWC`:
  - presence COVERS (10/12, base 0.142);
  - rate 29/12 against 52/445, RR 20.7, RRlo 13.7;
  - names `data-fw-wc` (29), entry `2.DyWL8TcE.js:?@2742`.
  - Its C1 spread is 9 STEP frames over 5 runs, under the 10 needed. On rate alone it would read RATE-CLUSTERED; it
    links by presence.
  - N1: calls per frame are 2.42 in STEP frames, 0.145 in CONTROL frames where y moved, and 0.011 in still CONTROL
    frames.
  - Per run (s/Fs against r/Fr): 4/1 vs 9/44, 7/2 vs 11/77, 6/2 vs 10/92, 2/2 vs 12/102, 10/5 vs 10/130.
- **Not linked (deciding apis, descriptive).**
  - gBCR callers in 8-10 of the 12 STEP frames (`F@13843`, `_@13899`, `l@12151/12157/12171`) are about as frequent at
    rest (base ~0.71; rate RRlo 0.6-0.8). They are frame-loop reads, not step-specific.
  - No changed `setProperty` was made in any STEP frame (0/12; 30 in CONTROL).
  - sceneCE: 1/12 (prediction 8 holds).
- **Below the floors (descriptive; one call per run, in one STEP frame of each of the 5 runs; spread 5 frames / 5 runs).**
  - `toggle@12338` (the `start-selling-future` section's `is-visible` / `is-future-shrinking` classes): 5/12 against
    32/445, RRlo 2.15.
  - `toggle@14241` (the top nav's class set, `is-scroll-hidden` among them): 5/12 against 21/445, RRlo 3.18.
  - The cousin `removeAttribute@14257/14258` (the nav button's `tabindex` / `aria-hidden`): 5/12 against 5/445.
  - These sit at the toolbar step at a step-to-rest ratio near fwWC's. At one call per run they cannot link with 5
    runs, and nothing here says they raise Layout (R1).
- **B1 (the bucket check, descriptive).**

  | api | STEP | CONTROL | RRlo | |
  |---|---|---|---|---|
  | setAttribute | 34/12 | 293/445 | 3.11 | RATE-LINKED |
  | toggle | 10/12 | 85/445 | 2.29 | under the floor of 20 |
  | setProperty | 0/12 | 30/445 | 0 | |
  | gBCR | 45/12 | 1443/445 | 0.89 | |
  | all four | 89/12 | 1851/445 | 1.48 | not linked |

  pageShare 1 (89/89 deciding calls in STEP frames have a page line).
- **N3, wrapper frames (OBSERVED, in our setup, cause unknown).**
  - `ownFramesLeft` was 0 in every run, but that is no evidence that the frames were stripped. Every recorded stack
    starts with url-less lines (`stack@`, `note@`, `@`, `@`): JSC did not attach the `//# sourceURL=p128-inject.js`
    name to the frames of the Runtime.evaluate script in `Error().stack`, so the strip did not fire.
  - The caller key is unaffected: it takes the innermost `/_app/immutable/nodes/` line, which is line 5 for the fwWC
    write.
  - Effect: of the 16 kept lines, 4 are the wrapper's. About 6-11 % of calls per run hit the 16-line cap, so their
    ENTRY (descriptive) can be cut short.
  - Not checked against WebKit docs or source. It stays OBSERVED and decides nothing here.
- **Predictions (registered before data): 4 of 10 held.**

  | # | prediction | p | outcome |
  |---|---|---|---|
  | 1 | all 5 runs pass the gate | 80 % | hit (C-H5 after its re-run in slot 2) |
  | 2 | all 5 runs fit in one shared slot | 65 % | miss (C-H5 refused by sim.mjs's gesture budget) |
  | 3 | reading NAMED | 65 % | miss (FWWC-ONLY) |
  | 4 | `setAttribute:fwWC` LINKED | 75 % | hit (COVERS 10/12) |
  | 5 | a `gBCR:<caller>` LINKED | 55 % | miss (base ~0.71 at rest) |
  | 6 | a `toggle:<caller>` LINKED | 40 % | miss (best 5/12, s 5 < 20) |
  | 7 | a `setProperty:<caller>` LINKED | 45 % | miss (0 in STEP) |
  | 8 | no scene-region caller LINKED | 80 % | hit |
  | 9 | B1 pooled RATE-LINKED | 80 % | miss (RRlo 1.48) |
  | 10 | pageShare >= 0.95 | 80 % | hit (1.0) |

  The lean on NAMED missed again: P-126's gBCR and setProperty records in the step frames have no step-specific
  wrapped caller at this power.
- **What this does not show.**
  - No caller of the step's heavy Layout is named.
  - The fwWC link repeats P-125's write coincidence, and P-125's wc1 arm already removed fwWC without effect.
  - The once-per-step class toggles (nav, start-selling-future) are candidates only. A card that wants them needs
    either more step frames (more runs or a script with more toolbar steps) or a count-only target arm.
- **Files.** `out/toolbar-resize/sim128/` (gitignored: `g-C-H1..5.json`, `runs.jsonl`, `read128.json`), slot logs
  `out/toolbar-resize/run128.log` and `run128b.log`. Reader output: `node fixes/toolbar-resize/p128-read.mjs
  out/toolbar-resize/sim128 C-H1 C-H2 C-H3 C-H4 C-H5`.

## Prediction P-131 (was PGP): page-side arms on the viewport-constrained renderers, v9-final (Simulator Timeline, registered before data)

**Card rev 1, before any data.** P-id P-131 (the lead, pre-sign ruling). Next: mgmt-ops-10's pre-data read, then the
lead's signature. No run before the signature. The files keep the prefix `pgp-` (pins unchanged).

- **Lead's pre-sign ruling (2026-10-05, before data):**
  - The swap is accepted: nvn and tps replace trk alone and pbx alone. The order stands:
    `C:H1 nvc:H1 nvn:H1 C:H2 tps:H1 tp:H1 C:H3 vu0:H1 tps:H2 C:H4`. The literal alternative below is not used.
  - A further hold for steps the budget stop drops needs the lead's OK at that time.
  - The hold queues FIFO behind P-129's and P-130's phone-block holds; nobody is moved.
  - Rebased onto main d4830f1e before the hold.

- **Basis (lead, 2026-10-05 ~09:3xZ, then the instrument choice):**
  - The script-caller line is closed (P-128).
  - The page-side gpu-props arm gets its own card, on choice A (P-109's instrument):
    - Simulator Timeline;
    - median largest Layout on the toolbar-moving hero frames;
    - each arm divided by its neighbouring C runs.
  - It is a **within-session mechanism ratio, never a gain** (F-084). It is the Safari layout attribution that the
    timing-deferral memory allows.
  - Hold: one normal exclusive hold of <= 10 min per stage, FIFO, nobody moved for it. It defers while P-129's phone
    block is marked.
  - Approved arms: trk, pbx, trk+pbx, vu0, and nvc (positive control, mechanism only).
  - For any arm that locates, the pixel check comes first.
  - The viewport-unit half is mostly answered (P-106 `dvh`, P-110, P-115 `svh`, P-123). vu0 is a cheap closer, not a
    main bet.
  - The first ruling named a count-only stage 1. My instrument message showed that count-only cannot see where Layout
    cost goes, and the lead chose A. So this card has no count-only stage.
- **Question.**
  - On v9-final, which viewport-constrained renderers carry the toolbar step's heavy Layout to the showcase?
  - Does a layout boundary (`contain: size layout`) above the sticky ones stop it, with their look kept?
- **What is known.**
  - Removing renderers:
    - P-109 nvc (hero, nav and pain made non-viewport-constrained together): LOCATES, ratio 0.017.
    - Every subset was NONE: P-106 `sticky` (the hero alone, phone), and P-110 nav, pain and nav+pain (Simulator).
  - The cost is the showcase (P-110 ps, ratio 0.032).
  - Containing the showcase does nothing (P-115 csl, P-119 cct). Only skipping it while it is off screen helps (P-119
    cva).
  - The working model M1 (R7, OBSERVED) says the box's own containment does not block the invalidation. This card puts
    boundaries on the stickies' ancestors, not around the showcase.
  - F-265 (arch-serious-heat): the step Layout runs in WebKit's Composite window with no JS on the stack, which fits the
    engine's viewport-change path. It stays **OBSERVED, in our setup**; this card cites no WebKit source for it.
- **WebKit source** (CONFIRMED; WebKit main `2d9f94fae5f57d291987f98c980ecab42dba6d29`, fetched with `gh api`; S1-S10
  above):
  - S2/S3: a change in the layout-viewport size marks every fixed or sticky renderer `setNeedsLayout()`.
  - R1: `isLayoutBoundary` returns true for a renderer with both layout and size containment
    ([RenderObject.cpp l.519-559, test at l.533](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/rendering/RenderObject.cpp#L519-L559)).
    A box with `overflow: visible` is never a boundary without it (l.539-543).
  - R2: `markContainingBlocksForLayout`
    ([l.596-658](https://github.com/WebKit/WebKit/blob/2d9f94fae5f57d291987f98c980ecab42dba6d29/Source/WebCore/rendering/RenderObject.cpp#L596-L658)):
    - an in-flow renderer (sticky is in flow) sets `normalChildNeedsLayout` up its container chain and stops at the
      first layout boundary (l.637-649);
    - an out-of-flow renderer (fixed) sets `outOfFlowChildNeedsLayout` on its containing block, and above that marks
      only simplified normal-flow layout (l.622-636).
  - **UNRESOLVED** (no source read covers it): what the S2 forced layout then visits, and why it reaches the showcase.
    The arms test it here.
- **v9-final facts.** Read from the v9 CSS `e1359ab9994a`, served from the `fixes/v9-best` overlay.
  - Viewport-constrained at phone width:
    - fixed: `.why-bring` (l.701), `.start-selling-people-o-preview` (l.2873), `.start-selling-morph` (l.10879),
      `.start-selling-top-nav` (l.11822);
    - sticky: `.hero` (l.1646, top 0), `.pain-sticky` (l.2538, top 0), `.action-footer` (l.4412, <= 860 px).
  - **New in v9:** `html.fw-ms .start-selling-platform { position: sticky; top: calc(100dvh - var(--fw-ms-h)) }`
    (l.12408). `html.fw-ms` is set by JS on touch phones at morph setup.
  - `.commission-sticky` (>= 1001 px) and `.start-selling-profile-sticky` (>= 861 px) are listed, and are harmless at
    phone width.
  - Each run's census records which of these are rendered.
- **Arms.**
  - Applied in the page by `pgp-inject.mjs`, after each load and before the Timeline starts (as in P-110 and P-115).
  - C = v9-final with the same injection and no rule.

  | arm | rule | asks | look |
  |---|---|---|---|
  | `nvc` | every fixed renderer → absolute, every sticky one → relative (the #platform rule also gets `top: auto`) | positive control on v9: does removing all S3 marks still remove the step Layout? | changed; mechanism only |
  | `nvn` | every sticky renderer → relative; the fixed ones stay | do the fixed renderers alone (R2: simplified path) keep the step Layout? | changed; mechanism only |
  | `tps` | `.hero-track { contain: size layout }` with the hero still sticky; every other sticky → relative | is a boundary above the sticky hero as good as removing its stickiness (compare nvn)? | the other stickies change; mechanism only. A look-safe form needs its own card |
  | `tp` | `.hero-track` and `section.pain` get `contain: size layout`; pain also gets `contain-intrinsic-block-size: <measured px>`; no position change | the shippable shape (trk+pbx): boundaries above the hero and pain stickies; #platform's sticky and the fixed nav stay | look-safe by design; pixel check first if it locates |
  | `vu0` | vh/svh/lvh layout values of the big subtrees pinned to their own computed px at load (12 declarations; dvh users left) | the cheap closer for the viewport-unit half | expected identical in portrait: svh/lvh are static by definition (CONFIRMED, CSS Values 4 §6.1.2 viewport variants: small and large viewport sizes do not change with UA interfaces); default `vh` staying fixed while the iOS toolbar moves is OBSERVED in our setup (P-115, P-123; WebKit S4 only shows vh comes from a separate override than dvh, no reference cited); the pixel check decides the look, first if it locates |

  - **Coverage.** nvc, nvn and tps cover every viewport-constrained renderer the census finds, not only the listed
    selectors. Any renderer still found after the rule gets an inline `!important` position and is listed in `extra`.
    Renderers that appear later are only reported, in `vcEnd`.
  - **Side effect, stated:** removing #platform's sticky also removes one dvh user (its `top`).
  - **Containment details.**
    - `.hero-track` keeps its box under `contain: size layout`: it already has `height: 200vh` (l.1632).
    - Layout containment makes it an independent formatting context and a containing block for fixed and absolute
      descendants. The census and the pixel check see that.
    - Pain's intrinsic block size keeps its height. The gate checks both heights.
- **Deviation from the approved list** (the lead signs or refuses it):
  - This card runs nvn and tps in place of trk alone and pbx alone. It keeps tp (= trk+pbx), vu0 and nvc.
  - Why: removing any one of the hero, nav or pain marks was NONE on v8 (P-106 hero; P-110 nav, pain, nav+pain).
    - trk alone is the look-safe form of P-106's hero arm; pbx alone is that of P-110's pain arm.
    - Both are predicted NONE (~80 %), so they would add little.
  - What nvn and tps decide instead:
    - whether the fixed renderers alone keep the cost (R2 says they mark only the simplified path);
    - whether a boundary works as well as removing stickiness, which is what a look-safe shape would need.
  - **Literal alternative.** The driver and the gate also take `trk` and `pbx`. If the lead signs the literal list:
    - order `C:H1 nvc:H1 trk:H1 C:H2 pbx:H1 tp:H1 C:H3 vu0:H1 tp:H2 C:H4`;
    - added predictions: trk NONE 80 %, pbx NONE 80 %.
- **Order (one hold, 10 runs):** `C:H1 nvc:H1 nvn:H1 C:H2 tps:H1 tp:H1 C:H3 vu0:H1 tps:H2 C:H4`.
  - tps gets the replicate as the decisive new arm.
  - Steps dropped by the budget stop are logged. A further hold (`C:H5 <dropped> C:H6`) needs the lead's OK, and the
    result says so.
- **Hold.** One normal exclusive hold, `--max-seconds 600`, FIFO, run in the background; no phone, no Chrome timing:

  ```sh
  node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-toolbar-resize -- sh -c \
    'node tools/fix.mjs serve v9-best > out/toolbar-resize/servepgp.log 2>&1 & S=$!; \
     node tools/wait.mjs serve out/serve-v9-best.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
     SB_BUDGET_S=500 node tools/sim.mjs session --owner fix-toolbar-resize -- \
       node fixes/toolbar-resize/sim-pgp.mjs C:H1 nvc:H1 nvn:H1 C:H2 tps:H1 tp:H1 C:H3 vu0:H1 tps:H2 C:H4; E=$?; kill $S; exit $E'
  ```

  The driver `sim-pgp.mjs` (from sim-bisect115 `4e1077d555cd`) checks, in order:
  1. Served bytes through the http twin: JS `647c9ef2b1e2` and CSS `e1359ab9994a`, both from the overlay. Otherwise
     it stops with exit 26.
  2. After C:H1, a first-run format gate: an inject value, the showcase IO, a census and docH. Otherwise it stops with
     exit 27 before any further run.
  3. The budget stop.
- **Applied-arm gate** (frozen, `check-pgp.mjs`, run before the scorer):
  - Every run: the arm matches; the IO is installed; a census exists; docH moved by <= 2 px when the rule went in.
  - Non-C runs, in addition: `applied` and a non-empty rule, plus per arm:
    - nvc: no fixed or sticky renderer left in the census right after the rule;
    - nvn: no sticky renderer left;
    - tps: `.hero-track`'s computed `contain` has size and layout, and only the hero is still sticky;
    - tp: `.hero-track` and `section.pain` both have size and layout, and both heights are unchanged (+-0.5 px);
    - vu0: the four key pins are present as px (`.hero-track` height, `.hero` height, `.pain-hold` height,
      `.start-selling-future-card` min-height).
  - A run that fails is INSUFFICIENT, never NONE, and its record is reported.
  - Reported, never gating: `vcEnd`, skipped vu0 pins, and fw-ms at install and at the end.
- **Scorer** (frozen, unchanged): `score-bisect.mjs` `cb6f0c97b81b`.
  - Moving hero frames: ih strictly between the run's two values, and y < 3250.
  - Per run: the median largest Layout and inStyle; a run counts when n >= 8.
  - Ratio = arm / mean of the nearest C runs before and after.
  - Calls: LOCATES <= 0.30, PARTIAL <= 0.70, NONE above.
  - GEOMETRY: docH1 differs from a neighbouring C by > 2 px.
  - Replication gate: every C run counted, with inStyle >= half.
  - VOID: C drifts > 30 %.
  - Indicative: one run per arm (two for tps).
  - `split-io119.mjs` (`1ad22b858eb8`) splits the moving frames by whether the showcase is in or out of view
    (descriptive, as in P-119).
- **Rules frozen before data:**
  1. **NOT REPRODUCED.** If the C runs fail the replication gate on v9, no arm is judged. The result reads NOT
     REPRODUCED on v9 and goes to the lead before any next card.
  2. **CONTROL-FAILED.** If nvc does not LOCATE on v9, a NONE from nvn, tps, tp or vu0 means nothing (the v9 trigger
     differs from v8's), and the result goes to the lead. Any LOCATES is still reported.
  3. **Reading** (only with the replication gate passed and nvc LOCATES):
     - nvn LOCATES: the fixed renderers alone do not keep the cost; the sticky marks carry it.
     - nvn NONE: a fixed renderer alone keeps it, or the forced layout reaches the showcase with no sticky. Boundaries
       above stickies cannot help, and the line goes back to the lead.
     - tps LOCATES (both runs, or the mean of the two ratios <= 0.30) and nvn LOCATES: a boundary above the hero is as
       good as removing its stickiness. A look-safe form is a new card.
     - tps NONE and nvn LOCATES: the hero's stickiness carries the cost past the boundary, so the path is not the climb
       in R2. The result says so.
     - tp LOCATES or PARTIAL: the shippable candidate. Next come the pixel check (rule 4) and then a phone G check under
       its own card.
     - vu0 NONE closes the viewport-unit half for these subtrees. vu0 LOCATES goes to the pixel check.
  4. **Look.** Any arm that could ship (tp and vu0; trk and pbx in the literal order) and LOCATES or is PARTIAL gets
     the pixel check before anything else. It must be pixel-identical, or within PR-010's numbers (fill 64, edge 128,
     0.5 %, Chrome + Simulator A/A); otherwise it becomes a proposal. nvc, nvn and tps change the look by
     construction: mechanism only, never shipped.
  5. A Simulator ratio is never a phone result and never a gain.
- **Predictions** (registered before data):

  | # | prediction | p |
  |---|---|---|
  | 1 | C replicates on v9 (replication gate passes) | 80 % |
  | 2 | nvc LOCATES | 80 % |
  | 3 | nvn LOCATES | 55 % |
  | 4 | tps LOCATES (rule 3) | 40 % |
  | 5 | tps ratio within 0.10 of nvn's | 50 % |
  | 6 | tp NONE (#platform's sticky and the fixed nav still marked) | 70 % |
  | 7 | vu0 NONE | 85 % |
  | 8 | no arm GEOMETRY | 85 % |
  | 9 | every run passes the applied-arm gate | 80 % |
  | 10 | all 10 steps fit in one hold | 70 % |

  Scoring note (ops' pre-data read S2, before data; no prediction changed): if one of the two tps runs fails the
  applied-arm gate, P4 and P5 use the one valid tps run's ratio; with no valid tps run, P4 and P5 are not scored
  (P9 still counts the failure).

- **Pins** (sha256/12):
  - inject `pgp-inject.mjs` `2cfd9c00b9f1`;
  - driver `sim-pgp.mjs` `73215a3c3912`;
  - gate `check-pgp.mjs` `da32f37117f6`;
  - self-test `pgp-selftest.mjs` `2647e1b4a53f`: 61 checks (each arm's rule on a stub DOM, gate refusals, first-run
    gate);
  - scorer `score-bisect.mjs` `cb6f0c97b81b`;
  - script `flick-hero-v1.json` `6ae05e12ace9`;
  - served v9-final: JS `647c9ef2b1e2`, CSS `e1359ab9994a` (overlay built with `node tools/fix.mjs apply v9-best`).
- **Output.** `out/toolbar-resize/simpgp/` (gitignored). Then:
  - `node fixes/toolbar-resize/check-pgp.mjs out/toolbar-resize/simpgp <runs>`;
  - `node fixes/toolbar-resize/score-bisect.mjs out/toolbar-resize/simpgp <runs> --json fixes/toolbar-resize/pgp-score.json`.
- **Correction:** my instrument message to the lead said "P-110 card svh". The `svh` arm was P-115's.

### Result P-131: NOT REPRODUCED (rule 1); no arm judged

The lead signed P-131 on ops' pre-data PASS (97317e32). Ops' notes S2 and S3 went in before data at 35094199. The
hold ran 2026-10-05 10:09:00-10:16:35Z (455 s, queued from 09:52:54Z behind P-129): one normal exclusive hold, all 10 steps in the signed order in 376 s (no budget
stop, no dropped step). Pins as in the card; served bytes were checked by the driver. The log is in
`out/toolbar-resize/pgp-hold.log`; the data is in `out/toolbar-resize/simpgp/` (both gitignored).

- **Applied-arm gate** (`check-pgp.mjs`): `INJECT-GATE all applied`. All 10 runs pass.
  - nvc: the census is empty right after the rule.
  - nvn: only the fixed nav is left.
  - tps: only the nav and the hero are left.
  - tp and vu0: as the card requires.
- **Scorer** (`score-bisect.mjs` `cb6f0c97b81b`, `pgp-score.json`): `REPLICA false`, `DRIFT 0.032`, `VOID false`.
  - The replication gate fails on one point only: C-H1 has n = 7 moving hero frames, one below the n >= 8 rule
    (`thin`, not counted).
  - The other three C runs count: 22.02, 21.85 and 21.53 ms. C-H1's median, 22.24 ms, sits with them.
  - By rule 1 the result reads **NOT REPRODUCED on v9**. No arm is judged, and the result goes to the lead before
    any next card.
- **Descriptive only; not calls, not judged.** The scorer's ratios use C-H1 as one neighbour:

  | run | n | medL ms | inStyle | ratio | in view / off view ratio (split-io119, `pgp-split.json`) |
  |---|---|---|---|---|---|
  | nvc-H1 | 26 | 0.264 | 3 | 0.012 | 0.014 / 0.006 |
  | nvn-H1 | 17 | 1.197 | 6 | 0.054 | 0.054 / 0.492 |
  | tps-H1 | 9 | 22.095 | 8 | 1.007 | 1.016 / 0.937 |
  | tp-H1 | 11 | 19.640 | 8 | 0.895 | 0.983 / 0.901 |
  | vu0-H1 | 12 | 21.476 | 11 | 0.990 | 1.007 / 0.976 |
  | tps-H2 | 12 | 22.897 | 10 | 1.056 | 1.085 / 0.986 |

  docH is 6814 -> 6850 in every run, so no GEOMETRY. Several runs logged the gesture's pull-to-refresh guard
  ending a loop early (13 lines). Earlier holds show the same guard (P-119, P-125, P-128 logs), and it is what keeps
  per-run n low. Under rule 1 none of these numbers carries a reading. Unjudged, the pattern is:
  - nvc and nvn are far below C;
  - tps, tp and vu0 sit at C.
  These numbers are not evidence until a replicated hold is scored.
- **Predictions:**

  | # | prediction | p | outcome |
  |---|---|---|---|
  | 1 | C replicates | 80 % | **miss**: C-H1 n = 7 |
  | 2-7 | arm calls | | not scored (rule 1: no arm judged) |
  | 8 | no arm GEOMETRY | 85 % | hit |
  | 9 | every run passes the applied-arm gate | 80 % | hit |
  | 10 | all 10 steps fit in one hold | 70 % | hit (376 s) |

- **Look:** nothing to check. No arm was judged, and tp and vu0 did not locate even descriptively.
- **Next:** this is the lead's decision (rule 1). I propose no hold of my own. A replication needs a new card, or
  the lead's OK for a further hold under P-131, as the pre-sign ruling says.
- **Correction (2026-10-05, after ops' result read; changes no call, no number):** the line above that says the
  pull-to-refresh guard "is what keeps per-run n low" is wrong. Mapping each P-131 run's toolbar-moving stretches by
  scrollY (frames only, `sizing133.mjs` in my scratchpad) shows the cause is the stimulus:
  - every flick-hero-v1 down loop is one fling from y 0 to y 3950-4380, past the hero zone (y < 3250);
  - so 19 of the 20 expands start at y >= 3950, and only 1-7 of their 7-18 frames fall in the zone;
  - the collapses start near the top (y 6-651) and give 2-7 frames each (median 4);
  - the guard only ends the up loops near the top, after the expand is over, so it costs no counted frame.
  `results.json` `pgp.result.correction` says the same. The lead ruled on the right cause (P-133 below).

## Prediction P-133: P-131's arms again, on fresh data sized for n (Simulator Timeline, registered before data)

**Card rev 1, before any data.** P-id P-133 (the lead). Next: mgmt-ops-10's pre-data read, then the lead's signature.
No run, dry run included, before the signature.

**Signed** by the lead on mgmt-ops-10's pre-data PASS of fd21ff9d (2026-10-05, before any data). The signature carries
ops' notes for the result read:
- N1: P1-P9 keep P-131's p values, set before P-131's data. Their author has since seen P-131's unjudged ratios, so
  the result read labels them the belief from before P-131, kept and not re-estimated.
- N2: "a drag transition gives at least as many frames as a fling" is OBSERVED in no run. The first-run gate (n >= 8)
  and P11 carry that risk.
- N3: the dry run and both holds are DEFERRED while P-130's phone block is marked.

The lead's order: the dry run first (an estimate over 78 s stops the card before data and goes to the lead; over 67 s
drops tps:H2 from hold B, as carded), then hold A, then hold B unless A stops at a gate or fails the n check.

- **Basis (lead, 2026-10-05, after P-131's NOT REPRODUCED):**
  - P-131 stays closed as carded. Nothing from its data is reused or pooled here: no run, no ratio, no C value.
  - A new card with the same arms and the same rule 1, on all fresh data.
  - The cause gets fixed at design time: each run's capture is sized for at least 12 moving hero frames, and the
    card says how.
  - A frozen check fails a hold before scoring when a run has n < 8; guard-ended loops are counted and reported.
  - Accepted in principle: drag strokes in y about 650-2350, at least 4 collapse/expand cycles per run, two holds
    each with its own C runs and nvc control, a count-only Simulator dry run before data (I-184), the per-hold n
    check before scoring.
  - A plain rerun in the same order is not accepted.
- **Question, arms, rules 1-5:** as in P-131 above (same `pgp-inject.mjs`, same `check-pgp.mjs`, same frozen
  scorer), with the changes listed here. C = the served build with the same injection and no rule.
- **Base.** main as of `189ca7ed` (this branch is rebased on `a3c4ab06`, which adds docs only): v9-final with
  morph-scroll rev 7d, served from the `fixes/morph-scroll-v9try` overlay (`node tools/fix.mjs apply
  morph-scroll-v9try`; gitignored, built in my worktree). Served bytes: JS `1b2eecc66011`, CSS `e1359ab9994a`.
  - Re-checked against P-131's base (JS `647c9ef2b1e2`, CSS `e1359ab9994a`):
    - CSS: byte-identical (same hash). Every renderer line in P-131's "v9-final facts" stands as written
      (l.701, 2873, 10879, 11822; l.1646, 2538, 4412; l.12408; `.hero-track` height l.1632).
    - JS: `diff` of the two files changes only l.14170-14292 (the morph settle `__msF0`, the fling rule, a debug hook),
      and the two overlays differ in no other file.
    - `html.fw-ms` is still set at morph setup: l.14469 on 7d (l.14462 before), removed at l.14515 (l.14508).
  - The 7d change is in the morph code (settle and fling rule), not in the hero or showcase code. It is not
    assumed neutral: C runs on 7d, so every ratio is within 7d.
- **Stimulus: `cycle-hero-v2.json`** (replaces flick-hero-v1; 18 drag strokes, ~28 s of script time).
  - Reload, 3 s idle at the top, then 2 drags down into the page (lead-in), then 4 cycles of 2 drags down and 2 drags
    back up. Drag 560 px in 600 ms, `profile: drag` (ends at rest, no momentum), 350 ms between drags, 700 ms at
    each turn.
  - Planned scrollY range, by the compiler's static model: about 1000-2300, all below 3250. Every down-the-page
    phase and every back-up phase happens inside the hero zone.
  - Planned toolbar transitions per run: 8 (the lead-in collapses; each cycle's back-up phase expands; cycles 2-4's
    down phase collapses again; cycle 1's down phase starts collapsed).
  - Pull-to-refresh guard: every finger-down stroke (page up) is guaranteed scrollY >= 560 by the compiler's static
    model (each finger-up drag adds at least 545), and the runner re-checks it on a still page before each one. The
    script has no `until` loop (every `repeat` is unrolled), so **a guard-ended loop cannot occur**; a runtime guard
    failure would throw, send nothing more, and fail the run (strokes < 18).
- **Sizing for n >= 12** (evidence: P-131's frame log only, frames per toolbar-moving stretch and their scrollY; no
  Layout value, no ratio, no C value):
  - P-131's collapses (fling start, y 6-651): 2-7 frames each, median 4, all in the zone.
  - P-131's expands: 5-18 frames each (median 10), but 19 of 20 started at y >= 3950, outside the zone.
  - P-133 puts all 8 transitions in the zone: 4 collapses and 4 expands. With P-131's per-stretch counts: worst
    case 4 x 2 + 4 x 5 = 28, typical 4 x 4 + 4 x 10 = 56, against the target 12 and the rule 8.
  - Assumption, stated: a drag-driven transition gives at least as many frames as a fling-driven one (OBSERVED in
    no run; a slower scroll should not shorten Safari's toolbar move, cause unknown). The count-only dry run cannot
    check n (it keeps no frame log); the driver's first-run gate checks n >= 8 on each hold's first run.
- **Dry run (count-only, before any Timeline data; after the signature).** `dry-p133.mjs`, one shared Simulator slot,
  in the background, no inject, no Timeline, no timing number:

  ```sh
  node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-toolbar-resize -- sh -c \
    'node tools/fix.mjs serve morph-scroll-v9try > out/toolbar-resize/serve133d.log 2>&1 & S=$!; \
     node tools/wait.mjs serve out/serve-morph-scroll-v9try.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
     node tools/sim.mjs session --functional --owner fix-toolbar-resize -- node fixes/toolbar-resize/dry-p133.mjs; \
     E=$?; kill $S; exit $E'
  ```

  - Two C runs. A run passes when: all 18 strokes were sent; no error and no abort; no guard-ended loop and no guard
    error; >= 8 toolbar transitions (summary count); every finger-down stroke started at scrollY 560-3000 (its still
    read).
  - `DRY PASS` (exit 0): the holds may queue. `DRY FAIL` (exit 3): no Timeline data; the script is revised and the
    card goes back to ops' read and the lead.
  - It records each run's step time (open + gesture). Step estimate for a Timeline run = the mean dry step + 10 s
    (an allowance for Timeline capture and write; P-131's Timeline steps took ~36 s).
- **Order: two holds, each self-contained** (own C runs, own nvc, own folder):
  - Hold A, 6 steps: `C:H1 nvc:H1 nvn:H1 C:H2 tps:H1 C:H3`.
  - Hold B, 7 steps: `C:H4 nvc:H2 tp:H1 C:H5 vu0:H1 tps:H2 C:H6`.
  - Budget (driver `SB_BUDGET_S=500`): with a ~60 s step, A is ~380 s and B ~440 s.
  - Pre-registered from the dry run, before data: step estimate x 7 + 30 > 500 s (estimate > 67 s): B drops `tps:H2`
    (B = `C:H4 nvc:H2 tp:H1 C:H5 vu0:H1 C:H6`; P4/P5 then use tps:H1 alone). Estimate x 6 + 30 > 500 s (> 78 s): the
    design fails its budget; no data; back to ops and the lead.
  - The driver's budget stop stays as a guard: steps it drops are logged and not scored; an arm left with one C
    neighbour is scored against that one (the scorer's rule). A further hold needs the lead's OK.
  - Hold B runs after hold A whatever A's ratios are. It does not run when A stopped at a gate (served bytes 26,
    first-run gate 27) or A's n check is HOLD-FAIL: the card then goes to the lead.
- **Holds.** Normal exclusive holds, `--max-seconds 600`, FIFO, in the background, nobody moved; DEFERRED while a
  phone block is marked (P-129, P-130). Hold A (B: `B` and its 7 steps):

  ```sh
  node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-toolbar-resize -- sh -c \
    'node tools/fix.mjs serve morph-scroll-v9try > out/toolbar-resize/serve133.log 2>&1 & S=$!; \
     node tools/wait.mjs serve out/serve-morph-scroll-v9try.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
     SB_BUDGET_S=500 node tools/sim.mjs session --owner fix-toolbar-resize -- \
       node fixes/toolbar-resize/sim-p133.mjs A C:H1 nvc:H1 nvn:H1 C:H2 tps:H1 C:H3; E=$?; kill $S; exit $E'
  ```

  Driver `sim-p133.mjs` (from sim-pgp `73215a3c3912`): served bytes JS `1b2eecc66011` and CSS `e1359ab9994a` from the
  overlay, else exit 26; after the first run, the format gate plus **n >= 8** (the scorer's frame filter), else exit
  27 before any further run; the budget stop; per step it logs n.
- **Per hold, in this order, before anything else is read** (folder `out/toolbar-resize/simp133/<A|B>`, runs = the
  steps the hold ran, in hold order):
  1. **n check, frozen** (`check-n133.mjs`):
     `node fixes/toolbar-resize/check-n133.mjs out/toolbar-resize/simp133/A C-H1 nvc-H1 nvn-H1 C-H2 tps-H1 C-H3 --strokes 18 --json fixes/toolbar-resize/p133-n-A.json`.
     - A run fails on: no frames, n < 8 moving hero frames, an aborted gesture, strokes != 18, a missing file.
     - Any failing run: `HOLD-FAIL`, exit 3. The hold is not scored, there is no rescue (no rerun, no dropped run, no
       re-filter), and it goes to the lead.
     - Reported for every run, never failing: n below the target 12, toolbar transitions, the highest moving-frame y,
       guard-ended loops (0 by construction), guard errors, other errors.
  2. Applied-arm gate `check-pgp.mjs` (unchanged).
  3. Scorer `score-bisect.mjs` (unchanged, `cb6f0c97b81b`) with `--json fixes/toolbar-resize/p133-score-<A|B>.json`.
  4. `split-io119.mjs` (unchanged; descriptive).
- **Rules** (P-131's rules 1-5, applied to two holds):
  1. **NOT REPRODUCED** if either hold's C runs fail the replication gate. No arm in either hold is judged.
  2. **CONTROL-FAILED per hold**: a hold whose nvc does not LOCATE reads none of its other arms (any LOCATES is still
     reported).
  3. **VOID per hold**: C drift > 30 % voids that hold's arms.
  4. Reading as in P-131 rule 3. tps uses its two runs (one per hold): LOCATES when both do or the mean of the two
     ratios is <= 0.30. nvn is in hold A only.
  5. Look and status as in P-131 rules 4 and 5: tp or vu0 LOCATES or PARTIAL goes to the pixel check first; a
     Simulator ratio is never a phone result and never a gain.
  6. **HOLD-FAIL** (n check) stops the card before scoring, as above. It is a design failure, not NOT REPRODUCED.
- **Predictions** (registered before data):
  - P1-P9 carry P-131's values unchanged. They were set before any P-131 data, and P-131's ratios (including the
    unjudged ones) informed none of them.
  - P-131's frame counts informed P11 (disclosed in "Sizing" above).

  | # | prediction | p |
  |---|---|---|
  | 1 | C replicates in both holds (replication gate passes in A and in B) | 80 % |
  | 2 | nvc LOCATES in both holds | 80 % |
  | 3 | nvn LOCATES | 55 % |
  | 4 | tps LOCATES (rule 4) | 40 % |
  | 5 | tps ratio (mean of the valid tps runs) within 0.10 of nvn's | 50 % |
  | 6 | tp NONE | 70 % |
  | 7 | vu0 NONE | 85 % |
  | 8 | no arm GEOMETRY | 85 % |
  | 9 | every run passes the applied-arm gate | 80 % |
  | 10 | the dry run passes, and no step is dropped (pre-registered or budget stop) | 70 % |
  | 11 | both holds pass the n check | 85 % |
  | 12 | 0 guard-ended loops and 0 guard errors in every run | 95 % |

  P-131's S2 note applies to P4/P5 (one valid tps run: its ratio; none: not scored, P9 still counts it).
- **Pins** (sha256/12):
  - stimulus `cycle-hero-v2.json` `59420d90ed02`;
  - driver `sim-p133.mjs` `96e0edaaa0d7`;
  - n check `check-n133.mjs` `96a1dc5fe288`;
  - dry run `dry-p133.mjs` `470cd5c593c2`;
  - self-test `p133-selftest.mjs` `bfae80e65988`: `SELFTEST ok 38 checks` (the script compiles to 18 drags, 8
    finger-down strokes each carrying the runtime guard at 560, the static guard and zone hold, >= 4 cycles; the frame
    filter and first-run gate; the n check's pass, flag and fail cases; the dry-run criteria);
  - unchanged: inject `pgp-inject.mjs` `2cfd9c00b9f1`, gate `check-pgp.mjs` `da32f37117f6` (with `pgp-selftest.mjs`,
    61 checks), scorer `score-bisect.mjs` `cb6f0c97b81b`, `split-io119.mjs` `1ad22b858eb8`;
  - served build: JS `1b2eecc66011`, CSS `e1359ab9994a`.

### P-133 dry run (count-only; shared Simulator slot, 2026-10-05 ~10:53Z): DRY PASS, design budget FAILED

- Both C runs pass every dry-run criterion: 18/18 strokes, no error or abort, 0 guard-ended loops and 0 guard errors,
  8/8 toolbar transitions as planned. (The count-only records hold no frame log, so no n is known yet.)
- Step times: run 1 74.3 s (open 10.1 + gesture 64.2), run 2 62.4 s (open 4.7 + gesture 57.7). Mean 68.35 s, so the
  carded estimate is 68.35 + 10 = **78.35 s**. Six steps then need 6 x 78.35 + 30 = 500.1 s > 500 s, so the card's
  rule says the design fails its budget: no data, back to ops and the lead.
- Context, no claim: the slot was shared and the host was loaded (load1 up to 106; the Simulator's background
  processes up to 148 % of a core); run 1's open took twice run 2's.
- Files: `out/toolbar-resize/dry133/` (`dry.json`, `dry-C-1.json`, `dry-C-2.json`), log `out/toolbar-resize/dry133.log`
  (gitignored).

### P-133 addendum 1: four holds of at most 4 steps (lead's option b; registered before data)

**Why.** The dry run's estimate is 78.35 s per step, over the carded 78 s limit, with the 500 s budget unchanged. The
lead chose to split the holds (option b). The stimulus, the 500 s budget and the failed dry run stay as they are:
no shorter stimulus, no larger budget, no second dry run. Nothing else in the card changes.

- **Hold layout.** At most 4 steps per hold. Each hold starts and ends with its own C. The arms keep the carded order
  (A's arms, then B's) and the two nvc runs stay where they were:

  | hold | steps | estimate (4 x 78.35 + 30 at most) |
  |---|---|---|
  | A1 | `C:H1 nvc:H1 nvn:H1 C:H2` | 343 s |
  | A2 | `C:H3 tps:H1 C:H4` | 265 s |
  | B1 | `C:H5 nvc:H2 tp:H1 C:H6` | 343 s |
  | B2 | `C:H7 vu0:H1 tps:H2 C:H8` | 343 s |

  - Carded A was `C nvc nvn C tps C` and carded B `C nvc tp C vu0 tps C`. A C is added where a hold boundary cut
    between two arms, so there are 8 C runs (was 6) and C names are renumbered H1-H8.
  - **Total: 4 Simulator holds, 15 steps** (was 2 holds, 13 steps).
  - Each hold is self-contained: its own served-bytes check, first-run gate and folder
    (`out/toolbar-resize/simp133/A1`, `A2`, `B1`, `B2`). Every arm run has a C run before and after it in its own hold,
    so the scorer's neighbour rule (nearest C before and after, within the folder it is given) never reaches into
    another hold.
  - The driver accepts only these four holds with exactly these steps; anything else exits 2 before any work.
- **Budget.** The largest hold is 4 steps: 4 x 78.35 + 30 = 343.4 s <= 500 s, unchanged budget (A2: 3 x 78.35 + 30 =
  265.1 s). The dry run's PASS stands because the stimulus is unchanged, so there is no new dry run. The driver's budget
  stop stays as the guard: it drops a hold's remaining steps when the time left is under the longest step + 15 s.
- **The tps:H2 drop.** The carded "estimate > 67 s: B drops tps:H2" and "> 78 s: the design fails" rules were written
  for the 6- and 7-step holds and no longer apply. No step is dropped before data. P4/P5 use both tps runs (tps:H1 in
  A2, tps:H2 in B2); P-131's S2 note still covers a tps run that fails the applied-arm gate.
- **Running and stop rules.**
  - One FIFO queue entry at a time, in the order A1, A2, B1, B2. Each hold is a normal exclusive hold
    (`--max-seconds 600`, `SB_BUDGET_S=500`, the card's command with `sim-p133.mjs <hold> <its steps>`).
  - Right after each hold, its n check (`check-n133.mjs`, frames only) runs, before any scoring. HOLD-FAIL means no
    rescue.
  - A later hold runs whatever the earlier holds' Layout values or ratios are. Nothing is scored until the last hold
    has run or the card has stopped.
  - **These stop all remaining holds** (the card goes to the lead; nothing is scored):
    - served bytes wrong (exit 26);
    - the first-run gate (exit 27: inject format, or n < 8 on the hold's first run);
    - HOLD-FAIL in the n check.
  - **This stops only within a hold:** the budget stop. That hold's dropped steps are logged and not scored, and the
    next hold still runs. A make-up hold needs the lead's OK.
  - After the last hold, per hold: the applied-arm gate, the scorer, then `split-io119.mjs`.
- **Pooling: no Layout times pool across holds; only per-hold calls combine.**
  - Each hold is scored alone by the frozen scorer (`score-bisect.mjs <hold folder> <its runs>`). Its arms' ratios
    use only its own C runs. No C or arm value from one hold enters another hold's ratio. Why: Simulator times compare
    only within one session (P-109's instrument).
  - **Rule 1 (unchanged in kind, now over four holds):** NOT REPRODUCED fires when any one hold's C runs fail the
    replication gate (every C counted, inStyle >= half n). No arm in any hold is then judged.
  - **Rule 2 (a judgment change, written in full):** the card had one nvc per hold. With four holds there are still
    two nvc runs.
    - nvc:H1 (hold A1) is the positive control for holds A1 and A2. nvc:H2 (hold B1) is the positive control for holds
      B1 and B2.
    - If nvc:H1 does not LOCATE (its ratio against A1's C runs above 0.30, or not counted), the arms of A1 and A2
      (nvn:H1, tps:H1) are CONTROL-FAILED. If nvc:H2 does not LOCATE, the arms of B1 and B2 (tp:H1, vu0:H1, tps:H2)
      are CONTROL-FAILED. A CONTROL-FAILED arm is not read, though any LOCATES is still reported.
    - Why: nvc asks a question about the build: does removing every viewport-constrained renderer still remove the
      step Layout on v9-final + 7d? Each hold's own health is checked by its replication gate and its VOID. Adding nvc
      runs to A2 and B2 would change the carded arms; the lead kept them as carded.
  - **Rule 3 (per hold, a single pair):** VOID when |last C - first C| / first C > 0.30 over the hold's medianLargest.
    That is the scorer's own rule (its first and last C), which in a 2-C hold is its one pair of C runs. A VOID hold's
    arms are not judged; the other holds stand.
  - **Rule 4 (confirmed):** tps takes one run from each of two holds (tps:H1 in A2, tps:H2 in B2), each against its
    own hold's C runs. tps LOCATES when both do, or when the mean of the two ratios is <= 0.30.
  - **Rule 6:** HOLD-FAIL in any hold stops the card before scoring (see stop rules).
- **Predictions.** None restated or re-estimated (N1).
  - **P10 is decided:** the result read scores it as a miss on the rev 1 design (that design failed its own budget
    rule). It is not rescored on the split.
  - Where a prediction says "both holds", it reads over the new layout: P1 and P11 over all four holds, P2 over both
    nvc runs.
  - No new prediction.
- **Disclosures.**
  - The design change follows a failed gate. No Timeline data, Layout value, ratio or frame count has been seen: the
    dry run is count-only and its records hold no frame log.
  - The dry run ran with load1 peaking at 106. No timing claim rests on it; it only set the budget estimate the
    carded rule asked for.
  - N1-N3 still apply. N3: everything is DEFERRED while P-130's phone block is marked (it started about 10:54Z).
- **Pins changed** (sha256/12):
  - driver `sim-p133.mjs` `a93170496013` (the four-hold plan and the step check);
  - self-test `p133-selftest.mjs` `9bf8b6ef945a`: `SELFTEST ok 43 checks` (adds: at most 4 steps per hold, a C at
    each end, arm order as carded, unique names and 8 C runs, a 4-step hold fits 500 s at 78.35 s).
  - Unchanged:
    - stimulus `cycle-hero-v2.json` `59420d90ed02`;
    - n check `check-n133.mjs` `96a1dc5fe288`;
    - dry run `dry-p133.mjs` `470cd5c593c2`;
    - inject `pgp-inject.mjs` `2cfd9c00b9f1`;
    - gate `check-pgp.mjs` `da32f37117f6`;
    - scorer `score-bisect.mjs` `cb6f0c97b81b`;
    - `split-io119.mjs` `1ad22b858eb8`;
    - served build: JS `1b2eecc66011`, CSS `e1359ab9994a`.

**Addendum 1 signed** by the lead on mgmt-ops-10's pre-data PASS of 402a6cae (ops' read: e6151b57 on main; 2026-10-05,
before any Timeline data), with N1-N3 above and these notes for the result read:
- N4: A2 and B2 have no positive control in their own session (their nvc ran in A1 and B1). The result read says so
  for every call in A2 and B2.
- N5: P1 and P11 now cover 8 C runs and 15 runs (was 6 and 13): a slightly harder event at the same p (kept, N1). The
  result read says so.
- N6: a hold the budget stop leaves with one C has no drift check. It is reported DRIFT n/a, neither VOID nor a pass.

Queued in the order A1, A2, B1, B2, one at a time, each with its n check right after it; all DEFERRED while P-130's
phone block is marked. Nothing is scored before the last hold. Then the files go to mgmt-ops-10 for the result read.

## Scenarios not run

idle after scroll · reload while scrolled · early input · scroll up · rubber band (this topic is the toolbar resize).

## Risks, conflicts, follow-ups

- `js` (`trzR`) touches the shared scroll engine `rE`: shipping it is "ask first" with fix-scroll-cb and fix-nav-morph.
- `sticky` changes the hero's look; mechanism only, never shipped as is.
- `cq` must be pixel-identical (memory: illusions must be pixel-identical): Chrome parity in check2, WebKit before V.
- Probes: `probe-resize.mjs`, `probe-inval.mjs`, `probe-geom.mjs` (Chrome; cited above).
