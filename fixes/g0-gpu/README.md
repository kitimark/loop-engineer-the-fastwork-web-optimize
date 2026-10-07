# Fix: g0-gpu (g0.1a: the original end-of-page menu card on Web Animations)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured. Gates 1-4 pass on v0. The port onto g0.0 (f75c1707) is in `fixes/g0-gpu-g00/` (see "Port"). No timing A/B and no phone, by design.
**Stage:** F (build) for step 1 (g0.1) of `research/gpu-original/README.md` §4 (signed design b7117d64)
**Device class / gate:** less work per tween frame. Gates: seek pixels and state (Chrome + Simulator), counts (Chrome trace + Simulator Timeline), rest probe, reduced motion
**Driver(s) behind the claims:** Chrome seek harness (virtual clock, wheel gesture); Simulator seek harness; Chrome trace counts; Simulator Timeline and LayerTree census. All real-time counts are descriptive.
**Prediction:** design §3.1 M1/M2 ("no script writes per tween frame for the card and #platform; T0, or T1 if the GPU blur rounds")
**Topic:** user T-228 #60/#62: the original end-of-page behaviour, rendered on the GPU
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only. Nav component tween, pretty lines 13019-13132 of v0 (`T`, `E`, the effect cleanup). No CSS.

## What g0.1a does (v0 behaviour, same frames, less work)

v0's tween: a swipe at the end sets a target of 0 or 1 (`XM`, JS 12691). `E` (13024-13036) starts a 680 ms rAF tween
`ZM` from the current value: `value = from + (to - from)·(1 - (1 - t)³)`. Every frame, `T` writes the Svelte state
`x` (whole nav template effect: classes, aria, tabindex, inline `--morph` on the nav root) and `S()` writes
#platform's `--morph-fade`. The menu card (`.start-selling-morph-panel`, CSS 10543-10549) derives its opacity, blur
and zoom from the inherited `--morph`, so every frame restyles the card and its whole subtree.

g0.1a keeps `T`'s rAF and its exact values (the same `ZM` on the same timestamps), and changes three things:

- **Card on Web Animations.** At the tween's start, one `element.animate()` on the card animates `opacity`, `filter`
  and `transform`. It uses one keyframe per kink of the card's piecewise-linear mapping (m 0.08 and 0.80; kink time
  `u = 1 - ∛(1 - (m* - from)/(to - from))`). Each segment gets its exact `cubic-bezier(1/3, y1, 2/3, y2)` of
  `1 - (1 - t)³`, with `y1 = (1-ua)²·d/D` and `y2 = 1 - (1-ub)²·d/D`, where `D = (1-ua)³ - (1-ub)³` and `d = ub - ua`
  (research/gpu-original §3.1; F-332). Timing: `startTime = o`, the tween's `performance.now()` start, with
  `duration 680` and `fill both`. The animation's local time is then the rAF timestamp minus `o`, as in `T`. In
  WebKit the timeline time is the rendering update's timestamp (`AnimationTimelinesController.cpp` 125-129,
  CONFIRMED). The card's `--morph` is pinned inline for the tween's duration, so the nav's per-frame `--morph` no
  longer restyles the card subtree.
- **Svelte state by bucket.** `x` is written only when a template threshold flips (0.001, 0.2, 0.35, 0.4, 0.55,
  0.92), so classes, aria and tabindex flip in the same frames as in v0. The nav root's `--morph` is written directly
  every frame, so the box, logo, actions gap and Join keep v0's per-frame CSS and their transition restarts
  (design §3.1 M4).
- **Rest and reversal.** At the tween's end the animations are cancelled, the pin is removed and v0's final values
  are written: nothing animates at rest. A reversal mid-tween is v0's (`i = r` from the last frame, `o = now`), so it
  starts a new set of animations from that value. With reduced motion, v0's jump stays (`z(x, t)`, `S()`), with no
  animation.

**#platform stays on v0's per-frame `S()`** (the lead's ruling, 2026-10-07). With its blur-fade on a Web Animation
too (g0.1b), WebKit rebuilds #platform's composited layer (430x1880, 13.25 MB) on every tween. See "g0.1b" below
and F-337.

## Gate 1: seek parity with v0 (frames 0-700 ms, 20 ms steps)

Harness `fixes/g0-gpu/gates/seek.mjs`:
- **Virtual clock.** `performance.now` and rAF are overridden and run at 10 ms virtual frames. CSS transitions are
  paused and set to their virtual age each frame. The card's g0 animation is paused at capture and set to
  `vt - o`.
- **Frozen background.** Other animations are frozen at 4 s. `Date.now` is frozen at a fixed future instant, after
  one uncaptured warm-up open (F-338).
- **Scenarios** (one load each, triggered by a synthetic wheel on window): open, close, reversal at 1/3 (rev1) and at
  2/3 (rev2).
- **Per stop:** the state (inline and computed `--morph`, nav classes, box, the card's computed
  opacity/filter/transform, aria-hidden, tabindex, #platform opacity/filter/pointer-events) and a screenshot.
- **Scoring:** PR-010 four loads A, V, A2, V2 (`fixes/v9-best/gates/pxlib.mjs`). A pixel is "consistent" when it
  differs beyond the A/A pair in all four cross pairs. Limits are PR-010's wide numbers: fill 64 levels, edge 128,
  0.5 %.

| engine / viewport | stops | state mismatches | worst A~V level | stops with consistent px | consistent px (where) |
|---|---|---|---|---|---|
| Chrome 430x775 DPR 3 | 148 | 0 | 59 | 12 | ≤ 176 css px² (0.05 %): the card's right edge, one device-px column (max 24 levels); text anti-aliasing 13-22 levels |
| Chrome 430x815 | 148 | 0 | 59 | 8 | ≤ 202 css px² (0.06 %): the same right-edge column (max 23 levels); one isolated device pixel at 59 levels (open@440) |
| Chrome 430x775, reduced motion (open, close, rev1) | 111 | 0 | 51 | 6 | ≤ 22 css px²: low-level anti-aliasing in #platform's card (max 21 in the consistent pixels) |
| Simulator (iPhone 15 Pro Max, iOS) | 148 | 0 | 255 (status-bar clock) | 0 below the status bar | only the status-bar clock digit (css 96-112 x 16-48), which differs between loads |

**Verdict:** T0 in the Simulator. In Chrome, T2 within PR-010's limits: only 1-device-px edge lines and anti-aliasing,
both below the fill limit. The card's blur runs on the main thread in Chrome either way: blur is a pixel-moving filter,
and Chrome keeps such animations off the compositor (`compositor_animations.cc`, CONFIRMED in design §3).

## Gate 2: work per tween frame (counts; first frame, K8)

Chrome: headless, 430x775 DPR 3, no throttle, trace counts per segment, 900 ms per tween, two loads per arm
(`gates/counts-chrome.mjs`). Ranges are min-max over the loads.

| Chrome per tween | v0 | g0.1a (card only) | g0.1b (card + #platform) |
|---|---|---|---|
| elements restyled, open | 5877-6137 | 4098-4108 (−30 %) | 2397-2437 |
| elements restyled, close | 11223-11233 | 9109-9439 (−17 %) | 2560 |
| Paint calls, open | 562-563 | 522 | 537-541 |
| Paint calls, close | 485-502 | 449-465 | 464 |
| Layouts, open / close | 45 / 54 | 45 / 54 | 45 / 54 |
| first frame of open: elements restyled | 399 | 399 | 196 |
| first frame of close: prepaint / paint calls | 1 / 6-7 | 1 / 8 | 27 / 32 (re-raster of #platform, 640x512 tiles) |

Simulator Timeline (`gates/counts-sim.mjs`, real time, one load per arm). Per-frame counts are descriptive; Simulator
ms are a rank, never a judgement (F-084). The LayerTree census runs at rest (L0), mid-open, open, mid-close and closed.

- **Per frame:** the second and third frames of each tween paint about 96-101 rects in every arm (v0, g0.1a, g0.1b).
  These are the card's content: about 80 countdown faces (18x37) and the 131-138 x 493-511 card columns. They are
  repainted because the nav box changes size every frame (layout), not by the fade, so the card's Web Animation does
  not remove them.
- **First frame (K8):** the trigger frame does 1 style, 1 layout and 4-5 paints in every arm. No work moved into the
  first frame.
- **Layers made per tween:**

| layers made per tween | v0 | g0.1a | g0.1b | g0.1b + `will-change` on #platform |
|---|---|---|---|---|
| new layer ids, closed vs L0 | 0 | 1 (the card's own layer, 384x50, 0 MB, kept) | 2 (+ #platform 430x1880, 13.25 MB, a new id per tween) | 1 |
| memory at open rest | 108.9 MB | 108.9 MB | 107.3-108.9 MB | 122.2 MB |
| layers at closed rest | 30 / 89.1 MB | 30 / 89.1 MB | 30 / 89.1 MB | 30 / 89.1 MB |

- **The card's layer.** The card gets one composited layer while it animates. It keeps a 0-byte container layer at
  rest: no backing store, and the closed-rest totals are unchanged.

## Gate 3: rest

- **No animation at rest:** `document.getAnimations()` holds no g0 animation after either tween, in Chrome and in the
  Simulator census (`g0: 0`).
- **Chrome rest segments:** restyled elements and paints are within the v0 loads' range (v0 rest restyled elements 1248-1598 per 1.5 s, g0.1a 1248-1642; paints equal).
- **Same animations at rest as v0:** the four #platform idle animations at m 0, and the three menu column tracks at
  m 1 (rest census in `counts-chrome-*.log`, F-328).

## Gate 4: reduced motion

v0's branch is unchanged: `E` jumps (`z(x, t)`, `S()`) and starts no animation. Seek with
`prefers-reduced-motion: reduce`: see the table above.

## g0.1b: #platform's blur-fade on a Web Animation too (not taken)

- **What it saves:** in Chrome, most of the restyle saving (see the gate 2 table).
- **What it costs (OBSERVED, Simulator census):** WebKit gives `section.start-selling-platform` (430x1880, 13.25 MB)
  a new layer id on every tween, at the start of the close. Chrome re-rasters it at the first close frame (prepaint
  27, 640x512 tiles).
- **Cause:** unknown. Likely the compositing reason switching between `filterWithCompositedDescendants` (at rest)
  and the animation's reason.
- **Why that matters:** per-tween layer builds are what failed every end-morph design's first-open gate on the phone
  (F-326, F-324).
- **The `will-change` try** (30 min): `will-change: opacity, filter` on #platform (`fixes/g0-gpu--wc/`) stops the
  rebuild. But the 13.25 MB backing then stays allocated while the menu is open: 122 MB vs 109 MB at open rest, while
  v0 frees it at opacity 0 (OBSERVED). `will-change` also makes #platform a backdrop root in WebKit (F-331). Both
  are a resting cost, so g0.1a stays the default (the lead's ruling).
- **Overlays** (not committed): `fixes/g0-gpu--full/`, `fixes/g0-gpu--wc/`.

## Port onto g0.0 (f75c1707)

The same g0.1a change is ported onto g0.0. Its deliverables are in `fixes/g0-gpu-g00/` (README, `patch.diff`
relative to g0.0's JS 5c39f7a96e41, results).
- **What differs from the v0 version:**
  - The bucket key includes m 0.08 (g0.0's `__cdPanelShown`).
  - The per-frame `--morph` goes to `__mkW`'s targets (nav root, bar, logo, actions, Join, language wrap) except the
    card.
  - #platform stays on g0.0's `S()`, with R4a and the 0.9999 clamp.

## Measurement notes

- **Gate scripts:** `fixes/g0-gpu/gates/` (seek, counts-chrome, counts-sim, diffpng). They are scripts in this fix
  directory, not `tools/`. No measurement code under `tools/` changed.
- **Shared lane:** all runs used `--shared --weight probe|simulator --max-seconds 300`, one hold per arm.
- **Harness changes during the work:**
  - The frozen date moved from a past instant to a fixed future instant, plus a warm-up open (F-338). v0 runs are
    unaffected by it, and the g0.1a gates were all measured with the new form.
  - The state check compares `--morph` numerically to 1e-9. Last-digit (1e-15) differences come from the absolute
    virtual time after the warm-up.
- **Noise sources:**
  - #platform's agents-ask cycler runs on real timers (F-336).
  - The Simulator's status-bar clock changes between loads.
  - Both show up as A/A noise and are excluded by the four-pair rule.

**Scenarios not run:** timing A/B, phone, finger (not asked); desktop widths (the end morph is the same code; g0.0
gated 768/1280).

## Risks, conflicts, follow-ups

- **Phone timing:** Chrome's card blur stays a main-thread effect (no script). WebKit's Core Animation path is
  CONFIRMED in design §3. The phone gain itself is unmeasured (no phone in this step).
- **Remaining per-frame paint:** the card's content repaints follow the box's per-frame layout (design M3). Only M3-B
  or M3-C would remove them.
- **Peers:** fix-g0-revert (g0.0) keeps `S()` and R4a/R4b unchanged; nothing in g0.0 needs to change for g0.1a.
