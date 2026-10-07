# g0: v14 with the original end-of-page menu, run on the GPU (R and D: inventory and design)

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork). This doc
> names class names and line numbers of the frozen baseline (`site-pretty/`, pinned by `baseline.json`). Keep it on
> local branches, never push.

Owner: arch-gpu-original (architecture), 2026-10-07.

**Requests.**
- User thread T-228 #60 (15:38Z): "roll back the scroll functionality to the original page, but optimize it to use
  GPU rendering". The lead answered yes (#61).
- **Scope narrowed by the user, T-228 #62:** roll back only the END-OF-PAGE behaviour to the original. Everything
  above the end of the page stays as in v14: hero, people (People title slide included), countdown, the nav's
  top-of-page behaviour.

**Stage: R → D, desk only.**
- Nothing was measured: no Chrome, Simulator or phone run.
- The only check that ran is `bez-check.mjs`, a math check in node.

**Conventions.**
- JS = `/_app/immutable/nodes/2.DyWL8TcE.js` and CSS = `/_app/immutable/assets/2.gBuqKVzi.css`, the prettified
  baseline. Lines are 1-based.
- v0 = the baseline. v14 = the current best: `fixes/BEST_BUILDS.md`; one combined diff, `fixes/compositor-morph/v14/v14.diff`.
- "diff L" = a line of `v14.diff`.
- m = the morph value: 0 = menu closed, 1 = menu open.
- Status words follow CLAUDE.md "Platform claims".
- Engine sources: WebKit `out/engines/WebKit` at 4d3c1638849c (main) and Chromium `out/engines/chromium` at baf9e3b02268.
  Both are sparse clones, read only.

Sources:
- mapper reports map-g0-top, map-g0-bottom, map-g0-v14split and map-g0-endrevert (bundle-mapper, sonnet). The lines
  they cite for the morph, the engine, the hero exit and the countdown spring were read again;
- `research/01-initial-investigation/motion-inventory.md`, `fixes/TOPICS.md`;
- `research/architecture/gpu-compositor-playbook.md` (§7);
- F-162, F-296, F-306, F-307, F-317, F-319, F-324, F-326, F-330;
- the fix READMEs named below.

## 0. In plain words

- **The original end-of-page menu does not follow your finger.** On reaching the end of the page, the first swipe down
  holds the page still and the menu opens by itself over 680 ms. A swipe up closes it the same way.
  v14's "menu follows your swipe" (PR-018 / PR-023) replaced exactly this.
  **g0 brings the hold back**, unless the user keeps that change.
- **Most of the menu has an exact GPU form.** The 680 ms curve is exactly `cubic-bezier(1/3, 1, 2/3, 1)` (§3.1, checked:
  largest difference 3e-16). So the menu card's fade, blur and zoom, and the blur-fade of the section under it, can run
  as timed GPU animations that equal the original. Today script computes them in every frame.
- **The bar's box has no exact GPU form.** Its size, corner radius and colour change while it opens. That part stays
  on the main thread, driven by CSS with no script per frame. The closest GPU look-alike is the clip-path reveal of
  PR-012 rev 1, recorded within T2. It is an option to check again against v0 (§3.1, M3-B).
- **The rest of v14 stays**: everything above the end of the page.

## 1. Inventory: what the original changes per frame

### 1.1 The scroll driver (shared by every section; v14 keeps its own engine changes)

| piece | JS | what it does |
|---|---|---|
| `rE` / `iE` | 2667-2673 | one passive `scroll` + `resize` listener (2675-2679) schedules one rAF; `iE` runs every active callback |
| `dE` | 2749-2783 | registers a callback; with `element`, a shared IntersectionObserver (default `100% 0px`, 2768) flips `active` |
| scene gate `cE` / `sE` | 2691-2713 | `data-start-selling-scene=active\|paused`, `data-start-selling-render` (CSS 11754-11762: paused animations, `content-visibility`) |

The end-of-page code registers one callback, the nav's `L` (`dE(L, {manageAnimations:false})`, JS 13090, no element, so
always active). v14 changes the engine (diff L86-283: idle un-skip, will-change windows, one-way render deferral). No end
code calls into those changes, and they call nothing in the end code (§2.3).

### 1.2 End-of-page items in v0 (in scope)

Widths: 430 = phone (≤640), 768 (641-860), 1280 (desktop).

| # | item | JS | trigger | reads | writes per frame | 430 / 768 / 1280 |
|---|---|---|---|---|---|---|
| J | scroll-jack listeners | 13041-13087 | `wheel` + `touchmove`, `passive:false`, capture; attached while #platform is within 200 % (IO) or the morph is on | `O()`: #platform rect + `visualViewport.height`, on each downward event before the morph starts | `preventDefault()`; target 0 or 1 by the sign of the delta (`XM`, 12691-12692) | all widths |
| L | nav pin | 13077-13079 | every scroll frame (`iE`) | `scrollY` | `scrollTo({top:s, behavior:'instant'})` while the morph is on | all |
| M | **morph tween `T`** | 13020-13036; `ZM`/`YM` 12688-12698 | rAF loop for 680 ms per gesture | `performance.now` | Svelte `x` → inline `--morph` on the nav root (13243); `--morph-fade` + `pointerEvents` on #platform (`S`, 13013-13018); the nav template effect re-runs every frame (13219-13243) | all |
| MP | panel mount | 12878-12935, 13082-13087 | IO 200 %, once | none | mounts the panel: 5 columns, 21 eager images, a second countdown, CTAs | all (columns 4-5 hidden ≤640, CSS 10986-10988) |
| N | nav state `_` (shared with the top) | 13000-13011 | every scroll frame | `getComputedStyle` + 2 rects (`ee`), nav rect, `pointerEvents` write → `elementFromPoint` → restore (`F`), `.hero-track` rect | classes | all |

**The morph's CSS consumers** (all from `var(--morph)` or `--morph-fade`):

| element | property (CSS line) | class | shape in m |
|---|---|---|---|
| nav root `.start-selling-top-nav` | `top` 16 → 20 px (11328); **≤640: 16 → 12 px (11571)** | layout | linear |
| | `width` (11331-11334), `height` (11335) | layout | linear |
| | `background: color-mix(#ffffff1a, #131922)` (11336-11340) | paint | linear |
| | `border-radius` 32 → 20 px (11341) | paint | linear |
| | `backdrop-filter: blur(20px·(1−m))` (11342-11343) | compositor property on a box whose size changes | linear |
| logo (under `.is-morphing`) | `left: inset + (50% − inset)·m` (11433), `translate: −50%·m` (11434) | layout + compositor | linear in m; the 50 % follows the bar width |
| actions | `gap` 8 px → 0 over m 0-0.2 (11440; 4 px ≤640, 11585), **`transition: gap 0.68s`** (11442) | layout | clamp, then a transition restarted every frame |
| Join `.is-earn` | `--earn-out = clamp(m/0.2)` → `max-width`, `padding-inline` (**0.68 s transitions**), `opacity` (**0.32 s after 0.12 s**), `filter: blur(·10px)`, `translateY(·−8px)` (11478-11496) | mixed | clamp, partly through transitions |
| panel `.start-selling-morph-panel` | `opacity: clamp((m−0.08)/0.72)`, `filter: blur((1−that)·12px)`, `transform: scale(0.96+0.04m)` (10543-10549) | compositor | piecewise linear, kinks at m 0.08 and 0.80 |
| `#platform` | `opacity: f`, `filter: blur((1−f)·12px)`, f = 1 − min(1, m/0.55) (CSS 5388-5393, JS 12699-12701) | compositor | piecewise linear, kink at m 0.55; `filter: blur(0px)` stays at rest |

**Template flips** (JS 13196-13243). In v0 they are evaluated in every tween frame:
- `is-morphing` m > 0.001; `is-on-dark` m > 0.2; `is-expanded` m > 0.92;
- panel `aria-hidden` m < 0.35; scene attribute m > 0.001; `tabindex` m < 0.55 and > 0.4;
- #platform `pointer-events: none` at f < 0.05, i.e. m > 0.5225.

Dead CSS: `--pill-out` and `.start-selling-morph` (CSS 10439-10506, 10924-10930): no markup uses them.

### 1.3 Out of scope now (kept as v14)

The v0 inventory above the end was mapped too. It stays here for reference; per T-228 #62 nothing in it changes:

| item | JS | what it does in v0 |
|---|---|---|
| hero exit | 4163-4174 | `--exit-opacity`, a pure linear function of scroll |
| ring splash | 4198-4231 | 1.8 s rAF at load, ≥601 px |
| countdown spring | 3789-3803, 3826-3840 | semi-implicit Euler, ≤16 ms steps, so it depends on the frame rate |
| accent | 3670-3730 | timers, `stroke-dashoffset`, `width` transition |
| people "o" | 6226-6264 | one-shot layout transitions |
| avatar carousel | 11331-11380 | `width` / `flex-basis` keyframes |
| future, commission, profile | 11300-11333, 3085-3150, 10899-10976 | per-frame low-pass; visible only on desktop |
| pain notes | 4555-4736 | timers + rect reads |
| #platform shrink | 12433-12448 | smoothstep, visible only on desktop |
| fee visual | 2404-2530 | IO-started tween |

For these, v14's state is the g0 state.

## 2. v14 against v0: what reverts and what stays

### 2.1 End-of-page changes in v14 (REVERT to v0 in g0)

| change (user-visible) | proposal | where in v14 | patch of record |
|---|---|---|---|
| menu follows the swipe (an extra screen of scroll `.fw-ms-end` on touch phones, `__msTick`, release glide 0.33 s) | PR-018 rev 7c | JS nav component (diff L1884-3341: `__msOn`, `__msTick`, `__msEnd`); CSS `html.fw-ms` (appended) | `fixes/morph-scroll/patch.diff`, `delta.diff` |
| fast swipe back keeps momentum | PR-023 rev 5 | same code | `fixes/morph-scroll-v9try/patch.diff` |
| GPU menu card (corner clippers, scales, view timeline `--fwms`, glass and tint on `u3`) | PR-030 rev 2 | JS `__cm*` (diff L2452-2760); CSS `html.fw-cm` (appended) | `fixes/compositor-morph/cm-on-v10.diff` + c1 `fixes/v10/cm-c1.diff`, c2, c3 (glass blink fix), c3b-a, K6, V13 (`fixes/compositor-morph/*-on-*.diff`) |
| Join: timed exit after 20 % open | PR-032 rev 3 | JS `cmEnd` in the earn animator (diff L2016-2020); CSS `html.fw-cm … .is-earn-hidden` (diff L4731-4743) | `fixes/compositor-morph/fade3-on-v11.diff` |
| Join: no 8 px jump at the end | PR-027 rev 5 nolift | | `fixes/v10/nolift-delta.diff` |
| reveal with clip-path (phones, non-CM path) and P1 / P1b | PR-012 rev 1, P1 | JS `__rv*`, `data-fw-rv`, `.fw-rv-*`, `.fw-rv-size` | `fixes/morph-gpu/`, `fixes/end-morph-p1-v9f/`, `fixes/end-morph-p1b-a/` |
| hit-skip (nav hit test skipped past m 0.2) | less work, needs `__msOn` | diff L2202-2212 | `fixes/hit-skip/delta.diff` |
| **Join at the END: cut-and-slide on a timer** (`.is-earn-hidden` on at m 0.2, off at m 0) | PR-021 rev 3 (shared with the top) | earn animator `__ew*` (JS); CSS diff L4279-4401 removes v0's `max-width` / `padding-inline` / `opacity` / `transform` rules | `fixes/nav-earn/delta.diff` |
| `is-morphing` at m > 0 instead of > 0.001 (stops the close's last sub-pixel width-transition restarts, F-243) | inside PR-021 rev 3 | diff L1884-1893 | `fixes/nav-earn/delta.diff` |
| `overscroll-behavior: none` while morphing (`__osb`) | morph-webkit build g | diff L2252-2259, 2777-2788 | (v9 lineage) |
| pin and listener rework: `__pinY`, `__pinMax`, touch listeners on #platform and the header, a new `L` | morph-listeners-once, mw10e F3, morph-webkit pin | diff L2789-2865 | (v9 lineage) |
| K6 pre-built CM tree near the end (`__cmPreS`, `__cmPreChk`, `fw-cm-pre`; the closed pill drawn by CM rules) | c3b-K6 | diff L1894-1897, 2327-2341, 4764-4807 | `fixes/compositor-morph/c3b-k6-on-c3b-a.diff` |
| sticky #platform + `.fw-ms-end` spacer | morph-scroll | CSS diff L4524-4537 | as PR-018 |
| ≤640 logo `transform-origin: calc(50%·m)`, `.is-morphing` language-switch translate | nav-earn rev 1 / rev 3 | CSS diff L4349-4364, 4385 | `fixes/nav-earn/delta.diff` |

The full hunk map (every v14 hunk in v0 11994-13250 and the end CSS, by origin and by TOP / MID / END / SHARED) is
map-g0-endrevert's table. It is summarised here because it would double this file: roughly 70 % of the nav component's
added code is end-only and becomes dead once `__msOn` and `__cmOn` are false.

### 2.2 v14 changes that stay in g0 (above the end, or invisible)

| change | why it stays | end interaction |
|---|---|---|
| everything in §1.3's area: hero exit (PR-011), countdown (PR-007/008/017, faces, strips, the panel's countdown too), accent (PR-019), people "o" X2 (PR-031), avatars (PR-013/014), double-drive (PR-022), scene-scope (PR-002), shell-hold-c, H1c, wave 1 except the end topics, engine /10 | user scope (#62) | none (§2.3) |
| Join at the TOP (PR-021: hero-pill flip, cut-and-slide) | user scope | **shared mechanism**: §2.3, risk R1 |
| nav colour test: nav-hit-test (wave 1), nav-hit-cache U1, c3b-a #2 (IntersectionObserver instead of a per-frame rect) | top-of-page behaviour, identical by construction | glue for morph-scroll's on-dark microtask (`glue-ms7c`) must go; under v0's tween `is-on-dark` is forced at m > 0.2 anyway |
| scene-scope R4a / R4b: `@property --morph-fade` and `--morph` registered `inherits: false`, consumers take `--morph: inherit` (diff L3511-3537) | invisible (it is PR-002's less-work part) | end-related. Keep it: it already removes v0's whole-subtree restyle. Needs morph-inherit's writer |
| morph-inherit `__mkW`: writes `--morph` inline on each consumer (bar, logo, actions, Join, panel), because WebKit does not re-resolve an explicit `inherit` when only the header's value changes (diff L3025-3055; F-183, OBSERVED) | correctness fix for R4b | end code. Keep its writer, drop its CM branch (`__mkCm` / `__mkOff`) |
| morph-panel-lazy-mount (wave 1): the panel mounts in idle time | invisible, identical at the morph start | end code, keep |
| f12 (c): #platform's animations paused while it is faded out | invisible (Chrome 0 px, Simulator T2) | end code. Keep it if its trigger works without morph-scroll (it pauses at fade 0) |
| i219-hydrate (the earn span created after hydration) | needed while PR-021's span exists | none |
| c3 platform-fade: `S()` writes only on change, caches its node, sets `data-fw-pf-paused` (diff L2232-2251, CSS L3862-3871) | invisible less work | end code. Port it onto v0's `S()`; without it the pause rule goes dormant (nothing breaks, the saving is lost) |
| countdown-faces' panel props `shown` / `active` (`__cdPanelShown` at m > 0.08; diff L1898-1900, 3281-3295) | the countdown stays as v14 (user scope); the panel copy rests while invisible | keep. Without them the panel countdown runs always (cost only) |
| the panel countdown's `will-change: auto` and cd-strip rules (CSS diff L4489-4508) | countdown look stays as v14 | keep |
| #platform internals: platform-idle G1 / G3 (PR-009), rest-script count-up, c3b-a #2 shrink observer (diff L1701-1883, CSS L4202-4264) | MID (the section above the menu), user scope | none |
| removal of the dead `.start-selling-morph` CSS (c3 #7, CSS diff L4045-4201) | no DOM uses it | none |

### 2.3 Coupling check (reverting the end must not break the rest)

- **JS**: every reference to the end code's names (`__ms*`, `__cm*`, `fw-cm`, `fw-ms`, `__rv*`, `--fwms`, `__mk*`, `__ns*`)
  sits inside the nav component, diff L1884-3341 (v0 12944-13250).
  - `grep` of diff L1-1883 (engine, hero, countdown, accent, pain, people, profile, future, #platform) finds none.
  - The engine, hero, people and countdown changes do not depend on the end code.
- **CSS**: the end code's rules are the appended `html.fw-ms` / `html.fw-cm` / `data-fw-rv` blocks, the #platform fade
  (diff L3850), the panel / dead-morph rules (diff L4045-4192) and the nav rules (diff L4202-4484).
  - The non-end CSS (diff L3343-4044) references only the R4a/R4b `@property` block.
- **Shared inside the nav component** (map-g0-endrevert, verified by reading):

  | seam | what reads the end code | what a plain revert does | g0 fix |
  |---|---|---|---|
  | nav state `_` (nav-hit-cache U1 + glue, c3, c3b-a) | `__nsOnResize` reads `__msOn` and `__nsEndNear` (diff L2095). `__nsNear` reads `__msTick.g` (L2101). `__nsDefer` reads `__msTouch`, `__msT`, `__msEnd` (L2114-2116). The skip terms in `__h` read `__nsLate`, `__msOn`, `__msP`, `__cmOn()` (L2210-2214) | **ReferenceError on the first frame** | delete those terms; keep the other `__h` terms and the `C()` test. The skip terms rest on morph-scroll's sticky-#platform "coverage proof" (L2207), which goes with the spacer |
  | `@property --morph` + `--morph: inherit` (R4b, CSS diff L3524-3538, also `.language-switch-wrap`, L4335-4337) | needs `__mkW` (L3053) | on WebKit the children freeze (logo, Join and panel fade stuck, F-183) if `__mkW` goes and R4b stays | keep both (g0.1 replaces most `__mkW` writes by animations) |
  | Join (PR-021, both places) | `cmEnd` (L2020) and `__mkOff` (L3047) read `html.fw-cm` | without `fw-cm` they take the non-CM path; nothing breaks | see §3.2 |
  | `S()` / `data-fw-pf-paused` | the CSS pause rule | goes dormant | port c3's `S()` |
  | panel countdown props | `shown` / `active` | defaults make it always live | keep the props |
  | geometry readers under the sticky #platform (shrink observer L1831, `__nsMeasure` L2150-2155) | page geometry | returns to v0's, which is what they were built on before morph-scroll | none |

  The engine hunks (diff L11-357), hero, people, countdown and double-drive reference none of the end names, and their
  `dE` registrations do not depend on the end code.

## 3. GPU plan for the end of the page

Engine facts used below, read in the clones:

| claim | status | reference |
|---|---|---|
| WebKit accelerates time-based animations of opacity, filter, backdrop-filter, transform, translate, scale, rotate only | CONFIRMED | `Source/WebCore/css/CSSProperties.json` 7590, 10836, 11233, 12787, 12935-12981 (`animation-wrapper-acceleration: always`) |
| WebKit refuses CA for `steps()` and `linear()` with points; cubic-bezier is accepted | CONFIRMED | `Source/WebCore/animation/KeyframeEffect.cpp` 2007-2013 |
| custom properties are never accelerated in WebKit | CONFIRMED | `Source/WebCore/style/StyleInterpolation.cpp` 256-265 |
| Chrome composites opacity, transform and backdrop-filter (blur included); filter only without a pixel-moving filter | CONFIRMED | `third_party/blink/renderer/core/animation/compositor_animations.cc` 196-203, 408-420 |
| WebKit's bezier solve is Newton to 1e-7. With x control points 1/3 and 2/3, x(s) = s, so it is exact | CONFIRMED (source + `bez-check.mjs`) | `Source/WebCore/platform/graphics/UnitBezier.h` 39-40, 112-164 |
| an in-effect scroll-driven animation restyles its target on every rendering update, also when paused | CONFIRMED (F-330) | `ScrollTimeline.cpp` 291-297, `AnimationTimelinesController.cpp` 138-177 |
| style changes caused by animations do not start CSS transitions | CONFIRMED (spec) | CSS Transitions 1 §3 (before- and after-change styles both include declarative animations at the current time) |

### 3.1 M: the morph as timed animations

**Why time, not scroll.** In v0, m is not a function of the scroll position:
- a swipe only gives a target of 0 or 1 (`XM`, JS 12691);
- `E` (13024-13036) starts a 680 ms tween from the current value to that target;
- the page is pinned (`L`, 13077-13079);
- `ZM`: value = from + (to − from)·(1 − (1 − t)³), t = elapsed / 680 ms.

`1 − (1 − t)³` is exactly `cubic-bezier(1/3, 1, 2/3, 1)`. Matching the coefficients gives y1 = y2 = 1 and x(s) = s;
`bez-check.mjs` measures a largest difference of 3.3e-16 over 10 001 points (CONFIRMED).
A reversal mid-flight is a new tween from the current value: in g0, a new set of animations. Exact.

Time animations also end. So there is no F-319 / F-330 restyle at rest, provided g0 writes the end value and cancels the
animation (v0 also rests on an inline `--morph`).

**Exact keyframe segments.** On a segment where a consumer is affine in m:
- its value is a cubic in time; normalised, it is 0 at the segment start and 1 at its end;
- every such cubic is a cubic Bézier with x control points 1/3 and 2/3 and solvable y1, y2;
- so each kink of a piecewise-linear consumer becomes one keyframe, each segment with its own exact `cubic-bezier`.

Kinks: the panel at m 0.08 and 0.80, #platform at 0.55. The kink times come from inverting the cubic,
t = 1 − ∛(1 − (m* − from)/(to − from)). They are computed once per gesture: arithmetic, no DOM reads.

| part | g0 form | exact? | engine path |
|---|---|---|---|
| **M1** panel opacity / blur / scale (CSS 10543-10549) | WAAPI on the panel: `opacity`, `filter`, `transform`; 3 segments with exact beziers | **yes**; T0 expected, T1 if the GPU blur rounds differently (gate) | WebKit: CA (CONFIRMED). Chrome: opacity + transform composited; the blur keeps the effect on the main thread (CONFIRMED), still with no script and no restyle beyond the panel |
| **M2** #platform fade (CSS 5388-5393) | WAAPI on #platform: `opacity`, `filter`; 2 segments. `pointer-events` flips by bucket. At the end, write `--morph-fade` inline as v0 does, then cancel | **yes** | WebKit CA. On v9-final #platform's 430x1880 layer was repainted in every approach frame (F-296, OBSERVED); a CA animation should not repaint it (to gate) |
| **M3-A** nav box: `top`, `width`, `height`, background mix, radius, backdrop blur (CSS 11328-11343, 11571) | keep the CSS. Run a WAAPI animation of the registered `--morph` (R4b already registers it `<number>`, `inherits: false`) on the nav root, bar and logo, with the same easing. Each consumer gets its own animation, never the value through
`inherit`: WebKit does not re-resolve `inherit` when only the parent changes (F-183, OBSERVED) | **yes**: the same `calc()` over the same m; a registered number interpolates as from + (to − from)·eased(t) | main thread (custom property, CONFIRMED), but no script per frame. Layout and paint of the box stay |
| **M3-B** (option) nav box as PR-012 rev 1's clip-path reveal (full-size nav cut to v0's box by `clip-path: inset(… round r)`, parts moved by transforms), on the 680 ms curve | T2 on record against its base (`fixes/morph-gpu/README.md` "Pixels": text up to ~1 device px off in motion). Must be re-gated against v0 | WebKit runs clip-path on the main thread (no acceleration entry); no layout per frame. Its first open cost +7 ms (P-092, OBSERVED) |
| **M3-C** (option) CM's GPU box (PR-030) on the 680 ms curve | T3 (PR-030's mid-motion differences) | only if the user keeps PR-030 |
| **M4** actions `gap`, Join `max-width` / `padding-inline` / `opacity` | **keep a per-frame inline `--morph` write** on these two (morph-inherit's `__mkW` already does it). v0 restarts their 0.68 s / 0.32 s transitions in every frame, and animation-driven changes would not start transitions (spec row above). Join blur and translateY follow m directly | yes, only this way | main thread; two small subtrees |
| **M5** class / aria / tabindex / pointer-events flips | a light rAF computes m with the same `ZM` on the same rAF timestamps. It writes Svelte state only when a bucket changes (0.001, 0.2, 0.35, 0.4, 0.5225, 0.55, 0.92), plus M4 | **yes**: the same frame flips | today `x` changes per frame and re-runs the whole nav template effect (13219-13243). Bucket it |
| **M6** rest | at the tween's end, write the final inline `--morph` on every consumer, then cancel the animations | yes | nothing in effect at rest |
| J / L | **unchanged**: they are the behaviour | yes | touches still wait for the main thread, as in v0. Less-work option: `O()`'s rect read from the platform IO + a ResizeObserver cache |

**What M saves per tween frame** (predictions to gate, not measured):
- the tween script and the nav template effect;
- the inline writes on the root, bar and logo;
- WebKit: the panel's and #platform's main-thread filter / opacity updates and repaints (#platform: 430x1880).

What stays: style of ~5 elements, the box's layout and paint, the M4 transitions.

### 3.2 Join at the end: back to v0 on top of PR-021's top behaviour

v14's CSS removed v0's `.is-earn` `max-width` / `padding-inline` / `opacity` / `transform` rules (diff L4279-4401). It
drew the button with PR-021's earn-box clip and slide on a timer, at the top and at the end.

PR-021 changed the structure itself:
- a span `.start-selling-top-nav-earn-box` now carries the dark pill and the `padding-inline`;
- the button has `padding: 0`, a fixed `max-width`, `opacity: 1`;
- the actions keep the 8 px gap reserved;
- the language switch moves by `--earn-w` (diff L1985-1992, 4288-4334).

So v0's end rules cannot simply come back: v0's `padding-inline` on the button would double the box's 24 px, and v0's
background is on the button. In v0 the same declarations also serve the top: `--nav-expand` is 0 at the hero pill, and
`--earn-layout` couples both places.

Options (a lead decision; the default is the one marked):
- (a) revert PR-021 whole. That reverts the top too, against #62.
- **(b, default for "original at the end")** keep PR-021's structure at the top, and at the end draw v0's motion on it:
  - drop `.is-earn-hidden` and its timer at the end;
  - under `.is-morphing:not(.is-hero-pill)`, drive the box's `padding-inline`, the button's `max-width`, the opacity,
    the blur and the 8 px → 0 lift from v0's formulas over `--earn-out`, with v0's transitions (0.68 s / 0.32 s after
    0.12 s);
  - restore v0's actions gap formula and its 0.68 s transition there.

  This is new code. Gate: T0 against v0 at every seek step, and T0 at the zone edge where the top mode hands over
  (risk R1).
- (c) keep v14's timed hide at the end (PR-021 + PR-032). It is accepted already, but it is not "original".

Also revert F-243's `> 0` to v0's `> 0.001` (end behaviour); v0's sub-pixel width restarts at the close's last ~68 ms
come back.

## 4. Build order

**Step 0: g0.0, the reference ("v14 with v0's end").** v14 + a revert of §2.1 inside the nav component and the end CSS:
- v0's `T` / `E` / `D` / `A` / `M` / `N` / `P` / `I` / `L` / `S` and template flips;
- R4a/R4b + `__mkW` (without its CM branch), lazy mount, c3's `S()` and the panel countdown props kept;
- the nav state `_`'s end terms deleted (§2.3, else a ReferenceError);
- `__osb`, the pin rework, K6 and the spacer removed;
- §3.2 for the Join (option b unless the lead picks another).

No GPU change yet. Built from `fixes/compositor-morph/v14/rebuild.sh` output (its own dir, never site-pretty).

Gates (counts and pixels only, shared lane):
- (a) **end-of-page pixel parity with v0** at m 0-1 (seek harness below), widths 430 (775, 815), 768, 1280, in Chrome
  (screencast captures, PR-010 A/A floors) and in the Simulator. Pass: T0 for the nav, logo, actions, Join, panel and
  #platform fade. #platform's own content differs only by PR-009's sweep and glint (kept, accepted);
- (b) **v14 parity above the end**: frozen-scroll pixels at 20 y-stops from the top to #platform, T0 against v14
  (Chrome + Simulator), and class parity of the nav at the top (hero-pill flip, on-dark, Join at the top);
- (c) DOM / hydration: no `Failed to hydrate` (F-306), page height equal to v0's at the end (`.fw-ms-end` gone).

Build: about 4-5 h (a surgical revert in the nav component, the Join re-expression), plus about 1.5 h of gates.
The seek harness for step 1 is built here too (the g0.0 side stubs rAF timestamps and `performance.now`).

**Step 1: g0.1 = M1-M6 on g0.0** (§3.1, option M3-A). It is the largest expected end-of-page gain. On the phone the end
held most slow frames: 59 % at 0 < m < 0.55 with #platform blurring (F-295, OBSERVED, v9).

- **Gate 1, seek parity** (new harness `seek.mjs`, built in step 0):
  - g0.0 runs with rAF timestamps and `performance.now` stubbed to chosen elapsed times;
  - g0.1 runs with its animations paused at the same `currentTime`;
  - compare at 0-680 ms in 40 ms steps, for open, close, and a reversal at 300 ms; the same widths; reduced motion
    (v0 jumps);
  - pass: T0 for M3-A / M4 / M5, T0/T1 for M1 / M2, in Chrome and the Simulator; computed `--morph`, classes, aria and
    tabindex 0 differences at every step.
- **Gate 2, counts per tween frame** (Chrome and Simulator): elements restyled, Layout, Paint by layer.
  Prediction: #platform and panel paints near 0 on WebKit, style elements down, Layout unchanged (the box).
- **Gate 3, rest**: after open and after close, no animation left; paints per 500 ms equal to g0.0.
- **Gate 4, layers** at m 0, 0.5, 1 and at rest; first-open promotion named.
- Risks:
  - **K8**: building ~6 animations in the gesture's first frame. Keep it to arithmetic + `element.animate`;
    precompute the per-width constants at idle after load (F-318).
  - **F-324 / F-326**: CA animations on the panel and #platform may create layers at each open. Both already carry
    filters in v0 (#platform `blur(0px)` at rest, the panel's blur), so the census at m 0 vs mid-tween decides. Keep v0's
    layer hints so the first frame creates nothing.
  - **F-162**: a new animation is pending for a frame. v0's first tween frame is also the next rAF; the gate checks the
    first two frames.
  - **F-306 / F-307**: no template changes; the animations live in script, `@property` in CSS.

Build: about 4-5 h, plus about 2 h of gates.

**Try-it ready: g0.1.** It is the first g0 step the user can try on the phone: the original hold and 680 ms menu at the
end, with the card and section fades on the GPU, and the rest of v14 unchanged. Time from now, step 0 + step 1 built
and gated: **about 10-12 hours of agent time**, no phone needed before the Try-it. A phone counts block (protocol v2)
follows if the lead wants one.
g0.0 alone can be offered as a Try-it after about 6 h. It shows the original behaviour, but it is not faster.

**Step 2 (option, needs a decision):** M3-B (PR-012-style clip-path box on the time curve) if it passes T2 against v0,
or M3-C if the user keeps PR-030. Either removes the box's per-frame layout. About 4-6 h each.

**Step 3 (less work, invisible):**
- port hit-skip to the tween: skip the hit test while m > 0.2, where `is-on-dark` is forced anyway;
- cache `O()`'s geometry;
- T0 gates.

## 5. Summary for the user (answer format)

**g0 is buildable: v14 everywhere, except that the end-of-page menu goes back to the original and runs mostly on the GPU.**
- At the very end, the original holds the page still and opens the menu by itself over 680 ms. v14's "menu follows
  your swipe" replaced that; g0 brings the hold back.
- That 680 ms curve can be handed to the graphics chip exactly. The menu card's fade and zoom and the blur of the
  section under it then run with no script per frame, and look the same as the original.
- The bar's own box (size, rounded corners, colour) has no exact GPU form. It keeps the original's look and gets cheaper.
- The Join button at the end goes back to the original. At the top it stays as in v14.
- First phone Try-it (step 1): about 10-12 hours of agent work. A Try-it of the original behaviour without the GPU part
  is possible after about 6 h.

**What you need to do:** nothing now. Later: try g0 on the phone when it is posted.
