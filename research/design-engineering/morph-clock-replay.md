# D4: morph clock-shift replay (de-unknowns-ux)

Desk task D4 of `research/architecture/unknowns-actions.md` (X-U2, unknowns-ux U2), 2026-10-01. Offline only: no
phone, no Chrome, no locks. Script: [`morph-clock-replay.mjs`](morph-clock-replay.mjs). It reads the 16 cool
committed driver runs (`fixes/iphone-wave2/raw/md-{f1-3,g1-3,g7-9,gh1,gh4-6,ghb1-3}.json`, 96 tweens) and reuses
`metrics()` from [`unknowns-ux-metric.mjs`](unknowns-ux-metric.mjs).

Labels: **data** (the logs), **derived** (the replay), **model** (the assumed frame costs).

## 0. Verdict

1. **Alone, the shift doesn't earn a phone block.** Under de-pm-morph's time-since-start model, it takes the leap off
   the activation gap and puts it on the next frame, which is also slow (35-48 ms in the transient).
   - MWFI: −1.2 ms (−3 %, 0.15 tick).
   - Per-tween max edge leap: 94 → 77 px.
   - Cost: +39 ms before the first motion (derived).
2. **With the countdown repaint removed (P-017), it is complementary, not merely additive.**
   - P-017 alone leaves the activation-gap leap where it is: per-tween max 94 → 94 px.
   - The shift alone: 94 → 77 px.
   - Together: 94 → **35-44 px**. MWFI falls 2.4-3.3 ms on top of P-017's 7-11 ms (derived from the P17 model).
3. **So run P10 after P1, and only if P1 passes. Stack it on P-017's winner:** gh-cdwc vs gh-cdwc + t0+1, not gh vs
   gh-t0+1. Gate on the per-tween max edge leap; MWFI moves less than a tick.
4. **The obvious 3-line version makes the leap worse.** It starts the clock at the first rAF timestamp instead of
   `performance.now()` ("naive" below). MWFI +0.7 ms, +39 ms latency, and the leap still rides the activation gap.

## 1. What the tween does (code, data)

- **The code:**
  - `E()` sets `o = performance.now()` (JS 13032).
  - Each rAF `T(e)` writes `m = ZM(i, a, e − o)`, an ease-out cubic over 680 ms (12694-12698, 13020-13023).
- **The first `T` call is the activation frame:**
  - It writes `m = M(e1)` with e1 = 0.9-17 ms (the driver fires between frames). That flips the scene to active
    (13196), so this frame's render is the expensive activation gap: p50 48 ms, 32-72.
  - The next `T` call writes `M(e1 + gap)` at the ease-out's peak velocity, 3.26 px/ms at the nav edge (739 px).
    That step is 143 px p50 (data), the leap in U2.
- **The reconstruction fits:**
  - The logged m lags one frame: `m[i+1] = M(t_i − o)`.
  - With o = t_a − e1, every tween reconstructs to within 0.62 px.
- **The transient after the activation gap stays slow** (data, `--tweens`):
  - The next three frames run 35-48 ms in most tweens: gh1 runs 58, 69, 73 forward and 72, 85 reverse.
  - That is the face-repaint transient of postmortem-morph §1b.

## 2. Variants and models

| variant | clock start o′ | activation frame writes | change |
|---|---|---|---|
| base | `performance.now()` at the trigger | M(e1) | as shipped |
| naive | first rAF timestamp t_a | 0 | `o = e` on the first call |
| **A1** | t_{a+1} − 16.67 | ε (scene active, 0.8 px) | first call: write ε, set a flag; second call: `o = e − 16.67` |
| A0 | t_{a+1} | ε | same, `o = e` (one extra still frame) |
| clamp | o, but the clock advances ≤ 25 ms per frame | M(e1) | frame-paced clock: a bound, not a proposal |

**Frame-cost models:**
- **T** (primary): de-pm-morph's model. Frame dt is a function of time since the tween started, not of m, so the
  logged dt sequence is kept.
- **Mf** (the H3 alternative): a frame whose content doesn't change is light. A0 gets one 16.67 ms frame inserted
  after the activation gap.
- **P17lo / P17hi** (model of P-017, which has not run yet): in the first 450 ms, a heavy frame (k ≥ 4) loses the face
  composite cost C, floored at 2 ticks.
  - C = 30 / 22 ms (before / after 150 ms; hi) or half that (lo), from §1b's heavy-vs-light composite.
  - The activation gap is kept: layer creation is R5, not P-017.
  - Over the window: P17lo cuts excess per tween 180 → 121 ms and the k≥4 share 47 → 16 %, which passes P-017's
    pre-registered bar (≤ 20 % heavy, ≥ 30 ms lower). P17hi cuts excess to 68 ms and the share to 3 %, the
    "faces hidden" bound.

## 3. Results (derived; 96 tweens, pooled)

Metrics follow unknowns-ux §1.1:
- **MWFI** pairs each step with the rAF gap it covers, as in §1.2.
- **MWFIp** pairs it with the hold before it is shown.
- **JTW** is the median over tweens of the tween's largest excess edge leap, in px.
- **ACT** is the step across the activation gap.
- **LAT1 / LAT50 / END** run from the tween's first rAF to the first visible step / half travel / the final value
  being shown.

| model | variant | MWFI | MWFIp | JUMP p95 | JTW | ACT px | LAT1 | LAT50 | END |
|---|---|---|---|---|---|---|---|---|---|
| T | base | 38.3 | 33.9 | 74 | 94 | 143 | 48 | 184 | 709 |
| T | naive | 39.0 | 33.2 | 77 | 98 | 146 | 87 | 188 | 710 |
| T | **A1** | **37.1** | 32.5 | 65 | **77** | 53 | 87 | 218 | 734 |
| T | A0 | 36.1 | 32.2 | 69 | 81 | 0 | 119 | 236 | 750 |
| T | clamp | 33.5 | 31.8 | 42 | 51 | 77 | 48 | 246 | 866 |
| Mf | A0 | 34.8 | 32.5 | 65 | 77 | 0 | 104 | 235 | 751 |
| P17lo | base | 31.3 | 26.6 | 43 | 94 | 143 | 48 | 170 | 696 |
| P17lo | **A1** | **28.9** | 25.5 | 36 | **44** | 53 | 73 | 209 | 738 |
| P17lo | A0 | 27.3 | 25.4 | 33 | 47 | 0 | 98 | 224 | 753 |
| P17hi | base | 27.2 | 21.6 | 22 | 94 | 143 | 48 | 161 | 697 |
| P17hi | **A1** | **23.9** | 20.6 | 25 | **35** | 53 | 66 | 204 | 738 |
| P17hi | A0 | 21.9 | 20.7 | 21 | 26 | 0 | 84 | 221 | 753 |
| P17hi | clamp | 24.0 | 21.5 | 21 | 51 | 77 | 48 | 187 | 743 |

**Groups.**
- Model T, MWFI base → A1:
  - f: 43.0 → 41.7;
  - g: 38.8 → 37.8;
  - gh: 37.3 → 35.9;
  - ghb: 33.9 → 32.8.
- JTW for gh: 92 → 74 px.
- **Per run:** A1 lowers MWFI in all 16 runs:
  - T: 0.5-2.1 ms;
  - P17lo: 1.4-3.1 ms;
  - P17hi: 2.0-4.3 ms.
- **Noise:** gh's per-tween max leap has an IQR of 88-99 px (n = 24), so a 3+3 block (≈ 18 tweens per arm) resolves
  −18 px and easily −50 px. gh's per-run MWFI spans 35-41 ms, so −1.2 ms is not resolvable.

**Reading.**
- **Additivity on the edge leap (JTW, px).** It is super-additive:
  - P-017 alone (P17lo/hi base): 0.
  - The shift alone (T A1): −17.
  - Their sum would be −17. Joint: −50 (lo) / −59 (hi).
  - The leap rides the activation gap, which P-017 doesn't touch. The shift moves it onto the next frame, which only
    P-017 makes fast.
- **Additivity on MWFI.** Roughly additive, slightly better than the sum:
  - lo: −7.0 and −1.2 apart, −9.4 joint;
  - hi: −11.1 and −1.2 apart, −14.4 joint.
- **A1 vs A0.** A0 buys another 1-2 ms of MWFI for +18-32 ms more latency. Prefer A1: the first visible step is one
  60 Hz step (53 px), then the curve.
- **Mf (H3) doesn't change the call.** If the cost follows the panel change rather than time, A0 does a bit better
  (−3.5 ms), but the leap still lands on the next slow frame.
- **The clamp bound.** Under T alone, a frame-paced clock beats the shift (JTW 51 px, MWFI −4.8 ms), at a cost: the
  end comes +157 ms later and half travel +62 ms later. With P-017 it gains nothing over A1/A0. Not a candidate.
- **The cost of A1.** The first motion arrives 18-39 ms later (one transient frame), half travel 34-43 ms later,
  the end 25-42 ms later. The end lands later because the 680 ms runs from a later start. That is the latency U1/U2 ask
  de-morph to sign off.

## 4. Caveats

- **P17 is a model,** built from §1b's composite figures, not a run. When P1 lands, add the gh-cdwc logs to `GROUPS`
  and rerun (the script takes any `md-*.json`).
- **Model T is the post-mortem's reading** (frame cost follows time, not m). The Mf row bounds the H3 case.
- **The activation gap is assumed unchanged** by every variant. R5(b), activating the scene on arm, would remove it
  instead of hiding it (15 MB held near the page end, morph-endpage R5). Then the shift becomes moot.
- **Driver only.** Under the finger, first frames cost 91-96 ms (morph-endpage §2), so the leap across the gap is ~2x
  and the shift's ACT gain is larger (inference). The finger's restart rate (first frames ~10 % of moving frames)
  also multiplies the latency cost.
- **MWFI is still a candidate metric** (unknowns-ux U3). JTW is the more direct endpoint for this question.

## 5. Proposed pre-registration for P10 (fix-nav-morph files the card)

- **Arms.** gh-cdwc (P-017's winner) vs gh-cdwc + A1, M driver, hold 2000, C V V C. Per tween and direction, in px at
  the nav edge.
- **Prediction (P17lo-hi):**
  - per-tween max excess leap −50 to −60 px (median, 94 → 35-44);
  - MWFI −2.4 to −3.3 ms;
  - first-motion latency +18-25 ms.
- **Null:** within ±15 px on the per-tween max leap.
- **If P-017 fails:** the shift alone predicts −18 px and −1.2 ms. Park P10 behind R5(b).
