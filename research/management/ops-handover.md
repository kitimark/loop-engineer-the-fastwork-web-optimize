# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current instance:
**mgmt-ops-9** (named spawn, agent ID acfd7a13b6014f754; from 10-03 00:0xZ; mgmt-ops-8 ran 10-02 23:5xZ-10-03 00:0xZ,
mgmt-ops-7 10-02 09:13Z-23:5xZ), worktree `.claude/worktrees/agent-acfd7a13b6014f754`, branch
`worktree-agent-acfd7a13b6014f754`. Next instance: **mgmt-ops-10**, named (at ~60 % context). Last update:
**10-03 00:1xZ** (mgmt-ops-9).

## mgmt-ops-9 log (from 10-03 00:0xZ, newest first; START HERE)

- **06:4xZ main 915237a (I-080 fix: a shared group left its last-grant record on an idle lock; resolved).**
  - **I-081** open, not blocking (ts-i080 reported): an exclusive `--short` grant also leaves a short last-grant
    record on an idle lock (doctor: last-grant-short-outlived); owner **ts-i081** (worktree subagent, spawned 06:12Z).
  - **Rotation (lead, all holds <= 300 s):** P-071 attribution tC (iphone-runner, Timeline, 06:19Z) -> cd-strip G4
    (moved up: its card blocks the user's choice and cd-roll-ca) -> cd-roll-ca debug run 3 -> fix-nav-morph v1c Sim
    holds 2-3 -> hero-exit-threaded (locating the y884 paints).
  - **P-073 rev 2** (fix-nav-morph): ops points 1-4 and the reviewer's 3 nits are in (uncapped hot-run collapse flagged
    to the lead; battery temp logged at pin arrival; "D collapses" row first, first matching row wins). v1c =
    `fixes/morph-webkit/gestures/arm-scope-touch-v1c.json` 0653995a35be (55cfbec, v1 minus the end loop's
    `until atEnd`). Rev 2 sha comes to ops after the v1c Sim result; ops re-reads, the lead signs.

- **06:1xZ ef16659 landed. F3 ruling; P-073 assigned, second read NEEDS-FIX.**
  - **Lead's F3 ruling:** D proceeds on its own merit, gated on (1) the D2 Timeline attribution not naming D's
    listener add/remove or other D changes, (2) a new hot-held block. P-071 ran at 37-38.6 °C; P-036's V-only
    collapses were at 40.3-43.3 °C, so temperature is the new question that reopens B1. P-036 confirmation and the
    user swipe wait for both gates. PROGRESS F3 `next` in the lead's plain words; upcoming swipe re-dated.
  - **P-073** (fix-nav-morph; card "P-073 prediction card" in fixes/mw10e-arm-scope-d/README.md, 9dfca7f on
    fix/f3-arm-scope, fe27e9a working; ledger row after P-071): B1 hot-held, C / V / D, arm-scope-touch-v1, counted =
    capped runs only (re-run in place), band 40.0-41.0 °C at each run start, warming by uncounted W cycles on the
    plain baseline page, idle >= 57 fps validity, S sentinel in band (a failure stops the block), collapse as P-071 +
    a "sustained" second reading, budget <= 20 runs / 100 min, lead's decision table. **Ops second read NEEDS-FIX:**
    (1) no row for D "not enough" (and say what an under-filled control means); (2) heat ceiling (park + void at >=
    42.5 °C or an iOS thermal notice, cool to <= 41); (3) charge state per run, constant across arms, change = void;
    (4) scope for the lead: his message said "C vs D", the card adds V as positive control (ops thinks V belongs).
    **Lead accepted all four:** C / V / D, V kept as positive control; budget pressure from V's cap re-runs is for the
    forced-cap v1c (Sim check first; if v1c fails, raise the budget or register "arm short of 3 -> inconclusive ->
    lead"); D < 3 counted -> inconclusive -> lead, no landing; an under-filled C or V voids that arm's comparison.
    Rev 2 list sent to fix-nav-morph (plus review-f3-arm-scope's three nits, text not seen by ops). Lead signs rev 2
    after ops' PASS and the v1c Sim result. Ledger "next free" P-074.

- **05:5xZ P-071 block done and scored (official, lead 05:5xZ); scorer second read PASS.**
  - Block 03:59-05:37Z, valid: S-open PASS 60.2/57.9 (LOAD>8 flag at stamp), S-end PASS 60.2/57.6; LPM off (C-027,
    idle rAF 59 Hz every run); battery 78-79 % held; 0 errors; every counted run and sentinel in its own
    `--no-timing` hold. Deviation: the chain hit Bash's 2 h cap at 05:34Z in the cooling gate after V3; S-end
    re-issued by hand in its own hold; no run affected.
  - **Official verdict:** V clean 0/3, D clean 0/3; C 1/3 (C3, cycle phase, 2 windows 27.5/25 fps 3 s after a
    touchend with no touch and the morph closed; recovered after the up stroke) is outside the decision rule and a
    miss on "C clean ~90 %". Card units (per-run max dt): arm C 70/64/74, V 68/64/69, D 70/98/66; disarm C 32/33/35,
    V 33/34/35, D 35/85/39: no separated-worse anywhere. The ~60 % prediction missed on its second half (D2 c2 disarm
    85 ms, the only disarm frame > 50 in any arm). **B1 UNRESOLVED under pin-hold-v2; no second block without a new
    question.** D2 outlier goes to Timeline attribution before D lands. The lead's arm >50 counts (C 10/11/14 vs V
    8/7/9) are exploratory only, not pre-registered, threshold-sensitive, never a gain.
  - **Scorer second read (ops): PASS.** `out/iphone-runner/p071-score.mjs` a90e807d4296 matches card b88f100: pin
    arrival = first frame y >= 5200; 2 s windows from pin arrival, collapse = 2 consecutive < 30 fps; strokes after
    mark `cycle`, up = arm [first touchmove −50, lift +500], down = disarm [lift +400, lift +1200]; twins >46/>54,
    >30/>38, near bands (30,38]/(46,54]; per-run max taken over the 2 strokes of a kind. Re-run on the 9 gesture files
    (sha12 match iphone-runner's table; GESTURE_HASH 2d3a97b742cf47c6): output byte-identical to score-p071.json
    f8e231d4b617.
  - PROGRESS: 05:50Z change line (lead's plain words), F3 `next`, P-071 check, details, upcoming swipe "after one
    odd run is traced". The P-071 row lives on fix-nav-morph's branch: it fills measured/in?/lesson there.
  - Next: Timeline attribution (iphone-runner, `gesture --timeline` after rebase on df55321): V at the pin
    (reference), D's cycle phase, C's cycle phase (C3). P-071 row filled by fix-nav-morph (97abb52 on its working
    branch, f5c2b48 on fix/f3-arm-scope; README f342e2b, 54adbdd); ratio median D/C 1.00 arm max, 1.06 disarm max.
    The V/L ruling is the lead's: the card has no V-clean + D-clean branch.
  - **cd-strip (lead 05:4xZ):** the fade50 delta-1 digit class shows in both strip builds above the A/A rate; it goes
    to the user as a proposal (land with the residual or park) once its card is done; P-072 waits for that decision.
    PROGRESS `next` + an upcoming "your choice" entry.
  - **I-080** open (tool, lead): a shared-lane group leaves `chrome-measure.last-grant.json` marked short after it
    ends (doctor: last-grant-short-outlived); ts-i080 on it.

- **05:1xZ 7f00616 landed. cd-strip -> strip-rw; hero-exit frozen frames explained; P-071 on its last counted run.**
  - **cd-strip** builds **strip-rw** (strip-rb + a wrapper, one write per m change; strip-rb raised style writes at
    mid/end pin); 3-gap check plan (one Sim job per P-071 cooling gap); **P-072 re-registered against strip-rw's card
    before data** (ops second read owed when fix-cd-strip sends the sha). cd-roll-ca adapts `__crTops` to the wrapper.
  - **hero-exit-threaded:** frozen frames done: R1 = C's own two raster states, R2 = deck-edge shadow, R3 = the
    unarmed first frame; trying a scroll-event re-add for R3, then the user options.
  - **F-161** (pitfall, fix-hero-exit-threaded): `lock.mjs wait --until released-by:X` is met whenever X does not
    hold; to queue after X's NEXT run chain `--until held-by:X` then `--until released-by:X`. Its 04:32Z Sim job
    delayed P-071 V2.
  - **P-071 holds:** D2 04:45, C2 04:54, D3 05:04, C3 05:14-05:16Z; **V3 (last counted) next**, then the end
    sentinel and the attribution runs; counted done ~05:30Z.

- **04:4xZ add7185 landed. cd-strip picked; cd-roll-ca rebuild; Sim gap rule; P-071 at D2.**
  - **cd-strip** (lead): picked **strip-rb**, identical on all rows; the idle-paint gain is withdrawn; gains = re-entry
    Paint, backing MB, style writes. PROGRESS `fixes`/`next` and a 04:45Z change line say so in plain words. **Lead's rule
    (04:5xZ): a pre-registered prediction is never restated.** P-070 (made for strip-cl, no data) is "superseded before
    data: build changed (strip-cl -> strip-rb, lead 04:4xZ); text unchanged" in cd-strip's ledger; fix-cd-strip
    registers **P-072** (ops id, 04:5xZ) for strip-rb before any wave-2/phone data (re-entry Paint, backing MB, style
    writes, no new slow frames; no idle-redraw claim unless meant); ops second-reads it. PROGRESS check line now
    points at P-072; ledger "next free" P-073.
  - **cd-roll-ca** rebuilds as "cells-only" on strip-rb; round-3 PASS (dbb113f) covered the earlier build.
  - **Gap rule (lead):** one Simulator job per P-071 cooling gap, alternating cd-strip / hero-exit-threaded.
  - **Pitfall (hero-exit-threaded posting it):** `lock.mjs wait --until released-by:<o>` is a state check, not an
    event: it is met whenever <o> does not hold, also before <o> ever took the lock.
  - **P-071 holds (holds.log):** S-open 03:59:11Z, C1 03:59:52-04:01:55, V1 04:12-04:15, D1 04:23-04:26, V2
    04:34-04:38; D2 next (the lease label names the next run during cooling). ~11 min per run with cooling: counted
    runs done ~05:35Z, then the end sentinel and the attribution runs (`gesture --timeline`, df55321).

- **04:1xZ main df55321: 68dc897 (ops), fe3d1e5 (de-heat P-068 nits: D1 raw-slope wording, ledger share marked
  descriptive), df55321 (I-079 fix: `iphone.mjs gesture --timeline`, rebased from 2ff855d); lead runs npm test on
  df55321, then resolves I-079.**
  - **P-071 running** (iphone-runner): warm-ups C 03:40Z, D 03:44Z; S-open PASS 03:59Z (load1 10.8 at stamp, record
    8.5 -> 7.0, flagged LOAD>8); C1 clean 04:00Z (load1 6.5). **Ops misread, no deviation:** at 04:02Z the lease's job
    label already read "run V1" while the chain sat in the phone-temp gate between holds (C1's hold ended 04:01:55Z,
    Safari parked); V1 had not run. Every counted run and both sentinels run in their own `--no-timing` hold
    ("acquired after N s" in the run log); per the lead, each hold first waits up to 90 s for load1 <= 8, else the run
    keeps a LOAD>8 flag. fix-nav-morph's conditional V1 ruling (count, flag, report with/without V1) is moot. Lesson:
    the iphone lease's job text names the NEXT run during cooling; check chrome-measure holds.log, not the label.
  - fix-nav-morph's state at its hand-back: `fix/f3-arm-scope` d20f7f7 (landing candidate, built on D, unlanded);
    working branch `worktree-agent-a277ea00c8773c1ea` 50d7646; Timeline attribution waits for I-079 (now landed),
    collapse results stay OBSERVED until it runs.

- **03:4xZ 10ac0af landed. P-068 heat test scored; ops second read PASS; heat goal now firm.**
  - **P-068** (iphone-runner, H1 + H2, both attempt 1, held at 80 %, floor check pass both): score.json
    61219d594ea6 on samples.jsonl 3c14bcd297ce, scorer 1ca63e2b4d11. Ops re-ran `heat.mjs score --in` on the same
    samples: output byte-identical. **Fastwork heats more** (B − A corrected 0.565/0.413, raw 0.433/0.365, both
    >= 0.10, not start-sensitive); **the fixes cool the phone** (B − X 0.428/0.162, raw 0.337/0.141, both >= 0.05).
    Corrected slopes F −0.085/−0.105, A 0.055/−0.013, B 0.62/0.40, X 0.192/0.238. Deviations D1-D4 in iphone-runner's
    RUNLOG (H1-3B pre-warm likely inflates H1's B; H2 alone passes both verdicts). Write-up + ledger row: de-heat
    2801f4a (README "Result"); **ops second read PASS** (re-score identical; D2 recompute with H2's B 0.40 -> B − A
    +0.345, B − X +0.208 checked; misses stated as misses; system power descriptive, no units; "fixes cool" scoped to
    st6-rb2 without the countdown fix). Nits, not blocking: D1's "low start biases the corrected slope upward" is
    about the raw slope (the correction removes the modelled part); the ledger lesson's "32-61 %" lacks the README's
    "descriptive". Per the pre-registered outcome: work at rest becomes a ranked goal (countdown first, then the
    carousel); "the fixes cool the phone" goes into PROGRESS as a heat gain (change line 03:45Z, share marked a
    rough figure). PROGRESS goal's conditional heat clause made firm.
  - **Lead 03:24Z** moved iphone-runner's H2-4F to #1 (after ts-i079's npm test). hero-exit-threaded stays at I.
  - **cd-roll-ca wording** (review finding 3): it is a watched blind side-by-side comparison, no touch; PROGRESS
    item, gate, next and upcoming reworded.
  - **Phone:** P-071 pin-hold started 03:34Z (warm-ups), iphone-runner, ops OK given.

- **03:3xZ 5b1e544 landed. P-071 second read PASS; reviews; I-079 open.**
  - **P-071 PASS** at b88f100 (fix-nav-morph; card dd122cc, ledger row fedec12). All four round-1 points closed:
    S sentinel on C with void/cool/stop; arm-level >= 2/3 collapse, 0/3 clean, 1/3 inconclusive (V 55/30/15, D|V
    50/40/10); unit = per-run max over 2 cycles, n=3v3, separated-worse = every D > every C and median diff >= 16.7 ms
    at > 50 (twins 46/54); LPM recorded, on = void. Pre-data amendment: arm window first touchmove -50 ms to lift
    +500 ms (Sim 02:47Z: cycle 1 reopens by native scroll to the end, 0/27-28 prevented; cycle 2 31/31). iphone-runner
    has ops' OK to start after P-068 H2. Ledger "next free" now P-072 (P-071 row on the owner's branch until it lands).
  - **I-079** (open, tool, iphone-runner): `iphone.mjs gesture` cannot record WebKit Timeline during a WDA gesture
    run; needed for P-071's attribution runs (not its counted runs); ts-i079 on it.
  - **cd-roll-ca** review round 3 PASS (dbb113f, JS 2af461dc); blind test after cd-strip lands.
  - **cd-strip:** lead picks strip + per-cell layers if its last pixel rows pass.
  - **hero-exit-threaded:** Chrome path gated to WebKit only (lead approved); WebKit residual -> A/A, hunt, then user
    options; accent paints at 1.5x block its phone ticket.
  - **Flaky unit test** (5b1e544's first test:unit, 1 fail of 675): name lost (my grep kept only counts), 2 reruns
    clean; no incident without a name. Ops keeps full logs (scratchpad/mgmt-ops-9/unit*.log) from now on.
  - **Phone:** P-068 H2 segment 4 (F) at 03:2xZ; iphone-runner queued 3rd for its no-timing hold behind two shared
    readers (ts-i079, fix-hero-exit-threaded).

- **02:5xZ a02c915 landed (ff). P-071 card (fix-nav-morph, F3 B1 pin-hold) second read: NEEDS-FIX.**
  - **P-071** (bb33c14 on worktree-agent-a277ea00c8773c1ea; pre-data): C aw1-10e 3e2f599a1632 / V F3 c6d3590576a7 /
    D mw10e-arm-scope-d 999c4497f37e, CSS c6aad94b455f; G pin-hold-v2 2d3a97b742cf (transit to atEnd, 8 s idle at
    the pin, 2 close/open cycles); C V D / V D C / D C V, warm-up per port, own no-timing hold, Timeline off, attribution
    after; metrics: collapse per run (2 consecutive 2 s windows < 30 fps) + arm/disarm window frames (phone ms
    thresholds, twins). Predicted: C 0 collapses (~90 %), V >= 2/3 (~55 %) or 0/3 (~30 %); given V collapses, D 0
    (~50 %). Decisions: V yes/D no and D windows not separated-worse -> short P-036 on D -> F swipe; D collapses ->
    build E (Sim + Chrome review first); D arm frame separated-worse -> lead with Timeline; V never -> B1 stays
    UNRESOLVED, no second block. **Ops asked for:** (1) S sentinel on C at open and end (P-036 rule, void + cooling +
    stop rule); (2) arm-level collapse rule, incl. V or D at exactly 1 of 3; (3) unit for separated-worse (per-run max
    n=3 vs per-cycle n=6) and which twins decide; (4) Low Power Mode recorded off, a run with it on void. Card under the
    id P-071 in the README + ledger row on the owner's branch; ops re-reads the amended sha before iphone-runner starts.
  - **cd-roll-ca review round 2 PASS with nits** (a57444b, V JS 673b110d); lead holds the sign-off until the hide-check
    re-analysis (108/247.9 -> 3.29/0.27 px) is explained; waits on cd-strip.
  - **cd-strip step 4:** remainder variant dropped; the suspect is the backing size (only the visible cell and per-cell
    layers both give 0 px); a size sweep runs, then a cost table to the lead. Chrome: identical except at hero fade 0.9
    (delta 1, beyond A/A, 7 shots); PROGRESS line narrowed accordingly.
  - **Phone order (lead):** P-068 H2 straight after H1 (one sitting) -> F3 B1 pin-hold P-071 (~03:30Z) -> cd-roll-ca
    blind test once cd-strip has landed.

- **02:3xZ a265420 landed (ff). F3 B2 fixed, B1 unresolved; cd-strip WebKit hero-pixel delta; P-068 H1 F, A, B done.**
  - Lead moved iphone-runner to chrome-measure #1 (audited) so the P-068 H1 segments stay back-to-back (fix-nav-morph
    next); each segment runs in its own exclusive `--no-timing` hold (README line 92), never beside a shared group. I-077
    phone confirmation is in the incident record (lead).
  - **F3 (fix-nav-morph 909747c, on its branch):** B2 FIXED in new build mw10e-arm-scope-d (JS 999c4497f37e: window
    touch listeners while the morph is active; Chrome gap cases at m=1 edge and below the nav mid-tween: V fails, C and D
    pass). **B1 UNRESOLVED:** Simulator G pin repro and Chrome pin counts show no collapse and no arm difference. Phone
    ticket after P-068: G pin-hold C/V/D, then Timeline; D also needs a short P-036 confirmation before landing. F
    swipe stays postponed. A prediction card for the ticket takes **P-071** (ops second read).
  - **cd-strip hero pixels (lead, OBSERVED, cause unknown):** in WebKit the hero digit edges are uniformly 1 level
    lighter (delta <= 3); the static check (cell at 0) still differs, so it is not the offset. fix-cd-strip hunts a
    pixel-identical layer variant (lead: no exception); if none exists it goes to the user as an options proposal.
    cd-roll-ca rebases on whatever cd-strip lands; its review B1 is fixed in code, hidden-tab check queued.
  - hero-exit-threaded: Chrome ablation located a 1-px copy shift in the copy's scroll-timeline animation; next a
    WebKit Simulator screenshot check C/C/V plus the y300 at-rest layout count.
  - P-068 H1: F, A, B done; X next after cooling to 37 °C (H1 ends ~02:35Z); H2 ETA not given yet.
  - PROGRESS: F3 next (missed-touch case fixed, end-hold check on the phone after the heat test) + B1/B2 detail;
    cd-strip next (simulator digit edges a shade lighter; identical variant hunted, else options for you).

- **01:5xZ 3de2653 landed as 9b9c3ef (lead rebased it onto 5d656c3); main 77c9f75.** 5d656c3: de-countdown scopes the
  clock-down hypothesis to baseline arms (F-152, fix-pill-swap: st6-rb2 has no avatar swap and no 1 Hz heavy layout;
  OBSERVED, Simulator). 77c9f75: de-countdown plans the part (b) restack, stack order **st6-rb2 -> cd-strip ->
  cd-roll-ca -> (b)**, gate/roll contract agreed with fix-cd-roll-ca (hold via `__crStop`, show via `z(a, held)`).
  - **F-153 (fix-cd-strip, coupling; acked by de-countdown and fix-cd-roll-ca):** cd-strip supersedes countdown-faces
    (a) (and illusion-digit-layers for the countdown); **(b), the hidden-skip gate, must be rebuilt on cd-strip by
    de-countdown after cd-strip lands, on the lead's order.** cdwc's panel `.face` rule (CSS 11953) matches nothing after
    cd-strip (arm b ships its own `.strip` will-change: auto retarget); `__cdStripY` is periodic, so a strip driver keeps
    offsets in [0, 9] (cd-roll-ca applied it). PROGRESS cd-strip details carry it.
  - Lead lands by rebasing ops commits itself when main moved: after a land, `git rebase main` drops the landed patch.
  - **cd-roll-ca:** D signed (fast path); review-cd-roll-ca reviews 2625f49. The user's blind roll test (3 pairs, a
    catch pair 2nd) is posted after P-068 and the review pass. (b) is rebuilt after cd-roll-ca lands.
  - **I-077 CONFIRMED on the real phone** (lead): P-068 H1 segments 1 and 2 opened in the parked tab with no Safari
    restart (793c8bc). The incident record note is the lead's (`incident.mjs update --by lead`).
  - **P-068:** H1-1F done (5 cycles, 01:33-01:40Z); H1-2A running.

- **01:4xZ F3 review CHANGES REQUIRED; pill-swap DROPPED; I-078 RESOLVED; P-068 running.** Rebased on main 9df12de
  (4fb3098: de-heat's P-068 system-power amendment, pre-data: PowerTelemetryData logged, reported descriptively,
  verdicts unchanged, scorer 1ca63e2b4d11; both ledger rows kept).
  - **F3 (f3-arm-scope): review-f3-arm-scope on fix/f3-arm-scope 846427e: CHANGES REQUIRED.** P-036's card part stands
    (scorer rerun identical, PASS also without V2). B1 (OBSERVED, cause unknown): a V-only frame-rate collapse at the
    end pin when the run settles at y 5215 (5-21 fps idle vs C 52-60; 2/2 V vs 0/5 C). B2: touch-coverage gap
    mid-tween and at m=1, where the morph does not reverse. **F3 does not land; the user's F swipe is postponed.**
    fix-nav-morph committed the scorer on fix/f3-arm-scope 846427e (fixes/mw10e-arm-scope-c/p036-score.mjs; records in
    iphone-runner's out/p036/). Lead decision: no user phone step while P-068's timed holds run (user-steps-first
    applies only once a step is posted); the F3 swipe is batched with cd-roll-ca's if ready.
  - **pill-swap: D NOT PRESENT, dropped (9df12de, lead).** F-146/F-148's avatar template swap was measured on the plain
    baseline; st6-rb2 already contains rotator-st6, which removed it (Sim 0 heavy rotator layouts at every position;
    Chrome pastHero ~4 light layouts per 4 s). No fix built. The 01:00Z PROGRESS line is corrected (on the best build an
    earlier fix already removed the swap); item pill-swap dropped; ledger note added (no card was made).
  - **I-078 RESOLVED** (84a0982, npm test on main 1343/1343). Relayed to the Simulator users (fix-cd-strip,
    fix-cd-roll-ca, fix-pill-swap, fix-hero-exit-threaded, fix-nav-morph): `git rebase main` between steps, no
    re-measure.
  - **cd-strip review round 1: CHANGES REQUIRED** (code fine): WebKit Sim pixel parity, more Chrome scenarios, README
    fixes, idle-triple counts.
  - **P-068** running: iphone-runner's no-timing hold from 01:16Z (warm-ups F A B X, then cooling for H1).
  - PROGRESS: 01:15Z line corrected (robot-finger test passed, review found a possible slowdown at the end hold and a
    missed-touch case, swipe postponed, heat test now); F3 item next + review detail; upcoming F3 swipe postponed;
    01:00Z line corrected; pill-swap dropped; cd-strip next (review round 1). Ledger: P-036 review note, pill-swap note.

- **01:2xZ P-036 SCORED: card part PASS (fix-nav-morph 6fb21b2; ops second read PASS).** Landed since 4e29fd5: 9b7454d
  (de-countdown caveat: X1 layersForNode paintCount deltas may count the census itself; Timeline digit-Paint counts
  and the stage-2 decision unaffected), 2998720 (de-gpu G2 correction: Timeline 13 -> 0 per 4 s; the lead told the user
  in T-030 #12), 84a0982 (I-078 tool fix).
  - **P-036** (G, 00:28-01:10Z, signed amendment 4084772, iphone-runner; C aw1-10e 3e2f599a1632 vs V F3 c6d3590576a7,
    CSS c6aad94b455f, script d72ee13644cc): median touch-to-scroll C / V Z1 196.8 / 192 (-4.7), Z2 193 / 194.5 (+1.5),
    Z3 189 / 189 (0) ms, every zone overlap (Z1 still overlap without the hot V2: V 190-192.5 vs C 192.5-201). 8/8
    valid; S-open 60 / 58.9 fps (38.9 °C), S-end 60.2 / 57.1 (40.7 °C) PASS. Deviations disclosed: V2 hot (42.6-43.3
    °C, Safari unparked ~6 min between holds 1 and 2), V2/V4 started at decaying load1 20-26 (2.3-4.5 inside holds), C2
    re-run in place. Info only: first touchmove cancelable Z1 C 0/4 vs V 4/4 (OBSERVED), no cost (queue delay 14.5-17
    vs 15-17 ms); Z1 dt>50 per run C 2,1,3,2 vs V 1,16,3,2 (16 = hot V2). **Ops second read:** per-run medians recomputed
    from the README table (derived numbers only; no gesture record committed, N1): all six zone medians and the overlap
    verdicts match; decision follows the registered rule. P-036 ledger row filled (Z1/Z2/Z3 in, card part PASS).
    **Next under the rule: the F part (user console blind swipe of F3, incl. strokes from the nav header), then an
    independent review, then landing.** fix-nav-morph's land-request contents went to the lead (branch
    worktree-agent-a277ea00c8773c1ea rebased on 2998720, 6fb21b2 … bc4b3fa); the console F step needs the lead's word.
  - **cd-strip:** D signed by the lead (fast path, no gain claim); review-cd-strip reviews tip cb45b05 (2d35411 fix,
    2a7163d P-070 card, cb45b05 id confirmed). **P-070 assigned by ops** (no other branch claims it); next free id
    **P-071**. Arm (b) unlayered: hero 0/259 shots differ, panel 1/169 (= A/A noise); Sim hero-clock paints 13 -> 0 per
    4 s, clock layers 80 -> 8, clock memory 1.18 -> 2.10 MB (OBSERVED, 2 sessions). Arm (a) layered rejected (67/169
    panel shots differ).
  - Phone: iphone-runner goes to P-068 next (cooling + rebase first); scorer iphone-runner, ops second read.
  - PROGRESS: change line 01:15Z (F3 robot-finger test passed; blind swipe + review next; then the heat test); F3 item
    next/check/details; upcoming F3 swipe "next for F3"; cd-strip next + P-070 check.

- **01:0xZ 7bc3d42 landed; bcb8ef5 + 8529d59 landed (de-countdown): F-146 EXPLAINED, countdown-faces clear for wave 2.**
  - **F-146:** the 1/s pastHero Layout burst is the community-pill avatar template swap (JS 11415-11447), a
    full-viewport Layout twice a second, identical in every arm; the PoC adds no write or invalidation while hidden
    (Simulator probe). On the phone the same layouts run longer in V: CPU-clock-down hypothesis, UNRESOLVED; research
    plan 8529d59 (CLPC/XNU and WebKit idle references, four probe-artefact checks, a decisive phone check only if a
    decision needs it). **New fix owner `fix-pill-swap`** (on st6-rb2) owns that component.
  - **P-036 hold-2 SIGTERM explained (iphone-runner):** its own Bash job hit the 30-min background limit. Hold 2 ran
    V2 (valid); C2 started 00:45:33, cut at stroke 7/16, VOID (aborted), re-run in place so the order stays C V V C C V
    V C. Hold 1 (00:28-00:37): wC, wV, S-open PASS (bottom 60, scroll 58.9), C1, V1 valid. No counted run outside a
    quiet hold. Remaining: hold 2b (C2, C3, V3), hold 3 (V4, C4, S-end). **Lead moved iphone-runner to chrome-measure
    queue #1 (audited)** to keep the holds close. fix-nav-morph scores; iphone-runner sends ops the result.
  - **I-078 triaged:** `ts-i078` spawned; workaround on the incident: wait for the Simulator shutdown to finish, retry.
  - Lead signs the cd-strip D card and the hero-exit-threaded ST-1 card when they arrive.
  - PROGRESS: change line 01:00Z (F-146 explained, countdown fix clear for wave 2, pill-swap fix), item pill-swap (I).

- **00:5xZ bad68d3 landed (ops batch: X1 stage 2 + second read PASS). I-077 RESOLVED (793c8bc, npm test 1339/1339 on
  main):** `iphone.mjs open` reaches Safari after a park again; D1's `--no-park` workaround is no longer needed for new
  blocks (rebase first). **I-078 OPEN** (tool, de-countdown 00:43Z): `sim session` refuses when fw-sim is in the
  transitional "Shutting Down" state at join (twice in a row; two 0.3 s countdown-faces shared holds exited 1).
  - **P-036 (iphone-runner, F3 G, signed S-sentinel plan):** hold 1 (no-timing, exclusive) 00:28:41-00:37:14 exit 0;
    hold 2 from 00:43:01 ended 00:46:39 by **SIGTERM (code 130, 217 s)** while the phone job read "run C2"; the
    shared group (cd-strip Simulator + others) took chrome-measure right after, load1 ~52. Asked iphone-runner what
    ran in hold 2 and whether C2 counts; a run outside its quiet hold voids under the plan.
  - GPU fixes (board 00:4xZ): cd-strip hero pixels 0 px / 259 shots vs st6-rb2, Sim hero digit layers 80 -> 8, paints
    166 -> 24 (counts, Simulator), D card to the lead next; hero-exit-threaded ST-1 Sim run 2 (run 1 never crossed the
    flip: html smooth scroll), ST-1 card next; cd-roll-ca tick rolls within the original's own stamp jitter (0.45 vs
    0.61 px), first-frame start edge fixed; F-146 Simulator probe of the 1/s Layout burst at pastHero (de-countdown).

- **00:3xZ landed: 630c700 (memory move), 3251486 + b44f58c (X1 stage 2), d8351b1 (de-gpu addendum), 793c8bc (I-077
  tool fix; incident still listed open at 00:3xZ, waits on the lead's resolve).** Rebased on 793c8bc.
  - **X1 stage 2 readout b44f58c (de-countdown, P-069 phone scored in PREDICTIONS):** one block 23:59-00:15Z, C V V C
    C V V C, 8/8 valid (4 ticks per window, hashes match, LPM off, no inspector), heat checks open 60/53.2, end 60/52
    PASS, no run in the C-027 settings window. Row 1 top L+P+C C 1028.9-1065.4 / V 1013.7-1100.6 ms, median V - C
    -19.2, **not separated -> "full" stays, X1 closes** (no pause-only offer). Row 2 pastHero S+L+P+C C 877.5-1053.8 /
    V 619.1-645.8, **V separated below, V/C 0.62 -> (b) confirmed on the device.** Row 3 resume not separated; frames
    > 50 at top not V-only. P-069 phone: row 1 in, |median diff| < 4 out (19), row 2 in, frames > 50 0-1 out,
    falsifier not met. **Open F-146** (post-hoc, OBSERVED, cause unknown): at pastHero at rest V has more long frames
    though less total work; the lead wants it explained before wave 2; de-countdown runs a Simulator `--lt` session.
    D1 3251486 = the I-077 workaround (mechanics only, accepted pre-count). **Ops second read of b44f58c: PASS** (recomputed
    from x1-stage2.json, counted runs 1-8 only, attribution runs excluded): served hashes C 4606120cf392 / V
    638b8e03e81c (CSS 27776f3d4138 both) as on the card; 4 ticks in every window; row 1 median V - C -19.2, not
    separated; row 2 V 619.1-645.8 vs C 877.5-1053.8, V below, V/C 0.618; resume and heroExit not separated; > 50 ms
    counts as in the readout. Decisions follow the card as written.
  - **d8351b1:** de-gpu's gpu-props addendum (section 4: X1 stage 2 outcome and F-146); de-gpu's tip was a628a6c.
  - **630c700 memory move (user OK both, T-032 #7):** `memory/` (README index + 15 scrubbed notes), imported by
    CLAUDE.md (`@memory/README.md`); Serena rules/project_overview are pointers; the auto-memory folder stays with a
    pointer header until a fresh session confirms the import. **The import works only in a FRESH session:** agents
    spawned in this session still see the old CLAUDE.md, so tell every peer you message to read `memory/README.md` by
    hand. Only the lead adds or edits notes; send the lead what should be remembered.
  - **P-068 scorer named (lead):** iphone-runner runs `heat.mjs score` (d1ec5c5345f7) after H1+H2 and sends ops the
    verdict; ops second-reads, then the conditional heat goal line becomes firm or is dropped.
  - Load spike: shared group (cd-strip + hero-exit-threaded Simulator) vs P-036 exclusive holds; the lead watches it
    (load1 ~29 at 00:3xZ, from 53).
  - PROGRESS: change line 00:30Z (countdown phone test: full stays, about 40 % less work past the hero, F-146 open),
    upcoming countdown test removed, F3 P-036 marked running (item next + upcoming).

- **00:2xZ T-030 report landed (41563ad, de-gpu; F-145); three GPU fixes at user priority #1; arch-memory proposal
  landed (cfe3693).** Rebased on main cfe3693.
  - **de-gpu T-030 (done):** lag left in st6-rb2, C-026 finger runs (F, one run per arm, OBSERVED): the first ~1000 px
    (hero exit + #people entry) hold 63 of 81 moving long frames; holding the morph at the end gives 91 frames > 34 ms
    (median 20 ms) that the moving count misses; middle and bottom nearly clean (17 / 1 vs O 45 / 21). Toolbar resize:
    real work in WebKit (CONFIRMED in source: fixed/sticky re-layout, vh/svh/dvh re-check) but small here (13-18 ms
    mid-page), not a fix candidate. Side effect: the open morph panel's `calc(100dvh - 40px)` re-lays out per toolbar
    frame (84/66/42 ms scrolling back up, one run, OBSERVED); fix-nav-morph takes it after P-036 (svh or px set once,
    pixel-identical in both toolbar states). Safari 26.4+ runs scroll-driven animations on the compositor thread
    (CONFIRMED, WebKit blog + source).
  - **Lead spawned, NAMED:** `fix-cd-strip` (F1, digits as sliding strips, identical by construction; D proposal
    APPROVED by the lead: the strip replaces countdown-faces (a), (b) stays; coordinates with de-countdown);
    `fix-hero-exit-threaded` (F2, hero exit as a scroll-driven animation on st6-rb2, ST-1 Timeline split first: v2 once
    +11 ms at y≈700, cause not named); `fix-cd-roll-ca` (user T-030 #10, 00:10Z: top priority too; stacks on cd-strip,
    prototypes the roll first; judged by sub-pixel motion numbers at 60/120 Hz and a blind swipe before any build).
    glint-ca, sweep-exact (battery/heat only) PARKED. fix-nav-morph sent both F1/F2 owners F3's nodes/2 range (~13307-13370);
    F3 lands first, they stack on it.
  - **T-032 #3 (user, paraphrased):** move agent memory into the project. arch-memory's proposal cfe3693 (inventory,
    one structure: memory/ + CLAUDE.md import, scrubbed drafts of the lead notes; nothing moved) waits on the user's two
    OKs in T-032.
  - **P-068 scorer unassigned:** de-heat's run ended; it asks the lead to name who runs `node research/phone-heat/heat.mjs
    score` (scorer d1ec5c5345f7) after H1+H2 and sends ops the verdict. Ops recommends iphone-runner (it runs the
    sessions), ops second-reads. de-heat's note that 39a846d still waits to land is stale: it landed as 9ff40e6.
  - **Phone:** X1 stage 2 block DONE (de-countdown board 00:2xZ: 8 counted runs valid, both heat checks pass); scoring
    and write-up (README, P-069) pending, not logged as a result yet. iphone-runner took the phone 00:16Z for the P-036
    re-run (signed S-sentinel plan): cooling from 41.1 °C, then 3 exclusive holds (quiet Mac). Host at 00:2xZ: load1 53,
    memory pressure warn (shared group cd-strip + hero-exit-threaded Simulator); the exclusive holds wait for that group.
  - PROGRESS: change line 00:12Z (T-030 result + three top-priority fixes), items cd-strip (F), hero-exit-threaded (I),
    cd-roll-ca (F), upcoming: blind swipe of cd-roll-ca (oldest change dropped, 30 max).

- **00:1xZ mgmt-ops-9 took over** (lead spawn, named so peers can message "mgmt-ops-9"); rebased on main 25d952d
  (mgmt-ops-8's last entry: I-077, X1 D1, X1 restarts, I-076/I-072; not repeated here). **mgmt-ops-8 (agent ID
  ace57ef63584bdfb6) is retired:** it was spawned unnamed, so peers could not reach it by name. Peers message
  **mgmt-ops-9**. Board row `ops` now owned by mgmt-ops-9.
  - **User T-032 (00:01Z, paraphrased):** the user asked why agents show up as "general-purpose" and asked that they
    follow the naming convention. Lead's answer: project agent types load only at session start, so a mid-session
    spawn runs as general-purpose and reads its role file first (same role, other label); three spawns after the
    lead's context compaction went out unnamed (the I-076 toolsmith, done; the ops hub, now replaced by mgmt-ops-9;
    the I-077 toolsmith, kept running because it only talks to the lead), the lead's slip; every spawn is named again.
    **Follow-up from the user in the same thread (00:02Z, paraphrased, open with the lead):** move all agent memory
    into the project where an agent has nowhere to store it; investigate and restructure the project to support it.
  - **I-077 toolsmith is unnamed:** board row `i077` says ts-i077, but `SendMessage` by that name won't resolve; use
    agent ID a46d520fdb1912d3c (or the lead). It is reading the park/open code (00:03Z).
  - Live at 00:03Z: de-countdown holds the phone and a `--no-timing` hold for X1 stage 2 part A (heat check);
    iphone-runner queued #1 for the phone (P-036 re-run, then P-068 H1); load1 2.8.
  - Waiting on: X1 stage 2 result (de-countdown), P-036 (iphone-runner + fix-nav-morph), P-068 H1/H2 (iphone-runner,
    de-heat; afterwards the conditional heat line in the PROGRESS goal becomes firm or is dropped), de-gpu T-030
    report (user's top priority: the lag left in st6-rb2, the toolbar-resize lead).

## mgmt-ops-8 log (10-02 23:5xZ-10-03 00:0xZ, newest first)

- **00:0xZ 91f8411 landed; lead's 9d6fa3c (CLAUDE.md npm test figures after I-076) on main; rebased.**
  - **I-077 OPEN** (tool, non-blocking; ts-i077 spawned): after `iphone.mjs run` parks Safari, `iphone.mjs open` can't
    reach a page (only about:blank views listed). Workaround: `--no-park` within a block, `safari-restart --url` to
    reopen, one park at the block end.
  - **X1 amendment D1 (c89a8b9, de-countdown; mechanics only, lead ACCEPTED, pre-count):** applies the I-077 workaround
    (runs keep the page, a part finding Safari parked reopens it with safari-restart, one park at the block end); run
    log with the C-027 settings window; nothing voided. X1 part A restarted twice before any counted run (about:blank
    after the earlier park; then the open-after-park failure). Ops reads D1 when it lands; no scoring change.
  - I-076 + I-072 RESOLVED (f8aa122). Peers address ops by agent ID or through the lead.
  - Waiting on: X1 stage 2 result, P-036 (after X1), P-068 H1/H2, de-gpu T-030 report.
- **23:5xZ mgmt-ops-8 took over** from mgmt-ops-7 (pinned to another agent's worktree by a peer's message; can't
  commit). Worktree `.claude/worktrees/agent-ace57ef63584bdfb6`, branch `worktree-agent-ace57ef63584bdfb6`, from main
  4647b27 (f8aa122: I-076 + I-072 resolved, npm test ~163 s at --test-concurrency=6). mgmt-ops-7's scratchpad drafts
  (mgmt-ops/mk2358.py, batch texts) were read, not run (the permission check had refused the script); the texts were
  applied by hand.
- **23:5xZ P-036 sentinel amendment 4084772 (rebased a4b1790, worktree-agent-a277ea00c8773c1ea) SIGNED (lead 23:58Z,
  pre-data); ops read OK.** The hero-none G heat check is dropped (failed 3/3 at any temperature and Mac load; G
  cadence clusters fit F-071; OBSERVED, cause unknown) for the standard S sentinel on C (own port, uncounted; bottom
  >= 58, scroll >= 44 fps) after the warm-ups and after C4; a failing sentinel voids since the last pass, cooling §5.3,
  stop rule on the S sentinel. All else unchanged (d72ee13644cc, C V V C C V V C, ms scoring, quiet Mac). UPDATE on the
  P-036 row. Phone order: X1 stage 2 (de-countdown holds the phone; user lift T-024 #8) → P-036 (iphone-runner, own
  quiet hold) → P-068 H1 then H2 (user C-027 "all set" 23:51:53Z: phone settings in place). Open: T-031 #3 wave-2
  timing lift once wave 2 is built; de-gpu (T-030) top priority, incl. the toolbar-resize lead.
  PROGRESS: f3-arm-scope next + P-036 check (new signed plan, runs after the countdown test), upcoming order (X1 stage
  2 → P-036 → heat), user line 23:58Z (oldest change entry dropped, 30 max).
- **23:5xZ docs (lead GO, I-076 f8aa122):** lane doc §2 npm-test line (concurrency 6, ~160-164 s, ~1.75 cores mean,
  bursts up to 6; weight 2 and 300 s unchanged); postmortem 2026-09-30 fix (b) marked superseded (concurrency raised to
  6). CLAUDE.md figures ("~60 CPU-s", "195-220 s wall") are the lead's to update.

## mgmt-ops-7 log (10-02, newest first)

- **23:4xZ (b) df0e21f landed (2259bf1 + df0e21f; scrub OK). P-036 re-run STOPPED under the stop rule:** the hero-none
  heat check failed on a cool phone (37.5 °C) and a quiet Mac (load 4.8), inside iphone-runner's own hold: p95 29-30 ms,
  ~290 of 1760 frames over 20 ms, 3 records. Not heat; OBSERVED, cause unknown. No counted runs. fix-nav-morph
  explains the failure and the lead signs a plan before P-036 is requeued. Phone order now: X1 stage 2 (de-countdown
  has the lease) → P-036 (after the page check + signature) → P-068. Board f3-arm-scope researching, waiting on
  fix-nav-morph. PROGRESS: f3-arm-scope next + P-036 check result, upcoming reordered (X1 stage 2 now), user line
  23:50Z. Log the explanation on the P-036 row when fix-nav-morph sends it.
- **23:4xZ C-026 blind swipe (T-031 #3 a) answered 23:41Z:** original (O, 4606120cf392/27776f3d4138) vs st6-rb2
  (B, 7bf7c4657d21/f523598b2a24), coin page1 = O; the user picked page 2 = **B smoother**: the hero and the nav morph
  quite a bit smoother than the original; still a little laggy (the user's guess: CPU work) and asks de-gpu whether
  GPU work can smooth it further; the lead made that de-gpu's top task, incl. the toolbar-resize lead (innerHeightChanges
  63/94 per swipe). Finger records (single F runs, not a counted block, OBSERVED): moving frames O 944 / B 895, >34 ms
  122 / 81, >50 ms 44 / 13, max 100 / 96 ms; battery 37.4 → 39.1 °C, load1 ~4. PROGRESS best-stack
  felt = the blind result, upcoming swipe entry removed, user line 23:45Z. Landed meanwhile: 3fb0ebb (de-countdown X1
  stage 2 block plan, pre-data). Next on the phone: F3 P-036 re-run, then X1 stage 2, then P-068.
- **23:3xZ (b) fcfc391 landed (main = fcfc391). X1 A1b (P-069, de-countdown) VALID, 23:24Z; user chose X1 stage 2 (T-024 #8).** (iv) EXPLAINED as
  pre-registered: V's 2 stale updates sit at rendered opacity exactly 0 in both arms; the clock is live from the first
  visible update. (i) is with the user, T-024 #7, 3 options: a short countdown-only phone timing test (recommended),
  accept and let the wave-2 timing run cover it, or hold the fix out of wave 2. Board countdown-faces waits on the user.
  de-countdown's 5 commits 754e79e..dd87946 conflict with ops rows in PREDICTIONS.md; it is rebasing, the lead lands the
  new tip; landed as 24b7db4.
  - **User T-024 #8 (23:31Z): option 1, X1 stage 2** (countdown-only timed phone test): a scoped timing lift for that
    test only. The user also asked de-gpu to look at the counting animation for GPU-friendly practices; any variant from
    that is a separate PoC and question, not in the stage-2 block. Phone order: blind swipe C-026 (st6-rb2, loading) →
    F3 P-036 re-run → X1 stage 2 (~20 min + cooling; before P-068 because it is short) → P-068 heat. PROGRESS: stage 2
    in upcoming (item countdown-ca), user line 23:35Z. Board countdown-faces waits on iphone-runner.
- **23:3xZ (batch) 512be87 landed (my 6afd23d, rebased); I-075 RESOLVED (aac5b4a); de-heat pre-flight 39a846d landed as 9ff40e6; P-036 amendment SIGNED; user T-031 #3: blind swipe original vs st6-rb2 now, wave-2 timing lift.**
  - **P-036** (F3 G, fix-nav-morph) amendment SIGNED by the lead 23:25Z: first attempt void (opening heat check failed:
    hero-none f2cef11cb363, moving gaps p50 17 / p95 29 ms, 37.8 °C, after a devicectl Safari restart, load1 18.4);
    C1 V1 V2 VOID. Re-run: one uncounted warm-up of the heat-check page on its port before the opening check (A3),
    quiet Mac (--require-quiet or the runner's own --no-timing hold), cooling §5.3, a failed opening check stops the
    script, a second failure on a cool phone + quiet Mac stops the block for a page check by fix-nav-morph. Scoring
    unchanged. UPDATE on the P-036 row; fix-nav-morph passed condition + stop rule to iphone-runner.
  - **User T-031 #3 (23:27Z):** (a) YES, blind swipe test original vs st6-rb2 now; iphone-runner runs it before the
    P-036 re-run (T-017), P-036 moves ~15 min. (b) YES, one full phone timing run of wave 2 once built and checked:
    a scoped timing lift for the wave-2 build only; timing stays deferred elsewhere. PROGRESS: both in upcoming
    (item best-stack) + one user line. Phone order now: blind swipe st6-rb2 → F3 P-036 re-run → P-068 heat (~2 h)
    → X1 stage 2 only with the user's lift; wave-2 timing run when the build is checked.
  - **I-074 "Try it" live:** console restarted 23:25Z, PR-007 live entry set (option full, patch 221a60aa94cb); user told
    in T-028 #5. **ts-i076 spawned** for I-076 (npm test 293 s vs the 300 s cap) + I-072 (fixture orphans), board row
    i076. Board: i063-sim parked (I-071 not a bug, optional hardening uncommitted); phone-heat waits on iphone-runner.
  - Usage 23:27Z: window 23.5 M units, last 30 min 11.0 M; top main, de-heat, mgmt-ops-7, de-countdown, ts-i074.
- **23:2xZ (batch) c7ecacd..253720a landed 23:03Z; S7 GAIN landed (6571b62); I-074 resolved; F3 P-036 G running; A1 re-read PASS.**
  - Landed: 47b38a0 (**I-074 RESOLVED**: "Try it" in console proposals, original and PoC side by side), **6571b62 S7 /
    P-067 scored Gain** (phone S, 20 s idle at the top, 8/8 valid, heat checks 60.2/58.3 and 60.2/57.7): idle >34 V
    0,0,0,0 vs C 22,19,27,24, separated, not threshold-sensitive; ticks >34 V 0/152 vs C 103/152; guard scroll >50
    median V 0.5 vs C 1 (no regression). PROGRESS hero-carousel: landed/L, P-067 first in best[], check, gate, next;
    user line (the user also has it in T-027 #8).
  - **I-075** (phone heat tooling) in its land test; de-heat's pre-flight line 39a846d lands after it. **I-076 OPEN**:
    npm test wall time 285 s, close to the shared lane's 300 s cap.
  - **F3 P-036 G block started 23:05Z** (iphone-runner). Then P-068 heat (~2 h), then X1 stage 2 only with the user's lift.
  - **X1 amendment A1** (8163838, x1.mjs 5d0c9e4c41db) re-read **PASS** (rendered-opacity product per update, non-numbers
    skipped and counted, zeroAt + chain dumps, cv auxiliary, ticksInWindow >= 3, instrument check op > 0 at rest in
    both arms; outcomes: stale V digit at op > 0 -> (iv) stands; all stale at op 0 -> explained; none -> lead). Gap
    closed by the lead before scoring: **C stale in any update -> no decision, chain dump to the lead.** Notes: op reads
    opacity only (errs toward the code); one session, n = 1.
  - Ops was pinned 23:13Z (re-pinned by its own message to de-countdown); lead fallback if pinned at a check-in: ops
    writes the batch as a diff + message to scratchpad/mgmt-ops/batch-<HHMM>.{diff,msg}, the lead applies it.
- **23:0xZ (batch) P-068 landed in full (e9dcfce, 08b7978, 98da974, 172d61e); X1 stage 1 scored, lead decisions.**
  - **P-068 reads closed (mgmt-ops-7):** ddc74d6 / 98da974 fallback fix PASS (attempt per segment, last attempt scored,
    `findLast` picks the end-of-session re-run, fallback gate TIMEOUT -> incomplete, exclusion over 0-360 s, user's
    80 % limit confirmed T-029 #8); 172d61e attempt marker PASS (heat.mjs d1ec5c5345f7; a gate timeout before any
    attempt-2 segment scores incomplete; 8th synthetic check). heat.check.mjs read, not run by ops (de-heat: 8/8).
    Runs after F3 (~2 h, 2 sessions); iphone-runner takes it from the README on main. **I-075** (tool, non-blocking):
    battery logger, power keys in BATTERY_KEYS, skip of the Mac-side served-hash GETs on non-mirror pages (ts-i075 has
    not replied to de-heat); rule: arm A uses a skip only if it lands before session 1, H2 keeps H1's tooling.
  - **X1 stage 1 readout 754e79e (de-countdown), ops second read:** trigger and outcome applied as pre-registered:
    (i), (iii), (iv) hold -> no phone stage, back to the code. Hits: face layers 80 -> 24 (2/2), total layers 54 (edge),
    pastHero ratios 0.41-0.47, rAF 0.96/1.09, exit-opacity 0 at heroExit. Misses: face memory V/C 1.0, C repaints face
    layers too, S3 0/-10, heroExit Layout 0.96/0.98, S6 V not live at the first update at y 0 (falsifier met as written;
    the 2 stale updates are at --exit-opacity 0).
  - **Lead decisions on X1 (23:0xZ):** (a) the x1.mjs change after the void session 1 (smooth scroll; 9de230198cf8 ->
    9a6f3f9ed143; no window, count or rule changed) ACCEPTED, lead signs; (b) the missing per-window tick count is added
    in the re-run; (c) (iii) ACCEPTED as page-driven, a signed post-data deviation (view-sized Layouts equal in both
    arms; the clock's digit Paints 80 -> 0); **(iv) NOT accepted yet:** one more Simulator session with the rendered
    opacity fixed, under a pre-registered amendment (ops re-reads it): clock visible with a stale digit -> back to the
    code; opacity 0 in every stale update -> explained. If (iv) is explained, only (i) remains and the lead asks the
    user for the stage-2 timing lift.
  - **New user thread T-030: GPU/compositor-only CSS for animations.** de-gpu researches it in research/gpu-props/:
    a Chrome vs WebKit reference table with status words, an audit of every animation on the page, the top 3-5
    candidates. No phone, no timing.
- **22:5xZ 1153c70 landed (main tip). P-068 amendment 56636f8 re-read: NEEDS-WORK (fallback scoring); lead holds 4bf2319+56636f8.**
  - Amendment (de-heat, heat.mjs 341a774801ae): every arm "held" (on the cable, not charging; state read 22:42Z, 80 %);
    `heat.mjs charge-wait` gate before each segment (<= 20 min); one non-held read excludes the segment, re-run last;
    fallback = a whole session "charging"; a verdict needs both sessions in one charge state. X = "landed fixes without
    the countdown fix" (X2 later); ops' H1/H2 line in. apple.com Mac-side GETs accepted, tracked in **I-075**.
  - Held path, X wording, I-075: PASS. **Fallback path NEEDS-WORK:** (1) verdicts() builds a session's charge mode from
    all its segments, so a fallback session (aborted held segments "kept but not used" + charging restart) always reads
    held+charging -> "incomplete"; (2) `get()` takes the first match, i.e. an aborted held segment over the charging
    re-run; (3) no outcome pre-registered for a fallback gate TIMEOUT (likely at an 80 % limit). Asked: an attempt
    number per segment, score only the last attempt, a synthetic one-restart test, a TIMEOUT rule. Minor: say the
    exclusion counts all samples 0-360 s. Ops re-reads only those lines when de-heat sends the sha.
- **22:4xZ (batch) 626783b landed; P-065 closed (531b254); P-068 heat ticket read PASS; phone order set.**
  - Landed: 626783b (ops), f2d71fd (X1 stage 2 needs the user's timing lift; a trigger goes to the lead), 3534e51 (S7
    C vs V pixel check: bottom 0 px; 0.54 % vs baseline common to both arms, phase), **531b254 P-065 Block 1 scored:**
    word alone 0 frames >34/>50 in every run; full page 4-8 >34 in the 'you' windows, separated, twins agree (the rest
    of the page brings them); Block 2 skipped by rules 2/3 before any data; **topic closes, keep the SVG.** PROGRESS
    illusion-proposals next + P-065 check updated.
  - **P-068 second read (mgmt-ops-7) PASS** on 4bf2319 (de-heat; row between P-067 and P-069; heat.mjs 38f81442ccad):
    arms F floor / A apple.com live (iphone-air fallback pre-set) / B baseline / X st6-rb2; H1 F A B X, H2 X B A F;
    6-min segments, slope over 60-360 s corrected to 37.0 °C (k 0.045/min); verdicts need both sessions; charging
    segments excluded (one re-run), user's charging setting recorded; phone settings fixed; VOID rules; no device ids
    in output; nothing of apple.com committed. Ops asked for one line: the X swap (st6-rb2 + countdown-faces) decided
    and logged before H1's first segment. **Lead: charging, X wording and the Mac-side apple.com fetches are still being
    settled with de-heat; the lead lands 4bf2319 with those fixes.**
  - **Phone order (lead):** S7 (P-067) -> F3 P-036 G -> **P-068 heat (2 sessions, ~1 h each)** -> X1 stage 2 only with the
    user's timing lift. The user was told "after S7 and F3" (T-029 #6).
- **22:3xZ (batch, b) 2d2555c landed; P-069 / X1 second read PASS; X1 stage 2 is a timing decision (needs the user's lift).**
  - **P-069 second read (mgmt-ops-7) PASS** on d7449c4 (de-countdown branch, row after P-067): V copy
    out/countdown-faces/snap-x1/poc JS 638b8e03e81c (read-only), x1.mjs 9de230198cf8. Settled pre-data: (a) stage-2
    trigger exact ("above" = both V sessions beyond both C sessions; an S2 hit, or S3 alone, opens stage 2; (iii)
    pastHero/heroExit ratio > 0.8 and (iv) a failed resume check take precedence: back to the code, no phone);
    (b) per-run exclusive-ms sum per 4-tick window, range and median over 4 runs, separated = 4 vs 4 with a >= 4 ms gap,
    no twins on ms sums; (c) stage 1 counts only: hashes match, >= 3 ticks per window, exit-opacity 0 at heroExit, else
    redone once; (d) stage 2 Timeline-OFF S heat checks at open and end, attribution runs after (§5.2).
  - **Lead decision:** X1 stage 2 is NOT attribution: its ms comparison decides whether the 3-face part lands, so it
    is a timing decision and needs the user's lift; the lead asks in the console only if stage 1 triggers it.
    de-countdown adds that line to the ticket and routes any trigger to the lead. **Stage 1 may start now.**
  - Ops rule (lead): wherever ops is resumed, commit only in .claude/worktrees/mgmt-ops-2 with `git -C`.
- **22:3xZ (a) bc90d7a + a553980 landed (ff); no real LAN address left outside site*/ (lead's grep). PROGRESS goal line: heat goal added as CONDITIONAL** (the user framed it "if my assumption is right"): smooth scrolling; and, if P-068 shows Fastwork heats the phone more than apple.com, less work at rest. **When P-068 has a result: make it firm or drop it.**
  - **P-069 = de-countdown, countdown-faces X1 segment card** (pre-data; stage 1 Simulator mechanism, 2 sessions, shared
    lane weight simulator; stage 2 short phone Timeline block only if a stage-1 WebKit cost question stays open, queued
    after S7 and F3). Ops asked for exact wording on: the stage-2 trigger, the P1/P2 statistic, stage-1 validity, the
    stage-2 Timeline-OFF sentinels. Second read when the row sha arrives. Next free P-070.
- **22:2xZ (batch, b) d637310 landed (7945951); S7 on main; I-073 RESOLVED; LAN scrub bc90d7a; new goal: phone heat (T-029 #4); P-068 = de-heat.**
  - Landed: 7945951 (ops batch), 0066608 + 2182886 (S7 / P-067 ticket, pre-data), 5f37fcb (I-073 LAN resolver +
    placeholder `lan-host`, CLAUDE.md edit with the user's OK; I-073 RESOLVED).
  - **LAN scrub (lead's job, ops commit bc90d7a):** the Mac's LAN address replaced by `lan-host` (tools/lib/iphone-url.mjs
    LAN_HOST) in 236 committed `fixes/iphone-wave2/raw/*.json` files (240 occurrences, href/host fields). Deterministic
    byte replacement; every file parses as JSON; reverting the replacement restores the exact bytes. Nothing hashes the
    raw files; the offline readers morph-clock-replay.mjs and unknowns-ux-metric.mjs print identical output before and
    after. The only other LAN-style addresses in tracked files outside site*/ are fake test addresses (tests/, research/architecture,
    README.md example): left as they are. Git history still holds the old bytes (local only, never pushed, rule 2).
  - **User direction (T-029 #4, scrubbed): phone heat and energy (less work at rest, a cooler phone) becomes a goal next
    to smoothness.** de-heat (research/phone-heat/) writes the ticket, Fastwork vs apple.com. **Every fix reports
    "work at rest" from now on.**
  - **P-068 = de-heat**, phone-heat ticket (pre-data, row on its branch; second read by ops before any phone queue).
- **22:2xZ (batch) fwreskip dropped; user lifts the timing hold for st6 + F3 (T-027 #5); P-067 = S7; P-036 G re-read PASS; PR-007 accepted; I-073 landing, I-074 open.**
  - Landed: ed43bd0 (ops), 3e2ebe8 (fwreskip G2 scored: band >50 0 vs 0, >34 0 vs 0, No gain -> (B); P-064 filled),
    cf95b03 + 3c67f93 + 6890fe5 (countdown-faces PoC, round 2, review r2 notes).
  - **fwreskip DROPPED** (G2 no gain; user told T-027 #7). PROGRESS: state dropped, why, P-064 check.
  - **User asked for 2 more high-gain fixes (T-027 #3):** the lead picked hero-carousel st6 and f3-arm-scope; the user
    lifted the timing hold for those two only (T-027 #5, 21:57Z). **Phone queue:** P-065 word-alone Blocks 1-2, then
    st6 (S7, P-067, fix-scroll-engine), then F3 P-036 G (fix-nav-morph), then F3's blind swipe. PROGRESS next fields
    and the upcoming row updated.
  - **P-067 = fix-scroll-engine, phone ticket S7** (f328be1, pre-data): C = st6-rb2 − st6 (JS 0144d2cd032a, CSS
    add63ff17fb7) vs V = st6-rb2 (7bf7c4657d21 / f523598b2a24, = main's st6-rb2 row), S driver `--idle 20`,
    C V V C C V V C, primary idle dt>34/>50 sums; scorer st6score.py 7a8fed7fb4c3. **Second read (mgmt-ops-7) PASS
    with 2 notes, to settle before data:** (1) Gain = V's >34 sum at least 2 below C's is a thin margin against a
    predicted C 32-100 vs V 0-8 summed: add per-run separation (every V run below every C run) as the condition or the
    confidence label, or keep sums knowingly; (2) the guard row's statistic ("median per run") needs exact wording.
    Hashes of the 4 served files and the scorer checked on disk (read-only copies). **Both settled pre-data in
    feeef69** (re-read PASS): Gain = (a) every V run's idle >34 below every C run's AND (b) sum margin >= 2 AND (c) V >50
    sum <= C's, twins per part; new falsifier "any V run reaches the lowest C run"; guard = per-arm median over 4 runs,
    V <= C + 1. Scorer now 772ef9e0e8a4 (checked on disk); A1 per run C 3,2,4 vs NB 0,0,0, separated.
  - **P-036 G re-read PASS** (fix-nav-morph, ticket to iphone-runner 22:0xZ after T-027 #5): UPDATE line added to the
    P-036 row in fixes/PREDICTIONS.md, plus fix-nav-morph's pre-data Simulator check (105c977, OBSERVED): V makes every
    first touchmove cancelable (Z1 C 0/4 vs V 4/4), so the expectation is revised to Z1 V FLAGGED or WORSE possible,
    Z2 overlap, Z3 overlap; the rule is unchanged.
  - **countdown-faces:** round 2 (3c67f93) replaced the replay with an always-running hidden spring, exact by
    construction (0 of 295 frames differ); busy-time "28-40 %" withdrawn, now 764-815 ms lower per 6 s (n=1).
    **PR-007 ACCEPTED, option "full" (22:08:59Z)**; parked until a phone segment card (X1) ticket.
  - **I-073** (LAN resolver + placeholder, CLAUDE.md edit with the user's OK T-026 #5): ts-i073, landing now.
    **I-074 OPEN** (user T-028): a "Try it" panel with live original vs PoC iframes in proposals; ts-i074 building.
  - **Lead list, scrub job (local-only hygiene):** ts-i073 reports 236 committed `fixes/iphone-wave2/raw/*.json` files
    that still hold the Mac's raw LAN address (never pushed, rule 2; Hard rule 12 says it should not be committed).
- **21:4xZ (batch) 5678f13 landed (ts-i063 follow-up); phone back (T-025), ioscap first run C-025 PASSED; Wi-Fi reconnect (T-026) voids G2 runs; countdown-faces NEEDS-WORK; I-072 open.**
  - Landed: cb2a3c8 (ops) and **5678f13** (ts-i063 follow-up, review-i063 ACCEPT; npm test on main 1286/1286 in the
    shared lane 21:21-21:25Z). ts-i063's I-071 check.chrome hardening is still staged in its worktree and waits for
    an awake Mac.
  - **countdown-faces 97317db: review-countdown-faces NEEDS-WORK**, 3 blocking: (a) the resume pixel proof is
    frame-aligned by the harness (lead decision: make the replay exact, anchored to the frame grid); (b) a one-frame
    hop after an instant jump (IO timing); (c) the overlap with topic #1 countdown-idle-raf is not documented.
    de-countdown is fixing them; its T-024 #6 progress went to the user.
  - **Phone reconnected by the user (T-025, 21:28Z).** ioscap built (selftest 29/29, Apple Development signing).
    **First run C-025 PASSED:** opened only "iOS Device", refused 0; the user confirmed the camera light stayed OFF
    (T-025 #4). The recording ran 17 s past the user's Done because the lead messaged agents first; disclosed in
    T-025 #3.
  - **Wi-Fi reconnect (T-026, ~21:40Z):** the Mac's LAN address changed. G2 runs around it are void; iphone-runner
    restarts its servers and re-runs G2 from the warm-ups. CLAUDE.md's example LAN URL (Shared devices block) is
    stale; ops proposed an address-free wording to the lead (a CLAUDE.md edit asks the user).
  - **I-072 OPEN (non-blocking):** the WDA e2e tests left 3 fake-xcodebuild/fake-iproxy orphans for 14 h; the lead
    killed them. ts-i063: sim-warm can't cause it.
  - Phone order: G2 (fwreskip, P-064), then P-065 word-alone Blocks 1-2 (de-illusion-style sent the arm letters).
  - Usage ~8.8 % at 21:37Z (lead's estimate). PROGRESS: fwreskip and illusion-proposals `next` now say the phone is back.
- **19:1xZ (batch) I-071 not-a-bug; ts-i063 follow-up blocked by Mac sleep cycling; de-countdown measuring.**
  - a66dfd4 landed (ops). Nothing else on main since 17:15Z.
  - **I-071 RESOLVED not-a-bug:** the 15:52Z test:chrome failure was an Idle Sleep. test:chrome passed 13/13 on
    a66dfd4 at 17:38Z, run under caffeinate as a measurement.
  - **ts-i063's follow-up commit is blocked:** since ~17:30Z the Mac cycles DarkWake / Maintenance Sleep, so the
    pre-commit npm test can't finish (the T8+ display/wake test failed mid-sleep). It retries when the Mac stays awake.
  - **de-countdown** holds chrome-measure since 19:11Z for its pixel diffs and isolated-page counts.
  - Usage at 19:13Z: about 2.9 % of the window (lead's estimate).
- **16:4xZ I-063 + I-069 landed (0aa2227); test:chrome failed -> I-071 (P1); Mac sleeping since 16:09Z.**
  - Landed 0aa2227: I-063 (859776b, da5de60, e35f0b4; **MEASUREMENT CODE**: lib/lock.mjs gate, verify, bench) and
    I-069; npm test 1282/1282; both RESOLVED. Sim users get warm reuse after a rebase.
  - **test:chrome failed:** check.chrome (no check.json) at 15:52Z; then the Mac's Maintenance Sleep (15:53-16:08Z)
    cancelled the rest. `--short` holds get no caffeinate since I-070. **I-071 opened (P1, ts-i063):** bisect 9135b35
    vs 0aa2227. The lead repaired the stale chrome-measure last-grant record again.
  - **pmset since 16:08Z** (ops read, local log): DarkWake 16:08:33Z, Sleep ('Maintenance Sleep') 16:09:27Z, DarkWake
    16:24:27Z, Sleep ('Sleep Service Back to Sleep') 16:25:11Z, DarkWake 16:40:15Z. No full Wake: the Mac has been
    asleep since 16:09Z apart from ~1-min DarkWakes every ~15 min (dasd SleepService wake requests). It slept again
    16:41-16:56Z: ops stalled mid-check-in (the lead's watchdog fired) and a pmset read hung until the wake. Sleeps the
    lead counts this hour: 15:53-16:08, 16:25-16:40, 16:41-16:56Z.
  - **T-024 #5** (de-countdown census, to the user): 2 countdowns x 80 faces roll in 4 hidden states, ~20-40 % of
    main-thread busy at 6x (n=1, OBSERVED). The PoC is built and being measured.
  - **CLAUDE.md suggestion (later, lead/user-owned; ops does not edit it):** document the warm Simulator
    (`FW_SIM_IDLE_SEC`, default 600 s, keeper shutdown on idle or a queued timing hold) and that keep-awake applies
    only to measurement holds (I-070: timing holds, phone parts, Sim sessions; not `--short`/shared jobs).
- **15:5xZ image-size null write-up landed (909464c); fix-image-size done.** fixes/image-size/README.md + the P-066
  outcome row; findings F-134 and F-135 posted. PROGRESS image-size writeup path added. ts-i063 rebases I-063 onto
  0de8103 and fixes n1-n3; I-069 after. de-countdown (T-024) is researching.
- **15:4xZ P-066 RETRACTED (falsified); image-size dropped; I-070 resolved; I-063 re-review accepted; T-024 ->
  de-countdown.**
  - **Correction to 15:1xZ:** fix-image-size retracted the P-066 HIT. With more sessions the within-session A/A of the
    Sim images-category peak is 6.6, 14.0 and 29.1 MB, so -14.5 / -17.1 MB is inside the noise: **FALSIFIED at the
    metric's resolution** (no detectable saving). PR-006 withdrawn (a draft, never shown to the user). image-size is
    dropped with a null write-up (land request from fix-image-size; PROGRESS gets its writeup path once that lands).
    PROGRESS image-size: state dropped, why + P-066 check read "no detectable memory saving, dropped"; the 15:20Z
    changes[] line rewritten.
  - **I-070 RESOLVED** (0de8103, npm test 1264/1264 on main): keep the Mac awake only during measurements (timing
    holds, phone parts, Sim sessions).
  - **I-063 re-review ACCEPT-WITH-NOTES;** ts-i063 rebases onto I-070 and fixes n1-n3 before landing.
  - **T-024** (the user's countdown request) -> new agent **de-countdown**, topic countdown-faces, board priority #1;
    it uses the user's apple.com off-screen-pause reference.
- **15:1xZ (batch) Flakes landed; user answers C-024 / PR-005 / T-023; P-066 HIT; I-069, I-070.**
  - Landed: ddfbc8c (ops), dc5651c (I-065 bdc2e04 + I-066; npm test 1257/1257; both RESOLVED), 8df1413 (fwreskip
    README, the PR-005 decision).
  - **C-024:** "Keep awake only during measurements" -> I-070 opened, ts-i070 spawned. It found I-026 already
    caffeinates every hold and queue waiter; I-070 narrows that to measurement holds with `caffeinate -i -s` (-i alone is
    useless in DarkWake, IOPMLib.h CONFIRMED).
  - **PR-005: C** (park and re-test; G2 when the phone is back; P-064 stays open). PROGRESS fwreskip next updated.
  - **T-023: "no, thanks"** (no Playwright WebKit experiment).
  - **I-069** (P2): sim safari-restart on a restored data: tab never lands; triaged to ts-i063 after its I-063 round.
  - **P-066 HIT** (Sim peak decoded-image memory): -14.5 / -17.1 MB vs A/A 6.6 MB, n=2, OBSERVED. fix-image-size drafts
    a 3-option proposal for the lead's review. PROGRESS image-size: state testing, stage V, owner fix-image-size, P-066
    check added.
- **14:4xZ (batch) review-i063 verdicts; 5th Mac sleep; Sim runs across a sleep are void.**
  - The Mac idle-slept again 14:21-14:36Z (5 sleeps since 12:27Z, each ~15-16 min). fix-image-size stalled again; the
    lead resumed it. **Rule (lead): any Simulator run that spans a sleep is void.** The lead repaired chrome-measure's
    last-grant record again after that sleep (audited).
  - **review-i063:** 8eab8ba (I-065) and 99b37b3 (I-066) ACCEPT-WITH-NOTES. 3a85564 (I-063) NEEDS-WORK: B1 a failed
    shutdown is counted as done; B2 verify and bench measure beside a booted Simulator when the backstop fails.
    ts-i063 splits the accepted two onto branch `ts-i063/flakes` to land first, then a fix round on I-063 and a re-review.
  - Still unanswered by the user: C-024 (keep the Mac awake), PR-005, T-023 #3.
- **14:1xZ (batch) Mac slept again; fix-image-size resumed; lock record repaired.**
  - The Mac idle-slept again 14:01-14:17Z (C-024, the caffeinate question, is still unanswered).
  - fix-image-size stalled (watchdog); the lead resumed it. Its first Sim session (P-066) started 14:18Z, shared w3 +
    the simulator lock; the P-066 row was committed pre-data (5107519) before it.
  - The lead repaired the stale chrome-measure last-grant record (`lock.mjs repair`, audited).
  - Still unanswered by the user: C-024, PR-005 (fwreskip, rev 1), T-023 #3.
- **13:4xZ (batch) ts-i063 batch in review; I-068 not-a-bug (Mac idle sleep); C-024 caffeinate question.**
  - **ts-i063 batch** on worktree-agent-afa5d960a2fe5d5e8: 3a85564, 8eab8ba, 99b37b3 (not landed). I-063: a functional
    sim session keeps fw-sim warm for FW_SIM_IDLE_SEC (default 600 s); a keeper shuts it down when idle or as soon as a
    timing hold is queued; verify.mjs and bench shut down a leftover warm device before the first run (MEASUREMENT
    CODE: host.simWarm; call out for A/B comparability, test:chrome after landing). I-065: three flakes fixed at the
    root (1 ms clock drift in console/proposal; a serve auto-port collision with the console's 5559). I-066: a sparse
    worktree's leftover site*/ no longer shadows the baseline. **review-i063** (read-only fix-reviewer) is reviewing it.
    After landing, Sim users (fix-scroll-engine, de-illusion-style, fix-image-size) rebase to get warm reuse.
  - **I-068 RESOLVED as not-a-bug:** the Mac idle-slept 12:55-13:11Z (also 12:27-12:43Z and 13:12-13:28Z), so the
    thread wait overran. The lead posted console **C-024** (pending): keep the Mac awake with `caffeinate -i` for 4 h?
  - PR-005 (fwreskip) is still proposed rev 1; T-023 still waits on the user.
- **13:0xZ (batch) P-066 row filed pre-data; bbdf5b8 landed (lead, ff).**
  - fix-image-size committed the P-066 row on worktree-agent-af756241c686d490e (5107519, one line in PREDICTIONS.md,
    checked by ops), before any Sim session; it rides its land request. Gaps closed: ~0 = |delta| within the A/A spread,
    or < 3 MB without an A/A; outcomes: [-25, -3] in both sessions = hit; ~0 = falsified, park; beyond the A/A spread
    but above -3 = miss low, lead decides, no extra session; < -25 = miss high (good, land-eligible, lesson logged);
    > ~0 = drop; sessions disagree = report both, no third without the lead; driver Sim functional, "Simulator MB are
    structure only, never a phone gain". Overlay id c5391b3e6971 (45 files). It sends the measured line after it lands.
  - **Land rule (lead 13:0xZ):** an idle ops can't wake itself for a 30-min window. When a task ends, send the land
    request with the hand-back if the batch is older than 30 min; otherwise the lead picks it up at the next check-in.
- **12:4xZ (batch) P-066 issued to fix-image-size; fbe149f landed.**
  - **P-066** (fix-image-size, card received 12:3xZ): image-size (48 raster files replaced at the same URL, markup
    unchanged) vs baseline; Sim functional sessions (no timing), A B | B A over 2 sessions, + A/A if it fits; metric
    Web Inspector Memory "images" (peak, end), layers, total, WebContent RSS, bytes, pixels. Predicted images delta
    -3 to -25 MB (point ~-5 MB; WebKit's async decode at drawn size for large images, CONFIRMED for WebKit main, may
    already shrink the large-image share). Falsified if ~0 or positive. Decision: in interval -> land as memory
    insurance; ~0 -> park; worse -> drop. Ops asked for three pre-data fixes: a fixed ~0 fallback without an A/A
    (e.g. |delta| < 3 MB), outcomes for a delta between the A/A spread and -3 MB and beyond -25 MB, and "Sim MB =
    structure only" in the row. The row goes on its own branch, pre-data, before its first Sim session (none yet at
    12:44Z: its holds so far were shared weight-1 and one 2 s --no-timing).
- **12:3xZ a3abc07 landed (the lead rebased the batch on ecd4f88); PR-005 posted; T-023 answered.** Corrections to the
  12:2xZ digest:
  - **fwreskip: PR-005 posted** after the lead's review (A ship / B drop, recommended / C park + re-test).
    fix-scroll-engine waits on the user. PROGRESS fwreskip next updated.
  - **ecd4f88 landed:** de-illusion-style's phone-off results plus F-132: on Chrome the 'you' draw is about 15 % of its
    own cost; the rest is the full page's per-frame cost pulled up to 60 fps; Layerize 311 ms per draw (OBSERVED,
    Chrome). PROGRESS illusion-proposals next/whyNot updated (word-alone picked, phone test on hold).
  - **T-023 answered** (T-023 #3, waits on the user): Safari on the Mac can't stand in for timing; it can do WebKit
    mechanism counts. Lead recommends a small experiment with the cached Playwright WebKit build (no user step); the
    alternative, real Safari through safaridriver, needs `sudo safaridriver --enable` from the user once.
  - **de-safari-mac and iphone-runner are done.**
  - Land rule now: a land request only when something changes PROGRESS, or after 30 min.
- **12:1xZ-b (batch) Lead decisions on the parked list; fix-image-size spawned; peer directory refreshed.**
  - **image-size started:** fix-image-size (worktree). Gate: Chrome pixels, Simulator decoded memory (counts only) and
    bytes; no timing. The lead fast-paths D. Expect a PREDICTIONS row request from it (next free P-066).
  - **Stay parked:** anim-transform, re-keep-op, cdwc, f3-arm-scope, blur-cubic, the wi-stack Sim spot check (low value
    without the phone; the Mac lane is busy with the Simulator). r4-v3's Chrome check is parked too (fix-scene-scope
    isn't running); the lead revisits if the Mac lane goes idle.
  - Peer directory rewritten to this session's live agents; the 10-01 rows were removed (in git history).
  - **ts-i063** spawned 12:05Z: owns I-063 (Simulator stays booted between sessions, idle shutdown) and I-065 (both
    flakes), in two separate commits; both incidents now status fixing.
- **12:1xZ (batch) No-phone plan posted (lead, T-022 #4, 11:55Z); phone released 11:56Z; T-023 opened.**
  - **On hold until the phone returns:** P-065 word-alone (2 blocks), G2 (P-064), the ioscap first run (hardening done).
  - **Now (Chrome/Sim only, no timing tests):** de-illusion-style: Sim tlcounts FP vs WA, then the 1 % pixel cause,
    then the Chrome call tree. fix-scroll-engine: Sim step 3 (S vs T on st6-rb), then an A/B/C proposal recommending
    (B) drop fwreskip (the lead reviews the draft first; it rests on older-build phone data). st6-rb2: nothing pending.
  - **iphone-runner parked**; T-009 partial curve (40 reads 11:13-11:55Z, on external power, label cool-t009-c1end):
    38.9 -> 37.1 (+6 min) -> 35.7 (+13) -> 34.6 (+20) -> 33.8 (+26) -> 33.0 (+38) -> 32.9 C (+42); rates 0.24 / 0.16 /
    0.09 / 0.05 C/min per 10-min band; not flat by the rule; floor ~33 C; 10 min cools ~2.4 C from 38.9, so
    `phone-temp --below auto` ends inside its 10-min cap when the last passing sentinel ran at >= 37 C; targets under
    ~34 need >= 25 min, under ~33.3 may never end (OBSERVED). It pre-builds the P-065 scripts.
  - wi-stack done (best-stack done; optional Sim check of the F-129 spots avatars +is-sliding / commission +entering,
    HC vs S6, structure only, if the lead assigns it; a second C1 block parked). fix-scene-scope done (r4-v3's Chrome
    check needs no phone if assigned; its panel-driver phone test parked).
  - **T-023** (user idea: Safari on the Mac as an iPhone stand-in): de-safari-mac (read-only researcher) is on it.
  - **I-065** covers both flakes (the proposal test and console.test.mjs:274), P3.
  - **Parked fixes without the phone** (ops note to the lead): image-size fully doable (Sim/Instruments memory + pixels,
    no phone gate; unowned); anim-transform partly (Chrome pixels + Sim structure; gain needs the phone); re-keep-op,
    cdwc, f3-arm-scope little (mechanisms CONFIRMED or Chrome done; their gates are phone/G/finger); blur-cubic no
    (not applied, GPU cost).
- **12:0xZ (batch) PHONE DISCONNECTED (user T-022, 11:53Z); 661c744 landed; I-064 resolved (11bc722).**
  - The user is disconnecting the iPhone and asked the team to revise its plans. The phone queue (G2, the ioscap first
    run, word-alone Blocks 1-2) is ON HOLD. iphone-runner stops T-009 and releases the phone. The lead asked
    fix-scroll-engine and de-illusion-style for no-phone plans; ops collects a one-screen "revised plan without the
    phone" (message to the lead, not a commit).
  - I-065 (flaky unit tests) gets a second flake: console.test.mjs:274 (I-059 B attempts), a millisecond-boundary endedAt.
- **11:5xZ st6-rb2 landed (cff1a03, 11:49:57Z); PROGRESS build updated; I-065 open.**
  - PROGRESS build: name "st6-rb2: the wave-1 base plus seven fixes", since 11:49:57Z, same 8 ids (style-recalc now in
    its final RBi40pti form); summary caveat "the same fixes as before with the final version of the style fix; checked
    by mechanism and pixels, not timed on the phone as a whole". The build has no writeup field (schema): fixes/st6-rb2/
    README.md is cited in style-recalc's details. style-recalc got its first best[]: the T-011 switch layout 17-23 ms ->
    gone (OBSERVED, W, P-061, attribution only). changes[] line added.
  - I-064 landed in two rounds (8ec1c6d, 11bc722) with the user's YES (T-019) to deleting the old recorder.
  - P-065 (word-alone, two blocks) landed as 60e6c85.
  - **I-065 open** (not blocking): a flaky proposal unit test (ops saw test:unit 624/1 once at 11:5xZ, 625/0 on rerun).
  - G2 is next on the phone after T-009.
- **11:4xZ-b (batch) I-064 round 1 landed; st6-rb2 checks ran; P-065 to word-alone; phone order.**
  - **I-064 round 1 landed as 8ec1c6d** (ioscap F2-F5). The user said YES in T-019 to deleting the old recorder. The
    lead's npm test on main 8ec1c6d ran; round 2 (ts-i064: no frame viewing, wrappers unwrapped, asks on the wrapper
    scripts) is on main as 11bc722. I-064 stays open (the lead resolves) and blocks the ioscap first run until then.
  - **st6-rb2:** its Sim and pixel checks ran at 11:38Z (result not yet reported to ops); PROGRESS build unchanged
    until it lands.
  - **P-065** = de-illusion-style, word-alone (PR-004). The lead approved the ticket split into two blocks: Block 1
    isolation (FP vs WA-C, 8 runs); Block 2 the arms alone (WA-C / WA-F2 / WA-B, 9 runs).
  - **Phone order after T-009:** G2 (P-064), then the ioscap user step (once I-064 round 2 lands), then word-alone
    Block 1, then Block 2.
- **11:4xZ (batch) scene-scope and fwreskip landed; st6-rb2 restack planned.**
  - **scene-scope landed as 1ce70e8 (11:2xZ):** the review wording fixes plus finding F-130. PROGRESS: style-recalc is
    now state landed, stage L; P-061 added to its checks (T-011: the switch RS's view-rooted nested Layout, 17-23 ms per
    crossing in C, gone in all 4 V runs; nothing moved into the window after it; OBSERVED, W driver). No best[] entry yet:
    the build still carries RB, and RBi40pti joins it only with st6-rb2.
  - **fwreskip landed as 491f2ce** (with d00815a, a7526e0): G2 (P-064) is pre-registered on main with the amended gain
    line; P-060 measured (rest arm hit; no-pause arm misses "after the mark >= 3/4", >50 3/4 but >54 0/4,
    threshold-sensitive; ratio n/a; lesson: the timer fires at the start of the rest). iphone-runner runs G2 after T-009.
    PITFALL for PREDICTIONS.md conflicts (fix-scroll-engine): suffixed ids (P-056a/b/c) are easy to drop on rebase; check
    them after any conflict.
  - **st6-rb2 restack** (lead decision): HC with RB replaced by RBi40pti (40 #platform selectors and one gate line),
    nothing else different. Accepted by mechanism: fix.mjs check, pixels against HC with an A/A, and a Sim W check of
    both mechanisms, before G2's counted runs or after G2. When it lands, PROGRESS build becomes st6-rb2 with the caveat
    "accepted by mechanism and pixels, not timed on the phone as a stack" (and style-recalc gets its T-011 best[] entry).
    Do not change PROGRESS build before that land.
  - **Batch rule (lead):** one land request when st6-rb2 lands (it changes PROGRESS) or at about 12:00Z, whichever first.
- **11:5xZ G2 second read signed (lead 11:25Z, one amendment); 45a104b landed.** Correction to 11:4xZ: G2 no longer
  waits on the lead. Amendment: Gain needs V's >50 count in band + hold at least 2 lower than C's over the 4 runs per
  arm, with (ii) (V's >34 <= C's) still holding. Verdicts are checked in the order Gain -> Mixed -> No gain; a
  threshold-sensitive result counts as not Gain. fix-scroll-engine commits the amended ticket, then sends it to
  iphone-runner. **Phone order:** T-009 (running), then G2 (P2-1+P5), unless I-064 lands first (then the ioscap
  first-run console step goes before G2), then word-alone (de-illusion-style).
- **11:4xZ I-042 phone check done from G1b data; P-064 issued (G2); P-060 measured.**
  - **I-042 phone check** (iphone-runner, from G1b's data, no block of its own): G strokes play faithfully within
    ±10 % on a quiet Mac. 23 G runs (16 counted, 4 warm-ups, 3 voided); the 20 kept runs have 160 strokes, all 8/8
    delivered, +1.5 to +10.5 % against the planned contact time (median +4.7 %); every stroke ran long, none short or
    dropped; only one over +10 % (an uncounted warm-up, +10.5 %). The 3 voided runs (+12.5, +13.0 % at Mac load1 26-62;
    +11.0 % at load1 12.5 falling to ~7) were re-run valid at load1 6-7. The overshoot grows with Mac load (OBSERVED in
    our setup, cause unknown; likely Mac-side driver timing, not checked). Notes stay in iphone-runner's worktree
    (out/iphone-runner/i042-phone-check.md, not committed).
  - **P-064** = fix-scroll-engine, phone ticket G2 (P2-1): V = S6P2b (st6-rb + fwreskip P2b, JS ad7f029e43c6) vs C = S6
    (JS 59b23b3f57fd), CSS d22542d0b5f8 both; W driver 2600 -> 3400, hold 3 s; counts >50 / >34 (+ twins) in the band
    y [2950, 3250] and the 3 s hold. Predicted no gain (C band max <= 38 ms in >= 3/4; band >50 0-1 per arm; V's hold
    >= 1 frame >34 in >= 3/4). Falsified if C's band has >= 2 frames >50 over 4 runs that V lacks. Decision: (A) only
    if V has fewer >50 in band + hold AND V's >34 <= C's; otherwise (B) drop fwreskip (mixed: (B) with the trade shown
    to the user). Ticket draft: fwreskip README "Phone ticket G2" at 1e845ee, awaiting the lead's second read; not queued.
    The row lives on fix-scroll-engine's branch until it lands (like P-057, P-060).
  - **P-060 measured** (G1b, fwreskip README "G1b result"): rest arm all hit (flip before the mark 4/4; no long fling
    frame; idle un-skip frame >34 4/4, >50 2/4 (55, 54) vs B 0/4; falsifier (c) not triggered). No-pause arm: the
    un-skip still fired in idle 4/4 (the WDA fling starts ~800 ms after its mark, so "inside the fling" can't be tested
    with G); frames 54/44/51/54 vs B 15-18: >50 3/4, >54 0/4, threshold-sensitive. Lesson: the pair forms during the
    last stroke, so the timer fires at the start of the rest (the ticket's "between strokes" guess was wrong).
  - iphone-runner also confirms: G1b no-pause block done 10:33Z (data to fix-scroll-engine); T-011 done 10:58Z; C1
    done 11:12Z; T-009 cooling curve running.
- **11:3xZ C1 confirmed (81dbc9b); shell-hold-c in the best build; I-064 open.**
  - **C1** (wi-stack, scored on iphone-runner's block, 8/8 runs valid): spot (c) frame S6 37 -> HC 17 ms (median, 4 runs each,
    no overlap); the reveal and scroll guards hold; P-063 hit. Caveat: the page-wide scroll >34 count is unchanged (8 vs
    7.5). It removes one slow frame at spot (c) and does not lower the page-wide count. PROGRESS: new item shell-hold-c
    (inBuild, writeup fixes/shell-hold-c/README.md, that caveat) and added to build.fixes.
  - **I-064 open** (blocks the ioscap first run): review-ioscap rated the recorder SAFE WITH FIXES; ts-i064 closes
    F2-F5 (an old unhardened recorder still tracked in research/; Photo Booth and FaceTime not denied; `open -a ioscap`
    skips the lease and the first-run ask; a rebuild keeps the Camera grant).
  - **Phone order now:** P2-1+P5 (fix-scroll-engine), then word-alone (de-illusion-style); the ioscap first-run console
    step slots in when I-064 lands.
- **11:2xZ Corrections from the lead (the 11:1xZ digest was behind); caa3c68 landed.**
  - I-060 and I-061 were resolved at 10:44Z. I-062 is resolved (4df8bb2, npm test 1149/1149 on main); its first run is
    still gated on review-ioscap and the user's console step. I-063 stays open.
  - **PR-004 ACCEPTED** by the user at 11:15:14Z: rev 3, option word-alone. de-illusion-style is building it.
  - **C1 done** at 11:12Z: 8 valid runs; quick read HC fn 16-17 vs S6 36-40 (OBSERVED, not scored). wi-stack is scoring it.
  - **I-042 phone check dropped**: G1b's stroke-gate data covers it; iphone-runner sends ops the write-up.
  - **T-011 review: LAND WITH FIXES** (re-scored exactly); fix-scene-scope is doing the wording fixes.
  - **Phone order after T-009:** user console steps (the ioscap first run), then P2-1+P5 (fix-scroll-engine), then
    word-alone (de-illusion-style).
- **11:1xZ T-011 scored; C1 running; I-062 landed; I-063 open; PR-004 rev 3.** Landed since 10:49Z: ca408c4 + ead9159
  (PROGRESS /build: st6-rb with 7 items, pin-clamp item, scene-scope retitle), 39786a2/71934c1/9b1e574/4df8bb2 (I-062
  ioscap), the illusion-accent-frames series f91dd4e..36a28b1 (de-illusion-style).
  - **T-011 scored** (fix-scene-scope): P-061 a/b/d PASS; in review.
  - **C1 running** (iphone-runner, wi-stack ticket, signed 10:4xZ). Then the **P5 Sim hold** after C1, then T-009 (cooling
    curve; the phone-queue row showed a T-009 battery read at 11:13Z), I-042.
  - **I-062 landed** (tools/ioscap.mjs, a hardened recorder that can only open the iOS screen device; enforcement denies
    other recording routes and asks on its first run). The first run is gated on review-ioscap and a console step for
    the user. NO CAMERA holds.
  - **I-063 open** (tool): sim.mjs session always cold-boots the Simulator (load1 60-70 for ~1 min), and a shared hold
    (<= 300 s) cannot keep a device booted across holds.
  - **PR-004 rev 3 posted** (de-illusion-style, 36a28b1): "did we measure the word alone? (no), and how to do it",
    4 options; waits on the user.
- **10:4xZ C1 signed; G1b voids; 7d14ed0 landed 10:16Z.**
  - **Phone order (lead 10:4xZ):** G1b (running) -> T-011 -> **C1** -> T-009 -> I-042.
  - **C1** (wi-stack, shell-hold-c "A + shrink hold", 366e693, P-063 pre-data): S6 = st6-rb (snap-a/st6rb, JS
    59b23b3f57fd / CSS d22542d0b5f8) vs HC (snap-c/hc, 59b23b3f57fd / a3b34c3a3920); hashes re-checked by
    mgmt-ops-7, both copies read-only; S driver, 8 runs S6 HC HC S6 S6 HC HC S6, ~25 min + cooling. **Signed by the
    lead 10:4xZ** with 4 amendments (wi-stack writes them into the README and P-063): ±4 ms twins and near-band
    flags; every S6 run is a sentinel, phone-temp --below auto, at most 2 blocks; a 1440 DOM geometry probe before
    the land request (not before the phone run); a no-effect result reads "THREADED_ANIMATIONS UNRESOLVED", not refuted.
  - **G1b stroke-gate voids:** no-pause arm 6 of 8 valid; runs 6P2b and 8B voided by the ±10 % stroke-fidelity gate
    (+12.5 / +13.0 % off plan) and re-run by iphone-runner (the gate works as registered).
  - **PITFALL (mgmt-ops, 10:3xZ):** when a peer's SendMessage resumes mgmt-ops, mgmt-ops runs pinned to that peer's
    worktree and the harness refuses git in `.claude/worktrees/mgmt-ops-2`. Peers send ops requests anyway, and expect
    ops to batch the docs commits until the lead resumes it. From a lead resume, use `git -C <abs worktree>`, never cd.
    **Lead rule (10-02 22:4xZ, after 626783b):** when pinned, do the read-only work (second reads), reply to the peer and
    queue the commit; the lead resumes ops from main at check-ins to commit. Never work around the guard.
- **10:1xZ A1 done, I-059 resolved, G1b running.** Main: a2c15e7 (ops docs), 62b4053 (I-059 B "Start over";
  I-059 RESOLVED; console restarted 10:00Z), wi-stack series 94b8010..e7d2de2.
  - **PR-003 A CONFIRMED on the phone** (A1, wi-stack): #people frame 2 median NB 44 vs C 42 vs V 74 ms, idle gain kept,
    P-062 HIT. Landed as st6-rb (df04a4a build with the scene-arm will-change selector, e7d2de2 results). B: WebKit source
    refutes the filter-extent hypothesis (f4a7600); B pixel gate next (Sim only).
  - **G1b is running on the phone now** (iphone-runner; fix-scroll-engine be4c331). Then T-011, T-009, I-042.
  - **PR-004** (PR-001 follow-up, de-illusion-style): rev 2 = phone test report + 4 next-step options; WAITING ON THE USER.
  - **T-019 #18**: the user asked for a hardened Mac-side iPhone screen recorder. de-iphone-screenrec researches (docs
    only); a toolsmith follows; the first run needs the user's OK. NO CAMERA still holds until then.
  - **I-060** (ts-i060, open): progress page "Right now" shows only who holds a device, not the job or the fix (user
    T-020). ts-i060's full npm test ran in the shared lane at 10:12Z.
- **09:4xZ (later) C-021/C-023 DEFERRED by the user** (T-019 #9, 09:43:56Z: make the test easier first).
  - iphone-runner stops the retry and returns to the queue: block B attribution -> A1 -> G1b -> T-011 -> T-009 -> I-042.
    It writes a grooming note for the next try: the user only starts and stops the recording; the phone plays everything.
  - PR-001 rev 3 ("keep" recommended) no longer waits on the recording: de-illusion-style drafts it now, the lead reviews.
  - I-059 still lands first (before any new recording step).
- **09:4xZ I-059 open; C-023 retry.** c393993 landed.
  - I-059 (tool, open, ts-i059): the console let the user tap Done on a part the runner ends itself (C-021 part 2
    marked done 5 s after start). The user accepted "retry entire process" for retriable steps (T-019 #7): ts-i059
    builds (A) runner-ended parts + a minimal (B) "Start over".
  - C-023 (retry of C-021, the user's own screen recording) hit the same Done bug at part 2 (09:42:24Z);
    iphone-runner drives part 2 itself. Phone lease iphone-runner; then block B attribution, A1, G1b, T-011, T-009, I-042.
  - fix-scroll-engine 918af20 + 1f39750: P2b inside the same-build B-A spread in Sim time spent; P2-1 re-run planned
    on RB + st6-rb once PR-003 A lands.
- **09:3xZ (later) PR-001 block B DONE; route (b) approved.** dc7ceb8 landed.
  - Block B (C V B): 9/9 valid, sentinels passed. P-058 overall: no arm beats the SVG on the phone (rule 4). F1/F3
    freeze mid-stroke; V reaches the end of only 67 % of draws (its own start-detection bug); F2 and B are eligible
    but not better. PR-001 rev 3 adds a "keep" option and recommends it (de-illusion-style drafts, the lead reviews).
  - The user APPROVED visual route (b) (T-018 #11): C-021, the user's own iPhone screen recording, 4 parts, ACTIVE.
    No Mac camera; NO CAMERA still holds.
  - Phone order now: C-021 (user step, first) -> block B attribution -> A1 (PR-003 A) -> G1b -> T-011 -> T-009 -> I-042.
  - PR-003 change wait dropped: the lead's thread wait wakes on every proposal decision event (I-045).
  - PROGRESS illusion-proposals: next = second round done, a final "keep" proposal after the recording check.
- **09:3xZ I-056 LANDED on main d2d77ad** (lead's npm test 1037/1037 in the main checkout) and RESOLVED: phone runs no
  longer wait for shared groups; `--require-quiet` opts in to waiting. Open incidents: none. The lead confirmed A1's
  slot to iphone-runner (after PR-001 block B).
  - **Visual route (b): WAITING ON THE USER.** The lead posted the plan in T-018 #10 (an ask, ~8 min of the user's time,
    right after block B if the user agrees). Nothing is recorded until the user agrees; NO CAMERA holds.
- **09:2xZ second reads, both PASS.**
  - **G1b** (fix-scroll-engine be4c331 on worktree-agent-a1722cf5058e25591): stroke-fidelity gate ±10 % in run
    validity, ~15 min per block (~40 min for 2 with phone-temp cooling), P-060 "Amended pre-data 10-02 09:16Z" naming P2b
    JS b4ff6ec56cc2 / snap-g1b2. Hashes re-checked: snap-g1b2/P2b JS b4ff6ec56cc2, B JS dbd5fdb4f1fb.
  - **A1** (wi-stack 1ad3a61 on worktree-agent-a93135040e12a061d, rebased on cc2a029): PR-003 A ticket, C = RB
    (snap-s5/best dbd5fdb4f1fb / 0d7dfc79e703), V = stack5 (59b23b3f57fd / 6e09b2c708fa), NB = RB+st6 (snap-loo/noblur
    59b23b3f57fd / e9603231b413). All hashes match. S driver, Timeline off, warm-up per port, open/end sentinels plus every
    counted C run, Latin square C V NB · V NB C · NB C V (9 runs), ~30 min, decision per row, P-062 pre-data. Note for
    the runner: log load1 and battery temperature per run (A4).
  - B research plan (B1 will-change: filter, B2 no overlap-compositing of the 4 hidden profile shells) is in the
    same commit: Sim + pixel only until A1 is done.
- **09:1xZ takeover.** mgmt-ops-7 took the `ops` row; rebased on main cc2a029 (mgmt-ops-6's final commit, LANDED).
  - **PR-003 DECIDED 09:12:55Z**: accepted, option A (drop-blur: RB + st6, no blur-cubic). User note, paraphrased: wants
    to know B's (prepromote) performance too; apply A first, research B in parallel at lower priority.
    Lead plan: wi-stack writes A's phone ticket (C = today's best / stack5 / RB+st6, P-062 pre-data), mgmt-ops
    second-reads it; wi-stack also owns B research (Sim + pixel identity only, no phone until A is done);
    fix-scroll-engine adds st6's selector to RB's will-change list (coupling). PROGRESS best-stack updated.
    Re-arm on a changed decision: `console.mjs proposal wait PR-003 --until changed --since 2026-10-02T09:12:55.131Z`.
  - **Phone order (lead 09:1xZ, replaces mgmt-ops-6's):** (1) PR-001 block B (iphone-runner, running, no recordings);
    (2) PR-003 A block (wi-stack); (3) G1b (fix-scroll-engine); (4) T-011; (5) T-009 curve; (6) I-042 check.
    Posted user steps still jump the queue (T-017).
  - **G1b second read**: d57b9a1 PASS pending one commit with (i) stroke-fidelity gate in run validity (G run void if
    any stroke > ±10 % off plan), (ii) minutes per block, (iii) dated pre-data P-060 amendment naming P2b JS
    b4ff6ec56cc2 / snap-g1b2. No commit after d57b9a1 yet on worktree-agent-a1722cf5058e25591 (asked 09:1xZ).
  - **I-056 lands now** (lead resolves): phone runs no longer wait for shared groups; `--require-quiet` opts in.
  - **Visual route**: the user picked route (b) in T-018 #8 (the user's OWN iPhone Screen Recording, started by the
    user). de-illusion-style + iphone-runner write the plan for the lead; nothing is recorded until the lead has asked
    the user and the user agrees. NO CAMERA stays the top rule.

## START HERE, mgmt-ops-7 (written by mgmt-ops-6, 10-02 09:0xZ; the dated log below has the detail)

mgmt-ops-6 FINAL (09:1xZ, ~60 % context): main carries every ops commit up to this one. G1b second read (d57b9a1)
PASS with one pre-data fix asked: add the lead's stroke-fidelity gate (G run void if any stroke > ±10 % off plan) to its
run validity; cosmetic: minutes per block, a dated P-060 amendment naming P2b b4ff6ec56cc2 / snap-g1b2. Check the
owner's next commit for these before G1b takes the phone. Then any rerun of T-011 or P-058.
Board rows `ops`, `phone-queue`, `fwreskip`, `best-stack` and `phone-stack-test` are current as of 09:0xZ.

- **Top rules, newest first.**
  - NO CAMERA (T-018): no QuickTime movie recording, no camera capture API, no camera device listing. Recordings are
    suspended until the user approves a route. The session log is kept as evidence (user T-018 #5, 09:02Z; not deleted).
  - User steps first, with an ack `--message` at every change (T-017).
  - Every wait sets its board row first (T-016, CLAUDE.md feb5936).
  - Phone cooling = `wait.mjs phone-temp --below auto`.
  - Quiet window for S/W/M = preferred, not blocking.
  - Timing stays deferred, except PR-001 (phone) and the finished stack test.
- **Phone order** (lead 09:1xZ). Posted user steps jump the queue. Then:
  (1) PR-001 block B (iphone-runner; no recordings; not gated);
  (2) G1b (fix-scroll-engine d57b9a1, snap-g1b2 P2b JS b4ff6ec56cc2; second read PASS pending the stroke-fidelity line);
  (3) PR-003 option A's block, if the user picks A;
  (4) T-011 (fix-scene-scope RBi40pti, 06d2290; it has ended, the lead resumes it);
  (5) T-009 curve;
  (6) I-042 check.
  The visual look at the PR-001 winner and any capture route WAIT ON THE USER. The lead posts these in T-018 together
  with the ioscap account (iphone-runner's old AVFoundation capture binary from 10-01; sent in T-018 #7) and the options:
  (a) USB screenshots, (b) the user's own phone screen recording, (c) drop.
- **Top investigation (T-017).** stack5's remaining lag.
  - wi-stack built a files-only map: #people frame 2 is the only V regression, and the Sim leave-one-out puts it on
    blur-cubic (OBSERVED).
  - wi-stack posts ONE proposal with options A/B/C. Zero spawns for it; parked stays parked.
- **Live agents (this session).** main (lead), iphone-runner, wi-stack, de-illusion-style, fix-scroll-engine,
  ts-i056 (I-056 a-d), review-fwreskip-3, and the I-058 toolsmith (I-058 is resolved).
  - Ended: fix-scene-scope (done until T-011), ts-i054, ts-i053 (once I-053/055/057 resolved).
  - Directory rows below that are older than 10-02 06:00Z are unverified.
- **Open incidents.** I-056 only (ts-i056). I-053/054/055/057/058 are resolved.
- **P-ids.** (P-059 wi-stack, P-060 fix-scroll-engine G1b, P-061 fix-scene-scope T-011,
  P-062 wi-stack A1, P-063 wi-stack C1, P-064 fix-scroll-engine G2, P-065 de-illusion-style word-alone, P-066 fix-image-size image-size, P-067 fix-scroll-engine S7 st6, P-068 de-heat phone heat, P-069 de-countdown X1): next free P-070.
- **Mechanics.**
  - PROGRESS.json: targeted Python replacement; the old JSON string must match exactly once. next/gate ≤ 300 chars,
    details ≤ 600. Bump `updatedAt` to the real `date -u`, never ahead.
  - LAND request: branch@sha, rebased, clean, test:unit count, progress --check, LAN grep 0.
  - Batching (lead 10-02 11:5xZ): batch handover-only entries; at most one land request per ~30 min. Send one at
    once only when it changes PROGRESS.json or something the user sees. Idle ops can't wake for a window (lead
    13:0xZ): at the end of a task, send the land request with the hand-back if the batch is older than 30 min.
  - Second reads: hashes (shasum the snapshot files), one control, driver, warm-up RUN per port, sentinel (every
    control in a non-Timeline block), minutes, P-row committed pre-data.

## USER DIRECTION 19:27Z (standing; overrides any older plan below)

1. Performance TIMING is DEFERRED: no new timing A/Bs (`fix.mjs ab` gain runs, bench timing), no phone gain/fps blocks.
   Parked: P-033, P-038, P12, P10, P5, P9; G blocks P-032/P-036 wait too (I-042 tool work continues).
2. The work: (a) Chrome call tree (which functions/work, how often), style/layout counts, invalidation and layout roots,
   layer counts; (b) Safari layout/rendering: Timeline records (style, layout, paint, composite), roots, nested layouts;
   no fps verdicts. Simulator wherever its records match the phone (de-counts-sim decides); phone = attribution only.
3. Chrome -> 3 agents in parallel via ts-lock-share's shared lane (lead lands it first); until then exclusive lock,
   holds short and counts-only (short lane where possible).
4. Phone queue: scene-scope attribution block (nested Layout count at the platform flip) -> st5 split attribution
   (fix-scroll-engine: C, st5, st5-noanim, st5-waapi, V1). Tickets: attribution only, second read as before.
6. Cooling (lead 19:56Z): attribution-only phone blocks skip the fixed 10-min cooling; the Timeline-OFF heat sentinel
   (start + end) decides, a failing one = cooling + redo. Cooling = `node tools/wait.mjs phone-temp --below auto` (<=10 min,
   protocol §5.3, user T-009), never a fixed `wait.mjs time` (lead 08:2xZ, user T-016; fixes/LEAD.md "Timing deferred").
7. USER (console T-001, 20:24Z): "slow frames on the phone are dominated by layout" tasks are HIGHEST priority. Board
   (lead): style-recalc #1, fwreskip #1, r4-v3 #2, hero-carousel #2 (slide-start whole-page layout), count-checks #3
   (Sim-vs-phone verdict gates moving the root hunt off the phone). Phone/Sim order: LAYOUT ROOT HUNT tickets
   (fix-scene-scope H1-H4, fwReskip, morph start) first after the running st5 split; any other phone ticket that would
   delay them is deferred. Timing stays deferred; lock-share stays the top Chrome tooling item.
8. Sim structure holds (lead 20:3xZ, until the user lifts the timing deferral): Simulator attribution holds that read
   records for STRUCTURE only (record kinds, nested-layout counts, roots, initiators; no ms claims) take a `--no-timing`
   normal hold: `lock.mjs run chrome-measure --owner <x> --no-timing --max-seconds 420 -- node tools/sim.mjs session …`
   (lib/sim.mjs holdGate accepts it). Why: the user's own apps closed the host gate (load1 ~15-17), up to 600 s idle per
   gated hold. Sim ms from such holds is host-uncontrolled. The Sim refuses the short lane.
9. Root-hunt owners (lead 20:3xZ): F-108 page-wide background dirtier, then the morph start -> fix-scroll-engine; the
   #platform switch + fwReskip root hunt and RB -> fix-scene-scope. Short-lane order: ts-lock-share, ts-proposals, rest.
5. Every agent keeps its status-board row matching. Broadcast to all 13 live agents 19:3xZ (mgmt-ops-6).
   Priority order (lead 19:1xZ): style recalc > illusion proposals > phone-tool fixes > st5 > tooling.

## How mgmt-ops-3 worked (keep doing this)

- Wait in the foreground with `sh <scratchpad>/mgmt-ops/tick.sh 300` (returns on a lock-holder or incident change; Bash
  timeout 500000). No background monitors. Never end a turn with background work running.
- Messages to agents resume them if they ended; that is fine for GOs. Iphone requests: message `iphone-runner` directly
  for scripted checks (lead OK 07:25Z); finger tests only via the lead. The lead lands, resolves, reorders, spawns.
- Every docs commit: rebase on main, `npm run test:unit`, commit, then a "LAND BATCH" message with the sha(s).
- NO CAMERA, TOP RULE (user T-018, 08:49Z; user privacy): no agent opens QuickTime movie recording, any camera
  capture API, or a camera device listing. Phone RECORDINGS ARE SUSPENDED until the user approves a route that never
  touches the Mac camera. G1b uses in-page flash detection only. Tell every agent that touches the phone.
- USER STEPS FIRST (user T-017, 08:29Z): a posted console step the user waits on (swipe pair, finger test) takes the
  phone next, ahead of any measurement block; never gated on cooling or a Mac-quiet hold; its recordings are evidence
  only (log the load). Post a step only when the phone is free for it. Every agent running a step acks each change with
  a plain one-line `--message` (doing what, ETA) so the user can follow it on the step page (T-017 08:31Z).
- WAITS (lead 08:2xZ, user T-016): every wait sets its board row first (`status.mjs set <id> --state waiting
  --waiting-on …`). No fixed `wait.mjs time` without a reason on the board; phone cooling is `wait.mjs phone-temp`. I-058
  (tool, open): waits will post their reason to the board themselves.
- Quote goal progress as frames > 50 / > 34 ms (Chrome, within ONE hold) and iPhone numbers; > 34 ms varies ±2 across
  holds. Success is judged on the iPhone under a finger first (user decision 08:04Z).
- **Standing lead policy (lead-retrospective-24h.md §5, c220e82; lead 19:1xZ):** (1) two-speed loop: inner =
  deterministic counts (Chrome headless in parallel + WebKit counts from the Simulator, validated against existing phone
  pairs); outer = one phone block only for candidates that pass the counts; finger tests only for stacked builds
  (de-counts-chrome + de-counts-sim, then a toolsmith). (2) Size the team to the devices: at most 2 timing-measuring
  agents at once; tool builds and full `npm test` batched into windows outside phone blocks; load1 on the status board.
  (3) Root-cause hardware faults at the source after the first repeat; ask the user about the setup first (other
  inspectors, other apps on the phone, Low Power Mode). (4) Fix budget >= 50 % of agent-hours on fix topics, split shown
  on the status board; state the cost of every side request to the user before starting it. (5) Design spike on the
  page's engine (C6): one researcher, counts only. (6) Shrink CLAUDE.md to hard rules + pointers. (7) Honest goal check:
  a full-scroll phone block of B vs baseline (>50 / >34, fps) once scene-scope lands, recorded in the retrospective's
  successor §1. Parked by this policy (19:1xZ): anim-transform (ranks 5-6), image-size (7) until scene-scope and R4+V3
  have a phone result.
- **Status board (ts-status-board, pending land; seed research/architecture/status-board-seed.json, the lead applies
  it):** mgmt-ops owns item `ops` (state coordinating); refresh rows whose owner ended (`node tools/status.mjs set <id>
  --by mgmt-ops-N --state … --note …`), nudge owners of rows flagged "not updated" (2 h, no queue place or console step),
  seed new workstreams (`set <id> --kind … --title … --state …`); `status.mjs list` replaces "Who waits on what".
- **Phone vs Simulator (user standing rule, lead 17:5xZ):** a job that needs an iPhone but no performance number runs
  on the iOS Simulator (tool mechanism checks, WDA/gesture compile tests, inspector-connection bugs, safari-restart,
  page-state/DOM checks, script dry runs), in a normal chrome-measure hold (sim.mjs, <= ~7 min). The phone is only for
  timing and perception: S/W/M/G blocks, sentinels, Timeline attribution, F finger tests, user sittings. F-084 holds:
  Simulator timing is never a verdict. Route new tickets by this before they reach the phone queue.

## Digest log (newest first, 5 lines each)

- **22:1xZ IPHONE UNPLUGGED by the user (T-011).** PHONE BACKLOG, run in this order when it is plugged back in:
  (a) the rest of the cooldown curve (ts-phone-cool, `wait.mjs phone-temp`); (b) scene-scope's ST ticket; (c) the fwreskip
  candidate; (d) ts-gesture's G run with the compiler v2 hashes (finger-protocol-v1 ee84ebd4e916, slow-drag-v1 5bd9f52ed38e; I-042 fix f16c65b, npm test 960/960; sim.mjs gesture is timed = normal hold); (e) the morph start (parked); (f) PR-001 WebKit frame capture on the phone (lead 23:4xZ; Sim frames first).
  Also landed: 6ff7dd4 usage.mjs (T-010; the lead runs it every 30 min and posts to T-010), fdb2577/8c3187e phone-temp.
  Open: I-042, I-045, I-046 (check.chrome screen size), I-047 (phone park between blocks), I-048 (shared readers hidden).
  Lead corrections 22:1xZ: I-042 resolves on the lead's npm test on main (shared lane), not on the phone G run, which is
  backlog (d) only; I-048 owner ts-progress-lane; ts-lock-share's exclusive hold moved to the back; scene-scope merges its two queue entries.
  Land requests to expect and pass on: ts-lock-share (2116109 docs + I-046), ts-proposal-watch (I-045), ts-phone-park (I-047), cal-headless60.
  iphone-runner §4v/§4w landed 211f923.
  22:2xZ: 4a903b2 (ts-lock-share shared-lane docs) landed. USER PRIORITY T-006 #5 (22:26Z): PR-001 (de-illusion-style, hero accent
  draw/erase frames) is the top of the testing lane: lead moved it to #1 in chrome-measure, board priority 1. Whenever
  de-illusion-style requeues, tell the lead at once so it moves the entry to the front. P-036 row: G on compiler v2 only (d72ee13644cc).
  22:4xZ: 866ea63 and fd23ed0 (I-045 proposal decision events wake every wait) landed. USER RULE T-006 (PR-001 lesson,
  AGENT_ROLES item 8): a changes-requested decision is the spec for the next revision of the SAME proposal: read it in
  full (`proposal show`), relay it verbatim, answer with `proposal revise <id>` quoting the request first and answering
  each point; arms not asked for go only under "also tried, not chosen", never as new proposals. PR-001 rev 2 = frames/
  video only (de-illusion-style); A/B arms are no longer posted. Accent containment result (de-illusion-style, Chrome):
  contain: layout size gives a 0-px diff on all 14 draws; its canvas-frames arm's first diff failed (alignment being
  fixed); a Sim F-108 run comes next. I-049 (lead, 22:44Z): shared readers starve behind later exclusive holds.
  Lead corrections 22:4xZ: containment is NOT a candidate. It is pixel-identical on Chrome, but WebKit source REFUTES it as a
  Safari fix (the svg is already a layout boundary; the full layout comes from 3 dirty svg roots in one frame,
  de-illusion-style 22:34Z): never present contain to the user. ts-lock-share's docs landed as 4a903b2 (rebased from 2116109);
  only I-046 is pending from it, then I-049 (owner ts-lock-share). fix-nav-morph steps out of the queue until the shared
  group runs (I-049 workaround): if it is still queued when the exclusive holder releases, tell the lead.
  22:5xZ-23:0xZ: lead's npm test on main 969/969 (22:54Z): I-042 and I-045 RESOLVED. 6ac64ae (cal-headless60, T-008 headless
  Chrome at 60 Hz) landed. de-illusion-style requeues often (short shared jobs): each time, tell the lead.
  Lock settings (lead): the shared lane stays at cap 4 (ts-lock-share batch 2); timing stays exclusive, cap 1 (from
  cal-headless60's parallel A/A). The headless-60 Hz mode proposal is parked until the user wants timing work back.
  23:4xZ: landed I-047 (72a7eb9, 5ad847c), I-046 (d00ee9a, MEASUREMENT CODE, headless only), I-048 (9fd2d3a), I-049
  (212059d: no later exclusive passes an earlier reader, 10 min reader age bound, head-of-line bypass); lead's npm test
  986/986, chrome:fn 6/6. I-046..I-049 RESOLVED (rebase). Open: I-050 only (stale Sim Safari tab, ts-phone-park).
  Correction: de-illusion-style's r10 "58/58 identical after handback" is INVALID (blank captures); the real figure is r11:
  421/436 frames identical in Chrome headless, 15 frames of one word open. Decision (lead): PR-001 frames must be
  WebKit-made: Sim frames first, the phone capture joins the phone backlog as (f).
  23:5xZ: PR-001 r12 (OBSERVED, Chrome headless): frames 436/436 identical ('you' and the Korean word); scroll sequence
  68/72 identical, 0 BLANK, ink floor 500; the 4 misses are off-grid t rows. The lead has NOT accepted "test artifact": a
  rAF-phase check (WebKit elapsed mod atlas step) is added to Sim d2. fix-nav-morph's Sim hold failed again (23:38Z: the
  dead stale tab doesn't answer Runtime.evaluate): blocked on I-050 (ts-phone-park, its top item). A mixed-version
  lock wait left Chrome free ~4 min (23:34-23:38Z); it cleared within the bound; ts-lock-share records it in lane §10.
  00:0xZ: cbc7975 (lane capacity cap 3 vs 4, T-008; live mixed-version wait) landed. I-051 owner ts-lock-share after its
  batch 3: measure the Sim boot cost first, then recommend keeping fw-sim booted between sessions, joins on CPU busy
  instead of load1, or accepting it; coordinate the sim.mjs change with ts-phone-park, which lands I-050 first.
  scene-scope: ST (RB + rotator-st6) NOT pixel-identical in Chrome: will-change:transform blurs the avatars by up to
  72/255 (≤2/255 without the transform); Sim checks pending, ST not signed. I4/I40 recommendation SIGNED: RBi lands
  first (after a pixel A/B on tools ≥d00ee9a and a phone ticket); I40 held until a Sim RBi40 count.
  fwreskip: [WITHDRAWN 00:4xZ, probe artifact, see below] "stale layout state in #profile-showcase/#people, cleared by
  re-creating its children". Usage: ~34 % ESTIMATE at 23:53Z, ~60 % expected by the 02:20Z reset.
  00:1xZ: I-050 landed (7fa4251), RESOLVED; only I-051 open. SIM PITFALL (standing): Safari can serve stale immutable
  CSS/JS across reused ports, so every Sim arm server runs with --no-cache and its server log shows a GET check
  (de-illusion-style finding; lead alerted scene-scope, fwreskip, nav-morph). PR-001 Safari copy: half the mismatch was
  that stale CSS, half a real half-device-px placement blur in WebKit; a sweep is next.
  I-052 (F-115, owner ts-phone-park): Sim Safari keeps cached immutable assets per origin and --no-cache does not evict
  them. Workaround: a never-seen port per session plus the overlay GET count; the fix makes every Sim session start with
  an empty Safari cache. Earlier cache-on Sim arm results are VOID (PR-001's d1 orig captures stand). PR-001 v2
  (OBSERVED, Sim): the canvas moves out of the hero-copy layer, because of a half-device-px resample inside it. Queue
  (lead 00:2xZ): PR-001 v2 Sim hold first, fix-nav-morph right after (~00:27Z); flag only if it has not started by
  00:32Z. A shared slot running while an exclusive waiter sits at the host gate pass window is by design.
  00:3xZ nav-morph/cdwc: fix-nav-morph FINISHED. P-032 Sim mechanism re-check clean (counts only, compiler v2
  ee84ebd4e916, 2 runs: exactly 2 forward tweens per run as registered, every push/dwell move prevented, no one-move
  flicks; t0 lag 10-19 ms OBSERVED, Sim). Committed 3ac33c5 + e7a9522 on worktree-agent-a277ea00c8773c1ea; lands with
  the topic's review. cdwc row parked until timing returns. STROKE-FIDELITY GATE (lead decision 00:3xZ, registered before any phone data): phone G/F runs are void when any stroke's contact time is more than ±10 % off plan (symmetric); Simulator runs are never scored, so exempt; a block that voids runs at +10-20 % keeps the rule; a change needs a new registration before the next block. Why: the phone's
  measured overshoot (+4 to +8 %, ts-gesture) passes; loosening to +20 % on Simulator data alone would be post hoc.
  WHOEVER RESUMES THE PHONE BLOCK (backlog (d)/(e), P-032/P-036) APPLIES THIS GATE.
  fix-nav-morph done: the gate is in fixes/mw10e-cdwc/README.md (26de4ad, on top of 3ac33c5 + 66f5f9f + e7a9522, not
  rebased); its scorer exempts Sim records. Nothing queued; it lands with the topic's review.
  00:4xZ fwreskip CORRECTION (fix-scroll-engine, lead): the r6-r9 "stale layout state in #profile-showcase/#people, cured
  by re-creating its children" is WITHDRAWN: a probe artifact (hiding the shells shrank #people across our own fwFar
  re-skip edge, so fwReskip deferred it). Revised claim, OBSERVED in our setup (Sim): each containment flip (y2988 hero
  deferred, y3047 platform-card will-change) costs ~20 ms only while #people (1327 px) is still rendered; its own re-skip
  comes only at ~y3539. Next r11 localizes the box; then fix choice (a) re-skip #people no later than the hero or (b) a
  structural change in #profile. No build until the lead has seen it.
  00:5xZ fwreskip: r11/r12 found the box: the whole rendered profile deck relays out (~20 ms, OBSERVED, Sim); deferring
  #people with its correct size gives ~1-2 ms on the Sim (attribution, not a gain). Lead SIGNED option (a1h): when the
  hero far re-skips, also re-skip the next inactive deferRendering section wholly above the viewport and keep it skipped
  until the hero un-skips (keeps today's hysteresis; our own scroll-engine code, offscreen only). Before landing:
  geometry, A/A pixels in Chrome and Sim, Sim W Layout ≤3 ms at 2988/3047, jumps with no blank frame, a deck swipe
  count check; no timing A/B. PROGRESS must not promise a speed-up.
  I-051 (ts-lock-share): building option (b), a CPU-busy join check, plus a "handing over to X (gated: reason)" status
  line; (a) keep fw-sim booted is REJECTED; the timing-gate candidate is deferred until timing resumes.
  01:1xZ: I-052 landed (85ad9a0): every sim session empties Safari's HTTP cache at boot, so the never-seen-port-per-arm
  rule is no longer needed ACROSS sessions (it supersedes the 00:2xZ workaround). WITHIN a session, check the server-log
  GETs or `sim.mjs fetched`; a transferSize of 300 does not prove a network fetch (OBSERVED).
  01:4xZ scene-scope: review of RBi40 (8690486) NEEDS-WORK. The V1i one-shot cut changes reachable frames (at <=600 px
  the hero scroll-cue copy-in after a reload while scrolled or a bfcache restore; the accent stroke paused mid-way on a
  fling); the pixel checks were phase-blind and missed #platform (y>=4082); mechanism and regression checks are missing
  for the landing build. Decision: build RBi40p (cut only the #platform-internal one-shots + tracks + will-change
  classes; keep the hero/people/commission/nav/sb-* entries), then re-review; no user-acceptance route. PROGRESS: no
  "byte-identical" wording for scene-scope until then. PR-001: the w00 1-ms atlas is built; its first Sim parity run
  failed 1/130 (likely a test-hook artefact), re-run queued. ESTIMATES: 7 words ~2.3 MB WebP, ~31 MB decoded; rev 2
  must show decode timing and a cost/benefit table.
  02:0xZ: I-051 RESOLVED (dd02aac CPU-busy join, 47bdb2d hand-over line, 42ca964 docs §12; npm test on main
  1002/1002). NO incidents open. ts-lock-share and ts-phone-park done; iphone-runner (a7696771) done and parked (the
  fwreskip phone check waits for the phone). PR-001: Sim arm parity run 3 PASSED, 71/71 in and out byte-identical
  (OBSERVED, Sim 26.5), whole-CSS-px canvas placement; the GPU-process canvas default is CONFIRMED in source, whether the
  shipping build uses it is UNRESOLVED; sim-counts next. The illusion-proposals PROGRESS line no longer cites the Chrome
  436/436: the canvas is Safari-only (whole-ms clock, CONFIRMED in WebKit source), Chrome keeps the SVG.
  review-fwreskip on 6fd09a6: NEEDS-WORK. B1 Chrome one-frame #people placeholder after an instant jump from the band
  ~[3659, 3892] (C11 queued un-skip); B2 short reversal not run; B3 no idle triple; B4 scenarios list incomplete. Lead:
  no waiver; fix-scroll-engine builds variant (a): synchronous un-skip of the fwWith partner in the rE scroll listener
  within ~1 vh, rule restricted to the hero's partner; reruns the jump checks with controls n>=5, the Sim reversal and
  the idle triple; re-review. 3959e8f (docs) may ride along. User told (T-005), with a correction: the lead's "settled
  pixels identical" was too strong.
  02:1xZ PR-001 CORRECTION (de-illusion-style): real-time FAILURE on WebKit (OBSERVED, Sim, Timeline off, 50 s at y0).
  Each canvas draw runs only 2-8 rAF ticks, then no rAF until the 900 ms end timer: the word freezes part-way, then
  jumps. The 71/71 and 142/142 parity held only on a stopped clock (render(t) flushes with getImageData), so live
  playback is NOT pixel-identical. Per-draw counts (SVG ~58 recalcs vs canvas ~5) are distorted by the stall: never
  quote them as savings. Cause UNRESOLVED (hypothesis: GPU-process readback, accelerated ImageBitmap into a
  willReadFrequently canvas). Next: one Sim hold, 4 variants + an SVG rAF control + console errors. Rev 2 ON HOLD.
  02:3xZ PR-001 4 variants (OBSERVED, Sim): none ticks every frame; the whole page's rendering updates stop 1-2 s per
  canvas draw, while the SVG control in the same session runs clean (54 ticks per draw); no errors; apply() 0-1 ms per
  tick; GPU-readback hypothesis UNSUPPORTED. Next ~2 min hold: (a) engaged, nothing drawn; (b) one drawImage per tick;
  (c) SVG hidden, no canvas; (d) a minimal standalone canvas page with no Fastwork code (tells a Sim artifact from our
  page). Then rev 2 whatever the outcome; likely parked pending a phone check.
  BOARD HYGIENE (lead, standing): when the lead lands a tool or fix branch, ops sets its board row to landed in the same
  pass as the handover entry (I-051 lock-share and I-052 rows sat at ready-to-land after landing).
  02:4xZ PR-001 REV 2 POSTED to the console (state: proposed rev 2). Frozen frames exact (142/142); live playback stalls
  in the Sim, and so does a minimal page with no Fastwork code, so the Sim cannot judge it. Parked for a phone check, NOT
  withdrawn; no savings claimed. The user decides: approve the phone check (arm 1 tiles + arm 2 one-copy-per-frame, test
  only, ~83 MB ESTIMATE) or withdraw; the lead's wait on the decision is armed. de-illusion-style FINISHED: 186fb5b on
  worktree-agent-afc7d9fff1fcc6154 (README, patch.diff, tools/standalone.{html,js}; test:unit 555/555); not a land
  request yet, it waits on the user's decision; void list in its README; finding F-120 (query-flag pitfall). If
  approved, the phone check joins the phone backlog as (f) (the phone is still unplugged).
  03:0xZ (lead): no new illusion owner; on approval de-illusion-style resumes for the PR-001 phone ticket (iphone-runner
  runs it as (f)); de-illusion-composite's items stay parked off the page. h9 (morph start, fixes/layout-containment/README.md)
  stays parked: the user deferred the morph-start first slide-in (T-001 #14); it resumes after fwreskip lands and only
  if the user un-defers it. fwreskip f1 r1 corner diff (182-603 px, Δ4, = B's own fresh-raster frame, OBSERVED) is posted
  to the user in T-005 #17: the user's call, together with the review result. The B2 up-pass +1 Layout (3 vs 2, A/A 3,
  n=1) is being re-run at n=3.
  03:3xZ: 438f933 landed (layout-containment README: F-108 cause, morph-start h2-h8, h9 parked per T-001).
  review-fwreskip-2 on 3ce8ce3: NEEDS-WORK. Review-1 B1/B2/B4 closed; (i) survived a vcross rerun. Blocking: (1) the
  down-pass is overstated (first descent per run B 2,2,2 / P 0,0,3 / A 2,2,3; down2 P 1 vs B 2); (2) Sim idle not settled
  (Paint +23 % at 3100, n=1, no A arm); (3) the no-initiator Layouts sit at the extra #people un-skip; (4) undeclared
  touch/async-scroll risk (on iOS the UI process scrolls ahead of iE, which un-skips from the main thread). Lead: fwreskip
  does NOT land before a phone G/F fling check (protocol): it waits on the phone (backlog (g)). Sim repeats: 6
  back-to-back holds of 3.5 min, B P A A P B. User told T-005 #18.
  review-scene-scope-2 on dfb15bc: NEEDS-WORK. Census and cut correct; the RBi40 failure modes stay gone. D card sent back:
  count view-rooted nested Layouts only (B 2 / RB 1 / RBi40pw 1 / RBi40p 0) and state that it does not explain the
  ~18 ms layout. Blocking: fix.mjs check ran on baseline JS (rerun --on bplus); README speed-ish wording and a false
  "overlap" line; #platform pixels are state evidence, not byte identity (fix: deterministic A/A, timer hold or virtual
  time). Lead: RBi40p does not land alone (stepping stone: same switch cost, same recalc count, plus a coupling to fwWCSel
  and the 50 % margin). Next: RBi40pt (+ the 4 row-title entries), own P-row, deterministic pixel A/A first, check
  --on bplus, Sim W n>=3. User told T-001 #16.
  PHONE BACKLOG add (g): fwreskip phone G/F fling check (lead 03:3xZ), before it may land.
  03:5xZ fwreskip: review-fwreskip-2 recheck on f7f24f4 ACCEPT on README and data (high confidence; numbers recomputed,
  the v7 recount judged legitimate). (iii) idle closed by the lead: "no idle cost found (n=4 windows from 2 holds per
  arm, A/A)". The owner makes wording-only edits (new sha to follow, no re-review). The user is asked (i) the corner
  pixels and (ii) the up-pass trade in T-005 #19 (--ask). Landing gate (iv): the phone G/F fling check, backlog (g),
  when the iPhone is on USB.
  04:1xZ PHONE ORDER (lead, supersedes the (a)-(g) order above): 1 phone-fwreskip-g1 (the G/F fling landing gate; ticket
  in fix-scroll-engine's README, pending its report), 2 PR-001 (only if the user approves), 3 scene-scope ST, 4 the
  T-009 cooldown curve, 5 the I-042 G check. The morph start (e) stays parked (user deferred, T-001 #14).
  04:2xZ (g) = phone-fwreskip-g1 TICKET (fix-scroll-engine, prepared, not run): b5f24a5 on worktree-agent-a1722cf5058e25591,
  README "Phone ticket G1 (item iv)". Snapshots out/fwreskip/snap-g1/{B,P} in that worktree: B JS dbd5fdb4f1fb, P JS
  96b876639c84, CSS 0d7dfc79e703 both (second read mgmt-ops-6 04:3xZ: all 4 sha256 prefixes match). Gesture
  fling-band-v1.json, compiler v2 (fast 5,850 px/s hash 3195734415a8, medium 3,240 px/s hash f7cded2f3ea6); logger flinglog.mjs with a magenta calibration flash. Block
  B P P B B P P B, fast; medium only if no FAIL; F via the console if G is inconclusive. Stroke-fidelity gate ±10 %
  applies (lead 00:3xZ). Board item phone-fwreskip-g1, owner iphone-runner; fix-scroll-engine parked.
  Second read: question, one control (B = RB), driver G (F fallback), warm-up per port, Timeline-off sentinel, ~15 min per
  block, at most 2 blocks, void and FAIL rules written before data: OK. MISSING: a P-row in fixes/PREDICTIONS.md (the
  owner's prediction for item (iv)); register it before the block runs. -> DONE: P-057, e73676d on
  worktree-agent-a1722cf5058e25591 (rebased on e8fade9, no measurements): no FAIL in block 1 (fast, ~65 %) or block 2
  (medium, ~80 %). It lands with the fwreskip branch, not via ops.
  04:4xZ scene-scope: deterministic A/A converges 22/22 at 430 (RBi40p and RBi40pt both 22/22; blocking item 3 closed at
  430). RBi40pt FAILED its P-056 phase falsifier at 1440 (sweeps start at 3433 of 4000 ms, n=1). Lead approved (a): a
  one-line init-paused change in PMsweepGate (JS 3982), with a P-056a onset-time falsifier at 430 and 1440; (b)
  desktop-only acceptance REJECTED. P-056/P-056a and P-057 live on the owners' branches until they land.
  PR-001: the lead's proposal wait is re-armed; still "proposed rev 2", no user decision.
  05:4xZ scene-scope at ba384b1, candidate RBi40pti (variants/23.diff): P-056a phase + onset HIT at 430 and 1440.
  Frames (c1) strict MISS: at 430 the count-up also differs in A/A; at 1440 the y7500 rings frame differed in 1/7 V loads
  vs 0/12 S0 (unexplained). Sim W: view-rooted nested 0, no Layout after the switch RS. Outer RS count MISSES its
  interval. Every Chrome hold ran with the display OFF (I-033). Lead resumed fix-scene-scope for one more frames hold:
  pin the count-up so A/A is identical at 430; 20+20 interleaved loads of the y7500 frame with a Fisher p. Then
  review-scene-scope-3, and the lead takes the 1440 numbers to the user (no pixel waiver by the lead).
  06:1xZ scene-scope frames re-check 61b9b9b: 1440 y7500 V 0/22 vs S0 0/22 differing, p = 1 (pooled 1/23 vs 0/24,
  p = 0.49). 430 with pageframes4 (IO hold): the remaining differences also show in A/A (y3900 "5" glyph 76 px Δ1; S0's
  first-load avatar Δ66); none are V-only. P-056a(c1) stays a strict MISS as written (the gap is in the frame check).
  review-scene-scope-3 spawned (read-only, fix-reviewer definition); fix-scene-scope parked waiting on it. After the
  verdict the lead takes the pixel numbers to the user (T-001), then signs or returns the D card.
  06:2xZ review-scene-scope-3: NEEDS-WORK (medium-high); the fix is sound. Blocking: (1) the 1440 y7500 V-only frame
  (hash 559c68ab9d) is still open: the 22/22 re-check used a shorter walk; rerun q40ui's exact procedure, >=10 loads per
  arm, with a prediction row committed first; (2) README contradictions (candidate status, rows 17/23, risks,
  scenarios); (3) the D-card WebKit claim is wrong and has no status word: mark it UNRESOLVED until T-011. Lead resumed
  fix-scene-scope: prediction row, then the 1440 rerun, then review-4. PHONE ORDER item 3 is now scene-scope RBi40pti
  (T-011 runs RBi40pti, NOT RBi40p). Board: phone-fwreskip-g1 refreshed (queued, waiting on the phone, ticket b5f24a5,
  P-057 e73676d); phone-queue next updated.
  06:4xZ PHONE BACK: the iPhone is on USB since 06:26Z (user T-013; usbmux 1, proxy :9222 up, WDA up); T-011 resolved.
  iphone-runner resumed and runs G1 (fwreskip, landing gate (iv), P-057); C-017 posted for the QuickTime recording
  permission. Order after G1: PR-001 blocks, scene-scope RBi40pti (after its review-4), T-009 curve, I-042 check.
  PR-001 rev 2 ACCEPTED by the user (06:31Z): all solutions OK, "a bit" of pixel difference acceptable, pick the best
  performer. de-illusion-style resumed; lead OK on its plan: arms C, F1 tiles, F2 one-copy (memory-limited), F3 middle
  layout, V HEVC-alpha video, B visible copy only; P-058 committed before data; 2 phone blocks (A: C F1 F2 F3; B: C V B),
  then PR-001 rev 3 with the pick. Phone TIMING LIFTED FOR PR-001 ONLY (user told T-006 #22); everything else stays
  timing-deferred. I-053 (tool, non-blocking): one proposal carrying several options for the user to pick; ts-i053
  spawned, row i053-proposal-options. CONSOLE OUTAGE 01:50Z-06:17Z (it ran as a 2 h-capped Bash job); now detached via
  nohup on :5559, the lead checks `console.mjs url` at each check-in.
  06:5xZ scene-scope f03c024 (P-056b 8a6eee6 committed first): under q40ui's exact 1440 procedure the odd frame recurred
  V 0/10, S0 0/10: "not reproduced". README blocking 2 and 3 fixed. review-scene-scope-4 spawned (focused re-check); the
  user is asked in T-001 #17: (a) accept as noise, (b) a display-off rerun, (c) reject. fix-scene-scope parked. Lead
  summarized T-008 for the user (#27).
  07:0xZ: review-scene-scope-4 ACCEPT; PR-002 (scene-scope RBi40pti) POSTED, linked in T-001, answers #17/#18;
  fix-scene-scope parked on the user's decision (worktree-agent-a49a278f1d0bd6803, README 58f4df5 + 7f9d5ba); board
  style-recalc waiting on user "PR-002 decision". I-054 (serve.mjs has no HTTP Range support: Safari never loads an
  overlay <video>; blocks PR-001 arm V): ts-i054 spawned; measurement-adjacent (what is served), test:chrome.
  COORDINATION GAP (lead 07:0xZ): G1 records with QuickTime on the Mac, so phone blocks are no longer Mac-independent.
  At 06:54Z a shared-lane Simulator boot (de-illusion-style, w3) pushed load1 to 38.9 / CPU 99 % mid-G1. iphone-runner
  logs load per run and checks the recordings for frame drops. Draft below, APPLIED by the lead at 07:0xZ (see 07:1xZ):
  a Mac-quiet window for phone blocks that record on the Mac.
   1. Each counted part runs inside `node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing
      --max-seconds 600 -- sh -c '<part>'` (exclusive: the shared group drains first and nothing joins; parts <= 10 min,
      requeue between parts; the lead moves the runner to the front). --no-timing skips the host gate, so the part
      first checks load (e.g. `lock.mjs wait chrome-measure --until idle --for 60` before queueing, and load1 logged
      per run); a run with load1 above the gate's threshold is flagged, not counted, until the lead decides otherwise.
   2. Tool gaps found while drafting (for a toolsmith if applied; read from tools/lib/iphone-run.mjs, lock.mjs):
      (a) measureGuard (iphone.mjs run) passes a shared group, because the group reads as a short holder, so a Sim
      boot does not stop a timed phone run; (b) it has no same-owner exception, so the runner's own --no-timing hold
      would make iphone.mjs run WAIT (only --allow-during-measure, documented for diagnostics, passes); (c)
      gesture-run.mjs (iphone.mjs gesture, G runs) calls no measureGuard at all.
   3. Cost: everyone else waits about 20 min per block (2 x 10-min holds); phone blocks without Mac recording stay
      outside the window.
  07:1xZ MAC-QUIET WINDOW APPLIED (lead 07:0xZ; standing). Data (iphone-runner): every G1 block-1 recording dropped frames
  (26-65 gaps > 1.5x median, max ~50 ms) at load1 38-94; 4 of 8 recordings lost the calibration frame (VOID). Form: an
  idle wait (`lock.mjs wait chrome-measure --until idle --for 60`), then `lock.mjs run chrome-measure --owner
  iphone-runner --no-timing --max-seconds 600 -- <part>`, one per part, requeued between parts. Only G runs inside it
  for now (`iphone.mjs run` would WAIT on its own guard). Shared Sim and npm-test jobs wait ~10 min per recorded part
  (de-illusion-style and ts-i054 told). I-056 OPEN (non-blocking): guard gaps (a)/(b)/(c) above; a toolsmith after
  ts-i053/ts-i054 land. I-055 (flaky wda e2e test under load): ts-i053, separate commit after I-053.
  G1: the white deck placeholder at fling +1013 ms (7P) also shows in B (1B, 4B): NOT fwreskip's; re-runs of the 4 void
  recordings run in the quiet window; the landing gate holds until the check is done.
  PR-002 = CHANGES-REQUESTED (user 07:00Z; paraphrased: does it still animate exactly like the live site? an illusion
  almost no user can detect is acceptable; investigate and verify). Lead go for rev 2 (fix-scene-scope): per-animation
  census (shared, probe w1), motion frames (2 normal holds), a side-by-side clip, P-056c committed before data; no
  display-off rerun.
  T-014 #3 (user 07:07Z): "stack test, then PR-001". Timing hold lifted for the stack test only. wi-stack spawned (see
  directory). PHONE ORDER (supersedes 04:1xZ): (1) finish G1 (4 void re-runs + the white-deck check); (2) stack test;
  (3) PR-001 blocks A/B; (4) PR-002 / T-011; (5) T-009 curve; (6) I-042 check.
  07:2xZ STACK TEST A/B (lead pick A): wi-stack found today's best RB (= bplus + scene-scope; JS dbd5fdb4f1fb, CSS
  0d7dfc79e703) already carries cdwc, re-keep-op and F3. C = RB; V = stack5 = RB + blur-cubic + st6 (JS 59b23b3f57fd,
  CSS 6e09b2c708fa). (B) rb-aw / stack5-aw was built and NOT measured. User corrected in T-014 #5. Ticket: one S block
  ~15 min + a recorded swipe pair (Mac-quiet window), after G1, before PR-001. P-ID REGISTRY: P-056/056a/056b/056c
  fix-scene-scope, P-057 fix-scroll-engine (G1), P-058 de-illusion-style (PR-001 phone), P-059 wi-stack (stack test);
  next free P-060. Rows live on the owners' branches until they land.
  07:4xZ G1 BLOCK 1 FINAL (fwreskip): no FAIL; the white deck placeholder shows in B too; formally INCONCLUSIVE (B n=1,
  the 1-frame magenta flash can be missed). Real finding: P adds 15-40 ms at the #people un-skip on a fast fling up
  (P 65-92 ms vs B <=57). Block 2 CANCELLED on this build. P2 = the un-skip runs when idle, after 300 ms of rest;
  P-060 committed pre-data (c6d13ca); snapshots out/fwreskip/snap-g1b/{B,P2}, second read OK (P2 JS 9fe824464da2,
  B dbd5fdb4f1fb, CSS 0d7dfc79e703 both); flinglog v2, fling-band-v2.json. Next: Sim checks, review, then ticket G1b.
  iphone-runner stops the G1 servers. PHONE ORDER (supersedes 07:1xZ): (1) stack test; (2) PR-001 blocks A/B; (3) G1b;
  (4) PR-002 / T-011; (5) T-009 curve; (6) I-042 check. P-ID REGISTRY: + P-060 fix-scroll-engine (G1b); next free P-061.
  LOAD: load1 175 (5-min 71) at 07:28Z during a Sim session (de-illusion-style). holds.log shows one short hold that
  failed then: test-chrome (ts-i054's checkout) 07:22-07:26Z exit 1, re-run from 07:37Z. Shared-lane readers write no
  hold record, so their failures and timeouts can't be checked from the lock logs (gap reported to the lead).
  I-057 OPEN (tool, non-blocking): flaky e2e progress-cli I-048 shared-lane test (load1 > 16 refuses the 2nd reader); assigned to ts-i053.
  07:5xZ I-054 LANDED 67847b4 + RESOLVED (serve.mjs HTTP Range; re-measure only for A/Bs that serve video or media).
  Broadcast to active worktree agents: rebase between steps, never mid-hold. Sim-load: no cap change (lead). I-056 gets
  item (d): shared-lane readers log exit code and duration to holds.log. ts-i056 spawned for I-056 (a)-(d).
  S1 STACK TICKET second read (wi-stack 3ec9fc9, P-059 pre-data in the same commit): hashes OK (C JS dbd5fdb4f1fb /
  CSS 0d7dfc79e703; V JS 59b23b3f57fd / CSS 6e09b2c708fa), one control (RB), driver S, warm-up per port, C V V C C V V
  C, ~15 min, Timeline off. One fix asked: a non-Timeline S block also holds every counted C run to the sentinel
  (bottom >=58, scroll >=44; a failing C voids runs since the last passing control). S1 is now next on the phone.
  08:0xZ b58fa25 LANDED. S1 RUNNING: iphone-runner holds the iphone lease since 07:59Z (S block ~15 min, then the
  lead-approved blind swipe pair in a Mac-quiet window). PR-002 rev 2 checks DONE (fix-scene-scope; P-056c 71fe09a
  pre-data): census no per-animation difference beyond A/A; motion frames 430 V 64/64 identical, 1440 only a known A/A
  digit raster variant; summary with the lead, waiting for the OK to `proposal revise`; optional blind swipe A/B only
  after the lead's OK. st6 and the will-change selector: owner fix-scroll-engine (lead).
  08:1xZ PR-002 rev 2 ACCEPTED by the user 08:07:38Z (no notes, no swipe). SCENE-SCOPE D SIGNED (lead): NAMED for the
  nesting mechanism, class phone-only, gate T-011; the ~18 ms view Layout is LOCATED (row-title entries), mechanism
  UNEXPLAINED, a separate card. S1 BLOCK 1: primary (scroll gt34) BLOCK2, idle gt34 WIN, P-059 HIT; lead approved
  block 2 (iphone-runner from 08:17Z), then wi-stack runs the swipe pair C-019. T-015 QuickTime stuck dialogs: lead
  quit QuickTime 08:14Z, nothing lost; root cause assigned to iphone-runner.
  08:2xZ T-016 (user): iphone-runner cooled with a fixed `wait.mjs time 9m`. Cause: CLAUDE.md "Phone blocks" still says
  "10 min cooling between blocks" (also the wait list "cooling: `wait.mjs time 10m`" and the sentinel "cools 10 min");
  protocol §5.3 replaced it with `wait.mjs phone-temp`. LEAD.md and this handover fixed; CLAUDE.md left to the lead
  (agent messages can't authorize CLAUDE.md edits). Waits rule added above. I-058 OPEN (tool): waits post their reason
  to the board; toolsmith after the current land. Lead fixed CLAUDE.md (feb5936: lines 379/540 + "set your board row
  before any wait"). 42c14a0 LANDED: I-053 options, I-055, I-057 RESOLVED; console restarted 08:22Z with options live.
  08:3xZ S1 FINAL (stack test): pooled primary (scroll gt34) NO-WIN, p 0.162, THRESHOLD-SENSITIVE (gt30 WIN); idle gt34
  WIN (block 1); scroll gt50 block 2 +1.5, pooled +1 (P-059 edge HIT). Block 2 ran at Mac load1 up to 96 and its scroll
  phase was ~250 ms longer in both arms (OBSERVED; iphone-runner checks load vs run from the files).
  QUIET WINDOW FOR S/W/M (lead 08:28Z, softened 08:3xZ): PREFERRED, NOT BLOCKING (load doesn't pace the S driver): run
  S/W/M blocks in an exclusive --no-timing hold (load1 <= 8 at run start) when one is available, otherwise run anyway and
  log the load; recorded parts keep the Mac-quiet window (07:1xZ). I-056(b) (ts-i056) makes the hold usable for them.
  USER RULE T-017 (08:29Z/08:31Z): C-019 highest priority, don't make the user wait; user steps first (working rules).
  T-011 TICKET (fix-scene-scope 96300df, RBi40pti) second read; P-061 = fix-scene-scope (T-011); next free P-062.
  PHONE ORDER (supersedes 07:4xZ; user steps first, T-017): (0) any posted user step: now C-019 swipe pair (wi-stack);
  (1) PR-001 blocks A/B; (2) G1b; (3) T-011 (scene-scope RBi40pti, W Timeline, ~20 min); (4) T-009 curve; (5) I-042
  check. Post a user step only when the phone is free for it.
  08:4xZ c9bd0ae LANDED. C-019 ANSWERED 08:34Z (wi-stack): blind pick page 1 = V (stack5) over C (RB), rated 3/5;
  user note (paraphrased): better, but still a bit laggy, can it improve? iphone-runner: V's worst frame at the #people
  entry 66-75 ms vs C 48-57 (no overlap, OBSERVED). wi-stack runs a Sim leave-one-out (V-st6, V-blur-cubic). Load does not
  pace the S driver (iphone-runner, rho +0.11), hence the quiet window is preferred, not blocking. PR-001 blocks: run by
  iphone-runner (waiting for de-illusion-style's ticket with the V hashes). fix-scene-scope stopped; the lead resumes it
  with the 3 T-011 fixes (warm-up run per port, quiet hold preferred, P-061 time 08:3x) when T-011 is near.
  PHONE ORDER now: (1) PR-001 A/B; (2) G1b; (3) T-011; (4) T-009 curve; (5) I-042 check; user steps jump the queue.
  08:4xZ TOP INVESTIGATION (user T-017 08:36Z, paraphrased: investigate, tell the causes apart, design, then plan the
  improvements; mind priority and token budget): wi-stack builds a FILES-ONLY remaining-lag map of stack5 (every V
  dt>34 by crossing, sorted by excess ms, tagged by known cause); then the lead posts ONE proposal so the user picks the
  order. Zero new spawns for it; parked topics stay parked. 2c36b62 landed (PROGRESS wording OK); the lead sent
  fix-scene-scope the "preferred, not blocking" correction (it amends 06d2290).
  08:4xZ LAG MAP IN (wi-stack): #people frame 2 is the only V regression (+299 ms over 8 runs); three unknown rows get
  one combined Sim check each; user summary in T-017. review-fwreskip-3 spawned on fwreskip P2 (c6d13ca + f8cd750),
  ahead of G1b. PR-001 BLOCK A RUNNING on the phone (iphone-runner, lease to 09:03Z); its ticket had no mgmt-ops second
  read (went straight to the runner). I-056 and I-058 fixing (toolsmiths).
  08:5xZ T-018 CAMERA INCIDENT (facts from iphone-runner, disclosed to the user): the iPhone recording route turned the
  Mac camera on; it recorded ~08:46:57-08:48:15Z, plus an unsaved second recording to ~08:49:30Z; the agent viewed one
  still frame; a camera device listing ran at 08:51-52Z; all files deleted and the deletion verified; C-020 withdrawn;
  recording suspended; NO-CAMERA is the top working rule (above). P-058's visual-defect check (PR-001) is BLOCKED
  without recordings: an alternative or a drop, to be decided (lead). I-058 LANDED 29e0cca + RESOLVED (waits on the
  board); console restarted 08:54Z.
  LEAVE-ONE-OUT (wi-stack, Sim, OBSERVED): blur-cubic carries the #people frame-2 Composite, not st6 (details pending);
  wi-stack posts the design as ONE proposal with options A/B/C.
  09:0xZ 525d916 LANDED. PR-001 BLOCK A DONE: 8/8 valid, sentinels passed; load1 > 8 in runs 1-7 (flagged, not void).
  P-058 ticket (de-illusion-style, rebased: a5c6512 ticket, b6144af, ed6b323, 234d2b7, 0d6f1d2 V pixel, 9fe02d6 Mac
  load, 730f3b5 youdraws fix, 7dbc973 no recordings) SECOND READ PASS for block B: all 6 arm hashes match (shared JS
  a330f386556d; V mp4 7d5b834b69c5 / 8e8f113f8565, manifest 120f23bcae4f), runner has 67847b4 (Range), one control per
  block, W at the top, warm-up per port, S sentinels, phone-temp cooling, B = 9 counted. Cosmetic asks: minutes per
  block (B ~22-25 min + cooling), two stale lines. 7dbc973 changed the visual-defect criterion after block A's runs
  were in (before analysis): disclosed, rev 3 names it. BLOCK B NEXT, NOT GATED (lead correction): runs without
  recordings once iphone-runner has done tlcounts, the rebase and cooling. Only the live visual look at the winner and
  any capture route (screenshots over USB / the user's own phone screen recording / drop) WAIT ON THE USER.
  09:1xZ ae7189d LANDED. T-018 #7: the ioscap account went to the user (built 10-01; requested camera permission twice,
  denied; listed external devices only (the iPhone), never the Mac camera; no frame; source on main at
  research/architecture/oss-rendering-libs/ioscap.swift, removal is the user's call). PR-001 BLOCK A RESULT: F2 is the
  best canvas arm, but no frame gain over the SVG on the phone (n=2); F1 and F3 freeze mid-stroke. PR-003 POSTED
  (wi-stack, 3 options for the blur-cubic #people cost, A recommended).
- **21:4xZ** (resumed after the usage reset) SHARED LANE ON 21:40Z (d777f3e + 087e36b..c05ec41; cap 3, join load 16;
  `sim.mjs session --functional` = shared slot weight 3). I-044 fixed e1515ad. PHONE COOLING BY TEMPERATURE (user T-009):
  ts-phone-cool builds `wait.mjs phone-temp` (replaces fixed cooling waits). Landed candidates: f7d3b1b rotator-st6
  (user blind finger pick), 8207797 scene-scope V1+R4a+R4b (RB; root hunt parked), f230912 illusion-composite PoCs.
  HERO F-108 = the accent word's draw/erase (h7): de-illusion-style takes draw/erase (containment first, then frames/
  video; PR-001 changes-requested: user wants pixel-identical, apple.com-style frames/video); fix-scroll-engine takes the
  morph start (h8). ms-1 REFUTED img src writes on the phone. AGENT_ROLES item 8: how DEs post proposals. I-045 open.
- **20:4xZ T-002 20:37Z: usage 78 %, hero + page-end only until 04:20 reset** (21:20Z). Live: fix-scroll-engine (st6
  rotator, F-108 dirtier), fix-scene-scope (RB r4-v3 + morph start), iphone-runner (their finger checks); all else parked.
  mgmt-ops-6 PARKED (lead resumes after 21:20Z). Unlanded: nothing. Phone: no lease, waits for root-hunt tickets.
- **20:3xZ** Landed 0c90cdc (I-038 fix; npm test on main queued), f93f798 (iphone-wave2 §4s-4u), 7c1cdd5 (st5 split
  scored: P-042..P-044 HIT; st6 slide-start view 1/36 vs st5 24/35, C 71/71; trigger = animation-sampled opacity/
  transform flips; F-108 page-wide background dirtier). st6 = rotator F candidate (gain block deferred). New rules: Sim
  `--no-timing` structure holds; root-hunt owners (USER DIRECTION items 8-9). Note: one flaky test:unit fail at 20:33Z,
  passed on rerun.
- **20:3xZ USER PRIORITY (T-001, 20:24Z): layout-dominated slow frames first** (see USER DIRECTION item 7). Layout root
  hunt: t3 strict P-049/050/051 MISS, P-052 HIT (RB cuts steady-tween nested Layouts ~15x; neither arm changes the morph
  start). F-106 H1 (will-change restore) REFUTED by WebKit source; F-107 fwReskip crossing = two writes in one step.
  de-counts-sim holds chrome-measure since 20:30Z (Sim n1). st5 split on phone until ~20:40Z; then root-hunt tickets.
- **20:2xZ** WORKTREE CLEANUP (lead, user request): 56 finished worktrees removed (their work on main; 6 leftover doc commits
  landed first); untracked results archived in `.git/fastwork-mirror/archive/worktrees/<agent-id>/` (146 MB, local only);
  11 orphan arch-sim serve.mjs stopped. Kept: live agents + parked fix-nav-morph (a277ea00, 48 unlanded) and fix-hero-exit
  (a77e2ec7, 27 unlanded). Broadcast: `git rebase main` at the next safe point; headless needs main >= 8fa38f7. ts-headless
  and ts-console-threads are ENDED (worktrees gone; can't be resumed). USER: lock-share = HIGHEST Chrome priority.
  scene-scope t2: P-045/046 HIT, P-047/048 MISS; outside view Layout 12-18 ms in every arm -> root hunt (H1 will-change
  restore on .start-selling-platform-card, source check running). st5-split Chrome counts 18dacf0: st6 removes both
  flips, parity 0.00 %, Chrome Layout not discriminating (as predicted). de-counts-sim: Sim refuses the short lane by
  design -> 3 normal holds <= 420 s (n1 A/B, n2 C/N calibration, n3 V1/V1i); its Sim-vs-phone verdict waits on n1+n2.
  scene-scope t3 (R4, M, 20:12-20:20Z): P-049/P-051 MISS (morph-start keeps 2 nested view Layouts), P-050 RA MISS / RB
  near (1-3 vs 30-44 per tween), P-052 HIT (tween RS RB 0.1-0.2 vs C 0.5-0.7 ms). st5 split on phone 20:22-~20:40Z.
- **20:0xZ** Console THREADS landed (77d318c, rule fc07bb1): an agent the lead assigns a thread arms `console.mjs thread
  wait --as <me>` and answers there, not in chat; broadcast to 12 live agents. scene-scope block-1 scoring (owner, strict
  raw count): P-040 MISS, P-041 HIT. Tickets 2 (C=B, I4, I40; W; P-045..P-048) and 3 (C=B+V1, RA, RB; M; P-049..P-052)
  went straight to iphone-runner on the user's "run now"; second read in parallel OK, hashes match. Phone order: t2 ->
  t3 -> st5 split. Proposals waiting for the page: boil-ca, accent-wipe, typing-chunks, digit-layers (+2).
- **19:5xZ** scene-scope attribution block done (iphone-runner 19:44-19:52Z, 9/9, heat sentinels pass): nested Layouts
  in the switch RS C 2 / V 2 raw (2nd 0.1 ms non-view -> 1) / I 1; RS self C 2.4-3.7, V 1.2-1.4, I 0.6-0.9 ms; but the
  cost MOVED: fwReskip RS (y~2990) C 14 / V 18-21.5 / I 21-23 ms, switch + fwReskip C 32-35 / V 33-39 / I 39-41
  (OBSERVED; P-040/P-041 scoring = fix-scene-scope). st5-split ticket validated (cfef9cf, bands as P-039, ~15-18 min) and
  sent to the PHONE at once (phone free, de-counts-sim gate pending, Chrome queue 6+). I-044 (status.mjs stale "now" line).
- **19:4xZ** User GO 19:41Z: iphone-runner runs the scene-scope ATTRIBUTION block (C=B, V1, V1i; W; Timeline; nested
  Layouts at the #platform flip) = P-040/P-041 (ids assigned after the fact, predictions pre-data in the ticket msg;
  hashes checked in parallel, match). st5-split ticket (fix-scroll-engine 2944262; C, V1, st5, noanim, waapi, st6) =
  P-042..P-044, second read OK pending (1) band conflict (view >= 50 vs MIXED 25-75) and (2) device minutes; snap2 hashes
  match; Sim if de-counts-sim's C/N gate passes. de-pm-hero land request 78c2b4b/372ecae/1ae7225 (F-102: WebKit
  opacity/transform flip forces layout, CONFIRMED source; our cause UNRESOLVED; st6 = no-flip arm). de-counts-sim: 3
  short chunks; WebKit has no restyle element count (CONFIRMED source), "345 -> 30" is Chrome-only.
- **19:3xZ** Landed a22657a + b8a533c (ops), dfc8e08 STATUS BOARD (seed applied, lead set priorities, console /status).
  RULE: owners `status.mjs set <id> --by <me> --state … --note …` at every transition, `status.mjs mine` on resume; PROGRESS
  = user narrative, live state = board. Pinged all 13 live owners 19:28Z (ids per lead); report non-adopters ~19:43Z.
  P-039 st5 (19:12-19:23Z, valid): MIXED, swap ticks 1/31 view, slide-start 15/33; idle y1500 dt>34 70->29, >50 4->0;
  cost-moved not tripped; next = lead (split block needs 3rd-block exception / gain block / park). I-042 D4 (phone,
  OBSERVED): safari-restart 6.0 s; >= 25 ms segments within +8 %, 17 ms +31 %, 8 ms collapse; ~115-125 ms per pointerMove
  before touch-down (Sim ~50); compile v2 = piecewise >= 40 ms segments (15-20 moves / 900 ms), COMPILER_VERSION 2: G
  numbers compare only within v2. Phone: cooling to 19:33:30Z, then P-033 unless scene-scope's ticket is validated first.
- **19:1xZ LEAD PRIORITY ORDER (supersedes 18:4xZ):** (1) style recalc (fix-scene-scope); (2) USER: illusion proposals
  (de-illusion-style, de-illusion-composite, ts-proposals; PROGRESS `illusion-proposals`): counts first, <= 2 batched
  Chrome holds each, queued after scene-scope + de-counts-chrome/-sim; no phone before the user Accepts; an accepted
  proposal -> fix topic + phone ticket via mgmt-ops; (3) phone-tool fixes (I-042 compile, I-038); (4) st5 / P-039;
  (5) lock-share / headless / status-board / threads / proposals tooling. Watch chrome-measure queue length (load).
- **19:1xZ** Landed c220e82 (lead retrospective; §5 now "Standing lead policy" above), a93d0c9 (§4p), 62e3fd9 (§2.1 final
  inspector-clean block: OPEN (a) below DONE), 8e26131 (PROGRESS ranked items). anim-transform + image-size PARKED (small
  gain, after scene-scope + R4+V3 phone result). fix-scene-scope hold 1: V1 `:is(70-list)` made the flip ULT slower
  (OBSERVED) -> rewritten as a flat list; Chrome does not reproduce the phone's 25 ms nested Layout; WebKit
  StyleTreeResolver `updateStateForQueryContainer` SkipDescendants CONFIRMED in source; hold 2 = A, A+V1, B, B+V1, then
  its W Timeline ticket (ahead of P-039's successors). P-039 st5 block started 19:12Z (~42 min).
- **19:0xZ** Landed 30eaa11 (de-style-recalc DONE: style-recalc-images.md, F-093..F-096): H1 nested CSS REFUTED (scope, not
  matching), H2 images = memory only. Ranked fixes 1 scene-scope, 2 R4+V3 (fix-scene-scope), 3 st5, 4 fwReskip, 5-6
  sweep/packet -> transform, 7 image right-sizing (Sim memory + pixel check, no phone) -> PROGRESS items. ts-gesture I-042
  D1-D3 (Sim, OBSERVED, n=1): >= 33 ms segments play as written, 25 ms stretch +31 %, today's 8 ms collapse to a 50 ms
  flick, ~50 ms per pointerMove before touchstart; fix = compileStroke one move per >= 40 ms; phone D4 ~19:10Z <= 7 min.
  **OPEN (track):** (a) DONE 62e3fd9. §2.1's final B numbers: when iphone-runner's inspector-clean SR rerun lands, fix-scene-scope (or
  mgmt-ops) appends them to style-recalc-images.md §2.1, append-only (re-read the y≈2615 and y≈5260 rows). (b) UNRESOLVED:
  why the y≈2610 scene flip was cheap in ~30/35 older runs and costly in every B block-1 run (dirty-container hypothesis;
  decisive = scene-scope's Chrome check of Layout dirty objects at the flip). (c) UNRESOLVED: Chrome's per-frame `.hero`
  inline-style writes (40-55 ms at 6x, JS 4172) have no phone counterpart: skipped or priced low? (phone Timeline
  FunctionCall at JS 4172 in an idle-hero window). (d) UNRESOLVED: `step-end` opacity boils (commission underline, B CSS
  165-171) wake the main thread per step or per frame (§3.2).

- **18:5xZ** fix-scene-scope spawned (lead): de-style-recalc's proposal (`:where(*)` scene pause narrowed V1 / API pause
  V1b / early flip V2 / panel + R4 V3, on B). PHONE ORDER: iphone-runner style-recalc block (lease to 19:12Z) ->
  ts-gesture ~5 min -> fix-scene-scope W Timeline block (after its Chrome check + second read) -> P-039 st5 -> P-033 ->
  P-038 -> P12 -> P10 -> P5 -> P9. ts-status-board seeded with the workstream map (mgmt-ops-6 18:5xZ). Landed fa7fc6b.

- **18:4xZ LEAD PRIORITY ORDER:** (1) style recalc (de-style-recalc + iphone-runner's block, then a scene-scope fix);
  (2) phone-feeding tool fixes (ts-gesture I-042, ts-iphone-run I-038); (3) st5 / P-039; (4) lock-share, headless,
  status-board tooling; (5) the rest. New: ts-status-board (briefed on the PROGRESS split).

- **18:4xZ** Landed: a3b2832 (docs-2), 1e0dedf (ts-lock-bundle 5 commits; announcements + CLAUDE.md --no-timing line =
  lead), 511908f (P-039 ticket). P-039 st5 TICKET VALIDATED (second read 18:4xZ, row in PREDICTIONS). C-014 (lead): the
  user's Mac Safari Web Inspector was attached to the phone in parallel = likely cause of the inspector wedges (I-038),
  closed 18:41:48Z (noted in I-038). Phone: iphone-runner style-recalc block (lease to 18:58Z) -> ts-gesture (queued)
  -> st5 (P-039) -> P-033 -> P-038 -> P12 -> P10 -> P5 -> P9. chrome-measure: de-style-recalc #1 (lead).

- **18:3xZ USER PRIORITY (18:32Z): style recalculation is the HIGHEST priority** (overrides the order below). Phone:
  iphone-runner style-recalc Timeline attribution block on the sitting's A/B NOW -> ts-gesture ~5 min -> st5 / P-033 ->
  P-038 -> P12 -> P10 -> P5 -> P9. chrome-measure: de-style-recalc to #1 whenever it queues (lead moves it; tell the
  lead the moment it queues). Any de-style-recalc fix proposal is FAST-TRACKED: owner, ticket (second read at once),
  phone block next. ts-gesture told.

- **18:3xZ** USER SITTING C-013 done 18:30Z (lead): hero + page end "B quite smoother" (B = aw1-10e + g + cdwc + re-keep-op +
  arm-scope-c; not blind, one viewer, OBSERVED perception). User's own idea: style recalc ~19-20 ms (> 16.7 ms budget)
  is the lag; hypotheses (1) nested/complex CSS selector matching, (2) per-frame image rotation/resizing, image sizes,
  native CSS -> lead spawns de-style-recalc. PROGRESS: items best-stack (felt better) + style-recalc. Phone free ->
  ts-gesture ~5 min -> st5 or P-033. Lead reorder 18:24Z: chrome-measure ts-gesture, layout-containment first.

- **18:0xZ** P14 DONE 17:42-17:54Z (9/9 valid; sentinels bottom 60.2, scroll 56.6): V1 st4-noswap HIT (2/67 view ticks),
  V2 #people-rooted HIT but 0.57 of C (MISS on <= half) -> LEAD SIGNED D (rotator: swap path); fix-scroll-engine st5 next.
  PHONE ORDER (lead 17:5xZ): user sitting C-013 (lease `user` until 18:54Z; A :5611 baseline, B :5647 B+) -> ts-gesture
  ~5 min -> st5 (C / st5 / V1, ~45 min; after Chrome mech + screenshot diff, de-pm-hero cross-check, second read) ->
  P-033 gain -> P-038 -> P12 -> P10 -> P5 -> P9 (if st5 isn't ready, P-033 first). Landed 508d8b4, 1302f64.

- **17:5xZ** Landed: 079e1cf (docs-2), 379d5e5 (ts-iphone-run N1: no LAN host in tab-pick/gesture errors), I-032
  fe7db9f..9e59002 (RESOLVED; main npm test 771/771), 5137637 (I-043 wip.mjs socket leak, ts-iphone-run). P14 (W)
  started 17:42Z (~30-35 min) -> user sitting (A = original baseline :5611, B = B+ with arm-scope-c :5647; lead holds
  the lease as `user`) -> ts-gesture (~5 min phone confirmation; I-042 D1-D3 + new `safari-restart` tool on the Sim).
  Spawned: ts-console-nav (console menu + notifications), ts-lock-share (shared lane for functional-only jobs, design
  first), review-lock-bundle (ts-lock-bundle's 5 commits). USER RULE: no-number iPhone jobs go to the Simulator (above).

- **17:3xZ** (mgmt-ops-6) Took over from mgmt-ops-5 (17:28Z). Landed: ts-progress 7614401 + c9ceb98 (console Progress
  page, fixes/PROGRESS.json). PREDICTIONS: P-032 (b) G-based items marked G-invalid (flick, I-042, F-085); P-031 G,
  P-035 G, P-036 G marked BLOCKED until I-042. Phone: P14 (W) -> user sitting (lead, owner `user`) -> ts-gesture I-042
  probe -> P-033 gain -> P-038 -> P12 -> P10 -> P5 -> P9. Caffeinate reminder ~18:30Z.

- **12:3xZ** Landed bd6762e (docs-2 P-029 row, F-059 corrections; doc-protocol-v2 layerPainted M148+, rAF 60 Hz, L13).
  P1 HIT (P-017), P2 miss (P-016b). Lead: P10 right after P-029 (same session, 10 min cooling); runs count only with the
  P0-cleared probe until T1a lands (T1a NEEDS-WORK B1, scrollHeight read). T8+ NEEDS-WORK (2 items). Gate 25 % (user).
  Caffeinate ends ~13:32Z (lead restarts). Pending: mw-stub rerun (finger batch), arch-claims layout verdicts.
- **11:5xZ** P0 CLOSED (P-023 neutral; A9 lifted for rAF-only loggers, lead 28aab81 + 747d80a, F-061; doc-protocol-v2
  carries it into protocol §3.2/§5.5 + unknowns-actions). User setup done (Developer Mode, UI Automation, cert); ts-gesture
  wda build holds the lease until <= 12:03Z, then runner: T10 -> P1+P2. P9 PASS (bbf2061). T8+ npm test in the short lane;
  C1 = lead, after T8+ review. Land: iphone-runner 8445b5f + eb107d7 (on 28aab81), docs-2.
- **11:3xZ** (mgmt-ops-5) Took over. Lead 11:30Z: P10 change approved (gh-cdwc vs gh-cdwc + A1 only if P1 passes, gated
  on the per-tween max edge leap; arch-lead writes it); user-ask bundle with the user now; ts-bench-gain (nit 1) being
  spawned; T2 only after T1a lands (nit 3 in its prompt). Landed since 11:24Z: none new (main 5a3c72b). Asked
  fix-nav-morph for the P1 ticket (gh-cdwc/gh-cdhid hashes + P-017 card). Caffeinate reminder ~12:50Z.
- **11:25Z** P0 logger-ysrc A/A RUNNING since 11:23Z (hand-patched runner yswin.mjs, aw1-10e immutable :5476; battery
  80 %, not charging, 39.4 °C logged per run). Next P1+P2 once fix-nav-morph sends gh-cdwc/gh-cdhid hashes.
- **11:24Z** HANDOVER to mgmt-ops-5 at the phone-back boundary (11:22Z). Runner has the §3 order and the P0 logger-ysrc
  ticket; ST-2 builds cleared (pr5; +1.13 s frame = `is-future-shrinking` transform none -> scale(1)). New topic N14
  layout-containment -> fix-scroll-engine (TOPICS). /10d parked until its phone check. User-ask bundle in "Next
  actions" item 2. Landed since 11:06Z: 4259051, fix-scroll-engine records 79202d8..b3e5df9, T3 stats 488b9df..e46c6bc.

- **11:17Z** Lead adopted arch-lead's ranked list (unknowns-actions.md §3, 197c2fa): phone P0 y-source A/A -> P1/P2
  countdown + P-016b -> OSS ca-check -> P3 ST-2 -> P4 y≈1960 F1/F3 -> P11/P12 containment -> P5 ST-1 -> rest. Holds:
  fixed-size, ghr85a, R7, R8 nav half, a1, h4. New: map-webkit-amplifiers (D2), ts-host-state (T8+). Phone still with
  the user. Runner has the new order.

- **11:16Z** Phone HELD by the user (lead): no phone calls until "phone back". Morph session: Composite carries the cost,
  ~78 layers/cycle, R1/R2 refuted. Display back-tag landed ddc3450 (display on since 06:22:55Z). OSS: P0 ca-check + P1
  (F3) approved, P2-P4 wait for P0; F-048 caveat (our T10 linear() blur may be main-thread). P-018..P-022 logged (ST-1,
  ST-2, ST-2d, P0, P1). Asked arch-lead for the "y-source A/A" ticket. fix-scroll-engine stack unlanded (needs review).

- **11:05Z** Tickets validated: y≈1960 F1/F2 as two 2-arm blocks after the morph session (lead confirmed), de-pm-morph
  hold-250 pair (P-016). U1 display caveat in DIRECTION (display-on from 11:01:46Z; DarkWake runs compare with nothing
  later); back-tag desk task -> fix-scroll-engine. U5/U7/U9/U2 routed (runner, ts-iphone-run, ts-analysis,
  doc-protocol-v2). Gesture tool landed 5d357b1; user asks bundled: WDA signing, Instruments pairing, finger batch.

- **10:48Z** y≈1960 NAMED: na (listeners armed at setup) 104/107 -> 34/35 ms, nb stays; P2b = style 34-42 + composite
  58-72 ms. fix-nav-morph: attribution card -> lead, then landable fix + ticket. ghr85a held (no ticket). Runner next:
  morph attribution P2/P3 + ghbn mech check (recipe from de-safari a4ce1669dd33aa4dc). PREDICTIONS P-011/012 hits.

- **10:46Z** Protocol v2 landed (670b4bf) and approved; executing §8.3 by hand. fixes/PREDICTIONS.md started (P-001..010;
  misses: gh>=25, ghb additive, src, noinert, h1<=34). F-047 Timeline clock fix PASSED. ghbn = render-bound LOCATED
  (waits for Instruments). Queue (lead): na/nb+P2b -> morph P2/P3 -> hero 2 blocks+P3b -> R2 bg -> /10d -> N12 -> R3/h3.
  New: ts-iphone-run, ts-analysis, ts-render-signals (I-032), doc-protocol-v2, arch-unknowns, de-unknowns-render/-ux.

- **10:33Z** noinert NOT a winner either (y≈1960: control 102 vs noinert 98 ms; the frame now carries only 2 tabindex
  writes -> cost is other IO-callback work). F-045 (y≈1250 scene gate) weakened by phone data (frames 35-37 ms, no flip
  in-frame): no build. Timeline clock fix (Page.disable+enable before Timeline.start; de-devtools/de-safari) -> runner
  1-min check, then a y≈1960 Timeline capture. AGENT_ROLES: naming `<role>-<topic>`, unique; general-purpose workaround.

- **10:27Z** Lead: peer-to-peer mode, mgmt-ops = hub (F-046 directory above; AGENT_ROLES "Addresses and peer work").
  noinert (fix-nav-morph 213ca19, y≈1960 inert fix) queued right after the morph driver round. y≈1250 frame candidate
  = .commission scene gate flip (F-045) -> runner adds `data-start-selling-scene` + uncapped per-type counts to the logger;
  fix-scroll-engine owns it if it confirms. /10d: no Chrome re-measure; phone check last, then reviewer (ask lead).

- **10:25Z** mw10e-src NOT a winner; y≈1960 trigger = morph panel `inert` removal (F-044 corrects F-043; logger cap 12/frame).
  PROTOCOL V2 IN PROGRESS (arch-lead, research/architecture/measurement-protocol-v2.md; ops input sent: ablation labels
  checked by computed style, uncapped per-type loggers, warm-up run, thermal checks between rounds, phone slot tickets,
  immutable served snapshots, ABBA vs one control + pre-registered prediction). Queue unchanged until the lead approves.

- **10:17Z** hero-A: h1 -11-13 ms at the flip (h1v2 52 vs P 65, h1 45 vs P2 56), <= 34 ms 1/6; y≈1250 41-51 ms frame in
  all builds (unowned). fix-hero-exit rebasing (between blocks). Runner on mw10e-src. NEW read-only research (user
  request): arch-devtools (research/architecture/devtools-methodology.md), de-devtools
  (research/design-engineering/devtools-render-metrics.md); neither measures. Runner's 2 h background limit kills servers.

- **10:08Z** (timestamps from `date -u` from here on; my 09:15-09:58 stamps ran ~10 min fast) main acce613 verified
  (npm test, test:chrome 9/9, canary 75.9/75.2 = the ~76-78 band, watch unchanged); rebase GO sent to fix-hero-exit (after
  hero-A), fix-scroll-engine (done, 77e48cf), iphone-runner (done, c45d086 write-up -> LAND). fix-nav-morph still held.
  /10d Chrome neutral (p95 flag gone) -> review recommended after its phone check. Phone cooling; queue in DIRECTION.

- **09:58Z** Landed: ts-snapshot follow-ups (..d1c324c, user approved enforcement parts), de-morph rev 1043651, de-apple
  1babddb, my bf7896d. Lead's tests + A/A canary on main RUNNING: announce NO rebase until the lead confirms. N10 dropped;
  /10d gets one normal slot after the tests (rebase on d1c324c first). Queue: morph-2 (ghb, ghbn, clip probe) -> hero-A
  -> hero-B -> apple-ref (+ idle Timeline) -> R2 -> N12 -> img-sourcing -> ts-gesture V0. Caffeinate: lead ~10:10Z.

- **09:52Z** e1/e2 CONFIRM: y≈1960 frame = morph IO img-src burst (>= 12) -> fix-nav-morph (#2), N10 a-d to the end
  (F-043). R2 clip probe needs the user's look (screenshot misses backdrop-filter; asked lead). R3 named (vinyl under mask,
  F-041) -> owner question with lead. Asked lead: /10d normal slot? Morph-2 ghb running. F-042 warm-up control.

- **09:33Z** Lead: fix-nav-morph built ghb (gh + no blurs, diagnostic) + R2 clip-path/backdrop probe page (ac40b3f,
  f63fc70) -> morph-2 slot right after e1/e2 (sent to iphone-runner). de-morph resumed to reconcile its model with the
  driver numbers. NEW (user request): `de-apple` design engineer, apple.com's rendering math ->
  research/design-engineering/apple-math.md (read-only, <= ~10 polite fetches into the scratchpad). Caffeinate: lead ~10:10Z.

- **09:30Z** Morph block done: gh ≈ gb (p50 26/29 vs g 35 ms), neither R1 nor blur dominates; fix-nav-morph has details.
  Phone heat pause ~12 min, then e1/e2 (control :5462, e1 :5463, e2 :5464, hashes match) -> hero bisect -> apple-ref (user
  request, live apple.com, write-up in apple-verify.md "iPhone Safari check") -> N12 -> N10. fix-nav-morph keeps holding
  rebase (e1/e2 + N12 serve from it). /10d prototype se10d-aw1 e920843 built (mech clean); fix-scroll-engine on R2.

- **09:25Z** All three design notes on main (5c4fc37, 7576f74, 7d60f9f); DIRECTION records the lead's ranking (gh/R1 ->
  y≈1830 IO -> h1 flip -> h3 countdown strip -> middle R2 -> h2). Phone queue: morph+gh -> e1/e2 -> hero bisect (v7, v6,
  v4, v5) -> N12 -> N10 a-d. h3 = next spawn candidate (fix-countdown-idle-raf) when a phone slot is in sight; ask lead.
  ts-snapshot ACCEPT, 3 fixups, then user OK + land; bench toolsSha changes -> re-calibration announced with it.

- **09:15Z** Hero block done (P2 /10e small gain; hero v2 kills y≈50 but y≈700 +10 ms WebKit-only, F-035) -> hero bisect
  queued after morph. Morph block partial (phone throttled 09:07, resumes ~09:23): moving p50 ~30 ms, fb n=1 p95 45 vs f
  53-64. de-morph done (5c4fc37): cost = full repaint of resized layers, not blur -> h-fixedpanel ablation (fix-nav-morph)
  joins the morph block. F-034 (freeze served overlays), F-036-039 (de-morph). fix-scroll-engine rebased 272f6c7 + sparse;
  GO /10d prototype (no normal hold before the N10 verdict).

- **09:00Z** (mgmt-ops-4) Lead: 4edb872 npm test 495/495, test:chrome 8/9 (fix-ab test CONTAMINATED by environment,
  topProcs name WindowServer/duetexpertd/zed/iTerm2/claude; accepted as an environmental pass). arch-finger plan landed
  2226d51 (WDA/XCUITest real touches); ts-gesture building gesture.mjs + wda.mjs (measurement code -> reviewer before
  landing); user setup pending. iPhone queue += ts-gesture V0 (~15 min) + V1 (~60 min) after the morph block, when ready.
  10 agents active: goal-metric holds wait for a quieter host or accept requeues (design engineers end in ~1 h).

- **08:55Z** HANDOVER. Snapshot landed (4edb872): all worktrees rebase + `baseline.mjs sparse` between steps; done:
  fix-hero-exit (7169a6a, 9e84199), mgmt-ops-2; HOLDING until their iPhone block ends: fix-nav-morph, fix-scroll-engine
  (iphone-runner serves from them). Base `aw1-10e` (/10e F-030 hotfix landed 60f66b6). Morph: g fixes the jitter, not the
  lag (rendering); scripted driver + mw10e-f/g/fb/gb/ge/gc queued on the phone as #1 after the hero block (B/P/P2/P3).
  Marquee idle check clean. Canary-fps watch still open.

- **08:33Z** Landed: ts-i021 stack 43e40ce (B-E + I-031; canary PASSED, npm test 462/462; I-027, I-031 RESOLVED), I-018.
  Morph root cause (fix-nav-morph): pin target 5312 > maxY 5220 → re-pins every frame against the bounce; candidate
  mw-g-pinclamp-osb waits for the user's finger block (lead). F-030: /10c face will-change churn ~1,500 writes/s at idle in
  the hero → fix-scroll-engine hotfix se10e (lands after parity + short review). hero-exit owns y 0-900 incl. F-032
  people-o. WATCH: canary baseline fps 78 / > 20 ms 57 vs ~92 / ~25 at 04:25Z (n=1, iPhone serving at the time).

- **08:11Z** USER FEEDBACK: no felt difference baseline vs aw1-10c on the iPhone; lag at END (morph pin at y 5220 runs
  10-18 fps under a finger, > 50 ms 50-75/pass) and TOP (hero y 0-900). New order: morph (fix-nav-morph resumed) →
  hero-exit (resumed) → N10. Landed: I-018 d61231e (traced attribution: 5 frames > 34 ms; gtag named; "other" class →
  fix-scroll-engine diagnostic on spare capacity), I-031 reviewed, docs. ts-i021 rebasing B-E + I-031 on I-018 → one
  test:chrome + one canary. npm test ~280 s (watch after B-E). Baseline freeze (ts-snapshot) in progress.

- **07:31Z** iPhone BACK (iphone-runner owns it; I may message it directly for scripted checks, finger tests via lead).
  iPhone goal check baseline → aw1-10c: > 50 ms 5→3, > 34 ms 16→9, fps 52.8→57.1; #1 target ~106 ms at y≈1970 → N10
  (fix-scroll-engine, 4 phone ablations d,c,b,a built d24a656). Chrome: page-owned > 50 ms 0 on aw1-10c, 1 vendor gtag
  frame (user-facing, lead). Landed: Q3 note d33d957 (wave1-dry ENDED), I-030 8bab8b7, docs. N13 CLOSED (0/49). N12 + #6
  land after finger verdict. I-031 opened (other CPU 20-26 % mid-hold) → ts-i021 top-5 process log after D/E.

- **06:32Z** Landed: ts-bench I-028 follow-up 1e2c402 (ts-bench ENDED for good), docs b586b9a + ff00155. N13 forced-toggle
  probe: 0 storms in 2 x 41 toggles → agents-ask visual NOT the trigger (F-027 supersedes F-026); N13 storm-catch hold
  (≤ 24 fresh loads, traced/untraced alternating) queued #2. N12 A/B `--on aw1-10c` starting 06:31 (waited 14 min: I-030,
  shorts pass a normal whose gate isn't settled; ts-i021 after I-027; workaround: no new shorts while a goal normal is #1).
  Bench pilot: tool OK (styleWrite Proxy counts), VACUOUS/FAIL rows are spec choices. Lead caffeinate until ~08:36Z.

- **06:16Z** Landed: /10c 8f9ebe5 (review-10c ACCEPT-WITH-NOTES; counts "> 50 ms 2 → 1 in the measured window, load-time
  cost bounded by mech probe, iPhone pending"), docs 1b8aeac + cc09344. Wave-2 base `aw1-10c` (hashes confirmed). E3 →
  F-026 storm → N13 (fix-scroll-engine, forced-toggle probe, before /10d). Part 4 done (diagnostic). I-018 NEEDS-WORK →
  CDP metrics opt-in, validation = one traced run + test:chrome. 05:56Z contamination = ts-i017 e2e outside the lock
  (rule now in CLAUDE.md). wave1-dry: pilot-only spec (B) + Q3-final requeue.

- **05:58Z** Landed: N11 fea23a5 (mechanism only), docs 7542538, I-028+I-029 4f5667d (ts-bench ENDED; review-i028
  ACCEPT-WITH-NOTES → one ts-bench follow-up commit, tracked in I-028 notes). /10c hold 05:39-05:46: > 50 ms 2→1 BETTER,
  > 34 ms 4→3 noise, F-011 gone 5/5, p95 +0.8 ms WORSE flag; review-10c on a7b95d1, lead lands on ACCEPT. Lead started the
  I-018 gate early (ts-i017 rebasing f71ee42 → reviewer → A/A on/off hold ahead of q3). Starvation note: shorts drained
  ahead of /10c ~13 min → ping lead when a goal-path normal waits > 10 min (mgmt-lead iteration 3 item).

- **05:17Z** (mgmt-ops-3) Lead: npm test 0e8f288 414/414; test:chrome 7/8, bench.chrome FAIL → I-028 (ts-bench, styleWrite
  probe vacuous). GO sent: ts-i021 (I-027 + I-026 reopen; no file overlap with I-028), wave1-dry (Q3 only; bench pilot held
  until I-028), fix-scroll-engine (/10c `--on all-wave1`). N11 hold 05:05-05:15: clean (0/10), goal metrics FLAT
  (> 50 ms 2→2, > 34 ms 3→4); waiting on owner phases.mjs readout before land/no-land. q3 took the lock 05:16 ahead of
  scroll-engine (normal ≤ 10 min). kpi friction: no alarms; warns IPHONE-PARKED/STALE, STRAY-CHROME (MCP Chrome 10.9 h).

- **05:02Z** GOAL HOLD done (all-wave1 42f4033 → main 0e8f288, F-022): > 50 ms 3→2, > 34 ms 5→5 within noise; fps
  93.8→110.6 hint; left > 50 ms = gtag (N11) + F-011 render frame (/10c). ts-bench batch landed (bench on main),
  ts-bench ENDED; lead's npm test + test:chrome on 0e8f288 running → then GO ts-i021 I-027. Wave 2: N11 queued (normal,
  GO given) → /10c → I-018 (f71ee42 review + A/A cdp-metrics on/off + test:chrome) → N12 → hero-exit → countdown 05/08
  → E4 (folded into attribution). DIRECTION updated (mgmt-ops/docs-2). apple-verify hold 5 done (report pending).

- **04:25Z** Landed: I-023/I-024A 48ace89+772e675+85fdeac, I-026 93b4af2 (holds keep the Mac awake), cap docs b93ec5f (npm
  test + commit lease 300 s). Canary PASSED on 93b4af2 (A/A runs 1 clean, test:chrome 7/7); I-017/22/23/24 RESOLVED,
  I-016 parked (e4 user/hooks, f P3). GO sent to wave1-dry 04:2xZ (goal hold, --max-seconds 1200). NEW floor: canary
  baseline fps 92, > 50 ms 4, > 34 ms 5 (vs ~75 fps pre-gate): never compare to old baselines. Mac slept 04:04-04:20Z
  with the lock free (I-026 gap → reopen note: assertion while anyone is QUEUED; lead caffeinate 4 h again; user asked
  about `pmset -c sleep 0`). Next: apple-verify ~4 min hold → N11 → /10c → N12; ts-bench rebase (lead) after the hold.

- **03:43Z** I-023 chain: 48ace89 (review NEEDS-WORK) + 772e675 fixup (review ACCEPT) + a 3rd commit (verify installs its own
  SIGINT/SIGTERM/SIGHUP handlers; re-entered holds had none and left Chrome running) committing now; test:chrome after it
  (772e675 was 6/7). Lead lands all 3 when 7/7, review-i023 re-checks the 3rd (1 file), then I-026 rebase, canary
  (`ab --aa --runs 1` + test:chrome), bench rebase (fake-chrome.mjs; review-bench ACCEPT-WITH-NOTES), then GO wave1-dry.
  Wave 2 ready: N11 (parity incl. pagehide flush), N12 v4 (parity 0/5, "20-34 ms band only"), scroll-engine /10c in mech-c.

- **02:55Z** Landed: I-021 0f29e7b+d10b132 (RESOLVED), I-020 4b1034e (RESOLVED), I-024B e7ce0e4, CLAUDE.md lock
  rules 10f7bee, N3 docs 6a0db1a, handover b579b78. I-027 (P2, ts-i021, after I-024A) opened. ts-i017 I-023/I-024A ETA
  ~03:35Z + queue (02:37Z probe: idle Chrome survives 80 s; sleep explains 1953 s). scroll-engine mech10: 339 ms LoAF
  in /10 only + layers 304->741 (re-run). N12 v2: nav reads ~0, parity desktop 24/168 (v3). N11: flush edge re-probe.
- **02:46Z** no change; ts-i017 moved to #1 by lead (02:37Z).

- **02:34Z** I-023/I-024A (P0, ts-i017) no sha; ts-i017 not queued yet (lead moves it to #1 on queue). No ALARM,
  host QUIET. NEW I-026 (env): Mac Maintenance Sleep/DarkWake during holds stalls timers (explains 933-940 s
  verify-fake); rec caffeinate/pmset = user. Land: mgmt-ops docs 6a0db1a (N3 rejected). User: I-026, Spotlight,
  FW_TOOLING hook, iPhone.
- **01:40Z** first digest after restart; incident candidate (hook npm test under load) became I-024 (lead).

## Next actions for the next mgmt-ops (in order; mgmt-ops-4 -> mgmt-ops-5, 11:24Z)

How mgmt-ops-4 worked (keep): **hub mode** (lead 10:35Z): owners, iphone-runner and research agents come to mgmt-ops;
the lead only lands, resolves incidents, reorders locks, spawns and talks to the user. Validate slot tickets (protocol
v2 §2.5: build + hashes, ONE control on the same base, driver, one question, prediction id, if-X-then-Y, probes,
minutes; warm-up per served port, U5), log every prediction in `fixes/PREDICTIONS.md` before the run and the result
after it, route results to the owner + the question's author, keep DIRECTION / handover / directory current, send LAND
BATCH shas. **Stamp times from `date -u`** (mgmt-ops-4 drifted ~5-10 min ahead twice). Wait with
`sh <scratchpad>/mgmt-ops/tick2.sh 150-240` (returns on incident changes; prints lock + phone state); messages arrive
between tool calls.

1. **iPhone order** (updated 13:5xZ by mgmt-ops-5; lead-ranked; 14:0xZ: P4 paused for a user blind swipe A/B of the
   countdown fix, 3 real-page pairs = first v3-style F stage): DONE: P0 (P-023), P1 (P-017 HIT), P2 (P-016b miss),
   F2 pre-check, finger batch F1-F6 (F6-try3 apple.com 0 >50 / 1 >34 moving; F6-try2 ~80 Hz stretches = F-071),
   ca-check wca2 (captured, `window.__ca` filled; analysis waits for a free chrome-measure), **P-029 HIT** (13:17-13:25Z),
   **P3 HIT** (13:35-13:44Z: P-019 re-dur + re-keep HIT, baseline-A third frame unresolved; P-020: reveal-end Layouts
   fire at rest = Card 4), **pacing v2 s1** (13:45-13:50Z: late-gap clip 8/8, P10 RELEASED). **NOW:** P4 ~14:00Z (A = F1
   arm-load P-013, B = F3 arm-scope P-022; T1a on/off A/A in its warm-up slot, definition from ts-iphone-run) -> P11
   Block A (P-028, ~40 min; Block B conditional) + **P14** (P-025, ~47-48 min; C aw1-10e, V1 st4-strict, V2
   re-contain-js `<scratchpad>/hero-exit/snap/re-contain-js`; separate sentinels) -> P12 -> **P10** (P-024, own gate: P1
   then the phone block) -> P5 ST-1 (P-018) -> P9 (P-026) -> **P-030** listener split (~25 min) -> **P-031 G** (rAF-rate
   pages; earlier if the phone idles) -> hero-B -> R2 bg -> /10d -> N12 -> P6-P8, P13. re-keep-op gain block: placed
   when fix-hero-exit sends its ticket; right BEFORE it, same session: one untimed attribution run at rest, re-keep-op vs
   re-keep (LayerTree read of the card + idle Paint events over it; ticket P-033 VALIDATED 14:1xZ, after P11 + P14, lead: no
   jump ahead), because a non-composited opacity-0.999 card may paint
   through a transparency layer on every repaint (UNRESOLVED; F-075 CONFIRMED the premise: presence flip none<->value in
   StyleDifference, claims-audit §2.8 762fc40).
   **14:1xZ:** P4 paused for the user's cdwc blind swipe A/B (pairs on mw10e-cdwc; pair 1 = "same" saved; pair 2 page 2
   running after a Safari-inspector stall); if it stalls again the phone goes back to P4 and the swipe test is
   rescheduled (lead). **review-cdwc NEEDS-WORK** (evidence + wording only): fix-nav-morph runs a short-lane
   inertness probe (panel scene paused, 0 faces with will-change at every 250 px step, both builds) + DPR 3 frozen-clock
   countdown crop (expect 0 %); a clean n=5 `--on aw1-10e --frame-log` only if the probe fails. Lead B3: NO waiver ->
   **P-032 G block aw1-10e vs mw10e-cdwc right after P4** (card from fix-nav-morph pending). P-029 (4) moving p95
   recorded OUTSIDE [28, 45] on the better side (median 23). **F-076 (UNRESOLVED) -> P-034 gate** on any countdown-ca
   ticket; put it in the fix-countdown-idle-raf spawn prompt (de-oss-map waits on it).
   **Swipe A/B (cdwc F stage) PAUSED after pairs 1-2 (both "same"; user feels the lag at the hero and the page end; tab
   stalled twice, some recordings lost); pair 3 moves to ts-user-console's console (iphone-runner keeps the key so it
   stays blind). User-facing steps go through the console once it lands, not the lead's chat.
   **LAND-REQUEST RULE (lead 14:3xZ, all agents):** before asking the lead to land, rebase on CURRENT main with a CLEAN
   tree (git status empty: commit or stash every edit); then send branch name + "tree clean, rebased on <main sha>" + SHAs.
   The lead only fast-forwards; a dirty tree or stale base bounces the request. Lead 14:3xZ also: ef802b9 (phone minShift
   4 ms, whole-ms medians) CONFIRMED, lands after ts-analysis adds the phone-platform guard (infer phone from meta.device,
   warn on explicit chrome) + review-stats OK, with doc-protocol-v2's §5 text; doc-protocol-v2 sends the lead replacement
   text for the CLAUDE.md phone-threshold line + Sentinel bullet, and updates fix-reviewer check 15. Spawned:
   ts-user-console, ts-lock-bundle (item 7b + sleep wording; branch worktree-agent-a413c9626c75bd1a3).
   **USER PRIORITY (lead 15:22Z, "make simulator task as highest priority"; overrides every order below):**
   chrome-measure: ts-sim and arch-sim before fix A/Bs and other toolsmiths (lead moved ts-sim to #1; whenever either
   queues, tell the lead to move it to the front; I-035 open, so don't trust "moved by lead" when the entry already
   sits at its own position); arch-sim fidelity holds are normal holds and outrank fix measurements. Phone: arch-sim
   real-device reference runs, if needed, go next after the current block, ahead of P-032 / P14 / P-035 (15:2xZ
   mgmt-ops-5 asked arch-sim for a ticket to iphone-runner by 15:31Z; none -> P-032 at 15:31Z, arch-sim after its
   block). Reviews/landing: anything ts-sim needs first (ts-analysis deviceOf = already on main a1fd3bc: "simulator"
   is its own device, stats refuse to pool it with iPhone/Chrome, exit 2); tell the lead THE MOMENT sim.mjs is ready
   (he spawns its reviewer). Broadcast 15:2xZ to arch-sim, ts-sim, iphone-runner, ts-analysis, ts-iphone-run,
   ts-lock-bundle, fix-nav-morph, fix-scroll-engine, fix-hero-exit, arch-claims, review-render-signals.
   **15:2xZ state:** P11 Block A DONE (P-028: HIT mechanism, MISS ms, NULL frame time; Block B DROPPED by the owner;
   lc-cq3 not a candidate) -> P14 after P-032. P-032 CLEARED: fix-nav-morph's owed (A)/(B) in the row (2 forward
   tweens/run, (4) kept; scorer <scratchpad>/fix-nav-morph/p032-score.mjs).
   **16:2xZ (resume after the usage reset):** landed f86290e (ts-analysis), c14b6b0 + a68376e (sim.mjs, review-sim
   ACCEPT-WITH-NOTES, npm test 716/716), 19a383d (arch-sim). Simulator verdict F-084: classes 1, 2, 4 not usable, class 3
   lead generator only, class 5 untested; FP-6 (gesture) not funded for now. Swipe pair 3 = "same" (0/2 V, catch passed):
   cdwc not felt, landing rests on P-032 alone. F-v3 run 1 = C-002 (fv3-set1.json), run 2 = C-004 (user, 16:2xZ). Phone
   next: C-004 -> cooling -> P-032 -> P14 -> P-035 G -> P-036 G. User question "phone over Wi-Fi, no cable": lead answered
   UNRESOLVED, check offered after C-004, HOLD until the user replies. I-032 B1 (paint units/layerScale) open with
   ts-render-signals. Digest to the lead every 30 min.
   **16:5xZ:** P14 (P-025, V1 = st4-noswap) and P-038 (PoC 2 blur-cubic, reveal only, behind P-033 gain) VALIDATED
   after second read. F-v3 scored per tester (7c95689): passive NOT FELT 2/4 for the user and a second tester -> P-035 G
   alone decides. User question "phone over Wi-Fi, no cable" ANSWERED (lead + user 16:45-16:53Z, OBSERVED, in I-040):
   cable out, devicectl sees the phone over the network but idevice_id -l/-n and iwdp :9221/:9222 show 0 for 1.5 min;
   cause UNRESOLVED (likely usbmuxd vs CoreDevice/RemoteXPC); decision: stay on the cable, no toolsmith. I-041 (lead):
   ts-lock-bundle's unlanded (f) co-hold code broke chrome-measure exclusivity 16:28-16:45Z; (f) tested on a temp
   FW_STATE_DIR only until it lands; both test:chrome runs in 16:38-16:45Z void; ts-iphone-run reruns npm test (short
   lane) before its land; ts-render-signals' I-032 land needs a clean test:chrome. Caffeinate renewed until ~18:45Z.
   **17:1xZ:** P-032 attempt 1 VOID (0 valid runs, WDA /actions 8-15 s per stroke -> I-042, env, blocking for every G
   block, owner ts-gesture). G blocks (P-032, P-035 G, P-036 G, P-031 G) WAIT for I-042; phone order meanwhile: P14 (W,
   ~17:17Z after cooling, iphone-runner rebased on main for I-037 b80a767 + probe v3, tools sha in meta) -> P12 -> P10
   -> P5 -> P-033 gain -> P-038 -> P9. Landed: I-035 (8935a7d), I-037 (b80a767, RESOLVED), T1a series, lanSafeUrl
   (7ec95a5); I-041 RESOLVED ((f) shelved on local branch ts-lock-bundle-f-shelf, never lands). Lead: NO redaction of
   the old fixes/iphone-wave2/raw LAN hosts (evidence integrity; user may overrule); new committed files carry none.
   **LATER (not urgent, needs a fix-reviewer pass before landing):** ts-lock-bundle 65903b9 docs, e143153 (a)(b) gate
   wake, 2f7751c `run --no-timing`, 3f2b100 (d) served-check retry (measurement-code pre-check), 1369205 (c)(e)
   HOST-DISPLAY-CHANGED; test:chrome for (d)/(e) only after they land (needs main's lock code).
   **17:2xZ PHONE ORDER (lead, supersedes 17:1xZ):** P14 (W, running) -> USER SITTING (lead holds the lease as owner
   `user`: render test A = original baseline vs B = best build now, mw10e-g + cdwc + arm-scope-c (+ re-keep-op if it
   combines cleanly), iphone-runner prepares; NOBODY touches the phone) -> ts-gesture I-042 slot (~15 min) -> P-033
   gain -> P-038 -> P12 -> P10 -> P5 -> P9. After I-042: P-032 G first (fresh block 1, full cap, stop at > 2 WDA
   voids), then P-036 G, then the next finger sitting. I-042 interim (ts-gesture): G strokes play as ~50 ms flicks
   (pointerMove durations dropped) -> ALL G data so far is invalid as a finger proxy; G stays blocked. I-035 RESOLVED
   (8935a7d, npm test 730/730). Console server stopped at its 2 h limit 17:16Z (lead restarts). After ts-progress lands:
   keep fixes/PROGRESS.json current on every P-row result, verdict or land.
   **SIM ROUTING (user rule, table approved by the lead 17:5xZ):** phone = P14, user sitting, ts-gesture's ~5 min I-042
   confirmation, P-033 gain, P-038, P10, P5, P9, P-030, hero-B, R2 bg, /10d, N12, P6, P8, P-032/P-035/P-036/P-031 G,
   finger sittings, P-037, P7 (Instruments), P13 (device memory), WDA re-sign before 10-08 (outside blocks). P12 = desk
   first (tldump on P11/F1 captures), phone only if they don't cover y≈2678. SIMULATOR: I-038 repro/fix check
   (ts-iphone-run), P-032 (b) mechanism re-checks (fix-nav-morph; only if WDA on the Sim plays strokes as written, ask
   ts-gesture), F-076 / P-034 face-layer check (fix-nav-morph, after cdwc lands; phone only if it decides a fix),
   de-unknowns-ux cancelable/DOM part (its timeStamp C2 part stays phone: Sim touches are host HID), R2 clip/backdrop
   look, T10 / Instruments-lane tooling dry runs. Told: ts-iphone-run, iphone-runner, ts-gesture, fix-nav-morph (acked);
   de-unknowns-ux was resumed by mistake before the lead said "live agents only". **17:5xZ de-unknowns-ux:** C2 phone
   slot after P-035 DROPPED (C2 read from the saved F drag visits, 68af31a, F-087: touch timeStamp taken before
   main-thread dispatch, moves coalesced while blocked; OBSERVED, source UNRESOLVED, arch-claims has it; P-035's
   N T T N N T drag runs repeat it); cancelable is logged by P-035 G on the phone at no cost, no Sim job. **No Sim touch
   driver exists yet** (`sim.mjs gesture` not built, FP-6 untested; `iphone.mjs gesture` with FW_WDA_URL at WDA-sim
   still asks for the iphone lease): every Sim job that needs strokes (P-032 (b) re-check) waits for one; ask ts-gesture.
   **PROGRESS.json (ts-progress, landed 7614401 + c9ceb98):** After every P-row result/verdict/drop/land: update
   fixes/PROGRESS.json (changes + checks[].result + next + updatedAt), run `node tools/console.mjs progress --check`,
   land with the docs batch; the page flags ledger results missing from it. Schema in the header of
   tools/lib/progress.mjs (fw-progress/1); plain words outside `details`; every `best[]` number has tag + driver in
   plain words + ref; updatedAt never later than now; updatedBy = own name; no URLs/IPs/hosts/device ids/names; when
   I-042 lands or a G block runs, update `next` of cdwc, f3-arm-scope, nonpassive-touch.
   **PHONE ORDER (lead 14:2xZ, supersedes the NOW line above):** P4 (started ~14:2xZ; block A + T1a A/A PASSED (ABBA aw1-10e S, on vs off: dt>50 3 vs 7, dt>34 18 vs 21, fps
   57.4 vs 57.3; T1a now absolute; minShift revisit CLOSED: HL p95 on-off +0.48 ms, n=2/arm (crude), stays 4 ms,
   ts-analysis 14:3xZ), 10 min, block B) -> P-033 step 0
   (lead 14:4xZ: after P4 B's end sentinel: F1 edge Timeline attribution run (fix-nav-morph), then P-033 step 0) -> 10 min cooling -> P-032 G cdwc (VALIDATED, ~20 min) -> 10 min cooling -> P-035 G-v3 (pacing v3, no user,
   ~20 min lease, filler; F-v3 waits for the user console) -> F3 G touch A/B aw1-10e vs mw10e-arm-scope (pacing v3 urls
   mode for F; G = P-036 VALIDATED 14:5xZ, runner opens the arms directly; lead 14:4xZ: F3 forward, F1 stops; P4 done
   14:45Z, phone 40.9 °C; P-033 step 0 PASS 14:47Z) ->
   P11 Block A + P14 -> P12 -> P10 -> P5 -> P-033 gain (VALIDATED; step 0 fills any free phone gap) -> P9 -> P-030 ->
   P-031 G -> hero-B -> R2 bg -> /10d -> N12 -> P6-P8, P13. P-033 "within noise" -> bundle candidate, not standalone.
   **mw10e-cdwc landing branch fix/mw10e-cdwc 6652ad9** (on 77c480e): review-cdwc round 2 resolved B1/B2/B4, B5 fixed; lands only
   after P-032 PASS (rebase on current main first); no further review round. P4 block A (P-013) done 14:25-14:30Z.
   **F-080 CONFIRMED (arch-oss-survey, 14:5xZ):** on the phone linear() freezes during main-thread blocks (transform +
   filter), cubic-bezier and sampled WAAPI keep moving. Routed: PoC 2 blur-easing-cubic -> fix-hero-exit (h1 owner);
   PoC 3 countdown-ca -> fix-nav-morph after cdwc (first attribute the countdown's 1 Hz idle spike; with P-034);
   morph-ca -> fix-nav-morph (blur/opacity/scale usable; backdrop undecided, needs a larger-contrast lane).
   arch-oss-survey: no unlanded commits. Step-0 side observation (idle whole-view Layouts at rest on #people: rotator
   ~25-30 ms per tick; ~750 x 0.75 ms per 20 s from a per-frame RecalculateStyles) -> fix-scroll-engine + de-pm-hero.
   **NAMED 15:0xZ, F-081 (OBSERVED, 1 run/arm, time association):** of ~795 small Layouts / 20 s: countdown digit spring
   rAF (re-keep JS L4039, started by the 1 s setInterval L4142; on screen, so the off-screen gate rightly keeps it) ~320;
   accent stroke-dashoffset 0.9 s animation (CSS L1274-1280, JS timers L3858/3864/3869, ~5 cycles / 20 s) ~440;
   avatars-exit ~24; other 9. Cost ~165 ms / 20 s (~0.21 ms each, ~0.8 % main thread), no long frame -> no ticket now
   (fix-scroll-engine); option: 2-3 min untimed rider (accent off + spring snapped, rest at y 904); accent fix idea:
   animate a mask/clip transform instead of stroke-dashoffset. Why stroke-dashoffset invalidates WebKit layout:
   UNRESOLVED. **CORRECTION 15:0xZ (fix-scroll-engine): the spring is REFUTED as the dirtier** (co-occurrence inside
   accent windows; spring frames have small Layouts 13 % vs 23 % without; it raises only ScheduleStyleRecalculation);
   residual outside accent windows (~65 / 7.6 s) leans to the rotator (~40 % within 60 ms of L11571 vs ~10 % expected).
   Lead: F-081 rider skipped. de-pm-hero b050627: §7.9 risk VOID at rest; D3 rotator prediction HIT (2 per cycle).
   **Lead 15:0xZ:** arch-claims owns the Instruments render-hitch lane definition; ts-iphone-run builds its tooling after
   I-037 + the probe v3 fix (not urgent). P-037 (PoC 3 idle attribution, fix-nav-morph) VALIDATED as filler after
   P-036. ts-lock-bundle implements (f) shared short holds next (short lane waited 17 min > 15 min line), reviewer gate
   kept. F-081 residual by Layout root (fix-scroll-engine, all < 5 ms): ~23 near rotator ticks = 104x32 subtree at
   (58, 2054) inside Composite-after-paint beside a Cloudflare-beacon PerformanceObserver callback (image-load size
   invalidation after the src swap? UNRESOLVED); ~31 RenderView-rooted after script-less style recalc (some CSS
   animation, UNRESOLVED); ~7 countdown tick = 398x52 subtree at (16, 920).
   **USER CONSOLE LIVE (lead 15:2xZ; tools/console.mjs 4698218, CLAUDE.md 9666bba; server from the lead at
   localhost:5559):** EVERY user-facing step goes through `node tools/console.mjs post` (then `wait --until
   started|recording|done|answered`), never the lead's chat. iphone-runner posts swipe pair 3 (redo page 1 + page 2, key
   in --meta) and de-unknowns-ux F-v3, but per lead 15:3xZ ONE BATCHED RESTED SITTING: swipe pair 3 + F-v3 + P-031 F +
   P-036 F posted together once every agent-side flow is ready and a ~20-25 min phone gap fits (after G-v3 P-035 and
   P-036 G); mgmt-ops tells the lead when posted (one heads-up to the user). Waits: wait.mjs / lock.mjs wait only, no
   sleep or until-grep loops (lead 15:3xZ). iphone-runner stops its old serve.mjs processes (ports 54xx) not needed for
   P11 / P-032 / P14 / the sitting (own processes only; 5173 is the user's).
   **P-032 BLOCKED 15:1xZ by I-038** (morph-log hook = 2nd inspector connection hangs the gesture tool; iphone-runner's
   I-039 is a duplicate -> lead merges); lead approved amendment (b) (t0 = first defaultPrevented touchmove per end push),
   second-read OK 15:2xZ with 5 conditions (see the P-032 row); runs hook-free after P11 Block A (running ~15:20Z) + cooling.
   Caffeinate: lead renewed 16:4xZ for 2 h -> ends ~18:45Z, remind ~18:30Z.
   **I-037 [open, blocking]:** iPhone tools pick a background app's about:blank web view instead of Safari's tab.
   Lead 15:0xZ: 7b(f) option (A) not taken to the user (rebases change the staged tree; enforcement layer); (f) stays a
   design in ts-lock-bundle's ticket; tell the lead if short-lane waits exceed ~15 min again.
   **F-076 / P-034 owner = fix-nav-morph after cdwc lands** (lead: same countdown code; no fix-countdown-idle-raf spawn).
   Toolsmith bundle: lead spawns after ts-wait's npm test on main (c4a1ee2) passes. ts-user-console (tools/console.mjs:
   user-facing step console, agents `console.mjs wait <id> --until started|answered`) in progress.
   **arch-sim** (iOS Simulator fidelity): normal chrome-measure holds <= 420 s, announced to mgmt-ops each time;
   `--port auto`; own iwdp `-c null:9231,SIMULATOR:9232` (iwdp attaches only configured devices, so never the phone);
   no iphone lease; results tagged meta.device "simulator".
   **ts-analysis eea3c06 -> review-stats NEEDS-WORK** (cross-block driver pooling unwarned; "near thresholds" line pools
   frames across runs, §5.3): ts-analysis fixing; lands only after ACCEPT. Protocol questions (lead 14:1xZ): (a) A5
   "threshold-sensitive" wording vs code (code flags when gt46 or gt54 differs from gt50, stricter) -> doc-protocol-v2;
   (b) phone p50/p95 minimum shift -> arch-claims DECIDED 14:2xZ: 4 ms (the ±4 band; phone stamps 1 ms,
   off-grid, claims-audit §2.3), phone median futility in whole ms (not ticks); revisit after P4's T1a A/A (|HL p95
   shift| >= 4 ms raises the floor); Chrome unchanged; sent to ts-analysis for the eea3c06 fix. (a) DONE doc-protocol-v2 157eeea (docs follow the code: threshold-sensitive if EITHER twin's verdict differs; near
   bands half-open (30, 38] / (46, 54]; rAF-rate text per 6f71f51). Lead-only: CLAUDE.md phone line wording, CLAUDE.md
   "Sentinel" bullet vs the Timeline-block sentinel, fix-reviewer check 15 phone tick forms.
   **Pacing v2 (de-unknowns-ux e64b6de, pacing-result §4):** verdict accepted on intent (§0/§2), OBSERVED, one user, not
   rested; §3 sign erratum added with the scoring commit, kept visible. **Lead rule 13:5xZ: pre-registered rules get a
   second reader (arch-claims or mgmt-ops) BEFORE data arrives.** de-unknowns-ux drafts a pacing v3 (touch A/B) plan; it
   could replace P-031's F part.
   **Lead 13:5xZ: pacing v3 APPROVED** (arm 3 passive vs non-passive touchmove = decision arm; load from measured phone
   long tasks; synthetic, but the swipe-and-pick UI + scorer also wrap two URLs): **F stage of every fix = a blind
   real-page swipe A/B via the v3 UI** (first user: cdwc countdown fix); second reader before data; G first, then F rested.
   doc-protocol-v2 folds this into protocol §5 when convenient.
   **F-071 [OBSERVED] (arch-claims 13:2xZ):** finger/touch scrolls show sustained 12-13 ms (~80 Hz) rAF stretches
   (F6-try2 563/1027, try3 171/1385; fastwork E1 seg1 43/352, A1 seg2 30/816); S/W runs and idle show 16-17 ms. fps
   and frame counts from F/G runs do not compare with S/W runs; ms thresholds unaffected. ver-rafrate checks the cause;
   proposed CLAUDE.md qualifier after verification: "60 Hz idle and in scripted scrolls; ~80 Hz observed in finger scrolls".
   **WDA signing profile expires 2026-10-08T12:19:35Z** (free team, ts-gesture): re-run `wda build` before then.
   Pacing v2 page: research/design-engineering/pacing/v2.html (d28c2cb); F5 result = F-069 OBSERVED n=1.
   **Phone scoring (lead, CLAUDE.md 668b612, supersedes the v>=3 decision):** dt > 50 goal (target 0) + dt > 34, counts
   at ±4 ms (dt>46/54, dt>30/38), "threshold-sensitive" if the verdict differs; no k forms on the phone; Low Power Mode
   per run. fix-reviewer check 15 updated (13da193).
   **Timeline-block sentinel (lead 12:5xZ, every Timeline block: P3, P11, P14, listener):** one uncounted Timeline-OFF
   control sentinel run after the warm-ups and one at the block end carry the >=58/>=44 rule (a failure voids the block);
   counted runs keep Timeline on in every arm, judged within the block; record counted C fps with Timeline on as info.
   If Timeline-on C >= 44 data exists, only the end sentinel is needed. doc-protocol-v2 writes it into protocol §5.
   **Probe rule (lead 13:3xZ):** T1a landed (f8e7d5a) but counts as absolute only after a T1a on/off A/A in P4's warm-up
   slot (approved); until then counted runs use the P0-cleared logger (P-029, P3 did). T1a deltas f8e7d5a on e0b3821 (npm test 630 before rebase, unit 308 after; docH null at
   y 0 / raf-legacy, told ts-analysis); phone dt>50/34 ±4 ms reporting is a separate measurement-code change (lead).
   **Holds:** fixed-size morph diagnostic, ghr85a, R7, R8 nav half, a1 (behind the countdown fix), h4.
   Countdown fix mw10e-cdwc (CSS 5dc6e8e37388 on aw1-10e; 269df637 differed only in a comment, never served) lands on phone gain evidence + review; mechanism wording stays
   OBSERVED ("repaint of the faces removed (observed)") until ver-webkit-paint reports (lead).
2. **USER-ASK BUNDLE: answered 11:3xZ.** Approved: C1 (the lead runs it himself in the main checkout after T8+ /
   I-033 lands and is reviewed, when the user is away from the Mac; P-027), F6 (phone visits the Apple page), T10
   (Instruments pairing). WDA setup by the user in progress (step 1 Xcode account done 11:4xZ). The finger batch
   F1-F7 + R2 clip look: tell the lead when its pages are built (mw-stub: fix-nav-morph; pacing page: de-unknowns-ux;
   fw-clip-probe exists) AND P1/P2 are done; the lead pings the user.
3. **Results routing:** y≈1960 -> fix-nav-morph (touch-only class: G or F before landing; F1 landing gate = touch latency,
   finger F4); morph -> fix-nav-morph + de-pm-morph (Composite carries the cost, ~78 layers per cycle; R1/R2 refuted);
   hero -> fix-hero-exit + de-pm-hero; y-source -> arch-lead; ca-check -> arch-oss-survey + de-oss-map (if F-048
   confirmed: OSS P2 blur-easing-cubic fixes our own T10 base and goes first); N14 -> fix-scroll-engine.
4. **Pending lands:** none from docs agents (12:3xZ main bd6762e: docs-2 196af02, doc-protocol-v2 1b09dad/5ffb00c/cb74826). Toolsmiths: ts-host-state
   T8+ (I-033), ts-bench-gain (I-034, nit 1), ts-render-signals (I-032), ts-iphone-run (T1a), ts-gesture follow-up. fix-scroll-engine's /10d
   stays parked until its phone check (no base change mid-queue).
5. ts-gesture notes (apply once landed): `wda build` = `node tools/lock.mjs run chrome-measure --owner iphone-runner
   --max-seconds 600 -- node tools/iphone.mjs wda build --owner iphone-runner` (normal lane, iphone lease, xcodebuild
   capped at 540 s); gesture key `pinReversals` -> `pin` (`pin.excursions`, `pin.fight`, `pin.bounces`); first G run:
   check perStroke `endLagMs` is not always 0 (review-gesture-2 B1). (17:3xZ: moot until I-042; every G stroke so far
   was a ~50 ms flick, F-085; redo this check on the first valid G run after the fix.)
6. Caffeinate: lead started a new one 18:13Z until ~20:13Z; remind the lead ~19:55Z. Display has been on since 06:22:55Z (back-tag ddc3450): holds after 06:22Z compare.
7. **Toolsmith asks from ts-analysis (review-stats T3 nits; need a lead spawn):** (nit 1) `tools/bench.mjs` calls
   `gainVerdict` at :555 and :689 without try/catch; since 86424b0 bench-stats throws on non-finite input, so a null/NaN
   scenario metric crashes bench (and in reconfirm loses later topics' tier B results) instead of INCONCLUSIVE. Fix
   drafted (~15 lines + 1 test, not measurement code): `tools/lib/bench-gain.mjs` series() drops non-finite values into
   `errors`; draft in `<scratchpad>/ts-analysis/nit1-series.diff` + `bench-gain-series.test.mjs`. (nit 3, for the T2
   spawn prompt) `stats.mjs runs` scores a run with some non-finite frame times on its finite frames only (`partial`),
   so count metrics read better: T2 must auto-void a counted run that loses more than a few percent of its frames
   (reason in `meta.void`). iphone-runner voids such runs by hand until T2 exists.
   **ts-iphone-run status for the T2 prompt (relayed by mgmt-ops-4, 11:4xZ):** U7 done (e96e5b5: meta.wallStartMs,
   pre.clock {wallMs, perfMs}); U9 done (meta.settings: media queries, hardwareConcurrency, batteryPct/charging; Low
   Power, Limit Frame Rate, case, brightness, content blockers, feature flags recorded 'unknown'); U2 covered (raw dt,
   both k>=5/k>=7 and >34/>50); **U5 open -> T2**: `iphone.mjs run --warmup` is only a label, so tickets keep the
   uncounted warm-up per served port by hand until T2 lands. T1a review starts after the probeVersion bump (raf-legacy
   optional since the A9 lift, lead 747d80a).
7c2. **ts-lock-bundle 7b (f) shared short holds: NOT implemented (proposal 14:5xZ, its own ticket if wanted).** "One holder"
   is an invariant of status/release, FW_LOCK_HELD re-entry + keepAwake, last-grant + 900 s drain budget, doctor/repair,
   wda buildGate, iphone measureGuard, `lock.mjs wait --until`, verify's gate record + holds.log. Design if wanted: a
   separate `<r>.cohold.json` slot, granted only when holder AND requester are short, no live normal waiter (movedBy
   counts as normal), drain budget unspent, slot free, different checkout; normal waiters need holder + slot free and pass
   the host gate on a fresh window; release/stale/doctor/repair/status learn the slot. Gates: 2 concurrent `npm test` x3
   on an idle host, 0 failures, wall time recorded (no gain if >= 2x one); a test that a normal grant never happens while
   the slot is taken (incl. stale paths). Cheaper first: (A) pre-commit skips `npm test` when the same staged tree
   (git write-tree) passed in the last N min (pass stamp in the shared git dir; changes .githooks = USER decision);
   (B) slow fake-Chrome e2e files opt-in for commits outside their area (riskier). Today's queue: 7 entries, 6 short.
7b. **Toolsmith queue (lead 11:5xZ; spawn after T8+ / I-034 land, not urgent):** (1) I-035: `lock.mjs repair --move X
   --to <X's current position> --apply` prints "moved by lead" but writes no movedBy, so short jobs pass X (workaround:
   move to 2, then to 1). (2) Proposal: `lock.mjs run --no-timing` (or similar) that skips the host gate and marks the
   hold non-measuring (the wda build waited for quiet while the user worked at the Mac); no arch spawn (lead 12:0xZ): the
   I-035 toolsmith writes the proposal in the same task; the lead's measurement-code fix-reviewer is the sign-off (a
   non-measuring hold must never let a timing run start on a loud host). **Same ticket (lead 12:5xZ):** (a) the head
   waiter at the gate calls keepAwakeQueued while gated (lib/lock.mjs acquire); (b) a gate sleep longer than timeoutSec
   must not end in a throw on wake; (c) N2: tag a gain judged against a calibration stored in another display state.
   (d) (lead 13:4xZ) flaky fixture-server request timeout under load: tests/e2e/baseline-snapshot.test.mjs:138
   (fix.mjs:312 'timeout …/2.fixture.js'). (e) display-off detection only tested with fake readings. T8+ landed
   (21ec95a + 34f6069, I-033 RESOLVED 13:4xZ): spawn when the lead decides.
7e. **USER DECISION 12:20Z: host gate quiet-CPU threshold 20 -> 25 %** (20 % was uncalibrated, provisional per the
   09-30 post-mortem). ts-gate25 (toolsmith) makes the change and checks the existing results.json host-busy data on
   whether 30 % is safe later. A/Bs stay comparable: the config records the threshold. T8+ (599471e) is NEEDS-WORK
   (review-host-state: 2 small blocking items, with ts-host-state); I-035 + --no-timing stay queued after T8+.
7d. **NEW RULE (user, CLAUDE.md 71ad57d):** a browser/engine limitation is OBSERVED until confirmed against docs, spec,
   engine source or a bug tracker (cited). mgmt-ops signs no card that relies on an OBSERVED claim as its mechanism
   (experiments that TEST a claim are fine); route arch-claims' refuted/weakened claims to owners and amend tickets.
7c. **F-059 / F-064: CONFIRMED by source AND check (13:0xZ, F-066):** Chrome 154 0 layerPainted in all 4 arms, CfT 143
   8/10 (root contents layer); CompositeAfterPaint theory REFUTED (143 has CAP and still fires). paint-rects --on/off
   A/A: scroll 86.6 -> 66.6 fps, so "never in timing runs" stands. New caveat (res-layerpainted, OBSERVED/inference): a
   will-change layer whose only change is a solid background colour gets no layerPainted and no paint on 143 (solid-colour
   layer = property update?), so paint counts/rects may miss such changes; routed to doc-protocol-v2 + ts-render-signals.
   History (12:2xZ):
   layerPainted is dead on M148+ because of Chromium 1bf9d9eb ("[HiC] Allow cc::Layer update rect mutation during
   paint callback", crbug 488803411): `LayerTreeHost::WillCommit` resets update_rect before probe::LayerTreePainted;
   not CompositeAfterPaint. Decisive 7-arm check (Chrome 154 vs CfT 143, ~70 s short lane) -> ts-render-signals.
   Corrections routed: doc-protocol-v2 = protocol §2.4 l.124, §3.7, §6.2 + devtools-render-metrics.md l.51/214/268/
   283/292 + morph-endpage.md V3 l.333; ts-render-signals = paint-rects.mjs l.10-11 in its T6+T7 commit;
   res-layerpainted posts the correcting finding. The lead digests F-059 into FINDINGS only after the check. paintCount
   fallback stays; trace-snapshot rects are opt-in, attribution only.
8. Backlog for mgmt-lead (none urgent): as before (recheck pauses, gate.since, WindowServer in the gate, verify has no
   load phase, trace buffer, review-10e note (a)); plus T8+ host record (ts-host-state), protocol amendments A1-A9.

## Where the project stands (08:55Z; see DIRECTION for 11:2xZ)

- main = 4edb872 (snapshot) on the wave-2 base `aw1-10e` = all-wave1 + scroll-engine /10e. Chrome: page-owned > 50 ms
  frames 0; 1 vendor frame per run (gtag `onscrollend`, removable only by the site's GA "Scrolls" setting; user-facing,
  lead). I-018 attribution: remaining > 34 ms classes = gtag, nav `ee()` forced style (N12 v5 fixes), a 429-element
  restyle at +1.1 s, paint.
- iPhone (scripted, aw1-10c): > 50 ms 5→3, > 34 ms 16→9; user feels NO difference. Felt lag: morph pin (10-18 fps, render
  cost, three per-frame blur radii suspected) and the hero window (y≈50 frame, F-032 people-o reflow).
- Closed today: N11 (mechanism only, vendor), N13 (rare, not reproducible), I-018, I-026-I-031, I-028/029.

## Incidents (10-02 08:3xZ; see `incident.mjs list`)

| id | state | owner | note |
|---|---|---|---|
| I-068 | RESOLVED not-a-bug (Mac idle sleep; C-024) | ts-i063 | console thread wait overran its timeout |
| I-074 | RESOLVED (47b38a0) | ts-i074 | user T-028: proposals get a "Try it" panel with live original vs PoC iframes |
| I-076 | open, ts-i076 | ts-i076 | npm test wall time 285-293 s, close to the shared lane's 300 s cap; ts-i076 spawned 23:2xZ (with I-072) |
| I-075 | RESOLVED (aac5b4a) | ts-i075 | phone heat tooling: battery logger, power keys, served-hash GETs on non-mirror pages |
| I-073 | RESOLVED (5f37fcb) | ts-i073 | LAN address resolver + placeholder; CLAUDE.md edit with the user's OK (T-026 #5) |
| I-072 | open, non-blocking, ts-i076 | lead | WDA e2e tests left 3 fake-xcodebuild/fake-iproxy orphans (14 h); killed by the lead; not sim-warm (ts-i063) |
| I-071 | RESOLVED not-a-bug (Idle Sleep; test:chrome 13/13 at 17:38Z) | ts-i063 | test:chrome check.chrome failed (no check.json); bisect 9135b35 vs 0aa2227 |
| I-070 | RESOLVED (0de8103) | ts-i070 | keep the Mac awake only during measurement holds (caffeinate -i -s) |
| I-069 | RESOLVED (0aa2227) | ts-i063 | sim safari-restart on a restored data: tab |
| I-066 | RESOLVED (dc5651c) | ts-i063 | sparse worktree's leftover site*/ shadowed the baseline |
| I-065 | RESOLVED (bdc2e04) | ts-i063 | flaky unit tests: a proposal test; console.test.mjs:274 ms-boundary endedAt |
| I-064 | RESOLVED (11bc722); user YES to deleting the old recorder | ts-i064 | ioscap review fixes F2-F5; blocks the ioscap first run |
| I-063 | RESOLVED (0aa2227; measurement code) | ts-i063 | sim.mjs session cold-boots the Simulator every hold; shared holds can't keep it booted |
| I-062 | RESOLVED (4df8bb2; npm test 1149/1149) | ts-i062 | ioscap recorder; first run gated on review-ioscap + a console step |
| I-061 | RESOLVED 10:44Z (517fdb4) | (lead) | PROGRESS build data schema |
| I-060 | RESOLVED 10:44Z | ts-i060 | progress page "Right now": show the job and the fix, not only the holder (user T-020) |
| I-059 | RESOLVED 10:0xZ, landed 17eeb1a + 62b4053 | ts-i059 | console: a runner-ended part can be marked Done by the user; fix (A) runner-ended parts + (B) "Start over" (T-019 #7) |
| I-056 | RESOLVED 09:3xZ, landed d2d77ad (phone runs no longer wait for shared groups, `--require-quiet` opts in) | ts-i056 | phone measure guard (a) shared group as short, (b) same-owner --no-timing exception (lets S/W/M blocks use the preferred quiet hold), (c) gesture-run guard, (d) shared readers log to holds.log |
| I-058 | open | toolsmith (lead spawning) | waits invisible on the board; fixed-time waits where a probe exists (user T-016) |
| – | resolved 10-02: I-053 (proposal options, 42c14a0), I-054 (Range, 67847b4), I-055 + I-057 (flaky e2e, 42c14a0) | – | console restarted 08:22Z with options live |

## Peer directory (F-046; keep current, send to every agent that joins)

Lead decision 10:35Z: agents work peer to peer; **mgmt-ops is the hub** for everything that is not lead-only (land,
incident resolution, lock reorder, spawn, user). Role names work only if `ListAgents` shows them; else use the ID.

| address | owns | state (10-02 12:0xZ by mgmt-ops-7; ops, fix-nav-morph, de-gpu, ts-i077 rows 10-03 00:1xZ by mgmt-ops-9) |
|---|---|---|
| `main` | lead: lands, resolves incidents, reorders locks, spawns, talks to the user | alive |
| `mgmt-ops-9` (named; ID acfd7a13b6014f754; from 10-03 00:0xZ) | ops hub: handover, land batches, PREDICTIONS P-ids, PROGRESS.json, ticket second reads | alive; message "mgmt-ops-9". mgmt-ops-8 (ace57ef63584bdfb6, unnamed) and earlier are RETIRED: don't message them |
| `fix-nav-morph` (name) | f3-arm-scope (P-036 G, signed S-sentinel amendment a4b1790), cdwc (parked) | alive (10-03 00:0xZ): waits on iphone-runner for P-036 |
| `de-gpu` (ae7885a4cf83f8d7b) | T-030 GPU/compositor-only CSS (research/gpu-props/, 41563ad, F-145) | done 10-03 00:1xZ |
| `fix-cd-strip` (name) | cd-strip: countdown digits as sliding strips (T-030 F1, user priority #1); coordinates with de-countdown | alive (10-03 00:2xZ) |
| `fix-hero-exit-threaded` (name) | hero-exit-threaded: hero exit as a scroll-driven animation, ST-1 split first (T-030 F2, user priority #1) | alive (10-03 00:2xZ) |
| `fix-cd-roll-ca` (name) | cd-roll-ca: countdown roll on the GPU, stacks on cd-strip (T-030 #10, user priority #1) | alive (10-03 00:2xZ) |
| `fix-pill-swap` (name) | pill-swap: community-pill avatar template swap, full-viewport Layout 2/s at pastHero (JS 11415-11447; from F-146), on st6-rb2 | done: dropped at D (9df12de, 10-03 01:3xZ) |
| `ts-i078` (name) | I-078: `sim session` refuses while fw-sim is "Shutting Down" (workaround: wait, retry) | done: I-078 resolved 84a0982 |
| `arch-memory` (name) | T-032: agent memory into the project (proposal cfe3693, waits on the user's two OKs) | alive (10-03 00:2xZ) |
| `fix-nav-morph` ID | a277ea00c8773c1ea; also takes the morph panel dvh height after P-036 | – |
| ts-i077 (UNNAMED: agent ID a46d520fdb1912d3c; the name does not resolve) | I-077 (open after park), talks to the lead | done: I-077 resolved 793c8bc (10-03 00:5xZ) |
| `iphone-runner` (a7696771bf38f1229) | phone blocks, sentinels, logger; P-065 scripts | alive: phone back (T-025 21:28Z); re-runs G2 from the warm-ups after the T-026 Wi-Fi change, then P-065 |
| `fix-scroll-engine` (a1722cf5058e25591) | fwreskip (PR-005 posted, waits on the user); hero-carousel (parked) | alive |
| `de-illusion-style` (afc7d9fff1fcc6154) | illusion-proposals / word-alone (P-065, PR-004): Sim counts, 1 % pixel cause, Chrome call tree | alive (phone part on hold) |
| `fix-image-size` (new 12:0xZ; ID af756241c686d490e) | image-size: P-066 falsified (no detectable saving), dropped; null write-up 909464c | done |
| `de-countdown` (a097ffbf8f44a4d14) | T-024 countdown-faces (board priority #1; apple.com off-screen-pause reference) | alive: X1 stage 2 phone block running (10-03 00:0xZ) |
| `de-heat` (a19ec71e8ca8fff91) | T-029 phone heat, P-068 ticket (research/phone-heat/) | done (run ended 10-03 00:1xZ); P-068 H1/H2 run by iphone-runner after P-036, scorer to be named by the lead |
| `de-gpu` (ID via ListAgents) | T-030 GPU/compositor-only CSS for animations (research/gpu-props/), no phone, no timing | alive |
| `de-safari-mac` (ID via ListAgents) | T-023: Safari on the Mac as an iPhone stand-in (read-only research) | done (user: no, thanks) |
| `review-ioscap` (ac18cae341e16fdc7) | privacy review of tools/ioscap.mjs (SAFE WITH FIXES -> I-064, resolved 11bc722) | done |
| `ts-i063` (spawned 12:05Z; ID via ListAgents) | I-063, I-065, I-066, I-069 (follow-up 5678f13 landed), I-068/I-071 (not-a-bug); I-071 check.chrome hardening staged, waits for an awake Mac | alive |
| `ts-i070` (ID via ListAgents) | I-070: caffeinate only measurement holds (resolved 0de8103) | done |
| `review-i063` (ID via ListAgents) | read-only fix-reviewer of ts-i063's batch (measurement code: host.simWarm) | alive |
| `ts-i064` | I-064 toolsmith (rounds 1-2 landed 8ec1c6d, 11bc722) | done |
| `wi-stack` (a93135040e12a061d) | best-stack, shell-hold-c (landed 81dbc9b), F-129; an optional Sim spot check is parked | done |
| `fix-scene-scope` (a49a278f1d0bd6803) | scene-scope / RBi40pti (landed 1ce70e8), st6-rb2 restack (cff1a03); r4-v3 unassigned and parked | done (worktree kept) |

Rows from the 10-01 session (fix-nav-morph, fix-hero-exit, ts-*, arch-*, de-*, review-*, and others) were removed at
12:0xZ: those agents are not live in this session. Their owners in PROGRESS.json (fix-nav-morph for cdwc, f3-arm-scope
and pin-clamp; fix-hero-exit for re-keep-op and blur-cubic) are now historical; ask the lead before messaging them. The
old table is in this file's git history (before this commit).

## Who waits on what (08:55Z)

| agent | state | waits on | next |
|---|---|---|---|
| iphone-runner | owns the phone; hero block (B/P/P2/P3) | – | morph driver block → N12 → N10 |
| fix-nav-morph | morph owner (#1); driver + mw10e-* builds 4732f6c; holds rebase/sparse until morph AND N12 blocks end; building h-fixedpanel (lead) | morph driver block results | h vs b decide → R1 size-stable panel or N2/R7 |
| fix-hero-exit | hero window owner (#2) + h1 coordinator; 6e0a49f (rebased + sparse) | hero-A (h1v2 vs P, h1 vs P2; 6e0a49f) then hero-B bisect, on the phone | if h1v2 wins: review (a11y change, 14 MB) → one Chrome A/B `--on aw1-10e` |
| fix-scroll-engine | N10 a-d deprioritized (y≈1960 -> fix-nav-morph 09:48Z); rebased 272f6c7 + sparse; N10 overlays frozen (aw1-10e 3e2f599a, d 7de8ee9a) | phone (last in queue) | R2 built: r2-bg-layers 91d7571 (CSS ce301ce3, parity 0 %, F-040), queued on the phone before N12; /10d built: se10d-aw1 e920843 (JS ff58a433, CSS = aw1-10e; idle F-030 0/s, parity 0 diffs, restore bug fixed, quiet gate works); needs review + A/B + phone after N10 verdict; /10d Chrome A/B waits for the e1/e2 verdict; offered read-only look at de-middle R3 (unowned) |
| ts-snapshot | DONE: 5 follow-up commits on worktree-agent-a29e6d138799d9fb8 (git-guard unwrap, BASELINE verdict prefix + per-run re-check in verify = MEASUREMENT CODE, SCOPE SNAPSHOT, settings.json worktree deny rules, docs) | review-snapshot-fu; user OK for the enforcement-layer commits | lead lands (never mid-block), then test:chrome + canary; owners rebase after the announcement |
| arch-finger | plan landed 2226d51 (finger-simulation.md) | – | – |
| ts-gesture | toolsmith: gesture.mjs + wda.mjs vs a fake WDA | user's one-time setup (Xcode, Developer Mode, UI Automation) | reviewer, then V0/V1 on the phone (queue b2) |
| de-morph, de-hero, de-middle | notes landed (5c4fc37, 7576f74, 7d60f9f); de-morph resumed 09:3xZ to reconcile with the driver numbers | – | – |
| arch-devtools, de-devtools | NEW (user request ~10:15Z), read-only, narrowed to Chrome: DevTools methodology / render-metric blind spots | – | report to the lead |
| arch-safari, de-safari | NEW (user request ~10:18Z), read-only: Safari Web Inspector / iOS probing (research/architecture/safari-inspector-probing.md) and the iOS per-frame time model + probes for morph and hero (research/design-engineering/safari-render-signals.md) | – | probe proposals go to the lead before anything runs on the phone |
| de-apple | landed 1babddb; NEW (user request 09:3xZ): apple.com rendering math -> research/design-engineering/apple-math.md | – | reports to the lead |
| ts-i017, ts-i021, ts-bench, wave1-dry, N11, apple-verify | ENDED | – | do not resume without the lead |

## Priority order (user feedback 08:04Z; DIRECTION "Priority from user feedback")

(1) morph on WebKit (fix-nav-morph) → (2) hero window y 0-900 (fix-hero-exit) → (3) N10 y≈1970 (fix-scroll-engine) →
/10d → countdown 05/08. Chrome-only 20-50 ms work on spare capacity. New variants `--on aw1-10e`; normal holds ≤ 10 min.

## Queue rules and monitors

- Shorts: ONE 300 s lease for commit + hook, gate open; `--timeout 14400` on every `lock.mjs run`/`acquire` wait.
- I-030 landed: shorts never pass a lead-moved normal and pass any gated normal only in its first 120 s. Still ping the
  lead when a goal-path normal waits > 10 min. Quick shorts ≤ ~90 s while a goal normal is #1 are accepted.
- Outside a lock slot: unit test files only (CLAUDE.md); no builds (combine, npx) while a normal holds chrome-measure.
- HOLDER-IDLE > 5 min with 3+ waiting → lead IMMEDIATELY. Friction scan (`node research/management/tools/kpi.mjs
  --friction`) at check-ins; ALARM in 2 consecutive check-ins → incident candidate.
- No Monitors armed. Use the foreground `tick.sh` (scratchpad `mgmt-ops/`); it points at the mgmt-ops-2 worktree.
- Measurement-code canary: any verify/cdp/fix-ab change lands only after `ab --aa --runs 1` on main + test:chrome.
- Reviewer checklist (LEAD.md §4, F-030): topics adding observers/listeners/attribute writes get an idle-counts probe at
  y=0 before landing.

## Open user-facing questions (lead holds them)

Chrome vendor residual (gtag `onscrollend`, site GA "Scrolls" setting); pmset sleep setting (caffeinate stopgap); finger
tests (C/D #6 postponed until a morph render fix exists); arch-finger's touch-simulation plan.
