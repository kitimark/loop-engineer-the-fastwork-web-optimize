# Fix: rest-script

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** **parked** (2026-10-03 13:3xZ): v4 (P-084, the last iteration) missed pixel identity on the WebKit
Simulator; see "v4 result: parked" below. Not for landing. **P-089** (2026-10-04): v4 re-judged under PR-010 T2,
registered at the desk ("P-089 registration"), no new data yet.
**Stage:** F, stopped; D card registered below (P-078 → P-080 → P-083 → P-084, v4 last iteration)
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

### v4 result: parked (P-084 park rule)

**Chrome (passes).**
- Identity at 430 (`ident4`, analyse.mjs 03b2df89340e): 0 mismatches. 27 slides: F1 24, F2 2, both 1; 7 mid-entries,
  all F1. All 20 frozen shots 0/0, A/A 0/0. Widths 1024 and 375 ran; they were not scored after the park.
- Census at 430 (`ic5`, tocard 05daca3beb58): no MORE.
  - Far y2796: main frames and style recalcs SAVE (31/32 → 17/17), layouts SAVE (4 → 0), paints SAVE (34/39 → 0/3);
    rAF callbacks and code calls SAME.
  - Paused (3728, fee, pain): SAVE on main frames, style, rAF and code.
  - Near: SAME.
- Census at 430r: all SAME.
- mgmt-ops-10 reproduced both byte for byte.

**WebKit Simulator (misses).**
- `sim4`, the registered scorer analyse.mjs 03b2df89340e: `node analyse.mjs --st6 sim4/st6-s4.json --fix sim4/fix-s4.json
  --fixreplay sim4/rep-fix-s4.json --st6replay sim4/rep-st6-s4.json --out sim4/analysis-s4.json`.
- Frozen shot "rest" (y1715, row at top 339, x 0, same five srcs, no running animations, same rect in both arms):
  fix vs st6 replay = **5131 device px, max channel delta 49, against an A/A of 0/0**. That is a pixel delta beyond the A/A.
- Cross-check, outside the registered scorer: shot against shot, row crop at y = 177 + 3·top, x 140-520.
  - The fix's rest and intoview shots differ from st6's by 5131 and 5133 px (max 49), and only on the **4th avatar**
    (`photographer/avatar.jpg`).
  - far-0 is 0/0. Hash is 0/0.
  - Four st6 renders of the same state are pixel-equal on the row: the sim3 st6 shot, the sim4 st6 shot, the st6
    replay of the fix's states, and the st6 replay. So this is no replay artifact, and no run-to-run variance shows
    in st6.
  - The fix draws that avatar sharper: Laplacian variance 1010 vs 962, same mean colour (159.5). This looks like a
    different image resampling.
- Cause, **OBSERVED in our setup, cause unknown**. A candidate: while the row was far, v4 played no slide on the
  avatar elements, only the empty clock. So the 4th avatar never ran the slide's scale/pop animation before it was
  shown. WebKit may draw an image that was animated differently afterwards: a decoded-image size kept from the
  scaled draw, or a backing layer left over. Neither was checked.
- The other Sim checks: WebKit logpoints never fired (logpointCheck 0, events 0), so the per-frame model check and the
  smooth/jump/outin trials did not run. That is a harness defect of simrot.mjs on this Simulator.
- Not run after the park: Chrome identity at 768/1440/430r, items, pain sequences, the 375/768/1024/1440 census, the
  Sim toolbar count and the Sim census. chainI was stopped between two Chrome holds (after ident-375), with no Sim
  session open.

Per P-084 ("v4 misses identity → park, the cause to the lead, no v5"), rest-script is parked. The overlay
(520d5f1139c7) and `patch.diff` stay as the record. The far-row SAVE in Chrome is real, but v4 is not pixel-identical
in WebKit.

### P-089 registration (v4 re-judged under PR-010 T2), before any new data

Written 2026-10-04 at the desk. Nothing was timed, and no Sim or Chrome lane job ran for it. **No new data is taken
before mgmt-ops-10's second read passes.** The overlay stays v4 (520d5f1139c7): P-089 re-judges v4 under the PR-010
"wide" tiers (memory/illusion-must-be-pixel-identical.md, with the lead's reading). It is not a new version.

**The T2 bar.** A look-alike passes T2 when all of these hold:
- fill pixels at most 64 of 255, edge pixels at most 128;
- at most 0.5 % of the screen beyond the A/A, and at most 2,000 CSS px per element;
- nothing moved, recoloured or re-worded, and reduced motion exact (T0/T1);
- checked in Chrome AND the WebKit Simulator, each with a real A/A, at phone width plus one desktop width;
- a moving part within 1 device px of the original at every sampled frame.

A difference that shows only in motion, or that changes how something moves, is a proposal to the user (T3).

**Scorer: `tools/t2score.mjs`, sha256 3e236a71ef6b.** Committed in c1e7f60e before it ran on any data, and unchanged
since. For each frozen shot label L, on the element crop (the avatar row plus a 6 px pad):
- X = st6-rb2 replaying the fix's state of L; Y = the fix's own shot of L.
- A/A = st6-rb2's own shot of L against st6-rb2 replaying it.
- d = the max channel |X − Y| per pixel, and aa the same for the A/A pair.

The five numbers:
1. **Largest shade:** max d over every pixel, no mask, split into fill and edge.
2. **Share of the screen:** pixels with d > 8 and aa ≤ 8, over the whole viewport in device px.
3. **Area:** the same pixels / DPR², in CSS px. The crop holds one element, so this is the per-element area.
4. **Edge or fill:** fill when the pixel's 3x3 neighbourhood in X varies by ≤ 2 levels on every channel, otherwise
   edge (research/pixel-tolerance §1). Reported as counts among the counted pixels.
5. **Static or moving:** moving when the shot's state has `.is-sliding` or a running animation.

Tiers: T0 when d = 0 everywhere; T1 when no pixel has d > aa; T2 when the numbers above hold; otherwise T3. A shot is
VOID when:
- a crop is blank or the crop sizes differ;
- there is no A/A pair;
- the replay is missing or errored, or its geometry differs (row top or left, Chrome clip).

DPR and screen size:
- Chrome: DPR from the run, screen = w × vh × DPR².
- Sim: DPR = the magenta calibration's viewport width in device px / innerWidth, screen = the calibrated viewport.
- `node t2score.mjs --selftest` passes.

**Scores of the existing data** (scorer 3e236a71ef6b; outputs in `out/rest-script/t2/`):

Sim `sim4` (fw-sim, 430 CSS px, DPR 3):

| shot | tier | shade all/fill/edge | share | area (CSS px) | counted edge/fill | static/moving | any d / d > aa | A/A max, masked |
|---|---|---|---|---|---|---|---|---|
| rest | T2 | 49/2/49 | 0.0176 % | 58.56 | 527/0 | static | 5131 / 5131 | 0, 0 |
| far-0 | T1 | 52/2/52 | 0 | 0 | 0/0 | static | 13028 / 0 | 52, 974 |
| intoview | T2 | 49/2/49 | 0.0176 % | 58.56 | 527/0 | static | 13769 / 5127 | 37, 456 |
| hash | VOID | no A/A (st6's hash shot has no replay) | | | | | | |

The v4 identity miss (5131 px, max 49, on the 4th avatar) is within the T2 numbers. The Sim had no moving shots in
v4 (the logpoints never fired), so these numbers say nothing about motion yet.

Chrome `ident4`, 1024 (DPR 2), 20 shots. The registered analyse.mjs (03b2df89340e) pixel view, fix vs st6 replay, gives
rest 10507/62 against an A/A rest of 0/0. That is an identity miss in the P-084 sense. t2score gives:
- rest: T2, 62 edge, 322 CSS px, 0.0409 %, static.
- Worst moving shot: jump-100, T2, 58 edge, 333.75 CSS px, 0.0424 %.
- Worst static shot: far-0, T2, 61 edge, 426.75 CSS px, 0.0543 %, 1707 counted px, all edge.
- Largest shade overall: jump-215, 65 edge, within its A/A except 6 px.
- Tiers: T0 at smooth -120/0 and jump -120; T1 at jump 0/40; every other shot T2; hash VOID (blank crop).
- **Not one counted pixel is fill.**
- The st6 A/A itself has the same kind of difference (~10k px, max 49-65) on 9 of 19 labels. st6-rb2 renders the
  row at 1024 in one of two states per load or label, **OBSERVED in our setup, cause unknown** (compare F-199's two
  sub-pixel states). A two-load A/A misses the other state, so it counts against the fix. That is the conservative
  direction, and the numbers still pass.
- Model check (analyse.mjs): 0 mismatches. fix 27 slides (F1 26, both 1, none 0); st6 27, all F1; srcs map same.

Chrome `ident4` at 430 and 375 (DPR 3): every shot T0 (20 of 20 labels apart from hash, VOID, blank crop). The
moving frames are pixel-identical. Model check 0 mismatches.

**The existing data is not a T2 pass.** These legs are missing:
- WebKit reduced motion;
- a Sim desktop width and a Sim moving check;
- Chrome 1440 and reduced motion at 430 and 1440;
- the parts check.

**New harness, desk-written and hashed before any run** (`fixes/rest-script/tools/`; `p089.hashes` holds the hashes
`chainJ.sh` 1072a0e01067 checks):

| file | sha256 | what |
|---|---|---|
| `simrot2.mjs` | 4402c1a26160 | Sim harness, below |
| `rot2.mjs` | ed3ef131efd4 | the v4 Chrome harness `rot.mjs` (327ac6201edb), plus `parts` in every capture |
| `t2aux.mjs` | 77583824fb67 | `parts`: the moving-part check and the F-199 crop flag. `pair`: diffs for the pin diagnostics. `--selftest` passes |
| `analyse.mjs` | 03b2df89340e | the registered v4 model check and pixel view, unchanged copy |
| `p089-chrome.sh` | 8efc59be0662 | one Chrome leg (rec / rep / all) |
| `p089-sim.sh` | 9883b649abab | one Sim step (st6 / fix / repfix / repst6 / pins / score); `RM=on` = the reduced-motion leg |
| `chainJ.sh` | 1072a0e01067 | the run list; refuses any other overlay or tool hash |

`simrot2.mjs` changes five things against the v4 `simrot.mjs`:
1. **Slide events without the Debugger.** The v4 logpoints fired 0 times in WebKit. The rotator's helper `f(e)` reads
   `window.setTimeout` at call time: overlay line 11707 in the fix, 11575 in st6-rb2. A slide is
   `S = true; await f(220); x += 1; S = false`.
   - The injected setTimeout wrapper logs `start` when it is called with 220 ms and the first `2.DyWL8TcE.js` stack
     frame is that line (or up to 4 lines below).
   - It logs `fire` when that timer's callback runs. Any other 220 ms caller is counted, not logged.
   - Desk check: a stub window fed WebKit-shaped stacks gives 2 starts, 2 fires and 1 other for both arms, and a held
     timer logs its fire on release.
   - **Mechanism check:** the first Sim hold of each device is the st6-rb2 record. 0 hook starts there makes the
     leg VOID and stops the chain.
2. **Parts.** Every capture records each slot's border box, plus computed opacity, transform, clip-path and
   image-rendering, with the row frozen. rot2.mjs does the same in Chrome.
3. **Quiet rest (F-200).** After the v4 rest shot, the harness:
   - waits for a slide's `fire`;
   - freezes the row at the next frame (timers held, so no slide can start);
   - takes no screenshot and no scroll for 2500 ms;
   - then takes the shot.
   The record keeps the gaps since the last slide and since the previous screenshot; a gap < 1500 ms is VOID. Replays
   of a quiet shot also settle 2500 ms after reaching the state with timers held. Both arms take quiet shots, and so
   does the A/A.
4. **`--pin optimizeQuality|optimizeSpeed`** (F-200 diagnostic arms). It adds the rule
   `#people .start-selling-avatars img { image-rendering: <pin> !important }` before the first scroll and records the
   computed value. A pin that did not take is VOID.
5. **Reduced motion, logged in every run.** Every simrot2 run (record or replay, both arms) reads
   `matchMedia('(prefers-reduced-motion: reduce)').matches` and logs it as `reducedMatches` and in its summary line.
   A value that does not match the leg is VOID: reduce in a normal leg, or no-preference in a reduced one.
   - `--reduced` sets nothing itself; the session sets the mode (`sim.mjs session --reduce-motion on`, I-100, 0b082d16).
     It records the hook's slide starts and takes rest, quiet, jump-0, far-0 and intoview without waiting for a slide.
   - Every normal leg passes `--reduce-motion off`. Each step also logs `node tools/sim.mjs reduce-motion` after its
     open: the Simulator setting and the page's media state.

**How the moving frames are captured** (Sim and Chrome alike; Chrome keeps its working logpoints for the start):
- The slide start t0 comes from the hook. A timer at t0 + 1020 + ph (ph ms into the next slide) sets `__shotNext`.
- The per-frame ResizeObserver recorder freezes the row in the next frame's callback (after layout, before paint):
  CSS animations paused, page timers held.
- The screenshot follows after a 1200 ms settle: a simctl on-screen capture in the Sim, a Page.captureScreenshot clip
  in Chrome.
- st6-rb2 then replays the same state (slot srcs, `.is-sliding`, effective animation time, scroll y) and is captured
  the same way.
- Sampled frames per arm and device: smooth and jump at ph 0/40/100/160/215, and outin 20/60. That is 12 frames
  covering the 220 ms slide from its first to its last frame.
- Frozen frames cannot judge feel. A difference that exists only in the moving frames goes to the user (below).

**The new legs and their void rules** (one hold each; shared lane; ≤ 300 s; queue wait ≤ 7200 s; one Sim session per hold):

| leg | holds | what it gives | VOID when |
|---|---|---|---|
| Sim phone, fw-sim (430, DPR 3) | st6, fix, repfix, repst6 | rest, quiet, 12 moving frames, far-0, intoview; t2score + parts | hook starts 0 in the st6 or fix record; quiet gap < 1500 ms; replay geometry differs; replay state not reached; `fatal` |
| F-200 pins, fw-sim | pins (2 replays in one session) | st6-rb2 pinned optimizeQuality / optimizeSpeed replaying the fix's rest, quiet, intoview | a pin did not take; as above |
| Sim desktop, fw-ipad (iPad Pro 13", portrait; expected 1032 CSS px, DPR 2) | st6, fix, repfix, repst6 | as fw-sim, with its own A/A | as fw-sim; innerWidth ≤ 860 (not the desktop layout) |
| Chrome 430 reduced motion | 1: rec + rep | rest, jump-0, far-0, intoview; model check, t2score, parts | as v4 (analyse.mjs void rules); t2score VOID |
| Chrome 1440 (DPR 2) | 2: rec, then rep + scoring | the full 20-shot set; model check, t2score, parts | as above; the 1440 record lands in one hold and its replays in the next, from the same files |
| Chrome 1440 reduced motion | 1: rec + rep | rest, jump-0, far-0, intoview; model check, t2score, parts | as Chrome 430r |
| **Sim reduced motion, fw-sim** (`chainJ.sh reduced`) | st6, fix, repfix, repst6, every session `--reduce-motion on` | arms: st6-rb2 record and rest-script record, both `simrot2.mjs --reduced`; X = st6-rb2 replaying the fix's states; its own A/A = st6-rb2's shots vs st6-rb2 replaying them (all under reduced motion); shots rest, quiet, jump-0, far-0, intoview; t2score + parts | the st6 record's summary line does not say `prefers-reduced-motion reduce` (the chain stops); any run's `reducedMatches` false; `sim.mjs open` refuses (its own REDUCE_MOTION check); as fw-sim otherwise |

- **WebKit reduced motion** is the leg above, now that I-100 landed (0b082d16). The rotator does not run under
  reduced motion in either arm (`_` starts only when `e.matches` is false), so this leg checks the still row; the hook's
  slide starts are logged in both arms. **No T2 pass is claimed until it has run.** Reduced motion is checked at phone
  width in WebKit (fw-sim) and at 430 and 1440 in Chrome.
- The Chrome legs do not fit one 300 s slot: 430 took 153 s and 1024 took 264 s in v4. They are queued as four holds
  back to back in one chain (`chainJ.sh chrome`): 430r, 1440 rec, 1440 rep, 1440r.
- A VOID leg is re-run once with the same hashes, in the next lane turn. A second VOID goes to the lead with no claim.

**F-199 (the nav "EN" label, two sub-pixel x positions per load)** is handled by keeping every crop on the avatar row:
- Crop = the row's border box + 6 device px (Sim) or 6 CSS px (Chrome).
- v4 crop tops, viewport CSS px, lowest across shots: 375: 201.81; 1024: 310.67; 430: 417.86; Sim: 339.39.
  Crop lefts: 30.77 / 265-278 / 58.27 / 58.27.
- The EN label sits at x 250-265, y 37-46 (pill closed) or x 368-383, y 33-42 (panel open). **EN not in crop** in
  every existing leg.
- For the new legs, `t2aux.mjs parts` writes each shot's crop top and flags `enInCrop` when it is above 64 CSS px
  (the header band). Such a shot is VOID for T2.
- No full-screen frame is scored.

**F-200 (WebKit Low interpolation after an image is painted at two sizes within 500 ms; mechanism CONFIRMED in
source, fit OBSERVED).**
- **Tension:** carousel-leaver D4 (32708ca) found st6-rb2 never leaves Default quality (S~Sq 0 everywhere). So F-200
  may not explain the v4 difference (the fix draws the 4th avatar sharper).
- Three pre-registered readings on rest, quiet and intoview (fw-sim):
  - **a.** Fix vs st6 pinned optimizeQuality (t2score `t2-vs-q`) is T0/T1 → the fix draws st6's Default look.
  - **b.** st6 unpinned vs st6 pinned optimizeSpeed (`t2aux pair`) has 0 pixels with d > 8 → st6 was at Low in those
    shots.
  - **c.** st6 unpinned vs st6 pinned optimizeQuality has d > 8 → the two qualities differ visibly on this image.
    This is the sanity check for a and b.
- Quiet rest: fix quiet vs st6 replay of it.
  - T0/T1 → the difference is gone at quiet rest (≥ 1.5 s, here 2.5 s, with no snapshot and no slide). Then it is a
    transient after slides.
  - T2 or worse → it is a standing difference.
- **The framing question for the lead.** The shots answer whether the baseline's transient Low look counts as "the
  look". The answer goes to the lead, not to the scorer:
  - **a + b true, and quiet T0/T1:** st6 shows a Low draw for a moment after each slide, and the fix shows the
    Default draw in that moment. It goes to the lead as this framing question.
  - **a false:** the fix's sharper draw is not st6's Default look either. The cause stays **OBSERVED in our setup,
    cause unknown**, and the T2 numbers decide.

**Decisions (fixed now).**
- **T2 PASS, sent to the lead as a re-judgement result** when all of these hold:
  1. every non-VOID shot of every leg is T0/T1/T2: Chrome 375, 430, 1024 (existing), 430r, 1440 and 1440r; Sim
     fw-sim, fw-sim reduced motion and fw-ipad;
  2. every reduced-motion leg (Chrome 430r and 1440r, Sim fw-sim reduced) is T0/T1 on every shot (reduced motion
     exact);
  3. every moving frame is within the numbers, and `t2aux parts` PASSes on it: ≤ 1 device px on every slot edge, with
     equal opacity, transform and clip-path (Chrome 1440, fw-sim, fw-ipad; the Chrome 430/375 moving frames are T0);
  4. no difference is motion-only (below);
  5. every mechanism check passes and no counted shot has the EN label in its crop;
  6. the F-200 framing question, if the readings raise it, is answered by the lead.
  Landing would still need the lead's un-park and the less-work gate's cost card (P-084's census).
- **T3, a proposal to the user through the lead:**
  - any shot beyond the numbers;
  - reduced motion beyond its A/A;
  - a part more than 1 device px off, or a changed opacity, transform or clip-path;
  - a **motion-only difference**: a leg whose moving frames have counted pixels while all of its static shots (rest,
    quiet, far-0, intoview, jump-260 / smooth-260) are T0/T1.
- **The lead's call:** the F-200 transient case above.
- **The P-084 lesson stands.** A miss here (a T3 anywhere) parks rest-script again with its cause. There is no v5
  and no harness change after this registration without the lead.

**Lane order (after the second read passes).**
- `chainJ.sh sim` (9 Sim holds) and `chainJ.sh reduced` (4 Sim holds), `--weight simulator`, queue behind
  fix-carousel-leaver's diagnostics, one after the other.
- `chainJ.sh chrome` (4 holds, `--weight 2`) comes after fix-morph-gpu's re-runs.
- Every hold uses `--timeout 7200`, ≤ 300 s, and one Sim session; one queue entry at a time.
- The score steps run outside any hold (file reads only).

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

None: parked at F under P-084 (see "v4 result: parked"). The D card is the registration above.
