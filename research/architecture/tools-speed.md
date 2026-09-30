# Tools and tests: where the time goes, and what to speed up (arch-tools, 2026-10-01)

Author: `arch-tools` (architecture team, read-only). User request: "investigate tools and test. can we
improve them more faster and run test more faster." Scope: time the team or the single `chrome-measure`
slot spends on tooling instead of measuring the page. No Chrome, no locks, no edits to `tools/`/`tests/`.

Evidence (all local, read-only): the code at `0974023`; per-test durations from the most recent full
`npm test` log in the shared scratchpad (`ts-i002/npmtest.log`, 235 tests, 43.3 s wall, 143 s summed test
time); file timestamps of all 13 complete `out/ab/*/*/` runs in worktrees (stamp = `ab` start, PNG and
`verify.json` mtimes); the lock-holder history printed by a queued `fix.mjs ab`
(`out/countdown-final-slot.log`, `out/countdown-probe-slot.log` in the countdown worktree, 22:46-23:32Z);
incident I-022's output. The timing script is in `<scratchpad>/arch-tools/abtimes.mjs`. No test was run.

## 1. Findings

### 1.1 A 5-run A/B holds the lock for 4.4-5.4 min, not 25-40 min

The 25-40 min is **queue wait**. From `out/ab` timestamps (8 A/Bs, `--runs 5`, all ABBA):

| | idle 0 (7 A/Bs, 21:11-22:58Z) | idle 6 (layout-animations 23:08Z) |
|---|---|---|
| lock hold, `--runs 5` | 265-267 s | 322 s |
| per measurement after run 0 | 22.8-22.9 s | 29.1 s (+6.3 s = the idle phase) |
| `ab` start to first screenshot, free lock | 35-37 s | 45 s |
| `ab` start to first screenshot, queued | 142-2702 s (up to 45 min) | |

A measurement (one target, one run, idle 6), from `tools/verify.mjs` and the timestamps:

| step | s | where |
|---|---|---|
| new isolated context, navigate, load at `--latency 150`, 4 touch morph gestures | ~7.7 | residual (not separately stamped) |
| settle: 2 s without network requests, then `sleep(1500)` | 3.5 | verify.mjs:125-126, cdp.mjs:145-153 |
| throttle to 6x, `sleep(1000)` | 1.0 | :136-137 |
| **idle phase** | 6.0 | :142 |
| **scroll phase** (median, 6x) | 8.4 | :146 |
| `sleep(500)`, morph tail `sleep(2000)` | 2.5 | :147, :157 |

So fixed settle sleeps are 7 s of 29 s (24 %). Run 0 adds a screenshot pass per target: about 12 s to
reload and settle and 7 s to walk top, middle and bottom with a 2.5 s sleep per shot (:163-176). That is
~38 s per A/B (12 %). Chrome launch (once per A/B, <2 s) and teardown (0.3 s, cdp.mjs:64) don't matter.

Already done, don't redo: one Chrome per `verify` with a fresh isolated browser context per measurement
(cdp.mjs:118-119), screenshots only in run 0 (verify.mjs:163), servers started outside the lock
(fix.mjs:354-355, before verify.mjs:218 acquires).

### 1.2 In the slot, A/Bs got 37 % of a busy 46 min

Holders of `chrome-measure` 22:46-23:32Z, from the queued countdown A/B's log:

| holder | kind | held | what |
|---|---|---|---|
| fix-nav-morph, pain, commission | process | 2.5 + 4.5 + 4.5 min | A/Bs |
| layout-animations | lease, **40 min TTL** | 9.8 min | granted 23:04:08; its `ab` started 23:08:20: **4.2 min idle**; A/B 5.4 min |
| test-chrome-shim-32728 | process | **10.4 min** | I-022: `test:chrome` holding an idle Chrome after its tests timed out |
| ts-i008, ts-i013, lead-test, ts-i017, ts-bench, ts-i012 | leases/short | 1.4-5.0 min each, ~12 min | `npm test`, bench checks |

Hand-over gaps between back-to-back A/Bs: 8, 12 and 15 s (21:21, 21:56, 22:16Z). That matches the
poll backoff (lock.mjs:257, 287-288: 2 s x1.5 up to 15 s + 0.5 s jitter).

### 1.3 `npm test`: the critical path is sleeping, while the slot is held

Per file (summed test time; tests inside a file run one after another, files 7 at a time):

| file | s | tests | why |
|---|---|---|---|
| e2e/verify-fake | 39.9 | 7 | each fake run pays verify.mjs's 7 s of fixed sleeps + `--idle` (default 6 s): 12.9 s, 7.6 s (`--idle 0`), queue test 14.9 s (1.5 s sleep + lock poll backoff + a 13 s run) |
| e2e/ab-fake | 35.0 | 2 | one test is 34.4 s: two `ab --runs 1` runs (4 fake measurements) serialised through the lock, plus poll backoff |
| hooks/git-hooks | 19.6 | 13 | each test builds a repo with ~6 hooked git commands (`makeRepo`, :17-43), 1-3 s each, serial |
| e2e/lock-cli | 10.2 | 7 | real backoff: `--wait` test 6.2 s (CLI first pause 5 s, lock.mjs:110), run-timeout 2.3 s |
| e2e/fix, githooks, workflow | 7.3, 5.0, 5.0 | | temp repos (copy of tools/, git init, worktree add), a real worktree of this repo |
| everything else | ~21 | ~200 | fast |

The two fake-Chrome files are 75 of 143 s summed and set the 43 s wall. That time is `setTimeout`, not CPU
(the suite is ~35 s of CPU). In the short lane, though, it is 43 s of an **exclusive** Chrome slot. The fake
Chrome answers at once (tests/fixtures/fake-chrome.mjs:61-76), so nothing forces the real-time sleeps.
Postmortem item (b) caps concurrency at 3, which it projects at 60-70 s. Most of that projection is these
sleeps.

**Update from ts-i021** (measured 2026-09-30 23:37Z, main 0392757 plus its scope tests, load ~3.7, default
concurrency, per part with `/usr/bin/time`):

| part | wall | CPU (user + sys) | slowest files, summed |
|---|---|---|---|
| unit | 2.9 s | 6.5 s | lock-repair 2.7, lock 1.6, cdp 1.5 |
| hooks | 16.9 s | 14.7 s | git-hooks 16.8 (it sets the wall) |
| e2e | 72.4 s | 34.1 s | **verify-fake 66.9 (serial: the e2e wall)**, ab-fake 36.2, lock-cli 22.6, iphone 15.9 |

- The full suite didn't finish inside its 120 s short lease. ts-i021 estimates ~70 s wall and ~55 s CPU.
- On this newer main, verify-fake alone is 67 s. So the ~35 s CPU in CLAUDE.md and "the full suite
  fits `--max-seconds 120`" are both stale.
- #3 below is therefore worth more than I first estimated: wall ~70 s → ~20 s.
- `test:unit` (ts-i021's scoped unit-only run, I-021) takes ~3 s and needs none of this.

### 1.4 `npm run test:chrome` queues four times

`vendor-shim.chrome` acquires in `before()` with no bound (:18) and releases in `after()` (:22).
`verify.chrome` has 2 tests, each a `verify.mjs` that queues. `fix-ab.chrome` has 1 `ab`, which queues. So
one `test:chrome` goes to the back of the normal queue up to 4 times. The 600 s test timeouts count the
wait (package.json, fix-ab.chrome:21). I-022's run took 49.5 min wall, failed 4 tests and held the lock
10.4 min with an idle Chrome. The tests themselves need about 2-3 min: ab `--runs 1` with screenshots is
~100 s, verify ~30 s, SIGTERM ~10 s, shim ~15 s.

## 2. Ranked changes (all built by a `toolsmith`, test-first, Hard rule 6)

"Day" means a 10 h busy day like 2026-09-30 evening: ~14 grants/h, ~3 A/Bs/h, ~50 `npm test` suites a day.

| # | change | evidence | saving per day | risk | measurement code? |
|---|---|---|---|---|---|
| 1 | **No idle leases on `chrome-measure`.** Measuring agents use one process hold: `lock.mjs run chrome-measure -- sh -c 'fix.mjs ab … && node probe'` (CLAUDE.md already allows this, I-005). A normal lease on chrome-measure gets a default TTL (e.g. 600 s; today there is none, lock.mjs CLI:106) and a cap. Optional: release a lease automatically if no re-entrant verify starts within 90 s of the grant. Update the CLAUDE.md "lease slot" advice. | layout-animations: 40-min lease, 4.2 min idle before its A/B (1.2). Every lease pays the time between LLM turns. | 20-60 min of slot (10-20 leases, 1-4 min idle each) | low; agents must switch habit; the TTL must exceed the longest ab + probe | no (lock.mjs CLI, docs) |
| 2 | **`test:chrome` in one short-lane hold:** `lock.mjs run chrome-measure --short --max-seconds 300 --owner test-chrome-<pid> -- node --test …`. The inner verify/ab/shim acquires then re-enter through `FW_LOCK_HELD` (the shim's `acquire()` already defaults to it; **but `tests/helpers.mjs`
`cleanEnv()` strips `FW_LOCK_HELD` from spawned tools**, so the chrome tests must pass it through
explicitly, or the nested verify deadlocks behind the wrapper), and test timeouts no longer include the wait. For ts-i002 (I-022). It is a mechanism check, not a timing measurement, so the short lane fits; confirm it runs in under 300 s. | 1.4; I-022: 49.5 min wall, 10.4 min idle hold, 4 queue entries | ~10 min of slot and ~45 min of a toolsmith's wall per run (1-2 runs/day) | low; if it takes over 300 s, trim the ab test to `--idle 0` or split into two short jobs | no (package.json, tests) |
| 3 | **Remove the sleeps from the fake-Chrome tests.** A test-only `FW_TIME_SCALE` (e.g. 0.02) multiplies verify.mjs's `sleep()`s, `gotoAndSettle`'s `quietMs` and `--idle` (verify.mjs:125-171, cdp.mjs:152). `verify.json` records `timeScale`, and `fix.mjs ab` refuses or stains a run when it isn't 1. Tests assert ratios ("idle window ≈ idle x scale"), and one test keeps the default 6 s. Also `FW_LOCK_POLL_MS` for the lock tests (queue test, `--wait` test). | 1.3: verify-fake 39.9 s + ab-fake 35.0 s are sleeps; they set the 43 s wall (ts-i021 on newer main: verify-fake 66.9 s, suite ~70 s) | wall 43-70 → ~20 s (git-hooks becomes the critical path); 23-50 s less short-lane hold per suite, ~20-40 min of slot + agent wall a day | low-medium: the default path must stay identical (scale 1 = today's constants). Reviewer and `test:chrome` required; no A/A needed if the diff only wraps constants | **yes**, touches verify.mjs + cdp.mjs (default timing unchanged; say so in the commit) |
| 4 | **Faster hand-over.** The waiter that is `next` polls every ~0.5-1 s, or wakes on `fs.watch(lockDir)`. The others keep the backoff. At the hand-over, skip a head waiter whose `lastSeen` is older than ~30 s (a CLI `acquire` without `--wait` that retries every 2-5 min can today keep a free lock unused for up to its 10-min queue TTL, lock.mjs:196 + CLI:118) and serve the next live waiter. It keeps its place for the next hand-over. | gaps 8/12/15 s (1.2); code lock.mjs:257-288, CLI:110-113 (5 s → 30 s) | ~7 s x ~140 grants ≈ 15 min; the skip bounds a rare 5-10 min stall | low. **Interacts with I-020 (ts-prio):** A/Bs that yield to short jobs at run boundaries add hand-overs, so a fast hand-over matters more. Build after I-020 lands, in the grant policy (arch-refactor R3 splits it out) | no |
| 5 | **Cheaper screenshot pass, inside the lock.** (a) Cache the baseline's top/middle/bottom PNGs per baseline manifest hash + viewport + serve args + tools version, and shoot only the patched side. (b) Measure whether the 2.5 s per-shot sleep can be 1 s (compare diffs on the A/A). Don't move screenshots after the release: an unthrottled Chrome loading pages would load the next holder's run. | 1.1: ~38 s per A/B, ~19 s per side | ~19 s (a) + ~9 s (b) per A/B ≈ 10-15 min | medium: countdown digits differ across days (the 0-0.4 % noise band may widen); A/A the diff numbers | **yes** (verify.mjs run-0 order: run0-B no longer follows A's screenshot load) → A/A |
| 6 | **Cheaper test fixtures.** git-hooks: build the diverged base repo once per file and `cpSync` it per test (today ~6 hooked git spawns per test). fix/lock-cli: one `makeTempRepo` per file where tests don't mutate shared state. `{ concurrency: true }` only on the heaviest file, only if the cap in postmortem (b) still holds peak processes. | 1.3: git-hooks 19.6 s, fix 7.3 s, lock-cli 10.2 s | wall ~20 → ~12 s after #3; ~5 min/day | low; test isolation must stay (each test still gets its own copy) | no |
| 7 | **Keep `--test-concurrency=3` (postmortem b), after #3/#6.** With the sleeps gone it costs little wall (~25-30 s instead of the projected 60-70 s) and halves peak processes. | postmortem §3(b) | avoids +25-40 s per suite that (b) alone would add | low | no |
| 8 | Settle sleeps in `measure()` (1.5 s + 1 s + 0.5 s; keep the 2 s quiet and the 2 s morph tail). Only bundle this with the next planned tools-version break (like I-002), never alone: it changes what the idle and scroll phases start from. | 1.1: 7 s of 29 s per measurement | up to 30 s per A/B ≈ 10 min | high for comparability | **yes** → A/A + version break |
| 9 | Adaptive run count: stop at 3 runs when the ranges are already disjoint by a margin, else go on to 5. This is a statistical-protocol question for `arch-bench` and the lead (sequential testing inflates false positives unless the margin is set from an A/A). | 1.1: runs 4-5 are ~40 % of a slot | ~2 min per decisive A/B | high (validity) | **yes** (fix.mjs ab) |

Not ranked (quietness, not speed): `fix.mjs ab` starts both serve.mjs processes before queueing
(fix.mjs:354-355). They idle for the whole wait (2 x 40-95 MB per waiting A/B, postmortem 2.7). Starting
them after the grant (ab acquires, verify re-enters) costs ~1-2 s of slot. Decide together with (f) of the
postmortem.

## 3. Order of work

#2 is already with ts-i002 (I-022): pass the one-hold idea on. #1 is docs plus a small CLI default: do it
now. #3, #6 and #7 go together as one toolsmith incident: tests plus a wrap of verify's timing constants,
reviewed as measurement code. #4 comes after ts-prio's I-020 lands, in the grant policy that arch-refactor's
R3 splits out. Do #5 and #8 only with a quiet-host A/A (the I-017 slot). #9 goes to arch-bench.

The saving is mostly slot time: roughly 1-2 h of `chrome-measure` a day across #1-#6, against ~3 A/Bs of
~5.4 min per hour. Agents also stop waiting on sleeping tests. None of #1-#4, #6 or #7 changes a
measured number.
