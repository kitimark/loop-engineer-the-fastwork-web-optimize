# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current mgmt-ops: the
**mgmt-ops-3** (since 05:04Z), worktree `.claude/worktrees/mgmt-ops-2`, branch `mgmt-ops/docs-2`. Last update: **08:33Z**.

## Digest log (newest first, 5 lines each)

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

## Next actions for the next mgmt-ops (in order)

0. Baseline freeze (user decision 07:35Z): ts-snapshot (lead's toolsmith) commits site/ + site-pretty/; nobody runs
   mirror/prettify. Every iPhone block starts with a passing control (fails if bottom/idle < 58 fps or baseline scroll
   < 44 fps).
1. MORPH on WebKit (#1, fix-nav-morph resumed 08:08Z, lean context): #6 v05 C/D finger verdict (lead) → N12 + #6 land;
   owner's phone logger (rAF gaps, pin scrollTo, panel state, touch passive) → relay to iphone-runner for finger record
   runs; ablations (a) pin loop, (b) panel blur, (c) pre-mount, (d) passive → fix → iPhone finger A/B.
2. HERO-EXIT (#2, fix-hero-exit resumed 08:06Z): rebase, aw1-10c, name the y≈50 frame (probes), bench calibration, iPhone
   window y 0-900 via me → iphone-runner, then Chrome A/B `--on aw1-10c` (> 50/> 34 in the hero window).
3. N10 (#3, fix-scroll-engine): ablations d, c, b, a ready (d24a656) for iphone-runner after the morph/hero blocks.
   Spare Chrome: its "other"-class V8 diagnostic hold (queued 08:09).
4. ts-i021: B-E + I-031 rebased on I-018 → ONE test:chrome → lead canary (covers I-018 + B) → land; resolve I-027, I-031.
   Check the hook time (npm test ~280 s now, short cap 300 s).
5. Caffeinate: the lead started a new 2 h one at 08:19Z (to ~10:19Z) → remind at ~10:10Z.
5b. WATCH (lead 08:31Z, don't alarm yet): canary A/A on 43e40ce showed fps 78.3, > 20 ms 57, p95 25 ms vs the 04:25Z canary
   on 93b4af2 (fps ~92, > 20 ms ~25); goal metrics similar (> 50 4 vs 4, > 34 6-8 vs 5). n=1, iPhone finger block serving
   on the Mac. If the next goal-hold A/A also shows ~78 fps → incident: A/A 93b4af2 vs 43e40ce in one hold (I-018/I-027
   level shift vs environment).
5c. Baseline snapshot (ts-snapshot A-D rebasing on 43e40ce → reviewer → lead lands + snapshot commit): after it lands every
   worktree runs `git rebase main` then `node tools/baseline.mjs sparse` between steps (never mid-A/B). Announce ONLY when
   the lead says so. Side effect: bench toolsSha changes, stored gain calibrations read stale.
6. Backlog (mgmt-lead iteration 3): recheck pauses instead of contaminating, gate.since across holds, verify load phase,
   iphone wip.mjs stub clock, kpi rule on topProcs > 50 % of a core, trace buffer 300 → 32 MB with V8 categories opt-in.

## Where the project stands

- **Wave 1 complete on main** (F-013); labels "mechanism + review, gain pending combined". #6 morph-scrolljack-passive
  v05 (63d6980e, nav-morph branch) lands only after the user's iPhone finger test.
- **wave1-partial** is the only clean combined number: fps 74.9 → 95.4, > 20 ms 65 → 24 (hints only: goal progress is
  quoted as frames > 50 ms and > 34 ms + iPhone, LEAD.md iteration 2).
- **all-wave1 goal run** (one announced ~15 min hold, wave1-dry) blocked on I-023 + I-024A + the canary.
- **N3 rejected** (a49e591, F-015: orbit `display:none`, all CSS animations ~1 ms/frame at 6x). Docs follow-up
  6a0db1a (mgmt-ops). Its iPhone questions = DIRECTION iPhone queue item 7 (look-only). E3 stays with scroll-engine.
- Landed since 01:15Z: a49e591 N3, d17c490 handover addendum, b71760f mgmt-lead iteration 2, 36fd4b5 I-022 harness,
  554201a LEAD.md team ~8 + iteration-2 rules.

## Incidents (07:31Z; resolved ones dropped, see `incident.mjs list`)

| id | state | owner | note |
|---|---|---|---|
| I-018 | fixing | ts-i017 | review-i018 NEEDS-WORK fixed (CDP metrics opt-in); re-review → traced run → lands before ts-i021 B-E |
| I-026 | resolve on lead npm test of 05967e9 | – | caffeinate while QUEUED landed |
| I-027 | B/C/D(/E) after I-018 | ts-i021 | real host unchanged (review-i027); canary before land |
| I-030 | landed 8bab8b7, resolve on lead npm test | – | shorts never pass a moved normal; 120 s pass window |
| I-031 | open, env | ts-i021 after E | other CPU 20-26 % mid-hold; not iPhone/builds; log top-5 non-Chrome processes per run (log only) |
| I-016 | parked | lead | e4 hooks via short lane (user), f orphans P3 |

## Who waits on what (08:11Z)

| agent | state | waits on | next |
|---|---|---|---|
| fix-nav-morph | RESUMED: morph on WebKit (#1) | C/D finger verdict; its logger | logger + ablations via me → iphone-runner |
| fix-hero-exit | RESUMED (#2) | – | rebase, aw1-10c, name y≈50 frame, iPhone via me |
| fix-scroll-engine | N10 (#3) ablations ready; "other" diagnostic queued | lock; phone after morph/hero | report "other" class |
| iphone-runner | owns the phone; finger runs with the user (lead) | – | C/D pair, then morph logger runs, hero, N10 |
| ts-i021 | stack landed 43e40ce | – | done unless the lead resumes it |
| ts-snapshot | baseline freeze (lead's) | user approval of enforcement edits | – |
| ts-i017, wave1-dry, ts-bench, N11, apple-verify | ENDED | – | do not resume without the lead |

## Wave-2 order (lead decisions, DIRECTION slot 3)

N11 and scroll-engine /10 first (one ~7 min hold each) → N12 (nav-morph) → hero-exit → countdown 05/08 → E4. Every A/B
`--on all-wave1`, normal holds ≤ 10 min; the goal hold (A/A + all-wave1) is the one ~15 min exception.

## Queue rules and monitors

- Shorts: ONE 300 s lease for commit + hook, gate open; `--timeout 14400` on every `lock.mjs run`/`acquire` wait.
- HOLDER-IDLE > 5 min with 3+ waiting → lead IMMEDIATELY. Friction scan (`node research/management/tools/kpi.mjs
  --friction`) at every check-in; ALARM in 2 consecutive check-ins → incident candidate.
- Monitors (scratchpad `mgmt-ops/`): `idlewatch.sh` (Monitor b4hrnr0gk), `watch.sh` (Monitor bd08tclc1: holder,
  incidents, findings). Scripts point at this worktree. On restart: stop them (TaskStop) and re-arm.
- Measurement-code canary (LEAD.md iteration 2): any verify/cdp/fix-ab change lands only after `ab --aa --runs 1` on
  main + passing test:chrome.

## Open user-facing questions (lead holds them)

Spotlight (pause indexing or wait); FW_TOOLING pre-commit block; I-026 sleep setting; iPhone back (#6 finger test,
DIRECTION iPhone queue 1-7); closing the stray MCP Chrome after apple-verify part 2.
