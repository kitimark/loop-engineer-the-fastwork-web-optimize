# Fix: panel-height (the open end-of-page panel is taller than the visible iPhone screen)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and the `delta-*.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** measured (counts, geometry, pixels; no timing). Both options built; Chrome and Simulator (AD1, ASD2) done.
Next: the proposal with Try-it (the user picks svh or dvh), then int-v8 builds it into v10. Then a proposal with
Try-it for the user (look change: memory "proposal-try-it-required").
**Stage:** F (build + counts). User report T-204 #20; the user wants it in v10 (T-204 #22).
**Device class / gate:** phone-only look (iOS Safari's toolbar; Chrome's emulation has no small/large viewport).
**Driver(s) behind the claims:** Chrome viewport-height steps (counts), Simulator WDA finger strokes (G, counts). No timing.
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

- Base A = fix-end-morph-p1's A1 snapshot (v9-final + F1/U2 + I-219 + P1 + P1b (a)), CSS cfb8b8c5b019,
  copied to `out/ph/A`: JS ed44af454a92 for Chrome and AD1, then f83aa54c2acc for ASD2 and the Try-it patches (P1's
  aria-hidden, and P1b's RO callback reading no style on a height-only change; CSS unchanged throughout). The deltas
  are CSS-only and apply unchanged. Each delta is 2 hunks with 3 lines of context; both hunks also exist without P1 except the glass one.
- Both places change together: otherwise P1's glass (the blurred box under the nav while it morphs) and the nav would
  disagree on the height. `.fw-rv-size` inherits, so it follows by itself.
- svh: the panel always fits the small viewport (toolbar shown); with the toolbar collapsed it leaves ~40 px more gap
  at the bottom (52 instead of 12, measured). Its height never changes.
- dvh: always 12 px from the visible bottom; its height follows the toolbar while it moves.
- Unchanged: desktop and tablets (rule is <= 640 px only; the tablet rule `min(820px, calc(100vh - 40px))` is not part
  of this report), Chrome (all units equal there, below), reduced motion (the same rule; 7c's mode does not matter).
- Builds: `node fixes/panel-height/build.mjs` (writes out/ph/{S,D} and the deltas, checks one match per site).
  Try-it patches (baseline-relative, strict re-apply exact): `node fixes/panel-height/mk-tryit.mjs` ->
  `fixes/panel-height-base/patch.diff` (A, b0f72b7d5cb9), `fixes/panel-height-svh/patch.diff` (fc59fae6e20a),
  `fixes/panel-height-dvh/patch.diff` (c141b2c414bd), all on A1 JS f83aa54c2acc. `patch.diff` here = the dvh one (the lead's lean) until the user
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

## WebKit: does dvh follow every toolbar frame? Yes (source + Simulator check below)

- By code, likely yes: `LocalFrameView::setLayoutViewportOverrideRect` (LocalFrameView.cpp 1969-1991) forces
  `TriggerLayoutOrNot::Yes` whenever the layout viewport's size changes (1978-1979) and then calls
  `document->updateViewportUnitsOnResize()` (1988-1990), and `sizeForCSSDynamicViewportUnits` returns that override
  rect's size (7232-7235). The `m_isInStableState && !isChangingObscuredInsetsInteractively` gate in
  `WebPage::updateVisibleContentRects` (WebPageCocoa.mm 4196-4208) only decides the trigger for unchanged sizes.
  The Simulator check (next section) shows dvh taking a new value in every frame the toolbar moves: **CONFIRMED**.
- Decisive check (`ph-sim.mjs --probe`): fixed hidden 100dvh / 100svh / 100lvh / 100vh probes, rect per rAF plus a
  ResizeObserver, through finger strokes that collapse and show the toolbar: distinct heights and RO callbacks per
  transition.

## Simulator (fw-sim 15 Pro Max, iOS 26.5, Safari 26.5; runs AD1 09:53Z and ASD2 10:09Z, functional shared slots)

`ph-sim.mjs` per arm: the open end state with the toolbar shown (scripted scroll to the end) and collapsed (finger
strokes into the end from above the morph zone; at the page's maximum a stroke cannot scroll and Safari keeps its
toolbar, AD1), geometry and two frozen shots each; WebKit Timeline counts per finger stroke; the per-frame unit probe
(AD1). ASD2 used fix-end-morph-p1's newer A1 (JS f83aa54c2acc, its RO callback reads no style on a height-only change;
CSS unchanged). Raw: `out/ph/sim-AD1-*/`, `out/ph/sim-ASD2-*/` (gitignored).

**Where the open panel ends, per toolbar state** (positive = past the visible bottom; the panel's top is 12 px):

| arm | toolbar shown (visible height 775) | toolbar collapsed (visible height 815) |
|---|---|---|
| A, today (vh = 814.98) | **28 px past the bottom** (nav bottom 802.98) | 12 px gap (802.98) |
| svh (775) | 12 px gap (763) | **52 px gap** (763) |
| dvh (follows the toolbar) | 12 px gap (763) | 12 px gap (802.98) |

- vh = lvh = 814.98 in both states, svh = 775, dvh = innerHeight (775 / 814.98): the Simulator agrees with the source.
- Shots (`A-shown-1.png`, `D-shown-1.png`): in A the panel's rounded bottom corners and the footer's "Privacy Policy"
  line sit under Safari's bottom toolbar; with dvh or svh the whole panel shows with a 12 px margin, as at the top.

**T2 pixels** (`px3.mjs --top 59 --files`: the Simulator shot starts with the 59 css px status bar, skipped; A/A = a
second shot of the same arm 0.7 s later, frozen clock):
- Toolbar shown, dvh or svh vs A: 65,412 / 65,427 css px differ, all inside the box x 12-418, page y 12-775: the panel's
  own box up to the visible bottom; nothing outside it. Inside, everything placed from the panel height moves: the centre
  block (title, countdown, buttons) up ~20 px (h/2), the footer up 40 px, the photo-wall columns (their offset is a % of
  the panel height). That is the look change the user decides on.
- Toolbar collapsed, dvh vs A: **identical** (the second shots compare at 0 device px; the first pair's 790 css px are
  the countdown's digit row, which also differs A vs A, 658 css px). svh vs A: 76,151 css px, all inside the panel box
  (the 40 px shorter panel).

**dvh follows every toolbar frame: CONFIRMED** (WebKit source above + the decisive check, mid-page, 4 transitions,
probes 100dvh/svh/lvh/vh at position:fixed, rect read per rAF + ResizeObserver):

| transition | frames | innerHeight values | 100dvh values | svh / lvh / vh | dvh RO callbacks | frames with dvh = innerHeight |
|---|---|---|---|---|---|---|
| hide 1 | 200 | 8 | 10 | 775 / 814.98 / 814.98 | 9 | 200 of 200 |
| show 1 | 195 | 9 | 11 | same | 10 | 195 of 195 |
| hide 2 | 199 | 8 | 9 | same | 8 | 199 of 199 |
| show 2 | 200 | 11 | 13 | same | 12 | 200 of 200 |

So with dvh the panel's height changes 8-12 times per toolbar show or hide, once per frame the toolbar moves; vh, svh
and lvh never change.

**Mid-page cost of dvh (panel closed, pill):** WebKit Timeline per finger stroke that moves the toolbar (5-10
toolbar-moving frames each), A vs D: layouts 26/35/30/26 vs 31/26/24/35, style recalcs 46/36/39/37 vs 52/36/33/39, paints
67/92/88/84 vs 76/84/76/89 (the same within stroke-to-stroke spread); ResizeObserver callbacks 0 vs 7/11/9/10 (P1b's
`.fw-rv-size` probe, one per toolbar-moving frame; no write).

**Panel open or morphing while the toolbar moves** (ASD2, one stroke pair per cycle, 2 cycles per arm at the end;
`tbframes.mjs`: each rendering frame is matched to the logger's rAF in it, "toolbar-moving" = innerHeight changed since
the previous rAF):
- The toolbar only moves while the page scrolls, and at the end every scroll pixel moves the morph: so the toolbar never
  moves with the panel fully open (0 such frames in every arm); it moves only in morphing frames, the end zone's
  heaviest frames (P1's reveal is on).
- Per toolbar-moving morphing frame:

| arm | frames (n) | layouts | style recalcs | paints | paint area (kpx) | RO callbacks |
|---|---|---|---|---|---|---|
| A (vh) | 16 | 5.00 | 4.13 | 9.75 | 466 | 0 |
| svh | 17 | 5.12 | 3.94 | 11.59 | 540 | 0 |
| dvh | 4 | 5.00 | 4.75 | 13.25 | 808 | 2.00 |

- Reading (OBSERVED, small n for dvh: 4 frames, the strokes' end positions differed per arm because 7d's settle snapped
  A and svh closed and dvh open): dvh adds no layout pass per toolbar frame in WebKit (5 in every arm), but about one
  more panel-sized repaint (+~340 kpx, the panel is 406x751-791 css px = 305-321 kpx) and two RO callbacks (P1b's
  probe and the glass re-apply) per frame. A second session (A, D, 5 cycles) was queued and withdrawn when P-155 part 2
  restarted; it runs in a gap if the lead wants a larger n.
- Frames with the toolbar still and the panel open (191 dvh, 92 A, 125 svh): 0.29-0.52 layouts, 0.5-1.1 paints per
  frame in every arm: no standing cost.

## Risks, conflicts, follow-ups

- Look change (the open panel's bottom edge moves up 40 px with the toolbar shown; with svh also when collapsed):
  a proposal with Try-it, not a T2 claim.
- dvh: in WebKit the panel takes a new height in every toolbar frame; that frame is always a morphing frame at the end
  (about one more panel-sized repaint and 2 RO callbacks per frame, no extra layout pass; small n). Mid-page P1b's
  probe adds one RO callback per toolbar frame (no write, no style read since A1 f83aa54c2acc).
- svh: no extra work at all, but a 52 px gap under the open panel whenever the toolbar is collapsed, which at the end of
  the page is the usual state after scrolling down.
- Integration: int-v8's `fixes/v10/build.sh` slot `PANELH=<delta> PANELH_SHA=<sha12>` (after P1b, before nolift).
  int-v8 (dry run): both deltas from aa507a8e apply strictly on every v10 base (nav F1+U2 / U2-only / none; P1b (a) /
  (a)+(b) / none; I-219 on top), CSS 0546615f27ea (dvh) / 75c30c18d971 (svh) reproduce, code parity 0, no JS change.
- Tablets (641-1200 px touch) keep `min(820px, calc(100vh - 40px))`; on an iPad in landscape the same overflow may
  occur. Not in this topic's scope; noted for the lead.
- Scripts here: `build.mjs`, `mk-tryit.mjs`, `ph-chrome.mjs`, `ph-sim.mjs`, `px3.mjs`, `tbframes.mjs`, `mk-results.mjs`.
