# Headless Chrome at 60 Hz as a timing setting (cal-headless60, 2026-10-02)

> Personal, educational study on a local mirror of https://fastwork.com/ (not affiliated with Fastwork).

**Asked by the user** (console T-008, 2026-10-02 04:52 +07): "no need to test it on 120 fps, just 60 fps would be ok …
start now". This is an explicit exception to the timing deferral, for this calibration only.

**Questions.**
1. Can headless Chrome (60 Hz here, F-091) stand in for the calibrated headed setting (430x932 DPR 3 touch, CPU 6x,
   120 Hz) for scripted-scroll jank counts? Which CPU factor matches the phone?
2. Does it see a known win the way the headed A/B and the phone do?
3. Can two (or three) timing runs share the machine?

## Plan (written before any data)

**Tool.** One-off `tools/h60.mjs` here. It does not change `verify.mjs`, `fix.mjs ab` or `lib/cdp.mjs` (they refuse
headless on purpose); it imports `lib/cdp.mjs`, `lib/perf-page.mjs` and `lib/host.mjs` read-only. Per run it drives
the exact `verify.mjs` sequence: fresh isolated context, Network/Log enable, mobile 430x932 DPR 3 + touch + focus
emulation, the same rAF + LoAF logger injected before page scripts, load + 2 s quiet, 1.5 s settle, throttle, 1 s,
idle 6 s at the top, the same `scrollBy({top:250, behavior:'smooth'})` every 300 ms to the bottom (+0.5 s), the same
4 touch `synthesizeScrollGesture`s past the end (+2 s), no screenshots. Headless is pinned like `check.mjs`: UA override
(`HeadlessChrome/` → `Chrome/`, so Hotjar loads) and `--screen-info={0,0 1512x982 devicePixelRatio=2}`.
Extra per run, outside every phase window: a fixed JS loop timed at rate 1 (before the throttle) and at the run's rate
(after the morph phase), to show the throttle applies headless and how hard (C7 in headless-functional.md was
UNRESOLVED). Host per run: load1 at start/end, host CPU busy % (kernel ticks, `lib/host.mjs snapshot`) and the
measured Chrome tree's CPU over the scroll phase, free memory, memory pressure.

**Metrics** (scroll phase, also idle and morph): ms thresholds >34 and >50 (verify's columns) with the phone's
±4 ms twins (>30/>38, >46/>54), >20, >100, worst, p95, fps, LoAF ms; 60 Hz ticks k = round(dt / 16.667) with
k≥3 (dt ≥ 41.7 ms) as the ">34" analog and k≥4 (dt ≥ 58.3 ms) as the ">50" analog, plus the k histogram. Note in
advance: at 60 Hz the ms thresholds 34 and 50 sit right next to the 2- and 3-vsync grid lines (33.3, 50.0), so ms
counts there can be threshold-sensitive in a way the 120 Hz grid is not; the twins and the k counts show it.

**Phone reference** (scripted scroll S, same scrollBy sequence, 60 Hz, ms thresholds):
- `research/cpu-throttle-calibration/iphone.md`: live site, 3 runs: >34 15.7 (13-18), >50 5.7 (4-7), >100 0.7, worst 104.
- `fixes/iphone-wave2/README.md` §1 (local mirror, `--vendors=local --latency 150`, the current serving): baseline
  >34 16 [13-39], >50 5 [5-13] (B1 an outlier: 13-16 / 5 without it); aw1-10c >34 9 [9-10], >50 3 [2-3].

**Steps.**
1. Calibrate on the baseline: CPU 4x / 6x / 8x interleaved in one Chrome (order rotated per round), n=5 each, in two
   holds. Pick the factor whose scroll-phase >34 / >50 medians sit closest to the phone's (distance as in the 2026-09-30
   calibration: mean relative difference with +1 smoothing); add a bisection point if the answer falls between.
2. Validity, at the chosen factor, n=5 per arm, alternating ABBA:
   - **gain check: baseline vs aw1-10c** (all-wave1 + scroll-engine /10c). The phone saw it (above); headed Chrome saw
     it as two stacked A/Bs (`fixes/all-wave1/results.json`: >20 ms 25→13, fps +18 %, LoAF −32 %;
     `fixes/se10c-aw1/results.json`: >50 2→1, LoAF −49 %).
   - **rotator-st6** (asked by the lead; dropped, see "Changes to the plan"): aw1-10e vs aw1-10e + st6. Its phone win is WebKit-only and in the idle phase
     at y 1500 (W1 in claims-audit: Blink does not pay for the opacity flip; the phone's scroll phase is unchanged in
     every arm, `fixes/layout-containment/README.md`). Prediction: headless-60 shows no scroll-phase change, like headed
     Chrome would. It is a null control here, not a gain check.
3. Parallelism: A/A of the baseline (two servers of the same snapshot per process, 3 runs per arm, alternating)
   with 1, 2 and 3 headless timing processes at once, each with its own servers, profile and Chrome, all inside my one
   exclusive hold. Compare medians and spread to solo, count A/A false positives (disjoint ranges), record host load.
4. Holds: every timing run inside one exclusive `lock.mjs run chrome-measure --owner cal-headless60 --max-seconds 600`,
   ≤ 10 min each, requeued between holds. Servers per CLAUDE.md (`--vendors=local --https --latency 150`, port 0) inside
   the hold. Scratch in this worktree's `out/h60/`; no screenshots are taken.

**Changes to the plan, made during the work.**
- The lead's scoring rule (2026-10-02): at 60 Hz, score in vsync ticks, k = round(dt / 16.667). k≥3 is the ">34"
  equivalent and k≥4 is a clean ">50". The legacy ms columns stay for one wave. A verdict that differs between the
  two is "threshold-sensitive".
- Sample sizes came out smaller than planned to keep holds at 10 min or less: 3 runs per factor per hold (6x and 8x: n=6
  pooled over calA and calB; 7x: n=7 with the gain hold's baseline arm), and n=4 per arm in the gain check.
- 4x was stopped at n=3: 1 frame >34 against the phone's 13-16. Its runs went to a 7x bisection point.
- The rotator-st6 null control was dropped, agreed with the lead. Its cost is WebKit-only, so no Chrome mode can show
  it in the scroll phase.
- The parallel A/A ran one arm per process (3 runs each), not two, to fit the last hold.
- In total there were three exclusive holds:

  | hold | time (Z) | what ran |
  |---|---|---|
  | calA | 22:14-22:18 | calibration |
  | calB | 22:34-22:38 | calibration |
  | final | 22:43-22:50 | gain check, c2, c3 |

  The final hold lasted 431 s.

## Answer

1. **Headless at 60 Hz reproduces headed 6x on the scroll-phase >34 / >50 medians at the same factor, with a wider
   spread.** It sees a known win in the same direction and at about the phone's relative size. In our setup it is a
   **count-equivalent** setting at **CPU 7x** against the phone's scripted scroll S. It is not a timing replacement:
   fps, >20 ms, LoAF ms and every ms duration mean something different at 60 Hz (§2). Status: **OBSERVED** (our data
   only, one host, one day, small n).
2. **Chosen factor: 7x.** The phone's k≥3 lies between headless 7x and 8x, and its k≥4 matches 6x. 7x is the best
   compromise on the goal-metric pair (ms-form distance 0.35, against 6x 0.42 and 8x 0.38). On the tick form, 6x and
   7x tie (0.28 / 0.33). No factor reproduces the phone's single >100 ms frame (the y ≈ 1960 morph-edge frame, about
   half of it Composite, F-044 / F-082, a WebKit cost).
3. **Parallel timing runs: not shareable. Cap 1 (exclusive), as for headed.**
   - With 2 or 3 headless timing processes at once, the A/A counts moved up by about one k≥4 tick (3 → 4-4.5), and k≥3
     by +14 to +80 %. That is the size of the aw1-10c effect itself (k≥4 3 → 1).
   - The 3-process run took the host to load1 10-11 (I-017 "contaminated").
   - The spread did not widen, because the processes ran in lockstep.

## 1. Calibration: CPU 4x / 6x / 7x / 8x on the baseline

Setup:
- Chrome 154.0.8037.93 headless, with the UA override (Hotjar loads: `hj` is a function in every run) and
  `--screen-info` DPR 2.
- 430x932 DPR 3 with touch. Every run had scrollHeight 6240, 0 console errors and the morph reached.
- Factors rotated per round within each hold. Load1 at run start was 3.7-7.5. Host busy over the scroll phase was 31-82 %;
  other agents' shared jobs were running. The measured Chrome tree used 15-16 % of the 8 cores, about 1.25 cores.

Scroll phase, median [min-max] per factor (7x pools calB with the gain hold's baseline arm). Data:
`data/calA.json`, `data/calB.json`, `data/gain7.json`. Tables: `node tools/analyze.mjs data/calA.json data/calB.json --md`.

| factor | n | **k≥3** (>34 eq.) | **k≥4** (>50 eq.) | legacy >34 | legacy >50 | >100 | worst ms | fps (60 Hz) | dist ticks | dist ms |
|---|---|---|---|---|---|---|---|---|---|---|
| 4x | 3 | 1 [1-1] | 0 [0-0] | 1 | 0 [0-1] | 0 | 50 | 59.3 | 0.63 | 0.69 |
| 6x | 6 | 5.5 [4-8] | 2 [1-4] | 5.5 [4-8] | 3 [1-5] | 0 [0-1] | 83.4 [66.7-100.1] | 55.8 | **0.28** | 0.42 |
| **7x** | 7 | **7 [5-13]** | **3 [3-5]** | 7 [5-13] | 4 [3-7] | 0 [0-1] | 83.3 [83.3-166.7] | 55.4 | 0.33 | **0.35** |
| 8x | 6 | 19.5 [11-32] | 6.5 [4-10] | 19.5 [11-32] | 8 [4-13] | 2 [0-3] | 133.3 [100-166.7] | 43.7 | 0.78 | 0.38 |

**Phone S reference** (`tools/phone.mjs`): `fixes/iphone-wave2/raw/goal-B2/B3`, baseline on the mirror, 2026-10-01
06:5xZ.

| metric | phone value |
|---|---|
| >34 | 13 / 16 |
| >50 | 5 / 5 |
| k≥3 | 10 / 9 |
| k≥4 | 2 / 2 |
| >100 | 1 / 1 |
| worst | 112 / 113 ms |

B1, the first load and an outlier, is excluded: >34 39, k≥3 20. The 2026-09-30 live-site calibration gave >34 15.7 and
>50 5.7.

**Distance** uses the calibration's formula: mean relative difference with +1 smoothing. The tick form uses k≥3, k≥4,
>100 and worst; the ms form uses >34, >50, >100 and worst.

Readings:
- **The steep part is between 6x and 8x.** k≥3 goes from 5.5 to 19.5, with the run-to-run range widening from [4-8]
  to [11-32].
- **The same factor differs from hold to hold.** 7x had k≥3 11 [6-13] in calB and 7 [5-9] in the final hold, 9 min
  later. Load1 was 4.4-5.1 against 3.7-4.5. A factor choice finer than about ±1x is not supported by this n.
- **The throttle applies headless** (C7 in headless-functional.md was UNRESOLVED). A fixed in-page JS loop, timed at
  rate 1 and then at the run's rate outside the phases, slowed:
  - 4.1x at 4x;
  - 4.9x at 6x (calA: 5.9);
  - 5.1x at 7x;
  - 6.2x at 8x (calA: 8.4).

  The ratio drops when the host is busier. It is a wall-time ratio, so contention dilutes it. Status: OBSERVED that it
  applies. This is consistent with the throttler's source having no mode condition (claims-audit C5 cites
  `thread_cpu_throttler.cc`), which was not re-read for this study.

**Headless 6x against headed 6x.** On `fixes/all-wave1/results.json` baseline side (n=5, quiet host, load1 1.8-2.7),
headed had >34 5 [4-6] and >50 3 [2-4]. Headless 6x had 5.5 [4-8] and 3 [1-5]. So the medians agree and headless
spreads wider. Two side notes:
- Headed 6x on current tools sits well below the mirror phone's >34 (5 against 13-16). The 2026-09-30 calibration
  matched 6x on the live site with the pre-I-002 tools.
- So the CLAUDE.md "6x reproduces the iPhone's scripted-scroll counts" may be optimistic for >34 on the current
  serving. This is OBSERVED, from cross-session numbers only; the decisive check is a headed 6x/7x/8x sweep in one hold
  against the same phone runs.

## 2. Why the ms lines don't work at 60 Hz headless

Every one of the 1,283 scroll-phase frames over 20 ms in the calibration and gain holds (calA, calB, gain7) lies on the 16.67 ms grid, within ±3 %.
Worst frames are exactly 50.0, 66.7, 83.3, 100, 116.7, 133.3 or 166.7 ms. Status: OBSERVED in our setup. The headless
compositor clocks frames at 60 Hz, with no real display (C11).

References:
- `components/headless/screen_info/headless_screen_info.h` has no refresh-rate field. The `--screen-info` keys are
  colorDepth, devicePixelRatio, isInternal, label, workArea*, rotation.
- `ui/display/display.h` has `display_frequency_ = 0` by default.
- `components/viz/common/frame_sinks/begin_frame_args.h` has `DefaultInterval()`, "the default interval assuming 60Hz"
  (= 1 s / 60).

All three were read 2026-10-02 on chromium main. They are consistent with a 60 Hz default when nothing sets a display
rate, but the code path from headless to that default was not traced. So the reason for 60 Hz stays **UNRESOLVED**.
The decisive local check would be `--screen-info` with a refresh key, if one exists in a later Chrome, or a viz trace
of the BeginFrameSource interval.

Consequences, all OBSERVED:
- **>34 ms = k≥3 exactly.** No frame falls between 33.3 and 41.7 ms. The ±4 ms twins >30 and >38 split as ">20 ms"
  and ">34": >30 counts every 2-vsync frame.
- **Legacy >50 sits on the 50.0 ms line.** A 3-vsync frame stamps 50.0-50.1 ms, so >50 counts sub-ms jitter (e.g. 4x:
  0 [0-1] with worst 50.0-50.1). k≥4 (≥ 58.3 ms) is the clean ">50". In this data no A/B verdict flipped between >50
  and k≥4, but single runs differ by 1-2.
- **>20 ms, fps, p95, LoAF ms and forced ms are 60 Hz quantities.**
  - Every missed vsync is 33.3 ms, so >20 = every late frame.
  - fps is capped at 60.
  - Fewer frames carry more scroll per frame. Headless 6x LoAF was 317 ms against headed 6x 170 ms, and forced 74 ms
    against 28 ms.

  None of these compare with headed or with older results.
- **The phone is 60 Hz too, but its 1 ms stamps are not vsync-quantized** (claims-audit §2.3). So phone >34 counts
  35-41 ms frames that headless can only show as 33.3 or 50. The phone's k≥3 (9-10) is the closer twin of headless
  k≥3, not its >34 (13-16).

## 3. Validity: a known win (baseline vs aw1-10c) at 7x

aw1-10c is `all-wave1` + `scroll-engine` /10c, built here with `fix.mjs combine`.
- Served JS 757e2cbc / CSS c6aad94b, the same bytes the phone measured (iphone-wave2).
- Each overlay file passed a served-file check: it came from the overlay, with the overlay's bytes.
- n=4 per arm, ABBA, one Chrome, load1 3.7-5.9.
- Both arms had 0 errors and the morph reached.

| scroll phase | headless 7x baseline | headless 7x aw1-10c | change | ranges |
|---|---|---|---|---|
| **k≥3** | 7 [5-9] | 3 [2-3] | −57 % | disjoint |
| **k≥4** | 3 [3-5] | 1 [0-1] | −67 % | disjoint |
| legacy >34 / >50 | 7 / 4 | 3 / 1 | −57 / −75 % | disjoint / disjoint (same verdicts as k: not threshold-sensitive) |
| >100 | 0 | 0 | | overlap |
| worst | 83.3 | 66.7 | | overlap |
| LoAF ms | 279 [268-470] | 106 [81-128] | −62 % | disjoint |

How the other two settings saw the same change:
- **Phone S** (iphone-wave2 goal B2/B3 against P1-P3, `tools/phone.mjs`): >34 14.5 → 9 (−38 %), >50 5 → 3 (−40 %),
  k≥3 9.5 → 5 (−47 %), k≥4 2 → 1 (−50 %). All disjoint, as was the README's verdict.
- **Headed 6x** has no single A/B of baseline against aw1-10c. The two stacked A/Bs give:
  - `all-wave1`: >34 5 → 5, >50 3 → 2, both within noise; >20 25 → 13 and LoAF −32 %, both disjoint.
  - `se10c-aw1`: >34 4 → 3 within noise, >50 2 → 1 disjoint, LoAF −49 %.

  Chained, that is >34 about 5 → 3 and >50 about 3 → 1, with only one of the four goal-count steps disjoint.

**So headless 7x saw the win in the same direction as both.** Its relative size on the counts (−57 / −67 %) is a bit
larger than the phone's (−38 to −50 %). It separated the arms more cleanly than the headed chain did on >34. One win
is not a validation of the setting, so this stays OBSERVED.

**Not checked** (rotator-st6, dropped with the lead): a WebKit-only cost should show no change headless. A null
control remains the open validity check; any rotator-free WebKit-only fix would do. Headless, like headed Chrome,
cannot see WebKit amplifiers, the finger case or raster/GPU cost (C5).

## 4. Parallelism: A/A with 1, 2 and 3 headless timing processes

Each process had its own two-server pair (`--vendors=local --https --latency 150`), its own profile and its own Chrome.
All ran at 7x on the baseline inside my one exclusive hold.
- **Solo:** the 7x baseline runs from calB and the gain hold, n=7, two holds. Load1 3.7-5.1, host busy 38 %.
- **c2:** 2 × 3 runs, 22:47Z.
- **c3:** 3 × 3 runs, 22:49Z.

Data: `data/par2-p*.json`, `data/par3-p*.json`.

| condition | n | k≥3 | k≥4 | legacy >50 | fps | LoAF ms | load1 at start | host busy (scroll) | in-page spin factor |
|---|---|---|---|---|---|---|---|---|---|
| solo | 7 | 7 [5-13] sd 2.9 | 3 [3-5] sd 0.8 | 4 [3-7] | 55.4 | 283 | 3.7-5.1 | 38 % [33-45] | 5.1 |
| c2 | 6 | **12.5 [9-14]** sd 1.9 | **4.5 [4-5]** sd 0.5 | 5 [4-7] | 49.5 | 399 | 4.2-6.2 | 59 % [56-61] | 7.5 |
| c3 | 9 | 8 [6-11] sd 1.5 | **4 [4-5]** sd 0.3 | 4 [4-5] | 52.3 | 383 | **10-11.2** | 70 % [68-81] | 6.9 |

Per process, k≥3 / k≥4 per run:

| process | runs | wall |
|---|---|---|
| c2 p1 | 9/4, 13/5, 12/5 | |
| c2 p2 | 13/5, 14/4, 10/4 | |
| c3 p1 | 11/4, 7/4, 7/4 | 93 s |
| c3 p2 | 8/4, 6/4, 8/5 | 93 s |
| c3 p3 | 8/4, 10/4, 8/4 | 93 s |

Readings, all OBSERVED:
- **The level moves.**
  - k≥4 goes from 3 to 4-4.5 in both parallel conditions. Every parallel run has k≥4 ≥ 4; only 2 of 7 solo runs do.
  - k≥3's median rises by 14 % (c3) to 80 % (c2).
  - LoAF rises by 35-41 % and fps falls by 3-6.

  Neighbours shift the counts by about the size of a real fix's effect (aw1-10c: k≥4 −2).
- **The spread does not widen.** sd is even smaller, because identical processes run in lockstep (the earlier headed
  study saw the same). In a real shared lane the neighbours would be unrelated jobs out of phase, which is worse.
- **The host crosses the guard lines.**
  - c3 started every run at load1 10-11.2, which is I-017 "contaminated" (> 10).
  - Memory pressure stayed "normal" (max 1) in every run.
  - Free memory is not a signal here: the first run of every session reads low (71 MB in solo calA, 93 MB in c2,
    366-394 MB in c3) while the Chromes start, and later runs read 600-1,700 MB.
  - Headed c2/c3 numbers (research/measurement-parallelism) came from a quieter host; these came with other agents' shared
    jobs running, so absolute host figures don't compare.
- **The effective throttle depends on contention.** The in-page loop's slowdown went from 5.1 to 6.9-7.5. Under load,
  "7x" is not the same CPU. This is a mechanism for the level shift (OBSERVED; inference).
- **Caveat.** Solo and parallel were measured 5-30 min apart, and the solo set mixes two holds whose 7x levels differed
  (11 vs 7). Time and parallelism are partly confounded. c3 reads lower than c2, which no monotonic load story explains
  at this n. A clean answer would interleave c1/c2/c1 in one hold.

**Recommendation: keep timing exclusive (cap 1), headless or not.**
- Headless costs less CPU: about 1.25 cores per timing run here (Chrome tree 15.6 % of 8 cores), against about 2 cores
  headed (measurement-parallelism).
- That does not make two timing runs independent. A neighbour moves the goal counts by about one effect size.
- Functional checks (`check.mjs`) stay in the shared lane as today.

## 5. What a supported mode would need (toolsmith proposal, not built)

A `--headless60` (count-equivalent) mode for `verify.mjs` / `fix.mjs ab`. Today both refuse headless on purpose.

1. **Launch and pin.** Launch like `check.mjs`: `launchChrome({headless: true, args: [screenInfoArg()]})`, with the
   per-page `Emulation.setUserAgentOverride(headedUA)`.
   - verify's CDP sequence is otherwise unchanged. A new golden pins it.
   - The headed golden stays byte-identical.
2. **Record the mode.** Record `chromeMode: 'headless-60'` and the observed frame period: the idle-phase median, as
   `h60.mjs` and `iphone_analyze` do.
   - Refuse to compare a headless result with a headed one: ab's verdict and bench's calibration both check the mode.
   - Prefix a `CHROMEMODE-MIXED:` tag otherwise.
3. **Score in ticks at the observed period.** k = round(dt / 16.667) with k≥3 and k≥4 as the goal columns.
   - Keep the ms columns for one wave and flag a verdict that differs as threshold-sensitive (the lead's rule).
   - Drop or label >20 ms, fps, p95 and LoAF ms as "60 Hz quantities, not comparable with headed".
4. **Default factor.** Default `--cpu 7` in this mode, with this README as the calibration record. Re-calibrate it in
   one hold against the same phone S runs before relying on it, together with a headed 6x/7x/8x sweep (the open
   question in §1).
5. **Lock.** The mode stays in the exclusive `chrome-measure` lane (§4), never `--shared`. The host guard (I-017)
   applies unchanged.
6. **Spin probe.** Optionally add the in-page spin probe (rate 1 against rate N, outside the phases) as a per-run host
   signal. It shows when "7x" was really 5x or 7.5x.
7. **Tests.**
   - unit: tick scoring at 60 and 120 Hz periods;
   - fake-Chrome e2e: the headless golden, plus the refusal of mixed modes;
   - `test:chrome`: a real headless run reports a period of 16.7 ms.

   This is measurement code, so it must be called out in the commit.

## Platform claims in this study

| claim | status |
|---|---|
| Headless frames on this Mac are quantized to 16.67 ms (1,283/1,283 frames >20 ms on the grid) | OBSERVED; the 60 Hz cause is UNRESOLVED (sources above consistent, path not traced) |
| `Emulation.setCPUThrottlingRate` applies in headless | OBSERVED (in-page loop 4.1-8.4x at nominal 4-8x); consistent with the throttler source (claims-audit C5) |
| Headless 6x ≈ headed 6x on >34/>50 medians | OBSERVED (cross-session, n=6 against n=5) |
| Headless 7x ≈ phone S on k≥3/k≥4 | OBSERVED (n=7; 6x within the same distance on ticks) |
| Parallel headless timing runs shift goal counts by about one effect size | OBSERVED (n=6/9, confounded with time) |

## Files

| file | what |
|---|---|
| `tools/h60.mjs` | the one-off timing tool: verify's sequence, headless, pinned like `check.mjs`, ms + tick columns, spin probe, host per run; refuses to run without `FW_LOCK_HELD` |
| `tools/session.mjs` | servers (served-file check for overlays) + N parallel `h60.mjs` processes |
| `tools/analyze.mjs` | tables, phone distances, range verdicts with the tick/ms threshold-sensitivity flag |
| `tools/phone.mjs` | phone S logs (iphone-wave2 raw) in the same columns |
| `data/*.json` | every run: per-phase summaries, the scroll-phase frame list, host record; no screenshots, no page content beyond class names |

Reproduce (each line inside an exclusive hold, `node tools/lock.mjs run chrome-measure --owner <you> --max-seconds 600
-- …`):

```sh
node research/headless-60-calibration/tools/session.mjs --arms base= --tag calA -- --cpus 4,6,8 --runs 3
node research/headless-60-calibration/tools/session.mjs --arms base=,aw1c=fixes/h60-aw1-10c/overlay --tag gain7 -- --cpu 7 --runs 4
node research/headless-60-calibration/tools/session.mjs --arms base= --par 2 --tag par2 -- --cpu 7 --runs 3
# overlays: node tools/fix.mjs combine h60-aw1-10c all-wave1 se10c-aw1
```
