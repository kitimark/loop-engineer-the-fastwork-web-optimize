# Fix: platform-visual-anim-storm (N13)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** not reproducible on aw1-10c (0/24 fresh loads, 06:45Z); cause unknown, no patch. The first hypothesis (F-026: the agents-ask visual's
state change starts many keyframe animations) is **ruled out** by a forced-toggle probe (F-027).
**Topic:** N13, from F-026 (lead decision 06:10Z), owner fix-scroll-engine. Stacking base: `aw1-10c`
(all-wave1 + scroll-engine /10c, overlay JS 757e2cbc…, CSS c6aad94b…).
**Files touched:** none yet.

## The symptom

A rare long frame of ~240-360 ms near y≈4.7 k (the #platform region) during the scroll phase, on a fresh
load, mobile 6x. The LoAF has 6-7 ms of script and no style/layout phase (`styleAndLayoutStart` absent).

| where | n | storms | notes |
|---|---|---|---|
| `/10` mech runs (wave1-partial + /10), 02:33-03:16Z | 5 | 1 (339 ms, t=16.4 s) | only script: future `l` rAF, 6 ms |
| E3 probe (instrumented all-wave1), 06:03Z | 1 | 1 (362 ms, y=4727) | only script: a user-callback, 7 ms; ablation side (`animation:none`) 0 |
| `ab se10c-aw1 --on all-wave1` base side, 05:39Z | 5 | 1 (run 0: max 241.5 ms, 3 frames > 100 ms) | /10c side 0/5 |
| `ab abl-aw1i --on se-aw1i` (part 4), 06:06Z | 6 | 0 | both sides |
| forced-toggle probe `storm.mjs`, 06:17Z | 2 | 0 | see below |

About 3 storms in ~19 fresh scroll passes (≈ 15 %), so a 5-run A/B catches it about once and cannot show it gone.

## What was ruled out (mechanism/attribution, load 1.9-2.1, timing not claimed)

Forced-toggle probe (`scratchpad/scroll-engine/storm.mjs`, aw1-10c, mobile 6x, 2 passes). Each pass parks with
the agents visual centred for 24 s (the typing loop cycles enter → caret → type → results → leaving → delete)
and re-triggers `is-enter` 5× (2 vh away, 1.2 s, back). That gives 41 class changes on the visual and caret
per pass.
- **0 LoAF > 50 ms** in either pass.
- Animations at each toggle (`document.getAnimations()` total/running): before enter 38-40/15-16; `is-enter`
  45-51/30-37; caret on 49-56/21-32; results 50-53/12-15. The visual itself starts only ~5-11 animations
  (CSS 9172-9186: title, field and 2-4 service cards, `start-selling-agents-ask-in/out` 0.56 s, plus the caret's
  1 s step-end blink). The jump in running count at enter is the platform scene un-pausing existing infinite
  animations.
- JS heap (`performance.memory`, coarse): 1 drop > 2 MB per pass, with no long frame near it.

So F-026's link to `is-caret` was coincidence: the typing loop (JS 11870-11893) changes state every 32 ms,
so any frame near the visual overlaps a state change.

## Open hypotheses

The storm needs scrolling and/or the first entry into the platform region of a fresh load:
1. first raster or image decode of the platform layers (large `will-change`/blur layers, avif thumbnails arriving over the 150 ms latency);
2. the section-wide `filter: blur(...)` on `#platform` (topic 8, large-area-blur);
3. the scroll-jack region (`#platform` within 200 %: non-passive wheel/touchmove listeners, topic 6);
4. a major GC under scroll (CPU 6x makes a ~50 ms GC ~300 ms; no script or style time fits).

## Storm-catch hold (06:45-06:54Z, mechanism/attribution, timing not claimed, load1 3.6-8.1, high)

`storm-trace.mjs` ran 24 fresh loads of **aw1-10c**, alternating traced (12) and untraced (12). Each load was
verify-like: settle at 1x, CPU 6x, 6 s idle, then a smooth scroll to the bottom.
- **Storms (LoAF > 150 ms in scroll): 0/12 traced, 0/12 untraced.** No trace was kept (none needed).
- Every load has exactly one scroll LoAF > 50 ms, at y≈4753 (twice 5003, once 5250): 56-91 ms with 46-78 ms
  of script. That is the gtag `onscrollend` vendor frame (N11), the same one as in the /10c A/B.

Storm count by stacking base, all data so far:

| base | storms / fresh scroll passes |
|---|---|
| with /10c (aw1-10c, se10c-aw1) | **0/29** (this hold 0/24, /10c A/B patched side 0/5) |
| without /10c (all-wave1, instrumented all-wave1) | 2/12 (A/B base 1/5, E3 1/1, part 4 0/6) |
| wave1-partial + /10 (2x layers, no 10b/10c) | 1/5 |

0/29 vs 2/12 is suggestive (Fisher's exact p ≈ 0.08), not proof. Either /10c removed the storm (it changes when
the platform sections first render and cuts the layer count), or the storm is rarer than the ~15 % first estimated.

**Status: not reproducible on the current stacking base (aw1-10c).** No fix candidate, nothing to A/B.
To make the causal statement, run the same 24-load design on all-wave1 without /10c in one more ≤ 10 min
diagnostic hold. A rate near 2/12 there would mean /10c removed the storm; ~0 would mean it is just rare.

## Original plan (done above)

Run ~15-20 fresh loads of aw1-10c, each with a verify-style smooth scroll through y 3.5-5.5 k, and record a
CDP trace per load (`devtools.timeline`, `disabled-by-default-devtools.timeline.frame`, `v8`,
`disabled-by-default-v8.gc`, `cc`). Keep a trace only when a LoAF > 150 ms occurs. At ~15 % that should catch
2-3 storms with the main-thread and compositor breakdown that names the cause. The fix candidate and its A/B
`--on aw1-10c` depend on that answer. A plain 5-run A/B is not enough: any A/B must use the same
fresh-load-many-times design.
