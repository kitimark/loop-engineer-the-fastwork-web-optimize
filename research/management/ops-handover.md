# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current mgmt-ops: the
02:xx instance, worktree `.claude/worktrees/mgmt-ops-2`, branch `mgmt-ops/docs-2`. Last update: **04:25Z**.

## Digest log (newest first, 5 lines each)

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

## Incidents

| id | state | owner | note |
|---|---|---|---|
| I-023 | P0 blocking | ts-i017 | gate recheck before Chrome / keepalive, per-run watchdog (progress-based, I-026), fake-host test. Canary rule: lead lands, runs `fix.mjs ab --aa --runs 1` on main + ts-i002 test:chrome before the goal hold |
| I-024 | P0 blocking (A) | A: ts-i017 | A: tests read the real host in gate/recheck (verify-fake 940 s, ab-fake 160 s, gain e2e 134 s); B landed e7ce0e4 (run --short kills the whole tree, wall-clock deadline) |
| I-025 | resolved (dup of I-024) | – | – |
| I-026 | P1, env | ts-prio (after I-024 B) | Mac Maintenance Sleep mid-hold (pmset log: 472 s, on AC); timeouts and lock caps fire ~8 min late. Fix: every lock hold runs under caffeinate. Stopgap: lead runs `caffeinate -i -s` until ~06:40Z; agents may wrap their command in `caffeinate -dis` inside the `sh -c`. ts-i017's watchdog must survive sleep |
| I-016/017/022 | resolve on ts-i002 test:chrome after I-023 + I-024A | ts-i017 / ts-i002 | I-022 harness landed 36fd4b5 |
| I-018 | after I-023 | ts-i017 | stashed 69cb158, own commit |
| I-020 | RESOLVED 4b1034e | – | drain-all shorts per hand-over; leases 600 s (max 1200); normal `run` default --max-seconds 600 = OVERDUE warn, never killed |
| I-021 | RESOLVED 0f29e7b (+d10b132 docs) | – | non-tooling roles run `npm run test:unit`; toolsmiths full npm test once in hook (cap 150 s) |
| I-027 | P2, after I-024A lands | ts-i021 (handed back; resume with GO) | tools-speed #3 FW_TIME_SCALE (measurement code: reviewer + test:chrome + canary) + #6 shared fixtures; hook 73 s → 20-30 s |

## Who waits on what (team target ~8, lead 02:30Z)

| agent | state | waits on | next |
|---|---|---|---|
| ts-i017 | I-023 3rd commit (signal handlers) holding 03:42Z | – | then test:chrome (ping lead for move if not first); lead lands 48ace89 + 772e675 + 3rd together at 7/7; resume review-i023 for a 1-file re-check |
| ts-prio | ENDED | – | I-026 95f74dc (362/362) lands after I-023 (lead rebases, tests/helpers.mjs) |
| ts-i021 | handed back, briefed | GO after I-024A lands (+ bench landed) | I-027: commit 1 = bench notes (a) expectSec 600, (b) reconfirm one hold per topic, (c) bench.chrome mech ≤ 120 s, (d) FW_TEST_HOST in bench-mech-fake; commit 2 = #3 FW_TIME_SCALE (measurement code: reviewer + test:chrome + canary) + #6 shared fixtures |
| ts-bench | ENDED; batch 536c43d, ace6764, fe941dd, 239ff35 (399/399) | lead rebases after I-023 + I-026 (fake-chrome.mjs conflict: keep `let n = 0, dying = false` and the HANG_AT/EXIT_AFTER checks at the top of handle(); bench hostSnapshot gains mono/wakeAt/sleptSec/suspended) | review-bench ACCEPT-WITH-NOTES; notes (a)-(d) → I-027 |
| ts-i002 | handed back; I-022 landed 36fd4b5 | I-023 + I-024A landed | resume it for full `npm run test:chrome` (short, split on 124) → lead resolves I-016/017/022; then ENDS |
| wave1-dry | idle, no lock (do not message until GO: each message resumes it) | I-023 + canary | AFTER the hold (lead): pilot `bench mech phone-invisible-shrink --viewport mobile|desktop` (short) + Q3 (normal ≤ 10 min). ONE announced hold (`lock.mjs run --max-seconds 1200`): guard; `ab --aa --runs 5`; `ab all-wave1 --runs 5`; `timeout 60 probe-countdown-active.mjs`; F-011 (y≈2100-2150) + F-009c (nav IO 46 ms) attribution; kill only on CONTAMINATED / gate TIMEOUT; commit probe with results |
| fix-scroll-engine | /10c mech-c (short) | – | /10b: ticket 4/4, 339 ms frame 1/5 (not repeating), layers -45..-84 top half but +104 MB area at bottom (profile-deck 70, #people 20, hero 14: sections behind the user that w1 re-skips). /10c = far re-skip behind the user only. Gate: layers ≤ w1 everywhere + ticket. Then GO for part 3 (E3) + A/B `--on all-wave1` after N11. F-019/F-020 |
| fix-vendor-scrollend (N11) | READY, waiting GO | goal hold done | validation passed (1 GA4 scroll(90) hit in A/C/D, pagehide flush works; tab-switch hide untestable here). Approved final slot: `lock.mjs run chrome-measure --owner fix-vendor-scrollend --max-seconds 600 -- sh -c 'uptime; caffeinate -dis node tools/fix.mjs ab vendor-scrollend --runs 5 --on all-wave1; caffeinate -dis node research/vendor-scrollend/phases.mjs --on all-wave1 --runs 2 --drop-runs 1 --budget 200; uptime'` (first in wave 2) |
| fix-nav-morph | READY (N12 v4 486264b + f0ba4a7), handed back | GO after N11 + /10c | parity 0/5; Tier A mobile rect 1.71→0.54, gCS→0.01, efp 0.86→0.45; LayoutCount unchanged → ticket "20-34 ms band only". Probe fails fast on blank page. #6 waits finger test, then N2; E4 after all-wave1 |
| apple-verify | part 2: holds 2+3 done, hold 4 queued 03:41Z (our baseline + wave1-partial, same script) | normal slot | apple.com @6x 430x739: iPhone 18 Pro page 31-37 fps, 35-50 frames > 50 ms (560-1100 ms forced layout in onscroll, analytics re-reads ~300 offsets/event, non-passive touchmove); Vision Pro 105 fps / AirPods 76 / MacBook Pro 76, each 2 frames > 50 ms, render-bound. Lead asks user re MCP Chrome after |
| countdown, layout-animations, N3 | stopped / done | – | do not resume |

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
