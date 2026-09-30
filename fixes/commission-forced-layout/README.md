# Fix: commission-forced-layout

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** mechanism verified: commission `a` appears in the LoAF top scripts in 7/10 baseline runs → 0/10 patched, and in paired ABBA runs frames >20 ms favour the patch in 10/10 pairs. Gain inconclusive: the final A/B is contaminated (load1 19.2 at start, 12.2-27.6), used old tools, and is within noise. A clean single-topic re-run is pending (DIRECTION slot 3).
**Topic:** see `fixes/TOPICS.md` (5 `commission-forced-layout`, plus the commission part of 4
`phone-invisible-shrink`, conflict cluster C)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, component `AE` (section.commission), only the
`ne(() => …)` block, pretty lines 3100-3155: the per-frame callback `a` and its closure variables. `A`
(3085) and `j` (3092) are unchanged; the engine (`rE`/`iE`/`aE`/`dE`/`uE`) is unchanged. No CSS change.
`patch.diff` has exactly two hunks, both inside that `ne` block (baseline 3103-3110 and 3112-3127).

> **Revision note.** The first version of this patch (sha256 `b02892f1…`) also had 7 stray hunks. A
> file-wide identifier rename (`cy` → `_cy`) hit the module-level `cy` (pretty 1626/1631) and the SVG
> `cy` attribute of six `<circle>` templates (9959, 10255, 11494, 11959, 12407, 12726), which would
> have drawn those icons at y=0. The reviewer caught it. The overlay was rebuilt from the baseline with
> only the `ne` block changed, the closure variable was renamed to `_cc`, and mobile was re-measured
> (below, current sha256). The desktop and iPhone checks further down were run on the first version.
> Its logic in `a` is identical. The extra hunks only touched SVG templates and a consistently renamed
> module-level binding, not scroll code, so the lead said desktop needs no re-run.

## Why it lags

Research: `research/01-initial-investigation/motion-inventory.md` "`section.commission`" ("Two
`getBoundingClientRect` calls, then `setProperty('--commission-*')`, then `Range.getClientRects()`. That
is a forced layout right after a style write. On phones the scale/radius values are overridden, so it is
all cost and no visual") and "Ranked suspects" 2-3; `research/cpu-throttle-calibration/README.md` lists
`a` @87539 (= pretty 3106) among the top LoAF scripts at every throttle rate.

Code (baseline `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js`):

- `a` (3106-3126) runs in its own rAF, scheduled by the engine callback `o` (3127, `dE` at 3143) on every
  scroll/resize frame while the section is within ±1 viewport, and re-schedules itself (3125) for ~20
  frames after scrolling stops while the 22 %/frame easing converges.
- Every run: `A()` (3085) builds **three new `MediaQueryList`s** (`matchMedia` parses each query), reads
  `innerHeight` and two rects (`.commission-card` 3109, `section.commission` 3110), then writes
  `--commission-enter-shrink` / `--commission-shrink` on the section (3119-3120; custom properties
  inherit, so every change invalidates style for the whole commission subtree) and `d.style.height`
  (3123).
- Then `j()` (3124 → 3092-3099): on compact breakpoints (`s(y)` true, i.e. phones) it creates a Range over
  the h2's muted span and calls `getClientRects()`. That is a layout read **right after** the style
  writes, so style recalc + layout are forced synchronously inside the callback on every easing frame.
- On those same compact breakpoints the CSS makes the written values invisible: CSS 916-938 (the exact
  media query `A()` tests) sets `--commission-shrink-scale: 1`, `--commission-shrink-radius: 0px`,
  `.commission-card { transform: none; border-radius: 0 }` and `.commission-runway { display: none }`.
  `--commission-enter-shrink` / `--commission-shrink` are only consumed at CSS 4-6 and 35-37 (through
  those two neutralised variables). So on phones the whole easing loop and both writes are pure cost.
- The line-count check `j` already has a `ResizeObserver` on the h2 (3141); the per-frame call only
  duplicates it, except when the compact flag itself flips.

## What changed

All in `a` and the closure around it (see `patch.diff`):

1. **Cached media queries.** The three `A()` queries are created once (`_cq`) and `a` reads `.matches`
   (live) instead of calling `matchMedia` three times per frame. Same queries, same OR.
2. **`j` off the frame path.** `a` calls `j()` only when the compact flag changes (and on the first run,
   as before), before any rect read or style write. Everything else — width, font swap, text/locale
   change, the `title-wrapped` toggle — changes the h2's size and is handled by the existing
   `ResizeObserver(j)`. So there is no layout read after the style writes any more.
3. **Compact breakpoints (topic 4 part).** When compact, the eased values are snapped to their targets
   (`n = m`, `r = h`, the same thing the reduced-motion path already does), `--commission-*` is not
   written, and the self-rescheduling easing loop does not run. The two rects are **still read**: the
   `entering` / `shrinking` classes depend on them, and `.commission.shrinking` is used by the nav
   hit-test (JS 12953) and for the section background (CSS 15, 56), so those must keep updating on phones.
4. **No redundant writes.** `--commission-enter-shrink`, `--commission-shrink` and the runway height are
   written only when the string value differs from the last one written (they are written nowhere else).
   Desktop gets exactly the same values per frame as before; converged frames just skip the no-op
   mutations.

Desktop (not compact) behaviour is identical: same easing, same values, same classes, same runway
height; `j` there only ever set `title-wrapped` to false, which still happens on the first run.
Reduced motion: unchanged (it already snapped). Resizing across the breakpoint: on the first frame after
the flip `j` runs and desktop easing resumes from the snapped (converged) values, i.e. what the baseline
reaches after its ~20 easing frames anyway.

## Why that is faster

- Phones: per commission frame, no style writes → no subtree style invalidation, no Range + forced
  layout, no ~20 extra easing frames after each scroll stop, no 3 `matchMedia` parses. What remains is 2
  rect reads (normally on clean layout) and signal sets.
- Desktop: only the `matchMedia` parses and the no-op writes go; the eased writes stay (they are visible).
  Expected: within noise on desktop.

## Before / after

### Final patch (current `patch.diff`, sha256 `9897e36c…`, = `results.json`), mobile 6x, n=5

`node tools/fix.mjs ab commission-forced-layout --runs 5` (Chrome, mobile 430x932 DPR 3, CPU 6x, ABBA
order, cold cache, serve `--vendors=local --https --latency 150`). Tools at `138e641`, before I-002
(4bbd249), so validity is **old-tools**. Host load **12.2-27.6** (load1 19.2 at start), so it is also
**contaminated**. Raw: `out/ab/commission-forced-layout/2026-09-30T22-23-39-420Z/verify.json`.

> **Postmortem tag:** measured at load1 12.2-27.6: floor comparison void, deltas provisional
> (`research/architecture/postmortem-2026-09-30-overload.md` (d)). The "within noise" verdicts here are
> **inconclusive**, not a null result.

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 66.5 [63.7-72.9] | 70.2 [63.1-72.8] | +3.7 (+5.6%) | within noise |
| scroll: frames >20 ms | 104 [80-124] | 78 [71-107] | -26 (-25%) | within noise |
| scroll: frames >34 ms | 16 [12-18] | 12 [9-19] | -4 (-25%) | within noise |
| scroll: frames >50 ms | 6 [4-6] | 5 [5-6] | -1 (-16.7%) | within noise |
| scroll: frames >100 ms | 1 [0-2] | 1 [0-2] | 0 (0%) | within noise |
| scroll: worst frame ms | 116.6 [84.1-117.5] | 100.4 [91.8-117.5] | -16.2 (-13.9%) | within noise |
| scroll: p95 frame ms | 25.9 [25.6-26] | 25.5 [25.4-33.3] | -0.4 (-1.5%) | within noise |
| scroll: LoAF ms | 329 [285-353] | 343 [298-398] | +14 (+4.3%) | within noise |
| scroll: LoAF script ms | 188 [166-198] | 178 [142-229] | -10 (-5.3%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 86 [43-91] | 47 [34-104] | -39 (-45.3%) | within noise |
| morph: fps | 104.3 [101.6-109.5] | 107.6 [103.6-110.5] | +3.3 (+3.2%) | within noise |
| morph: frames >50 ms | 0 [0-1] | 0 [0-1] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

Every range overlaps, so the final patch's A/B is **inconclusive** (contaminated, within noise). The
medians move the same way as the first version's run below (frames >20 ms -26 vs -25, forced -39 vs
-41 ms), and in all 5 ABBA pairs the patched run had fewer frames >20 ms (80/78, 99/71, 112/98, 124/107,
104/78). A clean re-run at load1 <= 6 on current tools is scheduled (DIRECTION slot 3).

The mechanism replicates exactly in this run. LoAF top scripts, summed over 5 runs per side:
- **`a`:** in the baseline, the commission callback (`2.DyWL8TcE.js:116579 a`) appears in 4 of 5 runs,
  34 ms of which 30 ms is forced style/layout. On the patched side it appears in **0 of 5**.
- **`iE`:** forced time under the dispatcher is bimodal per run (base 47/57/47/7/3 ms, patched 55/4/58/5/4 ms),
  so its sum (161 vs 126 ms) is **not evidence** either way.
- **Unchanged:** the IO callback (93 vs 95 forced), future `l` (85 vs 95) and gtag.

Regressions: none. No new errors or 404s, `morphReached` 10/10, screenshot diff top 0.13 % / middle
0.01 % / bottom 0.

### First version (`variants/01.diff`, sha256 `b02892f1…`, same logic in `a`, plus the broken stray hunks), mobile 6x, n=5

Tools at `413a293` (old-tools). Host load 6.1-11.7 (baseline run 1 at load1 11.5, patched run 4 at
11.7; load1 12.5 at the end), so validity is **contaminated**. Its "better" verdicts (disjoint ranges on
two metrics) are "better, contaminated". Raw:
`out/ab/commission-forced-layout/2026-09-30T21-15-46-797Z/verify.json`.

> **Postmortem tag:** measured at load1 6.1-11.7: floor comparison void, deltas provisional.

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 69.3 [66.6-70.3] | 73.5 [70.2-74.8] | +4.2 (+6.1%) | within noise |
| scroll: frames >20 ms | 96 [89-99] | 71 [63-83] | -25 (-26%) | better (ranges do not overlap) |
| scroll: frames >34 ms | 13 [10-16] | 9 [7-12] | -4 (-30.8%) | within noise |
| scroll: frames >50 ms | 5 [4-6] | 4 [4-5] | -1 (-20%) | within noise |
| scroll: p95 frame ms | 25.7 [25.6-25.8] | 25.4 [25.1-25.5] | -0.3 (-1.2%) | better (ranges do not overlap) |
| scroll: LoAF ms | 336 [289-364] | 311 [271-357] | -25 (-7.4%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 83 [42-96] | 42 [37-84] | -41 (-49.4%) | within noise |

LoAF: `a` was in 3 of 5 baseline runs (18 ms forced) and 0 patched runs. The paired ABBA runs favour the
patch in 5/5 pairs on frames >20 ms (94/83, 89/71, 99/76, 96/71, 99/63). Forced time under `iE` (147 vs
64 ms summed) is per-run bimodal, like above, and not evidence. The SVG `cy` breakage in that version doesn't show in the scroll metrics or in the
three screenshots (top 0.1 %).

A/A noise floor (fix-countdown-idle-raf, mobile 6x, n=5, `413a293`, load 2.8-5.8): frames >20 ms 54-78
pooled, median delta +6; p95 25.0-25.7; forced 34-83 ms (median delta -3). **Comparisons of either run
above with this floor are void**: both ran at far higher load than the floor (postmortem (d)).

**Desktop no-regression check** (`--viewport desktop --runs 3`, as agreed with the lead; run on the
first-version patch `b02892f1…`, see the revision note; host load 8.9-20.8, busy; raw `out/ab/commission-forced-layout/2026-09-30T21-43-59-092Z/verify.json`;
stored under `desktopFirstVersion` in `results.json`, whose top level is the current mobile run):

| desktop 6x, n=3 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 71.8 [69.9-74.5] | 72.2 [72.1-72.3] | +0.4 (+0.6%) | within noise |
| scroll: frames >20 ms | 133 [117-146] | 124 [119-126] | -9 (-6.8%) | within noise |
| scroll: frames >34 ms | 17 [15-21] | 17 [17-19] | 0 (0%) | within noise |
| scroll: frames >50 ms | 7 [6-8] | 6 [6-9] | -1 (-14.3%) | within noise |
| scroll: frames >100 ms | 1 [0-1] | 0 [0-1] | -1 (-100%) | within noise |
| scroll: worst frame ms | 100.2 [84.3-108] | 91.8 [83.4-108.1] | -8.4 (-8.4%) | within noise |
| scroll: p95 frame ms | 25.7 [25.5-25.9] | 25.7 [25.6-25.7] | 0 (0%) | within noise |
| scroll: LoAF ms | 352 [320-370] | 358 [300-397] | +6 (+1.7%) | within noise |
| scroll: LoAF script ms | 187 [185-200] | 182 [147-217] | -5 (-2.7%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 40 [38-84] | 36 [29-58] | -4 (-10%) | within noise |
| morph: fps | 107.9 [107.6-108.2] | 108.8 [108.3-109.8] | +0.9 (+0.8%) | better (ranges do not overlap) |
| morph: frames >50 ms | 0 [0-1] | 0 [0-0] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

Desktop is unchanged, as expected: the eased writes still happen there. The +0.9 morph fps is below
anything meaningful and not attributable to this patch, which does nothing during the morph phase.
Regressions: none (no new errors or 404s, `morphReached` 3/3 on both sides, screenshot diff top 0.05 % /
middle 0.01 % / bottom 0).

**iPhone** (iPhone 15 Pro Max, iOS Safari, under the `iphone` lease, 2026-09-30 21:54-22:03, first-version patch `b02892f1…`; iPhone now disconnected, so no re-run):
`iphone.mjs scroll` (scripted smooth scroll, rAF frame logger), baseline and patched served over plain
http (`serve.mjs --vendors=local --latency 150`, I-003), 3 runs each in ABBA order
(base, fix, fix, base, base, fix). Scroll phase, 331-338 frames per run:

| iPhone scroll, n=3 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| fps | 51.9 [51.7-52.3] | 52.4 [52.0-52.4] | +0.5 | within noise |
| frames >20 ms | 63 [62-67] | 64 [59-65] | +1 | within noise |
| frames >34 ms | 17 [17-18] | 16 [13-17] | -1 | within noise |
| frames >50 ms | 6 [6-8] | 5 [4-6] | -1 | within noise |
| frames >100 ms | 0 [0-1] | 1 [0-1] | +1 | within noise |
| worst frame ms | 97 [96-117] | 106 [100-108] | +9 | within noise |

On the iPhone the patch is within noise: slightly better on >34/>50 ms and fps, but the ranges overlap.
The phone runs much faster than Chrome at 6x, and the commission callback is only active while the
section is within ±1 viewport, so there is little to gain there. `iphone.mjs scroll` records no WebKit
timeline (layout/style/paint counts), so those aren't reported. Raw: `out/iphone/cfl-{base,fix}-N.json`.

## Experiments tried

Validity labels follow `fixes/EXPERIMENTS.md`. All Chrome runs used tools from before I-002 (4bbd249),
so every Chrome row is at least `old-tools`.

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench |
|---|---|---|---|---|---|---|---|---|---|
| commission-forced-layout/01 | First patch: cached MQLs, `j` only on compact flip, snap + no `--commission-*` writes on compact, skip unchanged writes; **plus** a stray file-wide `cy`→`_cy` rename (7 extra hunks: module `cy`, 6 SVG `<circle cy>`) | Removes the per-frame forced layout (`Range.getClientRects` after style writes) and the invisible easing on phones → fewer >20 ms frames, less forced style+layout | **broke** (6 SVG icons drawn at y=0); scroll metrics better, contaminated | contaminated + old-tools (load 6.1-11.7; base run 1 at 11.5, fix run 4 at 11.7) | mobile 6x n=5: >20 ms 96 [89-99] → 71 [63-83] (disjoint); p95 25.7 → 25.4 (disjoint); forced 83 → 42 ms (overlap); LoAF `a` 3/5 → 0/5 runs | `variants/01.diff`; `results.json` → `mobileFirstVersion` | Scope identifier renames to the edited block and check every `patch.diff` hunk before measuring; the 3 screenshots missed small icons (FINDINGS P1) | dropped, superseded by 05 | pending runner: `variants/01.diff` |
| commission-forced-layout/02 | 01, desktop 6x `--runs 5` | Desktop unchanged (no-regression check) | abandoned (cancelled while queued; replaced by 03 under the lead's lock budget) | n/a | none | no patch kept beyond 01 (same patch) | Use `--runs 3` for no-regression checks | dropped | no patch kept beyond 01 (same patch as 01; run cancelled): `variants/01.diff` |
| commission-forced-layout/03 | 01, desktop 6x `--runs 3` | Desktop unchanged | within noise (no regression); patch itself = broke (01) | contaminated + old-tools (load 8.9-20.8) | >20 ms 133 [117-146] → 124 [119-126]; forced 40 → 36 ms; all within noise | `variants/01.diff`; `results.json` → `desktopFirstVersion` | Desktop keeps the eased writes; nothing to gain there, as expected | superseded by 05 (logic in `a` identical) | pending runner: `variants/01.diff` (desktop) |
| commission-forced-layout/04 | 01, iPhone 15 Pro Max scripted scroll, 3+3 ABBA, plain http | Fewer long frames on the real phone | within noise | clean for the phone (not load-sensitive), but patch = 01 | fps 51.9 [51.7-52.3] → 52.4 [52.0-52.4]; >34 ms 17 [17-18] → 16 [13-17]; >50 ms 6 [6-8] → 5 [4-6] | `variants/01.diff`; README "iPhone"; `out/iphone/cfl-*.json` (local) | The phone is much faster than Chrome 6x, and the callback runs only near the section: small absolute gain | retry on 05 when the iPhone is back (optional) | pending runner: `variants/01.diff` (iPhone scripted scroll) |
| commission-forced-layout/05 | Final: same logic as 01, only the `ne` block (2 hunks), closure variable `_cc` | Same as 01 | inconclusive (within noise, contaminated); medians same direction and size as 01; 5/5 ABBA pairs favour the patch | contaminated + old-tools (load 12.2-27.6) | mobile 6x n=5: >20 ms 104 [80-124] → 78 [71-107]; forced 86 → 47 ms; LoAF `a` 4/5 → 0/5 runs (`iE` sum not evidence: bimodal per run) | `patch.diff` = `variants/05.diff`; `results.json` (top level) | Mechanism reproduces exactly (`a` gone from LoAF); the timing claim needs a quiet re-run | on branch; retry the A/B when load1 <= 6 on current tools | pending runner: `variants/05.diff` (= `patch.diff`) |
| commission-forced-layout/06 | Topic-4 wording: on phones also skip the two rect reads | Remove all commission work on phones | abandoned (never built) | n/a | none | no patch kept (never built: rejected at design time) | The rects feed the `entering`/`shrinking` classes; the nav hit-test (JS 12953) and the section background (CSS 15, 56) use `.commission.shrinking` on phones too | dropped; would need an IntersectionObserver-based replacement for the two classes | no patch kept (never built; rejected at design time) |

## Risks, conflicts, follow-ups

- Cluster C: this patch is the commission part of `phone-invisible-shrink`; fix-phone-invisible-shrink
  was told to leave the commission `ne` block alone.
- `pain-offscreen-notes`: its callback reads the `.commission-card` rect (JS 4599, 4729); geometry and the
  desktop `--commission-*` values are unchanged, so it sees the same values. On phones the card never
  scaled anyway.
- Cluster A (`scroll-engine-batching`): the engine API is untouched. The two rect reads at the start of
  `a` can still be forced by writes of callbacks that ran earlier in the same frame; that ordering is the
  engine topic's job.
- If someone later makes the compact card scale visible (changes CSS 916-938), item 3 would have to go.
- `title-wrapped` now relies on the h2 `ResizeObserver` (baseline 3141) for width, font-swap and text
  changes. The muted span is in normal flow inside the h2, so its line count changing (1 ↔ 2 lines) changes
  the h2's height and fires the observer. The per-frame check only repeated that, and in the baseline it
  ran only while scrolling anyway. A resize while the section is inactive is caught when `a` next runs and
  sees the compact flag flip.
- Open: the final patch's A/B (experiment 05) ran at load 12.2-27.6 and old tools. A re-run at load1 <= 6
  on current tools (I-002+) is needed before this is claimed as `better`. The automated benchmark
  (`fixes/README.md` item 8) is not written yet. Its natural mechanism check: on the mobile viewport,
  `a` writes no `--commission-*`, never calls `Range.getClientRects` after the first frame, and
  doesn't appear in LoAF.
