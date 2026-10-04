# Fix: toolbar-resize

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (ablation registered, not yet run)
**Stage:** I (card below) → D pending the ablation block
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

## Scenarios not run

idle after scroll · reload while scrolled · early input · scroll up · rubber band (this topic is the toolbar resize).

## Risks, conflicts, follow-ups

- `js` (`trzR`) touches the shared scroll engine `rE`: shipping it is "ask first" with fix-scroll-cb and fix-nav-morph.
- `sticky` changes the hero's look; mechanism only, never shipped as is.
- `cq` must be pixel-identical (memory: illusions must be pixel-identical): Chrome parity in check2, WebKit before V.
- Probes: `probe-resize.mjs`, `probe-inval.mjs`, `probe-geom.mjs` (Chrome; cited above).
