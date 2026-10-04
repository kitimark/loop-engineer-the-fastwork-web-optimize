# Fix: accent-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** PR-019 accepted (option exact, 13:09Z); land build `fixes/accent-ca-v7/patch.diff` on v7, ready to land
**Stage:** I done (Chrome + Simulator counts, layer census, pixels at phone + desktop width, reduced motion); the
phone is not used (no ticket yet)
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
  opacity-flip Layout (F-075). The Simulator census (below) shows WebKit still gives the three boil SVGs their own
  backed layers while idle (reason "animation, stacking") and drops them at every draw (OBSERVED, F-220), and the
  boil is a small part of the accent's cost: the draw dominates.
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
   the same elements and the JS returns early: unchanged by construction, and checked: exact in Chrome and the Simulator (below).

Other arms (not in patch.diff; overlays `fixes/accent-ca--wc`, `fixes/accent-ca--wipe`, snapshot copies in
`out/accent-ca/snap/`): WC = E1 + `will-change: opacity` on `.accent-svg` (pre-promote once, F-213); WP = E1 + the
10-02 wipe (a clip slide instead of the stroke draw: a VISIBLE change the user turned down in PR-001 rev 1; only as a
proposal option, never recommended).

## Chrome (Chrome 154, 430x932 DPR 3, mobile + touch, y 0, CPU 1x, no timing)

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

More Chrome pixel checks (2026-10-04 12:42-12:44Z): reduced motion at phone width, C/C-again/E1: 3 shots 700 ms
apart each, 0 differ, computed styles of the accent subtree identical (`chrome-p430-rm-2026-10-04T12-42-46-346Z.json`);
desktop 1440x900 DPR 2, the same 74-frame plan: C vs C-again 0, C vs E1 0 of 74 (`chrome-d1440-2026-10-04T12-43-41-042Z.json`).

## Simulator (WebKit; iPhone 15 Pro Max simulator, `sim.mjs session --functional`, no timing)

Counts: one 9.15 s Timeline window from a draw-out (3 cycles), y 0, whole page running. Two sessions (12:30Z: C, C
again, E1, WC; 12:47Z: C, C again, WP), so compare within a session.

| arm | page updates (RenderingFrame) | style recalcs | layouts | paints | accent-word paints | frames with a recalc |
|---|---|---|---|---|---|---|
| C (v6) | 493 | 516 | 359 | 473 | 441 | 481 |
| C again | 483 | 505 | 357 | 473 | 441 | 470 |
| E1 (this patch) | 456 | 484 | 348 | 455 | 423 | 450 |
| WC (E1 + will-change) | 460 | 490 | 348 | 411 | 377 | 456 |
| C (2nd session) | 499 | 520 | 364 | 479 | 447 | 486 |
| C again | 486 | 511 | 356 | 471 | 439 | 475 |
| WP (E1 + wipe) | **263** | **281** | **32** | **128** | **58** | 245 |

- E1 saves ~5-7 % of WebKit's recalc frames and accent paints (A/A spread 2 %). The draw (stroke-dashoffset, 1.8 s of
  every 3.05 s) is SVG layout + paint every frame and has no exact compositor form; it is the accent's real cost.
- WP (the clip wipe) removes nearly all of it: layouts 360 -> 32, accent paints 443 -> 58, page updates -47 %. A
  visible change (see the proposal).
- WC: ~10 % fewer accent paints than E1, at a permanent ~0.39 MB of layer backing. Not worth it; not an option.
- Phase split (idle vs draw per second): not available. The page's `console.timeStamp` marks arrive (9 per window)
  but their `startTime` does not line up with the frame records in our script (all frames fall in one phase); the
  totals above don't depend on it. `LayerTree.layerTreeDidChange` never arrived (0 for every arm).

Layer census (LayerTree snapshot at mid-draw-out, mid-draw-in, mid-boil, y 100, y 300; `sim-counts-census-...json`):
C mid-boil: the 3 boil SVGs backed ("animation, stacking", 0.35-0.39 MB) + `.frame` ("transform with composited
descendants"); mid-draw-out: no accent layers (the layers are made and dropped every cycle); mid-draw-in: only the 2
row-sibling layers of the hero's word slide (HEflip). E1: the same. WC: the 3 SVG layers in every phase ("stacking,
will-change"), still repainted during the draw. (F-220)

Pixels: the plan's frozen frames ("you" draw-out, "คุณ" draw-in, idle, draw-out), paused and running, 58 frames;
crop calibrated by a magenta marker (`sim-pixels-2026-10-04T12-36-58-991Z.json`, shots in `out/accent-ca/sim-shots/`).

| pair | frames differing | largest shade | share beyond A/A | area | edge/fill | static/moving |
|---|---|---|---|---|---|---|
| C vs C again (A/A) | 27 of 58 | 211 | 0.90 % | 3615 CSS px2 | edge | moving (see below) |
| C vs E1 | 8 of 58 | 2 | 0 % | 0 | - | - |

- E1 equals one of the two C loads exactly in 57 of 58 frames; in the one other frame ("คุณ" draw-in 300 ms, running)
  it is 2 of 255 shades off both, no pixel over 8. Exact for the tolerance rule (T0/T1).
- The A/A break: from the idle 399.9 ms "running" shot on, the second C load kept a different boil frame on screen
  for the rest of the cycle, through the draw-out, after the idle class and its animation were gone. Same build, so
  a probe artefact of seeking/slowing a composited step-end animation, or a WebKit stale-layer glitch; OBSERVED,
  cause unknown (F-221). E1 matched the first C load in those frames.

Reduced motion (`sim.mjs session --reduce-motion on`, `rm` mode, `sim-rm-2026-10-04T12-46-18-939Z.json`): C, C
again, E1: 3 shots each, 0 differ; computed styles the same.

## Tiers

| arm | Chrome phone | Chrome desktop | Simulator | reduced motion | tier |
|---|---|---|---|---|---|
| E1 | 0 / 74 | 0 / 74 | max 2 shades, 0 beyond A/A | exact (both) | T0/T1 on frozen frames; motion: the boil may switch on Core Animation's clock (not visible in frozen frames), so it goes to the user |
| WP | see the proposal | | | | visible change while drawing (T3) |

## Proposal

PR-019 (posted 2026-10-04 ~12:55Z): ONE proposal with three options and Try-it pages (A = v6, `fixes/accent-ca--v6/patch.diff`):
- `exact` = E1 (`fixes/accent-ca/patch.diff`), recommended: exact frames, small saving;
- `slide` = WP (`fixes/accent-ca--wipe/patch.diff`): the big saving, but the wipe look the user turned down in PR-001
  rev 1, stated up front;
- `keep`: no change; PR-001 rev 2 (image frames, phone check approved) stays the route to keep the drawn look.

Cost to state: an infinite CA animation during idle keeps Core Animation's high-rate request alive for ~1.25 s of
every 3.05 s (F-212, fix-cd-roll-ca); not measured here. Phone: not used; a ticket would follow a decision.

## On v7: land build (PR-019 accepted, option `exact`, 2026-10-04 13:09Z)

Build: `fixes/accent-ca-v7/patch.diff` = v7-best (8c90da217745 / 308f0da70c3a) + `e1-delta.diff` (this topic's CSS
delta, v6 -> E1) = JS 8c90da217745, CSS 7eda63cc7015. Arms: C7 = v7, E7 = the land build (hashed snapshot copies in
`out/accent-ca/snap/`, C7 re-made by reversing the delta and equal to v7's bytes).

### Pixels (against v7)

| check | frames | differing | largest shade | share beyond A/A | area | tier |
|---|---|---|---|---|---|---|
| Chrome 430x932 DPR 3: C7 vs C7 again (A/A) | 74 | 0 | 0 | 0 | 0 | |
| Chrome: C7 vs E7 | 74 | 0 | 0 | 0 | 0 | T0 |
| Simulator: C7 vs C7 again (A/A) | 58 | 6 | 2 | 0 | 0 | |
| Simulator: C7 vs E7 | 58 | 0 | 0 | 0 | 0 | T0 |

Raw: `chrome-p430-2026-10-04T13-27-34-861Z.json`, `sim-pixels-2026-10-04T13-36-46-889Z.json` (the A/A held this
time: the second load's 2-shade boil-edge differences are the noise E7 sits inside). Desktop and reduced motion were
checked on v6 (exact, above); the delta touches the same rules on v7 and the reduced-motion block is unchanged.

### Cost card ("less work" rule; counts per accent cycle = one 3.05 s rest + draw-out + draw-in; one 9.15 s window
from a draw-out = 3 cycles, divided by 3; full page running, y 0; no ms judged)

Hand-built from `chrome-counts.mjs` / `sim-counts.mjs` totals (these probes keep no raw trace, so `tools/costcard.mjs`
could not read them).

| per accent cycle | Chrome C7 (2 loads) | Chrome E7 | Simulator C7 (2 loads) | Simulator E7 |
|---|---|---|---|---|
| 1 thread: main frames (Chrome BeginMainThreadFrame / Sim RenderingFrame) | 122-123 | 125 | 139-140 | **117** |
| 1 thread: style recalcs | 122-123 | 125 | 139 | **120** |
| 1 thread: elements restyled (Chrome) | 1074-1093 | **917** | - | - |
| 2 layers + memory (Sim census, mid-boil / mid-draw) | - | - | 3 svg layers 0.39 MB / 0 | the same |
| 3 repaint: paints, whole page | 439 | **227** | 155-159 | **143** |
| 3 repaint: accent-word paints (Sim) | - | - | 145-146 | **133** |
| 4 layout: layouts | 4 | 4 | 117-119 | **109** |
| 5 script: timer fires | 15-16 | 16 | - | - |

- Simulator (WebKit, the target): -16 % rendering frames, -13 % style recalcs, -8 % layouts, -9 % accent paints per
  cycle; A/A spread at most 2 % on every row (paints 466 vs 476 per window). The saving is larger than on v6 (-5-7 %), likely because v7's page does less
  around the accent (cd-strip, cd-roll-ca, rest-script), so the boil's share is larger.
- Chrome: paints halve (-48 %), restyled elements -15 %. Main frames +2-3 per cycle (A/A spread 1): in the rest phase
  Chrome ticks 13.3 frames/s instead of 11.2-12.0 (accent animations report no composite decision in either build).
  Small, Chrome only; the Simulator shows the opposite (fewer frames).
- Layers: the same in both (the boil layers are made at rest and dropped at the draw in v7 and in E7, F-220); no
  memory added.
- Accent animations not composited in Chrome: 18 stroke animations per window in C7 -> 6 in E7 (the hidden copies no
  longer animate); compositeFailed 8224 on the visible copy's stroke in both.

Raw: `out/accent-ca/sim-counts-census-2026-10-04T13-41-12-831Z.json`, `chrome-p430-2026-10-04T13-27-34-861Z.json`.
Phone: the short no-worse check is ticketed in v8's phone block by the lead.

## Tools

`acc-lib.mjs` (serve + hash check, HE timer hold shim, shot plan, PNG/crop, tolerance report), `chrome-counts.mjs`,
`sim-counts.mjs` (PNG reader, crop calibration, LayerTree read adapted from fix-cd-roll-ca / fix-cd-strip, credited).
