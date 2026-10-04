# Fix: toolbar-resize

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (P-106 ablation block run 2026-10-04 13:19-13:45Z); no shippable fix yet
**Stage:** D signed by lead 2026-10-04 14:02Z (LOCATED); P-109 + P-110 Simulator bisects: cost = #people's showcase (0.03), trigger = any viewport-constrained renderer (no single one); indicative; P-115 on v8: content-visibility:auto on the showcase LOCATES (0.036), contain:layout and svh pin NONE; P-115 read AGREE (ops); P-119 card (cct vs cva + entering check) registered, waits for ops' pre-data read
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

## Scenarios not run

idle after scroll · reload while scrolled · early input · scroll up · rubber band (this topic is the toolbar resize).

## Risks, conflicts, follow-ups

- `js` (`trzR`) touches the shared scroll engine `rE`: shipping it is "ask first" with fix-scroll-cb and fix-nav-morph.
- `sticky` changes the hero's look; mechanism only, never shipped as is.
- `cq` must be pixel-identical (memory: illusions must be pixel-identical): Chrome parity in check2, WebKit before V.
- Probes: `probe-resize.mjs`, `probe-inval.mjs`, `probe-geom.mjs` (Chrome; cited above).
