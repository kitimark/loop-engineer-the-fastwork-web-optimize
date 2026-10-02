# Fix: mw10e-cdwc (morph countdown faces without will-change)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (iPhone P-017, P-029: PASS, driver M); review round 2 (review-cdwc NEEDS-WORK 14:0xZ: B1, B2, B4
addressed here; B3: G block of the landing pair ticketed by the lead, no waiver). Re-check (review-cdwc, on 3d664c7):
B1, B2 and B4 resolved; B5 (twin wording) fixed here; landing gated on P-032 PASS (NULL or WORSE: no land).
**Topic:** morph-webkit / nav-morph (owner fix-nav-morph). The full history is in `fixes/morph-webkit/README.md` on the
working branch `worktree-agent-a277ea00c8773c1ea`, which is not part of this landing. This landing carries the
deliverables, plus the two Chrome probes and their results under `fixes/morph-webkit/`.
**Base:** stacked on `aw1-10e` (`node tools/fix.mjs apply mw10e-cdwc --on aw1-10e`); CSS only, independent of the
pin fix (g) and of R1 (gh)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css`: one rule appended (+8 lines with the comment). Frozen
CSS sha256 prefix 5dc6e8e37388; the JS is unchanged (aw1-10e 3e2f599a1632).

## Attribution status

- postmortem-morph Case 4 (`research/design-engineering/postmortem-morph.md`): **LOCATED** (layers and stage; trigger
  UNEXPLAINED).
- P-017 ablation (gh vs gh-cdwc vs gh-cdhid, 11:57-12:07Z): PASS. Removing the faces' repaint, with or without their
  layers, removes the cost.
- claims-audit §2.1 P4 (`research/architecture/claims-audit.md`): mechanism **CONFIRMED** in WebKit source, with three
  corrections; attribution OBSERVED (P-017 is the device evidence).
- P-029 (transfer to the landing base without R1): PASS.
- The lead's fast path (`research/management/ops-handover.md`): "lands on phone gain evidence + review; mechanism
  wording stays OBSERVED ('repaint of the faces removed (observed)')".
- Negative sibling arm: **P-016b** (gh hold 900 vs hold 2000, same slot as P-017): miss/null. A cold back-store after
  a long rest is not the cost, which is consistent with a per-tween-start face repaint.

## Why it lags

- When the morph starts, the morph panel's scene goes from paused to active. The scene-pause rule (CSS 11809,
  `will-change: auto !important` while paused) stops applying, and each countdown digit face gets back its
  `will-change: transform` (CSS 1408). That creates ~80 composited face layers at the tween start.
- On the iPhone those face layers were repainted in 76 % (P-017 on gh; the figure in the CSS comment) and 85 % (P-029
  on g) of the frames in each tween's first 450 ms.
- Median frame interval in the first 300 ms of each forward tween (pooled per run, recomputed from the raw md files):
  gh 26-35 ms (P-017), g 35.5-40 ms (P-029); with the rule 18-22 and 20-23.5 ms.
- Mechanism: claims-audit §2.1 P4, CONFIRMED by source. When layout dirties a composited layer's geometry, WebKit
  repaints the whole layer if its device-pixel-rounded sub-pixel offset from the renderer changed (1/6 CSS px buckets at
  DPR 3; no `will-change` exemption). That these 80 repaints come from this mechanism is OBSERVED (in our setup, cause
  unknown beyond P-017's ablation). Wording: "repaint of the faces removed (observed)".

## What changed

```css
.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c {
  will-change: auto;
}
```

- Only the morph panel's countdown is affected. The page's other countdown keeps its face layers.
- No `!important` is needed: specificity (0,4,0) beats `.face` (0,2,0), and the only other rule that sets
  `will-change` on these faces is the scene-pause rule, which also sets `auto`. So the computed value is `auto` in
  every scene state.
- Keep the scope hash: a bare `.face` would also match the unit wrapper `.face.svelte-1666oc5`.
- No DOM, ARIA, focus or inert change; no listener, observer or JS write change. Idle rows of the Chrome A/B are equal
  (idle fps 119.8 vs 119.8, 0 frames over 34 ms on both sides, LoAF 0).
- Visual parity: see "Frozen-frame parity" below.

## Why that is faster

The faces paint into the panel's own layer instead of being ~80 separate layers. The per-frame whole-layer repaints
of the faces at the tween start are gone (0 % of frames on the phone), and the layer count at the m=1 hold drops
from 113 to 33.

## Before / after

**iPhone, P-029: g vs g + this rule** (the landing stack without R1). Driver M (`__fwMorphDrive` debug hook), hold
2000 × 3, C V V C C V V C, 13:17-13:25Z. Sentinel passed. Moving frames are 0 < m < 1, first frame dropped.

| | g (control) | g-cdwc |
|---|---|---|
| moving frames > 50 ms per run | 1 / 2 / 3 / 27 | 0 / 0 / 0 / 0 |
| moving frames > 34 ms per run | 51 / 48 / 47 / 58 | 0 / 0 / 1 / 0 |
| ±4 ms (>46/>54, >30/>38) | 2-37 / 0-20, 56-66 / 28-55 | 0 / 0, 0-2 / 0 |
| moving p50 | 29-40 ms | 18-23 ms |
| moving p95 (prediction (4): 28-45 ms) | 45 / 44 / 45 / 64 | 23 / 23 / 29 / 23 |
| max | 54-68 ms | 28-35 ms |
| excess per fwd tween, first 450 ms | 209-234 ms | 79-146 ms |
| face-repaint frames, first 450 ms | 85 % | 0 % |
| layers at the hold | 113 | 33 |
| atZero (m = 0) frames > 34 ms per run | 3 / 3 / 1 / 4 | 0 / 0 / 0 / 0 |
| atOne (held m = 1) frames > 34 ms per run | 2 / 3 / 2 / 7 | 0 / 0 / 0 / 0 |
| atOne p95 / max | 17-18 / 35-57 ms | 17 / 17-25 ms |

- Predictions (1)-(3) hit. Prediction (4), moving p95, measured median 23 ms: **outside the interval, on the good side**
  (recorded in PREDICTIONS.md by mgmt-ops-5).
- Twins (either-twin rule, main 77c480e):
  - **>34 is not threshold-sensitive**: >30 is 56-66 vs 0-2, and >38 is 28-55 vs 0.
  - **>50 is threshold-sensitive.** At >50 it is 1/2/3/27 vs 0, which reads better. The >54 twin is 0/1/3/20 vs
    0/0/0/0; g's run with 0 makes the ranges overlap, so that twin reads within noise.
  - Near-band frames: g-cdwc has frames in (30, 38] (runs 2 and 3 at 31 and 32 ms, run 6 up to 35 ms), and g has many
    in (46, 54].
  - P-032 is scored the same way.
- P-017 (gh vs gh-cdwc vs gh-cdhid) showed the same mechanism and size of effect on the R1 base: face repaint 76 % → 0 %,
  layers 113 → 33, excess per forward tween −120 to −150 ms.

**Driver scope (review B3).** Every phone claim above is driver M, on gh (P-017) and on g with the debug hook (P-029).
The landing pair, aw1-10e vs mw10e-cdwc, has not run on the phone, and there is no G run yet. The lead ruled no waiver:
a G block of aw1-10e vs mw10e-cdwc is ticketed right after P4 (mgmt-ops-5). F evidence: the user's blind swipe A/B, run by
iphone-runner, is still in progress.
- **P-032 amendment (b), before any counted data** (lead 15:1xZ; second read OK by mgmt-ops-5, P-032 row, docs-2
  788fb20). Reason: I-038. A morph-log hook's second inspector connection hangs the gesture tool's connection, so the
  run has no m. Instead, the morph's state is rebuilt from gesture-rec's touch rows, using the handler code (aw1-10e
  JS 12943-12950 and 13275-13320; the same lines in both arms):
  - **State machine.** Each touchmove with defaultPrevented=1 (the morph's capture handler `M` called preventDefault)
    sets a target from its finger delta, n = previous clientY − this clientY. The previous clientY comes from the
    same touch sequence, starting at its touchstart.
    - n ≥ 1 sets target 1 (forward); n ≤ −1 sets target 0 (reverse).
    - A tween starts only when the target changes (`E`). Nothing returns m to 0 by itself: no timer, no touchend
      handler. Only a downward finger move (or wheel up) reverses it.
    - Every tween lasts 680 ms (`ZM` r = 680, cubic ease-out, clock = `performance.now()` in the handler).
  - **Forward tweens in finger-protocol-v1 (asPerformed): exactly 2 per run.**
    - Push 1 (first stroke after the "push" mark). m = 0 at its start: by the code, k is false away from the end zone
      while C() is false, so hero and traverse moves are never prevented.
      - The hook-free test runs showed the same, but they played every stroke as a ~50 ms flick (I-042 interim,
        ts-gesture, OBSERVED). So the observed prevented counts must be checked again after I-042.
    - The up stroke of drag-into-end (560 px / 1500 ms). The down stroke before it (450 px / 700 ms) starts the
      reverse tween on its first move. That tween ends about 700 ms after the stroke starts, and the 300 ms pause
      follows, so m = 0 at rest with about 300 ms margin.
    - Not scored as forward tweens: pushes 2-3 and dwells 1-6. They are up strokes at m = 1, so their target stays
      1 and no tween starts, whatever the gap.
    - The registered "expected 3-10 forward tweens per run" was a driver-M figure. It is corrected here, before any
      data, to 2. A run with fewer than 2 is void (as registered), so both must be present.
  - **t0** = the timeStamp of the first prevented touchmove with n ≥ 1 while the rebuilt state is 0. Fallback: the
    first touchmove of that stroke with scrollY at max, flagged "t0-fallback".
    - The window (t0, t0+450] and every verdict rule stay as registered.
    - Against the registered t0 (the last m = 0 frame), this t0 is up to 1 frame later. The move is delivered after
      that frame, and the tween's first m > 0 frame is the rAF of a later rendering update.
    - So the window ends up to 1 frame later, and the activation frame stays inside it.
    - Per tween the scorer flags "t0-lag": frames between the OS delivery (timeStamp) and the handler, which cannot
      carry m > 0. The flag is reported and changes no rule.
    - Withdrawn: "WDA sends one touchmove per still stroke". That was an artifact of the I-042 flicks: pointerMove
      durations were dropped, so a 940 ms move arrived as one touchmove.
    - The scorer does not assume one move per stroke. It runs the state machine over every touchmove, with n taken
      between consecutive moves of a sequence.
    - With real stroke durations, the reverse tween of the drag-into-end down stroke (700 ms) ends about 20 ms before
      the stroke does. The last few down moves then scroll the page, which the scorer ignores because they are not
      prevented. The up stroke's tween starts at its first prevented move with n ≥ 1, once the end zone (`O`) holds
      again.
    - Scorer: a local script that rebuilds the state from the touch rows. Its run on the void flick-mode test run
      (push 1 was the only forward tween, 597 held frames) only shows that the code paths run. It is redone on the
      first valid post-I-042 run, before any counted run is scored.
    - **Simulator mechanism re-check after I-042** (2026-10-02 ~00:25Z). Counts only; Simulator timing is never a
      verdict.
      - Setup: 2 runs of finger-protocol-v1 under compiler v2 (hash ee84ebd4e916) on aw1-10e, driver G on WDA-sim.
        The overlay JS was fetched fresh from a never-used port with no-store.
      - Both runs, by mark (moves / prevented moves per stroke):
        - hero (4 strokes): 39-58 / 0;
        - traverse (2): 9-13 / 0;
        - fling-top, toolbar, reload-scroll: 8-26 / 0;
        - push (3): 27-31 / all;
        - dwell (6): 17-23 / all;
        - drag-into-end down stroke: 38-46 / 33-44; up stroke: 84-91 / all;
        - drag-back: 44-46 / 36.
      - So the code-derived claims hold: hero and traverse moves are never prevented, and push and dwell moves always
        are.
      - The scorer finds exactly 2 forward tweens per run (push 1 and the drag-into-end up stroke), both from
        prevented moves (no t0-fallback).
      - A still stroke now carries 17-31 touchmoves, so the one-move-per-stroke artifact is gone.
      - Both tweens in both runs carry the t0-lag flag: 1 frame between OS delivery and the handler, 10-19 ms
        (OBSERVED, Simulator; reported, changes no rule).
      - Stroke contact was 2-17 % longer than planned on the Simulator; the phone, per ts-gesture, was within +8 %.
        The lead settled the stroke-fidelity rule before any phone data (registered in P-032/P-036, e0b8583):
        - A phone G or F run is void when any stroke's contact time is more than 10 % off plan, in either
          direction, or when the strokes sent and the touch sequences seen don't match.
        - Simulator runs are exempt, so these two runs stand as mechanism checks.
  - **Held m = 1 phase** (prediction 4 and its +8 ms WORSE rule are kept). It covers the frames with stamp from
    (handler time of t0's move) + 680 + 300 ms until the next reverse move, counting only frames while a finger is
    down (a stroke's touchstart to touchend).
    - In v1 that is pushes 2-3 and dwells 1-6, about 12 s per run, plus any tail of the drag-into-end up stroke.
    - p95 per run.
  - Already in the row (mgmt-ops-5):
    - the sentinel is S-driver runs on C after the warm-ups and at the end;
    - the Timeline cycle uses the M driver;
    - a WDA-timeout run is void and may be re-run within the 9-run cap.
- Builds, each from an immutable snapshot over site-pretty:
  - C = mw10e-g (JS 22efa0ab69ba / CSS c6aad94b455f);
  - V = mw10e-g-cdwc (JS 22efa0ab69ba / CSS 5dc6e8e37388).
  - That is the P-029 pair (pin fix g), not the landing pair.
- Design: the lead's three pairs, one C/V, one V/C and one C/C catch, in shuffled order. The pair-to-arm key stays
  sealed until pair 3 is done.
- So far:
  - pair 1: "same";
  - pair 2: "almost same, hero and end of page are laggy";
  - pair 3: "same". The user's note: "hero quite smoother a little bit on page 2, overall, i think they're same".
- **Key opened** (iphone-runner):
  - pair 3 was C/V: page 1 = C mw10e-g, page 2 = V mw10e-g-cdwc;
  - pairs 1 and 2 were the V/C pair and the C/C catch;
  - recordings: iphone-runner's worktree, out/iphone-runner/finger/sw-p3-{1,2}-redo.json.
- **Verdict (F, blind finger swipes): NOT FELT.**
  - All three pairs were answered "same" or "almost same", including the catch pair. So the countdown fix gives no
    felt difference in free swipes.
  - The only lean is pair 3's note, "hero a little smoother on page 2", which is V. That is one remark, in a region the
    fix does not touch (the countdown faces are in the morph panel at the page end, not in the hero). So it is not
    read as an effect.
  - The lag the user names is at the hero and the page end, in both arms.
  - Pair 3's recordings (one finger run per page, so info only, mgmt-ops-5): moving frames >34 ms were 54 for C vs
    65 for V, and >50 ms were 11 vs 13. Free finger runs differ run to run, so this says nothing either way.
  - Logged in the P-032 row as the F stage (console C-001). V was preferred in 0 of 2 pairs, and the catch pair passed.
- **What this means for landing.** The P-029 result predicted this: the fix removes the faces' repaint and about −80
  layers, and the gain is in the morph tween frames. Free swipes don't isolate those frames.
  - The landing gate stays P-032 (G, the landing pair): PASS lands it, NULL or WORSE does not.
  - Under the lead's gate rule, not felt in F does not block a PASS by itself; the lead confirms that at landing. It is
    recorded as "measured gain, not felt in free swipes".

**Chrome** (`fix.mjs ab mw10e-cdwc --on aw1-10e`, mobile 6x, snapshot b1789284481295-4ad4a84a, tools as on main
5075aac). Chrome doesn't show the WebKit repaint (OBSERVED in our setup: cd2-check counted layers, not paint), so no
Chrome gain was expected.

- **No regressions** (n=5 hold): 0 new console errors, 0 new 404s, screenshot diff top 0.10 % / middle 0.01 % /
  bottom 0 % (countdown phase noise), morphReached 5/5 on both sides.
- **Two holds, read separately** (Chrome numbers compare only within one hold):

  | row | n=3 hold, 13:29Z, 0/6 contaminated | n=5 hold, 13:47Z, 6/10 contaminated |
  |---|---|---|
  | scroll >34 ms | 3 [3-4] vs 5 [5-6], **WORSE** (ranges don't overlap) | 5 [3-8] vs 5 [1-5], within noise |
  | scroll >50 ms | 2 [0-2] vs 1 [1-1] | 1 [0-4] vs 1 [1-2] |
  | scroll >20 ms | 15 [14-21] vs 23 [15-27] | 16 [14-25] vs 21 [14-25] |
  | scroll fps | 103.3 vs 99.3 | 102 vs 99.1 |
  | morph fps | 113.7 vs 113.6 | 113.5 vs 113 |
  | morph >50 ms | 0 vs 0 | 0 vs 0 |
  | morph k≥5 per run | (no frame log) | 1/0/0/1/0 vs 0/0/0/0/1 |
  | idle >34 ms | 0 vs 0 | 0 vs 0 |

  - Scroll fps and frames >20 ms lean the same way (slightly worse) in both holds. The n=5 hold is contaminated, so
    its "within noise" is not a null.
  - **Why this is not a cost of the rule** (review B1): the rule is computed-style inert in the scroll phase.
    - Probe: `fixes/morph-webkit/scene-check.mjs`, two short-lane slots, no timing. Results in
      `probe-results/scene-check.json` and `scene-check-sweeps.json`.
    - Setup: aw1-10e and mw10e-cdwc at 430x932 DPR 3, calibrated serve args, a step every 250 px from 0 to the end
      (5345).
    - On every step, in 4 sweeps per build:
      - the panel's `data-start-selling-scene` is `paused`;
      - 0 of the 84 panel faces have computed `will-change: transform`;
      - m = 0.
      - That holds on both builds, because the scene-pause rule already sets `will-change: auto !important` there.
    - The LayerTree count differs between sweeps of the *same* build by about ±5 layers (e.g. base at y=0:
      125/137/132), and the two builds' ranges overlap at every step.
    - The first sweep's one mismatch (y=1986: 144 vs 139) is that within-build spread.
    - The rule's effect starts only when the scene turns active (m > 0). So the scroll-phase frames can't carry a
      cost from it, and no step showed the scene active, which was the re-run trigger.
  - An n=3 range non-overlap happens by chance with probability 2/20 = 10 % per row when the two sides are
    exchangeable, and the table has about 10 live rows, so one spurious WORSE per n=3 A/B is expected.
  - Supporting only (n=5 hold): its k≥5 scroll frames recur at the same positions on both sides (y≈700, 1660-1760,
    3650, end 5345); one frame on each side has no counterpart (base y≈1456, fix y≈931 in a contaminated run).
    k≥5 per run: base 5/5/3/7/5, fix 3/1/4/5/5; k≥7: base 2/1/0/2/1, fix 1/1/2/2/1; no 250 px bin is worse on the fix.
    This can't tell spread from a per-frame cost, so it is not the argument.
  - `results.json` is the n=5 hold (git.head 5514961 is the pre-rebase head of this branch; the tools are the same).

**Frozen-frame parity (review B4).** `fixes/morph-webkit/scene-check.mjs`, one short-lane slot, 14:2xZ.
- Setup:
  - `Date` frozen before load (`Page.addScriptToEvaluateOnNewDocument`);
  - wheel push past the end to the m=1 hold;
  - 2.5 s for the digit springs to settle;
  - CSS/WAAPI animations paused;
  - clip screenshot of the panel countdown rect.
- Result: **0 % of pixels differ at any channel difference** (not only above the >48 threshold) for each comparison:

  | comparison | mobile 430x932, DPR 3 (crop 1098x264 px) | desktop 1440x900, DPR 1 |
  |---|---|---|
  | aw1-10e vs the same page again | 0 % | 0 % |
  | aw1-10e vs the same page with the rule injected | 0 % | 0 % |
  | aw1-10e vs the mw10e-cdwc build | 0 % | 0 % |

- The frozen frame is pixel-identical with and without the rule.
- At the hold: 80 → 0 faces with `will-change: transform`. Layers 141 → 61 on mobile, 146 → 66 on desktop.

## Scenarios not run

Idle after scroll, reload while scrolled, early input, scroll up through the morph, the toolbar collapse, the rubber
band past the end, finger and gesture drivers (G is ticketed; F is running), and desktop on a real device.

## Risks, conflicts, follow-ups

- The only state that pays is the open panel: the seconds digit's spring (~0.3 s per second) repaints a 1ch × 1.3em box
  inside the panel layer instead of moving a layer. The phone's held m=1 data above show no cost.
- Countdown expiry (2026-11-02 05:00Z), panel closed, reduced motion: the rule is a no-op or a pure layer saving (no
  springs, or the pause rule already applies).
- Coupling F-056 / F-076 (UNRESOLVED): countdown-ca (sampled WAAPI keyframes on the faces) may composite the faces
  whatever `will-change` says, which would bring the ~80 layers back. Decisive check: LayerTree count at the hold and in
  the first 450 ms of a forward tween, countdown-ca vs countdown-ca + cdwc. If they come back, countdown-ca should not
  animate the panel faces during the tween. Routed to the countdown-ca owner via de-oss-map / mgmt-ops-4.
- de-hero h3/R3 (a strip per digit) would replace the `.face` DOM; this selector would then need updating.
- Desktop (Chrome only, 1440x900): the rule removes the same 80 face layers at the hold (146 → 66), and the frozen
  countdown crop is pixel-identical. Desktop timing and desktop Safari are not measured.
- The `.svelte-1quva9c` scope hash belongs to this frozen build. Upstream should use a semantic class.
