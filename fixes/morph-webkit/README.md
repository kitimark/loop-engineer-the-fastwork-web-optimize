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
| mw-a-nopin | no `scrollTo` pin at all | ablation |
| mw-b-noblur | panel `filter: blur(var)` and backdrop `backdrop-filter: blur(20px*(1-morph))` off (both radii change every morph frame) | ablation (render cost) |
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

## Next steps

1. Finger run with the logger: B g g B. If g removes the 5220 ↔ 5312 alternation and the ~13 fps run, run
   the C/D #6 pair on top. If frames > 50 ms remain with a steady scrollY, run b and e to split the render
   cost (per-frame re-blur, column animations); a real fix would then be a composited morph (N2).
2. Chrome parity (short lane) for the chosen fix: morph start/stop and the pin on wheel in both directions.
   The logger-check above covers the basics.
3. Land with or after #6 (same effect, same owner); the finger verdict decides.
