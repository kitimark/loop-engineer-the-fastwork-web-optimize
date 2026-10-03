# Fix: rest-script

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (registration committed; data and verdicts follow in later commits)
**Stage:** F; D card registered below (P-078 → P-080 → P-083 → P-084, v4 current, last iteration)
**Device class / gate:** less-work (heat) fix: cost-card counts, full page, Chrome + Simulator, plus one short phone
no-worse check (memory/less-work-landing-rule.md, user T-029 #30). No timing A/B (deferred, user rule).
**Base:** `--on st6-rb2`; served overlay `_app/immutable/nodes/2.DyWL8TcE.js` sha256 `520d5f1139c7…` (v4; v1 bf8ffd4ef7a3, v2 a5286ebc4cb6, v3 6c09e47961ba)
**Topic:** see `fixes/TOPICS.md` (rest-script), user T-029 heat goal, P-068
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`: `mM` (#people avatar rotator), `JT` (commission count-up),
`hD` (pain notes interval), `EM` (profile count-up). Out of scope and untouched: `HE` (hero accent word), the
secure-network SMIL and sweeps, the countdown.

## Registration (P-078, D card, before any scored data)

Registered 2026-10-03 ~09:31Z, before the scored census and Simulator data were taken. Checks run before this
commit (the Chrome identity runs at 375/430/768/1024/1440 + 430 reduced motion, the item checks, the first Chrome
census at 430 and 375) are reported as pre-registration checks only; the claims rest on the runs after it.

**Gate:** the less-work landing rule (memory/less-work-landing-rule.md). Counts judged per event (rotator slide,
commission tween, pain tick, profile count-up), frame-driven counts from the full page in Chrome and the Simulator,
pixel identity against the same-width A/A floor (1024 included), one short phone no-worse check (start band 38-40 °C,
one start method for every run, Low Power Mode runs dropped and re-run).

**Probes and scorer (sha256, first 12):** copies kept in the worktree's gitignored `out/rest-script/probes/`.

| file | sha256 | role |
|---|---|---|
| census.mjs | b6bc0a5516cb | Chrome rest census per position (trace counts per 2 s, FunctionCalls by owner/fired-by) |
| simcensus.mjs | 98eff8b1425e | Simulator rest census per position (Timeline record counts, F-047 order) |
| tocard.mjs | ~~8291590f6176~~ v2 05daca3beb58 (committed: `fixes/rest-script/tools/tocard.mjs`) | scorer: census -> costcard records (arms C, C2 = A/A, V), position classes, pooled verdict |
| rot.mjs / analyse.mjs | 68b7524c1dbf / 03b2df89340e | Chrome rotator identity (per-frame recorder, frozen shots, replays) and its scorer |
| simrot.mjs | 3b24f27514c6 | the same on the WebKit Simulator (simctl shots, magenta calibration crop) |
| simtb.mjs, stroke-up/down.json | 406a1d5e0f84, 660e9ae68d7c / 7ece659754c4 | Sim toolbar collapse/expand: ResizeObserver-on-html count |
| rocount.mjs | a2874fa946b0 | Chrome fwRO / fwNearChange / fwSync call counts at idle and per resize step |
| items.mjs / items-analyse.mjs | 5dd60d0d3e56 / e492ff4044d5 | JT / EM per-frame text model check, pain interval ticks and phase across width changes |
| run-ic.sh, run-ident.sh, run-items.sh, simrun.sh, simhold.sh | 454aecc2efa4, 6c5bbc99dd0b, 573b3192b59f, a5df9fbdc90a, 91c260bba8c6 | hold wrappers |
| simcen.sh, chain3.sh (added 09:35Z, before their data) | 523ed2a01246, 5116f5fac1d1 | Sim census hold; post-registration chain (Sim census 2 reps, Chrome census 430 and 375 again) |

Cost card: `tools/costcard.mjs` (ts-costcard, I-083) reads `tocard.mjs` records once it is on `main`; until then the
`tocard.mjs` table is the reading.

**Second-read fixes (mgmt-ops-10, NEEDS-FIX at 22dd92e), committed before any post-registration census or Sim
data was read** (the runs themselves were already queued or running; their output files were not opened):

- *Aggregation (pooled over reps).* Per row (position or event) and count: C1, C2 = the two st6-rb2 reps of that run,
  V = every rest-script rep. floor = max(2, |C1 − C2|). **SAVE** when min(C1, C2) − max(V) > floor; **MORE** when
  min(V) − max(C1, C2) > floor; otherwise **SAME**. Chrome 430 and 375: only the post-registration run (`ic2/`) is
  scored; the earlier run is a pre-registration check. Simulator: C1/C2/V from its two reps.
- *Position classes (prediction 1)* from layout values recorded in the C rep 1 run at that position (rowTop = the
  avatar row's viewport top, vh = Chrome's emulated height / the Sim's innerHeight, gate = `#people`
  `data-start-selling-scene`, row height 32 px at every width): **paused** gate == paused (V = C predicted);
  **far** gate active and (rowTop ≥ 1.5 vh + 50 or rowTop + 32 ≤ −0.5 vh − 50) (V < C on style recalcs and paints);
  **near** gate active and rowTop < 1.5 vh − 50 and rowTop + 32 > −0.5 vh + 50 (V = C); **border** otherwise (within
  50 px of the fix's 50 % band edge, or the gate differs between the C/C2/V runs): reported, not scored.
  Implemented in tocard v2.
- *Decisions.*
  - All hit (1-4 as predicted, 5 no per-frame firing, 6 identical) → the short phone no-worse check below → land
    under the less-work rule.
  - 1 misses (no SAVE on style recalcs or paints at any far position) in both engines → drop the `mM` change from the
    patch, keep the other items; in one engine only → keep it, the card names the engine that saves.
  - 2 or 3 misses (no saving for that item) → drop that item from the patch.
  - Any MORE (4, or at any position or count for any item) → find the cause; fix and re-register, or drop the item
    responsible. No landing with a MORE.
  - 5: fires per toolbar frame on the Sim → debounce into the scroll-path check, new registration. 6: a stale or
    non-identical frame beyond the A/A floor → to the user before landing.
- *Phone no-worse check (registered now, before any phone data).* iPhone under the lease, driver S
  (`iphone.mjs scroll`, the full page), arms C = st6-rb2, V = rest-script, one uncounted warm-up per arm, then 4
  counted runs in C V V C order; start band 38-40 °C (battery), one start method for every run, Low Power Mode runs
  dropped and re-run. Bound: per arm median of frames dt > 50 ms and dt > 34 ms per run, V − C ≤ +1 (> 50) and ≤ +2
  (> 34), judged also with the ±4 ms twins (dt > 46/54, dt > 30/38); a twin with another verdict makes it
  threshold-sensitive and it goes to the lead. Pass → no-worse.
- *Confidence (subjective, before the data):* 1: 0.75 Chrome, 0.65 Sim (far+active positions may be few); 2: 0.95;
  3: 0.85; 4: 0.9; 5: idle 0 at 0.9, Sim toolbar per-frame firing 0.5 either way; 6: 0.85 Chrome, 0.6 Sim.

**Predictions (ranges), C = st6-rb2, V = rest-script, same engine, width and position:**

1. Rotator slide (`rotator-slide`, per 1020 ms slide; positions where st6 runs the rotator clock and the avatar row is
   more than half a viewport off screen): V below C on style recalcs and paints by more than the floor; main frames
   V ≤ C; timer fires V = C within the floor (the clock is kept). Positions with the row on or near the screen, and
   positions where the scene gate is paused: V = C within the floor on every count (no new work).
2. Pain tick (`pain-tick`, widths ≤ 860 px, `.pain-notes` centred): V makes 0 `le` calls and 0 interval timer fires;
   C makes one per 3 s. Above 860 px: the same tick count and the same 3 s phase (within one frame), also after
   crossing 860 px in either direction, never two intervals.
3. Commission tween (`JT`, 18 → 0 %): rAF callbacks per tween V < C (V about one per text change, C one per frame);
   the shown text identical in every frame (model check: 0 bad frames).
4. Profile count-up (`EM`): every frame's four texts identical (0 bad frames); counts V ≤ C within the floor (the
   skipped state writes do not change frame counts; claim is "no more work", not a saving).
5. ResizeObserver on `<html>` (new in V): 0 callbacks at idle; one per real layout-size change in a desktop resize;
   on the Simulator toolbar collapse/expand: counted and reported; if it fires per toolbar frame, V gets a debounce
   and a new registration.
6. Identity: rotator per-frame state 0 mismatches against the model at every width; frozen-frame pixel diffs of V
   against C replays within the same-width A/A floor (C replayed against C) on entering mid-slide, at rest, re-entry
   and jumps (scrollTo, anchor, back/forward, reload with scroll restoration) in Chrome and on the Simulator.
   Any stale frame left anywhere goes to the user before landing.

Widths: 375, 430, 768 (touch), 1024, 1440, and 430 with reduced motion (Chrome). Simulator: its 430-wide iPhone.
Chrome positions at 430: y 0, 932, 1864, 2300, 2796, 3728, 4660, `fee` and `pain` centred.

### Registration v2 (P-078 rev 2 = **P-080** in the index, overlay a5286ebc4cb6), before any v2 data

**Phone condition added (user T-039 B, via the lead and mgmt-ops-10, 10:20Z; before any phone run):** the phone
no-worse check runs at real thermal Serious: `xctrace` Thermal State at the start and the end of every hold must read
Serious with Is Induced = No, otherwise the hold is re-run; the timer-grid median and the battery °C are logged per
run; stop at 44 °C or Critical. B is an experiment: on a blocker the lead switches to A (Fair/Nominal start, the same
gate). The numeric bound above is unchanged.

The first scored census (768, post-registration, v1 overlay bf8ffd4ef7a3) gave a **MORE** under the registered rule:
at the `near` position y 2500, rAF callbacks 0/0 (C1/C2) vs 3, 4 (V), floor 2. Cause: v1 requested one rAF per slide
start (`fwCap`, stamping the slide's first frame for a later resume) also while the row is near and the DOM runs the
slide itself. Main frames, style recalcs, paints and code calls were SAME there. Decision (as registered: "any MORE →
find the cause; fix and re-register"): all v1 chains stopped at 09:58Z (census 1024 cut mid-run; 1440, 430r, the
Simulator runs and the second Chrome census never ran), and the fix changed:

- `fwSetS`: the stamping rAF only while the row is far (`fwNear` false); near, no rAF.
- `fwNearChange` (row leaves): when a slide runs and has no stamp, keep the slide's real start (`startTime` of the
  row's running animations, i.e. the engine's own start frame), falling back to `document.timeline.currentTime`.

Every v1 result (identity 375-1440 + 430r, items, census 430/375/768) is now a pre-registration check of a superseded
build; the claims rest on the v2 runs only. New identity trial `outin` (rot.mjs, simrot.mjs): the row is in view at a
slide's start, 20 or 60 ms into the slide the page jumps out of the 50 % margin and 80 ms later back; the return frame
and the following frames are judged like every other entry. The prediction set, the classes, the pooled rule, the
decisions and the phone bound above stay as registered (tocard v2 05daca3beb58, unchanged).

v2 probe hashes (copies in `out/rest-script/probes/`): rot.mjs 327ac6201edb, simrot.mjs 0129d599e985, run-ident.sh
96294223f5d4, run-ic.sh a832833fa77a, run-items.sh 7aa7e6b0c757, simrun.sh 06fdcd881bb3, simhold.sh e5fa49b5be45
(toolbar count only now), simcen.sh 40ec0426eb57, chainB.sh 75aa8ae4c04c (the run list; refuses to start unless the
overlay is a5286ebc4cb6). Unchanged: analyse.mjs 03b2df89340e, census.mjs b6bc0a5516cb, simcensus.mjs 98eff8b1425e,
items.mjs 5dd60d0d3e56, items-analyse.mjs e492ff4044d5, rocount.mjs a2874fa946b0, simtb.mjs 406a1d5e0f84.

v2 run list (chainB.sh, one shared probe hold at a time): Chrome identity 430, 1024, 375, 768, 1440, 430r; items 430,
1024; pain sequences 1440 (600↔1440 ×2), 1024 (768↔1024 ×2), 600→1440, with Chrome observer counts (rocount); Chrome
census 430, 375, 768, 1024, 1440, 430r; Simulator toolbar observer count (normal session, WDA), Simulator identity
records st6/fix and replays; Simulator census reps 1 and 2.

Repack (10:41Z, no probe or argument change): after ident 430, 1024 and 375, chainB was stopped and the rest of its
list runs from chainC.sh 667b34b16545, which packs two short jobs per shared hold (ident 430r + items 430/1024;
census 430 + 430r, 375 + 768, 1024 + 1440) to halve the queue entries. Same outputs, same overlay check.
chainD.sh 4ee1a69fafb1 is chainC from items-b on with a 2 h queue wait per hold (lead, 11:2xZ); no other change.

### Registration v3 (**P-083**; overlay 6c09e47961ba), before any v3 data

Second read PASS (mgmt-ops-10, 12:2xZ). P-080 is logged as a miss (v2 MORE at far y2796). **Lead's decision
(12:3xZ, before any v3 score): v3 is the last automatic re-registration. A MORE anywhere in v3 stops the topic and
the cause goes to the lead; no v4 without the lead's OK.**

The v2 census at 430 (ic3, scored under the registered rule) gave a **MORE** at the `far` position y 2796: rAF
callbacks 0/0 (C1/C2) vs 4, 4 (V) and code calls 17/17 vs 20, 20, floor 2. Same window: main frames 34/34 vs 13, 13,
style recalcs 34/34 vs 13, 13, layouts 4/4 vs 0, 0, paints 37/36 vs 3, 0 (all SAVE). Cause: v2 still requested one
rAF per slide start while the row is far (`fwCap`), to stamp the slide's first frame for a later resume. Decision (as
registered: "any MORE → fix and re-register"): chainD stopped (census 375 + 768 and later never ran), and the fix
changed in one place:

- `fwSetS` (slide starts, row far): instead of a stamping rAF, play an empty zero-length Web Animation
  (`new Animation(new KeyframeEffect(null, null, 0), document.timeline)`). No script runs for it. That the engine
  resolves its start time in the same frame as the slide's own CSS animations is **UNRESOLVED**: the spec makes the
  start time the ready time and leaves readiness to the UA (Web Animations 1, "playing an animation" / pending play
  task). The decisive local check is the identity trials below (far-started resumes in Chrome and on the Simulator);
  a phase mismatch there is a miss, as registered below. The start is read only when
  the row comes near during that slide (`fwStart()` in `fwSync`); `fwF0` (the real start read when the row leaves
  mid-slide, v2) still wins. Teardown cancels it. `fwCap` is gone.

Prediction (confidence 0.8): at far positions rAF callbacks and code calls SAME (0 extra per slide), main frames,
style recalcs, layouts and paints still SAVE; near and paused positions unchanged from v2. Identity (0.85): the
far-started resumes (smooth, jump, outin trials) still match C frame for frame. If the empty animation's start time
is not the slide's frame in an engine, resumes from far show a phase mismatch there; that is a miss (prediction 1).

Every v2 result (identity 430-1440 + 430r, items, rocount, census 430/430r) is now a pre-registration check of a
superseded build; the claims rest on the v3 runs only. Probes, classes, the pooled rule, the decisions and the phone
bound stay as registered (tocard v2 05daca3beb58; probe hashes as in v2 above, unchanged). Run list: chainE.sh
e6821c987249 (refuses any overlay but 6c09e47961ba): Chrome identity 430, census 430 + 430r, identity 1024, 375,
768, 1440, 430r + items 430/1024, pain sequences + rocount, census 375 + 768, 1024 + 1440; Simulator toolbar count,
Simulator identity st6/fix + replays, Simulator census reps 1 and 2. Outputs `ident3`, `items3`, `ic4`, `sim3`,
`simcen3`.

### Registration v4 (**P-084**; overlay 520d5f1139c7), before any v4 data

**P-083 (v3) missed identity** at Chrome 430 (ident3, analyse.mjs 03b2df89340e, reproduced by mgmt-ops-10): 6 of 27
visible slides matched neither F1 nor F2. In every case the resumed slide ran exactly one frame (16.6-16.7 ms) ahead
of st6's F1, and the frozen shot smooth-40 differed by 427 px (max channel delta 5) against an A/A of 0. Re-entry,
reload and back were clean. The v3 census at 430 (ic4) had no MORE: at far y2796 rAF callbacks and code calls were
SAME, and main frames 31→13, style 31→13, layouts 4→0 and paints 37/36→3/0 were SAVE. These v3 results are
pre-registration checks only.

**Lead's terms (12:4xZ):** option (a), a "current" clock animation, with its start frame checked in Chrome and the
Simulator first. **v4 is the last iteration: an identity miss (any non-zero pixel delta beyond the A/A) or any MORE
parks rest-script, and the cause goes to the lead. No v5.**

**Pre-registration checks (mechanism only, not claims; `out/rest-script/startprobe/`).** These were run on the v3
page, row far, one shared hold each. The start time is given relative to F1 (the first frame after the task that
plays the clock), in frames.

- Probes: startprobe.mjs (p1 3092131705f5; p2/p3 f867f3dadaea, `--forms`) and costprobe.mjs ea49d612ad88.
- Conditions, 4-5 reps each: idle, a rAF loop like the recorder, and the loop plus `getAnimations()` in the task.

| clock form | Chrome start | Sim start | Chrome cost, 3 plays in 3 s at y2796 (main frames; none = 9) |
|---|---|---|---|
| targetless 0 ms (v3) | −1 (F0) in 26/27 | 0 in 25/27, 2 at −0.06/−0.12 | 12, 12 |
| row-targeted 0 ms | −1 in 15/15 | 0 in 14/15, 1 at −0.41 | not run |
| targetless 1 ms (**v4**) | 0 in 12/12 | 0 in 11/12, 1 at −0.06 (1 ms) | 13, 14 |
| targetless 2 ms | 0 in 12/12 | not run | not run |
| targetless 220 ms | 0 in 27/27 | 0 in 25/27, 2 at −0.06 | 53, 51 |
| row-targeted 220 ms | 0 in 15/15 | 0 in 14/15, 1 at −0.12 | not run |

The 220 ms forms are sampled every frame while running, about 13 extra main frames per slide. That would turn the
far SAVE into a MORE (C makes 31 per 2 s at y2796), so v4 takes the 1 ms form. Sub-frame Sim offsets of 1-2 ms
(−0.06/−0.12 frame) appear in every form, including the original page's own timing granularity. They are left to the
identity trials and the pixel A/A, as registered.

**Change (one place):** in `fwSetS`, the far-slide clock is `new KeyframeEffect(null, null, 1)` instead of
`(null, null, 0)`. Everything else is as in v3: no rAF, read lazily on a resume, `fwF0` wins, and teardown cancels it.

**Start-time claim (research plan done, see the card):**
- Spec: Web Animations 1 §4.5.8 step 12, the pending play task: "Let ready time be the time value of the timeline
  associated with animation at the moment when animation became ready". §4.5.6 makes readiness UA-defined
  ("completed any setup required to begin the playback ... including rendering the first frame"). So a start in the
  previous frame (F0) for an effect with nothing to render is allowed. **CONFIRMED** that the spec leaves the frame
  to the UA.
- WebKit (github.com/WebKit/WebKit main, `Source/WebCore/animation/WebAnimation.cpp`): `runPendingPlayTask` takes
  `readyTime = m_pendingStartTime`, else the timeline's `currentTime()`, and it runs from `tick()` →
  `maybeMarkAsReady()` in the next animation update. That fits F1 for every form on the Sim. Line numbers are not
  pinned: main at 2026-10-03.
- Chromium (`third_party/blink/renderer/core/animation/pending_animations.cc`, `PendingAnimations::Update`): main-thread
  animations get `NotifyReady(TimelineInternal()->CurrentTime())`. The path that gives a zero-length effect the
  previous frame's time was not found in `animation.cc` / `document_animations.cc`. So "Chrome starts a zero-length
  targetless or row-targeted effect at F0 and a ≥ 1 ms one at F1" stays **OBSERVED in our setup, cause unknown**. The
  v4 identity trials are its decisive check.

**Predictions (unchanged in kind):**
- Identity: 0 mismatches in every engine and width, pixels within the A/A (0.85 Chrome, 0.7 Sim).
- Far positions: SAVE on main frames, style recalcs and paints; rAF callbacks and code calls SAME (0.8).
- Near and paused: as in v2.

Probes, classes, the pooled rule, the decisions and the phone bound are as registered (tocard v2 05daca3beb58, probe
hashes as in v2).

**Run list:** chainI.sh 574b8dae658f (refuses any overlay but 520d5f1139c7), decisive checks first:
- Chrome identity 430; census 430 + 430r;
- Sim identity st6, fix, replays fix, replays A/A;
- Chrome identity 1024, 375, 768, 1440, 430r + items 430/1024; pain sequences + rocount;
- census 375 + 768, 1024 + 1440;
- Sim toolbar count; Sim census reps 1 and 2.

Outputs go to `ident4`, `items4`, `ic5`, `sim4`, `simcen4`. One process note: stopping a chain while its next hold
had just started a Sim session leaked that session (SIGTERM mid-setup). It was cleaned with `sim.mjs doctor --fix`
(12:57Z), and no other session was affected.

## Why it lags

Not a scroll-jank fix: a heat (rest work) fix, user T-029. Four small pieces of script keep the main thread busy
while nothing on screen changes, frame after frame or tick after tick:

- `mM`, the #people avatar rotator: while the `#people` scene gate is active, a slide starts every 1020 ms
  (800 ms wait, 220 ms slide). Each slide writes the five slot `src`s (`x`) and `.is-sliding` (`S`), so Svelte
  flushes, the style is recalculated and the row is painted, even when the row is half a page or more off
  screen.
- `JT`, the commission count-up from 18 % to 0 %: it writes the state in every rAF frame of the tween, but the
  rounded text changes only a few times.
- `hD`, the pain notes: `setInterval(le, 3e3)` keeps firing at widths ≤ 860 px too, where the notes are hidden and
  `le` returns at once: a timer wake-up every 3 s that does nothing.
- `EM`, the profile count-up: it writes the four states in every frame, also when the rounded values are the
  same as in the last frame.

## What changed

All changes are in `/_app/immutable/nodes/2.DyWL8TcE.js`, on top of st6-rb2.

- `mM`: the rotator clock (`_`, with the scene gate's stall and restart) is unchanged. Its state lives in `fwX`
  and `fwS` and is mirrored into `x`/`S` only while the avatar row is within half a viewport of the screen
  (an IntersectionObserver with rootMargin `50% 0px`). Coming near, the state is written before the row can be
  seen. A jump (scrollTo, anchor, history, resize) is caught in the same frame by the scroll-path `u` and by a
  ResizeObserver on `<html>`, both using the row's cached document box. A slide in progress resumes at the
  original's phase: its CSS animations get `startTime` = the slide's real start. When the row was near, that is
  the slide's own animations, read when it leaves. When the row was far, it is the start time of an empty
  1 ms Web Animation played with the slide (v4; no script runs per slide). When the scene pauses, the
  frozen state is written at once.
- `JT`: the 18 → 0 % tween skips the state write in frames where the shown (rounded) text is unchanged.
- `hD`: the interval is not armed while `(max-width: 860px)` matches. Crossing above 860 px resumes it on the
  original's 3 s grid with a `setTimeout`.
- `EM`: the state write is skipped when the rounded values are unchanged.

## Cards (protocol v2)

(to follow)
