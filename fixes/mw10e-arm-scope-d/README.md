# Fix: mw10e-arm-scope-d (F3 + window touch listeners while the morph is active)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. Behaviour checked in Chrome. P-071 phone block done (G, n = 3 per arm): D 0/3 collapse, listener churn not separated-worse, D2 flagged, then attributed (below). B1 not reproduced at 37-38.6 °C (V 0/3); reopened by heat: hot-held block P-073 (card below, pre-data). D2 attribution gate passed (same Composite-heavy frames in C, V and D; dispatch < 1 ms). D's land gate now: P-073.
**Stage:** F (round 2 for review-f3-arm-scope: B2 fix, B1 open)
**Device class / gate:** touch-only (G/F)
**Driver(s) behind the claims:** Chrome CDP touch (behaviour), Simulator WDA-sim G (counts)
**Topic:** f3-arm-scope (`fixes/mw10e-arm-scope-c/README.md` is the build P-036 measured)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only. The changes are in the morph effect of the nav
component (pretty lines ~13286-13381 of the overlay): `E()`, `M()`, `P()`, `I()`, plus the new `__tw`, `__twOn` and `__twOff`.
**Base:** F3 `mw10e-arm-scope-c` (JS c6d3590576a7) on `aw1-10e` (JS 3e2f599a1632, CSS c6aad94b455f). Neither
is on `main`: the base builds are on the working branch `worktree-agent-a277ea00c8773c1ea`, and `patch.diff` here is
the diff from the -c overlay. Build: JS **999c4497f37e**. Immutable copy:
`out/snapshots/mw10e-arm-scope-d-999c4497f37e` (served before the aw1-10e copy).

## Why (review-f3-arm-scope B2)

F3 puts the touch listeners on `#platform` and the nav, not the window. That is fine before the morph starts. Once it
runs, two things leave parts of the viewport without a listener:
- `#platform` turns `pointer-events: none` when m > 0.5225 (`S()`: `--morph-fade` < 0.05).
- The nav does not cover the lower part of the viewport mid-tween, nor its 12 px side margins at m = 1.

A touch that starts in one of these places reaches no morph listener. Its touchmoves are not prevented, so the page
scrolls against the pin, and a down-swipe there does not reverse the morph.

## What changed

- While the morph is active, `touchstart` and `touchmove` are also on the window (capture, the touchmove one
  `{passive: false}`), as in the original.
  - Armed by `E()` on any morph target.
  - Disarmed by `I()` once `C()` is false (the end of the spring, or the reduced-motion path), and by `P()` on teardown.
- Before the morph starts, only `#platform` and the nav carry touch listeners, unchanged from F3. P-036's zone strokes
  are pre-morph, so the measured part of the card is the same code.
- `M()` now runs once per event: the first call (the window's capture) marks the event, and a second call (from the
  element) returns. A second run was already harmless (n = 0, so `XM(0)` is null and only the redundant
  preventDefault repeats).
- The desktop wheel listener is unchanged: on the window, armed at load (see Risks).

## Behaviour check: Chrome, B2 cases (n = 1 per case per build; OBSERVED, a single run each, no spread)

Probe: `fixes/morph-webkit/touch-gap-check.mjs`, shared lane. Setup: 430x932 DPR 1, CDP touch, scrolled to the end
(y 5345), an up-swipe on #platform at (215, 600) starts the morph, then a down-swipe of 12 moves x 20 px. Prevented and
cancelable counts come from a passive listener in the window's bubble phase. Results:
`out/touch-gap-check/touch-gap-2026-10-03T02-10-38-110Z.json` and `…02-13-58-640Z.json`.

| case | under the finger | C aw1-10e | V F3 (-c) | D (this) |
|---|---|---|---|---|
| edge: m = 1, down-swipe from (6, 400) | page `main` (margin) | reversed, 12/12 prevented, y fixed | **not reversed**, 0/11 prevented (1 cancelable), **y 5345 → 5325 → 5345** | reversed, 12/12 prevented, y fixed |
| mid-tween: down-swipe from (215, 880), m0 0.525, nav bottom 515 | page `main` (gap below the nav) | (C: m0 0.478, still on #platform) reversed, 12/12 | **not reversed (m → 1)**, 0/8 prevented, **y excursion 20 px** | reversed, 12/12 prevented, y fixed |
| mid-tween: down-swipe from (215, 700), m0 0.48-0.52 | #platform | reversed, 12/12 | reversed, 12/12 | reversed, 12/12 |
| late tween: (215, 700), m0 0.98-1 | nav | reversed, 12/12 | reversed, 12/12 | reversed, 12/12 |

D matches C in every case. V fails in both gap cases, as the reviewer predicted.

## B1 (end-pin collapse): what is known

- **P-036 records** (desk check, no device time; OBSERVED, in our setup, cause unknown):
  - Every pin stroke was fully prevented in both arms (47/47 touchmoves per stroke in V1, V2, C2 and C4). The B1
    strokes start at (215, 600) on the nav, so B1 is not the B2 gap.
  - In V1 the collapse starts ~600 ms after a pin stroke's touchend. dt climbs over ~1 s (42, 100, 117, 123, 162, 232,
    245 ms), then stays at ~200 ms through every later stroke and the idle, ~50 s.
  - V2 is collapsed from its arrival at the pin.
  - The collapse shows in every capped V run (2/2) and in none of the capped C records (0/5: C2, C4, wC, attempt-1's
    wC and the voided C1 hold 52-60 fps). n is small: 2 V records against 5 C records, one device, one evening.
  - The RUNLOG note fits a page that keeps working after the run: the unparked V1 page heated the phone 41.2 → 42.6 °C in 6 min.
- **Simulator** (`fixes/morph-webkit/pinhold-sim.mjs`, WDA-sim G driver, `gestures/pin-hold-v1.json`; counts only, F-084):
  - Both arms reach the capped state: y 5213, m = 1, `is-morphing is-expanded`, #platform pointer-events none, 24
    passes ended "max", 12 pin strokes, 46-51/46-51 prevented.
  - **Neither arm collapses:** 55-60 fps at the pin in both.
  - At the pin over 4 s of idle, the page-side counts are the same in both arms:
    - one rAF loop re-arming each frame, `GE` spring at JS 4039 (V 140, C 139 re-arms);
    - no setTimeout, scrollTo or scroll events;
    - countdown `.face` style writes (V 301, C 297).
  - Timeline record counts are the same within 1 % (RecalculateStyles 585 vs 588, Layout 231 vs 233, Paint 940 vs 946, FireAnimationFrame 380 vs 380).
  - So the Simulator shows **no JS loop specific to V**. Record: `out/pinhold-sim/pinhold-2026-10-03T01-55-47-432Z.json`.
- **Chrome** (pin case of `touch-gap-check.mjs`: 10 more pushes into the pin, then 3 s idle; Performance.getMetrics):
  - C, V and D are the same: 360-361 rAF frames, LayoutCount 0, RecalcStyleCount 501-503, ScriptDuration 0.018-0.023 s.
  - All 132 pushes were prevented in each build.
- **Status: UNRESOLVED.** Neither the Simulator nor Chrome reproduces it. The page-side JS and style/layout counts at
  the pin do not differ between the arms. What remains is device-side work that our counts cannot see, for example
  WebKit's handling of element-target touch listeners while the morph is active, compositing, or the UI process.
  - The decisive check is the phone ticket: G pin-hold-v2 on C, V and D, with Timeline on the collapsed state and on
    the frames where D arms and disarms its window listeners.
  - D changes the listener state at the pin: the window carries the touch listeners again, as in C, while the element
    ones stay. If the cause is the element-only listener set, D may fix B1 as well. That is untested.
  - If D still collapses, the next variant removes the element listeners while the window ones are armed, so the
    listener set during the morph is exactly C's.

## P-071 prediction card: B1 G pin-hold, C / V / D (registered before any phone data)

Second read: mgmt-ops-9. Round 1 was NEEDS-FIX (sentinel, arm-level rule, unit, Low Power Mode); this is the amended
card.

- **Builds.** Snapshot b1789284481295-4ad4a84a, CSS c6aad94b455f in every arm. All three are served from the immutable
  copies in `out/snapshots/` on the working branch, over plain http as in P-036.
  - C = `aw1-10e` (JS 3e2f599a1632).
  - V = F3 `mw10e-arm-scope-c` (JS c6d3590576a7).
  - D = this build (JS 999c4497f37e).
- **Driver.** G, `fixes/morph-webkit/gestures/pin-hold-v2.json`, GESTURE_HASH 2d3a97b742cf. The script:
  - transit strokes until `atEnd` or 24 passes;
  - 8 s idle at the pin;
  - mark `cycle`, then two close/open cycles: down 240 px / 500 ms, 2 s, up 240 px / 500 ms, 2 s.
- **Block.**
  - The runner's own `--no-timing` hold. One uncounted warm-up per arm's port.
  - Up to 9 counted runs in the order C V D / V D C / D C V, Timeline off.
  - Safari is parked after every run, with `wait.mjs phone-temp --below auto` between runs.
- **Sentinel** (the signed P-036 rule):
  - The standard S sentinel (`iphone.mjs scroll`) runs on C, on its own port, uncounted: once after the warm-ups and
    once at the block end. It passes with bottom ≥ 58 fps and scroll ≥ 44 fps.
  - A failing sentinel voids every counted run since the last pass. The phone then cools per §5.3: 0.5 °C below the
    last passing sentinel, 38 °C if none today, at most 10 min.
  - If the sentinel fails again on a cool phone and a quiet Mac, the block stops.
- **Low Power Mode** is recorded for every run. A run with it on is void, because 30 Hz would read as a collapse.
- **Attribution, after the end sentinel.** Timeline runs (`Page.disable` → `Page.enable` → `Timeline.start`) on:
  - V at the pin;
  - D's cycle phase;
  - D's pin, if D collapses.
- **Metric 1, collapse.**
  - Per run, from pin arrival (the first frame at y ≥ 5200) to the end of the run, fps in consecutive 2 s windows.
  - A run is **collapsed** when 2 consecutive windows are under 30 fps.
  - An arm **collapses** when ≥ 2 of 3 valid runs collapse, and is **clean** at 0 of 3. **1 of 3 is inconclusive.**
- **Metric 2, arm/disarm frames** (cycle phase; phone ms thresholds only, G run, F-071):
  - The arm window runs from the up stroke's first touchmove −50 ms to the stroke's lift +500 ms.
    - It is this wide because of the Simulator check (02:47Z, counts only, D and C alike): cycle 1's up stroke starts
      at y 5213 with the morph closed, so its touchmoves are not prevented (0/27-28). The page scrolls natively to
      the end, with an overscroll bounce to y 5348, and the morph reopens there, mid-stroke or in the momentum after
      it, not at the first touchmove.
    - Cycle 2's up stroke starts at y 5254-5256 and is prevented from its first move (31/31).
    - Both down strokes are prevented (33-34 of 33-34) and close the morph.
    - Every run ends at m = 1, `is-expanded`.
  - The disarm window runs from the down stroke's lift +400 ms to +1200 ms, when the spring reaches 0 and D removes
    its window listeners.
  - The unit is **the per-run max dt over that run's 2 windows of a kind**, so n = 3 vs 3, arm and disarm separately.
    Also reported: dt > 50 / > 34 counts with the ±4 ms twins and the near bands.
  - **Separated-worse:** every D run max > every C run max AND median(D) − median(C) ≥ 16.7 ms.
  - The verdict is read at > 50 ms with the twins 46 and 54. When a twin's verdict differs, the verdict is
    "threshold-sensitive".
- **Baseline.** P-036 (OBSERVED): the collapse appeared in V 2/2 and C 0/5. The Simulator (pin-hold-v1) and Chrome do
  not reproduce it.
- **Terms.** The mechanism is unknown (UNRESOLVED).
  - D restores C's window touch listeners during the morph. If B1 comes from the element-only listener set, D fixes it.
  - D's add and remove on every cycle could cost a frame like P-011's ~100 ms IO-edge frame. The WebKit source says a
    style rebuild comes only from a change in the event-region type set, and touch regions are compiled out on iOS
    26.6 (claims-audit W5/W6). So the add may be free there (UNRESOLVED on the device).
- **Predictions.**
  - C clean: ~90 %.
  - V collapses ~55 %, clean ~30 %, inconclusive ~15 %.
  - D, if V collapses: clean ~50 %, collapses ~40 %, inconclusive ~10 %.
  - Arm/disarm: D not separated-worse than C, with no D-only frame > 50 ms, ~60 %. A 50-110 ms frame at D's arm in
    most cycles, ~35 %.
- **Decision.**
  - V collapses, D is clean, and D's windows are not separated-worse → D is the candidate. Next comes the short
    P-036 confirmation on D (≥ 2 V runs vs C, arm-scope-touch-v1), then the F swipe.
  - D collapses → build E (window-only touch listeners while the morph is active). No phone time until E passes the
    Simulator and a Chrome review.
  - D is clean but its arm or disarm window is separated-worse → back to the lead with the Timeline attribution. There
    is no automatic fallback, because arming at the zone edge brings back P-011's edge frame.
  - V or D inconclusive (1 of 3) → report to the lead; no build decision.
  - V clean → B1 is not reproduced under this script and stays UNRESOLVED. Report to the lead and the reviewer. No
    second block without a new question.
- **n.** At most 3 runs per arm. This is a mechanism and regression check, not a gain block. Nothing from it goes to
  the user as fact without the Timeline attribution.

## P-071 result (G, pin-hold-v2, 2026-10-03 ~03:35-05:0xZ, iphone-runner; scored by fix-nav-morph)

All OBSERVED, in our setup. The phone stamps every number here; n = 3 per arm. Derived numbers only: no gesture
record is committed (N1). Scored from iphone-runner's `out/p071/score-p071.json`.

**Block validity**
- 9 counted runs, all valid. Each ran in the runner's own exclusive `--no-timing` hold, after an in-hold wait for
  load1 ≤ 8.
- Every run's idle rAF rate is 59 Hz, so no run was in Low Power Mode.
- Both sentinels pass: S-open bottom 60.2 / scroll 57.9 fps, S-end 60.2 / 57.6 fps.
- Pin approach, the same in every run and arm:
  - transit pushes 10-12 scroll natively, with 0 touchmoves prevented;
  - push 12 overshoots into the end bounce (y 5414-5426);
  - pushes 13-24 have every touchmove prevented;
  - settle y is 5212-5219.

**Metric 1: collapse** (2 consecutive 2 s windows < 30 fps, from pin arrival to the end of the run)

| arm | runs collapsed | arm verdict |
|---|---|---|
| C | 1 of 3 (C3) | inconclusive |
| V | 0 of 3 | **clean** |
| D | 0 of 3 | **clean** |

- C3 is not a pin collapse.
  - Its two windows (27.5 and 25 fps) sit in the cycle phase, 9.2-12.9 s after the `cycle` mark: no touch, y steady
    at 5255, morph closed, frames 26-77 ms.
  - The dip starts 3 s after the nearest touchend and ends when the next up stroke begins.
  - Every run of every arm dips more mildly in the same phase (33-46 fps windows).
  - The push and 8 s idle phases run at 46-60 fps in all 9 runs.
- The uncounted D warm-up collapsed (15-30 fps from the last transit push on, settle y 5230; a cold port, its first
  load). It is outside the verdict.

**Metric 2: arm and disarm windows** (per-run max dt over the run's two windows of a kind)

| window | C | V | D | median D − C | verdict |
|---|---|---|---|---|---|
| arm, max dt (ms) | 70, 64, 74 | 68, 64, 69 | 70, **98**, 66 | 0 | not separated-worse |
| arm, frames > 50 (46 / 54) | 10 (14/6), 11 (14/10), 14 (16/11) | 8, 7, 9 | 11 (14/8), **19 (20/16)**, 9 (13/5) | | |
| disarm, max dt (ms) | 32, 33, 35 | 33, 34, 35 | 35, **85**, 39 | +6 | not separated-worse |
| disarm, frames > 50 (46 / 54) | 0, 0, 0 | 0, 0, 0 | 0, **2 (3/2)**, 0 | | |

- Neither D window is separated-worse. The verdict rests on the max, so the twin thresholds cannot change it: it is
  not threshold-sensitive.
- **D2 is an outlier in both window kinds.** Its cycle-2 arm window has only 27 frames and its disarm window only
  24, against 39-46 everywhere else. Its 2 disarm frames over 50 ms are the only ones in any arm.
  - That fails the "no D-only frame > 50 ms" half of the 60 % bucket.
  - The cause is UNRESOLVED. The Timeline attribution run on D's cycle phase (I-079 `gesture --timeline`, queued
    first) is the decisive check.

**Against the predictions**
- C clean ~90 %: **miss** (C3 is 1 of 3, inconclusive, a cycle-phase dip).
- V: the clean branch (~30 %).
- D: the prediction was conditional on V collapsing, which did not happen; D is clean.
- Arm/disarm: the separation part is a hit. The "no D-only frame > 50 ms" part is a miss, on D2 alone.

**Reading under the card**
- **V clean → B1 is not reproduced under this script and stays UNRESOLVED.** It goes to the lead and the reviewer,
  and there is no second block without a new question.
- P-036's capped V runs (2/2) differed from these 9 in heat and script. P-036's V1 ran at 40.3-41.2 °C (battery log,
  V1 start 40.29; review round 2), V2 at 42.6-43.3 °C after an unparked gap, and both ran under arm-scope-touch-v1.
  Here the phone was at 37.1-38.6 °C, parked between runs. Whether heat or the script state explains the difference
  is UNRESOLVED.
- **The question that reopens B1** (lead, 05:5xZ, after review round 2): does V collapse at the capped pin when the
  phone is at 40-41 °C, P-036's temperature? It goes to the hot-held block P-073 below, not to a disclosed risk.
- D shows no pin collapse and no separated-worse listener churn, with D2 flagged pending attribution.
- The card's decision rule has no branch for "V clean, D clean". Whether D goes on to the P-036 confirmation and the
  F swipe is the lead's call.

## D2 gate: Timeline attribution (iphone-runner, after P-071; uncounted, G pin-hold-v2 `--timeline`, I-079)

All OBSERVED, in our setup: n = 1 per arm for C and V, 3 for D, Timeline on, no run collapsed. Derived numbers only
(N1); the records and the runner's analyzers stay in its worktree (`out/p071/`, `out/iphone-runner/p071-tl.mjs`,
`p071-comp.mjs`).

- **The D2-like outlier came back on tD3** (arm max 93 ms), so it is not a one-off of D2.
- **What a frame over 50 ms is, in every arm:** one WebKit `Composite` record of 35-80 ms (up to 318 ms in the worst
  frames) carrying ~91-94 Paint children (4 normally); the Paint time inside one such Composite is mostly 1-2 ms, at most
  3.2 / 4.0 / 8.0 / 10.6 / 7.0 ms (tD1 / tD2 / tD3 / tC / tV). The rest of such a frame: JS 1-9 ms (rAF
  callbacks at JS :12684, :2671, :13282), style 3-15 ms, layout 1-6 ms, paint 1-3 ms. Touch/pointer event dispatch is
  under 1 ms per frame. tD3's 93 ms arm frame: Composite 79.6 ms, JS 1.5 ms, style 2.9 ms.
- **Arm windows, per-run max (frames > 50):** tD1 68 (7) / 63 (2), tD2 60 (3) / 63 (6), tD3 93 (6) / 60 (5), tC 66 (6)
  / 65 (4), tV 68 (6) / 66 (7). Window totals per ~1.1 s are the same in D, C and V (JS 60-102 ms, style 87-100,
  layout 27-30, paint 26-39, Composite 700-755).
- **Disarm windows:** max 30-48 ms, no frame over 50 ms, in all five runs.
- The worst frames of every arm fall in the closing down stroke (before the disarm window): Composite up to 117 (D),
  318 (C), 216 ms (V). That is the cycle-phase dip P-071's C3 counted.
- What `Composite` times beyond its Paint children (layer flush/commit) is UNRESOLVED (no WebKit source check yet).

**Gate (lead, 05:5xZ): the attribution must not name D's listener add/remove or anything D changes in the long
frames.** It does not: D's long frames are the same many-layer Composite frames as C's and V's, with event dispatch
under 1 ms. **Gate passed; lead signed D2, 06:4xZ** (OBSERVED, n = 3 D / 1 C / 1 V). The outlier class recurs and is
the many-layer Composite, not the listener add/remove.

Caveats (review-f3-arm-scope, accepted with the signature):
- Timeline did not capture D2's own frames (98 ms arm, 85 ms disarm); what was attributed is the same kind of frame on
  tD3. **D2 itself is not explained.** Its 85 ms disarm frame did not recur in any Timeline run (disarm max 30-48 ms)
  and stays unexplained (n = 1).
- Timeline does not see the UI process, so a UI-process cost of updating touch event regions when D adds or removes
  its window listeners is **UNRESOLVED**, like what Composite times beyond its Paint children.
- In the land request, P-073 counts as the check that covers both (lead).

**What the Paint children are (F-165, from the same Timeline files, no new run; OBSERVED, n = 3 D / 1 C / 1 V).**
`fixes/morph-webkit/composite-faces.mjs` reads them. The records carry only page-coordinate clip quads (no layer or
node id), so the mapping is by geometry and count:
- 51 of the 64 Composites over 50 ms carry exactly 80 digit-sized Paint clips (17-18 x 36-37 px, 8 x-columns, 3 rows
  of 32 / 8 / 40 faces) at page y 5211-5619, inside the end panel. Per run: tD1 10/12, tD2 10/10, tD3 11/12, tC 8/15,
  tV 12/15.
- 8 digits x 10 faces = one 8-digit clock with a layer per face (`.face { will-change: transform }`): the panel clock.
  The other clips in the same Composites are the panel's own layers changing size frame to frame (e.g. 406x750 ->
  403x476 -> 399x129 -> 399x58 at y ~5228), and the digit rows move with them: these are the panel's morph frames.
- Each run has 51-57 such full face repaints, median Composite 33-35.5 ms, against ~3 ms with 1-69 digit clips and
  ~7 ms with none; the Paint time inside them is ~1 ms (median). The same in every arm (arm-independent).
- Exceptions (> 50 ms, no face repaint): tC 95.7-96.1 s (five, 59-106 ms, 4 small clips each, just before C's 318 ms
  face-repaint Composite), tV 88.4-89.1 s (three, 55-72 ms), tD3 109.4 s (one, 51 ms), and mid-page ones at 7.6-13.5 s.
- UNRESOLVED: what the Composite spends beyond its ~1-2 ms of Paint (a commit of ~80 repainted layers is a hypothesis
  only), and why some morph frames repaint all 80 faces and others none. The decisive check is proposed below
  ("Proposed attribution item after P-073").

## P-073 prediction card: B1 hot-held, C / V / D under arm-scope-touch-v1 (registered before any phone data)

Asked by the lead after review round 2 (05:5xZ): P-071 ran at 37.1-38.6 °C, and P-036's V-only collapses ran at
40.3-43.3 °C under another script. This block asks one question: **does V collapse at the capped pin when the phone
is at 40-41 °C, and does D?** Second read: mgmt-ops-9 and review-f3-arm-scope; the lead signs. Id P-073 from mgmt-ops-9.

**What the P-036 records already say** (desk check of iphone-runner's gesture records, no device time; OBSERVED, in
our setup, cause unknown):
- arm-scope-touch-v1 ends in one of two states, decided by where the last transit pass lands:
  - **capped:** settle at y 5215-5216, the end loop runs to its 10-pass cap ("max/10"), so 10 pushes go into the pin
    over ~49 s, then the 2 end pushes;
  - **uncapped:** settle at y 5220-5222, `atEnd` is true after 1 pass, and only the 2 end pushes follow (~9-12 s at
    the pin in all).
- **Every P-036 V collapse came in a capped run.** Capped V 2 of 2 collapsed (V1 start 40.29 °C, onset 4.3 s after
  pin arrival, ~0.6 s after the 2nd pin push's lift; V2 start 42.59 °C, onset at arrival). Uncapped V 0 of 6 (V3 39.89,
  V4 39.79, wV, attempt-1's wV, and attempt-1's voided V1/V2 at 38.2-39.8 °C). Capped C 0 of 5 (C2 38.69, C4 40.0, wC, attempt-1's
  wC and voided C1).
- Cap rates in P-036: V 2 of 8 runs, C 5 of 7 (warm-ups and voided runs included).
- P-071 (pin-hold-v2) capped all 13 runs at 5212-5219, with 13 pushes into the pin, at 37.1-38.6 °C: V 0 of 3.
- So in V, "capped" and "≥ 40.3 °C" have only ever come together. The zone strokes before the pin (in
  arm-scope-touch-v1, not in pin-hold-v2) are a third difference. This block holds heat and script at P-036's values.
- The script's own idle phase (3 s at the top after reload) ran at 58.8-59.6 fps in every valid P-036 run, V2 at
  42.6 °C included.

**Card**
- **Builds.** As P-071: snapshot b1789284481295-4ad4a84a, CSS c6aad94b455f; C = `aw1-10e` (JS 3e2f599a1632),
  V = `mw10e-arm-scope-c` (JS c6d3590576a7, the positive control: B1 was only ever seen in V), D = this build
  (JS 999c4497f37e). Immutable copies from `out/snapshots/`, one port per arm, plain http. New ports, never used by
  another build (F-115).
- **Driver.** G, `fixes/morph-webkit/gestures/arm-scope-touch-v1.json` unchanged (compiler v2 hash d72ee13644cc),
  the P-036 script. Timeline off in counted runs, as in P-036.
- **Counted run = capped run.** A run counts only when its end loop ends "max/10", it settles at y 5212-5219 before
  the `end` mark, and the pin pushes are prevented (≥ 90 % of their touchmoves; P-036's collapsed V1 and V2 had every
  pin touchmove prevented, 34-47 per push, so this cannot drop a collapsed run). An uncapped run is listed with its
  temperature and windows, is never in the verdict, and its arm is re-run in place (the C2 precedent in P-036).
- **Order.** Rotated Latin square C V D / V D C / D C V, n = 3 counted per arm, 9 counted runs. One uncounted
  warm-up per arm's port first (it may be cold; P-071's wD).
- **Budget.** At most 20 runs in all (counted, uncapped re-runs and voids; warm-ups and sentinels not included) and
  100 min of block time. Each run in the runner's own `--no-timing` hold. When the budget ends first, the block is
  scored on what was counted (an arm with < 3 counted runs is read by the arm rule on those, and 0 of 1 or 0 of 2 is
  "not enough", reported as inconclusive). With P-036's cap rates, V may need about 2 attempts per counted run.
- **Heat, the band.** Battery temperature (the runner's battery read, logged at the start and end of every run) must
  be **40.0-41.0 °C at each run's start**, the moment the script's reload is sent. A run that starts outside the band
  is void and re-run in place.
  - **Warming method, the same for every arm:** uncounted W cycles (`iphone.mjs run --driver window`) on the plain
    baseline page (`site-pretty`, its own port, never an arm's port), the method of `research/phone-heat/README.md`
    "Below 36.0 °C", until the battery reads ≥ 40.0 °C. Then open the arm's URL and start. A run warms the phone by
    ~0.5-0.9 °C (P-036 C1 +0.6, V1 +0.9), so between runs the phone is parked and cools with `wait.mjs phone-temp
    --below 41.0` (≤ 10 min), then is warmed again on the baseline page if it fell under 40.0. Each run records
    `start: direct | cooled | warmed`.
  - **Temperature at pin arrival** is logged too (the battery read nearest the first frame at y ≥ 5200; P-036 V1
    reached the pin ~55 s after its 40.29 °C start). Reported per run beside the start and end reads; the band rule
    stays on the start read.
  - **Heat ceiling (device safety; mgmt-ops-9).** At ≥ 42.5 °C on any battery read, or on any iOS thermal notice:
    park at once, void the run, and cool with `wait.mjs phone-temp --below 41.0` before going on.
  - **Charge state** (held or charging, as in P-068 `heat.mjs`) is recorded per run and kept the same for every arm;
    a run whose charge state changed during the run is void.
  - **P-036's unparked dwell is not reproduced on purpose.** V1 collapsed with no dwell before it (C1 then V1 in
    one hold, 40.29 °C), so the dwell is not needed for the collapse; heat is the variable here, and it is brought in
    the same way for every arm, on a page that is no arm. Safari is parked after every run.
- **Validity per run.** Low Power Mode recorded; on = void. The script's idle phase (500 ms after the `idle` mark to
  `z1`) must run at ≥ 57 fps (P-036 valid runs 58.8-59.6, the 42.6 °C V2 included), else void: this catches Low
  Power Mode and a throttled phone, and it is read before the pin, so it cannot see the collapse.
- **Sentinel.** The S sentinel stays (§5.2): it does not conflict with a hot phone. S/W checks passed with 0 failures
  at 36.4-41.5 °C (`fixes/mw10e-arm-scope-c/README.md`), and P-036's S-end passed at 40.7 °C. It runs on C, its own
  port, uncounted, once after the warm-ups with the phone in the band, and once at the block end; pass at bottom ≥ 58
  and scroll ≥ 44 fps. Cooling to 38 °C would leave the band, so a failing sentinel voids every run since the last pass
  and **stops the block** (no cool-and-restart); the lead decides on a re-run.
- **Metric, collapse (as P-071).** Per counted run, from pin arrival (the first frame at y ≥ 5200) to the end of the
  run, fps in consecutive 2 s windows. A run is **collapsed** when 2 consecutive windows are under 30 fps. An arm
  **collapses** at ≥ 2 of 3, is **clean** at 0 of 3, and 1 of 3 is inconclusive.
  - **Told apart from a dip like P-071's C3**, as a second reading: a collapsed run is also tagged **sustained** when
    ≥ 50 % of its windows are under 30 fps (P-036 V1 27 of 29, V2 35 of 35; P-071 C3 2 of 36), else **transient**.
    The decision uses the P-071 rule. If an arm's verdict changes when only sustained runs count, the result is
    "rule-sensitive" and goes to the lead with both readings.
  - Also reported per run, not in the verdict: onset time after pin arrival and after the nearest pin push's lift,
    the minimum window, and the start/end temperature.
- **Attribution, after the end sentinel.** One Timeline run (`Page.disable` → `Page.enable` → `Timeline.start`) on
  a capped V in the band if V collapsed, and on D if any D run collapsed, naming the records in the collapsed frames.
- **Predictions.**
  - C: clean ~80 %, inconclusive ~15 %, collapses ~5 %.
  - V: collapses ~50 %, clean ~35 %, inconclusive ~15 %. (For: 2 of 2 capped hot V runs in P-036. Against: n = 2, and
    P-071's capped cool V 0 of 3 leaves heat and the zone strokes both open.)
  - D: any counted D run collapsed ~20 %. Given V collapses: D clean ~60 %.
  - All 9 counted runs inside the budget ~65 %.
- **Decision (lead, registered before data; read top to bottom, the first matching row wins).**

  | V | D | reading |
  |---|---|---|
  | any | any counted run collapsed | F3 does not land as is (next: build E, window-only touch listeners during the morph; Simulator and Chrome review before any phone time) |
  | any | fewer than 3 counted runs | inconclusive, to the lead, no landing |
  | collapses | clean | D fixes B1: on to the P-036 confirmation on D, then the F swipe, then the land request (with the D2 gate) |
  | clean | clean | heat does not reproduce B1 under this script; B1 stays UNRESOLVED; landing with B1 as a disclosed risk is the lead's call |
  | inconclusive (1 of 3) or fewer than 3 counted runs | clean | V's comparison is void (no positive control); to the lead, no build decision |

  - C with fewer than 3 counted runs: the C comparison is void (no control); to the lead with whatever V and D show.
  - C collapses (≥ 2 of 3): the collapse is not V-specific; B1 is re-framed with the lead.
  - A rule-sensitive verdict goes to the lead with both readings.
  - **An uncapped hot run that collapses** (any arm; listed, never in the verdict) is flagged to the lead explicitly:
    it would refute "the collapse comes only with the capped state", which this card's framing rests on.
- **n.** At most 3 counted per arm: a mechanism and regression check, not a gain block. Nothing from it goes to the
  user as fact without the attribution run.

## Proposed attribution item after P-073: the panel clock's face layers (F-165; proposal, not registered)

Asked by the lead (07:0xZ). An uncounted attribution pair at the pin, not a gain block; the lead fits it into the phone
queue after P-073.

**Which build lines have the 80-layer panel clock** (read from the CSS/JS, no run):

| line | CSS | panel clock faces | layers at the pin |
|---|---|---|---|
| baseline (`site-pretty`, what `main` serves) | `.face.svelte-1quva9c { will-change: transform }` (baseline CSS 1408-1409), no panel override | 10 per digit, each with will-change | 80 |
| F3 arms C / V / D (P-036, P-071, P-073) | c6aad94b455f (`aw1-10e`): the same `.face` rule (CSS 1414-1415), no panel override; the JS will-change gate (scroll-engine /10e, JS 2699-2702) leaves `.face` out | as baseline | 80 (the P-071 face repaints match) |
| st6-rb2 ("optimize 2", the user's last finger run) | f523598b2a24: adds cdwc's P-017 rule `.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c { will-change: auto; }` (CSS 11936-11938) | 10 per digit, no will-change in the panel | 0 (cd-strip G4: 0 panel clock layers at the pin, Simulator) |
| wave-2 stack (st6-rb2 -> cd-strip -> cd-roll-ca -> countdown-faces (b)) | cd-strip keeps that rule and adds the same for `.strip` and `.cell` in the panel (its `patch.diff`); cd-roll-ca is hero-only and leaves the panel's rAF spring and layering as they are (fix-cd-roll-ca, 07:0xZ) | strips | 0 |

So F3-D as it would land (JS 999c4497f37e on CSS c6aad94b455f) runs on a line whose panel clock has 80 face layers;
the user's line (st6-rb2) and the wave-2 stack do not.

**Pair (proposed).**
- **A = D as measured:** JS 999c4497f37e, CSS c6aad94b455f (80 panel face layers).
- **B = D with the panel faces unlayered.** Preferred: the same JS and CSS c6aad94b455f plus only the P-017 rule
  above, byte-identical to st6-rb2's CSS 11932-11938 (comment and rule). This isolates the face layers: one CSS rule is the only
  difference.
  - The lead's other form, D ported onto st6-rb2 (D's JS delta applied over st6-rb2's JS 7bf7c4657d21), answers
    "does D behave the same on the user's line". It also changes ~130 other CSS lines and the morph panel's own JS
    (morph-panel-lazy-mount, scene-scope, rotator, the PMsweep gate), so it cannot say that the faces are the cost.
    The port is not built yet and needs a conflict check.
  - If the lead wants both questions answered, the one-rule B goes first.
- **Before phone time:** a Simulator functional check of B (shared lane): 0 panel clock layers at the pin, the same
  v1c pin exposure (9 pushes, end pushes prevented), and pixels at the pin equal to A apart from the countdown phase.
- **Driver and phone:** G, v1c (0653995a35be), Timeline on (`Page.disable` -> `Page.enable` -> `Timeline.start`), a
  cool phone (start ≤ 38.6 °C, the P-071 range, so heat is not a variable), Low Power Mode off, n = 2 per arm in the
  order A B B A, each in the runner's own hold, parked between runs.
- **Readout per run** (`composite-faces.mjs`): full face repaints (Composites with ≥ 70 digit clips), Composites over
  50 / 34 ms, their median, and the median Composite of the morph frames at the pin (frames whose clips include the
  panel's resizing layers).
- **Predictions (before data).** B: 0 full face repaints (~90 %; P-017's phone data had 0 % layer repaints without
  the will-change). Given that, B's morph-frame Composite median falls to ≤ 12 ms (~45 %), stays ≥ 25 ms (~35 %),
  or lands in between (~20 %). B has fewer Composites over 50 ms than A in both runs: ~55 %.
- **Reading.**
  - Faces gone and the Composite near the no-digit ~7 ms median: the face layers are the cost of the closing-stroke
    frames. This ties them to cdwc / cd-strip, and the frames are already gone on the user's line.
  - Faces gone but Composites still ≥ 25 ms: the cost is the panel's own resizing layers, and the question moves to
    the morph panel (UNRESOLVED, new item).
  - Faces still repainted in B: the rule does not reach them on this line; back to the CSS (no phone time).
- No landing decision rests on this pair. D's land gate stays P-073 (lead).

## Review round 1, non-blocking items: where each went

- Desktop wheel armed from load: CONFIRMED risk, stated in Risks below and in `fixes/mw10e-arm-scope/README.md`; not
  measurable with the CDP ack proxy.
- OBSERVED wording: `fixes/mw10e-arm-scope/README.md` (event-region rebuild now a candidate, F-062 UNRESOLVED) and
  `fixes/mw10e-arm-scope-c/README.md` (the ~190 ms level, "none detected at this block's resolution", V2's 16 frames,
  and the iOS touch-region note with its source lines, claims-audit W5/W6).
- Slips in `fixes/mw10e-arm-scope-c/README.md`: 38.7-41.2 °C (V1 ended at 41.2), V1 1.9 and C4 1.8 min, load1 18.6
  (V2) and 8.8 (V4).
- Sentinels: `fixes/mw10e-arm-scope-c/p036-score.mjs` now puts them in `sentinels` and `cardPart` (no sentinel →
  INCOMPLETE, a failed one → VOID). Re-run on the P-036 records: both sentinels pass, zones unchanged, card part PASS.
- Header ref `T`: **not in this build.** The touch target is still `document.querySelector('header.start-selling-top-nav')`
  at setup. `T` is the component's `bind:this` ref to the same element (JS ~13565-13570), so the swap is one
  expression and behaviour-identical, but it changes the JS hash. The lead (03:0xZ): what lands is byte-for-byte the
  build the phone measured, so the `T` swap is its own small follow-up after landing, with a token diff, a Chrome
  functional check and a review read.
- Dangling refs: `touch-check.mjs` and `probe-results/` are now named as working-branch files; `touch-gap-check.mjs`,
  `pinhold-sim.mjs` and the pin-hold gestures land with this folder.
- `aw1-10e` is not on `main`: stated in the header here and in `fixes/mw10e-arm-scope-c/README.md`.

## Risks

- **Desktop wheel, armed at load (from F3, unchanged here).** A window `wheel` listener with `{passive: false}`
  makes each wheel scroll wait for the main thread. CONFIRMED: https://developer.chrome.com/blog/scrolling-intervention-2
  says Chrome 73 made root-target (window, document, body) wheel listeners passive by default, and that
  `{passive: false}` opts back into blocking ("a noticeable delay in scroll response").
  - In the original and in aw1-10e this was true only inside the 200 % zone near the end of the page. In F3 and D it
    is true on the whole page.
  - The Chrome probe could not separate the builds. During a 400 ms main-thread busy period, the CDP
    `Input.dispatchMouseEvent` round trip was 352-372 ms in C, V and D alike, although C has no wheel listener at the
    top of the page. So the CDP ack waits for the main thread anyway, and it is no proxy.
  - The risk stands as stated (desktop only, no phone effect) and goes into the land card.
  - Option, not built and untested (a follow-up, not a blocker, per the lead): keep the wheel listener off at load
    and arm it as aw1-10e did, at the 200 % zone edge, but only where `matchMedia('(any-hover: hover), (any-pointer:
    fine)')` matches, so a touch-only phone never carries it and a desktop carries it only near the end. It would
    need its own Chrome wheel check (a real wheel, not the CDP ack, which does not discriminate) and a reading of
    what a hybrid touch laptop does with it.
- **Listener churn on every morph cycle.** D adds the two window touch listeners when the morph starts (E's
  changed-target branch, mid-gesture) and removes them when the spring is back at 0 (`I()` with `C()` false). So
  every open/close cycle at the end of the page changes the window's touch listener set twice. C never did this: it
  added its window listeners once at the zone edge and kept them inside the zone. What one add or remove costs on
  the phone is unknown (WebKit may have to update the UI process's touch event regions, cause and cost
  UNRESOLVED). Per X1, a window touch listener change needs a phone segment card, so the phone ticket times both
  the morph-start frame (arm) and the morph-end frame (disarm), C vs D, with Timeline (gesture `pin-hold-v2`: two
  close/open cycles at the pin).

## What needs re-measuring (D is a new landing build; P-036 covers only -c)

1. The B1 phone ticket (approved under the T-027 #5 F3 exception, after P-068 H2): G `pin-hold-v2`, C / V / D,
   Timeline on V (and on D if D collapses), the idle triple at the pin, and the frames around each morph start and
   end on D (arm/disarm) with dt and Timeline records, C and V side by side. Decision rule (lead): V collapses and D
   does not → D is the candidate → item 2 → F swipe. D collapses → build E (window-only listeners during the morph);
   no phone time until E passes the Simulator and a Chrome review.
2. P-036's card part transfers by argument: pre-morph D is byte-for-byte F3's listener set, and the zone strokes never
   arm the window. A confirmation run of P-036 on D (≥2 V-arm runs against C) is the honest minimum before landing.
   - Outcome (P-071): V clean, so B1 was not reproduced at 37-38.6 °C. The lead (05:5xZ) reopened it on heat: the
     hot-held block P-073 (card above), C / V / D at 40-41 °C under arm-scope-touch-v1. D's gate before landing is
     the D2 Timeline attribution (passed, see "D2 gate") plus P-073; item 2 waits for P-073.
3. The F swipe stays postponed until 1 and 2 are done.
4. The Chrome regression A/B (`fix.mjs ab`) is not needed for the touch change: Chrome has no touch on the desktop
   A/B. It is deferred under the timing rule in any case.
