# Isolated measurement and heat: what to measure where (T-029)

arch-isolated-measure, 2026-10-03. This is a research plan and a proposed protocol change, not a signed rule. Protocol
changes go through the lead (`fixes/LEAD.md` "Stages and gates"). Nothing here was measured on the phone. One
shared-lane Chrome counts check was run (§2.4).

The question, in plain words: full-page phone runs heat the phone, and heat makes each fix hard to measure. Could we
measure only the element a fix changes, plus the elements around it, so that each test is short, cool and isolated?

Short answer:
- **Yes, for what the element itself does.** That means its callbacks, its own style, layout and paint records, its
  layers, and whether it keeps the page drawing at rest. These numbers carry over to the full page as an
  **absolute delta**, not as a ratio (§2.4). They don't need the phone at all.
- **No, for how the page feels.** Frame time and slow frames are the full page's per-frame cost (F-132, F-139). Those
  stay full-page, and the phone confirms them.
- **Heat costs us less noise than feared and more time.** In our own 179 phone runs (34-42 °C), heat did not
  measurably move scripted counts or fps within an arm (§1.2). What heat really costs is:
  - cooling and gate time;
  - the risk of a throttled state;
  - behaviours seen only when hot (P-036 B1, now P-073).

Status words follow CLAUDE.md "Platform claims": OBSERVED (our data only), CONFIRMED (cited reference),
REFUTED, UNRESOLVED.

## 1. Which numbers heat disturbs

### 1.1 Mechanisms (references)

| # | Claim | Status | Reference |
|---|---|---|---|
| H1 | iOS lowers CPU cluster frequency with workload and thermal pressure, and may take P cores away under critical thermal scenarios. | CONFIRMED | Apple Tech Talk 110147 "Tune CPU job scheduling for Apple silicon games" ("Each cluster may be independently activated or have its frequency adjusted by the kernel's scheduler -- depending on the current workload, the current thermal pressure…"). |
| H2 | The thermal states are nominal, fair, serious and critical. Serious "reduces performance". Apple advises dropping 60 to 30 FPS there. | CONFIRMED | developer.apple.com, `ProcessInfo.ThermalState` case pages. |
| H3 | Durations (ms, fps) therefore depend on heat through the clock speed. | CONFIRMED (follows from H1/H2) | as above |
| H4 | iOS has no documented way to lock CPU clocks for benchmarking. Android allows it only on a rooted device, and otherwise uses sustained-performance mode or cool-and-retry. | UNRESOLVED for iOS (no doc found); CONFIRMED for Android | developer.android.com microbenchmark overview, "Obtain consistent benchmarks". |
| H5 | WebKit halves rAF and rendering updates (to 30 Hz) for Low Power Mode, VisuallyIdle, non-interacted cross-origin frames and *AggressiveThermalMitigation*. Plain *ThermalMitigation* is not in that list. | CONFIRMED | WebKit `Source/WebCore/platform/graphics/AnimationFrameRate.cpp` L33 (`halfSpeedThrottlingReasons`), `AnimationFrameRate.h` L40-57. |
| H6 | WebKit sets ThermalMitigation when `thermalState >= Serious` (iOS only). It adds AggressiveThermalMitigation, and so halves rendering, only if the internal preference `respondToThermalPressureAggressively` is on. That preference defaults to false. | CONFIRMED for open-source WebKit; UNRESOLVED whether shipping iOS Safari turns it on | `ThermalMitigationNotifier.mm` L40; `Page.cpp` L3061-3081; `UnifiedWebPreferences.yaml` (`defaultValue: false`, `status: internal`). |
| H7 | Under Low Power Mode *or* thermal mitigation, WebKit aligns DOM timers to 30 ms (0 otherwise). Main-thread CSS and Web Animations tick at the rendering-update interval, so they are halved under Low Power Mode. | CONFIRMED | `Page.cpp` L3321-3326, `DOMTimer.h` L53-54, `DocumentTimeline.cpp` L97-103. Compositor (Core Animation) animations under throttling: UNRESOLVED. |
| H8 | Low Power Mode "may reduce CPU and GPU performance". Nothing says clocks are fixed. | CONFIRMED (that it may reduce); "Low Power Mode gives a fixed, locked slow state": REFUTED as a usable assumption (docs say "may", and WebKit changes the workload itself, H5/H7) | Apple Energy Efficiency Guide, "React to Low Power Mode on iPhones"; support.apple.com 101604. |
| H9 | Style and layout run once per document per rendering update, not per element. Per-frame counts are therefore shared by everything dirty in that frame. | CONFIRMED | HTML "update the rendering" (html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering). |
| H10 | Xcode Device Conditions → Thermal (fair/serious/critical) makes the OS behave as if hot without real heat. It "can't override the real-world level". Apple says to measure fps under Serious. | CONFIRMED | Xcode Help, "Device conditions" pages (help.apple.com/xcode/mac/current/#/devcb5763ab0, #/dev308429d42). Whether Safari then halves rendering is UNRESOLVED (H6). |
| H11 | "Work counts are thermally invariant". | UNRESOLVED: no reference says so. By H5/H7 it is false for frame-tied and timer-tied counts whenever rendering halves. | none |

WebKit line numbers are from `main`, read through the jsDelivr mirror of github.com/WebKit/WebKit, and re-checked on
`safari-7624-branch`. Copies are in the arch session's scratch, not committed.

What this means for counts:

| Kind of number | Example | Heat effect | Status |
|---|---|---|---|
| Durations | frame dt, Timeline record ms, Layout ms, fps | Moves with clock speed (H1-H3), and also with the idle-clock state of a light page (8529d59, F-146: a page with less work ran a 1 Hz Layout burst slower). | CONFIRMED mechanism; size on this page OBSERVED small in 34-42 °C (§1.2) |
| Frame-tied counts per second | style recalcs/s, IO computations/s, Layerize/s, rAF callbacks/s, spring transform writes/s, MutationObserver records per run | Proportional to the frame rate. They halve if rendering halves (Low Power Mode, aggressive thermal mitigation). They also fall when frames drop. | CONFIRMED (H5, H9) |
| Counts per frame or per animation event | style elements per tick, Layout/Paint records per countdown tick, writer calls per moving frame | Independent of the frame rate, as long as the work per event does not depend on frame timing. A spring that integrates over dt takes more, shorter steps at 60 Hz than at 30 Hz, so its per-event count still changes. | OBSERVED stable (§1.2, §2.4) |
| Structure | layer count and size, paint rects, listener coverage, which code runs, pixels | Not affected by heat unless a code path branches on frame timing or rate | OBSERVED (F-139 counts equal across arms; F-109) |
| Timer-tied counts | setTimeout/setInterval cadence | Unchanged for intervals ≥ 30 ms. Shorter timers are coalesced under Low Power Mode or thermal mitigation (H7). | CONFIRMED mechanism |
| Main frames at rest (would the page draw at all) | at-rest RenderingFrame, main frames per 400 ms | Yes or no is immune. How many follows the frame rate. | OBSERVED (F-141, F-155) |

The lead's point applies here: **normalise per frame or per animation event wherever possible, and always print the
frame count beside any per-time total.** `rafHz` already sits in every phone record. A run at 30 Hz must be flagged
and kept out of a pooled count comparison.

### 1.2 Our own data: does heat move our numbers?

The source is every phone run record with battery data in this repo's worktrees: 179 unique runs, battery 34.3-41.7 °C
at start, P-036 through P-068. The local analysis scripts are not committed; they read gitignored `out/`.

| Observation | Status |
|---|---|
| Sentinel checks: 67 of 67 passed. By start temperature: <36 °C 3, 36-38 29, 38-40 28, 40-41 6, ≥41 1. | OBSERVED |
| `rafHz` was 59 in every run. No run was flagged `lowPowerSuspect`, so no 30 Hz state was ever seen. | OBSERVED |
| Same arm and S driver, pooled over blocks (n=28, 34.7-40.7 °C): scroll fps −0.03 per °C (r −0.08), gt34 −0.03 per °C (r −0.03), mutation total cv 9 %. | OBSERVED |
| Baseline C, S driver (n=13, 37.3-39.9 °C): scroll fps −0.19 per °C (r −0.54), gt34 +1.0 per °C (r 0.46). Mean 8.3, cv 21 %, so the drift is within run noise. | OBSERVED |
| Heavy page B in P-068: at 38.8-39.7 °C (H1), scroll 53.3-53.8 fps and gt34 13-14. At 37.2-38.3 °C (H2), 53.2-54.5 fps and gt34 9-15. No trend with temperature. | OBSERVED |
| P-065 W runs: full page at 39.9-41.5 °C had gt34 1-2. Word alone at 40.3-41.7 °C had gt34 0 and 255-256 mutations, identical counts while hot. | OBSERVED |
| Trap: pooled across *arms*, W runs show scroll fps −2.1 per °C (r −0.83). That is not heat slowing the page. The heavy page B heats the phone (P-068), so it is measured hot. Temperature is an *outcome* of the arm. Within each arm the slope is flat. | OBSERVED |

Limits of this data:
- The battery sensor lags the SoC by 1-2 min and reads in 0.1 °C steps (P-068).
- The F-028 collapses (16-48 fps after about 10 min of back-to-back runs) came before battery logging.
- No run went above 41.7 °C at start.
- P-036's V collapse happened at 40.3-43.3 °C, and whether heat or the script caused it is UNRESOLVED. P-073 now
  tests that with heat held in a 40.0-41.0 °C band.

**Reading (OBSERVED, our setup):**
- Between 34 and 42 °C, heat's effect on scripted counts and fps is smaller than run-to-run noise.
- Heat matters to us in three ways:
  - (a) protocol time: cooling and temperature gates;
  - (b) the risk of entering a throttled or 30 Hz state, which we would see as rafHz or sentinel failures;
  - (c) behaviours that exist only when hot, which only a hot-held test can find.
- A fix that cools the phone (st6-rb2: B − X +0.43 / +0.16 °C/min) has a real benefit. Matching end temperatures
  would erase that benefit, so match *start* temperatures, never end temperatures.

## 2. The isolated-element harness

### 2.1 Variants

| Variant | How | Pixel position | Cost to build | Precedent |
|---|---|---|---|---|
| **M: minimal page** | A page with the same stylesheets byte for byte and the same parent chain, mounting only the component (`export { X as __fwX }` appended to the overlay, Svelte `mount`). | Same device pixels when the parent chain and offsets are kept. | 1-3 h per component | word-alone page, `fixes/illusion-accent-frames/README.md` (P-065) |
| **F: full page, rest frozen** | `*:not(<target>) { animation-play-state: paused !important }`, a wrapped `Element.animate` that returns paused animations, `svg.pauseAnimations()`. | Unchanged | Minutes; one script | F-155, `fixes/cd-roll-ca/comp-check.mjs --pause-others` |
| **H: full page, rest hidden** | Hide every sibling outside the target's ancestor chain. | `display:none` **moves the target**. In our check the hero clock moved from y 397 to y 193, and the page shrank to 1864 px. Use `visibility:hidden` (keeps layout, skips paint) or `content-visibility:hidden` on siblings to keep position. | Minutes | §2.4 |
| **HF: hidden and frozen** | Both | As H | Minutes | §2.4 |

F is the cheapest, and it reproduced H's deltas in §2.4. M is the cleanest view of one component, but it costs a
build per component. It also changes the composited layer's size (next section), so its pixels are not the full
page's pixels.

### 2.2 What it can prove

- **Mechanism**: which code runs per event, and whether a callback, writer or listener still fires (P-074 a and c, F3
  listener coverage).
- **Element-owned counts as an absolute delta per window or per event**:
  - the element's style elements;
  - its own Layout and Paint records when nothing else is dirty;
  - its layer count and size (face layers 80 → 24, countdown-faces);
  - its paint rects.
- **Whether the element keeps the page drawing at rest.** Example: F-155, Chrome ULT per 4 s, base 108 vs build 41;
  Sim frozen RenderingFrame per 4 s, base 111/114 vs build 55/57.
- **Pixel identity of the element's own pixels**, under the same parent chain and position (word-alone design).

### 2.3 What it cannot prove

- **Frame time, slow frames or fps gains.** Per-frame cost belongs to the full page. F-132 (Chrome): the accent word's
  own work is about 15 % of a draw. The rest is page-wide Layerize, IO and PrePaint, about 8 ms per frame at 6x on the
  full page against about 1.4 ms on the word-alone page. F-139 (phone): the word alone had 0 slow frames, while the
  full page brought them per frame, not per record.
- **Anything per rendering update that merges with the rest of the page (H9).** Examples: P-074 (b), whether V's
  hand-over frames add more than 1 RecalculateStyles or any Layout or Paint, and F3's B1 collapse. In §2.4 the
  full-page Layout and Paint deltas (−29 / +57 per 4 s) did not match the isolated ones (+4 / +8).
- **Raster and composite costs that depend on layer size or neighbours.**
  - F-139: WebKit renders the title about 1 % differently alone (max 8/255), because its composited layer is 5x larger
    on the full page (393x459 vs 393x92).
  - F-165: slow end-panel Composites are full repaints of 80 face layers. A reduced panel would keep those 80 layers
    and look representative when it is not (fix-nav-morph's caution).
- **Ratios.** An isolated V/C ratio overstates the full-page change: styleElements V/C was 0.20 hidden but 0.65 on the
  full page, for the same absolute delta (§2.4).
- **Touch, toolbar, bounce and finger behaviour**, and anything seen only when hot.
- **Isolated ms on the phone.** A light page may run at a lower CPU performance state. That is the clock-down
  hypothesis, 8529d59 and F-146: the mechanism is CONFIRMED (H1), its size here UNRESOLVED. Isolated ms could
  therefore read *slower* than the same work on the full page. Don't read ms from an isolated page as a gain.
- **Pixel identity for an illusion fix.** The memory rule "illusions must be pixel-identical" is judged on the full
  page, because of F-139's layer-size difference.

### 2.4 Feasibility check (Chrome, counts only)

Setup:
- One shared-lane hold on 2026-10-03, `--weight probe`, about 3 min including the queue.
- Headless Chrome 154, CPU 1x, 430x932 DPR 3 mobile with touch, y 0.
- One page load per build and mode, with a 4 s trace window.
- C = baseline (JS 4606120cf392). V = countdown-faces X1 V (JS 638b8e03e81c).
- Script: `iso-check.mjs`. Raw counts: `iso-check-2026-10-03.json`.
- n=1 per cell, so this is a feasibility check, not a result.

| per 4 s | C full | V full | Δ full | C freeze | V freeze | Δ | C hide | V hide | Δ | C h+f | V h+f | Δ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main frames | 241 | 240 | −1 | 149 | 150 | +1 | 109 | 109 | 0 | 108 | 108 | 0 |
| countdown FunctionCalls | 108 | 108 | 0 | 110 | 111 | +1 | 113 | 110 | −3 | 112 | 112 | 0 |
| style elements (UpdateLayoutTree) | 2483 | 1621 | **−862** | 1158 | 332 | **−826** | 1050 | 210 | **−840** | 1040 | 212 | **−828** |
| Layout | 138 | 109 | −29 | 63 | 67 | +4 | 0 | 4 | +4 | 0 | 4 | +4 |
| Paint | 495 | 552 | +57 | 118 | 124 | +6 | 0 | 8 | +8 | 0 | 8 | +8 |
| Layerize / PrePaint (= frames) | 241 | 240 | | 149 | 150 | | 109 | 109 | | 108 | 108 | |
| IO computations (2 per frame) | 482 | 480 | | 298 | 300 | | 218 | 218 | | 216 | 216 | |

What it shows:
- **Element-owned counts transfer as an absolute delta.** The style-element saving is −826 to −862 in every mode, a
  spread of 4 %. The countdown's own calls are equal across modes. The ratio does not transfer (0.20 hidden vs 0.65
  full).
- **Page-wide, frame-tied counts belong to the page.**
  - Frames went 241 → 149 → 109 as the rest was frozen and then hidden.
  - Layerize, PrePaint and IO track frames one to one, two to one for IO.
  - The countdown's frames are the 108 left at hidden+frozen, about one per countdown rAF.
- **Layout and Paint deltas did not transfer to the full page.**
  - Frozen and hidden agree: +4 Layout and +6/+8 Paint, about 1 Layout and 2 Paints per tick, all from V.
  - The full page shows −29 Layout and +57 Paint. With n=1 we can't tell whether that is the rest of the page's phase
    noise or a real interaction, which H9 makes possible.
  - Telling those apart is exactly what the pilot (§4.3) must do.
- **Freeze (F) gives the same element deltas as hide (H)** without moving anything. F is the default variant.

### 2.5 Per topic (owners' answers, 2026-10-03)

| Topic | Harness fits | Stays full-page |
|---|---|---|
| cd-strip | The strip's own style, layout and paint per tick; layer census; pixels at the same position. | Frame cost; end-panel clock composites (F-165). |
| cd-roll-ca | Already uses F (`comp-check.mjs --pause-others`): ULT per 4 s and main frames at rest. Main frames don't reach 0 when frozen (3.4-6.0 per 400 ms from timers and IO). | Phone confirmation; Sim windows ≥ 4 s within one session. |
| countdown-faces | Face-layer count (80 → 24), per-tick records; the §2.4 style-element delta. | X1's row-1 L+P+C ms did not separate (C 1029-1065 vs V 1014-1101). Don't chase ms in isolation. |
| hero-exit-threaded (P-074) | (a) and (c): writer calls on moving frames; the hero's own getAnimations and style records. | (b): extra RecalculateStyles, Layout or Paint in hand-over frames (H9). |
| platform-idle | Not needed: the full-page census at y 5346 plus frozen-frame crops already isolate it. | Everything (it is about the whole page at rest). |
| nav-morph (F3) | Functional half (listener coverage, prevented touchmove shares, v1c pin exposure) could run reduced. Not needed, since full-page Sim counts are clean (`pinhold-sim.mjs`, `v1c-count.mjs`). | Timing half (B1 collapse, P-073), and the panel's composite cost (F-165). |

## 3. Heat-robust phone options

Phone time below assumes:
- about 1 min per S run and about 2.5 min per W run;
- cooling after Newton's law with k = 0.045/min to a parked floor of about 32.5 °C (P-068), so 40 → 37 °C takes about
  11 min and 39 → 38 °C about 4 min.

| Option | Phone time | What it buys | What it does not buy | Status / note |
|---|---|---|---|---|
| **O1. Temperature-matched interleaving.** Each run *starts* inside one band (for example 38-39 °C, or P-073's 40.0-41.0 °C). Arms interleaved C V V C. | Gate waits of 0-4 min per run. P-073 caps 14 runs at 100 min. | Removes heat as a between-arm confound while keeping the cooling benefit (start matched, end free). | Absolute numbers for other bands. | Already the P-073 design. Recommended as the default phone block. |
| **O2. Short runs with forced cooling.** Cool to a fixed start (for example ≤ 37 °C) before each run. | About 4-11 min cooling per run, so 4-6x the run time. | Cold-start numbers. | A real-use state, since the page heats the phone in use. F-042: cold first runs are slow, so a warm-up is still needed. | Not recommended as the default. §1.2 shows heat in 34-42 °C is within noise, so the cooling buys little. |
| **O3. Counts and Timeline records instead of fps.** Per-tick Layout, Paint and Composite record counts; layer census; mutation counts per event. | Same runs; Timeline attribution runs come after the end sentinel (§5.2). | Numbers that don't depend on clock speed (§1.1), comparable across temperatures within the 34-42 °C seen. | A gain in smoothness. Record *durations* are still ms, so they are heat-affected. | Recommended for mechanism and confirmation on the phone. Flag any run with rafHz < 55. |
| **O4. Low Power Mode as a fixed slow state.** | Same runs. | Nothing stable: clocks are not documented as locked (H8). | WebKit halves rAF, rendering and CSS animation ticks and coalesces timers (H5, H7), so the page does different work. | REFUTED as a calibration method. Only useful for a separate "Low Power Mode users" question. |
| **O5. Xcode thermal condition "Serious".** The phone behaves as if hot without real heat. | About 10 min once to test, then the same runs. | A reproducible hot state, so hot-only behaviours (P-036 B1) could be tested without waiting for real heat. | A cooler phone: the real temperature still adds (H10). | Promising. UNRESOLVED whether Safari then runs at 30 Hz (H6). Decisive check: one rafHz and sentinel run under Serious. Needs Xcode's device pairing and the user's OK. |
| **O6. Simulator for counts.** | 0 phone time. A shared-lane slot (weight 3, ≤ 300 s) per session. | WebKit's own record structure, layer census and frozen-frame RenderingFrame counts (F-109, F-155). | ms or fps (F-083: about 1.4x slower CPU; F-084: no gain claims), GPU or raster, finger. Compare only within one session and use ≥ 4 s windows (I-082 background CPU storm; 1 s windows swing 40 vs 28). | Recommended rung between Chrome and phone. |
| **O7. Temperature as a covariate in analysis.** | 0 | Detects a heat trend inside a block from the logged battery start temperature, per arm. | Causation, because the battery lags the SoC. | Free; add it to block readouts. |

## 4. Recommended protocol (proposal)

### 4.1 Which question goes where

```
R/I (what code, what records)        → F: full page, rest frozen (Chrome counts; Sim counts)   [no phone]
D  (attribution: does V remove X?)   → full page Chrome counts + full page Sim counts           [no phone]
     ...with an isolated prediction checked against the full page once per topic family (§4.3)
V  (does it hold on the device?)     → phone, one O1 block, O3 counts + ms thresholds           [short]
Feel / touch / toolbar / hot-only    → phone full page (G or F driver; P-073-style band)        [as today]
```

### 4.2 Decision rules

1. **Element-owned metric** (calls, the element's style, layout and paint, its layers, at-rest frames it causes):
   - measure it on F (rest frozen) in Chrome and the Sim, with n ≥ 3 page loads per arm and an A/A pair for spread;
   - report the **absolute delta per event** (per tick, per roll, per moving frame), never a ratio.
2. **Before a harness delta stands in for the full page**, the full page must show the same delta within its own noise.
   Check this once per topic family (the pilot does it for the countdown), then spot-check one arm per new build.
3. **Stays full-page:**
   - frame time and slow frames;
   - anything counted per rendering update where other work merges in (H9: P-074 b, F3 B1);
   - Composite and raster costs that depend on layer size or neighbours (F-139, F-165);
   - pixel identity of illusions;
   - touch, toolbar and bounce;
   - hot-only behaviour.
4. **The phone confirms; it does not explore.**
   - One O1 block per question, with arms interleaved and the start-temperature band logged.
   - O3 counts per tick beside the ms thresholds.
   - An fps difference smaller than the within-arm noise in §1.2 is no claim.
5. **Normalise.**
   - Per event for element counts; per frame for page-wide counts.
   - Print the frame count and rafHz beside any per-time total.
   - Leave out runs at rafHz < 55 (Low Power Mode or thermal), and say how many were left out.
6. **Heat.**
   - Log start and end battery temperature (already done).
   - Match start temperatures, not end temperatures.
   - Add the per-arm temperature covariate (O7) to every phone readout.
   - Hot-only questions get a hot-held band (P-073), or O5 once it is verified.

What this changes for phone time:
- The exploratory phone blocks (R/I/D), which today go to the phone when Chrome can't answer, move to Chrome and the
  Sim, mostly using F.
- The phone keeps V confirmation (one block of about 8 counted runs plus warm-up and sentinels, 20-40 min) and the
  feel, finger and hot-only work.

### 4.3 Pilot: the countdown (cd-strip, cd-roll-ca, countdown-faces)

**Question.** Does the frozen-rest harness F predict the full-page change in countdown-owned counts?

**Builds:**
- C = baseline;
- countdown-faces X1 V (638b8e03e81c);
- the current cd-roll-ca build;
- the current cd-strip build (each owner names it).

**P1. Chrome, two shared-lane holds of ≤ 300 s (probe weight).**
- 3 page loads per build and mode (full, F), 4 s windows at y 0, plus an A/A pair (C vs C).
- Counts: countdown FunctionCalls, style elements, Layout, Paint, main frames, Layerize.
- Per tick: the window is cut at countdown second boundaries.

**P2. Simulator, one shared slot (weight simulator, ≤ 300 s), one session.**
- Same builds, F vs full.
- Counts: RenderingFrame, Layout, Paint and Composite records per tick, plus the layer census (face layers).
- 4 s windows, compared within the session only (I-082).

**Falsifiable check** for each element-owned count and each build (V − C):
- **PASS:** the full-page delta lies within F's delta ± max(15 %, 2 × the full-page A/A spread), with the same sign.
- **FAIL:** two or more of the three builds miss on any element-owned count in either engine. Then the harness does not
  predict the full page for this family, and rule 2 means full-page counts stay the default.
- Layout and Paint get the same test. §2.4's mismatch (−29/+57 full vs +4/+8 frozen) is exactly what P1's n = 3 and
  A/A spread must explain: as noise (pass) or as a real interaction (fail for those counts).
- **Prediction written now:** the style-element delta passes (§2.4: 4 % spread across modes). Layout and Paint are
  open.

**P3, optional, phone.** Only if P1 and P2 pass and the lead wants the third rung shown.
- One O1 block, C V V C, 2 counted runs per arm.
- Timeline attribution runs after the end sentinel.
- Checks that the per-tick Layout and Paint record delta on the phone matches P2's.
- About 30 min of phone time; no gain claim.

**Cost:**
- P1 and P2: about 15 min of shared-lane Mac time in three slots, plus about 2-3 h of agent time.
- P3: about 30 min of phone time, or 0 if skipped.
- The pilot ends with a short readout appended to this README.

### 4.4 Pilot readout (P-075, 2026-10-03)

The plan was amended before any data; the record is in `pilot-prereg.md` (b89ec7f):
- each build is judged against its own control (Vf − C, C6 − S, V7 − C6);
- the vs-C rows are secondary and not judged;
- the Simulator runs n = 2 and judges Vf and V7 only.

Scorer: `judge.mjs` 73679603afcd. Data, scrubbed probe copies and the scorer output (`judge.json`): `p075-data/`. Re-running
`node judge.mjs p075-data` reproduces `judge.json` byte for byte.

**How it ran**
- Chrome: two shared-lane probe slots, FULL then FRZ, 3 loads per arm and mode.
  - No FRZ load was VOID: each one's clock check showed 2 changes in 3 screenshots, so the countdown kept running.
- Simulator: one functional session, ticks 4 per window (V7: 8, its roll writes twice per tick).
  - The first Sim slot was VOID because of my own harness bug: reopening a page left two tabs matching the same host.
  - This readout uses a 4th slot that replaced it. Nothing from the void slot is used.
  - Fix: each tab is parked on about:blank after its load.
- AA comes from the baseline pair (C vs C2; in the Sim, C rep 1 vs rep 2) only. The noise of S and C6 as controls is not
  covered by it. No count needed an AA flag: every AA came from both modes.

**Verdicts (judged pairs).** "Low-power" means the tolerance is so wide that the check can't see small changes.

| Engine | Count | AA | Verdict | Detail |
|---|---|---|---|---|
| Chrome | countdown FunctionCalls per 4 s | 11 | **family FAIL**, 3 of 3 missed | Vf − C: diff 34.7 vs tol 22, noise-sensitive. C6 − S: 32 vs 22, noise-sensitive. V7 − C6: 45.3 vs 22, scorer label H9-real-interaction. |
| Chrome | style elements | 92.3 | family PASS, 0 of 3 | tol 185 for each pair, set by 2 × AA. Diffs: 158 (Vf − C), 13 (C6 − S), 102 (V7 − C6). **Low-power**: this pass can't see style changes much smaller than ~185 elements per window. |
| Chrome | Layout | 2 | family PASS, 0 of 3 | tol 4: diffs 3.7, 2.7, 2.7. |
| Chrome | Paint | 5.7 | family PASS, 0 of 3 | tol 11.3. Vf − C passes **on the tolerance boundary (11.3 vs 11.3)**; C6 − S 0.7; V7 − C6 9.0. |
| Sim | RenderingFrame | 8 | family PASS, 1 of 2 missed | Vf − C passes (0.5 vs 16). V7 − C6 **misses**: FULL −20.5 vs FRZ −58.5, tol 16, label H9-real-interaction. |
| Sim | RecalculateStyles | 5 | family PASS, 1 of 2 missed | Vf − C passes. V7 − C6 misses: −20 vs −66, tol 10, H9. |
| Sim | Layout | 2 | family PASS, 0 of 2 | tol 4: diffs 3.0 and 1.0. |
| Sim | Paint | 15 | family PASS, 0 of 2 | tol 30: diffs 4.0 and 2.5. Low-power (tol 30 on about 170 paints in FULL). |
| Sim | Composite | 4 | family PASS, 1 of 2 missed | V7 − C6 misses: −19.5 vs −58.5, tol 8.8, H9. |
| Sim | countdown rAF | 1 | family PASS, 0 of 2 | V7 − C6: −116 vs −112, tol 16.7. |

The Sim's family rule needs 2 of 2 misses, so one judged miss leaves the family at PASS. The V7 misses are still a
result; see "What it means".

**The §2.4 Layout/Paint open item is settled.** Layout and Paint pass for every judged pair in both engines. The
earlier −29 / +57 full-page mismatch (n = 1) was phase noise: within one arm, full-page loads spread by up to 26
layouts and 74-88 paints per window in Chrome.

**What it means** (my reading after seeing the data, post hoc unless marked)
- **Countdown calls per window.** The FAIL stands as recorded and is not re-scored. Post hoc: the same build gave
  108-215 calls per 4 s window, and C's FULL and FRZ distributions look alike. That suggests window-phase sampling
  (how many rolls, and how much of the edge rolls, a window catches) rather than distortion by the freeze.
  - V7 − C6 carries the scorer's H9 label: its FULL rows sit at 16/16/16, so the within-arm range is tiny. The spread
    sits on the FRZ control side (C6 FRZ 150/115/215), which is why I read it as the same window noise.
  - That reading is post hoc. **P-076** (`p076-prereg.md`) is the pre-registered test of it: calls per countdown second,
    cut at the countdown's own interval fires, on new loads.
- **Frames for a compositor-run element (Sim, V7 − C6).** Post hoc: with the rest of the page frozen, moving the roll
  to the compositor (V7) cut main-thread rendering frames from about 110 to about 50 per window. On the full page the
  other animations keep frames running anyway, so the same change saves only about 20.
  - Chrome shows the same shape in its unjudged main-frame count: V7 − C6 is −40 in FULL and −72 in FRZ.
  - So FRZ overstates frame, style-recalc and composite savings when the rest of the page keeps rendering. These
    counts are page-wide in nature (H9) and come from FULL on the cost card (§6.2).
- **The vs-C rows** (secondary, not judged) miss widely on Layout and Paint in both engines, all labelled H9. Example:
  Chrome C6 − C paint is +193 in FULL against −97 in FRZ. st6-rb2 changes the rest of the page, which a frozen rest
  can't show. This confirms the own-control amendment.
- **V7 is cd-roll-ca's own effect only in V7 − C6.** V7 sits on cd-strip on st6-rb2.
- **Known limit, found while writing P-076.** S, C6 and V7 have a second `[role=timer]` outside the kept subtree. FRZ
  pauses its animations but not its JS, and its work is counted in both modes. This affects the C6 − S and V7 − C6
  rows of both P-075 and P-076.

### 4.5 P-076 readout: countdown calls per countdown second (2026-10-03)

Pre-registration `p076-prereg.md`, registered at 1032787 before any data. The scorer is `judge-tick.mjs` b84f4156010c and
the probe `tick-probe.mjs` 967461d775ec. Data and scorer output are in `p076-data/`; re-running
`node judge-tick.mjs p076-data` reproduces `judge-tick.json` byte for byte.

**How it ran.** Two shared-lane probe slots on new loads, 18 loads each. Neither slot was partial and no load was VOID.
- Every served JS hash matched.
- Every load found its interval fires, T matched in every load, and every FRZ clock check showed changes.
- The fires sat at the callback's line + 1 in every load: the trace's FunctionCall line numbers are 1-based in our
  setup (OBSERVED).

**Verdict: family PASS, 0 of 3 judged pairs missed.** AA 0.3 calls per second, with no flag.

| Pair | dFULL | dFRZ | diff | tol | Verdict |
|---|---|---|---|---|---|
| Vf − C | −0.3 | 0.0 | 0.3 | 2.0 | PASS |
| C6 − S | −0.2 | 0.0 | 0.2 | 2.0 | PASS |
| V7 − C6 | −24.5 | −25.0 | 0.5 | 3.8 | PASS |

- Per countdown second, every pre-cd-roll-ca build runs about 27-29 countdown calls in both modes. V7 runs 4, which is
  cd-roll-ca's own effect.
- **One decisive pair, two null pairs.** Only V7 − C6 tests a real effect (−24.5 vs −25.0). Vf − C and C6 − S have
  dFRZ 0.0: they pass at the 2-count tolerance floor (about 7 % of the C value) on near-null effects.
- **The metric is steady-second calls, not total countdown script.** The median drops the roll seconds: 60-95 calls,
  about 1 second in 5 in C, S and C6 (V7's rolls stay at 5-6). Roll cost needs its own row on the card, e.g. the max
  or mean per second, and P-076 doesn't cover it (mgmt-ops-10 read).
- Per-second values inside one load show the multi-digit rolls directly: about 60 calls in a second with a tens roll,
  and 83-95 in one with more digits, against 27-29 otherwise. That is the post-hoc reading of P-075's per-window FAIL,
  now tested before the data: the window caught a varying number of multi-digit rolls.
- **What it decides** (pre-registered): the cost card takes script per event for this family from FRZ, and per-event
  cutting is the card's default for event-driven script counts (§6.2).
- P-075's per-window FAIL stays as recorded.

## 5. Open questions for the user (plain words)

1. When a fix's benefit is "the page does less work", is this enough to land it? The proof would be fewer work
   counts, shown on the full page in Chrome and the Simulator, plus one short phone check that it still feels smooth.
   Or do you want a measured smoothness win on the phone for each fix?
2. Should phone checks start warm (about 38-40 °C, close to everyday use, since this page warms the phone) or cool?
   Our runs so far show no smoothness change between 34 and 42 °C, so we suggest warm, which also saves cooling
   waits.
3. May we try Xcode's "pretend the phone is hot" setting once, about 10 minutes? It could replace waiting for real
   heat when we test behaviours that only happen when hot.
4. Low Power Mode makes Safari draw at half speed, which is a different page, not just a slower one. Do you want it
   tested as its own question, or left out?
5. For the countdown, is a test page that shows only the countdown, looking exactly the same, fine as a test tool?
   It never ships. The cheaper option is to pause the rest of the real page, which we'd use by default.

## 6. Rendering cost card (design, user ask T-029 #23)

A per-fix card that describes each animated element's rendering cost before and after the fix. It is built from
Chrome and the Simulator only, so no phone and no heat. Every fix owner attaches it at D. The phone still confirms
at V (§4).

### 6.1 Fields

All counts are per **element event**: a tick, a roll, a moving frame or a scroll crossing. The window always
contains whole events (§6.3).

| # | Field | Chrome source | Simulator (WebKit) source | Status of the source |
|---|---|---|---|---|
| 1 | **Which thread runs it.** Values: compositor on its own, main thread every frame, or main thread per event. | Trace `Animation` events: a running animation that Blink could not put on the compositor carries a failure reason, listed in Chromium's `CompositorAnimations::FailureReason` (`kUnsupportedCSSProperty`, `kTargetHasInvalidCompositingState`, `kTransformRelatedPropertyCannotBeAcceleratedOnTarget` and others). A rAF/JS driver counts as main-thread work by definition, seen as FunctionCalls in the element's code range on its frames. | WebKit's protocol exposes no "accelerated" flag per animation. Read: (a) LayerTree `reasonsForCompositingLayer` (has an `animation` reason); (b) a behavioural test: while the element visibly moves, are there 0 RecalculateStyles and 0 element FunctionCalls per moving frame? | Chrome enum CONFIRMED (chromium `third_party/blink/renderer/core/animation/compositor_animations.h`, `FailureReason`). That the trace carries it per animation is UNRESOLVED; the decisive check is one trace of a known non-composited animation. WebKit reasons list CONFIRMED (WebKit `Source/JavaScriptCore/inspector/protocol/LayerTree.json`, `CompositingReasons`). The behavioural reading in (b) is a method, OBSERVED; there is no reference for "accelerated" in WebKit. |
| 2 | **Layers and GPU memory** of the element's subtree: count, composited size, memory. | CDP `LayerTree.layerTreeDidChange` (layers with width, height, `drawsContent`, `paintCount`) and `LayerTree.compositingReasons`. Chrome reports **no memory field**, so memory is an estimate: drawing layers × w × h × DPR² × 4 bytes, labelled "estimate". | `LayerTree.layersForNode` gives `memory` (bytes), `paintCount` and `compositedBounds`. These are the Sim census already used by cd-strip and cd-roll-ca. | CONFIRMED: CDP `pdl/domains/LayerTree.pdl` (Layer has no memory field); WebKit `LayerTree.json` (Layer has `memory`). |
| 3 | **Repaint area × rate**: device px² repainted per event, and paints per event. | Trace `Paint` events: `args.data.clip` (quad) and `layerId`, kept when they intersect the element's rect. | Timeline `Paint` records: `data.clip` (quad), the same filter. cd-roll-ca's `sim-counts.mjs` reads it. | Field names OBSERVED in our scripts. The reference check (Chrome trace event docs, WebKit `Timeline.json` / `InspectorTimelineAgent`) is owed. |
| 4 | **Layout per event**: layouts, and the objects laid out. | Trace `Layout`: count, plus `beginData.dirtyObjects` / `totalObjects`. | Timeline `Layout` records: count. | Counts OBSERVED (pilot). Objects per layout: Chrome field names to confirm. |
| 5 | **Script per event**: FunctionCalls in the element's code range, plus style elements recalculated. | Trace `FunctionCall` (url + line in range), `UpdateLayoutTree.elementCount`. | Timeline `FunctionCall` (`scriptName`, `scriptLine`) and `RecalculateStyles`. | OBSERVED (pilot). Self time is printed as ms but never judged, because ms are heat- and clock-dependent (§1.1). |

### 6.2 Which numbers come from which harness

- **Element fields** (1, 2, 3, and style elements in 5) come from **FRZ**: the rest of the page is frozen, and the
  element subtree keeps running and is checked. These numbers belong to the element. Caveat: the P-075 Chrome style
  pass is low-power (tol 185 elements per window, §4.4), so the card prints the FULL row beside it.
- **Layout and Paint counts** come from FRZ too, with a FULL row beside them for context.
  - They passed for every judged pair in both engines. That is P-075's answer to the §2.4 open item.
  - One Chrome paint pair passed exactly on its tolerance.
- **The element's own script calls** (field 5) come from FRZ, counted per event and cut at the element's own events,
  as "steady-event calls" (the median per event). This rests on P-076 for the countdown family (§4.5): one decisive
  pair (V7 − C6) and two null pairs. P-075's per-window count failed.
  - Roll or burst cost, e.g. the max or mean per event, is a separate row and not yet validated.
  - A new family uses FULL until its own FULL-vs-FRZ check passes.
- **Frame-driven counts come from the FULL page**: rendering frames, style recalcs per frame, composites, main frames,
  Layerize, PrePaint, IO per frame.
  - P-075's Sim V7 − C6 shows why: moving the countdown roll to the compositor saved about 59 frames per window with
    the rest frozen, but about 20 on the full page, where other animations keep frames running (§4.4).
  - So these counts are never attributed to the element alone (H9). The card prints them as "the page around it".
- **Event-driven counts must be normalised per event, never per window.** In P-075, the countdown's own FunctionCalls
  per 4 s window varied 108-215 between page loads of the *same* build. That FAIL stands. P-076, cut per countdown
  second on new loads, passed: the window caught a varying number of multi-digit rolls (§4.5).

### 6.3 One command, two outputs

Proposed:

```
node tools/costcard.mjs --topic <t> --control <overlay dir|-> --build <overlay dir> --element '<selector>'
        [--event mutation|raf|frame] [--window-events 8] [--engines chrome,sim] [--loads 3]
```

The command:
1. Serves both arms from immutable copies and hash-checks the served files. A mismatch is VOID, exit 3.
2. Loads the page n times per arm, alternating arms, in Chrome (headless, CPU 1x, 430x932 DPR 3) and then in one
   Simulator functional session.
3. Installs FRZ scoped to `--element` and checks that the element still runs (clipped screenshots in Chrome,
   mutation ticks in the Sim).
4. Cuts the trace at the element's own events and drops the partial stretches at both ends. With T instances of the
   element, one event span is [f_i, f_(i+T)). Events come from the trace (the element's timer or rAF callback), or
   from a MutationObserver mark when the code has no callback of its own. It records until `--window-events` events
   have passed and reports the median per event. P-076's `judge-tick.mjs` `perLoad()` is the reference
   implementation.
5. Writes `fixes/<t>/costcard.json`: fields 1-5 per arm and engine, per event, with load ranges, A/A-free.
6. Writes `fixes/<t>/costcard.md`: a plain-words table, one row per field, before → after, and a one-line reading
   such as "now runs on the compositor; 0 → 0 layouts per tick; repaint 1.2 → 0.0 Mpx per tick; 24 fewer layers".

It runs in the shared lane, as a probe for Chrome and a simulator slot for the Sim, ≤ 300 s each.

### 6.4 What it needs (tooling)

It lives in `tools/`, so it is a toolsmith incident with tests (Hard rule 6). Most of the pieces exist:
- `tools/lib/cdp.mjs`: Chrome trace;
- `tools/lib/wip.mjs` and `tools/sim.mjs session`: Sim Timeline and LayerTree;
- `serve.mjs --overlay`: arms.

The scratch probes `iso-check.mjs` (in this folder), `pilot-sim.mjs` and cd-roll-ca's `sim-counts.mjs` hold the
freeze, the screenshot check, the record walks and the Paint-clip filter.

New code:
- the event-aligned window (§6.2), ported from `judge-tick.mjs` (P-076) with its VOID rules;
- the Paint-clip ∩ element-rect area sum;
- Chrome layer-memory estimation;
- the Chrome `Animation` failure-reason read (after the field-1 reference check);
- the md table writer.

Tests: unit tests on recorded fixture traces and Timeline dumps (parsing, normalisation, area sums, the VOID path),
plus an e2e on the fixture baseline with fake Chrome, like the existing ones. A real-Chrome case goes in
`test:chrome`.

It is not measurement code for A/B timing (it judges no ms), but it counts what a D card cites, so the reviewer
checks it the same way.

### 6.5 What the card can't say

- Frame time, smoothness, finger feel and hot-only behaviour. Those remain V/phone (§4.1).
- Costs that come from the element's neighbours: a larger composited layer, a merged per-frame style or layout
  (H9). The card's FULL context row hints at these but doesn't measure them.
- Raster and GPU time. The memory and area numbers are a proxy, and Chrome's memory is an estimate.
- Other instances of the same component outside the kept subtree. Examples are the second countdown timer in the
  st6-rb2-based builds. FRZ pauses their animations but not their JS, so their script cost appears in both modes.

## 7. Mac Safari / WebKit as a heat-free source (desk research, user ask T-029 #25)

Desk research only: no Mac browser was run, nothing was installed or enabled, and no lock was taken. The sources are
WebKit `main` and Playwright `main` source files, Apple developer docs and MDN browser-compat-data, all read on
2026-10-03. Safari 26.2 on macOS 26.2 is the local version.

**Short answer: no, for the cost card.**
- Script and layout counts probably carry over between Mac and iOS WebKit. Layer census, tile and paint counts don't:
  WebKit takes different code paths on the two platforms.
- Without a person in Web Inspector, no path on this Mac returns Timeline or LayerTree data without installing
  something.
- The Simulator's own Web Inspector protocol already gives us both LayerTree (`layersForNode`, with memory and
  paintCount) and Timeline (Layout, Paint, Composite, RenderingFrame, FunctionCall). We use them today, through
  `sim.mjs session` and the debug proxy: cd-roll-ca's census and the P-075 Sim part.
- So **Mac Safari would mainly add a second GPU path, the Mac's**, and that path isn't the phone's either. The
  Simulator stays the WebKit source for the card.

### 7.1 Fidelity: what differs between Mac and iOS WebKit (all CONFIRMED in WebKit source)

- **Layers.**
  - Mac adds scrollbar layers to every composited overflow scroller, and composited overflow-control layers to the
    frame (`RenderLayerBacking.cpp` 2817-2823, `RenderLayerCompositor.cpp` 4758-4776). iOS doesn't.
  - When memory is tight, iOS drops `will-change` compositing and Mac keeps it (`RenderLayerCompositor.cpp` 4059-4063,
    policy at 694-728).
  - Both platforms force compositing mode (`WebPage.cpp` 1309) and composite fixed/sticky elements
    (`TiledCoreAnimationDrawingArea.mm` 243, `RemoteLayerTreeDrawingArea.mm` 210).
- **Tiles.** The tile size is 512 on both (`TileController.h` 58).
  - Mac page tiles cover 2× the visible width and 3× the height (`TileController.cpp` 444-466, 560-562).
  - iOS sizes tile coverage from scroll velocity and shrinks it to the visible rect under memory pressure
    (`TileController.cpp` 499-552).
  - So tile and paint counts during a scroll differ.
- **Preferences** (`UnifiedWebPreferences.yaml`).
  - `TextAutosizingEnabled` is true on iOS and false on Mac (L6141). This one can change layout.
  - `TemporaryTileCohortRetentionEnabled` (L6114) and `AllowMultipleCommitLayerTreePending` (L268) also differ.
  - The 60 fps preference (L4843) and async overflow/frame scrolling (L540, L554) are the same on both.
- **Scrolling.**
  - iOS scrolls with UIScrollView (`ScrollingTreeScrollingNodeDelegateIOS.mm` 43, 77).
  - Mac uses ScrollerPairMac and wheel handling on a scrolling thread (`ScrollingTreeScrollingNodeDelegateMac.mm` 50,
    143; `RemoteScrollingTreeMac.mm` 67-68).
- **Cadence.** On a 120 Hz display, both pick the rate nearest 60 Hz (`AnimationFrameRate.cpp` 47-65, `Page.cpp` 2990).
- **Drawing area.** Trunk Mac uses RemoteLayerTree by default (`PlatformEnableCocoa.h` 824-826). Whether shipping
  Safari 26.2 does the same is UNRESOLVED; the decisive check is a `sample` of Safari's WebContent process.
- **Apple's own view.** Responsive Design Mode presets "don't represent exact layout, rendering, and behavior", and
  Apple points to the Simulator for accuracy (Responsive Design Mode doc).
- **Geometry.**
  - Responsive Design Mode has a Pixel Ratio control. Whether it offers 3× is UNRESOLVED; the doc lists no values.
  - Playwright WebKit accepts 430 px, DPR 3, mobile and touch (`wkPage.ts` 725-730, 216).
  - Touch, the dynamic toolbar and visual-viewport resizes are emulation only, not proven faithful (UNRESOLVED).

### 7.2 Yes / no per use

| Use | Mac Safari 26.2 (safaridriver, Web Inspector) | Playwright WebKit (download, no admin) | Own WebKit build | Simulator (today) |
|---|---|---|---|---|
| Layer census (count, size, memory, reasons) | **no**: safaridriver is W3C WebDriver only, with no Timeline or LayerTree; Mac remote inspection has no public non-UI client | **unresolved**: LayerTree is in its protocol (`protocol.d.ts` 5125), but `newCDPSession` is Chromium-only (`class-browsercontext.md` 1012-1014), so access is an unsupported hack; Mac layers ≠ iOS layers (§7.1) | yes (`internals.layerTreeAsText`, LayerTree), but on Mac still Mac layers | **yes** (`LayerTree.layersForNode`) |
| Paint (records, rects) | **no** | **unresolved** (Timeline Paint, same hack); Mac tiling ≠ iOS | yes (`startTrackingRepaints` / `repaintRectsAsText`) | **yes** (Timeline Paint with clip) |
| Layout count | **no** | **unresolved** (Timeline Layout); text autosizing is off on Mac | partial (`styleRecalcCount`, `renderingUpdateCount`; Timeline for layout) | **yes** (Timeline Layout) |
| Script (FunctionCall) | **no** (only in-page wrappers) | **unresolved** (Timeline FunctionCall) | yes (Timeline) | **yes** (Timeline FunctionCall) |
| Install / admin | `safaridriver --enable` asks for admin authentication | a download, a user decision (lead asks via console) | Xcode + Metal toolchain + a long build | none |

- In-page JS on Safari has no layout or paint counts: no Long Animation Frames, `longtask` or `layout-shift` entries
  (MDN browser-compat-data).
- Safari 27's `safaridriver --mcp` adds script, screenshots, input and a CSS-px viewport, still with no Timeline or
  layers ("Connecting an AI agent to Safari"). This Mac has 26.2.

**WebKit build, cost in one line.** A build (Mac, or `--ios-simulator` for the iOS code paths plus `window.internals`;
WebKit ReadMe L59, L146) needs Xcode, its command line tools and the Metal toolchain, and a long, CPU-heavy compile in
a `--no-timing` hold. The ReadMe gives no time or disk figure (UNRESOLVED). It is out of budget unless a census has to
match the phone exactly and the Simulator's LayerTree isn't enough.

**Recommendation.** Keep Chrome plus the Simulator as the cost card's sources (§6). Don't ask the user to install
Playwright WebKit or Safari Technology Preview for this: neither gives the iOS code paths the Simulator already runs.
Revisit only if a fix's question is specifically about the Mac GPU path.
