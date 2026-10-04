# Fix: cd-roll-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** round 4, "cells-only", now on fix-cd-strip's **strip-tc** (the user accepted PR-008 rev 2, option
land-strip-tc, 2026-10-03 09:31Z): build V9 = C8 + this fix, JS `582d120c…`; a design delta from the strip-rw build
(no `__crTops`), so review round 4 on the delta comes before the counted set (lead). Everything measured so far ran on
strip-rw: dev base C5/V6 (CSS `9b2f89ea…`) and counted session A on C6/V7 (CSS `40078cb2…`); those sections are kept,
labelled strip-rw. Rounds 1-3 (one animation per strip, on st6-rb2) passed review (round 3 PASS, `2af461dc…`); their
sections are kept below as history, labelled.
**Stage:** F (build card); D signed by the lead, fast path, 2026-10-03 01:35Z; V = the user's blind watched comparison
(no touch; ticket rev 2 held by the lead)
**Device class / gate:** render-bound / main-thread script removal; gate = counts (no timing now) + the user's watched
blind comparison
**Driver(s) behind the claims:** Chrome CDP traces at y 0 (headless, 60 Hz; headed for 120 Hz), WebKit iOS Simulator
Timeline counts, frozen and running screenshots, layer census, and a hidden-page check (app switch). No phone runs.
**Prediction:** counts only (below); no `fixes/PREDICTIONS.md` row while timing is deferred
**Topic:** `research/gpu-props/README.md` G4 (user decision T-030 #10, "do cd-roll-ca as highest priority as well")
**Stacked on:** `fix-cd-strip` strip-tc (its patch on st6-rb2, accepted PR-008 rev 2): base
`_app/immutable/nodes/2.DyWL8TcE.js` sha256 `6fa0e1e8a221…`, CSS `982a747d9263…` (strip-rw, history: JS `5e37af69bcc4…`,
CSS `40078cb2d9cf…`, cd-strip patch `1f3c26a16563…`; dev CSS `9b2f89ea58bd…`); rebuild with
`node tools/fix.mjs apply cd-strip --on st6-rb2 --reset` then `node tools/fix.mjs apply cd-roll-ca --on cd-strip`.
The cd-strip patch is not committed here (its owner's deliverable).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only (the CSS is cd-strip's, unchanged): new helpers after
`__cdStripM` (`__crPath`, `__crAt`, `__crClock`, `__crWatch`, `__crCells`, a module-level `visibilitychange`
listener), and in `$E` (the digit) the spring effect, `__crStop`/`__crPlay`, and in the strip snippet `g` only the
replay effect and `__crEl = w`; cd-strip's code is untouched (the diff against strip-tc is insertions plus two
one-line edits in `$E`). Built overlay sha256 `582d120c9f8f…` (V9; on strip-rw it was `73dff152e454…`, V6 = V7, which
also routed cd-strip's cell-top effect through `__crTops`). Served from immutable snapshot copies
`out/cd-roll-ca/snap/{C8,V9}` (hashes in `HASHES.txt`; earlier C, V, V3, C4, V4, V5, C5, V6, C6, V7), one-command
server `out/cd-roll-ca/serve-snap.sh` (`ARMS="C8 V9"`).

## Why it lags

Each countdown digit is a Svelte component (`$E`) whose effect runs a rAF spring (`GE`: semi-implicit Euler, 16 ms
substeps, stiffness 280, damping 18, mass 0.3) for ~0.45-0.57 s after every target change, writing the strip's
`translateY` every frame. The 1 Hz tick therefore costs ~30 rAF callbacks plus a style recalc per frame for half of
every second, forever, in the hero clock (and in the panel clock when it is active). Measured at y 0 (4 s windows):
Chrome 108 countdown rAF callbacks, WebKit Simulator 105-108 (`out/cd-roll-ca/comp-check-base-p2.json`,
`out/cd-roll-ca/sim-counts-*.json`); on cd-strip strip-rb, 6 s: 162 (`comp-check-C4-p2.json`).

## What changed

At each target change the hero digit computes the path the original would show at 60 Hz and plays it as Web
Animations on the compositor: one animation per cell the roll moves, keyword easing `linear` between the path's
points, all with the same keyframe offsets and the same `startTime` (the change time). No per-frame script.

**The strip (cd-strip strip-tc, not changed here).** `strip > span.cdwrap > 11 cells` (0-9 and a second 0 for the
9→0 wrap). At rest: every cell at `top: 0`, cell k at `translateY((k − M)*c)` with `M = __cdStripM(v)` = the whole
cell nearest v (one cd-strip effect on [c, M], 11 writes when either changes), the wrapper never moves, and the strip
layer at `translateY(__cdStripY(v,c) + M*c)` (0 at an integer v). Each cell is its own layer (CSS); only cells near
the clip are backed. c is the spacer's integer `offsetHeight`.

**The roll (cells-only).** The roll moves cells, never the strip:
- `__crCells(K)`: the cells within 1.5 cells of any point of the path (its whole range included). Cells farther away
  keep their rest transform and stay at least 1.5 cells outside the clip throughout.
- At the start (`__crPlay`), each moved cell k gets a Web Animation on its own transform,
  `translateY(k*c + __cdStripY(n,c))` = `(k − n)*c` along the path n. A running animation overrides the cell's inline
  transform (cd-strip's rest place, written by its effect when the target changes, in the same effect flush as the
  roll's start, before the next frame). Only the offset that cell shows, never two large offsets that cancel. The strip
  layer stays at 0 (the target is the integer the inline transform already shows), and a cell's last keyframe equals
  its rest transform `(k − M)*c`.
- At the end (the first animation's `onfinish` → `__crStop`), the animations are cancelled, which shows the inline
  rest transform again; the last keyframe and the rest transform are the same value, so nothing moves (to check in
  review round 4: no one-frame jump at the roll end, Chrome and Sim frozen frames).
- The roll writes no `top`, no wrapper and no inline transform: no layout and no layout shift.
- `fill: both`: a frame before `startTime` shows the start, the end holds the rest place until the finish handler.
- On strip-rw (C6/V7, history) the wrapper sat at `top: -M*c` and cell k at `top: k*c`, so the roll also set the moved
  cells' `top` to `M*c` for its duration (`__crTops`, restored in the finish task); that is gone on tc.

**The path (`__crPath`, unchanged since round 1).** The original's displayed value at time x after a change, on a
60 Hz display whose frame lands exactly at x, is `GE(x mod T)` followed by whole 60 Hz frames (T = 16.667 ms). On
[kT, kT+16] that is a quadratic in the phase, so it is sampled from 33 phase lanes (0-16 ms, 0.5 ms apart) with as many
points per segment as keep linear interpolation within 5e-4 cell (capped at 32 per frame), plus a point at every whole
frame. 144 keyframes for a one-step roll, 343 for 0→9 (median 232 over the 90 from/to pairs); durations 433-567 ms.
All values stay in [0, 9] (the 9→0 wrap is a path from 9 down to 0, as the original's spring goes).
- Interpolation error vs the original's chain, offline, all 90 pairs every 0.25 ms, c = 36 px: max 0.0189 px (first
  frame of 9→0, where the spring curves most and the 32-per-frame cap binds), mean 0.0054 px.
- Tighter tolerance (lead, 2026-10-03 ~05:40Z: "if 1e-4 costs only a few more keyframes, do it"): 1e-4 gives 268 /
  520 keyframes (one step / 0→9, +86 % / +52 %) and the same max 0.0189 px (mean 0.0018 px); 65 lanes (0.25 ms) at
  1e-4: max 0.0166 px for up to 712 keyframes. Not cheap and the max barely moves: kept at 5e-4 (scratch `tol.mjs`).
- Seen in the Simulator: 0.002-0.015 px between V and C at the same state over a whole wrap (section "WebKit frames"),
  inside that bound.

**Start value, first frame, gaps.**
- Mid-roll change: the new roll starts from the running path's value at the current animation clock (`__crAt` at
  `document.timeline.currentTime`, the frame the original last showed), velocity 0, like the original.
- First frame: when the change lands after a frame began but before its rAF callbacks, the original's first callback
  steps nothing (`GE(o − n)` with o < n) and restarts its clock at that frame's stamp. One rAF per roll (never per
  frame) moves every animation's `startTime` to that stamp. It also sets the roll's `ran` flag (see Hidden tab).
- Gap re-key (round 4, V5): when that first frame comes more than one 60 Hz frame after the change (a hidden tab, a long
  task), the original makes one `GE` call over the whole gap, whose substeps come in another order than the path's.
  The same callback then re-keys the roll from that frame: start state = what `GE` gives over the gap (value and
  velocity), new path from there (`__crPath(value, target, velocity)`), new `t0` = the frame; if `GE` is already done,
  the roll ends. Once per roll, only after such a gap.

**Hidden tab (round 3, unchanged).** A module-level `visibilitychange` listener records the hide time
(`document.timeline.currentTime`, else `performance.now()`); while no frames run, the current value is the path at
that time. A roll none of whose frames has run (`ran` false) holds at its start. One pending callback (`__crWatch`,
re-armed on every `visibilitychange`, never stacked) ends the hold at the first frame after a hide; a frame that runs
while still hidden (WebKit, OBSERVED, Simulator) becomes the new held time. `__crStop` cancels the start-frame rAF, so
at most one pending callback per digit, like the original.

**Gates (unchanged).** Off-screen or reduced motion: snap (`__crStop()` first). Hero only: the panel clock
(`.countdown.inverse`) keeps the original rAF spring (its strips are painted unlayered, a compositor animation would
layer them). Fallback to the original spring: no strip yet, no `Element.animate`, or a path that does not end in
[0, 9].

**Edge cases (by reading the code, not probed).** A digit removed mid-roll: its animations go with the detached cells;
the pending start-frame callback fires once and touches only that roll's object. A new cell height mid-roll:
`__crPlay` re-creates the animations at the same `t0` and rewrites the moved cells' tops with the new c.

**Script cost per tick.** `__crPath` median 0.040 ms, p95 0.073 ms per call (0.035 ms one step), offline in Node 24
(OBSERVED, a CPU micro-benchmark, not a page timing; scratch `pathcost.mjs`). Per roll, in addition: up to 11 top
writes at the start and at the end (only the moved cells, typically 3-4 for one step, 11 for 0→9), and one
`animate()` per moved cell.

What is visually identical and what is not: the roll follows the original's 60 Hz path (numbers below). On a
120 Hz display the original takes another path (it is frame-rate dependent); the build keeps the 60 Hz one.

## Why that is faster

The per-frame rAF callback and the per-frame inline style write disappear; the compositor runs the transforms. Main
thread per roll: the change's own recalc, one rAF callback (the start fix), and the top writes at the start and end
(one layout each). In Chrome the roll adds few main frames while it runs (table below).

## Before / after (counts, no timing)

**Final, on cd-strip's landed strip-tc (C8/V9, 2026-10-04).** Chrome 154, headless, 430x932 DPR 3 mobile, y 0,
**6 s**, every other animation frozen (`comp-check.mjs --pause-others 2`, shared lane). Files:
`out/cd-roll-ca/comp-check-{C8,V9}-p2.json`. Served bodies: C8 JS `6fa0e1e8a221…`, V9 JS `582d120c9f8f…`, CSS
`982a747d9263…` (both).

| per 6 s at y 0 | C8 = main's cd-strip strip-tc | V9 = C8 + cd-roll-ca |
|---|---|---|
| countdown rAF callbacks | 163 | **6** |
| countdown function calls | 175 | 24 |
| UpdateLayoutTree | 175 | **72** |
| main frames (BeginMainThreadFrame) | 205 | **79** |
| main frames per 400 ms, in a roll / outside | 21 / 7.3 | 8.2 / 3.4 |
| Layout / Paint | 12 / 41 | 11 / 39 |
| compositor frames (BeginFrame / DrawFrame) | 224 / 161 | 188 / 170 |
| roll starts in the window | 7 | 6 |
| cell animations (trace: composited / failed / no decision) | - | 23 (0 / 0 / 23) |

Per roll, V9 runs one rAF callback (the start-frame callback) where C8 runs about 23. Its rolls add 8.2 main frames
per 400 ms against 21. Layout and Paint are equal within one count. At the end of the window, 3 cell animations of the
inverse=false clock were running, all on `span.cell`. The trace recorded no compositing decision for them, as in
rounds 1-4: "no decision recorded", not "no failure".

**Round 4 (cells-only).** Chrome 154, headless, 430x932 DPR 3 mobile, y 0, **6 s**, every other animation frozen
(`comp-check.mjs --pause-others 2`), `out/cd-roll-ca/comp-check-{C4,V5,V6}-p2.json` (hold10, hold11):

| per 6 s at y 0 | C4 = cd-strip strip-rb (`56c07524…`) | V5 = cells-only on strip-rb (`a33a8f9f…`) | V6 = cells-only on strip-rw (`73dff152…`) |
|---|---|---|---|
| countdown rAF callbacks | 162 | 7 | 8 |
| UpdateLayoutTree | 159 | 79 | 73 |
| main frames (BeginMainThreadFrame) | 170 | 91 | 82 |
| main frames per 400 ms, in a roll / outside | 24 / 3.4 | 8.7 / 4.3 | 7 / 4.6 |
| Layout / Paint | 23 / 47 | 30 / 49 | 30 / 67 |
| strip animations (trace: composited / failed / no decision) | - | 34 (0 / 0 / 34) | 40 (0 / 0 / 40) |

(History. V6's +18 Paint vs V5 was never attributed. The final C8/V9 pair above settles it for the landing build:
on strip-tc the roll writes no top, and Layout/Paint equal the base's within one count.)

**Rounds 1-3 (one animation per strip, history).** Chrome 154, headless, 430x932 DPR 3 mobile, y 0, 4 s, every other animation frozen (`comp-check.mjs --pause-others 2`:
CSS `animation-play-state: paused` on everything but the strips, and other `Element.animate()` calls start paused),
`out/cd-roll-ca/comp-check-{base,build}-p2.json`:

| per 4 s at y 0 | base (cd-strip on st6-rb2) | build | 
|---|---|---|
| countdown rAF callbacks | 108 | 4 (one per roll) |
| UpdateLayoutTree | 108 | 41 |
| main frames (BeginMainThreadFrame) | 118 | 50 |
| main frames per 400 ms, in a roll / outside | 19.4 / 4.2 | 4.5 / 6.0 |

The build's 41 recalcs are not the countdown: main frames come at the same rate inside and outside rolls. With the
accent cycle running (`--pause-others 1`, the cycle restarts its animations from script), main frames are ~47/s in
both arms, so the countdown's per-frame recalcs mostly rode along with frames that happen anyway: UpdateLayoutTree
186 → 195 per 4 s (noise); the gain there is the 104 rAF callbacks and their per-frame script.

Roll composited in Chrome: OBSERVED, in our setup, cause unknown (no added main frames during rolls). The trace
recorded no compositing decision for the strip animations at all (`composited` 0, `compositeFailed` 0,
`noDecision` 4 in `comp-check-build-p2.json`): "no decision recorded", not "no failure".

WebKit, iOS Simulator (counts only, never times; F-084), hero at y 0, 4 s windows, 2 reps, `sim-counts.mjs`:


| per 4 s at y 0 (rep 0 / rep 1) | base, others frozen | build, others frozen | base, all running | build, all running |
|---|---|---|---|---|
| countdown rAF callbacks | 107 / 110 | 4 / 5 | 108 / 105 | 6 / 4 |
| RenderingFrame | 111 / 114 | 55 / 57 | 214 / 204 | 207 / 197 |
| RecalculateStyles | 120 / 124 | 54 / 57 | 222 / 213 | 220 / 209 |
| Layout / Paint | 8 / 18, 10 / 24 | 8 / 18, 9 / 23 | 156 / 175, 145 / 164 | 158 / 177, 149 / 167 |
| hero samples with a running strip animation (of ~30) / max at once | 0 / 0 | 14 / 2 | 0 | (not sampled on the hero in that run) |

Raw: `out/cd-roll-ca/sim-counts-2026-10-03T01-28-51-062Z.json` (frozen), `…01-15-28-407Z.json` (all running). With
the rest frozen, the build halves WebKit's rendering updates at the top of the page (the roll no longer asks for a
rendering update per frame); with everything running, other animations ask for one anyway and only the rAF
callbacks and their script go. Running strip animations ≈ half the samples, at most 2 at once: one animation per
rolling digit. That WebKit runs them as Core Animation animations rests on the brief's CONFIRMED
`KeyframeEffect::canBeAccelerated` reading (keyword `linear`, transform only); the halved rendering updates agree.

## strip-tc (C8/V9): roll end and session A (round 4; OBSERVED, in our setup)

**Roll end (review round 4 check: no one-frame jump when the animations are cancelled).** A = every hero roll paused
at its own end (fill both: the last keyframe), A2 = the same again (noise floor), B = after `finish()` → `onfinish` →
`__crStop` → `cancel()`, i.e. cd-strip's inline rest transform. Plus, per animated cell, |last keyframe − inline
`style.transform`| in px.

| | rolls / digit rolls / cells | last keyframe vs inline | anims left | A vs B | A vs A2 | rects A vs B |
|---|---|---|---|---|---|---|
| Chrome (`end-check.mjs`, headless 430x932 DPR 3; 4 natural, 4 forced multi-digit) | 8 / 18 / 77 | 0 px | 0 | 7 of 8 identical; 1: 4 px, delta 1 | same roll: 4 px, delta 1 | 0 px |
| Chrome T-034, c = 31 (375x812 DPR 3), `end-check-V9-c375.json` | 6 / 12 / - | 0 px | 0 | 6 of 6 identical | 0 | 0 px |
| Chrome T-034, c = 52 (1440x900 DPR 1 desktop), `end-check-V9-c1440.json` | 6 / 11 / - | 0 px | 0 | 5 of 6 identical; 1 (natural): 3 px, delta 1 | 0 | 0 px |
| Chrome T-034, live resize mid-roll 430→375 (c 36→31), `end-check-V9-rs430to375.json` | 6 / 14 / - | 0 px | 0 | 6 of 6 identical | 0 | 1 roll 0.217 px, pixels identical; others 0 |
| Chrome T-034, live resize mid-roll 375→1440 (c 31→52), `end-check-V9-rs375to1440.json` | 6 / 13 / - | 0 px | 0 | 3 of 6 identical; 3: 87 px, delta 2 | 2 of the same 3: 87 px, delta 2 | 0 px |
| Simulator wrap (simpx, fade50, frozen clock) | 1 / 2 / 15 | 0 px | 0 | 73 px, delta 1 | 42 px, delta 1 | 0 px |
| Simulator wrapUp | 1 / 2 / 15 | 0 px | 0 | 0 px | 42 px, delta 1 | 0 px |

The Simulator wrap pair's 73 px: 42 are the A/A spot (css x 260-299 from the timer's left, the same 42 px in C8 vs
C8-again), 31 lie at css x 160-209, on digits that had no animation in that pair (only the seconds rolled), so not at
a cancelled cell; the same 1-shade A/A class. No jump at the roll end in either engine: the last keyframe and the
rest transform are the same number, and the frames before and after the cancel match within the A/A noise.

**T-034 (other cell sizes, and a live resize mid-roll; Chrome, V9 served `582d120c…`, 2026-10-04, shared lane).**
`end-check.mjs --vp` / `--resize`. A resize mid-roll restarts the roll's animations for the new cell height,
continuing in place.
- Restarts: 79 and 71 animations compared. The keyframes scaled to the new height within 0.001 px, no startTime
  changed, 0 unmatched.
- Last keyframe = inline rest at every size: 0 px.
- At 375→1440, the 87 px delta-2 difference is in the A/A of the same roll in 2 of 3 cases. It is the A/A class at that
  size, not the cancel.
- At 430→375, one forced roll has a cell rect 0.217 px off between A and B, while its pixels are identical (0 differ).
  OBSERVED, cause unknown. The likely place is a cell outside the clip, but I did not check that.

**Session A on C8/V9** (`out/cd-roll-ca/simpx/simpx-2026-10-03T10-33-01-524Z.json`; fade50, wrap + wrapUp, 90 shots per
arm, then C8 again). The Simulator did not settle (I-082: background 115 % of a core at the start, `FW_SIM_SETTLE_SEC=30`,
load1 up to 81-91): the frozen frames don't depend on it, the Timeline windows and the rate check do.

| | A/A (C8 vs C8 again) | V9 vs C8 |
|---|---|---|
| shots differing | 28 of 90, max delta 1 | 90 of 90; max delta 5 (wrap), 6 (wrapUp); 1 at rest |
| digit place (state) | 0 | ≤ 0.017 px |
| cell rects (getBoundingClientRect) | 0 | ≤ 0.01636 px (1 shot ≥ 1/64), 0 unmatched |
| shared startTime | | 79 / 79 digit rolls |
| layers at rest / rest + 2 s | 14 backed, 0.329 MB | 14 backed, 0.329 MB (both) |
| layers mid-roll | wrap 14 / 0.329, wrapUp 15 / 0.352 | equal; reason `animation` on the rolling cells only |
| paused scene | will-change auto, 0 animations, 0 backed | the same |

- The pixel deltas are the path's interpolation offset on the rolling digits (as on strip-rw: 87 of 90, max 5); at
  rest max 1.
- Rects include transforms; on tc the roll writes no `top`, so the rect difference is that same interpolation offset
  (offline bound 0.0189 px), not layout. The one shot at 0.01636 px is over 1/64 px for that reason; on strip-rw the
  check stood for the top/wrapper cancel and stayed ≤ 0.0151 px.
- The extra backed cell at rest seen on strip-rw (2 of 4 runs) did not show on tc (V9 = C8 at rest and 2 s later,
  1 run); cd-strip's own strip-tc census once had a transient +1 with no cd-roll-ca at all. Not a cost line on tc so
  far.
- Timeline, V9 paused vs running at rate 1e-6, mid-roll: recalcs 53 vs 50 (wrap), 53 vs 52 (wrapUp): no added recalc
  while the compositor runs the roll.
- Rate cross-check: 0.001 matched (max delta 1 at 0.45 of the bracket); rate 1 inconclusive (brackets of 305-311 ms
  under the load, best max delta 121): to repeat in a quiet Simulator.

**Session B1 on C8/V9** (`out/cd-roll-ca/simpx/simpx-2026-10-03T10-54-38-590Z.json`; fade50, carry + two, 98 shots per
arm, A/A; no rate check; Sim background mean 42 %, load1 up to 72):

| | A/A | V9 vs C8 |
|---|---|---|
| shots differing | 48 of 98, max delta 1 | 94 of 98; max delta 6 (carry), 5 (two); at rest ≤ 1 |
| digit place / rects | 0 / 0 | ≤ 0.017 px / ≤ 0.01648 px (1 shot ≥ 1/64, the interpolation offset), 0 unmatched |
| shared startTime | | 103 / 103 |
| layers rest, rest + 2 s, mid-roll | 14 / 0.329 MB; carry mid 15 / 0.352 | equal in every census |
| roll end (A vs B) | | carry 73 px delta 1 (A vs A2 0); two 0 px; last keyframe vs inline 0 px, 0 left, rects 0 |

The Sim end pairs that differ (wrap in A, carry in B1) show the very same 73 px: 42 at css x 260-299 and 31 at
x 160-209 from the timer's left. Both spots toggle in the unchanged page too: C8 vs C8-again has the 260-299 spot in
most frames and the exact 31-px 160-209 pattern in 1 of 49 (B1) and 2 of 45 (A) frame pairs. A 1-shade toggle of the
page itself, not the cancel (OBSERVED, Simulator).

**Parked** by the lead after B1 (user order: fixes 1-3 first; the Simulator queue is their bottleneck). Resumed
2026-10-04 on the landed cd-strip base (C8 = main's strip-tc, 5d1ca102) under the less-work rule (lead): B2, C,
sim-counts, sim-hide, reduced motion, the Chrome hold, then review round 4. Results below.

### Resumed list on C8/V9 (2026-10-04; OBSERVED, in our setup)

All Simulator parts ran as functional sessions in the shared lane (weight simulator), counts and frozen frames only.

**Session B2** (`out/cd-roll-ca/simpx/simpx-2026-10-04T03-21-10-943Z.json`; fade50, step, 24 shots per arm, A/A; the
Simulator settled after 23 s, background mean 42 %):

| | A/A (C8 vs C8 again) | V9 vs C8 |
|---|---|---|
| shots differing | 8 of 24, max delta 1 | 21 of 24, max delta 6 (shade histogram 1:9, 2:4, 3:4, 5:2, 6:2 shots) |
| digit place (state) / cell rects | 0 / 0 | ≤ 0.013 px / ≤ 0.01355 px (0 over 1/64), 0 unmatched |
| largest differing area | 73 device px | 353 device px (≈ 39 CSS px), inside the rolling digit |
| shared startTime | | 11 / 11 |
| layers | 14 backed, 0.329 MB | the same (rest, rest + 2 s, mid-step) |
| roll end (A vs B) | | 0 px |

**Session C** (`out/cd-roll-ca/simpx/simpx-2026-10-04T03-26-27-409Z.json`; the hero pass, wrap + carry, 92 shots per
arm, A/A; Simulator background mean 3 %, quiet):

| | A/A | V9 vs C8 |
|---|---|---|
| shots differing | **0 of 92 (exact)** | 84 of 92, max delta 9 (18 shots reach 9) |
| digit place / cell rects | 0 / 0 | ≤ 0.015 px / ≤ 0.01505 px (0 over 1/64), 0 unmatched |
| largest differing area | 0 | 1,491 device px (≈ 166 CSS px; bounding box of every rolling digit ≤ 3,870 CSS px) |
| shared startTime | | 98 / 98 |
| roll end (A vs B), wrap / carry | | 0 px / 0 px |
| layers at rest / rest + 2 s | 14 backed, 0.329 MB | **15 backed, 0.352 MB** (digit 5 cell 6, `stacking,willChange`) |

**Rate 1** (`out/cd-roll-ca/simpx/simpx-2026-10-04T03-42-38-135Z.json`, V9 only, fade50 step, background mean 9 %): the
frame shot while the roll runs at rate 1 matches a paused frame of the same roll inside its time bracket exactly (0 px,
at 0.70 of a 400 ms bracket), and within delta 1 (64 px, at 0.51 of a 244 ms bracket) in the second pair. The
compositor plays the roll's own path. The brackets are wide, so this says nothing about timing within ~0.25-0.4 s.
Session A's rate-1 check (inconclusive under load) is replaced by this one.

**The five pixel numbers (PR-010, `memory/illusion-must-be-pixel-identical.md`), Simulator, B2 + C:**
- Largest shade: 9 (of 255), mid-roll only.
- Share of the screen beyond A/A: at most 1,491 differing device pixels of 3.6 M, i.e. ≤ 0.041 %, counting every
  differing pixel (an upper bound for the > 8 count).
- Area: ≤ 166 CSS px per frame, on the rolling digits.
- Edge or fill: edge. The anti-aliased glyph edges of digits ≤ 0.015 px from C8's place.
- Static or moving: moving only. At rest V9 = C8 (0 px in every rest and end pair).

What this is: the sub-pixel offset of the path's interpolation. It sits inside the user's position rule (T-030,
"Position identity" below).

**Tier: T2** (lead ruling 2026-10-04, `memory/illusion-must-be-pixel-identical.md`). The T2 wide numbers are fill 64,
edge 128 and 0.5 % of the screen, with a Chrome and a Simulator A/A. V9 stays inside them:
- Largest shade: 9, an edge difference, under the edge limit of 128 (and the fill limit of 64).
- Share of the screen: ≤ 0.041 %, under 0.5 %.

The A/A evidence:
- Simulator: B2's A/A has 8 of 24 shots at delta 1; C's A/A is exact, 0 of 92. Files: `simpx-2026-10-04T03-21-10-943Z.json`,
  `simpx-2026-10-04T03-26-27-409Z.json`.
- Chrome: the reduced-motion runs RM1/RM2 have an A/A of 0 of 428 and 2 of 105 shots, max delta 1 (below). The
  roll-end check's A/A is 1 of 8 rolls at delta 1 (`end-check-V9.json`). The T-034 runs' A/A is 0 at c 31, c 52 and
  430→375, and 87 px at delta 2 at 375→1440.

Reduced motion (exact required) is below.

**Simulator counts** (`out/cd-roll-ca/sim-counts-2026-10-04T04-01-00-187Z.json`; hero at y 0, 4 s windows, others
frozen, 2 reps, 4 digit rolls per window; background mean 10 %):

| per 4 s (rep 0 / rep 1) | C8 | V9 |
|---|---|---|
| countdown rAF callbacks | 146 / 132 | **4 / 4** |
| RenderingFrame | 132 / 121 | 49 / 58 |
| RecalculateStyles (frames with one) | 136 (124) / 130 (113) | 51 (34) / 57 (40) |
| Layout / Paint | 8 / 30, 9 / 28 | 8 / 22, 10 / 28 |
| clock-sized paints | 25 / 18 | 17 / 18 |
| per digit roll: countdown rAF, frames with recalc | 36.5, 31 / 33, 28 | 1, 8.5 / 1, 10 |
| hero census at rest: layers, backed, MB | 96, 16, 0.376 (both) | 96, **17, 0.399** (both) |
| ~150 ms into a roll | 96, 16, 0.376 | 96, **18, 0.423** (both) |
| ~150 ms into a long roll (a digit change of ≥ 5) | 96, 16, 0.376 | 96, **22, 0.517 / 31, 0.728** |

**Cost lines (OBSERVED, Simulator, cause unknown):**
- Memory, while a roll runs: every cell that a running animation moves can hold a backing store. In the long roll,
  V9 held 6 and 15 more than C8 (+0.14 / +0.35 MB) in the two reps. In a normal roll it held 2 more (+0.047 MB). The
  extra backing is held while the roll runs, which is at most 1 s per tick.
- At rest: one more backed cell than C8 (+0.023 MB) in 3 of 6 censuses on tc (session C; counts reps 0 and 1). It
  did not show in sessions A, B1, B2 or the rate run. Sessions A and B1 saw the same +1 at mid-roll in C8 itself.
- These are the only counts that are higher for V9. The work counts are all lower: countdown rAF callbacks go from
  132-146 to 4 per 4 s, and rendering updates from 121-132 to 49-58 with the rest of the page frozen.
- The simpx Timeline counts (1 s windows mid-roll) swing as much in C8 against itself as between the arms. Examples:
  hero carry frozen C8 50 against C8-again 61 frames; step 42 against 53. No claim is made from them.
  sim-counts is the count source.

**Reduced motion, exact (the T2 requirement), Simulator**
(`out/cd-roll-ca/simpx/simpx-2026-10-04T04-59-08-829Z.json`). Setup:
- The session ran with `--reduce-motion on`, and the page matched `prefers-reduced-motion: reduce` in all 3 arms (checked
  by the script; a mismatch throws).
- Hero pass, step + wrap + carry, 12 shots per arm, then C8 again. V9 was shot like C8.
- The Simulator background was busy (mean 81 %). The frozen frames don't depend on it.

| | A/A (C8 vs C8 again) | V9 vs C8 |
|---|---|---|
| shots differing | 0 of 12 | **0 of 12 (exact)** |
| digit place / rects / unmatched | 0 / 0 / 0 | 0 / 0 / 0 |
| hero animations (`getAnimations`, at the start and at every shot) | 0 | 0 |
| layers (rest, rest + 2 s, mid step/wrap/carry) | 14 backed, 0.329 MB | the same |

Under reduced motion V9 starts no animation and snaps, like the original.

**Reduced motion, Chrome** (`fixes/cd-roll-ca/pixels.mjs` with `RM=1`: `prefers-reduced-motion: reduce` emulated in
every arm, and the script throws if the page does not match it; 430x932 DPR 3, arms C8, V9, C8 again):

| run | scenes | shots per arm | A/A (C8 vs C8 again) | V9 vs C8 | positions (state, frames) |
|---|---|---|---|---|---|
| RM1 `out/cd-roll-ca/pixels-2026-10-04T05-42-49-483Z.json` | hero, panel (60/120 Hz) | 428 | 0 differ | 2 differ, max delta 1 | 0 differ (2,000 frames) |
| RM2 `out/cd-roll-ca/pixels-2026-10-04T05-56-38-918Z.json` | scrolled hero (fade 0.25/0.5), panel mid | 105 | 2 differ, max delta 1 | 2 differ, max delta 1 | 0 differ (1,200 frames) |

Every differing shot, in the A/A and in V9 vs C8, has the same pattern (diffed per pixel with a difference mask):
- It is in the panel clock only, never in the hero. V9's code runs only for the hero.
- The changed pixels are a regular checkerboard of ±1 steps on the panel's dark background around the digit cards:
  7,600-16,000 pixels per shot, in all three channels. Nothing changes inside the cards or on the glyphs.
- Which arm is the odd one varies. In RM1, V9's shot differs from both C8 shots (frames 0 and 2 of one page load).
  In RM2, C8's own shot is the odd one: its "one step down, frame 4" shot differs by the same 10,220 pixels from V9
  and from C8 again. The A/A pair differs in one more panel shot (fade 0.75, frame 30).

Reading (OBSERVED, in our setup, cause unknown): a 1-level dither flip of the panel background that hits any arm,
the control included. It looks like gradient dithering redrawn with another phase. That is a guess; I did not check it
against a reference. In Chrome, V9 under reduced motion differs from C8 only in the way C8 differs from itself:
4 of 533 shots against 2 of 533 for the A/A, all max delta 1, all this checkerboard. It never differs in the hero, in
positions or in any frame state. The Simulator half is exact (0 of 12, A/A 0).

**Lead ruling (2026-10-04):** this counts as exact against the control's A/A.
- The hero, the only part V9 changes, is byte-exact in Chrome: 0 shots differ.
- The panel is not called exact. It has ±1 background flips in any arm, the A/A included (OBSERVED, cause unknown;
  dither is a guess, not checked against a reference).
- The Simulator is exact (0 of 12).

## WebKit frames, layers and Timeline (round 4, Simulator; OBSERVED, Simulator, in our setup) (strip-rw, history)

`simpx.mjs` (this folder), fw-sim 15 Pro Max, iOS 18.7 Mobile Safari, shared lane, `sim.mjs session --functional`,
arms served from the snapshot copies (bodies hashed by the script). The page is frozen by a shim that makes the
countdown's `Date.now`, `performance.now`, `document.timeline.currentTime` and rAF virtual, so both arms are stepped
to the same virtual 60 Hz frames of the same roll. Per frame: C is drawn by its rAF spring at that frame; V is shown
**paused** at the same virtual time, then **running** at playback rate 1e-6 from it (the compositor drives it; n read
before and after the shot). Compared: the digits' state (n), every visible cell's rect relative to its digit, and the
pixels in the clock box; A/A on C gives the noise floor. Layer census (`LayerTree`, with compositing reasons),
Timeline counts per 1 s.

Debug runs on the strip-rw **dev** build (C5 `5e37af69…` vs V6 `73dff152…`, fade50 = the hero at its 50 % fade, the
9→0 wrap of the seconds' ones with the tens carrying; 46 shots per arm):

| | run 1 (`simpx-2026-10-03T05-38-01-209Z.json`) | run 2 (`…05-50-33-557Z.json`) |
|---|---|---|
| A/A C5 vs C5 | state 0, rects 0, max pixel delta 1 (18 of 46 shots) | (skipped) |
| V6 vs C5, state | ≤ 0.015 px | 0.002-0.015 px on rolling frames, 0 at rest |
| V6 vs C5, cell rects (all visible cells) | max 0.010 px | max 0.0151 px; 0 shots ≥ 1/64 px; 0 unmatched cells |
| V6 vs C5, pixels | frame 1: 236 px, max delta 4 | frame 1: 236 px (97 > 1), max 4, bbox css x 315.7-343.7, y 21.3-42.3 from the timer: the two rolling seconds digits; rolling frames max 2-5; rest frames max 1 |
| shared startTime per digit (VCHECK) | 4 / 4 | 39 / 39 rolls |
| layers, rest / mid paused / mid running | 84, 0.329 MB, 77 cell layers, 14 backed (same in C5) | same |
| compositing reasons of the rolling cells | | `animation,stacking,willChange` in V6 paused and running; never `animation` in C5 |
| Timeline per 1 s mid-roll, V6 paused / running 1e-6 | | RenderingFrame 49 / 50, RecalculateStyles 54 / 55, Layout 52 / 31, Paint 55 / 34, FireAnimationFrame 0 / 0 |

- Blank or late cells (the F-142 check): none. Every cell inside the clip has a matching rect in V (0 unmatched) in
  every paused and running shot, including the frames where cells cross the clip edge mid-roll, and the backed-layer
  count does not change mid-roll.
- LayoutUnit (lead: "on a high M (a 9…) the visible cell's position equals cd-strip's rest position to the
  LayoutUnit"): the wrap passes M = 9 → 0; max rect offset 0.0151 px < 1/64 px over all 46 shots. c is an integer
  here, so `top M*c` and the wrapper's `-M*c` cancel exactly.
- The pixel differences are the path's interpolation offset (≤ 0.019 px offline, 0.002-0.015 px measured) on
  antialiased glyph edges at fade50: a 0.015 px shift moving an edge pixel by 4-5 levels fits that contrast. It is
  V-only by construction (both arms share cd-strip's strip). cd-strip's own delta-1 glyph-edge class (seconds' ones,
  mid-roll at fade50) cancels in this V-vs-C comparison (on tc, the A/A per session is in "Resumed list on C8/V9").
- On the compositor at rate 1e-6 (OBSERVED, Simulator): running adds no recalc and no script per frame vs paused (54
  vs 55 recalcs per 1 s; 0 rAF), layers unchanged, reason `animation` present. The page recalcs in every frame in both
  arms (C5 frozen: 60 frames, 63 recalcs per 1 s), from other content, so "frames with a recalc" does not separate
  the arms; paused vs running does.
- Rate cross-check (does the compositor at a real rate draw what the main thread draws at some time inside the
  bracket of the shot): rate 1e-3: best paused match max delta 2 (A/A 1) at 0.39 of the bracket. Rate 1: not matched
  in run 2 (the shot took 304 ms, n moved 5.3 → 9.0; the search's finest step, 9.6 ms ≈ 4 px, missed the basin);
  PENDING run 3 with a search down to 0.05 ms. The one-frame CA lead stays UNRESOLVED.

Debug run 3 (`…06-36-24-336Z.json`), rate 1 with the finer search (9-point levels down to < 0.05 ms): two shots,
brackets 292 / 320 ms; best paused match max delta 4 (sum 770) and 1 (39 px, A/A level), at 0.51 / 0.53 of the
bracket. At a real rate the compositor draws what the main thread's timeline gives at a time inside the shot's read
bracket, near its middle; a ~300 ms bracket can't resolve a one-frame lead (UNRESOLVED, as before). Same run: one more
backed cell in V6 at rest (seconds' ones cell 2, 0.352 vs 0.329 MB); not repeated in session A below.

**First-build data** (counted session A on the old strip-rw hash C5 `5e37af69…` / V6 `73dff152…`; the counted set
was stopped after it because cd-strip changes its CSS in review round 2, `simpx-2026-10-03T06-47-53-243Z.json`), fade50,
wrap and wrapUp, 90 shots per arm:

| | A/A C5 vs C5 | V6 vs C5 |
|---|---|---|
| state / cell rects | 0 / 0 | ≤ 0.015 px / ≤ 0.0151 px, 0 ≥ 1/64, 0 unmatched |
| shots differing / max delta | 34 / 1 | 82 / 5 |
| in cd-strip's residual band (css x 361-374): shots > 1 (wrap, wrapUp), max | 0, 0 | 34, 34, max 5 |
| outside it: shots > 1, max | 0, 0 | 25, 32, max 5 (the other rolling digit) |
| layers rest / wrap mid / wrapUp mid | 14 / 14 / 15 backed (0.329 / 0.329 / 0.352 MB) | same (paused and running) |
| shared startTime | | 79 / 79 rolls |

The V-vs-C differences are V-only by construction (same strip in both arms) and come from the path's interpolation
offset; they are no larger inside cd-strip's band than outside it. cd-strip's own class is in both arms and cancels
(A/A max 1). The extra backed cell mid-wrapUp is in C5 too: not a V cost. Timeline per 1 s mid-roll swings within one
arm (C5 vs C5-again: 40 vs 28 frames on wrap), so only V paused vs running is read: no added recalc running, 0 rAF.

**Counted set, session A** on cd-strip's review-round-2 base (C6 = JS `5e37af69…` + CSS `40078cb2…`, patch
`1f3c26a1…`; V7 = JS `73dff152…` + the same CSS), `simpx-2026-10-03T07-10-10-961Z.json`, fade50, wrap and wrapUp, 90
shots per arm, plus the paused-scene census (`SIMPX_PAUSED=1`). Valid as long as cd-strip's base stays (its rev 2 is
open, lead 2026-10-03 ~07:10Z):

| | A/A C6 vs C6 | V7 vs C6 |
|---|---|---|
| state / cell rects | 0 / 0 | ≤ 0.015 px / ≤ 0.0151 px, 0 ≥ 1/64, 0 unmatched |
| shots differing / max delta | 36 / 1 | 87 / 5 (rolling digits only, as in session A on the old base) |
| shared startTime | | 79 / 79 rolls |
| layers rest | 14 backed, 0.329 MB | **15 backed, 0.352 MB** (seconds' ones cell 2) |
| layers wrap mid / wrapUp mid | 14 / 15 backed (0.329 / 0.352 MB) | same, paused and running |
| paused scene (y 2560, scene paused, render active, after a tick) | will-change auto, 0 cell animations, 0 backed cell layers, 0 MB | same |

- Paused scene: cd-strip's scene-pause rule (`.strip`/`.cell` will-change auto) unlayers V's cells as it does C's:
  the clock rolls only within 64 px of the viewport (countdown-idle-raf), else it snaps and `__crStop` cancels the
  animations; the scene pauses only beyond 100 % of the viewport. OBSERVED, Simulator.
- **Cost line (OBSERVED, Simulator):** one more backed cell at rest in V, +0.023 MB, in 2 of 4 runs (debug run 3, this
  session; not in debug run 2 or old-base session A), always seconds' ones cell 2, which the roll just handed back
  (census ~0.1 s after the roll was finished). Persistence not checked yet: the probe now takes a second rest census 2 s
  later (next session).

DONE on strip-tc 2026-10-04 (see "Resumed list on C8/V9", "Before / after" and T-034; Paint per window in sim-counts, not per roll). Was: carry, two, step at fade50 and a hero pass,
with A/A; sim-counts frozen, 2 reps; sim-hide C/V 3 cycles; Paint records per roll; Chrome comp-check C/V, h60,
hide-check, fix.mjs check; frozen-frame identity at the other cell sizes (T-034, de-breakpoints: c = 31 px at
width <= 400, 52 px on desktop): c375 touch DPR 3 and c1440 DPR 1 mid-roll, and a live resize across 400 mid-roll (the
roll re-keys from the new c at the same startTime; only 430 and the Sim's iPhone width are checked so far).

## Position identity (the user's rule: within the original's own frame-to-frame variation)

`roll-probe.mjs` records in Chrome, per rAF, the translateY Chrome computes for every strip (for a Web Animation this
is its value at the frame time, which the compositor samples too), and every roll's Animation; offline it runs the
ORIGINAL's spring (literal copy of `GE`) over the very same frame stamps, from the same change time and start value,
and reports |B − A| per frame in px (cell 36 px). Forced changes: `Date.now` jumps by random seconds at random times
plus a synthetic `visibilitychange`, so the countdown ticks at a random phase, often mid-roll, multi-digit.

| run | frames | B vs A: normal ticks max / p95 | forced (random phase) max / p95 | start value diff max | original's own stamp jitter (A on real stamps vs ideal 60 Hz) max / p95 |
|---|---|---|---|---|---|
| **final, V9 `582d120c…`** (on main's strip-tc), headless 60 Hz, 40 s, 16 jumps, seed 11, 79 rolls (`probe-build-h60-V9.json`, servedHash logged in `r5-chProbe.log`; base fit on C8 `6fa0e1e8…` `probe-base-h60-C8.json`: 22 rolls, 0 px) | 2406 | 0.067 / 0.014 px (vs ideal-60 Hz original 0.502 / 0.030) | 0.241 / 0.023 px (vs ideal-60 Hz original 0.227 / 0.027) | 0.012 px | ticks 0.44 / 0.026 px, forced 0.31 / 0.048 px |
| **round 4, V6 `73dff152…`** (cells-only on strip-rw dev), headless 60 Hz, 40 s, 16 jumps, seed 11 (`probe-build-h60-V6.json`, hold11; base fit on C5 `probe-base-h60-C5.json`: 22 rolls, 0 px) | 2405 | 0.254 / 0.017 px (vs ideal-60 Hz original 0.065) | 0.241 / 0.020 px (vs ideal-60 Hz original 0.211) | 0.017 px | ticks 0.27 px, forced 0.27 px |
| **round 3 build `2af461dc…`**, headless 60 Hz, 40 s, 16 jumps, seed 11 (`probe-build-h60e.json`, served hash in `hold7.log`) | 2405 | 0.236 / 0.021 px (vs ideal-60 Hz original 0.082 / 0.014) | 0.104 / 0.016 px (vs ideal-60 Hz original 0.222 / 0.033) | 0.016 px | ticks 0.32 / 0.029 px, forced 0.23 / 0.035 px |
| **round 2 build `673b110d…`**, headless 60 Hz, 40 s, 16 jumps, seed 11 (`probe-build-h60d.json`, served hash logged) | 2405 | 0.643 / 0.025 px (vs ideal-60 Hz original 0.152 / 0.014) | 0.295 / 0.020 px (vs ideal-60 Hz original 0.843 / 0.036) | 0.006 px | ticks 0.80 / 0.029 px, forced 0.55 / 0.043 px |
| **round 2 build**, headed, display 120 Hz, 30 s, 12 jumps (`probe-build-headed2.json`) | 3604 | 29.6 / 3.2 px | 21.5 / 4.0 px | 0.20 px | n/a |
| earlier build (before hero-only), headless 60 Hz, 40 s, 16 jumps (`probe-build-h60b.json`) | 2405 | 0.133 / 0.015 px | 0.145 / 0.021 px | 0.007 px | 0.61 / 0.026 px |
| round 1 build `9ac52b08…`, headless 60 Hz, 20 s, 8 jumps (`probe-build-h60c.json`) | 1203 | 0.026 / 0.016 px | 0.131 / 0.019 px | 0.014 px | 0.22 / 0.05 px (forced) |
| before the first-frame fix (`probe-build-h60.json`) | 2403 | 0.45 / 0.019 px | 4.51 / 0.056 px | 0.098 px | 0.61 / 0.027 px |
| earlier build (before hero-only), headed, display 120 Hz, 30 s, 12 jumps (`probe-build-headed.json`) | 3603 | 27.7 / 2.5 px | 26.7 / 4.1 px | 0.28 px | n/a |

- The model is validated on the base page: the offline chain reproduces the original's own per-frame values within
  0.0005 px (60 Hz, 11 rolls) and 0.0008 px (120 Hz, 16 rolls) (`probe-base-h60.json`, `probe-base-headed.json`).
- At 60 Hz, on normal ticks (the clock's own 1 s ticks, 1087 frames), the build is within 0.15 px of the original's
  ideal 60 Hz frames, and within 0.64 px of the original run on the very same (jittery) frame stamps, while the
  original itself moves by up to 0.80 px between those two (0.61 px in the earlier run) from frame-stamp jitter alone:
  inside its own frame-to-frame variation. On forced rolls (a change at a random phase, often mid-roll, 1370 frames;
  the clock never does this by itself, only `Date.now` jumps and a show do) the build is up to 0.84 px off the ideal
  60 Hz original (p95 0.036, p99 0.139 px; `errVsIdeal60ForcedPx`) but within 0.30 px of the original on the same
  stamps; the original's own forced-roll jitter, same stamps vs ideal, is 0.55 px (`origJitterForcedPx`). Round 3
  (`h60e`, the final build) touches only the hidden-page clock: normal ticks 0.08 px vs ideal and 0.24 px on the same
  stamps (its own jitter 0.32 px this run), forced 0.22 / 0.10 px (own 0.23 px). The round 2
  rows are the build before; the "earlier build" rows predate the hero-only gate and the round 2 change (no change to
  the hero's path between them). Scope (OBSERVED, Chrome,
  regular 60 Hz frames at CPU 1x): the 0.61 px is the original's variation on regular frames only. Off that regime
  the original moves much more by itself: at 80 Hz it is 2.7 px (one step) / 24.7 px (0→9) off its 60 Hz path, and a
  late first frame (first rAF 24.5 ms after the change) puts it 2.0 px / 18 px off its regular path (offline model of
  `GE`, review-cd-roll-ca round 1; OBSERVED, modelled, not measured on a device). In those cases the build still plays
  the regular 60 Hz path, so it differs from the original by about those amounts.
- At 120 Hz the build still shows the 60 Hz path; the original at 120 Hz differs from its own 60 Hz path by up to
  3.3 px (one step) and 29.5 px (0→9, offline model), and the build vs the original at 120 Hz measured 27.7 px max,
  p95 2.5 px. This is the known, user-accepted difference (T-030).
- What rate the phone renders at: CONFIRMED only that WebKit asks for a 60 Hz display link as a hint
  (CLAUDE.md, pref PreferPageRenderingUpdatesNear60FPSEnabled, preferredFramesPerSecond=60; claims-audit §2.7); Core
  Animation picks the actual rate. Idle and scripted phone runs show 16-17 ms gaps (OBSERVED), and finger runs show
  ~80 Hz stretches (F-071, trigger UNRESOLVED). The blind test watches the clock at rest with no touch, the idle case,
  so the phone most likely shows the 60 Hz path there; that is OBSERVED for idle runs, not CONFIRMED.
- UNRESOLVED: WebKit samples a Core Animation animation at the display's presentation time, the original's value
  comes from the rAF stamp; that could add a constant lead of up to one frame on the phone. Decisive check: a phone
  frame capture of a roll (not run: no phone use in this task).

## Hidden tab, for real (review round 1, B1)

`hide-check.mjs`, headed Chrome 154, plain-http snapshot servers, shared lane: the page's tab is hidden for ~3 s by
activating a second tab in its window (`document.hidden` true, `visibilityState` "hidden", 0 frames while hidden), 4
times at different tick phases, 2 of them mid-roll. Pending rAF callbacks are counted by wrapping
`requestAnimationFrame`/`cancelAnimationFrame` (the logger's own rAF is not counted). Original model at the show: no
frame runs while hidden, so the original starts every roll in the gap from the value of the last frame before the
hide, and its first callback after the show steps `GE(firstFrame − change)` at once. Raw: `out/cd-roll-ca/hide-{C,V0,V}.json`
(re-analysed with `hide-check.mjs --analyze`, which copies the raw `log` verbatim). Served bodies: these JSONs predate
the `servedHash` field; the hashes are in the same hold's log, `out/cd-roll-ca/hold5.log` lines 17-18 (`serve-snap.sh`:
C JS `358cd8ae16b9…`, V JS `673b110d118c…`, CSS `ce6beca745a0…` both, `x-mirror-source: overlay`); V0 was served from
`out/cd-roll-ca/v0`, JS sha256 `9ac52b08bc32…` (shasum of the file). `hide-check.mjs` now writes `servedHash` itself.

| arm (served JS) | pending rAF callbacks while hidden, max | at the show | rolls in the gap: start value vs held, max | first frame after the show vs the original's spring, max | errors |
|---|---|---|---|---|---|
| C, cd-strip (`358cd8ae…`) | 2 | 2 | (rAF spring) | (is the original) | 0 |
| V0, round 1 (`9ac52b08…`) | 3 (= hidden ticks) | 4 | 0.40 px | 3.29 px | 0 |
| V, round 2 (`673b110d…`) | 2 | 2 | 0.000 px | 0.27 px | 0 |
| **V3, round 3 (`2af461dc…`)**, `hide-V3.json` (servedHash in the file; `hold7.log`) | 3 | 3 | 0.000 px | 0.21 px | 0 |
| **V6, round 4 (`73dff152…`, cells-only on strip-rw dev)**, `hide-V6.json` (hold11), 13 hidden rolls | 3 | 3 | 0.000 px | 0.008 px | 0 |
| **V9, final (`582d120c…`, on strip-tc)**, `hide-V9.json` (servedHash in the file; 2026-10-04 shared lane), 4 cycles, 0 frames while hidden, 14 hidden rolls | 3 | 3 | 0.000 px | 0.012 px | 0 |

- V0 kept one more pending callback per hidden tick (3 ticks in 3 s here), each holding its path and Animation, so a
  tab left hidden for hours would pile them up at whatever rate Chrome lets the 1 s interval run in the background
  (the reviewer's reading: 1/s, then about 1/min after 5 min; not checked here). V keeps at most one per rolling
  digit, like C.
- V0 took the hide time from `performance.now()` at the event, later than the last frame, so a roll that was running
  at the hide restarted 0.40 px off and showed 3.29 px off at the first frame after the show; with
  `document.timeline.currentTime` (V) both match: 0 px and ≤ 0.27 px (the show tick and the hidden ticks alike).
- Audit of the first analysis (review round 2, nit 1). The hold5 run's own summary (`hold5.log` lines 23-24) reported
  the first frame after the show 108 px (V0) and 247.918 px (V) off the original. That was a bug in the analysis, not
  in the build: per digit it compared the first frame after the show with the last roll started *while hidden*
  (`now < show event`). But the countdown also ticks on the show's own `visibilitychange` (the show tick), which
  starts a roll after the show event and before the first frame; the analysis ignored that roll and modelled the
  stale hidden roll instead, ~0.8-0.9 s old and long settled at its target. Example, V cycle 1, digit 7: show event at
  21308.9 ms, show-tick roll at 21312.6 ms (to −288 px), first frame callback at 21316.2 ms showing −76.082 px; the
  first analysis took the hidden roll of 20425.0 ms (to −324 px, dt 895 ms, settled) and reported |−76.082 − (−324)| =
  247.918 px. The same mistake gave V cycle 2 107.341 px, V0 cycle 1 105.278 px and V0 cycle 2 108 px. The second
  analysis takes, per digit, the latest roll started before the first frame's callback (`now <= firstFrame.cb`), i.e.
  the roll whose value that frame shows; it matches the show-tick rolls to 0-0.009 px. The rows where both analyses
  pick the same hidden roll agree exactly (V 0.091 / 0 / 0.274 px; V0 0.125 / 3.293 px); V0's 3.293 px is its
  `performance.now()` hide time (above). Both analyses run on the same raw samples: `hide-audit.mjs` reruns the old
  and the new selection on the saved `hide-V0.json` / `hide-V.json` and prints 108 / 247.918 (first) and 3.293 /
  0.274 px (second) per arm, row by row.
- Round 3 (V3: the per-roll `ran` flag and the hide watch `__crWatch`, below) keeps Chrome's numbers: 0 px at the
  gap-roll start, ≤ 0.21 px at the first frame after the show, 4 cycles (2 mid-roll), 0 frames while hidden, 0 errors.
  The pending count is one more than V because the watch itself is one pending callback (3 = 2 rolling digits + the
  watch; it is re-armed, never added, on every `visibilitychange`, so it can't pile up). In Chrome the first frame
  after a hide comes after the visible event, so the watch changes nothing there.
- OBSERVED, Chrome, in our setup. WebKit: see the Simulator row below.

### WebKit, iOS Simulator (OBSERVED, Simulator, counts and positions only)

`sim-hide.mjs`, fw-sim 15 Pro Max, iOS 18.7 Mobile Safari, shared lane, `sim.mjs session --functional`, arms served
from the snapshot copies (served bodies hashed by the script: C JS `358cd8ae…`, V JS `673b110d…`, CSS `ce6beca7…`
both). Hide: Safari to the background by launching Settings (`simctl launch`), back by launching Safari, 3 cycles per
arm (hidden 7.4-9.3 s; `document.hidden` true, `visibilityState` "hidden" each time), page at y 0. Raw:
`out/cd-roll-ca/sim-hide-2026-10-03T02-34-50-700Z.json`; event timing per cycle: `sim-gaps.mjs` on it.

| arm | pending rAF while hidden, max | at the show | hidden ticks (rolls) | timers while hidden | gap rolls: start vs the original's held value, max | first frame after the show vs the original | errors |
|---|---|---|---|---|---|---|---|
| C | 2 | 2 | (rAF spring) | yes, ~1 Hz sampler, ticks every ~2 s | (is the original) | (is the original) | 0 |
| V `673b110d…` | 3 (one per rolling digit: 3 digits rolled at the hide) | ≤ 3 | 14 | same | 19.3 / 23.8 px (2 cycles), 3.9 px (1) | 8.4 / 11.7 px, and 1 skipped roll (16.3 px) | 0 |

Same as Chrome: no pile-up of pending callbacks (V stays at one per rolling digit over 5 hidden ticks per cycle; C 2),
0 errors, ticks go on while hidden (~every 2 s here). Different from Chrome, in WebKit's event order around the hide
and the show (all 6 cycles, both arms):
- rAF callbacks stop 365-545 ms *before* `visibilitychange` (hidden) fires, while `document.timeline.currentTime` read
  in that event is only ~47-53 ms before it (318-492 ms after the last rAF frame). The original holds the value of
  its last rAF frame; the build holds its path at `document.timeline.currentTime`. A roll that starts in that window
  (no frame of it ran for the original) is held 46-63 ms into its path by the build, at its start by the original:
  19.3 and 23.8 px (V cycles 1, 2); a roll whose first frames ran before the stop is held 3.9 px apart (cycle 0).
- In 4 of 6 cycles one frame runs 25-31 ms *before* `visibilitychange` (visible) fires. The original's pending
  spring callback runs in it; the build's `__crNoFrames` stays set until a rAF after the visible event. In V cycle 0
  that frame settled the last hidden roll (both show −36 px), then the show tick changed the digit 1 → 0: the
  original rolls −36 → 0 (−16.3 px at the next frame), the build reads its hidden roll at its start (0 = the new
  target) and snaps to 0 without a roll. (`sim-hide.mjs`'s own first-frame column says 36 px there: it models only
  ticks that started an animation and has no pre-event frame, so that cell is not valid on WebKit; the 8.4 / 11.7 px
  of cycles 1 and 2 are, show-tick rolls with dt 43 / 38 ms.)
- What the user saw with round 2: only on return from another app, the first ~0.4 s of the clock's roll started up to
  ~24 px (2/3 of a cell) off the original, or one digit snapped instead of rolling. Fixed in round 3 (next).

**Round 3 (`2af461dc…`, the lead's order: fold the fix in).** (a) The one-shot start-frame rAF sets the roll's `ran`
flag (also when its stamp is not before `t0`); a roll whose start frame has not run reads its clock at `t0`, i.e. holds
at its start, like the original whose spring has not stepped. (b) `__crWatch`: on every `visibilitychange` one rAF is
requested (the previous request cancelled, its id kept, so hides never stack callbacks); if that frame runs while
`document.hidden` is still true (WebKit's pre-visible frame) it records the frame stamp as the hold time and re-arms,
otherwise it ends `__crNoFrames`. The guard is on the frame having run, not on the event. Same Simulator, same script
with a new analysis (`chain`, below), C and V3, 3 cycles each (hidden 7.2-9.3 s), raw
`out/cd-roll-ca/sim-hide-2026-10-03T03-02-24-452Z.json` (served bodies hashed: C JS `358cd8ae…`, V3 JS `2af461dc…`, CSS
`ce6beca7…` both), 0 errors in both arms.

| arm | pending rAF while hidden, max | at the show | target changes (rolls + snaps) / frames | tick start: original's value vs the build's roll start, max (visible / hidden / first 1 s after the show) | frame-wise, first 1 s after the show, max | errors |
|---|---|---|---|---|---|---|
| C | 3 | 1 | (rAF spring) | (is the original) | (is the original) | 0 |
| V3 `2af461dc…` | 4 (3 rolling digits + the watch) | 1 | 36 / 829 | 1.39 / 1.39 / 0 px | 2.02 px | 0 |

- The `chain` model (`sim-hide.mjs`, re-run offline with `--analyze`): from the first frame where every digit is
  settled it replays the original over the logged frames exactly as the bundle does: every change of a digit's target
  (seen by a MutationObserver on the strip's inline style, which also catches snaps) restarts `GE` from the current
  value with velocity 0, and each logged frame steps it; the build's value is the strip's computed transform at the
  same frame. It replaces the round-2 per-cycle columns: their 1.33 / 36 px for V3 are that old model (no pre-visible
  frame, no snaps), not valid on WebKit; the script now files them under `summary.perCycleModelNotValidOnWebKit`.
- Event order unchanged (all 6 cycles): rAF stops 382-528 ms before the hidden event, `document.timeline.currentTime`
  in it is 331-471 ms after the last frame; one frame runs 28-63 ms before the visible event, now in every cycle.
- The 19-24 px gap-roll starts are gone (a) and the show-tick snap is gone (b): after the show the build rolls on
  every tick, max 2.02 px off the original over the first second (round 2, table above, older per-cycle model: 8.4 / 11.7 px and a 16.3 px skipped roll).
- **Residual (OBSERVED, Simulator):** a roll whose first frames ran before WebKit stopped rAF is held by the build at
  `document.timeline.currentTime` of the hidden event, by the original at its last frame, ~0.33-0.47 s earlier. Here:
  0.876 px (cycle 0) and 1.39 px (cycle 1) at every hidden tick of that cycle; on the show the build snaps those 0.9 /
  1.4 px to the target (counted as 3 "snaps", 2 of them with a distance, `missedRolls` 2) where the original rolls
  them. Bound: at most the part of a roll that plays in that 0.3-0.5 s window (round 2 had one at 3.9 px). It can't
  be closed without a per-frame script (the build would have to know the last frame before rAF stopped, which only a
  rAF running every frame can know); the reviewer agreed to document it.
- Not hide-related, seen by the same model (OBSERVED, Simulator, in our setup, cause unknown): frame-wise in normal
  visible rolls the build is up to 23.2 px off the model in the fastest part of a 0→9 roll (`worstVisible`, 13.4 / 9.9
  px on the next frames; 29 px in round 2's log). Read with `getComputedStyle` in the rAF callback, WebKit's value of
  a Core Animation transform runs 0.5-5.5 ms ahead of the rAF stamp (median 1.5 ms, p90 4 ms, n 56 rolls): the
  computed style is sampled at a later time than the stamp the model uses. This is the UNRESOLVED presentation-time
  item in "Position identity" seen from the main thread; it is no position error of the hide code.
- OBSERVED in the Simulator, in our setup, cause unknown; the event order on the iPhone was not checked (no phone in
  this task). References not checked yet: WebKit's rAF throttling and `DocumentTimeline` update while the page goes
  to the background (UNRESOLVED; decisive local check: the same script on the phone with the `iphone` lease).

**On tc, C8 vs V9 (2026-10-04).** Raw: `out/cd-roll-ca/sim-hide-2026-10-04T04-15-29-333Z.json`. Served bodies were
hashed by the script: C8 JS `6fa0e1e8a221…`, V9 JS `582d120c9f8f…`. 3 cycles per arm, hidden 7.0-9.4 s each. The
Simulator background was busy: mean 53 %, max 159 % of a core, 3 windows over 60 %.

| arm | pending rAF while hidden, max | at the show | target changes / frames | tick start vs the original, max (visible / hidden / first 1 s after the show) | frame-wise, first 1 s after the show, max | snaps / missed rolls | errors |
|---|---|---|---|---|---|---|---|
| C8 | 3 | 1 | (rAF spring) | (is the original) | (is the original) | | 0 |
| V9 | 4 (rolling digits + the watch) | 2 | 37 / 808 | 0 / 57.48 / 0 px | 28.73 px (one frame; the next ones 9.3, 3.9 px) | 2 / 0 | 0 |

- No pile-up, 0 errors, 0 missed rolls, and every tick start while visible and after the show is at the original's
  value (0 px).
- The 57.48 px while hidden is the documented residual above, in its largest form so far. A 0→9 roll (digit 7, at
  8751 ms) was in its fast part when WebKit stopped rAF: the last frame was at 8850 ms, and the hidden event came at
  9255 ms. The original holds its last frame (−266.4 px). The build holds `document.timeline.currentTime` of the hidden
  event (the roll's end, −323.9 px). It sits within the stated bound: the part of a roll that plays in the 0.3-0.5 s
  window. Round 3 met it at 0.9 / 1.4 px, round 2 at 3.9 px. On the show, the next tick starts at the original's value.
- The frame-wise numbers belong to the item that is "not hide-related" above. They come from the first frames of the
  0→9 roll, the fastest roll there is (round 3's V3 log: 0 → −112 px in 17 ms):
  - V9's first frame of that roll reads 20-29 px ahead of the model, 7-8 ms after the tick, at 18670 and 48678 ms. That
    is ≈ 4-5 ms of the roll, inside the 0.5-5.5 ms by which WebKit's computed value of a Core Animation transform runs
    ahead of the rAF stamp.
  - One frame reads 138.8 px ahead (at 8761 ms, the first 0→9 roll after the load). A 53 ms frame gap follows it, so
    the main thread was busy there, in a busy Simulator.
  - The positions themselves match the original at the same animation time: sessions C and B2 above froze the same
    rolls with the animations paused and found ≤ 0.015 px.
  - OBSERVED, Simulator, cause unknown. It is the UNRESOLVED presentation-time item; a read that comes after main-thread
    work samples a later time than its stamp.

## Cards (protocol v2)

```
CENSUS cd-roll-ca · base cd-strip(b) on st6-rb2, JS 358cd8ae16b9… · 2026-10-03
chrome: comp-check y 0, 4 s, others frozen: countdown rAF 108 / 4 s, UpdateLayoutTree 108, main frames 118
webkit sim: countdown rAF 105-108 / 4 s (raw out/cd-roll-ca/sim-counts-*.json)
cluster: not a frame cluster; a constant 1 Hz cost (≈30 rAF/s for ~0.5 s of every second) at every position where
a clock is active (hero at the top, panel at the morph)
```

```
EVENT cd-roll-ca · trigger: cD's 1 s setInterval (and visibilitychange) → $E effect on target change
code: $E spring effect (rAF loop calling GE), JS ~4120-4160 overlay (baseline 3828-3841); strip transform write
per frame via __cdStripY (cd-strip)
```

```
ATTRIBUTION cd-roll-ca · verdict NAMED (fast path)
1 stage: script (rAF callbacks) + style (per-frame inline transform write)
2 code: $E rAF spring at 2.DyWL8TcE.js (baseline 3828-3841)
fast path: "countdown rAF callbacks 108 → 4 per 4 s (one per roll), by code ($E effect)"; Chrome and WebKit Sim
5 platform claims: easing keyword 'linear' with transform keyframes runs as a CA animation in WebKit (brief G4:
  CONFIRMED, KeyframeEffect.cpp canBeAccelerated) · Chrome composites it: OBSERVED (frame counts above)
6 lead: signed, fast path, 2026-10-03 01:35Z ("countdown rAF callbacks → ~0 by code ($E spring effect)");
  "Chrome composites the roll" stays OBSERVED, the CA one-frame lead UNRESOLVED
```

```
BUILD cd-roll-ca-4tc (round 4, cells-only) on cd-strip strip-tc (accepted PR-008 rev 2; JS 6fa0e1e8a221…, CSS 982a747d9263…) · overlay fixes/cd-roll-ca/overlay
served hashes: nodes/2.DyWL8TcE.js 582d120c9f8f… (V9), CSS 982a747d9263… = cd-strip's; snapshot copies out/cd-roll-ca/snap/{C8,V9}
patch.diff: base-sha256 6fa0e1e8a221…, +165 -2 lines (insertions; the two '-' lines are $E's `__cdAnimate` declaration
end and the spring's start value)
design delta from cd-roll-ca-4 (strip-rw): no __crTops (no top writes); the animations override cd-strip's inline rest
transforms, cancel() at the finish reveals them (last keyframe = rest transform)
checks on tc: roll end (Chrome end-check 8 rolls, Sim wrap/wrapUp): last keyframe = inline rest, 0 px; A vs B within A/A; session A
(fade50 wrap,wrapUp + A/A) and B1 (carry,two): V9 vs C8 max delta 6, state <= 0.017 px, rects <= 0.01648 px, 0 unmatched, layers equal
resumed list (2026-10-04, all done): Sim B2 + C (max delta 9, state <= 0.015 px, rects <= 0.01505 px, 0 unmatched,
  A/A C exact 0/92), rate 1 (0 px / delta 1), sim-counts (countdown rAF 132-146 -> 4 per 4 s, RenderingFrame 121-132 ->
  49-58), sim-hide C8/V9; reduced motion: Sim exact 0/12 (A/A 0), Chrome hero exact, panel +-1 background flips in any
  arm incl. A/A (V9 4/533, A/A 2/533; lead ruling: exact against the control's A/A); Chrome comp-check C8/V9 (rAF
  163 -> 6 / 6 s, UpdateLayoutTree 175 -> 72, main frames 205 -> 79, Layout/Paint 12/41 vs 11/39), roll-probe h60 V9
  (ticks 0.067 / forced 0.241 px max, start 0.012 px; base fit C8 0 px), hide-check V9 (0 errors, 0 px start, 0.012 px
  first frame), T-034 c375/c1440 + live resize 430->375, 375->1440 (last keyframe = rest 0 px, A vs B within A/A),
  fix.mjs check --on cd-strip mobile: morph both, 0 errors, 0 4xx, 1558 elements both, pixel diff top 0.1 / middle 0 /
  bottom 0.34 %
memory/layers (Simulator): 14 backed, 0.329 MB at rest in sessions A/B1/B2; +1 backed cell (0.352 MB) at rest in 3 of
  6 censuses on tc; while a roll runs every animated cell can hold a backing store (+2 cells / +0.047 MB normal roll,
  +6 / +15 cells, +0.14 / +0.35 MB in a long roll; F-201); OBSERVED, cause unknown
debug hooks: none
```

```
PHONE TICKET P-093 cd-roll-ca V9 · less-work no-worse check (lead 2026-10-04 03:3xZ; T-055 waived only the finger A/B) · P-093 from mgmt-ops-10 (read 1 on 48c6b554: CHANGES S1, T1-T3; this is rev 2, registered before any phone data)
build: V = V9 = cd-strip strip-tc + cd-roll-ca, JS 582d120c9f8ffacd9ff7f8b46f11f548fc8163411ef9cc67b2e6f59ca90f18f3,
  CSS 982a747d9263ca258ad60aa773d8df4b19cf0dfec10b27a6672b1746a129007d, patch.diff d48095cc16ff (--on cd-strip);
  immutable copy out/cd-roll-ca/snap/V9 (fix-cd-roll-ca worktree)
control: C = C8 = cd-strip strip-tc (landed on main 5d1ca102), JS 6fa0e1e8a221ccd5aa2983c6dcceaceab239a1535b295e07a0035ff4ea32ef16,
  CSS 982a747d9263… (the same as V's); copy out/cd-roll-ca/snap/C8; mirror snapshot b1789284481295-4ad4a84a
question: on the phone at real thermal Serious, does moving the hero clock's roll from the rAF spring to Web Animations
  add slow frames at the top of the page (the clock rolling at rest, then the W window through the hero)? No-worse only;
  the landing basis is the cost counts (countdown rAF callbacks ~108 -> ~4 per 4 s, by code).
ports: three: `ARMS="B C8 V9" sh out/cd-roll-ca/serve-snap.sh` (serve.mjs --root site-pretty [--overlay <copy>]
  --port auto --latency 150 --vendors=local, plain http per I-003; B = the plain baseline page, no overlay, the pre-warm
  and gate-timer page, no counted run on it; it checks the copies against HASHES.txt and the served JS/CSS hashes, and
  prints the phone URLs); one uncounted warm-up load per arm port (A3/U5)
thermal gate (P-079's condition B; memory "phone checks start warm"): real thermal Serious, `node
  research/phone-thermal-gate/thermal-gate.mjs --owner cd-roll-ca --expect serious --max-c 44 --url http://lan:<twin B>/`
  (sha256 4604218c4041) at the start and the end of every phone hold; a hold counts only if both reads PASS (Serious,
  Is Induced = No), else it is VOID and re-run. Ceiling 44 °C or Critical (stop, cool). Every gate failure goes to the
  lead; two gate-failed holds (not necessarily in a row) -> roll back to condition A, reported in T-039 (the lead's
  switch). Holds back to back. Timer-grid median and battery °C logged per hold. Low Power Mode runs dropped. The later
  Fair no-worse check is not part of this block.
start method (one for every hold and every arm; the lead's ruling after P-073): pre-warm on B. One uncounted W run on
  B (`--warmup`, no --arm), then the start gate; while the gate says too cool (exit 2), another W run on B and another
  read, at most 4 pre-warm runs; any other start-gate failure, or still too cool after 4, ends the hold with no counted
  run (reported; a hold that ran no counted run is not a strike unless the lead rules otherwise, as h165958 in P-085)
holds (T2): every phone part runs inside its own `node tools/lock.mjs run chrome-measure --no-timing --max-seconds 900
  --owner cd-roll-ca --doing "P-093 hold Hn" -- caffeinate -i -s sh fixes/cd-roll-ca/phone/hold.sh Hn <items>` with the
  iphone lease held by cd-roll-ca (I-056; 900 s under the lead's condition-B rule, as P-088 and P-092; caffeinate -i -s
  inside the hold only, C-024). hold.sh (sha256 6bd99cf3909e, committed with this ticket) runs: pre-warm + start gate,
  the items in order (`iphone.mjs open <arm twin>` then `iphone.mjs run`, each run parks Safari), the end gate, then the
  I-098 sleep check `node fixes/rest-script/tools/pmcheck.mjs <hold start> <hold end>` (sha256 d36bd7437b7c, on main:
  a pmset Sleep, DarkWake or Maintenance line within 5 s of the hold, or an unreadable log, makes the hold VOID). A
  VOID hold (gate or sleep) is re-run as a new hold with the same items; after 2 sleep-VOIDs in a row, park and report
  to the lead. Its last line is "HOLD Hn VALID" or "HOLD Hn VOID <why>".
  H1: wC wV C1 V2 · H2: V3 C4 C5 V6 · H3: V7 C8; then `iphone.mjs park`
block (driver W, Timeline OFF): warm-up C, warm-up V, counted C V V C C V V C (block positions 1-8, n = 4 per arm),
  each `node tools/iphone.mjs run --driver window --probe std --owner cd-roll-ca --block P-093 --arm C|V --run <n>
  --label crca-<arm><n> --to 2400 --idle 8 --hold 2 --sentinel 3` (warm-ups with --warmup); --idle 8 (P-079 had 4):
  8 s of the clock rolling at y 0 per run, so ~8 rolls per run in the window. Every counted C run is the heat
  sentinel (bottom >= 58 fps and scroll >= 44 fps, meta.sentinel): a failing C run voids every run since the last
  passing one; voided runs are re-run in the same order, at most one extra C V V C quartet (one more hold)
scorer: fixes/cd-roll-ca/phone/score.mjs, sha256 57856e3f530ae49f2ecb7c0397c887d75c315c82daf895eedb1ce36d4744dc37
  (rev 2; rev 1 f697000e77e4 skipped the sentinel of a C run already void for another reason, ops S1), committed
  before any phone data; run as `node fixes/cd-roll-ca/phone/score.mjs <arm>:<file> ... --json <out>` with every
  counted file of the VALID holds in block order (warm-ups skipped, void runs reported and dropped). Files of a VOID
  hold are left out of the call and listed with their gate reads and pmcheck line in the block log (as P-079). The
  sentinel of every counted C run is judged whatever its other voids: pass resets, anything else voids back to the
  last pass. Checked before data on a synthetic block built from a real P-079 W file (all equal -> hit; V +3 frames
  > 50 per run -> FALSIFIED; V +1 -> hit; a failing C sentinel voids the runs since the last pass -> not enough; LPM
  and a wrong served hash -> void; a C run with a wrong hash AND a failing sentinel still voids back to the last pass;
  an LPM C run with a passing sentinel is void itself but resets). Windows, fixed before data:
  top frames: a W run's frames with t in [marks.idle start, marks.scroll end) and yEnd < 1000 (P-079's window)
  idle frames: t in [marks.idle start, marks.idle end) (descriptive, no gate)
gate (no-worse), top window: median of V's valid runs minus median of C's, dt > 50 (twins > 46, > 54): FALSIFIED when
  it rises by >= 2; a twin with another verdict marks it threshold-sensitive; dt > 34 (twins > 30, > 38) judged against
  [-1, +1], reported, not a falsifier; >= 3 valid runs per arm, else "not enough" (re-run per the block rule)
decision rows: hit -> cd-roll-ca lands on the less-work basis (cost counts + this check + review round 4); FALSIFIED ->
  no landing; back to the code (first suspect: the per-roll animation creation on the main thread at the tick), the
  lead decides; not enough after the extra quartet -> the lead decides (re-block once, or land on the counts alone)
confidence (rough, for calibration, not a gate): P(hit) 0.85 (Simulator: same layers, no extra backing, roll on the
  compositor; the phone's CA path is not measured; P-079's top window was no-worse with the rAF spring)
minutes: ~25 (range 20-40): 3 holds, each pre-warm 1-4 runs (~1.2 min each) + 2 gate reads (~1.5 min) + its items
  (2 warm-ups ~2.5, 8 counted ~10); more if the phone starts cool
queue: phone-queue place 4 (lead); ops calls the turn, then `node tools/lock.mjs acquire iphone --owner cd-roll-ca
  --ttl 900 --url <B's twin> --wait 3600`, renewed between holds
```

```
BUILD cd-roll-ca-4 (round 4, cells-only, history: strip-rw, not the landing base) on cd-strip strip-rw (DEV build JS 5e37af69bcc4…, CSS 9b2f89ea58bd…) · overlay fixes/cd-roll-ca/overlay
served hashes: nodes/2.DyWL8TcE.js 73dff152e454… (V6), CSS 9b2f89ea58bd… = cd-strip's; snapshot copies out/cd-roll-ca/snap/{C5,V6}
checks (dev base): Chrome comp-check V6 (rAF 8 / 6 s, 40 animations), roll-probe h60 V6 + base fit C5 (0 px), hide-check
V6 (0 errors, 0 px start, 0.008 px first frame), fix.mjs check --on cd-strip mobile: morph both, 0 errors, 0 4xx,
1558 elements both, pixel diff top 0.19 / middle 0 / bottom 0 %; Simulator simpx debug runs 1-2 (wrap at fade50:
rects ≤ 0.0151 px, 0 unmatched, layers equal, reason animation, no added recalc running)
(the checks on cd-strip's final hash ran on strip-tc: see BUILD cd-roll-ca-4tc)
memory/layers (Simulator, fade50): 84 layers, 0.329 MB, 77 cell layers, 14 backed, at rest and mid-roll, same as C
debug hooks: none
```

```
BUILD cd-roll-ca-3 (round 3, history; round 2 cd-roll-ca-2 673b110d…, round 1 cd-roll-ca-1 9ac52b08…) on cd-strip(b) on st6-rb2 · overlay fixes/cd-roll-ca/overlay
served hashes: nodes/2.DyWL8TcE.js 2af461dc50ad… (round 3; sha256 of the served body logged by serve-snap, hide-check
and sim-hide), CSS ce6beca745a0… = cd-strip's; snapshot copies out/cd-roll-ca/snap/{C,V,V3}
round 3 checks: Chrome hide-check V3 (0 errors), roll-probe h60e, Simulator sim-hide C/V3 (0 errors);
fix.mjs check not re-run for round 3 (the change is in the roll clock only: hidden page, and before a roll's first frame; it runs again on the rebuild on cd-strip's landed patch)
functional (round 2): fix.mjs check --on cd-strip, mobile: morph reached, 0 errors, 0 4xx, 1543 elements both; pixel diff top
0.14 / middle 0.01 / bottom 0.51 % (bottom: the gradient accent words "Secure"/"Organized" in another colour phase,
looked at; the countdown is not in that shot)
parity (round 3, h60e): normal ticks 0.08 px vs ideal, 0.24 px same stamps (own jitter 0.32); forced 0.22 / 0.10 px (own 0.23); hidden page: Chrome 0 px start / 0.21 px first frame, WebKit Sim 1.39 px residual, 2.02 px first second after the show
parity (round 2): hero roll on normal ticks within 0.15 px of the original's ideal 60 Hz frames, 0.64 px on the same jittery stamps (its own jitter 0.80 px); forced (random-phase) rolls up to 0.84 px vs ideal, 0.30 px on the same stamps (its own 0.55 px); panel unchanged (original spring)
a11y diff: n/a (aria-hidden digits; aria-label unchanged)
mechanism delta: countdown rAF 108 → 4 / 4 s; main frames during rolls = outside rolls
idle triple: y 0 above; mid-page: clock off-screen → snap, unchanged from st6-rb2; at the pin: panel = original
memory/layers: one transform animation layer per rolling hero digit while it rolls (Chrome promotes during the
animation; hero faces were layered already in st6-rb2)
debug hooks: none
```

**Scenarios not run:** phone (any driver), reduced motion (unchanged code path: snap), panel at the morph (unchanged
code path: original spring). Real tab hide/show: run in rounds 2 and 3 (section "Hidden tab, for real": Chrome, and WebKit in the Simulator via an app
switch; not on the phone).

## Combine check with the best build (byte check only, lead 2026-10-04)

`fix.mjs combine` was run on best-build (`fixes/best-build/patch.diff` 9bf4c6e41f11, main 60df1cfb), cd-strip and
cd-roll-ca (`patch.diff` d48095cc16ff), in that order. Output: `out/cd-roll-ca/bbcheck/cdrollca-bbcheck/overlay`. Nothing
of it is built or measured as a variant.
- It applies with no conflict. The combined JS is efaccfe2a52e and the CSS f5ee35c41a72.
- The countdown region (from `var UE = { stiffness` to `var lD = h(`, lines 3993-4381) is byte-identical to V9's:
  sha 854f366a21fd on both sides.
- The combined JS differs from V9 in 9 hunks, all at lines ≥ 12623. Those are best-build's own deltas, outside the
  countdown.
- The combined CSS differs in 3 hunks. None touches the strip, cdwrap or cell rules.
- No conflict to name in the land request.

## Risks, conflicts, follow-ups

- Not frame-identical at 120 Hz, at 80 Hz, or after a late first frame (see above). The blind watch test was dropped
  (T-055 covers the countdown chain). It lands on the less-work rule: cost counts, the pixel numbers, reduced motion
  exact, review round 4 and the P-093 phone no-worse check.
- Memory cost while a roll runs on WebKit (F-201): animated cells get backing stores, up to +15 cells / +0.35 MB in
  a long roll in the Simulator, plus +1 cell / +0.023 MB at rest in 3 of 6 censuses. OBSERVED, Simulator; not
  checked on the phone.
- Couples to fix-cd-strip's `__cdStripY` and strip markup: a change there needs a re-apply here. fix-cd-strip is
  looking for a pixel-identical WebKit layout (lead, 2026-10-03 ~02:00Z), possibly a new cell pitch or offset.
  `__crPath` works in digit values and maps to px only through `__cdStripY(v, c)` with the measured cell `c`, so a
  new pitch or offset inside `__cdStripY` carries over; a different mapping (non-linear, or not via `__cdStripY`)
  or other strip markup needs this patch re-applied, the snapshot V rebuilt and the probes re-run.
- cd-strip lands with one compositing layer per cell, cells moved by their own transform (strip-tc). The roll moves
  cells, not the strip, so a cell entering the clip mid-roll could show blank or late (F-142): not seen on strip-rw in
  the Simulator (0 unmatched cells in all paused and running shots; layers and backing unchanged mid-roll). On C8/V9
  it was re-checked: sessions A, B1, B2 and C had 0 unmatched cells in every shot.
- Couples to cd-strip's `__cdStripM`, `__cdStripY` and its cell-transform effect on [c, M] (the roll's last keyframe
  must equal that effect's rest transform `(k − M)*c`): a change to the strip's geometry there needs this patch
  re-applied and the probes re-run. (On strip-rw it also coupled to the wrapper's `-M*c` and the cell-top effect.)
- `__crWatch` re-arms on every frame that runs while `document.hidden` is true. An engine that kept running frames for
  a hidden page would turn it into a per-frame rAF for as long as the page stays hidden (cheap, nothing drawn). Neither
  engine did here: Chrome ran 0 frames while hidden, WebKit (Simulator) 1 frame just before the visible event
  (OBSERVED, review round 3 nit 1).
- Hidden page on WebKit: the residual above stays. It is bounded by the part of a roll that plays in the 0.3-0.5 s
  between WebKit's last frame and its hidden event: 0.9-3.9 px in rounds 2-3, and 57.5 px on tc when a 0→9 roll was
  in its fast part. It only shows while the page is hidden, and the next tick after the show starts at the original's
  value. The real phone's event order is UNRESOLVED (not checked on the device).
- The one-shot rAF per roll is a main-thread callback (cheap, no style write); WebKit "0 countdown rAF at rest"
  holds, "at roll start" it is 1.
- Tools: `roll-probe.mjs`, `comp-check.mjs`, `sim-counts.mjs`, `hide-check.mjs`, `sim-hide.mjs`, `simpx.mjs` and
  `strip-read.mjs` (strip geometry for strip-rb and strip-rw) are topic-local probes in this folder (not in `tools/`);
  no measurement code was changed.
