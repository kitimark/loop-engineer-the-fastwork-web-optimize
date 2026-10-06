# Fix: hit-skip (skip the nav's backdrop hit test while the end morph stands past 0.2)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** ready for v10 (decision rule met twice; pixels T0 in Chrome and the Simulator). Counts and pixels only;
no timing (memory defer-timing-focus-call-tree).
**Kind:** less-work candidate (memory less-work-landing-rule): lands on cost-card counts + a short phone no-worse check
**Base:** C = v9-final + menu rev 7d (`fixes/morph-scroll-v9try/patch.diff` 6d1632eb0ee9, `fixes/v9-best/build.mjs` V9D;
JS 1b2eecc66011, CSS e1359ab9994a; a read-only copy in `out/hs/C`)
**Build:** HS = C + `delta.diff` (this folder), JS f40adc603373, CSS unchanged (e1359ab9994a). `patch.diff` is
baseline-relative (C + HS, `fix.mjs diff`).
**Asked by:** the lead, 2026-10-06 13:10Z (from compositor-morph's P-157 follow-up); slot: v10 (int-v8) if clean.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, `_()` in the nav component (pretty line ~14136 of C).

## Why it lags

The nav's dark-backdrop class is `is-on-dark = s(g) || s(x) > 0.2` (JS 14716): `g` is the hit-test answer (what lies
under the nav's middle, `F()` 13863-13870: `getBoundingClientRect` + `document.elementsFromPoint`), `x` the morph
value. nav-hit-cache's `_()` (14114-14150) runs the real test only when the answer can change, but one of its
conditions is `C()` ("the morph is on", `w > 0.001 || r > 0.001`): so during the end-of-page morph the hit test runs
on every scroll frame, and on WebKit it forces a layout (the morph writes geometry every frame, so layout is dirty).

Evidence (iOS Simulator Safari, Timeline with call stacks, WDA finger strokes up through the morph zone and back;
`out/cm/lay/lay-sim.mjs`, not committed; see `fixes/compositor-morph/README.md` "Where V's remaining Layout comes from"):
on v9-final, 456 of 724 layouts sat inside script; 132 + 194 of them under `F` (`elementsFromPoint`,
`getBoundingClientRect`) < `_` < `L` < scroll engine `iE`. On the phone (P-157, G driver) the C arm laid out 2.2-2.4
times per morph frame.

Past m 0.2 the answer cannot show: `is-on-dark` is true whatever `g` says.

## What changed

`_()` skips the hit test while, on touch phones (`__msOn`, menu rev 7d's scroll-driven morph), the last morph value
written is past 0.2 (`__msP > 0.2`) and the spring's value is too (`r > 0.2`, in case the debug driver `__fwMorphDrive`
moves m by the spring). Everything else in `_()` runs as before (theme signature, zones, `__nsTail`, the probe line).

Why the visible class stays the same:
- going in: the frame m crosses 0.2 upward still tests (`__msP` is the old value); from then on `is-on-dark` is true by
  `x` alone;
- coming back: `__msTick` already re-tests after any write that brings m to <= 0.2
  (`e <= 0.2 && queueMicrotask(() => (z(g, (__nsG = F()), !0), (__nsForce = !0)))`, 14320), and sets `__nsForce`, so
  the next `_()` tests again too. In C that re-test also ran; the skipped test (in `_()`, before the write) was the
  one whose answer was overwritten by it;
- desktop, wider screens and reduced motion (`__msOn` false) are untouched.

## Results (counts and pixels; no timing)

**Decision rule** (lead, 13:10Z): lands in v10 only if HS < HSC in TOTAL layouts on the Simulator. Met in two
independent pairs:

| Simulator (iOS 26.5, Safari, WDA finger strokes, one session per arm) | frames | layouts | inside script |
|---|---|---|---|
| pair 1: HSC (C) | 907 | 656 | 399 |
| pair 1: HS | 939 | 621 | 302 |
| pair 2: HSC (C) | 877 | 610 | 349 |
| pair 2: HS | 918 | 573 | 297 |

Per frame: HS 0.66 / 0.62 vs HSC 0.72 / 0.70 layouts; inside script HS 0.32 / 0.32 vs 0.44 / 0.40. The stacks show
where it comes from: in HSC the top script stacks are `getBoundingClientRect` < `F` 13864 (118) and `elementsFromPoint` <
`F` 13867 (76) under `_` < `L` < `iE`; in HS (pair 1) `elementsFromPoint` < `F` is 36 and the `getBoundingClientRect` < `F` stack
is no longer among the top four (the test still runs at m <= 0.2). No A/A pair
was run; the gap (~5-6 %) is small, but the same sign twice and the stack change agree.

Chrome (430x775, `gates/cm-chrome.mjs` of compositor-morph, medians per frame, 40-step open/close): identical work
(open style 2 / layout 1 / paint 7 / raster 15, forced 61-62 / 10; layers 68 at m 0.5 and m 1 in both). Expected:
Chrome's hit test does not force a layout here; the cost is WebKit's.

**Pixels (T0, PR-010 multi-pair A, V, A2, V2; A = C, V = HS):**
- Chrome (430x932, `captureScreenshot` 3x; stops pre, 0.1, 0.25, 0.5, 0.8, 1, down 0.5, 0.15, 0): every stop at most
  0.0057 % consistent A~V over 8, max level 19 (< fill 64, edge 128); m 1 is the largest, inside its own A/A spread
  (A~V 0.0119 %, A2~V2 0.0057 %).
- Simulator (iOS 26.5, simctl shots 1290x2796; stops pre, 0.25, 0.5, 1, down 0; `out/cm/pxSimHS`): consistent A~V
  0 px over 8 at every morph stop (A/A floor 0.0124 %, V/V 0.064 %); at pre 0 consistent (the A/A pair itself differs
  0.49 % there: countdown/orbit phase).

**Measurement code:** none changed. **Phone:** a short no-worse check comes with v10 (less-work landing rule).
