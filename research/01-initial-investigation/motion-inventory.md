# Motion inventory — fastwork.com homepage (static analysis)

**Sources:** production `2.gBuqKVzi.css` (all page CSS) and `nodes/2.DyWL8TcE.js`, fetched 2026-10-01. Offsets are character offsets into the minified files.

**Labels:** **[V]** = verified in code. **[I]** = inferred from how WebKit behaves.

**Not used [V]:** Lenis, Locomotive, GSAP, `animation-timeline`/`view-timeline`, canvas, video, and the Web Animations API (`.animate()`).

## Shared scroll engine (drives every JS scroll effect) [V]

- **Listener.** One `window` `scroll`/`resize` listener, `{passive:true}` (JS@75227). It calls `rE`, which calls `requestAnimationFrame(iE)` and runs every registered callback.
- **Gating.** `dE()` registers callbacks, and an IntersectionObserver (`rootMargin:"100% 0px"`) gates them.
  - Sections get `data-start-selling-scene=active|paused`.
  - The paused state sets `will-change:auto!important` and `animation-play-state:paused!important`.
  - Inactive sections get `content-visibility:auto`.
- **Weakness.** A whole section counts as "active" whenever any part of it is within one viewport, so tall sections keep all their effects running.

## By section, top to bottom

### Fixed nav — `header.start-selling-top-nav`

- **Styling and transitions.**
  - `backdrop-filter: blur(calc(20px*(1-var(--morph))))` with `will-change:width,height,border-radius,background`.
  - A nested `backdrop-filter: blur(12px)`.
  - Transitions on background (.7s) and width (.68s).
- **Per-frame callback on every scroll frame, not gated by the IntersectionObserver** [V] (JS@341290–343746):
  1. `getComputedStyle`.
  2. 3–4 `getBoundingClientRect` calls.
  3. `style.pointerEvents='none'`, then `document.elementFromPoint()`, then restore. That write–read–write forces style and layout every frame.
- **Page-end "morph" scroll-jack** [V] (JS@343473).
  - While `#platform` is within 200%, it adds `window` `wheel`/`touchmove` listeners with `{passive:false,capture:true}`.
  - The listeners call `preventDefault()` and run a spring on `--morph`, animating width, height, radius, a `color-mix` background and `backdrop-filter` blur.
  - The spring also drives `--morph-fade`, which sets `filter: blur(0–12px)` and opacity on the whole platform section.
  - Inside the scroll callback it pins the page with `scrollTo({behavior:'instant'})`.

### Hero — `section.hero-track` (200vh) › `.hero` (sticky, 100svh)

- **Scroll-exit effect.** The per-frame JS sets `--exit-opacity` from `getBoundingClientRect` (JS@136172).
  - On phones it drives translate/opacity of 4 `.mobile-deck .orbit-card` elements (each with `will-change`).
  - It also drives `.hero-copy` opacity/transform.
  - And `.scroll-cue{filter:blur(calc(var(--exit-scatter)*18px))}`, which repaints every frame.
- **Countdown** (`.countdown.svelte-1666oc5`).
  - Driven by `setInterval(1s)` plus a spring rAF per digit that sets inline `translateY` (JS@126602).
  - About 75 `.face{will-change:transform}` layers.
  - Not paused when off-screen.
- **Script accent "you"** (`.script-accent`). An endless cycle:
  - `stroke-dashoffset` (main-thread paint).
  - An inline `width` transition inside the h1, which triggers layout for 0.9 s of every cycle.
  - A step-end opacity flicker.
- **Cheap loops (fine).** `.scroll-float` translateY is compositor-only. The `.hero-cta:before` conic `@property` animation runs on an element that is always `display:none`, so it is dead code.

### `section#people.start-selling-future`

- **`.start-selling-future-card`.**
  - Has `will-change: transform, border-radius`.
  - Its reveal toggles on scroll: `filter:blur(14px)` → none plus opacity plus translateY, over 0.7–1.6 s.
  - `--future-shrink` is eased each frame even on phones, where CSS forces scale 1 and radius 0. The work runs but nothing visible changes.
- **Avatar carousel.** About every 1 s, `avatars-exit` animates `width`, `flex-basis`, `margin-right` and `border-width`, all of which trigger layout.
- **Profile showcase.** An `x mandatory` scroll-snap deck with 6 shells (`will-change:transform`, `contain:paint`, `box-shadow`).
- **Vinyl record.** Rotates via transform on the compositor (fine).

### `section.pain` (sticky, 200svh)

- The scroll callback calls `.commission-card` `getBoundingClientRect()`.
- A `setInterval(3s)` adds notes that are `display:none` at widths up to 860 px, so it churns the DOM for nothing on mobile.

### `section.commission`

- **Per-frame callback.** Two `getBoundingClientRect` calls, then `setProperty('--commission-*')`, then `Range.getClientRects()`. That is a forced layout right after a style write. On phones the scale/radius values are overridden, so it is all cost and no visual.
- **Infinite loops.** Step-end opacity loops, a typing caret, and a text-typing timer at 28 ms.
- **Progress bar.** An rAF count-up animates the `.fee-progress` `width` (layout), with `filter:blur` children.

### `section#platform.start-selling-platform`

- **Permanent section-wide filter.** `filter: blur(0px)` on the whole section, which is animated during the morph.
- **Per-frame write.** `--platform-shrink` is written every frame (no visible effect on phones).
- **Blur and blending.** `blur(16px)` stage backgrounds, and `grain.png` overlays with `mix-blend-mode:overlay`.
- **Infinite `background-position` animations.** Four gradient-text titles animate `background-position`, which repaints every frame.
- **SVG animation.** SMIL `<animate>` on gradient `x1`/`x2`, and `stroke-dashoffset` "packets".
- **Entry animations with blur.** `cred-card-in`, `profile-phone-in`, `invoice-doc-in` and `service-card-in` all use `filter: blur(8px)`. `.service-card.is-animating` transitions `top`, `width`, `padding`, `height`, `max-height` and `gap`.
- **Marquees.** 90 s and 56 s transform-only marquees (fine).

### Morph panel (end of page)

- A 16 s transform column marquee.
- Pill and panel use `filter: blur(calc(var(--pill-out)*18px))`, driven from JS.

## Ranked suspects for iPhone jank

1. All scroll effects are JS: scroll → rAF → custom properties. [V code, I platform]
2. Forced layout every scroll frame, page-wide: nav hit-test, commission `Range.getClientRects`, future rect reads. [V]
3. Shrink effects that are visually disabled on phones are still computed and written to inherited custom properties on section roots, with easing loops that run about 20 frames after scroll stops. [V]
4. Non-passive capture `touchmove`/`wheel` on `window` for the last third of the page, plus `preventDefault` and `scrollTo` pinning. [V]
5. Blur on large layers: the future-card reveal, the permanent `filter` on `#platform`, `blur(16px)` stage images, and blurred entries. [V code, I cost]
6. Main-thread animations running during scroll: the h1 accent `width`, the avatar `width`/`flex-basis`, `background-position` text, SMIL, `stroke-dashoffset` and countdown springs. [V]
7. Layer count and memory: about 75 countdown layers, section-sized `will-change` cards, and sections overlapping via −100svh. [V counts, I impact]
8. Visibility churn: `content-visibility` and `will-change` toggling at ±1 viewport, plus nested `backdrop-filter`s on the fixed nav. [V/I]

The on-device measurements in `README.md` confirm items 1, 2, 4 and the idle countdown work in 6.
