# Combined: wave1-partial

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured, **clean** (load1 3.0-4.4 throughout, <= 6 at every sample)
**Topics (apply order):** phone-invisible-shrink, commission-forced-layout, pain-offscreen-notes, nav-hit-test,
large-area-blur. These are the wave-1 patches landed on `main` at `7d86d96`, **without layout-animations**:
it was held out while its RTL flip was thought broken (review-layout05 later showed 03's flip is correct and 05 broke RTL; variant 10 = 05's teardown + 03's flip is pending). Also without the unlanded
countdown-idle-raf and the two nav-morph patches.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, `/_app/immutable/assets/2.gBuqKVzi.css` (union of the
five patches, see each topic's README).

## Inputs

`node tools/fix.mjs combine wave1-partial phone-invisible-shrink commission-forced-layout pain-offscreen-notes
nav-hit-test large-area-blur`: all 5 applied cleanly, no hand resolution. `node --check` OK; `fix.mjs serve` +
`curl` show `x-mirror-source: overlay` for both files (the A/B's `servedCheck` confirms it too).

| topic | sha256 of `fixes/<topic>/patch.diff` on main |
|---|---|
| phone-invisible-shrink | `5e42555d4191d0a72dbfdb0f5a0c6c6567408d320bc11ed8ecaaad835fc7aede` |
| commission-forced-layout | `9897e36c47d7a357fce1a05e3002d2cb91e6b8cc507c3403edf68ce2e9704099` |
| pain-offscreen-notes | `71f64449e9e6723fcee4437e24600452a4542e28d604af5dd7a94a3097e67895` |
| nav-hit-test | `e1f84630d19abc1a8c7cf146818eb10a56c824c00b75b2efc8f22be2ba36b211` |
| large-area-blur | `db12ccec57a1e93afb5c8dccd57f6597a822ceb9c032d0125cbae0b86a28e840` |

Combined `patch.diff` sha256 `3ecccf12…51c6` (2 files, +107 / -29).

## Before / after

`node tools/lock.mjs run chrome-measure --owner wave1-partial -- sh -c 'uptime; node tools/fix.mjs ab
wave1-partial --runs 5; uptime'`: Chrome, mobile 430x932 DPR3, CPU 6x, ABBA, cold cache, 6 s idle phase
(I-002 tools, `main` `7d86d96`), `--vendors=local --https --latency 150`. 2026-09-30 23:41-23:47 UTC.

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 74.9 [73.8-78.5] | 95.4 [93.2-95.7] | +20.5 (+27.4%) | better (ranges do not overlap) |
| scroll: frames >20 ms | 65 [55-75] | 24 [21-28] | -41 (-63.1%) | better (ranges do not overlap) |
| scroll: frames >34 ms | 10 [7-12] | 6 [5-7] | -4 (-40%) | within noise |
| scroll: frames >50 ms | 4 [4-5] | 5 [4-6] | +1 (+25%) | within noise |
| scroll: frames >100 ms | 0 [0-1] | 0 [0-0] | 0 | within noise |
| scroll: worst frame ms | 90.9 [83.2-100.3] | 75.4 [74.2-84.1] | -15.5 (-17.1%) | within noise |
| scroll: p95 frame ms | 25.1 [25.1-25.2] | 17.3 [17.3-17.4] | -7.8 (-31.1%) | better (ranges do not overlap) |
| scroll: LoAF ms | 267 [252-280] | 238 [189-293] | -29 (-10.9%) | within noise |
| scroll: LoAF script ms | 144 [122-166] | 114 [101-117] | -30 (-20.8%) | better (ranges do not overlap) |
| scroll: forced style+layout ms (in LoAF) | 44 [34-81] | 25 [17-26] | -19 (-43.2%) | better (ranges do not overlap) |
| morph: fps | 112 [109.7-112.7] | 111.8 [111-112.6] | -0.2 (-0.2%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: fps | 119.8 [119.8-120] | 119.9 [119.7-120] | +0.1 (+0.1%) | within noise |
| idle: frames >20 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |

(Full table with the remaining morph/idle rows: `results.json` -> `markdown`.)

Host load, load1 before/after each page load (`raw` -> `results[i].loadavg1`), ABBA order:

| run | first | load1 | second | load1 |
|---|---|---|---|---|
| 1 | baseline | 3.0 -> 4.3 | patched | 4.3 -> 4.4 |
| 2 | patched | 4.4 -> 3.5 | baseline | 3.5 -> 3.5 |
| 3 | baseline | 3.5 -> 3.2 | patched | 3.2 -> 4.0 |
| 4 | patched | 4.0 -> 3.3 | baseline | 3.3 -> 3.5 |
| 5 | baseline | 3.5 -> 4.0 | patched | 4.0 -> 3.4 |

`uptime` before 3.04 / after 3.36. All 10 page loads are **clean** (load1 <= 6).

Regressions: none. No new console errors, no new 404s. Screenshot diff top/middle/bottom 0.16 / 0 / 0 %
(phase noise range). `morphReached` true 5/5 on both sides.

## Reading

- The combination moves what the single topics moved, and more clearly: frames >20 ms 65 -> 24, fps
  74.9 -> 95.4, p95 frame 25.1 -> 17.3 ms, forced style+layout 44 -> 25 ms. All of these have non-overlapping
  ranges. This matches the FINDINGS measurement lesson: forced layout moves to the next reader, so single A/Bs
  undercount, and the win shows once most per-frame readers/writers are gone together (commission, pain, nav,
  and the phone-invisible future/platform/profile writes).
- Frames >50 ms (4 -> 5) and LoAF ms don't move. The >50 ms frames are gtag `onscrollend` (vendor), the morph IO
  panel mount (topic 13, not in this set) and `iE` itself (wave 2 scroll-engine).
- Idle is flat (all 0) on both sides. Idle-only topics (countdown-idle-raf, layout-animations) are not in this set.
- large-area-blur is GPU/raster work (P5): Chrome 6x can't see it, so this number is effectively the four JS topics.

## Risks, follow-ups

- Not the full wave: add layout-animations 05, countdown-idle-raf, morph-scrolljack-passive and
  morph-panel-lazy-mount for `all-wave1` (dry combine of all 9 is clean: `fixes/wave1-dry/README.md`).
- Tools version: `main` `7d86d96` (I-002 idle phase). Compare only with A/Bs from the same tools version. The
  coming host gate changes the phase boundaries (extra spawns between phases), so morph numbers before and after
  it aren't strictly comparable.
