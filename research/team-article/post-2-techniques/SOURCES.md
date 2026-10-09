# Sources for "Sixteen Milliseconds, Part 2: The Casebook"

> Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork).

Every number in `index.html` mapped to the record it came from. Paths are relative to the repository root; line
numbers are 1-based, as of main fa4a0c37 (2026-10-09). "Device / driver" names the instrument: Chrome (Chrome 154,
M1 Pro Mac), Sim (iPhone 15 Pro Max Simulator, iOS 26.5, counts only), iPhone (iPhone 15 Pro Max, iOS 26.6.1 Safari)
with driver S (scripted scroll), W (window run), G (WebDriverAgent robot finger). The chart data in the page's script
block repeats these values.

Engine source citations (WebKit, Chromium) are the ones the study's own verifiers recorded; the two read for this
article are marked "read 2026-10-09".

## Masthead, ruler, instruments

| Number in the article | Device / driver | Source |
|---|---|---|
| 16.7 ms frame; goal dt > 50 ms, target 0; secondary > 34; twins ±4 ms (46/54, 30/38); near bands | iPhone | research/architecture/measurement-protocol-v2.md 173-180; CLAUDE.md "Frame thresholds" |
| Chrome ticks k = round(dt / 8.333); > 34 = k ≥ 5 (37.5 ms); > 50 = k ≥ 7 (54.17 ms) | Chrome | measurement-protocol-v2.md 155-157 |
| Chrome CPU 6x, viewport 430x932 DPR 3 | Chrome | CLAUDE.md "Calibrated measurement setting"; research/cpu-throttle-calibration/README.md 56 |
| Simulator iOS 26.5; phone iOS 26.6.1; Chrome 154 on M1 Pro | all | fixes/g0-0k/README.md 51 (Simulator); research/cpu-throttle-calibration/README.md 16-19 |
| Blocks: C V V C C V V C, 4 runs per arm, warm-up, sentinel | iPhone | measurement-protocol-v2.md 283-321 |

## Case 01: hand the motion to the compositor

| Number | Device / driver | Source |
|---|---|---|
| Countdown script callbacks per roll 23-26 → 1 | Chrome, 3 loads | fixes/cd-roll-ca/README.md 147, 152 |
| Main-thread frames per 6 s, everything else frozen, 205 → 79 | Chrome | fixes/cd-roll-ca/README.md 219 |
| Paints / layouts per menu open 559 / 181 → 145 / 125 | Sim | research/architecture/gpu-compositor-playbook.md 29, 137 |
| Per menu frame: Layout 2.23-2.38 → 1.00-1.04; Paint 11.45-12.01 → 3.19-3.28; style recalcs 1.82-1.90 → 2.13-2.18 (chart c1) | iPhone G, P-157, xcode-serious, 4 v 4 | fixes/compositor-morph/README.md 202-204 |
| Layout prediction ≤ 0.3 per frame | iPhone | fixes/compositor-morph/README.md 175; playbook 148-150 |
| 291 script-forced layouts: 158 `elementsFromPoint`, 44 `scrollY` | Sim | playbook 153-154 |
| Frames over 50 ms share per menu frame V 0.1-0.3 % vs C 0.2-0.5 % | iPhone G | fixes/compositor-morph/README.md 211-213 |
| P-093: top window dt > 50 per run C 0,0,0,0 vs V 1,1,2,1 (+1) | iPhone W | fixes/cd-roll-ca/README.md 1018-1028 |
| Full-screen blur on the compositor: Composite 74 vs 42 ms | iPhone | playbook 113-115 |
| Claims: Core Animation runs accelerated animations (C4); scroll-driven threaded on iOS 26.4+; tick invalidates style; `linear()`/`steps()` stay on main; start forces compositing update (C7); 80-120 Hz request (C9); scrollY forces layout | source | research/gpu-lessons/README.md 98-102; playbook 64-72, 92-93, 186-196 |

## Case 02: container units instead of aspect-ratio

| Number | Device / driver | Source |
|---|---|---|
| 20-35 ms layout per nudge; knock-out table (control median 22.7-25.7; non-sticky 0.5; deck hidden 0.5-0.7; active shell only 9.7-15.9; fixed height 0.4) | Sim | fixes/sticky-walk/README.md 30-42 |
| 844.078125 px card at 430 wide | Sim/Chrome | fixes/g0-0j/README.md 11-12 |
| Phone Layout ≥ 5 ms per run 159,153,152,155 → 1,0,1,1; frames > 34: 18,12,12,13 → 2,3,5,6; > 50: 3,1,2,2 → 1,1,1,1 (charts c2a, c2b, c9) | iPhone G, P-172, tool-serious, 4 v 4 | fixes/sticky-walk/README.md 242-256 |
| Twins > 46: C 4,2,2,3 vs V 1,1,1,1; > 54: C 1,1,1,1 vs V 0,0,0,0 | iPhone G, P-172 | fixes/sticky-walk/README.md 242-249 (the "(46 / 54)" column) |
| Sim drags: layouts ≥ 5 ms per run 129-169 → 2-4; frames delivered 1051-1101 → 1180-1203 | Sim G | fixes/sticky-walk/README.md 139-140; fixes/BEST_BUILDS.md 12 |
| Remaining frame at y ~1750: 61-63 → 51-52 ms | iPhone G | fixes/sticky-walk/README.md 257-259; finding F-368 |
| Injected rules kept 34-47 big layouts | Sim | fixes/sticky-walk/README.md 143-146 |
| Claims: LocalFrameView.cpp 3822-3834; RenderBlockFlow.cpp 588/638/807-841; link UNRESOLVED; StyleComputedStyle.cpp 458-468; ImageQualityController.cpp 46, 196-228 | source | fixes/sticky-walk/README.md 58-63, 107, 159-161 |

## Case 03: the first wheel listener

| Number | Device / driver | Source |
|---|---|---|
| Ablations: as built 102.5-117.7 ms, L+S 158-171; wheel at load 33.5-59.0 ms, L+S 48-52; src/inert moved 129.8-153.6 ms, L+S 175-227; moved to y ~3990: new 82-117 ms frame | Sim, 3 loads | fixes/g0-box/README.md 1163-1175 |
| Crossing frame X per run C 49,51,51,49 → V 19,19,19,17 ms (chart c3); median 50 → 19; L+S 31.7 → 4.3 | iPhone G, P-173, tool-serious, 4 v 4 | fixes/g0-0k/README.md 319-326, 334-336 |
| Sim crossing frame 128-149 → 20-29 ms; L+S 49.8-57.2 → 5.1-7.8; paints 19-20 → 1; background p90 1.5 | Sim G | fixes/g0-0k/README.md 130-140 |
| Phones get no wheel listener in g0.0k; desktop/reduced motion add it at mount | code read | fixes/g0-box/README.md 1359-1371 |
| Claims: LocalDOMWindow.cpp 2150-2172; Document.cpp 6648-6663; StyleAdjuster.cpp 227-262; Document.cpp 12723-12730 | source | fixes/g0-box/README.md 1149-1153; finding F-360 |

## Case 04: steady glass

| Number | Device / driver | Source |
|---|---|---|
| Glass missing in 12 of 33 shots; sharpness up to 1.87 vs 0.02-0.09 | Sim G | fixes/cm-return/README.md 40-41 |
| Glass frosted in all 17 shots (0.03-0.09) | Sim G | fixes/g0-0k/README.md 91 |
| Per frame at the end: paints 3.23 → 0.63; layouts 0.81 → 0.44; style 1.00 → 1.43 (chart c4) | Sim G, 1 load | fixes/g0-0k/README.md 71-73 |
| Layers / MB at rest, menu closed 46 / 77.2 → 53 / 103.6 | Sim | fixes/g0-0k/README.md 75 |
| END > 50: 0 in every run; > 34 share 0.13-0.27 % vs 0.17-0.30 %; 45-49 style records ≥ 5 ms per V run | iPhone G, P-173 | fixes/g0-0k/README.md 319-343 |
| Tint #ffffff1a → #131922, blur 20 px | code | fixes/cm-return/README.md 30-33 |
| Changing blur repaints; constant blur(0) costs nothing measurable (P4) | iPhone | fixes/FINDINGS.md 36 |
| Claims: Chrome blur animations not composited (F-140); opacity crossing 1 is a Layout difference (StyleDifference.cpp 192-209) | source | playbook 71, 178, 194 |

## Case 05: the clock layer

| Number | Device / driver | Source |
|---|---|---|
| Centre 406x389 CSS px, 5.7 MB; wrapper 1.2 MB | Sim | fixes/menu-layers/README.md 18-19, 46 |
| Centre paints per open 196 → 11; backing ~1117 → ~287 MB (chart c5) | Sim | fixes/g0-0i/README.md 48-49 |
| Layers / MB open 53 / 77.3 → 54 / 78.5 | Sim | fixes/g0-0i/README.md 47 |
| P-170b: first open 16.5 vs 16.5 ms; open median 17 vs 17; 0 frames > 50 | iPhone G, 2 v 2 | fixes/g0-0i/README.md 53 |
| P-170 void: 49.4 fps at 43 °C | iPhone | fixes/g0-0i/README.md 57 |
| Chrome digits 1 CSS px higher | Chrome | fixes/menu-layers/README.md 59-60 |
| Claims: ImageBufferSet.cpp 42-75, 103-148; RemoteLayerBackingStoreCollection.mm 45, 124-143; CA re-upload UNRESOLVED; StyleAdjuster.cpp 391-410, StyleDifference.cpp 428-429 | source | fixes/menu-layers/README.md 26-35, 51-53; finding F-351 |

## Case 06: keep-phase

| Number | Device / driver | Source |
|---|---|---|
| Layers 158 → 152; graphics memory 27.6 → 12.4 MB (chart c6) | Sim, 1 load | fixes/g0-0h/README.md 40 |
| Re-open jump 0-0.36 → 0-0.34 px; one frame of motion 0.14-0.16 px | Sim | fixes/g0-0h/README.md 41 |
| P-169 menu-flip frame median 71 → 69 ms | iPhone W + Timeline, 3 v 3 | fixes/g0-0h/README.md 43 |
| Claim: RenderLayerCompositor.cpp 3902-3910, 3949-3951 | source | fixes/g0-0h/README.md 17-18 |

## Case 07: the people-deck blink

| Number | Device / driver | Source |
|---|---|---|
| Trigger `z(y, e.matches \|\| i / r >= 0.72, !0)`, baseline JS 11310 | code | fixes/people-blink/README.md 23 |
| Fade 0.7 s opacity, blur 1.6 s (0.9 s in g0 builds); fling ~0.5 s; 8 lazy photos | iPhone G | fixes/people-blink/README.md 23-27, 44 |
| Screen capture: 0 frame gaps > 34 ms in the fling | iPhone G | fixes/people-blink/README.md 39 |
| Flip speeds 1.04-2.89 px/ms; gate 0.8 px/ms | iPhone G | fixes/people-blink/README.md 70, 78 |
| Blurred frames per flick 52,52,51,52 → 0,0,0,0 (chart c7a) | iPhone G, P-174, tool-serious, 4 v 4 | fixes/g0-0l/README.md 279-286 |
| Fade in view 816,816,833,816 → 135,118,135,117 ms (chart c7b) | iPhone G, P-174 | fixes/g0-0l/README.md 279-286, 294 |
| Photos complete at the flick 7/26 → 26/26 | iPhone G, P-174 | fixes/g0-0l/README.md 297 |
| FLICK > 50 per run 0,0,0,0 → 1,1,0,1; limit +2 | iPhone G, P-174 | fixes/g0-0l/README.md 289 |
| Reveal frame dt 35-41/42-47 → 44-51/49-60 ms; Paint +6-9; Composite +6-12 | iPhone G, P-174 | fixes/g0-0l/README.md 305-312 |
| Chrome desktop resampling up to 0.80 % | Chrome | fixes/g0-0l/README.md 130 |
| Claims: ScrollDrivenAnimationsEnabled stable from safari-7622 (CONFIRMED); threaded on 26.6.1 UNRESOLVED | source | fixes/people-blink/README.md 80-83 |

## Case 08: heat

| Number | Device / driver | Source |
|---|---|---|
| Corrected slopes °C/min, session 1 / 2: floor −0.085 / −0.105; apple.com +0.055 / −0.013; original +0.620 / +0.400; with fixes +0.192 / +0.238 (chart c8) | iPhone W | research/phone-heat/README.md 361-364 |
| Excess over floor ratio 5.0 / 5.5 | iPhone W | research/phone-heat/README.md 372 |
| Fixes removed 61 % / 32 % of the excess | iPhone W | research/phone-heat/README.md 380 |
| Routine: 6 min segment, 180 s idle, battery held 80 % | iPhone | research/phone-heat/README.md 74-80, 337-341 |
| GPU animation 25-35 % slower; CPU loop same (n = 3) | iPhone | research/serious-heat/README.md 16-19, 53-54 |
| 30 ms timer grid; setInterval 1000 → 1020 ms; skip every ~50 s | source + iPhone | research/serious-heat/README.md 50, 52, 33 |
| rAF halving off by default (a8c0b8f); high frame rate off under heat (Apple docs) | source / docs | research/serious-heat/README.md 51, 55 |
| Slow moving frames 17 % / 7 % / 1 % by time after load | iPhone G, P-124, 8 runs | research/serious-heat/README.md 24-28 |
| Sentinel ≥ 58 fps bottom, ≥ 44 fps scroll; void rule; cooling to last pass − 0.5 °C | iPhone | measurement-protocol-v2.md 287-296, 313-316 |

## Case 09: reading a result

| Number | Device / driver | Source |
|---|---|---|
| CPU microbenchmark iPhone 261 ms vs Chrome 1x 255 ms | iPhone / Chrome | research/cpu-throttle-calibration/README.md 29 |
| Calibration table, > 34 / > 50 / worst / distance (iPhone 15.7 / 5.7 / 104; 4x 3.3 / 0.7 / 52 / 0.60; 6x 12.3 / 5.0 / 89 / 0.17; 20x 108.3 / 97.7 / 428 / 13.18) | iPhone S-like scripted scroll / Chrome | research/cpu-throttle-calibration/README.md 51-58 |
| 198,349 phone gaps, no peaks at 33.3 / 50 | iPhone | measurement-protocol-v2.md 26, 171-173 |
| rAF stamp claims (Document.cpp l.8959, Page.cpp 2424-2428); 60 Hz hint pref; ~80 Hz finger stretches | source / iPhone | measurement-protocol-v2.md 163-170 |
| Screenshot A/A noise 0-0.4 %; "better" needs non-overlap over ≥ 3 runs | Chrome | CLAUDE.md "Reading results.json" |
| Frames > 20 ms ~66 at load < 6 vs 96-103 at load 6-15 | Chrome | fixes/FINDINGS.md 59 |
| 4 v 4 exact one-sided p = 1/70 | stats | measurement-protocol-v2.md 321-323 |
| Passive touchmove measured flat 52.7 vs 52.5 fps | iPhone S | fixes/FINDINGS.md 61 |
| Blind MutationObserver: 0 vs 11 notes | Chrome | fixes/FINDINGS.md 41 |

## Case 10: GIF frame timing

| Number | Source |
|---|---|
| 20 ms per frame (50 fps), 180 frames per 3.6 s loop, late frames held 40-60 ms; 30/30/40 ms delays for 30 fps clips | research/team-article/capture/medium-visuals.mjs 24-31; commit c203f5ab |
| GIF delay in 1/100 s | GIF89a specification §23 "Delay Time", https://www.w3.org/Graphics/GIF/spec-gif89a.txt (read 2026-10-09) |
| WebKit: delay < 11 ms plays as 100 ms | WebKit main e6eb9ebd41d6, Source/WebCore/platform/graphics/cg/ImageDecoderCG.cpp 591-596 (read 2026-10-09 via gh) |
| Chromium: delay ≤ 10 ms plays as 100 ms | Chromium main 6140d18317bf, third_party/blink/renderer/platform/graphics/deferred_image_decoder.cc 301-306 (read 2026-10-09 via gh) |

## Builds named

g0.0f, g0.0h, g0.0i, g0.0j, g0.0k, g0.0l, v9-final: fixes/BEST_BUILDS.md 6-29. Proposal numbers (PR-017, PR-030,
PR-039, PR-040, PR-041) and phone block numbers (P-068, P-093, P-124, P-157, P-169, P-170b, P-172, P-173, P-174) are the
study's own ids; their records are in the files cited above.
