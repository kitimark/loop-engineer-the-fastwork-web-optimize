# Research: end-morph (the nav's morph into the end-of-page menu, user T-204)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The overlay holds excerpts of Fastwork's code: it stays local and is never committed.

**Status:** research: cost map + candidate list (no fix built, no timing run, no phone).
**Stage:** R/I (census and event mapping from counts and from re-reading signed phone data).
**Owner:** fix-end-morph. **Board row:** `end-morph`.
**Question (user T-204, 2026-10-05 21:14Z):** make the end-of-page scroll smoother, specifically the nav morph into the
end section; one visual still lags there.
**Base:** v9.2 = v9.1d (JS `941aa13e5bdf`, CSS `f1997edf5309`), rebuilt here with `node tools/fix.mjs apply end-morph
--from v9-2` (hashes checked). Snapshot `b1789284481295-4ad4a84a`.
**Device class:** phone-only, render-bound (WebKit main-thread Composite/paint). Chrome shows almost nothing (below).
**Rule in force:** memory "defer-timing-focus-call-tree": counts and call trees only, shared slots; no timing A/B, no
phone. Phone numbers below are a DESCRIPTIVE re-read of fix-end-bg's signed P-137 block (no new phone run).

## 1. How the morph works on v9.2 (code, read in the overlay; 1-based lines)

- Touch phones (`__msOn`, JS 14332-14335) get the 7d scroll-driven morph: `div.fw-ms-end` (100lvh runway) after
  #platform, #platform sticky at `top: calc(100dvh - var(--fw-ms-h))` (CSS 12422-12424). Per scroll frame the engine
  (`rE` -> rAF `iE`, JS 2702-2708) calls `L` (14575): `_()` (nav theme, 14273-14309) then `__msTick` (14455-14480):
  `e = (scrollY - (scrollHeight - innerHeight - t)) / t`, clamped; `__navMorphSet(e)` (14482-14490) writes the morph
  signal `x`, `S()` writes `--morph-fade` on #platform (14311-14316), and at `e <= 0.2` a microtask re-runs the nav hit
  test `F()` (getBoundingClientRect + elementsFromPoint, 14022-14031).
- The header's template effect (14868-14894) writes `--morph` inline on the header and, via `__mkW` (14752-14756), on 6
  children. The header CSS (11806-11840, phone values 12108-12116) computes from it: `top`, `width` (pill 398 -> panel
  406 css px), `height` (52 -> 100vh-24), `background: color-mix`, `border-radius`, `backdrop-filter: blur(20px*(1-m))`.
  The panel (10957-10968) is `inset: 0` of the header with `filter: blur(...)`, `opacity` and `transform: scale(.96+.04m)`;
  its photo wall (10987-11035): 3 visible columns, each `translateY(--col-offset %)` of its own height, with a
  `will-change: transform` track and a 16 s drift animation.
- #platform: `filter: blur((1 - fade) * 12px)`, `opacity: min(fade, .9999)` (5699-5705), fade = 1 - m/0.55 (`QM`, 13754).
- `__nsOnScroll` (14208-14210) reads `window.scrollY` on every scroll event.

## 2. Cost map

### 2.1 Chrome (430x775 DPR 3, touch, no throttle, counts only; `em-chrome.mjs`, 2 runs agree)

Per frame of a rAF-stepped open / close (40 steps over the 775 px runway, touch held):

| phase | style recalcs | elements restyled (of them in forced recalcs) | layouts | dirty objects | Paint events | raster tasks |
|---|---|---|---|---|---|---|
| approach (#platform rising) | 1.1 | 32 (32) | 0.1 | 0.9 | 4.9 | 6.1 |
| open | 2.4 | 35 (24) | 1.1 | 4.0 | 8.1 | 14.6 |
| close | 2.6 | 27 (17) | 1.0 | 3.3 | 8.0 | 13.8 |
| rest open | 1.0 | 10 | 0 | 0 | 3.0 | 0.3 |
| 0.7 s after a close | 1.0 | 14 | 1.0 | 1.9 | 3.2 | 4.0 |

- Painted per morph frame: the header, the 3 photo-wall tracks, #document, and the `secure` / `organized` title sweeps
  (these two repaint every frame even at rest open, when #platform is at opacity 0).
- Call tree (CPU profile, 100 us, ~200 frames): `__nsOnScroll` 52 ms self (its `scrollY` read carries a forced style
  recalc on every scroll event: 30/30 and 40/40 events in approach / open), the nav hit test `F()` 44 ms
  (elementsFromPoint 24, getBoundingClientRect 19; via `_()` while morphing and via 7d's microtask at m <= 0.2),
  Svelte flush ~26 ms, `setProperty` 22 ms. Small at no throttle (~0.3-0.5 ms per frame).
- After every close the header runs `background-color` 0.7 s and `width` 0.68 s transitions (`:not(.is-morphing)`, CSS
  11841-11848), plus g11's 0.75 s hide and nav-earn's three 0.68 s WAAPI animations: a layout every frame for ~0.7 s,
  also when the scroll ended exactly at m = 0 (the width delta is then ~0.2 css px).
- Chrome toolbar-step emulation (775 <-> 815 at m 0 / 0.5 / 1): no layout in the step windows. Chrome cannot show the
  phone's cost (P5, F-289).

### 2.2 iPhone, P-137 records re-read (G driver, xcode-serious; `p137-mbins.mjs`, `p137-tlwork.mjs`; OBSERVED, decides nothing)

Metric frames of `fixes/end-bg/phone/p137-read.mjs` (last-screen band, after a touchend), binned by the morph value m
(the page's own formula) and by "on a toolbar step" (innerHeight changes next to the frame). Medians per frame over the
frame's gap in the phone's Timeline:

| arm, m bin, toolbar | frames | dt>34 | Composite ms | Paint ms | paints | painted kpx | Layout ms | Style ms | script ms |
|---|---|---|---|---|---|---|---|---|---|
| C, 0<m<0.55 (#platform fading), no step | 322 | 8 | 7.5 | 0.4 | 10 | 628 | 0.7 | 0.8 | 2.3 |
| C, 0<m<0.55, step | 331 | 37 | 11.8 | 0.5 | 15 | 1037 | 1.3 | 2.0 | 2.4 |
| C, 0.55<=m<1 (panel only), no step | 560 | 7 | 7.6 | 0.4 | 13 | 1140 | 0.5 | 0.5 | 1.6 |
| C, 0.55<=m<1, step | 268 | 20 | 12.4 | 0.5 | 14 | 1279 | 1.3 | 1.8 | 2.0 |
| C, m=1 | 52 | 4 | 9.1 | 0.4 | 14 | 1340 | 0.5 | 0.7 | 1.9 |
| V (nobg), 0<m<0.55, no step / step | 365 / 392 | 0 / 8 | 4.5 / 7.6 | 0.3 / 0.4 | 9 / 15 | 527 / 1020 | 0.7 / 1.1 | 0.7 / 1.7 | 2.6 / 2.3 |
| V, 0.55<=m<1, no step / step | 607 / 295 | 1 / 1 | 5.3 / 7.8 | 0.3 / 0.4 | 12 / 16 | 913 / 1012 | 0.4 / 1.1 | 0.4 / 1.5 | 1.3 / 2.1 |

What it says (OBSERVED in our setup):
- The end-of-page frame cost on the phone is **Composite** (WebKit's layer flush in the rendering update, which paints
  the dirty backing stores): 7.5-12.4 ms median per frame on C, against ~0.5-1.3 ms Layout, 0.5-2 ms style, ~2 ms script.
  Timeline "Paint" records are small (0.4 ms): on iOS the web process records draw commands and the GPU process
  rasterizes (WebKit source, partly CONFIRMED in fixes/end-bg/README.md section 5).
- Pictures make each repaint dearer: nobg (V) lowers Composite by ~3 ms per frame in every cell, with the same number of
  paints.
- **Toolbar steps add ~4-5 ms of Composite** in both bins (also in V). Slow-frame rate on C: 11.2 % on step frames vs
  2.5 % without in the fade bin, 7.5 % vs 1.3 % in the panel bin. 57 of C's 76 slow frames are step frames.
- What repaints (paint rects per frame, css px):
  - every morph frame: the photo-wall tracks (131-139 x ~495-512, a new width every frame: 2-3 rects per frame), the
    header (398-406 x 52), the footer (392 x 86), a 243 x 44 and a 73 x 36 rect (nav parts);
  - step frames only, 0<m<0.55: #platform's visible tiles (430 x 513 and 430 x 345, ~0.85 each per step frame), its
    stage artboard (390 x 312), the secure-network parts (66 x 66, 73 x 4, 57 x 2), 279 x 37, 390 x 85, 390 x 229;
  - step frames only, 0.55<=m<1 (#platform at opacity 0, invisible): still the stage artboard (0.73 per frame) and the
    secure-network parts (0.8-0.9 per frame).
  - Without a toolbar step, #platform's tiles do NOT repaint on the phone while its blur changes.
- Slow frames by bin (F-295): C 45 at 0<m<0.55, 27 at 0.55<=m<1, 4 at m=1; V 8 / 2 / 3.

### 2.3 Simulator (WebKit Timeline + LayerTree, counts only)

- Prior data (fix-hero-exit-threaded's ablations on v9-final + 7d, `out/morph-scroll/ablate` in its worktree; read here):
  a 20-frame rAF glide repaints #platform's 430x1880 layer 22-28 times (gone with `filter: none` on #platform and the
  panel), the 3 photo tracks 32-41 times each (still there with the panel fixed-size alone, and with the panel's scale
  off alone), the header ~50, the panel's center/veil/footer ~40. Rest open: only the panel clock repaints (~1/frame).
- v9.2 arms (this topic; `em-sim.mjs`, arms in `arms/`): PENDING, the Simulator is deferred while P-142's phone block
  runs (I-160). Arms: C, C2 (A/A), noPF (#platform filter off), padPF (candidate below), fixall (panel fixed size, no
  scale, constant header width), noPnF (panel filter off).
- Note: the Simulator's per-frame #platform repaint does not show on the phone without a toolbar step (2.2): the
  Simulator glide (main-thread `scrollTo`) and the phone (async scrolling) may differ here. UNRESOLVED.

### 2.4 Mechanisms, with status

| claim | status | reference / evidence |
|---|---|---|
| WebKit `window.scrollY` forces style + layout when the scroll offset is not 0 | CONFIRMED | WebKit main `Source/WebCore/page/LocalDOMWindow.cpp` `LocalDOMWindow::scrollY()` l.1498-1512 (`updateLayoutIgnorePendingStylesheets`), main @ bf92727c |
| a composited layer whose sub-device-pixel offset changes is repainted whole | CONFIRMED (code path) | `RenderLayerBacking.cpp` l.1474-1479, l.1938-1939 (`setContentsNeedDisplay`), main @ ee36cd61 |
| a changed offset-from-renderer repaints a graphics layer | CONFIRMED (code path) | `GraphicsLayer.cpp` `setOffsetFromRenderer` l.608-618, main @ 73aa6c89 |
| a blur filter on a composited layer is applied by Core Animation (no repaint for a value change) | CONFIRMED in main | `PlatformCALayerCocoa::filtersCanBeComposited` l.929-949, `RenderElement` style diff l.353-358 (RecompositeLayer), main; whether shipping iOS 26.6 behaves so: UNRESOLVED (Simulator repaints #platform per frame, the phone does not) |
| toolbar-step frames repaint #platform's tiles and its composited parts, also at opacity 0 | OBSERVED (phone Timeline re-read) | 2.2; trigger UNRESOLVED (candidates: sticky offset change with a fractional `100dvh - --fw-ms-h`, a viewport-constrained relayout moving the composited layer) |
| the will-change window (fwWC) flips on toolbar steps in the end zone | REFUTED in Chrome (0 flips at 8 positions x 2 steps) | `em-wc-chrome.mjs`, `out/end-morph/wc-*.json`; phone unchecked |
| the photo-wall tracks repaint every morph frame because their size changes (panel width 398 -> 406, columns) | OBSERVED | paint rect widths change every frame (phone and Simulator); scale alone and fixed size alone did not stop it (Simulator, prior ablations) |

## 3. Candidate fixes

Pixel rule: memory "illusion-must-be-pixel-identical" (T0/T1 exact, T2 PR-010 numbers with a multi-pair A/A in Chrome
and the Simulator; motion-only differences are proposals).

| # | candidate | expected effect (where) | look | status |
|---|---|---|---|---|
| F1 | hide #platform while it is fully faded: `visibility: hidden` when `--morph-fade` = 0 (m >= 0.55) | removes #platform's step repaints in the panel bin (stage artboard, secure-network parts) | T0 by construction (opacity 0 already); a11y: #platform leaves the accessibility tree while the menu is open (pointer-events are already none) | to build; Chrome rest check needed (F-268 / F-272: a hidden subtree with paused animations made Chrome request frames) |
| F2 | JS less work: read `scrollY` once per frame in the engine instead of in `__nsOnScroll`; U2 (skip the nav hit test while the morph is open, fix-nav-morph's, eligible for v9.3) | ~1 forced style pass per scroll event, ~93 hit tests per down-scroll | T0 (behaviour) | small; Chrome counts only |
| F3 | padPF: keep #platform's filter outsets constant with a transparent drop-shadow | only if the per-frame blur repaint exists on the phone (2.3 says the phone shows it on steps only) | Chrome: 0 px over 8 at m 0.05 (other positions pending) | Simulator arm pending; low priority |
| P1 | morph-gpu rev 1 (composited reveal: the header at final size cut by `clip-path`, parts moved by transforms), ported onto 7d | removes the per-frame repaint of the photo wall, header, center, veil, footer (Simulator: 12 -> 2 paints per frame on the M driver) | T3 motion, but PR-012 rev 1 was ACCEPTED by the user; it was kept out only for a +7 ms first-open frame, later traced to #platform's opacity crossing 1 (fixed by rev 3, in v9.2) | needs a re-port by fix-morph-gpu and the lead's decision; then Simulator counts + a phone card |
| P2 | close tail: no 0.7 s width/background transition after a scroll-driven close | ~40 frames of header layout + repaint per close | motion-only difference (residual <= the last step) -> proposal | proposal with Try-it |
| P3 | #platform fade without blur (opacity only), if the step repaint of a blurred layer proves to be the blur | removes #platform's blur work | visible change -> proposal | after the trigger of 2.4 row 5 is known |

## 4. Scripts (this folder)

- `em-chrome.mjs`: Chrome per-frame counts and call tree over approach / open / rest / close / lift + settle / toolbar steps.
- `em-sim.mjs`: Simulator Timeline counts and per-layer paint counts per phase, with CSS arms.
- `em-wc-chrome.mjs`: will-change window (fwWC) flips on emulated toolbar steps.
- `em-px-chrome.mjs`: frozen-frame A/V/A2/V2 pixel check of a CSS candidate.
- `p137-mbins.mjs`, `p137-tlwork.mjs`: descriptive re-reads of P-137's phone records.
- `arms/*.css`: ablation and candidate CSS (noPF, padPF, fixall, noPnF).

## 5. Pending

- Simulator arms on v9.2 (deferred by P-142).
- padPF pixel check at the other morph positions (Chrome), then the Simulator.
- The trigger of #platform's toolbar-step repaint (phone-only; a card after the lead's go).
