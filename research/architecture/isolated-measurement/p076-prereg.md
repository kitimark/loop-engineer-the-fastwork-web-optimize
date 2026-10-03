# P-076: countdown calls per countdown second (pre-registration)

This file, the scorer and the probe are all committed before any P-076 data exists. Owner: arch-isolated-measure. The
id comes from mgmt-ops-10. The lead asked for this check on 2026-10-03, after the P-075 Chrome readout.

| file | sha256/12 | role |
|---|---|---|
| `judge-tick.mjs` | b84f4156010c | scorer (rev of 3605ca71b0a3 after the mgmt-ops-10 read) |
| `tick-probe.mjs` | d30b38cc15be | the probe: page loop, trace, fires0/fires1/cd/timers/countdownScreenChanges |
| `tick-hold.mjs` | 3e8c1e4dce2c | starts one server per arm, hash-checks the served JS, runs the probe |
| `run-tick.sh` | 1c2ebd25142f | the two shared-lane slots |

**P-075 stands as recorded.** Its family FAIL on countdown FunctionCalls per 4 s window is not re-scored. P-076 is a
separate check, measured on new loads only. Why we ask again: for the same build and mode, P-075's per-window
counts ran from 108 to 215. A fixed window catches a varying number of digit rolls, and partial rolls at both edges.
P-076 asks whether FRZ predicts the full-page change once the count is cut at the countdown's own events.

## Arms, modes, engine

- **Arms:** the same as P-075 (`pilot-prereg.md`), served from the same immutable copies and hash-checked at run time:

  | Arm | JS sha256/12 | CSS sha256/12 |
  |---|---|---|
  | C | 4606120cf392 | 27776f3d4138 |
  | C2 (A/A) | 4606120cf392 | 27776f3d4138 |
  | Vf | 638b8e03e81c | baseline |
  | S | 7bf7c4657d21 | f523598b2a24 |
  | C6 | 5e37af69bcc4 | 40078cb2d9cf |
  | V7 | 73dff152e454 | 40078cb2d9cf |

  A served-JS mismatch aborts the probe before any load (exit 3, no records).
- **Modes:** FULL and FRZ, defined exactly as in P-075. FRZ freezes the rest of the page and keeps the hero
  `[role=timer]` subtree running. A FRZ load whose post-window clock screenshots show 0 changes is VOID.
- **Engine:** Chrome 154 headless, with the P-075 settings, except that the trace window is **6 s** instead of 4 s.
  - n = 3 loads per arm and mode; the builds run round robin.
  - Two shared-lane probe slots of ≤300 s each, one per mode.
  - No Simulator part.

## The count, cut at the countdown's own events

- **Fires.** The countdown's interval callback is `let e = () => { z(c, Date.now(), !0); }`, started by
  `window.setInterval(e, 1e3)` inside the countdown range. The probe finds it in each arm's served JS. Its 0-based
  lines: C 3931, Vf 3972, S 4145, C6 4156, V7 4333. A fire is a main-thread trace FunctionCall in
  `nodes/2.DyWL8TcE.js` at that line.
  - The trace's line base is not pinned down here, so the probe keeps both candidates, that line and the next one.
    The next line is the callback body and starts no function.
  - The scorer uses the non-empty candidate. If both are non-empty, the load is VOID.
- **Countdown calls.** Every main-thread FunctionCall in the countdown range (`var UE = { stiffness` .. `var lD = h(`,
  ±1 line, as in P-075). Fires are included.
- **Timer instances.** T is the number of `[role=timer]` elements on the page.
  - The P-075 records show T = 1 for C, C2 and Vf, and T = 2 for S, C6 and V7: st6-rb2 adds a second timer.
  - A load whose T differs from these values is VOID.
- **Countdown seconds.** With the fires sorted f1 < f2 < …, second i spans [f_i, f_(i+T)). That stretch holds exactly
  one fire of each timer instance; with T = 1 it is one tick interval.
  - The partial stretches before the first fire and after the last fire are dropped.
  - A load whose seconds don't each span 1000 ± 150 ms is VOID ("irregular fires").
  - A load with fewer than 4 full seconds is VOID.
- **Per-load metric.** The median, over the load's countdown seconds, of the countdown calls whose timestamp falls in
  that second. The median keeps an occasional multi-digit roll from moving the metric. The mean is printed but not
  judged.
- **Other VOIDs.**
  - A load with no fires found.
  - A FRZ load whose clock check is missing or 0. The probe always writes `countdownScreenChanges`; it is 0 when the clock
    rect is missing.
  - A record without the fires0, fires1 and cd arrays.
- **Unscorable pairs.** A pair with fewer than 2 valid loads in any of its four cells is UNSCORABLE. With fewer than
  2 scorable judged pairs, P-076 is INCONCLUSIVE.

## Rule (quoted from P-075, applied to the per-load metric)

- Judged pairs: Vf − C, C6 − S, V7 − C6. Only V7 − C6 is cd-roll-ca's own effect.
- There are no secondary pairs. C6 − C and V7 − C would compare a T = 2 arm with a T = 1 arm, so their per-second
  counts don't compare, and the scorer leaves them out.
- dFULL = mean(FULL_b) − mean(FULL_ctrl), and dFRZ = mean(FRZ_b) − mean(FRZ_ctrl), over valid loads.
- AA = max(|FULL_C − FULL_C2|, |FRZ_C − FRZ_C2|), using means. If only one mode has AA, the verdict is flagged; if
  neither does, AA is UNKNOWN and the verdict is flagged to the lead.
- tol = max(0.15 · |dFRZ|, 2 · AA, 2). When AA is UNKNOWN, AA counts as 0 here, so tol = max(0.15 · |dFRZ|, 2), and
  the verdict is flagged.
- **PASS** for a pair when |dFULL − dFRZ| ≤ tol, and the signs agree whenever |dFRZ| > tol.
- **Family FAIL** when ≥ min(2, scorable judged pairs) judged pairs miss.
- A miss within 2 × AA of tol is flagged "noise-sensitive". AA comes from the baseline pair only, so the noise of S and
  C6 as controls is not covered by it.

## What each outcome decides (rendering cost card, README §6)

- **Family PASS:** the card may take its script-per-event field for this family (countdown calls per countdown second)
  from FRZ loads. Per-event cutting becomes the card's default for event-driven script counts.
- **Family FAIL:** script per event stays full-page only for this family. FRZ supplies only the fields P-075 passed:
  style elements, layout and paint.
- **A single judged miss without a family FAIL:** that pair's card row takes script per event from FULL.
- **INCONCLUSIVE:** nothing changes; P-075's outcome holds.

## Known limit (written now)

In S, C6 and V7, the second timer sits outside the kept subtree. In FRZ, its CSS and Web Animations are paused, but its
JS keeps running. Its calls are counted in both modes. If its rolls depend on animation events, FRZ can change its
call count. That is why C6 − S and V7 − C6 get lower confidence below.

With T = 2, consecutive countdown seconds overlap by about half: [f1, f3) and [f2, f4) share [f2, f3). The median
still summarises one load, but its seconds are not independent.

If the second timer's interval does not run at 1 Hz, every S, C6 and V7 load is VOID as "irregular fires". Then C6 − S
and V7 − C6 are UNSCORABLE and P-076 is INCONCLUSIVE. Such an outcome says the cut rule doesn't fit two timers. It is
not a measurement result about FRZ.

## Confidence (before data)

| | P(PASS) |
|---|---|
| Vf − C | 0.75 |
| C6 − S | 0.6 |
| V7 − C6 | 0.6 |
| Family PASS | 0.65 |

## Out of scope

No phone, no ms or fps claims, no gain claim.
