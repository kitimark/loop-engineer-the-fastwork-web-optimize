# Open-source rendering libraries: mechanisms, WebKit fit, PoC shortlist (arch-oss-survey)

By `arch-oss-survey` (architecture team), 2026-10-01, with `de-oss-map` (design engineering), who mapped
fastwork's own code (part 2). The user asked to research the open-source libraries with the best rendering
performance, understand how they get it, and try a PoC on fastwork. This note is the research half: the PoCs in
§3 go to fix owners the lead spawns.

**Method.** Static reading of the published source, not marketing. Every library was downloaded from unpkg/npm or
GitHub tags into the session scratchpad (never into the repo) and grepped for exact lines. WebKit facts come from
WebKit `main` on GitHub (read 2026-10-01; iOS 26.6.1 may lag it), the WebKit blog and MDN browser-compat-data.
No Chrome, no iPhone, no locks. No project code or personal data went into any query. Quotes are short; file:line
refers to the version named in the table.

Labels: **source** (library or WebKit source, file:line), **vendor doc** (WebKit blog, library README),
**spec**, **BCD** (MDN browser-compat-data 8.1.4), **inference** (mine; check on the device).

| library | version read | license |
|---|---|---|
| GSAP core + ScrollTrigger | 3.15.0 (`dist/gsap.js`, `dist/ScrollTrigger.js`) | "Standard 'no charge' license" (package.json:66; not OSI open source) |
| Motion (`motion`, `framer-motion`, `motion-dom`) | 13.4.6 (tag v13.4.6, `packages/*/src`) | MIT |
| Lenis | 1.3.26 (`dist/lenis.mjs`) | MIT |
| Locomotive Scroll | 5.0.1 (TS from the published source map; depends on `lenis` 1.3.17) | MIT |
| anime.js | 4.5.0 (tag v4.5.0, `src/`) | MIT |
| fastdom | 1.0.12 (last release 2024-02-20) | MIT |
| scroll-timeline polyfill | `scroll-timeline-polyfill` 1.1.0 (flackr/scroll-timeline) | Apache-2.0 |
| Svelte / SvelteKit | svelte 5.57.1, kit 2.70.3 | MIT |

## 0. Verdict in six lines

1. **No library makes WebKit render less.** GSAP, Lenis, Locomotive, fastdom, anime's `onScroll` and Motion's JS
   paths are all main-thread JavaScript that writes inline styles or calls `scrollTo`. Fastwork's own engine already
   does what they do (one rAF, cached reads, IO gates). On the iPhone the slow frames are style, composite and
   raster, with ~1 ms of JS (P-011, F-033). So re-scheduling JS gains about 0 there.
2. **The mechanism that does matter is "hand the animation to Core Animation"**: CSS transitions and animations,
   WAAPI, and CSS scroll-driven timelines on `transform`/`opacity`/`filter`/`backdrop-filter`. Motion and Svelte 5
   are thin wrappers over exactly this. Fastwork can write it directly with no dependency.
3. **Surprise 1: on iOS 26.6.1, `linear(<points>)` and `steps()` easings make a time-based animation main-thread.**
   WebKit's legacy Core Animation path refuses them, and threaded time-based animation is not in Safari 26.x (§1.3).
   So Motion's springs-as-`linear()` are not accelerated on the phone, and by source neither is our own
   large-area-blur T10 transition in the wave-1 base, nor the team's "spring as `linear()`" plans. Use a
   `cubic-bezier()` or Svelte-style sampled keyframes instead (F-048). The device check is P0 (§3).
4. **Surprise 2: Lenis and Locomotive v5 make the whole page a synchronous touch region on iOS for its lifetime**,
   even with `syncTouch: false`, where touch is not smoothed at all. They add non-passive `wheel`, `touchstart`,
   `touchmove` and `touchend` listeners on `window` at construction. This is the y≈1960 mechanism (P-011), made
   permanent.
5. **Surprise 3: Motion's "hardware-accelerated" scroll is a plain native `ScrollTimeline` in the best case, and
   heavier than our CSS otherwise.** `useScroll()` always also runs a JS scroll tracker. Its JS fallback reads the
   `offsetTop` chain on every scroll frame. Its accelerated list contains `clipPath` and `backgroundColor`, which
   WebKit does not accelerate. Hero v2 (T12) already does the best case in plain CSS.
6. **PoC shortlist (§3), agreed with de-oss-map:** listener scope (anti-Lenis), blur easing back to `cubic-bezier`,
   countdown as Core Animation keyframes, morph as Core Animation pieces (diagnostic), and a conditional
   refresh-time rect cache. Each is a dependency-free re-implementation of a library mechanism; vendoring any
   library is never the better PoC here. listener-scope runs now; the three CA PoCs wait for a 10-min phone
   check (P0).

## 1. Mechanism table

### 1.1 Library × mechanism

"Thread (iOS 26.6.1)" is where the per-frame work runs on the phone: **main** (page JS or main-thread style),
**CA** (Core Animation, render server, no main-thread work per frame), **threaded SDA** (WebKit's threaded
scroll-driven animations, 26.4+). "Verdict" ranks the mechanism for iPhone 15 Pro Max Safari specifically:
**+** helps, **0** no effect on the frames we measure, **−** hurts.

| library | mechanism | thread (iOS 26.6.1) | layout reads | listeners | writes per frame | toolbar resize | verdict | evidence |
|---|---|---|---|---|---|---|---|---|
| GSAP core | own ticker on rAF (setTimeout fallback); lagSmoothing clamps a gap > 500 ms to 33 ms; sleeps after 120 idle frames **only** if it is the sole ticker listener | main | none in the ticker | – | inline `transform` string; `force3D:"auto"` = `translate3d` only while 0 < ratio < 1, 2D at the ends (layer demoted at tween end); no `will-change` anywhere | – | 0 | `gsap.js:1271-1275` `_req = _raf \|\| function (f) { return setTimeout(…` ; `:2500-2508` `if (_config.autoSleep && _ticker._listeners.length < 2) … _ticker.sleep()`; `:5076` `use3D = force3D === "auto" && ratio && ratio !== 1 \|\| force3D === true` |
| ScrollTrigger | positions cached at `refresh()` (`getBoundingClientRect` once per trigger); per scroll only arithmetic; refresh is revert-all, measure, re-apply, deferred to `scrollEnd` while scrolling; no ResizeObserver | main (without `normalizeScroll` the update runs **inside the scroll event**) | at refresh only | `scroll` on document, passive | `scrub:true` writes in the scroll event; `scrub:<n>` is an `expo` tween on the ticker | **ignored on touch devices unless width changes or \|Δh\| > 25 % of innerHeight** | 0 (fastwork has it: N12, T9) | `ScrollTrigger.js:1431` `bounds = _getBounds(element)`; `:970-973` `{ passive: !nonPassive`; `:2636` `_ignoreMobileResize = Observer.isTouch === 1`; `:1089` `Math.abs(_win$1.innerHeight - _baseScreenHeight) > _win$1.innerHeight * 0.25` |
| ScrollTrigger (always on) | permanent no-op rAF loop and a 250 ms `setInterval` sync | main | – | – | – | – | − (idle rAF/s ≠ 0) | `ScrollTrigger.js:758-759` `_rafBugFix = function _rafBugFix() { return _enabled && requestAnimationFrame(_rafBugFix); }`; `:2704` `setInterval(_sync, 250)` |
| ScrollTrigger pin | `position:fixed` swap at the range edges (style swap, not per frame) plus a `.pin-spacer`; `pinType:"transform"` for custom scrollers writes `translate3d` per frame | main at the edges | `getBoundingClientRect` at refresh | – | fixed/static swap at the edges | – | 0; native `sticky` is better on iOS (scrolling tree) | `ScrollTrigger.js:1628` `… isViewport && "fixed") === "fixed"`; `:2349` `_setState(isActive \|\| isAtMax ? pinActiveState : pinState)` |
| ScrollTrigger `normalizeScroll` | JS scroll on touch: non-passive touch/wheel, momentum tween, `matrix3d` on content; iOS clamp keeps scroll ≥ 1 | main | – | **non-passive** touch + wheel | `matrix3d` every frame | – | − | `ScrollTrigger.js:3004` `vars.preventDefault = vars.isNormalizer = vars.allowClicks = true`; `:3049` `content.style.transform = "matrix3d(…` ; `:3043` clamp `_fixIOSBug ? 1 : 0` |
| Motion `animate()` | hybrid: WAAPI (`element.animate`) when the value is on `acceleratedValues` and the options allow it, else a JS animation on the frameloop; springs and JS easings become `linear(…)` sampled every 10 ms (springs 30 ms) when `linear()` is supported | **CA only for opacity/transform/filter with a cubic-bezier or keyword easing; main for springs (`linear()`, §1.3), `clipPath`, `backgroundColor`, and for x/y/scale shorthands (JS)** | none | – | none (WAAPI) or inline style (JS) | – | + for cubic-bezier opacity/transform/filter; 0/− for springs on iOS 26.x | `motion-dom/src/animation/waapi/utils/accelerated-values.ts:4-10` `["opacity","clipPath","filter","transform","backgroundColor"]`; `waapi/utils/linear.ts:3-16` `resolution = 10`; `generators/spring.ts:464-478` `generateLinearEasing(…, 30)` |
| Motion `scroll()` native | `scroll(animation)` sets `animation.timeline = new ScrollTimeline/ViewTimeline` when `window.ScrollTimeline` exists and the offset maps to a named range (`contain`, Enter/Exit/Any/All presets) | threaded SDA (26.4+) for accelerated properties | none per frame | – | none | handled by WebKit | + but identical to plain `animation-timeline` CSS (T12) | `framer-motion/src/render/dom/scroll/attach-animation.ts:17-26`; `motion-dom/src/animation/NativeAnimation.ts:264-270` `this.animation.timeline = timeline` |
| Motion `scroll()` JS / `useScroll` | callbacks and unmappable offsets: a `scroll` listener schedules `frame.read(measureAll)`; with `target`/`offset` **every scroll frame walks the `offsetTop` chain and reads `clientHeight`**; `useScroll()` starts this tracker **even when** the native path is used; `observeTimeline` polls `currentTime` every frame with keepAlive | main | per scroll frame (`offsetTop`, `clientHeight`, `scrollHeight`) | `scroll` (no options; not cancelable anyway), `resize`, ResizeObserver for non-root containers | via frameloop render step | re-measured on `resize` | − (more reads than fastwork's engine) | `render/dom/scroll/on-scroll-handler.ts:64-71`; `offsets/inset.ts:6-11` `inset.y += current.offsetTop; current = current.offsetParent`; `value/use-scroll.ts:112-134`; `motion-dom/src/scroll/observe.ts:21` `frame.preUpdate(onFrame, true)` |
| Motion frameloop | one rAF batcher, steps `setup, read, resolveKeyframes, preUpdate, update, preRender, render, postRender`; sleeps when no step has work | main | reads batched before writes | – | – | – | 0 (= T9 measure/mutate) | `motion-dom/src/frameloop/order.ts:3-12`; `batcher.ts:67-80` |
| Lenis | smooth scroll as a damped lerp (`lerp` 0.1) that calls `window.scrollTo({behavior:"instant"})` every animated frame; native scroll stays authoritative; touch is native unless `syncTouch`; dimensions from a 250 ms-debounced `resize` + ResizeObserver; no per-frame layout reads | main | none per frame | **`wheel`, `touchstart`, `touchmove`, `touchend` with `{passive:false}` on `window`, at construction, always** | `scrollTo` per frame (wheel only); `html` class churn at scroll start/end | debounced re-read of `innerHeight` and `scrollHeight` | − (permanent synchronous touch region; wheel hijack irrelevant on iPhone) | `lenis.mjs:255` `const listenerOptions = { passive: false };` `:283-286` `this.element.addEventListener("touchmove", this.onTouchMove, listenerOptions)`; `:434` `wrapper = window, eventsTarget = wrapper, smoothWheel = true, syncTouch = false`; `:617-621` touch returns before `preventDefault` unless `syncTouch`; README limitation: "capped to 60fps on Safari … and 30fps on low power mode" |
| Locomotive Scroll v5 | Lenis (default options) + its **own eternal rAF** + two IntersectionObservers (in-view classes; a `100%` margin IO that subscribes elements to per-frame updates); parallax = `translate3d` per frame per element, **disabled on touch devices** | main | `getBoundingClientRect` per element at resize only | inherits Lenis' non-passive listeners | `translate3d` (desktop), `--progress` on change | via Lenis + per-element re-measure | − (Lenis listeners + rAF that never sleeps; no parallax on phones anyway) | `index.ts:375-378` `this.rafInstance = requestAnimationFrame(() => this._raf())`; `core_ScrollElement.ts:199-204` (touch: `translate3d(0, 0, 0)`, smoothing off); `core_Core.ts:23-24` IO margins |
| fastdom | two queues, one rAF per batch, all reads then all writes; sleeps when empty; tasks added during a drain run in the same frame | main | batched | – | – | – | 0 (= T9) | `fastdom.js:185-209` `fastdom.runTasks(reads); fastdom.runTasks(writes);`; `:168-174` |
| anime.js v4 engine | one rAF engine that sleeps when no tickable is active; `Date.now` clock; pauses on `visibilitychange` | main | – | – | inline style | – | 0 | `engine/engine.js:170-177` `if (engine._head) { engine.reqId = engineTickMethod(tickEngine); … } else { engine.reqId = 0; }` |
| anime.js v4 `waapi.animate` | hands **any** property to WAAPI (no allow-list); easings become `linear()` with 101 samples (no support check); x/y/scale become registered custom properties `--translateX` composed into `transform: var(…)` | main for the custom-property transforms (WebKit does not accelerate custom properties) and for any `linear()` easing on iOS 26.x; CA only for real opacity/transform/filter with keyword or cubic-bezier easing | – | – | – | – | 0/− on iOS | `waapi/waapi.js:85-89` `easingToLinear(fn, samples = 100)`; `:196-216` `CSS.registerProperty` for `--<t>`; `:299-301` |
| anime.js v4 `onScroll` | never uses ScrollTimeline; `seek()` per scroll tick; bounds cached, re-measured on a 250 ms-debounced ResizeObserver; toolbar-safe height from a `100lvh` probe div | main | at refresh only (plus a `100lvh` `offsetHeight` read) | `scroll` (not passive-flagged, not cancelable anyway) | `seek` per scroll tick | `100lvh` probe = Apple's `cssDimensionsTracker` idea | 0 | `events/scroll.js:99-106` `height = '100lvh'`; `:220-221` ResizeObserver; `:930` `linked.seek(linked.duration * p)` |
| scroll-timeline polyfill | when it runs: wraps WAAPI, pauses the native animation and sets `currentTime` from a main-thread `scroll` listener; `getComputedStyle` in every `currentTime` read; offsets from the `offsetTop` chain, refreshed by Resize/MutationObserver | **not loaded on Safari 26**: it returns when `CSS.supports("animation-timeline: --works")` | – | – | – | – | 0 (no-op on the phone) | `src/scroll-timeline-css.js:155-159` `if (CSS.supports("animation-timeline: --works")) { return true; }`; `src/index.js:23-26` |
| Svelte 5 `transition:`/`in:`/`out:` with `css` | **samples `css(t)` into WAAPI keyframes every 1/60 s (easing baked in, linear segments) and calls `element.animate`**; a `tick` function adds a shared rAF loop that reads `animation.currentTime` | CA for transform/opacity/filter keyframes (no `linear()` function involved, so the legacy CA path accepts it, §1.3); main for `slide` (height/padding) and anything with `tick` | `animate:flip` reads `getBoundingClientRect` before and after the DOM update | – | none (WAAPI) | – | + (the most iOS-26-robust form of all libraries read) | `internal/client/dom/elements/transitions.js:441-446` `var n = Math.ceil(duration / (1000 / 60)); … keyframes.push(styles);` `:476` `animation = element.animate(keyframes, { duration, fill: 'forwards' });`; `:464-472` tick loop |
| `svelte/motion` `Spring`/`Tween` | rAF loop writing reactive state every frame (the pattern of fastwork's countdown `GE`) | main | – | – | state → template effect → inline style | – | − on the phone for anything visible | `motion/spring.js:106` `task = loop((now) => {`; `motion/tweened.js:130` |
| SvelteKit | `onNavigate` lets a page wrap navigation in `document.startViewTransition` | – | – | – | – | – | n/a (single-page scroll) | `kit/src/runtime/client/client.js:2278-2291` |

### 1.2 Platform primitives on Safari / iOS 26

| primitive | Safari / iOS support | thread on iOS 26.6.1 | conditions | evidence |
|---|---|---|---|---|
| CSS scroll-driven animations (`animation-timeline: scroll()/view()`), and WAAPI with `new ScrollTimeline/ViewTimeline` | 26.0 (CSS and JS API); threaded since 26.4; 26.5 range and pause fixes | **threaded SDA** for accelerated properties | properties: opacity, transform, translate, rotate, scale, offset-*, filter, backdrop-filter; the scroller must have a scrolling-tree node; the animation must not be pending; filter lists must match (webkit.md §1); no `var()` of an animated custom property (P3) | vendor doc https://webkit.org/blog/17862/webkit-features-for-safari-26-4/ "the animations driven by scroll position run on the compositor thread, separate from the main thread"; source `AcceleratedEffect.cpp:120-145`; `KeyframeEffect.cpp:2005-2007`; `ScrollTimeline.cpp:423-433` `return sourceScrollableArea && !!sourceScrollableArea->scrollingNodeID();`; BCD `api.ScrollTimeline` safari_ios "26" |
| CSS transitions / `@keyframes` / WAAPI, time-based | since forever | **CA (legacy path)** for accelerated properties with keyword, `cubic-bezier` or per-keyframe linear easing; **main** with `linear(<points>)`, `steps()`, a non-`replace` composite, or a progress-based timeline | §1.3 | source `KeyframeEffect.cpp:2012-2027`, `GraphicsLayerCA.cpp:1206-1218`, `PlatformCAAnimationCocoa.mm:130-151` (only cubic-bezier and identity-linear map to `CAMediaTimingFunction`) |
| `linear()` easing | parses since 17.2 | main for time-based animations on 26.x (§1.3); fine inside scroll-driven animations (threaded branch) | – | BCD `css.types.easing-function.linear-function` 17.2; source as above |
| View Transitions | same-document 18.0; cross-document, `view-transition-class`, types 18.2; element-scoped `Element.startViewTransition` **not** shipped | pseudo-element animations are opacity/transform plus a group size animation; whether they are threaded: unknown | while animating, captured elements "are not painted … and do not respond to hit-testing"; rendering is suppressed between the old-state capture and the update callback; snapshots do not follow scrolling | spec https://drafts.csswg.org/css-view-transitions-1/; source `ViewTransition.cpp:337-341`; BCD `Element.startViewTransition` safari false |
| `position: sticky` | yes | scrolling tree (UI process), no main-thread work per frame | – | apple-smooth-scroll.md §2.9, `ScrollingTreeStickyNode.cpp` |
| passive vs non-passive touch listeners | window/document/body touch passive by default since 11.3 | a non-passive listener makes its region synchronous: the UI-process scroll waits for the main thread | regions are computed in the rendering update and pushed to the scrolling tree, so **adding** a listener costs a region update in that frame | bug https://bugs.webkit.org/show_bug.cgi?id=184250; WebKit PR https://github.com/WebKit/WebKit/pull/68980: "touch event regions must be calculated and propagated to the scrolling tree before dispatching touch events" (GTK/WPE port of the iOS model; iOS keeps the trees in the UI process) |

### 1.3 Why `linear()` is main-thread on the phone (surprise 1, in detail)

- WebKit has two acceleration paths. `KeyframeEffect::canBeAccelerated()` returns early on the **threaded** path:
  `if (canHaveAcceleratedRepresentation()) return !animation->pending() && (… || protect(animation->timeline())->canBeAccelerated());`
  (`Source/WebCore/animation/KeyframeEffect.cpp:2005-2007`, source). Otherwise it falls through to the **legacy
  Core Animation** checks:
  `if (m_isAssociatedWithProgressBasedTimeline) return false;` (2012) and
  `#if USE(CA) … if (m_someKeyframesUseLinearTimingFunctionWithPoints || isLinearTimingFunctionWithPoints(timingFunction())) return false;`
  (2015-2021; `steps()` the same).
- `canHaveAcceleratedRepresentation()` (3276-3287) takes the threaded path for scroll timelines when
  `threadedScrollDrivenAnimationsEnabled()`, and for time-based animations only when
  `threadedTimeBasedAnimationsEnabled()` (source).
- The legacy path hands CA a `CAMediaTimingFunction`, which exists only for cubic-bezier and the identity linear
  function (`PlatformCAAnimationCocoa.mm:130-151`, `ASSERT(LinearTimingFunction::identity() == timingFunction)`, source).
- **Flag history for threaded time-based animations** (source + vendor doc):
  - enabled in Safari Technology Preview 238, 2026-02-26 (https://webkit.org/blog/17848/release-notes-for-safari-technology-preview-238/:
    "Enabled threaded time-based animation resolution");
  - re-landed on `main` 2026-04-11 (310988@main, "take 3") and 2026-07-09 (316797@main);
  - disabled 2026-09-23 (321733@main, YouTube fullscreen power regression,
    https://bugs.webkit.org/show_bug.cgi?id=325061);
  - re-enabled 2026-09-26 (https://github.com/WebKit/WebKit/pull/75004, "take 4").
  - The Safari 26.4 notes ship only threaded **scroll-driven** animations. No 26.5, 26.6 or 27.0 note mentions
    time-based threading.
- **Conclusion (inference, strong):** iOS 26.6.1 runs time-based CSS transitions, `@keyframes` and WAAPI on the
  legacy CA path. A `linear(<points>)` or `steps()` easing therefore turns them into main-thread animations: style
  plus layer commit every frame, and they stall with the main thread. Scroll-driven animations are not affected.
- **Verify on the device before relying on it** (P0 in §3, 10 min). This reverses advice in webkit.md §10/rec 1,
  render.md (lines 20, 194), hero.md (437), apple-math.md (#7) and devtools-render-metrics.md (185), and it applies to
  the shipped wave-1 base: large-area-blur T10 replaced a CA-eligible `cubic-bezier(0.16, 1, 0.3, 1)` filter
  transition with `linear(…)` (`fixes/large-area-blur/patch.diff`, CSS 2400-2420).
- **The fix is exact, not approximate.** T10 cuts a cubic-bezier curve short in time and renormalizes it. A cubic
  Bézier split at parameter t* (de Casteljau) is again a cubic Bézier. Rescaled to end at (1, 1), it is a
  `cubic-bezier()`, which CA accepts. Computed with [`oss-rendering-libs/bez-split.mjs`](oss-rendering-libs/bez-split.mjs); shape deviation 0, apart
  from the residual blur at the cut, which is now spread over the curve instead of snapped at the end:

  | T10 transition | exact replacement | residual at the cut (14 px blur) |
  |---|---|---|
  | `filter` 1.6 s → 0.7 s | `cubic-bezier(0.2350, 0.6733, 0.4511, 0.9140)` | 0.64 px |
  | `filter` 1.6 s → 0.9 s | `cubic-bezier(0.2116, 0.7565, 0.4035, 0.9503)` | 0.24 px |

- **Springs:** the countdown spring (k 280, c 18, m 0.3 → ω0 30.6 rad/s, ζ 0.982, 0.2 % settle at ~262 ms) fits
  no cubic-bezier within ±1 device px. The best fit with y in [0, 1] is `cubic-bezier(0.279, 0.357, 0.074, 1)`, off
  by 1.75 % of the step ([`oss-rendering-libs/spring-fit.mjs`](oss-rendering-libs/spring-fit.mjs), random search, so
  the fit is approximate). So the CA-safe form for a spring is Svelte's: keyframes sampled every
  8-17 ms with linear segments (`transitions.js:441-446`). Motion's and anime's `linear()` output is the wrong form
  for iOS 26.x.

### 1.4 Cross-cutting mechanism findings

1. **Listeners once, never at an edge, never on `window` if avoidable.** Every library adds its listeners once
   at construction (Lenis `:283-286`, Locomotive via Lenis, ScrollTrigger at register). Apple adds touch listeners
   only for the duration of a gesture inside a widget (apple-smooth-scroll.md §2.6). Fastwork added them at an IO
   edge mid-scroll: the NAMED y≈1960 frame (P-011: 104/107 → 34/35 ms when armed at setup). Arming at setup on
   `window` (Lenis' way) trades that one frame for a synchronous touch region over the whole page for the page's
   lifetime.
2. **Cache geometry at refresh, filter toolbar resizes.** ScrollTrigger: refresh-time `getBoundingClientRect`,
   resize ignored unless width changes or height changes > 25 %. anime: a `100lvh` probe. Apple: a `100vh` fixed
   tracker. Fastwork has this since T9/N12 (height-only resize debounced 120 ms, offset cache in nav `L`).
3. **The loop must sleep.** fastdom, Motion and anime sleep; GSAP sleeps only as the sole listener; ScrollTrigger
   (`_rafBugFix`), Lenis `autoRaf` and Locomotive never sleep. Fastwork's engine sleeps; the countdown spring
   doesn't (H7).
4. **Nobody uses `will-change`** (GSAP, ScrollTrigger, Lenis, Locomotive, Motion: 0 occurrences). GSAP's
   `force3D:"auto"` promotes only mid-tween and drops to 2D at the ends: a layer create and destroy per tween. On
   WebKit that is a backing-store allocation and paint at tween start (webkit.md §4), the same class as the morph's
   start transient. Apple's per-element `will-change` window (apple-smooth-scroll.md §2.3) is the better model.
5. **"Hardware accelerated" lists are Chrome's lists.** Motion accelerates `clipPath` and `backgroundColor`, and
   anime has no allow-list at all. WebKit accelerates only opacity, transform (and its individual properties),
   offset-*, filter and backdrop-filter (`AcceleratedEffect.cpp:120-145`). On the phone, a clip-path or colour
   animation through any library is a main-thread WAAPI animation: no JS per frame, but style plus a mask update
   or repaint per frame.

## 2. What fastwork does differently (de-oss-map)

de-oss-map's text, as sent (its doc: `research/design-engineering/oss-mechanism-map.md` on its branch):

- One coalesced engine already: `rE`/`iE`/`dE` (JS 2663-2783) runs every scroll consumer from passive scroll/resize
  listeners in one rAF, gated by IntersectionObserver per section. That is ScrollTrigger's ticker, the Motion
  frameloop and anime.js's sleeping engine, minus their eternal rAF and the 250 ms interval.
- Scrub-style smoothing exists: the commission, future, profile and platform shrink lerps move 0.22 of the gap per
  frame (= GSAP `scrub: n`), on transform/opacity.
- Measure/mutate (fastdom, Motion's read/update phases) was built as scroll-engine /01: forced layout 92 -> 69 ms in
  Chrome, frame classes unchanged. Parked: on the iPhone, rAF JS is 0-1 ms on the felt frames.
- Rect caching (ScrollTrigger refresh()) exists for the nav as N12's offset cache; 7 callbacks still read layout per
  frame, gated on a phone jsMs census.
- Native scroll-driven animation (Motion scroll() at its best) is in flight: hero v2 puts the hero exit on one
  `--hero-exit` view timeline, threaded on Safari 26.4+.
- Hit testing: T11 uses elementsFromPoint, not per-frame rect reads.
- What fastwork lacks and the libraries have: (a) springs as a CA-safe easing (the countdown integrates its spring in
  JS per frame, ~80 layers); (b) scoped input listeners (the morph arms wheel/touchmove passive:false on window when
  it nears the page end, which rebuilds touch regions page-wide: the y~1960 frame).
- What the libraries would make worse here: Lenis/Locomotive add window-wide non-passive listeners for life; GSAP
  force3D demotes layers at tween end (re-raster); Motion's spring -> linear() is main-thread on 26.6.1 (F-048); View
  Transitions stop painting and hit-testing the captured elements while they animate.
- Why JS libraries gain ~0 on the phone: the felt frames are render-side (style 34-42 + composite 58-72 ms at
  y~1960; filter/backdrop raster), and render-server GPU time is invisible to rAF (L13). The lever is which thread a
  property runs on and which elements carry listeners, not how JS is scheduled.

Two answers from de-oss-map that bound the shortlist: the baseline bundle has **no `.animate(` call**, so no Svelte
`transition:`/`in:`/`out:` WAAPI path is on the scroll path; and the only `linear()` easings in flight are T10's two
filter tails (CSS after 2400 and 2410), carried by every aw1-based overlay (none in hero v2's own hunks, none in
countdown /05-/08; HEflip uses `cubic-bezier(0.4, 0, 0.2, 1)`).

From de-oss-map's hotspot map (JS = `nodes/2.DyWL8TcE.js`, CSS = `assets/2.gBuqKVzi.css`, pretty baseline, 1-based;
y in phone crossing coordinates). Its framing: **the remaining felt jank is mostly not main-thread JS**. Morph frames
run 0-1 ms of page rAF JS (F-033). The y≈1960 frame is ~1 ms JS + style 34-42 + composite 58-72 ms (P-011). So any
mechanism that only re-schedules JS (a ticker, batching, lerp) gains ~0 on the iPhone frames that matter. Only
mechanisms that change **what WebKit renders** can move them: compositor-run animations, fewer resized layers, no
listener-region changes.

| H | fastwork today (code) | the library mechanism it resembles | gap on WebKit |
|---|---|---|---|
| H1 scroll engine | one passive scroll + resize listener → one coalesced rAF `iE` → 8 `dE` callbacks, IO-gated (`rootMargin 100%`, scene attr + `content-visibility`), JS 2667-2783 | GSAP ticker / ScrollTrigger single rAF; T9 = Motion frameloop / fastdom | none left for JS scheduling; the scene-gate flips are WebKit render events (N10, F-045) |
| H2 hero exit | `s` (JS 4163-4175) rect read → `--exit-opacity` on `.hero` (inherited) → orbit cards, `.hero-copy` blur, `.scroll-cue` blur | ScrollTrigger `scrub:true` (main thread) | hero v2 (T12) = Motion `scroll()`'s native best case in plain CSS; open: +7-10 ms at the 0.72 flip (hero-B bisect) |
| H3 0.72 flip | future `l` (11303-11325) and nav `_` (13000-13011) flip state at progress 0.72; future-card `blur(14px)` reveal transition (CSS ~2396), now `linear()` (T10) | ScrollTrigger `toggleActions` / Motion `inView` + a transition | the T10 `linear()` makes that blur transition main-thread on iOS 26.x (§1.3) |
| H4 nav per-frame callback | `getComputedStyle` + rects + hit test, fixed by T11/N12 | ScrollTrigger refresh-time cache | done |
| H5 morph tween | 680 ms ease-out-cubic time tween (≡ `cubic-bezier(1/3, 1, 2/3, 1)`, F-038), JS 13020-13036; per frame writes inherited `--morph` (~26 consumers) and `--morph-fade`; drives nav width/height/top/radius (layout + resized backing stores), `color-mix` (repaint), `backdrop-filter` radius (render server), panel and `#platform` blur/opacity/scale | Motion layout projection would cover the box (main-thread transform writes, inexact text raster) | height goes 52 → ~791 px (15x) for +2 % width: a scale morph is not design-equivalent; the floor is a full-size box + `clip-path: inset(round)` (main-thread style, no layout, no raster) + CA pieces |
| H6 morph listeners | `wheel`/`touchmove` `{passive:false, capture:true}` added on `window` at the `#platform` IO edge (`rootMargin 200%`), JS 13060-13087 | Lenis/Locomotive add the same set at construction | the edge add is the NAMED y≈1960 frame; arming on `window` at load makes every touch synchronous |
| H7 countdown | spring `GE` (k 280, c 18, m 0.3, ≤16 ms Euler substeps, JS 3789-3803), one rAF per digit → Svelte state → inline `translateY` on 10 faces (3836-3862); `setInterval` 1 s; ~75-85 `.face` layers | `svelte/motion` Spring, Motion spring | Motion would emit `linear()` → main thread on iOS 26.x; the CA form is sampled keyframes on one strip per digit |
| H8 shrink callbacks | rect read → 0.22 lerp → `--*-shrink` → self-rAF until converged (commission, future, profile, platform) | ScrollTrigger `scrub:<n>`, Locomotive lerp | already gated off on phones (T1) |
| H9 reveal-on-scroll | IO + class toggles, count-up rAF | Motion `inView`, ScrollTrigger `toggleActions` | fine |
| H10 CSS infinite loops | `background-position` gradient text, SMIL, `stroke-dashoffset`, vinyl rotate under `mask-image` (F-041), marquees | – | the non-transform ones repaint per frame (topic 9, F-041) |

de-oss-map's rejected list, which I agree with:
- **Lenis/Locomotive:** a window-wide synchronous touch region, and a main-thread `scrollTo` lerp.
- **GSAP scrub:** main thread, a regression against hero v2.
- **fastdom / Motion frameloop:** equal to scroll-engine /01, which was measured: forced 92 → 69 ms, frame classes
  unchanged.
- **View Transitions for the morph or the 0.72 flip.** Snapshots don't follow the scroll. Interaction stops while
  animating (spec). The start captures full-viewport snapshots, a raster burst exactly where the morph's start
  transient already is. A transition can't be scrubbed or reversed mid-flight. Element-scoped transitions aren't in
  Safari.
- **scroll-timeline polyfill:** a no-op on Safari 26.

## 3. Ranked PoC shortlist (joint with de-oss-map)

Ranked by expected effect on **iPhone 15 Pro Max Safari 26.6.1**, then by risk. All are dependency-free
re-implementations: each mechanism is 10-60 lines of CSS/JS, while vendoring brings permanent costs that the
mechanism doesn't need (Lenis listeners, ScrollTrigger's eternal rAF, Motion's JS scroll tracker) and, for GSAP, a
non-OSI license. Ticks: k = round(dt / 8.333 ms); k≥5 = dt ≥ 37.5 ms, k≥7 = dt ≥ 54.2 ms. Drivers per protocol
v2 §5.4 (S scripted, W window, M morph driver, G gesture, F finger). Every PoC writes its prediction into
`fixes/PREDICTIONS.md` before its first timed run.

**P0 (a gate, not a PoC): `ca-check`, 10 min on the phone, no fastwork code.** A static test page with three
boxes animating `transform` for 2 s:
- (a) a CSS transition with `cubic-bezier(0.279, 0.357, 0.074, 1)`;
- (b) the same with an equivalent `linear(…)`;
- (c) WAAPI with 31 sampled keyframes.

Plus the same three on `filter: blur()`, and de-oss-map's three additions:
- (d) the T10 endpoint pair: `none → blur(14px)` against `blur(0px) → blur(14px)`, both `cubic-bezier`;
- (e) one `backdrop-filter: blur()` radius animation (decides P4's backdrop part);
- (f) a CSS `animation-timeline: scroll()` control on `transform`, which must keep moving in every run (threaded
  scroll-driven, shipped in 26.4), otherwise the run is void.

After 300 ms the page busy-loops the main thread for 1000 ms. Capture
with a device screen recording (QuickTime over USB, 60 fps). **Prediction (F-048):** (a) and (c) keep moving
through the block; (b) freezes and jumps.
- If (b) keeps moving, threaded time-based animations are on in 26.6.1: §1.3 is wrong, retract F-048, and P2
  drops out.
- If (a) also freezes, the legacy CA path isn't used either: P3's premise fails.

Owner: iphone-runner (one ticket; no Web Inspector attached during the block). P2, P3 and P4 wait for it.
**P1 does not:** it asks no CA question and runs in parallel (de-oss-map's order).

Source check for (d): WebKit's legacy path validates filter keyframes with `GraphicsLayer::validateFilterOperations`
(`GraphicsLayer.cpp:807-838`, `main`): "Empty filters match anything", and `none` is an empty list. So `none →
blur(14px)` does not by itself keep the card off Core Animation (source); (d) checks that on the device.

### P1. `listener-scope`: the anti-Lenis lesson (rank 1)

- **Hotspot / code replaced:**
  - H6, JS 13060-13087: the `window` `wheel`/`touchmove` `{passive:false, capture:true}` add inside the `#platform`
    IO callback (`rootMargin 200%`).
  - The PoC arms the non-passive listeners **once at setup**, on the `#platform` element and the nav, not `window`.
    `preventDefault()` runs only `if (e.cancelable)` and only while the morph is engaged (Apple's gesture-scoped
    pattern, apple-smooth-scroll.md §2.6).
  - This is fix-nav-morph's F3, which should be its **primary** variant, not the fallback: F1/F2 arm on `window`,
    which is Lenis's whole-page synchronous region for the page's life (de-oss-map; I agree). fix-nav-morph owns it.
- **Library / primitive:** the listener discipline of Lenis/ScrollTrigger (once at construction), minus their
  `window` scope; WebKit event-region semantics (§1.2). License n/a. Vendoring Lenis would be worse: it has the same
  listeners on `window`, permanently.
- **Prediction (P-0xx):**
  - S driver, ABBA vs aw1-10e: the y≈1960 frame drops from k≥12 (104/107 ms) to k≤5 (≤ 38 ms) in 3/3 runs, like
    P-011's arm; whole-pass k≥7 count ≤ control.
  - G/F: `touchstart` input delay (Event Timing) for touches that start outside `#platform` and the nav in
    y 1830-4155: p95 ≥ 6 ms below an "armed on window at load" arm (F1), and equal to the control.
  - Falsified if the S frame stays ≥ k7 (the region update then is not the cost) or the G/F delay doesn't move.
- **Risk:** touches that start on the fixed nav (a 52 px strip) stay synchronous. A push-past-the-end that starts
  on content outside `#platform` loses the jack (design check by the user's finger). Region size: `#platform` is a
  large element, so measure F, don't assume. Low risk overall.
- **Stage:** F (P-011's attribution card is NAMED). Touch-only for the second claim: G/F before landing.

### P2. `blur-easing-cubic`: put T10's blur back on Core Animation (rank 2)

- **Hotspot / code replaced:** H3, the future-card reveal at the 0.72 flip (y≈587-745), in the wave-1 base
  (`fixes/large-area-blur/patch.diff`, CSS 2400-2420): replace the two `filter … linear(0, 0.0538 2%, …)` easings
  with `cubic-bezier(0.2350, 0.6733, 0.4511, 0.9140)` (0.7 s) and `cubic-bezier(0.2116, 0.7565, 0.4035, 0.9503)`
  (0.9 s), §1.3. Same durations, same curve.
- **Endpoint caveat (de-oss-map):** the card's rest value is `none` (CSS 2396 → 2408), so the two filter lists
  don't match. WebKit's legacy path treats an empty list as matching anything (`GraphicsLayer.cpp:807-838`, see P0),
  so by source the baseline `cubic-bezier` transition was CA-eligible and T10's `linear()` made it main-thread. That
  stays a hypothesis until P0 (a)/(b)/(d) run. If (d) shows `none` freezing, the PoC also carries an explicit
  `blur(0px)` rest value (as on h1), and the baseline was main-thread too, so P2 alone changes nothing.
- **Library / primitive:** CSS transitions on the legacy CA path; the insight comes from Motion's and anime's
  `linear()` springs failing that path. No dependency.
- **Prediction (P-0xx):**
  - Mechanism: in one Timeline attribution run (F-047) over the reveal, main-thread Recalculate Style records
    attributable to `.start-selling-future-card` drop from ~1 per frame for 0.7-0.9 s (≥ 40 records) to ≤ 2. Paint
    records of the 402×857 card panels don't rise.
  - Gain (W driver y 500-900, ABBA vs aw1-10e): small. k≥5 frames in y 580-900 = control or −1; median ticks in the
    window equal or −1. The y≈625-745 pair stays: it is the flip's first raster (hero.md B), not the transition.
  - Visual: the blur keeps animating through the flip's long frames instead of stepping.
  - Falsified if the style records don't drop: the transition was then never CA-eligible for another reason
    (element not composited, `visibility` interplay).
- **Risk:** very low. CSS only, curve-identical, Chrome-neutral (P5). Parity: frozen frames at 5 times within
  ±0.64 px blur.
- **Stage:** D, as a fast-path candidate: the mechanism is countable, and the lead decides. Owner:
  large-area-blur's successor or fix-hero-exit (it owns the y 0-900 window).

### P3. `countdown-ca`: the spring as Core Animation keyframes on one strip per digit (rank 3)

- **Hotspot / code replaced:** H7, JS 3789-3862. It replaces the per-digit rAF spring (`GE` + `requestAnimationFrame`
  → Svelte state → inline `translateY` on 10 faces) with one `element.animate()` per tick on one strip per digit.
  The keyframes are the spring's analytic step response sampled every 8.33 ms (32 keyframes, ~262 ms, linear
  segments: Svelte 5's `transitions.js:441-476` pattern). There is no per-face `will-change`, and the layout is
  countdown-idle-raf /05 (~80 → ~8 layers).
- **Library / primitive:** WAAPI on the legacy CA path. Motion's `spring` → `linear()` is the wrong form on iOS 26.x
  (§1.3), and a single cubic-bezier is off by 1.75 % of the step. License n/a.
- **Prediction (P-0xx):**
  - W driver, idle at y=0 for 10 s, ABBA vs aw1-10e: the ~1 Hz spikes (35-58 ms, hero.md C) go from ≥ 6 per 10 s
    to ≤ 1 at k≥5. Page rAF callbacks per second at idle: ≥ 15 per tick → 0 between ticks.
  - S: no regression in the full pass (k≥7 ≤ control).
  - Parity: within ±1 device px at 5 frozen times per tick (the JS Euler curve itself varies with frame interval).
  - Falsified if the spikes stay, which would mean they are not the spring (the `setInterval` re-render or the
    Svelte update of 10 faces).
- **Risk:** medium-low. Retargeting mid-flight (rare, ticks are 1 s apart) needs `getComputedStyle` of the current
  transform before the new animation (one read per tick). Reduced motion keeps its instant path. The panel's second
  countdown (`cD`) must honour the shown state (topic 13).
- **Stage:** I → D. The 1 Hz spike is attributed by period only, so the attribution card needs one Timeline run
  (F-047) first. Gated by P0. Owner: countdown-idle-raf.

### P4. `morph-ca`: the CA-able pieces of the morph, as a diagnostic (rank 4)

- **Hotspot / code replaced:** H5, JS 13020-13036 and CSS 10545-10549, 5392-5393, 11331-11343. Plan:
  - Keep de-morph's floor for the box: a full-size box + `clip-path: inset(… round r)`, and `color-mix` → an
    `#131922` opacity layer (F-039).
  - Move the panel's `filter: blur(12px → 0)` + `opacity` + `transform: scale(0.96 → 1)` and `#platform`'s
    blur/opacity out of `var(--morph)` into one set of **real-property** `element.animate()` keyframes with matching
    filter lists and `cubic-bezier(1/3, 1, 2/3, 1)` (exactly the tween's ease, F-038; no `linear()`). Start them
    with the tween, and reverse with `animation.reverse()` on a direction change.
  - Backdrop gated off at m ≥ 0.55 (R8).
  - The rAF then writes only the clip.
- **Library / primitive:** Motion's WAAPI hybrid without Motion. Its list would also send clip-path to WAAPI,
  which is main-thread on WebKit anyway.
- **Prediction (P-0xx), two-sided:**
  - M driver vs the gh build: moving-m p95 within ±1 tick (rAF can't see render-server work, L13).
  - Instruments render hitches over the same cycles: hitch time per s −20 % or more. This gate is render-bound,
    held at LOCATED until the Instruments route works (protocol v2 §2.3).
  - G/F: morph-active p95 −1 tick or more, because the CA parts no longer wait for touchmove handlers.
  - Falsified if hitch time is flat, or if the first tween frame grows by ≥ 1 tick (5 CA animations plus layers
    land in the 300-400 ms start transient, P-016).
- **Risk:** medium. Bar ±1 px, the clip's look needs the user's eye, the reversal semantics differ from the JS tween
  on a mid-flight direction change, and the a11y of `inert` must be unchanged.
- **Stage:** D, after P-016 answers where the start transient lives. Owner: fix-nav-morph.

### P5 (conditional). `refresh-cache`: ScrollTrigger's refresh model for the remaining per-frame reads

- **Hotspot:** H1/H8, the callbacks that still read layout per frame on the phone (fix-scroll-engine's list on
  aw1-10e). Cache document offsets at refresh (ResizeObserver on the page root, breakpoint MQ, `fonts.ready`); drop
  height-only resizes below 25 % (ScrollTrigger `:1089`); per frame only `scrollY` arithmetic.
- **Run only if** a phone logger shows page rAF JS ≥ 3 ms per frame in the 20-34 ms band. Nobody has measured
  that, and Chrome says ~60 ms of script over 8.4 s.
- **Prediction:** Chrome Tier A `getBoundingClientRect`/`getComputedStyle` per scroll frame → 0. Phone S: k≥5 in
  the full pass −1 to −2, median ticks unchanged.
- **Risk:** stale offsets after a layout change without a resize (lazy mount, sticky): parity on 39 steps.
- **Stage:** R. It extends N12, owner fix-scroll-engine.

### Not shortlisted, with reasons

- **Vendor Lenis / Locomotive:** − on the phone, §1.1 (permanent synchronous touch region, rAF that never sleeps,
  no touch smoothing anyway).
- **Vendor GSAP + ScrollTrigger:** 0 at best. Its cache and toolbar filter already exist here; its scrub is
  main-thread; `_rafBugFix` keeps a rAF alive forever; the license is not OSI.
- **Motion `scroll()`:** its best case equals T12 (hero v2) in plain CSS; its fallback reads more layout per frame
  than fastwork does today.
- **More scroll-driven conversions:** the remaining scroll-linked effects (H8) are visually off on phones (T1).
  T12 covers the hero.
- **View Transitions:** see §2.
- **fastdom / frameloop:** equal to T9, measured as no frame-class change.

## 4. Open points

- §1.3 rests on the flag history plus the 26.4 notes: **P0 confirms or retracts it** on the device. If threaded
  time-based animations turn out to be on in 26.6.1, the `linear()` caveat disappears, P2 drops, and P3 may use
  `linear()`.
- How WebKit's threaded path applies effects on iOS (UI process vs render server) wasn't readable: the
  `Source/WebKit` RemoteAcceleratedEffectStack files returned 404. It matters for the backdrop under a threaded
  animation (render-bound either way).
- Whether View Transition pseudo-element animations are threaded in WebKit: unknown (no doc, no source found).
- WebKit `main` was read without a commit pin; iOS 26.6.1 may differ in line numbers and in details.
