# Fix: hero-exit-scroll-timeline

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status (wave 2, 2026-10-01):** `patch.diff` is now **stacked on `aw1-10e`** (all-wave1 + scroll-engine
/10e, JS 3e2f599a…, CSS c6aad94b…; restacked from `aw1-10c` after the /10e face-churn hotfix, same hunks,
line offset +3 in JS, no fuzz). The hero code there is byte-identical to the baseline, so v2 applied
unchanged (rows /09, /10). `variants/10.diff` (P3) is on `aw1-10e` too. `results.json` is still the old
plain-baseline n=3 A/B (fps +9 %, frames >20 ms -21 %, both disjoint, old tools). Pending:
- the iPhone hero-window block (B aw1-10c, P, P2 se10e-aw1, P3 on aw1-10e; iPhone-led);
- then one Chrome A/B `--on aw1-10e`;
- finger test pending (user).

See "Wave 2: the first scroll out of the hero".
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

## Wave 2: the first scroll out of the hero (aw1-10c)

Trigger (mgmt-ops-3, 08:05Z): the user's finger test on `aw1-10c` feels the top laggy. On the iPhone,
the scripted runs show a 51-55 ms frame at y≈50 every run, and the finger runs on the baseline show
3-12 frames >50 ms per pass in y 0-900.

**Mechanism probe** (own CDP script, short lane, unthrottled, counts only, n=1 per target; mobile
430x932 DPR 3). It steps y 0 → 25 → 50 → 75 → 100 → 150 → 200 → 300 → 450 → 600 and logs, per step:
attribute mutations with their old value (same-value writes dropped), `setProperty` calls,
IntersectionObserver callbacks, animations or transitions that start or stop, rAF requests, and
`Performance.getMetrics` style and layout counts. Scratch `first-scroll.mjs`; output `fs1/report.json`.
What fires on aw1-10c:
1. **Hero exit (this topic):** one `--exit-opacity` write on `.hero` per step, from the first step on.
   It is an inherited custom property, so the hero subtree restyles. With the patch: 0 writes at every
   step. Style-recalc time per step drops from 7.4-10.4 to 5.4-7.2 ms (unthrottled, n=1, direction only).
2. **Not this topic, present in both:** about 930 IntersectionObserver callbacks per step on `span.face`
   (rootMargin `50% 0px 50% 0px`). That is scroll-engine /10's will-change window (JS 2696-2712), and
   each callback flips `data-fw-wc` on a countdown face. It also happens at y=0 with no scroll at all.
   That is roughly 1,500 attribute writes per second, each toggling `will-change` (CSS 11808), so the
   countdown faces' layers are created and destroyed continuously. Reported to mgmt-ops and
   fix-scroll-engine (board finding). Likely cause, an inference: the faces slide out of their
   `overflow: hidden` digit window, and an IntersectionObserver clips by ancestors.
3. **Not this topic:** at y≈25 (the first scroll step) and again at y≈300, 6 `setProperty` calls
   (`width` ×2, `top`, `right`, `bottom`, `left`) that are not inline-style writes (no mutation was
   seen), so they go to a stylesheet or detached declaration. The receiver isn't named yet.
4. **Not this topic:** at y≈300, `.start-selling-future-people-o` expands, starting `grid-template-columns`
   and `height` transitions (layout every frame while they run) plus `filter`, `opacity` and `transform`
   transitions. Layout count per step jumps from 1-4 to 25-31 at y 450-600. This sits inside the iPhone
   hero window (y 0-900). It belongs to the layout-animations topic area (T5).

**Second probe (stack capture, aw1-10c only):**
- **Faces (F-030):** 168 `.face` elements in two countdowns (`div.countdown` in the hero copy,
  `div.countdown.inverse`). A flipping face sits on screen (box top 376-412 px at y=0) but has
  intersection rect 0, or ratio 0.01 at y=50. So the flips are clipping by the digit's `overflow`
  ancestor while the faces slide, not the 50 % rootMargin. This confirms the inference in item 2.
- **The 6 writes (F-031):** Svelte's style setter (runtime chunk `BSBv9QXB.js` 2858/2868), called from JS
  3939-3941. That is the hero `script-accent` word cycle (`width` of the accent and frame, `top`, `right`,
  `bottom` and `left` of the paint): a periodic timer, not scroll-triggered. It only coincided with the
  y=25 and y=300 steps. Layout-animations' area.
- **People-o (F-032, new):** `.start-selling-future-people-o` (CSS 2480-2496) gets `is-stack` and then
  `is-expanded` from a scroll position (y≈300 on mobile). Its 0.92 s `grid-template-columns` / `height`
  transition reflows the future `h2` every frame. Layout-animations' README assumed it runs only on
  hover. Unowned, posted as a pitfall.

**iPhone hero block (iphone-runner, 08:53-09:08Z, control ctl-B12 passed).** Scripted scroll, window
y 0-900 after 6 s idle; median [range]. "P" was served from this worktree after its restack, so it ran
on aw1-10e (JS 71d76d69, CSS 8a14ac2e): compare P with P2 (same base), not with B.

| build | n | frames >34 | >50 | max | y≈50 frame | y≈700 frame |
|---|---|---|---|---|---|---|
| B aw1-10c | 3 | 6 [4-7] | 1 [0-2] | 53 [48-64] | 48 [42-64] | 51 [45-53] |
| P2 aw1-10e | 6 | 4.5 [4-6] | 1 [0-1] | 52 | 43 [37-48] | 52 [44-56] |
| P hero v2 on aw1-10e | 3 | 3 [3-3] | 1 [1-1] | 63 [58-68] | **35 [22-37]** | **63 [58-68]** |
| P3 (P + people-o) | 3 | 5 [5-6] | 2 [1-2] | 61 | 44 [38-48] | 61 [57-64] |

So v2 removes the y≈50 frame (disjoint from P2), but the y≈700 frame is about 10 ms larger (disjoint
from P2 and B). P3 didn't keep the y≈50 gain in its sample (n=3) and has the same y≈700 cost.

**What y≈700 is (Chrome crossing probe, P2 / P / v3, mobile, y 520-1100 in 20 px steps, counts only).**
At the 680 step, in all three builds:
- the nav leaves its hero pill: `is-hero-pill` drops at hero progress 0.72 (JS 13272), which starts
  `max-width` / `padding` / `gap` transitions;
- `section#people` gets `is-visible`, which starts the future card's `filter` / `opacity` transitions;
- about 30 layouts in the step, the same in P2, P and v3.

So the y≈700 frame is a baseline frame, the nav morph start plus the #people entry. v2 makes it more
expensive on WebKit only: Chrome shows identical style and layout counts. The hero's own exit range
ends later (track bottom = viewport bottom, y≈932 in Chrome). There, P drops the cue's blur
(`filter` goes to `none`, fill none) while the baseline keeps `blur(18px)`. v3 (`forwards` fill)
keeps it. That end is outside the y≈700 frame, but v3 matches the baseline's end state exactly.
The y≈700 cost needs a WebKit bisect: rows 12-15 (iPhone). de-hero's analysis (`research/design-engineering/hero.md` §2D, derived, not verified) gives the strongest candidate. WebKit treats the extent of a transform animation under a transform-animated ancestor as uncertain and stops overlap testing. Here that is HEflip's WAAPI word slide inside v2's lifelong `.hero-copy` transform animation. Content revealed at the 0.72 flip then composites into extra layers. If so, rows 14/15 restore about 52 ms. The pixel-identical fix would be a composited `overflow: clip` wrapper for the copy's exit transform. The robust fix is de-hero's R1, which takes the 0.72 reveal apart (owners large-area-blur and phone-invisible-shrink).

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

  **Proposed resolution, hunk by hunk** (for the integrator; checked against scroll-engine's
  `patch.diff` at c72b759, hunks `@@ -4160,15` and `@@ -4236,7`):
  1. **`let` list after `o = !1,` (both patches add lines here):** keep both. First this patch's block
     (`heCss`, `heMode`, `heIn`, `heIO`, `hePE`), then scroll-engine's `fwE = { measure, mutate }`.
     No name clashes (`he*` vs `fw*`).
  2. **Body of `s`:** take scroll-engine's (`(i = 0), fwRun(fwE)`). This patch leaves `s` unchanged.
  3. **`d()` and `p()` (this patch's hunks at 4181 and 4205):** take this patch's. Scroll-engine doesn't
     touch them. `d()` still cancels a pending `i` rAF and removes `--exit-opacity`. `p()` calls `c()`,
     which reaches scroll-engine's `s` → `fwRun(fwE)`. Both work unchanged.
  4. **Registration (`let g = dE(…)`):** neither side as-is. Pass scroll-engine's two-phase object,
     gated on this patch's mode:
     `dE({ measure: (F) => (heMode ? null : fwE.measure(F)), mutate: (r) => { r === null || fwE.mutate(r); } }, { deferRendering: !0, element: b })`.
     In CSS mode that does no rect read and no write, but keeps the registration (P12). `fwE.measure`
     returns a number (`-1` under reduced motion), so `null` is free to mean "skip". Then keep this
     patch's `heSync` after it.
  5. **The `return (` block:** take this patch's (IntersectionObserver setup, `heMode || s()`, `heIO`
     cleanup). Scroll-engine only kept `s()` there.
  6. **Check after stacking:** Tier A `no-exit-opacity-writes-*` must pass (== 0 on the combined
     overlay), and on desktop the first ~1.8 s must still write `--exit-opacity` through `fwE` (JS path
     during the entrance).
- large-area-blur: its proposal for the hero blur (no permanent `blur(0)`, blur only while exiting) is
  implemented here; it doesn't touch the hero rules.

## Experiments tried

One row per variant measured, probed or dropped, including the ones that lost (fields: `fixes/EXPERIMENTS.md`).
"old-tools" = measured before I-002 (4bbd249). Scratch evidence (`scratchpad/hero-exit/…`) is session-local
and not in git; its findings are copied into the README sections named.

Variant diffs are in `variants/<nn>.diff` (the `fix.mjs diff` format, base-sha256 headers; local branch
only). To rebuild one, copy it to `fixes/<name>/patch.diff` and run `node tools/fix.mjs apply <name>`.
The header's "rebuild with" line names the scratch topic it was generated from:
- `02.diff` came from `hero-exit-scroll-timeline--v2names`, a temporary topic made by exactly reversing
  the rename.
- `06.diff` came from `hero-exit-scroll-timeline--noblur`.
- `01.diff` (v1, +174 -2) was rebuilt afterwards from the session transcript. It applies the only two v1
  edits recorded there to the baseline: the JS registration edit and the first CSS block. Both were
  written before the v2 edits began (21:30-21:32 UTC, v2 from 21:39). v1 already kept the `dE`
  registration with a no-op callback (see /08). Its local names `hx`/`hq`/`hp` shadow module names
  (P1), as in 02.

`bench.json` `experiments[]` entries are left to the bench-author (runner not landed yet).

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status |
|---|---|---|---|---|---|---|---|---|
| hero-exit-scroll-timeline/01 | v1: exit as a CSS view-timeline animation from mount; keyframes use `var(--copy-in)` / `var(--entered)` (animated by the entrance) | remove the per-frame rect read + `--exit-opacity` write; same visuals | broke | clean (probe) | iPhone iOS 26.6.1: `.scroll-cue` stayed at opacity 0 (baseline 1) at rest | patch `variants/01.diff` (rebuilt from the session transcript, see above); README "What changed" (why only after the entrance); iPhone probe safari1.json (scratch) | Safari resolves keyframe `var()` of an animated custom property against its base value: FINDINGS P3. The first re-test also showed v1 because Safari cached the immutable CSS; re-test on a new port with `--no-cache` | superseded by 02 |
| hero-exit-scroll-timeline/02 | v2: CSS exit attached only after `is-splash-done` / `is-ring-splash-done` (JS path until `d()`), phone cue exit on `.scroll-float`, separate blur animation `blur(0px)→blur(18px)` (fill none), IntersectionObserver for pointer-events; iPhone parity probe | same visuals as the baseline on Safari | within noise (parity) | clean (probe) | copy opacity .901/.501/.03 at p .1/.5/.97 on both; cue blur 1.78 vs 1.79 px at .1; deck `.is-e` .825 at `103.08px 89.55px` on both; pointer-events none from .95; 7 ViewTimeline animations, n=1 | patch `variants/02.diff` (v2 with the original names, rebuilt by exactly reversing the rename); README "Visual / behaviour parity" (iPhone); safari2.json (scratch) | parity on Safari 26.6.1 (threaded SDA) | on branch |
| hero-exit-scroll-timeline/03 | 02, Chrome visual/computed-style check: mobile + desktop, each ± reduced motion, 9 progress points | same visuals as the baseline on Chrome | within noise (parity) | clean (probe; load not recorded) | visible exit values equal to 3 decimals; pixel diff 0-0.94 % (0.54-0.94 % at 4 points = rotating word/countdown/vinyl/avatars phase), 0 errors, n=1 | patch `variants/02.diff` (the check ran on the pre-rename code, functionally identical to 04); README "Visual / behaviour parity" (Chrome); vis1/report.json (scratch) | invisible diffs only: `display:none` layout's cards no longer animated, no blur at rest / at opacity 0 | on branch |
| hero-exit-scroll-timeline/04 | 02 with the six new names renamed (`hA/hm/hq/hx/hp/hr` → `heCss/heMode/heIn/heIO/hePE/heSync`) | P1 hygiene: the first names shadowed unrelated module names (Zod `hA`, i18n `hm/hp/hx`, `hr` at 323) | superseded | n/a (no measurement) | 0 functional change (the closure never used the outer names); `node --check` OK; diff still +169 -3 | patch `variants/04.diff` (= `patch.diff`); README "What changed"; patch.diff | pick names absent from the file (`grep -c`) before editing: FINDINGS P1 | on branch (all later rows measure the renamed code) |
| hero-exit-scroll-timeline/05 | 04, `fix.mjs ab --runs 3` vs plain baseline, mobile 6x | per-frame style/paint down → frames >20 ms, fps | better | old-tools, provisional (load1 9.1-19.1 > 6, ranges disjoint) | fps 63.7 [62.7-66.7] → 69.5 [67.7-71.4]; frames >20 ms 115 [114-139] → 91 [89-111]; worst frame 117.5 → 99.4 ms; >50 ms 7 → 5, LoAF, forced: within noise; n=3 | patch `variants/04.diff`; `fixes/hero-exit-scroll-timeline/results.json` (branch worktree-agent-a77e2ec753b6381fb); README "Before / after" | at 6x mobile `s` isn't in the top LoAF, so the gain is per-frame style/paint, not LoAF | on branch; re-measure `--runs 5 --on <combined>` with current tools |
| hero-exit-scroll-timeline/06 | `--noblur`: 04 without the two blur animations (attribution: how much the cue/copy blur costs) | the exit blur's paint is part of the remaining cost | abandoned | n/a (never measured) | none | patch `variants/06.diff`; overlay `fixes/hero-exit-scroll-timeline--noblur/` (uncommitted, gitignored) | dropped from the slot: one queue entry per agent, and I-005 (a same-owner `ab` deletes the lease) meant ab had to run last. P5: Chrome can't show GPU blur cost anyway, so attribute on the iPhone | retry when the iPhone is back (scripted A/B, blur vs noblur) |
| hero-exit-scroll-timeline/07 | 04, `fix.mjs ab --runs 5` vs plain baseline | confirm 05 with n=5 | abandoned | n/a (stopped while queued, #7) | none | patch `variants/04.diff` (never run); this README (status) | the lead stopped it: Chrome is the bottleneck, and the final number must be on the combined wave-1 base with the I-002 tools | superseded by the `--runs 5 --on <combined>` run (pending) |
| hero-exit-scroll-timeline/08 | Unregister the hero `dE` callback once CSS takes over (the prompt allowed it: "you may unregister your own dE callback") | with the exit on a scroll timeline, the engine callback has nothing to do, so dropping the registration saves its per-frame dispatch | abandoned | n/a (design only: never built, run or probed) | none measured. Code reading (baseline): registration sets `data-start-selling-scene` on `.hero-track` (JS 2765) and `data-start-selling-render=deferred` via `deferRendering` (JS 2703). Its cleanup removes both (JS 2774-2779). CSS 11754-11762 hang the scene pause (`animation-play-state: paused !important`, `will-change: auto`) and `content-visibility: auto` on those attributes | no patch kept (never built: rejected at design time, before v1). README "What changed" (why `dE` stays registered) | unregistering would silently drop the off-screen pause and the render deferral of `.hero-track`. Keep the registration with a mode-gated callback: FINDINGS P12. The claim is from code reading, not from an observed breakage | dropped (01, 02 and 04 all keep the registration) |
| hero-exit-scroll-timeline/09 | 04 restacked on `aw1-10c` (all-wave1 + scroll-engine /10c); the hero code there is identical to the baseline, so the same hunks apply | as 04, on the wave-2 base: no `--exit-opacity` writes, so no hero-subtree restyle per scroll frame. May also remove the iPhone y≈50 first-scroll frame | provisional: mechanism confirmed, gain pending | clean (mechanism probe, counts only) | `--exit-opacity` writes per 100 px step: 1 → 0 at every step (y 25-600); style-recalc time per step 7.4-10.4 → 5.4-7.2 ms (unthrottled, direction only), n=1 | patch `patch.diff` (= final, stacked on aw1-10c, now aw1-10e); README "Wave 2"; probe output fs1/report.json (scratch) | the mechanism holds on the wave-2 base. The probe also named three other first-screen costs that aren't this topic (face will-change churn, an unnamed 6-write layout at y≈25, people-o layout transitions at y≈300) | iPhone (aw1-10e, n=3 vs P2 n=6): y≈50 frame 43 [37-48] → 35 [22-37] (gone), but y≈700 frame 52 [44-56] → 63 [58-68] (worse, disjoint); bisect in rows 11-13 |
| hero-exit-scroll-timeline/10 | P3 = 09 + people-o on phones (≤860px): the O's column snaps to its end size (no `grid-template-columns` / `height` transition) and the face stack is revealed by a 0.92 s `clip-path` transition on `.start-selling-future-people-o-stage` with the same easing (F-032) | no heading layout every frame during the 0.92 s expand inside the hero window (y 0-900) | provisional: mechanism confirmed, gain pending (iPhone P3) | clean (mechanism + parity probe, counts only) | layouts per step at y 450 / 600: 30 / 25 → 0 / 4 (P → P3, unthrottled, n=1). End-state geometry identical on mobile (O box 22×38 collapsed, 189×39 expanded) and desktop untouched (pixel diff 0 % at 3 states) | patch `variants/10.diff` (on aw1-10c, restacked on aw1-10e: same hunks); README "Wave 2"; probes p3par/, fs3/ (scratch) | visible difference by design: the words beside the O jump to their final place instead of sliding (a parity-exact FLIP needs element wrappers around the words, not in the template) | iPhone (n=3): y≈50 44 [38-48] (gain not kept in this sample), y≈700 61 [57-64] (same cost as 09) |
| hero-exit-scroll-timeline/11 | v3 = 09 with the exit blur filled `forwards` (desktop copy + cue, phone `.scroll-float`) | past the end of the exit range the cue keeps `blur(18px)` like the baseline instead of dropping to `filter: none`: no filter change when the track's bottom reaches the viewport's bottom | provisional: mechanism confirmed | clean (Chrome crossing probe, counts only) | `.scroll-float` filter after the end: P `none` → v3 `blur(18px)` (baseline keeps `blur(18px)` on `.scroll-cue`); style/layout counts per 20 px step y 520-1100 equal to P2 / P | patch `variants/11.diff` (on aw1-10e); README "Wave 2"; probe pr3/ (scratch) | the range end is at track bottom = viewport bottom (y≈932 in Chrome), not at y≈700: v3 is end-state parity, unlikely to change the y≈700 frame | candidate for the final patch; iPhone optional |
| hero-exit-scroll-timeline/12 | DIAGNOSTIC v4nocards = 09 without the phone deck cards' exit animation (cards stay at rest) | WebKit cost at y≈700 comes from the four scroll-driven card animations (`translate: var(--scatter-x) var(--scatter-y)`, opacity), e.g. animated overlap extents or var() keyframes | pending (iPhone) | not a candidate (visual change: no card scatter) | none yet | patch `variants/12.diff` (on aw1-10e) | | iPhone bisect requested |
| hero-exit-scroll-timeline/13 | DIAGNOSTIC v5noblur = 09 without the phone cue's exit blur (`.scroll-float` fades and lifts only) | WebKit cost at y≈700 comes from the scroll-driven `filter` animation on the cue | pending (iPhone) | diagnostic (visual change: cue fades without blur; small text at low opacity) | none yet | patch `variants/13.diff` (on aw1-10e) | | iPhone bisect requested |
| hero-exit-scroll-timeline/14 | DIAGNOSTIC v6noflip = 09 with all-wave1's `HEflip` off (the h1 words beside the accent snap instead of a 0.9 s WAAPI transform slide) | de-hero candidate 1: a transform animation (HEflip) under the transform-animated `.hero-copy` makes WebKit assume overlap, so content revealed at the 0.72 flip gets extra layers | pending (iPhone) | diagnostic only (visual change, other topic's code) | none yet | patch `variants/14.diff` (on aw1-10e) | | iPhone bisect requested |
| hero-exit-scroll-timeline/15 | DIAGNOSTIC v7copyop = 09 with the phone `.hero-copy` exit as opacity only (no transform animation on the copy) | same candidate from the other side: with no transform animation on `.hero-copy`, overlap testing stays on | pending (iPhone) | diagnostic (copy no longer lifts 8 px) | none yet | patch `variants/15.diff` (on aw1-10e) | | iPhone bisect requested |
