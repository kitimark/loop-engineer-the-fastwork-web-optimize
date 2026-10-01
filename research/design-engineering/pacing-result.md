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
- **Cause, found while building v2:** these frames come from the page, not from the phone. The rAF log has no gap there
  (1 gap > 1.5 T per trial, the switch). v1's scheduler added k·T to the previous due time, so a measured T slightly
  off the real interval drifted until a tick was skipped. Every linear pattern carries these stray 2-tick frames, about
  2 % of frames.
- **Effect on this result:** the fit is unaffected, because every metric is computed from the delivered `shown`/`ys`
  log. Only the pattern names are approximate. It also means ~1 stray 33 ms frame per second went unnoticed (steady
  rated 1-2).
- **v2** schedules from each frame's own stamp (`due = ts + k·T`): no stray frames in the sim with T off by 0.1 ms or
  in the Chrome check.

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

## 3. Next probe: the v2 repeat block (one rested user session, ~3 min)

**Built:** [`pacing/v2.html`](pacing/v2.html) + [`pacing/v2.js`](pacing/v2.js) (lead decision; the v2 repeat block that
K18, T3+ and P10 wait on, unknowns-actions 974dc24). v1 (`index.html` + `pacing.js`) is unchanged, so F5-try2 stays
reproducible. The design:
- **Forced-choice pairs** ("which was smoother?") instead of a 1-5 rating, so the sustained-loss patterns don't sit at
  the ceiling. Both clips play for exactly 3 tween cycles (3.84 s, so both show the same 9 gaps), with a 0.7 s blank
  between them and an A / B badge, then the user taps A or B.
- **The eased pair (ease-early vs ease-late) at full speed, 4 presentations, order counterbalanced AB, BA, BA, AB**
  (arch-lead's request). Session 1's 2-vs-4 gap could be order or fatigue: early always came first.
- **The eased pair at half and at a quarter of the morph's speed** (369 / 185 px over 680 ms), 2 presentations each
  (AB, BA), to test the pursuit-limit reading. Prediction if pursuit is the cause: the late-gaps preference holds or
  grows at full speed and fades or reverses at 1/4 speed. If the late gaps are preferred at every speed, the cause is
  something else.
- **One catch pair:** the gap-free tween against itself. Its answer measures position bias.
- **g100 at 300 / 600 / 1600 / 2400 px/s, 1-5 rating, 2 each:** an isolated stall against speed. As in v1, the clip
  keeps moving until rated and the panel appears after 4 s.
- **Order rules:** part 1 (the 9 pairs) comes before part 2 (the 8 ratings), with an instruction sheet between them.
  Pairs are shuffled, never two of one group back to back, and never a full-speed pair first. The A/B orders are fixed
  by occurrence, so the counterbalancing survives the shuffle. Run it **rested and before any finger test**, which
  session 1 did not do.

**Reading, fixed before the data.** The block decides a direction, not a size: 4/4 one way is p = 0.06 one-sided,
3/4 is p = 0.31.
- **ease-1:** late chosen in ≥ 3/4 repeats session 1, against MWFI. Early chosen in ≥ 3/4 reverses session 1, and
  MWFI's weighting gets its test back. 2/2 is a null; a null keeps P10 held.
- **Speed arms (pursuit reading):** late chosen at full speed but early at 1/4 speed supports pursuit. Late at every
  speed rules pursuit out as the explanation.
- **catch:** reported only. Answers from one side across the session, for example all A in the ease pairs, flag a
  position bias.
- **g100:** a rising rating with speed supports the jump-size reading (JUMPmax) for isolated hitches.

**Results:** `window.__fwPacingV2` (object), `window.__fwPacingGet()` (JSON string), localStorage `fwPacingV2`, and a
summary on the final screen (`lateChosen` per group, catch choice, ratings per speed, A/B choices in order). Each pair
stores both clips' `raf`/`shown`/`ys`, each rating its own clip, plus `order`, `choice`, `chosen`, `rtMs` and the
plan with the seed.

**Time:** session 1 took 107 s for 14 trials (7.7 s each, measured from `startedAt`/`finishedAt`). v2 has 9 pairs at
about 12 s each (108 s) plus 8 ratings at 7.7 s (62 s): about **3 min on the page and about 5 min of the user's
time** with instructions. The phone holds **one `iphone` lease of about 10 min**: serve, open, the session, copying
the result. It needs no Chrome lock. It needs no cooling either: it is not a timed block, and its numbers come from the
user's choices, not from frame timing. It must not share the lease with a timed block.

Serve: `node tools/serve.mjs --root research/design-engineering/pacing --port auto` and open
`http://<LAN>:<port>/v2.html` (plain http, I-003). Before the user, open it once on the phone and check that the hz
line reads ~60 Hz.
