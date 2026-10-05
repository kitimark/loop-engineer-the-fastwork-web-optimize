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
- v9.2 arms S1 (`em-sim.mjs --label s1`, `out/end-morph/em-sim-s1-2026-10-05T22-42-01-078Z.json`, 30 steps per
  phase; C2 = C again, as an A/A). Paint events / painted Mpx per phase:

  | arm | approach | #platform repaints in the approach (430x1880 layer) | open | close |
  |---|---|---|---|---|
  | C | 204 / 20.3 | 80 | 439 / 34.2 | 389 |
  | C2 (A/A) | 206 | (same as C) | 416 | 381 |
  | noPF (#platform `filter: none`) | **119 / 4.0** | **0** | 408 / 28.7 | 350 / 25.2 |
  | padPF (constant filter outsets) | 201 / 20.1 | still there | - | - |

  - In the Simulator, #platform's blurred layer repaints whole on every approach frame. This happens even at
    fade 1, where the blur is 0 px. Without the filter it doesn't. OBSERVED in our setup, cause unknown. The phone
    showed this repaint only on toolbar steps (2.2), so the Simulator's main-thread `scrollTo` glide may differ from the
    phone's async scrolling here (UNRESOLVED).
  - padPF does not remove it, so the cause is not the filter outsets changing. F3 is dropped.
  - Open and close are within ~25 paints of the C/C2 spread with noPF, so the gain is in the approach.
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
| F1 + U2 | F1: hide #platform while it is fully faded (`visibility: hidden` when `--morph-fade` = 0, m >= 0.55). U2: fix-nav-morph's hit-test deferral | Chrome: rest open 122 -> 4 paints, step at m 1 85 -> 1, lift + settle 377 -> 157; 14-26 hit tests per open/close gone | T2 at m 0.95 in Chrome (19 css px², edge, max 40), lead-ACCEPTED provided the Simulator leg stays within T2 | built, `fixes/end-morph-f12/`; lands on v9-final (v9.2 NO-LAND); landing gates on int-v8's snapshot queued |
| F2 | read `scrollY` once per frame in the engine instead of in `__nsOnScroll` | none in Chrome (the forced style pass only moves) | T0 | DROPPED (lead, 2026-10-05) |
| F3 | padPF: keep #platform's filter outsets constant with a transparent drop-shadow | none (Simulator S1: the approach repaint stays) | - | DROPPED |
| F4 | no filter on #platform while it is fully shown: inline `filter: none` at fade >= 1 in `S()`, on top of F1 + U2 (`fixes/end-morph-f4/`, JS `839a5a24c0d4`) | Simulator approach: #platform's 80 whole-layer repaints (noPF arm: 204 -> 119 paints, 20.3 -> 4.0 Mpx) | T0 expected: `blur(0px)` draws the same as no filter. The frame where the filter comes back (fade < 1) needs checking: it may repaint once or recomposite, as rev 3's opacity-1 crossing did | Chrome + Simulator pixels and Simulator counts queued (chain 4) |
| V1 | snap the `--fw-ms-h` write in `__msRO` to device pixels (`fixes/end-morph-v1/`, JS `1d68bc9fb4fe`) | the toolbar-step repaint, if the fractional sticky offset is its trigger (2.4 row 5) | T0 expected | step A (Simulator toolbar strokes, counts only) running: arms C, V1, N (= F1 + U2) |
| P1 | morph-gpu rev 1 (composited reveal), ported onto 7d | Simulator: 12 -> 2 paints per frame on the M driver (morph-gpu) | T3 motion, PR-012 rev 1 ACCEPTED by the user | ported onto v9.2 here (`fixes/end-morph-p1/`, handover notes); the v9-final port and the card now belong to fix-end-morph-p1 (lead, 2026-10-05) |
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

- Step A: Simulator toolbar strokes with arms C, V1 and N (`em-step-sim.mjs`). Arm C
  (`out/end-morph/em-step-sim-end-morph-2026-10-05T22-52-18-912Z.json`):
  - **First run invalid (F-299 REFUTED, pitfall F-300).** The script closed the inspector connection around the
    gesture. LayerTree ids are per session, so every layer looked new, and the stroke counts were lifetime
    paintCounts since page load. The decisive sign: arm N's #platform is `visibility: hidden`, yet it showed 1070.
    The control phase (same session) is valid. At m 1 the control repaints #platform 0 times in all arms; at m 0 it
    repaints it 594-600 times, which is the approach repaint of 2.3.
  - The script now matches layers by id, then node + size, then unique name, and runs a no-gesture reconnect
    self-check.
  - **Rerun, valid** (`em-step-sim-end-morph{,-v1,-f12}-2026-10-05T23-2*.json`). The reconnect self-check matched every
    layer by node + size, 0-2 gone. Over its ~2.3 s rest it repainted 11-15 paints closed and 80-95 open, all of them
    the panel's center (its clock).

    | arm | closed, strokes (7 toolbar transitions) | closed, control | open m 1, strokes | open, control |
    |---|---|---|---|---|
    | C | #platform 429, total 573 | #platform 600, total 824 | #platform 0, total 2103 | #platform 0, total 2088 |
    | V1 (snapped `--fw-ms-h`) | #platform 447, total 612 | 600 / 824 | #platform 0, total 1908 | 0 / 2131 |
    | N (F1+U2) | #platform 438, total 595 | 600 / 824 | #platform 0, total 2100 | 0 / 2045 |

  - **The Simulator does not reproduce the phone's step repaint** (OBSERVED in our setup). At m 1, touch strokes with a
    toolbar transition repaint #platform 0 times, even in C. The open totals are the panel's own layers (center,
    photo tracks, header), equal with and without touch.
  - At m 0, #platform repaints with or without touch: the approach blur repaint of 2.3 (F4's target).
  - **V1 changes nothing** in the Simulator (447 vs 429 closed), and the case it targets can't be produced here. V1 is
    dropped from the less-work build.
  - Step B (the phone) would be the only way to see the trigger. Proposal to the lead: no separate card. P-152's
    attribution runs (AC1, AV1: Paint records per frame at m >= 0.55) already show whether F1 removes it on the
    phone.
- S2 Simulator counts on v9.2 (`em-sim-s2-2026-10-05T23-00-27-826Z.json`). Cells are paint events / kpx:

  | phase | C | F1+U2 | P1 |
  |---|---|---|---|
  | open | 438 / 34276 | 431 / 33590 | 155 / 10096 |
  | rest open | 45 / 757 | 33 / 497 | 49 / 761 |
  | close | 387 / 32195 | 407 / 33207 | 87 / 9938 |

  - F1+U2 gains nothing on the rAF glide: its gains are at rest open and on toolbar steps.
  - P1's counts went to fix-end-morph-p1.
  If it can't be reproduced, step B is a phone card (P-id via the lead, pre-data read).
- F1 + U2 landing gates on v9-final (int-v8's pinned snapshot `snap-a6426953727a`, HASHES sha256/12 `0817a71bf0c7`).
- F4 gates and counts.
