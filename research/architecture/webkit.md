# iOS Safari 26 / WebKit rendering notes (arch-webkit)

Research by `arch-webkit` for the architecture team (`fixes/ARCH_TEAM.md`), 2026-10-01. Public sources only;
no project code in any query. Target: iPhone 15 Pro Max, iOS 26.6.1 Safari.

Confidence labels: **spec**, **vendor doc** (WebKit blog / release notes / Web Inspector docs), **vendor
source** (WebKit source on GitHub `main`, read 2026-10-01; iOS 26.6.1 may lag it), **bug** (bugs.webkit.org
or a WebKit commit), **blog** (third party), **inference** (my reasoning from the above; verify on device).

Question numbers follow `arch-lead`'s brief (1-12). The original task's six questions map onto 1, 2, 5, 6, 3
and 4.

## Version landmarks

| Safari | date | relevant to this page | source |
|---|---|---|---|
| 11.3 | 2018 | touchstart/touchmove on window/document/body passive by default | bug 184250 |
| 16.0 | 2022 | `overscroll-behavior` | caniuse |
| 17.2 | 2023 | `linear()` easing | caniuse |
| 18.0 | 2024-09 | `content-visibility`, unprefixed `backdrop-filter` | vendor doc |
| 26.0 | 2025-09 | scroll-driven animations (main thread); content-visibility bug fixes | vendor doc |
| 26.1 | 2025 | iOS 26.0 bug fixed: fixed elements shifting as the toolbar collapses | bug 297779 |
| 26.2 | 2025-12-12 | `scrollend`, Event Timing, LCP | vendor doc |
| 26.4 | 2026-03-24 | **threaded** scroll-driven animations | vendor doc |
| 26.5 | 2026-05-11 | view-timeline 0 %/100 % progress, `scroll` range name, play-state pause, bfcache restore fixes; scroll-snap re-snap fix | vendor doc |
| 27.0 | 2026-09-17 | scroll anchoring (not in 26.x) | vendor doc (caniuse still lists none) |

Still missing in Safari: `requestIdleCallback` (off by default through 27.x), Long Animation Frames API.

## 1. Scroll-driven animations

- **Shipped in 26.0; threaded only since 26.4.** "Safari 26.4 adds support for threaded Scroll-driven
  Animations. Now, the animations driven by scroll position run on the compositor thread." (vendor doc:
  https://webkit.org/blog/17862/webkit-features-for-safari-26-4/). The fix owner's claim is right for
  26.4+. On 26.0-26.3 they ran on the main thread.
- **Which properties go to the compositor:** opacity, transform, translate, rotate, scale, offset-path/
  -distance/-position/-anchor/-rotate, filter, backdrop-filter (vendor source:
  `Source/WebCore/platform/animation/AcceleratedEffect.cpp`, `acceleratedPropertyFromCSSProperty`).
  Everything else runs on the main thread: custom properties, clip-path, colors, background-position.
- **Filter animations fall back to the main thread** when the from/to filter lists don't share function
  order (discrete interpolation) or have drop-shadow mid-list (vendor source, same file; commit
  https://www.mail-archive.com/webkit-changes@lists.webkit.org/msg210369.html). Write `blur(0px)` → `blur(8px)`,
  never `none` → `blur(8px)`.
- **Shorthand reset:** `animation` resets `animation-timeline` to `auto` (reset-only sub-property), so the
  longhands must come after it (MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline). This matches T12.
- **P3 (var() of an animated custom property resolves against the base value):** I found no public WebKit
  bug. WebKit recomputes keyframes when a variable's *cascaded* value changes (bug 248145,
  https://github.com/WebKit/WebKit/commit/5c0b3cb4b2450bcc60e21f512306aaaa56e3e9b3). It doesn't when another
  animation changes it, which fits P3 (inference). Keep keyframes to real properties.
- **Fixed in 26.5** (the phone's 26.6.1 has these fixes): view-timeline progress near 0 %/100 %, the `scroll`
  range name, dynamic `animation-play-state: paused`, timelines after bfcache
  (https://webkit.org/blog/17938/webkit-features-for-safari-26-5/).
- **Detection:** `@supports (animation-timeline: view())` is true from 26.0 but doesn't tell threaded
  (26.4+) from main-thread. Both work; only the cost differs (inference).

**For hero-exit and later SDA topics:** keyframes only on the threaded properties above, matching filter
lists, no `var()` of animated properties. Verify in Web Inspector Timelines on the device: no per-frame
style recalc attributed to the animation.

## 2. `filter: blur()` and `backdrop-filter` cost

- **Every `filter` other than `none` (including `blur(0px)`) and every `backdrop-filter` composites the element**
  (vendor source: `RenderLayerCompositor.cpp` `requiresCompositingForFilters`). That explains P4: a resting
  `blur(0)` is already a GPU layer, so removing it changes little.
- **Core Animation applies filters on the GPU** when they are CA-representable (blur is). Otherwise WebKit
  paints them in software (vendor source: `GraphicsLayerCA.cpp` `setFilters` / `filtersCanBeComposited`).
  Backdrops use a dedicated `CABackdropLayer` (`updateBackdropFilters`).
- **A changing radius** costs a style recalc, a layer commit and a GPU re-blur every frame. The backing store
  itself should only repaint when the layer's bounds change, which a growing blur outset causes
  (inference, consistent with P4's observed repaints).
- **CSS transitions/animations of `filter`/`backdrop-filter`** with matching lists run as CA animations off the
  main thread (vendor source: `GraphicsLayerCA` animation acceleration; AcceleratedEffect). A per-frame JS or
  custom-property write stays on the main thread.
- **Nested backdrop-filter:** a filter / opacity<1 / mask / clip-path / backdrop-filter / mix-blend-mode
  ancestor is a Backdrop Root. The child's backdrop is only what is painted between that root and the child
  (spec: https://drafts.csswg.org/filter-effects-2/ "Backdrop Root"). That's why P8's removal changed the
  pill colour. Its cost is small (inference).
- **Area × radius** drives the cost; backdrop "forces the engine to perform more rendering passes"
  (vendor doc: https://webkit.org/blog/3632/introducing-backdrop-filters/). Third-party guidance: cap large
  surfaces near 20 px and keep a few glass layers per viewport (blog:
  https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026).

**Cheaper patterns:** a fixed radius with an `opacity` fade of the blurred layer. A cross-fade between the
sharp layer and a pre-baked blurred image (no runtime blur). Shorter blur tails (T10). A smaller blurred area.

## 3. `content-visibility: auto` and `contain`

- Supported since Safari/iOS 18.0 (https://caniuse.com/css-content-visibility). 26.0 fixed wrong
  `getBoundingClientRect` in skipped subtrees, hit-testing into skipped content, floats/carets painted in
  skipped subtrees, find-in-page (https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
- **No scroll anchoring in 26.x** (https://caniuse.com/css-overflow-anchor; announced for 27.0:
  https://webkit.org/blog/18325/webkit-features-for-safari-27-0/). A placeholder size that differs from the
  real size above the viewport therefore moves content on the phone. Use `contain-intrinsic-size: auto <px>`
  (`auto` remembers the last rendered size).
- The first time a section becomes relevant, its style, layout and paint run in that frame: a burst like T8's
  mount (inference).

## 4. Layers and `will-change`

- A `will-change` for a compositing property gives the element its own layer. **On iOS under memory
  pressure/warning, WebKit uses the Conservative policy, and will-change no longer composites** (vendor
  source: `RenderLayerCompositor.cpp` `requiresCompositingForWillChange`, `updateCompositingPolicy`), so
  layer counts can vary between runs.
- **Overlap:** content painted after a composited layer that overlaps it must composite too. A transform
  animation with uncertain extent turns overlap testing off for the later siblings in that stacking
  context: a layer explosion (vendor source: `animationCausesExtentUncertainty`, `testingOverlap`).
- Layers trade repaint for memory; "creating too many layers can have disastrous results on
  memory-constrained devices" (vendor doc: https://webkit.org/blog/8262/visualizing-layers-in-web-inspector/).
- `will-change: width/height` isn't expected to composite: only compositing-capable properties trigger it
  (my recollection of `WillChangeData`, not re-verified).

**Countdown (~75 digit layers):** drop per-digit `will-change`, or use one layer per strip, clipped by an
overflow container. Verify in the Web Inspector Layers tab (count, memory, reasons per layer:
https://webkit.org/web-inspector/layers-tab/).

## 5. Toolbar collapse and viewport units

- `vh` = `lvh`; `svh`/`lvh` are stable; only `dv*` track the toolbar, and MDN warns they can "cause the
  content to resize while a user is scrolling ... performance hit"
  (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length).
- `innerHeight` / `visualViewport.height` change and window `resize` fires. I found no authoritative per-frame
  vs end-of-transition timing for iOS 26. Treat the team's own T9 observation as the data (unverified).
- iOS 26.0 bug: fixed elements shifted as the toolbar collapsed; fixed in iOS 26.1 (bug
  https://bugs.webkit.org/show_bug.cgi?id=297779).

**Practice:** lvh/svh for layout, no dvh on large boxes, height-only `resize` debounced (T9), and read
`visualViewport` only where overlay placement needs it.

## 6. Passive touch, scroll-jacking, CSS alternatives

- window/document/body touch listeners are passive by default since iOS 11.3; `{passive:false}` opts back in
  (bug https://bugs.webkit.org/show_bug.cgi?id=184250).
- iOS classifies touches in the UI process against per-layer touch-event regions. A non-passive listener on
  window makes the whole page synchronous, so the scroll waits for the WebContent main thread (Igalia:
  https://blogs.igalia.com/fujii/asynchronous-scrolling-for-touch-events-in-wpe-and-webkitgtk/, plus inference).
  I found no WebKit source for a Chrome-style "touchmove non-cancelable once scrolling" intervention.
- `overscroll-behavior` since Safari 16; `none` on the root stops the rubber band
  (https://caniuse.com/css-overscroll-behavior).
- **CSS replacement for a "push past the end" jack** (inference): add real scroll distance (a spacer), pin the
  morph with `position: sticky`, and drive it with `animation-timeline: view()` on the spacer (threaded on 26.4+).
  Optionally add `scroll-snap-type: y proximity`. Arm any `{passive:false}` listener only while the morph is engaged.
  Scripted scrolls can't measure this; use the finger test.

## 7. Frame timing APIs

- `requestIdleCallback`: disabled by default through Safari 27.x (https://caniuse.com/requestidlecallback),
  so a setTimeout fallback is required.
- Long Animation Frames: not in any Safari (https://caniuse.com/mdn-api_performancelonganimationframetiming).
- 26.2 added Event Timing, LCP and `scrollend` (https://webkit.org/blog/17640/webkit-features-for-safari-26-2/).
  Vendor `onscrollend` handlers now also run on iPhone 26.2+ (inference).
- rAF and CSS animations drop to 30 fps in Low Power Mode (bug https://bugs.webkit.org/show_bug.cgi?id=215745;
  DOM timers too: https://bugs.webkit.org/show_bug.cgi?id=169213). **Keep the test phone out of Low Power
  Mode.** Pages render near 60 Hz by default even on ProMotion (https://bugs.webkit.org/show_bug.cgi?id=173434).
- On device: Web Inspector Timelines "Rendering Frames" (per frame: script, style, layout, paint, composite)
  and the Layers tab.

## 8. `@property` with `inherits: false`

WebKit keeps inherited and non-inherited custom properties in separate maps
(https://github.com/WebKit/WebKit/commit/06e3540a49d0e77e83fd02402745c1fd6e7e8a8c). Style diffing marks a
non-inherited difference `Change::NonInherited` and an inherited one `Change::Inherited`, which recalcs
descendants (vendor source: `Source/WebCore/style/StyleChange.cpp` `determineChanges`). So a per-frame write
of a registered non-inherited property should restyle only that element (inference, strong). Write it on the
element that uses it: descendants see the initial value. Unregistered custom properties always inherit.

## 9. What runs threaded

Threaded: opacity, transform, translate, rotate, scale, offset-*, filter, backdrop-filter. Main thread:
clip-path (on a composited layer a basic shape is a CAShapeLayer mask, so no repaint: vendor source
`RenderLayerBacking.cpp` `updateMaskingLayer`), background-position (repaint every frame), custom properties,
colors.

## 10. Morph (pill → full-screen panel)

Current: width/height (layout), `color-mix` background (repaint), backdrop radius (re-blur + bounds), all per
frame from a JS spring. Composited equivalent (vendor source + inference):
1. Mount the panel at full size and animate `clip-path: inset(... round R)`. It's a shape-mask geometry update
   with no layout and no content repaint (not threaded, so it still costs main-thread style + commit). Avoid
   adding `mask-image`: with it, the clip is painted into the mask layer every frame.
2. Background: cross-fade two layers with `opacity`.
3. Backdrop: fixed radius, fade the layer.
4. Drive with WAAPI, with the spring sampled into `linear()`; opacity/transform then run threaded.
`transform: scale` with counter-scaled content is threaded but distorts the radius and the backdrop. View
Transitions snapshot and block interaction, so they don't fit a gesture-driven morph.

## 11. Frames > 20 ms with little script

On iOS the scrolling tree and layer tree live in the UI process. A slow frame comes from either:
(1) the main-thread rendering update: style recalc (inherited custom-property writes), layout, repaint of changed
layers, layer-tree commit; or (2) the render server's GPU composite: every fixed/sticky `CABackdropLayer`
re-blurs what scrolls under it on every frame. Size (2) on the phone with a variant whose always-on backdrops
are replaced by semi-opaque solids (inference).

## 12. Off-screen throttling

WebKit's rAF throttling reasons are VisuallyIdle, OutsideViewport (for *frames*), LowPowerMode and
NonInteractedCrossOriginFrame (bug https://bugs.webkit.org/show_bug.cgi?id=204713). Repeating DOM timers
that only restyle elements outside the viewport are throttled (trac r176496,
https://trac.webkit.org/timeline?authors=&daysback=4&from=2014-11-21). I found no per-element suspension of
off-screen CSS animations, so assume a main-thread `@property`/conic-gradient or `background-position` loop keeps
costing style + paint off-screen (inference). Accelerated CA animations tick in the render server. Keep T6
(IO pause per element).

## Five actionable recommendations

1. **nav-morph:** full-size panel + `clip-path: inset(round)`, opacity cross-fade for the background, a fixed
   backdrop radius with an opacity fade, WAAPI with a `linear()` spring. Removes per-frame layout and repaint.
2. **Scroll-driven exits:** keyframes only on opacity/transform/filter with matching lists; longhands after
   the shorthand. Threaded on 26.4+.
3. **Always-on backdrops:** size their GPU cost on the phone (solid variant) and shrink the area and radius.
   Chrome can't see it (P5).
4. **Countdown layers:** no per-digit `will-change`; one clipped strip layer. Check the Layers tab.
5. **Custom-property writes per frame:** register them `inherits: false` and write them on the element that uses them.
