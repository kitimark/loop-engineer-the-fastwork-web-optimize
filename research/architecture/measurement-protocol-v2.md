# Measurement & workflow protocol v2 (arch-lead)

Status: **DRAFT 1** (2026-10-01, ~10:45Z). Built from the team inputs (fix-nav-morph, fix-scroll-engine,
fix-hero-exit, mgmt-ops-4), arch-devtools (`research/architecture/devtools-methodology.md`, 3096c8e) and
de-devtools (`research/design-engineering/devtools-render-metrics.md`, 97b1a41). arch-safari and de-safari
are still writing: their questions are in §10 and the affected rules are marked **[pending safari]**.
It replaces nothing yet. The lead approves it; then the doc changes in §8 make it binding.

Scope: how we go from "a frame is slow" to a landed fix, and what evidence each step needs, on Chrome, the
iPhone and the finger. Words: **must** = a gate fails without it; **should** = the reviewer asks why not.

## 1. What went wrong today, and the rule that prevents each

| # | lesson (verified source) | v2 rule |
|---|---|---|
| L1 | de-morph's model predicted gh −30-45 ms; the phone measured −6-9 ms. The baseline came from finger runs in a warm phone, the raster rates were ~2x off (morph-endpage §6) | §4: a prediction states a **same-driver** baseline ≤24 h old, passes a closure check, and labels every constant calibrated or assumed |
| L2 | b-noblur "removed the nav blur" but the blur sits on `header.start-selling-top-nav` itself; the ablation measured nothing | D gate: every ablation names element + property and proves it with **computed style in Chrome AND WebKit** before the phone |
| L3 | N10 a-d targeted code that was not the cause (phase-level A/B only). Then the y≈1960 "img src burst" was itself wrong: the R3 logger capped at 12 events per frame. mw10e-src is no winner (ctl 86/92/88 vs src 97/84/91 ms, 21/21 images pre-sourced); with src staged the frame's only event is `inert` leaving the morph panel at the IO edge, 3/3 (F-044) | D gate: attribution needs a positive ablation, negative sibling ablations and a mechanism check. **No capped loggers.** Moving a frame (e2) proves the trigger position, not the cost |
| L4 | /10c shipped the F-030 idle regression; review looked at the idle phase at y=0, the cost was in the post-scroll un-skip | **Idle triple** (y=0, parked mid-page after a scroll, at the pin) in F and V |
| L5 | hero v2 fixed y≈50 and grew y≈700 by ~10 ms; only the phone saw it, 1.5 h later | **Position-bin census diff** on both devices in V: every bin, not only the targeted one |
| L6 | Chrome shows the morph at 110 fps, the phone 15-30 fps. Chrome at 6x throttles only the main thread; WebKit raster, allocation and commit are on the phone's frame path | **Device class** decided at D; phone-only fixes are gated on the phone, Chrome is a no-regression check |
| L7 | Heat voids phone blocks (F-028: idle stays 60 while scroll/bottom fall); cold first runs are slow (F-042); Timeline timestamps are 0 over the proxy; 120 Hz panel quantizes gaps to 8.33 ms | §5 sentinel under load, warm-up run, block limits; §3 tick metrics |
| L8 | Canary drift on the same page: ~92 fps / 25 frames >20 ms (04:25Z, 93b4af2) → 78/57 (08:31Z, 43e40ce) → 75.9/75.2 (10:08Z, acce613), unexplained | §6.3: host-vs-tool A/A, then bisect; until then compare only within one hold |
| L9 | Driver ≠ finger: the morph driver never bounces or pins, the scripted scroll never resizes the toolbar; savings don't add (ghb 21 / gh 24 / g 33) | Claims are scoped to their driver (§5.4); touch paths need G or F before landing |
| L10 | Chrome y and phone y differ by ~77 px; viewports differ (932 vs 775/815) | Positions in **crossing coordinates** (§3.4); Chrome attribution probes at phone geometry |
| L11 | ~6 phone queue reorders in 90 min; owners waited 1 h+ per phone answer | Slot ticket (§2.5): ticketed builds only, ranked queue, reorders at block boundaries |
| L12 | rAF gaps can't credit work moved off the main thread (h2, morph R3, WAAPI strips); every Mpx figure was derived | §3.1 presentation and paint-area sources; predictions state which source can see the gain |

## 2. Stages and gates

Six stages, each closed by a gate. A topic may skip nothing; a stage can be short.

| stage | question | closes with | signs off |
|---|---|---|---|
| R research | where and how often is it slow? | census card | owner |
| I investigate | what changes in that frame? | event card | owner; mgmt-ops checks it is complete |
| D distinguish | which mechanism and which code cost it, on which device? | **attribution card** | **lead** |
| F fix | does the build do only what we intended? | build card + slot ticket | owner; mgmt-ops validates the ticket |
| V review | is it a win on the target device with no regression elsewhere? | review report (§7) | fix-reviewer |
| L land | — | landing per LEAD.md | lead |

### 2.1 R: census (required evidence)

- **Phone:** ≥3 runs of the relevant driver (S scripted / W window / M morph / G gesture / F finger, §5.4) on the
  exact base, with the standard probe (§5.5). List every frame ≥37.5 ms (k≥5 ticks) with yStart, yEnd and m.
- **Chrome:** `verify --frame-log` (and `tools/frames.mjs`) at 430×932 for gain metrics **and** at the phone's
  geometry (430×775 scripted, 430×815 collapsed toolbar) for position.
- Group by position in crossing coordinates (§3.4). A cluster is **reproducible** if it appears in ≥2/3 runs at
  the same crossing; otherwise it goes on the "rare" list (finger-only, toolbar, load-time) and needs F or G runs
  before any work.
- Output: census card = table of clusters × device × count × median dt × driver, raw files cited.

### 2.2 I: event card

For one cluster: everything that changes in that frame.
- **Crossing table:** every code threshold within ±1 viewport (IO edges, scene gates, scroll-timeline ranges,
  class toggles), with its y on each device (the method of middle.md §2 and F-045's pr4 probe).
- **Per-step probe** across the window (Chrome short lane, counts only): per y step, mutations by type and
  attribute (uncapped), style/layout counts, layer count delta, scene attributes.
- **Phone logger** in the same window: same fields, per frame (§5.5).
- Hypotheses must name **element + selector + property** (or function + line). Each named property is checked by
  computed style in Chrome **and** WebKit (L2).

### 2.3 D: attribution card (the new gate)

A fix is built only on a **NAMED** card. Fields:

1. **Pipeline stage:** script / style / layout / paint (record + raster) / allocation / composite-commit / GPU /
   input. Evidence: Chrome `--trace-frames` class of that frame; on the phone, Timeline counts (durations once
   §10 Q1 lands) + page-rAF JS ms + layer/filter counts sampled after the frame.
2. **Code:** the single mechanism and its location.
3. **Ablation set**, all built under new names, all measured in one block against the same control:
   - positive: removing the mechanism removes (or shrinks) the frame;
   - negative: ≥1 sibling ablation in the same frame (another event of the event card) does not;
   - **mechanism check** for each arm: proof that the arm removed exactly the named thing and nothing else
     (computed style, mutation counts, layer count). An arm without it is void (L2).
   - A position-moving ablation (e.g. e2, staging work earlier) proves **where the trigger is**, not what costs:
     it can never be the positive control alone (L3).
4. **Device class:**
   - **Chrome-measurable:** the frame exists in Chrome at 6x in the same crossing → Chrome A/B is the gate,
     the phone confirms.
   - **Phone-only:** absent or flat in Chrome (raster, allocation, GPU, WebKit layerization) → a phone ABBA
     block is the gate; Chrome is a no-regression and parity check.
   - **Touch-only:** depends on touch, bounce, pin or toolbar → G or F runs are required before landing.
5. **Verdict:** NAMED (positive + negative + mechanism all pass), LOCATED (trigger position known, mechanism not
   isolated), UNEXPLAINED. LOCATED may spend one more phone block on ablations; it may not build a fix.

Fast path: a fix whose mechanism is exact and countable in Chrome (T1-type: a removed listener, a deleted
redundant write, counts → 0 by construction) may write a one-line attribution card ("counts X→0, by code") and go
straight to F. The lead decides if a topic qualifies.

### 2.4 F: build card

- Built under a **new name**, served from an immutable snapshot copy, file hashes recorded (`curl -D` on the
  served files, `x-mirror-source: overlay`).
- **Parity:** frozen-frame diff 0 % (P14), plus the backdrop/filter look check (Page.snapshotRect does not render
  `backdrop-filter`, so the user looks, or a device capture [pending safari §10 Q3]).
- **a11y diff** when `inert`, `visibility`, `aria-*` or focusable content changes.
- **Mechanism delta** in Chrome (bench Tier A, short lane): the named counter moved, nothing else did.
- **Idle triple** (counts: callbacks/s, writes/s, mutations/s, rAF/s) at y=0, parked mid-page after a scroll, and
  at the pin.
- **Memory/layers note:** layer count at 3 fixed positions (Chrome `layerTreeDidChange` against a no-op control;
  `layerPainted` fired 0 times for fix-scroll-engine, don't rely on it alone).
- **Prediction card** (§4) written before any timed run.
- Debug hooks (`__fwMorphDrive`, loggers) stripped before landing; a phone build may carry them, the landed
  patch may not.

### 2.5 The slot ticket (phone access)

mgmt-ops-4 validates; the lead orders the queue. A ticket names:
build + hashes; the ONE named control on the same base (and its hashes); driver; the one question; the prediction
id; the "if X then Y" decision for each outcome; the probe set; expected minutes. Rules: only ticketed builds go on
the phone; the queue is ranked by the lead; **reorders only at block boundaries**; an owner whose ticket is
rejected gets the reason in one message. Running blocks are never interrupted for a reorder.

## 3. Metrics

### 3.1 Frame-time sources

| source | device | sees | blind to | role |
|---|---|---|---|---|
| rAF gap (page logger) | both | main-thread frame cadence: scroll-linked JS, style, layout; on iOS also raster/commit back-pressure one frame late (F3) | compositor-presented scroll and threaded animations (can't credit off-main moves); Chrome GPU/raster at 6x | **primary** for both devices |
| `DroppedFrame` ± `hasPartialUpdate` in `--trace-frames` (G1) | Chrome | presented / partial / dropped per phase | iPhone anything; traced runs ≠ untraced | diagnostic; **primary only for threaded-refactor claims** in Chrome |
| WebKit Timeline per-record durations (`Page.enable` before `Timeline.start`) | phone | per-frame style/layout/paint/composite ms | GPU/render server time | diagnostic **[pending safari Q1]** |
| WebKit Rendering Frames | phone | per runloop main-thread work | presentation? | diagnostic **[pending safari Q2]** |
| Timeline counts per 1 s chunk | phone | paint/layout/style counts and rects | per-frame timing | diagnostic (what exists today) |
| LoAF (`forcedStyleAndLayoutDuration`, scripts) | Chrome | ≥50 ms frames' script attribution, forced layout | WebKit (no LoAF), off-main work | diagnostic |

Never quote "frames >20 ms" as "dropped frames" (arch-devtools §2a).

### 3.2 Tick quantization (both devices at 120 Hz)

- Tick k = round(dt / 8.333). On-time = k ≤ 2 (one 60 Hz rAF interval).
- Thresholds at tick midpoints: **">34" = dt ≥ 37.5 ms (k≥5)**, **">50" = dt ≥ 54.2 ms (k≥7)**.
- Report a tick histogram per run; p50 is coarse (moves in 8.33 ms steps), so medians are compared as ticks.
- **Transition:** keep the legacy ms columns (>34, >50 as dt > 34 / > 50) alongside for one wave. Switch the
  primary to ticks after one Chrome A/A and one phone A/A show both; any verdict that differs between the two
  is reported as "threshold-sensitive".
- Dropped ratio with each device's own period (G8) is report-only.

### 3.3 Primary and diagnostic metrics per device and driver

| device / driver | primary | diagnostic |
|---|---|---|
| Chrome A/B (`fix.mjs ab`) | frames >50 and >34 per phase, within ONE hold (>34 varies ±2 across holds) | fps, >20, p50/p95, LoAF, forced ms, cdp counts, trace classes |
| phone S / W | frames k≥5 and k≥7 in the topic window and the full pass; topic-window median ticks | fps, phase fps, Timeline counts |
| phone M (morph driver) | moving-m p50 and p95 ticks; held m=1 p95; m-bin profile | per-m-bin dt, layer/filter counts |
| phone G / F | frames k≥7 per pass; morph-active p95; touch input delay (§3.6) | everything above |

Every metric names what it can't see in the README that quotes it.

### 3.4 Position

- Per frame: yStart, yEnd (scrollY before and after), innerHeight, m.
- **Crossing coordinates:** for each code threshold i, y_i = elementTop_i − f_i·vh. A frame is placed by its
  nearest crossing and Δ to it. Chrome and phone are compared by crossing, never by raw y (L10).
- Chrome attribution probes run at the phone geometry; gain A/Bs stay at 932 (the calibrated setting).
- Position bins for the census diff: the topic window, plus fixed bins of 250 px over the whole pass.

### 3.5 Idle

Callbacks/s, writes/s, mutations/s by type, rAF/s, at the **idle triple**. A fix may not raise any of them at any
of the three without a stated reason.

### 3.6 Touch

- Event Timing on the phone (Safari 26.2+): `touchstart` / `pointerdown` input delay (`processingStart −
  startTime`) and duration, `durationThreshold:16` (G2). Measures scroll **start** only (`touchmove` is excluded).
- Per frame: touchmove-carrying frames vs others; `preventDefault` ratio; pin reversals.

### 3.7 Visual parity, paint, layers, memory, CLS

- Parity: frozen-frame diff 0 % (P14); 0-0.4 % in `fix.mjs ab` is phase noise; backdrop by the user's eye.
- **Paint area: from CDP `LayerTree.layerPainted` only** (opt-in `verify --paint-rects`). The trace `Paint.clip`
  is "unreliable and often wrong" per DevTools' own source: never an area source (corrects arch-devtools G3a; its
  Paint *count* is fine). Chrome's area is a lower bound on WebKit's for resizing layers, exact for paint-only
  switches. Phone area: Timeline Paint rects **[pending safari Q2]**.
- Layers: count delta via `layerTreeDidChange` vs a no-op control; phone `LayerTree` paintCount/memory
  **[pending safari Q3]**.
- Memory: `JSHeapUsedSize`, `Nodes`, `LayoutObjects`, `JSEventListeners` in `--cdp-metrics` (G7).
- CLS: opt-in Tier A counter (G4), as a parity guard for fixes that move boxes; not a goal metric.

## 4. Predictions and the ledger

Every F-stage build has a **prediction card** before its first timed run:

1. Build + hashes, base + hashes, driver, metric(s).
2. **Baseline:** same driver, same base, same heat class, ≤24 h old; raw file cited. A finger baseline never
   predicts a driver run, and vice versa (L1).
3. **Closure check:** the model reproduces the base's measured value within one tick (or it isn't used).
4. **Term breakdown:** which pipeline terms the fix removes, each with its constant labelled *calibrated* (from a
   measured ablation on this device) or *assumed*.
5. **Prediction:** delta with an interval; which metric source can see it (§3.1: a threaded move is invisible to
   rAF gaps, say so).
6. **Falsification reading:** the result that would prove the model wrong.
7. **Decision:** "if within interval → …; if below → …; if worse → …".

Ledger: `fixes/PREDICTIONS.md`, one row per prediction: id, author, date, build vs base, driver, metric,
predicted [interval], measured median [IQR], in interval?, error ratio (measured/predicted), lesson. A model
with **two misses** (outside interval) is reviewed by its author's team before it drives another build.

## 5. iPhone protocol

### 5.1 Builds and serving
Immutable snapshot copies of each overlay (hashes recorded); servers restarted at each block start; plain http
(I-003); Safari tab reloaded per run.

### 5.2 Heat and warm-up
- One **uncounted warm-up run** before the first control of each block (F-042: cold first runs are slow).
- **Sentinel under load:** static idle is NOT a heat check (F-028: it stays at 60 while the phone throttles).
  Every control run must reach bottom-phase ≥58 fps and scroll ≥44 fps (S/W); M runs: held m=1 p95 ≤18 ms; W
  runs end with a jump to the bottom and a 3 s hold to give the sentinel.
- A failing control **voids every run since the last passing control**; the block stops, the phone cools
  10 min, and the block restarts.
- Heat note in every block record (case off, charger state, room, last block end time).

### 5.3 Blocks and n (resolving n≥6 vs ≤9-run blocks)
- A block: ≤9 counted runs, **one question**, one named control on the same base. 10 min cooling between blocks.
- 2 arms: **C V V C C V V C** (4 vs 4). 3 arms: a 3×3 rotated Latin square (C A B / A B C / B C A), n=3 per arm.
- **Sequential decision, max 2 blocks** (a third only by the lead):
  - after block 1 (4v4): **stop, win** if U=0 (exact one-sided p = 1/70 ≈ 0.014) and the Hodges-Lehmann shift ≥
    max(1 tick, half the predicted delta); **stop, futile** if the variant median is not better than the
    control's; otherwise run block 2.
  - after block 2: pool n=8 per arm **stratified by block** (each run as its difference from its own block's
    control median, or van Elteren). Win if the stratified one-sided p ≤ 0.05 and the shift ≥ 1 tick.
  - 3-arm blocks pooled over 2 blocks give n=6 per arm (hero's n≥6), same stratified rule.
- Report median [IQR] and every run. Never pool frames across runs; never compare across blocks without a shared
  control (heat moves p50 ~5 ms between blocks).

### 5.4 Drivers and scope
| label | driver | covers | never covers |
|---|---|---|---|
| S | `iphone.mjs scroll` (UIKit smooth scrollBy) | scroll-linked main-thread effects | toolbar, touch, bounce |
| W | window run (y window, jump, hold) | one position window, repeatable | touch |
| M | `__fwMorphDrive` | morph m-sweep | touch, bounce, pin |
| G | WDA gesture (ts-gesture), after V0/V1 validation | touch paths, repeatable | real finger variance |
| F | user's finger via the lead | everything, incl. toolbar and bounce | repeatability (≈2x worse than S) |

A claim names its driver. Touch-only classes (§2.3) need G or F before landing; a morph change lands only with G
or F (M never bounces). F runs are scheduled by the lead in batches, not per topic.

### 5.5 Standard probe (one command, every run) **[pending safari Q1-Q5]**
- Per frame: [t, dt, yStart, yEnd, innerHeight, m, jsMs].
- Mutations by type and attribute, **uncapped**, per frame (L3).
- Crossing log: every IO edge, scene attribute and class toggle with the frame index.
- After frames k≥5: layer count and filter/backdrop element counts (sampled, not per frame).
- Event Timing touchstart/pointerdown (G/F runs).
- Timeline per 1 s chunk counts (and per-record durations once Q1 confirms `Page.enable`; send `Page.disable` first,
  because `Page.enable` on an already-enabled domain errors without restarting the clock, de-devtools).
- A WebKit screenshot at fixed m for M runs.
- **Probe overhead:** each probe version gets one phone A/A (probe on vs off, 2v2) before its numbers are used.

## 6. Chrome protocol

### 6.1 Stays
`fix.mjs ab`, ABBA n=5, non-overlap verdicts, host gate, 6x, 430×932 DPR 3, `--idle 6`, `--latency 150`, one
hold per A/B, compare within a hold.

### 6.2 Added
- Attribution probes at phone geometry (430×775 / 430×815).
- Per-frame tags for frames >34: scrollY, trace class, top LoAF script / paint source, layer delta.
- Scenarios: idle-after-scroll (park mid-page), `--reload-at <y>`, `--input-at-load`, scroll-up, a measured load
  phase (F-025). Each fix's README lists which scenarios it ran and which it didn't.
- Opt-in `--trace-frames` additions: `DroppedFrame` states (G1), `Layerize`/`UpdateLayerTree`/`Commit` split out
  of `paint` (de-devtools rank 4), `--save-trace` (G6) so the Performance panel can open a run.
- Opt-in `--paint-rects` (LayerTree.layerPainted, de-devtools rank 2).
- Recalibrate 6x once per wave against the phone (G5), with the same logger on both sides.
- Blind spots stated in every Chrome-only verdict: GPU, raster, WebKit layerization, threaded presentation.

### 6.3 Canary drift (L8)
1. One hold: A/A of the canary page with 93b4af2 tools and with current tools, back to back.
2. Record in the host record: Chrome version, memory pressure, compressor, power source, thermal state; run a
   fixed synthetic CPU page as a host yardstick.
3. Tools differ → bisect 93b4af2..HEAD over the measurement code. Host differs → document the band.
4. Until resolved: compare only within one hold; flag any canary outside the 76-78 fps band.

## 7. Review checklist additions (fix-reviewer)

1. Attribution card is NAMED; each ablation has its mechanism check; no capped logger produced evidence.
2. Device class matches the gate used (phone-only fixes have a phone block).
3. Idle triple counts present, none worse.
4. Position-bin census diff on both devices: no bin worse by ≥1 tick median or +1 frame k≥5 per run.
5. Prediction row exists; measured vs predicted recorded; closure check passed.
6. Claims scoped to drivers; touch-only fixes have G or F.
7. Scenarios not run are listed (idle after scroll, reload while scrolled, early input, scroll up, toolbar,
   rubber band).
8. Phone geometry used for attribution; served hashes match the ticket.
9. Heat notes; sentinel passed; within-block vs the exact base.
10. Backdrop look check, a11y diff, memory/layers note.

## 8. Ranked execution plan

### 8.1 Tools (toolsmith-sized, test-first; "MC" = measurement code: call out, `test:chrome`, reviewer)

| rank | item | size | MC? | depends on |
|---|---|---|---|---|
| T1a | `iphone.mjs run --driver scroll\|window\|morph --probe std`: promote out/iphone-runner scripts, per-frame fields, uncapped per-type mutation counts, crossing log | L | device tool (not Chrome A/B) | — |
| T1b | probe add-ons: Event Timing (G2), layer/filter counts after long frames, WebKit shot at fixed m, Timeline `Page.enable` durations | M | device | T1a, safari answers |
| T3 | analysis lib: ticks, IQR, HL shift, exact MW, stratified block compare, crossing placement; `frames.mjs` reads both devices | S-M | analysis (flag) | — |
| T2 | `iphone.mjs block`: snapshot serve, warm-up, sentinel, order, gaps, auto-void, `block.json` | M-L | device | T1a, T3 |
| T6 | `--trace-frames`: DroppedFrame (G1), layer bucket split, `--save-trace` (G6); per-frame >34 tags | M | yes (opt-in) | — |
| T7 | `verify --paint-rects` (layerPainted) + bench `layers` kind | M | yes (opt-in) | — |
| T4 | crossings probe (Chrome short lane, counts) | M | no (bench) | T3 |
| T8 | host record (Chrome version, memory, power, thermal) + canary command | S-M | yes | — |
| T5 | verify scenarios: idle-after-scroll, reload-at, input-at-load, scroll-up, load phase, phone viewport | M-L | yes | T8, canary resolved |
| T9 | CLS counter (G4), CDP memory keys (G7), dropped ratio (G8) | S | opt-in / report | — |

Order for the lead: T1a and T3 in parallel now; then T2; T6+T7 as one "render-side trace signals" incident; T8
before T5. Interim until T1/T2 land: iphone-runner applies §5 by hand with the 12-event cap removed.

### 8.2 Docs (one doc-owner pass after approval)
- `fixes/LEAD.md`: stages and gates, sign-offs, slot ticket, review additions, canary rule.
- `fixes/README.md` DoD: attribution card, prediction row, phone evidence for phone-only, scenarios list, idle
  triple, driver scope.
- `fixes/AGENT_PROMPT.md`: steps follow R/I/D/F/V.
- `.claude/agents/fix-reviewer.md`: §7.
- `CLAUDE.md`: phone geometry, tick thresholds, iPhone blocks/sentinel/drivers, agent communication (§9).
- `fixes/EXPERIMENTS.md`: fields driver, prediction id, attribution verdict. New `fixes/PREDICTIONS.md`.

### 8.3 In-flight topics onto v2

| topic | state | next step under v2 |
|---|---|---|
| y≈1960 (nav-morph) | LOCATED: `inert` removal at the IO edge (F-044); src rejected | no-inert-flip ablation (mw10e-noinert) 4v4 vs aw1-10e with an inert/mutation counter; record src as rejected in the ledger |
| ghbn | diagnostic | mechanism check: computed `backdrop-filter: none` on `header.start-selling-top-nav` during the morph, Chrome + WebKit; prediction (moving p50 ≤20 ms, hump flattens); M block vs ghb; m-bins |
| R8 / R5 (ghr8, ghr85a) | built | wait for ghbn to NAME the backdrop; G/F before landing |
| R2 clip | built | user's look at the next finger batch |
| hero h1/h1v2 | phone-only regression at y≈700 | 2 blocks (n≥6 via 3-arm or sequential), W 0-1000, bins y≈50/700; a11y, memory; v6/v7 bisect only if it fails |
| /10d | Chrome-neutral | phone block S + idle-after-scroll + reload-scrolled vs aw1-10e |
| y≈1250 | census 3/3 (base 53-54, aw1-10c 41-46); F-045: commission scene gate paused→active is the candidate | phone logger with `data-start-selling-scene` watched in 1100-1400, then the D card |
| R2 bg | idea | W around y 850-1000 and the commission end, Timeline paints |
| h3 | idea | attribute the 1 Hz idle spike on the device first |
| R3 | low | after the morph is NAMED |

### 8.4 Cost
Tools ≈ 20-28 toolsmith hours (T1 6-8, T2 3-4, T3 1-2, T4 2-3, T5 4-6, T6 3-4, T7 2-3, T8 1-2, T9 1).
Phone ≈ 30 min per block, ≈ 1 h per question (2 blocks); the §8.3 list is 10-13 blocks ≈ 5-6.5 phone hours,
plus one finger batch (~20 min of the user's time).

## 9. Agent communication

- The spawn prompt carries a **peer directory** (name or ID per role; F-046 is today's). Role names work only if
  the agent was spawned with a registered name; else use the ID. Never drop a message because a name failed.
- Ask the peer who owns the question directly; the lead lands, resolves incidents, reorders queues, spawns and
  talks to the user.
- Messages arrive only at the recipient's next tool round: **run long waits in the background** (lock queues,
  holds, `incident wait`, phone recordings) so messages reach you mid-wait. Observed tail: up to 26 min when the
  recipient sat in a long foreground command.
- Send peers what they need before you finish; your final report goes only to the lead.

## 10. Pending inputs (asked 10:40Z)

- **arch-safari** (a765c480ea490a443): Q1 `Page.enable` + Timeline durations over the proxy and side effects;
  Q2 Rendering Frames and presentation; Q3 LayerTree paintCount/memory cost on device; Q4 probe overhead on
  WebKit; Q5 what joins / must not join the standard block.
- **de-safari** (a4ce1669dd33aa4dc): primary on-device signal for raster/GPU fixes; Timeline Paint clip
  reliability; a device capture that renders backdrop-filter; ranked standard vs one-off probes and probes that
  change WebKit behaviour.
- de-devtools folded (§3.1, §3.7, §6.2, §8.1 T6/T7). arch-devtools folded (G1-G8).
