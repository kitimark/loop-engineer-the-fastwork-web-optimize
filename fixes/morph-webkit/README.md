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

### Middle-of-page frame at y≈1960 (de-middle, `research/design-engineering/middle.md`)

Claim: the morph IO on `#platform` (rootMargin 200%) fires at y≈1830 and causes an 86-106 ms frame. Two hypotheses:
- H1a: arming the non-passive touch/wheel listeners is expensive on WebKit;
- H1b: the 2 s Safari pre-mount had not run yet.

Builds on aw1-10e:
- `mw10e-e2`: rootMargin 200% → 150%, nothing else. Prediction: the frame moves to y≈2218.
- `mw10e-e1`: #6 v05 on aw1-10e. In the zone, listeners arm passive, and switch to blocking only at the end.
  It replaces `mw-d-passive`, which sits on aw1-10c and would mix bases.

Chrome state check (short lane): both reach morph 1 at the end and return to 0. de-middle's R1 (images `src`
at the idle pre-mount, `inert` until the morph, listeners once passive) waits for e1/e2.

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
