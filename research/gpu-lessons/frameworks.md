# How frameworks hand animations to the browser, and the leanest exact countdown roll (T-102)

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork). It quotes
> line numbers of the frozen baseline (`site-pretty/`, pinned by `baseline.json`); keep it on local branches, never
> push.

Owner: arch-gpu-lessons (architecture), 2026-10-04, for user thread T-102 (a comment on T-096 #10). It is a sibling of
`README.md` in this folder; claim numbers C1-C9 refer to that file's §1.2.
- **Method.** Library and engine source reading, plus an offline model of the baseline spring `GE` (JS 3789-3803).
  There were no browser runs, no phone use and no locks.
- **Status words** follow CLAUDE.md "Platform claims". "CONFIRMED (source)" means the cited file at the cited commit
  says so.
- **Sources read 2026-10-04 via `gh`:**
  - WebKit `main` f61e4bfbb6a7, and the release branches `safari-7624.5.1.11-branch`, `safari-7625-branch` and
    `safari-7625.1.29.18-branch`.
  - Chromium `main` 18ea505de18d.
  - Svelte `main` 7c2fcdae6a29 (Svelte 5) and tag `svelte@4.2.19`.
  - Motion (Framer Motion's engine, `motion-dom`) `main` f5838ce47b32.
  - react-spring `main` eb09c7914721.
  - Vue `core` `main` 4ab865a848a1.

## In plain words

- **Frameworks animate in one of three ways.**
  1. *A start, an end and a curve.* The browser gets two keyframes and one easing curve, and fills in every frame
     itself. CSS transitions do this, as do Vue's `<Transition>`, React with CSS classes, and Motion tweens with a
     Bézier curve. It is the cheapest way, and Chrome and Safari both play it off the main thread for `transform`
     and `opacity`.
  2. *Pre-computed samples.* Svelte's transitions send one keyframe per 1/60 s. Motion turns a spring into a
     `linear(…)` curve with one point per 10 ms. Svelte's run off the main thread in both browsers. Motion's
     `linear(…)` curve runs on the main thread in shipping Safari.
  3. *Script every frame.* Svelte's `spring` and `tweened`, react-spring, and Motion for some values do this. It
     runs on the main thread in both browsers, the way the original countdown did.
- **None of them reproduces a stepped 60 Hz simulation.** They all treat the motion as one smooth curve. Our roll
  must match the original's own stepped spring (the pixel rule), and that path changes shape every 1/60 s. So an
  exact copy needs one curve piece per 1/60 s (two, counting a 0.67 ms tail).
- **Why PR-017 sends so much.** It uses straight-line pieces, up to 33 per 1/60 s, and every nearby cell carries the
  whole path. That gives 576 keyframes per tick and 1.9k-6.3k per carry.
- **K, fix-cd-roll-ca's build.** It uses one exact curve piece per piece of the original: about 52-66 keyframes per
  cell per roll instead of 144-343. That is the minimum for any exact keyframe form. It is about twice Svelte's ~31
  per element, and it plays on the graphics side in both browsers.
- **Sparser would change the look** (§4). One Bézier for the whole roll is 1.2 px off on a one-step roll and 12 px
  off on a 0 to 9 roll. For scale, the original itself differs from itself by 3.3 px and 30 px between a 60 Hz and
  a 120 Hz screen. That would be a proposal for later, not part of K.
- **`linear()` and `spring()` don't help.** `linear()` is straight pieces only, and shipping Safari runs it on the
  main thread. CSS `spring()` is a WebKit prototype, switched off.
- **What's coming in Safari.** WebKit main (2026-09-26) turned on a "threaded" animation path. It lets `linear()`
  run off the main thread too, but such animations tick at 60 Hz, not 80-120 Hz. No Safari release branch has it
  on yet.

## 1. Framework survey: what each hands the browser

The library behaviour comes from each library's source. The browser behaviour comes from engine source: C1 for
Chrome; C4 and the lines below for Safari's Core Animation (CA) path, which shipping Safari uses (§6).

| framework / API | what the browser gets | keyframes per element | Chrome: off the main thread? | Safari (shipping): off the main thread? |
|---|---|---|---|---|
| CSS transition / `@keyframes` (any framework) | 2+ keyframes, keyword or `cubic-bezier` easing | 2 (or as written) | yes for transform, opacity, filter (C1) | yes: a CAAnimation (C4); a per-keyframe `cubic-bezier` becomes CA `timingFunctions` |
| Vue `<Transition>`, CSS mode | adds the from/active/to classes on the next frames and waits for `transitionend`; the browser runs the CSS transition | 2 | yes | yes |
| Vue `<TransitionGroup>` moves | FLIP: inverse `transform` inline, reflow, then a CSS transition back to 0 | 2 | yes | yes |
| Vue `<Transition :css="false">` | only the JS hooks; whatever the hook calls | - | depends on the hook | depends on the hook |
| React core | nothing of its own; react-transition-group toggles classes (CSS) | - | as CSS | as CSS |
| Motion tween with a Bézier, on transform/opacity/clipPath/filter/backgroundColor | `element.animate`, 2 keyframes + `cubic-bezier` | 2 | yes | yes |
| Motion spring or JS easing function | `element.animate`, 2 keyframes + `linear(…)` with one point per 10 ms | 2 + about D/10 ms points | yes (`linear()` goes to cc) | **no**: `linear()` with points is never accelerated; WebKit ticks it on the main thread (no script, a style update per frame) |
| Motion `x`, `y`, `scale`, `onUpdate`, `repeatDelay`, mirror repeat | script every frame (JSAnimation) | - | no | no |
| Svelte 5 `transition:` / `animate:` with `css` | `element.animate`, one keyframe per 1/60 s of the duration, linear between | ceil(D/16.7) + 1 (31 for 0.5 s) | yes (transform/opacity) | yes (transform/opacity) |
| Svelte 4 transitions | an injected `@keyframes` rule, one stop per 16.666 ms, `linear` | about the same | yes | yes |
| Svelte `tick` transitions, `spring`/`tweened` (`Spring`/`Tween`) | script every frame (rAF loop) | - | no | no |
| react-spring | script every frame: a rAF loop writes `element.style` | - | no | no |
| this page, original countdown (`GE`) | script every frame | - | no | no |
| PR-017 (V9, on main) | `element.animate`, straight pieces of the exact path, one animation per nearby cell | 144-343 per cell; 576 per tick, 1.9k-6.3k per carry | yes | yes |
| K (fix-cd-roll-ca, building) | `element.animate`, one `cubic-bezier` piece per exact quadratic piece | 52-66 per cell (mean 58.6) | yes | yes |

References (CONFIRMED, source, line numbers at the commits above):
- **Vue.** `packages/runtime-dom/src/components/Transition.ts`:
  - l.131: `css === false` → hooks only;
  - l.212-224 and l.269-280: classes on `nextFrame`, then `whenTransitionEnds`;
  - l.340-345: `nextFrame` is a double rAF.

  `TransitionGroup.ts` l.101-115 and l.221 (FLIP `translate`).
- **Motion.** In `packages/motion-dom/src/animation/`:
  - `waapi/utils/accelerated-values.ts` l.4-10 (the five values);
  - `waapi/supports/waapi.ts` l.43-87 (other names, `onUpdate`, `repeatDelay` and mirror go to JS);
  - `AsyncMotionValueAnimation.ts` l.171-183 (WAAPI or JSAnimation);
  - `waapi/easing/map-easing.ts` l.13-18 (a function easing becomes `generateLinearEasing`, a Bézier array becomes
    `cubic-bezier`);
  - `waapi/utils/linear.ts` l.3-16 (default resolution 10 ms);
  - `generators/spring.ts` l.526-531 and `generators/utils/create-generator-easing.ts` l.8-26 (a spring becomes an
    easing function);
  - `waapi/utils/apply-generator.ts` l.9-14 (without `linear()` support the spring falls back to 300 ms `easeOut`);
  - `waapi/start-waapi-animation.ts` l.23-41.

  Motion's Vue port was not checked.
- **Svelte 5.** In `packages/svelte/src/`:
  - `internal/client/dom/elements/transitions.js` l.441-476 (`n = Math.ceil(duration / (1000 / 60))`, keyframes from
    `easing(i / n)`, `element.animate(keyframes, { duration, fill: 'forwards' })`, default easing linear);
  - l.464-473 (`tick` is a per-frame `loop`);
  - `motion/spring.js` l.106-126 (a `loop` per frame);
  - `motion/tweened.js` l.130 and l.261.
- **Svelte 4.** `packages/svelte/src/runtime/internal/style_manager.js` l.45-64 (`step = 16.666 / duration`,
  `… linear …ms 1 both`).
- **react-spring.**
  - `packages/rafz/src/index.ts` l.88-90 and l.134-145: `requestAnimationFrame` loop;
  - `targets/web/src/applyAnimatedValues.ts` l.62-66: `style.setProperty` / `style[name]` per frame.
- **WebKit.**
  - `Source/WebCore/animation/KeyframeEffect.cpp` `canBeAccelerated` l.1973-2030: under `USE(CA)`, `steps()` or
    `linear()` with points return false (l.2016-2020), and so does any `composite` other than replace (l.2023).
  - Per-keyframe easing into CA: `Source/WebCore/platform/graphics/ca/GraphicsLayerCA.cpp` l.4174-4179 →
    `PlatformCAAnimationRemote.mm` l.547-550 → `toCAMediaTimingFunction`, `PlatformCAAnimationCocoa.mm` l.130-145.
- **Chromium.** `third_party/blink/renderer/platform/animation/timing_function.cc`: `LinearTimingFunction::CloneToCC`
  l.79-81 and `CubicBezierTimingFunction::CloneToCC` l.159-161. Both easings reach cc.

**Svelte's transitions are the same family as PR-017:** keyframes worked out in script once, played by the browser
with straight lines between them. PR-017 differs in two ways: more points per frame (exactness) and one copy per
nearby cell.

## 2. Why PR-017 sends 576-6,300 keyframes per tick

- **Per cell per roll:** 144 (one step) to 343 (0 to 9) straight pieces. `__crPath` keeps every 60 Hz phase within
  5e-4 cell, with up to 33 points per frame (fix-cd-roll-ca README "The path").
- **Cells per roll:** every cell within 1.5 cells of the path. That is 3-5 animations on a one-step tick and 12-22
  on a carry tick (Simulator, OBSERVED; fix-cd-roll-ca README "Roll-start trace").
- **Why so many points per frame.** The original's position is not a smooth curve in time.
  - `GE`'s first call after a change integrates the time since the change in one Euler step as long as that time,
    then whole 16.667 ms frames follow.
  - So the position a frame shows depends strongly on where in the 1/60 s the tick landed. On a 0 to 9 roll it
    shows 0.54 cells if the first frame lands 8 ms after the change, and 2.15 cells at 16 ms. Then 4.01 cells at
    33.3 ms, and 7.53 at 100 ms.
  - Inside each 1/60 s the path is a quadratic in the phase. At each frame boundary its slope jumps.
  - Status: OBSERVED in the offline model. The model reproduces the original's per-frame values within 0.0005 px
    (fix-cd-roll-ca README "Position identity").
- **Why two pieces per frame.** `GE` takes 16 ms substeps, so a 16.667 ms frame is a 16 ms step plus a 0.667 ms
  step. Phases above 16 ms get one more short step, which makes a second quadratic.

## 3. The leanest exact form: K

- **The construction.** A `cubic-bezier(1/3, y1, 2/3, y2)` keyframe has x(t) = t, so nothing has to be solved for
  x. With y1 = q'(0)·h / (3·D) and y2 = 1 − q'(1)·h / (3·D), where D is the piece's rise, it traces the quadratic q
  exactly (degree elevation).
- **Offline check over all 90 rolls** (OBSERVED, model; scratch `kcheck.mjs`, `tailcheck.mjs`):
  - Both pieces fit a quadratic to 2.6e-13 px.
  - y stays within 0 to 0.67, so it never leaves [0, 1]. No frame reverses direction; the spring settles without
    overshoot.
  - This sidesteps the CA out-of-range case: WebKit's comment at `GraphicsLayerCA.cpp` l.1231 says CA clips
    out-of-range y for an animation-wide cubic.
- **The tail must be a curve too.** A straight 16-16.667 ms tail is up to 0.0127 px off. fix-cd-roll-ca's build
  already eases it.
- **Their build, measured offline:**
  - 7e-15 cell from the model up to the snap frame, and 4.7e-4 cell overall (V9: 5.25e-4). The snap frame (once per
    roll) stays dense, as in V9.
  - 52-66 keyframes per cell per roll, mean 58.6.
- **On Safari** each piece becomes a CA keyframe timing function (§1 references), CONFIRMED (source). The control
  points are cast to `float` (`PlatformCAAnimationCocoa.mm` l.141-145), so "exact" means within float32, about
  1e-5 px on these spans. How precisely CA evaluates the curve is not documented (UNRESOLVED). The decisive check is
  fix-cd-roll-ca's existing frozen-frame and position probes (simpx, roll-probe) on the K build.
- **On Chrome** a `cubic-bezier` reaches cc (CloneToCC l.159-161).
- **K is the minimum for an exact form.** Two adjacent pieces are different quadratics with a slope jump between
  them, so one keyframe segment can't hold both. No exact keyframe form has fewer keyframes per animated element
  than K.

| per animated element, one roll | keyframes | exact vs the original? | Safari off the main thread? |
|---|---|---|---|
| Svelte 5 transition, 0.5 s | 31 | no (its own smooth curve) | yes |
| Motion spring, 0.5 s | 2 + 50 points | no | no (`linear()`) |
| PR-017 | 144-343 | within 5e-4 cell | yes |
| K | 52-66 | yes (to float32) | yes |

## 4. Sparser, but no longer exact (a proposal, not for now)

Maximum distance from the original's 60 Hz path over every tick phase, cell 36 px. OBSERVED, model; scratch
`bezfit.mjs`, `segfit.mjs`, `smooth.mjs`.

| form | keyframes per cell | one step | 0 to 9 |
|---|---|---|---|
| one `cubic-bezier` for the whole roll | 2 | 1.15 px | 11.8 px |
| 12 fitted cubic pieces | 13 | 0.80 px | 8.3 px |
| K | 52-66 | 0 (float32) | 0 (float32) |
| for scale: the original, 60 Hz vs 120 Hz screen | - | 3.35 px | 30.1 px |
| for scale: a continuous (ideal) spring vs the original at 60 Hz | - | 6.2 px | 55.9 px |

- A smooth sparse form differs from the original's 60 Hz path by about the same amount as the original differs
  from itself between 60 and 120 Hz screens. That is a motion-only difference, so it would be a user proposal with
  Try-it pages (memory "illusion-must-be-pixel-identical").
- It would cut keyframes 5-30x below K. Worth offering only if K's counts still leave a start-frame cost.
- A physically ideal spring (what CSS `spring()` or Motion would draw) is a visibly different, slower start.
- **CSS `spring()`** (WebKit only): `SpringTimingFunctionEnabled` is "unstable", default false
  (`UnifiedWebPreferences.yaml` l.5934-5944, main). Not available to pages. CONFIRMED (source).
- **`linear()`** is straight pieces only, so an exact form would need today's point count. Shipping Safari also
  runs it on the main thread (§1). CONFIRMED (source).
- **`composite: 'add'`** (sharing one path across cells) is not accelerated on WebKit (`canBeAccelerated`
  l.2023). CONFIRMED (source).

## 5. The other multiplier: how many cells carry the path

K cuts keyframes per cell. The per-tick total also scales with the number of animated cells.
- **(W) Per-cell windows.** Animate a cell only while it is within 1.5 cells of the clip. fix-cd-roll-ca listed
  this.
- **(S) One animation per digit.** Animate the strip instead of 4-15 cells. That divides the volume by the cell
  count, and only the strip's extent would change, so the per-roll backing burst might go too.
  - Owner's answer (fix-cd-roll-ca, 2026-10-04): cells-only was chosen for pixels. With a strip offset plus
    cancelling cell offsets, WebKit's glyph edges differed under the hero's fade (OBSERVED, Simulator frozen frames,
    cd-strip review; cd-strip comment at overlay l.4034-4037).
  - So S is a cd-strip-owned option with a known pixel risk. It comes after K's counts, behind a frozen-frame check.

## 6. Safari's coming threaded path

- **Main only so far.** WebKit main turned `ThreadedTimeBasedAnimationsEnabled` on: 321972@main, 4a435c45f0c4,
  2026-09-26, "take 4". An earlier enable was reverted for a YouTube power regression (bug 325061). CONFIRMED
  (source).
- **Off in every release branch checked.**
  - `safari-7624.5.1.11-branch` l.8340: "unstable", false.
  - `safari-7625-branch` and `safari-7625.1.29.18-branch` l.8557: "preview", false.

  CONFIRMED (source). Which branch iOS 26.6 ships is UNRESOLVED. The decisive check is the phone's Safari Feature
  Flags list, which shows "Threaded Time-based Animations"; it is a user step and not urgent.
- **On that path an effect never becomes a CAAnimation.**
  - `applyPendingAcceleratedActions` returns early (`KeyframeEffect.cpp` l.2410-2412).
  - `canBeAccelerated` returns before the `steps()`/`linear()` check (l.2005-2007), so `linear()` would run off the
    main thread too.
  - The iOS display link that ticks these effects runs at 60 Hz (`RemoteLayerTreeDrawingAreaProxyIOS.mm` l.48). It
    goes higher only under `ThreadedTimeBasedAnimationsAtHighFrameRateEnabled`, which is "unstable" and false
    (l.490-502; yaml l.6270-6277).

  CONFIRMED (source, main).
- **What it means for us.**
  - K keeps working on both paths.
  - The start-frame keyframe cost stays on both, since a full style is resolved per keyframe (`updateBlendingKeyframes`,
    fix-cd-roll-ca README).
  - The 80-120 Hz request (README C9) would no longer apply to these animations, so a future Safari may play the
    roll at 60 Hz again.
  - A paused accelerated animation on today's CA path keeps its 80-120 Hz request: it stays on the layer at speed 0
    (`GraphicsLayerCA.cpp` l.3555-3558, l.3812-3826; `PlatformCAAnimationRemote.mm` l.583 and l.609-612). Whether CA
    honours a request at speed 0 is UNRESOLVED.

## 7. What this means for the page

1. **Land K** (fix-cd-roll-ca). It is exact, it is the minimum for an exact form, and P-097 (the panel clock)
   inherits it.
2. **Then the cell multiplier** (W first; S only behind a frozen-frame check, cd-strip's call).
3. **Don't move the roll** to `linear()`, `spring()` or `composite: add`.
4. **For new graphics-side work** (accent-ca, morph-ca), the framework lesson:
   - When the original motion is itself a CSS curve, hand over 2 keyframes and that curve. That is exact and the
     cheapest.
   - Pre-compute per-frame keyframes only when the original is a script-stepped path. Then use curve pieces (K),
     not straight ones.
5. **Keep C9 in view.** If a future Safari ships the threaded path, the iPhone frame-rate gain from graphics-side
   animations may shrink. The §4.4 frame-rate record in README would show it.

Files: scratch `gpu-lessons/{kcheck,tailcheck,bezfit,segfit,smooth,pathdump}.mjs` and `gpu-lessons/ver/fw/` (fetched
sources), in the session scratchpad, not committed: one-off models with no tool contract.
