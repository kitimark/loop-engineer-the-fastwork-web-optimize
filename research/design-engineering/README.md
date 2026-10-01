# Design engineering: the rendering math behind the page's jank

Team started 2026-10-01 at the user's request: "experts in the mathematics behind web rendering, to help the design
(fix) team optimize the code, possibly refactoring it while keeping the rendered display as identical as possible;
analyze the render complexity of each topic". Lead of this note: `de-morph`.

## Charter

- **Job:** for each part of the page, a **per-frame cost model**: which pixels, layers, styles and layouts each frame
  touches, with formulas and the real element sizes from the code. From it, find the dominant term, and rank
  **equivalent-pixel refactors**: same rendered display, cheaper pipeline stage. The design (fix) owners build
  and measure; this team doesn't.
- **Rules** (as `fixes/ARCH_TEAM.md`):
  - Read-only on code and devices: no Chrome, no iPhone, no locks, no edits to `site*/`, overlays or `tools/`.
  - Notes only in `research/design-engineering/`, committed on the member's branch, landed by the lead.
  - Web research uses generic terms only (Hard rule 12).
- **Labels:** **vendor source** / **spec** / **vendor doc** (cited by URL or source path), **data** (our own logs,
  file named), **derived** (our arithmetic; a device check is still needed). Throughput figures are assumptions
  unless a source is named.

## Members and scope

| member | scope | note | status |
|---|---|---|---|
| `de-middle` | everything between, including the y ≈ 1970 pain-entry frame; page-wide mechanisms: blur, content-visibility, will-change, layers | [`middle.md`](middle.md) | done |
| `de-hero` | hero window, y 0-900 (ring splash, orbit, exit, first scroll frames out of the hero, #people entry) | [`hero.md`](hero.md) | done; covers the iPhone hero block (v2: y≈50 gone, y≈700 +11 ms, §2D) |
| `de-morph` (lead) | end of page: `#platform`, the nav morph panel, the touch scroll-jack/pin | [`morph-endpage.md`](morph-endpage.md) | done |

## Method (shared by the three notes)

1. **Inputs per frame.** What JS writes (count, element, inherited or not) and which CSS properties depend on it
   (file:line in `site-pretty/`).
2. **Pipeline stage per property on WebKit:**
   - composite only: transform, opacity, filter/backdrop radius on a composited layer;
   - clip mask;
   - repaint;
   - layout;
   - restyle scope.

   Sources: `research/architecture/webkit.md`, `render.md`.
3. **Layers and areas in device px** (CSS × 3).
   - Memory = 4 B × area; a full-viewport layer is 1290×2796 px = 14.4 MB.
   - Tiling threshold on iOS: 1280 CSS px per side (`GraphicsLayerCA.cpp`).
   - A backing store whose size changes is dropped and fully repainted (`RemoteLayerBackingStore.mm`).
4. **Cost formula:**
   - `T_frame ≈ T_js + T_style + T_layout + Σ A_i/R_i + bytes_alloc/R_alloc + T_commit` on the main/raster path;
   - `T_gpu ≈ Σ offscreen-pass areas / R_fill` in the render server;
   - the rAF gap ≈ max of the two, rounded up to 16.7 ms.
5. **Consistency check against the iPhone logs** (`fixes/iphone-wave2/raw/`): the model must explain both the slow
   and the fast frames. Say where it doesn't fit.
6. **Refactors**, each with:
   - the exact code change;
   - the pixel-parity risk and how the Chrome frozen-frame diff / iPhone look catches it;
   - the expected per-frame cost after;
   - an owner;
   - a verification plan (Chrome parity in the short lane → iPhone driver → finger test only at the end).

## Merged ranked refactors (page-wide)

Ranking: expected gain on the iPhone frames the user feels (frames > 50 ms, the "laggy" places: end of page and
top), divided by pixel risk. de-morph's items are ranked: numbers 0-6, re-ranked 2026-10-01 after the iPhone
driver block (morph-endpage §6). de-hero's rows are h1-h4. de-middle's three rows are unranked ("-"), for the lead
to place.

| rank | refactor | area | expected gain (derived) | parity risk | owner | source |
|---|---|---|---|---|---|---|
| 0 | **Ablation `ghbn`** (ghb + no nav `backdrop-filter` while morphing; diagnostic) | end of page | isolates the never-ablated nav backdrop re-blur, the prime suspect for the mid-tween hump (m 0.4-0.8 at 29-38 ms in every build) | n/a (diagnostic) | fix-nav-morph + iphone-runner | morph-endpage §6.3, V0b |
| 1 | **Gate the blurs off where they are invisible (R8, exact):** at `--morph-fade` = 0 (m ≥ 0.55) `#platform` is `opacity: 0`, so only a uniform `#f5f5f3` lies behind the nav; one class toggled at the crossing sets the nav `backdrop-filter` and the platform `filter` to `none` | end of page | if ghbn confirms: gh moving p50 24 → ~20-22 ms (forward tween is 76 % at m ≥ 0.55) | low (anything else behind the nav; frozen frames at m 0.55/0.7/0.9 must be 0 %) | fix-nav-morph | morph-endpage §6.4 R8 |
| 2 | **No layer creation at the tween start** (keep the track layers; one strip per countdown digit; or activate the scene on arm) | end of page | first frames: 49-54 ms in the driver (91-96 on the warm finger) → ~25-35 ms | none (same pixels); +15 MB held | fix-nav-morph, fix-countdown-idle-raf | morph-endpage R5/R6 |
| 3 | **Size-stable morph panel** (= build `gh`; phone-gated CSS: panel at its final size, clipped by the nav; center/footer/veil follow by transform) | end of page | **measured (driver, cool):** steady moving p50 29-34 → 24 ms, frames on time 15-21 % → 41 %; −4-10 ms (the original "58-68 → 17-33" was anchored on the inflated finger baseline) | low; Chrome parity 1.14 % at m = 0.6 (≤ 8 px width delta) | fix-nav-morph | morph-endpage R1, §6 |
| 4 | **WAAPI tween with the exact easing `cubic-bezier(1/3,1,2/3,1)`** | end of page | the morph stops depending on the main thread (finger touchmove frames +12-35 ms) | medium (interruption, readers of `--morph`) | fix-nav-morph | morph-endpage R3 |
| 6 | **Clip-path morph + exact color-mix cross-fade**, with a **pill-sized backdrop element** | end of page | ≤ ~3 ms over gh (the nav box's own repaint); value is exact parity, not speed. As first written it would enlarge the backdrop to the full box at every m (a regression) | medium (bar alignment, hit-test) | fix-nav-morph | morph-endpage R2, §6.4 |
| h1 | **Take the 0.72 flip apart** (pre-raster the future card while invisible: `opacity: 0` + `inert` instead of `visibility: hidden`; reveal blur `blur(14px)→blur(0px)` with matching lists; no inherited toggle in the reveal frame) | hero → #people, y≈587-745 | the y≈625-745 pair (43-63 ms on all builds) → ≤ 34 ms | medium (a11y/inert; raster earlier, +12-90 MB) | fix-large-area-blur + phone-invisible-shrink (fix-hero-exit coordinates) | hero R1 |
| h2 | **Hero exit on a scroll timeline (v2) + /10e** | hero y 0-900 | measured y≈50 43 → 35 ms; −2-6 ms of style per hero frame; **+11 ms at y≈700 to bisect** (§2D) | low (parity shown) | fix-hero-exit, fix-scroll-engine | hero R2 |
| h3 | **Countdown: one strip per digit, no per-face `will-change`** (12-glyph strip `9 0 1 … 9 0` at `translateY(−(a+1)·c)`) | hero (and morph panel, = morph R6) | 160 → 0-16 layers; 10 → 1 writes per spring frame; 1 Hz idle spikes 35-58 ms | low (exact within ±1 cell) | fix-countdown-idle-raf | hero R3 |
| h4 | People-o equivalent-pixel FLIP (word spans + WAAPI translate + clip-path), plus `transition: none` while the card is invisible | #people, slow scroll only | 0.92 s of per-frame layout → ~0 | medium | fix-hero-exit (P3) | hero R4 |
| - | **Morph IO does nothing heavy in a scroll frame** (images get `src` at the idle pre-mount, `inert` until the morph starts, listeners registered once and passive, blocking only at the end). The y ≈ 1960 frame starts at y 1834-1867 = the `#platform` 200 % IO threshold (4155 − 3·775 = 1830), not `.pain` | middle (y ≈ 1830-1970) | 105 ms → 17-35 ms, **if** ablations e1 (`mw-d-passive`) / e2 (margin 150 % → frame moves to y ≈ 2218) confirm | none (panel invisible) | fix-nav-morph | middle R1, §2 |
| - | **Section background switches as solid-colour composited layers** (`is-pain-dark`, `.commission.shrinking` on an empty `::before`, W3) | middle | 10-20 ms → < 2 ms per crossing (y ≈ 888, commission end) | low (z-order of the pseudo; frozen-frame diff) | fix-scroll-engine (N10) | middle R2 |
| - | **Stop the per-frame feed repaint** (373 × 344 rect repainted every frame over y 1600-2500; cause unattributed) | middle | −2-5 ms on every frame there | low | profile-showcase owner (layout-animations scope) | middle R3 |
| 5 | `--morph-fade` `@property inherits:false` (already in #6 v04) | end of page | -1-3 ms on m < 0.55 frames | none | fix-nav-morph | morph-endpage R4 |

**The first prediction failed (2026-10-01 09:27Z driver block).** De-morph predicted gh −30-45 ms and gb ≤ −10 ms;
the measured gains were −7-10 and −2-7 ms. The reconciliation is in morph-endpage §6:
- The finger baseline (58-68 ms) was ~2x inflated by the touch path and heat; the driver's g is 29-35 ms.
- The assumed raster rate was ~2x too slow.
- Under the driver, g's excess over a 16.7 ms frame splits into 4-5 terms of 3-10 ms each.
- `gb` never removed the nav's `backdrop-filter`: its rule targets an element that has none.

**Decision the lead can take now:** have fix-nav-morph build `ghbn` (morph-endpage §4 V0b) and, if it confirms the
backdrop term, R8, which is exact, and R5. R2 drops to a parity option.

**For de-middle and de-hero:** the throughputs of morph-endpage §1.4, which `middle.md` reuses, are ~2x pessimistic
on the phone (effective ~0.6-0.9 Gpx/s; morph-endpage §6.1). Divide raster-ms estimates by ~2. Their rankings
don't change.

## Cross-topic findings from this team (for the findings board, via the lead)

- **WebKit iOS: a composited layer whose size changes repaints completely every frame** (`RemoteLayerBackingStore`
  `ensureBackingStore` → `clearBackingStore` → `setNeedsDisplay`). Layers up to 1280 CSS px per side are a single
  buffer, so a growing box is a full re-raster plus a fresh allocation each frame. This applies to any animated
  width/height or %-sized child of an animated box, on any topic (pitfall).
- **WebKit paints repeatedly resized images at low quality, then repaints them at high quality 500 ms after the
  last resize** (`ImageQualityController`). The first resize frame is painted at high quality, hence the expensive
  first frames (pitfall).
- **`1 - (1 - t)^3` equals `cubic-bezier(1/3, 1, 2/3, 1)` exactly** (technique: a JS ease-out-cubic tween can
  become a CSS/WAAPI animation with identical timing).
- **`color-mix(in srgb, A (1-m), B m)` with B opaque equals B at `opacity: m` over A** (technique: a per-frame
  background repaint becomes a composited opacity fade with identical pixels).
- **WebKit doesn't clip a composited layer's bounds to an ancestor's overflow when the layer or any ancestor is
  transformed** (`RenderLayerBacking::shouldClipCompositedBounds`). A fixed-size child inside a growing,
  `transform`ed clip box keeps its backing store; it does not resize with the clip (measurement-relevant, for
  clip-reveal designs).
- **iPhone driver frame gaps are quantized to 8.33 ms (ProMotion 120 Hz), not 16.7 ms** (measurement: read the
  share of frames at 2 ticks, not only the p50).
- **A blur over a provably uniform backdrop is a pixel no-op** (technique: gate `backdrop-filter`/`filter` off when
  what's behind is `opacity: 0` over a flat background; morph R8).
