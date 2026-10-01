# OSS animation libraries vs fastwork's per-frame code: the mechanism map (de-oss-map)

Design-engineering note by `de-oss-map` (2026-10-01), the fastwork half of the user's request: "research the
open-source libraries that give the best rendering performance, understand how they do it, and try a PoC on the
fastwork website". The library half (source reads of GSAP/ScrollTrigger, Motion, Lenis, Locomotive, fastdom,
anime.js, the scroll-timeline polyfill, CSS scroll-driven animations, View Transitions) is `arch-oss-survey`'s
`research/architecture/oss-rendering-libs.md`, which also carries the joint PoC shortlist. This note gives, for each
animation hotspot:
- what fastwork's code does per frame (file:line);
- which OSS mechanism would replace it;
- what that mechanism would cost on WebKit/iOS 26.6.1;
- whether fastwork already does it.

Read-only study: no Chrome, no iPhone, no locks. Code lines are 1-based in the committed baseline (`site-pretty/`,
snapshot `b1789284481295-4ad4a84a`):
- `JS` = `_app/immutable/nodes/2.DyWL8TcE.js`;
- `CSS` = `_app/immutable/assets/2.gBuqKVzi.css`.

Lines quoted from the phone base `aw1-10e` are marked as such. Labels follow the team's charter (`README.md`):
- **vendor source** (library or WebKit source, cited with file:line by arch-oss-survey or `webkit.md`);
- **spec**;
- **data** (our logs, the PREDICTIONS ledger);
- **derived** (my reasoning; a device check is still needed).

## 0. Verdict in seven lines

1. **The frames the user still feels on the iPhone are render-side, not script.**
   - Morph frames run 0-1 ms of page rAF JS (F-033).
   - The y≈1960 frame is ~1 ms of JS, 34-42 ms of style and 58-72 ms of composite (P-011).
   - Chrome at 6x shows ~60 ms of long-frame script over a whole 8.4 s scroll (fix-scroll-engine).

   Every library mechanism that only *schedules JS better* therefore gains ~0 on those frames: a ticker,
   read/write batching, lerp smoothing or a virtual scroll.
2. **Fastwork already does what most libraries do**:
   - one passive, coalesced scroll→rAF engine (GSAP ticker, Motion frameloop);
   - IntersectionObserver gating (Motion `inView`, ScrollTrigger `toggleActions`);
   - per-frame lerp easing (ScrollTrigger `scrub: <n>`, the Locomotive lerp);
   - a measure/mutate engine, built and measured as scroll-engine /01 (= fastdom, the Motion frameloop): no frame
     class moved;
   - a native view-timeline hero exit (hero v2, T12), which is the best case of Motion's `scroll()`.

   A PoC that re-implements any of these gains nothing.
3. **Only three library ideas are new to fastwork and can change what WebKit renders.**
   - (a) **Compositor-run time animations.** On WebKit's accelerated properties only, and with a `cubic-bezier`
     or pre-sampled keyframes. Motion's own spring form, `linear()`, runs on the main thread on iOS 26.6.1 (F-048).
     The same pitfall sits in our aw1 base: T10's `linear()` blur tail.
   - (b) **Input listeners armed once, never added mid-scroll.** Unlike Lenis, they are scoped to the elements
     that need them, not `window`.
   - (c) **Morph pieces as real-property keyframes.** This one is render-bound, so rAF can't score it (L13).
4. **Motion's "hardware accelerated" list is Chrome's, not WebKit's.**
   - `clipPath` and `backgroundColor` run on the main thread on the iPhone (arch-oss-survey M5 vs
     `AcceleratedEffect.cpp`).
   - Motion's individual `x`/`y`/`scale` run in JS.
   - No library can make the morph's width/height/clip/`color-mix` compositor-run on WebKit.
5. **Negative on the iPhone:**
   - **Lenis and Locomotive** keep non-passive `wheel`/`touchstart`/`touchmove`/`touchend` on `window` for the
     page's whole life, even with `syncTouch: false`. The whole page then becomes a synchronous touch region
     (arch-oss-survey M3, vendor source).
   - **GSAP `scrub`** moves the hero back to main-thread JS, a regression from v2.
   - **View Transitions** fit no scroll-triggered change (§4.6).
6. **Joint shortlist** (§5, agreed with arch-oss-survey):
   - `ca-check`, a 10-minute device page that settles what CA really runs on 26.6.1;
   - `blur-easing-cubic`;
   - `countdown-ca`;
   - `listener-scope`;
   - `morph-ca`, as a D-stage diagnostic.

   Hero v2 is cited as already done; a rect cache comes only if phone data shows that JS matters.
7. **The WebKit cost of the "compositor" mechanisms is real and partly invisible to us:**
   - render-server GPU time is not on the rAF path (L13);
   - accelerated-effect stacks may resync or add "assumed overlap" layers on big commits (the hero v2 flip,
     +7-10 ms, still unbisected);
   - every animated element is a layer (memory);
   - only listeners, not animations, change touch regions.

## 1. The WebKit facts this map relies on

| fact | source |
|---|---|
| Accelerated (render-server / Core Animation) properties: opacity, transform, translate, rotate, scale, offset-\*, filter, backdrop-filter. Everything else is main thread: custom properties, clip-path, colors, `color-mix`, width/height, background-position | vendor source, `AcceleratedEffect.cpp` `acceleratedPropertyFromCSSProperty` (`research/architecture/webkit.md` §1) |
| Filter animations are accelerated only when the from/to lists match: `blur(0px)→blur(8px)`, never `none→blur(8px)` | vendor source (webkit.md §1). **REFUTED for `none`** (arch-claims, F-053 CONFIRMED): `GraphicsLayer::validateFilterOperations` treats an empty list as matching anything, so `none→blur(8px)` is CA-eligible; only two non-empty lists must match. ca-check pair (d) remains the device check |
| **Time-based animations on the phone take the legacy Core Animation path.** There, a `linear(<points>)` or `steps()` timing function, on the animation or on any keyframe, makes the animation main-thread (`KeyframeEffect.cpp` `canBeAccelerated`: `main` l.2016 `steps`, l.2019 `linear` points; safari-7624-branch l.1959/1962). The cause: `PlatformCAAnimationCocoa.mm` l.130-151 `toCAMediaTimingFunction` takes only a cubic-bezier or an identity linear. `ThreadedTimeBasedAnimationsEnabled` is unstable/false in 7624 (iOS 26.x) but stable/true on `main`, so **this holds for iOS 26.x only; Safari 27 is expected to differ**. Scroll-driven animations are unaffected. **CA-safe forms:** a `cubic-bezier`, or keyframes pre-sampled every ~16 ms with linear segments (Svelte 5's transition pattern) | vendor source (arch-oss-survey F-048, citations corrected by arch-claims in F-065); the device check is the ca-check page (§5) |
| CSS scroll-driven animations: main thread on 26.0-26.3, **threaded from 26.4**; the phone runs 26.6.1 | vendor doc, WebKit blog 26.4 (webkit.md) |
| `var()` of an animated custom property resolves against its base value in Safari keyframes (P3) | data (hero-exit) |
| Touch event regions are computed in the rendering update and pushed to the UI-process scrolling tree before touches dispatch. A non-passive listener on `window`/`document` makes the whole document synchronous. Adding or changing one rebuilds the regions page-wide | vendor source (WebKit PR 68980, arch-oss-survey M2; de-unknowns-render via fix-nav-morph); data P-011 |
| A composited layer whose size changes repaints completely every frame (no tiling below 1280 CSS px per side) | vendor source (F-036, morph-endpage §1.3) |
| rAF gap = WebContent + raster wait + UI apply + tick; **render-server (GPU) time is not on it** | vendor source (L13, safari-render-signals) |
| A transform animation under a transform-animated ancestor marks extents uncertain, and later siblings composite ("assumed overlap") | vendor source (hero.md §2D candidate 1) |

## 2. Hotspot × mechanism matrix

Mechanism columns (the library examples are from arch-oss-survey's source reads, M1-M8):
- **SDA**: native CSS scroll timeline (`animation-timeline: view()/scroll()`; Motion `scroll(animation)` hands it to
  a native ViewTimeline when the values and offsets allow).
- **CA**: time-based WAAPI / CSS transition on accelerated properties (Motion `animate()`, its springs as pre-sampled
  `linear()`; Svelte's pre-sampled keyframes).
- **rAF+batch**: one sleeping rAF loop with read/write phases (GSAP ticker, Motion frameloop, fastdom, the anime.js
  engine).
- **cache**: rects measured at refresh/resize only, then pure arithmetic per frame (ScrollTrigger `refresh()`, anime.js
  ResizeObserver bounds, Apple's "measure on resize").
- **vscroll**: smooth / virtual scroll (Lenis, Locomotive).
- **listen**: listener policy (passive, armed once, element-scoped; GSAP Observer).
- **VT**: View Transitions.
- **IO**: IntersectionObserver triggers (Motion `inView`, ScrollTrigger `toggleActions`).

Cell codes:
- **done** = fastwork already does it;
- **PoC** = on the shortlist;
- **built** = an owner already built it (cite);
- **~0** = applies but can't move a felt frame;
- **worse** = a regression on the iPhone;
- **n/a** = doesn't apply.

| hotspot (y on the phone) | SDA | CA | rAF+batch | cache | vscroll | listen | VT | IO |
|---|---|---|---|---|---|---|---|---|
| H1 scroll engine (all y) | n/a | n/a | **done** (+ /01 built, no gain) | ~0 (unmeasured on phone) | **worse** | **done** (passive) | n/a | **done** |
| H2 hero exit (0-900) | **built** (v2, T12) | n/a | ~0 | ~0 | worse | – | n/a | – |
| H3 0.72 flip / #people reveal (587-745) | n/a | h1 + **PoC 2** (T10 easing as cubic-bezier) | ~0 | small (N12) | – | – | **worse** | **done** |
| H4 nav per-frame hit test (all y) | n/a | n/a | ~0 | **built** (N12 stage 1, T11) | – | – | n/a | possible (T7) |
| H5 morph tween (page end) | needs a design change (N8) | **PoC 5** (CA parts only) | ~0 (JS 1 ms) | n/a | – | – | **worse** | – |
| H6 morph listeners / y≈1960 | n/a | n/a | n/a | n/a | **worse** (permanent sync region) | **PoC 4** | n/a | trigger (IO 200 %) |
| H7 countdown (hero + panel) | n/a | **PoC 3** | done (IO pause, 03) | n/a | – | – | n/a | **done** |
| H8 shrink lerps (commission, future, profile, platform) | desktop only | n/a | ~0 | ~0 | – | – | n/a | done (T1 gate) |
| H9 reveal-on-scroll (IO + classes, count-up) | n/a | small (matching lists) | n/a | n/a | – | – | n/a | **done** |
| H10 CSS infinite loops | n/a | **done** where transform (marquees, vinyl, HEflip) | n/a | n/a | – | – | n/a | done (T6 pause) |
| H11 nav backdrop-filter (fixed, all y; radius per morph frame) | n/a | radius as CA keyframe: render-bound | n/a | n/a | – | – | n/a | – |

Summary per column:
- **SDA:** fastwork has built the one place where SDA fits on the phone (hero v2).
- **rAF+batch, IO:** fastwork already has both.
- **cache:** half done (N12).
- **vscroll, VT:** negative on the phone.
- **CA, listen:** the only columns with open PoCs.

## 3. Hotspot cards (per frame: code, work, thread, library alternative, WebKit cost, already done?)

### H1. Scroll engine: `rE`/`iE`/`dE` (JS 2663-2783)

- **Per frame.**
  - One `scroll` and one `resize` listener on `window`, `{passive: true}` (2677-2678).
  - `rE` coalesces to one `requestAnimationFrame(iE)` (2668).
  - `iE` runs every active callback (2672).
  - Eight callbacks are registered through `dE`: 3143 commission, 4239 hero, 4736 pain, 6269 profile popover
    (desktop only: `j` returns at ≤ 860 px, 6217), 10977 profile, 11359 future, 12448 platform, 13090 nav.
- **Gating.**
  - An IO with `rootMargin: 100% 0px` flips `data-start-selling-scene` and `active` (2709-2747).
  - `sE` sets `data-start-selling-render=deferred` (content-visibility) two rAFs after deactivation, and reads the
    height first (2689-2707).
- **Reads per frame on a 430 px phone (aw1-10e, fix-scroll-engine).** Seven callbacks still read layout while
  their scene is active:
  - commission `a`: `innerHeight` + 2 rects;
  - hero `s`;
  - pain `d`;
  - profile `f`;
  - future `l`;
  - platform `n`;
  - nav `_`: rects + `visualViewport`.
- **Trampolines.** Five of the eight re-schedule their own rAF from inside `iE` (e.g. 3128, 4174, 10972, 11328,
  12445), so their read-then-write runs one frame late, each after the previous one's writes.
- **Thread today.** Main thread only. It could move nowhere: it is the main-thread *driver* of the effects.
- **Library equivalents.**
  - GSAP's ticker, the Motion frameloop and the anime.js engine are the same single rAF.
  - Motion's frameloop phases (`read … render`) and fastdom are the measure/mutate split.
  - ScrollTrigger's listener is passive, like ours.
- **Already done or measured.**
  - scroll-engine /01 (measure/mutate, parked) cut forced layout 92 → 69 ms (Chrome 6x); frames > 20 ms stayed
    within noise and > 50 ms 5 → 5.
  - The architecture review concluded that batching can't remove a frame's own style recalc.
- **What a library adds:**
  - **cache:** ScrollTrigger's `refresh()` and anime.js's ResizeObserver; see H4/H8.
  - **toolbar filter:** GSAP ignores a resize unless the width changed or |Δh| > 25 % of `innerHeight`; anime.js
    and Apple measure `100lvh`. This equals topic 10 / T9's height-only debounce.
  - **always-on timers:** GSAP adds `_rafBugFix`, an eternal rAF, and a 250 ms `setInterval` (M4). Locomotive adds
    its own eternal rAF (M3). That idle work fastwork doesn't have, and the idle triple (protocol v2 L4) would flag it.
- **WebKit cost.** None new. **Verdict:** nothing to adopt beyond what /01 and N12 already built.

### H2. Hero exit (JS 4163-4175 `s`, CSS 1528-1530, 1577-1588, 1727-1737, 1906-1936)

- **Per frame (baseline).**
  - **Read:** `b.getBoundingClientRect()` on `.hero-track` and `innerHeight` (4168-4170).
  - **Write:** `setProperty('--exit-opacity')` and `pointerEvents` on `.hero` (4171).
  - **What the write restyles:** `--exit-opacity` and the derived `--exit-scatter` are unregistered and inherited
    (CSS 1529-1530), so the write restyles the ~230-element hero subtree (hero.md §1.1).
  - **Consumers:**
    - 4 orbit cards (opacity, `translate`, 1577-1587; `will-change: transform, translate, scale, opacity`);
    - `.hero-copy` (opacity, `filter: blur()`, transform, 1734-1736);
    - `.scroll-cue` (`filter: blur(calc(var(--exit-scatter)*18px))`, 1911/1933): a filter value changing every
      frame.
  - **Scheduling:** the callback is a trampoline (`c` → rAF `s`, 4173-4175).
- **Thread today:** main (JS + style), plus a re-blur.
- **Could move to:** the render server, because all of its consumers are accelerated properties.
- **Library mechanism.**
  - Motion `scroll(animate(...))` would create native ViewTimelines for opacity/transform/filter (M6). Its
    callbacks (`useScroll`) also start a JS tracker that reads the `offsetTop` chain every scroll frame.
  - GSAP `scrub` would keep JS per frame (M4): worse than v2.
- **Already built.**
  - **hero v2** (fix-hero-exit, `fixes/hero-exit-scroll-timeline/patch.diff`, CSS hunk at 2128) puts opacity +
    transform + translate on one `view-timeline: --hero-exit` over `.hero-track`, `contain 0%–100%` (T12).
  - The blur is its own keyframes `blur(0px) → blur(18px)`, so the lists match, with range `contain 0.05%` and no
    fill: at rest the computed filter is `none`.
  - No `var()` is animated; unsupported engines keep the JS path.
  - **Measured:** y≈50 43 → 35 ms. The 0.72 flip got +7-10 ms, WebKit only.
- **WebKit cost of the mechanism (the reason it's not free):**
  - 7 accelerated effect stacks live for the page's life;
  - candidate "assumed overlap" layers under the transform-animated `.hero-copy` (hero.md §2D candidate 1), and/or
    an effect resync on a big commit (candidate 2).
  - The hero-B bisect (variants v6noflip, v7copyop, v4nocards, v5noblur) is queued and has no verdict yet.
- **Verdict:** Motion's best case equals what is built. The only "PoC" here is the bisect already queued.

### H3. The 0.72 flip and the #people reveal (y≈587-745)

- **Per frame.**
  - Two consumers compute hero progress from the same rect:
    - future `l` (JS 11305-11310, `z(y, …≥0.72)`);
    - nav `_` (13002-13010, `z(p, …≥0.72)`).
  - At the crossing the future card goes from `visibility: hidden; opacity: 0; filter: blur(14px)` to
    `visible; opacity: 1; filter: none` with a 1.6 s filter transition (CSS 2393-2412). That is `blur(14px) → none`,
    CA-eligible: `validateFilterOperations` says "Empty filters match anything" (F-053 CONFIRMED; webkit.md §1's
    "never `none→blur`" is REFUTED).
  - The nav leaves `is-hero-pill` (max-width/padding/gap transitions: layout per frame).
  - People-o widens with `grid-template-columns` + `height` (F-032, slow finger only).
- **Thread today:** main (style, layout, the reveal blur), plus the first raster of a 430×775 layer.
- **Library mechanism.**
  - An IO trigger plus a class is what Motion `inView` or `toggleActions` do; we already have it.
  - Motion's `animate(filter)` would hit the same WebKit rule: the lists must match.
  - A **View Transition** of the reveal is worse (§4.6).
- **Already planned:** **h1** (opacity + `inert` pre-raster instead of `visibility`, `blur(14px)→blur(0px)` with
  matching lists, no inherited toggle in the reveal frame): measured −11-13 ms at the flip (P-008).
- **In the aw1 base: T10's tail, now a suspect.** large-area-blur replaced the 1.6 s `cubic-bezier(0.16,1,0.3,1)`
  filter transition with `filter 0.7s linear(…)` / `0.9s linear(…)` (`fixes/large-area-blur/patch.diff`, rules
  after CSS 2400 and 2410). By F-048 a `linear(<points>)` easing makes it main-thread style + commit on every frame
  for 0.7-0.9 s, right inside the y≈587-745 flip window.
- **The exact CA-safe equivalent.** The truncated curve is exactly a cubic-bezier (de Casteljau split, y
  renormalized; arch-oss-survey):
  - 0.7 s: `cubic-bezier(0.2350, 0.6733, 0.4511, 0.9140)`;
  - 0.9 s: `cubic-bezier(0.2116, 0.7565, 0.4035, 0.9503)`.
- **Endpoint (resolved).** The endpoint is still `none` (CSS 2408). My caveat was that this might keep the filter off
  the CA path. WebKit's `validateFilterOperations` says otherwise ("Empty filters match anything"; F-053
  CONFIRMED by arch-claims), so the cubic-bezier baseline was CA, T10's `linear()` is the regression, and no
  endpoint change is needed. ca-check pair (d) is the device confirmation.
- **Verdict:** library mechanisms add nothing beyond h1. The WebKit timing-function rule turns T10's form into a
  PoC (`blur-easing-cubic`).

### H4. Nav per-frame callback `L`/`_` (JS 12955-12977 `F`/`ee`, 13000-13011 `_`, 13077-13079 `L`)

- **Per frame.**
  - `ee()`: `querySelector` + `getComputedStyle` + 2 rects (12964-12977).
  - `F()`: 1 rect, `pointerEvents='none'` → `elementFromPoint` → restore (12955-12963), a write-read-write.
  - The `.hero-track` rect (13007).
  - While morphing: `scrollTo({behavior:'instant'})` pin (13078).
  - Svelte state writes `z(v)`, `z(g)`, `z(p)`.
- **Thread today:** main.
- **Library mechanism:**
  - ScrollTrigger-style **refresh-time cache** (positions measured once, numbers per frame);
  - nav theme by declared ranges (Apple §2.10);
  - anime.js measures bounds on ResizeObserver.
- **Already built:**
  - **T11** (`elementsFromPoint`, no writes);
  - **N12** stage 1, an offset cache for `L`/`_` with a ResizeObserver plus the breakpoint MQ plus `fonts.ready`,
    and declared section ranges. It is recorded as within noise in Chrome; the phone check is pending.
  - F-018: edge caches break on sticky and scroll-transformed containers.
- **Verdict:** done in the library's own form. Gain on the phone is unproven: no phone JS measurement exists (§5,
  item 5).

### H5. Morph tween (JS 12683-12701, 13013-13036; CSS 5392-5393, 10545-10549, 11320-11349, 11433-11440, 11564-11586)

- **Driver.** `E(t)` starts a **680 ms ease-out-cubic time tween** (`ZM`, 12694-12698). It is triggered by the sign
  of a wheel or touch delta (`XM`, 12691), not scroll-scrubbed and not a spring. `1-(1-τ)^3` ≡
  `cubic-bezier(1/3,1,2/3,1)` exactly (F-038).
- **Writes per frame.**
  - Svelte `x`, which feeds the inline `--morph` on `header.start-selling-top-nav` (13243) plus 8 class
    toggles (13195-13238).
  - `--morph-fade` and `pointer-events` on `#platform` (13013-13018).
  - Both properties are unregistered and inherited.
- **Consumers on the phone (≤ 640 px).** The `.start-selling-morph`/`-pill` rules (CSS 10439-10560) are dead CSS
  with no markup (fix-nav-morph), so they are excluded.

  | consumer (CSS line) | f(m) on the phone | WebKit thread |
  |---|---|---|
  | nav `height` (11335, vars 11568-11570) | 52 → ~791 px | main: layout + resized backing store |
  | nav `width` (11331-11334) | 398 → 406 px | main: layout |
  | nav `top` (11571) | 16 → 12 px | main |
  | nav `border-radius` (11341) | 32 → 20 px | main |
  | nav `background: color-mix(#ffffff1a, #131922)` (11336-11340) | glass → opaque dark | main: repaint |
  | nav `backdrop-filter: blur(20px·(1-m))` (11342-11343) | 20 → 0 px radius | value on main; re-blur in the render server |
  | logo `left` + `translate` (11433-11434) | re-centring | main: layout |
  | actions `gap` (11585) | 4 → 0 px over m 0-0.2 | main: layout |
  | panel `filter: blur`, `opacity`, `scale(0.96+0.04m)` (10545-10549) | | CA-able only as real-property keyframes |
  | `#platform` `filter: blur((1-fade)·12px)`, `opacity: fade` (5392-5393) | | CA-able likewise |

- **Measured cost (driver M, morph-endpage §6, PREDICTIONS):**
  - JS ~1 ms (F-033);
  - steady moving p50 g 29-34 → gh 24 ms;
  - the blur radii are not rAF-visible: ghbn ≈ ghb ≈ gh (25/26/27);
  - the first frame is 49-54 ms (layer creation at the scene flip, R5);
  - de-pm-morph places the excess in a ~300-400 ms start transient (P-016 queued).
- **Thread it could move to:** only the panel and `#platform` opacity/filter/scale, and the colour change written as
  a `#131922` opacity layer (F-039), can go to the render server.
  - The shape (height, radius) can at best become `clip-path: inset(… round r)` on a size-stable box (R2/a1). That
    is still main thread, but only a mask update: no layout and no raster.
  - The backdrop radius is render-server work whatever drives it.
- **Library mechanism.**
  - Motion `animate()` would put `clipPath` and `backgroundColor` on WAAPI, which is accelerated in Chrome but runs
    on the main thread in WebKit (M5).
  - Motion's layout projection (scale plus per-child counter-scale and radius correction) would remove the resize.
    But it is JS per frame, not exact, and text inside a scaled layer re-rasters at the end.
  - Pill → panel is a 15× height change with a 2 % width change, so a plain `scale` + cross-fade is **not**
    design-equivalent.
  - A scroll timeline doesn't fit a time tween without a design change (N8).
- **WebKit cost of the CA route:**
  - starting ~5 CA animations and their layers at tween start falls inside the start transient;
  - the panel's `filter` over composited descendants is an offscreen pass either way, so GPU work doesn't shrink;
  - gains show only in Instruments render hitches (L13) and on touch frames, and only for the CA parts.
- **Already built:** gh (size-stable panel, the first half of a1); `fixes/morph-webkit/probes/fw-clip-probe.html`
  (a static clip probe, waiting for the user's look). R3 (WAAPI) and a1 are not built.
- **Verdict:** PoC 5, as a D-stage diagnostic after P-016, not a gain PoC.

### H6. Morph listeners and the y≈1960 frame (JS 13060-13087)

- **What happens.** When `#platform` comes within 200 % (the IO at 13082-13087), `N()` adds `wheel`
  `{passive:false, capture:true}`, `touchstart {passive:true}` and `touchmove {passive:false, capture:true}` on
  `window` (13060-13066).
- **Cost (data, P-011, NAMED).**
  - The frame that adds them costs style 34-42 ms + composite 58-72 ms on WebKit, with JS ~1 ms.
  - Arming at setup (`mw10e-na`) cut it from 104/107 to 34/35 ms.
- **Mechanism.** The touch event regions are rebuilt page-wide (§1). After arming, every `touchmove` on the page
  waits for the main thread: finger medians +6-17 ms (morph-endpage §6.1).
- **Library mechanism.** All of these add their listeners **once at construction**:
  - Lenis and Locomotive: non-passive wheel and touch\* on `window`, and they never remove them (M3);
  - GSAP Observer: gesture-scoped;
  - ScrollTrigger: a passive scroll listener only.

  "Arm once" fixes the edge frame. Lenis's version makes the whole page a synchronous touch region **for its whole
  life**, the cost the S driver can't see. fix-nav-morph confirms its F1/F2 (`arm-load`/`arm-idle`) do the same
  on `window`; changing passivity later re-adds the listener and costs the same rebuild.
- **Thread:** input dispatch. Only the region's *extent* can be chosen; a non-passive listener always needs the
  main thread.
- **Verdict:** PoC 4. Arm once **and** scope to `#platform` + the nav (fix-nav-morph's F3, currently its fallback).

### H7. Countdown (JS 3789-3803 spring `GE`, 3823-3876 digit `$E`, 3931-3942 1 s interval; CSS 1397-1415)

- **Per frame while a digit moves.**
  - A spring {stiffness 280, damping 18, mass 0.3} (3789), integrated by semi-implicit Euler in ≤ 16 ms substeps
    (3791-3803), one rAF per digit (3836-3838).
  - It writes Svelte state `a`, which re-evaluates `transform: translateY(KE(r,a)·c px)` on the digit's 10 `.face`
    spans (3862). Each `.face` has `will-change: transform` (1408-1415): ~75-85 layers per countdown, with a second
    countdown in the morph panel.
  - The interval writes `Date.now()` once per second (3933-3936).
- **The math.**
  - Each new target restarts with velocity 0 (3834), and the ODE is linear, so **every tick follows the same
    normalized curve**: one easing reproduces all ticks.
  - ω0 = √(280/0.3) = 30.6 rad/s, ζ = 18 / (2√(280·0.3)) = 0.982: overshoot ≈ 1e-7, i.e. none.
  - It settles in ~340 ms by the code's thresholds.
  - The JS curve depends on the frame interval (8.33 vs 16 ms Euler steps), so parity means ±1 device px at frozen
    times (F-008), not 0 %.
  - All derived.
- **Thread today:** main (JS + style per frame, ~42 frames/s at 120 Hz for the seconds digit). It could move to the
  render server: a `translateY` on one strip per digit is accelerated.
- **Library mechanism.** Motion turns springs into `linear()` sampled at 10-30 ms and hands opacity/transform to
  WAAPI (M5). **On iOS 26.6.1 that form runs on the main thread** (F-048: `linear(<points>)` disqualifies the
  legacy CA path).
  - The CA-safe form is Svelte 5's: WAAPI keyframes pre-sampled every ~16 ms with linear segments, on one strip per
    digit.
  - ~22 keyframes cover the ~340 ms; a `cubic-bezier` fit would be close but not exact.
- **Already built:**
  - countdown-idle-raf/03 (landed: IO pause, ±1-cell clamp, an `active` prop for the hidden panel);
  - /05 (one strip per digit, ~80 → 8 layers, still one JS transform write per frame);
  - /08 (strip `will-change` only while live).

  None removes the per-frame JS spring.
- **Felt cost:** hero.md (C), 35-58 ms idle spikes at ~1 Hz. The countdown is attributed **by period only**;
  scroll-engine/08's freeze cut Chrome's idle worst frame 16.3 → 10.3 ms.
- **WebKit cost of the mechanism:** one animation start and commit per tick, plus 8 strip layers (small). It cannot
  touch the touch regions.
- **Verdict:** PoC 3, after a Timeline attribution of the 1 Hz spike.

### H8. Shrink lerps: commission `a` (JS 3106-3128), future `l` (11303-11328), profile `f` (10928-10972), platform `n` (12436-12446)

- **Per frame.**
  - Read: rect(s) + `innerHeight`.
  - Ease toward the target: `n += (m − n)·0.22` (3115-3116, 11315).
  - Write: `--commission-*`, `--future-shrink`, `--profile-scale`, the platform Svelte state.
  - Re-schedule the rAF until converged (~20 frames).
- **Already done:**
  - this is ScrollTrigger `scrub: <n>` and the Locomotive lerp, written by hand;
  - on phones the visuals are neutralized by CSS, and T1 already gates the writes (FINDINGS T1);
  - commission's `Range.getClientRects` was moved off the frame (T4).
- **Library or SDA mechanism.** An SDA conversion is on DIRECTION's list ("future/platform/commission/profile
  next"). Its gain is **desktop only**: these effects don't render on a 430 px phone. The reads remain on the phone
  (fix-scroll-engine), which is H4's cache question.
- **Verdict:** no iPhone PoC.

### H9. Reveal-on-scroll and count-ups (e.g. JS 6261-6267, IO threshold 0.35; 12005-12021 count-up rAF; 3130-3138 commission IO)

- **Per frame.** None while static. The IO fires once and then a CSS transition runs, or an rAF count-up writes
  Svelte numbers for 1.08 s (12008-12019, text repaint).
- **Library mechanism:** Motion `inView` / ScrollTrigger `toggleActions` = the same IO.
- **WebKit-relevant details:**
  - transitions from `none` to `blur(…)` are not accelerated, so rewrite them with matching lists (h1);
  - `linear()`/`steps()` easings are main-thread on the phone (F-048).
  - large-area-blur's `start-selling-entry-blur-in` entries use `cubic-bezier`, so they are fine.
- **Verdict:** the trigger is done and there is nothing to adopt; the easing form is H3's PoC.

### H10. CSS infinite loops

- **Compositor-only already:** marquees (90/56/16 s transforms), the vinyl rotate (CSS 3849-3856), `.scroll-float`,
  HEflip (WAAPI, landed by layout-animations T5).
- **Main thread with no library fix:**
  - `background-position` text sweeps (CSS 5802-5808, 7631-7636): not accelerated in WebKit;
  - `stroke-dashoffset` / SMIL;
  - Motion's WAAPI would run them on the main thread just the same. T6's off-screen pause is the right lever.
- **Vinyl.** F-041's per-frame feed repaint is the vinyl under `mask-image`. That is the mask context, not the
  animation driver.
- **Verdict:** nothing to adopt.

### H11. Nav `backdrop-filter` (CSS 11342-11343)

- **Per frame.** The blur is always on, re-blurs whatever scrolls behind the nav, and changes radius per morph
  frame.
- **Library mechanism:** none; it is a design property.
- **Already planned:** R8 (gate it off at m ≥ 0.55 over a provably uniform backdrop).
- **Cost class:** render-bound, scored only by Instruments render hitches (L13). It is held at LOCATED until T10
  works.
- **Verdict:** not a library question. It stays in fix-nav-morph's R8.

## 4. Library by library: what to take and what to avoid (fastwork view; sources in arch-oss-survey's note)

### 4.1 GSAP 3.15 / ScrollTrigger (M4)

**Take** (already taken):
- refresh-time rect caching → N12;
- the toolbar resize filter → topic 10 / scroll-engine's height-only debounce.

**Avoid:**
- `scrub` (main-thread JS per frame);
- `normalizeScroll` (takes over touch scrolling);
- the eternal `_rafBugFix` rAF and the 250 ms `_sync` interval (idle work).

`force3D: "auto"` demotes the layer at tween end, i.e. layer churn per tween: the opposite of our R5 (keep layers
across tweens).

### 4.2 Motion 13 (M5-M7)

**Take:** springs → pre-sampled easing on WAAPI, for WebKit-accelerated properties only (PoC 3). Use Svelte-style
sampled keyframes, **not** Motion's `linear()` output, which is main-thread on iOS 26.6.1 (F-048).

**Know:**
- `clipPath`/`backgroundColor` "acceleration" is Chrome-only;
- `x`/`y`/`scale` motion values run in JS;
- `useScroll()` always also starts a JS tracker that reads offsets every scroll frame;
- `scroll()` is native only for WAAPI-eligible values with range-mappable offsets. That best case = hand-written
  `animation-timeline`, which fastwork has (hero v2).

### 4.3 Lenis 1.3 / Locomotive 5 (M3)

**Avoid on the iPhone:**
- non-passive wheel/touch\* on `window` for the page's life, even with `syncTouch: false`;
- smooth wheel = a main-thread lerp writing `scrollTo` per frame;
- Locomotive adds an eternal rAF.

**Take:** only "add listeners once, at construction" (already NAMED: H6).

### 4.4 fastdom / the Motion frameloop / the anime.js engine (M7, M8)

These equal scroll-engine /01, which was measured without a frame-class change. **Take:** "the loop sleeps when
empty" is already true of `iE` (one rAF per scroll event).

### 4.5 Native CSS scroll-driven animations

The one mechanism that moves per-frame work to the render server on 26.4+ (§1). Fastwork has it for the hero exit.

**Costs to price before any new SDA work:**
- the y≈700 +7-10 ms (accelerated stacks and/or assumed overlap, bisect queued);
- `@supports (animation-timeline: view())` can't tell threaded 26.4+ from main-thread 26.0-26.3 (webkit.md).

Further SDA conversions (H8) pay on desktop only.

### 4.6 View Transitions (rejected for this page)

1. **Snapshots don't follow the scroll** (inference from the spec's snapshot-containing-block model; arch-oss-survey
   to confirm the wording). A scroll-triggered change (the 0.72 flip, reveals, the morph armed by scroll) would show
   captured content at stale positions while the page moves.
2. **The iOS toolbar collapse changes the viewport.** The spec skips a transition whose snapshot containing block
   size changes (to confirm, arch-oss-survey). On the phone that is any scroll near a toolbar change.
3. **Starting a transition captures full-viewport snapshots.** That is a raster burst in the first frame, exactly
   where the morph's 49-54 ms first frame and its start transient already sit.
4. **A VT can't be scrubbed or reversed mid-flight** (`skipTransition` jumps). The morph reverses on the next
   gesture.

## 5. PoC shortlist: my view

Each entry gives:
- expected effect;
- risk;
- the driver that can prove it (protocol v2 §5.4);
- the stage it starts at (§2).

The joint list (shortlist v2) was agreed with arch-oss-survey on 2026-10-01 after F-048; its write-up is in
`research/architecture/oss-rendering-libs.md`. All effects are derived unless marked data.

| # | PoC | OSS idea it demonstrates | expected effect | risk | driver | starts at |
|---|---|---|---|---|---|---|
| 1 | **ca-check**: a standalone device page, no fastwork code. Transform/opacity/filter animations with `cubic-bezier` vs `linear(<points>)` vs pre-sampled keyframes; `none→blur(14px)` vs `blur(0px)→blur(14px)`; one scroll-driven control; one `backdrop-filter` radius animation; all while JS busy-loops for 1 s. A screen recording shows which keep moving | decides which library form is CA on WebKit 26.6.1 (F-048) | settles the CA question for PoCs 2, 3 and 5 at once, in ~10 min of phone time | none (no fastwork code, no timing claim) | screen recording (device framebuffer, not rAF), not one of S/W/M/G/F | **R/D** mechanism evidence; a slot ticket like any phone use |
| 2 | **blur-easing-cubic**: T10's two `linear()` filter tails → the exact cubic-bezier splits (§3 H3), plus h1's `blur(0px)` endpoint if ca-check says `none` disqualifies | Svelte/Motion "any curve as an easing", in WebKit's CA-safe form | the future-card reveal blur leaves the main thread for its 0.7-0.9 s inside the y≈587-745 window: no per-frame style + commit from the card after the flip frame (the flip frame itself is h1's) | low: the curves are exact by construction and keep T10's shorter tail | **W** (y 500-900); mechanism: a Timeline attribution run shows no per-frame style from the card | **F** after ca-check (D card = exact curve + ca-check result); owners large-area-blur / fix-hero-exit (h1) |
| 3 | **countdown-ca**: one strip per digit (/05 layout) + the spring as one pre-sampled WAAPI keyframe set per tick (~22 keyframes at 16 ms, linear segments), 0 JS per frame | Motion's spring → easing on WAAPI, in Svelte's sampled form (Motion's own `linear()` output is main-thread here) | countdown style writes per frame → 0 (one animation start per tick); layers ~80 → 8; the ~1 Hz 35-58 ms idle spikes → < 37.5 ms **if** the attribution names the countdown | low: parity ±1 device px at frozen times; the 9 → 0 wrap needs a strip reset when the animation ends | **W** (hold at y=0, idle), S for no-regression; Timeline: no countdown style per frame | **I → D** (attribute the 1 Hz spike with a Timeline run, F-047, before building); owner fix-countdown-idle-raf |
| 4 | **listener-scope**: wheel/touchmove armed once at setup on `#platform` + the nav, not `window` (= fix-nav-morph's F3) | Lenis/Observer "arm once", minus Lenis's window-wide synchronous region | the y≈1960 edge frame as `na` (104 → 34 ms, data P-011); no synchronous touch region above `#platform` (WebKit regions per element: vendor source, inference for our case); touches that start on the fixed nav (a 52 px strip) stay synchronous | low: the morph must still catch a gesture that starts on the nav or the panel; mechanism check = the listener targets + a touch-latency probe | S (edge frame, no-regression), **G or F** for per-touch latency (§3.6) | **F** (built on the NAMED P-011 card); owner fix-nav-morph |
| 5 | **morph-ca**: a1 (full-size box + `clip-path: inset(round)` + `#131922` opacity layer) + panel/`#platform` opacity/filter/scale as real-property WAAPI keyframes with `cubic-bezier(1/3,1,2/3,1)` + the R8 backdrop gate | Motion's WAAPI hybrid, restricted to WebKit's accelerated list | rAF: ≤ 1 tick on steady moving frames (JS is 1 ms; blur not rAF-visible); render-server hitches: unknown sign; touch frames: better only for the CA parts (the clip still needs the main thread) | medium: bar ±1 px; the clip look needs the user's eye; interruption (cancel, restart from m_now); the CA starts land in the start transient | M (no-regression), **Instruments render hitches** (the gate for render-bound), G/F before landing | **D** diagnostic, after P-016 and ca-check; owner fix-nav-morph |
| – | *(not new)* **hero v2 bisect** | Motion `scroll()`'s best case = native view-timeline | decides whether the +7-10 ms at the flip is assumed overlap (fixable pixel-identically with a clipping wrapper) or an effect resync | – | W (0-1500) | already queued (hero-B: v6noflip, v7copyop, v4nocards, v5noblur) |
| – | *(conditional)* **refresh-cache** for the 7 remaining per-frame readers | ScrollTrigger `refresh()`, anime.js ResizeObserver bounds | ~0 unless the phone's rAF JS in the 20-34 ms band is ≥ ~3 ms (never measured) | low-medium (F-018: sticky and transformed containers) | S | **R** (a census of `jsMs` from v2 standard-probe runs first) |

**Rejected for the phone (both of us):**
- Lenis and Locomotive (window-wide non-passive listeners for life, main-thread scrollTo lerp);
- GSAP `scrub` and `normalizeScroll`;
- fastdom and the Motion frameloop (= scroll-engine /01, measured: forced layout 92 → 69 ms, frame classes unchanged);
- the scroll-timeline polyfill (a no-op on Safari 26);
- View Transitions (§4.6).

### 5.1 My ranking, and where it differs from arch-oss-survey's

arch-oss-survey's order is the table's: 1 ca-check → 2 blur-easing-cubic → 3 countdown-ca → 4 listener-scope →
5 morph-ca. I agree with the content of every item. By expected felt gain my ranking is
**listener-scope > blur-easing-cubic > countdown-ca > morph-ca**, with ca-check as the cheap gate for the last three.
We differ on three points.

1. **listener-scope should not wait behind ca-check.**
   - It is the only PoC whose mechanism is already NAMED and whose gain is measured (P-011), and it depends on no
     CA question. It should run in parallel, in fix-nav-morph's queue.
   - It is also the most direct lesson from the libraries. Lenis-style "arm once on `window`" fixes the edge frame
     but makes the whole page a synchronous touch region for life, which is exactly what fix-nav-morph's F1/F2 do.
     F3 should be the primary variant, not the fallback.
2. **blur-easing-cubic may need the endpoint fix too.**
   - The card's filter runs from `blur(14px)` to `none` (CSS 2396 → 2408): non-matching lists. If that already
     keeps it off the CA path, the baseline was main-thread as well, and the cubic-bezier alone changes nothing.
     The PoC must then also carry h1's `blur(0px)` endpoint.
   - So "T10 moved the reveal onto the main thread" is a hypothesis, not a finding, until ca-check runs with the
     `none` vs `blur(0px)` pair (acked on F-048 with this caveat).
   - **Update (arch-oss-survey, source).** WebKit `GraphicsLayer::validateFilterOperations` (`GraphicsLayer.cpp`
     807-838, `main`) says "Empty filters match anything", and `none` is an empty list. By source, then,
     `none→blur(14px)` stays CA-eligible on the legacy path: the cubic-bezier baseline was CA, and T10's `linear()`
     is the regression. arch-claims CONFIRMED this (F-053), so webkit.md §1's "never `none→blur`" is REFUTED and
     blur-easing-cubic needs no endpoint change; pair (d) in ca-check is the device confirmation.
3. **ca-check needs two more cases than first drafted:** the `none`-endpoint pair, and a `backdrop-filter` radius
   animation (it decides whether morph-ca's backdrop part can be CA at all). The scroll-driven control keeps the
   page honest: it must keep moving in every run.

On countdown-ca: its felt target is attributed by period only. A Timeline attribution run (F-047) comes before
any build; until then it is a cheap demonstration of the mechanism, not a proven gain. On morph-ca: agreed as a D
diagnostic only; our own data (F-033, P-009/010, ghbn ≈ ghb ≈ gh) predicts that rAF can't score it.

## 6. Open items

- **The ca-check results.** The device confirmation of two source reads:
  - `linear()` is main-thread on iOS 26.x (F-048, citations corrected in F-065; Safari 27 is expected to differ);
  - a `none` filter endpoint does not disqualify CA (F-053 CONFIRMED; webkit.md §1 REFUTED, to be corrected after P0).
- **Phone rAF JS share in the 20-34 ms band.** It gates refresh-cache. The v2 standard probe logs `jsMs` per frame
  (measurement-protocol-v2 §5.5), so a census of runs already taken with it answers the gate at no phone cost.
- **Touch latency of a window-wide synchronous region vs an element-scoped one.** It needs G or F; the S driver
  can't see it (FINDINGS: "scripted scrolls can't see input-handler fixes").
- **`linear()` in flight (checked).** Only T10's two filter tails, carried by every aw1-based overlay. None in the
  countdown variants; HEflip uses `cubic-bezier`. The baseline bundle has no `.animate(` call, so no Svelte
  `transition:`/`in:`/`out:` WAAPI path runs on the scroll path.

## Sources

- **Library source reads:** arch-oss-survey's messages M1-M8 (2026-10-01), to be cited with file:line in
  `research/architecture/oss-rendering-libs.md`:
  - lenis 1.3.26 `dist/lenis.mjs` L255, 283-286, 434, 479, 532-540, 617-621;
  - locomotive-scroll 5.0.1 `index.ts` 92-94, 375-378;
  - GSAP 3.15 `ScrollTrigger.js` 758-759, 970-973, 1088-1090, 1431, 2636, 2704;
  - motion 13.4.6 `accelerated-values.ts` 4-10, `linear.ts` 3-16, `spring.ts` 464-478, `attach-animation.ts` 17-26,
    `use-scroll.ts` 112-134;
  - fastdom 1.0.12 `fastdom.js` 185-209;
  - anime.js 4.5.0 `engine.js` 170-177, `scroll.js` 99-106, 191-221, 930.
- **WebKit:** `research/architecture/webkit.md` (§1, §2, §4), `research/design-engineering/safari-render-signals.md`
  (L13), `morph-endpage.md` §1.3/§6, `hero.md` §1.1/§2D.
- **Our data:**
  - `fixes/PREDICTIONS.md` P-001…P-016;
  - `fixes/FINDINGS.md` (T1-T12, P3, F-033, F-036, F-038, F-039, F-041);
  - the owners' answers to de-oss-map (2026-10-01):
    - fix-hero-exit: v2 properties, bisect not run;
    - fix-scroll-engine: /01 numbers, aw1-10e readers, no phone JS share;
    - fix-nav-morph: F1/F2/F3 passivity, R3/a1 not built, dead `.start-selling-morph` CSS.
