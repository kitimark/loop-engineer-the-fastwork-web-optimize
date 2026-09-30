# Retrospective: 98 mobile 6x runs from 11 sessions

## Sessions

| session | kind | runs | load range | baseline gt20 median [min-max] | baseline fps median [min-max] | baseline LoAF ms median [min-max] |
|---|---|---|---|---|---|---|
| out/verify-6x-mobile/verify-2026-09-30T19-24-55-625Z.json | live/local | 6 | ? | 88.5 [85-101] | 71.6 [66.9-73] | 259 [155-300] |
| agent-a03218c7c8f9587ed/out/ab/_aa/2026-09-30T21-11-55-249Z/verify.json | A/A | 10 | 2.8-5.8 | 65.5 [54-78] | 74.5 [71.4-77] | 259 [195-283] |
| agent-a03218c7c8f9587ed/out/ab/countdown-idle-raf/2026-09-30T21-17-34-202Z/verify.json | A/B | 10 | 9.6-19.5 | 82 [76-103] | 71.3 [68-73.4] | 316 [263-401] |
| agent-a1722cf5058e25591/out/ab/scroll-engine/2026-09-30T22-22-05-405Z/verify.json | A/B | 6 | 6.7-11.7 | 102 [101-109] | 69.2 [65.8-69.6] | 345 [228-355] |
| agent-a277ea00c8773c1ea/out/ab/nav-hit-test/2026-09-30T21-19-14-853Z/verify.json | A/B | 10 | 11.3-17.5 | 98 [85-135] | 69.1 [61.1-71.4] | 305 [276-372] |
| agent-a4091af4a88270aa0/out/ab/large-area-blur/2026-09-30T21-19-11-624Z/verify.json | A/B | 10 | 4.2-12.4 | 99 [77-109] | 69 [66.8-71.9] | 320 [267-376] |
| agent-a53f4ec08506b7442/out/ab/commission-forced-layout/2026-09-30T21-15-46-797Z/verify.json | A/B | 10 | 6.1-11.7 | 96 [89-99] | 69.3 [66.6-70.3] | 336 [289-364] |
| agent-a60136f2e6656de92/out/ab/phone-invisible-shrink/2026-09-30T21-34-23-618Z/verify.json | A/B | 10 | 8-20.2 | 104 [94-133] | 66.5 [62.7-69.9] | 361 [284-454] |
| agent-a700c6e710c364d49/out/ab/pain-offscreen-notes/2026-09-30T21-15-27-113Z/verify.json | A/B | 10 | 5.1-12.9 | 95 [77-115] | 66.2 [51.5-71.2] | 332 [303-1544] |
| agent-a77e2ec753b6381fb/out/ab/hero-exit-scroll-timeline/2026-09-30T22-26-56-967Z/verify.json | A/B | 6 | 9.1-19.1 | 115 [114-139] | 63.7 [62.7-66.7] | 346 [334-454] |
| agent-a7da36df115c2e662/out/ab/layout-animations/2026-09-30T22-11-42-039Z/verify.json | A/B | 10 | 9.5-17.7 | 95 [92-112] | 69.6 [66.2-72] | 328 [291-360] |

## Baseline-side runs by host load (loadavg1 before the run)

| load | n | fps median [min-max] | >20 ms median [min-max] | >34 ms | >50 ms | LoAF ms | forced ms |
|---|---|---|---|---|---|---|---|
| 0-4 | 4 | 74.5 [71.7-76.5] | 64.5 [64-76] | 9 [7-10] | 4 [4-5] | 261.5 [255-278] | 40.5 [38-44] |
| 4-6 | 7 | 73.9 [71.4-77] | 70 [54-78] | 8 [7-11] | 4 [3-5] | 258 [195-318] | 42 [34-83] |
| 6-8 | 6 | 69.4 [66.2-71.2] | 100 [84-109] | 13 [12-14] | 5 [4-7] | 350 [303-364] | 87.5 [50-102] |
| 8-10 | 9 | 67.9 [63.7-70.3] | 96 [88-114] | 14 [10-17] | 6 [5-8] | 320 [228-364] | 55 [42-94] |
| 10-15 | 17 | 67.1 [51.5-71.3] | 103 [77-139] | 13 [9-18] | 6 [4-10] | 335 [263-1544] | 83 [39-116] |
| 15- | 8 | 71.3 [66.5-73.4] | 91 [76-104] | 11 [8-15] | 5 [5-6] | 301.5 [268-372] | 50.5 [35-95] |

## Correlation with load (baseline-side runs)

| metric | Pearson r | Spearman rho | OLS slope per +1 load |
|---|---|---|---|
| fps | -0.40 | -0.43 | -0.40 |
| gt20 | 0.54 | 0.51 | 2.34 |
| gt34 | 0.43 | 0.43 | 0.28 |
| gt50 | 0.34 | 0.47 | 0.10 |
| max | 0.04 | 0.21 | 1.00 |
| p95 | 0.29 | 0.51 | 0.19 |
| loafMs | 0.15 | 0.40 | 6.13 |
| loafScriptMs | 0.28 | 0.25 | 2.15 |
| forcedLayoutMs | 0.23 | 0.27 | 1.26 |
| morphFps | -0.10 | -0.22 | -0.17 |
| morphGt50 | 0.06 | 0.47 | 0.00 |

(load per run = mean of loadavg1 before and after the run; n=51)

## Within-session correlation (load and metric demeaned per session and side)

| metric | n | Pearson r | slope per +1 load |
|---|---|---|---|
| fps | 92 | -0.11 | -0.12 |
| gt20 | 92 | 0.13 | 0.60 |
| gt34 | 92 | 0.25 | 0.19 |
| gt50 | 92 | 0.07 | 0.03 |
| loafMs | 92 | 0.10 | 5.25 |
| forcedLayoutMs | 92 | 0.08 | 0.68 |
