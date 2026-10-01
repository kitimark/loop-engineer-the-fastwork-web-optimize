# Middle of the page (y ≈ 900 → #platform) and page-wide mechanisms: a per-frame cost model (de-middle)

Design-engineering note by `de-middle` (2026-10-01), method as in [`README.md`](README.md). Read-only study: no
measurements were taken for it. It re-reads the iPhone logs (`fixes/iphone-wave2/raw/`, `research/cpu-throttle-
calibration/data/iphone/`) and large-area-blur's WebKit Timeline paint rects (worktree `agent-a4091af4a88270aa0`,
`out/iphone-timeline/*-scroll-*.json`). Code: committed baseline `site-pretty/`. CSS = `_app/immutable/assets/
2.gBuqKVzi.css`, JS = `_app/immutable/nodes/2.DyWL8TcE.js`, 1-based. Labels: **vendor source**, **spec**,
**data** (file named), **derived** (my arithmetic or reasoning; a device check is still needed). Throughputs are
de-morph's assumptions (fills 1.5 Gpx/s, text 0.5, images 0.4, allocation 5 GB/s), so the notes stay comparable.

## 0. Decision first

1. **The ~106 ms frame is not the pain entry.** In 11/11 phone runs (baseline, aw1-10c and the controls) it starts
   at scrollY 1834-1867, 2.25-2.29 s into the scripted scroll (**data**). The only code threshold there is the
   **morph IntersectionObserver** on `#platform` (JS 13080-13088, `rootMargin: 200% 0px`). It fires at
   y = 4155 − 3 × 775 = **1830** (**derived**: `#platform` top 4155, innerHeight 775). The `is-pain-dark` switch
   fires at y ≈ **888**, while `.pain` is fully hidden under the future card. `.pain` is never content-visibility
   skipped on the phone under /10c.
2. **So the planned N10 ablations a-d should not remove it.** Prediction: all four leave a 95-115 ms frame at
   y ≈ 1840-1970 (§2.3). Two cheap runs would test the IO: **e1** = the existing `aw1-10c-6` / `mw-d-passive` build
   (#6 v05, passive listeners in the 200 % zone), and **e2** = the IO margin 200 % → 150 %. If the IO is the cause,
   e2 moves the frame to y ≈ 2218. Owner: **fix-nav-morph** (cluster B), not fix-scroll-engine.
3. **Middle-page cost is paint area, not script.** Over y 800-2700 the phone paints 13-19.5 CSS Mpx per second.
   That is ~40-58 viewports per second, about one full viewport re-raster per frame (**data**, Timeline chunks). Three
   terms dominate:
   - a 373 × 344 feed rect repainted on **every** frame (56-63 per 1 s chunk), cause unattributed;
   - the future card's reveal filter, which repaints all six 402 × 857 profile panels (four of them off-screen);
   - full-viewport section repaints at state switches (`is-pain-dark`, the morph IO frame, `.commission.shrinking`).
4. **Top 3 refactors (§4):**
   - R1, take every side effect out of the morph IO frame (fix-nav-morph): −60…−100 ms on the worst phone frame
     if e1/e2 confirm;
   - R2, the section background switches as solid-colour composited layers (W3): `is-pain-dark` and
     `.commission.shrinking` from ~10-20 ms each to ~1 ms;
   - R3, stop the per-frame feed repaint: −2-5 ms on every frame across y 1600-2500.

## 1. Geometry the model uses (data: `scroll_timeline.json` secs, phone 430 × 775, DPR 3, docH 6035)

| element | doc top | height | notes |
|---|---|---|---|
| `.hero-track` (200vh, CSS 1523-1527) | 0 | 1630 | 100vh = lvh = 815 on the phone |
| `#people` = `.start-selling-future` (margin-top 1px − 100svh, CSS 2368) | 856 | 1327 | card `min-height: 100svh`, padding 32/20/48 (CSS 3519-3525); header top = 888 |
| `#profile-showcase` (inside the card) | 1122 | 904 | deck = horizontal scroller, 6 panels of 402 × 857 (CSS 3450-3462) |
| `.feed` (inside the deck panels) | 1600-1617 | ~400 | |
| `.pain` (margin-top −100svh, z-index 1, CSS 2166-2176) | 1408 | 2325 | sticky (775) + hold (200svh = 1550). The sticky is stuck for y 1408-2958 |
| `.commission` (margin-top −100svh, z 3, CSS 1-14) | 2958 | 1197 | card `will-change: transform, border-radius` (CSS 42) |
| `#platform` | 4155 | 1880 | |

Reveal order on the way down: the future card (z 3, white) covers `.pain` (z 1) until its bottom (2183) passes. From
y = 1408 its bottom edge uncovers the stuck dark pain screen, fully at y = 2183. The white commission card then slides
over it from below. On the phone, the pain text is white (`.pain-copy h2 { color: #fff }`, CSS 2222). The light
state (`#fff` background, CSS 2306-2310) is therefore never meant to be seen, except through the card while the card
is still fading in (y ≈ 633-900).

Units (derived): viewport 1290 × 2325 = 3.0 device Mpx (12 MB); full screen 1290 × 2796 = 3.6 Mpx (14.4 MB);
`.pain-sticky` incl. note overflow 430 × 922 CSS = 3.57 Mpx; commission card 1290 × 3591 = 4.6 Mpx (18.5 MB,
< 1280 CSS px per side so one non-tiled buffer); future card 1290 × 3981 = 5.1 Mpx (tiled); six deck panels
6 × 3.1 = 18.6 Mpx (~74 MB; scroll-engine's layer probe measured `profile-deck` at 70.2 MB, which agrees).

## 2. The ~106 ms frame at y ≈ 1960

### 2.1 What the logs say (data)

| run | long frame (scrollY start → end) | follower | source |
|---|---|---|---|
| baseline goal B1-B3 | 146 / 112 / 113 ms, 1844-1867 → 1973-1986 | 84 / 65 / 67 ms | `goal-B*.json` |
| controls B5/B6/B9 (baseline) | 96 / 95 / 109 ms, 1836-1863 → 1956-1964 | 59-76 ms | `ctl-B*.json` |
| aw1-10c goal P1-P3 | 105 / 106 / 106 ms, 1838-1854 → 1958-1968 | 32-38 ms | `goal-P*.json` |
| Timeline, baseline ×3 + large-area-blur /01 ×3 | one **430 × 922 paint at doc y = 1832-1871** per pass (the viewport top: a full-screen repaint) | | `out/iphone-timeline/*-scroll-*.json` |

The frame's scrollY range is the UIKit animation moving on while the main thread is blocked (W2). The trigger is the
state at the start: **y\* ∈ (1825, 1867]**. Position and scroll time are both locked (the driver is open-loop), so
a time-based trigger at t ≈ 2.26 s can't be excluded from the logs alone. §2.2 uses the code to separate them.

### 2.2 Every code threshold near y\* (derived, vh = 775)

| mechanism | where | fires at | in y\*? |
|---|---|---|---|
| **morph IO** on `.start-selling-platform`, `rootMargin 200% 0px` | JS 13080-13088 | 4155 − 775 − 2·775 = **1830** | **yes, both versions** |
| `is-pain-dark` (future `l`: header top ≤ 0.5) | JS 11321-11325 | 856 + 32 = **888** | no |
| `.pain` content-visibility | JS 4736 + CSS 11759 | never on the phone: active at mount (top 1408 ≤ 2·775), and /10c re-skips only at 2.25 vh above | no |
| commission scene gate on (100 %) | JS 3143 | 2958 − 1550 = 1408 (cluster C, 33-47 ms) | no |
| platform scene on / hero off | JS 12448 / 4239 | 2605 / 2405 (cluster F) | no |
| nav `is-on-dark` (card bottom under the nav centre) | JS 12955-12963 | ≈ 2143-2183 (the 40 ms frame at 2232) | no |
| /10c `data-fw-wc` on `.commission-card` (50 % window) | scroll-engine patch | 2958 − 1162 = 1796 | aw1-10c only, before y\* |
| end of the future card's 1.6 s reveal blur | CSS 2398-2400 | time-locked, t ≈ 0.74 + 1.6 s ≈ y 1950 | baseline only (T10 moves it to ~y 1370) |

What the IO does: `u = true; z(b, true); I()`.
- **Baseline:** this mounts the morph panel inside the fixed nav: the `lN` template (JS 12878-12879) with its image
  columns, a second countdown `cD` and the CTAs. It also arms the non-passive capture `wheel` and `touchmove`
  listeners on `window` (`N()`, JS 13060-13066).
- **aw1-10c (#13 v03):** the panel is pre-mounted after load. The IO now flips `a.inert` on the panel subtree, gives
  ~21 `<img>` their `src`, and runs the same `N()`.

### 2.3 Cost model of that frame (derived; terms are estimates, not measurements)

| term | baseline | aw1-10c | basis |
|---|---|---|---|
| panel mount: DOM clone + style + layout + `cD` setup | 20-40 ms | 0 (pre-mounted) | Chrome LoAF 42-75 ms at 6x (TOPICS #13), calibrated 6x ≈ iPhone |
| new composited layers in the panel (a `filter: blur(12px)` panel of 390 × 735 = 2.6 Mpx = 10 MB, created and painted once) | 5-10 ms | 0 | allocation at 5 GB/s + paint |
| future card reveal blur ends: last repaint of the card plus all six deck panels (~23 Mpx, mostly fills and images) | 15-40 ms | 0 | T10 rate assumptions; the large-area-blur cluster E 162 → 105 ms/run fits this |
| `inert` flip: restyle of the panel subtree (~150 elements) | 0 | 1-3 ms | render.md per-element cost |
| 21 `src` assignments: load start; the decodes land in later frames | 0 | < 2 ms (the follower frames: 32-38 ms) | |
| `N()`: non-passive window listeners on iOS. These change the touch-event regions sent to the UI process. **If** WebKit recomputes them with an event-region paint walk over every composited layer, the cost scales with the whole page | ? | ? | **inference, low confidence**: [WebKit PR 68980](https://github.com/WebKit/WebKit/pull/68980) shows regions must be computed and propagated before touches; I found no iOS source for the cost |
| full-screen 430 × 922 paint (seen in the baseline Timeline; aw1-10c unknown): fills + 11 rotated notes with text and shadows ≈ 3.6 Mpx | 5-15 ms | 5-15 ms? | paint-rate assumptions |
| normal frame work (engine, nav `L`, composite) | ~15-20 ms | ~12-17 ms | iPhone p50 17 ms |
| **sum** | **~60-125 ms**: fits 95-146 | **~20-40 ms + the unknown `N()` term**: does not reach 106 without it | |

The model does **not** close for aw1-10c. Two readings fit the data:

- **H1a:** `N()` (non-passive listener arming) costs ~60-80 ms on WebKit. The baseline and aw1-10c then share that term,
  which fits their near-equal frames (112 vs 106).
- **H1b:** the v03 pre-mount had not happened by the time the scroll began on Safari. It uses a 2 s `setTimeout`
  after `load`, re-armed while scroll events arrive. The IO would then still mount the panel. This would also
  explain why aw1-10c barely changed this frame.

Both put the frame at the IO. A cheap probe tells them apart: is `.start-selling-morph-panel` in the DOM at scroll
start? It is a one-line `document.querySelector` in the R3 logger. Neither reading involves `.pain`.

### 2.4 Predictions per N10 ablation (on the aw1-10e rebuilds; so iphone-runner's results can refute this)

| ablation | prediction for the y ≈ 1840-1970 frame | other predicted effects | refuted if |
|---|---|---|---|
| d `is-pain-dark` frozen | **stays** 95-115 ms | frames at y ≈ 888-1000 (43-51 ms in 2/3 runs) drop by 5-15 ms. The phone pain screen becomes white with white text (diagnostic only) | the frame drops below 60 ms |
| c will-change windows off | **stays** (± 10 ms); fw-wc flips in the frame before it are only the commission card's entry at 1796 | p95 may move by 1 vsync | the frame drops below 60 ms |
| b `.pain` visible | **stays**; the R3 log shows no cv event for `.pain` in 1700-2200 | none | a cv event for `.pain` lands at 1830-1870 |
| a region blurs off | **stays** (the reveal blur already ends at ~y 1370 under T10) | cluster A (y 600-760) −10-30 ms | the frame drops below 60 ms |
| **e1** passive in zone (`aw1-10c-6` or `mw-d-passive`, already built) | H1a: drops below 50 ms. H1b: stays | — | — |
| **e2** IO margin 150 % (one-token diff at JS 13086) | **moves** to y ≈ 4155 − 2.5·775 = **2218** | — | it stays at 1840 (then the cause is elsewhere: inspect the 430 × 922 paint in a Web Inspector Timeline) |

R3 logger: add `inert` and `src` to its `attributeFilter`, and log the panel's presence at scroll start. As it is,
it cannot see the IO (it watches cv, `data-*` and `.pain`/`#people` classes only).

## 3. Per-mechanism cost models (page-wide)

**3.1 Section background switches** (`is-pain-dark`, CSS 2311-2315, JS 11324; `.commission.shrinking`, CSS 15-17
and 56-58).
- A class change restyles the section subtree: N ≈ 30-60 elements for `.pain`, ~150 for commission; cost N·c_style,
  under 2 ms.
- WebKit then repaints the background rect in the backing store that paints it. `.pain-sticky` is sticky, which
  means composited for async scrolling (**inference**). Its buffer holds the text and the 11 rotated notes, so the
  whole 3.6 Mpx buffer is re-rasterized: ~2.4 ms of fills + ~5-11 ms of notes/text.
- `.pain` and `.pain-hold` paint into the root tiles: up to ~1 viewport within coverage, ~2 ms.
- **T ≈ 10-20 ms**, once per crossing. It is a repaint of large content, not a colour change on a composited layer:
  the expensive kind.
- The Timeline rect `0,1408,430,922` (the 816-1708 chunk, every run) fits this repaint at y ≈ 888, where the
  unstuck sticky sits at 1408.
- The cheap kind (W3, **vendor source** `RenderLayerBacking::updateDirectlyCompositedBackgroundColor`): an empty
  composited box gets its colour as a layer property, with 0 backing and no repaint.

**3.2 content-visibility un-skip** (CSS 11759-11762; engine `sE` JS 2689-2708).
- Formula: T = N_sub·(c_style + c_layout) + A_paint·c_raster + Σ_layers(c_create + 4·A_layer/R_alloc + A_layer·c_raster).
- WebKit does this at a 0 margin (W1) and rebuilds all descendant layers on every re-entry.
- Chrome measured a first render at 45-70 ms at 6x (F-011, `#platform`/commission). /10c moves it to load + 0.65-0.8 s
  on Safari.
- On the phone, what is left is the scroll-up path: hero-track and `#people` re-skipped at 1.75 vh behind the user, and
  re-rendered synchronously at 1.5 vh. Their layers alone: profile deck 70 MB + `#people` 20 MB + hero 14 MB. At 5 GB/s,
  ~20 ms of allocation before any paint (**derived**). It is untested (iPhone item 7e).

**3.3 will-change windows** (/10c CSS rule; `fwWCSel`).
- A flip on creates a backing of 4·w·h·9 bytes and paints w·h·9 px. A flip off repaints the same area into the parent.
- Per crossing (derived): commission card 18.5 MB + 4.6 Mpx ≈ 4 ms + 5-10 ms; future card (tiled) ≈ 5 Mpx painted
  ≈ 5-10 ms; hero-copy and orbit cards < 1 Mpx each.
- The flips are placed ±0.5 vh off screen, so they cost frames but are never visible.
- The windows also flip stacking contexts (`will-change: transform` makes one), a parity risk for any refactor
  (§4 R5).

**3.4 Blur raster** (large-area-blur).
- GPU blur: T_gpu ≈ A·k_blur, small. A full-screen CA blur is ≈ 1-2 ms on A17 (**derived**).
- The real cost is **main-thread repaint while the filter value changes** (P4): T ≈ A_content·c_raster per changed
  frame, where A_content is everything the filtered layer paints.
- The future card's content includes the deck scroller: six 402 × 857 panels, ~18.6 Mpx, plus the card's 5.1 Mpx.
- Timeline: each panel repainted 4× per run in the baseline, 2× with T10 (**data**). That is ~90 → 45 Mpx per run,
  ≈ 60 → 30 ms of raster per pass at 1.5 Gpx/s.

**3.5 Commission `.shrinking`**: on the phone nothing animates. The scale is 1 and the radius 0 (CSS 925-933). The
class is a discrete background switch (section root + runway → `#131922`), the same cost class as 3.1, about
4.6 Mpx of root tiles. It sits near the commission/platform edge (clusters F/G). The desktop shrink animates
`transform` (composited) plus `border-radius` through custom properties; that is main-thread style plus a shape mask.

**3.6 Scroll-engine per-frame writes** (`iE`, JS 2670).
- T = Σ_callbacks(t_js) + Σ_writes N_inherit(w)·c_style + n_forced·T_layout, with c_style ≈ 50 µs per element.
  That figure comes from F-029: 429 elements in 21.7 ms at 6x, calibrated ≈ iPhone (**derived**, upper bound).
- On aw1 phones: T1 gated the shrink writes, and the pain and commission reads are gone. Left: nav `L`, about 1.6-1.9 ms
  per call at 6x (526-617 ms per 316-320 calls, F-009), plus one `.hero-track` read in `l`. So ~2-4 ms per scroll
  frame.

**3.7 Per-frame layer resizes** (de-morph's finding: a resized backing store is dropped and fully repainted).
- Mid-page on the phone after wave 1, I find **none**:
  - future and commission shrink: scale 1 / radius 0;
  - profile: gated;
  - carousel and fee bar: composited (T5).
- Left in the hero window: `.start-selling-future-people-o` animates `grid-template-columns` + `height` (CSS 2471-2473),
  and its faces animate `width`/`max-width`/`margin` (2548-2554). That is layout per frame for 0.92 s, plus a resize of
  any composited face. This is de-hero's area (F-032, P3).

**3.8 The per-frame feed repaint** (new, **data**):
- Rect `36,1665,373,344` repainted 56-63 times per 1 s chunk over y 1708-2500, and 16-22 in the chunk before. Rect
  `428,1648,373,353` (the next deck panel, off-screen) 22-26 times.
- That is 1.15 Mpx every frame ≈ 2-5 ms per frame.
- Cause unattributed. The 0.32 s `feed-panel-in` (CSS 5121) is too short. Candidates: a feed item animating a paint
  property, or a rotating vinyl (`vinyl-spin`, CSS 3850) without its own layer.

## 4. Render-complexity table, every topic in `fixes/TOPICS.md`

"now" = estimated iPhone cost on aw1-10c/10e; "min" = an equivalent-pixel design; all **derived** unless marked data.
Hero (y 0-900) and end-of-page rows are brief: depth in `hero.md` (de-hero) and `morph-endpage.md` (de-morph).

| # | topic (status) | dominant term | complexity | now (iPhone) | min | gap |
|---|---|---|---|---|---|---|
| 1 | countdown-idle-raf (landed) | rAF spring writes per digit face + repaint of a 60 × 60 region | O(faces · frames) style + O(region) paint | ~0 in scroll (gated); 1 Hz snap residual | CSS transition per strip, 0 main thread | ~1 ms/s, de-hero |
| 2 | scroll-engine-batching (/10e landed) | callbacks interleaving reads and writes | O(callbacks) + O(forced layouts) | 2-4 ms per frame (nav `L`) | 0 reads per frame (IO + cached metrics), ~0.3 ms | 2-4 ms per frame (20-34 ms band) |
| 3 | nav-hit-test (landed) | `pointer-events` write restyled nav + panel twice per frame | O(nav subtree) ×2 → O(hit-test depth) | < 1 ms | same | ~0 |
| 4 | phone-invisible-shrink (landed) | inherited `--future-shrink` restyled `#people` + forced layout | O(subtree) per frame → 0 on phones | 0; cluster D 243 → 56 ms/run (**data**) | 0 | 0 |
| 5 | commission-forced-layout (landed) | `Range.getClientRects` forced layout per frame | O(text layout) → 0 | ~0; left: `.shrinking` background switch | solid-colour layer (R2) | ~5-10 ms once per crossing |
| 6 | morph-scrolljack-passive (#6 v05, iPhone-gated) | blocking touch region: input waits for the main thread | latency = main-thread frame time | finger only; arming at y 1830 may cost the 106 ms frame (§2) | passive listeners registered once, blocking only while morphing | up to ~60-100 ms once (if H1a) |
| 7 | hero-exit-scroll-timeline (wave 2) | per-frame `--exit-*` restyle of the hero + blur repaint of copy/cue | O(hero subtree) + O(area) per changed frame | de-hero | threaded scroll timeline (26.4+) | de-hero |
| 8 | large-area-blur (landed) | repaint of the filtered layer's whole content while the radius changes | O(A_content) per changed frame; A = card + 6 deck panels ≈ 23 Mpx | ~45 Mpx raster per reveal (2 repaints) | blur only a fixed-radius snapshot, cross-faded by opacity: 0 repaints | ~30 ms per reveal pass (R4) |
| 9 | layout-animations (landed) | width/flex-basis layout animations | O(row layout) per frame → composited | ~0 mid-page; doc-sweep `background-position` repaint at the bottom (de-morph) | transform/clip | small |
| 10 | toolbar-resize | ~36 resizes re-run every callback | O(callbacks · resizes) | finger only | one debounced run | finger test |
| 11 | pain-offscreen-notes (landed) | per-frame rect read + no-op state write (P9) | O(1) read + O(each-block) per frame → 0 | 0 | 0 | 0 |
| 12 | scene-gating-tighten (in /10c) | subtree flips: the `:where(*)` paused rule + cv | O(subtree) style + O(layers · area) | flips placed off screen | same, at idle/scrollend | scroll-up path untested (3.2) |
| 13 | morph-panel-lazy-mount (landed) | panel mount inside a scroll frame | O(panel DOM + layers) | pre-mounted; IO residual (§2) | IO does nothing on scroll (R1) | §2 |
| N2 | morph-composited | resized backing per morph frame | O(Σ resized A) per frame | 58-68 ms p50 moving (de-morph) | clip-path + opacity | de-morph |
| N4 | custom-property-scope | inherited custom-property write | O(subtree) → O(1) with `inherits:false` | few writes left on phones (`--morph`, `--exit-*`) | O(1) | 1-3 ms during morph/exit |
| N5 | layer-diet | backing memory + per-flip create/destroy | O(Σ 4·w·h·9 B) | deck 70 MB, `#people` 20, hero 14, commission card 18.5 | stable layers, no windows | memory pressure → Conservative policy (webkit.md §4) |
| N6 | nav-backdrop-budget | backdrop re-blur of the area under the fixed nav, every frame | O(nav area · r) GPU | nav 398 × 52 = 0.19 Mpx: < 0.5 ms (the morph is de-morph's) | same | ~0 mid-page |
| N7 | input-listener-diet | listener dispatch | O(events) | small | — | — |
| N8 | morph-scroll-driven | JS spring on touch | — | de-morph | — | de-morph |
| N9 | scene-gate-flap (fixed by /09) | gate flapping at the margin edge | O(flips · subtree) | 0 (**data**: 800 → 0) | 0 | 0 |
| N10 | transition-frames | §2: the morph IO, not pain | — | 105-106 ms once per pass (**data**) | ~17-25 ms | ~80-90 ms |
| N11 | vendor-scrollend (done) | gtag `onscrollend` JS | O(1), 45-74 ms | vendor | site GA setting | not page-fixable |
| N12 | nav-scroll-handler (record) | `getComputedStyle` + rects per frame | O(reads) + forced style | 2-4 ms per frame; ~50 ms at y ≈ 700 (1/3) | cached ranges | 2-4 ms per frame |
| N13 | platform-visual-anim-storm (closed) | — | — | rare | — | — |
| new | `is-pain-dark` / `.shrinking` switches (3.1, 3.5) | background repaint of large painted layers | O(A_section) once per crossing | 10-20 ms at y ≈ 888; ~5-10 ms near the commission end | O(1) layer property (R2) | ~10-20 ms |
| new | feed per-frame repaint (3.8) | 373 × 344 rect every frame | O(A_rect · frames) | 2-5 ms on every frame over y 1600-2500 | composited or paused off-screen: 0 | 2-5 ms per frame |

## 5. Equivalent-pixel refactors, ranked by expected gain / risk

**R1. Morph IO does nothing heavy in a scroll frame** (owner fix-nav-morph; code JS 13060-13088 and #13's src hunk).
- Change:
  - give the panel images their `src` (with `decoding="async"`) during the idle pre-mount, not at the IO;
  - keep `inert` on the panel until the morph starts (`E`), not until the IO;
  - register the touchstart/touchmove/wheel listeners once after load, passive, and switch to blocking only at the
    end (#6 v05's mode 2), or arm them at the 300 ms-quiet moment #13 already uses;
  - make sure the pre-mount happened (H1b) before any scroll (the `scrollend`/quiet-input timer).
- Parity: none visible. The panel is opacity 0 and clipped by the 64 px nav. Behaviour: the same morph start.
- Expected: the y ≈ 1830 frame → 17-35 ms (−70…−90 ms), only if e1/e2 confirm the IO.
- Cost: 21 image fetches move to idle (bandwidth); `decoding=async` keeps their decode off the main thread.
- Verify:
  - Chrome short lane: panel DOM/attributes identical at y 0/1830/5260, morph state check (the existing logger-check);
  - iPhone: scripted B P P B B P through y 1700-2200, frame start positions, plus one finger pass for the jack.

**R2. Section background switches as solid-colour composited layers** (owner: fix-scroll-engine (N10), with future `l`
unchanged).
- Change, phone media block CSS 2305-2315:
  - `.pain-sticky` and `.pain-hold` backgrounds become transparent;
  - `.pain::before` = `position: absolute; inset: 0; z-index: -1; background: #fff; will-change: transform`;
  - `.pain.is-pain-dark::before { background: #131922 }`.
  - `.pain` is already a stacking context (z-index 1), so the pseudo paints below the sticky (z 2) and the hold.
  - Same for `.commission.shrinking` with a `::before` that covers section + runway.
- Parity: identical colours and rects. Risks:
  - the pseudo must cover `.pain`'s full 2325 px, and the stuck sticky must stay transparent;
  - a z-index mistake shows the notes or text over or under the wrong colour.
  - The Chrome frozen-frame diff at y 900/1408/2183/2958 catches both (expect 0 %). Layers tab on the phone: the
    pseudo shows 0 paints after the first frame.
- Expected: the switch costs one layer-property commit plus the subtree restyle, < 2 ms, from 10-20 ms. Memory:
  0 backing (solid-colour layer).
- Alternative with no new layer: none. The opacity cross-fade of two layers (W3) costs 2 × 12-15 MB for the same
  pixels.

**R3. Stop the per-frame feed repaint** (owner: whoever owns the profile showcase; layout-animations' scope).
- First, name it with one Web Inspector Timeline capture at y ≈ 1900.
- Then compositing-only:
  - if it's a rotation, give `.record.spinning` its own layer (`will-change: transform` inside the scene);
  - if it's a paint-property loop, use transform/opacity;
  - and pause it with an IO at `0px` (T6).
- Parity: the same frames, or P11 phase shifts.
- Expected: −1.15 Mpx per frame, −2-5 ms on every frame over y 1600-2500 (the > 20 ms band).

**R4. Reveal blur without repainting the content** (owner fix-large-area-blur, cluster D rules).
- Today the radius changes for 0.9 s, so WebKit re-rasterizes the card and its six deck panels.
- Equivalent pixels:
  - blur at a **fixed** 14 px on a snapshot-free path: put `filter: blur(14px)` on the card in the hidden state;
  - reveal by cross-fading opacity between the blurred card and an unblurred twin.
- The twin doubles the DOM, so that is too heavy. A cheaper near-equivalent: transition `filter` only while
  `opacity < 1` (0.7 s) and snap to `none` at the end, as T10 already does at 0.9 s.
- Expected remaining gain −15 ms per reveal at most. Rank low: T10 took most of it.

**R5. Fewer, stable layers instead of will-change windows** (owner fix-scroll-engine, /10d).
- Replace per-element `data-fw-wc` flips with a fixed budget:
  - keep `will-change` only on elements whose transform/opacity actually animates during scroll;
  - on the phone that is none mid-page, since shrink scales are 1. So drop `will-change` there via the phone media
    query, not by JS windows.
- Parity risk: `will-change: transform` creates a stacking context and a containing block for fixed descendants.
  Removing it can reorder paint (the cards have `isolation: isolate` already, so this is low).
  - Frozen-frame diff at 8 positions.
- Expected: no layer churn at the window edges (removes candidate (b) of the /10c p95 flag); −18.5 MB of commission-card
  buffer on phones.

**R6. Un-skip ahead of the user, both directions** (owner fix-scroll-engine).
- Under /10c the scroll-up re-render pays ~100 MB of layer allocation synchronously at 1.5 vh.
- Equivalent: re-skip behind the user only beyond 3 vh (W1 option 2), or never on phones (memory permitting), with
  `contain-intrinsic-size: auto` as today.
- Expected: removes a predicted 30-60 ms scroll-up frame (untested). Verify on the iPhone with a flick back to the top
  (item 7e).

## 6. Verification plan (all read-only for this team; the owners run them)

| refactor | Chrome (short lane, counts only) | iPhone | pass criterion |
|---|---|---|---|
| e1/e2 ablations (first) | none | scripted ×3 each, R3 logger with `inert`/`src` + panel-present flag | frame position follows the margin (e2), or vanishes (e1/H1a), or the panel was absent at scroll start (H1b) |
| R1 | state probe at y 0/1830/5260; morph logger-check (`--morph` 0 → 1 → 0, pins, preventDefault counts equal) | B P P B B P through 1700-2200, then a finger pass | no > 50 ms frame at y 1830-1990 in 3/3 runs; finger: the jack still engages |
| R2 | frozen-frame diff at 900/1408/2183/2958/4100 = 0 %; class/attribute dump equal | Timeline: no 430 × 922 (or ≥ 0.3 Mpx) paint at the switch positions; Layers: pseudo 0 paints | 0 % diff; frames at y 888-1000 −5-15 ms |
| R3 | `getAnimations()` inventory at y 1900, paint-flash count over 2 s | Timeline paint rects: `36,1665,373,344` ≤ 2 per chunk | rect gone from the per-frame list |
| R4 | frozen frames during the reveal (t = 0.1-0.9 s) ≤ 0.4 % | Timeline: panel repaints per run ≤ 1 | — |
| R5 | frozen-frame diff at 8 positions; LayerTree count ≤ /10e | Layers tab count and memory at 5 positions | 0 % diff |
| R6 | re-skip/un-skip timeline (mech-c) | flick bottom → top ×3, frames at y 1.5-2.5 k | no new > 34 ms frame on the way up |

## 7. Open questions

- What is the 430 × 922 full-screen paint at the IO frame? `.pain-sticky` re-rasterized while stuck, or a nav/panel
  layer? One Web Inspector capture with "Paint Flashing" on, at y ≈ 1850, answers it.
- Is `.pain-sticky` composited on iOS 26 (sticky + async scrolling)? The Layers tab answers it. If it isn't, 3.1's
  repaint lands in the root tiles instead, at the same order of cost.
- Does adding a non-passive window touch listener trigger an event-region update over every layer on iOS? H1a depends
  on it; e1 measures it directly.
