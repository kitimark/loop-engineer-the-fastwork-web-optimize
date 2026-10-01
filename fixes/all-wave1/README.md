# Combined: all-wave1

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured. All 10 A/B runs are uncontaminated; 1 run has a warn (other CPU 23.6 %). The same-hold
A/A gives the floor.
**Goal metrics (lead):** frames >50 ms 3 -> 2 and frames >34 ms 5 -> 5, both **within noise**. fps and
frames >20 ms (hints) move clearly: 93.8 -> 110.6 and 25 -> 13, ranges don't overlap.
**Topics (apply order):** phone-invisible-shrink, commission-forced-layout, layout-animations (v10),
pain-offscreen-notes, countdown-idle-raf, large-area-blur, nav-hit-test, morph-panel-lazy-mount (v03). Not
included: morph-scrolljack-passive (#6, iPhone-gated).
**Use as a base for wave 2:** `node tools/fix.mjs apply all-wave1` rebuilds the overlay from `patch.diff`; then
`--on all-wave1`.

## Inputs (main `93b4af2`)

`node tools/fix.mjs combine all-wave1 <the 8 topics above>`: all 8 applied cleanly, with no hand resolution
(dry run: `fixes/wave1-dry/README.md`). `node --check` OK. `fix.mjs serve` + `curl` show
`x-mirror-source: overlay` for both files, and the A/B's served-file check agrees.

| topic | sha256 of `fixes/<topic>/patch.diff` |
|---|---|
| phone-invisible-shrink | `5e42555d4191d0a72dbfdb0f5a0c6c6567408d320bc11ed8ecaaad835fc7aede` |
| commission-forced-layout | `9897e36c47d7a357fce1a05e3002d2cb91e6b8cc507c3403edf68ce2e9704099` |
| layout-animations (v10) | `7bf120165d54b4a79ecf89a4919ceff1432165eea019a21c9f501691ba76d7ba` |
| pain-offscreen-notes | `71f64449e9e6723fcee4437e24600452a4542e28d604af5dd7a94a3097e67895` |
| countdown-idle-raf | `160d69a043f1bcee9d86bf3c02fc9197907253ce2be9ff0b768b8bfb92fd9d17` |
| large-area-blur | `db12ccec57a1e93afb5c8dccd57f6597a822ceb9c032d0125cbae0b86a28e840` |
| nav-hit-test | `e1f84630d19abc1a8c7cf146818eb10a56c824c00b75b2efc8f22be2ba36b211` |
| morph-panel-lazy-mount (v03) | `06c0b10c42f1bdf6f3f3fb23afca16608dde69f808d3955e22405c7c326fe900` |

Combined `patch.diff` sha256 `fe796bb8…b321f` (2 files, +259 / -51). Overlay: JS `69b91556…0db57`, CSS
`213e21d3…4d25`.

## The hold

One announced hold, the agreed ~15 min exception to the 10 min rule:
`node tools/lock.mjs run chrome-measure --owner all-wave1 --max-seconds 1200 --timeout 14400 -- sh -c '…'`.
It ran a gate-timeout abort check, then `fix.mjs ab --aa --runs 5`, then `fix.mjs ab all-wave1 --runs 5`, then
`timeout 60 node fixes/all-wave1/probe-countdown-active.mjs`. The lock was granted after 20 s (no gate
timeout), and the hold ran 04:37-04:51 UTC.
Tools: main `93b4af2`, with the host gate, the I-023/I-024A recheck cap, Chrome warm-up >= 10 s and the
watchdog. Settings: Chrome, mobile 430x932 DPR3, CPU 6x, ABBA, cold cache, 6 s idle phase,
`--vendors=local --https --latency 150`.

**Not comparable with pre-gate numbers.** On these tools the plain baseline scrolls at about 93 fps, against
about 75 fps on the pre-gate tools (wave1-partial, the I-002 tools). Compare only within this hold: this A/A is
the floor. Morph numbers from before and after the gate aren't strictly comparable either (extra spawns between
phases).

### A/A floor (same hold, just before the A/B)

`out/ab/_aa/2026-10-01T04-37-10-678Z/results-aa.json`. 0 of 10 runs contaminated (load1 1.9-3.6, other CPU at
most 16.5 %).

| mobile 6x, n=5 | baseline median [min-max] | baseline2 median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 93 [89.7-93.4] | 92.3 [88.9-92.9] | -0.7 | within noise |
| scroll: frames >20 ms | 25 [22-30] | 27 [21-35] | +2 | within noise |
| scroll: frames >34 ms | 5 [4-6] | 5 [5-7] | 0 | within noise |
| scroll: frames >50 ms | 2 [2-3] | 3 [2-4] | +1 | within noise |
| scroll: p95 frame ms | 18.1 [18.1-18.2] | 18.2 [18.1-18.4] | +0.1 | within noise |
| scroll: LoAF ms | 169 [166-180] | 186 [170-229] | +17 | within noise |
| scroll: forced style+layout ms | 29 [27-31] | 26 [22-34] | -3 | within noise |

### A/B: baseline vs all-wave1

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 93.8 [91.5-94.3] | 110.6 [105.5-110.9] | +16.8 (+17.9%) | better (ranges do not overlap) |
| scroll: frames >20 ms | 25 [24-26] | 13 [8-14] | -12 (-48%) | better (ranges do not overlap) |
| scroll: frames >34 ms | 5 [4-6] | 5 [4-6] | 0 (0%) | within noise |
| scroll: frames >50 ms | 3 [2-4] | 2 [1-3] | -1 (-33.3%) | within noise |
| scroll: frames >100 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| scroll: worst frame ms | 68.4 [66.6-74.5] | 58.8 [58.1-75.8] | -9.6 (-14%) | within noise |
| scroll: p95 frame ms | 18.1 [17.9-18.3] | 15.6 [15.1-16.9] | -2.5 (-13.8%) | better (ranges do not overlap) |
| scroll: LoAF ms | 170 [161-178] | 116 [107-122] | -54 (-31.8%) | better (ranges do not overlap) |
| scroll: LoAF script ms | 108 [101-112] | 51 [48-52] | -57 (-52.8%) | better (ranges do not overlap) |
| scroll: forced style+layout ms (in LoAF) | 28 [25-31] | 0 [0-0] | -28 (-100%) | better (ranges do not overlap) |
| morph: fps | 114 [113.8-114.1] | 113.9 [113.8-114.2] | -0.1 (-0.1%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: fps | 119.8 [119.6-120] | 120 [119.8-120] | +0.2 (+0.2%) | within noise |
| idle: frames >20 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |

(Full table: `results.json` -> `markdown`.)

Per-run host records for the A/B, in ABBA order (`raw` -> `results[i].host`):

| run | side | load1 at start | other CPU (scroll) | class |
|---|---|---|---|---|
| 1 | baseline | 1.9 | 8.8 % | clean |
| 1 | patched | 2.0 | 6.1 % | clean |
| 2 | patched | 2.0 | 23.6 % | **warn** (other CPU > 20 %) |
| 2 | baseline | 2.4 | 5.9 % | clean |
| 3 | baseline | 2.6 | 6.8 % | clean |
| 3 | patched | 2.6 | 6.0 % | clean |
| 4 | patched | 2.0 | 5.2 % | clean |
| 4 | baseline | 1.9 | 5.3 % | clean |
| 5 | baseline | 2.5 | 4.9 % | clean |
| 5 | patched | 2.2 | 5.0 % | clean |

The warn run (run 2 patched: 105.5 fps, 1 frame >50 ms, 5 >34 ms) is inside the patched range on every
metric. Dropping it doesn't change a verdict.

Regressions: none. No new console errors, no new 404s, `morphReached` 5/5 on both sides. Screenshot diff
top/middle/bottom is 0.14 / 0.01 / **0.55 %**. The bottom value is above the 0.4 % noise line; I cropped and
inspected it. All three differing regions are gradient-sweep text in the platform row titles ("Earn", "Secure",
"Organized"): the same text in a different sweep phase. That is P11: layout-animations' `PMsweepGate` pauses
the sweep off-screen, so it resumes at a different phase. No layout or visual change.

## Where the frames >50 ms are (LoAF attribution, `raw` -> `scrollSummary.topScripts`)

| run | baseline LoAFs (script ms, forced ms) | patched LoAFs |
|---|---|---|
| 1-5 | gtag `onscrollend` 45-54 (0-1); `IntersectionObserverCallback` at `nodes/2.DyWL8TcE.js:473884` 35-38 (12-15); future `l` rAF 7-16 (7-15); `iE` 6-7 (1-3). 3 LoAF frames per run | gtag `onscrollend` 48-52 (0); nothing else with script. 2 LoAF frames per run, LoAF script total 48-52 ms = gtag only |

- **F-009(c), the nav platform IO frame: gone.** This is the only first-party `IntersectionObserverCallback` in
  the baseline LoAF list (35-38 ms, 12-15 ms forced, 5/5 runs), and in all-wave1 it is absent in 5/5 runs. That
  matches #13: the morph panel now mounts at idle after load (the probe below saw it mounted 260 ms after
  settle), not inside that IO callback. The future `l` and `iE` entries are gone too (phone-invisible-shrink).
- **F-011, the ~60 ms script-less frame at y≈2100-2150: probably still present (not proven).** In every patched
  run the second LoAF frame has about 0 ms of script; its duration is LoAF total minus gtag, about 55-70 ms. That
  fits F-011's no-script style+layout frame (content-visibility un-skip). verify's record has no per-frame
  scroll Y, so I can't place it at y≈2100-2150 from this data; F-011's own probe can. Either way, #13 + countdown
  did not remove it, as F-011 expected. It is wave 2 territory (scroll-engine /10, idle un-skip).
- So in all-wave1, frames >50 ms (median 2) are about 1 gtag (vendor, not fixable here) + about 1 F-011 frame.

## Countdown `active` gate probe: FAIL against "0 writes"; the gate does work

`probe-countdown-active.mjs`, in the same hold, counts only. One page load of the all-wave1 overlay, mobile 6x,
scrollY 0. The panel was mounted 260 ms after settle and stayed `data-start-selling-scene=paused` (E false)
and `inert` for the whole 6 s window. Panel faces 80, page faces 80.

| 6 s window | face style writes |
|---|---|
| panel countdown (`active` = false) | **21** |
| page countdown (control, visible) | 717 |

The criterion was 0, so this is a FAIL. But the gate clearly works: the panel countdown writes 34x less than
the visible one, about 3.5 writes/s instead of about 120/s, so no rAF spring is running. A likely reading, from
the code and not separately probed: when `animate` is false, the digit takes the reduced-motion path
(`z(a, e, !0)`, a snap). The 1 Hz tick still changes the digit values, and each snap rewrites the `translateY`
of the faces whose clamped offset changes, about 3-4 faces per second. To reach 0, countdown-idle-raf would
need to skip the face updates entirely while inactive (e.g. not snapping until shown), at the cost of a stale
number on first show. That's the owner's and reviewer's decision.

## Risks, follow-ups

- Goal metrics (>50 / >34 ms) don't move beyond noise in Chrome 6x. What's left is gtag (vendor) and the F-011
  render frame (wave 2). The per-frame JS cost is what wave 1 removed: LoAF script -53 %, forced layout -100 %,
  frames >20 ms -48 %.
- large-area-blur is GPU work (P5), invisible here; morph-scrolljack-passive is excluded (needs the iPhone).
- Countdown gate: 21 vs 0 writes, see above.
- iPhone confirmation not done in this hold. The iPhone lease is held by `lead-iphone-offline`.
