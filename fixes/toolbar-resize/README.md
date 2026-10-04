# Fix: toolbar-resize

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (P-106 ablation block run 2026-10-04 13:19-13:45Z); no shippable fix yet
**Stage:** D signed by lead 2026-10-04 14:02Z (LOCATED); P-109 Simulator subtree bisect registered
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

## Scenarios not run

idle after scroll · reload while scrolled · early input · scroll up · rubber band (this topic is the toolbar resize).

## Risks, conflicts, follow-ups

- `js` (`trzR`) touches the shared scroll engine `rE`: shipping it is "ask first" with fix-scroll-cb and fix-nav-morph.
- `sticky` changes the hero's look; mechanism only, never shipped as is.
- `cq` must be pixel-identical (memory: illusions must be pixel-identical): Chrome parity in check2, WebKit before V.
- Probes: `probe-resize.mjs`, `probe-inval.mjs`, `probe-geom.mjs` (Chrome; cited above).
