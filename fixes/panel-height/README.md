# Fix: panel-height (the open end-of-page panel is taller than the visible iPhone screen)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and the `delta-*.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** draft. Both options built; Chrome counts and Chrome pixels done; the Simulator part (overflow per toolbar
state, dvh work per toolbar frame, the per-frame dvh check) is queued behind phone block P-155. Then a proposal with
Try-it for the user (look change: memory "proposal-try-it-required").
**Stage:** F (build + counts). User report T-204 #20; the user wants it in v10 (T-204 #22).
**Device class / gate:** phone-only look (iOS Safari's toolbar; Chrome's emulation has no small/large viewport).
**Driver(s) behind the claims:** Chrome viewport-height steps (counts), Simulator WDA strokes (pending). No timing.
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only, two declarations (below). No JS.

## Why it overflows

- Code (A's CSS, = v9-final CSS line 12100; baseline `site-pretty` CSS 11564-11571): on phones (`@media (width<=640px)`)
  `.start-selling-top-nav.svelte-1dcozpm { --panel-h: calc(100vh - 24px); top: calc(16px + (12px - 16px) * var(--morph)) }`.
  The open nav panel is `height: calc(var(--pill-h) + (var(--panel-h) - var(--pill-h)) * var(--morph))` (baseline
  11335), so at m = 1 its box is 12 px from the top and `100vh - 24px` tall: its bottom sits at `100vh - 12px`.
- The touch rule `.start-selling-top-nav, .start-selling-morph { --panel-h: calc(100dvh - 40px) }` (baseline 11075-11079)
  never reaches the nav: one class against the two-class rule above, which wins regardless of order. (The standalone
  `.start-selling-morph` element that rule also styles is not used by the JS.)
- P1 (fix-end-morph-p1, in v10) repeats the nav's formulas in `.fw-rv-glass[data-fw-rv]` (A's CSS 12456, its own
  `--panel-h: calc(100vh - 24px)`), and P1b's probe `.fw-rv-size` takes `height: var(--panel-h)` inherited from the nav.
- **iOS Safari resolves `vh` to the large viewport (toolbar collapsed): CONFIRMED in WebKit source** (main at
  b2b4227bf368, 2026-10-06; read by the lead's de-vh-webkit and by map-panelh-vh via `gh api`):
  - `LocalFrameView::sizeForCSSDefaultViewportUnits` (Source/WebCore/page/LocalFrameView.cpp 7110-7115): the dynamic size
    only under the per-site quirk `m_shouldUseDynamicViewportUnitsAsDefault`, else the default-size override;
  - `WebPageIOS.mm` 3062: `setDefaultUnobscuredSize(target.maximumUnobscuredSize)` (the default = the maximum unobscured
    size = the large viewport; `setMinimumUnobscuredSize` = small, 3063);
  - `StyleLengthResolution.cpp` `resolveViewportType<Default>` -> `sizeForCSSDefaultViewportUnits` (de-vh-webkit).
  - WebKit blog, Safari 15.4 (https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/): svh = smallest possible
    viewport, lvh = largest, dvh = "will change as the user scrolls".
- So with the toolbar shown (innerHeight ~775 on the iPhone 15 Pro Max, ~815 collapsed) the open panel's bottom is at
  815 - 12 = 803 px, about **28 px below the visible bottom** (lead's estimate from the CSS; the Simulator numbers below
  replace it). With the toolbar collapsed it fits with the intended 12 px margin.

## What changed (two options, CSS only, same two declarations)

| option | top-nav <= 640 px rule | P1's `.fw-rv-glass[data-fw-rv]` | delta (on A's CSS) | A + delta CSS |
|---|---|---|---|---|
| svh | `--panel-h: calc(100svh - 24px)` | same | `delta-svh.diff` 0d7142505704 | 75c30c18d971 |
| dvh | `--panel-h: calc(100dvh - 24px)` | same | `delta-dvh.diff` 030ff98f6239 | 0546615f27ea |

- Base A = fix-end-morph-p1's A1 snapshot (v9-final + F1/U2 + I-219 + P1 + P1b (a)), JS ed44af454a92, CSS cfb8b8c5b019
  (copied to `out/ph/A`). A1's JS later became 09d1f5b62384 (aria-hidden only, CSS unchanged): the deltas are CSS-only
  and apply unchanged. Each delta is 2 hunks with 3 lines of context; both hunks also exist without P1 except the glass one.
- Both places change together: otherwise P1's glass (the blurred box under the nav while it morphs) and the nav would
  disagree on the height. `.fw-rv-size` inherits, so it follows by itself.
- svh: the panel always fits the small viewport (toolbar shown); with the toolbar collapsed it leaves ~40 px more gap
  at the bottom (52 instead of 12, from the units; to be measured). Its height never changes.
- dvh: always 12 px from the visible bottom; its height follows the toolbar while it moves.
- Unchanged: desktop and tablets (rule is <= 640 px only; the tablet rule `min(820px, calc(100vh - 40px))` is not part
  of this report), Chrome (all units equal there, below), reduced motion (the same rule; 7c's mode does not matter).
- Builds: `node fixes/panel-height/build.mjs` (writes out/ph/{S,D} and the deltas, checks one match per site).
  Try-it patches (baseline-relative, strict re-apply exact): `node fixes/panel-height/mk-tryit.mjs` ->
  `fixes/panel-height-base/patch.diff` (A, 755a4fdf76fe), `fixes/panel-height-svh/patch.diff` (d284c4a28ec3),
  `fixes/panel-height-dvh/patch.diff` (bbf308cb2009). `patch.diff` here = the dvh one (the lead's lean) until the user
  picks.

## Chrome (counts and pixels; no timing)

**Units.** Chrome's device emulation resolves vh = svh = lvh = dvh = the emulated viewport (775 at 775, 815 at 815;
`ph-chrome.mjs` per load), so in Chrome both options render exactly like A.

**Pixels (T2), D vs A, 430x775 DPR 3** (`em-p1-px.mjs` stops pre, m 0, 0.1, 0.5, 0.99, 1, back to 0, post; A, D, A2
loads, the 4th load cut by the 120 s cap; scored by `px3.mjs`): 0 css px beyond A/A at 6 of 8 stops, 1 css px (max level
14, under fill 64) at `pre` and `dn0`. S and 932 not run (the lead: Chrome cannot tell the units apart).

**Work per toolbar step, modelled.** The toolbar is emulated as 16 viewport-height steps 775 -> 815 -> 775, one per two
rAFs (`ph-chrome.mjs`). D = the panel follows each step (what dvh does on iOS); Dfix = the same build with
`--panel-h` pinned to `calc(815px - 24px)` (what vh and svh do on iOS). Totals over 16 steps, D vs Dfix:

| phase | layouts | layout dirty objects | elements restyled | paints | RO callbacks (.fw-rv-size) | P1 clip writes |
|---|---|---|---|---|---|---|
| open, m stays 1 (re-scrolled to max per step) | 80 vs 64 | 416 vs 288 | 535 vs 530 | 69 vs 68 | 16 vs 0 | 0 vs 0 |
| open, m drifts 1 -> 0.95 (no re-scroll) | 88 vs 72 | 447 vs 312 | 782 vs 725 | 149 vs 108 | 16 vs 0 | 24 vs 16 |
| morphing, m 0.5 (P1 reveal on) | 97 vs 80 | 467 vs 320 | 1219 vs 1025 | 298 vs 200 | 16 vs 0 | 48 vs 32 |
| mid-page, m 0 (pill) | 49 vs 49 | 413 vs 381 | 1606 vs 1597 | 100 vs 91 | 16 vs 0 | 0 vs 0 |

- With dvh, each toolbar step costs **one extra layout pass** while the panel is open or morphing, ~8-9 more dirty
  layout objects, and while morphing ~6 more paints and one more P1 re-apply (fix-end-morph-p1's RO on `.fw-rv-size`;
  needed, else the clip keeps the old height). At m = 1 the reveal is off and nothing is re-applied, yet the extra
  layout is there: it is the panel's own relayout (fix-end-morph-p1's reading; in Chrome, cause not split further).
- Mid-page (pill), dvh adds one `.fw-rv-size` RO callback per toolbar step (no write) and 2 dirty objects.
- Not judged as cost: Chrome's emulation re-lays out the whole page on every viewport change, in both arms, and every
  vh user changes in Chrome too. The WebKit cost per toolbar frame comes from the Simulator (pending).
- Paint areas from the trace are not reported (clip quads of composited layers are unbounded in this trace).
- Host load1 4.3-6.9 during the runs (counts, not timing).

## WebKit: does dvh follow every toolbar frame? (pending the Simulator)

- By code, likely yes: `LocalFrameView::setLayoutViewportOverrideRect` (LocalFrameView.cpp 1969-1991) forces
  `TriggerLayoutOrNot::Yes` whenever the layout viewport's size changes (1978-1979) and then calls
  `document->updateViewportUnitsOnResize()` (1988-1990), and `sizeForCSSDynamicViewportUnits` returns that override
  rect's size (7232-7235). The `m_isInStableState && !isChangingObscuredInsetsInteractively` gate in
  `WebPage::updateVisibleContentRects` (WebPageCocoa.mm 4196-4208) only decides the trigger for unchanged sizes.
  Status: **OBSERVED by code reading only**; whether Safari changes the layout viewport size on every toolbar frame
  (fix-toolbar-resize saw innerHeight step through 775 -> 815 on the phone) is decided by the Simulator check.
- Decisive check (`ph-sim.mjs --probe`): fixed hidden 100dvh / 100svh / 100lvh / 100vh probes, rect per rAF plus a
  ResizeObserver, through finger strokes that collapse and show the toolbar: distinct heights and RO callbacks per
  transition.

## Simulator (pending: queued as a shared simulator slot, deferred during P-155)

`ph-sim.mjs` per arm A, S, D: the open end state with the toolbar shown (scripted scroll) and collapsed (a WDA stroke):
innerHeight, visualViewport, unit probe heights, the nav's rect and its overflow past the visible bottom, two frozen
screenshots each (A/A); then WebKit Timeline counts (Layout, RecalculateStyles, Paint, ObserverCallback) per finger
stroke at the end (toolbar shows / hides while the panel is open or closes a little) and mid-page, with a rAF logger
(toolbar-moving frames, nav heights from a ResizeObserver, morphing frames).

## Risks, conflicts, follow-ups

- Look change (the open panel's bottom edge moves up 40 px with the toolbar shown; with svh also when collapsed):
  a proposal with Try-it, not a T2 claim.
- dvh: the panel relayouts on every toolbar frame while open or morphing (counts above); P1b's probe adds one RO
  callback per toolbar frame anywhere on the page (fix-end-morph-p1 can skip its work while the reveal is off if the
  Simulator shows the callback as non-trivial).
- Integration: int-v8's `fixes/v10/build.sh` slot `PANELH=<delta> PANELH_SHA=<sha12>` (after P1b, before nolift).
- Tablets (641-1200 px touch) keep `min(820px, calc(100vh - 40px))`; on an iPad in landscape the same overflow may
  occur. Not in this topic's scope; noted for the lead.
- Scripts here: `build.mjs`, `mk-tryit.mjs`, `ph-chrome.mjs`, `ph-sim.mjs`, `px3.mjs`, `mk-results.mjs`.
