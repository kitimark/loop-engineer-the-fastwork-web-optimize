# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current mgmt-ops: the
**mgmt-ops-3** (since 05:04Z), worktree `.claude/worktrees/mgmt-ops-2`, branch `mgmt-ops/docs-2`. Last update: **06:32Z**.

## Digest log (newest first, 5 lines each)

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

1. N12 (fix-nav-morph) A/B `--on aw1-10c` holding from ~06:31: first pass (> 50/> 34 first, AV1 forced style+layout ms,
   contamination, patch sha) → land/no-land rec → reviewer request to the lead if landable.
2. N13 storm-catch hold (fix-scroll-engine, queued #2): storms n/N traced vs untraced, per-storm breakdown → decide fix or
   park; then /10d.
3. q3 (wave1-dry Q3-final, queued #3): metric choice final → commit a Q3 note → land batch. The pilot is done (tool OK);
   spec issues belong to phone-invisible-shrink's future bench author.
4. I-018 (ts-i017): fixing review-i018's list (CDP metrics opt-in) → re-review → one traced run + test:chrome, ahead of later
   normals → land; then ts-i021 rebases A/B/C on it, then I-030.
5. Lead's caffeinate stopgap ends ~08:36Z: remind the lead at ~08:15Z if I-026 (ts-i021 commit A) hasn't landed.
6. hero-exit (parked): on resume rebase, `--on aw1-10c`, calibrate `heroPointerEventsWrites` on ≥ 1e2c402.
7. Queue rule: no new shorts while a goal-path normal is #1 (I-030 workaround); ping the lead at > 10 min waits.

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

## Incidents (05:58Z; resolved ones dropped, see `incident.mjs list`)

| id | state | owner | note |
|---|---|---|---|
| I-018 | fixing | ts-i017 | f71ee42 rebasing; gate = reviewer + A/A cdp-metrics on/off (one hold) + test:chrome; lands before ts-i021 |
| I-026 | triaged P1 | ts-i021 | reopen: sleep assertion while anyone is QUEUED (commit A) |
| I-027 | triaged P2 | ts-i021 | #6 fixtures (A), #3 stubbed-host clock in verify (B, measurement code), bench-scenario (C) |
| I-028/I-029 | RESOLVED 57b997a / 4f5667d + follow-up 1e2c402 | – | open doc item for the next toolsmith touch: inlineProp can't see Svelte style-attribute/cssText writes |
| I-030 | triaged P2 | ts-i021 after I-027 | gateHolding(): shorts pass a head normal whose gate isn't open yet, even lead-moved; fix idea: movedBy normal never passed. Workaround: no new shorts while a goal normal is #1 |
| I-016 | parked | lead | e4 hooks via short lane (user), f orphans P3 |

## Who waits on what (06:32Z)

| agent | state | waits on | next |
|---|---|---|---|
| fix-scroll-engine | N13 probe done (visual ruled out); storm-catch queued #2 | lock | storm traces → fix or park; then /10d |
| ts-i017 | I-018 a0efac7 NEEDS-WORK | its fixes, re-review | one traced run + test:chrome; lands before ts-i021 |
| ts-i021 | committing A + B | I-018 on main | rebase, C, hand back A+B+C → reviewer + canary |
| wave1-dry | pilot done (tool OK); Q3-final queued #3 | lock | Q3 final → commit the Q3 note |
| fix-nav-morph | N12 A/B `--on aw1-10c` holding ~06:31 | – | report → review → land; #6 waits finger test |
| hero-exit | parked | wave-2 order (after N12) | + bench `heroPointerEventsWrites` calibration |
| ts-bench (for good), N11, apple-verify, ts-prio, ts-i002 | ENDED | – | ts-bench follow-up (review-i028 notes) when the lead resumes it |

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
