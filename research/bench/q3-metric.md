# Q3: Tier B's main metric and time domain

Personal, educational study of a local mirror of https://fastwork.com/ (not affiliated with Fastwork).

**Decision:** Tier B's main metric is **`styleLayoutMs`** (Performance.getMetrics `RecalcStyleDuration +
LayoutDuration` delta over the scenario), measured with **`--time-domain threadTicks`**.
- Secondary checks: `layoutCount` and `recalcStyleCount`, cheap and low-noise for layout-thrash topics.
- Informational only: frame buckets (`gt20`, `p95`).

Source of the question: `fixes/ARCH_TEAM.md` Q3 and `research/architecture/automated-benchmarks.md` §3 and the
Q3 row. Measured by wave1-dry on 2026-10-01 with `bench calibrate` (A/A, ABBA, `--runs 4`, 6x, mobile), tools
at main `82d51bd` to `ff00155`.

## Scenarios

Two calibration-only scenarios, kept out of git (`fixes/q3-carousel/`, `fixes/q3-commission/`, uncommitted
`bench.json` files, so `bench lint` and `reconfirm` never see them):
- **carousel**: 6 s idle at `.start-selling-avatars.is-carousel` (layout-animations' kind of scenario).
- **commission**: stepped scroll from `.commission` to `.start-selling-platform`, step 150 px
  (commission-forced-layout's kind of scenario).

## A/A results

Relative spread = minEffect / median (minEffect = half the Moses CI width of the A/A shift); smaller is better.
Each cell gives the relative spread, with minEffect in brackets.

| scenario, time domain | host (band) | styleLayoutMs | layoutMs | recalcStyleMs | scriptMs | taskMs | layoutCount | recalcStyleCount | gt20 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|
| carousel, threadTicks | load1 1.9-2.5, other CPU ≤16.8 % (**clean**) | 0.313 (59 ms) | 0.508 | 0.396 | 0.408 | 0.096 (264 ms) | 0.07 | 0.003 | - | 0.025 |
| carousel, timeTicks | load1 1.9-2.6, other CPU ≤24.4 % (warn) | 0.702 (132 ms) | | | 0.453 | | | | | |
| commission, timeTicks | load1 1.9-3.0, other CPU ≤23.8 % (warn) | 0.122 (88 ms) | 0.106 | 0.135 | 0.184 | 0.092 (224 ms) | 0.168 | 0.066 | 0.917 | 0.067 |
| commission, threadTicks | load1 3.3-4.7, other CPU 20.7-25 % (warn) | **0.019 (17 ms)** | 0.104 | 0.021 | 0.077 | 0.039 (117 ms) | 0.023 | 0.031 | 0.375 | 0.186 |

The carousel timeTicks row only has the two metrics the log prints: the refused record was overwritten by the next
calibrate, so they were recomputed from the logged per-run values with `tools/lib/bench-stats.mjs`. A fifth
A/A (carousel timeTicks, re-run) was stopped at run 3B when it became CONTAMINATED (other CPU 26.4 %).

## Why threadTicks

On commission, threadTicks shrank the `styleLayoutMs` floor from 88 ms (0.122) to 17 ms (0.019), and that run
was on a **busier** host (other CPU 20.7-25 % vs 12.6-23.8 %, load1 3.3-4.7 vs 1.9-3.0).
- Per-run style+layout in threadTicks: 881-905 ms over 8 runs.
- In timeTicks: 698-819 ms.

On the carousel, the clean threadTicks floor (0.313) is less than half the warn timeTicks floor (0.702). That
comparison is confounded, though: a stray chrome-devtools-mcp Chrome was alive during the timeTicks A/A and was
killed at about 05:19Z. The commission pair isn't confounded that way, and it points the same direction. This
matches the design's expectation: thread time excludes time the renderer main thread is descheduled by other
processes, while the 6x throttle (a busy-spin on that same thread) still counts.

## Why styleLayoutMs, not taskMs

- `taskMs` sometimes has the smaller relative spread (carousel 0.096). But it contains style+layout plus all
  other main-thread work, so its denominator is large. Its absolute floor is 2.5-7x larger (117-264 ms against
  17-59 ms), so a fix that removes some style+layout time is easier to detect in `styleLayoutMs`.
- With threadTicks on commission, `styleLayoutMs` has the smallest relative spread of all duration metrics.
- It measures the mechanism most wave-1 topics target: forced and repeated style and layout.
- `layoutCount` and `recalcStyleCount` have small spreads and are exact counts, so they are good secondary or
  gain metrics where a topic claims fewer passes, not less time.
- `gt20` is the most load-sensitive, as `measurement-parallelism` predicted (0.375-0.917). It stays
  informational.

## Caveats and follow-ups

- Only one A/A was fully clean (carousel threadTicks). The decision rests on relative comparisons that held
  under equal or worse load. The floors in the warn rows are **not** calibrations: `bench calibrate` refused to
  store them, correctly.
- The idle carousel scenario is noisy in `styleLayoutMs` even when clean (0.313, one 244 ms outlier run among
  164-202 ms). For layout-animations, author the gain on `layoutCount` (0.07) or use a longer window.
- Each topic's real floor comes from its own `bench calibrate` on a quiet host (Q14), not from this table.
- Holds used for Q3, all normal lane, ≤ 10 min each:
  1. 1 s, aborted because `bench calibrate` required a patch.diff (I-029, now fixed).
  2. 561 s: 3 A/As.
  3. Stopped after 3 runs: contaminated host at 05:56-05:58Z.
  4. About 6 min: commission threadTicks A/A; carousel timeTicks stopped at contamination.
