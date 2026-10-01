# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current mgmt-ops: the
02:xx instance, worktree `.claude/worktrees/mgmt-ops-2`, branch `mgmt-ops/docs-2`. Last update: **02:55Z**.

## Digest log (newest first, 5 lines each)

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
| ts-i017 | building I-023 + I-024A, rebase onto 10f7bee | – | ETA ~03:35Z + queue; message mgmt-ops when it queues → lead moves it to #1. Lands before ts-bench if ready first |
| ts-prio | I-026 (every hold under caffeinate) | – | its batch landed (4b1034e, e7ce0e4) |
| ts-i021 | handed back | GO after I-024A lands | I-027 |
| ts-bench | rebasing 4 commits (f0fea0c, 8fdcad8, 3382e71, 3b974d2) onto 10f7bee (package.json/guardrails conflicts) | – | hook rerun → land batch + review request (one reviewer for its +28 additive lines in lib/cdp.mjs); canary shares I-023's slot; then ENDS. Pilot rerun + Q3/Q6 after the goal hold |
| ts-i002 | handed back; I-022 landed 36fd4b5 | I-023 + I-024A landed | resume it for full `npm run test:chrome` (short, split on 124) → lead resolves I-016/017/022; then ENDS |
| wave1-dry | idle, no lock (do not message until GO: each message resumes it) | I-023 + canary | ONE announced hold (`lock.mjs run --max-seconds 1200`): guard; `ab --aa --runs 5`; `ab all-wave1 --runs 5`; `timeout 60 probe-countdown-active.mjs`; F-011 (y≈2100-2150) + F-009c (nav IO 46 ms) attribution; kill only on CONTAMINATED / gate TIMEOUT; commit probe with results |
| fix-scroll-engine | mech10 re-run queued | short slot | run 1: cv churn 0 PASS, will-change out-of-window 0/506 PASS, idle LoAF PASS, un-skips UNCLEAR; NEW 339 ms scroll LoAF in v10 only (script 6 ms, "l" char 419618) + in-window layers 304→741: both gate /10's timing slot. Part 3/E3 + /10 A/B wait for GO |
| fix-vendor-scrollend (N11) | short validation requeued with caffeinate; reported I-026 | short slot | partial (base only): gtag scrollend (gtag/js:903) 83 % spread inside gtag, no hotspot, so deferral is the only lever; final A/B `--on all-wave1` first in wave 2 |
| fix-nav-morph | N12 v3 (moving-zone fallback) + desktop debug | short slots | v2: nav rect 1.71→0.14, gCS 0.85→0.01, efp 0.85→0.07 /frame; parity mobile 0/123, desktop 24/168, mobile-shift 2/130, desktop-rtl 24/168, mobile-rtl 0/123. A/B gate: parity 0 on all 5 + v3 cost. Asked to post the sticky/transformed theme-box pitfall |
| apple-verify | waiting | GO after all-wave1 hold | 3 normal holds of 6-8 min (`--timeout 14400`); MCP Chrome kept until then (lead asks user to close after) |
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
