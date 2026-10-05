# Fix: settle-cache

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** parked before any edit (2026-10-05, lead ruling on T-193 #5 item 2: "if not, park it with the reason")
**Stage:** R (no I, no card; no prediction id taken; ops: next free id was P-136)
**Base:** main 189ca7ed+ (v9-final + menu rev 7d, JS 1b2eecc66011, CSS e1359ab9994a); the overlay was rebuilt with
`fix.mjs apply settle-cache --from morph-scroll-v9try` and hashes to exactly that build (no change made; no patch.diff).
**Owner:** fix-hero-exit-threaded

## The idea (exact, T0)

The menu's rest timer `__msArm` (JS 14233-14235: a 200 ms `setTimeout`, re-armed on every glide frame at 14309-14310 and
at lift-off at 14288) calls `__msSettle` (14236-14266), which reads `__msEnd.offsetHeight` and
`document.documentElement.scrollHeight` (and `innerHeight`, `scrollY`) and then may start a smooth `scrollTo`. `__msTick`
(14315-14316) reads the same two heights on every scroll frame. The plan: cache both heights in the existing ResizeObserver
`__msRO` (14461-14466, which already reads them), with `__msEnd` also observed, so the settle and the tick read no layout.
Same rule, same timing, so exact. Remaining risk: a size change between a layout and the RO delivery would leave one
stale frame.

## Why it is parked

The evidence for it was a coincidence of times only (research/serious-heat §2.4/§3.4: 13 of 21 slow frames in C-052
fell 186-219 ms after lift). The decisive descriptive check, P-129 part S, came back negative (mgmt-ops-10's read,
2026-10-05 10:4xZ, on the rev 7d research build 29c0d537e0c9, driver G, xcode-serious, Timeline on):

| P-129 part S | count |
|---|---|
| after-lift slow last-screen frames (<= 300 ms after a touchend) | 97 |
| with a 200 ms TimerFire in their gap (matched by timer id) | 0 |
| with a Layout after such a fire | 0 |
| 200 ms timers installed / fired per run (the matcher works) | ~370-450 / ~47 |

Part A of the same block: on the last screen all 243 slow frames are RENDER (101) or MIXED (142), none MAIN. So the
page-end late frames in that block are not main-thread late, which also argues against any main-thread settle cost.
Card prediction 8 (>= half) is out. `fixes/morph-scroll/settle-trace.mjs` (the Chrome trace of the settle) was not run:
part S already answers the question it was for.

**Resume on:** new data that puts the settle's timer or reads inside slow frames (e.g. a later Timeline block on
v9-final), or a lead decision.
