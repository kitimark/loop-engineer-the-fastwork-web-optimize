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
| `de-hero` | hero window, y 0-900 (ring splash, orbit, exit, first scroll frames out of the hero, #people entry) | `hero.md` (expected) | **pending**: not committed when this README was written |
| `de-middle` | everything between, including the y ≈ 1970 pain-entry frame; page-wide mechanisms: blur, content-visibility, will-change, layers | [`middle.md`](middle.md) | done |
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
top), divided by pixel risk. de-morph's items are ranked; de-middle's three
rows (unranked "-", for the lead to place) are in; de-hero's slot is a placeholder until `hero.md` lands.

| rank | refactor | area | expected gain (derived) | parity risk | owner | source |
|---|---|---|---|---|---|---|
| 1 | **Size-stable morph panel** (phone-gated CSS: panel at its final size, clipped by the nav; center/footer/veil follow by transform) | end of page | moving morph frames 58-68 → ~17-33 ms p50; raster per frame 4-10 → 0.6-2.8 Mpx | low (≤ 8 px width delta on the phone; title wrap) | fix-nav-morph | morph-endpage R1 |
| 2 | **Clip-path morph + exact color-mix cross-fade** (nav at its final box while morphing; `clip-path: inset(round)`; `#131922` layer at opacity m over `#ffffff1a`) | end of page | no layout or repaint per moving frame → 16.7 ms gaps (GPU-bound ~8-12 ms) | medium (backdrop clipped by clip-path? bar alignment) | fix-nav-morph | morph-endpage R2 |
| 3 | **No layer creation at the tween start** (keep the track layers; one strip per countdown digit; or activate the scene on arm) | end of page | first frames 91-96 ms → ~50 ms | none (same pixels); +15 MB held | fix-nav-morph, fix-countdown-idle-raf | morph-endpage R5/R6 |
| 4 | **WAAPI tween with the exact easing `cubic-bezier(1/3,1,2/3,1)`** | end of page | the morph stops depending on the main thread (touch frames +10-30 ms today) | medium (interruption, readers of `--morph`) | fix-nav-morph | morph-endpage R3 |
| - | *(de-hero's top refactors: placeholder)* | hero y 0-900 | - | - | - | `hero.md` |
| - | **Morph IO does nothing heavy in a scroll frame** (images get `src` at the idle pre-mount, `inert` until the morph starts, listeners registered once and passive, blocking only at the end). The y ≈ 1960 frame starts at y 1834-1867 = the `#platform` 200 % IO threshold (4155 − 3·775 = 1830), not `.pain` | middle (y ≈ 1830-1970) | 105 ms → 17-35 ms, **if** ablations e1 (`mw-d-passive`) / e2 (margin 150 % → frame moves to y ≈ 2218) confirm | none (panel invisible) | fix-nav-morph | middle R1, §2 |
| - | **Section background switches as solid-colour composited layers** (`is-pain-dark`, `.commission.shrinking` on an empty `::before`, W3) | middle | 10-20 ms → < 2 ms per crossing (y ≈ 888, commission end) | low (z-order of the pseudo; frozen-frame diff) | fix-scroll-engine (N10) | middle R2 |
| - | **Stop the per-frame feed repaint** (373 × 344 rect repainted every frame over y 1600-2500; cause unattributed) | middle | −2-5 ms on every frame there | low | profile-showcase owner (layout-animations scope) | middle R3 |
| 5 | `--morph-fade` `@property inherits:false` (already in #6 v04) | end of page | -1-3 ms on m < 0.55 frames | none | fix-nav-morph | morph-endpage R4 |

**Decision the lead can take now:** have fix-nav-morph build the `h-fixedpanel` driver ablation (morph-endpage
§4 V0) next to the existing b-noblur run. The model predicts that b-noblur gains ≤ 10 ms per moving frame and
h-fixedpanel 30-45 ms. If the result is the other way round, the dominant term is the GPU blur, and R7
(fixed-radius blur fades) moves above R1.

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
