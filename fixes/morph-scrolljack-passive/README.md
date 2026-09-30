# Fix: morph-scrolljack-passive

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** probe-checked in Chrome (equivalence); in the E1 combined A/B (no regressions, morphReached 5/5); no solo A/B; finger test pending (user), see `fixes/FINGER_TESTS.md` row 1
**Topic:** `fixes/TOPICS.md` #6 `morph-scrolljack-passive` (cluster B with #3 `nav-hit-test`, same owner)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` (one `@property` rule, ~5388) and `/_app/immutable/nodes/2.DyWL8TcE.js`, component `dN` (fixed top nav), the scroll-jack block
of its `ne(() => …)` effect: state `d` (pretty 12990), `y` (13012), `E` (13024), `k`/`A`/`M` (13048-13059),
`N`/`P`/`I` (13060-13076), `L` (13077), the IntersectionObserver callback (13082-13087). The
`--morph` / `--morph-fade` / `--pill-out` rules (CSS 5392, 10500, 10545, 11342) and the spring `T` are untouched.

## Why it lags

The end-of-page "morph" (nav pill grows into the full-screen start-selling panel when you push past the
end) is driven by a scroll-jack:

- An IntersectionObserver on `.start-selling-platform` with `rootMargin: 200% 0px` (JS 13082-13087) sets
  `u = isIntersecting` and calls `I()`. `I()` (13074) arms `N()` whenever `u || C()` (in the zone, or the
  morph is active).
- `N()` (13060) adds **non-passive capture** `wheel` and `touchmove` listeners on `window` (plus a passive
  `touchstart`). The handlers `A`/`M` call `preventDefault()` only when `k()` says the jack engages: the morph
  is active (`C()`), or you move down while `O()` (platform bottom within the visual viewport and at least
  45 % of its height visible) holds.
- 200 % of the viewport above and below the platform is about 3 screens: on the phone that is the last
  third of the page (commission, future, platform sections), and it stays armed on the way back up.

A non-passive `touchmove`/`wheel` listener makes the whole page a blocking input handler region: for every
touch sequence that starts in it, the compositor must send `touchmove` to the main thread and wait for the
handler (or Chrome's timeout) before it may scroll. On this page the main thread is busy with 25-100 ms scroll
frames at 6x (`research/cpu-throttle-calibration/`), so in the armed zone each drag's scroll start waits for
the main thread even though `preventDefault()` is never called there. Evidence: TOPICS.md #6; research
`research/01-initial-investigation/motion-inventory.md` "Morph panel (end of page)"; the probe below (per-event
touch ack latency).

## What changed

Three listener modes instead of two (`d`: 0 off, 1 passive, 2 blocking):

- **Blocking (2)** only while the jack can actually engage: morph active (`C()`), or in the zone **and**
  `__atEnd` (the same `O()` test the handlers use). This is the only mode that calls `preventDefault()`
  (`d === 2 && e.cancelable`).
- **Passive (1)** in the rest of the 200 % zone: the same `A`/`M` handlers still run, so a drag that reaches
  the end still starts the morph (`D()` → `E()`), and `E()` now calls `I()` so the listeners switch to
  blocking the moment a morph starts.
- **Off (0)** outside the zone, as before.
- `__atEnd` is refreshed where the original evaluated the condition anyway: by `k()` (handlers), by the IO
  callback, and once per scroll frame in `L` while in the zone (`__end()`: one `getBoundingClientRect` of the
  platform, a read after `_()`'s reads; it re-arms only when the value flips).
- `y()` caches the `.start-selling-platform` element (re-queried if detached).
- CSS (variant 04, from the architecture review): `@property --morph-fade { syntax: "<number>"; inherits:
  false; initial-value: 1 }` before the `.start-selling-platform` rule (CSS ~5388). Only that element reads
  the property (its `filter` and `opacity`), so the per-frame write in `S` during the morph no longer
  restyles the section's descendants. The value and rendering are the same (the rule also sets 1 by default).

Visual behaviour: the same spring, the same `--morph` values, the same pinning (`scrollTo` in `L` while
`C()`), the same start/stop conditions. What can differ is the first touchmove of a drag that starts
**above** the end and scrolls into it: that gesture started with passive listeners, so it can't
`preventDefault()` until the next gesture. In the original it couldn't either in practice, because once a
touch scroll has started, Chrome (and Safari) send later `touchmove`s as `cancelable: false`; the jack then
relies on the `scrollTo` pin in `L`, which is unchanged. The probe below checks exactly that path.

## Why that is faster

Outside the last screen (and outside an active morph), no blocking touch/wheel handler exists, so the
compositor starts and continues touch scrolls without waiting for the main thread. The per-frame JS cost is
unchanged (+1 rect read per frame while in the zone), so Chrome's scripted-scroll A/B (which scrolls with
`scrollTo`/synthetic wheel, not touch) is not expected to move; the gain is input latency on touch.

## Before / after

`node tools/fix.mjs ab morph-scrolljack-passive --runs 5` (Chrome, mobile 430x932 DPR3, CPU 6x, ABBA, cold
cache, `--vendors=local --https --latency 150`):

No solo A/B. This patch is part of **E1**, the combined `nav-morph-all` (see `fixes/nav-morph-all/README.md`):
morphReached 5/5 on both sides, no new errors, screenshots 0.15 / 0 / 0.13 %, morph-phase fps 110 -> 112.2
(within noise). E1's scroll gains come from #13 and #3. This patch changes the touch/wheel input path, which the
scripted scroll doesn't exercise, so E1 says nothing about its gain. That proof is the finger test.

Own CDP touch probe (not a tool change), mobile 430x932 DPR3 with touch, CPU 6x, `--vendors=local --https
--latency 150`, under the `chrome-measure` lock as `fix-nav-morph`, baseline vs this fix alone, alternating,
n=3 each. **Zone:** three `Input.dispatchTouchEvent` drags that start 1.6 viewports above the end and scroll into
it. **Push:** drags that push past the end (the morph should expand), then one drag back up (it should collapse).
"Ack" is how long each dispatched touch event takes to be acknowledged, median over the drags [min-max over runs].

| CDP touch probe, mobile 6x, n=3 | baseline | patched |
|---|---|---|
| zone touchstart ack ms | 31.4 [27.5-35.7] | 19.2 [17.9-24.1] |
| zone touchmove ack ms, median | 41.3 [36.8-41.7] | 41.2 [36.4-41.3] |
| zone touchmove ack ms, p95 | 58.6 [50.8-58.9] | 59.2 [57.4-102.2] |
| zone first touchmove ack ms | 23.1 [22.7-24.7] | 23.5 [18-24.1] |
| zone frames > 34 ms | 2 [2-2] | 2 [2-10] |
| push touchstart ack ms | 13.4 [13-18.4] | 13.8 [12.3-15.3] |
| push touchmove ack ms, median | 19.6 [17.3-22.4] | 16.8 [16.4-16.8] |
| push touchmove ack ms, p95 | 79.3 [74.5-82.3] | 80.8 [24.1-81.5] |
| push frames > 34 ms | 6 [2-8] | 5 [2-5] |
| morph expanded after the push | 3/3 | 3/3 |
| collapsed after the drag back up | 3/3 | 3/3 |
| console errors | 0 | 0 |

Reading:
- **Behaviour is equivalent.** The push past the end starts and expands the morph, and the drag back up
  collapses it, in every run on both sides.
- **touchstart ack is faster** (31 → 19 ms, the ranges don't overlap).
- **touchmove ack doesn't move.** CDP's `Input.dispatchTouchEvent` appears to resolve only after the renderer's
  main thread has dispatched the event, passive or not (same median on both sides). If so, it can't show what passive listeners buy, which
  is the compositor not waiting for that dispatch before it scrolls. The zone drags also end inside the
  blocking range (`__atEnd`), by design. So in Chrome this is an **equivalence check, not a latency win**. The
  latency proof is the finger test.
- Patched run 3 of the zone had one noisy stretch (LoAF 199 ms, 10 frames > 34 ms, two long rAF callbacks). Its move p95 is the 102 ms outlier; runs 1-2 were 57-59 ms.
- The probe process exited with "CDP connection closed" after all six jack runs had printed. The data above is
  complete; the probe only lost its final JSON write.

iPhone 15 Pro Max (Safari 26.6, plain http, `iphone.mjs scroll`, scripted, alternating base/patched 3x each;
patched = `nav-morph` = this fix + #3 `nav-hit-test`). Scroll phase, median [min-max]. These are rAF main-thread frame gaps, not scroll smoothness (W2):

| iPhone scripted, n=3 | baseline | patched (nav-morph) |
|---|---|---|
| rAF rate (fps) | 52.7 [52.6-53.9] | 52.5 [52.2-53.2] |
| rAF gaps > 20 ms | 60 [57-63] | 59 [58-61] |
| rAF gaps > 34 ms | 16 [14-17] | 17 [13-20] |
| rAF gaps > 50 ms | 5 [3-7] | 7 [6-7] |
| worst rAF gap ms | 99 [96-119] | 101 [97-105] |

Flat, as expected: the scripted scroll drives `scrollTo`, not touch, so it doesn't exercise the input path this
fix changes (and the phone's main thread is not the bottleneck the way 6x Chrome is). Idle and bottom phases
identical (≈ 60 fps). **Finger test pending (user)**: `fixes/FINGER_TESTS.md` row 1 (push past the end starts
the morph, dragging back up collapses it, no stall when the platform comes in, no stick or rubber-band at the
end).

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status |
|---|---|---|---|---|---|---|---|---|
| morph-scrolljack-passive/01 | listener modes off / passive / blocking (blocking only while morph active or platform end in view) | the compositor no longer waits for the main thread on touch/wheel in the 200 % zone | better (touchstart ack) / within noise (touchmove ack); behaviour equivalent | provisional (own CDP probe, host load not recorded, n=3) | zone touchstart ack 31.4 [27.5-35.7] -> 19.2 [17.9-24.1] ms; touchmove ack 41.3 -> 41.2 ms; morph expands 3/3, collapses 3/3 both | `variants/01.diff`; README "Before / after" probe table; `scratchpad/nav-morph/probe-1.log` | CDP touch acks appear to wait for main-thread dispatch even when passive, so Chrome can check equivalence but not the latency gain | on branch; finger test pending (user) |
| morph-scrolljack-passive/02 | iPhone scripted scroll, `nav-morph` (#3 + #6) vs baseline, alternating 3 + 3 | main-thread per-frame cost on the phone | within noise | clean (phone-side, plain http) | main-thread frame gaps: rAF rate 52.7 [52.6-53.9] -> 52.5 [52.2-53.2]; frames >20 ms 60 [57-63] -> 59 [58-61] | `variants/02.diff` (combined #3 + #6 overlay); README iPhone table; out/iphone/nav-morph-*.json | `iphone.mjs scroll` scrolls by script, not touch: blind to input-handler changes (FINDINGS measurement lessons) | done |
| morph-scrolljack-passive/03 | `filter: none` on `#platform` outside the morph | no permanent `blur(0)` layer on the platform section | abandoned | - | - | README "Risks"; no patch kept (not built here; large-area-blur measured its own `large-area-blur--platform-none` variant) | large-area-blur's iPhone check found no paint gain; changes the containing block / stacking of the section | dropped (large-area-blur / P4 owns blur(0)) |
| morph-scrolljack-passive/04 | `@property --morph-fade { <number>; inherits: false; initial-value: 1 }` on top of #01 | the per-frame `--morph-fade` write in `S` stops restyling the section's descendants; morph-phase style time should drop | within noise (in combination) | mechanism/attribution, load 2.9-4.3, timing not claimed (E1 combined) | morph fps 110 [108-112.1] -> 112.2 [108-113.5], morph LoAF 0 both, n=5 | `variants/04.diff`; `fixes/nav-morph-all/README.md` | the morph phase has no LoAF at 6x on either side, so a style saving there doesn't show in these metrics | in the patch (current patch.diff) |

## Risks, conflicts, follow-ups

- A drag that starts above the end and continues into it: covered by the `L` pin (unchanged); probe numbers
  above. If the finger test shows the page overshooting the end on iOS before the morph grabs it, the fallback
  is to switch to blocking a bit earlier (e.g. `O()` with a larger margin), still far smaller than the 200 % zone.
- Desktop wheel: the same modes apply to `wheel`; a wheel "push past the end" is a new event per notch, so it
  is blocking by then.
- Overlaps: same `ne(() => …)` block as #3 `nav-hit-test` (disjoint hunks; `fix.mjs combine nav-morph
  nav-hit-test morph-scrolljack-passive` applies) and #13 `morph-panel-lazy-mount` (disjoint hunks). The
  engine API (`dE`/`iE`/`rE`/`aE`/`uE`) is unchanged. For wave-2 scroll-engine batching: `L` now also reads the
  platform rect while in the zone (a read, after `_()`'s reads).
- Not done: dropping `filter` on `#platform` (TOPICS.md mention): no paint gain on the iPhone per
  `large-area-blur`'s check, and it changes the containing block / stacking of the platform section.

## Next iteration (architecture review, not in this patch)

- Register `--morph-fade` with `@property { syntax: '<number>'; inherits: false; initial-value: 1 }`. Only the
  platform section reads it, so its descendants stop being restyled on each write in `S`.
- The bigger redesign is a later topic, N2 `morph-composited`, in this cluster: a full-size panel revealed with
  `clip-path: inset(... round)`, opacity cross-fades, a fixed backdrop radius, and the spring as WAAPI with
  `linear()` easing.
