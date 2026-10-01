# End of page: the nav morph on WebKit/iOS, a per-frame cost model (de-morph)

Design-engineering note by `de-morph` (2026-10-01). Scope: the end of the page: `#platform`, the nav
"morph" (the fixed top nav growing from a pill into a full-screen panel) and its touch scroll-jack/pin.
Read-only study: no measurements were taken for this note. It re-reads the iPhone finger logs in
`fixes/iphone-wave2/raw/` and the code in the committed baseline (`site-pretty/`, snapshot of `baseline.json`).

Labels: **vendor source** (WebKit `main` on GitHub, read 2026-10-01; iOS 26.6.1 may lag it), **spec**,
**data** (our own logs, file named), **derived** (my arithmetic or reasoning; check it on the device).
CSS lines are `_app/immutable/assets/2.gBuqKVzi.css`, JS lines `_app/immutable/nodes/2.DyWL8TcE.js`
(1-based, pretty baseline).

## 0. Verdict in five lines

1. The slow morph frames come from the **tween**, not the rest state. While `0 < --morph < 1`, p50 is 58-68 ms and
   62-84 % of frames are > 50 ms. At `--morph = 1`, p50 is 17-23 ms. The first frame of each tween is 91-96 ms (§2).
2. The dominant term is **main-thread re-rasterization of layers whose size changes every frame**. Each frame
   the panel subtree is resized (header, veil, center, footer, bar, and three image columns), so WebKit drops and
   reallocates their backing stores and repaints them: about 4-10 device Mpx and up to ~29 MB of fresh buffers
   per frame. Blur radii, GPU compositing and JS are second-order (§1, §2).
3. Chrome can't see it: its raster isn't on the throttled main thread (morph phase 110 fps, 0 frames > 50 ms).
4. Refactor #1 (**size-stable panel**, phone-gated, CSS only) removes ~60-75 % of the per-frame raster. Refactor #2
   (**clip-path morph with exact color-mix cross-fade**) removes the rest. Refactor #3 (**WAAPI with the exact easing
   `cubic-bezier(1/3, 1, 2/3, 1)`**) takes the per-frame style writes off the main thread. Expected after #1+#2:
   moving frames at ~17-33 ms, from 58-68 ms (derived).
5. The cheapest test of this model is a new driver ablation `h-fixedpanel` (§4). The model predicts that b-noblur
   gains <= ~10 ms per moving frame and h-fixedpanel gains 30-45 ms. If it goes the other way, the model is wrong.

## 1. Per-frame cost model

### 1.1 What one morph frame writes (code)

- **Driver.** `E(t)` (JS 13024-13036) starts a time tween, not a spring. `T` (13021-13023) evaluates
  `ZM(i, a, now - o)` = `i + (a - i)·(1 - (1 - τ)^3)`, with τ = elapsed/680 ms (12694-12698). One rAF per frame, ~1 ms
  of JS (logger: median page-rAF JS 0-1 ms on slow frames, **data**).
- **Writes per frame:** 2.
  - Svelte state `x`. Its template effect writes the inline `--morph` on `<header class="start-selling-top-nav">`
    (13221-13243) and re-evaluates 8 class toggles. `is-morphing`, `is-on-dark` (m > 0.2) and `is-expanded`
    (m > 0.92) flip only at thresholds.
  - `S()` (13013-13018): `--morph-fade = 1 - min(1, m/0.55)` and `pointer-events` on `.start-selling-platform`.
  - Both custom properties are unregistered, so they inherit: each write restyles the whole subtree.
- **Panel state flip.** The panel's template effect (13195-13206) flips `data-start-selling-scene` to
  `active`/`paused` when `E` = `m > 0.001` changes. CSS 11754-11758 then sets `will-change: auto !important` and
  pauses animations on every descendant while paused. Every tween start therefore **creates** the panel's layers:
  - 3 image-column tracks (`will-change: transform`, CSS 10574-10579);
  - ~85 countdown faces (`.face { will-change: transform }`, CSS 1408-1415; count from
    `research/architecture/README.md` N5).
  The return to 0 destroys them again.

### 1.2 What each written value drives (phone, `width <= 640px`)

| property (CSS line) | f(m) on the phone | pipeline stage on WebKit |
|---|---|---|
| nav `width` (11331-11334, vars 11565-11570) | 398 + 8m CSS px (100vw = 430) | **layout** of the nav subtree, resize of every %-sized descendant |
| nav `height` (11335) | 52 + 739m CSS px (assumes 100vh = lvh ≈ 815 CSS px; the phone shows innerHeight 775-815) | layout, resize |
| nav `top` (11571), `border-radius` (11341) | 16 - 4m px, 32 - 12m px | position: commit; radius: clip (corner radius / shape mask) |
| nav `background: color-mix(#ffffff1a, #131922)` (11336-11340) | changes every frame | **repaint** of the nav's own backing store |
| nav `backdrop-filter: blur(20px·(1-m))` (11342-11343) | 60(1-m) device px | GPU re-blur of what lies behind the nav (CABackdropLayer) + commit |
| panel `filter: blur((1-p)·12px)`, `opacity: p`, p = clamp((m-0.08)/0.72) (10545-10547) | changes for m in 0.08-0.8 | GPU filter on the panel subtree + commit. Repaint only if bounds change (webkit.md §2, inference) |
| panel `transform: scale(0.96 + 0.04m)` (10549) | every frame | composite only |
| panel `width/height: 100%`, `inset: 0` (10546-10553) | = nav size | **resizes the panel and all its %-sized children** |
| `#platform` `filter: blur((1-fade)·12px)`, `opacity: fade` (5392-5393) | changes only while m < 0.55 | restyle of the platform subtree (inherited var); GPU filter |

### 1.3 Layers, sizes and memory (device px = CSS × 3)

WebKit iOS tiles a layer only when one side exceeds **1280 CSS px**. Below that, a layer has one backing store
(**vendor source**: `GraphicsLayerCA.cpp`, `cMaxPixelDimension = 1280` for `PLATFORM(IOS_FAMILY)`,
`requiresTiledLayer`). When a backing store's parameters (size) change, `ensureBackingStore` calls
`clearBackingStore()` → `setNeedsDisplay()`: the buffer is dropped and the **whole layer repaints**
(**vendor source**: `Source/WebKit/Shared/RemoteLayerTree/RemoteLayerBackingStore.mm` lines 139-152). Formula:
`bytes = 4 · (3w) · (3h)`. A full-viewport layer (430×932 CSS) is 1290×2796 px = 3.61 Mpx = 14.4 MB.

| layer (why composited) | CSS size at m | tiled? | resized per frame? | device Mpx at m = 0.1 / 0.5 / 0.9 |
|---|---|---|---|---|
| nav `<header>` (fixed + backdrop-filter) | (398+8m) × (52+739m) | no (< 1280) | **yes** | 0.45 / 1.53 / 2.62 |
| `.start-selling-morph-veil` (radial gradient, 10608-10612; promoted: overlaps the composited backdrop) | = panel | no | **yes** | 0.45 / 1.53 / 2.62 |
| `.start-selling-morph-center` (z-index 1, 10613-10629, phone 10948-10956) | W × ~330 (estimate: title 32 px + countdown 88 + CTA stack + 2×28 gap) | no | **yes** (width = W; title re-wraps, `text-wrap: balance`) | 1.20 (all m) |
| footer (10755-10774) + nav bar (11406-11419; promoted: overlaps the panel) | W × ~140, W × 52 | no | **yes** | 0.70 (all m) |
| 3 column tracks (`will-change`; images 167-527 px tall, JS 12889-12935, 13143) | 135-138 × 1340-1612 | **yes** (> 1280) | width changes → every `<img>` re-lays out and repaints | visible tiles ≈ 3·138·H·9 + 1 tile row: 1.1 / 2.2 / 3.3 |
| panel, backdrop, cols (filter/opacity/transform with composited descendants) | = panel | - | yes, no own content | 0 (no paint), GPU offscreen passes |
| ~85 countdown faces | ~20×30 each | no | no (they move) | ~0 (commit only) |
| `#platform` (1880 CSS tall, filter) | 430 × 1880 | yes | radius changes while m < 0.55 | GPU blur over ≤ 3.6 Mpx visible |

**Per-frame repaint (sum of the "resized" rows), derived:** A(m) ≈ 3.9 / 7.2 / 10.4 device Mpx at m = 0.1 / 0.5 / 0.9.
**Per-frame fresh allocation** (non-tiled resized layers): `4·(header + veil + center + footer + bar)` ≈ 11 / 22 / 29 MB.
Same-size buffer reuse can't help when the size changes every frame (derived from the vendor source above). The
"all m" rows dominate at small m, the nav/veil rows at large m, so A(m) varies only ~2.7x over the tween.

### 1.4 Formulas and the estimate for an A17 Pro (derived; the throughputs are assumptions)

Per moving frame, on the critical path (WebContent main thread; with GPU-process DOM rendering the raster
replays in the GPU process, but the commit still waits for it):

```
T_frame ≈ T_js + T_style + T_layout + Σ_i A_i / R_i + B / R_alloc + T_commit      (main / raster path)
T_gpu   ≈ Σ_passes A_p / R_fill + Σ_blurs c_blur · A_b                               (render server, pipelined)
rAF gap ≈ quantize_16.7ms( max(T_frame, T_gpu) )
```

| term | value at m = 0.9 | basis |
|---|---|---|
| T_js | ~1 ms | **data** (logger) |
| T_style | 1-3 ms: `--morph` restyles the nav subtree (~150 elements); while m < 0.55, `--morph-fade` also restyles all of `#platform` | derived; the inherit cost is in render.md Q1 |
| T_layout | 1-3 ms: nav subtree, 13 images, a balanced title | derived |
| solid fills (nav bg, bar) 2.8 Mpx at R ≈ 1.5 Gpx/s | ~2 ms | assumption |
| veil radial gradient 2.6 Mpx at R ≈ 0.3 Gpx/s | ~9 ms | assumption |
| column images (low-quality resample + 12 px rounded clip) 3.3 Mpx at R ≈ 0.4 Gpx/s | ~8 ms | assumption. WebKit paints repeatedly resized images at `InterpolationQuality::Low`, and **at Default (high) quality on the first resize** (**vendor source**: `ImageQualityController.cpp`) |
| center + footer text/buttons 1.9 Mpx at R ≈ 0.5 Gpx/s | ~4 ms | assumption |
| allocation + zero-fill 29 MB at ~5 GB/s | ~6 ms | assumption |
| commit (~100 layers changed) | ~2 ms | assumption |
| **T_frame** | **≈ 35 ms → a 50 ms rAF gap (3 vsyncs)**; m = 0.1: ≈ 15-20 ms → 33 ms | derived |
| T_gpu: ~8-10 full-screen-equivalent passes (page, backdrop copy + blur, panel offscreen + blur, backdrop opacity group, tracks, veil, center) ≈ 25-35 Mpx at an effective 3 Gpx/s | ~8-12 ms, in parallel | derived |

At `m = 1` nothing resizes, so T_frame ≈ T_js + commit ≈ 2-4 ms, and the col-track animations run in the render
server. Expected rest frames: 16.7 ms.

## 2. Which term dominates, checked against the iPhone data

From `fixes/iphone-wave2/raw/morphlog-{E1b-B,F1-g,F2-g}.json` (per-frame logger, finger runs, warm phone).
I binned the frames by the logged `--morph` (scratch script, not committed). **data**:

| frames | n | p50 ms | p95 ms | > 50 ms |
|---|---|---|---|---|
| at m = 1 (rest), E1b / F1 / F2 | 829 / 342 / 203 | 23 / 17 / 17 | 37 / 26 / 57 | 2 % / 2 % / 5 % |
| moving, forward, m < 0.55 (all three runs) | 43 | 68 | 121 | 91 % |
| moving, forward, m >= 0.55 | 129 | 59 | 111 | 66 % |
| moving, reverse, m < 0.55 | 127 | 58 | 126 | 59 % |
| **first frame of a forward tween** | 18 | **91** | 158 | 100 % |
| **first frame of a reverse tween** | 18 | **96** | 230 | 100 % |
| moving, with / without a touchmove in the frame (F1) | 75 / 61 | 65 / 53 | 105 / 125 | |

What fits:
- **Rest is cheap, motion is expensive.** The same layers, blurs (at radius 0) and animated tracks cost 17 ms at rest.
  So the static GPU composite isn't the problem. A per-frame *change* is, and every changing input that resizes
  is predicted to cost tens of ms.
- **Flat across m.** The model predicts a 2.7x span in raster area. The forward and reverse medians lie within
  58-68 ms whatever m is. Part of the flattening is the size-independent rows (center, footer, columns), and
  part is the `#platform` terms that apply only while m < 0.55 (restyle and GPU blur of a 1880 px tall
  subtree).
- **First frames are the worst.** A forward first frame:
  - creates the ~88 panel layers (the scene flips to `active`) and rasterizes the column tiles from scratch;
  - re-lays out the nav with `is-morphing` (the logo becomes `position: absolute`, 11432-11437);
  - repaints the images at **high** quality, because it is their first resize (`ImageQualityController`).

  A reverse first frame is the first resize after rest, so it also repaints at high quality. 91-96 ms fits
  "full raster at high quality + layer creation".
- **Chrome is blind.** CPU throttling slows only the renderer main thread, and Chrome rasterizes on raster/GPU
  threads (render.md Q10). Its morph phase shows 110 fps and 0 frames > 50 ms (`fixes/nav-morph-all`).
- **The pin fix didn't help.** g removed the scrollTo pin, a main-thread scroll, not raster. Moving frames under g
  are as slow as in E1b.

What doesn't fit, or isn't explained:
- **The absolute level.** The first-principles estimate is ~35 ms of work (a 50 ms gap); the data shows 58-68 ms
  p50.
  - The block ran on a **warm phone**: its control failed at bottom 40.4 fps vs 60 cool, a ~1.5x slowdown.
  - My throughput figures are assumptions, not measurements.
  - So the model gets the structure and the order of magnitude, and the absolute level only to within ~2x.
- **Frames with a touchmove are ~10-30 ms slower.** That is the touch path (non-passive `touchmove` on window,
  JS 13063-13065: the UI process waits on the main thread), outside this model. #6 (morph-scrolljack-passive)
  targets it.
- **p95 110-230 ms bursts.** They are not explained beyond first frames + touch + heat. A possible extra term is
  the high-quality image repaint ~500 ms after the last resize (`ImageQualityController` timer, **vendor
  source**): it falls on rest frames (rest max 101-128 ms).

**Dominant term:** per-frame re-raster of resized, non-tiled backing stores plus the column tiles (~4-10 Mpx and up
to ~29 MB of new buffers per frame). This is the term every refactor below goes after first. The blur radii
(GPU) are a
second-order term on an A17 Pro: iOS itself runs full-screen blurs at 120 Hz. JS is negligible.

## 3. Equivalent-pixel refactors, ranked by gain/risk

Owner for R1-R5: **fix-nav-morph** (`fixes/morph-webkit`, plan "Composited morph (N2)"); R6: fix-countdown-idle-raf.
Build on aw1-10e + g (the pin clamp stays).

### R1. Size-stable panel content (phone-gated, CSS only). Gain: high. Risk: low.

**Change.** Inside `@media (width <= 640px)`, using the same query as 11564 (FINDINGS T1):

- `.start-selling-morph-panel` (10543-10554): no longer `inset: 0; width/height: 100%`. Give it a fixed final box:
  `inset: 0 auto auto 50%; width: var(--panel-w); height: var(--panel-h); translate: -50% 0` (the vars are inherited
  from the nav, 11569-11570). The nav's `overflow: hidden` + radius (11341, 11352) keeps clipping it to the pill.
  Nothing inside resizes: tracks, veil, center and footer keep their size, so they are rasterized once.
- Restore the original geometry with transforms (composite only), with H(m) = 52 + 739m and Hf = 791:
  - center: `translate: 0 calc((H(m) - Hf)/2)` keeps it at the box centre;
  - footer: `translate: 0 calc(H(m) - Hf)` keeps it on the box bottom;
  - veil: `transform: scaleY(H(m)/Hf); transform-origin: top`. This is exact for a percentage-sized radial
    gradient, an affine image of the same ellipse (derived), up to resampling;
  - panel `transform-origin: 50% calc(H(m)/2)`, so `scale(0.96 + 0.04m)` pivots where it did.
  - Express all of these with `calc()` on `var(--morph)`; no new JS.

**Pixel-parity risk (phone).**
- The width differs by ≤ 8 CSS px (398 → 406) during the tween:
  - the columns are ≤ 2 % wider than the original at small m;
  - the title wraps at 366 px instead of 358-366 px; a line-break flip mid-morph would show on frames where the
    panel is blurred (≥ 4 px) and semi-transparent (m < 0.5).
- The images draw at high quality instead of low (sharper; an improvement).
- Desktop is excluded: there the width goes 489 → 1398 and the content reflows visibly, so a fixed panel would
  change the look.

**Cost after (derived).** A(m) = nav bg + bar only, ≈ 0.6 / 1.7 / 2.8 Mpx, from 3.9 / 7.2 / 10.4. Allocation is
≤ 12 MB/frame, from ≤ 29. T_frame ≈ 12-18 ms, which gives 17-33 ms gaps instead of 58-68.

**Catch.** The nav still lays out and repaints its own box every frame. R2 removes that.

### R2. Clip-path morph with an exact background cross-fade. Gain: high, adds to R1. Risk: medium.

**Change.**
- While `is-morphing` (the class exists, 13226), give the nav its final box: `top: 12px; width: var(--panel-w);
  height: var(--panel-h)`. Draw the pill with `clip-path: inset(t r b l round R)`:
  - t = 4 - 4m;
  - b = 735(1 - m);
  - l = r = 4(1 - m);
  - R = 32 - 12m.

  (Phone numbers, derived from 11565-11571. Use `calc()` on the same vars to stay generic.)
- A basic-shape clip on a composited layer is a shape-mask update: no layout, no repaint (webkit.md §9, **vendor
  source**).
- **Background:** replace `color-mix` with two full-size layers:
  - the light fill `#ffffff1a` at opacity 1;
  - above it, `#131922` at `opacity: m`.

  Source-over gives alpha `m + 0.1(1-m)` and premultiplied colour `m·#131922 + 0.1(1-m)·#fff`. That is exactly the
  `color-mix(in srgb, #ffffff1a (1-m), #131922 m)` of 11336-11340 (CSS Color 5 mixes in premultiplied
  space; derived, exact up to 8-bit rounding).
- **Bar:** `translate` the bar by `(-l, t)` so the logo and buttons follow the pill edge. The logo's own `left`
  animation (11433-11434) becomes a `translate` computed from the same formula.
- Keep `backdrop-filter: blur(calc(20px*(1-m)))` as it is. Its radius change is GPU-only, and it keeps parity exact.

**Pixel-parity risk.**
- **(a)** Whether WebKit clips the backdrop by `clip-path` exactly as by `border-radius`. The spec says the
  backdrop is clipped to the element's border box and radius; whether `clip-path` applies too is inference.
  If not, the 406×791 blurred backdrop leaks outside the pill. Check this first.
- **(b)** The bar and logo positions (rounding, ±1 px).
- **(c)** The one-frame switch into the full-size box at the first frame. It costs one full raster: equal to
  today's first frame, not worse.
- **(d)** Hit-testing: the clipped area must not take taps. `clip-path` clips hit-testing (spec), but verify on
  the phone.

**Cost after (derived).** Per moving frame: no layout, no repaint. Style (inherited `--morph`, ~150 elements)
+ commit of ~10 changed layer properties ≈ 3-5 ms, so rAF gaps sit at 16.7 ms, bound by GPU T_gpu ≈ 8-12 ms. The
first frame of a tween stays ~1 full raster (see R5).

### R3. Declarative tween (WAAPI) with the exact easing. Gain: medium (robustness). Risk: medium.

`ZM` is `i + (a - i)·(1 - (1-τ)^3)` over 680 ms. `cubic-bezier(1/3, 1, 2/3, 1)` reproduces it exactly: with
x1 = 1/3 and x2 = 2/3, x(s) = s, so y = 1 - (1-s)^3 (derived). `E(t)` can therefore start one WAAPI animation per
property, from f(m_now) to f(target), with `easing: cubic-bezier(1/3,1,2/3,1)` and `duration: 680`:
- m_now comes from the same timestamps, with no DOM read;
- piecewise-linear `f` (the `clamp()` ramps: panel 0.08-0.8, platform 0.55, pill 0.45) become keyframes whose
  offsets are where m crosses the breakpoint, in eased-progress space.

WebKit runs opacity, transform, filter and backdrop-filter animations in the render server (webkit.md §1/§9,
`AcceleratedEffect.cpp`). With R2, only `clip-path` stays on the main thread. Keep the rAF loop for state only
(class thresholds 0.2/0.35/0.4/0.55/0.92, aria, the pin). It costs ~1 ms and doesn't write `--morph` per frame.

**Gain.** Frames no longer depend on main-thread availability, which matters during touch (touchmove frames are
10-30 ms slower today).

**Risk.**
- Interruption: on reversal, cancel the animations and start new ones from the computed m_now. Commit styles at
  the end (`commitStyles()` or final inline values).
- Code that reads `--morph`: the logger and `morph-log.mjs`.
- Do it after R2.

### R4. `--morph-fade` registered `inherits: false`. Gain: small. Risk: very low.

It is already in #6 v04 (`fixes/nav-morph-all`). It removes the restyle of all of `#platform` on frames with
m < 0.55 (render.md Q1). Keep it when #6 lands.

### R5. Don't create the panel's layers in the first frame. Gain: medium on the worst frames. Risk: low-medium.

The scene flip (13196 + CSS 11754-11758) adds ~88 layers in the frame where the tween starts, then destroys them at
m = 0. Two options:
- **(a)** Exempt the tracks from the pause's `will-change: auto` (the 3 track layers stay; their animation still
  pauses), and turn the countdown faces into one strip layer per digit (R6).
- **(b)** Flip the scene to `active` when the morph is armed (IO `u`, 13084), not at m > 0.001.

**Parity.** None: same pixels. **Cost.** Memory: 3 tracks ≈ 3 × 5 tiles × 1 MB = 15 MB held near the page end
(derived). With (b), the columns animate while invisible.

**Expected.** The 91-96 ms first frames lose the layer creation and the cold tile raster (≈ 3 Mpx of high-quality
image resampling).

### R6. Countdown layer diet inside the panel. Gain: small. Risk: low. Owner: fix-countdown-idle-raf (N5).

~85 face layers inside a filtered, opacity-grouped, scaled subtree raise the commit and offscreen-pass cost every
frame. One strip layer per digit (`research/architecture/README.md` N5).

### Not recommended now

- **R7, blur radius → fixed radius + opacity** (panel 10545, platform 5392). It changes the look: a cross-fade
  between sharp and blurred isn't a blur ramp, so it isn't pixel-equivalent. By the model it saves only GPU time
  (≤ ~5 ms, in parallel). Do it only if the b-noblur driver run shows a gain beyond R1/R2.
- **`contain: strict` / `contain: paint` on the panel.** Not helpful: the panel is already an absolutely
  positioned composited layer clipped by the nav, and containment doesn't stop a resize from re-rasterizing.
  `contain: layout` on the nav may bound layout invalidation (render.md Q4), but layout isn't the dominant
  term.
- **Desktop/iPad note.** There the panel is up to 1398 CSS px wide, above the 1280 tiling threshold, so mid-morph
  the layer switches from untiled to tiled, and the swap repaints it (`GraphicsLayerCA.cpp`: the swap calls
  `setNeedsDisplay()`). R2 avoids it.

## 4. Verification plan

| step | what | where | pass |
|---|---|---|---|
| V0 | **Discriminating ablation, before any refactor:** driver runs (`__fwMorphDrive({hold:2000,cycles:3})`, morph-webkit's aw1-10e builds) of base g, gb (no blur) and a new **gh** = g + R1's CSS (`h-fixedpanel`). Control run first (thermal rule, iphone-wave2), ABBA, 3 each. | iPhone, iphone lease (fix-nav-morph / iphone-runner) | Model holds if gh's moving p50 drops ≥ 25 ms and gb's ≤ 10 ms. If gb ≫ gh, the GPU blur dominates: re-rank R7 above R1. |
| V1 | **Paint attribution:** WebKit Timeline paint area and count over one driver cycle, as in large-area-blur/03 | iPhone | g: ~10-20 tween frames × 4-10 Mpx; gh: panel rects absent; R2: no paints after the first frame |
| V2 | **Chrome parity, frozen frames:** a debug hook `__fwMorphSet(m)` (set `--morph`, the classes and `--morph-fade` without the tween), screenshots of the nav rect at m ∈ {0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.92, 1}. Pause all animations (`document.getAnimations()`, `currentTime = 0`) and mask the countdown faces. Crop to the nav rect and add scrollY to the clip (P14). | Chrome short lane (`--short --max-seconds 180`, counts/screens only) | ≤ 0.4 % outside the title-wrap frames; any title line-break difference reported with a crop |
| V3 | **Mechanism counters:** `Performance.getMetrics` LayoutCount per driver frame and CDP `LayerTree.layerPainted` counts per layer during one cycle | Chrome short lane | R1: no `layerPainted` for panel children while moving; R2: LayoutCount 0 per moving frame |
| V4 | **Look on the phone:** the same frozen m values via the hook, Safari screenshots (Web Inspector) of base vs refactor. Checks R2's backdrop-clip question (a) and the bar alignment (b). | iPhone (lease) | no leak of the blurred backdrop outside the pill; bar within 1 px |
| V5 | **Timing on the phone:** driver ABBA (base g vs refactor), moving / first / rest frames split as in §2 | iPhone | moving p50 ≤ 25 ms, > 50 ms ≤ 5 %, first frame ≤ 50 ms (R5) |
| V6 | **Finger block** (lead schedules; only after V5 passes): B R R B, push past the end 3×, reverse, and "drag from above into the end". Logger + recorder. | user | morph-active p95 ≤ 34 ms; user: "smooth"; no pin fight (g) |

The driver can't exercise the touch path, the rubber band or the toolbar (morph-webkit README). So V6 is required
before landing, and the touchmove-frame penalty (§2) stays #6's to remove.

## 5. Open questions

1. Does WebKit clip a `backdrop-filter` by the element's own `clip-path` (R2 risk a)? Check it on the phone (V4)
   before building all of R2.
2. iOS 26 Safari's `100vh` on this phone (lvh): 815 is assumed, from innerHeight with the toolbar collapsed.
   Changing it moves the Mpx figures linearly.
3. Is the DOM raster on iOS 26.6.1 in-process or replayed in the GPU process (`RemoteLayerBackingStore`
   `processModelForLayer`)? It doesn't change the ranking, only where the time shows up.
4. Does a changing composited `filter` radius change the layer's bounds (and so repaint) on WebKit? The
   large-area-blur Timeline (2 repaints per transition, not per frame) says no for CSS transitions. A per-frame
   inline write is unverified; V1 answers it for `#platform`.
