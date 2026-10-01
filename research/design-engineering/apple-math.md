# The math behind apple.com's scroll-animation choices, and what it says about our page (de-apple)

Design-engineering note by `de-apple` (2026-10-01), method and notation as in [`README.md`](README.md). The user asked:
"study the math behind the apple website implementation/decision. Why do they do it? What about the complexity?"
This is a read-only study. I took no measurements and fetched no new Apple assets. Apple facts come from
[`apple-smooth-scroll.md`](../architecture/apple-smooth-scroll.md) (static read, "AS §x") and
[`apple-verify.md`](../architecture/apple-verify.md) (Chrome 6x runtime check, "AV §x"). A few element sizes were
re-read from arch-apple's cached copies of Apple's CSS/JS in the session scratchpad. Nothing from Apple is stored in
the repo; quotes are one-liners with their URL. Two WebKit source files were read on `main` (2026-10-01) to settle
clipping questions: `GraphicsLayerCA.cpp` and `RenderLayerBacking.cpp`.

Labels: **observed** (Apple's shipped code or apple-verify's runtime counts), **vendor source** (WebKit `main`; iOS
26.6.1 may lag it), **vendor doc**, **spec**, **blog**, **data** (our logs, named), **derived** (my arithmetic),
**inference** (my reasoning; check it on the device).

## 0. Verdict in six lines

1. Every Apple decision has the same aim: make the **per-frame** cost O(1) or O(leaf), and move every O(subtree)
   or O(area) cost to a moment the user does not feel (load, resize, a range edge half a viewport off-screen).
   It is complexity budgeting, not new CSS: Apple uses no `content-visibility`, no `contain` and no scroll timelines
   (AS §1).
2. Apple breaks its own rules only where the term it adds is tiny: `width`/`height` writes on a **56 px-tall empty
   pill**, 200-440 clean `offset*` reads. The one page where an exception multiplies a large term (iPhone 18 Pro:
   read-after-write in `onScroll`, a non-passive `touchmove`, a rAF loop at rest) is the one that janks (AV §3).
3. Our hotspots break the same rules by 2-10x on one term each (§3 budget). The morph breaks several of them at
   once, each by a few ms. That is why removing one term (gh: resize; gb: blur) saved only 6-9 ms each.
4. **New, vendor source:** WebKit puts a `clip-path` mask on the **structural layer that holds the backdrop**, so a
   `clip-path` also clips `backdrop-filter`. That resolves de-morph's open question 1 in favour of R2 (§2.5).
5. **Top 3 to copy:** (1) Apple's text-over-media frame for the morph: a fixed box with `clip-path: inset(round)`,
   plus an empty resizable backdrop leaf (AAP-style); (2) the y≈1830 range edge doing O(1) work; (3) the 0.72
   reveal pre-rendered, with no subtree toggle (§4).
6. **Contradicts the plan:** R1 (gh) shouldn't be tuned further: go to R2. The blur ramp (R7) is worth about as much
   as R1, so it's a design call, not "not recommended". Per-element `will-change` windows are the wrong lesson for
   phones: Apple *unsets* `will-change` at ≤ 734 px. h3's layer count is not a budget breach by itself (§5).

## 1. Notation and the device constants (iPhone 15 Pro Max, iOS 26.6.1, DPR D = 3)

Shared with the other DE notes:
- `c_el` = 10-25 µs of style per re-resolved element (de-hero);
- A in CSS px², device px = 9A, backing bytes B = 36·A;
- raster rates R: fills 1.5, text 0.5, images 0.4, gradients 0.3 Gpx/s; allocation 5 GB/s. These are assumptions
  (de-morph);
- a full screen is 1290×2796 = 3.6 Mpx = 14.4 MB; a 430×775 viewport is 3.0 Mpx = 12 MB.

New here:
- **N** = elements written per frame. **S** = elements restyled. **L** = layers created per frame.
- **r** = blur radius in device px. **A_b** = blur input area.
- **n_dirty** = layout reads that find dirty style or layout. **T_flush** = the pending work such a read pays.

Three WebKit facts carry most of the math:
- **(F1) Tiling.** A layer is a single buffer below 1280 CSS px per side, and **1024 when the system is low on
  memory** (`cMaxPixelDimensionLowMemory`, `GraphicsLayerCA.cpp` l.102-106, `requiresTiledLayer`; vendor source).
  A resized untiled buffer is dropped and repainted in full (`RemoteLayerBackingStore`, F-036).
- **(F2) Rounded clips cost no paint.** A uniform-radius rounded clip becomes CA `cornerRadius` +
  `masksToBounds`. Any other rounded clip or shape becomes a `CAShapeLayer` mask path (`updateClippingStrategy`,
  `GraphicsLayerCA.cpp` l.3268-3321; vendor source). `clip-path` and ancestor clips use the same shape-mask path
  (`RenderLayerBacking.cpp` `updateMaskingLayerGeometry` l.2007-2040, "ancestor clip shape mask" l.2599; vendor
  source).
- **(F3) Commit back-pressure.** WebContent doesn't start rendering update N+1 until the UI side reports that commit N
  was displayed (`RemoteLayerTreeDrawingArea`, answers-2 W1; vendor source). If the render server is slow to
  display N, its time adds to the main thread's (inference). So the frame gap is closer to
  `T_main + T_commit + T_rs` than to de-morph's `max(T_frame, T_gpu)`. §2.5 tests this against gh/gb.

Steady scrolling itself is cheap. New tile coverage per frame = W·v/60·9: 430 CSS px × (1000 px/s / 60) × 9 ≈
**0.065 Mpx per frame** at the scripted speed (derived). That is about 1/25 of the raster budget in §3. So jank is
never the scroll; it is what a frame **changes**: a resize, a flip, a new layer, a subtree restyle.

## 2. The decisions, one by one

### 2.1 Measure on resize, compute on scroll (AS §2.1, P1; AV §3.2)

- **What.** Offsets come from `offsetTop` chains on resize, breakpoint change and `fonts.ready`. Per frame only
  `scrollY` is read, in the `scroll` event, before any write (observed).
- **Cost model.**
  - Per frame: `T = G·c_arith + R·c_read + n_dirty·T_flush`, with G groups (tens) and R reads.
  - Apple: n_dirty = 0, so the cost is **O(G + R) with tiny constants**. AV measured 440 clean reads per frame at
    0 ms forced and 105 fps (Vision Pro; observed).
  - On resize: O(K·d), for K keyframed elements at depth d, plus one layout, debounced 250 ms. A hidden
    `position:fixed; height:100vh` tracker filters out iOS toolbar resizes, because `vh` = lvh (vendor doc, MDN).
- **Why.** A read's cost is not O(1): it is `T_flush` = **all** pending invalidation (render.md Q7, answers-2 R2).
  Reading only before writes makes every read hit a clean tree. The resize work runs a few times per session, not
  about 36 times per finger pass (toolbar).
- **Trade-off.**
  - Stale geometry: lazy content, sticky offsets or a font swap without a resize need `forceUpdate()`.
  - `offsetTop` ignores transforms.
  - **Apple's exceptions:**
    - Analytics re-measures 200-440 elements per scroll event because of a per-call debounce (F-017). It stays
      free only because n_dirty = 0.
    - iPhone 18 Pro: inside `onScroll`, a gallery group reads `scrollTop` after an earlier group wrote. Every
      event then pays `T_flush` = 12-25 ms (558-1102 ms over 45 events, observed). Same reads, n_dirty = 1:
      **the rule is about order, not count.**
- **Our page.**
  - Baseline: 12 reads per frame in rAF: about 6 rects, 1 `getComputedStyle`, 1 `elementsFromPoint` (AV §5).
  - Steady cost on the phone: nav `L` 1.6-1.9 ms per call at 6x, so about **2-4 ms per frame** (de-middle §3.6).
  - Event frames: at the 0.72 flip, `ee()`'s `getComputedStyle` is the first dirty reader and pays 21.7 ms
    (F-029, Chrome 6x).
  - **Gap:** steady 2-4 ms per frame, which is N12's. At the flip, caching moves the 21.7 ms into the rendering
    update; it does not delete it (de-hero point 4). Only §2.9's fix deletes it.

### 2.2 One phased rAF that sleeps (AS §2.1, P2; AV §3.4)

- **What.** One executor runs `update` (reads), then `external`, then `draw` (writes). It requests a frame only
  while a subscriber's keyframe `needsUpdate()` (observed).
- **Cost model.**
  - Per frame: `T = Σ_subscribers t_js + 1·(style + layout + paint)`, with n_flush ≤ 1.
  - At rest: **0 frames**, so 0 rendering updates and 0 commits.
  - Legacy per-callback rAFs instead pay n_flush = the number of read-after-write transitions (FINDINGS T9).
- **Why.** At rest the WebContent process can sleep. While scrolling, there is one style/layout pass per frame.
- **Trade-off.**
  - Wake-up latency of one frame.
  - Animations are JS-driven, so they stay on the main thread. Apple accepts this because every write is a leaf
    (§2.4).
  - **Exception:** iPhone 18 Pro's 3D viewer keeps a rAF loop at rest (360 callbacks per 3 s, 0.3 ms each,
    observed). Cheap per frame, but the page never idles, and it is the janky page.
- **Our page.**
  - At rest: 48-95 page rAF callbacks per second, with 4-8 style records per frame (countdown faces; AV §5).
  - The 1 Hz countdown spikes (35-58 ms) and the 3.15 s accent pairs (45-60 ms) recur at idle (de-hero §2C).
  - With one spike per second, about 1 frame in 60 while scrolling the hero window carries a spike.
  - **Gap:** Apple's at-rest budget is 0. Our idle animations are design, so the copy is "run them threaded" (WAAPI
    / CSS), not "remove them".

### 2.3 Range arithmetic, not render-state flips (AS §2.1, P3; AV §4)

- **What.** An out-of-range group returns before touching the DOM. Everything stays rendered: no
  `content-visibility`, and nothing changes state at the viewport edge (observed: 11-13 elements written per frame
  out of 255-356 page-wide).
- **Cost model.**
  - Gate per frame: O(G) comparisons. State-change cost: **0**.
  - The alternative, an IO/c-v gate, is cheap to observe (IO entries are computed after layout). What costs is
    what it toggles, all in one rendering update:
    `T_unskip = S·(c_el + c_lay) + 9A·/R + Σ_layers (c_L + 36A_i/R_alloc + 9A_i/R_paint)`.
  - WebKit's native c-v un-skips at a **zero margin** and rebuilds every descendant layer on each entry
    (answers-2 W1, vendor source).
- **Why.** It turns an O(subtree + layers) spike at a boundary into nothing. The price is paid once, at load:
  style and layout of the whole document. Paint is coverage-bounded, so it does not grow with the page.
- **Trade-off.**
  - Load-time style and layout of 21-34k px of DOM.
  - Static layers stay resident: 35-85 `will-change` elements, mostly off-screen (AV §3.4).
  - Apple accepts both; the phones that fail the memory test get the base tier (§2.14).
- **Our page.**
  - The y≈1830 frame (86-106 ms, de-middle §2) is a gate side effect in a scroll frame: the morph IO flips `inert`
    on a ~150-element subtree, assigns 21 `src`, and arms non-passive listeners. The baseline also mounted the
    panel there.
  - Scroll-up re-skip (de-middle §3.2): profile deck 70 + `#people` 20 + hero 14 = 104 MB of layers. At 5 GB/s
    that is **≈ 21 ms of allocation alone**, before any paint (derived).
  - **Gap:** one 70-90 ms frame per pass, plus an untested scroll-up spike. Apple's form: the IO may fire, but it
    may only set a class or a flag (O(1)). The heavy part runs at load or at a quiet moment.

### 2.4 Element-local writes with an epsilon, not inherited root variables (AS §2.2, P4; AV §3.3)

- **What.** A keyframe writes `transform`/`opacity`/its own `--var` on **its own element**, and only when the value
  moved by more than `epsilon` (0.05) (observed).
- **Cost model.**
  - `T_style = Σ_writes S(w)·c_el`, where S(w) = 1 for a non-inheriting or leaf write and S(w) = |subtree| for an
    inherited custom property (StyleTreeResolver, de-hero §1.1).
  - Writes per keyframe are bounded by `min(frames in range, Δv/ε)`, and are **0 at rest**.
  - Apple: 11-13 elements per frame (p95 34) with 0-26 descendants each, so S ≤ ~40 and **T_style ≤ 1 ms**
    (derived).
  - Break-even for writing n consumers instead of one root: `n·c_write < |subtree|·c_el` with c_write ≈ 1-2 µs
    (JS→C++ + parse). That holds for any n smaller than the subtree.
- **Why.** It removes the S term entirely: style cost tracks what moves, not what sits under it.
- **Trade-off.**
  - The runtime must know every consumer (one keyframe per element).
  - A descendant can't simply `var()` an ancestor's value.
  - ε quantizes the motion: invisible for px at DPR 3 (0.05 px vs a 0.33 px device pixel).
  - Apple's TOM scrim writes `--tom-css-scrim-opacity` on the media container, which inherits only into its
    `::after` (observed, iPhone CSS): a "leaf" in effect.
- **Our page.**
  - `--exit-opacity`: S = 230 vs 7 consumers (2.3-5.8 ms vs ~0.1 ms per frame; hero v2 removes it).
  - `--morph`: S ≈ 150 nav-subtree elements vs ~26 consumers.
  - `--morph-fade`: all of `#platform` while m < 0.55 (R4, `inherits:false` in #6 v04).
  - F-029: 429 elements restyled in one frame.
  - **Gap:** 1-5 ms per frame in the morph and hero windows. Small next to the resize/flip terms, but it is in
    every frame of them.

### 2.5 Composite-only, and clip instead of resize (AS §2.2, P5; AV §3.3)

- **What.** The pinned text-over-media (TOM) frame keeps its box. Per frame it writes
  `clip-path: inset(t% l% round Rpx)` on **one media container**, with t, l ∈ [0, 6.25] % and R up to 28-40 px
  (`this._els.mediaContainer.style.clipPath=\`inset(${t}% ${i}% round ${s}px )\``,
  https://www.apple.com/v/iphone-18-pro/b/built/scripts/overview/main.built.js; observed). The media UI follows by
  `x` translate.
- **Cost model.**
  - **Clip on a fixed box:** `T = 1·c_el + c_commit` per frame, plus a shape-mask path update. Raster 0, allocation
    0, layout 0 (F2): **O(1)**. The GPU masks one layer, O(A) in the render server, cheap.
  - **Resize:** `T = layout(S) + Σ_resized (36A_i/R_alloc + 9A_i/R_paint)`: **O(A) per frame**, because a resized
    untiled buffer is dropped (F1).
- **Why.** The content of a resized layer must be re-rastered. A mask's content never is.
- **Trade-off.**
  - The full-size layer is resident for the whole effect (the TOM container is ≈ a viewport: 12-14 MB).
  - `clip-path` is main-thread (not threaded; webkit.md §9).
  - The clip can only *hide*: the content can't re-flow to the clip's size.
  - **Apple's exception, and why it stays cheap.** The "All Access Pass" writes `width`/`height` every frame
    (1.1-3.1k writes per scroll on 3 pages, AV §3.3) on `.all-access-pass__background`. That element is
    `height: var(--aap-min-height)` (56px), `z-index: -1`, `will-change: transform`, and **empty**: background
    and backdrop only (observed, iPhone CSS). Its blur even varies per frame:
    `blur(calc(var(--aap-blur)*(2 - var(--alpha))))`, 7-14 px. Worst case 430×56 CSS = 0.22 Mpx device, 0.87 MB:
    fill 0.15 ms + allocation 0.17 ms + 0 descendants laid out. An empty box with only a colour can also take
    the solid-colour path (no backing at all, answers-2 W3). **About 0.3 ms per frame (derived).**
- **Our page (morph).**
  - g resizes the nav to 406×791 = **2.9 Mpx device**: 13× the AAP pill. Its content (header, veil, center,
    footer, bar, 3 tracks) adds 4-10 Mpx and 11-29 MB per frame (de-morph §1.3).
  - **Where gh landed (may explain the 6-9 ms).** gh fixed the panel's content size, but the box that still resizes
    is the **clipper**:
    - the nav's own buffer (`color-mix` fill, 0.45-2.6 Mpx; up to 10 MB);
    - its `CABackdropLayer` bounds and radius;
    - the nav subtree layout.

    The clip itself was never the cost (F2: shape mask, no paint).
  - Apple's TOM is the opposite arrangement: **the box that clips never changes size; only its mask path does.**
  - The driver data fits a sum, not a max. g 35 → gh 26 (−9) and gb 29 (−6). Under F3, raster/allocation and the
    GPU blur passes add in series, so each ablation removes its own chunk. Neither "dominates", because neither
    is above half the frame.
  - Side note, not a revision of de-morph's model: the driver's g baseline is 35 ms, not the finger's 58-68.
    gh = 26 sits inside de-morph's predicted *after* range (17-33 ms).
  - **Test that discriminates (ghb, already built):**
    - serial (F3): ghb ≈ 35 − 9 − 6 ≈ **17-23 ms**;
    - pipelined max: ghb ≈ **26** (no extra gain).
  - **R2 is buildable as Apple builds it.** `updateMaskLayer` puts the mask on the structural layer when the layer
    has a backdrop (`structuralLayerPurpose() == StructuralLayerForBackdrop`, `GraphicsLayerCA.cpp` l.3419-3420;
    vendor source). A `clip-path` on the nav therefore clips its `backdrop-filter` too. The backdrop rect itself
    comes only from `border-radius` or `clip` (`updateBackdropFiltersGeometry`, `RenderLayerBacking.cpp`
    l.893-929; vendor source). This answers de-morph open question 1 at the source level. It still needs a look
    on the phone (de-morph V4).

### 2.6 `will-change` on a window, per element (AS §2.3, P6; AV §3.4)

- **What.** A `will-change` class per card from `t − 150vh` to `b + 50vh`; on staggered items only while they run;
  `will-change: unset` in several components at ≤ 734 px (observed).
- **Cost model.**
  - Creating one layer: `T_create = c_L + 36A/R_alloc + 9A/R_paint`. Dropping it repaints A into the parent.
  - A window costs 2 × T_create per element per pass, **one element per crossing**: O(1 element) per frame.
  - A scene-wide flip costs Σ over the whole subtree in one frame.
  - Steady memory: `Σ_live 36A_i`.
- **Why.** It spreads the creation of N layers over N different frames, off-screen, and caps the live count (≤ 12
  windowed at a time, AV). It also respects the memory budget: under pressure WebKit's conservative policy stops
  honouring `will-change` (webkit.md §4), and tiles shrink to 1024 px (F1).
- **Trade-off.**
  - The memory is held over about 2 viewports per element.
  - The creation is still a main-thread cost inside a scroll frame, just a small one. For an Apple-sized card
    (≈ 350×450 CSS = 1.4 Mpx device, 5.7 MB) that is ≈ 1.1 + 2.8 ≈ **4 ms** (derived).
  - Apple still keeps 35-85 static layers (AV): the rule is "no bulk flips", not "no permanent layers".
- **Our page.**
  - The commission card (430×1197 → 4.6 Mpx device, 18.5 MB): one window flip ≈ 3.7 ms allocation + 3-9 ms paint =
    **7-13 ms**, half a frame (de-middle §3.3).
  - The panel's scene flip at the tween start creates **~88 layers in one frame**: 3 tiled tracks with ~3.3 Mpx of
    images, plus 85 faces. That fits the 91-96 ms first frames (de-morph §2).
  - **Gap:** windows are fine for Apple-size cards. On our phone layout nothing mid-page animates transform
    (de-middle R5), so the Apple lesson there is the ≤ 734 px `unset`, not the window.

### 2.7 No non-passive listener on the scroll path (AS §2.6, P7; AV §3.4)

- **What.** The window gets `scroll`/`resize` only. Touch and pointer listeners are added inside a widget on gesture
  start (observed).
- **Cost model.**
  - With a blocking listener, each touch waits for the main thread. A touch arriving at a random time waits for the
    rest of the current frame. That is the residual-life formula
    **E[wait] = E[T²] / (2·E[T])** (renewal theory, derived), dominated by the long frames.
    - A clean page (T = 16.7): 8.3 ms.
    - Our morph (mean ≈ 65, sd ≈ 40 ms, de-morph §2): (65² + 40²)/130 ≈ **45 ms** per touchmove.
  - Arming or disarming the listener updates the touch-event regions once: O(event-region walk). Its WebKit cost is
    unknown (de-middle H1a, inference).
- **Why.** With passive listeners only, the scroll is served by the UI process, whatever the main thread does
  (webkit.md §6).
- **Trade-off.**
  - No scroll-jacking: Apple pins with `sticky` and drives the effect from a range.
  - **Exception:** iPhone 18 Pro's 3D viewer arms `{passive:false}` `touchmove` on `document` at setup (observed).
    On that page T has 35-50 frames > 50 ms per 9 s, so E[wait] is large. The exception is costly only because
    the main thread is busy: the same listener on a 16.7 ms page would cost ≤ 1 frame.
- **Our page.** F1: touchmove frames are 10-30 ms slower (65 vs 53 p50). The formula says the touch penalty falls
  with T: every morph render win also shrinks the touch penalty, roughly quadratically in the long frames.

### 2.8 Scrub video instead of DOM motion (AS §2.4, P8; AV §3.4)

- **What.** One `currentTime` write per frame in range. The file is H.264 with a keyframe every 5 frames, 60 fps,
  299 frames, 5.0 MB (observed).
- **Cost model.**
  - Main thread: **O(1)**, one assignment.
  - Decode: ≤ g = 5 frames per seek, in the hardware decoder, off the main thread. Raster 0: the video is its own
    layer.
  - The DOM equivalent of K moving objects is O(K·c_el + Σ repaint).
- **Why.** Any motion complexity (3D, lighting, many objects) costs the same: one number.
- **Trade-off.**
  - Bytes: 5 MB per 5 s of scrub, so it must load 1.5 vh ahead.
  - Baked pixels: no live text, no i18n.
  - Seeks coalesce (4-16 `seeked` of 11-41 `seeking`), so a fast fling shows a stale frame. Never a long frame.
- **Our page.** The morph's content is live (countdown, CTAs), so video can't replace it. Its 3 image columns could
  be, but under R1/R2 they no longer re-raster. **Design option only, no rank.**

### 2.9 Reveal once, no blur (AS §2.8, P9; AV §3.3)

- **What.** `StaggeredFadeIn` fires once at `t − 85vh`, tweens opacity + translateY per item, then drops its
  keyframes and `will-change`. No filter writes anywhere (observed).
- **Cost model.**
  - Per frame: n leaf writes ≈ n·c_el. Raster 0: the items are already painted at opacity 0.
  - Afterwards: 0. Dropping `will-change` repaints the items into their parent once.
- **Why.** No first raster at the reveal, no subtree toggle, no filter outset.
- **Trade-off.** No blur look. It doesn't replay on scroll-back. The tween is JS on the main thread; our CSS
  transitions are better there, because they are threaded.
- **Our page (the 0.72 flip, de-hero §2B).**
  - `visibility` inherits, so the flip restyles S = N_card + N_nav ≈ 450-1150 elements: **4.5-29 ms**.
  - The card's first raster lands on the flip frame: 3-4 Mpx at 1-1.5 Gpx/s ≈ 3-4 ms, more with images.
  - The blur ramp runs on a 4 Mpx layer whose content spans 18.6 Mpx of panels.
  - Apple's form: opacity 0 + `inert` (pre-rastered), opacity/transform only, matching filter lists if the blur
    stays.
  - **Gap:** the 43-63 ms pair → ≤ 34 ms (de-hero R1, derived there too).

### 2.10 Nav theme by declared ranges, not hit tests (AS §2.9, P10; AV §3.3)

- **What.** Each themed section declares a range. Entering it pushes a class onto the nav, leaving pops it (a stack).
  0 `elementFromPoint` calls (observed, MacBook Pro).
- **Cost model.**
  - Per frame: O(T) comparisons over T themed sections.
  - Per crossing: 1 class change, so S_nav restyled once.
  - A hit test costs O(depth · candidates at the point). It needs clean layout, so it adds `T_flush` if the tree
    is dirty.
- **Why.** Zero DOM reads per frame. The theme cost is paid only at boundaries.
- **Trade-off.** The ranges are cached geometry (stale after a layout change), and they can't see z-order: a
  sticky element over a section needs its own range.
- **Our page.**
  - Nav `F()`'s `elementsFromPoint` plus `ee()`'s `getComputedStyle` + 2 rects run every frame: part of the
    2-4 ms in §2.1.
  - The sticky profile over the future section is exactly the z-order case (1690-point parity probe).
  - **Gap:** 2-4 ms per frame in the 20-34 ms band. That is N12, where Apple's math adds nothing new.

### 2.11 Small blurred leaves (AS §2.3/§2.9, P11; observed CSS)

- **What.**
  - Local nav: `backdrop-filter: saturate(180%) blur(20px)` on an empty `.ac-ln-background`, min-height 48 px, only
    while stuck (`.ac-ln-sticking`), with a solid `noblur` variant (rgba 0.92) (observed,
    `/ac/localnav/9/styles/ac-localnav.built.css`).
  - AAP pill: 7-14 px on 56 px.
- **Cost model.**
  - GPU, every frame that content moves under the layer: `T_rs ≈ A_b·k_blur`. CA blurs through a downsampling
    pyramid, so the cost is ≈ O(A_b) with a weak dependence on r (inference). A full-screen blur ≈ 1-2 ms on A17
    (de-middle §3.4, derived).
  - **Changing r** on a layer with content also changes its outset (≈ 3r per side) and bounds, so it repaints:
    O(A_content) on the main thread (P4, webkit.md §2).
- **Why.** Each blurred leaf stays at ≈ 0.2 Mpx, about 1/18 of a screen, and has no content to repaint.
- **Trade-off.** Glass only on bars; big surfaces get solids. The radius ramp is allowed only where A is tiny (AAP).
- **Our page.**
  - The nav at rest is 398×52 = 0.19 Mpx: **the same as Apple.**
  - During the morph, three radii change every frame: nav backdrop (≤ 2.9 Mpx), panel filter (2.6 Mpx), `#platform`
    filter (≤ 3.6 Mpx visible, with content, while m < 0.55). That is ≈ **9 Mpx of changing blur, 40× Apple's
    AAP**. gb's −6 ms is that term.
  - **Gap:** ~6 ms per moving frame (measured as gb). A fixed radius faded by opacity is not pixel-identical
    (R7: design call).

### 2.12 Load by range, never mount during scroll (AS §2.4-2.5, P12)

- **What.** `data-download-area-keyframe` at `t − 150vh`. The DOM is server-rendered and stays mounted. Scrub video
  loads at `a0t − 250vh` (observed).
- **Cost model.**
  - At the edge: O(n_img) `src` swaps, with no layout shift because the boxes are sized by CSS.
  - Decode lands later and asynchronously.
  - DOM creation during scroll: O(DOM + style + layout + layers). Never happens.
- **Why.** The network and decode latency (~0.5-1.5 vh ahead at flick speed) is hidden, and the frame cost of the
  edge is O(n).
- **Trade-off.** Bandwidth spent on content the user may never reach. A 1×1 GIF placeholder until the edge.
- **Our page.** #13 already pre-mounts the panel. At y≈1830 the 21 `src` assignments are O(n) and cheap (< 2 ms).
  What is not cheap is what else the edge does (§2.3).

### 2.13 Image density capped at 2x (AS §2.5, P14)

- **What.** Three breakpoints × 1x/2x; 490 `_2x` and 0 `_3x` references on the iPhone page (observed).
- **Cost model.**
  - Decode time and decoded memory scale with source pixels: 3x/2x = (3/2)² = **2.25×**. 2x saves 56 % of both.
  - Raster into a DPR-3 backing scales with the *destination* area, so it is unchanged.
- **Why.** Less decode on the main/decoder path and less memory per layer. Invisible at 460 ppi (Twitter
  engineering blog, 2019).
- **Trade-off.** Slight softness on fine line art; three files per image.
- **Our page.** Desktop hero covers are fetched on mobile (~1 MB, TOPICS "hero-cover-mobile"): a load and memory
  term, not a frame term. **Not ranked.**

### 2.14 Enhanced and base tiers, and keyframe masks (AS §2.7, P13; AV §2)

- **What.**
  - The tier is decided once at load. Validators include breakpoint, text zoom, an invalid viewport such as
    `smallTall` (≥ 927 px tall at ≤ 734 px wide), and Low Power.
  - `breakpointMask` skips masked keyframes entirely (observed).
- **Cost model.**
  - Base tier: **0** per-frame scroll work.
  - Masks: O(K_active) per frame instead of O(K_all).
  - Low Power caps rAF at 30 fps (bug 215745), which doubles the budget to 33 ms but halves the motion.
- **Why.** No device pays for an effect it can't run, and the decision costs nothing per frame.
- **Trade-off.** Two code paths; base looks static; a misclassified device loses the effects (our 430×932 Chrome
  emulation does, F-016).
- **Our page.** T1 already gates on the CSS media queries (the same idea as `breakpointMask`). There is no Low Power
  tier: a frame-class gain of 0, a product decision.

## 3. Complexity budget for one frame (iPhone 15 Pro Max, DPR 3)

**Derivation (derived; rates as in §1).**
- Safari's rAF runs at 60 Hz, so a frame is **16.7 ms** (webkit.md §7).
- Fixed cost per frame: JS ≈ 1 ms (data), commit ≈ 2 ms, rendering-update walk ≈ 1 ms. That leaves ≈ 12 ms.
- Under F3, an ordinary composite (page plus the nav backdrop) takes ≈ 3-4 ms off that. That leaves **≈ 8-12 ms**
  of variable main-thread work.
- Split it as: style 3, layout 2, raster 3, allocation and new layers 2 ms.

| resource | affordable per frame | how it follows | Apple, typical frame (AV) |
|---|---|---|---|
| elements restyled (S) | **120-300** | 3 ms / c_el (10-25 µs) | ≤ ~40 (11-13 leaves written, 0-26 descendants) |
| Mpx painted | **≈ 1.5** text/images, ≈ 4.5 flat fills (≈ ½ viewport of content) | 3 ms × 0.5 / 1.5 Gpx/s | ≈ 0 (clip, transform, opacity); AAP 0.22 |
| new backing bytes | **≈ 10 MB** (≈ 2.8 Mpx) | 2 ms × 5 GB/s | ≤ 1 card per crossing (~5.7 MB) |
| layers created | **≈ 1 card-sized** (1.4 Mpx), or tens of tiny ones; a full-viewport layer (≈ 8 ms) alone is over | `c_L + 36A/R_alloc + 9A/R_paint` ≤ 4 ms; c_L unknown | 9-21 toggles per 9 s pass, one per frame |
| blur | GPU ≲ 2 full screens of A_b (≈ 7 Mpx); a **changing** radius on content counts against the paint row | 1-2 ms per full screen, serial under F3 | 0.2 Mpx leaves (nav, AAP) |
| dirty layout reads / hit tests | **0** (a clean read is ~free) | each dirty read = T_flush | 0 (440 clean reads on Vision Pro) |
| rAF at rest | **0** | idle = no commits | 0 (3 of 4 pages) |

**Our hotspots against it (derived from the three DE notes and the driver data):**

| hotspot | restyle | paint | allocation / new layers | blur | verdict |
|---|---|---|---|---|---|
| morph g, moving frame | ~150 + `#platform` while m < 0.55 | **3.9-10.4 Mpx (2.6-7×)** | **11-29 MB (1.1-2.9×)** | **≈ 9 Mpx changing (1.3×), plus content repaint on `#platform`** | over on 3 rows; measured p50 35 ms |
| morph gh | ~150 + JS veil write | 0.6-2.8 Mpx (0.4-1.9×) | ≤ 12 MB (1.2×) | same as g (1.3×) | at the edge on 2 rows, over on blur; measured 26 ms |
| morph first frame | the nav + classes | high-quality image resample ≈ 3 Mpx (2×) | **~88 layers incl. 3 tiled tracks (≈ 2-3×)** | — | measured 91-96 ms |
| 0.72 flip (y≈625-745) | **450-1150 (1.5-10×)** | **first raster ≥ 3-4 Mpx (2×+)** | card layer 16 MB with outset (1.6×) | 4 Mpx with a ramping radius over 18.6 Mpx of content | over on 4 rows; 43-63 ms |
| y≈1830 morph IO | ~150 (`inert`) | **430×922 full-screen paint 3.6 Mpx (2.4×)** | — | — | plus listener arming (unknown); 86-106 ms |
| countdown 1 Hz tick | ≤ 40 face leaves | ≈ 0 (composited faces) | 0 | — | **under budget by count**: the 35-58 ms spikes are an unmodelled term |
| countdown at the morph start | — | — | 85 faces created in one frame (part of the first-frame row) | — | over, via the scene flip |
| middle feed rect | — | 1.15 Mpx every frame (0.75×) | — | — | most of the budget, every frame (the 20-34 ms band) |

## 4. What to copy next, ranked by expected gain on felt frames

Gain = ms saved × frames affected per pass. All gains are derived; owners are from DIRECTION 09:25Z and the DE README.

| rank | copy (Apple decision) | change | expected gain | parity risk | owner |
|---|---|---|---|---|---|
| 1 | **TOM frame + AAP leaf** (§2.5, §2.11) = full R2 | While morphing:<br>- the nav content box is fixed at the final size and clipped by `clip-path: inset(t r b l round R)` (shape mask; the backdrop is clipped too, §2.5);<br>- `color-mix` becomes a `#131922` layer at opacity m (F-039);<br>- `--morph` is registered `inherits:false` and written on its ~26 consumers (§2.4). | Per moving frame: restyle ~26 × 25 µs ≈ 0.7 ms, raster 0, allocation 0, so the main thread ≈ 4-5 ms. Result: **16.7-25 ms p50** (from gh 26 / g 35) over the ~20-40 frames of every tween. If ghb confirms F3, add a fixed-radius backdrop (R7) to reach a steady 16.7. | medium: bar and logo alignment (±1 px); R7 is not pixel-identical (needs the user's OK) | fix-nav-morph |
| 2 | **Range edge does O(1)** (§2.3, §2.12) = de-middle R1 | The morph IO only sets a flag. `src` at the idle pre-mount, `inert` until `E`, listeners registered once and passive. | One frame per pass, **86-106 → 17-35 ms**, if e1/e2 confirm | none | fix-nav-morph |
| 3 | **Reveal pre-rendered, no subtree toggle** (§2.9) = de-hero h1 | `opacity:0` + `inert` instead of `visibility:hidden`; `blur(14px) → blur(0px)` with matching lists | Two frames per pass, **43-63 → ≤ 34 ms**; +12-90 MB resident earlier | medium (a11y, `inert`) | fix-hero-exit coordinating large-area-blur and phone-invisible-shrink |
| 4 | **No bulk layer creation** (§2.6) = morph R5(b) + h3 | Flip the panel scene to `active` at a quiet moment after the arm, not at m > 0.001. One strip per countdown digit. | First tween frames **91-96 → ~50 ms** (2 per morph cycle) | none (same pixels); +15 MB held | fix-nav-morph; fix-countdown-idle-raf (spawn candidate) |
| 5 | **Solid-colour leaf, not a root background flip** (localnav `.ac-ln-background`, §2.11 + W3) = middle R2 | `::before` empty composited layers for `is-pain-dark` and `.commission.shrinking` | **10-20 → < 2 ms** at 2 crossings per pass | low | fix-scroll-engine |
| 6 | **Cached ranges, no hit test** (§2.1, §2.10) = N12 | Already built (v5) | 2-4 ms on every scroll frame (the 20-34 ms band); judge by forced ms | low (sticky z-order) | fix-nav-morph |
| 7 | **The loop sleeps** (§2.2) | Countdown and accent as threaded animations (strip + WAAPI `linear()`), after a Web Inspector attribution of the 1 Hz spike | idle spikes of 35-58 ms gone, if the attribution names the countdown's writes | low | fix-countdown-idle-raf / layout-animations |

Not ranked:
- scrub video for the morph columns (design only, §2.8);
- the 2x image cap (load and memory, §2.13);
- a Low Power / base tier (product, §2.14).

## 5. Where this disagrees with the current plan

1. **gh → R1 tuning: stop. Go to R2.** By Apple's math, R1 keeps the one box that still resizes (2.9 Mpx, 13× Apple's
   largest per-frame resize) and can't leave the 25 ms band. The source read (§2.5) removes R2's main risk, the
   backdrop clip. Lead's rank 1 ("gh / R1") becomes "R2, with gh as its first half".
2. **R7 (fixed-radius blur fades) is not second-order.** gb saved as much as gh (6 vs 9 ms). Under F3 the GPU term
   adds to the main thread instead of hiding behind it. de-morph lists R7 as "not recommended"; it should be a
   design question to the user, ranked with R2. Decide after ghb: additive savings confirm F3.
3. **Per-element `will-change` windows (arch-apple #1, /10b) are a desktop lesson.** Apple sets `will-change: unset`
   at ≤ 734 px. A window flip on a phone-sized card is 7-13 ms (§2.6). This supports de-middle R5 (no mid-page
   `will-change` on phones) over more windows.
4. **h3's 160 layers are not over budget by count** (3.6 MB, all created at load). What breaks the budget is creating
   85 of them at once at the morph start (rank 4) and an unattributed 1 Hz spike. Attribute the spike before
   building h3 for idle gains.
5. **The first tween frame and the y≈1830 frame are "state at a boundary" costs.** Apple prices those at 0 per
   frame by doing them at load or as one class flip. Neither belongs to N10's a-d ablations (agrees with
   de-middle).

## 6. Limits and open checks

- The throughput rates are the team's assumptions. c_L (fixed cost per layer creation) and T_rs (render-server
  time) have no device number, so the budget rows that use them are order-of-magnitude.
- F3 (serial back-pressure) is an inference from `RemoteLayerTreeDrawingArea`. The ghb driver run is the cheap
  test: ≈ 17-23 ms means serial, ≈ 26 ms means pipelined.
- The `clip-path` → backdrop-mask path is read on WebKit `main`. iOS 26.6.1 may differ, so de-morph's V4 (look on
  the phone) still applies.
- Apple's frame-time numbers come from Chrome 6x (AV). Apple's pages were not timed on the phone.
- The AAP pill's real maximum width wasn't measured. 430 px is the upper bound used in §2.5.

## Sources

- Apple (observed, one-liners only): the TOM clip writer and the scrim var
  (https://www.apple.com/v/iphone-18-pro/b/built/scripts/overview/main.built.js); `.all-access-pass__background`
  and `[data-component-list~=TextOverMedia]` rules
  (https://www.apple.com/v/iphone-18-pro/b/built/styles/overview.built.css); the local nav
  (https://www.apple.com/ac/localnav/9/styles/ac-localnav.built.css); counts from AS and AV.
- WebKit (vendor source, `main`, 2026-10-01):
  - https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/ca/GraphicsLayerCA.cpp
    (`cMaxPixelDimension`/`LowMemory`, `updateClippingStrategy`, `updateMaskLayer`, `requiresTiledLayer`);
  - https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/RenderLayerBacking.cpp
    (`updateBackdropFiltersGeometry`, `updateMaskingLayerGeometry`, ancestor clip shape mask);
  - `RemoteLayerBackingStore.mm`, `RemoteLayerTreeDrawingArea.mm`, `StyleTreeResolver.cpp`, as cited in
    morph-endpage.md, answers-2.md and hero.md.
- Specs and docs: css-contain-2 (c-v timing), web.dev `@property` performance (vendor doc), WebKit bugs 184250
  (passive touch), 215745 (Low Power 30 fps), 173434 (60 Hz rAF).
- Team data: `fixes/iphone-wave2/raw/`; the morph-webkit driver result (gh/gb/g, iphone-runner 09:24-09:27Z,
  worktree agent-a277ea00c8773c1ea `fixes/morph-webkit/README.md`); hero.md, middle.md, morph-endpage.md.
