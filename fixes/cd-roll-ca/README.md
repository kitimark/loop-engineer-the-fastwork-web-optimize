# Fix: cd-roll-ca

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Deliverable now K (2026-10-04, user: PR-017 rev 5 accepted, option land-k, 14:28:04Z):** `patch.diff` is build VK =
C8 + cd-roll-ca with K's per-frame keyframes (same roll path as V9, 3-4x fewer keyframes), JS `b43fe790c20c…`, CSS
`982a747d9263…` (cd-strip's, unchanged); stacked on cd-strip strip-tc (base JS `6fa0e1e8a221…`). Rebuild:
`node tools/fix.mjs apply cd-strip --on st6-rb2 --reset` then `node tools/fix.mjs apply cd-roll-ca --on cd-strip`
(round trip checked: the patch on cd-strip's JS gives `b43fe790c20c…`). The V9 patch it replaces (landed, `1bb87be9`)
stays in git history. Phone: P-102 (VK vs V9, less-work no-worse) hit; P-100 rev 3 ran on VK (see "K" section).
V9 text below is kept as history.

**Status (history, V9):** round 4, "cells-only", now on fix-cd-strip's **strip-tc** (the user accepted PR-008 rev 2, option
land-strip-tc, 2026-10-03 09:31Z): build V9 = C8 + this fix, JS `582d120c…`; a design delta from the strip-rw build
(no `__crTops`), so review round 4 on the delta comes before the counted set (lead). Everything measured so far ran on
strip-rw: dev base C5/V6 (CSS `9b2f89ea…`) and counted session A on C6/V7 (CSS `40078cb2…`); those sections are kept,
labelled strip-rw. Rounds 1-3 (one animation per strip, on st6-rb2) passed review (round 3 PASS, `2af461dc…`); their
sections are kept below as history, labelled.
**Stage:** F (build card); D signed by the lead, fast path, 2026-10-03 01:35Z; V = the P-093 phone no-worse check
under the less-work rule (`memory/less-work-landing-rule.md`; the blind watched comparison was dropped, T-055)
**Device class / gate:** render-bound / main-thread script removal; gate = the cost card (countdown rAF per roll, and
the full-page rows in Chrome and the Simulator) + the pixel tier T2 for frozen frames + P-093 (no-worse) + the user's
decision on the motion-only difference (proposal PR-017, see "User decisions on the motion difference")
**Driver(s) behind the claims:** Chrome CDP traces at y 0 (headless, 60 Hz; headed for 120 Hz), WebKit iOS Simulator
Timeline counts, frozen and running screenshots, layer census, and a hidden-page check (app switch). Phone: P-093
(driver W), run 2026-10-04: hit (dt > 50 median +1 per run, falsifier +2; every V run had 1-2 such frames, no C run
did; see "P-093 result").
**Prediction:** P-093 (registered with mgmt-ops-10 before any phone data; ticket below): top-window dt > 50, median V
− median C < 2 = hit, P(hit) 0.85. Counts are by code (no timing prediction).
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
  rest transform again; the last keyframe and the rest transform are the same value, so nothing moves (checked: no
  one-frame jump at the roll end, Chrome end-check and Simulator frozen frames, "Roll end" below).
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
`__crPlay` re-creates the animations at the same `t0` with keyframes for the new c (no `top` write; checked live
in T-034's resize runs).

**Script cost per tick.** `__crPath` median 0.040 ms, p95 0.073 ms per call (0.035 ms one step), offline in Node 24
(OBSERVED, a CPU micro-benchmark, not a page timing; scratch `pathcost.mjs`). Per roll, in addition: one `animate()`
per moved cell (typically 3-4 for one step, up to 11 for 0→9) and their `cancel()` at the end. The roll writes no
`top` and no inline style on strip-tc (the top writes were strip-rw's `__crTops`, history).

What is visually identical and what is not: the roll follows the original's 60 Hz path (numbers below). On a
120 Hz display the original takes another path (it is frame-rate dependent); the build keeps the 60 Hz one.

## Why that is faster

The per-frame rAF callback and the per-frame inline style write disappear; the compositor runs the transforms. Main
thread per roll: the change's own recalc, one rAF callback (the start fix), the `animate()` calls at the start and the
`cancel()` calls at the end (no style write, no layout of their own). In Chrome the roll adds few main frames while it
runs (table below).

## Before / after (counts, no timing)

**Landing basis: the full page (review round 4 B3, 2026-10-04 07:00-07:09Z).** Chrome 154, headless, 430x932 DPR 3
mobile, y 0, 6 s, the page as served (no `--pause-others`), 3 loads per arm, C8 and V9 alternating, shared lane
(`comp-check.mjs --save-trace`, `out/cd-roll-ca/r6-full.sh`; files `out/cd-roll-ca/full/comp-check-{C8,V9}-full-r{1,2,3}.json`
and the traces beside them). Per roll the countdown runs **1 rAF callback in V9 against 23-26 in C8**.

| per 6 s at y 0, full page, loads 1 / 2 / 3 | C8 | V9 |
|---|---|---|
| countdown rAF callbacks | 162 / 163 / 183 | **6 / 7 / 6** |
| countdown rAF per roll (rolls in the window) | 23 / 23 / 26 (7) | **1 / 1.2 / 1** (6) |
| countdown function calls | 174 / 175 / 195 | 25 / 26 / 24 |
| main frames (BeginMainThreadFrame) | 295 / 298 / 306 | 250 / 262 / 257 |
| UpdateLayoutTree | 296 / 298 / 306 | 250 / 262 / 258 |
| Layout | 11 / 13 / 11 | 13 / 13 / 12 |
| Paint | 859 / 888 / 887 | 864 / 890 / 887 |
| compositor frames (BeginFrame / DrawFrame) | 360-361 / 360-361 | 360-361 / 360-361 |
| main frames per 400 ms, in a roll / outside | 20.1-22.3 / 17.5-19.6 | 15.8-17.0 / 17.3-20.2 |

**Cost card** (`tools/costcard.mjs`, `fixes/cd-roll-ca/costcard.{md,json}`; records built by `cc-records.mjs` from the
traces; the event is the countdown's 1 s timer tick (a countdown FunctionCall inside a TimerFire: trace line 4154 in
C8, 4317 in V9), one timer per load so a window holds one tick of each clock; median of 3 loads, 5 windows per load; no
A/A arm, so the 2-count floor is the tolerance):

| per 1 s tick, Chrome FULL | C8 | V9 | change |
|---|---|---|---|
| rAF callbacks | 27 | **1** | −26 |
| FunctionCalls (all scripts) | 66 | 14 [14-16] | −52 |
| main frames / style recalcs / Layerize | 60 | 50 [47-52] | −10 |
| style elements recalculated | 417 | 392 [346-469] | −25 |
| layouts / objects needing layout | 2 / 33 | 2 / 33 | 0 (within the floor) |
| paints | 178 | 178 | 0 (within the floor) |
| compositor frames | 60 | 60 | 0 |
| timer fires | 5 | 5 | 0 |

- The card's field 1 lists the page's non-composited animations with names that do not belong to the countdown cells
  (e.g. "avatars-exit on SPAN class='cell'"); the card marks them "page (not element-attributed)" and UNRESOLVED. No
  claim is made from field 1. Paint area is a whole-page upper bound, equal in both arms.

**iPhone Simulator, everything running (B3, 2026-10-04 07:11-07:15Z).** `sim-counts.mjs C8,V9 2` with nothing frozen,
fw-sim 15 Pro Max, hero at y 0, 4 s Timeline windows, 4 digit rolls per window (no long roll in the window), order C8 V9
V9 C8, shared lane, `sim.mjs session --functional` (`out/cd-roll-ca/sim-counts-2026-10-04T07-15-36-357Z.json`,
`r6-simFull.log`; sim background mean 13 %, max 38 % of a core):

| per 4 s, rep 0 / rep 1 | C8 | V9 |
|---|---|---|
| countdown rAF callbacks | 112 / 107 | **4 / 4** |
| countdown rAF per roll | 28 / 26.75 | **1 / 1** |
| RenderingFrame | 223 / 206 | 210 / 203 |
| RecalculateStyles | 235 / 216 | 220 / 213 |
| Layout / Paint | 175 / 195, 149 / 170 | 157 / 178, 149 / 170 |
| clock-sized paints | 189 / 164 | 172 / 164 |
| hero census at rest: backed cells, MB | 16, 0.376 (both) | **18, 0.423 / 17, 0.399** |
| ~150 ms into a roll | 16, 0.376 (both) | **18, 0.423** (both) |
| ~150 ms into a long roll (a change of ≥ 5) | 16, 0.376 (both) | **25, 0.587 / 26, 0.611** |

- With the whole page running, the countdown's own work drops the same way as on the frozen page (rAF 107-112 to 4 per
  4 s). The page's other work dominates the frame counts, so RenderingFrame, style, layout and paint counts differ by
  less between the arms than between the two reps of C8 (e.g. RenderingFrame C8 223 / 206, V9 210 / 203). No claim
  beyond "not more" is made from them.
- Memory (OBSERVED, Simulator, cause unknown): V9 holds 1-2 more backed cells than C8 at rest (+0.023 / +0.047 MB;
  frozen runs: +1 in 3 of 6 censuses), 2 more ~150 ms into a roll (+0.047 MB), and 9-10 more in a long roll
  (+0.21 / +0.24 MB; frozen runs +6 / +15, +0.14 / +0.35 MB). The proposal names the largest, +0.35 MB, and the
  at-rest +1-2 cells.

The frozen-page counts below are supporting numbers.

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
`--pause-others` paused 24 other animations in C8 and 16 in V9 (N7). More of the page ran in V9's window than in C8's,
so V9's counts are, if anything, high: the comparison is conservative for V. These frozen-page counts are supporting
numbers; the landing basis is the full page (below).

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

What this is: the sub-pixel offset of the path's interpolation ("Position identity" below).

**Chrome mid-roll frozen frames (review round 4 B2, 2026-10-04 06:57-06:59Z).** `pixels.mjs` with `MOTION=1`: C8,
V9 and C8-again (the A/A) step the same virtual frame stamps; in V9 every hero cell animation is paused at
`currentTime = frame stamp − its startTime` (the startTime the page gave it, read before the first pause), so V9 shows
its own path at C8's spring stamps. 7 scenarios at 60 Hz (17 shots each) and 5 at 120 Hz (10 each), 169 shots per
arm. Five numbers from `fixes/cd-roll-ca/fivenum.mjs`: beyond A/A = channel difference > 8 where
C8-again vs C8 is ≤ 8, share of the whole viewport; edge vs fill = C8's 3x3 neighbourhood spans more than 8 levels or
not. Files: `out/cd-roll-ca/pixels-2026-10-04T06-57-19-874Z{.json,/}` (430),
`pixels-2026-10-04T06-58-28-626Z{.json,/}` (1440), `out/cd-roll-ca/fivenum-{430,1440}.json`.

| V9 vs C8, Chrome 154 | 430x932 DPR 3, 60 Hz path | 430, 120 Hz | 1440x900 DPR 1, 60 Hz | 1440, 120 Hz |
|---|---|---|---|---|
| shots differing / beyond A/A | 17 / 12 of 119 | 36 / 35 of 50 | 119 / 119 of 119 | 50 / 50 of 50 |
| largest shade (limit: edge 128, fill 64) | **222** | **222** | **222** | **222** |
| share of the screen beyond A/A (limit 0.5 %) | ≤ 0.027 % | ≤ 0.130 % | ≤ 0.012 % | ≤ 0.058 % |
| area, CSS px (limit 2,000) | ≤ 107 | ≤ 520 | ≤ 157 | ≤ 754 |
| edge or fill | edge (glyph edges of the moving digit; 2 shots count "fill" pixels where a glyph moved into flat background) | edge and moved glyphs | edge (fill max 4) | edge and moved glyphs |
| static or moving | moving only (pre-roll frames 0) | moving only | moving only (see the first frame below) | moving only |
| geometry, V9 − C8 (computed transforms) | ≤ 0.21 CSS px = 0.62 device px; **0.63 CSS px = 1.9 device px** in "two changes mid-roll" | the 60 vs 120 Hz path (px, "Position identity") | ≤ 0.21 device px | the path |
| A/A (C8-again vs C8) | 6 of 169, max 173: C8's first load showed every digit in a low-res raster in 6 shots (the same shots also differ in V9 vs C8) | in the 6 | every shot, max 56-59: the labels' anti-aliasing changes per load | same |

- At DPR 1 even the roll's first frame (the change landed, V9's animation holds its first keyframe, computed transform
  equal to C8's, `sameState`) differs at the moving digit by up to 113. An animation-held layer renders the same
  transform with other edge pixels than C8's inline-transform layer at DPR 1 (OBSERVED, in our setup, cause unknown;
  not seen at DPR 3). Rest and end frames (no animation) are exact: roll-end check and T-034.
- The 1440 A/A mask is one sample of a per-load label noise, so "beyond A/A" there is an upper bound.

**Tier (lead ruling 2026-10-04: T2 under `memory/illusion-must-be-pixel-identical.md`), part by part:**
- At rest, at the roll end, and under reduced motion: **exact** (T0; Chrome and Simulator, with A/A; the Chrome panel's
  ±1 background flips appear in every arm including the A/A, lead ruling).
- Simulator (WebKit) mid-roll frozen frames: **T2**. Largest shade 9, edge (limit 128; fill 64); share ≤ 0.041 %
  (limit 0.5 %); area ≤ 166 CSS px (limit 2,000); moving only; within 1 device px (≤ 0.017 CSS px = 0.05 device px);
  reduced motion exact.
- Chrome mid-roll frozen frames: **beyond T2 (T3)**. The share and area are inside the limits, but the largest shade is
  222 against the edge limit of 128, and the "two changes mid-roll" case (a second change within 9 frames of the first;
  only when the clock jumps, e.g. after a page show, never on the 1 s ticks) is 1.9 device px off at DPR 3, against
  the 1-device-px clause. At 120 Hz the path itself differs (below).
- Every difference is motion-only, which the rule sends to the user anyway: see "User decisions on the motion
  difference". The landing waits on that proposal.

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
  3.3 px (one step) and 29.5 px (0→9, offline model), and the build vs the original at 120 Hz measured up to 29.6 CSS
  px (95 % within 3.2) on two earlier builds with the same hero path (round 2 `probe-build-headed2.json` 29.6 / 3.2;
  the pre-hero-only build `probe-build-headed.json` 27.7 / 2.5); not re-run on V9 (review round 5). The 120 Hz screen
  is the Mac display we measured on (headed Chrome). The user has not explicitly accepted this motion difference (see "User decisions on the motion
  difference" below): it goes to the user as a proposal.
- What rate the phone renders at: CONFIRMED only that WebKit asks for a 60 Hz display link as a hint
  (CLAUDE.md, pref PreferPageRenderingUpdatesNear60FPSEnabled, preferredFramesPerSecond=60; claims-audit §2.7); Core
  Animation picks the actual rate. Idle and scripted phone runs show 16-17 ms gaps (OBSERVED), and finger runs show
  ~80 Hz stretches (F-071, trigger UNRESOLVED). With no touch (the idle case) the phone most likely shows the 60 Hz
  path; that is OBSERVED for idle runs, not CONFIRMED.
- UNRESOLVED: WebKit samples a Core Animation animation at the display's presentation time, the original's value
  comes from the rAF stamp; that could add a constant lead of up to one frame on the phone. Decisive check: a phone
  frame capture of a roll (not run: no phone use in this task).

## User decisions on the motion difference (review round 4 N4)

The frozen-frame tier does not cover a difference that shows only in motion (`memory/illusion-must-be-pixel-identical.md`:
"any difference that shows only in motion ... is a proposal to the user"). What the user said (console thread
T-030, quoted as typed):
- T-030 #9 (lead, 2026-10-03 00:09Z), on cd-roll-ca: "Looks: within about 0.08 px of the original's motion, but not
  frame-for-frame the same (the original itself differs by 3.3 px between 60 and 120 Hz screens). Under your
  'identical only' rule it is parked; say 'try cd-roll-ca' if you want it built and shown to you in a blind swipe test."
- T-030 #10 (user, 00:10Z): "Let's do cd-roll-ca as highest priority as well."
- T-030 #11 (lead, 00:11Z): "since it is not frame-for-frame identical, you get the final say in a blind swipe test on
  the phone before it goes into a build."
- T-055 #2 (user, 2026-10-04 02:53Z, after the cd-strip swipe test C-035): "i think the count down timer it quite hard
  to distinguish which one is better. cause it already smooth both. in my perspective, we could pick the
  implementation the use our resource to less re-calulation . no need to do A/B ."

Reading: #10 asked for the fix to be built. The acceptance of the motion difference was left to a blind swipe test
(#11), and T-055 #2 dropped the swipe tests for the countdown in favour of the cheaper build
(`memory/less-work-landing-rule.md`). Neither is an explicit acceptance of a motion difference. So these items go to
the user as a proposal (land / park; Try-it A = C8, B = V9), lead 2026-10-04: **PR-017** (posted 2026-10-04; rev 2
adds the Simulator full-page row and the at-rest memory line; rev 3 (review round 5) corrects the 120 Hz row, labels
the 60 Hz numbers as Chrome's, adds the WebKit first-frame lead and the status words; rev 4 lists the Arc-safe Try-it
links; recommended: land; decided: accepted, land, 09:11Z, see below):

| what differs | how much | when |
|---|---|---|
| frozen Chrome frames mid-roll | edge shade up to 222 of 255, ≤ 0.13 % of the screen, ≤ 754 CSS px | only while digits roll |
| path at 60 Hz (Chrome, 60 Hz, 1 s ticks) | ≤ 0.21 CSS px; 0.63 px when the clock jumps twice within 9 frames. The phone at rest ran at 60 Hz in our runs (OBSERVED, not CONFIRMED) | only while digits roll |
| path on a 120 Hz screen (the Mac display we measured on) | up to 29.6 CSS px (95 % within 3.2) on two earlier builds with the same hero path; not re-run on V9 (the original moves 3.3 / 29.5 px between its own 60 and 120 Hz paths) | only while digits roll |
| path at 80 Hz, or after a late first frame | about 2.7 / 24.7 px and 2.0 / 18 px (offline model) | only while digits roll |
| WebKit first frame of a roll (UNRESOLVED presentation-time lead) | may run up to one frame ahead of the original; in the Simulator the read value ran 0.5-5.5 ms ahead, 20-29 px in the first frame of a 0→9 roll (OBSERVED, Simulator, cause unknown); not checked on the phone | first frame of a roll |
| hidden page on WebKit | a roll can show a residual of up to 57.5 px (0→9 roll) | only while the page is hidden; the next tick after the show starts at the original's value |

Memory cost in PR-017 is labelled "Cost in the iPhone Simulator (OBSERVED, in our setup, cause unknown; not checked on
the phone)".

**Decision: ACCEPTED, option land** (PR-017 rev 4, user, 2026-10-04 09:11:18Z). Rev 4 was a text-only change listing
plain local Try-it links (T-085: the console Try-it pages showed 00:00:00:00 in Arc, cause under I-131). The user's note
says the proposed page looked noticeably smoother and asks the team for more research. That research card is T-096
(lead + mgmt-ops-10), registered before data under "Research card T-096". The note is the user's impression on a
desktop Try-it page, not a measured gain: OBSERVED by the user, not traced.

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
owed: idle triple (y 0 counted; mid-page and at the pin not re-counted on tc: off-screen snap and the panel's spring
  are C8's code, unchanged); a11y diff: n/a (aria-hidden digits, aria-label unchanged); position-bin census diff: not
  run (the roll writes no layout property; Layout per window equal within one count); phone segment card X1: owed,
  P-093 runs with Timeline off, so it gives frame counts only, no per-segment attribution
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

### P-093 result (2026-10-04 08:43-09:10Z; OBSERVED, iPhone 15 Pro Max, Safari, driver W, Timeline off)

```
BLOCK LOG P-093 · lease 08:36:06Z-09:10Z (cd-roll-ca) · scorer 57856e3f (as ticketed) · out/cd-roll-ca/p093/score.json
extra: one uncounted pre-warm on B at 08:43Z (p093-pre0) beside a shared group, lead-approved (not in the ticket; no counted run)
H1 08:46:33Z  prewarm1, start gate PASS (Serious, induced No, 40.79 °C), wC wV C1 V2, end gate PASS (40.89), PMSET OK -> VALID
H2 08:52:04Z  prewarm1, start gate PASS (40.89->40.19), V3 C4 C5 V6, end gate PASS, PMSET OK -> VALID
H3 09:06:35Z  start gate PASS (40.59->40.5), V7 C8, end gate PASS (40.39), PMSET OK -> VALID; Safari parked
void runs: none; every C sentinel passed; no LPM
ports (I-131, lead 09:1xZ: "unverified", not invalid): B 5419, C8 5420, V9 5421 (serve-snap, production cache headers,
  started 08:16Z / 08:16Z / ~08:41Z); whether a port served another build earlier today is for ts-i131's audit. C8 and V9
  serve the same CSS (982a747d), so a stale CSS can't separate the arms; the JS path differs per arm.
  ts-i131 audit (09:2xZ, serve logs, OBSERVED; no client address in the logs): all three ports served other builds
  before (differing only in 2.DyWL8TcE.js / 2.gBuqKVzi.css). On serve-B/C8/V9 the first document load fetched both with
  a 200, and later reloads mostly re-requested them (C8 24 docs / 18 JS 200s, V9 12 / 10). No earlier overlay changed a
  lazy image. WebKit honours `immutable` only on https (CachedResource.cpp makeRevalidationDecision, per ts-i131), and
  the phone ran plain http. So there is no evidence that a counted run measured a stale file. After the I-131 fix
  (no-cache + ETag), phone runs revalidate ~51 lazy files per run: phone numbers before and after that fix don't compare.
  Lead's reading (11:2xZ): ports 5419-5421 served several builds in a row; OBSERVED, low risk (the first loads fetched JS
  and CSS fresh, 200). P-093 ran on the old serving code (before I-131's fix, 291ee671).
```

| top window (idle 8 s + W through the hero) | C1 | C4 | C5 | C8 | V2 | V3 | V6 | V7 | median V − C |
|---|---|---|---|---|---|---|---|---|---|
| dt > 50 | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 1 | **+1** (gate: FALSIFIED at ≥ 2) |
| dt > 46 / > 54 (twins) | 0/0 | 0/0 | 1/0 | 0/0 | 1/0 | 1/0 | 2/2 | 1/0 | +1 / 0 |
| dt > 34 | 2 | 2 | 2 | 2 | 3 | 5 | 4 | 4 | +2 (band [-1, +1]: out, reported) |
| dt > 30 / > 38 | 3/1 | 2/2 | 3/2 | 3/1 | 3/2 | 8/3 | 7/3 | 4/2 | +2.5 / +1 |

- **Verdict: hit** (no-worse by the registered gate): dt > 50 rises by 1 frame per run (median), under the falsifier of 2;
  the > 54 twin rises by 0 and the > 46 twin by 1, both hit, so the verdict is not threshold-sensitive.
- **Reported, not a gate:** the direction is consistent. Every V run has 1-2 frames over 50 ms in the top window and no C
  run has one (C5 has one 47 ms frame, > 46 twin only). Of V's five, three are in the near band (51, 51, 53 ms); V6 has 111 ms and 77 ms at
  the start of the W scroll (t+8.90 s, t+8.98 s). Two of them (V2 t+2.9 s, V7 t+5.0 s) fall in the idle phase, while
  the clock rolls at rest. The > 34 band is +2, outside [-1, +1].
  Cause unknown (Timeline off: no attribution). The registered first suspect is the per-roll animation creation on the
  main thread at the tick (the ticket's FALSIFIED row). The Simulator's extra digit images (PR-017 risk line) are a
  second candidate. Both are untested hypotheses.
- Idle window (descriptive): V − C dt > 50 +0.5, dt > 34 +1.

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

**Scenarios not run:**
- Phone: P-093 (driver W, no-worse) is registered and waits for the phone; no G or F driver (the finger test is waived
  for the countdown, T-055).
- Idle after scroll (back at the top after a scroll), reload while scrolled, early input (a touch or scroll during
  the first rolls), scroll up into the hero, the toolbar collapse/expand, and the rubber band at the top: not run.
  The roll's code path does not read scroll or input; off-screen it snaps (`__crStop`), unchanged from C8.
- Panel at the morph: not run (unchanged code path: the panel clock keeps the original spring).
- Reduced motion: run (Chrome RM1/RM2 and Simulator, exact against the control's A/A). Real tab hide/show: run in
  rounds 2-4 (section "Hidden tab, for real": Chrome, and WebKit in the Simulator via an app switch; not on the phone).
- Bench and variants: waived under the timing deferral (`memory/defer-timing-focus-call-tree.md`); no
  `bench.mjs` gain, calibration or variant build was made (N8).

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

## Roll-start trace: P-093's V frames over 50 ms (lead task, 2026-10-04 09:2xZ)

The lead's task: every P-093 V run had 1-2 frames over 50 ms in the top window, and no C run had any. Trace that frame,
Simulator first, with no gain block. Two sources so far: the P-093 phone records, re-read, and one Simulator Timeline
probe. The probe ran at 09:41Z, before H4 was added to card T-096 below, so its counts are descriptive input to H4 and
not that card's registered count.

**1. Phone, P-093 re-read (OBSERVED, iPhone 15 Pro Max, driver W, Timeline off; scratch tickphase/tickclass).**
- How it was read:
  - Every countdown tick shows in the probe's per-frame mutation record as a `data-value` change.
  - The clocks tick in pairs, about 100 ms apart. The first change of a pair is taken to be the hero clock and the
    second the panel. That is inferred, not checked directly: the probe does not name the element. Only V's first
    change ever coincides with a slow frame.
- Where the slow frames fall: V's top-window frames over 46 ms are the frame that carries a hero tick (relative frame 0).
  - V2 #172 at 51 ms, V7 #299 at 53 ms, V6 #526 at 77 ms; V6 #47 was 39 ms.
- Carry ticks (2+ digits change, so the ones digit makes the long 0 -> 9 roll):
  - Idle at y 0, V: 3 of 3 slow (39, 51, 53 ms).
  - C: 0 of 3.
- Ordinary one-digit ticks, idle:

| dt of a one-digit tick frame, idle | C | V |
|---|---|---|
| frames over 20 ms | 0 of 59 | 12 of 54 |
| frames over 30 ms | 0 | 3 (31-33 ms) |

- The frames after a tick (relative +1 to +3) are equal in C and V.
- So the extra frame is the roll's start frame, and its size grows with the roll.

**2. Simulator, Timeline on (OBSERVED, Simulator, counts only; F-084).**
- Run: `fixes/cd-roll-ca/sim-rollstart.mjs` (sha256 01351e5432105da0…), C8 and V9 snapshot copies, hash-checked.
  - Fresh OS-assigned ports per arm (C8 52366, V9 52177; I-131).
  - 2 reps per arm, 21 s windows at y 0, shared simulator slot.
  - Output `out/cd-roll-ca/rollstart/rollstart-2026-10-04T09-43-01-614Z.json` (4f8660bc284862ef…), log
    `out/cd-roll-ca/rollstart-run1.log`.
  - Sim background mean 41 %, max 81 % of a core (I-082 context).
- Method:
  - A MutationObserver marks each hero tick with `console.timeStamp`.
  - "Tick frame" is the RenderingFrame that holds the mark; f1 is the frame after it.

| per hero tick | C8 long roll (n 5) | V9 long roll (n 4) | C8 one-digit (n 37) | V9 one-digit (n 37) |
|---|---|---|---|---|
| Web Animations started | 0 | 12, 22, 15, 13 | 0 | 3-5 (mostly 4) |
| keyframes in them (total) | 0 | 1899, 6295, 4349, 1980 | 0 | 432-895 (mostly 576) |
| cell-sized paints in f1 | 2, 3, 1, 4, 4 | **6, 15, 1, 7** | 0-2 | 0-2 |
| cell-sized paints f1-f3 | 5, 9, 7, 8, 8 | 6, 17, 3, 9 | 0-5 | 0-4 |
| RecalculateStyles in the tick frame | 0-1 | 1-2 | 0-1 | 1-2 |
| layer tree changes per tick | 0 | 0 | 0 | 0 |

- No layer is created or destroyed per roll. layerTreeDidChange fired once per load and never per tick, and the earlier
  census shows constant layer counts: 77 cell layers at rest and mid-roll. The cells are already layers (cd-strip's CSS).
  So promote/demote per roll (arch-gpu-lessons' C7) does not apply here (OBSERVED, Simulator).
- What does change: backing stores. All cells of a roll get a backing store in its first frame, where C8 gives them
  one frame at a time as each cell enters the clip.
  - Long roll: up to 15 cell paints in one frame against C8's 1-4.
  - Total paints over 3 frames are similar in both arms.
- Why (CONFIRMED, WebKit source, main f61e4bfbb6a7, 2026-10-04; logic present since 2017-18, e.g. bcfdebc481 "Remove
  completed animations from GraphicsLayer, thus avoiding excessive backing store allocation"):
  - While an accelerated transform animation runs or is about to run, `RenderLayerBacking::updateAnimationExtent`
    (RenderLayerBacking.cpp l.1647-1659) sets the layer's animation extent to the bounds over the whole animation.
  - `GraphicsLayerCA::setVisibleAndCoverageRects` (GraphicsLayerCA.cpp l.1924-1932) tests that extent against the
    coverage rect.
  - `updateCoverage` (l.3088-3091) then requires a backing store.
  - So every cell whose path crosses the clip is backed from the roll's first frame.
- The second new cost is keyframe volume.
  - A one-digit roll is 144 keyframes per cell; a long 0 -> 9 roll is 343. `__crPath` keeps every 60 Hz phase within
    5e-4 cell, using up to 33 points per frame.
  - So each tick creates 576 keyframes, and a carry 1.9k-6.3k.
  - WebKit resolves one full style per keyframe (`KeyframeEffect::updateBlendingKeyframes`, KeyframeEffect.cpp
    l.1249-1271, `styleForKeyframe`). It also computes a transform for every keyframe style to get the animation extent
    (`computeExtentOfTransformAnimation`, l.2597 on). That source is CONFIRMED.
  - The per-keyframe cost on the phone is UNRESOLVED (no device timing yet).

**Reading (OBSERVED inference, not yet tested on the device):**
- On the phone, one-digit ticks have the keyframe cost and no paint burst, and they are already slower in V (12 of 54
  over 20 ms vs 0 of 59).
- Carry ticks have both costs at about 7x the keyframes, and they reach 39-53 ms.
- That points first at keyframe volume (style resolution and extent per keyframe, then the commit to the UI process),
  with the backing burst second. Which one dominates on the device is the open question.
- The decisive check is one phone attribution run with Timeline on (protocol §5.2): durations of the tick frame's
  RecalculateStyles and FunctionCall records vs f1's Paint and Composite records at carry ticks, V9 against C8.
  It goes through ops, registered before any data.
- Cheap-fix candidates. Each must be pixel-identical and checked with the existing pixel gates (roll-probe h60, simpx,
  Chrome and Simulator A/A):
  - (K) Fewer keyframes, exact. Within each 60 Hz frame the original's value is a quadratic in the frame phase
    (one semi-implicit Euler step, then affine whole frames). One keyframe per frame with a `cubic-bezier(1/3, y1,
    2/3, y2)` easing gives exactly that quadratic (x(t) = t, the degree-elevated quadratic), plus one linear keyframe
    for the 0.67 ms tail.
    - Keyframes per roll: 144 -> 54 one-digit, 343 -> 68 long. Frames where lanes snap at different times keep today's
      dense points.
    - Per tick: 576 -> about 220. Per carry: about 1.9k-6.3k -> about 0.5k-1.5k.
  - (W) Per-cell windows. Animate a far cell only while it is within 1.5 cells of the clip (fill none outside; its rest
    place is outside the clip then), so a long roll's cells carry only their own stretch of the path.
    - The backing burst probably stays: an "about to run" delayed animation still counts for the extent (to check).
  - Pre-promoting the cells at rest is not a fix here: they are already layers. Keeping their backing stores at rest
    has no CSS switch (`allowsBackingStoreDetaching` is set only for fixed-position layers, RenderLayerBacking.cpp
    l.1159-1185), so it would mean a larger clip, which changes pixels.

## K: fewer keyframes, same path (PR-017 follow-up rev; lead go 2026-10-04 ~10:0xZ)

Lead: "K: yes, build it now as the PR-017 follow-up rev (exact by construction). Use the same gates: roll-probe, simpx,
A/A, plus Simulator counts showing keyframes per tick and the backing-burst count, C9 vs K." Here C9 is V9 (the landed
cd-roll-ca) and K is the build **VK** = V9 + K: JS `b43fe790c20c…`, CSS `982a747d9263…` (cd-strip's, unchanged). The
immutable copy is `out/cd-roll-ca/snap/VK`, with its hashes in `HASHES.txt`. Only `__crPath`, `__crAt`, the new `__crQ`
and `__crPlay`'s keyframe mapping change; everything else in V9 is byte-identical.

**What changed.**
- A path point is now `[ms, value, Q]`. When Q is set, the segment that starts at the point is the exact quadratic
  `v0 + (v1 - v0)*(2Q s + (1 - 2Q) s^2)`, where s is the segment's time fraction.
- `__crPlay` writes Q as that keyframe's `easing: cubic-bezier(1/3, 2Q/3, 2/3, 1/3 + 2Q/3)`. With x controls 1/3 and
  2/3, x(s) = s exactly, and the y controls are the degree-elevated quadratic's.
- Why it is exact: one Euler step of p ms is quadratic in p, and the whole frames after it are affine in the state.
  So on [kT, kT+16] the original's value is one quadratic in the phase. On (kT+16, (k+1)T] (a 16 ms step, then one of
  p - 16 ms) it is another.
- A frame whose 33 lanes fit one monotone quadratic to 1e-9 cell becomes 2 keyframes (one per piece) instead of up to 33.
  Three extra lanes at 16 + (T-16)*j/4 check the tail piece.
- Frames that don't fit keep V9's dense points. Those are the last frames, where lanes snap to the target at different
  phases (a jump under 0.001 cell).
- Monotone means 0 <= Q <= 1, so both y controls are in [0, 1].
  - Core Animation clips out-of-range y only for an animation-wide cubic (GraphicsLayerCA.cpp l.1231-1236, WebKit main
    f61e4bfbb6a7). Here every y is in range anyway.
  - Per-keyframe cubic-bezier keeps the animation acceleratable. `linear()` with points or `steps()` would not:
    `KeyframeEffect::canBeAccelerated` l.2015-2021 under USE(CA), CONFIRMED.
  - Threaded time-based animations, the path that could take `linear()`, are off in every Safari release branch
    arch-gpu-lessons checked (UnifiedWebPreferences.yaml `ThreadedTimeBasedAnimationsEnabled`); iOS 26.6's branch is
    UNRESOLVED.
- Precision: CA casts the control points to float (`toCAMediaTimingFunction`, PlatformCAAnimationCocoa.mm l.141-145,
  per arch-gpu-lessons). So on the device "exact" means within float32, about 1e-5 px on these spans.

**Offline check** (scratch `kover.cjs`, which extracts the overlay's own `GE`, `__crQ`, `__crPath` and `__crAt` text):
- Scope: all 90 one-step rolls (from != to, 0-9), plus re-keys after a first frame 25, 40 and 90 ms late.
- Error vs the original's path (`GE(x mod T)`, then whole frames, with the original's done-snap):
  - up to the first dense segment: max 7.1e-15 cell;
  - overall: max 4.71e-4 cell (V9: 5.25e-4), in the snap frames only.
- Every Q is in [0, 1]. No path came back null.

| keyframes per cell per roll | V9 | VK (K) |
|---|---|---|
| one digit (1 -> 0) | 144 | 52 |
| long (0 -> 9) | 343 | 66 |
| all 90 rolls, total (mean) | 20,992 (233) | 5,272 (58.6) |

- arch-gpu-lessons modelled the same independently: 55-69 per cell per roll, every y in range, and no exact form with
  fewer keyframes. Adjacent pieces are different quadratics with a kink between them. Smooth sparse forms are 1.15 px
  (one step) to 11.8 px (0 -> 9) off.

**Gates (results added as they come; OBSERVED, in our setup):**
- Chrome (done 10:3xZ, shared probe slot, `out/cd-roll-ca/k1-chrome.sh`; served JS b43fe790…, CSS 982a747d…, from the
  overlay): `roll-probe.mjs --mode build` h60 on VK with V9's final-row arguments (40 s, 16 jumps, seed 11), file
  `out/cd-roll-ca/probe-build-h60-VK.json`, against `probe-build-h60-V9.json`. Position error vs the original's path,
  px, per frame:

  | | V9 max | V9 p95 | V9 p99 | VK max | VK p95 | VK p99 |
  |---|---|---|---|---|---|---|
  | rolls at a tick | 0.067 | 0.014 | 0.017 | 0.152 | 0.011 | 0.026 |
  | forced rolls (jumps) | 0.241 | 0.023 | 0.066 | 0.145 | 0.018 | 0.067 |
  | the original's own frame-to-frame variation, tick / forced (max) | 0.435 / 0.312 | | | 0.280 / 0.184 | | |

  - Both builds stay inside the original's own variation in the same run (the position rule). VK's tick max is 0.152 px
    against the 0.280 px own variation. VK's start values match the original to 0.012 px (same as V9).
  - Max keyframes per animation: 66 (V9 343), as the offline count.
  - The two runs differ by ~0.1 px at the max, in both directions (tick up, forced down). That is the size of the probe's
    own frame-phase sampling in Chrome. The path itself is equal to 7e-15 cell offline. OBSERVED, in our setup.
  - `comp-check.mjs --pause-others 2`, 6 s (`comp-check-VK-p2.json` vs `comp-check-V9-p2.json`): 0 composite failures.
    Chrome logs no compositing decision for these animations in either build (noDecision 35 / 23, as before), so this
    is not a "composited" claim. Countdown rAF 7 / 6 and countdown function calls 26 / 24 in 6 rolls.
  - Descriptive only: main frames 103 vs 79 and animation instances 35 vs 23. That is a single run each, and the roll
    mix differs (more cells animated in the VK window, e.g. a longer tens roll), so it is no per-roll comparison.
- Simulator (done 11:21Z, `sim-rollstart.mjs V9,VK 2`, shared simulator slot, fresh servers on OS ports, served JS
  582d120c9f8f / b43fe790c20c; file `out/cd-roll-ca/rollstart/rollstart-2026-10-04T11-21-25-137Z.json`; counts only,
  Simulator times never count, F-084). 21 hero ticks per load, 2 loads per arm: 19 one-step rolls and 2 long rolls (the
  ones digit's 9-step wrap) per load.

  | per hero tick, Simulator | V9 | VK |
  |---|---|---|
  | keyframes on the hero, one-step roll (4 cells) | 576 (144 per cell) | 208 (52 per cell) |
  | keyframes on the hero, long roll (15 cells), per roll | 1,908-4,349 | 882-1,368 |
  | max keyframes in one animation | 343 | 66 |
  | layer tree changes per tick (median, both classes) | 0 | 0 |
  | backing burst, long roll: cell-sized paints in the tick's frame + f1 + f2, per roll | 10, 9, 9, 12 | 11, 13, 10, 15 |
  | the same, one-step rolls: mean per roll (load 1 / load 2) | 2.7 / 2.5 | 2.7 / 2.7 |
  | style recalcs in the tick's task (median) | 2 | 2 |

  - Keyframes per tick drop 2.8x on one-step rolls and 2-3x on long ones, as the offline count said.
  - The backing burst does NOT shrink with K (as the K ticket predicted). WebKit still paints the newly animated cells'
    backing stores at the roll start. Where the burst lands (in the tick's own frame or f1) varies per roll in both arms,
    so the per-frame medians (f1: V9 6, VK 1 on long rolls) are not a difference. Long rolls: VK 10-15 vs V9 9-12,
    n = 4 each, overlapping. OBSERVED, Simulator, in our setup.
  - Descriptive only: V9 / VK medians for the long roll's tick task 68 / 58 ms and f1 41 / 20 ms (Simulator ms, not
    judged).
- Simulator frozen frames (done 11:28Z, `simpx.mjs C8,VK hero wrap,carry`, the session C setup, A/A on C8; file
  `out/cd-roll-ca/simpx/simpx-2026-10-04T11-28-50-782Z.json`; Simulator background mean 4 %, quiet), next to session C's
  V9 row (same setup, `simpx-2026-10-04T03-26-27-409Z.json`):

  | 92 shots per arm | A/A (C8 again) | VK vs C8 | V9 vs C8 (session C) |
  |---|---|---|---|
  | shots differing | **0 (exact)** | 32 | 84 |
  | max pixel delta (shots at it) | 0 | 8 (4) | 9 (18) |
  | shots with any pixel delta > 1 | 0 | 21 | 82 |
  | largest differing area, device px | 0 | 536 | 1,491 |
  | digit place / cell rects, max | 0 / 0 | 0.013 px / 0.0127 px (0 over 1/64), 0 unmatched | 0.015 / 0.01505 px |
  | shared startTime | | 98 / 98 | 98 / 98 |
  | roll end, wrap / carry (A vs B, and A/A) | | 0 px / 0 px | 0 px / 0 px |
  | layers at rest / rest + 2 s | 14 backed, 0.329 MB | 14 backed, 0.329 MB | 15 backed, 0.352 MB |

  - VK is closer to the original than V9 in every row. In our setup the likely reason is that V9 interpolates linearly
    between its sub-frame points, and a shot taken mid-segment lands slightly off. K's segments are the exact
    quadratics. What is left is WebKit drawing a layer offset rather than an inline transform (OBSERVED, Simulator, in
    our setup; the cause is a reading, not a check).
  - At rest the layers match C8 (14 backed, 0.329 MB). Session C's extra V9 backing (digit 5 cell 6) did not appear in
    this VK run.
  - A one-run difference; the A/A is exact.

```
PHONE TICKET K cd-roll-ca VK · less-work no-worse check (lead 2026-10-04 ~10:0xZ: "Before data: register the phone part
  with ops as a less-work no-worse ticket. If P-100 settles the display-rate question first, fold its result into K's
  ticket.") · ops id P-102 (BLK=P-102); ops pre-data read of 592ebb6d: PASS, all harness hashes match
build: V = VK = V9 + K, JS b43fe790c20c8fbdc6a9a8693a2f39ddc82d75b231cef68df0562cbb245cdd4c, CSS 982a747d9263ca258ad60aa773d8df4b19cf0dfec10b27a6672b1746a129007d;
  immutable copy out/cd-roll-ca/snap/VK
control: C = V9 = cd-strip strip-tc + cd-roll-ca (landed, series ends 0eb4a101), JS 582d120c9f8ffacd9ff7f8b46f11f548fc8163411ef9cc67b2e6f59ca90f18f3,
  the same CSS; copy out/cd-roll-ca/snap/V9; mirror snapshot b1789284481295-4ad4a84a
question: on the phone at real thermal Serious, does K (the same path in 4x fewer keyframes) add slow frames at the top of
  the page compared with V9? No-worse only; the landing basis is the counts (keyframes per tick, Simulator f1-f3 cell
  paints) and the pixel gates above. Descriptive: whether V9's hero roll-start frames over 50 ms (P-093) shrink.
ports: three fresh servers (I-131 interim rule: OS-assigned ports, never one that served another build today):
  `ARMS="B V9 VK" sh fixes/cd-roll-ca/phone/serve-snap.sh` (sha256 62b4706c2f86; plain http per I-003; it checks the copies
  against HASHES.txt and the served hashes). One uncounted warm-up load per arm port (A3/U5).
thermal gate, start method, sleep check: as P-093, unchanged (thermal-gate.mjs 4604218c4041 at the start and end of every
  hold, real Serious, Is Induced = No, ceiling 44 °C/Critical; pre-warm on B, at most 4 runs; pmcheck.mjs d36bd7437b7c).
holds (T2): `node tools/lock.mjs run chrome-measure --no-timing --max-seconds 900 --owner cd-roll-ca --doing "K phone hold
  Hn" -- env BLK=P-102 caffeinate -i -s sh fixes/cd-roll-ca/phone/k-hold.sh Hn <items>`, with the iphone lease held by
  cd-roll-ca. k-hold.sh (sha256 b7f9519712e3) is hold.sh with only the arms, the block id, the output folder
  (out/cd-roll-ca/pk) and the labels changed. Its last line is "HOLD Hn VALID" or "HOLD Hn VOID <why>".
  H1: wC wV C1 V2 · H2: V3 C4 C5 V6 · H3: V7 C8; then `iphone.mjs park`
block (driver W, Timeline OFF): as P-093. Warm-up C, warm-up V, counted C V V C C V V C (n = 4 per arm), --idle 8 --hold
  2 --sentinel 3. Every counted C run (V9) is the heat sentinel; a failing one voids the runs since the last pass, at most
  one extra quartet.
scorer: fixes/cd-roll-ca/phone/k-score.mjs, sha256 771820466f845597ac98e3164e11cfe60c00138f471080fdffc68ccf00056c59. It is
  P-093's score.mjs (rev 2, 57856e3f) with only the header, the usage line and the expected hashes changed (V = VK,
  C = V9). Its JSON field `scorer` still reads 'fixes/cd-roll-ca/phone/score.mjs' (left as is, ops: changing it would
  change the hash); the result names the scorer by the sha256 it prints. Checked before data on P-093's own files: V9 files as C score, and a C8 file passed as V is void (served not
  arm V). The same windows (top, idle) and the same gate.
gate (no-worse), top window: median of VK's valid runs minus median of V9's, dt > 50 (twins > 46, > 54): FALSIFIED when it
  rises by >= 2; a twin with another verdict marks it threshold-sensitive; dt > 34 (twins > 30, > 38) judged against
  [-1, +1], reported, not a falsifier; >= 3 valid runs per arm, else "not enough"
decision rows: hit -> K goes to the user as the PR-017 follow-up rev (exact path, so no new motion decision; the
  Try-it pages show V9 and VK); FALSIFIED -> K does not ship, back to the code, the lead decides; not enough after the
  extra quartet -> the lead decides
predictions (calibration, not a gate): P(hit) 0.9 (the same path and the same layers, 4x fewer keyframes; only the
  keyframe count changes). Descriptive: P(VK's median top-window dt > 50 is below V9's) 0.45. P-093 had V9 at a median
  of 1 per run (C8 0). The backing burst stays in K, so V9's extra frames may not all go.
serving code (lead 11:2xZ, I-131 landed 291ee671: no-cache + ETag, Safari revalidates ~51 lazy files per reload): this
  block runs on the I-131 serving code. The branch is rebased onto main (with 291ee671) after the Simulator gates and before
  the block; the block record names the serve.mjs sha256 it ran with. Both arms are on that code, so the gate (VK vs V9
  in this block) is unaffected. P-093's numbers (old serving code) are not compared with this block's: the descriptive
  "V9's hero frames over 50 ms" reading uses this block's own V9 runs only.
P-100 fold-in: if P-100 (display-rate diagnostic, separate ticket below) settles the display-rate question before this
  block runs, its result is added here as a note before data, without changing the gate.
minutes: ~25 (range 20-40), as P-093
queue: after fix-morph-gpu's P-098/P-099 (ops calls the turn), then `node tools/lock.mjs acquire iphone --owner cd-roll-ca
  --ttl 900 --url <B's twin> --wait 3600`, renewed between holds
```

### P-102 block log, part 1 (2026-10-04 11:42-12:09Z; OBSERVED, iPhone 15 Pro Max, Safari, driver W, Timeline off)

```
servers: ARMS="B V9 VK" serve-snap.sh 11:41Z, fresh OS ports, served JS B 4606120c / V9 582d120c / VK b43fe790, CSS
  982a747d on V9 and VK (all as HASHES.txt); serve.mjs 2ee439a95856 (I-131 code); scorer k-score.mjs 771820466f84
H1 try 1 11:42:53Z  start 34.1 C Nominal; 4 pre-warm runs on B (34.1 -> 35.7 C), gate still too cool -> VOID (exit 5),
                    no counted run
extra pre-warm (lead 11:5xZ: warm OUTSIDE the Mac hold, additive, uncounted): 12 iphone.mjs scroll runs on B
                    11:49-11:55Z, no chrome-measure hold, 36.0 -> 39.2 C (log out/cd-roll-ca/pk/prewarm/)
H1 try 2 11:56:21Z  prewarm1, start gate PASS (Serious, induced No, 39.79 -> 39.89 C, timer grid 30 ms), wC wV C1 V2,
                    end gate PASS (40.09), PMSET OK -> VALID (its k-H1-prewarm1 files replaced try 1's; try 1's
                    prewarm2-4 files remain)
H2 12:01:11Z        prewarm1, start gate PASS (40.29 -> 40.09), V3 C4 C5 V6, end gate PASS (40.19), PMSET OK -> VALID
H3 12:05:52Z        prewarm1, start gate PASS (40.39 -> 40.19), V7 C8, end gate PASS (40.09), PMSET OK -> VALID
park 12:09Z; lease released for T-113 (lead order); P-100 not started
score (k-score.mjs, top window = P-079's):
  run   arm  start C  top >50 (>46/>54)  top >34 (>30/>38)  sentinel bottom/scroll fps  status
  C1    V9   40.09    0 (0/0)            5 (6/3)            58.7 / 58.8                valid
  V2    VK   40.19    0 (0/0)            3 (3/2)                                       valid
  V3    VK   40.09    0 (0/0)            3 (4/2)                                       valid
  C4    V9   40.09    2 (2/0)            4 (7/3)            58.7 / 58.1                valid
  C5    V9   40.19    0 (1/0)            4 (9/3)            58.3 / 58.5                valid
  V6    VK   40.19    0 (0/0)            3 (3/1)                                       void (C8's sentinel)
  V7    VK   40.19    0 (2/0)            4 (5/3)                                       void (C8's sentinel)
  C8    V9   40.19    0 (1/0)            3 (3/3)            50.5 / 58.7                void, sentinel failed
  verdict: not enough (C 3 valid, V 2; need 3 each). Per the ticket: one extra quartet (C V V C), one hold.
C8's sentinel (OBSERVED in our setup, cause unknown): in the bottom phase (3.0 s) the frames ran at ~16.7 ms for
  ~0.56 s, then at 30-33 ms (the 30 Hz rhythm) to the run's end, 45 frames; not one stall. Same heat state as the
  passing sentinels (end gate Serious, induced No, 40.09 C), served hashes and marks OK, Mac quiet (no shared jobs,
  load1 3.1). Low Power Mode is not flagged, but the record reads the setting as "unknown", so LPM is not ruled out.
  LPM off 44 min later (console step C-045 on this test phone, 12:44Z), not checked at the time: LPM unlikely, not
  proven; the 30 Hz cause stays OBSERVED / open (lead 12:5xZ).
  The extra hold starts from the same warm band (39.8-40.4 C), pre-warmed outside the Mac hold (lead 12:1xZ).
descriptive (no gate; void runs left out): VK's valid top-window > 50 counts 0, 0; V9's 0, 2, 0.
```

### P-102 block log, part 2: the extra quartet and the verdict (2026-10-04 14:02-14:07Z; OBSERVED, as part 1)

```
lease 14:02Z (after T-113, iphone-runner's flick block and fix-hero-exit-threaded's PR-018 check; lead order); the same
  three servers as part 1 (B, V9, VK, ports unchanged since 11:41Z, served hashes as HASHES.txt)
H4 14:02:50Z  no extra pre-warm (phone warm after the earlier phone work, battery 42.1 C; lead 12:4xZ), the hold's own
              registered prewarm1 + start gate PASS (Serious, induced No, 41.89 -> 41.59 C, timer grid 30 ms), C9 V10 V11
              C12, end gate PASS (Serious, 40.89 C), PMSET OK -> VALID; park 14:07Z
  run outside a chrome-measure hold (lead 12:4xZ: Mac-quiet preferred, not required), beside shared groups, Mac state
  per run (mac.start/end): C9, V10 beside ts-board + ts-phone-steps (load1 15.3-15.6); V11, C12 beside ts-phone-steps +
  fix-scroll-cb (load1 18.9-19.2); a warm idle Simulator on the Mac (I-063 note)
  run   arm  start C  top >50 (>46/>54)  top >34 (>30/>38)  sentinel bottom/scroll fps  status
  C9    V9   41.59    2 (4/2)            9 (14/8)           58.7 / 52.9                valid
  V10   VK   41.50    0 (0/0)            3 (4/1)                                       valid
  V11   VK   41.19    1 (1/0)            3 (4/1)                                       valid
  C12   V9   41.09    0 (0/0)            5 (6/4)            58.7 / 59.5                valid
score (k-score.mjs 771820466f84, all four holds, out/cd-roll-ca/pk/p102-score.json, gitignored): valid runs V9 5 (C1 C4
  C5 C9 C12), VK 4 (V2 V3 V10 V11); V6, V7, C8 void as part 1
  top >50: median VK 0 - median V9 0 = 0 (twins >46 -1, >54 0: same verdict, not threshold-sensitive) -> no rise >= 2
  top >34: delta -2 (twins -3, -1.5), outside [-1, +1] on the fewer side (reported, not a falsifier)
  idle window (descriptive): >50 delta 0, >34 delta -2
VERDICT P-102: hit (K adds no slow frames at the top of the page vs V9 on the phone at real Serious). Decision row: K goes
  to the user as the PR-017 follow-up rev (the Try-it pages show V9 and VK).
calibration: P(hit) 0.9 -> hit; P(VK's median top >50 below V9's) 0.45 -> no (both medians 0).
descriptive: V9's valid top >50 counts 0, 2, 0, 2, 0; VK's 0, 0, 0, 1.
P-100 in the same lease: H1 started 14:09:58Z (fresh servers B, P100, V9, C8 by serve-snap.sh; run outside a
  chrome-measure hold like H4, beside shared groups), start read Serious, induced No, 39.79 -> 39.5 C -> PASS; records 1
  (quiet) and 2 (ca) done; at 14:12Z the lead asked for the phone for a user hand test (T-127, user steps first): the
  hold was stopped after record 2 (no end read), Safari parked, lease released 14:13:03Z. INTERRUPTED, not void by heat;
  the two records are kept as descriptive only and P-100 H1 reruns whole in a later lease.
PR-017 rev 5 (the hit row, posted 2026-10-04 ~14:27Z): options "Land K" (Try it A = fixes/cd-roll-ca-live/patch.diff
  = V9, B = fixes/cd-roll-ca-live-k/patch.diff = VK) and "Keep the accepted roll (V9)" (no page: B = A); the rev 4
  decision went stale, the user decides again. Its Chrome shots: `MOTION=1 pixels.mjs V9,VK hero` (shared probe slot;
  pixels.mjs now knows the VK copy and refuses an unknown arm: the first try at 14:16Z served the plain baseline as
  "VK", caught by its served hash 4606120c, discarded), file out/cd-roll-ca/pixels-2026-10-04T14-22-09-981Z.json:
  served JS 582d120c / b43fe790; V9 vs VK 1 of 169 shots differ (120 Hz, two jumps within 9 frames, frame 45: 130
  device px, max delta 222, the digit ~0.01 CSS px apart across a pixel edge), 136 differ in digit state by <= 0.013 px;
  V9 vs V9-again 0 of 169 (exact).
```

```
PHONE TICKET P-100 cd-roll-ca · display-rate diagnostic for F-212 (ops-assigned, mgmt-ops-10; registered before any data)
question (F-212): WebKit asks Core Animation for 80-120 Hz on every CA animation it creates (PlatformCAAnimationRemote.mm
  l.609-613, CAFrameRateRangeMake(80, 120, 120), 273122@main; CONFIRMED in source by arch-gpu-lessons). Does the phone
  honour it? While a CA-run digit roll plays, are frames shown faster than 60 Hz, and is a rAF-driven roll (the
  original's way) not? Second (arch-gpu-lessons): does a PAUSED animation keep the panel at the high rate (a paused
  animation stays on the layer at speed 0, GraphicsLayerCA.cpp l.1258-1272, and keeps the request, l.583/l.609-612)?
  Descriptive: the real page at y 0, V9 vs C8. Device timing is not judged; rates and counts only.
instrument: Xcode's 'Display', 'Core Animation FPS' and 'Thermal State' instruments on the device (xcrun xctrace record
  --device <from the WDA runner config, never printed> --all-processes, 20 s per record; installs nothing; no Web
  Inspector attached while recording, so no Timeline in the same run). Tables read (schemas from the installed
  Instruments packages, checked before data): displayed-surfaces-interval (each surface shown: start, duration, display),
  display-vsyncs-interval (the panel's vsyncs), core-animation-fps-estimate (fps per period),
  device-thermal-state-intervals. Battery °C at the start and end of each record (idevicediagnostics).
arms (all at y 0, the page at rest, no scrolling; synthetic page fixes/cd-roll-ca/phone/p100.html sha256 3bdbc016e3d4
  with its script p100.js sha256 17ddc0a9a011 (rev 2), copy out/cd-roll-ca/snap/P100, one countdown-like digit with
  cd-strip's cell layers and nothing else):
  quiet  = p100.html?m=quiet: the digit never moves (no animation, no rAF after load)
  ca     = ?m=ca: every 1 s a one-step roll as V9 plays it (V9's __crPath, literal; Web Animations on the near cells,
           easing linear, fill both, cancelled at the end)
  paused = ?m=paused: the same animations created once, paused at time 0 and left on the cells
  raf    = ?m=raf: every 1 s the same roll by the original's rAF spring (GE, literal), one inline write per frame
  V9, C8 = the real page at y 0 (all its animations running), from the snapshot copies
  p100-check.mjs (sha256 78d74d82764b, rev 2) checks each synthetic mode in Chrome before the hold (quiet: 0 animations
  and 0 writes; ca: running animations; paused: all paused; raf: 0 animations, > 20 writes; no errors, Log errors
  included).
  rev 2 (before any phone data): the first Chrome check (10:3xZ) found ca, paused and raf doing nothing. The mirror
  server sends `script-src 'self'` for a document it has no production CSP for (tools/serve.mjs localCsp), which
  blocked the page's inline script; the check missed the reason because CSP blocks reach the Log domain, not Runtime.
  Fix: the same script, moved into p100.js (2 spaces of indent less, a 2-line header comment more, code unchanged); p100-check now counts Log errors
  (favicon 404 ignored). The rev-1 copy stays as out/cd-roll-ca/snap/P100-r1. Nothing else changed: p100-hold.sh,
  p100-rec.mjs, p100-lib.mjs and p100-score.mjs keep their hashes. Mac table-reader test (10:3xZ, the Mac's own
  Display + Thermal State, 4 s): readTable/summarize read all three tables (vsync 525 rows on the built-in panel,
  118.6/s; surfaces 514 rows, 116.8/s; thermal Fair), so no p100-lib/p100-rec rev. Rev 2 check (10:50Z, Chrome,
  served from the new P100 copy): quiet 0 animations, 0 writes; ca up to 4 running animations, 144 keyframes each,
  33 writes (the rest() snaps between rolls); paused 4 paused; raf 0 animations, 858 writes; no errors: all OK.
holds: one hold after the K block (same lease if ops agrees, else its own turn after fix-morph-gpu's P-098/P-099):
  `ARMS="B P100 V9 C8" sh fixes/cd-roll-ca/phone/serve-snap.sh` (fresh ports, I-131; sha256 62b4706c2f86), then
  `node tools/lock.mjs run chrome-measure --no-timing --max-seconds 900 --owner cd-roll-ca --doing "P-100 display-rate
  hold H1" -- caffeinate -i -s sh fixes/cd-roll-ca/phone/p100-hold.sh H1 quiet ca paused raf V9 C8 C8 V9 raf paused ca
  quiet` (p100-hold.sh sha256 bab745eaaf91; per item: iphone.mjs open, then p100-rec.mjs sha256 c54490cd317c with
  p100-lib.mjs sha256 0abdda183659: 5 s settle, 20 s record). A thermal read (thermal-gate.mjs 4604218c4041) at the start
  and the end is RECORDED, not a gate: any state counts and is reported per record; the hold is VOID only at the
  ceiling (44 °C / Critical), with no thermal read, or on a Mac sleep (pmcheck). Low Power Mode caps the display at
  60 Hz: the start read's exit 6 (timer grid at 30 ms below Serious) voids the hold; at Serious the grid can't tell
  LPM apart (reported as such). n = 2
  records per arm, ABCDEF FEDCBA order.
scorer: fixes/cd-roll-ca/phone/p100-score.mjs, sha256 1afa5dbc7566b12ccf4f230c4d74363d69e01b6e8acc754483045612bb96053e,
  checked before data on synthetic records (RAISED/KEPT, NOT RAISED AT SERIOUS/NOT KEPT, NOT RAISED at Fair, a void
  record -> not enough). Per record: fastPerSec = displayed-surface gaps < 12.5 ms (faster than 80 Hz) per second;
  vsync <12.5 share. An arm needs >= 2 valid records.
outcomes (fixed before data):
  O1 RAISED when med fastPerSec(ca) >= 10, >= 5 x max(med fastPerSec(raf), 1), and med fastPerSec(quiet) <= 2;
     NOT RAISED when med fastPerSec(ca) <= 2 (read "NOT RAISED AT SERIOUS" when every record was at Serious); else UNCLEAR
  O2 KEPT when med vsync<12.5(paused) >= 0.5 and med vsync<12.5(quiet) <= 0.1; NOT KEPT when paused's <= 0.1; else
     UNCLEAR ("no vsync table" when the device trace has none)
  O3 descriptive: V9 vs C8 fastPerSec and surfaces per second, with the ratio
predictions (calibration): P(O1 RAISED) 0.55; P(raf's med fastPerSec <= 2) 0.9; P(O2 KEPT) 0.4; P(O3 V9/C8 fast ratio
  >= 2) 0.5; P(the thermal state is Serious in every record, when run right after the K block) 0.8
decisions: O1 RAISED -> F-212 becomes OBSERVED on the device (CONFIRMED in source already): the accepted page's rolls are
  shown faster than 60 Hz, a candidate for the "B feels smoother" report (T-096: added as H5, counted there; K keeps
  it, the same CA path). It also goes to fix-accent-ca and fix-morph-gpu: every CA animation costs high-rate frames
  while it runs. NOT RAISED (at Fair, or at Serious with a Fair re-run agreeing) -> F-212's rate request is not
  honoured for these rolls in our setup; T-096 keeps H1 (compositor-only frames) as the lead candidate. NOT RAISED AT
  SERIOUS -> one more hold at Fair (memory "phone checks start warm": the Fair check comes at the end), the lead
  decides when. O2 KEPT -> a finding for fix-accent-ca (its idle loop keeps animations on the layers): cancel, don't
  pause. UNCLEAR -> reported, no second block unless the lead asks.
fold into K: if P-100 settles O1 before the K block runs, the K ticket gets a note (no gate change); if not, no change.
ops notes (mgmt-ops-10 pre-data read of 592ebb6d: PASS; written here before data):
  N1 Inspector: p100-hold.sh runs `iphone.mjs open` in the foreground, and open closes its inspector socket before it
     exits (tools/iphone.mjs, open: c2.close()); each REC line comes after its open returned, so no inspector client of
     ours is attached while a record runs. The hold starts no other inspector client. If the hold log shows otherwise
     for any record, that holds for every arm alike and is logged in the result.
  N2 privacy (Hard rule 12): .trace bundles (deleted by p100-rec after the export) and the per-record .json/.tables.json
     stay in out/ (gitignored). Only the scorer's summary JSON is committed, after a check for device ids, names and
     LAN addresses.
  N3: if the Mac table-reader test forces a p100-lib/p100-rec rev, the new hashes and the diff go to ops before any
     phone data.
rev 3 (re-ticket 2026-10-04 ~14:35Z, before the rerun's data; lead order after PR-017 rev 5 accepted land-k): the
  real-page arm is VK (V9 + K, JS b43fe790, the build v8 takes), not V9. Synthetic arms, records, order and gates
  unchanged. Rerun hold H1r: `ARMS="B P100 VK C8" sh fixes/cd-roll-ca/phone/serve-snap.sh`, then
  `sh fixes/cd-roll-ca/phone/p100-hold.sh H1r quiet ca paused raf VK C8 C8 VK raf paused ca quiet`.
  p100-hold.sh sha256 693b818110a4 (real-page URLs looked up per item; a VK item); p100-score.mjs sha256 a7e0861f13a9
  (VK arm; O3 = VK vs C8 when VK has records, else V9 vs C8; O1/O2 unchanged; dry run on H1's two interrupted
  records: not enough, as before). p100-rec, p100-lib, serve-snap and thermal-gate keep their hashes. H1's two
  interrupted records (quiet, ca) stay descriptive only and are not pooled with H1r.
RESULT P-100 rev 3, hold H1r (2026-10-04 14:35:28-14:47:27Z; ops PASS a72a100f; one lease, no chrome-measure hold)
  served before item 1 (ops N1): VK JS b43fe790c20c, C8 JS 6fa0e1e8a221, both CSS 982a747d9263; P100 p100.html
  3bdbc016e3d4. 12/12 records exit 0; PMSET OK (no sleep); Safari parked. Thermal Fair at start and end (37.8 -> 36.5
  °C; the T-127 hand test cooled the phone), so every record is Fair: the Serious caveat does not apply.
  Scored on the explicit H1r list (ops N2) -> fixes/cd-roll-ca/phone/p100-H1r-summary.json (scorer a7e0861f13a9).
  arm     n  fast/s  surfaces/s  vsync<12.5  CA fps
  quiet   2  0       61.9        0           0
  ca      2  46.6    51.0        0.75        53
  paused  1  0       60.5        0           0      (record 3 VOID: no displayed-surfaces table; its vsync share 0)
  raf     2  0       26.1        0.0005      25
  VK      2  118.9   119.4       0.998       60
  C8      2  118.7   119.3       0.997       60
  O1 RAISED (at Fair): while a CA roll plays, surfaces are shown faster than 80 Hz (~47/s, gap median 8.34 ms);
     the rAF roll and the still digit never are. F-212 is now OBSERVED on the device (CONFIRMED in source already).
  O2 not enough (paused n 1). Descriptive only: both paused records show vsync<12.5 share 0, the same as quiet.
  O3 descriptive: VK and C8 both run the panel at ~120 Hz at y 0 (ratio 1.00). Something else on the page appears to
     hold 120 Hz on both builds (OBSERVED, in our setup, cause unknown; ops read: not for the user as fact), so the display rate at rest does not tell VK from C8 (not compared with V9, ops N3).
  calibration: P(O1 RAISED) 0.55 -> yes; P(raf <= 2) 0.9 -> yes; P(O2 KEPT) 0.4 -> not enough; P(O3 ratio >= 2) 0.5 ->
     no (1.00); P(all Serious) 0.8 -> no (all Fair).
  decisions (as registered): O1 RAISED -> F-212 goes to fix-accent-ca and fix-morph-gpu (every CA animation costs
     high-rate frames while it runs); T-096 H5 stays out of the closed tally. O3 = 1.00 means the user's "B feels
     smoother" is not a y-0 display-rate difference in this setup.
serving code: the same as the K block (I-131's, 291ee671; the record names serve.mjs's sha256).
order: the K block first, then this hold on the warm phone, in one lease after fix-morph-gpu's P-098/P-099 (requested
  through ops; the lead sets the phone order).
minutes: ~12 (12 records x ~45 s + 2 thermal reads)
```

## Research card T-096: why the accepted page feels smoother (registered before any data)

```
CARD T-096 cd-roll-ca research · counts only (memory "defer timing") · lead approved T-096 #3 (09:13Z) · second read: ops
rev 2 (ops second read, R1-R4; text before the card's own data; H4's Simulator input above ran at 09:41Z as the lead's
  trace task and is named as such, not counted here)
status: NOT STARTED (steps 1-3). Starts after PR-017 (cd-roll-ca) lands (landed 0eb4a101); no iPhone time; Chrome in shared probe slots
  (--shared --weight probe), the Simulator in shared simulator slots.
question: the user found the PR-017 B page (V9) noticeably smoother than A (C8). Our cost card says the countdown's own
  script fell from 23-26 calls per roll to 1, yet the whole page's Simulator work barely changed (203-223 page updates
  per 4 s on both builds). What per-frame work differs between A and B while digits roll, and while scrolling?
hypotheses (untested guesses until counted):
  H1 (lead's addition) on B the digits move in frames with no main-thread frame (compositor-only updates); on A every
     digit move needs a main-thread frame (rAF spring, style, paint, commit).
  H2 on A the spring's ~30 rAF/s for half of each second puts extra main-thread frames next to scroll frames, and those
     sometimes miss or arrive late (A's > 34 rows, P-093: B had more > 50 frames on the phone, so H2 may not be what the
     user felt; recorded either way).
  H3 nothing per frame differs beyond the countdown's own script; what the user saw was a page or build difference (stale
     files, I-131), ruled in or out by step 1.
  H4 (R1, the lead's trace task; P-093: V3 51 ms at y 999, V6 111 + 77 ms at the W scroll start, V2 51 ms and V7 53 ms
     idle at y 0) on B a roll start costs one longer frame, from starting the per-cell animations at the tick (style per
     keyframe, animation extent, backing stores, commit), where A spreads its work over rAF frames.
step 1 build identity: 5422 = C8 copy, 5423 = V9 copy (the user's PR-017 pages): crawl-diff of the whole static graph
  against the snapshot copies (scratch crawl-diff.mjs, committed with the addendum) and the served JS/CSS hashes, plus
  the cache headers as served (R4: I-131's fix, no-cache + ETag, is NOT landed at this text; recorded either way, with
  whether it is landed at run time). Any mismatch -> H3 confirmed, stop, report. Ports (R4): 5422/5423 are checked
  against ts-i131's audit method (no other build served on them today); steps 2-3 never use them: each arm gets its own
  fresh server on an OS-assigned port, hash-checked, no-cache (as sim-rollstart.mjs).
step 2 Chrome (430x932 DPR 3, headless, 60 Hz as the cost card; arms A, B, A2 = a second server on the A copy; 3 loads
  each, A B A2 / B A2 A / A2 A B): per load, window R = 8 s at y 0 (clock rolling), window S = a scripted scroll through
  the hero (the W path, 3 s). Per window, counted from one CDP trace (devtools.timeline, cc, viz categories):
  frames presented; BeginMainFrame count; frames with a compositor update and no BeginMainFrame (H1's count);
  rAF callbacks (all, and the countdown's, tagged); countdown FunctionCalls per frame (arch-gpu-lessons C3: PipelineReporter's
  has_main_animation is page-wide, so the per-element signal is the countdown's own calls, as its held.mjs);
  UpdateLayoutTree, Layout, Paint, Commit events; frames whose main-thread part was dropped or late (PipelineReporter
  states). H4 per roll start (both windows): in the frame where the animations start, Commit and layer-tree update
  events, layers created or destroyed per roll, main-thread events in that frame (counts and types).
step 3 Simulator (WebKit Timeline on in every arm): RenderingFrame records, script/style/layout/paint/composite
  records per window; H4: the RenderingFrame holding the roll start (marked by a console.timeStamp from a hero
  MutationObserver) and the next one, with their child record types and counts (no ms judged, F-084).
  Platform claim (R2): WebKit runs an accelerated CSS/Web animation as a Core Animation animation in the UI process, and
  the web process does not tick it while it runs, so those frames leave no web-process Timeline record. CONFIRMED by
  arch-gpu-lessons (research/gpu-lessons/README.md §1.2: KeyframeEffect.cpp ticksContinuouslyWhileActive l.2672-2677;
  PlatformCAAnimationRemote.mm). H1's Simulator reading depends on it: H1 shows there only as fewer RenderingFrame
  records per roll on B (stated before data, not a gap).
statistic (R3): per count and window, d = med(B) - med(A) over the 3 loads per arm; spread s = max over the 3 load
  positions of |A_i - A2_i|; a difference counts only when |d| > s (both printed).
outcome: H1 holds when B's compositor-only frames per roll > 0 and A's = 0 (within s), and B's BeginMainFrame per
  roll falls by more than s; H2 is reported from window S (main-thread frames next to scroll frames, A vs B); H3 from
  step 1; H4 holds when B has work at the roll start that A lacks (record types or counts in that frame), beyond s.
  If H4 holds and its cost split stays open, one phone attribution ticket (Timeline on, protocol §5.2), registered
  through ops before any data, asks which part dominates on the device.
deliverable: one plain list per window of what changed per frame; if one item stands out, it names which other
  animations (hero, top-bar morph, end-of-page morph) to try next (T-096 item 2, a new card).
calibration: P(H1 holds) 0.8; P(H2 shows a difference over the spread in S) 0.4; P(H3) 0.05; P(H4 holds) 0.85 (set
  after the lead's trace data in the section above was seen; it is not a blind prior).
tools: crawl-diff.mjs, a trace counter t096-count.mjs and the existing Simulator Timeline reader; hashes frozen in an
  addendum here before the first load.
```

### T-096 addendum: tools frozen before the first arm load (2026-10-04 ~11:50Z)

```
ADDENDUM T-096 · written before any arm load (A, B, A2); the only loads so far are 3 tool checks on the plain
  baseline copy B (not an arm) · P(H4) 0.85 stays out of the calibration tally (set after the lead's trace data)
step 1 (adapted, lead approved 2026-10-04 ~11:3xZ): the PR-017 servers on 5422/5423 were stopped at the lead's T-106
  request before step 1 could crawl them, so step 1 rests on (a) the command lines recorded at stop: both were
  tools/serve.mjs --root site-pretty with --overlay out/cd-roll-ca/snap/C8 (A, 5422) and --overlay
  out/cd-roll-ca/snap/V9 (B, 5423), --vendors=local, on serve.mjs from before I-131's fix (immutable cache headers);
  (b) the served hashes posted with the links (A JS 6fa0e1e8 / CSS 982a747d, B JS 582d120c); (c) today's HASHES.txt
  check of the copies: OK (C8 JS 6fa0e1e8a221, V9 JS 582d120c9f8f, both CSS 982a747d9263); (d) the 116-path
  static-graph crawl run on the PR-017 pages before the card (reported to the lead at the time; its script was a
  scratch file, not committed). crawl-diff.mjs is
  N/A (not written; nothing left to crawl). H3 reads from (a)-(d): the user's pages served the ticketed copies; the
  cache question (an older file kept by the browser) is not answerable now and is stated as open, not as ruled out.
frozen tool hashes (sha256, first 12):
  fixes/cd-roll-ca/t096-count.mjs   849f26e9f8c5  (step 2 counter)
  fixes/cd-roll-ca/sim-rollstart.mjs 01351e543210 (step 3 Simulator reader)
  tools/serve.mjs                   2ee439a95856  (I-131 code: no-cache + ETag, landed 291ee671)
  tools/lib/cdp.mjs                 f58d75d1179d
  tools/sim.mjs                     248931edf42d
tool checks on B (baseline copy, not an arm; out/cd-roll-ca/t096/smoke/, gitignored), what they changed:
  smoke 1-2: CDP Input.synthesizeScrollGesture repeatCount is the number of EXTRA repeats, so repeatCount 1 scrolled
    twice (endY 3708 for 1864; CONFIRMED by the CDP Input domain docs, chromedevtools.github.io/devtools-protocol/tot/Input,
    synthesizeScrollGesture.repeatCount "The number of times to repeat the gesture (default: 0)"): now omitted, endY 1864;
    Commit is also traced off the main thread: main-thread work (UpdateLayoutTree, Layout, Paint, Commit, Layerize,
    UpdateLayer) is now counted on the renderer main thread only (Commit 952 -> 480 = BeginMainThreadFrame 480 in R);
    PipelineReporter reuses its local id (every reporter 0x1) and keeps its state in args.frame_reporter.state: a
    reporter is now the span from its b to its e on one (renderer pid, tid, id), in ts order (0 -> 545 reporters in R).
  smoke 3 (B, R window, 8 s, 60 Hz): 480 frames drawn, 545 presented reporters, of which 65 had no main-thread stage
    (64 of them STATE_PRESENTED_PARTIAL). So "compositor-only" reporters exist on the baseline without any per-cell
    animation; H1's count is read as written (presented with no SendBeginMainFrameToCommit), and the counter also
    prints the split by state (compositorOnlyByState), so a PARTIAL-only difference can be told apart. The H1 outcome
    rule is unchanged.
ops pre-data read (mgmt-ops-10, 2026-10-04 after 12:20Z): PASS. All 5 frozen hashes match at 387d7f20; the tools/ files
  are identical on main (tools/lib/sim.mjs 7167d5e8a297 too); if one changes before the last arm load, its new hash goes
  here before that load. Step 1 stated as is (cache question open; crawl-diff N/A). Notes for the write-up:
  N1 read H1 as A vs B against the A vs A2 spread, never as an absolute count (the baseline already shows 65
     compositor-only reporters per 8 s, 64 PRESENTED_PARTIAL); a PARTIAL-only difference is reported as its own row.
  N2 (next to H3) the step-2 arms are served with the I-131 code (no-cache + ETag), the user's PR-017 pages had the old
     immutable headers: a cache-linked effect the user felt cannot be reproduced here.
  No ledger row (T-096 has no P-id); P(H4) stays out of the tally.
```

### T-096 step 2 result: Chrome counts, A (C8) vs B (V9) (2026-10-04 13:04-13:15Z)

```
RESULT T-096 step 2 · run before P-102/P-100 with the lead's OK (no dependency; ops told) · 3 shared probe slots
  (weight 1), one order each (A B A2 / B A2 A / A2 A B), 9 loads, 0 errors · Chrome/154.0.8037.97 headless, 60 Hz
  frame clock · frozen hashes at run time: t096-count 849f26e9f8c5, serve.mjs 2ee439a95856, cdp.mjs f58d75d1179d (same
  as the addendum) · one served JS/CSS hash per arm, checked against HASHES.txt · gesture 1864 px, scale 1
data: out/cd-roll-ca/t096/t096-2026-10-04T13-*.json (gitignored); per-load summary fixes/cd-roll-ca/t096-step2-summary.json
  (fixes/cd-roll-ca/t096-agg.mjs). Statistic as registered: d = med(B) - med(A), s = max over the 3 rounds |A_i - A2_i|,
  a difference counts only when |d| > s. Counts per window, never durations.
window R (8 s at y 0, 8 rolls per load), A / A2 / B per load, d, s:
  main-thread frames (BeginMainThreadFrame = Commit = Layerize = UpdateLayoutTree):
     A 394 384 382 | A2 393 385 388 | B 316 315 322 -> d -68, s 6: DIFFERS (per roll 48 -> 39.5)
  presented with no main-thread stage (H1's count): A 86 97 98 | A2 88 98 118 | B 164 165 158 -> d +67, s 20: DIFFERS
  N1 PARTIAL-only row: STATE_PRESENTED_PARTIAL A 0 0 0 | A2 0 0 25 | B 0 0 0 -> no A vs B difference; the 25 sit in one
     A2 load only and set s for the row above (counting PRESENTED_ALL only, s would be 5; d stays +67)
  frames drawn 480-483 every load, dropped 0 (one A2 load 1): no difference
  countdown rAF A 274 272 281 | A2 220 252 242 | B 8 9 9 -> d -265, s 54 (expected: the spring is gone)
  countdown FunctionCalls A 290 288 297 | B 32 34 34 -> d -256
  UpdateLayer A 44005 med | B 36210 med -> d -7795, s 658 (follows the main-thread frames)
  Paint A 1155 1058 1056 | A2 1146 1122 1159 | B 1050 1047 1071 -> d -8, s 103: no difference
  Layout A 15 19 18 | B 17 18 17 -> d -1, s 2: no difference
window S (touch scroll through the hero, 3 s):
  main-thread frames A 189 184 179 | A2 190 191 187 | B 188 189 189 -> d +5, s 8: no difference
  presented with no main-thread stage 188 in every load of every arm
  dropped frames A 8 12 18 | A2 8 8 13 | B 10 8 7 -> d -4, s 5: no difference; PRESENTED_PARTIAL A 6 10 16 | B 8 6 6 ->
     d -4, s 5: no difference
  rAF (all) d -32, s 141; UpdateLayoutTree d +10, s 20; Layout d -1, s 11; Paint d -43, s 164; UpdateLayer d +425,
     s 886: no difference. Countdown rAF A 53 67 47 | B 3 3 2 -> d -50, s 32 (expected)
roll start (H4), the frame from the tick to the second BeginMainThreadFrame after it, every roll in every arm
  (R: 24 rolls per arm; S: 9-10): 1 Commit, 1 Layerize, 112-116 UpdateLayer, 1 UpdateLayoutTree, 0 Layout, Paint 0 or
  4 in 0 or 1 layer (alternating), the same in A, A2 and B; in S Paint 2-9 in 1 layer on all arms (one A2 roll 102).
  Layers per roll (window L, LayerTree): +4/-0, +3/-3, +0/-4 in the same repeating pattern on all arms (the strip's
  own churn, which C8 and V9 share). No work at B's roll start that A lacks.
outcome (rules as registered):
  H1 NOT HELD as worded: B has 67 more frames with no main-thread stage and 68 fewer main-thread frames per 8 s (each
     beyond s), the direction H1 predicts, but A's count is not 0 (86-98 per 8 s, about 12 per roll), and the
     page-wide count cannot say which of those frames carry a digit move. Scored as a miss for P(H1) 0.8.
  H2 no difference in window S beyond the spread (main-thread frames, dropped, PARTIAL). Scored: no (P 0.4).
  H3 from step 1 (no mismatch found in what could be checked). N2: the step-2 arms run with the I-131 code (no-cache +
     ETag); the user's PR-017 pages had the old immutable headers, so a cache-linked effect cannot be reproduced here.
  H4 not shown in Chrome: the roll-start frame is the same on all arms. Step 3 (Simulator, WebKit Timeline) still reads
     H4 where the phone's long frames were seen; P(H4) 0.85 stays out of the tally.
what stands out (deliverable, descriptive): with the countdown's rAF gone (B: 8-9 rAF per 8 s), B still runs 316
  main-thread frames per 480 drawn at y 0 (2 in 3), each with a style recalc, about 1050 paints per 8 s, and no rAF
  behind them. Something other than script (a CSS or Web animation that needs the main thread, or a timer) keeps
  the main thread busy at the top of the page on both builds. Which element is not counted here; finding it is the
  T-096 item 2 candidate (a new card), next to the hero, top-bar morph and end-of-page morph.
caveat (tool, OBSERVED in our setup, cause unknown): in window S there are about 2 presented reporters per drawn frame
  (368-380 for 192-195 draws; R is 1:1), so the S "no main-thread stage" count includes reporters split off a frame,
  not only whole frames. It is the same on every arm, so d is unaffected; not checked against Chromium source.
next: step 3 (Simulator, sim-rollstart 01351e543210, shared simulator slots), then the T-096 write-up.
```

### T-096 step 3 result: Simulator (WebKit Timeline) counts, A (C8) vs B (V9) (2026-10-04 13:20-13:39Z)

```
RESULT T-096 step 3 · lead OK to run now (13:1xZ) · 3 shared simulator slots, one round each: "C8,V9,C8" (A B A2),
  "V9,C8,C8" (B A2 A), "C8,C8,V9" (A2 A B), 1 rep, functional session, Timeline on in every arm, window 21 s at y 0,
  9 loads, 0 VOID (served JS/CSS hashes checked per arm) · sim-rollstart 01351e543210, tools/sim.mjs 248931edf42d,
  tools/lib/sim.mjs 7167d5e8a297 (as the addendum) · counts only, no Simulator time judged (F-084)
data: out/cd-roll-ca/rollstart/rollstart-2026-10-04T13-{24,29,39}*.json (gitignored); per-load summary
  fixes/cd-roll-ca/t096-step3-summary.json (fixes/cd-roll-ca/t096-agg3.mjs; the C8 rows of a round are labelled A/A2
  by position). Same statistic as step 2: d = med(B) - med(A), s = max over rounds |A_i - A2_i|.
ticks: 21 stamped per load in every arm (2-3 "long" carries, 18-19 one-digit); B samples 4 animated cells per tick,
  144 keyframes per animation, 576 per tick (A: no Web Animations).
whole window (21 s): RenderingFrame records A 1139 1122 1126 | A2 1136 1126 1113 | B 1055 1006 1051 -> d -75, s 13:
  DIFFERS (about 3.6 fewer web-process rendering frames per roll on B). LayerTree changes 1 per load on every arm
  (the Simulator sends no per-roll layer events here; no reading).
roll start (H4): the tick's own task is a RenderingFrame in every load (one A2 load also had a TimerFire one), per load
  summed over its 21 ticks:
  RecalculateStyles in the tick's frame A 21 15 18 | A2 16 18 16 | B 40 40 41 -> d +22, s 5: DIFFERS (about 2 style
     passes per tick on B, about 0.8 on A)
  Layout in the tick's frame A 15 14 14 | B 15 14 15 -> d +1, s 1: no difference
next frames (the first 4 RenderingFrames after the tick's task):
  frame 1: Paint A 30 29 32 | A2 32 29 29 | B 28 37 24 -> d -2, s 3: no difference; cell-sized Paint d -2, s 3: no;
     RecalculateStyles A 21 21 21 | B 17 18 19 -> d -3, s 1: fewer on B; Layout and Composite the same (14-16, 21)
  frame 2: Paint A 21 23 24 | A2 19 23 19 | B 15 21 14 -> d -8, s 5: fewer on B; cell-sized Paint A 16 18 19 | B 10 11 9
     -> d -8, s 5: fewer on B; RecalculateStyles d -3, s 1: fewer on B
  frames 1-4 summed: Paint d -6, s 15; RecalculateStyles d -10, s 20 (one A2 load 105): no difference
  FireAnimationFrame in frames 1-4: A 100 92 100 | B 6 6 6 (expected: the spring is gone)
outcome (rules as registered):
  H4 HOLDS in the Simulator: B's roll-start frame has work A lacks, one extra style pass per tick (40 vs 18 per 21
     ticks, beyond s 5), the per-cell animations starting (576 keyframes per tick); no extra layout. Chrome showed no
     such difference (step 2: 1 UpdateLayoutTree per roll start on every arm). Which part of that pass dominates on the
     device (keyframe count, animation start, backing) stays open: per the card, at most one phone attribution
     ticket (Timeline on, protocol §5.2), registered through ops before any data, and only if the lead asks.
     P(H4) 0.85 stays out of the tally.
  H1's Simulator reading (stated before data: fewer RenderingFrame records on B) is seen: -75 per 21 s, beyond s 13.
     The registered H1 rule is the Chrome one (step 2: not held as worded); this does not change that score.
  F-229 on WebKit: at y 0 the web process still makes about 50 RenderingFrames per second on B with 6 rAF callbacks per
     84 frames after ticks, so the rAF-less main-thread frames of step 2 have a WebKit twin (Simulator, OBSERVED).
link to K (P-102): K writes the same spring as fewer quadratic keyframes; whether the extra roll-start style pass
  shrinks with the keyframe count is not tested here (not registered).
```

### T-096 write-up (closed 2026-10-04 ~13:50Z)

```
CLOSED T-096 · steps 1-3 done (step 1 adapted, addendum; step 2 27051a21; step 3 0f2d4129) · counts only · lead
  13:4xZ: no new card and no phone attribution ticket now
question: what per-frame work differs between A (C8) and B (V9, the page the user found smoother)?
what changed per frame, at y 0 (rolling clock):
  - B runs fewer main-thread frames: Chrome 316 vs 384 per 8 s (s 6), the Simulator 1051 vs 1126 RenderingFrames per
    21 s (s 13), about 3.6 fewer per roll; the frames drawn are the same (480 per 8 s in Chrome).
  - B has more frames with no main-thread stage in Chrome: 164 vs 97 per 8 s (s 20); A is not at 0.
  - The countdown's own rAF and calls are gone on B (as the cost card).
  - At each roll start B does one extra style pass in WebKit (40 vs 18 per 21 ticks, s 5; layout the same), the per-cell
    animations starting (576 keyframes per tick); Chrome shows no roll-start difference.
  - The second frame after a tick paints less on B in WebKit (cell-sized paints 10 vs 18 per 21 ticks, s 5).
what changed per frame while scrolling through the hero (Chrome): nothing beyond the spread except the countdown's rAF.
hypotheses: H1 not held as worded (direction seen in Chrome and the Simulator; A is not at 0); H2 no difference;
  H3 not found in what could be checked, and a cache-linked effect cannot be reproduced (N2); H4 held in WebKit, not
  in Chrome.
calibration tally: P(H1) 0.8 -> miss; P(H2 differs) 0.4 -> no; P(H3) 0.05 -> no; P(H4) 0.85 out of the tally (set
  after the lead's trace data).
plain reading: B takes main-thread work off most of the countdown's frames, and the frames left are no more work per
  frame, except a style pass at each roll start in WebKit. That fits "B looks smoother at the top" without proving it
  (no timing, memory "defer timing").
open items (no card, no ticket now, lead 13:4xZ):
  O1 which part of B's extra roll-start style pass costs time on the device (keyframe count, animation start,
     backing); a phone attribution ticket (Timeline on, protocol §5.2) would answer it.
  O2 whether K (fewer quadratic keyframes, P-102) shrinks that pass; not registered, not counted.
item 2 (which other animations next): the main-thread frames that stay at y 0 with no rAF (F-229, Chrome and WebKit;
  F-227) are the subject of fix-hero-exit-threaded and fix-toolbar-resize; left to them (lead).
```

## Ticket P-097: panel clock roll (#1), less-work, m-gate (registered before any data)

**Rev 4 (2026-10-05, below the rev 1-3 block) supersedes revs 1-3 in full**: new base C = v9-final, the hold at m = 1 is
the page-end rest, new predictions Q1-Q6 replace P1-P5. Revs 1-3 stay as history.

```
TICKET P-097 cd-roll-ca panel clock roll · less-work item (lead 10-03 12:2xZ, F3 handoff #1 in fixes/nav-morph/README.md
  "Handoff"); id from mgmt-ops-10 (e51b686c, 10-04 07:2xZ). Registered here before any build or data; second read: ops.
status: NOT STARTED. Starts only after cd-roll-ca (V9) lands; stacks on the landed sha (`fix.mjs combine --on`), its own
  branch. countdown-faces (b) is a separate item on the same base; whichever starts second rebases on the first.
build V10 = V9 + the panel clock (`.start-selling-morph-panel .waitlist-closing-countdown`, `.countdown.inverse`) on the
  same per-cell Web Animations roll, gated to m in {0, 1} (no morph tween running). While 0 < m < 1 the panel keeps the
  original rAF spring. A roll running when a tween starts is handed to the spring at its current value (one write, no
  restart). Hero code path unchanged. Hashes (JS, CSS, patch) go into this ticket as an addendum before the first run.
control: C = V9 as landed (panel on the spring); A/A = C vs C2 (a second load of C) for every count and pixel rule.
why the gate: layered rolling cells repaint whole when the resizing panel moves them by a sub-pixel offset (the cdwc
  mechanism, RenderLayerBacking, CONFIRMED in fixes/nav-morph/README.md), so a roll overlapping a tween could make
  tween frames worse. The panel clock's layering is fix-nav-morph's cdwc rule: fix-nav-morph is told before any edit.
no timing: counts and pixels only (memory "defer timing"); Chrome in shared probe slots, Simulator in shared
  simulator slots. The less-work rule's short phone no-worse check is a separate ticket (new P-id) after P1-P5 pass.
predictions (each scored C vs V against the C/C2 A/A):
  P1 less work at the hold (m = 1, panel up, 4 s windows, Chrome 430x932 DPR 3): panel-countdown rAF callbacks
     V <= 10 % of C (C expected ~100-130 per 4 s: ~30/s for half of each second, fix-nav-morph); style recalcs V < C.
  P2 the m-gate holds: in a scripted pass through the morph tween (Chrome and Simulator), 0 running panel-cell
     Web Animations in every frame with 0 < m < 1 (getAnimations census per frame), and panel rAF counts in tween
     windows within C +/- the A/A spread.
  P3 tween frames no worse (Simulator, WebKit Timeline counts): Paint records per tween frame V <= C + A/A; layer
     count and backing during the tween V = C (any extra backed cell is reported, F-201).
  P4 pixels: at rest (m = 1, between rolls) and with reduced motion: exact (T0) vs C in Chrome and the Simulator;
     mid-roll frames at the hold: within T2 (PR-010 wide numbers: fill 64, edge 128, 0.5 %) in the Simulator; Chrome
     mid-roll frames are reported with the five numbers (the hero showed edge 222, so a Chrome T2 miss is expected and
     goes to the user as part of the panel's motion-difference decision, not as a pass).
  P5 hand-off at tween start: the panel digit position jumps <= 0.5 CSS px in the first spring frame (roll-probe).
outcome: all of P1-P5 -> a D card plus the user's decision (PR-017's land decision covers the hero clock only; the
  panel needs a rev or a new proposal with Try-it). P1 miss -> dropped (no less work). P2/P3 miss -> fix the gate once,
  re-register; a second miss parks the item. P4 T0 miss -> stop, report to the lead.
voids: served JS/CSS hash != addendum; BASELINE-<STATE> other than ok; A/A over the P4 thresholds (the run is
  A/A-limited and goes to the lead); countdown expiry 2026-11-02 05:00Z inside a run.

rev 2 (ops second read R1-R7, 10-04 08:4xZ; still before any build or data). Scoring detail, overrides rev 1 where
  they differ:
reps and order (R2): 3 arms C, V, C2 (C2 = a second, separately started server on the same C snapshot copy). Per
  platform 6 reps per arm in two rotated Latin squares, C V C2 / V C2 C / C2 C V, twice (18 loads per platform, one
  page load per rep, fresh tab). A rep is valid when its page reached m = 1 and the census probe ran to the end;
  a verdict needs >= 5 valid reps per arm on that platform, otherwise that platform's predictions are VOID (re-run
  once, then report).
A/A spread (R3), one definition for P1-P3: for each measure, spread = max over the paired reps of |C - C2| (reps
  paired by square position). Cap: a spread over 25 % of C's median voids that measure (A/A-limited, to the lead).
"less than C" means V's median < C's median minus the spread (P1); "within C +/- spread" means |V median - C median|
  <= spread (P2); "V <= C + A/A" means V median <= C median + spread (P3).
P1 windows and counts (R7, R1): per rep, after the panel reaches m = 1 (morph driver's m log, first frame m = 1) plus
  2 s to settle, 3 consecutive 4 s windows; a rep's value = the median of its 3 windows. Counts: panel-countdown rAF
  callbacks (the census probe counts callbacks whose stack/target is the panel countdown's spring, by a wrapped
  requestAnimationFrame tagged at the call site); style recalcs = CDP trace UpdateLayoutTree events in the windows
  (Chrome), WebKit Timeline RecalculateStyles records (Simulator). Pass: rAF V median <= 10 % of C median AND style
  recalcs V median < C median - spread.
P2 tween window (R4): from the first frame with m > 0 to the last frame with m < 1, from the morph driver's m log.
  getAnimations() census every frame inside it (panel `.cell` elements, playState running). Pass: 0 running in
  every frame of every valid rep; panel rAF counts in the window within C +/- spread.
P3 (R4): per rep, Paint records per tween frame = (sum of WebKit Timeline Paint records in the tween window) / (frames
  in the window); the rep value is that ratio; pass on the medians as above. Layers/backing: the layer census at
  the tween's middle frame, V = C in every rep.
tools (R5): scorer `fixes/cd-roll-ca/tools/p097-score.mjs`; census probe `p097-census.mjs` (getAnimations per frame,
  rAF tag, m log reader); roll-probe (P5) = the existing hero roll-probe extended to the panel selector; pixels
  `tools/lib` pixel compare used for PR-010 (fill/edge/% numbers); Simulator Timeline reader = the round-4 WebKit
  reader in this README "WebKit frames, layers and Timeline". All committed, and their sha256 plus the served
  JS/CSS/patch hashes written into an addendum here, before rep 1. Any change after that voids the reps measured
  before it.
calibration (R6): P(all of P1-P5 pass) = 0.45. Miss branches: P1 miss 0.10 (the panel spring runs only half of each
  second and the census finds other rAF users); P2 miss 0.15 (a roll started in the frame m leaves 1 escapes the
  gate); P3 miss 0.15 (cdwc repaint at the tween edges); P4 T0 miss 0.05; P5 miss 0.10 (hand-off writes the target,
  not the current value). P1 point estimate: V panel rAF callbacks per 4 s = 4 (one per roll start), 80 % interval
  2-12; C reference 100-130 per 4 s.
rev 3 (ops N1-N4, 10-04 09:0xZ; still before any build or data):
N1 a pair (same square position) with C or C2 invalid is dropped; the spread is computed over the valid pairs, at
  least 4, otherwise that measure is VOID.
N2 the calibration branches are exclusive outcomes: the first failing prediction in the order P1, P2, P3, P4, P5;
  P(all pass) 0.45 + 0.10 + 0.15 + 0.15 + 0.05 + 0.10 = 1.
N3 platform scope: P1 passes on Chrome (430x932 DPR 3) alone; the Simulator rAF and RecalculateStyles counts are
  descriptive. P2 needs both platforms (the census in Chrome and the Simulator); P3 is Simulator-only; P4 T0 needs
  both, T2 Simulator only (Chrome mid-roll descriptive, as in rev 1).
N4 P5: every valid rep's first tween start (Chrome and Simulator), pass = the maximum jump over all of them <= 0.5 CSS
  px. P4: per arm and platform, one rest shot (m = 1, between rolls) and one reduced-motion shot per rep, taken at
  the rep's end after the P1 windows (same square position, so 6 + 6 per arm and platform).
Timeline: WebKit Timeline is on in every Simulator arm and rep (protocol §5.2), since P1 (descriptive) and P3 read it.
```

### P-097 rev 4: base v9-final, the page-end rest is the hold (2026-10-05, before any build or data)

```
TICKET P-097 rev 4 · cd-roll-ca panel clock roll · less-work item #1 · fix-cd-roll-ca-r4 (takes over P-097 from
  fix-cd-roll-ca) · lead's re-base after int-v8's "Page-end rest split" (10-05) · counts and pixels only, no timing ·
  second read: ops (mgmt-ops-10)
status: DRAFT, before any build or data. Starts after v9-final lands on main, on the lead's word. Supersedes revs 1-3
  in full: their arms (C = V9, V = V10), predictions P1-P5, calibration and outcome rules no longer apply. Where rev 4
  keeps a rule (reps, A/A spread, voids) it restates it here, so this block reads on its own.
rev 4.1 (ops pre-data read of f6251d6f: NOT YET, M1-M4 + S1 + 2 notes; text only, still before any build or data;
  answered in place below): M1 shots move to separate shot loads under the frozen-clock shim (step 4); M2 Chrome
  exactness takes the 10-04 form with a named mask (Q5); M3 Q4 layers get an A/A rule; M4 the rAF-callback and
  frame-assignment rules are in the metric definition; S1 m is read before and after the rest windows (step 3, per-rep
  validity for Q1/Q2); notes: Q2a's C expectation re-worded, the logger's read point named (step 2).
why now: v9-final rests at the page end with the menu open (rev 7c, PR-018: m = 1 at the end of its 100lvh spacer).
  The panel clock is in view there, ticks once a second (countdown-tick's timeout chain, F-267) and rolls its digits
  on the original rAF spring: v9-final JS 647c9ef2b1e2 line 4326 (`function i`, cd-roll-ca's "no strip yet or no
  path" fallback, comment at 4322), because the per-cell Web Animations roll is hero-only by the test
  `!__crEl.closest('.inverse')` at 4286-4291. int-v8's page-end rest split (fixes/v9-best/README.md "Page-end rest
  split", branch worktree-agent-a068af37646232e05 at aaa18038; Chrome census rest-end, one load per arm, OBSERVED in
  our setup): v9-final 27-60 mainFrames/s vs v8's 0-0.2 at its page end; panel spring 29-37 rAF/s plus 1 tick/s; v8
  runs the same spring whenever its panel is held open (A-open 31.8/s).
arms (one snapshot, every arm built and hashed before rep 1):
  C  = v9-final as landed. Until it lands, the pins: JS 647c9ef2b1e2 / CSS e1359ab9994a (patch.diff 4196eaa61d96,
       baseline snapshot b1789284481295-4ad4a84a). If the landed bytes differ, the addendum names the landed hashes and
       marks the C reference below "measured on the pins, not the landed build".
  V  = C + the panel clock (the `cD` instance with `inverse: !0` in the morph panel, JS 14631-14640) on cd-roll-ca's
       per-cell Web Animations roll, gated to m in {0, 1}: the `.inverse` exclusion at JS 4289 becomes "the hero, or the
       panel while m is exactly 0 or 1", where m is the panel's morph value `x` (JS 13840). Every m writer in v9 sets
       `x` (scroll-linked `__navMorphSet` at 14316-14324, the settle's smooth scroll through it, the ZM tween at 14326),
       so the gate covers all of them. While 0 < m < 1 the panel keeps the original spring. A roll running when m leaves
       {0, 1} is handed to the spring at its current value (one write, no restart). The hero path stays byte-identical.
       CSS expected unchanged (any CSS change is named in the addendum). JS, CSS and delta-on-C hashes go into the
       addendum before rep 1.
  C2 = C again on a second, separately started server (same snapshot copy, its own port): the A/A for every count and
       pixel rule.
the hold: the hold at m = 1 is now the page-end rest itself (scroll to the end, m = 1 by rev 7c's spacer). No debug
  morph driver holds the panel open (int-v8: A-open's driver logger runs 60 rAF/s, so its frames do not compare).
C reference (OBSERVED, int-v8's split on the pins, one load per arm, a 6 s window after a 32 s settle at the end): panel
  spring about 120-150 rAF callbacks per 4 s (29-37/s), 1 tick/s; mainFrames/s 27-28 (D, E, G; V's earlier full
  census 29.2) or 60 (V, N, S), the same build reading both levels on different loads.
why the gate (as rev 1): a layered rolling cell repaints whole when the resizing panel moves it by a sub-pixel offset
  (cdwc, RenderLayerBacking, CONFIRMED in fixes/nav-morph/README.md); m in {0, 1} means the panel's scale is not
  changing. The panel cells' layering is fix-nav-morph's cdwc rule: fix-nav-morph is told before any edit.
platforms and slots: Chrome headless, 430x932 DPR 3, touch, no CPU throttle (the frame-audit census conditions int-v8
  used), shared probe slots (`--shared --weight probe`); iOS Simulator in shared simulator slots, WebKit Timeline on in
  every arm and rep (protocol §5.2). No iPhone, no timing (memory "defer timing"). The less-work rule's phone no-worse
  check is a separate later ticket (new P-id), after this one passes.
reps and order (as rev 2-3): per platform 6 reps per arm, two rotated Latin squares C V C2 / V C2 C / C2 C V, twice (18
  count loads per platform, one count load per rep, fresh profile or tab; plus the rep's shot loads, step 4). A rep is
  valid when the page reached m = 1, the pass and the rest windows ran to the end and the served hashes match the
  addendum; for Q1/Q2 it must also pass the m check in step 3 (S1). A verdict needs >= 5 valid reps per arm on that
  platform (per prediction, counting the reps valid for it); otherwise that platform's prediction is VOID (re-run once,
  then report).
per rep, in this order (steps 1-3 and 5 in the count load, step 4 in separate shot loads):
  1. load at the top, settle 2 s.
  2. pass (logger on): jump to half a viewport above the start of rev 7c's spacer (m = 0); scripted scroll 10 px per
     frame to the page end (m 0 -> 1); at rest, wait for the next roll start, then within 100 ms a scripted pull up of
     0.3 spacer heights at 10 px per frame, and stop; let the page's settle finish (open or closed, logged); logger off.
     The logger reads m (the panel's `--morph` as the page writes it), getAnimations() on the panel cells and the panel
     digit's position once per frame. Read point (ops note): the logger's rAF callback only posts a MessageChannel
     message, and the read runs in that message task, i.e. after all of the frame's rAF callbacks, their microtasks and
     the frame's rendering update. On the page-end path m is written by the scroll engine's rAF callback (`dE(L)`, JS
     14496 -> `L` -> `__msTick` -> `__navMorphSet`, 14410/14316) and on the tween path by the ZM tween's rAF (14326);
     the gate's Svelte effect flushes in a microtask after the write (F-205). So every read pairs the m that frame
     painted with the animations left running after it, for both paths, wherever the logger's own rAF sits in the
     callback order. A timer task (the tick) can run between the frame and the read; it does not write m, so the pair
     stays consistent. getAnimations() may flush style in that task; it runs in every arm alike and only in step 2.
     The pass drives the scroll path only (rev 7c's page end); the tween path (wheel at the pin) is covered by the gate
     reading `x`, not driven or scored here.
  3. scroll to the page end (instant), settle 32 s (int-v8's settle), read m once (S1), then the rest windows: 3
     consecutive 4 s windows, trace only (no in-page logger, no CDP Animation domain), then read m again. A rep's value
     = the median of its 3 windows. m check (S1): both reads exactly 1 (the page's own value, read by one evaluate
     outside the windows); otherwise the rep is invalid for Q1 and Q2, and is reported with its m values (a gate that
     never opened is then not scored as "no less work").
  4. shot loads (M1), separate from the count load, never inside the step 3 windows; per rep, same square position:
     (a) motion shot load: the frozen-clock shim of simpx.mjs (Simulator) / pixels.mjs (Chrome): virtual Date.now,
     performance.now and document.timeline.currentTime, and the countdown's rAF stepped by hand at 60 Hz, a tick landing
     at frame + FR/3, Web Animations started at the virtual change time; scroll to the page end (m = 1), step the
     virtual clock to the same instant in every arm, then the rest shot at a frame after the roll's end (V: each panel
     cell animation at or past its end shows its last keyframe = the inline rest place, as simpx/pixels do) and, in the
     Simulator, the mid-roll shot at a fixed virtual frame after the roll start (V paused at the matching currentTime,
     as simpx "paused"; the frame named in the addendum). (b) reduced-motion shot load: the same shim with
     prefers-reduced-motion emulated from load (pixels.mjs RM=1; the Simulator's reduced-motion setting as round 4),
     shot at the same virtual instant. Every arm's shots are at the same virtual time, so the clock digits match.
  5. descriptive only, after everything counted: one 4 s window with Animation trace events or the CDP Animation domain
     on, for the col-track animations (int-v8's "decisive local check" for the 60 level). Never scored.
A/A spread (as rev 2-3): spread = max over the valid pairs (same square position) of |C - C2|; a pair with C or C2
  invalid is dropped; fewer than 4 valid pairs voids that measure; a spread over 25 % of C's median makes that measure
  A/A-limited (to the lead). "less than C" = V median < C median - spread; "within C +/- spread" = |V median - C median|
  <= spread; "V <= C + A/A" = V median <= C median + spread.
new metric, page-end rest mainFrames/s (census rest-end): main frames (PrePaint) per second in the step 3 windows,
  counted as research/design-engineering/frame-audit/census.mjs counts them (same trace categories). Each frame is put
  in one of two classes: countdown frames and other frames. The countdown code = the roll unit `$E` and `cD`, JS
  4215-4559 on C; V's ranges in the addendum. The hero clock is held off-screen at the page end (countdown-faces), so
  countdown work there is the panel clock's plus the shared tick. Attribution rules (M4), applied to the trace alone:
  - a countdown rAF callback = one FireAnimationFrame event on the renderer main thread that contains (by ts and dur,
    as census.mjs's parentOf) at least one FunctionCall whose url is 2.DyWL8TcE.js and whose line lies in the countdown
    code; each such FireAnimationFrame counts once, however many FunctionCalls it holds;
  - a task = a top-level TimerFire, FireAnimationFrame, or other FunctionCall-carrying event on the renderer main
    thread; it belongs to the first PrePaint (main frame) that starts at or after the task's end, within the same
    window; a task with no later PrePaint in the window belongs to no frame and is reported as "unframed" per window;
  - a countdown frame = a main frame with at least one task that contains a FunctionCall in the countdown code; every
    other main frame is an other frame. A timer task (the tick) that runs between frames therefore marks the next
    frame, whatever else drives that frame.
predictions (rev 4; P1-P5 of revs 1-3 are superseded; each scored V vs C against the C/C2 A/A):
  Q1 (Chrome, scored) less script at the page-end rest: countdown rAF callbacks per 4 s window, V median <= 10 % of C
     median AND V median < C median - spread. C expected about 120-150 (reference above). Point V 4 per 4 s, 80 %
     [2, 12] (one roll-start rAF per roll, as on the hero: 8-9 per 8 s in T-096 step 2).
  Q2 (Chrome) page-end rest mainFrames/s:
     Q2a (scored) the spring/tick share goes: countdown frames/s V median <= 4 AND < C median - spread. C expected
         at most min(mainFrames/s, spring rAF/s + 1 tick/s), i.e. about 27-38/s (an expectation, not a rule: the spring
         runs 29-37 rAF/s, but several callbacks can share one frame). Point V 2/s, 80 % [1, 4] (the tick's frame and
         the roll start's frame).
     Q2b (scored, no-worse) other frames/s: no V load above the highest C or C2 load + 2/s (V adds no new level).
         There is no prediction of the level itself: the 27 vs 60 split is OBSERVED, cause unknown (int-v8: one build
         reads both levels; the panel's col-track transform animations running on the main thread are suspected,
         unchecked). Rev 4 claims nothing about it.
     Q2c (descriptive) total mainFrames/s per load with its level (low < 45, high >= 45), styleRecalc/s and paint/s
         next to it. Arithmetic, not a claim: "V removes the spring/tick share only" means, on loads of the same
         level, V total = C total - (C countdown frames - V countdown frames).
  Q3 (Chrome and Simulator, scored) the m-gate holds in the pass: 0 running panel-cell Web Animations in every logged
     frame with 0 < m < 1, in every valid rep; countdown rAF in the pass window (frames with 0 < m < 1: the scroll-in
     and the pull) within C +/- spread.
  Q4 (Simulator, scored) pass frames no worse: Paint records per pass frame (Timeline Paint records in the pass
     window / RenderingFrames in it) V <= C + A/A; layer count and backing at the pass's middle frame (M3): per square
     position V <= max(C, C2) for the layer count and for backing MB; if C and C2 differ in more than 2 of the valid
     pairs, the layer measure is A/A-limited and goes to the lead (not scored). Any V layer or backed cell beyond
     max(C, C2) is reported by name (F-201).
  Q5 (pixels; memory "Illusions must be pixel-identical": identical or T2, more or motion-only is a proposal), shots
     from the step 4 shot loads:
     Simulator: rest shot and reduced-motion shot exact (T0) vs C, A/A C vs C2 at 0 (round 4 was exact, 0 of 12); an
       A/A above 0 makes it A/A-limited (to the lead). Mid-roll shot within T2 (PR-010 wide numbers: fill 64, edge 128,
       0.5 %).
     Chrome (M2, the lead's 10-04 ruling in "Reduced motion, Chrome" above: a ±1 checkerboard on the panel's dark
       background around the digit cards shows in any arm, the A/A included; OBSERVED, cause unknown): rest and
       reduced-motion shots count as exact when, for V vs C and for C2 vs C alike: (i) no pixel differs outside the
       named mask M-bg = the panel's background inside the panel rect minus the digit-card rects (each card rect from
       getBoundingClientRect in the shot load, grown by 0 px; the mask built per shot and stored with it); (ii) no pixel
       inside M-bg differs by more than 1 in any channel; (iii) the number of V-vs-C shots with any M-bg difference is
       at most the number of C2-vs-C shots with one, + 2 (the 10-04 counts were 4 vs 2 of 533). Anything inside a card,
       on a glyph, in the hero or elsewhere on the page breaks T0. Chrome mid-roll is reported with the five numbers
       only (the hero showed edge 222, so a Chrome T2 miss is expected and goes to the user with the panel's
       motion-difference decision, not as a pass).
  Q6 (Chrome and Simulator, scored) hand-off: at every valid rep's pull (the first frame with m < 1 while a roll
     runs) the panel digit jumps <= 0.5 CSS px from the previous frame's path value (roll-probe extended to the panel
     selector). A rep whose pull met no running roll is invalid for Q6 only.
descriptive (never scored): Simulator rest windows (RenderingFrame, FireAnimationFrame, RecalculateStyles, Paint per
  4 s); the step 3 m reads per rep (the S1 rule makes them a validity check; their values are reported either way:
  if m is not exactly 1, the gate never opens there and V = C; the phone ticket reads m at rest first, since Safari's
  toolbar and a fractional scrollY can leave m just under 1; rev 7c already notes a 40 px closed-rest shift from the
  toolbar); unframed tasks per window (M4); backing at rest (F-201: +1 cell in 3 of 6
  censuses on the hero); the step 5 col-track read; dom-count and console errors (0 new).
calibration (exclusive first-miss outcomes in the order Q1..Q6; sum 1): all pass 0.40; Q1 0.05 (the hero already shows
  8-9 rAF per 8 s); Q2 0.12 (finish handlers or the cells' layering add countdown or other frames, or the other-frame
  level moves); Q3 0.13 (a roll started in the frame m leaves 1 escapes the gate); Q4 0.12 (cdwc repaint at the pass
  edges); Q5 0.10 (the code's own warning at JS 4286: layered panel cells rasterise glyphs differently; a cell kept
  layered at rest breaks T0); Q6 0.08 (the hand-off writes the target, not the current value).
outcome: all pass -> a D card and the user's decision (PR-017 covered the hero clock only: the panel needs a proposal
  rev or a new proposal with Try-it before any land), then the phone no-worse ticket. Q1 or Q2a miss -> dropped (no
  less work). Q2b miss -> stop, report to the lead and int-v8 (V moves a level nobody has explained). Q3 or Q4 miss ->
  fix the gate once, re-register (rev 5); a second miss parks the item. Q5 T0 miss -> stop, report to the lead. Q6 miss
  -> fix the hand-off once, re-register.
voids: served JS/CSS hash != addendum; BASELINE-<STATE> other than ok; A/A over the Q5 thresholds (A/A-limited, to the
  lead); countdown expiry 2026-11-02 05:00Z inside a run; a measurement-code change (verify.mjs, lib/cdp.mjs,
  serve.mjs) between rep 1 and the last rep.
tools (rev 2 R5, re-targeted; none written yet): scorer `fixes/cd-roll-ca/p097-score.mjs`; Chrome probe
  `p097-census.mjs` (steps 1-3 and 5; rest windows with census.mjs's trace categories and PrePaint/FunctionCall rules
  plus the M4 attribution rules); Simulator probe `p097-sim.mjs` (the same steps in a functional sim session, Timeline
  reader as "WebKit frames, layers and Timeline"); shot loads: pixels.mjs (Chrome) and simpx.mjs (Simulator) extended
  to the panel at the page end, with the M-bg mask; roll-probe extended to the panel; the PR-010 five-number compare. All committed, their sha256 and the served JS/CSS/delta hashes written into an addendum before
  rep 1; a change after that voids the reps before it.
order of work after the lead's word: rebase on main with v9-final; tell fix-nav-morph (cdwc) before the edit; build V
  on the landed v9-final; tools and addendum; ops pre-data read of the addendum; then the Chrome and Simulator reps.
```

### P-097 rev 4.2: Q2b′ and the total-frames gate, written after one smoke load per arm (2026-10-05)

```
TICKET P-097 rev 4.2 · supersedes rev 4.1 only where it says so (it adds; it edits nothing above) · lead's ruling
  2026-10-05 09:4xZ, (a) with ops' terms (mgmt-ops-10) · counts and pixels only, no timing, no phone
smoke disclosure (POST-SMOKE: Q2b′ and the gate below were written after these two loads were seen):
  before the addendum, one test-only Chrome census load per arm ran in a shared probe slot (chrome-measure, owner
  fix-cd-roll-ca-r4, shared, weight 1, 09:36:25-09:37:32Z, 67 s; locks/holds.log line 1645), `p097-census.mjs --arms
  V,C --settle 3000` (test flags: not a rep). Files, smoke-only, never scored: out/p097/smoke1.log,
  out/p097/census/rep0-C-2026-10-05T09-36-25-177Z.{json,trace.json.gz}, rep0-V-2026-10-05T09-36-25-177Z.{json,
  trace.json.gz} (worktree-agent-a912806c0aa208fd8). Seen, per s at the page-end rest (3 windows, M4 counting):
    C: main frames 28.0 / 29.7 / 28.0, countdown 27.0 / 28.7 / 27.0, other 1 / 1 / 1; countdown rAF 108-142 per 4 s.
    V: main frames 8.2 / 7.0 / 8.2, countdown 2.25 / 2 / 2.25, other 6 / 5 / 6; countdown rAF 4-5 per 4 s.
    Both: m '1' at both S1 reads; pass 158 mid rows, 0 running; V hand-off met, jump 0.0005 px.
  The V trace per 1 s tick: the tick frame (TimerFire, $E's tick at 4512, the roll-start rAF at 4332); 1 script-free
  frame (UpdateLayoutTree 14 + Paint); about 380 ms with no frame; 3 script-free frames 16.7 ms apart; the finish
  frame (onfinish at 4270, a countdown frame); 1 script-free frame (UpdateLayoutTree 10) after the cancel.
  Cause of the last-40-ms frames, CONFIRMED in source: Blink's DocumentTimeline::ScheduleNextService services the
  timeline on every frame once an animation's next effect change is less than kMinimumDelay = 0.04 s away
  (third_party/blink/renderer/core/animation/document_timeline.cc, chromium/chromium 6d70de1705fa, line 69
  `kMinimumDelay = 0.04` and lines 131-135 `if (next_effect_delay < kMinimumDelay) ScheduleServiceOnNextFrame()`).
  The start-commit frame and the post-cancel restyle are OBSERVED in our setup (trace only). Finding F-277. The same
  shape on v9's hero roll is OBSERVED-unchecked (int-v8 runs a counts-only check, the lead's approval).
  Functional check, also disclosed: after the classifier below was written and its self-test passed (09:47:44Z;
  rollClassify source text sha256 162cc869c642, function.toString(); it does not change after), it ran once on the
  two smoke traces: C roll 0, other′ 1 / 1
  / 1, leak 0, orphan 0; V roll 6 / 5 / 6, other′ 0 / 0 / 0, leak 0, orphan 0; its countdown counts equal M4's.
rev 4.1 predictions after the smoke (kept as registered; scored at the end with rev 4.1's M4 counting):
  Q1 unchanged, not touched by the smoke.
  Q2a unchanged and NOT missed at the smoke (V countdown frames 2-2.25/s against its 4/s limit; C 27-29). Q2a is scored
    with rev 4.1's M4 counting only: the roll-window classifier below applies to Q2b′ alone, so moving roll frames
    out of "other" can never push Q2a over its limit.
  Q2b unchanged and MISSED at the smoke (V other 5-6/s against C 1/s + 2), cause F-277. It is still scored at the end
    and expected out (p miss 0.95). Its registered outcome rule ("stop, report to the lead and int-v8") was carried
    out pre-data (lead, ops, int-v8 told 09:4xZ); the lead's ruling replaces the stop with Q2b′ and the gate.
  Q3, Q4, Q5, Q6 unchanged, their text above stands.
new (rev 4.2, post-smoke):
  Q2b′ (Chrome, scored, no-worse) other′ frames/s at the page-end rest: no V load above the highest C or C2 load
     + 2/s, where other′ = M4 frames - M4 countdown frames - roll frames (roll-window classifier, below). Same loads,
     windows and per-load value (median of the 3 windows) as Q2b. Point V 0/s, 80 % [0, 1.5]; C expected about 1/s
     with no roll frames (C's panel runs the spring, its hero is held: no roll start or finish calls at rest).
  roll-window classifier (frozen in p097-lib.mjs rollClassify(), self-test in p097-lib selftest(); sha256 in the
     addendum), from the Chrome trace alone, on the page renderer main thread (M4's pageMain):
     anchors, 1-based trace lineNumber in 2.DyWL8TcE.js, found by their exact text in each arm's served file and
     registered (the tool refuses another line, exit 3): S = `R0.F = requestAnimationFrame((t) => {` (one call per
     roll, the roll's start-frame callback), F = `Q.A[0].onfinish = () => Q === __crRoll && __crStop();` (one call per
     roll that runs to its end). C: S 4305, F 4264. V: S 4332, F 4270. Both inside the arm's M4 range.
     frames = PrePaint events, in time order from the p097-pass-end mark to the end of the last rest window (so a roll
     that started before w0 is seen from its start); a frame's tasks = M4's top-level tasks whose end lies after the
     previous PrePaint and at or before this one; a frame is countdown as in M4.
     state open = 0, after = false; per frame f, in order:
       (1) f holds a tick (a TimerFire task with a countdown-range FunctionCall) while open > 0: leak += 1, open = 0,
           after = false;
       (2) f is a roll frame when it is not an M4 countdown frame, has no task at all, and open > 0 or after;
       (3) open += the number of S calls in f's tasks; for each F call: open > 0 ? open -= 1 (matched) : orphan += 1;
       (4) after = f had a matched F call and open == 0.
     So the roll frames are the script-free frames from a roll's start frame to its finish frame, plus the one
     script-free frame after the finish frame; a frame with any task is never a roll frame; the finish frame stays an
     M4 countdown frame. Per window: countdown, roll and other′ frames per s. leak > 0 anywhere in the walk voids the
     load for Q2b′ (a roll that did not finish before the next tick would move frames that are not its own); orphans
     are reported. The classifier never changes Q2a's or Q2b's counts.
  G (Chrome, scored) total-frames gate, the less-work basis that needs no classification: page-end rest main frames/s
     (M4 page frames, all of them, per load = median of the 3 windows; loads valid for Q1/Q2 incl. the S1 m check),
     V median <= C median - spread (spread = the C/C2 A/A as for every count: max over valid same-position pairs of
     |C - C2|, >= 4 valid pairs, a spread over 25 % of C's median makes G A/A-limited, to the lead). Point V 7.5/s,
     80 % [6, 10]; C about 28-30 (or 60 on a high-level load).
calibration (rev 4.2; exclusive first-miss outcomes in the order Q1, Q2a, G, Q2b′, Q3, Q4, Q5, Q6; Q2b is scored
  apart and left out of this order: p miss 0.95; sum 1): all pass 0.42; Q1 0.04; Q2a 0.05; G 0.02; Q2b′ 0.07; Q3 0.12;
  Q4 0.11; Q5 0.10; Q6 0.07.
outcome (rev 4.2; replaces rev 4.1's outcome line where they differ): all of Q1, Q2a, G, Q2b′, Q3-Q6 pass -> a D card
  and the user's decision (PR-017 covered the hero only: a proposal rev or a new proposal with Try-it before any land),
  then the phone no-worse ticket; Q2b's miss is reported with F-277 next to it. Q1, Q2a or G miss -> dropped (no less
  work). Q2b′ miss -> stop, report to the lead and int-v8 (V moves frames outside its own rolls). Q3 or Q4 miss -> fix
  the gate once, re-register (rev 5); a second miss parks the item. Q5 T0 miss -> stop, report to the lead. Q6 miss ->
  fix the hand-off once, re-register.
unchanged: arms, reps, order, steps 1-5, voids, the A/A rule, Q3-Q6 text. Lesson (lead, ops): tool smokes run on B,
  never on the arms, before the addendum.
```

### P-097 rev 4.2 addendum: builds, tools and rules frozen before rep 1 (2026-10-05)

```
ADDENDUM P-097 rev 4.2 · fix-cd-roll-ca-r4 · written before rep 1; ops (mgmt-ops-10) reads it and PASSes before rep 1.
  Nothing below changes after rep 1 starts; any tool change after that goes to ops before a re-run (ops, 10-05).
builds (immutable snapshot copy out/p097/snap-5c203b483c18/, HASHES.txt there; every load checks the served bytes):
  C  = v9-final: JS 2.DyWL8TcE.js sha256 647c9ef2b1e2 (= fixes/v9-best/overlay on main 8b5ce9b3), CSS 2.gBuqKVzi.css
       e1359ab9994a. Baseline snapshot b1789284481295-4ad4a84a.
  V  = C + the panel gate: JS 5c203b483c18, CSS e1359ab9994a (unchanged). Delta on C: fixes/cd-roll-panel/patch.diff
       sha256 0a53abca21ff, committed in this commit (ops checks the committed blob).
  C2 = the C directory of the same snapshot on a second, separately started server (its own port, started per load like
       every arm); the A/A. A C2 load whose served bytes differ from C's pins is VOID like any arm.
tools (sha256 prefix of each committed file; p097-lib toolShas() records the same prefixes in every output, and the
  scorer voids a platform whose loads carry two different sets: the measurement-code constancy check):
  fixes/cd-roll-ca/p097-lib.mjs      1e483fb01076   (M4 attribute, rollClassify, logger, servers, shim, pixel rules)
  fixes/cd-roll-ca/p097-census.mjs   fbf15f2ac186   (Chrome count loads, steps 1-3 and 5)
  fixes/cd-roll-ca/p097-px.mjs       76f999a665bd   (Chrome shot loads, step 4, --rm)
  fixes/cd-roll-ca/p097-sim.mjs      3af767f9ea8e   (Simulator count / shot / rm loads)
  fixes/cd-roll-ca/p097-score.mjs    c4e9f50f26e3   (scorer; not in toolShas: it reads outputs, it makes none)
  fixes/cd-roll-ca/strip-read.mjs    efb513e9c56d   (the logger's digit read, imported by p097-lib)
  tools/serve.mjs 7aa33799ee3f, tools/lib/cdp.mjs f58d75d1179d, tools/lib/wip.mjs 3dcab04e362a, tools/sim.mjs
  a72d69199de7 (main 9f369b8a, unchanged on this branch); tools/lib/paths.mjs 9d75c8444edc (path lookup only).
  Simulator loads by session (each session's cap is 300 s and includes the boot): count loads one square position per
  session (--pos k; one load took 30 s with a 3 s settle, so about 60 s plus the pass with the 32 s settle); shot and
  rm loads all three positions of a rep in one session (about 20 s each).
C1 (lead's condition): the committed rollClassify (fixes/cd-roll-ca/p097-lib.mjs, `rollClassify.toString()`) hashes to
  sha256 162cc869c642, the value recorded when it was frozen (09:47:44Z, rev 4.2 block above). Check:
  node -e "import('./fixes/cd-roll-ca/p097-lib.mjs').then(m=>console.log(require('crypto').createHash('sha256').update(m.rollClassify.toString()).digest('hex').slice(0,12)))"
C2 (lead's condition, calibration): rev 4.2's calibration moved 0.01 each out of Q3 (0.13 -> 0.12), Q4 (0.12 -> 0.11)
  and Q6 (0.08 -> 0.07) after the smoke, into the new G (0.02) and Q2b′ (0.07) with Q1 0.05 -> 0.04 and the old Q2
  0.12 -> Q2a 0.05; all pass 0.40 -> 0.42. Both calibrations are kept (rev 4.1 above, rev 4.2 above) and ops scores
  them separately.
labels in the result (lead): Q2b′ and G are smoke-informed; the pre-smoke less-work claim is Q1.
base (lead's ruling via ops, 10-05 after PR-023 7d landed in 189ca7ed, v9-final JS now 1b2eecc66011, CSS unchanged):
  rev 4.2 runs as signed on C = 647c9ef2b1e2 (v9-final before 7d); no re-pin, the snapshot stays. The result claims
  that base only. Before any land request: the delta applies cleanly to 1b2eecc66011, passes node --check, and touches
  no 7d line (JS 14167-14290, byte-diff); an overlap needs a re-based card first.
  Done now (no data, scratch only): baseline site-pretty + main's fixes/morph-scroll-v9try/patch.diff = JS 1b2eecc66011
  (CSS e1359ab9994a); the delta 0a53abca21ff applies with `patch -p1` without rejects; node --check OK; result JS
  2cfd990c788d. Byte-diff 1b2eecc66011 -> +delta: changes at 4224a, 4267, 4285-4330, 4389a, 4421a, 4529a, 13850a,
  14645a only. 7d's own lines are 14170-14292 in that file; source: `diff` of C 647c9ef2b1e2 vs 1b2eecc66011, hunks
  14170c14170,14171 / 14221a14223 / 14258,14259c14260,14264 / 14282c14287 / 14285a14291,14292 (the ruling's 14167-14290
  is the same change with patch context; either range clears the nearest delta hunks 13850a and 14645a). Byte-diff V 5c203b483c18 -> 2cfd990c788d =
  exactly 7d's five hunks (14215, 14266a, 14303-14304, 14327, 14330a): the delta and 7d commute.
M4 ranges and anchors (1-based lines of 2.DyWL8TcE.js, checked by text in each arm's served file; a mismatch exits 3):
  countdown range C 4215-4559, V 4215-4598 ($E's first line .. the line before `function fD(`);
  roll anchors S (`R0.F = requestAnimationFrame((t) => {`) C 4305, V 4332; F (`Q.A[0].onfinish = () => Q === __crRoll
  && __crStop();`) C 4264, V 4270. Frozen-clock shim range (shot loads): `var UE = { stiffness` .. the line before
  `var lD = h(`: C 4041-4552 by text, V 4041-4591 (read from the file per load); stack lines read: Chrome 2-3, WebKit 1-3.
per-load m == 1 check and its VOID rule:
  count loads (Chrome census, Simulator count): m is read on the panel (its inline --morph, as the page writes it) once
    after the 32 s settle and once after the 3 rest windows (S1); both must read exactly '1', else the load is invalid
    for Q1, Q2a, Q2b, Q2b′ and G (still counted for Q3, Q4, Q6, which read the pass) and is reported with its m values.
  shot loads (Chrome px, Simulator shot / rm): m is read right before each shot; a shot whose m is not exactly '1' is
    VOID (Q5 counts only non-VOID shots); the load first waits up to 5 s for m == '1' after the scroll (rm: after
    window.__navMorphSet(1), the page's own writer, opens the panel in every arm alike).
selection and re-runs (scorer): per kind (census, px, px --rm, sim count, sim shot, sim rm), rep and arm, the first
  attempt without a tool fault (fatal or missing output) is the rep's load; one re-run allowed, later attempts ignored and
  listed. A tool fault in rep 1: VOID, re-run once, then report (ops). Validity per prediction is read from that one load,
  never picked per prediction. Test outputs (test: true; --b, --arms, --settle) and rep 0 are never read.
mid-roll frame: MID = 8 (frame 8 of 60 Hz after the tick at G + FR/3) in Chrome and the Simulator; rest shot at REST =
  90; settle at R0 = 3d 04h 12m 40s, change to R1 = ...39.
Simulator loads: one sim.mjs session (shared simulator slot, max 300 s) runs one or more square positions of one rep
  (--pos), in the rep's square order; the rm loads run in a session with --reduce-motion on.
M3 layer read: the Simulator pass holds at the first logged frame with m >= 0.5 (the logger's holdM), reads
  LayerTree.layersForNode for the panel clock's strips and cells, then resumes (every arm alike).
B smokes (ops 10-05: the plain baseline, site-pretty without overlay, test flag --b, shared slots, outputs marked test
  and never scored), all under owner fix-cd-roll-ca-r4, shared chrome-measure slots, locks/holds.log lines:
    1656  probe w1, 10:04:08-10:04:54Z, exit 0: census --b --settle 3000 (FATAL: logger "no panel timer", see fix 1),
          px --b, px --b --rm (shots taken and read back; VOID by the m rule, B's m reads '');
    1660  probe w1, 10:16:38-10:17:07Z, exit 1: census --b after fix 1 (ran to the end and wrote its file; then the
          summary print crashed, see fix 2);
    1662  simulator w3, 10:17:07-10:18:59Z, exit 0: sim --b --mode count --settle 3000 (pass skipped by fix 1, rest
          windows on the Timeline clock read);
    1669  probe w1, 10:37:09-10:37:42Z, exit 0: census --b --settle 3000 after fix 2 (rest windows, M4 attribution,
          rollClassify walk, step 5 all ran; exit 0);
    1673  simulator w3, 10:41:32-10:41:59Z, exit 0: sim --b --mode shot (shim, calibration marker, mid and rest crops);
    1677  simulator w3, 10:42:48-10:43:28Z, exit 0: sim --b --mode rm in a --reduce-motion on session.
  Files (worktree out/p097/, test: true, rep 0, never scored): census/rep0-B-2026-10-05T10-04-08-320Z, -10-16-38-919Z,
    -10-37-09-771Z (.json, .trace.json.gz); px/rep0-2026-10-05T10-04-17-124Z/, px/rep0-rm-2026-10-05T10-04-35-263Z/;
    sim/rep0-count-B-2026-10-05T10-18-23-485Z.json, sim/rep0-shot-B-2026-10-05T10-41-38-764Z*, sim/rep0-rm-B-2026-10-05T10-43-03-409Z*;
    logs smokeB-chrome.log, smokeB-2.log, smokeB-3.log. The scorer's readers ran on all of them (p097-score.mjs
    --b-smoke: every file parsed, every PNG read back; B's per-load values come out null since B has no fw-ms mode).
  Every tool's committed bytes above ran in at least one of these smokes (census after fix 2 in 1669; sim after fix 1
    in 1662/1673/1677; px and lib unchanged since 1656).
  B-only tool fixes (found by the smokes, before this commit; both change the --b path only, arm loads are unaffected):
    fix 1 (p097-census.mjs, p097-sim.mjs): when the logger returns anything but 'ok' the tool still throws (the load is
      FATAL) unless --b is given; with --b it records pass.skipped and goes on to the rest windows (census also sets the
      p097-pass-end mark, sim reads the layer tree once and stops the Timeline). For an arm the logger either returns
      'ok' and the pass runs exactly as before (same statements, now inside an else block), or the load is FATAL as
      before. The census analysis fills an empty log only when the pass left none, which only a --b load can do.
    fix 2 (p097-census.mjs): the summary print reads `res.pass.settledAt?.m`; settledAt is always set when the pass
      ran, so the printed text of an arm load is unchanged. Print only.
    Self-tests after both fixes: p097-lib selftest 20 ok, p097-score --selftest 31 ok (below); neither file's
    functions changed (rollClassify still 162cc869c642).
  Not exercised before rep 1 (B has no rev 7c spacer, no fw-ms mode, no panel --morph and no strip roll): the fw-ms
  pass with the logger, the m == 1 waits (B's m reads '' so its shots are VOID by the rule above), the panel roll
  (anchors, rollClassify on real roll frames: only its functional check on the smoke traces, disclosed above), the
  scorer's comparisons on arm data (its self-test only).
self-tests (outputs, at freeze):
  `node fixes/cd-roll-ca/p097-score.mjs --selftest` (runs p097-lib selftest() first) -> SELFTEST PASS 31:
  lib: two countdown calls in one rAF count once | page frames on the page main thread only | census rule counts every
  PrePaint | a tick between frames marks the next frame | a task with no later PrePaint in its window is unframed | line
  4560 (fD) is outside the countdown range | hand-off jump = |ty - path(t)| at the first m < 1 frame | mid rows: 0 < m < 1
  only | linear keyframe segment | cubic-bezier(1/3, 2Q/3, 2/3, 1/3+2Q/3) equals the build's quadratic segment | roll
  window: start commit, last-40-ms frames and the frame after the finish are roll; the finish frame is countdown; frames
  before and after are other | a script-carrying frame inside a roll window stays other | a roll not finished by the
  next tick is a leak and voids Q2b′ | no roll start (C's spring): no roll frames; a finish without a start is an orphan
  | PNG write/read round trip is exact | M-bg: a +-1 background pixel is allowed and counted | M-bg: any difference
  inside a digit card breaks T0 | M-bg: a background difference of 2 breaks T0 | five numbers: fill vs edge from A's 3x3
  span, beyond A/A, T2 wide limits | T0 exact.
  scorer: selection: first attempt without a tool fault, one re-run, later attempts ignored; test, rep 0 and B never
  scored | pins: C2 is checked against the C directory; one differing prefix voids | less: V < C - spread and V <= 10 %
  of C; spread = max |C - C2| over the pairs | less: V over 10 % of C misses | less with abs: V median over 4/s misses |
  fewer than 5 valid loads or 4 valid pairs: VOID | A/A spread over 25 % of C median: A/A-limited | within: |V - C| >
  spread misses | no-worse level: no V load above the highest C or C2 load + 2/s | per-load: median of 3 windows; the m
  check gates Q1/Q2/G only; a leak voids Q2b′ only | Q4 layers: V <= max(C, C2) per position, extra backed cells named;
  C/C2 differing in > 2 pairs: A/A-limited.
scorer rules not spelled out above (they follow the registered text): Q3 per platform = 0 running cells in the mid
  rows of every valid load of every arm AND countdown rAF in the mid segments within C +/- spread (Chrome
  passMidCountdownRaf, Simulator passMid.countdownRaf); Q3 needs both platforms. Q6 per platform over V's loads whose
  pull met a running roll (>= 5), max jump <= 0.5 CSS px; both platforms. Q5 Simulator mid T2 uses fiveNum with
  frameDevicePx = the Simulator screenshot's full pixel count (the shot's calibration screen) and dpr = its scale; Chrome
  mid uses 430 x 932 x 9 and dpr 3 (descriptive). A prediction's status is pass, MISS, VOID or AA-LIMITED; the outcome is
  the first MISS in the order Q1, Q2a, G, Q2b′, Q3, Q4, Q5, Q6 (Q2b apart); VOID or AA-LIMITED ones go to the lead.
measurement code: no change to verify.mjs, lib/cdp.mjs, serve.mjs or fix.mjs ab on this branch (rebased on main
  9f369b8a); the P-097 tools are topic-local (fixes/cd-roll-ca/), counts and pixels only, no timing.
```

### P-097 rev 4.2 result (2026-10-05 10:51-17:31Z; counts and pixels only, no timing; OBSERVED, in our setup)

Scored by `p097-score.mjs` (c4e9f50f26e3) exactly as registered; full output committed as
`fixes/cd-roll-ca/p097-score-final.json` (raw loads stay in the worktree's gitignored out/p097/: census/, px/, sim/,
logs reps-*.log). Base: pre-7d v9-final C 647c9ef2b1e2 only (lead's ruling); the result claims nothing about 7d or
v9.1d. 18 loads per kind per platform (6 reps x C, V, C2), every load served the pinned hashes, one tool set per
platform (no measurement-code change), no voids. Labels (lead): G and Q2b′ are smoke-informed; the pre-smoke less-work
claim is Q1.

Outcome under the registered first-miss order: **no MISS; Q1, Q3 and Q5 are A/A-limited (to the lead)**; Q2a, G, Q2b′,
Q4, Q6 pass; Q2b (scored apart) MISS as expected (F-277).

| Q | status | V | C | C2 | A/A spread (pairs) | rule |
|---|---|---|---|---|---|---|
| Q1 countdown rAF / 4 s (Chrome) | AA-LIMITED | 4 (all loads 3.99-4) | 107.4 (103.9-139.9) | 108.4 (103.5-133.9) | 31.0 (6) > 25 % of 107.4 | V <= 10 % of C and < C - spread |
| Q2a countdown frames/s | pass | 2 (all 2) | 26.4 | 27.0 | 1.0 (6) | V <= 4 and < C - spread |
| G total frames/s (smoke-informed) | pass | 6 (5.99-6.99) | 27.4 | 28.1 | 1.0 (6) | V < C - spread |
| Q2b′ other′ frames/s (smoke-informed) | pass | max 0 | max 1 | max 2.25 | - | no V load > 2.25 + 2 |
| Q2b other frames/s (apart) | MISS | 4-4.99 | 1 | 0.99-2.25 | - | no V load > 2.25 + 2 |
| Q3 gate: running cells at 0 < m < 1 | pass | 0 in 12/12 loads | 0 | 0 | - | 0 in every valid load, both platforms |
| Q3 pass countdown rAF, Chrome | AA-LIMITED | 91.5 | 81 | 97 (58-116) | 35 (6) > 20.3 | within C +/- spread |
| Q3 pass countdown rAF, Simulator | AA-LIMITED | 78.5 | 88 | 62 (55-102) | 44 (6) > 22 | within C +/- spread |
| Q4 Paint per pass frame (Simulator) | pass | 10.17 | 10.26 | 9.89 | 0.87 (6) | V <= C + spread |
| Q4 layers at the pass middle (M3) | pass | 0 layers, 0 MB (6/6) | 0 | 0 | C/C2 differ in 0 of 6 | V <= max(C, C2) |
| Q5 Simulator rest / reduced motion | pass | exact 6/6 + 6/6 | - | A/A exact 12/12 | - | T0 |
| Q5 Simulator mid-roll (frame 8) | pass | edge 92, fill 0, beyond 867 px = 0.024 %, 96 CSS px² (all 6 reps identical) | - | A/A 0 | - | T2 wide |
| Q5 Chrome rest | AA-LIMITED | (i) broken in 2/6 (rep 2, 5) | - | (i) broken in 1/6 (rep 5) | - | (i), (ii), (iii) for V and C2 alike |
| Q5 Chrome reduced motion | AA-LIMITED | (i) broken in 1/6 (rep 2) | - | (i) broken in 1/6 (rep 1) | - | as above |
| Q5 Chrome mid-roll (descriptive) | - | max channel diff 1 in 6/6, beyond A/A 0 | - | - | - | five numbers only |
| Q6 hand-off jump | pass | Chrome max 0.001 px (6/6 met), Simulator 0 (6/6) | - | - | - | <= 0.5 CSS px |

Q5 Chrome, the A/A break (OBSERVED, in our setup, cause unknown; scored as the card says, no new tolerance): every
differing pixel in every Chrome rest and reduced-motion compare differs by exactly 1 in a channel. The ones that break
(i) are always the same 10 device pixels inside the digit-card rects: the rounded bottom-left corners of card 1 (x 23-30)
and card 3 (x 599-606), device y 257-264 of the 1152 x 288 clip (pixels (23,257) (24,258) (26,260) (29,263) (30,264) and
the same at x + 576). The rest are background pixels on device row 10 (x 56, 344, 519, 632, 1095), inside M-bg at 1.
The pattern is the same in C2 vs C (rest rep 5, reduced-motion rep 1) and in V vs C (rest reps 2 and 5,
reduced-motion rep 2; both reduced-motion rep 2 attempts show it). (iii): V shots with any M-bg difference 6 vs C2 6
(rest), 4 vs 3 (reduced motion), within + 2.

Descriptive (never scored):
- Chrome page-end rest, every load at the low level (< 45/s): style recalcs/s V 6 vs C 27.4 / C2 28.1; paint
  events/s V 24 vs C 123 / C2 127; 0 unframed tasks, 0 console errors in every load; roll classifier leak 0, orphan 0
  in all 18 loads.
- Simulator page-end rest (WebKit Timeline, per s, medians): RenderingFrame V 59.95 / C 59.98 / C2 59.98 (the Simulator
  renders at 60 in every arm); FireAnimationFrame = countdown rAF V 1 / C 26.5 / C2 32.8; RecalculateStyles V 6.6 /
  C 26.5 / C2 26.7; Layout V 2.75 / C 26.5 / C2 26.7; Paint V 7.4 / C 26.7 / C2 26.7. m read '1' at both S1 reads in
  all 36 count loads.
- Q4 M3: the layer read found 0 layers for the panel clock's strips and cells in every arm at m ~ 0.507 (the gate
  keeps V on the spring there). That the read would see a layered panel cell was not checked positively (no arm has
  one at that frame).

Run log and disclosures:
- Platforms ran apart (lead 11:50Z, via ops): Chrome reps 1-6 10:51-15:08Z, Simulator reps 1-6 13:00-17:31Z, each in
  its own square order; no registered rule pairs a Chrome and a Simulator load of the same rep.
- Tool fault, VOID, re-run once: rep 2 Chrome reduced-motion C2 (12:53Z): the page logged "Failed to fetch dynamically
  imported module .../entry/start.DcMWjqAs.js", never hydrated (m null), the shot step threw. Re-run 15:08Z clean (C2
  used from it; C and V from the first attempt, by the selection rule).
- Runner aborts (mine, not tool faults; no load data lost or picked): my background runner hit the harness's 2 h cap
  three times. (a) 12:51Z: rep 1 Simulator count pos 1 timed out in the lock queue (lock.mjs run's 3600 s default)
  before it got a slot; re-queued. (b) 15:00Z: the Simulator session of rep 2 pos 3 (C) was killed after boot,
  before its load wrote anything; the session died without shutting fw-sim down (the 15:01-15:09Z Simulator leak,
  pid 45326), so my next 5 Simulator steps were refused before taking a slot ("already Booted") and wrote nothing.
  (c) a Chrome step queued at 13:32Z was killed before it got a slot. After (b) the runner never starts a step that
  could outlive its cap, waits for a running step on abort, and shuts down a leaked fw-sim after every Simulator step.
- Order deviation: rep 3's Simulator count positions ran 3 (V, 15:10Z), then 1 (C2), then 2 (C), because of (b).
- Host load was high during parts of the run (load1 up to ~117 during rep 1-2 Simulator loads); counts that follow
  frame cadence carry it (sim.mjs SIM_BACKGROUND lines in the logs). No timing is claimed.

Result read and rulings (2026-10-05/06): ops-reader-P097r CONFIRMED the result (re-ran the pinned scorer: deep-equal
output; pins, selection and the Q5 Chrome pattern checked in the PNGs). Lead's rulings on the three A/A-limited
questions, each kept labelled A/A-limited: Q1 PASS (V's highest load 4 is far below the lowest C/C2 load 103.5; both
conditions hold even at spread 31); Q3 PASS (the gate held in all 36 loads on both platforms; V's rAF distance from C is
inside 25 % of C); Q5 Chrome: no V-caused difference (the same 10 card-corner pixels at +-1 break equality in V and in
the A/A alike: T1, within A/A; the Simulator is exact in 24 of 24). Q4's layer half has no positive control (0 layers in
every arm). Tally 8 of 8 scored questions pass (Q2b apart, missed as expected). Landing stays blocked by the card's own
outcome rule and the illusion rule: the Simulator mid-roll difference (edge 92, 0.024 %) shows only in motion, so it
goes to the user as a proposal with Try-it (A = current v9-final 1b2eecc66011, B = it + the delta =
`fixes/cd-roll-panel-try/patch.diff`, JS 2cfd990c788d), then the phone no-worse ticket below.

### PHONE TICKET P-147: the panel clock roll on the iPhone, no-worse check (less-work rule; registered before any data)

```
PHONE TICKET P-147 · cd-roll-ca panel clock roll (P-097 rev 4.2 follow-up) · fix-cd-roll-ca-r4 · id reserved by
  mgmt-clerk-1 (2026-10-06) · memory "less-work-landing-rule": a less-work fix lands on counts plus one short phone
  no-worse check · second read: the lead's pre-data reader
status: REGISTERED, not started. Order (lead): after the user reconnects the phone, after v9.2's and P-145's phone
  blocks; only if the user accepts the proposal (PR-026). No timing claim beyond no-worse.
arms (ticketed builds, served from an immutable snapshot copy made before the first run, hashes in the copy's
  HASHES.txt and checked per served load):
  C = current v9-final (baseline + fixes/morph-scroll-v9try/patch.diff): JS 1b2eecc66011, CSS e1359ab9994a.
  V = C + the P-097 delta (fixes/cd-roll-panel-try/patch.diff 887240c913fb, baseline-relative): JS 2cfd990c788d,
  CSS e1359ab9994a. If the lead moves the base (e.g. v9.2) before the block, this ticket is re-registered on it first.
step 0, pre-read (uncounted, no data judged; within the phone hold): per arm, open the page, scroll to the end with the
  W driver (`iphone.mjs run --driver window --to <page end> --hold 2 --warmup`), then read the panel's --morph (the
  page's own value, the same read as P-097's S1) twice, 2 s apart, plus scrollY vs the page end. Rule: both reads exactly
  '1' on both arms -> go on; otherwise STOP and report to the lead (on the phone the gate never opens at rest, so V = C
  there and the less-work claim does not carry; e.g. Safari's toolbar leaving m just under 1).
block (protocol v2 §5; profile xcode-serious, the default: no heat pre-warm, no cooling wait; Low Power Mode off and
  recorded): driver W to the page end, hold 12 s at rest with the menu open (`iphone.mjs run --driver window --to <end>
  --hold 12 --probe std --block P-147 --arm C|V`); one uncounted warm-up per arm's port; 8 counted runs C V V C C V V
  C; Safari parked after the block; Timeline off (no attribution runs in this ticket); the heat sentinel per protocol
  (control runs C: bottom >= 58 fps and scroll >= 44 fps; a failing control voids the runs since the last passing one,
  then the block restarts once).
measures, per counted run, the 12 s hold window only:
  N1 (scored, no-worse) frames with dt > 50 ms: V median <= C median + 1, and twins dt > 46 / dt > 54 reported (a verdict
     that differs with a twin is "threshold-sensitive").
  N2 (scored, no-worse) frames with dt > 34 ms: V median <= C median + 2 (twins dt > 30 / > 38 reported).
  N3 (descriptive, the less-work direction) the probe's inline-style mutation count in the hold window, V vs C (expected
     V far below C: the spring writes every frame, the roll does not), and the m reads at the start and end of each run.
  Frames in the near bands (30, 38] / (46, 54] ms are flagged. Phone minShift 4 ms (protocol §5.3).
outcome: N1 and N2 pass -> the less-work landing rule is met (counts in Chrome and the Simulator from P-097 rev 4.2 +
  this check), subject to the user's decision on PR-026. N1 or N2 miss -> stop, report to the lead (no land). A VOID
  block (sentinel twice, a served-hash mismatch, a tool fault twice) -> report to the lead.
calibration: pre-read stops (m not '1' at rest on the phone) 0.15; N1/N2 pass 0.70; N1 or N2 miss 0.10; VOID 0.05.
tools: tools/iphone.mjs run (W driver, std probe) as on main at the block, its sha256 written into an addendum with
  the snapshot hashes before the first counted run; a scorer fixes/cd-roll-ca/p147-score.mjs written and self-tested
  before the first counted run (counts from the run records only), its sha256 in the same addendum.
```

## Risks, conflicts, follow-ups

- Not frame-identical while digits roll: Chrome mid-roll frames are beyond T2 (shade 222), and the path differs at
  120 Hz, at 80 Hz and after a late first frame (see above). The blind watch test was dropped (T-055 covers the
  countdown chain). Landing needs: the user's decision on the motion difference (proposal), the cost card, reduced
  motion exact, review round 5 and the P-093 phone no-worse check.
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
