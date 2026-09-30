# Architecture review: scroll jank, 2026-10-01

By `arch-lead`, with research from `arch-webkit` (iOS Safari/WebKit) and `arch-render` (style/layout/paint,
Svelte 5); their full answers are in `webkit.md` and `render.md` next to this file once the lead lands them.
Read-only review: no Chrome, iPhone or locks were used. Every external claim carries a URL and a confidence
tag; "inference" means ours, unverified. Line numbers are the pretty baseline (`fix.mjs show`).

## 0. The one correction to the playbook

FINDINGS "Where the remaining jank is" says the ~100 frames >20 ms per run "are not LoAF-visible, so they're
per-frame style and paint cost, not script". The second half doesn't follow. LoAF reports only frames whose
rendering update is delayed beyond **50 ms**, and the threshold can't be lowered
([Chrome docs](https://developer.chrome.com/docs/web-platform/long-animation-frames), vendor doc). A 20-50 ms
frame is invisible to LoAF whatever it contains. What *is* true: DevTools CPU throttling suspends only the
renderer **main thread** ([Chrome blog](https://developer.chrome.com/blog/devtools-grounded-real-world),
vendor doc), so a rAF delta >20 ms at 6x means ~3.3+ ms of real main-thread work in that frame: script
(engine callbacks, IO/RO callbacks, Svelte flushes, vendor observers, GC), style, layout, paint record,
layerize, or commit. Which one is an open question, and it decides the next wave.

What the existing traces already say (plain baseline, `research/cpu-throttle-calibration/chrome-sweep.md`,
6x scroll phase, main-thread self time): `UpdateLayoutTree` 2951 ms, script 1554 ms, Layout 803 ms, Paint 755 ms
of 11.4 s. Style recalc is the largest single item and about twice the script time. So "mostly style" is
likely right, but it is a whole-run total (including forced recalcs inside LoAF frames), not a per-frame
attribution of the 20-50 ms frames, and it predates wave 1.

**Evidence to collect first (cheap, decides the ranking below):** one traced run per side (not an A/B
statistic; tracing adds overhead) with `devtools.timeline` + `disabled-by-default-devtools.timeline`,
bucketing main-thread self time per frame (between `BeginMainThreadFrame`/`BeginFrame` markers or the rAF
logger's timestamps) into script (`FunctionCall`, `FireAnimationFrame`, `TimerFire`, `EventDispatch`,
`IntersectionObserverController::computeIntersections`), style (`UpdateLayoutTree`, with its
`elementCount` arg), layout (`Layout`), paint (`PrePaint`, `Paint`), and `Layerize`/`Commit`. Report, for the
frames of 20-50 ms only: the share of each bucket, and the median `elementCount` per `UpdateLayoutTree`.
A few thousand elements per recalc means inherited-custom-property subtree restyles (moves 1-2 below); tens
of elements with many recalcs per frame means forced recalcs (T4/T7/T9); a large `Paint`/`Layerize` share
means paint invalidation or layer count (moves 5-6).

## (a) Per topic: approach vs current best practice

Confidence tags: **spec**, **vendor** (vendor doc/blog/source), **blog**, **bug**, **inference** (ours).

### phone-invisible-shrink (landed), commission-forced-layout
- **Right approach.** Gating on the same media query as the CSS (T1) and caching MQLs (T2) is the standard
  "do nothing when nothing is visible" rule; write-on-change (T3) is the cheapest guard.
- **Missing (small):** the profile reset `d()` (JS 10923) still runs every phone scroll frame (`h.style.height = ''`,
  `--profile-scale: 1`, a `querySelector`, two inline writes on the active shell). In Blink an identical inline
  value is a no-op (`SetPropertyInternal` returns `kNoChanges`: no invalidation, no mutation record;
  [Blink source](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/css/abstract_property_set_css_style_declaration.cc),
  vendor source); WebKit likely the same (medium). So it costs only bindings + parsing + the `querySelector`:
  a `resetDone` flag is a cleanup, not a win. Corollary for T3: in Chrome, write-on-change saves parsing, not
  restyle; T3 wins came from removing *changing* writes (easing tails). Rounding written values (0.001, 0.5 px)
  turns near-identical writes into true no-ops.
- **Desktop only, later:** the `--commission-*`, `--future-shrink`, `--platform-shrink` writes land on the
  section and are consumed by one descendant card through inherited unregistered custom properties, so each
  write restyles the whole section subtree (move 1). Not a phone issue after T1.
- Safari 26 risk: none (no new platform features).

### countdown-idle-raf
- **Right approach** for the off-screen pause (IO per element, T6) and the face clamp (fewer writes).
- **Better technique, same pixels:** the digit spring only needs a composited `transform` on the *strip* of
  10 faces, not 10 per-face transforms: one `translateY(-value * cell)` on a wrapper whose faces sit statically
  at `i * cell`. That is 1 write per digit per frame instead of 2-10, and 1 layer per digit instead of 10
  (`.face{will-change:transform}` ~75 layers per countdown, ~160 with the panel's). The 0->9 wrap is the
  catch: model it as a strip of 0..9,0 and wrap the value (inference).
- **Measure the `--layers` variant** the owner prepared. WebKit gives each `will-change: transform` box its own
  layer, and under memory pressure iOS switches to a conservative policy that *ignores* will-change, so layer
  counts can differ between runs (`RenderLayerCompositor.cpp`, vendor source;
  [WebKit on layers](https://webkit.org/blog/8262/visualizing-layers-in-web-inspector/): "too many layers can have
  disastrous results on memory-constrained devices"). Put one `will-change` on the strip, not on each face.
  Layer count also costs main-thread
  `Layerize`/`Commit` per frame in Chrome and layer-tree commits on WebKit.
- The scroll-phase A/B can't show it; the idle phase (I-002) and the iPhone idle repaint counter can.

### hero-exit-scroll-timeline
- **Right approach, and the model for the rest of the page** (T12): no JS per frame, compositable keyframes.
- **Correction to its README:** Safari 26.0 shipped scroll-driven animations on the main thread; they run
  threaded only since **Safari 26.4**, for opacity, transform, translate/rotate/scale, offset-*, filter and
  backdrop-filter; custom properties and everything else stay on the main thread
  ([WebKit 26.4 features](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/), vendor;
  WebKit `AcceleratedEffect.cpp`, vendor source). 26.5 fixed view-timeline progress near 0/100 %, dynamic
  play-state pause and bfcache restore ([WebKit 26.5](https://webkit.org/blog/17938/webkit-features-for-safari-26-5/)).
  The test phone (26.6.1) has all of it; iOS 26.0-26.3 users get main-thread SDA, which is still better than
  the JS rect read but not free.
- **Keep the blur keyframes as `blur(0px) -> blur(18px)`** (the overlay does): WebKit drops a filter
  animation from acceleration when the from/to function lists differ (e.g. `none -> blur()`) or a
  `drop-shadow` sits mid-list (arch-webkit, vendor source). Never let a refactor turn `from` into `none`.
- P3 (var() of an animated custom property resolves to the base value): no public WebKit bug found; it fits
  WebKit recomputing keyframes only when a variable's *cascaded* value changes
  ([WebKit commit for bug 248145](https://github.com/WebKit/WebKit/commit/5c0b3cb4b2450bcc60e21f512306aaaa56e3e9b3), inference).
  The owner's workaround (attach after `is-splash-done`, animate real properties) is the right one.
- Verify: Web Inspector Timelines on the phone should show no per-frame style recalc attributed to the hero
  while exiting.

### large-area-blur
- **Right approach** (T10: shorten the changing-blur tail; P4: resting blur(0) doesn't repaint). WebKit
  confirms the mechanism: any `filter` other than `none` (even `blur(0)`) and any `backdrop-filter` force a
  composited layer; on Cocoa, Core Animation applies CA-representable filters (blur included) on the GPU and
  backdrop-filter uses a dedicated `CABackdropLayer` (WebKit `RenderLayerCompositor.cpp`,
  `GraphicsLayerCA.cpp`, vendor source). A *transition/animation* of filter with matching function lists runs
  as a CA animation off the main thread; a per-frame JS or custom-property write stays on the main thread
  (style + commit + GPU re-blur each frame). The repaints P4 saw fit the layer bounds growing with the blur
  outset (inference).
- **Missing / better:** (1) The permanent `blur(0)` leftovers are *layers* even if they don't repaint:
  removing them saves layer memory and commit work, which Timeline paint counts can't show. Check the Layers
  tab (count, memory) before/after. (2) For the future-card reveal, the textbook alternative is a cross-fade of
  `opacity` between the sharp card and a pre-blurred static copy (no blur radius change at all), but for a card
  full of live content that doubles the DOM; T10 is the pragmatic choice.
- **Nested backdrop-filter (P8):** the child's Backdrop Root is the parent with the backdrop-filter, so the
  child blurs only what's painted between them ([Filter Effects 2, Backdrop Root](https://drafts.csswg.org/filter-effects-2/), spec).
  Its cost is small (inference); leave it unless a design change is approved.
- The big remaining blur cost is not in this topic: the fixed nav's `backdrop-filter: blur(20px)` re-blurs
  what scrolls under it on **every scroll frame** (cost ~ area x radius, "more rendering passes":
  [WebKit blog](https://webkit.org/blog/3632/introducing-backdrop-filters/), vendor), and during the morph
  its radius changes every frame. See new topics N2 and N6.

### nav-hit-test
- **Right approach** (T11). `elementsFromPoint` without writes is the standard way to hit-test under your
  own overlay. The IO/geometry model the TOPICS row suggested is correctly rejected (stacking and
  hit-testability matter).
- **Better, later:** the nav theme only changes when a section boundary crosses the nav's line. An
  IntersectionObserver per themed section with `rootMargin: "0px 0px -<100% - navLine>px 0px"` (a one-pixel
  "line" root) gives the section under the nav line without any per-frame hit test; the hit test then runs
  only in the frames where an IO entry fired (inference). Keep `elementsFromPoint` as the tie-breaker for
  overlapping sticky layers.
- **Still in the frame after T11, on the whole page:** `ee()` (JS 12964) does `getComputedStyle` plus two
  rects of `.start-selling-profile-sticky` every scroll frame, and `_` reads the `.hero-track` rect for a
  `>= 0.72` test. `position` and `top` are static: read them once and on resize/MQ change. Gate `ee()` with an
  IO on `#profile-showcase` (it can only be true while that section intersects), and make the hero test an IO
  (T7). IO entries are computed after layout in the rendering steps and never force layout
  ([IntersectionObserver spec](https://w3c.github.io/IntersectionObserver/), spec). Also: the profile showcase
  sits inside the future section, which the engine defers with `content-visibility: auto` when inactive; a
  `getComputedStyle`/rect read into skipped contents forces their style/layout (css-contain-2 "skipped
  contents", spec), so this per-frame read partly defeats the page's own render deferral.

### morph-scrolljack-passive
- **Right direction** (3 listener modes). On iOS, touch listeners on window/document/body are passive by
  default since 11.3; an explicit `{passive:false}` makes the whole page a synchronous touch-event region, so
  every touch sequence waits for the (busy) WebContent main thread before it scrolls
  ([WebKit bug 184250](https://bugs.webkit.org/show_bug.cgi?id=184250), bug; UI-process region model per
  [Igalia](https://blogs.igalia.com/fujii/asynchronous-scrolling-for-touch-events-in-wpe-and-webkitgtk/), blog).
  So shrinking the blocking window to "morph engaged or at the end" is exactly right.
- **Unverified assumption in the README:** that Safari, like Chrome, sends later `touchmove`s of an
  already-scrolling gesture as `cancelable:false`. arch-webkit found no WebKit source for it. The finger test
  must cover "drag from above the end into it" explicitly (the `L` scrollTo pin is the safety net).
- **Architectural alternative:** no JS scroll-jack at all. "Push past the end to morph" is an overscroll
  gesture; the standard CSS building blocks are a real scrollable runway after the content (sticky pinned nav
  + a `view()`/`scroll()` timeline that drives the morph from the runway's progress) plus
  `overscroll-behavior-y: none` on the root to kill the rubber-band (Safari 16+,
  [caniuse](https://caniuse.com/css-overscroll-behavior)), optionally `scroll-snap-type: y proximity` to settle
  open/closed (26.5 fixed a re-snap bug). That turns the morph into a scroll-driven animation (threaded on
  Safari 26.4+ for its transform/opacity parts) with passive input only. It changes
  the interaction (the morph becomes scrubbable), so it is a design decision: new topic N8.
- Measurement: the scripted scroll can't see it (FINDINGS). A CDP `Input.dispatchTouchEvent` probe or the
  finger test is the only evidence.

### morph-panel-lazy-mount
- **Right approach** (T8). `requestIdleCallback` is still disabled by default in Safari, so the
  `setTimeout` fallback is needed ([caniuse](https://caniuse.com/requestidlecallback), vendor data).
- **Missing:** after pre-mount the panel's 5 image columns run `start-selling-morph-col-up/down` infinite
  `transform` animations from load and the panel countdown springs, all invisible (opacity 0 from `--morph`).
  Composited transform animations are cheap on the main thread, but in WebKit they are still layers and CA
  animations. Pause them (`animation-play-state: paused` while `--morph < 0.35` / `aria-hidden`), and honour
  `active` in the countdown (topic 1 part 2). Better still: `content-visibility: hidden` on the panel content
  until the morph starts keeps the DOM but skips its style/layout/paint, and animations in skipped contents
  don't advance ([css-contain-2](https://drafts.csswg.org/css-contain-2/), spec; Safari 18.0+,
  [WebKit 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)). Un-hiding still renders the
  panel in that frame (cheaper than a mount, not free): flip it one idle frame before the morph can start.
- Mount cost itself: 42-75 ms LoAF moved to idle. Also check `decoding="async"` on the 21 images so their
  decode never lands on the main thread when `src` is set in a scroll frame.

### pain-offscreen-notes
- **Right approach** (P9 guard). In runes mode `$state` uses `equals` (`===`): an identical primitive write
  returns at once, a fresh `[]`/`{}` always triggers a batch, a microtask flush and every dependent
  derived/each-block (svelte `internal/client/reactivity/sources.js`, `equality.js`, vendor source). Svelte's
  guidance: keep animation-rate values out of `$state`, use `$state.raw` for replaced arrays
  ([Svelte best practices](https://svelte.dev/docs/svelte/best-practices), vendor doc). The same applies to
  the nav's per-frame `z(v, …)`, `z(g, …)`, `z(p, …)` (primitives: free when unchanged) and to the morph spring
  state that feeds `--morph` (changes every frame: a flush per frame, see N2).
- **Missing:** the always-on `window` `pointermove` listener (JS 4733) runs for every pointer move on the
  page, including the ~300 pointermove/s the iPhone sends during a finger scroll (research 01). Attach it on
  `pointerdown` of a note and remove it on `pointerup/cancel` (standard drag pattern, with
  `setPointerCapture`). Only a finger test or a CDP touch probe will show it.

### scroll-engine
- **Right approach** (T9: read-then-write phases, one rAF, debounced height-only resize). This is the
  fastdom pattern; it removes forced layouts but not the frame's own style recalc, which matches the
  within-noise result.
- **Better target:** the engine's end state should be "no callback runs for effects that CSS can drive".
  Every effect that maps scroll position to a value linearly (exit, shrink scale, radius, fade) can be a
  `view()` timeline like T12, leaving the engine only for effects that need JS decisions (nav theme, morph
  arm). Rank candidates by how many elements consume their variable.
- **Render deferral on Safari 26:** `content-visibility` shipped in Safari 18.0; 26.0 fixed wrong
  `getBoundingClientRect` and hit-testing inside skipped subtrees
  ([WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), vendor). Safari 26.x has **no
  scroll anchoring** ([caniuse](https://caniuse.com/css-overflow-anchor); announced for 27.0), so a wrong
  placeholder size above the viewport shifts content on the test phone. The engine already writes the measured
  height into `contain-intrinsic-block-size: auto var(...)`: keep that. A section that becomes relevant does its
  first style+layout+paint in that frame (inference): look for it in the traced run.
- **Toolbar resize:** debouncing height-only resizes is right. `svh`/`lvh` are static, only `dv*` track the
  toolbar and MDN warns about the cost ([MDN lengths](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length), vendor doc);
  iOS 26.0 shifted fixed elements during the collapse, fixed in 26.1
  ([WebKit bug 297779](https://bugs.webkit.org/show_bug.cgi?id=297779)), so measure on 26.1+. Keep `svh`/`lvh` for sizes that shouldn't track
  the toolbar (the page already uses `100svh`) and no `dvh` on large containers. How many `resize` events a
  collapse fires has no authoritative source; the team's own count (36) is the best data.
- **Scene gating churn:** the paused state sets `will-change: auto !important` on the whole section subtree
  (CSS 11754-11758). Every activation flip restyles the subtree and creates/destroys all its will-change
  layers at once (re-raster), right at ±1 viewport while scrolling. Candidate for a >34 ms frame; check the
  traced run around `data-start-selling-scene` flips.

### layout-animations (landed)
- **Right approach** (T5). The FLIP-without-reads trick is textbook.
- **Missing:** the gradient-text sweeps stay `background-position`, which is main-thread and repaints every
  frame while visible. There is no composited way to move a gradient relative to `background-clip:text` glyphs;
  claims that `@property` stop/angle animations run on the compositor are wrong
  ([Blink animation README](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/animation/README.md),
  vendor; [bram.us](https://www.bram.us/2023/02/01/the-gotcha-with-animating-custom-properties/), Chrome DevRel blog).
  Composited look-alikes (design sign-off needed): two stacked text copies with static gradients cross-faded by
  `opacity`, or a static gradient copy revealed by an animated `clip-path: inset()`. Otherwise keep T6 and add
  `content-visibility` on the section (animations in skipped contents don't advance, css-contain-2, spec).

## (b) Gap analysis against the goal

Goal (`fixes/LEAD.md`): calibrated Chrome frames >50 ms → 0 and >34 ms → ~0; iPhone steady 60 fps under a
finger scroll, no frame >50 ms. Where we are (plain baseline, mobile 6x): ~5 frames >50 ms, ~12 >34 ms, ~100
>20 ms (p95 25.7 ms) per run; iPhone scripted ~52.5 fps, 14-17 frames >34 ms. Wave 1 moves the >20 ms count
(T1, T11) but not the tail.

What costs what, from the engines' point of view:

- **Chrome 6x:** only the main thread is throttled ([Blink `inspector_emulation_agent.cc` /
  `thread_cpu_throttler.cc`](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc),
  vendor source). Every frame >20 ms is main-thread work: script, style, layout, prepaint, paint record,
  layerize, commit. GPU raster/blur is invisible (P5).
- **iPhone:** page scrolling runs in the UI process; a slow frame is either (1) the WebContent main thread's
  rendering update (style, layout, repaint, layer-tree commit) or (2) render-server GPU work, above all
  fixed/sticky `backdrop-filter` layers that re-blur what scrolls beneath them every composite (arch-webkit,
  [WebKit blog](https://webkit.org/blog/3632/introducing-backdrop-filters/), vendor + inference).
- **The multiplier:** an inline write of an *unregistered* custom property on a section/nav root restyles every
  descendant (Blink: descendants that don't use `var()` take a cheaper copy path since Chrome 84 but are still
  visited, [Igalia](https://blogs.igalia.com/jfernandez/2020/08/13/improving-css-custom-properties-performance/),
  engine-author blog; WebKit re-resolves descendants on an inherited change, [WebKit PR 69912](https://github.com/WebKit/WebKit/pull/69912),
  medium; WebKit keeps inherited and non-inherited custom properties in separate maps and flags a
  non-inherited change as `Change::NonInherited`, no descendant recalc, `StyleChange.cpp`, vendor source).
  A registered `inherits: false` property invalidates one element: in the web.dev benchmark (the same
  1,000-element tree for both) a change went from 252 runs/s (inherited) to more than 214,000 runs/s
  (`inherits:false`), i.e. ~3.9 ms → ~4.7 µs per change; the article calls it "848 %", but the ratio is ~850x
  ([web.dev](https://web.dev/blog/at-property-performance), vendor doc; arch-render's "~8x" misread it). Only declarative animations
  (CSS/WAAPI) of transform, opacity, filter, backdrop-filter (Chrome also clip-path, background-color behind
  now-stable flags) run on the compositor; a JS spring writing a value per frame always costs main-thread
  style ([Blink animation README](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/animation/README.md), vendor).

### Architectural moves, ranked by expected gain for the goal

| # | move | expected gain | evidence to collect first |
|---|---|---|---|
| 0 | **Per-frame attribution of 20-50 ms frames** (tooling, not a fix): `Performance.getMetrics` deltas per phase (`RecalcStyleCount`/`LayoutCount` per frame, `RecalcStyleDuration` vs `ScriptDuration`, zero overhead, [pptr metrics](https://pptr.dev/api/puppeteer.metrics)), plus one traced run with `UpdateLayoutTree.elementCount` | decides between moves 1-2 and 3-6; stops us fixing the wrong thing | toolsmith incident; run on baseline and combined wave 1 |
| 1 | **No inherited custom-property writes per frame.** Register every JS-written var with `@property { syntax:'<number>'; inherits:false }` and write it on the element(s) whose rules consume it. With `inherits:false` a descendant's `var()` sees the initial value, so move the write, don't just register. First target on phones: `--morph-fade` (written on `.start-selling-platform`, consumed only by that element: a pure CSS one-liner). Then `--morph` (inline, set by a Svelte template effect at JS 13243 from the spring state; ~26 `var(--morph)` uses in the CSS, so it must be written per consuming element) and, on desktop, `--commission-*`, `--future-shrink`, `--platform-shrink`, `--exit-opacity` (JS fallback) | largest per-frame style cut wherever a write remains; web.dev: ~850x per change on a 1,000-element tree | `elementCount` per `UpdateLayoutTree` during the morph phase and on desktop 6x, before/after |
| 2 | **Declarative instead of per-frame JS** (T12 generalised): every effect that maps scroll position linearly to a value becomes a `view()`/`scroll()` timeline animating transform/opacity/filter only; every JS spring that runs to completion becomes a WAAPI animation with the spring sampled into `linear()` (Chrome 113, Safari 17.2, [Chrome docs](https://developer.chrome.com/docs/css-ui/css-linear-easing-function)) | removes the write, the read and the Svelte flush; threaded on Chrome and Safari 26.4+; also removes Hotjar's MutationObserver work per write (research 01) | hero-exit A/B (pending) is the pilot; then per-effect A/B |
| 3 | **Morph without layout or radius changes** (new topic N2): panel laid out once at full size, revealed with `clip-path: inset(... round R)`; background by cross-fading two static layers with `opacity` (not `color-mix` per frame); backdrop with a fixed radius and an opacity fade. WebKit applies a basic-shape clip-path on a composited layer as a `CAShapeLayer` mask path: geometry update, no layout, no repaint (WebKit `RenderLayerBacking.cpp`, vendor source); avoid combining it with `mask-image` | removes per-frame layout of a panel with ~21 images, the full-panel repaint and the changing-radius re-blur; the morph phase is the iPhone's worst (16-37 fps with a finger) | trace: Layout/Paint per morph frame → 0; iPhone Timelines: no Layout/Paint entries per morph frame; frozen-frame diff at morph 0/.25/.5/.75/1 |
| 4 | **No main-thread infinite animations** (N3): hero CTA orbit (`@property --hero-orbit-angle` → `conic-gradient` on a masked `::before` with `drop-shadow`, 3.3 s loop, CSS 1852-1866, runs whenever not reduced-motion), `background-position` sweeps, SVG `step-end` frame swaps. Neither Blink nor WebKit suspends off-screen main-thread CSS animations of an element in the main frame (arch-render, arch-webkit: no per-element gate found, inference; only `content-visibility`-skipped contents stop, css-contain-2 spec). Rewrite the ring as a static mask with a child conic square rotated by `transform` (composited), and pause all of them off-screen (T6) | removes a style recalc + repaint every frame at the top of the page and at idle; keeps BeginMainFrame from running at display rate for nothing | idle-phase (I-002) `RecalcStyleCount`/s at top and bottom; iPhone idle paint count in the CTA rect; DevTools "non-composited animations" (Chrome 131+) |
| 5 | **Layer diet**: countdown faces (~75 per countdown, ~160 with the panel's) → one strip transform per digit; section-sized `will-change: transform, border-radius` cards (`.commission-card`, `.start-selling-future-card`, `.start-selling-platform-card`) gated by the same media query that disables the shrink on phones; the scene pause flipping `will-change` on whole subtrees (CSS 11754) at ±1 viewport | fewer `Layerize`/commit per frame (main thread, throttled at 6x); less GPU memory and fewer layer-tree commits on WebKit; WebKit also stops overlap testing after an extent-uncertain transform animation, so later siblings get composited too (`RenderLayerCompositor.cpp`, vendor source) | CDP `LayerTree` layer count; `Layerize` time in the trace; iPhone Layers tab (count, memory) |
| 6 | **Smallest always-on backdrop**: the fixed nav's `backdrop-filter: blur(20px)` re-blurs every scroll frame on the GPU (cost ~ area x radius) | iPhone-only (render server), invisible in Chrome | iPhone variant with a semi-opaque solid instead of the backdrop, scripted scroll ABBA: if frames >34 ms drop, the backdrop is worth a design trade |
| 7 | **Reads without layout**: IO for thresholds (T7), IO-gated `ee()`, cached static computed styles; no reads into `content-visibility`-skipped contents | removes the remaining forced style/layout, so the "migrating forced layout" (FINDINGS) finally disappears | `LayoutCount` per scroll frame ≈ 1 (Performance.getMetrics); no `Layout` nested in `FunctionCall` |

`contain`: `contain: style` does not stop custom-property inheritance (it scopes counters/quotes only,
[css-contain-2](https://drafts.csswg.org/css-contain-2/), spec); `layout`/`paint` containment bound layout and
paint propagation but not restyle. Useful around the morph panel (move 3) and the sticky cards, not a fix for
move 1. The page already uses `content-visibility: auto` for inactive sections (engine `deferRendering`);
keep it and keep reads out of those sections.

## (c) Proposed new topics, ranked

| rank | topic | hypothesis | how to verify with the team's tools |
|---|---|---|---|
| N1 | `frame-attribution` (toolsmith, measurement code) | The ~100 frames >20 ms are mostly `UpdateLayoutTree` with large `elementCount` (inherited var writes, main-thread animations), not script. If script dominates instead, the next wave is engine/Svelte work, not CSS. | Add to `verify.mjs`: `Performance.getMetrics` at phase start/end (`RecalcStyleCount`, `LayoutCount`, `RecalcStyleDuration`, `LayoutDuration`, `ScriptDuration`, `TaskDuration`) and an opt-in `--trace` run (devtools.timeline categories via `tools/lib/cdp.mjs`, never MCP) that buckets main-thread time per rAF frame and reports `elementCount`. Measurement-code change: call it out, `npm run test:chrome`. Run once on the plain baseline and once on combined wave 1. |
| N2 | `morph-composited` (cluster B owner) | During the morph each frame lays out and repaints the nav panel (width/height/radius/`color-mix`/changing backdrop radius), restyles the nav subtree through the inherited `--morph`, and runs a Svelte state flush for the spring. A full-size panel revealed by `clip-path: inset(round)`, opacity cross-fades, a fixed backdrop radius and `--morph-fade` registered `inherits:false` removes layout and repaint per frame; sampling the spring into a WAAPI `linear()` animation makes it threaded where the gesture allows. | `fix.mjs ab` morph phase (morph fps, frames >20 ms) plus trace Layout/Paint per morph frame → 0; iPhone scripted scroll bottom phase + Timeline layouts/paint area (as large-area-blur did); frozen-frame diffs at 5 morph values; finger test for feel. |
| N3 | `main-thread-infinite-animations` | The hero CTA orbit (registered-angle conic gradient + mask + drop-shadow) and the remaining `background-position`/SVG step animations tick style + paint every frame, on-screen and off, and keep the main frame loop busy at idle. A transform-rotated child ring plus T6 pauses removes them. | Idle phase (I-002): `RecalcStyleCount`/s at the top and at the bottom; iPhone idle paint count in the CTA rect (Timeline per-rect, as large-area-blur did); screenshot/frozen-frame diff at 0/90/180°; DevTools "non-composited animations" shows none left for the ring. |
| N4 | `custom-property-scope` (desktop mostly; pairs with N2) | Registering the JS-written vars with `inherits:false` and writing them on the consuming element turns each per-frame write from a subtree restyle into a one-element restyle. On phones only `--morph`/`--morph-fade` remain after wave 1; on desktop all shrink/exit vars do. | Trace `elementCount` per `UpdateLayoutTree` before/after; `fix.mjs ab` with a desktop profile (1440x900, 6x) for the desktop vars; parity dump of the settled vars (scroll-engine's parity smoke). |
| N5 | `layer-diet` | ~160 countdown face layers and full-viewport `will-change` cards that never transform on phones cost Layerize/commit per frame and GPU memory; the scene pause's `will-change` flip creates/destroys whole-section layer sets while scrolling (candidate for the residual >34 ms frames). | CDP `LayerTree.layerTreeDidChange` layer count; trace `Layerize`/`Commit` per frame and the frames around `data-start-selling-scene` flips; iPhone Layers tab count/memory; A/B frames >34 ms. Start with the countdown `--layers` variant the owner already prepared. |
| N6 | `nav-backdrop-budget` (iPhone only) | The fixed nav's always-on `backdrop-filter: blur(20px)` (plus the nested lang-switch blur) costs render-server GPU every scroll frame; the phone's residual >34 ms frames partly come from it. | iPhone scripted scroll ABBA, baseline vs a variant with a semi-opaque solid fill; Chrome can't see it (P5). If it wins, it's a design decision (the look changes), so report it rather than land it. |
| N7 | `input-listener-diet` | The always-on `window` `pointermove` (pain, JS 4733) and Svelte's delegated `pointermove` run ~300×/s during a finger scroll on the iPhone (research 01). Attaching them only between `pointerdown` and `pointerup` removes that main-thread load in the scroll phase. | Not visible in scripted scrolls: CDP `Input.dispatchTouchEvent` probe counting handler calls and ack latency, then the finger test. |
| N8 | `morph-scroll-driven` (design decision; after N2) | Replace the push-past-the-end JS scroll-jack by a real runway: sticky pinned nav, `view()` timeline on a spacer, `overscroll-behavior-y: none`, optional `scroll-snap-type: y proximity`. No blocking listeners at all; the morph runs threaded on Safari 26.4+. Changes the interaction (the morph becomes scrubbable), so the user decides. | Finger test (feel), iPhone scripted bottom phase, CDP touch ack probe (all acks non-blocking). |

## (d) Mentoring packet (for the lead to relay)

| owner | advice |
|---|---|
| fix-hero-exit | Correct the README: SDA is threaded on Safari **26.4+** only (26.0-26.3: main thread). Keep blur keyframes `blur(0px)→blur(18px)` (never `none`), or WebKit drops the acceleration. Verify on the phone with Timelines: no per-frame style recalc in the hero. |
| fix-nav-morph | (1) `@property --morph-fade { syntax:'<number>'; inherits:false; initial-value:1 }`: one CSS rule, only `.start-selling-platform` consumes it. (2) Gate `ee()` with an IO on `#profile-showcase` and read its static `position`/`top` once; the `.hero-track` 0.72 test becomes an IO (T7). (3) The finger test must include "drag from above the end into it": Safari has no documented `cancelable:false` intervention. (4) Pause the pre-mounted panel's column animations and countdown until the morph starts (or `content-visibility: hidden` on its content). Then take N2. |
| fix-countdown-idle-raf | Measure the `--layers` variant; better: one `will-change: transform` strip per digit (1 write, 1 layer) instead of per-face transforms. |
| fix-large-area-blur | Done right. The remaining blur cost is the nav's always-on backdrop (N6, iPhone only) and the changing-radius backdrop during the morph (N2); leftover `blur(0)`s are layers, so count them in the Layers tab, not in paint counts. |
| fix-scroll-engine | The measure/mutate split is right but can't move the style recalc. Aim the engine at "only JS-decision effects remain": list the linear scroll→value effects for SDA conversion. Look for the scene-activation `will-change` flip (CSS 11754) in the frames >34 ms. |
| fix-pain-offscreen-notes | Attach `pointermove` only between `pointerdown` and `pointerup` (N7); verify with a CDP touch probe. |
| fix-commission-forced-layout / phone-invisible-shrink (landed) | Nothing on phones. Desktop: the section-level var writes restyle whole subtrees (N4). Identical inline writes are no-ops in Blink, so the profile `d()` reset is cleanup, not a win. |
| everyone | FINDINGS correction: "not LoAF-visible" does not mean "not script" (LoAF is ≥50 ms only). Until N1 lands, don't claim a frame class is style or script without `Performance.getMetrics` counts. |

## Questions answered (scorecard input)

arch-webkit: 12/12 (scroll-driven threading, filter/backdrop mechanics, rIC/LoAF absence in Safari, morph
equivalents, UI-process frame model, passive touch, off-screen throttling, content-visibility and scroll
anchoring, layers, toolbar units, `inherits:false` in WebKit, accelerated property list). arch-render: 12/12
(throttle scope, LoAF threshold and attribution methods, var cost model, same-value writes, narrow writes,
morph, compositor list, containment, batching/IO, Svelte 5 runes, gradient text, off-screen animations,
composited ring). Checked and wrong: one figure (web.dev "8x", actually ~850x). Unverified and flagged
"inference": off-screen animation behaviour in both engines, clip-path shipping version in Chrome, Safari's
touchmove cancelability, the number of toolbar `resize` events.
