# Combined: nav-morph-all-v2 (mechanism check for #13 variant 03)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**What:** #3 nav-hit-test + #6 v05 (63d6980e) + #13 v03 (06c0b10c) + countdown-idle-raf (160d69a0), vs pure
baseline. Combined `patch.diff` sha256 6d5c17bbf6dba388382ac2246bf52e711bcff92364386722c30d9091eab6f98d.
**Role:** the mechanism evidence for `morph-panel-lazy-mount` #13/03, landed with it. The combined `patch.diff`
also contains the #3, #6 v05 and countdown code, for reference; #6 lands separately, after the finger test. E1 (the
timing-side combined run of v01) is `fixes/nav-morph-all` on the owner's branch.
**Why:** to check #13 variant 03 (the scroll-aware mount timer) with `--idle 0`, so the scroll starts right
after load.
**Validity:** mechanism/attribution, load 2.9-4.6, timing not claimed. Slot start 23:50:22Z, load 3.37 3.70
5.37; end 23:53:17Z, load 3.99 3.75 5.06.
**Command:** `node tools/lock.mjs run chrome-measure --owner fix-nav-morph -- sh -c 'uptime; node tools/fix.mjs ab
nav-morph-all-v2 --runs 3 --idle 0; uptime'`.

## Criterion: the mount callback is absent from scroll-phase LoAF in every patched run

**Pass, 3/3.** No patched run has a scroll-phase LoAF script at the mount callback (char ~478086 in the combined
file), and none has an `IdleRequestCallback` or `TimerHandler` entry. The morph IO callback is in 3/3 baseline runs
(43-45 ms, 15-19 ms forced) and in 0/3 patched runs. What's left in the patched runs: gtag `onscrollend` (59-61 ms),
`l` 6-9 ms, `a` 6 ms.

Limit: the run doesn't show *when* the mount happened. rIC may have fired during load, before the scroll started,
in which case the re-arm path wasn't exercised. The Safari case (no rIC, 2 s timer) is FINGER_TESTS row 1 (#13).

Worst frame: 83.3 [83.2-83.5] -> 84.2 [84.1-84.3] ms: **noise (third-party gtag frame, n=3)** (review verdict; the tool marks it because the ranges do not overlap). It is
+0.9 ms on the gtag `onscrollend` frame, which neither patch touches (56-61 ms LoAF on both sides).

| mobile 6x, n=3 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 77 [76.2-77.9] | 87.7 [87.4-90.3] | +10.7 (+13.9%) | better (ranges do not overlap) |
| scroll: frames >20 ms | 62 [60-67] | 36 [31-37] | -26 (-41.9%) | better (ranges do not overlap) |
| scroll: frames >34 ms | 7 [6-8] | 6 [5-8] | -1 (-14.3%) | within noise |
| scroll: frames >50 ms | 4 [4-4] | 3 [3-4] | -1 (-25%) | within noise |
| scroll: frames >100 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| scroll: worst frame ms | 83.3 [83.2-83.5] | 84.2 [84.1-84.3] | +0.9 (+1.1%) | noise (third-party gtag frame, n=3) |
| scroll: p95 frame ms | 25 [25-25.2] | 17.6 [17.6-17.7] | -7.4 (-29.6%) | better (ranges do not overlap) |
| scroll: LoAF ms | 258 [201-259] | 183 [178-188] | -75 (-29.1%) | better (ranges do not overlap) |
| scroll: LoAF script ms | 132 [125-133] | 69 [65-71] | -63 (-47.7%) | better (ranges do not overlap) |
| scroll: forced style+layout ms (in LoAF) | 39 [38-39] | 8 [6-11] | -31 (-79.5%) | better (ranges do not overlap) |
| morph: fps | 112 [111.2-112.7] | 111 [109.9-112.7] | -1 (-0.9%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |
