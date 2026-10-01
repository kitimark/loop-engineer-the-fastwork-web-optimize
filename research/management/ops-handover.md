# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current mgmt-ops: the
**mgmt-ops-3** (since 05:04Z), worktree `.claude/worktrees/mgmt-ops-2`, branch `mgmt-ops/docs-2`. Last update: **06:16Z**.

## Digest log (newest first, 5 lines each)

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

1. N13 (fix-scroll-engine): it names the forced-toggle probe before queueing; short-lane mechanism probe → fix → one A/B
   `--on aw1-10c`. Then /10d.
2. I-018 (ts-i017): fixing review-i018's list (CDP metrics opt-in + golden test, trace overflow detection, window
   alignment, idle split, traced ab must not overwrite results.json, stats pairing) → re-review → one traced real-site 6x
   run + test:chrome (ahead of later normals; ping lead when it queues) → land. Then ts-i021 rebases A/B/C on it.
3. After N13 (or in parallel if the slot is free): GO fix-nav-morph N12 `--on aw1-10c` ("20-34 ms band only"; AV1 metric).
4. ts-i021: A + B committed or committing; C (bench-scenario on the stubbed clock, mind FAKE_HOST_SUSPEND) after I-018.
   At hand-back: reviewer for B+C + test:chrome + lead canary.
5. wave1-dry: pilot (B spec, uncommitted, short lane) → report; Q3-final one normal entry → commit Q3 note → land batch.
6. hero-exit (parked): when resumed, rebase, `--on aw1-10c`, calibrate `heroPointerEventsWrites` on ≥ 4f5667d.
7. ts-bench (ENDED): its review-i028 follow-up commit when the lead resumes it.
8. Ping the lead when a goal-path normal waits > 10 min behind shorts. Monitors: none; foreground `tick.sh`.

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
| I-028/I-029 | RESOLVED 57b997a / 4f5667d | – | review-i028 notes → one ts-bench follow-up commit (`changed` readback compare, cssText 0, docs) |
| I-016 | parked | lead | e4 hooks via short lane (user), f orphans P3 |

## Who waits on what (06:16Z)

| agent | state | waits on | next |
|---|---|---|---|
| fix-scroll-engine | /10c landed 8f9ebe5; E3 + part 4 done | – | N13 (forced-toggle probe → A/B `--on aw1-10c`), then /10d |
| ts-i017 | I-018 a0efac7 NEEDS-WORK | its fixes, re-review | one traced run + test:chrome; lands before ts-i021 |
| ts-i021 | committing A + B | I-018 on main | rebase, C, hand back A+B+C → reviewer + canary |
| wave1-dry | pilot (B spec) + Q3-final requeue | lock (short + normal) | report pilot counts + Q3 final, commit the Q3 note |
| fix-nav-morph | READY (N12 v4 486264b + f0ba4a7) | after N13 | GO = N12 A/B `--on aw1-10c`; #6 waits finger test |
| hero-exit | parked | wave-2 order (after N12) | + bench `heroPointerEventsWrites` calibration |
| ts-bench, N11, apple-verify, ts-prio, ts-i002 | ENDED | – | ts-bench follow-up (review-i028 notes) when the lead resumes it |

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
