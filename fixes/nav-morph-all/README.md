# Combined: nav-morph-all (experiment E1)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured. E1 of `research/architecture/measurement-review.md`: **#3+#6+#13+countdown vs pure baseline**, not the cluster's gain on main. All three success criteria met; the frames >50 ms criterion is met by the median only (verdict within noise).
**Validity:** mechanism/attribution, load 2.9-4.3, timing not claimed. Load1 stayed <= 6 for the whole slot,
so this is also a clean-host single-topic run.
**What it is:** `node tools/fix.mjs combine nav-morph-all nav-hit-test morph-scrolljack-passive
morph-panel-lazy-mount countdown-idle-raf`, applied in that order with no conflicts.

| input | patch.diff sha256 |
|---|---|
| nav-hit-test (#3) | e1f84630d19abc1a8c7cf146818eb10a56c824c00b75b2efc8f22be2ba36b211 |
| morph-scrolljack-passive (#6, variant 04: listener modes + `@property --morph-fade`) | 5f116f817edde26fe3483f5a6b5d9d8d568ade4efbc184b0e32e8d1cc3f532b0 |
| morph-panel-lazy-mount (#13) | 39072167b15d04693d356b125c93a4e8c2d06e9bf9049b014b1a99a3f3367b79 |
| countdown-idle-raf (the owner's working copy with `__cdActive`; overlay sha256 b608f235…4e77918) | 160d69a043f1bcee9d86bf3c02fc9197907253ce2be9ff0b768b8bfb92fd9d17 |
| combined `patch.diff` (= `variants/01.diff`) | fa57c787097a4bcd79c0b5a612b9ebb4c5bce99083b3a4a7bbf99ac56187d96b |

## Success criteria (set by the lead for E1)

| criterion | result |
|---|---|
| the morph IO callback is absent from the top LoAF scripts in >= 4/5 runs | **5/5 absent** in the patched runs. It was present in 5/5 baseline runs (`2.DyWL8TcE.js:473884 IntersectionObserverCallback`, 41-50 ms, 15-20 ms forced). |
| frames > 50 ms, median -1 or better | **4 [4-5] -> 3 [2-4]** (-1): criterion met by the median, verdict within noise (ranges overlap) |
| morphReached 5/5 | **5/5 on both sides** |

## Before / after

`node tools/lock.mjs run chrome-measure --owner fix-nav-morph -- sh -c '<uptime; top>; node tools/fix.mjs ab
nav-morph-all --runs 5; <uptime; top>'`. Chrome, mobile 430x932 DPR3, CPU 6x, ABBA, 6 s idle phase (I-002 tools),
`--vendors=local --https --latency 150`, branch head 4eac79f (= aec776d after the rebase, tools unchanged).

- Slot start 23:32:00Z: load averages 3.46 4.31 9.48; CPU 74.6 % idle.
- During the runs: load1 2.9-4.3.
- Slot end 23:37:26Z: load averages 3.75 3.83 7.58; CPU 79.3 % idle.
| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 74.9 [72.5-75.6] | 87.3 [85.2-90.8] | +12.4 (+16.6%) | better (ranges do not overlap) |
| scroll: frames >20 ms | 70 [57-89] | 36 [29-40] | -34 (-48.6%) | better (ranges do not overlap) |
| scroll: frames >34 ms | 7 [5-11] | 6 [5-7] | -1 (-14.3%) | within noise |
| scroll: frames >50 ms | 4 [4-5] | 3 [2-4] | -1 (-25%) | within noise |
| scroll: frames >100 ms | 0 [0-1] | 0 [0-1] | 0 | within noise |
| scroll: worst frame ms | 90.8 [83-100.9] | 91.6 [83.4-108.3] | +0.8 (+0.9%) | within noise |
| scroll: p95 frame ms | 25.2 [25.1-25.6] | 17.6 [17.5-24.1] | -7.6 (-30.2%) | better (ranges do not overlap) |
| scroll: LoAF ms | 278 [258-321] | 201 [138-233] | -77 (-27.7%) | better (ranges do not overlap) |
| scroll: LoAF script ms | 150 [125-178] | 77 [65-80] | -73 (-48.7%) | better (ranges do not overlap) |
| scroll: forced style+layout ms (in LoAF) | 41 [33-85] | 13 [6-14] | -28 (-68.3%) | better (ranges do not overlap) |
| morph: fps | 110 [108-112.1] | 112.2 [108-113.5] | +2.2 (+2%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: fps | 119.7 [119.7-120] | 120 [119.8-120] | +0.3 (+0.3%) | within noise |
| idle: frames >20 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: frames >34 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: frames >100 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: worst frame ms | 16.9 [9.4-17.5] | 9.4 [9.4-17.2] | -7.5 (-44.4%) | within noise |
| idle: p95 frame ms | 9.2 [9.2-9.2] | 9.2 [9.2-9.2] | 0 (0%) | within noise |
| idle: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: LoAF script ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

Screenshots: diff top/middle/bottom 0.15 / 0 / 0.13 % (phase noise range). No new console errors, no new 404s.
Raw: `out/ab/nav-morph-all/2026-09-30T23-32-00-597Z/verify.json`.

## Attribution (top LoAF scripts in the scroll phase, per run)

| side | entries in every run | gone |
|---|---|---|
| baseline (5 runs) | gtag `onscrollend` 56-71 ms; morph IO callback (`:473884`) 41-50 ms, 15-20 ms forced; `l` (future, `:413982`) 15-20 ms, all forced; `iE` (engine, `:100565`) 6-52 ms, up to 45 ms forced | - |
| patched (5 runs) | gtag `onscrollend` 59-66 ms; `l` 6-8 ms (all forced); `a` (`:116579`) 6-7 ms in 3 runs | the morph IO callback (5/5), `iE` (5/5) |

Reading:
- The morph panel mount moved out of the scroll phase (#13), so the IO callback's LoAF is gone.
- The engine frame (`iE`) no longer forces 43-45 ms of style/layout. Most of that was the nav hit test's
  `pointer-events` write-read-write (#3).
- `l` (future section, `phone-invisible-shrink` / scroll-engine territory) and gtag's `onscrollend` handler
  (third party) are what is left. Gtag is now the only entry > 50 ms.
- The idle phase shows no LoAF on either side. The lazy mount (`requestIdleCallback` after `load`) ran before
  the 6 s idle window, during load, which this tool doesn't measure.
- **Not separated here:** the share of each input. #3 alone was within noise and contaminated. #6 changes only
  the input path, which this scripted A/B doesn't exercise. The countdown patch contributes its own idle/rAF
  savings. Solo A/Bs of #13 and of countdown-idle-raf would split the gains; E1 was specified as the combined run.

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| nav-morph-all/01 (E1) | #3 + #6 (v04) + #13 (v01) + countdown-idle-raf (`__cdActive`) combined, vs pure baseline | removes the morph IO mount LoAF (#13) and the nav's forced style per frame (#3); the hidden panel countdown pauses (countdown `active`) | better | mechanism/attribution, load 2.9-4.3, timing not claimed; also clean-host single-topic run (load1 <= 6 for the whole slot) | IO LoAF present 5/5 -> 0/5; frames >50 ms 4 [4-5] -> 3 [2-4] (within noise); frames >20 ms 70 [57-89] -> 36 [29-40]; fps 74.9 [72.5-75.6] -> 87.3 [85.2-90.8]; forced 41 [33-85] -> 13 [6-14] ms; LoAF script 150 [125-178] -> 77 [65-80] ms; morphReached 5/5 both; n=5 | `results.json`, `variants/01.diff`, out/ab/nav-morph-all/2026-09-30T23-32-00-597Z | FINDINGS T8 confirmed: a hidden-panel mount inside a scroll frame was a top LoAF; with #3 the engine frame's forced style/layout left the top list | on branch | pending runner: `variants/01.diff`; mech: IO callback absent from LoAF, zero inline `style` mutations on the nav `<header>` during scroll |
