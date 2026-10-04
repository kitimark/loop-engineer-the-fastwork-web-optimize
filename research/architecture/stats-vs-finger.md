# Stats vs finger: when the numbers can stand in for the user's swipe

Author: arch-stats-vs-finger, 2026-10-05. Asked for in user thread T-156 #2. In short: the stats already show the
validated patterns' wins, so stop asking for a finger test per element, sort the cases, and find a better long-term
measurement. Research and design only: no tooling changed, no Chrome, phone or lock used.

**Answer.**
- One metric has agreed with every blind verdict so far: frames over 50 ms per 100 moving frames, **in the zone the
  finger was scrolling**, from the run the user swiped (F recordings).
  - It agreed in 7 of 7 blind pairs, 3 of them "same" results, plus the catch pair C-044.
- The scripted and isolated metrics did not track the finger:
  - S whole-page counts, M morph-only counts and the cost card each predicted a gain the user did not feel at least
    once;
  - `touchToScrollMs` never separated two builds.
- The finger is therefore only needed where no validated metric covers the claim (a sorting rule, §3).
- The route to "never" is a robot gesture (G) that copies the user's flicks, scored with the same zone metric.
  - It replaces the finger once it agrees with 5 known blind verdicts, and those can be **re-measured on old build
    pairs without the user** (§5).

Codes used here:
- **Drivers:**
  - S = scripted scroll;
  - W = window run;
  - M = morph driver;
  - G = WDA robot gesture;
  - F = the user's finger, recorded.
- **Frame thresholds:**
  - >50 = a frame gap over 50 ms;
  - >34 = a frame gap over 34 ms;
  - "per 100 mov" = per 100 frames while the page moves.
- **Records:**
  - C-NNN = a console step (the user's blind A/B or check);
  - P-NNN = a registered prediction or phone block;
  - PR-NNN = a proposal.

## 1. Evidence table

Every finger or swipe judgment so far, the stats for the same build pair, and whether they agree. "Blind" means the
user did not know which arm was which. Sources: `fixes/iphone-wave2/README.md` §2/§2b, the console store (52 steps),
`research/design-engineering/pacing-result.md`, `fixes/morph-scroll/README.md` (fix-owner worktree), the PREDICTIONS
ledger and the proposal records. User words are paraphrased.

| # | Test (date) | Pair (A vs B) | Blind | User verdict | Objective stats, same pair | Agree? |
|---|---|---|---|---|---|---|
| 1 | wave 1 finger runs (10-01) | baseline vs aw1-10c | yes | both laggy, same | S: fps 52.8→57.1, >50 per run 5→3 (gain). F rec: lag in both at hero 0-900 and morph, similar | **S disagrees**, F agrees |
| 2 | morph pin finger runs (10-01) | aw1-10c vs mw-g-pinclamp | yes | same, laggy | mechanism: pin scrollTo 73→0, reversals 8→0-1 (gain). F rec: morph >50 share 10 %→21-26 % (no gain) | **mechanism disagrees**, F agrees |
| 3 | cdwc swipe pairs 1-3 + C-001 (10-01) | mw10e-g vs +cdwc | yes, + catch C/C | same / almost same; catch same | M (P-029): >34 per run ~47-58→0-1, >50 1-27→0 (huge). F rec moving >34/>50: 54/11 vs 65/13 (no gain) | **M disagrees**, F agrees |
| 4 | pacing v3 (C-002, C-004 second viewer) | synthetic pairs | yes | drag lag p90 15 vs 23 ms felt 2/2; passive vs non-passive touchmove not felt (2/4); scroll-linked rAF effect under load felt; clumped load worse than spread; catch same | the injected parameter is the stat | agrees (lag, effect stalls); `touchToScroll` sign flipped between runs |
| 5 | C-013 (10-01) | original vs best build of the day | no | B quite smoother at hero and end | S >50 5→3 (0-1 with F3), Chrome p95 25.1→17.4, M morph >50 0 | agrees (not blind) |
| 6 | C-019 (10-02) | stack5 V vs RB C | yes | V, scale 3, better but a little laggy | S1 scroll >34 pooled no win (p 0.162, threshold-sensitive, >30 win); scroll >50 V +1; idle >34 win. F rec moving >50: V 7/760 vs C 19/828 | **S disagrees** (null), F agrees |
| 7 | C-026 (10-02) | original vs st6-rb2 | yes | st6-rb2 | F rec >34 122 vs 81, >50 44 vs 13 | agrees |
| 8 | C-035 (10-04) | st6-rb2 C vs strip-tc V (C always first) | yes | C, low confidence, hard to tell | W (P-079): top window no-worse (>50 +0.5). Cost card: re-entry paint 53.5→21, backing 48→16 (big gain). F rec >50 per 1000 mov: C 9.6/6.7, V 18.7/8.3 (order and heat confounded) | **cost card disagrees** as a feel predictor; W "no difference" fits; F agrees (confounded) |
| 9 | C-036 (10-04, second iPhone) | original vs GPU preview | no | GPU smoother at hero card and page end | no stats on that device | no stats |
| 10 | C-038/039/040 (10-04) | best-A vs B-R2 (hero-exit-threaded) | yes, + catch | B in both pairs; catch same; called it a breakthrough | G (P-095): f34 band 27→12, f50 4→3. `touchToScrollMs` 286 vs 283 | G frames agree; **touchToScroll blind** |
| 11 | C-041/042 + catch C-044 (10-04) | plain baseline C vs best build V (V second, warmer phone) | yes | V, scale 4; catch V/V same; hero card still lags | G (P-091) VOID (control 2/4). F rec >50 per 100 mov: C 6.7 vs V 3.9 (C-041: 6.3 vs 1.1), not threshold-sensitive; V's long frames at y 0-1000 | F agrees, incl. where the lag is left |
| 12 | C-045/046 (10-04) | v7 alone, fast flicks | single arm | lag felt at hero and page end | G flicks: hero >50 per run 4-11 (agrees); page end 0 >50 (the end lag was morph settle behaviour, PR-018) | hero agrees; **end: frames blind to a behaviour fault** |
| 13 | C-048 (10-04, Mac Safari) | v7 vs v8 | no | looks the same, very smooth | phone P-114 no-worse (M >50 2→0); P-111's WORSE did not replicate (heavy Mac load) | agrees (other device) |
| 14 | PR-018 rev 3 (morph-scroll) | rev 3 vs original | taste | momentum lost, panel stops halfway | not measured before posting; G later: glide 164-299 px vs 1058-1174 px | behaviour metric agrees (retro) |
| 15 | PR-018 rev 5 | rev 4/5 | taste | decision takes 3-5 s | G: settle 1.3-2.8 s (rev 6d: 0.31-0.35 s) | behaviour metric agrees (retro) |
| 16 | PR-018 rev 6 | rev 6 | taste | fast short swipes hard to open and close | G did not reproduce it (the robot lifts while the page already moves) | **G gesture mismatch** |
| 17 | C-049 (PR-018) | rev 6d vs rev 7 | yes | rev 7, scale 3 | F capture: reach aimed end rev 7 8/15 with 2 turn-backs; rev 6d 10/36 with 18 turn-backs | agrees |
| 18 | C-052 (PR-018) | rev 7 (on v8) vs rev 7c | yes | rev 7c; rev 7 acceptable | F capture: 7c 42/42 reach, 0 turn-backs; rev 7 64/85, 12 turn-backs. G f8a/f8b: rev 7 24/24 with 4 reversals, 7c 12/12 with 0 | agrees (F and G) |
| 19 | PR-021 nav-earn | original vs one-driver nav | taste | very smooth (changes asked only to extend it to the top) | mechanism probes: button-gone delay 617→0 ms, logo jump +24→+5 px, close snap 15.5→0.1 px; no frame stats | agrees in direction |
| 20 | PR-017 cd-roll-ca (desktop Try-it) | rAF roll vs CA roll | no | noticeably smoother | phone W (P-093): V +1 >50 per run at roll start; no-worse | **rAF dt disagrees** (cannot see compositor cadence) |
| 21 | PR-012 morph-gpu | rev 1/2 vs original | taste | accepted on look | Sim paint 12.2→2.3 per frame; but P-098 (rev 2) phone open-start WORSE +6.5 ms, which moving-frame counts would have passed | Sim counts miss a first-frame cost |
| 22 | PR-003 drop-blur | blur vs none | taste | accepted | +299 ms excess at the #people entry removed | agrees |
| 23 | PR-005 fwreskip | | taste | parked: one slow frame at a stop, no visible gain | one slow frame at stop | agrees (park) |
| - | C-015, C-016 (10-01) | look checks (avatar row, page-end panel) | n/a | picked 1; panel better but a little laggy | look questions, no frame stats | excluded / no stats |

Tally for blind or forced-choice pairs with frame data (rows 1-3, 6-8, 10, 11):

| Metric | Agrees | Disagrees | Notes |
|---|---|---|---|
| F rec: >50 per 100 moving frames, touched zone | 7 (+ catch C-044) | 0 | rows 1-3, 6-8, 11; 3 "same" results (rows 1-3); row 8 confounded |
| G: zone frame bands (f34/f50) | 1 (row 10) | 0 | row 11 VOID; row 12 single arm agrees at hero |
| S whole-page >50 / >34 | 0 blind (row 5 not blind) | 2 (rows 1, 6) | predicts gains that are not felt, or misses felt gains |
| M isolated morph counts | 0 | 1 (row 3) | right mechanism, wrong place |
| Cost card (paint, backing) | n/a | 1 as a feel predictor (row 8) | correct for its own claim: less work |
| `touchToScrollMs` | 0 | 2 (rows 4, 10) | does not separate any pair |
| Behaviour (reach, turn-back, settle, glide) | 5 (rows 14, 15, 17, 18 F+G) | 1 (row 16, G only) | needs the user's gesture shape |

## 2. Why the disagreements happened

1. **Wrong place (rows 1, 3, 6).** The improved zone was not where the finger felt lag. cdwc cleared the morph under M,
   but the user swiped the whole page, and the hero lag (y 0-1000) dominated. Wave 1's S gain was mostly in zones S
   stresses and the finger does not.
2. **Gain below the felt size (row 8, row 6's S).** The cost card halved paint and backing, but the frames the finger
   meets barely moved. Less work is a real win, but not one the user feels.
3. **Wrong driver (rows 1, 12, 16).**
   - S never moves the toolbar (T-113).
   - M never bounces or pins.
   - G lifts with the page already moving, so it never makes the user's short, slow-lift strokes.
   - Each driver misses a class of lag the finger meets.
4. **A metric blind to the compositor (row 20).**
   - rAF dt counts main-thread rendering updates.
   - A Core Animation animation runs in the render server: gpu-lessons C4, CONFIRMED.
   - On iOS the scrolling tree also lives in the UI process (WebKit source
     `Source/WebKit/UIProcess/RemoteLayerTree/ios/RemoteScrollingCoordinatorProxyIOS.mm`, `RemoteScrollingTreeIOS.cpp`,
     main branch, read 2026-10-05: CONFIRMED that it sits there).
   - So a compositor-only smoothness change is invisible to rAF dt.
5. **A first-frame cost hidden in averages (row 21).** Counts over moving frames pass a build whose first open frame
   got slower.
6. **Taste (rows 14-19).** "Does the panel glide?" and "should it snap?" are design questions. Metrics can predict
   the complaint, but the user decides what is wanted.
7. **Confounds (row 8, row 11's VOID G).**
   - C always went first.
   - The phone was warmer for the second arm.
   - G controls failed the sentinel.
8. **A metric that measures something else (rows 4, 10).**
   - `touchToScrollMs` runs from touchstart to the first frame that moved.
   - That span is pan slop plus the WDA or touch pipeline, not how well content follows a moving finger.
   - P-095 got 286 vs 283 ms on a pair the user told apart at once.

Why F-zone frames work, as an interpretation (OBSERVED, in our setup, cause not proven):
- The page scroll itself moves in the UI process (confirmed above).
- What the finger sees lag in is scroll-linked content the page drives from the main thread: the hero card exit, the
  morph and the nav.
- A main-thread frame over 50 ms is exactly when those elements stop following while the page under them keeps moving.
- Pacing v3 agrees: a scroll-linked rAF effect under load was felt (2/2), while a passive or non-passive touchmove
  difference was not (2/4).
  - That fits claims-audit §2.9 C1 (CONFIRMED, WebKit-7624.4.5): a non-passive touchmove gates scrolling only once per
    touch sequence, at its start.

## 3. Classes and their landing rule

Sort each change by what it claims, not by its size. The fix owner names the class in the D card, and the lead signs it.

| Class | What it is | Lands on | Finger test |
|---|---|---|---|
| **A. Less work, no visible change** | heat, idle or at-rest work, paint or layout counts; pixel-identical (or PR-010 wide numbers) | cost card counts on the full page (Chrome + Simulator) outside the A/A noise, plus one short phone no-worse check (S/W, and G when it touches toolbar or touch paths) | none |
| **B. Validated pattern applied** | a pattern on the list below, used the way it was validated, with no look change | the pattern's own metric moving the right way and clearing the A/A noise, plus the phone no-worse check, plus the first-frame falsifier when the element animates on open | none |
| **C. Smoothness claim in a swiped zone** | "the hero card follows better"; no look change, not a listed pattern | **today:** G zone frames (>50 and >34 per 100 moving frames in the touched zone and the 0.5 s after lift), with a pre-registered prediction. **Once G is validated (§5):** G alone | until G is validated: a blind swipe A/B only when the G verdict is threshold-sensitive or conflicts with another metric (class D). Afterwards: none, beyond the spot-check |
| **D. Disputed** | threshold-sensitive; metrics disagree (e.g. cost better, frames worse); claim rests on a metric not validated for it (compositor cadence until T10 exists); confounded (VOID control, order, heat) | user blind swipe A/B (forced choice, AB/BA, catch pair), only after the metrics are re-run once and still disagree | yes, and only here |
| **E. Motion or look change** | a new behaviour or look: snapping, glide, timing, easing, a different visual | proposal with Try-it; the user decides as taste. Before posting: behaviour metrics measured with the user's gesture shapes (reach, turn-back, settle, glide; §4), so each rev fixes what the last one got wrong | the user's taste choice on the proposal, not a perception A/B |

Validated patterns for class B (each with the metric that must match):

| Pattern | Validated by | Metric that must match |
|---|---|---|
| Move a scroll-linked effect off the main thread (GPU/compositor: transform/opacity on its own layer, threaded scroll-driven or WAAPI animation; no `linear()` on the main thread, F-080 CONFIRMED) | hero-exit-threaded (row 10 blind), PR-012 look accept, C-036 | main-thread style/layout/paint in the element's window → ~0 (Chrome call tree + Simulator); G zone frames no-worse; first open frame no-worse (P-098 lesson) |
| One driver per element (PR-021): one writer per property per frame, no rAF and CSS fighting | PR-021 (row 19) | driver-conflict count → 0; element follow error (rendered vs scroll-derived target) down; no-worse zone frames |
| Drop always-on backdrops/blur over scrolling content | PR-003 (row 22), C-026 st6-rb2 (row 7 blind) | excess at the section entry gone (ms), G zone frames no-worse, pixel rule |
| Do less per scroll event (cache hit tests, no layout reads in scroll callbacks) | cost-card lands (class A, rows 8 and 13) | per-event counts down; no-worse frames |

A pattern used outside its validated shape belongs in class C or D. For example, a CA animation driven by a gesture
rather than by time.

## 4. The "feel" metric set

Each metric, what it stands in for, how to get it today, and what is missing. Its status as a finger replacement uses
the §5 rule: validated means it agrees with 5 or more blind verdicts and has no sign disagreement.

| # | Metric | Stands in for | Today | Missing | Status as finger replacement |
|---|---|---|---|---|---|
| m1 | >50 and >34 per 100 moving frames, **in the touched zone** (scroll range under the finger) + the 0.5 s after lift, with ±4 ms twins | content stops following | F: `iphone.mjs record` + gesture-rec frames; G: `iphone.mjs gesture` + `summarizeRun` bands (hero/middle/lastScreen) | per-stroke touched-zone band and lift window in `summarizeRun` (gap T3, T4) | F: reference (7/0 + catch). G: 1/0, needs 4 more |
| m2 | follow lag: time shift between finger travel (touch clientY) and content travel (rAF scrollY), per stroke | "content lags my finger" (the user's own description, 10-01) | data exists in gesture-rec (touch clientY + t, frame scrollY + t); not computed | `followLagMs` per stroke (gap T1); replaces `touchToScrollMs` for this purpose | none yet; e.timeStamp = UIKit touch time: creation-at-dispatch REFUTED, last hop UNRESOLVED (claims-audit), so the absolute value carries an unknown offset; differences between arms are usable |
| m3 | element follow error: rendered position/opacity of a scroll-linked element vs the value its scroll position asks for, per frame; driver-conflict count | an element trailing or jumping (nav logo jump, card trail) | ad-hoc PR-021 probes; the v8 double-drive sweep (478196f6) found a 0.7-1.3 s trail by hand | a reusable probe for Chrome CDP + Simulator (gap T6) | 1/0 (PR-021); fine for class B now, not for class C |
| m4 | behaviour: reach-aimed-end rate, turn-backs, settle time, glide distance / momentum tau | "it stops halfway", "it decides slowly", "hard to open with a short swipe" | F: finger-capture/finger-analyze (fixes/morph-scroll, not in tools/); G: `summarizeRun` tauS, postReleaseTravelPx, reversals | promote the capture scripts (gap T5); G strokes shaped like the user's (gap T2) | 5/1; the miss was the G gesture shape. Predicts complaints for class E; taste stays the user's |
| m5 | first-frame falsifier: dt of the first 1-3 frames after an interaction starts (open, toolbar step, morph start) | a hitch at the start that moving averages hide | M/G raw frames; P-098 computed it by hand | a per-interaction first-frame field in G/M summaries (gap T7) | falsifier only (blocks a land, never lands one) |
| m6 | compositor cadence: hitches and frame intervals of the render server, per region | smoothness of CA animations and the scroll itself | none in use. ioscap gives whole-screen distinct-frame rate and PTS gaps; its cap (maybe 60 fps) is UNRESOLVED (gpu-lessons §4.4) | T10 xctrace Animation Hitches route (gap T8); ioscap per-region rate (gap T9) | none; PR-017 stays class D (or E) until it exists |
| m7 | thermal state and Mac load per run | confound control | xctrace thermal gate, battery temperature, `mac` record | gate timeout under load (I-154) | context, not a metric |
| m8 | scroll-start delay (Event Timing input delay at touchstart) | a sticky first touch | protocol v2 §3.6 | none | start only; not felt in pacing v3 (2/4) |

Dropped as a finger substitute:
- `touchToScrollMs` (0/2);
- S whole-page counts (0/2 blind; they stay as no-worse checks);
- M isolated counts (0/1; they stay as mechanism evidence);
- the cost card (correct for class A, says nothing about feel).

## 5. Validation rule and ongoing check

**Validate (once per metric and driver).** A metric may replace the finger for a class when all of the following hold:
1. **It agrees with N ≥ 5 blind verdicts.**
   - At least 1 of them is a "same" result, a catch pair or a low-confidence pick, and the metric must call that one
     within noise.
   - None of them disagrees in sign.
2. **The metric was computed before the verdict was read**, or retro on recordings frozen before the verdict.
3. **The control arm passes the sentinel** in each pair.
   - A VOID pair counts as neither agree nor disagree.
4. **Threshold-sensitive results count only when the twin verdicts agree.**

**Retro-validation without the user.**
- Six historic pairs already have blind verdicts: rows 1, 3, 6, 7, 8 and 11. Row 10 is already a G agreement.
- Re-run them under G with the user's stroke shapes (gap T2) and the zone metric (gap T3).
  - This needs their builds still servable from snapshot copies. The lead checks which ones are.
- If G agrees on at least 4 of them, it reaches N ≥ 5 and is validated for class C.
- Rows 1 and 3 are the decisive "same" pairs. M called row 3 a huge win; G must call it within noise.
- This costs phone time (about 6 pairs × one block), but no user time.

**Ongoing check.**
- One blind swipe A/B every K = 5 landings, or on each new best build (vN vs vN-1), whichever comes first.
- Pick the pair the metric was most confident about.
- **Demotion:** a disagreement on any spot-check sends that metric's class back to "user test" until it re-agrees on
  3 new blind pairs.
- **Keep a ledger:** one row per blind verdict, with the metric values recorded before the verdict was read (gap T10).
  The agreement count must be a computed number, never a recount.

## 6. Proposed rule text for the memory notes

For the lead. These are drafts; the lead edits `memory/` and dates the history line.

**memory/less-work-landing-rule.md.**
- *Rule:* replace the sentence about top-3 smoothness fixes with:

> Every change takes a class in its D card (research/architecture/stats-vs-finger.md §3):
> - A, less work: cost counts plus a phone no-worse check.
> - B, validated pattern: the pattern's metric plus no-worse plus the first-frame falsifier.
> - C, smoothness in a swiped zone: G zone frames.
> - D, disputed: the user's blind swipe A/B.
> - E, motion or look change: a proposal decided by the user's taste.
>
> A finger test is asked for only in class D, and in the spot-check every 5 landings or once per best build.

- *History:* add "2026-10-05 (T-156 #2): the finger test is narrowed to class D and the spot-check. The top-3 rule
  ends; hero-exit and F3 already passed their blind A/Bs (C-038/039/040, C-042)."

**memory/perception-tests-touch-ab.md.**
- *How to apply:* replace "pair each arm with … (`touchToScrollMs`)" with:

> Pair each arm with the touched-zone frame counts from the swiped run (>50 and >34 per 100 moving frames, plus the
> 0.5 s after lift) and, once built, follow lag per stroke.
>
> `touchToScrollMs` measures pan slop, not follow lag, and separated no pair (P-095).
>
> Each blind verdict goes into the verdict ledger with the metric values recorded before the answer is read.
>
> A blind A/B is run only for class D changes and for the ongoing spot-check (stats-vs-finger.md §5).

## 7. Tool gaps (incident-ready one-liners)

Class `tool`, none blocking today:

- **T1:** `gesture-rec summarizeRun` has no follow-lag metric. `touchToScrollMs` (touchstart → first moved frame)
  measures pan slop plus the touch pipeline and separated no pair (P-095: 286 vs 283 ms). Add `followLagMs` per stroke
  from the touch clientY and frame scrollY series that are already recorded.
- **T2:** `iphone.mjs gesture` has no stroke library sampled from the user's captured flicks:
  - contact ≤150 ms in 50 of 51 strokes;
  - lift speed 1.4-4.4 px/ms;
  - short slow-lift strokes, as in PR-018 rev 6.
  - The robot lifts with the page already moving, so G never reproduces them. Related: I-142.
- **T3:** `summarizeRun` bands are fixed by page position (hero/middle/lastScreen). Add a per-stroke touched-zone band:
  >50 and >34 per 100 moving frames over the scroll range moved while the finger was down.
- **T4:** `summarizeRun` has no lift window. Add >50 and >34 counts in the 0.5 s after touchend, where momentum and
  settle lag lives.
- **T5:** `finger-capture.mjs` and `finger-analyze.mjs` live only in the fixes/morph-scroll worktree. Promote reach,
  turn-back, settle and glide into tools/, with tests.
- **T6:** no reusable element follow-error / driver-conflict probe:
  - per frame, the rendered transform or opacity vs the scroll-derived target;
  - and the writers per property per frame.
  - It would work in Chrome CDP and the Simulator; today it is done by hand (PR-021, the v8 double-drive sweep).
- **T7:** G and M summaries have no first-frame field: dt of the first 1-3 frames after an interaction starts. P-098's
  open-start regression was found by hand, and moving counts passed it.
- **T8:** the T10 Instruments route (xctrace Animation Hitches, protocol v2 §8.1) is not built. Without it, no
  compositor-cadence metric exists, and CA-animation claims (PR-017) stay class D or E.
- **T9:** `ioscap.mjs` reports only a whole-screen distinct-frame rate.
  - It needs a per-region rate.
  - Its capture cap also needs checking: possibly 60 fps, UNRESOLVED, gpu-lessons §4.4. Check it against an xctrace
    display-frame-interval record.
- **T10:** there is no verdict ledger. Blind verdicts, build pairs and pre-registered metric values sit across console
  steps, PREDICTIONS and READMEs. Add a ledger file plus a tool that computes each metric's agree/disagree count for §5.
- **T11:** finger recordings were lost on a read timeout (I-141). `--poll` fixed part of it. Write each recording to
  disk as it streams, so that a verdict never lacks its F data.

## 8. Platform claims used here

| Claim | Status | Reference |
|---|---|---|
| On iOS, WebKit's scrolling tree lives in the UI process | CONFIRMED | WebKit `Source/WebKit/UIProcess/RemoteLayerTree/ios/RemoteScrollingCoordinatorProxyIOS.mm`, `RemoteScrollingTreeIOS.cpp` (main, read 2026-10-05) |
| Accelerated CA animations run in the render server, not ticked by the web process | CONFIRMED | gpu-lessons C4 (safari-7624 branch, `KeyframeEffect.cpp`) |
| WebKit requests 80-120 Hz for CA animations | CONFIRMED in source; phone honouring it UNRESOLVED | gpu-lessons C9; P-100 saw ~119 fast frames/s on both builds (OBSERVED) |
| Safari rAF: a 60 Hz display-link hint; finger runs show ~80 Hz stretches | hint CONFIRMED; 80 Hz trigger UNRESOLVED | CLAUDE.md (claims-audit §2.7), F-071 |
| A non-passive touchmove gates scrolling only once per touch sequence, at its start | CONFIRMED | claims-audit §2.9 C1 (WebKit-7624.4.5) |
| touchmove events are coalesced | CONFIRMED | EventDispatcher.cpp l.242-276 (claims-audit) |
| `e.timeStamp` is the UIKit touch time | creation-at-dispatch REFUTED; last hop UNRESOLVED | claims-audit; decisive check: a G run with known WDA touch times |
| `linear()` easings freeze on the main thread | CONFIRMED | F-080 |
| WebKit page momentum uses UIScrollView deceleration 0.998/ms | UNRESOLVED | Apple docs give the UIScrollView rate; decisive check: fit tau to G flicks of known lift speed |
| The finger feels main-thread stalls of scroll-linked elements, not of the page scroll | OBSERVED, in our setup, cause unknown | §1 tally, pacing v3; consistent with the UI-process scrolling tree |
| ioscap capture is capped at 60 fps | UNRESOLVED | gpu-lessons §4.4; decisive check: xctrace display-frame-interval |
