# Fix: shell-hold-c ("A + shrink hold": hide the off-screen profile shells while #people starts shrinking)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** confirmed on the phone (C1, 2026-10-02). Spot (c) frame: S6 37 ms → HC 17 ms (median, 4 runs each, no
overlap); the reveal and scroll guards hold. Land candidate on top of A. The scroll-wide >34 count did not fall with it
(see "C1 result").
**Stage:** V done (C1, S driver); L waits on the lead.
**Device class / gate:** phone-only. The cost is in WebKit's compositor (backing stores), so the gate is a phone block
(stack-test timing exception, lead 2026-10-02). Chrome is a pixel and no-layout check only.
**Driver(s) behind the claims:** Simulator (structure only, never a gain); Chrome headless (pixels); phone S (C1).
**Prediction:** `fixes/PREDICTIONS.md` P-063 (pre-data).
**Owner:** wi-stack (the lead gave it the profile shells for the B research; TOPICS names no owner).
**Files touched:** `assets/2.gBuqKVzi.css`: one keyframes block and one rule, appended at the end. The JS is unchanged.

| build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` | snapshot (wi-stack worktree, read-only) |
|---|---|---|---|
| st6-rb (A, on main since e7d2de2) = control **S6** | `59b23b3f57fd` | `d22542d0b5f8` | `out/wi-stack/snap-a/st6rb` |
| **shell-hold-c** = st6-rb + the rule = **HC** | `59b23b3f57fd` | `a3b34c3a3920` | `out/wi-stack/snap-c/hc` |

To rebuild: `node tools/fix.mjs new shell-hold-c`, then `node tools/fix.mjs apply shell-hold-c --from st6-rb`, then
append the rule below. `patch.diff` is the full build from the baseline.

## Why it lags (spot c of the stack5 remaining-lag map)

When `#people` gains `.is-future-shrinking`, the card starts a 0.9 s scale transition. The deck inside the card holds 6
profile shells (402x857 at 430). The active shell and its neighbour are on screen. Shells 2-5 sit at x 804+, clipped by
the deck's `overflow: auto hidden`.

WebKit gives every composited descendant of an on-screen layer with a running transform animation a full backing
store (`GraphicsLayerCA` `ancestorWithTransformAnimationIntersectsCoverageRect`, FIXME "Compute backing exactly for
descendants of animating layers"). This is CONFIRMED by source reading for the non-threaded path; see
`fixes/stack5/README.md` "Layer diff". ENABLE(THREADED_ANIMATIONS) is UNRESOLVED.

Evidence:
- **Simulator** (`s2`, `s4`): at `+is-future-shrinking` the 4 hidden shells go from 0 KB to about 12.1 MB each. That
  is 115 -> 162 MB Simulator backing store, in every build (C, V, NB, st6-rb).
- **Simulator frame**: a ~43 ms frame about 6 ms after the crossing, mostly Composite (31-37 ms), in every build. Runs:
  `w1`, `s3` and `s4`, 10 runs.
- **Phone, pre-data** (`out/wi-stack/lag/shrink.py` on A1 and S1): the frame after the one holding the crossing is
  35-41 ms in every A1 run (C 36, NB 38, V 39 median, n=3 each). In S1 it was 36 (C) and 39 (V), n=8 each.

## What changed

```css
@keyframes fw-c-shell-hold { from, to { visibility: hidden; } }
.start-selling-future.is-visible.is-future-shrinking
  .start-selling-profile-shell:not(.is-active-shell):not(.is-active-shell + .start-selling-profile-shell):not(:has(+ .is-active-shell)) {
  animation: fw-c-shell-hold 0.95s linear;
}
```

For 0.95 s after the class flips, the shells that are neither active nor next to the active one are
`visibility: hidden`. They are never in view in that window, so nothing visible changes.
- At 1440 the non-active shells are `display: none`, so there the rule is a no-op.
- A swipe that changes the active shell re-evaluates the selector.
- The selector has no effect at the reveal or in a paused scene.

## Checks (strict pixel bar, lead 2026-10-02; all OBSERVED in our setup)

| check | result |
|---|---|
| Chrome headless 430x932 DPR 3, full freeze, 61 frames every 16.7 ms across the 0.95 s shrink window (`checkb.mjs`, hold `hc430s`), against S6, with an S6-vs-S6 A/A arm | HC vs S6: **0 px in all 61 frames**. A/A: 0 px. Hidden-shell-in-view violations: 0. Hidden shells: 2-5 at x 804..2370; shells 0-1 at 20..802 are untouched. |
| layout and style at the toggle (430, flip +0.8 s to +1.2 s) | `LayoutCount` +0 and `RecalcStyleCount` +24 for S6, A/A and HC alike: the hold adds no layout or style work of its own |
| Chrome 1440x900 (hold `hc1440s`) | Not decidable by pixels: the A/A already differs by 2-5.5 % per frame at y4311, early in the window. HC vs S6 is within that A/A, and after t 50 ms HC differs by 0.97 % with 1-2 px in the deck region. The rule is a no-op by construction here (`display: none`). |
| Simulator layers (`s4`, n=1 per arm; Simulator backing store, not phone memory) | `+is-future-shrinking`: S6 127 layers / 162 MB, the 4 shells at 12.1 MB each. HC 127 / **115 MB**, no shell backing. `+is-visible`: equal (S6 133 / 117 MB, HC 129 / 115 MB, shells 0 KB in both). |
| Simulator shrink window (`walk.mjs`, `s4`; Sim ms = structure, never a gain) | S6: frame 43-44 ms at +6-7 ms (Composite 31-32), worst rAF 37-39, 3/3. **HC: no long frame, worst rAF 17, 2/2.** Run HC1 is void: it saw no class events. |

## Geometry probe (lead amendment 3: "no-op by construction" proved, not assumed)

`out/wi-stack/a/geom.mjs`, hold `g1`: headless Chrome, DOM rects only, no pixels, shared lane, weight probe. HC and S6
each got a fresh load, a step-scroll to `+is-visible`, then to `+is-future-shrinking`. Rects were read at t0 (right
after the flip; the hold animation's `currentTime` is 0) and at t_end (flip + ~940 ms; `currentTime` 900).
**Visible clip** = the intersection of the viewport with every ancestor whose overflow is not `visible`.

| width | shells the rule hides | t0 and t_end | in the visible clip |
|---|---|---|---|
| 430x932 | 2-5 (active 0, neighbour 1) | rects x 804..2370; clip x 0..430 (deck `overflow: auto hidden`, x -16..446); `visibility: hidden` from t0 through t_end | **0 of 4**, fully outside at both times |
| 1440x900 | 0-3 (active 5, neighbour 4) | `display: none`, empty rects, no hold animation running (`currentTime` null); the deck has `overflow: visible` there, active shell x 352..1369 | **0 of 4**: no box at all, so the rule cannot change what is drawn |

S6 has the same geometry, with the same shells matching the selector but no hold. At 1440 the only thing in
x 804+ is the active shell 5, which the rule excludes. "No-op at 1440" therefore rests on `display: none` of every
shell the rule matches (OBSERVED at both times in this probe), not on the shells' position.

## Phone ticket C1 (second read signed by the lead 2026-10-02 with 4 amendments, now in the text; queue: after T-011)

**Runner:** `iphone-runner`. **Question.** Does the shrink hold remove the spot (c) frame on the phone, without
changing anything else? Prediction **P-063** was committed before any data from this ticket.

**Arms.** Both are immutable copies in this worktree, `.claude/worktrees/agent-a93135040e12a061d/out/wi-stack/...`
from the main checkout. Hashes are in the table above. The control is **S6** = st6-rb, the build now on main.

**Serve.** As for A1: one server per arm, `--port 0 --https --vendors=local --latency 150 --no-cache`. The phone uses
each server's plain-http twin (I-003). Check every served hash against the table before the block. Records carry
`meta.build` = `S6` / `HC`.

**Block** (protocol v2 §5, S driver, Timeline off, std probe, `--block C1`):
1. Cool with `node tools/wait.mjs phone-temp --below auto` (at most 10 min). Low Power Mode must be off. Park Safari.
2. One uncounted warm-up per port: S6, then HC.
3. Opening sentinel: one uncounted S6 run, bottom ≥ 58 fps and scroll ≥ 44 fps.
4. 8 counted runs, **S6 HC HC S6 S6 HC HC S6**, `--run 1..8`, labels `C1-<arm><n>`.
5. End sentinel (S6). Park Safari and stop the servers.

Time: 12 runs at about 1.5 min plus cooling, about 25 min.

**Validity.** As for A1:
- **Every counted S6 run is a sentinel** (bottom ≥ 58 fps, scroll ≥ 44 fps). A failing one voids every run back to the
  last passing sentinel. Cool with `node tools/wait.mjs phone-temp --below auto`, then restart. **At most 2 blocks** for
  this question (sequential rule, §5.3).
- A run is void for a wrong hash, a missing bottom, a missing `#people +is-future-shrinking` crossing, Low Power Mode
  or a touched phone.
- Nothing may be attached (§5.5). No recordings (user T-018).
- Log load1 and the battery temperature for every run (A4).

**Scoring.**
- Spot (c) comes from `python3 out/wi-stack/lag/shrink.py <run dir>`, grouped by `meta.build`:
  - **fn** = the frame after the one whose interval holds the `#people +is-future-shrinking` crossing;
  - window = frames ending within 1000 ms after the crossing.
  - On A1 the scorer gives C fn 35/37/36, NB 41/36/38 and V 39/36/40. The frame sits at crossing +50-55 ms.
- The reveal guard comes from `python3 out/wi-stack/lag/frame2.py <run dir>` (frame 2 at `#people +is-visible`).
- The phase rows come from `node tools/stats.mjs runs <dir> --metric gt34|gt50 --phase scroll|idle`.

**Rows and decision** (fixed before data; 4 runs per arm):

| row | read | decision |
|---|---|---|
| **1. Spot (c) fn (primary)** | fn per run, median per arm; the ≤ 30 primary also at ≤ 26 / ≤ 34; fn >34 count also at >30 / >38; fn frames in the near bands (30, 38] and (46, 54] are flagged | **Confirmed** if HC's fn median ≤ 30 ms **and** all 4 HC fn are below all 4 S6 fn. Otherwise not confirmed; report to the lead. If any twin flips the verdict, the verdict is **threshold-sensitive**. If HC shows no effect, the verdict is **"no effect (THREADED_ANIMATIONS UNRESOLVED)"**, not "refuted": the device's build may run the card's animation on the threaded path, where the stack rule differs. |
| 2. Window | per-run count of frames >34 in the 1 s window | context: HC should be about 1 lower per run (the other window frames, at +500-900 ms, are other work) |
| 3. Guard: reveal | frame 2 at `+is-visible`, median | HC − S6 within ± 8 ms. HC is identical to S6 there, so a bigger shift means noise or heat: report it. |
| 4. Guard: scroll | scroll dt>50 per run, median, also at >46 / >54 | HC more than 1 above S6 is a regression: no landing (threshold-sensitive if a twin flips it) |
| 5. Context | scroll dt>34, idle dt>34, bottom fps | reported only |

If confirmed, shell-hold-c is a land candidate on top of A. It has no finger component, so S is enough for its claim.
A touch swipe on the deck during the window would need G or F; the rule then re-targets the shells, so that should be
harmless (UNRESOLVED, not tested).

## C1 result (phone, S driver, 2026-10-02; scored by wi-stack; all OBSERVED in our setup)

**Block** (iphone-runner): one block, 8 of 8 counted runs valid. Served hashes were checked against the table before
the block. Warm-ups, the open and end sentinels, and every counted S6 run pass (bottom 60.0-60.2 fps, scroll 57.6-58.6
fps). Battery 37.2 → 38.9 °C, Low Power Mode off, rafHz 59. load1 at run start was 2.9-5.3. A shared weight-2 job
(the I-062 toolsmith) ran beside runs 1-6 and is recorded in `meta.mac`. Nothing was attached and nothing was
recorded. Every run has the `#people +is-future-shrinking` crossing. The data stays in iphone-runner's worktree
(`out/c1/`, not committed).

| row | S6 (st6-rb) | HC (shell-hold-c) | reading |
|---|---|---|---|
| **1. Spot (c) fn** | 36 / 40 / 37 / 37, median **37** | 17 / 17 / 16 / 17, median **17** | **Confirmed.** HC's median is ≤ 30 and also ≤ 26 and ≤ 34. All 4 HC fn are below all 4 S6 fn. No twin flips it, so it is not threshold-sensitive. fn >34: S6 4/4, HC 0/4 (>30: 4/4 vs 0/4; >38: 1/4 vs 0/4, so the S6 count is threshold-sensitive at >38, as forecast). 3 of 4 S6 fn are in the near band (30, 38]. |
| 2. Window (1 s after the crossing), runs with a frame >34 | 4/4 (per run 1/1/2/1) | 2/4 (per run 0/1/1/0) | Context. Medians are 1 vs 0.5. At the >30 twin both are 1 per run: HC's remaining >30 window frame sits at +824-837 ms (33/42/33 ms in 3 runs; S6 has one there, 42 ms, in 1 run). It belongs to `section.commission +entering`, the next section, which the rule doesn't touch. The hold ends near +950 ms, so it doesn't line up with this frame. Cause unknown, n = 4. |
| 3. Guard: reveal frame 2 | median 41.5 (43/41/41/42) | median 41.5 (42/42/41/39) | HC − S6 = 0, inside ± 8: pass |
| 4. Guard: scroll dt>50 | median 1 (1/1/1/2) | median 0.5 (1/0/1/0) | HC − S6 = −0.5. Twins: >46 2 vs 2, >54 0.5 vs 0.5. No regression, and no twin flips it. |
| 5. Context | scroll dt>34 7.5 (6/8/7/8), >30 9, >38 6; idle dt>34 0; bottom 60.0-60.2 | scroll dt>34 8 (8/8/8/7), >30 10, >38 6; idle dt>34 0; bottom 60.0-60.2 | Reported only. The spot (c) frame is gone in every HC run, yet the scroll-wide totals didn't fall: the other slow frames vary by about ±2 per run. A crossing map (`out/wi-stack/lag/slowmap.py`) finds no new frame in every HC run. HC has more near-34 frames at two keys (`avatars +is-sliding` 4/4 vs 2/4, `commission +entering` 3/4 vs 1/4; nearly all 32-44 ms). n = 4 can't tell this from noise. |

**Verdict:** confirmed (row 1), and the guards pass (rows 3 and 4). P-063 is a **hit** on every interval (ratio ~1.11
on HC − S6). The device behaved like WebKit's non-threaded path. ENABLE(THREADED_ANIMATIONS) itself stays UNRESOLVED
by reference.

**For the lead:**
1. The gain is one ~20 ms frame per pass at spot (c). The page-wide scroll >34 count shows no gain in this block.
2. If the two near-34 keys in row 5 matter for landing, the decisive check is a second C1 block (at most 2 per the
   ticket) scored at those keys.

## Risks and overlaps

- The **deck shells** are not owned by any topic in TOPICS. The lead gave them to wi-stack for this research.
- **scene-scope (RB)**: RB's paused-scene arm sets `will-change: auto !important`. That does not touch `animation`, and
  the hold only runs in an active scene.
- **Shell animations**: the rule sets `animation` on the hidden shells, which would override any shell animation
  during the 0.95 s. None runs there at 430: the A/A-gated pixels show 0 px.
- **Touch swipe** during the shrink window: see the C1 decision rows.
