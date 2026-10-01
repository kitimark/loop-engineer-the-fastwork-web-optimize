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
