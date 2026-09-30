# Fix: nav-hit-test

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (within noise at n=5, consistent direction); equivalence probe: 0 mismatches in 1690 points
**Topic:** `fixes/TOPICS.md` #3 `nav-hit-test` (cluster B with #6 `morph-scrolljack-passive`, same owner)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, component `dN` (fixed top nav): `F` (pretty 12955-12963),
`ee` (12964-12966), the nav scroll callback `_` (13002). No CSS.

## Why it lags

The fixed nav registers `L` with the shared scroll engine (`dE(L, {manageAnimations:!1})`, JS 13090, not
IntersectionObserver-gated), so it runs in `iE` on every scroll frame of the whole page. `L` calls `_`
(JS 13000-13011), which does:

1. `ee()` (12964-12977): `querySelector('.start-selling-profile-sticky')`, `getComputedStyle` (forces a style
   recalc if anything wrote styles earlier in the frame), two `getBoundingClientRect` (forces layout).
2. `F()` (12955-12963): nav rect, then **`T.style.pointerEvents = 'none'`** (inline-style write on the nav root:
   `pointer-events` is inherited, so the whole nav subtree is style-invalidated, including the mounted morph
   panel with its image columns and countdown), `document.elementFromPoint()` (forces that style recalc plus a
   hit test), then **restore** (a second invalidation of the same subtree).
3. `querySelector('.hero-track')` + `getBoundingClientRect` (13002-13007): forced again, because step 2 left the
   nav subtree dirty.

So the nav's own callback is write→read→write inside the frame and costs two extra forced style passes over
the nav subtree per scroll frame, plus two `querySelector` walks. Evidence:
`research/01-initial-investigation/motion-inventory.md` "Fixed nav" (per-frame callback, "write–read–write
forces style and layout every frame") and "Ranked suspects" #2; `iE` (engine, which runs this callback) is a
top LoAF script at every CPU rate in `research/cpu-throttle-calibration/`.

## What changed

- `F()`: no style writes. `document.elementsFromPoint(x, y)` returns every hit-testable box at the point,
  top-down; the patch returns the first one that is **not inside the nav**, or that is inside
  `.start-selling-top-nav-actions` / `.start-selling-morph-panel`. Those two are the only boxes in the nav that
  set `pointer-events: auto` explicitly (CSS 11442 for the actions; 10557 for the panel when the nav is
  `.is-expanded`; the `.is-earn` button's 11498 rule is inside the actions), so they are exactly the nav boxes
  that stayed hit-testable in the original under `pointer-events: none` on the nav root. Everything else in the
  nav only inherited `auto` from the root. Result: the same element as the original `elementFromPoint`, hence the
  same `j()` answer (`is-on-dark`). Checked in-page, see "Equivalence check".
- `ee()` / `_`: `querySelector` results for `.start-selling-profile-sticky` and `.hero-track` are cached and
  re-queried when detached or missing (`isConnected`).
- The engine API and the `dE(...)` call are unchanged (cluster A rule).

Visual: identical by construction (same element → same classes). Screenshot diff top/middle/bottom
0.12 / 0 / 0.31 % (countdown/orbit phase noise range), `morphReached` true in all 10 runs.

## Why that is faster

`_` becomes read-only: at most one forced style+layout (whatever the earlier engine callbacks left dirty) instead
of three, and the nav subtree is no longer style-invalidated twice per scroll frame, so the frame's own style
pass also shrinks. `elementsFromPoint` does one list hit test instead of style recalc + hit test. Expected to
move frames >20 ms / fps (many small per-frame savings) more than LoAF (which only sees frames > 50 ms).

## Before / after

`node tools/fix.mjs ab nav-hit-test --runs 5` (Chrome, mobile 430x932 DPR3, CPU 6x, ABBA, cold cache,
`--vendors=local --https --latency 150`); host load avg 11.3-17.5 during the runs (busy machine: other agents).
**Validity: contaminated (load1 > 10) and old-tools (before I-002)**. Re-measure on a quiet host with current
tools; the wave integrator's combined run is the other place to confirm it.

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 69.1 [61.1-71.4] | 75.3 [69.9-77.8] | +6.2 (+9%) | within noise |
| scroll: frames >20 ms | 98 [85-135] | 62 [60-104] | -36 (-36.7%) | within noise |
| scroll: frames >34 ms | 14 [8-16] | 11 [7-14] | -3 (-21.4%) | within noise |
| scroll: frames >50 ms | 5 [4-8] | 5 [4-7] | 0 (0%) | within noise |
| scroll: frames >100 ms | 0 [0-2] | 0 [0-2] | 0 | within noise |
| scroll: worst frame ms | 100 [92-108.4] | 91.9 [90.9-116.8] | -8.1 (-8.1%) | within noise |
| scroll: p95 frame ms | 25.7 [25.3-33.1] | 25.1 [24.9-25.7] | -0.6 (-2.3%) | within noise |
| scroll: LoAF ms | 305 [276-372] | 301 [281-421] | -4 (-1.3%) | within noise |
| scroll: LoAF script ms | 159 [129-223] | 165 [147-243] | +6 (+3.8%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 47 [35-95] | 47 [41-91] | 0 (0%) | within noise |
| morph: fps | 108.9 [102.2-110.9] | 107.8 [103.8-110.1] | -1.1 (-1%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-1] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

A/A noise floor (fix-countdown-idle-raf, same setting, n=5, 413a293): scroll fps 71.4-77, frames >20 ms 54-78
(median delta +6), LoAF 195-283 ms, forced 34-83 ms; ">20 ms deltas under ~15 are noise".

Reading: no metric clears the strict "ranges don't overlap" bar. fps (+6.2) and frames >20 ms (-36, i.e. -37 %)
move in the expected direction and by more than the A/A median delta, and the overlap comes from one patched run
(run 1: 69.9 fps / 104 frames; runs 2-5: 73.5-77.8 fps / 60-78 frames). LoAF and forced style+layout (which only
count frames > 50 ms) don't move. Verdict: **within noise, likely small win in the per-frame cost**; the combined
`nav-morph` A/B is the place to re-check it.

## Equivalence check

Own CDP probe (not a tool change; script kept in the session scratchpad), run under the `chrome-measure` lock
as `fix-nav-morph`: on the baseline page, in one frame per step, it runs the **original** hit test (inline
`pointer-events: none` on the nav, `elementFromPoint`, restore) and the **patched** `elementsFromPoint`
filter at 10 x-positions across the nav, at every ~97 px scroll step from the top to the end, and then through
the morph (pushing past the end). It compares the element each returns and the `j()` answer.

| viewport | steps (incl. 12 morph samples) | points compared | mismatches | steps with the nav centre on dark (`is-on-dark`) |
|---|---|---|---|---|
| mobile 430x932 DPR3 | 56 | 680 | **0** | 21 |
| desktop 1440x900 | 89 | 1010 | **0** | 28 |

So the patched `F()` returns the same element at every sampled point, including the dark sections (hero,
pain, platform) and the actions/expanded-panel boxes that keep `pointer-events: auto`.

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status |
|---|---|---|---|---|---|---|---|---|
| nav-hit-test/01 | `F()` via `elementsFromPoint` (no inline `pointer-events` writes) + cached `querySelector` in `ee`/`_` | removes 2 subtree style invalidations + forced recalcs per scroll frame; frames >20 ms and fps should move | within noise | contaminated (host load 11.3-17.5 at start) + old-tools (before I-002) | frames >20 ms 98 [85-135] -> 62 [60-104], fps 69.1 [61.1-71.4] -> 75.3 [69.9-77.8], LoAF/forced flat, n=5 | `results.json`, out/ab/nav-hit-test/2026-09-30T21-19-14-853Z | direction consistent in 4 of 5 patched runs; LoAF only sees >50 ms frames, so a per-frame saving shows in >20 ms first | on branch; retry the A/B on a quiet host with current tools |
| nav-hit-test/02 | equivalence probe: original toggle + `elementFromPoint` vs patched filter, same frame, 10 x per step, mobile + desktop + morph | the patched filter returns the same element / `j()` everywhere | better (0 mismatches) | clean (deterministic check, timing-independent) | 0 / 680 points mobile, 0 / 1010 desktop | README "Equivalence check"; probe log `scratchpad/nav-morph/probe-1.log` | explicit `pointer-events:auto` descendants (actions, expanded panel) are the only nav boxes that stay hit-testable | done |
| nav-hit-test/03 | architecture review: IO-gate `ee()` on `#profile-showcase`, `.hero-track` 0.72 test as IO (T7) | drop the per-frame `getComputedStyle` + 3 rects in `_` | abandoned (not built) | - | - | README "Next iteration" | after #01, `_` still needs one forced layout for `F()` (nav rect + `elementsFromPoint`); the other reads then hit clean layout and cost little, so the gain needs wave-2 scroll-engine batching (reads before writes) first | retry when scroll-engine batching lands |

## Risks, conflicts, follow-ups

- Equivalence relies on the nav's CSS: if a future rule gives another nav descendant `pointer-events: auto`, add
  it to the selector in `F()` (the original would hit it; the patch would look through it).
- Inline `pointer-events` on nav descendants: none today.
- Overlaps: same `ne(() => …)` block as #6 `morph-scrolljack-passive` (separate hunks; `fix.mjs combine nav-morph
  nav-hit-test morph-scrolljack-passive` applies cleanly). Wave 2 `scroll-engine-batching` will convert `L` to
  measure/mutate: after this patch everything in `_` is a read (`ee`, `F`, hero-track rect) and the writes are the
  Svelte `z()` sets; told the owner.
- Not done: replacing the hit test with an IntersectionObserver/section-boundary model (TOPICS.md direction). The
  nav theme depends on stacking (`.commission-card` over `.commission.shrinking`, sticky `.hero` under later
  sections) and on hit-testability, which a geometry model can't reproduce exactly; the per-frame cost left is one
  list hit test.

## Next iteration (architecture review, not in this patch)

From the lead's architecture review (`research/architecture/`). To be measured with one more `--runs 5` A/B
when the queue is short:

- Gate `ee()` (the `.start-selling-profile-sticky` check) with an IntersectionObserver on `#profile-showcase`,
  and read its position once instead of every frame (`getComputedStyle` + 2 rects per frame today).
- Turn the `.hero-track` "progress >= 0.72" test in `_` into an IntersectionObserver with a matching rootMargin
  (FINDINGS T7), so `_` does no rect reads for it.
