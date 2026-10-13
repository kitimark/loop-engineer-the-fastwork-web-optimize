# Incidents

## I-001: serve.mjs --https: concurrent first start writes a mismatched self-signed key/cert pair (flaky ab-fake test)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T21:02:26.197Z by team-design
- affected: [object Object], [object Object]
- resolved: 2026-09-30T22:04:19.268Z by lead
- fix: `{"commit":"b6c509fdf0e7b632162d1e31c3140f54cf2f60c4","short":"b6c509fdf0","subject":"tools: serve.mjs --https self-signed cert race wrote mismatched key/cert pairs (incident I-001)"}`
- remeasure: false

Error: `Error: error:05800074:x509 certificate routines::key values mismatch`

Command: `npm test (tests/e2e/ab-fake.test.mjs 'ab --runs 1 (A/B) and ab --aa')`

Workaround: re-run npm test / the commit; in real use certs already exist after the first start

Resolution: fixed

landed on main

## I-002: verify.mjs / fix.mjs ab have no idle phase (idle-time animation costs unmeasurable)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T21:14:46.599Z by lead
- affected: [object Object], [object Object]
- resolved: 2026-09-30T22:39:56.711Z by lead
- fix: `{"commit":"1b1aeede9e0c2a172814f431326db6a16a37dbac","short":"1b1aeede9e","subject":"tools: verify.mjs phases leaked LoAF entries and a frame across back-to-back boundaries; idle default 6 s, idle scrollY (incident I-002)"}`
- remeasure: true

Error: `no idle phase in verify.mjs results`

Workaround: own read-only CDP idle script under lock.mjs run chrome-measure

Resolution: fixed

verify.mjs / fix.mjs ab now add a 6 s idle phase (--idle 0 = old sequence) and drop LoAF/frames that straddle phase boundaries. Measurement code: git rebase main between steps (never mid-A/B); your next A/B measures both arms with the new tools. countdown-idle-raf and layout-animations: re-measure now. test:chrome pending (ts-i002).

## I-003: iPhone: self-signed HTTPS on a new port stops Safari at the certificate warning; iphone.mjs can't pass it

- status: resolved
- class: env
- blocking: false
- reported: 2026-09-30T21:32:52.919Z by fix-large-area-blur
- affected: [object Object]
- resolved: 2026-09-30T22:34:28.644Z by lead
- fix: `{"commit":"1323e3338bf1a7b1193df56655f717aac1eaf7f4","short":"1323e3338b","subject":"tools: iPhone checks on self-signed --https mirrors stop at Safari's certificate warning (incident I-003)"}`
- remeasure: false

Error: `Safari certificate warning page blocks iphone.mjs open on https://192.168.0.55:<port>/`

Workaround: serve baseline AND patched over plain http for iPhone checks (serve.mjs / fix.mjs serve without --https); scroll metrics unaffected

Resolution: fixed

Rebase between steps; restart --https servers to get the plain-http twin for the iPhone. Real-device check pending (phone disconnected).

## I-004: serve.mjs --https concurrent first start key mismatch

- status: resolved
- class: tool
- blocking: true
- reported: 2026-09-30T21:39:09.353Z by lead
- affected: [object Object]
- resolved: 2026-09-30T21:39:17.899Z by lead
- remeasure: false

Error: `error:05800074:x509 certificate routines::key values mismatch`

Resolution: duplicate

duplicate of I-001 (same flake, seen in the lead's team-design test run)

## I-005: lock.mjs run can't wrap verify.mjs/fix.mjs ab: inner lock isn't re-entrant across pids (deadlock), so one slot can't hold A/B + probe

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T21:43:42.823Z by fix-nav-morph
- affected: [object Object]
- resolved: 2026-09-30T22:42:10.126Z by lead
- fix: `{"commit":"9dd9cd65f175c3ad1b9c78c6bae798084493c5b3","short":"9dd9cd65f1","subject":"tools: lock re-entry across processes; re-entrant acquires never release the outer hold (incident I-005)"}`
- remeasure: false

Error: `verify.mjs inside lock.mjs run chrome-measure waits forever on its own holder`

Workaround: lease slot: run probes first, fix.mjs ab last (its exit frees the lease); or re-acquire after ab

Resolution: fixed

Rebase between steps (don't kill a waiting ab: it keeps its place and the old code is fine). New: short lane drains queued shorts within 300 s; 'lock.mjs run chrome-measure --owner <you> -- sh -c "fix.mjs ab ... && node <probe>"' holds one slot for both; tests go through the short lane again (niced exception revoked, I-016).

## I-006: all subagents share one scratchpad dir: same-named files (results-mobile.json, base.json, chrome-profile) overwrite each other

- status: resolved
- class: env
- blocking: false
- reported: 2026-09-30T21:44:01.898Z by fix-pain-offscreen-notes
- affected: [object Object]
- resolved: 2026-09-30T21:44:01.943Z by lead
- remeasure: false

Error: `results-mobile.json overwritten by another owner in the shared scratchpad`

Workaround: write scratch files only under scratchpad/<your-topic>/ (or your worktree's out/); never a bare file or a shared chrome profile dir in the scratchpad root

Resolution: workaround

Convention announced to all agents: scratchpad/<topic>/ only; Chrome --user-data-dir always per topic.

## I-007: short jobs (pre-commit npm test, ~35 s) wait behind 5-min A/Bs in the chrome-measure FIFO; commits on main sit dirty for 30+ min

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T21:49:46.141Z by lead
- affected: [object Object]
- resolved: 2026-09-30T22:04:19.340Z by lead
- fix: `{"commit":"38dceed6d713bc6064229fb2a7f7ad2cba57c5fd","short":"38dceed6d7","subject":"tools: short jobs wait behind every queued A/B in the chrome-measure FIFO; add a bounded short lane (incident I-007)"}`
- remeasure: false

Error: `lead commit waited ~30 min in chrome-measure queue for a 35 s npm test`

Workaround: wait; or commit docs-only changes (no test gate)

Resolution: fixed

landed; use lock.mjs run/acquire --short --max-seconds N for test runs and commits

## I-008: ab-fake e2e 'SIGTERM on ab' flakes: 'still running after SIGTERM: chrome' (likely matches other agents' real measurement Chrome in the global process list)

- status: resolved
- class: tool
- blocking: true
- reported: 2026-09-30T21:58:34.359Z by lead
- affected: [object Object]
- resolved: 2026-09-30T23:04:16.260Z by lead
- fix: `{"commit":"7e16be56a62303236c9d765c90d874ada0793a3a","short":"7e16be56a6","subject":"tools: lock.mjs signal handler used process.once, so a second SIGTERM orphaned verify.mjs's browser (incident I-008)"}`
- remeasure: false

Error: `AssertionError: still running after SIGTERM: chrome`

Workaround: re-run; fails ~1/3 while real measurements run

Resolution: fixed

Landed on main; full suite passed in the main checkout (short lane). git rebase main between steps. I-012: lock.mjs doctor/repair; I-013: node tools/finding.mjs post/list/wait.

## I-009: fix.mjs ab and serve.mjs use process.once for SIGTERM/SIGINT: a second signal during process.exit skips their exit cleanup

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:03:57.526Z by ts-i008
- affected: [object Object]
- resolved: 2026-09-30T23:04:16.333Z by lead
- fix: `{"commit":"53606252e6e51e5465223ce10453fe14eaa33f24","short":"53606252e6","subject":"tools: fix.mjs ab and serve.mjs used process.once for signals, so a second signal skipped their exit cleanup (incident I-009)"}`
- remeasure: false

Error: `(latent, found while fixing I-008; not observed failing)`

Workaround: none needed; low impact (stale serve state file; fix.mjs orphans only if it gets two signals)

Resolution: fixed

Landed on main; full suite passed in the main checkout (short lane). git rebase main between steps. I-012: lock.mjs doctor/repair; I-013: node tools/finding.mjs post/list/wait.

## I-010: lock wait message prints 'held by "undefined" (undefined, since undefined)' between holders

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:08:28.863Z by fix-phone-invisible-shrink
- affected: [object Object]
- resolved: 2026-09-30T22:39:05.175Z by lead
- remeasure: false

Error: `[lock chrome-measure] busy: held by "undefined" (undefined, since undefined); you are #16 in queue`

Command: `node tools/fix.mjs ab phone-invisible-shrink --runs 5`

Workaround: cosmetic; the queue still advanced and acquired normally

Resolution: not-a-bug

Already fixed by 38dceed (I-007): the message was printed by a waiter that loaded the old lock library before rebasing.

## I-011: chrome-measure short lane starves: worktrees on pre-38dceed lock code grant by plain FIFO and never write last-grant.json, so new-code short waiters see a stale short:true and defer

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:20:20.857Z by lead
- affected: [object Object]
- resolved: 2026-09-30T22:42:10.056Z by lead
- fix: `{"commit":"9f2bd57aa0a870cc3f271c4cdd69f60c391fdb71","short":"9f2bd57aa0","subject":"tools: short lane starved behind old-code grants and one-short-per-A/B; record unseen grants, drain shorts (incident I-011)"}`
- remeasure: false

Error: `last-grant.json stuck at lead-land-i007 short:true (22:01) while layout-animations (22:07) and commission (22:16) were granted; 5 short jobs waiting since 22:01-22:09`

Command: `node tools/lock.mjs status`

Resolution: fixed

Rebase between steps (don't kill a waiting ab: it keeps its place and the old code is fine). New: short lane drains queued shorts within 300 s; 'lock.mjs run chrome-measure --owner <you> -- sh -c "fix.mjs ab ... && node <probe>"' holds one slot for both; tests go through the short lane again (niced exception revoked, I-016).

## I-012: no safe tool to repair lock state: the lead had to hand-edit .git/fastwork-mirror/locks/*.json with node -e (blocked by the harness as a shared-resource write)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:22:04.704Z by lead
- affected: [object Object]
- resolved: 2026-09-30T23:04:16.883Z by lead
- fix: `{"commit":"8914cc59cd8d93e5482e737079e0903b1d389c71","short":"8914cc59cd","subject":"tools: lock.mjs doctor / repair, an audited way to fix lock state (incident I-012)"}`
- remeasure: false

Error: `auto mode classifier: [Modify Shared Resources] on node -e writeFileSync(chrome-measure.last-grant.json)`

Command: `node -e '...writeFileSync(.git/fastwork-mirror/locks/chrome-measure.last-grant.json)'`

Resolution: fixed

Landed on main; full suite passed in the main checkout (short lane). git rebase main between steps. I-012: lock.mjs doctor/repair; I-013: node tools/finding.mjs post/list/wait.

## I-013: no live findings board: cross-topic findings travel only by 1:1 SendMessage and READMEs, so owners miss techniques/pitfalls others found (e.g. replace-all pitfall, MQL gating)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:25:00.192Z by lead
- affected: [object Object]
- resolved: 2026-09-30T23:04:18.005Z by lead
- fix: `{"commit":"e6bb37638a54691b7ebbe560fee62be0e1331a0c","short":"e6bb37638a","subject":"tools: live findings board, finding.mjs, shared store helpers (incident I-013)"}`
- remeasure: false

Error: `n/a (process gap)`

Command: `n/a`

Resolution: fixed

Landed on main; full suite passed in the main checkout (short lane). git rebase main between steps. I-012: lock.mjs doctor/repair; I-013: node tools/finding.mjs post/list/wait.

## I-014: serve.test '--port 0 --state' flaky: state file read before serve.mjs writes it

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:31:02.080Z by ts-i003
- affected: [object Object]
- resolved: 2026-09-30T22:36:25.871Z by lead
- fix: `{"commit":"a473225e4ecd8f0fc1365f30890ba580db171b76","short":"a473225e4e","subject":"tools: serve.mjs printed MIRROR_URL before writing the --state file (incident I-014)"}`
- remeasure: false

Error: `ENOENT: no such file or directory, open '<tmp>/out/serve-state.json' (tests/e2e/serve.test.mjs:33)`

Command: `npm test (under load)`

Resolution: fixed

serve.mjs writes --state atomically before printing MIRROR_URL. Rebase between steps; no re-measure.

## I-015: serve.test '--port 0 --state' flaky: serve.mjs prints MIRROR_URL before writing the --state file

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:32:08.239Z by ts-i005
- affected: [object Object]
- resolved: 2026-09-30T22:36:32.123Z by lead
- remeasure: false

Error: `ENOENT out/serve-state.json at tests/e2e/serve.test.mjs:33`

Command: `nice npm test (loaded machine)`

Resolution: duplicate

Duplicate of I-014, fixed on main in a473225 (serve.mjs writes --state atomically before MIRROR_URL). git rebase main.

## I-016: host overloaded (load 58 on 8 cores): concurrent npm test suites outside the lock + c=3 parallel-Chrome experiment; nothing gates on host load

- status: parked
- class: env
- blocking: false
- reported: 2026-09-30T22:41:49.544Z by lead
- affected: [object Object]

Error: `load averages 58.80 29.94 19.82 at 22:36Z`

Command: `nice -n 20 npm test (x3-4) during measure-parallel c=3`

## I-017: A/B results taken at host load >6 are not comparable to the A/A floor; add a per-run load guard (keep chrome-measure at 1 slot)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:43:58.643Z by measure-parallel
- affected: [object Object]
- resolved: 2026-10-01T04:20:37.828Z by lead
- fix: `{"commit":"fec6474bc457af5d6f7c5b17b28f2953443e3a9f","short":"fec6474bc4","subject":"tools: verify.mjs exits through its exit handlers on SIGTERM/SIGINT/SIGHUP even without an own lock hold, so Chrome never outlives it (I-023 test:chrome)"}`
- remeasure: false

Error: `same unchanged baseline: >20 ms frames median 66 at load1<6 (n=11) vs 96-103 at load1 6-15 (n=32); fps 74 vs 67-69`

Command: `node tools/fix.mjs ab <topic> --runs 5`

Resolution: fixed

canary on main bab92fe: ab --aa --runs 1 clean (0/2 contaminated, load1 1.7-2.5, no watchdog) + test:chrome 7/7

## I-018: no per-frame attribution for 20-50 ms frames: LoAF only sees >=50 ms, so script vs style vs layout of the ~100 frames >20 ms is unknown

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T22:49:39.148Z by lead
- affected: [object Object]
- resolved: 2026-10-01T08:05:34.977Z by lead
- fix: `{"commit":"29d6d2339e53770cfab9e624aaebd6adada1334d","short":"29d6d2339e","subject":"tests: chrome: a default verify run has no CDP metrics (opt-in --cdp-metrics); fix-ab covers --cdp-metrics per phase"}`
- remeasure: false

Error: `FINDINGS 'frames >20 ms are style/paint' unproven (arch review)`

Command: `node tools/fix.mjs ab <topic>`

Resolution: fixed

per-frame trace attribution (opt-in --trace-frames → results-trace.json), opt-in --cdp-metrics, golden default CDP sequence = main's; review-i018 ACCEPT-WITH-NOTES; test:chrome 9/9; lead npm test 449/449. Canary pending with ts-i021's B-E stack.

## I-019: lead can't reorder the chrome-measure queue by expected gain (FIFO only)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T23:03:04.604Z by ts-prio
- affected: [object Object]
- resolved: 2026-10-01T00:05:50.640Z by lead
- fix: `{"commit":"85fd6fb9feb21b5d9166cdc90248248f80749f99","short":"85fd6fb9fe","subject":"tools: lead can reorder the chrome-measure queue, audited (incident I-019)"}`
- remeasure: false

Error: `E1 (priority 1 in fixes/DIRECTION.md) sits at #9`

Command: `node tools/lock.mjs status`

Resolution: fixed

lead npm test on main 310/310; first live use: countdown and lead moved (audited)

## I-020: short-lane jobs (tooling commits, npm test) wait behind a whole 25-40 min A/B

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T23:22:01.736Z by lead
- affected: [object Object]
- resolved: 2026-10-01T02:52:30.602Z by lead
- fix: `{"commit":"a7a81e5bf1a189ce145ae98d815d053ea6036451","short":"a7a81e5bf1","subject":"tools: drain all short jobs per hand-over, lease TTL/cap, fast hand-over (incident I-020)"}`
- remeasure: false

Error: `short lane never preempts the holder; 6 shorts queued behind layout-animations' 40-min lease`

Command: `lock.mjs acquire chrome-measure --short`

Resolution: fixed

drain all shorts per hand-over, lease TTL 600/1200 s, fast hand-over; lead npm test 357/357; CLAUDE.md c0e95d6

## I-021: non-tooling agents run the full npm test (lock slot + CPU); need a scoped unit run + a guard that they did not touch tools

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T23:25:07.874Z by lead
- affected: [object Object]
- resolved: 2026-10-01T02:47:14.247Z by lead
- fix: `{"commit":"ba8471750062ee17933e964d469914b3e171d78b","short":"ba84717500","subject":"ops-handover: I-026 system sleep mid-hold, caffeinate workaround"}`
- remeasure: false

Error: `user request 2026-10-01`

Command: `npm test`

Resolution: fixed

scope guard + npm run test:unit; lead npm test 347/347 on the rebased commits

## I-022: npm run test:chrome fails when the chrome-measure queue is long; vendor-shim test then holds the lock with an idle Chrome

- status: resolved
- class: tool
- blocking: false
- reported: 2026-09-30T23:27:17.170Z by ts-i002
- affected: [object Object]
- resolved: 2026-10-01T04:20:37.894Z by lead
- fix: `{"commit":"fec6474bc457af5d6f7c5b17b28f2953443e3a9f","short":"fec6474bc4","subject":"tools: verify.mjs exits through its exit handlers on SIGTERM/SIGINT/SIGHUP even without an own lock hold, so Chrome never outlives it (I-023 test:chrome)"}`
- remeasure: false

Command: `npm run test:chrome`

Workaround: run chrome test files one at a time in a free slot: node --test tests/chrome/<file>

Resolution: fixed

canary on main bab92fe: ab --aa --runs 1 clean (0/2 contaminated, load1 1.7-2.5, no watchdog) + test:chrome 7/7

## I-023: verify per-run host recheck (fc07297): A/A Chrome CDP closed after 60.1 s wait; A/B recheck waited 1953 s (cap 60 s), then a broken contaminated run

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-01T01:11:16.633Z by all-wave1
- affected: [object Object]
- resolved: 2026-10-01T04:20:37.696Z by lead
- fix: `{"commit":"fec6474bc457af5d6f7c5b17b28f2953443e3a9f","short":"fec6474bc4","subject":"tools: verify.mjs exits through its exit handlers on SIGTERM/SIGINT/SIGHUP even without an own lock hold, so Chrome never outlives it (I-023 test:chrome)"}`
- remeasure: false

Error: `[mobile run 1/5] base ... (waited 60.1 s for a quiet host) Error: CDP connection closed (did Chrome exit or crash?) at ws.onclose (tools/lib/cdp.mjs:94:26)`

Command: `node tools/lock.mjs run chrome-measure --owner all-wave1 -- sh -c 'uptime; node tools/fix.mjs ab --aa --runs 5; uptime; node tools/fix.mjs ab all-wave1 --runs 5; ...'`

Workaround: no normal timing A/Bs until fixed; mechanism/short-lane work continues

Resolution: fixed

canary on main bab92fe: ab --aa --runs 1 clean (0/2 contaminated, load1 1.7-2.5, no watchdog) + test:chrome 7/7

## I-024: npm test hangs on a busy host: e2e verify-fake 'waits in the FIFO queue' ran 940 s (gate/recheck reads the real host in tests); lock run --max-seconds 150 did not stop the test tree

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-01T01:53:27.688Z by lead
- affected: [object Object]
- resolved: 2026-10-01T04:20:37.761Z by lead
- fix: `{"commit":"fec6474bc457af5d6f7c5b17b28f2953443e3a9f","short":"fec6474bc4","subject":"tools: verify.mjs exits through its exit handlers on SIGTERM/SIGINT/SIGHUP even without an own lock hold, so Chrome never outlives it (I-023 test:chrome)"}`
- remeasure: false

Error: `exit 124 after ~16 min; verify-fake.test.mjs 965 s; 326/328 pass`

Command: `node tools/lock.mjs run chrome-measure --owner lead --short --max-seconds 150 -- npm test`

Workaround: commit tooling only while the host is quiet (lock status shows gate open); report a hang here

Resolution: fixed

canary on main bab92fe: ab --aa --runs 1 clean (0/2 contaminated, load1 1.7-2.5, no watchdog) + test:chrome 7/7

## I-025: verify-fake one mobile run 933 s under load

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T02:21:08.069Z by ts-i021
- affected: [object Object]
- resolved: 2026-10-01T02:31:41.871Z by lead
- remeasure: false

Error: `verify.mjs exit 130 (test timeout)`

Command: `pre-commit npm test`

Resolution: duplicate

duplicate of I-024 part A (tests read the real host)

## I-026: Mac enters system sleep (Maintenance Sleep, DarkWake) during chrome-measure holds: timers and the --max-seconds cap stall for minutes

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-01T02:32:22.737Z by fix-vendor-scrollend
- affected: [object Object]
- resolved: 2026-10-01T06:43:58.410Z by lead
- fix: `{"commit":"5f289fd5ebc5f02406b951ad949ff87c6add6ca6","short":"5f289fd5eb","subject":"tools: keep the Mac awake while anyone is queued, not only while held; cheaper hook and forged-token tests (incidents I-026, I-027)"}`
- remeasure: false

Error: `pmset log: 09:23:25 Entering Sleep state due to 'Maintenance Sleep' ... 472 secs; probe step load 473.3s, short cap 180 s fired at ~500 s`

Command: `node tools/lock.mjs run chrome-measure --owner fix-vendor-scrollend --short --max-seconds 180 -- sh -c 'node research/vendor-scrollend/probe.mjs'`

Workaround: lead runs caffeinate -i -s for 4 h from 02:40Z; holds may add caffeinate -dis inside sh -c

Resolution: fixed

caffeinate -i -s per resource while anyone is QUEUED, not only while held (lib/awake.mjs keepAwakeQueued). Lead npm test 422/422 on 5f289fd. Free-lock gaps with nobody queued are still uncovered: lead caffeinate stopgap every 2 h until the user sets pmset.

## I-027: npm test too slow for the short-lane cap under load (73 s wall, verify-fake sleeps, per-file fixtures)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T02:35:02.063Z by lead
- affected: [object Object]
- resolved: 2026-10-01T08:30:11.824Z by lead
- fix: `{"commit":"293a902247059d68518e0d74ae26dbd873ef1b70","short":"293a902247","subject":"tests: chrome fix-ab: name why the real host contaminated the run (reasons + topProcs from verify.json)"}`
- remeasure: false

Error: `hook runs 73-121 s; ab-fake 160 s, gain e2e 134 s under load`

Command: `npm test`

Resolution: fixed

npm test 462/462 in ~72 s (was ~280 s); stubbed-host clock in tests only, real host unchanged; stubbed host refused outside tests (verify + bench). review-i027 ACCEPT. Canary ab --aa --runs 1 on main: 0/2 contaminated, A/A consistent (>50 4 vs 4, >34 6 vs 8, fps 78.3 vs 78.6). WATCH: canary baseline fps 78 / >20 ms 57 vs 92 / ~25 at the 04:25Z canary; goal metrics (>50, >34) similar.

## I-028: bench.chrome fails on real Chrome: styleWrite probe finds no 'transform' accessor; fixture page too short (navQs 8 < 10, VACUOUS)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T05:05:31.589Z by lead
- affected: [object Object]
- resolved: 2026-10-01T05:54:38.865Z by lead
- fix: `{"commit":"b04ea10ed65700f7c30f4b744f2f55c418667cfa","short":"b04ea10ed6","subject":"tools: bench styleWrite works on Chrome's real style shape; bench.chrome walks enough steps (incident I-028)"}`
- remeasure: false

Error: `ERROR transform-still-written: styleWrite: no style accessor "transform" on this browser; MECH FAIL nav-cache`

Command: `npm run test:chrome (main b1731a8)`

Resolution: fixed

bench styleWrite via per-declaration Proxy on Chrome's shape; bench.chrome 8/8 (ts-bench), lead npm test 416/416 on f775f00. review-i028 ACCEPT-WITH-NOTES: follow-up commit (changed-check readback, vacuous test, cssText probe, docs) with ts-bench. wave1-dry's bench pilot must run on >= this sha.

## I-029: bench calibrate refuses an A/A without fixes/<t>/patch.diff

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T05:28:07.545Z by wave1-dry
- affected: [object Object]
- resolved: 2026-10-01T05:54:38.925Z by lead
- fix: `{"commit":"f775f00a98f870d7688dc97f7d5b787125d2726b","short":"f775f00a98","subject":"tools: bench calibrate needs no patch.diff (incident I-029)"}`
- remeasure: false

Error: `fixes/q3-commission/patch.diff not found`

Command: `node tools/bench.mjs calibrate q3-commission --runs 4 --time-domain threadTicks`

Workaround: --live with an empty fixes/<t>/overlay (calibrate uses only the baseline on both sides)

Resolution: fixed

bench calibrate builds the baseline side only; no patch.diff needed. Lead npm test 416/416.

## I-030: short jobs pass a lead-moved normal waiter while its host gate is closed; each short keeps the host busy, so the gate stays closed (normal starved up to gateMaxWaitSec)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T06:29:27.579Z by lead
- affected: [object Object]
- resolved: 2026-10-01T07:25:25.338Z by lead
- fix: `{"commit":"1e4e951d8000443909356b350ea8fd7b78c7aa6a","short":"1e4e951d80","subject":"tools: short jobs no longer pass a lead-moved gated waiter, nor any gated waiter after 120 s (incident I-030)"}`
- remeasure: false

Error: `06:28:37Z test-chrome (short) granted over fix-nav-morph (#1, movedBy lead, gate quiet:null 'not measured yet')`

Command: `lock.mjs repair --move fix-nav-morph --to 1; hand-over 06:28Z`

Resolution: fixed

shorts never pass a lead-moved gated waiter; any gated head normal is served before shorts once its pass window (FW_GATE_SHORT_PASS, default 120 s, short job's env) is over, also on the drain path. review-i027 ACCEPT; lead npm test 429/429. Follow-up (backlog): gate.since survives any intervening hold.

## I-031: Holds see other CPU 20-26 % mid-run (2 contaminated/warn holds 06:45-07:06Z); not from iPhone tooling, not builds

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-01T07:26:04.146Z by mgmt-ops-3
- affected: [object Object]
- resolved: 2026-10-01T08:30:11.894Z by lead
- fix: `{"commit":"293a902247059d68518e0d74ae26dbd873ef1b70","short":"293a902247","subject":"tests: chrome fix-ab: name why the real host contaminated the run (reasons + topProcs from verify.json)"}`
- remeasure: false

Error: `q3 07:00-07:06Z run 3B CONTAMINATED other CPU 26.4 %; N13 06:45-06:54Z load1 3.6-8.1`

Command: `fix.mjs ab / bench calibrate under lock.mjs run (normal holds)`

Resolution: fixed

topProcs (top-5 non-Chrome procs, names only) per run and recheck; answer: steady other CPU = WindowServer ~0.5 core + agent CLIs/iTerm2 ~0.2-0.3; sporadic macOS daemons (duetexpertd, fseventsd) tip it over 25 %. Gate redesign (WindowServer as part of the measured system) parked for mgmt-lead iteration 3.

## I-032: render-side trace signals: DroppedFrame, layer split, save-trace, >34 tags, paint-rects, bench layers (protocol v2 T6+T7)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T10:43:45.795Z by ts-render-signals
- affected: [object Object]
- resolved: 2026-10-01T17:38:39.230Z by lead
- fix: `{"commit":"2f81a3e07eadfec5dfb49f6288cc837221a51a75","short":"2f81a3e07e","subject":"tools: paint-rects units recorded wherever paint areas land (incident I-032)"}`
- remeasure: false

Error: `feature gap: no presentation/paint-area/layer signals in Chrome measurement`

Command: `node tools/verify.mjs --trace-frames`

Resolution: fixed

Landed 28f68a5, 6ab77fe, 2f81a3e (opt-in render-side signals; default verify path byte-identical, golden untouched). review-render-signals ACCEPT. npm test 768/768 on 362099d. test:chrome 9/10 twice: the only failure was fix-ab host-contamination verdict (CONTAMINATED (host), other CPU 25-32 %), environmental and outside these commits; lead accepted on this evidence. N1/N7 remain notes. No A/B re-measure needed: default path unchanged.

## I-033: T8+ host display/power state not recorded

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T11:21:48.770Z by ts-host-state
- affected: [object Object]
- resolved: 2026-10-01T13:39:56.959Z by lead
- fix: `{"commit":"6f7ef3930e9c80e9ae55d852facfc35af97a02ea","short":"6f7ef3930e","subject":"tools: review-host-state fixes: gate sleep never times out, reconfirm floor in host state, asleep-hold warning (I-033) [MEASUREMENT CODE]"}`
- remeasure: false

Error: `verify/fix ab/bench host record lacks display on/off, fullWake (DarkWake), power source, Chrome version, field-trial state; 04:00Z A/A gate-phase 27 s sleep recorded as sleptSec 0`

Command: `node tools/fix.mjs ab --aa (host record)`

Resolution: fixed

T8+ landed as 18ead7e + 6f7ef39: host record gets display/wake/power, Chrome version, field-trial hashes, HOST-DISPLAY-CHANGED tag, gate sleep handling. Chrome timing unchanged, no re-measure. test:chrome 9/9; npm test on main 654/655, the 1 failure (e2e baseline-snapshot fixture-server request timeout under load) passed 4/4 on rerun. git rebase main.

## I-034: bench gain/reconfirm crash on a non-finite gain metric (gainVerdict throws since 36810b5)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T11:27:49.815Z by ts-bench-gain
- affected: [object Object]
- resolved: 2026-10-01T12:27:07.963Z by lead
- fix: `{"commit":"348305b7073ff8a1d98d09d88a4586bc1abbf1ef","short":"348305b707","subject":"tools: bench gain/reconfirm crash on a non-finite gain metric (incident I-034)"}`
- remeasure: false

Error: `mannWhitney b: value 1 is not a finite number (null); fix or drop that run`

Command: `node tools/bench.mjs gain\|reconfirm --gain <topic>`

Resolution: fixed

npm test on main 95650f5 610/610. git rebase main; no re-measure (a crash fix, no measured numbers changed)

## I-035: lock repair --move to an entry's current position prints 'moved by lead' but writes nothing; short jobs then pass it

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T11:50:29.381Z by lead
- affected: [object Object]
- resolved: 2026-10-01T17:16:29.302Z by lead
- fix: `{"commit":"75d2b62c5bb34a674807bed636c5577b05848da5","short":"75d2b62c5b","subject":"tools: lock repair --move to an entry's own position writes movedBy (incident I-035)"}`
- remeasure: false

Error: `queue entry has no movedBy after 'repair --move ts-gesture --to 1 --apply' with ts-gesture already #1; fix-layout-containment (short) granted at 11:48:55`

Command: `node tools/lock.mjs repair chrome-measure --move <owner> --to <its own position> --by lead --apply`

Resolution: fixed

npm test on main 75d2b62: 730/730 pass. lock repair --move to an entry's own position now writes movedBy.

## I-036: Chrome for Testing 143.0.7499.169 crashed (SIGTRAP in ChromeMain) at 13:22:19Z; launched 13:22:14.6Z by node pid 72166, while ts-iphone-run held chrome-measure

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-01T13:23:40.784Z by lead
- affected: [object Object]
- resolved: 2026-10-01T13:25:15.567Z by lead
- remeasure: false

Error: `EXC_BREAKPOINT SIGTRAP, Trace/BPT trap: 5; DiagnosticReports/Google Chrome for Testing-2026-10-01-202219.ips`

Command: `unknown: a node process launched Chrome for Testing 143`

Resolution: answered

ts-render-signals' scratch probe (inside its own chrome-measure hold) launched CfT 143 on a profile Chrome 154 had written; 143 can't open a newer profile -> SIGTRAP. No repo test launches 143. From now on: fresh profile per Chrome version, --disable-crash-reporter --disable-breakpad --noerrdialogs, kill on error.

## I-037: iPhone tools pick a background app's about:blank web view (PID:1304) instead of Safari's tab; evaluate times out

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-01T15:00:57.807Z by iphone-runner
- affected: [object Object]
- resolved: 2026-10-01T17:10:11.528Z by lead
- fix: `{"commit":"fa2def8bea5b7ba08e59301255c9552c3fc3e2d9","short":"fa2def8bea","subject":"tools(iphone): pick Safari's tab, never a blank web view or the first of several (I-037)"}`
- remeasure: false

Error: `gesture run aborted: error: Runtime.evaluate timed out after 15000ms (recorder read)`

Command: `node tools/iphone.mjs gesture tools/gestures/finger-protocol-v1.json --owner iphone-runner --morph-log out/iphone-runner/mlog.mjs`

Resolution: fixed

pickTab: Safari's tab only, blank views filtered, AMBIGUOUS on >1 candidate (review-t1a ACCEPT-WITH-NOTES; npm test 728/728 on main). Open: N1 tab-list privacy (ts-iphone-run next), N2 WDA pid vs proxy appId. Rebase on main before the next phone run.

## I-038: gesture tool's inspector connection hangs when a second inspector connection (morph-log hook) closes; 0 strokes

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T15:12:53.674Z by lead
- affected: [object Object]
- resolved: 2026-10-01T20:54:21.249Z by lead
- fix: `{"commit":"d77f7c415dcb1f382d63f026b73cd68788964df2","short":"d77f7c415d","subject":"tools(gesture,wip): one remote inspector per page: name the other client, survive a peer taking the tab, --inject (I-038)"}`
- remeasure: false

Error: `gesture-run: 0 strokes after hook connection closed (3 reproductions, iphone-runner)`

Command: `gesture-run.mjs with morph-log hook (P-032)`

Resolution: fixed

npm test on main (incl. 6a35185 proposals) 886/886 pass. No re-measure (iPhone tooling only).

## I-039: iphone.mjs gesture --morph-log: the hook's separate inspector connection hangs the gesture tool's own connection (recorder read times out, 0 strokes)

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-01T15:13:22.756Z by iphone-runner
- affected: [object Object]
- resolved: 2026-10-01T15:17:06.735Z by lead
- remeasure: false

Error: `recorder read: Runtime.evaluate timed out after 15000ms`

Command: `node tools/iphone.mjs gesture tools/gestures/finger-protocol-v1.json --owner iphone-runner --morph-log out/iphone-runner/mlog.mjs`

Resolution: duplicate

duplicate of I-038 (gesture connection hangs when a peer inspector connection closes); follow I-038

## I-040: iPhone dropped off USB right after each F-v3 answer, twice (15:59-16:09Z, 16:33-16:35Z)

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-01T16:36:31.931Z by iphone-runner
- affected: [object Object]
- resolved: 2026-10-01T17:04:38.660Z by lead
- remeasure: false

Error: `openTab: fetch failed; iwdp :9222 ECONNREFUSED; WDA not reachable at 127.0.0.1:8100; idevice_id -l and -n both 0 devices (lead, 16:09Z)`

Command: `node out/iphone-runner/v3dump.mjs (read-only evaluate after console C-002 / C-004 answered)`

Resolution: workaround

Most likely cable handling during hand-over (unconfirmed). Wi-Fi-only checked 16:50Z: CoreDevice sees the phone, usbmuxd/iwdp do not (OBSERVED), so stay on USB; keep the cable plugged in and still during runs.

## I-041: unlanded lock code (I-035 f, shared short holds) granted co-holds on the LIVE chrome-measure lock; exclusivity broken 16:28-16:45Z

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T16:52:57.826Z by lead
- affected: [object Object]
- resolved: 2026-10-01T17:05:58.651Z by lead
- remeasure: false

Error: `two holders at once: test-chrome co-held with ts-iphone-run 16:38:53-16:41:51Z; a second test-chrome granted 16:41:20Z while the co-hold ran`

Command: `ts-lock-bundle worktree lock.mjs / npm run test:chrome on its branch`

Resolution: workaround

Shared short holds (I-035 f) shelved after review-lock NEEDS-WORK (B1 re-entry, B2 mixed-version, B3 same-owner). Never landed; no co-hold state left in the live lock dir. Unlanded lock code runs only on a temp FW_STATE_DIR. test:chrome runs from 16:38-16:45Z are void and were rerun.

## I-042: WDA POST /actions slow (8-15 s per stroke) aborts every G gesture run; P-032 block 0 valid runs

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-01T17:07:16.857Z by iphone-runner
- affected: [object Object]
- resolved: 2026-10-01T22:54:36.522Z by lead
- fix: `{"commit":"176d888370ff4877941d6d89f89600756adf114a","short":"176d888370","subject":"tools: I-042: compiler v2, sim gesture, safari-restart"}`
- remeasure: false

Error: `WDA POST /session/<uuid>/actions: timed out after ~15.9 s`

Command: `node tools/iphone.mjs gesture tools/gestures/finger-protocol-v1.json --out out/iphone-runner/g32-<run>.json (hook-free)`

Resolution: fixed

compiler v2 + sim gesture + safari-restart; npm test 969/969 on main c7813b3. New stimulus: G runs before/after compiler v2 don't compare (finger-protocol-v1 ee84ebd4e916, slow-drag-v1 5bd9f52ed38e, arm-scope-touch-v1 d72ee13644cc). The phone G run waits for the phone (backlog d).

## I-043: wip.mjs connect() leaks its WebSocket on 'no page target'; openTab retries hold up to 6 sockets to :9222

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T17:34:47.583Z by lead
- affected: [object Object]
- resolved: 2026-10-01T17:48:36.849Z by lead
- fix: `{"commit":"36bf43e9a4786454adfe23a891ae62b6b745d8f1","short":"36bf43e9a4","subject":"tools(wip): connect() and openTab close the websocket on every failure; the open timeout no longer outlives the open (I-043)"}`
- remeasure: false

Error: `no page target (phone locked / Safari backgrounded?)`

Command: `node tools/iphone.mjs open <mirror>:5497/ --owner iphone-runner`

Resolution: fixed

connect()/openTab close the websocket on every failure; open timeout cleared. npm test on main 36bf43e passed. Measurement path for a successful connect unchanged.

## I-044: status.mjs: an owner cannot clear the derived 'now: blocked by I-0NN' line on its row (phone-queue shows I-042 while iphone-runner runs attribution)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T19:43:27.707Z by lead
- affected: [object Object]
- resolved: 2026-10-01T21:32:19.279Z by lead
- fix: `{"commit":"a4fe74064fdb682d88a5218ef5be4d322e9121d1","short":"a4fe74064f","subject":"tools: status board, owner can unlink a derived incident (incident I-044)"}`
- remeasure: false

Error: `phone-queue row: now: blocked by I-042`

Command: `node tools/status.mjs set phone-queue --by iphone-runner ...`

Resolution: fixed

owner can unlink a derived incident: status.mjs set <id> --by <owner> --unlink incident:I-0NN; rebase main

## I-045: A changed proposal decision notifies nobody: proposal wait <id> is met by the first decision, and the lead has no all-proposals wait

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T21:21:21.879Z by lead
- affected: [object Object]
- resolved: 2026-10-01T22:54:36.602Z by lead
- fix: `{"commit":"f1566a30cd0e54a52a54487742b36c76de504eeb","short":"f1566a30cd","subject":"tools: proposal decision events wake every wait, the lead's thread wait included (I-045, ts-proposal-watch)"}`
- remeasure: false

Error: `PR-001: rejected 21:02:13Z -> undecided 21:02:45Z -> changes-requested 21:04:04Z; no waiter saw the change (de-illusion-style's wait had exited on 'rejected'); --any needs --by <agent>`

Command: `node tools/console.mjs proposal wait PR-001 --until decided`

Resolution: fixed

proposal decision events (decide, undo, change) wake every wait incl. the lead's thread wait; npm test 969/969 on main c7813b3; console server restarted 22:35Z

## I-046: test:chrome:fn: check.chrome.test pinned --screen-info gives screen 756x491 (CSS px), test expects 1512x982

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T21:54:45.938Z by ts-lock-share
- affected: [object Object]
- resolved: 2026-10-01T23:32:15.183Z by lead
- fix: `{"commit":"1a3e8578390c84baa873139204a0cdb3e6c471ef","short":"1a3e857839","subject":"tools: headless --screen-info in physical pixels, so the page sees the Mac's 1512x982 screen at DPR 2 (incident I-046) [MEASUREMENT CODE]"}`
- remeasure: false

Error: `AssertionError: the pinned --screen-info actual [2,[756,491]] expected [2,[1512,982]] (tests/chrome/check.chrome.test.mjs:51)`

Command: `npm run test:chrome:fn (worktree on a4fe740, shared lane)`

Resolution: fixed

MEASUREMENT CODE (headless launch only): --screen-info now in physical px, so headless pages see 1512x982 CSS at DPR 2 (was 756x491). check/bench-mech/reconfirm Tier A records from before 1a3e857 ran on a 756x491 screen; headed verify/fix.mjs ab argv unchanged. chrome:fn 6/6. git rebase main between steps; re-run any headless check whose result depends on screen size.

## I-047: iPhone left animating between blocks heats it: no supported park step, and no recorded sentinel verdict

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T22:01:19.385Z by lead
- affected: [object Object]
- resolved: 2026-10-01T23:32:15.107Z by lead
- fix: `{"commit":"9fdcb4f70ad320ab1e90d67b7c82d207f30c4184","short":"9fdcb4f70a","subject":"docs: park Safari after every phone block; protocol v2 §5.2 park + phone-temp --below auto (incident I-047, ts-phone-park)"}`
- remeasure: false

Error: `phone at 41.0 C 20 min after ms-1 (39.7 C at block end): Safari kept the RB page animating; iphone.mjs open refuses about:blank; sentinel pass/fail not recorded (blocks wait.mjs phone-temp --below auto)`

Command: `node tools/iphone.mjs open about:blank --owner <x>`

Resolution: fixed

iphone.mjs park (lease), runs park Safari by default at the end (--no-park keeps the page), sentinel verdict in run meta (--arm C or --heat-sentinel), wait.mjs phone-temp --below auto (--runs-dir, --driver M caps 39.5 C, OBSERVED, not a protocol rule). Docs: CLAUDE.md Phone blocks, protocol v2 5.2. npm test 986/986 + chrome:fn 6/6 on the stacked tip ae2e08d. git rebase main before your next phone block.

## I-048: Progress page and status board show only one Chrome holder: shared-lane readers are invisible

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T22:10:20.785Z by lead
- affected: [object Object]
- resolved: 2026-10-01T23:19:58.491Z by lead
- fix: `{"commit":"36cb93250d66a1d38896471efa10d94b0b28ed4e","short":"36cb93250d","subject":"tools: progress page, text report and status board show every shared-lane Chrome reader (incident I-048)"}`
- remeasure: false

Error: `progress.mjs lockView and status.mjs derive read st.holder only; a shared group (readers[], weights, cap) shows as one holder or free; user T-008 noticed`

Command: `console /progress, /status`

Resolution: fixed

Progress page, text report and status board list every shared-lane reader (name, weight, since), lane x/cap and joins-closed. npm test on main 974/974. Console restarted. No re-measure.

## I-049: Shared readers starve: exclusive holds queued later pass them at every group hand-over (writer preference)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T22:44:42.200Z by lead
- affected: [object Object]
- resolved: 2026-10-01T23:32:15.259Z by lead
- fix: `{"commit":"ae2e08d43a2a5beb61792963a91e2e7b6819b3f9","short":"ae2e08d43a","subject":"tools: shared lane fairness: no later exclusive passes an earlier reader, a 10 min reader age bound, head-of-line bypass (incident I-049)"}`
- remeasure: false

Error: `lead npm test (shared w2) queued 22:15:08Z, still #1 at 22:44Z; cal-headless60 exclusive queued ~22:39Z behind it got the lock at 22:43:35Z (its 3rd 600 s exclusive since 22:14Z)`

Command: `node tools/lock.mjs run chrome-measure --shared --weight 2 --max-seconds 300 --owner lead -- npm test`

Resolution: fixed

Shared-lane fairness: a later exclusive never passes an earlier reader; readers queued 600 s go before any exclusive; a fitting reader may join past non-fitting readers ahead for up to 300 s. Everyone: git rebase main now (mixed lock versions can make one reader and one writer wait on each other, up to ~335 s). npm test 986/986.

## I-050: sim.mjs open adds a 2nd Safari tab next to a restored stale tab; the next sim.mjs gesture fails AMBIGUOUS (I-037)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T23:11:17.952Z by fix-nav-morph
- affected: [object Object]
- resolved: 2026-10-02T00:03:38.638Z by lead
- fix: `{"commit":"fd4493dfd200e6d5578a677461cbd99e5e295e87","short":"fd4493dfd2","subject":"tools: sim.mjs open scopes the session's tab picks to its server host, so a tab Safari restored from an earlier session is never a candidate (incident I-050)"}`
- remeasure: false

Error: `AMBIGUOUS: 2 tabs match any page: http://localhost:63765/ [PID:18026], http://localhost:5367/ [PID:18026]`

Command: `sim.mjs session -- sh -c 'sim.mjs wda start && sim.mjs open http://localhost:5367/ && sim.mjs gesture tools/gestures/finger-protocol-v1.json'`

Resolution: fixed

sim.mjs open records its server host per session; later scroll/record/run/gesture/safari-restart pick only tabs on that host:port (pickTab host option, FW_TAB_HOST), so a restored stale tab is never a candidate and is never connected to. I-037 unchanged (two pages on the own host still AMBIGUOUS). npm test 990/990. git rebase main, then run sim.mjs open <url> before gesture in the same session; blank-others.mjs workaround no longer needed.

## I-051: Simulator boot at each sim session spikes load1 to 110-133 (diagnosticd, backboardd, Sim daemons) and closes shared-lane joins (load1<=16) for 1-2 min per session; CPU busy stays moderate

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-01T23:45:01.724Z by lead
- affected: [object Object]
- resolved: 2026-10-02T01:58:39.666Z by lead
- fix: `{"commit":"344cf09672c47df9f216705d586754ee5aadc433","short":"344cf09672","subject":"tools: shared lane joins on CPU busy over the reader's own polls, not load1 (incident I-051)"}`
- remeasure: false

Error: `load averages: 133.02 55.22 37.16 at 23:44Z with de-illusion-style sim session booting; 113 at 23:24Z (fwreskip)`

Command: `node tools/lock.mjs run chrome-measure --shared --weight simulator ... -- node tools/sim.mjs session --functional ...`

Resolution: fixed

Shared-lane readers now join on host CPU busy <= 75 % (os.cpus deltas over the reader's own polls; lock.mjs shared on --join-busy P), load1 only before the first sample (344cf09). lock status / progress page show 'handing over to X (gated: reasons | not seen N s | seen N s ago)' (6c1c2c1). Docs: lock-shared-lane §12 (dc14755). Not measurement code; timing gate unchanged. npm test on main 1002/1002. git rebase main between steps.

## I-052: Sim Safari keeps serving cached immutable assets for a seen origin; serve --no-cache does not evict them, so a Sim arm on a reused port can silently run another arm's CSS/JS (F-115)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T00:18:04.889Z by lead
- affected: [object Object]
- resolved: 2026-10-02T01:14:58.309Z by lead
- fix: `{"commit":"cb894b18ef88e10f610ef6d82337a6f416a11d2b","short":"cb894b18ef","subject":"tools: sim.mjs session starts Safari with an empty HTTP cache; sim.mjs fetched tells network from cache (incident I-052)"}`
- remeasure: false

Error: `de-illusion-style d2: arm page computed .paint visible with .is-canvas set; no GET for 2.gBuqKVzi.css in either server log`

Command: `node tools/sim.mjs session --functional ... (arm servers on reused --port auto ports)`

Resolution: fixed

Every sim.mjs session empties Safari's HTTP cache (NetworkCache, fsCachedData) after boot and before launch; records meta.sim.safariCache. New: sim.mjs fetched <part> [--log]. Fresh-port-per-arm no longer needed across sessions; within one session Safari still caches, so check server-log GETs (transferSize 300 is not proof, OBSERVED). npm test on main 995/995. git rebase main between steps.

## I-053: proposal tool: one proposal should carry several solutions (options) and let the user pick one

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T06:31:55.704Z by lead
- affected: [object Object]
- resolved: 2026-10-02T08:24:13.281Z by lead
- fix: `{"commit":"3aee73cd6c5b3245f71a74f1f7d327f8f0e25185","short":"3aee73cd6c","subject":"tools: proposals carry several options; the user picks one (incident I-053)"}`
- remeasure: false

Error: `user PR-001 decision 06:31Z: the proposal feature should propose multiple solutions in the same proposal topic and let the user decide which one`

Command: `node tools/console.mjs proposal post\|revise\|decide`

Resolution: fixed

landed on main (d26035f), npm test 1021/1021 in the main checkout; git rebase main. Console server restarted 08:22Z (proposal options live).

## I-054: serve.mjs has no HTTP Range support: Safari never loads an overlay <video> (PR-001 rev 3 arm V blocked)

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-02T06:50:47.957Z by de-illusion-style
- affected: [object Object]
- resolved: 2026-10-02T07:54:12.677Z by lead
- fix: `{"commit":"77c1fcaabc6307ab0e417933faa4d0ff71a14755","short":"77c1fcaabc","subject":"tools: serve.mjs answers HTTP Range requests (206/416, Accept-Ranges) (incident I-054)"}`
- remeasure: true

Error: `Sim Safari: arm V's two muted mp4s requested twice each (200, full body), loadeddata/error never fire in 44 s, arm never ready; serve.mjs answers 200 to Range requests`

Command: `node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner de-illusion-style -- sh out/de-illusion-style/arms/hold-arms.sh out/de-illusion-style/arms/live-inner.sh 44 V F2 F3`

Resolution: fixed

Re-measure only A/Bs that serve <video>/media (Range now 206). Non-Range fetches unchanged except Accept-Ranges on uncompressed static 200s. npm test 1007/1007 on 77c1fca in the main checkout; test:chrome 12/13, the only failure the host-quiet assertion (contaminated host), all functional asserts green.

## I-055: flaky e2e: wda start test reads fake iproxy log before it is written (under load)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T07:03:34.853Z by ts-i053
- affected: [object Object]
- resolved: 2026-10-02T08:24:13.364Z by lead
- fix: `{"commit":"bc16b8a2c1fa2cf06ff7a2e6fcf4f4e1de4fb0a0","short":"bc16b8a2c1","subject":"tests: wda start test waits for the fake iproxy log (incident I-055)"}`
- remeasure: false

Error: `ENOENT ... fw-wdalogs-*/ip.jsonl at tests/e2e/iphone-gesture.test.mjs:556`

Command: `npm test (pre-commit hook, load1 ~26)`

Resolution: fixed

landed on main (d26035f), npm test 1021/1021 in the main checkout; git rebase main. Console server restarted 08:22Z (proposal options live).

## I-056: phone measure guard: shared group passes as a short holder; no same-owner exception for a --no-timing hold; gesture-run.mjs (G runs) calls no guard

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T07:05:29.786Z by lead
- affected: [object Object]
- resolved: 2026-10-02T09:19:22.891Z by lead
- fix: `{"commit":"9e92a9054f640fc50e44de500efd3b82bdccc171","short":"9e92a9054f","subject":"docs: CLAUDE.md Shared devices: a shared group no longer stops phone runs by default; --require-quiet waits (incident I-056 rework)"}`
- remeasure: false

Error: `06:54Z Sim boot (shared w3) ran beside G1 recording: load1 38-94, every QuickTime recording dropped frames (26-65 gaps >1.5x median), 4/8 recordings lost the calibration frame`

Command: `gesture-run.mjs via iphone-runner g1.sh; tools/lib/iphone-run.mjs measureGuard`

Resolution: fixed

phone runs (run/scroll/record/gesture) no longer wait for shared groups by default, print a NOTE and record a mac field; --require-quiet / FW_PHONE_REQUIRE_QUIET=1 restores WAIT; own hold passes; scroll/record/gesture guarded; holds.log line for every run hold. npm test 1037/1037 on 9e92a90 in the main checkout. Rebase between steps (never mid-block); no re-measure.

## I-057: flaky e2e: progress-cli I-048 shared-lane test depends on real host load (load1 > 16 refuses the 2nd reader)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T07:34:05.621Z by ts-i053
- affected: [object Object]
- resolved: 2026-10-02T08:24:13.453Z by lead
- fix: `{"commit":"d26035f67138f148ece789b4fa65373f31a2b076","short":"d26035f671","subject":"tools: FW_LOCK_LOAD1 makes shared-lane CLI tests hermetic (incident I-057)"}`
- remeasure: false

Error: `BUSY chrome-measure: shared by fix-e2e-a ... (load1 19.5 > 16: no new reader joins a loaded host) at tests/e2e/progress-cli.test.mjs:91`

Command: `npm test (pre-commit hook)`

Resolution: fixed

landed on main (d26035f), npm test 1021/1021 in the main checkout; git rebase main. Console server restarted 08:22Z (proposal options live).

## I-058: waits are invisible on the status board; fixed-time waits used where a probe exists (user T-016)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T08:20:04.338Z by lead
- affected: [object Object]
- resolved: 2026-10-02T08:54:09.801Z by lead
- fix: `{"commit":"931630775c6a10bc72b8b7cda40e6dd0178725e4","short":"931630775c","subject":"tools: waits show on the status board by themselves; wait.mjs time needs --reason (incident I-058)"}`
- remeasure: false

Error: `iphone-runner cooled with 'wait.mjs time 9m' instead of 'wait.mjs phone-temp --below auto'; the board showed no wait reason`

Command: `node tools/wait.mjs time 9m`

Resolution: fixed

landed on main, npm test 1031/1031 in the main checkout; console restarted 08:54Z. Pass --owner <you> to wait.mjs (or --as) so your waits show on your board rows; wait.mjs time needs --reason. git rebase main.

## I-059: console: the user can tap Done on a part the runner ends itself (C-021 part 2 marked done 5 s after start, while the phone was still playing versions)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T09:35:04.305Z by lead
- affected: [object Object]
- resolved: 2026-10-02T10:00:16.577Z by lead
- fix: `{"commit":"79c1252cfe3a6dacf2e57086903364dd0769e2b5","short":"79c1252cfe","subject":"console: Start over, attempts and the REDO wake (I-059 B, user T-019)"}`
- remeasure: false

Error: `C-021 part 2: user start 09:31:21Z, user done 09:31:26Z; runner's vis.sh still cycling`

Command: `console step C-021 (kind action, parts)`

Resolution: fixed

(A) fda5653 runner-ended parts: post with --runner-ends N, no Done for the user, 403 on a page Done. (B) 79c1252 Start over (two taps), attempts/epoch, wait exit 5 REDO / --until redo, ack --attempt stale guard. npm test 1043 and 1049 in the main checkout; console server restarted 10:00Z. Runners: rebase between steps; use --runner-ends for parts you end yourself.

## I-060: progress page 'Right now' shows only who holds a device, not what job it runs or for which fix (user T-020)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T09:47:38.560Z by lead
- affected: [object Object]
- resolved: 2026-10-02T10:44:44.158Z by lead
- fix: `{"commit":"6ccb69cda5eb49e4175a8d1fbb0a1486bc54393b","short":"6ccb69cda5","subject":"docs: teach lock.mjs --doing / doing and wait.mjs --reason (incident I-060)"}`
- remeasure: false

Error: `On the phone: iphone-runner since 08:35 (no job, no fix, no ETA)`

Command: `console /progress`

Resolution: fixed

landed 67613fb+6ccb69c, npm test 1071/1071 on main; use lock.mjs --doing/--for/--eta-min, lock.mjs doing, wait.mjs --reason. iphone scroll/record re-pinned (leaseAndMark: one lock write before Safari, timed part unchanged). git rebase main between steps, never mid-block.

## I-061: console: no 'Best build' view of applied fixes with their gains, and of tried-not-applied experiments with reasons (user T-021)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T10:16:20.370Z by lead
- affected: [object Object]
- resolved: 2026-10-02T10:44:44.233Z by lead
- fix: `{"commit":"c9bbd8078d0ee16490ef9ededc180a22afe0f2f2","short":"c9bbd8078d","subject":"tools: a \"Best build\" view on the console: what is in today's best build, how much it helps, what was tried and why not (incident I-061)"}`
- remeasure: false

Error: `feature request T-021`

Command: `console /progress`

Resolution: fixed

landed c9bbd80, npm test 1071/1071; console /build; mgmt-ops-7 fills PROGRESS.json build/inBuild/whyNot/writeup.

## I-062: iPhone screen recorder: hardened Mac-side capture of the phone screen, never a camera (user T-019 #21)

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-02T10:17:10.936Z by lead
- affected: [object Object]
- resolved: 2026-10-02T11:16:53.905Z by lead
- fix: `{"commit":"5395cf0bf1e5052902279f6709d4afa3a7f3bc54","short":"5395cf0bf1","subject":"tools: ioscap holdKind read the real FW_LOCK_SHARED when the given env had none (incident I-062)"}`
- remeasure: false

Error: `no safe recorder: QuickTime opens the Mac camera first (T-018)`

Command: `tools/ioscap (new)`

Resolution: fixed

landed 8ad5236+ec46667+8da7832+5395cf0, npm test 1149/1149 on main. The recorder is NOT cleared for use: its first run waits on review-ioscap and the user's supervised console step. Until then: no recording of any kind.

## I-063: sim.mjs session always cold-boots the Simulator (load1 60-70 for ~1 min), and a shared hold (≤300 s) can't keep a device booted across holds

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T10:56:22.588Z by lead
- affected: [object Object]
- resolved: 2026-10-02T15:51:55.986Z by lead
- fix: `{"commit":"5820539fdfa27c6975ff988bcbc6be5ff77b2ec2","short":"5820539fdf","subject":"tools: warm Simulator review notes: two failed gate reaps end the wait, the keeper backs off, the gate's reap is in the hold's record (incident I-063, review-i063 round 2)"}`
- remeasure: true

Error: `two Sim boots at 10:45Z and 10:51Z pushed load1 to 69 and 59 during a timed phone block (T-011)`

Command: `node tools/lock.mjs run chrome-measure --shared --weight simulator ... -- node tools/sim.mjs session --functional ...`

Resolution: fixed

Landed on main (ab321cb, 123e7d4, 5820539; MEASUREMENT CODE: lib/lock.mjs host gate, verify.mjs, bench.mjs). npm test 1282/1282 on the rebased stack. A run without a warm Simulator measures as before. sim.mjs session now reuses a booted Simulator; a keeper shuts it down after FW_SIM_IDLE_SEC (600 s) or at a timing gate; two failed gate reaps end the wait with WAIT. git rebase main between steps. Re-measure only results whose Sim was warm (simWarm in results).

## I-064: ioscap hardening gaps from review-ioscap (F2-F5): old unhardened recorder tracked in research/, Photo Booth/FaceTime allowed, open -a ioscap skips lease/ask, rebuild keeps Camera grant

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-02T11:19:20.844Z by lead
- affected: [object Object]
- resolved: 2026-10-02T11:53:56.985Z by lead
- fix: `{"commit":"05b195dfb20e49b321e53fbd21da96feee3dd038","short":"05b195dfb2","subject":"tools: ioscap follow-ups: no frame viewing, wrappers unwrapped, ask on the wrapper scripts (incident I-064)"}`
- remeasure: false

Error: `review-ioscap SAFE WITH FIXES: research/architecture/oss-rendering-libs/ioscap.swift list prints device names and requestAccess under the terminal identity`

Command: `swift research/architecture/oss-rendering-libs/ioscap.swift list`

Resolution: fixed

landed 7f02c12 (F2-F5, old recorder deleted on the user's YES in T-019) + 05b195d (no frame viewing, wrappers, wrapper-script asks); npm test on main 1252/1253 and 1212/1213, the single failures are millisecond-boundary flakes in console/proposal tests (I-065), all capture-guard tests pass. First run still needs the user's console step; on hold while the phone is disconnected (T-022).

## I-065: flaky unit test: proposal.test.mjs:301 I-045 --until decided --since (undo woke the wait) failed once under load in npm test on main 7f02c12, passes 6/6 alone

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T11:49:10.408Z by lead
- affected: [object Object]
- resolved: 2026-10-02T14:54:24.993Z by lead
- fix: `{"commit":"9e79e7bb8a184ed881d49070a84a2e57e9baa413","short":"9e79e7bb8a","subject":"tools: one clock instant per console/proposal change; serve.mjs skips ports held on any local address (incident I-065)"}`
- remeasure: false

Error: `AssertionError: --until changed wakes on the undo (actual has an extra ['PR-009','decided','rejected',null] event)`

Command: `npm test (main 7f02c12, shared lane, load1 ~8-20)`

Workaround: re-run npm test; both pass alone 6/6

Resolution: fixed

landed on main; npm test 1257/1257 on the rebased tip. git rebase main between steps.

## I-066: serve.mjs in a sparse worktree picks the worktree's leftover site/ (only the ignored site/.mirror/missing-local.txt remains after baseline.mjs sparse) instead of the main checkout's baseline

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T12:48:27.664Z by fix-image-size
- affected: [object Object]
- resolved: 2026-10-02T14:54:25.314Z by lead
- fix: `{"commit":"b6577b6f9ff5b4f0726cbe2e2fc56d3b8e69eb8a","short":"b6577b6f9f","subject":"tools: a sparse worktree's leftover site*/ no longer shadows the main checkout's baseline (incident I-066)"}`
- remeasure: false

Error: `No <worktree>/site/.mirror/manifest.json — run node tools/mirror.mjs in the main checkout first (or set FW_MIRROR_HOME).`

Command: `node tools/serve.mjs --root site-pretty --port auto --state out/image-size/serve-base.json`

Workaround: fails loudly, nothing served wrong: use node tools/fix.mjs serve <topic>, or prefix FW_MIRROR_HOME=/Users/<user>/source/fastwork-com-web-optimize for a plain baseline serve

Resolution: fixed

landed on main; npm test 1257/1257. git rebase main between steps.

## I-067: fix.mjs diff records overlay images only as 'Binary files differ' (+ base sha256): patch.diff cannot rebuild a binary overlay (fix.mjs apply)

- status: parked
- class: tool
- blocking: false
- reported: 2026-10-02T12:49:08.578Z by fix-image-size
- affected: [object Object]

Error: `wrote fixes/image-size/patch.diff: 45 file(s), +0 -0 lines`

Command: `node tools/fix.mjs diff image-size`

Workaround: for image overlays: README manifest (path, natural before/after, bytes, sha256 after, exact sips command) plus a rebuild script; patch.diff keeps the 'Binary files differ' + base sha256 lines as the file list

## I-068: console.mjs thread wait --timeout 3600 ran 71 min without exiting (killed by the harness's background cap)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T13:11:31.791Z by lead
- affected: [object Object]
- resolved: 2026-10-02T13:42:21.845Z by lead
- remeasure: false

Error: `started 11:59:40Z, no output after the first line, killed 13:11Z; expected TIMEOUT exit 3 at ~12:59:40Z`

Command: `node tools/console.mjs thread wait --as lead --timeout 3600`

Workaround: re-arm after each wake; use --timeout 3500 so the harness cap is never the one that ends it

Resolution: not-a-bug

env: the Mac idle-slept (Maintenance Sleep 12:55:42-13:11:09Z) through the wait's deadline; wall-clock deadline correct, TIMEOUT works (6 on-time exits today + 8 s repro). Keep-awake is the user's decision (console).

## I-069: sim.mjs safari-restart --url fails when Safari restores a data:text/html tab (navigate on the restored data: tab never lands)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T14:45:14.210Z by fix-image-size
- affected: [object Object]
- resolved: 2026-10-02T15:51:56.063Z by lead
- fix: `{"commit":"4847844888d572f57b2ef782613a40eb24d45434","short":"4847844888","subject":"tools: safari-restart --url opens a fresh tab when the restored tab's navigation does not land, and names a server that is gone (incident I-069)"}`
- remeasure: false

Error: `safari-restart: Safari did not show http://localhost:5461/ within 40 s: no tab matching the matcher; targets: data:text/html, [PID]`

Command: `node tools/sim.mjs safari-restart --url http://localhost:5461/ --timeout 40 (inside sim.mjs session --functional)`

Workaround: Likely not a tool bug: my mirror servers had died (background job killed when the Mac slept), so Safari showed its error page, which is the data:text/html tab. Restarting the servers detached (nohup) fixed it, and safari-restart --url then worked for every arm (14:55Z session). Suggest closing as user error, or adding a hint that a data: tab means the server is unreachable.

Resolution: fixed

Landed on main. safari-restart --url opens a fresh tab when the restored tab's navigation doesn't land, and names a dead server (HEAD probe). Follow-up: limit the probe to loopback/LAN and print a safe() target (ts-i063). git rebase main between steps.

## I-070: Measurement holds don't keep the Mac awake (user C-024: keep awake only during measurements)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T14:55:02.698Z by lead
- affected: [object Object]
- resolved: 2026-10-02T15:30:28.176Z by lead
- fix: `{"commit":"c6301fe9009959b014bfbf93b031398458eff171","short":"c6301fe900","subject":"tools: keep the Mac awake only during measurements: timing holds, phone parts, Sim sessions (incident I-070)"}`
- remeasure: false

Error: `Mac idle sleep 5x since 12:27Z voided a Sim session; user chose caffeinate only during measurements`

Command: `node tools/lock.mjs run chrome-measure … / sim.mjs session / iphone.mjs scroll\|record\|run`

Workaround: None needed: existing I-026 tooling (lib/awake.mjs) already runs caffeinate -i -s -w <pid> on every chrome-measure hold. Don't add your own caffeinate. I-070 narrows I-026 to measurement holds only (user C-024) and adds phone parts plus sim.mjs session.

Resolution: fixed

Landed on main; npm test 1264/1264 in the main checkout. The Mac stays awake (caffeinate -i -s) only for timing holds, phone parts and Sim sessions (user C-024). Queue waiters, shared, short and build holds no longer keep it awake. Open follow-ups: wrapper-script detection, a doctor awake check, a CLAUDE.md note. git rebase main between steps.

## I-071: test:chrome check.chrome test fails: fix.mjs check writes no check.json (after I-063/I-069 landed on 4847844)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T16:24:56.605Z by lead
- affected: [object Object]
- resolved: 2026-10-02T17:33:18.619Z by lead
- remeasure: false

Error: `ENOENT ... out/check/breaks-page/<ts>/check.json (tests/chrome/check.chrome.test.mjs:43)`

Command: `npm run test:chrome (main 4847844)`

Resolution: not-a-bug

ts-i063 bisect: check.chrome passed 2/2 at ed9b813 and 2/2 (twice) at 4847844. The 15:52:28Z failure coincides with Idle Sleep entry at ~15:52:35Z (pmset), so it was a sleep, not the I-063/I-069 stack. Hardening: the test will assert check.json exists and print r.out (ts-i063 follow-up). The rest of test:chrome is being re-run on main.

## I-072: e2e WDA tests leave fake-xcodebuild/fake-iproxy orphans running (ppid 1, 14 h)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T21:16:51.148Z by lead
- affected: [object Object]
- resolved: 2026-10-02T23:54:29.964Z by lead
- fix: `{"commit":"7cbbd323509cb5d7d5880d3fe16579768bcc5dc2","short":"7cbbd32350","subject":"tools: npm test at concurrency 6, ~162 s instead of ~299 s (incident I-076); WDA/Simulator fixtures never outlive their test (incident I-072)"}`
- remeasure: false

Error: `3 orphan node fixture processes from worktree agent-ad617eb22b8c0bfb3 (fake-xcodebuild test-without-building x2, fake-iproxy 8100:8100), started ~07:00Z, killed by lead 21:17Z`

Command: `npm test (tests/e2e/iphone-gesture\|sim\|sim-warm)`

Resolution: fixed

## I-073: LAN address is typed by hand and hardcoded (docs, comments, agent scripts); Wi-Fi reconnect changed it (user T-026)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T21:48:04.749Z by lead
- affected: [object Object]
- resolved: 2026-10-02T22:18:26.006Z by lead
- fix: `{"commit":"5ed4788b6c1c69b9ae4af87c55dd2a424960e155","short":"5ed4788b6c","subject":"docs: phone URLs name the lan placeholder, resolved at run time; node tools/lan.mjs prints the address (incident I-073, user T-026)"}`
- remeasure: false

Error: `Mac LAN address changed on Wi-Fi reconnect 21:40Z; iphone-runner's g2.sh/p065.sh and CLAUDE.md examples had the old one`

Command: `iphone.mjs open / lock.mjs acquire iphone --url`

Resolution: fixed

## I-074: proposal page cannot embed live baseline/PoC pages (user T-028)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T22:10:00.914Z by lead
- affected: [object Object]
- resolved: 2026-10-02T23:11:25.757Z by lead
- fix: `{"commit":"549205ce662b4b03f912c5b759b7fca1244eb051","short":"549205ce66","subject":"tools(I-074): \"Try it\" in console proposals: scroll the original and the PoC page side by side"}`
- remeasure: false

Error: `X-Frame-Options SAMEORIGIN refuses framing from the console origin (port 5559)`

Command: `console.mjs serve + proposal show`

Resolution: fixed

## I-075: Phone tooling for work-at-rest heat: no scheduled battery logger, BATTERY_KEYS lacks power keys, servedHashes re-fetches live third-party pages with no skip

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T22:45:50.854Z by de-heat
- affected: [object Object]
- resolved: 2026-10-02T23:24:49.741Z by lead
- fix: `{"commit":"56f3862eaa3c8558188ce9313f431f282cff3420","short":"56f3862eaa","subject":"tools(I-075): skip the served re-fetch for non-local pages, battery power keys, iphone.mjs battery logger"}`
- remeasure: false

Error: `iphone-run.mjs servedHashes() runs unconditionally after every iphone.mjs run (no flag); BATTERY_KEYS = Temperature, IsCharging, ExternalConnected, FullyCharged, CurrentCapacity, MaxCapacity only`

Command: `node tools/iphone.mjs run --driver window ... (on https://www.apple.com/macbook-pro/, ticket research/phone-heat P-068)`

Resolution: fixed

## I-076: npm test wall time (285 s) is close to the shared lane's 300 s cap

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T23:11:43.180Z by lead
- affected: [object Object]
- resolved: 2026-10-02T23:54:29.880Z by lead
- fix: `{"commit":"7cbbd323509cb5d7d5880d3fe16579768bcc5dc2","short":"7cbbd32350","subject":"tools: npm test at concurrency 6, ~162 s instead of ~299 s (incident I-076); WDA/Simulator fixtures never outlive their test (incident I-072)"}`
- remeasure: false

Error: `I-073/I-074 land runs: duration_ms 285319 and 285221 under --max-seconds 300; a slower host or more tests will get killed at 300 s (exit 124)`

Command: `lock.mjs run chrome-measure --shared --weight 2 --max-seconds 300 -- npm test`

Resolution: fixed

## I-077: iphone.mjs open can't reach Safari after a run parked it (only about:blank views listed)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-02T23:59:57.080Z by lead
- affected: [object Object]
- resolved: 2026-10-03T00:40:27.358Z by lead
- fix: `{"commit":"e5cb15a93efca7c0bcba1a518b9d6205a4cd98d4","short":"e5cb15a93e","subject":"tools: iphone.mjs open can't reach Safari after a park (only about:blank views listed) (incident I-077)"}`
- remeasure: false

Error: `BLOCKED: cannot reach Safari tab (after iphone.mjs run's default park, I-047)`

Command: `iphone.mjs run ... (parks) then iphone.mjs open <url>`

Resolution: fixed

npm test on main 1339/1339 (169 s). open after a park uses Safari's visible parked tab (recorded appId) or falls back to safari-restart with a reason. Rebase between blocks, never inside one (tool file hashes in run records change; measurement code unchanged). Real-phone check of the parked-tab path: iphone-runner's first default-park run after P-036.

## I-078: sim session refuses when fw-sim is in transitional 'Shutting Down' at join (twice in a row)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T00:43:23.826Z by de-countdown
- affected: [object Object]
- resolved: 2026-10-03T01:23:08.921Z by lead
- fix: `{"commit":"ba79209bf74cf7f320eb5319fe7ce270e017f5f7","short":"ba79209bf7","subject":"tools: sim session refused a fw-sim still Shutting Down as \"booted by someone else\" (incident I-078)"}`
- remeasure: false

Error: `refusing: fw-sim 15 Pro Max is already Shutting Down (booted by someone else, or a leaked session: node tools/sim.mjs doctor)`

Command: `node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner countdown-faces -- node tools/sim.mjs session --functional --owner countdown-faces -- node fixes/countdown-faces/f146.mjs base,poc`

Workaround: Wait until the Simulator has finished shutting down (node tools/sim.mjs doctor shows Shutdown), then run your session again; a toolsmith (ts-i078) is fixing the join so it waits out a transition by itself.

Resolution: fixed

sim session join and cleanup wait out a transitional fw-sim state (Creating/Booting/Shutting Down) up to FW_SIM_TRANSITION_SEC (60 s); doctor reports it as in progress. npm test on main 1343/1343. No measurement code changed: git rebase main between steps, no re-measure.

## I-079: iphone.mjs gesture cannot record WebKit Timeline during a WDA gesture run (needed for P-071 attribution)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T02:58:49.802Z by iphone-runner
- affected: [object Object]
- resolved: 2026-10-03T03:54:21.124Z by lead
- fix: `{"commit":"0411b086285b16e83ce549eb91a001d1e46ea801","short":"0411b08628","subject":"tools: iphone.mjs gesture could not record a WebKit Timeline during a WDA run (incident I-079)"}`
- remeasure: false

Error: `no --timeline in gesture-run; one inspector per page (I-038) and --inject only evaluates page JS, so Page.disable/enable + Timeline.start cannot be sent beside a gesture`

Command: `iphone.mjs gesture pin-hold-v2.json (P-071 attribution runs: V at pin, D cycle phase)`

Resolution: fixed

iphone.mjs gesture --timeline <out.json>: F-047 start sequence on the run's own connection, re-sent per page load and reconnect; per-segment {syncT, syncTL, recs, offsetMs}. npm test on main 0411b08: 1350/1350. Rebase main between blocks (not mid-P-071), then use --timeline for the F3 attribution runs. No Chrome measurement code changed: no re-measure.

## I-080: a shared-lane group leaves chrome-measure.last-grant.json marked short after it ends (doctor: last-grant-short-outlived)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T05:34:45.041Z by lead
- affected: [object Object]
- resolved: 2026-10-03T06:04:00.711Z by lead
- fix: `{"commit":"6a59c2a2c207e6214eb0bf9bd16ea5dd4c234384","short":"6a59c2a2c2","subject":"tools: a shared group left its last-grant record behind on an idle lock (incident I-080)"}`
- remeasure: false

Error: `[last-grant-short-outlived] no holder, but the record still says the last grant was short: "(shared)" (short, max 300 s)`

Command: `node tools/lock.mjs doctor (after shared groups at 05:17Z and 05:27Z)`

Resolution: fixed

a shared group now removes its last-grant record when it ends (unless an exclusive waiter is queued); new doctor code last-grant-group-closed. Decision-neutral, no re-measure. npm test 1355/1355 on main. Exclusive --short leftover stays open as I-081.

## I-081: an exclusive --short grant also leaves a short last-grant record on an idle lock (doctor: last-grant-short-outlived)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T06:00:06.917Z by ts-i080
- affected: [object Object]
- resolved: 2026-10-03T06:34:10.200Z by lead
- fix: `{"commit":"03b3d81a0578eb6af53147423513ef747db1ca1a","short":"03b3d81a05","subject":"tools: an exclusive short grant left its last-grant record behind on an idle lock (incident I-081)"}`
- remeasure: false

Error: `[last-grant-short-outlived] no holder, but the record still says the last grant was short (exclusive short, not a group)`

Command: `lock.mjs acquire --short, release, then lock idle > maxSec + 35 s; node tools/lock.mjs doctor`

Resolution: fixed

an exclusive short grant now removes its own last-grant record when it ends with nobody queued; new doctor code last-grant-short-closed. Queue decisions at hand-overs unchanged; intended: a short on an idle lock after an ended short starts a new drain run (lead accepted). npm test 1363/1363 on main. Rebase main between steps.

## I-082: Simulator background process SleepWidgetExtension burns a full core during Sim sessions; host load1 37-108 while counts run

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-03T06:44:55.280Z by lead
- affected: [object Object]
- resolved: 2026-10-03T07:27:00.181Z by lead
- fix: `{"commit":"17e7d048ba3f848d025f1a7641846fbc1fbc8e83","short":"17e7d048ba","subject":"tools: Sim sessions ran their commands in the Simulator's own background CPU storm, unrecorded (incident I-082)"}`
- remeasure: false

Error: `load1 108.5, SleepWidgetExtension 100 % CPU, sim diagnosticd 57 %, WebContent 91 % (06:44Z, hero-exit Sim session)`

Command: `sim.mjs session (any)`

Resolution: fixed

Sim sessions now settle (<=60 s, quarter of the command time) and record the Simulator's own background CPU (SIM_QUIET / SIM_BACKGROUND, sim/background.jsonl, meta.sim.background). Read-only. npm test 1373/1373 on main. Measurement change for Sim counts only: compare Sim counts only within one session; don't mix arms across the rebase. git rebase main between steps.

## I-083: Rendering cost card tool (tools/costcard.mjs) for per-fix cost cards (user T-029 #23)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T08:47:53.943Z by lead
- affected: [object Object]
- resolved: 2026-10-03T10:01:47.626Z by lead
- fix: `{"commit":"07b16daddfa25475b19cf95161c34e3c630c5364","short":"07b16daddf","subject":"tools: rendering cost card tools/costcard.mjs (incident I-083)"}`
- remeasure: false

Error: `no shared tool: each fix owner builds its own per-event count probes`

Command: `research/architecture/isolated-measurement/README.md §6`

Resolution: fixed

cost card tool landed; npm test 1405/1405 on main. Use: node tools/costcard.mjs (see its --help)

## I-084: Console answer panels don't say who receives the answer (user T-038)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T09:09:19.180Z by lead
- affected: [object Object]
- resolved: 2026-10-03T10:07:27.547Z by lead
- fix: `{"commit":"5928e7b87cb15e2d7a0259c756665beed45e990f","short":"5928e7b87c","subject":"tools: console answer panels did not say who receives the answer (incident I-084)"}`
- remeasure: false

Error: `user can't tell which agent gets an answer to a step, thread or proposal`

Command: `console.mjs serve (step, thread and proposal pages)`

Resolution: fixed

on main; npm test 1415/1415; console restarted. Agents may add --topic <id> to console.mjs post

## I-085: Steps page may print 'nullnull' above answer buttons (append(null) in answerPanel)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T09:18:55.756Z by ts-recipient
- affected: [object Object]
- resolved: 2026-10-03T10:07:27.462Z by lead
- fix: `{"commit":"a99dbd241bc30b4aeb6d308bfd9fbb7d69371f89","short":"a99dbd241b","subject":"tools: steps page printed \"nullnull\" above answer buttons (incident I-085)"}`
- remeasure: false

Error: `console-page.html answerPanel: box.append(h3, sc ? label : null, scaleRow /* null without --scale */, opts, notes); DOM append() turns null into the text 'null' (WebIDL (Node or DOMString) conversion)`

Command: `console.mjs serve, a question/choice/swipe-pair step without --scale, answer phase`

Resolution: fixed

on main; npm test 1415/1415; console restarted

## I-086: sim.mjs gesture refuses a --no-timing hold, and WDA is refused in a --functional session: no lane fits a counts-only WDA Simulator job (F-166)

- status: parked
- class: tool
- blocking: true
- reported: 2026-10-03T09:30:45.340Z by fix-nav-morph
- affected: [object Object]

Error: `gesture: refusing: your chrome-measure hold is a no-timing hold (lock.mjs run --no-timing: no host gate), and scroll, record and run are timing. Run them in a normal hold`

Command: `node tools/lock.mjs run chrome-measure --no-timing --max-seconds 600 --owner fix-nav-morph -- node tools/sim.mjs session --owner fix-nav-morph -- sh -c 'node tools/sim.mjs wda start && node fixes/nav-morph/costcard-sim.mjs C,V,D,C2 --rep 1'`

Workaround: counts-only WDA Sim jobs: one normal hold per rep (lock.mjs run chrome-measure --max-seconds 420 --doing 'Sim cost card, counts only'), queued only when no phone block is running

## I-087: sim.mjs drives only fw-sim: no iPad device and no rotation (user T-040)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T10:03:09.206Z by lead
- affected: [object Object]
- resolved: 2026-10-03T12:34:02.770Z by lead
- fix: `{"commit":"3547d890741fbfe87296672700034846b4cb8c42","short":"3547d89074","subject":"tools: sim.mjs drove only fw-sim: no iPad device and no rotation (incident I-087)"}`
- remeasure: false

Error: `sim.mjs: one device (fw-sim); wda.mjs allowlist refuses orientation`

Command: `node tools/sim.mjs session --functional`

Resolution: fixed

## I-088: fw-sim left Booted with no live session; sim.mjs session refuses to start

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-03T10:03:59.390Z by cd-roll-ca
- affected: [object Object]
- resolved: 2026-10-03T12:34:02.861Z by lead
- fix: `{"commit":"1658376824299c9286385ee7df6832cb28de99d8","short":"1658376824","subject":"tools: sim session called a device still shutting down a leak (incident I-088)"}`
- remeasure: false

Error: `refusing: fw-sim 15 Pro Max is already Booted (booted by someone else, or a leaked session: node tools/sim.mjs doctor)`

Command: `node tools/lock.mjs run chrome-measure --shared --weight simulator ... -- node tools/sim.mjs session --functional --owner cd-roll-ca -- node fixes/cd-roll-ca/simpx.mjs C8,V9 fade50 wrap,wrapUp`

Workaround: Transient: the previous session's shutdown was still in progress (0.5 s gap). Run sim.mjs doctor; if it shows nothing booted, simply requeue. Do not --fix unless doctor still shows LEAK after 30 s.

Resolution: fixed

## I-089: Console threads can't show images (user PR-009 note)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T10:32:05.967Z by lead
- affected: [object Object]
- resolved: 2026-10-03T11:44:41.943Z by lead
- fix: `{"commit":"a5b592df82ec2ae2e825bfbbd083e97df1faeaa6","short":"a5b592df82","subject":"tools: console threads can't show images (incident I-089)"}`
- remeasure: false

Error: `thread reply takes text/--file only; no image`

Command: `node tools/console.mjs thread reply`

Resolution: fixed

npm test 1425/1425 on a5b592d in a clean checkout; console restarted 11:45Z. T-044 label landed with it (1b10f11).

## I-090: Console: comment on any element, like artifact comments (user T-043)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T10:37:35.875Z by lead
- affected: [object Object]
- resolved: 2026-10-03T12:34:02.944Z by lead
- fix: `{"commit":"72d628a297352ca67e4893cf26a8564d711de490","short":"72d628a297","subject":"tools: comments on console items, like artifact comments (incident I-090, user T-043)"}`
- remeasure: false

Error: `no way to ask about a specific item on a console page`

Command: `console pages (steps, proposals, threads, status)`

Resolution: fixed

## I-091: iphone.mjs run renews the iphone lease to now+900 s before every run, shortening a longer lease

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T12:06:52.099Z by iphone-runner
- affected: [object Object]
- resolved: 2026-10-03T12:45:36.185Z by lead
- fix: `{"commit":"4fec8aab49a453d347528db1a4660b97e9666773","short":"4fec8aab49","subject":"tools: lease renew never shortens a live lease (incident I-091)"}`
- remeasure: false

Error: `lease renewed to 11:56:49Z at 11:26:44Z showed until 11:46:44Z after a run at 11:31:44Z, then went stale mid-block`

Command: `node tools/iphone.mjs run --driver window ... (tools/lib/iphone-run.mjs:261-262: renew --ttl max(900, need))`

Workaround: renew the iphone lease right after every hold ends and before each requeue (lock.mjs renew iphone --ttl 1800)

Resolution: fixed

## I-092: console threads page: image lightbox always shown, blocks every click

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-03T14:31:22.402Z by lead
- affected: [object Object]
- resolved: 2026-10-03T14:36:39.642Z by lead
- fix: `{"commit":"01a40fa067f65fa4b4fd310987f9919aa57e4168","short":"01a40fa067","subject":"tools: console threads page image lightbox always shown, blocking every click (incident I-092)"}`
- remeasure: false

Error: `'Open in a new tab' overlay covers the threads page; .lightbox{display:flex} overrides the hidden attribute`

Command: `open http://localhost:5559/threads`

Resolution: fixed

every console page has [hidden]{display:none!important}; pages are read per request, so a reload fixes it (no console restart)

## I-093: console Try it can only compare against the plain baseline: fixes stacked on st6-rb2 show st6-rb2's own changes in B

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-03T14:44:43.185Z by lead
- affected: [object Object]
- resolved: 2026-10-03T16:16:01.631Z by lead
- fix: `{"commit":"e60d691f95e7635aa49dd2745262406ecbb1a642","short":"e60d691f95","subject":"tools: console Try it can name its own A, e.g. the current best build (incident I-093)"}`
- remeasure: false

Error: `live A is always site-pretty; B = baseline + whole patch.diff (user PR-010 rev2 carousel note, PR-011 Try-it request)`

Command: `console proposals Try it panel`

Resolution: fixed

console Try it can name its own A (live.a / --live-a-patch), e.g. fixes/best-build/patch.diff; npm test on main 1467/1467; console restarted. Proposal authors: --live-a-patch fixes/best-build/patch.diff --live-a-ref main to compare a fix against the best build.

## I-094: unit test I-087 sim-orient fails while the phone's WDA runner is up on :8100

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T14:48:54.383Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-03T15:15:14.655Z by lead
- fix: `{"commit":"14ffdc4364369b5046d5b90ecb79bf36ae476ac5","short":"14ffdc4364","subject":"tools: sim-orient refuses the phone's WDA port before any request (incident I-094)"}`
- remeasure: false

Error: `AssertionError: input did not match /port 8100 is the phone's/; actual: WDA POST /session: ECONNRESET`

Command: `node --test tests/unit/sim.test.mjs (npm run test:unit on main cc41a70, ops branch with no tooling change)`

Resolution: fixed

A Simulator-marked WDA call is refused before any request when the base is not WDA-sim's (port 8100, no port). npm test passes on main 14ffdc4 (shared lane, exit 0). git rebase main between steps.

## I-095: Disk full: ENOSPC on the Data volume (1.1-1.3 GB free of 460 GB)

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-03T15:29:59.473Z by fix-carousel-leaver
- affected: [object Object]
- resolved: 2026-10-03T18:16:46.095Z by lead
- fix: `{"commit":"cbc38ee4981394383e576be4c82237451fffbbcf","short":"cbc38ee498","subject":"docs: say plainly where temp profiles still leak; space report classes and hold rule (review-i095)"}`
- remeasure: false

Error: `ENOSPC: no space left on device, open .../tasks/<id>.output`

Command: `any Bash call / Write in worktree and scratchpad`

Resolution: fixed

Temp-profile cleanup, read-only space report (tools/space.mjs) and low-space warnings landed; npm test on main db5db67: all I-095 tests pass (1516/1517, the one failure is I-099, unrelated). Data volume now 14 GB free. Rebase main between steps.

## I-096: console comments: the user can comment only on the Threads page, not on Status or other pages (T-043 #6)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T15:35:42.465Z by lead
- affected: [object Object]
- resolved: 2026-10-03T16:38:16.542Z by lead
- fix: `{"commit":"ead0a10462b0e214a69be9f98c16a619a6322c7e","short":"ead0a10462","subject":"tools: comment on any line of every console page (incident I-096, user T-043)"}`
- remeasure: false

Error: `user T-043 #6, 15:32Z, after the console restart (pid 37656, I-090 code live, /api/comments 200 on every page, script tag present on all 6 pages)`

Command: `console http://localhost:5559/status (desktop browser)`

Resolution: fixed

Every console page can be commented anywhere: each page wrapper is a fallback anchor, list rows carry their own anchors. npm test on main 1479/1479. No measurement code; nothing to re-measure. Rebase main between steps.

## I-097: lock: a lead-moved phone hold (no-timing, #1) is passed again and again by shared readers under the 10-min reader rule (I-049); P-085 session 2 waited 10+ min while the phone cooled

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T16:35:29.836Z by lead
- affected: [object Object]
- resolved: 2026-10-03T18:16:46.168Z by lead
- fix: `{"commit":"5fab2ced00a8eeabfa80e0b65db784f7dcef4b6c","short":"5fab2ced00","subject":"tools: a lead-moved waiter is passed by readers past the 10-min rule; no way to leave a queue; signal kills bounded runs at once (incident I-097)"}`
- remeasure: false

Error: `iphone-runner #1 (moved by lead) since 16:24Z, still waiting at 16:34Z behind readers queued >10 min`

Command: `node tools/lock.mjs status chrome-measure`

Resolution: fixed

A lead-moved exclusive waiter now beats the 10-min reader rule and closes joins; lock.mjs leave added; docs 5c125ed. npm test on main db5db67: 1516/1517; the one failure is the kill-grace reap race under load, tracked as I-099 (non-blocking). Rebase main between steps, especially iphone-runner.

## I-098: Mac idle-slept 17:23Z, then a thermal-emergency sleep in dark wake until 17:38Z; every agent froze for 15 min

- status: triaged
- class: env
- blocking: false
- reported: 2026-10-03T17:41:19.957Z by lead
- affected: [object Object], [object Object]

Error: `pmset: Entering Sleep state due to 'Idle Sleep' 00:23:02 +0700, then 'Dark Wake Thermal Emergency' 00:23:14; DarkWake 00:38:16`

Command: `pmset -g log`

## I-099: lock.mjs run can exit (and release) before a hard-killed SIGTERM-ignoring command is gone; e2e test fails under load

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T18:16:40.888Z by lead
- affected: [object Object]
- resolved: 2026-10-03T18:44:37.130Z by lead
- fix: `{"commit":"6d74b22fb27e223ff6793d6857b812b75bcef036","short":"6d74b22fb2","subject":"tools: a bounded run waits until its killed tree is gone before it releases; deadline test read pid 0 (incident I-099)"}`
- remeasure: false

Error: `lock-shared-cli.test.mjs:160 the SIGTERM-ignoring command is dead: true !== false`

Command: `npm test on main db5db67 (two suites side by side, load1 ~14-17); passes 3/3 alone`

Resolution: fixed

Cause: the deadline test read an empty pid file (pid 0, kill(0,0) hits the test's own group). Hardening: a bounded run now waits up to 1.5 s for the killed tree to be gone before it releases; survivors are named in holds.log. npm test on main 1542/1542, no sleep inside. No re-measure: measurement code unchanged; git rebase main.

## I-100: sim.mjs cannot set reduced motion on the Simulator; T2 'reduced motion exact' has no WebKit leg

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T19:21:40.831Z by lead
- affected: [object Object]
- resolved: 2026-10-03T19:50:37.076Z by lead
- fix: `{"commit":"08684c7820e89bf1b8645a151ac92c0a4d4bc6b9","short":"08684c7820","subject":"tools: sim.mjs had no way to set Reduce Motion on the Simulator (incident I-100)"}`
- remeasure: false

Error: `no reduced-motion option in sim.mjs or its libs; simctl ui offers appearance/increase_contrast/content_size only`

Command: `node tools/sim.mjs session --functional`

Resolution: fixed

sim.mjs session --reduce-motion on|off sets com.apple.Accessibility ReduceMotionEnabled before Safari launches, checks prefers-reduced-motion on every open, restores at session end (crash-safe record). npm test on main 1556/1556, no sleep inside. WebKit side CONFIRMED (10740b3a), defaults key OBSERVED. Rebase main, then add --reduce-motion on for a WebKit reduced-motion leg.

## I-101: test:unit: two tests hang ~920 s and fail (caffeinate test, hung-git baseline check)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-03T22:16:52.780Z by fix-rest-script
- affected: [object Object]
- resolved: 2026-10-03T23:00:37.874Z by lead
- remeasure: false

Error: `✖ a test process never starts a real caffeinate: without FW_CAFFEINATE, no assertion (holds or processes) (919643ms); ✖ a hung git in the check: state timeout after FW_BASELINE_GIT_TIMEOUT_MS (921869ms)`

Command: `npm run test:unit (worktree agent-a326003adcb764633, branch worktree-agent-a326003adcb764633, twice 21:43Z and 22:00Z; 21:00Z run was 835/0)`

Resolution: duplicate

see I-098. Not a tool bug: both test:unit runs started seconds before a Maintenance Sleep (21:43:31-21:58:58Z and 22:00:07-22:15:26Z; pmset). The two ~920 s hangs equal the sleep lengths (927 s, 919 s): the tests' wall-clock waits spanned the sleep. Workaround: re-run npm run test:unit while the Mac is fully awake; a hang of about a sleep's length with a matching pmset Sleep is I-098, not a new incident.

## I-102: unit test I-087 sim-orient fails: orient() reaches WDA before refusing the phone's port 8100

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T02:53:59.124Z by fix-cd-strip
- affected: [object Object]
- resolved: 2026-10-04T02:54:41.878Z by lead
- fix: `{"commit":"14ffdc4364369b5046d5b90ecb79bf36ae476ac5","short":"14ffdc4364","subject":"tools: sim-orient refuses the phone's WDA port before any request (incident I-094)"}`
- remeasure: false

Error: `AssertionError: input did not match /port 8100 is the phone's/; got 'WDA POST /session: ECONNREFUSED'`

Command: `npm run test:unit (tests/unit/sim.test.mjs:454), branch base 3db7016`

Resolution: fixed

Already fixed on main by I-094 (14ffdc43); tests/unit/sim.test.mjs passes 26/26 on main 9064424d. The branch's base 3db7016 predates it: git rebase main.

## I-103: console /proposals: comment button overlaps the 'open in a new tab' link of an option (user T-056)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T03:00:04.031Z by lead
- affected: [object Object]
- resolved: 2026-10-04T03:42:47.804Z by lead
- fix: `{"commit":"e9f08c059f2e2addf03015daf4c1c74eeac9a795","short":"e9f08c059f","subject":"tools: console Comment button covered other controls, e.g. an option's \"open in a new tab\" link (incident I-103)"}`
- remeasure: false

Error: `user: comment button hides another button a bit, making it harder to click (not a blocker)`

Command: `console /proposals, PR-013 option B 'open in a new tab'`

Resolution: fixed

Console Comment button now avoids other controls and is an icon; console restarted on :5559. No re-measure.

## I-104: console: link Status rows and Progress items both ways (user T-057)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T03:22:11.590Z by lead
- affected: [object Object]
- resolved: 2026-10-04T05:39:31.715Z by lead
- fix: `{"commit":"0f8bcaaa472ac0872df3abb81285e169feee91b9","short":"0f8bcaaa47","subject":"tools: console Status rows and Progress items did not link to each other (incident I-104)"}`
- remeasure: false

Error: `user: hard to see which Progress item a Status row belongs to; wants clickable links between them`

Command: `console /status and /progress`

Resolution: fixed

Status rows link to their Progress item and Progress items link back to the Status row (user T-057). Console restarted.

## I-105: Idle alarm: iPhone lease or chrome-measure free > N min while ready work waits (user T-058 #4)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T03:29:07.557Z by lead
- affected: [object Object]
- resolved: 2026-10-04T04:08:17.755Z by lead
- fix: `{"commit":"7c71e7f5a1d208dda1491c9d26de58ebc1797e72","short":"7c71e7f5a1","subject":"tools: no tool noticed an idle iPhone lease or chrome-measure lock while work waited (incident I-105)"}`
- remeasure: false

Error: `no tool notices an idle iPhone/Chrome slot while a PASSed phone ticket or queued measurement waits`

Command: `node tools/lock.mjs status`

Resolution: fixed

Idle alarm landed: node tools/idle.mjs check (lead/ops at check-ins); lead runs watch --by lead --interval 60 detached (started 04:08Z). Lock library now writes <lock>.last-release.json (no lock decision reads it).

## I-106: Chrome throwaway profile left behind when a lock job is hard-killed (SIGKILL after the time limit; Ctrl-C on shared/short jobs)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T03:31:15.312Z by lead
- affected: [object Object]
- resolved: 2026-10-04T05:21:08.816Z by lead
- fix: `{"commit":"2887d47797c0dc4a862d1a31e63ea37a5b3acff3","short":"2887d47797","subject":"tools: a hard-killed lock job left its throwaway Chrome profile behind (incident I-106)"}`
- remeasure: false

Error: `profile folder stays in out/ after kill -9 (I-095 gap)`

Command: `node tools/lock.mjs run chrome-measure --shared --max-seconds N -- <probe>`

Resolution: fixed

Bounded lock runs (--short, --shared) now remove the throwaway Chrome profiles of a killed command (marker + pid + start-time checked; nothing by pattern). tools/lib/cdp.mjs change is bookkeeping only (appends to $FW_RUN_PROFILES); persistent profiles used by verify.mjs / fix.mjs ab are untouched, so A/B comparability is unchanged. git rebase main between steps.

## I-107: npm test ran without the chrome-measure lock during the P-088 phone hold h032856

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-04T03:42:24.035Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T03:45:33.300Z by lead
- remeasure: false

Error: `ts-i103 npm test 03:36:30-03:40:31Z unleased; load1 12.0/9.1/7.8/5.5 at S1/C1/N1/Fb1 starts`

Command: `npm test (ts-i103, outside lock.mjs run)`

Resolution: answered

Ruled 03:42Z: P-088 row 1 counts but is flagged Mac-loaded; verdict reported with all rows and rows 2-3 only; if they differ, Mac-load-sensitive, no hit. Rule restated to ts-i103 and ops: hold the shared lease before a commit whose hook runs npm test; never commit while the acquire is queued.

## I-108: Status board shows an agent's plain 'thread wait' listener as 'waiting for a user reply'; the user reads it as a request (T-061, T-055 #5/#8)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T03:47:28.547Z by lead
- affected: [object Object]
- resolved: 2026-10-04T05:25:44.150Z by lead
- fix: `{"commit":"8625df4fbd31a95e7603d620d32a3f14faf29f6e","short":"8625df4fbd","subject":"tools: status board kept out-of-date rows unmarked, counted wait time from the first wait and showed ownerless waits as a bare unknown (incident I-108)"}`
- remeasure: false

Error: `board line: waiting for a user reply in a console thread or a proposal decision`

Command: `node tools/console.mjs thread wait --as <agent>`

Resolution: fixed

Part 1 32b6180f + part 2 8625df4f: listener lines are not waits; rows not updated for 45 min say 'may be out of date' (status.mjs stale lists them with reasons); wait time counts from the last change of the wait; ownerless waits run with a NOTE and show 'owner unknown' (pass --owner); lock.mjs wait takes --reason. Console restarted. git rebase main, then set your rows again so they record your branch.

## I-109: Proposals: require a Try-it (live) panel on every option (user T-063 #2)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T04:03:44.763Z by lead
- affected: [object Object]
- resolved: 2026-10-04T04:49:01.928Z by lead
- fix: `{"commit":"e635a963a8ddec3d3a60ff137cf82ddba1760b23","short":"e635a963a8","subject":"tools: proposals posted without a Try-it entry on every option (incident I-109)"}`
- remeasure: false

Error: `PR-015 posted without a Try-it panel; validator accepts proposals with no live entry`

Command: `node tools/console.mjs proposal post --file <proposal.json>`

Resolution: fixed

proposal post/publish/revise(non-draft) refuse an option without a live (Try-it) entry or an explicit live: {none: "<why>"} (--live-none, proposal live --none). Drafts exempt; old proposals still render. Console restarted. Rebase before posting a proposal.

## I-110: status.mjs list --json output cut at 64 KB when piped (process.exit before stdout drains)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T04:07:01.436Z by ts-i105
- affected: [object Object]
- resolved: 2026-10-04T05:39:55.245Z by lead
- fix: `{"commit":"97aa7225f7e88f269d9616dc7c2fcda4ee24e446","short":"97aa7225f7","subject":"tools: status.mjs list --json cut at 64 KB when piped (incident I-110)"}`
- remeasure: false

Error: `SyntaxError: Unterminated string in JSON at position 65528`

Command: `node tools/status.mjs list --json \| node -e 'JSON.parse(...)'`

Resolution: fixed

status.mjs now exits only after stdout/stderr drain; piped --json output is no longer cut at 64 KB.

## I-111: idle alarm misses a held iPhone lease with no phone run (fix-nav-morph sat ~6 min idle under its lease 04:00-04:07Z)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T04:13:04.259Z by lead
- affected: [object Object]
- resolved: 2026-10-04T06:31:41.401Z by lead
- fix: `{"commit":"1aa865870f57c3b742093f7ec787adf061a4dcd0","short":"1aa865870f","subject":"tools: idle alarm ignored an iPhone lease held but unused while others wait (incident I-111)"}`
- remeasure: false

Error: `idle.mjs check OK while the iphone lease holder ran nothing on the phone`

Command: `node tools/idle.mjs check --by lead`

Resolution: fixed

idle alarm now raises IDLE for an iPhone lease held with no phone run for --phone-min while others wait; phone runs stamp lastRunAt. git rebase main.

## I-112: Phone block runners (p088-style): no WDA preflight before the first gesture; 75 s per-gesture budget vs ~130 s actual for G runs

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T04:26:04.743Z by fix-nav-morph
- affected: [object Object]
- resolved: 2026-10-04T06:23:42.977Z by lead
- fix: `{"commit":"89f7e30aa70f9e8a6a91277fd81ca72a85faf045","short":"89f7e30aa7","subject":"tools: phone block runners had no WDA preflight and planned G runs from the strokes alone (incident I-112)"}`
- remeasure: false

Error: `WDA GET /status: ECONNREFUSED (is the runner up?)`

Command: `node out/nav-morph/p091/p091.mjs go wC wV S1 C1 V1 V2 C2`

Resolution: fixed

iphone.mjs wda check (preflight, no lease); G run budget = max(150 s, 3x estimate), printed by gesture --dry-run as GESTURE_BUDGET_S; a gesture refuses in a hold with less time left. git rebase main.

## I-113: chrome-measure waiter lost its queue place on re-queue: ts-i103 queued 04:03:44Z, re-appeared at the back as 04:34:49Z (docs say exit 3 keeps the place)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T04:35:22.595Z by lead
- affected: [object Object]
- resolved: 2026-10-04T06:01:30.124Z by lead
- fix: `{"commit":"5be3c4f65b3d8215e6dafd61628b5820a96d5b25","short":"5be3c4f65b","subject":"tools: a re-queued acquire waiter lost its queue place after 60 s (incident I-113)"}`
- remeasure: false

Error: `queue entry ts-i103 since 2026-10-04T04:34:49Z, #3 behind later waiters`

Command: `node tools/lock.mjs acquire chrome-measure --owner ts-i103 --shared --weight 2 --max-seconds 300 --wait ...`

Resolution: fixed

lease waiters (lock.mjs acquire, exit 3) keep the 10 min queue TTL, so a re-run keeps its place; run --short|--shared process waiters keep 60 s. git rebase main.

## I-114: shared-lane 300 s cap too tight for npm test: hook npm test now ~253 s, ts-i109's lease expired mid-commit and a no-timing phone hold started beside the last 8 s

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T04:49:07.676Z by lead
- affected: [object Object]
- resolved: 2026-10-04T05:56:53.074Z by lead
- fix: `{"commit":"1db25036e8c553c250a3f098cae7fb2b05f9c9f8","short":"1db25036e8","subject":"tools: a shared npm-test job may take --max-seconds up to 480 (incident I-114)"}`
- remeasure: false

Error: `lease ended 04:47:40.3Z while npm test ran; fix-nav-morph hold granted 04:47:40.6Z`

Command: `lock.mjs acquire chrome-measure --shared --weight 2 --max-seconds 300; git commit (hook npm test)`

Resolution: fixed

shared npm-test jobs may take --max-seconds up to 480 with --weight npm-test (lock.mjs run and acquire); plain --weight 2 keeps 300. Use: lock.mjs run chrome-measure --shared --weight npm-test --max-seconds 480 --owner <you> -- npm test. git rebase main.

## I-115: git-guard: ask before plain curl/WebFetch to GitHub (user T-071 #10 approved)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T05:04:01.834Z by lead
- affected: [object Object]
- resolved: 2026-10-04T05:25:44.278Z by lead
- fix: `{"commit":"1f7458d13a68d3c4579227c1c85186778b0fc2b6","short":"1f7458d13a","subject":"hooks: ask before plain curl/WebFetch to GitHub; use gh (incident I-115, user T-071)"}`
- remeasure: false

Error: `agents fetched github.com / raw.githubusercontent.com with unauthenticated curl and hit the rate limit`

Command: `curl https://raw.githubusercontent.com/...`

Resolution: fixed

git-guard now asks before curl/wget to github.com, api.github.com, raw.githubusercontent.com, codeload.github.com, gist.github.com (also inside sh -c and lock.mjs run); WebFetch to those hosts asks too. Use gh (memory/github-via-gh.md).

## I-116: progress parser reads an empty '| |' ledger cell as a result (Best build page shows false 'new result')

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T05:15:14.868Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T06:22:05.056Z by lead
- fix: `{"commit":"37d63ee22b55821bec0fa619fc8278f1af6e0dce","short":"37d63ee22b","subject":"tools: the progress parser read an empty or shifted ledger cell as a result (incident I-116)"}`
- remeasure: false

Error: `parseLedger splits rows on ' \| '; a row ending ' \| \| \| \|' yields cells[8]='\|', so newResult is true for P-091..P-095`

Command: `node tools/console.mjs progress`

Resolution: fixed

ledger cells split only on real separators; empty cells read as empty, stray ' | ' in text no longer shifts columns (P-090 now reads its real result). Best build page: no more false 'new result'.

## I-117: incident/finding/wait/lock CLIs call process.exit() before stdout drains; piped output past 64 KB can be cut (same pattern as I-110)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T05:41:13.254Z by ts-i109
- affected: [object Object]
- resolved: 2026-10-04T06:51:02.386Z by lead
- fix: `{"commit":"2319403af59001c49a8ec8371eb912124e6eaa2a","short":"2319403af5","subject":"tools: incident, finding, wait and lock cut piped output at 64 KB (incident I-117)"}`
- remeasure: false

Error: `main().then((c) => process.exit(c)) exits with stdout still queued for a slow pipe reader`

Command: `node tools/incident.mjs list --json \| (sleep 0.5; cat)`

Resolution: fixed

CLIs exit only after stdout/stderr flush (tools/lib/exit.mjs); piped output past 64 KB no longer cut. git rebase main.

## I-118: user cannot trace an agent's work: owner names on Progress/Status are plain text and there is no per-agent view (T-074)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T05:44:18.970Z by lead
- affected: [object Object]
- resolved: 2026-10-04T08:09:17.427Z by lead
- fix: `{"commit":"292ec4df5f8c7636949f65707bd9338b9d0d3d9f","short":"292ec4df5f","subject":"tools: an agent's work was spread over five stores with no page per agent (incident I-118)"}`
- remeasure: false

Error: `Progress 'owner: wi-stack' is not a link; wi-stack's work is spread over git subjects '(wi-stack)', holds.log, fixes/*/README.md, status rows owned by others`

Command: `console /progress#shell-hold-c, /status (row gpu-preview owned by wi-gpu-bundle)`

Resolution: fixed

Agent pages /agents and /agent/<name> plus status.mjs agent|agents; T-079 Versions on /build landed as 546bfaa6 (chips: best:true one entry, landed:false = to try). Console restarted. git rebase main between steps.

## I-119: Thread replies scrub every non-localhost URL to <link>, so the user can't get LAN Try-it links in a thread

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T05:59:03.629Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T07:01:59.072Z by lead
- fix: `{"commit":"6c72bc5e46eb3253ee1366d5d9ba348bf34cba26","short":"6c72bc5e46","subject":"tools: thread replies scrubbed every phone (LAN) link to <link> (incident I-119)"}`
- remeasure: false

Error: `T-076 #8: lead's six LAN links all shown as <link>; user #9 asks '<link> ?'`

Command: `console.mjs thread reply T-076 --by lead --text '…http://lan…'`

Resolution: fixed

Write phone links in a thread as http://lan:<port>/: stored as written, the Threads page opens the Mac's current LAN address. git rebase main.

## I-120: flaky e2e: sim.test.mjs I-082 session SIM_BACKGROUND max 200 % (expects 1xx) under host load; blocked the I-111 commit hook

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T06:12:29.809Z by ts-i109
- affected: [object Object]
- resolved: 2026-10-04T06:54:05.940Z by lead
- fix: `{"commit":"ce792e1efc51312c4b8cac48f5ce7e84d8aa99bd","short":"ce792e1efc","subject":"ops: T-079 versions history in PROGRESS.json (baseline -> best build 65052c4a, 5 versions) (mgmt-ops-10)"}`
- remeasure: false

Error: `SIM_BACKGROUND 4 windows of 0.4 s: sim background mean 141 %, max 200 % of a core (expected /max 1\d\d %/), load1 max 34`

Command: `git commit (pre-commit npm test), tests/e2e/sim.test.mjs:145`

Resolution: fixed

Simulator background CPU windows stamped mid-ps-call; windows with skew > 0.2 extend to the next reading (no more 200 % misreads under load). git rebase main.

## I-121: flaky unit test: console.test.mjs:114 'a reopened step goes to the end of the queue' (order tie under load)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T06:27:06.189Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T07:04:39.036Z by lead
- fix: `{"commit":"8cf86dc8645895eb6f75d8796fb1546708ce52b1","short":"8cf86dc864","subject":"tools: a console step reopened in the same millisecond as a post kept its old queue place (incident I-121)"}`
- remeasure: false

Error: `AssertionError: a reopened step goes to the end of the queue; actual [C-001, C-002], expected [C-002, C-001]`

Command: `npm run test:unit (2 of ~4 runs at 06:1x-06:2xZ; 0 of 5 runs of the file alone)`

Resolution: fixed

posts and reopens take a queue number (queueSeq) under the store guard; same-millisecond ties ordered correctly. git rebase main.

## I-122: Phone lease expired mid user step: C-037 Start over (REDO) not handled, fix-nav-morph's iphone lease ran out 06:27:44Z and passed to iphone-runner with C-037 still active

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T06:28:46.896Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T06:30:49.647Z by mgmt-ops-10
- remeasure: false

Error: `C-037 stuck on 'Getting page 1 ready' after Start over (T-078); lease handed to next waiter while the holder's console step was active`

Command: `console.mjs C-037 Start over; lock.mjs iphone lease ttl expiry`

Resolution: duplicate

duplicate of I-123 (opened at the same moment; ts-i123 owns it, lead 06:3xZ)

## I-123: A user step outlived its runner's iPhone lease: after Start over (C-037) the runner missed the restart for 10 min, its lease expired mid-step, and the next holder took the phone while the user waited 

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T06:29:00.816Z by lead
- affected: [object Object]
- resolved: 2026-10-04T07:43:52.409Z by lead
- fix: `{"commit":"a80057cd83e64b6d3c3ae014f9ab34d81e4108c6","short":"a80057cd83","subject":"tools: a user step outlived its runner's iPhone lease and nobody saw it stuck (incident I-123, I-125)"}`
- remeasure: false

Error: `C-037 restart part 1 at 06:17:59Z; first ack after it at 06:27:47Z; iphone lease fix-nav-morph expired 06:27:44Z -> iphone-runner`

Command: `console.mjs wait C-037 --until answered --timeout 580 (foreground) during a user step`

Resolution: fixed

Landed a80057cd (+ docs). Phone runners: git rebase main between steps; hold the lease before posting a phone step; keep wait --until redo armed, re-arm with --epoch. No re-measure.

## I-124: Disk fills with no guard: worktree out/ grows (Chrome temp profiles, Simulator shot folders, pixel runs, snapshot copies) until the user cleans by hand; 10 GB free at 06:24Z (T-049 #22: harden it)

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-04T06:35:24.517Z by lead
- affected: [object Object]
- resolved: 2026-10-04T07:56:06.830Z by lead
- fix: `{"commit":"9087037365e60d5ed39f0072db0f4e22c9a4e091","short":"9087037365","subject":"tools: disk filled with no guard; auto-clean, disk alarm and DISK-LOW timing floor (incident I-124)"}`
- remeasure: false

Error: `df: 10Gi free; cd-roll-ca alone 2.2 GB of leftovers`

Command: `node tools/space.mjs report`

Resolution: fixed

Disk guard landed: auto-clean in the lead's idle watch, 20 GB alarm thread, DISK-LOW refuses a NEW timing hold below 8 GB free (FW_TIMING_MIN_FREE_GB). No measurement code. git rebase main between steps.

## I-125: idle alarm fires while the phone holder waits on the user's ready step

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T06:52:52.882Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T07:43:52.510Z by lead
- fix: `{"commit":"a80057cd83e64b6d3c3ae014f9ab34d81e4108c6","short":"a80057cd83","subject":"tools: a user step outlived its runner's iPhone lease and nobody saw it stuck (incident I-123, I-125)"}`
- remeasure: false

Error: `IDLE iphone: held by iphone-runner but unused for 9 min ... while C-038 part 1 was ready, waiting for the user's Start (T-081)`

Command: `node tools/idle.mjs check`

Resolution: fixed

Fixed with I-123 in a80057cd: a lease whose holder's step waits on the user is not idle.

## I-126: proposals page shows the lan placeholder as plain text, not the resolved Try-it link

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T07:03:03.879Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T08:18:39.544Z by lead
- fix: `{"commit":"6d51b42078603b143baf06a5066ec4f11aaec2d5","short":"6d51b42078","subject":"tools: Proposals page showed lan placeholders as text and Try-it pages were Mac-only; phone links + proposal phone (incident I-126, user T-086)"}`
- remeasure: false

Error: `proposals-page.html renders http://lan:<port>/ verbatim; proposal talk threads already carry message.lan (follow-up to I-119, 6c72bc5e)`

Command: `console /proposals page`

Resolution: fixed

Proposals page resolves lan links; new 'console.mjs proposal phone <id> [--option x] [--stop|--list]' serves Try-it A/B on the Wi-Fi (plain http); the page shows phone links. Console restarted. git rebase main between steps.

## I-127: iPhone not reachable: webkit proxy lists no device, Safari tab fetch failed mid-hold (P-094 H3)

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-04T08:22:56.574Z by fix-rest-script
- affected: [object Object]
- resolved: 2026-10-04T08:44:44.388Z by lead
- remeasure: false

Error: `BLOCKED: cannot reach Safari tab (fetch failed); localhost:9221/json = []`

Command: `node tools/iphone.mjs open <B> --owner fix-rest-script`

Workaround: Unplug and replug the iPhone cable (user step); device back 08:24Z. Cause: the USB link dropped by itself at ~08:20Z, not user-caused (user C-043, fix-rest-script block log); root cause unknown. P-094 H3 re-run 08:31-08:36Z was valid afterwards. Reopen a pattern check if it recurs.

Resolution: workaround

USB link dropped by itself ~08:20Z (not user-caused), root cause unknown; replug restored it 08:24Z; P-094 H3 re-run valid; phone stable since. Reopen with a pattern check if it recurs.

## I-128: flaky unit test phone-step I-123 c: stuck-step episode key equal when the ack lands in the same ms

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T08:24:29.784Z by ts-threads
- affected: [object Object]
- resolved: 2026-10-04T09:57:58.073Z by lead
- fix: `{"commit":"d0a59c80b15bcb63d318bd2c3d5d143c563826ae","short":"d0a59c80b1","subject":"tools: stuck-step episode key collided for two changes in the same ms (incident I-128)"}`
- remeasure: false

Error: `AssertionError: x.key notEqual key: both C-001/e1/p1/a2/<same ms ISO>`

Command: `node --test tests/unit/phone-step.test.mjs (fails about 1 run in 3)`

Resolution: fixed

episode key includes the history length; landed with the ts-threads series

## I-129: Threads page shows markdown tables as raw pipe text (user T-091)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T08:29:34.941Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T09:57:58.161Z by lead
- fix: `{"commit":"5e4cf7092d431cf994023e8d9d7c4ea6df3acdde","short":"5e4cf7092d","subject":"tools: thread messages render pipe tables, \"- \" bullets and **bold** (incident I-129, user T-091)"}`
- remeasure: false

Error: `T-030 #27 table rendered as '\| Fix \| Where it is \| \|---\|---\|' plain text: .mtext is white-space:pre-wrap, no table rendering`

Command: `node tools/console.mjs thread reply T-030 --by mgmt-ops-10 --file t030.txt`

Resolution: fixed

Threads and proposal talk render pipe tables, bullets, bold (DOM only, no HTML from text); console restarted

## I-130: Console notification banner hidden under a 2-row top menu (user T-092)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T08:31:39.916Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T09:07:11.050Z by lead
- fix: `{"commit":"577c96c8eb3d424d42d6819857eefddbbfc7ad80","short":"577c96c8eb","subject":"tools: console banner hidden under a 2-row top menu; menu fits one row from 1100 px (incident I-130)"}`
- remeasure: false

Error: `console-nav.css:23 .nav-banner sticky top = 58px assumes a one-row .menu; menu wraps (Alerts on row 2), banner z-index 19 < menu 20, so its first line is covered`

Command: `console Threads page, desktop width, 8 menu items`

Resolution: fixed

Menu fits one row from 1100 px; banner offset follows the menu height. Console restarted 09:0xZ.

## I-131: serve.mjs sends the mirror's 'max-age=31536000, immutable' for overlay files that change a hashed asset (stale build in browsers on a reused port)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T09:02:13.014Z by lead
- affected: [object Object]
- resolved: 2026-10-04T11:12:19.886Z by lead
- fix: `{"commit":"c7427cd0e958220367c10b940fb87b179313a762","short":"c7427cd0e9","subject":"tools: serve.mjs replayed production's immutable/max-age headers, so browsers kept another build's files on a reused port (incident I-131)"}`
- remeasure: false

Error: `5959/5422 /_app/immutable/assets/2.gBuqKVzi.css (PR-017 overlay) -> cache-control: public, max-age=31536000, immutable`

Command: `curl -sD- http://127.0.0.1:5959/_app/immutable/assets/2.gBuqKVzi.css`

Resolution: fixed

serve.mjs sends no-cache + ETag (prod value as x-mirror-prod-cache-control); --port fresh for Try-it. MEASUREMENT: Chrome unchanged; phone reload runs now revalidate ~51 lazy files: phone numbers before/after don't compare. fix-ab test:chrome re-run due in the first quiet short slot before any timing A/B. Rebase between questions only, never mid-question.

## I-132: flaky e2e agent-page 'every agent name links to /agent/<name>' under a loaded npm test (loadPage settles a fixed 250 ms)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T09:06:46.670Z by ts-threads
- affected: [object Object]
- resolved: 2026-10-04T10:33:47.763Z by lead
- fix: `{"commit":"25c9537743c3bd96f914ec93a0d3d626ac11bfe2","short":"25c9537743","subject":"tools: fake-DOM page loader settled on a fixed 250 ms, flaky under load (incident I-132)"}`
- remeasure: false

Error: `✖ Status, Progress and Threads: every agent name links to /agent/<name> (261 ms)`

Command: `npm test (pre-commit hook, beside ts-i130's npm test, group weight 4/4)`

Resolution: fixed

fake-DOM loader waits for pending fetches and short timers instead of a fixed 250 ms; tests only. Rebase on main.

## I-133: flaky unit 'I-123 c: a step that waits on its runner ... is stuck' (stuck-episode key equal when restart and the next ack land in the same ms)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T09:24:27.394Z by ts-i132
- affected: [object Object]
- resolved: 2026-10-04T09:24:47.057Z by lead
- remeasure: false

Error: `AssertionError: a new episode (notStrictEqual, actual = expected 'C-001/e1/p1/a2/<same updatedAt>')`

Command: `node --test tests/unit/phone-step.test.mjs (fails about 1 in 5 alone; blocked the I-132 commit's npm test)`

Resolution: duplicate

Same as I-128 (stuck-step episode key from updatedAt ms; ts-threads fix 8e35bfbd, landing soon). Green rerun counts until then.

## I-134: Best build page (/build) result table hard to read (user T-099)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T09:49:08.080Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T11:36:34.902Z by lead
- fix: `{"commit":"03db838bab9555ec8cdfcdbb10f89391658c979c","short":"03db838bab","subject":"tools: progress --check ties build.since to the best version; progress set and progress best edit PROGRESS.json (T-103, T-104)"}`
- remeasure: false

Error: `user: 'This table is hard to read. fix them.' Rows render 'before -> after' in one cell plus a small tag and driver/ref codes; at <= 900 px the page also scrolls sideways (backlog item from 09:1xZ)`

Command: `console /build, result rows from fixes/PROGRESS.json versions[].result (tools/lib/progress-page.html gainRow ~l.240-275)`

Resolution: fixed

/build tables readable, no sideways scroll, versions newest first; progress set/best editors; npm test 1814/1814

## I-135: flaky unit test phone-step I-123 c: stuck-step episode key equal when the ack lands in the same ms

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T09:49:12.291Z by arch-gpu-lessons
- affected: [object Object]
- resolved: 2026-10-04T09:51:39.579Z by lead
- remeasure: false

Error: `I-123 c: a step that waits on its runner ... is stuck: AssertionError a new episode`

Command: `npm run test:unit`

Resolution: duplicate

duplicate of I-128 (flaky I-123 c unit test); fix 8e35bfbd lands with the ts-threads series

## I-136: shared lane runs single-file while an exclusive waiter is queued: readers queued AHEAD of it cannot join a running group (writer preference); phone-block holds wait behind them

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T10:19:29.065Z by lead
- affected: [object Object]
- resolved: 2026-10-04T11:20:53.607Z by lead
- fix: `{"commit":"7ba0456deaf7cfdc835920f582dc71cff8bd44e9","short":"7ba0456dea","subject":"tools: shared readers ahead of an exclusive waiter could not join; phone-block holds waited behind later readers; --cap max 4 (incident I-136)"}`
- remeasure: false

Error: `joins closed: "fix-morph-gpu" waits for an exclusive hold (writer preference)`

Command: `node tools/lock.mjs status (10:13Z: 1 reader w2/4 running, 4 readers queued ahead of the exclusive)`

Resolution: fixed

readers ahead of the first exclusive waiter join the group; a no-timing hold of the iphone lease holder moves ahead of readers queued after the lease began; --cap up to 6. Timing holds unaffected. Rebase on main.

## I-137: thread router counts an agent as listening from a read in the last 5 min, after its listener died; user T-109 #17 went unanswered

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T11:13:40.894Z by lead
- affected: [object Object]
- resolved: 2026-10-04T18:59:46.120Z by lead
- fix: `{"commit":"eba686ebdf0f5623e81b5e542231566f4c079f6e","short":"eba686ebdf","subject":"threads: an orphaned wait does not listen (process tree); busy owners get user questions as a non-waking FYI (incidents I-163, I-137, I-164; user T-147)"}`
- remeasure: false

Error: `desk listening (active 3 min ago) but no thread wait process; #17 11:11Z unanswered`

Command: `console.mjs thread desk show`

Resolution: fixed

## I-138: flaky unit test I-123 c (phone-step): new episode id equals the old one when both fall in the same millisecond

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T12:01:53.664Z by countdown-faces
- affected: [object Object]

Error: `AssertionError: a new episode (actual === expected 'C-001/e1/p1/a2/<same ms stamp>')`

Command: `npm run test:unit (tests/unit/phone-step.test.mjs:97)`

## I-139: redact.mjs device-name pattern scrubs ordinary prose ending in "'s Mac": a lead message in T-105 #9 lost the words "phone test's Mac hold"

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T12:28:41.587Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-07T01:33:35.580Z by lead
- fix: `{"commit":"20c86c5a46a061601acca92e012f50b4a40f8390","short":"20c86c5a46","subject":"tools: redact's \"<Name>'s iPhone\" rule took version tokens and prose as names and ate the words after it (incident I-228, I-139)"}`
- remeasure: false

Error: `tools/lib/redact.mjs:29 /<word>( <word>)?['’]s (iPhone\|iPad\|iPod\|Mac\|MacBook)\b[\p{L}\p{N} ]*/ -> '<device-name>' also matches "phone test's Mac hold …" and eats the rest of the words up to the next punctuation`

Command: `node tools/console.mjs thread show T-105`

Resolution: fixed

Same root cause as I-228; fixed by the same series (prose before 's Mac is kept).

## I-140: console wait --until started hangs silently on a part that is still 'waiting' (runner never acked ready after a redo); user stuck on a grey Start button for 4 min (C-045 part 3, T-116)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T12:50:20.319Z by lead
- affected: [object Object]
- resolved: 2026-10-04T15:57:32.920Z by lead
- fix: `{"commit":"1b568e5b8c3e76254322d28bd52b85b9587c4773","short":"1b568e5b8c","subject":"tools: a stale console ack failed quietly and a wait on an unready gated part hung (incident I-140)"}`
- remeasure: false

Error: `C-045 part 3 state waiting attempt 2; runner in 'wait C-045 --until started --part 3' from ~12:46Z; user skipped 12:49Z`

Command: `node tools/console.mjs redo C-045 --part 3; node tools/console.mjs wait C-045 --until started --part 3`

Resolution: fixed

Landed on main (ts-phone-steps, full npm test 1881/1881 on 6ae775c4; main had no tooling commits since). git rebase main between steps.

## I-141: iPhone inspector drops mid-record/gesture under high Mac load (Runtime.evaluate 15 s timeout)

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-04T12:52:14.453Z by iphone-runner
- affected: [object Object]
- resolved: 2026-10-04T15:57:33.267Z by lead
- fix: `{"commit":"b5c46786ca8791b7153aba4fba6c0ffaee040dee","short":"b5c46786ca","subject":"tools: iphone.mjs record lost a whole finger recording when its one final read timed out (incident I-141)"}`
- remeasure: false

Error: `Runtime.evaluate timed out after 15000ms (is another inspector client attached to this tab ...)`

Command: `iphone.mjs record / gesture (T-113 F4 12:1xZ, C-045 part 3 12:44Z)`

Resolution: fixed

Landed; see the measurement-code note. Phone record runs after this commit carry the poll; rebase between holds, never mid-block.

## I-142: gesture: no 'navigate and fling without waiting' step (earliest fling ~1.7-1.9 s after navigation start)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T12:55:57.680Z by iphone-runner
- affected: [object Object]

Error: `reload op sleeps 1.2 s then waits for readyState before any stroke; T-113 boot-time set needs 0.3 s / 1 s starts`

Command: `iphone.mjs gesture out/t113/flick-fresh-v1.json --param afterMs=0`

## I-143: proposal Try-it pages are not on the Wi-Fi by default: the user sees 'not on the Wi-Fi now' until the lead runs proposal phone (user T-119)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T13:03:55.083Z by lead
- affected: [object Object]
- resolved: 2026-10-04T15:57:33.009Z by lead
- fix: `{"commit":"aee04a856b3ede9ecbf0bffe447c840cc85657b1","short":"aee04a856b","subject":"tools: proposal post/revise did not start the phone Try-it pages (incident I-143)"}`
- remeasure: false

Error: `Proposals page: A and B are not served on the Wi-Fi yet`

Command: `node tools/console.mjs proposal post\|revise`

Workaround: lead runs node tools/console.mjs proposal phone <id> [--option <name>] for every open proposal

Resolution: fixed

Landed on main (ts-phone-steps, full npm test 1881/1881 on 6ae775c4; main had no tooling commits since). git rebase main between steps.

## I-144: idle alarm fires on the user's own hand-test lease (owner user-try): T-121 told the user their own phone time was idle

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T13:13:58.737Z by lead
- affected: [object Object]
- resolved: 2026-10-04T15:57:33.100Z by lead
- fix: `{"commit":"2de4291fedbcc58ca74f57666e4db777f12a6892","short":"2de4291fed","subject":"tools: the idle alarm called the user's own hand test on the phone idle (incident I-144)"}`
- remeasure: false

Error: `IDLE iphone: iPhone held by user-try but unused for 5 min`

Command: `node tools/idle.mjs watch`

Workaround: lead answers the alert thread; harmless

Resolution: fixed

Landed on main (ts-phone-steps, full npm test 1881/1881 on 6ae775c4; main had no tooling commits since). git rebase main between steps.

## I-145: status board 'waiting on you' row kept 'decision on PR-019' 16 min after the user decided: rows depend on agent updates, not on the proposal/console/lock events the tools already have (user T-122)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T13:29:16.651Z by lead
- affected: [object Object]
- resolved: 2026-10-04T14:17:40.520Z by lead
- fix: `{"commit":"5e191a593d87fa3073bb4bf672cacf860f4f5457","short":"5e191a593d","subject":"tools: an event that ends a wait overrides the owner's older board text (incident I-145)"}`
- remeasure: false

Error: `Waiting on you: accent-ca: you: decision on PR-019 (decided 13:09Z)`

Command: `node tools/status.mjs list`

Resolution: fixed

a user decision/answer ends a 'waiting on you' row at read time; derived labels (T-124/T-125) follow

## I-146: thread replies are not checked against the answer-format rule: the desk's T-034 #6/#7 had long lines, unexplained codes (T-040, PR-015) and no clear action line (user T-123)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T13:44:11.108Z by lead
- affected: [object Object]
- resolved: 2026-10-04T15:15:08.165Z by lead
- fix: `{"commit":"3248906fe0c005a544b5aac5eb737338c64f9481","short":"3248906fe0","subject":"tools: proposal gain tables packed tags, drivers and notes into their cells (incident I-146, user T-126)"}`
- remeasure: false

Error: `user T-123: Why this agent didn't apply rules of how to answer the threads`

Command: `node tools/console.mjs thread reply`

Resolution: fixed

thread reply/new, step post, proposal post/revise check answer-format; --check-format to test drafts, --force-format "<reason>" override (logged). Rebase before your next reply.

## I-147: PR-020 N2: thread wait has no one-line-per-wake output, so listener filters drop PROPOSAL/ESCALATE lines (the lead missed PR-019 for 16 min); add --monitor (WAKE <kind> <id>) and fix the CLAUDE.md lis

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T13:46:00.885Z by lead
- affected: [object Object]
- resolved: 2026-10-04T16:16:57.426Z by lead
- fix: `{"commit":"4158740aa1c7d0b806ec5baab2d00219f87108bb","short":"4158740aa1","subject":"tools: thread wait printed each wake in several formats, so listener filters dropped proposal decisions (incident I-147, PR-020 N2)"}`
- remeasure: false

Error: `listener awk kept only TRIAGE/NEW lines`

Command: `node tools/console.mjs thread wait`

Resolution: fixed

Landed (ts-board, npm test 1900/1900 on the exact commit). Listeners: Monitor on thread wait --monitor, never filter its lines; re-arm yours.

## I-148: PR-020 N4: no chained lock holds; agents hand-build hold chains (3 of 9 asked): lock.mjs run-chain / run --then, each step re-queues at the back

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T13:46:01.417Z by lead
- affected: [object Object]

Error: `agents wrap several holds by hand`

Command: `node tools/lock.mjs run`

## I-149: PR-020 N5: no phone reservation for a promised user step or lead hand-off: lock.mjs reserve iphone --for <owner|user-step:C-NNN> --by lead, time-limited

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T13:46:02.008Z by lead
- affected: [object Object]

Error: `a fix owner took a phone promised to a user step (T-113)`

Command: `node tools/lock.mjs acquire iphone`

## I-150: PR-020 N6: no read-only way to read a peer's out/ or committed files: tools/peer.mjs ls|cat|ref

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T13:46:02.247Z by lead
- affected: [object Object]

Error: `4 agents wrote one-off scripts or copied snapshots by hand`

Command: `-`

## I-151: PR-020 N7: a re-reported flaky test opens a new incident instead of joining the open one (I-128 filed 4 times); join by signature; fix or quarantine I-138

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T13:46:02.610Z by lead
- affected: [object Object]

Error: `duplicate flaky-test incidents`

Command: `node tools/incident.mjs open`

## I-152: PR-020 N9/N10: board rows don't show landed/owner-ended by themselves; --help on some tools has side effects (serve.mjs --help starts a server)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T13:46:02.935Z by lead
- affected: [object Object]
- resolved: 2026-10-04T18:59:45.830Z by lead
- fix: `{"commit":"eba686ebdf0f5623e81b5e542231566f4c079f6e","short":"eba686ebdf","subject":"threads: an orphaned wait does not listen (process tree); busy owners get user questions as a non-waking FYI (incidents I-163, I-137, I-164; user T-147)"}`
- remeasure: false

Error: `serve.mjs --help starts a server`

Command: `node tools/serve.mjs --help`

Resolution: fixed

## I-153: flaky e2e test verify-fake I-023: recheck stop time 60.2 s, expected 60 under host load 17

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T14:13:33.000Z by ts-answer-lint
- affected: [object Object]

Error: `verify-fake.test.mjs:424 deepStrictEqual [false,6,60.2,false] vs [false,6,60,false]`

Command: `npm test (pre-commit hook)`

Workaround: timing flake under host load: re-run the suite once; a second failure is a real failure

## I-154: xctrace thermal gate times out at 90 s under Mac load ~77, the hold goes VOID

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T14:27:00.417Z by iphone-runner
- affected: [object Object]

Error: `GATE p105-H1-end state null induced null ... -> FAIL xctrace record exit null`

Command: `node research/phone-thermal-gate/thermal-gate.mjs --owner iphone-runner --label p105-H1-end --expect serious --max-c 44 --url <B>`

Workaround: a gate timeout (xctrace exit null) is not a FAIL: re-run the hold once, no strike; avoid weight-3 Simulator readers beside phone holds

## I-155: phone lease taken before the hold can start (pre-data read pending) idles the iPhone; idle alarm posts land in the user's threads

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T14:41:17.656Z by lead
- affected: [object Object]
- resolved: 2026-10-04T20:06:14.837Z by lead
- fix: `{"commit":"47cd5b06b5d57bceb4e04cf7809ef006ec77cf3f","short":"47cd5b06b5","subject":"tools: the idle alarm counted a phone holder only queued for its Mac hold as using the phone (phone-hold v2 T0, incident I-155)"}`
- remeasure: false

Error: `IDLE iphone: held by cd-roll-ca, unused 6 min while 2 jobs wait (T-134)`

Command: `node tools/lock.mjs acquire iphone --owner cd-roll-ca ...`

Workaround: acquire the iphone lease only when the hold can start now (pre-data read passed, servers up); waiting for ops = stay queued, not holding

Resolution: fixed

landed on main (47cd5b06). git rebase main between steps; no re-measure needed (lock and alarm rules only).

## I-156: Status/Progress comment badge ('2 comments') opens only the latest comment; no way to reach the first (user T-137)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T14:55:01.512Z by mgmt-desk-2
- affected: [object Object]
- resolved: 2026-10-04T16:05:13.787Z by lead
- fix: `{"commit":"aefcb57bcd5d88d22c444be8190cb364d7a8b29b","short":"aefcb57bcd","subject":"tools: a page item with 2+ comment threads linked only the newest one (incident I-156)"}`
- remeasure: false

Error: `click on '2 comments' on /status#morph-gpu jumps to the newest thread (T-136), not the earlier one (T-135)`

Command: `console /status#morph-gpu, click the comments badge`

Workaround: open the Threads page (/threads) and pick T-135 or T-136 from the list

Resolution: fixed

Landed on main (ts-board, npm test 1895/1895 on the exact tip). Console restarted.

## I-157: unit test live-phone phoneStatus fails on main: Try-it build not served within 3 s

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-04T15:23:06.244Z by ts-board
- affected: [object Object]
- resolved: 2026-10-04T15:50:13.614Z by lead
- fix: `{"commit":"97b3518f6cfc4e6e78407a785baccf6ccc06ada5","short":"97b3518f6c","subject":"tests: live-phone test failed whenever the machine's own Try-it host listened on port 6400 (incident I-157)"}`
- remeasure: false

Error: `Error: Try-it build "site-pretty+5b0effab..." is not served within 3 s (tests/unit/live-phone.test.mjs:101)`

Command: `node --test tests/unit/live-phone.test.mjs`

Workaround: a failure in live-phone.test.mjs 'phoneStatus: down without a registry entry' alone is I-157 (the test sees the live Try-it host); everything else must pass

Resolution: fixed

test-only: live-phone test no longer collides with the live Try-it host on 6400 (real port probe, lowest free port held as regression check). git rebase main, re-run npm test.

## I-158: unit test live-phone phoneStatus times out (3 s) under host load

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T15:25:52.225Z by int-v8
- affected: [object Object]
- resolved: 2026-10-04T15:50:13.702Z by lead
- fix: `{"commit":"97b3518f6cfc4e6e78407a785baccf6ccc06ada5","short":"97b3518f6c","subject":"tests: live-phone test failed whenever the machine's own Try-it host listened on port 6400 (incident I-157)"}`
- remeasure: false

Error: `Try-it build site-pretty+5b0effab… is not served within 3 s (tests/unit/live-phone.test.mjs:101)`

Command: `npm run test:unit (also node --test tests/unit/live-phone.test.mjs, 2 of 2 runs)`

Resolution: fixed

duplicate of I-157

## I-159: flaky e2e test lock-cli I-099: grandchild still alive when run exits, under host load 60-75

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T15:41:02.360Z by ts-board
- affected: [object Object]

Error: `AssertionError: the grandchild is gone when run exits (no polling grace) true !== false (tests/e2e/lock-cli.test.mjs:306)`

Command: `npm test (pre-commit hook, shared lane); passes alone right after`

Workaround: timing flake under host load 60+: re-run the suite once; a second failure is real

## I-160: Simulator sessions (shared w3) start beside a timed phone block: Mac load1 80-170 during P-111 H2/H3

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T15:41:23.096Z by lead
- affected: [object Object]
- resolved: 2026-10-04T20:06:14.752Z by lead
- fix: `{"commit":"f7bd88c4ed0c05107a0d73c579199f724e6ecfa5","short":"f7bd88c4ed","subject":"tools: Simulator shared readers started beside a ticketed phone block (incident I-160)"}`
- remeasure: false

Error: `load1 169 at H2 pre-warm (fix-scroll-cb sim boot 15:34Z); 81 at H3 (de-breakpoints-v7 sim 15:40Z)`

Command: `lock.mjs run chrome-measure --shared --weight simulator -- sim.mjs session --functional`

Workaround: the desk asks Simulator owners to start sessions between phone-block holds (runner posts a line per hold); records keep mac load

Resolution: fixed

landed on main (f7bd88c4). git rebase main between steps; no re-measure needed (lock and alarm rules only).

## I-161: live-phone unit test still fails while the machine's Try-it host listens on 6400 (after I-157 fix 97b3518f)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T15:53:21.802Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-04T15:55:00.122Z by lead
- fix: `{"commit":"97b3518f6cfc4e6e78407a785baccf6ccc06ada5","short":"97b3518f6c","subject":"tests: live-phone test failed whenever the machine's own Try-it host listened on port 6400 (incident I-157)"}`
- remeasure: false

Error: `phoneStatus: Try-it build site-pretty+... is not served within 3 s (tools/lib/tryit.mjs:332 waitServed, tests/unit/live-phone.test.mjs:101)`

Command: `node --test tests/unit/live-phone.test.mjs (main bf3a54af; a node process listens on *:6400, v8-best Try-it)`

Resolution: fixed

duplicate of I-157, already fixed on main; rebase

## I-162: status.mjs set does not refuse researching on a row whose Progress item landed when the row matches the item by id or owner alias (only by --progress link)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T18:05:29.757Z by ts-board
- affected: [object Object]
- resolved: 2026-10-04T18:59:45.921Z by lead
- fix: `{"commit":"eba686ebdf0f5623e81b5e542231566f4c079f6e","short":"eba686ebdf","subject":"threads: an orphaned wait does not listen (process tree); busy owners get user questions as a non-waking FYI (incidents I-163, I-137, I-164; user T-147)"}`
- remeasure: false

Error: `hero-exit-threaded set to researching without refusal; /status showed a red mismatch (reported by mgmt-desk-2, user T-145)`

Command: `node tools/status.mjs set hero-exit-threaded --by <owner> --state researching --note ...`

Resolution: fixed

## I-163: router counts an orphaned thread wait as listening: the desk's Monitor wait (pid 15056) outlived the desk's run, so T-146 (user, 18:09Z) sat 2.5 min unanswered until the lead's triage

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T18:12:45.709Z by lead
- affected: [object Object]
- resolved: 2026-10-04T18:59:46.023Z by lead
- fix: `{"commit":"eba686ebdf0f5623e81b5e542231566f4c079f6e","short":"eba686ebdf","subject":"threads: an orphaned wait does not listen (process tree); busy owners get user questions as a non-waking FYI (incidents I-163, I-137, I-164; user T-147)"}`
- remeasure: false

Error: `T-146 #1-#3 routed to mgmt-desk-2 (listening) but the desk never saw them`

Command: `console.mjs thread wait --as mgmt-desk-2 --monitor`

Resolution: fixed

## I-164: router wakes busy worker owners with user questions (user T-147): needs a busy rule: owner in an active step -> desk/lead answers, owner gets a non-waking FYI

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T18:20:12.568Z by lead
- affected: [object Object]
- resolved: 2026-10-04T18:59:46.299Z by lead
- fix: `{"commit":"eba686ebdf0f5623e81b5e542231566f4c079f6e","short":"eba686ebdf","subject":"threads: an orphaned wait does not listen (process tree); busy owners get user questions as a non-waking FYI (incidents I-163, I-137, I-164; user T-147)"}`
- remeasure: false

Error: `T-098 #6 question routed to fix-hero-exit-threaded mid PR-018 rev 7 work`

Command: `console.mjs thread (router)`

Resolution: fixed

## I-165: lock.mjs wait --until mine --for N waits N s AFTER the lease is already yours: fix-hero-exit-threaded idled the iPhone 9.5 min (18:28-18:37Z) holding the lease

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T18:34:18.239Z by lead
- affected: [object Object]
- resolved: 2026-10-04T20:06:14.922Z by lead
- fix: `{"commit":"06a5ad639f6894e40a4ce5106031c848d65e32fe","short":"06a5ad639f","subject":"tools: a wait for one's own lease idled the iPhone, and a holder waiting for the user's Start alarmed (incident I-165)"}`
- remeasure: false

Error: `wait iphone --until mine --for 570 still running at 18:34Z while the owner held the lease since 18:28:18Z`

Command: `node tools/lock.mjs wait iphone --until mine --owner fix-hero-exit-threaded --for 570`

Resolution: fixed

landed on main (06a5ad63). git rebase main between steps; no re-measure needed (lock and alarm rules only).

## I-166: tests/unit/tryit.test.mjs flakes when freePort() returns a port near 65535 (base+2 = 65536)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T18:35:53.942Z by ts-board
- affected: [object Object]
- resolved: 2026-10-05T01:45:22.856Z by lead
- fix: `{"commit":"d1c55d9415b5003fc22699fed4b6f4db2f9d0c3b","short":"d1c55d9415","subject":"tools: two npm test runs on one Mac collided on Try-it ports and prune's process check (incidents I-193, I-192, I-195)"}`
- remeasure: false

Error: `Error: port: 1024-65535, not 5173/5559 (got 65536)`

Command: `npm test (pre-commit)`

Resolution: fixed

Covered by the I-195 fix: tryit.test.mjs now takes its port base from 20000-39999 (never freePort() near 65535), so base+2 can't reach 65536. git rebase main; nothing to re-measure.

## I-167: T1 phone ledger: every iphone hold/lease writes one holds.log line with use breakdown; idle.mjs report --day prints idle minutes by cause (phone-hold-v2 section 4.4/6)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T18:59:46.701Z by mgmt-devices
- affected: [object Object]
- resolved: 2026-10-05T00:53:29.387Z by lead
- fix: `{"commit":"94824bd328f1172d82bc6d553db997c5efe1644f","short":"94824bd328","subject":"tools: an iphone hold left no record of where its time went, so idle minutes had no cause (incident I-167)"}`
- remeasure: false

Error: `18 iPhone idle alarms, 204 min on 2026-10-04, reviewed by hand; no per-hold record of run/cooling/macWait/userWait/idle seconds`

Command: `design: research/architecture/phone-hold-v2.md (6693c9e2) section 6 row T1; tools: lib/lock.mjs hold end -> holds.log, lib/idle.mjs + idle.mjs report --day; tests: unit ledger accounting from synthetic marks, e2e report on a fixture; depends on T0 (ts-lock-rules I-155/I-160/I-165)`

Resolution: fixed

landed on main (rebase + ff-only, npm test passed on the exact tree). git rebase main between steps; restart any idle watch or status reader to pick it up.

## I-168: T2 phone as process hold: lock.mjs run iphone --keep/--max-seconds/--block; agent acquire iphone refused (exit 2); iphone.mjs/ioscap accept a process holder; doc shrink (phone-hold-v2 section 4.1/6)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T18:59:46.832Z by mgmt-devices
- affected: [object Object]
- resolved: 2026-10-05T03:01:44.064Z by lead
- fix: `{"commit":"3c072dfbf9c1be9c2d2bb8b2be100e8d8c2add48","short":"3c072dfbf9","subject":"tools: agents held the iPhone as leases that outlived their phone parts (incident I-168)"}`
- remeasure: false

Error: `agents hold the iPhone lease while they think or wait (H-done 19, W 10, H-early 40, H-gap 23 min on 2026-10-04); ~86 of ~106 avoidable idle minutes`

Command: `design: research/architecture/phone-hold-v2.md (6693c9e2) section 6 row T2; tools: lock.mjs run iphone, requireLease in iphone.mjs, ioscap.mjs, wait.mjs phone-temp cooling mark; CLAUDE.md Hard rule 9 + Shared devices iPhone part, agent texts, AGENT_PROMPT; tests: keep re-entry/expiry, refusal exit 2 for fix-x and acceptance for user-try, e2e release <=5 s after exit; depends on T1`

Resolution: fixed

T2 landed: agents hold the iPhone with lock.mjs run iphone (--keep <=180 s, --block cap 3600); acquire iphone refused (exit 2) except user/user-*, --lead --reason, --not-ready. npm test 2283/2283. git rebase main before your next phone part, never mid-step.

## I-169: thread router can't see an owner deaf inside a long foreground command; user questions wait for the 10-min backstop

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T19:10:03.742Z by lead
- affected: [object Object]
- resolved: 2026-10-04T19:46:31.676Z by lead
- fix: `{"commit":"367bd9bc35069901cebe7d04ed9599f4782380d7","short":"367bd9bc35","subject":"threads: an owner inside a long foreground tool call is deaf: not listening, busy, named on the board (incident I-169, user T-152 #3)"}`
- remeasure: false

Error: `T-152 #3: threads routed to a worker stuck in a long foreground command (npm test, lock wait)`

Command: `console.mjs thread wait / router`

Resolution: fixed

## I-170: no guard against long commands in the foreground: agents go deaf to messages and user threads

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T19:11:35.707Z by ts-fg-guard
- affected: [object Object]
- resolved: 2026-10-04T20:45:37.739Z by lead
- fix: `{"commit":"630b1b172b7d5f5dbbbd7f136678854abdb9767e","short":"630b1b172b","subject":"hooks: fg-guard refuses known long commands in the Bash foreground (incident I-170, user T-152)"}`
- remeasure: false

Error: `user T-152`

Command: `Bash foreground`

Resolution: fixed

fg-guard hook landed: long commands (waits over 60 s, lock runs, ab, verify, bench, phone runs, full npm test) are refused in the Bash foreground. Rebase to get it. The 1 failing test in the full run (console-cli server stop) passed 9/9 on rerun: load flake, unrelated.

## I-171: lock.mjs repair --move accepts only --by lead: the delegated move power of mgmt-devices and the desk does not work in the tool; add delegated owners with audit

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T19:16:02.459Z by mgmt-devices
- affected: [object Object]
- resolved: 2026-10-04T23:03:27.411Z by lead
- fix: `{"commit":"915cba34de644cc65e02db90f094bbf8efab8eea","short":"915cba34de","subject":"tools: the lead's lock delegates could not move queue entries or release an idle iphone lease (incident I-171)"}`
- remeasure: false

Error: `usage: node tools/lock.mjs repair <resource> --move <owner> --to <position> --by lead --reason (lib/lock.mjs: only --by lead); AGENT_ROLES d944fa16 gives mgmt-devices and mgmt-desk queue moves inside the priority order and release of an idle iphone lease with waiters`

Command: `design: phone-hold-v2.md section 4.1/4.4; fix: --by accepts a delegated list (lead, mgmt-devices, mgmt-desk-*), audit.log records by, reason required, only inside the priority order (never ahead of a user step, never past a timed hold), release of an idle iphone lease with waiters (after nudge) allowed with --reason; tests: accepted/refused owners, audit line, priority-order refusal; bundle with T2 (I-168) toolsmith`

Resolution: fixed

landed with the lock-rules batch (full npm test 2204/2204)

## I-172: phone-block priority moves a phone holder's Mac hold only to #3 behind earlier non-phone exclusive holds: a hold whose owner holds the iPhone should go before any non-phone waiter (user steps excepted

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T19:16:02.764Z by mgmt-devices
- affected: [object Object]
- resolved: 2026-10-04T23:03:27.504Z by lead
- fix: `{"commit":"915cba34de644cc65e02db90f094bbf8efab8eea","short":"915cba34de","subject":"tools: the lead's lock delegates could not move queue entries or release an idle iphone lease (incident I-171)"}`
- remeasure: false

Error: `queue 2026-10-04 19:13Z: fix-hero-exit-threaded holds iphone since 19:12:53Z, its no-timing hold sat #1 only after the lead's manual move; fix-scroll-cb and de-v8-section-ms (10-min timing hold) queued earlier stayed ahead (queuePhoneBlock in lib/lock.mjs)`

Command: `design: phone-hold-v2.md section 3/4.2; fix: queuePhoneBlock inserts a hold whose owner holds the iphone lease (or process hold) before every non-phone exclusive waiter, FIFO among phone owners, user steps excepted, never ahead of the current holder; tests: queue order with earlier non-phone exclusive/timing waiters; bundle with T2 (I-168) or ts-lock-rules follow-up`

Resolution: fixed

landed with the lock-rules batch (full npm test 2204/2204)

## I-173: iPhone USB link lost ~19:15Z: usbmux sees no device, webkit proxy :9222 refused; devicectl shows it on network only

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-04T19:16:34.889Z by lead
- affected: [object Object]
- resolved: 2026-10-04T19:20:40.300Z by lead
- remeasure: false

Error: `proxy not reachable on :9222 (ECONNREFUSED); idevice_id -l empty`

Command: `iphone.mjs status`

Resolution: workaround

user re-plugged the cable 19:20Z (C-051); usbmux sees the device, proxy :9222 answers. Phone parts may resume.

## I-174: tests/unit/awake.test.mjs flakes under load: JSON parse of a partly written awake file

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T19:46:50.318Z by lead
- affected: [object Object]

Error: `JSON parse error reading awake state during npm run test:unit under load (seen once by ts-board, 3/3 pass alone)`

Command: `npm run test:unit`

## I-175: idle-alarm threads are assigned to worker agents (holder, waiters); user T-155 #4 wants mgmt-devices first tier, lead second, workers not assignees

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T19:50:27.788Z by lead
- affected: [object Object]
- resolved: 2026-10-04T22:35:46.048Z by lead
- fix: `{"commit":"92069d2f5ba545c2e66ca6454c6442d2d96224aa","short":"92069d2f5b","subject":"threads: alarm threads (idle, stuck step, disk) go to the lead-kept steward only, never to worker agents (incident I-175, user T-155 #4/#5)"}`
- remeasure: false

Error: `T-155 assigned fix-hero-exit-threaded, iphone-runner, int-v8`

Command: `node tools/idle.mjs watch --by lead`

Resolution: fixed

alarm threads go to the steward (mgmt-devices, set 22:35Z), lead second tier; never to workers

## I-176: uncounted phone warm-up runs refuse (WAIT) beside another agent's --no-timing chrome-measure hold: P-116 warm-up G flicks refused 7 of 12 times 19:49-19:56Z while fix-scroll-cb held a no-timing hold

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T19:57:34.646Z by mgmt-devices
- affected: [object Object]
- resolved: 2026-10-04T23:03:27.600Z by lead
- fix: `{"commit":"1a5e78c28e7af9008b6effb093edbbfa1b918507","short":"1a5e78c28e","subject":"tools: an uncounted warm-up phone run waited for another agent's --no-timing build hold (incident I-176)"}`
- remeasure: false

Error: `WAIT: phone run refused beside someone else's normal chrome-measure hold (lib/lock.mjs phoneRunRefusal; iphone.mjs scroll\|record\|run\|gesture); a warm-up times nothing, so a no-timing or shared hold should not block it, a timing hold should`

Command: `fix plan: an explicit uncounted/warm-up mark (iphone.mjs gesture\|scroll\|run --warmup, or label) that runs beside --no-timing and shared holds but never beside a timing hold, recorded in the run's mac field (mac.warmup=true plus the holder kind); counted runs keep today's rule; tests: refused beside a timing hold, passes beside no-timing/shared, recorded in mac; same file as I-171/I-172 (lib/lock.mjs phoneRunRefusal) so queue for ts-lock-rules after them; workaround: warm up inside its own no-timing hold, or between other agents' holds. Cost: phone stays at Fair, block's Serious gate delayed; part of the phone-hold-v2 work (research/architecture/phone-hold-v2.md)`

Resolution: fixed

landed with the lock-rules batch (full npm test 2204/2204)

## I-177: A proposal under changes-requested shows no progress until rev N+1 is posted: no in-progress state, no ETA, no alarm (PR-018 2 h 8 min, PR-021 30+ min)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T20:11:18.247Z by lead
- affected: [object Object]
- resolved: 2026-10-04T22:44:41.146Z by lead
- fix: `{"commit":"11913a224bfa55d3d88446ad436514eaa28ff91c","short":"11913a224b","subject":"tools: proposal revising mark and overdue alarm after changes-requested (incident I-177)"}`
- remeasure: false

Error: `user T-154 #7/#9: no notification and no 'waiting for your review' on any proposal`

Command: `console.mjs proposal list`

Resolution: fixed

changes-requested proposals show a revising mark (who, ETA) and an overdue alarm to the lead

## I-178: answer-lint passes an issue reply that lacks cause, which cases, workaround and long-term fix (the issue loop)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T20:24:23.278Z by lead
- affected: [object Object]

Error: `user T-154 #11: the lead answered a raised problem with a state explanation; the lint said FORMAT OK`

Command: `console.mjs thread reply --check-format`

## I-179: Menu morph (PR-018 rev 7c, accepted build): a swipe that lifts just past closed (p -0.10/-0.13) glides back to open with no finger down; 2 of 42 swipes in C-052 try 1

- status: triaged
- class: fix
- blocking: false
- reported: 2026-10-04T20:38:33.591Z by lead
- affected: [object Object]

Error: `returned-to-open 2/2 exits (fixes/morph-scroll/finger-returns.mjs)`

Command: `node fixes/morph-scroll/finger-returns.mjs`

## I-180: Console threads have no way to move or merge a message into another thread (user T-109 #33: replied in the wrong thread)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T20:42:47.085Z by lead
- affected: [object Object]

Error: `no thread move/merge command`

Command: `console.mjs thread`

## I-181: The lead's triage listener skips user messages in threads assigned to the lead: T-159 #5-#7 (20:56-20:58Z) woke nobody

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-04T21:01:07.774Z by lead
- affected: [object Object]
- resolved: 2026-10-04T22:35:45.960Z by lead
- fix: `{"commit":"559ebf248c17bdee8747de74b6e1997b2e24d6d2","short":"559ebf248c","subject":"tools: thread wait --triage skipped threads assigned to the lead; --monitor crashed on a lost re-check (incident I-181)"}`
- remeasure: false

Error: `thread wait --as lead --triage: no WAKE for a thread whose assignee is lead (listening)`

Command: `console.mjs thread wait --as lead --triage --monitor`

Workaround: lead runs a 2nd listener (thread wait --as lead --monitor, no --triage); both restart in 30 s after a crash

Resolution: fixed

triage wakes at once for user messages in lead-assigned threads; --monitor no longer crashes on a lost re-check. Restart running listeners.

## I-182: The iPhone sat free 15+ min while signed-able phone work waited on Mac-side pre-checks; no alarm because nothing was marked ready (user T-159 #6/#7)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T21:01:07.875Z by lead
- affected: [object Object]
- resolved: 2026-10-05T00:53:29.145Z by lead
- fix: `{"commit":"20a04da92618a4ff99dfb0b774be85fbd84e90bb","short":"20a04da926","subject":"tools: idle alarm saw no ready work while startable phone work waited on Mac-side pre-checks (incident I-182)"}`
- remeasure: false

Error: `idle.mjs: OK iphone free, no ready work`

Command: `idle.mjs check`

Resolution: fixed

landed on main (rebase + ff-only, npm test passed on the exact tree). git rebase main between steps; restart any idle watch or status reader to pick it up.

## I-183: Board shows a lead-only incident as 'blocked by' on every row the lead owns, and incident update has no --blocking to clear it

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T21:14:01.067Z by lead
- affected: [object Object]
- resolved: 2026-10-04T23:40:05.094Z by lead
- fix: `{"commit":"ab9fdcc1463c4ba40229612855c13b5efa03d78e","short":"ab9fdcc146","subject":"tools: incident update --blocking; lead-only incidents block no board row (incident I-183)"}`
- remeasure: false

Error: `status list: 6 worker rows read 'now: blocked by I-181' (an incident affecting only the lead's listener)`

Command: `node tools/status.mjs list`

Workaround: status.mjs set <row> --by lead --unlink incident:<id>

Resolution: fixed

incident update --blocking; lead-only incidents no longer mark board rows blocked. npm test 2227/0 on the exact tree. git rebase main between steps.

## I-184: Count-only WDA gestures (no timing numbers) can only run in a timing hold, so they wait at the host gate

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T21:18:10.026Z by lead
- affected: [object Object]
- resolved: 2026-10-05T00:07:04.648Z by lead
- fix: `{"commit":"9f5b9d0c4210387b4e9ff13a61c95f39b167a756","short":"9f5b9d0c42","subject":"tools: count-only Simulator gestures could only run in a timing hold, so they waited at the host gate (incident I-184)"}`
- remeasure: false

Error: `sim.mjs gesture refuses in a --no-timing hold: scroll, record and run are timing`

Command: `lock.mjs run chrome-measure --no-timing -- sim.mjs gesture`

Workaround: queue a normal hold; the lead moves it behind non-gated jobs while load is high

Resolution: fixed

count-only Simulator gestures (sim.mjs gesture --count-only) run in a shared simulator slot or a --no-timing hold; git rebase main

## I-185: chrome-measure queue does not follow board priority: the lead made 89 hand moves on 10-04

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T21:23:04.938Z by lead
- affected: [object Object]
- resolved: 2026-10-05T00:07:04.744Z by lead
- fix: `{"commit":"49e9d38ea21ef2e24a5b44bc8eccacb2595525ab","short":"49e9d38ea2","subject":"tools: the lane stood idle while capped non-timing jobs waited behind a timing head held at the host gate past 120 s (incident I-185)"}`
- remeasure: false

Error: `locks/audit.log: 89 of 92 queue-move entries by lead on 2026-10-04`

Command: `lock.mjs repair chrome-measure --move`

Workaround: mgmt-devices moves inside board priority (after I-171 lands)

Resolution: fixed

a timing head at the gate past 120 s is passed by capped short/shared jobs that fit (now+maxSec+120 <= gate start+600), board priority first, gate-pass audit lines; git rebase main

## I-186: Phone run tools need a thermal profile (serious default via Xcode condition, fair option) checked at hold start and end, and a self-posted console step on mismatch

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T21:47:29.039Z by mgmt-devices
- affected: [object Object]
- resolved: 2026-10-04T23:15:12.924Z by lead
- fix: `{"commit":"6967a25f7282f48983787416c588ea9ed1b0bdfc","short":"6967a25f72","subject":"tools: phone runs had no thermal profile gate (serious default, fair option) at hold start/end (incident I-186)"}`
- remeasure: false

Error: `user T-162 #3/#5: induced Serious becomes the default test profile; no tool checks or records the profile`

Command: `iphone.mjs run\|scroll\|gesture; research/phone-thermal-gate/thermal-gate.mjs`

Resolution: fixed

phone runs check the thermal profile (serious default via Xcode condition, --profile fair optional) at hold start/end; exit 8 PROFILE on mismatch

## I-187: Progress page shows the Mac lane as plain 'free' while jobs wait behind a gated first waiter (user T-165 #3)

- status: parked
- class: tool
- blocking: false
- reported: 2026-10-04T22:09:32.128Z by lead
- affected: [object Object]

Error: `free (small: handing over to fix-toolbar-resize (gated: cpu 46.6 % > 25 %))`

Command: `console /progress, lock box`

## I-188: Progress page shows the Mac lane as plain 'free' while it is stalled at the host gate with jobs waiting (user T-165 #1, #3)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T22:09:35.507Z by mgmt-devices
- affected: [object Object]
- resolved: 2026-10-05T00:53:28.917Z by lead
- fix: `{"commit":"8bc6e872fe899a34de1c98d5f745dbfe95ecfb83","short":"8bc6e872fe","subject":"tools: the Progress page called chrome-measure \"free\" while jobs waited behind the host gate (incident I-188)"}`
- remeasure: false

Error: `progress-page.html line 182: headline 'free'; the stall reason is a small grey line (handover.text)`

Command: `node tools/progress.mjs (lane view)`

Resolution: fixed

landed on main (rebase + ff-only, npm test passed on the exact tree). git rebase main between steps; restart any idle watch or status reader to pick it up.

## I-189: idle phone alarm fires between holds of a marked phone block: counts the block's own result row (waiting on the runner) as a phone waiter

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T22:35:14.774Z by lead
- affected: [object Object]
- resolved: 2026-10-04T23:40:05.181Z by lead
- fix: `{"commit":"9db58eefd996b38966941751ecf0b47402a029e2","short":"9db58eefd9","subject":"tools: idle alarm called a marked phone block's Mac wait and its own result row an unused phone (incident I-189)"}`
- remeasure: false

Error: `IDLE iphone: held by iphone-runner, unused 6 min while 1 job waits (double-drive-fix, waits on iphone-runner)`

Command: `node tools/idle.mjs watch --by lead`

Resolution: fixed

idle alarm: a marked phone block's Mac wait reads OK; a row waiting on the lease holder is no phone waiter. npm test 2227/0. git rebase main between steps.

## I-190: tests/e2e/console-cli.test.mjs 'stopping the server removes server.json' flaked once under load (server.json still present)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-04T23:03:34.173Z by lead
- affected: [object Object]

Error: `server.json still present after stop`

Command: `npm test (ts-lock-rules, shared lane, ~22:44Z)`

## I-191: Console threads scrub every web link to <link>, also a private claude.ai artifact link the user asked for (T-170 #7-#9)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-04T23:44:37.408Z by lead
- affected: [object Object]
- resolved: 2026-10-05T00:25:05.883Z by lead
- fix: `{"commit":"442168c1f1947367f6d17a924fde07cd7fe7bb2c","short":"442168c1f1","subject":"tools: console texts scrubbed claude.ai artifact links to <link> (incident I-191)"}`
- remeasure: false

Error: `scrubbed before storing (Hard rule 12): url`

Command: `node tools/console.mjs thread reply T-170 --by lead --file <f> (text with https://claude.ai/artifact/<id>)`

Resolution: fixed

console keeps claude.ai artifact links (claude.ai/artifact/<id>, claude.ai/code/artifact/<uuid>) instead of scrubbing them to <link>; full npm test 2243/2243 on d81795b4 (rebased later only over a docs-only README)

## I-192: tests/e2e/space-prune-cli.test.mjs 'prune --apply' flaked: kept the uncited frames because 'a running process names it' (REMOVED 1, expected 2), likely another concurrent npm test in the shared group

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T00:02:06.254Z by ts-phone-hold
- affected: [object Object]
- resolved: 2026-10-05T01:34:57.285Z by lead
- fix: `{"commit":"d1c55d9415b5003fc22699fed4b6f4db2f9d0c3b","short":"d1c55d9415","subject":"tools: two npm test runs on one Mac collided on Try-it ports and prune's process check (incidents I-193, I-192, I-195)"}`
- remeasure: false

Error: `AssertionError: The input did not match /REMOVED 2 item\(s\)/ ... kept (why): 1 frames: a running process names it`

Command: `git commit (pre-commit npm test, shared lane, 2026-10-04T23:58Z)`

Resolution: fixed

Landed on main after npm test passed on the rebased tree (2270 tests, 0 fail; the first run hit only the known flake I-153). git rebase main between steps; nothing to re-measure (test tooling only).

## I-193: e2e console-live 'proposal phone' flakes when two npm tests share the lane: Try-it port picked by probe (lowest free in 6400-6599) races the later listen

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T00:02:16.155Z by ts-idle-ready
- affected: [object Object]
- resolved: 2026-10-05T01:34:57.370Z by lead
- fix: `{"commit":"d1c55d9415b5003fc22699fed4b6f4db2f9d0c3b","short":"d1c55d9415","subject":"tools: two npm test runs on one Mac collided on Try-it ports and prune's process check (incidents I-193, I-192, I-195)"}`
- remeasure: false

Error: `Try-it build "site-pretty+…": port 6410 is in use (something listens on 127.0.0.1:6410)`

Command: `npm test (pre-commit hook) beside the lead's npm test in one shared chrome-measure group, 2026-10-05 ~00:00Z`

Resolution: fixed

Landed on main after npm test passed on the rebased tree (2270 tests, 0 fail; the first run hit only the known flake I-153). git rebase main between steps; nothing to re-measure (test tooling only).

## I-194: scrubAgentText swallows the closing ')' (and other punctuation) after a scrubbed URL: '(see http://x/)' becomes '(see <link>'

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-05T00:12:36.317Z by ts-artifact-link
- affected: [object Object]

Error: `scrubAgentText('(see https://example.invalid/a)').text === '(see <link>' (proposal.mjs scrubText keeps the ')')`

Command: `node -e "import('./tools/lib/console-threads.mjs').then(T=>console.log(T.scrubAgentText('(see https://example.invalid/a)').text))"`

## I-195: flaky unit test tryit.test.mjs: servers list expected [] but got 4 host-down entries (b1, b2, b4, real)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T00:38:45.801Z by mgmt-ops-10
- affected: [object Object]
- resolved: 2026-10-05T01:34:57.454Z by lead
- fix: `{"commit":"d1c55d9415b5003fc22699fed4b6f4db2f9d0c3b","short":"d1c55d9415","subject":"tools: two npm test runs on one Mac collided on Try-it ports and prune's process check (incidents I-193, I-192, I-195)"}`
- remeasure: false

Error: `deepStrictEqual actual [b1 61575 host-down, b2 'Best <build>', b4, real] expected []`

Command: `npm run test:unit (docs-only branch, 2026-10-05 ~00:45Z); passed 1184/1184 on immediate rerun`

Resolution: fixed

Landed on main after npm test passed on the rebased tree (2270 tests, 0 fail; the first run hit only the known flake I-153). git rebase main between steps; nothing to re-measure (test tooling only).

## I-196: P3: idle alarm counts a row whose NOTE only names Chrome or the lock as chrome-measure ready work (same cause as T-169 for the phone)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-05T00:47:25.774Z by mgmt-devices
- affected: [object Object]

Error: `tools/lib/idle.mjs readyWork(): after I-182 the phone ignores notes that merely name it, the chrome-measure path still counts them`

Command: `node tools/idle.mjs check`

## I-197: flaky e2e sim-warm 'I-063 keeper: a timing holder shuts fw-sim down': keeper logged the queued-acquire reason, not the held one

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-05T00:56:15.169Z by ts-npm-parallel
- affected: [object Object]

Error: `keeper.log: SIM_WARM_SHUTDOWN ("ab" waits for a timing hold of chrome-measure; by keeper), expected /chrome-measure is held by "ab" \(a timing hold\)/`

Command: `git commit (pre-commit npm test, shared lane, load high, 2026-10-05 ~00:58Z)`

## I-198: gesture --timeline has no stack-depth option: Timeline stacks are always depth 1 (wip.mjs TIMELINE_START)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-05T02:52:58.889Z by fix-toolbar-resize
- affected: [object Object]

Error: `Timeline.start {maxCallStackDepth: 1} hard-coded; script DOM calls keep only their [native code] frame`

Command: `node tools/iphone.mjs gesture ... --timeline (tools/lib/wip.mjs l.267-268)`

## I-199: Own heat-mode tool: tools/thermal.mjs (list/status, set serious, clear) on the iPhone, built on appium-ios remotexpc code (Apache-2.0), user T-179 #16

- status: parked
- class: tool
- blocking: false
- reported: 2026-10-05T04:43:06.254Z by lead
- affected: [object Object]

Error: `no tool sets the iPhone thermal condition; heat checks post console steps (C-055)`

Command: `node tools/thermal.mjs set serious`

## I-200: GitHub fetch rules ask the user instead of refusing: agents' WebFetch/curl to GitHub land as permission prompts for the user (T-184 #3)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T06:03:33.423Z by lead
- affected: [object Object]
- resolved: 2026-10-05T06:22:15.933Z by lead
- fix: `{"commit":"85f33a82dbc297b1a3a288d9802ef8e9e21af316","short":"85f33a82db","subject":"agents: GitHub only through gh, WebFetch/curl to GitHub hosts are refused (incident I-200)"}`
- remeasure: false

Error: `map-webkit-clip-accel WebFetch raw.githubusercontent.com x2 at 05:56Z asked the user`

Command: `WebFetch https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/animation/KeyframeEffect.cpp`

Resolution: fixed

GitHub fetches (WebFetch, curl, wget) are now refused with the gh recipe instead of asking the user; agent definitions carry the rule. Hook tests 584/584 on main; npm test 2337/2337 in the toolsmith worktree. Rebase main between steps; new hook settings may apply only in sessions started after this.

## I-201: iPhone heat check reads Critical (Xcode-induced) twice while the user says Xcode is set to Serious

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-05T06:12:18.813Z by art-worst-cases
- affected: [object Object]
- resolved: 2026-10-05T06:59:28.727Z by lead
- fix: `{"commit":"eb12e914247ff3c61a70f4d176a56b3a28f610d9","short":"eb12e91424","subject":"tools: phone heat check folded the Xcode condition's level into the phone's (incident I-201)"}`
- remeasure: false

Error: `REFUSED profile serious: phone is Critical (induced by Xcode), battery 30.19 C; the Xcode condition is Critical, above the ceiling`

Command: `hold.sh start read: node tools/iphone.mjs profile --owner art-worst-cases (06:08Z and 06:11Z)`

Workaround: No phone runs while the phone's own level is Critical; the lead re-reads it. Do not post Xcode steps.

Resolution: fixed

heat check keeps the Xcode condition's own level; no false set-Serious steps; reason codes on every refusal. npm test on main 2343/2343. The stuck Critical was cleared by Xcode Stop, about 2 min, Start (06:44-06:54Z, OBSERVED). Follow-up hint text by ts-i201 lands separately. Rebase main; no re-measure.

## I-202: lock.mjs doing iphone --between refuses after the hold ends, but the block protocol says to mark the gap after each hold

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T08:42:30.905Z by lead
- affected: [object Object]
- resolved: 2026-10-05T12:59:46.244Z by lead
- fix: `{"commit":"430d35fb5c971611603e0eb62409e3ee6b2086c7","short":"430d35fb5c","subject":"tools: phone-block priority starved shared readers; --between refused after the phone hold ended (incidents I-207, I-202)"}`
- remeasure: false

Error: `doing iphone --between: refused, no live phone hold (iphone-runner, P-122)`

Command: `node tools/lock.mjs doing iphone --owner iphone-runner --between 2`

Resolution: fixed

npm test on main 2359/2359. Phone runners rebase between blocks (never mid-block); readers then get one gap group per block part automatically.

## I-203: iphone.mjs gesture: no way to idle after the script's own reload without changing the program hash (P-129 L runs need 20 s idle before the first touch)

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-05T08:45:49.575Z by lead
- affected: [object Object]
- resolved: 2026-10-05T09:19:33.299Z by lead
- fix: `{"commit":"61950199b20d6a5780479eb7576ecb4c30a44dd9","short":"61950199b2","subject":"tools: gesture can't idle after the script's own reload without changing the hash (incident I-203)"}`
- remeasure: false

Error: `fs script reloads, then pause 4000: first touch ~4.6 s after ready; G4 for L wants 20-23 s; changing the pause changes GESTURE_HASH (G6)`

Command: `node tools/iphone.mjs gesture g-fastshort-v1.json (P-129 L arm)`

Resolution: fixed

iphone.mjs gesture --idle-after-reload <ms> (0-60000, default 0 = records unchanged). Measurement code (gesture timing path): runs with a nonzero value don't compare with earlier gesture runs. git rebase main between steps.

## I-204: iphone.mjs gesture exits 1 on a thermal-profile refusal (I-186) where scroll/record exit 8: the gesture error wrapper drops the exit code

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T09:20:09.881Z by lead
- affected: [object Object]
- resolved: 2026-10-05T12:59:44.703Z by lead
- fix: `{"commit":"6993bedf8706e69a7203563b32dce94fb8b0ce8d","short":"6993bedf87","subject":"tools: iphone.mjs gesture exited 1 on a thermal-profile refusal, scroll/record exit 8 (incident I-204)"}`
- remeasure: false

Error: `gesture thermal refusal -> exit 1 (scroll/record: exit 8)`

Command: `node tools/iphone.mjs gesture <script>`

Resolution: fixed

npm test on main 2359/2359. Rebase main between steps.

## I-205: P-129 frozen reader p129-read.mjs crashes on real runs (Math.min spread overflow, line 175); per-run gate flags RERUN-NEEDED on runs that exited 0

- status: resolved
- class: research
- blocking: false
- reported: 2026-10-05T10:00:47.239Z by lead
- affected: [object Object]
- resolved: 2026-10-05T10:16:47.098Z by lead
- fix: `{"commit":"eef8c01acc7ced669b13b2b0715100f0269cb42a","short":"eef8c01acc","subject":"serious-heat: P-129 reader rev 1.1 (06f74f5d19ca): line 175 spread min/max replaced by a loop (RangeError on real Timelines in part 1); card discloses it; self-test unchanged (110cc04eb8fb, PASS 48); old/new byte-identical on self-test, dry-run and cut real files"}`
- remeasure: false

Error: `RangeError: Maximum call stack size exceeded at readRun (p129-read.mjs:175)`

Command: `research/serious-heat/phone/p129-gates.mjs via p129-hold.sh`

Resolution: fixed

P-129 reader rev 1.1 (06f74f5d19ca) landed: line 175 loop, byte-identical proof, ops PASS (f4814743). Part 1 runs re-read, not re-run. No re-measure.

## I-206: proposal post live.a check warns B does not carry A's changes (4 lines) for a B built on A; overlay diff shows B = A + own hunk only

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T10:57:39.434Z by fix-people-word
- affected: [object Object]
- resolved: 2026-10-05T12:59:45.323Z by lead
- fix: `{"commit":"581e1c4b0a45452c38b878ee9e03bd958f2e6156","short":"581e1c4b0a","subject":"tools: proposal live.a check counted A's diff-alignment lines as changes B must carry (incident I-206)"}`
- remeasure: false

Error: `warning: options[0].live.a: B (fixes/people-word-a/patch.diff) does not carry all of A's (fixes/morph-scroll-v9try/patch.diff) changes: _app/immutable/nodes/2.DyWL8TcE.js (4 line(s))`

Command: `node tools/console.mjs proposal post --by fix-people-word --file out/people-word/proposal.json (PR-024)`

Resolution: fixed

npm test on main 2359/2359. Rebase main between steps.

## I-207: phone-block priority starves shared readers: between P-130 parts the block's next --no-timing hold goes first every time; 1-weight readers queued 10+ min waited through 2 gaps (I-049 10-min rule not a

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T11:18:23.193Z by lead
- affected: [object Object]
- resolved: 2026-10-05T12:59:46.026Z by lead
- fix: `{"commit":"430d35fb5c971611603e0eb62409e3ee6b2086c7","short":"430d35fb5c","subject":"tools: phone-block priority starved shared readers; --between refused after the phone hold ended (incidents I-207, I-202)"}`
- remeasure: false

Error: `11:15:44Z gap: int-v8 queued since 11:05:31 not served; iphone-runner moved by phone-block priority took the slot`

Command: `node tools/lock.mjs status (P-130 block, 2026-10-05 11:03-11:16Z)`

Resolution: fixed

npm test on main 2359/2359. Phone runners rebase between blocks (never mid-block); readers then get one gap group per block part automatically.

## I-208: sim.mjs session: simctl launch Safari timed out after 60 s on a fresh boot (shared slot, 11:4xZ)

- status: triaged
- class: env
- blocking: false
- reported: 2026-10-05T11:48:55.461Z by fix-nav-fade
- affected: [object Object], [object Object], [object Object]

Error: `simctl launch Safari failed (timed out after 60 s)`

Command: `lock.mjs run chrome-measure --shared --weight simulator -- sim.mjs session --functional --owner fix-nav-fade -- motion.mjs --engine sim --passes counts --scen end`

## I-209: Try-it and fix.mjs diff cannot carry image files: patch.diff drops binary overlay files

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-05T13:03:14.249Z by fix-end-bg
- affected: [object Object]
- resolved: 2026-10-05T14:36:40.809Z by lead
- fix: `{"commit":"ed06dcd5593c4b47125d9a159cb94403b20c38dc","short":"ed06dcd559","subject":"tools: proposal live entries can serve a local gitignored overlay (incident I-209)"}`
- remeasure: false

Error: `fix.mjs cmdDiff uses diff -u: a re-encoded .png/.jpg/.avif in the overlay gives 'Binary files differ' and no content, so proposal live (B = baseline + patch.diff) can never show image changes`

Command: `node tools/fix.mjs diff end-bg-img; node tools/console.mjs proposal post ... --live-patch fixes/end-bg-img/patch.diff`

Resolution: fixed

proposal live entries can serve a local gitignored overlay (--live-overlay); fix.mjs diff notes skipped binary files. npm test on main 2368/2368. Rebase main between steps; no re-measure needed (no measurement code changed).

## I-210: chrome-measure: exclusive heads starve behind shared readers aged 10 min (I-049 rule); lead moved 4 heads in 1 h

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-05T14:26:50.970Z by lead
- affected: [object Object]
- resolved: 2026-10-05T14:54:45.412Z by lead
- fix: `{"commit":"de45ee869c618482a27658e69f8c0d1c9b0288b1","short":"de45ee869c","subject":"tools: an exclusive head starved behind readers that aged 10 min (incident I-210)"}`
- remeasure: false

Error: `fix-end-bg no-timing head waited 13:17-13:52Z, int-v8 no-timing head 13:50-14:25Z while readers queued later went first`

Command: `node tools/lock.mjs run chrome-measure --no-timing ...`

Resolution: fixed

an exclusive head now waits for at most one shared group; aged readers queued after it no longer jump it right after a group. npm test on main 2370/2370. git rebase main between steps; no re-measure (no measurement code changed).

## I-211: sim.mjs session refused: fw-sim already Booted with no live session (leak) at the start of P-141 hold S1

- status: triaged
- class: env
- blocking: false
- reported: 2026-10-05T15:07:44.006Z by fix-toolbar-resize
- affected: [object Object], [object Object]

Error: `refusing: fw-sim 15 Pro Max is already Booted (booted by someone else, or a leaked session: node tools/sim.mjs doctor)`

Command: `lock.mjs run chrome-measure ... sim.mjs session --owner fix-toolbar-resize -- node fixes/toolbar-resize/sim-ss.mjs S1 ...`

## I-212: WDA gesture actions refused: every G run in P-142 H1a aborted at the first stroke (point.x != INFINITY)

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-05T21:09:06.868Z by int-v8
- affected: [object Object]
- resolved: 2026-10-05T21:10:04.671Z by lead
- remeasure: false

Error: `gesture run aborted: error: WDA POST /session/<uuid>/actions: HTTP 500 unknown error: Invalid parameter not satisfying: point.x != INFINITY && point.y != INFINITY`

Command: `node tools/iphone.mjs gesture fixes/v9-best/phone/p121/flick-middle-v2.json --inject fixes/nav-hit-cache/flicker-inject.mjs --owner int-v8 (hold142.sh H1a, 21:05-21:07Z, after the iPhone reconnect)`

Resolution: workaround

WDA restarted by the lead 21:09Z (wda stop/start, runner and iproxy fresh, WDA READY, Safari in front); cause OBSERVED: stale WDA session after the USB reconnect (lead skipped the restart). Rerun H1a whole after a 1-stroke smoke in the holder's hold

## I-213: flaky unit test tests/unit/wip-connect.test.mjs: 'fetch failed' under parallel load (int-v8, test:unit, 2 failures; file passes 6/6 alone)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-05T22:23:33.492Z by lead
- affected: [object Object]

Error: `fetch failed`

Command: `npm run test:unit`

## I-214: iphone.mjs open: Runtime.evaluate timeouts on the parked tab after a WDA restart end in BLOCKED instead of a Safari restart

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-06T00:01:33.764Z by fix-end-morph
- affected: [object Object]

Error: `openTab try 1-5: Runtime.evaluate timed out after 8000ms; try 6: no tab matching any page; BLOCKED`

Command: `iphone.mjs open <B url> (thermal-gate.mjs timer part, P-152 H1 start gate, 23:56Z)`

## I-215: WDA restart at a P-152 part start: 'Timed out while enabling automation mode' after a 3 min cooling wait (phone likely auto-locked)

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-06T00:39:04.013Z by fix-end-morph
- affected: [object Object]
- resolved: 2026-10-06T03:45:38.311Z by lead
- remeasure: false

Error: `WebDriverAgentRunner: Failed to initialize for UI testing: Timed out while enabling automation mode; WDA NOT READY`

Command: `p152-block.sh part start: iphone.mjs wda stop; wda start; wda check (after wait.mjs phone-temp --below 38)`

Resolution: workaround

Cause (OBSERVED): the phone auto-locked during the cooling wait. Workaround: C-071 (unlock, Auto-Lock Never), done 03:17Z; WDA started READY at 03:17Z and 03:42Z. Kits check WDA right after every cooling wait.

## I-216: iPhone not visible to the Mac at P-153 part start: no USB device, idevicediagnostics exit 1, webkit proxy :9222 refused

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-06T03:24:45.462Z by fix-end-morph-p1
- affected: [object Object]
- resolved: 2026-10-06T03:41:59.671Z by lead
- remeasure: false

Error: `UNAVAILABLE phone-temp: battery temperature unavailable (idevicediagnostics exit 1)`

Command: `P153_COOL_FIRST=38 p153-block.sh part 1 (wait.mjs phone-temp --below 38); iphone.mjs status: device []`

Resolution: workaround

The iPhone was unplugged while the user tried option B by hand; the user reconnected it at ~03:41Z (T-207 #8). Battery read and debug proxy are back. Workaround: ask the user to reconnect; P-153 part 1 reruns once.

## I-217: WDA restart at P-153 block 2 part 1 start: 'Timed out while enabling automation mode' (no cooling wait before it)

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-06T04:26:09.095Z by fix-end-morph-p1
- affected: [object Object]
- resolved: 2026-10-06T04:43:30.787Z by lead
- remeasure: false

Error: `WebDriverAgentRunner: Failed to initialize for UI testing: Timed out while enabling automation mode; WDA NOT READY`

Command: `p153-block.sh part start: iphone.mjs wda stop; wda start; wda check`

Resolution: workaround

Phone locked again after the reconnect (same as I-215). Workaround: C-075 (unlock, Auto-Lock Never), done 04:38Z; WDA READY at 04:39Z.

## I-218: No tool captures a human finger gesture on the iPhone and turns it into a WDA gesture script (article clips, T-211)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-06T04:27:33.659Z by lead
- affected: [object Object]
- resolved: 2026-10-06T04:57:59.701Z by lead
- fix: `{"commit":"0168b6f5d03fd3139f3e58e4bcbcf74a0c7cef6b","short":"0168b6f5d0","subject":"tools: no tool captured a finger gesture or turned it into a WDA script (incident I-218)"}`
- remeasure: false

Error: `iphone.mjs record logs scroll position only, no touch events; gesture replays fitted scripts only`

Command: `node tools/iphone.mjs record --seconds 25 --label finger`

Resolution: fixed

landed on main: iphone.mjs record --touches, tools/gesture-from-record.mjs; npm test 2385/2385 pass on the rebased commit. Rebase between steps (never mid-block).

## I-219: Hydration fails on main since nav-earn rev 3: 'Failed to hydrate: HierarchyRequestError appendChild' at load (C, measured, N, V; not on the plain baseline)

- status: resolved
- class: fix
- blocking: false
- reported: 2026-10-06T07:29:17.658Z by lead
- affected: [object Object]
- resolved: 2026-10-06T11:04:51.077Z by lead
- fix: `{"commit":"9dbcd3190dd20327980ccd9685683636de99dd8f","short":"9dbcd3190d","subject":"i219-hydrate: Simulator functional check and README nits (lead, after review-i219 ACCEPT)"}`
- remeasure: false

Error: `Failed to hydrate: HierarchyRequestError … appendChild (Ln BSBv9QXB.js:1439 <- dN 2.DyWL8TcE.js C line 14583 le = e(__ewBox, !0), nav-earn rev 3)`

Command: `int-v8 console probe fixes/v10/console-probe.mjs, 430x775, 5 loads`

Resolution: fixed

Landed earlier today (487cead7 fix + 9dbcd319 Simulator check, review-i219 ACCEPT). The v10 rebuild picks it up; running blocks are unaffected.

## I-220: WDA restart fails at the 4th part start of a long phone block (P-153 07:03Z, P-152 08:16Z), about 70 min into the block; fixed once by a cable re-plug

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-06T08:18:16.886Z by lead
- affected: [object Object]
- resolved: 2026-10-06T11:30:18.928Z by lead
- fix: `{"commit":"caf9d44be35e3342f8578fc5b40d3b0f738bbd08","short":"caf9d44be3","subject":"tools: WDA restarted at every part start with no retry or re-plug signal (incident I-220)"}`
- remeasure: false

Error: `xcodebuild: BUILD INTERRUPTED / Supported platforms for the buildables in the current scheme is empty; WDA NOT READY`

Command: `p152-block.sh part 4 WDA restart (wda stop/start/check)`

Workaround: Ask the user to re-plug the iPhone cable (console step); the WDA restart then works (C-079 07:06Z, C-082 08:25Z). Blocks keep counted runs; only the part that hits it reruns.

Resolution: fixed

wda ensure: usbmux preflight, one clean retry on the automation-mode timeout, REPLUG NEEDED exit 4 for kits. npm test 2394/2394 on the exact commit. Phone kits: switch part starts to 'iphone.mjs wda ensure' after rebasing.

## I-221: A phone block run from an agent's background shell dies when that agent ends on an API error (P-157 part 1 killed mid-H7, 12:17Z)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-06T12:19:39.325Z by lead
- affected: [object Object]

Error: `lock.mjs run iphone pid 25401 gone at ~12:17Z after arch-compositor-morph ended twice with API 529; hold-H7.log stops after GATE PASS`

Command: `CM_TICKET=P-157 CM_COOL=0 node tools/lock.mjs run iphone --owner arch-compositor-morph --block P-157 ... -- sh fixes/compositor-morph/phone/cm-block.sh H1..H7 (Bash run_in_background)`

## I-222: iPhone dropped off USB mid P-156 block; phone-temp UNAVAILABLE treated as a cooling failure (BLOCK STOP VOID)

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-06T13:36:05.206Z by fix-end-morph-p1
- affected: [object Object]
- resolved: 2026-10-07T06:09:06.760Z by lead
- fix: `{"commit":"19df65596e992e3f1ab1a0cda0738411c16219fd","short":"19df65596e","subject":"tools: a lost iPhone USB link read as a cooling failure, no link watchdog (incident I-222)"}`
- remeasure: false

Error: `UNAVAILABLE phone-temp: battery temperature unavailable (idevicediagnostics exit 1; 3 failed reads in a row)`

Command: `p156-block.sh cooling before H5: node tools/wait.mjs phone-temp --below 38 --timeout 600`

Workaround: User re-plugs the cable (console step C-087); the block continues from H5 (H1-H4 kept, as for I-220), with one uncounted warm-up per arm after the re-plug

Resolution: fixed

usblink.mjs status/watch/proxy landed; npm test on main 2447/2447. Lead runs usblink watch --post-step (re-plug step after 60 s). phone-temp now exits 5 LINK-LOST: block runners take the re-plug + warm-up path instead of VOID. Cause of the drops UNRESOLVED (usbmux link ends, USB device stays); the watch logs config/speed/attach per drop.

## I-223: Phone plugged into another USB port: tools report no device (user T-222 #5); re-plugs today all went back to one port

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-06T14:55:38.085Z by lead
- affected: [object Object]
- resolved: 2026-10-06T15:40:08.836Z by lead
- fix: `{"commit":"49a7ea055723fae510d8f80bee6cd5223c921268","short":"49a7ea0557","subject":"tools: phone-temp needed 3 failed reads at 60 s to report a phone off USB, naming no cause (incident I-223)"}`
- remeasure: false

Error: `user: after moving the cable to another USB bus the tools returned no device`

Command: `idevice_id -l / iphone.mjs wda ensure / wait.mjs phone-temp`

Workaround: Use the usual USB port until ts-i223 reports

Resolution: fixed

## I-224: Phone-block runner re-queues chrome-measure only after park + cooling; shared jobs slip in between holds (13.7 min of 107 in P-156)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-06T14:55:38.175Z by lead
- affected: [object Object]

Error: `holds.log: runner queuedAt->acquiredAt 0-120 s behind shared jobs at 6 of 18 gaps`

Command: `p156-block.sh hold() -> lock.mjs run chrome-measure --no-timing`

Workaround: Block kits queue the next hold's chrome-measure run before park/cooling; under xcode-serious no cooling wait (CM kit: CM_COOL=0)

## I-225: Phone reads Critical at 35-36 C while the Xcode condition is Serious (3 hold-start gates today, each ~15-60 s after a WDA + Safari restart); user T-222 #7

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-06T15:03:14.003Z by lead
- affected: [object Object]
- resolved: 2026-10-07T01:57:24.164Z by lead
- fix: `{"commit":"ce6f1f62ce0b1610ddb28ac6ce889349d3cda47f","short":"ce6f1f62ce","subject":"tools: a phone above the Serious condition got a blind stop+start user step; iphone.mjs rearm re-arms it with thermal.mjs, probed (incident I-225)"}`
- remeasure: false

Error: `GATE p152-H1-start profile xcode-serious state Critical induced Yes batt 35.29 C -> FAIL`

Command: `thermal-profile.mjs readThermal (xctrace Thermal State)`

Workaround: Re-arm WITH a probe: (1) user stops the Xcode condition; (2) the agent reads the plain state (thermal-gate --no-timer --expect fair) once a minute until Nominal/Fair, induced No (10-07: Critical 0 min, Serious 1 min, Nominal 2 min at 34 C); (3) user starts Serious; settle 120 s; profile read. Blind stop+start re-arms failed twice (C-095, C-097). Cause (OBSERVED): the real state lags after a real ceiling and outranks the induced condition ('phone-above-condition').

Resolution: fixed

iphone.mjs rearm (thermal.mjs clear, probe <=1/min until Nominal/Fair, set serious, settle 120 s, re-read) replaces the blind Xcode re-arm; tool-serious blocks need no user step (user T-228 #15). npm test on main 2420/2420. Why the phone state lags after a real ceiling stays OBSERVED; reopen if rearm times out on a cool phone.

## I-226: iphone.mjs run --driver morph (M) does not exercise the compositor morph: on pages with html.fw-cm it tweens x at a fixed scroll and CM's scroll-driven keyframes stay at progress 1; M results there ar

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-06T16:11:24.481Z by lead
- affected: [object Object]

Error: `fix-end-morph pfa M runs 15:40Z: 3-6 frames >50 ms attributed to CM, later shown to be driver artifacts`

Command: `iphone.mjs run --driver morph on a CM build`

Workaround: On CM builds use G (WDA gesture) or S/W scripted scroll for counted runs; M only on non-CM pages

## I-227: WDA refuses to launch Safari after the phone was re-plugged: Not authorized for performing UI testing actions (open from park fails, every hold-start gate fails)

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-06T16:43:47.136Z by int-v8
- affected: [object Object]
- resolved: 2026-10-06T18:54:59.330Z by lead
- fix: `{"commit":"5ba09f991b0585a5ed01936c484361743e34b879","short":"5ba09f991b","subject":"tools: a re-plugged iPhone's traps surfaced only mid-block; iphone.mjs preflight names them up front (incident I-227)"}`
- remeasure: false

Error: `safari-restart: WDA POST /session/<uuid>/wda/apps/launch: HTTP 400 ... XCTDaemonErrorDomain Code=41 "Not authorized for performing UI testing actions."`

Command: `node tools/iphone.mjs open <B url> --owner int-v8 (inside lock.mjs run iphone; also inside thermal-gate.mjs at v10cmnw-H1-start 16:42Z and v10nw-H1-start 15:48Z)`

Workaround: After any re-plug: user unlocks the phone and closes extra Safari tabs (console step), then iphone.mjs wda stop + wda start in the runner's own hold, 60 s settle, one manual open + one-stroke smoke before the block

Resolution: fixed

iphone.mjs preflight names the re-plug traps up front (not on USB 4, unlock/UI Automation 10, extra tabs 11, proxy 12) and gives a fresh WDA session after a re-plug; npm test 2406/2406 on main. Wired into the v11 kits (e5c68459). Open: whether a locked phone ever shows Code 41 (first live run failed earlier, at 'enabling automation mode', mapped to the same user step).

## I-228: thread reply scrubber treats "<word>'s iPhone" (e.g. v11's iPhone) as a device name and replaces it

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T00:35:24.005Z by lead
- affected: [object Object]
- resolved: 2026-10-07T01:33:35.491Z by lead
- fix: `{"commit":"3b5744ac7278eca74a8bf8b7e67e93c1c5a9dc4f","short":"3b5744ac72","subject":"tools: status, progress and proposal text redacted without the known device name (incident I-228 review 2)"}`
- remeasure: false

Error: `stored '- Next: <device-name>-worse check' for '- Next: v11's iPhone no-worse check'`

Command: `console.mjs thread reply T-228 --by lead --text ...`

Workaround: avoid "<name>'s iPhone" phrasing in thread text; write "the iPhone ... of v11"

Resolution: fixed

Landed 20c86c5a+7a25c991+3b5744ac; npm test on main 2412/2412. Scrubber no longer takes version tokens/prose as names, eats nothing after the device word; threads, status/progress and proposals redact with the known device name in any case.

## I-229: flaky e2e lock-shared-cli 'deadline: a reader overrunning --max-seconds is hard-killed': run ended 586 ms after the reader's deadline under a shared group (w5/5)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T01:05:36.325Z by ts-i228
- affected: [object Object]
- resolved: 2026-10-07T04:46:35.192Z by lead
- fix: `{"commit":"e8f7fa98f85abbe62da8901e9500c5c40533be64","short":"e8f7fa98f8","subject":"tests: ab-fake SIGTERM tests polled 3 s, shorter than verify's own teardown bound (incident I-236)"}`
- remeasure: false

Error: `AssertionError: run ended 586 ms after the reader's deadline (tests/e2e/lock-shared-cli.test.mjs:165)`

Command: `npm test (pre-commit hook, shared npm-test lease beside a weight-3 Simulator reader)`

Workaround: Timing-sensitive e2e under heavy host load (load1 54, Simulator reader beside it); rerun the suite when load is normal. Fold into the flaky-test sweep (I-151/I-213).

Resolution: fixed

landed in the table-lint batch (44e7cdbc..e8f7fa98); npm test on main 2429/2430, the 1 failure an unrelated sim-warm keeper flake (I-238) that passes alone 13/13

## I-230: flaky e2e iphone-battery: 'reads 2 s apart in all (1791 ms)' under host load (5-min load ~77)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T01:12:08.671Z by ts-i228
- affected: [object Object]
- resolved: 2026-10-07T04:46:35.290Z by lead
- fix: `{"commit":"e8f7fa98f85abbe62da8901e9500c5c40533be64","short":"e8f7fa98f8","subject":"tests: ab-fake SIGTERM tests polled 3 s, shorter than verify's own teardown bound (incident I-236)"}`
- remeasure: false

Error: `AssertionError: reads 2 s apart in all (1791 ms) (tests/e2e/iphone-battery.test.mjs:38)`

Command: `npm test (pre-commit hook, shared npm-test lease)`

Workaround: Timing-sensitive e2e under heavy host load; rerun when load is normal. Fold into the flaky-test sweep with I-229/I-213 (I-151).

Resolution: fixed

landed in the table-lint batch (44e7cdbc..e8f7fa98); npm test on main 2429/2430, the 1 failure an unrelated sim-warm keeper flake (I-238) that passes alone 13/13

## I-231: Phone reads Critical at 34.5-35.3 C under Xcode Serious, persisting after re-arms C-095/C-097 (v11-nw H3 gates, 01:1xZ)

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-07T01:21:53.909Z by int-v11
- affected: [object Object]
- resolved: 2026-10-07T01:22:24.443Z by lead
- remeasure: false

Error: `REFUSED profile serious: phone is Critical (Xcode condition Serious), battery 34.5 C (reason phone-above-condition)`

Command: `node tools/iphone.mjs profile --owner int-v11 (after preflight --settle 120; also v11nw-H3 start gates at 35.3 and 34.8 C)`

Resolution: duplicate

Same as I-225 (phone reads Critical under Xcode Serious on a cool phone); data merged there.

## I-232: answer-format lint accepts markdown tables without the |---| separator row; console shows them as raw text

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T02:17:17.610Z by ts-table-lint
- affected: [object Object]
- resolved: 2026-10-07T02:36:27.988Z by lead
- fix: `{"commit":"437fc885b0b00934f96c8f8df921536c2082f73d","short":"437fc885b0","subject":"tools: answer-format lint accepted markdown tables without the |---| separator row (incident I-232)"}`
- remeasure: false

Error: `user T-230: tables print as raw pipes`

Command: `console.mjs thread lint --file / thread reply`

Resolution: fixed

Lint rule (e) table-separator refuses a pipe table without its |---| row (user T-230). npm test on main 2421/2421. Follow-up (column-count mismatch, accept 1+ dashes) with ts-table-lint.

## I-233: iphone.mjs rearm says NOT-NEEDED when Xcode's condition (not ours) holds Serious in tool mode; block ran xcode-serious under a tool-serious card

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T03:08:14.542Z by lead
- affected: [object Object]
- resolved: 2026-10-07T04:15:24.149Z by lead
- fix: `{"commit":"776174d2c6b415472fbd769f8461b7150f91f55a","short":"776174d2c6","subject":"tools: rearm took Xcode's Serious as NOT-NEEDED in tool mode, thermal.mjs clear said NONE beside it, and the words always said Xcode (incident I-233)"}`
- remeasure: false

Error: `REARM NOT-NEEDED: phone is Serious (induced by Xcode) ... nothing cleared or set`

Command: `FW_PHONE_CONDITION=tool iphone.mjs rearm (P-158 start 03:07Z)`

Workaround: In tool mode, run thermal.mjs clear before rearm at a block start, so the leftover Xcode condition ends and rearm sets ours (P-158 restart 10-07 ~03:1xZ).

Resolution: fixed

landed ff on main; npm test on main 2426/2427, the 1 failure is the unrelated flake I-236 (ab-fake SIGTERM poll window under load), which passes alone (3/3). Tool blocks: rebase main; the pre-rearm thermal.mjs clear workaround is no longer needed; thermal.mjs clear exit 4 = stop it in Xcode.

## I-234: flaky e2e thermal-cli 'I-199: SIGTERM ends a set cleanly': thermal.mjs prints SET (line 136) before installing its SIGTERM handlers (line 139)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T03:10:23.478Z by ts-table-lint
- affected: [object Object]
- resolved: 2026-10-07T04:46:35.099Z by lead
- fix: `{"commit":"e8f7fa98f85abbe62da8901e9500c5c40533be64","short":"e8f7fa98f8","subject":"tests: ab-fake SIGTERM tests polled 3 s, shorter than verify's own teardown bound (incident I-236)"}`
- remeasure: false

Error: `assert x.code: null !== 0 (process killed by SIGTERM before the handler existed)`

Command: `npm test (pre-commit hook, shared lane beside a simulator reader, 03:05Z)`

Workaround: Rerun the suite; the race needs a SIGTERM within ~ms of SET.

Resolution: fixed

landed in the table-lint batch (44e7cdbc..e8f7fa98); npm test on main 2429/2430, the 1 failure an unrelated sim-warm keeper flake (I-238) that passes alone 13/13

## I-235: iPhone USB link lost ~04:00Z: usbmux sees no device, webkit proxy :9222 refused; USB device present in IOUSB, devicectl network only

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-07T04:05:08.595Z by lead
- affected: [object Object]
- resolved: 2026-10-07T04:13:36.413Z by lead
- remeasure: false

Error: `proxy not reachable on :9222 (ECONNREFUSED); idevice_id -l empty`

Command: `node tools/iphone.mjs status`

Workaround: user re-plugs the cable (console step); no phone work is queued until c2 passes the Mac checks

Resolution: workaround

user re-plugged (C-100); ios_webkit_debug_proxy did not re-attach, restarted 04:13Z on the user's OK (C-101); device and tabs listed again

## I-236: flaky e2e ab-fake 'SIGTERM on ab': still running after SIGTERM: verify, chrome (I-008 shape) during shared-lane npm test beside other agents' real Chrome runs

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T04:13:37.205Z by lead
- affected: [object Object]
- resolved: 2026-10-07T04:46:35.389Z by lead
- fix: `{"commit":"e8f7fa98f85abbe62da8901e9500c5c40533be64","short":"e8f7fa98f8","subject":"tests: ab-fake SIGTERM tests polled 3 s, shorter than verify's own teardown bound (incident I-236)"}`
- remeasure: false

Error: `AssertionError: still running after SIGTERM: verify, chrome`

Command: `npm test (main 776174d2, shared lane)`

Workaround: re-run tests/e2e/ab-fake.test.mjs alone in the shared lane

Resolution: fixed

landed in the table-lint batch (44e7cdbc..e8f7fa98); npm test on main 2429/2430, the 1 failure an unrelated sim-warm keeper flake (I-238) that passes alone 13/13

## I-237: flaky e2e bench-gain-fake 'review-snapshot note 1': every fake run reported style+layout 0 ms, verdict INCONCLUSIVE instead of HOLDS

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T04:38:50.428Z by ts-table-lint
- affected: [object Object]
- resolved: 2026-10-07T07:15:48.575Z by lead
- fix: `{"commit":"f7c9d5504c9ed7871190afcf2b4119646f7b3f3b","short":"f7c9d5504c","subject":"tests: the fake simctl rewrote its state file in place, and a poller read it empty (incident I-238)"}`
- remeasure: false

Error: `GAIN BASELINE-UNTRACKED: INCONCLUSIVE ... HL shift 0 [0, 0] (expected /GAIN BASELINE-UNTRACKED: HOLDS/)`

Command: `npm test (shared lane, rebased batch e8f7fa98 on main 96dcfa42); passed 4 hook runs before and 2 single reruns after`

Workaround: re-run tests/e2e/bench-gain-fake.test.mjs alone

Resolution: fixed

landed (deab9b24 serve --port 0 [::1] shadow + fixture lifeline; f7c9d550 fake simctl atomic state writes); npm test on main 2455/2455. test:chrome 13/14, the 1 a host-contamination verdict from the user's own Chrome (not ours).

## I-238: flaky e2e sim-warm 'I-063 keeper: shuts fw-sim down at its idle timeout' in shared-lane npm test on main e8f7fa98

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T04:46:35.539Z by lead
- affected: [object Object]
- resolved: 2026-10-07T07:15:48.662Z by lead
- fix: `{"commit":"f7c9d5504c9ed7871190afcf2b4119646f7b3f3b","short":"f7c9d5504c","subject":"tests: the fake simctl rewrote its state file in place, and a poller read it empty (incident I-238)"}`
- remeasure: false

Error: `test failed once in full suite; passes alone 13/13`

Command: `npm test (main e8f7fa98, shared lane)`

Workaround: re-run tests/e2e/sim-warm.test.mjs alone

Resolution: fixed

landed (deab9b24 serve --port 0 [::1] shadow + fixture lifeline; f7c9d550 fake simctl atomic state writes); npm test on main 2455/2455. test:chrome 13/14, the 1 a host-contamination verdict from the user's own Chrome (not ours).

## I-239: iPhone USB link lost again ~04:46Z during the user's hand test: usbmux sees no device, webkit proxy :9222 refused; USB device present in IOUSB

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-07T04:48:49.279Z by lead
- affected: [object Object]
- resolved: 2026-10-07T04:49:17.689Z by lead
- remeasure: false

Error: `proxy not reachable on :9222 (ECONNREFUSED); idevice_id -l empty`

Command: `node tools/iphone.mjs status`

Workaround: user re-plugs (C-102); if the proxy stays empty after usbmux sees the device, the lead restarts ios_webkit_debug_proxy (started by the lead 04:13Z)

Resolution: workaround

user re-plugged 04:49Z (C-102); usbmux 1, proxy :9222 lists the device and tab, battery reads; the proxy re-attached by itself this time

## I-240: Phone block runner killed at Claude Code's default 30-min background limit (P-159 H7 mid-gesture); exit trap did not run

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-07T05:23:00.286Z by lead
- affected: [object Object]

Error: `background task stopped at 1800 s default timeout`

Command: `P-159 block runner via Bash run_in_background (no timeout)`

Workaround: start every block runner with an explicit Bash run_in_background timeout of 7200000 ms (block cap 3600 s + margin); on a kill, resume from the first hold without a VALID line

## I-241: ios_webkit_debug_proxy listens on all interfaces (*:9221/9222), so Safari's inspector may be reachable from the LAN

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-07T06:04:11.975Z by lead
- affected: [object Object]
- resolved: 2026-10-07T06:32:29.320Z by lead
- fix: `{"commit":"a4afb1e15d91deccddd2fcd07b7b7e5d93a9dfd0","short":"a4afb1e15d","subject":"tools: the phone's webkit proxy listened on every interface (incident I-241)"}`
- remeasure: false

Error: `lsof: TCP *:9221 (LISTEN)`

Command: `ios_webkit_debug_proxy -c null:9221,:9222-9322`

Resolution: fixed

proxy now started by usblink.mjs proxy start, listening on 127.0.0.1:9221/9222 only (verified with lsof); npm test on main 2451/2452, the 1 failure a bench fake flake (I-237 family) that passes alone 12/12

## I-242: usblink watch does not log a re-attach that happens between two 10 s polls (attach #135 -> #136 around 12:00Z, no log line)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T12:03:12.999Z by lead
- affected: [object Object]
- resolved: 2026-10-07T12:28:33.887Z by lead
- fix: `{"commit":"a9b634ffd54d05e33ae538f3b145509bbeb48c63","short":"a9b634ffd5","subject":"tools: usblink watch logged nothing for a re-attach between two polls (incident I-242)"}`
- remeasure: false

Error: `watch log's last line 10:31:33Z attach #135; status at 12:02Z shows attach #136`

Command: `node tools/usblink.mjs watch --by lead --repair --post-step`

Resolution: fixed

usblink watch logs REATTACH lines for a re-attach between polls; watch restarted 12:28Z; npm test on main 2456/2457, the one failure (sim-warm I-063 keeper message) passes alone 14/14

## I-243: flaky e2e: sim-warm I-063 keeper test expects 'chrome-measure is held by "ab" (a timing hold)' but gets '"ab" waits for a timing hold' (timing race)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-07T12:28:34.057Z by lead
- affected: [object Object]
- resolved: 2026-10-07T12:55:38.028Z by lead
- fix: `{"commit":"aff823208a0b5e964663994abec78791f6c336fc","short":"aff823208a","subject":"tools: sim-warm keeper test raced the lock's host gate (incident I-243)"}`
- remeasure: false

Error: `tests/e2e/sim-warm.test.mjs:180 ERR_ASSERTION (main a9b634ff, full npm test 12:20Z); passes alone 14/14`

Command: `npm test`

Resolution: fixed

sim-warm keeper test raced the lock's host gate; test-only fix (SIGSTOP sync point + slow host stub), full npm test on main passed 2457/2457. Rebase when convenient; no re-measure.

## I-244: P-163 preflight: fresh WDA runner fails after a re-plug (automation mode timeout, then no ServerURLHere); block stopped before H1

- status: triaged
- class: env
- blocking: false
- reported: 2026-10-07T14:03:39.718Z by arch-end-fresh
- affected: [object Object]

Error: `WDA start 1 failed: XCTest timed out enabling automation mode on the iPhone ("Failed to initialize for UI testing")`

Command: `sh research/end-of-page-fresh/phone/fe-run.sh P-163 (iphone.mjs preflight)`

## I-245: proposal live/revise warns B does not carry A's JS changes, but B is built on A (false positive)

- status: triaged
- class: tool
- blocking: false
- reported: 2026-10-07T20:31:36.382Z by fix-g0-box
- affected: [object Object]

Error: `warning: B (fixes/v3w-g00c/patch.diff) does not carry all of A's (fixes/platform-corners-g00b/patch.diff) changes: _app/immutable/nodes/2.DyWL8TcE.js (1769 line(s))`

Command: `node tools/console.mjs proposal live PR-038 --by fix-g0-box --patch fixes/v3w-g00c/patch.diff --a-patch fixes/platform-corners-g00b/patch.diff`

## I-246: iphone.mjs run/scroll/gesture have no real-heat profile: --profile is serious (Xcode-induced only) or fair, so a real Serious phone refuses (exit 8, gate code 7); P-165 (real heat) cannot run

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-08T05:21:01.448Z by fix-g0-box
- affected: [object Object]
- resolved: 2026-10-08T05:41:54.510Z by lead
- fix: `{"commit":"a84b29169efd15fe9de93b78a3ec222373dd307a","short":"a84b29169e","subject":"tools: no real-heat phone profile, a real Serious phone refused every run (incident I-246)"}`
- remeasure: false

Error: `tools/lib/thermal-profile.mjs PROFILES has only serious (acceptInduced true) and fair; gateVerdict returns code 7 for Serious induced No under serious`

Command: `node tools/iphone.mjs run --driver scroll --probe std --profile serious (real heat)`

Resolution: fixed

--profile real-serious (+ --warmup) on main; npm test on main 2462/2462

## I-247: iphone.mjs run has no --timeline: W window attribution runs (P-166) cannot record WebKit Timeline durations; only gesture can

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-08T08:01:38.711Z by lead
- affected: [object Object]
- resolved: 2026-10-08T09:00:15.394Z by lead
- fix: `{"commit":"11e86d552b0cff8c2c99248c445c82d434f506eb","short":"11e86d552b","subject":"tools: iphone.mjs run had no --timeline, so W attribution runs could not record WebKit Timeline (incident I-247)"}`
- remeasure: false

Error: `iphone.mjs run: no --timeline option (gesture-run.mjs has the Timeline arm)`

Command: `node tools/iphone.mjs run --driver window --probe std --from 4000 --to 5000 --timeline`

Resolution: fixed

iphone.mjs run --timeline <out.json> (all drivers); npm test on main 2469/2469; runs without the flag unchanged (byte pins). Rebase main before using it.

## I-248: status board marks an owner 'owner ended (orphan wait)' when a detached phone-block runner (nohup, I-221 workaround) runs its own console.mjs wait, although the owner's own wait is live under Claude C

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-08T10:25:11.979Z by lead
- affected: [object Object]
- resolved: 2026-10-08T13:53:09.306Z by lead
- fix: `{"commit":"da6a68777922e6e8a5e411b42b93b4febc2a5f6c","short":"da6a687779","subject":"tools: the status board called a detached block runner's own wait an orphan and its owner ended (incident I-248)"}`
- remeasure: false

Error: `MAY BE OUT OF DATE: owner ended (orphan wait): a wait of fix-g0-box runs with no Claude Code session above it`

Command: `node tools/status.mjs list (P-166 part A, 10:24Z: runner pid 22440 under nohup; owner wait pid 22577 under claude 7457)`

Resolution: fixed

landed on main; npm test on main 2482/2482 at 13:52Z (f7520fb3). git rebase main between steps.

## I-249: iphone.mjs rearm aborts on a transient RSD close in its first thermal.mjs clear (no retry)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-08T11:16:29.530Z by fix-g0-box
- affected: [object Object]
- resolved: 2026-10-08T13:53:09.209Z by lead
- fix: `{"commit":"63b7ef04458268e65409bb6068c0a19855447174","short":"63b7ef0445","subject":"tools: iphone.mjs rearm aborted on a transient RSD close in its thermal.mjs clear, with no retry (incident I-249)"}`
- remeasure: false

Error: `REARM ERROR: thermal.mjs clear failed: thermal.mjs clear exit 1: RSD on <tunnel> closed the connection before it listed its services; nothing set`

Command: `node tools/iphone.mjs rearm --owner fix-g0-box --settle 120 (P-166 part A2 start, 11:15Z)`

Resolution: fixed

landed on main; npm test on main 2482/2482 at 13:52Z (f7520fb3). git rebase main between steps.

## I-250: iphone.mjs rearm hangs: its xctrace Thermal State read (--time-limit 10s) runs 8+ min, no timeout, P-166 part A2 stuck before H2

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-08T11:25:09.493Z by lead
- affected: [object Object]
- resolved: 2026-10-08T11:47:34.466Z by lead
- fix: `{"commit":"3bdcb63cefe9c543f06c2bf5fde4ef809ca34d10","short":"3bdcb63cef","subject":"tools: thermal read's xctrace had no effective timeout and rearm printed nothing while it hung (incident I-250)"}`
- remeasure: false

Error: `xctrace record --instrument Thermal State --time-limit 10s still running after 8 min; rearm log empty`

Command: `node tools/iphone.mjs rearm --owner fix-g0-box --settle 120`

Resolution: fixed

thermal reads bounded (record 70 s, group SIGKILL, one retry); rearm progress lines; exit 13 on a twice-hung read. npm test on main exit 0 (11:47Z). git rebase main between steps.

## I-251: Xcode's CoreDeviceService (Mac, up 7 days) kept a stale device-preparation error after a link loss: every WDA start timed out

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-08T11:54:54.733Z by lead
- affected: [object Object]
- resolved: 2026-10-08T13:53:09.108Z by lead
- fix: `{"commit":"6241f8888a3de6f3b523ac922792350b5abb417c","short":"6241f8888a","subject":"tools: WDA NOT READY did not name a stale CoreDeviceService preparation error and pointed to unlocking the phone (incident I-251)"}`
- remeasure: false

Error: `xcodebuild: Timed out waiting for all destinations ... may need to be unlocked to recover from previously reported preparation errors`

Command: `node tools/iphone.mjs wda ensure`

Resolution: fixed

landed on main; npm test on main 2482/2482 at 13:52Z (f7520fb3). git rebase main between steps.

## I-252: usblink watch --post-step posts a re-plug step while the user holds the iPhone lease (own use, phone off the cable on purpose)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-08T16:44:11.054Z by lead
- affected: [object Object]
- resolved: 2026-10-08T17:02:51.602Z by lead
- fix: `{"commit":"392c3dc2479a29139cf71fd372f2fcd81ed4de3d","short":"392c3dc247","subject":"tools: usblink watch --post-step posted a re-plug step while the user held the iPhone (incident I-252)"}`
- remeasure: false

Error: `POSTED C-127: Re-plug the iPhone's USB cable (unplugged) at 16:24:35Z; lease held by user since 16:23:02Z`

Command: `node tools/usblink.mjs watch --by lead --repair --post-step`

Resolution: fixed

landed on main; npm test on main 2486/2486; usblink watch restarted with the fix at 16:57Z

## I-253: sim.mjs session refused: fw-sim already Booted with no live session (leak) after fix-g0-box's session

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-08T19:03:44.196Z by fix-scrollcb-g0
- affected: [object Object]
- resolved: 2026-10-08T19:04:46.973Z by lead
- remeasure: false

Error: `refusing: fw-sim 15 Pro Max is already Booted (booted by someone else, or a leaked session)`

Command: `lock.mjs run chrome-measure --shared --weight simulator -- sim.mjs session --functional`

Resolution: duplicate

duplicate of I-211. Cause: fix-g0-box TaskStopped its runner mid-session (19:00Z), so sim.mjs session died before its cleanup. Fixed by sim.mjs doctor --fix at 19:03Z; fix-g0-box's runners now trap EXIT/INT/TERM and run the leak fix. Workaround for all: never stop a runner while its Simulator session is live; on a leak, message the lead

## I-254: eop phone kit: the block's first safari-restart fails with Not authorized for UI testing (phone locked or UI automation off) and stops the block; the unlock step runs only on a later preflight AUTH

- status: triaged
- class: tool
- blocking: true
- reported: 2026-10-08T19:07:37.230Z by fix-menu-layers
- affected: [object Object]

Error: `safari-restart: WDA POST wda/apps/launch: HTTP 400 XCTDaemonErrorDomain Code=41 Not authorized for performing UI testing actions`

Command: `sh fixes/menu-layers/phone/ml-run.sh P-170 (eop-block.sh wdarestart before preflight)`

## I-255: I-160 between-holds window never opens when the block kit runs the whole block as one 'lock.mjs run iphone' command: meta.run.pid (the block shell) stays alive, so the window counts as shut

- status: open
- class: tool
- blocking: false
- reported: 2026-10-08T19:55:09.778Z by lead
- affected: [object Object]

Error: `deferred: ... the between-holds window is shut (a phone run of "fix-menu-layers" is on)`

Command: `lock.mjs run iphone --block P-170 -- sh ml-block.sh ...; doing iphone --between 6 with the shell stopped`

## I-256: Phone block runner killed at Claude Code's default 30-min background limit (P-170b launcher, after H8)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-08T22:54:03.542Z by fix-menu-layers
- affected: [object Object]
- resolved: 2026-10-08T23:00:00.989Z by lead
- remeasure: false

Error: `background task stopped at its background time limit (no explicit timeout on the wrapper)`

Command: `sh out/menu-layers/p170b-go.sh via Bash run_in_background without timeout`

Resolution: duplicate

duplicate of I-240 (Claude Code background cap killed a block launcher without an explicit timeout)

## I-257: iphone.mjs record without --profile defaults to 'serious' and, on a Nominal phone, posts a manual Xcode Thermal State step to the user (C-133/134/135), against the user's standing rule of no manual Xc

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-09T03:30:59.646Z by lead
- affected: [object Object]
- resolved: 2026-10-09T04:13:21.845Z by lead
- fix: `{"commit":"f8747c0c4ed54a50c5c5a81b8cc33272966514ad","short":"f8747c0c4e","subject":"tools: the phone thermal gate posted manual Xcode user steps, and record without --profile was gated (incident I-257)"}`
- remeasure: false

Error: `C-133 Xcode: set the iPhone's Thermal State to Serious (test profile serious)`

Command: `iphone.mjs record --seconds 30 (sw-swipe.sh, copied from int-v11 v11-swipe.sh)`

Resolution: fixed

record without --profile has no thermal gate; the gate never posts an Xcode user step, it prints REARM/CLEAR for the agent. git rebase main between steps. No re-measure.

## I-258: npm test timing-sensitive tests fail under host load (load1 30-97): thermal-cli I-199 hold-seconds, usblink watch --repair, owner-ended I-163, console-cli I-059 B, iphone-rearm I-250

- status: open
- class: tool
- blocking: false
- reported: 2026-10-09T04:05:30.990Z by ts-257
- affected: [object Object]

Error: `I-250 rearm: two record attempts, no export (1 !== 2); I-199: SET ThermalCondition ThermalCritical (actual 0, expected 1)`

Command: `npm test (pre-commit hook), 2026-10-09 03:45Z and 03:54Z`

## I-259: xctrace thermal gate times out at 90 s, the hold goes VOID

- status: open
- class: tool
- blocking: false
- reported: 2026-10-09T05:31:46.929Z by fix-cm-return
- affected: [object Object]

Error: `GATE g0k-H4-start state null induced null batt 40->39.79 C -> FAIL xctrace export exit null`

Command: `node research/phone-thermal-gate/thermal-gate.mjs --owner fix-cm-return --label g0k-H4-start --expect serious --max-c 44 --accept-induced`

## I-260: iPhone Safari shows 'Can't Open Page' for the Mac's LAN twin URL (P-174 start); preflight OK, WDA READY, Mac-side curl of the same URL 200

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-09T09:47:24.717Z by fix-scrollcb-g0
- affected: [object Object]
- resolved: 2026-10-09T09:54:58.830Z by lead
- remeasure: false

Error: `safari-restart: Safari did not show http://lan-host:<port>/ within 90 s; tab title Can't Open Page (data:text/html)`

Command: `sh fixes/g0-0l/phone/g0l-run.sh P-174 ... (block part start: iphone.mjs safari-restart)`

Resolution: not-a-bug

Cause: the iPhone was off the Mac's Wi-Fi after the user's hand use (internet worked, LAN did not). Fixed by user step C-138 (rejoin the same Wi-Fi); probe safari-restart to the twin OK in 14.4 s at ~09:56Z. No tool change.

## I-261: gh CLI not logged in: WebKit source reads via gh api fail

- status: resolved
- class: env
- blocking: false
- reported: 2026-10-09T12:01:58.596Z by fix-reveal-paint
- affected: [object Object]
- resolved: 2026-10-09T13:24:23.134Z by lead
- remeasure: false

Error: `gh auth status: Failed to log in to github.com account (keyring). The token in keyring is invalid.`

Command: `gh api repos/WebKit/WebKit/branches/safari-7624.5.1.11-branch`

Resolution: answered

gh is logged in again (checked by the lead 13:2xZ); fix-reveal-paint read WebKit source through it

## I-262: iPhone: no Safari page target after the user's focus step (Sleep/DND); safari-restart via WDA also gets no page

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-09T12:59:33.454Z by cap-worst
- affected: [object Object]
- resolved: 2026-10-09T13:21:15.144Z by lead
- fix: `{"commit":"8dbace9d7178e8d02397e14e7b8e694a3afa7396","short":"8dbace9d71","subject":"tools: parked-tab check looks only at Safari's own views when its appId is known (incident I-262)"}`
- remeasure: false

Error: `BLOCKED: cannot reach Safari tab (no page target (phone locked / Safari backgrounded?...))`

Command: `iphone.mjs open / iphone.mjs safari-restart --owner cap-worst (inside lock.mjs run iphone)`

Resolution: fixed

parked-tab check looks only at Safari's views when its appId is known; verified by cap-worst: iphone.mjs open reached Safari's parked tab with the mail app's views listed

## I-263: ioscap record: when the recorder stops (its --seconds cap) the iPhone inspector link drops and a running iphone.mjs gesture aborts

- status: open
- class: tool
- blocking: false
- reported: 2026-10-09T14:32:17.839Z by cap-worst
- affected: [object Object]

Error: `gesture run aborted: error: BLOCKED: cannot reach Safari tab (fetch failed)`

Command: `ioscap.mjs record --seconds 240 beside iphone.mjs gesture fixes/g0-box/phone/g-fastshort-g0.json (wc-hold.sh H3/H3.1)`

Workaround: ioscap record --seconds longer than the driver run; retry iphone.mjs open a few times after a recorder stop

## I-264: Two unit tests time out at 5 s under host load (flaky)

- status: open
- class: tool
- blocking: false
- reported: 2026-10-10T07:44:03.329Z by lead
- affected: [object Object]

Error: `hung-git baseline check and I-120 psSnapshot timing test hit 5 s timeouts at load1 6-10; rerun passes 1342/1342`

Command: `npm run test:unit`

## I-265: Agents page misses agent-team teammates that hold no lock, wait or fresh status row

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-12T10:15:34.293Z by lead
- affected: [object Object]
- resolved: 2026-10-12T10:42:48.635Z by lead
- fix: `{"commit":"6cd004792b9e90487e92fe096876f8af16545da3","short":"6cd004792b","subject":"tools: Agents page missed live agents with no lock, wait or fresh row (incident I-265)"}`
- remeasure: false

Error: `status.mjs agents: RUNNING NOW (1) while 7 T-275 teammates were alive`

Command: `node tools/status.mjs agents`

Resolution: fixed

Agents page reads live Claude Code team agents from transcripts; npm test on main 2525/2525 (SDKROOT workaround for I-266); display only, no re-measure

## I-266: cc cannot link since the Command Line Tools update today (MacOSX.sdk -> 27.0 with Xcode's older ld): usblink bind-localhost shim tests fail, every tooling commit's npm test is blocked

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-12T10:30:53.300Z by ts-I-265
- affected: [object Object]
- resolved: 2026-10-13T05:09:48.005Z by lead
- remeasure: false

Error: `ld: tapi error: malformed file ... libSystem.B.tbd:4:20: error: unknown architecture arm64e.x1-macos`

Command: `cc t.c -o t.out (and npm test: 7 failures in tests/e2e/usblink-cli.test.mjs, PROXY START REFUSED: cannot build the bind-localhost shim with cc)`

Resolution: answered

xcode-select now points to Xcode.app and its licence is accepted (C-158); plain cc links again, the SDKROOT workaround is no longer needed

## I-267: Enforcement-layer ask rules cover only .claude/hooks; .githooks/ and .claude/settings.json edits are not asked (CLAUDE.md says all three ask)

- status: open
- class: tool
- blocking: false
- reported: 2026-10-12T11:15:23.262Z by lead
- affected: [object Object]

Error: `settings.json ask rules: Edit(/.claude/hooks/**) only; no rule for .githooks/** or .claude/settings.json; Bash-side edits uncaught`

Command: `read .claude/settings.json permissions.ask`

## I-268: release: baseline tools accept a verified untracked snapshot, plus npm run init for release files

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-13T04:13:47.341Z by lead
- affected: [object Object]
- resolved: 2026-10-13T06:53:14.326Z by lead
- fix: `{"commit":"04b1e3f0dc4007153018b291e0741a8196cf60c5","short":"04b1e3f0dc","subject":"tools: baseline check refused an untracked but byte-exact snapshot; add npm run init (incident I-268)"}`
- remeasure: false

Error: `new release tooling (T-170, user rule change 2026-10-13)`

Command: `n/a`

Resolution: fixed

landed; baseline behaviour with the tracked snapshot unchanged (review-release-tooling ACCEPT); follow-ups (git config isolation, .git paths, tar -tvf) come as a second commit

## I-269: release: history rewrite, scrub rules, fail-closed checker, SHA remap, evidence branches

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-13T04:13:53.029Z by lead
- affected: [object Object]
- resolved: 2026-10-13T07:34:05.390Z by lead
- fix: `{"commit":"2095a0e13b78e1c39d5cbbac77b3574fd0f0dd00","short":"2095a0e13b","subject":"tools: release secret-kv rule matched inside words and cited commit SHAs (incident I-269 review follow-up)"}`
- remeasure: false

Error: `no release rewrite tool: history holds home paths and LAN addresses`

Command: `n/a (new tooling, T-170)`

Resolution: fixed

Landed 8839b1f7, af38fe58, 2095a0e1 (review ACCEPT; hook npm test 2553/2553 on the same tools tree).

## I-270: release: console export, picture encoder, OCR review sheet, out/ packer, release-assets.json, build command

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-13T04:13:53.124Z by lead
- affected: [object Object]
- resolved: 2026-10-13T10:08:56.695Z by lead
- fix: `{"commit":"0b5dcd908cd10391c17a8bc4c35c15acd5c43276","short":"0b5dcd908c","subject":"tools: release build did not report cited out/ paths that are gone, nor check tar headers for xattrs (incident I-270 follow-up)"}`
- remeasure: false

Error: `no export script for the console record and release files`

Command: `n/a (new tooling, T-170)`

Resolution: fixed

Follow-ups landed: 028a0fd7 (AVIF/GIF/UTF-16 ICC/._) and 0b5dcd90 (cited-missing report, tar header scan, meta allow-list). Review ACCEPT; trial 4 BUILD OK.

## I-271: cc refuses to run: Xcode license not agreed (xcode-select = Xcode.app); usblink shim tests fail, tooling commits blocked

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-13T04:33:31.054Z by ts-i268-release-init
- affected: [object Object]
- resolved: 2026-10-13T05:09:47.939Z by lead
- remeasure: false

Error: `You have not agreed to the Xcode license agreements. Please run 'sudo xcodebuild -license'`

Command: `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cc t.c -o t.out (exit 69); npm test: 7 failures in tests/e2e/usblink-cli.test.mjs`

Resolution: answered

the user accepted the Xcode licence (console step C-158, 2026-10-13 05:09Z); plain cc builds and runs again, no DEVELOPER_DIR/SDKROOT needed

## I-272: EnterWorktree in an agent-team teammate switches the whole session; earlier worktrees become unwritable

- status: open
- class: env
- blocking: false
- reported: 2026-10-13T04:37:27.556Z by lead
- affected: [object Object]

Error: `This session is isolated in the worktree .claude/worktrees/wf_9ff9eab1-e14-3. Edit the worktree copy of this file instead of the shared-checkout path.`

Command: `teammate EnterWorktree path=.claude/worktrees/wf_9ff9eab1-e14-N (3 teammates)`

## I-273: release: chat export from the lead's Claude Code transcripts (user messages and lead answers only, scrubbed)

- status: resolved
- class: tool
- blocking: false
- reported: 2026-10-13T04:46:26.783Z by lead
- affected: [object Object]
- resolved: 2026-10-13T07:30:56.513Z by lead
- remeasure: false

Error: `no chat export for the release (user choice 3a, T-170 #436)`

Command: `n/a (new tooling, T-170)`

Resolution: answered

User dropped the chat export from the public release (T-170 #454): handling the chat's confidential parts is too complex. Tool not landed; the branch stays as evidence.

## I-274: idle teammates are not woken by their own background-task notifications: the notice is queued in the transcript, the teammate sleeps until a message

- status: resolved
- class: env
- blocking: true
- reported: 2026-10-13T07:09:27.968Z by lead
- affected: [object Object]
- resolved: 2026-10-13T07:35:51.674Z by lead
- fix: `{"commit":"b032b8ccfce109edff97b635e4d48cfe23e7ff16","short":"b032b8ccfc","subject":"tools: idle teammates were not woken by their own background-task notifications, and nothing flagged it (incident I-274)"}`
- remeasure: false

Error: `queued_command <task-notification> after the teammate's last assistant record; next turn only on SendMessage (ts-i269 05:15->06:47, ts-i270 05:01->06:27, ts-i273 05:22->06:46, ts-i268 04:44->06:27)`

Command: `teammate: Bash run_in_background (npm test, lock.mjs run, wait.mjs), then end its turn`

Resolution: fixed

stalledAgents(): WAKE stall lines in the lead's --monitor listener, NOTIFY lines in idle watch, red alert on /status. Re-arm the listener and restart idle watch to load it.

## I-275: disk auto-clean (I-124 space-prune) deleted deployed and article images in out/: cf-review demos, pages-export/pages-repo, article, people-blink

- status: resolved
- class: tool
- blocking: true
- reported: 2026-10-13T09:06:57.069Z by lead
- affected: [object Object]
- resolved: 2026-10-13T09:25:14.820Z by lead
- fix: `{"commit":"a840ca8c269876627d96311d86a3812298076e95","short":"a840ca8c26","subject":"tools: disk auto-clean deleted deployed demo and article images, no way to restore them (incident I-275)"}`
- remeasure: false

Error: `frames-pruned.json at 2026-10-12T09:37Z: 372 images in out/cf-review/*/public, 468 each in pages-export and pages-repo, 169 in out/article`

Command: `node tools/idle.mjs watch --by lead (auto-clean via lib/space-prune.mjs)`

Resolution: fixed

Prune now fails closed (frame-folder allow-list, deploy/article/archive trees never touched); space.mjs restore put back 1060 images; 89 article/art pictures had no copy anywhere. Auto-prune may go back on.

## I-276: flaky e2e test sim.test.mjs I-050 (Safari restored tab): fake proxy did not list the Simulator within 20 s while two npm test runs shared the lane

- status: open
- class: tool
- blocking: false
- reported: 2026-10-13T09:29:49.346Z by ts-i270-release-export
- affected: [object Object]

Error: `AssertionError: two Safari pages and no open: never picks one (I-037); actual: the proxy did not list the Simulator on :24282 within 20 s`

Command: `npm test (pre-commit hook, beside ts-i275-prune-scope's npm test in the shared lane)`

Full records: [incidents.json](incidents.json)
