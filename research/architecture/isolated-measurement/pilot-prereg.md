# Countdown isolation pilot: pre-registration (T-029, P-id: see below)

Written and committed before any pilot data. The lead confirmed it on 2026-10-03 with three changes and then one
amendment, all folded in here. Plan: README §4.3. Owner: arch-isolated-measure.

**Question.** Does the frozen-rest harness (FRZ) predict the full-page (FULL) change in countdown-owned counts?

## Arms

These are immutable copies. The served JS is hash-checked at run time, and a mismatch makes the run VOID.

| Arm | What | JS sha256/12 | CSS sha256/12 | Source |
|---|---|---|---|---|
| C, C' | baseline (two servers, A/A) | 4606120cf392 | baseline 27776f3d4138 | committed `site-pretty/` (pin) |
| Vf | countdown-faces X1 V, on the baseline | 638b8e03e81c | baseline | de-countdown `out/countdown-faces/snap-x1/poc` |
| S | st6-rb2 (cd-strip's control) | 7bf7c4657d21 | f523598b2a24 | fix-cd-strip `out/cd-strip/snap/st6rb2` |
| C6 = Vs | cd-strip strip-rw + B1 CSS on st6-rb2 | 5e37af69bcc4 | 40078cb2d9cf | fix-cd-roll-ca `out/cd-roll-ca/snap/C6` (= fix-cd-strip `snap/strip`) |
| V7 = Vr | C6 + cd-roll-ca (on cd-strip, on st6-rb2) | 73dff152e454 | 40078cb2d9cf | fix-cd-roll-ca `out/cd-roll-ca/snap/V7` |

## Judged deltas: each build against its own control

- Vf − C
- Vs − S
- Vr − C6, which is cd-roll-ca's own effect

The vs-C deltas (Vs − C, Vr − C) are reported as a secondary result and not judged. Vr − C includes cd-strip and st6-rb2.

## Modes

- **FULL:** the page as served.
- **FRZ:** everything outside the hero `[role=timer]` subtree is frozen:
  - CSS `animation-play-state: paused !important` on `*:not([data-iso-keep], [data-iso-keep] *)`;
  - `Element.animate` is wrapped, so a new animation is paused unless its target is in the subtree;
  - running animations outside the subtree are paused;
  - SMIL outside the subtree is paused.
- The countdown subtree keeps running. Each FRZ load checks this after its window: 3 clipped clock screenshots taken
  1.05 s apart in Chrome, and hero mutation ticks in the Simulator. A FRZ load with 0 changes is VOID.

## Engines

**Chrome 154, headless.**
- CPU 1x, 430x932 DPR 3 mobile with touch, y 0.
- Each load: settle, 1 s, mode injection, 1 s, then a 4 s trace window.
- n = 3 loads per arm and mode. The builds run round robin.
- One shared-lane slot per mode.
- Judged counts:
  - countdown FunctionCalls (the line range `var UE = { stiffness` .. `var lD = h(` in the served JS);
  - style elements (the sum of UpdateLayoutTree elementCount);
  - Layout;
  - Paint.
- Main frames, Layerize and IO are reported but not judged (page-wide).

**Simulator, one functional session.**
- Arms C, Vf, C6, V7; FULL and FRZ; n = 2 (the order is reversed on rep 2).
- Each load: a 4 s Timeline window.
- Judged counts: RenderingFrame, RecalculateStyles, Layout, Paint, Composite, and countdown rAF (a FireAnimationFrame
  whose child FunctionCall is in the countdown range).
- Counts are also reported per hero tick (mutation bursts). Vs is judged in Chrome only.

## Rule

For each judged pair b, count m and engine:
- dFULL = mean(FULL_b) − mean(FULL_ctrl)
- dFRZ = mean(FRZ_b) − mean(FRZ_ctrl)
- AA:
  - Chrome: max(|FULL_C − FULL_C'|, |FRZ_C − FRZ_C'|), using means.
  - Sim: max over modes of |C rep1 − C rep2|.
- tol = max(0.15 · |dFRZ|, 2 · AA, 2 counts)
- **PASS** for (b, m) when |dFULL − dFRZ| ≤ tol, and sign(dFULL) = sign(dFRZ) whenever |dFRZ| > tol.
- **Family FAIL** when 2 or more of the judged builds miss on the same count in either engine. With fewer judged
  builds in an engine (Sim: 2), that means all of them. Then FRZ deltas do not predict the full page for that count,
  and full-page counts stay the default for it (README §4.2 rule 2).
- AA comes from the baseline pair only. A control whose own noise differs (S, C6) is not covered by it. Any miss
  within 2× AA of the tolerance boundary is flagged "noise-sensitive".

## Layout and Paint open item

This resolves the open item from README §2.4 (full −29 / +57 against frozen +4 / +8, n = 1).
- If Layout and Paint pass, that mismatch was phase noise.
- If they fail with |dFULL − dFRZ| larger than the full-page within-arm range, the cause is a real per-frame
  interaction (H9), and Layout and Paint are declared full-page-only for this family.

## Prediction (written now)

- Style elements pass in Chrome for all 3 builds.
- Countdown FunctionCalls pass, since their deltas are near zero.
- Layout and Paint are open.

## Out of scope

No phone, no ms or fps claims, no gain claim.
