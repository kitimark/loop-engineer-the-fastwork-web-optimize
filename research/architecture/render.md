# Rendering pipeline and Svelte 5: research notes (arch-render)

2026-10-01, `arch-render` (architecture team, `fixes/ARCH_TEAM.md`). This is public-source research only:
no Chrome runs, no iPhone, no project code in any query. Every claim names its source and a confidence
label: **spec**, **vendor source** (engine code read on the day), **vendor doc**, **blog**, **bug/PR**,
or **inference** (mine). Numbering follows `arch-lead`'s question list.

## Headline

1. **The "frames >20 ms are style/paint, not script" conclusion is unproven.** LoAF only reports frames
   over 50 ms, so a 20-50 ms frame is invisible to it whatever it spent its time on (Q9). DevTools CPU
   throttling slows only the renderer main thread, so at 6x these frames are main-thread-bound by
   construction: script, style, layout and paint recording, in unknown shares (Q10). Measure the split
   before choosing fixes (Q9: `Performance.getMetrics` deltas, an afterFrame probe, or a one-off trace).
2. **An unregistered custom property written on a section or nav root restyles its whole subtree**
   (it inherits). Register the per-frame vars with `@property { inherits: false }` and write each one
   on the element that consumes it (Q1, Q2).
3. **A per-frame JS write is never composited**, whatever the property. Only declarative animations
   (CSS or WAAPI) of transform, opacity, filter, backdrop-filter (and, per Chromium flags now stable,
   background-color and clip-path) run on the compositor. Precompute springs into `linear()` and use
   WAAPI or scroll-driven animations (Q5, Q11).
4. **Same-value `setProperty` is already a no-op for style in Blink** (source): T3 saves parsing and
   bindings, not restyle. Rounding the written values makes near-identical writes true no-ops (Q3).
5. **Off-screen infinite non-composited animations keep ticking** in the main frame. Only
   `content-visibility` (skipped contents' animations don't advance, spec) or an explicit pause stops
   them (Q4, Q12).

## Answers

### Q1. What a custom-property write restyles
- **Blink:** unregistered custom properties inherit, so a change on element E restyles E's descendants.
  Since Chrome 84, descendants whose styles don't reference `var()` take a cheaper copy-from-parent
  path, but they are still visited. https://blogs.igalia.com/jfernandez/2020/08/13/improving-css-custom-properties-performance/
  (**blog** by the engine author).
- **`@property` with `inherits: false`:** only the element itself is invalidated. The web.dev benchmark
  measured about 8x more runs/s than an inheriting registered property; registration itself costs about
  2 % for inheriting properties. https://web.dev/blog/at-property-performance (**vendor doc**).
- **WebKit:** an inherited style change "re-resolves all descendants"
  (https://github.com/WebKit/WebKit/pull/69912, **bug/PR**). That custom-property changes take this path
  is **inference**, medium confidence.
- **Catch:** with `inherits: false`, a descendant's `var(--x)` sees the initial value, not the
  ancestor's. Write the var on the element(s) that use it.
- **Recommendation (topics 4, 5, 7, nav-morph):** register every per-frame var
  (`syntax: '<number>'`, `inherits: false`, `initial-value: 0`) and move the write to its consumer.
  Verify with `UpdateLayoutTree` `elementCount` per frame (Q9c).

### Q2. Is writing on the narrowest element cheaper?
- Yes, in proportion to the subtree. One measurement: 76 ms setting the var on a parent of 25k
  children vs 1.9 ms on the child. https://lisilinhart.info/posts/css-variables-performance
  (**blog**, older Chrome). This is consistent with the web.dev benchmark above.
- **Recommendation:** as in Q1. The biggest wins are vars written on section or nav roots with image
  or text-heavy subtrees.

### Q3. Does a same-value write invalidate?
- **Blink:** `AbstractPropertySetCSSStyleDeclaration::SetPropertyInternal` returns early with
  `DidMutate(kNoChanges)` when the parse result is `kUnchanged`: no invalidation, no mutation record.
  Removing an absent property (`el.style.height = ''` repeated) is also a no-op.
  https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/css/abstract_property_set_css_style_declaration.cc
  (**vendor source**).
- **WebKit:** `setProperty`/`setCustomProperty` return a "changed" bool that callers use to skip the
  mutation (https://github.com/WebKit/WebKit/commit/8687381bc34b4a4d1ce04492f9569ddaaa310cf2). That the
  CSSOM setter also skips invalidation is **inference**, medium confidence.
- **Cost that remains:** a JS→C++ call and a string parse per write.
- **Recommendation:** keep T3, but expect only small Chrome wins from identical writes. Round written
  values (0.001 for ratios, 0.5 px for lengths) so easing tails stop writing sooner.

### Q4. Containment and `content-visibility`
- `contain: style` scopes counters and quotes only. It does **not** stop custom-property inheritance.
  `contain: layout` makes the box "totally opaque for layout"; `contain: paint` clips descendants.
  Neither reduces restyle. https://drafts.csswg.org/css-contain-2/ (**spec**).
- `content-visibility: auto` skips style, layout and paint of the element's **contents** while they
  aren't relevant to the user. While they are skipped, "CSS transitions and animations ... do not
  advance in their timeline" (css-contain-2, **spec**). Safari supports it from 18.0:
  https://webkit.org/blog/15865/webkit-features-in-safari-18-0/ (**vendor doc**).
- **Pitfalls (spec):**
  - The element itself still restyles; only its contents are skipped.
  - The UA avoids styling or laying out skipped contents "until ... script finally asks for it". A
    rect or computed-style read on a descendant forces that subtree, which undoes the benefit.
- **Recommendation (topic 12):** use `content-visibility: auto` plus `contain-intrinsic-size: auto <h>`
  as the per-section gate. Never read rects of descendants of a possibly-skipped section; read the
  section box instead.

### Q5. Compositor properties (and scroll-driven animations)
- "Currently transform, opacity, filter, and backdrop-filter can be mutated on the compositor thread."
  https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/animation/README.md
  (**vendor doc**).
- Chromium's `runtime_enabled_features.json5` on main lists `CompositeBGColorAnimation` and
  `CompositeClipPathAnimation` as `status: "stable"` (**vendor source**, read 2026-10-01; I did not
  find which version shipped them).
- Custom properties never animate on the compositor, even registered ones:
  https://www.bram.us/2023/02/01/the-gotcha-with-animating-custom-properties/ (**blog**, Chrome
  DevRel). `background-position` always runs on the main thread and repaints.
- Scroll-driven animations follow the same property rule.
- Diagnosis: DevTools Performance marks non-composited animations with their failure reasons (Chrome
  131+). https://www.bram.us/2024/12/10/spot-non-composited-animations-in-chrome-devtools/ (**blog**).
- **Recommendation (hero-exit):** keyframes animate only transform, opacity and filter directly, never
  a `--var`. This is also the fix for P3.

### Q6. `background-position` gradient text
- It repaints every frame; web.dev lists `background-position` among paint-triggering animations.
  https://web.dev/articles/animations-guide (**vendor doc**).
- No composited technique moves a gradient relative to `background-clip: text` glyphs. Blogs that say
  `@property` stop or angle animations run "on the compositor" contradict Chromium's README.
- **Recommendation (layout-animations, doc sweep):**
  - Now: an element-level IO pause (T6), plus `content-visibility` on the section.
  - If design accepts: cross-fade two static gradient-text copies with `opacity`, or reveal one over a
    plain copy with a CSS or WAAPI `clip-path: inset()` animation (Chrome: composited per the stable
    flag).
- Verify with Paint events per frame and the iPhone paint count.

### Q7. Batching reads and writes
- Read everything, then write everything, in one rAF. Reads at the start of the rAF see the previous
  frame's clean layout. https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
  (**vendor doc**); FastDOM, https://github.com/Financial-Times/fastdom.
- IntersectionObserver entries are computed after layout in "update the rendering" and delivered as
  snapshots, so reading them forces nothing (https://w3c.github.io/IntersectionObserver/, **spec**).
  ResizeObserver sizes likewise (https://drafts.csswg.org/resize-observer/, **spec**).
- Why forced layout "migrates": the first read after any write pays for all pending invalidation, so
  removing one reader hands the bill to the next one. It disappears only when no read follows a write
  in the frame (**inference**, matches FINDINGS).
- **Clean-frame checklist:**
  1. scroll, touch, IO and RO handlers only record values and schedule the rAF, with no DOM writes.
  2. One rAF: all measures (cached `innerHeight`, rects, `scrollY`), then all mutates (T9).
  3. No layout reads in microtasks after the mutates. Svelte effects flush in one; so do
     third-party MutationObservers.
  4. Threshold reads become IO (T7); size reads become RO plus cached offsets and `scrollY`
     arithmetic.
  5. Write only changed, rounded values.
  6. Verify: `LayoutCount`/`RecalcStyleCount` delta per frame ≈ 1, and no `Layout` trace event nested
     inside `FunctionCall`.

### Q8. Svelte 5 runes in per-frame code
- Read in the Svelte source (`packages/svelte/src/internal/client/reactivity/sources.js`,
  `equality.js`, main, **vendor source**):
  - Runes-mode `$state` uses `equals` (`value === this.v`), and `internal_set` returns at once when
    the value is equal. An identical primitive write is free.
  - A fresh `[]` or `{}`, proxied by `set(s, v, true)`, always differs, so it always triggers
    (confirms P9). Legacy mutable sources use `safe_equals`: any object counts as changed.
  - A changed write runs `Batch.ensure()`, marks reactions dirty and schedules effects. They flush in
    a microtask, where deriveds recompute and each-blocks re-diff.
- https://svelte.dev/docs/svelte/best-practices (**vendor doc**): `$state.raw` for replaced data,
  avoid updating state in effects.
- **Recommendation:**
  - Keep animation-rate values out of `$state`: write `element.style` directly from the rAF (in an
    `{@attach}`/action or a plain closure).
  - Guard array and object writes on change.
  - `untrack` only stops dependency tracking; it doesn't make a write cheaper.
  - `svelte/motion` Spring and Tween write state every tick.

### Q9. Attributing 20-50 ms frames
- LoAF reports frames whose rendering update is delayed beyond 50 ms, and attributes scripts of
  >= 5 ms only. https://developer.chrome.com/docs/web-platform/long-animation-frames,
  https://w3c.github.io/long-animation-frames/ (**vendor doc, spec**).
- Methods, cheapest first:
  - **(a)** CDP `Performance.getMetrics` before and after the scroll phase. Diff `ScriptDuration`,
    `RecalcStyleDuration`, `LayoutDuration` and `TaskDuration`; the remainder is roughly prepaint,
    paint, commit and other. `LayoutCount`/`RecalcStyleCount` per frame > 1 means forced work. Field
    list: https://pptr.dev/api/puppeteer.metrics (**vendor doc**).
  - **(b)** In-page afterFrame probe: `rAF(() => setTimeout/postMessage(mark))` measures that frame's
    style, layout and paint, and can join the rAF-delta logger.
    https://nolanlawson.com/2018/09/25/accurately-measuring-layout-on-the-web/ (**blog**).
  - **(c)** A one-off CDP trace with categories `devtools.timeline` and
    `disabled-by-default-devtools.timeline`. Events: `FunctionCall`, `EvaluateScript`,
    `UpdateLayoutTree` (`args.elementCount`), `Layout` (`beginData.dirtyObjects`/`totalObjects`),
    `PrePaint`, `Paint`, `Layerize`, `Commit`. For which write invalidated which node, add
    `disabled-by-default-devtools.timeline.invalidationTracking` (`StyleRecalcInvalidationTracking`);
    it is heavy, so not for A/Bs. Names:
    https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/trace/types/TraceEvents.ts
    (**vendor source**).
- Any of these via `tools/lib/cdp.mjs` is a measurement-code change: toolsmith, and call it out (Hard
  rule 6). Never use the MCP trace (Hard rule 8).

### Q10. What CPU throttling slows
- `InspectorEmulationAgent::setCPUThrottlingRate` calls
  `ThreadCPUThrottler::GetInstance()->SetThrottlingRate()`. The throttler interrupts the thread that
  created it (SIGUSR2 plus a busy-spin on POSIX), and that thread is the renderer main thread.
  Compositor, raster workers and the GPU process run at full speed.
  https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc,
  `.../platform/scheduler/common/thread_cpu_throttler.cc` (**vendor source**).
- Consequences:
  - At 6x, frames >20 ms are main-thread work, which includes script.
  - GPU cost (blur, backdrop-filter, big layers) is invisible in Chrome (P5 confirmed).

### Q11. The morph (one var driving width, height, radius, background and backdrop blur)
- Today's per-frame cost: the nav subtree restyles (inherited var, about 20 images), the panel lays
  out, and the changing area repaints and re-blurs (**inference**).
- **Cheapest equivalent:**
  - Lay the panel out once at its final size.
  - Reveal it with `clip-path: inset(... round R)` and move the content with `transform`.
  - Cross-fade two static background layers with `opacity` instead of animating `color-mix`.
  - Keep the blur radius constant.
- Run it declaratively: sample the spring into `linear()` (Chrome 113, Safari 17.2,
  https://developer.chrome.com/docs/css-ui/css-linear-easing-function, **vendor doc**) and play it with
  WAAPI. Per-frame JS writes stay main-thread; if you keep them, limit them to transform and opacity
  (no layout, no paint).
- Avoid scale plus counter-scale, which distorts the radius and the children. View Transitions don't
  fit a continuous, input-driven morph (**inference**).
- **Verify:** a Q9c trace (Layout and Paint per morph frame), a frozen-frame diff, and a visual check
  that the clip also bounds the backdrop blur (**inference**).

### Q12. Infinite non-composited animations off-screen; the rotating ring
- **(a) Off-screen:**
  - I know of no Blink mechanism that throttles main-thread CSS animations of off-screen elements in
    the main frame; off-screen throttling targets iframes. Style is sampled every frame and the frame
    loop stays at display rate (**inference**; consistent with the Blink animation README, the team's
    T6 win and public bug reports).
  - `content-visibility` skipped contents don't advance (**spec**), and `display: none` stops them.
  - Otherwise pause per element with an IO (T6).
  - WebKit: see `arch-webkit`.
- **(b) Ring:**
  - Keep the ring element static (mask with `mask-composite: exclude`, or `overflow: hidden` with a
    border-radius).
  - Put a static `conic-gradient(from 0deg ...)` on a centred child square whose side is at least the
    ring box's diagonal, and animate `transform: rotate()` on the child. For a centred conic this
    equals animating `from var(--angle)`.
  - The rotation runs on the compositor and rasters once. `drop-shadow` on the ancestor becomes a
    per-frame GPU cost, not a main-thread cost (**inference**; iPhone check). If it costs, bake it as a
    static blurred copy.

## Scorecard input

This check-in, 12 questions were answered, sent to `arch-lead` in 4 batches.

| claim | status | label | what it means |
|---|---|---|---|
| FINDINGS "frames >20 ms are style/paint, not script" | challenged | spec/vendor doc (Q9) | Re-measure with Q9a/b before relying on it. |
| T3 "write only on change" as a style saver in Chrome | narrowed | vendor source (Q3) | Blink already no-ops identical writes; T3 saves parsing and calls. |

New topic candidates:
- **`vars-inherits-false`:** register and narrow the per-frame custom properties.
- **`frame-attribution`:** a toolsmith job for the Q9a/b probes.
- **`morph-composited`:** Q11.
