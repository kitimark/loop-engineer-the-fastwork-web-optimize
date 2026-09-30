# Fix: hero-exit-scroll-timeline

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured against the plain baseline (mobile 6x, n=3: fps +9 %, frames >20 ms -21 %, both
disjoint). Pending: the final `--runs 5` on the combined wave-1 base, the scripted iPhone A/B
(iPhone pending), and the finger test (finger test pending (user)).
**Topic:** see `fixes/TOPICS.md` (7, hero-exit-scroll-timeline)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (the hero `ne(() => …)` block, pretty 4155-4251:
`s`/`c` gated, `d`/`p` switch modes, registration), `/_app/immutable/assets/2.gBuqKVzi.css` (one new
`@supports` block inserted before the hero's `prefers-reduced-motion: reduce` rules, pretty ~2127)

## Why it lags

The hero is `section.hero-track` (200vh) with a sticky `.hero` (100svh). While it is pinned, its content
"exits": `--exit-opacity` goes 1 → 0 and `--exit-scatter = 1 - --exit-opacity` drives:

- 4 phone deck cards (`.mobile-deck .orbit-card`): `opacity: calc(1 - scatter*.35)` and
  `translate: scatter * --scatter-x/y` (CSS 1577, 1586-1587, 2080-2125);
- `.hero-copy`: opacity and translateY (CSS 1734-1736, phones 2038-2052); desktop also `blur()`;
- `.scroll-cue`: opacity, translateY and `filter: blur(calc(var(--exit-scatter) * 18px))` (CSS 1910-1913,
  1927, 1932-1933); a permanent `blur(0px)` at rest.

The value comes from JS, every scroll frame (`site-pretty/_app/immutable/nodes/2.DyWL8TcE.js`):

- 4239: `dE(c, { deferRendering: true, element: b })` registers `c` with the shared scroll engine `iE`
  (2670); `c` (4173) does `requestAnimationFrame(s)`, so `s` runs as its own rAF callback **after** the
  engine's callbacks have written their styles;
- `s` (4163-4172): `b.getBoundingClientRect()` + `innerHeight` (a read right after the other callbacks'
  writes = forced style+layout), then `x.style.setProperty('--exit-opacity', r)` and
  `x.style.pointerEvents = …` on `.hero`. `--exit-opacity` is an inherited custom property set on `.hero`,
  so every frame invalidates the style of the whole hero subtree, and the blurred scroll cue repaints.

Evidence: `research/cpu-throttle-calibration/chrome-sweep.md` "Top LoAF script attributions": `s`
@135943 (= pretty 4163) 2200 ms total / 2092 ms of it forced style+layout (desktop 20x, 3 runs);
`motion-inventory.md` "Hero": `.scroll-cue` blur repaints every frame; research README "Findings — real
iPhone": "Scrolling out of hero, top" 42-46 fps, 25-32 frames > 50 ms, about 2 layouts and 3 style
recalcs per frame.

## What changed

1. **CSS (`@supports (animation-timeline: view()) and (animation-range: contain 0% contain 100%)`, inside
   `prefers-reduced-motion: no-preference`).** `.hero-track` declares a named view timeline
   `--hero-exit` (block axis). Every exit effect becomes a scroll-driven animation on it with
   `animation-range: contain 0% contain 100%`, which is exactly the JS formula
   `1 - clamp(-top, 0, h - innerHeight) / (h - innerHeight)` (0 % when the track's top reaches the viewport
   top, 100 % when its bottom reaches the viewport bottom), `linear`, `fill: both`:
   - deck cards / desktop ring cards: `opacity 1 → .65`, `translate 0 → var(--scatter-x) var(--scatter-y)`;
   - `.hero-copy`: phones `opacity 1 → 0`, `transform translate(-50%, 0) → translate(-50%, -8px)`;
     desktop `opacity 1 → 0`, `translateY(0) → translateY(-10px)`;
   - scroll cue: desktop `opacity 1 → 0` on `.scroll-cue`; phones `opacity 1 → 0` and
     `translate 0 → 0 -10px` on its only child `.scroll-float` (see "Why the child" below);
   - the exit blur (`0 → 18px`) is a **separate** animation (so the opacity/transform ones stay
     compositable) with range `contain 0.05% contain 100%` and `fill: none`: at rest (scrollY 0) and after
     the exit the element has `filter: none` instead of the baseline's permanent `blur(0px)`.
   Keyframe values equal the baseline's calc() at every progress (both linear in the same variable).
2. **JS (the hero `ne` block).** A new mode flag `heMode` ("CSS mode") = scroll-driven animations supported
   (the same `@supports` condition via `CSS.supports`) **and** the entrance is over. `d()` (the end of the
   ring splash, which adds `is-splash-done` / `is-ring-splash-done`) switches to CSS mode: cancels a pending
   `s`, removes the inline `--exit-opacity`, applies pointer-events from the observer. `p()` (entrance start,
   also on bfcache `pageshow`) switches back. On phones and with reduced motion, `p()` calls `d()` at mount,
   so they are in CSS mode from the start. The `dE` registration stays (for its side effects on the
   track: `data-start-selling-scene` pause and `data-start-selling-render` deferral) with the callback
   `() => { heMode || c(); }`. `.hero` `pointer-events: none` at `r < 0.05` comes from an
   `IntersectionObserver` on `.hero-track` with `rootMargin: -105% 0px 200% 0px` (not intersecting ⇔
   track bottom < 1.05 viewport heights ⇔ `r < 0.05` for a 200vh track), guarded by reduced motion.
3. **Unchanged:** the ring splash (`f`, `p` loop, desktop only, first 1.8 s), the entrance animations,
   everything under `prefers-reduced-motion: reduce`, and the whole JS path in browsers without
   scroll-driven animations (Firefox; Safari < 26).

**Why only after the entrance, and why the child for the phone scroll cue.** On desktop the entrance
animates the registered custom properties `--entered` (cards) and `--copy-in` (copy, cue). An exit
keyframe that references them is resolved against their *base* value in Safari (verified on the iPhone: a
first version left the cue at opacity 0), so the exit animations are attached only in the
`is-splash-done` / `is-ring-splash-done` states, where those variables are plain declarations, and the JS
path keeps running until then. On phones the scroll cue's own entrance (`copy-in`, 0.2 s + 0.7 s) animates
`--copy-in` on `.scroll-cue` forever (fill forwards), so its exit runs on `.scroll-float`, its only child:
child opacity × parent opacity and child blur under parent opacity give the same pixels (only a keyboard
focus outline on the button would no longer blur/fade with it).

## Why that is faster

- No per-frame `getBoundingClientRect` in a separate rAF after the engine's writes: one forced
  style+layout per scroll frame fewer (the `s` @135943 LoAF entry disappears).
- No per-frame write of an inherited custom property on `.hero`: the hero subtree is no longer
  restyled every frame (fewer `UpdateLayoutTree` / style recalc).
- The exit itself runs as scroll-driven animations of compositor-eligible properties, in sync with
  the scroll instead of one frame late as the rAF-in-rAF JS was.
  - Chrome 115+ runs them on the compositor.
  - **Safari runs scroll-driven animations off the main thread only from 26.4.** 26.0-26.3 support them
    but tick them on the main thread (`research/architecture/webkit.md` §1).
  - The test iPhone runs **iOS 26.6.1**, so the threaded claim holds there. 26.5 also fixed the
    view-timeline progress near 0 %/100 %, bfcache and `animation-play-state` bugs.
  - On 26.0-26.3 the fix still removes the per-frame rect read, the forced layout and the inherited
    custom-property write on `.hero`. The animations then cost a main-thread style update of the
    animated elements only, instead of a compositor tick.
  - `@supports (animation-timeline: view())` can't tell the two apart, so those versions take the
    CSS path too. That's still cheaper than the baseline JS path (inference, not measured).
- The scroll cue's blur exists only while exiting (no permanent `blur(0)` layer effect).

### Engine checks (architecture review, `research/architecture/webkit.md`)

- **Threaded properties only.** The exit keyframes animate only `opacity`, `transform`, `translate`
  and `filter`. All of these are in WebKit's `acceleratedPropertyFromCSSProperty` list and are
  compositor properties in Chrome.
- **Matching filter lists.** The separate blur animation `svelte-1p2vpne-hero-exit-blur` goes
  `blur(0px)` → `blur(18px)`, never from `none`, so WebKit can accelerate it.
  - The element's base `filter: none` applies only outside the animation's active phase: fill `none`,
    range `contain 0.05% contain 100%`. So at rest and at opacity 0 there is no filter at all, and
    there's never an interpolation from `none`.
  - Chrome still paints a blur whose radius changes (filter animations aren't composited there).
    That's why the blur is its own animation, apart from the opacity/transform one.
- **No `var()` of animated custom properties (P3).** The keyframes use no variables except
  `translate: var(--scatter-x) var(--scatter-y)` in `hero-exit-card`. Those two are static per card:
  set in CSS for the phone deck (2090-2109) and inline once per card by JS (4139). They aren't
  animated or registered with `@property`. `--entered`, `--copy-in` and `--exit-*` are not referenced.
- **Still to verify on the device:** the review asks for Web Inspector Timelines on the iPhone (no
  per-frame style recalc attributed to the animation). iPhone pending.

Expected movement: scroll-phase LoAF / forced layout ms down, frames > 20/34 ms down in the top part of
the page; morph phase unchanged.

## Before / after

`node tools/fix.mjs ab hero-exit-scroll-timeline --runs 3`: **plain baseline** (the combined wave-1 base
wasn't announced yet), mobile 430x932 DPR 3, CPU 6x, `--vendors=local --https --latency 150`.
Host load was 9.1-19.1 during the runs, well above the A/A's; the final `--runs 5` on the combined
base is still to do. These runs predate I-002 (idle phase). Compare them only with runs from the same
tools version.

| mobile 6x, n=3 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 63.7 [62.7-66.7] | 69.5 [67.7-71.4] | +5.8 (+9.1%) | better (ranges do not overlap) |
| scroll: frames >20 ms | 115 [114-139] | 91 [89-111] | -24 (-20.9%) | better (ranges do not overlap) |
| scroll: frames >34 ms | 14 [13-17] | 12 [12-15] | -2 (-14.3%) | within noise |
| scroll: frames >50 ms | 7 [6-8] | 5 [5-7] | -2 (-28.6%) | within noise |
| scroll: frames >100 ms | 2 [1-2] | 0 [0-2] | -2 (-100%) | within noise |
| scroll: worst frame ms | 117.5 [116.4-124.5] | 99.4 [91.7-108.4] | -18.1 (-15.4%) | better (ranges do not overlap) |
| scroll: p95 frame ms | 32.9 [25.9-33.6] | 25.8 [25.7-25.9] | -7.1 (-21.6%) | within noise |
| scroll: LoAF ms | 346 [334-454] | 352 [309-391] | +6 (+1.7%) | within noise |
| scroll: LoAF script ms | 198 [167-231] | 181 [161-223] | -17 (-8.6%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 57 [53-107] | 61 [51-95] | +4 (+7%) | within noise |
| morph: fps | 106.1 [102.5-111.1] | 107 [102.3-107.3] | +0.9 (+0.8%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |

Reading:
- The win is in the **many medium frames** (>20 ms: -21 %, fps +9 %, p95 frame 32.9 → 25.8 ms, with a
  very tight patched spread of 25.7-25.9). That matches the mechanism: less style recalc and paint per
  frame (no per-frame inherited custom property on `.hero`, no cue blur repaint).
- At 6x mobile the hero `s` was never among the top LoAF scripts, so LoAF and forced layout don't move.
  The top LoAF list is the same on both sides: gtag `onscrollend` about 74 ms/run, the nav
  IntersectionObserver callback about 55-60 ms/run (nav-morph topic 13), future `l` about 25 ms/run,
  and the engine `iE`. The `s` LoAF entry was a desktop-20x finding (chrome-sweep); desktop isn't
  measured here.
- The frames >50 ms that remain come from those other topics, not from the hero exit.
- Regressions: none. 0 console errors, 0 404s on both sides, morph reached, screenshot diff
  0.14/0/0 % (phase noise).
- Measurement code unchanged (no changes to `verify.mjs`, `lib/cdp.mjs` or `fix.mjs ab`). The visual check
  was my own CDP script (scratchpad), run in the same `chrome-measure` lease slot before `ab`.

## Visual / behaviour parity

Chrome (headless, own CDP script under the `chrome-measure` lease; mobile 430x932 and desktop 1440x900,
each also with `prefers-reduced-motion: reduce`). The script scrolls to exit progress 0, .1, .3, .5,
.7, .9, .97, 1, 1.3 and compares computed styles and screenshots, baseline vs patched:

- **Visible exit values match** at every point on both viewports, to 3 decimals. That covers `.hero-copy`
  opacity/translate (e.g. .900/-0.80 px, .500/-4 px, .030/-7.76 px on mobile), the cue's effective opacity
  (cue × `.scroll-float`), the cue blur (1.796 vs 1.788 px at .1, 9.000 vs 8.996 at .5, 17.459 both at
  .97), the visible deck/orbit card opacity and translate (e.g. mobile deck .825 at `-90.3px -55.92px`,
  desktop ring card .825 at `-345.6px -99px`) and `.hero` `pointer-events` (`none` from .97 on both).
- **Expected differences, invisible:**
  - The patched page doesn't animate the cards of the layout that is `display: none` in that viewport
    (desktop `.orbit` on phones, `.mobile-deck` on desktop); the baseline updated them through the
    inherited `--exit-opacity`.
  - The blur is `none` at rest (baseline `blur(0px)`) and once the cue is fully transparent (p >= 1;
    baseline `blur(18px)` on an opacity-0 element).
  - The cue's translate differs by the idle `scroll-float` bob phase.
- **Screenshot pixel diff:** 0-0.47 % at most points, 0.54-0.94 % at desktop .3/.5/1.3 and mobile 1.3.
  Looking at those pairs, the only differences are the rotating hero word/icon, the countdown seconds,
  the spinning vinyl and the avatar strip (phase noise); the blurred copy, cards and cue are identical.
- No console errors on either side; with reduced motion the values are identical (no exit, as in the baseline).

iPhone (iOS 26.6.1 Safari, scripted, under the `iphone` lease): `CSS.supports(…)` true; `getAnimations()`
shows 7 `ViewTimeline` animations (4 deck cards, `.hero-copy`, 2 on `.scroll-float`); at exit progress
0, .1, .3, .5, .7, .9, .97, 1, 1.3 the patched values match the baseline: hero-copy opacity/transform,
cue effective opacity (cue × float), cue blur (1.78 vs 1.79 px at 0.1 … 17.45 px at 0.97), deck card
opacity/translate (e.g. 0.825 / 103.08px 89.55px at 0.5 on both), and `.hero` pointer-events `none` from
0.95 on. At rest the patched cue has `filter: none` (baseline `blur(0px)`).

iPhone scripted scroll A/B (`iphone.mjs scroll`, fps / long frames, baseline vs patched): **iPhone pending**,
because the phone was disconnected for the night. The parity values above come from an earlier session under the lease.

Finger test: **finger test pending (user)**. It is queued with the lead (`fixes/FINGER_TESTS.md`): a slow finger
scroll out of the hero, then a fling. Look for smooth fade/scatter of the copy, cards and cue with no
stepping, the cue never stuck invisible, the hero tappable again after scrolling back up, and a look
that matches the baseline.

## Risks, conflicts, follow-ups

- Keyframes deliberately avoid `var()` of animated custom properties (Safari resolves them against the
  base value). The only `var()` left is `--scatter-x/y` (static per card: CSS on phones, inline on desktop).
- The view timeline measures against the scrollport; the JS used `innerHeight`. On iOS with a
  collapsing toolbar these can differ by a few percent of progress (not visible).
- Desktop entrance (first ~1.8 s) still uses the JS path, as does any browser without scroll-driven
  animations.
- `.hero-track` geometry and behaviour are unchanged (only a timeline name is added): the future
  callback `l` (JS 11303, phone-invisible-shrink) and the nav `_` (JS 13002, nav-morph) still read it;
  both could use the same IntersectionObserver trick for their `progress >= 0.72` test
  (`rootMargin: -128% 0px 200% 0px`); sent to both owners.
- scroll-engine (wave 2): the hero `dE` callback is a no-op in CSS mode; told fix-scroll-engine.
  **Textual conflict expected:** scroll-engine (commit c72b759) also converts hero `s` (4163) and its
  `dE` registration to the new `dE({measure, mutate})` form. When the two are stacked, keep this patch's
  mode logic (`heCss`/`heMode`, the IntersectionObserver, `d()`/`p()` switching) and gate
  scroll-engine's measure/mutate on `!heMode`. That form is then the JS fallback path (desktop entrance,
  browsers without scroll-driven animations).
- large-area-blur: its proposal for the hero blur (no permanent `blur(0)`, blur only while exiting) is
  implemented here; it doesn't touch the hero rules.
