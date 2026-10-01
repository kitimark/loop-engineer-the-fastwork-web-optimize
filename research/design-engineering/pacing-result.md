# F5 pacing page: first result (de-unknowns-ux)

**The run.**
- The user ran the pacing page (U3/K18) on the iPhone on 2026-10-01 at 13:05-13:07Z. Data:
  [`pacing/results/F5-try2.json`](pacing/results/F5-try2.json); fit: `node research/design-engineering/pacing-fit.mjs
  research/design-engineering/pacing/results/F5-try2.json`.
- The page was the single-file version (index.html 16eb7092e024, logic identical to the committed `pacing.js`). It ran
  at rAF 17 ms on a 430×775 viewport; iphone-runner served it.
- The user had just done ~15 min of finger tests.

Labels: **data** (the ratings and the page's own frame log), **derived** (the fit), **inference**.

## 0. Verdict

**One session, one rating per cell, a tired user: this is a direction, not a calibration.**
1. **Any sustained cadence loss is "very janky", at either speed** (data). s30, uneven 33/17 and g50 got 5 in 6 of 7
   ratings. The ratings saturate there, so this set can't rank those patterns against each other.
2. **An isolated 100 ms stall is speed-dependent:** 3 at 600 px/s, 5 at 1600 px/s (data). Jump size matters for
   isolated hitches. At 1600 px/s, JUMPmax (the largest leap) ranks the trials best (ρ 0.83).
3. **The morph-shaped pair contradicts MWFI** (data, n = 1 each):
   - ease-early: three 50 ms gaps at peak velocity, about 2400-2900 px/s. MWFI 34.5, JUMP p95 82 px. Rated **2**.
   - ease-late: the same gaps near the end, about 30-300 px/s. MWFI 17.6, JUMP p95 4 px. Rated **4**.
   - The user saw the stall in the slow, landing part and not the leap in the fast part.
4. **Pooled, the frame-rate metrics fit best:**
   - fps ρ −0.72 and HTR ρ 0.66;
   - MWFI 0.44, JUMP p95 0.38, STUT/s 0.39 (derived).
   - At 600 px/s, MWFI, HTR, JUMP p95 and >34/s all reach ρ 0.89. They are confounded at constant speed, as the
     design check predicted.
5. **Consistency is ±1-2:** the repeats differ by 1 (steady@1600: 2/1) and by 2 (s30@1600: 5/3).

**So:**
- **Don't promote MWFI to the primary metric.** Its motion weighting failed the one test built to check it.
- **Keep HTR / fps as the primary, and report JUMPmax for isolated hitches.**
- **Tag stalls that happen at trackable speed.** Inference (a hypothesis to test): the eye can't pursue motion above
  ~2000 px/s (~60°/s at 30 cm on this phone), so a leap there reads as fast motion. A stall during slow,
  trackable motion reads as a hitch.
- **ts-analysis's T3+ follow-up should wait.** If anything goes in now, it is HTR and JUMPmax, with MWFI reported
  only.

## 1. Ratings and the delivered patterns (data)

The page's own present log shows every pattern was delivered as designed. Each trial also has one ~41 ms system rAF
gap at its start, the trial switch. "steady" carries ~1.3 frames/s at 33 ms on the phone.

| trial | pattern | v px/s | rating | fps | HTR | MWFI | JUMP p95 | JUMPmax | RUNmax |
|---|---|---|---|---|---|---|---|---|---|
| 1 | g100 | 1600 | 5 | 53.9 | 102 | 25.9 | 0.5 | 145 | 107 |
| 2 | ease-late | eased | 4 | 55.4 | 143 | 17.6 | 3.7 | 20 | 150 |
| 3 | steady | 1600 | 2 | 58.9 | 21 | 17.4 | 0.5 | 26 | 33 |
| 4 | uneven | 600 | 5 | 39.2 | 346 | 28.7 | 10.4 | 20 | 99 |
| 5 | steady (repeat) | 1600 | 1 | 58.8 | 23 | 17.4 | 0.5 | 26 | 33 |
| 6 | steady | 600 | 2 | 58.9 | 19 | 17.3 | 0.2 | 10 | 33 |
| 7 | s30 | 600 | 5 | 29.4 | 509 | 34.4 | 10.4 | 20 | 3951 |
| 8 | s30 (repeat) | 1600 | 5 | 29.4 | 510 | 34.3 | 27.7 | 53 | 3974 |
| 9 | g50 | 600 | 5 | 41.8 | 303 | 32.2 | 20 | 30 | 83 |
| 10 | uneven | 1600 | 5 | 39.3 | 344 | 28.6 | 27.7 | 53 | 100 |
| 11 | g50 | 1600 | 5 | 41.8 | 303 | 32.2 | 53.3 | 81 | 83 |
| 12 | g100 | 600 | 3 | 53.9 | 102 | 25.9 | 0.2 | 54 | 107 |
| 13 | ease-early | eased | 2 | 54.6 | 177 | 34.5 | 81.9 | 98 | 150 |
| 14 | s30 | 1600 | 3 | 29.4 | 509 | 34.3 | 27.7 | 53 | 3951 |

## 2. What it changes

- **unknowns-ux §1.3** (MWFI agrees with the user's three finger verdicts) stays a candidate. This page weakens it:
  - On those verdicts, frame counts and MWFI were both coarse readings of the same sessions.
  - The only controlled test of motion weighting went the other way.
- **P-024 (P10, the clock shift).**
  - Its gate (the per-tween max edge leap) measures exactly what ease-early varies, and ease-early rated *better*.
  - If the trackable-speed reading holds, the morph's peak-velocity leaps (~3 px/ms) are less visible than its
    tail stalls. gh already put the tail on time (17-19 ms).
  - So P10's expected felt value drops, though not its measured one. Re-weigh P10 after the repeat block below, and
    don't run it before.
- **The middle-of-page frames (y≈1960) happen during flings at a median 1500-1700 px/s** (unknowns-ux §1.4). That is
  near the pursuit limit, so this page can't say whether they are seen.

## 3. Next probe (cheap; one rested user session, ~2 min)

A v2 page, which I will build on request:
- the eased pair ×2 each;
- the eased pair at half and at a quarter of the morph's speed (369 / 185 px over 680 ms), to test the pursuit-limit
  reading;
- g100 at 300 / 600 / 1600 / 2400 px/s;
- forced-choice pairs ("which was smoother?") instead of a 1-5 rating, so the sustained-loss patterns don't sit at the
  ceiling.

Before the user, iphone-runner should check that serve.mjs serves the split `pacing.js`.
