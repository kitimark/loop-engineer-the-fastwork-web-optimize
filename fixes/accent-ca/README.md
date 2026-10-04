# Fix: accent-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft, parked mid-measurement (usage pause, lead 2026-10-04 10:52Z)
**Stage:** I (mechanism counts in Chrome done; Simulator counts, layer census and pixels still owed)
**Device class / gate:** "less work" mechanism (counts, no timing: memory/defer-timing-focus-call-tree.md); phone
only via a ticket read by mgmt-ops-10
**Driver(s) behind the claims:** Chrome counts and frozen-frame pixels (fixes/accent-ca/chrome-counts.mjs)
**Topic:** user T-096 #4: "use our lesson learnt (the countdown roll on the graphics side, PR-017) to make it
smoother": the hero accent word (draw + boil) on the compositor.
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only (the accent rules `.svelte-1fn2go6`). The JS is
v6's, unchanged.

## Base

v6 = best-build + hero B-R2 (fix-hero-exit-threaded; snapshot `best-BR2-8018ce062d30`: JS `8018ce062d30`, CSS
`71b65c667720`). `patch.diff` is baseline-relative (`fix.mjs diff accent-ca`), so it carries v6 as well. Delta
against v6: the CSS hunks in the accent block only (`out/accent-ca/delta-E1.diff`, reproduce it with
`diff -u` of the two CSS files). Restack on v7: re-apply the CSS delta; it touches no rule that B-R2 or morph-on-scroll
change (fix-hero-exit-threaded: B-R2 touches no accent rule).

## Why it lags

- Boil (idle, 1.25 s of each 3.05 s cycle): three SVG frames swap by `0.6s step-end infinite` opacity animations.
  WebKit iOS 26 never hands `steps()` timing to Core Animation (F-048/F-065, source line cited in F-215 by
  fix-cd-roll-ca: KeyframeEffect canBeAccelerated, l.2015-2021), so each step is main-thread style plus an
  opacity-flip Layout (F-075).
- Draw (draw-out 0.9 s, then draw-in 0.9 s): `stroke-dashoffset` animations on the path of EVERY boil frame: three
  paths animate, but frames 1-2 are `opacity: 0` while drawing (rule at CSS ~1308-1316), so 2 of 3 run for nothing.
  A stroke-dashoffset change is an SVG Layout + repaint every frame on WebKit (F-097) and is never composited in
  Chrome (`compositeFailed` 8224 = kUnsupportedCSSProperty | kTargetHasInvalidCompositingState, CONFIRMED in
  chromium `third_party/blink/renderer/core/animation/compositor_animations.h`, FailureReason 1<<13 and 1<<5).

## What changed (arm E1 = this patch)

1. The boil keyframes become `0.6s linear infinite fw-acc-idle-0|1|2`: the same opacity values with a 0.6 µs
   linear ramp that ENDS on the original step-end instants (33.33 %, 66.66 %, cycle end). Keyword `linear` with 4
   keyframes per frame: acceleratable on WebKit (only `linear()` with points and `steps()` are refused, F-215), few
   keyframes (F-215: keyframe count is a start cost).
2. While drawing, the stroke/fill animations of the two hidden boil frames are dropped (`animation: none` on
   `.is-idle-frame:not(.is-idle-frame-0) :is(.accent-path, .accent-fill)` under `.is-drawing-in/out`). They are
   `opacity: 0` then, so this is exact.
3. Reduced motion: the existing `@media (prefers-reduced-motion: reduce)` block sets `animation: none !important` on
   the same elements and the JS returns early: unchanged by construction (pixel check still owed, see below).

Other arms (not in patch.diff; overlays `fixes/accent-ca--wc`, `fixes/accent-ca--wipe`, snapshot copies in
`out/accent-ca/snap/`): WC = E1 + `will-change: opacity` on `.accent-svg` (pre-promote once, F-213); WP = E1 + the
10-02 wipe (a clip slide instead of the stroke draw: a VISIBLE change the user turned down in PR-001 rev 1; only as a
proposal option, never recommended).

## Numbers so far (Chrome 154, 430x932 DPR 3, mobile + touch, y 0, CPU 1x, no timing)

Counts: one 9.15 s window (3 accent cycles) starting at a draw-out; C run twice (A/A).

| arm | Paint | style elements | UpdateLayoutTree | main frames | accent anims not composited |
|---|---|---|---|---|---|
| C (v6) | 1316 | 3861 | 450 | 450 | 18 of 27 |
| C again | 1317 | 3895 | 452 | 452 | 18 of 27 |
| E1 | **688** | **3337** | 452 | 452 | **6 of 15** |

- E1 halves Chrome's paints in the hero window (-48 %, A/A 0.1 %) and cuts 14 % of the restyled elements.
- Main frames do not drop: frame 0's own stroke draw still runs on the main thread each frame while drawing (that
  part has no exact compositor form).
- In Chrome the boil animations report no composite decision in either arm; E1 adds a painted `svg.accent-svg` layer
  (54 paints per window). The WebKit side (the reason for the change) is not measured yet.

Pixels (frozen frames, `acc-lib.mjs` timer hold): words "you" (idle, draw-out) and "คุณ" (draw-in, idle, draw-out);
idle t = 100, 199.9, 200.1, 300, 399.9, 400.1, 500, 599.9 ms (both sides of every boil switch), draw t = 0-899 ms in
150 ms steps; each shot paused (main-thread value) and running at playbackRate 1e-6 (compositor-sampled): 74 frames.

| pair | frames differing | largest shade | share beyond A/A | area | edge/fill | static/moving |
|---|---|---|---|---|---|---|
| C vs C again (A/A) | 0 of 74 | 0 | 0 % | 0 | - | - |
| C vs E1 | 0 of 74 | 0 | 0 % | 0 | - | - |

T0 (exact) in Chrome at phone width. Raw: `out/accent-ca/chrome-p430-2026-10-04T10-32-20-391Z.json`.

## Still owed (when the pause ends)

1. Simulator (WebKit) counts + LayerTree census, C/C/E1/WC: `sim-counts.mjs C,E1,WC counts,census` (the first try
   crashed on a script bug, fixed; the second was queued and left at the pause). This decides the claim (main-thread
   recalcs/layouts per second in idle) and E1 vs WC (layerTreeDidChange per cycle, F-213).
2. Simulator pixels C/C/E1 (`pixels` mode) and reduced motion (`sim.mjs session --reduce-motion on`, `rm` mode);
   Chrome desktop 1440 and reduced motion (`--desktop 1`, `--rm 1`); WC/WP Chrome counts.
3. Motion-only difference: frozen frames are exact, but on the phone the boil switches would be drawn by Core
   Animation on its own clock (80-120 Hz request while it runs, F-212) instead of at the page's main-thread update.
   Under the stricter reading that is a timing difference, so the plan is ONE proposal (options: exact boil E1/WC,
   wipe WP with the PR-001 history up front, keep) with Try-it pages (A = v6: `fixes/accent-ca--v6/patch.diff`).
4. Cost to state: an infinite CA animation during idle keeps Core Animation's high-rate request alive for ~1.25 s of
   every 3.05 s (F-212, fix-cd-roll-ca).

## Tools

`acc-lib.mjs` (serve + hash check, HE timer hold shim, shot plan, PNG/crop, tolerance report), `chrome-counts.mjs`,
`sim-counts.mjs` (PNG reader, crop calibration, LayerTree read adapted from fix-cd-roll-ca / fix-cd-strip, credited).
