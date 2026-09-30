# Measurement parallelism and host load

Question (2026-10-01): can several Chrome A/B measurements (`fix.mjs ab` / `verify.mjs`, mobile 6x) run
in parallel on this Mac without widening the noise? And how does host load affect the results? ~10
agents were queuing on the single `chrome-measure` lock, at about 5 min per A/B.

Machine: Apple M1 Pro (6P+2E = 8 cores reported), 16 GB, one GPU, 120 Hz display. Measurement setting
as in `CLAUDE.md` "Calibrated measurement setting": 430x932 DPR 3, CPU 6x, `--vendors=local --https
--latency 150`.

## Answer

- **Keep `chrome-measure` at N = 1 slot for now.** In this study 2 parallel Chromes did not widen the
  A/A spread, but the test could not be run on a quiet machine (see below), so N = 2 is not proven.
  3 parallel Chromes are unsafe: host CPU hit 95-100 %, one run stalled (fps 14, LoAF 2 s), and all
  3 processes produced A/A "verdicts", i.e. false positives.
- **Trustworthy host load: loadavg1 ≤ 6 when a run starts.** On the unchanged baseline, frames >20 ms
  go from about 66 at load < 6 to about 96-103 at load 6-15 (fps 74 → 67-69, LoAF 259 → ~330 ms). An
  A/B taken at load > 6 can still show a fair delta: ABBA order inside one session mostly cancels
  load. But its absolute numbers must not be compared with the published A/A floor, which was
  measured at load 2.8-5.8.
- **Guard (incident I-017):** record the load and host CPU for each run; mark `results.json`
  "contaminated" when a run starts at load1 > 10 or other processes use > 25 % of host CPU; warn at
  load1 > 6. Run CPU-heavy jobs (`npm test`) only through the lock's short lane, never next to a
  holder.
- **On macOS the load average is not CPU load.** Load was 40 while CPU was 45 %: threads stalled on
  memory (compressor decompressions, page-ins) are counted too. On this 16 GB host, with about 30
  mirror servers and many agents, the free memory floor was 0.05-0.5 GB and the compressor held
  5-6 GB. Memory is the resource that parallel Chromes exhaust first.

## 1. Load monitor

`tools/loadmon.mjs` samples every 5 s using one `ps`, one `vm_stat` and two `sysctl` calls, and
writes JSONL. Each sample has:

- loadavg 1/5/15;
- CPU % of the whole machine, from per-pid CPU-time deltas grouped by family (the measured Chrome
  renderer, GPU and browser, found through the `--user-data-dir` of the root Chrome and the ppid
  chain; other Chromes; node servers; node tools and tests; claude; Serena/python; WindowServer;
  other);
- from 22:39Z on, **host CPU from the kernel's per-core tick counters** (`hostCpuPct`);
- memory: free, compressor size, pressure level, swap, and decompressions and page-ins per second;
- the `chrome-measure` holder and queue length, read directly from the lock files.

The per-pid deltas miss processes that start and exit between two samples. During the experiment,
`npm test` suites were such processes: tick-based host CPU was 73-100 % while per-pid CPU was 44 %.
Use `hostCpuPct` for "how busy is the machine".

`tools/monsum.mjs data/…` summarizes the log by phase. Data: `data/loadmon-summary.md` (tables) and
`data/loadmon-compact.jsonl` (all samples, without command lines).

| phase | load1 median [p10-p90] | CPU % (per-pid) median / p90 | measured Chrome renderer / GPU % | WindowServer % | free GB | compressor GB | decompressions/s |
|---|---|---|---|---|---|---|---|
| other agents measuring (21:56-22:31, 1 Chrome) | 12.4 [8.1-17.3] | 27.6 / 36.2 | 13.9 / 4.3 (p90) | 6.1 | 0.5 | 5.1 | 38 |
| c1: 1 Chrome, mine | 26.6 [18.3-34.5] | 34.7 / 43.6 | 9.5 / 3.1 | 5.9 | 0.4 | 5.3 | 238 |
| c2: 2 Chromes | 40.7 [24.7-55.1] | 53 / 61 | 13.5 / 5.9 | 6.4 | 0.2 | 5.7 | 1496 |
| c3: 3 Chromes | 43.9 [34.9-50.2] | 65.4 / 79.2 (host ticks: 95-100) | 23.6 / 10.2 | 7.2 | 0.1 | 6.3 | 3919 |

A single throttled measurement costs about 1.1 cores for the renderer, 0.3-0.5 for GPU/browser and
0.5 for WindowServer at 120 Hz. The ~30 mirror servers are idle, except the two serving the running
measurement. Memory pressure reached "warn" (level 2) only during c2/c3. Swap was never used.

## 2. Retrospective: does the baseline side drift with load?

`tools/retro.mjs` reads every raw `verify.json` (mobile 6x) from the main checkout and all worktrees,
read-only: 11 sessions, 98 runs, 51 of them on the baseline side with a recorded loadavg. Full
output: `data/retro.md`; rows: `data/retro-runs.json`. The baseline side is the same unchanged
`site-pretty` in every session.

| load1 at run | n | fps | >20 ms frames | >34 ms | >50 ms | LoAF ms | forced ms |
|---|---|---|---|---|---|---|---|
| 0-4 | 4 | 74.5 [71.7-76.5] | 64.5 [64-76] | 9 [7-10] | 4 [4-5] | 262 [255-278] | 41 [38-44] |
| 4-6 | 7 | 73.9 [71.4-77] | 70 [54-78] | 8 [7-11] | 4 [3-5] | 258 [195-318] | 42 [34-83] |
| 6-8 | 6 | 69.4 [66.2-71.2] | 100 [84-109] | 13 [12-14] | 5 [4-7] | 350 [303-364] | 88 [50-102] |
| 8-10 | 9 | 67.9 [63.7-70.3] | 96 [88-114] | 14 [10-17] | 6 [5-8] | 320 [228-364] | 55 [42-94] |
| 10-15 | 17 | 67.1 [51.5-71.3] | 103 [77-139] | 13 [9-18] | 6 [4-10] | 335 [263-1544] | 83 [39-116] |
| 15+ | 8 | 71.3 [66.5-73.4] | 91 [76-104] | 11 [8-15] | 5 [5-6] | 302 [268-372] | 51 [35-95] |
| (this study, c1, 17-36) | 6 | 64 [59.8-70.2] | 126.5 [94-148] | 16 [11-22] | 7.5 [5-13] | 391 [367-524] | 97 [63-153] |

- Across sessions: Spearman rho(load, frames >20 ms) = 0.51, rho(load, fps) = -0.43; OLS slope +2.3
  frames >20 ms per +1 load. The shape is a **step at about load 6** rather than a line, and it
  worsens again above ~20 (c1 in this study).
- Within a session (load and metric demeaned per session and side): r = 0.13 for >20 ms, 0.25 for
  >34 ms, -0.11 for fps. Load swings inside one A/B barely move its runs, so ABBA-ordered deltas are
  mostly fair. The damage is between sessions: a baseline measured at load 10 sits outside the A/A
  floor on its own (>20 ms 96-103 vs floor 54-78).
- Caveat: the low-load bins come mostly from one A/A session (plus the first runs of two A/Bs), so
  "load < 6" and "that session's time of day" are confounded. A second clean A/A would settle it.

## 3. Parallel A/A experiment

`tools/par.mjs --conc N --runs 3` starts N processes at once. Each is what `fix.mjs ab --aa` does:
its own two baseline mirror servers with the ab defaults, then `verify.mjs base=… base2=…` mobile
6x, 3 runs per side, ABBA. Each process has its own Chrome profile and out dir, **and its own
private `FW_STATE_DIR` lock dir**. The shared `chrome-measure` lease was held as `measure-parallel`
for the whole slot (22:31:40-22:42:00Z, about 10 min). The private lock dirs were needed because of
I-005: a same-owner re-entrant verify deletes the outer lease when it exits. The lead approved this.
`--no-lock` was never used. `tools/analyze.mjs` produces the tables: `data/parallel-aa.md`,
`data/parallel-aa.json`.

**Contamination: every run in this slot is contaminated.** Toolsmiths' full `npm test` suites ran
at the same time, and load1 was already 24 when c1 started. It peaked at 61 during c2 (lead's note:
3-4 concurrent test suites). The planned closing c=1 control (c1b) was cancelled when the lead
stopped the experiment for machine overload. So c1 is not a clean reference, and differences between
conditions mix "more Chromes" with "whatever the tests were doing at that minute".

| condition | load1 at run starts | fps pooled median [min-max] (SD) | >34 ms pooled [min-max] | >20 ms pooled [min-max] (SD) | LoAF ms pooled | per-process fps medians | A/A false positives |
|---|---|---|---|---|---|---|---|
| published floor (1 process, 5 runs) | 2.8-5.8 | [71.4-77] | [7-10] | [54-78] | [195-283] | | |
| c1: 1 process | 17.5-35.6 | 64 [59.8-70.2] (4.1) | 16 [11-22] | 126.5 [94-148] (23.6) | 391 [367-524] | 64.0 | none |
| c2: 2 processes | 26-48.4 | 63.5 [59.5-66.5] (2.1) | 15 [10-19] | 129.5 [104-139] (11.0) | 441 [347-487] | 63.0 / 63.9 | none / none |
| c3: 3 processes | 32.9-50.2 | 68.2 [14-76.4] (13.4) | 15 [8-20] | 109 [14-126] (26.1) | 389 [291-2021] | 68.0 / 67.7 / 68.5 | 5 / 2 / 5 of 8 metrics |

"A/A false positive" means that, in one process, the base and base2 ranges don't overlap for a
metric: the verdict rule of `fix.mjs ab` would call identical code "better" or "WORSE". For two
independent 3-run samples, one metric shows this by chance about 10 % of the time.

What the data can still say, with the contamination in mind:

- **Parallel Chromes interfere with each other, and it grows with N.** Measured-Chrome CPU went from
  about 1.1 to about 2.6 cores median (p90 4.5), and GPU from 3 to 10 %. Decompressions rose from 238
  to 1496 to 3919/s, free memory fell to 0.05-0.1 GB, and memory pressure went to "warn". At c3 the
  host ticks read 95-100 % busy. In that state one process lost its first scroll: fps 14, worst frame
  1.3 s, LoAF 2 s, and the scroll finished in 4.5 s instead of 8.4 s. Base and base2 separated in
  every process. c3 is past the machine's limit whatever the background was.
- **Background tests interfered too, and more than a second Chrome did.** c1 alone, at load 17-36,
  was already far outside the floor: >20 ms 126 vs 54-78, fps 64 vs 71-77. c2 had similar medians to
  c1 (fps 63.5 vs 64, >20 ms 130 vs 127) and a smaller spread. Adding the second Chrome did not
  visibly worsen anything on top of the test load. c3's medians are *better* than c1's (fps 68),
  which only makes sense if the test load dropped during c3: the lead was stopping the toolsmiths'
  suites then. This is exactly why cross-condition comparisons from this slot are unreliable.
- **Fairness between processes.** The processes had identical workloads and started together, so
  they ran in lockstep: their measurement end times were within about 2 s of each other. Per-process
  medians agreed within 1 fps (c2: 63.0 / 63.9; c3: 68.0 / 67.7 / 68.5), so no process was
  systematically slower. But lockstep means every process measures the same side at the same moment,
  so a background burst hits the same side in all of them. In c3, base beat base2 on fps in all 3
  processes (+5.3, +1.3, +3.7), driven by the first slot (base, run 1: 74.7 / 14 / 76.4). With
  parallel slots for different fixes, the processes would not be synchronized, and one fix's scroll
  phase would overlap another's page load, screenshots and Chrome startup at random.

## Recommendation

1. **N = 1.** Don't introduce a counting semaphore yet. N = 2 is plausible: CPU headroom exists (one
   measurement uses about 2 of 8 cores), and c2 matched c1 under the same background. But it must be
   proven first with a clean A/A pair (c1 then c2 then c1, load1 < 6, no tests running, 5 runs each)
   before anyone relies on it. N ≥ 3 is out: CPU saturation, memory pressure warn, stall runs, false
   verdicts. Memory is the likely limit: each measured Chrome with its servers adds about 1.5-2 GB on
   a host that already runs with < 0.5 GB free.
2. **Load guard (I-017)** in `verify.mjs` / `fix.mjs ab`. Record for each run: loadavg1 at start and
   end, host CPU % from `os.cpus()` tick deltas over the scroll phase, free memory and compressor
   rate. Flag a result as contaminated when any run starts at load1 > 10, or when host CPU minus the
   measured Chrome exceeds ~25 %. Warn at load1 > 6. Optionally, with `--max-load 6`, wait (still
   holding the lock) up to 60 s for the load to fall before each run. Print the flag next to the
   verdict.
3. **Compare only like with like.** A patched result is judged against the baseline side of the
   *same* session (ABBA), never against the published floor when the session's load was > 6.
   Re-measure the A/A floor whenever the host's background changes (number of agents and servers).
4. **Keep the machine quiet while the lock is held:** no `npm test` outside the short lane, and stop
   idle mirror servers. The ~30 idle servers cost little CPU, but they hold memory.

## Reproduce

```sh
node research/measurement-parallelism/tools/loadmon.mjs <scratch>/loadmon.jsonl 5 &      # stop with kill
node research/measurement-parallelism/tools/retro.mjs --json <scratch>/retro.json
node tools/lock.mjs acquire chrome-measure --owner measure-parallel --ttl 2700              # lease slot
node research/measurement-parallelism/tools/par.mjs --conc 2 --runs 3 --tag c2 --scratch <scratch>/exp
node tools/lock.mjs release chrome-measure --owner measure-parallel
node research/measurement-parallelism/tools/analyze.mjs <scratch>/exp c1 c2 c3 --mon <scratch>/loadmon.jsonl
node research/measurement-parallelism/tools/monsum.mjs <scratch>/loadmon.jsonl [--phases data/phases.json]
```

Raw verify outputs, screenshots and Chrome profiles stayed in the scratchpad and are not committed:
screenshots are Fastwork-derived.
