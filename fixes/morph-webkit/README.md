# Fix: morph-webkit (end-of-page morph on the iPhone)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The `variants/*.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** builds ready for the iPhone finger test, which the lead schedules (proposed B g g B, with the
logger + `iphone.mjs record`). Chrome state check passed. No phone data on the builds yet.
**Owner:** fix-nav-morph (reports to mgmt-ops-3). This is the #1 target from user feedback: the lag is at the end of the page.
**Base:** `aw1-10c` (`fix.mjs combine aw1-10c all-wave1 scroll-engine`; JS 757e2cbc…, CSS c6aad94b…).

## Problem (iPhone finger data, relayed by mgmt-ops-3)

- **Baseline, unthrottled (A2).** While the user pushes past the end, the morph runs at ~10-18 fps: a steady
  run of 51-112 ms frames at scrollY 5220 (the morph pin), 50-75 frames > 50 ms per pass, worst frame 112-218 ms.
- **aw1-10c (B2).** ~13 fps for ~60 s at the pin, with bursts of 201-258 ms. scrollY alternates 5220 ↔ 5312
  every frame (toolbar collapsed, maxY 5220; 5312 is the rubber-band overscroll).
- Chrome's morph phase never showed this: Chrome has no rubber-band overscroll.

## Root cause (pin vs rubber-band)

The nav effect (JS ~13336 in aw1-10c) pins the page while the morph is active:
`L = () => { _(); C() && scrollY !== s && scrollTo({ top: s, behavior: 'instant' }) }`.
The pin target `s` is captured in the wheel/touchmove handlers (`C() || (s = window.scrollY)`) when the
morph starts. If the morph starts while iOS is in the bottom bounce, then:

1. `s = 5312` is stored, above maxY 5220.
2. `scrollTo(5312)` is clamped to 5220, so `scrollY !== s` stays true.
3. Every engine frame re-pins, against the bounce: scrollY alternates 5220 ↔ 5312.
4. Each pin is a scroll, so the scroll engine (`iE`) runs all callbacks again, at ~13 fps.

## Builds (all `--on aw1-10c`; serve: `node tools/fix.mjs serve <build> --on aw1-10c`, phone on the printed http twin port)

| build | change | kind |
|---|---|---|
| mw-f-pinclamp | `s` clamped to [0, maxY] (`__pinY`), no pin while scrollY > maxY (iOS springs back itself) | candidate fix |
| mw-g-pinclamp-osb | f + `overscroll-behavior-y: none` on html while the morph is active (set at start, cleared at end) | **candidate fix, first in line** |
| mw-gb | g + b (render-cost ablation without the pin alternation) | ablation on the fix |
| mw-ge | g + e | ablation on the fix |
| mw-a-nopin | no `scrollTo` pin at all | ablation |
| mw-b-noblur | all three per-frame variable blurs off: panel `filter: blur(var)`, backdrop `backdrop-filter: blur(20px*(1-morph))`, and `.start-selling-platform` `filter: blur((1 - --morph-fade) * 12px)` (CSS 5423) | ablation (render cost) |
| mw-e-nocols | morph panel image-column animations off | ablation (render cost) |
| mw-c-prelayer | panel `will-change: transform, opacity, filter` from its idle mount (#13 pre-mounts it already) | ablation |
| mw-d-passive | #6 v05 on aw1-10c | ablation / #6 |
| n12v5-aw1 | N12 v5 on aw1-10c (iphone-runner's N12 block), byte-identical to the parity-checked file | N12 |

`variants/*.diff` hold each build's patch against aw1-10c. The overlays live only in this worktree (gitignored).

**Chrome state check** (short lane, counts only; `logger-check.mjs`: mobile, scroll to the end, 25 wheel
pushes down, then 25 up):
- base, f and g all reach `--morph` 1 at y = maxY and return to 0 after the up pushes;
- 1 pin call each; wheel preventDefault 35/50;
- same listener timeline;
- g sets html `overscroll-behavior-y: none` only while the morph is active.

## Logger (`morph-log.mjs`)

`install` / `read`, needs the iphone lease; see the file header. It logs per frame, with no layout reads:
- dt, scrollY, `--morph` (inline style on the nav header);
- page rAF callback ms (sync part), with the longest callback's source;
- scrollTo/scrollBy calls and their target;
- touchmove (cancelable / defaultPrevented), wheel and scroll events;
- nav/panel class+style mutations, visualViewport height.

Plus a timeline of touch/wheel listener adds and removes with their passive flag. The `read` summary
splits frames > 34/50 ms by morph active/inactive and for the slow ones gives rAF JS ms vs the rest
(style/layout/paint/GPU), pin calls and touch events.

## Finger data so far (relayed)

E1b = aw1-10c, warm phone, user says "laggy":
- morph active 949 frames: p50 24 ms, p95 73 ms, 94 frames > 50 ms, worst 230 ms;
- the 5220 ↔ 5334 alternation is present, 73 pin scrollTo calls;
- 431/470 touchmoves preventDefault-ed;
- the slow frames are **rendering**: median rAF JS 0 ms on slow frames.

So the pin fix (g) alone is not expected to be enough; b/e name the render cost.

**F1/F2 = g, finger:**
- the pin fight is gone: 0 reversals (8 before), 0 pin scrollTo calls (73 before);
- render cost is not: morph-active p50 17-19 / p95 86-117 ms, 21-26 % of frames > 50 ms, worst 148-199 ms;
- user: "same laggy".

Keep g's pin fix. The render cost needs its own fix.

## Driver runs (no finger), base aw1-10e

The base is `aw1-10e` = `fix.mjs combine aw1-10e all-wave1 scroll-engine`, JS 3e2f599a…, CSS c6aad94b….
Builds are `mw10e-{f,g,fb,gb,ge,gc}`; diffs in `variants-10e/`. Serve with
`node tools/fix.mjs serve mw10e-<x> --on aw1-10e`.

Each build carries a **debug-only** hook, to be stripped before landing:
- `window.__fwMorphDrive({ hold: 2000, cycles: 3 })` scrolls to maxY and stores the pin target like a push does.
- Each cycle: `E(1)`, hold, `E(0)`, hold. That is the same spring `T` → `--morph` / nav classes / `S()` path a finger push starts.
- It logs rAF gaps and puts the JSON result in `window.__fwMD`. Safari's evaluate can't await, so poll it.
- The summary splits frames into moving (0 < morph < 1), at 1, and at 0.

**What the driver does not reproduce versus a finger:**
- the touch input path: touchmove handlers, preventDefault, the compositor waiting on the main thread;
- the iOS rubber-band/overscroll and the pin (no scroll happens, so `L` and the pin never run);
- the toolbar collapse;
- the scroll right before the morph starts.

So f vs g in the driver only answers the lead's `overscroll-behavior` compositing question.

`driver-check.mjs` state check, Chrome, short lane, state only: all six builds reach `--morph` 1 and return to 0,
scrollY stays at maxY, no errors, and `overscroll-behavior` is cleared afterwards.

### h-fixedpanel (`mw10e-gh` = g + R1 of `research/design-engineering/morph-endpage.md`)

Phone only (`@media (width<=640px)`). The change:
- The morph panel gets its final box: `inset: 0 auto auto 50%`, `width: var(--panel-w)`, `height: var(--panel-h)`,
  `translate: -50% 0`. The nav clips it.
- Center and footer follow the nav height H(m) = 52px + (panel-h - 52px)·m by `translate`.
- The panel's `transform-origin` is at H(m)/2.
- The veil follows by `scaleY(H/Hf)`. CSS can't divide lengths, so S() sets it per spring frame (debug build),
  with Hf read once per morph start.

Expected (model): moving-frame p50 down 30-45 ms; b-noblur at most ~10 ms. Not measured on the phone yet.

Chrome checks (short lane, `gh-parity.mjs`):
- Driver state: morph reaches 1 and returns to 0, no errors.
- Visual parity vs g at 430 px (DPR 1, animations paused, `--morph` pinned):
  - m = 0.15: 0.01 %;
  - m = 0.35: 0.08 %;
  - m = 0.6: **1.14 %** (rows 29-578: the mid-tween panel is ≤ 8 px wider than the box, so the columns and title differ; R1's predicted risk);
  - m = 1: 0.12 % (countdown).
- The final panel size is unchanged: 406 × 908 in both.

**iPhone driver result** (iphone-runner, 09:24-09:27Z, aw1-10e):
- Control ctl-B14 passed. Order: gh gb g g gb gh gh gb g. The served gh hashes match (JS 1df2484c…, CSS a2b0be9a…).
- Moving-phase p50, per run: gh 26/24/31, gb 29/27/35, g 36/35/31. Medians: **gh 26, gb 29, g 35 ms**.
  Earlier: g 34/29/27, f 30/33/35, fb 27.
- p95 when cool: 50-62 ms.
- The third round is thermally affected for all three builds (p95 98-117 ms, 400-800 ms spikes even in held states).

Verdict:
- gh ≈ gb, each ~6-9 ms better than g.
- The predicted ≥ 25 ms drop for gh did not happen, and neither term dominates.
- The transition stays at ~25-30 ms median (33-40 fps).

Next build: `mw10e-ghb` = gh + b (CSS db01137a…, JS = gh), to test whether the two savings add up. The
remaining candidates are the nav box's own per-frame layout/repaint (R2 clip-path) and the layer creation at the
tween start (R3).

**Mislabel in b (de-morph).** `.start-selling-morph-backdrop` has no backdrop-filter. The per-frame variable
`backdrop-filter: blur(20px*(1-m))` is on the nav itself (`.start-selling-top-nav.svelte-1dcozpm`, CSS 11387). So
b/gb/ghb removed only the panel filter and the platform filter.

`mw10e-ghbn` = ghb + `.start-selling-top-nav.is-morphing { backdrop-filter: none }` (CSS 253943ac…, JS = gh).
Diagnostic only.

### Middle-of-page frame at y≈1960 (de-middle, `research/design-engineering/middle.md`)

Claim: the morph IO on `#platform` (rootMargin 200%) fires at y≈1830 and causes an 86-106 ms frame. Two hypotheses:
- H1a: arming the non-passive touch/wheel listeners is expensive on WebKit;
- H1b: the 2 s Safari pre-mount had not run yet.

Builds on aw1-10e:
- `mw10e-e2`: rootMargin 200% → 150%, nothing else. Prediction: the frame moves to y≈2218.
- `mw10e-e1`: #6 v05 on aw1-10e. In the zone, listeners arm passive, and switch to blocking only at the end.
  It replaces `mw-d-passive`, which sits on aw1-10c and would mix bases.

Chrome state check (short lane): both reach morph 1 at the end and return to 0.

**iPhone e1/e2** (iphone-runner, 09:41-09:48Z, control passed, hashes matched):

| build | long frame, ms@y | median |
|---|---|---|
| control | 90@1965, 114@1969, 94@1967 | 94 |
| e1 | 105@1965, 94@1966, 86@1963 | 94 (H1a rejected) |
| e2 | 96@2243, 105@2239, 85@2242 | the frame moves with the margin |

- The panel was pre-mounted at scroll start 9/9 (H1b rejected).
- The R3 src logger names the frame 9/9: a burst of ≥ 12 panel `img` src writes, because the IO sets `b`, and `b` sources the images.

### Candidate `mw10e-src` (landable, JS f7716dc3…, CSS = base)

After the idle pre-mount, the panel's column images get their `src` in idle time:
- two per `requestIdleCallback` slice (`setTimeout(150)` on Safari);
- in first-render order;
- with the same scroll-aware re-arm as the mount.

`b`/`E` still source anything not yet reached, so the morph shows the same images. `inert` is unchanged (still
lifted at the IO, as before).

Chrome check (`src-check.mjs`, short lane, mobile 6x, mechanism/state only; `probe-results/src-check.json`):
- All 21 panel images are sourced and decoded within 1 s after settle at y=0.
- The scroll 0 → 2600 has 0 src writes; the base had 21 at y=1632, the IO edge.
- The load-phase long tasks are the same 4 in both: 120-283 ms vs 105-269 ms. No new > 50 ms task.
- 0 src writes in idle at y=0.
- The morph screenshot differs by 0.05 %.

**iPhone src vs control.** iphone-runner ran this 10:24-10:31Z, order C S S C C S, control ctl-B17 passed. **Verdict: not a win.**

| build | long frame, ms@y | median |
|---|---|---|
| control | 86@1966, 92@1964, 88@1942 | 88 |
| src | 97@1960, 84@1950, 91@1963 | 91 |

- The staging itself works: 21/21 images had their src at scroll start, and there were 0 src writes during the scroll.
- **Correction (F-044):** the R3 logger caps each frame's event list at 12. On the control, the 12 src writes filled that list and
  hid the frame's real trigger.
- On src, the frame carries exactly one event, 3/3: `inert` is removed from `div.start-selling-morph-panel`. Lifting inert at the
  IO edge restyles the whole panel subtree, and that is the ~90 ms frame. The src burst was only riding in the same frame.
- The `inert` was not in the original. #13's pre-mount added it to keep the early-mounted panel out of reach.

### Candidate `mw10e-noinert` (landable, JS 972eeb01c7da…, CSS = base; `variants-10e/noinert.diff`)

Built on mw10e-src. The pre-mounted panel is never made inert, so nothing flips at the IO edge. Before the edge, inert's three
jobs are covered by what is already there plus one guard:

| inert's job before the edge | covered by |
|---|---|
| hit test | the panel CSS has `pointer-events: none` until `.is-expanded` |
| accessibility tree | `aria-hidden` while --morph < 0.35 |
| tab order | the CTA button already has tabindex -1 until --morph 0.55; the RSVP and privacy links now get tabindex -1 until `b`/`E` |

From the edge on, everything is as in the original: the panel is mounted, not inert, and its links are tabbable. The edge frame now
changes only those 2 tabindex attributes. No CSS rule selects `[tabindex]` or `[inert]`.

**Chrome check** (`noinert-check.mjs`, short lane, mobile 6x; `probe-results/noinert-check.json`), base aw1-10e vs src vs noinert:

| check | base | src | noinert |
|---|---|---|---|
| y = 0 after idle: inert / aria-hidden | true / true | true / true | false / true |
| y = 0 after idle: tabbable panel focusables | 0 | 0 | 0 |
| y = 0 after idle: panel hits on a nav grid | 0 | 0 | 0 |
| y = 2600 (after the edge): tabbable panel focusables | rsvp + privacy | rsvp + privacy | rsvp + privacy |
| y = 2600: panel hits | 0 | 0 | 0 |
| at the morph (m = 1): tabbable / hits | cta + rsvp + privacy / same hits | same | same |
| panel attribute writes in the scroll 0 → 2600 | src×21 + inert@1632 | inert@1608 | tabindex×2@1632 |
| idle long tasks at y=0 | 5 load-phase | 5 | 4, no new one |
| morph screenshot vs base | — | 0.09 % | 0.10 % |
| exceptions | 0 | 0 | 0 |

- **Remaining difference from the original before the edge:** the panel's invisible text (countdown, copyright) is findable with
  find-in-page from load instead of from y≈1830. The original allows this after the edge.
- **Phone question:** does the y≈1960 frame drop below 50 ms?
- **Risk:** the mount task itself might now cost more on WebKit, because the subtree is styled without inert. It runs in idle
  time and is scroll-guarded.


**iPhone noinert vs control.** iphone-runner ran this 10:33-10:40Z, order C N N C C N, control ctl-B18 passed, with a per-type
logger that has no event cap. **Verdict: no win.**

| build | long frame, ms@y | median |
|---|---|---|
| control | 102@1962, 91@1947, 106@1965 | 102 |
| noinert | 98@1962, 99@1968, 95@1962 | 98 |

- On noinert, the long frame carries only the 2 `tabindex` writes, 3/3. So neither `inert` nor the image src writes are the
  cost (F-044 is refined, not confirmed).
- The idle mount frame did not grow: median 53 ms on the control, 51 ms on noinert.

What the IO edge still does on noinert:
1. it writes `b`. The Svelte effects that depend on `b` are the 21 src writes (no-ops, already sourced) and the 2 tabindex writes;
2. `I()` adds the window `wheel` (non-passive), `touchstart` (passive) and `touchmove` (non-passive) listeners.

e1 armed passive listeners at the edge and did not help. A remaining hypothesis: on iOS, adding any touch listener invalidates the
document's event-tracking regions, which are recomputed during a paint pass over all layers. That cost does not depend on
whether the listener is passive. Two diagnostics, both on noinert:

| build | JS | what moves out of the edge frame | what the edge still does |
|---|---|---|---|
| `mw10e-na` | 26d4d54889da… | listeners: armed once at setup, never toggled | writes `b` (2 tabindex writes) |
| `mw10e-nb` | 78ce0637395e… | the `b` write: `E` sets `b` at the morph start | adds the 3 listeners |

- In `mw10e-na` the handlers still preventDefault only at the end (`k()`), but `M()` runs `O()`, a `getBoundingClientRect`, on every
  touchmove page-wide. So na is diagnostic only.
- In `mw10e-nb` the panel links become tabbable at the morph start instead of the edge. Also diagnostic only.
- Chrome check (`noinert-check.mjs` with `BUILDS`, short lane; `probe-results/na-nb-check.json`):
  - the edge events are exactly as the table says: na `tabindex×2@1632`, no listener change; nb `+wheel/+touchstart/+touchmove@1632`,
    no mutation;
  - both builds reach morph 1, with the same tabbable set and hits at the morph;
  - morph screenshots differ from base by 0.07 % / 0.09 %; no errors;
  - Chrome 6x had one 51 ms long task in the scroll on base and noinert, and none on na/nb (n=1 each, so not a claim).
- **Reading:**
  - if na drops the frame and nb keeps it, the listener add is the cost. The landable fix is then to arm the listeners
    once in idle time, which needs a cheaper `O()` gate (for example, `u` checked first);
  - if nb drops the frame, the cost is the `b` effect flush;
  - if neither drops it, the cost is a non-JS change at that scroll position.

### y≈1960: the split, the attribution card (NAMED) and two F-stage candidates

**na/nb on the iPhone** (iphone-runner 10:40-10:43Z, C A B B A C, control aw1-10e, ctl-B19 passed). dt@y of the edge frame with
±2 neighbours:

| build | run 1 | run 2 |
|---|---|---|
| control | 16 17 **104@1962** 23 14 | 4 13 **107@1962** 33 10 |
| na | 16 17 34@2002 11 10 | 17 16 35@2057 12 11 |
| nb | 11 17 **84@1956** 16 17 | 15 23 **101@1975** 15 23 |

- na removes the frame and nb doesn't. It is one long frame, not a smear.
- Elsewhere na costs nothing (scripted): scroll fps 57.0/57.6 vs 55.4/56.3; whole-scroll frames > 50 ms 0/0 vs 3/1.
- Timeline (F-047), control frame 100@1957: RenderingFrame 97.6 ms = RecalculateStyles 34.4 (Layout 18.9 inside) + Composite 58
  (Layout 14, Paint 1.6, ~42 ms commit). JS is ~1.4 ms. On na, no frame over 30 ms in that range.
- **Attribution card signed NAMED by the lead.** Phone-only; the fix class is touch-only.
- **Caveat:** na and nb sit on noinert + src. Those two parts showed no effect on their own, and the landable builds drop them.

**Mechanism, WebKit source (de-unknowns-render):**
- On the window, `addEventListener`/`removeEventListener` for wheel, touch* and gesture* calls `invalidateEventListenerRegions()`.
- That recomputes the ROOT style's event-listener region types. If they changed, it runs `scheduleFullStyleRebuild()`.
- The types are inherited, so every renderer's style changes and its layer's event region is invalidated. The result is a
  whole-document style rebuild plus an event-region repaint of every composited layer.
- Passive listeners are types too, which explains e1's failure.
- Consequence: each change of the type set costs one such frame. The original pays it again on the way up, because `P()` removes
  the listeners.

**Candidates** (both on bare aw1-10e; no debug hook, since aw1-10e has none):

| | `mw10e-arm-load` (F1) | `mw10e-arm-idle` (F2) |
|---|---|---|
| JS | c6a3ac9256ea… | afff5a38ee28… |
| CSS | base c6aad94b455f | base c6aad94b455f |
| diff | `variants-10e/arm-load.diff` (+11 -3) | `variants-10e/arm-idle.diff` (+27 -3) |
| when armed | once at effect setup (page load) | once, at the first 300 ms scroll-quiet moment after scrollY passes one viewport, in a timer task |
| fallback | — | at the IO edge, as the original, if the user scrolls straight through |
| removed | never while the page lives | never while the page lives |
| zone gate | in the handlers: `k = C() \|\| (e > 0 && u && O())` | same |

- The zone gate means the handlers act exactly when the original had them attached (`u || C()`), and `O()`'s
  getBoundingClientRect never runs outside the zone.

**Chrome check (short lane; `probe-results/arm-check-pause.json`, scroll with a 1.5 s pause at y=1200):**

| build | listener adds | at the edge (y=1632) | morph | screenshot vs base |
|---|---|---|---|---|
| base | +wheel/+touchstart/+touchmove at y=1632 | those + src×21 + inert | reaches 1 | — |
| F1 | the same three at y=0 (setup) | only src×21 + inert, no listener change | reaches 1 | 0.07 % |
| F2 | the same three at y=1200 (in the pause) | only src×21 + inert | reaches 1 | 0.09 % |

- a11y and hit tests are identical in all three. No exceptions.
- Other window/document listeners of these families are added at load only: pointer*, and a `touchstart` on `<html>`. None is
  added during the scroll.

**Prediction card (P-pending, before any timed run).** Scripted, 4v4 vs aw1-10e:
- F1: the edge frame ≤ 37.5 ms (≤ 4 ticks) and no new frame ≥ 37.5 ms in the load/settle window.
- F2 with a 1.5 s pause at y≈1200: the edge frame ≤ 37.5 ms, and one frame of ~60-120 ms at the arming moment (inside the pause,
  not during the scroll).
- F2 without a pause: the same as the control (fallback at the edge).
- Risk: the bare base still flips `inert` and writes 21 img src in the edge frame (na had neither). If F1's edge stays above
  37.5 ms with only those events in it, restack F1 on noinert + src.
- Touch latency is not covered by the scripted driver. F1 makes the whole page a synchronous touchmove region from load; F2 does
  so from the arming moment. G/F runs with Event Timing on touchstart are required before landing.
- If that latency is worse, F3 is the fallback: element-scoped listeners on #platform and the nav header, armed in idle and
  never removed (de-unknowns-render (c)). The behaviour risk is a touch that starts outside them at the end zone.

**Block A, F1 vs aw1-10e (P4, iphone-runner, 14:25-14:30Z; ms only; raw: iphone-runner `out/iphone-runner/f-P4A-*.json`, `p4A.log`).**

- **Setup:**
  - C = aw1-10e (JS 3e2f599a1632 / CSS c6aad94b455f); V = mw10e-arm-load (JS c6a3ac9256ea).
  - Window driver top → 2500, with a 1.5 s pause at y 1248; r3 inert logger.
  - Run order C V V C C V V C, with one warm-up per port.
  - Sentinel: bottom 59.7-60 fps on every run, all pass.
  - Phone 37.5 → 39.0 °C, battery 80 %, Low Power Mode off.
- **Edge frame** (slowest frame in y 1940-2010):

  | arm | run 1 | run 2 | run 3 | run 4 |
  |---|---|---|---|---|
  | C | 101 @1974 | 116 @1975 | 102 @1975 | 100 @1968 |
  | V | none >34 | 49 @1988 | 40 @1994 | 42 @1999 |

  Every C edge frame is r3-named "src img → post-1.png ×21; inert morph-panel".
- **Card verdict (registered above: edge ≤ 37.5 ms): FAIL as registered.** Only 1 of 4 V runs passes.
  - The ~100 ms frame is gone in 4 of 4 runs, so the gain is large.
  - The edge frame still exceeds 34 ms in 3 of 4 runs, under both twins (30 and 38 ms).
  - At the 50 ms goal the edge passes in 4 of 4. This is threshold-sensitive: armload3's 49 ms is in the near band
    (46, 54] and fails the 46 ms twin. armload7's 42 ms is in no near band.
- **Scroll phase:**

  | arm | dt>50 per run | dt>34 per run |
  |---|---|---|
  | C | 2, 3, 2, 3 | 11, 8, 8, 8 |
  | V | 1, 2, 3, 1 | 12, 15, 12, 10 |

  Both rows are within noise by the run-unit rule (the ranges overlap). The dt>34 row points the wrong way: V median 12
  vs C 8. Some of V's extra frames: armload2 55 ms @2147, and a cluster in the pause at y 1238-1249 in armload3/6
  (48 and 52 ms). The pause cluster is not F1's: C has it too (frames >34 ms at y 1248-1250 in every C run, 35-39 ms).
  F1's maxima there are higher (48/52/51 ms), but n is small.
- **Load and settle:**

  | arm | dt>34 per run | dt>50 per run | max per run (ms) |
  |---|---|---|---|
  | C | 5, 7, 7, 5 | 1, 1, 1, 1 | 57, 53, 55, 54 |
  | V | 5, 9, 8, 8 | 0, 2, 1, 0 | 50, 53, 54, 48 |

  - No new frame ≥ 54 ms.
  - The card's "no new frame ≥ 37.5 ms" clause is not met by count, but the ranges overlap (within noise).
- **Reading:** F1 moves the y≈1960 frame from ~100 ms to 40-49 ms. That supports listener arming at the IO edge as most
  of that frame (OBSERVED; F-062, which listener costs it, is still UNRESOLVED and goes to P-030).
  - r3 names none of F1's edge frames: "named 0" in every V run, e.g. 49@1988 [] and 40@1994 []. Every C edge frame is
    named src ×21 + inert.
    - So the 40-49 ms residual is not the src + inert pair, and the card's risk line ("with only those events in it")
      does not apply. The noinert + src restack is not indicated by this data.
    - The residual is a frame with no DOM event in r3's view, right at the edge. Its cause is UNRESOLVED (in our setup,
      cause unknown).
    - Decisive check: a Timeline attribution run on F1 at the edge, after block B's end sentinel (protocol §5.2).
  - Block B (F3 arm-scope, ~14:40Z) is the second and last block for this question (§5.3).
  - Not land-ready as is. The touch-latency (G/F) requirement above also still stands.

**Block B, F3 vs aw1-10e (P4, iphone-runner, 14:40-14:45Z; ms only; raw: iphone-runner `out/iphone-runner/f-P4B-*.json`, `p4B.log`).**

- **Setup:**
  - Same driver and logger as block A. C = aw1-10e (:5476); V = mw10e-arm-scope (JS 7b0d62225545).
  - Sentinel: bottom 60 fps, max 19-22 ms, all pass.
  - The phone warmed to 40.9 °C by the end (warm, but the sentinel held). Battery 80 %, Low Power Mode off.
- **Edge frame** (slowest frame in y 1940-2010, with its r3 name):

  | arm | run 1 | run 2 | run 3 | run 4 |
  |---|---|---|---|---|
  | C | 115 @1978 | 118 @1973 | 110 @1980 | 106 @1969 |
  | V | none >34 | none >34 | none >34 | none >34 |

  - Every C edge frame is named src ×21 + inert.
  - V's nearest slow frames are all unnamed and all later on the page: run 1 48 @2250; run 2 39 @2036, 43 @2081,
    41 @2249; run 3 40 @2061; run 4 49 @2019, 9 px past the window.
- **Card (P1, lead: "k ≥ 12 → k ≤ 5 in 3/3"; on the phone as ms, ≤ 41.7 ms): PASS.**
  - Inside the window, 4 of 4 V runs pass, with no frame over 34 ms.
  - Counting run 4's 49 @2019 as the edge, 3 of 4 pass. 49 ms is in the near band (46, 54].
  - The card's other two parts are not tested by this block: touch input delay on G/F, and the arming cost at setup.
- **Frames over 50 ms in y 1700-2200:**
  - C 1/1/1/1 vs V 0/0/0/0: better.
  - The 54 ms twin also reads better.
  - The 46 ms twin does not: V's run 4 has 49 @2019, giving V 0/0/0/1, so the ranges overlap. The result is therefore
    threshold-sensitive.
- **Scroll phase:**

  | arm | dt>50 per run | dt>34 per run |
  |---|---|---|
  | C | 2, 1, 2, 3 | 11, 9, 7, 11 |
  | V | 1, 0, 0, 1 | 9, 10, 9, 10 |

  Both rows are within noise (the ranges overlap). Unlike F1 in block A, the dt>34 count does not rise.
- **Load and settle:**

  | arm | dt>50 per run | dt>34 per run | max per run (ms) |
  |---|---|---|---|
  | C | 2, 1, 2, 1 | 5, 6, 9, 8 | 60, 55, 61, 60 |
  | V | 1, 1, 0, 1 | 7, 5, 10, 8 | 58, 61, 46, 61 |

  Within noise, with no new frame ≥ 54 ms. The pause at y 1249 (dt>34: C 2/2/2/3, V 1/1/2/3) is within noise too.
- **Reading:**
  - F3 removes the y≈1960 frame. Inside the window no frame exceeds 34 ms in 4 of 4 runs.
  - F1, in block A, left 40-49 ms there in 3 of 4 runs.
  - The two blocks have separate controls (C edges 100-116 vs 106-118 ms), so F3 vs F1 is not a within-block
    comparison. It is suggestive only.
  - Both arms leave unnamed 39-49 ms frames between y 2019 and 2250. Their cause is UNRESOLVED (in our setup, cause
    unknown); the F1 Timeline attribution run is in progress.
  - This was the second block on this question, so the sequential rule (§5.3) allows no third.
  - F3 is the candidate going forward. Before it can land:
    - a G/F touch-delay check;
    - a Chrome regression A/B;
    - review.

### F3 `mw10e-arm-scope` (listener scope; lead + OSS survey P1, F-055)

- **What it is:** F1 with the touch listeners moved off the window. Built on bare aw1-10e. JS 7b0d62225545…, CSS = base;
  `variants-10e/arm-scope.diff` (+26 -7).
- **touchstart** (passive) **and touchmove** (non-passive): on `#platform` and `header.start-selling-top-nav`, once at setup,
  never removed.
- **wheel**: stays on the window, once at setup (as in F1). Wheel creates no touch region, and desktop wheel anywhere still drives
  the morph.
- **Zone gate:** inside the handlers (`u`), as in F1.
- **Why:** with a non-passive window touchmove, the whole page becomes a synchronous touch region (F-055). With element listeners,
  only those two subtrees do. Arming restyles only them (`Element::invalidateEventListenerRegions`), but it happens at setup anyway.
  - **Status update:** arch-claims marks F-055 REFUTED for iOS 26.6 (F-070; earlier UNSUPPORTED): there is no
    synchronous touch region on 26.6, so the touch-region reason above doesn't apply. F3's case rests on its other
    half, no listener add at the IO edge, the same as F1. F-062 (which listener costs the frame) is UNRESOLVED;
    P-030 (C vs lw vs lt) decides it. Block B now tests F3 as an alternative to F1, not as a touch-region gain.
  - F-071 (OBSERVED): finger runs tick rAF at ~80 Hz while moving, scripted S runs at 60 Hz, so fps and frame
    counts don't compare across the two drivers. The ms thresholds are unaffected.
- **Behaviour check** (`touch-check.mjs`, Chrome, touch emulation; `probe-results/touch-check.json`):
  - At the end of the page #platform spans the whole viewport (top −949, bottom 932 at 430x932; the card is 1880 px tall), so
    every touch there starts on #platform or the nav. The behaviour gap I feared (a touch above #platform) does not exist in
    this geometry.
  - A 240 px upward swipe reaches morph 1 in base, F1 and F3 alike, both from y≈699 and from y≈88.
- **Listener check** (`noinert-check.mjs`, base vs F3; `probe-results/arm-scope-check.json`):
  - F3 adds `+wheel` on the window and `+touchstart`/`+touchmove` on SECTION (#platform) and HEADER, all at y=0.
  - At the edge it adds nothing. The base adds `+wheel/+touchstart/+touchmove` on the window at y=1632.
  - Morph reaches 1; the screenshot differs from base by 0.14 %; no errors.
  - The pre-existing `touchstart` on `<html>` is the same in both.
- **Prediction (P1, lead):**
  - the y≈1960 frame goes from k ≥ 12 to k ≤ 5 in 3/3 scripted runs;
  - touch input delay is not worse than the control on G/F;
  - the arming cost at setup is smaller than F1's whole-document rebuild (only the window wheel type changes the root).

de-middle's other R1 items (`inert` until the morph, listeners once passive) are not needed for this frame.

### Morph driver round 2: ghbn vs ghb vs gh

iphone-runner ran this 10:42-10:52Z in 3 rounds (ghbn ghb gh | gh ghb ghbn | ghbn ghb gh). The phone was cool: held-state p95 17 ms,
idle 60.5 fps. Moving phase:

| build | p50, 3 rounds | p95, 3 rounds | > 50 ms, 3 rounds | median p50 / p95 |
|---|---|---|---|---|
| ghbn | 21, 25, 25 | 45, 52, 53 | 1 %, 9 %, 10 % | 25 / 52 |
| ghb | 24, 26, 28 | 54, 57, 57 | 10 %, 15 %, 17 % | 26 / 57 |
| gh | 29, 24, 27 | 84, 44, 59 | 18 %, 1 %, 12 % | 27 / 59 |

- All three builds are within ~2 ms at p50, and their p95 ranges overlap.
- The variable blurs are not the transition cost on the phone. That covers the panel and platform blurs (ghb) and the nav's own
  backdrop blur (ghbn, which has no nav backdrop during the whole morph).
- So R8, which turns off a subset of these, cannot win by itself. ghr85a vs gh still isolates R5a (layers at the tween start).
- What is left of the ~25 ms p50 / ~55 ms p95 is not a blur cost. The candidates are:
  - layout and paint of the morphing box: the nav backdrop's width, height, border-radius and background change every frame;
  - the per-frame style writes of the spring (`--morph` on the header, `--morph-fade` on the platform, the veil transform).
  N2 step 2 (size morph moved to transform) addresses the first.

### Morph attribution and the countdown probe (P-017, F-050)

**Attribution session** (iphone-runner 10:57-11:09Z, Timeline + LayerTree):
- Moving frames carry Script ~1 ms, style 1-5 ms, layout < 1 ms and Paint ≤ 4 ms.
- The cost is Composite minus its Paint children:
  - gh: 20-39 ms in the first 300 ms of a tween, 12 ms after 400 ms;
  - g: stays ~20 ms in the tail.
- Layers (gh): 35 at rest, 113 at the m=1 hold, 33 after, so ~78 are created and destroyed per cycle.
- platform-card (430x1880, 12.6 MB) repaints on ~every tween frame (11/14 fwd/rev).
- de-pm-morph's post-mortem (F-050): the start transient is the ~80 morph-panel countdown digit `.face` layers (`will-change: transform`,
  CSS 1408-1415). They are created when the panel scene goes active and repaint on most early frames.

**Probe builds** (both on gh, CSS only, JS 1df2484cc79c; diffs in `variants-10e/gh-cdwc.diff` and `gh-cdhid.diff`):

| build | CSS | change |
|---|---|---|
| `mw10e-gh-cdwc` | 66aaffb61d59 | `.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c { will-change: auto !important }` |
| `mw10e-gh-cdhid` | 89c1492e6362 | the panel countdown at `visibility: hidden !important`; upper bound, visually wrong |

**Chrome check** (`cd-check.mjs`, short lane; `probe-results/cd-check.json`):

| | gh | cdwc | cdhid |
|---|---|---|---|
| faces with `will-change: transform` at the m=1 hold | 80 | 0 | 80 |
| layers at the hold | 148 | 68 | 68 (Chrome makes no layers for hidden faces) |
| frozen-hold diff vs gh, same page, rule injected | — | 0.13 % (noise floor gh vs gh 0.11 %) | 0.39 % (countdown missing) |
| exceptions | 0 | 0 | 0 |

The ticket went to mgmt-ops-5 and iphone-runner: driver M, a 3-arm Latin square, hold 2000, 3 cycles, plus one Timeline cycle per arm.

**iPhone result, P1 = P-017: PASS** (iphone-runner 11:57-12:07Z, phone cool, gh control sentinel passed; driver M,
hold 2000 × 3 cycles, Latin square; raw `out/iphone-runner/md-p-*`, `mdtl-p1-*`, `lt-p1-*` in iphone-runner's checkout):

| readout | gh | gh-cdwc | gh-cdhid | prediction (cdwc) |
|---|---|---|---|---|
| face-repaint frames, first 450 ms (Timeline) | 76 % | **0 %** | 0 % | ≤ 20 % — hit |
| excess per fwd tween, first 450 ms (median per run) | 170 / 190 / 228 ms | **38 / 66 / 101** | 41 / 99 | ≥ 30 ms lower — hit (−120..−150) |
| layers at the m=1 hold | 113 | **33** | 113 | ≤ 40 — hit |
| Composite − Paint, first 300 ms | 25.1 ms | 13.2 | 12.5 | ≤ 20 — hit |
| moving p50 / p95 | 22-27 / 42-57 | 17-19 / 21-26 | 17-20 / 22-27 (+1 disturbed run, flagged) | — |
| first-300 ms dt median (fwd), pooled per run* | 26-35 ms | 18-22 ms | 18-26.5 ms | — |

\* Recomputed 14:1xZ from md-p-*.json: frames from the first m > 0 of each forward tween to 300 ms later, pooled per
run. This replaces a tick-form row (no k forms on the phone) whose window definition was not recorded and which this
recompute does not reproduce.

- cdhid wins as much while keeping all 113 layers, so the cost is the faces **repainting**, not the layer count
  (F-063). The repaint of the faces is removed (observed). Removing `will-change` is one way to stop the repaint;
  it is the measured one, and it also frees 80 layers.
- **Mechanism, arch-claims' audit (12:4xZ).** CONFIRMED in WebKit source; the attribution to these 80 repaints stays
  OBSERVED, with P-017's ablation as the device evidence.
  - RenderLayerBacking.cpp (main l.1440-1445, l.1904; safari-7624-branch l.1356/1761) repaints a whole composited
    layer when its sub-device-pixel offset from the renderer, snapped to a device pixel, changes.
  - That happens in 1/6 CSS px buckets at DPR 3, so slow motion repaints different layers on different frames.
  - A second trigger is the offset's device-pixel part changing (GraphicsLayer.cpp l.608-618).
  - Both only fire when layout dirties geometry, not for a pure transform animation. `will-change: transform` gives
    no exemption, and a fractional compositing ancestor shifts every descendant.
  - So two other fixes are supported by source: quantize the panel width so its centering offset stays on the
    device-pixel grid (width steps of 2/3 CSS px at DPR 3), or lay out at the final width and move by transform (R1).
    They are kept as follow-ups if P-029 shows the gain needs R1.
- P2 = P-016b (hold 900 vs 2000) showed no shortening: a cold store is not the cost.

### The countdown fix and its follow-ups (after P1)

All new names; existing overlays untouched (F-034). Diffs in `variants-10e/`.

| build | base | JS | CSS | hook | role |
|---|---|---|---|---|---|
| `mw10e-cdwc` | aw1-10e | = aw1-10e 3e2f599a1632 | 5dc6e8e37388 | none | **landable fix**: one CSS rule |
| `mw10e-g-cdwc` | g | = g 22efa0ab69ba | 5dc6e8e37388 | driver | transfer check on the landing stack (pin fix g, no R1) |
| `mw10e-gh-cdwc-a1` | gh-cdwc | c5ab82228dde | = gh-cdwc 66aaffb61d59 | driver | P10 = P-024 clock shift (A1) |
| `mw10e-stub` | ghbn | = gh 1df2484cc79c | f672fd4f1ff1 | driver | finger batch F2 perception stub; never lands |

- **The fix** (`variants-10e/cdwc.diff`, +8 lines, CSS only):
  `.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c { will-change: auto; }`.
  - It is the P-017 rule without `!important`. The only other rule that sets `will-change` on these faces is the
    scene-pause rule (CSS 11809, `auto !important`), so the computed value is the same in every scene state.
  - Scope: the morph panel's countdown only. The page's other countdown keeps its face layers (not part of the morph).
  - At the hold, the seconds digit's spring (one ~0.3 s tween per second) now repaints a 1ch × 1.3em box in the panel
    instead of moving a layer. That repaint is small; the held-frame (`atOne`) numbers of P-017 haven't been relayed
    yet, and the P-029 block reports them.
  - Coupling (F-056): countdown-idle-raf's countdown-ca (sampled WAAPI keyframes on the faces) would need these faces
    to keep `will-change: auto`, or to stop changing transform during the morph tween.
- **Transfer check** `mw10e-g-cdwc` vs `mw10e-g`: P-017 was measured on gh (R1 fixed panel), but R1 is not landable
  (its veil scale is set in JS per frame, debug). The landing stack is aw1-10e + the pin fix (g) + this rule. On g the
  panel still resizes per frame (398 → 406 px), which may repaint the panel content with or without face layers.
- **A1** (`mw10e-gh-cdwc-a1`; `research/design-engineering/morph-clock-replay.md` §2, §5):
  - `E()` arms A1 only for a tween from rest: no tween running (`n == 0`) and the start value `i` exactly 0 or 1.
  - The first `T` call writes `i ± 0.0011` toward the target (scene flips active, ~0.8 px at the nav edge) and does
    not read the clock.
  - The second call sets `o = e − 16.67` and continues with the unchanged ease-out (`ZM`), so it shows M(16.67 ms).
  - Tweens that reverse mid-flight keep the shipped clock.
- **Stub** (`mw10e-stub`): it has the same listeners, `preventDefault`, pin, 680 ms time tween, nav box growth,
  panel opacity/scale and veil. It drops what renders: `display: none` on the panel's image columns
  (`.start-selling-morph-backdrop`), center (title, countdown, CTAs) and footer, plus ghbn's no-blur rules. The
  panel is a flat gradient box. It answers K16 / U1 only: does the time-tween interaction feel laggy when the render
  is cheap?

**Chrome mechanism check** (`cd2-check.mjs`, short lane, 430x932 DPR 1, no throttling; mechanism and parity only;
`probe-results/cd2-check.json`, `cd2-check-stub-rerun.json`):

| build | path | layers at the m=1 hold | panel faces with `will-change: transform` | m 0 → 1 → 0 | exceptions |
|---|---|---|---|---|---|
| aw1-10e | wheel | 144 | 80 | yes (260 ms) | 0 |
| **mw10e-cdwc** | wheel | **64** | **0** | yes (259 ms) | 0 |
| mw10e-g | driver | 142 | 80 | yes | 0 |
| mw10e-g-cdwc | driver | 68 | 0 | yes | 0 |
| mw10e-gh-cdwc | driver | 68 | 0 | yes | 0 |
| mw10e-gh-cdwc-a1 | driver | 68 | 0 | yes | 0 |
| mw10e-stub | driver | 53 (rerun) | — (center not displayed) | yes | 0 |

- At rest, every build has 125 layers and the paused scene (stub 116), and the page's other countdown keeps its 80
  face layers.
- Parity for the fix: aw1-10e hold screenshot with the rule injected, same page, animations paused: 0.11 %. The same
  page before and after gives a noise floor of 0.13 %.
- A1: the first logged m values of each tween are 0.001 then 0.072, i.e. start + 0.0011, then M(16.67 ms) = 0.0717.
  Reverse: 0.999 then 0.928. 4/4 tweens. gh-cdwc starts at a variable M(e1) (0.014-0.037).
- Stub: the first run had two long frames (333 ms moving, 159 ms at m=1). The rerun with frame indices
  (ghbn, stub, gh in one hold) had none in any build: all moving frames ≤ 9.4 ms. The only frame > 34 ms is the
  driver's first logged frame, which the driver excludes. So the first run's frames were host noise; the host was
  loaded, with load1 ~6.

Tickets (validated by mgmt-ops-5): **P-029** g vs g-cdwc (M, C V V C C V V C; ranked right after ca-check) and
**P10 = P-024** gh-cdwc vs gh-cdwc-a1. mw10e-stub goes to the finger batch as F2.

**P-029 on the iPhone: PASS** (iphone-runner 13:17-13:25Z; g vs g-cdwc, driver M, hold 2000 × 3, C V V C C V V C,
one warm-up per port; served g JS 22efa0ab69ba / CSS c6aad94b455f, g-cdwc JS 22efa0ab69ba / CSS 5dc6e8e37388;
80 %, 34.1 → 37.4 °C, not charging, Low Power Mode off). Sentinel: the controls' held m=1 p95 was 17/17/17/18, so all
passed; g8 sits exactly at 18 (A5 flag) and was the worst control. Raw: `out/iphone-runner/md-r29-*`,
`mdtl-r29-{g,gc}`, `lt-r29-*`, `p029.log` in iphone-runner's checkout.

Moving frames (0 < m < 1), dt in ms:

| run | > 50 | > 34 | ±4 ms (>46/>54, >30/>38) | max | moving p50 | moving p95 |
|---|---|---|---|---|---|---|
| g1 | 1 | 51 | 3/0, 58/28 | 54 | 29 | 45 |
| g4 | 2 | 48 | 2/1, 56/32 | 56 | 29 | 44 |
| g5 | 3 | 47 | 4/3, 60/32 | 68 | 30 | 45 |
| g8 | 27 | 58 | 37/20, 66/55 | 68 | 40 | 64 |
| **gc2** | 0 | 0 | 0/0, 1/0 | 31 | 18 | 23 |
| **gc3** | 0 | 0 | 0/0, 1/0 | 32 | 18 | 23 |
| **gc6** | 0 | 1 | 0/0, 2/0 | 35 | 23 | 29 |
| **gc7** | 0 | 0 | 0/0, 0/0 | 28 | 19 | 23 |

| readout | g | g-cdwc | prediction | verdict |
|---|---|---|---|---|
| face-repaint frames, first 450 ms (Timeline) | 22/26 (85 %) | 0/32 (0 %) | ≤ 10 % | hit |
| excess per fwd tween, first 450 ms (per-run medians) | 209 / 210 / 217 / 234 ms | 80 / 79 / 146 / 81 | −60 to −150 | hit (≈ −130) |
| excess per rev tween | 210 / 210 / 186 / 294 | 37 / 38 / 120 / 50 | — | — |
| layers at the hold | 113 | 33 | ≤ 40 | hit |
| median dt, first 300 ms (iphone-runner readout) | 34-48 ms | 18-23.5 | — | — |
| median dt, first 300 ms of each fwd tween, pooled per run (recomputed from md-r29-*) | 35.5-40 ms | 20-23.5 | — | — |
| moving p95, prediction (4) | 44-64 (45/44/45/64) | 23-29 (23/23/29/23) | 28-45 | outside the interval, on the good side (median 23) |
| Composite − Paint p50, first 300 ms | 19.9 ms | 16.3 | — | — |

- g-cdwc wins every moving-frame column. Frames over 34 ms drop from 47-58 per run to 0-1, and frames over 50 ms from
  1-27 to 0.
  - Corrected (review-cdwc B5, either-twin rule of 77c480e): >34 is not threshold-sensitive (>30 56-66 vs 0-2, >38 28-55
    vs 0).
  - >50 is threshold-sensitive: the >54 twin is 0/1/3/20 vs 0, and the ranges overlap.
  - Near-band frames: g-cdwc 31-35 ms in (30, 38]; g many in (46, 54].
- Held m=1: g-cdwc p95 17, max 17-25, 0 frames over 34 ms in all four runs. g: p95 17-18, max 35-57, 2-7 frames
  over 34 ms per run. So the per-second digit repaint at the hold costs nothing measurable.
- The mechanism is the same as P-017's on gh: the gain does not need R1. The landable fix `mw10e-cdwc` (the same rule on
  aw1-10e) goes to review.

**F2 pre-check on the iPhone** (iphone-runner 12:4xZ, M driver, hold 2000 × 3, 80 % battery, 36.5 °C, not charging):
**VALID.** Raw files: `out/iphone-runner/md-fpre-{stub,gh}.json`.

| | moving frames | p50 / p95 | > 34 ms | > 50 ms | max | held m=1 p95 |
|---|---|---|---|---|---|---|
| mw10e-stub | 215 | 17 / 17 ms | 0 | 0 | 23 ms | 17 |
| mw10e-gh | 139 | 23 / 51 ms | 30 | 7 | 73 ms | 17 |

The stub renders at a steady 17 ms per frame, so the finger item F2 compares a smooth flat box against the real panel.

### Listener split for arch-claims' W/T ticket (diagnostic, never lands)

- **Source reading** (arch-claims, ver-webkit-layout, WebKit tag 7624.4.5 ≈ iOS 26.6):
  - A window wheel listener triggers a full style rebuild only when the set of event-region types changes: the first wheel
    listener (passive counts), the first non-passive one, or removal of the last of either.
  - Touch event regions are compiled out on iOS before WebKit 7625 (`ENABLE_TOUCH_EVENT_REGIONS` 0).
  - So the touch half of F-062 has no mechanism on 26.6, and the y≈1960 frame is OBSERVED, cause unknown, until a
    device split.
- **Builds** (bare aw1-10e; zone gate in the handlers as in F1, so behaviour is unchanged):

| build | toggled at the IO edge, as in the original | armed once at setup | JS |
|---|---|---|---|
| `mw10e-lw` | wheel `{passive:false}` | touchstart, touchmove | 5a92076d6908 |
| `mw10e-lt` | touchstart, touchmove | wheel | b61fd2045362 |

- **Chrome check** (short lane; `probe-results/split-listen-check.json`, `split-touch-check.json`):
  - Listener adds during the scroll: base adds wheel, touchstart and touchmove at y=1608. lw adds only wheel at y=1632
    (touch at y=0). lt adds only touchstart and touchmove at y=1632 (wheel at y=0). Other families are added at load
    only.
  - a11y at the top, at the edge and at the morph is identical to base. A touch swipe on #platform drives the morph to
    1 in all three builds. Morph screenshot vs base: 0.12 % / 0.16 %. No exceptions.
- **Prediction (source):** lw keeps the edge frame, with a full-size RecalculateStyles; lt loses it, with
  RecalculateStyles absent or root-only. If lw keeps the frame with a root-only RecalculateStyles, the cause is
  UNRESOLVED (a region rebuild in Composite/Other?).
- **Ticket** (arch-claims; nav-hit-test co-owner): C aw1-10e vs lw vs lt, 3-arm Latin square, driver S, Timeline on every
  run.
- The F1/F2 code comments ("wheel/touch listener add … invalidates the ROOT style") must be reworded to the wheel-only,
  type-set wording before landing. The listener add is the observed cause.

### R8 and R5a on gh (de-morph): `mw10e-ghr8`, `mw10e-ghr85a`

Both are built on `mw10e-gh` (`--on aw1-10e`) and keep the debug driver hook.

- **R8:** `S()` toggles `is-morph-covered` on the nav and on `.start-selling-platform` exactly when `--morph-fade` reaches 0
  (`QM(r) = 1 - min(1, r / KM)`, so `t <= 1e-4`). The class is written once per edge, not per frame. CSS:
  `.start-selling-top-nav.is-morph-covered { backdrop-filter: none !important }` and
  `.start-selling-platform.is-morph-covered { filter: none !important }`.
  - JS ce2a9bb3fa72… (the same in both builds). CSS: ghr8 a9ed752953d7…, ghr85a 1d1846a92311….
  - Diffs: `variants-10e/ghr8.diff` (+102 -5), `variants-10e/ghr85a.diff` (+106 -5).
- **R5a (ghr85a only):** `.start-selling [data-start-selling-scene="paused"] .start-selling-morph-col-track { will-change: transform !important }`.
  The 5 column tracks keep their layers while the scene is paused, so the tween start does not create them.
  - R5(b) was not built. R5(b) would flip the scene to active at the IO, and that moves layer creation into the y≈1830 IO frame
    (the #2 frame above).

**Chrome check (`r8-parity.mjs`, short lane, 430x932 DPR1, morph frozen with animations paused).** The pixel diff inside the
nav rect compares the class on vs off at m = 0.55 / 0.7 / 0.9 / 1:

| class toggled on | 0.55 | 0.7 | 0.9 | 1 |
|---|---|---|---|---|
| platform only | 0 % | 0.12 % | 0 % | 0.04 % |
| nav only | **1.04 %** | 0.55 % | 0.08 % | 0 % |
| both (ghr85a) | 1.04 % | 0.52 % | 0.06 % | 0 % |

- **The platform half is exact.** #platform's computed opacity is 0 at fade 0.
- **The nav half is NOT exact before m ≈ 0.9.** The nav backdrop also blurs the end-of-page section under the nav, which is the
  countdown / "Join waitlist" block, not only #platform. At m = 0.55 the residual radius is 9 px. The change is subtle (the edges
  are a little sharper) and lasts ~200 ms while moving, but it is a pixel change.
- An exact variant would gate the nav at m ≥ 0.9, inside the 0-0.4 % noise band, while keeping the platform at fade 0. Under
  ease-out-cubic over 680 ms, m reaches 0.9 at ~365 ms (0.55 at ~160 ms). It is built only if ghr8 wins on the phone.
- **State during a real morph** (driver hook, sampled per rAF, both builds):
  - the class is on only at m ≥ 0.55 (first on at 0.550-0.568), never off above 0.56, and off again at the end;
  - no exceptions;
  - in ghr85a all 5 tracks compute `will-change: transform` while their scenes are paused.

## Composited morph (N2), if b names the blur

Each morph frame currently changes:
- three blur radii: panel `filter`, backdrop `backdrop-filter`, platform `filter`. Each change means a full re-blur of a large area;
- the backdrop's `width/height/border-radius/background`, which means layout + repaint of a big box.

The plan:
1. **Blur:** fixed radii, faded with opacity instead of radius:
   - the panel without `filter`, its entry carried by `opacity` + `transform: scale` (both composited);
   - the backdrop blur as a separate fixed `blur(20px)` layer whose `opacity` = 1 - morph;
   - the platform's blur dropped, keeping its `opacity` fade.
2. **Size:** if b alone doesn't reach 60 fps, the size morph moves to transform. A full-size panel box is
   scaled from the pill with `transform: scale(x, y)`. Corner radius is kept by a counter-scaled inner, or the
   pill is cross-faded with the panel. That is more work and a visual risk, so it comes only after b's verdict.

## Next steps

1. Finger run with the logger: B g g B. If g removes the 5220 ↔ 5312 alternation and the ~13 fps run, run
   the C/D #6 pair on top. If frames > 50 ms remain with a steady scrollY, run b and e to split the render
   cost (per-frame re-blur, column animations); a real fix would then be a composited morph (N2).
2. Chrome parity (short lane) for the chosen fix: morph start/stop and the pin on wheel in both directions.
   The logger-check above covers the basics.
3. Land with or after #6 (same effect, same owner); the finger verdict decides.
