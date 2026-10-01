# How apple.com keeps scroll animation smooth, and what it means for our page

By `arch-apple` (architecture team, `fixes/ARCH_TEAM.md`), 2026-10-01. **Audience: the design team and the fix
owners.** Static analysis only: no Chrome, no iPhone, no locks. Apple's public HTML, CSS and JS were fetched
with `curl` (desktop Safari UA, plus an iPhone UA once to compare: the HTML is byte-identical) at a polite rate,
about 25 requests in total, and kept in the session scratchpad, never in the repo. Quotes from Apple's code are
one-liners with their URL. Fastwork code is not quoted; our side is named with the topic vocabulary of
`fixes/TOPICS.md`, `fixes/DIRECTION.md` and `fixes/FINDINGS.md`.

Confidence labels: **observed** (read in apple.com's shipped source on 2026-10-01), **spec**, **vendor doc**
(WebKit blog, Apple developer docs), **vendor source** (WebKit source), **blog** (third party), **inference** (mine).

## 1. Pages studied, and why

| page | URL | why it was picked | page bundle (gzip-less) |
|---|---|---|---|
| iPhone 18 Pro | https://www.apple.com/iphone-18-pro/ | Apple's flagship scroll page this season: scroll-scrubbed camera video (`VideoScrub` x2), a pinned "text over media" section that grows its frame with `clip-path`, 30 staggered reveals, 22 cards with scroll-ranged `will-change`, a 3D product viewer | CSS 1.5 MB, JS 666 KB |
| AirPods Pro 3 | https://www.apple.com/airpods-pro/ | the page family that made the "Apple scroll animation" famous (2019-2020 canvas image sequence); today: scrub video, parallax images, 15 inline videos | CSS 1.0 MB, JS 881 KB |
| MacBook Pro | https://www.apple.com/macbook-pro/ | sticky-heavy (21 `sticky` markers), nav theme that changes per section (`LocalnavThemeChanger`), chip hero, play-once media | CSS 1.1 MB, JS 606 KB |
| Apple Vision Pro | https://www.apple.com/apple-vision-pro/ | the only one of the four that still ships a **canvas image-sequence** player (`VideoScroll`), plus WebGL gradient and 25 inline videos | CSS 325 KB, JS 262 KB |

All four run the same in-house animation runtime (the minified code names it `AnimSystem`, with `ScrollGroup`,
`TimeGroup` and `KeyframeController` classes and a phased rAF executor), plus a "page experience manager" that
decides at load between an **enhanced** and a **base** (static) experience. The patterns below are the same on
all four pages unless a row says otherwise (**observed**).

What Apple does **not** use on these pages (**observed**, 0 occurrences in all four page CSS files):
`content-visibility`, `contain:`, `animation-timeline` / `view-timeline` (CSS scroll-driven animations),
`requestIdleCallback`, `scrollend`. Apple gets its smoothness from a JavaScript engine that is cheap per frame,
not from new CSS features. Our direction (scroll-driven CSS, T12) goes further than Apple; the lessons below
are about the per-frame discipline that makes even a JS engine smooth.

## 2. How the four pages do it (investigation)

### 2.1 The scroll loop: one cached number per frame

- **Scroll handler:** `window` `scroll` → store `scrollY` in a shared `pageMetrics` object → call
  `updateTimeline()` on every scroll group. No rect read, no style read (**observed**,
  `/v/iphone-18-pro/b/built/scripts/overview/main.built.js`, `onScroll(){n.pageMetrics.scrollY=window.scrollY||window.pageYOffset, … this.scrollSystems[e].updateTimeline()}`).
- **Geometry is measured once, not per frame:** each group keeps a `WeakMap` of element metrics computed from
  the `offsetTop`/`offsetParent` chain plus `offsetWidth/Height` (layout positions, which ignore transforms), and
  converts every keyframe's `start`/`end` expression (`"t - 150vh"`, `"a0b - 100vh"`, `"css(--x)"`) to absolute
  scroll positions. It refreshes on: resize (debounced 250 ms), breakpoint change, keyframe creation, and an
  explicit `forceUpdate()` (**observed**, `_refreshMetrics`, `onResizedDebounced`). The runtime starts only after
  `document.fonts.ready` (**observed**, all four pages), so the first measurement isn't invalidated by a font swap.
- **Toolbar-collapse filter:** window size is read from a hidden `position:fixed; height:100vh` tracker element
  (`cssDimensionsTracker`), and `resize` is ignored unless that element's `clientWidth/Height` changed
  (**observed**). Because `vh` is the *large* viewport on iOS ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length),
  vendor doc), the iOS toolbar collapse does not change it, so the ~36 toolbar `resize` events we counted
  (TOPICS row 10) would all be dropped (**inference**, strong).
- **Per frame, per group:** `progress = (scrollY - a) / (d - a)`, clamped. If the group was already at a bound
  and still is, `updateTimeline` returns **before touching the DOM or requesting a frame** (**observed**,
  `updateTimeline(e){… if(!this.timelineUpdateRequired&&t&&i&&this.position.lastPosition===e)return …}`).
  A section that is off its range costs a few arithmetic operations, not a callback.
- **One rAF, phased, and it sleeps:** groups that need a DOM change subscribe to a shared rAF executor whose
  phases are `update` (reads) → `external` → `draw` (writes). The executor requests the next frame only while
  something is subscribed; groups resubscribe only while a keyframe still `needsUpdate()` (**observed**,
  `runPhases=["update","external","draw"]`, `_cancel` when the subscriber count reaches 0).
- **Why this is cheap:** `scrollY` and `offsetTop` can force a synchronous layout when layout is dirty
  ([What forces layout](https://gist.github.com/paulirish/5d52fb081b3570c81e3a), blog). Apple reads `scrollY` in
  the `scroll` event, before anything was written this frame, so layout is clean; `offsetTop` is read only on
  resize. No read-after-write, so no forced layout (**inference**, strong). On iOS the scroll itself runs in the
  UI process, and the page only has to keep its own writes cheap ([answers-2.md W2](answers-2.md), vendor source).

### 2.2 What gets written, and where

- **Element-local inline writes:** each `KeyframeController` owns one element and writes to **that element's**
  `style`: a composed `transform` (`matrix`/`matrix3d` from x/y/scale/rotation), `opacity`, or a custom property
  on that same element (attributes starting with `--` are allowed) (**observed**, `onDOMWriteForElement`,
  `handleStyleTransform`, `cssAttributes=this.attributes.filter(e=>p.includes(e)||e.startsWith("--"))`).
  The runtime has no notion of writing a variable on a section root for descendants to inherit.
- **Write only when the value moved:** a keyframe sets `needsWrite` only if its interpolated value changed by more
  than `epsilon` (default 0.05 of the property's unit) (**observed**:
  `KeyframeDefaults:{ease:1,epsilon:.05,…,breakpointMask:"SMLX",…,disabledWhen:[],cssClass:""}` in
  `/v/iphone-18-pro/b/built/scripts/overview/main.built.js`). `ease:1` means the default maps scroll to value
  directly, with no easing tail that keeps running after the scroll stops.
- **Class toggles at range boundaries:** `cssClass` keyframes add/remove a class when scroll enters/leaves a range
  (`toggle:true`), and event keyframes fire `onEnter`/`onExit` once per crossing. State changes are discrete,
  edge-triggered, and computed from cached ranges (**observed**).
- **Properties animated:** CSS transitions are mostly `opacity` (58 of ~130 on the iPhone page), then
  `background-color` (15, on cards) and `transform` (12); a handful of `width`/`left`/`top` (tab-nav indicators);
  `will-change` values are only `transform`, `opacity`, or both (**observed**, CSS counts). The one non-composited
  scroll effect found: the pinned "text over media" frame writes `clip-path: inset(t% l% round Rpx)` on a single
  media container per frame (**observed**, `this._els.mediaContainer.style.clipPath=\`inset(${t}% ${i}% round ${s}px )\``).
  On WebKit a basic-shape clip on a composited layer is a shape-layer mask update, no repaint
  ([webkit.md §9](webkit.md), vendor source).

### 2.3 Layers on a window, not forever

- A shared `WillChange` component toggles a `will-change` class on **each card individually** over the range
  `start:"t - 150vh"` → `end:"b + 50vh"` (**observed**: `const a={start:"t - 150vh",end:"b + 50vh",cssClass:"will-change"}`
  in `/v/iphone-18-pro/b/built/scripts/overview/main.built.js`; 22 cards on the iPhone page, 15 on MacBook Pro).
  In Apple's expression language `t - 100vh` is the scroll position where the element's top meets the viewport
  bottom, so the layer is created half a viewport **before** the element enters and dropped half a viewport after
  it leaves (**inference** from the expression parser's `vh` and anchor terms).
- The pinned media section uses its own window (`--tom-will-change-start: a0t - 100vh` to `a0b`), declared in CSS
  custom properties that the JS reads once (**observed**).
- Staggered reveals put `will-change: opacity, transform` on the items only while the reveal runs
  (`.staggered-start`), and `will-change: auto` at `.staggered-end` (**observed**, CSS).
- On the small breakpoint (≤ 734 px) several components set `will-change: unset` and even
  `backdrop-filter: unset` (product-viewer controls) (**observed**, CSS `@media(max-width:734px)`). Phones get
  fewer layers and fewer blurs.
- **Why it matters on iOS:** each `will-change` composites, layers cost memory and commit work, and under memory
  pressure iOS stops honouring `will-change` ([webkit.md §4](webkit.md), vendor source;
  [WebKit on layers](https://webkit.org/blog/8262/visualizing-layers-in-web-inspector/), vendor doc). Creating a
  layer means painting its backing store in that commit ([answers-2.md W1](answers-2.md), vendor source). Apple
  pays that per element, half a viewport ahead, never for a whole section in one frame (**inference**).

### 2.4 Scroll-linked media: video scrubbing, image sequences as the exception

- **Video scrub (`VideoScrub`, iPhone 18 Pro x2, AirPods Pro x1):** a muted `playsinline` `<video>` with no `src`
  in the HTML. A load range starts the download about 1.5 viewports ahead
  (`data-video-load-kf` `"start":"a0t - 250vh"`), and a progress range maps the pinned section's scroll to
  `0.01 → 1` (**observed**, `iphone-18-pro.html`). The setter is one line:
  `set progress(e){this._progress=e,this.videoEl.currentTime=this.floorDecimal(this.duration*e)}`, with
  `currentTime` floored to 0.01 s (**observed**, same JS). Safari gets an MP4 (MOV when alpha is needed), other
  browsers a VP9 WebM streamed through MediaSource; the file is chosen per breakpoint, `_2x` only when the
  element asks for retina (`data-res="retina"`) (**observed**, `videoExtension`, `videoURL`).
- **The file is built for seeking (observed, MP4 header of the iPhone camera scrub, `small_2x.mp4`,
  first 400 KB fetched with a range request):** H.264 (`avc1`), 1128x1236, 5.0 s, 299 frames (60 fps),
  **60 sync samples = a keyframe every 5 frames**, `moov` before `mdat` (fast start), no audio track, 5.0 MB.
  Short GOPs make each seek decode at most a few frames; third-party guidance for scrub video is the same
  (keyframe every 1-5 frames: [Muffin Man](https://muffinman.io/blog/scrubbing-videos-using-javascript/),
  [ffmpeg gist](https://gist.github.com/jeffpamer/f3134c5145238d0fd4752221b2d75eb7), blog).
- **Why it's smooth on iOS:** the main thread only assigns a number; decoding happens in the media pipeline and
  the video is its own composited layer (**inference**, medium: I did not read the WebKit media code). One
  element replaces what would otherwise be dozens of DOM nodes animating together.
- **Canvas image sequence (Vision Pro `VideoScroll`):** `progress → Math.round(p * frames)` → `ctx.drawImage`.
  Frames load in **binary-subdivision order** (first, last, priority frames, then the middle, then quarters, …)
  and a missing frame is replaced by the nearest loaded one, so the sequence scrubs coarsely at once and sharpens
  as it loads; loading only proceeds while the section is in its load range (**observed**, `splitArray`,
  `loadBucket`, `renderIndex`). One cost Apple accepts: `getImageData(0,0,1,1)` after every draw to tint a fill
  canvas (a GPU readback per frame) (**observed**). This is the 2019-2020 AirPods Pro technique
  ([CSS-Tricks, 2020](https://css-tricks.com/lets-make-one-of-those-fancy-scrolling-animations-used-on-apple-product-pages/),
  blog), now the minority pattern.

### 2.5 Media loading and image sizes

- Every `<picture>` has three breakpoint sources (`max-width:734px`, `max-width:1068px`, `min-width:0`), each
  with a 1x and a `2x` file, JPEG or PNG; no AVIF/WebP, no 3x (**observed**: 490 `_2x` and 0 `_3x` references on
  the iPhone page). A DPR-3 iPhone gets the 2x file: Apple caps image density at 2x
  (same reasoning as [Twitter engineering, 2019](https://blog.twitter.com/engineering/en_us/topics/infrastructure/2019/capping-image-fidelity-on-ultra-high-resolution-devices.html), blog: 3x looks the same and costs ~1/3 more).
- **Lazy by scroll range, not `loading=lazy`:** images carry `data-lazy` and a
  `data-download-area-keyframe` such as `{"start": "t - 150vh", "end": "b"}`; until then a 1x1 GIF source wins
  (**observed**, `airpods-pro.html`). A static fallback image is `disabledWhen: ["enhanced"]` (not downloaded when
  the video will play). 0 `loading="lazy"`, 0 `decoding="async"` on all four pages (**observed**).
- **The DOM is server-rendered and stays mounted.** Galleries hide inactive items with `hidden="until-found"`
  (find-in-page still works) (**observed**). Nothing large is created during scrolling.

### 2.6 Input listeners

- On `window`/`document` the pages listen to `scroll` and `resize` only (scroll events can't be cancelled, so
  they never block scrolling) (**observed**, all four page bundles; also Apple's analytics library, which computes
  element view state on `scroll` from metrics cached on `resize`).
- Touch and pointer listeners exist only inside interactive widgets and only **during a gesture**: the 360°
  viewer adds a non-passive `touchmove` to `document.body` on `touchstart` and removes it on `touchend`; the
  slider adds `pointermove` on `pointerdown` (**observed**, `_onMouseDown`, `_onDetentSliderPointerMove`).
  `preventDefault()` only `if (e.cancelable)`.
- **Why:** a non-passive touch listener makes the region synchronous, so the UI-process scroll waits for the main
  thread ([WebKit bug 184250](https://bugs.webkit.org/show_bug.cgi?id=184250), bug;
  [webkit.md §6](webkit.md)). Apple never has one armed while the user is just scrolling the page.

### 2.7 Choosing the experience: enhanced vs base, reduced motion, Low Power

- A head script and a "page experience manager" put `enhanced` or `no-enhanced` on `<html>` once at load. The
  shared library has validators named `ReducedMotion`, `LowPowerMode`, `TextZoom`, `InvalidViewport`
  (e.g. phone in landscape), `SmallDesktop`, `BreakpointChange`, `AlphaVideoUnsupported`, `SafariMinVersion`;
  each page picks a subset (iPhone 18 Pro: breakpoint change, invalid viewport, small desktop, text zoom, plus a
  page mixin) (**observed**). The base experience shows static end frames and skips scrubbing.
- **Low Power Mode detection** in that library: append a tiny muted `playsinline` video and call `play()`; a
  `NotAllowedError` means Low Power Mode (**observed**, `causeForBase(){return"user in low power mode"}`). iOS
  blocks muted autoplay in Low Power Mode
  ([wojtek.im](https://wojtek.im/journal/safari-autoplay-not-working-in-low-power-mode), blog) and caps rAF and
  CSS animations at 30 fps ([WebKit bug 215745](https://bugs.webkit.org/show_bug.cgi?id=215745), bug). I could not
  confirm that the four pages enable this validator page-wide (they don't list it in the page mixins).
- **Reduced motion:** `html.reduced-motion` / `no-reduced-motion` classes (74 rules on the iPhone page) turn
  staggered reveals into plain visible content, scrub videos into static frames, gallery transitions into
  instant swaps (**observed**). This follows Apple's own guidance to replace vestibular triggers (scaling,
  parallax, plane shifts) with simpler motion rather than remove everything
  ([WebKit, "Responsive Design for Motion"](https://webkit.org/blog/7551/responsive-design-for-motion/), vendor doc).
- **Per-breakpoint keyframes:** every keyframe has a `breakpointMask` (`"SMLX"` by default); a keyframe masked out
  at the current breakpoint is not evaluated at all (**observed**, `determineActiveKeyframes`).

### 2.8 Time-based reveals play once and finish

`StaggeredFadeIn` (30 instances on the iPhone page) fires once when the block's top reaches 85 % of the viewport
(`start:"t - 85vh"`), plays a short JS tween of `translateY` and `opacity` per item with a stagger, then
**removes its keyframes and its `will-change`**; scrolling back up doesn't replay it (**observed**,
`_setupTimeline`, `timeGroup.on("complete",()=>{this.destroy()})`). No blur in the reveal.

### 2.9 Sticky nav and its theme

- The local nav's theme follows the section under it through **declared ranges**: each section that wants a
  different nav theme carries `data-theme-changer`; entering the range `a0t - navHeight … a0b - navHeight` pushes
  the theme class on the nav, leaving pops it (a stack) (**observed**, MacBook Pro `LocalnavThemeChanger`). No hit
  test and no per-frame read.
- The nav background is a separate empty leaf element (`.ac-ln-background`) with
  `backdrop-filter: saturate(180%) blur(20px)` **only while the nav is stuck** (`.ac-ln-sticking`), on a 48-52 px
  bar, with a `noblur` variant; the menu curtain animates `backdrop-filter` as a CSS transition from `blur(0px)`
  (matching function lists) (**observed**, `/ac/localnav/9/styles/ac-localnav.built.css`). A transition with
  matching filter lists runs as a Core Animation animation ([webkit.md §2](webkit.md), vendor source).
- `position: sticky` is applied by the scrolling tree during asynchronous scrolling
  ([WebKit `ScrollingTreeStickyNode.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/scrolling/ScrollingTreeStickyNode.cpp),
  vendor source), so pinned sections move without main-thread work.

## 3. Principles (distilled for the design team)

Each principle: **what Apple does** (evidence above), **why it's smooth on iOS Safari**, **how it maps to our
page**, and whether we **apply** it, **partly** apply it, or **violate** it today (wave 1 on main, plus the
wave-2 topics in flight).

| # | principle | what Apple does | why it's smooth on iOS | our page | status |
|---|---|---|---|---|---|
| 1 | **Measure on resize, compute on scroll.** | Offsets cached from `offsetTop` chains on resize/breakpoint/fonts-ready; per frame only `scrollY` (§2.1) | No read after a write, so no forced style/layout in the frame (blog + inference); iOS scroll is in the UI process, the page only pays for its own writes (vendor source) | Engine callbacks read rects every frame: commission `a` (2 rects, kept for the classes), future `l` (`.hero-track`), nav `ee()` (`getComputedStyle` + 2 rects), nav hit test; forced layout "moves to the next reader" (FINDINGS) | **partly** (wave 1 removed many reads, the rest remain) |
| 2 | **One rAF, reads then writes, and the loop sleeps.** | Phased executor `update → draw`; subscribes only while something changes (§2.1) | One style/layout per frame; idle pages run no frames (inference) | scroll-engine T9 adds measure/mutate; N9 found `iE` idling at ~33 Hz at a gate edge | **partly** (T9 not landed; N9 open) |
| 3 | **Gate by range arithmetic, not by render-state flips.** | Out-of-range groups return before any DOM work; the DOM stays rendered, no `content-visibility` (§2.1, §1) | Nothing changes state at the viewport edge, so no un-skip/relayout frame (inference from W1) | Scene gate (IO `rootMargin 100%`) flips `content-visibility` (WebKit un-skips at zero margin, W1) and `will-change` on whole sections: the iPhone >34 ms clusters (N10) | **violate** |
| 4 | **Write on the element that moves; only when it moved.** | Inline `transform`/`opacity`/own `--var` on the keyframe's element, epsilon 0.05 (§2.2) | An element-local change restyles one element; an inherited var on a root restyles the subtree (web.dev ~850x, [render.md](render.md), vendor doc) | `--morph` (~26 consumers) and, on desktop, `--commission-*`, `--future-shrink`, `--platform-shrink` are written on section/nav roots; T3 write-on-change applied | **partly** (T3 yes, N4 not started; `--morph-fade` registered `inherits:false` in nav-morph) |
| 5 | **Composite-only properties; clip instead of resize.** | Transitions are opacity/transform; the growing frame is `clip-path: inset(round)` on one container (§2.2) | transform/opacity are threaded; a basic-shape clip on a layer is a mask update, no repaint (webkit.md, vendor source) | T5 (layout-animations) and T12 (hero-exit) apply it; the morph still animates width/height/radius/`color-mix` (N2) | **partly** |
| 6 | **Layers on a window, per element, ahead of time.** | `will-change` class from `t - 150vh` to `b + 50vh` per card; during reveals only; unset on phones (§2.3) | Layer creation (backing-store paint) is spread over frames and happens before the element is visible; fewer layers on memory-tight phones (vendor source + inference) | ~160 countdown face layers permanently; the paused-scene rule flips `will-change: auto !important` on whole sections at ±1 viewport (W1/W3) | **violate** |
| 7 | **No input listener on the scroll path; gesture-scoped listeners only.** | Window gets `scroll`/`resize` only; touch/pointer listeners added on gesture start inside a widget (§2.6) | No synchronous touch region while the user scrolls (bug 184250) | Morph scroll-jack: non-passive `wheel`/`touchmove` on window near the end (nav-morph #6 narrows it to "engaged or at end"); pain's always-on `pointermove` (N7, dropped) | **partly** |
| 8 | **Pre-render complex motion as media.** | Scroll-scrubbed multi-object motion is a short-GOP video; canvas sequences only where needed (§2.4) | Main thread sets one number; decode and compositing are off the main thread (inference, medium) | The hero orbit cards, ring splash and morph are many DOM nodes animated per frame; N3's conic-gradient orbit repaints every frame | **not used** (design option) |
| 9 | **Reveal once, finish, clean up.** | `StaggeredFadeIn`: trigger at 85 % viewport, opacity + translateY, then drop keyframes and `will-change`; no blur (§2.8) | Bounded work, no layer left behind, no filter raster (inference) | Future-card reveal animates `filter: blur(14px)` on a full-viewport card (T10 shortened it); entry animations used `blur(8px)` | **partly** (T10 trims the tail; the blur stays) |
| 10 | **State at boundaries is declared, not discovered.** | Nav theme from per-section ranges, push/pop stack (§2.9) | Zero per-frame work; one class change per crossing (inference) | nav-hit-test T11 still hit-tests every scroll frame (without writes); `ee()` reads per frame | **partly** |
| 11 | **Blur small, blur only when needed.** | Nav backdrop only while stuck, on an empty 48-52 px leaf; `backdrop-filter: unset` on phone controls (§2.3, §2.9) | Backdrop cost scales with area × radius (WebKit blog 3632, vendor doc); an empty leaf repaints nothing when the theme changes (W3) | Fixed nav `backdrop-filter` (20 px) plus a nested one in the lang switch (P8); morph changes the backdrop radius per frame (N2/N6) | **partly** (same 20 px nav blur as Apple; the per-frame radius change and the nesting are ours) |
| 12 | **Load by scroll range, never mount during scroll.** | `data-download-area-keyframe` ~0.5 viewport ahead; scrub video ~1.5 viewports ahead; DOM server-rendered; image sequences load coarse-to-fine (§2.4-2.5) | Decode/network land before the element is visible; no DOM creation in a scroll frame (inference) | Morph panel mounted in an IO callback during scroll (42-75 ms LoAF), fixed by #13 lazy mount (idle after load); panel images `loading=eager` | **apply** (after #13) |
| 13 | **Pick the motion tier once, per device and preference.** | `enhanced`/`base` at load; reduced motion swaps motion for static/fades; per-breakpoint keyframe masks; Low Power probe in the library (§2.7) | Low Power caps rAF/CSS animations at 30 fps (bug 215745); the base tier does no scroll work at all | T1 gates JS on the CSS media query (same idea as `breakpointMask`); no Low Power tier; reduced motion handled per effect | **partly** |
| 14 | **Cap image density at 2x; size per breakpoint.** | 3 breakpoints × 1x/2x, 2x on DPR-3 phones, same HTML for all UAs (§2.5) | Smaller decode and raster memory per layer on the phone (inference); ~1/3 less data (Twitter, blog) | Desktop hero covers fetched on mobile (~1 MB, TOPICS "hero-cover-mobile", unscheduled) | **unknown/partly** |

Short form for designers: *motion that follows the finger is either a cheap transform/opacity on one element, a
clip on one container, or a video; everything else (blurs, layout changes, theme flips, new layers, new DOM)
happens before the user gets there or once at a boundary.*

## 4. Review of our topics against these principles

| topic | verdict | what Apple's approach would change |
|---|---|---|
| phone-invisible-shrink (landed) | **aligned** (P13, P3) | Apple would not register the keyframe on phones at all (`breakpointMask`), instead of entering the callback and gating inside; the kept `.hero-track` rect read in `l` would become a cached-range event (P1, T7). |
| commission-forced-layout (landed) | **partial** | Reads-before-writes and the RO for line counts match P1/P2, but 2 rects per frame stay for the `entering`/`shrinking` classes. Apple computes those classes as range toggles from cached offsets: zero reads per frame. |
| pain-offscreen-notes (landed) | **aligned** (P3) | Same "return before any DOM work" idea. Apple would also attach `pointermove` only during a note drag (P7, the dropped N7). |
| nav-hit-test (landed) | **partial** | T11 removed the writes but keeps a per-frame `elementsFromPoint` plus `ee()` reads. Apple decides the nav theme from declared section ranges (P10); keep `elementsFromPoint` only as a tie-breaker in boundary frames. |
| large-area-blur (landed) | **partial** | T10 shortens the blur tail. Apple's reveals don't blur at all (P9) and its backdrops sit on small empty leaves (P11). A design call: opacity + translate reveal for the future card. |
| layout-animations (03 landed, 05 pending) | **aligned** (P5) | FLIP/clip-path/transform is what Apple does. Per-element IO pause of the sweeps matches P3. Apple has no infinite text sweeps on these pages. |
| nav-morph #6 passive / #13 lazy mount (E1 measured) | **aligned in direction, contrary in kind** | #13 matches P12. #6 narrows the blocking window; Apple never scroll-jacks the page, it would pin with `sticky` and drive the morph from a range (N8), or play the morph as a time animation triggered at the end. |
| countdown-idle-raf (draft) | **partial** | The IO pause matches P3. Apple would keep layers only while animating (P6): variant 05 (one strip layer per digit) plus `will-change` only while a digit moves. |
| hero-exit-scroll-timeline (measured, pending) | **aligned, beyond Apple** (P5, P1) | Apple would run this as JS keyframes writing each card's own `opacity`/`transform`; ours writes nothing per frame and is threaded on Safari 26.4+. Keep the exit blur on its own short range (P9). |
| scroll-engine (wave 2) | **aligned, half-way** (P2) | T9 is Apple's phased executor. Missing: cached offsets refreshed on resize/RO/fonts (P1), range-arithmetic early return instead of IO activation (P3), a `100vh` tracker to drop toolbar resizes. |
| N10 transition-frames (planned) | **aligned with P3/P6** | Apple renders all sections all the time and pre-promotes layers per element half a viewport ahead. scroll-engine/09 (un-skip once, never re-skip, no `will-change` override) is the closest variant; add per-element `will-change` windows. |
| N11 vendor-scrollend (draft) | **neutral** | Apple's own analytics has no `scrollend` handler and computes view state from cached metrics (§2.6). Deferring gtag's handler to idle is the page-side equivalent; P7 says nothing heavy on the scroll path. |

## 5. Next actions (ranked by expected gain on the remaining frame classes)

Remaining classes (DIRECTION): Chrome >50 ms = gtag `onscrollend`, the `iE` engine, the morph mount (gone after
E1); iPhone >34 ms = section un-skip / layer rebuild / `will-change` flips (W1/W3); the rest of 20-34 ms.

| rank | topic | technique (Apple principle) | expected effect | verify (mechanism first) | risk | new / existing |
|---|---|---|---|---|---|---|
| 1 | N10 `transition-frames` via scroll-engine/09 | Never re-skip; un-skip far ahead; drop the scene-wide `will-change: auto !important` flip; per-element `will-change` windows (`t - 150vh … b + 50vh`) for the few elements that animate (P3, P6) | most of the ~10 iPhone >34 ms frames per run at clusters C/F (and likely others) | R3 capture logger: `contentvisibilityautostatechange` count after the first pass → 0; Layers tab count stable while scrolling; then iPhone scripted 3+3 ABBA per cluster | memory: more live layers; first-render cost moves to load; iOS memory-pressure policy | existing (scroll-engine/09 + N10) |
| 2 | `scroll-metrics-cache` | Engine keeps per-effect document offsets (`offsetTop` chain, refreshed on ResizeObserver of the page root, breakpoint MQ, `fonts.ready`); callbacks get progress from `scrollY` only, with range early return (P1, P3) | removes the remaining per-frame rect/`getComputedStyle` reads (commission classes, `l`, `ee()`): `iE` leaves the >50 ms list, forced layout 25 → ~0 ms, fewer 20-34 ms frames | wrapped counters: `getBoundingClientRect` + `getComputedStyle` per scroll frame → 0 (Tier A); `LayoutCount` per frame ≈ 1 (getMetrics); parity probe vs baseline at 39 steps | stale offsets after a layout change without resize (lazy images, sticky, morph mount): needs the RO; `offsetTop` ignores transforms (shrink scales), so parity must be checked | new, cluster A (scroll-engine owner) |
| 3 | N11 vendor-scrollend | Defer gtag's `scrollend` to idle (variant 02) (P7) | removes the last Chrome >50 ms entry from the scroll phase | LoAF attribution: the 59-76 ms entry leaves the scroll phase; GA hit parity | analytics delay; relies on the tag's script URL | existing |
| 4 | nav-theme-ranges | Nav theme from per-section boundary ranges (cached), `elementsFromPoint` only in boundary frames; gate `ee()` (P10, P1) | one hit test + `getComputedStyle` + 2 rects less per scroll frame, page-wide: 20-34 ms class | counter: `elementsFromPoint` calls per scroll frame ≈ 0 outside boundaries; reuse the 1690-point parity probe | stacking edge cases (sticky profile over the future section) | existing nav-hit-test (cluster B owner) |
| 5 | N4 `custom-property-scope` + `--morph` element-local | Register per-frame vars `inherits:false` and write them on their consumers (P4) | 20-34 ms frames in the morph phase (phones) and every shrink var on desktop | trace `UpdateLayoutTree.elementCount` per frame: thousands → tens | many consumers of `--morph` (~26): each needs the value | existing candidate |
| 6 | N2 `morph-composited` | Full-size panel revealed by `clip-path: inset(round)`, opacity cross-fades, fixed backdrop radius (P5, P11; Apple's pinned-media frame) | removes per-frame layout/repaint/re-blur in the morph (iPhone's worst phase) | trace Layout/Paint per morph frame → 0; iPhone Timeline paints; frozen frames at 5 morph values | design parity of the pill shape | existing candidate |
| 7 | countdown-idle-raf variant 05 | One strip layer per digit, `will-change` only while moving (P6) | ~80 → ~8 layers: commit/memory on iPhone, idle frames | LayerTree count; iPhone Layers tab; idle repaint counter | wrap 9→0 visual | existing |
| 8 | `reveal-without-blur` (design) | Future-card reveal as opacity + translateY, played once (P9) | iPhone GPU raster during the reveal (P5: Chrome can't see it) | iPhone Timeline paint area, as large-area-blur measured (48 Mpx baseline after T10) | visual change: needs design sign-off | change to large-area-blur |

Not ranked (no frame-class gain, but worth a design decision): a Low Power / reduced-motion **base tier** that
turns scroll effects into static states (P13), and 2x-capped, per-breakpoint hero images (P14).

## 6. Open points and limits

- No runtime measurement of Apple's pages was possible here (Chrome slot busy, iPhone excluded). Frame-time
  claims about Apple are inferences from the code; a Web Inspector Timeline of the iPhone 18 Pro page on the test
  phone would confirm "no forced layout, few layers" in one session.
- The 0.5-viewport reading of `t - 150vh` / `b + 50vh` comes from the expression syntax; confirm it with the
  page's own debug overlay (the code has one behind a query parameter) if the exact margin matters for N10.
- Whether the four pages enable the Low Power validator page-wide is unconfirmed (§2.7).
- Apple's code was read in minified form; the names above (`AnimSystem`, `ScrollGroup`, `KeyframeController`,
  `WillChange`, `VideoScrub`, `StaggeredFadeIn`, `LocalnavThemeChanger`) are the strings that survive
  minification, and the descriptions are my own words.
