# Postmortem: host overload during measurements, 2026-09-30 (incidents I-016, I-017)

Author: `arch-ops` (architecture team, read-only). Blameless: every action below was a reasonable
answer to the problem in front of the person or agent at the time. The gaps are in the system, which
let each local decision add load with nobody seeing the total.

Evidence used (all local, read-only): the lead's facts; `node tools/incident.mjs show I-011 I-015 I-016 I-017`;
`node tools/lock.mjs status` (22:45Z); the 5-s host sampler that `measure-parallel` ran from 21:53Z to 22:43Z
(`<scratchpad>/measure-parallel/loadmon.jsonl`, 567 samples: load, CPU per process family, memory, lock
holder; its tool is `research/measurement-parallelism/tools/loadmon.mjs` on that agent's branch); that
experiment's `analysis.json`; `host.loadavg1Min/Max` in every `fixes/*/results.json` across all
worktrees; `npm test` logs of ts-i002/3/5; the code in `tools/lib/lock.mjs`, `tools/verify.mjs`,
`tools/fix.mjs`, `.githooks/pre-commit`, `package.json`. Host: Apple M1 Pro, 8 cores (6 P + 2 E),
16 GB, macOS 26 (Darwin 25.2).

## 1. Timeline and impact

Times UTC, 2026-09-30. "load" = `load1`. "CPU" from the sampler = long-lived processes only (see 2.6).

| time | what happened | load | evidence |
|---|---|---|---|
| 21:21-21:56 | A/Bs for pain-offscreen-notes, commission, countdown, large-area-blur | max 11.7-19.5 per A/B | results.json |
| 21:53 | sampler starts: one measurement running, the quiet reference point | 5.2 | loadmon |
| 21:55-22:30 | queue of 9-13 waiters; A/Bs for nav-hit-test, phone-invisible-shrink, layout-animations, commission, scroll-engine, hero-exit. Load stays 10-22, **also in minutes with no measured Chrome at all** (22:01-22:02, 22:08-22:10: load 10-14) | 8-24 | loadmon, results.json |
| 22:01, 22:03 | fix-nav-morph and fix-pain-offscreen-notes join the chrome-measure queue | | lock status |
| ~22:20 | I-011: short lane starved; lead lets toolsmiths run `nice -n 20 npm test` outside the lock | | lead facts, I-011 |
| 22:25-22:36 | 8-26 concurrent `node --test` processes (3-4 suites); page-ins up to 4,600/s | 15-36 | loadmon |
| 22:31:40 | measure-parallel takes a **45-min lease** (until 23:16:40) for the A/A parallelism experiment | 35 | lockpoll.txt |
| 22:31:57 | condition c1 (1 Chrome) starts, **at load 24** | 24-36 | analysis.json |
| 22:32 | I-015 (a serve.mjs state-file race) appears in ts-i005's niced `npm test` at load 27 | 27 | I-015 |
| 22:35:00 | c2 (2 Chromes + 4 servers) starts while 26 test processes run; memory pressure goes to "warn" | 48 | loadmon |
| **22:36** | **peak: load 58.8 / 29.9 / 19.8** (sampler max 61.0) | 61 | lead, loadmon |
| 22:37, 22:40 | lead's own niced `npm test` in the main checkout | 45-47 | lead facts |
| 22:38:26 | c3 (3 Chromes, ~300 % CPU in 39 Chrome processes) starts | 45-51 | analysis.json |
| 22:40-22:41 | host CPU (kernel ticks) 96-98 % busy; long-lived processes explain only 61-66 %: ~30 % of the machine went to short-lived processes | 47-56 | loadmon `hostCpuPct` vs `cpuPct` |
| 22:41 | niced-test exception revoked; measure-parallel told to stop; c3 ends 22:41:41 | | lead facts |
| 22:41:49 | I-016 opened | 55 | incident |
| 22:42:14 | large-area-blur's next A/B is granted, **at load ~49 and falling** | 49 | lock status, loadmon |
| 22:43:58 | I-017 opened (measure-parallel: load vs jank retrospective) | 27 | incident |
| 22:45 | still load ~30 with host CPU 65-74 % busy (33 % sys) and only one A/B running | 30 | lead, my 3-s tick sample |

Impact:

- **Invalid:** all of measure-parallel's A/A conditions (c1 started at load 24, c2/c3 at 26-61, so they
  say nothing about parallel measurement on a quiet host); the large-area-blur A/B granted at 22:42:14.
- **Not comparable to the A/A floor (I-017), i.e. every A/B of the evening.** None of the 9
  `results.json` on disk stayed under the team's load < 6 rule:

  | A/B (createdAt) | load1 min-max | | A/B (createdAt) | load1 min-max |
  |---|---|---|---|---|
  | pain-offscreen-notes 21:21 | 5.1-12.9 | | phone-invisible-shrink 22:07 | 8.0-20.2 |
  | commission-forced-layout 21:26 | 6.1-11.7 | | layout-animations 22:16 | 9.5-17.7 |
  | countdown-idle-raf 21:43 | 9.6-19.5 | | scroll-engine 22:25 (3 runs) | 6.7-11.7 |
  | large-area-blur 21:56 | 4.2-12.4 | | hero-exit-scroll-timeline 22:29 (3 runs) | 9.1-19.1 |
  | nav-hit-test 22:01 | 11.3-17.5 | | | |

  I-017 on the unchanged baseline: frames > 20 ms median 66 at load1 < 6 (n = 11 runs) vs 96-103 at load1
  6-15 (n = 32); fps 74 vs 67-69. It is a step, not a slope. Inside one ABBA session the load effect is
  weak (r = 0.13), so paired deltas mostly survive; absolute numbers and comparisons with the A/A floor don't.
- **Waiting:** fix-nav-morph queued from 22:01 and fix-pain-offscreen-notes from 22:03, both still queued
  at 22:45 (44 and 42 min); commission-forced-layout from 22:23 (22+ min); nav-cache from 22:37. The
  experiment's hold (22:31:40 to ~22:42) added ~10 min to every waiter; its lease would have added 45.
- **Flakes:** I-015 (and I-008 earlier) showed up only in loaded `npm test` runs: timing-dependent tests
  turn into incidents under load, and each incident costs a toolsmith and more test runs.
- **Memory:** vm_stat free pages fell to 0.05-0.5 GB, ~12 GB sat in the compressor, pressure level 2
  ("warn") from 22:35 to 22:41, decompressions rose from 238/s (c1) to 3,919/s (c3), page-ins 2-4.6 k/s,
  no swap. The lead's "40-51 % free" comes from `memory_pressure`, which counts reclaimable pages as free
  (my inference); both readings are true, and vm_stat's shows the pressure that costs CPU.

## 2. Root causes, ranked

Each was checked against code or data; what I could not verify is marked.

1. **No admission control and no run validity check on host state.** "Load < ~6" existed only in prose
   (`fixes/FINDINGS.md`). `tools/lib/lock.mjs` `tryAcquire` grants on holder/queue state only;
   `verify.mjs` reads `os.loadavg()[0]` once per run before the page opens (`loadavg1.before/after`);
   `fix.mjs` summarises only `before` into `host.loadavg1Min/Max`, prints it, and never uses it in a
   verdict. So an A/B at load 20 got the same verdict as one at load 4, and this went on all evening,
   not only at the peak. *Primary, systemic.*
2. **A lock-bypass exception with no budget, expiry or visibility.** The niced-test exception (a sensible
   workaround for I-011's starvation) moved 3-4 full suites out of the only mechanism that serialises CPU
   work against measurements. `nice` doesn't help here: it changes priority, not the memory, the kernel
   time (fork/exec, compression) or the run queue, and on Apple silicon niced threads still use P cores
   (only background QoS, e.g. `taskpolicy -b`, confines work to E cores [S7]). Nobody could see the
   exception in `lock.mjs status`. *The trigger of the peak.* Evidence: 22-26 test processes at 22:30-22:36,
   and 30 % of host CPU that per-process sampling couldn't attribute to anything long-lived.
3. **An experiment that is heavy by design, run in a busy session without a quiet precondition.** 3 Chromes
   plus 6 serve.mjs processes, a 45-min lease while 5-6 owners queued, a start at load 24, and no abort rule.
   `par.mjs` gave each child `verify` a private `FW_STATE_DIR`, which is correct under an outer lease (I-005),
   but it also meant nothing shared could see that 3 Chromes ran. Lighthouse's guidance: don't run
   concurrent measurements on one machine; DevTools-style CPU throttling (our `setCPUThrottlingRate`)
   gives no protection against contention [S4]. *Amplifier; the main queue impact.*
4. **Unbounded fan-out per test suite.** `package.json` `test` runs `node --test` with the default
   concurrency. In Node 24 the CLI runs each file in its own child process, `os.availableParallelism() - 1`
   = 7 at a time [S1]. Many files start more processes (`serve.test`, `fix.test` and `workflow.test`
   start serve.mjs repeatedly, plus fake Chrome, git temp repos and lock clients), so 4 suites meant 26-34 node processes. The CPU total is the
   same either way; the peak, memory and the flake rate are not. *Amplifier.*
5. **Many independent actors, no global CPU budget, and a background floor above the rule.** 13 Claude
   agents with their shell commands, 19 serve.mjs, 20 queued lock clients, and the user's desktop
   (WindowServer 45 %, an editor 22 %, Activity Monitor 8 %, a second browser) kept load at 10-14 **with no
   measured Chrome running**. The lock covers one resource (a Chrome measurement), while the contended
   resource is the whole host. *Contributing, chronic.*
6. **Weak, slow and misleading signals.** (a) macOS load1 is an exponential average of the number of
   **runnable threads**, sampled every 5 s with decay e^(-1/12) per sample [S5, S6]: it lags about a minute,
   counts threads rather than busy cores, and includes kernel work done on a thread's behalf (page-fault
   decompression). Observed: load 40 at 45 % CPU (I-017), load 30 at 65-74 % CPU (22:45). (b) The team's
   sampler used per-pid `ps` deltas and missed ~30 % of CPU spent in processes that lived < 5 s.
   (c) `lock.mjs status` shows nothing about the host. The overload was noticed by hand (`uptime`).
   *Detection.*
7. **Orphaned or idle processes.** 19 serve.mjs (40-95 MB RSS each, about 1 GB total, ~0 % CPU), 20 lock
   waiters (~50 MB each, polling every 2-15 s: negligible CPU). Minor, but it adds up under memory pressure.
   I could not find a source file named `tools/lock-waiter`; I assume these were `lock.mjs run/acquire
   --wait` and `verify` waiters (unverified). *Minor.*

## 3. Fixes

Priorities: P0 = before the next measurement that counts; P1 = this wave; P2 = next wave; P3 = maybe.

### (a) Host-quiet admission gate in the lock: toolsmith, P0 (with I-017)

- New `tools/lib/host.mjs`: `sample()` returns `{load1, busyPct, sysPct, windowSec}`. `busyPct` comes from
  `os.cpus()` tick deltas between two calls. On macOS that is `host_processor_info(PROCESSOR_CPU_LOAD_INFO)`,
  the Mach per-CPU tick counters [S3], so no native code is needed and short-lived processes are
  counted. It also returns `pressure` from `sysctl -n kern.memorystatus_vm_pressure_level`
  (1 normal, 2 warn, 4 critical). Thresholds live in one exported object, overridable by env
  (`FW_GATE_MAX_LOAD1`, `FW_GATE_MAX_BUSY`), and are copied into `results.json` `config`.
- **Rule.** Host is *quiet* when, over a window of at least 10 s: `busyPct <= 20` (about 1.6 of 8 cores
  before Chrome starts), `load1 <= 6`, and `pressure == 1`. Why these numbers: load1 6 is where I-017
  measured the step (66 vs 96-103 jank frames). The CPU figure is provisional: at the quiet reference
  point (21:53, load 5.2) processes other than the measured Chrome used about 16-18 % of the host
  (sampler, long-lived processes only), and measure-parallel proposes 25 % for the same thing during a run.
  **Calibrate it** from the first quiet A/A, which records both numbers. CPU is the primary, fast signal.
  load1 stays as a guard because I-017's evidence is in load1 units and it catches runnable-thread storms.
  2026-10-01: raised to 25 % (user decision; gate waits; calibration pending).
- **Where.** `acquire()` already polls; it keeps the previous tick sample in memory and passes
  `host` into `tryAcquire`. The gate is applied only when granting a **normal** waiter of a resource
  that has a gate (chrome-measure; not iphone). If the host isn't quiet, the head normal waiter
  **keeps its head place** (passing to the next normal waiter would meet the same host), refreshes its entry,
  and the queue entry gets `gate: {since, load1, busyPct, pressure}` for `status`. Tests inject `host`, so
  the gate is deterministic in `tests/unit/lock.test.mjs`.
- **Short lane.** Short jobs are exempt from the gate and may be granted while the head normal waiter
  waits for quiet (they would run next anyway; running them now empties the lane sooner). The existing
  `SHORT_DRAIN_SEC` still bounds a short run. After it, the tick window restarts at the hand-over, so the
  normal waiter needs 10 s of quiet host after the last short job, not a decayed load1.
- **No starvation.** `GATE_MAX_WAIT_SEC = 600` (env override). After that, the head waiter is granted
  anyway, and the holder records `meta.gate = {quiet: false, waitedSec, load1, busyPct}`. `verify.mjs`
  copies that into its output, and `fix.mjs ab` marks the result contaminated (d). Owners never wait
  forever; a dirty grant is visible, not silent. Each gate timeout appends one line to
  `locks/host-alerts.log` (see 4).
- **Hold-time recheck.** `verify.mjs` checks the same rule before each run while it holds the lock
  (options `--max-load`/`--max-busy`). It waits up to 60 s for quiet, then runs anyway and flags the run
  (measure-parallel's proposal in I-017). Measurement code: comparability note, `npm run test:chrome`, and a
  `fix-reviewer` pass.

### (b) Cap `npm test` concurrency: toolsmith, P1

- `package.json` `test`: add `--test-concurrency=3`. `test:chrome` already runs at 1.
- Runtime, from logs: ts-i003's run spent 173 s summed test time and took 38 s wall at concurrency 7
  (quiet-ish host). The longest single test is ~35 s (`ab-fake`), so at 3 expect max(173/3, 35), about
  **60-70 s** on a quiet host (4 would give ~45-50 s). The CPU-seconds don't change; peak processes, RSS and
  flake exposure drop by about 2x. The toolsmith measures it under the short lane and reports the number.
- Follow-ons: the documented `--max-seconds 120` in `CLAUDE.md` still fits; `SHORT_DRAIN_SEC = 300` drains
  4 suites instead of ~7. Accept that, or raise the drain to 360 s. Don't raise concurrency to win it back:
  the lane is exclusive with measurement anyway.
- **Superseded 2026-10-03 (I-076, f8aa122, lead GO): concurrency raised to 6.** The suite had grown to ~1331 tests
  and took 285-299 s of wall time at 3, against the shared lane's 300 s cap. It waits on fake real-time phases,
  timers and polls far more than it computes, so at 6 it takes ~160-164 s with the same CPU time (280-290 CPU-s),
  about 1.75 cores on average with bursts up to 6 cores. npm test keeps weight 2 and `--max-seconds 300` in the
  shared lane, which keeps it away from timing holds.

### (c) A separate `cpu-heavy` semaphore for tests? Not now. Lead decision, P3 to revisit

Tests next to a measurement are exactly the contamination we must avoid, so a separate N-slot semaphore
would have to be a readers-writer lock against `chrome-measure` (tests shared, measurement exclusive).
That is more state and more ways to deadlock, for a problem I-011's drain already solves: short jobs are
exclusive with measurements and drain back to back. Revisit only if the short lane becomes the bottleneck
again. Then let up to 2 short jobs share one short hold (a shared slot inside `chrome-measure`) rather than
adding a resource. The gate (a) provides the global view the semaphore would have.

### (d) Per-run host record and a contamination flag: toolsmith, P0 (measurement code)

- `verify.mjs`, per run and phase (scroll, morph, idle): `host: {load1Start, load1End, busyPct, sysPct,
  pressureMax, decompPerSec, chromeCpuPct, otherBusyPct}`. `busyPct` and `sysPct` are tick deltas over the phase.
  `chromeCpuPct` is the CPU time of the measured Chrome's process tree (known root pid; one `ps -o time`
  before and after the phase, outside the timed window). `otherBusyPct = busyPct - chromeCpuPct`. vm_stat and
  sysctl run between phases, never inside one.
- Flags per run: `loadInvalid` when `load1Start > 10`, or `otherBusyPct > 25` in the scroll phase, or
  `pressureMax >= 2`, or the grant was a gate timeout; `loadWarn` when `load1Start > 6` or
  `otherBusyPct > 15`. These start as the I-017 numbers and are recalibrated with (a).
- `fix.mjs ab`: `host.loadavg1Min/Max` over `before` **and** `after`; `host.contaminated` (any run
  `loadInvalid`) and `host.invalidRuns`. The printed table and `markdown` prefix every verdict with
  `CONTAMINATED (host):` when set, and the verdict can't be plain "better"/"WORSE". Optional
  `--retry-invalid N` re-runs up to N invalid runs at the end of the session.
- **Results already measured above the threshold** (lead's question):
  1. Tag, don't delete. The lead lists them (the table in section 1) and each topic README gets
     "measured at load1 X-Y: floor comparison void, deltas provisional".
  2. **"better"** from a contaminated A/B stands provisionally when the ranges don't overlap and the
     delta is larger than the spread of an A/A at similar load. I-017's r = 0.13 says paired ABBA deltas
     mostly survive. **"within noise"** from a contaminated A/B is *inconclusive*, not a null result:
     contamination widens spreads and can hide a win. Absolute numbers and comparisons with the A/A floor
     are void.
  3. Re-measure, in order, in the first quiet window: the A/A floor, then topics whose landing decision
     depends on the result (inconclusive ones, near-threshold wins, borderline regressions). Don't re-run
     everything: that is ~6 min of lock per topic. The **wave integrator's combined A/B must be clean**
     (gate on, no stain); that is the number for write-ups. Landed topics (phone-invisible-shrink,
     layout-animations) stay landed pending that.
  4. Keep `chrome-measure` at 1 slot. Measure-parallel's c=2 result (A/A spreads held) was measured at load
     26-61; re-test it in a quiet window before anyone proposes a semaphore.

### (e) Process rules for the lead: lead, P0 (apply now)

1. **Exceptions that bypass a lock** are written down (`incident.mjs update <id> --note "EXCEPTION …"`) with
   who, what, a **load budget** (e.g. "at most 1 suite at a time, concurrency 3, only while nobody holds
   chrome-measure") and an **expiry** (≤ 30 min, or "until <incident> lands"). Prefer a bounded
   alternative: the lead takes a short lease and runs the pending tests one after another, which is what
   I-011's drain now does.
2. **Heavy-by-design experiments** (more than one Chrome, load tests, sweeps) run only in a **quiet window**:
   the queue is empty or paused by announcement; the host is quiet by (a) for 2 min before the start; the
   experiment aborts itself when the host leaves quiet for > 30 s (other than by its own processes, per its
   own budget); the lease is ≤ 15 min per condition, renewed per condition, never 45 min up front. Declare a
   **load budget** (e.g. "3 Chromes = 3 cores, 1.5 GB").
3. **Actor budget.** At most 1 measurement + 1 short job at a time (the lock already), at most ~6 active
   agents doing CPU work while anyone measures, and no toolsmith test loops outside the lane. Ask the user
   before a clean-numbers window to close CPU-heavy desktop apps (Activity Monitor with live graphs,
   editors indexing, video calls): WindowServer alone was at 45 %. That follows standard benchmark hygiene:
   close programs that do timer-based work, browsers included [S2, S3b].
4. **Pre-commit hook takes the short lane itself** (enforcement layer, needs the user's approval): wrap the
   hook's `npm test` in `node tools/lock.mjs run chrome-measure --short --max-seconds 180 --owner
   ${FW_LOCK_OWNER:-precommit-<checkout>}`. It re-enters when the committer already holds the hold
   (`FW_LOCK_HELD`, or a same-owner lease via `FW_LOCK_OWNER`). That closes the path by which a bare
   `git commit` runs a full suite outside the lock. The toolsmith adds the hook test (P1).

### (f) Orphan cleanup: toolsmith, P2

- `tools/lock.mjs doctor --procs` (dry-run by default, audited like I-012's `repair`): lists this repo's
  processes (`serve.mjs`, `node --test`, Chrome with our `--user-data-dir` patterns, lock clients) with
  pid, ppid, age, RSS and checkout (from `--root`/`--overlay` paths or `cwd`). It flags orphans: parent
  gone (ppid 1), checkout removed, or a test-fixture root under `$TMPDIR/fw-repo-*` older than 30 min.
  `--kill-orphans` sends SIGTERM only to flagged ones and **always skips `--port 5173`** and anything the
  flag test doesn't match (Hard rule 10; pid 41834 is the user's server and has ppid 1 too).
- `serve.mjs --exit-with-parent` (default when started by `fix.mjs ab|serve`, `par.mjs` and test
  helpers): poll `process.ppid` every 5 s and exit when re-parented to 1. That prevents orphans instead of
  cleaning them up.
- `fix.mjs doctor` prints the orphan count.

### Summary

| # | fix | owner | priority |
|---|---|---|---|
| a | host-quiet admission gate in `lock.mjs` (CPU ticks ≤ 20 %, load1 ≤ 6, pressure normal; 600 s cap then a stained grant; short lane exempt) | toolsmith | P0 |
| d | per-run host record, `loadInvalid`/`contaminated` in verify + ab, recheck before each run | toolsmith (measurement code: reviewer + test:chrome) | P0 |
| e1-3 | exception budget/expiry, quiet windows for heavy experiments, actor budget; tag this evening's results as contaminated; re-measure A/A in a quiet window | lead | P0 |
| b | `--test-concurrency=3` (~60-70 s per suite; superseded 2026-10-03: 6, I-076) | toolsmith | P1 |
| e4 | pre-commit hook runs `npm test` through the short lane | lead + user approval, toolsmith for the test | P1 |
| 4 | host line in `lock.mjs status`, gate-timeout alerts (below) | toolsmith | P1 |
| f | `lock.mjs doctor --procs`, `serve.mjs --exit-with-parent` | toolsmith | P2 |
| c | cpu-heavy semaphore: no; revisit as a shared short slot if needed | lead | P3 |

## 4. Prevention checks

`lock.mjs status` is not enough: it shows who holds and waits, not what the host is doing, and every
problem this evening happened outside the lock's view. Add:

1. **A host line in `lock.mjs status`** (and in `fix.mjs doctor`), from `host.sample()` over 3 s:
   `host: load1 30.4 | cpu 68 % busy (sys 33 %) | mem pressure warn | gate CLOSED (cpu > 20 %) since 22:42 | orphans 7`.
   The lead's 20-30-min check-in already runs `lock.mjs status`, so no new habit is needed.
2. **Alert on gate timeouts.** A gate timeout appends to `locks/host-alerts.log` and runs
   `incident.mjs open --class env --sig host-not-quiet` (dedup joins the open incident), so the next
   overload appears in `incident.mjs list` within 10 min, without anyone watching `uptime`.
3. **Every result carries its host state** ((d)); `fix-reviewer` rejects a claimed win whose
   `host.contaminated` is true unless the README handles it as in (d) item 2.
4. **Optional (P2): promote measure-parallel's sampler** (`loadmon.mjs`, ~0.1 % CPU at 5 s) to
   `tools/hostmon.mjs`, writing a rolling 60-min file in the shared state dir, sampling host ticks rather
   than per-pid deltas for the total. `lock.mjs status --host` prints the last 10 min. That makes the next
   postmortem's timeline free.

## Is load average the right signal? (lead's question)

Not by itself. macOS load1 counts runnable threads (not busy cores), sampled every 5 s and averaged over
~1 min [S5, S6]; it includes kernel work done on a thread's behalf (compression and page-fault
decompression, fork/exec: the 33 % sys at 22:45 is my inference of that). It overstates CPU on this host
(load 30 at 65-74 % busy) and lags a burst by about a minute in both directions. Use:

1. **Host CPU from Mach tick counters** (`os.cpus()` deltas = `host_processor_info` [S3]) as the primary
   signal. It is windowed (you can measure exactly the scroll phase), counts short-lived processes, and
   measure-parallel found it the most reliable too.
2. **Memory pressure level and decompressions/s** as the second signal: c3's stalled run coincided with
   pressure "warn" and 3,919 decompressions/s.
3. **load1** as a coarse guard, kept because I-017's step evidence (and every old `results.json`) is in load1
   units. Drop it from the gate once the quiet A/A has mapped load1 < 6 to a CPU threshold.

Precedent for gating job admission on load: GNU make `-l/--max-load` won't start jobs above a load
threshold [S8]. Precedent for "one measurement per machine": Lighthouse [S4]; pyperf and Google Benchmark
treat other processes as the main noise source and recommend isolating or quieting the machine [S2, S3b].

## Sources

- [S1] Node.js test runner docs, execution model and `concurrency` (`os.availableParallelism() - 1`, one
  child process per file): https://nodejs.org/api/test.html (vendor doc; sure).
- [S2] pyperf, "Tune the system for benchmarks": https://pyperf.readthedocs.io/en/latest/system.html
  (vendor doc; sure; Linux-oriented, the principle carries over).
- [S3] libuv `uv_cpu_info` on Darwin reads `host_processor_info(PROCESSOR_CPU_LOAD_INFO)` ticks:
  https://github.com/libuv/libuv/blob/v1.x/src/unix/darwin.c (source; sure).
- [S3b] Google Benchmark, "Reducing variance": https://github.com/google/benchmark/blob/main/docs/reducing_variance.md
  ("close other programs that do non-trivial things based on timers, such as your web browser"; vendor doc; sure).
- [S4] Lighthouse, "Score variability": https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md
  ("DO NOT collect multiple Lighthouse reports at the same time on the same machine"; DevTools throttling
  does not mitigate resource contention; vendor doc; sure).
- [S5] XNU `bsd/kern/kern_synch.c`, `compute_averunnable` with `cexp` = e^(-1/12), e^(-1/60), e^(-1/180)
  (5-s samples for the 1/5/15-min averages): https://opensource.apple.com/source/xnu/xnu-1699.24.8/bsd/kern/kern_synch.c
  (source, old release; fairly sure it still applies).
- [S6] XNU `osfmk/kern/sched_average.c`, the run count from `sched_run_buckets[TH_BUCKET_RUN]`, i.e. runnable
  threads: https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/sched_average.c (source; sure
  about "runnable threads"; "includes kernel work on the thread's behalf" is my inference).
- [S7] Running commands on efficiency cores with `taskpolicy -b` on Apple silicon:
  https://eclecticlight.co/2021/09/14/how-to-run-commands-and-scripts-on-efficiency-cores/ (blog; fairly sure);
  man page: https://ss64.com/mac/taskpolicy.html.
- [S8] GNU make, parallel execution, `-l`/`--max-load`: https://www.gnu.org/software/make/manual/html_node/Parallel.html
  (vendor doc; sure).
