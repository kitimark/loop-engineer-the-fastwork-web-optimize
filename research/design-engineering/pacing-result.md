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

> **Superseded in part by the v2 repeat block (§4, 13:45Z).** In 8 of 8 counterbalanced forced choices, the user
> picked the clip with the gaps near the slow end (ease-late) as smoother, at full, 1/2 and 1/4 speed. That reverses
> item 3 below. Gaps at peak velocity look worse, as MWFI's motion weighting predicts. The constant-speed points
> (items 1, 2, 4) are not retested by v2.

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

**Erratum (found while scoring, 13:5xZ; the text above is kept as written).** The two bullets above use "late chosen"
with the sign backwards. Session 1 rated **ease-early** smoother (2 vs 4), and the page counts `chosen` as the clip
picked as **smoother**. So "repeats session 1" is *early* chosen in ≥ 3/4, and the late-chosen case is the reversal,
in MWFI's direction. The intent is unambiguous from §0 and §2, which say session 1 favoured early and MWFI favours
late. The pursuit reading flips the same way: it predicts early smoother at full speed, fading at 1/4 speed. The
fixed decision rule, unchanged in substance:
- early gaps smoother in ≥ 3/4: session 1 holds, P10 stays held;
- late gaps smoother in ≥ 3/4: session 1 is reversed and P10's premise is back, so P10 is released to its P1 gate;
- 2/2: null, P10 stays held.

`pacing-v2-score.mjs` uses the corrected wording.

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

## 4. v2 session 1: result (2026-10-01 13:45-13:50Z)

**The run.**
- **Data:** [`pacing/results/pacing-v2-s1.json`](pacing/results/pacing-v2-s1.json), scored with
  `node research/design-engineering/pacing-v2-score.mjs research/design-engineering/pacing/results/pacing-v2-s1.json`.
- **Setup:** v2.html from main d28c2cb, served by serve.mjs; iphone-runner ran it. The page read "display rAF ≈ 59
  Hz" (17 ms); Low Power Mode off; the 60 fps flag on; iOS 18.7.
- **Deviation:** the user had done the finger batch ~40 min earlier. The block asked for a session before any finger
  test.
- **Length:** 150 s on the page.

**Data (choice = the clip picked as smoother).**

| group | pairs | late gaps picked as smoother | order → choice |
|---|---|---|---|
| ease-1 (full speed, 739 px) | 4 | **4/4** | EL→B, LE→A, LE→A, EL→B |
| ease-1/2 | 2 | **2/2** | EL→B, LE→A |
| ease-1/4 | 2 | **2/2** | EL→B, LE→A |
| catch (identical clips) | 1 | n/a | B |

- **Bias and pace:** side A was picked in 4/8 eased pairs, so no position bias. Choices were quick: 1.1-1.7 s
  after the second clip, 3.2 s on the catch pair.
- **Delivery:**
  - 17 of 18 eased clips showed exactly the 9 designed 50 ms gaps.
  - Trial 3 (ease-1/2, the early clip) opened with a 125 ms gap in place of its first 50 ms one. That made the early
    clip rougher in a pair where late was picked anyway. Without it, the result is 7/7.
  - Every rating clip had one ~40 ms rAF gap at its start: the trial switch, as in v1.
- **Stall ratings (g100, 1 = smooth):** 300 px/s 3, 3; 600 px/s 2, 3; 1600 px/s 2, 3; 2400 px/s 1, 2. Worse at
  slow speed. Session 1 went the other way (600: 3, 1600: 5).

**Reading (the fixed rule, corrected wording, see the erratum in §3).**
1. **Full speed: late gaps smoother 4/4 (one-sided p = 0.06).** This reverses session 1's eased pair. Three 50 ms
   gaps during the fast start of the morph's motion look worse than the same gaps in its slow landing. MWFI's motion
   weighting predicts this. Session 1's single tired rating, with the early clip always shown first, was most likely
   noise or order.
2. **It held at 1/2 and 1/4 speed:** 2/2 each, so 8/8 overall (p = 0.004 pooled, treating the 8 as independent,
   which they are not quite). Peak velocity at 1/4 speed is ~800 px/s, well within pursuit. So the gap's place in the
   motion matters, not a pursuit limit. The pursuit reading is moot (inference).
3. **Catch pair:** B, one answer. With A at 4/8 in the eased pairs, there is no sign of position bias.
4. **Isolated stall vs speed: no conclusion.** v2 rates a stall worse at slow speed, session 1 worse at fast. The
   ratings came after part 1's comparisons, which likely shifted the anchors (inference). The jump-size reading
   (JUMPmax) is neither supported nor refuted.

**What it changes.**
- **P10 (P-024): released** to its own gate (P1, then the phone block). The start-of-tween leap that A1 removes is in
  the phase the user sees as worse.
- **Metric:** MWFI's motion weighting is back in play for eased motion: it got the eased test right this time. For
  constant-speed patterns, session 1's HTR/fps fit is untested by v2. Proposed interim rule:
  - HTR/fps for sustained cadence;
  - for tweens, the per-tween max excess leap (JUMPmax, P10's gate) plus MWFI as reported metrics.

  T3+ can take MWFI back as a secondary. Whether it becomes the primary waits for a second session.
- **Status:** OBSERVED, one user, 8 forced choices. A direction, not a calibration.

## 5. v3: touch A/B, "which followed your finger better?" (design and pre-registered reading)

**Why.** The user's feedback, relayed by the lead: lag is felt as the page not following the finger, so ask for a
swipe A/B. The lead approved v3 with three answers:
- (a) the passive arm decides, and the hero arm gives a direction;
- (b) the load comes from measured fastwork phone long tasks, as a distribution, with the source runs named in
  the config;
- (c) v3 stays synthetic and blind, and the same UI and scorer wrap two served URLs for the F stage of a real fix.

From now on, a second reader checks this section before any data arrives.

**Files** (all in `research/design-engineering/`):
- `pacing/v3.html`, `v3.js`, `v3.css`: the page.
- `pacing/v3-load.js`: the load, generated by `pacing-v3-load.mjs`.
- `pacing/v3-gesture.json`: driver G.
- `pacing-v3-score.mjs`: the scorer, which implements the rules below.
- Serve with `node tools/serve.mjs --root research/design-engineering/pacing --port auto` and open `/v3.html`.

### 5.1 States and load

Every state runs the same rAF loop. Each frame it first draws from the current input, then pays that frame's load.

| state | surface | load | variable |
|---|---|---|---|
| `hero-none` / `hero-trace` | native scroll, 120 cards | none / trace | 9 tags and a progress bar placed from `scrollY` in rAF every frame, so they should look glued to the cards (a scroll-linked main-thread effect, like the hero's) |
| `drag-none` / `drag-trace` / `drag-steady` | a card that follows the finger from `touchmove` (relative drag, `touch-action: none`, non-passive listener with `preventDefault`), snaps home on release | none / trace / steady | where the main thread is busy |
| `scroll-passive` / `scroll-nonpassive` | native scroll, 120 cards | trace | one window `touchmove` listener `{capture: true, passive: true \| false}`. Fastwork arms `{passive: false, capture: true}` at JS 13065. The handler never calls `preventDefault`. |

**Trace load.**
- **Source:** the busy time of iphone-runner's P3 baseline-A runs `p3-B7` and `p3-B8` (2026-10-01 13:40-13:41Z,
  aw1-10e family baseline, postmortem-hero.md §7.9), scroll phase (2 × ~2.4 s). The config carries the run ids,
  dates, served ports (no hosts) and every chunk.
- **Busy time, as `pacing-v3-load.mjs` counts it:**
  - **Rendering frames:** the span from a RenderingFrame's first child to its last, as one `f` chunk replayed
    inside one rAF callback.
  - **Other work:** top-level records outside a frame become `t` chunks, replayed as their own task.
  - **No merging of frames:** two frames are never merged, so a run of 25 ms frames stays a run of frames.
- **Pooled numbers:**
  - busy share 0.604;
  - 71 chunks ≥ 16.7 ms (14.7/s), duration p50 25.8 / p90 48.9 / max 118 ms;
  - start-to-start spacing p10 23 / p50 29 / p90 179 ms: runs of back-to-back long frames, separated by quieter
    stretches.
- **Replay:** the chunks run in recorded order and loop every 4823 ms. An overdue chunk more than 100 ms late is
  skipped and counted.
- **Steady:** the same busy share spread evenly, 0.604 × 16.67 = 10.1 ms in every rAF callback.
- **Caveats:**
  - The records are Timeline-on, so durations may be inflated.
  - The recorded page ran the rAF logger, whose forced Layout is counted (P-023: neutral on layout counts).
  - A busy-wait reproduces when the main thread is occupied, not what the work invalidates.
- **Frozen stimulus (second read, amendment 2):** `v3-load.js` as committed in 867fa88 (P3 p3-B7 / p3-B8) is THE
  stimulus for this G + F pair. P4 records no Timeline (iphone-runner: a window driver with the r3 logger, no
  `.tl.json`), so there is nothing to regenerate from. A load from other records makes a new version, which needs a
  new Chrome check and a new second read.

### 5.2 Session plan (driver F, one viewer)

**Flow.**
1. A practice pair (drag, not counted), then 11 pairs.
2. In each pair, the viewer uses version 1 (≥ 2 s and ≥ 5 touchmoves unlock Done), then version 2.
3. The viewer picks the one that **followed the finger better**, with an optional "how different" rating from 1
   (same) to 5 (very different). Either version can be tried again first.
4. `?set=2` swaps the order in every counted pair, for a second session.

**Arms.**

| # | arm | pairs | first shown (set 1) |
|---|---|---|---|
| 2, 9 | drag: `drag-none` vs `drag-trace` | 2 | none, trace |
| 3, 5, 8, 11 | **passive** (decision): `scroll-nonpassive` vs `scroll-passive` | 4 | AB, BA, BA, AB with A = non-passive |
| 1, 7 | hero: `hero-trace` vs `hero-none` | 2 | trace, none |
| 4, 10 | steady: `drag-steady` vs `drag-trace` | 2 | steady, trace |
| 6 | catch: `scroll-passive` vs itself | 1 | |

No arm runs twice in a row. The catch pair looks exactly like the decision arm.

### 5.3 Pre-registered reading (the scorer implements it; "chosen" = followed the finger better)

| arm | the pick that counts | it means |
|---|---|---|
| drag (control) | `drag-none` | the load is felt when the moving thing waits on the main thread |
| **passive** | `scroll-passive` | **the non-passive window `touchmove` was felt as worse under fastwork-like load** |
| hero | `hero-none` | the scroll-linked rAF effect under load was felt as worse |
| steady | `drag-steady` | clumped load (the trace) felt worse than the same mean spread evenly |

A worked example of the sign: in pair 3 (set 1) version 1 is `scroll-nonpassive`. If the viewer taps **2**, the
chosen state is `scroll-passive`, which counts toward "non-passive felt as worse".

**Validity, checked first.**
- **Control:** `drag-none` must be chosen 2/2. Otherwise the session is "not sensitive": every other arm is
  reported, not read.
- **Load delivered:** in every counted trace visit, busy share is 0.40-0.75 and skipped ≤ 20 % of chunks.
  Otherwise the session is treated like a failed control: its arms are reported, not read.
  - The limit was 10 % before the Chrome check. That check skipped 7-14 % on the scroll states: Chrome's own
    scroll work delays rAF, so overdue frame chunks get dropped. Busy share came out 0.53-0.60. The limit was
    changed before any phone data.
- **Side bias:** version 1 chosen ≥ 10/11 or ≤ 1/11 is flagged. The AB/BA/BA/AB order means pure side bias gives
  2/4 on the decision arm.
- **Catch:** a rating ≥ 4 on the catch pair is flagged, and that session's ratings are not used.
- **Display rate:** rAF > 25 ms (Low Power Mode) is flagged.

**Decision arm, one session (n = 4, one-sided binomial):**

| `scroll-passive` chosen | reading |
|---|---|
| 4/4 | **FELT** (p 0.06) |
| 3/4 | **LEANING**: run set 2 and read pooled |
| 1/4 or 2/4 | **NOT FELT**: the listener change has to win on G numbers alone |
| 0/4 | **REVERSED**: check the G mechanism numbers before reading anything |

**Pooled over two sensitive sessions (n = 8):**

| `scroll-passive` chosen | reading |
|---|---|
| ≥ 7/8 | FELT (p 0.035) |
| 6/8 | INCONCLUSIVE |
| ≤ 5/8 | NOT FELT |

**Hero and steady (direction only, n = 2 each):** 2/2 gives the direction, 0/2 the reverse, 1/2 null.

**Driver G (WDA, no viewer; mechanism, before F).**
- **Runs:** `v3.html?state=<id>`, then `iphone.mjs gesture research/design-engineering/pacing/v3-gesture.json`
  (script hash 716889c2…), then `__fwPacingV3Get()`. The script is a reload, 1.5 s idle, 2 slow held drags,
  3 medium strokes and 2 flings, all up.
- **Order:** 20 runs, about 12 min, in one ~20 min lease, with 10 min cooling after the previous phone block.
  1. One uncounted warm-up (`scroll-passive`).
  2. Sentinel `hero-none`.
  3. `scroll-passive` (C) vs `scroll-nonpassive` (V) in C V V C C V V C.
  4. Sentinel `hero-none`.
  5. Drag control: `drag-none` (N) vs `drag-trace` (T) in N T T N N T.
  6. One run each of `drag-steady` and `hero-trace` (direction only).
  7. Sentinel `hero-none`.
- **Heat sentinel (second read, amendment 1; protocol §5.2):**
  - The loaded states are slow by design, so the sentinel is `hero-none` (no load, native scroll).
  - It passes when its moving rAF gaps have p50 ≤ 17.5 ms and p95 ≤ 18 ms.
  - Runs are ordered by `startedAt`, which the gesture's reload sets.
  - A counted run is read only if it lies between two passing sentinels.
  - A failing sentinel voids every run since the last passing one. The phone then cools 10 min and the voided part
    restarts.
- **Void runs:**
  - a scroll run with fewer than 3 scroll starts (touch-to-scroll n < 3; the script has 7 strokes);
  - a run outside the sentinel cover;
  - a run with any touchmove whose `timeStamp` is more than 1 ms later than its handler's `performance.now()`. The
    time base is then suspect.
- **Passive reading (second read, amendment 3):**
  - Per run, the median touch-to-scroll: from touchstart `Event.timeStamp` to the timestamp of the first rAF
    callback whose `scrollY` moved.
  - Both are taken as the `performance.now()` clock. That is UNRESOLVED (C2 below); the void rule above catches a
    clock mismatch in one direction.
  - "SEPARATED" needs ≥ 3 valid runs per arm and both of:
    - the median of the V runs' medians minus the median of the C runs' medians is ≥ 16.7 ms;
    - every V run's median is above every C run's median.
  - Otherwise "overlap".
  - The rule is in ms, not frames, so the phone's rAF rate (F-071) does not change it.
  - SEPARATED: non-passive delays the scroll start under this load (OBSERVED), and F's passive arm tests whether
    that is felt.
  - Overlap: WebKit did not make the scroll wait on the handler under this load (OBSERVED, in our setup), and F's
    passive arm is expected NOT FELT.
- **Also reported, not used for the verdict:**
  - touchmove queue delay (handler time minus `timeStamp`);
  - the share of cancelable touchmoves per state;
  - moving rAF gaps over 34 and 50 ms.
- **Control:** per-run p90 drag lag (`drag-none` vs `drag-trace`, 3 runs each) should separate by the same rule
  (≥ 16.7 ms). If it doesn't, the load did not reach the input path and G is void.
  - The first draft had one run of each, which the separation rule can never read. The 3 runs each were added with
    the amendments, before any data.
  - Why p90: the load blocks only some frames, so the median barely moves. In the Chrome check the p50 was 31 vs
    32 ms and the p90 was 32 vs 83 ms.

**Real-page A/B (F stage of a fix, lead's (c)).**
- **URL:** `v3.html?mode=urls&a=<build A>&b=<build B>&order=AB,BA,BA,AB&q=<key>`.
- **Flow:** the page opens page 1 in the same tab; the viewer scrolls for ~10 s and comes back with the browser's
  back button; then page 2; then the same question.
- **Runner mode:** `&nav=runner&pair=<n>` is for iphone-runner to navigate itself; the page then only asks.
- **Privacy:** results keep port and path only.
- **Reading:** A chosen n/n or 0/n, read like the decision arm, from ≥ 4 pairs.
- **Blindness risk:** check whether Safari's compact address bar shows the port before the block. If it does,
  serve both builds behind ports the viewer can't map, or use the runner mode.

**Platform claims this design leans on (status).**
- **C1. Does WebKit on iOS make the scroll wait for a non-passive window `touchmove` handler? CONFIRMED, once per
  touch sequence, at scroll start** (arch-claims, claims-audit §2.9, F-079; WebKit tag 7624.4.5).
  - The wait:
    - Only the first preventable touchmove holds back the pan, until the web process replies (WebPageProxy.cpp
      4711-4734; WKContentViewInteraction.mm 10484-10485).
    - Later moves of the sequence are sent without waiting (WKContentViewInteraction.mm 4174-4181, 2242-2248).
    - Whether the handler calls `preventDefault` and the `capture` flag do not change this gate.
  - Passive by default: a window listener without an explicit `{passive: false}` is passive and never makes the
    scroll wait (Quirks.cpp 983-1008). V passes `{capture: true, passive: false}` explicitly, as fastwork does.
  - **So the expected C-vs-V difference is touch-to-scroll start only, not the moving frames.** That is the G
    passive reading as registered. F then tests whether a delay at the start of each stroke is felt.
  - Still open:
    - Whether later moves report `cancelable = false` in the DOM is UNRESOLVED (closed WebKitAdditions).
    - G already logs `cancelable` per move (cancelable share per state), so G answers it.
- **C2. What WebKit's touch `Event.timeStamp` marks (event creation at dispatch vs the earlier system touch time):
  UNRESOLVED** (claims-audit §2.9). `Event::timeStamp` returns the creation time (Event.cpp 188-199), but the iOS
  TouchEvent class is closed source.
  - The queue-delay and touch-to-scroll numbers are read only as within-page comparisons (C vs V).
  - The decisive check is reported, not read: G's touchmove queue delay (handler `performance.now()` minus
    `timeStamp`) in `drag-none` vs `drag-trace`.
    - About 0-2 ms in both means the stamp is taken at creation.
    - Tens of ms more under the trace means it is taken earlier.
- Drag touches can't mix into the scroll-start timings:
  - In the scroll states #drag is hidden.
  - In the drag states the list is hidden and the body does not scroll.
  - So the non-passive #drag listeners (whose prevented touchstart keeps that sequence's moves preventable,
    WKContentViewInteraction.mm 2238) only see drag-state touches.
- The drag surface relies on `touch-action: none` plus `preventDefault` in a non-passive listener to stop page
  scroll. Both are in place. The Chrome check showed no scroll; the phone is unchecked until G.

**Chrome check** (short lane, headless, 430×932 DPR 3, touch emulation, CDP touch drags, 2026-10-01 14:1x-14:3xZ).
Mechanics only; Chrome numbers say nothing about WebKit.
- **G mode:** all 7 states load with 0 errors.
  - Drag moves the card (dy -400) and never scrolls.
  - The scroll states scroll (~1090 px) and the hero tags track.
  - The extra listener fires on every move (161-162 calls).
  - Busy share: trace 0.53-0.60, steady 0.606.
  - Drag lag p90 is 32 ms with no load, 83 ms with the trace and 32 ms with steady.
- **Session:** the full flow ran with random picks: practice plus 11 pairs, one "try again", 257 KB in
  localStorage. The scorer read it as control FAIL (drag-none 1/2), so nothing was read. That is the right answer
  for random picks.
- **urls mode:** two pairs went through page 1 → back → page 2 → back → pick. The picks mapped AB→B and BA→A
  correctly. Results keep port and path only.

**Second reader:** mgmt-ops-5 (the lead's rule), 2026-10-01.
- **OK:** the sign, the worked example, the session and pooled tables, the validity rules and the two pre-data rule
  changes.
- **Three amendments, now written in above and in the scorer:**
  1. the G heat sentinel;
  2. the frozen stimulus;
  3. the exact G separation rule, its time base and the < 3 scroll starts void.
- **Added with them, before any data:** the drag control at 3 runs each (see Control).
- **Platform claims:** arch-claims reported after the read (see "Platform claims" above).
  - C1 is CONFIRMED: the wait comes once per touch sequence, at scroll start. That matches the registered G
    reading, so the reading is unchanged.
  - C2 stays UNRESOLVED.

## 6. v3 F results (2026-10-01)

Two sittings on the iPhone 15 Pro Max (Safari 26.6.1, iOS 18.7), driver F (a finger, no recorder), page at
867fa88, scorer at 1b66d7b plus the load-check fix below. The two runs are **different viewers** and are scored
separately: never pooled, because the pooled rule (§5.3) is for one viewer's set 1 + set 2.

| | run 1 (console C-002) | run 2 (console C-004) |
|---|---|---|
| viewer | the user | a second tester (the user's note: "this is tester opinion, not me") |
| set | 1 | 2 (every pair's order swapped) |
| time | 15:49:59-15:58:55Z | 16:21:39-16:31:46Z (saved session; Start was tapped 16:12:09Z, before the reload) |
| conditions | Low Power Mode off (rAF 17 ms); toolbar collapsed by the end (vh 775 → 815) | Low Power Mode off (rAF 16 ms); toolbar expanded (vh 775) at the start and at the read |
| sheet | practice + 11 pairs, complete | practice + 11 pairs, complete; one accidental reload earlier; the saved sheet holds only the complete redo (trials 0-11 once each), the partial session before the reload was overwritten and is lost |
| load delivered | every loaded visit busy 0.59-0.63 (steady 0.66), 0 skipped | the same |
| control (drag) | PASS 2/2, ratings 4, 4 | PASS 2/2, ratings 1, 1 |
| **passive (decision arm)** | **NOT FELT: scroll-passive chosen 2/4** (ratings 1, 1, 1, none) | **NOT FELT: 2/4** (ratings 2, 1, 1, 1) |
| hero (direction) | 2/2 hero-none: the loaded scroll-linked effect felt worse (ratings 2, 2) | 2/2, the same (2, 2) |
| steady (direction) | 2/2 drag-steady: the clumped trace felt worse than the same mean load spread evenly (5, 4) | 2/2, the same (2, 2) |
| catch (identical) | rated 1 (same) | rated 1 (same) |
| side | version 1 chosen 5/11 | version 1 chosen 3/11; in the passive arm, version 2 was picked in all 4 pairs, so that arm's 2/4 is the side preference |
| retries ("try again") | many in the passive pairs (pair 3: 4, pair 5: 2, pair 11: 2) | few, except drag pair 9 (8 retries, rating 1) |

**Reading (§5.3).**
- Both viewers passed the control, so both sessions were sensitive.
- Neither viewer felt the non-passive window `touchmove` listener under fastwork-like load. Each read is n = 1 viewer,
  OBSERVED.
- Per §5.3, the listener change must therefore win on G numbers alone (P-035, not yet run).
- Both viewers gave the same direction on hero and steady:
  - a scroll-linked rAF effect under the measured load is felt;
  - clumped main-thread work is felt more than the same average work spread evenly.
- The user rated those clearly (steady 5 and 4); the second tester rated them weakly (2 and 2).

**Objective numbers from the finger visits (reported, not read; the G block is the pre-registered mechanism read).**
- Touch-to-scroll p50 over visits (C2 UNRESOLVED, so within-page only):

  | | passive | non-passive |
  |---|---|---|
  | run 1 | 71 ms | 83 ms |
  | run 2 | 103 ms | 87 ms |

  The two runs disagree in sign. With finger visits of varying length and number, these say nothing.
- Cancelable share of touchmoves:
  - non-passive: 0.40 (run 1), 0.50 (run 2);
  - passive: 0.00 in both runs.
- That is consistent with C1: only moves before the pan starts can be prevented. It is OBSERVED (the DOM part of C1 is
  UNRESOLVED); G measures it under a fixed gesture.
- Drag lag p90 (drag-none vs drag-trace): 15 vs 23 ms (run 1), 16 vs 23 ms (run 2). That is far smaller than in
  Chrome (32 vs 83 ms), yet both viewers picked drag-none 2/2.

**Scorer fix after the data (validity check only, the reading unchanged).**
- What was wrong: in session mode a visit is saved after `leave()`, when the load engine reports mode `none`. So
  `loadOk` skipped every session visit.
- The fix: `loadOk` now finds trace-loaded visits by state name.
- Checked by hand before the fix: every loaded visit in both runs passes the registered rule (busy 0.40-0.75,
  skipped ≤ 20 %). So no reading changes.
